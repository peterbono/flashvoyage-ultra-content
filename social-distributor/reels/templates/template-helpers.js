/**
 * Template Helpers — FlashVoyage Reels
 *
 * Generates HTML fragments for dynamic template elements:
 * - Budget line items
 * - Poll options
 * - Adaptive font sizing
 *
 * Used by format-specific composers when populating HTML templates.
 */

// ── Budget Grid: Line Item HTML ─────────────────────────────────────────────

/**
 * Generate HTML for a single budget line item.
 *
 * @param {string} category - e.g. "Hebergement", "Vols", "Nourriture"
 * @param {string} price - e.g. "450 EUR", "1 200 EUR"
 * @returns {string} HTML string for one .line-item div
 */
export function buildBudgetLineItem(category, price) {
  return `
    <div class="line-item">
      <div class="item-category">${escapeHtml(category)}</div>
      <div class="price-pill">${escapeHtml(price)}</div>
    </div>
  `.trim();
}

/**
 * Generate HTML for multiple budget line items.
 *
 * @param {Array<{category: string, price: string}>} items
 * @returns {string} Combined HTML
 */
export function buildBudgetLineItems(items) {
  return items.map(item => buildBudgetLineItem(item.category, item.price)).join('\n');
}

// ── Engagement Poll: Option HTML ────────────────────────────────────────────

/**
 * Generate HTML for a single poll option.
 *
 * @param {number} number - Option number (1, 2, 3, 4)
 * @param {string} text - Option text
 * @returns {string} HTML string for one .option-bar div
 */
export function buildPollOption(number, text) {
  return `
    <div class="option-bar">
      <div class="option-number">${number}</div>
      <div class="option-text">${escapeHtml(text)}</div>
    </div>
  `.trim();
}

/**
 * Generate HTML for multiple poll options.
 *
 * @param {Array<{number: number, text: string}>} options
 * @returns {string} Combined HTML
 */
export function buildPollOptions(options) {
  return options.map(opt => buildPollOption(opt.number, opt.text)).join('\n');
}

// ── Adaptive Font Sizing ────────────────────────────────────────────────────

/**
 * Calculate adaptive font size based on text length.
 * Longer text gets smaller font to fit within the overlay.
 *
 * @param {string} text - The text to display
 * @param {Object} config
 * @param {number} config.maxSize - Maximum font size (px)
 * @param {number} config.minSize - Minimum font size (px)
 * @param {number} config.shortThreshold - Char count below which maxSize is used
 * @param {number} config.longThreshold - Char count above which minSize is used
 * @returns {number} Font size in px
 */
export function adaptiveFontSize(text, config = {}) {
  const {
    maxSize = 80,
    minSize = 48,
    shortThreshold = 20,
    longThreshold = 80,
  } = config;

  const len = text.length;

  if (len <= shortThreshold) return maxSize;
  if (len >= longThreshold) return minSize;

  // Linear interpolation between thresholds
  const ratio = (len - shortThreshold) / (longThreshold - shortThreshold);
  return Math.round(maxSize - ratio * (maxSize - minSize));
}

/**
 * Preset adaptive sizing configurations per format.
 */
export const FONT_PRESETS = {
  // Humor: meme text (top)
  humorMeme: { maxSize: 80, minSize: 52, shortThreshold: 15, longThreshold: 60 },
  // Humor: punchline (bottom)
  humorPunchline: { maxSize: 56, minSize: 36, shortThreshold: 15, longThreshold: 50 },
  // Best-in-Month: hook text
  bestHook: { maxSize: 80, minSize: 56, shortThreshold: 20, longThreshold: 70 },
  // Best-in-Month: location name
  bestLocation: { maxSize: 56, minSize: 40, shortThreshold: 15, longThreshold: 40 },
  // Budget: title
  budgetTitle: { maxSize: 72, minSize: 44, shortThreshold: 15, longThreshold: 50 },
  // Trip Pick: location reveal
  tripLocation: { maxSize: 80, minSize: 52, shortThreshold: 10, longThreshold: 40 },
  // Poll: question
  pollQuestion: { maxSize: 56, minSize: 40, shortThreshold: 20, longThreshold: 60 },
  // Diary: editorial title
  diaryTitle: { maxSize: 48, minSize: 32, shortThreshold: 20, longThreshold: 60 },
  // Diary: cursive quote
  diaryQuote: { maxSize: 44, minSize: 28, shortThreshold: 20, longThreshold: 70 },
};

// ── HTML Escaping ───────────────────────────────────────────────────────────

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Reaction Emoji Mapping ──────────────────────────────────────────────────

/**
 * Map a mood/emotion to an appropriate reaction emoji.
 *
 * @param {string} mood - e.g. 'shock', 'laugh', 'cry', 'money', 'fire'
 * @returns {string} Emoji character
 */
export function moodToEmoji(mood) {
  const map = {
    shock:    '\u{1F631}', // face screaming
    laugh:    '\u{1F602}', // face with tears of joy
    cry:      '\u{1F62D}', // loudly crying face
    money:    '\u{1F911}', // money-mouth face
    fire:     '\u{1F525}', // fire
    mindblown:'\u{1F92F}', // exploding head
    cool:     '\u{1F60E}', // sunglasses face
    think:    '\u{1F914}', // thinking face
    sad:      '\u{1F625}', // sad but relieved face
    celebrate:'\u{1F389}', // party popper
    plane:    '\u{2708}\u{FE0F}',  // airplane
    palm:     '\u{1F334}', // palm tree
    love:     '\u{1F60D}', // heart eyes
    default:  '\u{1F602}', // face with tears of joy
  };
  return map[mood] || map.default;
}

// ── Stamp Text for Diary ────────────────────────────────────────────────────

/**
 * Generate stamp text for a destination.
 * Returns short country or region code.
 *
 * @param {string} destination - e.g. "Bali, Indonesie"
 * @returns {string} Stamp text, e.g. "BALI"
 */
export function generateStampText(destination) {
  // Take the first word/city name, uppercase, max 8 chars
  const firstWord = (destination || 'VOYAGE').split(/[,\s-]/)[0].toUpperCase();
  return firstWord.slice(0, 8);
}
