/**
 * intelligence/quora-profile-scraper.js
 *
 * Reusable Quora profile scraper.
 *   - Exports `scrapeQuoraProfile(accountHandle, opts?)`.
 *   - Playwright + optional Bright Data residential proxy (credentials in .env).
 *   - Caches to `data/live-cache/quora-profile-{account}.json`.
 *   - Gracefully falls back to:
 *       1. public-view scraping (no login → no view counts)
 *       2. the sibling agent's snapshot at /tmp/quora_profile_florian.json
 *       3. an empty degraded snapshot (so callers never crash).
 *   - Respects Quora rate limit (3-5s between navigations).
 *   - Never logs credentials.
 *
 * Invocable as CLI:  node intelligence/quora-profile-scraper.js Florian-Gouloubi
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(REPO_ROOT, 'data', 'live-cache');

function cachePathFor(handle) {
  return path.join(CACHE_DIR, `quora-profile-${handle}.json`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(minMs, maxMs) { return minMs + Math.floor(Math.random() * (maxMs - minMs)); }

function buildProxy() {
  const host = process.env.BRIGHTDATA_HOST || process.env.BRIGHT_DATA_HOST;
  const port = process.env.BRIGHTDATA_PORT || process.env.BRIGHT_DATA_PORT;
  const user = process.env.BRIGHTDATA_USERNAME || process.env.BRIGHT_DATA_USERNAME;
  const pass = process.env.BRIGHTDATA_PASSWORD || process.env.BRIGHT_DATA_PASSWORD;
  if (!host || !port || !user || !pass) return null;
  return {
    server: `http://${host}:${port}`,
    username: user,
    password: pass, // never logged
  };
}

async function extractAnswersFromPage(page) {
  // Run the same DOM extraction strategy as the sibling agent's scraper.
  return await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const anchors = Array.from(document.querySelectorAll('a[href*="/answer/"]'));
    anchors.forEach((a) => {
      const href = (a.href || '').split('?')[0];
      if (!href || seen.has(href)) return;
      if (!/\/answer\//.test(href)) return;
      seen.add(href);
      let card = a;
      for (let up = 0; up < 12; up++) {
        if (!card.parentElement) break;
        card = card.parentElement;
        if (card.querySelector && card.querySelector('p, span.q-text, .q-box .q-text')) break;
      }
      const qLink = card.querySelector && card.querySelector(
        'a[href*="quora.com/"]:not([href*="/answer/"]):not([href*="/profile/"])'
      );
      const questionTitle = qLink ? (qLink.innerText || '').trim() : (a.innerText || '').trim();
      const questionUrl = qLink ? qLink.href.split('?')[0] : '';
      let snippet = '';
      const paras = card.querySelectorAll
        ? Array.from(card.querySelectorAll('p, span.q-text'))
        : [];
      for (const p of paras) {
        const t = (p.innerText || '').trim();
        if (t && t !== questionTitle && t.length > 40) {
          snippet = t.slice(0, 600);
          break;
        }
      }
      const fullText = card.innerText || '';
      let upvotes = 0;
      const voteBtn = card.querySelector && card.querySelector(
        'button[aria-label*="vote" i], button[aria-label*="upvote" i]'
      );
      if (voteBtn) {
        const m = (voteBtn.getAttribute('aria-label') || voteBtn.innerText || '')
          .match(/(\d[\d\s.,kK]*)/);
        if (m) upvotes = m[1].trim();
      }
      let views = 0;
      const vm = fullText.match(/([\d\s.,]+\s?(?:K|k)?)\s+vues/);
      if (vm) views = vm[1].trim();
      let dateAnswered = '';
      const dm = fullText.match(/(R[ée]pondu[^\n]{0,60})/);
      if (dm) dateAnswered = dm[1].trim();
      results.push({ answerUrl: href, questionTitle, questionUrl, snippet, upvotes, views, dateAnswered });
    });
    return results;
  });
}

function normaliseAnswer(raw) {
  const parseNum = (s) => {
    if (typeof s === 'number') return s;
    if (!s) return 0;
    const m = String(s).replace(/\s/g, '').match(/([\d.,]+)\s*([kK])?/);
    if (!m) return 0;
    const n = parseFloat(m[1].replace(',', '.')) || 0;
    return m[2] ? Math.round(n * 1000) : Math.round(n);
  };
  const topics = [];
  const title = (raw.questionTitle || '').toLowerCase();
  const destinations = {
    thailand: /thail|thaïl|bangkok|phuket|chiang/,
    vietnam: /vi[eê]tn|hanoi|ho chi|saigon/,
    philippines: /philipp|manille|manila|cebu|palawan/,
    indonesia: /indon[eé]s|bali|jakarta/,
    cambodia: /cambodg|siem|angkor/,
    laos: /laos|vientiane|luang/,
    malaysia: /malaisi|kuala/,
    singapore: /singapour/,
  };
  for (const [dest, rx] of Object.entries(destinations)) {
    if (rx.test(title)) topics.push(dest);
  }
  return {
    answerUrl: raw.answerUrl,
    questionUrl: raw.questionUrl,
    questionTitle: raw.questionTitle,
    snippet: raw.snippet || '',
    upvotes: parseNum(raw.upvotes),
    views: parseNum(raw.views),
    dateAnswered: raw.dateAnswered || '',
    topics,
  };
}

/**
 * @param {string} accountHandle e.g. "Florian-Gouloubi"
 * @param {object} opts
 *   - locale: 'fr' | 'en' (default 'fr')
 *   - maxScrolls: int (default 15)
 *   - cache: boolean (default true)
 * @returns {Promise<ProfileSnapshot>}
 */
