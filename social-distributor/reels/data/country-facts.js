/**
 * Country Facts — FlashVoyage Reels (source of truth for versus comparisons)
 *
 * Verified reference data used by the versus-composer to prevent Haiku
 * hallucinations on budget / visa / period / top spots / activities.
 *
 * Haiku's job is ONLY to:
 *   1. Identify the 2 countries the article compares (or picks the 2 most
 *      prominent if only one is covered).
 *   2. Optionally pick contextual spots/activities mentioned in the article.
 *
 * All numerical / factual fields (budget, visa, period) ALWAYS come from
 * this file — never from the LLM.
 *
 * ⚠ MAINTENANCE: visa rules change. Review this file every 6 months or
 * after any major bilateral agreement change. lastVerified below.
 *
 * Pre-formatted strings: top_spots and activities are already joined and
 * kept ≤25 chars to fit the infographic cell width. Don't re-format at
 * runtime — edit the string here directly if a spot or activity changes.
 */

export const COUNTRY_FACTS_LAST_VERIFIED = '2026-04-06';

// ── Canonical country data ──────────────────────────────────────────────────

export const COUNTRY_FACTS = {
  // ── Southeast Asia core ────────────────────────────────────────────────
  thailande: {
    displayName: 'Thaïlande',
    flag: '🇹🇭',
    budget_2weeks: '600-900 €/2 sem',
    visa_fr: 'Exempt 60 jours',
    best_period: 'Nov-Fév',
    top_spots: 'Bangkok, Chiang Mai',
    activities: 'Street food, îles',
    pexels_query: 'thailand temple beach aerial',
  },
  vietnam: {
    displayName: 'Vietnam',
    flag: '🇻🇳',
    budget_2weeks: '500-750 €/2 sem',
    visa_fr: 'E-visa 90 jours',
    best_period: 'Oct-Avr',
    top_spots: 'Hanoï, Hoi An, Ha Long',
    activities: 'Pho, moto Ha Giang',
    pexels_query: 'vietnam halong bay rice terraces',
  },
  indonesie: {
    displayName: 'Indonésie',
    flag: '🇮🇩',
    budget_2weeks: '600-900 €/2 sem',
    visa_fr: 'VOA 30j (35 €)',
    best_period: 'Avr-Oct',
    top_spots: 'Bali, Lombok, Java',
    activities: 'Surf, temples, volcans',
    pexels_query: 'bali temple rice terraces ubud',
  },
  cambodge: {
    displayName: 'Cambodge',
    flag: '🇰🇭',
    budget_2weeks: '500-700 €/2 sem',
    visa_fr: 'E-visa 30j (36 €)',
    best_period: 'Nov-Fév',
    top_spots: 'Siem Reap, Koh Rong',
    activities: 'Angkor, plages',
    pexels_query: 'cambodia angkor wat temple sunrise',
  },
  laos: {
    displayName: 'Laos',
    flag: '🇱🇦',
    budget_2weeks: '550-750 €/2 sem',
    visa_fr: 'VOA 30j (30 €)',
    best_period: 'Oct-Avr',
    top_spots: 'Luang Prabang, Vang Vieng',
    activities: 'Mékong, cascades',
    pexels_query: 'laos luang prabang mekong river',
  },
  myanmar: {
    displayName: 'Myanmar',
    flag: '🇲🇲',
    budget_2weeks: '600-800 €/2 sem',
    visa_fr: 'E-visa 28j (50 €)',
    best_period: 'Nov-Fév',
    top_spots: 'Bagan, Inle, Yangon',
    activities: 'Temples, ballons',
    pexels_query: 'myanmar bagan temples balloons sunrise',
  },
  malaisie: {
    displayName: 'Malaisie',
    flag: '🇲🇾',
    budget_2weeks: '700-1000 €/2 sem',
    visa_fr: 'Exempt 90 jours',
    best_period: 'Mars-Oct',
    top_spots: 'KL, Penang, Borneo',
    activities: 'Jungle, street food',
    pexels_query: 'malaysia kuala lumpur petronas skyline',
  },
  singapour: {
    displayName: 'Singapour',
    flag: '🇸🇬',
    budget_2weeks: '1400-1900 €/2 sem',
    visa_fr: 'Exempt 90 jours',
    best_period: 'Toute année',
    top_spots: 'Marina Bay, Sentosa',
    activities: 'Skyline, food courts',
    pexels_query: 'singapore marina bay skyline night',
  },
  philippines: {
    displayName: 'Philippines',
    flag: '🇵🇭',
    budget_2weeks: '700-1000 €/2 sem',
    visa_fr: 'Exempt 30 jours',
    best_period: 'Déc-Mai',
    top_spots: 'Palawan, Cebu, Bohol',
    activities: 'Plongée, îles',
    pexels_query: 'philippines palawan el nido beach',
  },

  // ── East Asia ──────────────────────────────────────────────────────────
  japon: {
    displayName: 'Japon',
    flag: '🇯🇵',
    budget_2weeks: '1500-2200 €/2 sem',
    visa_fr: 'Exempt 90 jours',
    best_period: 'Mars-Mai, Sep-Nov',
    top_spots: 'Tokyo, Kyoto, Osaka',
    activities: 'Sushi, temples, onsen',
    pexels_query: 'japan kyoto temple cherry blossoms',
  },
  coree_du_sud: {
    displayName: 'Corée du Sud',
    flag: '🇰🇷',
    budget_2weeks: '1200-1700 €/2 sem',
    visa_fr: 'K-ETA + 90 jours',
    best_period: 'Avr-Juin, Sep-Nov',
    top_spots: 'Séoul, Busan, Jeju',
    activities: 'K-pop, BBQ, hanok',
    pexels_query: 'south korea seoul gyeongbokgung palace',
  },
  taiwan: {
    displayName: 'Taïwan',
    flag: '🇹🇼',
    budget_2weeks: '900-1300 €/2 sem',
    visa_fr: 'Exempt 90 jours',
    best_period: 'Oct-Avr',
    top_spots: 'Taipei, Taroko, Kenting',
    activities: 'Marchés nuit, randos',
    pexels_query: 'taiwan taipei 101 night market',
  },
  chine: {
    displayName: 'Chine',
    flag: '🇨🇳',
    budget_2weeks: '900-1400 €/2 sem',
    visa_fr: 'Exempt 15j (2024+)',
    best_period: 'Avr-Juin, Sep-Oct',
    top_spots: 'Pékin, Shanghai, Guilin',
    activities: 'Muraille, histoire',
    pexels_query: 'china great wall beijing forbidden city',
  },

  // ── South Asia ─────────────────────────────────────────────────────────
  inde: {
    displayName: 'Inde',
    flag: '🇮🇳',
    budget_2weeks: '500-800 €/2 sem',
    visa_fr: 'E-visa requis',
    best_period: 'Oct-Mars',
    top_spots: 'Rajasthan, Goa, Kerala',
    activities: 'Temples, épices',
    pexels_query: 'india taj mahal rajasthan palaces',
  },
  sri_lanka: {
    displayName: 'Sri Lanka',
    flag: '🇱🇰',
    budget_2weeks: '600-900 €/2 sem',
    visa_fr: 'ETA 30j (50 €)',
    best_period: 'Déc-Mars',
    top_spots: 'Kandy, Ella, Mirissa',
    activities: 'Trains, thé, plages',
    pexels_query: 'sri lanka ella nine arches train',
  },
  nepal: {
    displayName: 'Népal',
    flag: '🇳🇵',
    budget_2weeks: '500-800 €/2 sem',
    visa_fr: 'VOA 30j (40 €)',
    best_period: 'Oct-Nov, Mars-Mai',
    top_spots: 'Kathmandu, Pokhara, ABC',
    activities: 'Treks, sommets',
    pexels_query: 'nepal himalaya annapurna trekking',
  },
  maldives: {
    displayName: 'Maldives',
    flag: '🇲🇻',
    budget_2weeks: '2000-3500 €/2 sem',
    visa_fr: 'Exempt 30 jours',
    best_period: 'Nov-Avr',
    top_spots: 'Malé, Ari, Baa',
    activities: 'Plongée, resorts',
    pexels_query: 'maldives overwater bungalow turquoise',
  },

  // ── Other popular destinations ─────────────────────────────────────────
  turquie: {
    displayName: 'Turquie',
    flag: '🇹🇷',
    budget_2weeks: '700-1100 €/2 sem',
    visa_fr: 'Exempt 90 jours',
    best_period: 'Avr-Juin, Sep-Oct',
    top_spots: 'Istanbul, Cappadoce',
    activities: 'Bazars, ruines',
    pexels_query: 'turkey cappadocia balloons istanbul',
  },
  maroc: {
    displayName: 'Maroc',
    flag: '🇲🇦',
    budget_2weeks: '700-1000 €/2 sem',
    visa_fr: 'Exempt 90 jours',
    best_period: 'Mars-Mai, Sep-Nov',
    top_spots: 'Marrakech, Chefchaouen',
    activities: 'Médinas, désert',
    pexels_query: 'morocco marrakech medina sahara desert',
  },
  mexique: {
    displayName: 'Mexique',
    flag: '🇲🇽',
    budget_2weeks: '900-1400 €/2 sem',
    visa_fr: 'Exempt 180 jours',
    best_period: 'Nov-Avr',
    top_spots: 'Mexico, Tulum, Oaxaca',
    activities: 'Cenotes, ruines',
    pexels_query: 'mexico tulum cenote mayan ruins',
  },
  perou: {
    displayName: 'Pérou',
    flag: '🇵🇪',
    budget_2weeks: '900-1300 €/2 sem',
    visa_fr: 'Exempt 183 jours',
    best_period: 'Mai-Sep',
    top_spots: 'Cusco, Machu Picchu',
    activities: 'Incas, Andes',
    pexels_query: 'peru machu picchu cusco sacred valley',
  },
  emirats: {
    displayName: 'Émirats',
    flag: '🇦🇪',
    budget_2weeks: '1500-2200 €/2 sem',
    visa_fr: 'Exempt 90 jours',
    best_period: 'Nov-Mars',
    top_spots: 'Dubai, Abu Dhabi',
    activities: 'Shopping, désert',
    pexels_query: 'dubai burj khalifa desert marina',
  },
  australie: {
    displayName: 'Australie',
    flag: '🇦🇺',
    budget_2weeks: '1800-2800 €/2 sem',
    visa_fr: 'eVisitor gratuit',
    best_period: 'Sep-Nov, Mars-Mai',
    top_spots: 'Sydney, Melbourne, GBR',
    activities: 'Surf, outback',
    pexels_query: 'australia sydney opera house great barrier reef',
  },
  nouvelle_zelande: {
    displayName: 'Nouvelle-Zélande',
    flag: '🇳🇿',
    budget_2weeks: '1700-2500 €/2 sem',
    visa_fr: 'NZeTA (17 NZD)',
    best_period: 'Déc-Fév',
    top_spots: 'Auckland, Queenstown',
    activities: 'Randos, fjords',
    pexels_query: 'new zealand queenstown fjords milford',
  },
  portugal: {
    displayName: 'Portugal',
    flag: '🇵🇹',
    budget_2weeks: '900-1300 €/2 sem',
    visa_fr: 'UE (libre)',
    best_period: 'Avr-Oct',
    top_spots: 'Lisbonne, Porto, Algarve',
    activities: 'Pasteis, surf, fado',
    pexels_query: 'portugal lisbon porto algarve coast',
  },
};

