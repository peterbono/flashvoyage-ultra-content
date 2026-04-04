#!/usr/bin/env node
/**
 * Voyage Forum Local Poster — Dynamic Mode
 * 1. Scrapes VF forum sections for RECENT threads (< 2 months)
 * 2. Picks one we haven't replied to yet
 * 3. Reads the thread question
 * 4. Generates reply via Haiku (or uses pre-written if available)
 * 5. Posts via AppleScript Chrome automation
 *
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
const LINK_RATIO = 0.25; // 25% of posts include a FlashVoyage link

// Forum sections to scrape (rotate through them)
const SECTIONS = [
  'https://voyageforum.com/forum/thailande/',
  'https://voyageforum.com/forum/vietnam/',
  'https://voyageforum.com/forum/indonesie/',
  'https://voyageforum.com/forum/cambodge/',
  'https://voyageforum.com/forum/laos/',
];

// Pre-written content fallback (keyed by thread slug)
const CONTENT_MAP = {
  'thailande-tdac-comment-ca-marche-d10775002': `<b>Retour d'expérience sur le TDAC</b><br><br>Alors pour faire simple, en tant que français tu as droit à 60 jours sans visa depuis mars 2024 (c'était 30 avant). Du coup le TDAC c'est juste le formulaire d'arrivée numérique qui remplace l'ancien papier qu'on remplissait dans l'avion.<br><br>Concrètement :<br>- Tu remplis le formulaire en ligne AVANT ton vol<br>- Tu reçois un QR code<br>- A l'arrivée tu montres ton QR code + passeport<br>- C'est gratuit<br><br>Le piège c'est qu'il y a des sites qui facturent 10-15 euros pour remplir le formulaire "à ta place". Ne tombe pas dans le panneau, c'est le site officiel qui est gratuit.<br><br>En vrai le processus prend genre 5 minutes si tu as ton passeport et ton billet sous la main. Et si tu oublies de le faire avant, il y a encore des bornes à l'aéroport.<br><br>Bon après, perso j'ai eu zéro question à l'immigration. Passeport français, sourire, tampon, 30 secondes chrono.`,
  'quelle-situation-ambiance-suite-guerre-moyen-orient-d11466122': `<b>Pas d'impact en Asie du Sud-Est</b><br><br>Pour avoir été en Thaïlande et au Vietnam récemment, honnêtement zéro impact sur le terrain. L'Asie du Sud-Est est très loin géographiquement et politiquement de ce qui se passe au Moyen-Orient.<br><br>Ce qui peut changer :<br>- Les prix des vols : si la situation s'aggrave, certaines compagnies déroutent et ça rallonge les trajets. Mais en pratique, les prix ont pas bougé significativement.<br>- L'assurance voyage : vérifie que ta police couvre les situations de force majeure, mais c'est standard.<br><br>Sur place en Thaïlande, Vietnam, Bali... la vie continue normalement.<br><br>Mon conseil : ne te laisse pas freiner par l'actualité mondiale pour un voyage en Asie du Sud-Est. C'est une des régions les plus safe au monde pour les voyageurs.<br><br>Bref, pars tranquille.`,
  'vietnam-vous-en-gardez-quoi-fond-d11465015': `<b>Le Vietnam, un coup de coeur total</b><br><br>Perso, le Vietnam c'est le pays qui m'a le plus marqué en Asie du Sud-Est.<br><br>La bouffe. Le pho à 1 euro, le banh mi à 0,50 euro, le café trung... c'est le pays où j'ai le mieux mangé de ma vie. Budget bouffe : 8-10 euros par jour.<br><br>Le chaos organisé de Hanoï. 5 millions de scooters, pas de feux respectés, et pourtant ça fonctionne.<br><br>La beauté du nord. Ha Giang en moto, les rizières de Sapa, la baie d'Ha Long.<br><br>Budget : 20-25 euros par jour en backpacker. Un comparatif détaillé des budgets ici : https://flashvoyage.com/voyage-thailande-pas-cher-2026-budget/?utm_source=voyageforum&utm_medium=community&utm_campaign=s1`,
};

const TONE_RULES = `
RÈGLES DE TON (OBLIGATOIRE — ton de voyageur français sur un forum, PAS de ton IA) :
1. JAMAIS de tiret cadratin '—'. Utilise virgules, points, parenthèses ou '...'
2. Connecteurs oraux français : "du coup", "en vrai", "perso", "bref", "genre"
3. Ratio 40% anecdote / 60% info minimum
4. Varie la longueur des phrases (phrases courtes mélangées avec des longues)
5. L'accroche doit RÉAGIR à la question posée, pas énoncer un fait
6. Marqueurs d'incertitude : "de mémoire", "je crois que", "à vérifier"
7. Oscille entre registre courant et familier dans le même post
8. Aie des opinions franches : "honnêtement évite X", "les gens qui disent Y je sais pas"
9. PRIX EN EUROS UNIQUEMENT. Jamais de USD.
10. 150-350 mots (plus long que Quora car c'est un forum voyage)
11. JAMAIS de markdown (#, ##, **, etc.). HTML simple : <b>, <br>, <br><br> pour paragraphes
12. JAMAIS de titre <b> en début de réponse. Commence directement par ta réaction.
13. Tu es FloAsie, mec français expat en Thaïlande qui partage son vécu.
14. Tutoie l'auteur du thread (c'est un forum).
15. Si tu inclus un lien, intègre-le naturellement dans une phrase, pas à la fin.
`;

function log(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

function osa(script) {
  fs.writeFileSync('/tmp/fv-osa.scpt', script);
  try { return execSync('osascript /tmp/fv-osa.scpt', { timeout: 25000 }).toString().trim(); }
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
  'janv': 0, 'janvier': 0, 'févr': 1, 'février': 1, 'mars': 2,
  'avr': 3, 'avril': 3, 'mai': 4, 'juin': 5, 'juil': 6, 'juillet': 6,
  'août': 7, 'aout': 7, 'sept': 8, 'septembre': 8, 'oct': 9, 'octobre': 9,
  'nov': 10, 'novembre': 10, 'déc': 11, 'décembre': 11, 'dec': 11,
};

function parseFrDate(dateStr) {
  if (!dateStr) return null;
  // Match "31 mars 2026" or "4 avr. 2026"
  const m = dateStr.match(/(\d{1,2})\s+(\w+)\.?\s+(\d{4})/);
  if (!m) return null;
  const month = FR_MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(parseInt(m[3]), month, parseInt(m[1]));
}

function isRecent(dateStr, maxDaysOld = 60) {
  const d = parseFrDate(dateStr);
  if (!d) return false;
  const now = new Date();
  const diffDays = (now - d) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= maxDaysOld;
}

// ── Thread discovery ──

function scrapeThreads(sectionUrl) {
  chromeNav(sectionUrl);
  sleep(6000);

  const raw = chromeJS(`
(function() {
  var text = document.body.innerText;
  var lines = text.split('\\n').filter(function(l) { return l.trim().length > 3; });
  return lines.slice(0, 120).join('|||');
})()
`);
  if (!raw || raw === 'ERROR' || raw === 'missing value') return [];

  // Also get links with thread slugs
  const linksRaw = chromeJS(`
(function() {
  var results = [];
  var links = document.querySelectorAll('a');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href || '';
    var text = links[i].textContent.trim();
    if (!href.match(/\\/forum\\/[a-z].*-d\\d{7,}/)) continue;
    if (text.length < 15 || text.length > 200) continue;
    var match = href.match(/\\/forum\\/([a-z][^/]+)/);
    var slug = match ? match[1].replace(/\\/$/, '') : '';
    if (!slug) continue;
    results.push(slug + '|||' + text.substring(0, 100));
  }
  return results.join('###');
})()
`);

  const lines = (raw || '').split('|||');
  const links = (linksRaw || '').split('###').filter(Boolean);

  // Parse thread entries from text + links
  const threads = [];
  for (const linkEntry of links) {
    const [slug, title] = linkEntry.split('|||');
    if (!slug || !title) continue;

    // Find creation date from text lines (look for "Author · date · X participants")
    let createdDate = null;
    for (const line of lines) {
      // Match thread context: "Author · 31 mars 2026 à 23:55 · X participants"
      if (line.includes(title.substring(0, 20))) {
        // Look in next few lines for the date
        const idx = lines.indexOf(line);
        const context = lines.slice(idx, idx + 4).join(' ');
        const dateMatch = context.match(/(\d{1,2}\s+\w+\.?\s+\d{4})/);
        if (dateMatch) createdDate = dateMatch[1];
        break;
      }
    }
    // Also try finding date near the slug text
    if (!createdDate) {
      for (const line of lines) {
        const dateMatch = line.match(/(\d{1,2}\s+(?:janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)\w*\.?\s+\d{4})/i);
        if (dateMatch && line.includes(title.substring(0, 15))) {
          createdDate = dateMatch[1];
          break;
        }
      }
    }

    threads.push({ slug, title, createdDate, recent: isRecent(createdDate, 60) });
  }

  return threads;
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

function readThreadQuestion() {
  // Extract the original question text from the current thread page
  return chromeJS(`
(function() {
  // VF thread: first post is the question
  var posts = document.querySelectorAll('.post_message, .message-text, td.post');
  if (posts.length > 0) return posts[0].textContent.trim().substring(0, 1500);
  // Fallback: get the main content area text
  var body = document.body.innerText;
  var lines = body.split('\\n').filter(function(l) { return l.trim().length > 20; });
  return lines.slice(3, 15).join(' ').substring(0, 1500);
})()
`);
}

async function generateReply(threadTitle, threadContent, article, includeLink) {
  const linkInstruction = includeLink && article
    ? `\nINCLUS CE LIEN naturellement dans ta réponse (intégré dans une phrase, PAS à la fin) : ${article.url}?utm_source=voyageforum&utm_medium=community&utm_campaign=s1`
    : '\nNE mets AUCUN lien dans cette réponse.';

  const articleContext = article
    ? `\nContexte (article FlashVoyage — utilise comme source mais NE COPIE PAS mot pour mot) :\n${article.content.slice(0, 2000)}`
    : '';

  const text = await callHaiku([{
    role: 'user',
    content: `Tu es FloAsie, voyageur français expat en Thaïlande qui répond sur VoyageForum.

Thread : "${threadTitle}"
Question posée :
${threadContent.slice(0, 1000)}

${TONE_RULES}
${linkInstruction}
${articleContext}

Écris ta réponse forum maintenant. HTML simple (<b>, <br>, <br><br> pour paragraphes). Pas de markdown.`,
  }], 1000);
  return text;
}

// ── Posting mechanism (reused from before) ──

function injectAndSubmit(content) {
  const encoded = encodeURIComponent(content);

  let used = null;
  for (let attempt = 0; attempt < 6 && !used; attempt++) {
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
  if (!used) return 'editor_failed';
  console.log(`[VF] Content set via ${used}`);

  const submitResult = chromeJS(`
(function() {
  var form = document.getElementById('post_write_form');
  if (!form) return 'NO_FORM';

  var msgField = form.querySelector('input[name="post_message"]');
  if (!msgField) {
    msgField = document.createElement('input');
    msgField.type = 'hidden';
    msgField.name = 'post_message';
    form.appendChild(msgField);
  }

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

  try { form.submit(); return 'form_submit|msg=' + html.length + 'chars'; }
  catch(e) { return 'SUBMIT_ERR:' + e.message; }
})()
`);
  console.log(`[VF] Submit: ${submitResult}`);
  sleep(8000);

  const title = chromeTitle();
  const titleLower = (title || '').toLowerCase();
  const hasSuccess = titleLower.includes('envoyée') || titleLower.includes('envoyee')
    || titleLower.includes('votre réponse') || titleLower.includes('message posté');
  const stillOnForm = titleLower.includes('répondre') || titleLower.includes('repondre')
    || titleLower.includes('post_reply_write');
  const success = hasSuccess || !stillOnForm;
  console.log(`[VF] ${success ? 'SUCCESS' : 'FAILED'} (title: ${title})`);
  return success ? 'success' : 'submit_failed';
}

// ── Main ──

async function main() {
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  if (!plan.status.voyage_forum) plan.status.voyage_forum = { posted: 0, posts_done: [], posts_queued: [] };
  if (!plan.status.voyage_forum.posts_done) plan.status.voyage_forum.posts_done = [];

  // Collect already-posted thread slugs (from plan + log)
  const postedSlugs = new Set(plan.status.voyage_forum.posts_done.map(p => p.thread));
  const logEntries = fs.existsSync(LOG_PATH)
    ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  logEntries.filter(e => e.platform === 'voyageforum' && e.success).forEach(e => postedSlugs.add(e.thread));

  chromeNewTab();
  sleep(1000);

  try {
    // ── Phase 1: Find a recent thread to reply to ──
    // Rotate through sections based on day
    const dayOfWeek = new Date().getDay();
    const sectionUrl = SECTIONS[dayOfWeek % SECTIONS.length];
    console.log(`[VF] Scanning: ${sectionUrl}`);

    const threads = scrapeThreads(sectionUrl);
    console.log(`[VF] Found ${threads.length} threads, ${threads.filter(t => t.recent).length} recent`);

    // Filter: recent + not already posted
    const candidates = threads.filter(t => t.recent && !postedSlugs.has(t.slug));
    console.log(`[VF] Candidates (recent, unposted): ${candidates.length}`);

    // If no recent candidates in this section, try next section
    let target = candidates[0];
    if (!target) {
      const altUrl = SECTIONS[(dayOfWeek + 1) % SECTIONS.length];
      console.log(`[VF] No candidates, trying: ${altUrl}`);
      const altThreads = scrapeThreads(altUrl);
      const altCandidates = altThreads.filter(t => t.recent && !postedSlugs.has(t.slug));
      target = altCandidates[0];
    }

    if (!target) {
      // Last resort: accept threads up to 4 months old
      const allThreads = threads.filter(t => !postedSlugs.has(t.slug));
      // Sort by date (newest thread IDs first — higher d-number = newer)
      allThreads.sort((a, b) => {
        const aNum = parseInt((a.slug.match(/d(\d+)/) || [])[1] || '0');
        const bNum = parseInt((b.slug.match(/d(\d+)/) || [])[1] || '0');
        return bNum - aNum;
      });
      target = allThreads[0];
      if (target) console.log(`[VF] Using older thread (best available): ${target.slug}`);
    }

    if (!target) {
      console.log('[VF] No suitable threads found');
      return;
    }

    console.log(`[VF] Target: "${target.title}" (${target.createdDate || 'date?'}) — ${target.slug}`);

    // ── Phase 2: Navigate to thread, read question ──
    const threadUrl = `https://voyageforum.com/forum/${target.slug}/`;
    chromeNav(threadUrl);
    sleep(6000);

    // Check login
    const loggedIn = chromeJS('(document.body.textContent.includes("FloAsie") || document.body.textContent.includes("Mon profil")) ? "yes" : "no"');
    if (loggedIn !== 'yes') {
      console.log('[VF] Not logged in — check Chrome session');
      log({ date: new Date().toISOString(), platform: 'voyageforum', thread: target.slug, status: 'login_failed' });
      return;
    }
    console.log('[VF] Logged in as FloAsie');

    // Check if FloAsie already replied (double-check on page)
    const alreadyReplied = chromeJS(`
(function() {
  var posts = document.querySelectorAll('a[href*="FloAsie"], a[href*="floasie"]');
  // Check post authors, not just any mention
  var authorLinks = document.querySelectorAll('.pseudo a, .auteur a, a.pseudo');
  for (var i = 0; i < authorLinks.length; i++) {
    if (authorLinks[i].textContent.trim() === 'FloAsie') return 'yes';
  }
  // Fallback: check if FloAsie appears as a post author in the page text
  var text = document.body.innerText;
  var matches = text.match(/FloAsie\\s*[·»]/g);
  return matches && matches.length > 0 ? 'yes' : 'no';
})()
`);
    if (alreadyReplied === 'yes') {
      console.log('[VF] Already replied to this thread, skipping');
      postedSlugs.add(target.slug);
      // Try next candidate recursively would be complex — just log and exit
      return;
    }

    // Read thread question
    const threadQuestion = readThreadQuestion();
    console.log(`[VF] Question (${(threadQuestion || '').length} chars): "${(threadQuestion || '').substring(0, 80)}..."`);

    // ── Phase 3: Get or generate content ──
    let content = CONTENT_MAP[target.slug]; // Pre-written?
    let generated = false;
    let articleId = null;
    const includeLink = Math.random() < LINK_RATIO;

    if (content) {
      console.log('[VF] Using pre-written content');
    } else if (ANTHROPIC_API_KEY) {
      console.log('[VF] Generating reply via Haiku...');
      const article = includeLink ? await fetchRandomArticle() : null;
      if (article) console.log(`[VF] Article context: "${article.title}"`);

      content = await generateReply(target.title, threadQuestion || target.title, article, includeLink);
      if (!content || content.length < 50) {
        console.log('[VF] AI generation failed or too short');
        return;
      }
      generated = true;
      articleId = article?.id;
      console.log(`[VF] Generated (${content.length} chars)`);
    } else {
      console.log('[VF] No pre-written content and no API key for generation');
      return;
    }

    // ── Phase 4: Navigate to reply form and post ──
    const replyUrl = chromeJS('(function(){ var a = Array.from(document.querySelectorAll("a")).find(function(a){ return a.href && a.href.indexOf("post_reply_write") >= 0; }); return a ? a.href : "NONE"; })()');
    if (!replyUrl || replyUrl === 'NONE' || replyUrl === 'ERROR') {
      console.log('[VF] Reply URL not found (thread may be closed)');
      return;
    }
    console.log(`[VF] Reply form: ${replyUrl}`);

    chromeNav(replyUrl);
    sleep(10000);
    console.log(`[VF] Reply page: "${chromeTitle()}"`);

    const result = injectAndSubmit(content);

    // ── Phase 5: Log and update plan ──
    const success = result === 'success';
    log({
      date: new Date().toISOString(),
      platform: 'voyageforum',
      thread: target.slug,
      title: target.title,
      createdDate: target.createdDate,
      hasLink: includeLink && !!content.includes('flashvoyage.com'),
      generated,
      articleId,
      success,
    });

    if (success) {
      plan.status.voyage_forum.posted++;
      plan.status.voyage_forum.posts_done.push({
        date: new Date().toISOString(),
        thread: target.slug,
        title: target.title,
        hasLink: includeLink,
        generated,
        status: 'published',
      });
      plan.total_posted = (plan.total_posted || 0) + 1;
      fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
    }
  } finally {
    chromeCloseTab();
  }
}

main().catch(err => { console.error('[VF FATAL]', err.message); process.exit(1); });
