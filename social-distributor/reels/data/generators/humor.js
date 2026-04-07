/**
 * Humor Generator v5 — Setup + Punchline Architecture
 *
 * BREAKING CHANGE from v4: output now includes `setup` and `punchline` as
 * separate fields (in addition to legacy `situation` for backward compat).
 *
 * Strategy:
 *   80% → Template path: pick a proven template, fill slots, split into setup/punchline
 *   20% → Haiku creative path: generate 5 setup+punchline pairs, score, pick best
 *
 * Output interface:
 *   { setup, punchline, situation, reactionEmoji, setupFontSize, punchlineFontSize,
 *     pexelsQuery, caption, hashtags, _meta }
 *
 * Cost: ~$0.003 per joke (template path = 1 Haiku call)
 *       ~$0.008 per joke (creative path = 2 Haiku calls)
 */

import { createTrackedClient } from '../../tracked-anthropic.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Lazy Anthropic client ──────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('humor-generator');
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

/**
 * Compute font size based on text length.
 * Adjusted for the split layout — each part has less space.
 */
function computeSetupFontSize(text) {
  const len = text.length;
  if (len < 25) return 64;
  if (len <= 40) return 56;
  if (len <= 60) return 48;
  if (len <= 80) return 42;
  return 38;
}

function computePunchlineFontSize(text) {
  const len = text.length;
  if (len < 20) return 68;
  if (len <= 35) return 58;
  if (len <= 50) return 50;
  if (len <= 70) return 44;
  return 38;
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

/**
 * Truncate text to maxLen characters, adding "..." if needed.
 */
function truncate(text, maxLen) {
  if (!text) return '';
  text = text.trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3).trim() + '...';
}

/**
 * Build the standardized output object from setup + punchline.
 */
function buildOutput(setup, punchline, { emoji, pexelsQuery, caption, hashtags, shareability, meta }) {
  // Enforce max lengths for safe zone display
  setup = truncate(setup, 80);
  punchline = truncate(punchline, 60);

  // Legacy `situation` field = full joke for caption/backward compat
  const situation = `${setup} ... ${punchline}`;

  return {
    setup: setup.toUpperCase(),
    punchline: punchline.toUpperCase(),
    situation: situation.toUpperCase(),
    reactionEmoji: emoji || pickRandom(REACTION_EMOJIS),
    setupFontSize: computeSetupFontSize(setup),
    punchlineFontSize: computePunchlineFontSize(punchline),
    // Legacy field kept for backward compat
    fontSize: computeSetupFontSize(setup),
    pexelsQuery: pexelsQuery || 'travel funny reaction',
    caption: caption || `${setup}\n...\n${punchline}\n\n${shareability || 'Envoie ca a un pote qui comprend 😂'}\n\n#FlashVoyage #VoyageMeme #VoyageHumour`,
    hashtags: hashtags || ['#FlashVoyage', '#VoyageMeme', '#VoyageHumour', '#AsieDuSudEst', '#BackpackerLife'],
    _meta: meta || {},
  };
}

// ── Setup + Punchline examples for few-shot ─────────────────────────────

const JOKE_EXAMPLES = [
  {
    setup: "Quand tu dis '2 semaines en Thailande'",
    punchline: "6 mois plus tard t'es toujours la",
    emoji: '🇹🇭',
  },
  {
    setup: "Le niveau de confiance quand tu traverses la rue a Hanoi",
    punchline: "vs quand tu traverses a Paris",
    emoji: '🛵',
  },
  {
    setup: "Booker un hotel a 8 EUR la nuit",
    punchline: "et s'attendre au Ritz",
    emoji: '🏨',
  },
  {
    setup: "Dire 'je pars 2 semaines'",
    punchline: "Vendre son appart, devenir prof de yoga a Bali",
    emoji: '🧘',
  },
  {
    setup: "Moi qui explique a ma mere que vivre a Chiang Mai",
    punchline: "c'est un plan de carriere",
    emoji: '💀',
  },
  {
    setup: "Le retour au bureau apres 2 semaines en Asie",
    punchline: "Chaque email est une attaque personnelle",
    emoji: '😤',
  },
  {
    setup: "Mon compte en banque avant le Vietnam",
    punchline: "vs apres le Vietnam (aucun regret)",
    emoji: '🥲',
  },
  {
    setup: "Manger un pad thai a 1.50 EUR en Thailande",
    punchline: "Repenser a ta salade Pret a Manger a 12 EUR",
    emoji: '🍜',
  },
];

