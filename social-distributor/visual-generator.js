import nodeHtmlToImage from 'node-html-to-image';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { extractBudgetWithAI, extractProductComparisonWithAI } from './extractor.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');

// Resolve Chrome executable from puppeteer's cache
function getChromePath() {
  try {
    const puppeteer = require('puppeteer');
    const p = puppeteer.executablePath();
    if (existsSync(p)) return p;
  } catch { /* ignore */ }
  // Fallback: check common macOS paths
  const fallbacks = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const fb of fallbacks) {
    if (existsSync(fb)) return fb;
  }
  return undefined;
}

const CHROME_PATH = getChromePath();

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];

const IMAGE_OPTIONS = {
  type: 'png',
  quality: 100,
  puppeteerArgs: {
    args: PUPPETEER_ARGS,
    ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {}),
  },
  waitUntil: 'networkidle0',
};

/**
 * Read an HTML template and replace {{VARIABLE}} placeholders.
 */
function renderTemplate(templateName, variables) {
  const templatePath = join(TEMPLATES_DIR, templateName);
  let html = readFileSync(templatePath, 'utf-8');

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    html = html.replaceAll(placeholder, value || '');
  }

  return html;
}

/**
 * Generate a "Histoires Vraies" style story card.
 *
 * @param {Object} params
 * @param {string} params.imageUrl   - Background photo URL
 * @param {string} params.headline1  - Yellow text line 1 (the hook)
 * @param {string} params.headline2  - Yellow text line 2
 * @param {string} params.subtext    - White text (context)
 * @param {string} [params.brand]    - Brand signature (default: "Flash Voyage")
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateStoryCard({ imageUrl, headline1, headline2, subtext, brand = 'Flash Voyage' }) {
  const html = renderTemplate('story-card.html', {
    IMAGE_URL: imageUrl,
    HEADLINE_1: headline1,
    HEADLINE_2: headline2,
    SUBTEXT: subtext,
    BRAND: brand,
  });

  const buffer = await nodeHtmlToImage({
    html,
    ...IMAGE_OPTIONS,
  });

  return buffer;
}

/**
 * Generate a breaking news flash card.
 *
 * @param {Object} params
 * @param {string} params.headline  - Main headline in white
 * @param {string} params.subtext   - Gray subtext
 * @param {string} params.category  - Category tag (e.g. "TRANSPORT AÉRIEN")
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateNewsFlash({ headline, subtext, category, imageUrl = '' }) {
  const html = renderTemplate('news-flash.html', {
    HEADLINE: headline,
    SUBTEXT: subtext,
    CATEGORY: category,
    IMAGE_URL: imageUrl,
  });

  const buffer = await nodeHtmlToImage({
    html,
    ...IMAGE_OPTIONS,
  });

  return buffer;
}

/**
 * Generate a stat/budget highlight card.
 *
 * @param {Object} params
 * @param {string} params.statNumber - The big number (e.g. "47")
 * @param {string} params.statUnit   - Unit text (e.g. "EUR / JOUR")
 * @param {string} params.context    - Explanatory text below
 * @param {string} params.imageUrl   - Background photo URL
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateStatCard({ statNumber, statUnit, context, imageUrl }) {
  const html = renderTemplate('stat-card.html', {
    STAT_NUMBER: statNumber,
    STAT_UNIT: statUnit,
    CONTEXT: context,
    IMAGE_URL: imageUrl,
  });

  const buffer = await nodeHtmlToImage({
    html,
    ...IMAGE_OPTIONS,
  });

  return buffer;
}

// ── Instagram & Threads — Platform-optimized generators ─────────────────────

/**
 * Generate an Instagram-optimized story card (1080x1350, 4:5 portrait).
 * Taller than the standard story-card, with bigger text for mobile viewing
 * and a "save this post" CTA instead of a link.
 *
 * @param {Object} params
 * @param {string} params.imageUrl   - Background photo URL
 * @param {string} params.headline1  - Yellow text line 1 (the hook)
 * @param {string} params.headline2  - Yellow text line 2
 * @param {string} params.subtext    - White text (context)
 * @param {string} [params.brand]    - Brand signature (default: "Flash Voyage")
 * @param {string} [params.cta]      - CTA text (default: "Enregistre ce post \ud83d\udd16")
 * @returns {Promise<Buffer>} PNG image buffer (1080x1350)
 */
export async function generateIGStoryCard({
  imageUrl,
  headline1,
  headline2,
  subtext,
  brand = 'Flash Voyage',
  cta = 'Enregistre ce post \ud83d\udd16',
}) {
  const html = renderTemplate('ig-story-card.html', {
    IMAGE_URL: imageUrl,
    HEADLINE_1: headline1,
    HEADLINE_2: headline2,
    SUBTEXT: subtext,
    BRAND: brand,
    CTA: cta,
  });

  const buffer = await nodeHtmlToImage({
    html,
    ...IMAGE_OPTIONS,
  });

  return buffer;
}

