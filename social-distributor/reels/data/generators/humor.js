/**
 * Humor Generator v4 — Hybrid Template Mad-Libs + Haiku Boosted
 *
 * Strategy:
 *   80% → Template path: pick a proven template, fill slots from article context
 *   20% → Haiku creative path: temp 0.5, Benign Violation Theory, 5 candidates → critic
 *
 * Both paths produce the same output interface:
 *   { situation, reactionEmoji, fontSize, pexelsQuery, caption, hashtags, _meta }
 *
 * Cost: ~$0.003 per joke (template path = 1 Haiku call for slot-filling)
 *       ~$0.008 per joke (creative path = 2 Haiku calls)
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Lazy Anthropic client ──────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ── Load templates DBs ───────────────────────────────────────────────────

let _humorDB = null;
function getHumorDB() {
  if (_humorDB) return _humorDB;
  const path = join(__dirname, '..', 'humor-templates.json');
  _humorDB = JSON.parse(readFileSync(path, 'utf-8'));
  return _humorDB;
}

// ── Constants ────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';
const REACTION_EMOJIS = ['😱', '🤣', '😭', '💀', '🫠', '😅', '🥲', '😤', '🤡', '😎'];
const TEMPLATE_PROBABILITY = 0.8; // 80% template, 20% creative

// ── Utils ────────────────────────────────────────────────────────────────

function computeFontSize(text) {
  const len = text.length;
  if (len < 30) return 80;
  if (len <= 50) return 68;
  if (len <= 70) return 58;
  return 50;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function extractDestination(article) {
  const title = (article.title || '').toLowerCase();
  const destinations = [
    'bali', 'thailande', 'thaïlande', 'vietnam', 'philippines', 'cambodge',
    'laos', 'japon', 'singapour', 'malaisie', 'indonesie', 'indonésie',
    'myanmar', 'sri lanka', 'bangkok', 'chiang mai', 'phuket', 'koh samui',
    'koh phangan', 'ubud', 'hanoi', 'ho chi minh', 'da nang', 'hoi an',
    'siem reap', 'luang prabang', 'manille', 'el nido', 'siargao',
  ];
  for (const d of destinations) {
    if (title.includes(d)) return d.charAt(0).toUpperCase() + d.slice(1);
  }
  return 'Asie du Sud-Est';
}

function extractDuration(article) {
  const title = (article.title || '') + ' ' + (article.hook || '');
  const match = title.match(/(\d+)\s*(?:jours?|semaines?|j\b)/i);
  if (match) {
    const n = parseInt(match[1]);
    if (title.includes('semaine')) return `${n} semaine${n > 1 ? 's' : ''}`;
    return `${n} jour${n > 1 ? 's' : ''}`;
  }
  return '2 semaines';
}

// ── PATH A: Template Mad-Libs (80%) ─────────────────────────────────────

/**
 * Pick a template from humor-templates.json and fill slots with article context.
 * Uses 1 Haiku call to fill slots intelligently (not random picks).
 */