// ── Alias map: common variants → canonical key ──────────────────────────────

const ALIASES = {
  // Thaïlande
  thailand: 'thailande', thai: 'thailande', bangkok: 'thailande',
  'chiang mai': 'thailande', phuket: 'thailande', krabi: 'thailande',
  // Vietnam
  'viet nam': 'vietnam', hanoi: 'vietnam', 'ho chi minh': 'vietnam',
  saigon: 'vietnam', 'hoi an': 'vietnam',
  // Indonésie
  bali: 'indonesie', indonesia: 'indonesie', jakarta: 'indonesie',
  lombok: 'indonesie', ubud: 'indonesie', java: 'indonesie',
  // Cambodge
  cambodia: 'cambodge', 'siem reap': 'cambodge', 'phnom penh': 'cambodge',
  angkor: 'cambodge',
  // Laos
  'luang prabang': 'laos', vientiane: 'laos',
  // Myanmar
  birmanie: 'myanmar', bagan: 'myanmar', yangon: 'myanmar',
  // Malaisie
  malaysia: 'malaisie', 'kuala lumpur': 'malaisie', penang: 'malaisie',
  borneo: 'malaisie',
  // Singapour
  singapore: 'singapour',
  // Philippines
  manille: 'philippines', manila: 'philippines', cebu: 'philippines',
  palawan: 'philippines',
  // Japon
  japan: 'japon', tokyo: 'japon', kyoto: 'japon', osaka: 'japon',
  // Corée
  coree: 'coree_du_sud', korea: 'coree_du_sud', 'corée': 'coree_du_sud',
  'south korea': 'coree_du_sud', seoul: 'coree_du_sud', 'séoul': 'coree_du_sud',
  busan: 'coree_du_sud',
  // Taiwan
  taipei: 'taiwan', 'taïwan': 'taiwan',
  // Chine
  china: 'chine', pekin: 'chine', 'pékin': 'chine', beijing: 'chine',
  shanghai: 'chine',
  // Inde
  india: 'inde', rajasthan: 'inde', goa: 'inde', kerala: 'inde',
  delhi: 'inde', mumbai: 'inde',
  // Sri Lanka
  colombo: 'sri_lanka', ella: 'sri_lanka', kandy: 'sri_lanka',
  // Népal
  'népal': 'nepal', katmandou: 'nepal', kathmandu: 'nepal', pokhara: 'nepal',
  // Turquie
  turkey: 'turquie', 'türkiye': 'turquie', istanbul: 'turquie',
  cappadoce: 'turquie', cappadocia: 'turquie',
  // Maroc
  morocco: 'maroc', marrakech: 'maroc', fes: 'maroc',
  // Mexique
  mexico: 'mexique', tulum: 'mexique', cancun: 'mexique', oaxaca: 'mexique',
  // Pérou
  peru: 'perou', 'pérou': 'perou', cusco: 'perou', 'machu picchu': 'perou',
  // Émirats
  dubai: 'emirats', 'abu dhabi': 'emirats', 'émirats': 'emirats', uae: 'emirats',
  // Australie
  australia: 'australie', sydney: 'australie', melbourne: 'australie',
  // NZ
  'new zealand': 'nouvelle_zelande', 'nouvelle-zelande': 'nouvelle_zelande',
  'nouvelle-zélande': 'nouvelle_zelande', auckland: 'nouvelle_zelande',
  queenstown: 'nouvelle_zelande',
  // Portugal
  lisbonne: 'portugal', lisbon: 'portugal', porto: 'portugal',
  algarve: 'portugal',
};

