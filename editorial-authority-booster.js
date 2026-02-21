/**
 * editorial-authority-booster.js
 *
 * Injects proof-backed editorial "moves" into evergreen articles:
 *   Move 1 — Arbitrage clair (decisive recommendations)
 *   Move 2 — Ce que les autres ne disent pas (hidden truths)
 *   Move 3 — Erreurs fréquentes (common mistakes)
 *   Move 4 — Friction économique (economic friction / hidden costs)
 *
 * No LLM call — pure logic + string manipulation.
 * Sources: extracted (semantic extractor), story (story compiler), pattern (pattern detector).
 */

// ─── Helpers ────────────────────────────────────────────────────────────

function safe(arr) {
  return Array.isArray(arr) ? arr : [];
}

function truncate(str, max = 120) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ENGLISH_WORDS = /\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|you|he|she|they|with|from|for|not|but|what|about|which|when|there|been|their|also|just|more|some|very|after|before|because|into|between|during|without|however|already|actually|really|usually|especially)\b/gi;

/**
 * Nettoie le contenu brut issu de l'extraction Reddit avant injection dans le HTML publié.
 * - Supprime les préfixes "Comment N:" (artefacts de parsing fixtures)
 * - Exclut le texte majoritairement anglais (ratio > 30%)
 * - Trim et normalise les espaces
 * @returns {string} texte nettoyé, ou '' si le contenu est exclu
 */
function sanitizeMoveContent(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.replace(/^Comment\s+\d+\s*:\s*/gi, '').trim();
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  if (cleaned.length < 5) return '';
  const words = cleaned.split(/\s+/);
  const englishHits = (cleaned.match(ENGLISH_WORDS) || []).length;
  if (words.length > 4 && englishHits / words.length > 0.30) return '';
  return cleaned;
}

/**
 * Find the best injection point in the HTML.
 * Returns the index in draftHtml where we should insert content.
 *
 * Strategy priority:
 *   1. markerComment  — if an FV marker is present, insert right before it
 *   2. anchorTag      — insert after the Nth matching tag (e.g. after first <h2>)
 *   3. fallback       — before the last <h2> or at the end
 */
function findInjectionPoint(draftHtml, { markerComment, anchorTag, anchorOccurrence = 1, beforeLast = false }) {
  // 1. Try marker
  if (markerComment) {
    const markerIdx = draftHtml.indexOf(markerComment);
    if (markerIdx >= 0) return markerIdx;
  }

  // 2. Try anchor tag
  if (anchorTag) {
    const re = new RegExp(anchorTag, 'gi');
    let match;
    let count = 0;
    let lastMatch = null;
    while ((match = re.exec(draftHtml)) !== null) {
      count++;
      lastMatch = match;
      if (!beforeLast && count === anchorOccurrence) {
        // Extract the tag name (e.g. "h2" from "<h2[^>]*>") and find its closing tag
        const tagNameMatch = match[0].match(/^<(\w+)/);
        if (tagNameMatch) {
          const closeTag = `</${tagNameMatch[1]}>`;
          const closeIdx = draftHtml.indexOf(closeTag, match.index);
          if (closeIdx >= 0) {
            return closeIdx + closeTag.length;
          }
        }
        // Fallback: after the opening tag (should rarely happen)
        return match.index + match[0].length;
      }
    }
    // If beforeLast and we found at least one
    if (beforeLast && lastMatch) {
      return lastMatch.index;
    }
  }

  // 3. Fallback: before the last <h2> or at the end
  const lastH2 = draftHtml.lastIndexOf('<h2');
  return lastH2 > 0 ? lastH2 : draftHtml.length;
}

// ─── Move Generators ────────────────────────────────────────────────────

/**
 * Move 1: Arbitrage clair
 * Source: author_lessons, consensus, costs
 * If lessons contain budget/choice signals AND costs exist → decisive phrases.
 */
