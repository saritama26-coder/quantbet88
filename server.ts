// ============================================================================
// RADAR — GET /api/fixtures
// MODO REAL EXCLUSIVO
//
// Fuente única: API-Football
// NO utiliza catálogos DEMO como fallback.
// ============================================================================

app.get('/api/fixtures', async (req, res) => {
  const requestedDate =
    req.query.date
      ? String(req.query.date).trim()
      : new Date().toISOString().split('T')[0];

  const requestedCountry = req.query.country
    ? String(req.query.country).trim()
    : '';

  const requestedLeague = req.query.league
    ? String(req.query.league).trim()
    : '';

  const cacheKey =
    `${requestedDate}|${requestedCountry}|${requestedLeague}`;

  const now = Date.now();

  try {
    // ------------------------------------------------------------------------
    // 1. VERIFICAR API KEY
    // ------------------------------------------------------------------------

    const { exists, key } = checkLiveDataApiKey();

    if (!exists || !key) {
      return res.status(503).json({
        success: false,
        dataMode: 'REAL',
        dataStatus: 'UNAVAILABLE',
        isDemo: false,
        source: 'API_FOOTBALL',
        error:
          'LIVE_DATA_API_KEY no está configurada correctamente en las variables de entorno del servidor.',
        count: 0,
        fixtures: [],
        timestamp: new Date().toISOString(),
      });
    }

    // ------------------------------------------------------------------------
    // 2. UTILIZAR CACHÉ SOLO SI CONTIENE DATOS REALES
    // ------------------------------------------------------------------------

    const cached = dateFixturesCacheMap.get(cacheKey);

    if (
      cached &&
      now - cached.timestamp < FIXTURES_DATE_CACHE_TTL_MS &&
      Array.isArray(cached.data)
    ) {
      const cacheAgeSeconds = Math.floor(
        (now - cached.timestamp) / 1000
      );

      return res.json({
        success: true,
        dataMode: 'REAL',
        dataStatus:
          cached.data.length > 0 ? 'READY' : 'READY_EMPTY',
        isDemo: false,
        source: 'API_FOOTBALL',
        date: requestedDate,
        cached: true,
        cacheAgeSeconds,
        count: cached.data.length,
        fixtures: cached.data,
        timestamp: new Date().toISOString(),
        apiFootballRequestsRemaining,
      });
    }

    // ------------------------------------------------------------------------
    // 3. CONSULTAR API-FOOTBALL
    // ------------------------------------------------------------------------

    const query = new URLSearchParams({
      date: requestedDate,
    });

    const apiUrl =
      `https://v3.football.api-sports.io/fixtures?${query.toString()}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-apisports-key': key,
        'x-apisports-host': 'v3.football.api-sports.io',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(9000),
    });

    // ------------------------------------------------------------------------
    // 4. ACTUALIZAR CUOTA DE REQUESTS
    // ------------------------------------------------------------------------

    const remainingHeader =
      response.headers.get('x-ratelimit-requests-remaining');

    if (remainingHeader !== null) {
      const parsedRemaining = Number.parseInt(
        remainingHeader,
        10
      );

      if (Number.isFinite(parsedRemaining)) {
        apiFootballRequestsRemaining = parsedRemaining;
      }
    }

    // ------------------------------------------------------------------------
    // 5. ERROR DE API-FOOTBALL
    //
    // IMPORTANTE:
    // NO utilizar generateMasterRadarCatalog()
    // NO utilizar SAMPLE_LIVE_FIXTURES
    // NO generar fixtures artificiales.
    // ------------------------------------------------------------------------

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        dataMode: 'REAL',
        dataStatus: 'ERROR',
        isDemo: false,
        source: 'API_FOOTBALL',
        upstreamStatus: response.status,
        error:
          `API-Football respondió con HTTP ${response.status}.`,
        count: 0,
        fixtures: [],
        timestamp: new Date().toISOString(),
      });
    }

    // ------------------------------------------------------------------------
    // 6. PARSEAR RESPUESTA
    // ------------------------------------------------------------------------

    const json = (await response.json()) as {
      response?: any[];
      errors?: Record<string, unknown>;
      results?: number;
    };

    // API-Football puede devolver errores dentro del JSON
    if (
      json.errors &&
      Object.keys(json.errors).length > 0
    ) {
      return res.status(502).json({
        success: false,
        dataMode: 'REAL',
        dataStatus: 'ERROR',
        isDemo: false,
        source: 'API_FOOTBALL',
        error: 'API-Football devolvió errores en la respuesta.',
        details: json.errors,
        count: 0,
        fixtures: [],
        timestamp: new Date().toISOString(),
      });
    }

    const rawFixtures = Array.isArray(json.response)
      ? json.response
      : [];

    // ------------------------------------------------------------------------
    // 7. NORMALIZAR A RadarFixture
    // ------------------------------------------------------------------------

    const radarFixtures = rawFixtures
      .filter(
        (item: any) =>
          item?.fixture?.id &&
          item?.teams?.home?.name &&
          item?.teams?.away?.name
      )
      .map((item: any) => {
        const fixtureId = Number(item.fixture.id);

        const competition =
          String(item.league?.name || 'Liga Oficial');

        const country =
          String(item.league?.country || 'Internacional');

        const round =
          String(item.league?.round || 'Fase Regular');

        const homeTeam =
          String(item.teams.home.name);

        const awayTeam =
          String(item.teams.away.name);

        const fixtureDate =
          String(item.fixture.date);

        // --------------------------------------------------------------
        // CANONICAL FIXTURE ID
        // --------------------------------------------------------------

        const canonical =
          generateCanonicalFixtureId({
            fixtureId,
            homeTeam,
            awayTeam,
            competition,
            date: fixtureDate,
          });

        // --------------------------------------------------------------
        // IMPORTANCE
        // --------------------------------------------------------------

        const importance =
          calculateImportanceScore({
            competition,
            country,
            round,
            homeTeam,
            awayTeam,
          });

        // --------------------------------------------------------------
        // STATUS
        // --------------------------------------------------------------

        const status =
          normalizeFixtureStatus(
            item.fixture?.status?.short
          );

        // --------------------------------------------------------------
        // OPPORTUNITY
        //
        // Todavía no afirmamos que exista value porque
        // /api/fixtures no obtiene cuotas.
        // --------------------------------------------------------------

        const opportunity =
          calculateOpportunityScore({
            hasOdds: false,
            dataQuality:
              status === 'LIVE'
                ? 'LIVE'
                : 'MEDIUM',
            hasXg: false,
            hasLineups: false,
            isLive: status === 'LIVE',
          });

        // --------------------------------------------------------------
        // RadarFixture
        // SOLO DATOS PROCEDENTES DE API-FOOTBALL
        // --------------------------------------------------------------

        return {
          id: String(fixtureId),

          canonicalFixtureId:
            canonical.canonicalId,

          fixtureId,

          date: fixtureDate,

          timestamp:
            Number(item.fixture.timestamp || 0),

          status,

          statusShort:
            String(
              item.fixture?.status?.short || 'NS'
            ),

          elapsed:
            item.fixture?.status?.elapsed ?? null,

          leagueId:
            Number(item.league?.id || 0),

          league: competition,

          country,

          round,

          homeTeam,

          awayTeam,

          homeLogo:
            String(
              item.teams?.home?.logo || ''
            ),

          awayLogo:
            String(
              item.teams?.away?.logo || ''
            ),

          scoreHome:
            item.goals?.home ?? null,

          scoreAway:
            item.goals?.away ?? null,

          importanceScore:
            importance.importanceScore,

          tierLabel:
            importance.tierLabel,

          opportunityScore:
            opportunity.opportunityScore,

          opportunityVerdict:
            opportunity.verdict,

          hasEnoughData: true,

          // Las cuotas pertenecen a otro endpoint.
          hasOdds: false,

          dataQuality:
            status === 'LIVE'
              ? 'LIVE'
              : 'MEDIUM',

          isDemo: false,

          dataMode: 'REAL',

          source: 'API_FOOTBALL',
        };
      });

    // ------------------------------------------------------------------------
    // 8. FILTROS
    // ------------------------------------------------------------------------

    let filteredFixtures =
      radarFixtures;

    if (requestedCountry) {
      const countryNeedle =
        requestedCountry.toLowerCase();

      filteredFixtures =
        filteredFixtures.filter(
          (fixture: any) =>
            fixture.country
              .toLowerCase()
              .includes(countryNeedle)
        );
    }

    if (requestedLeague) {
      const leagueNeedle =
        requestedLeague.toLowerCase();

      filteredFixtures =
        filteredFixtures.filter(
          (fixture: any) =>
            fixture.league
              .toLowerCase()
              .includes(leagueNeedle)
        );
    }

    // ------------------------------------------------------------------------
    // 9. DEDUPLICACIÓN
    // ------------------------------------------------------------------------

    const deduped =
      deduplicateFixtures(
        filteredFixtures
      ).filter(
        (fixture: any) =>
          fixture &&
          fixture.canonicalFixtureId
      );

    // ------------------------------------------------------------------------
    // 10. SIN PARTIDOS
    //
    // Esto NO es un error y tampoco significa DEMO.
    // Significa que API-Football no devolvió fixtures válidos.
    // ------------------------------------------------------------------------

    if (deduped.length === 0) {
      dateFixturesCacheMap.set(
        cacheKey,
        {
          data: [],
          timestamp: now,
        }
      );

      return res.json({
        success: true,
        dataMode: 'REAL',
        dataStatus: 'READY_EMPTY',
        isDemo: false,
        source: 'API_FOOTBALL',
        date: requestedDate,
        cached: false,
        count: 0,
        fixtures: [],
        message:
          `API-Football no reportó partidos válidos para ${requestedDate}.`,
        timestamp: new Date().toISOString(),
        apiFootballRequestsRemaining,
      });
    }

    // ------------------------------------------------------------------------
    // 11. GUARDAR ÚNICAMENTE DATOS REALES EN CACHÉ
    // ------------------------------------------------------------------------

    dateFixturesCacheMap.set(
      cacheKey,
      {
        data: deduped,
        timestamp: now,
      }
    );

    // ------------------------------------------------------------------------
    // 12. RESPUESTA FINAL
    // ------------------------------------------------------------------------

    return res.json({
      success: true,

      dataMode: 'REAL',

      dataStatus: 'READY',

      isDemo: false,

      source: 'API_FOOTBALL',

      date: requestedDate,

      cached: false,

      count: deduped.length,

      fixtures: deduped,

      timestamp:
        new Date().toISOString(),

      apiFootballRequestsRemaining,
    });

  } catch (error: any) {

    console.error(
      'Error en /api/fixtures:',
      error?.message || error
    );

    // ------------------------------------------------------------------------
    // ERROR REAL
    //
    // Nunca usar catálogo demo como fallback.
    // ------------------------------------------------------------------------

    return res.status(502).json({
      success: false,

      dataMode: 'REAL',

      dataStatus: 'ERROR',

      isDemo: false,

      source: 'API_FOOTBALL',

      error:
        `No fue posible obtener los partidos reales desde API-Football: ${
          error?.message || 'error de conexión'
        }`,

      count: 0,

      fixtures: [],

      timestamp:
        new Date().toISOString(),
    });
  }
});