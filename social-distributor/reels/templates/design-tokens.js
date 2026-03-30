/**
 * FlashVoyage Reels — Design Tokens & Visual System
 *
 * Central source of truth for all 6 reel format visual specs.
 * Consumed by template generators and overlay composers.
 *
 * Canvas: 1080x1920 (9:16), rendered via node-html-to-image as PNG overlays.
 *
 * DESIGN PHILOSOPHY (from competitor analysis):
 * - VoyagesPirates: ZERO logo, white bold + shadow, raw/low-production
 * - Trip.com: Minimal branding, serif+sans combo, color-coded pills
 * - FlashVoyage approach: SUBTLE branding via consistent color language
 *   (gold accents + Montserrat), logo ONLY on CTA/closing frames.
 *   Recognition comes from typography + color system, not a logo stamp.
 */

// ── Canvas ──────────────────────────────────────────────────────────────────

export const CANVAS = {
  width: 1080,
  height: 1920,
  aspectRatio: '9:16',
};

// ── Safe Zones ──────────────────────────────────────────────────────────────
// Instagram UI overlays: username top-left, audio bottom-right, caption bottom-left
// These zones must remain clear of critical content.

export const SAFE_ZONES = {
  top: 200,        // Camera UI, IG username bar, close button
  bottom: 280,     // Caption text area, audio pill, like/comment/share buttons
  left: 40,        // Edge padding
  right: 40,       // Edge padding
  // Usable content area: 1000px wide x 1440px tall (center of frame)
  content: {
    x: 40,
    y: 200,
    width: 1000,
    height: 1440,
  },
};

// ── Typography ──────────────────────────────────────────────────────────────

export const FONTS = {
  // Primary: all headlines, hooks, item text
  primary: {
    family: "'Montserrat', 'Arial Black', sans-serif",
    googleImport: "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400;1,700&display=swap",
  },
  // Secondary: subtitles, location labels, diary captions
  // Playfair Display for editorial/vintage feel (Travel Diary format)
  secondary: {
    family: "'Playfair Display', 'Georgia', serif",
    googleImport: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&display=swap",
  },
  // Tertiary: cursive for postcard/diary format
  cursive: {
    family: "'Dancing Script', 'Brush Script MT', cursive",
    googleImport: "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap",
  },
};

export const TYPE_SCALE = {
  // Hook headlines (largest text)
  hookXL: { size: 96, weight: 900, lineHeight: 1.05, letterSpacing: -2 },
  hookL:  { size: 80, weight: 900, lineHeight: 1.08, letterSpacing: -1.5 },
  hookM:  { size: 64, weight: 900, lineHeight: 1.1,  letterSpacing: -1 },

  // Item text (listicle items, numbered items)
  itemXL: { size: 56, weight: 800, lineHeight: 1.15, letterSpacing: -0.5 },
  itemL:  { size: 48, weight: 800, lineHeight: 1.18, letterSpacing: -0.3 },
  itemM:  { size: 40, weight: 800, lineHeight: 1.2,  letterSpacing: 0 },

  // Subtitles, descriptions
  subL:   { size: 36, weight: 700, lineHeight: 1.3,  letterSpacing: 0 },
  subM:   { size: 30, weight: 600, lineHeight: 1.35, letterSpacing: 0.2 },
  subS:   { size: 24, weight: 600, lineHeight: 1.4,  letterSpacing: 0.3 },

  // Number badges (listicle counters)
  numberXL: { size: 120, weight: 900, lineHeight: 1, letterSpacing: 0 },
  numberL:  { size: 96,  weight: 900, lineHeight: 1, letterSpacing: 0 },

  // Price text (budget format)
  priceXL: { size: 88, weight: 900, lineHeight: 1, letterSpacing: -1 },
  priceL:  { size: 72, weight: 900, lineHeight: 1, letterSpacing: -0.5 },

  // Poll option text
  pollOption: { size: 52, weight: 800, lineHeight: 1.2, letterSpacing: 0 },

  // Cursive/diary
  diaryTitle:  { size: 56, weight: 700, lineHeight: 1.3, letterSpacing: 0.5 },
  diaryBody:   { size: 36, weight: 400, lineHeight: 1.5, letterSpacing: 0.3 },

  // CTA
  ctaL: { size: 36, weight: 800, lineHeight: 1.3, letterSpacing: 1 },
  ctaM: { size: 28, weight: 700, lineHeight: 1.3, letterSpacing: 1.5 },

  // Watermark
  watermark: { size: 14, weight: 800, lineHeight: 1, letterSpacing: 2 },
};

// ── Colors ──────────────────────────────────────────────────────────────────

