/**
 * R1 — YYYY Refresh (LOW tier, deterministic, no LLM).
 *
 * Swap "2025" → "2026" in: title + first H1 tag + first paragraph only.
 * NOT in every occurrence — scope matters for HCU (Helpful Content Update)
 * signal integrity.
 *
 * Applies if: title OR H1 OR first-paragraph mentions "2025" AND the
 * same scope does not already mention "2026".
 *
 * The runner is responsible for computing overall diff size and skipping
 * if the change is < 5% of total post length (hcu_diff_too_small).
 */

import { getRawTitle, getRawContent } from '../wp.js';

const FROM_YEAR = '2025';
const TO_YEAR = '2026';

/**
 * Extract the first H1 block (both block-editor HTML and plain <h1>).
 */
function findFirstH1(content) {
  const m = content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? { full: m[0], inner: m[1], index: m.index } : null;
}

/**
 * Extract the first <p> tag (typically the lede).
 */
function findFirstParagraph(content) {
  const m = content.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  return m ? { full: m[0], inner: m[1], index: m.index } : null;
}

function scopeNeedsSwap(text) {
  if (!text) return false;
  return text.includes(FROM_YEAR) && !text.includes(TO_YEAR);
}

function swapFirstOnly(text) {
  // Replace every occurrence of FROM_YEAR within the scope we already
  // decided to touch (title / first H1 / first paragraph). Within a
  // single scope that's limited surface area, so replaceAll is fine.
  return text.split(FROM_YEAR).join(TO_YEAR);
}

export default {
  id: 'R1',
  tier: 'LOW',
  description: 'YYYY refresh — swap 2025 → 2026 in title + first H1 + first paragraph',

  appliesTo(post) {
    const title = getRawTitle(post);
    const content = getRawContent(post);
    const h1 = findFirstH1(content);
    const firstP = findFirstParagraph(content);

    const titleNeeds = scopeNeedsSwap(title);
    const h1Needs = h1 ? scopeNeedsSwap(h1.inner) : false;
    const pNeeds = firstP ? scopeNeedsSwap(firstP.inner) : false;

    if (!titleNeeds && !h1Needs && !pNeeds) {
      return { applies: false, reason: 'no_yyyy_2025_or_already_2026' };
    }
    return { applies: true };
  },

  apply(post /* , { dryRun } */) {
    const oldTitle = getRawTitle(post);
    const oldContent = getRawContent(post);

    const touched = [];
    let newTitle = oldTitle;
    let newContent = oldContent;

    if (scopeNeedsSwap(oldTitle)) {
      newTitle = swapFirstOnly(oldTitle);
      touched.push('title');
    }

    const h1 = findFirstH1(oldContent);
    if (h1 && scopeNeedsSwap(h1.inner)) {
      const newH1 = swapFirstOnly(h1.full);
      newContent =
        newContent.slice(0, h1.index) +
        newH1 +
        newContent.slice(h1.index + h1.full.length);
      touched.push('H1');
    }

    const firstP = findFirstParagraph(newContent);
    if (firstP && scopeNeedsSwap(firstP.inner)) {
      const newP = swapFirstOnly(firstP.full);
      newContent =
        newContent.slice(0, firstP.index) +
        newP +
        newContent.slice(firstP.index + firstP.full.length);
      touched.push('first paragraph');
    }

    if (touched.length === 0) {
      return {
        status: 'skipped',
        reason: 'no_scope_matched_on_apply',
        diffSummary: '',
      };
    }

    return {
      status: 'success',
      diffSummary: `YYYY: ${FROM_YEAR} → ${TO_YEAR} in ${touched.join(' + ')}`,
      newTitle: newTitle !== oldTitle ? newTitle : undefined,
      newContent: newContent !== oldContent ? newContent : undefined,
    };
  },
};
