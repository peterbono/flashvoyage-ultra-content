/**
 * FINALIZER INVARIANTS
 * FV-114: Invariant checks between finalizer phases
 * 
 * These checks run after each phase to detect regressions.
 * Violations are logged but do NOT stop the pipeline.
 */

export function checkInvariants(html, phaseName) {
  const violations = [];

  // Invariant 1: HTML must have at least 1 H2
  if (!/<h2[^>]*>/.test(html)) {
    violations.push({ invariant: 'min-h2', message: 'Article has no H2 headings' });
  }

  // Invariant 2: No unclosed tags (basic check)
  const openTags = (html.match(/<(h2|h3|p|ul|ol|div|a|strong|em)\b/gi) || []).length;
  const closeTags = (html.match(/<\/(h2|h3|p|ul|ol|div|a|strong|em)>/gi) || []).length;
  if (Math.abs(openTags - closeTags) > 5) {
    violations.push({ invariant: 'balanced-tags', message: `Tag imbalance: ${openTags} open, ${closeTags} close` });
  }

  // Invariant 3: Content must have > 500 chars of text
  const textContent = html.replace(/<[^>]+>/g, '').trim();
  if (textContent.length < 500) {
    violations.push({ invariant: 'min-content', message: `Content too short: ${textContent.length} chars` });
  }

  // Invariant 4: No placeholder tokens
  const placeholders = html.match(/\{\{[^}]+\}\}|\[lien\]|\[url\]|2quelques|coûtentquelques|prixquelques/g);
  if (placeholders && placeholders.length > 0) {
    violations.push({ invariant: 'no-placeholders', message: `Found ${placeholders.length} placeholder tokens` });
  }

  // Invariant 5: At least 1 paragraph
  if (!/<p\b/i.test(html)) {
    violations.push({ invariant: 'has-paragraphs', message: 'No paragraphs found' });
  }

  return violations;
}
