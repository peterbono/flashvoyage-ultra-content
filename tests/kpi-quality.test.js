/**
 * kpi-quality.test.js
 * 
 * Automated KPI tests K1-K10 for Evergreen 10/10 quality validation.
 * Each test is a PASS/FAIL check that can run on any article HTML.
 * 
 * Run: node --test tests/kpi-quality.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ─── KPI Test Functions (exported for pipeline use) ─────────────────────────

const FR_STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux',
  'en', 'et', 'ou', 'mais', 'donc', 'car', 'ni', 'que', 'qui',
  'est', 'sont', 'pour', 'par', 'avec', 'dans', 'sur', 'sans',
  'plus', 'pas', 'tout', 'tous', 'cette', 'ces', 'son', 'ses'
]);

/**
 * K1 — Tension dans l'intro (hook Angle Hunter present dans les 500 premiers chars)
 */
export function testK1_TensionIntro(html, angleHook) {
  if (!angleHook) return { status: 'SKIP', message: 'Pas de hook angle disponible' };

  const textOnly = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const intro = textOnly.substring(0, 500).toLowerCase();
  const hookWords = angleHook.toLowerCase()
    .replace(/[.,;:!?—–\-""«»()]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !FR_STOP_WORDS.has(w));

  const rootFr = (w) => w.length <= 5 ? w : w.substring(0, 5);

  const introWords = intro.replace(/[.,;:!?—–\-""«»']/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const introRoots = new Set(introWords.map(rootFr));

  const found = hookWords.filter(w => {
    if (intro.includes(w)) return true;
    const root = rootFr(w);
    return root.length >= 4 && introRoots.has(root);
  });

  const unique = [...new Set(found)];
  const pass = unique.length >= 2;

  return {
    status: pass ? 'PASS' : 'FAIL',
    message: pass
      ? `Intro contient ${unique.length} mots-cles du hook: [${unique.join(', ')}]`
      : `Intro ne contient pas assez de mots-cles de l'angle. Attendus: [${hookWords.join(', ')}]. Trouves: [${unique.join(', ')}]`
  };
}

/**
 * K2 — Arbitrages dans chaque H2 (>= 80% decisionnels)
 */
export function testK2_H2Decisionnels(html) {
  const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gi;
  const exclusionRegex = /questions?\s*fr[eé]quentes?|quick[\s-]*guide|checklist|articles?\s*connexes?|comparatif|ce\s*qu.il\s*faut\s*retenir|FAQ|nos\s*recommandations|ce\s*que\s*les\s*autres|limites?\s*(et\s*)?biais/i;
  const decisionRegex = /arbitrage|choix|choisir|optimis|maximis|vrai|r[eé]alit[eé]|pi[eè]ge|erreur|[eé]viter|strat[eé]gi|planifi|comment|pourquoi|faut.il|versus|vs\b|co[uû]t|prix|budget|danger|risque|limit|biais|secret|meilleur|pire|alternative|dilemme/i;

  const h2s = [];
  let match;
  while ((match = h2Regex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]*>/g, '').trim();
    if (!exclusionRegex.test(text)) {
      h2s.push(text);
    }
  }

  if (h2s.length === 0) return { status: 'SKIP', message: 'Aucun H2 de contenu trouve' };

  const decisional = h2s.filter(h => decisionRegex.test(h));
  const ratio = decisional.length / h2s.length;
  const pass = ratio >= 0.8;
  const nonDec = h2s.filter(h => !decisionRegex.test(h));

  return {
    status: pass ? 'PASS' : 'FAIL',
    ratio: ratio,
    message: pass
      ? `${decisional.length}/${h2s.length} H2 decisionnels (${(ratio * 100).toFixed(0)}%)`
      : `H2 non decisionnel detecte: ${nonDec.map(h => `"${h}"`).join(', ')} (${(ratio * 100).toFixed(0)}% < 80%)`
  };
}

/**
 * K3 — Preuves sourcees >= 2 (blockquotes Reddit, citations inline, blocs arbitrage)
 */
export function testK3_PreuvesSourcees(html) {
  const textOnly = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const blockquotes = (html.match(/<blockquote/gi) || []).length;
  const inlineCitations = (textOnly.match(/\u00ab[\s\u00a0]*[^\u00bb]{5,200}[\s\u00a0]*\u00bb/g) || []).length;
  const fvProofs = (html.match(/data-fv-(?:proof|move="arbitrage")/gi) || []).length;
  const eeatMarkers = (textOnly.match(/selon\s+\w+|d'apr[eè]s\s+\w+|t[eé]moigne|un\s+voyageur|l'auteur\s+pr[eé]cise/gi) || []).length;

  const total = blockquotes + inlineCitations + fvProofs + eeatMarkers;
  const pass = total >= 2;

  return {
    status: pass ? 'PASS' : 'FAIL',
    count: total,
    message: pass
      ? `${total} preuves sourcees (blockquotes:${blockquotes} citations:${inlineCitations} fv-proof:${fvProofs} eeat:${eeatMarkers})`
      : `Seulement ${total} preuves sourcees (minimum 2)`
  };
}

/**
 * K4 — Decisions concretes >= 2 (blocs arbitrage / verdicts explicites)
 */
export function testK4_DecisionsConcretes(html) {
  const textOnly = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const fvArbitrage = (html.match(/data-fv-move="arbitrage"/gi) || []).length;
  const verdictPatterns = (textOnly.match(/notre\s+(?:arbitrage|verdict|conseil|recommandation)|en\s+pratique\s*[:,]\s*\w+|mieux\s+vaut|on\s+recommande|privil[eé]gie\s+\w+\s+si\s+tu/gi) || []).length;
  const siTuPatterns = (textOnly.match(/si\s+tu\s+\w+.*?,\s*(choisis|privil[eé]gie|opte|pr[eé]f[eè]re|[eé]vite|mise\s+sur|pars\s+sur)/gi) || []).length;

  const total = fvArbitrage + verdictPatterns + siTuPatterns;
  const pass = total >= 2;

  return {
    status: pass ? 'PASS' : 'FAIL',
    count: total,
    message: pass
      ? `${total} decisions concretes (arbitrage:${fvArbitrage} verdicts:${verdictPatterns} si-tu:${siTuPatterns})`
      : `Seulement ${total} bloc(s) decision (minimum 2)`
  };
}

/**
 * K5 — CTA affilies precedes de friction (100% des modules)
 */
export function testK5_CTAFriction(html) {
  const frictionRegex = /risque|frais|co[uû]t|perte|urgence|impr[eé]vu|probl[eè]me|pi[eè]ge|attention|danger|d[eé]pense|surprise|cher|[eé]lev[eé]|manqu|arnaqu|vol[eé]|accident|m[eé]dical|h[oô]pital/i;
  const moduleRegex = /<aside\s+class="affiliate-module"/gi;

  const modules = [];
  let m;
  while ((m = moduleRegex.exec(html)) !== null) {
    modules.push(m.index);
  }

  if (modules.length === 0) return { status: 'SKIP', message: 'Aucun module affilie dans l\'article' };

  const textOnly = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  let frictionCount = 0;
  const failures = [];

  modules.forEach((pos, i) => {
    const textBefore = html.substring(Math.max(0, pos - 1500), pos);
    const textBeforeClean = textBefore.replace(/<[^>]*>/g, ' ').substring(-500);
    if (frictionRegex.test(textBeforeClean)) {
      frictionCount++;
    } else {
      const idMatch = html.substring(pos, pos + 200).match(/data-placement-id="([^"]+)"/);
      failures.push(idMatch ? idMatch[1] : `module_${i}`);
    }
  });

  const pass = frictionCount === modules.length;
  return {
    status: pass ? 'PASS' : 'FAIL',
    message: pass
      ? `${modules.length}/${modules.length} modules precedes de friction`
      : `Module(s) non precede(s) de friction: ${failures.join(', ')}`
  };
}

