/**
 * FV-112: Finalizer Pass Registry
 * 
 * Metadata for all 57 passes in article-finalizer.js finalizeArticle().
 * Generated from audit on 2026-03-14.
 * 
 * Groups:
 *   A = HTML Structure & Cleanup
 *   B = Content Deduplication
 *   C = Section Removal
 *   D = Text Normalization & Translation
 *   E = Links & Navigation
 *   F = Heading Coherence
 *   G = Widgets & Affiliate
 *   H = Images
 *   I = QA & Validation
 *   J = News-specific
 *   K = Enrichment
 * 
 * Risk: low | medium | high
 */

export const PASS_REGISTRY = [
  // === MAIN PIPELINE (finalizeArticle) ===
  { name: 'stripNonAsiaSentences', group: 'C', order: 1, risk: 'high', lineDef: 93, lineCall: 237, conflicts: ['removeParasiticSections', 'fillEmptySections'], description: 'Remove sentences mentioning non-Asia locations via keyword matching' },
  { name: 'detectRegionalScopeDrift', group: 'I', order: 2, risk: 'low', lineDef: 177, lineCall: 242, conflicts: [], description: 'Detect geographic scope drift (diagnostic only, no mutation)' },
  { name: 'faqProtectionExtract', group: 'A', order: 3, risk: 'low', lineDef: null, lineCall: 257, conflicts: ['normalizeSpacing', 'removeEmptySections'], description: 'Extract FAQ Gutenberg blocks into placeholders before processing' },
  { name: 'replaceWidgetPlaceholders', group: 'G', order: 4, risk: 'medium', lineDef: 1406, lineCall: 276, conflicts: ['removeParasiticSections', 'removeEmptySections'], description: 'Replace widget placeholders with rendered affiliate widgets' },
  { name: 'ensureQuoteHighlight', group: 'K', order: 5, risk: 'low', lineDef: 1955, lineCall: 283, conflicts: ['runQAReport'], description: 'Ensure a pull-quote/highlight block exists (wasted — QA-1 strips all blockquotes)' },
  { name: 'ensureFomoIntro', group: 'K', order: 6, risk: 'low', lineDef: 1999, lineCall: 293, conflicts: [], description: 'Ensure FOMO-style intro paragraph exists' },
  { name: 'ensureCTA', group: 'G', order: 7, risk: 'low', lineDef: 7660, lineCall: 302, conflicts: [], description: 'Ensure a call-to-action block exists' },
  { name: 'replaceDeadLinks', group: 'E', order: 8, risk: 'low', lineDef: 3693, lineCall: 309, conflicts: [], description: 'Replace dead href="#" links with contextual ones' },
  { name: 'fixMalformedLinks', group: 'E', order: 9, risk: 'low', lineDef: 3736, lineCall: 314, conflicts: [], description: 'Fix malformed links (HTML in href, unclosed tags)' },
  { name: 'removeDuplicateH2Sections', group: 'B', order: 10, risk: 'low', lineDef: 5300, lineCall: 319, conflicts: ['ensureSerpSections'], description: 'Remove duplicate H2 sections (esp. "Limites et biais")' },
  { name: 'removeDuplicateBlockquotes', group: 'B', order: 11, risk: 'low', lineDef: 4094, lineCall: 324, conflicts: [], description: 'Remove duplicate blockquote blocks' },
  { name: 'removeParasiticText', group: 'C', order: 12, risk: 'medium', lineDef: 4176, lineCall: 329, conflicts: [], description: 'Remove parasitic SEO reinforcement text' },
  { name: 'replaceQuestionsOuvertes', group: 'D', order: 13, risk: 'low', lineDef: null, lineCall: 334, conflicts: [], description: 'Replace "Questions ouvertes" headings with "Nos recommandations"' },
  { name: 'ensureIntroBeforeFirstH2', group: 'A', order: 14, risk: 'low', lineDef: 4445, lineCall: 340, conflicts: [], description: 'Ensure intro paragraph exists before first H2' },
  { name: 'removeEmojisFromH2', group: 'F', order: 15, risk: 'low', lineDef: 4478, lineCall: 343, conflicts: [], description: 'Remove emojis from H2 headings' },
  { name: 'fixH2GeoCoherence', group: 'F', order: 16, risk: 'low', lineDef: 4244, lineCall: 348, conflicts: [], description: 'Fix geographic coherence between H2 titles and article title' },
  { name: 'translateCityNamesToFrench', group: 'D', order: 17, risk: 'low', lineDef: 4386, lineCall: 351, conflicts: [], description: 'Translate English city/country names to French' },
  { name: 'replaceDestinationPlaceholdersH2', group: 'F', order: 18, risk: 'low', lineDef: null, lineCall: 354, conflicts: [], description: 'Replace "la destination" placeholders in H2 with actual destination name' },
  { name: 'removeEmptySections', group: 'C', order: 19, risk: 'low', lineDef: 4515, lineCall: 371, conflicts: ['faqProtectionExtract'], description: 'Remove empty sections (emoji-only labels, no content)' },
  { name: 'removeForbiddenH2Section', group: 'C', order: 20, risk: 'low', lineDef: 4727, lineCall: 376, conflicts: [], description: 'Remove forbidden "Ce que dit le témoignage" section' },
  { name: 'removeParasiticSections', group: 'C', order: 21, risk: 'high', lineDef: 4754, lineCall: 380, conflicts: ['stripNonAsiaSentences', 'fillEmptySections', 'addPremiumWrappers'], description: 'Remove parasitic sections (Contexte, Événement central, Moment critique, Résolution)' },
  { name: 'removeOldStructureResidues', group: 'C', order: 22, risk: 'medium', lineDef: 4807, lineCall: 385, conflicts: [], description: 'Remove old structure residues (Ce que la communauté apporte, Conseils pratiques)' },
  { name: 'removeGenericVerdictPhrase', group: 'C', order: 23, risk: 'low', lineDef: 5028, lineCall: 390, conflicts: [], description: 'Remove generic verdict phrases in "Ce qu\'il faut retenir"' },
  { name: 'deduplicateBlockquotes', group: 'B', order: 24, risk: 'low', lineDef: 5059, lineCall: 393, conflicts: ['runQAReport'], description: 'Deduplicate blockquotes (wasted — QA-1 strips all blockquotes)' },
  { name: 'removePlaceholdersAndEmptyCitations', group: 'A', order: 25, risk: 'low', lineDef: 5139, lineCall: 396, conflicts: [], description: 'Remove placeholder text and empty citations' },
  { name: 'normalizeSpacing', group: 'A', order: 26, risk: 'medium', lineDef: 5474, lineCall: 409, conflicts: ['faqProtectionExtract'], description: 'Normalize whitespace and line breaks' },
  { name: 'removeRepetitions', group: 'B', order: 27, risk: 'medium', lineDef: 6080, lineCall: 415, conflicts: [], description: 'Remove repeated sentences/phrases' },
  { name: 'removeDuplicateParagraphs', group: 'B', order: 28, risk: 'high', lineDef: 2100, lineCall: 420, conflicts: ['removeRepetitivePhrases'], description: 'Remove duplicate paragraphs (Jaccard similarity > 0.75)' },
  { name: 'detectSectionDuplications', group: 'B', order: 29, risk: 'medium', lineDef: 2211, lineCall: 425, conflicts: [], description: 'Detect and remove duplications in "Ce que la communauté apporte"' },
  { name: 'removeRepetitivePhrases', group: 'B', order: 30, risk: 'high', lineDef: 6530, lineCall: 430, conflicts: ['removeDuplicateParagraphs'], description: 'Remove repetitive phrases (70% threshold, aligned with quality-analyzer)' },
  { name: 'fixH2InsideP', group: 'A', order: 31, risk: 'low', lineDef: 3982, lineCall: 435, conflicts: [], description: 'Extract H2 tags nested inside P tags' },
  { name: 'mergeShortParagraphs', group: 'A', order: 32, risk: 'low', lineDef: 11374, lineCall: 438, conflicts: [], description: 'Merge consecutive micro-paragraphs (< 80 chars)' },
  { name: 'balanceParagraphs', group: 'A', order: 33, risk: 'medium', lineDef: 11401, lineCall: 441, conflicts: ['fixH2InsideP'], description: 'Balance paragraph lengths (split long, merge short)' },
  { name: 'fixH2InsideP_2', group: 'A', order: 34, risk: 'low', lineDef: 3982, lineCall: 444, conflicts: [], description: 'Safety net: re-extract H2 inside P after balanceParagraphs' },
  { name: 'makeTablesResponsive', group: 'A', order: 35, risk: 'low', lineDef: 11284, lineCall: 450, conflicts: [], description: 'Wrap tables in responsive div containers' },
  { name: 'validateH2Titles', group: 'F', order: 36, risk: 'low', lineDef: 11231, lineCall: 453, conflicts: [], description: 'Validate H2 titles (no placeholders, grammar, length)' },
  { name: 'emptyParagraphCleanup', group: 'A', order: 37, risk: 'low', lineDef: null, lineCall: 457, conflicts: [], description: 'Remove empty paragraphs and dot-only paragraphs' },
  { name: 'affiliateModuleInjection', group: 'G', order: 38, risk: 'medium', lineDef: null, lineCall: 478, conflicts: ['removeParasiticSections', 'deduplicateBlockquotes'], description: 'Inject affiliate modules from affiliate_plan placements' },
  { name: 'insertContextualImages', group: 'H', order: 39, risk: 'low', lineDef: 7934, lineCall: 518, conflicts: [], description: 'Insert contextual inline images (Pexels > Flickr CC-BY)' },
  { name: 'convertCurrencyToEUR', group: 'D', order: 40, risk: 'low', lineDef: 11880, lineCall: 529, conflicts: [], description: 'Convert USD amounts to EUR in body content' },
  { name: 'runQAReport', group: 'I', order: 41, risk: 'medium', lineDef: 2346, lineCall: 532, conflicts: ['ensureQuoteHighlight', 'deduplicateBlockquotes'], description: 'Run deterministic QA report (orchestrator for 32 sub-passes)' },
  { name: 'deduplicateBlockquotes_3', group: 'B', order: 42, risk: 'low', lineDef: 5059, lineCall: 536, conflicts: [], description: 'Re-deduplicate blockquotes after QA report' },
  { name: 'replaceAffiliatePlaceholders', group: 'G', order: 43, risk: 'low', lineDef: 10015, lineCall: 539, conflicts: [], description: 'Replace affiliate link placeholders with actual URLs' },
  { name: 'injectPartnerBrandLinks', group: 'G', order: 44, risk: 'low', lineDef: 10166, lineCall: 542, conflicts: [], description: 'Inject affiliate links on partner brand mentions (rule-based)' },
  { name: 'blockquoteTranslationBulk', group: 'D', order: 45, risk: 'medium', lineDef: null, lineCall: 584, conflicts: [], description: 'Translate English blockquotes to French via LLM (bulk)' },
  { name: 'removeTrailingOrphans', group: 'A', order: 46, risk: 'low', lineDef: 1140, lineCall: 675, conflicts: [], description: 'Remove orphan blocks at end of article' },
  { name: 'eventTitleCleanup', group: 'F', order: 47, risk: 'low', lineDef: null, lineCall: 679, conflicts: [], description: 'Force-clean "Événement central" H2 titles with extraneous content' },
  { name: 'strongTagTranslation', group: 'D', order: 48, risk: 'low', lineDef: null, lineCall: 693, conflicts: [], description: 'Translate English <strong> content via LLM' },
  { name: 'finalAbsoluteCleanup', group: 'A', order: 49, risk: 'low', lineDef: null, lineCall: 707, conflicts: [], description: 'Final cleanup: empty paragraphs + removeDuplicateH2Sections' },
  { name: 'addTrailingPeriods', group: 'D', order: 50, risk: 'low', lineDef: null, lineCall: 744, conflicts: [], description: 'Add missing period at end of paragraphs' },
  { name: 'normalizeGeoCompoundNames', group: 'D', order: 51, risk: 'low', lineDef: null, lineCall: 778, conflicts: [], description: 'Capitalize compound geo names (sud-est → Sud-Est)' },
  { name: 'accentTypoCorrections', group: 'D', order: 52, risk: 'low', lineDef: null, lineCall: 788, conflicts: [], description: 'Fix common LLM accent errors + vous→tu normalization' },
  { name: 'faqRestoration', group: 'A', order: 53, risk: 'medium', lineDef: null, lineCall: 814, conflicts: ['normalizeSpacing', 'removeEmptySections', 'removeParasiticSections'], description: 'Restore FAQ Gutenberg blocks from placeholders' },
  { name: 'orphanTagRepair', group: 'A', order: 54, risk: 'low', lineDef: null, lineCall: 832, conflicts: [], description: 'Repair orphan HTML tags (div, a) left by section removals' },
  { name: 'applyNewsRenderingProfile', group: 'J', order: 55, risk: 'medium', lineDef: 9469, lineCall: 860, conflicts: [], description: 'News-specific rendering (1 CTA max, FAQ trim, heading rewrite). Only runs in news mode.' },
  { name: 'fixWordGlue', group: 'D', order: 56, risk: 'low', lineDef: 8535, lineCall: 865, conflicts: [], description: 'Fix word-glue (stuck words) after all translations' },
  { name: 'liveDataEnrichment', group: 'K', order: 57, risk: 'low', lineDef: null, lineCall: 869, conflicts: [], description: 'Inject live data (prices, safety, currency) via liveDataEnricher' },
];

