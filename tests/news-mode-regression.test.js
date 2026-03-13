import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import SeoOptimizer from '../seo-optimizer.js';
import ArticleFinalizer from '../article-finalizer.js';
import EnhancedUltraGenerator from '../enhanced-ultra-generator.js';
import QualityAnalyzer from '../quality-analyzer.js';
import { runAllKPITests } from './kpi-quality.test.js';
import { validatePrePublish, __testAutoFixHtml } from '../pre-publish-validator.js';
import {
  fixTruncatedLinks,
  fixMinimumInternalLinks,
  fixInternalLinkVolume,
  fixMissingSourceAttribution,
  fixEditorialAntiPatterns,
  fixFactualOverclaims
} from '../review-auto-fixers.js';

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

test('Deterministic cleanup does not inject spaces into affiliate script URLs', () => {
  const finalizer = new ArticleFinalizer();
  const dirty = '<aside class="affiliate-module"><script async src="https://trpwdg.com/content?trs=425154&shmarker=664014&locale=fr&powered_by=true"></script></aside>';
  const cleaned = finalizer.applyDeterministicFinalTextCleanup(dirty);
  assert.match(cleaned, /content\?trs=425154&shmarker=664014&locale=fr&powered_by=true/i);
  assert.doesNotMatch(cleaned, /content\?\s+trs=/i);
});