/**
 * Generate Instagram carousel slides (1080x1350 each).
 * Returns an array of PNG buffers — one per slide.
 *
 * Slide types:
 *   - "hook"  : Slide 1 — photo background with headline + swipe hint
 *   - "data"  : Slides 2..N-1 — dark background, one key data point each
 *   - "cta"   : Last slide — follow/save CTA with branding
 *
 * @param {Object} params
 * @param {Array<Object>} params.slides - Array of slide definitions:
 *   Hook:  { type: "hook", imageUrl, headline, subtext }
 *   Data:  { type: "data", label, value, unit, description }
 *   CTA:   { type: "cta", text }
 * @returns {Promise<Buffer[]>} Array of PNG image buffers
 */
export async function generateIGCarouselSlides({ slides }) {
  const totalSlides = slides.length;
  const buffers = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideNum = i + 1;

    // Visibility toggles — only show the matching slide type
    const isHook = slide.type === 'hook';
    const isData = slide.type === 'data';
    const isCta = slide.type === 'cta';

    const variables = {
      // Visibility
      HOOK_DISPLAY: isHook ? 'block' : 'none',
      DATA_DISPLAY: isData ? 'flex' : 'none',
      CTA_DISPLAY: isCta ? 'flex' : 'none',
      // Common
      SLIDE_NUMBER: String(slideNum),
      TOTAL_SLIDES: String(totalSlides),
      // Hook
      IMAGE_URL: slide.imageUrl || '',
      HEADLINE: slide.headline || '',
      SUBTEXT: slide.subtext || '',
      // Data
      DATA_LABEL: slide.label || '',
      DATA_VALUE: slide.value || '',
      DATA_UNIT: slide.unit || '',
      DATA_DESCRIPTION: slide.description || '',
      // CTA
      CTA_TEXT: slide.text || 'Suis @flashvoyagemedia pour plus de guides voyage \ud83c\udf0f',
    };

    const html = renderTemplate('ig-carousel-slide.html', variables);

    const buffer = await nodeHtmlToImage({
      html,
      ...IMAGE_OPTIONS,
    });

    buffers.push(buffer);
  }

  return buffers;
}

// ── Improved Carousel Slide Generators (individual templates) ────────────────

/**
 * Generate a carousel Hook/Cover slide (1080x1350).
 * Full photo background with dark gradient, big headline, red accent line,
 * swipe indicator, and logo watermark.
 *
 * @param {Object} params
 * @param {string} params.imageUrl  - Background photo URL
 * @param {string} params.headline  - Big headline text (ALL CAPS, white, Bebas Neue 72px)
 * @param {string} params.subtext   - Subtext below headline (Inter 24px, white 80%)
 * @returns {Promise<Buffer>} PNG image buffer (1080x1350)
 */
export async function generateCarouselHook({ imageUrl, headline, subtext }) {
  const html = renderTemplate('ig-carousel-hook.html', {
    IMAGE_URL: imageUrl,
    HEADLINE: headline,
    SUBTEXT: subtext,
  });

  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}

/**
 * Generate a carousel Comparison slide (1080x1350).
 * Two-column layout comparing two destinations with 6 categories each,
 * red vertical divider, alternating row backgrounds, verdict bar.
 *
 * @param {Object} params
 * @param {string} params.title      - Top title (e.g. "COMPARATIF BUDGET")
 * @param {string} params.destA      - Destination A name
 * @param {string} params.flagA      - Flag emoji for A
 * @param {string} params.destB      - Destination B name
 * @param {string} params.flagB      - Flag emoji for B
 * @param {Object} params.dataA      - { budget, visa, vol, nuit, repas, climat } values for A
 * @param {Object} params.dataB      - { budget, visa, vol, nuit, repas, climat } values for B
 * @param {Object} params.winners    - { budget, visa, vol, nuit, repas, climat } — "a" or "b" for winner
 * @param {string} params.verdict    - Verdict text for bottom bar
 * @returns {Promise<Buffer>} PNG image buffer (1080x1350)
 */
