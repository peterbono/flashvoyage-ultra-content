#!/usr/bin/env node

/**
 * TRAVELPAYOUTS PARTNER LINKS CLIENT (intelligence layer)
 *
 * Thin wrapper around `POST /links/v1/create` with:
 *  - disk cache (data/live-cache/tp-links.json, TTL 7d)
 *  - in-memory cache (per-process)
 *  - token-bucket rate limiting (100 req/min)
 *  - never-throw contract — returns { success, partnerUrl?, error?, fallbackUrl? }
 *
 * Env:
 *  - TRAVELPAYOUTS_API_TOKEN (required; never logged)
 *  - TRAVELPAYOUTS_MARKER     (default 676421)
 *  - TRAVELPAYOUTS_TRS        (default 463418)
 *
 * Public API:
 *   createTrackedLink({ campaignId, targetUrl, subId }) → Promise<Result>
 *   clearCache({ memOnly? }) → void
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, '..', 'data', 'live-cache', 'tp-links.json');
const API_URL = 'https://api.travelpayouts.com/links/v1/create';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_PER_MIN = 100;

const MARKER_DEFAULT = '676421';
const TRS_DEFAULT = '463418';

// -- in-memory state ---------------------------------------------------------
const memCache = new Map(); // key → entry
let diskLoaded = false;
let diskDirty = false;

// token-bucket: refill one token every 600ms up to RATE_LIMIT_PER_MIN
const bucket = { tokens: RATE_LIMIT_PER_MIN, last: Date.now() };

function refillBucket() {
  const now = Date.now();
  const elapsed = now - bucket.last;
  const refill = (elapsed / 60_000) * RATE_LIMIT_PER_MIN;
  if (refill > 0) {
    bucket.tokens = Math.min(RATE_LIMIT_PER_MIN, bucket.tokens + refill);
    bucket.last = now;
  }
}

async function acquireToken() {
  refillBucket();
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return;
  }
  // wait just long enough to earn one token (~600ms)
  const waitMs = Math.ceil((1 - bucket.tokens) * 600);
  await new Promise((r) => setTimeout(r, waitMs));
  return acquireToken();
}

// -- cache helpers -----------------------------------------------------------
function cacheKey({ campaignId, targetUrl, subId }) {
  return createHash('sha1')
    .update(`${campaignId}|${targetUrl}|${subId}`)
    .digest('hex')
    .slice(0, 16);
}

async function loadDiskCache() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = await readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) memCache.set(k, v);
    }
  } catch {
    // missing or corrupt — start fresh, no throw
  }
}

let flushing = Promise.resolve();
async function flushDiskCache() {
  // Serialize concurrent flushes via a chained promise — otherwise two in-flight
  // TP responses can race and the later overwrites the former with stale state.
  flushing = flushing.then(async () => {
    if (!diskDirty) return;
    try {
      diskDirty = false;
      await mkdir(dirname(CACHE_PATH), { recursive: true });
      const obj = Object.fromEntries(memCache.entries());
      await writeFile(CACHE_PATH, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      diskDirty = true; // retry on next flush
      console.warn('[tp-client] disk cache flush failed:', redact(err.message));
    }
  });
  return flushing;
}

function redact(msg = '') {
  const tok = process.env.TRAVELPAYOUTS_API_TOKEN || '';
  if (!tok) return String(msg);
  return String(msg).split(tok).join('[REDACTED_TOKEN]');
}

// -- main API ----------------------------------------------------------------

/**
 * @param {{ campaignId: number, targetUrl: string, subId: string, marker?: string, trs?: string }} opts
 * @returns {Promise<{ success: boolean, partnerUrl?: string, cached?: boolean, error?: string, fallbackUrl?: string }>}
 */
export async function createTrackedLink(opts) {
  const { campaignId, targetUrl, subId } = opts || {};
  if (!campaignId || !targetUrl || !subId) {
    return { success: false, error: 'missing_params', fallbackUrl: targetUrl || '' };
  }

  const token = process.env.TRAVELPAYOUTS_API_TOKEN;
  if (!token) {
    return { success: false, error: 'no_token', fallbackUrl: targetUrl };
  }

  await loadDiskCache();
  const key = cacheKey({ campaignId, targetUrl, subId });
  const now = Date.now();

  const hit = memCache.get(key);
  if (hit && hit.partnerUrl && now - (hit.createdAt || 0) < TTL_MS) {
    hit.lastUsedAt = now;
    diskDirty = true;
    return { success: true, partnerUrl: hit.partnerUrl, cached: true };
  }

  await acquireToken();

  const marker = opts.marker || process.env.TRAVELPAYOUTS_MARKER || MARKER_DEFAULT;
  const trs = opts.trs || process.env.TRAVELPAYOUTS_TRS || TRS_DEFAULT;

  // TP expects a batch body: { trs, marker, shorten, links: [{ url, sub_id }] }.
  // We use single-link batches — batching across placeholders would complicate
  // cache keys and error handling for minimal rate-limit savings (TP allows 100/min).
  const body = {
    trs: Number(trs),
    marker: Number(marker),
    shorten: true,
    links: [{ url: String(targetUrl), sub_id: String(subId) }],
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': token,
      },
      body: JSON.stringify(body),
      // 10s hard cap — TP usually responds in <1s
      signal: AbortSignal.timeout(10_000),
    });

    const json = await res.json().catch(() => ({}));

    const linkResult = json?.result?.links?.[0] || {};
    const partnerUrl = linkResult.partner_url || '';
    const linkCode = linkResult.code || '';
    const topCode = json?.code || '';
    const ok = res.ok && Boolean(partnerUrl) && linkCode === 'success';

    if (!ok) {
      const msg = linkResult.error || linkCode || topCode || json?.error || `http_${res.status}`;
      return { success: false, error: redact(String(msg)), fallbackUrl: targetUrl };
    }

    memCache.set(key, {
      partnerUrl,
      campaignId: Number(campaignId),
      targetUrl,
      subId,
      createdAt: now,
      lastUsedAt: now,
    });
    diskDirty = true;
    // Await flush — serialized via promise chain, so no contention. Cost is
    // negligible (single JSON write) and guarantees cache persists even when
    // the caller exits immediately after the call (e.g. CLI smoke test).
    await flushDiskCache();

    return { success: true, partnerUrl, cached: false };
  } catch (err) {
    return { success: false, error: redact(err?.message || 'fetch_error'), fallbackUrl: targetUrl };
  }
}

/**
 * Clear caches. Useful in tests.
 * @param {{ memOnly?: boolean }} [opts]
 */
export function clearCache(opts = {}) {
  memCache.clear();
  diskLoaded = false;
  diskDirty = false;
  if (!opts.memOnly) {
    // best-effort unlink via overwrite with empty map
    writeFile(CACHE_PATH, '{}', 'utf8').catch(() => {});
  }
}

export default { createTrackedLink, clearCache };