export async function scrapeQuoraProfile(accountHandle, opts = {}) {
  const { locale = 'fr', maxScrolls = 15, cache = true } = opts;
  const profileUrl = `https://${locale}.quora.com/profile/${accountHandle}/answers`;

  // Try Playwright — if not installed or proxy fails, fall back.
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    return fallbackSnapshot(accountHandle, 'playwright-unavailable');
  }

  const proxy = buildProxy();
  let browser;
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      ...(proxy ? { proxy } : {}),
    });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      locale: locale === 'fr' ? 'fr-FR' : 'en-US',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(jitter(3000, 5000));

    // Detect login wall (Quora shows /login or a modal)
    const url = page.url();
    const html = await page.content();
    const loginWall = /\/login/.test(url) || /Continuer avec|Continue with|Se connecter/i.test(html.slice(0, 4000));

    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(jitter(3000, 5000));
    }

    const rawAnswers = await extractAnswersFromPage(page);
    const answers = rawAnswers.map(normaliseAnswer);

    const snapshot = {
      scrapedAt: new Date().toISOString(),
      profile: accountHandle,
      profileUrl,
      locale,
      loginWall,
      degraded: loginWall, // fewer data if not logged in (no view counts)
      answerCount: answers.length,
      answers,
    };

    if (cache && answers.length > 0) writeCache(accountHandle, snapshot);
    return snapshot;
  } catch (err) {
    return fallbackSnapshot(accountHandle, `scrape-error:${err.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function fallbackSnapshot(accountHandle, reason) {
  // Priority 1: sibling's snapshot at /tmp/quora_profile_florian.json
  const siblingPath = '/tmp/quora_profile_florian.json';
  if (fs.existsSync(siblingPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(siblingPath, 'utf-8'));
      const answers = (raw.answers || []).map(normaliseAnswer);
      const snap = {
        scrapedAt: raw.scrapedAt || new Date().toISOString(),
        profile: raw.profile || accountHandle,
        profileUrl: raw.profileUrl || `https://fr.quora.com/profile/${accountHandle}/answers`,
        locale: 'fr',
        loginWall: raw.loginWall || false,
        degraded: true,
        source: 'sibling-tmp',
        fallbackReason: reason,
        answerCount: answers.length,
        answers,
      };
      writeCache(accountHandle, snap);
      return snap;
    } catch {
      // fall through
    }
  }
  // Priority 2: existing cache (stale is still better than nothing)
  const p = cachePathFor(accountHandle);
  if (fs.existsSync(p)) {
    try {
      const cached = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return { ...cached, degraded: true, fallbackReason: reason };
    } catch {}
  }
  // Priority 3: empty
  return {
    scrapedAt: new Date().toISOString(),
    profile: accountHandle,
    profileUrl: `https://fr.quora.com/profile/${accountHandle}/answers`,
    locale: 'fr',
    loginWall: false,
    degraded: true,
    fallbackReason: reason,
    answerCount: 0,
    answers: [],
  };
}

function writeCache(accountHandle, snapshot) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePathFor(accountHandle), JSON.stringify(snapshot, null, 2));
  } catch (e) {
    // non-fatal
  }
}

export function loadCachedProfile(accountHandle) {
  const p = cachePathFor(accountHandle);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

export function isCacheStale(snapshot, maxAgeDays = 7) {
  if (!snapshot || !snapshot.scrapedAt) return true;
  const ageMs = Date.now() - new Date(snapshot.scrapedAt).getTime();
  return ageMs > maxAgeDays * 24 * 3600 * 1000;
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const handle = process.argv[2] || 'Florian-Gouloubi';
  scrapeQuoraProfile(handle).then((snap) => {
    console.log(JSON.stringify({
      profile: snap.profile,
      scrapedAt: snap.scrapedAt,
      answerCount: snap.answerCount,
      degraded: snap.degraded,
      fallbackReason: snap.fallbackReason || null,
    }, null, 2));
  }).catch((e) => {
    console.error('scrapeQuoraProfile error:', e.message);
    process.exit(1);
  });
}
