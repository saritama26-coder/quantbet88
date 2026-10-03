/**
 * QuantEngine: Motor Matemático Cuantitativo de Apuestas Deportivas (EV+)
 * Cumple estrictamente con el protocolo cuantitativo:
 * - Margen proporcional
 * - Probabilidades justas
 * - Valor Esperado (EV)
 * - Cuota mínima aceptable (1 / p)
 * - 1/4 Kelly con tope del 2% (o 1% para combinadas)
 * - Reglas de Veredicto y Umbrales
 */

import { calculateLiveIntensity, LiveIntensityResult } from './liveIntensityModel';
import {
  calculateCircularTimeDiffSeconds,
  calculateDataAgeSeconds,
  evaluateDataQuality,
  DataQualityState,
  DataQualityResult,
} from './dataQuality';
import {
  evaluateParlayCorrelation,
  evaluateBetPairCorrelation,
  ParlayCorrelationResult,
} from './correlationEngine';
import {
  recordBetInLedger,
  recordModelAuditTrail,
  calculateStopLossFromLedger,
  BetLedgerEntry,
  ModelAuditTrailRecord,
} from './betLedger';

export type ConfidenceLevel = 'ALTA' | 'MEDIA' | 'BAJA';

export type VerdictType = 'APOSTAR' | 'ESPERAR' | 'NO APOSTAR';

export interface MarketOption {
  id: string;
  name: string; // ej: "Local (Arsenal)", "Empate", "Visitante (Chelsea)" o "Más de 2.5", "Menos de 2.5"
  odd: number; // Cuota decimal ofrecida por la casa (ej: 2.15)
  estimatedProb: number; // Probabilidad estimada (0 a 100%)
  justification?: string;
}

export interface OptionCalculation {
  id: string;
  name: string;
  odd: number;
  impliedProb: number; // 1 / odd (en %)
  fairProb: number; // Desmargenada proporcional (en %)
  estimatedProb: number; // Estimada (en %)
  diffFromFair: number; // Diferencia vs probabilidad justa (p_est - p_fair)
  evPercent: number; // EV = (p_est * odd - 1) * 100
  minAcceptableOdd: number; // 1 / p_est
  fullKellyFraction: number; // f = (p * odd - 1) / (odd - 1)
  suggestedStakePercent: number; // 0.25 * f, tope 2%
  suggestedStakeAmount?: number; // En dinero si hay bankroll
  confidence: ConfidenceLevel;
  verdict: VerdictType;
  verdictRule: string;
  oddsGapPercent: number; // Cuánto le falta a la cuota para llegar a la mínima
}

export interface QuantitativeMarketResult {
  sumImpliedProb: number; // S = sum(1/odd)
  houseMarginPercent: number; // (S - 1) * 100
  options: OptionCalculation[];
  overallVerdict: VerdictType;
  recommendedOption?: OptionCalculation;
  reasons: string[];
}

export interface ParlaySelection {
  id: string;
  match: string;
  market: string;
  optionName: string;
  odd: number;
  estimatedProb: number; // % (0-100)
  individualMargin: number; // Margen del mercado de esta opción (%)
  confidence: ConfidenceLevel;
  isIndependent: boolean;
  correlationNote?: string;
}

export interface ParlayResult {
  selectionsCount: number;
  combinedOdd: number;
  combinedProb: number; // %
  combinedEvPercent: number;
  cumulativeMarginPercent: number; // [PI (1 + m_i)] - 1
  minAcceptableCombinedOdd: number;
  kellyFraction: number;
  suggestedStakePercent: number; // 1/4 Kelly con tope 1.00%
  suggestedStakeAmount?: number;
  areAllIndependent: boolean;
  verdict: VerdictType;
  verdictReason: string;
}

// Redondeo exacto a 2 decimales
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula todas las métricas para un mercado completo
 */
export type KellyFractionType = '1/2' | '1/4' | '1/8';

export const KELLY_MULTIPLIERS: Record<KellyFractionType, number> = {
  '1/2': 0.5,
  '1/4': 0.25,
  '1/8': 0.125,
};

