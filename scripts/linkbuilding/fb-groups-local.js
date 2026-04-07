#!/usr/bin/env node
/**
 * Facebook Groups Local Poster — AppleScript Chrome Automation
 *
 * Flow:
 *   1. Picks ONE group per run (rotates through list, tracks last index in week plan)
 *   2. Navigates to the group page
 *   3. Fetches a random FlashVoyage WP article
 *   4. Generates a "discovery share" post via Haiku AI
 *   5. Opens the FB group composer, types content, submits
 *
 * Safety:
 *   - ONE group per run only
 *   - 10-12 min human-like wait before posting (configurable via SKIP_WAIT env)
 *   - Never duplicates content across groups
 *   - Aborts gracefully on any DOM failure (no retries)
 *   - Logs everything to linkbuilding-log.jsonl
 *
 * Facebook DOM notes (FRAGILE — FB uses React with dynamic class names):
 *   - All selectors use ARIA roles/attributes, NOT class names
 *   - The composer trigger, textbox, and submit button selectors will likely
 *     need maintenance when FB updates their UI
 *   - execCommand('insertText') is used instead of innerHTML because React
 *     watches for native input events
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
const SKIP_WAIT = process.env.SKIP_WAIT === '1'; // Set SKIP_WAIT=1 for dev/testing

const GROUPS = [
  { name: 'Expatries en Thailande', url: 'https://www.facebook.com/groups/expatsenthailande/' },
  { name: 'Voyage en Asie du Sud-Est', url: 'https://www.facebook.com/groups/voyageasie/' },
  { name: 'Backpackers francophones', url: 'https://www.facebook.com/groups/backpackersfrancophones/' },
  { name: 'French in Bangkok', url: 'https://www.facebook.com/groups/frenchinbangkok/' },
  { name: 'Francais au Vietnam', url: 'https://www.facebook.com/groups/francaisauvietnam/' },
];

const TONE_RULES = `
REGLES DE TON (OBLIGATOIRE) :
1. Tu es Florian, expat en Thailande, membre du groupe
2. Commence par une anecdote ou question qui accroche
3. Partage un insight utile tire de ton experience
4. Si tu inclus un lien, c'est naturel : "je suis tombe sur cet article qui resume bien : [lien]"
5. 80-150 mots max
6. PAS de hashtags
7. PAS de ton promotionnel
8. Tutoie les gens
9. Pose une question a la fin pour engager ("et vous, vous avez eu le meme probleme ?")
10. Connecteurs oraux : "du coup", "en vrai", "perso", "bref", "genre"
11. JAMAIS de tiret cadratin. Utilise virgules, points, parentheses ou '...'
12. JAMAIS de markdown. Texte brut uniquement (sauts de ligne simples).
13. JAMAIS de formule clickbait ou de ton influenceur.
14. PRIX EN EUROS UNIQUEMENT.
15. Registre familier mais pas vulgaire.
`;

// ── Utilities ──

function logEntry(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

function osa(script) {
  fs.writeFileSync('/tmp/fv-osa.scpt', script);
  try { return execSync('osascript /tmp/fv-osa.scpt', { timeout: 30000 }).toString().trim(); }
  catch (e) { console.log('[FB-OSA ERROR]', e.message); return 'ERROR'; }
}

// ── Chrome helpers (same pattern as vf-local.js / quora-local.js) ──

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
  console.log(`[FB] Tab created: window=${WIN_ID} tab=${TAB_INDEX}`);
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

// ── WP Article Fetching ──

async function fetchRandomArticle(excludeIds = new Set()) {
  try {
    const totalRes = await fetch(`${WP_API}/posts?per_page=1&_fields=id`, { method: 'HEAD' });
    const total = parseInt(totalRes.headers.get('x-wp-total') || '100');
    const maxPage = Math.ceil(total / 10);

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
  } catch (e) {
    console.log('[FB] WP fetch error:', e.message);
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

async function generatePost(article, groupName) {
  const utmUrl = `${article.url}?utm_source=fb_group&utm_medium=community&utm_campaign=s1`;

  const text = await callHaiku([{
    role: 'user',
    content: `Tu es Florian, expat francais en Thailande et membre du groupe Facebook "${groupName}".

Tu veux partager une decouverte utile avec le groupe. Format "Type B: discovery share" :
"Je viens de tomber sur un truc que j'aurais voulu savoir avant mon voyage au [pays]..."

Article source (utilise comme base, NE COPIE PAS mot pour mot) :
Titre: ${article.title}
Contenu: ${article.content.slice(0, 2000)}

Lien a inclure naturellement dans le texte : ${utmUrl}

${TONE_RULES}

Ecris le post Facebook maintenant. Texte brut, sauts de ligne simples. Pas de markdown, pas de HTML.`,
  }], 500);
  return text;
}

// ── Group rotation ──

function getNextGroupIndex(plan) {
  if (!plan.status.fb_groups) {
    plan.status.fb_groups = { posted: 0, last_group_index: -1, posts_done: [] };
  }
  const lastIdx = plan.status.fb_groups.last_group_index ?? -1;
  return (lastIdx + 1) % GROUPS.length;
}

// ── Facebook DOM interaction ──
// WARNING: All selectors below target ARIA roles and text content because
// Facebook uses obfuscated/dynamic CSS class names that change on every deploy.
// These selectors WILL need maintenance when FB updates their UI.

/**
 * Step 1: Click the composer trigger ("Quoi de neuf" / "Write something" box)
 *
 * FRAGILE SELECTORS:
 * - div[role="button"] with text matching "Quoi de neuf" / "Write something" / "Ecrivez quelque chose"
 * - The composer trigger might also be a span inside a div[role="button"]
 * - FB sometimes uses [aria-label] containing "Create a post" or "Creer une publication"
 * - If none found, falls back to looking for any placeholder-like text in the feed header
 */
