#!/usr/bin/env node
/**
 * Routard.com Local Poster — Discourse API + Chrome cookies
 *
 * Routard uses Discourse, which has a clean JSON API.
 * We grab the CSRF token and session cookie from Chrome (where user is logged in),
 * then use fetch() to post replies — no AppleScript DOM manipulation needed.
 *
 * Flow:
 * 1. Grab auth cookies from Chrome via AppleScript
 * 2. Fetch recent topics in SEA categories via Discourse API
 * 3. Pick a recent thread we haven't replied to
 * 4. Read the thread content
 * 5. Generate reply via Haiku
 * 6. POST reply via Discourse API
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLAN_PATH = path.join(REPO_ROOT, 'data/linkbuilding-week-plan.json');
const LOG_PATH = path.join(REPO_ROOT, 'data/linkbuilding-log.jsonl');

const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ROUTARD_BASE = 'https://www.routard.com/forums';
const LINK_RATIO = 0.25;

// SEA categories on Routard (Discourse category IDs)
const CATEGORIES = [
  { id: 44, slug: 'thailande', name: 'Thaïlande' },
  { id: 45, slug: 'vietnam', name: 'Vietnam' },
  { id: 210, slug: 'bali', name: 'Bali' },
  { id: 92, slug: 'cambodge', name: 'Cambodge' },
  { id: 40, slug: 'indonesie', name: 'Indonésie' },
  { id: 64, slug: 'laos', name: 'Laos' },
];

const TONE_RULES = `
RÈGLES DE TON (OBLIGATOIRE — ton de voyageur français, PAS de ton IA) :
1. JAMAIS de tiret cadratin '—'. Utilise virgules, points, parenthèses ou '...'
2. Connecteurs oraux français : "du coup", "en vrai", "perso", "bref", "genre"
3. Ratio 40% anecdote / 60% info
4. Varie la longueur des phrases
5. L'accroche doit RÉAGIR à la question
6. Marqueurs d'incertitude : "de mémoire", "je crois que", "à vérifier"
7. Oscille entre registre courant et familier
8. Opinions franches : "honnêtement évite X"
9. PRIX EN EUROS UNIQUEMENT.
10. 150-350 mots
11. PAS de markdown (pas de # ## ** etc). Texte brut avec des retours à la ligne.
12. Commence directement par ta réaction, pas de titre.
13. Tu es FloAsie / Florian, expat en Thaïlande.
14. Tutoie l'auteur du thread.
15. Si tu inclus un lien, intègre-le naturellement dans une phrase.
`;

function log(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

// ── Chrome cookie extraction via AppleScript ──

function osa(script) {
  fs.writeFileSync('/tmp/fv-osa.scpt', script);
  try { return execSync('osascript /tmp/fv-osa.scpt', { timeout: 25000 }).toString().trim(); }
  catch(e) { console.log('[OSA ERROR]', e.message); return 'ERROR'; }
}

function getChromeCSRF() {
  // Navigate to Routard in a new tab to get CSRF + cookies
  const result = osa(`tell application "Google Chrome"
  set w to front window
  set wId to id of w
  make new tab at end of tabs of w with properties {URL:"https://www.routard.com/forums/"}
  set tabCount to count of tabs of w
  return (wId as text) & "|" & (tabCount as text)
end tell`);
  const parts = result.split('|');
  const winId = parseInt(parts[0]) || null;
  const tabIdx = parseInt(parts[1]) || null;

  sleep(8000);

  const winRef = winId ? `window id ${winId}` : 'front window';
  const tabRef = tabIdx ? `tab ${tabIdx} of w` : 'last tab of w';

  // Extract CSRF token and cookies
  fs.writeFileSync('/tmp/fv-js.js', `
(function() {
  var csrf = '';
  var meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) csrf = meta.content;
  // Discourse also stores it in the session
  if (!csrf) {
    var preload = document.getElementById('data-preloaded');
    if (preload) {
      try {
        var data = JSON.parse(preload.dataset.preloaded || '{}');
        var session = JSON.parse(data.currentUser || '{}');
        csrf = session.csrf_token || '';
      } catch(e) {}
    }
  }
  // Check if logged in
  var loggedIn = document.body.textContent.includes('Déconnexion') ||
                 document.body.textContent.includes('Se déconnecter') ||
                 document.body.textContent.includes('Mon profil') ||
                 !document.body.textContent.includes('Se connecter');
  var username = '';
  try {
    var preload2 = document.getElementById('data-preloaded');
    if (preload2) {
      var d = JSON.parse(preload2.dataset.preloaded || '{}');
      var cu = JSON.parse(d.currentUser || 'null');
      if (cu) username = cu.username || '';
    }
  } catch(e) {}
  return JSON.stringify({csrf: csrf, loggedIn: loggedIn, username: username, cookies: document.cookie});
})()
  `);
  const authRaw = osa(`set jsCode to read POSIX file "/tmp/fv-js.js"
tell application "Google Chrome"
  set w to ${winRef}
  set t to ${tabRef}
  execute t javascript jsCode
end tell`);

  // Close the tab
  osa(`tell application "Google Chrome"
  set w to ${winRef}
  set t to ${tabRef}
  close t
end tell`);

  try {
    return JSON.parse(authRaw);
  } catch {
    return { csrf: '', loggedIn: false, username: '', cookies: '' };
  }
}

// ── Discourse API helpers ──

async function discourseGet(path, cookies) {
  const res = await fetch(`${ROUTARD_BASE}${path}`, {
    headers: {
      'Cookie': cookies,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function discoursePost(path, body, cookies, csrf) {
  const res = await fetch(`${ROUTARD_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ── AI generation ──

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

async function fetchRandomArticle() {
  try {
    const totalRes = await fetch(`${WP_API}/posts?per_page=1&_fields=id`, { method: 'HEAD' });
    const total = parseInt(totalRes.headers.get('x-wp-total') || '100');
    const page = Math.floor(Math.random() * Math.ceil(total / 10)) + 1;
    const res = await fetch(`${WP_API}/posts?per_page=10&page=${page}&_fields=id,title,link,content`);
    if (!res.ok) return null;
    const posts = await res.json();
    const p = posts[Math.floor(Math.random() * posts.length)];
    if (!p) return null;
    const raw = p.content?.rendered?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
    return { id: p.id, title: p.title?.rendered || '', url: p.link || '', content: raw.slice(0, 3000) };
  } catch { return null; }
}

async function generateReply(topicTitle, firstPost, article, includeLink) {
  const linkInstr = includeLink && article
    ? `\nINCLUS CE LIEN en BBCode [url=${article.url}]texte descriptif naturel[/url] integre dans une phrase, PAS a la fin. Exemple: "J'ai detaille les budgets [url=${article.url}]dans cette comparaison[/url] si ca peut aider." Le texte d'ancrage doit sembler naturel, jamais "clique ici" ni l'URL brute.`
    : '\nNE mets AUCUN lien.';

  const ctx = article ? `\nSource FlashVoyage (NE PAS copier) :\n${article.content.slice(0, 2000)}` : '';

  const text = await callHaiku([{
    role: 'user',
    content: `Tu es FloAsie, voyageur français expat en Thaïlande qui répond sur le forum du Routard.

Thread : "${topicTitle}"
Question posée :
${firstPost.slice(0, 1200)}

${TONE_RULES}
${linkInstr}
${ctx}

Écris ta réponse maintenant. Texte brut avec des retours à la ligne (pas de HTML, pas de markdown).`,
  }], 1000);
  return text;
}

// ── Main ──

async function main() {
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!plan.status.routard) plan.status.routard = { posted: 0, posts_done: [] };
  if (!plan.status.routard.posts_done) plan.status.routard.posts_done = [];

  const postedTopicIds = new Set(plan.status.routard.posts_done.map(p => p.topicId));
  // Also check log for posted threads
  const logEntries = fs.existsSync(LOG_PATH)
    ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  logEntries.filter(e => e.platform === 'routard' && e.success).forEach(e => postedTopicIds.add(e.topicId));

  // 1. Get auth from Chrome
  console.log('[ROUTARD] Getting auth from Chrome...');
  const auth = getChromeCSRF();
  console.log(`[ROUTARD] Logged in: ${auth.loggedIn}, user: ${auth.username}`);

  if (!auth.loggedIn || !auth.cookies) {
    console.log('[ROUTARD] Not logged in — please log in to routard.com/forums in Chrome');
    log({ date: new Date().toISOString(), platform: 'routard', status: 'login_failed' });
    return;
  }

  // 2. Pick a category (rotate by day)
  const dayOfWeek = new Date().getDay();
  const category = CATEGORIES[dayOfWeek % CATEGORIES.length];
  console.log(`[ROUTARD] Category: ${category.name} (ID ${category.id})`);

  // 3. Fetch recent topics via Discourse API
  const topicsData = await discourseGet(`/c/${category.slug}/${category.id}.json`, auth.cookies);
  if (!topicsData || !topicsData.topic_list?.topics) {
    console.log('[ROUTARD] Failed to fetch topics');
    return;
  }

  const topics = topicsData.topic_list.topics;
  console.log(`[ROUTARD] Found ${topics.length} topics`);

  // Filter: recent (< 60 days), not pinned, not already posted, has replies enabled
  const now = Date.now();
  const maxAge = 60 * 24 * 60 * 60 * 1000;
  const candidates = topics.filter(t => {
    if (t.pinned || t.closed || t.archived) return false;
    if (postedTopicIds.has(t.id)) return false;
    const created = new Date(t.created_at).getTime();
    if (now - created > maxAge) return false;
    return true;
  });

  console.log(`[ROUTARD] Candidates (recent, open, unposted): ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('[ROUTARD] No candidates found');
    return;
  }

  // Pick the most recent one
  const target = candidates[0];
  console.log(`[ROUTARD] Target: "${target.title}" (ID ${target.id}, ${target.posts_count} posts)`);

  // 4. Read the first post
  const topicData = await discourseGet(`/t/${target.id}.json`, auth.cookies);
  if (!topicData || !topicData.post_stream?.posts?.[0]) {
    console.log('[ROUTARD] Failed to fetch topic content');
    return;
  }

  const firstPost = topicData.post_stream.posts[0];
  const questionText = (firstPost.cooked || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`[ROUTARD] Question (${questionText.length} chars): "${questionText.substring(0, 80)}..."`);

  // 5. Generate reply
  if (!ANTHROPIC_API_KEY) {
    console.log('[ROUTARD] ANTHROPIC_API_KEY required for reply generation');
    return;
  }

  const includeLink = Math.random() < LINK_RATIO;
  const article = includeLink ? await fetchRandomArticle() : null;
  if (article) console.log(`[ROUTARD] Article: "${article.title}"`);

  const replyContent = await generateReply(target.title, questionText, article, includeLink);
  if (!replyContent || replyContent.length < 50) {
    console.log('[ROUTARD] Generation failed');
    return;
  }
  console.log(`[ROUTARD] Generated (${replyContent.length} chars)`);

  // 6. Post reply via Chrome (cookies + CSRF are auto-included in browser context)
  console.log('[ROUTARD] Posting reply via Chrome...');

  // Re-open a tab to post from Chrome's context (httpOnly cookies work there)
  const postTabResult = osa(`tell application "Google Chrome"
  set w to front window
  set wId to id of w
  make new tab at end of tabs of w with properties {URL:"https://www.routard.com/forums/t/${target.id}"}
  set tabCount to count of tabs of w
  return (wId as text) & "|" & (tabCount as text)
end tell`);
  const postParts = postTabResult.split('|');
  const postWinId = parseInt(postParts[0]) || null;
  const postTabIdx = parseInt(postParts[1]) || null;
  const postWinRef = postWinId ? `window id ${postWinId}` : 'front window';
  const postTabRef = postTabIdx ? `tab ${postTabIdx} of w` : 'last tab of w';

  sleep(8000);

  // Post via XHR from within Chrome (all cookies auto-included)
  const encodedReply = encodeURIComponent(replyContent);
  fs.writeFileSync('/tmp/fv-js.js', `
(function() {
  var content = decodeURIComponent("${encodedReply}");
  var csrf = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrf ? csrf.content : '';

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/forums/posts.json', false); // synchronous
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('X-CSRF-Token', csrfToken);
  xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
  xhr.send(JSON.stringify({
    topic_id: ${target.id},
    raw: content,
    reply_to_post_number: 1
  }));

  if (xhr.status === 200) {
    try {
      var resp = JSON.parse(xhr.responseText);
      return 'SUCCESS|' + (resp.id || 'no-id');
    } catch(e) { return 'SUCCESS|parse-err'; }
  }
  return 'FAIL|' + xhr.status + '|' + xhr.responseText.substring(0, 200);
})()
  `);
  const postResultRaw = osa(`set jsCode to read POSIX file "/tmp/fv-js.js"
tell application "Google Chrome"
  set w to ${postWinRef}
  set t to ${postTabRef}
  execute t javascript jsCode
end tell`);

  // Close tab
  osa(`tell application "Google Chrome"
  set w to ${postWinRef}
  set t to ${postTabRef}
  close t
end tell`);

  const postParsed = (postResultRaw || '').split('|');
  const success = postParsed[0] === 'SUCCESS';
  const postId = postParsed[1] || null;
  console.log(`[ROUTARD] ${success ? 'SUCCESS' : 'FAILED'} — ${postResultRaw}`);
  if (!success) console.log('[ROUTARD] Response:', postParsed.slice(1).join('|'));

  log({
    date: new Date().toISOString(),
    platform: 'routard',
    topicId: target.id,
    topicTitle: target.title,
    category: category.name,
    hasLink: includeLink && replyContent.includes('flashvoyage.com'),
    generated: true,
    articleId: article?.id,
    success,
    postId,
  });

  if (success) {
    plan.status.routard.posted++;
    plan.status.routard.posts_done.push({
      date: new Date().toISOString(),
      topicId: target.id,
      title: target.title,
      category: category.name,
      hasLink: includeLink,
      status: 'published',
    });
    plan.total_posted = (plan.total_posted || 0) + 1;
    fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
  }
}

main().catch(err => { console.error('[ROUTARD FATAL]', err.message); process.exit(1); });
