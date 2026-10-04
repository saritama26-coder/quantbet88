/**
 * QUANTBET EV+ — PROVEEDORES ALTERNATIVOS DE DATOS REALES (servidor)
 *
 * - football-data.org (v4): partidos / calendario / marcador.
 *   Header: X-Auth-Token. Variable: FOOTBALL_DATA_API_KEY.
 * - The Odds API (v4): cuotas 1X2 (mercado h2h) por casa de apuestas.
 *   Query: apiKey. Variable: ODDS_API_KEY.
 *
 * Reglas:
 * - Solo datos reales. Nunca se inventan partidos ni cuotas.
 * - Las cuotas se cachean por liga para ahorrar créditos (plan gratuito: 500/mes).
 */
import fetch from 'node-fetch';
import { calculateImportanceScore } from './matchImportance';
import { generateCanonicalFixtureId } from './canonicalFixture';
import { calculateOpportunityScore } from './opportunityScore';
import type { RawBookmakerQuote } from './lineShopper';

export const APP_TZ = 'America/Guayaquil';

const FD_BASE = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
const ODDS_BASE = process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4';

const FD_CACHE_TTL_MS = 3 * 60 * 1000; // 3 min
const ODDS_CACHE_TTL_MS = Number(process.env.ODDS_CACHE_TTL_HOURS || 12) * 3600 * 1000;
const ODDS_MIN_CREDITS_RESERVE = 20;

export const getFootballDataKey = () => (process.env.FOOTBALL_DATA_API_KEY || '').trim();
export const getOddsApiKey = () => (process.env.ODDS_API_KEY || '').trim();

export let oddsCreditsRemaining: number | null = null;
export let oddsCreditsUsed: number | null = null;

// Competiciones football-data.org -> sport_key de The Odds API
const FD_TO_ODDS_SPORT: Record<string, string> = {
    PL: 'soccer_epl',
    ELC: 'soccer_efl_champ',
    PD: 'soccer_spain_la_liga',
    SA: 'soccer_italy_serie_a',
    BL1: 'soccer_germany_bundesliga',
    FL1: 'soccer_france_ligue_one',
    DED: 'soccer_netherlands_eredivisie',
    PPL: 'soccer_portugal_primeira_liga',
    BSA: 'soccer_brazil_campeonato',
    CL: 'soccer_uefa_champs_league',
    EC: 'soccer_uefa_european_championship',
    WC: 'soccer_fifa_world_cup',
};

// ---------------------------------------------------------------------------
// Utilidades de fecha
// ---------------------------------------------------------------------------
export const localDateOf = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: APP_TZ });

export const addDays = (ymd: string, n: number): string => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().split('T')[0];
};

// ---------------------------------------------------------------------------
// football-data.org
// ---------------------------------------------------------------------------
const fdCache = new Map<string, { ts: number; data: any[] }>();

export class ProviderError extends Error {
    constructor(public provider: string, public httpStatus: number, message: string, public details?: unknown) {
          super(message);
    }
}

