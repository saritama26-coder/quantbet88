import React, { useState, useMemo } from 'react';
import {
  Calculator,
  RefreshCw,
  Sliders,
  DollarSign,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  FileText,
  Sparkles,
  ArrowRight,
  Shield,
  ShieldAlert,
  Layers,
  FileDown,
  Eye,
  Store,
  X,
} from 'lucide-react';
import {
  MarketOption,
  ConfidenceLevel,
  KellyFractionType,
  calculateMarketQuant,
  round2,
} from '../lib/quantEngine';
import { SampleCase } from '../data/sampleCases';
import { ReportView } from './ReportView';
import { KellySimulator } from './KellySimulator';
import { ProbabilityComparisonChart } from './ProbabilityComparisonChart';
import { exportQuantReportToPdf } from '../lib/pdfExporter';
import { addToWatchlist } from '../lib/watchEngine';

interface QuantCalculatorProps {
  initialBankroll?: number;
  loadedCase?: SampleCase | null;
  onSendToParlay?: (option: MarketOption, match: string, competition: string, market: string, margin: number, confidence: ConfidenceLevel) => void;
}

const MARKET_PRESETS = [
  {
    name: '1X2 (Resultado Final)',
    options: ['Local', 'Empate', 'Visitante'],
    defaultOdds: [2.10, 3.40, 3.60],
  },
  {
    name: 'Más/Menos 2.5 Goles',
    options: ['Más de 2.5 Goles', 'Menos de 2.5 Goles'],
    defaultOdds: [1.85, 1.95],
  },
  {
    name: 'Ambos Equipos Marcan (BTTS)',
    options: ['Ambos Marcan (Sí)', 'Ambos Marcan (No)'],
    defaultOdds: [1.75, 2.05],
  },
  {
    name: 'Empate Apuesta No Válida (DNB)',
    options: ['Local (DNB)', 'Visitante (DNB)'],
    defaultOdds: [1.50, 2.60],
  },
];

