import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Radio,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  DollarSign,
  ShieldCheck,
  Sparkles,
  FileDown,
  ExternalLink,
  ChevronDown,
  Layers,
  Lock,
  Plus,
  Trash2,
  Info,
  Activity,
  Flame,
  XCircle,
} from 'lucide-react';
import {
  ConfidenceLevel,
  VerdictType,
  InPlayMatchState,
  InPlayOddsCapture,
  evaluateInPlayMarket,
  calculateInPlayPoisson,
  round2,
} from '../lib/quantEngine';
import { exportQuantReportToPdf } from '../lib/pdfExporter';

export interface LiveMatchAnalyzerProps {
  initialFixture?: any;
}

export const LiveMatchAnalyzer: React.FC<LiveMatchAnalyzerProps> = ({ initialFixture }) => {
  // 1. Connection & Live Fixtures State
  const [liveFixtures, setLiveFixtures] = useState<any[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>('sample-live-1');
  const [isManualMode, setIsManualMode] = useState<boolean>(true);
  const [hasLiveApiKey, setHasLiveApiKey] = useState<boolean>(false);
  const [remainingRequests, setRemainingRequests] = useState<number | null>(null);
  const [isLoadingFixtures, setIsLoadingFixtures] = useState<boolean>(false);
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState<string>('');
  const [autoRefreshIntervalSec, setAutoRefreshIntervalSec] = useState<number>(60);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(60);
  const [lastFetchTime, setLastFetchTime] = useState<Date>(new Date());
  const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState<number>(0);

  // Custom Match Creation Modal State
  const [showCustomMatchModal, setShowCustomMatchModal] = useState<boolean>(false);
  const [customHomeTeam, setCustomHomeTeam] = useState<string>('');
  const [customAwayTeam, setCustomAwayTeam] = useState<string>('');
  const [customLeague, setCustomLeague] = useState<string>('Competición en Vivo');

  const handleCreateCustomMatch = () => {
    if (!customHomeTeam.trim() || !customAwayTeam.trim()) {
      alert('Por favor ingresa los nombres de ambos equipos.');
      return;
    }
    const newId = `custom-live-${Date.now()}`;
    const newFixture = {
      id: newId,
      fixtureId: newId,
      isSample: false,
      isManual: true,
      minute: 1,
      status: '1H',
      statusLong: 'First Half',
      league: customLeague || 'Competición en Vivo',
      country: '',
      homeTeam: customHomeTeam.trim(),
      awayTeam: customAwayTeam.trim(),
      scoreHome: 0,
      scoreAway: 0,
      lastUpdated: new Date().toISOString(),
    };
    setLiveFixtures([newFixture, ...liveFixtures]);
    setSelectedFixtureId(newId);
    setMatchState({
      fixtureId: newId,
      homeTeam: customHomeTeam.trim(),
      awayTeam: customAwayTeam.trim(),
      currentMinute: 1,
      addedTimeEstimate: 4,
      scoreHome: 0,
      scoreAway: 0,
      redCardsHome: 0,
      redCardsAway: 0,
      preMatchLambdaHome: 1.5,
      preMatchLambdaAway: 1.2,
      redCardFactorTenMen: 0.75,
      redCardFactorOpponent: 1.15,
      isManualData: true,
      hasXgData: false,
      dataUpdatedTimestamp: new Date().toISOString(),
    });
    setShowCustomMatchModal(false);
  };

  // 2. Telemetry and Match State
  const [matchState, setMatchState] = useState<InPlayMatchState>({
    fixtureId: 'sample-live-1',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    currentMinute: 68,
    addedTimeEstimate: 4,
    scoreHome: 1,
    scoreAway: 0,
    redCardsHome: 0,
    redCardsAway: 1,
    preMatchLambdaHome: 1.55,
    preMatchLambdaAway: 1.15,
    redCardFactorTenMen: 0.75,
    redCardFactorOpponent: 1.15,
    isManualData: false,
    hasXgData: true,
    lastEventElapsedMinute: 58,
    lastEventDetail: 'Tarjeta Roja - Chelsea',
    dataUpdatedTimestamp: new Date().toISOString(),
  });

  const [detailedTelemetry, setDetailedTelemetry] = useState<any>(null);

  // 3. User In-Play Settings & Market
  const [targetMarket, setTargetMarket] = useState<'1X2' | 'TOTAL_GOALS' | 'BTTS'>('1X2');
  const [goalsLine, setGoalsLine] = useState<number>(2.5);
  const [bankroll, setBankroll] = useState<number>(1000);
  const [baseConfidence, setBaseConfidence] = useState<ConfidenceLevel>('ALTA');

  // Stricter in-play thresholds
  const [thresholdAlta, setThresholdAlta] = useState<number>(5.0);
  const [thresholdMedia, setThresholdMedia] = useState<number>(8.0);

  // 4. Live Odds Entered by User (Option + Odd + Capture Time with seconds)
  const getInitialOdds = (marketType: '1X2' | 'TOTAL_GOALS' | 'BTTS') => {
    const nowTime = new Date().toTimeString().slice(0, 8);
    if (marketType === '1X2') {
      return [
        { id: '1', option: 'Local (Arsenal)', odd: 1.35, captureTime: nowTime },
        { id: '2', option: 'Empate', odd: 4.80, captureTime: nowTime },
        { id: '3', option: 'Visitante (Chelsea)', odd: 12.0, captureTime: nowTime },
      ];
    } else if (marketType === 'TOTAL_GOALS') {
      return [
        { id: '1', option: 'Más de 2.5 Goles', odd: 2.25, captureTime: nowTime },
        { id: '2', option: 'Menos de 2.5 Goles', odd: 1.65, captureTime: nowTime },
      ];
    } else {
      return [
        { id: '1', option: 'Ambos Marcan (Sí)', odd: 2.60, captureTime: nowTime },
        { id: '2', option: 'Ambos Marcan (No)', odd: 1.48, captureTime: nowTime },
      ];
    }
  };

  const [liveOdds, setLiveOdds] = useState<InPlayOddsCapture[]>(getInitialOdds('1X2'));

  // 5. Daily Loss Stop-Loss Protection
  const todayKey = `quantbet_daily_loss_${new Date().toISOString().slice(0, 10)}`;
  const [dailyLossLimit, setDailyLossLimit] = useState<number>(() => {
    const saved = localStorage.getItem('quantbet_daily_limit');
    return saved ? parseFloat(saved) : 100;
  });
  const [currentDailyLoss, setCurrentDailyLoss] = useState<number>(() => {
    const saved = localStorage.getItem(todayKey);
    return saved ? parseFloat(saved) : 0;
  });

  const isDailyLimitReached = currentDailyLoss >= dailyLossLimit;

  // 6. Qualitative Context with Gemini
  const [isLoadingGeminiContext, setIsLoadingGeminiContext] = useState<boolean>(false);
  const [geminiContextText, setGeminiContextText] = useState<string | null>(null);
  const [geminiSources, setGeminiSources] = useState<{ title: string; url: string }[]>([]);

  // Ticking seconds timer for freshness
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsSinceLastUpdate((prev) => prev + 1);
      setSecondsUntilRefresh((prev) => {
        if (autoRefreshIntervalSec <= 0) return 0;
        if (prev <= 1) {
          fetchFixturesAndTelemetry();
          return autoRefreshIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoRefreshIntervalSec, selectedFixtureId]);

  // Sincronizar initialFixture recibido desde el Radar de Partidos
  useEffect(() => {
    if (initialFixture) {
      const fixtureIdStr = String(initialFixture.fixtureId || initialFixture.id);
      setSelectedFixtureId(fixtureIdStr);
      setLiveFixtures((prev) => {
        const exists = prev.some((f: any) => String(f.id) === fixtureIdStr || String(f.fixtureId) === fixtureIdStr);
        if (!exists) {
          const newFixture = {
            id: fixtureIdStr,
            fixtureId: fixtureIdStr,
            isSample: false,
            isManual: false,
            minute: initialFixture.elapsed || (initialFixture.status === 'LIVE' ? 65 : 1),
            status: initialFixture.statusShort || 'LIVE',
            statusLong: initialFixture.status || 'En Vivo',
            league: initialFixture.league || 'Competición Oficial',
            country: initialFixture.country || '',
            homeTeam: initialFixture.homeTeam,
            awayTeam: initialFixture.awayTeam,
            scoreHome: initialFixture.scoreHome ?? 0,
            scoreAway: initialFixture.scoreAway ?? 0,
            lastUpdated: new Date().toISOString(),
          };
          return [newFixture, ...prev];
        }
        return prev;
      });

      setMatchState((prev) => ({
        ...prev,
        fixtureId: fixtureIdStr,
        homeTeam: initialFixture.homeTeam || prev.homeTeam,
        awayTeam: initialFixture.awayTeam || prev.awayTeam,
        currentMinute: initialFixture.elapsed || (initialFixture.status === 'LIVE' ? 65 : 1),
        scoreHome: initialFixture.scoreHome ?? prev.scoreHome ?? 0,
        scoreAway: initialFixture.scoreAway ?? prev.scoreAway ?? 0,
        liveXgHome: initialFixture.liveXgHome !== undefined ? initialFixture.liveXgHome : prev.liveXgHome,
        liveXgAway: initialFixture.liveXgAway !== undefined ? initialFixture.liveXgAway : prev.liveXgAway,
        hasXgData: Boolean(initialFixture.liveXgHome !== undefined),
        dataUpdatedTimestamp: new Date().toISOString(),
      }));
    }
  }, [initialFixture]);

  // Load API status and initial fixtures
  const fetchFixturesAndTelemetry = async () => {
    setIsLoadingFixtures(true);
    try {
      // 1. Check API Status
      const statusRes = await fetch('/api/live/status');
      const statusData = await statusRes.json();
      setHasLiveApiKey(statusData.hasLiveDataApiKey);
      if (statusData.remainingRequests !== null) {
        setRemainingRequests(statusData.remainingRequests);
      }

      // 2. Fetch fixtures list
      const fixturesUrl = selectedLeagueFilter
        ? `/api/live/fixtures?league=${encodeURIComponent(selectedLeagueFilter)}`
        : '/api/live/fixtures';
      const fixturesRes = await fetch(fixturesUrl);
      const fixturesData = await fixturesRes.json();

      if (fixturesData.fixtures && fixturesData.fixtures.length > 0) {
        setLiveFixtures(fixturesData.fixtures);
        setIsManualMode(Boolean(fixturesData.isManualMode));

        // If selected fixture exists in list, fetch its details
        const targetId = selectedFixtureId || fixturesData.fixtures[0].id;
        await fetchFixtureDetails(targetId);
      }

      setLastFetchTime(new Date());
      setSecondsSinceLastUpdate(0);
    } catch (err) {
      console.error('Error fetching live data:', err);
    } finally {
      setIsLoadingFixtures(false);
    }
  };

  const fetchFixtureDetails = async (fixtureId: string) => {
    try {
      const res = await fetch(`/api/live/${fixtureId}`);
      const json = await res.json();
      if (json.data) {
        const d = json.data;
        setDetailedTelemetry(d);

        // Extract statistics
        const homeStats = d.statistics?.[0]?.statistics || [];
        const awayStats = d.statistics?.[1]?.statistics || [];

        const findStat = (stats: any[], key: string) => {
          const item = stats.find((s: any) => s.type?.toLowerCase() === key.toLowerCase());
          return item ? item.value : null;
        };

        const homeXg = findStat(homeStats, 'expected_goals');
        const awayXg = findStat(awayStats, 'expected_goals');
        const homeShots = findStat(homeStats, 'Total Shots');
        const awayShots = findStat(awayStats, 'Total Shots');
        const homeSot = findStat(homeStats, 'Shots on Goal');
        const awaySot = findStat(awayStats, 'Shots on Goal');
        const homePossRaw = findStat(homeStats, 'Ball Possession');
        const awayPossRaw = findStat(awayStats, 'Ball Possession');
        const homePoss = homePossRaw ? parseInt(String(homePossRaw).replace('%', ''), 10) : undefined;
        const awayPoss = awayPossRaw ? parseInt(String(awayPossRaw).replace('%', ''), 10) : undefined;
        const nowIso = new Date().toISOString();

        // Count red cards
        const redCardsHome = (d.events || []).filter(
          (e: any) => e.team?.name === d.teams.home.name && e.type === 'Card' && e.detail === 'Red Card'
        ).length;
        const redCardsAway = (d.events || []).filter(
          (e: any) => e.team?.name === d.teams.away.name && e.type === 'Card' && e.detail === 'Red Card'
        ).length;

        // Find last critical event (goal or red card)
        const criticalEvents = (d.events || []).filter(
          (e: any) => e.type === 'Goal' || (e.type === 'Card' && e.detail === 'Red Card')
        );
        const lastCrit = criticalEvents[criticalEvents.length - 1];

        setMatchState((prev) => ({
          ...prev,
          fixtureId: d.fixture.id,
          homeTeam: d.teams.home.name,
          awayTeam: d.teams.away.name,
          currentMinute: d.fixture.status.elapsed ?? prev.currentMinute,
          scoreHome: d.goals.home ?? prev.scoreHome,
          scoreAway: d.goals.away ?? prev.scoreAway,
          redCardsHome,
          redCardsAway,
          hasXgData: Boolean(homeXg && awayXg),
          liveXgHome: homeXg !== null && homeXg !== undefined ? parseFloat(String(homeXg)) : prev.liveXgHome,
          liveXgAway: awayXg !== null && awayXg !== undefined ? parseFloat(String(awayXg)) : prev.liveXgAway,
          totalShotsHome: homeShots !== null && homeShots !== undefined ? parseInt(String(homeShots), 10) : prev.totalShotsHome,
          totalShotsAway: awayShots !== null && awayShots !== undefined ? parseInt(String(awayShots), 10) : prev.totalShotsAway,
          shotsOnTargetHome: homeSot !== null && homeSot !== undefined ? parseInt(String(homeSot), 10) : prev.shotsOnTargetHome,
          shotsOnTargetAway: awaySot !== null && awaySot !== undefined ? parseInt(String(awaySot), 10) : prev.shotsOnTargetAway,
          possessionHome: homePoss !== undefined ? homePoss : prev.possessionHome,
          possessionAway: awayPoss !== undefined ? awayPoss : prev.possessionAway,
          sourceUpdatedAt: d.fixture.date || nowIso,
          telemetryReceivedAt: nowIso,
          dataUpdatedTimestamp: nowIso,
          lastEventElapsedMinute: lastCrit ? lastCrit.time?.elapsed : undefined,
          lastEventDetail: lastCrit ? `${lastCrit.type} - ${lastCrit.team?.name} (${lastCrit.player?.name || ''})` : undefined,
        }));
      }
    } catch (err) {
      console.warn('Error fetching fixture details:', err);
    }
  };

  useEffect(() => {
    fetchFixturesAndTelemetry();
  }, []);

  // When changing market, refresh default odds templates
  const handleMarketChange = (newMarket: '1X2' | 'TOTAL_GOALS' | 'BTTS') => {
    setTargetMarket(newMarket);
    setLiveOdds(getInitialOdds(newMarket));
  };

  // Helper to capture current time with seconds for odds
  const handleStampCurrentTime = (idx: number) => {
    const updated = [...liveOdds];
    const nowTime = new Date().toTimeString().slice(0, 8);
    updated[idx].captureTime = nowTime;
    setLiveOdds(updated);
  };

  const handleStampAllCurrentTime = () => {
    const nowTime = new Date().toTimeString().slice(0, 8);
    const updated = liveOdds.map((o) => ({ ...o, captureTime: nowTime }));
    setLiveOdds(updated);
  };

  // 7. Core Poisson & Evaluation Calculation
  const evaluationResult = useMemo(() => {
    return evaluateInPlayMarket(
      matchState,
      liveOdds,
      targetMarket,
      bankroll,
      baseConfidence,
      goalsLine,
      thresholdAlta,
      thresholdMedia
    );
  }, [
    matchState,
    liveOdds,
    targetMarket,
    bankroll,
    baseConfidence,
    goalsLine,
    thresholdAlta,
    thresholdMedia,
  ]);

  // Request Qualitative Context from Gemini
  const handleFetchGeminiContext = async () => {
    setIsLoadingGeminiContext(true);
    setGeminiContextText(null);
    try {
      const res = await fetch('/api/live/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match: `${matchState.homeTeam} vs ${matchState.awayTeam}`,
          minute: matchState.currentMinute,
          score: `${matchState.scoreHome}-${matchState.scoreAway}`,
          redCards: matchState.redCardsHome + matchState.redCardsAway,
          competition: detailedTelemetry?.league?.name || 'Liga de Fútbol',
        }),
      });
      const data = await res.json();
      setGeminiContextText(data.contextText);
      setGeminiSources(data.sources || []);
    } catch (err) {
      console.error('Error fetching Gemini context:', err);
    } finally {
      setIsLoadingGeminiContext(false);
    }
  };

  // Register closed bet in stop-loss tracker
  const handleRegisterBetOutcome = (amount: number, isLoss: boolean) => {
    if (isLoss) {
      const newTotal = round2(currentDailyLoss + amount);
      setCurrentDailyLoss(newTotal);
      localStorage.setItem(todayKey, String(newTotal));
    }
  };

  const handleResetDailyLoss = () => {
    if (confirm('¿Deseas reiniciar el contador diario de pérdidas?')) {
      setCurrentDailyLoss(0);
      localStorage.removeItem(todayKey);
    }
  };

  // Export PDF
  const handleExportInPlayPdf = () => {
    exportQuantReportToPdf({
      match: `${matchState.homeTeam} vs ${matchState.awayTeam} (EN VIVO - Min ${matchState.currentMinute}')`,
      competition: detailedTelemetry?.league?.name || 'Competición en Vivo',
      matchDateTime: `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} (Hora Guayaquil GMT-5)`,
      market: `${targetMarket} (In-Play Poisson)`,
      captureTime: liveOdds[0]?.captureTime || 'En tiempo real',
      bankroll,
      result: evaluationResult.quantResult,
      verifiedContext: {
        xgRecent: matchState.hasXgData
          ? `[DATO API]: xG acumulado en vivo reportado por API-Football.`
          : `[No reportado por API]: xG en vivo no disponible para este encuentro.`,
        homeAwayForm: `[DATO EN VIVO]: Marcador actual ${matchState.scoreHome} - ${matchState.scoreAway}. Minuto ${matchState.currentMinute}'.`,
        injuriesAndLineup: `[DATO EN VIVO]: Expulsiones: Local ${matchState.redCardsHome} | Visita ${matchState.redCardsAway}.`,
        scheduleAndRest: `Tiempo restante estimado: ${evaluationResult.marketProbabilities.remainingMinutes} minutos (incluyendo descuento).`,
        competitiveContext: `Telemetría en tiempo real: ${evaluationResult.isStale ? 'DATOS DESACTUALIZADOS' : 'DATOS SINCRONIZADOS'}.`,
        unconfirmed: evaluationResult.confidenceReasons,
      },
      risks: [
        'Volatilidad extrema intrínseca de los mercados en juego ante goles o expulsiones repentinas.',
        `Tope de seguridad en vivo aplicado: ¼ Kelly con máximo absoluto de 1.00% del bankroll.`,
        evaluationResult.marketProbabilities.formulasUsed.redCardAdjustmentLabel,
      ],
      sources: [
        {
          title: isManualMode ? 'Ingreso Manual [DATO MANUAL]' : 'API-Football (v3.football.api-sports.io)',
          url: 'https://v3.football.api-sports.io',
          date: new Date().toISOString().slice(0, 10),
        },
      ],
      inPlayInfo: {
        isInPlay: true,
        minute: matchState.currentMinute,
        score: `${matchState.scoreHome} - ${matchState.scoreAway}`,
        redCardsHome: matchState.redCardsHome,
        redCardsAway: matchState.redCardsAway,
        lastUpdatedTimestamp: matchState.dataUpdatedTimestamp,
        diffSecondsWithOdds: evaluationResult.diffSecondsWithOdds,
        isStale: evaluationResult.isStale,
        poissonFormulas: {
          remainingMinutes: evaluationResult.marketProbabilities.formulasUsed.remainingMinutesFormula,
          lambdaHome: evaluationResult.marketProbabilities.formulasUsed.lambdaHomeFormula,
          lambdaAway: evaluationResult.marketProbabilities.formulasUsed.lambdaAwayFormula,
          redCardNote: evaluationResult.marketProbabilities.formulasUsed.redCardAdjustmentLabel,
        },
      },
    });
  };

  // If daily stop loss is reached, show safety lock
  if (isDailyLimitReached) {
    return (
      <div className="bg-rose-950/30 border-2 border-rose-800/80 rounded-xl p-8 text-center space-y-4 max-w-2xl mx-auto shadow-2xl shadow-rose-950">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Límite Diario de Pérdidas Alcanzado (Stop-Loss de Sesión)
          </h2>
          <p className="text-sm text-slate-300">
            Has acumulado <strong className="text-rose-400 font-mono">${currentDailyLoss.toFixed(2)} USD</strong> de pérdidas hoy. Tu límite de protección configurado es de <strong className="text-white font-mono">${dailyLossLimit.toFixed(2)} USD</strong>.
          </p>
        </div>
        <div className="p-4 bg-slate-950/80 rounded-lg border border-slate-800 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          La pestaña «En Vivo» ha sido bloqueada automáticamente hasta las 00:00 (GMT-5). La regla de preservación de capital previene el <em>tilt</em> psicológico y la sobreoperativa en mercados en juego volátiles.
        </div>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={handleResetDailyLoss}
            className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
          >
            Reiniciar Contador (Solo para pruebas)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header with Live Status & Mode Badge */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="relative">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/40 flex items-center justify-center text-rose-400 font-mono font-bold">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 animate-ping opacity-75" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Analizador Cuantitativo En Vivo (In-Play EV+)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">
                  LIVE 1/4 KELLY (MÁX 1%)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Modelo determinístico Poisson bivariado con telemetría en tiempo real y regla de frescura.
              </p>
            </div>
          </div>

          {/* Connection status indicator */}
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono ${
                hasLiveApiKey && !isManualMode
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  hasLiveApiKey && !isManualMode ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span>
                {hasLiveApiKey && !isManualMode
                  ? `API-Football Conectada ${remainingRequests !== null ? `(${remainingRequests} req)` : ''}`
                  : 'Modo Manual / Telemetría Local [DATO MANUAL]'}
              </span>
            </div>

            <button
              onClick={fetchFixturesAndTelemetry}
              disabled={isLoadingFixtures}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors border border-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFixtures ? 'animate-spin' : ''}`} />
              <span>Actualizar ({secondsUntilRefresh}s)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Freshness Banner if Stale */}
      {evaluationResult.isStale && (
        <div className="bg-amber-950/60 border-2 border-amber-600 rounded-lg p-4 text-xs text-amber-200 flex items-start gap-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
          <div className="space-y-1">
            <div className="font-bold text-amber-100 text-sm tracking-wide">
              ⚠️ {evaluationResult.staleReason}
            </div>
            <p className="leading-relaxed text-amber-200/90">
              Regla de frescura in-play estricta: Se prohíbe apostar con datos desincronizados. La diferencia entre la captura de la cuota ({liveOdds[0]?.captureTime}) y la telemetría del partido es de <strong>{evaluationResult.diffSecondsWithOdds}s</strong> (límite: 60s), o los datos tienen <strong>{evaluationResult.dataAgeSeconds}s</strong> de antigüedad.
            </p>
            <div className="pt-1 flex items-center gap-2">
              <button
                onClick={handleStampAllCurrentTime}
                className="px-2.5 py-1 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-100 text-[11px] font-semibold transition-colors border border-amber-500/40"
              >
                Sincronizar Hora de Cuotas con Hora Actual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Match Selector & Telemetry Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        {/* Notice if in Sample / Simulation Mode */}
        {isManualMode && (
          <div className="bg-cyan-950/40 border border-cyan-800/80 rounded-lg p-3 text-xs text-cyan-200 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <span className="font-bold text-cyan-100">
                MODO DEMOSTRACIÓN / SIMULACIÓN ACTIVO (Sin API Key):
              </span>{' '}
              Los partidos de muestra en el selector (ej. <em>Arsenal vs Chelsea</em>, <em>Real Madrid vs Barcelona</em> o <em>Liverpool vs Manchester City</em>) son simulaciones ficticias precargadas para probar las fórmulas del modelo Poisson en vivo. No son partidos que se estén jugando en tiempo real. Puedes ingresar tu propio partido en directo con el botón <strong>«+ Ingresar Partido Manual»</strong>.
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-white">
              Partido en Curso y Telemetría en Tiempo Real
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <button
              onClick={() => setShowCustomMatchModal(!showCustomMatchModal)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-[11px]"
            >
              <Plus className="w-3 h-3 text-emerald-400" />
              <span>Ingresar Partido Manual</span>
            </button>

            <span className="text-slate-400 font-mono">Seleccionar:</span>
            <select
              value={selectedFixtureId}
              onChange={(e) => {
                setSelectedFixtureId(e.target.value);
                fetchFixtureDetails(e.target.value);
              }}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none focus:border-rose-500 max-w-xs"
            >
              {liveFixtures.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.isSample || f.id.startsWith('sample-') ? '[SIMULACIÓN] ' : ''}[{f.minute}'] {f.homeTeam} {f.scoreHome} - {f.scoreAway} {f.awayTeam} ({f.league})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Modal / Form to create a custom real-life in-play match */}
        {showCustomMatchModal && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-white font-mono">
                Registrar Partido Real en Curso [DATO MANUAL]
              </span>
              <button
                onClick={() => setShowCustomMatchModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕ Cerrar
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Equipo Local</label>
                <input
                  type="text"
                  placeholder="ej. Liverpool (URU) / Independiente"
                  value={customHomeTeam}
                  onChange={(e) => setCustomHomeTeam(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Equipo Visitante</label>
                <input
                  type="text"
                  placeholder="ej. Progreso / LDU Quito"
                  value={customAwayTeam}
                  onChange={(e) => setCustomAwayTeam(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Competición / Liga</label>
                <input
                  type="text"
                  placeholder="ej. Liga AUF Uruguaya"
                  value={customLeague}
                  onChange={(e) => setCustomLeague(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={handleCreateCustomMatch}
                className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
              >
                Cargar Partido al Analizador In-Play
              </button>
            </div>
          </div>
        )}

        {/* Live Scoreboard Display */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 relative overflow-hidden">
          <div className="absolute top-2 right-3 text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-rose-400" />
            <span>Actualizado hace {secondsSinceLastUpdate}s</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center text-center">
            {/* Home Team */}
            <div className="space-y-1">
              <div className="text-lg font-bold text-white">{matchState.homeTeam}</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-slate-400">Local</span>
                {matchState.redCardsHome > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono text-[10px]">
                    🟥 {matchState.redCardsHome} Expulsión
                  </span>
                )}
              </div>
            </div>

            {/* Score & Minute */}
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-950/60 border border-rose-800/80 text-rose-300 font-mono font-bold text-xs">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>{matchState.currentMinute}' EN JUEGO</span>
              </div>
              <div className="text-3xl font-mono font-extrabold text-white tracking-wider">
                {matchState.scoreHome} - {matchState.scoreAway}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Descuento estimado: +{matchState.addedTimeEstimate || 4}' (Restan ~{evaluationResult.marketProbabilities.remainingMinutes}')
              </div>
            </div>

            {/* Away Team */}
            <div className="space-y-1">
              <div className="text-lg font-bold text-white">{matchState.awayTeam}</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-slate-400">Visitante</span>
                {matchState.redCardsAway > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono text-[10px]">
                    🟥 {matchState.redCardsAway} Expulsión
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Manual Telemetry Adjuster if in Manual Mode (PRIORIDAD 2 y 6: xG, Tiros, SoT y Desacoplamiento de Timestamps) */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">Ajustes Dinámicos de Telemetría [DATO MANUAL]:</span>
              <span className="text-[10px] text-amber-400">
                {matchState.manualEditedAt ? `Editado manual: ${new Date(matchState.manualEditedAt).toLocaleTimeString()}` : 'Sin edición manual'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block">Minuto</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={matchState.currentMinute}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      currentMinute: parseInt(e.target.value, 10) || 0,
                      isManualData: true,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block">Goles Local</label>
                <input
                  type="number"
                  min="0"
                  value={matchState.scoreHome}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      scoreHome: parseInt(e.target.value, 10) || 0,
                      isManualData: true,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block">Goles Visita</label>
                <input
                  type="number"
                  min="0"
                  value={matchState.scoreAway}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      scoreAway: parseInt(e.target.value, 10) || 0,
                      isManualData: true,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block">Rojas Local</label>
                <input
                  type="number"
                  min="0"
                  max="4"
                  value={matchState.redCardsHome}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      redCardsHome: parseInt(e.target.value, 10) || 0,
                      isManualData: true,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-rose-400 font-bold text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block">Rojas Visita</label>
                <input
                  type="number"
                  min="0"
                  max="4"
                  value={matchState.redCardsAway}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      redCardsAway: parseInt(e.target.value, 10) || 0,
                      isManualData: true,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-rose-400 font-bold text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block">Descuento (+Min)</label>
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={matchState.addedTimeEstimate ?? 4}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      addedTimeEstimate: parseInt(e.target.value, 10) || 0,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-center"
                />
              </div>
            </div>

            {/* Fila 2: xG, Tiros Totales, Tiros a Puerta y Posesión (Prioridad 2) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1 border-t border-slate-800/40">
              <div>
                <label className="text-[10px] text-cyan-400 block">xG Local</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={matchState.liveXgHome ?? 1.2}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      liveXgHome: parseFloat(e.target.value) || 0,
                      hasXgData: true,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-cyan-800/80 rounded px-2 py-1 text-cyan-300 font-bold text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-cyan-400 block">xG Visita</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={matchState.liveXgAway ?? 0.8}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      liveXgAway: parseFloat(e.target.value) || 0,
                      hasXgData: true,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-cyan-800/80 rounded px-2 py-1 text-cyan-300 font-bold text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Tiros Tot. Local</label>
                <input
                  type="number"
                  min="0"
                  value={matchState.totalShotsHome ?? 10}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      totalShotsHome: parseInt(e.target.value, 10) || 0,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Tiros Tot. Visita</label>
                <input
                  type="number"
                  min="0"
                  value={matchState.totalShotsAway ?? 6}
                  onChange={(e) =>
                    setMatchState((prev) => ({
                      ...prev,
                      totalShotsAway: parseInt(e.target.value, 10) || 0,
                      manualEditedAt: new Date().toISOString(),
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-amber-400 block">Tiros Puerta (H/A)</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min="0"
                    value={matchState.shotsOnTargetHome ?? 4}
                    onChange={(e) =>
                      setMatchState((prev) => ({
                        ...prev,
                        shotsOnTargetHome: parseInt(e.target.value, 10) || 0,
                        manualEditedAt: new Date().toISOString(),
                      }))
                    }
                    className="w-1/2 bg-slate-900 border border-amber-800/60 rounded px-1 py-1 text-amber-300 text-center font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    value={matchState.shotsOnTargetAway ?? 2}
                    onChange={(e) =>
                      setMatchState((prev) => ({
                        ...prev,
                        shotsOnTargetAway: parseInt(e.target.value, 10) || 0,
                        manualEditedAt: new Date().toISOString(),
                      }))
                    }
                    className="w-1/2 bg-slate-900 border border-amber-800/60 rounded px-1 py-1 text-amber-300 text-center font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-emerald-400 block">Posesión Local (%)</label>
                <input
                  type="number"
                  min="10"
                  max="90"
                  value={matchState.possessionHome ?? 50}
                  onChange={(e) => {
                    const h = parseInt(e.target.value, 10) || 50;
                    setMatchState((prev) => ({
                      ...prev,
                      possessionHome: h,
                      possessionAway: 100 - h,
                      manualEditedAt: new Date().toISOString(),
                    }));
                  }}
                  className="w-full bg-slate-900 border border-emerald-800/60 rounded px-2 py-1 text-emerald-300 text-center font-bold"
                />
              </div>
            </div>
          </div>

          {/* Recent Event Alert */}
          {matchState.lastEventElapsedMinute !== undefined && (
            <div className="mt-3 p-2 bg-slate-900/90 rounded border border-slate-800 text-[11px] font-mono flex items-center justify-between text-slate-300">
              <span>
                Último evento crítico:{' '}
                <strong className="text-amber-400">
                  {matchState.lastEventDetail || 'Evento'} al minuto {matchState.lastEventElapsedMinute}'
                </strong>{' '}
                (hace {Math.max(0, matchState.currentMinute - matchState.lastEventElapsedMinute)} min)
              </span>
              {matchState.currentMinute - matchState.lastEventElapsedMinute <= 2 && (
                <span className="text-rose-400 font-bold animate-pulse">
                  ⚠️ Mercado volátil (&le; 2 min)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Pre-Match Baseline Parameters & Red Card Model Configuration */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            Parámetros del Modelo Poisson In-Play
          </h3>
          <span className="text-[11px] font-mono text-emerald-400">
            [ESTIMACIÓN – parámetro de usuario]
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div>
            <label className="block text-slate-400 mb-1 text-[11px]">
              λ Prepartido Local ({matchState.homeTeam})
            </label>
            <input
              type="number"
              step="0.05"
              min="0.1"
              value={matchState.preMatchLambdaHome}
              onChange={(e) =>
                setMatchState({
                  ...matchState,
                  preMatchLambdaHome: parseFloat(e.target.value) || 1.5,
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500">xG esperado antes de iniciar</span>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 text-[11px]">
              λ Prepartido Visita ({matchState.awayTeam})
            </label>
            <input
              type="number"
              step="0.05"
              min="0.1"
              value={matchState.preMatchLambdaAway}
              onChange={(e) =>
                setMatchState({
                  ...matchState,
                  preMatchLambdaAway: parseFloat(e.target.value) || 1.1,
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-cyan-400 font-bold focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[10px] text-slate-500">xG esperado antes de iniciar</span>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 text-[11px]">
              Factor Roja Equipo con 10 [ESTIMACIÓN]
            </label>
            <input
              type="number"
              step="0.05"
              min="0.4"
              max="1.0"
              value={matchState.redCardFactorTenMen ?? 0.75}
              onChange={(e) =>
                setMatchState({
                  ...matchState,
                  redCardFactorTenMen: parseFloat(e.target.value) || 0.75,
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-amber-400 font-bold focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-slate-500">Por defecto: ×0.75 (−25% xG)</span>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 text-[11px]">
              Factor Roja Equipo Rival [ESTIMACIÓN]
            </label>
            <input
              type="number"
              step="0.05"
              min="1.0"
              max="1.5"
              value={matchState.redCardFactorOpponent ?? 1.15}
              onChange={(e) =>
                setMatchState({
                  ...matchState,
                  redCardFactorOpponent: parseFloat(e.target.value) || 1.15,
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-amber-400 font-bold focus:outline-none focus:border-amber-500"
            />
            <span className="text-[10px] text-slate-500">Por defecto: ×1.15 (+15% xG)</span>
          </div>
        </div>

        {/* Mathematical Formulas Used Card */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded p-3 text-xs font-mono space-y-1 text-slate-300">
          <div className="font-semibold text-slate-400 text-[11px]">
            Fórmulas y valores aplicados al minuto {matchState.currentMinute}':
          </div>
          <div>• {evaluationResult.marketProbabilities.formulasUsed.remainingMinutesFormula}</div>
          <div>• {evaluationResult.marketProbabilities.formulasUsed.lambdaHomeFormula}</div>
          <div>• {evaluationResult.marketProbabilities.formulasUsed.lambdaAwayFormula}</div>
          <div className="text-amber-400/90">• {evaluationResult.marketProbabilities.formulasUsed.redCardAdjustmentLabel}</div>
        </div>
      </div>

      {/* 4. Live Odds Input and Market Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Cuotas en Vivo Capturadas Manualmente
            </h3>
            <p className="text-xs text-slate-400">
              Ingresa la cuota ofrecida por la casa y la hora exacta con segundos para validar la regla de frescura (&le; 60s).
            </p>
          </div>

          {/* Market Tab Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-xs">
            <button
              onClick={() => handleMarketChange('1X2')}
              className={`px-3 py-1 rounded transition-colors ${
                targetMarket === '1X2'
                  ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1X2 (Final)
            </button>
            <button
              onClick={() => handleMarketChange('TOTAL_GOALS')}
              className={`px-3 py-1 rounded transition-colors ${
                targetMarket === 'TOTAL_GOALS'
                  ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Más/Menos Goles
            </button>
            <button
              onClick={() => handleMarketChange('BTTS')}
              className={`px-3 py-1 rounded transition-colors ${
                targetMarket === 'BTTS'
                  ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ambos Marcan
            </button>
          </div>
        </div>

        {/* Optional Line selector for Total Goals */}
        {targetMarket === 'TOTAL_GOALS' && (
          <div className="flex items-center gap-2 text-xs font-mono bg-slate-950 p-2.5 rounded border border-slate-800">
            <span className="text-slate-400">Línea de Goles a Evaluar:</span>
            {[0.5, 1.5, 2.5, 3.5, 4.5].map((line) => (
              <button
                key={line}
                onClick={() => setGoalsLine(line)}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  goalsLine === line
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {line} Goles
              </button>
            ))}
          </div>
        )}

        {/* Live Odds Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Opciones del mercado:</span>
            <button
              onClick={handleStampAllCurrentTime}
              className="text-cyan-300 hover:underline flex items-center gap-1"
            >
              <Clock className="w-3 h-3" />
              <span>Sellar hora actual en todas ({new Date().toTimeString().slice(0, 8)})</span>
            </button>
          </div>

          <div className="space-y-2">
            {liveOdds.map((item, idx) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-950 p-2.5 rounded border border-slate-800"
              >
                <input
                  type="text"
                  value={item.option}
                  onChange={(e) => {
                    const updated = [...liveOdds];
                    updated[idx].option = e.target.value;
                    setLiveOdds(updated);
                  }}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                  placeholder="Nombre de la opción"
                />

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-mono">Cuota:</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={item.odd}
                      onChange={(e) => {
                        const updated = [...liveOdds];
                        updated[idx].odd = parseFloat(e.target.value) || 1.01;
                        setLiveOdds(updated);
                      }}
                      className="w-20 text-right bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono font-bold text-emerald-400"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-mono">Captura (seg):</span>
                    <input
                      type="text"
                      value={item.captureTime}
                      onChange={(e) => {
                        const updated = [...liveOdds];
                        updated[idx].captureTime = e.target.value;
                        setLiveOdds(updated);
                      }}
                      className="w-24 text-center bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-cyan-300"
                      placeholder="HH:mm:ss"
                    />
                    <button
                      onClick={() => handleStampCurrentTime(idx)}
                      title="Estampar segundo actual"
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. In-Play Quantitative Protocol Table (9 Columns) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Tabla Cuantitativa In-Play (Protocolo Oficial de 9 Columnas)
            </h3>
            <p className="text-xs text-slate-400">
              Umbrales en vivo más exigentes: ALTA ({thresholdAlta.toFixed(1)}%), MEDIA ({thresholdMedia.toFixed(1)}%). Stake ¼ Kelly con tope de 1.00% del bankroll.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportInPlayPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors border border-emerald-500 shadow-sm"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Exportar PDF En Vivo</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Opción</th>
                <th className="py-2.5 px-2 text-right">Cuota</th>
                <th className="py-2.5 px-2 text-right">Prob. Impl.</th>
                <th className="py-2.5 px-2 text-right">Prob. Justa</th>
                <th className="py-2.5 px-2 text-right">Prob. Poisson</th>
                <th className="py-2.5 px-2 text-right">EV %</th>
                <th className="py-2.5 px-2 text-right">Cuota Mín.</th>
                <th className="py-2.5 px-2 text-right">Stake (1/4 Kelly)</th>
                <th className="py-2.5 px-2 text-right">Stake ($)</th>
                <th className="py-2.5 px-3 text-center">Confianza</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
              {evaluationResult.quantResult.options.map((opt) => {
                const isApostar = opt.verdict === 'APOSTAR';
                return (
                  <tr
                    key={opt.id}
                    className={`transition-colors ${
                      isApostar
                        ? 'bg-emerald-950/30 font-medium'
                        : opt.verdict === 'ESPERAR'
                        ? 'bg-amber-950/20'
                        : 'hover:bg-slate-800/20'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-sans text-slate-200">
                      <div className="flex items-center gap-1.5">
                        {isApostar && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                        <span className="font-bold">{opt.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-100 font-bold">{opt.odd.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right text-slate-400">{opt.impliedProb.toFixed(2)}%</td>
                    <td className="py-2.5 px-2 text-right text-slate-300">{opt.fairProb.toFixed(2)}%</td>
                    <td className="py-2.5 px-2 text-right text-cyan-300 font-bold">{opt.estimatedProb.toFixed(2)}%</td>
                    <td
                      className={`py-2.5 px-2 text-right font-bold ${
                        opt.evPercent >= (opt.confidence === 'ALTA' ? thresholdAlta : thresholdMedia)
                          ? 'text-emerald-400'
                          : opt.evPercent > 0
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {opt.evPercent >= 0 ? '+' : ''}
                      {opt.evPercent.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-400">{opt.minAcceptableOdd.toFixed(2)}</td>
                    <td
                      className={`py-2.5 px-2 text-right font-bold ${
                        opt.suggestedStakePercent > 0 ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {opt.suggestedStakePercent.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-emerald-300 font-bold">
                      ${(opt.suggestedStakeAmount || 0).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          opt.confidence === 'ALTA'
                            ? 'text-emerald-300 bg-emerald-950 border border-emerald-800'
                            : opt.confidence === 'MEDIA'
                            ? 'text-amber-300 bg-amber-950 border border-amber-800'
                            : 'text-rose-300 bg-rose-950 border border-rose-800'
                        }`}
                      >
                        {opt.confidence}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Verdict Box */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-xs text-slate-400 block mb-1">Veredicto In-Play:</span>
              <span
                className={`inline-block px-3 py-1 rounded text-sm font-bold tracking-wide font-sans ${
                  evaluationResult.verdict === 'APOSTAR'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : evaluationResult.verdict === 'ESPERAR'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {evaluationResult.verdict}
              </span>
            </div>

            {evaluationResult.verdict === 'APOSTAR' && (
              <div className="text-right">
                <span className="text-xs text-slate-400 block mb-1">Stake In-Play Sugerido (Tope 1%):</span>
                <span className="text-base font-mono font-bold text-emerald-400">
                  {evaluationResult.suggestedStakePercent.toFixed(2)}% del bankroll (${evaluationResult.suggestedStakeAmount?.toFixed(2)} USD)
                </span>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-300 space-y-1 pt-2 border-t border-slate-800">
            <p className="leading-relaxed">
              <strong>Fundamentación:</strong> {evaluationResult.verdictExplanation}
            </p>
            {evaluationResult.confidenceReasons.length > 0 && (
              <div className="text-amber-300/90 space-y-0.5 pt-1">
                <strong>Ajustes automáticos de confianza:</strong>
                {evaluationResult.confidenceReasons.map((r, i) => (
                  <div key={i}>• {r}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6. Qualitative Context with Gemini (Optional) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">
              Contexto Táctico Cualitativo en Vivo (Gemini con Búsqueda)
            </h3>
          </div>
          <button
            onClick={handleFetchGeminiContext}
            disabled={isLoadingGeminiContext}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isLoadingGeminiContext ? 'animate-spin' : ''}`} />
            <span>Consultar Contexto Táctico en Vivo</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Gemini rastrea noticias de última hora, clima o incidencias médicas durante el encuentro. <strong>Gemini nunca altera los cálculos matemáticos ni define el EV</strong>; la probabilidad y el EV provienen exclusivamente del modelo Poisson en <code className="text-slate-300">quantEngine.ts</code>.
        </p>

        {geminiContextText && (
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
            {geminiContextText}

            {geminiSources.length > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-800 flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 text-[10px]">Fuentes:</span>
                {geminiSources.map((s, idx) => (
                  <a
                    key={idx}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline flex items-center gap-1 text-[11px]"
                  >
                    <span>{s.title}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 7. Stop-Loss Configuration Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <div className="font-semibold text-white">Límite Diario de Pérdidas (Stop-Loss de Sesión):</div>
            <div className="text-slate-400">
              Pérdidas acumuladas hoy: <strong className="text-rose-400 font-mono">${currentDailyLoss.toFixed(2)}</strong> / Límite: <strong className="text-white font-mono">${dailyLossLimit.toFixed(2)} USD</strong>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min="20"
            step="10"
            value={dailyLossLimit}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 50;
              setDailyLossLimit(val);
              localStorage.setItem('quantbet_daily_limit', String(val));
            }}
            className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right text-white font-mono"
          />
          <button
            onClick={() => handleRegisterBetOutcome(25, true)}
            title="Registrar apuesta perdida para probar el stop-loss"
            className="px-2 py-1 rounded bg-rose-950/60 border border-rose-800/80 text-rose-300 text-[11px] hover:bg-rose-900/60"
          >
            + Pérdida $25
          </button>
        </div>
      </div>

      {/* Mandatory Final Note */}
      <div className="p-3 bg-slate-950 border border-slate-800 rounded text-center text-xs text-slate-400 italic">
        «Análisis informativo basado en estimaciones; no garantiza resultados.»
      </div>
    </div>
  );
};
