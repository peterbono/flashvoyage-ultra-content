#!/usr/bin/env node
/**
 * Voyage Forum Local Poster — Controls real Chrome via AppleScript
 * Tracks the opened tab by index to avoid hitting the Claude extension tab.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLAN_PATH = path.join(REPO_ROOT, 'data/linkbuilding-week-plan.json');
const LOG_PATH = path.join(REPO_ROOT, 'data/linkbuilding-log.jsonl');

const CONTENT_MAP = {
  'thailande-tdac-comment-ca-marche-d10775002': `<b>Retour d'expérience sur le TDAC</b><br><br>Alors pour faire simple, en tant que français tu as droit à 60 jours sans visa depuis mars 2024 (c'était 30 avant). Du coup le TDAC c'est juste le formulaire d'arrivée numérique qui remplace l'ancien papier qu'on remplissait dans l'avion.<br><br>Concrètement :<br>- Tu remplis le formulaire en ligne AVANT ton vol<br>- Tu reçois un QR code<br>- A l'arrivée tu montres ton QR code + passeport<br>- C'est gratuit<br><br>Le piège c'est qu'il y a des sites qui facturent 10-15 euros pour remplir le formulaire "à ta place". Ne tombe pas dans le panneau, c'est le site officiel qui est gratuit.<br><br>En vrai le processus prend genre 5 minutes si tu as ton passeport et ton billet sous la main. Et si tu oublies de le faire avant, il y a encore des bornes à l'aéroport.<br><br>Bon après, perso j'ai eu zéro question à l'immigration. Passeport français, sourire, tampon, 30 secondes chrono.`,
  'quelle-situation-ambiance-suite-guerre-moyen-orient-d11466122': `<b>Pas d'impact en Asie du Sud-Est</b><br><br>Pour avoir été en Thaïlande et au Vietnam récemment, honnêtement zéro impact sur le terrain. L'Asie du Sud-Est est très loin géographiquement et politiquement de ce qui se passe au Moyen-Orient.<br><br>Ce qui peut changer :<br>- Les prix des vols : si la situation s'aggrave, certaines compagnies déroutent et ça rallonge les trajets. Mais en pratique, les prix ont pas bougé significativement.<br>- L'assurance voyage : vérifie que ta police couvre les situations de force majeure, mais c'est standard.<br><br>Sur place en Thaïlande, Vietnam, Bali... la vie continue normalement.<br><br>Mon conseil : ne te laisse pas freiner par l'actualité mondiale pour un voyage en Asie du Sud-Est. C'est une des régions les plus safe au monde pour les voyageurs.<br><br>Bref, pars tranquille.`,
  'demande-conseils-projet-itineraire-thailande-laos-cambodge-d10779659': `<b>Mon retour sur un trip Thaïlande-Laos-Cambodge</b><br><br>Salut ! J'ai fait un circuit similaire, du coup je me permets de donner mon avis.<br><br><b>Thaïlande (10j)</b> : Bangkok 2j + train de nuit vers Chiang Mai (billet à 12 euros en couchette). Chiang Mai 4j. Puis bus vers Chiang Rai 2j, et frontière Laos à Huay Xai.<br><br><b>Laos (7j)</b> : La slow boat sur le Mékong jusqu'à Luang Prabang, 2 jours de navigation. Luang Prabang 3j. Van vers Vang Vieng 2j.<br><br><b>Cambodge (7j)</b> : Siem Reap 3j pour Angkor (pass 3 jours à 55 euros). Phnom Penh 2j et Kampot 2j pour finir relax.<br><br>Budget total hors vol : 1200-1500 euros pour 3 semaines en backpacker.`,
  'vietnam-vous-en-gardez-quoi-fond-d11465015': `<b>Le Vietnam, un coup de coeur total</b><br><br>Perso, le Vietnam c'est le pays qui m'a le plus marqué en Asie du Sud-Est.<br><br>La bouffe. Le pho à 1 euro, le banh mi à 0,50 euro, le café trung... c'est le pays où j'ai le mieux mangé de ma vie. Budget bouffe : 8-10 euros par jour.<br><br>Le chaos organisé de Hanoï. 5 millions de scooters, pas de feux respectés, et pourtant ça fonctionne.<br><br>La beauté du nord. Ha Giang en moto, les rizières de Sapa, la baie d'Ha Long.<br><br>Budget : 20-25 euros par jour en backpacker. Un comparatif détaillé des budgets ici : https://flashvoyage.com/voyage-thailande-pas-cher-2026-budget/?utm_source=voyageforum&utm_medium=community&utm_campaign=s1`,
};

function log(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

function osa(script) {
  fs.writeFileSync('/tmp/fv-osa.scpt', script);
  try { return execSync('osascript /tmp/fv-osa.scpt', { timeout: 20000 }).toString().trim(); }
  catch { return 'ERROR'; }
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
  console.log(`[VF] Tab created: window=${WIN_ID} tab=${TAB_INDEX}`);
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

function chromeCloseLastTab() {
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

async function main() {
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const queue = plan.status.voyage_forum.posts_queued;
  const posted = plan.status.voyage_forum.posts_done.map(p => p.thread);

  const today = new Date().toISOString().split('T')[0];
  let todayPost = queue.find(p => p.day === today);
  if (!todayPost) {
    const next = queue.find(p => { const slug = p.thread || p.candidates?.[0]; return slug && !posted.includes(slug); });
    if (!next) { console.log('[VF] No posts remaining'); return; }
    todayPost = next;
  }

  const threadSlug = todayPost.thread || todayPost.candidates?.[0];
  const content = CONTENT_MAP[threadSlug];
  if (!content) { console.log(`[VF] No content for: ${threadSlug}`); return; }

  const threadUrl = `https://voyageforum.com/forum/${threadSlug}/`;
  console.log(`[VF] Posting: ${todayPost.topic} — ${threadUrl}`);

  chromeNewTab();
  sleep(1000);

  try {
    // 1. Go to thread
    chromeNav(threadUrl);
    sleep(5000);

    // Check login
    const loggedIn = chromeJS('(document.body.textContent.includes("FloAsie") || document.body.textContent.includes("Mon profil")) ? "yes" : "no"');
    if (loggedIn !== 'yes') {
      console.log('[VF] Not logged in — check Chrome session');
      log({ date: new Date().toISOString(), platform: 'voyageforum', thread: threadSlug, status: 'login_failed' });
      return;
    }
    console.log('[VF] Logged in as FloAsie');

    // 2. Find reply URL
    const replyUrl = chromeJS('(function(){ var a = Array.from(document.querySelectorAll("a")).find(function(a){ return a.href && a.href.indexOf("post_reply_write") >= 0; }); return a ? a.href : "NONE"; })()');
    if (!replyUrl || replyUrl === 'NONE' || replyUrl === 'ERROR') {
      console.log('[VF] Reply URL not found');
      return;
    }
    console.log(`[VF] Reply: ${replyUrl}`);

    // 3. Navigate to reply form (needs extra time for WYSIWYG editor JS to load)
    chromeNav(replyUrl);
    sleep(10000);
    console.log(`[VF] Reply page: "${chromeTitle()}"`);

    // 4. Inject content via encodeURIComponent
    const encoded = encodeURIComponent(content);

    let used = null;
    for (let attempt = 0; attempt < 6 && !used; attempt++) {
      // First set the content as a global var
      chromeJS(`window.__fvContent = decodeURIComponent("${encoded}")`);
      sleep(500);

      used = chromeJS(`
(function() {
  var html = window.__fvContent;
  if (!html) return null;
  if (typeof ae !== 'undefined' && ae && ae.setContent) { ae.setContent(html); return 'ae'; }
  var iframe = document.querySelector('iframe');
  if (iframe && iframe.contentDocument && iframe.contentDocument.body) { iframe.contentDocument.body.innerHTML = html; return 'iframe'; }
  var ce = document.querySelector('[contenteditable="true"]');
  if (ce) { ce.innerHTML = html; ce.dispatchEvent(new Event('input', {bubbles:true})); return 'contenteditable'; }
  var ta = document.querySelector('textarea');
  if (ta) { ta.value = html.replace(/<br>/g, '\\n').replace(/<\\/?[^>]+>/g, ''); return 'textarea'; }
  return null;
})()
`);
      if (!used || used === 'missing value') {
        used = null;
        console.log(`[VF] Editor not ready (${attempt + 1}/6)...`);
        sleep(6000);
      }
    }
    if (!used) { console.log('[VF] Editor not loaded'); return; }
    console.log(`[VF] Content set via ${used}`);

    // 5. Sync content to hidden field + submit form
    const submitResult = chromeJS(`
(function() {
  var form = document.getElementById('post_write_form');
  if (!form) return 'NO_FORM';

  // VF stores message in input[name="post_message"] (hidden), not a textarea
  var msgField = form.querySelector('input[name="post_message"]');
  if (!msgField) {
    // Fallback: create it
    msgField = document.createElement('input');
    msgField.type = 'hidden';
    msgField.name = 'post_message';
    form.appendChild(msgField);
  }

  // Get content from editor (ae > iframe > contenteditable > stored)
  var html = '';
  if (typeof ae !== 'undefined' && ae && ae.getContent) {
    html = ae.getContent();
  } else {
    var iframe = document.querySelector('iframe');
    if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
      html = iframe.contentDocument.body.innerHTML;
    }
    if (!html || html === '<br>' || html.length < 10) {
      var ce = document.querySelector('[contenteditable="true"]');
      if (ce) html = ce.innerHTML;
    }
    if (!html || html.length < 10) html = window.__fvContent || '';
  }
  msgField.value = html;

  // Change form action to post (VF uses "do" param to switch between write/post)
  // Remove existing submit button named "do" to avoid conflict, add hidden field
  var existingDo = form.querySelector('input[type="submit"]');
  if (existingDo && existingDo.name && existingDo.name.indexOf('do') === 0) {
    existingDo.disabled = true;
  }
  var doField = form.querySelector('input[type="hidden"][name="do"]');
  if (!doField) {
    doField = document.createElement('input');
    doField.type = 'hidden';
    doField.name = 'do';
    form.appendChild(doField);
  }
  doField.value = 'post_reply_post';

  // Submit
  try { form.submit(); return 'form_submit|msg=' + html.length + 'chars'; }
  catch(e) { return 'SUBMIT_ERR:' + e.message; }
})()
`);
    console.log(`[VF] Submit method: ${submitResult}`);
    sleep(8000);

    const title = chromeTitle();
    const titleLower = title.toLowerCase();
    // Success = page navigated away from the reply form (title no longer contains "répondre"/"repondre")
    // OR page title contains a known success indicator
    const hasSuccessKeyword = titleLower.includes('envoyée') || titleLower.includes('envoyee')
      || titleLower.includes('votre réponse') || titleLower.includes('votre reponse')
      || titleLower.includes('message posté') || titleLower.includes('message poste')
      || titleLower.includes('forum/');
    const stillOnReplyForm = titleLower.includes('répondre') || titleLower.includes('repondre')
      || titleLower.includes('post_reply_write');
    const success = hasSuccessKeyword || !stillOnReplyForm;
    console.log(`[VF] ${success ? 'SUCCESS' : 'FAILED'} (title: ${title})`);

    log({ date: new Date().toISOString(), platform: 'voyageforum', thread: threadSlug, topic: todayPost.topic, hasLink: todayPost.hasLink, success });

    if (success) {
      plan.status.voyage_forum.posted++;
      plan.status.voyage_forum.posts_done.push({ date: new Date().toISOString(), thread: threadSlug, section: todayPost.section, hasLink: todayPost.hasLink, status: 'published' });
      plan.total_posted = (plan.total_posted || 0) + 1;
      fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
    }
  } finally {
    chromeCloseLastTab();
  }
}

main().catch(err => { console.error('[VF FATAL]', err.message); process.exit(1); });
