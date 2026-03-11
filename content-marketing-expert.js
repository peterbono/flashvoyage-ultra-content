#!/usr/bin/env node

/**
 * ContentMarketingExpert — Agent d'audit expert content marketing & affiliation
 * 
 * Analyse un article HTML publié et produit un score + recommandations actionnables
 * pour atteindre 100% de qualité éditoriale et d'optimisation affiliation.
 * 
 * Utilisé par quality-loop-publisher.js dans le cycle multi-agent.
 */

import { parse } from 'node-html-parser';
import QualityAnalyzer from './quality-analyzer.js';

class ContentMarketingExpert {
  constructor() {
    this.qualityAnalyzer = new QualityAnalyzer();
    
    this.pillarKeywords = /guide|destination|conseils|budget|itineraire|visa/i;
    
    this.affiliateModuleTypes = ['flights', 'insurance', 'tours', 'esim'];
  }

  /**
   * Audit complet : qualité éditoriale + content marketing + affiliation
   * @param {string} html - HTML de l'article (sans <h1>)
   * @param {Object} meta - { title, editorialMode, angle, destination }
   * @returns {Object} { score, passed, categories, recommendations, fixes }
   */
  audit(html, meta = {}) {
    const title = meta.title || '';
    const editorialMode = meta.editorialMode || 'evergreen';
    const wrappedHtml = title ? `<h1>${title}</h1>\n${html}` : html;
    const root = parse(wrappedHtml);
    const text = root.text;
    const textLower = text.toLowerCase();

    // 1. Score qualité éditoriale (quality-analyzer)
    const qaScore = this.qualityAnalyzer.getGlobalScore(wrappedHtml, editorialMode, meta.angle || null);

    // 2. Audit content marketing affiliation
    const cmAudit = this._auditContentMarketing(root, html, text, textLower, meta);

    // 3. Audit structure & UX
    const uxAudit = this._auditUX(root, html, text, meta);

    // 4. Combiner les scores
    const cmScore = cmAudit.score;
    const uxScore = uxAudit.score;
    
    // Score combiné : qualité 60%, content marketing 25%, UX 15%
    const combinedScore = parseFloat(qaScore.globalScore) * 0.6 + cmScore * 0.25 + uxScore * 0.15;
    const passed = combinedScore >= 95 && qaScore.blockingPassed && cmAudit.criticalPassed;

    // 5. Générer les recommandations triées par impact
    const allRecos = [
      ...cmAudit.recommendations,
      ...uxAudit.recommendations,
      ...this._qaToRecommendations(qaScore)
    ].sort((a, b) => b.impact - a.impact);

    // 6. Générer les auto-fixes applicables
    const fixes = this._generateFixes(qaScore, cmAudit, uxAudit, root, html, meta);

    return {
      score: Math.round(combinedScore * 10) / 10,
      passed,
      breakdown: {
        editorial: { score: parseFloat(qaScore.globalScore), weight: 0.6, details: qaScore },
        contentMarketing: { score: cmScore, weight: 0.25, details: cmAudit },
        ux: { score: uxScore, weight: 0.15, details: uxAudit }
      },
      recommendations: allRecos,
      fixes,
      summary: passed
        ? `PASS (${combinedScore.toFixed(1)}%) — Article prêt pour publication`
        : `FAIL (${combinedScore.toFixed(1)}%) — ${allRecos.length} recommandation(s), ${fixes.length} fix(es) auto`
    };
  }