async function generateFromTemplate(article) {
  const db = getHumorDB();
  const destination = extractDestination(article);
  const duration = extractDuration(article);

  // Pick a random template
  const template = pickRandom(db.templates);

  // Pick 3 gold standard examples for few-shot
  const shuffledGold = [...db.gold_standard].sort(() => Math.random() - 0.5);
  const examples = shuffledGold.slice(0, 3);

  const examplesText = examples.map((g, i) =>
    `${i + 1}. "${g.text}" (${g.mechanic}, ${g.emoji})`
  ).join('\n');

  // Build slot options string
  const slotsInfo = Object.entries(template.slots)
    .map(([key, options]) => `  {${key}}: options = ${JSON.stringify(options)}`)
    .join('\n');

  const client = getClient();
  if (!client) {
    // Fallback: random slot filling without Haiku
    return fillSlotsRandom(template, destination, duration, db);
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    temperature: 0.5,
    system: `Tu remplis les slots d'un template de blague voyage. Choisis les options les plus DROLES pour le contexte donne. Reponds UNIQUEMENT avec la blague finale (pas de JSON, pas d'explication).`,
    messages: [{
      role: 'user',
      content: `CONTEXTE : Article sur ${destination}, ${duration}

TEMPLATE : "${template.template}"
SLOTS DISPONIBLES :
${slotsInfo}

REMPLACE {destination} par "${destination}" si le slot existe.
REMPLACE {durée} par "${duration}" si le slot existe.

EXEMPLES DE BLAGUES QUI MARCHENT :
${examplesText}

Ecris JUSTE la blague finale, rien d'autre. Max 70 caractères. Accents français obligatoires.`
    }],
  });

  let joke = response.content[0]?.text?.trim() || '';

  // Clean up: remove quotes, trim
  joke = joke.replace(/^["«»]|["«»]$/g, '').trim();

  // Truncate if needed
  if (joke.length > 80) {
    joke = joke.slice(0, 77) + '...';
  }

  // If Haiku returned garbage, use random fill
  if (joke.length < 10) {
    return fillSlotsRandom(template, destination, duration, db);
  }

  console.log(`[HUMOR-V4] Template path: "${joke}" (${template.mechanic})`);

  return {
    situation: joke.toUpperCase(),
    reactionEmoji: template.emoji || pickRandom(REACTION_EMOJIS),
    fontSize: computeFontSize(joke),
    pexelsQuery: template.pexelsQuery || 'travel funny reaction',
    caption: `${joke}\n\n${template.shareability || 'Envoie ça à un pote qui comprend 😂'}\n\n#FlashVoyage #VoyageMeme #VoyageHumour`,
    hashtags: ['#FlashVoyage', '#VoyageMeme', '#VoyageHumour', '#AsieDuSudEst', '#BackpackerLife'],
    _meta: { path: 'template', templateId: template.id, mechanic: template.mechanic, haikuCalls: 1 },
  };
}

/**
 * Random slot filling fallback (no Haiku needed).
 */
function fillSlotsRandom(template, destination, duration, db) {
  let joke = template.template;

  // Replace known slots
  for (const [key, options] of Object.entries(template.slots)) {
    const placeholder = `{${key}}`;
    if (key === 'destination' || key.includes('destination')) {
      joke = joke.replace(placeholder, destination);
    } else if (key === 'durée' || key === 'duration') {
      joke = joke.replace(placeholder, duration);
    } else if (Array.isArray(options) && options.length > 0) {
      joke = joke.replace(placeholder, pickRandom(options));
    }
  }

  // Replace any remaining {destination} or {durée}
  joke = joke.replace(/\{destination\}/gi, destination);
  joke = joke.replace(/\{dur[ée]+\}/gi, duration);

  console.log(`[HUMOR-V4] Random fill fallback: "${joke}"`);

  return {
    situation: joke.toUpperCase(),
    reactionEmoji: template.emoji || pickRandom(REACTION_EMOJIS),
    fontSize: computeFontSize(joke),
    pexelsQuery: template.pexelsQuery || 'travel adventure',
    caption: `${joke}\n\nEnvoie ça à un pote 😂\n\n#FlashVoyage #VoyageMeme`,
    hashtags: ['#FlashVoyage', '#VoyageMeme', '#VoyageHumour'],
    _meta: { path: 'random_fill', templateId: template.id },
  };
}

// ── PATH B: Haiku Creative (20%) ────────────────────────────────────────

/**
 * Let Haiku generate an original joke using Benign Violation Theory.
 * Generate 5 candidates, score them, pick the best.
 */
