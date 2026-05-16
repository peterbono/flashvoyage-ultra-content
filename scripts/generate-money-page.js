#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * MONEY PAGE GENERATOR — high-commercial-intent comparison articles.
 *
 * Distinct from the daily editorial pipeline (enhanced-ultra-generator.js).
 * Targets eSIM / SIM / affiliate-anchored keywords that convert. Pre-seeded
 * with a 6-entry queue (Thaïlande, Japon, Vietnam, Bali, Philippines, Cambodge).
 *
 * Pipeline:
 *   1. Read data/money-page-queue.json — pick next pending entry (oldest
 *      scheduledFor first), or honor --entry-id flag.
 *   2. Resolve Travelpayouts tracked links for partners that support tracking
 *      (Airalo). Holafly stays as a plain honest direct link (no code).
 *   3. Call Claude Haiku 4.5 with a STRICT brief (see MONEY_PAGE_BRIEF below):
 *      - hero CTA (Airalo tracked link)
 *      - 3-column comparison table (Item A / Item B / SIM locale)
 *      - "Verdict Florian" tranchée
 *      - 5-question FAQ block (FAQ schema-ready)
 *      - 1800-2400 words, no editorial fluff ("X pièges que les blogs cachent" etc.)
 *   4. Inject hero CTA + comparison table + Verdict + FAQ into final HTML.
 *   5. Run `assertContentSafeToPublish` (mandatory).
 *   6. POST to WP under category "Money Pages" + tag "money-page" (unless --dry-run).
 *   7. Mark queue entry `published: true`.
 *
 * Flags:
 *   --dry-run            (default) — no WP write; print article to stdout
 *   --publish            — write to WordPress
 *   --entry-id=<id>      — force a specific queue entry
 *
 * Env:
 *   ANTHROPIC_API_KEY (required for non-offline)
 *   TRAVELPAYOUTS_API_TOKEN (optional; tracked links degrade gracefully)
 *   WORDPRESS_URL / WORDPRESS_USERNAME / WORDPRESS_APP_PASSWORD (publish only)
 *   MONEY_PAGE_DRY_RUN=1 (alt to --dry-run, set by workflow)
 *   FORCE_OFFLINE=1 (uses a stub article, useful for unit smoke tests)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateWithClaude, isAnthropicAvailable } from '../anthropic-client.js';
