/**
 * Listicle Script Generator — FlashVoyage Reels
 *
 * Generates structured listicle Reel scripts from article data.
 * Detects series type: le_vrai_prix, arnaque, vs, taurais_du_savoir, le_hack, or generic listicle.
 * Uses Claude Haiku for script generation, then pipes through hook-validator.
 *
 * Output structure:
 * {
 *   type: 'listicle',
 *   series: 'vs',
 *   hook: { text, duration, searchQuery },
 *   items: [{ number, text, subtitle, duration, searchQuery }],
 *   cta: { text, duration },
 *   mood: 'upbeat',
 *   hashtags: [...],
 *   caption: '...'
 * }
 */

import Anthropic from '@anthropic-ai/sdk';
import { validateHooks } from './hook-validator.js';

// ── Lazy Anthropic client (same pattern as extractor.js) ─────────────────────

let _anthropicClient = null;
function getAnthropicClient() {
  if (_anthropicClient) return _anthropicClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropicClient;
}

// ── Series detection ─────────────────────────────────────────────────────────

const SERIES_PATTERNS = {
  le_vrai_prix: [
    /vrai\s*prix/i, /combien\s*co[uû]te/i, /budget\s*r[ée]el/i,
    /prix\s*r[ée]el/i, /co[uû]t\s*de\s*la\s*vie/i,
  ],
  arnaque: [
    /arnaque/i, /pi[eè]ge/i, /escroquerie/i, /attention\s*[àa]/i,
    /[ée]viter/i, /danger/i, /erreur/i, /ne\s*(?:fais|faites)\s*(?:pas|jamais)/i,
  ],
  vs: [
    /\bvs\b/i, /\bversus\b/i, /\bcontre\b/i, /\bou\b.*\?/i,
    /comparatif/i, /comparer/i, /diff[ée]rence/i, /mieux\s*(?:que|entre)/i,
  ],
  taurais_du_savoir: [
    /savais/i, /savoir\s*avant/i, /personne\s*ne\s*(?:dit|sait|parle)/i,
    /secret/i, /m[ée]connu/i, /cach[ée]/i, /ignor/i,
  ],
  le_hack: [
    /hack/i, /astuce/i, /conseil/i, /technique/i, /m[ée]thode/i,
    /comment\s*(?:faire|avoir|trouver)/i, /pas\s*cher/i,
  ],
};

/**
 * Detect the listicle series type from article title and content.
 * Priority order: vs (from title) > arnaque > taurais_du_savoir > le_hack > le_vrai_prix > generic
 * VS is checked on title only first (strongest signal), then other patterns on full text.
 */
export function detectSeries(article) {
  const title = (article.title || '').toLowerCase();
  const fullText = `${article.title} ${article.hook || ''} ${(article.keyStats || []).map(s => typeof s === 'object' ? s.value : s).join(' ')} ${(article.rawText || '').slice(0, 1000)}`.toLowerCase();

  // VS has highest priority when detected in the title
  if (SERIES_PATTERNS.vs.some(p => p.test(title))) {
    return 'vs';
  }

  // Check remaining series in priority order on full text
  const orderedSeries = ['arnaque', 'taurais_du_savoir', 'le_hack', 'le_vrai_prix', 'vs'];
  for (const series of orderedSeries) {
    if (SERIES_PATTERNS[series].some(p => p.test(fullText))) {
      return series;
    }
  }

  return 'listicle'; // generic
}

// ── Series-specific prompts ──────────────────────────────────────────────────

