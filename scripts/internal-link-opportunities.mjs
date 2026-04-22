import { google } from 'googleapis';
import { readFileSync } from 'fs';

const SA_PATH = '/Users/floriangouloubi/flashvoyage-content/ga4-service-account.json';
const SITE_URL = 'https://flashvoyage.com/';
const sa = JSON.parse(readFileSync(SA_PATH, 'utf-8'));
const auth = new google.auth.GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] });
const searchconsole = google.searchconsole({ version: 'v1', auth });

// 1. Get indexed articles (those with impressions in GSC)
const resp = await searchconsole.searchanalytics.query({
  siteUrl: SITE_URL,
  requestBody: { startDate: '2026-03-01', endDate: '2026-04-16', dimensions: ['page'], rowLimit: 500, type: 'web' },
});
const indexed = (resp.data.rows || []).map(r => ({
  url: r.keys[0],
  slug: r.keys[0].replace(SITE_URL, '').replace(/\/$/, ''),
  impressions: r.impressions,
  clicks: r.clicks,
  position: r.position?.toFixed(1),
})).sort((a, b) => b.impressions - a.impressions);

// 2. Load all article scores
const scores = JSON.parse(readFileSync('/Users/floriangouloubi/flashvoyage-content/data/article-scores.json', 'utf-8'));
const scoreMap = new Map();
for (const s of scores.scores || []) {
  scoreMap.set(s.slug, { score: s.compositeScore, title: s.title, signals: s.signals, flags: s.flags });
}

// 3. Load widget audit
let widgetAudit = { highOpportunities: [] };
try {
  widgetAudit = JSON.parse(readFileSync('/Users/floriangouloubi/flashvoyage-content/data/partner-widget-audit.json', 'utf-8'));
} catch {}
const widgetSlugs = new Set((widgetAudit.highOpportunities || []).map(o => o.slug));

// 4. Identify NON-indexed articles (in scores but NOT in GSC)
const indexedSlugs = new Set(indexed.map(i => i.slug));
const nonIndexed = [...scoreMap.entries()]
  .filter(([slug]) => !indexedSlugs.has(slug))
  .map(([slug, data]) => ({ slug, ...data, hasWidgetOpp: widgetSlugs.has(slug) }))
  .sort((a, b) => b.score - a.score);

// 5. Extract destination/topic from slugs for semantic matching
function extractTopics(slug) {
  const topics = new Set();
  const keywords = ['thailande','vietnam','bali','japon','japan','cambodge','laos','philippines',
    'indonesie','malaisie','singapour','coree','korea','taipei','kuala-lumpur','tokyo','osaka',
    'bangkok','chiang-mai','phuket','esim','budget','visa','assurance','itineraire','voyage',
    'scooter','moto','solo','couple','famille','nomade','digital','vaccin','rage'];
  for (const kw of keywords) {
    if (slug.includes(kw)) topics.add(kw);
  }
  return [...topics];
}

// 6. Find best linking opportunities: indexed → non-indexed where topics overlap
console.log('═══════════════════════════════════════════════════════════');
console.log('  INTERNAL LINKING OPPORTUNITIES (CEO + Growth analysis)');
console.log('═══════════════════════════════════════════════════════════\n');
console.log(`Indexed articles (authority sources): ${indexed.length}`);
console.log(`Non-indexed articles (link targets): ${nonIndexed.length}\n`);

for (const src of indexed.slice(0, 15)) {
  const srcTopics = extractTopics(src.slug);
  if (srcTopics.length === 0) continue;
  
  // Find non-indexed articles sharing topics
  const candidates = nonIndexed
    .filter(tgt => {
      const tgtTopics = extractTopics(tgt.slug);
      return tgtTopics.some(t => srcTopics.includes(t));
    })
    .slice(0, 5);
  
  if (candidates.length === 0) continue;
  
  console.log(`── FROM: ${src.slug.slice(0, 65)}`);
  console.log(`   imp: ${src.impressions} | clk: ${src.clicks} | pos: ${src.position} | topics: [${srcTopics.join(', ')}]`);
  for (const c of candidates) {
    const icon = c.hasWidgetOpp ? '💰' : '  ';
    console.log(`   → TO: ${icon} ${c.slug.slice(0, 55).padEnd(55)} score:${String(c.score).padStart(3)} topics:[${extractTopics(c.slug).join(',')}]`);
  }
  console.log();
}

// Summary: top 10 non-indexed targets by linking potential
console.log('═══════════════════════════════════════════════════════════');
console.log('  TOP 10 NON-INDEXED TARGETS (most linkable from indexed)\n');
const targetCounts = new Map();
for (const src of indexed) {
  const srcTopics = extractTopics(src.slug);
  for (const tgt of nonIndexed) {
    const tgtTopics = extractTopics(tgt.slug);
    if (tgtTopics.some(t => srcTopics.includes(t))) {
      targetCounts.set(tgt.slug, (targetCounts.get(tgt.slug) || 0) + 1);
    }
  }
}
const topTargets = [...targetCounts.entries()]
  .map(([slug, count]) => ({ slug, count, ...(scoreMap.get(slug) || {}) }))
  .sort((a, b) => b.count - a.count || b.score - a.score)
  .slice(0, 10);

for (const t of topTargets) {
  const widget = widgetSlugs.has(t.slug) ? '💰 WIDGET OPP' : '';
  console.log(`  ${String(t.count).padStart(2)} sources → ${t.slug.slice(0, 55).padEnd(55)} score:${String(t.score||0).padStart(3)} ${widget}`);
}
