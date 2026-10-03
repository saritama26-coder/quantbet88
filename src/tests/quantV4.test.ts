/**
 * QUANTBET EV+ V4 — SUITE DE PRUEBAS AUTOMATIZADAS (PRIORIDAD 11)
 * 
 * Verifica matemáticamente y de forma determinística:
 * 1. Test xG: xG 0.50 -> 1.50 modifica λ_local
 * 2. Test Tiros: 6 tiros -> 18 tiros modifica la intensidad
 * 3. Test Tiros a Puerta: 1 SoT -> 7 SoT modifica el modelo
 * 4. Test Marcador: 0-0 -> 1-0 produce un ajuste diferente (Score State / Game State)
 * 5. Test Roja: Comparar sin roja vs roja local vs roja visitante
 * 6. Test Medianoche: 23:59:55 -> 00:00:05 produce exactamente 10 segundos
 * 7. Test Cuota: getLatestValidOdd selecciona la más reciente independientemente del orden
 */

import { calculateLiveIntensity, LiveIntensityInput } from '../lib/liveIntensityModel';
import {
  calculateCircularTimeDiffSeconds,
  evaluateDataQuality,
} from '../lib/dataQuality';
import {
  getLatestValidOdd,
  InPlayOddsCapture,
  InPlayMatchState,
  calculateInPlayPoisson,
} from '../lib/quantEngine';
import { evaluateParlayCorrelation } from '../lib/correlationEngine';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

