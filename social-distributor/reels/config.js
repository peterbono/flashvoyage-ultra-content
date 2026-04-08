/**
 * FlashVoyage Reels v2 — Format Registry & Config
 */

export const CANVAS = { width: 1080, height: 1920 };
export const FPS = 30;
export const CRF = 23;

export const COLORS = {
  white: '#FFFFFF',
  gold: '#FFD700',
  pinRed: '#FF3B30',
  pillGreen: 'rgba(0,209,126,0.9)',
  darkBg: '#0a0e1a',
  darkBg2: '#1a1a2e',
  postcardCream: '#FFF8E7',
};

export const FONTS = {
  primary: 'Montserrat',
  serif: 'Playfair Display',
  cursive: 'Dancing Script',
};

export const SAFE_ZONES = {
  top: 320,
  bottom: 280,
  sides: 40,
};

/** Format definitions with metadata */
export const FORMATS = {
  poll: {
    name: 'Engagement Poll',
    tier: 'KILLED',
    enabled: false, // KILLED: worst watch time (1.1s), zero engagement — CEO decision 2026-04-05
    duration: { min: 5, max: 7 },
    scenes: 1,
    audio: null,
    description: 'Question polarisante + options numerotees, optimise commentaires',
  },
  pick: {
    name: 'Trip Pick',
    tier: 'S',
    duration: { min: 10, max: 12 },
    scenes: '4-8',
    audio: null, // silent
    description: 'X spots a ne pas rater, cuts rapides',
  },
  humor: {
    name: 'Humor / Situation Relatable',
    tier: 'S',
    duration: { min: 5, max: 8 },
    scenes: 1,
    audio: null,
    description: 'Texte relatable + emoji reaction sur photo voyage',
  },
  budget: {
    name: 'Budget Jour',
    tier: 'S',
    duration: { min: 15, max: 20 },
    scenes: 6,
    audio: null,
    description: 'Budget quotidien detaille par destination',
  },
  avantapres: {
    name: 'Avant/Apres',
    tier: 'S+',
    duration: { min: 10, max: 12 },
    scenes: 3,
    audio: null,
    description: 'Expectation vs reality — STAR FORMAT: only format with saves (0.50%), 1.00% engagement',
  },
  month: {
    name: 'Ou Partir en [Mois]',
    tier: 'A',
    duration: { min: 15, max: 20 },
    scenes: 7,
    audio: null,
    description: '5 destinations SE Asia pour le mois suivant',
  },
  'cost-vs': {
    name: 'Cost vs France',
    tier: 'S+',
    duration: { min: 10, max: 10 },
    scenes: 2,
    audio: 'upbeat',
    description: 'Comparaison de 8 items X vs France + total mensuel band jaune — STAR FORMAT: 1.01% engagement, strong watch time',
  },
  leaderboard: {
    name: 'Top 10 Leaderboard',
    tier: 'S',
    duration: { min: 9, max: 9 },
    scenes: 3,
    audio: 'upbeat',
    description: 'Top 10 countries classement avec reveal countdown',
  },
  'best-time': {
    name: 'Best Time to Visit',
    tier: 'A',
    duration: { min: 10, max: 10 },
    scenes: 2,
    audio: 'upbeat',
    description: 'Guide saisonnier grid 2×3 pays avec pill jaune mois',
  },
};

export const FORMAT_NAMES = Object.keys(FORMATS);
