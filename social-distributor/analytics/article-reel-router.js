#!/usr/bin/env node

/**
 * Article-to-Reel Router — FlashVoyage Content Intelligence Engine
 *
 * Automatically determines which reel format to generate for each article type,
 * triggers reel generation when new articles are published, and tracks the
 * article → reel → traffic attribution chain.
 *
 * Routing rules:
 *
 *   Article Type          | Primary Reel Format | Secondary Format   | Rationale
 *   ----------------------|--------------------|--------------------|---------------------------
 *   Budget breakdown      | budget_reveal      | listicle           | Numbers scroll = high engagement
 *   Itinerary (2-4 weeks) | trip_pick (pick)   | listicle           | Day-by-day visual appeal
 *   Comparison / VS       | versus             | poll               | Side-by-side drives debate
 *   General guide         | ou_partir (month)  | stock_deal         | Seasonal hooks work best
 *   Safety / Arnaques     | news_flash         | listicle           | Urgency drives saves
 *   News / Update         | news_flash         | meme_humor         | Breaking = high reach
 *   Practical (visa, etc) | listicle           | budget_reveal      | Checklist format = saves
 *   Culture / Food        | listicle           | meme_humor         | Visual listicle = shares
 *
 * Attribution tracking:
 *   - Each reel caption includes a trackable slug reference
 *   - Article URL is in the IG bio link (via Linktree or direct)
 *   - GA4 referral tracking: source=instagram, medium=social
 *   - UTM parameters: ?utm_source=instagram&utm_medium=reel&utm_campaign={reel_id}
 *   - Cross-reference: reel-history.jsonl (reelId, postId) ↔ GA4 traffic sources
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const ROUTING_LOG_PATH = join(DATA_DIR, 'article-reel-routing.jsonl');

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[REEL-ROUTER] ${msg}`);
}

// ── Article Type Detection ──────────────────────────────────────────────────

/**
 * Detect article type from title, slug, and content excerpt.
 *
 * @param {{ title: string, slug: string, excerpt?: string, categories?: Array<{slug: string}>, tags?: Array<{slug: string}> }} article
 * @returns {'budget' | 'itinerary' | 'comparison' | 'guide' | 'safety' | 'news' | 'practical' | 'culture'}
 */
export function detectArticleType(article) {
  const text = [
    article.title || '',
    (article.slug || '').replace(/-/g, ' '),
    article.excerpt || '',
  ].join(' ').toLowerCase();

  const tagSlugs = (article.tags || []).map(t => t.slug).join(' ');
  const catSlugs = (article.categories || []).map(c => c.slug).join(' ');
  const meta = `${tagSlugs} ${catSlugs}`;

  // Order matters: more specific patterns first
  if (/\bvs\b|versus|comparatif|compar[eé]|ou choisir/.test(text)) return 'comparison';
  if (/budget|combien|co[uû]t|prix|d[eé]penses|euros?\s+par\s+jour/.test(text)) return 'budget';
  if (/itin[eé]raire|circuit|semaines?|jours?\s+[àa]|roadtrip|route/.test(text)) return 'itinerary';
  if (/arnaque|danger|s[eé]curit[eé]|pi[eè]ge|[eé]viter|attention/.test(text)) return 'safety';
  if (/visa|formalit[eé]|passeport|douane|vaccin|assurance/.test(text)) return 'practical';
  if (/nouveau|changement|mise [àa] jour|update|annonce|2026|r[eè]gle/.test(text)) return 'news';
  if (/gastronomie|nourriture|manger|cuisine|street food|temple|culture|tradition/.test(text)) return 'culture';

  // Check tags/categories
  if (meta.includes('budget')) return 'budget';
  if (meta.includes('itineraire') || meta.includes('circuit')) return 'itinerary';

  return 'guide';
}

// ── Reel Format Routing ─────────────────────────────────────────────────────

