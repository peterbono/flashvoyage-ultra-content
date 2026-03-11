#!/usr/bin/env node

/**
 * quality-loop-publisher.js — Orchestrateur multi-agent de publication
 * 
 * Boucle : Génération → Audit Expert → Auto-fix → Re-audit → Publication
 * Continue jusqu'à atteindre le seuil de qualité (défaut 95%) ou max iterations.
 * 
 * Usage:
 *   node quality-loop-publisher.js                     # Utilise le calendrier éditorial
 *   node quality-loop-publisher.js --dry-run            # Sans publication WordPress
 *   node quality-loop-publisher.js --target-score 100   # Score cible custom
 *   node quality-loop-publisher.js --max-loops 5        # Max iterations
 *   node quality-loop-publisher.js --mode news          # Force le mode éditorial
 */

import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import EnhancedUltraGenerator from './enhanced-ultra-generator.js';
import ContentMarketingExpert from './content-marketing-expert.js';
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
  targetScore: parseFloat(getArg('target-score', '95')),
  maxLoops: parseInt(getArg('max-loops', '3'), 10),
  dryRun: hasFlag('dry-run') || process.env.FLASHVOYAGE_DRY_RUN === '1',
  forceMode: getArg('mode', null),
  verbose: hasFlag('verbose'),
};

// ─── Agent: Expert Content Marketing ─────────────────────
const expert = new ContentMarketingExpert();

