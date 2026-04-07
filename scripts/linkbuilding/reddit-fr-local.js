#!/usr/bin/env node
/**
 * Reddit FR Dynamic Poster — Controls real Chrome via AppleScript
 * 1. Scrapes recent threads from French + EN Reddit subs (old.reddit.com)
 * 2. Picks one we haven't replied to (checks linkbuilding-log.jsonl)
 * 3. Reads the OP question text
 * 4. Generates a reply via Claude Haiku
 * 5. Posts via AppleScript Chrome automation on old.reddit.com
 *
 * Tracks window ID + tab index to avoid Claude extension tab conflicts.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOG_PATH = path.join(REPO_ROOT, 'data/linkbuilding-log.jsonl');

const WP_API = 'https://flashvoyage.com/wp-json/wp/v2';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const LINK_RATIO = 0.20; // 20% of posts include a FlashVoyage link

// ── Target subs (rotate through them) ──

const SUBS = [
  'r/voyage',
  'r/france',       // only travel-related threads
  'r/expatries',
  'r/AskFrance',    // only travel-related
  'r/solotravel',   // keep EN sub too
];

// Subs that need travel keyword filtering (general-purpose subs)
const FILTERED_SUBS = new Set(['r/france', 'r/AskFrance']);

const TRAVEL_KEYWORDS_FR = [
  'voyage', 'voyager', 'voyageur', 'vacances', 'expat', 'expatri',
  'asie', 'thailande', 'thaïlande', 'japon', 'vietnam', 'cambodge',
  'indonesie', 'indonésie', 'bali', 'laos', 'philippines', 'malaisie',
  'singapour', 'myanmar', 'birmanie', 'sri lanka', 'inde', 'nepal',
  'budget', 'avion', 'vol', 'billet', 'hotel', 'hôtel', 'hostel',
  'backpack', 'sac à dos', 'itinéraire', 'itineraire', 'road trip',
  'roadtrip', 'tour du monde', 'digital nomad', 'nomade', 'pvt',
  'visa', 'passeport', 'douane', 'aéroport', 'aeroport',
  'plage', 'île', 'ile', 'trek', 'randonnée', 'randonnee',
  'séjour', 'sejour', 'destination', 'partir', 'départ', 'depart',
  'valise', 'bagage', 'assurance voyage', 'auberge', 'guesthouse',
  'train', 'bus', 'ferry', 'scooter', 'moto',
  'culture', 'gastronomie', 'street food', 'bouffe',
  'climat', 'mousson', 'saison', 'quand partir',
  'travel', 'trip', 'flight', 'booking', 'airbnb',
];

// ── Tone rules (Reddit-specific) ──

const TONE_RULES_FR = `
RULES (OBLIGATOIRE - ton de redditor francais, PAS de ton IA) :
1. Jamais de tiret cadratin. Utilise virgules, points, parentheses ou '...'
2. Francais conversationnel, tutoyement obligatoire.
3. Ratio 40% anecdote personnelle / 60% info pratique
4. Reagis DIRECTEMENT a la question de l'OP
5. Prix en EUR uniquement
6. 100-250 mots (les commentaires Reddit sont courts)
7. PAS de headers markdown (##, ###). Juste du texte brut avec des sauts de ligne.
8. Tu es FloAsie/Florian, francais expat en Thailande qui partage son vecu.
9. Si tu inclus un lien, integre-le naturellement : "j'ai trouve un article detaille la-dessus : [lien]"
10. Markdown Reddit OK : **bold**, *italic*, listes avec "- "
11. Ne commence JAMAIS par "Salut !" ou une formule de politesse. Attaque direct la reponse.
12. Sois un vrai redditor : opinions franches, humour leger, pas de langue de bois.
13. Connecteurs oraux : "du coup", "en vrai", "perso", "bref", "genre", "franchement"
14. Marqueurs d'incertitude naturels : "de memoire", "je crois que", "a verifier mais"
15. Oscille entre registre courant et familier
`;

const TONE_RULES_EN = `
RULES (MANDATORY - sound like a real redditor, NOT like AI) :
1. No em-dash. Use commas, periods, parentheses or '...'
2. Casual English, first person, direct.
3. 40% personal anecdote / 60% practical info
4. React DIRECTLY to OP's question
5. Prices in EUR only
6. 100-250 words (Reddit comments are short)
7. NO markdown headers (##, ###). Just plain text with line breaks.
8. You are FloAsie/Florian, French expat in Thailand sharing real travel experience.
9. If including a link, weave it naturally: "I found a pretty detailed breakdown here: [link]"
10. Reddit markdown OK: **bold**, *italic*, bullet lists with "- "
11. Never start with "Hey!" or greetings. Jump straight into the answer.
12. Sound like a real redditor: frank opinions, light humor, no corporate speak.
13. Natural hedging: "from what I remember", "I think", "not 100% sure but"
14. Mix casual and informative register
`;

function log(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

function osa(script) {
  fs.writeFileSync('/tmp/fv-osa.scpt', script);
  try { return execSync('osascript /tmp/fv-osa.scpt', { timeout: 30000 }).toString().trim(); }
  catch(e) { console.log('[OSA ERROR]', e.message); return 'ERROR'; }
}

let TAB_INDEX = null;
let WIN_ID = null;

function getWinRef() { return WIN_ID ? `window id ${WIN_ID}` : 'front window'; }

function chromeNewTab() {
  const result = osa(`tell application "Google Chrome"
  set w to front window
  set wId to id of w
  make new tab at end of tabs of w with properties {URL:"about:blank"}
  set tabCount to count of tabs of w
  return (wId as text) & "|" & (tabCount as text)
end tell`);
  const parts = result.split('|');
  WIN_ID = parseInt(parts[0]) || null;
  TAB_INDEX = parseInt(parts[1]) || null;
  console.log(`[REDDIT-FR] Tab created: window=${WIN_ID} tab=${TAB_INDEX}`);
  return result;
}

function chromeJS(js) {
  fs.writeFileSync('/tmp/fv-js.js', js);
  const winRef = getWinRef();
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`set jsCode to read POSIX file "/tmp/fv-js.js"
tell application "Google Chrome"
  set w to ${winRef}
  set t to ${tabRef}
  execute t javascript jsCode
end tell`);
}

function chromeNav(url) {
  fs.writeFileSync('/tmp/fv-url.txt', url);
  const winRef = getWinRef();
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`set targetURL to read POSIX file "/tmp/fv-url.txt"
tell application "Google Chrome"
  set w to ${winRef}
  set t to ${tabRef}
  set URL of t to targetURL
end tell`);
}

function chromeTitle() {
  const winRef = getWinRef();
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`tell application "Google Chrome"
  set w to ${winRef}
  set t to ${tabRef}
  get title of t
end tell`);
}

function chromeCloseTab() {
  const winRef = getWinRef();
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  osa(`tell application "Google Chrome"
  set w to ${winRef}
  set t to ${tabRef}
  close t
end tell`);
  TAB_INDEX = null;
  WIN_ID = null;
}

// ── Already-posted thread tracking ──

function getPostedThreadIds() {
  const posted = new Set();
  if (!fs.existsSync(LOG_PATH)) return posted;
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if ((entry.platform === 'reddit_fr' || entry.platform === 'reddit') && entry.success && entry.threadId) {
        posted.add(entry.threadId);
      }
      // Also track by thread URL to be safe
      if ((entry.platform === 'reddit_fr' || entry.platform === 'reddit') && entry.success && entry.postUrl) {
        // Extract thread ID from URL: /comments/XXXXX/
        const m = entry.postUrl.match(/\/comments\/([a-z0-9]+)\//);
        if (m) posted.add(m[1]);
      }
    } catch { /* skip malformed lines */ }
  }
  return posted;
}