async function generateCreative(article) {
  const db = getHumorDB();
  const destination = extractDestination(article);
  const duration = extractDuration(article);

  // Pick 5 gold examples for few-shot
  const shuffledGold = [...db.gold_standard].sort(() => Math.random() - 0.5);
  const examples = shuffledGold.slice(0, 5).map((g, i) =>
    `${i + 1}. "${g.text}"`
  ).join('\n');

  const client = getClient();
  if (!client) throw new Error('ANTHROPIC_API_KEY not set');

  // ── Call 1: Generate 5 candidates ───────────────────────────────────
  console.log(`[HUMOR-V4] Creative path: generating 5 candidates...`);

  const genResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    temperature: 0.5,
    system: `Tu es un HUMORISTE viral francophone specialise voyage Asie du Sud-Est.

THÉORIE : L'humour = VIOLATION BÉNIGNE. Trouve un aspect du voyage qui est "wrong" (galère, absurde, injuste) mais inoffensif et relatable. La blague doit provoquer un "j'envoie ça à mon pote".

ANTI-PATTERNS (ne fais JAMAIS ça) :
- Observations plates sans twist ("le pad thai coûte pas cher")
- Prix comme punchline sans contexte émotionnel
- Blagues qui nécessitent de connaître l'article
- Expliquer la blague
- Être wholesome ou inspirant

FORMATS QUI MARCHENT :
- "Quand tu [situation universelle]" + twist inattendu
- "Moi qui [setup normal] alors que [réalité absurde]"
- "Les potes à [heure] après [galère commune]"
- "Le premier [moment] après [le voyage]"
- "Regarder [chose normale] après [expérience voyage]"
- "[Sujet sérieux]... c'est parce que tu [twist voyage]"`,
    messages: [{
      role: 'user',
      content: `DESTINATION : ${destination}
DURÉE : ${duration}
ARTICLE : ${article.title || 'Voyage en Asie'}

EXEMPLES DE BLAGUES VIRALES (score 8+/10) :
${examples}

Génère 5 blagues DIFFÉRENTES sur ${destination}. Chaque blague doit :
- Être une situation UNIVERSELLE que tout voyageur connaît
- Avoir un TWIST ou CONTRASTE (pas une observation plate)
- Faire max 60 caractères
- Être en français casual avec accents
- Finir par un kicker entre parenthèses si ça aide : (aucun regret), (help), (ça valait le coup), (lol), (surtout pas à elle/lui)

UNE blague par ligne, numérotées 1-5. RIEN d'autre.`
    }],
  });

  const genText = genResponse.content[0]?.text?.trim() || '';
  const candidates = parseCandidates(genText);

  if (candidates.length === 0) {
    console.warn(`[HUMOR-V4] No candidates generated, falling back to template`);
    return generateFromTemplate(article);
  }

  console.log(`[HUMOR-V4] Got ${candidates.length} candidates:`);
  candidates.forEach((c, i) => console.log(`  ${i + 1}. "${c}"`));

  // ── Call 2: Score all candidates ────────────────────────────────────
  console.log(`[HUMOR-V4] Scoring candidates...`);

  const scoreResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    temperature: 0,
    system: `Tu es un CRITIQUE D'HUMOUR sévère. Tu notes des blagues voyage.
Un 7/10 = la personne sourit. Un 8/10 = elle envoie à un ami. Un 9/10 = elle la partage en story. Un 10/10 = virale.
Sois SÉVÈRE. La plupart des blagues méritent 4-6/10.`,
    messages: [{
      role: 'user',
      content: `Note chaque blague de 1 à 10. Test : "Est-ce que j'enverrais ça à un ami ?"

${candidates.map((c, i) => `${i + 1}. "${c}"`).join('\n')}

Réponds avec JUSTE les numéros et scores, format "1:7 2:5 3:8 4:4 5:6". RIEN d'autre.`
    }],
  });

  const scoreText = scoreResponse.content[0]?.text?.trim() || '';
  const scores = parseScores(scoreText, candidates.length);

  // Find best candidate
  let bestIdx = 0;
  let bestScore = 0;
  scores.forEach((score, idx) => {
    if (score > bestScore) { bestScore = score; bestIdx = idx; }
  });

  const bestJoke = candidates[bestIdx] || candidates[0];
  console.log(`[HUMOR-V4] Winner: #${bestIdx + 1} "${bestJoke}" (score: ${bestScore}/10)`);

  // If best score < 6, fall back to template
  if (bestScore < 6) {
    console.log(`[HUMOR-V4] Score too low (${bestScore}), falling back to template`);
    return generateFromTemplate(article);
  }

  return {
    situation: bestJoke.toUpperCase(),
    reactionEmoji: pickRandom(REACTION_EMOJIS),
    fontSize: computeFontSize(bestJoke),
    pexelsQuery: `${destination.toLowerCase()} travel funny`,
    caption: `${bestJoke}\n\nEnvoie ça à quelqu'un qui comprend 😂\n\n#FlashVoyage #VoyageMeme #VoyageHumour`,
    hashtags: ['#FlashVoyage', '#VoyageMeme', '#VoyageHumour', '#AsieDuSudEst', '#BackpackerLife', `#${destination.replace(/\s/g, '')}`],
    _meta: { path: 'creative', score: bestScore, candidateCount: candidates.length, haikuCalls: 2 },
  };
}