// ── PATH A: Template Mad-Libs (80%) ─────────────────────────────────────

/**
 * Pick a template from humor-templates.json, fill slots, then use Haiku
 * to split the result into setup + punchline.
 */
async function generateFromTemplate(article) {
  const db = getHumorDB();
  const destination = extractDestination(article);
  const duration = extractDuration(article);

  // Pick a random template
  const template = pickRandom(db.templates);

  // Pick 3 setup/punchline examples for few-shot
  const shuffledExamples = [...JOKE_EXAMPLES].sort(() => Math.random() - 0.5);
  const examples = shuffledExamples.slice(0, 4);

  const examplesText = examples.map((e, i) =>
    `${i + 1}. SETUP: "${e.setup}" → PUNCHLINE: "${e.punchline}" ${e.emoji}`
  ).join('\n');

  // Build slot options string
  const slotsInfo = Object.entries(template.slots)
    .map(([key, options]) => `  {${key}}: options = ${JSON.stringify(options)}`)
    .join('\n');

  const client = getClient();
  if (!client) {
    return fillSlotsRandom(template, destination, duration, db);
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    temperature: 0.5,
    system: `Tu es un humoriste viral voyage. Tu ecris des blagues en 2 parties : SETUP (la situation) et PUNCHLINE (la chute surprenante). La punchline doit creer un CONTRASTE, une SURPRISE, ou un TWIST inattendu. JAMAIS une observation plate.`,
    messages: [{
      role: 'user',
      content: `CONTEXTE : Article sur ${destination}, ${duration}

TEMPLATE DE BASE : "${template.template}"
SLOTS :
${slotsInfo}

REMPLACE {destination} par "${destination}" si le slot existe.
REMPLACE {durée} par "${duration}" si le slot existe.

EXEMPLES DE BONNES BLAGUES (setup → punchline) :
${examplesText}

CONSIGNES :
- Ecris la blague en 2 parties SEPAREES
- Le SETUP pose la situation (max 60 chars)
- La PUNCHLINE est le twist/chute (max 45 chars)
- La punchline doit SURPRENDRE — pas juste continuer le setup
- Accents francais obligatoires

REPONDS EXACTEMENT dans ce format, rien d'autre :
SETUP: [le setup]
PUNCHLINE: [la chute]`
    }],
  });

  const text = response.content[0]?.text?.trim() || '';
  const parsed = parseSetupPunchline(text);

  if (!parsed) {
    console.warn(`[HUMOR-V5] Failed to parse template response, random fill fallback`);
    return fillSlotsRandom(template, destination, duration, db);
  }

  console.log(`[HUMOR-V5] Template path: "${parsed.setup}" → "${parsed.punchline}" (${template.mechanic})`);

  return buildOutput(parsed.setup, parsed.punchline, {
    emoji: template.emoji || pickRandom(REACTION_EMOJIS),
    pexelsQuery: template.pexelsQuery || 'travel funny reaction',
    shareability: template.shareability || 'Envoie ca a un pote qui comprend 😂',
    meta: { path: 'template', templateId: template.id, mechanic: template.mechanic, haikuCalls: 1 },
  });
}

/**
 * Random slot filling fallback (no Haiku needed).
 * Splits the filled template at a natural break point.
 */
function fillSlotsRandom(template, destination, duration, db) {
  let joke = template.template;

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

  joke = joke.replace(/\{destination\}/gi, destination);
  joke = joke.replace(/\{dur[ée]+\}/gi, duration);

  // Try to split at natural break points
  const { setup, punchline } = splitJokeText(joke);

  console.log(`[HUMOR-V5] Random fill: "${setup}" → "${punchline}"`);

  return buildOutput(setup, punchline, {
    emoji: template.emoji || pickRandom(REACTION_EMOJIS),
    pexelsQuery: template.pexelsQuery || 'travel adventure',
    shareability: 'Envoie ca a un pote 😂',
    meta: { path: 'random_fill', templateId: template.id },
  });
}

