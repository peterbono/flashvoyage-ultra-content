#!/usr/bin/env node

/**
 * IMAGE SOURCE MANAGER
 * Cascade multi-source: Pexels > Flickr CC-BY (Unsplash desactive — app retiree)
 * 
 * Chaque source retourne un format unifié:
 * { url, width, height, alt, photographer, photographerUrl, source, sourceUrl, license, sourceId }
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { UNSPLASH_API_KEY, FLICKR_API_KEY, PEXELS_API_KEY } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USED_IMAGES_PATH = join(__dirname, 'used-images.json');

/**
 * Flickr license IDs autorisant l'usage commercial (CC-BY variants)
 * 4 = Attribution 2.0, 5 = Attribution-ShareAlike 2.0,
 * 9 = CC0 1.0, 10 = Public Domain Mark
 */
const FLICKR_COMMERCIAL_LICENSES = '4,5,9,10';

/**
 * Labels lisibles pour les licences Flickr
 */
const FLICKR_LICENSE_LABELS = {
  '4': 'CC BY 2.0',
  '5': 'CC BY-SA 2.0',
  '9': 'CC0 1.0',
  '10': 'Public Domain'
};

export default class ImageSourceManager {
  constructor() {
    this.usedImages = this._loadUsedImages();
    this.requestCounts = { unsplash: 0, flickr: 0, pexels: 0 };
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  /**
   * Recherche cascade: Pexels → Flickr CC-BY (Unsplash desactive)
   * @param {string} query - Termes de recherche
   * @param {Object} options - { preferSource, minWidth, orientation }
   * @returns {Object|null} Image au format unifié ou null
   */
  async searchCascade(query, options = {}) {
    const { preferSource, minWidth = 800, orientation = 'landscape' } = options;

    const defaultOrder = ['pexels', 'flickr'];
    const sources = preferSource
      ? [preferSource, ...defaultOrder.filter(s => s !== preferSource)]
      : defaultOrder;

    for (const source of sources) {
      try {
        let result = null;

        switch (source) {
          case 'unsplash':
            if (!UNSPLASH_API_KEY) continue;
            result = await this.searchUnsplash(query, { minWidth, orientation });
            break;
          case 'flickr':
            if (!FLICKR_API_KEY) continue;
            result = await this.searchFlickr(query, { minWidth });
            break;
          case 'pexels':
            if (!PEXELS_API_KEY) continue;
            result = await this.searchPexels(query, { minWidth, orientation });
            break;
        }

        if (result && !this.isUsed(result.sourceId)) {
          return result;
        }
      } catch (error) {
        console.warn(`   ⚠️ ImageSource ${source}: ${error.message}`);
        continue;
      }
    }

    return null;
  }

  /**
   * Recherche multiple images pour un article (2-3 images)
   * @param {Array} queries - [{query, position, sourcePreference}]
   * @returns {Array} Images au format unifié avec position
   */
  async searchMultiple(queries) {
    const results = [];

    for (const { query, position, sourcePreference } of queries) {
      const image = await this.searchCascade(query, {
        preferSource: sourcePreference
      });

      if (image) {
        image.position = position;
        this.markUsed(image.sourceId, image.source);
        results.push(image);
        console.log(`   ✅ Image "${position}": ${image.source} — ${image.alt?.substring(0, 60) || query}`);
      } else {
        console.log(`   ⚠️ Image "${position}": aucun résultat pour "${query}"`);
      }
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────
  // UNSPLASH
  // ─────────────────────────────────────────────────────────

  async searchUnsplash(query, options = {}) {
    const { minWidth = 800, orientation = 'landscape' } = options;
    this.requestCounts.unsplash++;

    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('client_id', UNSPLASH_API_KEY);
    url.searchParams.set('per_page', '15');
    url.searchParams.set('orientation', orientation);
    url.searchParams.set('content_filter', 'high'); // Safe content only

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(`Unsplash rate limit (${this.requestCounts.unsplash} req this session)`);
      }
      throw new Error(`Unsplash HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) return null;

    // Filtrer par taille minimum et images non-utilisées
    const candidates = data.results.filter(photo =>
      photo.width >= minWidth && !this.isUsed(`unsplash_${photo.id}`)
    );

    if (candidates.length === 0) return null;

    // Prendre une image parmi les 5 premiers résultats (les plus pertinents)
    const photo = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];

    // Unsplash requiert de tracker le download pour les stats
    if (photo.links?.download_location) {
      fetch(`${photo.links.download_location}?client_id=${UNSPLASH_API_KEY}`).catch(() => {});
    }

    return {
      url: photo.urls.regular, // 1080px wide
      width: photo.width,
      height: photo.height,
      alt: photo.alt_description || photo.description || query,
      photographer: photo.user.name,
      photographerUrl: photo.user.links.html,
      source: 'unsplash',
      sourceUrl: 'https://unsplash.com',
      sourceId: `unsplash_${photo.id}`,
      license: 'Unsplash License'
    };
  }

  // ─────────────────────────────────────────────────────────
  // FLICKR CC-BY
  // ─────────────────────────────────────────────────────────

  async searchFlickr(query, options = {}) {
    const { minWidth = 800 } = options;
    this.requestCounts.flickr++;

    const url = new URL('https://api.flickr.com/services/rest/');
    url.searchParams.set('method', 'flickr.photos.search');
    url.searchParams.set('api_key', FLICKR_API_KEY);
    url.searchParams.set('text', query);
    url.searchParams.set('license', FLICKR_COMMERCIAL_LICENSES);
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('per_page', '20');
    url.searchParams.set('media', 'photos');
    url.searchParams.set('content_type', '1'); // Photos only (no screenshots)
    url.searchParams.set('extras', 'owner_name,url_c,url_l,url_o,o_dims,license,views');
    url.searchParams.set('format', 'json');
    url.searchParams.set('nojsoncallback', '1');

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Flickr HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.stat !== 'ok' || !data.photos?.photo?.length) return null;

    // Filtrer : images avec URL large disponible, non-utilisées, taille suffisante
    const candidates = data.photos.photo.filter(photo => {
      const imgUrl = photo.url_l || photo.url_c;
      if (!imgUrl) return false;
      if (this.isUsed(`flickr_${photo.id}`)) return false;
      // Preferer les photos avec des vues (indicateur de qualité)
      return true;
    });

    if (candidates.length === 0) return null;

    // Trier par vues (qualité proxy) et prendre parmi les top 5
    candidates.sort((a, b) => (parseInt(b.views) || 0) - (parseInt(a.views) || 0));
    const photo = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];

    const imgUrl = photo.url_l || photo.url_c;
    const licenseLabel = FLICKR_LICENSE_LABELS[photo.license] || 'CC BY';

    return {
      url: imgUrl,
      width: parseInt(photo.width_l || photo.width_c) || 1024,
      height: parseInt(photo.height_l || photo.height_c) || 683,
      alt: photo.title || query,
      photographer: photo.ownername,
      photographerUrl: `https://www.flickr.com/people/${photo.owner}/`,
      source: 'flickr',
      sourceUrl: `https://www.flickr.com/photos/${photo.owner}/${photo.id}/`,
      sourceId: `flickr_${photo.id}`,
      license: licenseLabel
    };
  }

  // ─────────────────────────────────────────────────────────
  // PEXELS (fallback)
  // ─────────────────────────────────────────────────────────

  async searchPexels(query, options = {}) {
    const { minWidth = 800, orientation = 'landscape' } = options;
    this.requestCounts.pexels++;

    const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=${orientation}`, {
      headers: { 'Authorization': PEXELS_API_KEY }
    });

    if (!response.ok) {
      throw new Error(`Pexels HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.photos || data.photos.length === 0) return null;

    // Filtrer images non-utilisées
    const candidates = data.photos.filter(photo =>
      photo.width >= minWidth && !this.isUsed(`pexels_${photo.id}`)
    );

    if (candidates.length === 0) return null;

    const photo = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];

    return {
      url: photo.src.large, // 940px wide
      width: photo.width,
      height: photo.height,
      alt: photo.alt || query,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      source: 'pexels',
      sourceUrl: 'https://www.pexels.com',
      sourceId: `pexels_${photo.id}`,
      license: 'Pexels License'
    };
  }

