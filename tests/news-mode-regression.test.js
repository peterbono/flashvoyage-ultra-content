import test from 'node:test';
import assert from 'node:assert/strict';
import SeoOptimizer from '../seo-optimizer.js';
import ArticleFinalizer from '../article-finalizer.js';
import QualityAnalyzer from '../quality-analyzer.js';
import { runAllKPITests } from './kpi-quality.test.js';

test('K10 is skipped in NEWS mode', async () => {
  const html = '<h1>Visa Vietnam: changement</h1><p>Impact immédiat pour ton voyage.</p>';
  const result = await runAllKPITests(html, { editorialMode: 'news', title: 'Visa Vietnam: changement' });
  assert.equal(result.results.K10.status, 'SKIP');
});

test('SEO quality gate ignores punctuation fragments', () => {
  const optimizer = new SeoOptimizer();
  optimizer.tokenAudit = [
    { token: 'trip', source_path: 'story.extracted.source.title' },
    { token: 'vietnam', source_path: 'story.extracted.source.title' }
  ];

  const report = {
    checks: [],
    issues: [],
    debug: {
      seo_data: {
        post_title: 'Trip to Vietnam',
        primaryTopic: 'trip to',
        places: ['vietnam']
      }
    }
  };

  optimizer.checkSeoQualityGate('', {
    title: 'Trip to Vietnam | FlashVoyage',
    metaDescription: 'trip to.'
  }, report);

  const untracked = report.issues.filter(i => i.code === 'SOURCE_OF_TRUTH_VIOLATION_SEO');
  assert.equal(untracked.length, 0);
});

test('Deterministic cleanup removes known split-word artifacts', () => {
  const finalizer = new ArticleFinalizer();
  const dirty = '<p>Le budg et est serré. Un itinéraire bi en préparé. Fuse au horaire et y en local.</p>';
  const cleaned = finalizer.applyDeterministicFinalTextCleanup(dirty);
  assert.match(cleaned, /budget/i);
  assert.match(cleaned, /bien préparé/i);
  assert.match(cleaned, /fuseau horaire/i);
  assert.match(cleaned, /yen local/i);
  assert.doesNotMatch(cleaned, /budg\s+et|bi\s+en|fuse\s+au|y\s+en/i);
});

test('Deterministic cleanup preserves HTML spacing and time formats', () => {
  const finalizer = new ArticleFinalizer();
  const dirty = [
    '<li>Vol : <strong>400 &euro;</strong>en moyenne</li>',
    '<li>Sécurité:1.4/5</li>',
    '<li>Fuseau horaire : UTC+08: 00</li>',
    '<li>cuisineépicée et 400 €en poche</li>'
  ].join('');
  const cleaned = finalizer.applyDeterministicFinalTextCleanup(dirty);
  assert.match(cleaned, /<\/strong> en moyenne/i);
  assert.match(cleaned, /Sécurité : 1\.4\/5/i);
  assert.match(cleaned, /UTC\+08:00/i);
  assert.match(cleaned, /cuisine épicée/i);
  assert.match(cleaned, /400 € en poche/i);
});

test('Deterministic cleanup removes orphan CSS fragment and meal glue', () => {
  const finalizer = new ArticleFinalizer();
  const dirty = [
    '<p>.entry-content .wp-block-details{border:1px solid #e2e8f0}</p>',
    '<p>.entry-content .wp-block-details summary{padding:16px}</p>',
    '</style>',
    '<li>repaséconomique : <strong>~2 &euro;</strong></li>'
  ].join('\n');
  const cleaned = finalizer.applyDeterministicFinalTextCleanup(dirty);
  assert.doesNotMatch(cleaned, /\.entry-content\s+\.wp-block-details/i);
  assert.doesNotMatch(cleaned, /<\/style>/i);
  assert.match(cleaned, /repas économique/i);
});

test('Blocking gate accepts regional Asia title tokens', () => {
  const qa = new QualityAnalyzer();
  const html = [
    '<h1>Asie du Sud-Est : choix d’itinéraires pour éviter les pièges</h1>',
    '<h2>Ce que ça change concrètement</h2>',
    '<p>Un arbitrage clair pour ton voyage.</p>'
  ].join('');
  const score = qa.getGlobalScore(html, 'news');
  const destinationCheck = score.categories.blocking.checks.find(c => c.check === 'Destination asiatique titre');
  assert.ok(destinationCheck, 'Destination asiatique titre check should exist');
  assert.equal(destinationCheck.passed, true);
});

test('NEWS minimum SERP sections are injected when missing', () => {
  const finalizer = new ArticleFinalizer();
  const html = '<h1>Asie du Sud-Est</h1><p>Contenu court.</p>';
  const out = finalizer.ensureMinimumNewsSerpSections(html, 'indonésie');
  assert.match(out, /Ce que les autres ne disent pas/i);
  assert.match(out, /Limites et biais/i);
  assert.match(out, /Les erreurs fréquentes qui coûtent cher/i);
});

test('NEWS decision and CTA friction are enforced', () => {
  const finalizer = new ArticleFinalizer();
  const html = '<p>Texte neutre.</p><aside class="affiliate-module"><div>module</div></aside>';
  const out = finalizer.enforceNewsDecisionAndCtaFriction(html);
  assert.match(out, /Notre arbitrage/i);
  assert.match(out, /Avant de réserver/i);
});

test('Late glue pass does not reintroduce repas-economique collage', () => {
  const finalizer = new ArticleFinalizer();
  const input = '<li>Repas économique : <strong>~2 &euro;</strong></li>';
  const afterGlue = finalizer.fixWordGlue(input, null);
  const cleaned = finalizer.applyDeterministicFinalTextCleanup(afterGlue);
  assert.match(cleaned, /Repas économique/i);
  assert.doesNotMatch(cleaned, /repaséconomique/i);
});