export async function generateCarouselCompare({
  title,
  destA, flagA,
  destB, flagB,
  dataA, dataB,
  winners,
  verdict,
}) {
  const html = renderTemplate('ig-carousel-compare.html', {
    TITLE: title,
    DEST_A: destA,
    FLAG_A: flagA,
    DEST_B: destB,
    FLAG_B: flagB,
    BUDGET_A: dataA.budget,
    VISA_A: dataA.visa,
    VOL_A: dataA.vol,
    NUIT_A: dataA.nuit,
    REPAS_A: dataA.repas,
    CLIMAT_A: dataA.climat,
    BUDGET_B: dataB.budget,
    VISA_B: dataB.visa,
    VOL_B: dataB.vol,
    NUIT_B: dataB.nuit,
    REPAS_B: dataB.repas,
    CLIMAT_B: dataB.climat,
    BUDGET_A_CLASS: winners.budget === 'a' ? 'winner' : '',
    VISA_A_CLASS: winners.visa === 'a' ? 'winner' : '',
    VOL_A_CLASS: winners.vol === 'a' ? 'winner' : '',
    NUIT_A_CLASS: winners.nuit === 'a' ? 'winner' : '',
    REPAS_A_CLASS: winners.repas === 'a' ? 'winner' : '',
    CLIMAT_A_CLASS: winners.climat === 'a' ? 'winner' : '',
    BUDGET_B_CLASS: winners.budget === 'b' ? 'winner' : '',
    VISA_B_CLASS: winners.visa === 'b' ? 'winner' : '',
    VOL_B_CLASS: winners.vol === 'b' ? 'winner' : '',
    NUIT_B_CLASS: winners.nuit === 'b' ? 'winner' : '',
    REPAS_B_CLASS: winners.repas === 'b' ? 'winner' : '',
    CLIMAT_B_CLASS: winners.climat === 'b' ? 'winner' : '',
    VERDICT: verdict,
  });

  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}

/**
 * Generate a carousel Budget/Stats slide (1080x1350).
 * Dark background with horizontal bar chart showing 5 budget categories
 * and a big total at the bottom.
 *
 * @param {Object} params
 * @param {string} params.title     - Title text (e.g. "BUDGET THAÏLANDE")
 * @param {string} params.subtitle  - Subtitle (e.g. "Backpacker • 2 semaines")
 * @param {Array<Object>} params.categories - Array of 5 categories:
 *   { label, price, pct } where pct is 0-100 for bar width
 * @param {string} params.total     - Total amount (e.g. "47€")
 * @param {string} params.period    - Period text (e.g. "par jour")
 * @returns {Promise<Buffer>} PNG image buffer (1080x1350)
 */
export async function generateCarouselBudget({
  title,
  subtitle = '',
  categories,
  total,
  period,
}) {
  const vars = {
    TITLE: title,
    SUBTITLE: subtitle,
    TOTAL: total,
    PERIOD: period,
  };

  // Map categories to CAT1..CAT5 template variables
  for (let i = 0; i < Math.min(categories.length, 5); i++) {
    const cat = categories[i];
    const n = i + 1;
    vars[`CAT${n}_LABEL`] = cat.label;
    vars[`CAT${n}_PRICE`] = cat.price;
    vars[`CAT${n}_PCT`] = String(cat.pct);
  }

  const html = renderTemplate('ig-carousel-budget.html', vars);
  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}

/**
 * Generate a carousel CTA/Follow slide (1080x1350).
 * Red-to-dark gradient background, large logo, brand name,
 * value proposition, CTA button, and save prompt.
 *
 * @param {Object} params
 * @param {string} [params.valueProp]  - Value proposition text
 * @param {string} [params.ctaText]    - CTA button text
 * @param {string} [params.saveText]   - Save prompt below button
 * @returns {Promise<Buffer>} PNG image buffer (1080x1350)
 */
export async function generateCarouselCTA({
  valueProp = 'Guides terrain \u2022 Budgets r\u00e9els \u2022 Comparatifs honn\u00eates',
  ctaText = 'Suivre @flashvoyagemedia',
  saveText = 'Enregistre ce post \ud83d\udd16',
}) {
  const html = renderTemplate('ig-carousel-cta.html', {
    VALUE_PROP: valueProp,
    CTA_TEXT: ctaText,
    SAVE_TEXT: saveText,
  });

  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}

/**
 * Generate a Threads-optimized card (1080x1080).
 * Minimal overlay — Threads shows caption text prominently, so the image
 * does the visual work while the hook text goes in the caption.
 * Just the photo + subtle branding + optional location tag.
 *
 * @param {Object} params
 * @param {string} params.imageUrl     - Background photo URL
 * @param {string} [params.locationTag] - Optional location/category hint (e.g. "BALI vs THAÏLANDE")
 * @returns {Promise<Buffer>} PNG image buffer (1080x1080)
 */
export async function generateThreadsCard({ imageUrl, locationTag = '' }) {
  const html = renderTemplate('threads-card.html', {
    IMAGE_URL: imageUrl,
    LOCATION_TAG: locationTag,
  });

  const buffer = await nodeHtmlToImage({
    html,
    ...IMAGE_OPTIONS,
  });

  return buffer;
}

// ── VoyagePirates-style Carousel Generators ─────────────────────────────────

/**
 * Country name to flag emoji mapping for hook slides.
 */
