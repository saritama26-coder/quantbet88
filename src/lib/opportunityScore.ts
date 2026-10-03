/**
 * QUANTBET EV+ P0 — MOTOR DE OPPORTUNITY SCORE
 * 
 * Evalúa cuantitativamente si un partido presenta condiciones óptimas para el análisis de valor:
 * - Edge potencial (0 - 35)
 * - Calidad de datos (0 - 25)
 * - Disponibilidad de cuotas (0 - 20)
 * - Calidad de mercado / Bajo margen del bookmaker (0 - 20)
 * 
 * REGLA FUNDAMENTAL:
 * - Opportunity Score NO predice quién ganará el partido.
 * - Mide objetivamente si el partido reúne las condiciones cuantitativas de mercado e información
 *   para justificar una investigación profunda o colocación de orden.
 */

export interface OpportunityScoreInput {
  hasOdds: boolean;
  oddsCount?: number;
  bookmakerMarginPercent?: number; // Margen del mercado ej: 3.5%
  maxEvPercent?: number; // Mejor EV detectado preliminarmente
  dataQuality: 'LIVE' | 'RECENT' | 'ALTA' | 'MEDIA' | 'BAJA' | 'STALE' | 'MISSING' | 'CONFLICTING';
  hasXg: boolean;
  hasLineups: boolean;
  isLive?: boolean;
}

export interface OpportunityBreakdown {
  potentialEdge: number; // 0 - 35
  dataQualityScore: number; // 0 - 25
  oddsAvailability: number; // 0 - 20
  marketQuality: number; // 0 - 20
}

export interface OpportunityScoreResult {
  opportunityScore: number; // 0 - 100
  verdict: 'OPORTUNIDAD ALTA' | 'OPORTUNIDAD MEDIA' | 'OPORTUNIDAD BAJA' | 'DESCARTADO';
  breakdown: OpportunityBreakdown;
  explanation: string;
  flags: string[];
}

export function calculateOpportunityScore(input: OpportunityScoreInput): OpportunityScoreResult {
  const flags: string[] = [];

  // 1. Edge Potencial (0 - 35)
  let potentialEdge = 10; // Base neutra
  if (input.maxEvPercent !== undefined) {
    if (input.maxEvPercent >= 10.0) {
      potentialEdge = 35;
      flags.push('EV preliminar sobresaliente (≥ +10%)');
    } else if (input.maxEvPercent >= 5.0) {
      potentialEdge = 28;
      flags.push('EV preliminar positivo (≥ +5%)');
    } else if (input.maxEvPercent >= 2.0) {
      potentialEdge = 20;
      flags.push('EV preliminar moderado (+2% a +5%)');
    } else if (input.maxEvPercent > 0) {
      potentialEdge = 15;
    } else {
      potentialEdge = 5;
      flags.push('Sin ventaja matemática preliminar');
    }
  } else if (!input.hasOdds) {
    potentialEdge = 0;
    flags.push('Sin cuotas registradas');
  }

  // 2. Calidad de Datos (0 - 25)
  let dataQualityScore = 5;
  switch (input.dataQuality) {
    case 'LIVE':
      dataQualityScore = 25;
      flags.push('Telemetría oficial en vivo activa');
      break;
    case 'RECENT':
    case 'ALTA':
      dataQualityScore = 22;
      flags.push('Información estadística fresca');
      break;
    case 'MEDIA':
      dataQualityScore = 14;
      break;
    case 'BAJA':
      dataQualityScore = 6;
      flags.push('Datos limitados o incompletos');
      break;
    case 'STALE':
    case 'MISSING':
    case 'CONFLICTING':
      dataQualityScore = 0;
      flags.push(`Alerta de calidad de datos: ${input.dataQuality}`);
      break;
  }

  // Bonos/Penalizaciones de datos
  if (input.hasXg && dataQualityScore > 0) dataQualityScore = Math.min(25, dataQualityScore + 2);
  if (input.hasLineups && dataQualityScore > 0) dataQualityScore = Math.min(25, dataQualityScore + 2);

  // 3. Disponibilidad de Cuotas (0 - 20)
  let oddsAvailability = 0;
  if (input.hasOdds) {
    const count = input.oddsCount || 1;
    if (count >= 5) {
      oddsAvailability = 20;
      flags.push('Múltiples bookmakers disponibles para Line Shopping');
    } else if (count >= 3) {
      oddsAvailability = 16;
    } else {
      oddsAvailability = 12;
      flags.push('Cuota única capturada');
    }
  }

  // 4. Calidad del Mercado / Margen (0 - 20)
  let marketQuality = 10;
  if (input.bookmakerMarginPercent !== undefined) {
    if (input.bookmakerMarginPercent <= 3.0) {
      marketQuality = 20;
      flags.push('Margen ultra-bajo del bookmaker (≤ 3.0%)');
    } else if (input.bookmakerMarginPercent <= 5.0) {
      marketQuality = 16;
      flags.push('Margen competitivo (≤ 5.0%)');
    } else if (input.bookmakerMarginPercent <= 8.0) {
      marketQuality = 10;
    } else {
      marketQuality = 4;
      flags.push('Margen alto del bookmaker (> 8.0%)');
    }
  } else if (!input.hasOdds) {
    marketQuality = 0;
  }

  const rawScore = potentialEdge + dataQualityScore + oddsAvailability + marketQuality;
  const opportunityScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  let verdict: OpportunityScoreResult['verdict'] = 'OPORTUNIDAD BAJA';
  if (opportunityScore >= 75) {
    verdict = 'OPORTUNIDAD ALTA';
  } else if (opportunityScore >= 55) {
    verdict = 'OPORTUNIDAD MEDIA';
  } else if (opportunityScore >= 35) {
    verdict = 'OPORTUNIDAD BAJA';
  } else {
    verdict = 'DESCARTADO';
  }

  const explanation = `Score de oportunidad: ${opportunityScore}/100 [${verdict}]. Edge: ${potentialEdge}/35, Calidad de datos: ${dataQualityScore}/25, Cuotas: ${oddsAvailability}/20, Margen: ${marketQuality}/20.`;

  return {
    opportunityScore,
    verdict,
    breakdown: {
      potentialEdge,
      dataQualityScore,
      oddsAvailability,
      marketQuality,
    },
    explanation,
    flags,
  };
}
