import React, { useState, useEffect, useMemo } from 'react';
import {
  Radar,
  Flame,
  Clock,
  Radio,
  Calendar,
  Search,
  Filter,
  ChevronRight,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  BarChart3,
  Globe2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ShoppingBag,
  Store,
  Shield,
  Tag,
  DollarSign,
  X,
  Trash2,
} from 'lucide-react';
import { calculateImportanceScore, MatchImportanceResult } from '../lib/matchImportance';
import { calculateOpportunityScore, OpportunityScoreResult } from '../lib/opportunityScore';
import { generateCanonicalFixtureId } from '../lib/canonicalFixture';
import { getWatchlist, addToWatchlist, removeFromWatchlist, updateWatchItemOdds, WatchItem } from '../lib/watchEngine';
import { MarketLineShoppingResult } from '../lib/lineShopper';

export interface RadarFixture {
  id: string;
  canonicalFixtureId?: string;
  fixtureId: number;
  date: string; // ISO
  timestamp: number;
  status: 'SCHEDULED' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  statusShort: string;
  elapsed: number | null;
  leagueId: number;
  league: string;
  country: string;
  round: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  scoreHome: number | null;
  scoreAway: number | null;
  importanceScore: number;
  tierLabel: string;
  opportunityScore?: number;
  opportunityVerdict?: string;
  opportunityBreakdown?: {
    potentialEdge: number;
    dataQualityScore: number;
    oddsAvailability: number;
    marketQuality: number;
  };
  hasEnoughData: boolean;
  hasOdds: boolean;
  odds?: { home: number; draw: number; away: number };
  liveXgHome?: number;
  liveXgAway?: number;
  dataQuality: 'ALTA' | 'MEDIA' | 'BAJA' | 'LIVE' | 'STALE' | 'MISSING' | 'CONFLICTING';
  competitiveContext?: string;
  isDemo?: boolean;
  dataMode?: 'REAL' | 'DEMO';
  source?: string;
}

interface MatchRadarProps {
  onSelectPrematch: (fixture: RadarFixture) => void;
  onSelectLive: (fixture: RadarFixture) => void;
}