const COUNTRY_FLAGS = {
  'thaïlande': '\ud83c\uddf9\ud83c\udded', 'thailande': '\ud83c\uddf9\ud83c\udded', 'thailand': '\ud83c\uddf9\ud83c\udded',
  'vietnam': '\ud83c\uddfb\ud83c\uddf3', 'viêtnam': '\ud83c\uddfb\ud83c\uddf3',
  'cambodge': '\ud83c\uddf0\ud83c\udded', 'cambodia': '\ud83c\uddf0\ud83c\udded',
  'indonésie': '\ud83c\uddee\ud83c\udde9', 'indonesie': '\ud83c\uddee\ud83c\udde9', 'indonesia': '\ud83c\uddee\ud83c\udde9',
  'bali': '\ud83c\uddee\ud83c\udde9',
  'malaisie': '\ud83c\uddf2\ud83c\uddfe', 'malaysia': '\ud83c\uddf2\ud83c\uddfe',
  'philippines': '\ud83c\uddf5\ud83c\udded',
  'japon': '\ud83c\uddef\ud83c\uddf5', 'japan': '\ud83c\uddef\ud83c\uddf5',
  'corée': '\ud83c\uddf0\ud83c\uddf7', 'coree': '\ud83c\uddf0\ud83c\uddf7', 'korea': '\ud83c\uddf0\ud83c\uddf7',
  'chine': '\ud83c\udde8\ud83c\uddf3', 'china': '\ud83c\udde8\ud83c\uddf3',
  'inde': '\ud83c\uddee\ud83c\uddf3', 'india': '\ud83c\uddee\ud83c\uddf3',
  'sri lanka': '\ud83c\uddf1\ud83c\uddf0',
  'nepal': '\ud83c\uddf3\ud83c\uddf5', 'népal': '\ud83c\uddf3\ud83c\uddf5',
  'myanmar': '\ud83c\uddf2\ud83c\uddf2', 'birmanie': '\ud83c\uddf2\ud83c\uddf2',
  'laos': '\ud83c\uddf1\ud83c\udde6',
  'singapour': '\ud83c\uddf8\ud83c\uddec', 'singapore': '\ud83c\uddf8\ud83c\uddec',
  'taiwan': '\ud83c\uddf9\ud83c\uddfc', 'taïwan': '\ud83c\uddf9\ud83c\uddfc',
  'mongolie': '\ud83c\uddf2\ud83c\uddf3', 'mongolia': '\ud83c\uddf2\ud83c\uddf3',
  'australie': '\ud83c\udde6\ud83c\uddfa', 'australia': '\ud83c\udde6\ud83c\uddfa',
  'nouvelle-zélande': '\ud83c\uddf3\ud83c\uddff', 'new zealand': '\ud83c\uddf3\ud83c\uddff',
  'dubaï': '\ud83c\udde6\ud83c\uddea', 'dubai': '\ud83c\udde6\ud83c\uddea',
  'maldives': '\ud83c\uddf2\ud83c\uddfb',
  'hong kong': '\ud83c\udded\ud83c\uddf0',
  'brunei': '\ud83c\udde7\ud83c\uddf3',
  'fidji': '\ud83c\uddeb\ud83c\uddef', 'fiji': '\ud83c\uddeb\ud83c\uddef',
  'asie': '\ud83c\udf0f',
};

/**
 * Detect the flag emoji from article title or category.
 * Priority: check title first (more specific), then category as fallback.
 * Matches longest country name first to avoid partial matches
 * (e.g. "sri lanka" before "inde" in "Sri Lanka Inde").
 */
export function detectFlag(title, category = '') {
  // Sort entries by key length descending so longer names match first
  const sortedEntries = Object.entries(COUNTRY_FLAGS)
    .sort((a, b) => b[0].length - a[0].length);

  // Check title first (most specific context)
  const titleLower = (title || '').toLowerCase();
  for (const [key, flag] of sortedEntries) {
    if (titleLower.includes(key)) return flag;
  }

  // Fallback: check category
  const catLower = (category || '').toLowerCase();
  for (const [key, flag] of sortedEntries) {
    if (catLower.includes(key)) return flag;
  }

  return '\ud83c\udf0f'; // default globe
}

/**
 * Generate a VP-style Hook slide (1080x1350).
 * Full photo background with flag circle, bold headline, gold tagline.
 *
 * @param {Object} params
 * @param {string} params.imageUrl  - Background photo URL
 * @param {string} params.flag      - Flag emoji (e.g. "\ud83c\uddf9\ud83c\udded")
 * @param {string} params.headline  - Big headline text (uppercase, italic, Montserrat 900)
 * @param {string} params.tagline   - Gold tagline below headline
 * @returns {Promise<Buffer>} PNG image buffer (1080x1350)
 */
export async function generateVPHook({ imageUrl, flag, headline, tagline }) {
  const html = renderTemplate('ig-carousel-hook-vp.html', {
    IMAGE_URL: imageUrl,
    FLAG: flag,
    HEADLINE: headline,
    TAGLINE: tagline || '',
  });

  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}