/** Partidos entre dos fechas (inclusive, yyyy-MM-dd). */
export async function fetchFootballDataMatches(dateFrom: string, dateTo: string): Promise<any[]> {
    const key = getFootballDataKey();
    if (!key) throw new ProviderError('FOOTBALL_DATA', 503, 'FOOTBALL_DATA_API_KEY no configurada.');

  const cacheKey = `${dateFrom}|${dateTo}`;
    const cached = fdCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < FD_CACHE_TTL_MS) return cached.data;

  const url = `${FD_BASE}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const r = await fetch(url, {
          headers: { 'X-Auth-Token': key, Accept: 'application/json' },
          signal: AbortSignal.timeout(9000) as any,
    });
    const body: any = await r.json().catch(() => ({}));
    if (!r.ok) {
          throw new ProviderError(
                  'FOOTBALL_DATA',
                  r.status,
                  `football-data.org respondió HTTP ${r.status}${body?.message ? `: ${body.message}` : ''}`,
                  body
                );
    }
    const data = Array.isArray(body.matches) ? body.matches : [];
    fdCache.set(cacheKey, { ts: Date.now(), data });
    return data;
}

function normalizeFdStatus(s?: string): 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED' {
    switch ((s || '').toUpperCase()) {
      case 'IN_PLAY': return 'LIVE';
      case 'PAUSED': return 'HALFTIME';
      case 'FINISHED':
      case 'AWARDED': return 'FINISHED';
      case 'POSTPONED':
      case 'SUSPENDED': return 'POSTPONED';
      case 'CANCELLED': return 'CANCELLED';
      default: return 'SCHEDULED';
    }
}

const FD_STATUS_SHORT: Record<string, string> = {
    SCHEDULED: 'NS', TIMED: 'NS', IN_PLAY: 'LIVE', PAUSED: 'HT', FINISHED: 'FT',
    AWARDED: 'AWD', POSTPONED: 'PST', SUSPENDED: 'SUSP', CANCELLED: 'CANC',
};

/** Convierte un partido de football-data.org al formato RadarFixture de QuantBet. */
export function mapFootballDataMatch(m: any) {
    const competition = String(m.competition?.name || 'Liga Oficial');
    const country = String(m.area?.name || 'Internacional');
    const round = m.matchday ? `Jornada ${m.matchday}` : String(m.stage || 'Fase Regular');
    const homeTeam = String(m.homeTeam?.name || m.homeTeam?.shortName || 'Local');
    const awayTeam = String(m.awayTeam?.name || m.awayTeam?.shortName || 'Visitante');
    const date = String(m.utcDate);
    const fixtureId = Number(m.id);
    const status = normalizeFdStatus(m.status);

  const canonical = generateCanonicalFixtureId({ fixtureId, homeTeam, awayTeam, competition, date });
    const importance = calculateImportanceScore({ competition, country, round, homeTeam, awayTeam });
    const quality: 'LIVE' | 'MEDIA' = status === 'LIVE' ? 'LIVE' : 'MEDIA';
    const opportunity = calculateOpportunityScore({
          hasOdds: false,
          dataQuality: quality as any,
          hasXg: false,
          hasLineups: false,
          isLive: status === 'LIVE',
    });

  return {
        id: String(fixtureId),
        canonicalFixtureId: canonical.canonicalId,
        fixtureId,
        date,
        timestamp: Math.floor(new Date(date).getTime() / 1000),
        status,
        statusShort: FD_STATUS_SHORT[String(m.status || '').toUpperCase()] || 'NS',
        elapsed: null,
        leagueId: Number(m.competition?.id || 0),
        leagueCode: String(m.competition?.code || ''),
        league: competition,
        country,
        round,
        homeTeam,
        awayTeam,
        homeLogo: String(m.homeTeam?.crest || ''),
        awayLogo: String(m.awayTeam?.crest || ''),
        scoreHome: m.score?.fullTime?.home ?? null,
        scoreAway: m.score?.fullTime?.away ?? null,
        importanceScore: importance.importanceScore,
        tierLabel: importance.tierLabel,
        importanceBreakdown: importance.breakdown,
        detectedFlags: importance.detectedFlags,
        opportunityScore: opportunity.opportunityScore,
        opportunityVerdict: opportunity.verdict,
        opportunityBreakdown: opportunity.breakdown,
        opportunityExplanation: opportunity.explanation,
        hasEnoughData: true,
        hasOdds: false,
        dataQuality: quality,
        isDemo: false,
        dataMode: 'REAL',
        source: 'FOOTBALL_DATA_ORG',
  };
}

// ---------------------------------------------------------------------------
// The Odds API
// ---------------------------------------------------------------------------
const oddsCache = new Map<string, { ts: number; events: any[] }>();
/** fixtureId (football-data) -> evento de The Odds API emparejado */
const fixtureOddsIndex = new Map<string, any>();

async function fetchOddsForSport(sportKey: string): Promise<any[]> {
    const key = getOddsApiKey();
    if (!key) return [];
    const cached = oddsCache.get(sportKey);
    if (cached && Date.now() - cached.ts < ODDS_CACHE_TTL_MS) return cached.events;
    if (oddsCreditsRemaining !== null && oddsCreditsRemaining < ODDS_MIN_CREDITS_RESERVE) {
          return cached?.events || [];
    }
    const url = `${ODDS_BASE}/sports/${sportKey}/odds?apiKey=${encodeURIComponent(key)}&regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
    try {
          const r = await fetch(url, { signal: AbortSignal.timeout(9000) as any });
          const rem = r.headers.get('x-requests-remaining');
          const used = r.headers.get('x-requests-used');
          if (rem !== null && Number.isFinite(Number(rem))) oddsCreditsRemaining = Number(rem);
          if (used !== null && Number.isFinite(Number(used))) oddsCreditsUsed = Number(used);
          if (!r.ok) {
                  console.warn(`The Odds API HTTP ${r.status} para ${sportKey}`);
                  return cached?.events || [];
          }
          const events = (await r.json()) as any[];
          const list = Array.isArray(events) ? events : [];
          oddsCache.set(sportKey, { ts: Date.now(), events: list });
          return list;
    } catch (e: any) {
          console.warn(`The Odds API error (${sportKey}):`, e?.message || e);
          return cached?.events || [];
    }
}

