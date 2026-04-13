/**
 * Avant/Apres Generator — FlashVoyage Reels v2
 *
 * Uses Claude Haiku to generate expectation vs reality content
 * for a travel destination extracted from an article.
 *
 * ANGLE DIVERSITY (2026-04-13 rewrite):
 *   A narrow-prompt bug used to lock every reel on the same "plage déserte
 *   vs plage bondée" cliché because the Haiku system prompt hardcoded a
 *   single example. We now pick one of 18 angles (see
 *   ../angles/avantapres-angles.json) with rotation (no repeat within the
 *   last 6 picks, persisted on disk) and inject the chosen direction into
 *   the prompt as THE mandatory framing. The LLM is explicitly told not to
 *   fall back to beach/temple.
 *
 * Output: { destination, angle, expectation, reality, caption, hashtags }
 * Cost: ~$0.003 per generation (1 Haiku call, max 500 tokens)
 */

import { createTrackedClient } from '../../tracked-anthropic.js';
import { pickAngle } from '../angles/picker.js';

// ── Lazy Anthropic client ────────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('avantapres-generator');
  return _client;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';

// Known destinations for extraction
const DESTINATIONS = [
  'bali', 'thailande', 'thaïlande', 'vietnam', 'philippines', 'cambodge',
  'laos', 'japon', 'singapour', 'malaisie', 'indonesie', 'indonésie',
  'myanmar', 'sri lanka', 'bangkok', 'chiang mai', 'phuket', 'koh samui',
  'koh phangan', 'ubud', 'hanoi', 'ho chi minh', 'da nang', 'hoi an',
  'siem reap', 'luang prabang', 'manille', 'el nido', 'siargao',
  'taipei', 'tokyo', 'osaka', 'kyoto', 'séoul', 'kuala lumpur',
  'hong kong', 'maldives', 'goa', 'nepal', 'katmandou',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractDestination(article) {
  const title = (article.title || '').toLowerCase();
  const hook = (article.hook || '').toLowerCase();
  const text = `${title} ${hook}`;

  for (const d of DESTINATIONS) {
    if (text.includes(d)) {
      return d.charAt(0).toUpperCase() + d.slice(1);
    }
  }
  return 'Asie du Sud-Est';
}

// ── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate an Avant/Apres (expectation vs reality) script from an article.
 *
 * @param {Object} article - Article data: { title, hook, keyStats, rawText, ... }
 * @returns {Promise<{
 *   destination: string,
 *   angle: { id: string, label: string, tone: string },
 *   expectation: { text: string, pexelsQuery: string },
 *   reality: { text: string, pexelsQuery: string },
 *   caption: string,
 *   hashtags: string[]
 * }>}
 */
export async function generateAvantApresScript(article) {
  const destination = extractDestination(article);
  const angle = pickAngle('avantapres');

  console.log(
    `[AVANTAPRES-GEN] Angle: ${angle.id} (tone: ${angle.tone}) — destination: "${destination}"`
  );

  const client = getClient();
  if (!client) {
    console.warn(`[AVANTAPRES-GEN] No ANTHROPIC_API_KEY — using fallback`);
    return fallbackScript(destination, angle);
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      temperature: 0.7,
      system: `Tu es un créateur de contenu voyage viral spécialisé dans le format "expectation vs reality".

TON JOB : Créer un CONTRASTE MAXIMUM entre l'attente et la réalité, selon l'angle imposé ci-dessous. Plus le décalage est grand et SPÉCIFIQUE à l'angle, plus c'est drôle et partageable.

ANGLE IMPOSÉ POUR CE REEL : ${angle.label} (${angle.id})
- Expectation direction : ${angle.expectationDirection}
- Reality direction : ${angle.realityDirection}
- Ton attendu : ${angle.tone}

RÈGLES :
- Il existe 18 angles possibles. Tu DOIS respecter STRICTEMENT l'angle imposé ci-dessus.
- NE REVIENS PAS au cliché "plage déserte vs plage bondée" ou "temple zen vs temple touristique" si ce n'est pas l'angle choisi.
- Le contraste doit rester VISUEL (pour des vidéos Pexels)
- Les queries Pexels doivent être en ANGLAIS, spécifiques à l'angle imposé (pas de query générique)
- Répondre UNIQUEMENT en JSON valide, rien d'autre`,
      messages: [{
        role: 'user',
        content: `DESTINATION : ${destination}
ARTICLE : ${article.title || 'Voyage'}
CONTEXTE : ${(article.hook || article.keyStats || '').slice(0, 200)}

ANGLE IMPOSÉ : ${angle.label}
- Direction "expectation" : ${angle.expectationDirection}
- Direction "reality" : ${angle.realityDirection}

Génère un script "Avant/Après" pour ${destination} en respectant STRICTEMENT cet angle.

Réponds en JSON strict :
{
  "expectation_text": "description courte de ce qu'on imagine (max 40 chars, français) — doit matcher la direction expectation ci-dessus",
  "expectation_pexels": "query Pexels anglais qui illustre VISUELLEMENT la direction expectation (spécifique à l'angle, pas générique)",
  "reality_text": "description courte de la réalité (max 40 chars, français) — doit matcher la direction reality ci-dessus",
  "reality_pexels": "query Pexels anglais qui illustre VISUELLEMENT la direction reality (spécifique à l'angle, pas générique)"
}

JSON uniquement :`
      }],
    });

    const rawText = response.content[0]?.text?.trim() || '';

    // Parse JSON — handle markdown code fences
    let jsonStr = rawText;
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    const script = {
      destination,
      angle: { id: angle.id, label: angle.label, tone: angle.tone },
      expectation: {
        text: (parsed.expectation_text || '').slice(0, 50),
        pexelsQuery: parsed.expectation_pexels || `${destination.toLowerCase()} beautiful scenic`,
      },
      reality: {
        text: (parsed.reality_text || '').slice(0, 50),
        pexelsQuery: parsed.reality_pexels || `${destination.toLowerCase()} crowded tourists`,
      },
      caption: `${destination} : expectation vs reality \u{1F605}\n\nEt toi c'\u00E9tait comment ? \u{1F447}\n\n#FlashVoyage #AvantApr\u00E8s #${destination.replace(/\s+/g, '')} #VoyageHumour #ExpectationVsReality`,
      hashtags: [
        '#FlashVoyage', '#AvantApres', '#ExpectationVsReality',
        '#VoyageHumour', `#${destination.replace(/\s+/g, '')}`,
        '#AsieDuSudEst', '#TravelReality',
      ],
    };

    console.log(`[AVANTAPRES-GEN] Script ready (angle: ${angle.id}):`);
    console.log(`  Expectation: "${script.expectation.text}" → query: "${script.expectation.pexelsQuery}"`);
    console.log(`  Reality: "${script.reality.text}" → query: "${script.reality.pexelsQuery}"`);

    return script;

  } catch (err) {
    console.error(`[AVANTAPRES-GEN] Haiku call failed: ${err.message}, using fallback`);
    return fallbackScript(destination, angle);
  }
}

