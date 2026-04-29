/**
 * Content Guardrails — last-line safety check before any WP PUT/POST that
 * writes article content.
 *
 * Catches editorial placeholders that leaked past the review phase:
 *   [VERIFY...]   [TODO...]   [FIXME...]   [XXX...]
 *   [PLACEHOLDER...]   [AFFILIATE:...]
 *
 * If any are found, throws with the list + positions so the publish pipeline
 * aborts BEFORE sending to WordPress. A failed publish is recoverable — a
 * shipped article with `[VERIFY - avril 2026]` visible to readers is not.
 *
 * Usage:
 *   import { assertNoPlaceholders } from './intelligence/content-guardrails.js';
 *   assertNoPlaceholders(post.content, { context: 'enhanced-ultra-generator:publish' });
 *   await axios.post(WP_URL + '/wp-json/wp/v2/posts', post, { auth });
 *
 * Bug that triggered this module: 2026-04-24 — `esim-philippines` rewrite
 * shipped with `[VERIFY - avril 2026]` visible inline (body + schema JSON-LD)
 * because the strategist agent emitted them as review markers and nobody
 * stripped them pre-push.
 */

const DEFAULT_PATTERNS = [
  { name: 'VERIFY',      regex: /\[VERIFY[^\]]*\]/g,           severity: 'error' },
  { name: 'TODO',        regex: /\[TODO[^\]]*\]/g,             severity: 'error' },
  { name: 'FIXME',       regex: /\[FIXME[^\]]*\]/g,            severity: 'error' },
  { name: 'XXX',         regex: /\[XXX[^\]]*\]/g,              severity: 'error' },
  { name: 'PLACEHOLDER', regex: /\[PLACEHOLDER[^\]]*\]/gi,     severity: 'error' },
  { name: 'AFFILIATE',   regex: /\[AFFILIATE:[^\]]+\]/g,       severity: 'error' },
];

/**
 * Scan a content string for forbidden editorial markers.
 *
 * @param {string} html - HTML content about to be persisted
 * @param {object} [options]
 * @param {string} [options.context='publish'] - label shown in the thrown error
 * @param {boolean} [options.warnOnly=false] - if true, log + return findings
 *   instead of throwing. Useful in auto-refresh paths where we prefer
 *   surviving over aborting.
 * @param {Array} [options.patterns] - override the default pattern list
 * @returns {Array<{marker,pattern,position,lineHint}>} findings (empty array
 *   if clean). Throws Error if warnOnly=false AND findings non-empty.
 */
export function assertNoPlaceholders(html, options = {}) {
  const {
    context = 'publish',
    warnOnly = false,
    patterns = DEFAULT_PATTERNS,
  } = options;

  if (!html || typeof html !== 'string') return [];

  const findings = [];
  for (const p of patterns) {
    // Reset regex state (defensive — in case the caller passes a stateful one)
    p.regex.lastIndex = 0;
    for (const m of html.matchAll(p.regex)) {
      // Compute a rough line number for the error message
      const before = html.slice(0, m.index);
      const line = (before.match(/\n/g) || []).length + 1;
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineHint = html.slice(lineStart, Math.min(html.length, m.index + m[0].length + 40)).replace(/\n/g, ' ').slice(0, 120);
      findings.push({
        marker: m[0],
        pattern: p.name,
        position: m.index,
        line,
        lineHint,
      });
    }
  }

  if (findings.length === 0) return [];

  const summary = findings.slice(0, 10).map(f =>
    `  · [${f.pattern}] "${f.marker}" at line ~${f.line}: …${f.lineHint}…`
  ).join('\n');
  const more = findings.length > 10 ? `\n  · …and ${findings.length - 10} more` : '';
  const msg = `Content guardrail failed (${context}): ${findings.length} editorial placeholder(s) in HTML.\n${summary}${more}\n\nFix: strip or resolve these markers BEFORE publishing. See intelligence/content-guardrails.js for allowed patterns.`;

  if (warnOnly) {
    // Use console.warn so it surfaces in any log tail without blocking
    // eslint-disable-next-line no-console
    console.warn('[content-guardrails]', msg);
    return findings;
  }
  const err = new Error(msg);
  err.name = 'ContentGuardrailError';
  err.findings = findings;
  err.context = context;
  throw err;
}