// ── Lookup API ──────────────────────────────────────────────────────────────

/**
 * Normalize a country / city name and return the canonical key.
 * Returns null if the name is unknown.
 */
function resolveKey(name) {
  if (!name) return null;
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // Direct hit on canonical key
  if (COUNTRY_FACTS[normalized]) return normalized;

  // Alias hit (also normalized)
  const normalizedAliases = {};
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    const n = alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    normalizedAliases[n] = canonical;
  }
  if (normalizedAliases[normalized]) return normalizedAliases[normalized];

  // Substring fallback: if the query contains a known country/alias as a word
  for (const key of Object.keys(COUNTRY_FACTS)) {
    if (normalized.includes(key)) return key;
  }
  for (const [alias, canonical] of Object.entries(normalizedAliases)) {
    if (normalized.includes(alias)) return canonical;
  }

  return null;
}

/**
 * Look up verified facts for a country by name (accepts aliases and cities).
 * Returns null if the country is not in the whitelist.
 *
 * @param {string} name - Country or city name (FR or EN)
 * @returns {Object|null} { displayName, flag, budget_2weeks, visa_fr, best_period, top_spots, activities, pexels_query }
 */
export function getCountryFacts(name) {
  const key = resolveKey(name);
  return key ? { key, ...COUNTRY_FACTS[key] } : null;
}

/**
 * Return the list of canonical display names — used to constrain Haiku's
 * destination picks so it can only return countries we have data for.
 *
 * @returns {string[]}
 */
export function getKnownCountryNames() {
  return Object.values(COUNTRY_FACTS).map((c) => c.displayName);
}

/**
 * Return all canonical keys (useful for tests).
 */
export function getKnownCountryKeys() {
  return Object.keys(COUNTRY_FACTS);
}
