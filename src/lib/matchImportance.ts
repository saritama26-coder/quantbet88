/**
 * QUANTBET EV+ — MOTOR DE IMPORTANCIA DE PARTIDOS (MATCH IMPORTANCE SCORE)
 * 
 * Evalúa de forma determinística la relevancia competitiva de cada evento (0 - 100):
 * - Competición (Tier 1: Champions League, Premier League, LaLiga, etc.)
 * - Fase del torneo (Final: 100, Semifinal: 90, Cuartos: 80, Fase regular: 40-60)
 * - Equipos (Clubes Tier 1, derbis y clásicos de alta rivalidad)
 * - Contexto competitivo (título, clasificación continental, descenso, etc.)
 * 
 * REGLA FUNDAMENTAL DE LA FASE RADAR:
 * SEPARAR ESTRICTAMENTE IMPORTANCIA DE VALOR (EV).
 * - importanceScore mide la relevancia del evento (para ordenar el Radar).
 * - valueScore / EV% mide la ventaja matemática frente a la cuota del bookmaker.
 * Un partido con 95/100 de importancia puede ser "NO APOSTAR".
 * Un partido con 40/100 de importancia puede tener "POSIBLE VALOR".
 */

export interface MatchImportanceInput {
  competition: string;
  country?: string;
  round?: string;
  homeTeam: string;
  awayTeam: string;
  competitiveContext?: string;
}

export interface MatchImportanceBreakdown {
  competitionWeight: number; // 0 - 35
  phaseWeight: number; // 0 - 25
  teamsWeight: number; // 0 - 25
  derbyOrRivalryBonus: number; // 0 - 15
}

export interface MatchImportanceResult {
  importanceScore: number; // 0 - 100
  tierLabel: 'TOP MUNDIAL' | 'ALTA RELEVANCIA' | 'MEDIA' | 'REGULAR';
  breakdown: MatchImportanceBreakdown;
  detectedFlags: string[];
}

// Ponderación base de competiciones internacionales y nacionales
const COMPETITION_TIERS: Record<string, number> = {
  // Champions & Conmebol Elite
  'uefa champions league': 35,
  'champions league': 35,
  'copa libertadores': 33,
  'uefa europa league': 28,
  'copa sudamericana': 25,
  'fifa world cup': 35,
  'copa america': 32,
  'uefa euro': 32,

  // Ligas Top Tier 1
  'premier league': 34,
  'laliga': 32,
  'la liga': 32,
  'serie a': 30,
  'bundesliga': 30,
  'ligapro': 26,
  'ligapro ecuador': 26,
  'liga pro': 26,
  'ligue 1': 28,
  'brasileirao': 27,
  'primera division argentina': 26,
  'eredivisie': 24,
  'primeira liga': 24,
  'mls': 22,
};

// Equipos de élite global que atraen máxima atención deportiva
const TIER_1_TEAMS = new Set([
  'real madrid', 'barcelona', 'manchester city', 'liverpool', 'arsenal',
  'bayern munich', 'bayern münchen', 'inter', 'inter milan', 'juventus',
  'ac milan', 'paris saint germain', 'psg', 'chelsea', 'manchester united',
  'atletico madrid', 'bayer leverkusen', 'borussia dortmund',
  // Ecuador & Conmebol
  'liga de quito', 'barcelona sc', 'emelec', 'independiente del valle',
  'flamengo', 'palmeiras', 'river plate', 'boca juniors'
]);

// Derbis históricos y clásicos reconocidos
const CLASSIC_MATCHUPS: Array<{ teams: [string, string]; name: string }> = [
  { teams: ['real madrid', 'barcelona'], name: 'El Clásico' },
  { teams: ['manchester city', 'liverpool'], name: 'Duelo por la Premier' },
  { teams: ['arsenal', 'chelsea'], name: 'Derbi de Londres' },
  { teams: ['arsenal', 'tottenham'], name: 'Derbi del Norte de Londres' },
  { teams: ['manchester united', 'manchester city'], name: 'Derbi de Manchester' },
  { teams: ['inter', 'juventus'], name: "Derby d'Italia" },
  { teams: ['inter', 'ac milan'], name: 'Derby della Madonnina' },
  { teams: ['real madrid', 'atletico madrid'], name: 'Derbi Madrileño' },
  { teams: ['boca juniors', 'river plate'], name: 'Superclásico' },
  { teams: ['barcelona sc', 'emelec'], name: 'Clásico del Astillero' },
  { teams: ['liga de quito', 'barcelona sc'], name: 'Clásico Nacional' },
];