function moveArbitrage(extracted, story) {
  const move = {
    type: 'arbitrage',
    added: false,
    proof_ids: [],
    reason: 'no_material',
    html: '',
  };

  const lessons = safe(story?.story?.author_lessons);
  const consensus = safe(extracted?.comments?.consensus);
  const costs = safe(extracted?.post?.evidence?.costs);

  // Need at least lessons or consensus WITH some cost data
  const budgetKeywords = /budget|co[uû]t|prix|argent|money|cheap|expensive|save|spend|afford|cher|économi/i;
  const hasLessonSignal = lessons.some(l => budgetKeywords.test(l.lesson || l.evidence_snippet || ''));
  const hasConsensusSignal = consensus.some(c => budgetKeywords.test(c.value || c.quote || ''));

  if (!hasLessonSignal && !hasConsensusSignal && costs.length === 0) {
    return move;
  }

  const phrases = [];
  const proofs = [];

  // Build from costs if available
  if (costs.length > 0) {
    const cost = costs[0];
    const costText = sanitizeMoveContent(cost.quote || cost.value || '');
    if (costText && cost.amount && cost.currency) {
      phrases.push(`Si ton budget est serré, garde en tête que ${truncate(costText, 100)}`);
      proofs.push(`post.evidence.costs[0]`);
    } else if (costText) {
      phrases.push(`Un point souvent sous-estimé : ${truncate(costText, 100)}`);
      proofs.push(`post.evidence.costs[0]`);
    }
  }

  // Build from lessons
  if (lessons.length > 0) {
    const lesson = lessons[0];
    const rawText = lesson.lesson || lesson.evidence_snippet || '';
    const text = sanitizeMoveContent(rawText);
    if (text.length > 10) {
      phrases.push(`L'auteur du témoignage résume : ${truncate(text, 100)}`);
      proofs.push(`story.author_lessons[0]`);
    }
  }

  // Build from consensus
  if (consensus.length > 0 && phrases.length < 3) {
    const c = consensus[0];
    const rawText = c.value || c.quote || '';
    const text = sanitizeMoveContent(rawText);
    if (text.length > 10) {
      phrases.push(`La communauté confirme : ${truncate(text, 100)}`);
      proofs.push(`comments.consensus[0]`);
    }
  }

  if (phrases.length === 0) {
    return move;
  }

  const proofAttr = escapeHtml(proofs[0]);
  move.html = `\n<div data-fv-proof="${proofAttr}" data-fv-move="arbitrage" class="fv-authority-move">\n<p><strong>En pratique :</strong> ${phrases.join('. ')}.</p>\n</div>\n`;
  move.added = true;
  move.proof_ids = proofs;
  move.reason = 'material_found';
  return move;
}

/**
 * Move 2: Ce que les autres ne disent pas
 * Source: warnings, contradictions, problems
 */
function moveHiddenTruth(extracted) {
  const move = {
    type: 'hidden_truth',
    added: false,
    proof_ids: [],
    reason: 'no_material',
    html: '',
  };

  const warnings = safe(extracted?.comments?.warnings);
  const contradictions = safe(extracted?.comments?.contradictions);
  const problems = safe(extracted?.post?.signals?.problems);

  if (warnings.length === 0 && contradictions.length === 0 && problems.length === 0) {
    return move;
  }

  const parts = [];
  const proofs = [];

  // Prefer contradictions (most differentiating)
  if (contradictions.length > 0) {
    const c = contradictions[0];
    const text = sanitizeMoveContent(c.counterclaim || c.quote || '');
    if (text) {
      parts.push(`${truncate(text, 120)}`);
      proofs.push(`comment.contradictions[0]`);
    }
  }

  // Then warnings
  if (warnings.length > 0 && parts.length < 2) {
    const w = warnings[0];
    const quote = sanitizeMoveContent(w.quote || w.value || '');
    if (quote.length > 10) {
      const authorTag = w.author ? `Un voyageur prévient : ` : '';
      parts.push(`${authorTag}${truncate(quote, 120)}`);
      proofs.push(`comment.warnings[0]`);
    }
  }

  if (parts.length === 0) {
    return move;
  }

  const proofAttr = escapeHtml(proofs[0]);
  move.html = `\n<div data-fv-proof="${proofAttr}" data-fv-move="hidden_truth" class="fv-authority-move">\n<p><strong>Ce que les guides classiques ne mentionnent pas :</strong> ${parts.join('. ')}.</p>\n</div>\n`;
  move.added = true;
  move.proof_ids = proofs;
  move.reason = 'material_found';
  return move;
}

/**
 * Move 3: Erreurs fréquentes
 * Source: problems, warnings, community_insights (type=warning)
 */