/**
 * Generate a VP-style Comparison/Info slide (1080x1350).
 * Photo background with dark overlay, two-column data rows, gold verdict.
 *
 * @param {Object} params
 * @param {string} params.imageUrl  - Background photo URL
 * @param {string} params.title     - Title text (e.g. "BUDGET COMPARATIF")
 * @param {string} params.flagA     - Flag emoji for destination A
 * @param {string} params.destA     - Destination A name
 * @param {string} params.flagB     - Flag emoji for destination B
 * @param {string} params.destB     - Destination B name
 * @param {Object} params.dataA     - { budget, vol, visa, nuit, repas } values for A
 * @param {Object} params.dataB     - { budget, vol, visa, nuit, repas } values for B
 * @param {string} params.verdict   - Verdict text for gold pill
 * @returns {Promise<Buffer>} PNG image buffer (1080x1350)
 */
export async function generateVPCompare({
  imageUrl,
  title,
  flagA, destA,
  flagB, destB,
  dataA, dataB,
  verdict,
}) {
  const html = renderTemplate('ig-carousel-info-vp.html', {
    IMAGE_URL: imageUrl,
    TITLE: title,
    FLAG_A: flagA,
    DEST_A: destA,
    FLAG_B: flagB,
    DEST_B: destB,
    BUDGET_A: dataA.budget || '–',
    BUDGET_B: dataB.budget || '–',
    VOL_A: dataA.vol || '–',
    VOL_B: dataB.vol || '–',
    VISA_A: dataA.visa || '–',
    VISA_B: dataB.visa || '–',
    NUIT_A: dataA.nuit || '–',
    NUIT_B: dataB.nuit || '–',
    REPAS_A: dataA.repas || '–',
    REPAS_B: dataB.repas || '–',
    VERDICT: verdict,
  });

  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}

/**
 * Generate a VP-style Budget slide (1080x1350).
 * Photo background with dark overlay, horizontal bar chart, gold total.
 * Bars use proportional scaling: biggest value = 100%, others proportional.
 *
 * @param {Object} params
 * @param {string} params.imageUrl  - Background photo URL
 * @param {string} params.title     - Title (gold, e.g. "BUDGET THAÏLANDE")
 * @param {string} params.subtitle  - Subtitle (white 80%)
 * @param {Array<Object>} params.bars - Array of up to 5 bars:
 *   { pct: number (0-100), color: string (CSS), val: string (display text) }
 *   If pct is not pre-computed, provide raw numeric values and they will be proportionally scaled.
 * @param {string} params.total     - Total amount (gold, e.g. "47 \u20ac")
 * @param {string} params.period    - Period text (e.g. "par jour")
 * @returns {Promise<Buffer>} PNG image buffer (1080x1350)
 */
const BUDGET_EMOJIS = { 'Hébergement': '🏨', 'Nourriture': '🍜', 'Transport': '🚗', 'Activités': '🎟️', 'eSIM': '📱' };

export async function generateVPBudget({ imageUrl, title, subtitle, bars, total, period }) {
  // Generate bar rows HTML dynamically — only render bars that have data
  const barsHtml = bars.map(bar => `
      <div class="bar-row">
        <div class="bar-label"><span class="bar-emoji">${BUDGET_EMOJIS[bar.label] || '💰'}</span><span class="bar-name">${bar.label}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${bar.pct}%;background:${bar.color || '#FFD700'}"><span class="bar-amount">${bar.val}</span></div></div>
      </div>`).join('\n');

  const vars = {
    IMAGE_URL: imageUrl,
    TITLE: title,
    SUBTITLE: subtitle || '',
    BARS_HTML: barsHtml,
    TOTAL: total,
    PERIOD: period || '',
  };

  const html = renderTemplate('ig-carousel-budget-vp.html', vars);
  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}

/**
 * Generate a VP-style CTA/Follow slide (1080x1350).
 * Photo background with dark overlay, large logo, brand name, CTA button.
 *
 * @param {Object} params
 * @param {string} params.imageUrl   - Background photo URL
 * @param {string} [params.valueProp]  - Value proposition text
 * @param {string} [params.ctaText]    - CTA button text
 * @param {string} [params.saveText]   - Save prompt below button
 * @returns {Promise<Buffer>} PNG image buffer (1080x1350)
 */
export async function generateVPCTA({
  imageUrl,
  valueProp = 'Guides terrain \u2022 Budgets r\u00e9els \u2022 Comparatifs honn\u00eates',
  ctaText = 'Suivre @flashvoyagemedia',
  saveText = 'Enregistre ce post \ud83d\udd16',
}) {
  const html = renderTemplate('ig-carousel-cta-vp.html', {
    IMAGE_URL: imageUrl,
    VALUE_PROP: valueProp,
    CTA_TEXT: ctaText,
    SAVE_TEXT: saveText,
  });

  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}

/**
 * Generate a product comparison slide (e.g. "Globe vs Smart eSIM").
 * Dynamic rows from AI extraction.
 */
export async function generateVPProductCompare({ imageUrl, title, productA, productB, rows, verdict }) {
  const rowsHtml = rows.map(r => `
      <div class="row">
        <div class="row-label">${r.label}</div>
        <span class="row-value val-a">${r.valA}</span>
        <span class="row-value val-b">${r.valB}</span>
      </div>`).join('\n');

  const html = renderTemplate('ig-carousel-compare-product.html', {
    IMAGE_URL: imageUrl,
    TITLE: title,
    PRODUCT_A: productA,
    PRODUCT_B: productB,
    ROWS_HTML: rowsHtml,
    VERDICT: verdict,
  });

  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}