export function calculateMarketQuant(
  options: MarketOption[],
  confidence: ConfidenceLevel,
  bankroll?: number,
  pendingLineups: boolean = false,
  kellyFraction: KellyFractionType = '1/4',
  applyCap: boolean = true
): QuantitativeMarketResult {
  // 1. Suma de probabilidades implícitas
  let S = 0;
  options.forEach((opt) => {
    if (opt.odd > 1) {
      S += 1 / opt.odd;
    }
  });

  const houseMarginPercent = (S - 1) * 100;

  // Umbral mínimo según confianza:
  // ALTA: 3.00%
  // MEDIA: 5.00%
  // BAJA: Nunca apostar
  const minEvThreshold = confidence === 'ALTA' ? 3.0 : confidence === 'MEDIA' ? 5.0 : 999.0;

  const results: OptionCalculation[] = [];
  let bestEvOption: OptionCalculation | null = null;
  let hasApostar = false;
  let hasEsperar = false;
  const reasons: string[] = [];

  options.forEach((opt) => {
    const impliedProb = (1 / opt.odd) * 100;
    // Probabilidad justa proporcional = (1 / cuota) / S
    const fairProb = (1 / opt.odd / S) * 100;
    const estProbFraction = opt.estimatedProb / 100;
    const diffFromFair = opt.estimatedProb - fairProb;

    // EV = (p estimada * cuota) - 1
    const evPercent = (estProbFraction * opt.odd - 1) * 100;

    // Cuota mínima aceptable = 1 / p estimada
    const minAcceptableOdd = estProbFraction > 0 ? 1 / estProbFraction : 999;

    // Diferencia porcentual entre cuota actual y cuota mínima
    // Si cuota actual está a menos de 10% de la cuota mínima:
    // (cuota_min - cuota) / cuota <= 0.10  equivalente a cuota >= cuota_min * 0.909
    const oddsGapPercent =
      minAcceptableOdd > opt.odd
        ? ((minAcceptableOdd - opt.odd) / opt.odd) * 100
        : 0;

    // Criterio de Kelly completo: f = (p * cuota - 1) / (cuota - 1)
    let fullKelly = 0;
    if (opt.odd > 1 && estProbFraction > 0) {
      fullKelly = (estProbFraction * opt.odd - 1) / (opt.odd - 1);
    }

    // Reglas de Veredicto
    let verdict: VerdictType = 'NO APOSTAR';
    let verdictRule = 'Regla 4: No cumple condiciones de valor o confianza.';
    let suggestedStake = 0;

    if (confidence === 'BAJA') {
      verdict = 'NO APOSTAR';
      verdictRule = 'Regla 2: Con confianza BAJA nunca se apuesta (datos críticos faltantes o más de un «No puedo confirmar»).';
      suggestedStake = 0;
    } else if (evPercent >= minEvThreshold && (confidence === 'ALTA' || confidence === 'MEDIA')) {
      // Cumple umbral mínimo de EV y confianza MEDIA/ALTA
      verdict = 'APOSTAR';
      verdictRule = `Regla 1 & 2: EV (${round2(evPercent)}%) ≥ umbral mínimo (${minEvThreshold.toFixed(2)}%) con confianza ${confidence}.`;
      // Multiplicador fraccional de Kelly (1/2, 1/4 o 1/8)
      const multiplier = KELLY_MULTIPLIERS[kellyFraction] || 0.25;
      const rawFractionalStake = multiplier * fullKelly * 100;
      // Si applyCap es true, aplica tope de 2% de protocolo
      suggestedStake = applyCap
        ? Math.min(2.0, Math.max(0, rawFractionalStake))
        : Math.max(0, rawFractionalStake);
      hasApostar = true;
    } else if (
      (evPercent <= 0 || evPercent < minEvThreshold) &&
      (oddsGapPercent <= 10.0 || pendingLineups)
    ) {
      verdict = 'ESPERAR';
      verdictRule = pendingLineups
        ? 'Regla 3: Faltan alineaciones oficiales que pueden confirmarse antes del partido.'
        : `Regla 3: La cuota mínima aceptable (${round2(minAcceptableOdd)}) está a menos del 10% de la cuota actual (${round2(opt.odd)}), brecha: ${round2(oddsGapPercent)}%. Esperar mejor cuota.`;
      suggestedStake = 0;
      hasEsperar = true;
    } else {
      verdict = 'NO APOSTAR';
      verdictRule = `Regla 4: EV (${round2(evPercent)}%) insuficiente para el umbral mínimo (${minEvThreshold.toFixed(2)}%).`;
      suggestedStake = 0;
    }

    const calc: OptionCalculation = {
      id: opt.id,
      name: opt.name,
      odd: opt.odd,
      impliedProb: round2(impliedProb),
      fairProb: round2(fairProb),
      estimatedProb: round2(opt.estimatedProb),
      diffFromFair: round2(diffFromFair),
      evPercent: round2(evPercent),
      minAcceptableOdd: round2(minAcceptableOdd),
      fullKellyFraction: round2(fullKelly),
      suggestedStakePercent: round2(suggestedStake),
      suggestedStakeAmount: bankroll ? round2((suggestedStake / 100) * bankroll) : undefined,
      confidence,
      verdict,
      verdictRule,
      oddsGapPercent: round2(oddsGapPercent),
    };

    results.push(calc);

    if (!bestEvOption || calc.evPercent > bestEvOption.evPercent) {
      bestEvOption = calc;
    }
  });

  // Determinación general
  let overallVerdict: VerdictType = 'NO APOSTAR';
  if (hasApostar) {
    overallVerdict = 'APOSTAR';
    const pick = results.find((r) => r.verdict === 'APOSTAR');
    if (pick) {
      reasons.push(`Existe valor esperado positivo cuantificable en «${pick.name}» con EV de +${pick.evPercent}% (supera el umbral de ${minEvThreshold}% para confianza ${confidence}).`);
    }
  } else if (hasEsperar) {
    overallVerdict = 'ESPERAR';
    reasons.push('No hay cuota con valor suficiente en este instante, pero la brecha es menor al 10% o faltan alineaciones definitivas.');
  } else {
    overallVerdict = 'NO APOSTAR';
    reasons.push('La cuota ofrecida por la casa no supera el valor esperado positivo mínimo requerido tras desmargenar y aplicar el umbral de seguridad.');
  }

  return {
    sumImpliedProb: round2(S),
    houseMarginPercent: round2(houseMarginPercent),
    options: results,
    overallVerdict,
    recommendedOption: results.find((r) => r.verdict === 'APOSTAR') || bestEvOption || undefined,
    reasons,
  };
}

/**
 * Motor para evaluación de Apuestas Combinadas (Parlay)
 */
