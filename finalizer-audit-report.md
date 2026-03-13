# FV-112: Article Finalizer Audit Report

> **File:** `article-finalizer.js` (11,992 lines)
> **Entry point:** `finalizeArticle()` at line 209
> **Total passes identified:** 57
> **Date:** 2026-03-14

---

## Section 1: Pass Inventory

All 57 passes are listed in their exact execution order within `finalizeArticle()`. Passes invoked inside `runQAReport()` are marked with `[QA]`.

| # | Pass Name | Line (def) | Line (call) | Category | Description |
|---|-----------|-----------|-------------|----------|-------------|
| 1 | `stripNonAsiaSentences` | 93 | 237 | C | Remove sentences mentioning non-Asia locations (keyword matching) |
| 2 | `detectRegionalScopeDrift` | 177 | 242 | I | Detect geographic scope drift (diagnostic only) |
| 3 | **FAQ Protection (extract)** | 257 | 257 | A | Extract FAQ Gutenberg blocks into placeholders before processing |
| 4 | `replaceWidgetPlaceholders` | 1406 | 276 | G | Replace widget placeholders with rendered affiliate widgets |
| 5 | `ensureQuoteHighlight` | 1955 | 283 | K | Ensure a pull-quote/highlight block exists |
| 6 | `ensureFomoIntro` | 1999 | 293 | K | Ensure FOMO-style intro paragraph exists |
| 7 | `ensureCTA` | 7660 | 302 | G | Ensure a call-to-action block exists |
| 8 | `replaceDeadLinks` | 3693 | 309 | E | Replace dead `href="#"` links with contextual ones |
| 9 | `fixMalformedLinks` | 3736 | 314 | E | Fix malformed links (HTML in href, unclosed tags) |
| 10 | `removeDuplicateH2Sections` | 5300 | 319 | B | Remove duplicate H2 sections (esp. "Limites et biais") |
| 11 | `removeDuplicateBlockquotes` | 4094 | 324 | B | Remove duplicate blockquote blocks |
| 12 | `removeParasiticText` | 4176 | 329 | C | Remove parasitic SEO reinforcement text |
| 13 | **Replace "Questions ouvertes"** | (inline) | 334 | D | Replace "Questions ouvertes" headings with "Nos recommandations" |
| 14 | `ensureIntroBeforeFirstH2` | 4445 | 340 | A | Ensure intro paragraph exists before first H2 |
| 15 | `removeEmojisFromH2` | 4478 | 343 | F | Remove emojis from H2 headings |
| 16 | `fixH2GeoCoherence` | 4244 | 348 | F | Fix geographic coherence between H2 titles and article title |
| 17 | `translateCityNamesToFrench` | 4386 | 351 | D | Translate English city/country names to French |
| 18 | **Replace destination placeholders in H2** | (inline) | 354 | F | Replace "la destination" placeholders in H2 with actual name |
| 19 | `removeEmptySections` | 4515 | 371 | C | Remove empty sections (emoji-only labels, no content) |
| 20 | `removeForbiddenH2Section` | 4727 | 376 | C | Remove forbidden "Ce que dit le témoignage" section |
| 21 | `removeParasiticSections` | 4754 | 380 | C | Remove parasitic sections (Contexte, Événement central, Moment critique, Résolution) |
| 22 | `removeOldStructureResidues` | 4807 | 385 | C | Remove old structure residues (Ce que la communauté apporte, Conseils pratiques) |
| 23 | `removeGenericVerdictPhrase` | 5028 | 390 | C | Remove generic verdict phrases in "Ce qu'il faut retenir" |
| 24 | `deduplicateBlockquotes` | 5059 | 393 | B | Deduplicate blockquotes (same Reddit citation inserted twice) |
| 25 | `removePlaceholdersAndEmptyCitations` | 5139 | 396 | A | Remove placeholder text and empty citations |
| 26 | `normalizeSpacing` | 5474 | 409 | A | Normalize whitespace and line breaks |
| 27 | `removeRepetitions` | 6080 | 415 | B | Remove repeated sentences/phrases |
| 28 | `removeDuplicateParagraphs` | 2100 | 420 | B | Remove duplicate paragraphs (Jaccard similarity > 0.75) |
| 29 | `detectSectionDuplications` | 2211 | 425 | B | Detect and remove duplications in "Ce que la communauté apporte" |
| 30 | `removeRepetitivePhrases` | 6530 | 430 | B | Remove repetitive phrases (70% threshold alignment with quality-analyzer) |
| 31 | `fixH2InsideP` | 3982 | 435 | A | Extract H2 tags nested inside P tags |
| 32 | `mergeShortParagraphs` | 11374 | 438 | A | Merge consecutive micro-paragraphs (< 80 chars) |
| 33 | `balanceParagraphs` | 11401 | 441 | A | Balance paragraph lengths (split long, merge short) |
| 34 | `fixH2InsideP` (2nd call) | 3982 | 444 | A | Safety net: re-extract H2 inside P after balanceParagraphs |
| 35 | `makeTablesResponsive` | 11284 | 450 | A | Wrap tables in responsive div containers |
| 36 | `validateH2Titles` | 11231 | 453 | F | Validate H2 titles (no placeholders, grammar, length) |
| 37 | **Empty paragraph cleanup** | (inline) | 457 | A | Remove empty paragraphs and dot-only paragraphs |
| 38 | **Affiliate module injection** | (inline) | 478 | G | Inject affiliate modules from affiliate_plan placements |
| 39 | `insertContextualImages` | 7934 | 518 | H | Insert contextual inline images (Pexels > Flickr CC-BY) |
| 40 | `convertCurrencyToEUR` | 11880 | 529 | D | Convert USD amounts to EUR |
| 41 | `runQAReport` | 2346 | 532 | I | Run deterministic QA report (contains sub-passes below) |
| 42 | `deduplicateBlockquotes` (3rd call) | 5059 | 536 | B | Re-deduplicate blockquotes after QA report |
| 43 | `replaceAffiliatePlaceholders` | 10015 | 539 | G | Replace affiliate link placeholders |
| 44 | `injectPartnerBrandLinks` | 10166 | 542 | G | Inject affiliate links on partner brand mentions |
| 45 | **Blockquote translation (bulk)** | (inline) | 584 | D | Translate English blockquotes to French via LLM |
| 46 | `removeTrailingOrphans` | 1140 | 675 | A | Remove orphan blocks at end of article |
| 47 | **Event title cleanup** | (inline) | 679 | F | Force-clean "Événement central" H2 titles |
| 48 | **Strong tag translation** | (inline) | 693 | D | Translate English `<strong>` content via LLM |
| 49 | **Final absolute cleanup** | (inline) | 707 | A | Final cleanup of empty paragraphs + removeDuplicateH2Sections |
| 50 | **Add trailing periods** | (inline) | 744 | D | Add missing period at end of paragraphs |
| 51 | **Normalize geo compound names** | (inline) | 778 | D | Capitalize compound geo names (sud-est → Sud-Est) |
| 52 | **Accent/typo corrections** | (inline) | 788 | D | Fix common LLM accent errors + vous→tu normalization |
| 53 | **FAQ Restoration** | (inline) | 814 | A | Restore FAQ Gutenberg blocks from placeholders |
| 54 | **Orphan tag repair** | (inline) | 832 | A | Repair orphan HTML tags (div, a) left by section removals |
| 55 | `applyNewsRenderingProfile` | 9469 | 860 | J | News-specific rendering (1 CTA max, FAQ trim, heading rewrite) |
| 56 | `fixWordGlue` | 8535 | 865 | D | Fix word-glue (stuck words) after translations |
| 57 | `liveDataEnricher.enrichArticle` | (external) | 869 | K | Inject live data (prices, safety, currency) |
| 57b | `fixWordGlue` (2nd call) | 8535 | 880 | D | Final word-glue fix after live data enrichment |
| 57c | `applyDeterministicFinalTextCleanup` | 8708 | 881 | D | Deterministic final text cleanup |
| 57d | `convertTitleUSDToEUR` | 11855 | 898 | D | Convert USD to EUR in article title |

