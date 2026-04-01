/**
 * FlashVoyage Social Distributor — Caption Builder
 *
 * Generates social media captions from extracted article data.
 * Pure template-based — NO LLM calls.
 *
 * Usage:
 *   import { buildCaption } from './caption-builder.js';
 *   const caption = buildCaption(extractedData, 'budget', 'facebook');
 */

// ── Constants ───────────────────────────────────────────────────────────────
const MAX_TEXT_LENGTH = 500; // Room for CTA — IG supports 2200, FB handles 500+ fine

const CONTENT_TYPES = ['news', 'insolite', 'budget', 'comparatif', 'question', 'storytelling'];

// ── Hashtag pools ───────────────────────────────────────────────────────────
const BASE_HASHTAGS = ['#Voyage', '#FlashVoyage', '#ConseilsVoyage'];

const CATEGORY_HASHTAGS = {
  'budget':     ['#VoyagePasCher', '#BudgetVoyage', '#BonPlanVoyage', '#VoyagerMoinsCher', '#PetitBudget'],
  'comparatif': ['#Comparatif', '#GuidePratique', '#DestinationAsie', '#ChoisirSaDestination'],
  'insolite':   ['#Insolite', '#VoyageInsolite', '#DécouverteVoyage', '#SecretVoyage'],
  'news':       ['#ActuVoyage', '#InfoVoyageur', '#ConseilsPratiques', '#VoyagerMalin'],
  'question':   ['#QuestionVoyage', '#DébatVoyage', '#CommunautéVoyage', '#AvisVoyageurs'],
  'storytelling':['#RécitDeVoyage', '#ExpérienceVoyage', '#CarnetDeVoyage', '#HistoireDeVoyage'],
};

const DESTINATION_HASHTAGS = {
  'vietnam':   ['#Vietnam', '#VoyageVietnam'],
  'thaïlande': ['#Thaïlande', '#VoyageThaïlande'],
  'thailande': ['#Thaïlande', '#VoyageThaïlande'],
  'bali':      ['#Bali', '#VoyageBali'],
  'indonésie': ['#Indonésie', '#VoyageIndonésie'],
  'indonesie': ['#Indonésie', '#VoyageIndonésie'],
  'cambodge':  ['#Cambodge', '#VoyageCambodge'],
  'laos':      ['#Laos', '#VoyageLaos'],
  'japon':     ['#Japon', '#VoyageJapon'],
  'philippines':['#Philippines', '#VoyagePhilippines'],
  'malaisie':  ['#Malaisie', '#VoyageMalaisie'],
  'myanmar':   ['#Myanmar', '#VoyageMyanmar'],
  'birmanie':  ['#Birmanie', '#VoyageBirmanie'],
  'sri lanka': ['#SriLanka', '#VoyageSriLanka'],
  'inde':      ['#Inde', '#VoyageInde'],
  'népal':     ['#Népal', '#VoyageNépal'],
  'corée':     ['#Corée', '#VoyageCorée'],
  'singapour': ['#Singapour', '#VoyageSingapour'],
  'asie':      ['#Asie', '#VoyageAsie'],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a slug from the article URL.
 */
function slugFromUrl(url) {
  if (!url) return 'article';
  try {
    const path = new URL(url).pathname.replace(/^\/|\/$/g, '');
    return path || 'article';
  } catch {
    return 'article';
  }
}

/**
 * Build the link comment with UTM tracking.
 */
function buildLinkComment(articleUrl, platform = 'facebook') {
  const slug = slugFromUrl(articleUrl);
  return `\u{1F449} L'article complet : ${articleUrl}?utm_source=${platform}&utm_medium=social&utm_campaign=${slug}`;
}

/**
 * Pick 5-8 relevant hashtags based on content type + destination detection.
 */
function pickHashtags(extracted, contentType) {
  const tags = new Set(BASE_HASHTAGS);

  // Add category-specific hashtags
  const catTags = CATEGORY_HASHTAGS[contentType] || CATEGORY_HASHTAGS['question'];
  for (const t of catTags) tags.add(t);

  // Detect destination from title + category
  const haystack = `${extracted.title} ${extracted.category} ${extracted.hook}`.toLowerCase();
  for (const [keyword, destTags] of Object.entries(DESTINATION_HASHTAGS)) {
    if (haystack.includes(keyword)) {
      for (const t of destTags) tags.add(t);
    }
  }

  // Cap at 8
  return [...tags].slice(0, 8);
}

/**
 * Truncate text to fit within max chars, ending cleanly at a word boundary.
 */
function truncate(text, max = MAX_TEXT_LENGTH) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '...';
}

