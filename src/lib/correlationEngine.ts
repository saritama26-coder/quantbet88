/**
 * QUANTBET EV+ V4 — MOTOR DE CORRELACIÓN MULTI-MERCADO (CORRELATION ENGINE)
 * 
 * Evalúa interdependencias estocásticas entre selecciones para apuestas combinadas (Parlays):
 * - Over + BTTS (altamente correlacionados: ambos marcan implica mínimo 2 goles)
 * - Resultado + Total (ej. Victoria Local + Más de 2.5)
 * - Resultado + Hándicap (ej. Local + Local -1.5)
 * - Mercados derivados del mismo evento (1er Tiempo vs Partido Completo)
 * - Mismo partido
 * 
 * Estados obligatorios:
 * - INDEPENDENT
 * - POTENTIALLY_CORRELATED
 * - CORRELATED
 * - UNKNOWN
 * 
 * REGLA FUNDAMENTAL: UNKNOWN NUNCA debe considerarse independiente.
 * Si el estado es CORRELATED o UNKNOWN, la combinada debe ser bloqueada (NO PARLAY).
 */

export type CorrelationState =
  | 'INDEPENDENT'
  | 'POTENTIALLY_CORRELATED'
  | 'CORRELATED'
  | 'UNKNOWN';

export interface BetSelectionRef {
  id?: string;
  matchId: string;
  matchName?: string;
  market: string;
  selection: string;
  odd?: number;
}

export interface PairCorrelationResult {
  selectionA: string;
  selectionB: string;
  state: CorrelationState;
  isSafeForParlay: boolean;
  detectedRelationship: string;
  reason: string;
}

export interface ParlayCorrelationResult {
  overallState: CorrelationState;
  areAllIndependent: boolean;
  canProceed: boolean;
  pairAnalyses: PairCorrelationResult[];
  verdict: 'PERMITIR COMBINADA' | 'BLOQUEAR (CORRELACIÓN DETECTADA)' | 'BLOQUEAR (CORRELACIÓN DESCONOCIDA)';
  verdictReason: string;
}

/**
 * Normaliza nombres de mercado para categorización analítica
 */
function normalizeMarketType(market: string): '1X2' | 'TOTAL_GOALS' | 'BTTS' | 'HANDICAP' | 'HALF_TIME' | 'OTHER' {
  const m = market.toLowerCase();
  if (m.includes('1x2') || m.includes('ganador') || m.includes('moneyline') || m.includes('resultado final')) {
    return '1X2';
  }
  if (m.includes('más') || m.includes('menos') || m.includes('over') || m.includes('under') || m.includes('total')) {
    return 'TOTAL_GOALS';
  }
  if (m.includes('btts') || m.includes('ambos') || m.includes('marcan') || m.includes('both teams')) {
    return 'BTTS';
  }
  if (m.includes('handicap') || m.includes('hándicap') || m.includes('ah') || m.includes('spread')) {
    return 'HANDICAP';
  }
  if (m.includes('1t') || m.includes('primer tiempo') || m.includes('1st half') || m.includes('descanso')) {
    return 'HALF_TIME';
  }
  return 'OTHER';
}

/**
 * Evalúa la correlación entre un par de selecciones
 */