/**
 * Route table: maps article type to primary and secondary reel formats.
 *
 * Format names match the existing reels/script-generator.js and reels/config.js:
 *   poll, pick, humor, budget, avantapres, month, versus, listicle,
 *   stock_deal, news_flash, meme_humor, budget_reveal
 */
const ROUTE_TABLE = {
  budget: {
    primary: 'budget_reveal',
    secondary: 'listicle',
    captionTemplate: '💰 {title}\n\n{hook}\n\n👉 Lien en bio\n\n#FlashVoyage #Budget #Voyage',
  },
  itinerary: {
    primary: 'pick',
    secondary: 'listicle',
    captionTemplate: '🗺️ {title}\n\n{hook}\n\n📌 Itinéraire complet en bio\n\n#FlashVoyage #Itineraire',
  },
  comparison: {
    primary: 'versus',
    secondary: 'poll',
    captionTemplate: '⚡ {title}\n\n{hook}\n\n📊 Ton avis en commentaire !\n\n#FlashVoyage #Versus',
  },
  guide: {
    primary: 'month',
    secondary: 'stock_deal',
    captionTemplate: '✈️ {title}\n\n{hook}\n\n🔗 Guide complet en bio\n\n#FlashVoyage #Guide',
  },
  safety: {
    primary: 'news_flash',
    secondary: 'listicle',
    captionTemplate: '⚠️ {title}\n\n{hook}\n\n💾 Enregistre pour ton prochain voyage\n\n#FlashVoyage #Securite',
  },
  news: {
    primary: 'news_flash',
    secondary: 'meme_humor',
    captionTemplate: '🔴 {title}\n\n{hook}\n\n📲 Abonne-toi pour ne rien rater\n\n#FlashVoyage #ActuVoyage',
  },
  practical: {
    primary: 'listicle',
    secondary: 'budget_reveal',
    captionTemplate: '📋 {title}\n\n{hook}\n\n💾 Enregistre cette checklist\n\n#FlashVoyage #Conseils',
  },
  culture: {
    primary: 'listicle',
    secondary: 'meme_humor',
    captionTemplate: '🍜 {title}\n\n{hook}\n\n📖 Article complet en bio\n\n#FlashVoyage #Culture',
  },
};

/**
 * Get the recommended reel format(s) for an article.
 *
 * @param {{ title: string, slug: string, excerpt?: string, categories?: Array, tags?: Array }} article
 * @param {Object} [performanceWeights] - Optional performance-weights.json data to bias toward top formats
 * @returns {{ articleType: string, primaryFormat: string, secondaryFormat: string, captionTemplate: string, reason: string }}
 */
export function routeArticleToReel(article, performanceWeights = null) {
  const articleType = detectArticleType(article);
  const route = ROUTE_TABLE[articleType] || ROUTE_TABLE.guide;

  let primaryFormat = route.primary;
  let secondaryFormat = route.secondary;
  let reason = `Article type "${articleType}" maps to ${primaryFormat}`;

  // If performance data available, check if we should swap to a higher-performing format
  if (performanceWeights?.formatScores) {
    const scores = performanceWeights.formatScores;
    const primaryScore = scores[primaryFormat] || 0;
    const secondaryScore = scores[secondaryFormat] || 0;

    // If secondary format outperforms primary by 50%+, swap them
    if (secondaryScore > primaryScore * 1.5 && secondaryScore > 0) {
      [primaryFormat, secondaryFormat] = [secondaryFormat, primaryFormat];
      reason += ` (swapped: ${primaryFormat} outperforms ${secondaryFormat} by ${Math.round(secondaryScore / primaryScore * 100 - 100)}%)`;
    }
  }

  return {
    articleType,
    primaryFormat,
    secondaryFormat,
    captionTemplate: route.captionTemplate,
    reason,
  };
}

// ── Reel Trigger Pipeline ───────────────────────────────────────────────────

