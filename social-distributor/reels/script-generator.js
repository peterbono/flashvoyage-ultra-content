/**
 * Reel Script Generator — FlashVoyage Reels Module
 *
 * Uses Claude Haiku to generate a structured Reel script from an article.
 * 5 template prompts based on content type:
 *   - stock_deal: prix choc + destination (style VoyagePirates)
 *   - news_flash: headline news + contexte
 *   - meme_humor: situation relatable voyageur
 *   - budget_reveal: chiffres qui défilent
 *   - listicle: delegates to listicle-script-generator.js
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

import { generateListicleScript } from './listicle-script-generator.js';

const client = new Anthropic();

// ── Template prompts per content type ────────────────────────────────────────

const PROMPTS = {
  stock_deal: `Tu es un créateur de Reels voyage style VoyagePirates/SecretFlying.
Génère un script de Reel court (15-20 sec, 4 scènes max) pour ce bon plan :

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}

Le Reel doit :
- Scène 1 (3s): PRIX CHOC en gros (ex: "399€ A/R PARIS → BALI")
- Scène 2 (4s): La destination + emoji drapeau
- Scène 3 (4s): Le détail clé (dates, compagnie, escale)
- Scène 4 (4s): CTA "Lien en bio" / "Enregistre ce Reel"

Réponds UNIQUEMENT en JSON valide :
{
  "scenes": [
    { "text": "texte affiché", "duration": 3, "style": "prix_choc|destination|detail|cta", "searchQuery": "mot-clé pour vidéo Pexels" }
  ],
  "hook": "phrase d'accroche courte",
  "cta": "texte call-to-action",
  "hashtags": ["#FlashVoyage", "#BonPlan", "..."],
  "videoQuery": "requête Pexels pour la vidéo de fond (en anglais)"
}`,

  news_flash: `Tu es un créateur de Reels actu voyage style Flash Info.
Génère un script de Reel court (15-20 sec, 4 scènes max) pour cette news :

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}

Le Reel doit :
- Scène 1 (3s): FLASH INFO + headline choc
- Scène 2 (5s): Le contexte en 1 phrase
- Scène 3 (4s): L'impact pour les voyageurs
- Scène 4 (3s): CTA "Suivre @flashvoyagemedia"

Réponds UNIQUEMENT en JSON valide :
{
  "scenes": [
    { "text": "texte affiché", "duration": 3, "style": "headline|context|impact|cta", "searchQuery": "mot-clé pour vidéo Pexels" }
  ],
  "hook": "phrase d'accroche courte",
  "cta": "texte call-to-action",
  "hashtags": ["#FlashVoyage", "#ActuVoyage", "..."],
  "videoQuery": "requête Pexels pour la vidéo de fond (en anglais)"
}`,

  meme_humor: `Tu es un créateur de Reels humour voyage (style "POV tu..." / "Quand tu...").
Génère un script de Reel court (12-15 sec, 3 scènes max) basé sur cet article :

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}

Le Reel doit :
- Scène 1 (4s): La situation relatable (ex: "QUAND TU RÉSERVES UN VOL À 3H DU MAT")
- Scène 2 (4s): Le twist / la réalité
- Scène 3 (4s): La punchline + CTA

Réponds UNIQUEMENT en JSON valide :
{
  "scenes": [
    { "text": "texte affiché", "duration": 4, "style": "situation|twist|punchline", "searchQuery": "mot-clé pour vidéo Pexels" }
  ],
  "hook": "phrase d'accroche courte",
  "cta": "texte call-to-action",
  "hashtags": ["#FlashVoyage", "#VoyageHumour", "..."],
  "videoQuery": "requête Pexels pour la vidéo de fond (en anglais)"
}`,

  budget_reveal: `Tu es un créateur de Reels budget voyage (chiffres qui claquent).
Génère un script de Reel court (15-20 sec, 4 scènes max) pour ce contenu :

ARTICLE: {{TITLE}}
HOOK: {{HOOK}}
STATS: {{STATS}}

Le Reel doit :
- Scène 1 (3s): Titre accrocheur EN MAJUSCULES, max 40 caractères (ex: "BUDGET 2 SEMAINES THAÏLANDE")
- Scène 2 (5s): UN SEUL chiffre clé le plus impactant, formaté lisiblement (ex: "Hébergement : 450 €"), max 35 caractères
- Scène 3 (4s): Le budget total en gros, max 30 caractères (ex: "TOTAL : 1 200 €")
- Scène 4 (3s): CTA court, max 35 caractères (ex: "Enregistre pour ton voyage !")

RÈGLES STRICTES :
- Chaque "text" doit faire MAXIMUM 40 caractères
- PAS de liste de chiffres dans une seule scène — UN chiffre par scène max
- Les montants doivent être RÉALISTES (pas d'hallucination)
- Accents français obligatoires (é, è, ê, à, ç)

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de commentaires) :
{
  "scenes": [
    { "text": "texte affiché", "duration": 3, "style": "titre|chiffres|total|cta", "searchQuery": "mot-clé pour vidéo Pexels" }
  ],
  "hook": "phrase d'accroche courte",
  "cta": "texte call-to-action",
  "hashtags": ["#FlashVoyage", "#BudgetVoyage"],
  "videoQuery": "requête Pexels pour la vidéo de fond (en anglais)"
}`,
};

// ── Content type detection ───────────────────────────────────────────────────

const PRICE_REGEX = /\d[\d\s.,]*\s*(?:€|EUR|USD|\$)/i;
const BUDGET_WORDS = ['budget', 'coût', 'prix', 'tarif', 'combien', 'dépense', 'pas cher', 'économi'];
const NEWS_WORDS = ['nouveau', 'annonce', 'ouverture', 'fermeture', 'alerte', 'update', 'changement', 'règle', 'visa'];
const HUMOR_WORDS = ['erreur', 'piège', 'galère', 'quand tu', 'pov', 'fail', 'wtf', 'insolite'];

// Listicle detection: number patterns + list-type keywords
const LISTICLE_PATTERNS = [
  /\btop\s*\d+/i, /\bmeilleur/i, /\berreur/i, /\barnaque/i,
  /\bque\s*faire/i, /\bhack/i, /\bastuce/i, /\bconseil/i,
  /\bvs\b/i, /\bversus\b/i, /\bcompara/i, /\bcontre\b/i,
  /\b\d+\s*(?:choses?|trucs?|raisons?|endroits?|lieux|destinations?|erreurs?|arnaques?|astuces?|conseils?|hacks?)\b/i,
  /\bpourquoi\b.*\bplut[oô]t\b/i, /\blequel\b/i,
  /\bsecret/i, /\bm[ée]connu/i, /\bcach[ée]/i,
  /\bvrai\s*prix/i, /\bcombien\s*co[uû]te/i,
];

/**
 * Detect the best Reel content type for an article.
 * Returns 'listicle' for list-type content, or a standard type.
 */