// ── Parsers ──────────────────────────────────────────────────────────────

function parseCandidates(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  for (const line of lines) {
    const match = line.match(/^[1-9][.)]\s*(.+)/);
    if (match) {
      let joke = match[1].trim().replace(/^["«»]|["«»]$/g, '').trim();
      if (joke.length > 10 && joke.length <= 80) results.push(joke);
    }
  }
  return results;
}

function parseScores(text, count) {
  const scores = new Array(count).fill(5); // default 5
  // Try "1:7 2:5 3:8" format
  const matches = [...text.matchAll(/(\d+)\s*[:\-=]\s*(\d+)/g)];
  for (const m of matches) {
    const idx = parseInt(m[1]) - 1;
    const score = parseInt(m[2]);
    if (idx >= 0 && idx < count && score >= 1 && score <= 10) {
      scores[idx] = score;
    }
  }
  return scores;
}

// ── Main export ──────────────────────────────────────────────────────────

/**
 * Generate a humor script for a reel.
 * 80% of the time uses template mad-libs, 20% lets Haiku be creative.
 *
 * @param {Object} article - { title, hook, keyStats, ... }
 * @returns {Promise<{ situation, reactionEmoji, fontSize, pexelsQuery, caption, hashtags, _meta }>}
 */
export async function generateHumorScript(article) {
  const useTemplate = Math.random() < TEMPLATE_PROBABILITY;

  console.log(`[HUMOR-V4] Path: ${useTemplate ? 'TEMPLATE (80%)' : 'CREATIVE (20%)'}`);

  try {
    if (useTemplate) {
      return await generateFromTemplate(article);
    } else {
      return await generateCreative(article);
    }
  } catch (err) {
    console.error(`[HUMOR-V4] Error: ${err.message}, using gold standard fallback`);
    return goldStandardFallback(article);
  }
}

/**
 * Emergency fallback: pick a gold standard joke and swap in the destination.
 */
function goldStandardFallback(article) {
  const db = getHumorDB();
  const destination = extractDestination(article);
  const gold = pickRandom(db.gold_standard);
  let joke = gold.text;

  // Swap destination references
  joke = joke.replace(/Thailande|Thaïlande/gi, destination);
  joke = joke.replace(/Asie du Sud-Est/gi, destination);
  joke = joke.replace(/Bangkok|Phuket|Chiang Mai/gi, destination);

  return {
    situation: joke.toUpperCase(),
    reactionEmoji: gold.emoji || pickRandom(REACTION_EMOJIS),
    fontSize: computeFontSize(joke),
    pexelsQuery: gold.pexelsQuery || 'travel funny reaction',
    caption: `${joke}\n\n${gold.shareability || 'Envoie ça à un pote 😂'}\n\n#FlashVoyage #VoyageMeme`,
    hashtags: ['#FlashVoyage', '#VoyageMeme', '#VoyageHumour'],
    _meta: { path: 'gold_fallback', goldId: gold.id },
  };
}
