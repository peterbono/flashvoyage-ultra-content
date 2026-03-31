/**
 * competitor-monitor.js — Content Intelligence Engine
 *
 * Daily sitemap diff for French travel competitors.
 * Detects new competitor articles, extracts destination/content type from URL slugs,
 * and cross-references against FlashVoyage coverage to identify:
 *   - P1 CONTENT GAPS: Competitor covers a topic we DON'T have
 *   - P2 STALE ALERTS: Competitor covers a topic we have but our article is stale
 *   - P3 MONITOR: Competitor covers a topic we rank well for (no action)
 *
 * Competitors monitored:
 *   - VoyagesPirates (voyagespirates.fr)
 *   - Noobvoyage (noobvoyage.fr)
 *   - Generation Voyage (generationvoyage.fr)
 *
 * Data consumed:
 *   - data/article-scores.json (our articles + traffic)
 *   - data/competitor-state.json (previous scan state)
 *
 * Writes:
 *   - data/competitor-report.json (new articles + recommended actions)
 *   - data/competitor-state.json (current state for next diff)
 *
 * CLI: node intelligence/competitor-monitor.js
 * Cron: daily at 3h20 UTC (after article-prioritizer)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_PATH = join(DATA_DIR, 'competitor-state.json');
const REPORT_PATH = join(DATA_DIR, 'competitor-report.json');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');

// ── Competitor Definitions ────────────────────────────────────────────────

const COMPETITORS = [
  {
    id: 'voyagespirates',
    name: 'VoyagesPirates',
    sitemapUrl: 'https://www.voyagespirates.fr/sitemap.xml',
  },
  {
    id: 'noobvoyage',
    name: 'Noobvoyage',
    sitemapUrl: 'https://www.noobvoyage.fr/sitemap.xml',
  },
  {
    id: 'generationvoyage',
    name: 'Generation Voyage',
    sitemapUrl: 'https://generationvoyage.fr/sitemap.xml',
  },
];

// ── Destination Keywords ──────────────────────────────────────────────────
// Used to extract destination from URL slugs

// ONLY SE Asia + adjacent Asia destinations (our niche)
const DESTINATION_KEYWORDS = [
  // Southeast Asia (core niche)
  'thailande', 'bali', 'vietnam', 'cambodge', 'laos', 'myanmar', 'birmanie',
  'philippines', 'indonesie', 'malaisie', 'singapour', 'brunei', 'timor',
  // East Asia (secondary)
  'japon', 'coree', 'taiwan',
  // South Asia (secondary)
  'inde', 'sri-lanka', 'nepal', 'maldives',
  // SE Asia cities
  'bangkok', 'chiang-mai', 'phuket', 'koh-samui', 'koh-phangan', 'krabi',
  'hanoi', 'ho-chi-minh', 'da-nang', 'hoi-an', 'sapa', 'nha-trang',
  'siem-reap', 'phnom-penh', 'luang-prabang', 'vientiane',
  'ubud', 'seminyak', 'lombok', 'gili', 'nusa', 'yogyakarta', 'jakarta',
  'el-nido', 'siargao', 'cebu', 'boracay', 'manille', 'palawan',
  'kuala-lumpur', 'langkawi', 'penang', 'perhentian', 'tioman',
  'tokyo', 'kyoto', 'osaka',
  'hanoi', 'ho-chi-minh', 'kuala-lumpur', 'siem-reap', 'luang-prabang',
];

// Content type patterns detected from URL slugs
const CONTENT_TYPE_PATTERNS = [
  { pattern: /budget|prix|cout|combien|tarif|pas-cher|bon-plan|promo/i, type: 'budget' },
  { pattern: /itineraire|circuit|road-?trip|parcours|trajet/i, type: 'itineraire' },
  { pattern: /guide|complet|ultime|essentiel/i, type: 'guide' },
  { pattern: /visa|passeport|formalite|douane/i, type: 'visa' },
  { pattern: /hotel|hebergement|ou-dormir|logement|auberge|hostel/i, type: 'hebergement' },
  { pattern: /restaurant|manger|cuisine|gastronomie|street-food/i, type: 'gastronomie' },
  { pattern: /plage|ile|snorkeling|plongee|diving/i, type: 'plage' },
  { pattern: /temple|musee|monument|visite|activite|incontournable/i, type: 'activites' },
  { pattern: /transport|vol|avion|train|bus|ferry|comment-aller/i, type: 'transport' },
  { pattern: /securite|danger|arnaque|precaution|sante|vaccin/i, type: 'securite' },
  { pattern: /quand-partir|meteo|saison|climat|meilleur-moment/i, type: 'saison' },
  { pattern: /blog|recit|experience|temoignage|carnet/i, type: 'recit' },
  { pattern: /top|meilleur|classement|liste/i, type: 'classement' },
];

// Freshness threshold: articles older than this (in days) are considered stale
const STALE_THRESHOLD_DAYS = 180;

// ── Helpers ───────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[COMPETITOR] ${msg}`);
}

function logError(msg) {
  console.error(`[COMPETITOR] ERROR: ${msg}`);
}

/**
 * Load a JSON data file. Returns null if not found.
 */