function moveCommonMistakes(extracted, story) {
  const move = {
    type: 'common_mistakes',
    added: false,
    proof_ids: [],
    reason: 'no_material',
    html: '',
  };

  const problems = safe(extracted?.post?.signals?.problems);
  const warnings = safe(extracted?.comments?.warnings);
  const insights = safe(story?.story?.community_insights).filter(i => i.type === 'warning');

  // Need at least 2 problem signals to justify a list
  const allSources = [
    ...problems.map(p => ({ text: sanitizeMoveContent(typeof p === 'string' ? p : (p.value || p.quote || '')), proof: 'post.signals.problems' })),
    ...warnings.map(w => ({ text: sanitizeMoveContent(w.quote || w.value || ''), proof: 'comment.warnings' })),
    ...insights.map(i => ({ text: sanitizeMoveContent(i.value || ''), proof: 'story.community_insights' })),
  ].filter(s => s.text.length > 5);

  if (allSources.length < 2) {
    return move;
  }

  // Take max 3 unique items
  const seen = new Set();
  const bullets = [];
  const proofs = [];
  for (const src of allSources) {
    const norm = src.text.toLowerCase().slice(0, 40);
    if (seen.has(norm)) continue;
    seen.add(norm);
    bullets.push(`<li>${escapeHtml(truncate(src.text, 140))}</li>`);
    proofs.push(`${src.proof}[${proofs.length}]`);
    if (bullets.length >= 3) break;
  }

  if (bullets.length < 2) {
    return move;
  }

  const proofAttr = escapeHtml(proofs[0]);
  move.html = `\n<div data-fv-proof="${proofAttr}" data-fv-move="common_mistakes" class="fv-authority-move">\n<p><strong>Erreurs fréquentes à éviter :</strong></p>\n<ul>\n${bullets.join('\n')}\n</ul>\n</div>\n`;
  move.added = true;
  move.proof_ids = proofs;
  move.reason = 'material_found';
  return move;
}

/**
 * Move 4: Friction économique
 * Source: costs (with parsed amounts), additional_facts (type=cost), problems mentioning money
 */
function moveEconomicFriction(extracted) {
  const move = {
    type: 'economic_friction',
    added: false,
    proof_ids: [],
    reason: 'no_material',
    html: '',
  };

  const costs = safe(extracted?.post?.evidence?.costs);
  const additionalCosts = safe(extracted?.comments?.additional_facts).filter(f => f.type === 'cost');
  const problems = safe(extracted?.post?.signals?.problems);

  const moneyKeywords = /money|cost|price|fee|expensive|cher|frais|budget|pay|paid|payer|tarif|surcharge/i;

  // Priority 1: exact figures from costs
  if (costs.length > 0 && costs[0].amount) {
    const c = costs[0];
    const costText = sanitizeMoveContent(c.quote || c.value || '');
    if (costText) {
      const phrase = `Les frais de ${truncate(costText, 100)} s'accumulent vite sur un long séjour`;
      const proofId = 'post.evidence.costs[0].quote';
      move.html = `\n<p data-fv-proof="${escapeHtml(proofId)}" data-fv-move="economic_friction" class="fv-authority-move"><strong>Coûts cachés :</strong> ${phrase}.</p>\n`;
      move.added = true;
      move.proof_ids = [proofId];
      move.reason = 'material_found';
      return move;
    }
  }

  // Priority 2: additional cost facts from comments
  if (additionalCosts.length > 0) {
    const ac = additionalCosts[0];
    const acText = sanitizeMoveContent(ac.quote || ac.value || '');
    if (acText) {
      const phrase = `Un voyageur signale : ${truncate(acText, 120)}`;
      const proofId = `comments.additional_facts[0]`;
      move.html = `\n<p data-fv-proof="${escapeHtml(proofId)}" data-fv-move="economic_friction" class="fv-authority-move"><strong>Coûts cachés :</strong> ${phrase}.</p>\n`;
      move.added = true;
      move.proof_ids = [proofId];
      move.reason = 'material_found';
      return move;
    }
  }

  // Priority 3: qualitative from problems mentioning money
  const moneyProblems = problems.filter(p => {
    const text = typeof p === 'string' ? p : (p.value || '');
    return moneyKeywords.test(text);
  });

  if (moneyProblems.length > 0) {
    const phrase = 'Plusieurs voyageurs signalent un budget sous-estimé et des frais cachés qui alourdissent la facture';
    const proofId = 'post.signals.problems[cost_related]';
    move.html = `\n<p data-fv-proof="${escapeHtml(proofId)}" data-fv-move="economic_friction" class="fv-authority-move"><strong>Coûts cachés :</strong> ${phrase}.</p>\n`;
    move.added = true;
    move.proof_ids = [proofId];
    move.reason = 'material_found';
    return move;
  }

  return move;
}

// ─── Injection Logic ────────────────────────────────────────────────────

