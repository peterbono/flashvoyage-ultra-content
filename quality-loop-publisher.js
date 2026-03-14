#!/usr/bin/env node

/**
 * quality-loop-publisher.js — Orchestrateur multi-agent de publication v2
 * 
 * Pipeline :
 *   1. Génération (PipelineRunner)
 *   2. Validation Gates (pre-publish-validator.js)
 *   3. Panel Multi-Agent (5 experts + CEO)
 *   4. Si REJECT → LLM Rewriter ciblé → retour étape 2
 *   5. Publication WordPress
 *   6. Vérification post-publication (optionnel)
 * 
 * Usage:
 *   node quality-loop-publisher.js                     # Pipeline complet
 *   node quality-loop-publisher.js --dry-run            # Sans publication WordPress
 *   node quality-loop-publisher.js --max-loops 3        # Max iterations review (hard cap, default 3)
 *   node quality-loop-publisher.js --mode news          # Force le mode éditorial
 *   node quality-loop-publisher.js --target-score 95    # Active les paliers qualité (88→92→95)
 *   node quality-loop-publisher.js --score-stages 90,93,95 # Paliers personnalisés
 *   node quality-loop-publisher.js --post-review        # Vérification post-publication
 *   node quality-loop-publisher.js --url <reddit-url>  # Force une URL Reddit spécifique
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import EnhancedUltraGenerator from './enhanced-ultra-generator.js';
import { runAllAgents, runCeoValidator } from './review-agents.js';
import { validatePrePublish } from './pre-publish-validator.js';
import { applyAllFixes } from './review-auto-fixers.js';
import { generateWithClaude } from './anthropic-client.js';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Configuration ───────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);
const parseOptionalScore = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, num));
};
const parseScoreStages = (value) => {
  if (!value || typeof value !== 'string') return [];
  const parsed = value
    .split(',')
    .map(v => parseOptionalScore(v.trim()))
    .filter(v => Number.isFinite(v));
  if (parsed.length === 0) return [];
  return parsed.sort((a, b) => a - b);
};
const severityWeight = (severity = '') => {
  const key = String(severity).toLowerCase();
  if (key === 'critical') return 3;
  if (key === 'major') return 2;
  if (key === 'minor') return 1;
  return 0;
};
const buildQualityBoostFixes = (reviewResult, targetScore) => {
  const issues = (reviewResult?.allIssues || [])
    .filter(i => i && i.description && i.severity)
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));

  const topIssues = issues.slice(0, 6);
  if (topIssues.length > 0) {
    return topIssues.map((issue, idx) => ({
      priority: idx + 1,
      agent: issue._label || issue._agent || 'Panel',
      issue: issue.description,
      action: `Corriger ce point pour viser >= ${targetScore}/100 sans changer la structure globale`
    }));
  }

  const lowAgents = Object.values(reviewResult?.agents || {})
    .filter(a => Number.isFinite(a?.score))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  return lowAgents.map((agent, idx) => ({
    priority: idx + 1,
    agent: agent?._label || 'Panel',
    issue: `Score ${agent?.score || 0}/100 inférieur à la cible`,
    action: `Renforcer précision factuelle, tonalité humaine et maillage interne pour atteindre >= ${targetScore}/100`
  }));
};

const issueFamily = (issue = {}) => {
  const gate = String(issue.gate || issue.category || '').toLowerCase();
  const text = String(issue.message || issue.description || '').toLowerCase();
  if (gate.includes('internal-links') || text.includes('lien')) return 'links';
  if (text.includes('faq') || text.includes('details') || text.includes('summary')) return 'faq';
  if (text.includes('h1') || text.includes('h2') || text.includes('h3') || text.includes('h4') || text.includes('hiérarchie')) return 'structure';
  if (gate.includes('fact') || text.includes('durée') || text.includes('distance') || text.includes('source') || text.includes('hallucination')) return 'integrity';
  if (text.includes('intention') || text.includes('title tag') || text.includes('densité') || text.includes('mot-clé')) return 'seo';
  return 'editorial';
};

const buildFamilyFixBundle = ({ reviewResult, stageTarget, recurringIssueHistory, maxItems = 6 }) => {
  const families = new Map();
  for (const issue of (reviewResult?.allIssues || [])) {
    const family = issueFamily(issue);
    const k = issueKey(issue);
    const recurring = recurringIssueHistory?.get(k) || 1;
    const severityBoost = severityWeight(issue.severity) * 10;
    const base = severityBoost + Math.min(6, recurring * 2);
    const current = families.get(family) || { score: 0, sample: issue };
    if (base > current.score) {
      families.set(family, { score: base, sample: issue });
    }
  }
  const templates = {
    links: `Renforcer le maillage interne: >=3 liens flashvoyage valides, ancres non tronquées et cohérentes avec le sujet`,
    faq: `Ajouter/fiabiliser une FAQ: section FAQ + balises details/summary fermées + JSON-LD FAQPage si possible`,
    structure: `Corriger la hiérarchie Hn: pas de saut H2->H4, ordre logique des sections, conclusion en fin`,
    integrity: `Renforcer la cohérence factuelle: chiffres plausibles, pas d'affirmation absolue, cohérence des durées et sources`,
    seo: `Optimiser les signaux SEO: title tag exploitable, intention unique, densité naturelle, pas de bourrage`,
    editorial: `Réécrire pour clarté éditoriale: formulations non mécaniques, fil narratif net, style humain`
  };
  return Array.from(families.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, maxItems)
    .map(([family, payload], idx) => ({
      priority: idx + 1,
      agent: payload.sample?._label || 'Panel',
      issue: payload.sample?.description || payload.sample?.message || `Famille ${family} à renforcer`,
      action: `${templates[family] || templates.editorial}. Objectif palier: >= ${stageTarget}/100`
    }));
};

const buildWpAuth = () => {
  const url = process.env.WORDPRESS_URL;
  const user = process.env.WORDPRESS_USERNAME;
  const pass = process.env.WORDPRESS_APP_PASSWORD;
  if (!url || !user || !pass) return null;
  return {
    url,
    auth: Buffer.from(`${user}:${pass}`).toString('base64')
  };
};

const normalizeTitleTag = (title = '', destination = '') => {
  const raw = String(title || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const clean = raw.replace(/^"+|"+$/g, '');
  const hasDest = destination && new RegExp(destination, 'i').test(clean);
  let out = clean;
  if (!hasDest && destination) {
    out = `${destination} : ${clean}`;
  }
  if (out.length <= 60) return out;
  return out.slice(0, 60).replace(/\s+\S*$/, '').trim();
};

const issueKey = (issue = {}) => `${issue.gate || issue.category || 'na'}|${String(issue.message || issue.description || '').toLowerCase().slice(0, 140)}`;
const countInternalFlashvoyageLinks = (html = '') => {
  const matches = String(html).match(/<a\b[^>]*href=["']https?:\/\/(?:www\.)?flashvoyage\.com[^"']*["'][^>]*>/gi);
  return matches ? matches.length : 0;
};
const hasBrokenPlaceholderTokens = (html = '') => /\b(?:2quelques|co[ûu]tentquelques|prixquelques|tempsquelques)\b/i.test(String(html));
const hasSourceUrl = (html = '', sourceUrl = '') => {
  if (!sourceUrl) return true;
  const esc = sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(esc, 'i').test(String(html));
};
const buildRewriteDiffViolations = (beforeHtml, afterHtml, { sourceUrl } = {}) => {
  const violations = [];
  const beforeLinks = countInternalFlashvoyageLinks(beforeHtml);
  const afterLinks = countInternalFlashvoyageLinks(afterHtml);
  if (afterLinks > 8 || afterLinks > beforeLinks + 3) {
    violations.push(`maillage_interne_excessif:${beforeLinks}->${afterLinks}`);
  }
  if (hasBrokenPlaceholderTokens(afterHtml)) {
    violations.push('placeholders_reintroduits');
  }
  if (sourceUrl && hasSourceUrl(beforeHtml, sourceUrl) && !hasSourceUrl(afterHtml, sourceUrl)) {
    violations.push('source_url_supprimee');
  }
  return violations;
};

const criticalIssueMap = (issues = []) => {
  const map = new Map();
  for (const issue of issues.filter(i => i?.severity === 'critical')) {
    const key = issueKey(issue);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
};

const countCritical = (map) => Array.from(map.values()).reduce((acc, value) => acc + value, 0);

const CONFIG = {
  maxLoops: parseInt(getArg('max-loops', '3'), 10),
  dryRun: hasFlag('dry-run') || process.env.FLASHVOYAGE_DRY_RUN === '1',
  forceMode: getArg('mode', null),
  verbose: hasFlag('verbose'),
  postReview: hasFlag('post-review'),
  targetScore: parseOptionalScore(getArg('target-score', '')),
  scoreStages: parseScoreStages(getArg('score-stages', '')),
  forceUrl: getArg('url', null),
};
if (CONFIG.targetScore !== null && CONFIG.scoreStages.length === 0) {
  const baseStages = [88, 92, CONFIG.targetScore];
  CONFIG.scoreStages = [...new Set(baseStages.map(s => Math.min(CONFIG.targetScore, s)).sort((a, b) => a - b))];
}
if (CONFIG.targetScore !== null && CONFIG.scoreStages.length > 0) {
  CONFIG.scoreStages = CONFIG.scoreStages.map(s => Math.min(s, CONFIG.targetScore));
  if (!CONFIG.scoreStages.includes(CONFIG.targetScore)) {
    CONFIG.scoreStages.push(CONFIG.targetScore);
  }
  CONFIG.scoreStages = [...new Set(CONFIG.scoreStages)].sort((a, b) => a - b);
}

// ─── Agent: Pipeline Generator ───────────────────────────
async function generateArticle(generator) {
  console.log('\n🤖 AGENT[Generator] — Lancement pipeline complet...\n');
  
  const result = await generator.generateAndPublishEnhancedArticle();

  if (!result) {
    console.error('❌ AGENT[Generator] — Pas de résultat');
    return null;
  }

  const content = result.content || null;
  if (!content) {
    console.error('❌ AGENT[Generator] — Pas de contenu dans le résultat');
    return null;
  }

  const title = typeof result.title === 'string' ? result.title : (result.title?.rendered || 'Article sans titre');
  console.log(`✅ AGENT[Generator] — Article généré: "${title}" (${content.length} chars)`);
  if (result._qualityGatePassed) console.log(`   🔓 Quality gate flag: PASSED`);
  
  const destinationHint = result?.pipelineContext?.final_destination || result?.final_destination || '';
  const titleTag = normalizeTitleTag(result.title_tag || title, destinationHint);

  return {
    title,
    title_tag: titleTag,
    content,
    editorialMode: result.editorialMode || result.editorial_mode || 'evergreen',
    featuredImage: result.featuredImage,
    categories: result.categories,
    tags: result.tags,
    slug: result.slug,
    wpPostId: result.wpPostId || result.id,
    pipelineContext: result.pipelineContext,
    report: result,
    _qualityGatePassed: result._qualityGatePassed || false
  };
}

// ─── Surgical Section-Level Rewrite ──────────────────────

/**
 * Split HTML article into sections by H2 tags.
 * Returns array of { title, html, prevTitle, nextTitle }
 * "intro" = content before first H2.
 */
