/**
 * T3 — Pre-emptive refresh (LOW tier, deterministic, no LLM).
 *
 * Identical mechanical edit to R1 (2025 → 2026 in title + first H1 + first
 * paragraph) BUT gated on a "high performer" signal so we can refresh
 * articles that are about to lose CTR before they actually do.
 *
 * ───────────────────────────────────────────────────────────────────
 *  Signal source (ambiguity resolution — documented per brief):
 *  We check, in order:
 *    1. post.meta.preemptive_refresh === true   (preferred: dashboard-set)
 *    2. post.acf?.preemptive === true            (ACF-driven variant)
 *    3. Tag named "high-performer" on the post
 *
 *  If NONE of those schema paths exist (i.e. the WP install hasn't been
 *  wired up for any of them yet), T3 returns applies:false with reason
 *  "no_signal_source". Safer to no-op than over-trigger — this rule is
 *  deliberately disabled-by-default via its signal source, not via config.
 * ───────────────────────────────────────────────────────────────────
 */

import R1 from './r1-yyyy-refresh.js';

const HIGH_PERFORMER_TAG = 'high-performer';

function hasPreemptiveSignal(post) {
  // Meta flag (preferred)
  const metaFlag = post?.meta?.preemptive_refresh;
  if (metaFlag === true || metaFlag === 1 || metaFlag === '1') {
    return { ok: true, source: 'meta.preemptive_refresh' };
  }

  // ACF flag (fallback)
  const acfFlag = post?.acf?.preemptive;
  if (acfFlag === true || acfFlag === 1 || acfFlag === '1') {
    return { ok: true, source: 'acf.preemptive' };
  }

  // Tag-based (final fallback). WP normally returns tag IDs not names on
  // context=edit, so this only matches if the upstream has enriched the
  // post with tag names. Still cheap to check.
  const tags = Array.isArray(post?.tags) ? post.tags : [];
  if (tags.some(t => (typeof t === 'string' ? t : t?.name || '').toLowerCase() === HIGH_PERFORMER_TAG)) {
    return { ok: true, source: 'tag:high-performer' };
  }

  return { ok: false };
}

export default {
  id: 'T3',
  tier: 'LOW',
  description: 'Pre-emptive YYYY refresh for high-CTR articles (same swap as R1, gated on signal)',

  appliesTo(post) {
    const signal = hasPreemptiveSignal(post);
    if (!signal.ok) {
      return { applies: false, reason: 'no_signal_source' };
    }
    const r1Eval = R1.appliesTo(post);
    if (!r1Eval.applies) {
      return { applies: false, reason: r1Eval.reason };
    }
    return { applies: true };
  },

  apply(post, opts) {
    // Exact same mechanical edit as R1. We attribute the log entry to T3
    // via ruleId at the runner level.
    const result = R1.apply(post, opts);
    if (result.status === 'success') {
      result.diffSummary = `[T3] ${result.diffSummary}`;
    }
    return result;
  },
};