// ── Thread discovery on old.reddit.com ──

function waitForPage(maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    const title = chromeTitle();
    if (title && !title.includes('Just a moment') && !title.includes('Cloudflare') && title !== 'ERROR' && title !== 'missing value') {
      return true;
    }
    console.log(`[REDDIT-FR] Waiting for page... (${i + 1}/${maxAttempts})`);
    sleep(5000);
  }
  return false;
}

function checkLogin() {
  const loggedIn = chromeJS(`
(function() {
  var userEl = document.querySelector('.user a');
  if (userEl && userEl.textContent && !userEl.textContent.includes('log in') && !userEl.textContent.includes('sign up')) {
    return userEl.textContent.trim();
  }
  if (document.body.textContent.includes('Log Out') || document.body.textContent.includes('log out')) return 'logged_in';
  return 'NOT_LOGGED_IN';
})()
`);
  if (loggedIn === 'NOT_LOGGED_IN' || loggedIn === 'ERROR' || loggedIn === 'missing value') {
    return null;
  }
  return loggedIn;
}

function scrapeThreadList(sub) {
  // Navigate to /new/ to get recent threads
  const url = `https://old.reddit.com/${sub}/new/`;
  chromeNav(url);
  sleep(8000);

  if (!waitForPage()) {
    console.log(`[REDDIT-FR] Page load timeout for ${sub}`);
    return [];
  }
  console.log(`[REDDIT-FR] Loaded: "${chromeTitle()}"`);

  // Scrape thread titles, URLs, and ages from old.reddit.com listing
  const raw = chromeJS(`
(function() {
  var results = [];
  var things = document.querySelectorAll('.thing.link');
  for (var i = 0; i < things.length && i < 25; i++) {
    var thing = things[i];
    // Skip stickied/pinned posts
    if (thing.classList.contains('stickied')) continue;

    var titleEl = thing.querySelector('a.title');
    if (!titleEl) continue;
    var title = titleEl.textContent.trim();
    var href = titleEl.href || '';

    // Get thread ID from data attribute or URL
    var threadId = thing.getAttribute('data-fullname') || '';
    threadId = threadId.replace('t3_', '');
    if (!threadId) {
      var idMatch = href.match(/\\/comments\\/([a-z0-9]+)\\//);
      threadId = idMatch ? idMatch[1] : '';
    }
    if (!threadId) continue;

    // Get age from time tag
    var timeEl = thing.querySelector('time');
    var ageText = '';
    var timestamp = '';
    if (timeEl) {
      ageText = timeEl.getAttribute('title') || timeEl.textContent.trim();
      timestamp = timeEl.getAttribute('datetime') || '';
    }
    // Also grab the "submitted X ago" text
    var taglineEl = thing.querySelector('.tagline');
    var submittedAgo = '';
    if (taglineEl) {
      var timeLink = taglineEl.querySelector('time');
      if (timeLink) submittedAgo = timeLink.textContent.trim();
    }

    // Check if locked/archived
    var isLocked = thing.querySelector('.locked-tagline') !== null
      || thing.classList.contains('locked')
      || thing.querySelector('.linkflairlabel') !== null && thing.querySelector('.linkflairlabel').textContent.includes('Locked');
    var isArchived = thing.classList.contains('archived');

    // Normalize URL to old.reddit.com
    var url = href.replace('www.reddit.com', 'old.reddit.com');
    if (!url.includes('old.reddit.com')) url = url.replace('reddit.com', 'old.reddit.com');

    // Get comment count
    var commentsEl = thing.querySelector('.comments');
    var commentCount = 0;
    if (commentsEl) {
      var ccMatch = commentsEl.textContent.match(/(\\d+)/);
      commentCount = ccMatch ? parseInt(ccMatch[1]) : 0;
    }

    results.push([threadId, title.substring(0, 150), url, submittedAgo, isLocked || isArchived ? '1' : '0', commentCount].join('|||'));
  }
  return results.join('###');
})()
`);

  if (!raw || raw === 'ERROR' || raw === 'missing value') return [];

  const threads = [];
  for (const entry of raw.split('###').filter(Boolean)) {
    const parts = entry.split('|||');
    if (parts.length < 6) continue;
    const [threadId, title, url, submittedAgo, locked, commentCount] = parts;
    threads.push({
      threadId,
      title,
      url,
      submittedAgo,
      locked: locked === '1',
      commentCount: parseInt(commentCount) || 0,
    });
  }
  return threads;
}