/**
 * K6 — Zero invention factuelle (tokens numeriques dans truth pack)
 */
export function testK6_ZeroInvention(html, allowedNumberTokens) {
  if (!allowedNumberTokens || allowedNumberTokens.length === 0) {
    return { status: 'SKIP', message: 'Pas de truth pack disponible pour la validation' };
  }

  const textOnly = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const articleTokens = textOnly.match(/\d[\d\s,.]*\d|\d+/g) || [];
  const normalizedArticle = articleTokens.map(t => t.replace(/[\s,.]/g, ''));
  const normalizedAllowed = new Set(allowedNumberTokens.map(t => String(t).replace(/[\s,.]/g, '')));

  // Tolerer les "petits" nombres communs (1-31 pour jours/mois, annees)
  const commonNumbers = new Set(['1','2','3','4','5','6','7','8','9','10','11','12',
    '15','20','24','25','30','31','48','72','100','200','2024','2025','2026']);

  const invented = [];
  for (const token of normalizedArticle) {
    if (normalizedAllowed.has(token)) continue;
    if (commonNumbers.has(token)) continue;
    if (token.length <= 1) continue;

    // Tolerance calculs derives (x/y, x*y pour x,y in allowed)
    let isDerived = false;
    for (const a of normalizedAllowed) {
      for (const b of normalizedAllowed) {
        const na = parseFloat(a), nb = parseFloat(b);
        if (isNaN(na) || isNaN(nb) || nb === 0) continue;
        const div = (na / nb).toFixed(1);
        const mul = (na * nb).toFixed(0);
        if (div === parseFloat(token).toFixed(1) || mul === token) {
          isDerived = true;
          break;
        }
      }
      if (isDerived) break;
    }
    if (!isDerived) invented.push(token);
  }

  const uniqueInvented = [...new Set(invented)];
  const pass = uniqueInvented.length === 0;

  return {
    status: pass ? 'PASS' : 'FAIL',
    count: uniqueInvented.length,
    message: pass
      ? `0 token numerique invente (${normalizedArticle.length} verifies)`
      : `Token(s) invente(s): [${uniqueInvented.slice(0, 5).join(', ')}]`
  };
}