function splitBySections(html) {
  const parts = html.split(/(?=<h2[\s>])/i);
  const sections = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.trim()) continue;

    const h2Match = part.match(/<h2[^>]*>(.*?)<\/h2>/i);
    let title;
    if (h2Match) {
      title = h2Match[1].replace(/<[^>]+>/g, '').trim();
    } else if (sections.length === 0) {
      title = 'intro';
    } else {
      title = `section-${i}`;
    }

    sections.push({ title, html: part, prevTitle: null, nextTitle: null });
  }

  for (let i = 0; i < sections.length; i++) {
    sections[i].prevTitle = i > 0 ? sections[i - 1].title : null;
    sections[i].nextTitle = i < sections.length - 1 ? sections[i + 1].title : null;
  }

  return sections;
}

/**
 * Group issues by their location field, matching to section titles.
 * Returns Map<sectionTitle, issues[]>
 */
function groupIssuesBySection(allIssues, sections) {
  const grouped = new Map();

  for (const issue of allIssues) {
    const loc = (issue.location || '').trim();
    if (!loc) continue;

    const locLower = loc.toLowerCase().replace(/^h2\s*:\s*/i, '').trim();

    let matchedTitle = null;

    // Exact match
    for (const section of sections) {
      if (section.title.toLowerCase() === locLower) {
        matchedTitle = section.title;
        break;
      }
    }

    // Substring match
    if (!matchedTitle) {
      for (const section of sections) {
        const sLower = section.title.toLowerCase();
        if (sLower.includes(locLower) || locLower.includes(sLower)) {
          matchedTitle = section.title;
          break;
        }
      }
    }

    // Handle intro/conclusion keywords
    if (!matchedTitle) {
      if (locLower === 'intro' || locLower === 'introduction') {
        matchedTitle = sections[0]?.title || null;
      } else if (locLower === 'conclusion') {
        matchedTitle = sections[sections.length - 1]?.title || null;
      }
    }

    if (matchedTitle) {
      if (!grouped.has(matchedTitle)) grouped.set(matchedTitle, []);
      grouped.get(matchedTitle).push(issue);
    }
  }

  return grouped;
}

