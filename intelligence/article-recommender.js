#!/usr/bin/env node

/**
 * Article Improvement Recommender — FlashVoyage Intelligence
 *
 * Analyzes each article's GA4 + GSC metrics and generates
 * SPECIFIC, ACTIONABLE improvement recommendations with exact instructions,
 * effort estimates, and expected impact.
 *
 * Categories of recommendations:
 *   1. SEO: title/meta rewrites, keyword targeting, FAQ schema, internal links
 *   2. Content: intro rewrite, section additions, data updates, visuals
 *   3. Engagement: readability, TOC, CTA, scroll depth improvements
 *   4. Monetization: widget placement, affiliate link optimization
 *   5. Amplification: reel creation, social distribution, cross-linking
 *
 * Data sources:
 *   - GA4 via ga4-fetcher.js (pageviews, sessions, avg duration, bounce proxy)
 *   - GSC via search-console-fetcher.js (queries, impressions, CTR, position)
 *   - WP REST API (article content, word count, widget presence, publish date)
 *   - Intelligence scorer (article-scores.json, article-reel-map.json)
 *   - Anthropic Claude Haiku for AI-generated improvement plans
 *
 * CLI:
 *   node intelligence/article-recommender.js report              Full report (all articles)
 *   node intelligence/article-recommender.js improve <wpId>      AI improvement plan for one article
 *   node intelligence/article-recommender.js apply <wpId>        Auto-apply improvements (DRY RUN)
 *   node intelligence/article-recommender.js apply <wpId> --apply  Actually apply changes
 *   node intelligence/article-recommender.js top [N]             Top N articles with P0 actions
 *
 * Output: data/article-recommendations.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { fetchTopArticles } from '../social-distributor/analytics/ga4-fetcher.js';
import { fetchTopPages, fetchQueryPagePairs, findLowHangingFruit, detectCannibalization } from '../social-distributor/analytics/search-console-fetcher.js';
import { generateWithClaude, isAnthropicAvailable } from '../anthropic-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const RECOMMENDATIONS_PATH = join(DATA_DIR, 'article-recommendations.json');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');
const REEL_MAP_PATH = join(DATA_DIR, 'article-reel-map.json');

// ── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[RECOMMENDER] ${msg}`);
}

function logError(msg) {
  console.error(`[RECOMMENDER] ERROR: ${msg}`);
}

function logSection(title) {
  console.log(`\n[RECOMMENDER] ${'─'.repeat(50)}`);
  console.log(`[RECOMMENDER] ${title}`);
  console.log(`[RECOMMENDER] ${'─'.repeat(50)}`);
}

// ── URL / Slug Helpers ──────────────────────────────────────────────────────

/**
 * Extract slug from a FlashVoyage URL or path.
 * "https://flashvoyage.com/bali-budget-complet/" -> "bali-budget-complet"
 * "/bali-budget-complet/" -> "bali-budget-complet"
 */
function extractSlug(urlOrPath) {
  return urlOrPath
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/|\/$/g, '')
    .split('/')[0] || '';
}

// ── WordPress API ───────────────────────────────────────────────────────────

const WP_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com';

function getWpAuth() {
  const user = process.env.WORDPRESS_USERNAME;
  const pass = process.env.WORDPRESS_APP_PASSWORD;
  if (!user || !pass) return null;
  return Buffer.from(`${user}:${pass}`).toString('base64');
}

/**
 * Fetch all published WP articles with content (paginated).
 * @returns {Promise<Array<{ id, title, slug, date, modified, content, wordCount, hasWidgets, widgetCount, internalLinks, categories }>>}
 */
async function fetchAllWpArticles() {
  const allArticles = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `${WP_URL}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,title,slug,date,modified,categories,tags,content`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'FlashVoyage-Recommender/1.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        if (response.status === 400) { hasMore = false; break; }
        throw new Error(`WP API returned ${response.status}`);
      }

      const posts = await response.json();
      if (posts.length === 0) { hasMore = false; break; }

      for (const post of posts) {
        const content = post.content?.rendered || '';
        const plainText = content.replace(/<[^>]+>/g, '');

        // Count Travelpayouts widgets
        const widgetMatches = content.match(/data-tp/g);
        const widgetCount = widgetMatches ? widgetMatches.length : 0;

        // Count internal links to flashvoyage.com
        const internalLinkMatches = content.match(/href="https?:\/\/flashvoyage\.com\/[^"]+"/g);
        const internalLinks = internalLinkMatches ? internalLinkMatches.length : 0;

        // Check for TOC
        const hasTOC = content.includes('ez-toc') || content.includes('table-of-contents') || content.includes('sommaire');

        // Check for FAQ schema
        const hasFAQ = content.includes('FAQPage') || content.includes('faq-schema') || content.includes('wp-block-yoast-faq');

        allArticles.push({
          id: post.id,
          title: post.title?.rendered || '',
          slug: post.slug || '',
          date: post.date,
          modified: post.modified,
          categories: post.categories || [],
          tags: post.tags || [],
          content,
          wordCount: plainText.split(/\s+/).filter(w => w.length > 0).length,
          hasAffiliateWidgets: widgetCount > 0,
          widgetCount,
          internalLinks,
          hasTOC,
          hasFAQ,
        });
      }

      page++;
      await new Promise(r => setTimeout(r, 300)); // rate limit
    } catch (err) {
      logError(`WP API fetch error (page ${page}): ${err.message}`);
      hasMore = false;
    }
  }

  log(`Fetched ${allArticles.length} articles from WP`);
  return allArticles;
}

/**
 * Fetch a single WP article by ID with full content.
 * @param {number} articleId
 * @returns {Promise<Object>}
 */
async function fetchWpArticle(articleId) {
  const url = `${WP_URL}/wp-json/wp/v2/posts/${articleId}?_fields=id,title,slug,date,modified,categories,tags,content,excerpt,meta`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'FlashVoyage-Recommender/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`WP API returned ${response.status} for post ${articleId}`);

  const post = await response.json();
  const content = post.content?.rendered || '';
  const plainText = content.replace(/<[^>]+>/g, '');

  const widgetMatches = content.match(/data-tp/g);
  const internalLinkMatches = content.match(/href="https?:\/\/flashvoyage\.com\/[^"]+"/g);

  return {
    id: post.id,
    title: post.title?.rendered || '',
    slug: post.slug || '',
    date: post.date,
    modified: post.modified,
    categories: post.categories || [],
    tags: post.tags || [],
    content,
    excerpt: post.excerpt?.rendered || '',
    meta: post.meta || {},
    wordCount: plainText.split(/\s+/).filter(w => w.length > 0).length,
    hasAffiliateWidgets: (widgetMatches?.length || 0) > 0,
    widgetCount: widgetMatches?.length || 0,
    internalLinks: internalLinkMatches?.length || 0,
    hasTOC: content.includes('ez-toc') || content.includes('table-of-contents') || content.includes('sommaire'),
    hasFAQ: content.includes('FAQPage') || content.includes('faq-schema') || content.includes('wp-block-yoast-faq'),
  };
}