function clickComposerTrigger() {
  return chromeJS(`
(function() {
  // Strategy 1: Look for the "Write something" / "Quoi de neuf" button
  // This is typically a div[role="button"] near the top of the group feed
  var buttons = document.querySelectorAll('div[role="button"], span[role="button"]');
  // Strategy 0: FB groups now use "Nouvelle publication" as a link/button
  // This is the current (April 2026) layout — an <a role="link"> or nearby div
  var allEls = document.querySelectorAll('a[role="link"], div[role="button"], span');
  for (var n = 0; n < allEls.length; n++) {
    var ntxt = (allEls[n].textContent || '').trim().toLowerCase();
    if (ntxt.indexOf('nouvelle publication') >= 0 && ntxt.length < 40) {
      allEls[n].click();
      return 'clicked_nouvelle_publication';
    }
  }

  var triggers = [
    'quoi de neuf', 'write something', 'ecrivez quelque chose',
    'exprimez-vous', 'what\\'s on your mind', 'create a post',
    'creer une publication', 'ecrire quelque chose'
  ];
  for (var i = 0; i < buttons.length; i++) {
    var txt = (buttons[i].textContent || '').toLowerCase().trim();
    for (var j = 0; j < triggers.length; j++) {
      if (txt.indexOf(triggers[j]) >= 0) {
        buttons[i].click();
        return 'clicked_button';
      }
    }
  }

  // Strategy 2: Look for aria-label on the composer area
  var ariaEls = document.querySelectorAll('[aria-label*="publication"], [aria-label*="post"], [aria-label*="Write"]');
  for (var k = 0; k < ariaEls.length; k++) {
    var el = ariaEls[k];
    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' || el.getAttribute('tabindex') !== null) {
      el.click();
      return 'clicked_aria';
    }
  }

  // Strategy 3: Look for placeholder spans that FB uses
  var spans = document.querySelectorAll('span');
  for (var s = 0; s < spans.length; s++) {
    var st = (spans[s].textContent || '').toLowerCase();
    for (var t = 0; t < triggers.length; t++) {
      if (st === triggers[t]) {
        var parent = spans[s].closest('div[role="button"]') || spans[s].closest('a[role="link"]') || spans[s].parentElement;
        if (parent) { parent.click(); return 'clicked_span_parent'; }
      }
    }
  }

  return 'not_found';
})()
`);
}