  _auditContentMarketing(root, html, text, textLower, meta) {
    const checks = [];
    let score = 100;
    const recommendations = [];
    let criticalPassed = true;

    // CM1: Modules affiliation présents et pertinents
    const modulesAside = root.querySelectorAll('aside.affiliate-module');
    const modulesDiv = root.querySelectorAll('div[data-fv-segment="affiliate"]');
    const modules = [...modulesAside, ...modulesDiv];
    const moduleTypes = modules.map(m => m.getAttribute('data-placement-id') || m.getAttribute('data-fv-segment') || 'affiliate');
    
    if (modules.length === 0) {
      score -= 25;
      criticalPassed = false;
      checks.push({ name: 'affiliate_modules', status: 'FAIL', detail: '0 modules' });
      recommendations.push({ type: 'affiliate', message: 'Aucun module d\'affiliation présent', impact: 25, fix: 'pipeline' });
    } else if (modules.length < 2) {
      score -= 10;
      checks.push({ name: 'affiliate_modules', status: 'PARTIAL', detail: `${modules.length} module(s)` });
      recommendations.push({ type: 'affiliate', message: `Seulement ${modules.length} module(s) — 2-3 recommandés`, impact: 10, fix: 'pipeline' });
    } else {
      checks.push({ name: 'affiliate_modules', status: 'OK', detail: `${modules.length} modules: ${moduleTypes.join(', ')}` });
    }

    // CM2: Tableau comparatif pour articles "vs"
    const titleLower = (meta.title || '').toLowerCase();
    const isComparison = /\bvs\b|compar|arbitrer\s+entre|face\s+[àa]|plutôt\s+que/i.test(titleLower);
    const hasTable = /<table/i.test(html);
    
    if (isComparison && !hasTable) {
      score -= 15;
      checks.push({ name: 'comparison_table', status: 'FAIL', detail: 'Article comparatif sans tableau' });
      recommendations.push({ type: 'content', message: 'Article de comparaison sans tableau comparatif HTML', impact: 15, fix: 'post-process' });
    } else if (hasTable) {
      checks.push({ name: 'comparison_table', status: 'OK', detail: 'Tableau présent' });
    } else {
      checks.push({ name: 'comparison_table', status: 'N/A', detail: 'Pas un article comparatif' });
    }

    // CM3: CTA implicites (verbes d'action dans le texte)
    const ctaCount = (textLower.match(/réserv|compare|découvr|explor|planifi|organis|souscrire|voir les prix|obtenir/g) || []).length;
    if (ctaCount < 5) {
      score -= 10;
      checks.push({ name: 'cta_density', status: 'LOW', detail: `${ctaCount} CTA implicites` });
      recommendations.push({ type: 'content', message: `Densité CTA faible (${ctaCount}). Ajouter verbes d'action: réserver, comparer, découvrir`, impact: 10, fix: 'prompt' });
    } else {
      checks.push({ name: 'cta_density', status: 'OK', detail: `${ctaCount} CTA implicites` });
    }

    // CM4: Données chiffrées concrètes
    const dataPoints = (text.match(/\d+\s*(€|euro|usd|\$|%|jour|mois|baht|nuit|km|heure|min)/gi) || []).length;
    if (dataPoints < 10) {
      score -= 10;
      checks.push({ name: 'data_density', status: 'LOW', detail: `${dataPoints} données chiffrées` });
      recommendations.push({ type: 'content', message: `Peu de données chiffrées (${dataPoints}). Minimum 10 pour crédibilité.`, impact: 10, fix: 'prompt' });
    } else {
      checks.push({ name: 'data_density', status: 'OK', detail: `${dataPoints} données chiffrées` });
    }

    // CM5: Liens internes dont au moins 1 pilier
    const internalLinks = root.querySelectorAll('a').filter(a => 
      (a.getAttribute('href') || '').includes('flashvoyage')
    );
    const hasPillarLink = internalLinks.some(l => 
      this.pillarKeywords.test(l.getAttribute('href') || '')
    );
    
    if (internalLinks.length < 3) {
      score -= 10;
      checks.push({ name: 'internal_links', status: 'LOW', detail: `${internalLinks.length} liens` });
      recommendations.push({ type: 'seo', message: `Seulement ${internalLinks.length} liens internes (min 3)`, impact: 10, fix: 'pipeline' });
    } else if (!hasPillarLink) {
      score -= 5;
      checks.push({ name: 'internal_links', status: 'PARTIAL', detail: `${internalLinks.length} liens, aucun pilier` });
      recommendations.push({ type: 'seo', message: 'Aucun lien vers une page pilier (guide/budget/visa)', impact: 5, fix: 'pipeline' });
    } else {
      checks.push({ name: 'internal_links', status: 'OK', detail: `${internalLinks.length} liens, pilier OK` });
    }

    // CM6: E-E-A-T (citations, blockquotes, sources)
    const citations = (text.match(/\u00ab[\s\u00a0]*[^\u00bb]{5,200}[\s\u00a0]*\u00bb/g) || []).length;
    const blockquotes = root.querySelectorAll('blockquote').length;
    const hasReddit = /reddit|r\/\w+/i.test(text);
    
    if (citations < 2 && blockquotes === 0) {
      score -= 10;
      checks.push({ name: 'eeat', status: 'FAIL', detail: `${citations} citations, ${blockquotes} blockquotes` });
      recommendations.push({ type: 'content', message: 'E-E-A-T insuffisant : ajouter citations et blockquotes sourcés', impact: 10, fix: 'prompt' });
    } else {
      checks.push({ name: 'eeat', status: 'OK', detail: `${citations} citations, ${blockquotes} bq, reddit=${hasReddit}` });
    }

    // CM7: Placement modules dans le funnel (pas tous au début ou tous à la fin)
    if (modules.length >= 2) {
      const positions = modules.map(m => {
        const idx = html.indexOf(m.outerHTML);
        return idx / html.length;
      });
      const allInFirstHalf = positions.every(p => p < 0.5);
      const allInSecondHalf = positions.every(p => p > 0.5);
      
      if (allInFirstHalf || allInSecondHalf) {
        score -= 5;
        checks.push({ name: 'module_placement', status: 'CLUSTERED', detail: allInFirstHalf ? 'Tous dans la 1ère moitié' : 'Tous dans la 2nde moitié' });
        recommendations.push({ type: 'affiliate', message: 'Modules affiliation regroupés — les répartir dans l\'article', impact: 5, fix: 'pipeline' });
      } else {
        checks.push({ name: 'module_placement', status: 'OK', detail: 'Bien répartis' });
      }
    }

    return { score: Math.max(0, score), checks, recommendations, criticalPassed };
  }

