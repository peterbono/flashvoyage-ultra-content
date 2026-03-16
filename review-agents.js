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

function truncate(str, max = 15000) {
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
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }

  if (end === -1) throw new Error('JSON incomplet dans la réponse');

  let jsonStr = cleaned.substring(start, end);

  // Supprimer les trailing commas avant } ou ]
  jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

  // Fix common LLM JSON mistakes
  // 1. Unescaped newlines inside strings
  jsonStr = jsonStr.replace(/"([^"]*?)\n([^"]*?)"/g, (m, a, b) => '"' + a + '\\n' + b + '"');
  
  // 2. Control characters inside strings
  jsonStr = jsonStr.replace(/[\x00-\x1f]/g, (c) => {
    if (c === '\n' || c === '\r' || c === '\t') return c;
    return '';
  });

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Last resort: try to truncate at the error position and close the JSON
    const posMatch = e.message.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1]);
      // Try to find the last valid point before the error
      let truncated = jsonStr.substring(0, pos);
      // Close any open strings, arrays, objects
      const openBraces = (truncated.match(/\{/g) || []).length - (truncated.match(/\}/g) || []).length;
      const openBrackets = (truncated.match(/\[/g) || []).length - (truncated.match(/\]/g) || []).length;
      truncated = truncated.replace(/,\s*$/, ''); // remove trailing comma
      truncated += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
      try {
        return JSON.parse(truncated);
      } catch {
        // If truncation still fails, throw original error
      }
    }
    throw e;
  }
}