/**
 * Update a WP article via REST API.
 * @param {number} articleId
 * @param {Object} updateData - Fields to update (title, content, meta, etc.)
 * @returns {Promise<Object>}
 */
async function updateWpArticle(articleId, updateData) {
  const auth = getWpAuth();
  if (!auth) throw new Error('WordPress credentials not configured (WORDPRESS_USERNAME + WORDPRESS_APP_PASSWORD)');

  const url = `${WP_URL}/wp-json/wp/v2/posts/${articleId}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'User-Agent': 'FlashVoyage-Recommender/1.0',
    },
    body: JSON.stringify(updateData),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`WP API update failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return response.json();
}

// ── Recommendation Engine ───────────────────────────────────────────────────

/**
 * @typedef {Object} Recommendation
 * @property {string} type - Category: 'seo' | 'content' | 'engagement' | 'monetization' | 'amplification' | 'technical'
 * @property {string} priority - 'P0' (do now) | 'P1' (this week) | 'P2' (backlog)
 * @property {string} metric - The data point that triggered this recommendation
 * @property {string} action - Short action code (e.g. 'PUSH_TO_TOP3', 'REWRITE_INTRO')
 * @property {string} details - Specific, actionable instructions in French
 * @property {string} effort - Estimated effort (e.g. '15min', '1h')
 * @property {string} expectedImpact - Expected outcome with numbers
 */

/**
 * Generate recommendations for a single article.
 *
 * @param {Object} article - WP article data
 * @param {Object} ga4Data - { pageviews, sessions, avgDuration, pageviews7d?, pageviews30d? }
 * @param {Object} gscData - { queries: [{query, clicks, impressions, position, ctr}], pageClicks, pageImpressions, pagePosition, pageCtr }
 * @param {Object} reelData - { linkedReels, totalReelViews }
 * @param {Object} context - { cannibalization: [], lowHangingFruit: [] }
 * @returns {Array<Recommendation>}
 */
