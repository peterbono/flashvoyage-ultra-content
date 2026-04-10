#!/usr/bin/env node
/**
 * TripAdvisor France Forum Local Poster
 * 1. Picks a random SEA forum section
 * 2. Scrapes recent threads (< 2 months)
 * 3. Picks one we haven't replied to (checks linkbuilding-log.jsonl)
 * 4. Reads the OP question
 * 5. Generates a reply via Haiku AI
 * 6. Finds the reply form and submits
 *
 * Conservative: 1 post per run max (TripAdvisor is strict on spam).
 * Tracks window ID + tab index to avoid Claude extension tab conflicts.
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
const LINK_RATIO = 0.15; // 15% -- TripAdvisor is stricter about links

const SECTIONS = [
  { name: 'Thailande', url: 'https://www.tripadvisor.fr/ShowForum-g293915-i3686-Thailand.html' },
  { name: 'Vietnam', url: 'https://www.tripadvisor.fr/ShowForum-g293921-i3690-Vietnam.html' },
  { name: 'Bali', url: 'https://www.tripadvisor.fr/ShowForum-g294226-i7220-Bali.html' },
  { name: 'Cambodge', url: 'https://www.tripadvisor.fr/ShowForum-g293939-i9231-Cambodia.html' },
  { name: 'Japon', url: 'https://www.tripadvisor.fr/ShowForum-g294232-i3684-Japan.html' },
  { name: 'Philippines', url: 'https://www.tripadvisor.fr/ShowForum-g294245-i3691-Philippines.html' },
];

const TONE_RULES = `
REGLES DE TON (OBLIGATOIRE -- ton de voyageur francais, PAS de ton IA) :
1. JAMAIS de tiret cadratin. Utilise virgules, points, parentheses ou '...'
2. Francais conversationnel, tutoiement.
3. Ratio 40% anecdote / 60% info pratique.
4. Reagis directement a la question du PO. Pas de salutation en intro.
5. Prix en EUROS uniquement.
6. 150-300 mots (TripAdvisor = reponses plus courtes que forums voyage).
7. PAS de markdown (pas de # ## ** etc). Texte brut avec retours a la ligne.
8. Tu es Florian, mec francais expat en Thailande qui partage son vecu.
9. Si tu inclus un lien, integre-le naturellement dans une phrase, pas a la fin.
10. Connecteurs oraux : "du coup", "en vrai", "perso", "bref", "genre"
11. Marqueurs d'incertitude : "de memoire", "je crois que", "a verifier"
12. Opinions franches : "honnetement evite X"
13. Varie la longueur des phrases (courtes melangees avec longues)
14. Pas de titre en debut de reponse. Commence directement.
`;

// ── Helpers ──

function logEntry(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

function osa(script) {
  fs.writeFileSync('/tmp/fv-ta-osa.scpt', script);
  try {
    return execSync('osascript /tmp/fv-ta-osa.scpt', { timeout: 30000 }).toString().trim();
  } catch (e) {
    console.log('[TA OSA ERROR]', e.message.substring(0, 200));
    return 'ERROR';
  }
}

// ── Chrome tab management ──

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
  console.log(`[TA] Tab created: window=${WIN_ID} tab=${TAB_INDEX}`);
  return result;
}

function chromeJS(js) {
  fs.writeFileSync('/tmp/fv-ta-js.js', js);
  const winRef = getWinRef();
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`set jsCode to read POSIX file "/tmp/fv-ta-js.js"
tell application "Google Chrome"
  set w to ${winRef}
  set t to ${tabRef}
  execute t javascript jsCode
end tell`);
}

function chromeNav(url) {
  fs.writeFileSync('/tmp/fv-ta-url.txt', url);
  const winRef = getWinRef();
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`set targetURL to read POSIX file "/tmp/fv-ta-url.txt"
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

function chromeURL() {
  const winRef = getWinRef();
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`tell application "Google Chrome"
  set w to ${winRef}
  set t to ${tabRef}
  get URL of t
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

// ── French date parsing ──

const FR_MONTHS = {
  'janv': 0, 'janvier': 0, 'fevr': 1, 'fevrier': 1, 'février': 1, 'mars': 2,
  'avr': 3, 'avril': 3, 'mai': 4, 'juin': 5, 'juil': 6, 'juillet': 6,
  'août': 7, 'aout': 7, 'sept': 8, 'septembre': 8, 'oct': 9, 'octobre': 9,
  'nov': 10, 'novembre': 10, 'dec': 11, 'décembre': 11, 'decembre': 11,
};

function parseFrDate(dateStr) {
  if (!dateStr) return null;
  // "31 mars 2026" or "4 avr. 2026" or "il y a 2 jours"
  const relativeMatch = dateStr.match(/il y a (\d+) jour/);
  if (relativeMatch) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(relativeMatch[1]));
    return d;
  }
  const relativeHours = dateStr.match(/il y a (\d+) heure/);
  if (relativeHours) return new Date(); // posted today
  const relativeSemaines = dateStr.match(/il y a (\d+) semaine/);
  if (relativeSemaines) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(relativeSemaines[1]) * 7);
    return d;
  }
  const m = dateStr.match(/(\d{1,2})\s+(\w+)\.?\s+(\d{4})/);
  if (!m) return null;
  const month = FR_MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(parseInt(m[3]), month, parseInt(m[1]));
}

function isRecent(dateStr, maxDaysOld = 60) {
  const d = parseFrDate(dateStr);
  if (!d) return true; // if we can't parse the date, give it a chance
  const now = new Date();
  const diffDays = (now - d) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= maxDaysOld;
}

// ── Thread discovery ──

function scrapeThreads(section) {
  console.log(`[TA] Navigating to: ${section.url}`);
  chromeNav(section.url);
  sleep(8000); // TripAdvisor can be slow

  // Verify the page loaded (not a 404 or redirect)
  const pageTitle = chromeTitle();
  const pageURL = chromeURL();
  console.log(`[TA] Page loaded: "${pageTitle}"`);
  console.log(`[TA] Current URL: ${pageURL}`);

  if (!pageTitle || pageTitle === 'ERROR' || pageTitle === 'missing value') {
    console.log('[TA] Page failed to load');
    return [];
  }
  // Check for 404 or error page
  if (pageTitle.toLowerCase().includes('page introuvable') ||
      pageTitle.toLowerCase().includes('not found') ||
      pageTitle.toLowerCase().includes('erreur')) {
    console.log('[TA] Forum page returned 404 or error');
    return [];
  }

  // Scrape thread links from the forum listing
  // TripAdvisor uses ShowTopic links for threads
  const linksRaw = chromeJS(`
(function() {
  var results = [];
  var links = document.querySelectorAll('a[href*="ShowTopic"]');
  if (links.length === 0) {
    // Fallback: try broader selector
    links = document.querySelectorAll('a[href*="/ShowTopic-"]');
  }
  for (var i = 0; i < links.length && results.length < 30; i++) {
    var href = links[i].getAttribute('href') || links[i].href || '';
    var text = (links[i].textContent || '').trim();
    if (text.length < 10 || text.length > 300) continue;
    // Deduplicate by href
    var isDupe = false;
    for (var j = 0; j < results.length; j++) {
      if (results[j].indexOf(href) >= 0) { isDupe = true; break; }
    }
    if (isDupe) continue;
    // Normalize href to full URL
    if (href.startsWith('/')) href = 'https://www.tripadvisor.fr' + href;
    results.push(href + '|||' + text.substring(0, 200));
  }
  return results.join('###');
})()
`);

  if (!linksRaw || linksRaw === 'ERROR' || linksRaw === 'missing value') {
    console.log('[TA] No thread links found on page');
    // Debug: dump what we see
    const debugText = chromeJS(`document.body.innerText.substring(0, 500)`);
    console.log('[TA] Page content preview:', (debugText || '').substring(0, 200));
    return [];
  }

  // Try to extract date info from the page
  const datesRaw = chromeJS(`
(function() {
  var results = [];
  // TripAdvisor shows dates near threads, often in spans or small text
  // Try to grab all visible date-like text near thread entries
  var rows = document.querySelectorAll('tr, li, div[class*="topic"], div[class*="thread"], div[class*="Topic"]');
  if (rows.length === 0) rows = document.querySelectorAll('div, li');
  for (var i = 0; i < rows.length && results.length < 60; i++) {
    var text = rows[i].textContent || '';
    // Look for dates like "il y a X jours", "15 mars 2026", etc.
    var dateMatch = text.match(/(il y a \\d+ (?:jour|heure|semaine|mois)s?|\\d{1,2}\\s+(?:janv|fevr|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)\\w*\\.?\\s+\\d{4})/i);
    if (dateMatch) {
      // Find associated ShowTopic link
      var link = rows[i].querySelector('a[href*="ShowTopic"]');
      var href = link ? (link.getAttribute('href') || link.href || '') : '';
      if (href.startsWith('/')) href = 'https://www.tripadvisor.fr' + href;
      results.push(href + '|||' + dateMatch[1]);
    }
  }
  return results.join('###');
})()
`);

  const threads = [];
  const dateMap = {};

  // Parse dates
  if (datesRaw && datesRaw !== 'ERROR' && datesRaw !== 'missing value') {
    for (const entry of datesRaw.split('###').filter(Boolean)) {
      const [href, dateStr] = entry.split('|||');
      if (href && dateStr) dateMap[href] = dateStr;
    }
  }

  // Parse thread links
  for (const entry of linksRaw.split('###').filter(Boolean)) {
    const sepIdx = entry.indexOf('|||');
    if (sepIdx < 0) continue;
    const href = entry.substring(0, sepIdx);
    const title = entry.substring(sepIdx + 3);
    if (!href || !title) continue;

    // Extract a slug/id from the URL for dedup
    // ShowTopic URLs look like: /ShowTopic-g293915-i3686-k14123456-Some_Title-Thailand.html
    const idMatch = href.match(/ShowTopic-[^-]+-[^-]+-k(\d+)/);
    const threadId = idMatch ? idMatch[1] : href;

    const dateStr = dateMap[href] || null;
    threads.push({
      threadId,
      title,
      url: href,
      dateStr,
      recent: isRecent(dateStr, 60),
    });
  }

  return threads;
}

// ── Login check ──

function checkLogin() {
  const result = chromeJS(`
(function() {
  // TripAdvisor shows user avatar/name when logged in
  // Check for common logged-in indicators
  var indicators = [
    document.querySelector('img[class*="avatar"], img[class*="Avatar"]'),
    document.querySelector('a[href*="/Profile/"], a[href*="/members/"]'),
    document.querySelector('[class*="ProfileMenu"], [class*="profileMenu"]'),
    document.querySelector('button[class*="sign-out"], a[href*="logout"]'),
    document.querySelector('[data-test-target="header-profile"]'),
  ];
  for (var i = 0; i < indicators.length; i++) {
    if (indicators[i]) return 'logged_in';
  }
  // Check body text as fallback
  var text = document.body.innerText.substring(0, 5000);
  if (text.includes('Mon profil') || text.includes('Deconnexion') || text.includes('Se deconnecter')) {
    return 'logged_in';
  }
  // Check if sign-in button is visible (meaning NOT logged in)
  var signIn = document.querySelector('a[href*="RegistrationController"], button[class*="sign-in"], a[class*="signIn"]');
  if (signIn) return 'not_logged_in';
  // Can't determine -- assume logged in (the reply form will fail anyway if not)
  return 'unknown';
})()
`);
  return result;
}

// ── Read OP question ──

function readThreadQuestion() {
  return chromeJS(`
(function() {
  // TripAdvisor thread: the first post / original question
  // Try multiple selectors for the OP content
  var selectors = [
    '.post-text',
    '.postBody',
    '[class*="reviewText"]',
    '[class*="PostText"]',
    '[class*="forumPost"]',
    '.entry .partial_entry',
    '.entry',
    '[data-test-target="post-content"]',
    '.social-sections-ForumPostDisplay__post--',
  ];
  for (var i = 0; i < selectors.length; i++) {
    var els = document.querySelectorAll(selectors[i]);
    if (els.length > 0) {
      return els[0].textContent.trim().substring(0, 2000);
    }
  }
  // Fallback: grab main content area text, skip navigation
  var main = document.querySelector('main, [role="main"], #BODY_BLOCK_JQUERY_RE498');
  if (main) return main.innerText.substring(0, 2000);
  // Last resort: body text, skip first 500 chars (usually nav)
  var body = document.body.innerText;
  var lines = body.split('\\n').filter(function(l) { return l.trim().length > 20; });
  return lines.slice(3, 20).join('\\n').substring(0, 2000);
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
  if (data.error) {
    console.log('[TA] Haiku API error:', data.error.message || JSON.stringify(data.error));
    return null;
  }
  return data.content?.[0]?.text?.trim() || null;
}

async function fetchRandomArticle() {
  try {
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
  } catch (e) {
    console.log('[TA] WP API error:', e.message);
    return null;
  }
}

async function generateReply(threadTitle, threadContent, article, includeLink) {
  const linkInstruction = includeLink && article
    ? `\nINCLUS CE LIEN a la fin d'une phrase d'introduction claire (TripAdvisor n'accepte pas de markdown). Exemple: "Pour un comparatif detaille entre destinations : ${article.url}" ou "J'ai detaille les budgets ici : ${article.url}". L'URL doit etre propre, sans UTM. Sois subtil pour eviter les filtres anti-spam de TripAdvisor.`
    : '\nNE mets AUCUN lien dans cette reponse.';

  const articleContext = article
    ? `\nContexte (article FlashVoyage, utilise comme source mais NE COPIE PAS mot pour mot) :\n${article.content.slice(0, 2000)}`
    : '';

  const text = await callHaiku([{
    role: 'user',
    content: `Tu es Florian, voyageur francais expat en Thailande qui repond sur le forum TripAdvisor France.

Thread : "${threadTitle}"
Question posee :
${(threadContent || '').slice(0, 1200)}

${TONE_RULES}
${linkInstruction}
${articleContext}

Ecris ta reponse maintenant. Texte brut avec des retours a la ligne (pas de HTML, pas de markdown). Maximum 300 mots.`,
  }], 800);
  return text;
}

// ── Reply form interaction ──

function findAndFillReplyForm(content) {
  const encoded = encodeURIComponent(content);

  // Step 1: Try to find and click any "reply" / "repondre" button first
  const clickResult = chromeJS(`
(function() {
  var selectors = [
    'button[class*="reply"], button[class*="Reply"]',
    'a[class*="reply"], a[class*="Reply"]',
    'button[data-test-target="reply-button"]',
    'a[href*="reply"], a[href*="Reply"]',
    '[class*="ReplyButton"], [class*="replyButton"]',
    'input[value*="pondre"], input[value*="Reply"]',
    'button:not([disabled])',
  ];
  for (var i = 0; i < selectors.length; i++) {
    var els = document.querySelectorAll(selectors[i]);
    for (var j = 0; j < els.length; j++) {
      var text = (els[j].textContent || els[j].value || '').trim().toLowerCase();
      if (text.includes('reply') || text.includes('pondre') || text.includes('repondre') ||
          text.includes('poster') || text.includes('ecrire')) {
        els[j].click();
        return 'clicked:' + selectors[i] + ':' + text.substring(0, 30);
      }
    }
  }
  return 'no_reply_button';
})()
`);
  console.log(`[TA] Reply button: ${clickResult}`);
  if (clickResult && clickResult.startsWith('clicked')) {
    sleep(4000); // Wait for reply form to appear
  }

  // Step 2: Find the reply textarea/editor and fill it
  let editorUsed = null;
  for (let attempt = 0; attempt < 5 && !editorUsed; attempt++) {
    chromeJS(`window.__taContent = decodeURIComponent("${encoded}")`);
    sleep(500);

    editorUsed = chromeJS(`
(function() {
  var text = window.__taContent;
  if (!text) return null;

  // Try multiple textarea selectors
  var textareaSelectors = [
    'textarea[name="postBody"]',
    'textarea[name="post"]',
    'textarea[name="body"]',
    'textarea[name="message"]',
    'textarea[name="reviewText"]',
    'textarea[class*="post"], textarea[class*="Post"]',
    'textarea[class*="reply"], textarea[class*="Reply"]',
    'textarea[id*="post"], textarea[id*="Post"]',
    'textarea[id*="reply"], textarea[id*="Reply"]',
    'textarea[placeholder*="ponse"], textarea[placeholder*="reply"]',
    'textarea',
  ];
  for (var i = 0; i < textareaSelectors.length; i++) {
    var ta = document.querySelector(textareaSelectors[i]);
    if (ta && ta.offsetParent !== null) {
      ta.value = text;
      ta.dispatchEvent(new Event('input', {bubbles: true}));
      ta.dispatchEvent(new Event('change', {bubbles: true}));
      // Also try React/Angular setter
      var nativeSet = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      if (nativeSet && nativeSet.set) {
        nativeSet.set.call(ta, text);
        ta.dispatchEvent(new Event('input', {bubbles: true}));
      }
      return 'textarea:' + textareaSelectors[i];
    }
  }

  // Try contenteditable
  var ceSelectors = [
    '[contenteditable="true"]',
    '[role="textbox"]',
    'div[class*="editor"], div[class*="Editor"]',
    'div[class*="ql-editor"]',
    '.DraftEditor-root [contenteditable]',
  ];
  for (var i = 0; i < ceSelectors.length; i++) {
    var ce = document.querySelector(ceSelectors[i]);
    if (ce && ce.offsetParent !== null) {
      ce.innerText = text;
      ce.dispatchEvent(new Event('input', {bubbles: true}));
      return 'contenteditable:' + ceSelectors[i];
    }
  }

  // Try iframe editor
  var iframes = document.querySelectorAll('iframe');
  for (var i = 0; i < iframes.length; i++) {
    try {
      var doc = iframes[i].contentDocument;
      if (doc && doc.body && doc.body.contentEditable === 'true') {
        doc.body.innerText = text;
        return 'iframe:' + i;
      }
    } catch(e) {}
  }

  return null;
})()
`);

    if (!editorUsed || editorUsed === 'missing value') {
      editorUsed = null;
      console.log(`[TA] Editor not ready (${attempt + 1}/5)...`);
      sleep(5000);
    }
  }

  if (!editorUsed) {
    console.log('[TA] Could not find reply form editor');
    // Debug: list all textareas and contenteditables on page
    const debug = chromeJS(`
(function() {
  var ta = document.querySelectorAll('textarea');
  var ce = document.querySelectorAll('[contenteditable="true"]');
  var forms = document.querySelectorAll('form');
  return 'textareas:' + ta.length + ' ce:' + ce.length + ' forms:' + forms.length;
})()
`);
    console.log('[TA] Debug form elements:', debug);
    return 'editor_not_found';
  }
  console.log(`[TA] Content set via ${editorUsed}`);
  return editorUsed;
}

function submitReplyForm() {
  // Try to find and click the submit button
  const submitResult = chromeJS(`
(function() {
  // Try specific submit buttons first
  var selectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button[class*="submit"], button[class*="Submit"]',
    'button[class*="post"], button[class*="Post"]',
    'button[data-test-target="submit-post"]',
    'input[value*="Publier"], input[value*="Envoyer"], input[value*="poster"]',
    'button',
  ];
  for (var i = 0; i < selectors.length; i++) {
    var els = document.querySelectorAll(selectors[i]);
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      var text = (el.textContent || el.value || '').trim().toLowerCase();
      // Match submit-like text
      if (text.includes('publier') || text.includes('envoyer') || text.includes('poster') ||
          text.includes('soumettre') || text.includes('submit') || text.includes('post') ||
          text.includes('reply') || text.includes('pondre')) {
        // Verify it's visible
        if (el.offsetParent === null && !el.offsetWidth) continue;
        el.click();
        return 'clicked:' + selectors[i] + ':' + text.substring(0, 30);
      }
    }
  }

  // Last resort: try form.submit()
  var forms = document.querySelectorAll('form');
  for (var i = 0; i < forms.length; i++) {
    var ta = forms[i].querySelector('textarea, [contenteditable="true"]');
    if (ta) {
      try { forms[i].submit(); return 'form_submit:' + i; }
      catch(e) { return 'form_submit_err:' + e.message; }
    }
  }

  return 'no_submit_button';
})()
`);
  return submitResult;
}

// ── Already replied check ──

function checkAlreadyReplied() {
  return chromeJS(`
(function() {
  // Check if "Florian" or "floriangouloubi" appears as a post author on this page
  var text = document.body.innerText;
  // Look for username in post authors (not just any mention)
  var authorSelectors = [
    'a[href*="/Profile/"]',
    'a[href*="/members/"]',
    '[class*="author"], [class*="Author"]',
    '[class*="username"], [class*="Username"]',
    '.postHeader a',
  ];
  for (var i = 0; i < authorSelectors.length; i++) {
    var els = document.querySelectorAll(authorSelectors[i]);
    for (var j = 0; j < els.length; j++) {
      var name = (els[j].textContent || '').trim().toLowerCase();
      if (name.includes('florian') || name.includes('floriangouloubi') || name.includes('floasie')) {
        return 'yes';
      }
    }
  }
  return 'no';
})()
`);
}

// ── Main ──

async function main() {
  // Load or init plan
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  } catch {
    plan = { status: {}, total_posted: 0 };
  }
  if (!plan.status.tripadvisor) plan.status.tripadvisor = { posted: 0, posts_done: [] };
  if (!plan.status.tripadvisor.posts_done) plan.status.tripadvisor.posts_done = [];

  // Collect already-posted thread IDs
  const postedIds = new Set(plan.status.tripadvisor.posts_done.map(p => p.threadId));
  const logEntries = fs.existsSync(LOG_PATH)
    ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean)
    : [];
  logEntries.filter(e => e.platform === 'tripadvisor' && e.success).forEach(e => postedIds.add(e.threadId));

  // Check API key
  if (!ANTHROPIC_API_KEY) {
    console.log('[TA] ANTHROPIC_API_KEY is required. Set it via environment variable.');
    return;
  }

  chromeNewTab();
  sleep(1000);

  try {
    // ── Phase 1: Pick a section and scrape threads ──
    // Random section (not day-based, to add variety)
    const section = SECTIONS[Math.floor(Math.random() * SECTIONS.length)];
    console.log(`[TA] Section: ${section.name} (${section.url})`);

    let threads = scrapeThreads(section);
    console.log(`[TA] Found ${threads.length} threads, ${threads.filter(t => t.recent).length} recent`);

    // Filter: recent + not already posted
    let candidates = threads.filter(t => t.recent && !postedIds.has(t.threadId));
    console.log(`[TA] Candidates (recent, unposted): ${candidates.length}`);

    // If no candidates, try another section
    if (candidates.length === 0) {
      const altSection = SECTIONS[Math.floor(Math.random() * SECTIONS.length)];
      if (altSection.url !== section.url) {
        console.log(`[TA] No candidates, trying: ${altSection.name}`);
        const altThreads = scrapeThreads(altSection);
        candidates = altThreads.filter(t => t.recent && !postedIds.has(t.threadId));
        console.log(`[TA] Alt candidates: ${candidates.length}`);
      }
    }

    // Last resort: accept any unposted thread
    if (candidates.length === 0) {
      const allUnposted = threads.filter(t => !postedIds.has(t.threadId));
      if (allUnposted.length > 0) {
        console.log(`[TA] Using any unposted thread (${allUnposted.length} available)`);
        candidates = [allUnposted[0]];
      }
    }

    if (candidates.length === 0) {
      console.log('[TA] No suitable threads found across sections');
      return;
    }

    // Pick a random candidate (not always the first, for variety)
    const target = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
    console.log(`[TA] Target: "${target.title}" (ID: ${target.threadId})`);
    console.log(`[TA] URL: ${target.url}`);

    // ── Phase 2: Navigate to thread, read question ──
    chromeNav(target.url);
    sleep(8000);

    const threadTitle = chromeTitle();
    console.log(`[TA] Thread page: "${threadTitle}"`);

    // Check login status
    const loginStatus = checkLogin();
    console.log(`[TA] Login status: ${loginStatus}`);
    if (loginStatus === 'not_logged_in') {
      console.log('[TA] Not logged in -- please log in to TripAdvisor in Chrome');
      logEntry({ date: new Date().toISOString(), platform: 'tripadvisor', threadId: target.threadId, status: 'login_failed', success: false });
      return;
    }

    // Check if already replied to this thread
    const alreadyReplied = checkAlreadyReplied();
    if (alreadyReplied === 'yes') {
      console.log('[TA] Already replied to this thread, skipping');
      postedIds.add(target.threadId);
      return;
    }

    // Read the OP question
    const threadQuestion = readThreadQuestion();
    console.log(`[TA] Question (${(threadQuestion || '').length} chars): "${(threadQuestion || '').substring(0, 100)}..."`);

    if (!threadQuestion || threadQuestion.length < 20) {
      console.log('[TA] Could not read thread question (too short or missing)');
      return;
    }

    // ── Phase 3: Generate reply ──
    const includeLink = Math.random() < LINK_RATIO;
    const article = includeLink ? await fetchRandomArticle() : null;
    if (article) console.log(`[TA] Article context: "${article.title}"`);

    console.log('[TA] Generating reply via Haiku...');
    const replyContent = await generateReply(target.title, threadQuestion, article, includeLink);
    if (!replyContent || replyContent.length < 50) {
      console.log('[TA] AI generation failed or too short');
      logEntry({ date: new Date().toISOString(), platform: 'tripadvisor', threadId: target.threadId, status: 'generation_failed', success: false });
      return;
    }
    console.log(`[TA] Generated (${replyContent.length} chars):`);
    console.log(replyContent.substring(0, 150) + '...');

    // ── Phase 4: Find and fill the reply form ──
    const fillResult = findAndFillReplyForm(replyContent);
    if (fillResult === 'editor_not_found') {
      // The reply form might be on a separate page -- try navigating to reply URL
      console.log('[TA] Trying to find a reply page link...');
      const replyPageUrl = chromeJS(`
(function() {
  var links = document.querySelectorAll('a');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href') || '';
    var text = (links[i].textContent || '').toLowerCase();
    if (href.includes('PostReply') || href.includes('post_reply') ||
        text.includes('pondre') || text.includes('reply') || text.includes('poster une reponse')) {
      if (href.startsWith('/')) href = 'https://www.tripadvisor.fr' + href;
      return href;
    }
  }
  return 'NONE';
})()
`);
      if (replyPageUrl && replyPageUrl !== 'NONE' && replyPageUrl !== 'ERROR') {
        console.log(`[TA] Found reply page: ${replyPageUrl}`);
        chromeNav(replyPageUrl);
        sleep(6000);
        const retryFill = findAndFillReplyForm(replyContent);
        if (retryFill === 'editor_not_found') {
          console.log('[TA] Still cannot find editor after navigating to reply page');
          logEntry({ date: new Date().toISOString(), platform: 'tripadvisor', section: section.name, threadId: target.threadId, thread: target.title, status: 'editor_not_found', success: false });
          return;
        }
      } else {
        console.log('[TA] No reply page link found');
        logEntry({ date: new Date().toISOString(), platform: 'tripadvisor', section: section.name, threadId: target.threadId, thread: target.title, status: 'no_reply_form', success: false });
        return;
      }
    }

    sleep(2000);

    // ── Phase 5: Submit ──
    console.log('[TA] Submitting reply...');
    const submitResult = submitReplyForm();
    console.log(`[TA] Submit result: ${submitResult}`);

    sleep(10000); // Wait for submission to process

    // Verify success by checking the resulting page
    const afterTitle = chromeTitle();
    const afterURL = chromeURL();
    console.log(`[TA] After submit -- title: "${afterTitle}"`);
    console.log(`[TA] After submit -- URL: ${afterURL}`);

    // Determine success: check if we're back on the thread (not on an error page)
    const successCheck = chromeJS(`
(function() {
  var text = document.body.innerText.substring(0, 3000).toLowerCase();
  if (text.includes('erreur') || text.includes('error') || text.includes('spam') ||
      text.includes('trop de messages') || text.includes('rate limit')) {
    return 'error:' + text.substring(text.indexOf('erreur'), text.indexOf('erreur') + 100);
  }
  if (text.includes('merci') || text.includes('publie') || text.includes('posted') ||
      text.includes('votre reponse') || text.includes('contribution')) {
    return 'confirmed';
  }
  // Check if our content appears on the page (means it was posted)
  var content = window.__taContent;
  if (content && text.includes(content.substring(0, 30).toLowerCase())) {
    return 'content_visible';
  }
  return 'unknown';
})()
`);
    console.log(`[TA] Success check: ${successCheck}`);

    const success = submitResult && submitResult.startsWith('clicked') || submitResult === 'form_submit:0';
    const confirmed = successCheck === 'confirmed' || successCheck === 'content_visible';
    const hasError = successCheck && successCheck.startsWith('error:');
    const finalSuccess = (success || confirmed) && !hasError;

    console.log(`[TA] ${finalSuccess ? 'SUCCESS' : 'UNCERTAIN'} -- submit=${submitResult}, check=${successCheck}`);

    // ── Phase 6: Log and update plan ──
    logEntry({
      date: new Date().toISOString(),
      platform: 'tripadvisor',
      section: section.name,
      threadId: target.threadId,
      thread: target.title,
      hasLink: includeLink && !!replyContent.includes('flashvoyage.com'),
      generated: true,
      articleId: article?.id || null,
      success: finalSuccess,
      submitResult,
      successCheck,
    });

    if (finalSuccess) {
      plan.status.tripadvisor.posted++;
      plan.status.tripadvisor.posts_done.push({
        date: new Date().toISOString(),
        threadId: target.threadId,
        title: target.title,
        section: section.name,
        hasLink: includeLink,
        status: 'published',
      });
      plan.total_posted = (plan.total_posted || 0) + 1;
      fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
      console.log(`[TA] Plan updated. Total posted: ${plan.total_posted}`);
    }

  } finally {
    chromeCloseTab();
    console.log('[TA] Tab closed. Done.');
  }
}

main().catch(err => {
  console.error('[TA FATAL]', err.message);
  chromeCloseTab();
  process.exit(1);
});