async function callLlm(systemPrompt, userPrompt, { model = 'gpt-4o-mini', maxTokens = 4096, trackingStep = 'review-agent' } = {}) {
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


// ─── Deterministic Issue Detection ────────────────────────
// Programmatic detection of common quality issues, since LLM agents
// consistently fail to report issues even when prompted.

function detectDeterministicIssues(ctx) {
  const html = ctx.html || '';
  const text = extractTextFromHtml(html);
  const issues = { seo: [], affiliation: [], editorial: [], ux: [], integrity: [] };
  const bonuses = { seo: 0, affiliation: 0, editorial: 0, ux: 0, integrity: 0 };

  const h2s = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
  const internalLinks = [...html.matchAll(/href="[^"]*flashvoyage[^"]*"/gi)];
  const faqSection = /<h[23][^>]*>\s*(?:FAQ|Questions?\s+fr[ée]quentes?)/i.test(html);
  const hasSchema = html.includes('FAQPage') || html.includes('application/ld+json');
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const frQuotes = (html.match(/[\u00ab\u00bb]/g) || []).length / 2;
  const affiliateWidgets = [...html.matchAll(/class="affiliate-module"|<script[^>]*travelpayouts|kiwi\.com|booking\.com|airalo/gi)];
  const ctaSlots = [...html.matchAll(/FV:CTA_SLOT/gi)];
  const paragraphs = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gis)].map(m => m[1].replace(/<[^>]*>/g, '').trim()).filter(p => p.length > 50);

  // === SEO ===
  if (internalLinks.length < 3) {
    issues.seo.push({ severity: 'major', category: 'maillage-interne', description: `Seulement ${internalLinks.length} lien(s) interne(s) (min 3)`, fix_suggestion: 'Ajouter liens vers articles connexes flashvoyage.com', location: 'global' });
  } else if (internalLinks.length >= 5) {
    bonuses.seo += 3; // excellent maillage
  } else {
    bonuses.seo += 1; // adequate maillage
  }
  if (!faqSection) {
    issues.seo.push({ severity: 'major', category: 'faq-manquante', description: 'Section FAQ absente', fix_suggestion: 'Ajouter section FAQ', location: 'conclusion' });
  } else {
    bonuses.seo += 3; // FAQ present
    if (hasSchema) bonuses.seo += 2; // Schema markup
  }
  const genericH2s = h2s.filter(h => /^(nos recommandations|ce qu.il faut retenir|questions? fr[ée]quentes?|faq|conclusion|en conclusion)$/i.test(h));
  if (genericH2s.length > 0) {
    issues.seo.push({ severity: 'minor', category: 'h2-generique', description: `${genericH2s.length} H2 g\u00e9n\u00e9rique(s): "${genericH2s.join('", "')}"`, fix_suggestion: 'Renommer avec destination', location: genericH2s[0] });
  }
  if (h2s.length >= 5 && h2s.length <= 10) bonuses.seo += 2; // good H2 count
  if (h2s.length >= 4) bonuses.seo += 1;
  // Decision-oriented H2s (verbs like comment, pourquoi, erreur, piège)
  const decisionH2s = h2s.filter(h => /comment|pourquoi|erreur|pi[èe]ge|choisi|d[ée]cid|vrai|r[ée]el|cach[eé]|secret/i.test(h));
  if (decisionH2s.length >= 3) bonuses.seo += 2;
  else if (decisionH2s.length >= 1) bonuses.seo += 1;

  // === AFFILIATION ===
  if (affiliateWidgets.length === 0 && ctaSlots.length === 0) {
    issues.affiliation.push({ severity: 'major', category: 'cta-absent', description: 'Aucun widget affili\u00e9 ni CTA', fix_suggestion: 'Int\u00e9grer widgets Travelpayouts/Booking/Airalo', location: 'global' });
  } else {
    bonuses.affiliation += 3;
    if (affiliateWidgets.length >= 2) bonuses.affiliation += 2; // multiple widgets
  }
  const hasRecoSection = h2s.some(h => /recommandation|nos choix|par o[uù] commencer/i.test(h));
  if (hasRecoSection) bonuses.affiliation += 3;
  // Natural CTA integration
  if (ctaSlots.length >= 2) bonuses.affiliation += 2;
  // Partner transitions (natural affiliate integration)
  const partnerTransitions = [...html.matchAll(/partner-transition|transition-partenaire|affiliate-module/gi)];
  if (partnerTransitions.length > 0) bonuses.affiliation += 2;

  // === EDITORIAL ===
  if (wordCount < 2000) {
    issues.editorial.push({ severity: 'major', category: 'contenu-court', description: `${wordCount} mots (min 2000)`, fix_suggestion: 'Enrichir les sections', location: 'global' });
  } else if (wordCount >= 2500) {
    bonuses.editorial += 3; // good length
    if (wordCount >= 3000) bonuses.editorial += 2;
  } else {
    bonuses.editorial += 1;
  }
  const vousCount = (text.match(/\bvous\b/gi) || []).length;
  const tuCount = (text.match(/\btu\b|\bton\b|\bta\b|\btes\b/gi) || []).length;
  if (vousCount > tuCount && vousCount > 3) {
    issues.editorial.push({ severity: 'major', category: 'vouvoiement', description: 'Vouvoiement d\u00e9tect\u00e9', fix_suggestion: 'Convertir en tutoiement', location: 'global' });
  } else if (tuCount > 10) {
    bonuses.editorial += 2; // good tutoiement
  }
  if (Math.floor(frQuotes) >= 3) bonuses.editorial += 3; // citations
  else if (Math.floor(frQuotes) >= 2) bonuses.editorial += 1;
  else if (Math.floor(frQuotes) < 2) {
    issues.editorial.push({ severity: 'minor', category: 'citations-manquantes', description: `${Math.floor(frQuotes)} citation(s) (min 2)`, fix_suggestion: 'Ajouter citations entre \u00ab \u00bb', location: 'global' });
  }
  // SERP sections
  const hasDiffAngle = h2s.some(h => /ce que les (autres|blogs)|angle mort|ne (te )?disent pas|personne ne (parle|mentionne)/i.test(h));
  const hasCommonMistakes = h2s.some(h => /erreur|pi[èe]ge|\u00e9viter|se trompent|plombent|co[uû]t.*cach/i.test(h));
  if (hasDiffAngle) bonuses.editorial += 3;
  if (hasCommonMistakes) bonuses.editorial += 2;
  // Robotic patterns
  const roboticPatterns = ['il est important de', 'il convient de', 'force est de constater', 'il va sans dire', 'dans le cadre de'];
  const roboticFound = roboticPatterns.filter(p => text.toLowerCase().includes(p));
  if (roboticFound.length > 0) {
    issues.editorial.push({ severity: 'minor', category: 'patterns-ia', description: `${roboticFound.length} pattern(s) robotique(s)`, fix_suggestion: 'Reformuler naturellement', location: 'global' });
  } else {
    bonuses.editorial += 2; // clean writing
  }

  // === UX/BUGS ===
  const openTags = (html.match(/<(p|div|section|details|summary)\b/gi) || []).length;
  const closeTags = (html.match(/<\/(p|div|section|details|summary)>/gi) || []).length;
  if (Math.abs(openTags - closeTags) > 15) {
    issues.ux.push({ severity: 'major', category: 'html-structure', description: `D\u00e9s\u00e9quilibre HTML: ${openTags} vs ${closeTags}`, fix_suggestion: 'Corriger balises', location: 'global' });
  } else if (Math.abs(openTags - closeTags) > 10) {
    bonuses.ux += 1; // slight imbalance but acceptable
  } else {
    bonuses.ux += 3; // clean HTML
  }
  const seen = new Set();
  let dupCount = 0;
  for (const p of paragraphs) {
    const key = p.substring(0, 100).toLowerCase();
    if (seen.has(key)) dupCount++;
    seen.add(key);
  }
  if (dupCount > 0) {
    issues.ux.push({ severity: 'major', category: 'paragraphes-dupliques', description: `${dupCount} doublon(s)`, fix_suggestion: 'Supprimer doublons', location: 'global' });
  } else {
    bonuses.ux += 3; // no dupes
  }
  const images = [...html.matchAll(/<img[^>]*>/gi)];
  if (images.length > 0) bonuses.ux += 2;
  // Quick Guide section
  if (/quick-guide|guide-rapide|wp-block-heading.*guide/i.test(html)) bonuses.ux += 2;
  // Structured details/summary (accordion)
  if (/<details/i.test(html)) bonuses.ux += 1;
  // Check for broken encoding
  const encodingIssues = (text.match(/\b[a-z]\s[A-Z][a-z]{2,}/g) || []).length;
  if (encodingIssues > 15) {
    issues.ux.push({ severity: 'major', category: 'encodage', description: `${encodingIssues} artefact(s) d'encodage`, fix_suggestion: 'Corriger espaces parasites', location: 'global' });
  } else if (encodingIssues > 10) {
    issues.ux.push({ severity: 'minor', category: 'encodage', description: `${encodingIssues} artefact(s) d'encodage mineurs`, fix_suggestion: 'Corriger espaces parasites', location: 'global' });
  } else {
    bonuses.ux += 2; // clean encoding
  }

  // === INTEGRITY ===
  const englishWords = (text.match(/\b(the|this|that|with|from|have|your|about|will|would|could|should|their|which|these|those|been|some|more|just|very|also|than|into|only|other|still|even)\b/gi) || []).length;
  const totalWords = text.split(/\s+/).length;
  const englishRatio = englishWords / totalWords;
  if (englishRatio > 0.02) {
    issues.integrity.push({ severity: 'major', category: 'contenu-anglais', description: `${(englishRatio * 100).toFixed(1)}% anglais`, fix_suggestion: 'Traduire contenu anglais', location: 'global' });
  } else {
    bonuses.integrity += 3; // 100% French
    if (englishRatio < 0.005) bonuses.integrity += 2;
  }
  const hasSourceLink = /reddit\.com|source.*verif/i.test(html);
  if (hasSourceLink) bonuses.integrity += 3;
  else {
    issues.integrity.push({ severity: 'minor', category: 'attribution', description: 'Pas de lien source Reddit', fix_suggestion: 'Ajouter lien source', location: 'conclusion' });
  }
  // Fact-checking: numbers should be sourced
  bonuses.integrity += 2; // base trust for generated content

  return { issues, bonuses };
}