/**
 * Step 2: Wait for the composer dialog/modal to appear
 *
 * FRAGILE SELECTORS:
 * - div[role="dialog"] is the modal overlay FB uses for the post composer
 * - div[role="form"] might wrap the composer in some layouts
 * - The dialog may take 1-3 seconds to animate in
 */
function waitForComposer() {
  for (let i = 0; i < 10; i++) {
    const found = chromeJS(`
(function() {
  // Check for dialog (modal composer)
  var dialog = document.querySelector('div[role="dialog"]');
  if (dialog) {
    // Verify it contains a textbox (it's the post composer, not some other modal)
    var tb = dialog.querySelector('div[contenteditable="true"][role="textbox"]');
    if (tb) return 'dialog_with_textbox';
    // Maybe textbox hasn't rendered yet
    return 'dialog_no_textbox';
  }
  // Some group layouts use inline composer (no dialog)
  var tb = document.querySelector('div[contenteditable="true"][role="textbox"]');
  if (tb) return 'inline_textbox';
  return 'waiting';
})()
`);
    if (found === 'dialog_with_textbox' || found === 'inline_textbox') {
      console.log(`[FB] Composer ready: ${found}`);
      return true;
    }
    if (found === 'dialog_no_textbox') {
      console.log(`[FB] Dialog found but textbox not ready (${i + 1}/10)...`);
    } else {
      console.log(`[FB] Waiting for composer (${i + 1}/10)...`);
    }
    sleep(2000);
  }
  return false;
}

/**
 * Step 3+4: Type content into the composer textbox
 *
 * FRAGILE SELECTORS:
 * - div[contenteditable="true"][role="textbox"] is the main post editor
 * - We use document.execCommand('insertText') instead of setting innerHTML/textContent
 *   because React's synthetic event system only picks up native input events
 * - We focus the element first, then clear it, then insert text
 * - Line breaks: we insert them as separate execCommand calls with '\n'
 *
 * KNOWN ISSUES:
 * - execCommand is deprecated but still works in Chrome (as of 2026)
 * - If FB switches to a Shadow DOM composer, this will break
 * - Pasting via clipboard (navigator.clipboard) might be blocked by permissions
 */
function typeInComposer(text) {
  // Encode the text to safely pass through AppleScript -> JS boundary
  const encoded = encodeURIComponent(text);

  return chromeJS(`
(function() {
  var text = decodeURIComponent("${encoded}");

  // Find the textbox — prefer the one inside a dialog (modal composer)
  var dialog = document.querySelector('div[role="dialog"]');
  var textbox = null;
  if (dialog) {
    textbox = dialog.querySelector('div[contenteditable="true"][role="textbox"]');
  }
  if (!textbox) {
    textbox = document.querySelector('div[contenteditable="true"][role="textbox"]');
  }
  if (!textbox) return 'no_textbox';

  // Focus the textbox
  textbox.focus();

  // Clear any existing content
  // Select all + delete (safer than setting textContent which React ignores)
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);

  // Insert text line by line to preserve line breaks
  // execCommand('insertText') fires proper input events that React detects
  var lines = text.split('\\n');
  for (var i = 0; i < lines.length; i++) {
    if (i > 0) {
      // Insert a line break (Shift+Enter equivalent)
      document.execCommand('insertLineBreak', false, null);
    }
    if (lines[i].length > 0) {
      document.execCommand('insertText', false, lines[i]);
    }
  }

  // Dispatch extra events to make sure React picks up the change
  textbox.dispatchEvent(new Event('input', { bubbles: true }));
  textbox.dispatchEvent(new Event('change', { bubbles: true }));

  // Verify content was inserted
  var final = textbox.textContent || '';
  return 'typed_' + final.length + '_chars';
})()
`);
}

/**
 * Step 5: Click the "Publier" / "Post" submit button
 *
 * FRAGILE SELECTORS:
 * - The submit button is inside the dialog, usually div[aria-label="Publier"] or
 *   div[aria-label="Post"] with role="button"
 * - It might also be a <button> or <div role="button"> containing "Publier" text
 * - FB sometimes disables the button until content is detected — our execCommand
 *   approach should handle this, but if the button stays disabled we abort
 */