async function loadJsonSafe(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    logError(`Failed to load ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch a sitemap XML with proper error handling and User-Agent.
 * Follows sitemap index files (sitemapindex → sitemap → urls).
 * @param {string} url
 * @returns {Promise<Array<{loc: string, lastmod: string|null}>>}
 */
async function fetchSitemap(url) {
  const entries = [];

  try {
    log(`Fetching sitemap: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FlashVoyage-Intelligence/1.0; +https://flashvoyage.com)',
        'Accept': 'application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      logError(`HTTP ${response.status} for ${url}`);
      return entries;
    }

    const xml = await response.text();

    // Check if this is a sitemap index (contains <sitemapindex>)
    if (xml.includes('<sitemapindex')) {
      const sitemapUrls = extractSitemapIndexUrls(xml);
      log(`Sitemap index detected: ${sitemapUrls.length} child sitemaps`);

      // Fetch each child sitemap (limit to 10 to avoid abuse)
      const childSitemaps = sitemapUrls.slice(0, 10);
      for (const childUrl of childSitemaps) {
        try {
          const childResponse = await fetch(childUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; FlashVoyage-Intelligence/1.0; +https://flashvoyage.com)',
              'Accept': 'application/xml, text/xml, */*',
            },
            signal: AbortSignal.timeout(20000),
          });
          if (childResponse.ok) {
            const childXml = await childResponse.text();
            entries.push(...extractUrlEntries(childXml));
          }
        } catch (childErr) {
          logError(`Failed to fetch child sitemap ${childUrl}: ${childErr.message}`);
        }
      }
    } else {
      // Direct sitemap with URL entries
      entries.push(...extractUrlEntries(xml));
    }
  } catch (err) {
    logError(`Failed to fetch sitemap ${url}: ${err.message}`);
  }

  return entries;
}

/**
 * Extract child sitemap URLs from a sitemap index XML.
 */
function extractSitemapIndexUrls(xml) {
  const urls = [];
  const regex = /<sitemap>\s*<loc>\s*(.*?)\s*<\/loc>/gs;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

/**
 * Extract URL entries (loc + lastmod) from a sitemap XML.
 */
function extractUrlEntries(xml) {
  const entries = [];
  // Match each <url> block
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];

  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc>\s*(.*?)\s*<\/loc>/);
    const lastmodMatch = block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/);

    if (locMatch) {
      const loc = locMatch[1].trim();
      // Filter: only keep article-like URLs (skip homepage, categories, tags, pages)
      if (isArticleUrl(loc)) {
        entries.push({
          loc,
          lastmod: lastmodMatch ? lastmodMatch[1].trim() : null,
        });
      }
    }
  }

  return entries;
}

