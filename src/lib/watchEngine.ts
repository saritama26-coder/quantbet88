/**
 * QUANTBET EV+ P0 — WATCH ENGINE (MONITOR DE CUOTAS WAIT)
 * 
 * Gestiona selecciones en estado 'ESPERAR' (WAIT):
 * - Almacena cuota actual y cuota objetivo (Target Odds = 1 / Model Probability)
 * - Evalúa continuamente si la cuota de mercado alcanza el objetivo (TARGET REACHED)
 * - Mantiene trazabilidad de EV y timestamp
 */

export interface WatchItem {
  id: string;
  fixtureId: string | number;
  matchName: string;
  competition: string;
  market: string;
  selection: string;
  currentOdds: number;
  targetOdds: number; // Cuota mínima aceptable requerida
  modelProbability: number; // %
  currentEvPercent: number; // %
  reason: string;
  timestamp: string; // ISO
  lastCheckedTimestamp?: string;
  isTargetReached: boolean;
  notes?: string;
}

const STORAGE_WATCHLIST = 'quantbet_p0_watchlist';

/**
 * Obtiene todos los elementos en seguimiento
 */
export function getWatchlist(): WatchItem[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_WATCHLIST) : null;
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Error reading watchlist:', e);
    return [];
  }
}

/**
 * Guarda o actualiza un elemento en la Watchlist
 */
export function addToWatchlist(item: Omit<WatchItem, 'id' | 'timestamp' | 'isTargetReached'> & { id?: string }): WatchItem {
  const isTargetReached = item.currentOdds >= item.targetOdds;
  const newItem: WatchItem = {
    id: item.id || `watch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    isTargetReached,
    ...item,
  };

  try {
    const current = getWatchlist();
    // Reemplazar si ya existe para este partido, mercado y selección
    const filtered = current.filter(
      (w) => !(w.fixtureId === newItem.fixtureId && w.market === newItem.market && w.selection === newItem.selection)
    );
    const updated = [newItem, ...filtered];
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(updated));
    }
  } catch (e) {
    console.warn('Error saving to watchlist:', e);
  }

  return newItem;
}

/**
 * Remueve un elemento de la Watchlist
 */
export function removeFromWatchlist(id: string): void {
  try {
    const current = getWatchlist();
    const updated = current.filter((w) => w.id !== id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(updated));
    }
  } catch (e) {
    console.warn('Error removing from watchlist:', e);
  }
}

/**
 * Actualiza la cuota observada de un elemento y comprueba si alcanzó el objetivo
 */
export function updateWatchItemOdds(id: string, newOdds: number): WatchItem | null {
  try {
    const current = getWatchlist();
    const index = current.findIndex((w) => w.id === id);
    if (index === -1) return null;

    const item = current[index];
    item.currentOdds = newOdds;
    item.isTargetReached = newOdds >= item.targetOdds;
    item.currentEvPercent = Math.round(((item.modelProbability / 100) * newOdds - 1) * 10000) / 100;
    item.lastCheckedTimestamp = new Date().toISOString();

    current[index] = item;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(current));
    }
    return item;
  } catch (e) {
    console.warn('Error updating watch item odds:', e);
    return null;
  }
}
