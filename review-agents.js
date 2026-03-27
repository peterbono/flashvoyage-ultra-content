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
  const isNews = (ctx.editorialMode || '').toLowerCase() === 'news';

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
  const minInternalLinks = isNews ? 1 : 3;
  if (internalLinks.length < minInternalLinks) {
    issues.seo.push({ severity: 'major', category: 'maillage-interne', description: `Seulement ${internalLinks.length} lien(s) interne(s) (min ${minInternalLinks})`, fix_suggestion: 'Ajouter liens vers articles connexes flashvoyage.com', location: 'global' });
  } else if (internalLinks.length >= 5) {
    bonuses.seo += 3; // excellent maillage
  } else {
    bonuses.seo += isNews ? 2 : 1; // adequate maillage (news gets slightly more bonus)
  }
  if (!isNews) {
    // FAQ only required for evergreen
    if (!faqSection) {
      issues.seo.push({ severity: 'major', category: 'faq-manquante', description: 'Section FAQ absente', fix_suggestion: 'Ajouter section FAQ', location: 'conclusion' });
    } else {
      bonuses.seo += 3; // FAQ present
      if (hasSchema) bonuses.seo += 2; // Schema markup
    }
  } else {
    // News: FAQ is optional, no penalty, small bonus if present
    if (faqSection) bonuses.seo += 1;
  }
  const genericH2s = h2s.filter(h => /^(nos recommandations|ce qu.il faut retenir|questions? fr[ée]quentes?|faq|conclusion|en conclusion)$/i.test(h));
  if (genericH2s.length > 0) {
    issues.seo.push({ severity: 'minor', category: 'h2-generique', description: `${genericH2s.length} H2 g\u00e9n\u00e9rique(s): "${genericH2s.join('", "')}"`, fix_suggestion: 'Renommer avec destination', location: genericH2s[0] });
  }
  if (isNews) {
    // News: 2-4 H2s is ideal
    if (h2s.length >= 2 && h2s.length <= 4) bonuses.seo += 3;
    else if (h2s.length >= 1) bonuses.seo += 1;
  } else {
    if (h2s.length >= 5 && h2s.length <= 10) bonuses.seo += 2; // good H2 count
    if (h2s.length >= 4) bonuses.seo += 1;
  }
  // Decision-oriented H2s (verbs like comment, pourquoi, erreur, piège)
  const decisionH2s = h2s.filter(h => /comment|pourquoi|erreur|pi[èe]ge|choisi|d[ée]cid|vrai|r[ée]el|cach[eé]|secret/i.test(h));
  if (isNews) {
    if (decisionH2s.length >= 1) bonuses.seo += 2;
  } else {
    if (decisionH2s.length >= 3) bonuses.seo += 2;
    else if (decisionH2s.length >= 1) bonuses.seo += 1;
  }

  // === AFFILIATION ===
  if (isNews) {
    // News: 0 widgets is acceptable, 1 widget gets full bonus
    if (affiliateWidgets.length >= 1 || ctaSlots.length >= 1) {
      bonuses.affiliation += 5; // full bonus for any widget in news
    } else {
      bonuses.affiliation += 2; // no penalty, small base bonus for news without widgets
    }
  } else {
    if (affiliateWidgets.length === 0 && ctaSlots.length === 0) {
      issues.affiliation.push({ severity: 'major', category: 'cta-absent', description: 'Aucun widget affili\u00e9 ni CTA', fix_suggestion: 'Int\u00e9grer widgets Travelpayouts/Booking/Airalo', location: 'global' });
    } else {
      bonuses.affiliation += 3;
      if (affiliateWidgets.length >= 2) bonuses.affiliation += 2; // multiple widgets
    }
  }
  if (!isNews) {
    // Reco section bonus only for evergreen
    const hasRecoSection = h2s.some(h => /recommandation|nos choix|par o[uù] commencer/i.test(h));
    if (hasRecoSection) bonuses.affiliation += 3;
  }
  // Natural CTA integration
  if (isNews) {
    if (ctaSlots.length >= 1) bonuses.affiliation += 2;
  } else {
    if (ctaSlots.length >= 2) bonuses.affiliation += 2;
  }
  // Partner transitions (natural affiliate integration)
  const partnerTransitions = [...html.matchAll(/partner-transition|transition-partenaire|affiliate-module/gi)];
  if (partnerTransitions.length > 0) bonuses.affiliation += 2;

  // === EDITORIAL ===
  if (isNews) {
    // News: lower word count thresholds
    if (wordCount < 500) {
      issues.editorial.push({ severity: 'major', category: 'contenu-court', description: `${wordCount} mots (min 500 pour news)`, fix_suggestion: 'Enrichir les sections', location: 'global' });
    } else if (wordCount >= 800) {
      bonuses.editorial += 3; // excellent length for news
    } else if (wordCount >= 600) {
      bonuses.editorial += 1; // good length for news
    }
  } else {
    if (wordCount < 2000) {
      issues.editorial.push({ severity: 'major', category: 'contenu-court', description: `${wordCount} mots (min 2000)`, fix_suggestion: 'Enrichir les sections', location: 'global' });
    } else if (wordCount >= 2500) {
      bonuses.editorial += 3; // good length
      if (wordCount >= 3000) bonuses.editorial += 2;
    } else {
      bonuses.editorial += 1;
    }
  }
  const vousCount = (text.match(/\bvous\b/gi) || []).length;
  const tuCount = (text.match(/\btu\b|\bton\b|\bta\b|\btes\b/gi) || []).length;
  if (vousCount > tuCount && vousCount > 3) {
    issues.editorial.push({ severity: 'major', category: 'vouvoiement', description: 'Vouvoiement d\u00e9tect\u00e9', fix_suggestion: 'Convertir en tutoiement', location: 'global' });
  } else if (tuCount > 10) {
    bonuses.editorial += 2; // good tutoiement
  }
  if (isNews) {
    // News: 1 quote is acceptable, 0 is minor (not major)
    if (Math.floor(frQuotes) >= 1) bonuses.editorial += 2;
    else {
      issues.editorial.push({ severity: 'minor', category: 'citations-manquantes', description: `${Math.floor(frQuotes)} citation(s) (min 1 pour news)`, fix_suggestion: 'Ajouter au moins une citation entre \u00ab \u00bb', location: 'global' });
    }
  } else {
    if (Math.floor(frQuotes) >= 3) bonuses.editorial += 3; // citations
    else if (Math.floor(frQuotes) >= 2) bonuses.editorial += 1;
    else if (Math.floor(frQuotes) < 2) {
      issues.editorial.push({ severity: 'minor', category: 'citations-manquantes', description: `${Math.floor(frQuotes)} citation(s) (min 2)`, fix_suggestion: 'Ajouter citations entre \u00ab \u00bb', location: 'global' });
    }
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
  if (Math.abs(openTags - closeTags) > 20) {
    issues.ux.push({ severity: 'major', category: 'html-structure', description: `D\u00e9s\u00e9quilibre HTML: ${openTags} vs ${closeTags}`, fix_suggestion: 'Corriger balises', location: 'global' });
  } else if (Math.abs(openTags - closeTags) > 12) {
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
  // Quick Guide section (skip for news)
  if (!isNews && /quick-guide|guide-rapide|wp-block-heading.*guide/i.test(html)) bonuses.ux += 2;
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

  // === CHECK 1: BLOCKQUOTE LANGUAGE — detect English blockquotes ===
  const blockquotes = [...html.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi)];
  for (const bq of blockquotes) {
    const bqText = bq[1].replace(/<[^>]+>/g, '').trim();
    if (bqText.length < 15) continue;
    const bqWords = bqText.split(/\s+/);
    const englishStopwords = /^(the|is|are|was|were|have|has|had|will|would|could|should|can|do|does|did|not|but|and|or|for|with|from|this|that|what|how|you|your|my|I|a|an|of|to|in|on|at|by|as|if|so|no|just|about|really|very|also|too|need|want|trip|travel|solo|first|time|get|go|know|think|it|we|they)$/i;
    const engCount = bqWords.filter(w => englishStopwords.test(w)).length;
    const engRatio = engCount / bqWords.length;
    if (engRatio > 0.25 && bqWords.length >= 5) {
      issues.integrity.push({
        severity: 'critical',
        category: 'blockquote-anglais',
        description: `Blockquote en anglais non traduit: "${bqText.substring(0, 80)}..."`,
        fix_suggestion: 'Traduire la citation en français ou la supprimer',
        location: 'global'
      });
    }
  }

  // === CHECK 2: FAQ DESTINATION COHERENCE — detect wrong transport/seasons ===
  const destination = (ctx.destination || ctx._smart_destination || '').toLowerCase();
  const faqEntries = [...html.matchAll(/<details[^>]*>\s*<summary[^>]*>(.*?)<\/summary>\s*([\s\S]*?)<\/details>/gi)];
  const destinationTransportMap = {
    'japon': { invalid: /\bscooter|tuk.?tuk|grab|gojek|angkot|songthaew/i, expected: 'shinkansen, métro, JR Pass, bus locaux' },
    'tokyo': { invalid: /\bscooter|tuk.?tuk|grab|gojek|angkot/i, expected: 'shinkansen, métro, JR Pass' },
    'thailande': { invalid: /\bshinkansen|jr.?pass|tgv|uber\b/i, expected: 'BTS, MRT, Grab, songthaew' },
    'bangkok': { invalid: /\bshinkansen|jr.?pass|tgv\b/i, expected: 'BTS, MRT, Grab, tuk-tuk' },
    'vietnam': { invalid: /\bshinkansen|jr.?pass|bts|mrt\b/i, expected: 'Grab, bus couchette, train Réunification' },
    'indonesie': { invalid: /\bshinkansen|jr.?pass|tgv|bts|mrt\b/i, expected: 'Gojek, Grab, ojek, bemo' },
    'bali': { invalid: /\bshinkansen|jr.?pass|tgv|bts|mrt\b/i, expected: 'scooter, Grab, voiture avec chauffeur' },
  };
  const destinationSeasonMap = {
    'japon': { invalid: /(?:haute saison|peak).*?(?:d[ée]cembre|janvier|f[ée]vrier)|(?:basse saison|off.?season).*?(?:mai|septembre)/i, note: 'Peak = mars-avril (cherry blossom) + oct-nov (momiji)' },
  };
  if (destination) {
    for (const [dest, rules] of Object.entries(destinationTransportMap)) {
      if (!destination.includes(dest)) continue;
      for (const faq of faqEntries) {
        const question = faq[1].replace(/<[^>]+>/g, '').toLowerCase();
        const answer = faq[2].replace(/<[^>]+>/g, '');
        if (/(transport|d[ée]placer|bouger|circuler)/i.test(question) && rules.invalid.test(answer)) {
          issues.integrity.push({
            severity: 'critical', category: 'faq-transport-incoherent',
            description: `FAQ transport mentionne un mode inadapté pour ${dest}: "${answer.match(rules.invalid)[0]}"`,
            fix_suggestion: `Remplacer par: ${rules.expected}`, location: 'FAQ'
          });
        }
      }
    }
    for (const [dest, rules] of Object.entries(destinationSeasonMap)) {
      if (!destination.includes(dest)) continue;
      for (const faq of faqEntries) {
        const answer = faq[2].replace(/<[^>]+>/g, '');
        if (rules.invalid.test(answer)) {
          issues.integrity.push({
            severity: 'critical', category: 'faq-saison-fausse',
            description: `FAQ saisons incorrectes pour ${dest}. ${rules.note}`,
            fix_suggestion: `Corriger avec les vraies saisons: ${rules.note}`, location: 'FAQ'
          });
        }
      }
    }
  }

  // === CHECK 3: BUDGET INTERNAL CONSISTENCY ===
  // Broader regex: catches "16€/nuit", "16 euros/nuit", "16 EUR/nuit", "150€ par nuit", etc.
  const budgetRegex = /(\d{1,5})\s*(?:€|euros?|EUR)\s*(?:\/|\s*par\s+)\s*(nuit|jour|night|day|semaine|mois|personne)/gi;
  const budgetMentions = [...text.matchAll(budgetRegex)].map(m => ({
    amount: parseInt(m[1]), unit: m[2].toLowerCase(),
    context: text.substring(Math.max(0, m.index - 40), m.index + m[0].length + 40)
  }));
  // Also match "nuit à 16€" / "nuit pour 150€" patterns (reversed order)
  const budgetRegexReversed = /(nuit|jour|night|day|semaine|mois)\s+(?:à|pour|de|:)\s*(\d{1,5})\s*(?:€|euros?|EUR)/gi;
  for (const m of text.matchAll(budgetRegexReversed)) {
    budgetMentions.push({
      amount: parseInt(m[2]), unit: m[1].toLowerCase(),
      context: text.substring(Math.max(0, m.index - 40), m.index + m[0].length + 40)
    });
  }
  const dailyRates = budgetMentions.map(b => {
    let daily = b.amount;
    if (/semaine/.test(b.unit)) daily = b.amount / 7;
    if (/mois/.test(b.unit)) daily = b.amount / 30;
    return { ...b, daily };
  });
  if (dailyRates.length >= 2) {
    const sorted = dailyRates.sort((a, b) => a.daily - b.daily);
    if (sorted[sorted.length - 1].daily > sorted[0].daily * 5 && sorted[0].daily > 0) {
      issues.integrity.push({
        severity: 'critical', category: 'budget-contradictoire',
        description: `Incohérence budget: ${sorted[0].amount}€/${sorted[0].unit} vs ${sorted[sorted.length - 1].amount}€/${sorted[sorted.length - 1].unit} (ratio ${(sorted[sorted.length - 1].daily / sorted[0].daily).toFixed(1)}x). Utiliser des fourchettes explicites avec contexte (hostel vs hôtel).`,
        fix_suggestion: 'Harmoniser les chiffres budget ou préciser le contexte (ex: hostel 16€/nuit vs hôtel 150€/nuit)', location: 'global'
      });
    }
  }

  // === CHECK 4: WIDGET DESTINATION MISMATCH ===
  if (destination) {
    const widgetDestPatterns = [
      ...html.matchAll(/(?:data-(?:city|location|destination)|city=|location=|destination=|q=)["']([^"']+)["']/gi),
      ...html.matchAll(/(?:tiqets|getyourguide|viator|booking)\.com[^"]*?[?&](?:city|q|destination)=([^&"]+)/gi)
    ];
    const knownDestinations = {
      'japon': ['tokyo', 'kyoto', 'osaka', 'japan', 'japon', 'nara', 'hiroshima', 'hakone', 'matsumoto'],
      'thailande': ['bangkok', 'chiang', 'phuket', 'thailand', 'thailande', 'krabi', 'koh'],
      'vietnam': ['hanoi', 'saigon', 'ho chi minh', 'hoi an', 'da nang', 'vietnam', 'halong'],
      'indonesie': ['bali', 'jakarta', 'yogyakarta', 'indonesia', 'indonesie', 'lombok'],
    };
    const allowedCities = [];
    for (const [dest, cities] of Object.entries(knownDestinations)) {
      if (destination.includes(dest)) allowedCities.push(...cities);
    }
    if (allowedCities.length > 0) {
      for (const wm of widgetDestPatterns) {
        const widgetCity = decodeURIComponent(wm[1]).toLowerCase().replace(/[+%20]/g, ' ');
        const isAllowed = allowedCities.some(c => widgetCity.includes(c) || c.includes(widgetCity));
        if (!isAllowed && widgetCity.length > 2) {
          issues.ux.push({
            severity: 'critical', category: 'widget-destination-mismatch',
            description: `Widget affilié pour "${widgetCity}" dans un article sur "${destination}"`,
            fix_suggestion: `Remplacer le widget par un pour ${destination}`, location: 'global'
          });
        }
      }
    }
  }

  // === CHECK 5: GENERIC FILLER SECTION ===
  const sectionParts = html.split(/(?=<h2[\s>])/i);
  for (const part of sectionParts) {
    const h2Match = part.match(/<h2[^>]*>(.*?)<\/h2>/i);
    if (!h2Match) continue;
    const sectionTitle = h2Match[1].replace(/<[^>]+>/g, '').trim();
    const sectionText = part.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const sectionWords = sectionText.split(/\s+/).length;
    if (/faq|questions?\s+fr[ée]quentes?/i.test(sectionTitle)) continue;
    const hasNumbers = /\d+\s*[€$%]|\d{2,}/.test(sectionText);
    const numberMatches = (sectionText.match(/\d+\s*[€$%]|\d{2,}/g) || []).length;
    const fillerPhrases = (sectionText.match(/il est (important|essentiel|crucial|recommandé)|en général|souvent|parfois|certains|la plupart|beaucoup de|il convient/gi) || []).length;
    if (sectionWords > 50 && sectionWords < 300 && !hasNumbers && fillerPhrases >= 2) {
      issues.editorial.push({
        severity: 'major', category: 'section-creuse',
        description: `Section "${sectionTitle}" (${sectionWords} mots) sans données concrètes — ${fillerPhrases} phrases vagues, 0 chiffre`,
        fix_suggestion: 'Ajouter des données chiffrées, noms de lieux, prix ou durées concrètes', location: sectionTitle
      });
    }
    // Flag "guides ne disent pas" / "guides classiques" / "guides ignorent" sections with fewer than 2 specific numbers
    const isGuidesSection = /guides?\s+(ne\s+disent|classiques?|ignorent|occultent|ne\s+mentionnent)/i.test(sectionTitle);
    if (isGuidesSection && numberMatches < 2) {
      issues.editorial.push({
        severity: 'major', category: 'section-creuse',
        description: `Section "${sectionTitle}" est une section "angle différenciant" mais ne contient que ${numberMatches} chiffre(s) — minimum 2 faits spécifiques avec données chiffrées requis`,
        fix_suggestion: 'Remplacer le contenu générique par des faits précis : arnaques nommées avec lieu, coûts en devise locale + EUR, dates de fermeture exactes', location: sectionTitle
      });
    }
  }

  // === CHECK 6: TITLE NUMBER PROMISE DELIVERY ===
  const titleText = ctx.title || ctx.titleTag || '';
  const numberPromise = titleText.match(/(\d+)\s+(erreur|pi[èe]ge|astuce|conseil|chose|fa[çc]on|raison|secret|frais|co[uû]t|point|question|[ée]tape|id[ée]e|lieu|endroit|activit[ée]|exp[ée]rience)/i);
  if (numberPromise) {
    const promisedCount = parseInt(numberPromise[1]);
    const numberedH3s = [...html.matchAll(/<h3[^>]*>\s*\d+[\.\):\s]/gi)].length;
    const orderedListItems = [...html.matchAll(/<ol[^>]*>([\s\S]*?)<\/ol>/gi)]
      .flatMap(ol => [...ol[1].matchAll(/<li/gi)]).length;
    const boldNumbered = [...html.matchAll(/<(?:strong|b)>\s*\d+[\.):\s]/gi)].length;
    const totalNumbered = Math.max(numberedH3s, orderedListItems, boldNumbered);
    if (totalNumbered < promisedCount * 0.5) {
      issues.seo.push({
        severity: totalNumbered === 0 ? 'critical' : 'major',
        category: 'title-promise-broken',
        description: `Titre promet "${promisedCount} ${numberPromise[2]}" mais contenu ne livre que ~${totalNumbered} éléments numérotés`,
        fix_suggestion: `Numéroter les ${promisedCount} éléments en H3 ou ajuster le titre`, location: 'global'
      });
    }
  }

  // ═══ FLASH VOYAGE MANDATORY ELEMENTS ═══
  const isEvergreen = (ctx.editorialMode || '').toLowerCase() !== 'news';

  // Check 1: Verdict décisionnel
  const hasVerdict = /verdict flash voyage|si tu es\s+\w+[^.]*→/gi.test(text);
  if (!hasVerdict) {
    issues.editorial.push({
      severity: 'critical',
      category: 'missing-verdict-fv',
      description: 'Verdict Flash Voyage absent — bloc "Si tu es [profil] → [action]" manquant',
      fix_suggestion: 'Ajouter H2 "Verdict Flash Voyage" avec 3-4 profils spécifiques',
      location: 'global'
    });
  }

  // Check 2: Checklist sauvegardable (evergreen only)
  if (isEvergreen) {
    const hasChecklist = /fv-checklist|checklist flash voyage/i.test(html) ||
      (/avant de partir/i.test(text) && /sur place/i.test(text) && /[àa] [ée]viter/i.test(text));
    if (!hasChecklist) {
      issues.editorial.push({
        severity: 'critical',
        category: 'missing-checklist-fv',
        description: 'Checklist Flash Voyage absente — structure Avant/Sur place/À éviter manquante',
        fix_suggestion: 'Ajouter div fv-checklist avec items spécifiques chiffrés',
        location: 'global'
      });
    }
  }

  // Check 3: FV persona tics (minimum 3)
  const fvTics = [
    /spoiler\s*:/i, /le calcul est simple/i, /et c.est l[àa] que [çc]a se corse/i,
    /sur \d+ t[ée]moignages/i, /traduction\s*:/i, /on a fait le calcul/i,
    /personne ne te le dira/i, /le vrai co[uû]t/i, /verdict terrain/i,
    /[àa] tester si|[àa] [ée]viter si/i
  ];
  const ticsFound = fvTics.filter(p => p.test(text)).length;
  if (ticsFound < 3) {
    issues.editorial.push({
      severity: 'major',
      category: 'low-persona-fv',
      description: `Seulement ${ticsFound}/3 tics de langage FV détectés`,
      fix_suggestion: 'Insérer naturellement: "Spoiler:", "Le calcul est simple", "Verdict terrain:", etc.',
      location: 'global'
    });
  }

  // Check 4: Pull-stats (minimum 1)
  const pullStatCount = (html.match(/fv-pull-stat/gi) || []).length;
  if (pullStatCount < 1) {
    issues.editorial.push({
      severity: 'major',
      category: 'missing-pull-stats',
      description: `${pullStatCount} pull-stat(s) — minimum 1 requis`,
      fix_suggestion: 'Ajouter div fv-pull-stat avec le chiffre le plus frappant de l\'article',
      location: 'global'
    });
  }

  // Check 5: Vocabulary repetition (SearchLLM "Redundant Repetition" signal)
  const overusedWords = { 'piège': 0, 'galère': 0, 'arnaque': 0, 'incontournable': 0, 'bon plan': 0 };
  for (const word of Object.keys(overusedWords)) {
    const re = new RegExp(`\\b${word}s?\\b`, 'gi');
    overusedWords[word] = (text.match(re) || []).length;
  }
  const overused = Object.entries(overusedWords).filter(([, count]) => count > 4);
  if (overused.length > 0) {
    issues.editorial.push({
      severity: 'major',
      category: 'vocabulary-repetition',
      description: `Mots surreprésentés : ${overused.map(([w, c]) => `"${w}" x${c}`).join(', ')} — pénalité SearchLLM "Redundant Repetition"`,
      fix_suggestion: 'Remplacer les occurrences au-delà de 3 par des synonymes (angle mort, écueil, complication...)',
      location: 'global'
    });
  }

  // Check 6: Claim diversity — no H2 should repeat the same topic
  const h2Topics = [];
  const sectionParts2 = html.split(/(?=<h2[\s>])/i).filter(p => /<h2/i.test(p));
  const topicKeywords = ['budget', 'transport', 'logement', 'visa', 'santé', 'sécurité', 'nourriture', 'culture', 'climat', 'coût', 'prix', 'arnaque', 'piège'];
  for (const part of sectionParts2) {
    const h2Match = part.match(/<h2[^>]*>(.*?)<\/h2>/i);
    if (!h2Match) continue;
    const title = h2Match[1].replace(/<[^>]+>/g, '').toLowerCase();
    const bodyText = part.replace(/<h2[^>]*>.*?<\/h2>/i, '').replace(/<[^>]*>/g, '').toLowerCase();
    const topics = topicKeywords.filter(kw => title.includes(kw) || (bodyText.match(new RegExp(`\\b${kw}`, 'g')) || []).length > 3);
    h2Topics.push({ title: h2Match[1].replace(/<[^>]+>/g, ''), topics });
  }
  // Find duplicate topics across H2s
  const topicSeen = {};
  for (const { title, topics } of h2Topics) {
    for (const t of topics) {
      if (topicSeen[t]) {
        issues.editorial.push({
          severity: 'minor',
          category: 'claim-diversity-low',
          description: `Thème "${t}" apparaît dans 2+ H2 : "${topicSeen[t]}" et "${title}" — manque de diversité`,
          fix_suggestion: 'Chaque H2 doit couvrir un angle différent. Fusionner ou recentrer.',
          location: title
        });
        break; // One warning per duplicate is enough
      }
      topicSeen[t] = title;
    }
  }

  // Check 7: Word count (conciseness signal)
  const totalWordsCheck = text.split(/\s+/).length;
  const maxWords = isEvergreen ? 2500 : 1000;
  if (totalWordsCheck > maxWords) {
    issues.editorial.push({
      severity: totalWordsCheck > maxWords * 1.3 ? 'major' : 'minor',
      category: 'word-count-excess',
      description: `${totalWordsCheck} mots — dépasse le maximum de ${maxWords}. Conciseness = signal SEO fort (SearchLLM).`,
      fix_suggestion: `Couper ${totalWordsCheck - maxWords} mots en supprimant les sections les moins denses en données`,
      location: 'global'
    });
  }

  return { issues, bonuses };
}


