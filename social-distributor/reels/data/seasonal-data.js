/**
 * Seasonal Data — FlashVoyage Reels (best-time format)
 *
 * Per-country seasonal info used by the best-time reel generator.
 * Data model, for each country:
 *
 *   - best_period    : string (e.g. "Nov-Fév") — the main recommended window
 *   - avoid_period   : string or null — explicit "avoid this" (mousson, typhons, ...)
 *   - sweet_spot     : string or null — shoulder season value tip (cheaper + still OK)
 *   - sweet_spot_why : string or null — short reason ("moins cher", "moins de foule", ...)
 *
 * Regions map (REGIONS) bundles countries into a coherent reel theme.
 *
 * ⚠ This file is intentionally separate from country-facts.js to avoid
 * coupling the versus generator with seasonal nuances.
 *
 * lastVerified: 2026-04-06
 */

export const SEASONAL_DATA_LAST_VERIFIED = '2026-04-06';

export const SEASONAL_DATA = {
  thailande: {
    best_period: 'Nov-Fév',
    avoid_period: 'Sep-Oct',
    avoid_why: 'mousson lourde',
    sweet_spot: 'Mars',
    sweet_spot_why: 'moins de foule',
  },
  vietnam: {
    best_period: 'Oct-Avr',
    avoid_period: 'Juil-Août',
    avoid_why: 'typhons Nord',
    sweet_spot: 'Nov',
    sweet_spot_why: 'prix bas',
  },
  indonesie: {
    best_period: 'Avr-Oct',
    avoid_period: 'Déc-Fév',
    avoid_why: 'pluies lourdes',
    sweet_spot: 'Mai',
    sweet_spot_why: 'shoulder',
  },
  cambodge: {
    best_period: 'Nov-Fév',
    avoid_period: 'Juin-Sep',
    avoid_why: 'Mékong en crue',
    sweet_spot: 'Mars',
    sweet_spot_why: 'moins cher',
  },
  philippines: {
    best_period: 'Déc-Avr',
    avoid_period: 'Sep-Oct',
    avoid_why: 'typhons',
    sweet_spot: 'Mai',
    sweet_spot_why: 'prix bas',
  },
  malaisie: {
    best_period: 'Mars-Oct',
    avoid_period: 'Nov-Fév',
    avoid_why: 'mousson Est',
    sweet_spot: 'Avr',
    sweet_spot_why: 'début sec',
  },
  laos: {
    best_period: 'Oct-Avr',
    avoid_period: 'Juin-Sep',
    avoid_why: 'mousson',
    sweet_spot: 'Oct',
    sweet_spot_why: 'post-mousson',
  },
  singapour: {
    best_period: 'Fév-Avr',
    avoid_period: 'Nov-Jan',
    avoid_why: 'pluies',
    sweet_spot: 'Mars',
    sweet_spot_why: 'moins humide',
  },
  japon: {
    best_period: 'Mars-Mai',
    avoid_period: 'Juin-Juil',
    avoid_why: 'saison des pluies',
    sweet_spot: 'Nov',
    sweet_spot_why: 'momiji, moins cher',
  },
  coree_du_sud: {
    best_period: 'Avr-Juin',
    avoid_period: 'Juil-Août',
    avoid_why: 'pluies + chaleur',
    sweet_spot: 'Oct',
    sweet_spot_why: 'automne doré',
  },
};

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