/**
 * Extract destination name from title or category.
 * Checks title first (more specific), then category as fallback.
 * Sorts by keyword length descending to avoid partial matches.
 */
function guessDestination(extracted) {
  const keywords = Object.keys(DESTINATION_HASHTAGS)
    .sort((a, b) => b.length - a.length); // longest first

  // Check title first (most specific)
  const titleLower = (extracted.title || '').toLowerCase();
  for (const keyword of keywords) {
    if (titleLower.includes(keyword)) {
      return keyword.charAt(0).toUpperCase() + keyword.slice(1);
    }
  }

  // Fallback: check category
  const catLower = (extracted.category || '').toLowerCase();
  for (const keyword of keywords) {
    if (catLower.includes(keyword)) {
      return keyword.charAt(0).toUpperCase() + keyword.slice(1);
    }
  }

  // Ultimate fallback
  return extracted.category || 'Asie';
}

/**
 * Format stats as bullet points.
 */
function formatStatsBullets(stats, max = 4) {
  return stats.slice(0, max).map(s => `\u{2022} ${s}`).join('\n');
}

// ── Caption templates ───────────────────────────────────────────────────────

function templateNews(extracted) {
  const shock = extracted.shockFact || extracted.hook;
  const context = extracted.highlights.slice(0, 2).join('. ') || extracted.hook;

  let text = `\u{26A1} ${truncate(shock, 100)}\n\n${truncate(context, 150)}\n\n\u{1F4AC} Qu'en pensez-vous ?`;
  return truncate(text);
}

function templateInsolite(extracted) {
  const hookQ = extracted.title.endsWith('?')
    ? extracted.title
    : `Savais-tu que... ${extracted.hook.split('.')[0]} ?`;

  const detail = extracted.shockFact || extracted.highlights[0] || '';

  let text = `${truncate(hookQ, 100)}\n\n${truncate(detail, 130)}\n\n\u{1F517} L'histoire complète en commentaire \u{1F447}`;
  return truncate(text);
}

function templateBudget(extracted) {
  const dest = guessDestination(extracted);

  // Use AI budget data if available (set by carousel generator), otherwise fall back to regex stats
  const aiBudget = extracted.aiBudget;

  if (aiBudget) {
    // Build caption from real AI-extracted amounts
    const lines = [];
    if (aiBudget.hebergement) lines.push(`\u{1F3E0} Hébergement : ${aiBudget.hebergement}`);
    if (aiBudget.nourriture) lines.push(`\u{1F35C} Nourriture : ${aiBudget.nourriture}`);
    if (aiBudget.transport) lines.push(`\u{1F6F5} Transport : ${aiBudget.transport}`);
    if (aiBudget.activites) lines.push(`\u{1F3AF} Activités : ${aiBudget.activites}`);
    if (aiBudget.esim) lines.push(`\u{1F4F1} eSIM : ${aiBudget.esim}`);

    const totalLine = aiBudget.total_jour || aiBudget.total_sejour || null;
    const headline = totalLine
      ? `\u{1F4B0} ${dest} : ${totalLine}`
      : `\u{1F4B0} Budget ${dest}`;

    let text = `${headline}\n\n${lines.join('\n')}`;
    if (totalLine) text += `\n\u{1F4B0} Total : ${totalLine}`;
    return truncate(text);
  }

  // Fallback: regex-based stats (less reliable)
  const rawStats = extracted.keyStats;
  const stats = rawStats.map(s => typeof s === 'object' && s !== null ? s.value : s);
  const currencyStat = stats.find(s => /€|EUR|USD|\$/i.test(s));
  const mainStat = currencyStat || stats[0] || 'petit budget';
  const bulletStats = stats.filter(s => s !== mainStat).slice(0, 4);

  let text = `\u{1F4B0} ${mainStat} pour un séjour à ${dest}\n\nVoici le détail :\n${formatStatsBullets(bulletStats)}`;
  return truncate(text);
}

