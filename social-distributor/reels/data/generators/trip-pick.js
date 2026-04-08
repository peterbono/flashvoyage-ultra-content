/**
 * Trip Pick Script Generator — FlashVoyage Reels v2
 *
 * Generates "X SPOTS A NE PAS RATER" content from article data.
 * Uses Claude Haiku to extract 5 must-see spots per country/region.
 *
 * Output structure:
 * {
 *   type: 'trip_pick',
 *   country: string,
 *   spots: Array<{ name: string, detail: string, pexelsQuery: string }>,
 *   caption: string,
 *   hashtags: string[]
 * }
 */

import fs from 'fs';
import { createTrackedClient } from '../../tracked-anthropic.js';

// ── Lazy Anthropic client ───────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('trip-pick-generator');
  return _client;
}

// ── Country flag mapping (common SE Asia + popular destinations) ─────────

const FLAG_MAP = {
  'thailande': '🇹🇭', 'thailand': '🇹🇭', 'thai': '🇹🇭',
  'vietnam': '🇻🇳', 'viet nam': '🇻🇳',
  'indonesie': '🇮🇩', 'indonesia': '🇮🇩', 'bali': '🇮🇩',
  'cambodge': '🇰🇭', 'cambodia': '🇰🇭',
  'laos': '🇱🇦',
  'myanmar': '🇲🇲', 'birmanie': '🇲🇲',
  'malaisie': '🇲🇾', 'malaysia': '🇲🇾',
  'singapour': '🇸🇬', 'singapore': '🇸🇬',
  'philippines': '🇵🇭',
  'japon': '🇯🇵', 'japan': '🇯🇵',
  'coree': '🇰🇷', 'korea': '🇰🇷', 'coree du sud': '🇰🇷',
  'inde': '🇮🇳', 'india': '🇮🇳',
  'sri lanka': '🇱🇰',
  'nepal': '🇳🇵', 'népal': '🇳🇵',
  'maldives': '🇲🇻',
  'chine': '🇨🇳', 'china': '🇨🇳',
  'taiwan': '🇹🇼',
  'hong kong': '🇭🇰',
  'australie': '🇦🇺', 'australia': '🇦🇺',
  'nouvelle-zelande': '🇳🇿', 'new zealand': '🇳🇿',
  'turquie': '🇹🇷', 'turkey': '🇹🇷', 'türkiye': '🇹🇷',
  'grece': '🇬🇷', 'greece': '🇬🇷', 'grèce': '🇬🇷',
  'italie': '🇮🇹', 'italy': '🇮🇹',
  'espagne': '🇪🇸', 'spain': '🇪🇸',
  'portugal': '🇵🇹',
  'maroc': '🇲🇦', 'morocco': '🇲🇦',
  'mexique': '🇲🇽', 'mexico': '🇲🇽',
  'colombie': '🇨🇴', 'colombia': '🇨🇴',
  'perou': '🇵🇪', 'peru': '🇵🇪', 'pérou': '🇵🇪',
  'egypte': '🇪🇬', 'egypt': '🇪🇬', 'égypte': '🇪🇬',
  'dubai': '🇦🇪', 'emirats': '🇦🇪',
};

/**
 * Look up a country flag emoji from a destination string.
 * @param {string} destination
 * @returns {string} Flag emoji or generic globe
 */
function getFlag(destination) {
  const lower = (destination || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, flag] of Object.entries(FLAG_MAP)) {
    const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalizedKey)) return flag;
  }
  return '🌍';
}