// ── Fallback (no API key or error) ───────────────────────────────────────────
// Uses the picked angle's directions as both the visible copy and the Pexels
// query hints. Destination name is woven in so the overlay stays contextual.

function fallbackScript(destination, angle) {
  console.log(`[AVANTAPRES-GEN] Using fallback script for "${destination}" (angle: ${angle.id})`);

  const expectationText = truncate(angle.label.split(' vs ')[0] || angle.label, 40);
  const realityText = truncate(angle.label.split(' vs ')[1] || angle.tone, 40);

  return {
    destination,
    angle: { id: angle.id, label: angle.label, tone: angle.tone },
    expectation: {
      text: expectationText,
      pexelsQuery: toPexelsQuery(destination, angle.expectationDirection, 'beautiful scenic'),
    },
    reality: {
      text: realityText,
      pexelsQuery: toPexelsQuery(destination, angle.realityDirection, 'crowded tourists'),
    },
    caption: `${destination} : expectation vs reality \u{1F605}\n\nEt toi c'\u00E9tait comment ? \u{1F447}\n\n#FlashVoyage #AvantApr\u00E8s #VoyageHumour`,
    hashtags: ['#FlashVoyage', '#AvantApres', '#VoyageHumour', `#${destination.replace(/\s+/g, '')}`],
  };
}

function truncate(s, max) {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, '');
}

/**
 * Build a best-effort Pexels query from a French direction sentence by
 * extracting obvious visual nouns and appending the destination.
 * The Haiku call produces a better query when the API is available — this
 * is only used when we fall back.
 */
function toPexelsQuery(destination, direction, defaultSuffix) {
  const VISUAL_HINTS = {
    'plage': 'beach',
    'palmier': 'palm tree',
    'temple': 'temple',
    'rue': 'street',
    'marché': 'market',
    'piscine': 'swimming pool',
    'piscine d\'hôtel': 'hotel pool',
    'foule': 'crowd',
    'touristes': 'tourists',
    'scooter': 'scooter',
    'valise': 'suitcase',
    'hôpital': 'hospital',
    'aéroport': 'airport',
    'frontière': 'border crossing',
    'moines': 'monks',
    'coucher de soleil': 'sunset',
    'pluie': 'rain',
    'cantine': 'street food stall',
    'street food': 'street food',
    'chambre': 'hotel room',
    'selfie': 'selfie',
    'train': 'train',
    'bus': 'bus',
    'avion': 'airplane',
    'montagne': 'mountain',
    'rizière': 'rice terrace',
  };
  const lower = (direction || '').toLowerCase();
  const hits = [];
  for (const [fr, en] of Object.entries(VISUAL_HINTS)) {
    if (lower.includes(fr)) hits.push(en);
  }
  const base = hits.length > 0 ? hits.slice(0, 3).join(' ') : defaultSuffix;
  return `${destination.toLowerCase()} ${base}`.trim();
}