export function calculateParlayQuant(
  selections: ParlaySelection[],
  bankroll?: number
): ParlayResult {
  const n = selections.length;

  if (n === 0) {
    return {
      selectionsCount: 0,
      combinedOdd: 1,
      combinedProb: 0,
      combinedEvPercent: 0,
      cumulativeMarginPercent: 0,
      minAcceptableCombinedOdd: 0,
      kellyFraction: 0,
      suggestedStakePercent: 0,
      areAllIndependent: true,
      verdict: 'NO APOSTAR',
      verdictReason: 'No hay selecciones ingresadas.',
    };
  }

  // 1. Verificar si hay más de 3 selecciones
  if (n > 3) {
    return {
      selectionsCount: n,
      combinedOdd: 0,
      combinedProb: 0,
      combinedEvPercent: 0,
      cumulativeMarginPercent: 0,
      minAcceptableCombinedOdd: 0,
      kellyFraction: 0,
      suggestedStakePercent: 0,
      areAllIndependent: false,
      verdict: 'NO APOSTAR',
      verdictReason: 'Regla de combinadas: Máximo 2–3 selecciones permitidas para controlar la acumulación de márgenes y varianza.',
    };
  }

  // 2. Comprobar correlación
  const areAllIndependent = selections.every((s) => s.isIndependent);
  if (!areAllIndependent) {
    return {
      selectionsCount: n,
      combinedOdd: selections.reduce((acc, s) => acc * s.odd, 1),
      combinedProb: 0,
      combinedEvPercent: 0,
      cumulativeMarginPercent: 0,
      minAcceptableCombinedOdd: 0,
      kellyFraction: 0,
      suggestedStakePercent: 0,
      areAllIndependent: false,
      verdict: 'NO APOSTAR',
      verdictReason: 'Regla de combinadas 4: Los eventos están correlacionados (mismo partido o resultados dependientes). No se permite multiplicar probabilidades sin modelo bivariado específico. Veredicto obligatorio: NO APOSTAR.',
    };
  }

  // 3. Comprobar si cada selección tiene EV positivo individual y supera su umbral
  let allHavePositiveEv = true;
  for (const s of selections) {
    const pFrac = s.estimatedProb / 100;
    const indEv = (pFrac * s.odd - 1) * 100;
    const threshold = s.confidence === 'ALTA' ? 3.0 : s.confidence === 'MEDIA' ? 5.0 : 999;
    if (indEv < threshold || s.confidence === 'BAJA') {
      allHavePositiveEv = false;
      break;
    }
  }

  // 4. Margen acumulado = [PI (1 + m_i)] - 1
  let marginProduct = 1;
  selections.forEach((s) => {
    const mFraction = s.individualMargin / 100;
    marginProduct *= 1 + mFraction;
  });
  const cumulativeMarginPercent = (marginProduct - 1) * 100;

  // 5. Cuota combinada y probabilidad combinada
  let combinedOdd = 1;
  let combinedProbFraction = 1;
  selections.forEach((s) => {
    combinedOdd *= s.odd;
    combinedProbFraction *= s.estimatedProb / 100;
  });

  const combinedProb = combinedProbFraction * 100;

  // EV combinada = (PI p_i * PI odd_i) - 1
  const combinedEvPercent = (combinedProbFraction * combinedOdd - 1) * 100;

  // Cuota mínima combinada = 1 / PI p_i
  const minAcceptableCombinedOdd = combinedProbFraction > 0 ? 1 / combinedProbFraction : 999;

  // Kelly para combinada
  let fullKelly = 0;
  if (combinedOdd > 1 && combinedProbFraction > 0) {
    fullKelly = (combinedProbFraction * combinedOdd - 1) / (combinedOdd - 1);
  }

  // Stake de la combinada: 1/4 Kelly con tope de 1.00% del bankroll
  let suggestedStake = 0;
  let verdict: VerdictType = 'NO APOSTAR';
  let verdictReason = '';

  if (!allHavePositiveEv) {
    verdict = 'NO APOSTAR';
    verdictReason = 'Regla 1 de combinadas: Solo se combinan selecciones si CADA UNA tiene EV positivo por separado y supera su umbral mínimo de confianza.';
    suggestedStake = 0;
  } else if (combinedEvPercent > 0) {
    const quarterKelly = 0.25 * fullKelly * 100;
    suggestedStake = Math.min(1.0, Math.max(0, quarterKelly));
    verdict = 'APOSTAR';
    verdictReason = `Combinada con EV+ de ${round2(combinedEvPercent)}%. Cada selección cuenta con valor individual verificado e independencia probabilística. Tope de bankroll del 1.00% aplicado.`;
  } else {
    verdict = 'NO APOSTAR';
    verdictReason = `El EV combinado es negativo (${round2(combinedEvPercent)}%) debido al arrastre del margen acumulado de la casa (${round2(cumulativeMarginPercent)}%).`;
    suggestedStake = 0;
  }

  return {
    selectionsCount: n,
    combinedOdd: round2(combinedOdd),
    combinedProb: round2(combinedProb),
    combinedEvPercent: round2(combinedEvPercent),
    cumulativeMarginPercent: round2(cumulativeMarginPercent),
    minAcceptableCombinedOdd: round2(minAcceptableCombinedOdd),
    kellyFraction: round2(fullKelly),
    suggestedStakePercent: round2(suggestedStake),
    suggestedStakeAmount: bankroll ? round2((suggestedStake / 100) * bankroll) : undefined,
    areAllIndependent: true,
    verdict,
    verdictReason,
  };
}

/**
 * ============================================================================
 * MOTOR IN-PLAY: MODELO DETERMINÍSTICO POISSON EN VIVO
 * ============================================================================
 */

export interface InPlayMatchState {
  fixtureId?: number | string;
  homeTeam: string;
  awayTeam: string;
  currentMinute: number;
  addedTimeEstimate?: number; // minutos de descuento proyectados (default: 4)
  scoreHome: number;
  scoreAway: number;
  redCardsHome: number;
  redCardsAway: number;
  preMatchLambdaHome: number; // Goles esperados pre-partido local (ej: 1.55)
  preMatchLambdaAway: number; // Goles esperados pre-partido visitante (ej: 1.15)
  redCardFactorTenMen?: number; // Factor configurable (default: 0.75)
  redCardFactorOpponent?: number; // Factor rival configurable (default: 1.15)
  isManualData?: boolean;
  hasXgData?: boolean;
  lastEventElapsedMinute?: number; // Minuto del último gol o tarjeta roja
  lastEventDetail?: string;
  dataUpdatedTimestamp: string; // ISO o HH:mm:ss

  // PRIORIDAD 2: EXTENDER INPLAYMATCHSTATE CON TELEMETRÍA DINÁMICA COMPLETA
  liveXgHome?: number;
  liveXgAway?: number;
  totalShotsHome?: number;
  totalShotsAway?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  possessionHome?: number;
  possessionAway?: number;

  // PRIORIDAD 6: TIMESTAMPS DESACOPLADOS (La edición manual NO rejuvenece la telemetría)
  sourceUpdatedAt?: string;
  telemetryReceivedAt?: string;
  manualEditedAt?: string;
}

export interface InPlayOddsCapture {
  id: string;
  option: string;
  odd: number;
  captureTime: string; // HH:mm:ss
}

export interface InPlayPoissonProbabilities {
  remainingMinutes: number;
  lambdaRemainingHome: number;
  lambdaRemainingAway: number;
  // 1X2 Probabilidades (0-100%)
  probHomeWin: number;
  probDraw: number;
  probAwayWin: number;
  // Más/Menos Goles (0-100%)
  goalsLine: number;
  probOver: number;
  probUnder: number;
  // Ambos Marcan (0-100%)
  probBttsYes: number;
  probBttsNo: number;
  // Explicación de Fórmulas y Valores Utilizados
  formulasUsed: {
    remainingMinutesFormula: string;
    lambdaHomeFormula: string;
    lambdaAwayFormula: string;
    redCardAdjustmentLabel: string;
  };
}

export interface InPlayEvaluationResult {
  matchState: InPlayMatchState;
  marketProbabilities: InPlayPoissonProbabilities;
  quantResult: QuantitativeMarketResult;
  isStale: boolean;
  staleReason?: string;
  diffSecondsWithOdds: number;
  dataAgeSeconds: number;
  adjustedConfidence: ConfidenceLevel;
  confidenceReasons: string[];
  verdict: VerdictType;
  verdictExplanation: string;
  suggestedStakePercent: number;
  suggestedStakeAmount?: number;
  dataQuality?: DataQualityState;
}

/**
 * Función de densidad de probabilidad de Poisson P(k; λ) = (e^-λ * λ^k) / k!
 */
export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

/**
 * PRIORIDAD 1, 2 Y 3: Calcula la proyección de goles restantes conectada
 * matemáticamente con el Modelo In-Play Dinámico (calculateLiveIntensity)
 * modelada como dos procesos Poisson independientes:
 * P(X=i, Y=j) = P(X=i) * P(Y=j) (Fase 5 - Modelo Poisson)
 */
