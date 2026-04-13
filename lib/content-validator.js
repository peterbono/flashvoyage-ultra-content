/**
 * FlashVoyage — Content Design System validator
 *
 * Runs at the very end of `article-finalizer.js` (and any other HTML-emitting
 * pipeline) to catch the hallucinated patterns that landed on 13 live articles
 * last week: dark-bg TL;DR boxes, purple/navy tables, fake "widget" cards
 * without Travelpayouts scripts, placeholder strings leaking through.
 *
 * Source of truth: `docs/content-design-system.md`
 *
 * Three tiers:
 *   - STRIP : safe auto-fixes (inline styles on tables, rogue dark-bg divs,
 *             purple/violet/navy background fragments, custom border-radius
 *             divs outside the allowlist).
 *   - WARN  : human-review needed (fake affiliate card with partner URL but
 *             no Travelpayouts script, empty-cite testimonials, placeholder
 *             strings like TODO / {{ }} / "Utilise tes connaissances pour…").
 *   - ERROR : currently empty. Reserved for future hard-reject gate; the
 *             finalizer logs errors but does not throw (spec §4).
 *
 * Design properties:
 *   - Pure regex, no new npm deps.
 *   - Idempotent: running the cleaner twice yields the same output.
 *   - Surgical: only strips the forbidden fragment, preserves inner content.
 */

// ───────────────────────────────────────────────────────────────────────────
// Allowlist — preserved classes (design-system §Preservation list)
// Any <div> matching these classes is left byte-for-byte intact.
// ───────────────────────────────────────────────────────────────────────────
const PRESERVED_CLASS_PATTERN =
  /\b(?:fv-faq-item|fv-esim-widget|articles-connexes|fv-byline|fv-author-box|fv-checklist)\b/;

// ───────────────────────────────────────────────────────────────────────────
// Partner URL fragments — any of these in a styled div without a real
// Travelpayouts marker suggests a fake affiliate card (design-system §Forbidden
// patterns, bullet "Fake widget cards").
// ───────────────────────────────────────────────────────────────────────────
const PARTNER_URL_PATTERN =
  /\b(?:tp\.media|aviasales|kiwi|airalo|booking|getyourguide|trip\.com|chapka|heymondo)\b/i;

// ───────────────────────────────────────────────────────────────────────────
// Real Travelpayouts markers — presence of any of these means the widget is
// legitimate and should NOT be warned about.
// ───────────────────────────────────────────────────────────────────────────
const TRAVELPAYOUTS_MARKER_PATTERN =
  /(?:shmarker\s*=\s*["']?676421|data-tp-widget|trs\s*=\s*["']?463418|travelpayouts\.com)/i;

// ───────────────────────────────────────────────────────────────────────────
// Dark background hex matcher — luminance < ~40% (design-system §Forbidden:
// Dark-background callouts).
// Matches #0xx / #1xx / #2xx / #3xx (3-char and 6-char hex).
// ───────────────────────────────────────────────────────────────────────────
const DARK_BG_HEX = /background(?:-color)?\s*:\s*#[0-3][0-9a-f](?:[0-9a-f]{1,4})?/i;

// Purple / violet / navy background fragment — matches the exact palette
// called out by the design-system doc (#6xx, #7xx, #8xx, #4c1…, #1a3…, #0f17…,
// #1e3…, #1e4…).
const PURPLE_NAVY_BG = /background(?:-color)?\s*:\s*#(?:[678][0-9a-f]{2,5}|4c1[0-9a-f]{2,3}|1a3[0-9a-f]{2,3}|0f17[0-9a-f]{1,2}|1e3[0-9a-f]{2,3}|1e4[0-9a-f]{2,3})/i;

// ───────────────────────────────────────────────────────────────────────────
// Placeholder / ghost strings that must never ship to WordPress.
// ───────────────────────────────────────────────────────────────────────────
const PLACEHOLDER_PATTERNS = [
  { name: 'evergreen-boilerplate', re: /Cet article est un contenu evergreen/i },
  { name: 'llm-meta-leak', re: /Utilise tes connaissances pour/i },
  { name: 'mustache-placeholder', re: /\{\{[^}]{1,80}\}\}/ },
  { name: 'double-bracket-placeholder', re: /\[\[[^\]]{1,80}\]\]/ },
  { name: 'todo-marker', re: /\bTODO\b/ },
  { name: 'placeholder-literal', re: /\bplaceholder\b/i },
];

