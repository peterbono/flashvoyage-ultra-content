#!/usr/bin/env node

/**
 * TRAVELPAYOUTS PARTNER LINKS API CLIENT
 * Converts direct brand URLs into tracked affiliate links via the Travelpayouts API.
 * Used for contextual CTA links in article body (complements shortcode widgets).
 *
 * API docs: https://support.travelpayouts.com/hc/en-us/articles/25289759198226
 * Rate limit: 100 requests/min, max 10 links per request.
 * Excluded brands: Kiwi.com, Expedia UK, HolidayTaxis, Ticketmaster, Priority Pass, Indrive.
 */

import axios from 'axios';
import { TRAVELPAYOUTS_API_TOKEN, TRAVELPAYOUTS_TRS, TRAVELPAYOUTS_MARKER } from './config.js';

const API_URL = 'https://api.travelpayouts.com/links/v1/create';

/**
 * Convert an array of direct brand URLs into affiliate partner links.
 * @param {Array<{url: string, sub_id?: string}>} links - URLs to convert (max 10)
 * @returns {Promise<Array<{url: string, partner_url: string, code: string}>>}
 */
export async function convertToAffiliateLinks(links) {
  if (!TRAVELPAYOUTS_API_TOKEN) {
    console.log('⚠️ TRAVELPAYOUTS_API_TOKEN manquant — liens affiliés désactivés');
    return links.map(l => ({ url: l.url, partner_url: '', code: 'no_token' }));
  }

  if (!links || links.length === 0) return [];

  // API accepts max 10 links per request
  const batch = links.slice(0, 10);

  try {
    const response = await axios.post(API_URL, {
      trs: parseInt(TRAVELPAYOUTS_TRS, 10),
      marker: parseInt(TRAVELPAYOUTS_MARKER, 10),
      shorten: true,
      links: batch
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': TRAVELPAYOUTS_API_TOKEN
      },
      timeout: 10000
    });

    if (response.data?.code === 'success' && response.data?.result?.links) {
      return response.data.result.links;
    }

    console.warn('⚠️ Travelpayouts API réponse inattendue:', response.data?.code);
    return batch.map(l => ({ url: l.url, partner_url: '', code: 'unexpected_response' }));
  } catch (error) {
    console.warn('⚠️ Travelpayouts API erreur:', error.message);
    return batch.map(l => ({ url: l.url, partner_url: '', code: 'error' }));
  }
}

// ---------------------------------------------------------------------------
// URL builders — generate direct brand URLs that the API converts to affiliate
// ---------------------------------------------------------------------------

/**
 * Build an Aviasales flight search URL.
 * Format: https://www.aviasales.com/search/{ORIGIN}{DDMM}{DEST}1
 * @param {string} origin - IATA code (e.g. "PAR")
 * @param {string} destination - IATA code (e.g. "BKK")
 * @returns {string}
 */
export function buildFlightSearchUrl(origin = 'PAR', destination = 'BKK') {
  // Use a date ~30 days from now for a realistic search URL
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const dd = String(futureDate.getDate()).padStart(2, '0');
  const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
  return `https://www.aviasales.com/search/${origin}${dd}${mm}${destination}1`;
}

/**
 * Build an Airalo eSIM page URL for a given country.
 * @param {string} country - Country name in English, lowercase (e.g. "thailand")
 * @returns {string}
 */
export function buildAiraloUrl(country = 'thailand') {
  const slug = country.toLowerCase().replace(/\s+/g, '-');
  return `https://www.airalo.com/${slug}-esim/`;
}

/**
 * Build a VisitorCoverage insurance URL.
 * @returns {string}
 */
export function buildInsuranceUrl() {
  return 'https://www.visitorcoverage.com/';
}

/**
 * Build a Booking.com search URL for a given city/country.
 * @param {string} city - City name (e.g. "Tokyo")
 * @param {string} country - Country name (e.g. "japan")
 * @returns {string}
 */