// ── PATH B: Haiku Creative (20%) ────────────────────────────────────────

/**
 * Let Haiku generate original setup+punchline jokes.
 * Generate 5 candidates, score them, pick the best.
 */
async function generateCreative(article) {
  const db = getHumorDB();
  const destination = extractDestination(article);
  const duration = extractDuration(article);

  const shuffledExamples = [...JOKE_EXAMPLES].sort(() => Math.random() - 0.5);
  const examples = shuffledExamples.slice(0, 5).map((e, i) =>
    `${i + 1}. SETUP: "${e.setup}" → PUNCHLINE: "${e.punchline}"`
  ).join('\n');

  const client = getClient();
  if (!client) throw new Error('ANTHROPIC_API_KEY not set');

  // ── Call 1: Generate 5 setup+punchline pairs ──────────────────────────
  console.log(`[HUMOR-V5] Creative path: generating 5 setup+punchline pairs...`);

  const genResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    temperature: 0.5,
    system: `Tu es un HUMORISTE viral francophone specialise voyage Asie du Sud-Est.

REGLE D'OR : Chaque blague a 2 parties.
- SETUP = la situation relatable (ce que tout le monde connait)
- PUNCHLINE = le twist, la chute, le contraste inattendu

THÉORIE : L'humour = VIOLATION BÉNIGNE. Le setup est "normal", la punchline revele quelque chose de "wrong" mais inoffensif.

ANTI-PATTERNS (INTERDIT) :
- Observations plates sans twist ("le pad thai c'est bon")
- Punchline qui repete le setup en d'autres mots
- Blagues qui necessitent contexte specifique
- Expliquer la blague
- Etre wholesome ou inspirant
- Punchline = juste un prix ou un fait

MECANIQUES QUI MARCHENT :
- Contraste avant/apres ("avant: X, apres: Y completement different")
- Escalade absurde ("2 semaines" → "6 mois" → "prof de yoga a Bali")
- Subversion d'attente (le setup promet une chose, la punchline livre l'oppose)
- Hyperbole relatable (exagerer un vecu universel)
- Comparaison injuste (prix Asie vs prix France = douleur)`,
    messages: [{
      role: 'user',
      content: `DESTINATION : ${destination}
DURÉE : ${duration}
ARTICLE : ${article.title || 'Voyage en Asie'}

EXEMPLES VIRAUX (setup → punchline) :
${examples}

Genere 5 blagues DIFFERENTES sur ${destination}. Chaque blague DOIT avoir :
- Un SETUP (situation relatable, max 60 chars)
- Une PUNCHLINE (twist/chute, max 45 chars)
- La punchline SURPREND — elle n'est pas la suite logique du setup
- Francais casual avec accents

FORMAT EXACT (une blague par bloc, numerotees 1-5) :
1. SETUP: [texte] | PUNCHLINE: [texte]
2. SETUP: [texte] | PUNCHLINE: [texte]
...

RIEN d'autre.`
    }],
  });

  const genText = genResponse.content[0]?.text?.trim() || '';
  const candidates = parseCreativeCandidates(genText);

  if (candidates.length === 0) {
    console.warn(`[HUMOR-V5] No candidates generated, falling back to template`);
    return generateFromTemplate(article);
  }

  console.log(`[HUMOR-V5] Got ${candidates.length} candidates:`);
  candidates.forEach((c, i) => console.log(`  ${i + 1}. "${c.setup}" → "${c.punchline}"`));

  // ── Call 2: Score all candidates ──────────────────────────────────────
  console.log(`[HUMOR-V5] Scoring candidates...`);

  const candidatesForScoring = candidates.map((c, i) =>
    `${i + 1}. SETUP: "${c.setup}" → PUNCHLINE: "${c.punchline}"`
  ).join('\n');

  const scoreResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    temperature: 0,
    system: `Tu es un CRITIQUE D'HUMOUR severe. Tu notes des blagues voyage sur la QUALITE DE LA PUNCHLINE.
Un 5/10 = sourire poli. Un 7/10 = la personne sourit. Un 8/10 = elle envoie a un ami. Un 9/10 = partagee en story. Un 10/10 = virale.

CRITERES :
- La punchline SURPREND-elle ? (twist inattendu = +2 points)
- Le contraste setup/punchline est-il fort ? (+2 points)
- C'est relatable pour un voyageur francais ? (+1 point)
- Ca tient en 3 secondes de lecture ? (+1 point)
- C'est juste une observation plate sans chute ? (-3 points)

Sois SEVERE. La plupart des blagues meritent 4-6/10.`,
    messages: [{
      role: 'user',
      content: `Note chaque blague. Test : "Est-ce que la PUNCHLINE me surprend ?"

${candidatesForScoring}

Reponds avec JUSTE les numeros et scores : "1:7 2:5 3:8 4:4 5:6". RIEN d'autre.`
    }],
  });

  const scoreText = scoreResponse.content[0]?.text?.trim() || '';
  const scores = parseScores(scoreText, candidates.length);

  let bestIdx = 0;
  let bestScore = 0;
  scores.forEach((score, idx) => {
    if (score > bestScore) { bestScore = score; bestIdx = idx; }
  });

  const best = candidates[bestIdx] || candidates[0];
  console.log(`[HUMOR-V5] Winner: #${bestIdx + 1} "${best.setup}" → "${best.punchline}" (score: ${bestScore}/10)`);

  if (bestScore < 6) {
    console.log(`[HUMOR-V5] Score too low (${bestScore}), falling back to template`);
    return generateFromTemplate(article);
  }

  return buildOutput(best.setup, best.punchline, {
    emoji: pickRandom(REACTION_EMOJIS),
    pexelsQuery: `${destination.toLowerCase()} travel funny`,
    shareability: 'Envoie ca a quelqu\'un qui comprend 😂',
    hashtags: ['#FlashVoyage', '#VoyageMeme', '#VoyageHumour', '#AsieDuSudEst', '#BackpackerLife', `#${destination.replace(/\s/g, '')}`],
    meta: { path: 'creative', score: bestScore, candidateCount: candidates.length, haikuCalls: 2 },
  });
}