  // ─────────────────────────────────────────────────────────
  // DEDUPLICATION
  // ─────────────────────────────────────────────────────────

  _loadUsedImages() {
    try {
      if (existsSync(USED_IMAGES_PATH)) {
        return new Set(JSON.parse(readFileSync(USED_IMAGES_PATH, 'utf-8')));
      }
    } catch (e) {
      console.warn('⚠️ ImageSourceManager: Erreur lecture used-images.json:', e.message);
    }
    return new Set();
  }

  isUsed(sourceId) {
    return this.usedImages.has(sourceId);
  }

  markUsed(sourceId, source) {
    this.usedImages.add(sourceId);
    this._saveUsedImages();
  }

  _saveUsedImages() {
    try {
      writeFileSync(USED_IMAGES_PATH, JSON.stringify([...this.usedImages], null, 2));
    } catch (e) {
      console.warn('⚠️ ImageSourceManager: Erreur écriture used-images.json:', e.message);
    }
  }

  /**
   * Migration one-time: importer les IDs Pexels existants
   */
  migrateFromPexelsJson() {
    try {
      const oldPath = join(__dirname, 'used-pexels-images.json');
      if (existsSync(oldPath)) {
        const oldData = JSON.parse(readFileSync(oldPath, 'utf-8'));
        let migrated = 0;
        for (const entry of oldData) {
          // Les anciennes entrées sont soit des URLs soit des IDs numériques
          if (/^\d+$/.test(entry)) {
            this.usedImages.add(`pexels_${entry}`);
            migrated++;
          }
        }
        if (migrated > 0) {
          this._saveUsedImages();
          console.log(`   📦 Migration: ${migrated} images Pexels importées dans used-images.json`);
        }
      }
    } catch (e) {
      // Silencieux si le fichier n'existe pas
    }
  }