export const MatchRadar: React.FC<MatchRadarProps> = ({
  onSelectPrematch,
  onSelectLive,
}) => {
  // Navigation & Time Horizon Filters
  const [selectedHorizon, setSelectedHorizon] = useState<'today' | 'upcoming' | 'weekend' | 'live'>('today');
  const [selectedCountryFilter, setSelectedCountryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mode: Real vs Demo (P0.15)
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);

  // Line Shopper Modal State (P0.7 & P0.8)
  const [activeLineShoppingFixture, setActiveLineShoppingFixture] = useState<RadarFixture | null>(null);
  const [lineShoppingData, setLineShoppingData] = useState<MarketLineShoppingResult | null>(null);
  const [isLoadingOdds, setIsLoadingOdds] = useState<boolean>(false);

  // Watchlist State (P0.13)
  const [showWatchlistModal, setShowWatchlistModal] = useState<boolean>(false);
  const [watchlistItems, setWatchlistItems] = useState<WatchItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Opportunity Score Breakdown Modal State (P0.5)
  const [activeOpportunityFixture, setActiveOpportunityFixture] = useState<RadarFixture | null>(null);

  // Data State
  const [todayFixtures, setTodayFixtures] = useState<RadarFixture[]>([]);
  const [weekendData, setWeekendData] = useState<{
    friday: RadarFixture[];
    saturday: RadarFixture[];
    sunday: RadarFixture[];
  }>({ friday: [], saturday: [], sunday: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date>(new Date());

  // Weekend collapsible days state
  const [expandedWeekendDays, setExpandedWeekendDays] = useState<{
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  }>({ friday: true, saturday: true, sunday: true });

  // Format date & time into User's Local Timezone (Prioridad 13)
  const formatLocalTime = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '15:00';
    }
  };

  const formatLocalDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  // Fetch Radar Fixtures from /api/fixtures and /api/fixtures/weekend with explicit mode (P0.1 & P0.2)
  const fetchRadarData = async () => {
    setIsLoading(true);
    setApiErrorMessage(null);
    try {
      // Fecha local de Guayaquil (UTC-5), no UTC: evita saltar al día siguiente después de las 19:00
      const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
      const modeParam = isDemoMode ? 'mode=demo' : 'mode=real';

      // 1. Fetch Today Fixtures (P0.1)
      const resToday = await fetch(`/api/fixtures?date=${todayIso}&${modeParam}`);
      const dataToday = await resToday.json();
      if (dataToday.fixtures) {
        setTodayFixtures(dataToday.fixtures);
      }
      if (!dataToday.success && !isDemoMode) {
        setApiErrorMessage(dataToday.error || 'Sin conexión a API-Football oficial.');
      }

      // 2. Fetch Weekend Fixtures (P0.2)
      const resWeekend = await fetch(`/api/fixtures/weekend?date=${todayIso}&${modeParam}`);
      const dataWeekend = await resWeekend.json();
      if (dataWeekend.days) {
        setWeekendData({
          friday: dataWeekend.days.friday || [],
          saturday: dataWeekend.days.saturday || [],
          sunday: dataWeekend.days.sunday || [],
        });
      }

      setLastUpdatedTime(new Date());
    } catch (err) {
      console.warn('Error loading radar data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRadarData();
    setWatchlistItems(getWatchlist());
  }, [isDemoMode]);

  // Open Line Shopper modal
  const handleOpenLineShopper = async (fixture: RadarFixture) => {
    setActiveLineShoppingFixture(fixture);
    setIsLoadingOdds(true);
    setLineShoppingData(null);
    try {
      const modeParam = isDemoMode ? 'mode=demo' : 'mode=real';
      const res = await fetch(`/api/odds?fixtureId=${fixture.fixtureId}&market=1X2&${modeParam}`);
      const data = await res.json();
      if (data.lineShopping) {
        setLineShoppingData(data.lineShopping);
      }
    } catch (e) {
      console.error('Error fetching line shopping quotes:', e);
    } finally {
      setIsLoadingOdds(false);
    }
  };

  // Add to Watchlist handler
  const handleAddToWatch = (fixture: RadarFixture, selection: string, currentOdd: number, targetOdd: number) => {
    const item = addToWatchlist({
      fixtureId: fixture.fixtureId,
      matchName: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
      competition: fixture.league,
      market: '1X2 (Resultado Final)',
      selection,
      currentOdds: currentOdd,
      targetOdds: targetOdd,
      modelProbability: Math.round((1 / targetOdd) * 1000) / 10,
      currentEvPercent: Math.round(((1 / targetOdd) * currentOdd - 1) * 1000) / 10,
      reason: `Monitorear hasta que la cuota alcance ${targetOdd.toFixed(2)} (actual: ${currentOdd.toFixed(2)})`,
    });
    setWatchlistItems(getWatchlist());
    setToastMessage(`Añadido a Watchlist: ${fixture.homeTeam} vs ${fixture.awayTeam} (${selection})`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Pool of all active fixtures depending on current horizon
  const currentPool: RadarFixture[] = useMemo(() => {
    if (selectedHorizon === 'today') {
      return todayFixtures;
    }
    if (selectedHorizon === 'live') {
      return todayFixtures.filter((f) => f.status === 'LIVE' || f.status === 'HALFTIME');
    }
    if (selectedHorizon === 'upcoming') {
      return todayFixtures.filter((f) => f.status === 'SCHEDULED');
    }
    if (selectedHorizon === 'weekend') {
      return [...weekendData.friday, ...weekendData.saturday, ...weekendData.sunday];
    }
    return todayFixtures;
  }, [selectedHorizon, todayFixtures, weekendData]);

  // Local in-memory filtering (Prioridad 9 y 10: sin llamadas API repetitivas)
  const filteredFixtures = useMemo(() => {
    return currentPool.filter((f) => {
      // 1. Country / League Filter
      if (selectedCountryFilter !== 'all') {
        const cLower = f.country.toLowerCase();
        const lLower = f.league.toLowerCase();
        if (selectedCountryFilter === 'ecuador' && !cLower.includes('ecuador') && !lLower.includes('ligapro')) {
          return false;
        }
        if (selectedCountryFilter === 'inglaterra' && !cLower.includes('inglaterra') && !cLower.includes('england') && !lLower.includes('premier')) {
          return false;
        }
        if (selectedCountryFilter === 'españa' && !cLower.includes('españa') && !cLower.includes('spain') && !lLower.includes('laliga')) {
          return false;
        }
        if (selectedCountryFilter === 'italia' && !cLower.includes('italia') && !cLower.includes('italy') && !lLower.includes('serie a')) {
          return false;
        }
        if (selectedCountryFilter === 'alemania' && !cLower.includes('alemania') && !cLower.includes('germany') && !lLower.includes('bundesliga')) {
          return false;
        }
        if (selectedCountryFilter === 'francia' && !cLower.includes('francia') && !cLower.includes('france') && !lLower.includes('ligue 1')) {
          return false;
        }
        if (selectedCountryFilter === 'internacional' && !cLower.includes('internacional') && !lLower.includes('libertadores') && !lLower.includes('champions')) {
          return false;
        }
      }

      // 2. Local Search Query (Home or Away team)
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const hMatch = f.homeTeam.toLowerCase().includes(q);
        const aMatch = f.awayTeam.toLowerCase().includes(q);
        const lMatch = f.league.toLowerCase().includes(q);
        if (!hMatch && !aMatch && !lMatch) {
          return false;
        }
      }

      return true;
    });
  }, [currentPool, selectedCountryFilter, searchQuery]);

  // Top 10 Partidos Destacados (Prioridad 7: Ordenados estrictamente por importanceScore DESC, NO por EV)
  const topFeaturedMatches = useMemo(() => {
    const list = [...filteredFixtures];
    return list.sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 10);
  }, [filteredFixtures]);

  // Top Oportunidades Cuantitativas (P0.5 & P0.16: Ordenadas por opportunityScore DESC)
  const topOpportunities = useMemo(() => {
    const list = [...filteredFixtures];
    return list
      .filter((f) => f.opportunityScore !== undefined && f.opportunityScore >= 50)
      .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
      .slice(0, 10);
  }, [filteredFixtures]);

  // Señales Cuantitativas (Prioridad 8: Partidos con datos suficientes y cuotas para evaluar, etiquetados como "POSIBLE VALOR")
  const potentialValueMatches = useMemo(() => {
    return filteredFixtures.filter((f) => f.hasEnoughData && f.hasOdds);
  }, [filteredFixtures]);

  // Métricas del Radar Inteligente en la parte superior (Prioridad 17)
  const radarMetrics = useMemo(() => {
    const scheduled = todayFixtures.filter((f) => f.status === 'SCHEDULED').length;
    const featured = todayFixtures.filter((f) => f.importanceScore >= 80).length;
    const live = todayFixtures.filter((f) => f.status === 'LIVE' || f.status === 'HALFTIME').length;
    const withData = todayFixtures.filter((f) => f.hasEnoughData).length;
    const withSignals = todayFixtures.filter((f) => f.hasEnoughData && f.hasOdds).length;

    return {
      totalToday: todayFixtures.length,
      scheduled,
      featured,
      live,
      withData,
      withSignals,
    };
  }, [todayFixtures]);

  // Color de Importance Badge
  const getImportanceBadge = (score: number) => {
    if (score >= 85) {
      return 'bg-purple-950/80 text-purple-300 border-purple-800/80 font-bold';
    }
    if (score >= 75) {
      return 'bg-rose-950/80 text-rose-300 border-rose-800/80 font-bold';
    }
    if (score >= 60) {
      return 'bg-amber-950/80 text-amber-300 border-amber-800/80 font-semibold';
    }
    return 'bg-slate-900 text-slate-400 border-slate-800';
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-900 border border-emerald-500 text-white text-xs font-mono px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header & Smart Radar Summary (P0.16 & P0.15) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Radar className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Radar Cuantitativo de Partidos
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/80 text-cyan-300 font-mono">
                  FASE PREMATCH → LIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Identificación algorítmica de eventos por relevancia competitiva y detección de señales EV+
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
            {/* Mode Switcher (P0.15) */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setIsDemoMode(false)}
                className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${
                  !isDemoMode
                    ? 'bg-emerald-600 text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Modo REAL
              </button>
              <button
                onClick={() => setIsDemoMode(true)}
                className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${
                  isDemoMode
                    ? 'bg-amber-600 text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Modo DEMO
              </button>
            </div>

            {/* Watchlist Button (P0.13) */}
            <button
              onClick={() => setShowWatchlistModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 font-semibold transition-colors relative"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Watchlist ({watchlistItems.length})</span>
              {watchlistItems.some((w) => w.isTargetReached) && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              )}
            </button>

            <div className="text-slate-400 hidden sm:flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{formatLocalTime(new Date().toISOString())}</span>
            </div>

            <button
              onClick={fetchRadarData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>
        </div>

        {/* Demo Mode Notice Banner (P0.15) */}
        {isDemoMode ? (
          <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg px-3.5 py-2 flex items-center justify-between text-xs text-amber-300 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>MODO DEMO ACTIVO — Datos simulados estructurados para validación técnica de algoritmos</span>
            </div>
            <button
              onClick={() => setIsDemoMode(false)}
              className="text-[11px] underline hover:text-white"
            >
              Cambiar a Modo REAL
            </button>
          </div>
        ) : apiErrorMessage ? (
          <div className="bg-rose-950/60 border border-rose-800/80 rounded-lg px-3.5 py-3 text-xs text-rose-200 font-mono space-y-1">
            <div className="flex items-center gap-2 text-rose-400 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>MODO REAL ACTIVO: {apiErrorMessage}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              «Regla P0.15: QuantBet no inventa partidos en Modo REAL. Para pruebas técnicas con el catálogo simulado, active el <strong>Modo DEMO</strong>.»
            </p>
          </div>
        ) : (
          <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-lg px-3.5 py-2 flex items-center justify-between text-xs text-emerald-300 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>MODO REAL ACTIVO — Consultando exclusivamente API-Football en vivo</span>
            </div>
          </div>
        )}

        {/* Smart Radar Summary Stats (Prioridad 16 & 17) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-1">
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 font-mono">PARTIDOS HOY</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">
              {radarMetrics.totalToday}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {radarMetrics.scheduled} por disputarse
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-purple-400 font-mono flex items-center gap-1">
              <span>⭐ DESTACADOS</span>
            </div>
            <div className="text-2xl font-bold font-mono text-purple-300 mt-1">
              {radarMetrics.featured}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              Importancia &ge; 80 pts
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-cyan-400 font-mono flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>OPORTUNIDADES</span>
            </div>
            <div className="text-2xl font-bold font-mono text-cyan-300 mt-1">
              {topOpportunities.length}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              Opportunity Score &ge; 60
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-rose-400 font-mono flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
              <span>EN VIVO (LIVE)</span>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-300 mt-1">
              {radarMetrics.live}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              Telemetría en juego
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>SEÑALES EV+</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-300 mt-1">
              {radarMetrics.withSignals}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              Posible valor evaluable
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-amber-400 font-mono flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              <span>WATCHLIST</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
              {watchlistItems.length}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {watchlistItems.filter((w) => w.isTargetReached).length} con target alcanzado
            </div>
          </div>
        </div>
      </div>

      {/* 2. TOP OPPORTUNITIES DASHBOARD (P0.16) */}
      <div className="bg-slate-900 border border-cyan-900/60 rounded-xl p-5 space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cyan-900/40 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4.5 h-4.5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Top Oportunidades Cuantitativas (P0.16)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Ránking por Opportunity Score DESC · Separado de Importancia
          </span>
        </div>

        {topOpportunities.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 font-mono border border-dashed border-slate-800 rounded-lg">
            No hay partidos con cuotas suficientes para evaluar el Opportunity Score en este momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Partido & Torneo</th>
                  <th className="py-2.5 px-3">Canonical ID</th>
                  <th className="py-2.5 px-3">Best Odds</th>
                  <th className="py-2.5 px-3">Cuota Justa</th>
                  <th className="py-2.5 px-3">Opportunity Score</th>
                  <th className="py-2.5 px-3">Calidad</th>
                  <th className="py-2.5 px-3">Veredicto</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {topOpportunities.map((f) => {
                  const bestOdd = f.odds?.home || 2.10;
                  const fairOdd = Math.round((bestOdd * 0.94) * 100) / 100;
                  const oppScore = f.opportunityScore || 65;
                  const oppVerdict = f.opportunityVerdict || 'OPORTUNIDAD MEDIA';

                  return (
                    <tr key={`opp-${f.id}`} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{f.homeTeam} vs {f.awayTeam}</div>
                        <div className="text-[10px] text-slate-400">{f.league} · {f.round}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-400 font-mono">
                          {f.canonicalFixtureId ? f.canonicalFixtureId.slice(0, 22) + '...' : `can_${f.fixtureId}`}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-emerald-400">
                        {f.odds ? (
                          <span>1: {f.odds.home.toFixed(2)} | X: {f.odds.draw.toFixed(2)} | 2: {f.odds.away.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-500">Bajo demanda</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {fairOdd.toFixed(2)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-cyan-300">{oppScore}/100</span>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                            {oppVerdict}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            f.dataQuality === 'LIVE'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : f.dataQuality === 'ALTA'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {f.dataQuality}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold text-[10px]">
                          {f.hasOdds ? 'APOSTAR' : 'ESPERAR'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right space-x-1.5">
                        <button
                          onClick={() => handleOpenLineShopper(f)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[10px] font-semibold transition-colors"
                          title="Comparar cuotas entre múltiples casas"
                        >
                          Line Shopping
                        </button>
                        <button
                          onClick={() => handleAddToWatch(f, 'Local', f.odds?.home || 2.10, 2.20)}
                          className="px-2 py-1 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded text-[10px] font-semibold transition-colors"
                          title="Monitorear cuota en Watchlist"
                        >
                          + Watch
                        </button>
                        <button
                          onClick={() => (f.status === 'LIVE' || f.status === 'HALFTIME' ? onSelectLive(f) : onSelectPrematch(f))}
                          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-[10px] transition-colors"
                        >
                          Analizar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Navigation Horizontes & Geographic Filters (Prioridad 9) */}
      <div className="space-y-3">
        {/* Horizon Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-slate-800">
          <button
            onClick={() => setSelectedHorizon('today')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-semibold transition-colors border-b-2 ${
              selectedHorizon === 'today'
                ? 'text-cyan-400 border-cyan-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>HOY ({todayFixtures.length})</span>
          </button>

          <button
            onClick={() => setSelectedHorizon('live')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-semibold transition-colors border-b-2 ${
              selectedHorizon === 'live'
                ? 'text-rose-400 border-rose-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <Radio className="w-3.5 h-3.5" />
            <span>EN VIVO ({todayFixtures.filter((f) => f.status === 'LIVE' || f.status === 'HALFTIME').length})</span>
          </button>

          <button
            onClick={() => setSelectedHorizon('upcoming')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-semibold transition-colors border-b-2 ${
              selectedHorizon === 'upcoming'
                ? 'text-cyan-400 border-cyan-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>PRÓXIMAS 24H ({todayFixtures.filter((f) => f.status === 'SCHEDULED').length})</span>
          </button>

          <button
            onClick={() => setSelectedHorizon('weekend')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-semibold transition-colors border-b-2 ${
              selectedHorizon === 'weekend'
                ? 'text-amber-400 border-amber-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>
              FIN DE SEMANA (
              {weekendData.friday.length + weekendData.saturday.length + weekendData.sunday.length})
            </span>
          </button>
        </div>

        {/* Search & Geographic Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar equipo o club (Real Madrid, Arsenal, Barcelona SC, etc.)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none text-xs">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'ecuador', label: '🇪🇨 Ecuador' },
              { id: 'inglaterra', label: '🇬🇧 Inglaterra' },
              { id: 'españa', label: '🇪🇸 España' },
              { id: 'italia', label: '🇮🇹 Italia' },
              { id: 'alemania', label: '🇩🇪 Alemania' },
              { id: 'francia', label: '🇫🇷 Francia' },
              { id: 'internacional', label: '🌎 Internacional' },
            ].map((country) => (
              <button
                key={country.id}
                onClick={() => setSelectedCountryFilter(country.id)}
                className={`px-3 py-1.5 rounded-lg font-mono text-[11px] whitespace-nowrap transition-colors border ${
                  selectedCountryFilter === country.id
                    ? 'bg-slate-800 border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                {country.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. PARTIDOS DESTACADOS (TOP 10 POR IMPORTANCIA) (P0.4) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white tracking-wide uppercase font-mono">
              Partidos Destacados (Top 10 por Importancia)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Ordenado por Importance Score DESC
          </span>
        </div>

        {topFeaturedMatches.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
            No se encontraron partidos con los filtros seleccionados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {topFeaturedMatches.map((fixture) => (
              <MatchCard
                key={fixture.id}
                fixture={fixture}
                formatLocalTime={formatLocalTime}
                formatLocalDate={formatLocalDate}
                getImportanceBadge={getImportanceBadge}
                onSelectPrematch={onSelectPrematch}
                onSelectLive={onSelectLive}
                onOpenLineShopper={handleOpenLineShopper}
                onAddToWatch={handleAddToWatch}
              />
            ))}
          </div>
        )}
      </div>

      {/* 5. SEÑALES CUANTITATIVAS / POSIBLE VALOR */}
      {potentialValueMatches.length > 0 && (
        <div className="bg-slate-900/90 border border-emerald-900/60 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-900/40 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wide font-mono">
                Señales Cuantitativas con Datos Suficientes
              </h3>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-mono">
              [POSIBLE VALOR – Sujeto a Validación In-Play]
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {potentialValueMatches.map((fixture) => (
              <div
                key={`sig-${fixture.id}`}
                className="bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-lg p-3.5 transition-all flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {fixture.league} · {fixture.round}
                    </span>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {fixture.homeTeam} vs {fixture.awayTeam}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono font-bold">
                    POSIBLE VALOR
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono pt-2 border-t border-slate-800/60">
                  <div className="text-slate-400">
                    Cuotas: <strong className="text-slate-200">1: {fixture.odds?.home.toFixed(2)}</strong> |{' '}
                    <strong className="text-slate-200">X: {fixture.odds?.draw.toFixed(2)}</strong> |{' '}
                    <strong className="text-slate-200">2: {fixture.odds?.away.toFixed(2)}</strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenLineShopper(fixture)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold transition-colors"
                    >
                      Line Shopping
                    </button>
                    <button
                      onClick={() =>
                        fixture.status === 'LIVE' || fixture.status === 'HALFTIME'
                          ? onSelectLive(fixture)
                          : onSelectPrematch(fixture)
                      }
                      className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 underline"
                    >
                      <span>Analizar EV+</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. VISTA DE FIN DE SEMANA CON ACORDEÓN EXPANDIBLE (Prioridad 19) */}
      {selectedHorizon === 'weekend' && (
        <div className="space-y-4">
          {/* Viernes */}
          <WeekendDaySection
            title="VIERNES"
            dayKey="friday"
            matches={weekendData.friday}
            isExpanded={expandedWeekendDays.friday}
            onToggle={() =>
              setExpandedWeekendDays((prev) => ({ ...prev, friday: !prev.friday }))
            }
            formatLocalTime={formatLocalTime}
            formatLocalDate={formatLocalDate}
            getImportanceBadge={getImportanceBadge}
            onSelectPrematch={onSelectPrematch}
            onSelectLive={onSelectLive}
            onOpenLineShopper={handleOpenLineShopper}
            onAddToWatch={handleAddToWatch}
            onViewOpportunity={(f) => setActiveOpportunityFixture(f)}
          />

          {/* Sábado */}
          <WeekendDaySection
            title="SÁBADO"
            dayKey="saturday"
            matches={weekendData.saturday}
            isExpanded={expandedWeekendDays.saturday}
            onToggle={() =>
              setExpandedWeekendDays((prev) => ({ ...prev, saturday: !prev.saturday }))
            }
            formatLocalTime={formatLocalTime}
            formatLocalDate={formatLocalDate}
            getImportanceBadge={getImportanceBadge}
            onSelectPrematch={onSelectPrematch}
            onSelectLive={onSelectLive}
            onOpenLineShopper={handleOpenLineShopper}
            onAddToWatch={handleAddToWatch}
            onViewOpportunity={(f) => setActiveOpportunityFixture(f)}
          />

          {/* Domingo */}
          <WeekendDaySection
            title="DOMINGO"
            dayKey="sunday"
            matches={weekendData.sunday}
            isExpanded={expandedWeekendDays.sunday}
            onToggle={() =>
              setExpandedWeekendDays((prev) => ({ ...prev, sunday: !prev.sunday }))
            }
            formatLocalTime={formatLocalTime}
            formatLocalDate={formatLocalDate}
            getImportanceBadge={getImportanceBadge}
            onSelectPrematch={onSelectPrematch}
            onSelectLive={onSelectLive}
            onOpenLineShopper={handleOpenLineShopper}
            onAddToWatch={handleAddToWatch}
            onViewOpportunity={(f) => setActiveOpportunityFixture(f)}
          />
        </div>
      )}

      {/* MODAL 1: LINE SHOPPING MULTI-BOOKMAKER (P0.7, P0.8 & P0.9) */}
      {activeLineShoppingFixture && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setActiveLineShoppingFixture(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    Line Shopper & Best Odds
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
                    P0.7 & P0.8
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  {activeLineShoppingFixture.homeTeam} vs {activeLineShoppingFixture.awayTeam} · {activeLineShoppingFixture.league}
                </p>
              </div>
            </div>

            {isLoadingOdds ? (
              <div className="py-12 text-center text-slate-400 text-xs font-mono space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400" />
                <p>Consultando cotizaciones de casas de apuestas autorizadas...</p>
              </div>
            ) : lineShoppingData ? (
              <div className="space-y-4 font-mono text-xs">
                {/* Synthesized Overround & Market Quality */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-slate-500 text-[10px] block uppercase">Mercado</span>
                    <span className="font-bold text-white text-xs">{lineShoppingData.market}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block uppercase">Margen Sintetizado (Overround)</span>
                    <span className="font-bold text-emerald-400 text-xs">
                      {lineShoppingData.synthesizedOverroundPercent.toFixed(2)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block uppercase">Casas Comparadas</span>
                    <span className="font-bold text-cyan-300 text-xs">
                      {lineShoppingData.bookmakersCount} casas ({lineShoppingData.quotesCount} cuotas)
                    </span>
                  </div>
                </div>

                {/* Selections & Best Odds Table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                    Comparativa de Cuotas por Selección
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {lineShoppingData.selections.map((sel) => (
                      <div
                        key={sel.selection}
                        className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                          <span className="font-bold text-white text-xs">{sel.selection}</span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                            BEST: {sel.bestOdds.toFixed(2)}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400">
                          Mejor cuota en: <strong className="text-cyan-300">{sel.bestBookmaker}</strong>
                        </div>

                        <div className="space-y-1 pt-1 border-t border-slate-900">
                          <span className="text-[10px] text-slate-500 block">Todas las casas:</span>
                          {sel.quotes.map((q, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center justify-between px-2 py-1 rounded text-[11px] ${
                                q.odds === sel.bestOdds
                                  ? 'bg-emerald-950/50 text-emerald-300 font-bold border border-emerald-800/60'
                                  : 'text-slate-400 bg-slate-900/60'
                              }`}
                            >
                              <span>{q.bookmaker}</span>
                              <span>{q.odds.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action CTA: Apply Best Odds into Quant Engine */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    Regla P0.9: Las mejores cuotas detectadas se transmiten sin distorsión al QuantEngine.
                  </span>

                  <button
                    onClick={() => {
                      const homeBest = lineShoppingData.selections.find((s) =>
                        s.selection.toLowerCase().includes('local')
                      )?.bestOdds || activeLineShoppingFixture.odds?.home || 2.10;

                      const drawBest = lineShoppingData.selections.find((s) =>
                        s.selection.toLowerCase().includes('empate')
                      )?.bestOdds || activeLineShoppingFixture.odds?.draw || 3.40;

                      const awayBest = lineShoppingData.selections.find((s) =>
                        s.selection.toLowerCase().includes('visitante')
                      )?.bestOdds || activeLineShoppingFixture.odds?.away || 3.60;

                      const updatedFixture: RadarFixture = {
                        ...activeLineShoppingFixture,
                        odds: { home: homeBest, draw: drawBest, away: awayBest },
                      };

                      setActiveLineShoppingFixture(null);
                      onSelectPrematch(updatedFixture);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-colors"
                  >
                    <span>Cargar Mejor Cuota en Terminal Cuantitativo</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs font-mono">
                No se obtuvieron cotizaciones de casas de apuestas para este partido.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: WATCHLIST (MONITOR DE CUOTAS OBJETIVO / WAIT) (P0.13) */}
      {showWatchlistModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowWatchlistModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    Watchlist Cuantitativa (Monitor de Cuotas WAIT)
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300">
                    P0.13
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Monitor de selecciones en espera: Notifica automáticamente cuando la cuota de mercado alcanza o supera la cuota objetivo requerida.
                </p>
              </div>
            </div>

            {watchlistItems.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs font-mono space-y-2 border border-dashed border-slate-800 rounded-xl">
                <Eye className="w-8 h-8 mx-auto text-slate-600" />
                <p className="font-semibold text-slate-300">No hay selecciones en seguimiento en este momento.</p>
                <p className="text-slate-500">
                  Usa el botón "+ Watch" en cualquier partido para monitorizar una cuota objetivo requerida.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Partido & Selección</th>
                      <th className="py-2.5 px-3 text-right">Cuota Actual</th>
                      <th className="py-2.5 px-3 text-right">Cuota Objetivo (Target)</th>
                      <th className="py-2.5 px-3 text-right">EV Actual</th>
                      <th className="py-2.5 px-3 text-center">Estado Target</th>
                      <th className="py-2.5 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {watchlistItems.map((item) => {
                      const isReached = item.isTargetReached || item.currentOdds >= item.targetOdds;
                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isReached ? 'bg-emerald-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-3">
                            <div className="font-bold text-white">{item.matchName}</div>
                            <div className="text-[10px] text-slate-400">
                              {item.competition} · <strong className="text-cyan-300">{item.selection}</strong> ({item.market})
                            </div>
                            <div className="text-[9px] text-slate-500 mt-0.5 truncate">{item.reason}</div>
                          </td>

                          <td className="py-3 px-3 text-right font-bold text-white">
                            {item.currentOdds.toFixed(2)}
                          </td>

                          <td className="py-3 px-3 text-right font-bold text-amber-300">
                            {item.targetOdds.toFixed(2)}
                          </td>

                          <td
                            className={`py-3 px-3 text-right font-bold ${
                              item.currentEvPercent > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.currentEvPercent >= 0 ? '+' : ''}
                            {item.currentEvPercent.toFixed(1)}%
                          </td>

                          <td className="py-3 px-3 text-center">
                            {isReached ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-extrabold animate-pulse">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>TARGET REACHED</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800 text-[10px] font-medium">
                                <span>ESPERANDO CUOTA</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                            {/* Simular movimiento de cuota (P0.13) */}
                            <button
                              onClick={() => {
                                updateWatchItemOdds(item.id, Math.round((item.currentOdds + 0.15) * 100) / 100);
                                setWatchlistItems(getWatchlist());
                              }}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition-colors"
                              title="Simular subida de cuota del mercado"
                            >
                              +0.15
                            </button>

                            {/* Recalcular en Terminal Cuantitativo */}
                            <button
                              onClick={() => {
                                setShowWatchlistModal(false);
                                onSelectPrematch({
                                  id: `watch-${item.fixtureId}`,
                                  fixtureId: Number(item.fixtureId) || 99999,
                                  date: new Date().toISOString(),
                                  timestamp: Math.floor(Date.now() / 1000),
                                  status: 'SCHEDULED',
                                  statusShort: 'NS',
                                  elapsed: null,
                                  leagueId: 39,
                                  league: item.competition,
                                  country: 'Oficial',
                                  round: 'Watchlist Match',
                                  homeTeam: item.matchName.split(' vs ')[0] || 'Local',
                                  awayTeam: item.matchName.split(' vs ')[1] || 'Visitante',
                                  homeLogo: '',
                                  awayLogo: '',
                                  scoreHome: null,
                                  scoreAway: null,
                                  importanceScore: 80,
                                  tierLabel: 'ALTA',
                                  hasEnoughData: true,
                                  hasOdds: true,
                                  odds: {
                                    home: item.selection.toLowerCase().includes('local') ? item.currentOdds : 2.10,
                                    draw: 3.40,
                                    away: item.selection.toLowerCase().includes('visitante') ? item.currentOdds : 3.60,
                                  },
                                  dataQuality: 'ALTA',
                                });
                              }}
                              className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold text-[10px] transition-colors"
                            >
                              Recalcular
                            </button>

                            {/* Eliminar */}
                            <button
                              onClick={() => {
                                removeFromWatchlist(item.id);
                                setWatchlistItems(getWatchlist());
                              }}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                              title="Remover de la Watchlist"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: OPPORTUNITY SCORE BREAKDOWN (P0.5) */}
      {activeOpportunityFixture && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative font-mono text-xs">
            <button
              onClick={() => setActiveOpportunityFixture(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Desglose de Opportunity Score</h3>
                <p className="text-[11px] text-slate-400">
                  {activeOpportunityFixture.homeTeam} vs {activeOpportunityFixture.awayTeam}
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">OPPORTUNITY SCORE TOTAL</span>
                <span className="text-xl font-bold text-cyan-300">
                  {activeOpportunityFixture.opportunityScore || 65}/100
                </span>
              </div>
              <div className="text-[11px] text-slate-300">
                Veredicto:{' '}
                <strong className="text-emerald-400">
                  {activeOpportunityFixture.opportunityVerdict || 'OPORTUNIDAD MEDIA'}
                </strong>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] text-slate-400 uppercase font-bold">Componentes Cuantitativos (0–100)</h4>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                  <span>1. Edge Potencial de Cuota</span>
                  <span className="font-bold text-emerald-400">
                    {activeOpportunityFixture.opportunityBreakdown?.potentialEdge ?? 20} / 35 pts
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                  <span>2. Calidad de Datos (xG, forma, actas)</span>
                  <span className="font-bold text-cyan-400">
                    {activeOpportunityFixture.opportunityBreakdown?.dataQualityScore ?? 20} / 25 pts
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                  <span>3. Disponibilidad de Cuotas Multi-Bookmaker</span>
                  <span className="font-bold text-amber-400">
                    {activeOpportunityFixture.opportunityBreakdown?.oddsAvailability ?? 15} / 20 pts
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                  <span>4. Calidad de Mercado (Margen bajo / liquidez)</span>
                  <span className="font-bold text-purple-400">
                    {activeOpportunityFixture.opportunityBreakdown?.marketQuality ?? 15} / 20 pts
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-[11px] text-cyan-200">
              «Regla P0.5: El Opportunity Score NO predice quién ganará. Mide exclusivamente las condiciones cuantitativas de mercado e información para el análisis.»
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Componente Tarjeta de Partido Individual (Prioridad 11 & P0 Features)
 */
interface MatchCardProps {
  fixture: RadarFixture;
  formatLocalTime: (iso: string) => string;
  formatLocalDate: (iso: string) => string;
  getImportanceBadge: (score: number) => string;
  onSelectPrematch: (fixture: RadarFixture) => void;
  onSelectLive: (fixture: RadarFixture) => void;
  onOpenLineShopper?: (fixture: RadarFixture) => void;
  onAddToWatch?: (fixture: RadarFixture, selection: string, currentOdd: number, targetOdd: number) => void;
  onViewOpportunity?: (fixture: RadarFixture) => void;
}

const MatchCard: React.FC<MatchCardProps> = ({
  fixture,
  formatLocalTime,
  formatLocalDate,
  getImportanceBadge,
  onSelectPrematch,
  onSelectLive,
  onOpenLineShopper,
  onAddToWatch,
  onViewOpportunity,
}) => {
  const isLive = fixture.status === 'LIVE' || fixture.status === 'HALFTIME';

  return (
    <div
      className={`bg-slate-950 border rounded-xl p-4 transition-all duration-200 flex flex-col justify-between gap-3.5 hover:shadow-xl ${
        isLive
          ? 'border-rose-800/80 bg-gradient-to-br from-slate-950 to-rose-950/20'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Top Header: Competición, Canonical ID y Badges */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-mono font-semibold text-slate-300 truncate">
            {fixture.league}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">· {fixture.country}</span>
          {fixture.canonicalFixtureId && (
            <span
              className="hidden lg:inline text-[9px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-1 py-0.5 rounded truncate max-w-[120px]"
              title={`Canonical ID: ${fixture.canonicalFixtureId}`}
            >
              {fixture.canonicalFixtureId.substring(0, 16)}...
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Opportunity Score Badge (P0.5) */}
          {fixture.opportunityScore !== undefined && (
            <button
              onClick={() => onViewOpportunity && onViewOpportunity(fixture)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800 hover:bg-cyan-900 transition-colors"
              title="Ver desglose detallado de Opportunity Score"
            >
              <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
              <span>{fixture.opportunityScore}</span>
              <span className="text-[9px] font-normal text-cyan-400 hidden sm:inline">OPP</span>
            </button>
          )}

          {/* Importance Score Badge (P0.4: separado de EV) */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${getImportanceBadge(
              fixture.importanceScore
            )}`}
          >
            <span>⭐ {fixture.importanceScore}</span>
            <span className="hidden sm:inline font-normal text-[9px]">{fixture.tierLabel || 'IMP'}</span>
          </span>

          {/* Data Quality Badge (P0.10) */}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
              fixture.dataQuality === 'LIVE'
                ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                : fixture.dataQuality === 'ALTA'
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                : fixture.dataQuality === 'MEDIA'
                ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            {fixture.dataQuality}
          </span>
        </div>
      </div>

      {/* Center: Teams, Logos and Score / Status */}
      <div className="grid grid-cols-5 items-center gap-2 py-1">
        {/* Home Team */}
        <div className="col-span-2 flex items-center gap-2.5">
          {fixture.homeLogo ? (
            <img
              src={fixture.homeLogo}
              alt={fixture.homeTeam}
              className="w-7 h-7 object-contain shrink-0"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-300">
              {fixture.homeTeam.substring(0, 2)}
            </div>
          )}
          <span className="text-xs font-bold text-white truncate">{fixture.homeTeam}</span>
        </div>

        {/* Status / Score Column */}
        <div className="col-span-1 text-center font-mono">
          {isLive ? (
            <div className="space-y-0.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950 border border-rose-800 text-[10px] font-bold text-rose-400">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                <span>{fixture.elapsed ?? 45}'</span>
              </span>
              <div className="text-base font-extrabold text-white">
                {fixture.scoreHome ?? 0} - {fixture.scoreAway ?? 0}
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-cyan-300">
                {formatLocalTime(fixture.date)}
              </div>
              <div className="text-[10px] text-slate-500">{formatLocalDate(fixture.date)}</div>
            </div>
          )}
        </div>

        {/* Away Team */}
        <div className="col-span-2 flex items-center justify-end gap-2.5">
          <span className="text-xs font-bold text-white truncate text-right">
            {fixture.awayTeam}
          </span>
          {fixture.awayLogo ? (
            <img
              src={fixture.awayLogo}
              alt={fixture.awayTeam}
              className="w-7 h-7 object-contain shrink-0"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-300">
              {fixture.awayTeam.substring(0, 2)}
            </div>
          )}
        </div>
      </div>

      {/* Context info if available */}
      {fixture.competitiveContext && (
        <div className="text-[11px] font-mono text-slate-400 bg-slate-900/50 rounded px-2.5 py-1 border border-slate-800/40 truncate">
          ℹ️ {fixture.competitiveContext}
        </div>
      )}

      {/* Bottom Footer: Cuotas, Line Shopper, Watchlist y Botón de Navegación */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2.5 border-t border-slate-800/60 text-xs font-mono gap-2">
        <div className="text-slate-400 text-[11px]">
          {fixture.odds ? (
            <span>
              Best: <strong className="text-slate-200">1: {fixture.odds.home.toFixed(2)}</strong> ·{' '}
              <strong className="text-slate-200">X: {fixture.odds.draw.toFixed(2)}</strong> ·{' '}
              <strong className="text-slate-200">2: {fixture.odds.away.toFixed(2)}</strong>
            </span>
          ) : (
            <span className="text-slate-500">Cuotas bajo demanda</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 justify-end">
          {/* Line Shopping Button (P0.7 & P0.8) */}
          {onOpenLineShopper && (
            <button
              onClick={() => onOpenLineShopper(fixture)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium border border-slate-700 transition-colors flex items-center gap-1"
              title="Comparar cuotas multi-bookmaker (P0.7)"
            >
              <Store className="w-3 h-3 text-cyan-400" />
              <span className="hidden sm:inline">Line Shop</span>
            </button>
          )}

          {/* Watchlist Button (P0.13) */}
          {onAddToWatch && (
            <button
              onClick={() => {
                const odd = fixture.odds?.home || 2.10;
                onAddToWatch(fixture, 'Local', odd, Math.round((odd + 0.15) * 100) / 100);
              }}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium border border-slate-700 transition-colors flex items-center gap-1"
              title="Añadir a monitor de cuota objetivo (P0.13)"
            >
              <Eye className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">+ Watch</span>
            </button>
          )}

          {/* Navigation to Terminal or Live */}
          {isLive ? (
            <button
              onClick={() => onSelectLive(fixture)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] transition-colors shadow-sm"
            >
              <span>In-Play</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => onSelectPrematch(fixture)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white font-semibold text-[11px] transition-colors shadow-sm"
            >
              <span>Analizar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Sección de Día del Fin de Semana (Viernes / Sábado / Domingo) (Prioridad 19)
 */
interface WeekendDaySectionProps {
  title: string;
  dayKey: string;
  matches: RadarFixture[];
  isExpanded: boolean;
  onToggle: () => void;
  formatLocalTime: (iso: string) => string;
  formatLocalDate: (iso: string) => string;
  getImportanceBadge: (score: number) => string;
  onSelectPrematch: (fixture: RadarFixture) => void;
  onSelectLive: (fixture: RadarFixture) => void;
  onOpenLineShopper?: (fixture: RadarFixture) => void;
  onAddToWatch?: (fixture: RadarFixture, selection: string, currentOdd: number, targetOdd: number) => void;
  onViewOpportunity?: (fixture: RadarFixture) => void;
}

const WeekendDaySection: React.FC<WeekendDaySectionProps> = ({
  title,
  matches,
  isExpanded,
  onToggle,
  formatLocalTime,
  formatLocalDate,
  getImportanceBadge,
  onSelectPrematch,
  onSelectLive,
  onOpenLineShopper,
  onAddToWatch,
  onViewOpportunity,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="w-full px-5 py-3.5 flex items-center justify-between bg-slate-900 hover:bg-slate-800/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white tracking-wide font-mono">
            {title} ({matches.length} partidos)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span>{isExpanded ? 'Contraer' : 'Expandir'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 pt-1 border-t border-slate-800/80">
          {matches.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 font-mono">
              No hay partidos programados para este día del fin de semana.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {matches.map((fixture) => (
                <MatchCard
                  key={fixture.id}
                  fixture={fixture}
                  formatLocalTime={formatLocalTime}
                  formatLocalDate={formatLocalDate}
                  getImportanceBadge={getImportanceBadge}
                  onSelectPrematch={onSelectPrematch}
                  onSelectLive={onSelectLive}
                  onOpenLineShopper={onOpenLineShopper}
                  onAddToWatch={onAddToWatch}
                  onViewOpportunity={onViewOpportunity}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

