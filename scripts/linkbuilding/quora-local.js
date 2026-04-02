#!/usr/bin/env node
/**
 * Quora FR Local Poster — Controls real Chrome via AppleScript
 * Uses a dedicated tab (last tab of last window) to avoid conflicts.
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

// All AppleScript goes through temp files — zero escaping issues
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
  // Write URL to file to avoid any escaping
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

async function main() {
  const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!plan.status.quora_fr) plan.status.quora_fr = { posted: 0, posts_done: [] };

  const doneIds = plan.status.quora_fr.posts_done.map(p => p.id);
  const next = content.quora_fr.find(p => p.status === 'ready' && !doneIds.includes(p.id));
  if (!next) { console.log('[QUORA] No posts remaining'); return; }

  console.log(`[QUORA] Posting: ${next.id} — "${next.search_query}"`);

  // Open a dedicated tab
  chromeNewTab();
  sleep(1000);

  try {
    // 1. Search
    chromeNav(`https://fr.quora.com/search?q=${encodeURIComponent(next.search_query)}`);
    sleep(8000);

    // Wait for CF
    for (let i = 0; i < 10; i++) {
      const title = chromeTitle();
      if (!title.includes('instant') && !title.includes('Cloudflare') && !title.includes('Vérification')) break;
      console.log(`[QUORA] CF... (${i + 1}/10)`);
      sleep(5000);
    }
    console.log(`[QUORA] Page: "${chromeTitle()}"`);

    // 2. Find and navigate to first question
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
    var bad = false;
    for (var j = 0; j < skip.length; j++) { if (t.toLowerCase().indexOf(skip[j]) >= 0) { bad = true; break; } }
    if (bad) continue;
    return h + '|||' + t.substring(0, 60);
  }
  return 'NONE';
})()
`);

    if (!questionUrl || questionUrl === 'NONE' || questionUrl === 'ERROR') {
      console.log('[QUORA] No question found');
      return;
    }

    const [qUrl, qTitle] = questionUrl.split('|||');
    console.log(`[QUORA] Question: "${qTitle}"`);
    console.log(`[QUORA] URL: ${qUrl}`);

    // Navigate to the question page
    chromeNav(qUrl);
    sleep(8000);
    console.log(`[QUORA] On: "${chromeTitle()}"`);

    // 3. Click "Répondre"
    const answerResult = chromeJS(`
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
    if (answerResult !== 'ok') { console.log('[QUORA] No answer button found'); return; }
    console.log('[QUORA] Answer editor opened');
    sleep(3000);

    // 4. Fill editor
    const htmlContent = next.content.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    // Store content in a temp file, load it via fetch in the browser
    fs.writeFileSync('/tmp/fv-quora-content.html', htmlContent);

    chromeJS(`
(function() {
  var el = document.querySelector('[contenteditable="true"].doc') || document.querySelector('[contenteditable="true"]') || document.querySelector('.ql-editor');
  if (!el) return 'no-editor';
  // Use XMLHttpRequest to load content from local file (won't work due to CORS)
  // Instead, use the encoded content approach
  return 'found';
})()
`);

    // Inject content via encoded URI
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
    sleep(1500);

    // 5. Publish
    const pubResult = chromeJS(`
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
    console.log(`[QUORA] Publish: ${pubResult}`);
    sleep(6000);

    const finalUrl = chromeJS('window.location.href');
    const success = pubResult === 'published';
    console.log(`[QUORA] ${success ? 'SUCCESS' : 'FAILED'} — ${finalUrl}`);

    log({ date: new Date().toISOString(), platform: 'quora_fr', id: next.id, search: next.search_query, hasLink: next.hasLink, success });

    if (success) {
      plan.status.quora_fr.posted++;
      plan.status.quora_fr.posts_done.push({ date: new Date().toISOString(), id: next.id, search: next.search_query, hasLink: next.hasLink, status: 'published' });
      plan.total_posted = (plan.total_posted || 0) + 1;
      fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
    }
  } finally {
    chromeCloseLastTab();
  }
}

main().catch(err => { console.error('[QUORA FATAL]', err.message); process.exit(1); });
