/**
 * GEO-PROOF RESOLVER
 *
 * Substitutes `[GEO_PROOF]` placeholders in generated article HTML with a real
 * first-person photo shot by Florian (the founder), retrieved from Cloudinary
 * by country tag.
 *
 * Design doc: docs/geo-proof-pipeline.md
 *
 * Public API:
 *   resolveGeoProof(country, options) → Promise<asset|null>
 *   injectGeoProof(htmlContent, country, options) → Promise<htmlContent>
 *
 * Env vars required (graceful degrade if missing — returns null + logs warn):
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Tagging contract on Cloudinary side:
 *   tags=geo-proof,florian-shot,<country-slug>
 *   country-slug = lowercase, no accent, FR (e.g. "thailande", "vietnam",
 *   "indonesie"). See docs/geo-proof-pipeline.md §2.
 */

import axios from 'axios';
import { normalizeDestination, COUNTRY_DISPLAY_NAMES } from '../destinations.js';

// ─────────────────────────────────────────────────────────────────────────────
// Country normalization: pipeline uses internal English slugs (e.g.
// 'thailand'), but Florian tags photos in French (e.g. 'thailande') because
// that's what he reads on the iOS Shortcut menu. Map both directions.
// ─────────────────────────────────────────────────────────────────────────────
const ENGLISH_TO_TAG_SLUG = {
  'thailand': 'thailande',
  'vietnam': 'vietnam',
  'indonesia': 'indonesie',
  'japan': 'japon',
  'philippines': 'philippines',
  'cambodia': 'cambodge',
  'laos': 'laos',
  'malaysia': 'malaisie',
  'singapore': 'singapour',
  'myanmar': 'birmanie',
  'taiwan': 'taiwan',
  'korea': 'coree',
  'india': 'inde',
  'nepal': 'nepal',
  'sri lanka': 'sri-lanka',
};

/**
 * Convert any incoming country string (English slug, FR display name, city
 * alias, accented variant) to the lowercase no-accent FR tag slug used on
 * Cloudinary.
 */