export function calculateInPlayPoisson(
  state: InPlayMatchState,
  goalsLine: number = 2.5
): InPlayPoissonProbabilities {
  // Conectar con el Modelo In-Play Dinámico (Prioridades 1, 2 y 3)
  const intensity = calculateLiveIntensity({
    currentMinute: state.currentMinute,
    addedTimeEstimate: state.addedTimeEstimate,
    scoreHome: state.scoreHome,
    scoreAway: state.scoreAway,
    preMatchLambdaHome: state.preMatchLambdaHome,
    preMatchLambdaAway: state.preMatchLambdaAway,
    liveXgHome: state.liveXgHome,
    liveXgAway: state.liveXgAway,
    totalShotsHome: state.totalShotsHome,
    totalShotsAway: state.totalShotsAway,
    shotsOnTargetHome: state.shotsOnTargetHome,
    shotsOnTargetAway: state.shotsOnTargetAway,
    possessionHome: state.possessionHome,
    possessionAway: state.possessionAway,
    redCardsHome: state.redCardsHome,
    redCardsAway: state.redCardsAway,
    redCardFactorTenMen: state.redCardFactorTenMen,
    redCardFactorOpponent: state.redCardFactorOpponent,
  });

  const remainingMinutes = intensity.factors.time.remainingMinutes;
  const lambdaHome = intensity.lambdaHome;
  const lambdaAway = intensity.lambdaAway;

  // Matriz de probabilidad Poisson bivariada para goles restantes (0 a 10 por equipo)
  const MAX_GOALS = 10;
  let sumHomeWin = 0;
  let sumDraw = 0;
  let sumAwayWin = 0;
  let sumOver = 0;
  let sumUnder = 0;
  let sumBttsYes = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    const pHomeGoals = poissonPmf(i, lambdaHome);
    for (let j = 0; j <= MAX_GOALS; j++) {
      const pAwayGoals = poissonPmf(j, lambdaAway);
      const pJoint = pHomeGoals * pAwayGoals;

      const finalHome = state.scoreHome + i;
      const finalAway = state.scoreAway + j;
      const totalGoals = finalHome + finalAway;

      // 1X2
      if (finalHome > finalAway) sumHomeWin += pJoint;
      else if (finalHome === finalAway) sumDraw += pJoint;
      else sumAwayWin += pJoint;

      // Over / Under Line
      if (totalGoals > goalsLine) sumOver += pJoint;
      else sumUnder += pJoint;

      // Ambos Marcan (BTTS)
      if (finalHome >= 1 && finalAway >= 1) sumBttsYes += pJoint;
    }
  }

  // Normalización estricta a 100.00%
  const total1x2 = sumHomeWin + sumDraw + sumAwayWin || 1;
  const probHomeWin = round2((sumHomeWin / total1x2) * 100);
  const probDraw = round2((sumDraw / total1x2) * 100);
  const probAwayWin = round2(100 - probHomeWin - probDraw);

  const totalOU = sumOver + sumUnder || 1;
  const probOver = round2((sumOver / totalOU) * 100);
  const probUnder = round2(100 - probOver);

  const probBttsYes = round2(sumBttsYes * 100);
  const probBttsNo = round2(100 - probBttsYes);

  return {
    remainingMinutes,
    lambdaRemainingHome: round2(lambdaHome),
    lambdaRemainingAway: round2(lambdaAway),
    probHomeWin,
    probDraw,
    probAwayWin,
    goalsLine,
    probOver,
    probUnder,
    probBttsYes,
    probBttsNo,
    formulasUsed: {
      remainingMinutesFormula: `minutos restantes = máx(90 + ${state.addedTimeEstimate ?? 4} − ${state.currentMinute}, 0) = ${remainingMinutes}'`,
      lambdaHomeFormula: `λ_dinámico_local = ${intensity.explanation.split(',')[0]} = ${round2(lambdaHome)}`,
      lambdaAwayFormula: `λ_dinámico_visita = ${intensity.explanation.split(',')[1] || `λ=${round2(lambdaAway)}`} = ${round2(lambdaAway)}`,
      redCardAdjustmentLabel: `[ESTIMACIÓN – parámetro de usuario]: ${intensity.factors.redCards.label}`,
    },
  };
}

/**
 * ============================================================================
 * FUNCIÓN DE MODELADO LIVE: calculateLiveProbability (Fase 5 Protocolo V2)
 * ============================================================================
 * Implementa el modelo determinístico de dos procesos Poisson independientes
 * P(X=i, Y=j) = P(X=i) * P(Y=j) para goles restantes:
 * - Considera el minuto actual y tiempo añadido estimado
 * - Aplica ajuste por expulsión: factor 0.75 (diez hombres) y 1.15 (equipo rival)
 * - Etiqueta los resultados explícitamente como [ESTIMACIÓN – parámetro de usuario]
 * - Calcula cuotas mínimas aceptables (1 / p) y Valor Esperado (EV%) para cuotas en vivo
 */

export interface LiveProbabilityInput {
  currentMinute: number;
  addedTimeEstimate?: number; // default: 4 minutos
  scoreHome: number;
  scoreAway: number;
  preMatchLambdaHome: number;
  preMatchLambdaAway: number;
  redCardsHome?: number;
  redCardsAway?: number;
  redCardFactorTenMen?: number; // default: 0.75
  redCardFactorOpponent?: number; // default: 1.15
  goalsLine?: number; // default: 2.5
  liveOdds?: {
    homeWin?: number;
    draw?: number;
    awayWin?: number;
    over?: number;
    under?: number;
    bttsYes?: number;
    bttsNo?: number;
  };
}

export interface LiveMarketOutcome {
  id: string;
  name: string;
  marketType: '1X2' | 'TOTAL_GOALS' | 'BTTS';
  estimatedProb: number; // Porcentaje (0.00% a 100.00%)
  minAcceptableOdd: number; // Cuota mínima = 1 / p
  offeredOdd?: number;
  evPercent?: number; // EV = (p * odd - 1) * 100
  hasPositiveEv: boolean;
  valueVerdict: 'VALOR EV+' | 'SIN VALOR' | 'SIN CUOTA';
  label: string; // "[ESTIMACIÓN – parámetro de usuario]"
  estimationTag: string; // "[ESTIMACIÓN – parámetro de usuario]"
}