// ── VP Carousel Orchestrator ─────────────────────────────────────────────────

/**
 * Default bar colors for budget slides.
 */
const BUDGET_COLORS = ['#FFD700', '#FF6B35', '#00C9A7', '#845EC2', '#4B8BBE'];

/**
 * Parse numeric amount from a stat string like "47 \u20ac", "250 \u20ac/nuit", "15 000 \u20ac".
 * Returns the numeric value or 0 if unparseable.
 */
function parseAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Compute proportional bar percentages (biggest = 100%).
 */
function computeBarPcts(values) {
  const max = Math.max(...values, 1);
  return values.map(v => Math.round((v / max) * 100));
}

/**
 * Known destination names for comparison detection.
 * Used to distinguish "Bali vs Thaïlande" (destination comparison)
 * from "eSIM Globe vs Smart" (product comparison).
 */
const DESTINATION_NAMES = [
  'bali', 'thaïlande', 'thailande', 'thailand', 'vietnam', 'viêtnam',
  'japon', 'japan', 'cambodge', 'cambodia', 'laos', 'philippines',
  'indonésie', 'indonesie', 'indonesia', 'malaisie', 'malaysia',
  'singapour', 'singapore', 'corée', 'coree', 'korea', 'chine', 'china',
  'inde', 'india', 'sri lanka', 'nepal', 'népal', 'myanmar', 'birmanie',
  'taiwan', 'taïwan', 'mongolie', 'mongolia', 'australie', 'australia',
  'nouvelle-zélande', 'new zealand', 'dubaï', 'dubai', 'maldives',
  'hong kong', 'brunei', 'fidji', 'fiji', 'asie', 'europe', 'afrique',
  'amérique', 'oceanie', 'mexique', 'costa rica', 'colombie', 'pérou',
  'argentine', 'brésil', 'maroc', 'tunisie', 'égypte', 'turquie',
  'grèce', 'italie', 'espagne', 'portugal', 'croatie',
];

/**
 * Check if a string segment contains a known destination name.
 */
function containsDestination(str) {
  const lower = str.toLowerCase();
  return DESTINATION_NAMES.some(d => lower.includes(d));
}

/**
 * Detect article type from title, category, and keyStats.
 * Returns: 'comparatif_destination' | 'comparatif_produit' | 'budget' | 'general'
 *
 * Logic:
 * 1. If title has "vs"/"ou"/"comparatif" AND 2 destination names → comparatif_destination
 * 2. If title has "vs"/"comparatif" but NOT 2 destinations → comparatif_produit
 * 3. If title has budget/prix/coût/€ AND article has 3+ monetary keyStats → budget
 * 4. Else → general
 */
function detectArticleType(title, category = '', keyStats = []) {
  const h = `${title} ${category}`.toLowerCase();
  const isComparisonTitle = /\bvs\b| ou |compar|choisir entre|diff[eé]rence/.test(h);

  if (isComparisonTitle) {
    // Try to find 2 destination names in the title
    const dests = extractComparisonDests(title);
    if (dests && containsDestination(dests.destA) && containsDestination(dests.destB)) {
      return 'comparatif_destination';
    }
    // Has comparison keywords but not 2 destinations → product comparison
    return 'comparatif_produit';
  }

  // Budget detection: title must mention budget/price keywords AND have 3+ real monetary stats
  if (/budget|co[uû]t|prix|d[eé]pens|combien|tarif|€/.test(h)) {
    const monetaryStats = Array.isArray(keyStats)
      ? keyStats.filter(s => (typeof s === 'object' ? s.amount > 0 : parseAmount(s) > 0))
      : [];
    if (monetaryStats.length >= 3) return 'budget';
  }

  return 'general';
}

/**
 * Try to extract two destinations from a comparison title.
 * e.g. "Bali vs Thaïlande" => { destA: "Bali", destB: "Thaïlande" }
 */
function extractComparisonDests(title) {
  // Try "X vs Y" pattern
  const vsMatch = title.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (vsMatch) return { destA: vsMatch[1].trim(), destB: vsMatch[2].trim() };

  // Try "X ou Y" pattern
  const ouMatch = title.match(/(.+?)\s+ou\s+(.+?)[\s:?]/i);
  if (ouMatch) return { destA: ouMatch[1].trim(), destB: ouMatch[2].trim() };

  return null;
}

/**
 * Detect the primary destination name from an article title.
 * Scans for known destination names and returns the first match (capitalized).
 * Falls back to null if no destination found.
 */
function detectDestinationFromTitle(title) {
  const lower = title.toLowerCase();
  for (const dest of DESTINATION_NAMES) {
    if (lower.includes(dest)) {
      // Return with first letter capitalized
      return dest.charAt(0).toUpperCase() + dest.slice(1);
    }
  }
  return null;
}