  _auditUX(root, html, text, meta) {
    const checks = [];
    let score = 100;
    const recommendations = [];

    // UX1: Images (minimum 2 pour news, 3 pour evergreen)
    const images = root.querySelectorAll('img');
    const minImages = meta.editorialMode === 'news' ? 2 : 3;
    
    if (images.length < minImages) {
      score -= 15;
      checks.push({ name: 'images', status: 'LOW', detail: `${images.length}/${minImages} minimum` });
      recommendations.push({ type: 'ux', message: `Seulement ${images.length} images (min ${minImages})`, impact: 15, fix: 'pipeline' });
    } else {
      checks.push({ name: 'images', status: 'OK', detail: `${images.length} images` });
    }

    // UX2: Alt text sur les images
    const imagesWithoutAlt = images.filter(img => !(img.getAttribute('alt') || '').trim());
    if (imagesWithoutAlt.length > 0) {
      score -= 10;
      checks.push({ name: 'alt_text', status: 'FAIL', detail: `${imagesWithoutAlt.length} sans alt` });
      recommendations.push({ type: 'seo', message: `${imagesWithoutAlt.length} image(s) sans texte alt`, impact: 10, fix: 'post-process' });
    } else {
      checks.push({ name: 'alt_text', status: 'OK', detail: 'Toutes les images ont un alt' });
    }

    // UX3: FAQ présente (evergreen)
    if (meta.editorialMode === 'evergreen') {
      const hasFAQ = /<h2[^>]*>(?:FAQ|Questions?\s+fréquentes?|Foire\s+aux\s+questions)/i.test(html);
      const faqItems = (html.match(/<details|<summary/gi) || []).length / 2;
      
      if (!hasFAQ) {
        score -= 10;
        checks.push({ name: 'faq', status: 'MISSING', detail: 'Pas de FAQ' });
        recommendations.push({ type: 'seo', message: 'Section FAQ absente — obligatoire pour evergreen', impact: 10, fix: 'pipeline' });
      } else if (faqItems < 3) {
        score -= 5;
        checks.push({ name: 'faq', status: 'THIN', detail: `${Math.floor(faqItems)} question(s)` });
        recommendations.push({ type: 'seo', message: `FAQ trop courte (${Math.floor(faqItems)} questions, min 3)`, impact: 5, fix: 'pipeline' });
      } else {
        checks.push({ name: 'faq', status: 'OK', detail: `${Math.floor(faqItems)} questions` });
      }
    }

    // UX4: Longueur (evergreen >= 1500 mots, news >= 600 mots)
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const minWords = meta.editorialMode === 'news' ? 600 : 1500;
    
    if (wordCount < minWords) {
      score -= 15;
      checks.push({ name: 'word_count', status: 'SHORT', detail: `${wordCount}/${minWords} min` });
      recommendations.push({ type: 'content', message: `Article trop court (${wordCount} mots, min ${minWords})`, impact: 15, fix: 'prompt' });
    } else {
      checks.push({ name: 'word_count', status: 'OK', detail: `${wordCount} mots` });
    }

    // UX5: Sections dupliquées
    const h2Texts = root.querySelectorAll('h2').map(h => h.text.trim().toLowerCase());
    let dupCount = 0;
    for (let i = 0; i < h2Texts.length; i++) {
      for (let j = i + 1; j < h2Texts.length; j++) {
        const shorter = h2Texts[i].length <= h2Texts[j].length ? h2Texts[i] : h2Texts[j];
        const longer = h2Texts[i].length > h2Texts[j].length ? h2Texts[i] : h2Texts[j];
        if (shorter.length >= 15 && longer.startsWith(shorter)) dupCount++;
      }
    }
    if (dupCount > 0) {
      score -= 15;
      checks.push({ name: 'duplicate_sections', status: 'FAIL', detail: `${dupCount} section(s) dupliquée(s)` });
      recommendations.push({ type: 'content', message: `${dupCount} section(s) H2 dupliquée(s) détectée(s)`, impact: 15, fix: 'post-process' });
    } else {
      checks.push({ name: 'duplicate_sections', status: 'OK', detail: 'Aucune duplication' });
    }

    return { score: Math.max(0, score), checks, recommendations };
  }

