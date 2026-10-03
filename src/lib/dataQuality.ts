/**
 * QUANTBET EV+ V4 — CLASIFICADOR DE CALIDAD DE DATOS (DATA QUALITY)
 * 
 * Estados obligatorios:
 * - LIVE: Telemetría oficial en vivo recibida hace menos de 60 segundos con métricas activas
 * - RECENT: Datos actualizados entre 60 y 90 segundos
 * - STALE: Datos con más de 90 segundos sin refrescar o cuota desfasada (>60s)
 * - MANUAL: Datos ingresados por el usuario sin sincronización API
 * - SIMULATED: Datos provenientes de simulaciones o fixtures de muestra
 * - MISSING: Ausencia de variables críticas (minuto, cuotas, marcador)
 * - CONFLICTING: Inconsistencias lógicas (ej. tiros a puerta > tiros totales, minuto inválido)
 * 
 * REGLA FUNDAMENTAL: Si los datos son insuficientes (STALE, MISSING, CONFLICTING), el sistema debe forzar NO BET.
 */

export type DataQualityState =
  | 'LIVE'
  | 'RECENT'
  | 'STALE'
  | 'MANUAL'
  | 'SIMULATED'
  | 'MISSING'
  | 'CONFLICTING';

export interface DataQualityInput {
  currentMinute?: number;
  scoreHome?: number;
  scoreAway?: number;
  totalShotsHome?: number;
  totalShotsAway?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  hasXgData?: boolean;
  liveXgHome?: number;
  liveXgAway?: number;
  isManualData?: boolean;
  isSampleOrSimulated?: boolean;
  telemetryReceivedAt?: string;
  sourceUpdatedAt?: string;
  oddsCaptureTime?: string;
  oddsCount?: number;
}

export interface DataQualityResult {
  state: DataQualityState;
  canIssueBetSignal: boolean;
  reasons: string[];
  dataAgeSeconds: number;
  diffSecondsWithOdds: number;
  requiresNoBet: boolean;
}

/**
 * Diferencia circular de 24 horas para timestamps en formato HH:mm:ss o ISO
 * Maneja el cambio de medianoche (ej. 23:59:55 y 00:00:05 -> 10 segundos)
 */
export function calculateCircularTimeDiffSeconds(timeA: string, timeB: string): number {
  const parseSecondsOfDay = (str: string): number => {
    if (!str) return 0;
    if (str.includes('T')) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      }
    }
    const parts = str.trim().split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    const s = parseInt(parts[2] || '0', 10);
    return ((h % 24) * 3600) + ((m % 60) * 60) + (s % 60);
  };

  const secA = parseSecondsOfDay(timeA);
  const secB = parseSecondsOfDay(timeB);

  const rawDiff = Math.abs(secA - secB);
  const SECONDS_IN_DAY = 86400;
  return Math.min(rawDiff, SECONDS_IN_DAY - rawDiff);
}

/**
 * Calcula la antigüedad de los datos sin verse afectada por ediciones manuales
 */
export function calculateDataAgeSeconds(referenceTimeStr?: string): number {
  if (!referenceTimeStr) return 999;
  const now = new Date();
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  let refSec = 0;
  if (referenceTimeStr.includes('T')) {
    const d = new Date(referenceTimeStr);
    if (!isNaN(d.getTime())) {
      refSec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    }
  } else {
    const parts = referenceTimeStr.trim().split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    const s = parseInt(parts[2] || '0', 10);
    refSec = ((h % 24) * 3600) + ((m % 60) * 60) + (s % 60);
  }

  const rawDiff = nowSec - refSec;
  const SECONDS_IN_DAY = 86400;
  // Manejo de cruce de día
  return rawDiff >= 0 ? rawDiff : SECONDS_IN_DAY + rawDiff;
}

/**
 * Evalúa la calidad integral de los datos según las prioridades V4
 */