### Sub-passes inside `runQAReport()` (pass #41)

| # | Pass Name | Line (def) | Line (call in QA) | Category | Description |
|---|-----------|-----------|-------------------|----------|-------------|
| QA-1 | **Blockquote stripping** | (inline) | 2351 | C | Strip ALL existing blockquotes before re-insertion |
| QA-2 | **Citation re-creation** | (inline) | 2367 | K | Re-create citations from story evidence snippets |
| QA-3 | **Blockquote translation** | (inline) | 2494 | D | Translate remaining English blockquotes |
| QA-4 | `validateInternalLinks` | 5175 | 2571 | E | Validate internal link coherence |
| QA-5 | `runQualityGateContent` | 5203 | 2593 | I | Extended quality gate (immersive opening, H2 blacklist, quotes, hook) |
| QA-6 | **Structure check** | (inline) | 2641 | I | Check FlashVoyage Premium structure (intro, H2 count, related) |
| QA-7 | **Reddit citation check** | (inline) | 2666 | I | Verify Reddit citations exist when evidence available |
| QA-8 | **Affiliate conformance** | (inline) | 2834 | I | Check affiliate module count vs plan |
| QA-9 | **Anti-repetition (H2/related/affiliate dedup)** | (inline) | 2914 | B | Deduplicate H2 titles, "Articles connexes", affiliate modules |
| QA-10 | **Block placement** | (inline) | 2980 | A | Move "Articles connexes" to end if misplaced |
| QA-11 | `checkInventionGuard` | 3113 | 3016 | I | Anti-invention guard (unsourced factual claims) |
| QA-12 | `checkAndFixStoryAlignment` | 6780 | 3019 | I | Story alignment check + auto-fix |
| QA-13 | `addPremiumWrappers` | 6888 | 3022 | K | Add premium wrappers (takeaways, community, open-questions) |
| QA-14 | `checkAntiHallucination` | 7224 | 3033 | I | Anti-hallucination guard |
| QA-15 | `detectAndFixIncompleteSentences` | 8323 | 3037 | D | Detect and fix incomplete sentences |
| QA-16 | `fixWordGlue` | 8535 | 3040 | D | Fix word-glue (stuck words) |
| QA-17 | `removeGenericPhrases` | 8393 | 3043 | C | Remove generic/flat phrases |
| QA-18 | `capitalizeProperNouns` | 8482 | 3046 | D | Capitalize geographic proper nouns |
| QA-19 | `detectAndTranslateEnglish` | 9150 | 3049 | D | Detect and translate remaining English text |
| QA-20 | `reconcileWidgetDestinations` | 9559 | 3052 | G | Reconcile widget destinations with final destination |
| QA-21 | `validateWidgetDestinations` | 9602 | 3055 | I | Validate widget/destination coherence |
| QA-22 | `validateAndFixCitations` | 9680 | 3058 | I | Validate and fix citations |
| QA-23 | `validateRecommendationLinks` | 9846 | 3061 | E | Validate recommendation links |
| QA-24 | `forceTranslateRecommendationsSection` | 9939 | 3064 | D | Force-translate recommendations section |
| QA-25 | `forceTranslateCitationsInLists` | 10477 | 3067 | D | Force-translate citations in lists |
| QA-26 | `splitLongListItems` | 10601 | 3070 | A | Split overly long list items |
| QA-27 | `validateTemporalConsistency` | 10675 | 3073 | I | Validate temporal consistency |
| QA-28 | `validateAndExtendNarrativeSection` | 10383 | 3076 | I | Validate narrative section "Une histoire vraie" |
| QA-29 | `ensureSerpSections` | 10765 | 3081 | K | Ensure SERP-required sections exist |
| QA-30 | `removeDuplicateH2Sections` | 5300 | 3084 | B | Clean duplicate H2 after SERP section insertion |
| QA-31 | `fillEmptySections` | 11116 | 3095 | K | Fill empty sections with generated content |
| QA-32 | `applyBlockingGate` | 7137 | 3101 | I | Apply blocking quality gate |

