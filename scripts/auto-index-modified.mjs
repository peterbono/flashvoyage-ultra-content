#!/usr/bin/env node
/**
 * auto-index-modified.mjs — daily auto-submit of recently-modified WP posts
 * to the Google Indexing API.
 *
 * Designed to run from .github/workflows/auto-indexing.yml on a daily cron.
 * Picks up every URL written in the LOOKBACK_HOURS window — manual WP-admin
 * edits, money-page-queue publications, gsc-fix.sh runs, content-cleanup
 * scripts, future automation. Single funnel, no per-script wiring needed.
 *
 * Inputs (env):
 *   GA4_SERVICE_ACCOUNT          full SA JSON (string)  OR
 *   GA4_SERVICE_ACCOUNT_PATH     path to SA JSON file (default ./ga4-service-account.json)
 *   WORDPRESS_URL                e.g. https://flashvoyage.com
 *   LOOKBACK_HOURS               default 26 (small overlap with previous run)
 *   MAX_URLS                     safety cap, default 100 (Indexing API quota is 200/day)
 *   DRY_RUN=1                    skip submit, just log what would happen
 *
 * Outputs:
 *   data/gsc-indexing-log.jsonl  one JSON line per attempted submission
 *
 * Quota: Indexing API allows 200 publications/project/day. We default-cap to 100
 * to leave headroom for manual `gsc-request-indexing.mjs` runs from the dashboard.
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { createSign } from 'crypto';
import { dirname } from 'path';

const WP_URL = (process.env.WORDPRESS_URL || 'https://flashvoyage.com').replace(/\/$/, '');
const LOOKBACK_HOURS = parseInt(process.env.LOOKBACK_HOURS || '26', 10);
const MAX_URLS = parseInt(process.env.MAX_URLS || '100', 10);
const DRY_RUN = process.env.DRY_RUN === '1';
const LOG_PATH = 'data/gsc-indexing-log.jsonl';

// ── SA load ─────────────────────────────────────────────────────────────
function loadSA() {
  const raw = process.env.GA4_SERVICE_ACCOUNT;
  if (raw) return JSON.parse(raw);
  const p = process.env.GA4_SERVICE_ACCOUNT_PATH || 'ga4-service-account.json';
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// ── JWT bearer ──────────────────────────────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
async function getAccessToken(sa, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const toSign = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256'); signer.update(toSign);
  const jwt = `${toSign}.${b64url(signer.sign(sa.private_key))}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`token exchange: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── WP recently-modified posts ──────────────────────────────────────────
async function fetchModifiedPosts(hours) {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString().slice(0, 19);
  const url = `${WP_URL}/wp-json/wp/v2/posts?modified_after=${since}&orderby=modified&order=desc&per_page=100&_fields=id,slug,link,modified,status`;
  const r = await fetch(url, { headers: { 'User-Agent': 'FlashVoyageAutoIndex/1.0' } });
  if (!r.ok) throw new Error(`WP fetch failed [${r.status}]`);
  const posts = await r.json();
  return posts
    .filter(p => p.status === 'publish')
    .map(p => ({ id: p.id, slug: p.slug, url: p.link, modified: p.modified }));
}

// ── Indexing API submit ─────────────────────────────────────────────────
async function submitUrl(token, url, type = 'URL_UPDATED') {
  const r = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type }),
  });
  const data = await r.json();
  return { ok: r.ok, status: r.status, data };
}

// ── Log line ────────────────────────────────────────────────────────────
function logEntry(entry) {
  if (!existsSync(dirname(LOG_PATH))) mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

// ── Main ────────────────────────────────────────────────────────────────
console.log(`[AUTOINDEX] lookback=${LOOKBACK_HOURS}h max=${MAX_URLS} dry=${DRY_RUN}`);

const posts = await fetchModifiedPosts(LOOKBACK_HOURS);
console.log(`[AUTOINDEX] WP returned ${posts.length} posts modified in last ${LOOKBACK_HOURS}h`);

if (posts.length === 0) {
  console.log('[AUTOINDEX] Nothing to do.');
  process.exit(0);
}

const batch = posts.slice(0, MAX_URLS);
if (batch.length < posts.length) {
  console.log(`[AUTOINDEX] WARN: ${posts.length - batch.length} posts skipped (MAX_URLS=${MAX_URLS})`);
}

const token = DRY_RUN ? null : await getAccessToken(loadSA(), 'https://www.googleapis.com/auth/indexing');

let ok = 0, failed = 0;
for (const post of batch) {
  if (DRY_RUN) {
    console.log(`  [dry] would submit  ${post.url}  (modified ${post.modified})`);
    logEntry({ id: post.id, slug: post.slug, url: post.url, modified: post.modified, result: 'dry_run' });
    continue;
  }
  try {
    const res = await submitUrl(token, post.url, 'URL_UPDATED');
    if (res.ok) {
      console.log(`  ✓ ${post.slug}  (modified ${post.modified})`);
      logEntry({ id: post.id, slug: post.slug, url: post.url, modified: post.modified, result: 'ok', status: res.status });
      ok++;
    } else {
      const msg = res.data?.error?.message || JSON.stringify(res.data);
      console.log(`  ✗ ${post.slug}  [${res.status}] ${msg.slice(0, 100)}`);
      logEntry({ id: post.id, slug: post.slug, url: post.url, modified: post.modified, result: 'fail', status: res.status, error: msg });
      failed++;
      // Stop on auth/quota errors — retrying is pointless
      if (res.status === 403 || res.status === 429) {
        console.error(`[AUTOINDEX] Halting on ${res.status} (auth or quota). ${batch.length - ok - failed} posts skipped.`);
        break;
      }
    }
  } catch (e) {
    console.log(`  ✗ ${post.slug}  exception: ${e.message}`);
    logEntry({ id: post.id, slug: post.slug, url: post.url, modified: post.modified, result: 'exception', error: String(e.message) });
    failed++;
  }
}

console.log(`[AUTOINDEX] Done: ${ok} ok, ${failed} failed`);
process.exit(failed > 0 && ok === 0 ? 1 : 0);