/**
 * K7 — Liens internes >= 3
 */
export function testK7_LiensInternes(html) {
  const indexPath = join(ROOT, 'data', 'internal-links.json');
  let hasArticles = false;
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    hasArticles = index.articles && index.articles.length > 2;
  } catch { /* ignore */ }

  const links = (html.match(/href="https?:\/\/flashvoyage\.com[^"]*"/gi) || []).length;

  if (!hasArticles) {
    return { status: 'SKIP', count: links, message: `Base articles trop petite pour liens internes (${links} liens trouves)` };
  }

  const pass = links >= 3;
  return {
    status: pass ? 'PASS' : 'FAIL',
    count: links,
    message: pass
      ? `${links} liens internes flashvoyage.com`
      : `Seulement ${links} liens internes (minimum 3)`
  };
}

/**
 * K8 — Score qualite >= 85%
 */
export async function testK8_ScoreQualite(html, editorialMode = 'evergreen') {
  const { default: QualityAnalyzer } = await import('../quality-analyzer.js');
  const qa = new QualityAnalyzer();
  const result = qa.getGlobalScore(html, editorialMode);
  const score = parseFloat(result.globalScore);
  const pass = score >= 85.0 && result.blockingPassed;

  return {
    status: pass ? 'PASS' : 'FAIL',
    score: score,
    message: pass
      ? `Score ${score}% >= 85%, blocking OK`
      : `Score ${score}% < 85%. SERP=${result.categories.serp.percentage.toFixed(0)}% Links=${result.categories.links.percentage.toFixed(0)}% Content=${result.categories.contentWriting.percentage.toFixed(0)}% Blocking=${result.categories.blocking.percentage.toFixed(0)}%`
  };
}

/**
 * K9 — Sections SERP presentes (>= 2/3 obligatoires)
 */
