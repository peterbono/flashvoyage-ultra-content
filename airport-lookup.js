/**
 * AIRPORT LOOKUP MODULE
 * Lookup dynamique ville/pays → code IATA aéroport
 * Basé sur la base OpenFlights (5600+ entrées)
 * 
 * Source: data/airports-iata.json (généré par scripts/build-airports-db.js)
 * 
 * Usage:
 *   import { lookupIATA } from './airport-lookup.js';
 *   lookupIATA('cebu')     // → 'CEB'
 *   lookupIATA('bali')     // → 'DPS'
 *   lookupIATA('Vietnam')  // → 'SGN'
 *   lookupIATA('xyz')      // → null
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, 'data', 'airports-iata.json');

let _lookup = null;

/**
 * Charge le lookup depuis le fichier JSON (lazy loading, une seule fois)
 */
function getLookup() {
  if (!_lookup) {
    try {
      const raw = readFileSync(DB_PATH, 'utf-8');
      const db = JSON.parse(raw);
      _lookup = db.lookup || {};
      console.log(`✈️ Airport DB chargée: ${Object.keys(_lookup).length} entrées`);
    } catch (err) {
      console.warn(`⚠️ Airport DB non trouvée (${DB_PATH}): ${err.message}`);
      console.warn('   → Exécutez: node scripts/build-airports-db.js');
      _lookup = {};
    }
  }
  return _lookup;
}

/**
 * Normalise un nom de ville/pays pour le lookup
 * - Lowercase
 * - Strip accents (NFD + remove diacritics)
 * - Remove special chars
 * - Trim
 */
function normalize(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Recherche le code IATA pour une ville ou un pays
 * @param {string} cityOrCountry - Nom de la ville ou du pays
 * @returns {string|null} Code IATA à 3 lettres ou null si non trouvé
 */
export function lookupIATA(cityOrCountry) {
  if (!cityOrCountry) return null;
  
  const lookup = getLookup();
  const normalized = normalize(cityOrCountry);
  
  if (!normalized) return null;
  
  // 1. Recherche exacte
  if (lookup[normalized]) {
    return lookup[normalized];
  }
  
  // 2. Recherche partielle (pour les cas comme "ho chi minh city" → "ho chi minh")
  // Garde-fous stricts pour éviter les faux positifs :
  //   - Minimum 5 caractères pour les deux côtés
  //   - Le match doit couvrir au moins 70% de la chaîne la plus longue
  //     (évite que "lien" matche dans "aguascalientes" ou "nord" dans "norderney")
  for (const [key, iata] of Object.entries(lookup)) {
    if (key.length < 5 || normalized.length < 5) continue;
    const longer = Math.max(key.length, normalized.length);
    const shorter = Math.min(key.length, normalized.length);
    if (shorter / longer < 0.7) continue; // Les longueurs doivent être proches
    if (normalized.includes(key) || key.includes(normalized)) {
      return iata;
    }
  }
  
  return null;
}

/**
 * Vérifie si une ville/pays est connue dans la base
 * @param {string} cityOrCountry - Nom à vérifier
 * @returns {boolean}
 */
export function isKnownLocation(cityOrCountry) {
  return lookupIATA(cityOrCountry) !== null;
}

/**
 * Retourne le nombre d'entrées dans la base
 */
export function getDBSize() {
  return Object.keys(getLookup()).length;
}

/**
 * Retourne tous les noms de lieux connus (clés du lookup)
 * Utile pour les itérations de détection de lieux dans du texte
 * @returns {string[]} Liste de noms normalisés (lowercase, sans accents)
 */
export function getAllLocationNames() {
  return Object.keys(getLookup());
}

/**
 * Expose la fonction normalize pour usage externe
 * @param {string} input
 * @returns {string} Chaîne normalisée
 */
export { normalize as normalizeLocationName };