/**
 * Heuristic: is this URL likely an article (not a category/tag/page)?
 * Articles tend to have deeper paths or slug-like endings.
 */
function isArticleUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname;

    // Skip obvious non-articles
    if (path === '/' || path === '') return false;
    if (/^\/(tag|category|auteur|author|page|wp-content|wp-admin|feed|sitemap)/i.test(path)) return false;
    if (/\.(xml|json|css|js|png|jpg|gif|svg|pdf)$/i.test(path)) return false;

    // Must have at least one slug segment
    const segments = path.split('/').filter(Boolean);
    return segments.length >= 1;
  } catch {
    return false;
  }
}

/**
 * Extract destination from a URL slug by matching against known destination keywords.
 */
function extractDestination(url) {
  try {
    const slug = new URL(url).pathname.toLowerCase()
      .replace(/\//g, ' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    for (const dest of DESTINATION_KEYWORDS) {
      const normalized = dest.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (slug.includes(normalized)) {
        return dest;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract content type from a URL slug using pattern matching.
 */
function extractContentType(url) {
  try {
    const slug = new URL(url).pathname.toLowerCase();
    for (const { pattern, type } of CONTENT_TYPE_PATTERNS) {
      if (pattern.test(slug)) return type;
    }
    return 'general';
  } catch {
    return 'general';
  }
}

/**
 * Extract a human-readable title from a URL slug.
 * Converts hyphens to spaces, capitalizes first letter.
 */
function titleFromSlug(url) {
  try {
    const pathname = new URL(url).pathname;
    // Take the last meaningful segment
    const segments = pathname.split('/').filter(Boolean);
    const slug = segments[segments.length - 1] || segments[0] || '';
    return slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim() || url;
  } catch {
    return url;
  }
}

/**
 * Normalize a topic string for fuzzy matching.
 * Strips accents, lowercases, removes stop words.
 */
function normalizeTopic(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(le|la|les|de|du|des|en|au|aux|un|une|et|ou|pour|que|qui|dans|sur|avec|pas|plus|son|ses|ce|cette|notre|nos|votre|vos|leur|leurs)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Core Logic ────────────────────────────────────────────────────────────

/**
 * Run competitor sitemap monitoring.
 * Diffs against previous state, identifies new articles, cross-references with
 * FlashVoyage coverage.
 *
 * @returns {Promise<{
 *   timestamp: string,
 *   competitors: Array<{id: string, name: string, totalUrls: number, newUrls: number}>,
 *   newArticles: Array<{
 *     competitor: string,
 *     url: string,
 *     lastmod: string|null,
 *     destination: string|null,
 *     contentType: string,
 *     title: string,
 *     action: 'content_gap' | 'stale_refresh' | 'monitor',
 *     priority: 'P1' | 'P2' | 'P3',
 *     reason: string,
 *     matchedArticle?: { wpId: number, slug: string, compositeScore: number, freshness: number }
 *   }>,
 *   summary: {
 *     totalNew: number,
 *     contentGaps: number,
 *     staleRefreshes: number,
 *     monitoring: number,
 *   }
 * }>}
 */
export async function monitorCompetitors() {
  log('Starting competitor monitoring...');
  const startTime = Date.now();

  await mkdir(DATA_DIR, { recursive: true });

  // ── Load previous state and our article scores ──
  const previousState = await loadJsonSafe(STATE_PATH) || { competitors: {} };
  const scoresData = await loadJsonSafe(SCORES_PATH);
  const articleScores = scoresData?.scores || [];

  // Build a lookup index of our articles by normalized title + slug
  const ourArticleIndex = buildArticleIndex(articleScores);

  const competitorResults = [];
  const newArticles = [];
  const currentState = { timestamp: new Date().toISOString(), competitors: {} };

  // ── Fetch and diff each competitor ──
  for (const competitor of COMPETITORS) {
    log(`Processing ${competitor.name}...`);
    const entries = await fetchSitemap(competitor.sitemapUrl);
    log(`  ${entries.length} article URLs found`);

    // Build URL set for current state
    const currentUrls = new Map();
    for (const entry of entries) {
      currentUrls.set(entry.loc, entry.lastmod);
    }

    // Save current state
    currentState.competitors[competitor.id] = {
      lastScan: new Date().toISOString(),
      urlCount: currentUrls.size,
      urls: Object.fromEntries(currentUrls),
    };

    // Diff against previous state
    const previousUrls = previousState.competitors?.[competitor.id]?.urls || {};
    let newCount = 0;

    for (const [url, lastmod] of currentUrls) {
      const wasKnown = url in previousUrls;
      const wasUpdated = wasKnown && lastmod && previousUrls[url] !== lastmod;

      if (!wasKnown || wasUpdated) {
        newCount++;
        const destination = extractDestination(url);
        const contentType = extractContentType(url);
        const title = titleFromSlug(url);

        // Cross-reference with our articles
        const { action, priority, reason, matchedArticle } = crossReference({
          destination,
          contentType,
          title,
          url,
          ourArticleIndex,
          articleScores,
        });

        // Only track articles about our niche (SE Asia + adjacent)
        // Skip articles with no detected Asia destination
        if (!destination) continue;

        newArticles.push({
          competitor: competitor.id,
          url,
          lastmod,
          destination,
          contentType,
          title,
          action,
          priority,
          reason,
          ...(matchedArticle ? { matchedArticle } : {}),
        });
      }
    }

    competitorResults.push({
      id: competitor.id,
      name: competitor.name,
      totalUrls: currentUrls.size,
      newUrls: newCount,
    });

    log(`  ${newCount} new/updated URLs detected`);
  }

  // ── Sort new articles by priority ──
  const priorityOrder = { P1: 0, P2: 1, P3: 2 };
  newArticles.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

  // ── Build summary ──
  const summary = {
    totalNew: newArticles.length,
    contentGaps: newArticles.filter(a => a.action === 'content_gap').length,
    staleRefreshes: newArticles.filter(a => a.action === 'stale_refresh').length,
    monitoring: newArticles.filter(a => a.action === 'monitor').length,
  };

  const report = {
    timestamp: new Date().toISOString(),
    competitors: competitorResults,
    newArticles,
    summary,
  };

  // ── Write outputs ──
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  await writeFile(STATE_PATH, JSON.stringify(currentState, null, 2));

  log(`Competitor report written to ${REPORT_PATH}`);
  log(`State saved to ${STATE_PATH}`);
  log(`Summary: ${summary.totalNew} new articles — ${summary.contentGaps} content gaps (P1), ${summary.staleRefreshes} stale (P2), ${summary.monitoring} monitoring (P3)`);
  log(`Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return report;
}

/**
 * Build a searchable index of our articles for cross-referencing.
 * Indexes by: normalized title words, slug words, destination.
 */
function buildArticleIndex(articleScores) {
  const index = {
    byDestination: new Map(),  // destination → [article]
    bySlugWords: new Map(),    // word → [article]
    all: articleScores,
  };

  for (const article of articleScores) {
    // Index by destination extracted from slug
    const dest = extractDestination(`https://flashvoyage.com/${article.slug || ''}`);
    if (dest) {
      if (!index.byDestination.has(dest)) index.byDestination.set(dest, []);
      index.byDestination.get(dest).push(article);
    }

    // Index by significant slug words
    const words = (article.slug || '').split('-').filter(w => w.length > 3);
    for (const word of words) {
      const normalized = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (!index.bySlugWords.has(normalized)) index.bySlugWords.set(normalized, []);
      index.bySlugWords.get(normalized).push(article);
    }
  }

  return index;
}

/**
 * Cross-reference a competitor article against our content.
 * Determines the appropriate action and priority.
 */
function crossReference({ destination, contentType, title, url, ourArticleIndex, articleScores }) {
  // Strategy 1: Match by destination
  let candidates = [];
  if (destination) {
    candidates = ourArticleIndex.byDestination.get(destination) || [];
  }

  // Strategy 2: If no destination match, try keyword matching from URL slug
  if (candidates.length === 0) {
    const slugWords = new URL(url).pathname.split(/[/-]/).filter(w => w.length > 4);
    const wordMatches = new Map();

    for (const word of slugWords) {
      const normalized = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const matches = ourArticleIndex.bySlugWords.get(normalized) || [];
      for (const match of matches) {
        const key = match.wpId || match.slug;
        wordMatches.set(key, (wordMatches.get(key) || 0) + 1);
      }
    }

    // Articles matching 2+ words from the competitor URL
    if (wordMatches.size > 0) {
      const bestMatches = [...wordMatches.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1]);

      if (bestMatches.length > 0) {
        candidates = bestMatches.map(([key]) =>
          articleScores.find(a => (a.wpId || a.slug) === key)
        ).filter(Boolean);
      }
    }
  }

  // Strategy 3: Match by content type + destination combo
  if (candidates.length === 0 && destination && contentType !== 'general') {
    // Look for any article with a similar topic
    const normalizedTitle = normalizeTopic(title);
    candidates = articleScores.filter(a => {
      const normalizedArticle = normalizeTopic(a.title || a.slug || '');
      // Check if at least 2 significant words overlap
      const titleWords = normalizedTitle.split(' ').filter(w => w.length > 3);
      const articleWords = normalizedArticle.split(' ').filter(w => w.length > 3);
      const overlap = titleWords.filter(w => articleWords.includes(w));
      return overlap.length >= 2;
    });
  }

  // ── Decision ──

  if (candidates.length === 0) {
    // No matching article → Content gap
    return {
      action: 'content_gap',
      priority: 'P1',
      reason: `Competitor covers "${title}" (${destination || 'unknown dest'}, ${contentType}) — no matching FlashVoyage article found`,
    };
  }

  // Find the best matching article
  const bestMatch = candidates.sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0))[0];
  const freshness = bestMatch.signals?.freshness ?? 1;
  const isStale = freshness <= (STALE_THRESHOLD_DAYS / 365); // Normalize to 0-1 scale (same as article-scorer)

  if (isStale) {
    return {
      action: 'stale_refresh',
      priority: 'P2',
      reason: `Competitor updated "${title}" — our article "${bestMatch.title || bestMatch.slug}" is stale (freshness=${freshness.toFixed(2)})`,
      matchedArticle: {
        wpId: bestMatch.wpId,
        slug: bestMatch.slug,
        compositeScore: bestMatch.compositeScore,
        freshness,
      },
    };
  }

  return {
    action: 'monitor',
    priority: 'P3',
    reason: `We cover this topic: "${bestMatch.title || bestMatch.slug}" (score=${bestMatch.compositeScore}, freshness=${freshness.toFixed(2)})`,
    matchedArticle: {
      wpId: bestMatch.wpId,
      slug: bestMatch.slug,
      compositeScore: bestMatch.compositeScore,
      freshness,
    },
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));
if (isMain) {
  monitorCompetitors()
    .then(report => {
      console.log(`\nCompetitor Monitor Report:`);
      console.log(`  Competitors scanned: ${report.competitors.length}`);
      for (const c of report.competitors) {
        console.log(`    ${c.name}: ${c.totalUrls} total, ${c.newUrls} new`);
      }
      console.log(`\n  New articles: ${report.summary.totalNew}`);
      console.log(`    P1 Content gaps: ${report.summary.contentGaps}`);
      console.log(`    P2 Stale refresh: ${report.summary.staleRefreshes}`);
      console.log(`    P3 Monitoring: ${report.summary.monitoring}`);

      if (report.newArticles.length > 0) {
        console.log(`\n  Top items:`);
        for (const item of report.newArticles.slice(0, 10)) {
          console.log(`    [${item.priority}] ${item.action}: ${item.title} (${item.competitor})`);
        }
      }
    })
    .catch(err => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