export function testK9_SectionsSERP(html) {
  const textLower = html.replace(/<[^>]*>/g, ' ').toLowerCase();
  const h2Text = (html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [])
    .map(m => m.replace(/<[^>]*>/g, '').toLowerCase())
    .join(' ');
  const combined = textLower + ' ' + h2Text;

  const sections = [
    { name: 'Ce que les autres ne disent pas', regex: /ce\s+que\s+les\s+autres.*ne\s+disent?\s+pas|ne\s+disent?\s+pas\s+explicitement/i },
    { name: 'Limites et biais', regex: /limites?\s*(et\s*)?biais/i },
    { name: 'Erreurs frequentes', regex: /erreurs?\s*(fr[eé]quentes?|courantes?|[aà]\s*[eé]viter)|pi[eè]ges?\s*(fr[eé]quents?|courants?|[aà]\s*[eé]viter)/i }
  ];

  const found = sections.filter(s => s.regex.test(combined));
  const missing = sections.filter(s => !s.regex.test(combined));
  const pass = found.length >= 2;

  return {
    status: pass ? 'PASS' : 'FAIL',
    count: found.length,
    message: pass
      ? `${found.length}/3 sections SERP presentes: ${found.map(s => s.name).join(', ')}`
      : `Sections SERP manquantes: ${missing.map(s => s.name).join(', ')} (${found.length}/3 < 2)`
  };
}

/**
 * K10 — Quick Guide present
 */
export function testK10_QuickGuide(html) {
  const hasClass = /class="[^"]*quick[-_]?guide[^"]*"/i.test(html);
  const h2h3Text = (html.match(/<h[23][^>]*>(.*?)<\/h[23]>/gi) || [])
    .map(m => m.replace(/<[^>]*>/g, ''))
    .join(' ');
  const hasHeading = /quick\s*guide|checklist|guide\s*rapide|en\s*bref|l.essentiel|points?\s*cl[eé]s/i.test(h2h3Text);
  const hasInText = /points?\s*cl[eé]s|quick[\s-]*guide|ce\s*qu.il\s*faut\s*savoir/i.test(html.replace(/<[^>]*>/g, ' '));

  const pass = hasClass || hasHeading || hasInText;

  return {
    status: pass ? 'PASS' : 'FAIL',
    message: pass
      ? `Quick Guide present (class:${hasClass} heading:${hasHeading} text:${hasInText})`
      : 'Quick Guide absent'
  };
}

/**
 * Run all KPI tests on an article HTML
 */
export async function runAllKPITests(html, options = {}) {
  const { angleHook, allowedNumberTokens, editorialMode, title } = options;
  const htmlWithTitle = title ? `<h1>${title}</h1>\n${html}` : html;

  const results = {
    K1: testK1_TensionIntro(html, angleHook),
    K2: testK2_H2Decisionnels(html),
    K3: testK3_PreuvesSourcees(html),
    K4: testK4_DecisionsConcretes(html),
    K5: testK5_CTAFriction(html),
    K6: testK6_ZeroInvention(html, allowedNumberTokens),
    K7: testK7_LiensInternes(html),
    K8: await testK8_ScoreQualite(htmlWithTitle, editorialMode || 'evergreen'),
    K9: testK9_SectionsSERP(html),
    K10: testK10_QuickGuide(html)
  };

  const passed = Object.values(results).filter(r => r.status === 'PASS').length;
  const failed = Object.values(results).filter(r => r.status === 'FAIL').length;
  const skipped = Object.values(results).filter(r => r.status === 'SKIP').length;

  return { results, summary: { passed, failed, skipped, total: 10 } };
}

// ─── Node.js Test Runner ────────────────────────────────────────────────────