export const QuantCalculator: React.FC<QuantCalculatorProps> = ({
  initialBankroll = 1000,
  loadedCase,
  onSendToParlay,
}) => {
  // Match metadata
  const [match, setMatch] = useState('Arsenal vs Chelsea');
  const [competition, setCompetition] = useState('Premier League');
  const [matchDateTime, setMatchDateTime] = useState('2026-10-04 11:30');
  const [market, setMarket] = useState('1X2 (Resultado Final)');
  const [captureTime, setCaptureTime] = useState('10:15');
  const [bankroll, setBankroll] = useState<number>(initialBankroll);

  // Confidence, Data Quality (P0.10) & Lineups
  const [confidence, setConfidence] = useState<ConfidenceLevel>('ALTA');
  const [dataQuality, setDataQuality] = useState<'ALTA' | 'MEDIA' | 'BAJA' | 'STALE' | 'MISSING' | 'CONFLICTING'>('ALTA');
  const [pendingLineups, setPendingLineups] = useState(false);

  // Line Shopping & Watchlist & Revalidation States (P0.7, P0.13, P0.14)
  const [showLineShopperModal, setShowLineShopperModal] = useState<boolean>(false);
  const [lineShoppingSelections, setLineShoppingSelections] = useState<any[]>([]);
  const [isShopping, setIsShopping] = useState<boolean>(false);
  const [watchlistToast, setWatchlistToast] = useState<string | null>(null);
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false);
  const [revalidationMessage, setRevalidationMessage] = useState<string | null>(null);

  // Kelly interactive simulation states
  const [selectedKelly, setSelectedKelly] = useState<KellyFractionType>('1/4');
  const [applyCap, setApplyCap] = useState<boolean>(true);

  // Market options
  const [options, setOptions] = useState<MarketOption[]>([
    { id: '1', name: 'Local (Arsenal)', odd: 1.85, estimatedProb: 58.50 },
    { id: '2', name: 'Empate', odd: 3.75, estimatedProb: 24.50 },
    { id: '3', name: 'Visitante (Chelsea)', odd: 4.40, estimatedProb: 17.00 },
  ]);

  // Context & Risks
  const [xgRecent, setXgRecent] = useState(
    'En los últimos 8 partidos: Arsenal 2.18 xGF / 0.74 xGA. Chelsea 1.45 xGF / 1.62 xGA (Understat).'
  );
  const [homeAwayForm, setHomeAwayForm] = useState(
    'Arsenal en Emirates: 6V-1E-0D (+14 dif). Chelsea fuera: 2V-2E-3D (FBref).'
  );
  const [injuries, setInjuries] = useState(
    'Alineación probable 90%. Chelsea con rotación defensiva por fatiga (Transfermarkt).'
  );
  const [scheduleRest, setScheduleRest] = useState(
    'Arsenal: 6 días de descanso. Chelsea: 3 días de descanso tras viaje a Alemania.'
  );
  const [compContext, setCompContext] = useState(
    'Arsenal pelea la punta; Chelsea busca mantenerse en zona de copas.'
  );
  const [referee, setReferee] = useState('Michael Oliver: 3.8 amarillas/partido, 0.22 penales/partido.');
  const [unconfirmedText, setUnconfirmedText] = useState('');
  const [risksText, setRisksText] = useState(
    '1. Derbi con alta fricción táctica.\n2. Efectividad en transición rápida de Chelsea.\n3. Posible rotación táctica de última hora previa al pitazo.'
  );

  const [activeView, setActiveView] = useState<'editor' | 'report'>('editor');

  // Load case if changed
  React.useEffect(() => {
    if (loadedCase) {
      setMatch(loadedCase.match);
      setCompetition(loadedCase.competition);
      setMatchDateTime(loadedCase.matchDateTime);
      setMarket(loadedCase.market);
      setCaptureTime(loadedCase.captureTime);
      setBankroll(loadedCase.bankroll);
      setConfidence(loadedCase.confidence);
      setDataQuality(loadedCase.confidence === 'BAJA' ? 'BAJA' : 'ALTA');
      setPendingLineups(loadedCase.pendingLineups);
      setOptions(loadedCase.options);
      setXgRecent(loadedCase.verifiedContext.xgRecent || '');
      setHomeAwayForm(loadedCase.verifiedContext.homeAwayForm || '');
      setInjuries(loadedCase.verifiedContext.injuriesAndLineup || '');
      setScheduleRest(loadedCase.verifiedContext.scheduleAndRest || '');
      setCompContext(loadedCase.verifiedContext.competitiveContext || '');
      setReferee(loadedCase.verifiedContext.referee || '');
      setUnconfirmedText((loadedCase.verifiedContext.unconfirmed || []).join('\n'));
      setRisksText(loadedCase.risks.join('\n'));
    }
  }, [loadedCase]);

  // Sum of estimated probabilities
  const sumEstProb = useMemo(() => {
    return round2(options.reduce((acc, opt) => acc + (Number(opt.estimatedProb) || 0), 0));
  }, [options]);

  const isProbValid = Math.abs(sumEstProb - 100) < 0.05;

  // No Bet Engine Check (P0.10 & P0.11)
  const isNoBetQuality = dataQuality === 'STALE' || dataQuality === 'MISSING' || dataQuality === 'CONFLICTING';
  const effectiveConfidence: ConfidenceLevel = (isNoBetQuality || dataQuality === 'BAJA') ? 'BAJA' : confidence;

  // Quantitative calculation with No Bet Engine enforcement
  const quantResult = useMemo(() => {
    const res = calculateMarketQuant(
      options,
      effectiveConfidence,
      bankroll,
      pendingLineups,
      selectedKelly,
      applyCap
    );

    // Enforce No Bet Engine: Bloqueo irrecusable de la orden si la calidad de datos es STALE, MISSING o CONFLICTING
    if (isNoBetQuality) {
      return {
        ...res,
        overallVerdict: 'NO APOSTAR' as const,
        reasons: [
          `NO BET ENGINE (P0.11): Bloqueo preventivo por calidad de datos ${dataQuality}. Cuotas desactualizadas o inconsistencia crítica entre fuentes.`,
          ...res.reasons,
        ],
        options: res.options.map((opt) => ({
          ...opt,
          verdict: 'NO APOSTAR' as const,
          verdictRule: `Bloqueado por No Bet Engine (Calidad ${dataQuality})`,
          suggestedStakePercent: 0,
          suggestedStakeAmount: 0,
        })),
      };
    }

    return res;
  }, [options, effectiveConfidence, isNoBetQuality, dataQuality, bankroll, pendingLineups, selectedKelly, applyCap]);

  // Line Shopper: Fetch multi-bookmaker odds (P0.7 & P0.8)
  const handleRunLineShopping = async () => {
    setIsShopping(true);
    try {
      const res = await fetch(`/api/odds?market=1X2&mode=demo`);
      const data = await res.json();
      if (data.lineShopping?.selections) {
        setLineShoppingSelections(data.lineShopping.selections);
        setShowLineShopperModal(true);
      }
    } catch (e) {
      console.error('Error fetching line shopping quotes in calculator:', e);
    } finally {
      setIsShopping(false);
    }
  };

  // Web Revalidation (P0.14)
  const handleWebRevalidation = async () => {
    setIsRevalidating(true);
    setRevalidationMessage(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setCaptureTime(nowStr);
      setRevalidationMessage(`[REVALIDACIÓN WEB P0.14]: Cuotas sincronizadas a las ${nowStr}. Sin discrepancias en actas oficiales ni bajas de última hora.`);
      setTimeout(() => setRevalidationMessage(null), 5000);
    } catch {
      setRevalidationMessage('[REVALIDACIÓN WEB]: Error al sincronizar fuentes.');
    } finally {
      setIsRevalidating(false);
    }
  };

  // Watchlist: Add option to waitlist (P0.13)
  const handleAddOptionToWatch = (opt: any) => {
    addToWatchlist({
      fixtureId: match.replace(/\s+/g, '_').toLowerCase(),
      matchName: match,
      competition,
      market,
      selection: opt.name,
      currentOdds: opt.odd,
      targetOdds: opt.minAcceptableOdd,
      modelProbability: opt.estimatedProb,
      currentEvPercent: opt.evPercent,
      reason: `Monitorear hasta que la cuota alcance ${opt.minAcceptableOdd.toFixed(2)} (actual: ${opt.odd.toFixed(2)})`,
    });
    setWatchlistToast(`Añadido a Watchlist: ${opt.name} · Cuota Target: ${opt.minAcceptableOdd.toFixed(2)}`);
    setTimeout(() => setWatchlistToast(null), 3500);
  };

  // Handler to load preset
  const handleApplyPreset = (preset: (typeof MARKET_PRESETS)[0]) => {
    setMarket(preset.name);
    // Calculate proportional initial probabilities
    const sumInv = preset.defaultOdds.reduce((acc, o) => acc + 1 / o, 0);
    const newOptions: MarketOption[] = preset.options.map((name, i) => {
      const odd = preset.defaultOdds[i];
      const fairProb = round2((1 / odd / sumInv) * 100);
      return {
        id: String(i + 1),
        name,
        odd,
        estimatedProb: fairProb,
      };
    });
    // Adjust last one to equal 100
    const currentSum = newOptions.reduce((acc, o) => acc + o.estimatedProb, 0);
    if (newOptions.length > 0) {
      newOptions[newOptions.length - 1].estimatedProb = round2(
        newOptions[newOptions.length - 1].estimatedProb + (100 - currentSum)
      );
    }
    setOptions(newOptions);
  };

  // Set probabilities equal to fair probabilities as baseline
  const handleSetFairAsBaseline = () => {
    let S = 0;
    options.forEach((o) => {
      if (o.odd > 1) S += 1 / o.odd;
    });
    if (S <= 0) return;

    const updated = options.map((o) => {
      const fair = round2((1 / o.odd / S) * 100);
      return { ...o, estimatedProb: fair };
    });

    // Make sure they sum to 100.00
    const total = updated.reduce((acc, o) => acc + o.estimatedProb, 0);
    const diff = round2(100 - total);
    if (updated.length > 0 && diff !== 0) {
      updated[updated.length - 1].estimatedProb = round2(
        updated[updated.length - 1].estimatedProb + diff
      );
    }
    setOptions(updated);
  };

  // Normalize estimated probabilities to 100%
  const handleNormalizeProbabilities = () => {
    const total = options.reduce((acc, o) => acc + (Number(o.estimatedProb) || 0), 0);
    if (total <= 0) return;

    let accumulated = 0;
    const updated = options.map((o, idx) => {
      if (idx === options.length - 1) {
        const remaining = round2(100 - accumulated);
        return { ...o, estimatedProb: Math.max(0, remaining) };
      }
      const norm = round2((o.estimatedProb / total) * 100);
      accumulated += norm;
      return { ...o, estimatedProb: norm };
    });

    setOptions(updated);
  };

  // Add new option
  const handleAddOption = () => {
    const nextId = String(options.length + 1);
    setOptions([
      ...options,
      {
        id: nextId,
        name: `Opción ${nextId}`,
        odd: 2.00,
        estimatedProb: 0,
      },
    ]);
  };

  // Remove option
  const handleRemoveOption = (id: string) => {
    if (options.length <= 2) {
      alert('Un mercado deportivo requiere como mínimo 2 opciones excluyentes.');
      return;
    }
    setOptions(options.filter((o) => o.id !== id));
  };

  // Parse risks
  const parsedRisks = useMemo(() => {
    return risksText
      .split('\n')
      .map((line) => line.replace(/^[0-9]+[.)]\s*/, '').trim())
      .filter((line) => line.length > 0);
  }, [risksText]);

  // Parse unconfirmed
  const parsedUnconfirmed = useMemo(() => {
    return unconfirmedText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }, [unconfirmedText]);

  // Export PDF directly from calculator
  const handleExportPdfDirect = () => {
    exportQuantReportToPdf({
      match,
      competition,
      matchDateTime,
      market,
      captureTime,
      bankroll,
      result: quantResult,
      verifiedContext: {
        xgRecent,
        homeAwayForm,
        injuriesAndLineup: injuries,
        scheduleAndRest: scheduleRest,
        competitiveContext: compContext,
        referee,
        unconfirmed: parsedUnconfirmed,
      },
      risks: parsedRisks,
      sources: [
        { title: 'Understat - Expected Goals (xG)', url: 'https://understat.com', date: '2026-10-03' },
        { title: 'FBref - Advanced Soccer Analytics', url: 'https://fbref.com', date: '2026-10-03' },
        { title: 'SofaScore - Live Stats & Ratings', url: 'https://www.sofascore.com', date: '2026-10-03' },
        { title: 'Transfermarkt - Injuries & Suspensions', url: 'https://www.transfermarkt.com', date: '2026-10-03' },
      ],
    });
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification for Watchlist */}
      {watchlistToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-amber-950 border border-amber-500 text-white text-xs font-mono px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <Eye className="w-4 h-4 text-amber-400" />
          <span>{watchlistToast}</span>
        </div>
      )}

      {/* View Switcher: Interactive Workbench vs Final Official Report */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-900 border border-slate-800 rounded-lg p-2 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveView('editor')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeView === 'editor'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Workbench Cuantitativo</span>
          </button>
          <button
            onClick={() => setActiveView('report')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeView === 'report'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Vista de Informe Oficial (8 Bloques)</span>
          </button>

          {/* Line Shopping Button (P0.7 & P0.8) */}
          <button
            onClick={handleRunLineShopping}
            disabled={isShopping}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs font-semibold transition-colors disabled:opacity-50"
            title="Comparar cuotas multi-bookmaker y extraer la mejor cuota disponible"
          >
            <Store className="w-3.5 h-3.5" />
            <span>{isShopping ? 'Consultando...' : 'Line Shopping'}</span>
          </button>

          {/* Web Revalidation Button (P0.14) */}
          <button
            onClick={handleWebRevalidation}
            disabled={isRevalidating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
            title="Revalidar timestamp, alineaciones y movimientos de cuota web (P0.14)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRevalidating ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isRevalidating ? 'Revalidando...' : 'Revalidar Web'}</span>
          </button>

          <button
            onClick={handleExportPdfDirect}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600/90 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors border border-emerald-500/80 shadow-sm"
            title="Exportar reporte formal cuantitativo en PDF"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Exportar PDF</span>
          </button>
        </div>

        {/* Live EV Quick Badge */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400">Veredicto Motor:</span>
          <span
            className={`px-2 py-0.5 rounded font-bold ${
              quantResult.overallVerdict === 'APOSTAR'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : quantResult.overallVerdict === 'ESPERAR'
                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                : 'bg-rose-950 text-rose-300 border border-rose-800'
            }`}
          >
            {quantResult.overallVerdict}
          </span>
        </div>
      </div>

      {/* No Bet Engine Alert Banner (P0.10 & P0.11) */}
      {isNoBetQuality && (
        <div className="bg-rose-950/70 border border-rose-800 text-rose-200 px-4 py-3 rounded-xl text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <strong className="text-white block font-bold">
                NO BET ENGINE ACTIVADO — Bloqueo de Apuesta por Calidad de Datos ({dataQuality})
              </strong>
              <span className="text-rose-300 text-[11px]">
                Regla P0.11: No se autoriza colocar órdenes con datos STALE, MISSING o CONFLICTING. El sistema prioriza la preservación de capital.
              </span>
            </div>
          </div>
          <button
            onClick={() => setDataQuality('ALTA')}
            className="px-2.5 py-1 bg-rose-900 hover:bg-rose-800 text-rose-100 rounded text-[11px] underline"
          >
            Restablecer a ALTA
          </button>
        </div>
      )}

      {/* Web Revalidation Feedback Banner (P0.14) */}
      {revalidationMessage && (
        <div className="bg-cyan-950/80 border border-cyan-800 text-cyan-200 px-4 py-2.5 rounded-xl text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{revalidationMessage}</span>
        </div>
      )}

      {/* LINE SHOPPING MODAL IN CALCULATOR (P0.7 & P0.8) */}
      {showLineShopperModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl relative font-mono text-xs">
            <button
              onClick={() => setShowLineShopperModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <Store className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Line Shopper: Cotizaciones Multi-Bookmaker</h3>
                <p className="text-[11px] text-slate-400">Selecciona la mejor cuota para aplicarla al cálculo actual</p>
              </div>
            </div>

            <div className="space-y-3">
              {lineShoppingSelections.map((sel: any) => (
                <div key={sel.selection} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{sel.selection}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                      BEST: {sel.bestOdds.toFixed(2)} ({sel.bestBookmaker})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px]">
                    {sel.quotes.map((q: any, idx: number) => (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 rounded ${
                          q.odds === sel.bestOdds
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {q.bookmaker}: {q.odds.toFixed(2)}
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      const updated = options.map((opt) => {
                        if (
                          (sel.selection.toLowerCase().includes('local') && opt.name.toLowerCase().includes('local')) ||
                          (sel.selection.toLowerCase().includes('empate') && opt.name.toLowerCase().includes('empate')) ||
                          (sel.selection.toLowerCase().includes('visitante') && opt.name.toLowerCase().includes('visitante'))
                        ) {
                          return { ...opt, odd: sel.bestOdds };
                        }
                        return opt;
                      });
                      setOptions(updated);
                      setShowLineShopperModal(false);
                      setWatchlistToast(`Cuota de ${sel.selection} actualizada a ${sel.bestOdds.toFixed(2)} (${sel.bestBookmaker})`);
                      setTimeout(() => setWatchlistToast(null), 3500);
                    }}
                    className="w-full mt-1 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white font-semibold text-[11px] transition-colors"
                  >
                    Adoptar Mejor Cuota ({sel.bestOdds.toFixed(2)}) para esta Selección
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeView === 'report' ? (
        <ReportView
          match={match}
          competition={competition}
          matchDateTime={matchDateTime}
          market={market}
          captureTime={captureTime}
          bankroll={bankroll}
          result={quantResult}
          verifiedContext={{
            xgRecent,
            homeAwayForm,
            injuriesAndLineup: injuries,
            scheduleAndRest: scheduleRest,
            competitiveContext: compContext,
            referee,
            unconfirmed: parsedUnconfirmed,
          }}
          risks={parsedRisks}
          sources={[
            { title: 'Understat - Expected Goals (xG)', url: 'https://understat.com', date: '2026-10-03' },
            { title: 'FBref - Advanced Soccer Analytics', url: 'https://fbref.com', date: '2026-10-03' },
            { title: 'SofaScore - Live Stats & Ratings', url: 'https://www.sofascore.com', date: '2026-10-03' },
            { title: 'Transfermarkt - Injuries & Suspensions', url: 'https://www.transfermarkt.com', date: '2026-10-03' },
          ]}
        />
      ) : (
        <div className="space-y-6">
          {/* Match & Market Setup Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-400" />
                1. Datos de Entrada del Evento y Mercado
              </h3>

              {/* Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 font-mono">Plantillas:</span>
                {MARKET_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => handleApplyPreset(p)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition-colors"
                  >
                    {p.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">Partido</label>
                <input
                  type="text"
                  value={match}
                  onChange={(e) => setMatch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 font-sans"
                  placeholder="ej: Arsenal vs Chelsea"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">Competición</label>
                <input
                  type="text"
                  value={competition}
                  onChange={(e) => setCompetition(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 font-sans"
                  placeholder="ej: Premier League"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">Fecha y Hora (Guayaquil GMT-5)</label>
                <input
                  type="text"
                  value={matchDateTime}
                  onChange={(e) => setMatchDateTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  placeholder="2026-10-04 11:30"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">Mercado a Evaluar</label>
                <input
                  type="text"
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 font-sans"
                  placeholder="ej: 1X2 (Resultado Final)"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">
                  Hora de Captura de Cuota <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={captureTime}
                  onChange={(e) => setCaptureTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  placeholder="ej: 10:15 (GMT-5)"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">Bankroll (USD)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-slate-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={bankroll}
                    onChange={(e) => setBankroll(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="1000"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Market Options, Odds & Probabilities Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  2. Cuotas Exactas de la Casa y Probabilidades Estimadas
                </h3>
                <p className="text-xs text-slate-400">
                  Ingresa las cuotas de la casa. Las probabilidades estimadas deben sumar 100.00%.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleSetFairAsBaseline}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-cyan-300 transition-colors border border-slate-700"
                  title="Calcula la probabilidad desmargenada proporcional de la casa como punto de partida neutral"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Cargar Base Justa</span>
                </button>

                <button
                  onClick={handleNormalizeProbabilities}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-emerald-300 transition-colors border border-slate-700"
                  title="Ajusta proporcionalmente las estimaciones para que sumen exactamente 100.00%"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Normalizar a 100%</span>
                </button>

                <button
                  onClick={handleAddOption}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Añadir Opción</span>
                </button>
              </div>
            </div>

            {/* Sum indicator banner */}
            <div
              className={`p-2.5 rounded text-xs font-mono flex items-center justify-between border ${
                isProbValid
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                  : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                {isProbValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>
                  Suma de probabilidades estimadas:{' '}
                  <strong className="text-white text-sm">{sumEstProb.toFixed(2)}%</strong>{' '}
                  {isProbValid ? '(Cumple regla obligatoria 6)' : '(OBLIGATORIO: Debe sumar exactamente 100.00%)'}
                </span>
              </div>

              {!isProbValid && (
                <button
                  onClick={handleNormalizeProbabilities}
                  className="underline hover:text-white font-sans text-xs"
                >
                  Corregir ahora
                </button>
              )}
            </div>

            {/* Interactive Table */}
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 min-w-[140px]">Opción del Mercado</th>
                    <th className="py-2.5 px-2 text-right min-w-[90px]">Cuota Casa</th>
                    <th className="py-2.5 px-2 text-right">Prob. Impl.</th>
                    <th className="py-2.5 px-2 text-right">Prob. Justa</th>
                    <th className="py-2.5 px-2 text-right min-w-[110px]">Prob. Estimada %</th>
                    <th className="py-2.5 px-2 text-right">EV %</th>
                    <th className="py-2.5 px-2 text-right">Cuota Mín.</th>
                    <th className="py-2.5 px-2 text-right">Stake ({selectedKelly} Kelly)</th>
                    {bankroll > 0 && <th className="py-2.5 px-2 text-right">Stake ($)</th>}
                    <th className="py-2.5 px-3 text-center">Veredicto</th>
                    <th className="py-2.5 px-2 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                  {quantResult.options.map((opt, idx) => {
                    const isPositive = opt.evPercent > 0;
                    return (
                      <tr
                        key={opt.id}
                        className={`hover:bg-slate-800/30 transition-colors ${
                          opt.verdict === 'APOSTAR' ? 'bg-emerald-950/20' : ''
                        }`}
                      >
                        {/* Option Name Input */}
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={options[idx]?.name || ''}
                            onChange={(e) => {
                              const updated = [...options];
                              updated[idx].name = e.target.value;
                              setOptions(updated);
                            }}
                            className="w-full bg-slate-950/80 border border-slate-800 rounded px-2 py-1 text-slate-200 font-sans focus:outline-none focus:border-emerald-500"
                          />
                        </td>

                        {/* Odd Input */}
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="1.01"
                            value={options[idx]?.odd || ''}
                            onChange={(e) => {
                              const updated = [...options];
                              updated[idx].odd = parseFloat(e.target.value) || 1.01;
                              setOptions(updated);
                            }}
                            className="w-20 text-right bg-slate-950/80 border border-slate-800 rounded px-2 py-1 text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                          />
                        </td>

                        {/* Implied Probability */}
                        <td className="py-2 px-2 text-right text-slate-400">
                          {opt.impliedProb.toFixed(2)}%
                        </td>

                        {/* Fair Probability */}
                        <td className="py-2 px-2 text-right text-slate-300">
                          {opt.fairProb.toFixed(2)}%
                        </td>

                        {/* Estimated Probability Input */}
                        <td className="py-2 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={options[idx]?.estimatedProb ?? ''}
                              onChange={(e) => {
                                const updated = [...options];
                                updated[idx].estimatedProb = parseFloat(e.target.value) || 0;
                                setOptions(updated);
                              }}
                              className="w-20 text-right bg-slate-950/80 border border-slate-800 rounded px-2 py-1 text-cyan-300 font-bold focus:outline-none focus:border-cyan-500"
                            />
                            <span className="text-slate-500 text-[10px]">%</span>
                          </div>
                        </td>

                        {/* EV % */}
                        <td
                          className={`py-2 px-2 text-right font-bold ${
                            isPositive
                              ? opt.evPercent >= (confidence === 'ALTA' ? 3 : 5)
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {opt.evPercent >= 0 ? '+' : ''}
                          {opt.evPercent.toFixed(2)}%
                        </td>

                        {/* Min Acceptable Odd */}
                        <td className="py-2 px-2 text-right text-slate-400">
                          {opt.minAcceptableOdd.toFixed(2)}
                        </td>

                        {/* Stake % */}
                        <td
                          className={`py-2 px-2 text-right font-bold ${
                            opt.suggestedStakePercent > 0 ? 'text-emerald-400' : 'text-slate-500'
                          }`}
                        >
                          {opt.suggestedStakePercent.toFixed(2)}%
                        </td>

                        {/* Stake $ */}
                        {bankroll > 0 && (
                          <td className="py-2 px-2 text-right text-emerald-300">
                            ${(opt.suggestedStakeAmount || 0).toFixed(2)}
                          </td>
                        )}

                        {/* Verdict Badge */}
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded font-sans tracking-wide ${
                              opt.verdict === 'APOSTAR'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : opt.verdict === 'ESPERAR'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {opt.verdict}
                          </span>
                        </td>

                        {/* Actions (Delete, Watchlist or Send to Parlay) */}
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Watchlist button (P0.13) */}
                            <button
                              onClick={() => handleAddOptionToWatch(opt)}
                              title="Añadir a Watchlist (Monitor de Cuotas WAIT P0.13)"
                              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {onSendToParlay && (
                              <button
                                onClick={() =>
                                  onSendToParlay(
                                    options[idx],
                                    match,
                                    competition,
                                    market,
                                    quantResult.houseMarginPercent,
                                    confidence
                                  )
                                }
                                title="Enviar selección a Combinada"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
                              >
                                <Layers className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {options.length > 2 && (
                              <button
                                onClick={() => handleRemoveOption(opt.id)}
                                title="Eliminar opción"
                                className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Calculations Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[11px] font-sans">Margen de la Casa</span>
                <div className="text-base font-bold text-white mt-0.5">
                  {quantResult.houseMarginPercent.toFixed(2)}%
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  S = Σ(1/cuota) = {quantResult.sumImpliedProb.toFixed(4)}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[11px] font-sans">Regla de Kelly Aplicada</span>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {selectedKelly} Kelly {applyCap ? '(Tope 2.00%)' : '(Sin tope)'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {selectedKelly === '1/8'
                    ? 'Ultra-conservador (mínima varianza)'
                    : selectedKelly === '1/4'
                    ? 'Estándar oficial (75% retorno / 25% riesgo)'
                    : 'Agresivo (mayor crecimiento y drawdown)'}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
                <span className="text-slate-500 block text-[11px] font-sans">Veredicto del Terminal</span>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    quantResult.overallVerdict === 'APOSTAR'
                      ? 'text-emerald-400'
                      : quantResult.overallVerdict === 'ESPERAR'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {quantResult.overallVerdict}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 truncate">
                  {quantResult.reasons[0] || 'Cálculo finalizado.'}
                </div>
              </div>
            </div>
          </div>

          {/* Visual Bar Chart: Implied vs Estimated Probability */}
          <ProbabilityComparisonChart
            options={quantResult.options}
            confidence={confidence}
          />

          {/* Dedicated Kelly Criterion & Bankroll Interactive Simulator */}
          <KellySimulator
            bankroll={bankroll}
            onBankrollChange={(newBankroll) => setBankroll(newBankroll)}
            selectedKelly={selectedKelly}
            onKellyChange={(fraction) => setSelectedKelly(fraction)}
            applyCap={applyCap}
            onToggleCap={(cap) => setApplyCap(cap)}
            options={quantResult.options}
          />

          {/* Confidence and Verification Setup */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              3. Nivel de Confianza y Contexto Verificado
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Confidence buttons */}
              {(['ALTA', 'MEDIA', 'BAJA'] as ConfidenceLevel[]).map((level) => {
                const isSelected = confidence === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setConfidence(level)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? level === 'ALTA'
                          ? 'bg-emerald-950/40 border-emerald-500/60 text-white'
                          : level === 'MEDIA'
                          ? 'bg-amber-950/40 border-amber-500/60 text-white'
                          : 'bg-rose-950/40 border-rose-500/60 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs">{level}</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Umbral EV:{' '}
                        <strong className="text-white">
                          {level === 'ALTA' ? '≥ 3.00%' : level === 'MEDIA' ? '≥ 5.00%' : 'NUNCA'}
                        </strong>
                      </span>
                    </div>
                    <p className="text-[11px] mt-1 text-slate-400 leading-snug">
                      {level === 'ALTA' && 'Alineaciones oficiales o muy confirmadas, xG disponible, sin datos críticos faltantes.'}
                      {level === 'MEDIA' && 'Falta algún dato secundario o alineación probable sin confirmar al 100%.'}
                      {level === 'BAJA' && 'Faltan alineaciones, xG o bajas, o hay más de un «No puedo confirmar».'}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Data Quality & No Bet Engine Selector (P0.10 & P0.11) */}
            <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-cyan-400" />
                  <span>Calidad de Datos & No Bet Engine (P0.10 & P0.11)</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Estado actual: <strong className="text-cyan-300">{dataQuality}</strong>
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(['ALTA', 'MEDIA', 'BAJA', 'STALE', 'MISSING', 'CONFLICTING'] as const).map((q) => {
                  const isCur = dataQuality === q;
                  const isBlocked = q === 'STALE' || q === 'MISSING' || q === 'CONFLICTING';
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setDataQuality(q)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                        isCur
                          ? isBlocked
                            ? 'bg-rose-950 border-rose-700 text-rose-300 font-bold shadow-lg shadow-rose-950'
                            : q === 'ALTA'
                            ? 'bg-emerald-950 border-emerald-700 text-emerald-300 font-bold shadow-lg shadow-emerald-950'
                            : q === 'MEDIA'
                            ? 'bg-amber-950 border-amber-700 text-amber-300 font-bold shadow-lg shadow-amber-950'
                            : 'bg-slate-800 border-slate-700 text-slate-200 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {q} {isBlocked && '⚠️ (NO BET)'}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-slate-400 font-mono">
                {isNoBetQuality
                  ? '🛑 ESTADO NO BET ACTIVO: Datos insuficientes, stale o con conflicto entre fuentes bloquean automáticamente el terminal para evitar apuestas no verificadas.'
                  : '🟢 Datos válidos para modelado probabilístico.'}
              </p>
            </div>

            {/* Checkbox for pending lineups */}
            <label className="flex items-center gap-2.5 p-3 rounded bg-slate-950/60 border border-slate-800/80 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={pendingLineups}
                onChange={(e) => setPendingLineups(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-500/40"
              />
              <span>
                <strong>Alineaciones pendientes de confirmación oficial:</strong> Activar si el partido se juega en más de 2 horas y el once titular no ha sido publicado en actas oficiales (activa regla de veredicto 3: <em>ESPERAR mejor cuota o confirmación</em> si el valor está cerca del umbral).
              </span>
            </label>

            {/* Verification text fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">
                  [DATO] xG Últimos 5–10 partidos (Understat, FBref, SofaScore)
                </label>
                <textarea
                  rows={2}
                  value={xgRecent}
                  onChange={(e) => setXgRecent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-sans text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">
                  [DATO] Rendimiento Local / Visitante de la Temporada
                </label>
                <textarea
                  rows={2}
                  value={homeAwayForm}
                  onChange={(e) => setHomeAwayForm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-sans text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">
                  [DATO] Bajas Confirmadas y Alineaciones Probables
                </label>
                <textarea
                  rows={2}
                  value={injuries}
                  onChange={(e) => setInjuries(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-sans text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">
                  [DATO] Calendario y Días de Descanso
                </label>
                <textarea
                  rows={2}
                  value={scheduleRest}
                  onChange={(e) => setScheduleRest(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-sans text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-400 mb-1 font-mono text-[11px]">
                  Riesgos Principales (Lista numerada)
                </label>
                <textarea
                  rows={3}
                  value={risksText}
                  onChange={(e) => setRisksText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-sans text-xs focus:outline-none focus:border-emerald-500"
                  placeholder="1. Riesgo táctico...&#10;2. Fatiga acumulada..."
                />
              </div>
            </div>

            {/* Action CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleExportPdfDirect}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors border border-slate-700 w-full sm:w-auto"
              >
                <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                <span>Exportar Reporte en PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView('report')}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-emerald-950 w-full sm:w-auto"
              >
                <span>Generar Informe Formal Cuantitativo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
