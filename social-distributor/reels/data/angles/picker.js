/**
 * Angle Picker — FlashVoyage Reels
 *
 * Loads an angle library (JSON) and picks one at random, skipping any that
 * were used in the last MAX_RECENT picks. State is persisted to disk so the
 * rotation survives process restarts (cron/worker runs).
 *
 * Mirrors the `_recentlyUsed` + MAX_RECENT pattern from asset-fetcher.js so
 * behavior is consistent across the reel stack.
 *
 * State file shape:
 *   {
 *     "avantapres": { "recentIds": ["beach-crowds", "airbnb-photo-vs-real", ...] },
 *     "versus":     { "recentIds": ["destination-vs-france", ...] }
 *   }
 *
 * Usage:
 *   import { pickAngle } from './picker.js';
 *   const angle = pickAngle('avantapres'); // → { id, label, ... }
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────

// Max history: don't repeat within last N picks.
// Libraries have 18 angles each → 6 guarantees good coverage while keeping
// rotation feeling natural (not perfectly round-robin).
export const MAX_RECENT = 6;

const REELS_ROOT = join(__dirname, '..', '..');
// FV-FIX 2026-04-15: state moved from reels/tmp/ (gitignored) to this angles/
// directory so it's tracked by git. On GH Actions, tmp/ is recreated fresh
// every run → rotation state was lost between crons → same angle could be
// picked 2-3 runs in a row purely by random chance. Now the workflow commits
// the updated state at the end of each publish-reels run (see publish-reels.yml).
const STATE_PATH = join(__dirname, 'angle-state.json');

// Library name → JSON file path
const LIBRARIES = {
  avantapres: join(__dirname, 'avantapres-angles.json'),
  versus: join(__dirname, 'versus-angles.json'),
};

// ── Library cache ───────────────────────────────────────────────────────────

const _libraryCache = new Map();

function loadLibrary(libraryName) {
  if (_libraryCache.has(libraryName)) return _libraryCache.get(libraryName);

  const libPath = LIBRARIES[libraryName];
  if (!libPath) {
    throw new Error(
      `[ANGLE-PICKER] Unknown library "${libraryName}". Known: ${Object.keys(LIBRARIES).join(', ')}`
    );
  }
  if (!existsSync(libPath)) {
    throw new Error(`[ANGLE-PICKER] Library file missing: ${libPath}`);
  }

  const raw = readFileSync(libPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`[ANGLE-PICKER] Library "${libraryName}" is not a non-empty array`);
  }
  _libraryCache.set(libraryName, parsed);
  return parsed;
}

// ── State persistence ───────────────────────────────────────────────────────

function ensureStateDir() {
  // State now lives alongside the library JSON files in this angles/ dir,
  // which always exists since the libraries themselves do. Kept as a noop
  // for API compatibility with any call sites.
}

function readState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    const raw = readFileSync(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (err) {
    console.warn(`[ANGLE-PICKER] Could not read state (${err.message}), resetting`);
    return {};
  }
}

function writeState(state) {
  try {
    ensureStateDir();
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    // Non-fatal: rotation degrades to pure-random for this process.
    console.warn(`[ANGLE-PICKER] Could not persist state (${err.message})`);
  }
}

// ── Core picker ─────────────────────────────────────────────────────────────

/**
 * Pick an angle from the given library, skipping any whose id is in the last
 * MAX_RECENT picks. Updates and persists the state.
 *
 * @param {string} libraryName - One of: "avantapres", "versus"
 * @returns {Object} The picked angle entry (with `id`, `label`, etc.)
 */
export function pickAngle(libraryName) {
  const library = loadLibrary(libraryName);
  const state = readState();
  const entry = state[libraryName] || { recentIds: [] };
  const recentIds = Array.isArray(entry.recentIds) ? entry.recentIds : [];

  // Filter out recent ids; if all are recent (library smaller than MAX_RECENT
  // or state corrupted), reset and use the full library.
  const available = library.filter((a) => !recentIds.includes(a.id));
  const pool = available.length > 0 ? available : library;

  const picked = pool[Math.floor(Math.random() * pool.length)];

  // Update rotation state
  const nextRecent = [...recentIds, picked.id];
  while (nextRecent.length > MAX_RECENT) nextRecent.shift();

  state[libraryName] = { recentIds: nextRecent };
  writeState(state);

  return picked;
}

/**
 * Return the full library (useful for tests, introspection).
 */
export function getLibrary(libraryName) {
  return loadLibrary(libraryName).slice();
}

/**
 * Reset rotation state for one or all libraries (useful for tests).
 *
 * @param {string} [libraryName] - If omitted, resets all.
 */
export function resetAngleState(libraryName) {
  const state = readState();
  if (libraryName) {
    delete state[libraryName];
  } else {
    for (const k of Object.keys(state)) delete state[k];
  }
  writeState(state);
}

// ── Comparison-destination matrix (used by cost-vs / versus generators) ────

/**
 * Hardcoded Asia matrix used when an angle asks for a second destination.
 * Keys are canonical destination keys (matching item-prices.js / country-facts.js).
 * Values are sensible "counterpart" picks for each axis.
 *
 * The generator does not need to know about every edge case — it falls back
 * to a reasonable default ("france" for destination-vs-france, another Asian
 * neighbor otherwise).
 */