export interface LiveProbabilityResult {
  remainingMinutes: number;
  timeFraction: number;
  adjustedLambdaHome: number;
  adjustedLambdaAway: number;
  redCardTenMenFactor: number;
  redCardOpponentFactor: number;
  goalsLine: number;
  estimationLabel: string; // "[ESTIMACIÓN – parámetro de usuario]"
  estimationTag: string; // "[ESTIMACIÓN – parámetro de usuario]"
  outcomes: {
    homeWin: LiveMarketOutcome;
    draw: LiveMarketOutcome;
    awayWin: LiveMarketOutcome;
    over: LiveMarketOutcome;
    under: LiveMarketOutcome;
    bttsYes: LiveMarketOutcome;
    bttsNo: LiveMarketOutcome;
  };
  formulasSummary: {
    remainingMinutes: string;
    lambdaHome: string;
    lambdaAway: string;
    redCardNotice: string;
  };
}

export function calculateLiveProbability(
  input: LiveProbabilityInput | InPlayMatchState,
  extraOdds?: LiveProbabilityInput['liveOdds'],
  defaultGoalsLine: number = 2.5
): LiveProbabilityResult {
  const currentMinute = Math.max(0, Math.min(120, input.currentMinute));
  const addedTime = input.addedTimeEstimate ?? 4;
  const scoreHome = Math.max(0, input.scoreHome);
  const scoreAway = Math.max(0, input.scoreAway);
  const preMatchLambdaHome = Math.max(0.1, input.preMatchLambdaHome);
  const preMatchLambdaAway = Math.max(0.1, input.preMatchLambdaAway);
  const redCardsHome = Math.max(0, input.redCardsHome ?? 0);
  const redCardsAway = Math.max(0, input.redCardsAway ?? 0);

  // Factores de tarjeta roja del protocolo cuantitativo
  const factorTenMen = input.redCardFactorTenMen ?? 0.75;
  const factorOpponent = input.redCardFactorOpponent ?? 1.15;
  const goalsLine = ('goalsLine' in input && input.goalsLine) ? input.goalsLine : defaultGoalsLine;

  const odds = extraOdds || ('liveOdds' in input ? input.liveOdds : undefined);

  // 1. Minutos restantes y fracción de partido
  const remainingMinutes = Math.max(90 + addedTime - currentMinute, 0);
  const timeFraction = remainingMinutes / 90;

  // 2. Cálculo de tasas lambda restantes con factor de expulsión
  let lambdaHome = preMatchLambdaHome * timeFraction;
  let lambdaAway = preMatchLambdaAway * timeFraction;

  if (redCardsHome > 0) {
    lambdaHome *= Math.pow(factorTenMen, redCardsHome);
    lambdaAway *= Math.pow(factorOpponent, redCardsHome);
  }
  if (redCardsAway > 0) {
    lambdaAway *= Math.pow(factorTenMen, redCardsAway);
    lambdaHome *= Math.pow(factorOpponent, redCardsAway);
  }

  // 3. Distribución Poisson bivariada para goles restantes (hasta 10 por equipo)
  const MAX_GOALS = 10;
  let sumHomeWin = 0;
  let sumDraw = 0;
  let sumAwayWin = 0;
  let sumOver = 0;
  let sumUnder = 0;
  let sumBttsYes = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    const pHomeGoals = poissonPmf(i, lambdaHome);
    for (let j = 0; j <= MAX_GOALS; j++) {
      const pAwayGoals = poissonPmf(j, lambdaAway);
      const pJoint = pHomeGoals * pAwayGoals;

      const finalHome = scoreHome + i;
      const finalAway = scoreAway + j;
      const totalGoals = finalHome + finalAway;

      // 1X2
      if (finalHome > finalAway) sumHomeWin += pJoint;
      else if (finalHome === finalAway) sumDraw += pJoint;
      else sumAwayWin += pJoint;

      // Over / Under Line
      if (totalGoals > goalsLine) sumOver += pJoint;
      else sumUnder += pJoint;

      // Ambos Marcan (BTTS)
      if (finalHome >= 1 && finalAway >= 1) sumBttsYes += pJoint;
    }
  }

  // 4. Normalización estricta a 100.00%
  const total1x2 = sumHomeWin + sumDraw + sumAwayWin || 1;
  const probHomeWin = round2((sumHomeWin / total1x2) * 100);
  const probDraw = round2((sumDraw / total1x2) * 100);
  const probAwayWin = round2(100 - probHomeWin - probDraw);

  const totalOU = sumOver + sumUnder || 1;
  const probOver = round2((sumOver / totalOU) * 100);
  const probUnder = round2(100 - probOver);

  const probBttsYes = round2(sumBttsYes * 100);
  const probBttsNo = round2(100 - probBttsYes);

  // 5. Helper para construir cada resultado con cuota mínima y EV
  const buildOutcome = (
    id: string,
    name: string,
    marketType: '1X2' | 'TOTAL_GOALS' | 'BTTS',
    probPercent: number,
    offeredOdd?: number
  ): LiveMarketOutcome => {
    const p = Math.max(0.0001, probPercent / 100);
    const minAcceptableOdd = round2(1 / p);
    let evPercent: number | undefined;
    let hasPositiveEv = false;
    let valueVerdict: LiveMarketOutcome['valueVerdict'] = 'SIN CUOTA';

    if (offeredOdd && offeredOdd > 1) {
      evPercent = round2((p * offeredOdd - 1) * 100);
      hasPositiveEv = evPercent > 0;
      valueVerdict = hasPositiveEv ? 'VALOR EV+' : 'SIN VALOR';
    }

    return {
      id,
      name,
      marketType,
      estimatedProb: probPercent,
      minAcceptableOdd,
      offeredOdd,
      evPercent,
      hasPositiveEv,
      valueVerdict,
      label: '[ESTIMACIÓN – parámetro de usuario]',
      estimationTag: '[ESTIMACIÓN – parámetro de usuario]',
    };
  };

  const outcomes = {
    homeWin: buildOutcome('1', 'Victoria Local', '1X2', probHomeWin, odds?.homeWin),
    draw: buildOutcome('X', 'Empate', '1X2', probDraw, odds?.draw),
    awayWin: buildOutcome('2', 'Victoria Visitante', '1X2', probAwayWin, odds?.awayWin),
    over: buildOutcome('over', `Más de ${goalsLine} goles`, 'TOTAL_GOALS', probOver, odds?.over),
    under: buildOutcome('under', `Menos de ${goalsLine} goles`, 'TOTAL_GOALS', probUnder, odds?.under),
    bttsYes: buildOutcome('btts_yes', 'Ambos Equipos Anotan: Sí', 'BTTS', probBttsYes, odds?.bttsYes),
    bttsNo: buildOutcome('btts_no', 'Ambos Equipos Anotan: No', 'BTTS', probBttsNo, odds?.bttsNo),
  };

  return {
    remainingMinutes,
    timeFraction: round2(timeFraction),
    adjustedLambdaHome: round2(lambdaHome),
    adjustedLambdaAway: round2(lambdaAway),
    redCardTenMenFactor: factorTenMen,
    redCardOpponentFactor: factorOpponent,
    goalsLine,
    estimationLabel: '[ESTIMACIÓN – parámetro de usuario]',
    estimationTag: '[ESTIMACIÓN – parámetro de usuario]',
    outcomes,
    formulasSummary: {
      remainingMinutes: `minutos restantes = máx(90 + ${addedTime} − ${currentMinute}, 0) = ${remainingMinutes}'`,
      lambdaHome: `λ_restante_local = ${preMatchLambdaHome.toFixed(2)} × (${remainingMinutes}/90) ${redCardsHome > 0 ? `× (${factorTenMen})^${redCardsHome}` : ''} ${redCardsAway > 0 ? `× (${factorOpponent})^${redCardsAway}` : ''} = ${round2(lambdaHome)}`,
      lambdaAway: `λ_restante_visita = ${preMatchLambdaAway.toFixed(2)} × (${remainingMinutes}/90) ${redCardsAway > 0 ? `× (${factorTenMen})^${redCardsAway}` : ''} ${redCardsHome > 0 ? `× (${factorOpponent})^${redCardsHome}` : ''} = ${round2(lambdaAway)}`,
      redCardNotice: `[ESTIMACIÓN – parámetro de usuario]: Expulsión ajusta λ con factor ×${factorTenMen.toFixed(2)} (equipo sancionado) y ×${factorOpponent.toFixed(2)} (rival)`,
    },
  };
}

