/**
 * QUANTBET EV+ P0 — CANONICAL FIXTURE ENGINE
 * 
 * Genera identificadores unificados canónicos para evitar duplicación de eventos
 * provenientes de múltiples fuentes, feeds o nomenclaturas de ligas y equipos.
 */

export interface CanonicalFixtureParams {
  fixtureId?: string | number;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  date: string; // ISO date string or YYYY-MM-DD
  time?: string; // HH:mm
}

export interface CanonicalFixtureResult {
  canonicalId: string;
  normalizedHome: string;
  normalizedAway: string;
  normalizedCompetition: string;
  normalizedDate: string;
  rawFixtureId?: string;
}

/**
 * Normaliza nombres de clubes eliminando prefijos y sufijos comunes (FC, CF, Real, SC, etc.)
 */
export function normalizeTeamName(name: string): string {
  if (!name) return 'unknown';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/\b(fc|cf|sc|ac|afc|cd|rcd|bk|fk|sk|club|deportivo|atletico|real|sporting|inter|as)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Normaliza nombres de competiciones (EPL, Premier League, England Premier -> premier-league)
 */
export function normalizeCompetitionName(comp: string): string {
  if (!comp) return 'unknown-competition';
  const c = comp.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  if (c.includes('premier') || c.includes('epl')) return 'premier-league';
  if (c.includes('laliga') || c.includes('la liga') || c.includes('primera division de espana')) return 'laliga';
  if (c.includes('serie a') || c.includes('calcio')) return 'serie-a';
  if (c.includes('bundesliga')) return 'bundesliga';
  if (c.includes('ligapro') || c.includes('liga pro') || c.includes('ecuador')) return 'ligapro-ecuador';
  if (c.includes('champions') || c.includes('ucl')) return 'uefa-champions-league';
  if (c.includes('europa league') || c.includes('uel')) return 'uefa-europa-league';
  if (c.includes('libertadores')) return 'copa-libertadores';
  if (c.includes('sudamericana')) return 'copa-sudamericana';
  if (c.includes('ligue 1')) return 'ligue-1';
  if (c.includes('brasileirao') || c.includes('serie a brazil')) return 'brasileirao';

  return c.replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, '-');
}

/**
 * Genera el identificador canónico determinístico
 * Formato: can-[fecha]-[competicion]-[local]-vs-[visitante]
 */
export function generateCanonicalFixtureId(params: CanonicalFixtureParams): CanonicalFixtureResult {
  const normHome = normalizeTeamName(params.homeTeam);
  const normAway = normalizeTeamName(params.awayTeam);
  const normComp = normalizeCompetitionName(params.competition);

  let datePart = 'no-date';
  try {
    if (params.date) {
      datePart = params.date.split('T')[0];
    }
  } catch {
    datePart = 'no-date';
  }

  const canonicalId = `can_${datePart}_${normComp}_${normHome}_vs_${normAway}`;

  return {
    canonicalId,
    normalizedHome: normHome,
    normalizedAway: normAway,
    normalizedCompetition: normComp,
    normalizedDate: datePart,
    rawFixtureId: params.fixtureId ? String(params.fixtureId) : undefined,
  };
}

/**
 * Deduplica un listado de partidos consolidando diferentes fuentes bajo el mismo canonicalId
 */
export function deduplicateFixtures<T extends { homeTeam: string; awayTeam: string; league?: string; competition?: string; date: string }>(
  fixtures: T[]
): (T & { canonicalFixtureId: string })[] {
  const seen = new Set<string>();
  const result: (T & { canonicalFixtureId: string })[] = [];

  for (const f of fixtures) {
    const comp = f.league || f.competition || '';
    const canonical = generateCanonicalFixtureId({
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      competition: comp,
      date: f.date,
    });

    if (!seen.has(canonical.canonicalId)) {
      seen.add(canonical.canonicalId);
      result.push({
        ...f,
        canonicalFixtureId: canonical.canonicalId,
      });
    }
  }

  return result;
}