/**
 * Trigger reel generation for a newly published article.
 * Called by the article pipeline after WordPress publish.
 *
 * Steps:
 *   1. Detect article type
 *   2. Route to reel format
 *   3. Build caption with UTM tracking
 *   4. Call generateReel() from reels/index.js
 *   5. Log routing decision
 *
 * @param {{ id: number, title: string, slug: string, excerpt?: string, hook?: string, keyStats?: string[], categories?: Array, tags?: Array }} article
 * @param {Object} options
 * @param {boolean} options.publish - Publish to IG (default: false)
 * @param {boolean} options.dryRun - Log only, don't generate (default: false)
 * @returns {Promise<{ routing: Object, reel?: Object }>}
 */
export async function triggerReelForArticle(article, options = {}) {
  const { publish = false, dryRun = false } = options;

  // Load performance weights if available
  let performanceWeights = null;
  const weightsPath = join(__dirname, '..', 'reels', 'data', 'performance-weights.json');
  if (existsSync(weightsPath)) {
    try {
      performanceWeights = JSON.parse(readFileSync(weightsPath, 'utf-8'));
    } catch { /* ignore */ }
  }

  // Route
  const routing = routeArticleToReel(article, performanceWeights);
  log(`Article #${article.id} "${article.title}" → ${routing.primaryFormat} (${routing.reason})`);

  // Build caption with tracking
  const caption = routing.captionTemplate
    .replace('{title}', article.title || '')
    .replace('{hook}', article.hook || article.excerpt || '');

  // Log routing decision
  logRouting({
    date: new Date().toISOString(),
    articleId: article.id,
    articleSlug: article.slug,
    articleType: routing.articleType,
    reelFormat: routing.primaryFormat,
    reason: routing.reason,
  });

  if (dryRun) {
    log(`DRY RUN: Would generate ${routing.primaryFormat} reel for article #${article.id}`);
    return { routing };
  }

  // Generate the reel
  try {
    const { generateReel } = await import(join(__dirname, '..', 'reels', 'index.js'));

    const reelArticle = {
      ...article,
      postId: article.id,
      category: routing.articleType,
    };

    const result = await generateReel(reelArticle, {
      publish,
      forceType: routing.primaryFormat === 'listicle' ? 'listicle' : null,
    });

    log(`Reel generated: ${result.videoPath}${result.reelId ? ` (published: ${result.reelId})` : ''}`);

    return { routing, reel: result };
  } catch (err) {
    log(`Reel generation failed: ${err.message}`);
    return { routing, error: err.message };
  }
}

// ── Attribution Tracking ────────────────────────────────────────────────────

/**
 * Build a UTM-tracked URL for an article, to be used in IG bio link or Story swipe-up.
 *
 * @param {string} slug - Article slug
 * @param {string} reelId - IG reel media ID (for campaign tracking)
 * @returns {string} Full URL with UTM parameters
 */
export function buildTrackedArticleURL(slug, reelId = 'unknown') {
  const base = `https://flashvoyage.com/${slug}/`;
  const params = new URLSearchParams({
    utm_source: 'instagram',
    utm_medium: 'reel',
    utm_campaign: `reel_${reelId}`,
    utm_content: slug,
  });
  return `${base}?${params.toString()}`;
}

/**
 * Compute reel → article traffic attribution.
 *
 * Cross-references:
 *   1. reel-history.jsonl (reelId → postId/slug mapping)
 *   2. GA4 traffic sources (sessions from instagram/reel)
 *
 * @param {number} days - Lookback window
 * @returns {Promise<Array<{ reelId: string, articleSlug: string, reelDate: string, igSessions: number, igPageviews: number, estimatedConversions: number }>>}
 */