export function evaluateDataQuality(input: DataQualityInput): DataQualityResult {
  const reasons: string[] = [];

  // 1. Detección de CONFLICTING (inconsistencias matemáticas)
  if (
    input.currentMinute !== undefined &&
    (input.currentMinute < 0 || input.currentMinute > 130)
  ) {
    reasons.push('Minuto de juego fuera de rango admisible (0-130 min).');
    return {
      state: 'CONFLICTING',
      canIssueBetSignal: false,
      reasons,
      dataAgeSeconds: 999,
      diffSecondsWithOdds: 999,
      requiresNoBet: true,
    };
  }

  if (
    (input.shotsOnTargetHome !== undefined &&
      input.totalShotsHome !== undefined &&
      input.shotsOnTargetHome > input.totalShotsHome) ||
    (input.shotsOnTargetAway !== undefined &&
      input.totalShotsAway !== undefined &&
      input.shotsOnTargetAway > input.totalShotsAway)
  ) {
    reasons.push('Inconsistencia: Tiros a puerta no pueden superar los tiros totales.');
    return {
      state: 'CONFLICTING',
      canIssueBetSignal: false,
      reasons,
      dataAgeSeconds: 999,
      diffSecondsWithOdds: 999,
      requiresNoBet: true,
    };
  }

  // 2. Detección de MISSING (variables críticas no provistas)
  if (
    input.currentMinute === undefined ||
    input.scoreHome === undefined ||
    input.scoreAway === undefined ||
    (input.oddsCount !== undefined && input.oddsCount < 2)
  ) {
    reasons.push('Faltan variables críticas: minuto, marcador o cuotas de mercado.');
    return {
      state: 'MISSING',
      canIssueBetSignal: false,
      reasons,
      dataAgeSeconds: 999,
      diffSecondsWithOdds: 999,
      requiresNoBet: true,
    };
  }

  // 3. Verificación de tiempos y frescura con diferencia circular 24h
  const dataTimestamp = input.telemetryReceivedAt || input.sourceUpdatedAt;
  const dataAgeSeconds = calculateDataAgeSeconds(dataTimestamp);
  const diffSecondsWithOdds = input.oddsCaptureTime && dataTimestamp
    ? calculateCircularTimeDiffSeconds(input.oddsCaptureTime, dataTimestamp)
    : 0;

  // Si los datos tienen más de 90 segundos o el desfase cuota-partido supera 60s -> STALE
  if (dataAgeSeconds > 90 || diffSecondsWithOdds > 60) {
    reasons.push(
      `Datos desactualizados (STALE): Antigüedad ${dataAgeSeconds}s (máx 90s), Desfase cuota ${diffSecondsWithOdds}s (máx 60s).`
    );
    return {
      state: 'STALE',
      canIssueBetSignal: false,
      reasons,
      dataAgeSeconds,
      diffSecondsWithOdds,
      requiresNoBet: true,
    };
  }

  // 4. Detección de SIMULATED o MANUAL
  if (input.isSampleOrSimulated) {
    reasons.push('Telemetría de muestra simulada (SIMULATED); confianza limitada.');
    return {
      state: 'SIMULATED',
      canIssueBetSignal: true,
      reasons,
      dataAgeSeconds,
      diffSecondsWithOdds,
      requiresNoBet: false,
    };
  }

  if (input.isManualData) {
    reasons.push('Datos introducidos o ajustados manualmente sin feed directo de API.');
    return {
      state: 'MANUAL',
      canIssueBetSignal: true,
      reasons,
      dataAgeSeconds,
      diffSecondsWithOdds,
      requiresNoBet: false,
    };
  }

  // 5. LIVE o RECENT
  if (dataAgeSeconds <= 60 && diffSecondsWithOdds <= 30) {
    reasons.push('Telemetría oficial en vivo y sincronizada en tiempo real.');
    return {
      state: 'LIVE',
      canIssueBetSignal: true,
      reasons,
      dataAgeSeconds,
      diffSecondsWithOdds,
      requiresNoBet: false,
    };
  }

  reasons.push('Telemetría reciente recibida dentro de la ventana de 60-90 segundos.');
  return {
    state: 'RECENT',
    canIssueBetSignal: true,
    reasons,
    dataAgeSeconds,
    diffSecondsWithOdds,
    requiresNoBet: false,
  };
}
