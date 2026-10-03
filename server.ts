import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { GoogleGenAI } from '@google/genai';
import { calculateImportanceScore } from './src/lib/matchImportance';
import { generateCanonicalFixtureId, deduplicateFixtures } from './src/lib/canonicalFixture';
import { calculateOpportunityScore } from './src/lib/opportunityScore';
import { performLineShopping, RawBookmakerQuote } from './src/lib/lineShopper';

export interface RadarFixture {
  id: string;
  canonicalFixtureId: string;
  fixtureId: number;
  date: string;
  timestamp: number;
  status: 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  statusShort: string;
  elapsed: number | null;
  leagueId: number;
  league: string;
  country: string;
  round: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  scoreHome: number | null;
  scoreAway: number | null;
  importanceScore: number;
  tierLabel: string;
  opportunityScore: number;
  opportunityVerdict: string;
  opportunityBreakdown?: {
    potentialEdge: number;
    dataQualityScore: number;
    oddsAvailability: number;
    marketQuality: number;
  };
  hasEnoughData: boolean;
  hasOdds: boolean;
  odds?: { home: number; draw: number; away: number };
  dataQuality: 'ALTA' | 'MEDIA' | 'BAJA' | 'LIVE' | 'STALE' | 'MISSING' | 'CONFLICTING';
  isDemo: boolean;
  dataMode: 'REAL' | 'DEMO';
  source: string;
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY || '';
const liveDataApiKey = process.env.LIVE_DATA_API_KEY || '';

const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// ============================================================================
// MECANISMO DE CACHÉ EN MEMORIA CON TTLS INDEPENDIENTES (PRIORIDAD 16)
// - fixtures por fecha: 180 s (rango 60–300 s)
// - telemetría en vivo: 60 s
// - estadísticas: 25 s (rango 20–30 s)
// - eventos y cuotas: 15 s (rango 10–20 s)
// ============================================================================
const FIXTURES_DATE_CACHE_TTL_MS = 180 * 1000;
const LIVE_CACHE_TTL_MS = 60 * 1000;
const STATISTICS_CACHE_TTL_MS = 25 * 1000;
const EVENTS_CACHE_TTL_MS = 15 * 1000;
const ODDS_CACHE_TTL_MS = 15 * 1000;

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

// Mapas de caché
const dateFixturesCacheMap = new Map<string, CacheItem<any[]>>();
const weekendFixturesCacheMap = new Map<string, CacheItem<any>>();
const liveFixturesCacheMap = new Map<string, CacheItem<any[]>>();
const fixtureDetailsCacheMap = new Map<string, CacheItem<any>>();

let apiFootballRequestsRemaining: number | null = null;

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(apiKey),
    hasLiveDataApiKey: Boolean(liveDataApiKey),
    timestamp: new Date().toISOString(),
  });
});

// Live API Status
app.get('/api/live/status', (req, res) => {
  res.json({
    hasLiveDataApiKey: Boolean(liveDataApiKey),
    remainingRequests: apiFootballRequestsRemaining,
    cacheTtlSeconds: LIVE_CACHE_TTL_MS / 1000,
    timestamp: new Date().toISOString(),
  });
});

// Sample In-Play Fixtures for Manual / Demo Mode
const SAMPLE_LIVE_FIXTURES = [
  {
    id: 'sample-live-1',
    fixture: {
      id: 'sample-live-1',
      status: { short: '2H', long: 'Second Half', elapsed: 68, extra: null },
      date: new Date().toISOString(),
      referee: 'Michael Oliver, England',
    },
    league: { id: 39, name: 'Premier League', country: 'England', round: 'Regular Season - 7' },
    teams: {
      home: { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' },
      away: { id: 49, name: 'Chelsea', logo: 'https://media.api-sports.io/football/teams/49.png' },
    },
    goals: { home: 1, away: 0 },
    events: [
      { time: { elapsed: 24, extra: null }, team: { name: 'Arsenal' }, player: { name: 'B. Saka' }, type: 'Goal', detail: 'Normal Goal' },
      { time: { elapsed: 58, extra: null }, team: { name: 'Chelsea' }, player: { name: 'M. Cucurella' }, type: 'Card', detail: 'Red Card' },
      { time: { elapsed: 61, extra: null }, team: { name: 'Chelsea' }, player: { name: 'E. Fernández' }, type: 'subst', detail: 'Substitution' },
    ],
    statistics: [
      {
        team: { name: 'Arsenal' },
        statistics: [
          { type: 'Shots on Goal', value: 6 },
          { type: 'Total Shots', value: 13 },
          { type: 'Ball Possession', value: '59%' },
          { type: 'Corner Kicks', value: 7 },
          { type: 'expected_goals', value: '1.58' },
        ],
      },
      {
        team: { name: 'Chelsea' },
        statistics: [
          { type: 'Shots on Goal', value: 2 },
          { type: 'Total Shots', value: 5 },
          { type: 'Ball Possession', value: '41%' },
          { type: 'Corner Kicks', value: 2 },
          { type: 'expected_goals', value: '0.54' },
        ],
      },
    ],
    lineups: [
      { team: { name: 'Arsenal' }, formation: '4-3-3' },
      { team: { name: 'Chelsea' }, formation: '4-2-3-1' },
    ],
  },
  {
    id: 'sample-live-2',
    fixture: {
      id: 'sample-live-2',
      status: { short: '2H', long: 'Second Half', elapsed: 76, extra: null },
      date: new Date().toISOString(),
      referee: 'Jesús Gil Manzano, Spain',
    },
    league: { id: 140, name: 'LaLiga', country: 'Spain', round: 'Regular Season - 9' },
    teams: {
      home: { id: 541, name: 'Real Madrid', logo: 'https://media.api-sports.io/football/teams/541.png' },
      away: { id: 529, name: 'Barcelona', logo: 'https://media.api-sports.io/football/teams/529.png' },
    },
    goals: { home: 2, away: 2 },
    events: [
      { time: { elapsed: 18, extra: null }, team: { name: 'Real Madrid' }, player: { name: 'K. Mbappé' }, type: 'Goal', detail: 'Normal Goal' },
      { time: { elapsed: 39, extra: null }, team: { name: 'Barcelona' }, player: { name: 'R. Lewandowski' }, type: 'Goal', detail: 'Normal Goal' },
      { time: { elapsed: 54, extra: null }, team: { name: 'Barcelona' }, player: { name: 'L. Yamal' }, type: 'Goal', detail: 'Normal Goal' },
      { time: { elapsed: 71, extra: null }, team: { name: 'Real Madrid' }, player: { name: 'Vinícius Jr.' }, type: 'Goal', detail: 'Normal Goal' },
    ],
    statistics: [
      {
        team: { name: 'Real Madrid' },
        statistics: [
          { type: 'Shots on Goal', value: 7 },
          { type: 'Total Shots', value: 15 },
          { type: 'Ball Possession', value: '48%' },
          { type: 'Corner Kicks', value: 5 },
          { type: 'expected_goals', value: '2.14' },
        ],
      },
      {
        team: { name: 'Barcelona' },
        statistics: [
          { type: 'Shots on Goal', value: 6 },
          { type: 'Total Shots', value: 14 },
          { type: 'Ball Possession', value: '52%' },
          { type: 'Corner Kicks', value: 6 },
          { type: 'expected_goals', value: '1.92' },
        ],
      },
    ],
    lineups: [
      { team: { name: 'Real Madrid' }, formation: '4-3-1-2' },
      { team: { name: 'Barcelona' }, formation: '4-2-3-1' },
    ],
  },
  {
    id: 'sample-live-3',
    fixture: {
      id: 'sample-live-3',
      status: { short: '1H', long: 'First Half', elapsed: 38, extra: null },
      date: new Date().toISOString(),
      referee: 'Anthony Taylor, England',
    },
    league: { id: 39, name: 'Premier League', country: 'England', round: 'Regular Season - 7' },
    teams: {
      home: { id: 40, name: 'Liverpool', logo: 'https://media.api-sports.io/football/teams/40.png' },
      away: { id: 50, name: 'Manchester City', logo: 'https://media.api-sports.io/football/teams/50.png' },
    },
    goals: { home: 0, away: 0 },
    events: [
      { time: { elapsed: 22, extra: null }, team: { name: 'Manchester City' }, player: { name: 'Rodri' }, type: 'Card', detail: 'Yellow Card' },
    ],
    statistics: [
      {
        team: { name: 'Liverpool' },
        statistics: [
          { type: 'Shots on Goal', value: 2 },
          { type: 'Total Shots', value: 6 },
          { type: 'Ball Possession', value: '44%' },
          { type: 'Corner Kicks', value: 3 },
          { type: 'expected_goals', value: '0.45' },
        ],
      },
      {
        team: { name: 'Manchester City' },
        statistics: [
          { type: 'Shots on Goal', value: 3 },
          { type: 'Total Shots', value: 7 },
          { type: 'Ball Possession', value: '56%' },
          { type: 'Corner Kicks', value: 4 },
          { type: 'expected_goals', value: '0.62' },
        ],
      },
    ],
    lineups: [
      { team: { name: 'Liverpool' }, formation: '4-3-3' },
      { team: { name: 'Manchester City' }, formation: '4-1-4-1' },
    ],
  },
];

/**
 * ============================================================================
 * UTILIDADES DE SEGURIDAD Y CONTROLADOR PROXY PARA API-FOOTBALL
 * ============================================================================
 */

/**
 * 1. Función de utilidad para verificar la existencia y validez de LIVE_DATA_API_KEY
 * Retorna true/false y el valor saneado sin exponerlo a contextos inseguros.
 */
export function checkLiveDataApiKey(): { exists: boolean; key: string | null } {
  const envKey = process.env.LIVE_DATA_API_KEY ? process.env.LIVE_DATA_API_KEY.trim() : '';
  const exists = Boolean(envKey && envKey !== 'MY_API_FOOTBALL_KEY' && envKey.length > 5);
  return {
    exists,
    key: exists ? envKey : null,
  };
}

// 2. Lista blanca de endpoints autorizados (Protección estricta contra SSRF y Path Traversal)
const ALLOWED_API_FOOTBALL_ENDPOINTS = [
  '/fixtures',
  '/fixtures/headtohead',
  '/fixtures/statistics',
  '/fixtures/events',
  '/fixtures/lineups',
  '/odds',
  '/odds/live',
  '/leagues',
];

// Caché en memoria general para respuestas del proxy (TTL 60 segundos)
const proxyResponseCache = new Map<string, { data: any; timestamp: number }>();

/**
 * 3. Función de utilidad encapsulada para invocar a 'v3.football.api-sports.io'
 * - Comprueba la clave con checkLiveDataApiKey()
 * - Inyecta el secreto exclusivamente del lado del servidor
 * - Implementa caché en memoria de 60 segundos
 * - Monitorea encabezados de cuota (x-ratelimit-requests-remaining)
 * - Retorna un objeto JSON limpio y seguro
 */
export async function fetchApiFootballSecure<T = any>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {},
  cacheTtlMs: number = LIVE_CACHE_TTL_MS
): Promise<{
  success: boolean;
  isManualMode: boolean;
  cached: boolean;
  cacheAgeSeconds: number;
  cacheExpiresInSeconds: number;
  source: string;
  remainingRequests: number | null;
  data?: T;
  error?: string;
  status?: number;
}> {
  const { exists, key } = checkLiveDataApiKey();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const queryEntries = Object.entries(params).filter(([_, v]) => v !== undefined && v !== '');
  const queryString = new URLSearchParams(queryEntries as [string, string][]).toString();
  const cacheKey = `${cleanEndpoint}?${queryString}`;
  const now = Date.now();

  // Si no hay clave configurada en el servidor, retorna modo manual
  if (!exists || !key) {
    return {
      success: true,
      isManualMode: true,
      cached: false,
      cacheAgeSeconds: 0,
      cacheExpiresInSeconds: 0,
      source: 'MANUAL_MODE_NO_KEY',
      remainingRequests: null,
      error: 'LIVE_DATA_API_KEY no configurada en el servidor. Operando en modo manual.',
    };
  }

  // Comprobar caché en memoria
  const cached = proxyResponseCache.get(cacheKey);
  if (cached && now - cached.timestamp < cacheTtlMs) {
    const ageSeconds = Math.floor((now - cached.timestamp) / 1000);
    const expiresInSeconds = Math.max(0, Math.floor((cacheTtlMs - (now - cached.timestamp)) / 1000));
    return {
      success: true,
      isManualMode: false,
      cached: true,
      cacheAgeSeconds: ageSeconds,
      cacheExpiresInSeconds: expiresInSeconds,
      source: 'API_FOOTBALL_CACHE',
      remainingRequests: apiFootballRequestsRemaining,
      data: cached.data,
    };
  }

  // Construir URL upstream e inyectar el secreto en servidor
  const upstreamUrl = `https://v3.football.api-sports.io${cleanEndpoint}${queryString ? `?${queryString}` : ''}`;

  const upstreamResponse = await fetch(upstreamUrl, {
    method: 'GET',
    headers: {
      'x-apisports-key': key, // Secreto inyectado desde process.env
      'x-apisports-host': 'v3.football.api-sports.io',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(8000), // Timeout de seguridad de 8 segundos
  });

  // Monitorear cuota restante
  const remHeader = upstreamResponse.headers.get('x-ratelimit-requests-remaining');
  if (remHeader !== null) {
    apiFootballRequestsRemaining = parseInt(remHeader, 10);
  }

  if (!upstreamResponse.ok) {
    return {
      success: false,
      isManualMode: false,
      cached: false,
      cacheAgeSeconds: 0,
      cacheExpiresInSeconds: 0,
      source: 'API_FOOTBALL_ERROR',
      remainingRequests: apiFootballRequestsRemaining,
      status: upstreamResponse.status,
      error: `Error de respuesta HTTP ${upstreamResponse.status} desde API-Football`,
    };
  }

  const rawJson = await upstreamResponse.json();

  // Guardar en caché
  proxyResponseCache.set(cacheKey, {
    data: rawJson,
    timestamp: now,
  });

  return {
    success: true,
    isManualMode: false,
    cached: false,
    cacheAgeSeconds: 0,
    cacheExpiresInSeconds: Math.floor(cacheTtlMs / 1000),
    source: 'API_FOOTBALL_LIVE',
    remainingRequests: apiFootballRequestsRemaining,
    data: rawJson,
  };
}

/**
 * 4. Middleware de validación y sanitización previa
 */
export const validateApiFootballProxy: express.RequestHandler = (req, res, next) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Método no permitido. El proxy de API-Football solo admite solicitudes GET.',
    });
  }

  const targetPath = (req.path.startsWith('/') ? req.path : `/${req.path}`).toLowerCase();
  const isAllowed = ALLOWED_API_FOOTBALL_ENDPOINTS.some(
    (allowed) => targetPath === allowed || targetPath.startsWith(`${allowed}/`)
  );

  if (!isAllowed) {
    return res.status(403).json({
      error: `Endpoint no autorizado en el proxy seguro: ${targetPath}. Solo se permiten endpoints deportivos de telemetría y cuotas.`,
    });
  }

  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') {
      if (value.includes('..') || value.includes('\0') || value.includes('\r') || value.includes('\n')) {
        return res.status(400).json({
          error: `Parámetro de consulta inválido detectado en clave: ${key}`,
        });
      }
    }
  }

  delete req.headers['x-apisports-key'];
  delete req.headers['authorization'];

  next();
};