export async function computeReelAttribution(days = 30) {
  const { fetchArticleTrafficSources } = await import('./ga4-fetcher.js');
  const { readFileSync, existsSync } = await import('fs');

  // Load reel history
  const historyPath = join(DATA_DIR, 'reel-history.jsonl');
  if (!existsSync(historyPath)) {
    log('No reel history for attribution');
    return [];
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const lines = readFileSync(historyPath, 'utf-8').split('\n').filter(Boolean);
  const reels = lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && r.date >= cutoff.toISOString());

  log(`Computing attribution for ${reels.length} reels...`);

  const attributions = [];

  for (const reel of reels) {
    if (!reel.postId) continue;

    try {
      // Find the article slug
      // postId should map to a WP post, but we may need to look it up
      // For now, use the routing log to find the slug
      const slug = reel.slug || `post-${reel.postId}`;
      const pagePath = `/${slug}/`;

      // Fetch traffic sources for this article
      const sources = await fetchArticleTrafficSources(pagePath, days);

      // Find Instagram-specific traffic
      const igSource = sources.find(s =>
        s.source.includes('instagram') || s.source === 'l.instagram.com'
      );

      attributions.push({
        reelId: reel.reelId,
        articlePostId: reel.postId,
        articleSlug: slug,
        reelDate: reel.date,
        reelType: reel.type,
        igSessions: igSource?.sessions || 0,
        igPageviews: igSource?.pageviews || 0,
      });

      // Rate limit GA4 API calls
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      log(`Attribution failed for reel ${reel.reelId}: ${err.message}`);
    }
  }

  // Sort by IG sessions descending
  attributions.sort((a, b) => b.igSessions - a.igSessions);

  log(`Attribution computed for ${attributions.length} reel-article pairs`);
  return attributions;
}

// ── Persistence ─────────────────────────────────────────────────────────────

function logRouting(entry) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(ROUTING_LOG_PATH, JSON.stringify(entry) + '\n');
}

// ── CLI Mode ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('article-reel-router')) {
  const command = process.argv[2] || 'help';

  (async () => {
    try {
      switch (command) {
        case 'route': {
          // Route a test article
          const testArticle = {
            id: 1,
            title: process.argv[3] || 'Bali Budget 2026 : Combien Coute Vraiment un Mois',
            slug: 'bali-budget-2026',
            excerpt: 'Un guide complet des depenses a Bali pour les voyageurs budget',
          };
          const result = routeArticleToReel(testArticle);
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        case 'test-all': {
          // Route all existing articles (paginated)
          const allPosts = [];
          let routePage = 1;
          let routeTotalPages = 1;
          while (routePage <= routeTotalPages) {
            const resp = await fetch(
              `https://flashvoyage.com/wp-json/wp/v2/posts?per_page=100&page=${routePage}&_fields=id,title,slug,excerpt&status=publish`,
              { signal: AbortSignal.timeout(10000) }
            );
            if (!resp.ok) break;
            const batch = await resp.json();
            allPosts.push(...batch);
            if (routePage === 1) {
              routeTotalPages = parseInt(resp.headers.get('x-wp-totalpages') || '1');
            }
            routePage++;
          }
          const posts = allPosts;
          const results = posts.map(p => ({
            title: p.title?.rendered || '',
            ...routeArticleToReel({
              title: p.title?.rendered || '',
              slug: p.slug,
              excerpt: p.excerpt?.rendered?.replace(/<[^>]+>/g, '') || '',
            }),
          }));

          // Summary by format
          const byFormat = {};
          for (const r of results) {
            byFormat[r.primaryFormat] = (byFormat[r.primaryFormat] || 0) + 1;
          }
          console.log('\n=== ROUTING SUMMARY ===');
          console.log(JSON.stringify(byFormat, null, 2));
          console.log(`\nTotal: ${results.length} articles routed`);
          break;
        }
        case 'attribution': {
          const days = parseInt(process.argv[3] || '30', 10);
          const attr = await computeReelAttribution(days);
          console.log(JSON.stringify(attr, null, 2));
          break;
        }
        default:
          console.log(`
Article-to-Reel Router — FlashVoyage

Usage:
  node article-reel-router.js route "Article Title"  Route a single article to reel format
  node article-reel-router.js test-all               Route all WP articles, show format distribution
  node article-reel-router.js attribution [days]      Show reel → article traffic attribution
`);
      }
    } catch (err) {
      logError(err.message);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}

function logError(msg) {
  console.error(`[REEL-ROUTER] ERROR: ${msg}`);
}
