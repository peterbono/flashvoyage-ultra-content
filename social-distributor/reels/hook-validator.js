/**
 * Hook Validator — FlashVoyage Listicle Reels
 *
 * Validates and rewrites scene texts for maximum Reels engagement.
 * Uses Claude Haiku to check: length, CAPS, impact, specificity.
 * Non-blocking: if validation fails, returns originals unchanged.
 */

import Anthropic from '@anthropic-ai/sdk';

// ── Lazy Anthropic client (same pattern as extractor.js) ─────────────────────

let _anthropicClient = null;
function getAnthropicClient() {
  if (_anthropicClient) return _anthropicClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropicClient;
}

// ── Validation rules ─────────────────────────────────────────────────────────

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function localValidate(scene) {
  const issues = [];
  const words = countWords(scene.text);

  if (scene.isHook) {
    if (words < 8) issues.push('hook_too_short');
    if (words > 12) issues.push('hook_too_long');
  } else if (scene.isItem) {
    if (words < 3) issues.push('item_too_short');
    if (words > 8) issues.push('item_too_long');
  }

  if (scene.text !== scene.text.toUpperCase()) {
    issues.push('not_caps');
  }

  // Check for generic/weak words
  const weakPatterns = [
    /^voici\b/i, /^il y a\b/i, /^c'est\b/i, /^on peut\b/i,
    /^vous pouvez\b/i, /^n'oubliez pas\b/i,
  ];
  if (weakPatterns.some(p => p.test(scene.text))) {
    issues.push('weak_opening');
  }

  return issues;
}

// ── Haiku validation + rewrite ───────────────────────────────────────────────

const VALIDATION_PROMPT = `Tu es un expert Reels Instagram voyage. Valide et ameliore ces textes de scenes pour un Reel listicle.

REGLES STRICTES:
- Hook (scene 1): 8-12 mots, EN MAJUSCULES, doit contenir un chiffre choc OU une question. Doit creer un arret de scroll.
- Items (scenes intermediaires): 3-8 mots, EN MAJUSCULES, percutants, specifiques (pas de generiques).
- CTA (derniere scene): 3-6 mots, EN MAJUSCULES, appel a l'action clair.
- Tous les textes en FRANCAIS avec accents corrects (e, e, e, a, c, etc.)
- PAS de mots faibles: "voici", "il y a", "c'est", "on peut"
- CHAQUE item doit etre concret et memorable

SCENES A VALIDER:
{{SCENES_JSON}}

Reponds UNIQUEMENT en JSON valide. Pour chaque scene, retourne le texte corrige:
{
  "scenes": [
    { "index": 0, "original": "...", "validated": "...", "changed": true/false, "reason": "..." }
  ]
}`;

/**
 * Validate and potentially rewrite scene texts for maximum engagement.
 * Non-blocking: if Haiku fails, returns originals unchanged.
 *
 * @param {Array} scenes - Array of scene objects with text, isHook, isItem, isCta
 * @returns {Promise<Array>} Validated scenes with potentially rewritten texts
 */
export async function validateHooks(scenes) {
  if (!scenes || scenes.length === 0) return scenes;

  // First pass: quick local validation
  const localIssues = scenes.map((s, i) => ({
    index: i,
    text: s.text,
    isHook: s.isHook || i === 0,
    isItem: s.isItem || (i > 0 && i < scenes.length - 1),
    isCta: s.isCta || i === scenes.length - 1,
    issues: localValidate({
      ...s,
      isHook: s.isHook || i === 0,
      isItem: s.isItem || (i > 0 && i < scenes.length - 1),
    }),
  }));

  const hasIssues = localIssues.some(s => s.issues.length > 0);

  // If no local issues found, still run through Haiku for quality boost
  const client = getAnthropicClient();
  if (!client) {
    console.warn('[REEL/HOOK] ANTHROPIC_API_KEY not set — skipping hook validation');
    return scenes;
  }

  try {
    const scenesJson = JSON.stringify(
      scenes.map((s, i) => ({
        index: i,
        text: s.text,
        type: i === 0 ? 'hook' : (i === scenes.length - 1 ? 'cta' : 'item'),
        subtitle: s.subtitle || null,
        localIssues: localIssues[i].issues,
      })),
      null, 2
    );

    const prompt = VALIDATION_PROMPT.replace('{{SCENES_JSON}}', scenesJson);

    console.log(`[REEL/HOOK] Validating ${scenes.length} scenes with Haiku...`);

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Haiku');

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Haiku validation response');

    let jsonStr = jsonMatch[0];
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
    jsonStr = jsonStr.replace(/,?\s*"\.\.\."\s*,?/g, '');

    const result = JSON.parse(jsonStr);

    if (!result.scenes || !Array.isArray(result.scenes)) {
      throw new Error('Invalid validation response: no scenes array');
    }

    // Apply validated texts back to scenes
    let changedCount = 0;
    const validatedScenes = scenes.map((scene, i) => {
      const validated = result.scenes.find(v => v.index === i);
      if (validated && validated.changed && validated.validated) {
        changedCount++;
        console.log(`[REEL/HOOK] Scene ${i} rewritten: "${scene.text.slice(0, 30)}..." → "${validated.validated.slice(0, 30)}..." (${validated.reason})`);
        return { ...scene, text: validated.validated };
      }
      return scene;
    });

    console.log(`[REEL/HOOK] Validation complete: ${changedCount}/${scenes.length} scenes rewritten`);
    return validatedScenes;

  } catch (err) {
    console.error(`[REEL/HOOK] Validation failed (non-blocking): ${err.message}`);
    // Non-blocking: return originals
    return scenes;
  }
}
