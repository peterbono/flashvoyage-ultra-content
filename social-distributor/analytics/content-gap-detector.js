#!/usr/bin/env node

/**
 * Content Gap Detector — FlashVoyage Content Intelligence Engine
 *
 * Identifies high-value content opportunities by cross-referencing:
 *   1. Google Trends rising queries (FR, travel-related)
 *   2. GSC queries with impressions but no dedicated article
 *   3. Competitor top articles (manual audit data)
 *   4. Existing 118 FlashVoyage articles
 *
 * Output: ranked list of "articles to write" with estimated traffic potential.
 *
 * Each gap entry includes:
 *   - keyword / topic
 *   - estimated monthly search volume (from GSC impressions or Trends data)
 *   - competition difficulty estimate
 *   - recommended article type (guide, budget, comparison, news)
 *   - suggested title
 *   - estimated traffic potential (impressions * expected CTR at position 3)
 *   - priority score (0-100)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const GAPS_PATH = join(DATA_DIR, 'content-gaps.json');

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[GAP-DETECT] ${msg}`);
}

function logError(msg) {
  console.error(`[GAP-DETECT] ERROR: ${msg}`);
}

// ── Article Database ────────────────────────────────────────────────────────

/**
 * Fetch the current FlashVoyage article catalog.
 * Prefers the WP REST API, falls back to cached articles-database.json.
 *
 * @returns {Promise<Array<{ slug: string, title: string, url: string }>>}
 */
