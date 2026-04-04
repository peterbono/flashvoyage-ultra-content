#!/usr/bin/env node
/**
 * Reddit Local Poster — Controls real Chrome via AppleScript
 * Posts comments on r/solotravel using old.reddit.com (simpler DOM).
 * Tracks window ID + tab index to avoid Claude extension tab conflicts.
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

function log(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

function osa(script) {
  fs.writeFileSync('/tmp/fv-osa.scpt', script);
  try { return execSync('osascript /tmp/fv-osa.scpt', { timeout: 30000 }).toString().trim(); }
  catch(e) { console.log('[OSA ERROR]', e.message); return 'ERROR'; }
}

let TAB_INDEX = null;
let WIN_ID = null;

function getWinRef() {
  return WIN_ID ? `window id ${WIN_ID}` : 'front window';
}

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
  console.log(`[REDDIT] Tab created: window=${WIN_ID} tab=${TAB_INDEX}`);
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

// ── Main ──

async function main() {
  const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!plan.status.reddit) plan.status.reddit = { posted: 0, posts_done: [] };
  if (!plan.status.reddit.posts_done) plan.status.reddit.posts_done = [];

  const doneIds = plan.status.reddit.posts_done.map(p => p.id);
  const next = content.reddit.find(p => p.status === 'ready' && !doneIds.includes(p.id));
  if (!next) { console.log('[REDDIT] No posts remaining'); return; }

  console.log(`[REDDIT] Mode: PRE-WRITTEN — ${next.id} — "${next.search}" on ${next.sub}`);

  chromeNewTab();
  sleep(1000);

  try {
    // 1. Navigate to old.reddit.com search within the subreddit
    const searchUrl = `https://old.reddit.com/${next.sub}/search?q=${encodeURIComponent(next.search)}&restrict_sr=on&sort=relevance&t=year`;
    chromeNav(searchUrl);
    sleep(8000);

    // Wait for any challenge/interstitial
    for (let i = 0; i < 6; i++) {
      const title = chromeTitle();
      if (title && !title.includes('Just a moment') && !title.includes('Cloudflare') && title !== 'ERROR') break;
      console.log(`[REDDIT] Waiting for page... (${i + 1}/6)`);
      sleep(5000);
    }
    console.log(`[REDDIT] Search page: "${chromeTitle()}"`);

    // 2. Check login on old.reddit.com
    const loggedIn = chromeJS(`
(function() {
  var userEl = document.querySelector('.user a');
  if (userEl && userEl.textContent && !userEl.textContent.includes('log in') && !userEl.textContent.includes('sign up')) {
    return userEl.textContent.trim();
  }
  // New reddit fallback
  if (document.body.textContent.includes('Log Out') || document.body.textContent.includes('log out')) return 'logged_in';
  return 'NOT_LOGGED_IN';
})()
`);
    if (loggedIn === 'NOT_LOGGED_IN' || loggedIn === 'ERROR' || loggedIn === 'missing value') {
      console.log('[REDDIT] Not logged in! Please log in to Reddit in Chrome.');
      log({ date: new Date().toISOString(), platform: 'reddit', id: next.id, status: 'login_failed' });
      return;
    }
    console.log(`[REDDIT] Logged in as: ${loggedIn}`);

    // 3. Find a post to comment on
    const postUrl = chromeJS(`
(function() {
  // old.reddit search results: links with /comments/ in href
  var links = document.querySelectorAll('a.search-title, a[data-click-id="body"], a.title');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href || '';
    var text = links[i].textContent.trim();
    if (href.includes('/comments/') && text.length > 15) {
      // Convert to old.reddit URL
      var url = href.replace('www.reddit.com', 'old.reddit.com');
      if (!url.includes('old.reddit.com')) url = url.replace('reddit.com', 'old.reddit.com');
      return url + '|||' + text.substring(0, 80);
    }
  }
  // Fallback: any link with /comments/
  var allLinks = document.querySelectorAll('a');
  for (var i = 0; i < allLinks.length; i++) {
    var href = allLinks[i].href || '';
    var text = allLinks[i].textContent.trim();
    if (href.includes('/comments/') && text.length > 15 && !href.includes('/comment/')) {
      var url = href.replace('www.reddit.com', 'old.reddit.com');
      if (!url.includes('old.reddit.com')) url = url.replace('reddit.com', 'old.reddit.com');
      return url + '|||' + text.substring(0, 80);
    }
  }
  return 'NONE';
})()
`);

    if (!postUrl || postUrl === 'NONE' || postUrl === 'ERROR' || postUrl === 'missing value' || !postUrl.includes('|||')) {
      console.log('[REDDIT] No suitable post found in search results');
      log({ date: new Date().toISOString(), platform: 'reddit', id: next.id, search: next.search, status: 'no_post_found' });
      return;
    }

    const [pUrl, pTitle] = postUrl.split('|||');
    console.log(`[REDDIT] Post: "${pTitle}"`);
    console.log(`[REDDIT] URL: ${pUrl}`);

    // 4. Navigate to the post
    chromeNav(pUrl);
    sleep(8000);
    console.log(`[REDDIT] On: "${chromeTitle()}"`);

    // 5. Find and fill comment box
    // old.reddit.com uses a textarea in the comment form
    const encoded = encodeURIComponent(next.content);
    const fillResult = chromeJS(`
(function() {
  window.__redditContent = decodeURIComponent("${encoded}");
  // old.reddit: textarea in .usertext-edit
  var ta = document.querySelector('.usertext-edit textarea, textarea[name="text"], #comment textarea');
  if (ta) {
    ta.value = window.__redditContent;
    ta.focus();
    ta.dispatchEvent(new Event('input', {bubbles: true}));
    ta.dispatchEvent(new Event('change', {bubbles: true}));
    return 'textarea';
  }
  // new reddit: contenteditable div
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
      // Retry after clicking "Add a comment"
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
        console.log('[REDDIT] Comment editor not found after click');
        return;
      }
      console.log(`[REDDIT] Content set via ${retryFill} (after click)`);
    } else if (fillResult === 'NO_EDITOR' || fillResult === 'ERROR' || fillResult === 'missing value') {
      console.log('[REDDIT] Comment editor not found');
      return;
    } else {
      console.log(`[REDDIT] Content set via ${fillResult}`);
    }

    sleep(2000);

    // 6. Submit comment
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
    console.log(`[REDDIT] Submit: ${submitResult}`);
    sleep(6000);

    // 7. Check success — look for the posted comment on the page
    const verifyResult = chromeJS(`
(function() {
  var content = window.__redditContent || '';
  var snippet = content.substring(0, 50);
  // Check if our comment text appears on the page (it was just posted)
  if (document.body.textContent.includes(snippet)) return 'FOUND';
  // Check for error messages
  var errors = document.querySelectorAll('.error, .status-msg');
  for (var i = 0; i < errors.length; i++) {
    var t = errors[i].textContent.trim();
    if (t.length > 5) return 'ERROR:' + t.substring(0, 100);
  }
  return 'NOT_FOUND';
})()
`);

    const success = verifyResult === 'FOUND' || (submitResult !== 'NO_BUTTON' && !verifyResult.startsWith('ERROR:'));
    console.log(`[REDDIT] ${success ? 'SUCCESS' : 'FAILED'} — verify: ${verifyResult}`);

    const logEntry = {
      date: new Date().toISOString(),
      platform: 'reddit',
      id: next.id,
      sub: next.sub,
      search: next.search,
      hasLink: next.hasLink || false,
      postTitle: pTitle,
      postUrl: pUrl,
      success,
    };
    log(logEntry);

    if (success) {
      plan.status.reddit.posted++;
      plan.status.reddit.posts_done.push({
        date: new Date().toISOString(),
        id: next.id,
        sub: next.sub,
        search: next.search,
        hasLink: next.hasLink || false,
        status: 'published',
      });
      plan.total_posted = (plan.total_posted || 0) + 1;
      fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
    }
  } finally {
    chromeCloseTab();
  }
}

main().catch(err => { console.error('[REDDIT FATAL]', err.message); process.exit(1); });
