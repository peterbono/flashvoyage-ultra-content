import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';

const SA_PATH = '/Users/floriangouloubi/flashvoyage-content/ga4-service-account.json';
const SITE_URL = 'https://flashvoyage.com/';
const INPUT = '/tmp/gsc_classified.json';
const OUTPUT = '/tmp/gsc_inspection_results.json';
const TODAY = new Date('2026-04-22T00:00:00Z');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const data = JSON.parse(readFileSync(INPUT, 'utf-8'));
const invisible = data.invisible || [];

function ageDays(dateStr) {
  const d = new Date(dateStr);
  return Math.floor((TODAY - d) / (1000 * 60 * 60 * 24));
}

function guessDestination(slug) {
  const s = slug.toLowerCase();
  if (s.includes('japon') || s.includes('japan') || s.includes('tokyo') || s.includes('osaka') || s.includes('kyoto')) return 'Japon';
  if (s.includes('thailand') || s.includes('thaïlande') || s.includes('bangkok') || s.includes('phuket') || s.includes('chiang')) return 'Thaïlande';
  if (s.includes('vietnam') || s.includes('hanoi') || s.includes('saigon') || s.includes('ho-chi-minh')) return 'Vietnam';
  if (s.includes('philippines') || s.includes('manille') || s.includes('cebu') || s.includes('palawan')) return 'Philippines';
  if (s.includes('indonesie') || s.includes('bali') || s.includes('jakarta')) return 'Indonésie';
  if (s.includes('cambodge') || s.includes('laos') || s.includes('birmanie')) return 'Asie-SE';
  return 'Autre';
}

function guessPattern(slug, title) {
  const s = (slug + ' ' + (title || '')).toLowerCase();
  if (s.includes('vivre-en') || s.includes('vivre en')) return 'Vivre en';
  if (s.includes('visa-run') || s.includes('visa run')) return 'Visa Run';
  if (s.includes('couts-caches') || s.includes('coûts cachés') || s.includes('couts caches')) return 'Coûts cachés';
  return null;
}

// Enrich
const enriched = invisible.map((a) => ({
  ...a,
  ageDays: ageDays(a.date),
  destination: guessDestination(a.slug),
  pattern: guessPattern(a.slug, a.title),
}));

// Stratified sampling: 5 <30d, 10 30-50d, 5 >50d, with destination + pattern diversity
function pickStratified() {
  const young = enriched.filter((a) => a.ageDays < 30);
  const mid = enriched.filter((a) => a.ageDays >= 30 && a.ageDays <= 50);
  const old = enriched.filter((a) => a.ageDays > 50);

  console.error(`Pool: young<30d=${young.length}, mid 30-50d=${mid.length}, old>50d=${old.length}`);

  const picked = [];
  const slugsSeen = new Set();

  // helper: pick N from pool, maximizing destination diversity + patterns
  function pickFrom(pool, n, preferredDests = [], preferredPatterns = []) {
    const chosen = [];
    const remaining = [...pool];

    // First: pick by preferred patterns
    for (const pat of preferredPatterns) {
      const idx = remaining.findIndex((a) => a.pattern === pat && !slugsSeen.has(a.slug));
      if (idx >= 0 && chosen.length < n) {
        chosen.push(remaining[idx]);
        slugsSeen.add(remaining[idx].slug);
        remaining.splice(idx, 1);
      }
    }

    // Then: preferred destinations
    for (const dest of preferredDests) {
      if (chosen.length >= n) break;
      const idx = remaining.findIndex((a) => a.destination === dest && !slugsSeen.has(a.slug));
      if (idx >= 0) {
        chosen.push(remaining[idx]);
        slugsSeen.add(remaining[idx].slug);
        remaining.splice(idx, 1);
      }
    }

    // Fill with destination diversity
    while (chosen.length < n && remaining.length > 0) {
      const seenDestsInChosen = new Set(chosen.map((c) => c.destination));
      let idx = remaining.findIndex((a) => !seenDestsInChosen.has(a.destination) && !slugsSeen.has(a.slug));
      if (idx < 0) idx = remaining.findIndex((a) => !slugsSeen.has(a.slug));
      if (idx < 0) break;
      chosen.push(remaining[idx]);
      slugsSeen.add(remaining[idx].slug);
      remaining.splice(idx, 1);
    }
    return chosen;
  }

  const prefDests = ['Japon', 'Thaïlande', 'Vietnam', 'Philippines'];
  const prefPatterns = ['Vivre en', 'Visa Run', 'Coûts cachés'];

  picked.push(...pickFrom(young, 5, prefDests, prefPatterns));
  picked.push(...pickFrom(mid, 10, prefDests, prefPatterns));
  picked.push(...pickFrom(old, 5, prefDests, prefPatterns));

  return picked;
}

const sample = pickStratified();

console.error(`\n=== Sample of ${sample.length} URLs ===`);
for (const a of sample) {
  console.error(`[${a.ageDays}d] ${a.destination.padEnd(12)} ${a.pattern || '-'} | ${a.slug}`);
}

