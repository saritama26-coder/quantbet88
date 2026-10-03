import fs from 'node:fs';

const patchPath = 'scripts/fix-fixture-integrity.mjs';
let code = fs.readFileSync(patchPath, 'utf8');

// The original patcher used 8-space JSX markers while LiveMatchAnalyzer.tsx
// uses 6 spaces at those section markers. Normalize the patcher's literals
// before executing it so the existing integrity patch can complete.
code = code
  .replace("const marker = '        {/* 2. Match Selector & Telemetry Overview */}';", "const marker = '      {/* 2. Match Selector & Telemetry Overview */}';")
  .replace("const marker2 = '      {/* 5. In-Play Quantitative Protocol Table (9 Columns) */}';", "const marker2 = '      {/* 5. In-Play Quantitative Protocol Table (9 Columns) */}';");

const patchedUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code);
await import(patchedUrl);