  _qaToRecommendations(qaScore) {
    const recos = [];
    
    for (const [catName, cat] of Object.entries(qaScore.categories)) {
      if (cat.details) {
        cat.details.filter(d => (d.points || 0) <= 0 && (d.status === 'MISSING' || (d.points || 0) < 0)).forEach(d => {
          recos.push({
            type: 'editorial',
            message: `[${catName}] ${d.check}: ${d.status}`,
            impact: Math.abs(d.points || 5),
            fix: 'pipeline'
          });
        });
      }
      if (cat.checks) {
        cat.checks.filter(c => !c.passed).forEach(c => {
          recos.push({
            type: 'editorial',
            message: `[BLOQUANT] ${c.check}`,
            impact: 20,
            fix: 'pipeline'
          });
        });
      }
    }
    
    return recos;
  }

  _generateFixes(qaScore, cmAudit, uxAudit, root, html, meta) {
    const fixes = [];

    // Fix auto: supprimer les sections H2 dupliquées
    if (uxAudit.checks.find(c => c.name === 'duplicate_sections' && c.status === 'FAIL')) {
      fixes.push({
        type: 'dedup_h2',
        description: 'Supprimer les sections H2 dupliquées (préfixe commun)',
        auto: true,
        apply: (articleHtml) => this._fixDedupH2(articleHtml)
      });
    }

    // Fix auto: ajouter tableau comparatif si manquant
    if (cmAudit.checks.find(c => c.name === 'comparison_table' && c.status === 'FAIL')) {
      fixes.push({
        type: 'comparison_table',
        description: 'Générer un tableau comparatif via LLM',
        auto: false,
        apply: null
      });
    }

    return fixes;
  }