const SERIES_PROMPTS = {
  le_vrai_prix: `Tu es un createur de Reels voyage specialise dans la serie "LE VRAI PRIX DE..." (style revelation budget).
Le concept: reveler les vrais couts d'une destination, poste par poste, avec des chiffres chocs.

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}
TEXTE: {{RAW_TEXT}}

Genere un script listicle Reel (25-35 sec) avec:
- Hook: "LE VRAI PRIX DE [DESTINATION]" ou "COMBIEN COUTE [X] A [DESTINATION]" — 8-12 mots, EN MAJUSCULES, un chiffre choc
- 3-5 items: chaque poste budgetaire avec montant, le plus impressionnant EN PREMIER
- CTA: "ENREGISTRE POUR TON PROCHAIN VOYAGE"
- Chaque item: 3-8 mots EN MAJUSCULES, specifique, avec montant
- Mood: "dramatic"`,

  arnaque: `Tu es un createur de Reels voyage specialise dans la serie "ARNAQUE / PIEGES A EVITER".
Le concept: alerter les voyageurs sur les arnaques et pieges courants, style mise en garde.

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}
TEXTE: {{RAW_TEXT}}

Genere un script listicle Reel (25-35 sec) avec:
- Hook: question percutante ou fait choc — 8-12 mots, EN MAJUSCULES
- 3-5 items: chaque arnaque/piege, le pire EN PREMIER
- CTA: "PARTAGE A UN AMI QUI PART BIENTOT"
- Chaque item: 3-8 mots EN MAJUSCULES, concret, alarmant
- Mood: "dramatic"`,

  vs: `Tu es un createur de Reels voyage specialise dans les comparatifs "X VS Y".
Le concept: comparer deux destinations ou options de maniere visuelle et impactante.

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}
TEXTE: {{RAW_TEXT}}

Genere un script listicle Reel (25-35 sec) avec:
- Hook: "[X] VS [Y] : LE VERDICT" ou "LEQUEL CHOISIR ?" — 8-12 mots, EN MAJUSCULES
- 3-5 items: chaque critere de comparaison (prix, bouffe, plages, culture, etc.), le plus surprenant EN PREMIER
- CTA: "COMMENTE TON PREFERE"
- Chaque item: 3-8 mots EN MAJUSCULES, avec le gagnant clair
- Mood: "upbeat"`,

  taurais_du_savoir: `Tu es un createur de Reels voyage specialise dans la serie "T'AURAIS DU SAVOIR CA AVANT DE PARTIR".
Le concept: informations essentielles que personne ne dit avant un voyage.

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}
TEXTE: {{RAW_TEXT}}

Genere un script listicle Reel (25-35 sec) avec:
- Hook: "T'AURAIS DU SAVOIR CA AVANT [DESTINATION]" ou "PERSONNE NE TE DIT CA SUR [X]" — 8-12 mots, EN MAJUSCULES
- 3-5 items: chaque info meconnue, la plus surprenante EN PREMIER
- CTA: "ENREGISTRE POUR NE PAS OUBLIER"
- Chaque item: 3-8 mots EN MAJUSCULES, revelateur
- Mood: "dramatic"`,

  le_hack: `Tu es un createur de Reels voyage specialise dans la serie "LE HACK VOYAGE".
Le concept: astuces concretes pour voyager mieux et moins cher.

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}
TEXTE: {{RAW_TEXT}}

Genere un script listicle Reel (25-35 sec) avec:
- Hook: "LE HACK QUE 99% DES VOYAGEURS NE CONNAISSENT PAS" ou "L'ASTUCE QUI VA TE FAIRE ECONOMISER [X]" — 8-12 mots, EN MAJUSCULES
- 3-5 items: chaque astuce, la plus efficace EN PREMIER
- CTA: "ENREGISTRE CE HACK POUR PLUS TARD"
- Chaque item: 3-8 mots EN MAJUSCULES, actionnable
- Mood: "upbeat"`,

  listicle: `Tu es un createur de Reels voyage style listicle viral (top, classement, best-of).
Le concept: presenter une liste d'elements de maniere dynamique et engageante.

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}
TEXTE: {{RAW_TEXT}}

Genere un script listicle Reel (25-35 sec) avec:
- Hook: accroche percutante — 8-12 mots, EN MAJUSCULES, chiffre choc ou question
- 3-5 items: chaque element, le meilleur EN PREMIER (pas dernier!)
- CTA: "ENREGISTRE POUR TON PROCHAIN VOYAGE"
- Chaque item: 3-8 mots EN MAJUSCULES, specifique
- Mood: "upbeat"`,
};

