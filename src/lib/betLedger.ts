/**
 * QUANTBET EV+ V4 — REGISTRO DE APUESTAS (BET LEDGER) Y PISTA DE AUDITORÍA (MODEL AUDIT TRAIL)
 * 
 * Prioridad 9: Bet Ledger con cálculo de Stop-Loss y separación estricta modo REAL / DEMO.
 * Prioridad 10: Model Audit Trail para trazabilidad matemática forense de cada señal emitida.
 */

export interface BetLedgerEntry {
  id: string;
  timestamp: string; // ISO
  matchId: string;
  matchName?: string;
  market: string;
  selection: string;
  odds: number;
  stake: number;
  result: 'PENDIENTE' | 'GANADA' | 'PERDIDA' | 'ANULADA';
  profitLoss: number; // Dinero ganado/perdido
  isDemo: boolean;
}

export interface ModelAuditTrailRecord {
  id: string;
  timestamp: string; // ISO
  partido: string;
  cuota: number;
  xG: { home?: number; away?: number };
  xGF: number;
  xGA: number;
  tiros: { home?: number; away?: number };
  tirosAPuerta: { home?: number; away?: number };
  posesion: { home?: number; away?: number };
  marcador: { home: number; away: number };
  tarjetas: { redHome: number; redAway: number };
  lambdaPrepartido: { home: number; away: number };
  factores: Record<string, any>;
  lambdaDinamico: { home: number; away: number };
  probabilidad: number;
  cuotaJusta: number;
  ev: number;
  kelly: number;
  stake: number;
  calidadDeDatos: string;
  confianza: string;
  veredicto: string;
  isDemo: boolean;
}

export interface StopLossConfig {
  dailyStopLossMoney?: number; // Límite en unidades monetarias (ej. $100)
  dailyStopLossPercent?: number; // Límite en % de bankroll (ej. 5%)
  bankroll?: number;
}

export interface StopLossStatus {
  dailyLoss: number; // Pérdida neta acumulada en el día (positiva si hay pérdidas)
  dailyProfitLoss: number; // PnL neto
  betsEvaluated: number;
  isStopLossReached: boolean;
  stopLossReason?: string;
  remainingAllowedLoss: number;
}

// Claves de persistencia local
const STORAGE_LEDGER_REAL = 'quantbet_v4_ledger_real';
const STORAGE_LEDGER_DEMO = 'quantbet_v4_ledger_demo';
const STORAGE_AUDIT_TRAIL = 'quantbet_v4_audit_trail';

/**
 * Obtiene el historial de apuestas según el modo (REAL o DEMO)
 */
export function getBetLedger(isDemo: boolean = false): BetLedgerEntry[] {
  try {
    const key = isDemo ? STORAGE_LEDGER_DEMO : STORAGE_LEDGER_REAL;
    const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Error reading bet ledger:', e);
    return [];
  }
}

/**
 * Registra una nueva apuesta en el Ledger
 */