function recommendForArticle(article, ga4Data, gscData, reelData, context = {}) {
  const recommendations = [];

  // ── BOUNCE RATE / ENGAGEMENT PROXY ──
  // GA4 Data API does not expose bounce rate directly in all setups.
  // We use avgDuration < 30s with >20 sessions as a proxy for high bounce.
  const avgDuration = ga4Data.avgDuration || 0;
  const sessions = ga4Data.sessions || 0;

  if (avgDuration < 30 && sessions > 20) {
    recommendations.push({
      type: 'content',
      priority: 'P1',
      metric: `Durée moyenne: ${Math.round(avgDuration)}s sur ${sessions} sessions (< 30s = rebond probable)`,
      action: 'REWRITE_INTRO',
      details: `Les visiteurs quittent en moins de 30 secondes. L'intro ne capte pas l'attention. Actions : 1) Réécrire les 200 premiers mots avec un hook percutant — commencer par une question ou un chiffre choc (ex: "Saviez-vous que le Vietnam coute 2x moins cher que la Thailande ?"). 2) Ajouter un sommaire cliquable en haut de page si absent. 3) Placer une image immersive au-dessus du sommaire. 4) Reduire le premier paragraphe a 3 lignes max.`,
      effort: '15min',
      expectedImpact: 'Durée moyenne +60 a +100%, bounce rate -15 a -20 points',
    });
  }

  // ── TIME ON PAGE vs WORD COUNT ──
  const expectedReadTimeSec = (article.wordCount || 1500) / 200 * 60; // 200 wpm reading speed
  const readRatio = expectedReadTimeSec > 0 ? avgDuration / expectedReadTimeSec : 0;

  if (readRatio < 0.25 && ga4Data.pageviews > 20 && article.wordCount > 500) {
    recommendations.push({
      type: 'engagement',
      priority: 'P1',
      metric: `Temps lu: ${Math.round(avgDuration)}s / ${Math.round(expectedReadTimeSec)}s attendus (${Math.round(readRatio * 100)}% du contenu lu)`,
      action: 'IMPROVE_READABILITY',
      details: `Seulement ${Math.round(readRatio * 100)}% du contenu est lu (${article.wordCount} mots). L'article est trop dense ou mal structure. Actions : 1) Ajouter une image contextuelle tous les 300 mots. 2) Decouper chaque paragraphe de +100 mots en 2-3 blocs. 3) Ajouter des sous-titres H2/H3 descriptifs (pas "Partie 2" mais "Meilleur quartier a Bali pour les familles"). 4) Inserer un tableau comparatif si l'article compare des destinations/options. 5) Convertir les listes de texte en bullet points. 6) Ajouter un encart "A retenir" (background colore) toutes les 800 mots.`,
      effort: '30min',
      expectedImpact: 'Temps sur page +40 a +60%, meilleur signal qualite pour Google',
    });
  }

  // ── GSC POSITION ANALYSIS — Position 4-10 (presque top 3) ──
  const queries = gscData.queries || [];

  for (const q of queries) {
    if (q.position >= 4 && q.position <= 10 && q.impressions >= 10) {
      recommendations.push({
        type: 'seo',
        priority: 'P0',
        metric: `"${q.query}" — position ${q.position.toFixed(1)}, ${q.impressions} impressions, ${q.clicks} clics`,
        action: 'PUSH_TO_TOP3',
        details: `Keyword "${q.query}" en position ${Math.round(q.position)}, tres proche du top 3. Le top 3 capte 75% des clics. Actions : 1) Verifier que "${q.query}" est present dans le H1 — si non, l'integrer naturellement. 2) Ajouter une section FAQ (3-5 questions) ciblant "${q.query}" + variations longue traine. 3) Ajouter 300-500 mots de contenu expert sur ce sujet precis. 4) Ajouter 2-3 liens internes depuis les articles FlashVoyage les plus visites. 5) Mettre a jour la meta description en commencant par le keyword.`,
        effort: '45min',
        expectedImpact: `Passage top 3 pour "${q.query}" = +200 a +500% de clics (${Math.round(q.impressions * 0.15)} a ${Math.round(q.impressions * 0.32)} clics/mois potentiels)`,
      });
    }

    // Position 11-20 (page 2)
    if (q.position >= 11 && q.position <= 20 && q.impressions >= 20) {
      recommendations.push({
        type: 'seo',
        priority: 'P1',
        metric: `"${q.query}" — position ${q.position.toFixed(1)}, ${q.impressions} impressions, CTR ${(q.ctr).toFixed(1)}%`,
        action: 'PUSH_TO_PAGE1',
        details: `Keyword "${q.query}" en page 2 de Google avec ${q.impressions} impressions/mois. Actions : 1) Verifier le keyword dans le titre H1 + premier paragraphe. 2) Ajouter une section dediee de 500+ mots avec des donnees factuelles. 3) Ajouter un schema FAQ (3 questions minimum). 4) Creer un reel "Trip Pick" ou "Budget Jour" qui link vers cet article. 5) Verifier si un autre article FlashVoyage cannibalise ce keyword (consolider si oui).`,
        effort: '1h',
        expectedImpact: `Passage page 1 pour "${q.query}" = +300 a +800% de clics (actuellement ${q.clicks} clics/mois)`,
      });
    }

    // High impressions, low CTR — bad title/meta
    if (q.impressions >= 30 && q.ctr < 2.0 && q.position <= 15) {
      recommendations.push({
        type: 'seo',
        priority: 'P0',
        metric: `"${q.query}" — ${q.impressions} impressions, CTR ${q.ctr.toFixed(1)}% (devrait etre >3%), position ${q.position.toFixed(1)}`,
        action: 'REWRITE_TITLE_META',
        details: `Google affiche cet article ${q.impressions} fois/mois pour "${q.query}" mais presque personne ne clique (CTR ${q.ctr.toFixed(1)}%). Le titre et la meta ne donnent pas envie. Actions : 1) Reecrire le title tag avec un chiffre + benefice (ex: "Budget ${q.query.includes('bali') ? 'Bali' : q.query.split(' ')[0]} 2026 : X EUR/jour tout compris"). 2) Reecrire la meta description avec un hook + call to action (150-155 caracteres). 3) Ajouter des rich snippets (FAQ schema, etoiles si avis pertinent). 4) Ajouter le keyword en debut de title si ce n'est pas le cas.`,
        effort: '15min',
        expectedImpact: `CTR x2 a x3 = ${Math.round(q.impressions * 0.03)} a ${Math.round(q.impressions * 0.06)} clics/mois (actuellement ${q.clicks})`,
      });
    }
  }

  // ── CANNIBALIZATION DETECTION ──
  const cannibalization = (context.cannibalization || []).filter(c =>
    c.pages?.some(p => extractSlug(p.url) === article.slug)
  );

  for (const cannibal of cannibalization) {
    const otherPages = cannibal.pages.filter(p => extractSlug(p.url) !== article.slug);
    if (otherPages.length === 0) continue;

    recommendations.push({
      type: 'seo',
      priority: cannibal.severity === 'critical' ? 'P0' : 'P1',
      metric: `Cannibalisation: "${cannibal.query}" — ${cannibal.pages.length} articles en competition, ${cannibal.totalImpressions} impressions totales`,
      action: 'FIX_CANNIBALIZATION',
      details: `Cet article est en competition avec ${otherPages.map(p => `"${extractSlug(p.url)}" (pos ${p.position})`).join(', ')} pour le keyword "${cannibal.query}". Google ne sait pas quel article classer. Actions : 1) Si les articles couvrent le meme sujet : fusionner le meilleur contenu dans un seul article et 301-redirect l'autre. 2) Si sujets differents : differencier les titres H1 et meta descriptions pour cibler des intentions differentes. 3) Ajouter un lien canonical vers l'article principal si overlap eleve. 4) Supprimer le keyword exact du title de l'article secondaire.`,
      effort: '30min',
      expectedImpact: `Consolidation = position amelioree de 3-5 places pour "${cannibal.query}"`,
    });
  }

  // ── TRAFFIC TREND (7d vs 30d) ──
  if (ga4Data.pageviews7d !== undefined && ga4Data.pageviews30d !== undefined && ga4Data.pageviews30d > 0) {
    const weeklyAvg = ga4Data.pageviews30d / 4;
    const trend = weeklyAvg > 0 ? ga4Data.pageviews7d / weeklyAvg : 1;

    if (trend < 0.6 && ga4Data.pageviews30d > 30) {
      recommendations.push({
        type: 'content',
        priority: 'P1',
        metric: `Traffic en baisse: ${ga4Data.pageviews7d} vues/7j vs ${Math.round(weeklyAvg)} moyenne hebdo (-${Math.round((1 - trend) * 100)}%)`,
        action: 'REFRESH_CONTENT',
        details: `L'article perd du traffic (-${Math.round((1 - trend) * 100)}% cette semaine). Causes probables : contenu date, concurrent mieux place, ou saisonnalite. Actions : 1) Mettre a jour TOUTES les donnees chiffrees (prix, visa, horaires, ouvertures). 2) Ajouter une section "Mise a jour mars 2026" en haut de l'article avec les changements recents. 3) Verifier que le badge "Mis a jour le" affiche la date du jour. 4) Creer 1-2 reels pour redonner de la visibilite sociale. 5) Verifier les SERPs : un concurrent a-t-il publie un meilleur article recemment ?`,
        effort: '30min',
        expectedImpact: 'Recuperation du traffic en 2-4 semaines apres indexation',
      });
    }

    if (trend > 2.0 && ga4Data.pageviews7d > 20) {
      recommendations.push({
        type: 'monetization',
        priority: 'P0',
        metric: `Traffic en hausse: ${ga4Data.pageviews7d} vues/7j vs ${Math.round(weeklyAvg)} moyenne hebdo (+${Math.round((trend - 1) * 100)}%)`,
        action: 'CAPITALIZE_SPIKE',
        details: `L'article est en train de percer (+${Math.round((trend - 1) * 100)}% cette semaine) ! Fenetre d'opportunite limitee. Actions immediates : 1) Verifier que les widgets Travelpayouts sont bien places (min 2 widgets). 2) Ajouter un widget flights apres la premiere mention de prix si absent. 3) Creer 2-3 reels immediatement (Trip Pick, Budget Jour). 4) Partager sur les groupes FB voyage. 5) Ajouter un CTA newsletter en fin d'article pour capturer l'audience.`,
        effort: '20min',
        expectedImpact: 'Maximiser la fenetre de traffic = +30 a +50% de revenus affiliation sur cet article',
      });
    }
  }

  // ── MONETIZATION (traffic but no/few widgets) ──
  if (ga4Data.pageviews > 50 && article.widgetCount < 2) {
    recommendations.push({
      type: 'monetization',
      priority: 'P1',
      metric: `${ga4Data.pageviews} vues/mois mais seulement ${article.widgetCount} widget(s) Travelpayouts`,
      action: 'ADD_WIDGETS',
      details: `Article avec du traffic mais sous-monetise (${article.widgetCount} widgets pour ${ga4Data.pageviews} vues). Ajouter : 1) Widget flights (data-tp-widget-id="7879") apres la premiere mention de prix ou de vol. 2) Widget eSIM (id="8588") si destination internationale (apres mention de "Internet" ou "SIM"). 3) Widget tours (id="3947") apres description d'une activite ou "que faire a". 4) Widget assurance voyage apres mention de sante/securite. IMPORTANT : utiliser le format data-tp JSON, pas data-widget-type.`,
      effort: '15min',
      expectedImpact: `RPM article +100 a +300% (de ~0 EUR a ~${Math.round(ga4Data.pageviews * 0.02)} EUR/mois potentiel)`,
    });
  }

  // ── REEL COVERAGE ──
  const linkedReels = reelData?.linkedReels || 0;
  if (ga4Data.pageviews > 30 && linkedReels === 0) {
    recommendations.push({
      type: 'amplification',
      priority: 'P2',
      metric: `${ga4Data.pageviews} vues/mois, 0 reels lies a cet article`,
      action: 'CREATE_REELS',
      details: `Article populaire sans couverture reel. Creer 2-3 reels automatises : 1) Trip Pick "X spots incontournables a [destination]" — format liste visuelle. 2) Budget Jour si l'article contient des donnees budget. 3) Versus si l'article compare 2 destinations. Les reels drivent du traffic IG → article via Story links + lien bio. Utiliser le module reels/generator.js.`,
      effort: '5min (auto-genere via pipeline reels)',
      expectedImpact: `+20 a +50 visites/mois via IG Stories (actuellement 0 referral social)`,
    });
  }

  // ── INTERNAL LINKING ──
  if (article.internalLinks < 3) {
    recommendations.push({
      type: 'seo',
      priority: 'P2',
      metric: `Seulement ${article.internalLinks} lien(s) interne(s) (minimum recommande: 5)`,
      action: 'ADD_INTERNAL_LINKS',
      details: `Le maillage interne est insuffisant. Google utilise les liens internes pour comprendre la structure du site et distribuer le PageRank. Actions : 1) Ajouter 3-5 liens vers des articles FlashVoyage connexes (meme destination ou theme). 2) Prioriser les liens vers les articles du top 20% du scoring. 3) Utiliser des ancres descriptives (pas "cliquez ici" mais "decouvrez notre guide complet de Bali"). 4) Ajouter un bloc "Articles lies" en fin d'article si absent. 5) Verifier que les articles les plus populaires linkent vers celui-ci.`,
      effort: '10min',
      expectedImpact: 'Amelioration du crawl Google + distribution de PageRank = meilleur positionnement',
    });
  }

  // ── MISSING TOC ──
  if (!article.hasTOC && article.wordCount > 1200) {
    recommendations.push({
      type: 'engagement',
      priority: 'P2',
      metric: `Article de ${article.wordCount} mots sans sommaire`,
      action: 'ADD_TOC',
      details: `Un article de ${article.wordCount} mots doit avoir un sommaire cliquable. Le sommaire aide les lecteurs a naviguer et genere des "jump links" dans les SERPs Google. Ajouter un sommaire automatique via le plugin EZ-TOC ou un bloc HTML personnalise en haut de l'article, juste apres l'introduction.`,
      effort: '5min',
      expectedImpact: 'Temps sur page +15 a +25%, taux de scroll +30%, sitelinks potentiels dans les SERPs',
    });
  }

  // ── MISSING FAQ SCHEMA ──
  if (!article.hasFAQ && queries.length > 0) {
    const topQuery = queries.sort((a, b) => b.impressions - a.impressions)[0];
    recommendations.push({
      type: 'seo',
      priority: 'P2',
      metric: `Pas de schema FAQ (keyword principal: "${topQuery?.query || 'N/A'}")`,
      action: 'ADD_FAQ_SCHEMA',
      details: `L'article n'a pas de schema FAQ. Les FAQs enrichissent l'affichage dans les SERPs (accordeon sous le resultat) et augmentent le CTR. Ajouter 3-5 questions/reponses pertinentes ciblant "${topQuery?.query || 'le keyword principal'}" et ses variations. Utiliser le format Schema.org FAQPage en JSON-LD dans un bloc WPCode.`,
      effort: '20min',
      expectedImpact: 'CTR +20 a +30% grace aux rich results FAQ, plus de surface dans les SERPs',
    });
  }

  // ── CONTENT FRESHNESS ──
  const articleAgeMonths = Math.floor((Date.now() - new Date(article.modified || article.date).getTime()) / (30 * 24 * 60 * 60 * 1000));
  if (articleAgeMonths >= 6 && ga4Data.pageviews > 10) {
    recommendations.push({
      type: 'content',
      priority: articleAgeMonths >= 12 ? 'P1' : 'P2',
      metric: `Derniere modification il y a ${articleAgeMonths} mois (${new Date(article.modified || article.date).toISOString().slice(0, 10)})`,
      action: 'UPDATE_FRESHNESS',
      details: `Article non mis a jour depuis ${articleAgeMonths} mois. Google penalise le contenu perime dans les SERPs voyage. Actions : 1) Verifier et mettre a jour tous les prix mentionnes. 2) Mettre a jour les informations visa/entree. 3) Ajouter les nouvelles ouvertures/fermetures (hotels, vols, attractions). 4) Mettre a jour le champ dateModified dans le schema. 5) Ajouter un badge "Mis a jour en mars 2026" visible en haut de l'article.`,
      effort: '20min',
      expectedImpact: `Google favorise le contenu frais — recuperation potentielle de 1-5 positions dans les SERPs`,
    });
  }

  // ── THIN CONTENT ──
  if (article.wordCount < 800 && ga4Data.pageviews > 5) {
    recommendations.push({
      type: 'content',
      priority: 'P1',
      metric: `Seulement ${article.wordCount} mots (minimum recommande: 1500 pour le SEO voyage)`,
      action: 'EXPAND_CONTENT',
      details: `L'article est trop court pour bien ranker sur des keywords concurrentiels. Les articles voyage en top 3 font en moyenne 2000-3000 mots. Actions : 1) Ajouter une section "Budget detaille" avec tableau. 2) Ajouter "Comment s'y rendre" avec options vol/bus/train. 3) Ajouter "Ou dormir" avec recommandations par budget. 4) Ajouter "Conseils pratiques" (visa, monnaie, securite). 5) Objectif: atteindre 1500+ mots.`,
      effort: '45min',
      expectedImpact: `Mots supplementaires = meilleur ranking (correlation forte entre word count et position pour les queries informationnelles)`,
    });
  }

  // ── Deduplicate: keep highest priority per action type ──
  const seen = new Map();
  const deduped = [];
  for (const rec of recommendations) {
    const key = `${rec.type}:${rec.action}`;
    if (!seen.has(key)) {
      seen.set(key, rec);
      deduped.push(rec);
    } else {
      // Keep the one with higher priority
      const existing = seen.get(key);
      const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      if ((priorityOrder[rec.priority] || 9) < (priorityOrder[existing.priority] || 9)) {
        const idx = deduped.indexOf(existing);
        deduped[idx] = rec;
        seen.set(key, rec);
      }
    }
  }

  // Sort by priority
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
  deduped.sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));

  return deduped;
}

