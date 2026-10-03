/**
 * QUANTBET EV+ V4 — MODELO IN-PLAY DINÁMICO (LIVE INTENSITY MODEL)
 * 
 * Regla Fundamental:
 * Cambios en xG, tiros totales, tiros a puerta, marcador o tarjetas rojas
 * MODIFICAN MATEMÁTICAMENTE y de forma verificable λ_local y λ_visitante.
 * 
 * El modelo no es una mera extrapolación estática de Poisson, sino un motor
 * dinámico de tasas de llegada ajustadas por telemetría real en juego.
 */

import { DataQualityState } from './dataQuality';

export interface LiveIntensityInput {
  currentMinute: number;
  remainingMinutes?: number;
  addedTimeEstimate?: number;
  // Marcador actual
  scoreHome: number;
  scoreAway: number;
  // λ pre-partido
  preMatchLambdaHome: number;
  preMatchLambdaAway: number;
  // Telemetría de xG acumulado
  liveXgHome?: number;
  liveXgAway?: number;
  // Telemetría de tiros totales
  totalShotsHome?: number;
  totalShotsAway?: number;
  // Telemetría de tiros a puerta (SoT)
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  // Posesión de balón (%)
  possessionHome?: number;
  possessionAway?: number;
  // Tarjetas rojas
  redCardsHome: number;
  redCardsAway: number;
  // Factores opcionales de expulsión (default: 0.75 y 1.15)
  redCardFactorTenMen?: number;
  redCardFactorOpponent?: number;
  // Calidad de datos previa
  dataQuality?: DataQualityState;
}

export interface LiveIntensityFactors {
  xg: { home: number; away: number; label: string };
  shots: { home: number; away: number; label: string };
  shotsOnTarget: { home: number; away: number; label: string };
  possession: { home: number; away: number; label: string };
  scoreState: { home: number; away: number; label: string };
  redCards: { home: number; away: number; label: string };
  time: { remainingMinutes: number; timeFraction: number; label: string };
}

export interface LiveIntensityResult {
  lambdaHome: number;
  lambdaAway: number;
  factors: LiveIntensityFactors;
  confidence: 'ALTA' | 'MEDIA' | 'BAJA';
  dataQuality: DataQualityState;
  explanation: string;
}