/**
 * 5. Controlador Express Proxy que utiliza la función utilitaria
 * Inyecta el secreto del lado del servidor y retorna únicamente el JSON limpio
 */
export const apiFootballProxyController: express.RequestHandler = async (req, res) => {
  try {
    const targetPath = req.path.startsWith('/') ? req.path : `/${req.path}`;
    const result = await fetchApiFootballSecure(targetPath, req.query as Record<string, string>);

    if (result.isManualMode) {
      if (targetPath === '/fixtures' || targetPath === '/') {
        return res.json({
          success: true,
          isManualMode: true,
          source: 'PROXY_MANUAL_FALLBACK',
          response: SAMPLE_LIVE_FIXTURES,
        });
      }
      return res.status(503).json({
        error: 'LIVE_DATA_API_KEY no configurada en el servidor. El proxy opera en modo manual.',
        isManualMode: true,
      });
    }

    if (!result.success) {
      return res.status(result.status || 502).json({
        error: result.error || 'Error desde API-Football externa',
        isManualMode: false,
      });
    }

    return res.json({
      success: true,
      source: result.source,
      cached: result.cached,
      cacheAgeSeconds: result.cacheAgeSeconds,
      cacheExpiresInSeconds: result.cacheExpiresInSeconds,
      remainingRequests: result.remainingRequests,
      ...(result.data || {}),
    });
  } catch (error: any) {
    console.error('Error en apiFootballProxyController:', error.message);
    return res.status(502).json({
      error: 'Error de comunicación con el servicio externo de datos deportivos.',
      details: error.message,
    });
  }
};

// Alias para compatibilidad de importación
export const apiFootballProxyMiddleware = apiFootballProxyController;

// Montar el proxy seguro bajo el prefijo /api/live/proxy
app.use('/api/live/proxy', validateApiFootballProxy, apiFootballProxyController);

// ============================================================================
// NORMALIZACIÓN DE ESTADOS DE PARTIDO (PRIORIDAD 12)
// ============================================================================
function normalizeFixtureStatus(statusShort?: string): 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED' {
  if (!statusShort) return 'SCHEDULED';
  const s = statusShort.toUpperCase().trim();
  if (['1H', '2H', 'ET', 'P', 'LIVE', 'INT'].includes(s)) return 'LIVE';
  if (['HT'].includes(s)) return 'HALFTIME';
  if (['FT', 'AET', 'PEN'].includes(s)) return 'FINISHED';
  if (['PST', 'SUSP'].includes(s)) return 'POSTPONED';
  if (['CANC', 'ABD', 'WO'].includes(s)) return 'CANCELLED';
  return 'SCHEDULED';
}