/**
 * Rewrite a single section with focused issues.
 */
async function rewriteSection(sectionHtml, issues, title, prevTitle, nextTitle, ctx = {}) {
  const issuesList = issues
    .map((issue, i) => `${i + 1}. [${issue.severity}] ${issue.description}${issue.fix_suggestion ? ' \u2192 ' + issue.fix_suggestion : ''}`)
    .join('\n');

  const contextLine = [
    prevTitle ? `Section pr\u00e9c\u00e9dente : "${prevTitle}"` : null,
    nextTitle ? `Section suivante : "${nextTitle}"` : null,
  ].filter(Boolean).join(' | ');

  const systemPrompt = `Tu es un \u00e9diteur expert pour flashvoyage.com. Tu re\u00e7ois UNE SEULE SECTION d'un article et ses probl\u00e8mes sp\u00e9cifiques.

R\u00c8GLES ABSOLUES :
1. Corrige UNIQUEMENT les probl\u00e8mes list\u00e9s \u2014 ne modifie RIEN d'autre dans cette section
2. Conserve TOUTE la structure HTML (balises, classes, attributs)
3. Ne supprime AUCUN contenu qui n'est pas probl\u00e9matique
4. Ne rajoute PAS de contenu non demand\u00e9
5. Retourne L'INT\u00c9GRALIT\u00c9 du HTML de la section corrig\u00e9e
6. TOUT en fran\u00e7ais, tutoiement obligatoire
7. NE JAMAIS utiliser de formules IA : "arbitrer entre X et Y", "Ce que les autres guides ne disent pas", "Option 1/2/3"
8. Ne cr\u00e9e jamais de balises mal ferm\u00e9es
9. Garde la m\u00eame longueur approximative \u2014 pas d'inflation`;

  const userPrompt = `ARTICLE : "${title}"
${ctx.destination ? `DESTINATION : ${ctx.destination}` : ''}
${contextLine ? `CONTEXTE : ${contextLine}` : ''}

PROBL\u00c8MES \u00c0 CORRIGER DANS CETTE SECTION :
${issuesList}

SECTION HTML \u00c0 CORRIGER :
${sectionHtml}

Retourne la section HTML corrig\u00e9e (uniquement cette section, rien d'autre).`;

  try {
    const corrected = await generateWithClaude(systemPrompt, userPrompt, {
      maxTokens: 6000,
      trackingStep: 'quality-loop-section-rewriter'
    });

    if (corrected && corrected.trim().length > sectionHtml.length * 0.3) {
      return corrected.trim();
    }
    console.warn('      \u26a0\ufe0f Section rewriter returned content too short, keeping original');
    return sectionHtml;
  } catch (err) {
    console.error(`      \u274c Section rewrite failed: ${err.message}`);
    return sectionHtml;
  }
}

/**
 * Surgical rewrite: only rewrite sections that have issues.
 * Returns the full article HTML with only affected sections rewritten.
 * Returns null if surgical rewrite is not possible (issues lack location).
 */