// ── Haiku prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un créateur de Reels voyage viral pour le média FlashVoyage (Instagram).
Tu génères du contenu listicle varié : spots, astuces budget, street food, arnaques, comparatifs, etc.
Ton style est éditorial, factuel, concis, punchy. Accents français obligatoires (é, è, ê, à, ç, ù).
JAMAIS générique — chaque item doit contenir un détail concret (prix, nom de rue, quartier, plat précis).`;

// ── Sub-format rotation system ─────────────────────────────────────────────
// Prevents repetitive "Top 5 spots" by varying the angle

const SUB_FORMATS = [
  { id: 'spots', count: 5, prompt: 'les 5 spots/lieux incontournables', caption: '5 spots à ne pas rater' },
  { id: 'budget', count: 5, prompt: '5 astuces budget pour voyager pas cher', caption: '5 astuces pour voyager pas cher' },
  { id: 'food', count: 5, prompt: '5 plats de street food à goûter absolument', caption: '5 plats de street food à goûter' },
  { id: 'traps', count: 5, prompt: '5 arnaques ou pièges à touristes à éviter', caption: '5 pièges à touristes à éviter' },
  { id: 'hidden', count: 5, prompt: '5 endroits secrets que les touristes ne connaissent pas', caption: '5 endroits secrets' },
  { id: 'tips', count: 7, prompt: '7 choses à savoir avant de partir', caption: '7 choses à savoir avant de partir' },
  { id: 'photos', count: 5, prompt: '5 spots photo Instagram les plus spectaculaires', caption: '5 spots photo Instagram' },
  { id: 'transport', count: 5, prompt: '5 astuces transport que les locaux utilisent', caption: '5 astuces transport locales' },
  { id: 'free', count: 5, prompt: '5 activités gratuites à faire', caption: '5 activités gratuites' },
  { id: 'nightlife', count: 5, prompt: '5 marchés de nuit ou bars incontournables', caption: '5 spots de soirée' },
  { id: 'luxury', count: 5, prompt: '5 expériences luxe à petit prix (moins de 50€)', caption: '5 expériences luxe à petit prix' },
  { id: 'mistakes', count: 5, prompt: '5 erreurs que font tous les Français', caption: '5 erreurs à ne pas faire' },
];

function pickSubFormat(contentHistory) {
  // Read recent sub-formats from content history to avoid repeats
  const recentSubs = (contentHistory?.recentSubtopics || [])
    .filter(s => {
      const d = new Date(s.date);
      return (Date.now() - d.getTime()) < 7 * 24 * 60 * 60 * 1000; // last 7 days
    })
    .map(s => s.id);

  // Filter out recently used sub-formats
  const available = SUB_FORMATS.filter(sf => !recentSubs.includes(sf.id));
  const pool = available.length > 0 ? available : SUB_FORMATS;

  // Random pick from available
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildUserPrompt(article, subFormat) {
  const title = article.title || '';
  const rawText = (article.rawText || '').slice(0, 4000);
  const hook = article.hook || '';
  const cityFocus = article.cityFocus || '';
  const count = subFormat?.count || 5;
  const angle = subFormat?.prompt || 'les 5 spots/lieux incontournables';
  const captionTemplate = subFormat?.caption || '5 spots à ne pas rater';

  return `Depuis cet article, extrais ${angle}.

ARTICLE : ${title}
ACCROCHE : ${hook}
${cityFocus ? `DESTINATION PRÉCISE DÉTECTÉE : ${cityFocus}` : ''}
TEXTE : ${rawText}

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de texte avant/après) :
{
  "country": "Destination la plus SPÉCIFIQUE possible : ville > île > région > pays",
  "subtopic": "${subFormat?.id || 'spots'}",
  "spots": [
    {
      "name": "NOM COURT EN MAJUSCULES (STRICT MAX 20 caractères, sinon ça coupe dans la vidéo ! Ex: PAD THAI, CHATUCHAK, TEMPLE D'OR)",
      "detail": "Ultra court (STRICT MAX 25 caractères ! Ex: Dès 40฿ à Yaowarat, Entrée gratuite)",
      "pexelsQuery": "english pexels search query for this specific item"
    }
  ],
  "caption": "${captionTemplate} à [DESTINATION] [EMOJI_DRAPEAU]\\n\\nLequel tu choisis ? 👇",
  "hashtags": ["#FlashVoyage", "#TripPick", "#Voyage", "...4-5 hashtags pertinents"]
}