// ── Full Report Generator ───────────────────────────────────────────────────

/**
 * Generate recommendations for ALL articles and write a report.
 *
 * @param {Object} options
 * @param {number} options.ga4Days - GA4 lookback (default 30)
 * @param {number} options.gscDays - GSC lookback (default 28)
 * @returns {Promise<{ articles: Array, summary: Object }>}
 */
async function generateFullReport(options = {}) {
  const { ga4Days = 30, gscDays = 28 } = options;
  const startTime = Date.now();

  logSection('Phase 1 — Fetching data from all sources');

  // Parallel data fetch
  const [wpArticles, ga4Articles, gscPages, gscQueryPairs, lowHangingFruit, cannibalization, reelMap] = await Promise.all([
    fetchAllWpArticles().catch(err => { logError(`WP fetch failed: ${err.message}`); return []; }),
    fetchTopArticles(ga4Days, 500).catch(err => { logError(`GA4 fetch failed: ${err.message}`); return []; }),
    fetchTopPages(gscDays, 500).catch(err => { logError(`GSC pages failed: ${err.message}`); return []; }),
    fetchQueryPagePairs(gscDays, 10000).catch(err => { logError(`GSC query-page failed: ${err.message}`); return []; }),
    findLowHangingFruit(gscDays, { minImpressions: 10 }).catch(err => { logError(`Low-hanging fruit failed: ${err.message}`); return []; }),
    detectCannibalization(gscDays, { minImpressions: 10 }).catch(err => { logError(`Cannibalization failed: ${err.message}`); return []; }),
    loadJsonFile(REEL_MAP_PATH).catch(() => ({})),
  ]);

  log(`Data fetched: WP=${wpArticles.length}, GA4=${ga4Articles.length}, GSC pages=${gscPages.length}, GSC pairs=${gscQueryPairs.length}`);
  log(`Intelligence: ${lowHangingFruit.length} low-hanging fruit, ${cannibalization.length} cannibalized queries`);

  // ── Build lookup maps ──
  logSection('Phase 2 — Building data maps');

  // GA4 by slug
  const ga4BySlug = {};
  for (const a of ga4Articles) {
    const slug = extractSlug(a.pagePath);
    if (!slug) continue;
    ga4BySlug[slug] = {
      pageviews: a.pageviews,
      sessions: a.sessions,
      avgDuration: a.avgSessionDuration,
      // 7d vs 30d not available from single fetch — we mark as undefined
      pageviews7d: undefined,
      pageviews30d: a.pageviews,
    };
  }

  // GSC page-level by slug
  const gscBySlug = {};
  for (const p of gscPages) {
    const slug = extractSlug(p.page);
    if (!slug) continue;
    gscBySlug[slug] = {
      pageClicks: p.clicks,
      pageImpressions: p.impressions,
      pagePosition: p.position,
      pageCtr: p.ctr,
      queries: [],
    };
  }

  // GSC query-page pairs → attach queries to articles
  for (const pair of gscQueryPairs) {
    const slug = extractSlug(pair.page);
    if (!slug) continue;
    if (!gscBySlug[slug]) {
      gscBySlug[slug] = { pageClicks: 0, pageImpressions: 0, pagePosition: 0, pageCtr: 0, queries: [] };
    }
    gscBySlug[slug].queries.push({
      query: pair.query,
      clicks: pair.clicks,
      impressions: pair.impressions,
      position: pair.position,
      ctr: pair.ctr,
    });
  }

  // Sort queries by impressions descending for each slug
  for (const slug of Object.keys(gscBySlug)) {
    gscBySlug[slug].queries.sort((a, b) => b.impressions - a.impressions);
    // Keep top 20 queries per article to avoid noise
    gscBySlug[slug].queries = gscBySlug[slug].queries.slice(0, 20);
  }

  // Reel data by slug
  const reelBySlug = {};
  if (reelMap && typeof reelMap === 'object') {
    for (const [slug, data] of Object.entries(reelMap)) {
      reelBySlug[slug] = {
        linkedReels: data.reels?.length || 0,
        totalReelViews: data.totalViews || 0,
      };
    }
  }

  // Context for cannibalization
  const contextData = { cannibalization, lowHangingFruit };

  // ── Generate recommendations for each article ──
  logSection('Phase 3 — Generating recommendations');

  const results = [];
  let totalP0 = 0;
  let totalP1 = 0;
  let totalP2 = 0;
  let articlesWithRecs = 0;

  for (const article of wpArticles) {
    const ga4Data = ga4BySlug[article.slug] || { pageviews: 0, sessions: 0, avgDuration: 0 };
    const gscData = gscBySlug[article.slug] || { queries: [], pageClicks: 0, pageImpressions: 0 };
    const reelData = reelBySlug[article.slug] || { linkedReels: 0, totalReelViews: 0 };

    const recs = recommendForArticle(article, ga4Data, gscData, reelData, contextData);

    if (recs.length > 0) articlesWithRecs++;
    for (const r of recs) {
      if (r.priority === 'P0') totalP0++;
      else if (r.priority === 'P1') totalP1++;
      else totalP2++;
    }

    results.push({
      wpId: article.id,
      slug: article.slug,
      title: article.title,
      url: `https://flashvoyage.com/${article.slug}/`,
      wordCount: article.wordCount,
      widgetCount: article.widgetCount,
      internalLinks: article.internalLinks,
      lastModified: article.modified || article.date,
      ga4: {
        pageviews: ga4Data.pageviews,
        sessions: ga4Data.sessions,
        avgDuration: Math.round(ga4Data.avgDuration || 0),
      },
      gsc: {
        impressions: gscData.pageImpressions || 0,
        clicks: gscData.pageClicks || 0,
        position: gscData.pagePosition || 0,
        topQueries: (gscData.queries || []).slice(0, 5).map(q => ({
          query: q.query,
          position: q.position,
          impressions: q.impressions,
          ctr: q.ctr,
        })),
      },
      reels: {
        linkedReels: reelData.linkedReels,
        totalViews: reelData.totalReelViews,
      },
      recommendations: recs,
      recommendationCount: recs.length,
      p0Count: recs.filter(r => r.priority === 'P0').length,
    });
  }

  // Sort by P0 count desc, then by pageviews desc
  results.sort((a, b) => {
    if (b.p0Count !== a.p0Count) return b.p0Count - a.p0Count;
    return (b.ga4.pageviews || 0) - (a.ga4.pageviews || 0);
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
    totalArticles: wpArticles.length,
    articlesWithRecommendations: articlesWithRecs,
    totalRecommendations: totalP0 + totalP1 + totalP2,
    byPriority: { P0: totalP0, P1: totalP1, P2: totalP2 },
    byType: countByType(results),
    topActions: topActionsSummary(results),
  };

  // ── Write output ──
  logSection('Phase 4 — Writing report');

  await mkdir(DATA_DIR, { recursive: true });

  const output = { summary, articles: results };
  await writeFile(RECOMMENDATIONS_PATH, JSON.stringify(output, null, 2), 'utf-8');
  log(`Report written to ${RECOMMENDATIONS_PATH}`);

  // Print summary
  logSection('REPORT SUMMARY');
  log(`Total articles: ${summary.totalArticles}`);
  log(`Articles with recommendations: ${summary.articlesWithRecommendations}`);
  log(`Total recommendations: ${summary.totalRecommendations}`);
  log(`  P0 (do NOW): ${summary.byPriority.P0}`);
  log(`  P1 (this week): ${summary.byPriority.P1}`);
  log(`  P2 (backlog): ${summary.byPriority.P2}`);
  log(`Elapsed: ${summary.elapsedSeconds}s`);

  if (summary.byType) {
    log('');
    log('By type:');
    for (const [type, count] of Object.entries(summary.byType)) {
      log(`  ${type}: ${count}`);
    }
  }

  return output;
}

// ── Summary Helpers ─────────────────────────────────────────────────────────

function countByType(results) {
  const counts = {};
  for (const a of results) {
    for (const r of a.recommendations) {
      counts[r.type] = (counts[r.type] || 0) + 1;
    }
  }
  return counts;
}

function topActionsSummary(results) {
  const actionCounts = {};
  for (const a of results) {
    for (const r of a.recommendations) {
      actionCounts[r.action] = (actionCounts[r.action] || 0) + 1;
    }
  }
  return Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([action, count]) => ({ action, count }));
}