/**
 * Convenience: scan a WP post payload that may contain `content`, `excerpt`,
 * `title`, and potentially JSON-LD in `meta` — all places markers can hide.
 */
export function assertNoPlaceholdersInPayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object') return [];
  const context = options.context || 'publish-payload';
  const fields = ['content', 'excerpt', 'title'];
  const all = [];
  for (const field of fields) {
    const value = typeof payload[field] === 'string'
      ? payload[field]
      : payload[field]?.rendered || payload[field]?.raw;
    if (!value) continue;
    const found = assertNoPlaceholders(value, {
      ...options,
      context: `${context}:${field}`,
      warnOnly: true, // aggregate, then decide
    });
    all.push(...found.map(f => ({ ...f, field })));
  }
  // Also scan stringified meta (covers custom Rank Math schema fields)
  if (payload.meta && typeof payload.meta === 'object') {
    const metaStr = JSON.stringify(payload.meta);
    const found = assertNoPlaceholders(metaStr, {
      ...options,
      context: `${context}:meta`,
      warnOnly: true,
    });
    all.push(...found.map(f => ({ ...f, field: 'meta' })));
  }
  if (all.length === 0) return [];
  if (options.warnOnly) {
    // eslint-disable-next-line no-console
    console.warn('[content-guardrails] payload findings:', all.length);
    return all;
  }
  const err = new Error(`Content guardrail failed (${context}): ${all.length} editorial placeholder(s) across ${[...new Set(all.map(f => f.field))].join(', ')}.`);
  err.name = 'ContentGuardrailError';
  err.findings = all;
  err.context = context;
  throw err;
}

export const PLACEHOLDER_PATTERNS = DEFAULT_PATTERNS;

// ---------------------------------------------------------------------------
// JSON-LD structural validator
// ---------------------------------------------------------------------------
// Catches schema bugs that Google Search Console flags as critical:
//   - Wrapper noise (e.g., `{note: "...", schema: {...}}` instead of pure JSON-LD)
//   - Product schema missing `image` field (rejects Merchant listing rich snippet)
//   - More than one FAQPage on the same page (rejects FAQ rich snippet)
//   - Missing @context at root
//
// Bug that triggered this: 2026-04-29 — esim-philippines shipped with all 3
// of the above issues, GSC sent 2 critical "rich snippet rejected" emails.

const JSONLD_SCRIPT_REGEX = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Scan an HTML body for JSON-LD blocks and validate each structurally.
 *
 * @param {string} html - HTML content (usually the WP post body about to be persisted)
 * @param {object} [options]
 * @param {string} [options.context='publish']
 * @param {boolean} [options.warnOnly=false]
 * @returns {Array<{type, message, blockIndex, severity}>} findings (empty if clean).
 *   Throws SchemaGuardrailError if !warnOnly and findings non-empty.
 */