function templateComparatif(extracted) {
  const dest = guessDestination(extracted);

  // Try to parse "A vs B" or "A ou B" from title
  let destA = dest;
  let destB = '';
  const vsMatch = extracted.title.match(/(.+?)\s+(?:vs\.?|ou)\s+(.+?)(?:\s*[?:–—]|\s*$)/i);
  if (vsMatch) {
    destA = vsMatch[1].trim();
    destB = vsMatch[2].trim();
  }

  const differences = extracted.highlights.slice(0, 3).map(h => `\u{2022} ${h}`).join('\n');

  let text;
  if (destB) {
    text = `${destA} ou ${destB} ? \u{1F914}\n\n${differences}\n\nEt toi, team ${destA} ou team ${destB} ? \u{1F447}`;
  } else {
    text = `${destA} : le guide comparatif \u{1F914}\n\n${differences}\n\nTon avis ? \u{1F447}`;
  }
  return truncate(text);
}

function templateQuestion(extracted) {
  // Build a polarizing question from the title or hook
  let question = extracted.title.endsWith('?')
    ? extracted.title
    : `${extracted.title} — tu savais ?`;

  let text = `${truncate(question, 120)}\n\nNous on a la réponse (et elle va te surprendre).\n\n\u{1F447} Dis-nous en commentaire d'abord !`;
  return truncate(text);
}

function templateStorytelling(extracted) {
  const hook = extracted.hook.split('.').slice(0, 2).join('.') + '.';

  let text = `${truncate(hook, 150)}\n\n... la suite en commentaire \u{1F447}`;
  return truncate(text);
}

const TEMPLATE_MAP = {
  news: templateNews,
  insolite: templateInsolite,
  budget: templateBudget,
  comparatif: templateComparatif,
  question: templateQuestion,
  storytelling: templateStorytelling,
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a social media caption from extracted article data.
 *
 * @param {object} extracted — Output of extractor.js
 * @param {string} contentType — One of: news, insolite, budget, comparatif, question, storytelling
 * @param {string} [platform='facebook'] — Target platform for UTM tracking
 * @returns {{ text: string, cta: string, linkComment: string, hashtags: string[] }}
 */
export function buildCaption(extracted, contentType = 'question', platform = 'facebook') {
  const type = CONTENT_TYPES.includes(contentType) ? contentType : 'question';
  const templateFn = TEMPLATE_MAP[type];

  const text = templateFn(extracted);
  const hashtags = pickHashtags(extracted, type);
  const linkComment = buildLinkComment(extracted.articleUrl, platform);

  // CTA varies by type
  const ctaMap = {
    news: '\u{1F4AC} Qu\'en pensez-vous ?',
    insolite: '\u{1F517} L\'histoire complète en commentaire',
    budget: '\u{1F4CA} Le budget complet en commentaire',
    comparatif: '\u{1F447} Donne ton avis !',
    question: '\u{1F447} Dis-nous en commentaire !',
    storytelling: '\u{1F447} La suite en commentaire',
  };

  return {
    text,
    cta: ctaMap[type],
    linkComment,
    hashtags,
  };
}

export { CONTENT_TYPES, slugFromUrl };