RÈGLES :
- Exactement ${count} items, le plus impactant EN PREMIER
- "name" : EN MAJUSCULES, max 25 caractères, ULTRA SPÉCIFIQUE (pas "TEMPLE" mais "WAT ARUN AU LEVER")
- "detail" : première lettre majuscule, max 30 chars, inclure un chiffre ou prix si possible
- "pexelsQuery" : en anglais, très spécifique (pas "thailand food" mais "pad thai street stall bangkok")
- "caption" : inclure le drapeau emoji du pays et un appel à l'action
- "hashtags" : 6-7 hashtags dont #FlashVoyage en premier
- INTERDICTION d'être générique. Chaque item = un détail CONCRET.
- "country" : sois le plus SPÉCIFIQUE possible. Si l'article parle de Bangkok, écris "Bangkok" pas "Thaïlande". Si c'est Bali, écris "Bali" pas "Indonésie". Si c'est Kyoto, écris "Kyoto" pas "Japon".${cityFocus ? ` L'article est centré sur "${cityFocus}", utilise ce nom.` : ''}`;
}

// ── Main generation function ────────────────────────────────────────────────

/**
 * Generate a Trip Pick script from article data using Haiku.
 *
 * @param {Object} article - Article data { title, hook, rawText, keyStats, ... }
 * @returns {Promise<Object>} Trip Pick script
 */
export async function generateTripPickScript(article) {
  console.log(`[REEL/TRIP-PICK] Generating script for: "${(article.title || '').slice(0, 60)}..."`);

  const client = getClient();
  if (!client) {
    console.warn('[REEL/TRIP-PICK] ANTHROPIC_API_KEY not set — using fallback');
    return getFallbackScript(article);
  }

  // Pick a sub-format to vary content (not always "top 5 spots")
  let contentHistory = {};
  try {
    const histPath = new URL('../data/content-history.json', import.meta.url).pathname;
    contentHistory = JSON.parse(fs.readFileSync(histPath, 'utf8'));
  } catch { /* empty or missing */ }
  const subFormat = pickSubFormat(contentHistory);
  console.log(`[REEL/TRIP-PICK] Sub-format: ${subFormat.id} ("${subFormat.prompt}")`);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(article, subFormat) }],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Haiku');

    // ── Parse JSON ──────────────────────────────────────────────────────────
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Haiku response');

    let jsonStr = jsonMatch[0];
    // Clean common LLM JSON issues
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');           // trailing commas
    jsonStr = jsonStr.replace(/,?\s*"\.\.\."\s*,?/g, '');      // "..." placeholders
    jsonStr = jsonStr.replace(/[\u201c\u201d\u00ab\u00bb]/g, '"'); // smart quotes

    let script;
    try {
      script = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn('[REEL/TRIP-PICK] JSON parse failed, trying regex extraction...');
      script = extractManually(jsonStr);
    }

    // ── Validate & normalize ────────────────────────────────────────────────

    if (!script.country || !script.spots || !Array.isArray(script.spots)) {
      throw new Error('Invalid script: missing country or spots');
    }

    // Enforce correct item count based on sub-format
    const targetCount = subFormat.count || 5;
    if (script.spots.length > targetCount) {
      script.spots = script.spots.slice(0, targetCount);
    }
    while (script.spots.length < targetCount) {
      script.spots.push({
        name: `SPOT ${script.spots.length + 1}`,
        detail: 'À découvrir',
        pexelsQuery: `${script.country} tourism landmark`,
      });
    }

    // Enforce name constraints
    script.spots = script.spots.map(spot => ({
      name: (spot.name || 'SPOT').toUpperCase().slice(0, 25),
      detail: (spot.detail || '').slice(0, 30),
      pexelsQuery: spot.pexelsQuery || `${script.country} travel`,
    }));

    // Ensure hashtags
    const defaultTags = ['#FlashVoyage', '#TripPick', '#Voyage'];
    script.hashtags = Array.isArray(script.hashtags) && script.hashtags.length >= 3
      ? script.hashtags
      : defaultTags;

    // Ensure caption
    const flag = getFlag(script.country);
    if (!script.caption) {
      script.caption = `5 spots à ne pas rater à ${script.country} ${flag}\n\nLequel tu visites en premier ? 👇`;
    }

    // Record subtopic in content history for dedup
    try {
      const histPath = new URL('../data/content-history.json', import.meta.url).pathname;
      if (!contentHistory.recentSubtopics) contentHistory.recentSubtopics = [];
      contentHistory.recentSubtopics.push({ id: subFormat.id, date: new Date().toISOString() });
      // Keep last 20 entries
      if (contentHistory.recentSubtopics.length > 20) contentHistory.recentSubtopics = contentHistory.recentSubtopics.slice(-20);
      fs.writeFileSync(histPath, JSON.stringify(contentHistory, null, 2));
    } catch (e) { console.warn('[REEL/TRIP-PICK] Failed to save subtopic history:', e.message); }

    // Final structure
    const result = {
      type: 'trip_pick',
      country: script.country,
      subtopic: subFormat.id,
      subtitle: subFormat.caption, // e.g. "5 astuces pour voyager pas cher" — used by composer for title overlay
      spots: script.spots,
      caption: script.caption,
      hashtags: script.hashtags,
    };

    console.log(`[REEL/TRIP-PICK] Generated: ${result.spots.length} spots for "${result.country}"`);
    return result;

  } catch (err) {
    console.error(`[REEL/TRIP-PICK] Generation failed: ${err.message}`);
    return getFallbackScript(article);
  }
}