async function getExistingArticles() {
  // Try WP REST API first
  try {
    const response = await fetch(
      'https://flashvoyage.com/wp-json/wp/v2/posts?per_page=100&_fields=id,title,slug&status=publish',
      { signal: AbortSignal.timeout(10000) }
    );
    if (response.ok) {
      const posts = await response.json();
      // Fetch additional pages
      const totalPages = parseInt(response.headers.get('x-wp-totalpages') || '1');
      const allPosts = [...posts];

      for (let page = 2; page <= totalPages; page++) {
        try {
          const nextResp = await fetch(
            `https://flashvoyage.com/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,title,slug&status=publish`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (nextResp.ok) {
            allPosts.push(...await nextResp.json());
          }
        } catch { break; }
      }

      log(`Loaded ${allPosts.length} articles from WP REST API`);
      return allPosts.map(p => ({
        slug: p.slug,
        title: p.title?.rendered || '',
        url: `https://flashvoyage.com/${p.slug}/`,
      }));
    }
  } catch (err) {
    log(`WP API failed, using cache: ${err.message}`);
  }

  // Fallback to local cache
  const cachePath = join(__dirname, '..', '..', 'articles-database.json');
  if (existsSync(cachePath)) {
    const data = JSON.parse(readFileSync(cachePath, 'utf-8'));
    log(`Loaded ${data.articles?.length || 0} articles from local cache`);
    return (data.articles || []).map(a => ({
      slug: a.slug,
      title: a.title,
      url: a.url,
    }));
  }

  log('No article data available');
  return [];
}

/**
 * Normalize text for fuzzy matching: lowercase, remove accents, strip punctuation.
 */
function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if any existing article covers a given topic.
 * Uses word overlap matching on slugs and titles.
 *
 * @param {string} topic - The topic/keyword to check
 * @param {Array} articles - Existing articles
 * @returns {{ covered: boolean, matchingArticle: string|null, matchScore: number }}
 */
function isTopicCovered(topic, articles) {
  const normalizedTopic = normalize(topic);
  const topicWords = normalizedTopic.split(' ').filter(w => w.length > 2);

  // Generic words that don't count as topic-specific matches
  const generic = new Set([
    'voyage', 'voyager', 'guide', 'complet', 'budget', 'prix', 'cout',
    'comment', 'quand', 'partir', 'aller', 'faire', 'trouver', 'meilleur',
    'conseil', 'avis', 'pas', 'cher', 'pour', 'avec', 'dans', 'les', 'des', 'une',
  ]);

  const significantWords = topicWords.filter(w => !generic.has(w));
  if (significantWords.length === 0) return { covered: false, matchingArticle: null, matchScore: 0 };

  let bestMatch = { covered: false, matchingArticle: null, matchScore: 0 };

  for (const article of articles) {
    const articleText = normalize(`${article.title} ${article.slug.replace(/-/g, ' ')}`);

    const matches = significantWords.filter(w => articleText.includes(w));
    const matchScore = matches.length / significantWords.length;

    if (matchScore > bestMatch.matchScore) {
      bestMatch = {
        covered: matchScore >= 0.6, // 60% word overlap = covered
        matchingArticle: article.url,
        matchScore,
      };
    }
  }

  return bestMatch;
}

// ── Gap Detection Sources ───────────────────────────────────────────────────

/**
 * Source 1: GSC Impression Gaps
 *
 * Queries where FlashVoyage appears in search results (has impressions)
 * but doesn't have a dedicated article. This means Google already
 * considers FlashVoyage relevant for the topic — a dedicated article
 * would likely rank quickly.
 *
 * @param {Array} gscQueries - From search-console-fetcher.fetchTopQueries()
 * @param {Array} articles - Existing articles
 * @returns {Array<ContentGap>}
 */
export function findGSCImpressionGaps(gscQueries, articles) {
  log('Finding GSC impression gaps...');

  const gaps = [];

  for (const query of gscQueries) {
    // Skip branded queries
    if (query.query.includes('flashvoyage') || query.query.includes('flash voyage')) continue;

    // Skip very low volume
    if (query.impressions < 30) continue;

    const coverage = isTopicCovered(query.query, articles);

    if (!coverage.covered) {
      // Estimate traffic potential: if we rank at position 3, what clicks would we get?
      const expectedCTR = 0.186; // Position 3 average CTR
      const estimatedMonthlyTraffic = Math.round(query.impressions * expectedCTR);

      gaps.push({
        source: 'gsc_impressions',
        keyword: query.query,
        impressions: query.impressions,
        currentPosition: query.position,
        currentCTR: query.ctr,
        estimatedMonthlyTraffic,
        existingPartialMatch: coverage.matchingArticle,
        matchScore: coverage.matchScore,
      });
    }
  }

  // Sort by estimated traffic
  gaps.sort((a, b) => b.estimatedMonthlyTraffic - a.estimatedMonthlyTraffic);

  log(`Found ${gaps.length} GSC impression gaps`);
  return gaps;
}

/**
 * Source 2: Google Trends Rising Gaps
 *
 * Rising queries from Google Trends that don't match any existing article.
 * These represent emerging demand — getting there first = SEO first-mover advantage.
 *
 * @param {Array} trendsData - From trends-scanner scan/deepdive
 * @param {Array} articles - Existing articles
 * @returns {Array<ContentGap>}
 */
export function findTrendsGaps(trendsData, articles) {
  log('Finding Google Trends gaps...');

  const gaps = [];

  for (const trend of trendsData) {
    // Only consider travel-relevant trends
    const query = trend.query || trend.title || '';
    if (!query) continue;

    const coverage = isTopicCovered(query, articles);

    if (!coverage.covered) {
      const traffic = trend.traffic || 0;

      gaps.push({
        source: 'google_trends',
        keyword: query,
        trendsTraffic: traffic,
        trendsFormatted: trend.trafficFormatted || '',
        isRising: trend.source === 'related-rising',
        parentDestination: trend.parentDestination || null,
        estimatedMonthlyTraffic: Math.round(traffic * 0.05), // Conservative: 5% of trend volume
        existingPartialMatch: coverage.matchingArticle,
        matchScore: coverage.matchScore,
      });
    }
  }

  gaps.sort((a, b) => b.estimatedMonthlyTraffic - a.estimatedMonthlyTraffic);

  log(`Found ${gaps.length} Google Trends gaps`);
  return gaps;
}

/**
 * Source 3: Competitor Article Gaps
 *
 * Topics covered by competitor travel blogs but not by FlashVoyage.
 * This data comes from a manual or semi-automated competitor audit.
 *
 * Competitor list for French SE Asia travel content:
 *   - Noobvoyage.fr (budget SE Asia specialist)
 *   - Mademoiselle-voyage.fr (Bali/Thailand focus)
 *   - Lesacados.com (general travel, strong SEO)
 *   - Voyagerpascher.com (deal-oriented)
 *   - Onedayonetravel.com (itinerary-focused)
 *   - Routard.com (institutional, high DA)
 *
 * @param {string} competitorDataPath - Path to competitor-articles.json
 * @param {Array} articles - Existing FlashVoyage articles
 * @returns {Array<ContentGap>}
 */
export function findCompetitorGaps(competitorDataPath, articles) {
  if (!existsSync(competitorDataPath)) {
    log('No competitor data file found. Run competitor audit first.');
    return [];
  }

  const competitors = JSON.parse(readFileSync(competitorDataPath, 'utf-8'));
  const gaps = [];

  for (const entry of competitors) {
    const coverage = isTopicCovered(entry.topic || entry.title, articles);

    if (!coverage.covered) {
      gaps.push({
        source: 'competitor_audit',
        keyword: entry.topic || entry.title,
        competitorUrl: entry.url,
        competitorSite: entry.site,
        estimatedMonthlyTraffic: entry.estimatedTraffic || 0,
        existingPartialMatch: coverage.matchingArticle,
        matchScore: coverage.matchScore,
      });
    }
  }

  gaps.sort((a, b) => b.estimatedMonthlyTraffic - a.estimatedMonthlyTraffic);

  log(`Found ${gaps.length} competitor gaps`);
  return gaps;
}

/**
 * Source 4: Programmatic SEO Gaps
 *
 * Templated content patterns that should exist but don't.
 * Based on the FlashVoyage editorial model:
 *
 * For each SE Asia destination, we should have:
 *   - "[Dest] budget 2026 : combien coute un voyage"
 *   - "[Dest] itineraire 2 semaines"
 *   - "[Dest] visa : formalites et conseils"
 *   - "[Dest] vs [Dest2] : comparatif"
 *   - "[Dest] quand partir : meilleure periode"
 *   - "[Dest] arnaques : les pieges a eviter"
 *   - "[Dest] digital nomad : guide complet"
 *
 * @param {Array} articles - Existing FlashVoyage articles
 * @returns {Array<ContentGap>}
 */
export function findProgrammaticGaps(articles) {
  log('Finding programmatic content gaps...');

  const destinations = [
    { name: 'Bali', slug: 'bali', volume: 'high' },
    { name: 'Thailande', slug: 'thailande', volume: 'high' },
    { name: 'Vietnam', slug: 'vietnam', volume: 'high' },
    { name: 'Japon', slug: 'japon', volume: 'high' },
    { name: 'Philippines', slug: 'philippines', volume: 'medium' },
    { name: 'Cambodge', slug: 'cambodge', volume: 'medium' },
    { name: 'Laos', slug: 'laos', volume: 'medium' },
    { name: 'Malaisie', slug: 'malaisie', volume: 'medium' },
    { name: 'Singapour', slug: 'singapour', volume: 'medium' },
    { name: 'Indonesie', slug: 'indonesie', volume: 'medium' },
    { name: 'Sri Lanka', slug: 'sri-lanka', volume: 'medium' },
    { name: 'Nepal', slug: 'nepal', volume: 'low' },
    { name: 'Myanmar', slug: 'myanmar', volume: 'low' },
    { name: 'Coree du Sud', slug: 'coree-du-sud', volume: 'medium' },
  ];

  const templates = [
    { pattern: '{dest} budget 2026', type: 'budget', volumeMultiplier: 1.0 },
    { pattern: '{dest} itineraire 2 semaines', type: 'itinerary', volumeMultiplier: 0.8 },
    { pattern: '{dest} visa formalites', type: 'practical', volumeMultiplier: 0.7 },
    { pattern: '{dest} quand partir meilleure periode', type: 'seasonal', volumeMultiplier: 0.6 },
    { pattern: '{dest} arnaques pieges eviter', type: 'safety', volumeMultiplier: 0.5 },
    { pattern: '{dest} digital nomad guide', type: 'nomad', volumeMultiplier: 0.4 },
    { pattern: '{dest} cout vie mensuel', type: 'budget', volumeMultiplier: 0.5 },
    { pattern: '{dest} nourriture gastronomie', type: 'culture', volumeMultiplier: 0.3 },
  ];

  const volumeEstimates = { high: 2000, medium: 800, low: 300 };
  const gaps = [];

  for (const dest of destinations) {
    for (const template of templates) {
      const topic = template.pattern.replace('{dest}', dest.name);
      const coverage = isTopicCovered(topic, articles);

      if (!coverage.covered) {
        const baseVolume = volumeEstimates[dest.volume];
        const estimatedTraffic = Math.round(baseVolume * template.volumeMultiplier);

        gaps.push({
          source: 'programmatic',
          keyword: topic,
          destination: dest.name,
          articleType: template.type,
          estimatedMonthlyTraffic: estimatedTraffic,
          existingPartialMatch: coverage.matchingArticle,
          matchScore: coverage.matchScore,
        });
      }
    }
  }

  gaps.sort((a, b) => b.estimatedMonthlyTraffic - a.estimatedMonthlyTraffic);

  log(`Found ${gaps.length} programmatic content gaps`);
  return gaps;
}

// ── Unified Gap Analysis ────────────────────────────────────────────────────

/**
 * Run full content gap analysis across all sources.
 * Deduplicates, scores, and ranks all opportunities.
 *
 * @param {Object} options
 * @param {Array} options.gscQueries - Pre-fetched GSC queries (optional, will try to import)
 * @param {Array} options.trendsData - Pre-fetched trends data (optional)
 * @returns {Promise<Array<{ keyword: string, sources: string[], estimatedMonthlyTraffic: number, priorityScore: number, suggestedTitle: string, articleType: string, actions: string[] }>>}
 */
export async function analyzeContentGaps(options = {}) {
  const {
    gscQueries = [],
    trendsData = [],
  } = options;

  const articles = await getExistingArticles();
  log(`Analyzing gaps against ${articles.length} existing articles`);

  // Collect gaps from all sources
  const gscGaps = gscQueries.length > 0 ? findGSCImpressionGaps(gscQueries, articles) : [];
  const trendsGaps = trendsData.length > 0 ? findTrendsGaps(trendsData, articles) : [];
  const programmaticGaps = findProgrammaticGaps(articles);

  // Competitor data (if available)
  const competitorPath = join(DATA_DIR, 'competitor-articles.json');
  const competitorGaps = findCompetitorGaps(competitorPath, articles);

  // Merge all gaps
  const allGaps = [...gscGaps, ...trendsGaps, ...programmaticGaps, ...competitorGaps];
  log(`Total raw gaps: ${allGaps.length} (GSC=${gscGaps.length}, Trends=${trendsGaps.length}, Programmatic=${programmaticGaps.length}, Competitor=${competitorGaps.length})`);

  // Deduplicate by keyword similarity
  const deduplicated = deduplicateGaps(allGaps);
  log(`After dedup: ${deduplicated.length} unique gaps`);

  // Score and rank
  const scored = deduplicated.map(gap => {
    const priorityScore = computeGapPriority(gap);
    const articleType = detectArticleType(gap.keyword);
    const suggestedTitle = generateTitle(gap.keyword, articleType);

    return {
      keyword: gap.keyword,
      sources: gap.sources || [gap.source],
      estimatedMonthlyTraffic: gap.estimatedMonthlyTraffic || 0,
      priorityScore,
      suggestedTitle,
      articleType,
      destination: gap.destination || extractDestination(gap.keyword),
      existingPartialMatch: gap.existingPartialMatch,
      gscData: gap.impressions ? {
        impressions: gap.impressions,
        currentPosition: gap.currentPosition,
        currentCTR: gap.currentCTR,
      } : null,
      trendsData: gap.trendsTraffic ? {
        traffic: gap.trendsTraffic,
        isRising: gap.isRising,
      } : null,
    };
  });

  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  // Assign rank
  for (let i = 0; i < scored.length; i++) {
    scored[i].rank = i + 1;
  }

  log(`Gap analysis complete: ${scored.length} opportunities ranked`);

  return scored;
}

/**
 * Deduplicate gaps by keyword similarity.
 * Merges entries that share 80%+ word overlap.
 */
function deduplicateGaps(gaps) {
  const merged = [];
  const used = new Set();

  for (let i = 0; i < gaps.length; i++) {
    if (used.has(i)) continue;

    const current = { ...gaps[i], sources: [gaps[i].source] };
    let bestTraffic = current.estimatedMonthlyTraffic || 0;

    for (let j = i + 1; j < gaps.length; j++) {
      if (used.has(j)) continue;

      if (keywordsSimilar(current.keyword, gaps[j].keyword)) {
        used.add(j);
        current.sources.push(gaps[j].source);
        // Take the higher traffic estimate
        if ((gaps[j].estimatedMonthlyTraffic || 0) > bestTraffic) {
          bestTraffic = gaps[j].estimatedMonthlyTraffic;
        }
        // Merge GSC data if available
        if (gaps[j].impressions && !current.impressions) {
          current.impressions = gaps[j].impressions;
          current.currentPosition = gaps[j].currentPosition;
          current.currentCTR = gaps[j].currentCTR;
        }
        // Merge trends data
        if (gaps[j].trendsTraffic && !current.trendsTraffic) {
          current.trendsTraffic = gaps[j].trendsTraffic;
          current.isRising = gaps[j].isRising;
        }
      }
    }

    current.estimatedMonthlyTraffic = bestTraffic;
    merged.push(current);
  }

  return merged;
}

/**
 * Check if two keywords are similar (80%+ significant word overlap).
 */
function keywordsSimilar(a, b) {
  const generic = new Set(['voyage', 'guide', 'complet', 'pas', 'cher', 'les', 'des', 'pour']);
  const wordsA = normalize(a).split(' ').filter(w => w.length > 2 && !generic.has(w));
  const wordsB = normalize(b).split(' ').filter(w => w.length > 2 && !generic.has(w));

  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const overlap = wordsA.filter(w => wordsB.includes(w)).length;
  const maxLen = Math.max(wordsA.length, wordsB.length);

  return overlap / maxLen >= 0.8;
}

/**
 * Compute a priority score (0-100) for a content gap.
 *
 * Factors:
 *   - Estimated traffic (40% weight)
 *   - Number of confirming sources (20%)
 *   - Whether it's a rising trend (15%)
 *   - Destination relevance to FlashVoyage (15%)
 *   - Partial match exists (10% — easier to expand than create from scratch)
 */
function computeGapPriority(gap) {
  let score = 0;

  // Traffic factor (0-40)
  const traffic = gap.estimatedMonthlyTraffic || 0;
  if (traffic >= 1000) score += 40;
  else if (traffic >= 500) score += 30;
  else if (traffic >= 200) score += 20;
  else if (traffic >= 50) score += 10;

  // Source confirmation (0-20)
  const sources = gap.sources || [gap.source];
  score += Math.min(20, sources.length * 7);

  // Rising trend bonus (0-15)
  if (gap.isRising) score += 15;
  else if (gap.trendsTraffic > 0) score += 8;

  // Destination relevance (0-15)
  const seAsiaDestinations = [
    'bali', 'thailande', 'vietnam', 'japon', 'philippines', 'cambodge',
    'laos', 'malaisie', 'singapour', 'indonesie', 'coree',
  ];
  const dest = extractDestination(gap.keyword);
  if (dest && seAsiaDestinations.some(d => dest.includes(d))) {
    score += 15;
  } else if (dest) {
    score += 8;
  }

  // Partial match bonus (0-10)
  if (gap.existingPartialMatch && gap.matchScore > 0.3) {
    score += 10; // We already have related content, easier to build on
  }

  return Math.min(100, score);
}

/**
 * Detect article type from keyword.
 */
function detectArticleType(keyword) {
  const kw = normalize(keyword);

  if (kw.includes('budget') || kw.includes('prix') || kw.includes('cout')) return 'budget';
  if (kw.includes('itineraire') || kw.includes('semaines') || kw.includes('mois') || kw.includes('circuit')) return 'itinerary';
  if (kw.includes('visa') || kw.includes('formalite')) return 'practical';
  if (kw.includes('vs') || kw.includes('ou') || kw.includes('comparatif')) return 'comparison';
  if (kw.includes('danger') || kw.includes('arnaque') || kw.includes('securite')) return 'safety';
  if (kw.includes('quand') || kw.includes('meilleure periode') || kw.includes('saison')) return 'seasonal';
  if (kw.includes('digital nomad') || kw.includes('nomade')) return 'nomad';
  if (kw.includes('nourriture') || kw.includes('gastronomie') || kw.includes('manger')) return 'culture';

  return 'guide';
}

/**
 * Extract destination from keyword.
 */
function extractDestination(keyword) {
  const kw = normalize(keyword);
  const destinations = [
    'bali', 'thailande', 'thailand', 'vietnam', 'japon', 'japan',
    'philippines', 'cambodge', 'laos', 'malaisie', 'singapour',
    'indonesie', 'sri lanka', 'nepal', 'myanmar', 'coree', 'korea',
    'bangkok', 'chiang mai', 'phuket', 'hanoi', 'ho chi minh',
    'ubud', 'lombok', 'siem reap', 'luang prabang',
  ];

  return destinations.find(d => kw.includes(d)) || null;
}

/**
 * Generate a suggested article title in FlashVoyage editorial style.
 */
function generateTitle(keyword, type) {
  const dest = extractDestination(keyword) || '';
  const destCapitalized = dest ? dest.charAt(0).toUpperCase() + dest.slice(1) : '';

  const templates = {
    budget: `${destCapitalized} Budget 2026 : Combien Coute Vraiment un Voyage ?`,
    itinerary: `${destCapitalized} Itineraire 2 Semaines : Le Circuit que Personne ne Vous Montre`,
    practical: `${destCapitalized} Visa 2026 : Formalites, Prix et Pieges a Eviter`,
    comparison: `${keyword.replace(/\b\w/g, l => l.toUpperCase())} : Le Comparatif Honnete`,
    safety: `${destCapitalized} Arnaques : Les ${Math.floor(Math.random() * 3) + 5} Pieges qui Coutent Cher aux Touristes`,
    seasonal: `${destCapitalized} : Quand Partir ? La Meilleure Periode Mois par Mois`,
    nomad: `Digital Nomad ${destCapitalized} : Guide Complet pour S'installer`,
    culture: `${destCapitalized} Gastronomie : Ce qu'il Faut Gouter (et Eviter)`,
    guide: `${destCapitalized} Guide Complet 2026 : Tout ce que les Blogs ne Disent Pas`,
  };

  return templates[type] || `${keyword.replace(/\b\w/g, l => l.toUpperCase())} : Guide Flash Voyage`;
}

// ── Persistence ─────────────────────────────────────────────────────────────

/**
 * Run gap analysis and save results.
 */
export async function analyzeAndPersist(options = {}) {
  const gaps = await analyzeContentGaps(options);

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const output = {
    generatedAt: new Date().toISOString(),
    totalGaps: gaps.length,
    topGaps: gaps.slice(0, 50),
    byArticleType: groupBy(gaps, 'articleType'),
    byDestination: groupBy(gaps.filter(g => g.destination), 'destination'),
    allGaps: gaps,
  };

  writeFileSync(GAPS_PATH, JSON.stringify(output, null, 2), 'utf-8');
  log(`Content gaps written to ${GAPS_PATH}`);

  return gaps;
}

function groupBy(arr, key) {
  const groups = {};
  for (const item of arr) {
    const k = item[key] || 'other';
    if (!groups[k]) groups[k] = [];
    groups[k].push(item);
  }
  // Sort each group by priority
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => b.priorityScore - a.priorityScore);
  }
  return groups;
}