export function buildBookingUrl(city = '', country = '') {
  const query = city || country || 'Asia';
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(query)}`;
}

/**
 * Build an Insubuy insurance URL for USA visitors.
 * @returns {string}
 */
export function buildInsubuyUrl() {
  return 'https://www.insubuy.com/visitors-insurance/';
}

// ---------------------------------------------------------------------------
// High-level helper: generate all relevant CTA links for an article
// ---------------------------------------------------------------------------

/**
 * Country name mapping for Airalo URLs (common destinations).
 */
const COUNTRY_SLUG_MAP = {
  thailand: 'thailand',
  vietnam: 'vietnam',
  indonesia: 'indonesia',
  japan: 'japan',
  'south korea': 'south-korea',
  korea: 'south-korea',
  malaysia: 'malaysia',
  philippines: 'philippines',
  cambodia: 'cambodia',
  laos: 'laos',
  myanmar: 'myanmar',
  india: 'india',
  nepal: 'nepal',
  'sri lanka': 'sri-lanka',
  china: 'china',
  taiwan: 'taiwan',
  singapore: 'singapore',
};

/**
 * Generate all relevant affiliate CTA links for an article.
 * @param {Object} geoDefaults - { origin, destination, country, city }
 * @param {string} articleId - Article identifier for sub_id tracking
 * @returns {Promise<Object>} { flights, esim, insurance } with partner_url for each
 */
export async function generateArticleCTAs(geoDefaults, articleId = 'unknown') {
  const origin = geoDefaults?.origin || 'PAR';
  const destination = geoDefaults?.destination || 'BKK';
  const country = geoDefaults?.country || 'thailand';

  const city = geoDefaults?.city || '';

  const linksToConvert = [
    { url: buildFlightSearchUrl(origin, destination), sub_id: `${articleId}-flights` },
    { url: buildAiraloUrl(COUNTRY_SLUG_MAP[country.toLowerCase()] || country), sub_id: `${articleId}-esim` },
    { url: buildInsuranceUrl(), sub_id: `${articleId}-insurance` },
    { url: buildBookingUrl(city, country), sub_id: `${articleId}-hotels` }
  ];

  const results = await convertToAffiliateLinks(linksToConvert);

  const ctas = {
    flights: {
      partner_url: results[0]?.partner_url || '',
      direct_url: linksToConvert[0].url,
      label: 'Comparer les vols',
      ok: results[0]?.code === 'success'
    },
    esim: {
      partner_url: results[1]?.partner_url || '',
      direct_url: linksToConvert[1].url,
      label: 'Obtenir une eSIM',
      ok: results[1]?.code === 'success'
    },
    insurance: {
      partner_url: results[2]?.partner_url || '',
      direct_url: linksToConvert[2].url,
      label: 'Comparer les assurances voyage',
      ok: results[2]?.code === 'success'
    },
    hotels: {
      partner_url: results[3]?.partner_url || '',
      direct_url: linksToConvert[3].url,
      label: 'Réserver un hébergement',
      ok: results[3]?.code === 'success'
    }
  };

  const successCount = Object.values(ctas).filter(c => c.ok).length;
  console.log(`✅ Travelpayouts API: ${successCount}/${Object.keys(ctas).length} liens affiliés générés`);

  return ctas;
}

/**
 * Build an HTML CTA link from a CTA object.
 * Returns empty string if no partner_url available.
 * @param {Object} cta - { partner_url, direct_url, label, ok }
 * @returns {string} HTML anchor tag or empty string
 */
export function renderCTALink(cta) {
  if (!cta || !cta.partner_url) return '';
  return `<a href="${cta.partner_url}" target="_blank" rel="nofollow sponsored">${cta.label}</a>`;
}

export default {
  convertToAffiliateLinks,
  buildFlightSearchUrl,
  buildAiraloUrl,
  buildInsuranceUrl,
  buildInsubuyUrl,
  generateArticleCTAs,
  renderCTALink
};