const SAMPLE_HTML_GOOD = `
<h1>Voyager au Japon : Quand voir les cerisiers sans la foule</h1>
<div class="quick-guide"><h3>Points clés de ce guide</h3><p>Destination: Japon. Budget: 80 euros/jour. Duree: 14 jours.</p></div>
<p>Tu arrives a Tokyo avec 1200 euros en poche et une liste de temples a visiter qui demanderait trois mois. Le dilemme est la : optimiser chaque journee sans transformer ton voyage en marathon logistique. Si tu choisis mal ta periode, tu risques de payer 50% plus cher pour voir des cerisiers fanes.</p>
<h2>Pourquoi choisir entre Tokyo et Kyoto est un faux dilemme</h2>
<p>En pratique, choisis Tokyo si ton budget est serre — les transports y sont plus denses et tu economises sur les inter-city. Un voyageur resume : \u00ab J'ai depense 40 euros de moins par jour en restant a Tokyo \u00bb. Selon un temoignage Reddit, le JR Pass ne vaut le coup qu'a partir de 3 allers-retours.</p>
<h2>Les erreurs frequentes qui coutent cher aux voyageurs au Japon</h2>
<p>Attention au piege du cash : le Japon reste une societe ou le liquide domine. Si tu retires au distributeur sans carte adaptee, les frais bancaires atteignent 5 euros par retrait. Mieux vaut privilegier une carte sans frais a l'etranger.</p>
<aside class="affiliate-module" data-placement-id="flights"><h3>Utile si tu planifies tes vols</h3><p>Les frais de vol varient selon les compagnies.</p></aside>
<h2>Ce que les autres guides ne disent pas sur les cerisiers</h2>
<p>La floraison varie de 2 semaines selon les regions. Selon un voyageur : \u00ab A Aomori fin avril, j'etais seul sous les cerisiers \u00bb. Le risque est de planifier autour de Tokyo uniquement et de rater les spots du nord. En revanche, si tu privilegies Kanazawa, tu combines culture et nature sans la foule.</p>
<h2>Limites et biais de cet article</h2>
<p>Cet article se base sur des temoignages Reddit de 2024-2025, principalement de voyageurs occidentaux. Les prix et conditions evoluent — verifie toujours les tarifs actuels avant de reserver.</p>
<h2>Ce qu'il faut retenir</h2>
<p>Si tu veux voir les cerisiers sans la foule, evite la Golden Week et privilegies le nord du Japon. Notre arbitrage : pars fin mars pour Tokyo, mi-avril pour le Tohoku. Budget minimal : 80 euros par jour en mode economique.</p>
`;