import { createTrackedLink } from '../intelligence/travelpayouts-client.js';
import { assertContentSafeToPublish } from '../intelligence/content-guardrails.js';
import { FORCE_OFFLINE, WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const QUEUE_PATH = join(REPO_ROOT, 'data', 'money-page-queue.json');

const AIRALO_CAMPAIGN_ID = 541;

// ---------------------------------------------------------------------------
// SYSTEM PROMPT (brief). French. Tunable without rewriting the script.
// ---------------------------------------------------------------------------
export const MONEY_PAGE_BRIEF = `Tu es Florian, fondateur de FlashVoyage.com. Tu écris une "money page" — un article de comparaison eSIM/SIM ultra-commercial pour un voyageur francophone qui hésite entre 2-3 solutions de connectivité dans un pays d'Asie.

OBJECTIF UNIQUE: convertir vers Airalo (lien affilié tracké). Holafly = mention honnête en lien direct, SANS code promo. INTERDIT d'inventer un code, un prix barré ou un avis chiffré. Prix réels publics uniquement, verdict tranché.

CONTRAINTES DURES (le non-respect = rejet automatique):

1. LONGUEUR: 1800 à 2400 mots. Compte tes mots. En dessous de 1800: trop léger. Au-dessus de 2400: tu dilues.

2. STRUCTURE OBLIGATOIRE (dans cet ordre, sans rien intercaler):
   <article>
     <!-- HERO CTA (premier élément visible) -->
     <div class="fv-hero-cta">[verdict en 2 phrases + bouton CTA vers Airalo (partenaire tracké). AUCUN code promo.]</div>

     <!-- INTRO 150-200 mots -->
     <p>[Pose le problème en 4-5 phrases. Mentionne le voyageur-cible (durée du trip, cas d'usage type). PAS de "tu vas découvrir X choses que les blogs cachent". PAS de "voici LA vérité". PAS de fluff.]</p>

     <!-- TABLEAU COMPARATIF (3 colonnes) -->
     <h2>Comparatif: [Item A] vs [Item B] vs [Item local/SIM locale]</h2>
     <table class="fv-money-comparison">
       <thead><tr><th></th><th>[Item A]</th><th>[Item B]</th><th>[Item C: SIM locale]</th></tr></thead>
       <tbody>
         <tr><th>Prix moyen (7j / 10 Go)</th><td>[€]</td><td>[€]</td><td>[€]</td></tr>
         <tr><th>Activation</th><td>[QR scan instant]</td><td>[QR scan instant]</td><td>[boutique aéroport]</td></tr>
         <tr><th>Couverture 4G/5G</th><td>...</td><td>...</td><td>...</td></tr>
         <tr><th>Hotspot / partage</th><td>...</td><td>...</td><td>...</td></tr>
         <tr><th>Recharge in-app</th><td>...</td><td>...</td><td>...</td></tr>
         <tr><th>Idéal pour</th><td>[long trip / data lourde]</td><td>[short trip / simplicité]</td><td>[trip > 1 mois]</td></tr>
       </tbody>
     </table>

     <!-- DÉTAIL PAR SOLUTION -->
     <h2>[Item A] — [angle court 5 mots]</h2>
     <p>[200-300 mots. Forces, faiblesses concrètes, prix réel cité, avec qui ça matche.]</p>

     <h2>[Item B] — [angle court]</h2>
     <p>[200-300 mots.]</p>

     <h2>[Item C: SIM locale] — [angle court]</h2>
     <p>[150-250 mots. Reconnais que la SIM locale peut battre l'eSIM en prix brut sur les longs séjours, mais souligne le coût caché en temps + risque arrivée.]</p>

     <!-- VERDICT FLORIAN (le bloc qui convertit) -->
     <div class="fv-verdict">
       <h2>Verdict Florian</h2>
       <p><strong>Court séjour (≤14 jours):</strong> [recommandation tranchée, 2 phrases, lien partenaire].</p>
       <p><strong>Long séjour (>14 jours) / nomade:</strong> [recommandation tranchée, 2 phrases, lien partenaire].</p>
       <p><strong>Tu vises le prix brut, pas le confort:</strong> [SIM locale + condition].</p>
     </div>

     <!-- FAQ SCHEMA-READY (5 questions exactes) -->
     <h2>FAQ</h2>
     <div class="fv-faq">
       <h3>Question 1?</h3><p>Réponse 50-100 mots.</p>
       <h3>Question 2?</h3><p>Réponse 50-100 mots.</p>
       <h3>Question 3?</h3><p>Réponse 50-100 mots.</p>
       <h3>Question 4?</h3><p>Réponse 50-100 mots.</p>
       <h3>Question 5?</h3><p>Réponse 50-100 mots.</p>
     </div>
   </article>

3. POSITION ÉDITORIALE (par défaut, sauf consigne contraire):
   - Holafly = bullish courts séjours (≤14j): data illimitée, simplicité. Prix premium réel, AUCUN code.
   - Airalo = bullish pour les longs séjours (>14 jours) et le nomade digital: granularité des forfaits, recharge facile, top-up régional.
   - SIM locale = mention objective: meilleur prix brut sur >1 mois, mais friction d'achat (queue aéroport, KYC, parfois passeport scanné).
   - Tu n'es PAS neutre. Tu tranches. Le lecteur veut un avis, pas un pour/contre stérile.

4. PRIX:
   - Si des prix te sont fournis dans le contexte (placeholders %%PRICE_*%%), utilise-les TELS QUELS.
   - Sinon, donne une fourchette honnête ("autour de 18-22€ pour 7j/10Go en 2026") — JAMAIS un chiffre précis inventé.
   - JAMAIS de prix obsolète type "29,90€ exactement".

5. INTERDICTIONS ABSOLUES:
   - Pas de "X pièges que les blogs cachent", "la vérité que personne ne te dit", "ce que les opérateurs ne veulent pas que tu saches", "voici pourquoi tout le monde se trompe". Filtre éditorial dur.
   - Pas de "découvre", "plonge", "ravir", "incontournable", "merveilleux".
   - Pas de section "À propos de l'auteur" / "Mon expérience perso" verbeuse.
   - Pas de markers [VERIFY], [TODO], [FIXME], [PLACEHOLDER], [AFFILIATE:xxx]. Si une donnée te manque, propose une fourchette ou omets — JAMAIS de placeholder visible.
   - Pas de schéma JSON-LD inline (le finalizer s'en charge).
   - Pas d'emoji dans le corps.

6. LIENS AFFILIÉS:
   - Pour CHAQUE partenaire commercial cité, mets un lien <a> avec attribut data-fv-partner="<slug>".
   - Slug Airalo: data-fv-partner="airalo-{country-code}". Slug Holafly: data-fv-partner="holafly-{country-code}".
   - URLs fournies dans le contexte (placeholders %%URL_AIRALO%%, %%URL_HOLAFLY%%) — utilise les EXACTES, ne les modifie pas.
   - AUCUN code Holafly n'existe. Ne JAMAIS inventer code/prix barré/remise.
   - Au moins 4 liens affiliés au total dans l'article (pas 12, c'est du spam, pas 1, c'est sous-monétisé).

7. TON:
   - 1ère personne ("je", "j'ai testé") = OK, sobre. Une mention max d'expérience perso.
   - 2ème personne ("tu") pour adresser le lecteur. Pas de "vous".
   - Phrases courtes. Pas de subordonnées en cascade. Lisibilité Flesch FR > 60 estimé.
   - Vocabulaire concret: "QR code", "scan", "data illimitée", "5G", "hotspot", "top-up". Pas de jargon marketing.

8. FORMAT DE SORTIE:
   - Tu retournes UNIQUEMENT le bloc HTML <article>...</article>. Aucun préambule, aucune explication, aucun markdown.
   - Si tu inclus un mot avant ou après <article>, c'est un échec.

Tu es prêt. Génère la money page selon le contexte fourni par l'utilisateur. Sois tranché. Sois utile. Sois court là où il faut, dense là où ça compte.`;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseFlags(argv) {
  const flags = {
    dryRun: true, // default safe
    publish: false,
    entryId: null,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--publish') { flags.publish = true; flags.dryRun = false; }
    else if (arg.startsWith('--entry-id=')) flags.entryId = arg.slice('--entry-id='.length);
    else if (arg === '--entry-id') { /* next arg form not supported, keep simple */ }
  }
  // Workflow env override
  if (process.env.MONEY_PAGE_DRY_RUN === '1') {
    flags.dryRun = true;
    flags.publish = false;
  }
  if (process.env.MONEY_PAGE_ENTRY_ID && !flags.entryId) {
    flags.entryId = process.env.MONEY_PAGE_ENTRY_ID;
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------
async function readQueue() {
  const raw = await readFile(QUEUE_PATH, 'utf8');
  return JSON.parse(raw);
}

async function writeQueue(data) {
  await writeFile(QUEUE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function pickEntry(queueData, entryId) {
  const entries = queueData.queue || [];
  if (entryId) {
    const e = entries.find((x) => x.id === entryId);
    if (!e) throw new Error(`Queue entry not found: ${entryId}`);
    return e;
  }
  const today = new Date().toISOString().slice(0, 10);
  const pending = entries
    .filter((e) => !e.published)
    .filter((e) => !e.scheduledFor || e.scheduledFor <= today)
    .sort((a, b) => String(a.scheduledFor || '').localeCompare(String(b.scheduledFor || '')));
  return pending[0] || null;
}

// ---------------------------------------------------------------------------
// Country code mapping (for affiliate placeholder slugs)
// ---------------------------------------------------------------------------
const COUNTRY_CODE = {
  'Thaïlande': 'thailand',
  'Japon': 'japan',
  'Vietnam': 'vietnam',
  'Bali (Indonésie)': 'indonesia',
  'Indonésie': 'indonesia',
  'Philippines': 'philippines',
  'Cambodge': 'cambodia',
};

const HOLAFLY_BASE_URL = {
  thailand: 'https://esim.holafly.com/fr/esim-thailande/',
  japan: 'https://esim.holafly.com/fr/esim-japon/',
  vietnam: 'https://esim.holafly.com/fr/esim-vietnam/',
  indonesia: 'https://esim.holafly.com/fr/esim-indonesie/',
  philippines: 'https://esim.holafly.com/fr/esim-philippines/',
  cambodia: 'https://esim.holafly.com/fr/esim-cambodge/',
};

const AIRALO_BASE_URL = {
  thailand: 'https://www.airalo.com/thailand-esim',
  japan: 'https://www.airalo.com/japan-esim',
  vietnam: 'https://www.airalo.com/vietnam-esim',
  indonesia: 'https://www.airalo.com/indonesia-esim',
  philippines: 'https://www.airalo.com/philippines-esim',
  cambodia: 'https://www.airalo.com/cambodia-esim',
};

// ---------------------------------------------------------------------------
// Affiliate link resolution
// ---------------------------------------------------------------------------
async function resolveAffiliateLinks(entry) {
  const code = COUNTRY_CODE[entry.country] || 'asia';
  const subId = `${entry.targetSlug}-mp`;

  const airaloTarget = AIRALO_BASE_URL[code] || 'https://www.airalo.com/asia-esim';
  const holaflyTarget = HOLAFLY_BASE_URL[code] || 'https://esim.holafly.com/fr/esim-asie/';

  // Airalo via Travelpayouts (graceful degradation: returns fallbackUrl on failure)
  let airaloUrl = airaloTarget;
  try {
    const tp = await createTrackedLink({
      campaignId: AIRALO_CAMPAIGN_ID,
      targetUrl: airaloTarget,
      subId,
    });
    airaloUrl = tp.success && tp.partnerUrl ? tp.partnerUrl : (tp.fallbackUrl || airaloTarget);
    if (tp.success) console.log(`  ✅ TP tracked Airalo link (cached=${tp.cached})`);
    else console.log(`  ⚠️  TP fallback for Airalo (${tp.error || 'unknown'})`);
  } catch (err) {
    console.log(`  ⚠️  TP error for Airalo: ${err.message}`);
  }

  // Holafly: not in TP campaigns subscribed → plain direct URL, NO promo code (no partnership exists).
  const holaflyUrl = holaflyTarget;

  return {
    countryCode: code,
    airaloUrl,
    holaflyUrl,
    subId,
  };
}

// ---------------------------------------------------------------------------
// User-prompt builder
// ---------------------------------------------------------------------------
function buildUserPrompt(entry, links) {
  const items = (entry.comparisonItems || []).join(' / ');
  const code = links.countryCode;
  const tripDays = entry.tripDurationDays || 14;
  const discount = (entry.discountCode && entry.discountCode !== 'FLASH5') ? entry.discountCode : null;

  return `Génère une money page pour FlashVoyage.

CONTEXTE:
- Pays: ${entry.country} (code: ${code})
- Mot-clé principal: ${entry.primaryKeyword}
- Slug cible: ${entry.targetSlug}
- Items à comparer: ${items}
- Durée du trip de référence: ${tripDays} jours
${discount ? `- Code Holafly (RÉEL, vérifié): ${discount}` : '- AUCUN code Holafly. Ne pas en inventer.'}

URLS À UTILISER (telles quelles, ne les modifie pas):
- %%URL_AIRALO%% = ${links.airaloUrl}
- %%URL_HOLAFLY%% = ${links.holaflyUrl}

SLUGS PARTENAIRES (pour data-fv-partner):
- airalo-${code}
- holafly-${code}

POSITION ÉDITORIALE:
- ${tripDays <= 14 ? 'Trip court → bullish Holafly en recommandation principale, Airalo en alternative pour ceux qui veulent un forfait granulaire.' : 'Trip long → bullish Airalo en recommandation principale, Holafly comme option simplicité court séjour.'}
- SIM locale (${entry.comparisonItems[2] || 'opérateur local'}) = honnête sur le prix brut mais souligne la friction.

TITRE: génère un H1 court (50-65 chars), inclut "${entry.primaryKeyword}" naturellement, finit par "2026" ou "[année 2026]".

Tu retournes UNIQUEMENT le bloc <article>...</article>. Le H1 va à l'intérieur en <h1> juste avant le hero CTA.`;
}

// ---------------------------------------------------------------------------
// Stub article (FORCE_OFFLINE / smoke tests — no API call)
// ---------------------------------------------------------------------------
function buildStubArticle(entry, links) {
  const code = links.countryCode;
  const items = entry.comparisonItems || ['Holafly', 'Airalo', 'SIM locale'];
  return `<article>
<h1>Meilleur eSIM ${entry.country} 2026: comparatif Holafly vs Airalo</h1>
<div class="fv-hero-cta"><p>En 2026 pour ${entry.country}: Airalo est mon choix recommandé (forfaits flexibles, lien vérifié). Holafly = option premium data illimitée. <a href="${links.airaloUrl}" data-fv-partner="airalo-${code}">Voir les forfaits Airalo ${entry.country}</a></p></div>
<p>Tu pars en ${entry.country} ${entry.tripDurationDays || 14} jours et tu te demandes quelle eSIM choisir. La réponse dépend de deux choses: la durée de ton séjour et ton tolérance à la friction administrative. Cet article tranche.</p>
<h2>Comparatif: ${items[0]} vs ${items[1]} vs ${items[2] || 'SIM locale'}</h2>
<table class="fv-money-comparison"><thead><tr><th></th><th>${items[0]}</th><th>${items[1]}</th><th>${items[2] || 'SIM locale'}</th></tr></thead><tbody>
<tr><th>Prix 7j/10Go</th><td>~22€</td><td>~18€</td><td>~10€</td></tr>
<tr><th>Activation</th><td>QR instant</td><td>QR instant</td><td>boutique</td></tr>
<tr><th>Idéal pour</th><td>court séjour</td><td>long séjour</td><td>>1 mois</td></tr>
</tbody></table>
<p>(stub article — generated in offline mode)</p>
<div class="fv-verdict"><h2>Verdict Florian</h2>
<p><strong>Court séjour (≤14 jours):</strong> Holafly pour la data illimitée (<a href="${links.holaflyUrl}" data-fv-partner="holafly-${code}">voir Holafly ${entry.country}</a>) ou Airalo pour un forfait calibré.</p>
<p><strong>Long séjour:</strong> <a href="${links.airaloUrl}" data-fv-partner="airalo-${code}">Airalo ${entry.country}</a>.</p>
</div>
<h2>FAQ</h2><div class="fv-faq">
<h3>Mon iPhone est-il compatible eSIM en ${entry.country}?</h3><p>Oui à partir du iPhone XS.</p>
<h3>Holafly propose-t-il un code de réduction&nbsp;?</h3><p>Pas de code partenaire FlashVoyage. Vérifie les promotions officielles sur le site Holafly.</p>
<h3>Airalo ou Holafly pour 7 jours?</h3><p>Holafly pour la simplicité.</p>
<h3>Puis-je faire du hotspot?</h3><p>Oui sur les deux.</p>
<h3>SIM locale moins chère?</h3><p>Oui au-delà d'un mois.</p>
</div>
</article>`;
}

// ---------------------------------------------------------------------------
// Generate the article HTML via Claude
// ---------------------------------------------------------------------------
async function generateArticleHtml(entry, links) {
  if (FORCE_OFFLINE || !isAnthropicAvailable()) {
    console.log('  ⚠️  Anthropic offline / unavailable — using stub article.');
    return buildStubArticle(entry, links);
  }
  const userPrompt = buildUserPrompt(entry, links);
  const html = await generateWithClaude(MONEY_PAGE_BRIEF, userPrompt, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 6500,
    temperature: 0.55,
    trackingStep: 'money-page-generation',
  });
  // Strip any preamble, keep only <article>...</article>
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  if (!m) {
    throw new Error('Claude output did not include a complete <article>...</article> block.');
  }
  return m[0];
}

// ---------------------------------------------------------------------------
// Title extraction (pull H1 out for WP `title` field)
// ---------------------------------------------------------------------------
function extractTitle(html, fallback) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return fallback;
  return m[1].replace(/<[^>]+>/g, '').trim();
}

// ---------------------------------------------------------------------------
// Verdict block extraction (for dry-run preview)
// ---------------------------------------------------------------------------
function extractVerdictBlock(html) {
  const m = html.match(/<div class="fv-verdict">[\s\S]*?<\/div>/i);
  return m ? m[0] : '(no verdict block found)';
}

// ---------------------------------------------------------------------------
// Word count (rough — strips tags)
// ---------------------------------------------------------------------------
function wordCount(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.split(' ').filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// WP category/tag get-or-create
// ---------------------------------------------------------------------------
async function getOrCreateTerm(axios, auth, kind, name) {
  const url = `${WORDPRESS_URL}/wp-json/wp/v2/${kind}`;
  try {
    const res = await axios.get(`${url}?search=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const found = res.data.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const created = await axios.post(url, { name }, {
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    });
    return created.data.id;
  } catch (err) {
    console.warn(`  ⚠️  getOrCreateTerm(${kind}, ${name}) failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Publish to WordPress (gated by guardrails)
// ---------------------------------------------------------------------------
async function publishToWordPress({ title, content, excerpt, slug }) {
  if (!WORDPRESS_URL || !WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD) {
    throw new Error('WORDPRESS_URL / WORDPRESS_USERNAME / WORDPRESS_APP_PASSWORD must be set for --publish.');
  }
  const axios = (await import('axios')).default;
  const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');

  const categoryId = await getOrCreateTerm(axios, auth, 'categories', 'Money Pages');
  const tagId = await getOrCreateTerm(axios, auth, 'tags', 'money-page');

  const wordpressData = {
    title,
    slug,
    content,
    status: process.env.FORCE_WP_STATUS || 'publish',
    excerpt: excerpt || '',
    categories: categoryId ? [categoryId] : [],
    tags: tagId ? [tagId] : [],
    meta: {
      description: excerpt || '',
      fv_money_page: '1',
    },
  };

  // MANDATORY guardrail — same gate as enhanced-ultra-generator
  assertContentSafeToPublish(wordpressData, { context: 'generate-money-page:publish' });

  const res = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, wordpressData, {
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
  });
  return { id: res.data.id, link: res.data.link };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const flags = parseFlags(process.argv);
  console.log('🪙 money-page generator');
  console.log(`   mode: ${flags.dryRun ? 'DRY-RUN' : 'PUBLISH'}`);
  if (flags.entryId) console.log(`   entry-id: ${flags.entryId}`);

  const queueData = await readQueue();
  const entry = pickEntry(queueData, flags.entryId);
  if (!entry) {
    console.log('   ⏭️  No pending queue entry for today — exiting clean.');
    return;
  }
  console.log(`   entry: ${entry.id} (${entry.country}, kw="${entry.primaryKeyword}")`);

  // 1. Resolve affiliate links
  console.log('🔗 Resolving affiliate links…');
  const links = await resolveAffiliateLinks(entry);

  // 2. Generate via Claude
  console.log('✍️  Generating article via Claude Haiku 4.5…');
  const articleHtml = await generateArticleHtml(entry, links);
  const wc = wordCount(articleHtml);
  const title = extractTitle(articleHtml, `Meilleur eSIM ${entry.country} 2026`);
  console.log(`   title: ${title}`);
  console.log(`   word count: ${wc} (target 1800-2400)`);

  // 3. Pre-publish guardrail (also runs again inside publishToWordPress)
  console.log('🛡️  Running content guardrails…');
  assertContentSafeToPublish({ title, content: articleHtml, excerpt: '' }, { context: 'generate-money-page:dry-check' });
  console.log('   ✅ guardrails passed');

  if (flags.dryRun) {
    console.log('\n--- DRY RUN OUTPUT ---');
    console.log(`TITLE: ${title}`);
    const text = articleHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`FIRST 200 WORDS:\n${text.split(' ').slice(0, 200).join(' ')}…`);
    console.log(`\nVERDICT BLOCK:\n${extractVerdictBlock(articleHtml)}`);
    console.log('--- END DRY RUN ---\n');
    console.log('🚫 dry-run: NOT writing to WordPress, NOT marking queue entry.');
    return;
  }

  // 4. Publish
  console.log('📝 Publishing to WordPress…');
  const published = await publishToWordPress({
    title,
    content: articleHtml,
    excerpt: '',
    slug: entry.targetSlug,
  });
  console.log(`   ✅ published: ${published.link} (id=${published.id})`);

  // 4b. Featured image (cover) — money pages shipped without one until 2026-05.
  // Non-fatal: a missing cover shouldn't block the publish or the queue mark.
  try {
    const { setFeaturedImage } = await import('./set-featured-image.mjs');
    const imgQuery = `${entry.country} travel smartphone connectivity`;
    const imgAlt = `${entry.primaryKeyword} — voyage et connexion mobile`;
    console.log(`🖼️  Setting cover image (query="${imgQuery}")…`);
    await setFeaturedImage(published.id, imgQuery, imgAlt);
  } catch (imgErr) {
    console.warn(`   ⚠️  cover image step failed (non-fatal): ${imgErr.message}`);
  }

  // 5. Mark queue entry
  const idx = queueData.queue.findIndex((e) => e.id === entry.id);
  if (idx !== -1) {
    queueData.queue[idx].published = true;
    queueData.queue[idx].published_at = new Date().toISOString();
    queueData.queue[idx].published_url = published.link;
    queueData.queue[idx].published_wp_id = published.id;
    await writeQueue(queueData);
    console.log(`   ✅ queue entry ${entry.id} marked published.`);
  }
}

// ---------------------------------------------------------------------------
// Entry point — only run when invoked directly (not when imported by a smoke
// test). Detection is via import.meta.url comparison with process.argv[1].
// ---------------------------------------------------------------------------
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           import.meta.url.endsWith('/generate-money-page.js') &&
           process.argv[1] && process.argv[1].endsWith('generate-money-page.js');
  } catch { return false; }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error('❌ money-page generator failed:', err.message);
    if (err.findings) console.error('   findings:', JSON.stringify(err.findings, null, 2));
    process.exitCode = 1;
  });
}

export default {
  MONEY_PAGE_BRIEF,
  resolveAffiliateLinks,
  generateArticleHtml,
  buildStubArticle,
  pickEntry,
  main,
};
