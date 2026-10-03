import fs from 'node:fs';

const path = 'src/components/LiveMatchAnalyzer.tsx';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(pattern, replacement, label) {
  const next = s.replace(pattern, replacement);
  if (next === s) throw new Error(`PATCH FAILED: ${label}`);
  s = next;
}

if (s.includes('FIXTURE_INTEGRITY_PATCH_V1')) {
  process.stdout.write('Fixture integrity patch already applied.\n');
  process.exit(0);
}

const helper = `\n// FIXTURE_INTEGRITY_PATCH_V1\ntype ScopedLiveOdds = InPlayOddsCapture & {\n  canonicalFixtureId: string;\n  homeTeam: string;\n  awayTeam: string;\n  market: '1X2' | 'TOTAL_GOALS' | 'BTTS';\n};\n\nconst normalizeTeamName = (value: unknown): string =>\n  String(value ?? '')\n    .normalize('NFD')\n    .replace(/[\\u0300-\\u036f]/g, '')\n    .replace(/\\s+/g, ' ')\n    .trim()\n    .toLowerCase();\n\nconst getCanonicalFixtureId = (fixture: any): string =>\n  String(fixture?.canonicalFixtureId ?? fixture?.fixtureId ?? fixture?.id ?? '').trim();\n\nconst fixtureTeamsMatch = (aHome: unknown, aAway: unknown, bHome: unknown, bAway: unknown): boolean =>\n  normalizeTeamName(aHome) === normalizeTeamName(bHome) &&\n  normalizeTeamName(aAway) === normalizeTeamName(bAway);\n`;

replaceOnce(
  /export interface LiveMatchAnalyzerProps \{\n  initialFixture\?: any;\n\}\n\n/,
  (m) => m + helper,
  'helper types/functions'
);

replaceOnce(
  /const \[selectedFixtureId, setSelectedFixtureId\] = useState<string>\('sample-live-1'\);/,
  `const [selectedFixtureId, setSelectedFixtureId] = useState<string>('');\n  const [selectedCanonicalFixtureId, setSelectedCanonicalFixtureId] = useState<string>('');\n  const selectedCanonicalFixtureIdRef = useRef<string>('');\n  const fixtureRequestRef = useRef<number>(0);`,
  'selected fixture state'
);

replaceOnce(
  /const \[matchState, setMatchState\] = useState<InPlayMatchState>\(\{[\s\S]*?\n  \}\);/,
  `const [matchState, setMatchState] = useState<InPlayMatchState>({
    fixtureId: '',
    homeTeam: '',
    awayTeam: '',
    currentMinute: 0,
    addedTimeEstimate: 0,
    scoreHome: 0,
    scoreAway: 0,
    redCardsHome: 0,
    redCardsAway: 0,
    preMatchLambdaHome: 1.5,
    preMatchLambdaAway: 1.2,
    redCardFactorTenMen: 0.75,
    redCardFactorOpponent: 1.15,
    isManualData: false,
    hasXgData: false,
    dataUpdatedTimestamp: '',
  });`,
  'remove demo match state'
);