function clickSubmitButton() {
  return chromeJS(`
(function() {
  var dialog = document.querySelector('div[role="dialog"]');
  var scope = dialog || document;

  // Strategy 1: aria-label match (most reliable)
  var labels = ['Publier', 'Post', 'Envoyer', 'Submit'];
  for (var i = 0; i < labels.length; i++) {
    var el = scope.querySelector('div[aria-label="' + labels[i] + '"][role="button"]');
    if (!el) el = scope.querySelector('button[aria-label="' + labels[i] + '"]');
    if (!el) el = scope.querySelector('[aria-label="' + labels[i] + '"]');
    if (el) {
      // Check if disabled
      if (el.getAttribute('aria-disabled') === 'true') return 'button_disabled';
      el.click();
      return 'clicked_aria_' + labels[i];
    }
  }

  // Strategy 2: text content match on buttons/divs with role="button"
  var btns = scope.querySelectorAll('div[role="button"], button');
  var textTriggers = ['publier', 'post', 'envoyer'];
  for (var j = 0; j < btns.length; j++) {
    var txt = (btns[j].textContent || '').trim().toLowerCase();
    // Must be a short button label, not a long text block
    if (txt.length > 20) continue;
    for (var k = 0; k < textTriggers.length; k++) {
      if (txt === textTriggers[k]) {
        if (btns[j].getAttribute('aria-disabled') === 'true') return 'button_disabled';
        btns[j].click();
        return 'clicked_text_' + txt;
      }
    }
  }

  // Strategy 3: look for submit-like button by form hierarchy
  var form = scope.querySelector('form[role="form"], form');
  if (form) {
    var submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) { submitBtn.click(); return 'clicked_form_submit'; }
  }

  return 'no_submit_button';
})()
`);
}

/**
 * Check if we landed on a valid group page (not 404, not redirected to login)
 */
function verifyGroupPage() {
  return chromeJS(`
(function() {
  var url = window.location.href;
  var title = document.title || '';

  // Check for login redirect
  if (url.indexOf('/login') >= 0 || url.indexOf('checkpoint') >= 0) return 'login_required';

  // Check for 404 or "content not available"
  var body = document.body ? document.body.innerText : '';
  if (body.indexOf('isn\\'t available') >= 0 || body.indexOf('n\\'est pas disponible') >= 0) return 'group_not_found';
  if (body.indexOf('Page Not Found') >= 0 || title.indexOf('404') >= 0) return 'group_not_found';

  // Check for "join group" indicator (we're on the group page but maybe not a member)
  // This is fine — we can still attempt to post if the group is public
  var joinBtns = document.querySelectorAll('div[role="button"], button');
  var needsJoin = false;
  for (var i = 0; i < joinBtns.length; i++) {
    var t = (joinBtns[i].textContent || '').toLowerCase();
    if (t === 'rejoindre le groupe' || t === 'join group') { needsJoin = true; break; }
  }
  if (needsJoin) return 'not_member';

  // Check for group indicators
  if (url.indexOf('/groups/') >= 0) return 'ok';
  return 'unknown_page';
})()
`);
}

/**
 * Verify post was submitted by checking the dialog disappeared
 * and the feed shows the new post
 */
function verifyPostSubmitted() {
  // Wait for dialog to close (indicates post was submitted or an error occurred)
  for (let i = 0; i < 15; i++) {
    const dialogState = chromeJS(`
(function() {
  var dialog = document.querySelector('div[role="dialog"]');
  if (!dialog) return 'no_dialog';
  // Check if there's an error message in the dialog
  var errTexts = ['erreur', 'error', 'impossible', 'try again', 'reessayer'];
  var bodyText = (dialog.textContent || '').toLowerCase();
  for (var i = 0; i < errTexts.length; i++) {
    if (bodyText.indexOf(errTexts[i]) >= 0) return 'error_in_dialog';
  }
  return 'dialog_still_open';
})()
`);
    if (dialogState === 'no_dialog') {
      console.log('[FB] Dialog closed (post likely submitted)');
      return 'success';
    }
    if (dialogState === 'error_in_dialog') {
      console.log('[FB] Error detected in dialog');
      return 'error_in_dialog';
    }
    console.log(`[FB] Waiting for submission (${i + 1}/15)...`);
    sleep(2000);
  }
  return 'timeout';
}