export function detectReelType(article) {
  const text = `${article.title} ${article.hook || ''} ${(article.keyStats || []).join(' ')}`.toLowerCase();

  // Check for listicle patterns first (they take priority)
  if (LISTICLE_PATTERNS.some(p => p.test(text))) return 'listicle';

  if (PRICE_REGEX.test(text) && text.match(/vol|billet|a\/r|aller/i)) return 'stock_deal';
  if (BUDGET_WORDS.some(w => text.includes(w))) return 'budget_reveal';
  if (NEWS_WORDS.some(w => text.includes(w))) return 'news_flash';
  if (HUMOR_WORDS.some(w => text.includes(w))) return 'meme_humor';

  // Default: use budget_reveal for stats-heavy, news_flash otherwise
  if (article.keyStats && article.keyStats.length > 0) return 'budget_reveal';
  return 'news_flash';
}

/**
 * Generate a structured Reel script from an article using Haiku.
 *
 * @param {Object} article - Extracted article data { title, hook, keyStats, category, ... }
 * @returns {Promise<{ scenes: Array, hook: string, cta: string, hashtags: string[], videoQuery: string }>}
 */
export async function generateReelScript(article) {
  const type = detectReelType(article);

  // Delegate listicle type to specialized generator
  if (type === 'listicle') {
    console.log(`[REEL/SCRIPT] Detected listicle type, delegating to listicle-script-generator...`);
    return generateListicleScript(article);
  }

  const promptTemplate = PROMPTS[type];

  const stats = (article.keyStats || [])
    .map(s => typeof s === 'object' ? s.value : s)
    .join(', ');

  const prompt = promptTemplate
    .replace('{{TITLE}}', article.title || '')
    .replace('{{HOOK}}', article.hook || '')
    .replace('{{STATS}}', stats || 'aucune stat');

  console.log(`[REEL/SCRIPT] Generating script (type: ${type}) for: ${(article.title || '').slice(0, 60)}...`);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Haiku response');
    }

    // Clean up common JSON issues from LLM output
    let jsonStr = jsonMatch[0];
    // Remove trailing commas before ] or }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
    // Remove "..." placeholder entries in arrays
    jsonStr = jsonStr.replace(/,?\s*"\.\.\."\s*,?/g, '');
    // Fix unescaped quotes inside string values (common with French text)
    // Replace smart quotes with straight quotes
    jsonStr = jsonStr.replace(/[\u201c\u201d\u00ab\u00bb]/g, '\\"');

    let script;
    try {
      script = JSON.parse(jsonStr);
    } catch (parseErr) {
      // Last resort: try to extract scenes manually with regex
      console.warn(`[REEL/SCRIPT] JSON parse failed, trying regex extraction...`);
      const scenesMatch = [...jsonStr.matchAll(/"text"\s*:\s*"([^"]+)"/g)];
      const durationsMatch = [...jsonStr.matchAll(/"duration"\s*:\s*(\d+)/g)];
      if (scenesMatch.length >= 2) {
        const scenes = scenesMatch.map((m, i) => ({
          text: m[1],
          duration: durationsMatch[i] ? parseInt(durationsMatch[i][1]) : 4,
          style: 'headline',
          searchQuery: 'travel',
        }));
        const videoQueryMatch = jsonStr.match(/"videoQuery"\s*:\s*"([^"]+)"/);
        script = {
          scenes,
          hook: scenes[0].text.slice(0, 40),
          cta: 'Lien en bio',
          hashtags: ['#FlashVoyage', '#Voyage'],
          videoQuery: videoQueryMatch ? videoQueryMatch[1] : 'travel aerial',
        };
      } else {
        throw parseErr;
      }
    }

    // Validate & sanitize
    if (!script.scenes || !Array.isArray(script.scenes) || script.scenes.length === 0) {
      throw new Error('Invalid script: no scenes');
    }

    // Enforce max text length per scene (40 chars for readability on 1080x1920)
    for (const scene of script.scenes) {
      if (scene.text && scene.text.length > 50) {
        scene.text = scene.text.slice(0, 47) + '...';
      }
    }

    // Ensure total duration is 15-20s
    const totalDuration = script.scenes.reduce((sum, s) => sum + (s.duration || 4), 0);
    if (totalDuration > 25) {
      // Trim scenes to fit
      let running = 0;
      script.scenes = script.scenes.filter(s => {
        running += s.duration || 4;
        return running <= 20;
      });
    }

    // Ensure defaults
    script.hook = script.hook || article.title;
    script.cta = script.cta || 'Lien en bio';
    script.hashtags = script.hashtags || ['#FlashVoyage', '#Voyage'];
    script.videoQuery = script.videoQuery || 'travel aerial landscape';
    script.type = type;

    console.log(`[REEL/SCRIPT] Generated ${script.scenes.length} scenes, total ~${script.scenes.reduce((s, sc) => s + sc.duration, 0)}s`);

    return script;
  } catch (err) {
    console.error(`[REEL/SCRIPT] Haiku failed: ${err.message}, using fallback script`);
    return getFallbackScript(article, type);
  }
}

/**
 * Fallback script when Haiku fails.
 */
function getFallbackScript(article, type) {
  const title = (article.title || 'Flash Voyage').toUpperCase();
  const stat = article.keyStats?.[0];
  const statText = stat ? (typeof stat === 'object' ? stat.value : stat) : '';

  return {
    type,
    scenes: [
      { text: title.slice(0, 60), duration: 5, style: 'headline', searchQuery: 'travel' },
      { text: statText || 'Les détails qui comptent', duration: 5, style: 'detail', searchQuery: 'airplane' },
      { text: 'Lien en bio pour en savoir plus', duration: 5, style: 'cta', searchQuery: 'travel planning' },
    ],
    hook: title.slice(0, 40),
    cta: 'Lien en bio',
    hashtags: ['#FlashVoyage', '#Voyage', '#BonPlan'],
    videoQuery: 'tropical beach aerial',
  };
}
