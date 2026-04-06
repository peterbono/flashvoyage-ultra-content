#!/usr/bin/env node
/**
 * Instagram Engagement Local — Controls real Chrome via AppleScript
 * Posts personalized comments on French travel IG accounts to break
 * FlashVoyage's cold start (1 follower).
 *
 * Pattern: same Chrome AppleScript control as quora-local.js
 * Usage: node scripts/linkbuilding/ig-engagement-local.js
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOG_PATH = path.join(REPO_ROOT, 'data/engagement-log.jsonl');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MAX_COMMENTS_PER_RUN = 10;

// ── Account list ──

const TIER1 = [
  { handle: 'brunomaltor', niche: 'Voyage monde, storytelling' },
  { handle: 'vizeo_officiel', niche: 'Guides voyage, comparatifs' },
  { handle: 'bestjobers', niche: 'Couple voyage, destinations' },
  { handle: 'voyage_tips', niche: 'Tips budget, bons plans' },
  { handle: 'lesvoyagesdenico', niche: 'Asie, backpacking' },
  { handle: 'leblogdevoyage', niche: 'Blog voyage, itinéraires' },
];

const TIER2 = [
  { handle: 'jeremybackpacker', niche: 'Asie du Sud-Est, budget' },
  { handle: 'mytravelproject.fr', niche: 'Budget voyage, comparatifs' },
  { handle: 'notrepetitgraindasie', niche: 'Asie exclusive' },
  { handle: 'lesgourmetsnomades', niche: 'Nomade digital, SEA' },
  { handle: 'cherifaistesvalises', niche: 'Couples voyage, budget' },
  { handle: 'tourdumondiste', niche: 'Tour du monde, budget' },
];

const TIER3 = [
  { handle: 'offthepath_travels', niche: 'Aventure, nature, backpack' },
  { handle: 'voyagesetc_', niche: 'Voyages au féminin' },
  { handle: 'decouvertemonde', niche: 'Destinations hors sentiers' },
  { handle: 'lafilleduconsul', niche: 'Expatriée, Asie' },
  { handle: 'un_sac_sur_le_dos', niche: 'Backpacker solo' },
  { handle: 'globetrotteuse', niche: 'Voyage solo féminin' },
  { handle: 'oceaniepourleszeros', niche: 'Asie-Pacifique' },
  { handle: 'robin.d.voyage', niche: 'Blog voyage FR, influenceur' },
];

// ── Tone rules (from quora-local.js) ──

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
11. JAMAIS de markdown (#, ##, **, __, etc.). Texte brut uniquement.
12. JAMAIS de titre en début de réponse. Commence directement par ta réaction.
13. JAMAIS de formules clickbait ("la vraie réponse", "ce que personne ne dit").
14. Tu es un mec normal qui partage son expérience, pas un influenceur.
`;

// ── Utilities (copied from quora-local.js) ──

function logEntry(entry) { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n'); }
function sleep(ms) { execSync(`sleep ${ms / 1000}`); }

function osa(script) {
  fs.writeFileSync('/tmp/fv-ig-osa.scpt', script);
  try { return execSync('osascript /tmp/fv-ig-osa.scpt', { timeout: 30000 }).toString().trim(); }
  catch (e) { console.log('[OSA ERROR]', e.message); return 'ERROR'; }
}

let WIN_ID = null;
let TAB_INDEX = null;

function getWinRef() {
  return WIN_ID ? `window id ${WIN_ID}` : 'front window';
}

function chromeJS(js) {
  fs.writeFileSync('/tmp/fv-ig-js.js', js);
  const winRef = getWinRef();
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`set jsCode to read POSIX file "/tmp/fv-ig-js.js"
tell application "Google Chrome"
  set w to ${winRef}
  set t to ${tabRef}
  execute t javascript jsCode
end tell`);
}

function chromeNav(url) {
  fs.writeFileSync('/tmp/fv-ig-url.txt', url);
  const winRef = getWinRef();
  const tabRef = TAB_INDEX ? `tab ${TAB_INDEX} of w` : 'last tab of w';
  return osa(`set targetURL to read POSIX file "/tmp/fv-ig-url.txt"
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
  console.log(`[IG] Tab created: window=${WIN_ID} tab=${TAB_INDEX}`);
  return result;
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

// ── Haiku API ──

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

// ── Daily account rotation ──

function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function pickAccounts() {
  const day = getDayOfYear();

  // Rotate within each tier using day-of-year modulo
  // Tier 1: pick 3 out of 6
  const t1Pick = 3;
  const t1Start = (day * t1Pick) % TIER1.length;
  const t1 = [];
  for (let i = 0; i < t1Pick; i++) {
    t1.push(TIER1[(t1Start + i) % TIER1.length]);
  }

  // Tier 2: pick 4 out of 6
  const t2Pick = 4;
  const t2Start = (day * t2Pick) % TIER2.length;
  const t2 = [];
  for (let i = 0; i < t2Pick; i++) {
    t2.push(TIER2[(t2Start + i) % TIER2.length]);
  }

  // Tier 3: pick 3 out of 8
  const t3Pick = 3;
  const t3Start = (day * t3Pick) % TIER3.length;
  const t3 = [];
  for (let i = 0; i < t3Pick; i++) {
    t3.push(TIER3[(t3Start + i) % TIER3.length]);
  }

  const accounts = [...t1, ...t2, ...t3];
  console.log(`[IG] Day of year: ${day} — selected ${accounts.length} accounts:`);
  accounts.forEach((a, i) => console.log(`  ${i + 1}. @${a.handle} (${a.niche})`));
  return accounts;
}

// ── IG DOM interaction ──

function findLatestPostUrl() {
  const result = chromeJS(`
(function() {
  // Profile grid: find first post or reel link
  var links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href;
    if (href && (href.indexOf('/p/') !== -1 || href.indexOf('/reel/') !== -1)) {
      return href;
    }
  }
  return 'NONE';
})()
`);
  if (!result || result === 'NONE' || result === 'ERROR' || result === 'missing value') return null;
  return result;
}

function extractCaption() {
  const result = chromeJS(`
(function() {
  // Try multiple selectors for the post caption
  // 1. h1 inside article (common for post pages)
  var h1 = document.querySelector('article h1');
  if (h1 && h1.innerText && h1.innerText.trim().length > 10) return h1.innerText.trim().substring(0, 1000);

  // 2. The main caption span — IG uses span with dir attribute inside article
  var spans = document.querySelectorAll('article span[dir]');
  for (var i = 0; i < spans.length; i++) {
    var t = spans[i].innerText;
    if (t && t.trim().length > 20) return t.trim().substring(0, 1000);
  }

  // 3. data-testid approach
  var testEl = document.querySelector('[data-testid="post-comment-root"]');
  if (testEl && testEl.innerText && testEl.innerText.trim().length > 10) return testEl.innerText.trim().substring(0, 1000);

  // 4. Fallback: first substantial text block in article
  var article = document.querySelector('article');
  if (article) {
    var allSpans = article.querySelectorAll('span');
    for (var j = 0; j < allSpans.length; j++) {
      var txt = allSpans[j].innerText;
      if (txt && txt.trim().length > 30 && txt.indexOf('@') === -1) return txt.trim().substring(0, 1000);
    }
  }

  // 5. Last resort: article text
  if (article && article.innerText) return article.innerText.substring(0, 1000);

  return 'NONE';
})()
`);
  if (!result || result === 'NONE' || result === 'ERROR' || result === 'missing value') return null;
  return result;
}

async function generateComment(handle, niche, captionText) {
  if (!ANTHROPIC_API_KEY) {
    console.log('[IG] No ANTHROPIC_API_KEY set, cannot generate comment');
    return null;
  }

  const prompt = `Tu es Florian, voyageur français basé en Thaïlande. Tu commentes un post Instagram du compte voyage @${handle} (niche: ${niche}).

POST CAPTION :
${captionText}

${TONE_RULES}

RÈGLES SPÉCIFIQUES IG :
1. Max 2-3 phrases (50-120 caractères)
2. Ton "Histoires Vraies" : authentique, perso, direct, PAS de ton IA
3. JAMAIS de lien, JAMAIS de promo, JAMAIS de mention @flashvoyage
4. Réagis au CONTENU SPÉCIFIQUE du post (pas de "Super photo !")
5. Ajoute de la valeur : anecdote perso, prix concret, conseil pratique, question authentique
6. Pas de markdown, pas d'emoji excessif (1-2 max)
7. Français naturel oral : "du coup", "perso", "en vrai"
8. Commence par une RÉACTION directe au contenu, pas par une formule

Exemples de bons commentaires :
- "J'y étais en mars, le truc que personne dit c'est que [détail spécifique]"
- "Perso je préfère [alternative] pour [raison concrète avec prix]"
- "Fun fact : le visa a changé depuis, c'est passé à [durée]"

Écris UNIQUEMENT le commentaire, rien d'autre.`;

  const comment = await callHaiku([{ role: 'user', content: prompt }], 150);
  return comment;
}

function typeComment(commentText) {
  // Encode the comment for safe injection into JS
  const encoded = Buffer.from(commentText, 'utf8').toString('base64');

  const result = chromeJS(`
(function() {
  var comment = atob("${encoded}");

  // Try textarea first (older IG web)
  var ta = document.querySelector('textarea[placeholder*="commentaire"]') ||
           document.querySelector('textarea[aria-label*="comment"]') ||
           document.querySelector('textarea[aria-label*="Ajouter"]') ||
           document.querySelector('form textarea');

  if (ta) {
    // React SPA: use nativeInputValueSetter to bypass React controlled state
    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(ta, comment);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    return 'textarea-filled';
  }

  // Try contenteditable div (newer IG web uses contenteditable for comments)
  var ce = document.querySelector('[contenteditable="true"][role="textbox"]') ||
           document.querySelector('[contenteditable="true"][aria-label*="commentaire"]') ||
           document.querySelector('[contenteditable="true"][aria-label*="comment"]') ||
           document.querySelector('[contenteditable="true"][data-lexical-editor]');

  if (ce) {
    ce.focus();
    ce.textContent = comment;
    ce.dispatchEvent(new Event('input', { bubbles: true }));
    ce.dispatchEvent(new Event('change', { bubbles: true }));
    // Also dispatch React-specific events
    var inputEvent = new InputEvent('input', { bubbles: true, data: comment, inputType: 'insertText' });
    ce.dispatchEvent(inputEvent);
    return 'contenteditable-filled';
  }

  return 'no-input-found';
})()
`);
  return result;
}

function clickCommentTextarea() {
  // Some IG layouts need an initial click on the comment area placeholder to reveal the textarea
  const result = chromeJS(`
(function() {
  // Click on the "Add a comment" placeholder area to activate the input
  var placeholder = document.querySelector('[aria-label*="commentaire"]') ||
                    document.querySelector('[aria-label*="comment"]') ||
                    document.querySelector('[placeholder*="commentaire"]') ||
                    document.querySelector('[placeholder*="comment"]');
  if (placeholder) {
    placeholder.click();
    placeholder.focus();
    return 'clicked';
  }

  // Try clicking the comment icon/button to open the comment field
  var commentBtn = document.querySelector('[aria-label*="Commenter"]') ||
                   document.querySelector('[aria-label*="Comment"]');
  if (commentBtn) {
    commentBtn.click();
    return 'icon-clicked';
  }

  return 'no-placeholder';
})()
`);
  return result;
}

function clickPublish() {
  const result = chromeJS(`
(function() {
  // Method 1: form submit button
  var submitBtn = document.querySelector('form button[type="submit"]');
  if (submitBtn && !submitBtn.disabled) {
    submitBtn.click();
    return 'submitted';
  }

  // Method 2: "Publier" text button
  var btns = document.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    var t = btns[i].textContent.trim();
    if ((t === 'Publier' || t === 'Post' || t === 'Poster') && !btns[i].disabled) {
      btns[i].click();
      return 'published';
    }
  }

  // Method 3: look for any enabled submit-like button near the comment area
  var form = document.querySelector('form');
  if (form) {
    var formBtns = form.querySelectorAll('button');
    for (var j = 0; j < formBtns.length; j++) {
      if (!formBtns[j].disabled && formBtns[j].textContent.trim().length < 20) {
        formBtns[j].click();
        return 'form-btn-clicked';
      }
    }
  }

  return 'no-button';
})()
`);
  return result;
}

// ── Main ──

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('[IG] ANTHROPIC_API_KEY is required. Set it in your environment.');
    process.exit(1);
  }

  console.log('[IG] === FlashVoyage Instagram Engagement Bot ===');
  console.log(`[IG] Date: ${new Date().toISOString()}`);

  const accounts = pickAccounts();
  let successCount = 0;
  let failCount = 0;

  chromeNewTab();
  sleep(1000);

  try {
    for (let i = 0; i < accounts.length && i < MAX_COMMENTS_PER_RUN; i++) {
      const account = accounts[i];
      console.log(`\n[IG] ── ${i + 1}/${accounts.length} — @${account.handle} ──`);

      const entry = {
        date: new Date().toISOString(),
        platform: 'instagram',
        handle: account.handle,
        niche: account.niche,
        postUrl: null,
        commentPosted: false,
        commentText: null,
        success: false,
        error: null,
      };

      try {
        // 1. Navigate to profile
        const profileUrl = `https://www.instagram.com/${account.handle}/`;
        console.log(`[IG] Navigating to ${profileUrl}`);
        chromeNav(profileUrl);

        // Wait for page load (5-8s, randomized)
        const loadWait = Math.floor(Math.random() * 3000) + 5000;
        sleep(loadWait);

        const pageTitle = chromeTitle();
        console.log(`[IG] Page: "${pageTitle}"`);

        // Check if profile loaded (not login wall, not 404)
        if (pageTitle.includes('Login') || pageTitle.includes('Inscription') || pageTitle === 'ERROR') {
          throw new Error('IG login wall or page error — are you logged in?');
        }

        // 2. Find the latest post
        const postUrl = findLatestPostUrl();
        if (!postUrl) {
          throw new Error('No post found on profile grid');
        }
        entry.postUrl = postUrl;
        console.log(`[IG] Latest post: ${postUrl}`);

        // 3. Navigate to the post
        chromeNav(postUrl);
        const postWait = Math.floor(Math.random() * 2000) + 3000;
        sleep(postWait);
        console.log(`[IG] On post: "${chromeTitle()}"`);

        // 4. Extract caption
        const caption = extractCaption();
        if (!caption) {
          throw new Error('Could not extract post caption');
        }
        console.log(`[IG] Caption (${caption.length} chars): "${caption.substring(0, 100)}..."`);

        // 5. Generate personalized comment via Haiku
        const comment = await generateComment(account.handle, account.niche, caption);
        if (!comment) {
          throw new Error('Haiku comment generation failed');
        }
        entry.commentText = comment;
        console.log(`[IG] Generated comment: "${comment}"`);

        // 6. Click on comment area to activate it
        const clickResult = clickCommentTextarea();
        console.log(`[IG] Comment area click: ${clickResult}`);
        sleep(1500);

        // 7. Type the comment
        const typeResult = typeComment(comment);
        console.log(`[IG] Type result: ${typeResult}`);
        if (typeResult === 'no-input-found') {
          throw new Error('Comment input field not found — IG DOM may have changed');
        }
        sleep(1000);

        // 8. Click publish
        const pubResult = clickPublish();
        console.log(`[IG] Publish result: ${pubResult}`);

        if (pubResult === 'no-button') {
          throw new Error('Publish button not found or disabled');
        }

        // Wait for comment to post
        sleep(3000);

        entry.commentPosted = true;
        entry.success = true;
        successCount++;
        console.log(`[IG] SUCCESS — comment posted on @${account.handle}`);

      } catch (err) {
        entry.error = err.message;
        failCount++;
        console.log(`[IG] FAILED @${account.handle}: ${err.message}`);
      }

      // Log every attempt
      logEntry(entry);

      // Rate limiting: random 45-120 seconds between accounts (except after last one)
      if (i < accounts.length - 1 && i < MAX_COMMENTS_PER_RUN - 1) {
        const pauseSeconds = Math.floor(Math.random() * 75) + 45;
        console.log(`[IG] Waiting ${pauseSeconds}s before next account...`);
        sleep(pauseSeconds * 1000);
      }
    }
  } finally {
    chromeCloseLastTab();
  }

  // Summary
  console.log(`\n[IG] === DONE ===`);
  console.log(`[IG] ${successCount}/${successCount + failCount} comments posted successfully`);
  if (failCount > 0) {
    console.log(`[IG] ${failCount} failures — check ${LOG_PATH}`);
  }
}

main().catch(err => { console.error('[IG FATAL]', err.message); process.exit(1); });
