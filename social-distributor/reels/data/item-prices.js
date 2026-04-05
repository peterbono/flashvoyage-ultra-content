/**
 * Item Prices — FlashVoyage Reels (cost-vs format source of truth)
 *
 * Verified item-level prices used by the cost-vs reel generator to build
 * "Cost in [X] vs France" comparisons without hallucination.
 *
 * Prices are stored as plain numbers in EUR. Display strings are formatted
 * at render time by `formatPrice()` which handles suffixes (/L, /nuit, /mois).
 *
 * France = fixed reference for every comparison (Paris-level metro prices).
 *
 * Monthly "lifestyle" totals are computed at render time by multiplying each
 * item by MONTHLY_MULTIPLIERS (20 cafés/mois, 40L essence/mois, etc.).
 * Hotel is intentionally EXCLUDED from the total — it's a travel cost, not
 * a lifestyle cost. The total is what a solo resident would spend living
 * there for a month.
 *
 * ⚠ MAINTENANCE: prices drift. Review every 6-12 months or after any
 * major currency move / inflation shock. lastVerified below.
 */

export const ITEM_PRICES_LAST_VERIFIED = '2026-04-06';

/**
 * Items and the unit suffix used in the display string.
 * Order matters: this is the order rows appear in the overlay.
 */
export const ITEM_KEYS = [
  'coffee',
  'beer',
  'meal',
  'fuel',
  'massage',
  'hotel',
  'internet',
  'rent',
];

export const ITEM_METADATA = {
  coffee:   { label: 'Café expresso',         emoji: '☕', suffix: '' },
  beer:     { label: 'Bière pression 50cl',   emoji: '🍺', suffix: '' },
  meal:     { label: 'Plat au restaurant',    emoji: '🍽️', suffix: '' },
  fuel:     { label: 'Essence 1L',            emoji: '⛽', suffix: '/L' },
  massage:  { label: 'Massage 1h',            emoji: '💆', suffix: '' },
  hotel:    { label: 'Nuit hôtel 3★',         emoji: '🏨', suffix: '/nuit' },
  internet: { label: 'Internet mobile',       emoji: '📶', suffix: '/mois' },
  rent:     { label: 'Studio centre-ville',   emoji: '🏠', suffix: '/mois' },
};

/**
 * Monthly lifestyle multipliers (how many units of each item a solo
 * resident consumes per month). Tuned for a realistic "moderate" lifestyle.
 * Hotel is null = excluded from the monthly total.
 */
export const MONTHLY_MULTIPLIERS = {
  coffee: 20,    // 20 cafés / mois (expatriés du matin)
  beer: 12,      // 3 bières / semaine
  meal: 15,      // 15 repas resto / mois (le reste chez soi)
  fuel: 40,      // 40 L / mois (usage modéré)
  massage: 2,    // 2 massages / mois
  hotel: null,   // exclu du total (= coût voyage, pas lifestyle)
  internet: 1,   // 1 forfait / mois
  rent: 1,       // 1 loyer / mois
};

// ── Prices per country (all values in EUR, as of 2026-04-06) ───────────────
//
// France is the fixed reference. All other prices are benchmarked against
// Paris-level cost (= worst case for France so contrast is maximised).