export function recordBetInLedger(entry: Omit<BetLedgerEntry, 'id' | 'timestamp' | 'profitLoss'> & { id?: string; timestamp?: string }): BetLedgerEntry {
  const newEntry: BetLedgerEntry = {
    id: entry.id || `bet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    matchId: entry.matchId,
    matchName: entry.matchName,
    market: entry.market,
    selection: entry.selection,
    odds: entry.odds,
    stake: entry.stake,
    result: entry.result || 'PENDIENTE',
    profitLoss: entry.result === 'GANADA' ? entry.stake * (entry.odds - 1) : entry.result === 'PERDIDA' ? -entry.stake : 0,
    isDemo: Boolean(entry.isDemo),
  };

  const key = newEntry.isDemo ? STORAGE_LEDGER_DEMO : STORAGE_LEDGER_REAL;
  try {
    const current = getBetLedger(newEntry.isDemo);
    const updated = [newEntry, ...current];
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(updated));
    }
  } catch (e) {
    console.warn('Error saving bet to ledger:', e);
  }

  return newEntry;
}

/**
 * Actualiza el resultado de una apuesta en el Ledger
 */
export function updateBetResult(id: string, result: BetLedgerEntry['result'], isDemo: boolean = false): BetLedgerEntry | null {
  const current = getBetLedger(isDemo);
  const index = current.findIndex((b) => b.id === id);
  if (index === -1) return null;

  const bet = current[index];
  bet.result = result;
  if (result === 'GANADA') {
    bet.profitLoss = bet.stake * (bet.odds - 1);
  } else if (result === 'PERDIDA') {
    bet.profitLoss = -bet.stake;
  } else {
    bet.profitLoss = 0;
  }

  current[index] = bet;
  try {
    const key = isDemo ? STORAGE_LEDGER_DEMO : STORAGE_LEDGER_REAL;
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(current));
    }
  } catch (e) {
    console.warn('Error updating bet in ledger:', e);
  }

  return bet;
}

/**
 * Calcula el estado del Stop-Loss diario basándose exclusivamente en el Bet Ledger
 */
export function calculateStopLossFromLedger(
  isDemo: boolean = false,
  config: StopLossConfig = {},
  dateIsoStr?: string
): StopLossStatus {
  const ledger = getBetLedger(isDemo);
  const targetDate = (dateIsoStr || new Date().toISOString()).split('T')[0];

  // Filtrar operaciones finalizadas del día especificado
  const todaysBets = ledger.filter((b) => {
    const betDate = b.timestamp.split('T')[0];
    return betDate === targetDate && (b.result === 'GANADA' || b.result === 'PERDIDA');
  });

  const dailyProfitLoss = todaysBets.reduce((acc, b) => acc + b.profitLoss, 0);
  const dailyLoss = dailyProfitLoss < 0 ? Math.abs(dailyProfitLoss) : 0;

  // Límite monetario establecido
  let effectiveLimitMoney = config.dailyStopLossMoney;
  if (!effectiveLimitMoney && config.dailyStopLossPercent && config.bankroll) {
    effectiveLimitMoney = (config.dailyStopLossPercent / 100) * config.bankroll;
  }
  if (!effectiveLimitMoney) {
    // Por defecto: 5% del bankroll o $100
    effectiveLimitMoney = config.bankroll ? config.bankroll * 0.05 : 100;
  }

  const isStopLossReached = dailyLoss >= effectiveLimitMoney;
  const remainingAllowedLoss = Math.max(0, effectiveLimitMoney - dailyLoss);

  return {
    dailyLoss: Math.round(dailyLoss * 100) / 100,
    dailyProfitLoss: Math.round(dailyProfitLoss * 100) / 100,
    betsEvaluated: todaysBets.length,
    isStopLossReached,
    stopLossReason: isStopLossReached
      ? `STOP-LOSS ALCANZADO: Pérdida acumulada del día ($${dailyLoss.toFixed(2)}) alcanzó el límite permitido ($${effectiveLimitMoney.toFixed(2)}). Todas las señales quedan bloqueadas.`
      : undefined,
    remainingAllowedLoss: Math.round(remainingAllowedLoss * 100) / 100,
  };
}

/**
 * Guarda un registro de auditoría forense del modelo (Model Audit Trail)
 */
export function recordModelAuditTrail(record: Omit<ModelAuditTrailRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): ModelAuditTrailRecord {
  const newRecord: ModelAuditTrailRecord = {
    id: record.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: record.timestamp || new Date().toISOString(),
    ...record,
  };

  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_AUDIT_TRAIL) : null;
    const current: ModelAuditTrailRecord[] = raw ? JSON.parse(raw) : [];
    const updated = [newRecord, ...current].slice(0, 100); // Conservar últimos 100 registros
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_AUDIT_TRAIL, JSON.stringify(updated));
    }
  } catch (e) {
    console.warn('Error recording audit trail:', e);
  }

  return newRecord;
}

/**
 * Obtiene el registro de auditoría del modelo
 */
export function getModelAuditTrail(): ModelAuditTrailRecord[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_AUDIT_TRAIL) : null;
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Error reading audit trail:', e);
    return [];
  }
}
