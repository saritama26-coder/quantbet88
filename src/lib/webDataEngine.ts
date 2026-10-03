/**
 * QUANTBET EV+ P0 — WEB DATA ENGINE
 * 
 * Capa estructurada para adquisición y validación de contexto deportivo web.
 * Cada variable crítica mantiene su trazabilidad forense:
 * - source
 * - url
 * - timestamp
 * - status: 'CONFIRMED' | 'EXPECTED' | 'UNVERIFIED' | 'MISSING'
 * 
 * REGLA FUNDAMENTAL:
 * Nunca inventar datos. Si una variable no tiene fuente verificable, su valor es null
 * y su estado es MISSING o UNVERIFIED.
 */

export interface VerifiedField<T = string | number> {
  value: T | null;
  status: 'CONFIRMED' | 'EXPECTED' | 'UNVERIFIED' | 'MISSING';
  source: string;
  url?: string;
  timestamp: string; // ISO
}

export interface PlayerAbsence {
  player: string;
  team: string;
  type: 'INJURY' | 'SUSPENSION' | 'DOUBTFUL';
  reason?: string;
  status: 'CONFIRMED OUT' | 'DOUBTFUL' | 'EXPECTED RETURN' | 'UNVERIFIED';
  source: string;
}

export interface TeamLineup {
  team: string;
  formation?: string;
  startingXI: Array<{ name: string; number?: number; pos?: string }>;
  substitutes: Array<{ name: string; number?: number; pos?: string }>;
  coach?: string;
  status: 'CONFIRMED' | 'EXPECTED' | 'UNKNOWN';
  source: string;
  updatedAt: string;
}

export interface MatchWebContext {
  canonicalFixtureId: string;
  fixtureId?: number | string;
  matchName: string;
  competition: string;
  date: string;
  
  // Métricas avanzadas
  xgHome: VerifiedField<number>;
  xgAway: VerifiedField<number>;
  xgaHome: VerifiedField<number>;
  xgaAway: VerifiedField<number>;

  // Rendimiento y descanso
  homeForm: VerifiedField<string>;
  awayForm: VerifiedField<string>;
  daysRestHome: VerifiedField<number>;
  daysRestAway: VerifiedField<number>;

  // Alineaciones y Bajas
  lineups: {
    home: TeamLineup;
    away: TeamLineup;
  };
  absences: PlayerAbsence[];

  // Contexto y entorno
  competitiveContext: VerifiedField<string>;
  referee: VerifiedField<string>;
  weather: VerifiedField<string>;

  // Movimiento de cuotas observado
  observedMarketMovement?: {
    openingOdd: number;
    highestOdd: number;
    lowestOdd: number;
    currentOdd: number;
    direction: 'DRIFTING_UP' | 'STEAMING_DOWN' | 'STABLE';
    source: string;
    timestamp: string;
  };
}

/**
 * Crea un VerifiedField con validación de obligatoriedad de fuente
 */
export function createVerifiedField<T>(
  value: T | null,
  status: 'CONFIRMED' | 'EXPECTED' | 'UNVERIFIED' | 'MISSING',
  source: string,
  url?: string
): VerifiedField<T> {
  const effectiveStatus = (value === null || value === undefined || !source || source.trim() === '')
    ? 'MISSING'
    : status;

  return {
    value: effectiveStatus === 'MISSING' ? null : value,
    status: effectiveStatus,
    source: source || 'UNKNOWN_SOURCE',
    url: url || undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Valida si un contexto deportivo dispone de la información mínima crítica para el análisis cuantitativo
 */
export function validateContextCompleteness(ctx: MatchWebContext): {
  isCriticalDataAvailable: boolean;
  missingCriticalFields: string[];
} {
  const missing: string[] = [];

  if (ctx.xgHome.status === 'MISSING' || ctx.xgAway.status === 'MISSING') {
    missing.push('xG (Goles Esperados)');
  }
  if (ctx.homeForm.status === 'MISSING' || ctx.awayForm.status === 'MISSING') {
    missing.push('Forma reciente de equipos');
  }
  if (ctx.lineups.home.status === 'UNKNOWN' || ctx.lineups.away.status === 'UNKNOWN') {
    missing.push('Alineaciones (desconocidas)');
  }

  return {
    isCriticalDataAvailable: missing.length === 0,
    missingCriticalFields: missing,
  };
}