export const COLORS = {
  // Brand core
  gold:         '#FFD700',
  goldLight:    '#FFE44D',
  goldDark:     '#D4A800',

  // Text
  white:        '#FFFFFF',
  whiteAlpha80: 'rgba(255, 255, 255, 0.80)',
  whiteAlpha60: 'rgba(255, 255, 255, 0.60)',
  whiteAlpha45: 'rgba(255, 255, 255, 0.45)',

  // Backgrounds
  black:        '#000000',
  blackAlpha85: 'rgba(0, 0, 0, 0.85)',
  blackAlpha70: 'rgba(0, 0, 0, 0.70)',
  blackAlpha50: 'rgba(0, 0, 0, 0.50)',
  blackAlpha30: 'rgba(0, 0, 0, 0.30)',
  darkNavy:     '#0A0E1A',
  darkSlate:    '#1A1A2E',

  // Format-specific accents
  humor: {
    bg:      '#1A1A2E',
    accent:  '#FFD700',
    text:    '#FFFFFF',
  },
  bestInMonth: {
    bg:      'transparent',
    accent:  '#FFD700',
    pin:     '#FF3B30',
    label:   'rgba(0, 0, 0, 0.75)',
    text:    '#FFFFFF',
  },
  budgetGrid: {
    bg:      'rgba(0, 0, 0, 0.80)',
    accent:  '#00D97E',     // Green for prices (Trip.com style)
    accentAlt: '#FFD700',   // Gold for total
    pill:    'rgba(0, 209, 126, 0.9)',
    text:    '#FFFFFF',
  },
  tripPick: {
    bg:      'transparent',
    accent:  '#FFD700',
    text:    '#FFFFFF',
  },
  engagementPoll: {
    bg:       'rgba(0, 0, 0, 0.75)',
    accent:   '#FFD700',
    optionBg: 'rgba(255, 255, 255, 0.12)',
    optionBorder: 'rgba(255, 215, 0, 0.4)',
    text:     '#FFFFFF',
    numberBg: '#FFD700',
    numberText: '#000000',
  },
  travelDiary: {
    bg:         'transparent',
    paper:      '#FFF8E7',
    paperShadow: 'rgba(0, 0, 0, 0.25)',
    ink:        '#2C1810',
    inkLight:   '#5C3D2E',
    stamp:      '#C41E3A',
    gold:       '#B8860B',
    text:       '#FFFFFF',
  },
};

// ── Text Shadows ────────────────────────────────────────────────────────────

export const SHADOWS = {
  // Heavy: for text over raw footage (maximum readability)
  heavy: `
    3px 3px 0 #000,
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000,
    0 4px 12px rgba(0, 0, 0, 0.9)
  `.trim(),

  // Medium: for text over gradient overlays
  medium: `
    2px 2px 0 rgba(0, 0, 0, 0.6),
    0 3px 8px rgba(0, 0, 0, 0.7)
  `.trim(),

  // Soft: for text on dark solid backgrounds
  soft: `
    0 2px 6px rgba(0, 0, 0, 0.5)
  `.trim(),

  // Gold glow: for gold accent text
  goldGlow: `
    4px 4px 0 rgba(0, 0, 0, 0.6),
    0 0 20px rgba(255, 215, 0, 0.3)
  `.trim(),

  // None
  none: 'none',
};

// ── Gradient Overlays ───────────────────────────────────────────────────────

export const GRADIENTS = {
  // Bottom 50%: footage visible at top, dark at bottom for text
  bottomHalf: `linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.15) 15%,
    rgba(0, 0, 0, 0.50) 40%,
    rgba(0, 0, 0, 0.85) 100%
  )`,

  // Full vignette: dark edges, center clear
  vignette: `radial-gradient(
    ellipse at center,
    rgba(0, 0, 0, 0) 30%,
    rgba(0, 0, 0, 0.60) 100%
  )`,

  // Top bar: for hook text at top
  topBar: `linear-gradient(
    to top,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.70) 100%
  )`,

  // Budget card background
  budgetCard: `linear-gradient(
    135deg,
    rgba(10, 14, 26, 0.92) 0%,
    rgba(26, 26, 46, 0.92) 100%
  )`,

  // Vintage/sepia tint for diary format
  vintageTint: `linear-gradient(
    to bottom,
    rgba(44, 24, 16, 0.20) 0%,
    rgba(44, 24, 16, 0.10) 50%,
    rgba(44, 24, 16, 0.30) 100%
  )`,
};

// ── Graphic Elements ────────────────────────────────────────────────────────

