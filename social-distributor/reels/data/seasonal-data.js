/**
 * Seasonal Data — FlashVoyage Reels (best-time format)
 *
 * Per-country seasonal info used by the best-time reel generator.
 * Data model, for each country:
 *
 *   String fields (for captions and logs):
 *   - best_period    : string (e.g. "Nov-Fév") — main recommended window
 *   - avoid_period   : string or null — explicit "avoid this" (mousson, typhons, ...)
 *   - avoid_why      : string or null — short reason for the avoid
 *   - sweet_spot     : string or null — shoulder season month (cheaper + still OK)
 *   - sweet_spot_why : string or null — short reason
 *
 *   Numeric month arrays (for the calendar/timeline visual, 1=Jan … 12=Dec):
 *   - best_months    : number[] — all months considered best for this country
 *   - avoid_months   : number[] — months to explicitly avoid
 *   - sweet_months   : number[] — shoulder season optima (overrides best in visual)
 *
 * The 3 month arrays drive the Gantt-style calendar reel. The string
 * versions remain authoritative for human-facing captions. Priority in the
 * visual: sweet > best > avoid > neutral.
 *
 * Regions map (REGIONS) bundles countries into a coherent reel theme.
 *
 * ⚠ This file is intentionally separate from country-facts.js to avoid
 * coupling the versus generator with seasonal nuances.
 *
 * lastVerified: 2026-04-06
 */

export const SEASONAL_DATA_LAST_VERIFIED = '2026-04-06';

export const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
export const MONTH_NAMES_FR = ['Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export const SEASONAL_DATA = {
  thailande: {
    best_period: 'Nov-Fév',
    best_months: [11, 12, 1, 2],
    avoid_period: 'Sep-Oct',
    avoid_months: [9, 10],
    avoid_why: 'mousson lourde',
    sweet_spot: 'Mars',
    sweet_months: [3],
    sweet_spot_why: 'moins de foule',
  },
  vietnam: {
    best_period: 'Oct-Avr',
    best_months: [10, 11, 12, 1, 2, 3, 4],
    avoid_period: 'Juil-Août',
    avoid_months: [7, 8],
    avoid_why: 'typhons Nord',
    sweet_spot: 'Nov',
    sweet_months: [11],
    sweet_spot_why: 'prix bas',
  },
  indonesie: {
    best_period: 'Avr-Oct',
    best_months: [4, 5, 6, 7, 8, 9, 10],
    avoid_period: 'Déc-Fév',
    avoid_months: [12, 1, 2],
    avoid_why: 'pluies lourdes',
    sweet_spot: 'Mai',
    sweet_months: [5],
    sweet_spot_why: 'shoulder',
  },
  cambodge: {
    best_period: 'Nov-Fév',
    best_months: [11, 12, 1, 2],
    avoid_period: 'Juin-Sep',
    avoid_months: [6, 7, 8, 9],
    avoid_why: 'Mékong en crue',
    sweet_spot: 'Mars',
    sweet_months: [3],
    sweet_spot_why: 'moins cher',
  },
  philippines: {
    best_period: 'Déc-Avr',
    best_months: [12, 1, 2, 3, 4],
    avoid_period: 'Sep-Oct',
    avoid_months: [9, 10],
    avoid_why: 'typhons',
    sweet_spot: 'Mai',
    sweet_months: [5],
    sweet_spot_why: 'prix bas',
  },
  malaisie: {
    best_period: 'Mars-Oct',
    best_months: [3, 4, 5, 6, 7, 8, 9, 10],
    avoid_period: 'Nov-Fév',
    avoid_months: [11, 12, 1, 2],
    avoid_why: 'mousson Est',
    sweet_spot: 'Avr',
    sweet_months: [4],
    sweet_spot_why: 'début sec',
  },
  laos: {
    best_period: 'Oct-Avr',
    best_months: [10, 11, 12, 1, 2, 3, 4],
    avoid_period: 'Juin-Sep',
    avoid_months: [6, 7, 8, 9],
    avoid_why: 'mousson',
    sweet_spot: 'Oct',
    sweet_months: [10],
    sweet_spot_why: 'post-mousson',
  },
  singapour: {
    best_period: 'Fév-Avr',
    best_months: [2, 3, 4],
    avoid_period: 'Nov-Jan',
    avoid_months: [11, 12, 1],
    avoid_why: 'pluies',
    sweet_spot: 'Mars',
    sweet_months: [3],
    sweet_spot_why: 'moins humide',
  },
  japon: {
    best_period: 'Mars-Mai, Sep-Nov',
    best_months: [3, 4, 5, 9, 10, 11], // cerisiers + momiji (2 pics)
    avoid_period: 'Juin-Juil',
    avoid_months: [6, 7],
    avoid_why: 'saison des pluies',
    sweet_spot: 'Nov',
    sweet_months: [11],
    sweet_spot_why: 'momiji, moins cher',
  },
  coree_du_sud: {
    best_period: 'Avr-Juin, Sep-Oct',
    best_months: [4, 5, 6, 9, 10], // printemps + automne
    avoid_period: 'Juil-Août',
    avoid_months: [7, 8],
    avoid_why: 'pluies + chaleur',
    sweet_spot: 'Oct',
    sweet_months: [10],
    sweet_spot_why: 'automne doré',
  },
};

/**
 * Build a 12-slot status timeline for a country from its seasonal data.
 * Returns an array of strings: 'best' | 'avoid' | 'sweet' | 'ok', one per
 * month (index 0 = January).
 *
 * Priority (later overrides earlier): avoid → best → sweet.
 * So sweet_months win, best_months beat avoid_months.
 *
 * @param {Object} seasonal - A SEASONAL_DATA entry
 * @returns {string[]} 12-element array
 */
export function buildMonthlyTimeline(seasonal) {
  const timeline = Array(12).fill('ok');
  (seasonal?.avoid_months || []).forEach((m) => {
    if (m >= 1 && m <= 12) timeline[m - 1] = 'avoid';
  });
  (seasonal?.best_months || []).forEach((m) => {
    if (m >= 1 && m <= 12) timeline[m - 1] = 'best';
  });
  (seasonal?.sweet_months || []).forEach((m) => {
    if (m >= 1 && m <= 12) timeline[m - 1] = 'sweet';
  });
  return timeline;
}

/**
 * Regions: a coherent set of countries for a "best time to visit [zone]" reel.
 * Each region has a display title and a list of country keys (must exist in
 * SEASONAL_DATA).
 */
export const REGIONS = {
  sea: {
    id: 'sea',
    title: 'Quand partir en\nAsie du Sud-Est',
    hook: 'Partir en Asie ? Le vrai calendrier.',
    countries: ['thailande', 'vietnam', 'indonesie', 'cambodge', 'philippines', 'malaisie'],
  },
  sea_extended: {
    id: 'sea_extended',
    title: 'Quand partir en\nAsie (le vrai guide)',
    hook: 'Partir en Asie ? Voici QUAND, pas OÙ.',
    countries: ['thailande', 'vietnam', 'japon', 'coree_du_sud', 'indonesie', 'philippines'],
  },
};

export function getRegion(id) {
  return REGIONS[id] || null;
}

export function getAllRegionIds() {
  return Object.keys(REGIONS);
}

export function getSeasonalData(countryKey) {
  return SEASONAL_DATA[countryKey] || null;
}