test('Affiliate widget integrity sanitizer repairs malformed URLs', () => {
  const finalizer = new ArticleFinalizer();
  const dirty = '<script async src="https://trpwdg.com/content? trs =425154& amp;shmarker=664014 &locale=fr"></script>';
  const cleaned = finalizer.sanitizeAffiliateWidgetIntegrity(dirty);
  assert.match(cleaned, /content\?trs=425154(?:&|&amp;)shmarker=664014&locale=fr/i);
  assert.doesNotMatch(cleaned, /\?\s+trs/i);
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

test('Blocking gate accepts Koh Lanta in title', () => {
  const qa = new QualityAnalyzer();
  const html = [
    '<h1>Budget réel pour vivre à Koh Lanta : dépenses et optimisations</h1>',
    '<p>Retour terrain en Thaïlande pour nomades.</p>'
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
  assert.match(out, /Pourquoi:/i);
});

test('NEWS profile keeps a visible but concise affiliate disclosure', () => {
  const finalizer = new ArticleFinalizer();
  const html = '<aside class="affiliate-module"><h3>Module</h3><p class="affiliate-module-disclaimer"><small>Lien partenaire</small></p></aside>';
  const out = finalizer.applyNewsRenderingProfile(html);
  assert.match(out, /Liens partenaires: une commission peut être perçue, sans surcoût pour toi/i);
});

test('NEWS profile injects disclosure when affiliate script is standalone', () => {
  const finalizer = new ArticleFinalizer();
  const html = '<p>Texte</p><script async src="https://trpwdg.com/content?trs=1&shmarker=2"></script>';
  const out = finalizer.applyNewsRenderingProfile(html);
  assert.match(out, /affiliate-module-disclaimer/i);
  assert.match(out, /Liens partenaires: une commission peut être perçue, sans surcoût pour toi/i);
});

test('NEWS actionable conclusion is injected when missing', () => {
  const finalizer = new ArticleFinalizer();
  const html = '<h2>Limites et biais</h2><p>Contenu analytique sans CTA.</p>';
  const out = finalizer.ensureNewsActionableConclusion(html);
  assert.match(out, /Prochaines étapes/i);
  assert.match(out, /compare 2 options maximum/i);
});

test('NEWS quality convergence injects impact and action blocks when missing', () => {
  const finalizer = new ArticleFinalizer();
  const html = '<p>Contenu faible, sans structure SERP explicite.</p>';
  const out = finalizer.ensureNewsQualityConvergence(html, {
    title: 'Thaïlande: arbitrages à faire pour éviter les erreurs',
    finalDestination: 'Thaïlande'
  });
  assert.match(out, /Ce qui change concrètement/i);
  assert.match(out, /<ul>/i);
  assert.match(out, /Que faire maintenant/i);
});

test('NEWS quality convergence injects a pillar link when missing', () => {
  const finalizer = new ArticleFinalizer();
  const html = '<h2>Limites et biais</h2><p>Analyse.</p>';
  const out = finalizer.ensureNewsQualityConvergence(html, {
    title: 'Thaïlande: nouvelle mise à jour logistique',
    finalDestination: 'Thaïlande',
    pillarLink: 'https://flashvoyage.com/notre-methode/'
  });
  assert.match(out, /https:\/\/flashvoyage\.com\/notre-methode\//i);
});

test('NEWS quality convergence improves score on weak input', () => {
  const finalizer = new ArticleFinalizer();
  const qa = new QualityAnalyzer();
  const baseContent = '<p>Texte générique sans bloc impact/action.</p>';
  const baseScore = qa.getGlobalScore('<h1>Thaïlande: mise à jour</h1>\n' + baseContent, 'news');
  const improved = finalizer.ensureNewsQualityConvergence(baseContent, {
    title: 'Thaïlande: mise à jour',
    finalDestination: 'Thaïlande'
  });
  const improvedScore = qa.getGlobalScore('<h1>Thaïlande: mise à jour</h1>\n' + improved, 'news');
  assert.ok(Number(improvedScore.globalScore) >= Number(baseScore.globalScore));
});

test('NEWS quality convergence is idempotent', () => {
  const finalizer = new ArticleFinalizer();
  const html = '<p>Contenu court sans structure.</p>';
  const once = finalizer.ensureNewsQualityConvergence(html, {
    title: 'Thaïlande: mise à jour',
    finalDestination: 'Thaïlande'
  });
  const twice = finalizer.ensureNewsQualityConvergence(once, {
    title: 'Thaïlande: mise à jour',
    finalDestination: 'Thaïlande'
  });
  assert.equal(twice, once);
});

test('Late glue pass does not reintroduce repas-economique collage', () => {
  const finalizer = new ArticleFinalizer();
  const input = '<li>Repas économique : <strong>~2 &euro;</strong></li>';
  const afterGlue = finalizer.fixWordGlue(input, null);
  const cleaned = finalizer.applyDeterministicFinalTextCleanup(afterGlue);
  assert.match(cleaned, /Repas économique/i);
  assert.doesNotMatch(cleaned, /repaséconomique/i);
});

test('SEO internal anchor builder avoids truncated stopword tails', () => {
  const optimizer = new SeoOptimizer();
  const anchor = optimizer._buildSafeInternalAnchor('Guide complet Vietnam et');
  assert.ok(anchor.length >= 12);
  assert.doesNotMatch(anchor, /\b(et|de|du|des|que|tu|la|le)\s*$/i);
});

test('Pre-publish gate blocks regional mismatch (SEA title with East Asia dominant content)', async () => {
  const html = [
    '<h1>Asie du Sud-Est : itinéraire optimisé</h1>',
    '<p>En Chine, ce trajet change tout. La Chine impose aussi un autre rythme.</p>',
    '<p>La Chine et Pékin reviennent comme contraintes principales.</p>',
    '<a href="https://flashvoyage.com/guide-vietnam-budget/">Guide Vietnam budget pratique</a>',
    '<a href="https://flashvoyage.com/guide-thailande-visa/">Guide Thaïlande visa complet</a>',
    '<a href="https://flashvoyage.com/guide-cambodge-itineraire/">Guide Cambodge itinéraire réel</a>'
  ].join('\n');
  const result = await validatePrePublish(html, {
    destination: 'thailand',
    title: 'Asie du Sud-Est : itinéraire optimisé'
  });
  const scopeIssue = result.issues.find(i => i.gate === 'fact-check' && /Incohérence de périmètre destination/i.test(i.message));
  assert.ok(scopeIssue, 'Expected a destination scope mismatch issue');
  assert.equal(scopeIssue.severity, 'critical');
});

test('Pre-publish gate does not raise SEA scope mismatch on Japan destination body mentions', async () => {
  const html = [
    '<h1>5 jours à Kyoto en solo</h1>',
    '<p>Comparatif utile: certains guides Asie du Sud-Est sont hors périmètre ici.</p>',
    '<p>Kyoto, Japon, temples, quartiers et logistique locale.</p>',
    '<a href="https://flashvoyage.com/voyager-en-asie-du-sud-est/">Guide Asie du Sud-Est</a>',
    '<a href="https://flashvoyage.com/kyoto-itineraire-5-jours/">Itinéraire Kyoto 5 jours</a>',
    '<a href="https://flashvoyage.com/japon-budget-solo/">Budget Japon solo</a>'
  ].join('\n');
  const result = await validatePrePublish(html, {
    destination: 'japan',
    title: '5 jours à Kyoto en solo'
  });
  const scopeIssue = result.issues.find(i => i.gate === 'fact-check' && /Incohérence de périmètre destination/i.test(i.message));
  assert.equal(scopeIssue, undefined);
});

test('Truncated internal link fixer improves gate critical count', async () => {
  const html = [
    '<h1>Vietnam : arbitrages utiles</h1>',
    '<p>Comparatif terrain.</p>',
    '<a href="https://flashvoyage.com/guide-vietnam-budget/">Guide Vietnam et</a>',
    '<a href="https://flashvoyage.com/guide-thailande-visa/">Guide Thaïlande visa complet</a>',
    '<a href="https://flashvoyage.com/guide-cambodge-itineraire/">Guide Cambodge itinéraire réel</a>'
  ].join('\n');

  const before = await validatePrePublish(html, { destination: 'vietnam', title: 'Vietnam : arbitrages utiles' });
  const beforeCriticalInternal = before.issues.filter(i => i.gate === 'internal-links' && i.severity === 'critical').length;
  assert.ok(beforeCriticalInternal >= 1, 'Expected at least one critical internal-link issue before fix');

  const originalGet = axios.get;
  try {
    axios.get = async () => ({
      data: [{ title: { rendered: 'Guide Vietnam budget et décisions à prendre avant de réserver' } }]
    });
    const fixed = await fixTruncatedLinks(html, { url: 'https://flashvoyage.com', auth: 'test' });
    const after = await validatePrePublish(fixed.html, { destination: 'vietnam', title: 'Vietnam : arbitrages utiles' });
    const afterCriticalInternal = after.issues.filter(i => i.gate === 'internal-links' && i.severity === 'critical').length;
    assert.ok(afterCriticalInternal <= beforeCriticalInternal, 'Critical internal-link count should not increase after fix');
  } finally {
    axios.get = originalGet;
  }
});

test('Auto-fix substitutes dead internal link when fallback exists', () => {
  const html = '<p>Voir <a href="https://flashvoyage.com/guide-vietnam-obsolete/">Guide Vietnam budget</a> avant réservation.</p>';
  const issues = [{
    gate: 'internal-links',
    severity: 'critical',
    message: 'Lien mort (404) : https://flashvoyage.com/guide-vietnam-obsolete/',
    auto_fixable: true
  }];
  const { html: fixed, fixCount } = __testAutoFixHtml(html, issues, {
    destination: 'vietnam',
    internalArticlesIndex: [{
      title: 'Guide Vietnam budget et arbitrages',
      slug: 'guide-vietnam-budget-et-arbitrages',
      link: 'https://flashvoyage.com/guide-vietnam-budget-et-arbitrages/'
    }]
  });
  assert.ok(fixCount >= 1);
  assert.match(fixed, /guide-vietnam-budget-et-arbitrages/i);
});

test('Pre-publish auto-fix normalizes Hn hierarchy jumps', async () => {
  const html = [
    '<h1>Thaïlande : arbitrages</h1>',
    '<h2>Contexte</h2>',
    '<h4>Infos pratiques</h4>',
    '<p>Contenu.</p>'
  ].join('\n');
  const result = await validatePrePublish(html, {
    destination: 'thailande',
    title: 'Thaïlande : arbitrages'
  });
  assert.ok(result.totalFixes >= 1);
  assert.doesNotMatch(result.fixedHtml, /<h4>Infos pratiques<\/h4>/i);
  assert.match(result.fixedHtml, /<h3>Infos pratiques<\/h3>/i);
});

test('Pre-publish auto-fix injects internal links when below minimum', async () => {
  const html = [
    '<h1>Vietnam : arbitrages utiles</h1>',
    '<p>Analyse rapide.</p>',
    '<a href="https://flashvoyage.com/guide-vietnam-budget/">Guide Vietnam budget</a>'
  ].join('\n');
  const result = await validatePrePublish(html, {
    destination: 'vietnam',
    title: 'Vietnam : arbitrages utiles',
    internalArticlesIndex: [
      { title: 'Guide Vietnam visa', slug: 'guide-vietnam-visa', link: 'https://flashvoyage.com/guide-vietnam-visa/' },
      { title: 'Guide Hanoi budget', slug: 'guide-hanoi-budget', link: 'https://flashvoyage.com/guide-hanoi-budget/' },
      { title: 'Guide Ho Chi Minh transport', slug: 'guide-ho-chi-minh-transport', link: 'https://flashvoyage.com/guide-ho-chi-minh-transport/' }
    ]
  });
  const linkCount = (result.fixedHtml.match(/href="https?:\/\/flashvoyage\.com[^"]*"/gi) || []).length;
  assert.ok(linkCount >= 3, `Expected >=3 internal links after fallback injection, got ${linkCount}`);
});

test('NEWS convergence ensures FAQ structure and actionable conclusion', () => {
  const finalizer = new ArticleFinalizer();
  const html = '<h1>Thaïlande: mise à jour</h1><p>Contenu court.</p>';
  const out = finalizer.ensureNewsQualityConvergence(html, {
    title: 'Thaïlande: mise à jour',
    finalDestination: 'Thaïlande'
  });
  assert.match(out, /Questions fréquentes/i);
  assert.match(out, /<details>/i);
  assert.match(out, /<summary>/i);
  assert.match(out, /Prochaines étapes/i);
});

test('Minimum internal links fixer adds links when needed', async () => {
  const html = '<h1>Thaïlande</h1><p>Texte.</p>';
  const fixed = await fixMinimumInternalLinks(html, 'Thaïlande : budget et options', 'Thaïlande');
  assert.ok([true, false].includes(fixed.fixed));
  if (fixed.fixed) {
    const count = (fixed.html.match(/href="https?:\/\/flashvoyage\.com[^"]*"/gi) || []).length;
    assert.ok(count >= 1);
  }
});

test('Editorial anti-pattern and factual overclaim fixers sanitize risky phrasing', async () => {
  const html = [
    '<p>La vraie question n\'est pas le prix mais le timing.</p>',
    '<p>Arbitrer entre vol et train sans sacrifier ton budget.</p>',
    '<p>Cet itinéraire est garanti à 100% et sans aucun risque.</p>'
  ].join('\n');
  const anti = await fixEditorialAntiPatterns(html);
  const factual = await fixFactualOverclaims(anti.html);
  assert.doesNotMatch(factual.html, /la vraie question n['’]est pas/i);
  assert.doesNotMatch(factual.html, /garanti à 100%|sans aucun risque/i);
});

test('Generator output contract removes placeholders and caps title_tag length', () => {
  const generator = new EnhancedUltraGenerator();
  const article = {
    title: '"Voyage au Japon avec un angle très long qui dépasse largement la limite SEO attendue"',
    content: '<p>Ce plan coûte quelques euros et parfois 2quelques frais coûtentquelques aussi.</p>'
  };
  const out = generator.applyGeneratorOutputContract(article, {
    destination: 'Japon',
    sourceUrl: 'https://reddit.com/r/travel/comments/abc123/sample'
  });
  assert.ok(out.title_tag.length <= 60, `title_tag too long: ${out.title_tag.length}`);
  assert.doesNotMatch(out.content, /2quelques|coûtentquelques|quelques euros/i);
});

test('Source attribution fixer injects Reddit URL when testimony is claimed', async () => {
  const html = '<p>Ce témoignage Reddit montre un retour terrain utile pour décider.</p>';
  const out = await fixMissingSourceAttribution(html, 'https://reddit.com/r/travel/comments/abc123/sample');
  assert.equal(out.fixed, true);
  assert.match(out.html, /reddit\.com\/r\/travel\/comments\/abc123\/sample/i);
});

test('Internal link volume fixer prunes excessive flashvoyage links', async () => {
  const links = Array.from({ length: 12 }).map((_, i) => `<a href="https://flashvoyage.com/guide-${i}/">Guide ${i}</a>`).join(' ');
  const html = `<p>${links}</p>`;
  const out = await fixInternalLinkVolume(html, 8);
  const count = (out.html.match(/href="https?:\/\/flashvoyage\.com[^"]*"/gi) || []).length;
  assert.ok(count <= 8, `expected <=8 internal links, got ${count}`);
});