function isRecentEnough(submittedAgo) {
  if (!submittedAgo) return false;
  const text = submittedAgo.toLowerCase();
  // Accept: hours ago, days ago (up to ~30 days)
  if (text.includes('hour') || text.includes('minute') || text.includes('just now')) return true;
  const dayMatch = text.match(/(\d+)\s*day/);
  if (dayMatch && parseInt(dayMatch[1]) <= 30) return true;
  // Also accept "X weeks ago" up to 4 weeks
  const weekMatch = text.match(/(\d+)\s*week/);
  if (weekMatch && parseInt(weekMatch[1]) <= 4) return true;
  return false;
}

function matchesTravelKeywords(title) {
  const lower = title.toLowerCase();
  return TRAVEL_KEYWORDS_FR.some(kw => lower.includes(kw));
}

// ── Read OP content from thread page ──

function readOPContent() {
  return chromeJS(`
(function() {
  // old.reddit.com: the OP self-text is in .usertext-body .md inside the first .thing
  var selfText = document.querySelector('.thing.self .usertext-body .md');
  if (selfText && selfText.textContent.trim().length > 20) {
    return selfText.textContent.trim().substring(0, 2000);
  }
  // For link posts, grab the title only
  var titleEl = document.querySelector('.thing .title a.title');
  if (titleEl) return titleEl.textContent.trim();
  // Fallback: page title
  return document.title || '';
})()
`);
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

async function fetchRelevantArticle(threadTitle) {
  try {
    // Try searching WP for an article matching the thread topic
    const searchTerms = threadTitle.split(/\s+/).filter(w => w.length > 3).slice(0, 3).join('+');
    const searchRes = await fetch(`${WP_API}/posts?search=${encodeURIComponent(searchTerms)}&per_page=5&_fields=id,title,link,content`);
    if (searchRes.ok) {
      const posts = await searchRes.json();
      if (posts.length > 0) {
        const p = posts[Math.floor(Math.random() * Math.min(posts.length, 3))];
        const rawContent = p.content?.rendered?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
        return { id: p.id, title: p.title?.rendered || '', url: p.link || '', content: rawContent.slice(0, 3000) };
      }
    }
    // Fallback: random article
    const totalRes = await fetch(`${WP_API}/posts?per_page=1&_fields=id`, { method: 'HEAD' });
    const total = parseInt(totalRes.headers.get('x-wp-total') || '100');
    const maxPage = Math.ceil(total / 10);
    const page = Math.floor(Math.random() * maxPage) + 1;
    const res = await fetch(`${WP_API}/posts?per_page=10&page=${page}&_fields=id,title,link,content`);
    if (!res.ok) return null;
    const posts = await res.json();
    const p = posts[Math.floor(Math.random() * posts.length)];
    if (!p) return null;
    const rawContent = p.content?.rendered?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
    return { id: p.id, title: p.title?.rendered || '', url: p.link || '', content: rawContent.slice(0, 3000) };
  } catch { return null; }
}

function isEnglishSub(sub) {
  return sub === 'r/solotravel';
}

async function generateReply(sub, threadTitle, opContent, article, includeLink) {
  const isEN = isEnglishSub(sub);
  const toneRules = isEN ? TONE_RULES_EN : TONE_RULES_FR;
  const utmSource = 'reddit';
  const utmCampaign = isEN ? 'reddit_en' : 'reddit_fr';

  const linkInstruction = includeLink && article
    ? (isEN
        ? `\nINCLUDE THIS LINK naturally in your reply (woven into a sentence, NOT at the end): ${article.url}?utm_source=${utmSource}&utm_medium=community&utm_campaign=${utmCampaign}`
        : `\nINCLUS CE LIEN naturellement dans ta reponse (integre dans une phrase, PAS a la fin) : ${article.url}?utm_source=${utmSource}&utm_medium=community&utm_campaign=${utmCampaign}`)
    : (isEN
        ? '\nDo NOT include any link in this reply.'
        : '\nNE mets AUCUN lien dans cette reponse.');

  const articleContext = article
    ? (isEN
        ? `\nContext (FlashVoyage article, use as source but DO NOT copy word for word):\n${article.content.slice(0, 2000)}`
        : `\nContexte (article FlashVoyage, utilise comme source mais NE COPIE PAS mot pour mot) :\n${article.content.slice(0, 2000)}`)
    : '';

  const persona = isEN
    ? 'You are FloAsie/Florian, a French expat living in Thailand who replies on Reddit.'
    : 'Tu es FloAsie/Florian, francais expat en Thailande qui repond sur Reddit.';

  const prompt = `${persona}

Subreddit: ${sub}
Thread title: "${threadTitle}"
OP post:
${(opContent || threadTitle).slice(0, 1200)}

${toneRules}
${linkInstruction}
${articleContext}

${isEN ? 'Write your Reddit comment now. Plain text with Reddit markdown (no headers). 100-250 words.' : 'Ecris ton commentaire Reddit maintenant. Texte brut avec markdown Reddit (pas de headers). 100-250 mots.'}`;

  const text = await callHaiku([{ role: 'user', content: prompt }], 800);
  return text;
}

// ── Posting on old.reddit.com ──

function fillCommentAndSubmit(content) {
  const encoded = encodeURIComponent(content);

  // Check if locked/archived
  const isLocked = chromeJS(`
(function() {
  if (document.querySelector('.locked-tagline, .archived-tagline')) return 'locked';
  if (document.body.textContent.includes('comments are locked') || document.body.textContent.includes('archived')) return 'locked';
  var forms = document.querySelectorAll('form.usertext');
  if (forms.length === 0) return 'no_form';
  return 'open';
})()
`);
  if (isLocked === 'locked' || isLocked === 'no_form') {
    console.log(`[REDDIT-FR] Post is locked/archived (${isLocked})`);
    return 'locked';
  }

  // Fill the textarea
  const fillResult = chromeJS(`
(function() {
  window.__redditContent = decodeURIComponent("${encoded}");
  // old.reddit: find the TOP-LEVEL comment form (not reply forms)
  var forms = document.querySelectorAll('form.usertext.cloneable');
  var ta = null;
  if (forms.length > 0) {
    ta = forms[0].querySelector('textarea');
  }
  if (!ta) ta = document.querySelector('.usertext-edit textarea, textarea[name="text"]');
  if (ta) {
    ta.value = window.__redditContent;
    ta.focus();
    ta.dispatchEvent(new Event('input', {bubbles: true}));
    ta.dispatchEvent(new Event('change', {bubbles: true}));
    return 'textarea';
  }
  // new reddit fallback: contenteditable div
  var ce = document.querySelector('[contenteditable="true"]');
  if (ce) {
    ce.textContent = window.__redditContent;
    ce.dispatchEvent(new Event('input', {bubbles: true}));
    return 'contenteditable';
  }
  // Maybe need to click "Add a comment" first
  var addComment = Array.from(document.querySelectorAll('div, button, span')).find(function(el) {
    return el.textContent.includes('Add a comment') || el.textContent.includes('What are your thoughts');
  });
  if (addComment) { addComment.click(); return 'CLICKED_ADD'; }
  return 'NO_EDITOR';
})()
`);

  if (fillResult === 'CLICKED_ADD') {
    sleep(3000);
    const retryFill = chromeJS(`
(function() {
  var ta = document.querySelector('.usertext-edit textarea, textarea[name="text"]');
  if (ta) { ta.value = window.__redditContent; ta.focus(); ta.dispatchEvent(new Event('input', {bubbles:true})); return 'textarea'; }
  var ce = document.querySelector('[contenteditable="true"]');
  if (ce) { ce.textContent = window.__redditContent; ce.dispatchEvent(new Event('input', {bubbles:true})); return 'contenteditable'; }
  return 'NO_EDITOR';
})()
`);
    if (retryFill === 'NO_EDITOR' || retryFill === 'ERROR') {
      console.log('[REDDIT-FR] Comment editor not found after click');
      return 'no_editor';
    }
    console.log(`[REDDIT-FR] Content set via ${retryFill} (after click)`);
  } else if (fillResult === 'NO_EDITOR' || fillResult === 'ERROR' || fillResult === 'missing value') {
    console.log('[REDDIT-FR] Comment editor not found');
    return 'no_editor';
  } else {
    console.log(`[REDDIT-FR] Content set via ${fillResult}`);
  }

  sleep(2000);

  // Submit
  const submitResult = chromeJS(`
(function() {
  // old.reddit: button.save inside .usertext-edit
  var saveBtn = document.querySelector('.usertext-edit .save, .usertext-edit button[type="submit"], button.save');
  if (saveBtn) { saveBtn.click(); return 'save_click'; }
  // Fallback: any button with "comment" or "save" text
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    var t = btns[i].textContent.toLowerCase().trim();
    if (t === 'save' || t === 'comment' || t === 'reply') { btns[i].click(); return 'btn_' + t; }
  }
  // Fallback: form submit
  var form = document.querySelector('.usertext-edit form, form.usertext');
  if (form) { form.submit(); return 'form_submit'; }
  return 'NO_BUTTON';
})()
`);
  console.log(`[REDDIT-FR] Submit: ${submitResult}`);
  sleep(6000);

  // Verify
  const verifyResult = chromeJS(`
(function() {
  var content = window.__redditContent || '';
  var snippet = content.substring(0, 50);
  if (document.body.textContent.includes(snippet)) return 'FOUND';
  var errors = document.querySelectorAll('.error, .status-msg');
  for (var i = 0; i < errors.length; i++) {
    var t = errors[i].textContent.trim();
    if (t.length > 5) return 'ERROR:' + t.substring(0, 100);
  }
  return 'NOT_FOUND';
})()
`);

  const success = verifyResult === 'FOUND' || (submitResult !== 'NO_BUTTON' && !verifyResult.startsWith('ERROR:'));
  console.log(`[REDDIT-FR] ${success ? 'SUCCESS' : 'FAILED'} -- verify: ${verifyResult}`);
  return success ? 'success' : 'submit_failed';
}

// ── Main ──

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('[REDDIT-FR] ANTHROPIC_API_KEY not set. Cannot generate replies.');
    process.exit(1);
  }

  const postedIds = getPostedThreadIds();
  console.log(`[REDDIT-FR] Already posted to ${postedIds.size} threads`);

  // Pick a sub: rotate based on current hour to spread across subs
  const now = new Date();
  const hourSlot = now.getHours();
  // Shuffle order: try primary sub first, then fallbacks
  const primaryIndex = (now.getDate() + hourSlot) % SUBS.length;
  const subOrder = [];
  for (let i = 0; i < SUBS.length; i++) {
    subOrder.push(SUBS[(primaryIndex + i) % SUBS.length]);
  }

  chromeNewTab();
  sleep(1000);

  try {
    let selectedThread = null;
    let selectedSub = null;

    // ── Phase 1: Find a thread to reply to ──
    for (const sub of subOrder) {
      console.log(`[REDDIT-FR] Scanning ${sub}...`);
      const threads = scrapeThreadList(sub);
      console.log(`[REDDIT-FR] Found ${threads.length} threads in ${sub}`);

      // Check login on first sub
      if (sub === subOrder[0]) {
        const user = checkLogin();
        if (!user) {
          console.log('[REDDIT-FR] Not logged in! Please log in to Reddit in Chrome.');
          log({ date: now.toISOString(), platform: 'reddit_fr', sub, status: 'login_failed' });
          return;
        }
        console.log(`[REDDIT-FR] Logged in as: ${user}`);
      }

      // Filter threads
      const candidates = threads.filter(t => {
        // Skip locked/archived
        if (t.locked) return false;
        // Skip already posted
        if (postedIds.has(t.threadId)) return false;
        // Must be recent (< 1 month)
        if (!isRecentEnough(t.submittedAgo)) return false;
        // For filtered subs, check travel keywords
        if (FILTERED_SUBS.has(sub) && !matchesTravelKeywords(t.title)) return false;
        return true;
      });

      console.log(`[REDDIT-FR] Candidates in ${sub}: ${candidates.length}`);

      if (candidates.length > 0) {
        // Prefer threads with some engagement but not too many comments (sweet spot: 2-50)
        candidates.sort((a, b) => {
          const scoreA = a.commentCount >= 2 && a.commentCount <= 50 ? 1 : 0;
          const scoreB = b.commentCount >= 2 && b.commentCount <= 50 ? 1 : 0;
          return scoreB - scoreA;
        });
        selectedThread = candidates[0];
        selectedSub = sub;
        break;
      }
    }

    if (!selectedThread) {
      console.log('[REDDIT-FR] No suitable threads found in any sub');
      return;
    }

    console.log(`[REDDIT-FR] Selected: "${selectedThread.title}" (${selectedThread.submittedAgo}, ${selectedThread.commentCount} comments)`);
    console.log(`[REDDIT-FR] URL: ${selectedThread.url}`);

    // ── Phase 2: Navigate to thread, read OP ──
    chromeNav(selectedThread.url);
    sleep(8000);
    if (!waitForPage()) {
      console.log('[REDDIT-FR] Thread page load timeout');
      return;
    }
    console.log(`[REDDIT-FR] On: "${chromeTitle()}"`);

    const opContent = readOPContent();
    console.log(`[REDDIT-FR] OP (${(opContent || '').length} chars): "${(opContent || '').substring(0, 100)}..."`);

    // ── Phase 3: Decide on link inclusion and generate reply ──
    const includeLink = Math.random() < LINK_RATIO;
    let article = null;
    if (includeLink) {
      article = await fetchRelevantArticle(selectedThread.title);
      if (article) {
        console.log(`[REDDIT-FR] Article for link: "${article.title}"`);
      } else {
        console.log('[REDDIT-FR] Could not fetch article, posting without link');
      }
    }

    console.log('[REDDIT-FR] Generating reply via Haiku...');
    const reply = await generateReply(selectedSub, selectedThread.title, opContent, article, includeLink && !!article);

    if (!reply || reply.length < 30) {
      console.log('[REDDIT-FR] AI generation failed or too short');
      log({ date: now.toISOString(), platform: 'reddit_fr', sub: selectedSub, threadId: selectedThread.threadId, status: 'generation_failed' });
      return;
    }
    console.log(`[REDDIT-FR] Generated (${reply.length} chars):`);
    console.log(reply.substring(0, 200) + '...');

    // ── Phase 4: Post the comment ──
    const result = fillCommentAndSubmit(reply);

    // ── Phase 5: Log ──
    const success = result === 'success';
    const hasLink = includeLink && !!article && reply.includes('flashvoyage.com');
    log({
      date: now.toISOString(),
      platform: 'reddit_fr',
      sub: selectedSub,
      threadId: selectedThread.threadId,
      thread: selectedThread.title,
      postUrl: selectedThread.url,
      hasLink,
      success,
      generated: true,
      articleId: article?.id || null,
      commentCount: selectedThread.commentCount,
    });

    if (success) {
      console.log(`[REDDIT-FR] Comment posted on ${selectedSub}: "${selectedThread.title}"`);
    } else {
      console.log(`[REDDIT-FR] Failed to post (${result})`);
    }
  } finally {
    chromeCloseTab();
  }
}

main().catch(err => { console.error('[REDDIT-FR FATAL]', err.message); process.exit(1); });