async function loadJsonFile(path) {
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw);
}

// ── AI Improvement Plan Generator ───────────────────────────────────────────

/**
 * Generate a Haiku-powered improvement plan for a SPECIFIC article.
 * Takes the article's recommendations + content and generates exact rewrites.
 *
 * @param {number} articleId - WordPress article ID
 * @returns {Promise<Object>} Improvement plan with suggested rewrites
 */
async function generateImprovementPlan(articleId) {
  logSection(`Generating AI improvement plan for article #${articleId}`);

  if (!isAnthropicAvailable()) {
    throw new Error('Anthropic API not available — set ANTHROPIC_API_KEY env var');
  }

  // 1. Fetch article from WP
  const article = await fetchWpArticle(articleId);
  log(`Article: "${article.title}" (${article.slug}, ${article.wordCount} mots)`);

  // 2. Load existing recommendations (or generate on the fly)
  let recommendations = [];
  try {
    const existing = await loadJsonFile(RECOMMENDATIONS_PATH);
    if (existing?.articles) {
      const found = existing.articles.find(a => a.wpId === articleId);
      if (found) {
        recommendations = found.recommendations;
        log(`Loaded ${recommendations.length} existing recommendations`);
      }
    }
  } catch { /* ignore */ }

  // If no cached recommendations, generate fresh ones
  if (recommendations.length === 0) {
    log('No cached recommendations — generating fresh ones...');
    // Minimal GA4/GSC fetch for this article
    const [ga4All, gscPairs] = await Promise.all([
      fetchTopArticles(30, 500).catch(() => []),
      fetchQueryPagePairs(28, 5000).catch(() => []),
    ]);

    const ga4Match = ga4All.find(a => extractSlug(a.pagePath) === article.slug);
    const ga4Data = ga4Match ? {
      pageviews: ga4Match.pageviews,
      sessions: ga4Match.sessions,
      avgDuration: ga4Match.avgSessionDuration,
    } : { pageviews: 0, sessions: 0, avgDuration: 0 };

    const queries = gscPairs
      .filter(p => extractSlug(p.page) === article.slug)
      .map(p => ({ query: p.query, clicks: p.clicks, impressions: p.impressions, position: p.position, ctr: p.ctr }));

    recommendations = recommendForArticle(article, ga4Data, { queries }, { linkedReels: 0 });
    log(`Generated ${recommendations.length} fresh recommendations`);
  }

  // 3. Prepare content for Haiku
  const plainText = article.content.replace(/<[^>]+>/g, '').slice(0, 4000); // First 4000 chars
  const currentTitle = article.title;
  const currentExcerpt = article.excerpt?.replace(/<[^>]+>/g, '') || '';
  const topQueries = recommendations
    .filter(r => r.type === 'seo')
    .map(r => r.metric)
    .slice(0, 5);

  const systemPrompt = `Tu es un expert SEO senior specialise dans le contenu voyage francophone. Tu travailles pour FlashVoyage.com, un media voyage editoriel.

Regles :
- Ecris en francais (accents obligatoires)
- Sois SPECIFIQUE et ACTIONNABLE — pas de conseils generiques
- Utilise des chiffres quand possible
- Le ton est informatif, expert, engageant (pas marketing agressif)
- Les titres doivent être spécifiques (lieu nommé, chiffre réel, durée, saison) et faire 55 à 65 caractères.
- Mots INTERDITS dans tout titre proposé : "arbitrage", "dilemme", "crucial", "secrets", "pièges cachés", "coûts cachés", "optimiser chaque". Ces mots déclenchent le classifieur de contenu IA de Google.
- Structures INTERDITES : "[N] pièges/secrets/arbitrages que [...]", "Le dilemme de [...]", "[X] vs [Y] : le choix crucial".
- Privilégie : question directe, récit à la 1re personne, comparatif réel chiffré, observation étroite.
- Exemples : "Thaïlande 3 semaines à deux : 1 680 € détaillés", "eSIM au Japon : Airalo ou Ubigi", "Kyoto en juin : il pleut, et c'est très bien".
- Les meta descriptions font 150-155 caracteres exactement
- Les FAQs doivent cibler les People Also Ask de Google`;

  const userPrompt = `Article FlashVoyage a ameliorer :

TITRE ACTUEL: ${currentTitle}
SLUG: ${article.slug}
URL: https://flashvoyage.com/${article.slug}/
NOMBRE DE MOTS: ${article.wordCount}
EXTRAIT ACTUEL: ${currentExcerpt.slice(0, 300)}

DEBUT DU CONTENU:
${plainText.slice(0, 2500)}

METRIQUES SEO CLES:
${topQueries.length > 0 ? topQueries.join('\n') : 'Pas de donnees GSC disponibles'}

RECOMMANDATIONS DU SYSTEME:
${recommendations.map(r => `[${r.priority}] ${r.action}: ${r.details.slice(0, 200)}`).join('\n\n')}

---

Genere un plan d'amelioration au format JSON avec exactement cette structure :
{
  "suggestedTitle": "nouveau titre SEO — 55 à 65 caractères, lieu nommé + chiffre ou détail concret, aucun mot banni (liste ci-dessus)",
  "suggestedMeta": "nouvelle meta description (150-155 caracteres, hook + CTA)",
  "suggestedIntro": "nouveau paragraphe d'introduction (200 mots max, hook percutant, question ou chiffre choc en premiere phrase)",
  "faqQuestions": [
    { "question": "Question 1 (People Also Ask style)", "answer": "Reponse factuelle en 2-3 phrases (80-120 mots)" },
    { "question": "Question 2", "answer": "Reponse" },
    { "question": "Question 3", "answer": "Reponse" }
  ],
  "internalLinksToAdd": [
    { "anchorText": "texte d'ancre descriptif", "targetSlug": "slug-article-cible", "reason": "pourquoi ce lien" }
  ],
  "contentSectionsToAdd": [
    { "heading": "Titre H2 suggere", "summary": "Description en 1-2 phrases du contenu a ajouter", "estimatedWords": 300 }
  ],
  "quickWins": ["Action rapide 1 (5min)", "Action rapide 2", "Action rapide 3"]
}

Reponds UNIQUEMENT avec le JSON valide, sans texte avant ou apres.`;

  log('Calling Claude Haiku for improvement plan...');

  const raw = await generateWithClaude(systemPrompt, userPrompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 4096,
    temperature: 0.4,
    trackingStep: 'article-recommender-improve',
  });

  // Parse AI response
  let plan;
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    plan = JSON.parse(jsonStr);
  } catch (err) {
    logError(`Failed to parse AI response as JSON: ${err.message}`);
    logError(`Raw response (first 500 chars): ${raw.slice(0, 500)}`);
    throw new Error('AI returned invalid JSON — retry or check the prompt');
  }

  // Enrich plan with metadata
  const result = {
    articleId,
    slug: article.slug,
    url: `https://flashvoyage.com/${article.slug}/`,
    generatedAt: new Date().toISOString(),
    original: {
      title: currentTitle,
      meta: currentExcerpt.slice(0, 160),
      wordCount: article.wordCount,
    },
    plan,
    recommendations,
  };

  // Write to data dir
  const planPath = join(DATA_DIR, `improvement-plan-${articleId}.json`);
  await writeFile(planPath, JSON.stringify(result, null, 2), 'utf-8');
  log(`Improvement plan written to ${planPath}`);

  return result;
}

