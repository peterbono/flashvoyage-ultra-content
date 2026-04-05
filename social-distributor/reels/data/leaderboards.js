/**
 * Leaderboards — FlashVoyage Reels (top-10 ranking configs)
 *
 * Each leaderboard config declares:
 *   - id           : stable identifier (used for logging/scheduling)
 *   - title        : reel title text (2 lines, \n separator)
 *   - metricLabel  : short unit label shown next to each rank (e.g. "/ mois")
 *   - getValue     : function(countryKey) → numeric value from item-prices
 *   - formatValue  : function(value) → display string (e.g. "505€", "1.5€")
 *   - sort         : 'asc' (lowest wins) | 'desc' (highest wins)
 *   - filter       : optional function(countryKey) → boolean
 *
 * All values come from item-prices.js — zero hallucination. Adding a new
 * leaderboard = adding a config entry, no new data entry needed if the
 * field already exists in ITEM_PRICES.
 */

import {
  ITEM_PRICES,
  formatPrice,
  computeMonthlyTotal,
  formatMonthlyTotal,
} from './item-prices.js';
import { getCountryFacts } from './country-facts.js';

export const LEADERBOARD_CONFIGS = [
  {
    id: 'cheapest-living',
    title: 'Top 10 pays les moins chers\npour vivre en 2026',
    hook: 'Les 10 pays les moins chers du monde.',
    metricLabel: '/mois',
    getValue: (k) => computeMonthlyTotal(ITEM_PRICES[k]),
    formatValue: (v) => formatMonthlyTotal(v).replace(/\s*€$/, '€'),
    sort: 'asc',
  },
  {
    id: 'cheapest-coffee',
    title: 'Top 10 pays où un café\ncoûte presque rien',
    hook: '1€ ou 5€ pour un café ? La vraie map.',
    metricLabel: '/café',
    getValue: (k) => ITEM_PRICES[k].coffee,
    formatValue: (v) => formatPrice(v, 'coffee'),
    sort: 'asc',
  },
  {
    id: 'cheapest-beer',
    title: 'Top 10 pays où la bière\ncoûte le moins cher',
    hook: 'La bière la moins chère du monde, ici.',
    metricLabel: '/pression',
    getValue: (k) => ITEM_PRICES[k].beer,
    formatValue: (v) => formatPrice(v, 'beer'),
    sort: 'asc',
  },
  {
    id: 'cheapest-hotel',
    title: 'Top 10 pays où une nuit\nd\'hôtel coûte moins de 30€',
    hook: '30€ la nuit dans un 3★. C\'est possible.',
    metricLabel: '/nuit',
    getValue: (k) => ITEM_PRICES[k].hotel,
    formatValue: (v) => formatPrice(v, 'hotel'),
    sort: 'asc',
    filter: (k) => ITEM_PRICES[k].hotel < 50,
  },
  {
    id: 'cheapest-massage',
    title: 'Top 10 pays où un massage\ncoûte 10x moins qu\'en France',
    hook: '80€ le massage en France. 6€ ici.',
    metricLabel: '/heure',
    getValue: (k) => ITEM_PRICES[k].massage,
    formatValue: (v) => formatPrice(v, 'massage'),
    sort: 'asc',
  },
  {
    id: 'cheapest-rent',
    title: 'Top 10 pays où un studio\ncoûte moins de 400€/mois',
    hook: '400€ pour un studio centre-ville. Trouve l\'erreur.',
    metricLabel: '/mois',
    getValue: (k) => ITEM_PRICES[k].rent,
    formatValue: (v) => formatPrice(v, 'rent'),
    sort: 'asc',
    filter: (k) => ITEM_PRICES[k].rent < 500,
  },
];

/**
 * Get a leaderboard config by id, or return null.
 */
export function getLeaderboardConfig(id) {
  return LEADERBOARD_CONFIGS.find((c) => c.id === id) || null;
}

/**
 * Build the ranked top-10 for a given leaderboard config.
 *
 * Iterates every country in ITEM_PRICES (except France), applies the
 * config's filter if any, sorts by getValue according to config.sort,
 * keeps the top 10. Returns items enriched with display name + flag from
 * country-facts.js.
 *
 * @param {Object} config - A LEADERBOARD_CONFIGS entry
 * @returns {Array<{ key, displayName, flag, rawValue, display }>}
 */
export function buildLeaderboard(config) {
  const countries = Object.keys(ITEM_PRICES).filter((k) => k !== 'france');
  const items = countries
    .filter((k) => (config.filter ? config.filter(k) : true))
    .map((key) => {
      const facts = getCountryFacts(key);
      const rawValue = config.getValue(key);
      return {
        key,
        displayName: facts?.displayName || key,
        flag: facts?.flag || '🌍',
        rawValue,
        display: config.formatValue(rawValue),
      };
    })
    .filter((item) => item.rawValue != null && !Number.isNaN(item.rawValue))
    .sort((a, b) =>
      config.sort === 'asc' ? a.rawValue - b.rawValue : b.rawValue - a.rawValue
    )
    .slice(0, 10);

  return items;
}