export function evaluateBetPairCorrelation(
  betA: BetSelectionRef,
  betB: BetSelectionRef
): PairCorrelationResult {
  const descA = `${betA.matchName || betA.matchId}: ${betA.market} (${betA.selection})`;
  const descB = `${betB.matchName || betB.matchId}: ${betB.market} (${betB.selection})`;

  // Si no hay matchId o está vacío -> UNKNOWN
  if (!betA.matchId || !betB.matchId || betA.matchId.trim() === '' || betB.matchId.trim() === '') {
    return {
      selectionA: descA,
      selectionB: descB,
      state: 'UNKNOWN',
      isSafeForParlay: false,
      detectedRelationship: 'DATOS DE EVENTO INCOMPLETOS',
      reason: 'No se puede determinar la relación entre eventos por falta de identificador de partido. REGLA: UNKNOWN nunca es independiente.',
    };
  }

  // 1. Partidos distintos (Independientes por definición de calendario deportivo)
  if (betA.matchId !== betB.matchId) {
    return {
      selectionA: descA,
      selectionB: descB,
      state: 'INDEPENDENT',
      isSafeForParlay: true,
      detectedRelationship: 'EVENTOS DISTINTOS',
      reason: 'Eventos deportivos independientes sin interdependencia causal directa.',
    };
  }

  // 2. Mismo partido -> Evaluar correlación por mercado específico
  const typeA = normalizeMarketType(betA.market);
  const typeB = normalizeMarketType(betB.market);

  // Mismo mercado en el mismo partido (mutuamente excluyentes o dependientes)
  if (typeA === typeB && typeA !== 'OTHER') {
    return {
      selectionA: descA,
      selectionB: descB,
      state: 'CORRELATED',
      isSafeForParlay: false,
      detectedRelationship: 'MISMO MERCADO Y EVENTO',
      reason: 'Selecciones pertenecientes al mismo mercado del mismo partido (mutuamente correlacionadas o excluyentes).',
    };
  }

  // Over/Under + Ambos Marcan (BTTS)
  if (
    (typeA === 'TOTAL_GOALS' && typeB === 'BTTS') ||
    (typeA === 'BTTS' && typeB === 'TOTAL_GOALS')
  ) {
    return {
      selectionA: descA,
      selectionB: descB,
      state: 'CORRELATED',
      isSafeForParlay: false,
      detectedRelationship: 'OVER/UNDER + BTTS',
      reason: 'Alta correlación estructural: "Ambos Marcan: Sí" implica de manera forzada un mínimo de 2 goles, alterando la distribución Poisson del total.',
    };
  }

  // Resultado (1X2) + Total de Goles
  if (
    (typeA === '1X2' && typeB === 'TOTAL_GOALS') ||
    (typeA === 'TOTAL_GOALS' && typeB === '1X2')
  ) {
    return {
      selectionA: descA,
      selectionB: descB,
      state: 'CORRELATED',
      isSafeForParlay: false,
      detectedRelationship: 'RESULTADO 1X2 + TOTAL DE GOLES',
      reason: 'Correlación táctica y de marcador: la victoria de un equipo y la línea de goles comparten la misma distribución bivariada.',
    };
  }

  // Resultado (1X2) + Hándicap
  if (
    (typeA === '1X2' && typeB === 'HANDICAP') ||
    (typeA === 'HANDICAP' && typeB === '1X2')
  ) {
    return {
      selectionA: descA,
      selectionB: descB,
      state: 'CORRELATED',
      isSafeForParlay: false,
      detectedRelationship: 'RESULTADO 1X2 + HÁNDICAP',
      reason: 'Correlación directa: las líneas de hándicap se derivan matemáticamente de la probabilidad de victoria.',
    };
  }

  // Mercados derivados (1er Tiempo vs Partido Completo)
  if (typeA === 'HALF_TIME' || typeB === 'HALF_TIME') {
    return {
      selectionA: descA,
      selectionB: descB,
      state: 'POTENTIALLY_CORRELATED',
      isSafeForParlay: false,
      detectedRelationship: 'MERCADO DERIVADO DE MEDIO TIEMPO',
      reason: 'Correlación temporal significativa: el resultado o goles del primer tiempo determinan directamente el resultado final.',
    };
  }

  // Cualquier otro mercado en el mismo partido
  return {
    selectionA: descA,
    selectionB: descB,
    state: 'CORRELATED',
    isSafeForParlay: false,
    detectedRelationship: 'MISMO PARTIDO',
    reason: 'Selecciones de un mismo partido comparten factores comunes (clima, expulsiones, árbitro, motivación y tiempo de juego).',
  };
}

/**
 * Evalúa un ticket de apuestas combinadas (Parlay) completo
 */
export function evaluateParlayCorrelation(
  selections: BetSelectionRef[]
): ParlayCorrelationResult {
  if (!selections || selections.length < 2) {
    return {
      overallState: 'INDEPENDENT',
      areAllIndependent: true,
      canProceed: true,
      pairAnalyses: [],
      verdict: 'PERMITIR COMBINADA',
      verdictReason: 'Apuesta individual o lista vacía.',
    };
  }

  const pairAnalyses: PairCorrelationResult[] = [];
  let hasCorrelated = false;
  let hasPotential = false;
  let hasUnknown = false;

  for (let i = 0; i < selections.length; i++) {
    for (let j = i + 1; j < selections.length; j++) {
      const pairResult = evaluateBetPairCorrelation(selections[i], selections[j]);
      pairAnalyses.push(pairResult);

      if (pairResult.state === 'CORRELATED') hasCorrelated = true;
      if (pairResult.state === 'POTENTIALLY_CORRELATED') hasPotential = true;
      if (pairResult.state === 'UNKNOWN') hasUnknown = true;
    }
  }

  if (hasUnknown) {
    return {
      overallState: 'UNKNOWN',
      areAllIndependent: false,
      canProceed: false,
      pairAnalyses,
      verdict: 'BLOQUEAR (CORRELACIÓN DESCONOCIDA)',
      verdictReason: 'No se puede verificar la independencia de todas las selecciones. REGLA FUNDAMENTAL: UNKNOWN nunca se asume independiente. NO PARLAY.',
    };
  }

  if (hasCorrelated) {
    return {
      overallState: 'CORRELATED',
      areAllIndependent: false,
      canProceed: false,
      pairAnalyses,
      verdict: 'BLOQUEAR (CORRELACIÓN DETECTADA)',
      verdictReason: 'Se detectaron selecciones correlacionadas (mismo partido, Over+BTTS o mercado derivado). El cálculo acumulado de margen e independencia es inválido. NO PARLAY.',
    };
  }

  if (hasPotential) {
    return {
      overallState: 'POTENTIALLY_CORRELATED',
      areAllIndependent: false,
      canProceed: false,
      pairAnalyses,
      verdict: 'BLOQUEAR (CORRELACIÓN DETECTADA)',
      verdictReason: 'Existe correlación potencial entre selecciones de mercados derivados. Se requiere independencia comprobada.',
    };
  }

  return {
    overallState: 'INDEPENDENT',
    areAllIndependent: true,
    canProceed: true,
    pairAnalyses,
    verdict: 'PERMITIR COMBINADA',
    verdictReason: 'Todas las selecciones corresponden a eventos independientes comprobados.',
  };
}