export function countryToTagSlug(input) {
  if (!input || typeof input !== 'string') return null;
  // 1. Try the destinations.js normalizer (handles cities + variants)
  const englishKey = normalizeDestination(input);
  if (ENGLISH_TO_TAG_SLUG[englishKey]) return ENGLISH_TO_TAG_SLUG[englishKey];

  // 2. Strip accents, lowercase, hyphenate — covers raw FR input like "Thaïlande"
  const stripped = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  // Validate it's one of our known FR slugs to avoid garbage hitting Cloudinary
  const allFrSlugs = new Set(Object.values(ENGLISH_TO_TAG_SLUG));
  return allFrSlugs.has(stripped) ? stripped : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache: avoid re-querying Cloudinary if the same article (or
// pipeline run) requests the same country twice.
// ─────────────────────────────────────────────────────────────────────────────
const _cache = new Map(); // country → asset | null
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — short-lived per process

function _getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.t > CACHE_TTL_MS) {
    _cache.delete(key);
    return undefined;
  }
  return entry.v;
}
function _setCached(key, value) {
  _cache.set(key, { v: value, t: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary client (raw REST — no SDK to keep the dep footprint minimal).
// ─────────────────────────────────────────────────────────────────────────────
function _getCreds() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return null;
  return { cloud, key, secret };
}

async function _searchCloudinary(expression, { maxResults = 5 } = {}) {
  const creds = _getCreds();
  if (!creds) return null;
  const url = `https://api.cloudinary.com/v1_1/${creds.cloud}/resources/search`;
  const auth = Buffer.from(`${creds.key}:${creds.secret}`).toString('base64');
  const res = await axios.post(
    url,
    {
      expression,
      max_results: maxResults,
      with_field: ['tags', 'context'],
      sort_by: [{ created_at: 'desc' }],
    },
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    }
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: resolveGeoProof
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a geo-proof photo for the given country.
 *
 * @param {string} country - Country name (any form: 'thailand', 'Thaïlande',
 *   'bangkok', 'thailande'). Normalized internally.
 * @param {object} [options]
 * @param {boolean} [options.allowAnyGeoProof=false] - if no country match,
 *   fall back to any geo-proof photo (degraded). Default off.
 * @param {Console} [options.logger=console] - inject for testability.
 * @returns {Promise<{url, caption, taken_at, public_id, country}|null>}
 */
export async function resolveGeoProof(country, options = {}) {
  const { allowAnyGeoProof = false, logger = console } = options;

  const slug = countryToTagSlug(country);
  if (!slug) {
    logger.warn?.(`[geo-proof] unknown country "${country}" — skipping resolve`);
    return null;
  }

  const cacheKey = `country:${slug}:${allowAnyGeoProof ? 'any' : 'strict'}`;
  const cached = _getCached(cacheKey);
  if (cached !== undefined) return cached;

  const creds = _getCreds();
  if (!creds) {
    logger.warn?.(`[geo-proof] CLOUDINARY_* env vars missing — skipping resolve`);
    _setCached(cacheKey, null);
    return null;
  }

  try {
    // Primary search: tagged with both `geo-proof` AND the country slug.
    let data = await _searchCloudinary(`tags=geo-proof AND tags=${slug}`, { maxResults: 5 });

    if ((!data?.resources || data.resources.length === 0) && allowAnyGeoProof) {
      logger.warn?.(`[geo-proof] no asset for "${slug}" — falling back to any geo-proof photo`);
      data = await _searchCloudinary(`tags=geo-proof`, { maxResults: 5 });
    }

    if (!data?.resources || data.resources.length === 0) {
      logger.warn?.(`[geo-proof] no Cloudinary asset for country "${slug}"`);
      _setCached(cacheKey, null);
      return null;
    }

    const asset = data.resources[0]; // Newest first (sort_by created_at desc)
    const ctx = asset.context?.custom || asset.context || {};
    const city = ctx.city || COUNTRY_DISPLAY_NAMES[normalizeDestination(slug)] || slug;
    const captionOverride = ctx.caption;
    const takenAtIso = ctx.taken_at || asset.created_at;
    const dateStr = _formatDateFr(takenAtIso);

    const caption = captionOverride
      ? captionOverride
      : `Photo prise par Florian à ${_capitalize(city)} le ${dateStr}`;

    const result = {
      url: asset.secure_url || asset.url,
      caption,
      taken_at: takenAtIso,
      public_id: asset.public_id,
      country: slug,
      width: asset.width,
      height: asset.height,
    };
    _setCached(cacheKey, result);
    return result;
  } catch (err) {
    logger.warn?.(`[geo-proof] Cloudinary search failed: ${err.message}`);
    _setCached(cacheKey, null);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: injectGeoProof
// ─────────────────────────────────────────────────────────────────────────────

const GEO_PROOF_MARKER = /\[GEO_PROOF\]/g;

/**
 * Replace `[GEO_PROOF]` markers in HTML content with a <figure> tag pointing
 * to a real founder photo. If no asset found, the marker is REMOVED (not
 * left in content — guardrails would otherwise flag it on next iteration).
 *
 * @param {string} htmlContent
 * @param {string} country
 * @param {object} [options] - forwarded to resolveGeoProof
 * @returns {Promise<string>} mutated HTML
 */
export async function injectGeoProof(htmlContent, country, options = {}) {
  const { logger = console } = options;
  if (!htmlContent || typeof htmlContent !== 'string') return htmlContent;
  if (!GEO_PROOF_MARKER.test(htmlContent)) return htmlContent;

  // Reset regex state after .test()
  GEO_PROOF_MARKER.lastIndex = 0;

  const asset = await resolveGeoProof(country, options);

  if (!asset) {
    // Strip markers entirely. Also strip any wrapping <p>[GEO_PROOF]</p> so
    // we don't leave empty paragraphs behind.
    const stripped = htmlContent
      .replace(/<p[^>]*>\s*\[GEO_PROOF\]\s*<\/p>/gi, '')
      .replace(GEO_PROOF_MARKER, '');
    logger.log?.(`[geo-proof] no asset for "${country}" — markers stripped`);
    return stripped;
  }

  const figureHtml = _renderFigure(asset);
  // If marker is wrapped in its own <p>, replace the whole <p>; otherwise
  // just inline the figure where the marker sits.
  let out = htmlContent.replace(/<p[^>]*>\s*\[GEO_PROOF\]\s*<\/p>/gi, figureHtml);
  out = out.replace(GEO_PROOF_MARKER, figureHtml);
  logger.log?.(`[geo-proof] injected ${asset.public_id} for "${country}"`);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML rendering — mirror the figure shape used in image-source-manager.js
// ─────────────────────────────────────────────────────────────────────────────
function _renderFigure(asset) {
  const escAlt = _escapeHtml(asset.caption);
  const w = asset.width || 1080;
  const h = asset.height || 720;
  const displayW = Math.min(w, 800);
  const displayH = Math.round((displayW / w) * h);
  return `
<figure class="fv-inline-image fv-geo-proof" data-source="cloudinary-geo-proof" data-country="${asset.country}">
  <img src="${asset.url}" alt="${escAlt}" loading="lazy" width="${displayW}" height="${displayH}" />
  <figcaption>${escAlt}</figcaption>
</figure>`.trim();
}

function _escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function _formatDateFr(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return '';
  }
}

// Test/debug exports
export const __test = {
  _renderFigure,
  _formatDateFr,
  _cache,
};
