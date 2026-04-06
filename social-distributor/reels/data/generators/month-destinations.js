/**
 * Month Destinations Script Generator — FlashVoyage Reels v2
 *
 * Generates "OÙ PARTIR EN [MOIS]" content from static JSON data.
 * Uses a static dataset for destinations (reliability) and Claude Haiku
 * only for generating short one-liner reasons (cheap, 1 call).
 *
 * Output structure:
 * {
 *   type: 'month_destinations',
 *   month: string,              // e.g. "Avril"
 *   monthShort: string,         // e.g. "AVR"
 *   destinations: Array<{ name, country, reason, pexelsQuery }>,
 *   caption: string,
 *   hashtags: string[]
 * }
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createTrackedClient } from '../../tracked-anthropic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'month-destinations.json');

// ── Lazy Anthropic client ───────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('month-generator');
  return _client;
}

// ── Month utilities ─────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const MONTH_DISPLAY = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE',
];

/**
 * Get the next month name (used when no month is specified).
 * If we're past the 15th, suggest 2 months ahead (gives time to plan).
 * @returns {string} Lowercase month name in French
 */
function getNextMonth() {
  const now = new Date();
  const day = now.getDate();
  const currentMonth = now.getMonth(); // 0-indexed
  // If past the 20th, skip to 2 months ahead (content published 20-25 for next month)
  const offset = day >= 20 ? 2 : 1;
  const targetMonth = (currentMonth + offset) % 12;
  return MONTH_NAMES[targetMonth];
}

/**
 * Capitalize first letter of a month name for display.
 * @param {string} monthKey - Lowercase month key
 * @returns {string} Display month (uppercase)
 */
function getMonthDisplay(monthKey) {
  const idx = MONTH_NAMES.indexOf(monthKey);
  return idx >= 0 ? MONTH_DISPLAY[idx] : monthKey.toUpperCase();
}

// ── Load static data ────────────────────────────────────────────────────────

function loadMonthData() {
  const raw = readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

// ── Haiku prompt for reasons ────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un créateur de contenu voyage pour le média FlashVoyage (Instagram Reels).
Tu génères des raisons courtes et percutantes pour visiter des destinations en Asie du Sud-Est.
Style éditorial, factuel, concis. Accents français obligatoires (é, è, ê, à, ç, ù).`;

function buildReasonsPrompt(monthDisplay, destinations) {
  const destList = destinations
    .map((d, i) => `${i + 1}. ${d.name} (${d.country})`)
    .join('\n');

  return `Pour un Reel "OÙ PARTIR EN ${monthDisplay}", génère une raison courte (max 35 caractères) de visiter chaque destination CE MOIS-LÀ.

DESTINATIONS :
${destList}

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de texte avant/après) :
[
  "Saison sèche idéale",
  "Festivals des lanternes",
  "Mer turquoise, zéro foule",
  "Rizières d'un vert éclatant",
  "Couchers de soleil légendaires"
]

RÈGLES :
- Exactement ${destinations.length} raisons, dans le même ordre
- Max 35 caractères chacune
- En français avec accents
- Liées à la SAISON / MÉTÉO / ÉVÉNEMENTS de ${monthDisplay}
- Variées (pas que météo : festivals, prix bas, faune, paysages, etc.)
- Première lettre majuscule, pas de point final`;
}

// ── Fallback reasons ────────────────────────────────────────────────────────

const FALLBACK_REASONS = [
  'Climat parfait ce mois-ci',
  'Saison idéale pour visiter',
  'Moins de touristes, plus de charme',
  'Paysages à couper le souffle',
  'Budget doux, expériences fortes',
];

// ── Main generation function ────────────────────────────────────────────────

/**
 * Generate a Month Destinations script.
 *
 * @param {string|null} monthName - Month in French lowercase (e.g. 'avril').
 *   If null, uses the next month automatically.
 * @returns {Promise<Object>} Month destinations script
 */
export async function generateMonthScript(monthName = null) {
  const targetMonth = monthName || getNextMonth();
  const monthDisplay = getMonthDisplay(targetMonth);

  console.log(`[REEL/MONTH] Generating script for: "${monthDisplay}"`);

  // ── Load static data ──────────────────────────────────────────────────────
  const allData = loadMonthData();
  const monthData = allData[targetMonth];

  if (!monthData) {
    throw new Error(`[REEL/MONTH] No data found for month: "${targetMonth}". Available: ${Object.keys(allData).join(', ')}`);
  }

  const destinations = monthData.destinations.map(d => ({ ...d }));
  const monthShort = monthData.month_short;

  // ── Generate reasons via Haiku ────────────────────────────────────────────
  const client = getClient();

  if (client) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildReasonsPrompt(monthDisplay, destinations) }],
      });

      const text = response.content[0]?.text?.trim();
      if (text) {
        // Parse JSON array of reasons
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          let jsonStr = jsonMatch[0];
          // Clean common LLM JSON issues
          jsonStr = jsonStr.replace(/,\s*\]/g, ']');              // trailing commas
          jsonStr = jsonStr.replace(/[\u201c\u201d\u00ab\u00bb]/g, '"'); // smart quotes

          const reasons = JSON.parse(jsonStr);

          if (Array.isArray(reasons) && reasons.length >= destinations.length) {
            for (let i = 0; i < destinations.length; i++) {
              destinations[i].reason = String(reasons[i]).slice(0, 35);
            }
            console.log(`[REEL/MONTH] Haiku generated ${reasons.length} reasons`);
          }
        }
      }
    } catch (err) {
      console.warn(`[REEL/MONTH] Haiku reasons failed: ${err.message} — using fallbacks`);
    }
  } else {
    console.warn('[REEL/MONTH] ANTHROPIC_API_KEY not set — using fallback reasons');
  }

  // Fill any empty reasons with fallbacks
  for (let i = 0; i < destinations.length; i++) {
    if (!destinations[i].reason) {
      destinations[i].reason = FALLBACK_REASONS[i] || 'Destination incontournable';
    }
  }

  // ── Build caption & hashtags ──────────────────────────────────────────────
  const destLines = destinations
    .map((d, i) => `\u{1F4CD} ${d.name} \u2014 ${d.reason}`)
    .join('\n');

  const caption = `O\u00F9 partir en ${monthDisplay.charAt(0) + monthDisplay.slice(1).toLowerCase()} ? 5 destinations parfaites \u2600\uFE0F\n\n${destLines}\n\nTu pars o\u00F9 ? Dis-le en commentaire \u{1F447}`;

  const monthTag = monthDisplay.charAt(0) + monthDisplay.slice(1).toLowerCase()
    .replace(/[éèê]/g, 'e').replace(/[àâ]/g, 'a').replace(/[ùû]/g, 'u')
    .replace(/[ôö]/g, 'o').replace(/[îï]/g, 'i').replace(/ç/g, 'c');

  const hashtags = [
    '#FlashVoyage',
    `#OuPartirEn${monthTag}`,
    '#VoyageAsie',
    '#DestinationAsie',
    '#VoyageFR',
    '#SoutheastAsia',
  ];

  const result = {
    type: 'month_destinations',
    month: monthDisplay,
    monthShort,
    destinations,
    caption,
    hashtags,
  };

  console.log(`[REEL/MONTH] Generated: ${monthDisplay} — ${destinations.map(d => d.name).join(', ')}`);
  return result;
}