const ASIA_COUNTERPARTS = {
  // Same-region pairs for destination-a-vs-b-asia
  asiaPairs: {
    thailande: 'vietnam',
    vietnam: 'thailande',
    indonesie: 'thailande',
    cambodge: 'vietnam',
    laos: 'cambodge',
    philippines: 'thailande',
    malaisie: 'thailande',
    japon: 'coree-du-sud',
    'coree-du-sud': 'japon',
    taiwan: 'japon',
    singapour: 'malaisie',
    sri_lanka: 'thailande',
    inde: 'sri_lanka',
    nepal: 'inde',
  },
  // North/South split per country (free-form label, generator uses for copy)
  northSouth: {
    thailande: { north: 'Nord-Thaïlande', south: 'Sud-Thaïlande' },
    vietnam: { north: 'Nord-Vietnam', south: 'Sud-Vietnam' },
    japon: { north: 'Nord-Japon', south: 'Sud-Japon' },
    indonesie: { north: 'Sumatra', south: 'Bali / Lombok' },
    philippines: { north: 'Luçon', south: 'Mindanao' },
    inde: { north: 'Nord-Inde', south: 'Sud-Inde' },
  },
  secondCity: {
    thailande: { capital: 'Bangkok', second: 'Chiang Mai' },
    vietnam: { capital: 'Hanoï', second: 'Ho Chi Minh' },
    japon: { capital: 'Tokyo', second: 'Osaka' },
    indonesie: { capital: 'Jakarta', second: 'Bali' },
    philippines: { capital: 'Manille', second: 'Cebu' },
    cambodge: { capital: 'Phnom Penh', second: 'Siem Reap' },
    'coree-du-sud': { capital: 'Séoul', second: 'Busan' },
  },
  beachMountain: {
    thailande: { beach: 'Krabi', mountain: 'Pai' },
    vietnam: { beach: 'Phu Quoc', mountain: 'Sapa' },
    indonesie: { beach: 'Bali sud', mountain: 'Ubud' },
    philippines: { beach: 'El Nido', mountain: 'Banaue' },
  },
};

/**
 * Resolve the comparison destination for a given angle.
 *
 * @param {string} primaryDestinationKey - e.g. "thailande", "vietnam"
 * @param {Object} angle - From avantapres-angles.json or versus-angles.json
 * @returns {{ destinationBKey: string|null, destinationBLabel: string }}
 *   - destinationBKey: canonical key if the second destination maps to a real
 *     country in country-facts/item-prices (generator can fetch full facts).
 *   - destinationBLabel: human-readable label — always usable as overlay text.
 */
export function pickComparisonDestination(primaryDestinationKey, angle) {
  if (!angle || !primaryDestinationKey) {
    return { destinationBKey: 'france', destinationBLabel: 'France' };
  }

  const intent = angle.pickDestinationB;
  const primary = String(primaryDestinationKey).toLowerCase().trim();

  // 1. France reference (historic cost-vs behavior)
  if (intent === 'france') {
    return { destinationBKey: 'france', destinationBLabel: 'France' };
  }

  // 2. Sibling Asian country
  if (intent === 'another-asia-country') {
    const sibling = ASIA_COUNTERPARTS.asiaPairs[primary];
    if (sibling) {
      return {
        destinationBKey: sibling,
        destinationBLabel: humanizeKey(sibling),
      };
    }
    // Fallback: Vietnam as neutral SEA counterpart
    return { destinationBKey: 'vietnam', destinationBLabel: 'Vietnam' };
  }

  // 3. Same country, different region
  if (intent === 'same-country-other-region') {
    const split = ASIA_COUNTERPARTS.northSouth[primary];
    if (split) {
      return { destinationBKey: null, destinationBLabel: split.south };
    }
    return { destinationBKey: null, destinationBLabel: 'Autre région' };
  }

  if (intent === 'second-city') {
    const cities = ASIA_COUNTERPARTS.secondCity[primary];
    if (cities) {
      return { destinationBKey: null, destinationBLabel: cities.second };
    }
    return { destinationBKey: null, destinationBLabel: '2e ville' };
  }

  if (intent === 'mountain-counterpart') {
    const pair = ASIA_COUNTERPARTS.beachMountain[primary];
    if (pair) {
      return { destinationBKey: null, destinationBLabel: pair.mountain };
    }
    return { destinationBKey: null, destinationBLabel: 'Montagne' };
  }

  // 4. Same destination, different profile / period / context.
  // These are "virtual" destinationBs — overlay text only, no key.
  const virtualLabels = {
    'same-destination-luxury': 'Version luxe',
    'same-destination-couple': 'À 2',
    'same-destination-rainy': 'Saison pluies',
    'same-destination-restaurant': 'En restaurant',
    'same-destination-airbnb': 'En Airbnb',
    'same-route-other-transport': 'Autre transport',
    'same-activity-diy': 'En DIY',
    'same-destination-last-year': 'L\u2019an dernier',
    'lesser-known-alternative': 'Alternative cachée',
    'same-city-local-neighborhood': 'Quartier local',
    'same-destination-weekend': 'Week-end',
    'same-product-all-fees': 'Avec tous les frais',
    'same-activity-local-guide': 'Guide local',
  };
  if (virtualLabels[intent]) {
    return { destinationBKey: null, destinationBLabel: virtualLabels[intent] };
  }

  // Unknown intent: default to France (safe, matches legacy behavior).
  return { destinationBKey: 'france', destinationBLabel: 'France' };
}

function humanizeKey(key) {
  const map = {
    thailande: 'Thaïlande',
    vietnam: 'Vietnam',
    indonesie: 'Indonésie',
    cambodge: 'Cambodge',
    laos: 'Laos',
    philippines: 'Philippines',
    malaisie: 'Malaisie',
    japon: 'Japon',
    'coree-du-sud': 'Corée du Sud',
    taiwan: 'Taïwan',
    singapour: 'Singapour',
    sri_lanka: 'Sri Lanka',
    inde: 'Inde',
    nepal: 'Népal',
    france: 'France',
  };
  return map[key] || key.charAt(0).toUpperCase() + key.slice(1);
}