describe('KPI Tests K1-K10 (unit tests)', () => {

  describe('K1 — Tension Intro', () => {
    it('PASS si >= 2 mots-cles du hook dans intro', () => {
      const result = testK1_TensionIntro(SAMPLE_HTML_GOOD, 'optimiser budget cerisiers Tokyo Japon');
      assert.equal(result.status, 'PASS');
    });

    it('FAIL si intro ne contient pas le hook', () => {
      const result = testK1_TensionIntro(SAMPLE_HTML_GOOD, 'securite sanitaire medicale vaccination');
      assert.equal(result.status, 'FAIL');
    });

    it('SKIP si pas de hook', () => {
      const result = testK1_TensionIntro(SAMPLE_HTML_GOOD, null);
      assert.equal(result.status, 'SKIP');
    });
  });

  describe('K2 — H2 Decisionnels >= 80%', () => {
    it('PASS si >= 80% des H2 contenu sont decisionnels', () => {
      const result = testK2_H2Decisionnels(SAMPLE_HTML_GOOD);
      assert.equal(result.status, 'PASS');
    });

    it('FAIL si H2 purement descriptifs', () => {
      const html = '<h2>Hebergement</h2><p>text</p><h2>Transport</h2><p>text</p><h2>Gastronomie</h2><p>text</p>';
      const result = testK2_H2Decisionnels(html);
      assert.equal(result.status, 'FAIL');
    });
  });

  describe('K3 — Preuves Sourcees >= 2', () => {
    it('PASS si >= 2 preuves (citations + attribution)', () => {
      const result = testK3_PreuvesSourcees(SAMPLE_HTML_GOOD);
      assert.equal(result.status, 'PASS');
    });

    it('FAIL si 0 preuves', () => {
      const html = '<p>Un article sans aucune preuve ni citation.</p>';
      const result = testK3_PreuvesSourcees(html);
      assert.equal(result.status, 'FAIL');
    });
  });

  describe('K4 — Decisions Concretes >= 2', () => {
    it('PASS si verdicts/arbitrages presents', () => {
      const result = testK4_DecisionsConcretes(SAMPLE_HTML_GOOD);
      assert.equal(result.status, 'PASS');
    });

    it('FAIL si aucun arbitrage', () => {
      const html = '<p>Description neutre sans aucune prise de position ou verdict.</p>';
      const result = testK4_DecisionsConcretes(html);
      assert.equal(result.status, 'FAIL');
    });
  });

  describe('K5 — CTA Friction', () => {
    it('PASS si module precede de friction', () => {
      const result = testK5_CTAFriction(SAMPLE_HTML_GOOD);
      assert.equal(result.status, 'PASS');
    });

    it('SKIP si aucun module affilie', () => {
      const html = '<p>Article sans module affilie.</p>';
      const result = testK5_CTAFriction(html);
      assert.equal(result.status, 'SKIP');
    });
  });

  describe('K6 — Zero Invention', () => {
    it('PASS si tous les tokens sont dans le truth pack', () => {
      const result = testK6_ZeroInvention(
        '<p>Le budget est de 1200 euros pour 14 jours, soit 80 euros par jour. Les frais sont de 5 euros par retrait.</p>',
        ['1200', '14', '80', '5', '50']
      );
      assert.equal(result.status, 'PASS');
    });

    it('FAIL si token invente', () => {
      const result = testK6_ZeroInvention(
        '<p>Le budget est de 3500 euros.</p>',
        ['1200', '14']
      );
      assert.equal(result.status, 'FAIL');
    });

    it('SKIP si pas de truth pack', () => {
      const result = testK6_ZeroInvention('<p>text</p>', null);
      assert.equal(result.status, 'SKIP');
    });
  });

  describe('K7 — Liens Internes >= 3', () => {
    it('detecte les liens flashvoyage', () => {
      const html = '<a href="https://flashvoyage.com/guide-japon">Guide</a> <a href="https://flashvoyage.com/budget">Budget</a> <a href="https://flashvoyage.com/tokyo">Tokyo</a>';
      const result = testK7_LiensInternes(html);
      assert.ok(['PASS', 'SKIP'].includes(result.status));
      // count is always present now
      assert.ok(result.count !== undefined, 'count should be defined');
    });
  });

  describe('K8 — Score Qualite >= 85%', () => {
    it('retourne un score numerique', async () => {
      const result = await testK8_ScoreQualite(SAMPLE_HTML_GOOD, 'evergreen');
      assert.ok(typeof result.score === 'number');
      assert.ok(result.score >= 0 && result.score <= 100);
    });
  });

  describe('K9 — Sections SERP', () => {
    it('PASS si >= 2/3 sections presentes', () => {
      const result = testK9_SectionsSERP(SAMPLE_HTML_GOOD);
      assert.equal(result.status, 'PASS');
    });

    it('FAIL si 0 section SERP', () => {
      const html = '<h2>Introduction</h2><p>text</p><h2>Conclusion</h2><p>text</p>';
      const result = testK9_SectionsSERP(html);
      assert.equal(result.status, 'FAIL');
    });
  });

  describe('K10 — Quick Guide', () => {
    it('PASS si quick-guide class present', () => {
      const result = testK10_QuickGuide(SAMPLE_HTML_GOOD);
      assert.equal(result.status, 'PASS');
    });

    it('FAIL si aucun quick guide', () => {
      const html = '<h2>Section</h2><p>Contenu sans guide.</p>';
      const result = testK10_QuickGuide(html);
      assert.equal(result.status, 'FAIL');
    });
  });

  describe('runAllKPITests — integration', () => {
    it('retourne un summary avec passed/failed/skipped', async () => {
      const { results, summary } = await runAllKPITests(SAMPLE_HTML_GOOD, {
        angleHook: 'optimiser budget cerisiers Tokyo Japon',
        allowedNumberTokens: ['1200', '14', '80', '5', '50', '40'],
        editorialMode: 'evergreen',
        title: 'Voyager au Japon : Quand voir les cerisiers sans la foule'
      });
      assert.equal(summary.total, 10);
      assert.ok(summary.passed + summary.failed + summary.skipped === 10);
      console.log(`   KPI Summary: ${summary.passed} PASS, ${summary.failed} FAIL, ${summary.skipped} SKIP`);
      Object.entries(results).forEach(([k, v]) => {
        console.log(`   ${k}: ${v.status} — ${v.message}`);
      });
    });
  });
});