const JSON_FORMAT_INSTRUCTION = `

Reponds UNIQUEMENT en JSON valide (pas de texte avant ou apres, pas de markdown) :
{
  "type": "listicle",
  "series": "{{SERIES}}",
  "hook": {
    "text": "TEXTE DU HOOK EN MAJUSCULES",
    "duration": 2.5,
    "searchQuery": "pexels search query in english"
  },
  "items": [
    {
      "number": 1,
      "text": "TEXTE ITEM EN MAJUSCULES",
      "subtitle": "detail court en minuscules",
      "duration": 4,
      "searchQuery": "pexels search query in english"
    }
  ],
  "cta": {
    "text": "TEXTE CTA EN MAJUSCULES",
    "duration": 3
  },
  "mood": "upbeat",
  "hashtags": ["#FlashVoyage", "#Voyage", "...3-5 hashtags pertinents"],
  "caption": "caption Instagram complete avec emojis et hashtags, 2-3 phrases max"
}`;

// ── Main script generation ───────────────────────────────────────────────────

/**
 * Generate a structured listicle Reel script from article data.
 *
 * @param {Object} article - Extracted article data { title, hook, keyStats, rawText, ... }
 * @returns {Promise<Object>} Structured listicle script
 */
export async function generateListicleScript(article) {
  const series = detectSeries(article);
  const promptTemplate = SERIES_PROMPTS[series] || SERIES_PROMPTS.listicle;

  const stats = (article.keyStats || [])
    .map(s => typeof s === 'object' ? s.value : s)
    .join(', ');

  const rawText = (article.rawText || '').slice(0, 4000);

  const prompt = promptTemplate
    .replace('{{TITLE}}', article.title || '')
    .replace('{{HOOK}}', article.hook || '')
    .replace('{{STATS}}', stats || 'aucune stat')
    .replace('{{RAW_TEXT}}', rawText)
    + JSON_FORMAT_INSTRUCTION.replace('{{SERIES}}', series);

  console.log(`[REEL/LISTICLE] Generating listicle script (series: ${series}) for: "${(article.title || '').slice(0, 60)}..."`);

  const client = getAnthropicClient();
  if (!client) {
    console.warn('[REEL/LISTICLE] ANTHROPIC_API_KEY not set — using fallback script');
    return getFallbackListicleScript(article, series);
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Haiku');

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Haiku response');

    let jsonStr = jsonMatch[0];
    // Clean common LLM JSON issues
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
    jsonStr = jsonStr.replace(/,?\s*"\.\.\."\s*,?/g, '');
    jsonStr = jsonStr.replace(/[\u201c\u201d\u00ab\u00bb]/g, '\\"');

    let script;
    try {
      script = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn(`[REEL/LISTICLE] JSON parse failed, trying extraction...`);
      script = extractScriptManually(jsonStr, series);
    }

    // Validate structure
    if (!script.hook || !script.items || !Array.isArray(script.items) || script.items.length === 0) {
      throw new Error('Invalid listicle script: missing hook or items');
    }

    // Enforce 3-5 items
    if (script.items.length > 5) {
      script.items = script.items.slice(0, 5);
    }
    if (script.items.length < 3) {
      // Pad with generic items if needed
      while (script.items.length < 3) {
        script.items.push({
          number: script.items.length + 1,
          text: `POINT ${script.items.length + 1}`,
          subtitle: '',
          duration: 4,
          searchQuery: 'travel destination',
        });
      }
    }

    // Ensure best item FIRST (re-sort by number if needed)
    script.items.forEach((item, i) => {
      item.number = i + 1;
    });

    // Ensure defaults
    script.type = 'listicle';
    script.series = series;
    script.hook = {
      text: (script.hook.text || article.title).toUpperCase(),
      duration: script.hook.duration || 2.5,
      searchQuery: script.hook.searchQuery || 'travel aerial',
    };
    script.cta = {
      text: (script.cta?.text || 'ENREGISTRE POUR TON PROCHAIN VOYAGE').toUpperCase(),
      duration: script.cta?.duration || 3,
    };
    script.mood = script.mood || 'upbeat';
    script.hashtags = script.hashtags || ['#FlashVoyage', '#Voyage'];
    script.caption = script.caption || `${script.hook.text}\n\n${script.hashtags.join(' ')}`;

    // Ensure all item texts are CAPS
    script.items = script.items.map(item => ({
      ...item,
      text: (item.text || '').toUpperCase(),
      subtitle: item.subtitle || '',
    }));

    // ── Pipe through hook validator ──────────────────────────────────────────
    const scenesForValidation = [
      { text: script.hook.text, isHook: true },
      ...script.items.map(item => ({ text: item.text, isItem: true, subtitle: item.subtitle })),
      { text: script.cta.text, isCta: true },
    ];

    const validatedScenes = await validateHooks(scenesForValidation);

    // Apply validated texts back
    script.hook.text = validatedScenes[0].text;
    for (let i = 0; i < script.items.length; i++) {
      script.items[i].text = validatedScenes[i + 1].text;
    }
    script.cta.text = validatedScenes[validatedScenes.length - 1].text;

    // Calculate total duration
    const totalDuration = script.hook.duration
      + script.items.reduce((sum, item) => sum + (item.duration || 4), 0)
      + script.cta.duration;

    console.log(`[REEL/LISTICLE] Generated: ${script.items.length} items, series="${series}", ~${totalDuration}s`);

    return script;

  } catch (err) {
    console.error(`[REEL/LISTICLE] Script generation failed: ${err.message}`);
    return getFallbackListicleScript(article, series);
  }
}