  // ─────────────────────────────────────────────────────────
  // HTML GENERATION
  // ─────────────────────────────────────────────────────────

  /**
   * Génère le HTML <figure> pour une image avec attribution correcte par source
   * @param {Object} image - Image au format unifié
   * @returns {string} HTML figure
   */
  static generateFigureHtml(image) {
    const { url, width, height, alt, photographer, photographerUrl, source, sourceUrl, license } = image;

    // Calculer dimensions proportionnelles (max 800px wide)
    const displayWidth = Math.min(width, 800);
    const displayHeight = Math.round((displayWidth / width) * height);

    const escapedAlt = (alt || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let attribution = '';
    switch (source) {
      case 'unsplash':
        // Unsplash API Terms: link to photographer profile + link to Unsplash
        attribution = `Photo\u00a0: <a href="${photographerUrl}?utm_source=flashvoyage&utm_medium=referral" target="_blank" rel="noopener">${escapeHtml(photographer)}</a> / <a href="https://unsplash.com/?utm_source=flashvoyage&utm_medium=referral" target="_blank" rel="noopener">Unsplash</a>`;
        break;
      case 'flickr':
        // CC-BY: photographer name + link to original + license mention + SmugMug disclaimer (Flickr API ToS §3)
        attribution = `Photo\u00a0: <a href="${sourceUrl}" target="_blank" rel="noopener nofollow">${escapeHtml(photographer)}</a> / <a href="https://www.flickr.com" target="_blank" rel="noopener nofollow">Flickr</a> — ${license}`;
        break;
      case 'pexels':
        // Pexels: credit recommended
        attribution = `Photo\u00a0: ${escapeHtml(photographer)} / <a href="https://www.pexels.com" target="_blank" rel="noopener nofollow">Pexels</a>`;
        break;
      default:
        attribution = `Photo\u00a0: ${escapeHtml(photographer || 'Inconnu')}`;
    }

    // Flickr API ToS §3: mention obligatoire SmugMug sur les pages utilisant l'API Flickr
    const flickrDisclaimer = source === 'flickr'
      ? `\n  <small class="fv-flickr-disclaimer" style="display:block;font-size:0.7em;color:#888;margin-top:2px;">Ce produit utilise l'API Flickr mais n'est ni approuvé ni certifié par SmugMug, Inc.</small>`
      : '';

    return `
<figure class="fv-inline-image" data-position="${image.position || 'mid'}" data-source="${source}">
  <img src="${url}" alt="${escapedAlt}" loading="lazy" width="${displayWidth}" height="${displayHeight}" />
  <figcaption>${attribution}</figcaption>${flickrDisclaimer}
</figure>`.trim();
  }
}

/**
 * Escape HTML basique
 */
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