const STOP_TOKENS = new Set([
    'fc', 'cf', 'afc', 'ac', 'sc', 'ssc', 'as', 'rc', 'cd', 'ud', 'sd', 'sv', 'vfl', 'vfb', 'tsg', 'fk', 'sk',
    'club', 'de', 'del', 'la', 'the', 'and', 'calcio', 'futbol', 'football', '1', '1.', 'cp', 'sl', 'ec', 'se', 'cr',
  ]);

function teamTokens(name: string): string[] {
    return name
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !STOP_TOKENS.has(t));
}

function teamsMatch(a: string, b: string): boolean {
    const ta = teamTokens(a);
    const tb = teamTokens(b);
    if (!ta.length || !tb.length) return false;
    const ja = ta.join(' ');
    const jb = tb.join(' ');
    if (ja === jb || ja.includes(jb) || jb.includes(ja)) return true;
    const setB = new Set(tb);
    const common = ta.filter((t) => setB.has(t) && t.length >= 4);
    return common.length > 0;
}

function quotesFromEvent(event: any): RawBookmakerQuote[] {
    const quotes: RawBookmakerQuote[] = [];
    for (const bm of event?.bookmakers || []) {
          const h2h = (bm.markets || []).find((mk: any) => mk.key === 'h2h');
          if (!h2h) continue;
          for (const o of h2h.outcomes || []) {
                  let selection = '';
                  if (o.name === event.home_team) selection = 'Local';
                  else if (o.name === event.away_team) selection = 'Visitante';
                  else if (String(o.name).toLowerCase() === 'draw') selection = 'Empate';
                  if (!selection) continue;
                  quotes.push({
                            bookmaker: String(bm.title || bm.key),
                            market: '1X2',
                            selection,
                            odds: Number(o.price) || 0,
                            timestamp: String(bm.last_update || h2h.last_update || new Date().toISOString()),
                            source: `THE_ODDS_API_${String(bm.key || '').toUpperCase()}`,
                  });
          }
    }
    return quotes;
}

/**
 * Añade cuotas 1X2 reales (mejor cuota por selección) a los partidos de football-data.org
 * cuya liga esté cubierta por The Odds API. Partidos sin emparejar quedan con hasOdds=false.
 */