export function runQuantV4Tests(): { allPassed: boolean; results: TestResult[] } {
  const results: TestResult[] = [];

  // ==========================================================================
  // TEST 1: Test xG (xG 0.50 -> 1.50 debe cambiar λ)
  // ==========================================================================
  const baseInput: LiveIntensityInput = {
    currentMinute: 60,
    scoreHome: 0,
    scoreAway: 0,
    preMatchLambdaHome: 1.5,
    preMatchLambdaAway: 1.2,
    redCardsHome: 0,
    redCardsAway: 0,
    totalShotsHome: 8,
    totalShotsAway: 8,
    shotsOnTargetHome: 3,
    shotsOnTargetAway: 3,
    possessionHome: 50,
    possessionAway: 50,
  };

  const resXgLow = calculateLiveIntensity({
    ...baseInput,
    liveXgHome: 0.5,
  });

  const resXgHigh = calculateLiveIntensity({
    ...baseInput,
    liveXgHome: 1.5,
  });

  const passedXg = resXgHigh.lambdaHome > resXgLow.lambdaHome && resXgHigh.lambdaHome !== resXgLow.lambdaHome;
  results.push({
    name: 'Test 1: Sensibilidad xG (0.50 -> 1.50)',
    passed: passedXg,
    details: `λ_local con xG 0.50 = ${resXgLow.lambdaHome.toFixed(2)}, λ_local con xG 1.50 = ${resXgHigh.lambdaHome.toFixed(2)} (Incremento: +${((resXgHigh.lambdaHome / resXgLow.lambdaHome - 1) * 100).toFixed(1)}%)`,
  });

  // ==========================================================================
  // TEST 2: Test Tiros (6 tiros -> 18 tiros debe cambiar la intensidad)
  // ==========================================================================
  const resShotsLow = calculateLiveIntensity({
    ...baseInput,
    totalShotsHome: 6,
  });

  const resShotsHigh = calculateLiveIntensity({
    ...baseInput,
    totalShotsHome: 18,
  });

  const passedShots = resShotsHigh.lambdaHome > resShotsLow.lambdaHome;
  results.push({
    name: 'Test 2: Sensibilidad Volumen de Tiros (6 -> 18 tiros)',
    passed: passedShots,
    details: `λ_local con 6 tiros = ${resShotsLow.lambdaHome.toFixed(2)}, λ_local con 18 tiros = ${resShotsHigh.lambdaHome.toFixed(2)} (Factor Tiros: ${resShotsLow.factors.shots.home}x -> ${resShotsHigh.factors.shots.home}x)`,
  });

  // ==========================================================================
  // TEST 3: Test Tiros a Puerta (1 SoT -> 7 SoT debe modificar el modelo)
  // ==========================================================================
  const resSotLow = calculateLiveIntensity({
    ...baseInput,
    shotsOnTargetHome: 1,
  });

  const resSotHigh = calculateLiveIntensity({
    ...baseInput,
    shotsOnTargetHome: 7,
  });

  const passedSot = resSotHigh.lambdaHome > resSotLow.lambdaHome;
  results.push({
    name: 'Test 3: Sensibilidad Tiros a Puerta (1 SoT -> 7 SoT)',
    passed: passedSot,
    details: `λ_local con 1 SoT = ${resSotLow.lambdaHome.toFixed(2)}, λ_local con 7 SoT = ${resSotHigh.lambdaHome.toFixed(2)} (Factor SoT: ${resSotLow.factors.shotsOnTarget.home}x -> ${resSotHigh.factors.shotsOnTarget.home}x)`,
  });

  // ==========================================================================
  // TEST 4: Test Marcador (0-0 -> 1-0 produce un ajuste diferente por Game State)
  // ==========================================================================
  const resScore00 = calculateLiveIntensity({
    ...baseInput,
    scoreHome: 0,
    scoreAway: 0,
  });

  const resScore10 = calculateLiveIntensity({
    ...baseInput,
    scoreHome: 1,
    scoreAway: 0,
  });

  // Al ir ganando 1-0, el local protege resultado (factor < 1.0) y la visita incrementa urgencia (factor > 1.0)
  const passedScore =
    resScore00.factors.scoreState.home !== resScore10.factors.scoreState.home &&
    resScore10.factors.scoreState.away > resScore00.factors.scoreState.away;

  results.push({
    name: 'Test 4: Ajuste por Estado de Marcador (0-0 -> 1-0)',
    passed: passedScore,
    details: `Con 0-0: GameState H=${resScore00.factors.scoreState.home}x, A=${resScore00.factors.scoreState.away}x | Con 1-0: GameState H=${resScore10.factors.scoreState.home}x, A=${resScore10.factors.scoreState.away}x (Visita aumenta urgencia ofensiva)`,
  });

  // ==========================================================================
  // TEST 5: Test Tarjeta Roja (sin roja vs roja local vs roja visitante)
  // ==========================================================================
  const resNoRed = calculateLiveIntensity({
    ...baseInput,
    redCardsHome: 0,
    redCardsAway: 0,
  });

  const resRedHome = calculateLiveIntensity({
    ...baseInput,
    redCardsHome: 1,
    redCardsAway: 0,
  });

  const resRedAway = calculateLiveIntensity({
    ...baseInput,
    redCardsHome: 0,
    redCardsAway: 1,
  });

  const passedRed =
    resRedHome.lambdaHome < resNoRed.lambdaHome &&
    resRedHome.lambdaAway > resNoRed.lambdaAway &&
    resRedAway.lambdaHome > resNoRed.lambdaHome &&
    resRedAway.lambdaAway < resNoRed.lambdaAway;

  results.push({
    name: 'Test 5: Impacto de Tarjeta Roja (Factores 0.75 / 1.15)',
    passed: passedRed,
    details: `Sin roja: H=${resNoRed.lambdaHome.toFixed(2)}, A=${resNoRed.lambdaAway.toFixed(2)} | Roja Local: H=${resRedHome.lambdaHome.toFixed(2)} (×0.75), A=${resRedHome.lambdaAway.toFixed(2)} (×1.15) | Roja Visita: H=${resRedAway.lambdaHome.toFixed(2)} (×1.15), A=${resRedAway.lambdaAway.toFixed(2)} (×0.75)`,
  });

  // ==========================================================================
  // TEST 6: Test Medianoche (23:59:55 -> 00:00:05 debe producir 10 segundos)
  // ==========================================================================
  const diffMidnight = calculateCircularTimeDiffSeconds('23:59:55', '00:00:05');
  const passedMidnight = diffMidnight === 10;
  results.push({
    name: 'Test 6: Diferencia Circular 24 Horas en Medianoche (23:59:55 vs 00:00:05)',
    passed: passedMidnight,
    details: `Diferencia circular calculada: ${diffMidnight} segundos (Esperado exacto: 10s)`,
  });

  // ==========================================================================
  // TEST 7: Test Cuota (getLatestValidOdd selecciona la más reciente sin importar orden)
  // ==========================================================================
  const sampleOddsArray: InPlayOddsCapture[] = [
    { id: '1', option: 'Local', odd: 1.80, captureTime: '14:20:10' },
    { id: '2', option: 'Local', odd: 1.95, captureTime: '14:22:45' }, // <--- MÁS RECIENTE
    { id: '3', option: 'Local', odd: 1.85, captureTime: '14:21:00' },
    { id: '4', option: 'Local', odd: 0.95, captureTime: '14:23:00' }, // Invalida (odd < 1)
  ];

  const latestOdd = getLatestValidOdd(sampleOddsArray);
  const passedLatestOdd = latestOdd !== null && latestOdd.id === '2' && latestOdd.captureTime === '14:22:45';
  results.push({
    name: 'Test 7: Selección de Última Cuota Válida (getLatestValidOdd)',
    passed: passedLatestOdd,
    details: `Cuota seleccionada: id=${latestOdd?.id}, odd=${latestOdd?.odd}, captureTime=${latestOdd?.captureTime} (Esperado: id=2, captureTime=14:22:45, descartando odd inválida <= 1.0)`,
  });

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

// Ejecutar inmediatamente si se invoca desde CLI con Node / tsx
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('quantV4.test')) {
  console.log('=== QUANTBET EV+ V4 SUITE DE PRUEBAS ===\n');
  const { allPassed, results } = runQuantV4Tests();
  results.forEach((r, idx) => {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.name}`);
    console.log(`       ${r.details}\n`);
  });
  console.log(`Resultado global: ${allPassed ? 'TODAS LAS PRUEBAS PASARON EXITOSAMENTE (7/7)' : 'FALLOS DETECTADOS'}`);
  process.exit(allPassed ? 0 : 1);
}
