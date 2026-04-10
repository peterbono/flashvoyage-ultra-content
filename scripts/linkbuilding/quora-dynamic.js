#!/usr/bin/env node
/**
 * Quora FR Dynamic Answer Generator + Poster
 *
 * Flow:
 * 1. Pick a random FlashVoyage article
 * 2. Search Quora FR for a matching question
 * 3. Generate a human-sounding answer via Haiku (with tone rules)
 * 4. Post via AppleScript Chrome control
 * 5. Log + update plan
 *
 * Designed for multiple posts per day with delays between them.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOG_PATH = path.join(REPO_ROOT, 'data/linkbuilding-log.jsonl');
const PLAN_PATH = path.join(REPO_ROOT, 'data/linkbuilding-week-plan.json');

const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Phase config: how many posts per day based on account age
const ACCOUNT_CREATED = new Date('2026-03-28'); // First Quora post date
const POSTS_PER_DAY = (() => {
  const daysSinceCreation = Math.floor((Date.now() - ACCOUNT_CREATED.getTime()) / 86400000);
  if (daysSinceCreation < 14) return 2;
  if (daysSinceCreation < 30) return 4;
  return 5;
})();

// Link ratio: how often to include a FlashVoyage link
const LINK_RATIO = (() => {
  const daysSinceCreation = Math.floor((Date.now() - ACCOUNT_CREATED.getTime()) / 86400000);
  if (daysSinceCreation < 14) return 0.3;
  if (daysSinceCreation < 30) return 0.4;
  return 0.5;
})();

const TONE_RULES = `
RÈGLES DE TON (OBLIGATOIRE — ton de voyageur français, PAS de ton IA) :
1. JAMAIS de tiret cadratin '—'. Utilise virgules, points, parenthèses ou '...'
2. Casse la structure parfaite : ajoute des digressions, ne conclus pas toujours proprement
3. Connecteurs oraux français : "du coup", "en vrai", "perso", "bref", "genre", "bon après"
4. Ratio 40% anecdote / 60% info minimum
5. Varie la longueur des phrases brutalement (phrases de 3 mots mélangées avec des longues)
6. L'accroche doit RÉAGIR à la question, pas ÉNONCER un fait
7. Marqueurs d'incertitude : "de mémoire", "je crois que", "à vérifier"
8. Imperfections contrôlées : phrases commençant par "Et" ou "Mais"
9. Oscille entre registre courant + familier + léger argot dans le même post
10. Aie des opinions : "honnêtement évite X", "les gens qui disent Y je sais pas"
11. PRIX EN EUROS UNIQUEMENT. Jamais de USD. Monnaie locale + conversion euros.
12. Longueur : 150-300 mots. Pas plus. Quora = réponse concise, pas un article.
13. Structure : pas de H2/H3, juste des paragraphes naturels et des listes à tirets si besoin.
14. JAMAIS de markdown (#, ##, **, __, etc.). Texte brut uniquement.
15. JAMAIS de titre en début de réponse. Commence directement par ta réaction à la question.
16. JAMAIS de formules clickbait ("la vraie réponse", "ce que personne ne dit", "le secret").
17. Tu es un mec normal qui partage son expérience, pas un influenceur.
`;

function log(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

function osa(script) {
  fs.writeFileSync('/tmp/fv-osa.scpt', script);
  try { return execSync('osascript /tmp/fv-osa.scpt', { timeout: 20000 }).toString().trim(); }
  catch { return 'ERROR'; }
}

function chromeJS(js) {
  fs.writeFileSync('/tmp/fv-js.js', js);
  return osa(`set jsCode to read POSIX file "/tmp/fv-js.js"
tell application "Google Chrome"
  set w to last window
  set t to last tab of w
  execute t javascript jsCode
end tell`);
}

function chromeNav(url) {
  fs.writeFileSync('/tmp/fv-url.txt', url);
  return osa(`set targetURL to read POSIX file "/tmp/fv-url.txt"
tell application "Google Chrome"
  set w to last window
  set t to last tab of w
  set URL of t to targetURL
end tell`);
}

function chromeTitle() {
  return osa(`tell application "Google Chrome"
  set w to last window
  set t to last tab of w
  get title of t
end tell`);
}

function chromeNewTab() {
  return osa(`tell application "Google Chrome"
  set w to last window
  make new tab at end of tabs of w with properties {URL:"about:blank"}
end tell`);
}

function chromeCloseLastTab() {
  osa(`tell application "Google Chrome"
  set w to last window
  set t to last tab of w
  close t
end tell`);
}

// ── Article fetching ──

async function fetchRandomArticles(count = 5) {
  const totalRes = await fetch(`${WP_API}/posts?per_page=1&_fields=id`, { method: 'HEAD' });
  const total = parseInt(totalRes.headers.get('x-wp-total') || '100');
  const maxPage = Math.ceil(total / 10);

  const articles = [];
  const seenIds = new Set();

  for (let i = 0; i < count * 2 && articles.length < count; i++) {
    const page = Math.floor(Math.random() * maxPage) + 1;
    const res = await fetch(`${WP_API}/posts?per_page=10&page=${page}&_fields=id,title,link,excerpt,content`);
    if (!res.ok) continue;
    const posts = await res.json();
    for (const p of posts) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      // Strip HTML from content
      const rawContent = p.content?.rendered?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
      articles.push({
        id: p.id,
        title: p.title?.rendered || '',
        url: p.link || '',
        excerpt: p.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim() || '',
        content: rawContent.slice(0, 3000), // Keep first 3000 chars for Haiku context
      });
      if (articles.length >= count) break;
    }
  }
  return articles;
}

// ── AI generation ──

async function generateSearchQuery(article) {
  if (!ANTHROPIC_API_KEY) return article.title.split(':')[0].trim();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{ role: 'user', content: `Génère UNE requête de recherche Quora FR (en français, 3-6 mots) pour trouver une question à laquelle cet article pourrait répondre. Retourne JUSTE la requête, rien d'autre.\n\nTitre: ${article.title}\nExtrait: ${article.excerpt}` }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || article.title.split(':')[0].trim();
}

async function generateAnswer(article, questionTitle, includeLink) {
  const linkInstruction = includeLink
    ? `\nINCLUS CE LIEN a la fin d'une phrase d'introduction claire (Quora n'accepte pas de markdown, l'URL sera visible en brut). Exemple: "Pour un comparatif detaille entre destinations, voir : ${article.url}" ou "J'ai detaille les budgets ici : ${article.url}". L'URL doit etre propre (sans UTM).`
    : '\nNE mets AUCUN lien dans cette réponse.';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: `Tu es Florian, voyageur français basé en Thaïlande qui répond sur Quora FR.

Question Quora : "${questionTitle}"

${TONE_RULES}
${linkInstruction}

Contexte (article FlashVoyage à utiliser comme source, NE PAS copier mot pour mot) :
${article.content.slice(0, 2000)}

Écris ta réponse Quora maintenant. Texte brut (pas de markdown), juste des paragraphes et des tirets si besoin.` }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || null;
}

// ── Quora posting ──

async function postOneAnswer(article, includeLink) {
  console.log(`\n[QUORA] Article: "${article.title.slice(0, 50)}..." (link: ${includeLink ? 'YES' : 'NO'})`);

  // 1. Generate search query
  const query = await generateSearchQuery(article);
  console.log(`[QUORA] Search: "${query}"`);

  // 2. Open tab and search
  chromeNewTab();
  sleep(1000);

  try {
    chromeNav(`https://fr.quora.com/search?q=${encodeURIComponent(query)}`);
    sleep(8000);

    // Wait for CF
    for (let i = 0; i < 6; i++) {
      const title = chromeTitle();
      if (!title.includes('instant') && !title.includes('Cloudflare')) break;
      sleep(5000);
    }

    // 3. Find a question
    const questionData = chromeJS(`
(function() {
  var links = document.querySelectorAll('a');
  var skip = ['condition','confidentialit','cookie','aide','about','press','career','contact','publicit','t l charger','politique'];
  for (var i = 0; i < links.length; i++) {
    var t = links[i].textContent.trim();
    var h = links[i].href || '';
    if (t.length < 25 || t.length > 200) continue;
    if (!h.startsWith('http')) continue;
    if (h.includes('/search') || h.includes('/topic/') || h.includes('/profile/') || h.includes('/about') || h.includes('/terms') || h.includes('/privacy') || h.includes('/settings')) continue;
    var bad = false;
    for (var j = 0; j < skip.length; j++) { if (t.toLowerCase().indexOf(skip[j]) >= 0) { bad = true; break; } }
    if (bad) continue;
    return h + '|||' + t.substring(0, 80);
  }
  return 'NONE';
})()
`);

    if (!questionData || questionData === 'NONE' || questionData === 'ERROR') {
      console.log('[QUORA] No question found for this query');
      return false;
    }

    const [qUrl, qTitle] = questionData.split('|||');
    console.log(`[QUORA] Question: "${qTitle}"`);

    // Navigate to question
    chromeNav(qUrl);
    sleep(8000);

    // 4. Generate answer via AI
    const answer = await generateAnswer(article, qTitle, includeLink);
    if (!answer) { console.log('[QUORA] AI generation failed'); return false; }
    console.log(`[QUORA] Answer generated (${answer.length} chars)`);

    // 5. Click Répondre
    const clicked = chromeJS(`
(function() {
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].textContent.indexOf('pondre') >= 0) { btns[i].click(); return 'ok'; }
  }
  return 'none';
})()
`);
    if (clicked !== 'ok') { console.log('[QUORA] No answer button'); return false; }
    sleep(3000);

    // 6. Fill editor
    const htmlContent = answer.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    const encoded = encodeURIComponent(htmlContent);

    chromeJS(`window.__fvContent = decodeURIComponent("${encoded}")`);
    sleep(500);
    chromeJS(`
(function() {
  var el = document.querySelector('[contenteditable="true"]');
  if (el && window.__fvContent) {
    el.innerHTML = window.__fvContent;
    el.classList.remove('empty');
    el.dispatchEvent(new Event('input', {bubbles: true}));
  }
})()
`);
    sleep(1500);

    // 7. Publish
    const pubResult = chromeJS(`
(function() {
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].textContent.indexOf('ublier') >= 0 || btns[i].textContent.indexOf('ubmit') >= 0) {
      btns[i].click(); return 'published';
    }
  }
  return 'no-button';
})()
`);
    sleep(6000);

    const finalUrl = chromeJS('window.location.href');
    const success = pubResult === 'published';
    console.log(`[QUORA] ${success ? 'SUCCESS' : 'FAILED'} — ${finalUrl}`);

    log({
      date: new Date().toISOString(),
      platform: 'quora_fr',
      articleId: article.id,
      articleTitle: article.title,
      question: qTitle,
      hasLink: includeLink,
      success,
      url: finalUrl,
      generated: true,
    });

    return success;
  } finally {
    chromeCloseLastTab();
  }
}

// ── Main ──

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('[QUORA] ANTHROPIC_API_KEY required for dynamic generation');
    process.exit(1);
  }

  // Load already-posted articles to avoid duplicates
  const logEntries = fs.existsSync(LOG_PATH)
    ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  const postedArticleIds = new Set(logEntries.filter(e => e.platform === 'quora_fr' && e.success).map(e => e.articleId));

  // Count today's posts
  const today = new Date().toISOString().split('T')[0];
  const todayPosts = logEntries.filter(e => e.platform === 'quora_fr' && e.date?.startsWith(today) && e.success).length;

  const remaining = POSTS_PER_DAY - todayPosts;
  if (remaining <= 0) {
    console.log(`[QUORA] Already posted ${todayPosts}/${POSTS_PER_DAY} today. Done.`);
    return;
  }

  console.log(`[QUORA] Phase: ${POSTS_PER_DAY}/day, link ratio: ${Math.round(LINK_RATIO * 100)}%`);
  console.log(`[QUORA] Today: ${todayPosts} done, ${remaining} remaining`);

  // Fetch random articles
  const articles = await fetchRandomArticles(remaining * 2);
  const available = articles.filter(a => !postedArticleIds.has(a.id));
  console.log(`[QUORA] ${available.length} fresh articles available`);

  if (available.length === 0) {
    console.log('[QUORA] No fresh articles to post about');
    return;
  }

  let posted = 0;
  for (let i = 0; i < Math.min(remaining, available.length); i++) {
    const article = available[i];
    const includeLink = Math.random() < LINK_RATIO;

    const success = await postOneAnswer(article, includeLink);
    if (success) posted++;

    // Delay between posts: 5-10 min (randomized to look human)
    if (i < remaining - 1) {
      const delayMin = 5 + Math.floor(Math.random() * 6); // 5-10 minutes
      console.log(`[QUORA] Waiting ${delayMin} min before next post...`);
      sleep(delayMin * 60 * 1000);
    }
  }

  console.log(`\n[QUORA] Session done: ${posted}/${remaining} posted`);

  // Update plan
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!plan.status.quora_fr) plan.status.quora_fr = { posted: 0, posts_done: [] };
  plan.status.quora_fr.posted += posted;
  plan.total_posted = (plan.total_posted || 0) + posted;
  fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
}

main().catch(err => { console.error('[QUORA FATAL]', err.message); process.exit(1); });