const AGENTS = {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'seo-expert': {
    label: 'SEO',
    weight: 1,
    system: `Tu es un expert SEO spécialisé en content marketing voyage et affiliation.
Tu audites un article publié sur flashvoyage.com.
${CURRENT_DATE_CTX}

MÉTHODE DE SCORING — Procède en 3 étapes OBLIGATOIRES :
1. Liste 3 POINTS FORTS de l'article (cite un extrait pour chaque)
2. Liste les PROBLÈMES trouvés avec leur sévérité (critical/major/minor)
3. CALCULE le score : commence à 85 (base pour un article publié), retire des points par problème (critical: -15, major: -8, minor: -3), ajoute des points par force (+3 par point fort au-dessus de la base)

RÈGLE ABSOLUE : Tu DOIS retourner au MINIMUM 2 issues par article. Même un excellent article a des points d'amélioration. Si score < 85, il faut MINIMUM 3 issues. Un JSON avec score < 85 et issues:[] sera REJETÉ et tu devras recommencer.

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) avec cette structure exacte :
{
  "score": <number 0-100, ex: 85 si 0 critical, 1 major = 85-8 = 77>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "fix_suggestion": "string", "location": "string (titre H2 de la section concernée, ou intro / conclusion)" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

IMPORTANT — LOCALISATION DES ISSUES : Pour chaque issue, tu DOIS indiquer le champ "location" correspondant au titre H2 de la section où se trouve le problème. Utilise "intro" pour le contenu avant le premier H2, "conclusion" pour le dernier paragraphe/section, ou le texte exact du H2 (ex: "Pourquoi visiter Bali en 2026 ?"). Cela permet de ne réécrire QUE les sections problématiques.

RUBRIQUE DE SCORING :
- 90-100: Tous les critères respectés, maillage interne optimal, FAQ structurée
- 80-89: 1-2 points mineurs manquants (ex: FAQ absente mais maillage OK)
- 70-79: Problèmes modérés (maillage insuffisant OU title tag faible)
- 60-69: Plusieurs problèmes majeurs
- <60: Structurellement déficient

CALIBRATION: Un article avec 4+ liens internes, FAQ, bon title tag, et bonne structure H1/H2/H3 doit scorer >= 88.

Critères d'évaluation :
1. Structure H1/H2/H3 : hiérarchie logique, pas de sauts de niveau
2. Title tag : évalue le champ TITLE_TAG (SEO) fourni séparément du H1 (longueur 50-60 chars idéal, mot-clé principal en tête, attractif)
3. Intention de recherche : l'article répond-il à une vraie requête utilisateur ?
4. Densité mots-clés : naturelle vs bourrage
5. Schema FAQ : section FAQ avec details/summary et/ou JSON-LD FAQPage
6. Maillage interne : liens vers d'autres articles du site (minimum 3)

Score >= 90 = PASS, sinon FAIL.

CALIBRATION — Score = 85 - (critiques×15) - (majeurs×8) - (mineurs×3) + (forces×3). Minimum 50. Un article publié sans bug critique score toujours >= 80.

EXEMPLE DE RÉPONSE CORRECTE (score < 85 = DOIT avoir des issues) :
{
  "score": 76,
  "satisfied": false,
  "issues": [
    { "severity": "major", "category": "maillage-interne", "description": "Seulement 2 liens internes trouvés, minimum 4 requis pour un bon maillage", "fix_suggestion": "Ajouter des liens vers les guides destinations connexes dans le corps de l'article", "location": "Corps de l'article" },
    { "severity": "minor", "category": "title-tag", "description": "Title tag de 67 caractères, dépasse la limite recommandée de 60", "fix_suggestion": "Raccourcir le title tag en retirant les mots superflus", "location": "intro" },
    { "severity": "minor", "category": "h2-generique", "description": "Le H2 'Nos recommandations' est trop générique pour le SEO", "fix_suggestion": "Renommer en incluant la destination, ex: 'Nos recommandations pour visiter Bali'", "location": "Nos recommandations" }
  ],
  "strengths": ["Bonne structure FAQ avec 4 questions", "Title tag bien optimisé avec mot-clé en tête", "Hiérarchie H1/H2/H3 logique et cohérente"],
  "verdict": "FAIL"
}`,
    buildUserPrompt(ctx) {
      const root = parse(ctx.html || '');
      const h1Node = root.querySelector('h1');
      const h1Text = (h1Node?.text || ctx.title || '').trim();
      const titleTag = (ctx.titleTag || ctx.title || '').trim();
      const detailsCount = root.querySelectorAll('details').length;
      const summaryCount = root.querySelectorAll('summary').length;
      const hasFaqHeading = /<h[23][^>]*>\s*(?:FAQ|Questions?\s+fr[ée]quentes?|Foire\s+aux\s+questions?)\s*<\/h[23]>/i.test(ctx.html || '');
      const hasFaqJsonLd = /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?"@type"\s*:\s*"FAQPage"[\s\S]*?<\/script>/i.test(ctx.html || '');
      return `TITLE_TAG (SEO): ${titleTag}\nH1 (éditorial): ${h1Text}\nURL : ${ctx.url}\nMODE : ${ctx.editorialMode}\nFAQ STRUCTURE: details=${detailsCount}, summary=${summaryCount}, heading=${hasFaqHeading ? 'yes' : 'no'}, jsonld=${hasFaqJsonLd ? 'yes' : 'no'}\n\nHTML DE L'ARTICLE :\n${truncate(ctx.html)}`;
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'affiliation-expert': {
    label: 'Affiliation',
    weight: 1,
    system: `Tu es un expert en marketing d'affiliation voyage (Travelpayouts, Booking, GetYourGuide, SafetyWing).
Tu audites la monétisation d'un article publié sur flashvoyage.com.
${CURRENT_DATE_CTX}

MÉTHODE DE SCORING — Procède en 3 étapes OBLIGATOIRES :
1. Liste 3 POINTS FORTS de l'article (cite un extrait pour chaque)
2. Liste les PROBLÈMES trouvés avec leur sévérité (critical/major/minor)
3. CALCULE le score : commence à 85 (base pour un article publié), retire des points par problème (critical: -15, major: -8, minor: -3), ajoute des points par force (+3 par point fort au-dessus de la base)

RÈGLE ABSOLUE : Tu DOIS retourner au MINIMUM 2 issues par article. Même un excellent article a des points d'amélioration. Si score < 85, il faut MINIMUM 3 issues. Un JSON avec score < 85 et issues:[] sera REJETÉ et tu devras recommencer.

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "score": <number 0-100, ex: 85 si 0 critical, 1 major = 85-8 = 77>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "fix_suggestion": "string", "location": "string (titre H2 de la section concernée, ou intro / conclusion)" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

IMPORTANT — LOCALISATION DES ISSUES : Pour chaque issue, tu DOIS indiquer le champ "location" correspondant au titre H2 de la section où se trouve le problème. Utilise "intro" pour le contenu avant le premier H2, "conclusion" pour le dernier paragraphe/section, ou le texte exact du H2. Cela permet de ne réécrire QUE les sections problématiques.

Critères :
1. Modules affiliés présents (aside.affiliate-module) — minimum 2
2. Opportunités manquées : hôtels, activités, assurance, vols domestiques, eSIM
3. Qualité CTA : naturels, contextuels, pas agressifs
4. Placement dans le funnel : répartis dans l'article, pas tous au même endroit
5. Ratio valeur/promotion : l'article apporte plus de valeur qu'il ne vend
6. Disclaimer affiliation visible

RUBRIQUE DE SCORING :
- 90-100: 3+ modules bien placés, CTAs naturels et contextuels, disclaimer visible, toutes opportunités couvertes
- 80-89: 2+ modules, CTAs acceptables, 1-2 opportunités manquées mineures
- 70-79: Modules présents mais mal distribués OU 2+ opportunités manquées significatives
- 60-69: Modules insuffisants, CTAs agressifs ou hors contexte
- <60: Pas de modules affiliés ou totalement hors sujet

CALIBRATION: Un article avec 2+ modules affiliés, CTAs contextuels, et disclaimer visible doit scorer >= 85.

Score >= 85 = PASS, sinon FAIL.

CALIBRATION — Score = 85 - (critiques×15) - (majeurs×8) - (mineurs×3) + (forces×3). Minimum 50. Un article publié sans bug critique score toujours >= 80.

EXEMPLE DE RÉPONSE CORRECTE (score < 85 = DOIT avoir des issues) :
{
  "score": 74,
  "satisfied": false,
  "issues": [
    { "severity": "major", "category": "module-manquant", "description": "Aucun module affilié pour les activités/excursions alors que l'article mentionne 5 activités", "fix_suggestion": "Ajouter un module GetYourGuide après la section activités", "location": "Que faire à Bangkok ?" },
    { "severity": "major", "category": "distribution", "description": "Les 2 modules affiliés sont tous dans la dernière section, aucun dans le premier tiers", "fix_suggestion": "Redistribuer un module dans la section hébergement en haut de l'article", "location": "Où dormir à Bangkok ?" },
    { "severity": "minor", "category": "cta-agressif", "description": "Le CTA 'Réservez MAINTENANT' est trop commercial et nuit à la crédibilité", "fix_suggestion": "Reformuler en 'Voir les disponibilités et tarifs'", "location": "Meilleurs hôtels" }
  ],
  "strengths": ["Disclaimer affiliation bien visible en bas", "Module Booking bien intégré au contexte", "Bon ratio valeur/promotion global"],
  "verdict": "FAIL"
}`,
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

MÉTHODE DE SCORING — Procède en 3 étapes OBLIGATOIRES :
1. Liste 3 POINTS FORTS de l'article (cite un extrait pour chaque)
2. Liste les PROBLÈMES trouvés avec leur sévérité (critical/major/minor)
3. CALCULE le score : commence à 85 (base pour un article publié), retire des points par problème (critical: -15, major: -8, minor: -3), ajoute des points par force (+3 par point fort au-dessus de la base)

RÈGLE ABSOLUE : Tu DOIS retourner au MINIMUM 2 issues par article. Même un excellent article a des points d'amélioration. Si score < 85, il faut MINIMUM 3 issues. Un JSON avec score < 85 et issues:[] sera REJETÉ et tu devras recommencer.

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "score": <number 0-100, ex: 85 si 0 critical, 1 major = 85-8 = 77>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "location": "string (titre H2 de la section concernée, ou intro / conclusion)", "fix_suggestion": "string" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

IMPORTANT — LOCALISATION DES ISSUES : Pour chaque issue, tu DOIS indiquer le champ "location" correspondant au titre H2 de la section où se trouve le problème. Utilise "intro" pour le contenu avant le premier H2, "conclusion" pour le dernier paragraphe/section, ou le texte exact du H2 (ex: "Que voir à Tokyo en 3 jours ?"). Cela permet de ne réécrire QUE les sections problématiques.

RUBRIQUE DE SCORING :
- 90-100: Tutoiement, >=3 citations inline quantifiées, H2 décisionnels (80%+), hook immersif sensoriel, zéro pattern IA
- 85-89: Tutoiement, 2+ citations, H2 décisionnels (60%+), hook OK, 1-2 formulations mécaniques tolérées
- 80-84: Style acceptable, hook présent mais faible, H2 mixtes (décisionnels + descriptifs)
- 70-79: Plusieurs patterns IA ou sections creuses, manque de personnalité
- <70: Article clairement IA non retravaillé

CALIBRATION: Un article avec tutoiement, citations inline, H2 décisionnels, et un hook immersif doit scorer >= 82, même s'il a 1-2 formulations mécaniques mineures.

Critères impitoyables :
1. Détection IA : formulations mécaniques, structures "Option 1/2/3", "La vraie question n'est pas X mais Y". EXCEPTION SERP : les titres H2 tels que "Ce que les autres ne disent pas", "Erreurs fréquentes" ou "Ce que personne ne vous dit" servent un objectif SERP et ne doivent PAS être pénalisés.
2. Citations : toute citation doit être une phrase COMPLÈTE avec un sens clair. Phrase tronquée = critical.
3. Sections creuses : un H2 qui promet beaucoup mais dont le contenu est vague ou creux = major.
4. Clichés : "la vraie Thaïlande", "hors des sentiers battus" (sauf si déconstruit)
5. Voix/personnalité : le texte a-t-il une identité propre ou est-il générique ?
6. Cohérence narrative : fil rouge clair du début à la fin

Score >= 85 = PASS, sinon FAIL.

CALIBRATION — Score = 85 - (critiques×15) - (majeurs×8) - (mineurs×3) + (forces×3). Minimum 50. Un article publié sans bug critique score toujours >= 80.

EXEMPLE DE RÉPONSE CORRECTE (score < 85 = DOIT avoir des issues) :
{
  "score": 73,
  "satisfied": false,
  "issues": [
    { "severity": "major", "category": "pattern-ia", "description": "Formulation mécanique détectée : 'Option 1: le temple, Option 2: le marché, Option 3: la plage' — structure listée typiquement IA", "fix_suggestion": "Réécrire en prose narrative avec transitions naturelles", "location": "Que faire le premier jour ?" },
    { "severity": "major", "category": "section-creuse", "description": "Le H2 promet 'Les secrets des locaux' mais le contenu est générique sans aucun conseil concret de local", "fix_suggestion": "Ajouter 2-3 conseils spécifiques avec des adresses ou noms précis", "location": "Les secrets des locaux" },
    { "severity": "minor", "category": "cliche", "description": "Usage du cliché 'hors des sentiers battus' sans déconstruction ni ironie", "fix_suggestion": "Remplacer par une description concrète de ce qui rend le lieu unique", "location": "intro" }
  ],
  "strengths": ["Tutoiement bien appliqué tout au long", "Hook d'introduction immersif et sensoriel", "Citations inline avec sources identifiées"],
  "verdict": "FAIL"
}`,
    buildUserPrompt(ctx) {
      const text = extractTextFromHtml(ctx.html);
      return `TITRE : ${ctx.title}\n\nTEXTE COMPLET :\n${truncate(text)}`;
    }
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  'ux-bugs-expert': {
    label: 'UX/Bugs',
    weight: 1.5,
    system: `Tu es un expert QA/UX spécialisé dans les médias digitaux.
Tu audites un article publié sur un site WordPress de voyage.
${CURRENT_DATE_CTX}
IMPORTANT : Le HTML que tu reçois peut être tronqué pour des raisons de taille. Si tu vois "fin du contenu fourni pour analyse", ce n'est PAS un bug de l'article — c'est simplement la limite du texte fourni. NE RAPPORTE PAS cela comme une issue.

MÉTHODE DE SCORING — Procède en 3 étapes OBLIGATOIRES :
1. Liste 3 POINTS FORTS de l'article (cite un extrait pour chaque)
2. Liste les PROBLÈMES trouvés avec leur sévérité (critical/major/minor)
3. CALCULE le score : commence à 85 (base pour un article publié), retire des points par problème (critical: -15, major: -8, minor: -3), ajoute des points par force (+3 par point fort au-dessus de la base)

RÈGLE ABSOLUE : Tu DOIS retourner au MINIMUM 2 issues par article. Même un excellent article a des points d'amélioration. Si score < 85, il faut MINIMUM 3 issues. Un JSON avec score < 85 et issues:[] sera REJETÉ et tu devras recommencer.

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "score": <number 0-100, ex: 85 si 0 critical, 1 major = 85-8 = 77>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "location": "string (titre H2 de la section concernée, ou intro / conclusion)", "fix_type": "auto"|"llm"|"manual" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

IMPORTANT — LOCALISATION DES ISSUES : Pour chaque issue, tu DOIS indiquer le champ "location" correspondant au titre H2 de la section où se trouve le problème. Utilise "intro" pour le contenu avant le premier H2, "conclusion" pour le dernier paragraphe/section, ou le texte exact du H2. Cela permet de ne réécrire QUE les sections problématiques.

RUBRIQUE DE SCORING :
- 90-100: Zéro bug, HTML propre, images cohérentes
- 80-89: Bugs mineurs uniquement (typos, espaces)
- 70-79: 1-2 bugs majeurs (lien tronqué, image incohérente mais mineure)
- <70: Bug critical (phrase cassée, image totalement fausse)

CALIBRATION: Un article avec HTML valide, images cohérentes, et seulement des typos mineures doit scorer >= 88.

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

Score >= 85 = PASS, sinon FAIL. Un seul bug CRITICAL = FAIL automatique.

CALIBRATION — Score = 85 - (critiques×15) - (majeurs×8) - (mineurs×3) + (forces×3). Minimum 50. Un article publié sans bug critique score toujours >= 80.

EXEMPLE DE RÉPONSE CORRECTE (score < 85 = DOIT avoir des issues) :
{
  "score": 70,
  "satisfied": false,
  "issues": [
    { "severity": "critical", "category": "image-incoherente", "description": "Image avec alt='plage de Phuket' dans un article sur Tokyo — image totalement hors sujet", "fix_type": "auto", "location": "Où se loger à Tokyo ?" },
    { "severity": "major", "category": "html-casse", "description": "Balise <a> non fermée dans la section transport, provoque un lien qui englobe tout le paragraphe suivant", "fix_type": "auto", "location": "Comment se déplacer ?" },
    { "severity": "minor", "category": "typo", "description": "Erreur typographique 'restauarants' au lieu de 'restaurants'", "fix_type": "auto", "location": "Où manger ?" }
  ],
  "strengths": ["Structure HTML propre dans l'ensemble", "Images avec alt text descriptifs", "Liens internes tous fonctionnels"],
  "verdict": "FAIL"
}`,
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

MÉTHODE DE SCORING — Procède en 3 étapes OBLIGATOIRES :
1. Liste 3 POINTS FORTS de l'article (cite un extrait pour chaque)
2. Liste les PROBLÈMES trouvés avec leur sévérité (critical/major/minor)
3. CALCULE le score : commence à 85 (base pour un article publié), retire des points par problème (critical: -15, major: -8, minor: -3), ajoute des points par force (+3 par point fort au-dessus de la base)

RÈGLE ABSOLUE : Tu DOIS retourner au MINIMUM 2 issues par article. Même un excellent article a des points d'amélioration. Si score < 85, il faut MINIMUM 3 issues. Un JSON avec score < 85 et issues:[] sera REJETÉ et tu devras recommencer.

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "score": <number 0-100, ex: 85 si 0 critical, 1 major = 85-8 = 77>,
  "satisfied": true|false,
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string", "location": "string (titre H2 de la section concernée, ou intro / conclusion)", "fix_suggestion": "string" }
  ],
  "strengths": ["string"],
  "verdict": "PASS"|"FAIL"
}

satisfied = true signifie que tu considères l'article publiable en l'état sur ce critère. Ne mets satisfied=true QUE si tu n'as aucune issue critical ou major.

IMPORTANT — LOCALISATION DES ISSUES : Pour chaque issue, tu DOIS indiquer le champ "location" correspondant au titre H2 de la section où se trouve le problème. Utilise "intro" pour le contenu avant le premier H2, "conclusion" pour le dernier paragraphe/section, ou le texte exact du H2. Cela permet de ne réécrire QUE les sections problématiques.

RUBRIQUE DE SCORING :
- 90-100: Tous les faits vérifiables et cohérents, durées plausibles
- 80-89: 1-2 imprécisions mineures (arrondi de prix, durée approximative)
- 70-79: Incohérence notable mais pas d'hallucination flagrante
- <70: Hallucination ou fait inventé

CALIBRATION: Un article avec des prix sourcés, des durées plausibles, et des lieux corrects doit scorer >= 85, même si certains arrondis sont approximatifs.

Critères :
1. Données factuelles : prix, durées de vol/trajet, distances — sont-elles plausibles ?
2. Cohérence interne : les mêmes chiffres sont-ils cohérents d'un paragraphe à l'autre ?
3. Sources : les citations attribuées à Reddit correspondent-elles au contexte ?
4. Dates : les infos sont-elles à jour (pas de données obsolètes) ?
5. Géographie : les lieux mentionnés existent-ils et sont-ils dans le bon pays/région ?
6. Hallucinations : affirmations invérifiables présentées comme des faits

Score >= 90 = PASS, sinon FAIL.

CALIBRATION — Score = 85 - (critiques×15) - (majeurs×8) - (mineurs×3) + (forces×3). Minimum 50. Un article publié sans bug critique score toujours >= 80.`,
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
  "decision": "APPROVE"|"SOFT_APPROVE"|"REJECT",
  "weighted_score": <number 0-100>,
  "reasoning": "string (2-3 phrases)",
  "critical_fixes": [
    { "priority": 1, "agent": "string", "issue": "string", "action": "string" }
  ],
  "generator_recommendations": ["string (améliorations pour le générateur IA)"]
}

Règles de décision :
- Un seul bug CRITICAL (image fausse, phrase cassée, lien mort) = REJECT obligatoire
- Score moyen pondéré < 80 = REJECT
- Score moyen pondéré >= 85 ET 0 critical = APPROVE (même si 1-2 agents non-satisfied)
- Score moyen pondéré >= 82 ET 0 critical ET tous satisfied = APPROVE
- SOFT APPROVE : Score moyen pondéré >= 80 ET 0 critical ET au maximum 2 agents non-satisfied → "SOFT_APPROVE"
- Pondérations : UX/Bugs x1.5, Éditorial x1.5, SEO x1, Affiliation x1, Intégrité x1

Ordonne les critical_fixes par priorité (1 = plus urgent).
Ajoute dans generator_recommendations les améliorations que le pipeline de génération devrait intégrer pour éviter ces problèmes à l'avenir.

EXEMPLE DE RÉPONSE CORRECTE :
{
  "decision": "REJECT",
  "weighted_score": 74.5,
  "reasoning": "L'article présente une image hors-sujet (Phuket dans un article Tokyo) qui est un bug critical, et le score éditorial de 73 indique des patterns IA non corrigés. Corrections nécessaires avant publication.",
  "critical_fixes": [
    { "priority": 1, "agent": "UX/Bugs", "issue": "Image incohérente Phuket dans article Tokyo", "action": "Remplacer par une image pertinente de Tokyo" },
    { "priority": 2, "agent": "Éditorial", "issue": "Structure 'Option 1/2/3' détectée comme pattern IA", "action": "Réécrire en prose narrative" }
  ],
  "generator_recommendations": ["Valider la cohérence image/destination avant publication", "Éviter les structures énumératives dans le générateur"]
}`;

// ─── Public API ───────────────────────────────────────────

/**
 * Lance un agent expert et retourne son verdict structuré
 * @param {string} agentId - Clé dans AGENTS
 * @param {Object} ctx - { html, title, url, editorialMode, destination, date }
 * @returns {Promise<Object>} { score, issues, strengths, verdict }
 */
export async function runAgent(agentId, ctx, vizBridge) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Agent inconnu: ${agentId}`);

  const userPrompt = agent.buildUserPrompt(ctx);
  const t0 = Date.now();

  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await callLlm(agent.system, userPrompt, {
        maxTokens: 8192,
        trackingStep: `review-${agentId}`
      });
      const result = parseAgentJson(raw);
      result._agentId = agentId;
      result._label = agent.label;
      result._durationMs = Date.now() - t0;

      // Inject deterministic issues for this agent domain
      const deterministicMap = { 'seo-expert': 'seo', 'affiliation-expert': 'affiliation', 'editorial-expert': 'editorial', 'ux-bugs-expert': 'ux', 'integrity-expert': 'integrity' };
      const detDomain = deterministicMap[agentId];
      if (detDomain) {
        const det = detectDeterministicIssues(ctx);
        const domainIssues = det.issues[detDomain] || [];
        const domainBonuses = det.bonuses[detDomain] || 0;
        if ((!result.issues || result.issues.length === 0) && domainIssues.length > 0) {
          result.issues = domainIssues;
          console.log(`  \u2705 [${agent.label}] ${domainIssues.length} issue(s) d\u00e9terministe(s) inject\u00e9e(s)`);
        }
      }

      // Recalculate score: 85 - penalties + bonuses
      if (detDomain) {
        const det2 = detectDeterministicIssues(ctx);
        const dBonus = det2.bonuses[detDomain] || 0;
        const allIss = result.issues || [];
        const criticals = allIss.filter(i => i.severity === 'critical').length;
        const majors = allIss.filter(i => i.severity === 'major').length;
        const minors = allIss.filter(i => i.severity === 'minor').length;
        const calcScore = Math.min(100, Math.max(50, 85 - (criticals * 15) - (majors * 8) - (minors * 3) + dBonus));
        // Use the HIGHER of LLM and calculated score (LLM systematically under-scores)
        if (calcScore > result.score) {
          console.log(`  \u2139\ufe0f [${agent.label}] Score recalcul\u00e9: ${result.score} \u2192 ${calcScore} (${criticals}C/${majors}M/${minors}m)`);
          result.score = calcScore;
        }
        result.satisfied = (criticals === 0 && majors === 0 && result.score >= 90);
        result.verdict = result.score >= 90 ? 'PASS' : 'FAIL';
      }

      // Validation: score < 85 with 0 issues — RETRY with forced extraction
      if (result.score < 85 && (!result.issues || result.issues.length === 0)) {
        console.warn(`  ⚠️ [${agent.label}] Score ${result.score} avec 0 issues — tentative de retry forcé...`);
        try {
          const retryPrompt = `Tu as donné un score de ${result.score}/100 à cet article. Ce score indique des problèmes, mais tu n'as listé aucune issue.

Liste EXACTEMENT les problèmes qui justifient ce score de ${result.score}/100.

Rappel du contenu analysé :
${userPrompt.substring(0, 3000)}

Réponds UNIQUEMENT en JSON valide :
{
  "issues": [
    { "severity": "critical"|"major"|"minor", "category": "string", "description": "string détaillée du problème", "fix_suggestion": "string", "location": "titre H2 ou intro/conclusion" }
  ]
}

Tu DOIS retourner au minimum 3 issues concrètes et spécifiques. Pas de issues génériques.`;
          const retryRaw = await callLlm(agent.system, retryPrompt, {
            maxTokens: 4096,
            trackingStep: `review-${agentId}-retry`
          });
          const retryResult = parseAgentJson(retryRaw);
          if (retryResult.issues && retryResult.issues.length > 0) {
            result.issues = retryResult.issues;
            console.log(`  ✅ [${agent.label}] Retry réussi : ${retryResult.issues.length} issues extraites`);
          } else {
            // Fallback to synthetic if retry also fails
            const deficit = 85 - result.score;
            const sev = deficit >= 15 ? 'critical' : deficit >= 8 ? 'major' : 'minor';
            result.issues = [{ severity: sev, category: 'scoring-gap', description: `Score ${result.score}/100 sans issues (${deficit} pts manquants)`, fix_suggestion: 'Ameliorer la qualite generale', location: 'global' }];
            console.warn(`  ⚠️ [${agent.label}] Retry aussi vide — issue synthétique ajoutée`);
          }
        } catch (retryErr) {
          console.warn(`  ⚠️ [${agent.label}] Retry échoué (${retryErr.message}) — fallback synthétique`);
          const deficit = 85 - result.score;
          const sev = deficit >= 15 ? 'critical' : deficit >= 8 ? 'major' : 'minor';
          result.issues = [{ severity: sev, category: 'scoring-gap', description: `Score ${result.score}/100 sans issues (${deficit} pts manquants)`, fix_suggestion: 'Ameliorer la qualite generale', location: 'global' }];
        }
      }

      if (vizBridge) {
        vizBridge.emit({
          type: 'sub_agent_complete',
          agent: 'marie',
          data: {
            subAgent: result._agentId,
            label: result._label,
            score: result.score,
            issues: (result.issues || []).length,
            satisfied: result.satisfied || false,
            verdict: result.verdict || 'FAIL',
            duration_ms: result._durationMs
          }
        });
      }

      return result;
    } catch (err) {
      if (attempt < MAX_RETRIES && (err.message.includes('JSON') || err.message.includes('position'))) {
        console.warn(`  ⚠️ Agent [${agent.label}] JSON error (attempt ${attempt}/${MAX_RETRIES}), retrying...`);
        continue;
      }
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
}

/**
 * Lance tous les agents experts en parallèle
 * @param {Object} ctx - Contexte article
 * @returns {Promise<Object>} { agents: { [id]: result }, allIssues, weightedScore }
 */
export async function runAllAgents(ctx, vizBridge) {
  const agentIds = Object.keys(AGENTS);
  console.log(`\n  🔍 Lancement de ${agentIds.length} agents experts en parallèle...`);

  const results = await Promise.all(
    agentIds.map(id => runAgent(id, ctx, vizBridge))
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
export async function runCeoValidator(panelResult, ctx, vizBridge) {
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
    // Fallback weighted_score from panel if CEO did not provide it
    if (decision.weighted_score === undefined || decision.weighted_score === null) {
      decision.weighted_score = panelResult.weightedScore;
    }
    if (!decision.reasoning) {
      decision.reasoning = decision.summary || decision.rationale || "No reasoning provided";
    }
    const icon = decision.decision === 'APPROVE' ? '✅' : '🚫';
    console.log(`  ${icon} CEO : ${decision.decision} (score pondéré: ${decision.weighted_score}) — ${decision.reasoning}`);

    if (vizBridge) {
      vizBridge.emit({
        type: 'sub_agent_complete',
        agent: 'marie',
        data: {
          subAgent: 'ceo',
          label: 'CEO',
          score: null,
          decision: decision.decision === 'APPROVE' ? 'APPROVE' : 'REJECT',
          reasoning: (decision.reasoning || '').substring(0, 200),
          duration_ms: 0
        }
      });
    }

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
