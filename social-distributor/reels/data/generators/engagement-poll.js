/**
 * Engagement Poll Generator — FlashVoyage Reels v2
 *
 * Generates polarizing travel poll content using Claude Haiku.
 * Designed for the simplest reel format: single scene, 5 seconds,
 * photo background + dark overlay + question + numbered options.
 *
 * Output: { question, options, pexelsQuery, caption, hashtags }
 */

import { createTrackedClient } from '../../tracked-anthropic.js';

// ── Lazy Anthropic client (same pattern as listicle-script-generator.js) ────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('poll-generator');
  return _client;
}

// ── Haiku prompt ────────────────────────────────────────────────────────────

const POLL_PROMPT = `Tu es un créateur de Reels Instagram voyage pour le média FlashVoyage.
Tu génères des sondages polarisants et fun sur le voyage en Asie du Sud-Est.

ARTICLE TITRE : {{TITLE}}
ARTICLE ACCROCHE : {{HOOK}}
ARTICLE STATS : {{STATS}}

Génère UN sondage voyage à partir de cet article. Le sondage doit :
- Poser une question POLARISANTE ou FUN liée au voyage en Asie du Sud-Est
- Être formulé pour PROVOQUER des commentaires (les gens veulent défendre leur choix)
- Proposer 3 ou 4 options courtes (MAX 20 caractères chacune, en MAJUSCULES)
- Chaque option doit être un CHOIX CLAIR, pas une nuance

RÈGLES STRICTES :
- Question : MAX 60 caractères, EN MAJUSCULES, se termine par " ?"
- Options : 3 ou 4 options, MAX 20 caractères chacune, EN MAJUSCULES
- Accents français OBLIGATOIRES (é, è, ê, à, ç, ù, î, ô, û, ë, ï)
- PAS de hashtags dans la question ou les options
- pexelsQuery en ANGLAIS, générique (plage, temple, street food, etc.)
- Caption Instagram en français avec émojis numéros (1️⃣ 2️⃣ 3️⃣ 4️⃣)
- 6-7 hashtags pertinents voyage + Asie

Exemples de bons sondages :
- "BALI OU THAÏLANDE POUR 2 SEMAINES ?" → ["BALI", "THAÏLANDE"]
- "TON BUDGET PAR JOUR EN ASIE ?" → ["MOINS DE 20 €", "20-35 €", "35-50 €", "PLUS DE 50 €"]
- "LE MEILLEUR STREET FOOD D'ASIE ?" → ["PAD THAÏ", "PHỞ", "NASI GORENG", "RAMEN"]
- "TU VOYAGES PLUTÔT..." → ["SAC À DOS", "VALISE CABINE", "GROSSE VALISE"]

Réponds UNIQUEMENT en JSON valide (pas de texte avant ou après, pas de markdown) :
{
  "question": "QUESTION EN MAJUSCULES ?",
  "options": ["OPTION 1", "OPTION 2", "OPTION 3"],
  "pexelsQuery": "english search query for background photo",
  "optionQueries": ["english pexels query for option 1", "english pexels query for option 2"],
  "caption": "caption Instagram complète avec émojis numéros et question",
  "hashtags": ["#FlashVoyage", "#SondageVoyage", "..."]
}

IMPORTANT: optionQueries = une requête Pexels SPÉCIFIQUE par option (pour le split-screen vidéo).
Exemple: question "BALI OU THAÏLANDE ?" → optionQueries: ["bali beach temple rice field", "thailand bangkok street food temple"]`;

// ── Main generator ──────────────────────────────────────────────────────────

/**
 * Generate a polarizing travel poll from an article using Haiku.
 *
 * @param {Object} article - Extracted article data { title, hook, keyStats, ... }
 * @returns {Promise<{ question: string, options: string[], pexelsQuery: string, caption: string, hashtags: string[] }>}
 */