/**
 * PRIORIDAD 4 & 6: Validador de frescura temporal con diferencia circular de 24 horas
 * y desacoplamiento estricto de ediciones manuales.
 * Probar 23:59:55 y 00:00:05 -> produce 10 segundos.
 */
export function checkInPlayFreshness(
  oddsCaptureTime: string, // ej "14:32:15"
  referenceTimestamp: string // Telemetry received o source timestamp (NUNCA manualEditedAt)
): { isStale: boolean; staleReason?: string; diffSeconds: number; dataAgeSeconds: number } {
  const diffSeconds = calculateCircularTimeDiffSeconds(oddsCaptureTime, referenceTimestamp);
  const dataAgeSeconds = calculateDataAgeSeconds(referenceTimestamp);

  // Regla de frescura obligatoria V4:
  // Si la diferencia circular entre la captura de la cuota y la telemetría oficial supera 60s,
  // o los datos tienen más de 90s sin refresco oficial -> STALE (forzar veredicto ESPERAR / NO BET).
  if (diffSeconds > 60) {
    return {
      isStale: true,
      staleReason: `DATOS DESACTUALIZADOS: La cuota fue capturada con un desfase circular de ${diffSeconds}s respecto a la telemetría (máx tolerado: 60s).`,
      diffSeconds,
      dataAgeSeconds,
    };
  }

  if (dataAgeSeconds > 90) {
    return {
      isStale: true,
      staleReason: `DATOS DESACTUALIZADOS: La telemetría oficial tiene ${dataAgeSeconds}s de antigüedad sin refresco de fuente (máx tolerado: 90s).`,
      diffSeconds,
      dataAgeSeconds,
    };
  }

  return {
    isStale: false,
    diffSeconds,
    dataAgeSeconds,
  };
}

/**
 * PRIORIDAD 5: Selecciona la captura válida con mayor timestamp
 * Elimina la dependencia de odds[0]. Valida cuota > 1, timestamp y mercado.
 */
export function getLatestValidOdd(
  odds: InPlayOddsCapture[],
  targetOptionOrMarket?: string
): InPlayOddsCapture | null {
  if (!odds || !Array.isArray(odds) || odds.length === 0) return null;

  const parseToSeconds = (timeStr: string): number => {
    if (!timeStr) return -1;
    if (timeStr.includes('T')) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      }
    }
    const parts = timeStr.trim().split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    const s = parseInt(parts[2] || '0', 10);
    return ((h % 24) * 3600) + ((m % 60) * 60) + (s % 60);
  };

  const valid = odds.filter((o) => {
    if (!o || typeof o.odd !== 'number' || o.odd <= 1.0) return false;
    if (!o.captureTime || typeof o.captureTime !== 'string') return false;
    if (targetOptionOrMarket) {
      const opt = (o.option || '').toLowerCase();
      const target = targetOptionOrMarket.toLowerCase();
      if (!opt.includes(target)) return false;
    }
    return true;
  });

  if (valid.length === 0) return null;

  return valid.reduce((prev, curr) => {
    const prevSec = parseToSeconds(prev.captureTime);
    const currSec = parseToSeconds(curr.captureTime);
    return currSec > prevSec ? curr : prev;
  });
}

/**
 * Evalúa el mercado en vivo aplicando el protocolo cuantitativo In-Play V4
 */