// ── Parsers ──────────────────────────────────────────────────────────────

/**
 * Parse "SETUP: ... PUNCHLINE: ..." format from template path.
 */
function parseSetupPunchline(text) {
  const setupMatch = text.match(/SETUP\s*:\s*(.+)/i);
  const punchlineMatch = text.match(/PUNCHLINE\s*:\s*(.+)/i);

  if (setupMatch && punchlineMatch) {
    return {
      setup: setupMatch[1].replace(/^["«»]|["«»]$/g, '').trim(),
      punchline: punchlineMatch[1].replace(/^["«»]|["«»]$/g, '').trim(),
    };
  }

  // Fallback: try splitting on common delimiters
  const parts = text.split(/\s*[→\|]\s*/);
  if (parts.length >= 2) {
    return {
      setup: parts[0].replace(/^["«»\d.)\s]+|["«»]$/g, '').trim(),
      punchline: parts.slice(1).join(' ').replace(/^["«»]|["«»]$/g, '').trim(),
    };
  }

  return null;
}

/**
 * Parse creative candidates from "1. SETUP: ... | PUNCHLINE: ..." format.
 */
function parseCreativeCandidates(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];

  for (const line of lines) {
    // Try "N. SETUP: ... | PUNCHLINE: ..."
    const match = line.match(/^\d[.)]\s*SETUP\s*:\s*(.+?)\s*[\|→]\s*PUNCHLINE\s*:\s*(.+)/i);
    if (match) {
      const setup = match[1].replace(/^["«»]|["«»]$/g, '').trim();
      const punchline = match[2].replace(/^["«»]|["«»]$/g, '').trim();
      if (setup.length >= 8 && punchline.length >= 5) {
        results.push({ setup, punchline });
      }
      continue;
    }

    // Try "N. SETUP: ..." followed by next line "PUNCHLINE: ..."
    const setupOnly = line.match(/^\d[.)]\s*SETUP\s*:\s*(.+)/i);
    if (setupOnly) {
      const nextLine = lines[lines.indexOf(line) + 1];
      if (nextLine) {
        const punchMatch = nextLine.match(/PUNCHLINE\s*:\s*(.+)/i);
        if (punchMatch) {
          const setup = setupOnly[1].replace(/^["«»]|["«»]$/g, '').trim();
          const punchline = punchMatch[1].replace(/^["«»]|["«»]$/g, '').trim();
          if (setup.length >= 8 && punchline.length >= 5) {
            results.push({ setup, punchline });
          }
        }
      }
    }
  }

  return results;
}

