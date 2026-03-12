#!/usr/bin/env node

/**
 * REVIEW AGENTS — Panel d'experts LLM pour revue post-publication
 *
 * 5 agents spécialisés + 1 CEO/Validator.
 * Chaque agent reçoit le HTML de l'article publié et retourne un JSON structuré.
 * Utilisé par post-publish-review-loop.js.
 */

import { generateWithClaude } from './anthropic-client.js';
import { createChatCompletion } from './openai-client.js';
import { parse } from 'node-html-parser';

// ─── Helpers ──────────────────────────────────────────────

function extractTextFromHtml(html) {
  return parse(html).text.replace(/\s+/g, ' ').trim();
}

function truncate(str, max = 50000) {
  if (str.length <= max) return str;
  return str.slice(0, max) + '\n<!-- fin du contenu fourni pour analyse -->';
}

/**
 * Parse la réponse JSON d'un agent.
 * Tolère : code fences, texte avant/après le JSON, trailing commas.
 */
function parseAgentJson(raw) {
  let cleaned = raw.trim();

  // Strip markdown code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Extraire le premier objet JSON complet { ... } en comptant les accolades
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('Pas de JSON trouvé dans la réponse');

  let depth = 0;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }

  if (end === -1) throw new Error('JSON incomplet dans la réponse');

  let jsonStr = cleaned.substring(start, end);

  // Supprimer les trailing commas avant } ou ]
  jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

  return JSON.parse(jsonStr);
}

async function callLlm(systemPrompt, userPrompt, { model = 'claude-haiku-4-5-20251001', maxTokens = 4096, trackingStep = 'review-agent' } = {}) {
  if (model.startsWith('claude') || model.startsWith('claude-haiku')) {
    return generateWithClaude(systemPrompt, userPrompt, { model, maxTokens, temperature: 0.3, trackingStep });
  }
  const response = await createChatCompletion({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.3
  }, 3, trackingStep);
  return response.choices[0]?.message?.content || '';
}

// ─── Date context (injected in all prompts) ──────────────
const CURRENT_DATE_CTX = `IMPORTANT : Nous sommes en mars 2026. Les dates de publication en 2026 sont NORMALES et VALIDES. Ne signale PAS la date comme une erreur.`;

// ─── Agent definitions ────────────────────────────────────