// ── Auto-Apply Improvements ─────────────────────────────────────────────────

/**
 * AUTO-APPLY improvements for an article.
 * Takes the improvement plan and updates the WP article directly.
 *
 * DRY RUN by default for safety — pass dryRun=false to actually apply.
 *
 * @param {number} articleId - WordPress article ID
 * @param {Object} plan - From generateImprovementPlan() (or loaded from file)
 * @param {boolean} dryRun - If true (default), show changes without applying
 */
async function applyImprovements(articleId, plan, dryRun = true) {
  logSection(`${dryRun ? 'DRY RUN' : 'APPLYING'} improvements for article #${articleId}`);

  if (!plan?.plan) {
    // Try to load from file
    const planPath = join(DATA_DIR, `improvement-plan-${articleId}.json`);
    if (existsSync(planPath)) {
      plan = JSON.parse(await readFile(planPath, 'utf-8'));
      log(`Loaded plan from ${planPath}`);
    } else {
      throw new Error(`No improvement plan found for article ${articleId}. Run: node intelligence/article-recommender.js improve ${articleId}`);
    }
  }

  const p = plan.plan;
  const changes = [];

  // 1. Title update (Rank Math SEO title)
  if (p.suggestedTitle && p.suggestedTitle !== plan.original?.title) {
    changes.push({
      field: 'SEO Title (Rank Math)',
      original: plan.original?.title || '(unknown)',
      suggested: p.suggestedTitle,
    });
  }

  // 2. Meta description update
  if (p.suggestedMeta) {
    changes.push({
      field: 'Meta Description (Rank Math)',
      original: plan.original?.meta || '(unknown)',
      suggested: p.suggestedMeta,
    });
  }

  // 3. Content changes
  if (p.suggestedIntro) {
    changes.push({
      field: 'Introduction (first 200 words)',
      original: '(current intro)',
      suggested: p.suggestedIntro.slice(0, 300) + (p.suggestedIntro.length > 300 ? '...' : ''),
    });
  }

  if (p.faqQuestions?.length > 0) {
    changes.push({
      field: 'FAQ Section (append to content)',
      original: '(none)',
      suggested: `${p.faqQuestions.length} questions: ${p.faqQuestions.map(f => f.question).join(' | ')}`,
    });
  }

  if (p.contentSectionsToAdd?.length > 0) {
    for (const section of p.contentSectionsToAdd) {
      changes.push({
        field: `New section: "${section.heading}"`,
        original: '(none)',
        suggested: `${section.summary} (~${section.estimatedWords} mots)`,
      });
    }
  }

  // Print changes
  log('');
  log('PROPOSED CHANGES:');
  log('');
  for (const change of changes) {
    log(`  ${change.field}:`);
    log(`    Before: ${change.original}`);
    log(`    After:  ${change.suggested}`);
    log('');
  }

  if (p.quickWins?.length > 0) {
    log('QUICK WINS (manual):');
    for (const qw of p.quickWins) {
      log(`  - ${qw}`);
    }
    log('');
  }

  if (p.internalLinksToAdd?.length > 0) {
    log('INTERNAL LINKS TO ADD (manual):');
    for (const link of p.internalLinksToAdd) {
      log(`  - "${link.anchorText}" -> /${link.targetSlug}/ (${link.reason})`);
    }
    log('');
  }

  if (dryRun) {
    log('=== DRY RUN — no changes applied ===');
    log(`To apply: node intelligence/article-recommender.js apply ${articleId} --apply`);
    return { dryRun: true, changes, applied: false };
  }

  // ── Actually apply changes to WordPress ──
  log('Applying changes to WordPress...');

  const updateData = {};

  // Update Rank Math meta via custom fields
  if (p.suggestedTitle || p.suggestedMeta) {
    updateData.meta = {};
    if (p.suggestedTitle) {
      updateData.meta.rank_math_title = p.suggestedTitle;
      updateData.meta._yoast_wpseo_title = p.suggestedTitle;
    }
    if (p.suggestedMeta) {
      updateData.meta.rank_math_description = p.suggestedMeta;
      updateData.meta._yoast_wpseo_metadesc = p.suggestedMeta;
    }
  }

  // Build content modifications
  let contentModified = false;
  let fetchedArticle;

  if (p.suggestedIntro || (p.faqQuestions?.length > 0)) {
    // Fetch current content
    fetchedArticle = await fetchWpArticle(articleId);
    let content = fetchedArticle.content;

    // Append FAQ section at the end
    if (p.faqQuestions?.length > 0) {
      const faqHtml = buildFaqHtml(p.faqQuestions);
      const faqSchema = buildFaqSchema(p.faqQuestions);
      content += '\n\n' + faqHtml + '\n' + faqSchema;
      contentModified = true;
      log(`  Added FAQ section with ${p.faqQuestions.length} questions`);
    }

    if (contentModified) {
      updateData.content = content;
    }
  }

  // Update dateModified
  updateData.date = new Date().toISOString();

  if (Object.keys(updateData).length === 0) {
    log('No applicable changes to push to WordPress.');
    return { dryRun: false, changes, applied: false };
  }

  try {
    await updateWpArticle(articleId, updateData);
    log(`Article #${articleId} updated successfully on WordPress!`);
    return { dryRun: false, changes, applied: true };
  } catch (err) {
    logError(`Failed to update article: ${err.message}`);
    throw err;
  }
}

