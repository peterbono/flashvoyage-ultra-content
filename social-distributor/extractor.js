/**
 * FlashVoyage Social Distributor — Content Extractor
 *
 * Extracts social-media-ready elements from a WordPress article
 * using the WP REST API + cheerio HTML parsing.
 *
 * Usage:
 *   import { extractFromPost, extractFromId } from './extractor.js';
 *   const data = await extractFromId(4250);
 */

import https from 'node:https';
import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';

// ── Config ──────────────────────────────────────────────────────────────────
const WP_BASE = 'https://flashvoyage.com/wp-json/wp/v2';
const WP_AUTH = Buffer.from('admin7817:GjLl 9W0k lKwf LSOT PXur RYGR').toString('base64');

/**
 * Lightweight HTTPS GET that returns { data, headers }.
 * Replaces axios to avoid undici/Node 20 dependency.
 */
function httpsGet(url, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        return httpsGet(res.headers.location, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve({ data: JSON.parse(body), headers: res.headers });
        } catch {
          reject(new Error(`Invalid JSON from ${url}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout for ${url}`)); });
  });
}

// Only match monetary values: amounts with €, EUR, $, USD, ¥, or X €/jour, X €/nuit patterns
const STAT_REGEX = /\d[\d\s.,]*\s*(?:€|EUR|USD|\$|¥)(?:\s*\/\s*(?:jour|nuit|mois|semaine|personne|pers))?/gi;

const SHOCK_WORDS = [
  'jamais', 'personne', 'piège', 'caché', 'cachée', 'cachés', 'cachées',
  'secret', 'secrète', 'secrets', 'secrètes',
  'interdit', 'interdite', 'interdits', 'interdites',
  'erreur', 'erreurs', 'danger', 'dangereux', 'dangereuse',
  'incroyable', 'insolite', 'choquant', 'choquante',
  'scandale', 'arnaque', 'escroquerie',
  'surprenant', 'surprenante', 'inattendu', 'inattendue',
  'méconnu', 'méconnue', 'oublié', 'oubliée',
];

// ── WP API helpers ──────────────────────────────────────────────────────────

/**
 * Fetch a single post by ID, embedding featured media and category terms.
 */
async function fetchPost(postId) {
  const url = `${WP_BASE}/posts/${postId}?_embed=wp:featuredmedia,wp:term`;
  const { data } = await httpsGet(url, 15_000);
  return data;
}

/**
 * Fetch all published posts (paginated, all pages).
 * Returns an array of lightweight post objects.
 */
async function fetchAllPosts() {
  const posts = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `${WP_BASE}/posts?per_page=100&page=${page}&status=publish&_embed=wp:featuredmedia,wp:term`;
    const { data, headers } = await httpsGet(url, 30_000);

    posts.push(...data);

    if (page === 1) {
      totalPages = parseInt(headers['x-wp-totalpages'] || '1', 10);
    }
    page++;
  }

  return posts;
}

// ── Parsing helpers ─────────────────────────────────────────────────────────

/**
 * Extract the first paragraph text from rendered HTML content.
 */
function extractHook($) {
  const firstP = $('p').first().text().trim();
  return firstP || '';
}

/**
 * Extract monetary stats with context (e.g. "35 €/nuit", "14 800 €").
 * Only extracts amounts with currency symbols (€, EUR, $, USD, ¥).
 * Returns array of objects: { label, value, amount } or plain strings for backward compat.
 *
 * Also scans for "X €/jour" total budget figures in surrounding context.
 */
function extractKeyStats($) {
  const text = $.root().text();
  const matches = text.match(STAT_REGEX) || [];
  // Deduplicate and clean whitespace
  const seen = new Set();
  const results = [];

  for (const m of matches) {
    const cleaned = m.replace(/\s+/g, ' ').trim();
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);

    // Parse the numeric amount
    const numStr = cleaned.replace(/[^\d.,\s]/g, '').replace(/\s/g, '').replace(/,/g, '.');
    const amount = parseFloat(numStr) || 0;

    // Try to find a label from surrounding context (look for preceding text)
    // For now, derive a label from the unit suffix
    let label = 'Budget';
    if (/\/nuit/i.test(cleaned)) label = 'Hébergement';
    else if (/\/jour/i.test(cleaned)) label = 'Budget/jour';
    else if (/\/mois/i.test(cleaned)) label = 'Budget/mois';
    else if (/\/pers/i.test(cleaned)) label = 'Par personne';

    results.push({ label, value: cleaned, amount });
  }

  return results;
}

/**
 * Find the most "shocking" sentence in the article.
 * Heuristic: sentence containing a shock word or ending with "!".
 * Prefers sentences with shock words; falls back to "!" sentences.
 */
function extractShockFact($) {
  // Extract only paragraph text (exclude headings, lists, etc.)
  const paragraphs = [];
  $('p').each((_, el) => {
    const t = $(el).text().trim();
    if (t) paragraphs.push(t);
  });
  const text = paragraphs.join(' ');

  // Split into sentences (rough French-friendly split)
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 300);

  // Score each sentence
  let best = { sentence: '', score: 0 };

  for (const sentence of sentences) {
    let score = 0;
    const lower = sentence.toLowerCase();

    // Shock words
    for (const word of SHOCK_WORDS) {
      if (lower.includes(word)) score += 3;
    }
    // Exclamation mark
    if (sentence.endsWith('!')) score += 2;
    // Contains a number (more concrete = more shareable)
    if (/\d/.test(sentence)) score += 1;

    if (score > best.score) {
      best = { sentence, score };
    }
  }

  return best.sentence || sentences[0] || '';
}

/**
 * Extract all H2 headings as a list.
 */