async function rewriteSections(html, allIssues, title, ctx = {}) {
  const sections = splitBySections(html);
  if (sections.length === 0) return null;

  // Check if enough issues have location data
  const issuesWithLocation = allIssues.filter(i => i.location && i.location.trim());
  if (issuesWithLocation.length === 0) {
    console.log('      \u2139\ufe0f No issues with location data \u2014 falling back to full rewrite');
    return null;
  }

  const locatedRatio = issuesWithLocation.length / allIssues.length;
  if (locatedRatio < 0.5) {
    console.log(`      \u2139\ufe0f Only ${(locatedRatio * 100).toFixed(0)}% of issues have location \u2014 falling back to full rewrite`);
    return null;
  }

  const grouped = groupIssuesBySection(issuesWithLocation, sections);
  if (grouped.size === 0) {
    console.log('      \u2139\ufe0f Could not match issues to sections \u2014 falling back to full rewrite');
    return null;
  }

  const totalSections = sections.length;
  const affectedSections = grouped.size;
  console.log(`      \ud83d\udd2c Surgical rewrite: ${affectedSections}/${totalSections} sections affected`);

  for (const [sectionTitle, issues] of grouped.entries()) {
    const section = sections.find(s => s.title === sectionTitle);
    if (!section) continue;

    console.log(`      \u270f\ufe0f  Rewriting "${sectionTitle}" (${issues.length} issue(s))`);
    const rewritten = await rewriteSection(
      section.html,
      issues,
      title,
      section.prevTitle,
      section.nextTitle,
      ctx
    );
    section.html = rewritten;
  }

  return sections.map(s => s.html).join('\n');
}

// ─── Agent: LLM Rewriter ciblé (full article fallback) ──
async function rewriteWithFeedback(html, criticalFixes, title, ctx = {}) {
  const fixesList = criticalFixes
    .map((f, i) => `${i + 1}. [${f.agent}] ${f.issue}${f.action ? ' → ' + f.action : ''}`)
    .join('\n');

  const sourceLine = ctx.sourceUrl
    ? `SOURCE ORIGINE À PRÉSERVER (si absente de l'article, ajoute une référence discrète): ${ctx.sourceUrl}`
    : 'SOURCE ORIGINE: non fournie';
  const destinationLine = ctx.destination ? `DESTINATION CIBLE: ${ctx.destination}` : 'DESTINATION CIBLE: non fournie';
  const systemPrompt = `Tu es un éditeur expert pour flashvoyage.com. Tu reçois un article HTML et une liste de problèmes identifiés par un panel d'experts. 

RÈGLES ABSOLUES :
1. Corrige UNIQUEMENT les problèmes listés — ne modifie RIEN d'autre
2. Conserve TOUTE la structure HTML (balises, classes, attributs)
3. Ne supprime AUCUN contenu qui n'est pas problématique
4. Ne rajoute PAS de contenu non demandé
5. Retourne L'INTÉGRALITÉ du HTML corrigé, du premier au dernier caractère
6. TOUT en français, tutoiement obligatoire
7. NE JAMAIS utiliser de formules IA : "arbitrer entre X et Y sans sacrifier Z", "Ce que les autres guides ne disent pas", "Option 1/2/3"
8. Interdiction absolue d'ajouter <html>, <head>, <body>. Retourne uniquement le fragment article HTML
9. Ne crée jamais de balises <details>/<summary> mal fermées. Si tu modifies une FAQ, vérifie que chaque balise ouvrante est fermée
10. Ne crée pas de texte d'ancre tronqué. Chaque lien <a> doit avoir une ancre complète et naturelle
11. Limite le maillage interne à 3-8 liens flashvoyage cohérents, pas de section d'ancres massives
12. Si une source Reddit est fournie, conserve un lien explicite vers cette source et n'invente pas de citation sans source`;

  const userPrompt = `TITRE : ${title}
${destinationLine}
${sourceLine}

PROBLÈMES À CORRIGER :
${fixesList}

ARTICLE HTML COMPLET :
${html}

Retourne l'article HTML complet corrigé.`;

  try {
    const corrected = await generateWithClaude(systemPrompt, userPrompt, {
      maxTokens: 12000,
      trackingStep: 'quality-loop-rewriter'
    });

    if (corrected && corrected.length > html.length * 0.5) {
      return corrected.trim();
    }
    console.warn('⚠️ Rewriter a retourné un contenu trop court, conservation de l\'original');
    return html;
  } catch (err) {
    console.error(`❌ Rewriter échoué : ${err.message}`);
    return html;
  }
}

