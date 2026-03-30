#!/usr/bin/env node

/**
 * Auto-Executor — FlashVoyage Intelligence
 *
 * Reads article-recommendations.json and automatically executes the 4 safe
 * action types via the WordPress REST API:
 *
 *   1. ADD_WIDGETS      — Inject Travelpayouts widgets at contextual positions
 *   2. ADD_INTERNAL_LINKS — Link to top-performing articles (same dest / category)
 *   3. ADD_TOC           — Add [ez-toc] shortcode if missing
 *   4. ADD_FAQ_SCHEMA    — Generate FAQ via Haiku + inject JSON-LD
 *
 * Safety:
 *   - DRY RUN by default (--apply flag to push changes)
 *   - Max 10 actions per run (configurable via --max)
 *   - Every change is logged with before/after content diff
 *   - NEVER deletes content — only appends or injects
 *
 * CLI:
 *   node intelligence/auto-executor.js                  Dry-run, up to 10 actions
 *   node intelligence/auto-executor.js --apply          Actually push changes to WP
 *   node intelligence/auto-executor.js --max 5          Limit to 5 actions
 *   node intelligence/auto-executor.js --apply --max 20 Push up to 20 actions
 *   node intelligence/auto-executor.js --action ADD_TOC Only execute ADD_TOC actions
 *
 * Output: data/auto-executor-log.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const RECOMMENDATIONS_PATH = join(DATA_DIR, 'article-recommendations.json');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');
const EXECUTOR_LOG_PATH = join(DATA_DIR, 'auto-executor-log.json');

// ── WordPress API ───────────────────────────────────────────────────────────

const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const WP_AUTH = 'Basic ' + Buffer.from('admin7817:GjLl 9W0k lKwf LSOT PXur RYGR').toString('base64');

// ── Safe action types that this module can auto-execute ─────────────────────

const SAFE_ACTIONS = new Set([
  'ADD_WIDGETS',
  'ADD_INTERNAL_LINKS',
  'ADD_TOC',
  'ADD_FAQ_SCHEMA',
]);

// ── Travelpayouts widget snippets ───────────────────────────────────────────

const WIDGETS = {
  flights: {
    id: '7879',
    script: `<script async src="https://trpwdg.com/content?currency=eur&trs=463418&shmarker=676421&show_hotels=true&powered_by=true&locale=fr&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100" charset="utf-8"></script>`,
    intro: "Les prix des vols varient selon le site de r\u00e9servation. Notre outil compare automatiquement les tarifs pour te garantir le meilleur prix.",
    cta: "Compare les prix et r\u00e9serve ton billet :",
  },
  esim: {
    id: '8588',
    script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&locale=en&powered_by=true&color_button=%2332a8dd&color_focused=%2332a8dd&secondary=%23FFFFFF&dark=%23262626&light=%23FFFFFF&special=%23C4C4C4&border_radius=0&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>`,
    intro: "Une connexion internet fiable est cruciale en voyage. Notre partenaire Airalo propose des eSIM dans 200+ pays avec des tarifs transparents.",
    cta: "Configure ton eSIM :",
  },
  tours: {
    id: '3947',
    script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&powered_by=true&locale=fr&promo_id=3947&campaign_id=111" charset="utf-8"></script>`,
    intro: "Pour profiter au maximum de ta destination, voici les meilleures excursions et activit\u00e9s s\u00e9lectionn\u00e9es par notre \u00e9quipe.",
    cta: "D\u00e9couvre les activit\u00e9s :",
  },
};

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[AUTO-EXEC] ${msg}`);
}

function logError(msg) {
  console.error(`[AUTO-EXEC] ERROR: ${msg}`);
}

function logSection(title) {
  console.log(`\n[AUTO-EXEC] ${'─'.repeat(50)}`);
  console.log(`[AUTO-EXEC] ${title}`);
  console.log(`[AUTO-EXEC] ${'─'.repeat(50)}`);
}

// ── WordPress helpers ───────────────────────────────────────────────────────

/**
 * Fetch a single WP post by ID with full content.
 * @param {number} postId
 * @returns {Promise<Object>} Post data including content.rendered
 */