/**
 * Build budget bars from extracted keyStats.
 * Tries to map common budget categories; falls back to raw stats.
 * Handles both old string format and new { label, value, amount } objects.
 */
function buildBudgetBars(keyStats) {
  const defaultBars = [
    { label: 'H\u00e9bergement', val: '–', rawVal: 0 },
    { label: 'Nourriture', val: '–', rawVal: 0 },
    { label: 'Transport', val: '–', rawVal: 0 },
    { label: 'Activit\u00e9s', val: '–', rawVal: 0 },
    { label: 'eSIM', val: '–', rawVal: 0 },
  ];

  // Try to fill bars from keyStats (best effort matching)
  // Handles both old string format and new { label, value, amount } objects
  const statsCopy = [...keyStats];
  for (let i = 0; i < Math.min(statsCopy.length, 5); i++) {
    const stat = statsCopy[i];
    const isObj = typeof stat === 'object' && stat !== null;
    const value = isObj ? stat.value : stat;
    const amount = isObj ? (stat.amount || parseAmount(value)) : parseAmount(value);
    if (amount > 0) {
      defaultBars[i].val = (value || '').trim();
      defaultBars[i].rawVal = amount;
      if (isObj && stat.label) {
        defaultBars[i].label = stat.label;
      }
    }
  }

  // Compute proportional percentages
  const rawValues = defaultBars.map(b => b.rawVal);
  const pcts = computeBarPcts(rawValues);

  return defaultBars.map((b, i) => ({
    pct: pcts[i] || 10, // minimum 10% so bars are visible
    color: BUDGET_COLORS[i],
    val: b.val,
  }));
}

/**
 * Generate a complete VP-style Instagram carousel for an article.
 * Detects article type and produces the appropriate 3-4 slide set.
 *
 * @param {Object} params
 * @param {Object} params.article - Extracted article object from extractor.js:
 *   { hook, keyStats, shockFact, highlights, imageUrl, articleUrl, title, category }
 * @returns {Promise<{ buffers: Buffer[], slideTypes: string[] }>}
 *   buffers: array of PNG image buffers (one per slide)
 *   slideTypes: array of slide type labels for logging
 */