export const ITEM_PRICES = {
  france: {
    coffee: 3,
    beer: 6,
    meal: 15,
    fuel: 1.85,
    massage: 80,
    hotel: 120,
    internet: 20,
    rent: 1200,
  },

  // ── Southeast Asia ──────────────────────────────────────────────────────
  thailande: {
    coffee: 1.5, beer: 2.5, meal: 3, fuel: 0.85,
    massage: 6, hotel: 25, internet: 4, rent: 350,
  },
  vietnam: {
    coffee: 1, beer: 0.8, meal: 2.5, fuel: 0.9,
    massage: 8, hotel: 20, internet: 3, rent: 300,
  },
  indonesie: {
    coffee: 2, beer: 3, meal: 4, fuel: 0.7,
    massage: 7, hotel: 30, internet: 5, rent: 400,
  },
  cambodge: {
    coffee: 1, beer: 1, meal: 2.5, fuel: 1,
    massage: 6, hotel: 20, internet: 5, rent: 300,
  },
  laos: {
    coffee: 1.2, beer: 1.5, meal: 3, fuel: 1.1,
    massage: 7, hotel: 22, internet: 7, rent: 350,
  },
  myanmar: {
    coffee: 1.2, beer: 1.8, meal: 3, fuel: 0.8,
    massage: 7, hotel: 25, internet: 8, rent: 300,
  },
  malaisie: {
    coffee: 2, beer: 4, meal: 4, fuel: 0.5,
    massage: 15, hotel: 35, internet: 7, rent: 450,
  },
  singapour: {
    coffee: 4, beer: 9, meal: 8, fuel: 2,
    massage: 40, hotel: 130, internet: 30, rent: 1800,
  },
  philippines: {
    coffee: 1.5, beer: 1.2, meal: 3, fuel: 0.95,
    massage: 8, hotel: 25, internet: 6, rent: 400,
  },

  // ── East Asia ───────────────────────────────────────────────────────────
  japon: {
    coffee: 3, beer: 5, meal: 10, fuel: 1.3,
    massage: 50, hotel: 80, internet: 25, rent: 800,
  },
  coree_du_sud: {
    coffee: 3, beer: 3, meal: 7, fuel: 1.2,
    massage: 30, hotel: 70, internet: 20, rent: 700,
  },
  taiwan: {
    coffee: 2.5, beer: 2, meal: 4, fuel: 0.8,
    massage: 20, hotel: 50, internet: 15, rent: 500,
  },
  chine: {
    coffee: 3, beer: 1.5, meal: 5, fuel: 0.9,
    massage: 15, hotel: 40, internet: 10, rent: 600,
  },

  // ── South Asia ──────────────────────────────────────────────────────────
  inde: {
    coffee: 1, beer: 2, meal: 2, fuel: 1.05,
    massage: 15, hotel: 25, internet: 5, rent: 200,
  },
  sri_lanka: {
    coffee: 1.5, beer: 2.5, meal: 3, fuel: 0.95,
    massage: 10, hotel: 25, internet: 5, rent: 300,
  },
  nepal: {
    coffee: 1, beer: 2, meal: 2.5, fuel: 1.2,
    massage: 10, hotel: 18, internet: 8, rent: 250,
  },
  maldives: {
    coffee: 4, beer: 8, meal: 20, fuel: 1.3,
    massage: 80, hotel: 300, internet: 25, rent: 1500,
  },

  // ── Popular non-Asia destinations ───────────────────────────────────────
  turquie: {
    coffee: 2, beer: 3, meal: 6, fuel: 1.3,
    massage: 15, hotel: 40, internet: 7, rent: 400,
  },
  maroc: {
    coffee: 1.5, beer: 4, meal: 5, fuel: 1.3,
    massage: 20, hotel: 35, internet: 10, rent: 350,
  },
  mexique: {
    coffee: 2, beer: 2, meal: 5, fuel: 1.1,
    massage: 25, hotel: 40, internet: 15, rent: 500,
  },
  perou: {
    coffee: 2, beer: 2, meal: 4, fuel: 1.15,
    massage: 20, hotel: 35, internet: 12, rent: 450,
  },
  emirats: {
    coffee: 4, beer: 10, meal: 15, fuel: 0.75,
    massage: 60, hotel: 100, internet: 50, rent: 1500,
  },
  australie: {
    coffee: 3.5, beer: 8, meal: 18, fuel: 1.3,
    massage: 70, hotel: 150, internet: 35, rent: 1800,
  },
  nouvelle_zelande: {
    coffee: 3, beer: 7, meal: 16, fuel: 1.7,
    massage: 65, hotel: 130, internet: 40, rent: 1500,
  },
  portugal: {
    coffee: 1, beer: 3, meal: 10, fuel: 1.75,
    massage: 40, hotel: 70, internet: 15, rent: 800,
  },
};

// ── Formatting helpers ──────────────────────────────────────────────────────

/**
 * Format a raw EUR number with the item's suffix (/L, /nuit, /mois, or none).
 *
 * Rules:
 *   - < 10 : show 1-2 decimals (1.5€, 0.85€)
 *   - ≥ 10 : round to integer (120€, 1800€)
 *   - trim trailing .0 or .00
 *
 * @param {number} eur - Price in EUR
 * @param {string} itemKey - One of ITEM_KEYS
 * @returns {string} Display string (e.g. "1.50€", "0.85€/L", "350€/mois")
 */
export function formatPrice(eur, itemKey) {
  const suffix = ITEM_METADATA[itemKey]?.suffix || '';
  let formatted;
  if (eur >= 10) {
    formatted = Math.round(eur) + '€';
  } else {
    formatted = eur.toFixed(2).replace(/\.?0+$/, '') + '€';
  }
  return formatted + suffix;
}

/**
 * Compute the total monthly lifestyle cost for a country.
 * Hotel is excluded (null multiplier). Returns an integer EUR amount.
 *
 * @param {Object} prices - A country entry from ITEM_PRICES
 * @returns {number} Monthly total in EUR, rounded to integer
 */