// Empty / ghost testimonial citations inside a <blockquote>
// Case 1: <cite …>,  Extrait de témoignage
// Case 2: <cite …></cite> or <cite …> </cite> — empty author
const EMPTY_CITE_PATTERNS = [
  /<cite[^>]*>\s*,\s*Extrait de t[ée]moignage/i,
  /<cite[^>]*>\s*<\/cite>/i,
];

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Extract the class attribute value from an opening tag, or '' if absent.
 */
function extractClassAttr(openTag) {
  const m = openTag.match(/\sclass\s*=\s*["']([^"']*)["']/i);
  return m ? m[1] : '';
}

/**
 * Extract the style attribute value from an opening tag, or '' if absent.
 */
function extractStyleAttr(openTag) {
  const m = openTag.match(/\sstyle\s*=\s*["']([^"']*)["']/i);
  return m ? m[1] : '';
}

/**
 * Remove a CSS declaration that matches `declRegex` from a style string.
 * Works idempotently — if nothing matches, returns the original string.
 * Also collapses leftover ";;" and trims whitespace.
 */
function stripDeclaration(styleStr, declRegex) {
  let out = styleStr.replace(declRegex, '');
  out = out.replace(/;\s*;+/g, ';').replace(/^\s*;+/, '').replace(/;+\s*$/, '').trim();
  return out;
}

/**
 * Build a cleaned opening tag with a new (or removed) style attribute.
 */
function replaceStyleAttr(openTag, newStyle) {
  if (!newStyle) {
    // Remove the style attribute entirely.
    return openTag.replace(/\sstyle\s*=\s*["'][^"']*["']/i, '');
  }
  return openTag.replace(/\sstyle\s*=\s*["'][^"']*["']/i, ` style="${newStyle}"`);
}

/**
 * Find the matching closing tag for an opening <div …> at `startIdx` in
 * `html`. Supports nested <div>s by counting depth. Returns the index AFTER
 * the closing </div>, or -1 if unbalanced.
 */
function findMatchingDivEnd(html, startIdx) {
  // `startIdx` points to the char right after the opening <div …>'s `>`.
  const openRe = /<div\b[^>]*>/gi;
  const closeRe = /<\/div\s*>/gi;
  openRe.lastIndex = startIdx;
  closeRe.lastIndex = startIdx;

  let depth = 1;
  while (depth > 0) {
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return -1; // unbalanced
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      closeRe.lastIndex = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      openRe.lastIndex = nextClose.index + nextClose[0].length;
      if (depth === 0) return nextClose.index + nextClose[0].length;
    }
  }
  return -1;
}

// ───────────────────────────────────────────────────────────────────────────
// Pass 1 — Strip inline style on table elements
// <th style="…"> → <th>  (design-system §Forbidden, bullet 1)
// ───────────────────────────────────────────────────────────────────────────
function stripTableInlineStyles(html, report) {
  const tableTagRe = /<(table|thead|tbody|tr|th|td)\b([^>]*)>/gi;
  let count = 0;
  const cleaned = html.replace(tableTagRe, (match, tag, attrs) => {
    if (!/\sstyle\s*=/i.test(attrs)) return match;
    count++;
    const newAttrs = attrs.replace(/\sstyle\s*=\s*["'][^"']*["']/i, '');
    return `<${tag}${newAttrs}>`;
  });
  if (count > 0) {
    report.warnings.push({
      rule: 'strip:inline-style-on-table-element',
      sample: `auto-stripped ${count} inline style="…" attributes from table tags`,
      count,
    });
  }
  return cleaned;
}