// ─── Agent: Pipeline Generator ───────────────────────────
async function generateArticle(generator) {
  console.log('\n🤖 AGENT[Generator] — Lancement pipeline complet (source selection + generation)...\n');
  
  // EnhancedUltraGenerator gère tout : sélection source (RSS/Reddit), 
  // pipeline complet (extractor → generator → finalizer), et publication optionnelle.
  // En dry-run, il ne publie pas sur WordPress.
  const result = await generator.generateAndPublishEnhancedArticle();

  if (!result) {
    console.error('❌ AGENT[Generator] — Pas de résultat');
    return null;
  }

  // Le contenu peut être dans result.content (enrichi) ou à récupérer du fichier sauvegardé
  const content = result.content || null;
  if (!content) {
    console.error('❌ AGENT[Generator] — Pas de contenu dans le résultat');
    return null;
  }

  const title = typeof result.title === 'string' ? result.title : (result.title?.rendered || 'Article sans titre');
  console.log(`✅ AGENT[Generator] — Article généré: "${title}" (${content.length} chars)`);
  
  return {
    title,
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

// ─── Agent: Expert Auditor ───────────────────────────────
function auditArticle(article) {
  console.log('\n🔍 AGENT[Expert] — Audit content marketing...\n');
  
  const result = expert.audit(article.content, {
    title: article.title,
    editorialMode: article.editorialMode,
    destination: article.report?.pipelineContext?.final_destination
  });

  console.log(expert.report(result));
  return result;
}

// ─── Agent: Auto-Fixer ──────────────────────────────────
function applyAutoFixes(article, auditResult) {
  const autoFixes = auditResult.fixes.filter(f => f.auto && typeof f.apply === 'function');
  
  if (autoFixes.length === 0) {
    console.log('   ℹ️ AGENT[Fixer] — Aucun auto-fix applicable');
    return article;
  }

  console.log(`\n🔧 AGENT[Fixer] — Application de ${autoFixes.length} auto-fix(es)...\n`);
  
  let fixedContent = article.content;
  for (const fix of autoFixes) {
    const before = fixedContent.length;
    fixedContent = fix.apply(fixedContent);
    const diff = before - fixedContent.length;
    console.log(`   ✅ ${fix.description} (${diff > 0 ? '-' + diff : '+' + Math.abs(diff)} chars)`);
  }

  return { ...article, content: fixedContent };
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

  // Upload featured image
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

  // Résoudre les catégories (noms → IDs WordPress)
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

  // Résoudre les tags (noms → IDs WordPress)
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

  return response.data.link;
}

// ─── Orchestrateur principal ─────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   QUALITY LOOP PUBLISHER — Multi-Agent Orchestrator     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`   Target score: ${CONFIG.targetScore}%`);
  console.log(`   Max loops: ${CONFIG.maxLoops}`);
  console.log(`   Dry run: ${CONFIG.dryRun}`);
  console.log(`   Force mode: ${CONFIG.forceMode || 'auto'}\n`);

  if (CONFIG.dryRun) {
    process.env.FLASHVOYAGE_DRY_RUN = '1';
  }

  // Le quality-loop a son propre ContentMarketingExpert — désactiver le pass LLM
  // redondant dans le pipeline qui envoie tout le HTML à GPT-4o-mini et timeout
  process.env.ENABLE_MARKETING_PASS = '0';

  // Empêcher la publication automatique — le quality-loop publie seulement si qualité OK
  process.env.SKIP_WP_PUBLISH = '1';

  const generator = new EnhancedUltraGenerator();
  const startTime = Date.now();

  // ── Phase 1: Génération initiale ──
  let article = await generateArticle(generator);
  if (!article) {
    console.error('\n❌ Génération échouée. Arrêt.');
    process.exit(1);
  }

  // Sauvegarder le HTML brut
  writeFileSync('/tmp/last-generated-article.html', article.content);

  let bestScore = 0;
  let bestArticle = article;
  let iteration = 0;

  // ── Phase 2: Boucle Audit → Fix → Re-audit ──
  while (iteration < CONFIG.maxLoops) {
    iteration++;
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`  ITERATION ${iteration}/${CONFIG.maxLoops}`);
    console.log(`${'━'.repeat(60)}`);

    // Audit
    const auditResult = auditArticle(article);
    const currentScore = auditResult.score;

    console.log(`\n📊 Score iteration ${iteration}: ${currentScore}% (cible: ${CONFIG.targetScore}%)`);

    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestArticle = article;
    }

    // Score atteint ?
    if (currentScore >= CONFIG.targetScore) {
      console.log(`\n✅ QUALITÉ ATTEINTE: ${currentScore}% >= ${CONFIG.targetScore}%`);
      break;
    }

    // Dernière itération ?
    if (iteration >= CONFIG.maxLoops) {
      console.log(`\n⚠️ MAX ITERATIONS ATTEINT (${CONFIG.maxLoops}). Meilleur score: ${bestScore}%`);
      
      if (auditResult.recommendations.length > 0) {
        console.log('\n📋 Recommandations restantes pour la prochaine itération:');
        auditResult.recommendations.slice(0, 5).forEach((r, i) => {
          console.log(`   ${i + 1}. [${r.type}] ${r.message} (impact: -${r.impact})`);
        });
      }
      break;
    }

    // Appliquer les auto-fixes
    const fixedArticle = applyAutoFixes(article, auditResult);
    
    if (fixedArticle.content !== article.content) {
      article = fixedArticle;
      writeFileSync('/tmp/last-generated-article.html', article.content);
      console.log('   💾 Article mis à jour après auto-fixes');
    } else if (auditResult.recommendations.length > 0) {
      // Pas de fix auto possible — log les recommandations manuelles
      console.log('\n📋 Recommandations nécessitant un re-run pipeline:');
      auditResult.recommendations
        .filter(r => r.fix === 'pipeline' || r.fix === 'prompt')
        .slice(0, 3)
        .forEach((r, i) => {
          console.log(`   ${i + 1}. ${r.message}`);
        });
      console.log('   → Ces améliorations seront intégrées dans les prochaines générations.');
      break;
    }
  }

  // ── Phase 3: Publication ──
  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RÉSULTAT FINAL`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Titre: ${bestArticle.title}`);
  console.log(`   Score: ${bestScore}%`);
  console.log(`   Mode: ${bestArticle.editorialMode}`);
  console.log(`   Iterations: ${iteration}`);
  console.log(`   Durée: ${totalDuration} min`);

  if (CONFIG.dryRun) {
    console.log(`\n🧪 DRY RUN — Pas de publication WordPress`);
    console.log(`   HTML sauvegardé: /tmp/last-generated-article.html`);
  } else if (bestScore >= CONFIG.targetScore) {
    console.log('\n📤 AGENT[Publisher] — Publication WordPress...');
    try {
      const link = await publishArticle(bestArticle);
      if (link) {
        console.log(`\n🔗 ARTICLE PUBLIÉ: ${link}`);
      }
    } catch (err) {
      const detail = err.response?.data?.message || err.response?.data?.code || '';
      console.error(`❌ Publication échouée: ${err.message} ${detail}`);
      console.error(`   Categories: ${JSON.stringify(bestArticle.categories)}`);
      console.error(`   Tags: ${JSON.stringify(bestArticle.tags)}`);
      console.error(`   Content length: ${bestArticle.content?.length || 0}`);
    }
  } else {
    console.log(`\n⚠️ Score insuffisant (${bestScore}% < ${CONFIG.targetScore}%) — publication annulée`);
  }

  // Sauvegarder le rapport
  const reportPath = join(__dirname, 'pipeline-report-output.json');
  writeFileSync(reportPath, JSON.stringify({
    title: bestArticle.title,
    score: bestScore,
    iterations: iteration,
    duration: totalDuration,
    editorialMode: bestArticle.editorialMode,
    dryRun: CONFIG.dryRun,
    timestamp: new Date().toISOString()
  }, null, 2));

  console.log(`\n${'═'.repeat(60)}\n`);
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});