// ── CLI Mode ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('content-gap-detector')) {
  const command = process.argv[2] || 'analyze';

  (async () => {
    try {
      switch (command) {
        case 'analyze': {
          // Run programmatic gaps only (no external data needed)
          const gaps = await analyzeAndPersist();
          console.log(`\n=== TOP 20 CONTENT OPPORTUNITIES ===\n`);
          for (const gap of gaps.slice(0, 20)) {
            console.log(`#${gap.rank} [Priority: ${gap.priorityScore}] ${gap.suggestedTitle}`);
            console.log(`   Keyword: "${gap.keyword}"`);
            console.log(`   Est. Traffic: ${gap.estimatedMonthlyTraffic}/mo | Type: ${gap.articleType} | Sources: ${gap.sources.join(', ')}`);
            if (gap.existingPartialMatch) {
              console.log(`   Partial match: ${gap.existingPartialMatch} (${Math.round(gap.matchScore * 100)}%)`);
            }
            console.log();
          }
          break;
        }
        case 'programmatic': {
          const articles = await getExistingArticles();
          const gaps = findProgrammaticGaps(articles);
          console.log(JSON.stringify(gaps.slice(0, 30), null, 2));
          break;
        }
        default:
          console.log(`
Content Gap Detector — FlashVoyage Content Intelligence

Usage:
  node content-gap-detector.js analyze       Full gap analysis (saves to content-gaps.json)
  node content-gap-detector.js programmatic  Show programmatic gaps only

Note: For full analysis with GSC + Trends data, use the orchestrator:
  node content-intelligence-engine.js full
`);
      }
    } catch (err) {
      logError(err.message);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}