// ───────────────────────────────────────────────────────────────────────────
// Pass 2 — Scrub purple/violet/navy background fragments from ANY inline
// style (not just divs). Preserves the tag, removes only the offending
// declaration. Safe because nothing in the canonical palette is purple.
// ───────────────────────────────────────────────────────────────────────────
function scrubPurpleNavyBackgrounds(html, report) {
  // One-shot regex: scan every opening tag with a style attribute.
  const styledTagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?\sstyle\s*=\s*["'][^"']*["'][^>]*)>/g;
  let count = 0;
  const cleaned = html.replace(styledTagRe, (match, tag, attrs) => {
    const style = extractStyleAttr(attrs);
    if (!style) return match;
    if (!PURPLE_NAVY_BG.test(style)) return match;
    const newStyle = stripDeclaration(style, /background(?:-color)?\s*:\s*[^;]+;?/i);
    count++;
    return `<${tag}${replaceStyleAttr(attrs, newStyle)}>`;
  });
  if (count > 0) {
    report.warnings.push({
      rule: 'strip:purple-navy-background',
      sample: `auto-stripped ${count} purple/violet/navy background declarations`,
      count,
    });
  }
  return cleaned;
}

// ───────────────────────────────────────────────────────────────────────────
// Pass 3 — Unwrap rogue <div>s with dark backgrounds or custom border-radius
// that are NOT in the preserved-class allowlist. "Unwrap" = remove the
// wrapping <div …>…</div>, preserving inner HTML (wrapped in <p> only if inner
// is pure inline text — block elements are emitted as-is to keep HTML valid).
//
// Walk the HTML linearly to handle nested <div>s correctly.
// ───────────────────────────────────────────────────────────────────────────
function unwrapRogueStyledDivs(html, report) {
  const divOpenRe = /<div\b([^>]*)>/gi;
  let result = '';
  let lastIdx = 0;
  let unwrapCount = 0;
  const fakeCardWarnings = [];

  let m;
  while ((m = divOpenRe.exec(html)) !== null) {
    const openStart = m.index;
    const openEnd = m.index + m[0].length;
    const attrs = m[1];

    const classAttr = extractClassAttr(attrs);
    const styleAttr = extractStyleAttr(attrs);

    // Whitelist classes are immutable
    if (PRESERVED_CLASS_PATTERN.test(classAttr)) continue;

    const hasDarkBg = DARK_BG_HEX.test(styleAttr);
    const hasCustomRadius = /border-radius\s*:/i.test(styleAttr);

    // Only act on divs that are NOT in the allowlist AND have a suspect style.
    if (!hasDarkBg && !hasCustomRadius) continue;

    // Find matching close to capture inner HTML.
    const closeIdx = findMatchingDivEnd(html, openEnd);
    if (closeIdx === -1) continue; // unbalanced, skip rather than corrupt

    const innerHtml = html.slice(openEnd, closeIdx - '</div>'.length);
    const fullBlock = html.slice(openStart, closeIdx);

    // WARN check: fake affiliate card (partner URL + no Travelpayouts marker)
    if (PARTNER_URL_PATTERN.test(fullBlock) && !TRAVELPAYOUTS_MARKER_PATTERN.test(fullBlock)) {
      fakeCardWarnings.push({
        rule: 'warn:fake-affiliate-card',
        sample: fullBlock.slice(0, 240),
        count: 1,
      });
    }

    // Append pre-match chunk
    result += html.slice(lastIdx, openStart);

    // Unwrap: strip the wrapping div, preserve inner HTML.
    // If the inner already contains block-level elements (p, ul, ol, h*, table,
    // div, blockquote), we emit the raw inner — wrapping it in <p> would be
    // invalid HTML. If it's pure inline text, wrap once in <p>.
    const trimmedInner = innerHtml.trim();
    const hasBlockElement = /<(?:p|ul|ol|h[1-6]|table|div|blockquote|pre|figure|section|article)\b/i.test(trimmedInner);
    const unwrapped = hasBlockElement ? trimmedInner : `<p>${trimmedInner}</p>`;
    result += unwrapped;

    lastIdx = closeIdx;
    unwrapCount++;

    // Fast-forward the regex past the consumed block
    divOpenRe.lastIndex = closeIdx;
  }
  result += html.slice(lastIdx);

  if (unwrapCount > 0) {
    report.warnings.push({
      rule: 'strip:rogue-styled-div-unwrapped',
      sample: `unwrapped ${unwrapCount} non-allowlisted div(s) with dark-bg or custom border-radius`,
      count: unwrapCount,
    });
  }
  for (const w of fakeCardWarnings) report.warnings.push(w);

  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// Pass 4 — Warn on fake affiliate "card-looking" blocks that use the
// allowlisted classes (`fv-faq-item`, `fv-callout`, etc.) but still contain
// a partner URL without a real Travelpayouts script. We do NOT auto-modify
// these — the editor may have intended inline prose with a legit link.
// ───────────────────────────────────────────────────────────────────────────
function warnFakeCardsInsideAllowlist(html, report) {
  // Match any <div …class=".*fv-(faq-item|callout).*" …> … </div>
  const suspectOpenRe = /<div\b[^>]*class\s*=\s*["'][^"']*\b(?:fv-faq-item|fv-callout)\b[^"']*["'][^>]*>/gi;
  let m;
  while ((m = suspectOpenRe.exec(html)) !== null) {
    const openEnd = m.index + m[0].length;
    const closeIdx = findMatchingDivEnd(html, openEnd);
    if (closeIdx === -1) continue;
    const block = html.slice(m.index, closeIdx);
    if (PARTNER_URL_PATTERN.test(block) && !TRAVELPAYOUTS_MARKER_PATTERN.test(block)) {
      report.warnings.push({
        rule: 'warn:fake-affiliate-card-in-allowlist',
        sample: block.slice(0, 240),
        count: 1,
      });
    }
  }
  return html; // warnings only, no mutation
}

// ───────────────────────────────────────────────────────────────────────────
// Pass 5 — Warn on empty-cite testimonials and placeholder strings.
// ───────────────────────────────────────────────────────────────────────────
function warnPlaceholdersAndEmptyCites(html, report) {
  for (const re of EMPTY_CITE_PATTERNS) {
    const m = html.match(re);
    if (m) {
      report.warnings.push({
        rule: 'warn:empty-author-testimonial',
        sample: m[0].slice(0, 160),
        count: 1,
      });
    }
  }
  for (const { name, re } of PLACEHOLDER_PATTERNS) {
    const m = html.match(re);
    if (m) {
      report.warnings.push({
        rule: `warn:placeholder-${name}`,
        sample: m[0].slice(0, 160),
        count: 1,
      });
    }
  }
  return html;
}

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

/**
 * Validate HTML content against the FlashVoyage design system.
 * Spec: docs/content-design-system.md
 *
 * @param {string} html - HTML body to validate and auto-clean.
 * @returns {{cleaned:string, warnings:Array, errors:Array}}
 *   - cleaned: HTML with auto-strippable patterns removed
 *   - warnings: [{ rule, sample, count }] — human review needed
 *   - errors: [{ rule, sample }] — hard failures (reserved, currently empty)
 */
export function validateAndCleanContent(html) {
  if (typeof html !== 'string' || html.length === 0) {
    return { cleaned: html || '', warnings: [], errors: [] };
  }

  const report = { warnings: [], errors: [] };
  let cleaned = html;

  // Order matters: strip inline styles on tables first (cheap, regex-only),
  // then scrub purple bg fragments, then walk divs to unwrap rogue blocks,
  // then warn on the fake cards that live inside allowlisted classes, then
  // warn on placeholders / empty cites.
  cleaned = stripTableInlineStyles(cleaned, report);
  cleaned = scrubPurpleNavyBackgrounds(cleaned, report);
  cleaned = unwrapRogueStyledDivs(cleaned, report);
  cleaned = warnFakeCardsInsideAllowlist(cleaned, report);
  cleaned = warnPlaceholdersAndEmptyCites(cleaned, report);

  return { cleaned, warnings: report.warnings, errors: report.errors };
}

// Re-export the regex set so downstream pipelines (review-auto-fixers, Haiku
// auto-apply) can share the source-of-truth patterns.
export const CONTENT_VALIDATOR_PATTERNS = {
  PRESERVED_CLASS_PATTERN,
  PARTNER_URL_PATTERN,
  TRAVELPAYOUTS_MARKER_PATTERN,
  DARK_BG_HEX,
  PURPLE_NAVY_BG,
  PLACEHOLDER_PATTERNS,
  EMPTY_CITE_PATTERNS,
};
