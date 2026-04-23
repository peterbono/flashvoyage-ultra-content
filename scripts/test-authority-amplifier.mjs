#!/usr/bin/env node
/**
 * scripts/test-authority-amplifier.mjs
 *
 * Smoke test for the authority amplifier module. Asserts:
 *   - amplifyArticle returns a result
 *   - a queue file is written at data/amplifier-queue/<slug>.json
 *   - file has required top-level fields
 *   - either:
 *       (a) ≥3 actions, each with required fields, OR
 *       (b) degraded=true (sibling agent scrape unavailable; acceptable)
 *
 * Fixture: esim-philippines-globe-smart-comparatif-2026
 *   (doesn't need to exist as a published article — the amplifier only
 *    needs slug+keyword+tokens as inputs.)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { amplifyArticle, getQueueForSlug } from '../intelligence/authority-amplifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const FIXTURE = {
  slug: 'esim-philippines-globe-smart-comparatif-2026',
  title: 'ESIM Philippines : comparatif Globe vs Smart en 2026',
  url: 'https://flashvoyage.com/esim-philippines-globe-smart-comparatif-2026/',
  primaryKeyword: 'esim philippines',
  topicTokens: ['esim', 'philippines', 'globe', 'smart', 'asie-sud-est'],
};

const REQUIRED_ACTION_FIELDS = ['id', 'platform', 'type', 'status', 'targetUrl', 'score', 'insertText', 'createdAt'];
const REQUIRED_QUEUE_FIELDS = ['slug', 'generatedAt', 'generator', 'actions'];

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); pass++; }
  else { console.log(`  ✗ ${msg}`); fail++; }
}

(async () => {
  console.log(`[test] fixture slug: ${FIXTURE.slug}`);
  const result = await amplifyArticle(FIXTURE);
  console.log(`[test] result: queued=${result.queued} byPlatform=${JSON.stringify(result.byPlatform)}`);

  assert(!!result, 'amplifyArticle returned a result');
  assert(typeof result.queued === 'number', 'result.queued is a number');
  assert(typeof result.queueFile === 'string', 'result.queueFile is a string');

  const queuePath = path.join(REPO_ROOT, 'data', 'amplifier-queue', `${FIXTURE.slug}.json`);
  assert(fs.existsSync(queuePath), `queue file exists at ${queuePath}`);
  const doc = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
  for (const f of REQUIRED_QUEUE_FIELDS) {
    assert(Object.prototype.hasOwnProperty.call(doc, f), `queue doc has field "${f}"`);
  }

  const actions = await getQueueForSlug(FIXTURE.slug);
  assert(Array.isArray(actions), 'getQueueForSlug returned an array');

  if (doc.degraded) {
    console.log('[test] NOTE: queue is degraded (sibling scrape unavailable) — accepting empty/minimal actions');
    assert(true, 'degraded state tolerated');
  } else {
    assert(actions.length >= 3, `queue has at least 3 actions (got ${actions.length})`);
    for (const a of actions.slice(0, 3)) {
      for (const f of REQUIRED_ACTION_FIELDS) {
        assert(a[f] !== undefined && a[f] !== null && a[f] !== '', `action "${a.id || '(no id)'}" has "${f}"`);
      }
    }
  }

  console.log(`\n[test] ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('[test] fatal:', e);
  process.exit(1);
});