---

## Section 2: Conflict Matrix

### Conflict 1: `stripNonAsiaSentences` false positives

**Passes:** #1 (`stripNonAsiaSentences`, line 93)
**Severity:** HIGH
**Description:** Keyword-based matching uses a list of non-Asia terms. Words like "arome" (French for aroma) match "Rome", "portugal" can appear in compound words. The `finalDestination` exclusion helps but does not cover all edge cases.
**Evidence:** The method uses regex `\b` word boundaries, but French compound words and place names embedded in other words can cause false positives.
**Impact:** Legitimate content sentences are stripped, reducing article quality and potentially removing key travel information.

### Conflict 2: `removeParasiticSections` vs LLM-generated "Contexte" content

**Passes:** #21 (`removeParasiticSections`, line 4754) vs QA-31 (`fillEmptySections`, line 11116)
**Severity:** HIGH
**Description:** `removeParasiticSections` removes sections titled "Contexte", "Événement central", "Moment critique", "Résolution" — treating them as parasitic Option B residues. However, `fillEmptySections` (called later inside `runQAReport`) can generate "Contexte" content for SERP purposes. The removal pass runs BEFORE QA, so it cannot destroy QA-generated content, but if the LLM itself generates a "Contexte" section, it is removed.
**Impact:** Useful contextual content generated by the LLM is deleted as parasitic.