const AGENTS = {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'seo-expert': {
    label: 'SEO',
    weight: 1,
    system: `Tu es un expert SEO spécialisé en content marketing voyage et affiliation.
Tu audites un article publié sur flashvoyage.com.
${CURRENT_DATE_CTX}

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) avec cette structure exacte :
{
  "score": <number 0-100>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "fix_suggestion": "string" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

Critères d'évaluation :
1. Structure H1/H2/H3 : hiérarchie logique, pas de sauts de niveau
2. Title tag : longueur (50-60 chars idéal), mot-clé principal en tête, attractif
3. Intention de recherche : l'article répond-il à une vraie requête utilisateur ?
4. Densité mots-clés : naturelle vs bourrage
5. Schema FAQ : section FAQ avec balises details/summary
6. Maillage interne : liens vers d'autres articles du site (minimum 3)

Score >= 90 = PASS, sinon FAIL.`,
    buildUserPrompt(ctx) {
      return `TITRE : ${ctx.title}\nURL : ${ctx.url}\nMODE : ${ctx.editorialMode}\n\nHTML DE L'ARTICLE :\n${truncate(ctx.html)}`;
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'affiliation-expert': {
    label: 'Affiliation',
    weight: 1,
    system: `Tu es un expert en marketing d'affiliation voyage (Travelpayouts, Booking, GetYourGuide, SafetyWing).
Tu audites la monétisation d'un article publié sur flashvoyage.com.
${CURRENT_DATE_CTX}

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "score": <number 0-100>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "fix_suggestion": "string" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

Critères :
1. Modules affiliés présents (aside.affiliate-module) — minimum 2
2. Opportunités manquées : hôtels, activités, assurance, vols domestiques, eSIM
3. Qualité CTA : naturels, contextuels, pas agressifs
4. Placement dans le funnel : répartis dans l'article, pas tous au même endroit
5. Ratio valeur/promotion : l'article apporte plus de valeur qu'il ne vend
6. Disclaimer affiliation visible

Score >= 85 = PASS, sinon FAIL.`,
    buildUserPrompt(ctx) {
      const root = parse(ctx.html);
      const modules = root.querySelectorAll('aside.affiliate-module, div[data-fv-segment="affiliate"]');
      const moduleInfo = modules.map(m => ({
        type: m.getAttribute('data-placement-id') || 'unknown',
        text: m.text.substring(0, 200)
      }));
      return `TITRE : ${ctx.title}\nDESTINATION : ${ctx.destination || 'inconnue'}\nMODULES AFFILIÉS DÉTECTÉS (${modules.length}) :\n${JSON.stringify(moduleInfo, null, 2)}\n\nHTML :\n${truncate(ctx.html)}`;
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'editorial-expert': {
    label: 'Éditorial',
    weight: 1.5,
    system: `Tu es rédacteur en chef expert (20 ans de presse voyage : Lonely Planet, Le Routard).
Tu audites un article généré par IA publié sur flashvoyage.com.
${CURRENT_DATE_CTX}

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "score": <number 0-100>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "location": "string (extrait du texte)", "fix_suggestion": "string" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

Critères impitoyables :
1. Détection IA : formulations mécaniques, titres typés IA ("Ce que les autres ne disent pas"), structures "Option 1/2/3", "La vraie question n'est pas X mais Y"
2. Citations : toute citation doit être une phrase COMPLÈTE avec un sens clair. Phrase tronquée = critical.
3. Sections creuses : un H2 qui promet beaucoup mais dont le contenu est vague ou creux = major.
4. Clichés : "la vraie Thaïlande", "hors des sentiers battus" (sauf si déconstruit)
5. Voix/personnalité : le texte a-t-il une identité propre ou est-il générique ?
6. Cohérence narrative : fil rouge clair du début à la fin

Score >= 85 = PASS, sinon FAIL.`,
    buildUserPrompt(ctx) {
      const text = extractTextFromHtml(ctx.html);
      return `TITRE : ${ctx.title}\n\nTEXTE COMPLET :\n${truncate(text)}`;
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'ux-bugs-expert': {
    label: 'UX/Bugs',
    weight: 2,
    system: `Tu es un expert QA/UX spécialisé dans les médias digitaux.
Tu audites un article publié sur un site WordPress de voyage.
${CURRENT_DATE_CTX}
IMPORTANT : Le HTML que tu reçois peut être tronqué pour des raisons de taille. Si tu vois "fin du contenu fourni pour analyse", ce n'est PAS un bug de l'article — c'est simplement la limite du texte fourni. NE RAPPORTE PAS cela comme une issue.

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "score": <number 0-100>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "location": "string (extrait HTML ou texte)", "fix_type": "auto"|"llm"|"manual" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

Tu détectes IMPITOYABLEMENT :
1. IMAGES INCOHÉRENTES : l'alt text ou le nom de fichier référence un lieu différent de la destination de l'article = CRITICAL
2. PHRASES CASSÉES : mots collés ("tesquelques"), phrases sans sens grammatical, texte corrompu = CRITICAL
3. LIENS TRONQUÉS : ancres <a> dont le texte est coupé (se termine par un mot incomplet) = CRITICAL
4. CITATIONS VIDES : blockquote dont le contenu ne forme pas une phrase complète = CRITICAL
5. HTML CASSÉ : balises non fermées, attributs manquants = MAJOR
6. TYPOS et erreurs grammaticales = MINOR
7. UNE SEULE IMAGE pour un article > 2000 mots = MAJOR

fix_type :
- "auto" = corrigeable par programme (image, lien, HTML)
- "llm" = nécessite réécriture par LLM (phrase cassée, citation)
- "manual" = nécessite intervention humaine

Score >= 90 = PASS, sinon FAIL. Un seul bug CRITICAL = FAIL automatique.`,
    buildUserPrompt(ctx) {
      const root = parse(ctx.html);
      const images = root.querySelectorAll('img').map(img => ({
        src: (img.getAttribute('src') || '').substring(0, 150),
        alt: img.getAttribute('alt') || ''
      }));
      const links = root.querySelectorAll('a').filter(a =>
        (a.getAttribute('href') || '').includes('flashvoyage')
      ).map(a => ({
        href: (a.getAttribute('href') || '').substring(0, 100),
        text: a.text.trim().substring(0, 100)
      }));
      return `TITRE : ${ctx.title}\nDESTINATION ATTENDUE : ${ctx.destination || 'inconnue'}\n\nIMAGES (${images.length}) :\n${JSON.stringify(images, null, 2)}\n\nLIENS INTERNES (${links.length}) :\n${JSON.stringify(links, null, 2)}\n\nHTML COMPLET :\n${truncate(ctx.html)}`;
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'integrity-expert': {
    label: 'Intégrité',
    weight: 1,
    system: `Tu es un fact-checker expert spécialisé en contenu voyage.
Tu vérifies l'intégrité factuelle d'un article publié sur flashvoyage.com.
${CURRENT_DATE_CTX}

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "score": <number 0-100>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "location": "string", "fix_suggestion": "string" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

Critères :
1. Données factuelles : prix, durées de vol/trajet, distances — sont-elles plausibles ?
2. Cohérence interne : les mêmes chiffres sont-ils cohérents d'un paragraphe à l'autre ?
3. Sources : les citations attribuées à Reddit correspondent-elles au contexte ?
4. Dates : les infos sont-elles à jour (pas de données obsolètes) ?
5. Géographie : les lieux mentionnés existent-ils et sont-ils dans le bon pays/région ?
6. Hallucinations : affirmations invérifiables présentées comme des faits

Score >= 90 = PASS, sinon FAIL.`,
    buildUserPrompt(ctx) {
      const text = extractTextFromHtml(ctx.html);
      return `TITRE : ${ctx.title}\nDATE PUBLICATION : ${ctx.date || 'inconnue'}\nDESTINATION : ${ctx.destination || 'inconnue'}\n\nTEXTE COMPLET :\n${truncate(text)}`;
    }
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Agent CEO / Validator (séparé, il reçoit la synthèse)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CEO_SYSTEM = `Tu es le CEO/Directeur de publication de flashvoyage.com.
Tu reçois les rapports de 5 experts (SEO, Affiliation, Éditorial, UX/Bugs, Intégrité) sur un article publié.

Tu dois décider si l'article est publiable en l'état ou nécessite des corrections.

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "decision": "APPROVE"|"REJECT",
  "weighted_score": <number 0-100>,
  "reasoning": "string (2-3 phrases)",
  "critical_fixes": [
    { "priority": 1, "agent": "string", "issue": "string", "action": "string" }
  ],
  "generator_recommendations": ["string (améliorations pour le générateur IA)"]
}

Règles de décision :
- Un seul bug CRITICAL (image fausse, phrase cassée, lien mort) = REJECT obligatoire
- Score moyen pondéré < 85 = REJECT
- TOUS les agents doivent avoir "satisfied": true pour APPROVE — si un seul agent n'est pas satisfied, c'est un REJECT
- Score moyen pondéré >= 85 ET 0 critical ET tous satisfied = APPROVE
- Pondérations : UX/Bugs x2, Éditorial x1.5, SEO x1, Affiliation x1, Intégrité x1

Ordonne les critical_fixes par priorité (1 = plus urgent).
Ajoute dans generator_recommendations les améliorations que le pipeline de génération devrait intégrer pour éviter ces problèmes à l'avenir.`;

// ─── Public API ───────────────────────────────────────────

/**
 * Lance un agent expert et retourne son verdict structuré
 * @param {string} agentId - Clé dans AGENTS
 * @param {Object} ctx - { html, title, url, editorialMode, destination, date }
 * @returns {Promise<Object>} { score, issues, strengths, verdict }
 */
export async function runAgent(agentId, ctx) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Agent inconnu: ${agentId}`);

  const userPrompt = agent.buildUserPrompt(ctx);
  const t0 = Date.now();

  try {
    const raw = await callLlm(agent.system, userPrompt, {
      maxTokens: 8192,
      trackingStep: `review-${agentId}`
    });
    const result = parseAgentJson(raw);
    result._agentId = agentId;
    result._label = agent.label;
    result._durationMs = Date.now() - t0;
    return result;
  } catch (err) {
    console.error(`  ❌ Agent [${agent.label}] erreur: ${err.message}`);
    return {
      _agentId: agentId,
      _label: agent.label,
      _durationMs: Date.now() - t0,
      _error: err.message,
      score: 0,
      issues: [{ severity: 'critical', category: 'agent-error', description: `Agent ${agentId} a échoué: ${err.message}`, fix_suggestion: 'Relancer' }],
      strengths: [],
      verdict: 'FAIL'
    };
  }
}

/**
 * Lance tous les agents experts en parallèle
 * @param {Object} ctx - Contexte article
 * @returns {Promise<Object>} { agents: { [id]: result }, allIssues, weightedScore }
 */
export async function runAllAgents(ctx) {
  const agentIds = Object.keys(AGENTS);
  console.log(`\n  🔍 Lancement de ${agentIds.length} agents experts en parallèle...`);

  const results = await Promise.all(
    agentIds.map(id => runAgent(id, ctx))
  );

  const agents = {};
  let totalWeightedScore = 0;
  let totalWeight = 0;
  const allIssues = [];

  for (const result of results) {
    agents[result._agentId] = result;
    const weight = AGENTS[result._agentId].weight;
    totalWeightedScore += (result.score || 0) * weight;
    totalWeight += weight;

    for (const issue of (result.issues || [])) {
      allIssues.push({ ...issue, _agent: result._agentId, _label: result._label });
    }

    const icon = result.verdict === 'PASS' ? '✅' : '❌';
    console.log(`  ${icon} [${result._label}] ${result.score}/100 — ${(result.issues || []).length} issues (${result._durationMs}ms)`);
  }

  const weightedScore = Math.round(totalWeightedScore / totalWeight * 10) / 10;
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;

  console.log(`\n  📊 Score pondéré : ${weightedScore}/100 | Issues critiques : ${criticalCount}`);

  return { agents, allIssues, weightedScore, criticalCount };
}

/**
 * Lance l'agent CEO avec la synthèse des experts
 * @param {Object} panelResult - Résultat de runAllAgents
 * @param {Object} ctx - Contexte article (titre, url)
 * @returns {Promise<Object>} Décision CEO
 */
export async function runCeoValidator(panelResult, ctx) {
  console.log(`\n  👔 Agent CEO/Validator — Analyse de la synthèse...`);

  const summary = Object.entries(panelResult.agents).map(([id, r]) => ({
    agent: r._label,
    score: r.score,
    satisfied: r.satisfied || false,
    verdict: r.verdict,
    issues: (r.issues || []).map(i => ({ severity: i.severity, description: i.description })),
    strengths: r.strengths
  }));

  const allSatisfied = summary.every(s => s.satisfied === true);

  const userPrompt = `ARTICLE : "${ctx.title}"
URL : ${ctx.url || 'N/A'}
SCORE PONDÉRÉ : ${panelResult.weightedScore}/100
ISSUES CRITIQUES : ${panelResult.criticalCount}
TOUS AGENTS SATISFIED : ${allSatisfied ? 'OUI' : 'NON'}

RAPPORTS DES EXPERTS :
${JSON.stringify(summary, null, 2)}`;

  try {
    const raw = await callLlm(CEO_SYSTEM, userPrompt, {
      maxTokens: 4096,
      trackingStep: 'review-ceo-validator'
    });
    const decision = parseAgentJson(raw);
    const icon = decision.decision === 'APPROVE' ? '✅' : '🚫';
    console.log(`  ${icon} CEO : ${decision.decision} (score pondéré: ${decision.weighted_score}) — ${decision.reasoning}`);
    return decision;
  } catch (err) {
    console.error(`  ❌ Agent CEO erreur: ${err.message}`);
    return {
      decision: 'REJECT',
      weighted_score: panelResult.weightedScore,
      reasoning: `Erreur agent CEO: ${err.message}. REJECT par défaut.`,
      critical_fixes: panelResult.allIssues
        .filter(i => i.severity === 'critical')
        .map((i, idx) => ({ priority: idx + 1, agent: i._label, issue: i.description, action: i.fix_suggestion || i.fix_type || 'corriger' })),
      generator_recommendations: []
    };
  }
}

export function getAgentIds() {
  return Object.keys(AGENTS);
}

export function getAgentWeight(agentId) {
  return AGENTS[agentId]?.weight || 1;
}

export default { runAgent, runAllAgents, runCeoValidator, getAgentIds, getAgentWeight };