export async function generateVPCarousel({ article }) {
  const { title, category, imageUrl, keyStats, highlights } = article;
  const type = detectArticleType(title, category, keyStats);
  const flag = detectFlag(title, category);
  const bgImage = imageUrl || 'https://images.pexels.com/photos/3278215/pexels-photo-3278215.jpeg?w=1080';

  // BUG 5 fix: detect destination from title, not just category
  const destination = detectDestinationFromTitle(title) || category || 'VOYAGE';

  const buffers = [];
  const slideTypes = [];

  // ── Slide 1: Hook (always) ──
  const hookTagline = type === 'comparatif_destination'
    ? 'Swipe pour le comparatif complet \u27a1\ufe0f'
    : type === 'budget'
      ? 'Swipe pour voir le budget d\u00e9taill\u00e9 \u27a1\ufe0f'
      : 'Swipe pour en savoir plus \u27a1\ufe0f';

  buffers.push(await generateVPHook({
    imageUrl: bgImage,
    flag,
    headline: title.toUpperCase(),
    tagline: hookTagline,
  }));
  slideTypes.push('hook');

  // ── Slide 2: Type-specific middle slide ──
  // comparatif_destination → hook + compare + CTA (3 slides)
  if (type === 'comparatif_destination') {
    const dests = extractComparisonDests(title);
    if (dests) {
      const flagA = detectFlag(dests.destA);
      const flagB = detectFlag(dests.destB);

      // Build comparison data from keyStats (best effort)
      const dataA = { budget: '–', vol: '–', visa: '–', nuit: '–', repas: '–' };
      const dataB = { budget: '–', vol: '–', visa: '–', nuit: '–', repas: '–' };

      // If we have enough stats, distribute them across categories
      const statValues = keyStats.map(s => typeof s === 'object' ? s.value : s);
      const statPairs = [];
      for (let i = 0; i < statValues.length - 1; i += 2) {
        statPairs.push([statValues[i], statValues[i + 1]]);
      }
      const fields = ['budget', 'vol', 'visa', 'nuit', 'repas'];
      for (let i = 0; i < Math.min(statPairs.length, 5); i++) {
        dataA[fields[i]] = statPairs[i][0] || '–';
        dataB[fields[i]] = statPairs[i][1] || '–';
      }

      buffers.push(await generateVPCompare({
        imageUrl: bgImage,
        title: 'COMPARATIF BUDGET',
        flagA, destA: dests.destA,
        flagB, destB: dests.destB,
        dataA, dataB,
        verdict: `\u2705 Notre choix : ${dests.destA}`,
      }));
      slideTypes.push('compare');
    }
  }

  // comparatif_produit → hook + product comparison + CTA (3+ slides)
  if ((type === 'comparatif' || type === 'comparatif_produit') && !slideTypes.includes('compare')) {
    const rawText = article.rawText || '';
    const comparison = await extractProductComparisonWithAI(rawText, title);

    if (comparison && comparison.rows?.length >= 2) {
      buffers.push(await generateVPProductCompare({
        imageUrl: bgImage,
        title: 'COMPARATIF',
        productA: comparison.productA,
        productB: comparison.productB,
        rows: comparison.rows.slice(0, 5),
        verdict: comparison.verdict || `Notre choix : ${comparison.productA}`,
      }));
      slideTypes.push('compare_product');
    } else {
      console.warn(`[visual] No AI comparison data for "${title}" — comparatif slide skipped`);
    }
  }

  // budget → hook + budget + CTA (3 slides) — ONLY if real € amounts found
  if (type === 'budget') {
    // Reuse AI budget from article if already extracted (by index.js for caption), otherwise extract now
    const rawText = article.rawText || '';
    const aiBudget = article.aiBudget || await extractBudgetWithAI(rawText, destination);

    let bars;
    let totalStr;

    if (aiBudget) {
      // Map AI budget response to bar chart data
      const aiCategories = [
        { label: 'Hébergement', key: 'hebergement' },
        { label: 'Nourriture', key: 'nourriture' },
        { label: 'Transport', key: 'transport' },
        { label: 'Activités', key: 'activites' },
        { label: 'eSIM', key: 'esim' },
      ];

      // Filter out null categories — only show bars with real amounts
      const aiBars = aiCategories
        .filter(cat => aiBudget[cat.key] != null)
        .map((cat, i) => {
          const val = aiBudget[cat.key];
          const rawVal = parseAmount(val);
          return { label: cat.label, val, rawVal, color: BUDGET_COLORS[i] };
        });

      if (aiBars.length === 0) {
        console.warn(`[visual] AI returned all null budget for ${destination} — skipping budget slide`);
        bars = null;
      } else {
        const rawValues = aiBars.map(b => b.rawVal);
        const pcts = computeBarPcts(rawValues);
        bars = aiBars.map((b, i) => ({
          label: b.label,
          pct: pcts[i] || 10,
          color: b.color,
          val: b.val,
        }));

        // Use AI total if available, otherwise sum the bars
        const sumRaw = rawValues.reduce((a, b) => a + b, 0);
        totalStr = aiBudget.total_jour || aiBudget.total_sejour || (sumRaw > 0 ? `${Math.round(sumRaw)} \u20ac` : '\u2013 \u20ac');
      }
    } else {
      // No AI extraction available — skip budget slide entirely
      // Regex fallback produces unreliable numbers, better to omit than hallucinate
      console.warn(`[visual] No AI budget data for ${destination} — skipping budget slide`);
      bars = null;
    }

    if (bars) {
    buffers.push(await generateVPBudget({
      imageUrl: bgImage,
      title: `BUDGET ${destination.toUpperCase()}`,
      subtitle: highlights[0] || '',
      bars,
      total: totalStr,
      period: 'par jour',
    }));
    slideTypes.push('budget');
    } // end if (bars)
  }

  // ── Last Slide: CTA (always) ──
  buffers.push(await generateVPCTA({
    imageUrl: bgImage,
    valueProp: 'Guides terrain \u2022 Budgets r\u00e9els \u2022 Comparatifs honn\u00eates',
    ctaText: 'Suivre @flashvoyagemedia',
    saveText: 'Enregistre ce post \ud83d\udd16',
  }));
  slideTypes.push('cta');

  return { buffers, slideTypes };
}

// ── Instagram Story Generator (9:16 vertical, 1080x1920) ────────────────────

/**
 * Generate an Instagram Story image (1080x1920, 9:16 vertical).
 * VP hook style adapted for Stories format:
 *   - Full photo background
 *   - Gradient overlay bottom 40%
 *   - Flag circle top-center
 *   - Headline yellow bold centered
 *   - Subtext white
 *   - "Lien en bio" CTA at bottom
 *   - Flash Voyage logo watermark
 *
 * @param {Object} params
 * @param {string} params.imageUrl   - Background photo URL
 * @param {string} params.flag       - Flag emoji (e.g. "\ud83c\uddf9\ud83c\udded")
 * @param {string} params.headline   - Big headline text (uppercase, yellow, bold)
 * @param {string} params.subtext    - White subtext below headline
 * @param {string} [params.cta]      - CTA text (default: "Lien en bio")
 * @returns {Promise<Buffer>} PNG image buffer (1080x1920)
 */
export async function generateStory({
  imageUrl,
  flag,
  headline,
  subtext,
  cta = 'Lien en bio',
}) {
  const html = renderTemplate('ig-story.html', {
    IMAGE_URL: imageUrl,
    FLAG: flag,
    HEADLINE: headline,
    SUBTEXT: subtext,
    CTA: cta,
  });

  return nodeHtmlToImage({ html, ...IMAGE_OPTIONS });
}
