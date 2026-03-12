#!/usr/bin/env node

/**
 * POST-PUBLISH REVIEW LOOP — Boucle multi-agent de revue post-publication
 *
 * Récupère un article publié sur WordPress, lance un panel de 5 agents experts
 * + 1 CEO/Validator en boucle jusqu'à APPROVE ou max iterations.
 *
 * Usage:
 *   node post-publish-review-loop.js --latest                     # Dernier article publié
 *   node post-publish-review-loop.js --post-id 3264               # Article spécifique
 *   node post-publish-review-loop.js --latest --dry-run            # Analyse sans correction WP
 *   node post-publish-review-loop.js --latest --max-loops 5        # Max itérations
 *   node post-publish-review-loop.js --post-id 3264 --verbose      # Logs détaillés
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import { runAllAgents, runCeoValidator } from './review-agents.js';
import { applyAllFixes } from './review-auto-fixers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI Arguments ────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const CONFIG = {
  postId: getArg('post-id', null),
  latest: hasFlag('latest'),
  dryRun: hasFlag('dry-run'),
  maxLoops: parseInt(getArg('max-loops', '3'), 10),
  verbose: hasFlag('verbose'),
};

// ─── WordPress API ────────────────────────────────────────

function getWpAuth() {
  if (!WORDPRESS_URL || !WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD) {
    throw new Error('WordPress credentials manquantes (WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD)');
  }
  const url = WORDPRESS_URL.replace(/\/+$/, '');
  const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
  return { url, auth };
}

async function fetchArticle(postId) {
  const { url, auth } = getWpAuth();
  const res = await axios.get(`${url}/wp-json/wp/v2/posts/${postId}`, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 15000
  });
  return res.data;
}

async function fetchLatestArticle() {
  const { url, auth } = getWpAuth();
  const res = await axios.get(`${url}/wp-json/wp/v2/posts`, {
    params: { per_page: 1, orderby: 'date', order: 'desc', status: 'publish,draft,pending' },
    headers: { Authorization: `Basic ${auth}` },
    timeout: 15000
  });
  if (!res.data[0]) throw new Error('Aucun article trouvé sur WordPress');
  return res.data[0];
}

async function updateArticleContent(postId, newContent) {
  const { url, auth } = getWpAuth();
  const res = await axios.put(`${url}/wp-json/wp/v2/posts/${postId}`, {
    content: newContent
  }, {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });
  return res.data;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&#8230;/g, "…")
    .replace(/&#039;/g, "'");
}

function extractDestination(title) {
  const patterns = [
    /en\s+(Thaïlande|Thailande|Vietnam|Indonésie|Japon|Corée|Malaisie|Singapour|Cambodge|Philippines|Sri Lanka|Bali|Laos|Myanmar)/i,
    /à\s+(Bangkok|Chiang Mai|Krabi|Phuket|Hanoi|Tokyo|Kyoto|Seoul|Bali|Ubud|Lombok|Singapour)/i,
    /(Thaïlande|Vietnam|Indonésie|Japon|Corée|Bali|Sri Lanka)/i
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return m[1];
  }
  return null;
}

// ─── Rapport ──────────────────────────────────────────────

function saveReport(reportPath, report) {
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  📄 Rapport sauvegardé : ${reportPath}`);
}

// ─── Boucle principale ───────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   POST-PUBLISH REVIEW LOOP — Multi-Agent Expert Panel       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!CONFIG.postId && !CONFIG.latest) {
    console.error('❌ Usage: node post-publish-review-loop.js --latest | --post-id <id>');
    process.exit(1);
  }

  console.log(`  Mode : ${CONFIG.dryRun ? 'DRY RUN (pas de mise à jour WP)' : 'LIVE (corrections appliquées sur WP)'}`);
  console.log(`  Max itérations : ${CONFIG.maxLoops}`);

  // ── Phase 1 : Récupérer l'article ──
  console.log('\n━━━ Phase 1 : Récupération de l\'article publié ━━━');

  let wpPost;
  try {
    wpPost = CONFIG.postId
      ? await fetchArticle(CONFIG.postId)
      : await fetchLatestArticle();
  } catch (err) {
    console.error(`❌ Impossible de récupérer l'article : ${err.message}`);
    process.exit(1);
  }

  const postId = wpPost.id;
  const title = decodeHtmlEntities(wpPost.title.rendered);
  const postUrl = wpPost.link;
  const destination = extractDestination(title);

  console.log(`  ID : ${postId}`);
  console.log(`  Titre : ${title}`);
  console.log(`  URL : ${postUrl}`);
  console.log(`  Destination : ${destination || 'non détectée'}`);
  console.log(`  Statut : ${wpPost.status}`);
  console.log(`  Contenu : ${wpPost.content.rendered.length} chars`);

  let currentHtml = wpPost.content.rendered;
  const wpAuth = CONFIG.dryRun ? null : getWpAuth();

  const report = {
    postId,
    title,
    url: postUrl,
    destination,
    startedAt: new Date().toISOString(),
    iterations: [],
    finalDecision: null,
    generatorRecommendations: [],
    totalFixesApplied: 0
  };

  const startTime = Date.now();

  // ── Phase 2 : Boucle Review → Fix → Re-review ──
  for (let iteration = 1; iteration <= CONFIG.maxLoops; iteration++) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`  ITERATION ${iteration}/${CONFIG.maxLoops}`);
    console.log(`${'━'.repeat(60)}`);

    const ctx = {
      html: currentHtml,
      title,
      url: postUrl,
      editorialMode: 'evergreen',
      destination,
      date: wpPost.date
    };

    // Lancer le panel d'experts
    const panelResult = await runAllAgents(ctx);

    // Lancer le CEO
    const ceoDecision = await runCeoValidator(panelResult, ctx);

    const iterReport = {
      iteration,
      scores: {},
      weightedScore: panelResult.weightedScore,
      criticalCount: panelResult.criticalCount,
      ceoDecision: ceoDecision.decision,
      ceoReasoning: ceoDecision.reasoning,
      fixesApplied: []
    };

    for (const [agentId, result] of Object.entries(panelResult.agents)) {
      iterReport.scores[agentId] = {
        score: result.score,
        verdict: result.verdict,
        issueCount: (result.issues || []).length,
        criticalCount: (result.issues || []).filter(i => i.severity === 'critical').length
      };
    }

    // CEO APPROVE → terminé
    if (ceoDecision.decision === 'APPROVE') {
      console.log(`\n  ✅ APPROUVÉ par le CEO à l'itération ${iteration}`);
      iterReport.fixesApplied = [];
      report.iterations.push(iterReport);
      report.finalDecision = 'APPROVED';
      report.generatorRecommendations = ceoDecision.generator_recommendations || [];
      break;
    }

    // CEO REJECT → appliquer les fixes
    console.log(`\n  🚫 REJETÉ — ${(ceoDecision.critical_fixes || []).length} correction(s) requise(s)`);

    if (CONFIG.verbose && ceoDecision.critical_fixes) {
      for (const fix of ceoDecision.critical_fixes) {
        console.log(`    P${fix.priority}: [${fix.agent}] ${fix.issue}`);
      }
    }

    // Dernière itération ? Pas de fix, on sort
    if (iteration >= CONFIG.maxLoops) {
      report.iterations.push(iterReport);
      report.finalDecision = 'REJECTED_MAX_ITERATIONS';
      report.generatorRecommendations = ceoDecision.generator_recommendations || [];
      console.log(`\n  ⚠️ MAX ITÉRATIONS ATTEINT (${CONFIG.maxLoops})`);
      break;
    }

    // Appliquer les auto-fixes
    const allIssues = panelResult.allIssues;
    const fixResult = await applyAllFixes(currentHtml, title, allIssues, wpAuth);

    iterReport.fixesApplied = fixResult.fixes;
    report.totalFixesApplied += fixResult.totalFixed;

    if (fixResult.totalFixed > 0) {
      currentHtml = fixResult.html;

      // Mettre à jour WordPress
      if (!CONFIG.dryRun) {
        try {
          await updateArticleContent(postId, currentHtml);
          console.log(`\n  📤 Article mis à jour sur WordPress (post ${postId})`);
        } catch (err) {
          console.error(`  ❌ Erreur mise à jour WP : ${err.message}`);
        }
      } else {
        console.log(`\n  🧪 DRY RUN — Corrections non appliquées sur WordPress`);
      }
    } else {
      console.log(`\n  ⚠️ Aucun fix automatique possible — les issues restantes nécessitent une intervention manuelle ou une re-génération`);
      report.iterations.push(iterReport);
      report.finalDecision = 'REJECTED_NO_AUTO_FIX';
      report.generatorRecommendations = ceoDecision.generator_recommendations || [];
      break;
    }

    report.iterations.push(iterReport);
    report.generatorRecommendations = ceoDecision.generator_recommendations || [];
  }

  // ── Phase 3 : Rapport final ──
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  report.finishedAt = new Date().toISOString();
  report.durationSeconds = parseFloat(totalDuration);

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  RÉSULTAT FINAL');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Article : "${title}"`);
  console.log(`  Décision : ${report.finalDecision}`);
  console.log(`  Itérations : ${report.iterations.length}`);
  console.log(`  Fixes appliqués : ${report.totalFixesApplied}`);
  console.log(`  Durée : ${totalDuration}s`);

  if (report.iterations.length > 0) {
    const last = report.iterations[report.iterations.length - 1];
    console.log(`\n  Scores dernière itération :`);
    for (const [agentId, s] of Object.entries(last.scores)) {
      const icon = s.verdict === 'PASS' ? '✅' : '❌';
      console.log(`    ${icon} ${agentId}: ${s.score}/100 (${s.issueCount} issues, ${s.criticalCount} critical)`);
    }
    console.log(`  Score pondéré : ${last.weightedScore}/100`);
  }

  if (report.generatorRecommendations.length > 0) {
    console.log(`\n  📋 Recommandations pour le générateur :`);
    report.generatorRecommendations.forEach((r, i) => {
      console.log(`    ${i + 1}. ${r}`);
    });
  }

  const reportPath = join(__dirname, 'data', `post-publish-review-${postId}.json`);
  saveReport(reportPath, report);

  // Sauvegarder le HTML corrigé localement
  if (report.totalFixesApplied > 0) {
    const htmlPath = join('/tmp', `review-fixed-${postId}.html`);
    writeFileSync(htmlPath, currentHtml);
    console.log(`  💾 HTML corrigé : ${htmlPath}`);
  }

  console.log(`\n${'═'.repeat(60)}\n`);
  process.exit(report.finalDecision === 'APPROVED' ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
});