export function assertSchemaWellFormed(html, options = {}) {
  const { context = 'publish', warnOnly = false } = options;
  if (!html || typeof html !== 'string') return [];

  const findings = [];
  const blocks = [...html.matchAll(JSONLD_SCRIPT_REGEX)];

  // Track FAQPage count across all blocks (Google rejects rich snippet if > 1)
  let faqPageCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const inner = blocks[i][1].trim();
    let parsed;
    try {
      parsed = JSON.parse(inner);
    } catch (e) {
      findings.push({ type: 'INVALID_JSON', message: `block[${i}]: JSON parse failed (${e.message.slice(0, 80)})`, blockIndex: i, severity: 'error' });
      continue;
    }

    // 1. Wrapper noise — root has `schema` or `note` keys but no @context
    if (!parsed['@context'] && !parsed['@graph'] && (parsed.note || parsed.schema)) {
      findings.push({
        type: 'WRAPPER_NOISE',
        message: `block[${i}]: JSON-LD wrapped in {note,schema} instead of being raw schema. Strip the wrapper before injecting.`,
        blockIndex: i,
        severity: 'error',
      });
      continue;
    }

    // 2. Missing @context at root (must be on the outer object that holds @graph or @type)
    if (!parsed['@context']) {
      findings.push({
        type: 'MISSING_CONTEXT',
        message: `block[${i}]: missing @context at root. Schema.org requires "@context": "https://schema.org".`,
        blockIndex: i,
        severity: 'error',
      });
    }

    // Walk @graph (or treat root as the only entry)
    const entries = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];

    for (let j = 0; j < entries.length; j++) {
      const entry = entries[j];
      if (!entry || typeof entry !== 'object') continue;
      const type = entry['@type'];

      // 3. Product without image — Google requires image on Product/Offer for Merchant listing
      if (type === 'Product') {
        if (!entry.image) {
          findings.push({
            type: 'PRODUCT_MISSING_IMAGE',
            message: `block[${i}].@graph[${j}]: Product "${entry.name || '?'}" missing "image" field. Google rejects Merchant rich snippet without it.`,
            blockIndex: i,
            severity: 'error',
          });
        }
        if (!entry.name) {
          findings.push({
            type: 'PRODUCT_MISSING_NAME',
            message: `block[${i}].@graph[${j}]: Product missing "name" field.`,
            blockIndex: i,
            severity: 'error',
          });
        }
        if (!entry.offers && !entry.aggregateRating && !entry.review) {
          findings.push({
            type: 'PRODUCT_MISSING_OFFERS',
            message: `block[${i}].@graph[${j}]: Product "${entry.name || '?'}" needs at least one of: offers, aggregateRating, review.`,
            blockIndex: i,
            severity: 'error',
          });
        }
      }

      // 4. FAQPage counter — track total across blocks
      if (type === 'FAQPage') {
        faqPageCount++;
      }
    }
  }

  // 5. Multiple FAQPage = rich snippet rejected
  if (faqPageCount > 1) {
    findings.push({
      type: 'FAQPAGE_DUPLICATE',
      message: `Found ${faqPageCount} FAQPage entries across all JSON-LD blocks. Google rejects FAQ rich snippet if more than one. Ensure only one FAQPage per page (Rank Math may auto-generate one — coordinate with it).`,
      blockIndex: -1,
      severity: 'error',
    });
  }

  if (findings.length === 0) return [];

  const summary = findings.slice(0, 10).map(f => `  · [${f.type}] ${f.message}`).join('\n');
  const more = findings.length > 10 ? `\n  · …and ${findings.length - 10} more` : '';
  const msg = `Schema guardrail failed (${context}): ${findings.length} structural issue(s) in JSON-LD blocks.\n${summary}${more}\n\nFix: parse + repair before injecting. See intelligence/content-guardrails.js.`;

  if (warnOnly) {
    // eslint-disable-next-line no-console
    console.warn('[schema-guardrails]', msg);
    return findings;
  }
  const err = new Error(msg);
  err.name = 'SchemaGuardrailError';
  err.findings = findings;
  err.context = context;
  throw err;
}

/**
 * Convenience: run BOTH placeholder + schema guardrails on a payload.
 * This is what publish-time wiring should call.
 */
export function assertContentSafeToPublish(payload, options = {}) {
  // Always run placeholder check first (cheaper, more critical for visible markers)
  assertNoPlaceholdersInPayload(payload, options);
  // Then schema check on content field
  const html = typeof payload.content === 'string' ? payload.content : payload.content?.raw || payload.content?.rendered;
  if (html) {
    assertSchemaWellFormed(html, options);
  }
}
