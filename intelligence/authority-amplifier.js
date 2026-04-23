/**
 * intelligence/authority-amplifier.js
 *
 * "Authority amplifier" — runs on every publish, finds places on platforms
 * where Florian already has authority (Quora FR first, Reddit/Routard/LinkedIn
 * later) where the freshly-published article can be woven in as a natural
 * editorial insertion. Queues actions (never executes) to
 *   data/amplifier-queue/<slug>.json
 *
 * Public API:
 *   amplifyArticle({ slug, title, url, primaryKeyword, topicTokens })
 *     → { queued, byPlatform, queueFile }
 *   getQueueForSlug(slug) → Action[]
 *   markActionExecuted(actionId, result) → void
 *
 * Queue-file shape (compatible with the esim-philippines sibling agent):
 *   {
 *     slug, title, url, primaryKeyword,
 *     generatedAt, generator: 'authority-amplifier@v1',
 *     degraded: bool, reason: string | null,
 *     actions: Action[]
 *   }
 *
 * Action:
 *   {
 *     id, platform, type, status: 'pending'|'executed'|'skipped',
 *     accountHandle, targetUrl, targetTitle,
 *     score, rationale, insertText,
 *     createdAt, executedAt?, result?
 *   }
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
  scrapeQuoraProfile,
  loadCachedProfile,
  isCacheStale,
} from './quora-profile-scraper.js';

/** Best-effort normalisation for answers coming from sibling tmp / legacy caches. */
function normaliseLooseAnswer(a) {
  if (!a) return a;
  const parseViews = (s) => {
    if (typeof s === 'number') return s;
    if (!s) return 0;
    const m = String(s).replace(/\s/g, '').match(/([\d.,]+)\s*([kK])?/);
    if (!m) return 0;
    const n = parseFloat(m[1].replace(',', '.')) || 0;
    return m[2] ? Math.round(n * 1000) : Math.round(n);
  };
  return {
    ...a,
    answerUrl: a.answerUrl || a.questionUrl || '',
    questionUrl: a.questionUrl || '',
    questionTitle: a.questionTitle || '',
    snippet: a.snippet || '',
    views: typeof a.views === 'number' ? a.views : parseViews(a.views),
    upvotes: typeof a.upvotes === 'number' ? a.upvotes : parseViews(a.upvotes),
    dateAnswered: a.dateAnswered || '',
    topics: a.topics || [],
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(REPO_ROOT, 'data', 'amplifier-queue');
const QUORA_ACCOUNT = process.env.QUORA_ACCOUNT_HANDLE || 'Florian-Gouloubi';

const DEFAULT_TOP_N = Number(process.env.AMPLIFIER_TOP_N || 5);
const CACHE_MAX_AGE_DAYS = Number(process.env.AMPLIFIER_CACHE_DAYS || 7);

// Geographic clusters — used to give adjacency bonus
const GEO_CLUSTERS = {
  'sea': ['thailand', 'vietnam', 'philippines', 'indonesia', 'cambodia', 'laos', 'malaysia', 'singapore'],
  'east-asia': ['japan', 'korea', 'taiwan', 'china', 'hong-kong'],
  'south-asia': ['india', 'srilanka', 'nepal'],
};

function clusterFor(destination) {
  for (const [cluster, list] of Object.entries(GEO_CLUSTERS)) {
    if (list.includes(destination)) return cluster;
  }
  return null;
}

// Lightweight destination detector — matches the scraper's vocabulary.
const DEST_RX = {
  thailand: /\bthail|thaïl|bangkok|phuket|chiang|pattaya|krabi|koh\b/i,
  vietnam: /\bvi[eê]tn|hanoi|ho\s*chi|saigon|danang|halong\b/i,
  philippines: /\bphilipp|manille|manila|cebu|palawan|bohol|siargao\b/i,
  indonesia: /\bindon[eé]s|bali|jakarta|lombok|java\b/i,
  cambodia: /\bcambodg|siem|angkor|phnom\b/i,
  laos: /\blaos|vientiane|luang\b/i,
  malaysia: /\bmalaisi|kuala|penang|langkawi\b/i,
  singapore: /\bsingapour\b/i,
  japan: /\bjapon|japan|tokyo|osaka|kyoto\b/i,
  korea: /\bcor[eé]e|korea|s[eé]oul\b/i,
  taiwan: /\btaiwan|taipei\b/i,
};

function detectDestinations(text) {
  const out = new Set();
  if (!text) return out;
  for (const [dest, rx] of Object.entries(DEST_RX)) {
    if (rx.test(text)) out.add(dest);
  }
  return out;
}

function tokenize(s) {
  if (!s) return [];
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  'les', 'des', 'avec', 'pour', 'dans', 'sur', 'est', 'une', 'aux', 'que',
  'the', 'and', 'for', 'with', 'you', 'your', 'are', 'from', 'this', 'comment',
  'quoi', 'quel', 'quelle', 'pourquoi', 'comment',
]);

function buildFingerprint({ slug, title, primaryKeyword, topicTokens }) {
  const tokens = new Set([
    ...tokenize(slug),
    ...tokenize(title),
    ...tokenize(primaryKeyword),
    ...(Array.isArray(topicTokens) ? topicTokens.map((t) => String(t).toLowerCase()) : []),
  ]);
  const searchText = [slug, title, primaryKeyword, ...(topicTokens || [])].filter(Boolean).join(' ');
  const destinations = detectDestinations(searchText);
  return { tokens, destinations, searchText };
}

function scoreAnswer(answer, fingerprint) {
  let score = 0;
  const reasons = [];

  const answerText = `${answer.questionTitle || ''} ${answer.snippet || ''}`;
  const answerTokens = new Set(tokenize(answerText));
  let shared = 0;
  for (const t of fingerprint.tokens) if (answerTokens.has(t)) shared++;
  if (shared > 0) {
    score += shared * 3;
    reasons.push(`shared_tokens=${shared} (+${shared * 3})`);
  }

  const answerDests = detectDestinations(answerText);
  // Same destination
  let sameDest = false;
  for (const d of fingerprint.destinations) {
    if (answerDests.has(d)) { sameDest = true; break; }
  }
  if (sameDest) { score += 5; reasons.push('same_destination (+5)'); }

  // Adjacent destination (same geo cluster)
  if (!sameDest) {
    let adjacent = false;
    for (const fd of fingerprint.destinations) {
      const fc = clusterFor(fd);
      if (!fc) continue;
      for (const ad of answerDests) {
        if (clusterFor(ad) === fc) { adjacent = true; break; }
      }
      if (adjacent) break;
    }
    if (adjacent) { score += 2; reasons.push('adjacent_destination (+2)'); }
  }

  // Reach multiplier (only if we actually have view data)
  const views = Number(answer.views || 0);
  if (views >= 10000) {
    score = Math.round(score * 2);
    reasons.push(`views≥10k (×2)`);
  } else if (views >= 5000) {
    score = Math.round(score * 1.5);
    reasons.push(`views≥5k (×1.5)`);
  }

  return { score, reasons };
}

async function generateInsertionText({ answer, article, primaryKeyword }) {
  // Try Claude Haiku via the project client; degrade to a deterministic
  // template if unavailable (offline / no API key).
  try {
    const { generateWithClaude, isAnthropicAvailable } = await import('../anthropic-client.js');
    if (!isAnthropicAvailable()) return templateInsertion({ article, primaryKeyword });
    const system =
      `tu ajoutes une ligne naturelle à une réponse Quora déjà publiée. La ligne doit amener ` +
      `le lien [X] comme une extension éditoriale légitime — jamais "cliquez ici". ` +
      `Pas de markdown. Pas de promotion. 20-35 mots. Française, ton de voyageur (du coup, en vrai, perso). ` +
      `Pas de tiret cadratin. Mentionne brièvement l'angle spécifique de l'article (pas juste "plus d'infos").`;
    const user =
      `Contexte du lien : "${article.title}" (${article.url})\n` +
      `Sujet principal : ${primaryKeyword || '(non précisé)'}\n` +
      `Question Quora : "${answer.questionTitle}"\n` +
      `Texte actuel de la réponse (extrait) : ${(answer.snippet || '').slice(0, 400)}\n\n` +
      `Rends UNIQUEMENT la ligne à insérer, sans guillemets.`;
    const text = await generateWithClaude(system, user, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 200,
      temperature: 0.7,
      trackingStep: 'authority-amplifier.insertion',
    });
    const clean = (text || '').trim().replace(/^["'«»]|["'«»]$/g, '');
    return clean || templateInsertion({ article, primaryKeyword });
  } catch {
    return templateInsertion({ article, primaryKeyword });
  }
}

function templateInsertion({ article, primaryKeyword }) {
  const topic = primaryKeyword || article.title;
  return `Si tu creuses la question ${topic}, j'ai compilé ce que j'ai appris sur le terrain ici : ${article.url}`;
}

function mkActionId(slug, platform, targetUrl) {
  const h = crypto.createHash('sha1').update(`${slug}|${platform}|${targetUrl}`).digest('hex').slice(0, 10);
  return `amp_${platform}_${h}`;
}

async function getQuoraSnapshot() {
  const cached = loadCachedProfile(QUORA_ACCOUNT);
  if (cached && !isCacheStale(cached, CACHE_MAX_AGE_DAYS)) {
    return { ...cached, answers: (cached.answers || []).map(normaliseLooseAnswer) };
  }
  // Cooperative wait: give sibling agent up to 5 min if it's actively scraping.
  if (fs.existsSync('/tmp/quora_profile_florian.json')) {
    try {
      const stat = fs.statSync('/tmp/quora_profile_florian.json');
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < 5 * 60 * 1000) {
        try {
          const raw = JSON.parse(fs.readFileSync('/tmp/quora_profile_florian.json', 'utf-8'));
          if (raw && Array.isArray(raw.answers)) {
            return {
              ...raw,
              source: 'sibling-tmp',
              answers: raw.answers.map(normaliseLooseAnswer),
            };
          }
        } catch {}
      }
    } catch {}
  }
  // Otherwise refresh ourselves (best-effort; fallback to stale cache inside).
  try {
    const fresh = await scrapeQuoraProfile(QUORA_ACCOUNT);
    return { ...fresh, answers: (fresh.answers || []).map(normaliseLooseAnswer) };
  } catch {
    return cached
      ? { ...cached, answers: (cached.answers || []).map(normaliseLooseAnswer) }
      : { answers: [], degraded: true, fallbackReason: 'scrape-failed' };
  }
}

function rankQuoraCandidates(snapshot, fingerprint, topN) {
  const scored = (snapshot.answers || [])
    .map((a) => ({ answer: a, ...scoreAnswer(a, fingerprint) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  return scored;
}

async function buildQuoraActions({ snapshot, fingerprint, article, slug, primaryKeyword, topN }) {
  if (!snapshot || !snapshot.answers || snapshot.answers.length === 0) {
    return { actions: [], notes: [snapshot?.fallbackReason || 'no-quora-data'] };
  }
  const top = rankQuoraCandidates(snapshot, fingerprint, topN);
  const actions = [];
  for (const entry of top) {
    const { answer, score, reasons } = entry;
    const insertText = await generateInsertionText({ answer, article, primaryKeyword });
    actions.push({
      id: mkActionId(slug, 'quora', answer.answerUrl),
      platform: 'quora',
      type: 'edit-existing-answer',
      status: 'pending',
      accountHandle: snapshot.profile || QUORA_ACCOUNT,
      targetUrl: answer.answerUrl,
      targetTitle: answer.questionTitle,
      targetQuestionUrl: answer.questionUrl || null,
      reach: { views: answer.views || 0, upvotes: answer.upvotes || 0 },
      score,
      rationale: reasons.join(', '),
      insertText,
      sourceSnippet: (answer.snippet || '').slice(0, 280),
      createdAt: new Date().toISOString(),
    });
  }
  return { actions, notes: snapshot.degraded ? ['quora-snapshot-degraded'] : [] };
}

// ── Public API ──

/**
 * Run the amplifier for one published article.
 * Non-blocking by design: on any internal failure, writes a degraded queue
 * file with actions:[] so callers can log and move on.
 */
export async function amplifyArticle({ slug, title, url, primaryKeyword, topicTokens } = {}) {
  if (!slug) throw new Error('amplifyArticle: slug required');
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  const queueFile = path.join(QUEUE_DIR, `${slug}.json`);
  const article = { slug, title, url, primaryKeyword, topicTokens };
  const fingerprint = buildFingerprint({ slug, title, primaryKeyword, topicTokens });

  const topN = DEFAULT_TOP_N;
  const byPlatform = {};
  const allActions = [];
  let degraded = false;
  const notes = [];

  // ── Platform: Quora ──
  try {
    const snapshot = await getQuoraSnapshot();
    // Treat very small / partial snapshots as degraded (scrape likely hit
    // login wall or selector drift). Florian's real profile has 30+ answers.
    const answersLen = (snapshot.answers || []).length;
    const partial = snapshot.source === 'sibling-tmp' || answersLen < 5;
    if (snapshot.degraded || partial) degraded = true;
    const { actions, notes: qnotes } = await buildQuoraActions({
      snapshot, fingerprint, article, slug, primaryKeyword, topN,
    });
    byPlatform.quora = {
      account: snapshot.profile || QUORA_ACCOUNT,
      scrapedAt: snapshot.scrapedAt || null,
      answersScanned: answersLen,
      queued: actions.length,
      degraded: !!(snapshot.degraded || partial),
      source: snapshot.source || (snapshot.fallbackReason ? 'fallback' : 'live-scrape'),
    };
    allActions.push(...actions);
    notes.push(...qnotes);
    if (partial) notes.push(`quora-partial:answers=${answersLen}`);
  } catch (err) {
    degraded = true;
    byPlatform.quora = { error: err.message, queued: 0, degraded: true };
    notes.push(`quora-error:${err.message}`);
  }

  // ── Platform: Reddit (stub; real implementation in a future agent) ──
  byPlatform.reddit = { queued: 0, status: 'not-implemented' };

  const queueDoc = {
    slug,
    title: title || null,
    url: url || null,
    primaryKeyword: primaryKeyword || null,
    topicTokens: Array.isArray(topicTokens) ? topicTokens : [],
    generatedAt: new Date().toISOString(),
    generator: 'authority-amplifier@v1',
    degraded,
    notes,
    actions: allActions,
  };

  fs.writeFileSync(queueFile, JSON.stringify(queueDoc, null, 2));
  return { queued: allActions.length, byPlatform, queueFile };
}

export async function getQueueForSlug(slug) {
  const p = path.join(QUEUE_DIR, `${slug}.json`);
  if (!fs.existsSync(p)) return [];
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(doc.actions) ? doc.actions : [];
  } catch { return []; }
}

export async function markActionExecuted(actionId, result = {}) {
  const files = fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const p = path.join(QUEUE_DIR, f);
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!Array.isArray(doc.actions)) continue;
    const idx = doc.actions.findIndex((a) => a.id === actionId);
    if (idx === -1) continue;
    doc.actions[idx].status = result.status || 'executed';
    doc.actions[idx].executedAt = new Date().toISOString();
    doc.actions[idx].result = result;
    fs.writeFileSync(p, JSON.stringify(doc, null, 2));
    return true;
  }
  return false;
}

export default { amplifyArticle, getQueueForSlug, markActionExecuted };