async function wpFetchPost(postId) {
  const url = `${WP_API}/posts/${postId}?_fields=id,title,slug,content,categories,tags,meta`;
  const res = await fetch(url, {
    headers: {
      'Authorization': WP_AUTH,
      'User-Agent': 'FlashVoyage-AutoExecutor/1.0',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`WP GET /posts/${postId} returned ${res.status}`);
  }

  return res.json();
}

/**
 * Update a WP post via REST API (PUT).
 * @param {number} postId
 * @param {Object} data - Fields to update (content, meta, etc.)
 * @returns {Promise<Object>}
 */
async function wpUpdatePost(postId, data) {
  const url = `${WP_API}/posts/${postId}`;
  const res = await fetch(url, {
    method: 'POST', // WP REST API uses POST for updates
    headers: {
      'Authorization': WP_AUTH,
      'Content-Type': 'application/json',
      'User-Agent': 'FlashVoyage-AutoExecutor/1.0',
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WP POST /posts/${postId} returned ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

// ── Utility helpers ─────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Load and parse a JSON file, returning null if it does not exist.
 */
async function loadJson(path) {
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Generate a short content diff (first N chars that differ).
 */
function contentDiff(before, after, contextChars = 200) {
  if (before === after) return '(no change)';

  // Find first difference
  let i = 0;
  while (i < before.length && i < after.length && before[i] === after[i]) i++;

  const start = Math.max(0, i - 40);
  const addedLen = after.length - before.length;

  return {
    beforeLength: before.length,
    afterLength: after.length,
    addedChars: addedLen,
    firstDiffAt: i,
    beforeSnippet: before.slice(start, start + contextChars),
    afterSnippet: after.slice(start, start + contextChars),
  };
}

// ── ACTION EXECUTORS ────────────────────────────────────────────────────────

/**
 * 1. ADD_WIDGETS — Inject Travelpayouts widgets at contextual positions.
 *
 * Strategy:
 *   - Flights widget: after first <p> containing price/vol/billet/avion keywords
 *   - eSIM widget: after <p> containing internet/sim/connexion/arriv keywords
 *   - Tours widget: after <p> containing activit/excursion/que faire/visite keywords
 *   - Fallback: before the last </article> or at the end
 *
 * Never injects if the widget promo_id is already present in the content.
 *
 * @param {string} content - Current article HTML
 * @param {Object} article - Article metadata from recommendations
 * @returns {{ content: string, changes: string[] }}
 */
function executeAddWidgets(content, article) {
  const changes = [];
  const widgetsToPlace = [];

  // Determine which widgets are missing
  for (const [type, widget] of Object.entries(WIDGETS)) {
    // Check if widget is already present (by promo_id)
    if (content.includes(`promo_id=${widget.id}`) || content.includes(`promo_id%3D${widget.id}`)) {
      continue;
    }
    widgetsToPlace.push({ type, ...widget });
  }

  if (widgetsToPlace.length === 0) {
    return { content, changes: ['All widgets already present — skipped'] };
  }

  // Build widget HTML block
  function buildWidgetBlock(widget) {
    return [
      `\n<!-- FlashVoyage AutoExecutor: ${widget.type} widget -->`,
      `<div class="fv-widget fv-widget-${widget.type}" style="margin: 2em 0; padding: 1em; background: #f8f9fa; border-radius: 8px;">`,
      `  <p style="font-size: 0.95em; color: #555; margin-bottom: 0.5em;">${widget.intro}</p>`,
      `  <p style="font-weight: 600; margin-bottom: 0.8em;">${widget.cta}</p>`,
      `  ${widget.script}`,
      `</div>`,
    ].join('\n');
  }

  // Keyword patterns for contextual placement
  const PLACEMENT_PATTERNS = {
    flights: /(?:prix|tarif|co[uû]t|vol[s]?\b|billet|avion|a[eé]roport|r[eé]serv)/i,
    esim: /(?:internet|sim\b|esim|connexion|wifi|t[eé]l[eé]phone|arriv[eé]e|communication)/i,
    tours: /(?:activit[eé]|excursion|que faire|visite[r]?\b|temple|mus[eé]e|food tour|incontournable)/i,
  };

  // Split content into paragraphs for contextual placement
  // We look for <p>...</p> blocks to find insertion points
  const paragraphs = content.split(/(<\/p>)/i);

  for (const widget of widgetsToPlace) {
    const pattern = PLACEMENT_PATTERNS[widget.type];
    let inserted = false;

    if (pattern) {
      // Walk paragraphs, find the first matching one, insert after it
      let rebuilt = '';
      let paragraphIndex = 0;

      for (let i = 0; i < paragraphs.length; i++) {
        rebuilt += paragraphs[i];

        // Each closing </p> ends a paragraph
        if (paragraphs[i].toLowerCase() === '</p>') {
          paragraphIndex++;

          // Check the content of this paragraph (the part before </p>)
          const paragraphContent = paragraphs[i - 1] || '';
          if (!inserted && paragraphIndex >= 2 && pattern.test(paragraphContent)) {
            const block = buildWidgetBlock(widget);
            rebuilt += block;
            inserted = true;
            changes.push(`Inserted ${widget.type} widget (promo_id=${widget.id}) after paragraph ${paragraphIndex} (contextual match)`);
          }
        }
      }

      if (inserted) {
        content = rebuilt;
        continue;
      }
    }

    // Fallback: insert before closing "Articles connexes" section or at the end
    if (!inserted) {
      const block = buildWidgetBlock(widget);

      // Try to insert before "Articles connexes" or "articles-lies" section
      const connexePattern = /(<(?:div|section)[^>]*(?:articles?[-_](?:connexes|lies|related))[^>]*>)/i;
      const connexeMatch = content.match(connexePattern);

      if (connexeMatch && connexeMatch.index !== undefined) {
        content = content.slice(0, connexeMatch.index) + block + '\n' + content.slice(connexeMatch.index);
        changes.push(`Inserted ${widget.type} widget (promo_id=${widget.id}) before "Articles connexes" section`);
      } else {
        // Append at the very end
        content += block;
        changes.push(`Inserted ${widget.type} widget (promo_id=${widget.id}) at end of content (no contextual match found)`);
      }
    }
  }

  return { content, changes };
}


/**
 * 2. ADD_INTERNAL_LINKS — Link to top-performing articles.
 *
 * Reads article-scores.json to find the top 20% articles, then for each
 * article being processed, finds 3-5 relevant top articles (same category
 * or overlapping destination keywords) and inserts natural <a> links in
 * existing paragraphs, plus an "Articles connexes" block at the end.
 *
 * @param {string} content - Current article HTML
 * @param {Object} article - Article metadata from recommendations (wpId, slug, categories, etc.)
 * @param {Array} topArticles - Pre-loaded top articles from article-scores.json
 * @returns {{ content: string, changes: string[] }}
 */
function executeAddInternalLinks(content, article, topArticles) {
  const changes = [];

  if (!topArticles || topArticles.length === 0) {
    return { content, changes: ['No article scores available — skipped'] };
  }

  // Find relevant top articles: same category or destination overlap
  const articleCategories = new Set(article.categories || []);
  const articleSlug = article.slug || '';
  const slugWords = new Set(articleSlug.split('-').filter(w => w.length > 3));

  // Score each top article for relevance to this one
  const candidates = topArticles
    .filter(ta => ta.slug !== articleSlug) // Exclude self
    .filter(ta => !content.includes(`flashvoyage.com/${ta.slug}/`)) // Exclude already linked
    .map(ta => {
      let relevance = 0;

      // Category overlap
      const taCats = new Set(ta.categories || []);
      for (const cat of articleCategories) {
        if (taCats.has(cat)) relevance += 3;
      }

      // Slug word overlap (destination keywords)
      const taSlugWords = new Set((ta.slug || '').split('-').filter(w => w.length > 3));
      for (const word of slugWords) {
        if (taSlugWords.has(word)) relevance += 2;
      }

      // Bonus for high-scoring articles
      if (ta.score >= 70) relevance += 2;
      else if (ta.score >= 50) relevance += 1;

      return { ...ta, relevance };
    })
    .filter(ta => ta.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);

  if (candidates.length === 0) {
    return { content, changes: ['No relevant top articles found for internal linking — skipped'] };
  }

  // Strategy A: Inline links — find mentions of destination keywords in paragraphs
  // and wrap them in <a> tags pointing to relevant articles
  let inlineLinksAdded = 0;

  for (const candidate of candidates.slice(0, 3)) {
    // Extract the main destination word from the candidate's slug
    const destWords = (candidate.slug || '').split('-').filter(w => w.length > 3);

    for (const destWord of destWords) {
      // Look for the word in the content (case-insensitive), not already inside an <a> tag
      // Only match whole words within <p> text, not inside existing links or headings
      const regex = new RegExp(
        `(<p[^>]*>[^<]*?)\\b(${destWord})\\b([^<]*?</p>)`,
        'i'
      );

      const match = content.match(regex);
      if (match && !match[0].includes(`<a `)) {
        const linkedText = `${match[1]}<a href="https://flashvoyage.com/${candidate.slug}/" title="${escapeHtml(candidate.title || candidate.slug)}">${match[2]}</a>${match[3]}`;
        content = content.replace(match[0], linkedText);
        inlineLinksAdded++;
        changes.push(`Inline link: "${destWord}" -> /${candidate.slug}/ (score: ${candidate.score || 'N/A'})`);
        break; // One inline link per candidate
      }
    }
  }

  // Strategy B: Add an "Articles connexes" block at the end if not already present
  const hasRelatedBlock = /articles?[-_\s]*(connexes|li[eé]s|related)/i.test(content);

  if (!hasRelatedBlock && candidates.length >= 2) {
    let relatedHtml = '\n\n<!-- FlashVoyage AutoExecutor: internal links block -->\n';
    relatedHtml += '<div class="fv-related-articles" style="margin-top: 2em; padding: 1.5em; background: #f0f4f8; border-radius: 8px;">\n';
    relatedHtml += '  <h3 style="margin-top: 0;">Articles connexes</h3>\n';
    relatedHtml += '  <ul>\n';

    for (const candidate of candidates.slice(0, 5)) {
      const title = candidate.title || candidate.slug.replace(/-/g, ' ');
      relatedHtml += `    <li><a href="https://flashvoyage.com/${candidate.slug}/">${escapeHtml(title)}</a></li>\n`;
    }

    relatedHtml += '  </ul>\n';
    relatedHtml += '</div>\n';

    content += relatedHtml;
    changes.push(`Added "Articles connexes" block with ${Math.min(candidates.length, 5)} links`);
  }

  if (changes.length === 0) {
    changes.push('No suitable internal links could be added — skipped');
  }

  return { content, changes };
}


/**
 * 3. ADD_TOC — Add [ez-toc] shortcode at the beginning of content.
 *
 * Checks if the article already has Easy TOC, a manual TOC, or the
 * "sommaire" keyword. If not, inserts the [ez-toc] shortcode after
 * the first paragraph (so the intro is visible before the TOC).
 *
 * @param {string} content - Current article HTML
 * @returns {{ content: string, changes: string[] }}
 */
function executeAddToc(content) {
  const changes = [];

  // Already has TOC?
  if (
    content.includes('ez-toc') ||
    content.includes('[toc]') ||
    content.includes('table-of-contents') ||
    content.includes('id="sommaire"') ||
    content.includes('class="sommaire"')
  ) {
    return { content, changes: ['TOC already present — skipped'] };
  }

  // Count headings — only add TOC if there are at least 3 H2/H3 headings
  const headingCount = (content.match(/<h[23][^>]*>/gi) || []).length;
  if (headingCount < 3) {
    return { content, changes: [`Only ${headingCount} headings found (need >= 3) — skipped`] };
  }

  // Insert [ez-toc] shortcode after the first paragraph
  const firstPClose = content.indexOf('</p>');
  if (firstPClose === -1) {
    // No paragraph found — insert at the very beginning
    content = '[ez-toc]\n\n' + content;
    changes.push('Inserted [ez-toc] shortcode at beginning (no paragraphs found)');
  } else {
    const insertAt = firstPClose + '</p>'.length;
    content = content.slice(0, insertAt) + '\n\n[ez-toc]\n\n' + content.slice(insertAt);
    changes.push(`Inserted [ez-toc] shortcode after first paragraph (${headingCount} headings detected)`);
  }

  return { content, changes };
}


/**
 * 4. ADD_FAQ_SCHEMA — Generate FAQ via Haiku and inject JSON-LD.
 *
 * Uses Claude Haiku to generate 3-5 FAQ questions from the article content,
 * then injects both visible FAQ HTML and the FAQPage JSON-LD schema.
 *
 * Falls back to keyword-based FAQ generation if Haiku is unavailable.
 *
 * @param {string} content - Current article HTML
 * @param {Object} article - Article metadata
 * @returns {Promise<{ content: string, changes: string[] }>}
 */
async function executeAddFaqSchema(content, article) {
  const changes = [];

  // Already has FAQ schema?
  if (content.includes('FAQPage') || content.includes('faq-schema') || content.includes('fv-faq-section')) {
    return { content, changes: ['FAQ schema already present — skipped'] };
  }

  // Generate FAQ questions
  let faqQuestions;

  try {
    faqQuestions = await generateFaqWithHaiku(content, article);
    changes.push(`Generated ${faqQuestions.length} FAQ questions via Claude Haiku`);
  } catch (err) {
    log(`Haiku FAQ generation failed (${err.message}) — using keyword fallback`);
    faqQuestions = generateFaqFallback(content, article);
    changes.push(`Generated ${faqQuestions.length} FAQ questions via keyword fallback`);
  }

  if (!faqQuestions || faqQuestions.length === 0) {
    return { content, changes: ['Could not generate FAQ questions — skipped'] };
  }

  // Build FAQ HTML
  let faqHtml = '\n\n<!-- FlashVoyage AutoExecutor: FAQ Section -->\n';
  faqHtml += '<div class="fv-faq-section" style="margin-top: 2em;">\n';
  faqHtml += '  <h2>Questions fr\u00e9quentes</h2>\n';
  for (const faq of faqQuestions) {
    faqHtml += '  <div class="fv-faq-item" style="margin-bottom: 1.2em;">\n';
    faqHtml += `    <h3>${escapeHtml(faq.question)}</h3>\n`;
    faqHtml += `    <p>${escapeHtml(faq.answer)}</p>\n`;
    faqHtml += '  </div>\n';
  }
  faqHtml += '</div>\n';

  // Build JSON-LD schema
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

  const schemaScript = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

  content += faqHtml + '\n' + schemaScript;
  changes.push('Injected FAQ HTML block + FAQPage JSON-LD schema at end of content');

  return { content, changes };
}


/**
 * Generate FAQ questions using Claude Haiku.
 */
async function generateFaqWithHaiku(content, article) {
  // Dynamic import to avoid hard dependency
  const { generateWithClaude, isAnthropicAvailable } = await import('../anthropic-client.js');

  if (!isAnthropicAvailable()) {
    throw new Error('Anthropic API not available');
  }

  const plainText = content.replace(/<[^>]+>/g, '').slice(0, 3000);
  const title = article.title || article.slug || '';

  const systemPrompt = `Tu es un expert SEO voyage. G\u00e9n\u00e8re des questions FAQ au format "People Also Ask" de Google pour un article FlashVoyage.com. R\u00e9ponds UNIQUEMENT avec du JSON valide.`;

  const userPrompt = `Article: "${title}"
URL: https://flashvoyage.com/${article.slug || ''}/

D\u00e9but du contenu:
${plainText.slice(0, 2000)}

G\u00e9n\u00e8re exactement 4 questions/r\u00e9ponses FAQ en fran\u00e7ais.
- Les questions doivent cibler les "People Also Ask" de Google
- Les r\u00e9ponses doivent \u00eatre factuelles, concises (60-100 mots chacune)
- Inclure des chiffres et des donn\u00e9es quand c'est possible

Format JSON attendu:
[
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." }
]`;

  const raw = await generateWithClaude(systemPrompt, userPrompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2048,
    temperature: 0.3,
    trackingStep: 'auto-executor-faq',
  });

  // Parse response
  const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Haiku returned empty or invalid FAQ array');
  }

  // Validate structure
  return parsed
    .filter(q => q.question && q.answer)
    .slice(0, 5);
}


/**
 * Fallback FAQ generation using keyword extraction from content.
 * Used when Haiku is not available.
 */
function generateFaqFallback(content, article) {
  const plainText = content.replace(/<[^>]+>/g, '');
  const title = article.title || article.slug?.replace(/-/g, ' ') || 'cette destination';

  // Extract destination from slug
  const slug = article.slug || '';
  const destination = slug.split('-')
    .filter(w => w.length > 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .slice(0, 2)
    .join(' ') || 'cette destination';

  const questions = [];

  // Budget FAQ
  if (/budget|prix|co[uû]t|tarif|euro|EUR|\d+\s*€/i.test(plainText)) {
    questions.push({
      question: `Quel budget pr\u00e9voir pour ${destination} ?`,
      answer: `Le budget moyen pour ${destination} d\u00e9pend de votre style de voyage. Consultez notre guide d\u00e9taill\u00e9 ci-dessus pour une estimation compl\u00e8te incluant h\u00e9bergement, transport, repas et activit\u00e9s. Nous recommandons de pr\u00e9voir une marge de 15-20% pour les impr\u00e9vus.`,
    });
  }

  // Best time FAQ
  if (/saison|p[eé]riode|meilleur moment|quand partir|mois/i.test(plainText)) {
    questions.push({
      question: `Quelle est la meilleure p\u00e9riode pour visiter ${destination} ?`,
      answer: `La meilleure p\u00e9riode d\u00e9pend de vos pr\u00e9f\u00e9rences climatiques et de votre budget. Reportez-vous \u00e0 la section d\u00e9di\u00e9e de notre article pour d\u00e9couvrir les avantages de chaque saison, les \u00e9v\u00e9nements locaux et les p\u00e9riodes les moins ch\u00e8res.`,
    });
  }

  // Visa/entry FAQ
  if (/visa|passeport|entr[eé]e|formalit[eé]|douane/i.test(plainText)) {
    questions.push({
      question: `Faut-il un visa pour ${destination} ?`,
      answer: `Les conditions d'entr\u00e9e varient selon votre nationalit\u00e9. Pour les ressortissants fran\u00e7ais, consultez les informations d\u00e9taill\u00e9es dans notre guide ci-dessus. Nous recommandons de v\u00e9rifier les exigences sur le site du minist\u00e8re des Affaires \u00e9trang\u00e8res avant votre d\u00e9part.`,
    });
  }

  // Safety FAQ
  if (/s[eé]curit[eé]|danger|s[uû]r|arnaque|pr[eé]caution/i.test(plainText)) {
    questions.push({
      question: `${destination} est-il s\u00fbr pour les touristes ?`,
      answer: `Comme pour toute destination, il convient de prendre certaines pr\u00e9cautions. Consultez la section s\u00e9curit\u00e9 de notre article pour des conseils adapt\u00e9s \u00e0 ${destination}, incluant les quartiers \u00e0 \u00e9viter et les arnaques courantes.`,
    });
  }

  // Generic FAQ if we have fewer than 3
  if (questions.length < 3) {
    questions.push({
      question: `Comment se d\u00e9placer \u00e0 ${destination} ?`,
      answer: `Les options de transport \u00e0 ${destination} incluent les transports en commun, les taxis et les services de VTC. Notre article d\u00e9taille les meilleures options selon votre budget et votre itin\u00e9raire. Comparez les tarifs de transport avec notre outil ci-dessus.`,
    });
  }

  if (questions.length < 3) {
    questions.push({
      question: `O\u00f9 dormir \u00e0 ${destination} ?`,
      answer: `${destination} offre un large choix d'h\u00e9bergements pour tous les budgets. Des auberges de jeunesse aux h\u00f4tels de luxe, consultez notre guide d\u00e9taill\u00e9 pour trouver le quartier et le type de logement qui vous conviennent le mieux.`,
    });
  }

  return questions.slice(0, 4);
}


// ── MAIN EXECUTOR ───────────────────────────────────────────────────────────

/**
 * Execute auto-applicable actions from article-recommendations.json.
 *
 * @param {Object} options
 * @param {boolean} options.dryRun - If true (default), only preview changes
 * @param {number} options.maxActions - Max actions to execute (default 10)
 * @param {string|null} options.filterAction - Only execute this action type (e.g. 'ADD_TOC')
 * @returns {Promise<Object>} Execution report
 */
export async function executeAutoActions(options = {}) {
  const {
    dryRun = true,
    maxActions = 10,
    filterAction = null,
  } = options;

  const startTime = Date.now();
  const executionLog = [];
  let actionsExecuted = 0;
  let actionsSkipped = 0;
  let actionsFailed = 0;

  logSection(`AUTO-EXECUTOR ${dryRun ? '(DRY RUN)' : '(LIVE MODE)'}`);
  log(`Max actions: ${maxActions}`);
  if (filterAction) log(`Filter: ${filterAction} only`);

  // ── 1. Load recommendations ──────────────────────────────────────────────

  const recsData = await loadJson(RECOMMENDATIONS_PATH);
  if (!recsData || !recsData.articles) {
    logError(`No recommendations found at ${RECOMMENDATIONS_PATH}`);
    logError('Run: node intelligence/article-recommender.js report');
    return { error: 'No recommendations file', executionLog };
  }

  log(`Loaded ${recsData.articles.length} articles with ${recsData.summary?.totalRecommendations || '?'} total recommendations`);

  // ── 2. Load article scores for internal linking ──────────────────────────

  let topArticles = [];
  try {
    const scoresData = await loadJson(SCORES_PATH);
    if (scoresData?.articles) {
      // Get top 20% by score
      const sorted = [...scoresData.articles].sort((a, b) => (b.score || 0) - (a.score || 0));
      const top20pct = Math.max(5, Math.ceil(sorted.length * 0.2));
      topArticles = sorted.slice(0, top20pct);
      log(`Loaded ${topArticles.length} top articles (top 20%) for internal linking`);
    } else if (Array.isArray(scoresData)) {
      const sorted = [...scoresData].sort((a, b) => (b.score || 0) - (a.score || 0));
      const top20pct = Math.max(5, Math.ceil(sorted.length * 0.2));
      topArticles = sorted.slice(0, top20pct);
      log(`Loaded ${topArticles.length} top articles (top 20%) for internal linking`);
    }
  } catch (err) {
    log(`Could not load article scores: ${err.message} — internal linking will be limited`);
  }

  // ── 3. Filter for auto-applicable actions ────────────────────────────────

  const actionQueue = [];

  for (const article of recsData.articles) {
    for (const rec of (article.recommendations || [])) {
      if (!SAFE_ACTIONS.has(rec.action)) continue;
      if (filterAction && rec.action !== filterAction) continue;

      actionQueue.push({
        wpId: article.wpId,
        slug: article.slug,
        title: article.title,
        url: article.url,
        categories: article.categories || [],
        action: rec.action,
        priority: rec.priority,
        metric: rec.metric,
        details: rec.details,
      });
    }
  }

  // Sort by priority (P0 first), then by article pageviews
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
  actionQueue.sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9);
    if (pDiff !== 0) return pDiff;
    // For same priority, process different actions for same article together
    return a.wpId - b.wpId;
  });

  log(`Found ${actionQueue.length} auto-applicable actions (filtered from ${recsData.summary?.totalRecommendations || '?'} total)`);
  log(`Will process up to ${maxActions} actions`);

  if (actionQueue.length === 0) {
    log('Nothing to execute.');
    return { actionsExecuted: 0, actionsSkipped: 0, actionsFailed: 0, executionLog };
  }

  // ── 4. Group actions by article to minimize WP API calls ─────────────────

  // We group actions by wpId so we only fetch/update each article once
  const articleActions = new Map();
  let totalQueued = 0;

  for (const action of actionQueue) {
    if (totalQueued >= maxActions) break;

    if (!articleActions.has(action.wpId)) {
      articleActions.set(action.wpId, {
        wpId: action.wpId,
        slug: action.slug,
        title: action.title,
        url: action.url,
        categories: action.categories,
        actions: [],
      });
    }
    articleActions.get(action.wpId).actions.push(action);
    totalQueued++;
  }

  log(`Grouped into ${articleActions.size} articles`);

  // ── 5. Execute actions per article ───────────────────────────────────────

  for (const [wpId, articleGroup] of articleActions) {
    logSection(`Article #${wpId}: "${articleGroup.title?.slice(0, 60) || articleGroup.slug}"`);
    log(`URL: ${articleGroup.url}`);
    log(`Actions: ${articleGroup.actions.map(a => a.action).join(', ')}`);

    const articleLogEntry = {
      wpId,
      slug: articleGroup.slug,
      title: articleGroup.title,
      url: articleGroup.url,
      timestamp: new Date().toISOString(),
      actions: [],
      error: null,
    };

    try {
      // Fetch current content from WordPress
      const post = await wpFetchPost(wpId);
      const originalContent = post.content?.rendered || '';
      let currentContent = originalContent;

      log(`Fetched article (${originalContent.length} chars)`);

      // Execute each action on this article's content
      for (const action of articleGroup.actions) {
        log(`  Executing: ${action.action} [${action.priority}]`);

        const actionLog = {
          action: action.action,
          priority: action.priority,
          metric: action.metric,
          changes: [],
          status: 'pending',
        };

        try {
          let result;

          switch (action.action) {
            case 'ADD_WIDGETS':
              result = executeAddWidgets(currentContent, articleGroup);
              break;

            case 'ADD_INTERNAL_LINKS':
              result = executeAddInternalLinks(currentContent, articleGroup, topArticles);
              break;

            case 'ADD_TOC':
              result = executeAddToc(currentContent);
              break;

            case 'ADD_FAQ_SCHEMA':
              result = await executeAddFaqSchema(currentContent, articleGroup);
              break;

            default:
              result = { content: currentContent, changes: [`Unknown action: ${action.action}`] };
          }

          currentContent = result.content;
          actionLog.changes = result.changes;

          // Check if content actually changed
          if (currentContent !== originalContent) {
            actionLog.status = 'applied';
            actionsExecuted++;
          } else {
            actionLog.status = 'skipped';
            actionsSkipped++;
          }

          for (const change of result.changes) {
            log(`    ${actionLog.status === 'applied' ? '+' : '-'} ${change}`);
          }

        } catch (actionErr) {
          actionLog.status = 'failed';
          actionLog.error = actionErr.message;
          actionsFailed++;
          logError(`  Action ${action.action} failed: ${actionErr.message}`);
        }

        articleLogEntry.actions.push(actionLog);
      }

      // ── Push to WordPress if content changed and not dry run ──

      const contentChanged = currentContent !== originalContent;
      articleLogEntry.contentChanged = contentChanged;
      articleLogEntry.diff = contentDiff(originalContent, currentContent);

      if (contentChanged) {
        if (dryRun) {
          log(`  DRY RUN: Would update article (${articleLogEntry.diff.addedChars} chars added)`);
          log(`  First change at char ${articleLogEntry.diff.firstDiffAt}`);
          articleLogEntry.pushed = false;
        } else {
          log(`  Pushing update to WordPress...`);

          try {
            await wpUpdatePost(wpId, { content: currentContent });
            log(`  Updated article #${wpId} on WordPress (+${articleLogEntry.diff.addedChars} chars)`);
            articleLogEntry.pushed = true;
          } catch (pushErr) {
            logError(`  Failed to push update: ${pushErr.message}`);
            articleLogEntry.pushed = false;
            articleLogEntry.pushError = pushErr.message;
          }
        }
      } else {
        log(`  No content changes for this article`);
        articleLogEntry.pushed = false;
      }

    } catch (fetchErr) {
      logError(`Failed to fetch article #${wpId}: ${fetchErr.message}`);
      articleLogEntry.error = fetchErr.message;
      actionsFailed += articleGroup.actions.length;
    }

    executionLog.push(articleLogEntry);

    // Rate limit: small delay between articles
    await new Promise(r => setTimeout(r, 500));
  }

  // ── 6. Write execution log ───────────────────────────────────────────────

  const report = {
    executedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'live',
    elapsedMs: Date.now() - startTime,
    summary: {
      totalActionsProcessed: actionsExecuted + actionsSkipped + actionsFailed,
      actionsExecuted,
      actionsSkipped,
      actionsFailed,
      articlesProcessed: articleActions.size,
    },
    executionLog,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(EXECUTOR_LOG_PATH, JSON.stringify(report, null, 2), 'utf-8');
  log(`\nExecution log written to ${EXECUTOR_LOG_PATH}`);

  // ── Print summary ────────────────────────────────────────────────────────

  logSection('EXECUTION SUMMARY');
  log(`Mode: ${dryRun ? 'DRY RUN (no changes pushed)' : 'LIVE (changes pushed to WordPress)'}`);
  log(`Articles processed: ${articleActions.size}`);
  log(`Actions executed: ${actionsExecuted}`);
  log(`Actions skipped: ${actionsSkipped}`);
  log(`Actions failed: ${actionsFailed}`);
  log(`Elapsed: ${Math.round(report.elapsedMs / 1000)}s`);

  if (dryRun && actionsExecuted > 0) {
    log('');
    log('To apply these changes for real:');
    log('  node intelligence/auto-executor.js --apply');
  }

  return report;
}


// ── CLI ─────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));

if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const maxIdx = args.indexOf('--max');
  const maxActions = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) || 10 : 10;
  const actionIdx = args.indexOf('--action');
  const filterAction = actionIdx !== -1 ? args[actionIdx + 1] || null : null;

  executeAutoActions({ dryRun, maxActions, filterAction })
    .then(report => {
      if (report.error) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(err => {
      logError(`Fatal: ${err.message}`);
      console.error(err.stack);
      process.exit(1);
    });
}