function injectMove(draftHtml, moveResult, injectionConfig) {
  if (!moveResult.added || !moveResult.html) return draftHtml;

  // Verify proof exists before injection (quality gate)
  if (moveResult.proof_ids.length === 0) {
    moveResult.added = false;
    moveResult.reason = 'proof_missing';
    moveResult.html = '';
    return draftHtml;
  }

  const pos = findInjectionPoint(draftHtml, injectionConfig);
  return draftHtml.slice(0, pos) + moveResult.html + draftHtml.slice(pos);
}

// ─── Main Class ─────────────────────────────────────────────────────────

class EditorialAuthorityBooster {

  /**
   * @param {string} draftHtml      — the generated article HTML
   * @param {object} extracted      — from reddit-semantic-extractor
   * @param {object} story          — from reddit-story-compiler
   * @param {object} pattern        — from reddit-pattern-detector
   * @param {string} editorial_mode — 'EVERGREEN' | 'NEWS' | etc.
   * @returns {{ boostedHtml: string, authority_report: object }}
   */
  boost(draftHtml, extracted, story, pattern, editorial_mode) {
    // Skip non-evergreen content
    if (editorial_mode !== 'EVERGREEN') {
      return {
        boostedHtml: draftHtml,
        authority_report: { status: 'skip', reason: 'news_mode', moves_added: 0, moves_skipped: 4, moves: [], proofs_total: 0, violations: [] },
      };
    }

    if (!draftHtml || typeof draftHtml !== 'string') {
      return {
        boostedHtml: draftHtml || '',
        authority_report: { status: 'skip', reason: 'empty_draft', moves_added: 0, moves_skipped: 4, moves: [], proofs_total: 0, violations: [] },
      };
    }

    // Generate moves
    const move1 = moveArbitrage(extracted, story);
    const move2 = moveHiddenTruth(extracted);
    const move3 = moveCommonMistakes(extracted, story);
    const move4 = moveEconomicFriction(extracted);

    const allMoves = [move1, move2, move3, move4];

    // Quality gate: verify no move was added without proof
    const violations = [];
    for (const m of allMoves) {
      if (m.added && m.proof_ids.length === 0) {
        violations.push({
          type: 'SOURCE_OF_TRUTH_VIOLATION_FINALIZER',
          move: m.type,
          detail: 'Move injected without proof — blocked',
        });
        m.added = false;
        m.html = '';
        m.reason = 'proof_missing';
      }
    }

    // Inject moves into HTML (order: 1, 2, 3, 4 — each after the previous)
    let html = draftHtml;

    // Move 1: Arbitrage — after the first content H2 or after FV:DIFF_ANGLE
    html = injectMove(html, move1, {
      markerComment: '<!-- FV:DIFF_ANGLE -->',
      anchorTag: '<h2[^>]*>',
      anchorOccurrence: 1,
    });

    // Move 2: Hidden truth — before the last H2 or after FV:COMMON_MISTAKES
    html = injectMove(html, move2, {
      markerComment: '<!-- FV:COMMON_MISTAKES -->',
      anchorTag: '<h2',
      beforeLast: true,
    });

    // Move 3: Common mistakes — right after Move 2's location (same marker)
    html = injectMove(html, move3, {
      markerComment: '<!-- FV:COMMON_MISTAKES -->',
      anchorTag: '<h2',
      beforeLast: true,
    });

    // Move 4: Economic friction — near FV:CTA_SLOT or after second H2
    html = injectMove(html, move4, {
      markerComment: '<!-- FV:CTA_SLOT',
      anchorTag: '<h2[^>]*>',
      anchorOccurrence: 2,
    });

    // Build report
    const movesAdded = allMoves.filter(m => m.added).length;
    const movesSkipped = allMoves.filter(m => !m.added).length;
    const proofsTotal = allMoves.reduce((sum, m) => sum + m.proof_ids.length, 0);

    let status = 'pass';
    if (violations.length > 0) status = 'fail';
    else if (movesAdded === 0) status = 'pass'; // No material is fine — not a failure

    const authority_report = {
      status,
      moves_added: movesAdded,
      moves_skipped: movesSkipped,
      moves: allMoves.map(m => ({
        type: m.type,
        added: m.added,
        proof_ids: m.proof_ids,
        reason: m.reason,
      })),
      proofs_total: proofsTotal,
      violations,
    };

    console.log(`AUTHORITY_BOOST: added=${movesAdded}, proofs=${proofsTotal}, status=${status}`);

    return { boostedHtml: html, authority_report };
  }
}

export default EditorialAuthorityBooster;
