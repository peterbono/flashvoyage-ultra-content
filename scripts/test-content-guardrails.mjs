#!/usr/bin/env node
import { assertNoPlaceholders, assertNoPlaceholdersInPayload, assertSchemaWellFormed, assertContentSafeToPublish } from '../intelligence/content-guardrails.js';

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

// =========================================================================
// JSON-LD structural guardrail tests (added 2026-04-29 after GSC critical
// emails on Product missing image + duplicate FAQPage on esim-philippines)
// =========================================================================

const cleanSchema = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Article', headline: 'X', datePublished: '2026-04-29', author: { '@type': 'Person', name: 'Florian' } },
    { '@type': 'Product', name: 'Holafly PH', image: 'https://flashvoyage.com/x.jpg', offers: [{ '@type': 'Offer', price: '19', priceCurrency: 'EUR' }] },
    { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Q1', acceptedAnswer: { '@type': 'Answer', text: 'A1' } }] }
  ]
})}</script>`;

// 9. Clean schema → no findings
try {
  const r = assertSchemaWellFormed(cleanSchema);
  r.length === 0 ? ok('clean schema returns []') : ko('clean schema', `${r.length} findings: ${JSON.stringify(r[0])}`);
} catch (e) { ko('clean schema threw', e.message); }

// 10. Wrapper noise (real bug)
try {
  const wrapped = `<script type="application/ld+json">${JSON.stringify({ note: 'helper', schema: { '@context': 'https://schema.org', '@graph': [] } })}</script>`;
  assertSchemaWellFormed(wrapped);
  ko('wrapper noise', 'did not throw');
} catch (e) {
  e.name === 'SchemaGuardrailError' && e.findings.some(f => f.type === 'WRAPPER_NOISE') ? ok('wrapper noise throws SchemaGuardrailError') : ko('wrapper', e.message);
}

// 11. Product missing image
try {
  const bad = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'Product', name: 'Holafly', offers: [{ '@type': 'Offer', price: '19', priceCurrency: 'EUR' }] }
    ]
  })}</script>`;
  assertSchemaWellFormed(bad);
  ko('product no image', 'did not throw');
} catch (e) {
  e.findings.some(f => f.type === 'PRODUCT_MISSING_IMAGE') ? ok('Product without image flagged') : ko('product image', JSON.stringify(e.findings));
}

// 12. Duplicate FAQPage across blocks
try {
  const dup = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] })}</script>` +
              `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] })}</script>`;
  assertSchemaWellFormed(dup);
  ko('FAQPage dup', 'did not throw');
} catch (e) {
  e.findings.some(f => f.type === 'FAQPAGE_DUPLICATE') ? ok('Duplicate FAQPage flagged') : ko('faqdup', JSON.stringify(e.findings));
}

// 13. Missing @context
try {
  const bad = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Article', headline: 'x' })}</script>`;
  assertSchemaWellFormed(bad);
  ko('missing context', 'did not throw');
} catch (e) {
  e.findings.some(f => f.type === 'MISSING_CONTEXT') ? ok('Missing @context flagged') : ko('ctx', JSON.stringify(e.findings));
}

// 14. Invalid JSON
try {
  const bad = `<script type="application/ld+json">{not valid}</script>`;
  assertSchemaWellFormed(bad);
  ko('invalid JSON', 'did not throw');
} catch (e) {
  e.findings.some(f => f.type === 'INVALID_JSON') ? ok('Invalid JSON flagged') : ko('json', JSON.stringify(e.findings));
}

// 15. Combined guardrail (placeholder + schema) catches both classes of issues
try {
  assertContentSafeToPublish({
    content: `<p>[VERIFY - avril 2026]</p>` + `<script type="application/ld+json">${JSON.stringify({ note: 'x', schema: {} })}</script>`,
  });
  ko('combined guardrail', 'did not throw');
} catch (e) {
  // First guardrail to fire is placeholder (cheaper), so this catches VERIFY
  e.name === 'ContentGuardrailError' || e.name === 'SchemaGuardrailError' ? ok('combined guardrail throws') : ko('combined', e.message);
}

// 16. No JSON-LD at all → no schema check needed, returns []
try {
  const r = assertSchemaWellFormed('<p>No schema here.</p>');
  r.length === 0 ? ok('no JSON-LD blocks → no findings') : ko('no LD', `got ${r.length}`);
} catch (e) { ko('no LD threw', e.message); }

console.log(`\n${pass}/${pass + fail} passed.`);
process.exit(fail === 0 ? 0 : 1);
