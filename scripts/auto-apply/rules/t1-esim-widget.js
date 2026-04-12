/**
 * T1 — eSIM widget injection (LOW tier, deterministic, no LLM).
 *
 * Appends a standardized eSIM block after the FIRST </h2> tag in articles
 * that:
 *   - mention "eSIM" (case-insensitive) in title or content
 *   - target a whitelisted SEA destination (title OR slug match)
 *   - do NOT already contain the marker <!-- esim-widget --> or a
 *     [esim_widget] shortcode
 *
 * Widget markup: the canonical Airalo eSIM widget from
 * travelpayouts-real-widgets-database.js (shmarker=676421, promo_id=8588).
 * We wrap it with the marker comment so subsequent runs are idempotent.
 *
 * TODO: verify widget markup with the editorial team — the Travelpayouts
 * script tag is copied as-is from travelpayouts-real-widgets-database.js;
 * if the widget shell needs a wp:html block wrapper for the Gutenberg
 * editor, this can be added without changing the marker contract.
 */

import { getRawTitle, getRawContent } from '../wp.js';

const DESTINATION_WHITELIST = [
  'thailande', 'thaïlande', 'thailand',
  'vietnam',
  'indonesie', 'indonésie', 'indonesia', 'bali',
  'philippines',
  'japon', 'japan',
  'laos',
  'cambodge', 'cambodia',
  'taiwan', 'taïwan',
  'malaisie', 'malaysia',
  'singapour', 'singapore',
];

const MARKER = '<!-- esim-widget -->';
const SHORTCODE = '[esim_widget]';

// Canonical Airalo eSIM widget (from travelpayouts-real-widgets-database.js).
// Wrapped as a Gutenberg custom HTML block so it survives the editor.
const WIDGET_HTML = `<!-- wp:html -->
${MARKER}
<div class="fv-esim-widget">
<p><strong>eSIM recommandée pour ce voyage</strong> — active ta connexion dès l'atterrissage, sans chercher de carte SIM locale.</p>
<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&locale=en&powered_by=true&color_button=%2332a8dd&color_focused=%2332a8dd&secondary=%23FFFFFF&dark=%23262626&light=%23FFFFFF&special=%23C4C4C4&border_radius=0&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>
</div>
<!-- /wp:html -->`;

function normalize(str) {
  return (str || '').toLowerCase();
}

function matchesDestination(post) {
  const title = normalize(getRawTitle(post));
  const slug = normalize(post?.slug);
  const hay = `${title} ${slug}`;
  return DESTINATION_WHITELIST.some(d => hay.includes(d));
}

function mentionsEsim(post) {
  const title = normalize(getRawTitle(post));
  const content = normalize(getRawContent(post));
  return title.includes('esim') || content.includes('esim');
}

function alreadyHasWidget(content) {
  return content.includes(MARKER) || content.includes(SHORTCODE);
}

export default {
  id: 'T1',
  tier: 'LOW',
  description: 'Inject Airalo eSIM widget after first H2 on SEA-destination eSIM articles',

  appliesTo(post) {
    const content = getRawContent(post);
    if (!mentionsEsim(post)) {
      return { applies: false, reason: 'no_esim_mention' };
    }
    if (!matchesDestination(post)) {
      return { applies: false, reason: 'destination_not_whitelisted' };
    }
    if (alreadyHasWidget(content)) {
      return { applies: false, reason: 'widget_already_present' };
    }
    const firstH2Close = content.search(/<\/h2>/i);
    if (firstH2Close < 0) {
      return { applies: false, reason: 'no_h2_found' };
    }
    return { applies: true };
  },

  apply(post /* , { dryRun } */) {
    const content = getRawContent(post);
    const match = content.match(/<\/h2>/i);
    if (!match) {
      return {
        status: 'skipped',
        reason: 'no_h2_found',
        diffSummary: '',
      };
    }
    const insertPos = match.index + match[0].length;
    const newContent =
      content.slice(0, insertPos) +
      '\n\n' +
      WIDGET_HTML +
      '\n\n' +
      content.slice(insertPos);

    return {
      status: 'success',
      diffSummary: 'eSIM widget inserted after first H2',
      newContent,
    };
  },
};