export async function attachOddsToFixtures(fixtures: any[]): Promise<any[]> {
    if (!getOddsApiKey() || fixtures.length === 0) return fixtures;

  const sports = new Set<string>();
    for (const f of fixtures) {
          const sk = FD_TO_ODDS_SPORT[f.leagueCode];
          if (sk && f.status === 'SCHEDULED') sports.add(sk);
    }
    const eventsBySport = new Map<string, any[]>();
    await Promise.all([...sports].map(async (sk) => eventsBySport.set(sk, await fetchOddsForSport(sk))));

  return fixtures.map((f) => {
        const sk = FD_TO_ODDS_SPORT[f.leagueCode];
        const events = sk ? eventsBySport.get(sk) || [] : [];
        const kickoff = new Date(f.date).getTime();
        const ev = events.find(
                (e) =>
                          Math.abs(new Date(e.commence_time).getTime() - kickoff) <= 3 * 3600 * 1000 &&
                          teamsMatch(f.homeTeam, e.home_team) &&
                          teamsMatch(f.awayTeam, e.away_team)
              );
        if (!ev) return f;

                          const quotes = quotesFromEvent(ev);
        const best = (sel: string) =>
                quotes.filter((q) => q.selection === sel).reduce((mx, q) => Math.max(mx, q.odds), 0);
        const home = best('Local');
        const draw = best('Empate');
        const away = best('Visitante');
        if (!(home > 1 && draw > 1 && away > 1)) return f;

                          fixtureOddsIndex.set(String(f.fixtureId), ev);

                          // Margen mínimo entre casas que ofrecen las tres selecciones
                          const byBook = new Map<string, Record<string, number>>();
        for (const q of quotes) {
                const b = byBook.get(q.bookmaker) || {};
                b[q.selection] = q.odds;
                byBook.set(q.bookmaker, b);
        }
        let minMargin: number | undefined;
        for (const b of byBook.values()) {
                if (b.Local && b.Empate && b.Visitante) {
                          const m = (1 / b.Local + 1 / b.Empate + 1 / b.Visitante - 1) * 100;
                          minMargin = minMargin === undefined ? m : Math.min(minMargin, m);
                }
        }

                          const opportunity = calculateOpportunityScore({
                                  hasOdds: true,
                                  oddsCount: byBook.size,
                                  bookmakerMarginPercent: minMargin !== undefined ? Math.round(minMargin * 100) / 100 : undefined,
                                  dataQuality: f.dataQuality as any,
                                  hasXg: false,
                                  hasLineups: false,
                                  isLive: f.status === 'LIVE',
                          });

                          return {
                                  ...f,
                                  hasOdds: true,
                                  odds: { home, draw, away },
                                  oddsBookmakersCount: byBook.size,
                                  oddsSource: 'THE_ODDS_API',
                                  opportunityScore: opportunity.opportunityScore,
                                  opportunityVerdict: opportunity.verdict,
                                  opportunityBreakdown: opportunity.breakdown,
                                  opportunityExplanation: opportunity.explanation,
                          };
  });
}

/** Cotizaciones por casa para el Line Shopper (solo si el partido ya fue emparejado). */
export function getCachedQuotesForFixture(fixtureId: string): RawBookmakerQuote[] {
    const ev = fixtureOddsIndex.get(String(fixtureId));
    return ev ? quotesFromEvent(ev) : [];
}

/** Partidos REAL de un día local (Guayaquil), con cuotas si hay ODDS_API_KEY. */
export async function getRealFixturesForLocalDay(day: string): Promise<any[]> {
    // football-data filtra por fecha UTC: se pide día y día+1 y se filtra por fecha local.
  const raw = await fetchFootballDataMatches(day, addDays(day, 1));
    const mapped = raw.filter((m) => m?.id && m?.utcDate && localDateOf(m.utcDate) === day).map(mapFootballDataMatch);
    return attachOddsToFixtures(mapped);
}

/** Partidos REAL para un rango de días locales, agrupados por día. */
export async function getRealFixturesForLocalDays(days: string[]): Promise<Record<string, any[]>> {
    const sorted = [...days].sort();
    const raw = await fetchFootballDataMatches(sorted[0], addDays(sorted[sorted.length - 1], 1));
    const mapped = await attachOddsToFixtures(
          raw.filter((m) => m?.id && m?.utcDate && days.includes(localDateOf(m.utcDate))).map(mapFootballDataMatch)
        );
    const out: Record<string, any[]> = {};
    for (const d of days) out[d] = mapped.filter((f) => localDateOf(f.date) === d);
    return out;
}