  _fixDedupH2(html) {
    const h2Pattern = /<h2[^>]*>([^<]+)<\/h2>/gi;
    const h2Matches = [];
    let m;
    while ((m = h2Pattern.exec(html)) !== null) {
      h2Matches.push({
        title: m[1].trim(),
        index: m.index,
        normalized: m[1].trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')
      });
    }

    const seen = new Map();
    const toRemove = [];

    h2Matches.forEach((h2, idx) => {
      const n = h2.normalized;
      for (const [seenN, seenIdx] of seen.entries()) {
        const shorter = n.length <= seenN.length ? n : seenN;
        const longer  = n.length >  seenN.length ? n : seenN;
        if (shorter.length >= 15 && longer.startsWith(shorter)) {
          const currentStart = h2.index;
          const currentEnd = idx < h2Matches.length - 1 ? h2Matches[idx + 1].index : html.length;
          const prevH2 = h2Matches[seenIdx];
          const prevStart = prevH2.index;
          const prevEnd = seenIdx < h2Matches.length - 1 ? h2Matches[seenIdx + 1].index : html.length;

          if ((currentEnd - currentStart) >= (prevEnd - prevStart)) {
            toRemove.push({ start: prevStart, end: prevEnd });
            seen.delete(seenN);
            seen.set(n, idx);
          } else {
            toRemove.push({ start: currentStart, end: currentEnd });
          }
          return;
        }
      }
      if (seen.has(n)) {
        const start = h2.index;
        const end = idx < h2Matches.length - 1 ? h2Matches[idx + 1].index : html.length;
        toRemove.push({ start, end });
      } else {
        seen.set(n, idx);
      }
    });

    toRemove.sort((a, b) => b.start - a.start);
    let fixed = html;
    for (const r of toRemove) {
      fixed = fixed.substring(0, r.start) + fixed.substring(r.end);
    }
    return fixed;
  }

  /**
   * Génère un rapport texte lisible
   */
  report(auditResult) {
    let out = `\n${'═'.repeat(60)}\n`;
    out += `  AUDIT EXPERT CONTENT MARKETING & AFFILIATION\n`;
    out += `${'═'.repeat(60)}\n\n`;
    out += `📊 Score combiné: ${auditResult.score}%  ${auditResult.passed ? '✅ PASS' : '❌ FAIL'}\n`;
    out += `   Éditorial: ${auditResult.breakdown.editorial.score}% (×${auditResult.breakdown.editorial.weight})\n`;
    out += `   Content Marketing: ${auditResult.breakdown.contentMarketing.score}% (×${auditResult.breakdown.contentMarketing.weight})\n`;
    out += `   UX: ${auditResult.breakdown.ux.score}% (×${auditResult.breakdown.ux.weight})\n\n`;

    // Content Marketing details
    out += `── Content Marketing ──\n`;
    for (const c of auditResult.breakdown.contentMarketing.details.checks) {
      const icon = c.status === 'OK' || c.status === 'N/A' ? '✅' : c.status === 'PARTIAL' ? '⚠️' : '❌';
      out += `   ${icon} ${c.name}: ${c.detail}\n`;
    }

    // UX details
    out += `\n── UX ──\n`;
    for (const c of auditResult.breakdown.ux.details.checks) {
      const icon = c.status === 'OK' ? '✅' : c.status === 'PARTIAL' || c.status === 'THIN' ? '⚠️' : '❌';
      out += `   ${icon} ${c.name}: ${c.detail}\n`;
    }

    // Recommendations
    if (auditResult.recommendations.length > 0) {
      out += `\n── Recommandations (${auditResult.recommendations.length}) ──\n`;
      auditResult.recommendations.forEach((r, i) => {
        out += `   ${i + 1}. [${r.type}] ${r.message} (impact: -${r.impact}pts, fix: ${r.fix})\n`;
      });
    }

    // Fixes
    if (auditResult.fixes.length > 0) {
      out += `\n── Auto-fixes disponibles (${auditResult.fixes.length}) ──\n`;
      auditResult.fixes.forEach((f, i) => {
        out += `   ${i + 1}. ${f.description} ${f.auto ? '[AUTO]' : '[MANUAL]'}\n`;
      });
    }

    out += `\n${'═'.repeat(60)}\n`;
    return out;
  }
}

export default ContentMarketingExpert;