// ─── News Mode Calibration Helper ──────────────────────────
function getNewsCalibration(agentType) {
  const calibrations = {
    seo: `
MODE NEWS — CALIBRATION SPÉCIALE :
Cet article est un article NEWS (actualité voyage), pas un guide evergreen.
- La FAQ n'est PAS requise pour les articles news. Ne pénalise PAS son absence.
- Le nombre de mots attendu est 500-1000, pas 2000+. Un article news de 600+ mots est BON.
- 2-4 H2 suffisent (pas besoin de 5-10 comme pour un guide).
- 1+ lien interne suffit (pas 3+).
- Le maillage interne est moins critique pour les news.
- Score >= 88 pour un article news bien structuré avec bon title tag et H2 pertinents.`,

    affiliation: `
MODE NEWS — CALIBRATION SPÉCIALE :
Cet article est un article NEWS (actualité voyage), pas un guide evergreen.
- 0 widget affilié est ACCEPTABLE pour un article news. Ne pénalise PAS l'absence de widgets.
- 1 widget bien placé est un BONUS, pas une exigence.
- Les sections "Nos recommandations" ne sont pas attendues.
- 1 CTA suffit (pas 2+).
- L'objectif premier d'un article news est l'information, pas la monétisation.
- Score >= 88 pour un article news même sans widget affilié si le contenu est informatif.`,

    editorial: `
MODE NEWS — CALIBRATION SPÉCIALE :
Cet article est un article NEWS (actualité voyage), pas un guide evergreen.
- Le nombre de mots attendu est 500-1000, pas 2000+.
- Le style est plus direct et factuel — moins de narration immersive attendue.
- 1 citation guillemets français suffit.
- Les H2 décisionnels sont un bonus mais pas obligatoires.
- Le hook doit être accrocheur et informatif, pas nécessairement sensoriel/immersif.
- Score >= 85 pour un article news bien écrit et factuel.`,

    ux: `
MODE NEWS — CALIBRATION SPÉCIALE :
Cet article est un article NEWS (actualité voyage), pas un guide evergreen.
- La section "Quick Guide" n'est PAS attendue pour les news.
- Moins d'images sont nécessaires (1 image suffit).
- L'article est plus court donc moins de structures accordion attendues.
- Score >= 88 pour un article news avec HTML propre et sans bugs.`,

    integrity: `
MODE NEWS — CALIBRATION SPÉCIALE :
Cet article est un article NEWS (actualité voyage), pas un guide evergreen.
- Les faits doivent être particulièrement précis car c'est de l'actualité.
- Les dates et sources sont PLUS importantes que pour un evergreen.
- Score >= 88 pour un article news avec des faits vérifiables et cohérents.`
  };
  return calibrations[agentType] || '';
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

Score >= 85 = PASS, sinon FAIL.
CALIBRATION : un article publie par un site professionnel = minimum 78/100. Ne descends jamais en dessous de 78 sauf bugs critiques ou hallucinations factuelles.

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
      const newsCalib = (ctx.editorialMode || '').toLowerCase() === 'news' ? '\n\n' + getNewsCalibration('seo') : '';
      return `TITLE_TAG (SEO): ${titleTag}\nH1 (éditorial): ${h1Text}\nURL : ${ctx.url}\nMODE : ${ctx.editorialMode}\nFAQ STRUCTURE: details=${detailsCount}, summary=${summaryCount}, heading=${hasFaqHeading ? 'yes' : 'no'}, jsonld=${hasFaqJsonLd ? 'yes' : 'no'}${newsCalib}\n\nHTML DE L'ARTICLE :\n${truncate(ctx.html)}`;
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
CALIBRATION : un article publie par un site professionnel = minimum 78/100. Ne descends jamais en dessous de 78 sauf bugs critiques ou hallucinations factuelles.

BAREME DE SCORING DETAILLE :
95-100 : Modules affilies parfaitement integres, transitions naturelles.
85-94 : Bonne integration avec problemes mineurs.
75-84 : Presence affiliate fonctionnelle mais placement force.
60-74 : Widgets manquants ou contenu qui nuit.
<60 : Aucune integration.
NOTE NEWS : absence de widgets = pas de penalite (score min 80).

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
      const newsCalib = (ctx.editorialMode || '').toLowerCase() === 'news' ? '\n\n' + getNewsCalibration('affiliation') : '';
      return `TITRE : ${ctx.title}\nDESTINATION : ${ctx.destination || 'inconnue'}\nMODE : ${ctx.editorialMode || 'evergreen'}\nMODULES AFFILIÉS DÉTECTÉS (${modules.length}) :\n${JSON.stringify(moduleInfo, null, 2)}${newsCalib}\n\nHTML :\n${truncate(ctx.html)}`;
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
CALIBRATION : minimum 78/100 pour un article publie.

REFERENTIEL EDITORIAL :
95-100 : Voix distinctive, rythme maitrise, zero cliche, lecteur captive.
85-94 : Bonne personnalite, quelques cliches isoles, 1-2 sections plates.
75-84 : Article interchangeable, manque de voix propre.
65-74 : Sections creuses, filler evident, ton encyclopedique.
<65 : IA detectable, aucune personnalite.

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
      const newsCalib = (ctx.editorialMode || '').toLowerCase() === 'news' ? '\n\n' + getNewsCalibration('editorial') : '';
      return `TITRE : ${ctx.title}\nMODE : ${ctx.editorialMode || 'evergreen'}${newsCalib}\n\nTEXTE COMPLET :\n${truncate(text)}`;
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
CALIBRATION : minimum 78/100 pour un article publie.

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
      const newsCalib = (ctx.editorialMode || '').toLowerCase() === 'news' ? '\n\n' + getNewsCalibration('ux') : '';
      return `TITRE : ${ctx.title}\nDESTINATION ATTENDUE : ${ctx.destination || 'inconnue'}\nMODE : ${ctx.editorialMode || 'evergreen'}\n\nIMAGES (${images.length}) :\n${JSON.stringify(images, null, 2)}\n\nLIENS INTERNES (${links.length}) :\n${JSON.stringify(links, null, 2)}${newsCalib}\n\nHTML COMPLET :\n${truncate(ctx.html)}`;
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

Score >= 85 = PASS, sinon FAIL.
CALIBRATION : minimum 78/100 pour un article publie.

REFERENTIEL INTEGRITE :
95-100 : Prix/dates verifiables, sources citees, zero contradiction.
85-94 : Infos fiables, 1-2 approximations mineures.
75-84 : Incoherences de prix, non source mais plausible.
65-74 : Contradictions visibles, prix obsoletes.
<65 : Hallucinations factuelles, infos dangereuses.

CALIBRATION — Score = 85 - (critiques×15) - (majeurs×8) - (mineurs×3) + (forces×3). Minimum 50. Un article publié sans bug critique score toujours >= 80.`,
    buildUserPrompt(ctx) {
      const text = extractTextFromHtml(ctx.html);
      const newsCalib = (ctx.editorialMode || '').toLowerCase() === 'news' ? '\n\n' + getNewsCalibration('integrity') : '';
      return `TITRE : ${ctx.title}\nDATE PUBLICATION : ${ctx.date || 'inconnue'}\nDESTINATION : ${ctx.destination || 'inconnue'}\nMODE : ${ctx.editorialMode || 'evergreen'}${newsCalib}\n\nTEXTE COMPLET :\n${truncate(text)}`;
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
        result.satisfied = (criticals === 0 && majors === 0 && result.score >= 85);
        result.verdict = result.score >= 85 ? 'PASS' : 'FAIL';
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

  const isNewsMode = (ctx.editorialMode || '').toLowerCase() === 'news';
  const modeNote = isNewsMode
    ? `\nMODE : NEWS (actualité) — Seuils ajustés : score >= 82 + 0 critical = APPROVE. Les articles news sont plus courts (500-1000 mots), n'ont pas besoin de FAQ, et peuvent avoir 0 widget affilié.`
    : `\nMODE : EVERGREEN (guide)`;

  const userPrompt = `ARTICLE : "${ctx.title}"
URL : ${ctx.url || 'N/A'}
SCORE PONDÉRÉ : ${panelResult.weightedScore}/100
ISSUES CRITIQUES : ${panelResult.criticalCount}
TOUS AGENTS SATISFIED : ${allSatisfied ? 'OUI' : 'NON'}${modeNote}

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