function parseScores(text, count) {
  const scores = new Array(count).fill(5);
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

/**
 * Split a single joke text into setup + punchline at natural break points.
 * Used as fallback when Haiku is not available.
 */
function splitJokeText(text) {
  // Try splitting on common patterns
  const patterns = [
    /(.+?)\s*\.\.\.\s*(.+)/,           // "X ... Y"
    /(.+?)\s*—\s*(.+)/,                // "X — Y"
    /(.+?)\s+alors que\s+(.+)/i,       // "X alors que Y"
    /(.+?)\s+mais\s+(.+)/i,            // "X mais Y"
    /(.+?)\s+vs\.?\s+(.+)/i,           // "X vs Y"
    /(.+?)\s+et\s+(en fait|en vrai)\s+(.+)/i,  // "X et en fait Y"
    /(.+?)\s*\((.+)\)\s*$/,            // "X (Y)"
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const setup = match[1].trim();
      const punchline = (match[3] || match[2]).trim();
      if (setup.length >= 8 && punchline.length >= 5) {
        return { setup, punchline };
      }
    }
  }

  // Last resort: split roughly in half at a word boundary
  const mid = Math.floor(text.length * 0.55);
  const spaceIdx = text.indexOf(' ', mid);
  if (spaceIdx > 0) {
    return {
      setup: text.slice(0, spaceIdx).trim(),
      punchline: text.slice(spaceIdx).trim(),
    };
  }

  return { setup: text, punchline: '...' };
}

// ── Main export ──────────────────────────────────────────────────────────

/**
 * Generate a humor script for a reel.
 * 80% template mad-libs, 20% Haiku creative.
 * Always returns setup + punchline as separate fields.
 *
 * @param {Object} article - { title, hook, keyStats, ... }
 * @returns {Promise<{ setup, punchline, situation, reactionEmoji, setupFontSize, punchlineFontSize, fontSize, pexelsQuery, caption, hashtags, _meta }>}
 */
export async function generateHumorScript(article) {
  const useTemplate = Math.random() < TEMPLATE_PROBABILITY;

  console.log(`[HUMOR-V5] Path: ${useTemplate ? 'TEMPLATE (80%)' : 'CREATIVE (20%)'}`);

  try {
    if (useTemplate) {
      return await generateFromTemplate(article);
    } else {
      return await generateCreative(article);
    }
  } catch (err) {
    console.error(`[HUMOR-V5] Error: ${err.message}, using gold standard fallback`);
    return goldStandardFallback(article);
  }
}

/**
 * Emergency fallback: pick a JOKE_EXAMPLES entry and swap in the destination.
 */
function goldStandardFallback(article) {
  const destination = extractDestination(article);
  const example = pickRandom(JOKE_EXAMPLES);

  let setup = example.setup;
  let punchline = example.punchline;

  // Swap destination references
  setup = setup.replace(/Thailande|Thaïlande/gi, destination);
  setup = setup.replace(/Asie du Sud-Est/gi, destination);
  setup = setup.replace(/Bangkok|Phuket|Chiang Mai|Hanoi|Bali|Vietnam/gi, destination);
  punchline = punchline.replace(/Thailande|Thaïlande/gi, destination);
  punchline = punchline.replace(/Bangkok|Phuket|Chiang Mai|Hanoi|Bali|Vietnam/gi, destination);

  return buildOutput(setup, punchline, {
    emoji: example.emoji || pickRandom(REACTION_EMOJIS),
    pexelsQuery: 'travel funny reaction',
    shareability: 'Envoie ca a un pote 😂',
    meta: { path: 'gold_fallback' },
  });
}
