/**
 * QUANTBET EV+ P0 — LINE SHOPPER & BEST ODDS ENGINE
 * 
 * Normaliza y compara cuotas a través de múltiples casas de apuestas (Line Shopping):
 * - Registra cuotas por bookmaker (Pinnacle, Bet365, Betfair, etc.)
 * - Detecta BEST ODDS (cuota máxima disponible por selección)
 * - Conserva todas las líneas alternativas
 * - Previene estrictamente la comparación de mercados incompatibles (Market Mismatch)
 * - Calcula el margen de la mejor línea combinada (Synthesized Line Overround)
 */

export interface RawBookmakerQuote {
  bookmaker: string;
  market: string;
  selection: string; // ej: "Local", "Empate", "Visitante" o "Over 2.5", "Under 2.5"
  odds: number;
  timestamp: string; // ISO
  source: string;
  isLive?: boolean;
}

export interface SelectionBestOdd {
  selection: string;
  bestOdds: number;
  bestBookmaker: string;
  bestSource: string;
  timestamp: string;
  quotes: Array<{
    bookmaker: string;
    odds: number;
    timestamp: string;
    source: string;
  }>;
}

export interface MarketLineShoppingResult {
  fixtureId: string | number;
  market: string;
  selections: SelectionBestOdd[];
  synthesizedOverroundPercent: number; // Margen de la mejor línea combinada
  isMarketCompatible: boolean;
  marketMismatchError?: string;
  quotesCount: number;
  bookmakersCount: number;
  timestamp: string;
}

/**
 * Normaliza el nombre del mercado para asegurar compatibilidad estricta
 */
export function normalizeMarketIdentifier(market: string): string {
  const m = market.toLowerCase().trim();
  if (m.includes('1x2') || m.includes('moneyline') || m.includes('resultado')) return '1X2';
  if (m.includes('2.5') && (m.includes('over') || m.includes('más') || m.includes('total'))) return 'TOTAL_2.5';
  if (m.includes('1.5') && (m.includes('over') || m.includes('más') || m.includes('total'))) return 'TOTAL_1.5';
  if (m.includes('3.5') && (m.includes('over') || m.includes('más') || m.includes('total'))) return 'TOTAL_3.5';
  if (m.includes('btts') || m.includes('ambos')) return 'BTTS';
  if (m.includes('dnb') || m.includes('empate apuesta')) return 'DNB';
  return market.trim();
}

/**
 * Procesa un conjunto de cotizaciones y sintetiza la mejor línea para un mercado
 */
export function performLineShopping(
  fixtureId: string | number,
  marketName: string,
  rawQuotes: RawBookmakerQuote[]
): MarketLineShoppingResult {
  const targetNormMarket = normalizeMarketIdentifier(marketName);
  const now = new Date().toISOString();

  // 1. Filtrar cotizaciones válidas y verificar compatibilidad de mercado
  const validQuotes = rawQuotes.filter((q) => {
    return q.odds > 1.0 && q.selection && q.selection.trim() !== '';
  });

  // Verificar si hay mezclas de mercados incompatibles (ej. Over 2.5 vs Over 3.5)
  const incompatible = validQuotes.find((q) => normalizeMarketIdentifier(q.market) !== targetNormMarket);
  if (incompatible) {
    return {
      fixtureId,
      market: marketName,
      selections: [],
      synthesizedOverroundPercent: 0,
      isMarketCompatible: false,
      marketMismatchError: `MARKET MISMATCH: Se intentó comparar cotizaciones de '${incompatible.market}' dentro de '${marketName}'.`,
      quotesCount: validQuotes.length,
      bookmakersCount: 0,
      timestamp: now,
    };
  }

  // 2. Agrupar por selección
  const selectionMap = new Map<string, RawBookmakerQuote[]>();
  const uniqueBookmakers = new Set<string>();

  for (const q of validQuotes) {
    uniqueBookmakers.add(q.bookmaker);
    const selKey = q.selection.trim();
    const existing = selectionMap.get(selKey) || [];
    existing.push(q);
    selectionMap.set(selKey, existing);
  }

  // 3. Determinar BEST ODDS para cada selección
  const selections: SelectionBestOdd[] = [];
  let sumInvBestOdds = 0;

  for (const [selection, quotes] of selectionMap.entries()) {
    // Ordenar de mayor a menor cuota
    quotes.sort((a, b) => b.odds - a.odds);
    const best = quotes[0];

    sumInvBestOdds += 1 / best.odds;

    selections.push({
      selection,
      bestOdds: best.odds,
      bestBookmaker: best.bookmaker,
      bestSource: best.source,
      timestamp: best.timestamp,
      quotes: quotes.map((q) => ({
        bookmaker: q.bookmaker,
        odds: q.odds,
        timestamp: q.timestamp,
        source: q.source,
      })),
    });
  }

  // 4. Calcular overround de la línea sintetizada
  const synthesizedOverroundPercent = sumInvBestOdds > 0 ? (sumInvBestOdds - 1) * 100 : 0;

  return {
    fixtureId,
    market: marketName,
    selections,
    synthesizedOverroundPercent: Math.round(synthesizedOverroundPercent * 100) / 100,
    isMarketCompatible: true,
    quotesCount: validQuotes.length,
    bookmakersCount: uniqueBookmakers.size,
    timestamp: now,
  };
}