// ─── Agent: Publisher ────────────────────────────────────
async function publishArticle(article) {
  const wpUrl = process.env.WORDPRESS_URL;
  const wpUser = process.env.WORDPRESS_USERNAME;
  const wpPass = process.env.WORDPRESS_APP_PASSWORD;
  
  if (!wpUrl || !wpUser || !wpPass) {
    console.error('❌ AGENT[Publisher] — WordPress credentials manquantes');
    return null;
  }

  const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');

  let featuredMediaId = null;
  if (article.featuredImage?.url) {
    try {
      const imgResponse = await axios.get(article.featuredImage.url, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(imgResponse.data);
      const filename = `featured-${Date.now()}.jpg`;
      const uploadResponse = await axios.post(`${wpUrl}/wp-json/wp/v2/media`, buffer, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'image/jpeg',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
      featuredMediaId = uploadResponse.data.id;
      if (article.featuredImage.alt) {
        await axios.post(`${wpUrl}/wp-json/wp/v2/media/${featuredMediaId}`, {
          alt_text: article.featuredImage.alt
        }, { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' } });
      }
    } catch (err) {
      console.warn(`⚠️ Image upload failed: ${err.message}`);
    }
  }

  let categoryIds = [];
  if (article.categories?.length) {
    for (const cat of article.categories) {
      if (typeof cat === 'number') { categoryIds.push(cat); continue; }
      try {
        const res = await axios.get(`${wpUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(cat)}`, {
          headers: { Authorization: `Basic ${auth}` }
        });
        const found = res.data.find(c => c.name.toLowerCase() === cat.toLowerCase());
        if (found) categoryIds.push(found.id);
        else {
          const created = await axios.post(`${wpUrl}/wp-json/wp/v2/categories`, { name: cat }, {
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
          });
          categoryIds.push(created.data.id);
        }
      } catch { /* skip */ }
    }
  }

  let tagIds = [];
  if (article.tags?.length) {
    for (const tag of article.tags) {
      if (typeof tag === 'number') { tagIds.push(tag); continue; }
      try {
        const res = await axios.get(`${wpUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tag)}`, {
          headers: { Authorization: `Basic ${auth}` }
        });
        const found = res.data.find(t => t.name.toLowerCase() === tag.toLowerCase());
        if (found) tagIds.push(found.id);
        else {
          const created = await axios.post(`${wpUrl}/wp-json/wp/v2/tags`, { name: tag }, {
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
          });
          tagIds.push(created.data.id);
        }
      } catch { /* skip */ }
    }
  }

  // Last-pass: ensure wp-block-quote class on all blockquotes + merge short paragraphs
  let finalContent = article.content || '';
  finalContent = finalContent.replace(/<blockquote(?!\s+class)([^>]*)>/gi, '<blockquote class="wp-block-quote"$1>');
  
  // Merge consecutive short <p> tags (< 150 chars each) into grouped paragraphs
  // This fixes the "one sentence per paragraph" issue for better reading rhythm
  {
    const pRegex = /<p([^>]*)>(.*?)<\/p>/gs;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = pRegex.exec(finalContent)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'other', html: finalContent.slice(lastIndex, match.index) });
      }
      const attrs = match[1] || '';
      const text = match[2] || '';
      const isShort = text.replace(/<[^>]*>/g, '').trim().length < 150;
      const hasSpecialClass = /class=/.test(attrs);
      parts.push({ type: 'p', attrs, text, isShort: isShort && !hasSpecialClass, html: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < finalContent.length) {
      parts.push({ type: 'other', html: finalContent.slice(lastIndex) });
    }
    
    // Group consecutive short paragraphs (max 3 per group)
    let merged = '';
    let grouping = [];
    for (const part of parts) {
      if (part.type === 'p' && part.isShort) {
        grouping.push(part.text);
        if (grouping.length >= 3) {
          merged += '<p>' + grouping.join(' ') + '</p>\n';
          grouping = [];
        }
      } else {
        if (grouping.length > 1) {
          merged += '<p>' + grouping.join(' ') + '</p>\n';
        } else if (grouping.length === 1) {
          merged += '<p>' + grouping[0] + '</p>\n';
        }
        grouping = [];
        merged += part.html;
      }
    }
    if (grouping.length > 1) {
      merged += '<p>' + grouping.join(' ') + '</p>\n';
    } else if (grouping.length === 1) {
      merged += '<p>' + grouping[0] + '</p>\n';
    }
    finalContent = merged;
  }
  
  const postData = {
    title: article.title,
    content: finalContent,
    status: 'publish',
    ...(categoryIds.length && { categories: categoryIds }),
    ...(tagIds.length && { tags: tagIds }),
    ...(article.slug && { slug: article.slug }),
    ...(featuredMediaId && { featured_media: featuredMediaId })
  };

  const response = await axios.post(`${wpUrl}/wp-json/wp/v2/posts`, postData, {
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
  });

  return { link: response.data.link, id: response.data.id };
}

// ─── Orchestrateur principal ─────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   QUALITY LOOP PUBLISHER v2 — Multi-Agent + Validation Gates ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`   Max review loops: ${CONFIG.maxLoops}`);
  console.log(`   Dry run: ${CONFIG.dryRun}`);
  console.log(`   Force mode: ${CONFIG.forceMode || 'auto'}\n`);
  if (CONFIG.targetScore !== null) {
    console.log(`   Target score: ${CONFIG.targetScore}/100`);
    console.log(`   Score stages: ${CONFIG.scoreStages.join(' → ')}\n`);
    process.env.QUALITY_TARGET_SCORE = String(CONFIG.targetScore);
  }

  if (CONFIG.dryRun) {
    process.env.FLASHVOYAGE_DRY_RUN = '1';
  }
  if (CONFIG.forceMode === 'news' || CONFIG.forceMode === 'evergreen') {
    process.env.FORCE_EDITORIAL_MODE = CONFIG.forceMode;
    console.log(`   Editorial mode forcé: ${CONFIG.forceMode}`);
  }
  if (CONFIG.forceUrl) {
    process.env.FORCE_SOURCE_URL = CONFIG.forceUrl;
    console.log(`   Force URL: ${CONFIG.forceUrl}`);
  }
  process.env.ENABLE_MARKETING_PASS = '0';
  process.env.SKIP_WP_PUBLISH = '1';
  process.env.STRICT_INTERNAL_LINK_DEST_MATCH = '1';

  const generator = new EnhancedUltraGenerator();
  const startTime = Date.now();
  const wpAuth = buildWpAuth();
  const recurringFixHistory = new Map();
  const recurringIssueHistory = new Map();
  const iterationTelemetry = [];

  // ─── Best version tracker (regression guard) ───────────
  let bestScore = 0;
  let bestHtml = null;
  let bestIteration = 0;
  let previousScore = null;

  // ══════════════════════════════════════════════════════════
  //  Phase 1: Génération initiale (avec retry)
  // ══════════════════════════════════════════════════════════
  console.log('\n━━━ PHASE 1 : Génération ━━━');
  let article = null;
  const MAX_GEN_RETRIES = 3;
  for (let genAttempt = 1; genAttempt <= MAX_GEN_RETRIES; genAttempt++) {
    try {
      article = await generateArticle(generator);
      if (article && article.content && article.content.length > 2000) {
        break;
      }
      console.warn(`⚠️ Génération trop courte (${article?.content?.length || 0} chars), retry ${genAttempt}/${MAX_GEN_RETRIES}...`);
      article = null;
    } catch (err) {
      console.warn(`⚠️ Génération échouée (tentative ${genAttempt}/${MAX_GEN_RETRIES}): ${err.message}`);
      if (genAttempt >= MAX_GEN_RETRIES) break;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  if (!article) {
    console.error('\n❌ Génération échouée après 3 tentatives. Arrêt.');
    process.exit(1);
  }

  writeFileSync('/tmp/last-generated-article.html', article.content);
  const destination = article.report?.pipelineContext?.final_destination || null;

  let iteration = 0;
  let approved = false;
  let lastReviewResult = null;

  while (iteration < CONFIG.maxLoops && !approved) {
    iteration++;
    const stageTarget = CONFIG.targetScore !== null
      ? CONFIG.scoreStages[Math.min(iteration - 1, CONFIG.scoreStages.length - 1)]
      : null;
    const prev1 = iterationTelemetry[iterationTelemetry.length - 1]?.panel?.weightedScore ?? null;
    const prev2 = iterationTelemetry[iterationTelemetry.length - 2]?.panel?.weightedScore ?? null;
    const scoreStagnating = prev1 !== null && prev2 !== null && Math.abs(prev1 - prev2) < 1;
    const iterationTrace = {
      iteration,
      stageTarget,
      validation: { criticalByGate: {} },
      panel: { weightedScore: null, criticalIssues: 0 },
      rewrite: { requestedFixes: 0, rollback: false, rollbackReason: null }
    };
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`  REVIEW ITERATION ${iteration}/${CONFIG.maxLoops}`);
    if (stageTarget !== null) {
      console.log(`  🎯 Palier qualité courant: ${stageTarget}/100`);
    }
    console.log(`${'━'.repeat(60)}`);

    // ══════════════════════════════════════════════════════════
    //  Phase 2: Validation Gates
    // ══════════════════════════════════════════════════════════
    console.log('\n━━━ PHASE 2 : Validation Gates ━━━');
    const validation = await validatePrePublish(article.content, {
      destination,
      title: article.title
    });

    if (validation.totalFixes > 0) {
      article = { ...article, content: validation.fixedHtml };
      writeFileSync('/tmp/last-generated-article.html', article.content);
    }

    if (validation.criticalCount > 0) {
      console.log(`   ⚠️ ${validation.criticalCount} issue(s) critique(s) détectée(s) par les gates`);
      validation.issues
        .filter(i => i.severity === 'critical')
        .forEach(i => console.log(`      • [${i.gate}] ${i.message}`));
    }
    for (const issue of validation.issues.filter(i => i.severity === 'critical')) {
      const gate = issue.gate || 'unknown';
      iterationTrace.validation.criticalByGate[gate] = (iterationTrace.validation.criticalByGate[gate] || 0) + 1;
    }

    // Phase 2b: Auto-fixers programmatiques
    console.log('\n━━━ PHASE 2b : Auto-fixers ━━━');
    try {
      const { html: autoFixed, totalFixed } = await applyAllFixes(article.content, article.title, [], wpAuth, {
        destination,
        sourceUrl: article.report?.pipelineContext?.source_truth?.source_url
          || article.report?.pipelineContext?.source_url
          || null
      });
      if (autoFixed !== article.content) {
        article = { ...article, content: autoFixed };
        writeFileSync('/tmp/last-generated-article.html', article.content);
        console.log(`   ✅ ${totalFixed} auto-fix(es) appliqué(s)`);
      }
    } catch (e) {
      console.warn(`   ⚠️ Auto-fixers échoués : ${e.message}`);
    }

    // ══════════════════════════════════════════════════════════
    //  Phase 3: Panel Multi-Agent (5 experts + CEO)
    // ══════════════════════════════════════════════════════════
    console.log('\n━━━ PHASE 3 : Panel Multi-Agent ━━━');

    const ctx = {
      html: article.content,
      title: article.title,
      titleTag: article.title_tag || article.title,
      url: article.slug ? `https://flashvoyage.com/${article.slug}/` : 'https://flashvoyage.com/',
      editorialMode: article.editorialMode,
      destination,
      sourceUrl: article.report?.pipelineContext?.source_truth?.source_url
        || article.report?.pipelineContext?.source_url
        || null,
      date: new Date().toISOString().split('T')[0]
    };

    const reviewResult = await runAllAgents(ctx);
    lastReviewResult = reviewResult;

    const criticalIssues = reviewResult.allIssues.filter(i => i.severity === 'critical');
    iterationTrace.panel.weightedScore = Number(reviewResult.weightedScore.toFixed(1));
    iterationTrace.panel.criticalIssues = criticalIssues.length;
    for (const issue of reviewResult.allIssues) {
      const key = issueKey(issue);
      recurringIssueHistory.set(key, (recurringIssueHistory.get(key) || 0) + 1);
    }

    console.log(`\n   📊 Score pondéré : ${reviewResult.weightedScore.toFixed(1)}/100 | Issues critiques : ${criticalIssues.length}`);

    // ─── Best version tracking ───────────────────────────
    const currentScore = reviewResult.weightedScore;
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestHtml = article.content;
      bestIteration = iteration;
    }

    // ─── Smart early exit: regression detection ──────────
    if (previousScore !== null && currentScore < bestScore - 3) {
      console.log(`\n   ⚠️ Quality loop: early exit at iteration ${iteration} (regression: current=${currentScore.toFixed(1)}, best=${bestScore.toFixed(1)} at iter=${bestIteration}). Rolling back.`);
      article = { ...article, content: bestHtml };
      writeFileSync('/tmp/last-generated-article.html', article.content);
      iterationTelemetry.push(iterationTrace);
      break;
    }

    // ─── Smart early exit: stagnation detection ──────────
    if (previousScore !== null && Math.abs(currentScore - previousScore) < 2) {
      console.log(`\n   ⚠️ Quality loop: early exit at iteration ${iteration} (stagnation: delta=${Math.abs(currentScore - previousScore).toFixed(1)})`);
      iterationTelemetry.push(iterationTrace);
      break;
    }

    previousScore = currentScore;

    const ceoResult = await runCeoValidator(reviewResult, ctx);

    const reachedStageTarget = stageTarget === null || reviewResult.weightedScore >= stageTarget;
    if (ceoResult.decision === 'APPROVE' && reachedStageTarget) {
      console.log(`\n   ✅ CEO APPROVE — Score ${reviewResult.weightedScore.toFixed(1)}/100`);
      approved = true;
      iterationTelemetry.push(iterationTrace);
      break;
    }
    if (ceoResult.decision === 'APPROVE' && !reachedStageTarget) {
      console.log(`\n   ⚠️ CEO APPROVE mais score ${reviewResult.weightedScore.toFixed(1)} < palier ${stageTarget}. Poursuite des améliorations.`);
    }

    if (ceoResult.decision !== 'APPROVE') {
      console.log(`\n   🚫 CEO REJECT — ${ceoResult.reasoning?.substring(0, 150) || 'Qualité insuffisante'}`);
    }

    if (iteration >= CONFIG.maxLoops) {
      console.log(`\n   ⚠️ MAX ITERATIONS ATTEINT (${CONFIG.maxLoops})`);
      iterationTelemetry.push(iterationTrace);
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  Phase 3b: LLM Rewriter ciblé
    // ══════════════════════════════════════════════════════════
    const preRewriteHtml = article.content;
    const preRewriteCriticalMap = criticalIssueMap(validation.issues || []);
    let fixes = ceoResult.critical_fixes || [];
    if (fixes.length === 0 && stageTarget !== null && reviewResult.weightedScore < stageTarget) {
      fixes = buildQualityBoostFixes(reviewResult, stageTarget);
    }
    if (stageTarget !== null && reviewResult.weightedScore < stageTarget && scoreStagnating) {
      const bundle = buildFamilyFixBundle({
        reviewResult,
        stageTarget,
        recurringIssueHistory
      });
      if (bundle.length > 0) {
        console.log(`   📦 STAGNATION_FIX_BUNDLE: ${bundle.length} famille(s) priorisée(s)`);
        fixes = [...fixes, ...bundle];
      }
    }
    const dedupedFixes = fixes.filter((fix) => {
      const key = `${(fix.agent || 'agent').toLowerCase()}|${String(fix.issue || '').toLowerCase().slice(0, 180)}`;
      const nextCount = (recurringFixHistory.get(key) || 0) + 1;
      recurringFixHistory.set(key, nextCount);
      return nextCount <= 2;
    });
    if (dedupedFixes.length !== fixes.length) {
      console.log(`   ℹ️ Fixes répétitifs ignorés: ${fixes.length - dedupedFixes.length}`);
    }
    fixes = dedupedFixes;
    iterationTrace.rewrite.requestedFixes = fixes.length;

    if (fixes.length > 0) {
      console.log(`\n   🔧 LLM Rewriter — ${fixes.length} correction(s) ciblée(s)`);
      fixes.forEach((f, i) => console.log(`      ${f.priority || i + 1}. [${f.agent}] ${f.issue?.substring(0, 100)}`));

      // Collect all panel issues for surgical rewrite (they have location data)
      const allPanelIssues = reviewResult.allIssues || [];

      // Try surgical section-level rewrite first
      let rewritten = await rewriteSections(article.content, allPanelIssues, article.title, ctx);

      // Fallback to full article rewrite if surgical rewrite was not possible
      if (rewritten === null) {
        console.log(`      \u21a9\ufe0f Falling back to full-article rewrite`);
        rewritten = await rewriteWithFeedback(article.content, fixes, article.title, ctx);
      }

      if (rewritten !== article.content) {
        article = { ...article, content: rewritten };
        writeFileSync('/tmp/last-generated-article.html', article.content);
        console.log(`   ✅ Article réécrit (${rewritten.length} chars)`);
      }

      // Passe déterministe post-réécriture pour réduire les régressions affiliation/intégrité.
      try {
        const { html: stabilizedHtml, totalFixed } = await applyAllFixes(
          article.content,
          article.title,
          [],
          wpAuth,
          {
            destination,
            sourceUrl: ctx.sourceUrl
          }
        );
        if (stabilizedHtml !== article.content) {
          article = { ...article, content: stabilizedHtml };
          writeFileSync('/tmp/last-generated-article.html', article.content);
          console.log(`   ✅ Stabilisation post-rewrite (${totalFixed} fix)`);
        }
      } catch (e) {
        console.warn(`   ⚠️ Stabilisation post-rewrite échouée: ${e.message}`);
      }

      const rewriteViolations = buildRewriteDiffViolations(preRewriteHtml, article.content, {
        sourceUrl: ctx.sourceUrl || ''
      });
      if (rewriteViolations.length > 0) {
        console.log(`   ↩️ REWRITE_DIFF_GUARD: rollback (${rewriteViolations.join(', ')})`);
        article = { ...article, content: preRewriteHtml };
        iterationTrace.rewrite.rollback = true;
        iterationTrace.rewrite.rollbackReason = `rewrite_diff_guard:${rewriteViolations.join('|')}`;
      }
    }

    const autoFixIssues = reviewResult.allIssues
      .filter(i => i.fix_type === 'auto' && i.severity === 'critical');
    if (autoFixIssues.length > 0) {
      try {
        const { html: fixedHtml } = await applyAllFixes(article.content, article.title, autoFixIssues, wpAuth, {
          destination,
          sourceUrl: ctx.sourceUrl || null
        });
        if (fixedHtml !== article.content) {
          article = { ...article, content: fixedHtml };
          console.log(`   ✅ Auto-fixes appliqués`);
        }
      } catch (e) {
        console.warn(`   ⚠️ Auto-fixes échoués : ${e.message}`);
      }
    }

    // Guard anti-régression: rollback si les critiques gates augmentent après réécriture.
    if (fixes.length > 0 || autoFixIssues.length > 0) {
      try {
        const probe = await validatePrePublish(article.content, {
          destination,
          title: article.title
        });
        const probeCriticalMap = criticalIssueMap(probe.issues || []);
        const beforeTotal = countCritical(preRewriteCriticalMap);
        const afterTotal = countCritical(probeCriticalMap);
        let recurrentWorsened = false;
        for (const [key, value] of probeCriticalMap.entries()) {
          if (value > (preRewriteCriticalMap.get(key) || 0)) {
            recurrentWorsened = true;
            break;
          }
        }
        if (afterTotal > beforeTotal || recurrentWorsened) {
          console.log(`   ↩️ REGRESSION_GUARD: rollback (${beforeTotal}→${afterTotal} critical gates)`);
          article = { ...article, content: preRewriteHtml };
          iterationTrace.rewrite.rollback = true;
          iterationTrace.rewrite.rollbackReason = `critical_gates_${beforeTotal}_to_${afterTotal}`;
        }
      } catch (e) {
        console.warn(`   ⚠️ Regression guard non exécutable: ${e.message}`);
        iterationTrace.rewrite.rollbackReason = `probe_error:${e.message}`;
      }
    }
    iterationTelemetry.push(iterationTrace);
  }

  // ══════════════════════════════════════════════════════════
  //  Phase 4: Publication
  // ══════════════════════════════════════════════════════════
  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RÉSULTAT FINAL`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Titre: ${article.title}`);
  console.log(`   Score pondéré: ${lastReviewResult?.weightedScore?.toFixed(1) || '?'}/100`);
  // OVERRIDE: Si le pre-pub quality gate >= 95%, publier malgre CEO REJECT
  if (!approved && article._qualityGatePassed) {
    console.log("\n   PRE-PUB OVERRIDE: Quality gate passed — publication autorisee");
    approved = true;
  }

  console.log(`   Décision: ${approved ? 'APPROVED' : 'REJECTED'}`);
  console.log(`   Mode: ${article.editorialMode}`);
  console.log(`   Iterations: ${iteration}`);
  console.log(`   Durée: ${totalDuration} min`);

  if (lastReviewResult) {
    console.log(`\n   Scores par agent :`);
    for (const [id, result] of Object.entries(lastReviewResult.agents)) {
      const icon = result.verdict === 'PASS' ? '✅' : '❌';
      console.log(`     ${icon} ${result._label}: ${result.score}/100 (${(result.issues || []).length} issues)`);
    }
  }

  if (CONFIG.dryRun) {
    console.log(`\n🧪 DRY RUN — Pas de publication WordPress`);
    console.log(`   HTML sauvegardé: /tmp/last-generated-article.html`);
  } else if (approved) {
    console.log('\n📤 Publication WordPress...');
    try {
      const pubResult = await publishArticle(article);
      if (pubResult?.link) {
        console.log(`\n🔗 ARTICLE PUBLIÉ: ${pubResult.link}`);
        article.wpPostId = pubResult.id;
      }
    } catch (err) {
      const detail = err.response?.data?.message || err.response?.data?.code || '';
      console.error(`❌ Publication échouée: ${err.message} ${detail}`);
    }
  } else {
    console.log(`\n⚠️ Non approuvé par le panel — publication annulée`);
  }

  const reportPath = join(__dirname, 'pipeline-report-output.json');
  const recurringIssuesTop = Array.from(recurringIssueHistory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({ issueKey: key, count }));
  const lastIteration = iterationTelemetry[iterationTelemetry.length - 1] || null;
  writeFileSync(reportPath, JSON.stringify({
    title: article.title,
    weightedScore: lastReviewResult?.weightedScore,
    approved,
    iterations: iteration,
    duration: totalDuration,
    editorialMode: article.editorialMode,
    targetScore: CONFIG.targetScore,
    scoreStages: CONFIG.scoreStages,
    agentScores: lastReviewResult ? Object.fromEntries(
      Object.entries(lastReviewResult.agents).map(([id, r]) => [id, { score: r.score, verdict: r.verdict }])
    ) : null,
    dryRun: CONFIG.dryRun,
    criticalByGate: lastIteration?.validation?.criticalByGate || {},
    iterationTelemetry,
    topRecurringIssues: recurringIssuesTop,
    timestamp: new Date().toISOString()
  }, null, 2));

  if (CONFIG.postReview && !CONFIG.dryRun && article.wpPostId) {
    console.log('\n━━━ POST-REVIEW : Vérification post-publication ━━━');
    try {
      const { execSync } = await import('child_process');
      const reviewCmd = `node ${join(__dirname, 'post-publish-review-loop.js')} --post-id ${article.wpPostId} --max-loops 3`;
      console.log(`  → ${reviewCmd}\n`);
      execSync(reviewCmd, { stdio: 'inherit', timeout: 600000 });
    } catch (err) {
      console.error(`⚠️ Post-review terminé avec erreurs : ${err.message}`);
    }
  }

  console.log(`\n${'═'.repeat(60)}\n`);
  process.exit(approved ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});