export function computeMonthlyTotal(prices) {
  let total = 0;
  for (const key of ITEM_KEYS) {
    const multiplier = MONTHLY_MULTIPLIERS[key];
    if (multiplier == null) continue; // hotel excluded
    const price = prices[key];
    if (price == null) continue;
    total += price * multiplier;
  }
  return Math.round(total);
}

/**
 * Format a monthly total as a readable string (e.g. "1 811 €").
 * Uses non-breaking space as thousands separator for French convention.
 *
 * @param {number} eurTotal
 * @returns {string}
 */
export function formatMonthlyTotal(eurTotal) {
  return eurTotal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F') + ' €';
}

// ── Country resolver ────────────────────────────────────────────────────────

const ALIASES = {
  thailand: 'thailande', thai: 'thailande', bangkok: 'thailande',
  'chiang mai': 'thailande', phuket: 'thailande', krabi: 'thailande',
  'viet nam': 'vietnam', hanoi: 'vietnam', 'ho chi minh': 'vietnam', saigon: 'vietnam',
  bali: 'indonesie', indonesia: 'indonesie', jakarta: 'indonesie', ubud: 'indonesie',
  cambodia: 'cambodge', 'siem reap': 'cambodge', 'phnom penh': 'cambodge',
  'luang prabang': 'laos', vientiane: 'laos',
  birmanie: 'myanmar', bagan: 'myanmar', yangon: 'myanmar',
  malaysia: 'malaisie', 'kuala lumpur': 'malaisie', penang: 'malaisie',
  singapore: 'singapour',
  manille: 'philippines', manila: 'philippines', cebu: 'philippines', palawan: 'philippines',
  japan: 'japon', tokyo: 'japon', kyoto: 'japon', osaka: 'japon',
  coree: 'coree_du_sud', korea: 'coree_du_sud', 'corée': 'coree_du_sud',
  'south korea': 'coree_du_sud', seoul: 'coree_du_sud', 'séoul': 'coree_du_sud',
  taipei: 'taiwan', 'taïwan': 'taiwan',
  china: 'chine', pekin: 'chine', 'pékin': 'chine', beijing: 'chine', shanghai: 'chine',
  india: 'inde', rajasthan: 'inde', goa: 'inde', kerala: 'inde', delhi: 'inde', mumbai: 'inde',
  colombo: 'sri_lanka', ella: 'sri_lanka', kandy: 'sri_lanka',
  'népal': 'nepal', katmandou: 'nepal', kathmandu: 'nepal',
  turkey: 'turquie', 'türkiye': 'turquie', istanbul: 'turquie',
  morocco: 'maroc', marrakech: 'maroc', fes: 'maroc',
  mexico: 'mexique', tulum: 'mexique', cancun: 'mexique', oaxaca: 'mexique',
  peru: 'perou', 'pérou': 'perou', cusco: 'perou', 'machu picchu': 'perou', lima: 'perou',
  dubai: 'emirats', 'abu dhabi': 'emirats', 'émirats': 'emirats', uae: 'emirats',
  australia: 'australie', sydney: 'australie', melbourne: 'australie',
  'new zealand': 'nouvelle_zelande', 'nouvelle-zelande': 'nouvelle_zelande',
  'nouvelle-zélande': 'nouvelle_zelande', auckland: 'nouvelle_zelande',
  lisbonne: 'portugal', lisbon: 'portugal', porto: 'portugal', algarve: 'portugal',
};

/**
 * Resolve a country or city name to its canonical key in ITEM_PRICES.
 * Returns null if the name has no price data (France included: it's the
 * reference and is keyed as 'france' which is reachable by passing 'france').
 */
export function resolvePriceKey(name) {
  if (!name) return null;
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (ITEM_PRICES[normalized]) return normalized;

  const normalizedAliases = {};
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    const n = alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    normalizedAliases[n] = canonical;
  }
  if (normalizedAliases[normalized]) return normalizedAliases[normalized];

  for (const key of Object.keys(ITEM_PRICES)) {
    if (normalized.includes(key)) return key;
  }
  for (const [alias, canonical] of Object.entries(normalizedAliases)) {
    if (normalized.includes(alias)) return canonical;
  }
  return null;
}

/**
 * Get prices for a country (excluding France which is the fixed reference).
 * Returns null if the country is unknown or is France itself.
 */
export function getItemPrices(name) {
  const key = resolvePriceKey(name);
  if (!key || key === 'france') return null;
  return { key, ...ITEM_PRICES[key] };
}

/**
 * Return all country keys that have price data (excluding France).
 */
export function getKnownPriceCountries() {
  return Object.keys(ITEM_PRICES).filter((k) => k !== 'france');
}
