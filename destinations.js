/**
 * DESTINATIONS — Module partagé de référence pour les destinations Asie.
 *
 * Source unique de vérité pour :
 *   - DESTINATION_ALIASES  : pays → [tous les alias FR/EN/villes]
 *   - CITY_TO_COUNTRY      : alias → pays (flat map dérivé)
 *   - ASIA_DESTINATIONS    : liste plate de tous les alias (pour matching)
 *   - COUNTRY_DISPLAY_NAMES: pays → nom d'affichage français
 *   - normalizeDestination : alias → pays normalisé
 *
 * Utilisé par : reddit-extraction-adapter, pipeline-runner, seo-optimizer,
 *               contextual-widget-placer-v2, enhanced-ultra-generator.
 */

/**
 * Mapping pays → tous les alias connus (noms FR/EN, villes majeures, lieux secondaires).
 * Clé = identifiant interne normalisé (anglais, minuscule).
 */
export const DESTINATION_ALIASES = {
  'japan': ['japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'nara', 'hiroshima', 'nagoya', 'fukuoka', 'magome', 'nagiso', 'nakasendo'],
  'thailand': ['thailand', 'thaïlande', 'thailande', 'bangkok', 'chiang mai', 'phuket', 'koh samui', 'koh phangan', 'krabi', 'pai'],
  'vietnam': ['vietnam', 'viêt nam', 'hanoi', 'hanoï', 'ho chi minh', 'saigon', 'saïgon', 'da nang', 'hoi an', 'nha trang', 'dalat'],
  'indonesia': ['indonesia', 'indonésie', 'indonesie', 'bali', 'jakarta', 'ubud', 'lombok', 'yogyakarta'],
  'korea': ['korea', 'corée', 'coree', 'seoul', 'séoul', 'busan'],
  'philippines': ['philippines', 'manila', 'manille', 'cebu', 'palawan', 'boracay', 'siargao'],
  'malaysia': ['malaysia', 'malaisie', 'kuala lumpur', 'penang', 'langkawi'],
  'cambodia': ['cambodia', 'cambodge', 'phnom penh', 'siem reap'],
  'singapore': ['singapore', 'singapour'],
  'laos': ['laos', 'vientiane', 'luang prabang'],
  'myanmar': ['myanmar', 'birmanie', 'yangon'],
  'taiwan': ['taiwan', 'taïwan', 'taipei'],
  'india': ['india', 'inde', 'mumbai', 'delhi', 'goa'],
  'nepal': ['nepal', 'népal', 'kathmandu', 'katmandou'],
  'sri lanka': ['sri lanka', 'colombo']
};

/**
 * Flat map alias → pays normalisé (dérivé automatiquement de DESTINATION_ALIASES).
 * Ex: 'bali' → 'indonesia', 'thaïlande' → 'thailand', 'japan' → 'japan'
 */
export const CITY_TO_COUNTRY = Object.freeze(
  Object.entries(DESTINATION_ALIASES).reduce((map, [country, aliases]) => {
    for (const alias of aliases) {
      map[alias] = country;
    }
    return map;
  }, {})
);

/**
 * Liste plate de tous les alias (pays + villes + variantes).
 * Utile pour le matching "contient une destination Asie ?" sur un texte.
 */
export const ASIA_DESTINATIONS = Object.freeze(
  Object.values(DESTINATION_ALIASES).flat()
);

/**
 * Noms d'affichage français pour chaque pays (utilisé dans les prompts LLM, titres, etc.)
 */
export const COUNTRY_DISPLAY_NAMES = {
  'japan': 'Japon',
  'thailand': 'Thaïlande',
  'vietnam': 'Vietnam',
  'indonesia': 'Indonésie',
  'korea': 'Corée du Sud',
  'philippines': 'Philippines',
  'malaysia': 'Malaisie',
  'cambodia': 'Cambodge',
  'singapore': 'Singapour',
  'laos': 'Laos',
  'myanmar': 'Myanmar',
  'taiwan': 'Taïwan',
  'india': 'Inde',
  'nepal': 'Népal',
  'sri lanka': 'Sri Lanka'
};

/**
 * Normalise un nom de destination vers son pays/région principal.
 * @param {string} dest — Nom de ville, pays, ou variante
 * @returns {string} Clé pays normalisée (ex: 'bali' → 'indonesia')
 */
export function normalizeDestination(dest) {
  const lower = (dest || '').toLowerCase().trim();
  return CITY_TO_COUNTRY[lower] || lower;
}