replaceOnce(
  /const getInitialOdds = \(marketType: '1X2' \| 'TOTAL_GOALS' \| 'BTTS'\) => \{[\s\S]*?\n  const \[liveOdds, setLiveOdds\] = useState<InPlayOddsCapture\[\]>\(getInitialOdds\('1X2'\)\);/,
  `const getInitialOdds = (marketType: '1X2' | 'TOTAL_GOALS' | 'BTTS'): ScopedLiveOdds[] => {
    const canonicalFixtureId = selectedCanonicalFixtureIdRef.current;
    if (!canonicalFixtureId || !matchState.homeTeam || !matchState.awayTeam) return [];
    const nowTime = new Date().toTimeString().slice(0, 8);
    const scoped = (items: { id: string; option: string; odd: number }[]): ScopedLiveOdds[] =>
      items.map((item) => ({
        ...item,
        captureTime: nowTime,
        canonicalFixtureId,
        homeTeam: matchState.homeTeam,
        awayTeam: matchState.awayTeam,
        market: marketType,
      }));
    if (marketType === '1X2') return scoped([
      { id: '1', option: \`Local (\${matchState.homeTeam})\`, odd: 0 },
      { id: '2', option: 'Empate', odd: 0 },
      { id: '3', option: \`Visitante (\${matchState.awayTeam})\`, odd: 0 },
    ]);
    if (marketType === 'TOTAL_GOALS') return scoped([
      { id: '1', option: \`Más de \${goalsLine} Goles\`, odd: 0 },
      { id: '2', option: \`Menos de \${goalsLine} Goles\`, odd: 0 },
    ]);
    return scoped([
      { id: '1', option: 'Ambos Marcan (Sí)', odd: 0 },
      { id: '2', option: 'Ambos Marcan (No)', odd: 0 },
    ]);
  };

  const [fixtureOddsById, setFixtureOddsById] = useState<Record<string, ScopedLiveOdds[]>>({});
  const [liveOdds, setLiveOdds] = useState<ScopedLiveOdds[]>([]);

  const setScopedLiveOdds = (nextOdds: ScopedLiveOdds[]) => {
    const canonical = selectedCanonicalFixtureIdRef.current;
    const fixture = liveFixtures.find((f: any) => getCanonicalFixtureId(f) === canonical);
    if (!canonical || !fixture) { setLiveOdds([]); return; }
    const scoped = nextOdds.map((odd) => ({
      ...odd,
      canonicalFixtureId: canonical,
      homeTeam: fixture.homeTeam || matchState.homeTeam,
      awayTeam: fixture.awayTeam || matchState.awayTeam,
    }));
    setLiveOdds(scoped);
    setFixtureOddsById((prev) => ({ ...prev, [canonical]: scoped }));
  };`,
  'scope odds by fixture'
);

replaceOnce(
  /  \/\/ Sincronizar initialFixture recibido desde el Radar de Partidos\n  useEffect\(\(\) => \{[\s\S]*?\n  \}, \[initialFixture\]\);/,
  `  // Sincronizar initialFixture recibido desde el Radar sin mezclar estado.
  useEffect(() => {
    if (!initialFixture) return;
    const apiFixtureId = String(initialFixture.fixtureId || initialFixture.id || '');
    const canonical = getCanonicalFixtureId(initialFixture);
    if (!apiFixtureId || !canonical) return;
    selectedCanonicalFixtureIdRef.current = canonical;
    setSelectedFixtureId(apiFixtureId);
    setSelectedCanonicalFixtureId(canonical);
    setDetailedTelemetry(null);
    setLiveOdds(fixtureOddsById[canonical] || []);
    setMatchState({
      fixtureId: apiFixtureId,
      homeTeam: initialFixture.homeTeam || '',
      awayTeam: initialFixture.awayTeam || '',
      currentMinute: initialFixture.elapsed || 0,
      addedTimeEstimate: 0,
      scoreHome: initialFixture.scoreHome ?? 0,
      scoreAway: initialFixture.scoreAway ?? 0,
      redCardsHome: 0,
      redCardsAway: 0,
      preMatchLambdaHome: 1.5,
      preMatchLambdaAway: 1.2,
      redCardFactorTenMen: 0.75,
      redCardFactorOpponent: 1.15,
      isManualData: Boolean(initialFixture.isManual),
      hasXgData: Boolean(initialFixture.liveXgHome !== undefined),
      liveXgHome: initialFixture.liveXgHome,
      liveXgAway: initialFixture.liveXgAway,
      dataUpdatedTimestamp: new Date().toISOString(),
    });
    const requestToken = ++fixtureRequestRef.current;
    fetchFixtureDetails(apiFixtureId, canonical, requestToken);
  }, [initialFixture]);`,
  'initial fixture sync'
);

replaceOnce(
  /  \/\/ Load API status and initial fixtures\n  const fetchFixturesAndTelemetry = async \(\) => \{[\s\S]*?\n  useEffect\(\(\) => \{\n    fetchFixturesAndTelemetry\(\);\n  \}, \[\]\);/,
  `  // Load live fixtures. Sample fixtures are never used as REAL data.
  const fetchFixturesAndTelemetry = async () => {
    setIsLoadingFixtures(true);
    try {
      const statusRes = await fetch('/api/live/status');
      const statusData = await statusRes.json();
      setHasLiveApiKey(Boolean(statusData.hasLiveDataApiKey));
      setRemainingRequests(statusData.remainingRequests ?? null);

      const fixturesUrl = selectedLeagueFilter
        ? \`/api/live/fixtures?league=\${encodeURIComponent(selectedLeagueFilter)}\`
        : '/api/live/fixtures';
      const fixturesRes = await fetch(fixturesUrl);
      const fixturesData = await fixturesRes.json();
      const normalizedFixtures = Array.isArray(fixturesData.fixtures)
        ? fixturesData.fixtures
            .filter((f: any) => !f.isSample && !String(f.id ?? '').startsWith('sample-'))
            .map((f: any) => ({ ...f, canonicalFixtureId: getCanonicalFixtureId(f) }))
        : [];

      setLiveFixtures(normalizedFixtures);
      setIsManualMode(Boolean(fixturesData.isManualMode));

      if (normalizedFixtures.length === 0) {
        selectedCanonicalFixtureIdRef.current = '';
        setSelectedCanonicalFixtureId('');
        setSelectedFixtureId('');
        setDetailedTelemetry(null);
        setLiveOdds([]);
        setMatchState((prev) => ({ ...prev, fixtureId: '', homeTeam: '', awayTeam: '', currentMinute: 0, scoreHome: 0, scoreAway: 0, redCardsHome: 0, redCardsAway: 0, lastEventElapsedMinute: undefined, lastEventDetail: undefined, hasXgData: false, liveXgHome: undefined, liveXgAway: undefined, dataUpdatedTimestamp: '' }));
      } else {
        const current = normalizedFixtures.find((f: any) => getCanonicalFixtureId(f) === selectedCanonicalFixtureIdRef.current) || normalizedFixtures[0];
        const apiId = String(current.fixtureId || current.id);
        const canonical = getCanonicalFixtureId(current);
        const requestToken = ++fixtureRequestRef.current;
        selectedCanonicalFixtureIdRef.current = canonical;
        setSelectedFixtureId(apiId);
        setSelectedCanonicalFixtureId(canonical);
        setDetailedTelemetry(null);
        setLiveOdds(fixtureOddsById[canonical] || []);
        setMatchState({
          fixtureId: apiId,
          homeTeam: current.homeTeam || '',
          awayTeam: current.awayTeam || '',
          currentMinute: current.minute ?? current.elapsed ?? 0,
          addedTimeEstimate: current.addedTimeEstimate ?? 0,
          scoreHome: current.scoreHome ?? 0,
          scoreAway: current.scoreAway ?? 0,
          redCardsHome: 0,
          redCardsAway: 0,
          preMatchLambdaHome: 1.5,
          preMatchLambdaAway: 1.2,
          redCardFactorTenMen: 0.75,
          redCardFactorOpponent: 1.15,
          isManualData: Boolean(current.isManual),
          hasXgData: false,
          dataUpdatedTimestamp: '',
        });
        await fetchFixtureDetails(apiId, canonical, requestToken);
      }

      setLastFetchTime(new Date());
      setSecondsSinceLastUpdate(0);
    } catch (err) {
      console.error('Error fetching live data:', err);
    } finally {
      setIsLoadingFixtures(false);
    }
  };

  const fetchFixtureDetails = async (fixtureId: string, expectedCanonicalFixtureId?: string, requestToken?: number) => {
    try {
      const res = await fetch(\`/api/live/\${fixtureId}\`);
      const json = await res.json();
      if (!json.data) return;
      if (requestToken !== undefined && requestToken !== fixtureRequestRef.current) return;

      const d = json.data;
      const returnedCanonical = String(expectedCanonicalFixtureId || getCanonicalFixtureId(d.fixture) || fixtureId);
      if (returnedCanonical !== selectedCanonicalFixtureIdRef.current) return;

      const selected = liveFixtures.find((f: any) => getCanonicalFixtureId(f) === returnedCanonical);
      if (selected && !fixtureTeamsMatch(d.teams?.home?.name, d.teams?.away?.name, selected.homeTeam, selected.awayTeam)) return;

      const homeStats = d.statistics?.[0]?.statistics || [];
      const awayStats = d.statistics?.[1]?.statistics || [];
      const findStat = (stats: any[], key: string) => {
        const item = stats.find((x: any) => x.type?.toLowerCase() === key.toLowerCase());
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
      const events = (d.events || []).map((event: any) => ({ ...event, canonicalFixtureId: returnedCanonical }));
      const redCardsHome = events.filter((e: any) => e.team?.name === d.teams.home.name && e.type === 'Card' && e.detail === 'Red Card').length;
      const redCardsAway = events.filter((e: any) => e.team?.name === d.teams.away.name && e.type === 'Card' && e.detail === 'Red Card').length;
      const criticalEvents = events.filter((e: any) => e.type === 'Goal' || (e.type === 'Card' && e.detail === 'Red Card'));
      const lastCrit = criticalEvents[criticalEvents.length - 1];

      setDetailedTelemetry({ ...d, canonicalFixtureId: returnedCanonical, events });
      setMatchState((prev) => ({
        ...prev,
        fixtureId,
        homeTeam: d.teams.home.name,
        awayTeam: d.teams.away.name,
        currentMinute: d.fixture.status.elapsed ?? prev.currentMinute,
        scoreHome: d.goals.home ?? prev.scoreHome,
        scoreAway: d.goals.away ?? prev.scoreAway,
        redCardsHome,
        redCardsAway,
        hasXgData: homeXg !== null && homeXg !== undefined && awayXg !== null && awayXg !== undefined,
        liveXgHome: homeXg !== null && homeXg !== undefined ? parseFloat(String(homeXg)) : undefined,
        liveXgAway: awayXg !== null && awayXg !== undefined ? parseFloat(String(awayXg)) : undefined,
        totalShotsHome: homeShots !== null && homeShots !== undefined ? parseInt(String(homeShots), 10) : undefined,
        totalShotsAway: awayShots !== null && awayShots !== undefined ? parseInt(String(awayShots), 10) : undefined,
        shotsOnTargetHome: homeSot !== null && homeSot !== undefined ? parseInt(String(homeSot), 10) : undefined,
        shotsOnTargetAway: awaySot !== null && awaySot !== undefined ? parseInt(String(awaySot), 10) : undefined,
        possessionHome: homePoss,
        possessionAway: awayPoss,
        sourceUpdatedAt: d.fixture.date || nowIso,
        telemetryReceivedAt: nowIso,
        dataUpdatedTimestamp: nowIso,
        lastEventElapsedMinute: lastCrit ? lastCrit.time?.elapsed : undefined,
        lastEventDetail: lastCrit ? \`\${lastCrit.type} - \${lastCrit.team?.name} (\${lastCrit.player?.name || ''})\` : undefined,
      }));
    } catch (err) {
      console.warn('Error fetching fixture details:', err);
    }
  };

  useEffect(() => {
    fetchFixturesAndTelemetry();
  }, []);`,
  'fixture fetch and telemetry isolation'
);

s = s.replace(/setLiveOdds\(updated\);/g, 'setScopedLiveOdds(updated);');

replaceOnce(
  /  \/\/ When changing market, refresh default odds templates\n  const handleMarketChange = .*?\n  \/\/ 7\. Core Poisson & Evaluation Calculation/s,
  `  const handleFixtureSelection = async (apiFixtureId: string) => {
    const fixture = liveFixtures.find((f: any) => String(f.fixtureId || f.id) === String(apiFixtureId));
    if (!fixture) return;
    const canonical = getCanonicalFixtureId(fixture);
    const requestToken = ++fixtureRequestRef.current;
    selectedCanonicalFixtureIdRef.current = canonical;
    setSelectedFixtureId(String(fixture.fixtureId || fixture.id));
    setSelectedCanonicalFixtureId(canonical);
    setDetailedTelemetry(null);
    setLiveOdds(fixtureOddsById[canonical] || []);
    setMatchState({
      fixtureId: String(fixture.fixtureId || fixture.id),
      homeTeam: fixture.homeTeam || '',
      awayTeam: fixture.awayTeam || '',
      currentMinute: fixture.minute ?? fixture.elapsed ?? 0,
      addedTimeEstimate: fixture.addedTimeEstimate ?? 0,
      scoreHome: fixture.scoreHome ?? 0,
      scoreAway: fixture.scoreAway ?? 0,
      redCardsHome: 0,
      redCardsAway: 0,
      preMatchLambdaHome: 1.5,
      preMatchLambdaAway: 1.2,
      redCardFactorTenMen: 0.75,
      redCardFactorOpponent: 1.15,
      isManualData: Boolean(fixture.isManual),
      hasXgData: false,
      dataUpdatedTimestamp: '',
    });
    await fetchFixtureDetails(String(fixture.fixtureId || fixture.id), canonical, requestToken);
  };

  const handleMarketChange = (newMarket: '1X2' | 'TOTAL_GOALS' | 'BTTS') => {
    setTargetMarket(newMarket);
    const currentFixture = liveFixtures.find((f: any) => getCanonicalFixtureId(f) === selectedCanonicalFixtureIdRef.current);
    if (!currentFixture) { setLiveOdds([]); return; }
    const existing = (fixtureOddsById[selectedCanonicalFixtureIdRef.current] || []).filter((o) => o.market === newMarket);
    setScopedLiveOdds(existing.length ? existing : getInitialOdds(newMarket));
  };

  const handleStampCurrentTime = (idx: number) => {
    setScopedLiveOdds(liveOdds.map((o, i) => i === idx ? { ...o, captureTime: new Date().toTimeString().slice(0, 8) } : o));
  };

  const handleStampAllCurrentTime = () => {
    const nowTime = new Date().toTimeString().slice(0, 8);
    setScopedLiveOdds(liveOdds.map((o) => ({ ...o, captureTime: nowTime })));
  };

  // 7. Core Poisson & Evaluation Calculation`,
  'fixture-scoped handlers'
);

replaceOnce(
  /  const evaluationResult = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[\n    matchState,\n    liveOdds,\n    targetMarket,\n    bankroll,\n    baseConfidence,\n    goalsLine,\n    thresholdAlta,\n    thresholdMedia,\n  \]\);/,
  `  const fixtureIntegrity = useMemo(() => {
    const selected = liveFixtures.find((f: any) => getCanonicalFixtureId(f) === selectedCanonicalFixtureId);
    const telemetryCanonical = getCanonicalFixtureId(detailedTelemetry) || (matchState.fixtureId && selectedCanonicalFixtureId === matchState.fixtureId ? selectedCanonicalFixtureId : '');
    const oddsIdentityValid = liveOdds.length > 0 && liveOdds.every((o) =>
      o.canonicalFixtureId === selectedCanonicalFixtureId &&
      o.market === targetMarket &&
      typeof o.odd === 'number' && o.odd > 1 &&
      fixtureTeamsMatch(o.homeTeam, o.awayTeam, selected?.homeTeam, selected?.awayTeam)
    );
    const telemetryIdentityValid = Boolean(selectedCanonicalFixtureId && selected && telemetryCanonical === selectedCanonicalFixtureId && String(matchState.fixtureId) === String(selected.fixtureId || selected.id));
    const teamsValid = Boolean(selected && fixtureTeamsMatch(matchState.homeTeam, matchState.awayTeam, selected.homeTeam, selected.awayTeam));
    const hasTelemetry = Boolean(detailedTelemetry || matchState.dataUpdatedTimestamp);
    let reason = 'OK';
    if (!selectedCanonicalFixtureId) reason = 'No hay fixture seleccionado.';
    else if (!selected) reason = 'El fixture seleccionado no existe en el catálogo actual.';
    else if (!hasTelemetry || !telemetryIdentityValid || !teamsValid) reason = 'La telemetría no corresponde al fixture seleccionado.';
    else if (!oddsIdentityValid) reason = liveOdds.length === 0 ? 'Sin cuotas capturadas para este partido.' : 'Las cuotas no corresponden al fixture seleccionado.';
    return { ok: Boolean(selectedCanonicalFixtureId && selected && hasTelemetry && telemetryIdentityValid && teamsValid && oddsIdentityValid), reason, selected };
  }, [liveFixtures, selectedCanonicalFixtureId, detailedTelemetry, matchState, liveOdds, targetMarket]);

  const evaluationResult = useMemo(() => {
    if (fixtureIntegrity.ok) return evaluateInPlayMarket(matchState, liveOdds, targetMarket, bankroll, baseConfidence, goalsLine, thresholdAlta, thresholdMedia);
    const marketProbabilities = calculateInPlayPoisson(matchState, goalsLine);
    return {
      matchState,
      marketProbabilities,
      quantResult: { sumImpliedProb: 0, houseMarginPercent: 0, options: [], overallVerdict: 'NO APOSTAR' as VerdictType, reasons: [fixtureIntegrity.reason] },
      isStale: true,
      staleReason: \`ANÁLISIS BLOQUEADO — DATOS DE FIXTURES DESALINEADOS. \${fixtureIntegrity.reason}\`,
      diffSecondsWithOdds: 0,
      dataAgeSeconds: 0,
      adjustedConfidence: 'BAJA' as ConfidenceLevel,
      confidenceReasons: [fixtureIntegrity.reason],
      verdict: 'NO APOSTAR' as VerdictType,
      verdictExplanation: \`ANÁLISIS BLOQUEADO — DATOS DE FIXTURES DESALINEADOS. \${fixtureIntegrity.reason}\`,
      suggestedStakePercent: 0,
      suggestedStakeAmount: 0,
      dataQuality: undefined,
    };
  }, [fixtureIntegrity.ok, fixtureIntegrity.reason, matchState, liveOdds, targetMarket, bankroll, baseConfidence, goalsLine, thresholdAlta, thresholdMedia]);`,
  'integrity gate'
);

s = s.replace(
  /onChange=\{\(e\) => \{\n\s*setSelectedFixtureId\(e\.target\.value\);\n\s*fetchFixtureDetails\(e\.target\.value\);\n\s*\}\}/,
  "onChange={(e) => { handleFixtureSelection(e.target.value); }}"
);

for (const [oldValue, newValue] of [
  ['value={matchState.liveXgHome ?? 1.2}', "value={matchState.liveXgHome ?? ''}"],
  ['value={matchState.liveXgAway ?? 0.8}', "value={matchState.liveXgAway ?? ''}"],
  ['value={matchState.totalShotsHome ?? 10}', "value={matchState.totalShotsHome ?? ''}"],
  ['value={matchState.totalShotsAway ?? 6}', "value={matchState.totalShotsAway ?? ''}"],
  ['value={matchState.shotsOnTargetHome ?? 4}', "value={matchState.shotsOnTargetHome ?? ''}"],
  ['value={matchState.shotsOnTargetAway ?? 2}', "value={matchState.shotsOnTargetAway ?? ''}"],
  ['value={matchState.possessionHome ?? 50}', "value={matchState.possessionHome ?? ''}"],
]) s = s.replace(oldValue, newValue);

const marker = '        {/* 2. Match Selector & Telemetry Overview */}';
const indicator = `        <div className={\`flex items-center justify-between gap-3 px-3 py-2 rounded border text-xs font-mono \${fixtureIntegrity.ok ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300' : 'bg-rose-950/40 border-rose-800 text-rose-300'}\`}>
          <span className="font-bold">INTEGRIDAD DEL FIXTURE: {fixtureIntegrity.ok ? 'OK' : 'ERROR'}</span>
          <span>{fixtureIntegrity.ok ? selectedCanonicalFixtureId : fixtureIntegrity.reason}</span>
        </div>

`;
if (!s.includes(marker)) throw new Error('PATCH FAILED: integrity indicator marker');
s = s.replace(marker, indicator + marker);

const marker2 = '      {/* 5. In-Play Quantitative Protocol Table (9 Columns) */}';
const block = `      {!fixtureIntegrity.ok && (
        <div className="bg-rose-950/50 border-2 border-rose-700 rounded-lg p-4 text-sm text-rose-200 font-mono">
          <div className="font-bold">ANÁLISIS BLOQUEADO — DATOS DE FIXTURES DESALINEADOS.</div>
          <div className="mt-1 text-xs">{fixtureIntegrity.reason}</div>
          <div className="mt-1 text-xs">No se calcula EV, Kelly, stake ni veredicto de apuesta hasta que telemetría, cuotas, eventos y fixture compartan el mismo canonicalFixtureId.</div>
        </div>
      )}

`;
if (!s.includes(marker2)) throw new Error('PATCH FAILED: quantitative marker');
s = s.replace(marker2, block + marker2);

s = s.replace('{evaluationResult.verdict}', "{fixtureIntegrity.ok ? evaluationResult.verdict : 'ANÁLISIS BLOQUEADO'}");
s = s.replace("{evaluationResult.verdict === 'APOSTAR' && (", "{fixtureIntegrity.ok && evaluationResult.verdict === 'APOSTAR' && (");
s = s.replace("{isManualMode && (", "{isManualMode && liveFixtures.some((f: any) => f.isSample || String(f.id).startsWith('sample-')) && (");

fs.writeFileSync(path, s, 'utf8');
process.stdout.write('Fixture integrity patch applied.\n');