export async function generatePollScript(article) {
  const client = getClient();
  if (!client) {
    console.warn('[REEL/POLL] ANTHROPIC_API_KEY not set — using fallback');
    return getFallbackPoll(article);
  }

  const stats = (article.keyStats || [])
    .map(s => typeof s === 'object' ? s.value : s)
    .join(', ');

  const prompt = POLL_PROMPT
    .replace('{{TITLE}}', article.title || '')
    .replace('{{HOOK}}', article.hook || '')
    .replace('{{STATS}}', stats || 'aucune stat');

  console.log(`[REEL/POLL] Generating poll for: "${(article.title || '').slice(0, 60)}..."`);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Haiku');

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Haiku response');

    let jsonStr = jsonMatch[0];
    // Clean common LLM JSON issues
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
    jsonStr = jsonStr.replace(/,?\s*"\.\.\."\s*,?/g, '');
    jsonStr = jsonStr.replace(/[\u201c\u201d\u00ab\u00bb]/g, '\\"');

    let poll;
    try {
      poll = JSON.parse(jsonStr);
    } catch (parseErr) {
      // Regex fallback extraction
      console.warn('[REEL/POLL] JSON parse failed, trying regex extraction...');
      poll = extractPollManually(jsonStr);
    }

    // ── Validate & sanitize ──────────────────────────────────────────────────

    if (!poll.question || typeof poll.question !== 'string') {
      throw new Error('Invalid poll: missing question');
    }

    if (!poll.options || !Array.isArray(poll.options) || poll.options.length < 2) {
      throw new Error('Invalid poll: need at least 2 options');
    }

    // Enforce constraints
    poll.question = poll.question.toUpperCase().slice(0, 60);
    if (!poll.question.endsWith('?')) {
      poll.question += ' ?';
    }

    // Cap at 4 options, enforce max 20 chars each
    poll.options = poll.options.slice(0, 4).map(opt =>
      String(opt).toUpperCase().slice(0, 20)
    );

    // Ensure minimum 2 options
    if (poll.options.length < 2) {
      poll.options = ['OPTION A', 'OPTION B'];
    }

    // Defaults
    poll.pexelsQuery = poll.pexelsQuery || 'tropical beach sunset';
    poll.hashtags = poll.hashtags || ['#FlashVoyage', '#SondageVoyage', '#VoyageAsie'];
    poll.caption = poll.caption || buildCaption(poll);

    console.log(`[REEL/POLL] Generated: "${poll.question}" with ${poll.options.length} options`);

    return poll;

  } catch (err) {
    console.error(`[REEL/POLL] Haiku failed: ${err.message}, using fallback`);
    return getFallbackPoll(article);
  }
}

// ── Regex fallback extraction ───────────────────────────────────────────────

function extractPollManually(jsonStr) {
  const questionMatch = jsonStr.match(/"question"\s*:\s*"([^"]+)"/);
  const optionsMatch = [...jsonStr.matchAll(/"options"\s*:\s*\[([\s\S]*?)\]/g)];
  const pexelsMatch = jsonStr.match(/"pexelsQuery"\s*:\s*"([^"]+)"/);
  const captionMatch = jsonStr.match(/"caption"\s*:\s*"([^"]+)"/);

  const question = questionMatch ? questionMatch[1] : null;
  if (!question) throw new Error('Could not extract question from malformed JSON');

  // Extract individual option strings from the array match
  let options = [];
  if (optionsMatch.length > 0) {
    const optionsStr = optionsMatch[0][1];
    const optionValues = [...optionsStr.matchAll(/"([^"]+)"/g)];
    options = optionValues.map(m => m[1]);
  }

  if (options.length < 2) {
    throw new Error('Could not extract enough options from malformed JSON');
  }

  return {
    question,
    options,
    pexelsQuery: pexelsMatch ? pexelsMatch[1] : 'tropical beach sunset',
    caption: captionMatch ? captionMatch[1] : '',
    hashtags: ['#FlashVoyage', '#SondageVoyage', '#VoyageAsie'],
  };
}

// ── Caption builder ─────────────────────────────────────────────────────────

const EMOJI_NUMBERS = ['1\uFE0F\u20E3', '2\uFE0F\u20E3', '3\uFE0F\u20E3', '4\uFE0F\u20E3'];

function buildCaption(poll) {
  const optionLines = poll.options
    .map((opt, i) => `${EMOJI_NUMBERS[i]} ${opt}`)
    .join('\n');

  return `${poll.question} \u{1F914}\n\n${optionLines}\n\nCommente ton numéro ! \u{1F447}\n\n${(poll.hashtags || []).join(' ')}`;
}

// ── Fallback poll ───────────────────────────────────────────────────────────

function getFallbackPoll(article) {
  const title = (article.title || '').toUpperCase();

  console.warn('[REEL/POLL] Using fallback poll');

  // Try to generate a relevant question from the article title
  let question = 'TA DESTINATION PRÉFÉRÉE EN ASIE ?';
  let options = ['THAÏLANDE', 'BALI', 'VIETNAM'];
  let pexelsQuery = 'asia travel landscape';

  // If the title mentions specific destinations, use them
  const destinations = ['BALI', 'THAÏLANDE', 'VIETNAM', 'CAMBODGE', 'PHILIPPINES', 'JAPON', 'SINGAPOUR', 'MALAISIE', 'INDONÉSIE', 'LAOS', 'MYANMAR'];
  const mentioned = destinations.filter(d => title.includes(d));
  if (mentioned.length >= 2) {
    question = `${mentioned[0]} OU ${mentioned[1]} ?`;
    options = mentioned.slice(0, 4);
    pexelsQuery = `${mentioned[0].toLowerCase()} travel`;
  }

  const hashtags = ['#FlashVoyage', '#SondageVoyage', '#VoyageAsie', '#TuChoisissQuoi', '#Voyage', '#AsieDuSudEst'];

  return {
    question,
    options,
    pexelsQuery,
    caption: buildCaption({ question, options, hashtags }),
    hashtags,
  };
}
