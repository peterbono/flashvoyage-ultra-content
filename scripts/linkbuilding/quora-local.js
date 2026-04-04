#!/usr/bin/env node
/**
 * Quora FR Local Poster — Controls real Chrome via AppleScript
 * Uses a dedicated tab (last tab of front window) to avoid conflicts.
 *
 * Hybrid mode:
 *   1. Uses pre-written content from linkbuilding-content-ready.json when available
 *   2. Falls back to dynamic AI generation from FlashVoyage WP articles via Haiku
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLAN_PATH = path.join(REPO_ROOT, 'data/linkbuilding-week-plan.json');
const CONTENT_PATH = path.join(REPO_ROOT, 'data/linkbuilding-content-ready.json');
const LOG_PATH = path.join(REPO_ROOT, 'data/linkbuilding-log.jsonl');

const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const LINK_RATIO = 0.3;
let TAB_INDEX = null;

const TONE_RULES = `
RÈGLES DE TON (OBLIGATOIRE — ton de voyageur français, PAS de ton IA) :
1. JAMAIS de tiret cadratin '—'. Utilise virgules, points, parenthèses ou '...'
2. Connecteurs oraux français : "du coup", "en vrai", "perso", "bref", "genre"
3. Ratio 40% anecdote / 60% info minimum
4. Varie la longueur des phrases brutalement (phrases de 3 mots mélangées avec des longues)
5. L'accroche doit RÉAGIR à la question, pas ÉNONCER un fait
6. Marqueurs d'incertitude : "de mémoire", "je crois que", "à vérifier"
7. Phrases commençant par "Et" ou "Mais"
8. Oscille entre registre courant + familier dans le même post
9. Aie des opinions franches : "honnêtement évite X", "les gens qui disent Y je sais pas"
10. PRIX EN EUROS UNIQUEMENT. Jamais de USD.
11. 150-300 mots max
12. JAMAIS de markdown (#, ##, **, __, etc.). Texte brut uniquement.
13. JAMAIS de titre en début de réponse. Commence directement par ta réaction.
14. JAMAIS de formules clickbait ("la vraie réponse", "ce que personne ne dit").
15. Tu es un mec normal qui partage son expérience, pas un influenceur.
`;

function log(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

// All AppleScript goes through temp files — zero escaping issues
function osa(script) {
  fs.writeFileSync('/tmp/fv-osa.scpt', script);
  try { return execSync('osascript /tmp/fv-osa.scpt', { timeout: 20000 }).toString().trim(); }
  catch(e) { console.log('[OSA ERROR]', e.message); return 'ERROR'; }
}

function chromeJS(js) {
  fs.writeFileSync('/tmp/fv-js.js', js);
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`set jsCode to read POSIX file "/tmp/fv-js.js"
tell application "Google Chrome"
  set w to front window
  set t to ${tabRef}
  execute t javascript jsCode
end tell`);
}

function chromeNav(url) {
  // Write URL to file to avoid any escaping
  fs.writeFileSync('/tmp/fv-url.txt', url);
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`set targetURL to read POSIX file "/tmp/fv-url.txt"
tell application "Google Chrome"
  set w to front window
  set t to ${tabRef}
  set URL of t to targetURL
end tell`);
}

function chromeTitle() {
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`tell application "Google Chrome"
  set w to front window
  set t to ${tabRef}
  get title of t
end tell`);
}

function chromeNewTab() {
  const result = osa(`tell application "Google Chrome"
  set w to front window
  make new tab at end of tabs of w with properties {URL:"about:blank"}
  set tabCount to count of tabs of w
  return tabCount as text
end tell`);
  TAB_INDEX = parseInt(result) || null;
  return result;
}

function chromeCloseLastTab() {
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  osa(`tell application "Google Chrome"
  set w to front window
  set t to ${tabRef}
  close t
end tell`);
  TAB_INDEX = null;
}

// ── WP Article Fetching ──

async function fetchRandomArticle(excludeIds = new Set()) {
  const totalRes = await fetch(`${WP_API}/posts?per_page=1&_fields=id`, { method: 'HEAD' });
  const total = parseInt(totalRes.headers.get('x-wp-total') || '100');
  const maxPage = Math.ceil(total / 10);

  // Try a few random pages to find a fresh article
  for (let attempt = 0; attempt < 5; attempt++) {
    const page = Math.floor(Math.random() * maxPage) + 1;
    const res = await fetch(`${WP_API}/posts?per_page=10&page=${page}&_fields=id,title,link,excerpt,content`);
    if (!res.ok) continue;
    const posts = await res.json();
    for (const p of posts) {
      if (excludeIds.has(p.id)) continue;
      const rawContent = p.content?.rendered?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
      return {
        id: p.id,
        title: p.title?.rendered || '',
        url: p.link || '',
        excerpt: p.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim() || '',
        content: rawContent.slice(0, 3000),
      };
    }
  }
  return null;
}

// ── AI Generation via Haiku ──

async function callHaiku(messages, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || null;
}

async function generateSearchQuery(article) {
  if (!ANTHROPIC_API_KEY) return article.title.split(':')[0].trim();
  const text = await callHaiku([{
    role: 'user',
    content: `Génère UNE requête de recherche Quora FR (en français, 3-6 mots) pour trouver une question à laquelle cet article pourrait répondre. Retourne JUSTE la requête, rien d'autre.\n\nTitre: ${article.title}\nExtrait: ${article.excerpt}`,
  }], 50);
  return text || article.title.split(':')[0].trim();
}

async function generateAnswer(article, questionTitle, includeLink) {
  const linkInstruction = includeLink
    ? `\nINCLUS CE LIEN naturellement dans ta réponse (pas à la fin, intégré dans une phrase) : ${article.url}?utm_source=quora&utm_medium=community&utm_campaign=linkbuilding`
    : '\nNE mets AUCUN lien dans cette réponse.';

  const text = await callHaiku([{
    role: 'user',
    content: `Tu es Florian, voyageur français basé en Thaïlande qui répond sur Quora FR.

Question Quora : "${questionTitle}"

${TONE_RULES}
${linkInstruction}

Contexte (article FlashVoyage à utiliser comme source, NE PAS copier mot pour mot) :
${article.content.slice(0, 2000)}

Écris ta réponse Quora maintenant. Texte brut (pas de markdown), juste des paragraphes et des tirets si besoin.`,
  }], 800);
  return text;
}

// ── Quora Posting (shared by both pre-written and AI paths) ──

function searchQuora(query) {
  chromeNav(`https://fr.quora.com/search?q=${encodeURIComponent(query)}`);
  sleep(8000);

  // Wait for Cloudflare
  for (let i = 0; i < 10; i++) {
    const title = chromeTitle();
    if (!title.includes('instant') && !title.includes('Cloudflare') && !title.includes('Vérification')) break;
    console.log(`[QUORA] CF... (${i + 1}/10)`);
    sleep(5000);
  }
  console.log(`[QUORA] Page: "${chromeTitle()}"`);
}

function findQuestion() {
  const questionUrl = chromeJS(`
(function() {
  var links = document.querySelectorAll('a');
  var skip = ['condition','confidentialit','cookie','aide','about','press','career','contact','publicité','télécharger','politique'];
  for (var i = 0; i < links.length; i++) {
    var t = links[i].textContent.trim();
    var h = links[i].href || '';
    if (t.length < 25 || t.length > 200) continue;
    if (!h.startsWith('http')) continue;
    if (h.includes('/search') || h.includes('/topic/') || h.includes('/profile/') || h.includes('/about') || h.includes('/terms') || h.includes('/privacy') || h.includes('/settings')) continue;
    // Only accept fr.quora.com questions (skip Spaces, profiles, topics)
    if (!h.startsWith('https://fr.quora.com/')) continue;
    var bad = false;
    for (var j = 0; j < skip.length; j++) { if (t.toLowerCase().indexOf(skip[j]) >= 0) { bad = true; break; } }
    if (bad) continue;
    return h + '|||' + t.substring(0, 80);
  }
  return 'NONE';
})()
`);
  if (!questionUrl || questionUrl === 'NONE' || questionUrl === 'ERROR' || questionUrl === 'missing value' || !questionUrl.includes('|||')) return null;
  const [qUrl, qTitle] = questionUrl.split('|||');
  if (!qUrl || !qUrl.startsWith('https://fr.quora.com/') || qUrl.includes('/search') || qUrl.includes('/profile/')) return null;
  return { url: qUrl, title: qTitle };
}

function clickAnswer() {
  const result = chromeJS(`
(function() {
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    var t = btns[i].textContent;
    if (t.indexOf('pondre') >= 0 || t.indexOf('Answer') >= 0) {
      btns[i].click();
      return 'ok';
    }
  }
  return 'none';
})()
`);
  return result === 'ok';
}

function fillEditor(textContent) {
  const htmlContent = textContent.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  const encoded = encodeURIComponent(htmlContent);
  chromeJS(`
(function() {
  var el = document.querySelector('[contenteditable="true"].doc') || document.querySelector('[contenteditable="true"]') || document.querySelector('.ql-editor');
  if (!el) return 'no-editor';
  el.innerHTML = decodeURIComponent("${encoded}");
  el.classList.remove('empty');
  el.dispatchEvent(new Event('input', {bubbles: true}));
  return 'filled';
})()
`);
}

function clickPublish() {
  return chromeJS(`
(function() {
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].textContent.indexOf('ublier') >= 0 || btns[i].textContent.indexOf('ubmit') >= 0) {
      btns[i].click();
      return 'published';
    }
  }
  return 'no-button';
})()
`);
}

// ── Main ──

async function main() {
  const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!plan.status.quora_fr) plan.status.quora_fr = { posted: 0, posts_done: [] };

  const doneIds = plan.status.quora_fr.posts_done.map(p => p.id);
  const next = content.quora_fr.find(p => p.status === 'ready' && !doneIds.includes(p.id));

  // Determine mode: pre-written or AI-generated
  const useAI = !next;
  let searchQuery, answerContent, hasLink, postId;
  let wpArticle = null; // Kept in outer scope for AI answer generation

  if (!useAI) {
    // ── Pre-written content path ──
    searchQuery = next.search_query;
    answerContent = next.content;
    hasLink = next.hasLink;
    postId = next.id;
    console.log(`[QUORA] Mode: PRE-WRITTEN — ${postId} — "${searchQuery}"`);
  } else {
    // ── AI generation fallback ──
    if (!ANTHROPIC_API_KEY) {
      console.log('[QUORA] No pre-written content left and ANTHROPIC_API_KEY not set. Cannot generate.');
      return;
    }
    console.log('[QUORA] Mode: AI GENERATION — no pre-written content left, fetching WP article...');

    // Collect already-used article IDs from log to avoid duplicates
    const logEntries = fs.existsSync(LOG_PATH)
      ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
      : [];
    const usedArticleIds = new Set(logEntries.filter(e => e.platform === 'quora_fr' && e.success && e.articleId).map(e => e.articleId));

    wpArticle = await fetchRandomArticle(usedArticleIds);
    if (!wpArticle) { console.log('[QUORA] Could not fetch any fresh WP article'); return; }

    console.log(`[QUORA] Article: "${wpArticle.title}" (ID: ${wpArticle.id})`);

    searchQuery = await generateSearchQuery(wpArticle);
    console.log(`[QUORA] Generated search query: "${searchQuery}"`);

    hasLink = Math.random() < LINK_RATIO;
    postId = `ai-${wpArticle.id}-${Date.now()}`;

    // answerContent will be generated AFTER we find the actual question on Quora
    // so the answer can react to the real question title
    answerContent = null;
  }

  // ── Common posting flow ──
  chromeNewTab();
  sleep(1000);

  try {
    // 1. Search Quora
    searchQuora(searchQuery);

    // 2. Find a question
    const question = findQuestion();
    if (!question) { console.log('[QUORA] No question found'); return; }
    console.log(`[QUORA] Question: "${question.title}"`);
    console.log(`[QUORA] URL: ${question.url}`);

    // Navigate to the question page
    chromeNav(question.url);
    sleep(8000);
    console.log(`[QUORA] On: "${chromeTitle()}"`);

    // 3. If AI mode, generate answer now using the real Quora question title
    if (useAI && !answerContent) {
      answerContent = await generateAnswer(wpArticle, question.title, hasLink);
      if (!answerContent) { console.log('[QUORA] AI answer generation failed'); return; }
      console.log(`[QUORA] AI answer generated (${answerContent.length} chars)`);
    }

    // 4. Click "Répondre"
    if (!clickAnswer()) { console.log('[QUORA] No answer button found'); return; }
    console.log('[QUORA] Answer editor opened');
    sleep(3000);

    // 5. Fill editor
    fillEditor(answerContent);
    sleep(1500);

    // 6. Publish
    const pubResult = clickPublish();
    console.log(`[QUORA] Publish: ${pubResult}`);
    sleep(6000);

    const finalUrl = chromeJS('window.location.href');
    const success = pubResult === 'published';
    console.log(`[QUORA] ${success ? 'SUCCESS' : 'FAILED'} — ${finalUrl}`);

    const logEntry = {
      date: new Date().toISOString(),
      platform: 'quora_fr',
      id: postId,
      search: searchQuery,
      hasLink,
      success,
      generated: useAI,
    };
    if (useAI) {
      logEntry.question = question.title;
      logEntry.articleId = wpArticle.id;
      logEntry.articleTitle = wpArticle.title;
    }
    log(logEntry);

    if (success) {
      plan.status.quora_fr.posted++;
      plan.status.quora_fr.posts_done.push({
        date: new Date().toISOString(),
        id: postId,
        search: searchQuery,
        hasLink,
        status: 'published',
        generated: useAI,
      });
      plan.total_posted = (plan.total_posted || 0) + 1;
      fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
    }
  } finally {
    chromeCloseLastTab();
  }
}

main().catch(err => { console.error('[QUORA FATAL]', err.message); process.exit(1); });
