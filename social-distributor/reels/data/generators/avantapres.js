/**
 * Avant/Apres Generator — FlashVoyage Reels v2
 *
 * Uses Claude Haiku to generate expectation vs reality content
 * for a travel destination extracted from an article.
 *
 * Output: { destination, expectation, reality, caption, hashtags }
 * Cost: ~$0.003 per generation (1 Haiku call, max 500 tokens)
 */

import { createTrackedClient } from '../../tracked-anthropic.js';

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
 *   expectation: { text: string, pexelsQuery: string },
 *   reality: { text: string, pexelsQuery: string },
 *   caption: string,
 *   hashtags: string[]
 * }>}
 */
export async function generateAvantApresScript(article) {
  const destination = extractDestination(article);

  console.log(`[AVANTAPRES-GEN] Generating script for destination: "${destination}"`);

  const client = getClient();
  if (!client) {
    console.warn(`[AVANTAPRES-GEN] No ANTHROPIC_API_KEY — using fallback`);
    return fallbackScript(destination);
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      temperature: 0.7,
      system: `Tu es un créateur de contenu voyage viral spécialisé dans le format "expectation vs reality".

TON JOB : Créer un CONTRASTE MAXIMUM entre ce que les touristes imaginent et la réalité. Plus le décalage est grand, plus c'est drôle et partageable.

RÈGLES :
- "Expectation" = la version Instagram/Pinterest/rêve : plage déserte, temple vide, coucher de soleil parfait
- "Reality" = ce qui se passe vraiment : foule, pluie, arnaques, scooters partout, touristes en masse
- Le contraste doit être VISUEL (pour des vidéos Pexels)
- Les queries Pexels doivent être en ANGLAIS, spécifiques et visuelles
- Répondre UNIQUEMENT en JSON valide, rien d'autre`,
      messages: [{
        role: 'user',
        content: `DESTINATION : ${destination}
ARTICLE : ${article.title || 'Voyage'}
CONTEXTE : ${(article.hook || article.keyStats || '').slice(0, 200)}

Génère un script "Avant/Après" pour ${destination}.

Réponds en JSON strict :
{
  "expectation_text": "description courte de ce qu'on imagine (max 40 chars, français)",
  "expectation_pexels": "query Pexels anglais pour la version rêvée (beautiful, pristine, empty)",
  "reality_text": "description courte de la réalité (max 40 chars, français)",
  "reality_pexels": "query Pexels anglais pour la version réelle (crowded, chaotic, real)"
}

EXEMPLES de bons contrastes :
- Bali: expectation "Rizières désertes au lever du soleil" / reality "Selfie-sticks et files d'attente"
- Bangkok: expectation "Temple doré paisible" / reality "40°C, 200 touristes, un singe"
- Phuket: expectation "Plage paradisiaque privée" / reality "Parasols à perte de vue"

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

    console.log(`[AVANTAPRES-GEN] Script ready:`);
    console.log(`  Expectation: "${script.expectation.text}" → query: "${script.expectation.pexelsQuery}"`);
    console.log(`  Reality: "${script.reality.text}" → query: "${script.reality.pexelsQuery}"`);

    return script;

  } catch (err) {
    console.error(`[AVANTAPRES-GEN] Haiku call failed: ${err.message}, using fallback`);
    return fallbackScript(destination);
  }
}

// ── Fallback (no API key or error) ───────────────────────────────────────────

const FALLBACK_SCRIPTS = {
  'Bali': {
    expectation: { text: 'Rizi\u00E8res d\u00E9sertes au lever du soleil', pexelsQuery: 'bali rice terrace beautiful sunrise empty' },
    reality: { text: 'Selfie-sticks et files d\u2019attente', pexelsQuery: 'bali crowded tourists temple queue' },
  },
  'Bangkok': {
    expectation: { text: 'Temple dor\u00E9 paisible et zen', pexelsQuery: 'bangkok golden temple peaceful morning' },
    reality: { text: '40\u00B0C, 200 touristes, un singe voleur', pexelsQuery: 'bangkok street crowded hot traffic chaos' },
  },
  'Phuket': {
    expectation: { text: 'Plage paradisiaque priv\u00E9e', pexelsQuery: 'phuket beach pristine empty turquoise' },
    reality: { text: 'Parasols \u00E0 perte de vue', pexelsQuery: 'crowded tropical beach umbrellas tourists' },
  },
  'default': {
    expectation: { text: 'Paysage de carte postale', pexelsQuery: 'southeast asia beautiful scenic landscape' },
    reality: { text: 'La r\u00E9alit\u00E9 du backpacker', pexelsQuery: 'southeast asia crowded street market tourists' },
  },
};

function fallbackScript(destination) {
  const fb = FALLBACK_SCRIPTS[destination] || FALLBACK_SCRIPTS['default'];

  console.log(`[AVANTAPRES-GEN] Using fallback script for "${destination}"`);

  return {
    destination,
    expectation: { ...fb.expectation },
    reality: { ...fb.reality },
    caption: `${destination} : expectation vs reality \u{1F605}\n\nEt toi c'\u00E9tait comment ? \u{1F447}\n\n#FlashVoyage #AvantApr\u00E8s #VoyageHumour`,
    hashtags: ['#FlashVoyage', '#AvantApres', '#VoyageHumour', `#${destination.replace(/\s+/g, '')}`],
  };
}