/**
 * Build FAQ HTML block from questions array.
 */
function buildFaqHtml(faqQuestions) {
  let html = `\n<!-- FAQ Section added by FlashVoyage Recommender -->\n`;
  html += `<div class="fv-faq-section">\n`;
  html += `<h2>Questions frequentes</h2>\n`;
  for (const faq of faqQuestions) {
    html += `<div class="fv-faq-item">\n`;
    html += `  <h3>${escapeHtml(faq.question)}</h3>\n`;
    html += `  <p>${escapeHtml(faq.answer)}</p>\n`;
    html += `</div>\n`;
  }
  html += `</div>\n`;
  return html;
}

/**
 * Build FAQ Schema.org JSON-LD.
 */
function buildFaqSchema(faqQuestions) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqQuestions.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));

if (isMain) {
  const command = process.argv[2] || 'help';

  (async () => {
    try {
      switch (command) {
        case 'report': {
          const output = await generateFullReport();
          // Print top articles with P0 actions
          const withP0 = output.articles.filter(a => a.p0Count > 0);
          if (withP0.length > 0) {
            logSection(`TOP ${Math.min(withP0.length, 15)} ARTICLES WITH P0 ACTIONS`);
            for (const a of withP0.slice(0, 15)) {
              log(`#${a.wpId} "${a.title.slice(0, 50)}..." — ${a.p0Count} P0, ${a.recommendationCount} total`);
              log(`   PV=${a.ga4.pageviews} | Impr=${a.gsc.impressions} | Pos=${a.gsc.position || 'N/A'} | Widgets=${a.widgetCount}`);
              for (const r of a.recommendations.filter(r => r.priority === 'P0')) {
                log(`   [P0] ${r.action}: ${r.metric}`);
              }
              log('');
            }
          }
          break;
        }

        case 'improve': {
          const articleId = parseInt(process.argv[3], 10);
          if (!articleId || isNaN(articleId)) {
            logError('Usage: node intelligence/article-recommender.js improve <articleId>');
            logError('Example: node intelligence/article-recommender.js improve 4254');
            process.exit(1);
          }
          const result = await generateImprovementPlan(articleId);
          logSection('AI IMPROVEMENT PLAN');
          log(`Article: "${result.original.title}"`);
          log(`URL: ${result.url}`);
          log('');
          if (result.plan.suggestedTitle) {
            log(`Suggested Title: ${result.plan.suggestedTitle}`);
          }
          if (result.plan.suggestedMeta) {
            log(`Suggested Meta: ${result.plan.suggestedMeta}`);
          }
          if (result.plan.suggestedIntro) {
            log(`Suggested Intro (first 200 chars): ${result.plan.suggestedIntro.slice(0, 200)}...`);
          }
          if (result.plan.faqQuestions?.length > 0) {
            log(`FAQ Questions: ${result.plan.faqQuestions.length}`);
            for (const faq of result.plan.faqQuestions) {
              log(`  Q: ${faq.question}`);
            }
          }
          if (result.plan.quickWins?.length > 0) {
            log('Quick Wins:');
            for (const qw of result.plan.quickWins) {
              log(`  - ${qw}`);
            }
          }
          log('');
          log(`Full plan saved to: data/improvement-plan-${articleId}.json`);
          log(`To apply: node intelligence/article-recommender.js apply ${articleId} --apply`);
          break;
        }

        case 'apply': {
          const articleId = parseInt(process.argv[3], 10);
          if (!articleId || isNaN(articleId)) {
            logError('Usage: node intelligence/article-recommender.js apply <articleId> [--apply]');
            process.exit(1);
          }
          const dryRun = !process.argv.includes('--apply');
          const result = await applyImprovements(articleId, null, dryRun);
          if (result.applied) {
            log('Changes applied successfully to WordPress!');
          }
          break;
        }

        case 'top': {
          const n = parseInt(process.argv[3] || '10', 10);
          const existing = await loadJsonFile(RECOMMENDATIONS_PATH);
          if (!existing?.articles) {
            logError('No recommendations found. Run: node intelligence/article-recommender.js report');
            process.exit(1);
          }
          const topN = existing.articles.filter(a => a.p0Count > 0).slice(0, n);
          logSection(`TOP ${topN.length} ARTICLES WITH P0 ACTIONS`);
          for (const a of topN) {
            log(`#${a.wpId} "${a.title.slice(0, 60)}" — ${a.p0Count} P0, ${a.recommendationCount} total`);
            log(`   ${a.url}`);
            log(`   PV=${a.ga4.pageviews} | Impr=${a.gsc.impressions} | Widgets=${a.widgetCount} | Words=${a.wordCount}`);
            for (const r of a.recommendations.filter(r => r.priority === 'P0')) {
              log(`   [P0] ${r.action}: ${r.metric.slice(0, 100)}`);
              log(`         ${r.details.slice(0, 120)}...`);
              log(`         Effort: ${r.effort} | Impact: ${r.expectedImpact.slice(0, 80)}`);
            }
            log('');
          }
          log(`\nGenerated at: ${existing.summary.generatedAt}`);
          log(`Total P0: ${existing.summary.byPriority.P0} | P1: ${existing.summary.byPriority.P1} | P2: ${existing.summary.byPriority.P2}`);
          break;
        }

        default:
          console.log(`
Article Improvement Recommender — FlashVoyage Intelligence

Usage:
  node intelligence/article-recommender.js report              Full report for all articles
  node intelligence/article-recommender.js improve <wpId>      AI-powered improvement plan for one article
  node intelligence/article-recommender.js apply <wpId>        Show proposed changes (DRY RUN)
  node intelligence/article-recommender.js apply <wpId> --apply  Actually apply changes to WordPress
  node intelligence/article-recommender.js top [N]             Top N articles with P0 actions (from cached report)

Output:
  data/article-recommendations.json         Full report
  data/improvement-plan-<wpId>.json         Per-article AI plan

Examples:
  node intelligence/article-recommender.js report
  node intelligence/article-recommender.js improve 4254
  node intelligence/article-recommender.js apply 4254
  node intelligence/article-recommender.js apply 4254 --apply
  node intelligence/article-recommender.js top 5
`);
      }
    } catch (err) {
      logError(err.message);
      if (process.env.DEBUG) console.error(err.stack);
      process.exit(1);
    }
  })();
}

// ── Exports ─────────────────────────────────────────────────────────────────

export {
  recommendForArticle,
  generateFullReport,
  generateImprovementPlan,
  applyImprovements,
  fetchWpArticle,
  fetchAllWpArticles,
};
