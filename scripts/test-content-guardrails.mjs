#!/usr/bin/env node
import { assertNoPlaceholders, assertNoPlaceholdersInPayload } from '../intelligence/content-guardrails.js';

let pass = 0, fail = 0;
const ok = (label) => { pass++; console.log(`  ✅ ${label}`); };
const ko = (label, detail) => { fail++; console.log(`  ❌ ${label}: ${detail}`); };

// 1. Clean HTML → no throw, no findings
try {
  const r = assertNoPlaceholders('<p>Prix 49€ à NAIA, compose *143#.</p>');
  r.length === 0 ? ok('clean HTML returns []') : ko('clean HTML', `returned ${r.length}`);
} catch (e) { ko('clean HTML threw', e.message); }

// 2. [VERIFY] marker → throws
try {
  assertNoPlaceholders('<p>Prix [VERIFY - avril 2026]. Lorem.</p>');
  ko('VERIFY marker', 'did not throw');
} catch (e) {
  e.name === 'ContentGuardrailError' && e.findings.length === 1 && e.findings[0].pattern === 'VERIFY'
    ? ok('VERIFY marker throws ContentGuardrailError')
    : ko('VERIFY marker', `wrong error: ${e.name} findings=${e.findings?.length}`);
}

// 3. [AFFILIATE:X] in schema JSON-LD → throws (real bug we just fixed)
try {
  const badSchema = JSON.stringify({ offers: [{ url: '[AFFILIATE:holafly-philippines]' }] });
  const html = `<p>Body OK.</p><script type="application/ld+json">${badSchema}</script>`;
  assertNoPlaceholders(html);
  ko('AFFILIATE in schema', 'did not throw');
} catch (e) {
  e.findings?.[0]?.pattern === 'AFFILIATE' ? ok('AFFILIATE in schema throws') : ko('AFFILIATE', e.message);
}

// 4. warnOnly=true → logs + returns findings, no throw
try {
  const r = assertNoPlaceholders('[TODO: write intro]', { warnOnly: true });
  r.length === 1 && r[0].pattern === 'TODO' ? ok('warnOnly returns findings') : ko('warnOnly', `got ${r.length}`);
} catch (e) { ko('warnOnly unexpectedly threw', e.message); }

// 5. Multiple markers → all captured
try {
  assertNoPlaceholders('<p>[VERIFY] [TODO] [FIXME] [XXX] [AFFILIATE:x]</p>');
  ko('multi', 'did not throw');
} catch (e) {
  e.findings.length === 5 ? ok('multi-marker: all 5 captured') : ko('multi', `got ${e.findings.length}/5`);
}

// 6. Payload scanner — catches marker inside meta
try {
  assertNoPlaceholdersInPayload({
    title: 'Clean title',
    content: '<p>Clean body</p>',
    meta: { rank_math_schema: '{"offers":[{"url":"[AFFILIATE:holafly]"}]}' },
  });
  ko('payload meta scan', 'did not throw');
} catch (e) {
  e.findings?.some(f => f.field === 'meta' && f.pattern === 'AFFILIATE')
    ? ok('payload meta scan catches AFFILIATE inside meta')
    : ko('payload meta scan', `findings: ${JSON.stringify(e.findings)}`);
}

// 7. Non-string / null input → safe no-op
try {
  const r = assertNoPlaceholders(null);
  r.length === 0 ? ok('null input safe') : ko('null input', 'non-empty');
} catch (e) { ko('null input threw', e.message); }

// 8. Regression: should NOT false-positive on third-party JS patterns like ${b}, ${document.cookie}, TBA
try {
  assertNoPlaceholders('var x = ${b}; TBA is a valid airport code.');
  ok('third-party JS patterns not flagged (no false positive)');
} catch (e) { ko('false positive on third-party', e.message); }

console.log(`\n${pass}/${pass + fail} passed.`);
process.exit(fail === 0 ? 0 : 1);