function round4(val: number): number {
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula dinámicamente las tasas λ restantes moduladas por telemetría real
 */
export function calculateLiveIntensity(input: LiveIntensityInput): LiveIntensityResult {
  const currentMinute = Math.max(0, Math.min(125, input.currentMinute));
  const addedTime = input.addedTimeEstimate ?? 4;
  const remainingMinutes =
    input.remainingMinutes !== undefined
      ? Math.max(0, input.remainingMinutes)
      : Math.max(0, 90 + addedTime - currentMinute);

  const timeFraction = remainingMinutes / 90;
  const elapsedMinutes = Math.max(1, currentMinute);
  const elapsedFraction = elapsedMinutes / 90;

  // 1. Factores de Decaimiento Temporal Base
  const baseLambdaHome = Math.max(0.05, input.preMatchLambdaHome) * timeFraction;
  const baseLambdaAway = Math.max(0.05, input.preMatchLambdaAway) * timeFraction;

  // 2. Factor xG en Vivo (Ratio entre xG real acumulado y el esperado hasta este minuto)
  // Se aplica un prior bayesiano de 0.35 goles para regularizar muestras tempranas
  let factorXgHome = 1.0;
  let factorXgAway = 1.0;
  if (input.liveXgHome !== undefined && input.liveXgHome >= 0) {
    const expectedXgSoFarHome = input.preMatchLambdaHome * elapsedFraction;
    const ratioHome = (input.liveXgHome + 0.35) / (expectedXgSoFarHome + 0.35);
    // Exponente de sensibilidad 0.35 (garantiza respuesta matemática acotada)
    factorXgHome = Math.max(0.4, Math.min(2.2, Math.pow(ratioHome, 0.35)));
  }

  if (input.liveXgAway !== undefined && input.liveXgAway >= 0) {
    const expectedXgSoFarAway = input.preMatchLambdaAway * elapsedFraction;
    const ratioAway = (input.liveXgAway + 0.35) / (expectedXgSoFarAway + 0.35);
    factorXgAway = Math.max(0.4, Math.min(2.2, Math.pow(ratioAway, 0.35)));
  }

  // 3. Factor Tiros Totales (Base de referencia esperada: ~12 tiros por partido)
  let factorShotsHome = 1.0;
  let factorShotsAway = 1.0;
  if (input.totalShotsHome !== undefined && input.totalShotsHome >= 0) {
    const expectedShotsSoFar = 12 * elapsedFraction;
    const ratio = (input.totalShotsHome + 3) / (expectedShotsSoFar + 3);
    factorShotsHome = Math.max(0.6, Math.min(1.6, Math.pow(ratio, 0.2)));
  }
  if (input.totalShotsAway !== undefined && input.totalShotsAway >= 0) {
    const expectedShotsSoFar = 12 * elapsedFraction;
    const ratio = (input.totalShotsAway + 3) / (expectedShotsSoFar + 3);
    factorShotsAway = Math.max(0.6, Math.min(1.6, Math.pow(ratio, 0.2)));
  }

  // 4. Factor Tiros a Puerta (Base de referencia esperada: ~4 tiros a puerta por partido)
  let factorSotHome = 1.0;
  let factorSotAway = 1.0;
  if (input.shotsOnTargetHome !== undefined && input.shotsOnTargetHome >= 0) {
    const expectedSotSoFar = 4 * elapsedFraction;
    const ratio = (input.shotsOnTargetHome + 1.5) / (expectedSotSoFar + 1.5);
    factorSotHome = Math.max(0.5, Math.min(1.8, Math.pow(ratio, 0.25)));
  }
  if (input.shotsOnTargetAway !== undefined && input.shotsOnTargetAway >= 0) {
    const expectedSotSoFar = 4 * elapsedFraction;
    const ratio = (input.shotsOnTargetAway + 1.5) / (expectedSotSoFar + 1.5);
    factorSotAway = Math.max(0.5, Math.min(1.8, Math.pow(ratio, 0.25)));
  }

  // 5. Factor Posesión (Sensibilidad suave del 0.4% por cada punto porcentual sobre 50%)
  let factorPossHome = 1.0;
  let factorPossAway = 1.0;
  if (input.possessionHome !== undefined && input.possessionHome > 0) {
    const possH = Math.max(10, Math.min(90, input.possessionHome));
    factorPossHome = Math.max(0.8, Math.min(1.2, 1 + (possH - 50) * 0.004));
    factorPossAway = Math.max(0.8, Math.min(1.2, 1 + (50 - possH) * 0.004));
  }

  // 6. Factor Score State (Game State / Efecto Marcador)
  // El equipo en desventaja aumenta urgencia ofensiva (+8% por gol de desventaja);
  // el equipo en ventaja reduce volumen riesgoso y protege resultado (-5% por gol).
  const goalDiff = input.scoreHome - input.scoreAway;
  let factorScoreHome = 1.0;
  let factorScoreAway = 1.0;
  if (goalDiff > 0) {
    // Local ganando
    factorScoreHome = Math.max(0.7, 1 - 0.05 * goalDiff);
    factorScoreAway = Math.min(1.4, 1 + 0.08 * goalDiff);
  } else if (goalDiff < 0) {
    // Visitante ganando
    const deficit = Math.abs(goalDiff);
    factorScoreHome = Math.min(1.4, 1 + 0.08 * deficit);
    factorScoreAway = Math.max(0.7, 1 - 0.05 * deficit);
  }

  // 7. Factor Tarjeta Roja (Protocolo cuantitativo: 0.75 diez hombres, 1.15 rival)
  const factorTenMen = input.redCardFactorTenMen ?? 0.75;
  const factorOpponent = input.redCardFactorOpponent ?? 1.15;

  let factorRedHome = 1.0;
  let factorRedAway = 1.0;
  if (input.redCardsHome > 0) {
    factorRedHome *= Math.pow(factorTenMen, input.redCardsHome);
    factorRedAway *= Math.pow(factorOpponent, input.redCardsHome);
  }
  if (input.redCardsAway > 0) {
    factorRedAway *= Math.pow(factorTenMen, input.redCardsAway);
    factorRedHome *= Math.pow(factorOpponent, input.redCardsAway);
  }

  // CÁLCULO FINAL DE LAMBDAS DINÁMICAS
  const lambdaHome = round2(
    baseLambdaHome *
      factorXgHome *
      factorShotsHome *
      factorSotHome *
      factorPossHome *
      factorScoreHome *
      factorRedHome
  );

  const lambdaAway = round2(
    baseLambdaAway *
      factorXgAway *
      factorShotsAway *
      factorSotAway *
      factorPossAway *
      factorScoreAway *
      factorRedAway
  );

  // Determinar nivel de confianza
  let confidence: 'ALTA' | 'MEDIA' | 'BAJA' = 'ALTA';
  if (input.dataQuality === 'STALE' || input.dataQuality === 'MISSING' || input.dataQuality === 'CONFLICTING') {
    confidence = 'BAJA';
  } else if (input.dataQuality === 'MANUAL' || input.dataQuality === 'SIMULATED' || currentMinute >= 80) {
    confidence = 'MEDIA';
  }

  const factors: LiveIntensityFactors = {
    xg: {
      home: round4(factorXgHome),
      away: round4(factorXgAway),
      label: `xG Index: H=${factorXgHome.toFixed(2)}x, A=${factorXgAway.toFixed(2)}x`,
    },
    shots: {
      home: round4(factorShotsHome),
      away: round4(factorShotsAway),
      label: `Volumen Tiros: H=${factorShotsHome.toFixed(2)}x, A=${factorShotsAway.toFixed(2)}x`,
    },
    shotsOnTarget: {
      home: round4(factorSotHome),
      away: round4(factorSotAway),
      label: `Peligro a Puerta: H=${factorSotHome.toFixed(2)}x, A=${factorSotAway.toFixed(2)}x`,
    },
    possession: {
      home: round4(factorPossHome),
      away: round4(factorPossAway),
      label: `Posesión: H=${factorPossHome.toFixed(2)}x, A=${factorPossAway.toFixed(2)}x`,
    },
    scoreState: {
      home: round4(factorScoreHome),
      away: round4(factorScoreAway),
      label: `Estado de Marcador (${input.scoreHome}-${input.scoreAway}): H=${factorScoreHome.toFixed(2)}x, A=${factorScoreAway.toFixed(2)}x`,
    },
    redCards: {
      home: round4(factorRedHome),
      away: round4(factorRedAway),
      label: `Tarjetas Rojas (H:${input.redCardsHome}, A:${input.redCardsAway}): H=${factorRedHome.toFixed(2)}x, A=${factorRedAway.toFixed(2)}x`,
    },
    time: {
      remainingMinutes,
      timeFraction: round4(timeFraction),
      label: `Minuto ${currentMinute}' (${remainingMinutes}' restantes / fracción ${timeFraction.toFixed(3)})`,
    },
  };

  const explanation = `λ Dinámico In-Play: Local=${lambdaHome.toFixed(2)} (base ${baseLambdaHome.toFixed(2)} × ${factorXgHome.toFixed(2)} xG × ${factorShotsHome.toFixed(2)} Tiros × ${factorSotHome.toFixed(2)} SoT × ${factorPossHome.toFixed(2)} Pos × ${factorScoreHome.toFixed(2)} GameState × ${factorRedHome.toFixed(2)} Rojas), Visita=${lambdaAway.toFixed(2)}`;

  return {
    lambdaHome: Math.max(0.01, lambdaHome),
    lambdaAway: Math.max(0.01, lambdaAway),
    factors,
    confidence,
    dataQuality: input.dataQuality || 'LIVE',
    explanation,
  };
}