export const ELEMENTS = {
  // Map pin icon (Trip.com style red pin)
  mapPin: {
    svg: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0zm0 19a5 5 0 110-10 5 5 0 010 10z" fill="#FF3B30"/>
    </svg>`,
    width: 28,
    height: 36,
    color: '#FF3B30',
  },

  // Price pill (budget format)
  pricePill: {
    borderRadius: 16,
    paddingH: 28,       // horizontal
    paddingV: 12,       // vertical
    bgColor: 'rgba(0, 209, 126, 0.9)',
    textColor: '#FFFFFF',
    fontSize: 40,
    fontWeight: 800,
  },

  // Number badge (poll format)
  numberBadge: {
    size: 72,           // width & height (circle)
    borderRadius: '50%',
    bgColor: '#FFD700',
    textColor: '#000000',
    fontSize: 36,
    fontWeight: 900,
  },

  // Poll option bar
  pollOptionBar: {
    borderRadius: 20,
    paddingH: 30,
    paddingV: 20,
    bgColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 215, 0, 0.4)',
    borderWidth: 2,
    gap: 20,           // between options
  },

  // Postcard frame (diary format)
  postcardFrame: {
    width: 900,
    height: 600,
    borderRadius: 8,
    bgColor: '#FFF8E7',
    shadowX: 0,
    shadowY: 8,
    shadowBlur: 30,
    shadowColor: 'rgba(0, 0, 0, 0.25)',
    rotation: -3,      // degrees
    padding: 40,
  },

  // Stamp (diary format)
  stamp: {
    size: 120,
    borderRadius: '50%',
    borderWidth: 4,
    borderColor: '#C41E3A',
    rotation: 15,       // degrees
    opacity: 0.7,
  },

  // Watermark (brand)
  watermark: {
    position: { bottom: 50, right: 50 },
    opacity: 0.45,
    logoWidth: 40,
    logoHeight: 42,
    textSize: 14,
    textWeight: 800,
    textLetterSpacing: 2,
    showOnFormats: ['cta_only'],  // Only on CTA/closing frames
    // Per competitor analysis: NO logo on content frames
  },
};

// ── Brand Consistency Rules ─────────────────────────────────────────────────

export const BRAND_RULES = {
  // Logo visibility per format (competitor-informed: less is more)
  logoPolicy: {
    humor:          'never',          // VoyagePirates style: zero branding
    bestInMonth:    'cta_frame_only', // Only on the final CTA card
    budgetGrid:     'cta_frame_only',
    tripPick:       'cta_frame_only',
    engagementPoll: 'never',          // Polls should feel native/organic
    travelDiary:    'never',          // Vintage aesthetic breaks with modern logo
  },

  // How FlashVoyage reels are recognized WITHOUT heavy branding:
  // 1. Gold #FFD700 accents on every format (consistent color signature)
  // 2. Montserrat 900 uppercase text (consistent typographic voice)
  // 3. Bottom-gradient over footage (consistent framing language)
  // 4. Heavy text-shadow for readability (consistent production quality)
  // 5. French-first editorial tone (not influencer)

  // Gold usage: KEEP #FFD700 as the signature accent across all formats
  // It appears as: number badges, accent underlines, price highlights, CTA text
  goldAccentUsage: 'mandatory_on_all_formats',

  // Typography: Montserrat 800-900 uppercase = the "FlashVoyage voice"
  typographicVoice: 'montserrat_black_uppercase',
};

// ── Format Definitions ──────────────────────────────────────────────────────

export const FORMATS = {
  humor: {
    id: 'humor',
    name: 'Humor / Meme',
    duration: { min: 5, max: 8 },
    scenes: 1,
    description: 'Photo + relatable text + reaction face/emoji',
  },
  bestInMonth: {
    id: 'bestInMonth',
    name: 'Best in Month',
    duration: { min: 15, max: 15 },
    scenes: 7, // hook + 5 destinations + CTA
    description: 'Hook + 5 destination clips with location labels',
  },
  budgetGrid: {
    id: 'budgetGrid',
    name: 'Budget Grid',
    duration: { min: 20, max: 20 },
    scenes: 6, // title + 4 line items + total
    description: 'Data card with prices overlaid on travel footage',
  },
  tripPick: {
    id: 'tripPick',
    name: 'Trip Pick',
    duration: { min: 7, max: 10 },
    scenes: 4, // title + 2-3 reveals
    description: 'Title card + rapid location reveals',
  },
  engagementPoll: {
    id: 'engagementPoll',
    name: 'Engagement Poll',
    duration: { min: 5, max: 5 },
    scenes: 1,
    description: 'Question + 2-4 numbered options',
  },
  travelDiary: {
    id: 'travelDiary',
    name: 'Travel Diary',
    duration: { min: 9, max: 9 },
    scenes: 3, // postcard + text + reveal
    description: 'Vintage aesthetic + postcard overlay + cursive',
  },
};