### Conflict 3: `deduplicateBlockquotes` called 3 times — over-removal risk

**Passes:** #24 (`deduplicateBlockquotes`, line 393), #42 (line 536), plus QA-1 strips ALL blockquotes at line 2351
**Severity:** MEDIUM
**Description:** `deduplicateBlockquotes` is called at pass #24 (pre-QA), then QA-1 strips ALL blockquotes and re-creates them from evidence, then pass #42 deduplicates again post-QA. The triple-call pattern is mostly harmless because QA-1 does a full reset, but the pre-QA call at #24 is wasted work since QA-1 will strip everything anyway.
**Impact:** Wasted computation; minor risk of over-removal if QA re-inserts similar-but-not-identical citations that dedup catches.

### Conflict 4: `removeRepetitivePhrases` (70% threshold) vs intentional emphasis

**Passes:** #30 (`removeRepetitivePhrases`, line 6530)
**Severity:** MEDIUM
**Description:** Uses a 70% similarity threshold to detect and remove "repetitive" phrases. Travel articles legitimately repeat key phrases for emphasis (e.g., safety warnings, price ranges). The threshold was aligned with `quality-analyzer.js` but does not distinguish intentional rhetorical repetition from actual duplication.
**Impact:** Key emphasis phrases or safety warnings may be stripped, weakening the editorial message.

### Conflict 5: `removeDuplicateParagraphs` (Jaccard >0.75) vs intentional elaboration

**Passes:** #28 (`removeDuplicateParagraphs`, line 2100)
**Severity:** MEDIUM
**Description:** Paragraphs with Jaccard word-set similarity > 0.75 are treated as duplicates. When an article deliberately elaborates on a point in different sections (e.g., intro summary vs detailed section), the elaboration paragraph may be removed.
**Impact:** Loss of detailed elaboration content; article feels thinner in sections where the same topic is expanded.

### Conflict 6: FAQ protection (early) vs parasitic section removal (middle) — FAQ can be lost

**Passes:** #3 (FAQ extract, line 257) → #21 (`removeParasiticSections`, line 380) → #53 (FAQ restore, line 814)
**Severity:** HIGH
**Description:** FAQ blocks are extracted into placeholders at pass #3. However, if any pass between #3 and #53 accidentally removes or corrupts the placeholder string `__FAQ_PROTECTED_N__`, the FAQ cannot be restored. The code at line 820 has a fallback (re-insert before last H2), but this changes the position. Also, `normalizeSpacing` (pass #26) or `removeEmptySections` (pass #19) could theoretically strip a line containing only the placeholder.
**Impact:** FAQ section may be repositioned or lost entirely, breaking Gutenberg FAQ schema markup.

### Conflict 7: Content removal passes interspersed with content addition passes