/**
 * Sub-passes inside runQAReport() — pass #41.
 * These execute in order within the QA orchestrator.
 */
export const QA_SUB_PASSES = [
  { name: 'qa_blockquoteStripping', group: 'C', qaOrder: 1, risk: 'high', lineCall: 2351, conflicts: ['ensureQuoteHighlight'], description: 'Strip ALL existing blockquotes before re-insertion from evidence' },
  { name: 'qa_citationReCreation', group: 'K', qaOrder: 2, risk: 'medium', lineCall: 2367, conflicts: [], description: 'Re-create citations from story evidence snippets' },
  { name: 'qa_blockquoteTranslation', group: 'D', qaOrder: 3, risk: 'medium', lineCall: 2494, conflicts: [], description: 'Translate remaining English blockquotes via LLM' },
  { name: 'qa_validateInternalLinks', group: 'E', qaOrder: 4, risk: 'low', lineCall: 2571, conflicts: [], description: 'Validate internal link coherence (diagnostic)' },
  { name: 'qa_runQualityGateContent', group: 'I', qaOrder: 5, risk: 'low', lineCall: 2593, conflicts: [], description: 'Extended quality gate (immersive opening, H2 blacklist, quotes, hook)' },
  { name: 'qa_structureCheck', group: 'I', qaOrder: 6, risk: 'low', lineCall: 2641, conflicts: [], description: 'Check FlashVoyage Premium structure (intro, H2 count, related)' },
  { name: 'qa_redditCitationCheck', group: 'I', qaOrder: 7, risk: 'low', lineCall: 2666, conflicts: [], description: 'Verify Reddit citations exist when evidence available' },
  { name: 'qa_affiliateConformance', group: 'I', qaOrder: 8, risk: 'low', lineCall: 2834, conflicts: [], description: 'Check affiliate module count vs plan' },
  { name: 'qa_antiRepetition', group: 'B', qaOrder: 9, risk: 'low', lineCall: 2914, conflicts: [], description: 'Deduplicate H2 titles, "Articles connexes", affiliate modules' },
  { name: 'qa_blockPlacement', group: 'A', qaOrder: 10, risk: 'low', lineCall: 2980, conflicts: [], description: 'Move "Articles connexes" to end if misplaced' },
  { name: 'checkInventionGuard', group: 'I', qaOrder: 11, risk: 'medium', lineCall: 3016, lineDef: 3113, conflicts: [], description: 'Anti-invention guard (unsourced factual claims)' },
  { name: 'checkAndFixStoryAlignment', group: 'I', qaOrder: 12, risk: 'medium', lineCall: 3019, lineDef: 6780, conflicts: [], description: 'Story alignment check + auto-fix' },
  { name: 'addPremiumWrappers', group: 'K', qaOrder: 13, risk: 'medium', lineCall: 3022, lineDef: 6888, conflicts: ['removeParasiticSections'], description: 'Add premium wrappers (takeaways, community, open-questions)' },
  { name: 'checkAntiHallucination', group: 'I', qaOrder: 14, risk: 'low', lineCall: 3033, lineDef: 7224, conflicts: [], description: 'Anti-hallucination guard (non-blocking by default)' },
  { name: 'detectAndFixIncompleteSentences', group: 'D', qaOrder: 15, risk: 'medium', lineCall: 3037, lineDef: 8323, conflicts: [], description: 'Detect and fix incomplete sentences' },
  { name: 'qa_fixWordGlue', group: 'D', qaOrder: 16, risk: 'low', lineCall: 3040, lineDef: 8535, conflicts: [], description: 'Fix word-glue (stuck words) inside QA' },
  { name: 'removeGenericPhrases', group: 'C', qaOrder: 17, risk: 'medium', lineCall: 3043, lineDef: 8393, conflicts: [], description: 'Remove generic/flat phrases' },
  { name: 'capitalizeProperNouns', group: 'D', qaOrder: 18, risk: 'low', lineCall: 3046, lineDef: 8482, conflicts: [], description: 'Capitalize geographic proper nouns' },
  { name: 'detectAndTranslateEnglish', group: 'D', qaOrder: 19, risk: 'medium', lineCall: 3049, lineDef: 9150, conflicts: [], description: 'Detect and translate remaining English text via LLM' },
  { name: 'reconcileWidgetDestinations', group: 'G', qaOrder: 20, risk: 'low', lineCall: 3052, lineDef: 9559, conflicts: [], description: 'Reconcile widget destinations with final destination (auto-fix)' },
  { name: 'validateWidgetDestinations', group: 'I', qaOrder: 21, risk: 'low', lineCall: 3055, lineDef: 9602, conflicts: [], description: 'Validate widget/destination coherence (diagnostic)' },
  { name: 'validateAndFixCitations', group: 'I', qaOrder: 22, risk: 'medium', lineCall: 3058, lineDef: 9680, conflicts: [], description: 'Validate and fix citations' },
  { name: 'validateRecommendationLinks', group: 'E', qaOrder: 23, risk: 'low', lineCall: 3061, lineDef: 9846, conflicts: [], description: 'Validate recommendation links (diagnostic)' },
  { name: 'forceTranslateRecommendationsSection', group: 'D', qaOrder: 24, risk: 'medium', lineCall: 3064, lineDef: 9939, conflicts: [], description: 'Force-translate recommendations section via LLM' },
  { name: 'forceTranslateCitationsInLists', group: 'D', qaOrder: 25, risk: 'medium', lineCall: 3067, lineDef: 10477, conflicts: [], description: 'Force-translate citations in lists via LLM' },
  { name: 'splitLongListItems', group: 'A', qaOrder: 26, risk: 'low', lineCall: 3070, lineDef: 10601, conflicts: [], description: 'Split overly long list items' },
  { name: 'validateTemporalConsistency', group: 'I', qaOrder: 27, risk: 'low', lineCall: 3073, lineDef: 10675, conflicts: [], description: 'Validate temporal consistency (diagnostic)' },
  { name: 'validateAndExtendNarrativeSection', group: 'I', qaOrder: 28, risk: 'low', lineCall: 3076, lineDef: 10383, conflicts: [], description: 'Validate narrative section "Une histoire vraie" (diagnostic)' },
  { name: 'ensureSerpSections', group: 'K', qaOrder: 29, risk: 'medium', lineCall: 3081, lineDef: 10765, conflicts: ['removeDuplicateH2Sections'], description: 'Ensure SERP-required sections exist (may add "Limites et biais")' },
  { name: 'qa_removeDuplicateH2Sections', group: 'B', qaOrder: 30, risk: 'low', lineCall: 3084, lineDef: 5300, conflicts: [], description: 'Clean duplicate H2 after SERP section insertion' },
  { name: 'fillEmptySections', group: 'K', qaOrder: 31, risk: 'medium', lineCall: 3095, lineDef: 11116, conflicts: ['removeParasiticSections', 'stripNonAsiaSentences'], description: 'Fill empty sections with generated content (incl. "Contexte")' },
  { name: 'applyBlockingGate', group: 'I', qaOrder: 32, risk: 'low', lineCall: 3101, lineDef: 7137, conflicts: [], description: 'Apply blocking quality gate (throws if strict mode)' },
];