// ── Regex fallback extraction ───────────────────────────────────────────────

function extractManually(jsonStr) {
  const countryMatch = jsonStr.match(/"country"\s*:\s*"([^"]+)"/);
  const nameMatches = [...jsonStr.matchAll(/"name"\s*:\s*"([^"]+)"/g)];
  const detailMatches = [...jsonStr.matchAll(/"detail"\s*:\s*"([^"]+)"/g)];
  const queryMatches = [...jsonStr.matchAll(/"pexelsQuery"\s*:\s*"([^"]+)"/g)];
  const captionMatch = jsonStr.match(/"caption"\s*:\s*"([^"]+)"/);

  if (!countryMatch && nameMatches.length === 0) {
    throw new Error('Could not extract any content from malformed JSON');
  }

  const country = countryMatch ? countryMatch[1] : 'Destination';
  const spots = nameMatches.map((m, i) => ({
    name: m[1],
    detail: detailMatches[i] ? detailMatches[i][1] : '',
    pexelsQuery: queryMatches[i] ? queryMatches[i][1] : `${country} travel`,
  }));

  return {
    country,
    spots,
    caption: captionMatch ? captionMatch[1] : '',
    hashtags: ['#FlashVoyage', '#TripPick', '#Voyage'],
  };
}

// ── Fallback when Haiku unavailable ─────────────────────────────────────────

function getFallbackScript(article) {
  const title = article.title || 'Destination Voyage';
  // Try to extract a country/destination from the title
  const country = title
    .replace(/top\s*\d+/i, '')
    .replace(/spots?\s*(à|a)\s*ne\s*pas\s*rater/i, '')
    .replace(/meilleur(e?s?)/i, '')
    .replace(/incontournable(s?)/i, '')
    .trim()
    || 'Asie du Sud-Est';

  console.warn(`[REEL/TRIP-PICK] Using fallback script for: "${country}"`);

  return {
    type: 'trip_pick',
    country,
    spots: [
      { name: 'SPOT PRINCIPAL', detail: 'Lieu emblématique', pexelsQuery: `${country} landmark` },
      { name: 'TEMPLE ANCIEN', detail: 'Temple historique', pexelsQuery: `${country} temple` },
      { name: 'MARCHÉ LOCAL', detail: 'Marché traditionnel', pexelsQuery: `${country} market` },
      { name: 'PLAGE SECRÈTE', detail: 'Plage paradisiaque', pexelsQuery: `${country} beach` },
      { name: 'VUE PANORAMIQUE', detail: 'Point de vue', pexelsQuery: `${country} viewpoint` },
    ],
    caption: `5 spots à ne pas rater 🌍\n\nLequel tu visites en premier ? 👇`,
    hashtags: ['#FlashVoyage', '#TripPick', '#Voyage', '#VoyageFR', '#SpotsVoyage'],
  };
}