**Passes:** Removal (#10-#30) interspersed with Addition (#4-#7, #38-#39, QA-2, QA-13, QA-29, QA-31)
**Severity:** HIGH
**Description:** The execution order mixes removal and addition:
- Passes #4-#7 ADD widgets, quotes, FOMO, CTA
- Passes #10-#30 REMOVE duplicates, parasitic content, repetitions
- Pass #38 ADDS affiliate modules
- Pass #39 ADDS images
- QA sub-passes ADD citations (QA-2), premium wrappers (QA-13), SERP sections (QA-29), filled sections (QA-31)
- Post-QA passes #42-#49 REMOVE duplicates again

This interleaving means removal passes may delete content just added by earlier passes, and addition passes may re-introduce content that was just cleaned.
**Impact:** Unpredictable final content; duplicate content may survive; intentional additions may be partially removed.

### Conflict 8: `removeDuplicateH2Sections` called 3 times

**Passes:** #10 (line 319), #49 (line 730), QA-30 (line 3084)
**Severity:** LOW
**Description:** Triple call is defensive but wasteful. The third call (QA-30) exists because `ensureSerpSections` may introduce duplicate "Limites et biais" sections.
**Impact:** Minor performance overhead; no functional conflict.

### Conflict 9: QA-1 strips ALL blockquotes then re-creates them

**Passes:** QA-1 (line 2351) destroys work of #5 (`ensureQuoteHighlight`, line 283)
**Severity:** MEDIUM
**Description:** Pass #5 ensures a quote highlight exists. Then at pass #41, `runQAReport` strips ALL blockquotes (QA-1) and re-creates them from story evidence. The quote highlight added by #5 is destroyed.
**Impact:** Quote highlight styling from `ensureQuoteHighlight` is always lost; the method does wasted work.

### Conflict 10: `fixWordGlue` called 3 times

**Passes:** QA-16 (line 3040), #56 (line 865), #57b (line 880)
**Severity:** LOW
**Description:** Each translation pass can re-introduce word-glue issues. The triple call is intentional: once in QA after translations, once after news profile, once after live data enrichment.
**Impact:** Minor performance overhead; necessary for correctness.

---

## Section 3: Category Grouping

### GROUP A: HTML Structure & Cleanup (13 passes)
| # | Pass | Risk |
|---|------|------|
| 3 | FAQ Protection (extract) | low |
| 14 | `ensureIntroBeforeFirstH2` | low |
| 25 | `removePlaceholdersAndEmptyCitations` | low |
| 26 | `normalizeSpacing` | medium — can strip FAQ placeholder |
| 31 | `fixH2InsideP` | low |
| 32 | `mergeShortParagraphs` | low |
| 33 | `balanceParagraphs` | medium — can break structure |
| 34 | `fixH2InsideP` (2nd) | low |
| 35 | `makeTablesResponsive` | low |
| 37 | Empty paragraph cleanup | low |
| 46 | `removeTrailingOrphans` | low |
| 53 | FAQ Restoration | medium — fallback repositioning |
| 54 | Orphan tag repair | low |
| QA-10 | Block placement | low |
| QA-26 | `splitLongListItems` | low |

### GROUP B: Content Deduplication (9 passes)
| # | Pass | Risk |
|---|------|------|
| 10 | `removeDuplicateH2Sections` | low |
| 11 | `removeDuplicateBlockquotes` | low |
| 24 | `deduplicateBlockquotes` | low (wasted — QA resets) |
| 27 | `removeRepetitions` | medium |
| 28 | `removeDuplicateParagraphs` | high — Jaccard false positives |
| 29 | `detectSectionDuplications` | medium |
| 30 | `removeRepetitivePhrases` | high — 70% threshold too aggressive |
| 42 | `deduplicateBlockquotes` (3rd) | low |
| QA-9 | Anti-repetition (H2/related/affiliate) | low |
| QA-30 | `removeDuplicateH2Sections` (3rd) | low |

### GROUP C: Section Removal (7 passes)
| # | Pass | Risk |
|---|------|------|
| 1 | `stripNonAsiaSentences` | high — false positives |
| 12 | `removeParasiticText` | medium |
| 19 | `removeEmptySections` | low |
| 20 | `removeForbiddenH2Section` | low |
| 21 | `removeParasiticSections` | high — kills LLM "Contexte" |
| 22 | `removeOldStructureResidues` | medium |
| 23 | `removeGenericVerdictPhrase` | low |
| QA-1 | Blockquote stripping | high — destroys all quotes |
| QA-17 | `removeGenericPhrases` | medium |

### GROUP D: Text Normalization & Translation (14 passes)
| # | Pass | Risk |
|---|------|------|
| 13 | Replace "Questions ouvertes" | low |
| 17 | `translateCityNamesToFrench` | low |
| 40 | `convertCurrencyToEUR` | low |
| 45 | Blockquote translation (bulk) | medium — LLM quality varies |
| 48 | Strong tag translation | low |
| 50 | Add trailing periods | low |
| 51 | Normalize geo compound names | low |
| 52 | Accent/typo corrections | low |
| 56 | `fixWordGlue` | low |
| 57b | `fixWordGlue` (2nd) | low |
| 57c | `applyDeterministicFinalTextCleanup` | low |
| 57d | `convertTitleUSDToEUR` | low |
| QA-3 | Blockquote translation | medium |
| QA-15 | `detectAndFixIncompleteSentences` | medium |
| QA-16 | `fixWordGlue` | low |
| QA-18 | `capitalizeProperNouns` | low |
| QA-19 | `detectAndTranslateEnglish` | medium |
| QA-24 | `forceTranslateRecommendationsSection` | medium |
| QA-25 | `forceTranslateCitationsInLists` | medium |

### GROUP E: Links & Navigation (4 passes)
| # | Pass | Risk |
|---|------|------|
| 8 | `replaceDeadLinks` | low |
| 9 | `fixMalformedLinks` | low |
| QA-4 | `validateInternalLinks` | low (read-only) |
| QA-23 | `validateRecommendationLinks` | low (read-only) |

### GROUP F: Heading Coherence (6 passes)
| # | Pass | Risk |
|---|------|------|
| 15 | `removeEmojisFromH2` | low |
| 16 | `fixH2GeoCoherence` | low |
| 18 | Replace destination placeholders in H2 | low |
| 36 | `validateH2Titles` | low |
| 47 | Event title cleanup | low |

### GROUP G: Widgets & Affiliate (6 passes)
| # | Pass | Risk |
|---|------|------|
| 4 | `replaceWidgetPlaceholders` | medium |
| 7 | `ensureCTA` | low |
| 38 | Affiliate module injection | medium |
| 43 | `replaceAffiliatePlaceholders` | low |
| 44 | `injectPartnerBrandLinks` | low |
| QA-20 | `reconcileWidgetDestinations` | low |

### GROUP H: Images (1 pass)
| # | Pass | Risk |
|---|------|------|
| 39 | `insertContextualImages` | low |

### GROUP I: QA & Validation (11 passes)
| # | Pass | Risk |
|---|------|------|
| 2 | `detectRegionalScopeDrift` | low (diagnostic) |
| 41 | `runQAReport` (orchestrator) | — |
| QA-5 | `runQualityGateContent` | low (diagnostic) |
| QA-6 | Structure check | low (diagnostic) |
| QA-7 | Reddit citation check | low (diagnostic) |
| QA-8 | Affiliate conformance | low (diagnostic) |
| QA-11 | `checkInventionGuard` | medium — removes unsourced claims |
| QA-12 | `checkAndFixStoryAlignment` | medium — auto-fix |
| QA-14 | `checkAntiHallucination` | low (non-blocking) |
| QA-21 | `validateWidgetDestinations` | low (diagnostic) |
| QA-22 | `validateAndFixCitations` | medium — fixes citations |
| QA-27 | `validateTemporalConsistency` | low (diagnostic) |
| QA-28 | `validateAndExtendNarrativeSection` | low (diagnostic) |
| QA-32 | `applyBlockingGate` | low (diagnostic) |

### GROUP J: News-specific (1 pass + sub-calls)
| # | Pass | Risk |
|---|------|------|
| 55 | `applyNewsRenderingProfile` | medium — aggressive for news mode |

*Sub-calls inside applyNewsRenderingProfile: `ensureNewsFaqStructure`, `enforceNewsHeadingHierarchy`*

### GROUP K: Enrichment (6 passes)
| # | Pass | Risk |
|---|------|------|
| 5 | `ensureQuoteHighlight` | low (but wasted — QA resets) |
| 6 | `ensureFomoIntro` | low |
| 57 | `liveDataEnricher.enrichArticle` | low |
| QA-2 | Citation re-creation | medium |
| QA-13 | `addPremiumWrappers` | medium |
| QA-29 | `ensureSerpSections` | medium |
| QA-31 | `fillEmptySections` | medium |

---

## Section 4: Recommended Execution Order (DAG-based)

The current order interleaves additions and removals, causing conflicts. The recommended order groups operations into clear phases with defined dependencies.

```
PHASE 0: PROTECTION
  ├── FAQ extraction (placeholder)
  └── Scope drift detection (diagnostic)

PHASE 1: INITIAL CLEANUP (remove garbage BEFORE any additions)
  ├── stripNonAsiaSentences
  ├── removeParasiticText
  ├── removeParasiticSections
  ├── removeOldStructureResidues
  ├── removeForbiddenH2Section
  ├── removeGenericVerdictPhrase
  ├── removeEmptySections
  ├── removePlaceholdersAndEmptyCitations
  └── removeTrailingOrphans

PHASE 2: HTML STRUCTURE REPAIR
  ├── fixH2InsideP
  ├── fixMalformedLinks
  ├── closeUnclosedAnchors (implicitly in fixMalformedLinks)
  ├── replaceDeadLinks
  ├── ensureIntroBeforeFirstH2
  └── normalizeSpacing

PHASE 3: HEADING COHERENCE
  ├── removeEmojisFromH2
  ├── fixH2GeoCoherence
  ├── Replace "Questions ouvertes"
  ├── Replace destination placeholders in H2
  ├── translateCityNamesToFrench
  └── validateH2Titles

PHASE 4: DEDUPLICATION (one pass, not interspersed)
  ├── removeDuplicateH2Sections
  ├── removeDuplicateBlockquotes
  ├── removeDuplicateParagraphs (Jaccard)
  ├── removeRepetitions
  ├── removeRepetitivePhrases
  └── detectSectionDuplications

PHASE 5: CONTENT ENRICHMENT (add content AFTER dedup)
  ├── ensureQuoteHighlight ← MOVE AFTER QA blockquote reset, or remove
  ├── ensureFomoIntro
  ├── ensureCTA
  ├── replaceWidgetPlaceholders
  ├── Affiliate module injection
  ├── insertContextualImages
  ├── addPremiumWrappers
  ├── ensureSerpSections
  └── fillEmptySections

PHASE 6: QA VALIDATION & FIXES
  ├── Blockquote management (strip + re-create from evidence)
  ├── deduplicateBlockquotes (single call)
  ├── checkInventionGuard
  ├── checkAndFixStoryAlignment
  ├── checkAntiHallucination
  ├── detectAndFixIncompleteSentences
  ├── removeGenericPhrases
  ├── validateInternalLinks
  ├── validateWidgetDestinations
  ├── reconcileWidgetDestinations
  ├── validateAndFixCitations
  ├── validateRecommendationLinks
  ├── validateAndExtendNarrativeSection
  ├── validateTemporalConsistency
  ├── splitLongListItems
  ├── replaceAffiliatePlaceholders
  ├── injectPartnerBrandLinks
  └── applyBlockingGate

PHASE 7: TRANSLATION & TEXT NORMALIZATION
  ├── detectAndTranslateEnglish
  ├── Blockquote translation (bulk)
  ├── forceTranslateRecommendationsSection
  ├── forceTranslateCitationsInLists
  ├── Strong tag translation
  ├── capitalizeProperNouns
  ├── fixWordGlue
  ├── convertCurrencyToEUR
  ├── Normalize geo compound names
  ├── Accent/typo corrections
  ├── Add trailing periods
  └── applyDeterministicFinalTextCleanup

PHASE 8: STRUCTURE FINALIZATION
  ├── mergeShortParagraphs
  ├── balanceParagraphs
  ├── fixH2InsideP (safety net)
  ├── makeTablesResponsive
  ├── Empty paragraph cleanup (final)
  ├── removeDuplicateH2Sections (final safety net)
  └── deduplicateBlockquotes (final safety net)

PHASE 9: MODE-SPECIFIC
  └── applyNewsRenderingProfile (only if news mode)

PHASE 10: LIVE ENRICHMENT
  ├── liveDataEnricher.enrichArticle
  ├── fixWordGlue (post-enrichment)
  ├── applyDeterministicFinalTextCleanup
  └── convertTitleUSDToEUR

PHASE 11: RESTORATION & REPAIR
  ├── FAQ Restoration (from placeholders)
  ├── Orphan tag repair
  └── Final validation
```

### Key Improvements:
1. **All removals happen before additions** — eliminates the main source of conflicts
2. **Deduplication is a single phase** — no repeated calls scattered across the pipeline
3. **QA validation is separate from QA fixes** — diagnostic checks don't intermix with mutations
4. **Translation happens late** — after all structural changes, so translations are not lost
5. **`ensureQuoteHighlight` either moves after QA blockquote reset or is removed** — eliminates the wasted work of pass #5
6. **`deduplicateBlockquotes` called at most twice** — once after enrichment, once as final safety net (not 3 times)
7. **`removeDuplicateH2Sections` called at most twice** — once in dedup phase, once as final safety net (not 3 times)