/**
 * Calcula determinísticamente el Importance Score (0 a 100)
 */
export function calculateImportanceScore(input: MatchImportanceInput): MatchImportanceResult {
  const compLower = (input.competition || '').toLowerCase().trim();
  const roundLower = (input.round || '').toLowerCase().trim();
  const homeLower = (input.homeTeam || '').toLowerCase().trim();
  const awayLower = (input.awayTeam || '').toLowerCase().trim();
  const detectedFlags: string[] = [];

  // 1. Ponderación por Competición (0 - 35 pts)
  let competitionWeight = 15; // default liga estándar
  for (const [key, val] of Object.entries(COMPETITION_TIERS)) {
    if (compLower.includes(key)) {
      competitionWeight = val;
      break;
    }
  }

  // 2. Ponderación por Fase del Torneo (0 - 25 pts)
  let phaseWeight = 12; // fase regular
  if (roundLower.includes('final') && !roundLower.includes('semi') && !roundLower.includes('quarter') && !roundLower.includes('1/8')) {
    phaseWeight = 25;
    detectedFlags.push('Gran Final de Torneo');
  } else if (roundLower.includes('semi')) {
    phaseWeight = 22;
    detectedFlags.push('Semifinales');
  } else if (roundLower.includes('quarter') || roundLower.includes('cuartos')) {
    phaseWeight = 18;
    detectedFlags.push('Cuartos de Final');
  } else if (roundLower.includes('octavos') || roundLower.includes('round of 16') || roundLower.includes('1/8')) {
    phaseWeight = 16;
    detectedFlags.push('Octavos de Final');
  } else if (roundLower.includes('playoff') || roundLower.includes('relegation') || roundLower.includes('descenso')) {
    phaseWeight = 17;
    detectedFlags.push('Playoff / Descenso');
  }

  // 3. Ponderación por Nivel de Equipos (0 - 25 pts)
  let teamsWeight = 8;
  const isHomeTier1 = Array.from(TIER_1_TEAMS).some((t) => homeLower.includes(t));
  const isAwayTier1 = Array.from(TIER_1_TEAMS).some((t) => awayLower.includes(t));

  if (isHomeTier1 && isAwayTier1) {
    teamsWeight = 25;
    detectedFlags.push('Choque de Gigantes Tier 1');
  } else if (isHomeTier1 || isAwayTier1) {
    teamsWeight = 18;
    detectedFlags.push('Equipo Élite en Disputa');
  }

  // 4. Detección de Clásicos / Derbis (0 - 15 pts)
  let derbyOrRivalryBonus = 0;
  for (const classic of CLASSIC_MATCHUPS) {
    const hasA = homeLower.includes(classic.teams[0]) || awayLower.includes(classic.teams[0]);
    const hasB = homeLower.includes(classic.teams[1]) || awayLower.includes(classic.teams[1]);
    if (hasA && hasB) {
      derbyOrRivalryBonus = 15;
      detectedFlags.push(`Clásico Histórico: ${classic.name}`);
      break;
    }
  }

  // Contexto adicional si existe
  if (input.competitiveContext && input.competitiveContext.toLowerCase().includes('título')) {
    derbyOrRivalryBonus = Math.min(15, derbyOrRivalryBonus + 5);
    detectedFlags.push('En disputa directa por el Título');
  }

  const rawScore = competitionWeight + phaseWeight + teamsWeight + derbyOrRivalryBonus;
  const importanceScore = Math.max(10, Math.min(100, Math.round(rawScore)));

  let tierLabel: MatchImportanceResult['tierLabel'] = 'REGULAR';
  if (importanceScore >= 85) tierLabel = 'TOP MUNDIAL';
  else if (importanceScore >= 70) tierLabel = 'ALTA RELEVANCIA';
  else if (importanceScore >= 50) tierLabel = 'MEDIA';

  return {
    importanceScore,
    tierLabel,
    breakdown: {
      competitionWeight,
      phaseWeight,
      teamsWeight,
      derbyOrRivalryBonus,
    },
    detectedFlags,
  };
}