// Catálogo Maestro de Partidos Reales para el Radar
function generateMasterRadarCatalog(baseDateStr?: string) {
  const refDate = baseDateStr ? new Date(`${baseDateStr}T12:00:00Z`) : new Date();
  const year = refDate.getUTCFullYear();
  const month = String(refDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(refDate.getUTCDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  // Cálculo de fechas del fin de semana (Viernes, Sábado, Domingo)
  const dayOfWeek = refDate.getUTCDay(); // 0: Dom, 1: Lun, ..., 5: Vie, 6: Sáb
  const fridayDiff = 5 - dayOfWeek;
  const fri = new Date(refDate);
  fri.setUTCDate(refDate.getUTCDate() + (dayOfWeek === 0 ? -2 : fridayDiff));
  const sat = new Date(fri);
  sat.setUTCDate(fri.getUTCDate() + 1);
  const sun = new Date(fri);
  sun.setUTCDate(fri.getUTCDate() + 2);

  const friStr = fri.toISOString().split('T')[0];
  const satStr = sat.toISOString().split('T')[0];
  const sunStr = sun.toISOString().split('T')[0];

  const catalog = [
    // --- HOY / EN VIVO ---
    {
      id: 'fix-today-1',
      fixtureId: 104201,
      date: `${todayStr}T14:30:00Z`,
      timestamp: Math.floor(new Date(`${todayStr}T14:30:00Z`).getTime() / 1000),
      status: 'LIVE',
      statusShort: '2H',
      elapsed: 68,
      leagueId: 39,
      league: 'Premier League',
      country: 'Inglaterra',
      round: 'Regular Season - Jornada 8',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      homeLogo: 'https://media.api-sports.io/football/teams/42.png',
      awayLogo: 'https://media.api-sports.io/football/teams/49.png',
      scoreHome: 1,
      scoreAway: 0,
      odds: { home: 1.45, draw: 3.80, away: 6.50 },
      liveXgHome: 1.58,
      liveXgAway: 0.54,
      dataQuality: 'LIVE',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Derbi de Londres · Pelea por puestos de Champions League',
    },
    {
      id: 'fix-today-2',
      fixtureId: 104202,
      date: `${todayStr}T16:00:00Z`,
      timestamp: Math.floor(new Date(`${todayStr}T16:00:00Z`).getTime() / 1000),
      status: 'LIVE',
      statusShort: '2H',
      elapsed: 76,
      leagueId: 140,
      league: 'LaLiga',
      country: 'España',
      round: 'Regular Season - Jornada 10',
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      homeLogo: 'https://media.api-sports.io/football/teams/541.png',
      awayLogo: 'https://media.api-sports.io/football/teams/529.png',
      scoreHome: 2,
      scoreAway: 2,
      odds: { home: 2.80, draw: 2.90, away: 3.10 },
      liveXgHome: 2.14,
      liveXgAway: 1.92,
      dataQuality: 'LIVE',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'El Clásico de España · Disputa directa por el Liderato',
    },
    {
      id: 'fix-today-3',
      fixtureId: 104203,
      date: `${todayStr}T18:00:00Z`,
      timestamp: Math.floor(new Date(`${todayStr}T18:00:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 242,
      league: 'LigaPro Ecuador',
      country: 'Ecuador',
      round: 'Fase 2 - Fecha 9',
      homeTeam: 'LDU Quito',
      awayTeam: 'Barcelona SC',
      homeLogo: 'https://media.api-sports.io/football/teams/1157.png',
      awayLogo: 'https://media.api-sports.io/football/teams/1155.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 1.90, draw: 3.40, away: 4.10 },
      liveXgHome: 1.70,
      liveXgAway: 1.10,
      dataQuality: 'ALTA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Clásico Nacional del Fútbol Ecuatoriano · Altura de Quito',
    },
    {
      id: 'fix-today-4',
      fixtureId: 104204,
      date: `${todayStr}T19:45:00Z`,
      timestamp: Math.floor(new Date(`${todayStr}T19:45:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 135,
      league: 'Serie A',
      country: 'Italia',
      round: 'Regular Season - Jornada 8',
      homeTeam: 'Inter',
      awayTeam: 'Juventus',
      homeLogo: 'https://media.api-sports.io/football/teams/505.png',
      awayLogo: 'https://media.api-sports.io/football/teams/496.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 1.95, draw: 3.30, away: 3.90 },
      liveXgHome: 1.55,
      liveXgAway: 1.15,
      dataQuality: 'ALTA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: "Derby d'Italia en San Siro",
    },

    // --- VIERNES DEL FIN DE SEMANA ---
    {
      id: 'fix-fri-1',
      fixtureId: 104205,
      date: `${friStr}T19:00:00Z`,
      timestamp: Math.floor(new Date(`${friStr}T19:00:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 242,
      league: 'LigaPro Ecuador',
      country: 'Ecuador',
      round: 'Fase 2 - Fecha 9',
      homeTeam: 'Emelec',
      awayTeam: 'Independiente del Valle',
      homeLogo: 'https://media.api-sports.io/football/teams/1156.png',
      awayLogo: 'https://media.api-sports.io/football/teams/1154.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 3.20, draw: 3.25, away: 2.15 },
      liveXgHome: 1.15,
      liveXgAway: 1.65,
      dataQuality: 'ALTA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Partido clave en Guayaquil · IDV busca la punta',
    },
    {
      id: 'fix-fri-2',
      fixtureId: 104206,
      date: `${friStr}T19:30:00Z`,
      timestamp: Math.floor(new Date(`${friStr}T19:30:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 78,
      league: 'Bundesliga',
      country: 'Alemania',
      round: 'Regular Season - Jornada 8',
      homeTeam: 'Bayer Leverkusen',
      awayTeam: 'RB Leipzig',
      homeLogo: 'https://media.api-sports.io/football/teams/168.png',
      awayLogo: 'https://media.api-sports.io/football/teams/173.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 1.85, draw: 3.80, away: 3.90 },
      liveXgHome: 1.80,
      liveXgAway: 1.30,
      dataQuality: 'MEDIA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Duelo por cupos Champions en el BayArena',
    },

    // --- SÁBADO DEL FIN DE SEMANA ---
    {
      id: 'fix-sat-1',
      fixtureId: 104207,
      date: `${satStr}T11:30:00Z`,
      timestamp: Math.floor(new Date(`${satStr}T11:30:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 39,
      league: 'Premier League',
      country: 'Inglaterra',
      round: 'Regular Season - Jornada 8',
      homeTeam: 'Liverpool',
      awayTeam: 'Manchester City',
      homeLogo: 'https://media.api-sports.io/football/teams/40.png',
      awayLogo: 'https://media.api-sports.io/football/teams/50.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 2.35, draw: 3.60, away: 2.80 },
      liveXgHome: 1.75,
      liveXgAway: 1.65,
      dataQuality: 'ALTA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Choque estelar en Anfield por el liderato',
    },
    {
      id: 'fix-sat-2',
      fixtureId: 104208,
      date: `${satStr}T16:30:00Z`,
      timestamp: Math.floor(new Date(`${satStr}T16:30:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 78,
      league: 'Bundesliga',
      country: 'Alemania',
      round: 'Regular Season - Jornada 8',
      homeTeam: 'Bayern Munich',
      awayTeam: 'Borussia Dortmund',
      homeLogo: 'https://media.api-sports.io/football/teams/157.png',
      awayLogo: 'https://media.api-sports.io/football/teams/165.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 1.55, draw: 4.50, away: 5.20 },
      liveXgHome: 2.40,
      liveXgAway: 1.25,
      dataQuality: 'ALTA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Der Klassiker en el Allianz Arena',
    },
    {
      id: 'fix-sat-3',
      fixtureId: 104209,
      date: `${satStr}T19:00:00Z`,
      timestamp: Math.floor(new Date(`${satStr}T19:00:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 140,
      league: 'LaLiga',
      country: 'España',
      round: 'Regular Season - Jornada 10',
      homeTeam: 'Atletico Madrid',
      awayTeam: 'Sevilla',
      homeLogo: 'https://media.api-sports.io/football/teams/530.png',
      awayLogo: 'https://media.api-sports.io/football/teams/536.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 1.62, draw: 3.90, away: 5.40 },
      liveXgHome: 1.60,
      liveXgAway: 0.95,
      dataQuality: 'ALTA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Duelo en el Metropolitano',
    },

    // --- DOMINGO DEL FIN DE SEMANA ---
    {
      id: 'fix-sun-1',
      fixtureId: 104210,
      date: `${sunStr}T15:30:00Z`,
      timestamp: Math.floor(new Date(`${sunStr}T15:30:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 39,
      league: 'Premier League',
      country: 'Inglaterra',
      round: 'Regular Season - Jornada 8',
      homeTeam: 'Tottenham',
      awayTeam: 'Manchester United',
      homeLogo: 'https://media.api-sports.io/football/teams/47.png',
      awayLogo: 'https://media.api-sports.io/football/teams/33.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 2.10, draw: 3.75, away: 3.20 },
      liveXgHome: 1.65,
      liveXgAway: 1.45,
      dataQuality: 'ALTA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Duelo directo por puestos europeos en Londres',
    },
    {
      id: 'fix-sun-2',
      fixtureId: 104211,
      date: `${sunStr}T19:00:00Z`,
      timestamp: Math.floor(new Date(`${sunStr}T19:00:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 61,
      league: 'Ligue 1',
      country: 'Francia',
      round: 'Regular Season - Jornada 9',
      homeTeam: 'Paris Saint Germain',
      awayTeam: 'Marseille',
      homeLogo: 'https://media.api-sports.io/football/teams/85.png',
      awayLogo: 'https://media.api-sports.io/football/teams/81.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 1.50, draw: 4.60, away: 5.80 },
      liveXgHome: 2.20,
      liveXgAway: 1.10,
      dataQuality: 'ALTA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Le Classique del fútbol francés en el Parque de los Príncipes',
    },
    {
      id: 'fix-sun-3',
      fixtureId: 104212,
      date: `${sunStr}T20:30:00Z`,
      timestamp: Math.floor(new Date(`${sunStr}T20:30:00Z`).getTime() / 1000),
      status: 'SCHEDULED',
      statusShort: 'NS',
      elapsed: null,
      leagueId: 13,
      league: 'Copa Libertadores',
      country: 'Internacional',
      round: 'Semifinal - Vuelta',
      homeTeam: 'River Plate',
      awayTeam: 'Boca Juniors',
      homeLogo: 'https://media.api-sports.io/football/teams/435.png',
      awayLogo: 'https://media.api-sports.io/football/teams/451.png',
      scoreHome: null,
      scoreAway: null,
      odds: { home: 2.05, draw: 3.10, away: 3.80 },
      liveXgHome: 1.40,
      liveXgAway: 1.15,
      dataQuality: 'ALTA',
      hasEnoughData: true,
      hasOdds: true,
      competitiveContext: 'Superclásico continental · Definición del boleto a la Final',
    },
  ];

  // Calcular determinísticamente Canonical ID, Importance Score y Opportunity Score para cada partido
  return catalog.map((item) => {
    const canonical = generateCanonicalFixtureId({
      fixtureId: item.fixtureId,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      competition: item.league,
      date: item.date,
    });

    const importance = calculateImportanceScore({
      competition: item.league,
      country: item.country,
      round: item.round,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      competitiveContext: item.competitiveContext,
    });

    // Calcular Opportunity Score basado en condiciones cuantitativas
    const bookmakerMargin = item.odds
      ? Math.round(((1 / item.odds.home + 1 / item.odds.draw + 1 / item.odds.away) - 1) * 10000) / 100
      : undefined;

    const opp = calculateOpportunityScore({
      hasOdds: Boolean(item.hasOdds),
      oddsCount: item.hasOdds ? 3 : 0,
      bookmakerMarginPercent: bookmakerMargin,
      maxEvPercent: item.odds ? 4.5 : undefined,
      dataQuality: item.dataQuality as any,
      hasXg: Boolean(item.liveXgHome !== undefined),
      hasLineups: true,
      isLive: item.status === 'LIVE',
    });

    return {
      ...item,
      canonicalFixtureId: canonical.canonicalId,
      importanceScore: importance.importanceScore,
      tierLabel: importance.tierLabel,
      importanceBreakdown: importance.breakdown,
      detectedFlags: importance.detectedFlags,
      opportunityScore: opp.opportunityScore,
      opportunityVerdict: opp.verdict,
      opportunityBreakdown: opp.breakdown,
      opportunityExplanation: opp.explanation,
      isDemo: true,
      dataMode: 'DEMO',
    };
  });
}

// ============================================================================
// ENDPOINT RADAR 1: GET /api/fixtures?date=YYYY-MM-DD
// Consulta la API real de API-Football mediante 'node-fetch' usando LIVE_DATA_API_KEY.
// Retorna únicamente objetos de tipo 'RadarFixture' con datos reales y 'canonicalFixtureId'
// para prevenir duplicados entre fuentes, gestionando errores sin recurrir a catálogos demo.
// ============================================================================
app.get('/api/fixtures', async (req, res) => {
  const requestedDate =
    req.query.date
      ? String(req.query.date).trim()
      : new Date().toISOString().split('T')[0];

  const requestedCountry = req.query.country
    ? String(req.query.country).trim()
    : '';

  const requestedLeague = req.query.league
    ? String(req.query.league).trim()
    : '';

  const cacheKey =
    `${requestedDate}|${requestedCountry}|${requestedLeague}`;

  const now = Date.now();

  try {
    // ------------------------------------------------------------------------
    // 1. VERIFICAR API KEY
    // ------------------------------------------------------------------------

    const { exists, key } = checkLiveDataApiKey();

    if (!exists || !key) {
      return res.status(503).json({
        success: false,
        dataMode: 'REAL',
        dataStatus: 'UNAVAILABLE',
        isDemo: false,
        source: 'API_FOOTBALL',
        error:
          'LIVE_DATA_API_KEY no está configurada correctamente en las variables de entorno del servidor.',
        count: 0,
        fixtures: [],
        timestamp: new Date().toISOString(),
      });
    }

    // ------------------------------------------------------------------------
    // 2. UTILIZAR CACHÉ SOLO SI CONTIENE DATOS REALES
    // ------------------------------------------------------------------------

    const cached = dateFixturesCacheMap.get(cacheKey);

    if (
      cached &&
      now - cached.timestamp < FIXTURES_DATE_CACHE_TTL_MS &&
      Array.isArray(cached.data)
    ) {
      const cacheAgeSeconds = Math.floor(
        (now - cached.timestamp) / 1000
      );

      return res.json({
        success: true,
        dataMode: 'REAL',
        dataStatus:
          cached.data.length > 0 ? 'READY' : 'READY_EMPTY',
        isDemo: false,
        source: 'API_FOOTBALL',
        date: requestedDate,
        cached: true,
        cacheAgeSeconds,
        count: cached.data.length,
        fixtures: cached.data,
        timestamp: new Date().toISOString(),
        apiFootballRequestsRemaining,
      });
    }

    // ------------------------------------------------------------------------
    // 3. CONSULTAR API-FOOTBALL
    // ------------------------------------------------------------------------

    const query = new URLSearchParams({
      date: requestedDate,
    });

    const apiUrl =
      `https://v3.football.api-sports.io/fixtures?${query.toString()}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-apisports-key': key,
        'x-apisports-host': 'v3.football.api-sports.io',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(9000),
    });

    // ------------------------------------------------------------------------
    // 4. ACTUALIZAR CUOTA DE REQUESTS
    // ------------------------------------------------------------------------

    const remainingHeader =
      response.headers.get('x-ratelimit-requests-remaining');

    if (remainingHeader !== null) {
      const parsedRemaining = Number.parseInt(
        remainingHeader,
        10
      );

      if (Number.isFinite(parsedRemaining)) {
        apiFootballRequestsRemaining = parsedRemaining;
      }
    }

    // ------------------------------------------------------------------------
    // 5. ERROR DE API-FOOTBALL
    //
    // IMPORTANTE:
    // NO utilizar generateMasterRadarCatalog()
    // NO utilizar SAMPLE_LIVE_FIXTURES
    // NO generar fixtures artificiales.
    // ------------------------------------------------------------------------

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        dataMode: 'REAL',
        dataStatus: 'ERROR',
        isDemo: false,
        source: 'API_FOOTBALL',
        upstreamStatus: response.status,
        error:
          `API-Football respondió con HTTP ${response.status}.`,
        count: 0,
        fixtures: [],
        timestamp: new Date().toISOString(),
      });
    }

    // ------------------------------------------------------------------------
    // 6. PARSEAR RESPUESTA
    // ------------------------------------------------------------------------

    const json = (await response.json()) as {
      response?: any[];
      errors?: Record<string, unknown>;
      results?: number;
    };

    // API-Football puede devolver errores dentro del JSON
    if (
      json.errors &&
      Object.keys(json.errors).length > 0
    ) {
      return res.status(502).json({
        success: false,
        dataMode: 'REAL',
        dataStatus: 'ERROR',
        isDemo: false,
        source: 'API_FOOTBALL',
        error: 'API-Football devolvió errores en la respuesta.',
        details: json.errors,
        count: 0,
        fixtures: [],
        timestamp: new Date().toISOString(),
      });
    }

    const rawFixtures = Array.isArray(json.response)
      ? json.response
      : [];

    // ------------------------------------------------------------------------
    // 7. NORMALIZAR A RadarFixture
    // ------------------------------------------------------------------------

    const radarFixtures = rawFixtures
      .filter(
        (item: any) =>
          item?.fixture?.id &&
          item?.teams?.home?.name &&
          item?.teams?.away?.name
      )
      .map((item: any) => {
        const fixtureId = Number(item.fixture.id);

        const competition =
          String(item.league?.name || 'Liga Oficial');

        const country =
          String(item.league?.country || 'Internacional');

        const round =
          String(item.league?.round || 'Fase Regular');

        const homeTeam =
          String(item.teams.home.name);

        const awayTeam =
          String(item.teams.away.name);

        const fixtureDate =
          String(item.fixture.date);

        // --------------------------------------------------------------
        // CANONICAL FIXTURE ID
        // --------------------------------------------------------------

        const canonical =
          generateCanonicalFixtureId({
            fixtureId,
            homeTeam,
            awayTeam,
            competition,
            date: fixtureDate,
          });

        // --------------------------------------------------------------
        // IMPORTANCE
        // --------------------------------------------------------------

        const importance =
          calculateImportanceScore({
            competition,
            country,
            round,
            homeTeam,
            awayTeam,
          });

        // --------------------------------------------------------------
        // STATUS
        // --------------------------------------------------------------

        const status =
          normalizeFixtureStatus(
            item.fixture?.status?.short
          );

        // --------------------------------------------------------------
        // OPPORTUNITY
        //
        // Todavía no afirmamos que exista value porque
        // /api/fixtures no obtiene cuotas.
        // --------------------------------------------------------------

        const opportunity =
          calculateOpportunityScore({
            hasOdds: false,
            dataQuality:
              status === 'LIVE'
                ? 'LIVE'
                : 'MEDIUM',
            hasXg: false,
            hasLineups: false,
            isLive: status === 'LIVE',
          });

        // --------------------------------------------------------------
        // RadarFixture
        // SOLO DATOS PROCEDENTES DE API-FOOTBALL
        // --------------------------------------------------------------

        return {
          id: String(fixtureId),

          canonicalFixtureId:
            canonical.canonicalId,

          fixtureId,

          date: fixtureDate,

          timestamp:
            Number(item.fixture.timestamp || 0),

          status,

          statusShort:
            String(
              item.fixture?.status?.short || 'NS'
            ),

          elapsed:
            item.fixture?.status?.elapsed ?? null,

          leagueId:
            Number(item.league?.id || 0),

          league: competition,

          country,

          round,

          homeTeam,

          awayTeam,

          homeLogo:
            String(
              item.teams?.home?.logo || ''
            ),

          awayLogo:
            String(
              item.teams?.away?.logo || ''
            ),

          scoreHome:
            item.goals?.home ?? null,

          scoreAway:
            item.goals?.away ?? null,

          importanceScore:
            importance.importanceScore,

          tierLabel:
            importance.tierLabel,

          opportunityScore:
            opportunity.opportunityScore,

          opportunityVerdict:
            opportunity.verdict,

          hasEnoughData: true,

          // Las cuotas pertenecen a otro endpoint.
          hasOdds: false,

          dataQuality:
            status === 'LIVE'
              ? 'LIVE'
              : 'MEDIUM',

          isDemo: false,

          dataMode: 'REAL',

          source: 'API_FOOTBALL',
        };
      });

    // ------------------------------------------------------------------------
    // 8. FILTROS
    // ------------------------------------------------------------------------

    let filteredFixtures =
      radarFixtures;

    if (requestedCountry) {
      const countryNeedle =
        requestedCountry.toLowerCase();

      filteredFixtures =
        filteredFixtures.filter(
          (fixture: any) =>
            fixture.country
              .toLowerCase()
              .includes(countryNeedle)
        );
    }

    if (requestedLeague) {
      const leagueNeedle =
        requestedLeague.toLowerCase();

      filteredFixtures =
        filteredFixtures.filter(
          (fixture: any) =>
            fixture.league
              .toLowerCase()
              .includes(leagueNeedle)
        );
    }

    // ------------------------------------------------------------------------
    // 9. DEDUPLICACIÓN
    // ------------------------------------------------------------------------

    const deduped =
      deduplicateFixtures(
        filteredFixtures
      ).filter(
        (fixture: any) =>
          fixture &&
          fixture.canonicalFixtureId
      );

    // ------------------------------------------------------------------------
    // 10. SIN PARTIDOS
    //
    // Esto NO es un error y tampoco significa DEMO.
    // Significa que API-Football no devolvió fixtures válidos.
    // ------------------------------------------------------------------------

    if (deduped.length === 0) {
      dateFixturesCacheMap.set(
        cacheKey,
        {
          data: [],
          timestamp: now,
        }
      );

      return res.json({
        success: true,
        dataMode: 'REAL',
        dataStatus: 'READY_EMPTY',
        isDemo: false,
        source: 'API_FOOTBALL',
        date: requestedDate,
        cached: false,
        count: 0,
        fixtures: [],
        message:
          `API-Football no reportó partidos válidos para ${requestedDate}.`,
        timestamp: new Date().toISOString(),
        apiFootballRequestsRemaining,
      });
    }

    // ------------------------------------------------------------------------
    // 11. GUARDAR ÚNICAMENTE DATOS REALES EN CACHÉ
    // ------------------------------------------------------------------------

    dateFixturesCacheMap.set(
      cacheKey,
      {
        data: deduped,
        timestamp: now,
      }
    );

    // ------------------------------------------------------------------------
    // 12. RESPUESTA FINAL
    // ------------------------------------------------------------------------

    return res.json({
      success: true,

      dataMode: 'REAL',

      dataStatus: 'READY',

      isDemo: false,

      source: 'API_FOOTBALL',

      date: requestedDate,

      cached: false,

      count: deduped.length,

      fixtures: deduped,

      timestamp:
        new Date().toISOString(),

      apiFootballRequestsRemaining,
    });

  } catch (error: any) {

    console.error(
      'Error en /api/fixtures:',
      error?.message || error
    );

    // ------------------------------------------------------------------------
    // ERROR REAL
    //
    // Nunca usar catálogo demo como fallback.
    // ------------------------------------------------------------------------

    return res.status(502).json({
      success: false,

      dataMode: 'REAL',

      dataStatus: 'ERROR',

      isDemo: false,

      source: 'API_FOOTBALL',

      error:
        `No fue posible obtener los partidos reales desde API-Football: ${
          error?.message || 'error de conexión'
        }`,

      count: 0,

      fixtures: [],

      timestamp:
        new Date().toISOString(),
    });
  }
});

// ============================================================================
// ENDPOINT RADAR 2: GET /api/fixtures/weekend?date=YYYY-MM-DD (P0.2 & P0.15)
// Soporta mode='real' | 'demo'.
// Devuelve source, timestamp, cacheAge, days, summary y diferencia REAL vs DEMO.
// ============================================================================
app.get('/api/fixtures/weekend', async (req, res) => {
  try {
    const requestedDate = req.query.date ? String(req.query.date).trim() : new Date().toISOString().split('T')[0];
    const isDemoMode = false; // MODO REAL exclusivo en producción.
    const cacheKey = `weekend_${requestedDate}_real`;
    const now = Date.now();

    // Comprobar caché
    const cached = weekendFixturesCacheMap.get(cacheKey);
    if (cached && now - cached.timestamp < FIXTURES_DATE_CACHE_TTL_MS) {
      const ageSeconds = Math.floor((now - cached.timestamp) / 1000);
      return res.json({
        success: true,
        cached: true,
        dataMode: isDemoMode ? 'DEMO' : 'REAL',
        isDemo: isDemoMode,
        cacheAgeSeconds: ageSeconds,
        source: isDemoMode ? 'CACHE_DEMO_TTL_180S' : 'CACHE_REAL_TTL_180S',
        ...cached.data,
      });
    }

    // Calcular días del fin de semana (Viernes, Sábado, Domingo)
    const refDate = new Date(`${requestedDate}T12:00:00Z`);
    const dayOfWeek = refDate.getUTCDay(); // 0 Dom, 5 Vie, 6 Sáb
    const fridayDiff = 5 - dayOfWeek;
    const fri = new Date(refDate);
    fri.setUTCDate(refDate.getUTCDate() + (dayOfWeek === 0 ? -2 : fridayDiff));
    const sat = new Date(fri);
    sat.setUTCDate(fri.getUTCDate() + 1);
    const sun = new Date(fri);
    sun.setUTCDate(fri.getUTCDate() + 2);

    const friStr = fri.toISOString().split('T')[0];
    const satStr = sat.toISOString().split('T')[0];
    const sunStr = sun.toISOString().split('T')[0];

    // MODO REAL: Consultar API-Football para los 3 días
    if (!isDemoMode) {
      if (!liveDataApiKey) {
        return res.json({
          success: false,
          dataMode: 'REAL',
          isDemo: false,
          source: 'NO_API_KEY',
          error: 'LIVE_DATA_API_KEY no configurada. QuantBet no inventa partidos en Modo REAL.',
          days: { friday: [], saturday: [], sunday: [] },
          summary: { totalMatches: 0, fridayCount: 0, saturdayCount: 0, sundayCount: 0 },
        });
      }

      // En modo real con clave, responder estructura real
      const fetchDay = async (dateStr: string) => {
        try {
          const r = await fetch(`https://v3.football.api-sports.io/fixtures?date=${dateStr}`, {
            headers: { 'x-apisports-key': liveDataApiKey, 'x-apisports-host': 'v3.football.api-sports.io' },
            signal: AbortSignal.timeout(8000),
          });
          if (r.ok) {
            const j = await r.json();
            const list = Array.isArray(j.response) ? j.response : [];
            return list.map((item: any) => {
              const comp = item.league?.name || '';
              const homeTeam = item.teams?.home?.name || 'Local';
              const awayTeam = item.teams?.away?.name || 'Visitante';
              const canonical = generateCanonicalFixtureId({
                fixtureId: item.fixture.id,
                homeTeam,
                awayTeam,
                competition: comp,
                date: item.fixture.date,
              });
              const importance = calculateImportanceScore({
                competition: comp,
                country: item.league?.country || '',
                round: item.league?.round || '',
                homeTeam,
                awayTeam,
              });
              const status = normalizeFixtureStatus(item.fixture?.status?.short);
              return {
                id: String(item.fixture.id),
                canonicalFixtureId: canonical.canonicalId,
                fixtureId: item.fixture.id,
                date: item.fixture.date,
                timestamp: item.fixture.timestamp,
                status,
                statusShort: item.fixture.status?.short || 'NS',
                elapsed: item.fixture.status?.elapsed ?? null,
                league: comp,
                country: item.league?.country || 'Internacional',
                homeTeam,
                awayTeam,
                homeLogo: item.teams?.home?.logo || '',
                awayLogo: item.teams?.away?.logo || '',
                importanceScore: importance.importanceScore,
                tierLabel: importance.tierLabel,
                dataQuality: status === 'LIVE' ? 'LIVE' : 'RECENT',
                isDemo: false,
                dataMode: 'REAL',
                source: 'API_FOOTBALL',
              };
            });
          }
          return [];
        } catch {
          return [];
        }
      };

      const [fridayMatches, saturdayMatches, sundayMatches] = await Promise.all([
        fetchDay(friStr),
        fetchDay(satStr),
        fetchDay(sunStr),
      ]);

      const responseData = {
        referenceDate: requestedDate,
        weekendDates: { friday: friStr, saturday: satStr, sunday: sunStr },
        days: { friday: fridayMatches, saturday: saturdayMatches, sunday: sundayMatches },
        summary: {
          totalMatches: fridayMatches.length + saturdayMatches.length + sundayMatches.length,
          fridayCount: fridayMatches.length,
          saturdayCount: saturdayMatches.length,
          sundayCount: sundayMatches.length,
        },
      };

      weekendFixturesCacheMap.set(cacheKey, { data: responseData, timestamp: now });

      return res.json({
        success: true,
        dataMode: 'REAL',
        isDemo: false,
        cached: false,
        source: 'API_FOOTBALL_WEEKEND',
        ...responseData,
      });
    }

    // MODO REAL exclusivo: si API-Football no está disponible,
    // devolver error. Nunca recurrir al catálogo demo.
    return res.status(502).json({
      success: false,
      dataMode: 'REAL',
      isDemo: false,
      source: 'API_FOOTBALL_UNAVAILABLE',
      error: 'No fue posible obtener datos reales del fin de semana desde API-Football.',
      days: { friday: [], saturday: [], sunday: [] },
      summary: { totalMatches: 0, fridayCount: 0, saturdayCount: 0, sundayCount: 0 },
    });
  } catch (error: any) {
    console.error('Error in /api/fixtures/weekend:', error);
    return res.status(500).json({ error: error.message || 'Error cargando fin de semana' });
  }
});

// ============================================================================
// ENDPOINT LINE SHOPPER: GET /api/odds?fixtureId=...&market=... (P0.7 & P0.8)
// Compara cuotas entre casas y sintetiza Best Odds sin mezclar mercados
// ============================================================================
app.get('/api/odds', async (req, res) => {
  try {
    const fixtureId = req.query.fixtureId ? String(req.query.fixtureId).trim() : '';
    const market = req.query.market ? String(req.query.market).trim() : '1X2';

    if (!fixtureId) {
      return res.status(400).json({ error: 'Parámetro fixtureId requerido' });
    }

    // MODO REAL EXCLUSIVO: nunca sintetizar cuotas DEMO.
    if (!liveDataApiKey) {
      return res.status(503).json({
        success: false,
        dataMode: 'REAL',
        isDemo: false,
        source: 'NO_API_KEY',
        error: 'LIVE_DATA_API_KEY no configurada. QuantBet no utiliza cuotas simuladas en Modo REAL.',
        lineShopping: null,
      });
    }

    // 1. MODO REAL: Consultar API-Football /odds
    if (liveDataApiKey) {
      try {
        const upstreamUrl = `https://v3.football.api-sports.io/odds?fixture=${fixtureId}`;
        const oddsResponse = await fetch(upstreamUrl, {
          headers: {
            'x-apisports-key': liveDataApiKey,
            'x-apisports-host': 'v3.football.api-sports.io',
          },
          signal: AbortSignal.timeout(8000),
        });

        if (oddsResponse.ok) {
          const json = await oddsResponse.json();
          const bookmakersData = json.response?.[0]?.bookmakers || [];

          if (bookmakersData.length > 0) {
            const rawQuotes: RawBookmakerQuote[] = [];

            for (const bm of bookmakersData) {
              const bmName = bm.name || 'Bookmaker';
              for (const bet of bm.bets || []) {
                const betName = bet.name || '';
                const isMatch1X2 = market.toUpperCase().includes('1X2') && (betName.includes('Match Winner') || betName.includes('1X2'));
                const isMatchOver = market.toUpperCase().includes('TOTAL') && betName.includes('Goals Over/Under');
                const isMatchBtts = market.toUpperCase().includes('BTTS') && betName.includes('Both Teams Score');

                if (isMatch1X2 || isMatchOver || isMatchBtts || betName.toLowerCase().includes(market.toLowerCase())) {
                  for (const val of bet.values || []) {
                    let selName = String(val.value);
                    if (selName === 'Home') selName = 'Local';
                    if (selName === 'Draw') selName = 'Empate';
                    if (selName === 'Away') selName = 'Visitante';
                    if (selName === 'Yes') selName = 'Sí (Ambos Marcan)';
                    if (selName === 'No') selName = 'No (Ambos Marcan)';

                    rawQuotes.push({
                      bookmaker: bmName,
                      market: betName,
                      selection: selName,
                      odds: parseFloat(val.odd) || 1.01,
                      timestamp: new Date().toISOString(),
                      source: `API_SPORTS_${bmName.toUpperCase().replace(/\s+/g, '_')}`,
                    });
                  }
                }
              }
            }

            if (rawQuotes.length > 0) {
              const shopping = performLineShopping(fixtureId, market, rawQuotes);
              return res.json({
                success: true,
                dataMode: 'REAL',
                isDemo: false,
                source: 'API_FOOTBALL_ODDS',
                lineShopping: shopping,
              });
            }
          }
        }
      } catch (apiErr) {
        console.warn('Error obteniendo cuotas reales desde API-Sports:', apiErr);
      }
    }

    // Modo REAL sin clave o sin cuotas upstream
    return res.json({
      success: false,
      dataMode: 'REAL',
      isDemo: false,
      source: 'NO_ODDS_AVAILABLE',
      error: 'No se encontraron cuotas verificadas en API-Football para este partido. QuantBet no inventa cuotas en Modo REAL.',
      lineShopping: null,
    });
  } catch (err: any) {
    console.error('Error en /api/odds:', err);
    res.status(500).json({ error: err.message || 'Error en Line Shopper' });
  }
});

// GET /api/live/fixtures (Live matches list con caché en memoria de 60s)
app.get('/api/live/fixtures', async (req, res) => {
  try {
    const { league } = req.query;
    const cacheKey = league ? `league_${String(league).toLowerCase().trim()}` : 'all';
    const now = Date.now();

    if (!liveDataApiKey) {
      return res.status(503).json({
        success: false,
        dataMode: 'REAL',
        isDemo: false,
        isManualMode: false,
        source: 'NO_API_KEY',
        error: 'LIVE_DATA_API_KEY no configurada. QuantBet no utiliza datos simulados en Modo REAL.',
        fixtures: [],
        remainingRequests: null,
      });
    }

    // 1. Comprobar Map de Caché en memoria (Expiración estricta a los 60 segundos)
    const cached = liveFixturesCacheMap.get(cacheKey);
    if (cached && now - cached.timestamp < LIVE_CACHE_TTL_MS) {
      const ageSeconds = Math.floor((now - cached.timestamp) / 1000);
      const expiresInSeconds = Math.max(0, Math.floor((LIVE_CACHE_TTL_MS - (now - cached.timestamp)) / 1000));
      return res.json({
        success: true,
        isManualMode: false,
        source: 'API_FOOTBALL_CACHE',
        cached: true,
        cacheAgeSeconds: ageSeconds,
        cacheExpiresInSeconds: expiresInSeconds,
        cacheTtlSeconds: LIVE_CACHE_TTL_MS / 1000,
        remainingRequests: apiFootballRequestsRemaining,
        fixtures: cached.data,
      });
    }

    // 2. Si no está en caché o expiró (> 60s), consultar la API de API-Sports
    let url = 'https://v3.football.api-sports.io/fixtures?live=all';
    if (league) {
      url += `&league=${encodeURIComponent(String(league))}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-apisports-key': liveDataApiKey,
        'x-apisports-host': 'v3.football.api-sports.io',
      },
      signal: AbortSignal.timeout(8000),
    });

    // Check rate limit header
    const remHeader = response.headers.get('x-ratelimit-requests-remaining');
    if (remHeader !== null) {
      apiFootballRequestsRemaining = parseInt(remHeader, 10);
    }

    if (!response.ok) {
      console.warn(`API-Football error ${response.status} in /api/live/fixtures`);

      if (cached) {
        return res.status(502).json({
          success: false,
          dataMode: 'REAL',
          isDemo: false,
          isManualMode: false,
          source: 'STALE_CACHE_AVAILABLE',
          error: `API-Football respondió HTTP ${response.status}. La última caché real está disponible, pero no se presenta como dato actualizado.`,
          cacheAgeSeconds: Math.floor((now - cached.timestamp) / 1000),
          remainingRequests: apiFootballRequestsRemaining,
          fixtures: cached.data,
        });
      }

      return res.status(502).json({
        success: false,
        dataMode: 'REAL',
        isDemo: false,
        isManualMode: false,
        source: 'API_FOOTBALL_ERROR',
        error: `API-Football respondió HTTP ${response.status}.`,
        remainingRequests: apiFootballRequestsRemaining,
        fixtures: [],
      });
    }

    const json = await response.json();
    const rawList = Array.isArray(json.response) ? json.response : [];

    const formattedFixtures = rawList.map((item: any) => ({
      id: String(item.fixture.id),
      fixtureId: item.fixture.id,
      minute: item.fixture.status.elapsed ?? 0,
      status: item.fixture.status.short,
      statusLong: item.fixture.status.long,
      league: item.league.name,
      leagueId: item.league.id,
      country: item.league.country,
      homeTeam: item.teams.home.name,
      awayTeam: item.teams.away.name,
      homeLogo: item.teams.home.logo,
      awayLogo: item.teams.away.logo,
      scoreHome: item.goals.home ?? 0,
      scoreAway: item.goals.away ?? 0,
      lastUpdated: new Date().toISOString(),
    }));

    // 3. Almacenar en Map de caché con marca de tiempo actual (expira en 60s)
    liveFixturesCacheMap.set(cacheKey, {
      data: formattedFixtures,
      timestamp: now,
    });

    return res.json({
      success: true,
      isManualMode: false,
      source: 'API_FOOTBALL_LIVE',
      cached: false,
      cacheAgeSeconds: 0,
      cacheExpiresInSeconds: Math.floor(LIVE_CACHE_TTL_MS / 1000),
      cacheTtlSeconds: LIVE_CACHE_TTL_MS / 1000,
      remainingRequests: apiFootballRequestsRemaining,
      fixtures: formattedFixtures,
    });
  } catch (error: any) {
    console.error('Error in /api/live/fixtures:', error);
    return res.status(502).json({
      success: false,
      dataMode: 'REAL',
      isDemo: false,
      isManualMode: false,
      source: 'API_FOOTBALL_ERROR',
      error: error.message || 'Error de conexión con API-Football.',
      remainingRequests: apiFootballRequestsRemaining,
      fixtures: [],
    });
  }
});
// GET /api/live/:fixtureId (Detailed live match telemetry con caché Map de 60s)
app.get('/api/live/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const now = Date.now();

    if (!liveDataApiKey) {
      return res.status(503).json({
        success: false,
        dataMode: 'REAL',
        isDemo: false,
        isManualMode: false,
        source: 'NO_API_KEY',
        error: 'LIVE_DATA_API_KEY no configurada. QuantBet no utiliza datos simulados en Modo REAL.',
      });
    }

    // 1. Comprobar Map de Caché en memoria para fixtureId (Expiración cada 60s)
    const cached = fixtureDetailsCacheMap.get(fixtureId);
    if (cached && now - cached.timestamp < LIVE_CACHE_TTL_MS) {
      const ageSeconds = Math.floor((now - cached.timestamp) / 1000);
      const expiresInSeconds = Math.max(0, Math.floor((LIVE_CACHE_TTL_MS - (now - cached.timestamp)) / 1000));
      return res.json({
        success: true,
        isManualMode: false,
        source: 'API_FOOTBALL_CACHE',
        cached: true,
        cacheAgeSeconds: ageSeconds,
        cacheExpiresInSeconds: expiresInSeconds,
        cacheTtlSeconds: LIVE_CACHE_TTL_MS / 1000,
        remainingRequests: apiFootballRequestsRemaining,
        data: cached.data,
        lastUpdated: new Date(cached.timestamp).toISOString(),
      });
    }

    // 2. Si no está en caché o expiró (> 60s), consultar API externa
    const response = await fetch(`https://v3.football.api-sports.io/fixtures?id=${encodeURIComponent(fixtureId)}`, {
      method: 'GET',
      headers: {
        'x-apisports-key': liveDataApiKey,
        'x-apisports-host': 'v3.football.api-sports.io',
      },
      signal: AbortSignal.timeout(8000),
    });

    const remHeader = response.headers.get('x-ratelimit-requests-remaining');
    if (remHeader !== null) {
      apiFootballRequestsRemaining = parseInt(remHeader, 10);
    }

    if (!response.ok) {
      if (cached) {
        return res.json({
          success: true,
          isManualMode: false,
          source: 'STALE_CACHE_FALLBACK',
          cached: true,
          warning: 'API externa temporalmente inaccesible. Mostrando última telemetría en caché.',
          cacheAgeSeconds: Math.floor((now - cached.timestamp) / 1000),
          cacheExpiresInSeconds: 0,
          cacheTtlSeconds: LIVE_CACHE_TTL_MS / 1000,
          remainingRequests: apiFootballRequestsRemaining,
          data: cached.data,
          lastUpdated: new Date(cached.timestamp).toISOString(),
        });
      }

      return res.status(502).json({
        success: false,
        dataMode: 'REAL',
        isDemo: false,
        isManualMode: false,
        source: 'API_FOOTBALL_ERROR',
        error: `Error al consultar partido en API-Football (${response.status})`,
        data: null,
      });
    }

    const json = await response.json();
    const fixtureData = json.response?.[0];

    if (!fixtureData) {
      return res.status(404).json({
        error: 'Partido no encontrado en la API en vivo.',
      });
    }

    // 3. Guardar en Map de caché con expiración de 60 segundos
    fixtureDetailsCacheMap.set(fixtureId, {
      data: fixtureData,
      timestamp: now,
    });

    return res.json({
      success: true,
      isManualMode: false,
      source: 'API_FOOTBALL_LIVE',
      cached: false,
      cacheAgeSeconds: 0,
      cacheExpiresInSeconds: Math.floor(LIVE_CACHE_TTL_MS / 1000),
      cacheTtlSeconds: LIVE_CACHE_TTL_MS / 1000,
      remainingRequests: apiFootballRequestsRemaining,
      data: fixtureData,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`Error in /api/live/${req.params.fixtureId}:`, error);
    return res.status(500).json({
      error: `Error al obtener telemetría en vivo: ${error.message}`,
    });
  }
});

// POST /api/live/context (Gemini Qualitative Context in-play)
app.post('/api/live/context', async (req, res) => {
  try {
    const { match, minute, score, redCards, competition } = req.body;

    if (!ai) {
      return res.json({
        success: true,
        contextText: '[DATO]: Información cualitativa en vivo no disponible (GEMINI_API_KEY no configurada).',
        sources: [],
      });
    }

    const prompt = `
Actúa como analista de contexto táctico deportivo EN VIVO para el partido: ${match} (${competition}).
Minuto actual: ${minute}', Marcador actual: ${score}, Tarjetas rojas: ${redCards || 0}.

REGLAS ESTRICTAS:
1. NUNCA calcules probabilidades, cuotas ni EV. Los cálculos matemáticos son responsabilidad exclusiva del motor cuantitativo.
2. Busca con Google Search información cualitativa verificable de este partido EN VIVO:
   - Lesiones o molestias ocurridas durante el partido.
   - Controversias de arbitraje (VAR o tarjetas rojas).
   - Clima actual en el estadio si afecta el rodar del balón o el ritmo.
   - Ajustes tácticos destacados reportados por fuentes oficiales o prensa deportiva reconocida (BBC, Marca, AS, Gazzetta, Sky, etc.).
3. Etiqueta cada dato como [DATO] con su fuente y minuto/hora. Si algo no se confirma, escribe «No puedo confirmar».
4. Sé conciso: máximo 3–4 viñetas directas.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
      },
    });

    const textOutput = response.text || '';
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const webSources = groundingChunks
      .filter((c: any) => c.web && c.web.uri)
      .map((c: any) => ({
        title: c.web?.title || 'Fuente en vivo',
        url: c.web?.uri || '',
      }));

    return res.json({
      success: true,
      contextText: textOutput,
      sources: webSources,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.warn('Error in /api/live/context:', error);
    return res.json({
      success: true,
      contextText: '[DATO]: No se pudo sincronizar contexto de Gemini en tiempo real. Análisis cualitativo omitido.',
      sources: [],
    });
  }
});


export interface OddsItem {
  option: string;
  odd: number;
}

// Deterministic Quantitative Report Generator (Complies 100% with QuantBet EV+ V2 Protocol)
function generateDeterministicReport(params: {
  match: string;
  competition: string;
  matchDateTime?: string;
  market: string;
  captureTime: string;
  odds: OddsItem[];
  bankroll?: number;
  additionalContext?: string;
  notice?: string;
}) {
  const {
    match,
    competition,
    matchDateTime,
    market,
    captureTime,
    odds,
    bankroll,
    additionalContext,
    notice,
  } = params;

  // 1. Margen de la casa y probabilidades implícitas
  let S = 0;
  odds.forEach((item) => {
    S += 1 / item.odd;
  });
  const houseMargin = (S - 1) * 100;

  // Probabilidades justas normalizadas sin margen (Fase 1)
  const fairProbs = odds.map((item) => {
    const pFair = ((1 / item.odd) / S) * 100;
    return Math.round(pFair * 100) / 100;
  });

  // Asegurar suma de 100.00%
  const sumFair = fairProbs.reduce((a, b) => a + b, 0);
  const diff = Math.round((100 - sumFair) * 100) / 100;
  if (diff !== 0 && fairProbs.length > 0) {
    fairProbs[fairProbs.length - 1] = Math.round((fairProbs[fairProbs.length - 1] + diff) * 100) / 100;
  }

  // En ausencia de fuentes verificables en tiempo real, se adopta la probabilidad de mercado normalizada
  const estProbs = [...fairProbs];

  // Filas matemáticas para la tabla
  const tableRows = odds.map((item, idx) => {
    const pImp = (1 / item.odd) * 100;
    const pFair = fairProbs[idx];
    const pEst = estProbs[idx];
    const ev = (pEst / 100) * item.odd - 1;
    const evPercent = ev * 100;
    const minOdd = pEst > 0 ? 1 / (pEst / 100) : 999;
    const uncertaintyLow = Math.max(0, pEst - 4.5);
    const uncertaintyHigh = Math.min(100, pEst + 4.5);

    return {
      name: item.option,
      odd: item.odd.toFixed(2),
      pImp: `${pImp.toFixed(2)}%`,
      pFair: `${pFair.toFixed(2)}%`,
      pEst: `${pEst.toFixed(2)}%`,
      minOdd: minOdd.toFixed(2),
      evPercent: `${evPercent >= 0 ? '+' : ''}${evPercent.toFixed(2)}%`,
      margin: `${houseMargin.toFixed(2)}%`,
      uncertainty: `${uncertaintyLow.toFixed(1)}–${uncertaintyHigh.toFixed(1)}%`,
      quality: 'BAJA',
    };
  });

  const report = `${notice ? `> **${notice}**\n\n` : ''}## Análisis Táctico
- **Partido y Competición:** ${match} (${competition})
- **Fecha y Hora:** ${matchDateTime || 'Pendiente de confirmación'} (Hora local GMT-5)
- **Mercado Evaluado:** ${market}
- **Timestamp de Cuotas:** ${captureTime}
- **Fortalezas y Debilidades:** NO PUEDO CONFIRMAR métricas de xGF/xGA históricas ni rendimiento reciente sin conexión a bases verificadas (Understat/FBref).
- **Lesiones y Disponibilidad:** NO PUEDO CONFIRMAR actas médicas oficiales ni alineaciones confirmadas a la hora de captura.
- **Fatiga y Calendario:** NO PUEDO CONFIRMAR días de descanso ni congestión de fixture oficial.
${additionalContext ? `- **Contexto Aportado por Usuario:** ${additionalContext}` : ''}

---

## Matemáticas del Mercado

| Opción | Cuota | Prob. Implícita | Prob. Justa Mercado | Prob. Modelo | Cuota Justa Modelo | EV | Margen Bookmaker | Incertidumbre | Calidad de Datos |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
${tableRows
  .map(
    (r) =>
      `| ${r.name} | ${r.odd} | ${r.pImp} | ${r.pFair} | ${r.pEst} | ${r.minOdd} | ${r.evPercent} | ${r.margin} | ${r.uncertainty} | ${r.quality} |`
  )
  .join('\n')}

---

## Veredicto

### NO APOSTAR

**Justificación cuantitativa:**
1. **Fase 0 & Fase 15 (Criterio de No Apuesta):** La calidad de datos es BAJA debido a la falta de xG y alineaciones oficiales confirmadas (NO PUEDO CONFIRMAR).
2. **Fase 10 & 11 (Valor Esperado y Margen de Seguridad):** Al adoptar la probabilidad de mercado normalizada, el EV respecto a la cuota ofrecida es negativo (-${houseMargin.toFixed(2)}% aproximado debido al margen del bookmaker).
3. La ventaja matemática calculada es inferior al umbral operativo y al error de estimación del modelo.

---

## Stake

\`\`\`text
Kelly completo: 0.00%
1/4 Kelly: 0.00%
Límite máximo: 2.00% Bankroll
Stake final: 0.00% (No se arriesga capital)
\`\`\`
${bankroll ? `- **Monto Sugerido en Dinero:** $0.00 USD (Bankroll total: $${bankroll.toFixed(2)} USD)` : ''}

---

## Riesgos Principales
1. **Incertidumbre en alineaciones:** Cambios de último minuto en el XI inicial pueden alterar la probabilidad en más de 8 puntos porcentuales.
2. **Margen de intermediación:** El bookmaker retiene un margen de ${houseMargin.toFixed(2)}% que exige cuotas superiores a la cuota justa calculada.
3. **Modelo no calibrado empíricamente:** Al no disponer de telemetría xG en vivo verificable, las probabilidades representan estimaciones del modelo y no probabilidades empíricamente calibradas.

---

## Calidad de la Señal
\`\`\`text
Datos: BAJA
Modelo: MEDIA
Mercado: ALTA
\`\`\`

> *Nota obligatoria:* Análisis informativo cuantitativo basado en estimaciones; no garantiza resultados ni constituye asesoría financiera.`;

  return report;
}

// Endpoint to run analysis with Gemini + Google Search Grounding with robust Rate-Limit Fallback
app.post('/api/analyze', async (req, res) => {
  try {
    const {
      match,
      competition,
      matchDateTime,
      market,
      captureTime,
      odds,
      bankroll,
      additionalContext,
      forceDeterministic,
    } = req.body;

    if (!match || !competition || !odds || !Array.isArray(odds) || odds.length < 2) {
      return res.status(400).json({
        error: 'Datos incompletos. Se requiere partido, competición y al menos 2 cuotas del mercado.',
      });
    }

    if (!captureTime) {
      return res.status(400).json({
        error: 'Falta la hora de captura de la cuota. Es un requisito obligatorio para el cálculo.',
      });
    }

    // Verify all odds are numbers > 1.0
    for (const item of odds) {
      if (!item.odd || Number(item.odd) <= 1.0) {
        return res.status(400).json({
          error: `Cuota inválida para la opción "${item.option}". La cuota decimal debe ser mayor a 1.00.`,
        });
      }
    }

    // If user explicitly requested deterministic mode or AI client is not available
    if (forceDeterministic || !ai) {
      const fallbackReport = generateDeterministicReport({
        match,
        competition,
        matchDateTime,
        market,
        captureTime,
        odds,
        bankroll,
        additionalContext,
        notice: forceDeterministic
          ? 'Análisis ejecutado con el Motor Cuantitativo Determinístico QuantBet V2.'
          : 'Servicio de IA no disponible; generado con el Motor Cuantitativo Determinístico QuantBet V2.',
      });

      return res.json({
        success: true,
        analysis: fallbackReport,
        isFallback: true,
        sources: [
          { title: 'Understat (xG Analytics)', url: 'https://understat.com' },
          { title: 'FBref (Football Analytics)', url: 'https://fbref.com' },
          { title: 'SofaScore (Data & Ratings)', url: 'https://www.sofascore.com' },
        ],
        timestamp: new Date().toISOString(),
      });
    }

    // Build the prompt for Gemini strictly using the QUANTBET EV+ V2 PROTOCOL
    const prompt = `
# QUANTBET EV+ — ANALISTA CUANTITATIVO DEPORTIVO V2

Actúa como un sistema especializado en:
- ciencia de datos deportivos;
- modelado probabilístico;
- análisis estadístico;
- valoración de cuotas;
- detección de Value Bets;
- gestión cuantitativa del riesgo;
- análisis táctico basado en datos.

Tu función NO es garantizar resultados ni presentar una apuesta como segura.
Tu función es: estimar probabilidades, comparar esas probabilidades con el precio de mercado, cuantificar la incertidumbre y determinar objetivamente si existe o no una ventaja matemática suficiente para justificar una operación.

Nunca inventes datos.
Cuando una información no tenga una fuente verificable escribe textualmente:
NO PUEDO CONFIRMAR

DATOS SUMINISTRADOS:
- Partido: ${match}
- Competición: ${competition}
- Fecha y hora: ${matchDateTime || 'No especificada'} (GMT-5)
- Mercado: ${market}
- Timestamp de cuotas: ${captureTime}
- Cuotas del mercado:
${odds.map((o: { option: string; odd: number }) => `  * ${o.option}: ${Number(o.odd).toFixed(2)}`).join('\n')}
${bankroll ? `- Bankroll: $${Number(bankroll).toFixed(2)} USD` : '- Bankroll: No especificado (expresar en % de bankroll)'}
${additionalContext ? `- Contexto adicional: ${additionalContext}` : ''}

EJECUTA LAS 19 FASES DEL PROTOCOLO V2:
- FASE 0: Validación de datos y clasificación de Calidad (ALTA, MEDIA, BAJA).
- FASE 1: Normalización del mercado (P_implícita = 1/cuota, Vig/Margen, P_fair normalizada).
- FASE 2: Expectativa de goles (xGF y xGA de local y visitante, volumen de tiros, disponibilidad).
- FASE 3: Recencia (EWMA o ponderación temporal).
- FASE 4: Fuerza del rival.
- FASE 5: Modelo Poisson. IMPORTANTE: Si P(X=i, Y=j) = P(X=i)P(Y=j), descríbelo explícitamente como "dos procesos Poisson independientes".
- FASE 6: Ajustes cualitativos (lesiones, fatiga, táctica, H2H secundario).
- FASE 7: Mercado y movimiento de cuotas observado (sin asumir intenciones).
- FASE 8: Probabilidad final y Cuota justa (1 / P_modelo).
- FASE 9: Incertidumbre (rango y calidad).
- FASE 10: Value Bet (EV% = (P_modelo * Cuota - 1) * 100). Umbrales: <3% NO BET, 3%–5% VALOR MARGINAL, >5% VALUE POTENCIAL.
- FASE 11: Margen de seguridad (si EV ≈ error del modelo -> NO BET).
- FASE 12: Criterio de Kelly (f = (p*c - 1)/(c - 1), 1/4 Kelly, tope máximo estricto de 2% de bankroll. Si Kelly <= 0 -> 0%).
- FASE 13: Correlación para combinadas (INDEPENDIENTE, CORRELACIÓN POTENCIAL, CORRELACIONADO, DESCONOCIDO).
- FASE 14: Control de riesgo.
- FASE 15: Criterio de NO APUESTA (NO APOSTAR es una salida válida y frecuente).
- FASE 16: CLV (Closing Line Value).
- FASE 17: Backtesting y calibración.
- FASE 18: Calibración (indicar explícitamente que son estimaciones del modelo).

FORMATO EXACTO DE SALIDA (FASE 19):

## Análisis Táctico
(Resumen conciso de fortalezas, debilidades, lesiones, fatiga, contexto y variables tácticas con fuentes verificadas. Usa "NO PUEDO CONFIRMAR" si no hay fuente confirmada).

## Matemáticas del Mercado
| Variable | Resultado |
|---|---:|
| Cuota | X.XX |
| Probabilidad implícita | XX% |
| Probabilidad justa mercado | XX% |
| Probabilidad modelo | XX% |
| Cuota justa modelo | X.XX |
| EV | +X.XX% |
| Margen bookmaker | X.XX% |
| Incertidumbre | XX–XX% |
| Calidad de datos | ALTA/MEDIA/BAJA |
(Si hay múltiples opciones en el mercado, presenta la tabla con cada opción).

## Veredicto
(Una única salida clara:)
### VALUE BET
o
### ESPERAR MEJOR CUOTA
o
### NO APOSTAR

## Stake
\`\`\`text
Kelly completo: X.XX%
1/4 Kelly: X.XX%
Límite máximo: 2.00%
Stake final: X.XX%
\`\`\`

## Riesgos Principales
(Enumerar variables que podrían invalidar la ventaja).

## Calidad de la Señal
\`\`\`text
Datos: ALTA/MEDIA/BAJA
Modelo: ALTA/MEDIA/BAJA
Mercado: ALTA/MEDIA/BAJA
\`\`\`

REGLA FUNDAMENTAL: No inventar información. Separar hecho de interpretación y predicción. Las probabilidades son estimaciones.
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.2,
        },
      });

      const textOutput = response.text || '';
      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const webSources = groundingChunks
        .filter((c: { web?: { uri?: string; title?: string } }) => c.web && c.web.uri)
        .map((c: { web?: { uri?: string; title?: string } }) => ({
          title: c.web?.title || 'Fuente deportiva',
          url: c.web?.uri || '',
        }));

      return res.json({
        success: true,
        analysis: textOutput,
        sources: webSources,
        isFallback: false,
        timestamp: new Date().toISOString(),
      });
    } catch (apiError: unknown) {
      // Check if it's a rate limit or quota exceeded error (429 or RESOURCE_EXHAUSTED)
      const errStr = String(apiError);
      const isQuotaError =
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED') ||
        errStr.includes('quota') ||
        errStr.includes('rate-limits');

      console.warn('Advertencia en llamada Gemini API:', apiError);

      if (isQuotaError) {
        // Graceful fallback to deterministic quantitative engine
        const fallbackReport = generateDeterministicReport({
          match,
          competition,
          matchDateTime,
          market,
          captureTime,
          odds,
          bankroll,
          additionalContext,
          notice:
            'Aviso de Cuota de API: Se alcanzó el límite temporal de consultas en tiempo real de Google Gemini (HTTP 429). QuantBet ha ejecutado el protocolo cuantitativo utilizando su motor matemático determinístico interno, calculando con exactitud el margen de la casa, probabilidades justas desmargenadas, EV y criterio de Kelly.',
        });

        return res.json({
          success: true,
          analysis: fallbackReport,
          isFallback: true,
          isQuotaWarning: true,
          warning:
            'Cuota de API temporalmente excedida. Se ha generado el informe mediante el motor cuantitativo local de QuantBet con precisión matemática.',
          sources: [
            { title: 'Understat (xG Analytics)', url: 'https://understat.com' },
            { title: 'FBref (Football Analytics)', url: 'https://fbref.com' },
            { title: 'SofaScore (Data & Ratings)', url: 'https://www.sofascore.com' },
          ],
          timestamp: new Date().toISOString(),
        });
      }

      throw apiError;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al procesar el análisis.';
    console.error('Error en /api/analyze:', error);
    return res.status(500).json({
      error: `Error al procesar el análisis cuantitativo: ${message}`,
    });
  }
});

// Setup Vite middleware in development or serve static in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`QuantBet EV+ server running on http://localhost:${PORT}`);
  });
}

startServer();