// ── Collect already-used article IDs from log ──

function getUsedArticleIds() {
  const entries = fs.existsSync(LOG_PATH)
    ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean)
    : [];
  return new Set(
    entries
      .filter(e => e.platform === 'fb_group' && e.success && e.articleId)
      .map(e => e.articleId)
  );
}

// ── Main ──

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.log('[FB] ANTHROPIC_API_KEY not set. Cannot generate content. Aborting.');
    process.exit(1);
  }

  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));

  // Initialize fb_groups status in plan if missing
  if (!plan.status.fb_groups) {
    plan.status.fb_groups = { posted: 0, last_group_index: -1, posts_done: [] };
  }

  // ── Pick the next group ──
  const groupIndex = getNextGroupIndex(plan);
  const group = GROUPS[groupIndex];
  console.log(`[FB] Target group: "${group.name}" (index ${groupIndex})`);

  // ── Human-like wait (10-12 minutes) ──
  if (!SKIP_WAIT) {
    const waitMs = 600000 + Math.floor(Math.random() * 120000); // 10-12 minutes
    const waitMins = (waitMs / 60000).toFixed(1);
    console.log(`[FB] Waiting ${waitMins} minutes (human-like delay)...`);
    sleep(waitMs);
  } else {
    console.log('[FB] SKIP_WAIT=1, skipping human-like delay');
  }

  // ── Fetch a random WP article ──
  const usedIds = getUsedArticleIds();
  const article = await fetchRandomArticle(usedIds);
  if (!article) {
    console.log('[FB] Could not fetch any WP article. Aborting.');
    logEntry({
      date: new Date().toISOString(),
      platform: 'fb_group',
      group: group.name,
      status: 'no_article',
      success: false,
    });
    return;
  }
  console.log(`[FB] Article: "${article.title}" (ID: ${article.id})`);

  // ── Generate post content ──
  console.log('[FB] Generating post via Haiku...');
  const postContent = await generatePost(article, group.name);
  if (!postContent || postContent.length < 40) {
    console.log(`[FB] AI generation failed or too short (${(postContent || '').length} chars)`);
    logEntry({
      date: new Date().toISOString(),
      platform: 'fb_group',
      group: group.name,
      articleId: article.id,
      status: 'generation_failed',
      success: false,
    });
    return;
  }
  console.log(`[FB] Generated post (${postContent.length} chars):`);
  console.log(postContent.substring(0, 150) + '...');

  // ── Open Chrome tab and navigate ──
  chromeNewTab();
  sleep(1000);

  try {
    chromeNav(group.url);
    sleep(10000); // FB pages are heavy, give them time

    // Close any overlay panels (notifications, messenger) and scroll to top
    chromeJS(`
(function() {
  // Click body to dismiss notification/messenger overlays
  document.body.click();
  // Press Escape to close any modal
  document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', bubbles: true}));
  window.scrollTo(0, 0);
})()
`);
    sleep(3000);

    // ── Verify we're on the group page ──
    const pageStatus = verifyGroupPage();
    console.log(`[FB] Page status: ${pageStatus}`);

    if (pageStatus === 'login_required') {
      console.log('[FB] Not logged into Facebook. Aborting.');
      logEntry({
        date: new Date().toISOString(),
        platform: 'fb_group',
        group: group.name,
        status: 'login_required',
        success: false,
      });
      return;
    }

    if (pageStatus === 'group_not_found') {
      console.log('[FB] Group not found (404 or unavailable). Aborting.');
      logEntry({
        date: new Date().toISOString(),
        platform: 'fb_group',
        group: group.name,
        status: 'group_not_found',
        success: false,
      });
      return;
    }

    if (pageStatus === 'not_member') {
      console.log('[FB] Not a member of this group. Aborting.');
      logEntry({
        date: new Date().toISOString(),
        platform: 'fb_group',
        group: group.name,
        status: 'not_member',
        success: false,
      });
      return;
    }

    if (pageStatus !== 'ok') {
      console.log(`[FB] Unexpected page state: ${pageStatus}. Proceeding cautiously...`);
    }

    const title = chromeTitle();
    console.log(`[FB] Page title: "${title}"`);

    // ── Step 1: Click the composer trigger ──
    console.log('[FB] Clicking composer trigger...');
    const triggerResult = clickComposerTrigger();
    console.log(`[FB] Trigger result: ${triggerResult}`);

    if (triggerResult === 'not_found') {
      console.log('[FB] Could not find composer trigger. Aborting.');
      logEntry({
        date: new Date().toISOString(),
        platform: 'fb_group',
        group: group.name,
        articleId: article.id,
        status: 'composer_trigger_not_found',
        success: false,
      });
      return;
    }

    sleep(3000); // Wait for composer animation

    // ── Step 2: Wait for composer modal ──
    console.log('[FB] Waiting for composer...');
    const composerReady = waitForComposer();

    if (!composerReady) {
      console.log('[FB] Composer did not appear. Aborting.');
      logEntry({
        date: new Date().toISOString(),
        platform: 'fb_group',
        group: group.name,
        articleId: article.id,
        status: 'composer_timeout',
        success: false,
      });
      return;
    }

    // ── Steps 3+4: Type content ──
    console.log('[FB] Typing content...');
    const typeResult = typeInComposer(postContent);
    console.log(`[FB] Type result: ${typeResult}`);

    if (typeResult === 'no_textbox' || typeResult === 'ERROR' || typeResult === 'missing value') {
      console.log('[FB] Could not find textbox. Aborting.');
      logEntry({
        date: new Date().toISOString(),
        platform: 'fb_group',
        group: group.name,
        articleId: article.id,
        status: 'textbox_not_found',
        success: false,
      });
      return;
    }

    sleep(2000); // Let React process the input

    // ── Step 5: Click submit ──
    console.log('[FB] Clicking submit...');
    const submitResult = clickSubmitButton();
    console.log(`[FB] Submit result: ${submitResult}`);

    if (submitResult === 'no_submit_button') {
      console.log('[FB] Could not find submit button. Aborting.');
      logEntry({
        date: new Date().toISOString(),
        platform: 'fb_group',
        group: group.name,
        articleId: article.id,
        status: 'submit_button_not_found',
        success: false,
      });
      return;
    }

    if (submitResult === 'button_disabled') {
      console.log('[FB] Submit button is disabled (FB may not have detected content). Aborting.');
      logEntry({
        date: new Date().toISOString(),
        platform: 'fb_group',
        group: group.name,
        articleId: article.id,
        status: 'submit_button_disabled',
        success: false,
      });
      return;
    }

    // ── Verify submission ──
    sleep(3000);
    const postResult = verifyPostSubmitted();
    const success = postResult === 'success';
    console.log(`[FB] ${success ? 'SUCCESS' : 'FAILED'} — ${postResult}`);

    // ── Log and update plan ──
    logEntry({
      date: new Date().toISOString(),
      platform: 'fb_group',
      group: group.name,
      groupUrl: group.url,
      hasLink: postContent.includes('flashvoyage.com'),
      success,
      generated: true,
      articleId: article.id,
      articleTitle: article.title,
      postLength: postContent.length,
    });

    if (success) {
      plan.status.fb_groups.posted++;
      plan.status.fb_groups.last_group_index = groupIndex;
      plan.status.fb_groups.posts_done.push({
        date: new Date().toISOString(),
        group: group.name,
        articleId: article.id,
        articleTitle: article.title,
        hasLink: postContent.includes('flashvoyage.com'),
        status: 'published',
      });
      plan.total_posted = (plan.total_posted || 0) + 1;
      fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
      console.log(`[FB] Plan updated: total_posted=${plan.total_posted}`);
    }
  } finally {
    chromeCloseTab();
    console.log('[FB] Tab closed');
  }
}

main().catch(err => {
  console.error('[FB FATAL]', err.message);
  logEntry({
    date: new Date().toISOString(),
    platform: 'fb_group',
    status: 'fatal_error',
    error: err.message,
    success: false,
  });
  process.exit(1);
});
