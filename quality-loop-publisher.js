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
 *   node quality-loop-publisher.js --max-loops 5        # Max iterations review
 *   node quality-loop-publisher.js --mode news          # Force le mode éditorial
 *   node quality-loop-publisher.js --post-review        # Vérification post-publication
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

const CONFIG = {
  maxLoops: parseInt(getArg('max-loops', '3'), 10),
  dryRun: hasFlag('dry-run') || process.env.FLASHVOYAGE_DRY_RUN === '1',
  forceMode: getArg('mode', null),
  verbose: hasFlag('verbose'),
  postReview: hasFlag('post-review'),
};

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
  
  const titleTag = result.title_tag || title;

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
    report: result
  };
}

// ─── Agent: LLM Rewriter ciblé ──────────────────────────
async function rewriteWithFeedback(html, criticalFixes, title) {
  const fixesList = criticalFixes
    .map((f, i) => `${i + 1}. [${f.agent}] ${f.issue}${f.action ? ' → ' + f.action : ''}`)
    .join('\n');

  const systemPrompt = `Tu es un éditeur expert pour flashvoyage.com. Tu reçois un article HTML et une liste de problèmes identifiés par un panel d'experts. 

RÈGLES ABSOLUES :
1. Corrige UNIQUEMENT les problèmes listés — ne modifie RIEN d'autre
2. Conserve TOUTE la structure HTML (balises, classes, attributs)
3. Ne supprime AUCUN contenu qui n'est pas problématique
4. Ne rajoute PAS de contenu non demandé
5. Retourne L'INTÉGRALITÉ du HTML corrigé, du premier au dernier caractère
6. TOUT en français, tutoiement obligatoire
7. NE JAMAIS utiliser de formules IA : "arbitrer entre X et Y sans sacrifier Z", "Ce que les autres guides ne disent pas", "Option 1/2/3"`;

  const userPrompt = `TITRE : ${title}

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

  const postData = {
    title: article.title,
    content: article.content,
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

  if (CONFIG.dryRun) {
    process.env.FLASHVOYAGE_DRY_RUN = '1';
  }
  process.env.ENABLE_MARKETING_PASS = '0';
  process.env.SKIP_WP_PUBLISH = '1';

  const generator = new EnhancedUltraGenerator();
  const startTime = Date.now();

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
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`  REVIEW ITERATION ${iteration}/${CONFIG.maxLoops}`);
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

    // Phase 2b: Auto-fixers programmatiques
    console.log('\n━━━ PHASE 2b : Auto-fixers ━━━');
    try {
      const { html: autoFixed, totalFixed } = await applyAllFixes(article.content, article.title, []);
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
      url: article.slug ? `https://flashvoyage.com/${article.slug}/` : 'https://flashvoyage.com/',
      editorialMode: article.editorialMode,
      destination,
      date: new Date().toISOString().split('T')[0]
    };

    const reviewResult = await runAllAgents(ctx);
    lastReviewResult = reviewResult;

    const criticalIssues = reviewResult.allIssues.filter(i => i.severity === 'critical');

    console.log(`\n   📊 Score pondéré : ${reviewResult.weightedScore.toFixed(1)}/100 | Issues critiques : ${criticalIssues.length}`);

    const ceoResult = await runCeoValidator(reviewResult, ctx);

    if (ceoResult.decision === 'APPROVE') {
      console.log(`\n   ✅ CEO APPROVE — Score ${reviewResult.weightedScore.toFixed(1)}/100`);
      approved = true;
      break;
    }

    console.log(`\n   🚫 CEO REJECT — ${ceoResult.reasoning?.substring(0, 150) || 'Qualité insuffisante'}`);

    if (iteration >= CONFIG.maxLoops) {
      console.log(`\n   ⚠️ MAX ITERATIONS ATTEINT (${CONFIG.maxLoops})`);
      break;
    }

    // ══════════════════════════════════════════════════════════
    //  Phase 3b: LLM Rewriter ciblé
    // ══════════════════════════════════════════════════════════
    const fixes = ceoResult.critical_fixes || [];
    if (fixes.length > 0) {
      console.log(`\n   🔧 LLM Rewriter — ${fixes.length} correction(s) ciblée(s)`);
      fixes.forEach((f, i) => console.log(`      ${f.priority || i + 1}. [${f.agent}] ${f.issue?.substring(0, 100)}`));

      const rewritten = await rewriteWithFeedback(article.content, fixes, article.title);
      if (rewritten !== article.content) {
        article = { ...article, content: rewritten };
        writeFileSync('/tmp/last-generated-article.html', article.content);
        console.log(`   ✅ Article réécrit (${rewritten.length} chars)`);
      }
    }

    const autoFixIssues = reviewResult.allIssues
      .filter(i => i.fix_type === 'auto' && i.severity === 'critical');
    if (autoFixIssues.length > 0) {
      try {
        const { html: fixedHtml } = await applyAllFixes(article.content, article.title, autoFixIssues);
        if (fixedHtml !== article.content) {
          article = { ...article, content: fixedHtml };
          console.log(`   ✅ Auto-fixes appliqués`);
        }
      } catch (e) {
        console.warn(`   ⚠️ Auto-fixes échoués : ${e.message}`);
      }
    }
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
  writeFileSync(reportPath, JSON.stringify({
    title: article.title,
    weightedScore: lastReviewResult?.weightedScore,
    approved,
    iterations: iteration,
    duration: totalDuration,
    editorialMode: article.editorialMode,
    agentScores: lastReviewResult ? Object.fromEntries(
      Object.entries(lastReviewResult.agents).map(([id, r]) => [id, { score: r.score, verdict: r.verdict }])
    ) : null,
    dryRun: CONFIG.dryRun,
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