// --- Auth ---
const sa = JSON.parse(readFileSync(SA_PATH, 'utf-8'));
const auth = new google.auth.GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/webmasters'], // full (not readonly) is needed for urlInspection
});
const searchconsole = google.searchconsole({ version: 'v1', auth });

console.error(`\nService account: ${sa.client_email}`);
console.error(`Inspecting ${sample.length} URLs on ${SITE_URL}...\n`);

const results = [];
for (let i = 0; i < sample.length; i++) {
  const a = sample[i];
  const url = `https://flashvoyage.com/${a.slug}/`;
  process.stderr.write(`[${i + 1}/${sample.length}] ${url} ... `);
  try {
    const resp = await searchconsole.urlInspection.index.inspect({
      siteUrl: SITE_URL,
      requestBody: {
        inspectionUrl: url,
        languageCode: 'fr-FR',
      },
    });
    const r = resp.data.inspectionResult || {};
    results.push({
      slug: a.slug,
      title: a.title,
      date: a.date,
      ageDays: a.ageDays,
      destination: a.destination,
      pattern: a.pattern,
      wordCount: a.wordCount,
      url,
      raw: resp.data,
      index: r.indexStatusResult || null,
    });
    const idx = r.indexStatusResult || {};
    console.error(`OK — verdict=${idx.verdict || '?'}, coverage=${idx.coverageState || '?'}`);
  } catch (err) {
    console.error(`ERROR: ${err.code || ''} ${err.message}`);
    results.push({
      slug: a.slug,
      title: a.title,
      date: a.date,
      ageDays: a.ageDays,
      destination: a.destination,
      pattern: a.pattern,
      wordCount: a.wordCount,
      url,
      error: { code: err.code, message: err.message, status: err.response?.status, data: err.response?.data },
    });
    if (err.code === 403 || err.response?.status === 403) {
      console.error(`\n!!! 403 Forbidden — the service account likely lacks Full/Owner access on the GSC property.`);
      console.error(`!!! SA email: ${sa.client_email}`);
      console.error(`!!! Fix: GSC → Settings → Users and permissions → add ${sa.client_email} with "Owner" or "Full" permission.`);
      // Do not abort — document and continue
    }
  }
  await sleep(1100);
}

writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
console.error(`\nSaved ${results.length} results to ${OUTPUT}`);

// --- Aggregate summary ---
const verdictCounts = {};
const coverageCounts = {};
const pageFetchCounts = {};
let canonicalMismatches = 0;
let errors = 0;
let lastCrawlNone = 0;
for (const r of results) {
  if (r.error) { errors++; continue; }
  const idx = r.index || {};
  verdictCounts[idx.verdict || 'UNKNOWN'] = (verdictCounts[idx.verdict || 'UNKNOWN'] || 0) + 1;
  coverageCounts[idx.coverageState || 'UNKNOWN'] = (coverageCounts[idx.coverageState || 'UNKNOWN'] || 0) + 1;
  pageFetchCounts[idx.pageFetchState || 'UNKNOWN'] = (pageFetchCounts[idx.pageFetchState || 'UNKNOWN'] || 0) + 1;
  if (idx.googleCanonical && idx.userCanonical && idx.googleCanonical !== idx.userCanonical) canonicalMismatches++;
  if (!idx.lastCrawlTime) lastCrawlNone++;
}

console.log('\n=== AGGREGATE ===');
console.log('verdict:', verdictCounts);
console.log('coverageState:', coverageCounts);
console.log('pageFetchState:', pageFetchCounts);
console.log('canonical mismatches:', canonicalMismatches);
console.log('never crawled (no lastCrawlTime):', lastCrawlNone);
console.log('errors:', errors);

// --- Table ---
console.log('\n=== TABLE ===');
console.log(['#', 'age', 'dest', 'verdict', 'coverageState', 'pageFetch', 'crawledAs', 'lastCrawl', 'robots', 'canonMismatch', 'slug (title)'].join(' | '));
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  if (r.error) {
    console.log([i + 1, r.ageDays + 'd', r.destination, 'ERROR', r.error.message?.slice(0, 40), '-', '-', '-', '-', '-', r.slug].join(' | '));
    continue;
  }
  const idx = r.index || {};
  const canonMismatch = (idx.googleCanonical && idx.userCanonical && idx.googleCanonical !== idx.userCanonical) ? 'YES' : 'no';
  const lastCrawl = idx.lastCrawlTime ? idx.lastCrawlTime.slice(0, 10) : 'never';
  const title = (r.title || '').slice(0, 50);
  console.log([
    i + 1,
    r.ageDays + 'd',
    r.destination,
    idx.verdict || '?',
    (idx.coverageState || '?').slice(0, 45),
    idx.pageFetchState || '?',
    idx.crawledAs || '-',
    lastCrawl,
    idx.robotsTxtState || '?',
    canonMismatch,
    `${r.slug} (${title})`,
  ].join(' | '));
}
