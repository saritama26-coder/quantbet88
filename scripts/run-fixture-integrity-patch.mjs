import fs from 'node:fs';

const patchPath = 'scripts/fix-fixture-integrity.mjs';
let code = fs.readFileSync(patchPath, 'utf8');

// Normalize the two JSX markers used by the existing patcher.
code = code
  .replace("const marker = '        {/* 2. Match Selector & Telemetry Overview */}';", "const marker = '      {/* 2. Match Selector & Telemetry Overview */}';")
  .replace("const marker2 = '      {/* 5. In-Play Quantitative Protocol Table (9 Columns) */}';", "const marker2 = '      {/* 5. In-Play Quantitative Protocol Table (9 Columns) */}';");

const patchedUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code);
await import(patchedUrl);

const path = 'src/components/LiveMatchAnalyzer.tsx';
let s = fs.readFileSync(path, 'utf8');

// V2: make the REAL-mode empty-state explicit and prevent the UI from
// interpreting an API-connected/no-live-fixture state as a broken fixture.
if (!s.includes('FIXTURE_INTEGRITY_PATCH_V2')) {
  s = s.replace(
    "// FIXTURE_INTEGRITY_PATCH_V1",
    `// FIXTURE_INTEGRITY_PATCH_V1\n// FIXTURE_INTEGRITY_PATCH_V2`
  );

  s = s.replace(
    "if (!selectedCanonicalFixtureId) reason = 'No hay fixture seleccionado.';",
    "if (!selectedCanonicalFixtureId) reason = liveFixtures.length === 0 ? 'API-Football conectada, pero no hay partidos LIVE disponibles en este momento.' : 'No hay fixture seleccionado.';"
  );

  // If Radar supplied a real fixture, keep it even when the live-list endpoint
  // temporarily returns an empty list. Never substitute demo data.
  const emptyBlock = `if (normalizedFixtures.length === 0) {`;
  if (s.includes(emptyBlock)) {
    s = s.replace(emptyBlock, `if (normalizedFixtures.length === 0 && !initialFixture) {`);
  }

  // If an initial real fixture exists but the current live catalog is empty,
  // create only a local representation of that same real fixture and fetch its
  // telemetry. This does not create synthetic/demo data.
  const emptyClose = `        });\n      } else {\n        const current = normalizedFixtures.find((f: any) => getCanonicalFixtureId(f) === selectedCanonicalFixtureIdRef.current) || normalizedFixtures[0];`;
  const emptyReplacement = `        });\n      } else if (initialFixture) {\n        const apiId = String(initialFixture.fixtureId || initialFixture.id || '');\n        const canonical = getCanonicalFixtureId(initialFixture);\n        if (apiId && canonical) {\n          const initialRealFixture = { ...initialFixture, id: apiId, fixtureId: apiId, canonicalFixtureId: canonical, isSample: false, isDemo: false };\n          setLiveFixtures([initialRealFixture]);\n          selectedCanonicalFixtureIdRef.current = canonical;\n          setSelectedFixtureId(apiId);\n          setSelectedCanonicalFixtureId(canonical);\n          setDetailedTelemetry(null);\n          setLiveOdds(fixtureOddsById[canonical] || []);\n          const requestToken = ++fixtureRequestRef.current;\n          await fetchFixtureDetails(apiId, canonical, requestToken);\n        }\n      } else {\n        const current = normalizedFixtures.find((f: any) => getCanonicalFixtureId(f) === selectedCanonicalFixtureIdRef.current) || normalizedFixtures[0];`;
  if (s.includes(emptyClose)) s = s.replace(emptyClose, emptyReplacement);

  fs.writeFileSync(path, s, 'utf8');
  process.stdout.write('Fixture integrity patch runner V2 completed.\n');
} else {
  process.stdout.write('Fixture integrity patch runner V2 already completed.\n');
}