function extractHighlights($) {
  const headings = [];
  $('h2').each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) headings.push(txt);
  });
  return headings;
}

/**
 * Resolve the featured image URL from embedded data or media endpoint.
 */
function extractImageUrl(post) {
  // Try _embedded first
  const embedded = post._embedded?.['wp:featuredmedia'];
  if (embedded?.[0]?.source_url) {
    return embedded[0].source_url;
  }
  // Try media_details sizes
  if (embedded?.[0]?.media_details?.sizes?.full?.source_url) {
    return embedded[0].media_details.sizes.full.source_url;
  }
  return null;
}

/**
 * Resolve the primary category name from embedded terms.
 */
function extractCategory(post) {
  const terms = post._embedded?.['wp:term'];
  if (terms?.[0]?.[0]?.name) {
    return terms[0][0].name;
  }
  return 'Voyage';
}

// ── Haiku AI helpers ────────────────────────────────────────────────────────

/**
 * Lazy-initialized Anthropic client (only created when needed and API key is set).
 */
let _anthropicClient = null;
function getAnthropicClient() {
  if (_anthropicClient) return _anthropicClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropicClient;
}

/**
 * Extract structured budget data from article text using Claude Haiku.
 * Falls back to null if ANTHROPIC_API_KEY is not set (caller should use regex fallback).
 *
 * @param {string} articleText - Raw article text (stripped HTML)
 * @param {string} destination - Destination name (e.g. "Japon")
 * @returns {Promise<Object|null>} Structured budget or null on failure/missing key
 */
export async function extractBudgetWithAI(articleText, destination) {
  const client = getAnthropicClient();
  if (!client) {
    console.warn('[extractor] ANTHROPIC_API_KEY not set — skipping AI budget extraction, using regex fallback');
    return null;
  }

  const systemPrompt = `Tu es un extracteur de données budget voyage. Extrais les 5 postes de budget principaux de cet article.
Retourne UNIQUEMENT un JSON valide, rien d'autre:
{"hebergement": "XX €/nuit", "nourriture": "XX €/jour", "transport": "XX €/jour", "activites": "XX €/jour", "esim": "XX €", "total_jour": "XX €/jour", "total_sejour": "XX €"}
Si un poste n'est pas mentionné, mets null. Utilise les prix du profil le plus courant (backpacker/confort moyen).`;

  try {
    const truncatedText = articleText.slice(0, 6000); // keep within token limits
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [
        { role: 'user', content: `${systemPrompt}\n\nDestination: ${destination}\n\nArticle:\n${truncatedText}` }
      ],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Haiku');

    // Parse JSON — handle possible markdown fences
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    const budget = JSON.parse(jsonStr);
    console.log(`[extractor] AI budget extraction OK for ${destination}:`, JSON.stringify(budget));
    return budget;
  } catch (err) {
    console.error(`[extractor] AI budget extraction failed: ${err.message}`);
    return null;
  }
}

/**
 * Generate a punchy Instagram Story hook from an article title using Claude Haiku.
 * Falls back to null if ANTHROPIC_API_KEY is not set (caller should use truncation fallback).
 *
 * @param {string} title - Article title
 * @param {string} destination - Destination name
 * @returns {Promise<string|null>} Short hook string (max ~35 chars, uppercase) or null
 */
export async function generateStoryHook(title, destination) {
  const client = getAnthropicClient();
  if (!client) {
    console.warn('[extractor] ANTHROPIC_API_KEY not set — skipping AI story hook, using truncation fallback');
    return null;
  }

  const prompt = `Transforme ce titre d'article en hook story Instagram (max 35 caractères, 2 lignes max).
Le hook doit être percutant, créer la curiosité, et donner envie de swiper.
Titre: ${title}
Destination: ${destination}
Retourne UNIQUEMENT le hook, rien d'autre. EN MAJUSCULES.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const hook = response.content[0]?.text?.trim();
    if (!hook) throw new Error('Empty response from Haiku');

    // Ensure uppercase and strip any quotes the model might add
    const cleaned = hook.replace(/^["'«]+|["'»]+$/g, '').trim().toUpperCase();
    console.log(`[extractor] AI story hook: "${cleaned}" (from: "${title.slice(0, 50)}...")`);
    return cleaned;
  } catch (err) {
    console.error(`[extractor] AI story hook generation failed: ${err.message}`);
    return null;
  }
}

// ── Main extraction ─────────────────────────────────────────────────────────

/**
 * Extract social-media-ready data from a full WP post object.
 *
 * @param {object} post — Full WP REST API post object (with _embedded)
 * @returns {{ hook, keyStats, shockFact, highlights, imageUrl, articleUrl, title, category }}
 */
export function extractFromPost(post) {
  const html = post.content?.rendered || '';
  const $ = cheerio.load(html);

  return {
    hook: extractHook($),
    keyStats: extractKeyStats($),
    shockFact: extractShockFact($),
    highlights: extractHighlights($),
    imageUrl: extractImageUrl(post),
    articleUrl: post.link,
    title: post.title?.rendered?.replace(/&#8217;/g, "'").replace(/&#8211;/g, '–').replace(/&amp;/g, '&').replace(/&#8230;/g, '...') || '',
    category: extractCategory(post),
    rawText: $.root().text().replace(/\s+/g, ' ').trim(), // plain text for AI extraction
  };
}

/**
 * Fetch a post by ID and extract social-media-ready data.
 *
 * @param {number|string} postId — WordPress post ID
 * @returns {Promise<{ hook, keyStats, shockFact, highlights, imageUrl, articleUrl, title, category }>}
 */
export async function extractFromId(postId) {
  const post = await fetchPost(postId);
  return extractFromPost(post);
}

// Re-export helpers for article-recycler
export { fetchPost, fetchAllPosts };