// ── Manual extraction fallback ───────────────────────────────────────────────

function extractScriptManually(jsonStr, series) {
  const hookMatch = jsonStr.match(/"hook"\s*:\s*\{[^}]*"text"\s*:\s*"([^"]+)"/);
  const itemMatches = [...jsonStr.matchAll(/"text"\s*:\s*"([^"]+)"[^}]*"subtitle"\s*:\s*"([^"]*)"/g)];
  const ctaMatch = jsonStr.match(/"cta"\s*:\s*\{[^}]*"text"\s*:\s*"([^"]+)"/);
  const moodMatch = jsonStr.match(/"mood"\s*:\s*"([^"]+)"/);

  if (!hookMatch && itemMatches.length === 0) {
    throw new Error('Could not extract any content from malformed JSON');
  }

  return {
    type: 'listicle',
    series,
    hook: {
      text: hookMatch ? hookMatch[1] : 'FLASH VOYAGE',
      duration: 2.5,
      searchQuery: 'travel aerial',
    },
    items: itemMatches.length > 0
      ? itemMatches.map((m, i) => ({
          number: i + 1,
          text: m[1],
          subtitle: m[2] || '',
          duration: 4,
          searchQuery: 'travel',
        }))
      : [
          { number: 1, text: 'POINT CLE 1', subtitle: '', duration: 4, searchQuery: 'travel' },
          { number: 2, text: 'POINT CLE 2', subtitle: '', duration: 4, searchQuery: 'travel' },
          { number: 3, text: 'POINT CLE 3', subtitle: '', duration: 4, searchQuery: 'travel' },
        ],
    cta: {
      text: ctaMatch ? ctaMatch[1] : 'ENREGISTRE POUR TON PROCHAIN VOYAGE',
      duration: 3,
    },
    mood: moodMatch ? moodMatch[1] : 'upbeat',
    hashtags: ['#FlashVoyage', '#Voyage'],
    caption: '',
  };
}

// ── Fallback script ──────────────────────────────────────────────────────────

function getFallbackListicleScript(article, series) {
  const title = (article.title || 'FLASH VOYAGE').toUpperCase();
  const stats = (article.keyStats || []).map(s => typeof s === 'object' ? s.value : s);

  console.warn(`[REEL/LISTICLE] Using fallback listicle script for series: ${series}`);

  return {
    type: 'listicle',
    series,
    hook: {
      text: title.slice(0, 80),
      duration: 2.5,
      searchQuery: 'travel aerial',
    },
    items: [
      { number: 1, text: stats[0] ? stats[0].toUpperCase() : 'LE POINT CLE N1', subtitle: '', duration: 4, searchQuery: 'travel destination' },
      { number: 2, text: stats[1] ? stats[1].toUpperCase() : 'LE POINT CLE N2', subtitle: '', duration: 4, searchQuery: 'travel adventure' },
      { number: 3, text: stats[2] ? stats[2].toUpperCase() : 'LE POINT CLE N3', subtitle: '', duration: 4, searchQuery: 'travel sunset' },
    ],
    cta: {
      text: 'ENREGISTRE POUR TON PROCHAIN VOYAGE',
      duration: 3,
    },
    mood: 'upbeat',
    hashtags: ['#FlashVoyage', '#Voyage', '#Listicle'],
    caption: `${title}\n\n#FlashVoyage #Voyage`,
  };
}