/**
 * Group definitions for categorization.
 */
export const PASS_GROUPS = {
  A: { name: 'HTML Structure & Cleanup', color: '#4CAF50' },
  B: { name: 'Content Deduplication', color: '#FF9800' },
  C: { name: 'Section Removal', color: '#F44336' },
  D: { name: 'Text Normalization & Translation', color: '#2196F3' },
  E: { name: 'Links & Navigation', color: '#9C27B0' },
  F: { name: 'Heading Coherence', color: '#00BCD4' },
  G: { name: 'Widgets & Affiliate', color: '#FF5722' },
  H: { name: 'Images', color: '#8BC34A' },
  I: { name: 'QA & Validation', color: '#607D8B' },
  J: { name: 'News-specific', color: '#795548' },
  K: { name: 'Enrichment', color: '#673AB7' },
};

/**
 * Known conflicts between passes.
 */
export const KNOWN_CONFLICTS = [
  {
    id: 'CONFLICT-1',
    severity: 'high',
    passes: ['stripNonAsiaSentences'],
    description: 'False positives on keyword matching: "arome" matches "Rome", compound words containing country names',
  },
  {
    id: 'CONFLICT-2',
    severity: 'high',
    passes: ['removeParasiticSections', 'fillEmptySections', 'addPremiumWrappers'],
    description: 'removeParasiticSections deletes "Contexte" sections that fillEmptySections/addPremiumWrappers later try to create',
  },
  {
    id: 'CONFLICT-3',
    severity: 'medium',
    passes: ['deduplicateBlockquotes', 'qa_blockquoteStripping'],
    description: 'deduplicateBlockquotes called 3 times; QA-1 strips ALL blockquotes making pre-QA dedup wasted',
  },
  {
    id: 'CONFLICT-4',
    severity: 'medium',
    passes: ['removeRepetitivePhrases'],
    description: '70% similarity threshold removes intentional emphasis phrases and safety warnings',
  },
  {
    id: 'CONFLICT-5',
    severity: 'medium',
    passes: ['removeDuplicateParagraphs'],
    description: 'Jaccard > 0.75 threshold removes intentional elaboration across sections',
  },
  {
    id: 'CONFLICT-6',
    severity: 'high',
    passes: ['faqProtectionExtract', 'normalizeSpacing', 'removeEmptySections', 'faqRestoration'],
    description: 'FAQ placeholder can be stripped by normalizeSpacing or removeEmptySections before restoration',
  },
  {
    id: 'CONFLICT-7',
    severity: 'high',
    passes: ['replaceWidgetPlaceholders', 'ensureQuoteHighlight', 'ensureFomoIntro', 'ensureCTA', 'affiliateModuleInjection', 'insertContextualImages', 'removeDuplicateH2Sections', 'removeDuplicateBlockquotes', 'removeParasiticSections', 'removeRepetitions', 'removeDuplicateParagraphs'],
    description: 'Content addition passes interspersed with removal passes — additions may be partially removed, removals may miss newly-added content',
  },
  {
    id: 'CONFLICT-8',
    severity: 'low',
    passes: ['removeDuplicateH2Sections'],
    description: 'Called 3 times (passes #10, #49, QA-30) — defensive but wasteful',
  },
  {
    id: 'CONFLICT-9',
    severity: 'medium',
    passes: ['ensureQuoteHighlight', 'qa_blockquoteStripping'],
    description: 'QA-1 strips ALL blockquotes, destroying the quote highlight added by ensureQuoteHighlight',
  },
  {
    id: 'CONFLICT-10',
    severity: 'low',
    passes: ['fixWordGlue', 'qa_fixWordGlue'],
    description: 'fixWordGlue called 3 times — intentional after each translation phase, minor performance overhead',
  },
];