export function evaluateInPlayMarket(
  state: InPlayMatchState,
  odds: InPlayOddsCapture[],
  targetMarket: '1X2' | 'TOTAL_GOALS' | 'BTTS',
  bankroll: number = 1000,
  baseConfidence: ConfidenceLevel = 'ALTA',
  goalsLine: number = 2.5,
  thresholdAlta: number = 5.0, // Umbrales en vivo más exigentes (5% ALTA)
  thresholdMedia: number = 8.0 // (8% MEDIA)
): InPlayEvaluationResult {
  // 1. Proyecciones Poisson conectadas con el Modelo In-Play Dinámico
  const marketProbs = calculateInPlayPoisson(state, goalsLine);

  // 2. PRIORIDAD 5: Obtener la cuota más reciente con getLatestValidOdd() (NO odds[0])
  const latestValidOdd = getLatestValidOdd(odds);
  const newestCaptureTime = latestValidOdd?.captureTime || '00:00:00';

  // PRIORIDAD 6: La edición manual NO rejuvenece la telemetría (desacoplamiento de timestamps)
  const referenceTimestamp =
    state.telemetryReceivedAt || state.sourceUpdatedAt || state.dataUpdatedTimestamp;
  const freshness = checkInPlayFreshness(newestCaptureTime, referenceTimestamp);

  // 3. PRIORIDAD 7: Evaluación formal de Data Quality (LIVE, RECENT, STALE, MANUAL, SIMULATED, MISSING, CONFLICTING)
  const dataQualityAssessment = evaluateDataQuality({
    currentMinute: state.currentMinute,
    scoreHome: state.scoreHome,
    scoreAway: state.scoreAway,
    totalShotsHome: state.totalShotsHome,
    totalShotsAway: state.totalShotsAway,
    shotsOnTargetHome: state.shotsOnTargetHome,
    shotsOnTargetAway: state.shotsOnTargetAway,
    hasXgData: state.hasXgData,
    liveXgHome: state.liveXgHome,
    liveXgAway: state.liveXgAway,
    isManualData: state.isManualData,
    telemetryReceivedAt: state.telemetryReceivedAt,
    sourceUpdatedAt: state.sourceUpdatedAt,
    oddsCaptureTime: newestCaptureTime,
    oddsCount: odds.length,
  });

  // PRIORIDAD 9: Verificación de Stop-Loss desde el Bet Ledger
  const stopLossStatus = calculateStopLossFromLedger(Boolean(state.isManualData), { bankroll });

  // 4. Ajuste automático de confianza en vivo
  let adjustedConfidence: ConfidenceLevel = baseConfidence;
  const confidenceReasons: string[] = [];

  if (dataQualityAssessment.state === 'STALE' || dataQualityAssessment.state === 'MISSING' || dataQualityAssessment.state === 'CONFLICTING') {
    adjustedConfidence = 'BAJA';
    confidenceReasons.push(`[CALIDAD DE DATOS: ${dataQualityAssessment.state}]: Datos deficientes o contradictorios. Requiere NO BET.`);
  } else if (state.isManualData || dataQualityAssessment.state === 'MANUAL') {
    if (adjustedConfidence === 'ALTA') adjustedConfidence = 'MEDIA';
    confidenceReasons.push('[DATO MANUAL]: Ingreso manual sin sincronización directa de API; confianza máxima degradada a MEDIA.');
  }

  // Penalización por falta de xG
  if (!state.hasXgData && (state.liveXgHome === undefined || state.liveXgAway === undefined)) {
    if (adjustedConfidence === 'ALTA') adjustedConfidence = 'MEDIA';
    confidenceReasons.push('Sin métrica de xG en vivo reportada por la API; confianza ajustada a MEDIA.');
  }

  // Penalización por últimos 10 minutos (minuto >= 80)
  if (state.currentMinute >= 80) {
    if (adjustedConfidence === 'ALTA') adjustedConfidence = 'MEDIA';
    else if (adjustedConfidence === 'MEDIA') adjustedConfidence = 'BAJA';
    confidenceReasons.push(`Minuto ${state.currentMinute}': Partido en últimos 10 minutos. Elevada varianza y descuentos.`);
  }

  // Penalización por evento reciente (gol o roja en los últimos 2 minutos)
  if (state.lastEventElapsedMinute !== undefined) {
    const elapsedSinceEvent = state.currentMinute - state.lastEventElapsedMinute;
    if (elapsedSinceEvent >= 0 && elapsedSinceEvent <= 2) {
      adjustedConfidence = 'BAJA';
      confidenceReasons.push(`Evento crítico reciente (${state.lastEventDetail || 'Gol o Tarjeta Roja'}) en el minuto ${state.lastEventElapsedMinute}' (hace ${elapsedSinceEvent} min). Suspensión y reajuste drástico de mercado.`);
    }
  }

  // 5. Asignación de probabilidades estimadas del modelo a las opciones
  const optionsToEvaluate: MarketOption[] = odds.map((o) => {
    let est = 0;
    const optLower = o.option.toLowerCase();

    if (targetMarket === '1X2') {
      if (optLower.includes('local') || optLower.includes(state.homeTeam.toLowerCase()) || optLower === '1') {
        est = marketProbs.probHomeWin;
      } else if (optLower.includes('empate') || optLower === 'x') {
        est = marketProbs.probDraw;
      } else {
        est = marketProbs.probAwayWin;
      }
    } else if (targetMarket === 'TOTAL_GOALS') {
      if (optLower.includes('más') || optLower.includes('over') || optLower.includes('>')) {
        est = marketProbs.probOver;
      } else {
        est = marketProbs.probUnder;
      }
    } else if (targetMarket === 'BTTS') {
      if (optLower.includes('sí') || optLower.includes('si') || optLower.includes('yes')) {
        est = marketProbs.probBttsYes;
      } else {
        est = marketProbs.probBttsNo;
      }
    }

    return {
      id: o.id,
      name: o.option,
      odd: o.odd,
      estimatedProb: est,
      justification: `Poisson In-Play (${state.scoreHome}-${state.scoreAway}, ${state.currentMinute}', ${marketProbs.remainingMinutes}' rest.)`,
    };
  });

  // 6. Cálculo cuantitativo con umbrales en vivo más exigentes y tope de 1.00%
  let S = 0;
  optionsToEvaluate.forEach((opt) => {
    if (opt.odd > 1) S += 1 / opt.odd;
  });
  const houseMarginPercent = (S - 1) * 100;

  const minEvThreshold =
    adjustedConfidence === 'ALTA' ? thresholdAlta : adjustedConfidence === 'MEDIA' ? thresholdMedia : 999.0;

  const evaluatedOptions: OptionCalculation[] = [];
  let hasApostar = false;
  let hasEsperar = false;

  optionsToEvaluate.forEach((opt) => {
    const impliedProb = (1 / opt.odd) * 100;
    const fairProb = (1 / opt.odd / S) * 100;
    const estProbFraction = opt.estimatedProb / 100;
    const diffFromFair = opt.estimatedProb - fairProb;

    const evPercent = (estProbFraction * opt.odd - 1) * 100;
    const minAcceptableOdd = estProbFraction > 0 ? 1 / estProbFraction : 999;
    const oddsGapPercent =
      minAcceptableOdd > opt.odd ? ((minAcceptableOdd - opt.odd) / opt.odd) * 100 : 0;

    let fullKelly = 0;
    if (opt.odd > 1 && estProbFraction > 0) {
      fullKelly = (estProbFraction * opt.odd - 1) / (opt.odd - 1);
    }

    let verdict: VerdictType = 'NO APOSTAR';
    let verdictRule = 'Regla In-Play 4: Sin valor suficiente.';
    let suggestedStake = 0;

    if (stopLossStatus.isStopLossReached) {
      verdict = 'NO APOSTAR';
      verdictRule = stopLossStatus.stopLossReason || 'Stop-Loss diario alcanzado.';
      suggestedStake = 0;
    } else if (dataQualityAssessment.requiresNoBet) {
      verdict = 'NO APOSTAR';
      verdictRule = `Regla de calidad de datos (${dataQualityAssessment.state}): ${dataQualityAssessment.reasons.join(', ')}.`;
      suggestedStake = 0;
    } else if (freshness.isStale) {
      verdict = 'ESPERAR';
      verdictRule = `Regla de frescura circular: ${freshness.staleReason}. Se fuerza veredicto ESPERAR.`;
      suggestedStake = 0;
      hasEsperar = true;
    } else if (adjustedConfidence === 'BAJA') {
      verdict = 'NO APOSTAR';
      verdictRule = 'Regla In-Play 2: Con confianza BAJA en vivo nunca se apuesta (datos críticos desactualizados o evento reciente).';
      suggestedStake = 0;
    } else if (evPercent >= minEvThreshold && (adjustedConfidence === 'ALTA' || adjustedConfidence === 'MEDIA')) {
      verdict = 'APOSTAR';
      verdictRule = `Regla In-Play 1: EV (${round2(evPercent)}%) ≥ umbral en vivo (${minEvThreshold.toFixed(2)}%) con confianza ${adjustedConfidence}.`;
      // Stake en vivo: ¼ de Kelly con tope de 1.00% del bankroll
      const quarterKelly = 0.25 * fullKelly * 100;
      suggestedStake = Math.min(1.0, Math.max(0, quarterKelly));
      hasApostar = true;
    } else if (evPercent <= 0 && oddsGapPercent <= 10.0) {
      verdict = 'ESPERAR';
      verdictRule = `Regla In-Play 3: Cuota actual (${round2(opt.odd)}) a menos del 10% de la mínima aceptable (${round2(minAcceptableOdd)}). Esperar mejor cuota.`;
      suggestedStake = 0;
      hasEsperar = true;
    } else {
      verdict = 'NO APOSTAR';
      verdictRule = `Regla In-Play 4: EV (${round2(evPercent)}%) insuficiente para el umbral mínimo (${minEvThreshold.toFixed(2)}%).`;
      suggestedStake = 0;
    }

    evaluatedOptions.push({
      id: opt.id,
      name: opt.name,
      odd: opt.odd,
      impliedProb: round2(impliedProb),
      fairProb: round2(fairProb),
      estimatedProb: round2(opt.estimatedProb),
      diffFromFair: round2(diffFromFair),
      evPercent: round2(evPercent),
      minAcceptableOdd: round2(minAcceptableOdd),
      fullKellyFraction: round2(fullKelly),
      suggestedStakePercent: round2(suggestedStake),
      suggestedStakeAmount: bankroll ? round2((suggestedStake / 100) * bankroll) : undefined,
      confidence: adjustedConfidence,
      verdict,
      verdictRule,
      oddsGapPercent: round2(oddsGapPercent),
    });
  });

  let overallVerdict: VerdictType = 'NO APOSTAR';
  let verdictExplanation = '';

  if (stopLossStatus.isStopLossReached) {
    overallVerdict = 'NO APOSTAR';
    verdictExplanation = stopLossStatus.stopLossReason!;
  } else if (dataQualityAssessment.requiresNoBet) {
    overallVerdict = 'NO APOSTAR';
    verdictExplanation = `NO APOSTAR: Calidad de datos insuficiente (${dataQualityAssessment.state}).`;
  } else if (freshness.isStale) {
    overallVerdict = 'ESPERAR';
    verdictExplanation = freshness.staleReason!;
  } else if (hasApostar) {
    overallVerdict = 'APOSTAR';
    verdictExplanation = 'Se identificó al menos una oportunidad con Valor Esperado Positivo (EV+) superior al umbral en vivo.';
  } else if (hasEsperar) {
    overallVerdict = 'ESPERAR';
    verdictExplanation = 'Cuotas cercanas al valor justo o esperando estabilización tras evento reciente.';
  } else {
    overallVerdict = 'NO APOSTAR';
    verdictExplanation = 'Ninguna opción ofrece ventaja matemática frente a las cuotas del mercado.';
  }

  // PRIORIDAD 10: Registrar Model Audit Trail de la evaluación
  const bestOption = evaluatedOptions.find((o) => o.verdict === 'APOSTAR') || evaluatedOptions[0];
  if (bestOption) {
    recordModelAuditTrail({
      partido: `${state.homeTeam} vs ${state.awayTeam}`,
      cuota: bestOption.odd,
      xG: { home: state.liveXgHome, away: state.liveXgAway },
      xGF: state.liveXgHome ?? 0,
      xGA: state.liveXgAway ?? 0,
      tiros: { home: state.totalShotsHome, away: state.totalShotsAway },
      tirosAPuerta: { home: state.shotsOnTargetHome, away: state.shotsOnTargetAway },
      posesion: { home: state.possessionHome, away: state.possessionAway },
      marcador: { home: state.scoreHome, away: state.scoreAway },
      tarjetas: { redHome: state.redCardsHome, redAway: state.redCardsAway },
      lambdaPrepartido: { home: state.preMatchLambdaHome, away: state.preMatchLambdaAway },
      factores: {
        lambdaHome: marketProbs.lambdaRemainingHome,
        lambdaAway: marketProbs.lambdaRemainingAway,
      },
      lambdaDinamico: {
        home: marketProbs.lambdaRemainingHome,
        away: marketProbs.lambdaRemainingAway,
      },
      probabilidad: bestOption.estimatedProb,
      cuotaJusta: bestOption.minAcceptableOdd,
      ev: bestOption.evPercent,
      kelly: bestOption.fullKellyFraction,
      stake: bestOption.suggestedStakePercent,
      calidadDeDatos: dataQualityAssessment.state,
      confianza: adjustedConfidence,
      veredicto: overallVerdict,
      isDemo: Boolean(state.isManualData),
    });
  }

  return {
    matchState: state,
    marketProbabilities: marketProbs,
    quantResult: {
      sumImpliedProb: round2(S),
      houseMarginPercent: round2(houseMarginPercent),
      options: evaluatedOptions,
      overallVerdict,
      recommendedOption: evaluatedOptions.find((o) => o.verdict === 'APOSTAR'),
      reasons: confidenceReasons,
    },
    isStale: freshness.isStale,
    staleReason: freshness.staleReason,
    diffSecondsWithOdds: freshness.diffSeconds,
    dataAgeSeconds: freshness.dataAgeSeconds,
    adjustedConfidence,
    confidenceReasons,
    verdict: overallVerdict,
    verdictExplanation,
    suggestedStakePercent: evaluatedOptions.find((o) => o.verdict === 'APOSTAR')?.suggestedStakePercent ?? 0,
    suggestedStakeAmount: evaluatedOptions.find((o) => o.verdict === 'APOSTAR')?.suggestedStakeAmount ?? 0,
    dataQuality: dataQualityAssessment.state,
  };
}

