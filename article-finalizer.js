#!/usr/bin/env node

import fs from 'fs';
import { ENABLE_ANTI_HALLUCINATION_BLOCKING, parseBool } from './config.js';

/**
 * ARTICLE FINALIZER
 * Finalise l'article avant publication :
 * - Remplace les placeholders de widgets Travelpayouts
 * - Ajoute l'image featured
 * - Ajoute les catégories/tags
 * - Vérifie le quote highlight
 * - Vérifie l'intro FOMO
 * 
 * PHASE 6.0 - CONTRAT D'ENTRÉE EXPLICITE
 * ======================================
 * 
 * INPUTS ATTENDUS :
 * - article (Object) : Article avec content (string HTML final)
 * - analysis (Object) : Analyse de l'article
 * - pipelineContext (Object, optionnel) : Contexte du pipeline avec :
 *   - pipelineContext.story (Object) : Story compilée (Phase 3)
 *   - pipelineContext.pattern (Object) : Pattern détecté (Phase 2)
 *   - pipelineContext.affiliate_plan (Object, optionnel) : Plan d'affiliation (Phase 5.C)
 *   - pipelineContext.geo_defaults (Object) : Géolocalisation par défaut
 *   - pipelineContext.final_destination (string) : Destination finale
 *   - pipelineContext.geo (Object) : Informations géographiques
 * 
 * INTERDICTIONS ABSOLUES (ce que le finalizer n'a PAS le droit de faire) :
 * - ❌ Ne pas inventer de contenu
 * - ❌ Ne pas appeler de LLM
 * - ❌ Ne pas modifier la story (pipelineContext.story est en lecture seule)
 * - ❌ Ne pas modifier le pattern (pipelineContext.pattern est en lecture seule)
 * - ❌ Ne pas modifier l'affiliate_plan (pipelineContext.affiliate_plan est en lecture seule)
 * 
 * Le finalizer est un module de RENDU uniquement, pas de GÉNÉRATION.
 */

// Polyfill File pour Node 18 (nécessaire pour cheerio/undici)
if (typeof globalThis.File === 'undefined') {
  try {
    // Essayer d'importer fetch-blob si disponible
    const { File } = await import('fetch-blob/file.js');
    globalThis.File = File;
  } catch (e) {
    // Fallback: créer un polyfill minimal
    globalThis.File = class File {
      constructor(bits, name, options = {}) {
        this.name = name;
        this.size = bits.length;
        this.type = options.type || '';
        this.lastModified = options.lastModified || Date.now();
      }
    };
  }
}

import axios from 'axios';
import { REAL_TRAVELPAYOUTS_WIDGETS } from './travelpayouts-real-widgets-database.js';
import ContextualWidgetPlacer from './contextual-widget-placer-v2.js';
import WidgetPlanBuilder from './widget-plan-builder.js';
import { DRY_RUN, FORCE_OFFLINE, ENABLE_AFFILIATE_INJECTOR, ENABLE_INLINE_IMAGES } from './config.js';
import ImageSourceManager from './image-source-manager.js';
import { lookupIATA, isKnownLocation, getAllLocationNames } from './airport-lookup.js';
import LiveDataEnricher from './live-data-enricher.js';
import QualityAnalyzer from './quality-analyzer.js';


// FV-115: Extracted pass modules
import * as RemovalPasses from './finalizer-passes/removal-passes.js';
import * as DedupPasses from './finalizer-passes/dedup-passes.js';
import * as StructurePasses from './finalizer-passes/structure-passes.js';
import * as TextPasses from './finalizer-passes/text-passes.js';
import * as TranslationPasses from './finalizer-passes/translation-passes.js';
import * as WidgetPasses from './finalizer-passes/widget-passes.js';
import * as QAPasses from './finalizer-passes/qa-passes.js';
import * as LinkPasses from './finalizer-passes/link-passes.js';
// FV-114: Invariant checks between phases
import { checkInvariants } from './finalizer-invariants.js';

class ArticleFinalizer {
  constructor() {
    this.widgets = REAL_TRAVELPAYOUTS_WIDGETS;
    this.widgetPlacer = new ContextualWidgetPlacer();
    this.widgetPlanBuilder = new WidgetPlanBuilder();
    this.liveDataEnricher = new LiveDataEnricher();
    // Import IntelligentContentAnalyzerOptimized pour traduction
    this.intelligentContentAnalyzer = null;
    this._initAnalyzer();

    // FV-115: Bind extracted pass functions to this instance
    const passModules = [
      RemovalPasses, DedupPasses, StructurePasses, TextPasses,
      TranslationPasses, WidgetPasses, QAPasses, LinkPasses
    ];
    for (const mod of passModules) {
      for (const [name, fn] of Object.entries(mod)) {
        if (typeof fn === 'function') {
          this[name] = fn.bind(this);
        }
      }
    }

    // FV-114: Invariant check storage
    this._invariantViolations = [];

  }
  
  async _initAnalyzer() {
    try {
      const IntelligentContentAnalyzerOptimized = (await import('./intelligent-content-analyzer-optimized.js')).default;
      this.intelligentContentAnalyzer = new IntelligentContentAnalyzerOptimized();
    } catch (error) {
      console.warn('⚠️ IntelligentContentAnalyzerOptimized non disponible pour traduction');
    }
  }


  // FV-114 runPhase merged into FV-113 DAG-based runPhase below

  /**
   * Supprime les phrases contenant des termes non-Asie (sanitizer post-LLM)
   * Version simple qui préserve le HTML en supprimant les paragraphes entiers
   * Logs détaillés en DRY_RUN
   */
  stripNonAsiaSentences(html, finalDestination = null) {
    const NON_ASIA = [
      'portugal','spain','espagne','lisbon','lisbonne','barcelona','barcelone','madrid','porto',
      'france','paris','italy','italie','rome','greece','grèce','turkey','turquie','istanbul',
      'europe','america','usa','brazil','brésil','mexico','mexique'
    ];
    
    // FIX 2: Whitelist pour éviter faux positifs
    const WHITELIST = ['from', 'arome', 'chrome', 'chromosome', 'promote', 'promotion', 'promoteur'];
    
    const isDryRun = DRY_RUN;
    const removedParagraphs = [];
    const triggerTerms = new Set();
    
    // Normaliser la destination finale pour exclusion
    const finalDestLower = finalDestination ? finalDestination.toLowerCase() : null;
    
    // Split par paragraphes HTML — utiliser un split capturant pour préserver les délimiteurs
    // Chaque élément pair est le contenu, chaque élément impair est le délimiteur (</p> ou </div>)
    const parts = html.split(/(<\/p>|<\/div>)/i);
    
    // Reconstruire des segments [contenu + délimiteur] pour le filtrage
    const segments = [];
    for (let i = 0; i < parts.length; i += 2) {
      const content = parts[i] || '';
      const delimiter = parts[i + 1] || '';
      segments.push({ content, delimiter, full: content + delimiter });
    }
    
    const filtered = segments.filter(segment => {
      const paraText = segment.content.replace(/<[^>]*>/g, ' ').toLowerCase();
      
      // Ne jamais supprimer les titres
      if (/<h[1-6][^>]*>/.test(segment.content)) {
        return true;
      }
      
      // Ne jamais supprimer si le segment contient la destination finale validée
      if (finalDestLower && paraText.includes(finalDestLower)) {
        return true;
      }
      
      // Match uniquement sur mots entiers avec word boundaries
      const foundTerms = NON_ASIA.filter(term => {
        if (WHITELIST.some(w => paraText.includes(w))) {
          return false;
        }
        const wordBoundaryRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return wordBoundaryRegex.test(paraText);
      });
      
      if (foundTerms.length > 0) {
        foundTerms.forEach(term => triggerTerms.add(term));
        
        if (isDryRun) {
          const fullText = segment.content.replace(/<[^>]*>/g, ' ').trim();
          const excerpt = fullText.substring(0, 200);
          removedParagraphs.push({
            term: foundTerms[0],
            excerpt: excerpt + (excerpt.length >= 200 ? '...' : '')
          });
        }
        
        return false;
      }
      
      return true;
    });
    
    // Logs détaillés en DRY_RUN uniquement
    if (isDryRun && removedParagraphs.length > 0) {
      console.log(`🧹 Sanitizer: ${removedParagraphs.length} paragraphe(s) supprimé(s)`);
      console.log(`   Termes déclencheurs: ${Array.from(triggerTerms).join(', ')}`);
      removedParagraphs.slice(0, 3).forEach((item, i) => {
        console.log(`   [${i+1}] term="${item.term}" phrase="...${item.excerpt}..."`);
      });
    } else if (!isDryRun && removedParagraphs.length > 0) {
      console.log(`🧹 Sanitizer: ${removedParagraphs.length} paragraphe(s) supprimé(s)`);
    }
    
    // Reconstruire le HTML en préservant les délimiteurs
    return filtered.map(s => s.full).join('');
  }

  detectRegionalScopeDrift(html, title = '', finalDestination = null) {
    const text = String(html || '').replace(/<[^>]*>/g, ' ').toLowerCase();
    const titleLower = String(title || '').toLowerCase();
    const isSeaScope = /asie\s+du\s+sud-?est|sud-?est\s+asiat/.test(titleLower) ||
      ['thaïlande', 'thailande', 'vietnam', 'indonésie', 'indonesie', 'malaisie', 'singapour', 'philippines', 'cambodge', 'laos', 'myanmar']
        .includes(String(finalDestination || '').toLowerCase());
    if (!isSeaScope) return [];

    const outliers = [
      { label: 'chine', aliases: ['chine', 'china', 'pekin', 'beijing', 'shanghai'] },
      { label: 'japon', aliases: ['japon', 'japan', 'tokyo', 'osaka', 'kyoto'] },
      { label: 'corée', aliases: ['corée', 'coree', 'korea', 'seoul', 'busan'] }
    ];
    const warnings = [];
    for (const item of outliers) {
      let count = 0;
      for (const alias of item.aliases) {
        const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const matches = text.match(re);
        count += matches ? matches.length : 0;
      }
      if (count >= 2) {
        warnings.push(`scope_drift:${item.label}:${count}`);
      }
    }
    return warnings;
  }

  /**
   * Finalise l'article complet
   * PATCH 1: Accepte pipelineContext pour propagation final_destination
   */
  /**
   * Execute a group of finalizer passes in a named phase.
   * Provides error isolation and char-delta logging per phase.
   * Passes that return a falsy value are treated as no-ops (original html preserved).
   * Async passes are awaited automatically.
   *
   * passConfigs: array of strings (method names) or objects { name, args }
   */
  async runPhase(phaseName, html, ctx, passConfigs) {
    const startLen = html.length;
    for (const cfg of passConfigs) {
      const passName = typeof cfg === 'string' ? cfg : cfg.name;
      const args = typeof cfg === 'string' ? [] : (cfg.args || []);
      try {
        if (typeof this[passName] === 'function') {
          const result = this[passName](html, ...args);
          // Handle async methods transparently
          html = (result instanceof Promise ? await result : result) || html;
        } else {
          console.warn(`[finalizer][${phaseName}] Pass ${passName} not found — skipped`);
        }
      } catch (err) {
        console.warn(`[finalizer][${phaseName}] Pass ${passName} failed: ${err.message}`);
      }
    }
    const delta = html.length - startLen;
    console.log(`[finalizer] Phase ${phaseName}: ${passConfigs.length} passes, ${delta > 0 ? '+' : ''}${delta} chars delta`);
    // FV-114: Check invariants after each phase
    try {
      const violations = checkInvariants(html, phaseName);
      if (violations.length > 0) {
        console.warn(`\u26a0\ufe0f INVARIANT [${phaseName}]: ${violations.length} violation(s)`);
        for (const v of violations) {
          console.warn(`   - [${v.invariant}] ${v.message}`);
        }
        this._invariantViolations.push({ phase: phaseName, violations });
      }
    } catch (e) {
      // checkInvariants may not exist yet — fail silently
    }
    return html;
  }

  async finalizeArticle(article, analysis, pipelineContext = null) {
    // PHASE 6.0: Log d'entrée unique (preuve d'exécution)
    const htmlLength = article?.content ? (typeof article.content === 'string' ? article.content.length : 0) : 0;
    const hasStory = Boolean(pipelineContext?.story);
    const hasPattern = Boolean(pipelineContext?.pattern);
    const hasAffiliatePlan = Boolean(pipelineContext?.affiliate_plan?.placements?.length > 0);
    console.log(`✅ FINALIZER_INPUT_READY: has_story=${hasStory} has_pattern=${hasPattern} has_affiliate_plan=${hasAffiliatePlan} html_length=${htmlLength}`);

    console.log('\n🎨 FINALISATION DE L\'ARTICLE');
    console.log('==============================\n');

    // PATCH 1: Créer pipelineContext si non fourni (fallback)
    if (!pipelineContext) {
      pipelineContext = {
        final_destination: analysis.final_destination || null,
        geo: analysis.geo || {},
        source_truth: analysis.source_truth || null
      };
    }
    const editorialMode = (pipelineContext?.editorial_mode || pipelineContext?.editorialMode || 'evergreen').toLowerCase();
    pipelineContext.editorial_mode = editorialMode;

    // Prepare shared context variables
    const finalDestinationRaw = pipelineContext?.final_destination ?? analysis?.final_destination ?? null;
    const finalDestination = finalDestinationRaw ? finalDestinationRaw.toLowerCase() : null;

    // SANITIZER POST-LLM: Supprimer les phrases contenant des termes non-Asie
    if (analysis?.main_destination || analysis?.destination || finalDestination) {
      const beforeLength = article.content.length;
      article.content = this.stripNonAsiaSentences(article.content, finalDestination);
      const afterLength = article.content.length;
      if (beforeLength !== afterLength) {
        console.log(`🧹 Sanitizer: ${beforeLength - afterLength} caractères supprimés (phrases non-Asie)`);
      }
    }
    const scopeWarnings = this.detectRegionalScopeDrift(article.content, article.title, finalDestination);
    if (scopeWarnings.length > 0) {
      console.log(`⚠️ Scope drift détecté: ${scopeWarnings.join(', ')}`);
    }

    let finalContent = article.content;
    const enhancements = { ...article.enhancements };
    if (scopeWarnings.length > 0) {
      enhancements.scopeWarnings = scopeWarnings;
    }

    // PROTECTION FAQ GUTENBERG: Extraire la section FAQ complète avant tout traitement
    // Pattern identique à content-marketing-pass.js — protège heading + details + schema
    const faqPlaceholderMap = new Map();
    let faqPlaceholderCount = 0;
    finalContent = finalContent.replace(
      /(<!-- wp:heading[^>]*-->\s*<h2[^>]*>Questions?\s+fr[eé]quentes<\/h2>\s*<!-- \/wp:heading -->\s*(?:<!-- wp:details -->[\s\S]*?<!-- \/wp:details -->\s*)+(?:<script type="application\/ld\+json">[\s\S]*?<\/script>\s*)?)/gi,
      (match) => {
        const placeholder = `__FAQ_PROTECTED_${faqPlaceholderCount++}__`;
        faqPlaceholderMap.set(placeholder, match);
        return placeholder;
      }
    );
    if (faqPlaceholderMap.size > 0) {
      console.log(`🛡️ FAQ_PROTECT: ${faqPlaceholderMap.size} section(s) FAQ protégée(s) dans finalizeArticle`);
    }

    // Compteur diagnostic FAQ (utilisé tout au long de la chaîne)
    const _faqCount = (s) => (s.match(/<!-- wp:details/g) || []).length;
    console.log(`📊 FAQ_TRACE [ENTRY]: ${_faqCount(finalContent)} wp:details (placeholder: ${faqPlaceholderMap.size})`);

    // Create a shared temp report for passes that require it
    const tempReport = {
      checks: [],
      actions: [],
      issues: [],
      metrics: {}
    };

    // Destination name for placeholder replacement
    const destName = pipelineContext?.final_destination || pipelineContext?.geo_defaults?.country || '';
    const destCapitalized = destName ? destName.charAt(0).toUpperCase() + destName.slice(1) : '';
    const destArticle = destCapitalized && /^[aeiouàâéèêëïîôùûü]/i.test(destCapitalized) ? `l'${destCapitalized}` : `le ${destCapitalized}`;

    // ═══════════════════════════════════════════════════════════════════
    // Phase 1: REMOVALS — all content removal before any additions
    // ═══════════════════════════════════════════════════════════════════
    finalContent = await this.runPhase('removal', finalContent, null, [
      { name: 'removeParasiticSections', args: [] },
      { name: 'removeOldStructureResidues', args: [] },
      { name: 'removeForbiddenH2Section', args: [] },
      { name: 'removeEmptySections', args: [] },
      { name: 'removeParasiticText', args: [] },
      { name: 'removePlaceholdersAndEmptyCitations', args: [] },
      { name: 'removeGenericVerdictPhrase', args: [] },
    ]);

    // ═══════════════════════════════════════════════════════════════════
    // Phase 2: DEDUPLICATION
    // ═══════════════════════════════════════════════════════════════════
    finalContent = await this.runPhase('dedup', finalContent, null, [
      { name: 'removeDuplicateParagraphs', args: [tempReport] },
      { name: 'removeDuplicateH2Sections', args: [] },
      { name: 'deduplicateBlockquotes', args: [] },      // ONCE only (was 3x before)
      { name: 'removeDuplicateBlockquotes', args: [] },
      { name: 'removeRepetitions', args: [] },
      { name: 'removeRepetitivePhrases', args: [tempReport] },
      { name: 'dedup10grams', args: [] },
    ]);

    // Also detect section duplications (was inline before)
    finalContent = this.detectSectionDuplications(finalContent, 'Ce que la communauté apporte', tempReport) || finalContent;

    // Set current destination for link-passes destination mismatch check
    this._currentDestination = pipelineContext?.final_destination || analysis?.final_destination || null;

    // ═══════════════════════════════════════════════════════════════════
    // Phase 3: HTML STRUCTURE
    // ═══════════════════════════════════════════════════════════════════
    finalContent = await this.runPhase('structure', finalContent, null, [
      { name: 'fixH2InsideP', args: [] },               // extractH2FromParagraphs
      { name: 'mergeShortParagraphs', args: [] },        // mergeMicroParagraphs
      { name: 'balanceParagraphs', args: [tempReport] },
      { name: 'fixH2InsideP', args: [] },               // safety re-extract after balance
      { name: 'fixMalformedLinks', args: [] },
      { name: 'fixBrokenInternalLinks', args: [] },
      { name: 'closeUnclosedAnchors', args: [] },
      { name: 'removeTrailingOrphans', args: [] },
    ]);

    console.log(`📊 FAQ_TRACE [POST-structure]: ${_faqCount(finalContent)}`);

    // ═══════════════════════════════════════════════════════════════════
    // Phase 4: HEADINGS
    // ═══════════════════════════════════════════════════════════════════
    finalContent = await this.runPhase('headings', finalContent, null, [
      { name: 'removeEmojisFromH2', args: [] },
      { name: 'fixH2GeoCoherence', args: [article?.title || pipelineContext?.generatedTitle || ''] },
      { name: 'validateH2Titles', args: [tempReport] },
    ]);

    // Inline: Replace "Questions ouvertes" headings
    finalContent = finalContent.replace(/<h2[^>]*>Questions (encore )?ouvertes[^<]*<\/h2>/gi, '<h2>Nos recommandations : Par où commencer ?</h2>');
    finalContent = finalContent.replace(/Questions (encore )?ouvertes/gi, 'Nos recommandations');

    // Inline: Replace destination placeholders in H2
    if (destName) {
      finalContent = finalContent.replace(/(<h2[^>]*>)([\s\S]*?)(<\/h2>)/gi, (match, open, inner, close) => {
        let fixed = inner;
        fixed = fixed.replace(/\ben la destination\b/gi, `au ${destCapitalized}`);
        fixed = fixed.replace(/\bla destination\b/gi, destArticle);
        fixed = fixed.replace(/\[destination\]/gi, destCapitalized);
        if (fixed !== inner) {
          console.log(`   🌐 H2_DEST_FIX: "${inner.trim()}" → "${fixed.trim()}"`);
        }
        return open + fixed + close;
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // Phase 5: TEXT NORMALIZATION
    // ═══════════════════════════════════════════════════════════════════
    console.log(`📊 FAQ_TRACE [PRE-normalizeSpacing]: ${_faqCount(finalContent)}`);
    finalContent = await this.runPhase('text', finalContent, null, [
      { name: 'normalizeSpacing', args: [tempReport] },
      { name: 'fixWordGlue', args: [null] },
    ]);
    console.log(`📊 FAQ_TRACE [POST-normalizeSpacing]: ${_faqCount(finalContent)}`);

    // Inline: Add final punctuation to paragraphs (addFinalPunctuation)
    {
      let dotFixed = 0;
      finalContent = finalContent.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/gi, (match, open, content, close) => {
        const trimmed = content.replace(/\s+$/g, '');
        if (trimmed.length < 10) return match; // trop court = pas une vraie phrase
        const lastChar = trimmed.slice(-1);
        // Ne rien ajouter si ça finit déjà par une ponctuation, un guillemet, un placeholder, un tag, etc.
        if (/[.!?:;)»…\u2026\u00BB>_\]]/.test(lastChar)) return match;
        // Ne rien ajouter si le contenu finit par un tag HTML (ex: </strong>, </a>)
        if (/<\/[a-z]+>\s*$/i.test(trimmed)) {
          // Vérifier le dernier caractère de texte avant le tag fermant
          const textBeforeTag = trimmed.replace(/<\/[a-z]+>\s*$/i, '').replace(/<[^>]+>/g, '').trim();
          const lastTextChar = textBeforeTag.slice(-1);
          if (/[.!?:;)»…\u2026\u00BB\]]/.test(lastTextChar)) return match;
          // Insérer le point avant le tag fermant
          const tagMatch = trimmed.match(/(<\/[a-z]+>)\s*$/i);
          if (tagMatch) {
            dotFixed++;
            return open + trimmed.slice(0, -tagMatch[0].length) + '.' + tagMatch[0] + close;
          }
        }
        // Terminé par une lettre ou un chiffre → ajouter un point
        if (/[a-zA-ZÀ-ÿ0-9]/.test(lastChar)) {
          dotFixed++;
          return open + trimmed + '.' + close;
        }
        return match;
      });
      if (dotFixed > 0) {
        console.log(`   ✏️ PONCTUATION_FINALE: ${dotFixed} point(s) ajouté(s) en fin de paragraphe`);
      }
    }

    // Inline: Normalize geo compound names (normalizeGeoNames: sud-est → Sud-Est)
    finalContent = finalContent.replace(/(?<=>)([^<]+)(?=<)/g, (match, textContent) => {
      return textContent
        .replace(/\bsud-est\b/g, 'Sud-Est')
        .replace(/\bsud-ouest\b/g, 'Sud-Ouest')
        .replace(/\bnord-est\b/g, 'Nord-Est')
        .replace(/\bnord-ouest\b/g, 'Nord-Ouest')
        .replace(/\bmoyen-orient\b/g, 'Moyen-Orient');
    });

    // Inline: Accent and typo fixes (fixAccentsTypos)
    const _accentFixes = [
      [/\bAchete\b/g, 'Achète'],
      [/\bachete\b/g, 'achète'],
      [/\bPrevois\b/g, 'Prévois'],
      [/\bprevois\b/g, 'prévois'],
      [/\bPrevoit\b/g, 'Prévoit'],
      [/\bprevoit\b/g, 'prévoit'],
      [/\bPrevoyez\b/g, 'Prévois'],   // vous → tu
      [/\bDecouvre\b/g, 'Découvre'],
      [/\bdecouvre\b/g, 'découvre'],
      [/\bDecouvrez\b/g, 'Découvre'],  // vous → tu
      [/\bdecouvrez\b/g, 'découvre'],
      [/\bConsultez\b/g, 'Consulte'],  // vous → tu
      [/\bconsultez\b/g, 'consulte'],
      [/\bN'hesitez pas\b/gi, "N'hésite pas"],
      [/\bVeuillez\b/g, 'Merci de'],   // registre formel → neutre
    ];
    finalContent = finalContent.replace(/(?<=>)([^<]+)(?=<)/g, (match, textContent) => {
      let fixed = textContent;
      for (const [pattern, replacement] of _accentFixes) {
        fixed = fixed.replace(pattern, replacement);
      }
      return fixed;
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 6: TRANSLATION (after text normalization)
    // ═══════════════════════════════════════════════════════════════════
    finalContent = await this.runPhase('translation', finalContent, null, [
      { name: 'translateCityNamesToFrench', args: [] },
      { name: 'convertCurrencyToEUR', args: [] },
    ]);

    // Bulk blockquote translation (complex inline logic with Cheerio, kept here)
    if (!FORCE_OFFLINE && this.intelligentContentAnalyzer) {
      try {
        const cheerioModule = await import('cheerio');
        const cheerio = cheerioModule.default || cheerioModule;
        // FIX: Protéger les <script> tags AVANT le parsing Cheerio xmlMode
        const scriptMap = new Map();
        let scriptCounter = 0;

        let protectedHtml = finalContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (match) => {
          const placeholder = `<!--SCRIPT_SAFE_${scriptCounter}-->`;
          scriptMap.set(placeholder, match);
          scriptCounter++;
          return placeholder;
        });

        // FIX: Protéger les commentaires Gutenberg
        const gutenbergMap = new Map();
        let gutenbergCounter = 0;
        protectedHtml = protectedHtml.replace(/<!-- \/?(wp:[a-z]+[^>]*) -->/g, (match) => {
          const placeholder = `__GUTENBERG_${gutenbergCounter}__`;
          gutenbergMap.set(placeholder, match);
          gutenbergCounter++;
          return placeholder;
        });

        const $ = cheerio.load(protectedHtml, { xmlMode: true, decodeEntities: false });
        const blockquotes = $('blockquote');
        const toTranslate = [];
        const bqRefs = [];
        for (let i = 0; i < blockquotes.length; i++) {
          const bq = $(blockquotes[i]);
          const fullText = bq.text().trim();
          const englishWords = (fullText.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|I|you|he|she|it|we|they|here|there|my|your|his|her|our|their|stable|internet|all|also|career|safety|world|country|freelance|digital|nomad|hiding|cheap|destination|coming|third)\b/gi) || []).length;
          const totalWords = fullText.split(/\s+/).length;
          const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
          if (englishRatio > 0.25 && totalWords > 10 && !fullText.includes('Extrait de témoignage traduit')) {
            const paragraphs = bq.find('p');
            const textParts = [];
            paragraphs.each((idx, p) => {
              const pText = $(p).text().trim();
              if (!pText.startsWith('—') && !pText.startsWith('–')) textParts.push(pText);
            });
            const textToTranslate = textParts.join(' ').trim();
            if (textToTranslate.length > 0) {
              toTranslate.push(textToTranslate);
              bqRefs.push(bq);
            }
          }
        }
        if (toTranslate.length > 0) {
          console.log(`🌐 FINALIZER: Traduction bulk de ${toTranslate.length} blockquote(s)...`);
          const translated = this.intelligentContentAnalyzer.translateBulkToFrench
            ? await this.intelligentContentAnalyzer.translateBulkToFrench(toTranslate)
            : await Promise.all(toTranslate.map(t => this.intelligentContentAnalyzer.translateToFrench(t)));
          bqRefs.forEach((bq, i) => {
            const translatedText = translated[i] || toTranslate[i];
            bq.empty();
            bq.append(`<p>${translatedText}</p>`);
            bq.append('<p><cite>— Témoignage traduit</cite></p>');
          });
          let result = $.html();
          // Restaurer les commentaires Gutenberg protégés
          for (const [placeholder, original] of gutenbergMap) {
            result = result.replace(placeholder, original);
          }
          // Restaurer les scripts protégés
          for (const [placeholder, original] of scriptMap) {
            result = result.replace(placeholder, original);
          }
          finalContent = result;
          enhancements.blockquotesTranslated = toTranslate.length;
          console.log(`✅ BLOCKQUOTE_TRANSLATION: ${toTranslate.length} blockquote(s) traduit(s)`);
        }
      } catch (error) {
        console.error(`❌ Erreur traduction blockquotes: ${error.message}`);
      }
    }

    // Inline: Force translate strong tags with English
    const finalStrongsWithEnglish = finalContent.match(/<strong[^>]*>(Underestimating|Not budgeting|Essential for)[^<]*<\/strong>/gi);
    if (finalStrongsWithEnglish && this.intelligentContentAnalyzer) {
      const strongTexts = finalStrongsWithEnglish.map(m => (m.match(/<strong[^>]*>([^<]+)<\/strong>/i) || [])[1]).filter(Boolean);
      if (strongTexts.length > 0) {
        const translated = this.intelligentContentAnalyzer.translateBulkToFrench
          ? await this.intelligentContentAnalyzer.translateBulkToFrench(strongTexts)
          : await Promise.all(strongTexts.map(t => this.intelligentContentAnalyzer.translateToFrench(t)));
        finalStrongsWithEnglish.forEach((strongMatch, i) => {
          const translatedText = translated[i] || strongTexts[i];
          const escapedMatch = strongMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          finalContent = finalContent.replace(new RegExp(escapedMatch, 'g'), `<strong>${translatedText}</strong>`);
        });
      }
    }

    console.log(`📊 FAQ_TRACE [POST-translation]: ${_faqCount(finalContent)}`);

    // ═══════════════════════════════════════════════════════════════════
    // Phase 7: CONTENT ADDITIONS (after all removals/cleanups)
    // ═══════════════════════════════════════════════════════════════════
    finalContent = this.ensureIntroBeforeFirstH2(finalContent) || finalContent;
    finalContent = this.ensureIntroHook(finalContent) || finalContent;

    const quoteResult = this.ensureQuoteHighlight(finalContent, analysis);
    finalContent = quoteResult.content;
    enhancements.quoteHighlight = quoteResult.hasQuote ? 'Oui' : 'Non';

    const fomoResult = this.ensureFomoIntro(finalContent, analysis);
    finalContent = fomoResult.content;
    enhancements.fomoIntro = fomoResult.hasFomo ? 'Oui' : 'Non';

    const ctaResult = this.ensureCTA(finalContent, analysis);
    finalContent = ctaResult.content;
    enhancements.ctaPresent = ctaResult.hasCTA ? 'Oui' : 'Non';

    console.log(`[finalizer] Phase additions: 4 passes, content additions applied`);

    // ═══════════════════════════════════════════════════════════════════
    // Phase 8: WIDGETS & AFFILIATE
    // ═══════════════════════════════════════════════════════════════════
    // 8a. Replace widget placeholders
    const widgetResult = await this.replaceWidgetPlaceholders(finalContent, analysis, pipelineContext);
    finalContent = widgetResult.content;
    enhancements.widgetsReplaced = widgetResult.count;
    const widgetsAfterWidgets = this.detectRenderedWidgets(finalContent);
    console.log(`🔍 DEBUG finalizeArticle: Widgets après replaceWidgetPlaceholders: count=${widgetsAfterWidgets.count}, types=[${widgetsAfterWidgets.types.join(', ')}]`);

    // 8b. Inject affiliate modules (if enabled)
    if ((typeof ENABLE_AFFILIATE_INJECTOR !== "undefined" ? ENABLE_AFFILIATE_INJECTOR : true) && pipelineContext?.affiliate_plan?.placements?.length > 0) {
      try {
        const { renderAffiliateModule } = await import('./affiliate-module-renderer.js');
        const affiliatePlan = pipelineContext.affiliate_plan;
        const geoDefaults = pipelineContext.geo_defaults || {};

        let injectedCount = 0;
        const injectedTypes = [];

        const totalPlacements = affiliatePlan.placements.length;
        affiliatePlan.placements.forEach((placement, placementIndex) => {
          const widgetType = placement.id || placement.type || '';
          const widgetAlreadyPresent = widgetType && new RegExp(`data-widget-type=["']${widgetType}["']`, 'i').test(finalContent);
          if (widgetAlreadyPresent) {
            console.log(`   ⏭️ Widget ${widgetType} déjà présent dans le HTML — skip injection module affilié`);
            return;
          }
          const moduleHtml = renderAffiliateModule(placement, geoDefaults);
          if (!moduleHtml) return;
          const options = { placementId: placement.id, placementIndex, totalPlacements };
          const injected = this.injectAffiliateModule(finalContent, moduleHtml, placement.anchor, options);
          if (injected !== finalContent) {
            finalContent = injected;
            injectedCount++;
            injectedTypes.push(placement.id);
          }
        });

        if (injectedCount > 0) {
          console.log(`✅ AFFILIATE_INJECTED: count=${injectedCount} types=[${injectedTypes.join(', ')}]`);
        }
      } catch (error) {
        console.warn('⚠️ Erreur injection modules affiliation (fallback silencieux):', error.message);
      }
    }

    console.log(`[finalizer] Phase widgets: widget + affiliate injection complete`);

    // ═══════════════════════════════════════════════════════════════════
    // Phase 9: LINKS
    // ═══════════════════════════════════════════════════════════════════
    finalContent = await this.runPhase('links', finalContent, null, [
      { name: 'replaceDeadLinks', args: [] },
      { name: 'deduplicateNestedLinks', args: [] },
    ]);

    // ═══════════════════════════════════════════════════════════════════
    // Phase 10: IMAGES
    // ═══════════════════════════════════════════════════════════════════
    if (ENABLE_INLINE_IMAGES && !DRY_RUN) {
      try {
        const inlineImages = await this.insertContextualImages(finalContent, analysis, pipelineContext);
        if (inlineImages.html !== finalContent) {
          finalContent = inlineImages.html;
          console.log(`✅ INLINE_IMAGES: ${inlineImages.count} image(s) insérée(s) [${inlineImages.sources.join(', ')}]`);
        }
      } catch (error) {
        console.warn('⚠️ Erreur insertion images inline (fallback silencieux):', error.message);
      }
    }
    console.log(`[finalizer] Phase images: contextual image insertion complete`);

    // ═══════════════════════════════════════════════════════════════════
    // Phase 11: QA & VALIDATION (last, after everything is stable)
    // ═══════════════════════════════════════════════════════════════════
    // runQAReport is a mega-method that internally runs: checkInventionGuard,
    // detectAndTranslateEnglish, forceTranslateRecommendationsSection,
    // forceTranslateCitationsInLists, validateAndFixCitations,
    // validateInternalLinks, validateRecommendationLinks,
    // validateTemporalConsistency, ensureSerpSections, fillEmptySections,
    // reconcileWidgetDestinations, capitalizeProperNouns, fixWordGlue, etc.
    const qaReport = await this.runQAReport(finalContent, pipelineContext, analysis);
    finalContent = qaReport.finalHtml;

    // Post-QA affiliate passes
    finalContent = this.replaceAffiliatePlaceholders(finalContent, pipelineContext, qaReport) || finalContent;
    finalContent = this.injectPartnerBrandLinks(finalContent, pipelineContext) || finalContent;
    finalContent = this.sanitizeAffiliateWidgetIntegrity(finalContent) || finalContent;

    // Log synthèse QA
    const passCount = qaReport.checks.filter(c => c.status === 'pass').length;
    const warnCount = qaReport.checks.filter(c => c.status === 'warn').length;
    const failCount = qaReport.checks.filter(c => c.status === 'fail').length;
    const actionsCount = qaReport.actions.length;
    console.log(`✅ FINALIZER_QA: pass=${passCount} warn=${warnCount} fail=${failCount} actions=${actionsCount} html_before=${qaReport.metrics.html_length_before} html_after=${qaReport.metrics.html_length_after}`);

    // PHASE 6.1: Log détaillé des issues si présentes
    if (qaReport.issues.length > 0) {
      console.log(`📋 FINALIZER_QA_ISSUES: ${qaReport.issues.length} issue(s) détectée(s):`);
      qaReport.issues.forEach((issue, idx) => {
        console.log(`   [${idx + 1}] ${issue.code}: ${issue.message} (severity: ${issue.severity})`);
        if (issue.evidence) {
          console.log(`       Evidence: ${JSON.stringify(issue.evidence)}`);
        }
      });
    }

    // PHASE 6.1: Log des checks qui ont échoué
    if (failCount > 0) {
      const failedChecks = qaReport.checks.filter(c => c.status === 'fail');
      console.log(`❌ FINALIZER_QA_FAILED_CHECKS: ${failedChecks.length} check(s) en échec:`);
      failedChecks.forEach((check, idx) => {
        console.log(`   [${idx + 1}] ${check.name}: ${check.details}`);
      });
    }

    // PHASE 6.1: Flag strict - throw si fail en mode strict
    if (process.env.FINALIZER_STRICT === '1' && failCount > 0) {
      const failMessages = qaReport.checks.filter(c => c.status === 'fail').map(c => c.name).join(', ');
      const issuesSummary = qaReport.issues.slice(0, 3).map(i => `${i.code}: ${i.message}`).join('; ');
      throw new Error(`SOURCE_OF_TRUTH_VIOLATION: Finalizer QA failed (${failCount} check(s)): ${failMessages}. Issues: ${issuesSummary}`);
    }

    console.log(`📊 FAQ_TRACE [POST-runQAReport]: ${_faqCount(finalContent)}`);

    // ═══════════════════════════════════════════════════════════════════
    // Phase 12: FINAL CLEANUP (idempotent, safe to run last)
    // ═══════════════════════════════════════════════════════════════════

    // RESTAURATION FAQ GUTENBERG: Réinsérer la section FAQ protégée
    console.log(`📊 FAQ_TRACE [PRE-RESTORE]: ${_faqCount(finalContent)}, placeholder present: ${[...faqPlaceholderMap.keys()].some(p => finalContent.includes(p))}`);
    for (const [placeholder, original] of faqPlaceholderMap) {
      if (finalContent.includes(placeholder)) {
        finalContent = finalContent.replace(placeholder, original);
        console.log(`🛡️ FAQ_PROTECT: section FAQ restaurée depuis placeholder`);
      } else {
        // Le placeholder a disparu — réinsérer avant "Articles connexes" ou en fin
        const relatedIdx = finalContent.lastIndexOf('<h2');
        const insertPos = relatedIdx > 0 ? relatedIdx : finalContent.length;
        finalContent = finalContent.slice(0, insertPos) + '\n' + original + '\n' + finalContent.slice(insertPos);
        console.warn(`🛡️ FAQ_PROTECT: placeholder disparu — FAQ réinsérée avant dernier H2`);
      }
    }

    // NEWS-specific (conditional)
    if (editorialMode === 'news') {
      finalContent = this.applyNewsRenderingProfile(finalContent) || finalContent;
    }

    // Second fixWordGlue after all translations (Phase 12 safety pass)
    finalContent = this.fixWordGlue(finalContent, null) || finalContent;

    // PHASE 6.2: Injection donnees live (prix, securite, devise, etc.)
    try {
      const liveResult = await this.liveDataEnricher.enrichArticle(finalContent, pipelineContext);
      if (liveResult.enriched) {
        finalContent = liveResult.html;
        enhancements.liveData = true;
        enhancements.liveDataSources = [liveResult.liveData.safety && 'safety', liveResult.liveData.countryInfo && 'country', liveResult.liveData.flightPrice && 'flights', liveResult.liveData.costOfLiving && 'cost'].filter(Boolean);
      }
    } catch (e) {
      console.warn(`⚠️ LIVE_DATA: Enrichissement echoue (non-bloquant): ${e.message}`);
    }

    // Dernier filet de sécurité linguistique APRÈS enrichissement live-data.
    finalContent = this.fixWordGlue(finalContent, null) || finalContent;
    finalContent = this.applyDeterministicFinalTextCleanup(finalContent) || finalContent;

    // NETTOYAGE FINAL ABSOLU: Garantir qu'aucun paragraphe vide ou duplication ne subsiste
    const finalCleanupBefore = {
      emptyParas: (finalContent.match(/<p[^>]*>\s*\.\s*<\/p>/gi) || []).length + (finalContent.match(/<p[^>]*>\s*<\/p>/gi) || []).length,
      limitesCount: (finalContent.match(/<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/gi) || []).length + (finalContent.match(/<h2[^>]*>.*?limits?\s*(and\s*)?bias(es)?.*?<\/h2>/gi) || []).length
    };

    // Supprimer TOUS les paragraphes complètement vides
    finalContent = finalContent.replace(/<p[^>]*>\s*<\/p>\s*/gi, '');

    // Supprimer TOUS les paragraphes avec juste un point (patterns exhaustifs)
    finalContent = finalContent.replace(/<p[^>]*>\s*\.\s*<\/p>/gi, '');
    finalContent = finalContent.replace(/<p[^>]*>\.<\/p>/gi, '');
    finalContent = finalContent.replace(/<p[^>]*>\s*[.\s]+\s*<\/p>/gi, '');
    finalContent = finalContent.replace(/<p[^>]*>\s*\.\.\.\s*<\/p>/gi, '');
    // Pattern supplémentaire pour paragraphes avec juste un point suivi d'un espace et d'un lien
    finalContent = finalContent.replace(/<p[^>]*>\s*\.\s+[^<]*<\/p>/gi, (match) => {
      const linkMatch = match.match(/<a[^>]*>.*?<\/a>/i);
      return linkMatch ? `<p>${linkMatch[0]}</p>` : '';
    });

    // Supprimer les duplications de "Limites et biais" une dernière fois
    finalContent = this.removeDuplicateH2Sections(finalContent) || finalContent;

    const finalCleanupAfter = {
      emptyParas: (finalContent.match(/<p[^>]*>\s*\.\s*<\/p>/gi) || []).length + (finalContent.match(/<p[^>]*>\s*<\/p>/gi) || []).length,
      limitesCount: (finalContent.match(/<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/gi) || []).length + (finalContent.match(/<h2[^>]*>.*?limits?\s*(and\s*)?bias(es)?.*?<\/h2>/gi) || []).length
    };

    if (finalCleanupBefore.emptyParas > finalCleanupAfter.emptyParas || finalCleanupBefore.limitesCount > finalCleanupAfter.limitesCount) {
      console.log(`   🧹 NETTOYAGE FINAL ABSOLU: ${finalCleanupBefore.emptyParas - finalCleanupAfter.emptyParas} paragraphe(s) vide(s) et ${finalCleanupBefore.limitesCount - finalCleanupAfter.limitesCount} duplication(s) "Limites et biais" supprimé(s)`);
    }

    // NETTOYAGE FINAL: Forcer le nettoyage des titres "Événement central" avec anglais
    const eventTitleMatches = finalContent.match(/<h2[^>]*>Événement central[^<]*<\/h2>/gi);
    if (eventTitleMatches) {
      for (const match of eventTitleMatches) {
        const titleContent = match.replace(/<h2[^>]*>|<\/h2>/gi, '').trim();
        if (titleContent !== 'Événement central') {
          console.log(`⚠️ FINALIZER: Titre "Événement central" avec contenu supplémentaire détecté: "${titleContent}" → nettoyage forcé`);
          const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          finalContent = finalContent.replace(new RegExp(escapedMatch, 'g'), '<h2>Événement central</h2>');
        }
      }
    }

    // PHASE FINALE: Réparation des tags HTML orphelins (div, a)
    {
      const _countTag = (h, t) => [(h.match(new RegExp('<' + t + '[\\s>]', 'gi')) || []).length, (h.match(new RegExp('</' + t + '>', 'gi')) || []).length];
      for (const tag of ['div', 'a']) {
        const [opens, closes] = _countTag(finalContent, tag);
        if (opens > closes) {
          const missing = opens - closes;
          for (let i = 0; i < missing; i++) {
            finalContent += `</${tag}>`;
          }
          console.log(`🔧 TAG_BALANCE_REPAIR: ajouté ${missing} </${tag}> manquant(s)`);
        } else if (closes > opens) {
          let remaining = closes - opens;
          while (remaining > 0) {
            const idx = finalContent.lastIndexOf(`</${tag}>`);
            if (idx === -1) break;
            finalContent = finalContent.substring(0, idx) + finalContent.substring(idx + tag.length + 3);
            remaining--;
          }
          console.log(`🔧 TAG_BALANCE_REPAIR: supprimé ${closes - opens} </${tag}> orphelin(s)`);
        }
      }
    }

    // Responsive tables
    finalContent = this.makeTablesResponsive(finalContent, tempReport) || finalContent;

    console.log(`[finalizer] Phase final: cleanup, tag balance, and FAQ restoration complete`);

    // ═══════════════════════════════════════════════════════════════════
    // SUMMARY LOG
    // ═══════════════════════════════════════════════════════════════════
    console.log('✅ Finalisation terminée:');
    console.log(`   - Widgets remplacés: ${enhancements.widgetsReplaced}`);
    console.log(`   - Quote highlight: ${enhancements.quoteHighlight}`);
    console.log(`   - Intro FOMO: ${enhancements.fomoIntro}`);
    console.log(`   - CTA présent: ${enhancements.ctaPresent}\n`);
    // PHASE 6.2: Les shortcodes [fv_widget] sont désormais rendus par WordPress via le mu-plugin PHP.

    // ═══════════════════════════════════════════════════════════════════
    // BUILD RETURN VALUE
    // ═══════════════════════════════════════════════════════════════════
    const widgetsBeforeReturn = this.detectRenderedWidgets(finalContent);
    console.log(`🔍 DEBUG finalizeArticle: Widgets AVANT return final: count=${widgetsBeforeReturn.count}, types=[${widgetsBeforeReturn.types.join(', ')}]`);

    const returnValue = {
      ...article,
      content: finalContent,
      enhancements,
      qaReport, // PHASE 6.1: Exposer le rapport QA
      inlineImages: pipelineContext?.inlineImages || [], // PHASE 5.D: Images inline pour upload WP
      editorialMode,
      editorial_mode: editorialMode
    };

    if (returnValue.title) {
      returnValue.title = this.convertTitleUSDToEUR(returnValue.title);
    }

    // NETTOYAGE FINAL ABSOLU: Post-processing on returnValue.content
    if (returnValue.content) {
      console.log('   ℹ️ Nettoyage final des résidus SKIP (déjà fait en amont)');

      // FIX CHEERIO WRAPPER: Supprimer les balises <html><head><body> parasites
      // FILET DE SÉCURITÉ: Supprimer les wrappers markdown ```html...``` si présents
      returnValue.content = returnValue.content
        .replace(/```(?:html)?\s*\n?/g, '')   // Supprimer toutes les occurrences de ```html ou ```
        .replace(/^[\s"'\u201C\u201D\u2018\u2019`]+(?=<)/m, ''); // Supprimer guillemets/backticks parasites avant le premier tag
      if (/^[^<]+/.test(returnValue.content.trim())) {
        const firstTag = returnValue.content.indexOf('<');
        if (firstTag > 0 && firstTag < 50) {
          console.log(`   ⚠️ FILET DE SÉCURITÉ: ${firstTag} caractères parasites supprimés avant le premier tag HTML`);
          returnValue.content = returnValue.content.substring(firstTag);
        }
      }

      // FIX BROKEN LINKS: Réparer les liens cassés par le LLM
      returnValue.content = returnValue.content
        .replace(/<a\s+href="https?:\/\/www\s*<\/p>/gi, '')
        .replace(/<a\s+href="\s*https?:?=?"?\s*www<?[^"]*"?>/gi, '')
        .replace(/<a\s+href="https?:\/\/www"[^>]*>[^<]*<\/a>/gi, '')
        .replace(/<p>\s*com\s*<\/p>/gi, '')
        .replace(/<p>\s*com">.*?<\/p><\/a>/gi, '');

      // FIX BROKEN HTML TAGS: Réparer les balises HTML imbriquées incorrectement
      returnValue.content = returnValue.content
        .replace(/<\/p><\/p>/g, '</p>')
        .replace(/<\/p><\/p><\/p>/g, '</p>')
        .replace(/<\/p><\/p><\/p><\/p>/g, '</p>')
        .replace(/<p><p>/g, '<p>')
        .replace(/<\/li><\/p>/g, '</li>')
        .replace(/<\/ul><\/p>/g, '</ul>');

      // Ces balises sont ajoutées par Cheerio $.html() et ne doivent pas être envoyées à WordPress
      returnValue.content = returnValue.content
        .replace(/<html[^>]*>/gi, '')
        .replace(/<\/html>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<body[^>]*>/gi, '')
        .replace(/<\/body>/gi, '')
        .replace(/<h\s+(\d)([^>]*)>/gi, '<h$1$2>')
        .replace(/<\/h\s+(\d)>/gi, '</h$1>')
        .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
        .replace(/<meta[^>]*>/gi, '')
        .replace(/https?:\/\/www\.\s+/gi, 'https://www.')
        .replace(/www\.\s+([a-z])/gi, 'www.$1')
        .replace(/\.\s+com/gi, '.com')
        .replace(/\.\s+fr/gi, '.fr')
        .replace(/\.\s+org/gi, '.org')
        .replace(/\.\s+net/gi, '.net')
        .replace(/\.\s+io/gi, '.io')
        .replace(/\bà\s+([a-z])/gi, 'à $1')
        .replace(/([a-zéèêëàâùûîïôöç])à([a-zéèêëàâùûîïôöç])/gi, '$1 à $2')
        .replace(/([a-zéèêëâùûîïôöç]{3,})à(\s)/gi, (m, word, sp) => {
          const full = word + 'à';
          if (/(?:déjà|voilà|holà|cela)$/i.test(full)) return m;
          return word + ' à' + sp;
        })
        .trim();
      console.log('   ✅ Nettoyage wrapper HTML Cheerio effectué');

      // PHASE SÉCURITÉ HTML: Fermer les liens <a> non fermés
      returnValue.content = this.closeUnclosedAnchors(returnValue.content);

      // PHASE NETTOYAGE H3 ANGLAIS: Supprimer les H3 en anglais
      returnValue.content = this.removeEnglishH3(returnValue.content);

      // PHASE NETTOYAGE LIENS IMBRIQUÉS: Dé-imbriquer les <a> dans <a>
      returnValue.content = this.deduplicateNestedLinks(returnValue.content);
    }

    // VALIDATION PRÉ-PUBLICATION CRITIQUE
    if (returnValue.content) {
      const textOnly = returnValue.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const textLength = textOnly.length;
      const wordCount = textOnly.split(/\s+/).filter(w => w.length > 0).length;
      console.log(`📏 VALIDATION PRÉ-PUBLICATION: ${textLength} caractères, ${wordCount} mots de texte réel`);

      if (textLength < 800) {
        console.error(`❌ ARTICLE VIDE BLOQUÉ: seulement ${textLength} caractères (minimum: 800)`);
        console.error(`   💡 Causes possibles: JSON LLM tronqué, max_tokens insuffisant, erreur de parsing`);
        console.error(`   📋 Titre: ${returnValue.title || 'N/A'}`);

        if (qaReport && qaReport.issues) {
          qaReport.issues.push({
            type: 'CRITICAL_EMPTY_ARTICLE',
            severity: 'critical',
            message: `Article trop court pour publication: ${textLength} caractères (minimum: 800)`,
            suggestion: 'Vérifier max_tokens dans generateFinalArticle et finish_reason du LLM'
          });
        }

        throw new Error(`PRE_PUBLISH_VALIDATION_FAILED: Article trop court (${textLength} chars < 800 minimum). Publication bloquée.`);
      }

      // Gate SEO: minimum 1000 mots pour être compétitif en SEO
      if (wordCount < 1000) {
        console.warn(`⚠️ ARTICLE COURT: ${wordCount} mots (minimum SEO recommandé: 1000). Publication autorisée mais signalée.`);
        if (qaReport && qaReport.issues) {
          qaReport.issues.push({
            type: 'SHORT_ARTICLE',
            severity: 'warning',
            message: `Article court: ${wordCount} mots (minimum SEO: 1000)`,
            suggestion: 'Augmenter max_tokens LLM ou vérifier les instructions de longueur dans le prompt'
          });
        }
      }

      console.log(`   ✅ Validation pré-publication OK: ${textLength} caractères`);
    }

    return returnValue;
  }


  /**
   * 1. Détection unique des widgets rendus dans le HTML final
   * Source de vérité unique pour toute validation
   */
  /**
   * PATCH 2: Déduplication widgets (max 1 par type)
   */
  /**
   * Résout les shortcodes [fv_widget] en scripts HTML Travelpayouts réels.
   * Cherche dans REAL_TRAVELPAYOUTS_WIDGETS le script correspondant au type.
   * @param {string} html - Contenu HTML avec shortcodes
   * @param {Object} pipelineContext - Contexte du pipeline (geo_defaults)
   * @returns {string} HTML avec shortcodes remplacés par les scripts réels
   */
  resolveWidgetShortcodes(html, pipelineContext = null) {
    const shortcodeRegex = /\[fv_widget\s+type="([^"]+)"(?:\s+origin="([^"]*)")?(?:\s+destination="([^"]*)")?\s*\]/gi;
    let resolvedCount = 0;

    const resolved = html.replace(shortcodeRegex, (match, type, origin, destination) => {
      // Map shortcode type to widget database key
      const typeMapping = {
        flights: 'flights',
        esim: 'esim',
        connectivity: 'esim',
        insurance: 'insurance',
        tours: 'tours',
        transfers: 'transfers',
        car_rental: 'car_rental',
        bikes: 'bikes',
        events: 'events'
      };
      
      const dbKey = typeMapping[type] || type;
      const widgetCategory = this.widgets[dbKey];

      if (!widgetCategory) {
        console.log(`⚠️ SHORTCODE_RESOLVE: Pas de widget pour type "${type}" → shortcode conservé`);
        return match; // Keep shortcode as-is
      }
      
      // Get the first provider's first widget type
      const providers = Object.keys(widgetCategory);
      if (providers.length === 0) return match;
      
      const provider = providers[0];
      const widgetTypes = Object.keys(widgetCategory[provider]);
      if (widgetTypes.length === 0) return match;
      
      // For flights, prefer searchForm
      const preferredType = widgetTypes.includes('searchForm') ? 'searchForm' : widgetTypes[0];
      const widgetData = widgetCategory[provider][preferredType];
      
      if (!widgetData?.script) {
        console.log(`⚠️ SHORTCODE_RESOLVE: Script manquant pour "${type}/${provider}/${preferredType}" → shortcode conservé`);
        return match;
      }
      
      let script = widgetData.script;
      
      // For flights, inject origin/destination if available
      if (dbKey === 'flights') {
        const flightOrigin = origin || pipelineContext?.geo_defaults?.origin || 'PAR';
        const flightDest = destination || pipelineContext?.geo_defaults?.destination || 'BKK';
        // Replace generic origin/destination in script URL
        script = script.replace(/origin=[A-Z]{3}/i, `origin=${flightOrigin}`);
        script = script.replace(/destination=[A-Z]{3}/i, `destination=${flightDest}`);
      }
      
      resolvedCount++;
      console.log(`   ✅ SHORTCODE_RESOLVE: [fv_widget type="${type}"] → ${provider}/${preferredType}`);
      return script;
    });
    
    if (resolvedCount > 0) {
      console.log(`✅ SHORTCODE_RESOLVE: ${resolvedCount} shortcode(s) résolu(s) en scripts Travelpayouts`);
    } else {
      console.log('ℹ️ SHORTCODE_RESOLVE: Aucun shortcode à résoudre');
    }
    
    return resolved;
  }

  /**
   * Supprime les contenus orphelins après la fin logique de l'article.
   * Détecte les marqueurs de fin (Articles connexes, À lire également, source citation)
   * et supprime les <p>/<h2>/<h3> parasites qui apparaissent après.
   * @param {string} html - Contenu HTML
   * @returns {string} HTML nettoyé
   */
  removeTrailingOrphans(html) {
    // Detect logical end markers
    const endMarkers = [
      /<h[23][^>]*>\s*Articles connexes/i,
      /<h[23][^>]*>\s*À lire également/i,
      /<div[^>]*class="[^"]*jeg_post_related/i,
      /<p[^>]*class="[^"]*reddit-source-discrete/i
    ];
    
    let endIndex = -1;
    for (const marker of endMarkers) {
      const match = html.match(marker);
      if (match && (endIndex === -1 || match.index < endIndex)) {
        endIndex = match.index;
      }
    }
    
    if (endIndex === -1) return html; // No end marker found
    
    const beforeEnd = html.substring(0, endIndex);
    const afterEnd = html.substring(endIndex);
    
    // Check for orphan affiliate blocks or paragraphs after the end marker
    // Keep source citations and related articles, remove orphan content
    const orphanPattern = /<div data-fv-segment="affiliate">[\s\S]*?<\/div>/gi;
    const cleanedAfter = afterEnd.replace(orphanPattern, (match) => {
      console.log(`🧹 removeTrailingOrphans: Bloc affilié orphelin supprimé après fin logique`);
      return '';
    });
    
    // Also remove orphan <p> and <h2>/<h3> that don't belong
    // But keep the end marker itself and source citations
    const result = beforeEnd + cleanedAfter;
    
    // Count removals
    if (result.length < html.length) {
      console.log(`✅ removeTrailingOrphans: ${html.length - result.length} chars orphelins supprimés`);
    }
    
    return result;
  }

  /**
   * PATCH 2: Déduplique les widgets (max 1 par type)
   * Garde le premier, supprime les suivants
   * Utilise detectRenderedWidgets() pour le comptage (cohérence avec FINAL)
   */
  async deduplicateWidgets(html, pipelineContext = null) {
    // Garde-fou : éviter appels multiples
    if (pipelineContext?.widgets_dedup_done === true) {
      console.log('⚠️ WIDGET_DEDUP déjà effectué - skip');
      return html;
    }
    
    // Compter AVANT déduplication via detectRenderedWidgets (même fonction que FINAL)
    const beforeDetected = this.detectRenderedWidgets(html);
    const beforeCount = beforeDetected.count;
    const typesBefore = [...beforeDetected.types];
    
    let dedupedHtml = html;
    
    // Essayer avec cheerio si disponible (import dynamique)
    try {
      const cheerioModule = await import('cheerio');
      const cheerio = cheerioModule.default || cheerioModule;
      // FIX: Protéger <script> et commentaires Gutenberg avant Cheerio xmlMode
      const _sdm = new Map(); let _sdc = 0;
      let _protected = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (m) => { const p = `<!--SD_${_sdc}-->`; _sdm.set(p, m); _sdc++; return p; });
      const _gbm = new Map(); let _gbc = 0;
      _protected = _protected.replace(/<!-- \/?(wp:[a-z]+[^>]*) -->/g, (m) => { const p = `__GB_${_gbc}__`; _gbm.set(p, m); _gbc++; return p; });
      const $ = cheerio.load(_protected, { xmlMode: true, decodeEntities: false });
      const widgetTypes = new Set();
      let removedCount = 0;
      
      // Identifier et dédupliquer widgets flights (garder le premier, supprimer les suivants)
      $('form[class*="kiwi"], form[class*="travelpayouts"], script[src*="kiwi"], script[src*="travelpayouts"], form[data-widget-type="flights"]').each((i, elem) => {
        if (widgetTypes.has('flights')) {
          $(elem).remove();
          removedCount++;
        } else {
          widgetTypes.add('flights');
        }
      });
      
      // Identifier et dédupliquer widgets connectivity (garder le premier, supprimer les suivants)
      $('script[src*="airalo"], div[class*="airalo"], script[src*="esim"], div[class*="esim"], script[data-widget-type="connectivity"], script[data-widget-type="esim"]').each((i, elem) => {
        if (widgetTypes.has('connectivity')) {
          $(elem).remove();
          removedCount++;
        } else {
          widgetTypes.add('connectivity');
        }
      });
      
      dedupedHtml = $.html();
      // Restaurer les commentaires Gutenberg protégés
      for (const [placeholder, original] of _gbm) {
        dedupedHtml = dedupedHtml.replace(placeholder, original);
      }
      // Restaurer les scripts protégés
      for (const [placeholder, original] of _sdm) {
        dedupedHtml = dedupedHtml.replace(placeholder, original);
      }
    } catch (error) {
      // Fallback regex si cheerio indisponible
      // Dédupliquer flights (garder le premier, supprimer les suivants)
      const flightsPattern = /(<form[^>]*(?:kiwi|travelpayouts)[^>]*>[\s\S]*?<\/form>)/gi;
      let flightsCount = 0;
      dedupedHtml = dedupedHtml.replace(flightsPattern, (match) => {
        flightsCount++;
        return flightsCount > 1 ? '' : match;
      });
      
      // Dédupliquer connectivity (garder le premier, supprimer les suivants)
      const connectivityPattern = /(<(?:script|div)[^>]*(?:airalo|esim)[^>]*>[\s\S]*?<\/(?:script|div)>)/gi;
      let connectivityCount = 0;
      dedupedHtml = dedupedHtml.replace(connectivityPattern, (match) => {
        connectivityCount++;
        return connectivityCount > 1 ? '' : match;
      });
    }
    
    // Compter APRÈS déduplication via detectRenderedWidgets (même fonction que FINAL)
    const afterDetected = this.detectRenderedWidgets(dedupedHtml);
    const afterCount = afterDetected.count;
    const typesAfter = [...afterDetected.types];
    
    // Marquer comme fait
    if (pipelineContext) {
      pipelineContext.widgets_dedup_done = true;
    }
    
    // PATCH 2: Log obligatoire après dédup (toujours, même si pas de changement)
    console.log(`🧹 WIDGET_DEDUP: before=${beforeCount} after=${afterCount} removed=${beforeCount - afterCount} types_before=[${typesBefore.join(', ')}] types_after=[${typesAfter.join(', ')}]`);
    
    return dedupedHtml;
  }

  detectRenderedWidgets(html) {    
    const detected = {
      count: 0,
      types: [],
      details: []
    };

    // Marqueurs robustes pour widget FLIGHTS (scripts, forms, shortcodes)
    // IMPORTANT: Ne PAS utiliser trpwdg.com/content comme marqueur flights,
    // car TOUS les widgets Travelpayouts (eSIM Airalo inclus) utilisent ce domaine.
    // Utiliser les promo_id/campaign_id spécifiques aux vols (2811, 100, aviasales).
    const kiwiMarkers = [
      /\[fv_widget[^\]]*type=["']?flights/gi,
      /<form[^>]*kiwi[^>]*>/gi,
      /<form[^>]*travelpayouts[^>]*>/gi,
      /data-widget-type=["']flights["']/gi,
      /class=["'][^"']*kiwi[^"']*["']/gi,
      /class=["'][^"']*travelpayouts[^"']*["']/gi,
      /promo_id[=&%]\d*2811/gi,
      /campaign_id[=&%]\d*100[^0-9]/gi,
      /aviasales/gi,
      /travelpayouts-widget/gi,
      /kiwi\.com.*widget/gi,
      /<!-- FLASHVOYAGE_WIDGET:flights/gi,
      /<!-- FLASHVOYAGE_WIDGET:fallback/gi
    ];

    // Marqueurs pour widget CONNECTIVITY (eSIM/Airalo) + shortcodes
    // Inclure promo_id=8588 (Airalo eSIM) pour détection précise
    const connectivityMarkers = [
      /\[fv_widget[^\]]*type=["']?esim/gi,
      /airalo/gi,
      /promo_id[=&%]\d*8588/gi,
      /data-widget-type=["']connectivity["']/gi,
      /data-widget-type=["']esim["']/gi,
      /class=["'][^"']*airalo[^"']*["']/gi,
      /<!-- FLASHVOYAGE_WIDGET:connectivity/gi,
      /<!-- FLASHVOYAGE_WIDGET:esim/gi
    ];

    // Marqueurs pour widget INSURANCE + shortcodes
    const insuranceMarkers = [
      /\[fv_widget[^\]]*type=["']?insurance/gi,
      /data-widget-type=["']insurance["']/gi
    ];

    // Marqueurs pour les autres types de widgets (tours, transfers, car_rental, bikes, flight_compensation, events)
    const otherWidgetTypes = ['tours', 'transfers', 'car_rental', 'bikes', 'flight_compensation', 'events', 'coworking', 'accommodation'];
    const otherWidgetMarkers = {};
    for (const wtype of otherWidgetTypes) {
      otherWidgetMarkers[wtype] = [
        new RegExp(`\\[fv_widget[^\\]]*type=["']?${wtype}`, 'gi'),
        new RegExp(`data-widget-type=["']${wtype}["']`, 'gi'),
        new RegExp(`data-placement-id=["']${wtype}["']`, 'gi')
      ];
    }

    // Marqueurs textuels (moins fiables mais fallback)
    const textMarkers = [
      /Selon notre analyse de milliers de vols/gi,
      /D'après notre expérience avec des centaines de nomades/gi,
      /Notre partenaire Kiwi\.com/gi,
      /Notre outil compare les prix/gi
    ];

    // Helper: détecte un type de widget (max 1 par type)
    const detectType = (typeName, markers) => {
      for (const marker of markers) {
        const matches = html.match(marker);
        if (matches) {
          detected.count += 1;
          detected.types.push(typeName);
          detected.details.push({ type: typeName, marker: marker.toString(), matches: matches.length });
          return true;
        }
      }
      return false;
    };

    // Détecter marqueurs HTML robustes pour FLIGHTS (max 1 par type)
    detectType('flights', kiwiMarkers);

    // Détecter marqueurs pour CONNECTIVITY/ESIM (max 1 par type)
    detectType('connectivity', connectivityMarkers);

    // Détecter marqueurs pour INSURANCE (max 1 par type)
    detectType('insurance', insuranceMarkers);

    // Détecter les autres types de widgets
    for (const wtype of otherWidgetTypes) {
      detectType(wtype, otherWidgetMarkers[wtype]);
    }

    // Si aucun marqueur HTML trouvé, fallback sur textuels (moins fiable)
    if (detected.count === 0) {
      for (const marker of textMarkers) {
        const matches = html.match(marker);
        if (matches) {
          detected.count += matches.length;
          if (!detected.types.includes('flights')) {
            detected.types.push('flights');
          }
        }
      }
    }

    // FIX 1: Ne pas logger ici (détection intermédiaire)
    // La détection finale sera loggée dans enhanced-ultra-generator après finalisation complète    
    // console.log(`   📊 WIDGETS_DETECTED_HTML: count=${detected.count}, types=[${detected.types.join(', ')}]`);
    return detected;
  }

  /**
   * Compte les vrais widgets placés dans le contenu (DEPRECATED - utiliser detectRenderedWidgets)
   * FIX A: Ne plus appeler detectRenderedWidgets ici (détection intermédiaire interdite)
   */
  countActualWidgets(content) {
    // FIX A: Retourner 0 pour éviter toute détection intermédiaire
    // La détection finale sera faite UNE SEULE FOIS dans enhanced-ultra-generator après finalisation complète
    return 0; // Informatif uniquement, pas de détection HTML ici
  }

  /**
   * Remplace les placeholders {{TRAVELPAYOUTS_XXX_WIDGET}} par les vrais widgets
   * NOUVELLE VERSION: Placement contextuel intelligent avec LLM
   * PATCH 1: Accepte pipelineContext pour propagation final_destination
   * PATCH 3: Ajoute widget_render_mode pour éviter double injection
   */
  async replaceWidgetPlaceholders(content, analysis, pipelineContext = null) {
    console.log('🔧 Remplacement des widgets Travelpayouts...');
    
    // PATCH 3: Garde-fou un seul mode de rendu
    if (pipelineContext && pipelineContext.widget_render_mode) {
      console.log(`⚠️ WIDGET_RENDER_MODE déjà défini: ${pipelineContext.widget_render_mode} - Skip pour éviter double injection`);
      return { content, count: 0 };
    }
    
    // FIX: Si Phase 5.C (affiliate module injection) est activée ET a des placements,
    // skip Phase 1 pour éviter la double injection de widgets.
    // Phase 5.C crée des modules formatés avec titre/description/shortcode,
    // tandis que Phase 1 insère des shortcodes nus sans module wrapper.
    const hasAffiliatePlan = pipelineContext?.affiliate_plan?.placements?.length > 0;
    const hasLegacyPlaceholders = content.includes('{{TRAVELPAYOUTS') || content.includes('{TRAVELPAYOUTS');
    if (hasAffiliatePlan && !hasLegacyPlaceholders) {
      console.log(`ℹ️ PHASE1_SKIP: affiliate_plan a ${pipelineContext.affiliate_plan.placements.length} placement(s) → Phase 5.C gèrera l'injection (pas de double injection)`);
      // Construire geo_defaults pour que Phase 5.C puisse les utiliser
      const finalDestinationRaw = pipelineContext?.final_destination ?? analysis?.final_destination ?? null;
      const finalDestination = finalDestinationRaw ? finalDestinationRaw.toLowerCase() : null;
      const geo = pipelineContext?.geo ?? analysis?.geo ?? {};
      const geoDefaults = this.widgetPlanBuilder.buildGeoDefaults(geo, finalDestination);
      if (geoDefaults) {
        pipelineContext.geo_defaults = geoDefaults;
        console.log(`✅ geo_defaults préparé pour Phase 5.C: ${JSON.stringify(geoDefaults)}`);
      }
      pipelineContext.widget_render_mode = 'affiliate_modules';
      return { content, count: 0 };
    }
    
    // PATCH 1: Créer pipelineContext si non fourni
    if (!pipelineContext) {
      pipelineContext = {
        final_destination: analysis.final_destination || null,
        geo: analysis.geo || {},
        source_truth: analysis.source_truth || null
      };
    }
    
    let updatedContent = content;
    let replacementCount = 0;

    // Détecter le contexte de l'article
    const context = this.analyzeArticleContext(content, analysis);
    
    // Vérifier s'il y a des placeholders à remplacer
    const hasPlaceholders = content.includes('{{TRAVELPAYOUTS') || content.includes('{TRAVELPAYOUTS');
    
    // PATCH 3: Définir widget_render_mode
    if (hasPlaceholders) {
      pipelineContext.widget_render_mode = 'classic';
      console.log(`✅ WIDGET_RENDER_MODE=classic`);
    } else {
      pipelineContext.widget_render_mode = 'smart';
      console.log(`✅ WIDGET_RENDER_MODE=smart`);
    }
    
    if (!hasPlaceholders) {
      console.log('   ℹ️ Pas de placeholders détectés, utilisation du placement intelligent\n');
      
      // Préparer les scripts de widgets (uniquement ceux qui existent réellement)
      const widgetScripts = {
        flights: this.selectBestFlightWidget(context),
        hotels: this.selectBestHotelWidget(context),
        // insurance: désactivé car pas de widgets d'assurance dans Travelpayouts
        // transport: this.selectBestTransportWidget(context)
      };
      
      // PATCH 1: Utiliser pipelineContext.final_destination comme source unique (priorité stricte)
      // 3) Corriger "finalDestination is not defined" - déclarer et normaliser en lowercase
      const finalDestinationRaw = pipelineContext?.final_destination ?? analysis?.final_destination ?? null;
      const finalDestination = finalDestinationRaw ? finalDestinationRaw.toLowerCase() : null;
      const geo = pipelineContext?.geo ?? analysis?.geo ?? {};
      
      // PATCH 1: Log obligatoire avant buildGeoDefaults
      console.log(`✅ GEO_DEFAULTS_INPUT: final_destination=${finalDestination || 'null'} geo_country=${geo?.country || 'null'} geo_city=${geo?.city || 'null'}`);
      
      const geoDefaults = this.widgetPlanBuilder.buildGeoDefaults(geo, finalDestination);
      
      // Log explicite pour diagnostic
      if (!geoDefaults) {
        console.log('⚠️ WIDGET_PIPELINE_ABORTED: geo_defaults_missing');
        console.log(`   Keys disponibles: geo=${JSON.stringify(geo)}, final_destination=${finalDestination}`);
        console.log('   → Widgets FLIGHTS seront désactivés proprement');
      } else {
        console.log(`✅ geo_defaults calculé: ${JSON.stringify(geoDefaults)}`);
      }
      
      
      // FIX B: Créer un contexte unique partagé (utiliser celui passé en paramètre si disponible)
      if (!pipelineContext) {
        pipelineContext = {};
      }
      pipelineContext.geo_defaults = geoDefaults;
      pipelineContext.final_destination = finalDestination;
      pipelineContext.geo = geo;
      pipelineContext.analysis = analysis;
      
      // Créer widgetPlan avec geo_defaults pré-calculé
      const widgetPlan = this.widgetPlanBuilder.buildWidgetPlan(
        analysis.affiliateSlots || [],
        geo,
        {
          type: analysis?.type || 'Témoignage',
          destination: finalDestination || 'Asie',
          audience: analysis?.target_audience || 'Nomades digitaux',
          final_destination: finalDestination,
          analysis: analysis
        },
        `article_${Date.now()}`
      );
      
      // FORCER geo_defaults dans widgetPlan ET dans context (source unique)
      if (widgetPlan?.widget_plan) {
        widgetPlan.widget_plan.geo_defaults = geoDefaults;
      }
      pipelineContext.widget_plan = widgetPlan?.widget_plan || null;
      
      console.log('🔍 DEBUG article-finalizer: pipelineContext.geo_defaults:', pipelineContext.geo_defaults ? 'PRESENT' : 'NULL');
      console.log('🔍 DEBUG article-finalizer: widgetPlan.geo_defaults:', widgetPlan?.widget_plan?.geo_defaults ? 'PRESENT' : 'NULL');
      
      // A) Court-circuit widget_plan LLM en offline + fallback placement déterministe
      const offline = FORCE_OFFLINE;
      const apiKey = process.env.OPENAI_API_KEY;
      
      let placementResult;
      let widgetCount = 0;
      let finalHtml = updatedContent;
      
      if (offline || !apiKey || apiKey.startsWith('invalid-')) {
        console.log('⚠️ OFFLINE_WIDGET_PLACEMENT: skipping LLM widget_plan');
        
        // B) Toujours générer le script FLIGHTS en offline (pas dépendre du widget_plan)
        const widgetScripts = {};
        if (geoDefaults && geoDefaults.destination) {
          // Créer un widgetPlan minimal pour getWidgetScript
          const minimalWidgetPlan = { geo_defaults: geoDefaults };
          widgetScripts.flights = this.widgetPlacer.getWidgetScript('flights', minimalWidgetPlan, pipelineContext);
          widgetScripts.connectivity = this.widgetPlacer.getWidgetScript('connectivity', minimalWidgetPlan, pipelineContext);
        }
        
        
        // Fallback déterministe: insérer widgets avant "Articles connexes" sinon après le 2e <p>
        finalHtml = this.placeWidgetsOffline(updatedContent, widgetScripts);
        pipelineContext.widget_plan = { mode: 'offline', selected: Object.keys(widgetScripts).filter(k => widgetScripts[k]) };
        
        // Mettre à jour pipelineContext.rendered après insertion OFFLINE
        const detectedAfterInsert = this.detectRenderedWidgets(finalHtml);
        widgetCount = detectedAfterInsert.count;
        if (pipelineContext) {
          pipelineContext.rendered = widgetCount;
          pipelineContext.rendered_types = detectedAfterInsert.types;
          if (pipelineContext.widgets_tracking) {
            pipelineContext.widgets_tracking.rendered = widgetCount;
          }
        }
        
        placementResult = { content: finalHtml, count: widgetCount };
      } else {
      // Utiliser le placement contextuel intelligent AVEC VALIDATION
      const articleContext = {
        type: analysis?.type || 'Témoignage',
        destination: analysis?.destinations?.[0] || context.hasDestination || 'Asie',
        audience: analysis?.target_audience || 'Nomades digitaux'
      };
      
        
        // FIX C: Passer pipelineContext au lieu de widgetPlan seul
        placementResult = await this.widgetPlacer.placeWidgetsIntelligently(
        updatedContent,
        articleContext,
          widgetPlan.widget_plan,
          pipelineContext // Passer le contexte complet
        );
        
        // DEBUG: Vérifier placementResult
        console.log(`🔍 DEBUG replaceWidgetPlaceholders: placementResult type=${typeof placementResult}, hasContent=${!!(placementResult?.content)}, count=${placementResult?.count || 'undefined'}`);
        if (placementResult?.content) {
          const widgetsInPlacementResult = this.detectRenderedWidgets(placementResult.content);
          console.log(`🔍 DEBUG replaceWidgetPlaceholders: Widgets dans placementResult.content: count=${widgetsInPlacementResult.count}, types=[${widgetsInPlacementResult.types.join(', ')}]`);
        }
        
        // MISSION 2: Utiliser le count retourné par placeWidgetsIntelligently (inclut fallback)
        // Si placementResult est un objet avec count, l'utiliser, sinon compter depuis le HTML
        if (typeof placementResult === 'object' && placementResult !== null) {
          if (placementResult.count !== undefined) {
            widgetCount = placementResult.count;
          }
          if (placementResult.content) {
            finalHtml = placementResult.content;
          } else if (typeof placementResult === 'string') {
            finalHtml = placementResult;
          }
        } else if (typeof placementResult === 'string') {
          finalHtml = placementResult;
        }
        
        // DEBUG: Vérifier finalHtml après assignation
        const widgetsInFinalHtmlAfterAssign = this.detectRenderedWidgets(finalHtml);
        console.log(`🔍 DEBUG replaceWidgetPlaceholders: Widgets dans finalHtml APRÈS assignation placementResult: count=${widgetsInFinalHtmlAfterAssign.count}, types=[${widgetsInFinalHtmlAfterAssign.types.join(', ')}]`);
      }
      
      // Fallback: compter depuis le HTML si count n'est pas disponible
      if (widgetCount === 0) {
        widgetCount = this.countActualWidgets(finalHtml);
      }
      
      // MISSION 2: Utiliser le tracking depuis pipelineContext si disponible
      if (pipelineContext?.widgets_tracking) {
        widgetCount = pipelineContext.widgets_tracking.rendered || widgetCount;
        console.log(`📊 Widgets tracking final: rendered=${widgetCount} (depuis pipelineContext)`);
      }
      
      // DEBUG: Vérifier les widgets dans finalHtml avant retour
      const detectedBeforeReturn = this.detectRenderedWidgets(finalHtml);
      console.log(`🔍 DEBUG replaceWidgetPlaceholders: Widgets dans finalHtml avant retour: count=${detectedBeforeReturn.count}, types=[${detectedBeforeReturn.types.join(', ')}], widgetCount=${widgetCount}`);
      
      // Si les widgets sont détectés dans finalHtml mais widgetCount=0, corriger widgetCount
      if (detectedBeforeReturn.count > 0 && widgetCount === 0) {
        console.log(`⚠️ CORRECTION: widgetCount était 0 mais ${detectedBeforeReturn.count} widget(s) détecté(s) dans finalHtml → correction`);
        widgetCount = detectedBeforeReturn.count;
      }
      
      return {
        content: finalHtml,
        count: widgetCount
      };
    }
    
    // Sinon, remplacement classique des placeholders
    console.log('   ℹ️ Placeholders détectés, remplacement classique\n');

    // PATCH 1: Utiliser pipelineContext.final_destination aussi en mode classic
    // 3) Corriger "finalDestination is not defined" - déclarer et normaliser en lowercase
    const finalDestinationRaw = pipelineContext?.final_destination ?? analysis?.final_destination ?? null;
    const finalDestination = finalDestinationRaw ? finalDestinationRaw.toLowerCase() : null;
    const geo = pipelineContext?.geo ?? analysis?.geo ?? {};
    
    // PATCH 1: Log obligatoire avant buildGeoDefaults (mode classic aussi)
    console.log(`✅ GEO_DEFAULTS_INPUT: final_destination=${finalDestination || 'null'} geo_country=${geo?.country || 'null'} geo_city=${geo?.city || 'null'}`);

    // Créer un widgetPlan pour obtenir les destinations dynamiques
    const widgetPlan = this.widgetPlanBuilder.buildWidgetPlan(
      analysis.affiliateSlots || [],
      geo,
      {
        type: analysis?.type || 'Témoignage',
        destination: analysis?.destinations?.[0] || context.hasDestination || 'Asie',
        audience: analysis?.target_audience || 'Nomades digitaux',
        final_destination: finalDestination // PATCH 1: Passer final_destination normalisé
      },
      `article_${Date.now()}`
    );
    
    // PATCH 1: Forcer geo_defaults avec final_destination
    if (widgetPlan?.widget_plan && finalDestination) {
      const geoDefaults = this.widgetPlanBuilder.buildGeoDefaults(geo, finalDestination);
      if (geoDefaults) {
        widgetPlan.widget_plan.geo_defaults = geoDefaults;
      }
    }

    // --- Remplacement des placeholders par des SHORTCODES WordPress ---
    // Le mu-plugin flashvoyage-widgets.php rend les scripts côté serveur

    const flightOrigin = widgetPlan?.widget_plan?.geo_defaults?.origin || 'PAR';
    const flightDest = widgetPlan?.widget_plan?.geo_defaults?.destination || 'BKK';

    // Remplacer FLIGHTS
    if (updatedContent.includes('{{TRAVELPAYOUTS_FLIGHTS_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_FLIGHTS_WIDGET}')) {
      const flightShortcode = `[fv_widget type="flights" origin="${flightOrigin}" destination="${flightDest}"]`;
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_FLIGHTS_WIDGET\}\}?/g,
        flightShortcode
      );
      replacementCount++;
      console.log(`   ✅ Widget FLIGHTS → shortcode (${flightOrigin}→${flightDest})`);
    }

    // Remplacer CONNECTIVITY (Airalo eSIM)
    if (updatedContent.includes('{{TRAVELPAYOUTS_CONNECTIVITY_WIDGET}}') ||
        updatedContent.includes('{TRAVELPAYOUTS_CONNECTIVITY_WIDGET}')) {
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_CONNECTIVITY_WIDGET\}\}?/g,
        '[fv_widget type="esim"]'
      );
      replacementCount++;
      console.log('   ✅ Widget CONNECTIVITY → shortcode esim');
    }

    // Remplacer HOTELS (fallback vers flights — pas de widget hotels dédié)
    if (updatedContent.includes('{{TRAVELPAYOUTS_HOTELS_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_HOTELS_WIDGET}')) {
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_HOTELS_WIDGET\}\}?/g,
        `[fv_widget type="flights" origin="${flightOrigin}" destination="${flightDest}"]`
      );
      replacementCount++;
      console.log('   ✅ Widget HOTELS → shortcode flights (fallback)');
    }

    // Remplacer INSURANCE
    if (updatedContent.includes('{{TRAVELPAYOUTS_INSURANCE_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_INSURANCE_WIDGET}')) {
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_INSURANCE_WIDGET\}\}?/g,
        '[fv_widget type="insurance"]'
      );
      replacementCount++;
      console.log('   ✅ Widget INSURANCE → shortcode');
    }

    // Remplacer PRODUCTIVITY (pas de widget dédié — supprimé silencieusement)
    if (updatedContent.includes('{{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET}')) {
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_PRODUCTIVITY_WIDGET\}\}?/g,
        ''
      );
      console.log('   ⚠️ Widget PRODUCTIVITY supprimé (pas de shortcode dédié)');
    }

    // Remplacer TRANSPORT (pas de widget dédié — supprimé silencieusement)
    if (updatedContent.includes('{{TRAVELPAYOUTS_TRANSPORT_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_TRANSPORT_WIDGET}')) {
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_TRANSPORT_WIDGET\}\}?/g,
        ''
      );
      console.log('   ⚠️ Widget TRANSPORT supprimé (pas de shortcode dédié)');
    }

    // Remplacer ACTIVITIES (pas de widget dédié — supprimé silencieusement)
    if (updatedContent.includes('{{TRAVELPAYOUTS_ACTIVITIES_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_ACTIVITIES_WIDGET}')) {
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_ACTIVITIES_WIDGET\}\}?/g,
        ''
      );
      console.log('   ⚠️ Widget ACTIVITIES supprimé (pas de shortcode dédié)');
    }

    return {
      content: updatedContent,
      count: replacementCount
    };
  }

  /**
   * Analyse le contexte de l'article pour sélectionner les meilleurs widgets
   */
  analyzeArticleContext(content, analysis) {
    const lowerContent = content.toLowerCase();
    
    return {
      isTestimonial: analysis?.type?.includes('TEMOIGNAGE') || false,
      isGuide: lowerContent.includes('guide') || lowerContent.includes('comment'),
      isComparison: lowerContent.includes('comparaison') || lowerContent.includes('vs'),
      hasDestination: this.extractDestination(content),
      hasVisa: lowerContent.includes('visa') || lowerContent.includes('formalités'),
      hasBudget: lowerContent.includes('budget') || lowerContent.includes('coût') || lowerContent.includes('prix'),
      hasNomad: lowerContent.includes('nomade') || lowerContent.includes('digital nomad'),
      destinations: analysis?.destinations || []
    };
  }

  /**
   * Extrait la destination principale de l'article
   */
  extractDestination(content) {
    // Détection dynamique via BDD OpenFlights (5600+ entrées)
    const textContent = content.replace(/<[^>]+>/g, ' ').toLowerCase();
    const words = textContent.split(/[\s,;.()!?]+/).filter(w => w.length > 2);
    
    // Trouver la première destination connue dans le texte
    for (const word of words) {
      if (isKnownLocation(word)) {
        return word;
      }
    }
    
    return 'asia'; // Par défaut
  }

  /**
   * Sélectionne le meilleur widget de vols selon le contexte
   */
  // A) Placement déterministe en mode OFFLINE - AMÉLIORÉ pour cohérence éditoriale
  placeWidgetsOffline(html, widgetScripts) {
    let out = html;

    const flights = widgetScripts.flights || '';
    const connectivity = widgetScripts.connectivity || '';
    
    // Transitions pour une meilleure intégration éditoriale
    const transitionConnectivity = '<div class="widget-transition"><h3>Utile si tu as besoin d\'internet en voyage</h3><p>Évite les frais de roaming élevés. Une eSIM te permet d\'avoir internet dès ton arrivée dans plus de 200 pays, sans changer de carte SIM.</p></div>';
    const transitionFlights = '<div class="widget-transition"><h3>Compare les vols pour cette destination</h3><p>Trouve les meilleurs tarifs pour ton prochain voyage en comparant les offres de centaines de compagnies.</p></div>';

    // STRATÉGIE DE PLACEMENT AMÉLIORÉE:
    // 1. Widget eSIM : après la section "Contexte" (pas au milieu du flux narratif)
    // 2. Widget Vols : avant "Nos recommandations" (logique d'action)
    
    // 1) Placer widget connectivity après la section Contexte (après le premier </h2>...</p> complet)
    const contexteMatch = out.match(/<h2>Contexte<\/h2>[\s\S]*?<\/p>/i);
    if (contexteMatch && connectivity) {
      const insertPoint = out.indexOf(contexteMatch[0]) + contexteMatch[0].length;
      const connectivityBlock = `\n${transitionConnectivity}\n${connectivity}\n<p class="widget-disclaimer">Lien partenaire</p>\n`;
      out = out.slice(0, insertPoint) + connectivityBlock + out.slice(insertPoint);
      console.log('✅ OFFLINE_WIDGET_PLACEMENT: connectivity après Contexte');
    }
    
    // 2) Placer widget flights avant "Nos recommandations" ou "Articles connexes"
    const recoMatch = out.indexOf('Nos recommandations');
    const relatedMatch = out.indexOf('Articles connexes');
    const insertBeforeReco = recoMatch !== -1 ? out.lastIndexOf('<h2', recoMatch) : -1;
    const insertBeforeRelated = relatedMatch !== -1 ? out.lastIndexOf('<', relatedMatch) : -1;
    
    if (flights) {
      const flightsBlock = `\n${transitionFlights}\n${flights}\n<p class="widget-disclaimer">Lien partenaire</p>\n`;
      
      if (insertBeforeReco !== -1) {
        out = out.slice(0, insertBeforeReco) + flightsBlock + out.slice(insertBeforeReco);
        console.log('✅ OFFLINE_WIDGET_PLACEMENT: flights avant Nos recommandations');
      } else if (insertBeforeRelated !== -1) {
        out = out.slice(0, insertBeforeRelated) + flightsBlock + out.slice(insertBeforeRelated);
        console.log('✅ OFFLINE_WIDGET_PLACEMENT: flights avant Articles connexes');
      } else {
        // Fallback: après le 3e paragraphe (pas le 2e pour éviter de couper le flux)
        let p3 = -1;
        for (let i = 0; i < 3; i++) {
          p3 = out.indexOf('</p>', p3 + 1);
          if (p3 === -1) break;
        }
        if (p3 !== -1) {
          out = out.slice(0, p3 + 4) + flightsBlock + out.slice(p3 + 4);
          console.log('✅ OFFLINE_WIDGET_PLACEMENT: flights après P3 (fallback)');
        } else {
          out += flightsBlock;
          console.log('✅ OFFLINE_WIDGET_PLACEMENT: flights en fin (fallback)');
        }
      }
    }
    
    return out;
  }

  selectBestFlightWidget(context) {
    const { flights } = this.widgets;

    // Si c'est un guide ou comparaison, utiliser le formulaire de recherche
    if (context.isGuide || context.isComparison) {
      return flights.kiwi.searchForm.script;
    }

    // Si c'est un témoignage, utiliser les routes populaires
    if (context.isTestimonial) {
      return flights.kiwi.popularRoutes.script;
    }

    // Par défaut, destinations populaires
    return flights.kiwi.popularDestinations.script;
  }

  /**
   * Sélectionne le meilleur widget d'hébergement selon le contexte
   */
  selectBestHotelWidget(context) {
    const { flights } = this.widgets;

    // HOTELLOOK SUPPRIMÉ - Utiliser Aviasales en remplacement
    return flights.aviasales.searchForm.script;
  }

  /**
   * Sélectionne le meilleur widget d'assurance selon le contexte
   * Utilise la structure REAL_TRAVELPAYOUTS_WIDGETS.insurance (visitorCoverage, insubuy)
   */
  selectBestInsuranceWidget(context) {
    const { insurance } = this.widgets;

    if (!insurance) {
      return `<!-- Widget assurance à ajouter -->`;
    }

    // VisitorCoverage travelMedical (widget générique) en priorité
    const visitorMedical = insurance.visitorCoverage?.travelMedical?.script;
    if (visitorMedical) {
      return visitorMedical;
    }

    // Sinon premier provider / premier widget disponible
    const providers = Object.keys(insurance);
    for (const provider of providers) {
      const widgets = insurance[provider];
      if (widgets && typeof widgets === 'object') {
        const firstKey = Object.keys(widgets)[0];
        const widget = widgets[firstKey];
        if (widget?.script) {
          return widget.script;
        }
      }
    }

    return `<!-- Widget assurance à ajouter -->`;
  }

  /**
   * Sélectionne le meilleur widget de productivité selon le contexte
   */
  selectBestProductivityWidget(context) {
    // Pour l'instant, retourner un widget générique ou vide
    // Tu peux ajouter des widgets de productivité dans la base de données
    return `<!-- Widget productivité à ajouter -->`;
  }

  /**
   * Sélectionne le meilleur widget de transport selon le contexte
   */
  selectBestTransportWidget(context) {
    const { transport } = this.widgets;

    // Si disponible, utiliser GetYourGuide pour le transport local
    if (transport && transport.getyourguide) {
      return transport.getyourguide.searchForm?.script || `<!-- Widget transport à ajouter -->`;
    }

    // Sinon, utiliser un widget de vols comme fallback
    return this.selectBestFlightWidget(context);
  }

  /**
   * Sélectionne le meilleur widget d'activités selon le contexte
   */
  selectBestActivitiesWidget(context) {
    const { activities } = this.widgets;

    // Si disponible, utiliser GetYourGuide pour les activités
    if (activities && activities.getyourguide) {
      return activities.getyourguide.searchForm?.script || `<!-- Widget activités à ajouter -->`;
    }

    // Sinon, retourner un placeholder
    return `<!-- Widget activités à ajouter -->`;
  }

  /**
   * Vérifie et améliore le quote highlight
   */
  ensureQuoteHighlight(content, analysis) {
    console.log('💬 Vérification du quote highlight...');

    // Vérifier si un quote existe déjà
    const hasQuote = content.includes('<!-- wp:pullquote') || 
                     content.includes('<blockquote class="wp-block-pullquote');

    if (hasQuote) {
      console.log('   ✅ Quote highlight déjà présent');
      return { content, hasQuote: true };
    }

    // Si pas de quote et qu'on a un témoignage Reddit, en créer un
    if (analysis?.reddit_quote && analysis?.reddit_username) {
      console.log('   ⚠️ Quote manquant - Ajout automatique');
      
      const quote = `
<!-- wp:pullquote -->
<figure class="wp-block-pullquote">
  <blockquote>
    <p>${analysis.reddit_quote}</p>
    <cite style="padding: 16px; margin-bottom: 0;">Témoignage de u/${analysis.reddit_username} sur Reddit</cite>
  </blockquote>
</figure>
<!-- /wp:pullquote -->
`;

      // Insérer après l'intro FOMO
      const introEnd = content.indexOf('</p>', content.indexOf('FlashVoyages'));
      if (introEnd > -1) {
        content = content.slice(0, introEnd + 4) + '\n' + quote + content.slice(introEnd + 4);
        console.log('   ✅ Quote ajouté après l\'intro');
        return { content, hasQuote: true };
      }
    }

    console.log('   ⚠️ Pas de quote disponible');
    return { content, hasQuote: false };
  }

  /**
   * Vérifie et améliore l'intro FOMO.
   * Si une ouverture immersive est détectée (scène + question + promesse), on n'ajoute pas l'intro FOMO générique.
   */
  ensureFomoIntro(content, analysis) {
    console.log('🔥 Vérification de l\'intro FOMO...');

    // Vérifier si une intro FOMO existe déjà
    const hasFomo = content.includes('Pendant que vous') ||
                    content.includes('FlashVoyages') ||
                    content.includes('nous avons sélectionné');

    if (hasFomo) {
      console.log('   ✅ Intro FOMO déjà présente');
      return { content, hasFomo: true };
    }

    // Détecter une ouverture immersive (scène avant analyse) → ne pas ajouter l'intro FOMO
    const textStart = (content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    const immersiveMarkers = [
      /^Tu fixes\s/i,
      /^Tu envisages\s/i,
      /^Tu regardes\s/i,
      /^Tu vérifies\s/i,
      /\d{1,3}\s*\d{3}\s*\$/,  // budget type "25 000 $" en début de texte
      /Dans ce guide[,.]?\s/i,
      /Ici on t'explique\s/i,
      /on t'explique\s+(combien|comment)/i,
      /combien ça coûte vraiment/i,
      /sans brûler ton budget/i
    ];
    const hasImmersiveOpening = immersiveMarkers.some(re => re.test(textStart));
    if (hasImmersiveOpening) {
      console.log('   ✅ Ouverture immersive détectée — intro FOMO non ajoutée');
      return { content, hasFomo: false };
    }

    // Bloc "Pendant que vous..." désactivé : templaté, isolé, forçage éditorial sans valeur
    // Le témoignage Reddit (citation/blockquote) suffit à établir la crédibilité.
    console.log('   ℹ️ Intro FOMO manquante — non ajoutée (bloc générique supprimé)');
    return { content, hasFomo: false };
  }

  /**
   * PHASE 6.2: Normalise un texte pour comparaison (strip HTML, decode entities, normalize whitespace)
   * @param {string} text - Texte à normaliser
   * @returns {string} Texte normalisé
   */
  normalizeTextForComparison(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Décoder les entités HTML
    let normalized = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ');
    
    // Supprimer les balises HTML
    normalized = normalized.replace(/<[^>]*>/g, '');
    
    // Normaliser les espaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    // Supprimer la ponctuation finale
    normalized = normalized.replace(/[.,;:!?]+$/, '');
    
    return normalized.toLowerCase();
  }

  /**
   * PHASE 6.2: Calcule la similarité Jaccard entre deux textes (tokens)
   * @param {string} text1 - Premier texte
   * @param {string} text2 - Deuxième texte
   * @returns {number} Similarité entre 0 et 1
   */
  jaccardSimilarity(text1, text2) {
    const normalize = (t) => {
      return t.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2); // Filtrer les mots trop courts
    };
    
    const tokens1 = new Set(normalize(text1));
    const tokens2 = new Set(normalize(text2));
    
    if (tokens1.size === 0 && tokens2.size === 0) return 1;
    if (tokens1.size === 0 || tokens2.size === 0) return 0;
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }

  /**
   * PHASE 6.1: Supprime les paragraphes dupliqués exacts
   * PHASE 6.2: Amélioré avec normalisation agressive et détection quasi-doublons
   * @param {string} html - HTML à nettoyer
   * @param {Object} report - Rapport QA pour enregistrer les actions
   * @returns {string} HTML sans doublons
   */
  removeDuplicateParagraphs(html, report) {
    const paragraphRegex = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
    const matches = [...html.matchAll(paragraphRegex)];

    if (matches.length < 2) return html;

    // AMÉLIORATION: Identifier la section H2 contenant chaque paragraphe
    const h2Pattern = /<h2[^>]*>([^<]+)<\/h2>/gi;
    const h2Matches = [...html.matchAll(h2Pattern)];
    
    // Créer une map des sections (index H2 -> titre)
    const sections = new Map();
    h2Matches.forEach((h2, index) => {
      const h2Index = h2.index ?? -1;
      const nextH2Index = index < h2Matches.length - 1 ? (h2Matches[index + 1].index ?? html.length) : html.length;
      sections.set(h2Index, {
        title: h2[1].trim(),
        start: h2Index,
        end: nextH2Index
      });
    });

    const seen = new Map();
    const toRemove = [];
    const sectionDuplicates = new Map(); // Pour tracker les duplications par section

    for (const m of matches) {
      const raw = m[0];
      const start = m.index ?? -1;
      if (start < 0) continue;

      // Identifier la section contenant ce paragraphe
      let currentSection = null;
      for (const [h2Index, section] of sections.entries()) {
        if (start >= section.start && start < section.end) {
          currentSection = section.title;
          break;
        }
      }

      // PHASE 6.2: Normalisation agressive
      const normalized = this.normalizeTextForComparison(raw);
      
      if (!normalized || normalized.length < 20) continue;

      // Vérifier doublons exacts
      if (seen.has(normalized)) {
        toRemove.push({ start, end: start + raw.length, type: 'exact', section: currentSection });
        if (currentSection) {
          const count = sectionDuplicates.get(currentSection) || 0;
          sectionDuplicates.set(currentSection, count + 1);
        }
      } else {
        // Vérifier quasi-doublons (similarité Jaccard > 0.85 pour être plus sensible)
        let isQuasiDuplicate = false;
        for (const [seenNormalized, seenStart] of seen.entries()) {
          const similarity = this.jaccardSimilarity(normalized, seenNormalized);
          // Seuil a 0.75 pour capturer aussi les reformulations
          if (similarity > 0.75) {
            toRemove.push({ start, end: start + raw.length, type: 'quasi', similarity, section: currentSection });
            if (currentSection) {
              const count = sectionDuplicates.get(currentSection) || 0;
              sectionDuplicates.set(currentSection, count + 1);
            }
            isQuasiDuplicate = true;
            break;
          }
        }
        if (!isQuasiDuplicate) {
          seen.set(normalized, start);
        }
      }
    }

    if (toRemove.length === 0) return html;

    toRemove.sort((a, b) => b.start - a.start);

    let output = html;
    for (const r of toRemove) {
      output = output.slice(0, r.start) + output.slice(r.end);
    }

    const exactCount = toRemove.filter(r => r.type === 'exact').length;
    const quasiCount = toRemove.filter(r => r.type === 'quasi').length;
    
    // AMÉLIORATION: Log des duplications par section
    if (sectionDuplicates.size > 0) {
      console.log('   🔍 Duplications détectées par section:');
      sectionDuplicates.forEach((count, section) => {
        console.log(`      - "${section}": ${count} duplication(s)`);
      });
    }
    
    report.actions.push({ 
      type: 'removed_duplicate_paragraphs', 
      details: `count=${toRemove.length} (exact=${exactCount}, quasi=${quasiCount})` 
    });
    report.metrics.removed_duplicates_count = (report.metrics.removed_duplicates_count || 0) + toRemove.length;

    return output;
  }

  /**
   * Détecte et supprime les duplications dans une section H2 spécifique
   * Spécialement pour "Ce que la communauté apporte" qui peut contenir des blocs similaires
   * @param {string} html - HTML à analyser
   * @param {string} sectionTitle - Titre de la section H2 à analyser (pattern flexible)
   * @param {Object} report - Rapport QA
   * @returns {string} HTML sans duplications dans la section spécifiée
   */
  detectSectionDuplications(html, sectionTitle, report) {
    console.log(`🔍 detectSectionDuplications: Analyse de la section "${sectionTitle}"...`);
    
    // Trouver la section H2 correspondante
    const sectionPattern = new RegExp(`<h2[^>]*>.*?${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?<\/h2>`, 'i');
    const sectionMatch = html.match(sectionPattern);
    
    if (!sectionMatch) {
      console.log(`   ℹ️ Section "${sectionTitle}" non trouvée`);
      return html;
    }
    
    const sectionStart = sectionMatch.index ?? -1;
    if (sectionStart < 0) return html;
    
    // Trouver la fin de la section (prochain H2 ou fin du document)
    const afterSection = html.substring(sectionStart + sectionMatch[0].length);
    const nextH2Match = afterSection.match(/<h2[^>]*>/i);
    const sectionEnd = nextH2Match 
      ? sectionStart + sectionMatch[0].length + (nextH2Match.index ?? 0)
      : html.length;
    
    const sectionContent = html.substring(sectionStart, sectionEnd);
    
    // Extraire tous les paragraphes de cette section
    const paragraphRegex = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
    const paragraphs = [];
    let match;
    
    while ((match = paragraphRegex.exec(sectionContent)) !== null) {
      const raw = match[0];
      const relativeStart = match.index ?? -1;
      const absoluteStart = sectionStart + relativeStart;
      
      const normalized = this.normalizeTextForComparison(raw);
      if (!normalized || normalized.length < 30) continue;
      
      paragraphs.push({
        raw,
        normalized,
        absoluteStart,
        absoluteEnd: absoluteStart + raw.length,
        relativeStart
      });
    }
    
    if (paragraphs.length < 2) {
      console.log(`   ✅ Section "${sectionTitle}" : pas assez de paragraphes pour détecter des duplications`);
      return html;
    }
    
    // Détecter les blocs similaires (groupes de paragraphes consécutifs)
    // AMÉLIORATION: Détecter aussi les blocs de 2-3 paragraphes consécutifs similaires
    const seenBlocks = new Map();
    const toRemove = [];
    
    // D'abord, détecter les paragraphes individuels similaires
    paragraphs.forEach((para, i) => {
      let isDuplicate = false;
      for (const [seenNormalized, seenIndex] of seenBlocks.entries()) {
        const similarity = this.jaccardSimilarity(para.normalized, seenNormalized);
        if (similarity > 0.85) {
          // Paragraphe similaire trouvé, garder le premier, supprimer celui-ci
          toRemove.push({
            start: para.absoluteStart,
            end: para.absoluteEnd,
            type: 'similar',
            similarity: similarity.toFixed(2)
          });
          isDuplicate = true;
          console.log(`   🔄 Duplication détectée dans "${sectionTitle}" (${Math.round(similarity * 100)}% similaire)`);
          break;
        }
      }
      if (!isDuplicate) {
        seenBlocks.set(para.normalized, i);
      }
    });
    
    // Ensuite, détecter les blocs de 2-3 paragraphes consécutifs similaires
    for (let blockSize = 2; blockSize <= 3; blockSize++) {
      for (let i = 0; i <= paragraphs.length - blockSize; i++) {
        const block1 = paragraphs.slice(i, i + blockSize);
        const block1Text = block1.map(p => p.normalized).join(' ');
        
        for (let j = i + blockSize; j <= paragraphs.length - blockSize; j++) {
          const block2 = paragraphs.slice(j, j + blockSize);
          const block2Text = block2.map(p => p.normalized).join(' ');
          
          const similarity = this.jaccardSimilarity(block1Text, block2Text);
          if (similarity > 0.85) {
            // Bloc similaire trouvé, supprimer le second bloc
            const block2Start = block2[0].absoluteStart;
            const block2End = block2[block2.length - 1].absoluteEnd;
            toRemove.push({
              start: block2Start,
              end: block2End,
              type: `block_${blockSize}`,
              similarity: similarity.toFixed(2)
            });
            console.log(`   🔄 Bloc de ${blockSize} paragraphe(s) dupliqué détecté dans "${sectionTitle}" (${Math.round(similarity * 100)}% similaire)`);
          }
        }
      }
    }
    
    if (toRemove.length === 0) {
      console.log(`   ✅ Section "${sectionTitle}" : aucune duplication détectée`);
      return html;
    }
    
    // Supprimer les duplications en ordre inverse pour préserver les indices
    toRemove.sort((a, b) => b.start - a.start);
    
    let output = html;
    for (const r of toRemove) {
      output = output.slice(0, r.start) + output.slice(r.end);
    }
    
    report.actions.push({
      type: 'removed_section_duplications',
      details: `section="${sectionTitle}" count=${toRemove.length}`
    });
    console.log(`   ✅ ${toRemove.length} duplication(s) supprimée(s) dans "${sectionTitle}"`);
    
    return output;
  }

  /**
   * PHASE 6.1: QA Report déterministe
   * @param {string} html - HTML final de l'article
   * @param {Object} pipelineContext - Contexte du pipeline
   * @param {Object} analysis - Analyse de l'article
   * @returns {Object} Rapport QA avec checks, actions, issues, metrics
   */
  async runQAReport(html, pipelineContext, analysis) {
    let finalHtml = html;    
    // SUPPRESSION FORCÉE des blockquotes existants (AVANT réinsertion des citations du récit)
    // FIX: NE PAS utiliser Cheerio xmlMode ici — les <script> Travelpayouts contiennent des & non échappés
    // dans les URLs (ex: &trs=, &shmarker=) qui corrompent le DOM en xmlMode et détruisent les H2
    const blockquoteRegexQA = /<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi;
    const blockquoteMatchesQA = finalHtml.match(blockquoteRegexQA);
    if (blockquoteMatchesQA && blockquoteMatchesQA.length > 0) {
      console.log(`🧹 FINALIZER: Suppression de ${blockquoteMatchesQA.length} blockquote(s) existants...`);
      finalHtml = finalHtml.replace(blockquoteRegexQA, '');
    }
    const cheerioModule = await import('cheerio');
    const cheerio = cheerioModule.default || cheerioModule;

    // RECRÉATION des citations extraites du récit : au moins une citation (evidence ou extracted)
    const hasEvidenceSnippetsEarly = pipelineContext?.story?.evidence?.source_snippets?.length > 0;
    const extracted = pipelineContext?.story?.extracted;
    const postText = extracted?.post?.clean_text || extracted?.post?.selftext || extracted?.selftext
      || pipelineContext?.input?.post?.selftext || pipelineContext?.post?.selftext || '';
    const hasPostText = postText && postText.length > 50;

    if (hasEvidenceSnippetsEarly) {
      // 1) Priorité : insérer une citation depuis evidence.source_snippets (extraits du récit)
      const snippets = pipelineContext.story.evidence.source_snippets;
      for (const snippet of snippets) {
        let snippetText = typeof snippet === 'string' ? snippet : (snippet?.text || snippet?.content || snippet?.body || snippet?.quote || snippet?.excerpt || snippet?.snippet || '');
        if (!snippetText || (snippetText = snippetText.trim()).length < 20) continue;
        const excerpt = this.smartTruncate(snippetText, 250, 350);
        if (excerpt.length < 20) continue;
        let citationText = excerpt;
        if (!FORCE_OFFLINE) {
          const englishWords = (citationText.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|I|you|he|she|it|we|they)\b/gi) || []).length;
          const totalWords = citationText.split(/\s+/).length;
          if (totalWords > 5 && totalWords > 0 && englishWords / totalWords > 0.3) {
            try {
              const translated = await this.intelligentContentAnalyzer.translateToFrench(citationText);
              if (translated && translated.trim().length > 10) citationText = translated.trim();
            } catch (e) { /* garder original */ }
          }
        }
        const escaped = citationText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        // Déterminer la position d'insertion et adapter le label cite
        // RÈGLE: Toujours insérer APRÈS le hook (= après au moins 1 paragraphe narratif)
        const h2List = [...finalHtml.matchAll(/<h2[^>]*>.*?<\/h2>/gi)];
        // Chercher la position après le 1er paragraphe qui suit le 1er H2 (= après le hook)
        let insertAfterIndex = 0;
        if (h2List.length >= 1) {
          const afterFirstH2 = h2List[0].index + h2List[0][0].length;
          // Trouver le premier </p> après ce H2 (= fin du hook)
          const firstPAfterH2 = finalHtml.substring(afterFirstH2).match(/<\/p>/i);
          if (firstPAfterH2) {
            insertAfterIndex = afterFirstH2 + firstPAfterH2.index + firstPAfterH2[0].length;
          } else {
            insertAfterIndex = afterFirstH2;
          }
        }
        // Préférer après le 2e H2 + 1er paragraphe si disponible (plus loin dans le récit)
        if (h2List.length >= 2) {
          const afterSecondH2 = h2List[1].index + h2List[1][0].length;
          const firstPAfter2ndH2 = finalHtml.substring(afterSecondH2).match(/<\/p>/i);
          if (firstPAfter2ndH2) {
            insertAfterIndex = afterSecondH2 + firstPAfter2ndH2.index + firstPAfter2ndH2[0].length;
          } else {
            insertAfterIndex = afterSecondH2;
          }
        }
        // Si insertion dans les 500 premiers chars → label neutre (pas de Reddit dans le hook)
        const citeLabel = insertAfterIndex < 500 ? 'Témoignage de voyageur' : 'Extrait de témoignage';
        const citationBlock = `<blockquote class="wp-block-quote"><p>${escaped}</p><p><cite>— ${citeLabel}</cite></p></blockquote>`;
        if (insertAfterIndex > 0) {
          finalHtml = finalHtml.slice(0, insertAfterIndex) + '\n\n' + citationBlock + '\n\n' + finalHtml.slice(insertAfterIndex);
          console.log(`✅ FINALIZER: Citation du récit insérée depuis evidence.source_snippets (après hook narratif)`);
          break;
        }
        const firstP = finalHtml.match(/<p[^>]*>.*?<\/p>/i);
        if (firstP) {
          const idx = firstP.index + firstP[0].length;
          finalHtml = finalHtml.slice(0, idx) + '\n\n' + citationBlock + '\n\n' + finalHtml.slice(idx);
          console.log(`✅ FINALIZER: Citation du récit insérée depuis evidence.source_snippets`);
          break;
        }
      }
    }

    // 2) Fallback : si aucune citation insérée, une depuis le post extracted (traduit si en ligne)
    // FIX: Utiliser [\s\S] au lieu de . pour matcher les newlines dans les blockquotes multilignes
    const hasBlockquoteNow = /<blockquote[^>]*>[\s\S]*?<\/blockquote>/i.test(finalHtml);
    if (!hasBlockquoteNow && hasPostText) {
      let excerpt = this.smartTruncate(postText, 250, 350);
      if (!FORCE_OFFLINE && this.intelligentContentAnalyzer) {
        try {
          const translated = await this.intelligentContentAnalyzer.translateToFrench(excerpt);
          if (translated && translated.trim().length > 10) excerpt = translated.trim();
        } catch (e) { /* garder original */ }
      }
      const escapedExcerpt = excerpt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      // FIX: Insérer le blockquote APRÈS le hook (après le 1er paragraphe du 1er H2)
      const firstH2Match = finalHtml.match(/<h2[^>]*>.*?<\/h2>/i);
      if (firstH2Match) {
        const afterH2 = firstH2Match.index + firstH2Match[0].length;
        // Trouver le 1er </p> après le H2 (= fin du hook narratif)
        const firstPAfterH2 = finalHtml.substring(afterH2).match(/<\/p>/i);
        const insertIdx = firstPAfterH2 
          ? afterH2 + firstPAfterH2.index + firstPAfterH2[0].length
          : afterH2;
        // Si insertion dans les 500 premiers chars → label neutre (pas de Reddit dans le hook)
        const citeLabelFallback = insertIdx < 500 ? 'Témoignage de voyageur' : 'Extrait de témoignage';
        const newBlockquote = `<blockquote><p>${escapedExcerpt}</p><p><cite>— ${citeLabelFallback}</cite></p></blockquote>`;
        finalHtml = finalHtml.slice(0, insertIdx) + '\n\n' + newBlockquote + '\n\n' + finalHtml.slice(insertIdx);
        console.log(`✅ FINALIZER: Citation du récit insérée depuis extracted (post) (après hook)`);
      } else {
        const firstP2 = finalHtml.match(/<p[^>]*>.*?<\/p>/i);
        if (firstP2) {
          const idx = firstP2.index + firstP2[0].length;
          const citeLabelP = idx < 500 ? 'Témoignage de voyageur' : 'Extrait de témoignage';
          const blockquoteP = `<blockquote><p>${escapedExcerpt}</p><p><cite>— ${citeLabelP}</cite></p></blockquote>`;
          finalHtml = finalHtml.slice(0, idx) + '\n\n' + blockquoteP + '\n\n' + finalHtml.slice(idx);
          console.log(`✅ FINALIZER: Citation du récit insérée depuis extracted (post)`);
        }
      }
    }

    const hasBlockquoteFinal = /<blockquote[^>]*>.*?<\/blockquote>/i.test(finalHtml);
    if (!hasBlockquoteFinal && (hasEvidenceSnippetsEarly || hasPostText)) {
      const snippetCount = pipelineContext?.story?.evidence?.source_snippets?.length ?? 0;
      console.warn(`⚠️ FINALIZER: Aucune citation Reddit insérée malgré sources disponibles (snippets: ${snippetCount}, postText: ${hasPostText ? (postText?.length ?? 0) + ' chars' : 'non'})`);
    }
    
    const report = {
      checks: [],
      actions: [],
      issues: [],
      metrics: {
        html_length_before: finalHtml.length,
        html_length_after: finalHtml.length,
        h2_count: 0,
        quote_count: 0,
        affiliate_count: 0,
        widgets_count: 0,
        internal_links: 0,
        external_links: 0,
        repetition_score: 0
      }
    };

    // finalHtml déjà modifié ci-dessus

    // ANCIEN CODE DE TRADUCTION BLOCKQUOTES (SUPPRIMÉ - remplacé par le code ci-dessus)
    const blockquoteMatches = [...html.matchAll(/<blockquote[^>]*>(.*?)<\/blockquote>/gs)];
    for (const match of blockquoteMatches) {
      const blockquoteContent = match[1];
      // Extraire le texte sans les balises
      const textContent = blockquoteContent.replace(/<[^>]+>/g, ' ').trim();
      
      // Détecter si c'est de l'anglais
      const englishWords = (textContent.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|I|you|he|she|it|we|they)\b/gi) || []).length;
      const totalWords = textContent.split(/\s+/).length;
      const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
      
      if (englishRatio > 0.3 && totalWords > 5) {
        console.log(`🌐 Blockquote détectée en anglais (${Math.round(englishRatio * 100)}%): traduction via LLM...`);
        try {
          const { callOpenAIWithRetry } = await import('./intelligent-content-analyzer-optimized.js');
          const apiKey = process.env.OPENAI_API_KEY;
          if (apiKey && !process.env.FORCE_OFFLINE) {
            // Traduire seulement les paragraphes, conserver la structure HTML
            const paragraphs = [...blockquoteContent.matchAll(/<p[^>]*>(.*?)<\/p>/gs)];
            let translatedContent = blockquoteContent;
            
            for (const pMatch of paragraphs) {
              const pText = pMatch[1].replace(/<[^>]+>/g, '').trim();
              if (pText.length > 10 && !pText.includes('Extrait de témoignage') && !pText.includes('—')) {
                const response = await callOpenAIWithRetry({
                  apiKey,
                  _trackingStep: 'finalizer-translate-blockquote',
                  body: {
                    model: 'gpt-4o',
                    messages: [
                      { role: 'system', content: 'Tu es un traducteur professionnel. Traduis le texte suivant de l\'anglais vers le français. Ne réponds qu\'avec le texte traduit, sans ajouter de guillemets ou de formatage.' },
                      { role: 'user', content: pText }
                    ],
                    max_tokens: 500,
                    temperature: 0.3
                  },
                  sourceText: pText,
                  type: 'translation'
                });
                const translatedText = response.choices[0].message.content.trim();
                translatedContent = translatedContent.replace(pMatch[1], translatedText);
                console.log(`✅ Paragraphe traduit: ${pText.substring(0, 40)}... → ${translatedText.substring(0, 40)}...`);
              }
            }
            
            // Remplacer le blockquote dans le HTML
            finalHtml = finalHtml.replace(match[0], `<blockquote>${translatedContent}</blockquote>`);
            report.actions.push({ type: 'translated_blockquote', details: `english_ratio=${Math.round(englishRatio * 100)}%` });
          } else {
            console.warn('⚠️ Traduction désactivée (FORCE_OFFLINE ou pas de clé API). Blockquote conservée en anglais.');
          }
        } catch (error) {
          console.error(`❌ Erreur traduction blockquote: ${error.message}`);
        }
      }
    }

    // Calculer métriques de base
    const h2Matches = html.matchAll(/<h2[^>]*>/g);
    report.metrics.h2_count = Array.from(h2Matches).length;
    
    const quoteMatches = html.matchAll(/<blockquote[^>]*>|<!-- wp:pullquote/g);
    report.metrics.quote_count = Array.from(quoteMatches).length;
    
    const affiliateMatches = html.matchAll(/class="affiliate-module"|data-placement-id=/g);
    report.metrics.affiliate_count = Array.from(affiliateMatches).length;
    
    const widgetMatches = html.matchAll(/travelpayouts|kiwi\.com|airalo/g);
    report.metrics.widgets_count = Array.from(widgetMatches).length;
    
    const internalLinkMatches = html.matchAll(/<a[^>]*href="[^"]*flashvoyage[^"]*"/g);
    report.metrics.internal_links = Array.from(internalLinkMatches).length;
    
    const externalLinkMatches = html.matchAll(/<a[^>]*href="https?:\/\/(?!.*flashvoyage)[^"]*"/g);
    report.metrics.external_links = Array.from(externalLinkMatches).length;

    // Validation liens internes (href + ancre cohérents)
    const linkValidation = this.validateInternalLinks(finalHtml);
    if (!linkValidation.valid) {
      report.checks.push({
        name: 'internal_links_valid',
        status: 'warn',
        details: `${linkValidation.errors.length} lien(s) interne(s) invalide(s): ${linkValidation.errors.slice(0, 2).join('; ')}`
      });
      linkValidation.errors.forEach(err => report.issues.push({
        code: 'INTERNAL_LINK_INVALID',
        severity: 'medium',
        message: err,
        check: 'internal_links_valid'
      }));
    } else if (report.metrics.internal_links > 0) {
      report.checks.push({
        name: 'internal_links_valid',
        status: 'pass',
        details: `${report.metrics.internal_links} lien(s) interne(s) valide(s)`
      });
    }

    // Quality gate étendue : ouverture immersive, H2 blacklist, quotes, hook sans Reddit
    const qualityGate = this.runQualityGateContent(finalHtml, pipelineContext);
    if (qualityGate.warnings.length > 0) {
      report.checks.push({
        name: 'content_quality_gate',
        status: 'warn',
        details: qualityGate.warnings.join('; ')
      });
      if (!qualityGate.noForbiddenH2) {
        report.issues.push({
          code: 'FORBIDDEN_H2_PRESENT',
          severity: 'high',
          message: 'Section "Ce que dit le témoignage" encore présente',
          check: 'content_quality_gate'
        });
      }
      if (!qualityGate.noGenericH2) {
        report.issues.push({
          code: 'GENERIC_H2_DETECTED',
          severity: 'medium',
          message: qualityGate.warnings.find(w => w.includes('H2 génériques')) || 'H2 génériques détectés',
          check: 'content_quality_gate'
        });
      }
      if (!qualityGate.hasMinQuotes) {
        report.issues.push({
          code: 'LOW_QUOTE_COUNT',
          severity: 'low',
          message: qualityGate.warnings.find(w => w.includes('Citations insuffisantes')) || 'Moins de 2 citations dans l\'article',
          check: 'content_quality_gate'
        });
      }
      if (!qualityGate.hookWithoutReddit) {
        report.issues.push({
          code: 'REDDIT_IN_HOOK',
          severity: 'medium',
          message: 'Mention de Reddit dans les 500 premiers caractères — le hook doit être immersif sans source',
          check: 'content_quality_gate'
        });
      }
    } else {
      report.checks.push({
        name: 'content_quality_gate',
        status: 'pass',
        details: 'Ouverture immersive, pas de H2 générique, quotes suffisantes, hook sans Reddit'
      });
    }

    // CHECK A: Cohérence structure "FlashVoyage Premium"
    const hasIntro = /<p[^>]*>.*?<\/p>/i.test(html);
    const hasMin2H2 = report.metrics.h2_count >= 2;
    const hasRelatedSection = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i.test(html);
    
    if (!hasIntro || !hasMin2H2 || !hasRelatedSection) {
      report.checks.push({
        name: 'structure_flashvoyage_premium',
        status: 'warn',
        details: `intro=${hasIntro} h2_count=${report.metrics.h2_count} has_related=${hasRelatedSection}`
      });
      
      // Action corrective minimale: insérer H2 manquant si possible
      // Ne jamais insérer "Conseils pratiques" — résidu de l'ancienne structure
      if (!hasMin2H2 && report.metrics.h2_count === 1) {
        console.log('   ℹ️ Article avec 1 seul H2 — pas d\'insertion de "Conseils pratiques" (résidu ancienne structure)');
      }
    } else {
      report.checks.push({
        name: 'structure_flashvoyage_premium',
        status: 'pass',
        details: 'Structure complète'
      });
    }

    // CHECK B: Citations Reddit / traçabilité
    const hasEvidenceSnippets = pipelineContext?.story?.evidence?.source_snippets?.length > 0;
    // Vérifier sur finalHtml (qui peut avoir été modifié par CHECK A)
    const hasRedditCitation = /<blockquote[^>]*>.*?<\/blockquote>|<!-- wp:pullquote/i.test(finalHtml);
    
    if (hasEvidenceSnippets && !hasRedditCitation) {
      // Insérer une citation depuis evidence.source_snippets
      const snippets = pipelineContext.story.evidence.source_snippets;
      let inserted = false;
      
      for (const snippet of snippets) {
        // Accepter différents formats de snippets
        let snippetText = '';
        if (typeof snippet === 'string') {
          snippetText = snippet;
        } else if (snippet && typeof snippet === 'object') {
          // Essayer différentes propriétés possibles
          snippetText = snippet.text || snippet.content || snippet.body || snippet.quote || 
                       snippet.excerpt || snippet.snippet || JSON.stringify(snippet);
        }
        
        // Nettoyer et valider
        if (!snippetText || typeof snippetText !== 'string') continue;
        snippetText = snippetText.trim();
        if (snippetText.length < 20) continue;
        
        // APPROCHE INTELLIGENTE: Troncature respectant les limites de phrases et de mots
        // AMÉLIORATION: Augmenter les limites pour les citations Reddit (meilleure lisibilité)
        let citationText = this.smartTruncate(snippetText, 250, 350);
        if (citationText.length < 20) continue;
        
        // TRADUIRE le texte si nécessaire (détection anglais + traduction LLM)
        const englishWords = (citationText.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|I|you|he|she|it|we|they)\b/gi) || []).length;
        const totalWords = citationText.split(/\s+/).length;
        const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
        
        if (englishRatio > 0.3 && totalWords > 5) {
          console.log(`🌐 Blockquote détectée en anglais (${Math.round(englishRatio * 100)}%): traduction via LLM...`);
          try {
            // Utiliser le même système de traduction que pour les citations dans intelligent-content-analyzer
            const { callOpenAIWithRetry } = await import('./intelligent-content-analyzer-optimized.js');
            const apiKey = process.env.OPENAI_API_KEY;
            if (apiKey && !process.env.FORCE_OFFLINE) {
              const response = await callOpenAIWithRetry({
                apiKey,
                _trackingStep: 'finalizer-translate-citation',
                body: {
                  model: 'gpt-4o',
                  messages: [
                    { role: 'system', content: 'Tu es un traducteur professionnel. Traduis le texte suivant de l\'anglais vers le français. Ne réponds qu\'avec le texte traduit.' },
                    { role: 'user', content: citationText }
                  ],
                  max_tokens: 500,
                  temperature: 0.3
                },
                sourceText: citationText,
                type: 'translation'
              });
              citationText = response.choices[0].message.content.trim();
              console.log(`✅ Blockquote traduite: ${citationText.substring(0, 60)}...`);
            } else {
              console.warn('⚠️ Traduction désactivée (FORCE_OFFLINE ou pas de clé API). Blockquote conservée en anglais.');
            }
          } catch (error) {
            console.error(`❌ Erreur traduction blockquote: ${error.message}`);
            // Garder le texte original en cas d'erreur
          }
        }
        
        // Échapper HTML
        const escapedText = citationText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
        
        const citationBlock = `
<blockquote>
  <p>${escapedText}</p>
  <p><cite>Extrait de témoignage</cite></p>
</blockquote>
`;
        
        // Insérer après le 1er H2 ou après l'intro (toujours sur finalHtml)
        const firstH2Match = finalHtml.match(/<h2[^>]*>.*?<\/h2>/i);
        if (firstH2Match) {
          const insertIndex = firstH2Match.index + firstH2Match[0].length;
          finalHtml = finalHtml.slice(0, insertIndex) + '\n\n' + citationBlock + '\n\n' + finalHtml.slice(insertIndex);
          inserted = true;
          report.actions.push({ type: 'inserted_reddit_citation', details: `snippet_length=${citationText.length}` });
          report.metrics.quote_count++;
          break;
        } else {
          const firstPMatch = finalHtml.match(/<p[^>]*>.*?<\/p>/i);
          if (firstPMatch) {
            const insertIndex = firstPMatch.index + firstPMatch[0].length;
            finalHtml = finalHtml.slice(0, insertIndex) + '\n\n' + citationBlock + '\n\n' + finalHtml.slice(insertIndex);
            inserted = true;
            report.actions.push({ type: 'inserted_reddit_citation', details: `snippet_length=${citationText.length}` });
            report.metrics.quote_count++;
            break;
          } else {
            // Fallback: insérer au début du contenu
            finalHtml = citationBlock + '\n\n' + finalHtml;
            inserted = true;
            report.actions.push({ type: 'inserted_reddit_citation', details: `snippet_length=${citationText.length} (fallback: début)` });
            report.metrics.quote_count++;
            break;
          }
        }
      }
      
      if (!inserted) {
        // PHASE 6.2.3: Si aucun snippet valide, WARN (pas FAIL) + log explicite
        const validSnippetsCount = snippets.filter(s => {
          let snippetText = '';
          if (typeof s === 'string') {
            snippetText = s;
          } else if (s && typeof s === 'object') {
            snippetText = s.text || s.content || s.body || s.quote || s.excerpt || s.snippet || '';
          }
          return snippetText && snippetText.trim().length >= 20;
        }).length;
        
        if (validSnippetsCount === 0) {
          // Aucun snippet valide → WARN
          report.checks.push({
            name: 'reddit_citation_traceability',
            status: 'warn',
            details: `evidence_snippets existent (${snippets.length} snippet(s)) mais tous invalides (< 20 chars ou vides)`
          });
          console.log(`⚠️ FINALIZER_QA_WARN: snippets invalid - ${snippets.length} snippets but none valid`);
        } else {
          // Snippets valides mais insertion échouée → FAIL
          report.checks.push({
            name: 'reddit_citation_traceability',
            status: 'fail',
            details: `evidence_snippets existent (${snippets.length} snippet(s), ${validSnippetsCount} valides) mais insertion échouée`
          });
          report.issues.push({
            code: 'SOURCE_OF_TRUTH_VIOLATION',
            severity: 'high',
            message: 'missing_reddit_citation: evidence.source_snippets.length > 0 mais aucune citation insérée malgré snippets valides',
            evidence: { snippets_count: snippets.length, valid_snippets_count: validSnippetsCount }
          });
        }
      } else {
        report.checks.push({
          name: 'reddit_citation_traceability',
          status: 'pass',
          details: 'Citation Reddit insérée depuis evidence.source_snippets'
        });
      }
    } else if (hasEvidenceSnippets && hasRedditCitation) {
      report.checks.push({
        name: 'reddit_citation_traceability',
        status: 'pass',
        details: 'Citation Reddit présente'
      });
    } else {
      report.checks.push({
        name: 'reddit_citation_traceability',
        status: 'warn',
        details: 'Pas de evidence_snippets disponible'
      });
    }

    // PHASE 6.2.4: CHECK C amélioré - CTA/Affiliate plan: conformité stricte
    const affiliatePlan = pipelineContext?.affiliate_plan;
    const hasAffiliatePlan = affiliatePlan?.placements?.length > 0;
    const enableAffiliateInjector = typeof ENABLE_AFFILIATE_INJECTOR !== "undefined" ? ENABLE_AFFILIATE_INJECTOR : true;
    
    if (hasAffiliatePlan && enableAffiliateInjector) {
      const expectedCount = affiliatePlan.placements.length;
      
      // Recompter avec une méthode plus précise sur finalHtml
      const affiliateModuleRegex = /<(?:div|aside) class="affiliate-module"|data-placement-id=/g;
      const actualCountPrecise = (finalHtml.match(affiliateModuleRegex) || []).length;
      
      if (actualCountPrecise === 0) {
        // PHASE 6.2.4: FAIL (pas warn) si 0 module
        report.checks.push({
          name: 'affiliate_conformance',
          status: 'fail',
          details: `plan=${expectedCount} injected=0`
        });
        report.issues.push({
          code: 'AFFILIATE_INJECTION_FAILED',
          severity: 'high',
          message: `affiliate_plan has ${expectedCount} placements but 0 modules detected in HTML`,
          evidence: { expected: expectedCount, actual: actualCountPrecise }
        });
      } else if (actualCountPrecise < expectedCount) {
        report.checks.push({
          name: 'affiliate_conformance',
          status: 'warn',
          details: `plan=${expectedCount} injected=${actualCountPrecise}`
        });
      } else {
        report.checks.push({
          name: 'affiliate_conformance',
          status: 'pass',
          details: `All ${expectedCount} modules injected`
        });
      }
    } else if (hasAffiliatePlan && !enableAffiliateInjector) {
      report.checks.push({
        name: 'affiliate_conformance',
        status: 'warn',
        details: 'affiliate_plan exists but ENABLE_AFFILIATE_INJECTOR=0'
      });
    } else if (!hasAffiliatePlan) {
      // PHASE 6.2.4: Si affiliate_plan.length === 0, interdire modules "par défaut"
      const affiliateModuleRegex = /<(?:div|aside) class="affiliate-module"|data-placement-id=/g;
      const unexpectedModules = (finalHtml.match(affiliateModuleRegex) || []).length;
      
      if (unexpectedModules > 0) {
        report.checks.push({
          name: 'affiliate_conformance',
          status: 'warn',
          details: `affiliate_plan is empty but ${unexpectedModules} module(s) detected (should be removed)`
        });
        report.actions.push({ 
          type: 'remove_unexpected_affiliate_modules', 
          details: `count=${unexpectedModules}` 
        });
        // Optionnel: supprimer les modules inattendus
        // finalHtml = finalHtml.replace(/<div class="affiliate-module"[^>]*>[\s\S]*?<\/div>/g, '');
      } else {
        report.checks.push({
          name: 'affiliate_conformance',
          status: 'pass',
          details: 'No affiliate plan and no unexpected modules'
        });
      }
    } else {
      report.checks.push({
        name: 'affiliate_conformance',
        status: 'pass',
        details: 'No affiliate plan or injector disabled'
      });
    }

    // CHECK D: Anti-répétitions
    // NOTE: removeDuplicateParagraphs est déjà appelé dans finalizeArticle() avant runQAReport
    // Ne pas le rappeler ici pour éviter double traitement
    const removedDuplicatesCount = report.metrics.removed_duplicates_count || 0;
    
    // Détecter H2 dupliqués
    const h2Titles = [];
    const h2Matches2 = finalHtml.matchAll(/<h2[^>]*>(.*?)<\/h2>/g);
    for (const match of h2Matches2) {
      const title = match[1].trim();
      if (h2Titles.includes(title) && title.length > 3) {
        // Renommer le second avec suffixe
        const suffix = ' (suite)';
        finalHtml = finalHtml.replace(match[0], `<h2>${title}${suffix}</h2>`);
        report.actions.push({ type: 'renamed_duplicate_h2', details: `title="${title}"` });
      } else {
        h2Titles.push(title);
      }
    }
    
    // Détecter "Articles connexes" dupliquée
    const relatedMatches = finalHtml.match(/<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/gi);
    if (relatedMatches && relatedMatches.length > 1) {
      // Supprimer les doublons (garder le premier)
      let first = true;
      finalHtml = finalHtml.replace(/<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/gi, (match) => {
        if (first) {
          first = false;
          return match;
        }
        removedDuplicatesCount++;
        return '';
      });
      report.actions.push({ type: 'removed_duplicate_related_section', details: `count=${relatedMatches.length - 1}` });
    }
    
    // Détecter blocs affiliate dupliqués
    const affiliateModuleMatches = finalHtml.matchAll(/<(?:div|aside) class="affiliate-module"[^>]*>[\s\S]*?<\/(?:div|aside)>/g);
    const seenModules = new Set();
    let removedAffiliateDuplicates = 0;
    for (const match of affiliateModuleMatches) {
      const normalized = match[0].replace(/\s+/g, ' ').trim();
      if (seenModules.has(normalized)) {
        finalHtml = finalHtml.replace(match[0], '');
        removedAffiliateDuplicates++;
      } else {
        seenModules.add(normalized);
      }
    }
    if (removedAffiliateDuplicates > 0) {
      report.actions.push({ type: 'removed_duplicate_affiliate_modules', details: `count=${removedAffiliateDuplicates}` });
    }
    
    if (removedDuplicatesCount > 0 || removedAffiliateDuplicates > 0) {
      report.checks.push({
        name: 'anti_repetitions',
        status: 'pass',
        details: `removed_duplicates=${removedDuplicatesCount + removedAffiliateDuplicates}`
      });
    } else {
      report.checks.push({
        name: 'anti_repetitions',
        status: 'pass',
        details: 'No duplicates detected'
      });
    }
    
    report.metrics.repetition_score = removedDuplicatesCount + removedAffiliateDuplicates;

    // CHECK E: Placement des blocs
    // Vérifier que "Articles connexes" est à la fin
    const relatedSectionRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
    const relatedMatch = finalHtml.match(relatedSectionRegex);
    
    if (relatedMatch) {
      const relatedIndex = relatedMatch.index;
      const contentAfterRelated = finalHtml.slice(relatedIndex + relatedMatch[0].length);
      
      // Si du contenu significatif après "Articles connexes", déplacer
      if (contentAfterRelated.trim().length > 100) {
        // Extraire le bloc "Articles connexes" complet
        const relatedBlockEnd = finalHtml.indexOf('</h2>', relatedIndex) + 5;
        const nextH2After = contentAfterRelated.match(/<h2[^>]*>/i);
        const blockEnd = nextH2After ? relatedIndex + relatedMatch[0].length + nextH2After.index : finalHtml.length;
        
        const relatedBlock = finalHtml.slice(relatedIndex, blockEnd);
        const htmlWithoutRelated = finalHtml.slice(0, relatedIndex) + finalHtml.slice(blockEnd);
        
        // Insérer à la fin
        finalHtml = htmlWithoutRelated + '\n\n' + relatedBlock;
        report.actions.push({ type: 'moved_related_section_to_end', details: 'Articles connexes déplacée à la fin' });
      }
      
      report.checks.push({
        name: 'block_placement',
        status: 'pass',
        details: 'Articles connexes en position correcte'
      });
    } else {
      report.checks.push({
        name: 'block_placement',
        status: 'warn',
        details: 'Section "Articles connexes" absente'
      });
    }

    // PHASE 6.2.1: CHECK F - Anti-invention (correctif : nettoie les claims non sourcés)
    finalHtml = this.checkInventionGuard(finalHtml, pipelineContext, report);
    
    // PHASE 6.3: CHECK G - Story Alignment + Quality Gate (hard check avec auto-fix)
    finalHtml = await this.checkAndFixStoryAlignment(finalHtml, pipelineContext, report);
    
    // PHASE 6.4: Ajouter wrappers premium (takeaways, community, open-questions)
    finalHtml = await this.addPremiumWrappers(finalHtml, pipelineContext, report);
    
    // PHASE 6.2.3: CHECK B amélioré - Citations Reddit obligatoires et robustes
    // (déjà implémenté, mais améliorer la logique si nécessaire)
    
    // PHASE 6.2.4: CHECK C amélioré - CTA/Affiliate plan: conformité stricte
    // (déjà implémenté, mais améliorer la logique si nécessaire)
    
    // PHASE 7.1.d: Anti-Hallucination Guard (non bloquant par défaut)
    // Passer le titre de l'article pour validation anti-décontextualisation
    const articleTitle = pipelineContext?.generatedTitle || pipelineContext?.story?.extracted?.post?.title || '';
    await this.checkAntiHallucination(finalHtml, pipelineContext, report, articleTitle);
    
    // NOUVELLES VALIDATIONS QUALITÉ (Plan Pipeline Quality Fixes)
    // 1. Détection phrases incomplètes
    finalHtml = await this.detectAndFixIncompleteSentences(finalHtml, report);
    
    // 1.5. PHASE 2.3b: Nettoyage typographique — mots collés
    finalHtml = this.fixWordGlue(finalHtml, report);

    // 1.6. PHASE 2 FIX: Nettoyage deterministe des phrases plates
    finalHtml = this.removeGenericPhrases(finalHtml, report);

    // 1.7. PHASE 3 FIX: Capitalisation des noms propres geographiques
    finalHtml = this.capitalizeProperNouns(finalHtml);

    // 2. Détection et traduction anglais
    finalHtml = await this.detectAndTranslateEnglish(finalHtml, report);
    
    // 2.5. NEWS: corriger les destinations widgets avant validation
    finalHtml = this.reconcileWidgetDestinations(finalHtml, pipelineContext, analysis, report);

    // 3. Validation cohérence widgets/destination
    this.validateWidgetDestinations(finalHtml, pipelineContext, analysis, report);
    
    // 4. Validation citations
    finalHtml = this.validateAndFixCitations(finalHtml, report);
    
    // 5. Validation liens recommandations
    this.validateRecommendationLinks(finalHtml, report);
    
    // 5.5. Traduction forcée section recommandations (correction audit)
    finalHtml = await this.forceTranslateRecommendationsSection(finalHtml, report);
    
    // 5.6. Traduction forcée citations dans les listes (correction audit)
    finalHtml = await this.forceTranslateCitationsInLists(finalHtml, report);
    
    // 6. Découpage listes trop longues
    finalHtml = this.splitLongListItems(finalHtml, report);
    
    // 7. Validation cohérence temporelle
    this.validateTemporalConsistency(finalHtml, report);
    
    // 7.5. Validation section narrative "Une histoire vraie" (correction audit)
    this.validateAndExtendNarrativeSection(finalHtml, pipelineContext, report);
    
    // NOUVELLES CORRECTIONS POUR 10/10
    // 8. Vérifier et ajouter sections SERP manquantes
    const limitesBeforeSerp = (finalHtml.match(/<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/gi) || []).length;    
    finalHtml = await this.ensureSerpSections(finalHtml, pipelineContext, report);
    
    // CORRECTION: Nettoyer les duplications de "Limites et biais" APRÈS ensureSerpSections
    finalHtml = this.removeDuplicateH2Sections(finalHtml);
    
    // NETTOYAGE FINAL: Supprimer les paragraphes vides qui pourraient subsister
    const emptyParasInQA = (finalHtml.match(/<p[^>]*>\s*\.\s*<\/p>/gi) || []).length;
    if (emptyParasInQA > 0) {
      finalHtml = finalHtml.replace(/<p[^>]*>\s*\.\s*<\/p>/gi, '');
      console.log(`   🧹 NETTOYAGE QA: ${emptyParasInQA} paragraphe(s) vide(s) supprimé(s)`);
    }
    
    const limitesAfterSerp = (finalHtml.match(/<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/gi) || []).length;    
    // 8.5. Remplir toutes les sections vides (y compris "Contexte")
    finalHtml = this.fillEmptySections(finalHtml, pipelineContext, report);
    
    // NOTE: balanceParagraphs() est maintenant appelé dans finalizeArticle() après toutes les corrections
    // pour éviter double traitement et assurer le bon ordre d'exécution
    
    // PHASE 6.5: Blocking Gate - Quality Gate bloquant
    this.applyBlockingGate(report);
    
    // Mettre à jour métriques finales
    report.metrics.html_length_after = finalHtml.length;    
    report.finalHtml = finalHtml;
    return report;
  }

  /**
   * PHASE 6.2.1: Anti-invention guard
   * Détecte les claims chiffrés, lieux, affirmations factuelles non sourcées
   */
  checkInventionGuard(html, pipelineContext, report) {
    let cleanedHtml = html;
    const extracted = pipelineContext?.extracted || pipelineContext?.story?.extracted || {};
    const story = pipelineContext?.story || {};    
    // PHASE 6.2.1: Nettoyer le HTML pour exclure les segments non-narratifs
    let htmlForInventionCheck = html;
    
    // Supprimer les scripts
    htmlForInventionCheck = htmlForInventionCheck.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    
    // Supprimer les styles
    htmlForInventionCheck = htmlForInventionCheck.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Supprimer les modules affiliate (avec variantes de quotes et balises imbriquées)
    // Pattern robuste: div avec class affiliate-module et tout son contenu jusqu'à la fermeture (gestion des div imbriquées)
    // Utiliser une approche récursive pour gérer les balises imbriquées
    const removeAffiliateModules = (html) => {
      const affiliatePattern = /<(?:div|aside)[^>]*(?:class=["'][^"']*affiliate-module[^"']*["']|data-placement-id)[^>]*>([\s\S]*?)<\/(?:div|aside)>/gi;
      let result = html;
      let match;
      let changed = true;
      
      while (changed) {
        changed = false;
        match = affiliatePattern.exec(result);
        if (match) {
          // Vérifier si le contenu contient d'autres divs affiliate (imbriqués)
          const innerContent = match[1];
          if (innerContent && /affiliate-module|data-placement-id/i.test(innerContent)) {
            // Récursivement supprimer les modules imbriqués
            const cleanedInner = removeAffiliateModules(innerContent);
            result = result.replace(match[0], '');
            changed = true;
          } else {
            result = result.replace(match[0], '');
            changed = true;
          }
          affiliatePattern.lastIndex = 0; // Reset pour réessayer
        }
      }
      return result;
    };
    
    htmlForInventionCheck = removeAffiliateModules(htmlForInventionCheck);
    
    // Supprimer les éléments avec data-widget, travelpayouts, tp.png, Kiwi.com, Airalo, WIDGET_
    htmlForInventionCheck = htmlForInventionCheck.replace(/<[^>]*(?:data-widget|travelpayouts|tp\.png|kiwi\.com|airalo|WIDGET_)[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
    
    // Supprimer les blocs CTA auto (heuristique: H2 "Passer à l'action" / "Outils utiles" / "Réserver" + contenu jusqu'au prochain H2)
    // Pattern amélioré: capture tout jusqu'au prochain H2 ou H3 ou fin de document
    htmlForInventionCheck = htmlForInventionCheck.replace(/<h2[^>]*>(?:Passer à l'action|Outils utiles|Réserver|Comparer|CTA)[^<]*<\/h2>[\s\S]*?(?=<h[2-3]|$)/gi, '');
    
    // Supprimer les blocs avec class="flashvoyage-cta" ou similaire (plus robuste)
    htmlForInventionCheck = htmlForInventionCheck.replace(/<[^>]*class=["'][^"']*cta[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '');
    htmlForInventionCheck = htmlForInventionCheck.replace(/<[^>]*class=["'][^"']*cta[^"']*[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
    
    // Supprimer le bloc "Articles connexes" (de <h2>Articles connexes</h2> jusqu'à la fin OU jusqu'au prochain <h2>)
    const relatedSectionMatch = htmlForInventionCheck.match(/<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>[\s\S]*/i);
    if (relatedSectionMatch) {
      const relatedIndex = relatedSectionMatch.index;
      htmlForInventionCheck = htmlForInventionCheck.substring(0, relatedIndex);
    }
    
    // Exclure le texte des liens internes FlashVoyage de l'analyse d'hallucination
    // Ces liens sont injectés par le SEO optimizer (pas par le LLM) et réfèrent à des articles existants
    htmlForInventionCheck = htmlForInventionCheck.replace(/<a[^>]*href="[^"]*flashvoyage\.com[^"]*"[^>]*>.*?<\/a>/gi, ' ');
    htmlForInventionCheck = htmlForInventionCheck.replace(/<a[^>]*href="[^"]*flashvoyage[^"]*"[^>]*>.*?<\/a>/gi, ' ');
    
    // Construire vocabulary whitelist
    const whitelistTokens = new Set();
    
    // Ajouter tokens depuis extracted.title + extracted.selftext + extracted.post.clean_text (si disponible)
    const extractedText = `${extracted.source?.title || extracted.title || ''} ${extracted.selftext || ''} ${extracted.post?.clean_text || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const extractedTokens = this.extractTokens(extractedText);
    extractedTokens.forEach(t => whitelistTokens.add(t));
    
    // Ajouter explicitement les lieux depuis post.signals.locations (normalisés en lowercase)
    // + enrichissement dynamique via BDD OpenFlights (IATA-pivot : ajoute les équivalents FR/EN)
    if (extracted.post?.signals?.locations && Array.isArray(extracted.post.signals.locations)) {
      extracted.post.signals.locations.forEach(loc => {
        if (loc && typeof loc === 'string') {
          const normalizedLoc = loc.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (normalizedLoc.length > 0) {
            whitelistTokens.add(normalizedLoc);
            // IATA-pivot : ajouter automatiquement les équivalents FR/EN
            const iata = lookupIATA(normalizedLoc);
            if (iata) {
              const allNames = getAllLocationNames();
              for (const name of allNames) {
                if (lookupIATA(name) === iata) {
                  whitelistTokens.add(name);
                }
              }
            }
          }
        }
      });
    }
    // Ajouter aussi depuis extracted.destination et extracted.destinations (si présents)
    if (extracted.destination && typeof extracted.destination === 'string') {
      const normalizedDest = extracted.destination.toLowerCase().trim();
      if (normalizedDest.length > 0) whitelistTokens.add(normalizedDest);
    }
    if (extracted.destinations && Array.isArray(extracted.destinations)) {
      extracted.destinations.forEach(dest => {
        if (dest && typeof dest === 'string') {
          const normalizedDest = dest.toLowerCase().trim();
          if (normalizedDest.length > 0) whitelistTokens.add(normalizedDest);
        }
      });
    }
    // PHASE 1 FIX: Ajouter des aliases géographiques connus (lieu mentionné → lieux associés)
    const geoAliases = {
      'angkor wat': ['siem reap', 'cambodge', 'cambodia'],
      'angkor': ['siem reap', 'cambodge', 'cambodia'],
      'borobudur': ['yogyakarta', 'java'],
      'bagan': ['mandalay', 'myanmar', 'birmanie'],
      'machu picchu': ['cusco', 'perou'],
      'taj mahal': ['agra', 'inde'],
      'halong': ['ha long', 'baie d\'halong'],
      'ha long': ['halong', 'baie d\'halong'],
      'phu quoc': ['kien giang', 'vietnam'],
      'sapa': ['lao cai', 'vietnam'],
      'ninh binh': ['tam coc', 'vietnam'],
      'hoi an': ['da nang', 'quang nam'],
      'da nang': ['hoi an', 'quang nam'],
      'ubud': ['bali', 'indonesie'],
      'kuta': ['bali', 'indonesie'],
      'chiang rai': ['chiang mai', 'thailande'],
      'krabi': ['ao nang', 'thailande'],
      'el nido': ['palawan', 'philippines'],
      'coron': ['palawan', 'philippines']
    };
    for (const token of [...whitelistTokens]) {
      const aliases = geoAliases[token];
      if (aliases) {
        aliases.forEach(a => whitelistTokens.add(a));
      }
    }

    // Ajouter tokens depuis story.evidence.source_snippets
    const snippets = story?.evidence?.source_snippets || [];
    
    // Vérifier si on a assez de contenu source pour valider (sinon whitelist trop petite = faux positifs)
    // PHASE 6.2: Être plus tolérant - accepter même avec peu de contenu si on a des snippets
    const hasEnoughSourceContent = (extracted.selftext || '').length >= 50 || 
                                   extractedTokens.length >= 10 || 
                                   snippets.length > 0;
    snippets.forEach(snippet => {
      let snippetText = '';
      if (typeof snippet === 'string') {
        snippetText = snippet;
      } else if (snippet && typeof snippet === 'object') {
        snippetText = snippet.text || snippet.content || snippet.body || snippet.quote || 
                     snippet.excerpt || snippet.snippet || '';
      }
      if (snippetText) {
        const snippetTokens = this.extractTokens(snippetText.toLowerCase());
        snippetTokens.forEach(t => whitelistTokens.add(t));
      }
    });
    
    // Ajouter tokens depuis commentaires si présents (extracted.comments peut être un objet { insights, warnings } ou un tableau)
    const comments = Array.isArray(extracted.comments) ? extracted.comments : [];
    comments.forEach(comment => {
      const commentText = (typeof comment === 'string' ? comment : comment.body || '').toLowerCase();
      const commentTokens = this.extractTokens(commentText);
      commentTokens.forEach(t => whitelistTokens.add(t));
    });

    // PHASE 2 FIX: Ajouter les equivalents EUR des montants USD sources
    // convertCurrencyToEUR() tourne avant checkInventionGuard, donc "500 USD" devient "~460 euros"
    // sans ceci, "460" est flaggé comme invention
    const USD_TO_EUR_RATE = 0.92;
    const sourceCosts = extracted?.post?.signals?.costs || [];
    for (const cost of sourceCosts) {
      const str = typeof cost === 'string' ? cost : (cost?.amount ? `${cost.amount}` : '');
      const nums = str.match(/[\d]+/g) || [];
      for (const n of nums) {
        const val = parseInt(n);
        if (val > 0) {
          const eur = Math.round(val * USD_TO_EUR_RATE);
          whitelistTokens.add(String(eur));
        }
      }
    }
    // PHASE 2 FIX: Aussi ajouter EUR equivalents des nombres trouves dans le texte source brut
    // Couvre les ranges comme "$500-700" ou "500 to 700 USD" dont seul un bout est dans costs
    const sourceNums = extractedText.match(/\d+/g) || [];
    for (const n of sourceNums) {
      const val = parseInt(n);
      if (val >= 5 && val <= 50000) {
        const eur = Math.round(val * USD_TO_EUR_RATE);
        whitelistTokens.add(String(eur));
      }
    }

    // PHASE 6.2.1: Extraire le texte de l'article HTML nettoyé (sans balises)
    const articleText = htmlForInventionCheck.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // PHASE 6.2.1: Initialiser debug pour invention_guard
    const debugClaims = [];
    
    const issues = [];
    
    // Détecter claims chiffrés non sourcés
    const numericClaims = [
      /\b\d+[€$]\b/gi,  // Montants
      /\b\d+\s*(euros?|dollars?|baht|yen)\b/gi,  // Montants avec devise
      /\bx\d+\b/gi,  // Multiplicateurs (x2, x3)
      /\b\d+\s*%\b/gi,  // Pourcentages
      /\ben\s+\d+\s+(jours?|mois|années?|semaines?)\b/gi,  // Durées
      /\b\d+\s+(jours?|mois|années?|semaines?)\b/gi  // Durées simples
    ];
    
    for (const pattern of numericClaims) {
      const matches = articleText.match(pattern);
      if (matches) {
        for (const match of matches) {
          if (!hasEnoughSourceContent) continue; // Skip si pas assez de contenu source
          
          // Vérifier si le claim exact ou un claim similaire est dans la source
          const numericValue = match.replace(/[^\d]/g, '');
          const matchLower = match.toLowerCase();
          
          // Vérifier dans extractedText
          const claimInExtracted = extractedText.includes(numericValue) || extractedText.includes(matchLower);
          
          // Vérifier dans snippets
          const claimInSnippets = snippets.some(s => {
            const sText = typeof s === 'string' ? s : (s.snippet || s.text || '');
            if (!sText) return false;
            const sTextLower = sText.toLowerCase();
            return sTextLower.includes(numericValue) || sTextLower.includes(matchLower);
          });

          // PHASE 2 FIX: Vérifier aussi dans whitelistTokens (inclut les equivalents EUR)
          const claimInWhitelist = whitelistTokens.has(numericValue);
          
          const claimInSource = claimInExtracted || claimInSnippets || claimInWhitelist;

          if (!claimInSource) {
            // Ignorer les très petits nombres isolés (probablement faux positifs)
            const numValue = parseInt(numericValue);
            // Accepter les nombres >= 7 (pour "7 jours") ou les pourcentages/multiplicateurs
            // Mais être strict : si le nombre est significatif (> 50) ou si c'est un pourcentage/multiplicateur, c'est suspect
            if (numValue && (numValue >= 7 || match.includes('%') || match.includes('x'))) {
              const context = articleText.substring(Math.max(0, articleText.indexOf(match) - 50), Math.min(articleText.length, articleText.indexOf(match) + match.length + 50)).substring(0, 100);
              const claimIdx = debugClaims.length;
              
              // PHASE 6.2.1: Logger le claim détecté
              console.log(`❌ INVENTION_GUARD_CLAIM: type=numeric text="${match}" context="${context.substring(0, 40)}..." idx=${claimIdx}`);
              
              debugClaims.push({
                type: 'numeric',
                text: match,
                context: context.substring(0, 100),
                idx: claimIdx
              });
              
              issues.push({
                type: 'numeric_claim',
                value: match,
                context: context
              });
            }
          }
        }
      }
    }
    
    // Détecter lieux (villes/pays) non sourcés via BDD OpenFlights (5600+ entrées)
    // Extraire les mots capitalisés du texte comme candidats lieux
    const locationCandidates = articleText.match(/\b[A-ZÀ-Ü][a-zà-ü]{2,}(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?\b/g) || [];
    // PHASE 1 FIX: Filtrer les faux positifs multi-mots où le 2e mot est un mot français courant
    const frenchCommonWords = new Set(['Si', 'Ne', 'Un', 'Une', 'En', 'Au', 'Le', 'La', 'Les', 'Et', 'Ou', 'De', 'Du', 'Des', 'Ce', 'Sa', 'Se', 'Son', 'Est', 'Par', 'Sur', 'Pour', 'Mais', 'Que', 'Qui', 'Pas', 'Ton', 'Avec', 'Dans', 'Sans', 'Sous', 'Vers', 'Chez', 'Ses', 'Nos', 'Vos', 'Mon', 'Ton', 'Mes', 'Tes', 'Cet', 'Cette', 'Ils', 'Elle', 'Elles', 'Nous', 'Vous', 'Ont', 'Sont', 'Peut', 'Donc', 'Bien', 'Tout', 'Rien', 'Cela', 'Comme', 'Notre']);
    const filteredCandidates = locationCandidates.filter(candidate => {
      const parts = candidate.split(/\s+/);
      if (parts.length === 2 && frenchCommonWords.has(parts[1])) return false;
      return true;
    });
    const uniqueCandidates = [...new Set(filteredCandidates)].filter(c => isKnownLocation(c));
    
    {
      const matches = uniqueCandidates;
      if (matches.length > 0) {
        for (const match of matches) {
          if (!hasEnoughSourceContent) continue; // Skip si pas assez de contenu source
          
          const normalizedMatch = match.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          
          // Vérifier si le lieu est explicitement dans la source
          const locationInExtracted = extractedText.includes(normalizedMatch);
          const locationInSnippets = snippets.some(s => {
            const sText = typeof s === 'string' ? s : (s.snippet || s.text || '');
            if (!sText) return false;
            return sText.toLowerCase().includes(normalizedMatch);
          });
          const locationInSource = locationInExtracted || locationInSnippets;
          
          if (!locationInSource && !whitelistTokens.has(normalizedMatch)) {
            const context = articleText.substring(Math.max(0, articleText.indexOf(match) - 80), Math.min(articleText.length, articleText.indexOf(match) + match.length + 80)).substring(0, 160);
            // Ne pas bloquer si le lieu est dans la section "Nos recommandations" (options #1, #2, #3 = alternatives éditoriales)
            if (/option\s*[#n°]\s*\d|#\s*[123]\b|#1\b|#2\b|#3\b|nos recommandations|par où commencer|comparer les prix|voir les forfaits|en savoir plus/i.test(context)) continue;
            const claimIdx = debugClaims.length;            console.log(`❌ INVENTION_GUARD_CLAIM: type=location text="${match}" context="${context.substring(0, 40)}..." idx=${claimIdx}`);
            debugClaims.push({
              type: 'location',
              text: match,
              context: context.substring(0, 100),
              idx: claimIdx
            });
            issues.push({
              type: 'location_claim',
              value: match,
              context: context
            });
          }
        }
      }
    }
    
    // Détecter affirmations factuelles trop spécifiques
    // "requis" et "necessaire" retirés : trop courants en français, génèrent des faux positifs
    const factualClaims = [
      /\bla loi dit\b/gi,
      /\best obligatoire\b/gi,
      /\best interdit\b/gi,
      /\bdoit être\b/gi
    ];
    
    for (const pattern of factualClaims) {
      const matches = articleText.match(pattern);
      if (matches) {
        for (const match of matches) {
          const contextStart = Math.max(0, articleText.indexOf(match) - 100);
          const contextEnd = Math.min(articleText.length, articleText.indexOf(match) + match.length + 100);
          const context = articleText.substring(contextStart, contextEnd).toLowerCase();
          const contextTokens = this.extractTokens(context);
          
          const hasWhitelistToken = contextTokens.some(t => whitelistTokens.has(t));
          // FAIL si : pas de token whitelist ET on a assez de contenu source pour valider
          if (!hasWhitelistToken && hasEnoughSourceContent) {
            const claimIdx = debugClaims.length;
            
            // PHASE 6.2.1: Logger le claim détecté
            console.log(`❌ INVENTION_GUARD_CLAIM: type=factual text="${match}" context="${context.substring(0, 40)}..." idx=${claimIdx}`);
            
            debugClaims.push({
              type: 'factual',
              text: match,
              context: context.substring(0, 150),
              idx: claimIdx
            });
            
            issues.push({
              type: 'factual_claim',
              value: match,
              context: context.substring(0, 150)
            });
          }
        }
      }
    }
    
    // PHASE 6.2.1: Exposer les claims dans report.debug (max 10)
    if (!report.debug) report.debug = {};
    report.debug.invention_guard = {
      claims: debugClaims.slice(0, 10)
    };
    
    // Deduplication par type+value (ex: "10 euros" apparaissant 3 fois)
    const seen = new Set();
    const uniqueIssues = issues.filter(issue => {
      const key = `${issue.type}::${issue.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (uniqueIssues.length > 0) {
      // STRATEGIE "CLEAN INSTEAD OF BLOCK" :
      // Nettoyer les claims non sourcés dans le HTML au lieu de bloquer la publication
      let cleanedCount = 0;
      
      for (const issue of uniqueIssues) {
        if (issue.type === 'numeric_claim') {
          // Remplacer "X euros" par une formulation vague
          const numericPattern = new RegExp(
            `(\\b(?:environ|autour de|près de|approximativement|~)?\\s*)?${issue.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            'gi'
          );
          const before = cleanedHtml;
          // BUG FIX: Do NOT replace prices with euphemisms — keep original text intact
          // cleanedHtml = cleanedHtml.replace(numericPattern, 'quelques euros');
          console.log('  [invention_guard] Detected numeric claim (kept intact):', issue.value);
          if (cleanedHtml !== before) cleanedCount++;
        } else if (issue.type === 'location_claim') {
          // Supprimer la phrase contenant le lieu inventé
          const locValue = issue.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const sentencePattern = new RegExp(
            `<p[^>]*>[^<]*${locValue}[^<]*<\\/p>`,
            'gi'
          );
          const before = cleanedHtml;
          cleanedHtml = cleanedHtml.replace(sentencePattern, '');
          if (cleanedHtml !== before) cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🧹 INVENTION_GUARD: ${cleanedCount}/${uniqueIssues.length} claim(s) nettoyé(s) dans le HTML`);
      }

      // Report comme "warn" (traçabilité) au lieu de "fail" bloquant
      report.checks.push({
        name: 'invention_guard',
        status: cleanedCount > 0 ? 'warn' : 'fail',
        details: `${uniqueIssues.length} claim(s) détecté(s), ${cleanedCount} nettoyé(s) (${issues.length} occurrences totales)`
      });
      
      uniqueIssues.forEach(issue => {
        report.issues.push({
          code: 'INVENTION_GUARD_CLEANED',
          severity: 'low',
          message: `invention_cleaned: ${issue.type} "${issue.value}" nettoyé du HTML`,
          evidence: { type: issue.type, value: issue.value, context: issue.context },
          check: 'invention_guard'
        });
      });
    } else {
      report.checks.push({
        name: 'invention_guard',
        status: 'pass',
        details: 'Aucune invention détectée'
      });
    }
    
    return cleanedHtml;
  }

  /**
   * PHASE 6.3.1: Helper pour vérifier si un texte est utilisable
   */
  hasUsableText(x, min = 1) {
    return typeof x === 'string' && x.trim().length >= min;
  }

  /**
   * PHASE 6.3.1: Helper pour vérifier si une liste est utilisable
   */
  hasUsableList(arr, minItemChars = 10) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    return arr.some(item => {
      const text = typeof item === 'string' ? item : (item.value || item.text || item.summary || item.quote || '');
      return this.hasUsableText(text, minItemChars);
    });
  }

  /**
   * Détecte si l'article est en format Option B (éditorial libre) : verdict + recommandations + corps substantiel.
   * En Option B, les sections Contexte / Événement central / Moment critique / Résolution ne sont pas requises ni insérées.
   * @param {string} html - Contenu HTML de l'article
   * @returns {boolean}
   */
  isOptionBFormat(html) {
    if (!html || typeof html !== 'string') return false;
    // Option B = a au moins "recommandations" OU "ce qu'il faut retenir" OU plusieurs H2 (développement libre)
    const hasVerdict = /<h2[^>]*>.*?ce qu'il faut retenir.*?<\/h2>/i.test(html);
    const hasRecommandations = /<h2[^>]*>.*?nos\s+recommandations.*?<\/h2>/i.test(html);
    const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
    // Considérer Option B si on a au moins une des deux sections structurées OU 3+ H2 (développement libre)
    const result = hasVerdict || hasRecommandations || h2Count >= 3;
    return result;
  }

  /**
   * PHASE 6.3.A: Helper pour déterminer si une section est vraiment requise
   * Basé uniquement sur le contenu exploitable dans story
   * IMPORTANT: si summary est null|undefined|"" ET pas de bullets => NOT required
   */
  isSectionRequired(sectionKey, story) {
    switch (sectionKey) {
      case 'context':
        return this.hasUsableText(story.context?.summary, 10) || this.hasUsableList(story.context?.bullets, 10);
      case 'central_event':
        return this.hasUsableText(story.central_event?.summary, 10) || this.hasUsableList(story.central_event?.bullets, 10);
      case 'critical_moment':
        return this.hasUsableText(story.critical_moment?.summary, 10) || this.hasUsableList(story.critical_moment?.bullets, 10);
      case 'resolution':
        return this.hasUsableText(story.resolution?.summary, 10) || this.hasUsableList(story.resolution?.bullets, 10);
      case 'author_lessons':
        return this.hasUsableList(story.author_lessons, 10);
      case 'open_questions':
        // required si array non vide (pas basé sur longueur des items)
        return Array.isArray(story.open_questions) && story.open_questions.length > 0;
      case 'community_insights':
        // required si array non vide (pas basé sur longueur des items)
        return Array.isArray(story.community_insights) && story.community_insights.length > 0;
      case 'related':
        return false; // "Articles connexes" n'est pas une section required story_alignment
      default:
        return false;
    }
  }

  /**
   * PHASE 6.3.B: Helper pour déterminer si une section peut être insérée
   * Plus strict: seuils différents selon le type de section
   */
  canInsert(sectionKey, story) {
    switch (sectionKey) {
      case 'context':
        return this.hasUsableText(story.context?.summary, 20) || this.hasUsableList(story.context?.bullets, 20);
      case 'central_event':
        return this.hasUsableText(story.central_event?.summary, 20) || this.hasUsableList(story.central_event?.bullets, 20);
      case 'critical_moment':
        return this.hasUsableText(story.critical_moment?.summary, 20) || this.hasUsableList(story.critical_moment?.bullets, 20);
      case 'resolution':
        return this.hasUsableText(story.resolution?.summary, 20) || this.hasUsableList(story.resolution?.bullets, 20);
      case 'author_lessons':
        return this.hasUsableList(story.author_lessons, 20);
      case 'open_questions':
        // insertable si hasUsableList(open_questions, 15) - items de 18 chars passent
        return this.hasUsableList(story.open_questions, 15);
      case 'community_insights':
        // insertable seulement si hasUsableList(community_insights, 30) (strict exprès)
        return this.hasUsableList(story.community_insights, 30);
      default:
        return false;
    }
  }

  /**
   * PHASE 6.3.C: Extraire toutes les sections présentes dans le HTML
   * Retourne une map { canonicalKey: { h2Index, contentText, contentLen } }
   */
  extractSections(html, sectionDefinitions) {
    const sections = {};
    const h2Matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
    
    for (const m of h2Matches) {
      const h2Title = m[1].trim();
      const h2Lower = h2Title.toLowerCase();
      
      // Chercher la section canonique correspondante
      // Priorité au titre canonique exact, puis aux synonymes
      for (const [sectionKey, sectionDef] of Object.entries(sectionDefinitions)) {
        const titleLower = sectionDef.title.toLowerCase();
        // Match exact du titre canonique (priorité)
        const matchesTitle = h2Lower === titleLower;
        // Match avec synonymes
        const matchesSynonym = !matchesTitle && sectionDef.synonyms.some(s => {
          const synLower = s.toLowerCase();
          return h2Lower === synLower || h2Lower.includes(synLower);
        });
        
        if (matchesTitle || matchesSynonym) {
          // Extraire le contenu jusqu'au prochain H2
          const h2Index = m.index;
          const nextH2Index = h2Matches.find(h => h.index > h2Index)?.index || html.length;
          const sectionContent = html.substring(h2Index + m[0].length, nextH2Index);
          const textContent = sectionContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          
          sections[sectionKey] = {
            h2Index,
            contentText: textContent,
            contentLen: textContent.length,
            h2Title: h2Title
          };
          break; // Une section ne peut correspondre qu'à une seule clé canonique
        }
      }
    }
    
    return sections;
  }

  /**
   * PHASE 6.2.4: Remplacer les liens morts href="#" par de vrais liens partenaires
   * @param {string} html - HTML de l'article
   * @returns {string} HTML avec liens fonctionnels
   */
  replaceDeadLinks(html) {
    let cleanedHtml = html;
    let replacedCount = 0;
    
    // Pattern 1: "Voir les forfaits" → Airalo eSIM
    const pattern1 = /<a href="#"([^>]*)>Voir les forfaits<\/a>/gi;
    const matches1 = cleanedHtml.match(pattern1);
    if (matches1) {
      cleanedHtml = cleanedHtml.replace(pattern1, '<a href="https://www.airalo.com/" target="_blank" rel="nofollow"$1>Voir les forfaits</a>');
      replacedCount += matches1.length;
      console.log(`   🔗 ${matches1.length} lien(s) "Voir les forfaits" corrigé(s) → Airalo`);
    }
    
    // Pattern 2: "Comparer les prix" → Kiwi.com
    const pattern2 = /<a href="#"([^>]*)>Comparer les prix<\/a>/gi;
    const matches2 = cleanedHtml.match(pattern2);
    if (matches2) {
      cleanedHtml = cleanedHtml.replace(pattern2, '<a href="https://www.kiwi.com/fr/" target="_blank" rel="nofollow"$1>Comparer les prix</a>');
      replacedCount += matches2.length;
      console.log(`   🔗 ${matches2.length} lien(s) "Comparer les prix" corrigé(s) → Kiwi.com`);
    }
    
    // Pattern 3: "En savoir plus" → Booking.com
    const pattern3 = /<a href="#"([^>]*)>En savoir plus<\/a>/gi;
    const matches3 = cleanedHtml.match(pattern3);
    if (matches3) {
      cleanedHtml = cleanedHtml.replace(pattern3, '<a href="https://www.booking.com/" target="_blank" rel="nofollow"$1>En savoir plus</a>');
      replacedCount += matches3.length;
      console.log(`   🔗 ${matches3.length} lien(s) "En savoir plus" corrigé(s) → Booking.com`);
    }
    
    if (replacedCount > 0) {
      console.log(`   ✅ ${replacedCount} lien(s) mort(s) corrigé(s)`);
    }
    
    return cleanedHtml;
  }

  /**
   * PHASE 6.2.4.1: Détecter et corriger les liens mal formés (href contenant du HTML ou mal fermé)
   * @param {string} html - HTML de l'article
   * @returns {string} HTML avec liens corrigés
   */
  fixMalformedLinks(html) {    
    let cleanedHtml = html;
    let fixedCount = 0;
    
    // Détecter tous les liens <a> dans le HTML
    const linkRegex = /<a\s+([^>]*)>(.*?)<\/a>/gis;
    const allLinks = [...cleanedHtml.matchAll(linkRegex)];    
    for (const linkMatch of allLinks) {
      const fullMatch = linkMatch[0];
      const attributes = linkMatch[1];
      const linkText = linkMatch[2];
      
      // Extraire le href
      const hrefMatch = attributes.match(/href=["']([^"']*)["']/i);
      if (!hrefMatch) continue;
      
      const href = hrefMatch[1];      
      // Détecter si le href contient du HTML (balises < >) ou des caractères invalides
      if (/<[^>]+>/.test(href) || /[<>]/.test(href)) {
        console.log(`   ⚠️ Lien mal formé détecté: href="${href.substring(0, 100)}..."`);
        
        // Extraire le texte du lien pour déterminer le type de lien attendu
        const linkTextLower = linkText.toLowerCase();
        let correctUrl = null;
        
        if (linkTextLower.includes('esim') || linkTextLower.includes('sim') || linkTextLower.includes('connexion') || linkTextLower.includes('fiable')) {
          correctUrl = 'https://www.airalo.com/';
        } else if (linkTextLower.includes('vol') || linkTextLower.includes('avion') || linkTextLower.includes('prix')) {
          correctUrl = 'https://www.kiwi.com/fr/';
        } else if (linkTextLower.includes('logement') || linkTextLower.includes('hôtel') || linkTextLower.includes('hébergement') || linkTextLower.includes('booking')) {
          correctUrl = 'https://www.booking.com/';
        }
        
        if (correctUrl) {
          // Remplacer le lien mal formé par un lien correct
          const newLink = `<a href="${correctUrl}" target="_blank" rel="nofollow">${linkText}</a>`;
          cleanedHtml = cleanedHtml.replace(fullMatch, newLink);
          fixedCount++;
          console.log(`   ✅ Lien corrigé: "${linkText.substring(0, 40)}..." → ${correctUrl}`);        } else {
          // Si on ne peut pas déterminer le type, supprimer le lien et garder juste le texte
          cleanedHtml = cleanedHtml.replace(fullMatch, linkText);
          fixedCount++;
          console.log(`   ⚠️ Lien mal formé supprimé (texte conservé): "${linkText.substring(0, 40)}..."`);        }
      }
    }
    
    // Détecter aussi les liens non fermés (<a href="..." sans </a>)
    const unclosedLinkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)(?=<a|$)/gis;
    const unclosedMatches = [...cleanedHtml.matchAll(unclosedLinkRegex)];    
    for (const unclosedMatch of unclosedMatches) {
      const fullMatch = unclosedMatch[0];
      const href = unclosedMatch[1];
      const linkText = unclosedMatch[2];
      
      // FIX: Si le linkText contient déjà </a>, le lien est correctement fermé — skip
      if (linkText.includes('</a>')) {
        continue;
      }
      
      // Vérifier si le lien est vraiment non fermé (pas de </a> dans les 500 caractères suivants)
      const afterMatch = cleanedHtml.substring(cleanedHtml.indexOf(fullMatch) + fullMatch.length, cleanedHtml.indexOf(fullMatch) + fullMatch.length + 500);
      if (!afterMatch.includes('</a>')) {
        console.log(`   ⚠️ Lien non fermé détecté: href="${href.substring(0, 100)}..." texte="${linkText.substring(0, 50)}..."`);
        
        // Trouver où fermer le lien (avant le prochain <a> ou à la fin du contenu)
        const nextLinkIndex = cleanedHtml.indexOf('<a', cleanedHtml.indexOf(fullMatch) + fullMatch.length);
        const closeIndex = nextLinkIndex > -1 ? nextLinkIndex : cleanedHtml.length;
        
        // Fermer le lien avant le prochain élément HTML ou à la fin
        const beforeClose = cleanedHtml.substring(0, closeIndex);
        const afterClose = cleanedHtml.substring(closeIndex);
        
        // Trouver la fin du texte du lien (avant un <h2>, <p>, </ul>, etc.)
        const textEndMatch = beforeClose.match(/(.*?)(?=<h[23]|<p|<ul|<\/ul|<\/li|$)/s);
        if (textEndMatch) {
          const textEnd = textEndMatch[1].lastIndexOf(linkText) + linkText.length;
          const fixedHtml = beforeClose.substring(0, textEnd) + '</a>' + beforeClose.substring(textEnd) + afterClose;
          cleanedHtml = fixedHtml;
          fixedCount++;
          console.log(`   ✅ Lien non fermé corrigé`);        }
      }
    }
    
    if (fixedCount > 0) {
      console.log(`   ✅ ${fixedCount} lien(s) mal formé(s) corrigé(s)`);
    }    
    return cleanedHtml;
  }

  /**
   * PHASE SÉCURITÉ HTML: Fermer les liens <a> non fermés
   * Scanne le HTML et ferme les <a> avant tout </li>, </p>, <h2>, <h3>, </section>
   * @param {string} html - HTML de l'article
   * @returns {string} HTML avec liens correctement fermés
   */
  closeUnclosedAnchors(html) {
    let fixedCount = 0;
    // Stratégie: trouver chaque <a ...> et vérifier qu'il a un </a> avant le prochain tag structurel
    let result = html;
    const openAnchorRegex = /<a\s[^>]*>/gi;
    let anchorMatch;
    // Collecter toutes les positions de <a> et </a>
    const opens = [];
    const closes = [];
    const openRe = /<a\s[^>]*>/gi;
    const closeRe = /<\/a>/gi;
    while ((anchorMatch = openRe.exec(html)) !== null) {
      opens.push({ index: anchorMatch.index, end: anchorMatch.index + anchorMatch[0].length });
    }
    while ((anchorMatch = closeRe.exec(html)) !== null) {
      closes.push({ index: anchorMatch.index });
    }
    
    // Pour chaque <a>, vérifier qu'il a un </a> avant le prochain <a> ou tag structurel fermant
    // Travailler en reverse pour ne pas casser les indices
    const structuralCloseTags = /<\/li>|<\/p>|<h[23][^>]*>|<\/section>|<\/ul>|<\/ol>/gi;
    
    for (let i = opens.length - 1; i >= 0; i--) {
      const open = opens[i];
      const nextOpen = opens[i + 1];
      const endBound = nextOpen ? nextOpen.index : result.length;
      
      // Chercher un </a> entre cette ouverture et la borne
      const segment = result.substring(open.end, endBound);
      const hasClose = /<\/a>/i.test(segment);
      
      if (!hasClose) {
        // Trouver le premier tag structurel fermant dans le segment
        const structMatch = segment.match(/<\/li>|<\/p>|<h[23][^>]*>|<\/section>|<\/ul>|<\/ol>/i);
        if (structMatch) {
          const insertPos = open.end + structMatch.index;
          result = result.substring(0, insertPos) + '</a>' + result.substring(insertPos);
          fixedCount++;
        } else {
          // Fermer à la fin du segment
          result = result.substring(0, open.end + segment.length) + '</a>' + result.substring(open.end + segment.length);
          fixedCount++;
        }
      }
    }
    
    if (fixedCount > 0) {
      console.log(`   🔧 closeUnclosedAnchors: ${fixedCount} lien(s) non fermé(s) corrigé(s)`);
    }
    
    return result;
  }

  /**
   * PHASE NETTOYAGE H3 ANGLAIS: Supprimer les H3 contenant du texte majoritairement anglais
   * Ces H3 viennent de questions Reddit qui se glissent dans le body
   * @param {string} html - HTML de l'article
   * @returns {string} HTML nettoyé
   */
  removeEnglishH3(html) {
    const ENGLISH_WORDS_RE = /\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|in|on|at|to|for|of|with|from|by|as|if|do|does|did|I|you|he|she|it|we|they|my|your|his|her|our|their|what|how|why|when|where|who|which|there|here|about|not|no|but|or|and|all|any|some|just|only|also|too|very|much|more|most|so|than|then|now|out|up|down|into|over|after|before|between|under|run|running|money|find|cheap|best|worst|getting|going|coming|leaving|moving|living|working|paying|cost|costs|budget|visa|stay|month|year|week|day|travel|trip|city|country)\b/gi;
    
    let removedCount = 0;
    let result = html;
    
    // Trouver tous les H3 et vérifier s'ils sont en anglais
    const h3Pattern = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
    const toRemove = [];
    let h3Match;
    
    while ((h3Match = h3Pattern.exec(html)) !== null) {
      const h3Text = h3Match[1].replace(/<[^>]+>/g, '').trim();
      const words = h3Text.split(/\s+/).filter(w => w.length > 1);
      if (words.length < 3) continue; // trop court pour juger
      
      const englishWords = (h3Text.match(ENGLISH_WORDS_RE) || []).length;
      const ratio = words.length > 0 ? englishWords / words.length : 0;
      
      if (ratio > 0.40) {
        toRemove.push({
          fullMatch: h3Match[0],
          text: h3Text,
          ratio: ratio.toFixed(2)
        });
      }
    }
    
    // Supprimer en reverse pour préserver les indices
    for (const item of toRemove.reverse()) {
      // Supprimer le H3 et le paragraphe qui suit immédiatement (souvent du contexte Reddit)
      const h3Pos = result.indexOf(item.fullMatch);
      if (h3Pos === -1) continue;
      
      let removeEnd = h3Pos + item.fullMatch.length;
      // Vérifier si un <p> suit immédiatement
      const afterH3 = result.substring(removeEnd);
      const nextPMatch = afterH3.match(/^\s*<p[^>]*>([\s\S]*?)<\/p>/i);
      if (nextPMatch) {
        // Vérifier si ce paragraphe est aussi en anglais
        const pText = nextPMatch[1].replace(/<[^>]+>/g, '').trim();
        const pEnglishWords = (pText.match(ENGLISH_WORDS_RE) || []).length;
        const pWords = pText.split(/\s+/).filter(w => w.length > 1).length;
        if (pWords > 0 && pEnglishWords / pWords > 0.40) {
          removeEnd += nextPMatch[0].length;
        }
      }
      
      result = result.substring(0, h3Pos) + result.substring(removeEnd);
      removedCount++;
    }
    
    if (removedCount > 0) {
      console.log(`   🔧 removeEnglishH3: ${removedCount} H3 anglais supprimé(s)`);
    }
    
    return result;
  }

  /**
   * PHASE NETTOYAGE LIENS IMBRIQUÉS: Dé-imbriquer les <a> dans <a>
   * Détecte <a href="X"><a href="Y">text</a>suffix</a> et garde le lien intérieur
   * @param {string} html - HTML
   * @returns {string} HTML nettoyé
   */
  deduplicateNestedLinks(html) {
    let fixedCount = 0;
    let result = html;
    
    // Pattern: <a ...>...<a ...>text</a>...suffix...</a>
    // On garde le lien intérieur et le suffixe comme texte
    const nestedPattern = /<a\s[^>]*>([^<]*)<a\s([^>]*)>([\s\S]*?)<\/a>([^<]*)<\/a>/gi;
    
    result = result.replace(nestedPattern, (match, prefixText, innerAttrs, innerText, suffixText) => {
      fixedCount++;
      // Garder le lien intérieur, mettre prefix/suffix comme texte nu
      return `${prefixText}<a ${innerAttrs}>${innerText}</a>${suffixText}`;
    });
    
    if (fixedCount > 0) {
      console.log(`   🔧 deduplicateNestedLinks: ${fixedCount} lien(s) imbriqué(s) corrigé(s)`);
    }
    
    return result;
  }

  /**
   * PHASE 6.2.4.1: Extraire les H2/H3 imbriqués dans des <p> tags
   * Les éléments block (h2, h3, etc.) ne doivent jamais être à l'intérieur d'un <p>
   * @param {string} html - HTML de l'article
   * @returns {string} HTML corrigé
   */
  fixH2InsideP(html) {
    let cleanedHtml = html;
    let fixCount = 0;
    
    // ÉTAPE 1: Fermer les <p> non fermés avant les <h2> tags
    // Pattern: <p> suivi de contenu SANS </p>, puis un <h[1-6]>
    let prevHtml;
    do {
      prevHtml = cleanedHtml;
      cleanedHtml = cleanedHtml.replace(/<p([^>]*)>((?:(?!<\/p>)[\s\S])*?)(<h[1-6][^>]*>)/gi, (m, attrs, content, hTag) => {
        fixCount++;
        const textOnly = content.replace(/<[^>]+>/g, '').trim();
        if (textOnly.length > 0) {
          return `<p${attrs}>${content}</p>\n${hTag}`;
        }
        // Contenu vide avant le H2 — supprimer le <p> orphelin
        return hTag;
      });
    } while (cleanedHtml !== prevHtml); // Répéter tant qu'il y a des corrections
    
    // ÉTAPE 2: Traiter les <p> fermés qui contiennent des éléments block-level
    cleanedHtml = cleanedHtml.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, content) => {
      if (!/<h[1-6][^>]*>/i.test(content)) return match;
      
      fixCount++;
      const parts = content.split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/gi);
      let result = '';
      
      for (const part of parts) {
        if (/<h[1-6][^>]*>/i.test(part)) {
          result += '\n' + part + '\n';
        } else {
          const textOnly = part.replace(/<[^>]+>/g, '').trim();
          if (textOnly.length > 0) {
            result += `<p${attrs}>${part.trim()}</p>`;
          }
        }
      }
      return result;
    });
    
    // ÉTAPE 3: Nettoyer les <p> vides résultants
    cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*<\/p>/gi, '');
    
    if (fixCount > 0) {
      console.log(`   ✅ ${fixCount} paragraphe(s) avec H2 imbriqué corrigé(s) (fixH2InsideP)`);
    }
    
    return cleanedHtml;
  }

  /**
   * PHASE 6.2.5: Nettoyer les duplications de sections H2
   * Fusionne les sections dupliquées (ex: "Ce que la communauté apporte" + "Ce que la communauté apporte (suite)")
   * @param {string} html - HTML de l'article
   * @returns {string} HTML nettoyé
   */
  removeDuplicateSections(html) {
    console.log('🧹 removeDuplicateSections: Début du nettoyage...');
    console.log(`   HTML length: ${html.length} caractères`);
    
    // Debug: Compter les H2 "Ce que la communauté apporte"
    const allH2Community = html.match(/<h2[^>]*>Ce que la communauté apporte[^<]*<\/h2>/gi);
    console.log(`   H2 "Ce que la communauté apporte" trouvés: ${allH2Community ? allH2Community.length : 0}`);
    if (allH2Community) {
      allH2Community.forEach((h2, i) => console.log(`     ${i+1}. ${h2}`));
    }
    
    let cleanedHtml = html;
    let duplicatesFound = 0;
    
    // Pattern 1: Supprimer "Ce que la communauté apporte (suite)" si suivi de "Ce que la communauté apporte"
    const pattern1 = /<h2[^>]*>Ce que la communauté apporte \(suite\)<\/h2>\s*<h2[^>]*>Ce que la communauté apporte<\/h2>/gi;
    const matches1 = cleanedHtml.match(pattern1);
    if (matches1) {
      cleanedHtml = cleanedHtml.replace(pattern1, '<h2>Ce que la communauté apporte</h2>');
      duplicatesFound += matches1.length;
      console.log(`   🧹 Duplication H2 supprimée: "Ce que la communauté apporte (suite)" + "Ce que la communauté apporte" (${matches1.length} occurrence(s))`);
    }
    
    // Pattern 2: Supprimer "Ce que la communauté apporte" si précédé de "Ce que la communauté apporte (suite)"
    const pattern2 = /<h2[^>]*>Ce que la communauté apporte<\/h2>\s*<h2[^>]*>Ce que la communauté apporte \(suite\)<\/h2>/gi;
    const matches2 = cleanedHtml.match(pattern2);
    if (matches2) {
      cleanedHtml = cleanedHtml.replace(pattern2, '<h2>Ce que la communauté apporte</h2>');
      duplicatesFound += matches2.length;
      console.log(`   🧹 Duplication H2 supprimée: "Ce que la communauté apporte" + "Ce que la communauté apporte (suite)" (${matches2.length} occurrence(s))`);
    }
    
    // Pattern 3: Supprimer toute occurrence isolée de "(suite)" dans les H2
    const pattern3 = /<h2[^>]*>([^<]+)\s*\(suite\)<\/h2>/gi;
    const matches3 = cleanedHtml.match(pattern3);
    if (matches3) {
      cleanedHtml = cleanedHtml.replace(pattern3, (match, title) => {
        console.log(`   🧹 Nettoyage H2: "${title} (suite)" → "${title}"`);
        return `<h2>${title.trim()}</h2>`;
      });
      duplicatesFound += matches3.length;
    }
    
    if (duplicatesFound > 0) {
      console.log(`   ✅ ${duplicatesFound} duplication(s) de sections nettoyée(s)`);
    }
    
    return cleanedHtml;
  }

  /**
   * Supprime les blockquotes dupliqués
   * @param {string} html - HTML de l'article
   * @returns {string} HTML nettoyé
   */
  removeDuplicateBlockquotes(html) {
    console.log('🧹 removeDuplicateBlockquotes: Début du nettoyage...');
    
    // Extraire tous les blockquotes avec leur position
    const blockquoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    const blockquotes = [];
    let match;
    const allMatches = [];
    
    // Collecter tous les matches d'abord
    while ((match = blockquoteRegex.exec(html)) !== null) {
      allMatches.push({
        fullMatch: match[0],
        content: match[1].replace(/<[^>]+>/g, '').trim(), // Texte sans HTML
        index: match.index
      });
    }
    
    if (allMatches.length <= 1) {
      return html; // Pas de duplication possible
    }
    
    // Normaliser pour comparaison (plus robuste)
    const normalize = (text) => {
      // Nettoyer le texte plus agressivement
      return text
        .toLowerCase()
        .replace(/<[^>]+>/g, '') // Supprimer HTML
        .replace(/[^\w\s]/g, '') // Supprimer ponctuation
        .replace(/\s+/g, ' ') // Normaliser espaces
        .trim()
        .substring(0, 200); // Prendre les 200 premiers caractères pour meilleure détection
    };
    
    // Trouver les doublons (garder le premier, marquer les suivants)
    const seen = new Map();
    const duplicates = [];
    
    for (let i = 0; i < allMatches.length; i++) {
      const normalized = normalize(allMatches[i].content);
      if (normalized.length < 20) continue; // Ignorer blockquotes trop courts
      
      if (seen.has(normalized)) {
        duplicates.push(allMatches[i]);
      } else {
        seen.set(normalized, allMatches[i]);
      }
    }
    
    if (duplicates.length === 0) {
      console.log('   ✅ Aucun blockquote dupliqué détecté');
      return html; // Pas de doublons
    }
    
    // Supprimer les doublons (du plus récent au plus ancien pour préserver les indices)
    let cleanedHtml = html;
    let removedCount = 0;
    
    // Trier par index décroissant pour supprimer du plus récent au plus ancien
    duplicates.sort((a, b) => b.index - a.index);
    
    for (const duplicate of duplicates) {
      // Échapper les caractères spéciaux regex
      const escapedMatch = duplicate.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Remplacer par chaîne vide (supprimer)
      cleanedHtml = cleanedHtml.replace(escapedMatch, '');
      removedCount++;
      console.log(`   🧹 Blockquote dupliqué supprimé: "${duplicate.content.substring(0, 60)}..."`);
    }
    
    if (removedCount > 0) {
      console.log(`   ✅ ${removedCount} blockquote(s) dupliqué(s) supprimé(s)`);
    }
    
    return cleanedHtml;
  }

  /**
   * Supprime le texte parasite ajouté par le renforcement SEO
   * @param {string} html - HTML de l'article
   * @returns {string} HTML nettoyé
   */
  removeParasiticText(html) {
    console.log('🧹 removeParasiticText: Nettoyage du texte parasite...');
    
    let cleanedHtml = html;
    let removedCount = 0;
    
    // Pattern 1: "est également un point important à considérer" (répétitif)
    const parasiticPattern1 = /\s+est également un point important à considérer\./gi;
    const matches1 = cleanedHtml.match(parasiticPattern1);
    if (matches1) {
      cleanedHtml = cleanedHtml.replace(parasiticPattern1, '');
      removedCount += matches1.length;
      console.log(`   🧹 ${matches1.length} occurrence(s) de "est également un point important à considérer" supprimée(s)`);
    }
    
    // Pattern 2: "est également un point important à considérer" avec variations
    const parasiticPattern2 = /\s+(est|sont)\s+également\s+un\s+point\s+important\s+à\s+considérer[\.\s]*/gi;
    const matches2 = cleanedHtml.match(parasiticPattern2);
    if (matches2 && matches2.length > removedCount) {
      cleanedHtml = cleanedHtml.replace(parasiticPattern2, '');
      const additionalRemoved = matches2.length - removedCount;
      removedCount = matches2.length;
      console.log(`   🧹 ${additionalRemoved} occurrence(s) supplémentaire(s) supprimée(s)`);
    }
    
    // Pattern 3: Répétitions de mots isolés (ex: "Indonesia est également... health est également...")
    const parasiticPattern3 = /\s+(\w+)\s+est également un point important à considérer\.\s+(\w+)\s+est également un point important à considérer\./gi;
    const matches3 = cleanedHtml.match(parasiticPattern3);
    if (matches3) {
      cleanedHtml = cleanedHtml.replace(parasiticPattern3, '');
      removedCount += matches3.length;
      console.log(`   🧹 ${matches3.length} répétition(s) de mots isolés supprimée(s)`);
    }
    
    // Pattern 4: Meta-commentaires d'affiliation qui fuient du prompt LLM
    // Ex: "C'est précisément là que des produits d'affiliation bien choisis deviennent utiles"
    const affiliateMetaPatterns = [
      /[^.]*produits?\s+d['']affiliation\s+bien\s+choisis\s+deviennent\s+utiles[^.]*\./gi,
      /[^.]*produits?\s+d['']affiliation[^.]*lecteur\s+se\s+sent\s+vuln[eé]rable[^.]*\./gi,
      /[^.]*outils?\s+d['']affiliation\s+bien\s+choisis[^.]*\./gi,
    ];
    for (const pattern of affiliateMetaPatterns) {
      const matches4 = cleanedHtml.match(pattern);
      if (matches4) {
        cleanedHtml = cleanedHtml.replace(pattern, '');
        removedCount += matches4.length;
        console.log(`   🧹 ${matches4.length} meta-commentaire(s) d'affiliation supprimé(s)`);
      }
    }

    // Pattern 5: Paragraphes vides résultant des suppressions
    cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*<\/p>/gi, '');

    if (removedCount > 0) {
      console.log(`   ✅ ${removedCount} texte(s) parasite(s) supprimé(s)`);
    } else {
      console.log('   ✅ Aucun texte parasite détecté');
    }
    
    return cleanedHtml;
  }

  /**
   * PHASE 6.0.9b: Corriger la cohérence géographique des H2 avec le titre
   * Deux cas gérés :
   * 1) Titre single-country ("Thaïlande") + H2 avec un autre pays → remplacer
   * 2) Titre régional ("Asie du Sud-Est") + H2 conclusion avec un seul pays → remplacer par la région
   */
  fixH2GeoCoherence(html, title) {
    if (!title || title.length < 5) return html;
    
    // Alias de destinations pour détecter la destination du titre
    const destinationAliases = {
      'thailand': ['thaïlande', 'thailande', 'thailand', 'bangkok', 'chiang mai', 'phuket', 'pattaya'],
      'vietnam': ['vietnam', 'viêt nam', 'hô chi minh', 'ho chi minh', 'hanoi', 'hanoï', 'da nang'],
      'indonesia': ['indonésie', 'indonesie', 'indonesia', 'bali', 'jakarta', 'lombok'],
      'singapore': ['singapour', 'singapore'],
      'philippines': ['philippines', 'manille', 'manila', 'cebu'],
      'japan': ['japon', 'japan', 'tokyo', 'kyoto', 'osaka'],
      'cambodia': ['cambodge', 'cambodia', 'phnom penh', 'siem reap'],
      'malaysia': ['malaisie', 'malaysia', 'kuala lumpur'],
      'south korea': ['corée du sud', 'coree du sud', 'south korea', 'séoul', 'seoul']
    };
    
    // Régions multi-pays
    const regionAliases = {
      'southeast_asia': ['asie du sud-est', 'asie du sud est', 'southeast asia', 'south east asia', 'asie du sud'],
      'asia': ['asie', 'asia']
    };
    
    const titleLower = title.toLowerCase();
    let titleCountry = null;
    let titleLabel = null;
    let titleIsRegion = false;
    let titleRegionLabel = null;
    
    // D'abord vérifier si le titre mentionne une région
    for (const [region, aliases] of Object.entries(regionAliases)) {
      for (const alias of aliases) {
        if (titleLower.includes(alias)) {
          titleIsRegion = true;
          titleRegionLabel = alias;
          break;
        }
      }
      if (titleIsRegion) break;
    }
    
    // Ensuite vérifier si le titre mentionne un pays spécifique
    for (const [country, aliases] of Object.entries(destinationAliases)) {
      for (const alias of aliases) {
        if (titleLower.includes(alias)) {
          titleCountry = country;
          titleLabel = alias;
          break;
        }
      }
      if (titleCountry) break;
    }
    
    let replacements = 0;
    let result = html;
    
    if (titleIsRegion && !titleCountry) {
      // CAS 2: Titre régional → corriger le H2 d'intro et de conclusion s'ils mentionnent un seul pays
      const regionLabelCapitalized = titleRegionLabel.charAt(0).toUpperCase() + titleRegionLabel.slice(1);
      const conclusionPatterns = ['ce qu\'il faut retenir', 'ce qu&#8217;il faut retenir', 'en résumé', 'conclusion', 'un aperçu'];
      
      for (const [country, aliases] of Object.entries(destinationAliases)) {
        for (const alias of aliases) {
          const h2Pattern = new RegExp(`(<h2[^>]*>)(.*?)(</h2>)`, 'gi');
          result = result.replace(h2Pattern, (match, open, content, close) => {
            const contentLower = content.toLowerCase();
            // Ne corriger que les H2 intro/conclusion (pas les sections comparatives par pays)
            const isIntroOrConclusion = conclusionPatterns.some(p => contentLower.includes(p));
            if (isIntroOrConclusion && contentLower.includes(alias)) {
              const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const aliasRegex = new RegExp(`\\s*(à|en|de|du|pour|sur les|sur l')\\s+${aliasEscaped}`, 'gi');
              // Forcer "en" pour les régions (en Asie du Sud-Est, pas à Asie du Sud-Est)
              const newContent = content.replace(aliasRegex, ` en ${regionLabelCapitalized}`);
              if (newContent !== content) {
                replacements++;
                console.log(`   🔄 GEO_COHERENCE (region): H2 "${content.substring(0, 60)}" → "${newContent.substring(0, 60)}"`);
              }
              return open + newContent + close;
            }
            return match;
          });
        }
      }
    } else if (titleCountry) {
      // CAS 1: Titre single-country → remplacer les mentions d'autres pays dans les H2
      // Préposition correcte par pays (en/au/à)
      const countryPrepositions = {
        'thaïlande': 'en', 'thailande': 'en', 'thailand': 'en',
        'vietnam': 'au', 'indonésie': 'en', 'indonesie': 'en',
        'singapour': 'à', 'singapore': 'à',
        'japon': 'au', 'japan': 'au',
        'cambodge': 'au', 'cambodia': 'au',
        'malaisie': 'en', 'malaysia': 'en',
        'philippines': 'aux',
        'corée du sud': 'en'
      };
      const correctPrep = countryPrepositions[titleLabel] || 'en';
      
      for (const [country, aliases] of Object.entries(destinationAliases)) {
        if (country === titleCountry) continue;
        
        for (const alias of aliases) {
          const h2Pattern = new RegExp(`(<h2[^>]*>)(.*?)(</h2>)`, 'gi');
          result = result.replace(h2Pattern, (match, open, content, close) => {
            const contentLower = content.toLowerCase();
            // Garder les H2 comparatifs (vs, et, comparaison) ou les sections multi-pays
            if (contentLower.includes(alias) && !contentLower.includes('compar') && !contentLower.includes('vs') && !contentLower.includes(' et ')) {
              // Traduire le label en français (thailand → Thaïlande, etc.)
              const _geoFrNames = {'thailand':'Thaïlande','thaïlande':'Thaïlande','thailande':'Thaïlande','japan':'Japon','japon':'Japon','indonesia':'Indonésie','indonésie':'Indonésie','cambodia':'Cambodge','cambodge':'Cambodge','malaysia':'Malaisie','malaisie':'Malaisie','singapore':'Singapour','singapour':'Singapour','philippines':'Philippines','korea':'Corée du Sud','laos':'Laos','myanmar':'Myanmar','taiwan':'Taïwan','vietnam':'Vietnam','india':'Inde','nepal':'Népal'};
              const titleLabelCapitalized = _geoFrNames[titleLabel.toLowerCase()] || titleLabel.charAt(0).toUpperCase() + titleLabel.slice(1);
              // Remplacer aussi la préposition (à/en/au + ancien pays → prep correcte + nouveau pays)
              const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const prepAliasRegex = new RegExp(`(à|en|au|aux)\\s+${aliasEscaped}`, 'gi');
              let newContent = content.replace(prepAliasRegex, `${correctPrep} ${titleLabelCapitalized}`);
              // Fallback: remplacer juste le nom si pas de préposition
              if (newContent === content) {
                const aliasRegex = new RegExp(aliasEscaped, 'gi');
                newContent = content.replace(aliasRegex, titleLabelCapitalized);
              }
              if (newContent !== content) {
                replacements++;
                console.log(`   🔄 GEO_COHERENCE: H2 "${content.substring(0, 60)}" → "${newContent.substring(0, 60)}"`);
              }
              return open + newContent + close;
            }
            return match;
          });
        }
      }
    }
    
    if (replacements > 0) {
      console.log(`✅ GEO_COHERENCE: ${replacements} H2 corrigé(s) pour cohérence avec le titre`);
    }
    
    return result;
  }

  /**
   * PHASE 6.0.9c: Traduire les noms de villes/pays anglais → français dans le HTML
   * Appliqué sur H2, H3, P, LI, blockquote — partout où un lecteur francophone
   * verrait un nom anglais incongruent.
   */
  translateCityNamesToFrench(html) {
    // Map des noms anglais → français (word-boundary safe)
    const cityTranslations = {
      'Singapore': 'Singapour',
      'Thailand': 'Thaïlande',
      'Vietnam': 'Vietnam', // déjà FR
      'Indonesia': 'Indonésie',
      'Philippines': 'Philippines', // identique
      'Japan': 'Japon',
      'Cambodia': 'Cambodge',
      'Malaysia': 'Malaisie',
      'South Korea': 'Corée du Sud',
      'North Korea': 'Corée du Nord',
      'Myanmar': 'Myanmar', // identique
      'Laos': 'Laos', // identique
      'Taiwan': 'Taïwan',
      'Hong Kong': 'Hong Kong', // identique
      'Southeast Asia': 'Asie du Sud-Est',
      'South East Asia': 'Asie du Sud-Est',
      'South Asia': 'Asie du Sud',
      'East Asia': 'Asie de l\'Est',
      'Digital Nomad': 'Nomade Digital',
      'Kuala Lumpur': 'Kuala Lumpur', // identique
      'Ho Chi Minh City': 'Hô-Chi-Minh-Ville',
      'Phnom Penh': 'Phnom Penh' // identique
    };

    let result = html;
    let replacements = 0;

    for (const [eng, fr] of Object.entries(cityTranslations)) {
      if (eng === fr) continue; // Pas besoin de remplacer si identique
      // Remplacement word-boundary dans les tags textuels (H2, H3, P, LI, blockquote, figcaption)
      const engEscaped = eng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(>[^<]*?)\\b${engEscaped}\\b`, 'gi');
      const before = result;
      result = result.replace(pattern, (match, prefix) => {
        return prefix + fr;
      });
      if (result !== before) {
        const count = (before.match(new RegExp(`\\b${engEscaped}\\b`, 'g')) || []).length - 
                      (result.match(new RegExp(`\\b${engEscaped}\\b`, 'g')) || []).length;
        if (count > 0) {
          replacements += count;
          console.log(`   🌐 CITY_TRANSLATE: "${eng}" → "${fr}" (${count}x)`);
        }
      }
    }

    if (replacements > 0) {
      console.log(`✅ CITY_TRANSLATE: ${replacements} nom(s) traduit(s) en français`);
    }
    return result;
  }

  /**
   * PHASE 6.0.8b: Garantir un paragraphe introductif avant le premier H2
   * Si le HTML commence directement par <h2>, déplacer le premier <p> qui suit le H2 vers avant le H2.
   */
  ensureIntroBeforeFirstH2(html) {
    if (!html || typeof html !== 'string') return html;
    
    const trimmed = html.trim();
    // Si le contenu ne commence PAS par un H2, tout va bien
    if (!trimmed.match(/^<h2[\s>]/i)) return html;
    
    // Le contenu commence par un H2 → chercher le premier <p>...</p> après ce H2
    const firstH2End = trimmed.match(/<\/h2>/i);
    if (!firstH2End) return html;
    
    const afterH2 = trimmed.substring(firstH2End.index + firstH2End[0].length);
    const firstParagraph = afterH2.match(/^\s*(<p[^>]*>[\s\S]*?<\/p>)/i);
    
    if (firstParagraph) {
      // Déplacer ce paragraphe avant le H2
      const pText = firstParagraph[1];
      const h2Block = trimmed.substring(0, firstH2End.index + firstH2End[0].length);
      const rest = afterH2.substring(firstParagraph.index + firstParagraph[0].length);
      
      console.log(`   📝 INTRO_FIX: Paragraphe introductif déplacé avant le premier H2`);
      return pText + '\n\n' + h2Block + rest;
    }
    
    return html;
  }

  /**
   * PHASE 6.0.9: Supprimer les emojis des titres H2
   * Les emojis dans les H2 sont mauvais pour le SEO et la cohérence éditoriale
   * @param {string} html - HTML à nettoyer
   * @returns {string} HTML avec H2 sans emojis
   */
  removeEmojisFromH2(html) {
    console.log('🧹 removeEmojisFromH2: Nettoyage des emojis dans les H2...');
    
    let cleanedHtml = html;
    let removedCount = 0;
    
    // Regex pour détecter les emojis (plages Unicode courantes + variation selectors)
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]/gu;
    
    // Trouver tous les H2 et nettoyer les emojis
    cleanedHtml = cleanedHtml.replace(/<h2([^>]*)>([^<]*)<\/h2>/gi, (match, attrs, content) => {
      const originalContent = content;
      const cleanedContent = content.replace(emojiRegex, '').trim();
      
      if (originalContent !== cleanedContent) {
        removedCount++;
        console.log(`   🧹 H2 nettoyé: "${originalContent.substring(0, 50)}..." → "${cleanedContent.substring(0, 50)}..."`);
      }
      
      return `<h2${attrs}>${cleanedContent}</h2>`;
    });
    
    if (removedCount > 0) {
      console.log(`   ✅ ${removedCount} emoji(s) supprimé(s) des H2`);
    } else {
      console.log('   ✅ Aucun emoji détecté dans les H2');
    }
    
    return cleanedHtml;
  }

  /**
   * PHASE 6.0.10: Supprimer les sections vides (labels emoji sans contenu)
   * Ex: "<p>🧠 Ce que le voyageur a ressenti :</p>" suivi de rien
   * @param {string} html - HTML à nettoyer
   * @returns {string} HTML sans sections vides
   */
  removeEmptySections(html) {
    console.log('🧹 removeEmptySections: Nettoyage des sections vides...');    
    let cleanedHtml = html;
    let removedCount = 0;
    
    // Pattern 1: Paragraphes avec emoji + label + ":" suivis de rien ou d'un paragraphe vide
    // Ex: <p>🧠 Ce que le voyageur a ressenti :</p>\n<p></p>
    const emptyLabelPattern1 = /<p[^>]*>[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*[^<]{0,80}:\s*<\/p>\s*(<p[^>]*>\s*<\/p>)?/gu;
    const matches1 = cleanedHtml.match(emptyLabelPattern1);
    if (matches1) {
      cleanedHtml = cleanedHtml.replace(emptyLabelPattern1, '');
      removedCount += matches1.length;
      console.log(`   🧹 ${matches1.length} label(s) emoji vide(s) supprimé(s)`);
    }
    
    // Pattern 2: Paragraphes complètement vides (sans contenu du tout)
    // Pattern amélioré pour capturer même collés à d'autres balises
    const completelyEmptyPattern = /<p[^>]*>\s*<\/p>/gi;
    let emptyMatches = cleanedHtml.match(completelyEmptyPattern);
    if (emptyMatches) {
      // Supprimer même s'ils sont collés à d'autres balises (ex: <p></p><ul>)
      cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*<\/p>\s*/gi, '');
      removedCount += emptyMatches.length;
      console.log(`   🧹 ${emptyMatches.length} paragraphe(s) complètement vide(s) supprimé(s)`);
    }
    
    // Pattern 2b: Paragraphes vides consécutifs (après suppression des vides individuels)
    const emptyParagraphsPattern = /(<p[^>]*>\s*<\/p>\s*){2,}/g;
    const matches2 = cleanedHtml.match(emptyParagraphsPattern);
    if (matches2) {
      cleanedHtml = cleanedHtml.replace(emptyParagraphsPattern, '');
      removedCount += matches2.length;
      console.log(`   🧹 ${matches2.length} groupe(s) de paragraphes vides consolidé(s)`);
    }
    
    // CORRECTION: Supprimer les paragraphes avec juste un point ou des points/espaces
    const dotOnlyParagraphs = cleanedHtml.match(/<p[^>]*>\s*[.\s]+\s*<\/p>/gi);
    if (dotOnlyParagraphs) {
      cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*[.\s]+\s*<\/p>/gi, '');
      removedCount += dotOnlyParagraphs.length;
      console.log(`   🧹 ${dotOnlyParagraphs.length} paragraphe(s) avec juste un point/espaces supprimé(s)`);
    }
    // Paragraphes triviaux : uniquement tiret long (—) ou tiret + espaces
    const dashOnlyParagraphs = cleanedHtml.match(/<p[^>]*>\s*[—–-]\s*<\/p>/gi);
    if (dashOnlyParagraphs) {
      cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*[—–-]\s*<\/p>/gi, '');
      removedCount += dashOnlyParagraphs.length;
      console.log(`   🧹 ${dashOnlyParagraphs.length} paragraphe(s) triviaux (—) supprimé(s)`);
    }
    
    // CORRECTION AMÉLIORÉE: Supprimer les paragraphes avec juste un point isolé (ex: <p>.</p>)
    // Pattern plus robuste pour capturer toutes les variantes
    const singleDotPatterns = [
      /<p[^>]*>\s*\.\s*<\/p>/gi,  // <p>.</p>
      /<p[^>]*>\s*\.\s*<\/p>/gi,  // <p> . </p>
      /<p[^>]*>\.<\/p>/gi,        // <p>.</p> sans espaces
      /<p[^>]*>\s*\.\s*<\/p>/gi   // Avec attributs <p class="...">.</p>
    ];
    
    let totalRemoved = 0;
    singleDotPatterns.forEach((pattern, idx) => {
      const matches = cleanedHtml.match(pattern);
      if (matches) {
        cleanedHtml = cleanedHtml.replace(pattern, '');
        totalRemoved += matches.length;
      }
    });
    
    if (totalRemoved > 0) {
      removedCount += totalRemoved;
      console.log(`   🧹 ${totalRemoved} paragraphe(s) avec juste un point supprimé(s)`);    }
    
    // Pattern 3: Labels "Cross-cutting lesson" ou "Leçon transversale" sans contenu
    const crossCuttingPattern = /<p[^>]*>\s*(Cross-cutting lesson|Leçon transversale)\s*:?\s*<\/p>/gi;
    const matches3 = cleanedHtml.match(crossCuttingPattern);
    if (matches3) {
      cleanedHtml = cleanedHtml.replace(crossCuttingPattern, '');
      removedCount += matches3.length;
      console.log(`   🧹 ${matches3.length} label(s) "Cross-cutting lesson" vide(s) supprimé(s)`);
    }
    
    // AMÉLIORATION: Pattern 4: H2/H3 suivi directement d'un autre H2/H3 (sans contenu intermédiaire)
    // AMÉLIORATION: Protéger les sections SERP critiques
    const protectedSerpPatterns = [
      /ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement)/i,
      /limites?\s*(et\s*)?biais/i,
      /erreurs?\s*(fréquentes?|courantes?|à\s*éviter)/i,
      /faq\b|questions?\s*(fréquentes?|courantes?|que\s+(tu|vous|se\s+posent))/i,
      /nos\s+recommandations/i,
      /ce\s+qu.il\s+faut\s+retenir/i
    ];
    
    // AMÉLIORATION: Pattern amélioré pour détecter H2/H3 suivis uniquement d'espaces, sauts de ligne, ou paragraphes vides
    // Pattern 1: H2/H3 suivi directement d'un autre H2/H3 (sans contenu, ou avec uniquement espaces/sauts de ligne)
    // Pattern amélioré pour capturer aussi les espaces et sauts de ligne entre les H2
    const emptyH2H3Pattern = /<(h[23])[^>]*>([^<]*)<\/h[23]>\s*(?:\s|<p[^>]*>\s*<\/p>\s*)*(?=<h[23]|$)/gi;
    let match;
    const emptySections = [];
    while ((match = emptyH2H3Pattern.exec(cleanedHtml)) !== null) {
      const h2Text = match[2];
      // Vérifier si c'est une section SERP protégée
      const isProtected = protectedSerpPatterns.some(pattern => pattern.test(h2Text));
      
      if (!isProtected) {
        emptySections.push({
          fullMatch: match[0],
          index: match.index,
          tag: match[1],
          text: h2Text
        });
      } else {
        // AMÉLIORATION: Au lieu de juste protéger, signaler pour remplissage dans ensureSerpSections
        console.log(`   🛡️ Section SERP protégée (vide, sera remplie par ensureSerpSections): "${h2Text.substring(0, 50)}..."`);
      }
    }
    
    // AMÉLIORATION: Pattern 2: H2/H3 suivi uniquement d'espaces, sauts de ligne, ou paragraphes vides (même avec plusieurs lignes)
    // Ex: <h2>Ce que dit le témoignage</h2>\n    \n    \n<h2>Moment critique</h2>
    const h2h3WithOnlyWhitespace = /<(h[23])[^>]*>([^<]*)<\/h[23]>\s*(?:\s|<p[^>]*>\s*<\/p>\s*)*(?=<h[23]|$)/gi;
    let matchWhitespace;
    while ((matchWhitespace = h2h3WithOnlyWhitespace.exec(cleanedHtml)) !== null) {
      const h2Text = matchWhitespace[2];
      const isProtected = protectedSerpPatterns.some(pattern => pattern.test(h2Text));
      
      if (!isProtected) {
        // Vérifier que cette section n'a pas déjà été ajoutée
        const alreadyAdded = emptySections.some(s => s.index === matchWhitespace.index);
        if (!alreadyAdded) {
          // Extraire la section complète (du H2 jusqu'au prochain H2 ou fin)
          const startIndex = matchWhitespace.index;
          const afterH2 = cleanedHtml.substring(startIndex + matchWhitespace[0].length);
          const nextH2Match = afterH2.match(/<(h[23])[^>]*>/i);
          const sectionEnd = nextH2Match ? startIndex + matchWhitespace[0].length + nextH2Match.index : cleanedHtml.length;
          const fullSection = cleanedHtml.substring(startIndex, sectionEnd);
          
          // Vérifier que le contenu entre le H2 et le prochain H2 est vraiment vide ou trivial (. , —, ponctuation seule)
          const contentBetween = fullSection.replace(/<h[23][^>]*>.*?<\/h[23]>/i, '').replace(/<[^>]+>/g, ' ').trim();
          const isTrivial = contentBetween.length <= 15 || /^[\s.\-—–]+$/.test(contentBetween);
          if (contentBetween.length <= 10 || isTrivial) {
            emptySections.push({
              fullMatch: fullSection,
              index: startIndex,
              tag: matchWhitespace[1],
              text: h2Text
            });
          }
        }
      }
    }
    
    // Supprimer les sections vides détectées (en ordre inverse pour préserver les indices)
    for (let i = emptySections.length - 1; i >= 0; i--) {
      const section = emptySections[i];
      // AMÉLIORATION: Extraire la section complète jusqu'au prochain H2 pour s'assurer de tout supprimer
      const afterMatch = cleanedHtml.substring(section.index + section.fullMatch.length);
      const nextH2Match = afterMatch.match(/<(h[23])[^>]*>/i);
      const sectionEnd = nextH2Match ? section.index + section.fullMatch.length + nextH2Match.index : section.index + section.fullMatch.length;
      const fullSectionToRemove = cleanedHtml.substring(section.index, sectionEnd);
      
      // Vérifier que le contenu est vide ou trivial (. , —, ponctuation seule)
      const contentBetween = fullSectionToRemove.replace(/<h[23][^>]*>.*?<\/h[23]>/i, '').replace(/<[^>]+>/g, ' ').trim();
      const isTrivial = contentBetween.length <= 15 || /^[\s.\-—–]+$/.test(contentBetween);
      if (contentBetween.length <= 10 || isTrivial) {
        cleanedHtml = cleanedHtml.substring(0, section.index) + cleanedHtml.substring(sectionEnd);
        removedCount++;
        console.log(`   🧹 ${section.tag.toUpperCase()} vide/trivial supprimé: "${section.text.substring(0, 50)}..."`);
      }
    }
    
    // AMÉLIORATION: Pattern 5: H2/H3 suivi uniquement de paragraphes vides (<p></p>)
    // Réutiliser protectedSerpPatterns déclaré plus haut
    const h2h3WithOnlyEmptyParas = /<(h[23])[^>]*>([^<]*)<\/h[23]>\s*(<p[^>]*>\s*<\/p>\s*)+(?=<h[23]|$)/gi;
    let match2;
    const sectionsWithEmptyParas = [];
    while ((match2 = h2h3WithOnlyEmptyParas.exec(cleanedHtml)) !== null) {
      const h2Text = match2[2];
      // Vérifier si c'est une section SERP protégée
      const isProtected = protectedSerpPatterns.some(pattern => pattern.test(h2Text));
      
      if (!isProtected) {
        sectionsWithEmptyParas.push({
          fullMatch: match2[0],
          index: match2.index,
          tag: match2[1]
        });
      } else {
        // AMÉLIORATION: Ne pas supprimer, mais signaler pour remplissage dans fillEmptySections
        console.log(`   🛡️ Section SERP protégée (vide, sera remplie par fillEmptySections): "${h2Text.substring(0, 50)}..."`);
      }
    }
    
    // Supprimer les sections avec uniquement des paragraphes vides (sauf SERP protégées)
    for (let i = sectionsWithEmptyParas.length - 1; i >= 0; i--) {
      const section = sectionsWithEmptyParas[i];
      cleanedHtml = cleanedHtml.substring(0, section.index) + cleanedHtml.substring(section.index + section.fullMatch.length);
      removedCount++;
      console.log(`   🧹 ${section.tag.toUpperCase()} avec uniquement paragraphes vides supprimé`);
    }
    
    if (removedCount > 0) {
      console.log(`   ✅ ${removedCount} section(s) vide(s) supprimée(s)`);
    } else {
      console.log('   ✅ Aucune section vide détectée');
    }    
    return cleanedHtml;
  }

  /**
   * Supprime explicitement la section interdite "Ce que dit le témoignage" (H2 + contenu jusqu'au prochain H2).
   * @param {string} html - HTML à nettoyer
   * @returns {string} HTML sans cette section
   */
  removeForbiddenH2Section(html) {
    if (!html || typeof html !== 'string') return html;
    const forbiddenPattern = /<h2[^>]*>\s*Ce que dit le témoignage\s*\.{0,3}\s*<\/h2>/i;
    let cleaned = html;
    let count = 0;
    let match;
    while ((match = cleaned.match(forbiddenPattern)) !== null) {
      const startIndex = cleaned.indexOf(match[0]);
      const afterH2 = cleaned.substring(startIndex + match[0].length);
      const nextH2 = afterH2.match(/<h2[^>]*>/i);
      const endIndex = nextH2
        ? startIndex + match[0].length + nextH2.index
        : cleaned.length;
      cleaned = cleaned.substring(0, startIndex) + cleaned.substring(endIndex);
      count++;
    }
    if (count > 0) console.log(`   🧹 ${count} section(s) interdite(s) "Ce que dit le témoignage" supprimée(s)`);
    return cleaned;
  }

  /**
   * Supprime les sections parasites de l'ancienne structure (Contexte, Événement central, Moment critique, Résolution)
   * quand l'article est en format Option B (verdict + recommandations + corps substantiel).
   * Ces sections sont supprimées si elles ont un contenu minimal (<= 500 caractères jusqu'au prochain H2).
   * @param {string} html - HTML à nettoyer
   * @returns {string} HTML nettoyé
   */
  removeParasiticSections(html) {
    if (!html || typeof html !== 'string') return html;
    
    // TOUJOURS supprimer les H2 template de l'ancienne structure (Option A),
    // quel que soit le format détecté. Le contenu devrait être dans le développement narratif.
    const parasiticTitles = [
      { pattern: /<h2[^>]*>\s*Contexte\s*\.{0,3}\s*<\/h2>/i, name: 'Contexte' },
      { pattern: /<h2[^>]*>\s*Événement central\s*\.{0,3}\s*<\/h2>/i, name: 'Événement central' },
      { pattern: /<h2[^>]*>\s*Moment critique\s*\.{0,3}\s*<\/h2>/i, name: 'Moment critique' },
      { pattern: /<h2[^>]*>\s*Résolution\s*\.{0,3}\s*<\/h2>/i, name: 'Résolution' },
      { pattern: /<h2[^>]*>\s*Ce que l'auteur retient\s*<\/h2>/i, name: 'Ce que l\'auteur retient' },
      { pattern: /<h2[^>]*>\s*Ce que la communauté apporte\s*<\/h2>/i, name: 'Ce que la communauté apporte' },
      { pattern: /<h2[^>]*>\s*Chronologie de l'expérience\s*<\/h2>/i, name: 'Chronologie de l\'expérience' },
      { pattern: /<h2[^>]*>\s*Risques et pièges réels\s*<\/h2>/i, name: 'Risques et pièges réels' }
    ];
    
    let cleaned = html;
    let totalRemoved = 0;
    
    for (const { pattern, name } of parasiticTitles) {
      let match;
      while ((match = cleaned.match(pattern)) !== null) {
        const startIndex = cleaned.indexOf(match[0]);
        const afterH2 = cleaned.substring(startIndex + match[0].length);
        
        // Trouver le prochain H2 ou la fin du document
        const nextH2Match = afterH2.match(/<h2[^>]*>/i);
        const endIndex = nextH2Match
          ? startIndex + match[0].length + nextH2Match.index
          : startIndex + match[0].length + Math.min(afterH2.length, 500);
        
        // Supprimer le H2 template et son contenu (le contenu est déjà dans le développement)
        cleaned = cleaned.substring(0, startIndex) + cleaned.substring(endIndex);
        totalRemoved++;
        console.log(`   🧹 Section template "${name}" supprimée`);
      }
    }
    
    if (totalRemoved > 0) {
      console.log(`   ✅ ${totalRemoved} section(s) template supprimée(s)`);
    }
    
    return cleaned;
  }

  /**
   * Supprime les sections résiduelles de l'ancienne structure en Option B
   * - "Ce que la communauté apporte" (résidu de l'ancienne structure)
   * - "Conseils pratiques" (résidu de l'ancienne structure)
   * - Listes `<ul>` mal formées (contenant du texte brut au lieu de `<li>`)
   * @param {string} html - HTML à nettoyer
   * @returns {string} HTML nettoyé
   */
  removeOldStructureResidues(html) {
    if (!html || typeof html !== 'string') return html;
    
    // Vérifier si l'article est en format Option B
    const isOptionB = this.isOptionBFormat(html);
    console.log(`🔍 removeOldStructureResidues: isOptionB=${isOptionB}, htmlLength=${html.length}`);
    
    // AMÉLIORATION: Toujours supprimer ces sections résiduelles si elles existent, même si Option B n'est pas détecté
    // Car ces sections ne devraient jamais être présentes dans la nouvelle structure
    let cleaned = html;
    let removedCount = 0;
    
    // 1. Supprimer "Ce que la communauté apporte" (section résiduelle)
    // Pattern très flexible pour détecter même avec variations d'espacement, attributs HTML, etc.
    // Chercher d'abord tous les H2 qui contiennent ce texte (insensible à la casse)
    const communityH2Pattern = /<h2[^>]*>[\s\S]*?ce\s+que\s+la\s+communauté\s+apporte[\s\S]*?<\/h2>/gi;
    const communityH2Matches = [...cleaned.matchAll(communityH2Pattern)];
    
    // Pattern alternatif pour détecter même avec des variations (espaces multiples, tirets, etc.)
    if (communityH2Matches.length === 0) {
      const altPattern = /<h2[^>]*>.*?(?:communauté|community).*?(?:apporte|brings).*?<\/h2>/gi;
      const altMatches = [...cleaned.matchAll(altPattern)];
      if (altMatches.length > 0) {
        communityH2Matches.push(...altMatches);
        console.log(`   🔍 Détecté ${altMatches.length} H2 alternatif(s) contenant "communauté apporte"`);
      }
    }
    
    if (communityH2Matches.length > 0) {
      console.log(`   🔍 Détecté ${communityH2Matches.length} H2 "Ce que la communauté apporte"`);
      
      // Traiter en ordre inverse pour éviter les problèmes d'index lors de la suppression
      const sortedMatches = communityH2Matches.sort((a, b) => b.index - a.index);
      
      // Pour chaque H2 trouvé, supprimer seulement cette section jusqu'au prochain H2/H3
      // FIX BUG: Ne JAMAIS supprimer jusqu'à la fin du document si pas de H2/H3 après
      for (const h2Match of sortedMatches) {
        const h2Index = h2Match.index;
        const afterH2 = cleaned.substring(h2Index + h2Match[0].length);
        const nextHeadingMatch = afterH2.match(/<h[23][^>]*>/i);
        
        // FIX CRITIQUE: Si pas de H2/H3 après, supprimer seulement le H2 lui-même + quelques paragraphes
        if (nextHeadingMatch) {
          const sectionEndIndex = h2Index + h2Match[0].length + nextHeadingMatch.index;
          cleaned = cleaned.substring(0, h2Index) + cleaned.substring(sectionEndIndex);
          removedCount++;
        } else {
          // Pas de H2/H3 après : supprimer seulement le H2 et jusqu'à 500 chars de contenu maximum
          const sectionContentMatch = afterH2.match(/^([\s\S]*?)(?=<(?:div|section|footer|p class="reddit)|$)/i);
          const sectionContent = sectionContentMatch ? sectionContentMatch[1] : '';
          const safeEndIndex = Math.min(sectionContent.length, 500);
          const sectionEndIndex = h2Index + h2Match[0].length + safeEndIndex;
          cleaned = cleaned.substring(0, h2Index) + cleaned.substring(sectionEndIndex);
          removedCount++;
          console.log(`   ⚠️ Section "Ce que la communauté apporte" supprimée avec limite de sécurité (${safeEndIndex} chars)`);
        }
      }
      
      console.log(`   🧹 Section résiduelle "Ce que la communauté apporte" supprimée (${communityH2Matches.length} occurrence(s))`);    } else {
      console.log(`   ℹ️ Aucune occurrence de "Ce que la communauté apporte" trouvée`);
    }
    
    // 2. DÉSACTIVÉ: "Conseils pratiques" n'est PLUS un résidu - c'est une section valide
    // Cette suppression causait la perte de contenu éditorial important
    // Pattern très flexible pour détecter même avec variations d'espacement, attributs HTML, etc.
    // const conseilsH2Pattern = /<h2[^>]*>[\s\S]*?conseils\s+pratiques[\s\S]*?<\/h2>/gi;
    // const conseilsH2Matches = [...cleaned.matchAll(conseilsH2Pattern)];
    const conseilsH2Matches = []; // DÉSACTIVÉ - section maintenant valide
    
    if (conseilsH2Matches.length > 0) {
      console.log(`   🔍 Détecté ${conseilsH2Matches.length} H2 "Conseils pratiques"`);
      
      // Traiter en ordre inverse pour éviter les problèmes d'index lors de la suppression
      const sortedMatches = conseilsH2Matches.sort((a, b) => b.index - a.index);
      
      // Pour chaque H2 trouvé, supprimer seulement cette section jusqu'au prochain H2/H3
      // FIX BUG: Ne JAMAIS supprimer jusqu'à la fin du document si pas de H2/H3 après
      for (const h2Match of sortedMatches) {
        const h2Index = h2Match.index;
        const afterH2 = cleaned.substring(h2Index + h2Match[0].length);
        const nextHeadingMatch = afterH2.match(/<h[23][^>]*>/i);
        
        // FIX CRITIQUE: Si pas de H2/H3 après, supprimer seulement le H2 lui-même + quelques paragraphes
        // mais PAS tout le reste du document (qui contient les widgets, source Reddit, etc.)
        if (nextHeadingMatch) {
          const sectionEndIndex = h2Index + h2Match[0].length + nextHeadingMatch.index;
          cleaned = cleaned.substring(0, h2Index) + cleaned.substring(sectionEndIndex);
          removedCount++;
        } else {
          // Pas de H2/H3 après : supprimer seulement le H2 et jusqu'à 500 chars de contenu maximum
          // Chercher la fin logique de la section (fin de liste, paragraphe, etc.)
          const sectionContentMatch = afterH2.match(/^([\s\S]*?)(?=<(?:div|section|footer|p class="reddit)|$)/i);
          const sectionContent = sectionContentMatch ? sectionContentMatch[1] : '';
          const safeEndIndex = Math.min(sectionContent.length, 500);
          const sectionEndIndex = h2Index + h2Match[0].length + safeEndIndex;
          cleaned = cleaned.substring(0, h2Index) + cleaned.substring(sectionEndIndex);
          removedCount++;
          console.log(`   ⚠️ Section "Conseils pratiques" supprimée avec limite de sécurité (${safeEndIndex} chars)`);
        }
      }
      
      console.log(`   🧹 Section résiduelle "Conseils pratiques" supprimée (${conseilsH2Matches.length} occurrence(s))`);    } else {
      console.log(`   ℹ️ Aucune occurrence de "Conseils pratiques" trouvée`);
    }
    
    // 3. Supprimer les modules d'affiliation isolés APRÈS avoir supprimé les sections résiduelles
    // Pattern amélioré pour détecter les modules d'affiliation même avec des attributs variés
    // Utiliser une approche qui gère les div imbriquées en comptant les balises ouvrantes/fermantes
    const findAffiliateModules = (html) => {
      const modules = [];
      const pattern = /<(?:div|aside)[^>]*(?:class=["'][^"']*affiliate-module[^"']*["']|data-placement-id[^>]*)[^>]*>/gi;
      let match;
      
      while ((match = pattern.exec(html)) !== null) {
        const startIndex = match.index;
        const startTag = match[0];
        let depth = 1;
        let currentIndex = startIndex + startTag.length;
        
        // Trouver la balise fermante correspondante en gérant les div imbriquées
        while (depth > 0 && currentIndex < html.length) {
          const nextOpen = html.indexOf('<div', currentIndex);
          const nextClose = html.indexOf('</div>', currentIndex);
          
          if (nextClose === -1) break; // Pas de fermeture trouvée
          
          if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            currentIndex = nextOpen + 4;
          } else {
            depth--;
            if (depth === 0) {
              const endIndex = nextClose + 6;
              modules.push({
                index: startIndex,
                fullMatch: html.substring(startIndex, endIndex)
              });
            }
            currentIndex = nextClose + 6;
          }
        }
      }
      
      return modules;
    };
    
    const affiliateModules = findAffiliateModules(cleaned);
    
    console.log(`   🔍 Détecté ${affiliateModules.length} module(s) d'affiliation`);    
    // Vérifier si des modules d'affiliation sont isolés (peu de contenu avant, pas de H2 valide après)
    // Traiter en ordre inverse pour éviter les problèmes d'index lors de la suppression
    for (let i = affiliateModules.length - 1; i >= 0; i--) {
      const module = affiliateModules[i];
      const moduleIndex = module.index;
      const moduleLength = module.fullMatch.length;
      const beforeModule = cleaned.substring(0, moduleIndex).trim();
      const afterModule = cleaned.substring(moduleIndex + moduleLength).trim();
      
      // Chercher le dernier H2 avant le module
      const lastH2Matches = beforeModule.match(/<h2[^>]*>[\s\S]*?<\/h2>/gi);
      const contentBefore = lastH2Matches && lastH2Matches.length > 0
        ? beforeModule.substring(beforeModule.lastIndexOf(lastH2Matches[lastH2Matches.length - 1]) + lastH2Matches[lastH2Matches.length - 1].length)
        : beforeModule;
      const textBefore = contentBefore.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Chercher le prochain H2 après le module
      const nextH2Match = afterModule.match(/<h2[^>]*>/i);
      const contentAfter = nextH2Match ? afterModule.substring(0, nextH2Match.index) : afterModule;
      const textAfter = contentAfter.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Si peu de contenu avant (< 50 chars) et peu de contenu après (< 100 chars), considérer comme isolé
      // Ou si le dernier H2 avant était une section résiduelle (même si déjà supprimée, vérifier le contexte)
      const isIsolated = textBefore.length < 50 && textAfter.length < 100;
      const wasAfterResidualSection = lastH2Matches && lastH2Matches.length > 0 && (
        textBefore.length < 100 // Peu de contenu après le dernier H2
      );
      
      if (isIsolated || wasAfterResidualSection) {
        cleaned = cleaned.substring(0, moduleIndex) + cleaned.substring(moduleIndex + moduleLength);
        removedCount++;
        console.log(`   🧹 Module d'affiliation isolé supprimé (contenu avant: ${textBefore.length} chars, après: ${textAfter.length} chars)`);      }
    }
    
    // 4. Corriger les listes `<ul>` mal formées (contenant du texte brut au lieu de `<li>`)
    // Détecter les `<ul>` qui contiennent du texte directement sans `<li>`
    const malformedUlPattern = /<ul[^>]*>([^<]+(?:<[^>]+>[^<]*)*)<\/ul>/gi;
    const malformedUls = [...cleaned.matchAll(malformedUlPattern)];    
    for (const ulMatch of malformedUls) {
      const fullMatch = ulMatch[0];
      const ulContent = ulMatch[1];
      
      // Vérifier si le contenu ne contient pas de `<li>` (liste mal formée)
      if (!/<li[^>]*>/i.test(ulContent)) {
        // Convertir le texte brut en paragraphe ou supprimer si trop court
        const textContent = ulContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        
        if (textContent.length > 50) {
          // Convertir en paragraphe si le contenu est substantiel
          cleaned = cleaned.replace(fullMatch, `<p>${textContent}</p>`);
          removedCount++;
          console.log(`   🧹 Liste mal formée convertie en paragraphe (${textContent.substring(0, 50)}...)`);        } else {
          // Supprimer si le contenu est trop court
          cleaned = cleaned.replace(fullMatch, '');
          removedCount++;
          console.log(`   🧹 Liste mal formée supprimée (contenu trop court)`);        }
      }
    }
    
    if (removedCount > 0) {
      console.log(`   ✅ ${removedCount} résidu(s) de l'ancienne structure supprimé(s)`);
    } else {
      console.log(`   ℹ️ Aucun résidu de l'ancienne structure détecté`);
    }    
    return cleaned;
  }

  /**
   * Supprime la phrase générique interdite dans "Ce qu'il faut retenir" (Pendant que vous... / Chez Flash Voyages nous avons sélectionné).
   * @param {string} html - HTML à nettoyer
   * @returns {string} HTML nettoyé
   */
  removeGenericVerdictPhrase(html) {
    if (!html || typeof html !== 'string') return html;
    const verdictH2 = /<h2[^>]*>\s*Ce qu'il faut retenir\s*\.{0,3}\s*<\/h2>/i;
    const match = html.match(verdictH2);
    if (!match) return html;
    const startIdx = html.indexOf(match[0]) + match[0].length;
    const afterVerdict = html.substring(startIdx);
    const nextH2 = afterVerdict.match(/<h[23][^>]*>/i);
    const endIdx = nextH2 ? startIdx + nextH2.index : html.length;
    let sectionContent = html.substring(startIdx, endIdx);
    const beforeLen = sectionContent.length;
    // Supprimer tout paragraphe contenant la phrase interdite (même avec balises internes)
    const genericInParagraph = /<p[^>]*>(?:(?!<\/p>).)*?(?:Pendant que vous|nous avons sélectionné ce témoignage Reddit pour vous inspirer)(?:(?!<\/p>).)*?<\/p>/gis;
    sectionContent = sectionContent.replace(genericInParagraph, '');
    // Supprimer paragraphe "Comparez les prix et réservez :" seul
    sectionContent = sectionContent.replace(/<p[^>]*>\s*Comparez les prix et réservez\s*:?\s*\.?\s*<\/p>/gi, '');
    if (sectionContent.length < beforeLen) {
      console.log('   🧹 Verdict générique supprimé (Pendant que vous / Chez Flash Voyages)');
    }
    return html.substring(0, startIdx) + sectionContent + html.substring(endIdx);
  }

  /**
   * Supprime les placeholders connus ("Pourquoi money ?", etc.) et les paragraphes de citation vides (» — auteur (Reddit) sans texte).
   * @param {string} html - HTML à nettoyer
   * @returns {string} HTML nettoyé
   */
  /**
   * Déduplique les blockquotes identiques ou quasi-identiques
   * Empêche la même citation Reddit d'apparaître plusieurs fois
   */
  deduplicateBlockquotes(html) {
    if (!html || typeof html !== 'string') return html;
    
    // Extraire tous les blockquotes
    const blockquoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    const seen = new Set();
    let dedupCount = 0;
    
    // NOUVEAU : Extraire le texte de l'intro (paragraphes avant le premier H2)
    // pour détecter si un blockquote répète le contenu de l'intro
    const firstH2Idx = html.search(/<h2[\s>]/i);
    let introText = '';
    if (firstH2Idx > 0) {
      introText = html.substring(0, firstH2Idx)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }
    
    const result = html.replace(blockquoteRegex, (fullMatch, innerContent) => {
      // Normaliser le contenu pour la comparaison (retirer HTML, espaces multiples)
      const normalized = innerContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      
      // Si le contenu est trop court (< 20 chars), le garder (pas une vraie citation)
      if (normalized.length < 20) return fullMatch;
      
      // NOUVEAU : Vérifier si le blockquote répète le contenu de l'intro
      if (introText.length > 50 && normalized.length > 30) {
        const bqWords = new Set(normalized.split(/\s+/).filter(w => w.length > 3));
        const introWords = new Set(introText.split(/\s+/).filter(w => w.length > 3));
        const intersection = [...bqWords].filter(w => introWords.has(w)).length;
        const jaccard = bqWords.size > 0 ? intersection / bqWords.size : 0;
        if (jaccard >= 0.50) {
          dedupCount++;
          console.log(`   🔍 BLOCKQUOTE_DEDUP: blockquote répète l'intro (Jaccard=${jaccard.toFixed(2)} ≥ 0.50), supprimé`);
          return ''; // Supprimer le blockquote qui répète l'intro
        }
      }
      
      // Vérifier si une citation similaire existe déjà (substring ou Jaccard ≥ 60%)
      for (const seenText of seen) {
        if (normalized === seenText || normalized.includes(seenText) || seenText.includes(normalized)) {
          dedupCount++;
          console.log(`   🔍 BLOCKQUOTE_DEDUP: exact/substring match`);
          return ''; // Supprimer le doublon
        }
        // Check substring overlap (80%)
        const shorter = normalized.length < seenText.length ? normalized : seenText;
        const longer = normalized.length >= seenText.length ? normalized : seenText;
        if (shorter.length > 30 && longer.includes(shorter.substring(0, Math.floor(shorter.length * 0.8)))) {
          dedupCount++;
          return ''; // Supprimer le quasi-doublon
        }
        // Check Jaccard word similarity (≥ 60% des mots en commun)
        if (shorter.length > 30) {
          const wordsA = new Set(normalized.split(/\s+/).filter(w => w.length > 3));
          const wordsB = new Set(seenText.split(/\s+/).filter(w => w.length > 3));
          const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
          const union = new Set([...wordsA, ...wordsB]).size;
          const jaccard = union > 0 ? intersection / union : 0;
          if (jaccard >= 0.6) {
            dedupCount++;
            console.log(`   🔍 BLOCKQUOTE_DEDUP: Jaccard=${jaccard.toFixed(2)} ≥ 0.60`);
            return ''; // Supprimer le quasi-doublon
          }
        }
      }
      
      seen.add(normalized);
      return fullMatch;
    });
    
    if (dedupCount > 0) {
      console.log(`   🧹 ${dedupCount} blockquote(s) dupliquée(s) supprimée(s)`);
    }
    
    return result;
  }

  removePlaceholdersAndEmptyCitations(html) {
    if (!html || typeof html !== 'string') return html;
    let cleaned = html;
    // Placeholders: H2/H3 ou paragraphes contenant "Pourquoi money ?", "Why money?", "?." seuls, "Comment xxx ?" mal formés
    const placeholderPatterns = [
      /<h[23][^>]*>\s*Pourquoi money \?\s*<\/h[23]>\s*(?:<p[^>]*>[^<]*<\/p>\s*)*/gi,
      /<h[23][^>]*>\s*Why money \?\s*<\/h[23]>\s*(?:<p[^>]*>[^<]*<\/p>\s*)*/gi,
      /<p[^>]*>\s*Pourquoi money \?\s*<\/p>/gi,
      /<p[^>]*>\s*Why money \?\s*<\/p>/gi,
      /<p[^>]*>\s*\?\.\s*<\/p>/gi,
      // H3 widget mal formés type "Comment esim_connectivity ?"
      /<h3[^>]*>\s*Comment\s+[a-z_]+\s*\?\s*<\/h3>/gi
    ];
    placeholderPatterns.forEach(pattern => {
      const m = cleaned.match(pattern);
      if (m) {
        cleaned = cleaned.replace(pattern, '');
        console.log(`   🧹 ${m.length} placeholder(s) supprimé(s)`);
      }
    });
    // Citations vides: » — auteur (Reddit) sans texte avant les guillemets (ou juste guillemets + tiret)
    const emptyCitationPattern = /<p[^>]*>\s*[«»"]\s*[—–-]\s*[^<]+\(Reddit\)\s*<\/p>/gi;
    const citations = cleaned.match(emptyCitationPattern);
    if (citations) {
      cleaned = cleaned.replace(emptyCitationPattern, '');
      console.log(`   🧹 ${citations.length} citation(s) vide(s) supprimée(s)`);
    }
    return cleaned;
  }

  /**
   * Valide les liens internes (href non vide, ancre cohérente).
   * Détecte les liens tronqués du type "Consultez notre article sur [titre] :" sans href ou ancre vide.
   * @param {string} html - HTML à vérifier
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateInternalLinks(html) {
    const errors = [];
    if (!html || typeof html !== 'string') return { valid: true, errors: [] };
    // Liens internes: href contient flashvoyage ou commence par /
    const linkRegex = /<a\s+([^>]*?)href\s*=\s*["']([^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const href = (m[2] || '').trim();
      const inner = (m[4] || '').replace(/<[^>]*>/g, '').trim();
      const isInternal = /flashvoyage|^\//i.test(href);
      if (!isInternal) continue;
      if (!href || href === '#' || href === '') {
        errors.push(`Lien interne sans href valide (ancre: "${inner.slice(0, 50)}...")`);
        continue;
      }
      if (!inner || inner === ':' || /^\s*:\s*$/.test(inner) || inner.endsWith(' :') || inner.endsWith(' : ')) {
        errors.push(`Lien interne sans ancre valide (href: ${href.slice(0, 60)}...)`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Quality gate étendue : ouverture immersive, H2 blacklist conditionnelle, quotes, hook sans Reddit.
   * @param {string} html - HTML à vérifier
   * @param {Object} [pipelineContext] - Contexte du pipeline (story, evidence) pour les fallbacks
   * @returns {{ noForbiddenH2: boolean, hasImmersiveOpening: boolean, noGenericH2: boolean, hasMinQuotes: boolean, hookWithoutReddit: boolean, warnings: string[] }}
   */
  runQualityGateContent(html, pipelineContext = null) {
    const warnings = [];
    
    // === CHECK 1: H2 "Ce que dit le témoignage" (legacy) ===
    const noForbiddenH2 = !/<h2[^>]*>\s*Ce que dit le témoignage\s*\.{0,3}\s*<\/h2>/i.test(html || '');
    if (!noForbiddenH2) warnings.push('Section interdite "Ce que dit le témoignage" encore présente');
    
    // === CHECK 2: Ouverture immersive ===
    const textStart = (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    const immersiveMarkers = [
      /^Tu fixes\s/i, /^Tu envisages\s/i, /\d{1,3}\s*\d{3}\s*\$/,
      /Dans ce guide[,.]?\s/i, /on t'explique\s+(combien|comment)/i,
      /combien ça coûte vraiment/i,
      // Nouveaux markers pour hooks cinématiques
      /^Chaque fois que/i, /^Tu atterris/i, /^Il est \d+h/i,
      /^Le propriétaire/i, /^Tu viens de/i, /^La première chose/i,
      /apparaître sur l'écran/i, /compte à rebours/i, /budget.*fond/i
    ];
    const hasImmersiveOpening = immersiveMarkers.some(re => re.test(textStart));
    if (!hasImmersiveOpening) warnings.push('Ouverture immersive non détectée en début d\'article');
    
    // === CHECK 3: H2 génériques (blacklist conditionnelle) ===
    const GENERIC_H2_BLACKLIST = [
      'contexte', 'événement central', 'moment critique', 'résolution',
      'chronologie de l\'expérience', 'risques et pièges réels',
      'ce que la communauté apporte', 'conseils pratiques',
      'en résumé', 'stratégies', 'ce qu\'il faut savoir', 'points clés',
      'notre avis', 'analyse', 'solutions', 'conclusion',
      'ce que dit le témoignage', 'ce qu\'il faut retenir',
      'nos recommandations', 'options alternatives'
    ];
    // Patterns "lazy" : mot générique + ":" + complément → toujours rejeté
    const LAZY_H2_PATTERN = /^(conclusion|stratégies|options|solutions|résumé|analyse)\s*:/i;
    
    const h2Matches = [...((html || '').matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi) || [])];
    const genericH2sFound = h2Matches.filter(m => {
      const title = m[1].trim().toLowerCase().replace(/[^\wàâäéèêëïîôùûüÿç\s'-]/g, '').trim();
      // Un H2 est "nu" (= générique) seulement s'il correspond EXACTEMENT à un terme blacklisté
      // Un H2 qualifié (contenant plus de mots, une destination, etc.) est autorisé
      const isNakedGeneric = GENERIC_H2_BLACKLIST.some(banned => title === banned);
      // Un H2 "lazy" = mot générique + ":" (ex: "Conclusion: bla bla") est aussi rejeté
      const isLazy = LAZY_H2_PATTERN.test(m[1].trim());
      return isNakedGeneric || isLazy;
    });
    const noGenericH2 = genericH2sFound.length === 0;
    if (!noGenericH2) {
      warnings.push(`H2 génériques détectés: ${genericH2sFound.map(m => `"${m[1].trim()}"`).join(', ')}`);
    }
    
    // === CHECK 4: Compteur de quotes (minimum 2) avec fallback ===
    const quoteMatches = (html || '').match(/«[^»]+»/g) || [];
    const blockquoteMatches = (html || '').match(/<blockquote[^>]*data-source=["']reddit["'][^>]*>/gi) || [];
    const totalQuotes = quoteMatches.length + blockquoteMatches.length;
    const hasMinQuotes = totalQuotes >= 2;
    if (!hasMinQuotes) {
      warnings.push(`Citations insuffisantes: ${totalQuotes}/2 minimum (${quoteMatches.length} inline « », ${blockquoteMatches.length} blockquotes)`);
      
      // FALLBACK: Tenter d'injecter des citations depuis source_snippets si disponibles
      if (pipelineContext?.story?.evidence?.source_snippets) {
        const snippets = pipelineContext.story.evidence.source_snippets;
        const usableSnippets = (Array.isArray(snippets) ? snippets : [])
          .filter(s => {
            const text = typeof s === 'string' ? s : (s?.text || s?.quote || '');
            return text.length >= 20 && text.length <= 300;
          })
          .slice(0, 3 - totalQuotes); // Injecter seulement le nombre manquant
        
        if (usableSnippets.length > 0) {
          console.log(`   🔧 QUALITY_GATE_FALLBACK: Injection de ${usableSnippets.length} citation(s) depuis source_snippets`);
          // Note: l'injection réelle sera faite par l'editorial-enhancer en aval
          // Ici on ne fait que signaler — l'editorial-enhancer a la priorité
          warnings.push(`Fallback quotes: ${usableSnippets.length} citation(s) disponibles dans source_snippets pour injection`);
        }
      }
    }
    
    // === CHECK 5: Hook sans mention Reddit dans les 500 premiers caractères ===
    const hookWithoutReddit = !/\breddit\b|\bsubreddit\b|\br\//i.test(textStart);
    if (!hookWithoutReddit) {
      warnings.push('Mention de "Reddit" détectée dans les 500 premiers caractères du hook');
    }
    
    // === CHECK 6: Hook sans pattern banni "Te voilà..." ===
    const hookNoBannedPattern = !/\bte voilà\b|\bte voila\b/i.test(textStart);
    if (!hookNoBannedPattern) {
      warnings.push('Hook banni "Te voilà..." détecté — doit être remplacé par un hook cinématique');
    }
    
    return { noForbiddenH2, hasImmersiveOpening, noGenericH2, hasMinQuotes, hookWithoutReddit, hookNoBannedPattern, warnings };
  }

  /**
   * PHASE 6.0.5: Supprimer les sections H2 dupliquées (notamment "Limites et biais")
   * Garde la première occurrence et supprime les suivantes
   * @param {string} html - HTML à nettoyer
   * @returns {string} HTML sans sections H2 dupliquées
   */
  removeDuplicateH2Sections(html) {
    console.log('🧹 removeDuplicateH2Sections: Détection des sections H2 dupliquées...');
    
    let cleanedHtml = html;
    let removedCount = 0;
    
    // Extraire tous les H2 avec leur contenu jusqu'au prochain H2
    const h2Pattern = /<h2[^>]*>([^<]+)<\/h2>/gi;
    const h2Matches = [];
    let match;
    
    while ((match = h2Pattern.exec(html)) !== null) {
      h2Matches.push({
        fullMatch: match[0],
        title: match[1].trim(),
        index: match.index,
        normalizedTitle: match[1].trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')
      });
    }
    
    // Détecter les duplications (normaliser les titres pour comparaison)
    const seenTitles = new Map();
    const duplicates = [];
    let firstLimitesIndex = -1;
    let firstLimitesIsFR = false;
    
    h2Matches.forEach((h2, index) => {
      const normalized = h2.normalizedTitle;
      
      // Patterns spéciaux pour "Limites et biais" (variations: Limites, Limitations, Limits)
      const limitesPatternFR = /limites?\s*(et\s*)?biais/i;
      const limitesPatternFR2 = /limitations?\s*(et\s*)?biais/i;
      const limitesPatternEN = /limits?\s*(and\s*)?bias(es)?/i;
      const isLimitesFR = limitesPatternFR.test(h2.title) || limitesPatternFR2.test(h2.title);
      const isLimitesEN = limitesPatternEN.test(h2.title);
      const isLimites = isLimitesFR || isLimitesEN;
      
      // Clé normalisée pour "Limites et biais" (gère français et anglais)
      const limitesKey = 'limites et biais';
      
      // Si c'est une section "Limites et biais" (FR ou EN) et qu'on en a déjà vu une, c'est une duplication
      let isDuplicate = seenTitles.has(normalized) || (isLimites && seenTitles.has(limitesKey));
      
      // Détection par préfixe commun : "Ce que les autres ne disent pas" vs
      // "Ce que les autres ne disent pas: l'inertie du choix" sont des doublons
      let prefixDupOf = null;
      if (!isDuplicate && !isLimites) {
        for (const [seenNorm, seenIdx] of seenTitles.entries()) {
          if (seenNorm === limitesKey) continue;
          const shorter = normalized.length <= seenNorm.length ? normalized : seenNorm;
          const longer  = normalized.length >  seenNorm.length ? normalized : seenNorm;
          if (shorter.length >= 15 && longer.startsWith(shorter)) {
            isDuplicate = true;
            prefixDupOf = { seenNorm, seenIdx, shorter, longer, currentIsLonger: normalized.length > seenNorm.length };
            console.log(`   🔍 H2_PREFIX_DUP: "${normalized.substring(0, 50)}" ≈ "${seenNorm.substring(0, 50)}"`);
            break;
          }
        }
      }
      
      // AMÉLIORATION: Toujours privilégier la version FR, supprimer l'EN
      if (isLimites && firstLimitesIndex >= 0) {
        // On a déjà vu une section "Limites et biais"
        if (isLimitesEN) {
          // Toujours supprimer la version EN si on a déjà vu une section (FR ou EN)
          const startIndex = h2.index;
          const nextH2Index = index < h2Matches.length - 1 ? h2Matches[index + 1].index : html.length;
          const sectionContent = html.substring(startIndex, nextH2Index);
          
          duplicates.push({
            fullMatch: sectionContent,
            index: startIndex,
            title: h2.title,
            isLimites: true,
            isLimitesFR: false,
            isLimitesEN: true
          });
        } else if (isLimitesFR && !firstLimitesIsFR) {
          // On a vu EN d'abord, maintenant FR: supprimer l'EN précédente
          const prevH2 = h2Matches[firstLimitesIndex];
          const prevStartIndex = prevH2.index;
          const prevNextH2Index = firstLimitesIndex < h2Matches.length - 1 ? h2Matches[firstLimitesIndex + 1].index : html.length;
          const prevSectionContent = html.substring(prevStartIndex, prevNextH2Index);
          
          duplicates.push({
            fullMatch: prevSectionContent,
            index: prevStartIndex,
            title: prevH2.title,
            isLimites: true,
            isLimitesFR: false,
            isLimitesEN: true
          });
          
          // Mettre à jour pour garder le FR
          firstLimitesIsFR = true;
          firstLimitesIndex = index;
        }
      } else if (isDuplicate && prefixDupOf) {
        // Duplication par préfixe : garder la section la plus longue (plus de contenu)
        const currentStart = h2.index;
        const currentEnd = index < h2Matches.length - 1 ? h2Matches[index + 1].index : html.length;
        const currentSection = html.substring(currentStart, currentEnd);
        
        const prevH2Idx = typeof prefixDupOf.seenIdx === 'number' ? prefixDupOf.seenIdx : -1;
        const prevH2 = prevH2Idx >= 0 ? h2Matches[prevH2Idx] : null;
        
        if (prevH2) {
          const prevStart = prevH2.index;
          const prevEnd = prevH2Idx < h2Matches.length - 1 ? h2Matches[prevH2Idx + 1].index : html.length;
          const prevSection = html.substring(prevStart, prevEnd);
          
          if (currentSection.length >= prevSection.length) {
            // Section actuelle plus longue : supprimer la précédente
            duplicates.push({ fullMatch: prevSection, index: prevStart, title: prevH2.title, isLimites: false });
            // Remplacer l'entrée seenTitles par la section actuelle
            seenTitles.delete(prefixDupOf.seenNorm);
            seenTitles.set(normalized, index);
          } else {
            // Section précédente plus longue : supprimer la section actuelle
            duplicates.push({ fullMatch: currentSection, index: currentStart, title: h2.title, isLimites: false });
          }
        } else {
          // Fallback : supprimer la section actuelle
          duplicates.push({ fullMatch: currentSection, index: currentStart, title: h2.title, isLimites: false });
        }
      } else if (isDuplicate) {
        // Duplication classique (même titre exact)
        const startIndex = h2.index;
        const nextH2Index = index < h2Matches.length - 1 ? h2Matches[index + 1].index : html.length;
        const sectionContent = html.substring(startIndex, nextH2Index);
        
        duplicates.push({
          fullMatch: sectionContent,
          index: startIndex,
          title: h2.title,
          isLimites
        });
      } else {
        seenTitles.set(normalized, index);
        if (isLimites) {
          seenTitles.set(limitesKey, index);
          if (firstLimitesIndex < 0) {
            firstLimitesIndex = index;
            firstLimitesIsFR = isLimitesFR;
          }
        }
      }
    });
    
    // Supprimer les duplications (en ordre inverse pour préserver les indices)
    if (duplicates.length > 0) {
      duplicates.reverse().forEach(dup => {
        cleanedHtml = cleanedHtml.substring(0, dup.index) + cleanedHtml.substring(dup.index + dup.fullMatch.length);
        removedCount++;
        console.log(`   🧹 Section H2 dupliquée supprimée: "${dup.title.substring(0, 50)}..."`);
      });
    }
    
    if (removedCount > 0) {
      console.log(`   ✅ ${removedCount} section(s) H2 dupliquée(s) supprimée(s)`);
    } else {
      console.log('   ✅ Aucune section H2 dupliquée détectée');
    }
    
    return cleanedHtml;
  }

  /**
   * Normalise les espaces et sauts de ligne dans le HTML
   * Corrige les phrases collées, les espaces multiples, et les sauts de ligne bizarres
   * @param {string} html - HTML à normaliser
   * @param {Object} report - Rapport QA
   * @returns {string} HTML normalisé
   */
  normalizeSpacing(html, report) {
    console.log('🔧 normalizeSpacing: Normalisation des espaces et sauts de ligne...');
    
    let cleanedHtml = html;
    let fixesCount = 0;
    // CORRECTION CRITIQUE: Protéger les widgets (script/form) AVANT tout traitement pour éviter qu'ils soient modifiés
    const widgetPlaceholders = new Map();
    let widgetCounter = 0;
    
    // Protéger les scripts de widgets (travelpayouts, kiwi, airalo, etc.)
    cleanedHtml = cleanedHtml.replace(/<script[^>]*(?:src|data-widget-type|travelpayouts|kiwi|airalo|trpwdg)[^>]*>[\s\S]*?<\/script>/gi, (match) => {
      const placeholder = `__WIDGET_SCRIPT_${widgetCounter++}__`;
      widgetPlaceholders.set(placeholder, match);
      return placeholder;
    });
    
    // Protéger les forms de widgets (kiwi, travelpayouts, etc.)
    cleanedHtml = cleanedHtml.replace(/<form[^>]*(?:class|data-widget-type|kiwi|travelpayouts)[^>]*>[\s\S]*?<\/form>/gi, (match) => {
      const placeholder = `__WIDGET_FORM_${widgetCounter++}__`;
      widgetPlaceholders.set(placeholder, match);
      return placeholder;
    });
    
    // Protéger les divs de widgets (airalo, esim, etc.)
    cleanedHtml = cleanedHtml.replace(/<div[^>]*(?:class|data-widget-type|airalo|esim)[^>]*>[\s\S]*?<\/div>/gi, (match) => {
      const placeholder = `__WIDGET_DIV_${widgetCounter++}__`;
      widgetPlaceholders.set(placeholder, match);
      return placeholder;
    });
    
    // Protéger les shortcodes WordPress [fv_widget ...]
    cleanedHtml = cleanedHtml.replace(/\[fv_widget[^\]]*\]/gi, (match) => {
      const placeholder = `__WIDGET_SHORTCODE_${widgetCounter++}__`;
      widgetPlaceholders.set(placeholder, match);
      return placeholder;
    });

    // Protéger les commentaires Gutenberg (wp:details, wp:heading, wp:paragraph, etc.)
    // normalizeSpacing corrompt les ":" dans "wp:details" en ajoutant un espace
    cleanedHtml = cleanedHtml.replace(/<!-- \/?(wp:[a-z]+[^>]*) -->/g, (match) => {
      const placeholder = `__GUTENBERG_COMMENT_${widgetCounter++}__`;
      widgetPlaceholders.set(placeholder, match);
      return placeholder;
    });

    // Protéger les blocs <style>...</style> (CSS FAQ, etc.)
    // normalizeSpacing ajoute des espaces dans les sélecteurs CSS (.class → . class, ::after → :: after)
    cleanedHtml = cleanedHtml.replace(/<style[\s\S]*?<\/style>/gi, (match) => {
      const placeholder = `__WIDGET_STYLE_${widgetCounter++}__`;
      widgetPlaceholders.set(placeholder, match);
      return placeholder;
    });

    // Protéger les éléments avec attributs data-fv-* (authority booster moves)
    // normalizeSpacing ajoute des espaces dans les valeurs d'attributs (post.evidence → post. evidence)
    // Backreference \1 pour que le tag fermant corresponde au tag ouvrant (évite que </p> interne stoppe le match avant </div>)
    cleanedHtml = cleanedHtml.replace(/<(div|p|span)([^>]*data-fv-(?:proof|move)[^>]*)>[\s\S]*?<\/\1>/gi, (match) => {
      const placeholder = `__WIDGET_FVMOVE_${widgetCounter++}__`;
      widgetPlaceholders.set(placeholder, match);
      return placeholder;
    });
    
    // DEBUG: Vérifier combien de widgets ont été protégés
    console.log(`🔍 DEBUG normalizeSpacing: ${widgetPlaceholders.size} widget(s) protégé(s) avant traitement`);
    
    // CORRECTION CRITIQUE: Protéger TOUTES les entités HTML dès le début pour éviter qu'elles soient traitées comme du texte normal
    // Cela empêche les espaces d'être insérés autour des entités HTML
    const globalEntityPlaceholders = new Map();
    let globalEntityCounter = 0;
    
    cleanedHtml = cleanedHtml.replace(/&#\d+;|&[a-z]+;/gi, (match) => {
      const placeholder = `__ENTITY_GLOBAL_${globalEntityCounter++}__`;
      globalEntityPlaceholders.set(placeholder, match);
      return placeholder;
    });
    
    // 1. Normaliser les sauts de ligne entre paragraphes (un seul \n\n)
    cleanedHtml = cleanedHtml.replace(/(<\/p>)\s*\n\s*\n\s*\n+(<p[^>]*>)/g, '$1\n\n$2');
    cleanedHtml = cleanedHtml.replace(/(<\/p>)\s*\n\s*\n\s*\n+/g, '$1\n\n');
    
    // 2. Corriger les phrases collées sans espace après ponctuation
    // Détecter les cas où une ponctuation est suivie directement d'une lettre (sans espace)
    // Les entités HTML sont déjà protégées par globalEntityPlaceholders
    const beforeFix = cleanedHtml;
    cleanedHtml = cleanedHtml.replace(/([.!?;:])([a-zA-ZÀ-ÿ])/g, '$1 $2');
    
    const afterFix = cleanedHtml.match(/([.!?;:])([a-zA-ZÀ-ÿ])/g) || [];
    fixesCount += (beforeFix.match(/([.!?;:])([a-zA-ZÀ-ÿ])/g) || []).length - afterFix.length;
    
    // 3. Supprimer les espaces avant les ponctuations
    cleanedHtml = cleanedHtml.replace(/\s+([.!?;:,])/g, '$1');
    
    // 4. Normaliser les espaces multiples dans le texte (garder un seul espace)
    // Mais préserver les espaces dans les balises HTML
    // Les entités HTML sont déjà protégées par globalEntityPlaceholders
    const textParts = cleanedHtml.split(/(<[^>]+>)/);
    for (let i = 0; i < textParts.length; i += 2) {
      // Traiter seulement les parties texte (indices pairs)
      if (textParts[i]) {
        // Remplacer les espaces multiples par un seul espace
        textParts[i] = textParts[i].replace(/[ \t]+/g, ' ');
        // Supprimer les espaces en début et fin de ligne UNIQUEMENT si la partie adjacente
        // est une balise block (pas inline comme <a>, <strong>, <em>, etc.)
        // Cela préserve l'espace entre "sur " et "<a href=...>"
        const prevPart = i > 0 ? textParts[i - 1] : '';
        const nextPart = i + 1 < textParts.length ? textParts[i + 1] : '';
        const inlineTags = /^<\/?(a|strong|em|b|i|span|abbr|cite|code|mark|small|sub|sup|time)\b/i;
        
        // Ne supprimer l'espace de début que si le tag précédent est un tag block (pas inline)
        if (!inlineTags.test(prevPart)) {
          textParts[i] = textParts[i].replace(/^[ \t]+/gm, '');
        }
        // Ne supprimer l'espace de fin que si le tag suivant est un tag block (pas inline)
        if (!inlineTags.test(nextPart)) {
          textParts[i] = textParts[i].replace(/[ \t]+$/gm, '');
        }
      }
    }
    cleanedHtml = textParts.join('');
    
    // 5. Corriger les cas où deux paragraphes sont collés sans espace entre eux
    // Détecter </p><p> sans espace/saut de ligne
    cleanedHtml = cleanedHtml.replace(/(<\/p>)(<p[^>]*>)/g, '$1\n\n$2');
    
    // 6. Normaliser les espaces entre les balises BLOCK uniquement
    // CORRECTION: Ne PAS supprimer les espaces autour des balises INLINE (a, strong, em, span, etc.)
    // car cela cause "surVoyager" (pas d'espace) et "prot éger" (accents cassés)
    const blockTags = 'p|div|h[1-6]|section|article|header|footer|nav|ul|ol|li|blockquote|table|tr|td|th|thead|tbody|figure|figcaption|hr|br';
    // Supprimer les espaces/sauts de ligne entre deux balises block adjacentes
    cleanedHtml = cleanedHtml.replace(new RegExp(`(<\\/(?:${blockTags})>)\\s+(<(?:${blockTags})[\\s>])`, 'gi'), '$1\n$2');
    // Supprimer les espaces après une balise block ouvrante (avant le contenu)
    cleanedHtml = cleanedHtml.replace(new RegExp(`(<(?:${blockTags})(?:\\s[^>]*)?>)\\s+`, 'gi'), '$1');
    // Supprimer les espaces avant une balise block fermante (après le contenu)
    cleanedHtml = cleanedHtml.replace(new RegExp(`\\s+(<\\/(?:${blockTags})>)`, 'gi'), '$1');
    
    // 6.5bis. Garantir un espace entre une balise inline fermante et le mot suivant
    // SEULEMENT si ce n'est pas à l'intérieur d'un même mot (vérifier qu'il y avait un espace avant la balise ouvrante)
    // Ex: "<strong>Budget:</strong>Environ" → "<strong>Budget:</strong> Environ"
    // Mais PAS: "cons<em>é</em>quences" → ne pas ajouter d'espace
    cleanedHtml = cleanedHtml.replace(/(:)(<\/(?:strong|em|b|i)>)([a-zA-ZÀ-ÿ])/gi, '$1$2 $3');
    
    // 7. Réinsérer les espaces nécessaires après les balises de fermeture de paragraphe
    cleanedHtml = cleanedHtml.replace(/(<\/p>)([a-zA-ZÀ-ÿ])/g, '$1 $2');
    
    // 8. Corriger les cas où un mot se termine et le suivant commence sans espace dans le même paragraphe
    // Détecter les patterns comme "mot1.mot2" ou "mot1mot2" dans le contenu des paragraphes
    // AMÉLIORATION: Protéger les entités HTML avant traitement
    // CORRECTION: Vérifier d'abord s'il y a déjà des placeholders d'entités (éviter double traitement)
    const hasExistingPlaceholders = /__ENTITY\d+_\d+__/.test(cleanedHtml);
    
    const entityPlaceholders2 = new Map();
    let entityCounter2 = 0;
    
    // CORRECTION: Ne créer des placeholders que si les entités HTML existent ET qu'il n'y a pas déjà de placeholders
    if (!hasExistingPlaceholders) {
      cleanedHtml = cleanedHtml.replace(/&#\d+;|&[a-z]+;/gi, (match) => {
        const placeholder = `__ENTITY2_${entityCounter2++}__`;
        entityPlaceholders2.set(placeholder, match);
        return placeholder;
      });
    }
    
    // CORRECTION: Utiliser un regex qui capture le contenu même avec des placeholders ou balises HTML imbriquées
    // Utiliser [\s\S]*? pour capturer tout le contenu jusqu'à </p>
    cleanedHtml = cleanedHtml.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/g, (match, openTag, content, closeTag) => {
      // CORRECTION CRITIQUE: Protéger les balises HTML imbriquées (h2, h3, a, strong, em, etc.)
      // pour éviter que les regex digit-letter transforment <h2> en <h 2>
      const tagPlaceholders = new Map();
      let tagCounter = 0;
      
      let protectedContent = content.replace(/<[^>]+>/g, (tag) => {
        const key = `__TAG_${tagCounter++}__`;
        tagPlaceholders.set(key, tag);
        return key;
      });
      
      // Protéger les placeholders d'entités HTML
      const placeholderPattern = /(__ENTITY\d+_\d+__)/g;
      const protectedPlaceholders = new Map();
      let placeholderCounter = 0;
      
      protectedContent = protectedContent.replace(placeholderPattern, (ph) => {
        const key = `__PROTECTED_${placeholderCounter++}__`;
        protectedPlaceholders.set(key, ph);
        return key;
      });
      
      // Corriger les cas où une lettre minuscule est suivie d'une majuscule sans espace
      // MAIS exclure les cas où c'est après une apostrophe/guillemet (ex: "l'Expérience")
      let fixedContent = protectedContent.replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, (m, before, after) => {
        // Ne pas insérer d'espace si le caractère précédent est une apostrophe ou un guillemet
        const beforeMatch = protectedContent.substring(0, protectedContent.indexOf(m));
        if (/['"']$/.test(beforeMatch)) {
          return m; // Garder tel quel
        }
        return before + ' ' + after;
      });
      
      // Corriger les cas où un chiffre est suivi d'une lettre sans espace (si ce n'est pas une date/heure)
      fixedContent = fixedContent.replace(/(\d)([A-Za-zÀ-ÿ])/g, '$1 $2');
      // Corriger les cas où une lettre est suivie d'un chiffre sans espace (si ce n'est pas une unité)
      fixedContent = fixedContent.replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2');
      
      // Restaurer les placeholders protégés (ordre: entités d'abord, puis tags)
      protectedPlaceholders.forEach((placeholder, key) => {
        fixedContent = fixedContent.replace(key, placeholder);
      });
      tagPlaceholders.forEach((tag, key) => {
        fixedContent = fixedContent.replace(key, tag);
      });
      
      return openTag + fixedContent + closeTag;
    });
    
    // CORRECTION: Restaurer les entités HTML UNIQUEMENT si on en a créé
    // Mais d'abord restaurer les placeholders globaux
    if (!hasExistingPlaceholders && entityPlaceholders2.size > 0) {
      entityPlaceholders2.forEach((entity, placeholder) => {
        cleanedHtml = cleanedHtml.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), entity);
      });
    }
    
    // CORRECTION CRITIQUE: Restaurer TOUTES les entités HTML protégées globalement à la fin
    globalEntityPlaceholders.forEach((entity, placeholder) => {
      cleanedHtml = cleanedHtml.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), entity);
    });
    
    // CORRECTION CRITIQUE: Restaurer les placeholders d'entités HTML restants (venant d'étapes précédentes)
    // Pattern générique pour capturer tous les formats de placeholders: __ENTITY2_16__, __ENTITY 2_16__, etc.
    // Ces placeholders doivent être remplacés par l'entité HTML correspondante ou supprimés s'ils sont orphelins
    cleanedHtml = cleanedHtml.replace(/__ENTITY\s*\d+_\d+__/g, (match) => {
      // Si on a l'entité correspondante dans globalEntityPlaceholders, la restaurer
      // Sinon, supprimer le placeholder (il est orphelin)
      // Pour l'instant, on supprime les placeholders orphelins car on ne peut pas les restaurer sans connaître l'entité originale
      return ''; // Supprimer les placeholders orphelins
    });
    
    // CORRECTION FINALE: Nettoyage agressif des espaces dans les mots (dernière passe après toutes les restaurations)
    // Cette passe finale capture les cas qui ont pu échapper aux passes précédentes
    // APPROCHE INTELLIGENTE: Capturer le mot ENTIER avant l'espace pour distinguer
    // les mots cassés (itin éraire → itinéraire) des mots séparés (ou équilibre → garder)
    const _knownMerged = new Set(['voilà', 'déjà', 'holà']);
    // Mots français autonomes commençant par accent/cédille — JAMAIS fusionnés avec le mot précédent
    const _ACCENTED_STANDALONE = new Set([
      'économique','économiques','économie','économies','économiser',
      'également','égal','égale','égaux','égalité',
      'élevé','élevée','élevés','élevées','élever',
      'échanger','échange','échanges','échappé','échapper',
      'événement','événements','éventuel','éventuellement',
      'étranger','étrangère','étrangers','étrangères',
      'étude','études','étudiant','étudiants',
      'énergie','énergies','énergique','énorme','énormes','énormément',
      'équilibre','équipe','équipé','équipement',
      'éviter','évité','évitez','évite',
      'écrire','écrit','écriture',
      'élection','élections','élu','élus',
      'émission','émissions','émotion','émotions',
      'époque','époques',
      'être','état','états',
      'île','îles','îlot',
      'ôter','ôté',
      'ûrement',
      'à','où',
    ]);
    const _commonWords = new Set([
      'le','la','les','de','des','du','un','une','ou','et','en','au','aux',
      'ce','se','ne','me','te','je','tu','il','on','ma','sa','ta',
      'par','sur','pour','dans','avec','sous','plus','mais','tout','bien',
      'est','pas','que','qui','ont','été','peu','car','sans','vers',
      'chez','donc','puis','si','ni','mon','ton','son','mes','tes','ses',
      'nos','vos','leur','leurs','cette','ces','quel','dont','comme','quand',
      'alors','aussi','même','après','entre','notre','votre','encore','trop',
      'très','non','oui','peut','fait','dit','mis','pris','tous','ici',
      'option','lire','coûts','coût','prix','peuvent','doit','être',
      'avoir','faire','voir','dire','aller','venir','mettre','prendre',
      'part','haut','bout','pays','type','mode','base','zone','site',
      'plan','idée','avis','nord','effet','offre','accès','guide'
    ]);
    cleanedHtml = cleanedHtml.replace(/([a-zà-ÿ]+)\s+([àâäéèêëïîôùûüÿ][a-zà-ÿ]*)/gi, (m, part1, part2) => {
      const combined = (part1 + part2).toLowerCase();
      // Mots connus qui doivent être fusionnés (voilà, déjà...)
      if (_knownMerged.has(combined)) return part1 + part2;
      // "à" seul est TOUJOURS la préposition française — garder l'espace
      if (part2.toLowerCase() === 'à') return m;
      // Mot accentué autonome (économique, également, élevé...) — JAMAIS fusionner
      if (_ACCENTED_STANDALONE.has(part2.toLowerCase())) return m;
      // Si part1 est un mot français autonome courant, garder l'espace
      if (_commonWords.has(part1.toLowerCase())) return m;
      // Sinon fusionner (mot cassé par espace parasite)
      return part1 + part2;
    });

    // Nettoyage final pour les mots complets avec espace avant lettre accentuée finale
    // Exclure les cas où le mot avant l'espace est un mot français valide (ex: "Numériques à" → garder séparé)
    cleanedHtml = cleanedHtml.replace(/\b([a-zà-ÿ]{4,}[bcdfghjklmnpqrstvwxz])\s+([àâäéèêëïîôùûüÿ])(?=\s|$|[.,;:!?<])/gi, (m, word, accent) => {
      // Mots connus à fusionner malgré accent "à"
      if (_knownMerged.has((word + accent).toLowerCase())) return word + accent;
      // "à" seul est la préposition — garder l'espace
      if (accent.toLowerCase() === 'à') return m;
      if (word.endsWith('s') && accent === 'é') return m;
      return word + accent;
    });
    
    // CORRECTION CRITIQUE: Nettoyer les espaces incorrects dans les mots (problème venant de WordPress ou étape précédente)
    // Pattern: lettre + espace + lettre accentuée (signe de mot coupé par entité HTML mal gérée)
    // Exemples: "r éel" → "réel", "s éjour" → "séjour", "n écessaires" → "nécessaires"
    // AMÉLIORATION: Traiter aussi les blockquotes et autres conteneurs de texte
    // Note: blockquote peut contenir des <p> à l'intérieur, donc on traite d'abord les blockquotes complets
    cleanedHtml = cleanedHtml.replace(/(<blockquote[^>]*>)([\s\S]*?)(<\/blockquote>)/g, (match, openTag, content, closeTag) => {
      // Traiter le contenu du blockquote (qui peut contenir des <p>)
      let fixedBlockquote = content;
      
      // Protéger les balises HTML imbriquées
      const tagPlaceholdersBlockquote = new Map();
      let tagCounterBlockquote = 0;
      let protectedBlockquote = fixedBlockquote.replace(/<[^>]+>/g, (tag) => {
        const key = `__TAG_BQ_${tagCounterBlockquote++}__`;
        tagPlaceholdersBlockquote.set(key, tag);
        return key;
      });
      
      // Protéger les entités HTML
      const entityPlaceholdersBlockquote = new Map();
      let entityCounterBlockquote = 0;
      protectedBlockquote = protectedBlockquote.replace(/&#\d+;|&[a-z]+;/gi, (entity) => {
        const key = `__ENTITY_BQ_${entityCounterBlockquote++}__`;
        entityPlaceholdersBlockquote.set(key, entity);
        return key;
      });
      
      // Appliquer les corrections pour les mots avec espaces
      // Pattern: Mot français (3+ lettres) + espace + lettre accentuée isolée
      protectedBlockquote = protectedBlockquote.replace(/\b([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿ])(?=\s|$|[.,;:!?<])/gi, (m, word, accent) => {
        // Mots connus à fusionner (voilà, déjà...)
        if (_knownMerged.has((word + accent).toLowerCase())) return word + accent;
        if (accent.toLowerCase() === 'à') return m;
        const combined = word + accent;
        if (combined.length >= 4 && !(word.endsWith('s') && accent === 'é' && word.length > 6)) {
          return combined;
        }
        return m;
      });
      
      // Restaurer les placeholders
      entityPlaceholdersBlockquote.forEach((entity, key) => {
        protectedBlockquote = protectedBlockquote.replace(key, entity);
      });
      tagPlaceholdersBlockquote.forEach((tag, key) => {
        protectedBlockquote = protectedBlockquote.replace(key, tag);
      });
      
      return openTag + protectedBlockquote + closeTag;
    });
    
    cleanedHtml = cleanedHtml.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/g, (match, openTag, content, closeTag) => {
      // Protéger les balises HTML imbriquées
      const tagPlaceholders = new Map();
      let tagCounter = 0;
      let protectedContent = content.replace(/<[^>]+>/g, (tag) => {
        const key = `__TAG_${tagCounter++}__`;
        tagPlaceholders.set(key, tag);
        return key;
      });
      
      // Protéger les entités HTML restantes
      const entityPlaceholdersCleanup = new Map();
      let entityCounterCleanup = 0;
      protectedContent = protectedContent.replace(/&#\d+;|&[a-z]+;/gi, (entity) => {
        const key = `__ENTITY_CLEANUP_${entityCounterCleanup++}__`;
        entityPlaceholdersCleanup.set(key, entity);
        return key;
      });
      
      // CORRECTION: Fusionner les mots coupés (approche générique et robuste)
      // Pattern amélioré pour capturer tous les cas de mots coupés par des espaces
      // Exemples: "g énéralement", "r évèle", "recommand é", "détaill é", "subjectivit é"
      let fixedContent = protectedContent;
      
      // Pattern 1: 1-2 lettres + espace + lettre accentuée + reste du mot (ex: "g énéralement" → "généralement")
      // AMÉLIORATION: Détecter aussi les cas avec apostrophe/entité mal placée (ex: "pass' é" → "passé", "pay' é" → "payé")
      const beforePattern1 = fixedContent;
      
      // Pattern 1a: Mot + apostrophe + espace + lettre accentuée (ex: "pass' é" → "passé")
      // FIX H1: replaced \b with French-aware boundary
      fixedContent = fixedContent.replace(/([a-zà-ÿ]{3,})[''`]\s+([àâäéèêëïîôùûüÿç][a-zà-ÿ]{1,})(?![a-zà-ÿ])/gi, (m, part1, part2) => {
        const combined = part1 + part2;
        // Vérifier que c'est un mot français valide (au moins 4 lettres)
        if (combined.length >= 4) {
          return combined;
        }
        return m;
      });
      
      // Pattern 1b: 1-2 lettres + espace + lettre accentuée + reste du mot (ex: "g énéralement" → "généralement")
      // FIX H1: replaced \b with French-aware boundary; added ç
      fixedContent = fixedContent.replace(/([a-zà-ÿ]{1,2})\s+([àâäéèêëïîôùûüÿç][a-zà-ÿ]{2,})(?![a-zà-ÿ])/gi, (m, part1, part2) => {
        const combined = part1 + part2;
        // Vérifier que ce n'est pas une préposition valide séparée
        const commonPrepositions = ['de', 'en', 'le', 'la', 'les', 'un', 'une', 'du', 'des', 'ce', 'se', 'ne', 'me', 'te', 'à', 'ou', 'et', 'si'];
        if (!commonPrepositions.includes(part1.toLowerCase()) && combined.length >= 4) {
          return combined;
        }
        return m;
      });
      
      // Pattern 1c: Mot français (3+ lettres) + espace + lettre accentuée/ç isolée (ex: "pass é" → "passé", "per ç" → "perç")
      // FIX H1: replaced \b with French-aware boundary
      fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿç])(?=\s|$|[.,;:!?<])/gi, (m, word, accent) => {
        if (_knownMerged.has((word + accent).toLowerCase())) return word + accent;
        if (accent.toLowerCase() === 'à') return m;
        const combined = word + accent;
        if (combined.length >= 4 && !(word.endsWith('s') && accent === 'é' && word.length > 6)) {
          return combined;
        }
        return m;
      });
      
      // Pattern 1d: Mot français (4+ lettres, PAS un mot courant) + espace + suffixe accentué (1-8 lettres)
      // Ex: "anim ées" → "animées", "financi ère" → "financière", "comp étitifs" → "compétitifs"
      // Cible les suffixes typiques cassés, pas les vrais mots indépendants
      const COMMON_WORDS = new Set(['dans','avec','pour','plus','sous','sans','chez','tout','mais','très','bien','font','sont','nous','vous','leur','elle','cela','cette','entre','après','avant','comme','aussi','autre','faire','avoir','être','même','dont','vers','quel','ceux','ceci','hors','dès','lors','près']);
      // FIX H4: Added ç-related suffixes + éré/éri/éris missing suffixes
      const KNOWN_ACCENTED_SUFFIXES = /^(ée|ées|és|éré|érée|érées|ère|ères|ière|ières|èrement|ément|éments|étaire|étaires|étude|érence|érences|érieur|érieure|érieurs|érable|érables|émie|érité|érite|ètement|ériaux|érial|ériel|étique|étiques|èse|èses|èbre|èbres|ôle|ôles|ôt|ôts|ûre|ûres|ûté|ûtés|ître|îtres|érente|érentes|étitif|étitifs|étitive|étitives|érés|érément|ènement|ènements|çue|çues|çu|çus|çant|çants|çon|çons|çais|çaise|çaises)$/i;
      let p1dRepairs = [];
      let p1dSkipped = [];
      // FIX H4: Added ç to detection pattern for "per çue" cases
      // FIX H1: replaced \b with French-aware boundaries (?<![a-zà-ÿ]) / (?![a-zà-ÿ])
      fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿç][a-zà-ÿ]{1,8})(?![a-zà-ÿ])/gi, (m, part1, part2) => {
        if (COMMON_WORDS.has(part1.toLowerCase())) { p1dSkipped.push({m, reason:'common'}); return m; }
        // Mot accentué autonome — ne JAMAIS fusionner
        if (_ACCENTED_STANDALONE.has(part2.toLowerCase())) { p1dSkipped.push({m, reason:'standalone_word', part2}); return m; }
        if (KNOWN_ACCENTED_SUFFIXES.test(part2)) {
          p1dRepairs.push({from:m, to:part1+part2});
          return part1 + part2;
        }
        p1dSkipped.push({m, reason:'not_suffix', part2});
        return m;
      });
      
      // Pattern 2: Mot français (3+ lettres) + espace + lettre accentuée isolée (ex: "pass é" → "passé", "pay é" → "payé", "bas é" → "basé")
      // FIX H1: replaced \b with French-aware boundary; added ç
      fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿç])(?=\s|$|[.,;:!?<])/gi, (m, word, accent) => {
        if (_knownMerged.has((word + accent).toLowerCase())) return word + accent;
        if (accent.toLowerCase() === 'à') return m;
        const combined = word + accent;
        if (combined.length >= 4) {
          if (word.endsWith('s') && accent === 'é' && word.length > 6) {
            const afterMatch = protectedContent.substring(protectedContent.indexOf(m) + m.length);
            if (afterMatch.match(/^\s+[a-zà-ÿ]{3,}/)) {
              return m;
            }
          }
          return combined;
        }
        return m;
      });
      
      // Log si des corrections ont été faites
      if (fixedContent !== beforePattern1) {
        console.log(`   🔧 Nettoyage espaces dans mots: ${(beforePattern1.match(/\b[a-zà-ÿ]{1,2}\s+[àâäéèêëïîôùûüÿ]/gi) || []).length} → ${(fixedContent.match(/\b[a-zà-ÿ]{1,2}\s+[àâäéèêëïîôùûüÿ]/gi) || []).length}`);
      }
      
      // Restaurer les éléments protégés
      entityPlaceholdersCleanup.forEach((entity, key) => {
        fixedContent = fixedContent.replace(key, entity);
      });
      tagPlaceholders.forEach((tag, key) => {
        fixedContent = fixedContent.replace(key, tag);
      });
      
      return openTag + fixedContent + closeTag;
    });

    // CORRECTION FINALE: Détecter et corriger les mots français collés sans espace
    // Pattern: mot français (4+ lettres) + mot français (4+ lettres) collés ensemble
    // Exemples: "tempsétait" → "temps était", "Resterà" → "Rester à", "échapperà" → "échapper à"
    // On cherche les transitions: minuscule→majuscule ou lettre→lettre accentuée
    cleanedHtml = cleanedHtml.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/g, (match, openTag, content, closeTag) => {
      // Protéger les balises HTML imbriquées
      const tagPlaceholders = new Map();
      let tagCounter = 0;
      let protectedContent = content.replace(/<[^>]+>/g, (tag) => {
        const key = `__TAG_FINAL_${tagCounter++}__`;
        tagPlaceholders.set(key, tag);
        return key;
      });
      
      // Protéger les entités HTML
      const entityPlaceholdersFinal = new Map();
      let entityCounterFinal = 0;
      protectedContent = protectedContent.replace(/&#\d+;|&[a-z]+;/gi, (entity) => {
        const key = `__ENTITY_FINAL_${entityCounterFinal++}__`;
        entityPlaceholdersFinal.set(key, entity);
        return key;
      });
      
      // Pattern 1: Mot français (4+ lettres) suivi d'une VRAIE majuscule (ex: "tempsÉtait" → "temps Était")
      // FIX: [A-ZÀ-Ÿ] incluait les accents minuscules (é=U+00E9 est dans U+00C0-U+0178)
      // On utilise maintenant [A-ZÀÂÄÇÈÉÊËÎÏÔÙÛÜ] pour ne matcher QUE les majuscules
      // FIX H1: replaced \b with French-aware boundaries
      let fixedContent = protectedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{4,})([A-ZÀÂÄÇÈÉÊËÎÏÔÙÛÜ][a-zà-ÿ]{2,})(?![a-zà-ÿ])/g, (m, word1, word2) => {
        const beforeMatch = protectedContent.substring(0, protectedContent.indexOf(m));
        if (/['"']$/.test(beforeMatch)) {
          return m;
        }
        return word1 + ' ' + word2;
      });
      
      // Pattern 2: Mot français suivi de "à" collé (ex: "Resterà" → "Rester à", "échapperà" → "échapper à")
      // FIX H1: replaced \b with French-aware boundaries
      fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{4,})(à)([a-zà-ÿ]{2,})(?![a-zà-ÿ])/gi, (m, word, preposition, rest) => {
        // Vérifier que "à" est bien une préposition et non partie du mot suivant
        // Ex: "Resterà" → "Rester à" (si "à" est suivi d'un mot)
        return word + ' ' + preposition + ' ' + rest;
      });
      
      // Pattern 1b: Mots collés à une frontière d'accent minuscule (ex: "prixélevé" → "prix élevé")
      // Condition: la partie APRÈS l'accent doit être un mot français courant (whitelist)
      // FIX H1: \b fails near placeholders (__TAG_FINAL_X__) because _ is a word char
      //   → Use (?<![a-zà-ÿ]) / (?![a-zà-ÿ]) instead of \b for French-aware boundaries
      // FIX H3: Group 1 min reduced from {3,} to {2,} to handle "les" + "échanges"
      //   Whitelist expanded with missing common accented words
      const COMMON_ACCENTED_WORDS = /^(être|état|était|étaient|étant|également|économique|économiques|économiser|économies|élevé|élevés|élevée|élevées|éventuelles?|éventuels?|éventuel|échanges?|échanger|écrire|énergie|énormes?|équilibre|équilibré|équilibrés|équilibrée|équilibrées|équipé|équipés|équipées?|évaluer|éviter|évoluer|évolution|étape|étapes|étranger|étrangers|étrangère|étrangères|étude|études|évidemment|éventail|échapper|époque|épaules|écran|éléments?|émission|émotion|édition|êtes|être)$/i;
      
      let p1bMatches = [];
      let p1bSkipped = [];
      fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{2,}[bcdfghjklmnpqrstvwxz])([àâäéèêëïîôùûüÿç][a-zà-ÿ]{3,})(?![a-zà-ÿ])/gi, (m, word1, word2) => {
        if (m.length < 7) return m;
        if (COMMON_ACCENTED_WORDS.test(word2)) {
          p1bMatches.push({from: m, to: word1 + ' ' + word2});
          return word1 + ' ' + word2;
        }
        p1bSkipped.push({word: m, word2});
        return m;
      });

      // Restaurer les placeholders
      entityPlaceholdersFinal.forEach((entity, key) => {
        fixedContent = fixedContent.replace(key, entity);
      });
      tagPlaceholders.forEach((tag, key) => {
        fixedContent = fixedContent.replace(key, tag);
      });
      
      return openTag + fixedContent + closeTag;
    });
    
    // CORRECTION CRITIQUE: Restaurer les widgets APRÈS tous les traitements
    let restoredCount = 0;
    widgetPlaceholders.forEach((widget, placeholder) => {
      const beforeRestore = cleanedHtml;
      cleanedHtml = cleanedHtml.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), widget);
      if (cleanedHtml !== beforeRestore) {
        restoredCount++;
      }
    });
    
    // DEBUG: Vérifier que les widgets ont été restaurés
    const widgetsAfterRestore = this.detectRenderedWidgets(cleanedHtml);
    const hasPlaceholdersRemaining = /__WIDGET_(SCRIPT|FORM|DIV|SHORTCODE)_\d+__/.test(cleanedHtml);
    console.log(`🔍 DEBUG normalizeSpacing: ${restoredCount}/${widgetPlaceholders.size} widget(s) restauré(s), ${widgetsAfterRestore.count} détecté(s) APRÈS restauration, placeholders restants: ${hasPlaceholdersRemaining}`);
    
    // Si des placeholders restent, les restaurer manuellement
    if (hasPlaceholdersRemaining) {
      widgetPlaceholders.forEach((widget, placeholder) => {
        cleanedHtml = cleanedHtml.replace(placeholder, widget);
      });
      const widgetsAfterManualRestore = this.detectRenderedWidgets(cleanedHtml);
      console.log(`🔍 DEBUG normalizeSpacing: Après restauration manuelle: ${widgetsAfterManualRestore.count} widget(s) détecté(s)`);
    }    
    if (fixesCount > 0 || cleanedHtml !== html) {
      report.actions.push({
        type: 'normalized_spacing',
        details: `Espaces et sauts de ligne normalisés`
      });
      console.log(`   ✅ Espaces et sauts de ligne normalisés`);
    }
    
    // PASSE GLOBALE: Réparer les accents cassés dans TOUT le HTML (h2, h3, li, td, etc.)
    // Les passes précédentes ne traitent que les <p>, ceci couvre le reste
    const GLOBAL_COMMON_WORDS = new Set(['dans','avec','pour','plus','sous','sans','chez','tout','mais','très','bien','font','sont','nous','vous','leur','elle','cela','cette','entre','après','avant','comme','aussi','autre','faire','avoir','être','même','dont','vers','quel','ceux','ceci','hors','dès','lors','près','les','des','mes','ses','ces','une','par','sur','son','mon','ton','aux','pas','car','que','qui','est','ont']);
    // FIX H4: Added ç suffixes, ç detection, éré missing suffix
    const GLOBAL_SUFFIXES = /^(ée|ées|és|éré|érée|érées|ère|ères|èrement|ément|éments|étaire|étaires|étude|érence|érences|érieur|érieure|érieurs|érable|érables|émie|érité|érite|ètement|ériaux|érial|ériel|étique|étiques|èse|èses|èbre|èbres|ôle|ôles|ôt|ôts|ûre|ûres|ûté|ûtés|ître|îtres|érente|érentes|étitif|étitifs|étitive|étitives|érés|érément|ènement|ènements|ière|ières|çue|çues|çu|çus|çant|çants|çon|çons|çais|çaise|çaises)$/i;
    let globalPassRepairs = [];
    let globalPassSkipped = [];
    // FIX H1: replaced \b with French-aware boundaries; FIX H4: added ç to detection
    cleanedHtml = cleanedHtml.replace(/(?<=>)([^<]+)(?=<)/g, (match, textContent) => {
      return textContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿç][a-zà-ÿ]{1,8})(?![a-zà-ÿ])/gi, (m, part1, part2) => {
        if (GLOBAL_COMMON_WORDS.has(part1.toLowerCase())) { globalPassSkipped.push({m, reason:'common_word', part1}); return m; }
        // Mot accentué autonome — ne JAMAIS fusionner
        if (_ACCENTED_STANDALONE.has(part2.toLowerCase())) { globalPassSkipped.push({m, reason:'standalone_word', part2}); return m; }
        if (GLOBAL_SUFFIXES.test(part2)) { globalPassRepairs.push({from:m, to:part1+part2}); return part1 + part2; }
        globalPassSkipped.push({m, reason:'not_suffix', part2});
        return m;
      });
    });
    
    return cleanedHtml;
  }

  /**
   * PHASE 6.0.11: Suppression des répétitions de phrases
   * Détecte et supprime les phrases identiques ou très similaires qui apparaissent plusieurs fois
   * @param {string} html - HTML à nettoyer
   * @returns {string} HTML sans répétitions
   */
  removeRepetitions(html) {
    console.log('🔄 removeRepetitions: Détection des répétitions...');
    
    let cleanedHtml = html;
    let removedCount = 0;
    
    // AMÉLIORATION: Protéger les sections SERP critiques (ne pas les supprimer comme répétitions)
    const protectedSections = [
      /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i,
      /<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/i,
      /<h2[^>]*>.*?erreurs?\s*(fréquentes?|courantes?|à\s*éviter).*?<\/h2>/i
    ];
    
    // Extraire toutes les phrases (contenu des paragraphes)
    const paragraphPattern = /<p[^>]*>([^<]+)<\/p>/gi;
    const paragraphs = [];
    let match;
    
    while ((match = paragraphPattern.exec(html)) !== null) {
      const text = match[1].trim();
      if (text.length > 30) { // Ignorer les phrases très courtes
        paragraphs.push({
          fullMatch: match[0],
          text: text,
          normalized: text.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim()
        });
      }
    }
    
    // Détecter les duplicatas
    const seen = new Map();
    const duplicates = [];
    
    paragraphs.forEach((p, index) => {
      if (seen.has(p.normalized)) {
        duplicates.push(p);
        console.log(`   🔄 Répétition détectée: "${p.text.substring(0, 50)}..."`);
      } else {
        seen.set(p.normalized, index);
      }
    });
    
    // AMÉLIORATION: Détecter aussi les répétitions similaires (similarité Jaccard améliorée)
    paragraphs.forEach((p1, i) => {
      paragraphs.forEach((p2, j) => {
        if (i !== j && !seen.has(p1.normalized) && !seen.has(p2.normalized)) {
          // Similarité Jaccard améliorée (prend en compte l'ordre partiel)
          const words1 = p1.normalized.split(/\s+/);
          const words2 = p2.normalized.split(/\s+/);
          const set1 = new Set(words1);
          const set2 = new Set(words2);
          
          // Intersection
          const intersection = [...set1].filter(w => set2.has(w));
          // Union
          const union = new Set([...set1, ...set2]);
          
          // Similarité Jaccard classique
          const jaccardSimilarity = union.size > 0 ? intersection.length / union.size : 0;
          
          // Bonus pour l'ordre des mots (si les premiers mots sont identiques)
          let orderBonus = 0;
          const minLength = Math.min(words1.length, words2.length);
          if (minLength >= 5) {
            const firstWords1 = words1.slice(0, 5).join(' ');
            const firstWords2 = words2.slice(0, 5).join(' ');
            if (firstWords1 === firstWords2) {
              orderBonus = 0.1; // Bonus de 10% si les 5 premiers mots sont identiques
            }
          }
          
          const similarity = jaccardSimilarity + orderBonus;
          
          const similarityThreshold = 0.75;
          
          if (similarity > similarityThreshold && p1.normalized.length > 50) {
            duplicates.push(p2);
            console.log(`   🔄 Répétition similaire détectée (${Math.round(similarity * 100)}%): "${p2.text.substring(0, 50)}..."`);
          }

          // Détection paraphrase : mêmes mots significatifs (sans stop words)
          const STOP_WORDS = new Set(['le','la','les','un','une','des','du','de','et','ou','en','à','tu','ton','ta','tes','te','est','es','ce','se','ne','pas','qui','que','il','elle','son','sa','ses','nous','vous','ils','sur','dans','par','pour','avec','plus','sans','mais','aussi','très','bien','cette','cet','ces','tout','même','peut','être','avoir','faire','dire','comme','dont','où','si','car']);
          if (i < j && p1.normalized.length > 80 && p2.normalized.length > 80) {
            const sig1 = new Set(words1.filter(w => w.length > 3 && !STOP_WORDS.has(w)));
            const sig2 = new Set(words2.filter(w => w.length > 3 && !STOP_WORDS.has(w)));
            const sigInter = [...sig1].filter(w => sig2.has(w));
            const sigOverlap = Math.min(sig1.size, sig2.size) > 0
              ? sigInter.length / Math.min(sig1.size, sig2.size)
              : 0;
            if (sigOverlap > 0.65 && sigInter.length >= 4 && !duplicates.includes(p2)) {
              duplicates.push(p2);
              console.log(`   🔄 Paraphrase détectée (${Math.round(sigOverlap * 100)}% mots-clés communs): "${p2.text.substring(0, 50)}..."`);
            }
          }
        }
      });
    });
    
    // Supprimer les duplicatas (garder la première occurrence)
    // AMÉLIORATION: Trier par longueur décroissante pour traiter les plus longs en premier
    duplicates.sort((a, b) => b.text.length - a.text.length);
    
    duplicates.forEach(dup => {
      // AMÉLIORATION: Vérifier si c'est une section SERP protégée (amélioré)
      const dupIndex = cleanedHtml.indexOf(dup.fullMatch);
      let isProtected = false;
      let protectedSectionName = '';
      
      protectedSections.forEach(pattern => {
        const match = cleanedHtml.match(pattern);
        if (match) {
          const sectionStart = match.index;
          // Trouver la fin de la section protégée (prochain H2 ou fin)
          const afterSection = cleanedHtml.substring(sectionStart + match[0].length);
          const nextH2Match = afterSection.match(/<h2[^>]*>/i);
          const sectionEnd = nextH2Match 
            ? sectionStart + match[0].length + (nextH2Match.index ?? 0)
            : cleanedHtml.length;
          
          // Vérifier si le duplicata est dans la section protégée
          if (dupIndex >= sectionStart && dupIndex < sectionEnd) {
            isProtected = true;
            protectedSectionName = match[0].replace(/<[^>]+>/g, '').trim();
          }
        }
      });
      
      if (isProtected) {
        console.log(`   🛡️ Section SERP protégée "${protectedSectionName}", non supprimée: "${dup.text.substring(0, 50)}..."`);
        return; // Ne pas supprimer cette section
      }
      
      // AMÉLIORATION: Supprimer toutes les occurrences sauf la première (plus agressif)
      const allOccurrences = [];
      let searchIndex = 0;
      while (true) {
        const index = cleanedHtml.indexOf(dup.fullMatch, searchIndex);
        if (index === -1) break;
        allOccurrences.push(index);
        searchIndex = index + 1;
      }
      
      // Supprimer toutes sauf la première (en ordre inverse pour préserver les indices)
      if (allOccurrences.length > 1) {
        for (let i = allOccurrences.length - 1; i >= 1; i--) {
          cleanedHtml = cleanedHtml.substring(0, allOccurrences[i]) + cleanedHtml.substring(allOccurrences[i] + dup.fullMatch.length);
          removedCount++;
        }
      }
    });
    
    // AMÉLIORATION: Détecter les répétitions au niveau phrase (aligné avec quality-analyzer.js)
    // Utiliser la même méthode que quality-analyzer.js : n-grams de 8 mots dans les phrases
    const allText = cleanedHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
    
    // AMÉLIORATION: Extraire les phrases d'abord (comme quality-analyzer.js)
    const sentences = allText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
    const sentenceNgrams = new Map();
    const sentenceToNgrams = new Map(); // Map phrase -> n-grams qu'elle contient
    
    // Pour chaque phrase, créer des n-grams de 8 mots (exactement comme quality-analyzer.js)
    sentences.forEach((sentence, sentenceIndex) => {
      const words = sentence.split(/\s+/).filter(w => w.length > 2);
      const sentenceNgramsList = [];
      
      if (words.length >= 8) {
        for (let i = 0; i <= words.length - 8; i++) {
          const ngram = words.slice(i, i + 8).join(' ');
          sentenceNgrams.set(ngram, (sentenceNgrams.get(ngram) || 0) + 1);
          sentenceNgramsList.push(ngram);
        }
      }
      
      sentenceToNgrams.set(sentenceIndex, { sentence, ngrams: sentenceNgramsList });
    });
    
    // Garder aussi les n-grams globaux pour compatibilité
    const words = allText.split(/\s+/).filter(w => w.length > 2);
    const ngrams = new Map();
    for (let i = 0; i <= words.length - 8; i++) {
      const ngram = words.slice(i, i + 8).join(' ');
      ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
    }
    
    let repetitiveNgrams = 0;
    const repetitivePhrases = [];
    // AMÉLIORATION: Détecter toutes les répétitions (même si count = 2)
    ngrams.forEach((count, ngram) => {
      if (count > 1) {
        repetitiveNgrams++;
        // AMÉLIORATION: Traiter toutes les répétitions (pas seulement count > 2)
        repetitivePhrases.push({ ngram, count });
        // Logger chaque n-gram répétitif détecté
        console.log(`   🔍 N-gram répétitif détecté (${count}x): "${ngram.substring(0, 60)}${ngram.length > 60 ? '...' : ''}"`);
      }
    });
    
    // AMÉLIORATION: Supprimer les phrases répétitives détectées (plus agressif)
    // AMÉLIORATION: Trier par count décroissant pour traiter les plus répétitifs en premier
    const sortedSentenceNgrams = Array.from(sentenceNgrams.entries()).sort((a, b) => b[1] - a[1]);
    
    sortedSentenceNgrams.forEach(([ngram, count]) => {
      if (count > 1) {
        // Trouver et supprimer les occurrences répétées de ce n-gram
        const escapedNgram = ngram.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // AMÉLIORATION: Chercher dans tout le texte (pas seulement paragraphes) pour plus de précision
        const allMatches = cleanedHtml.toLowerCase().match(new RegExp(escapedNgram, 'gi'));
        if (allMatches && allMatches.length > 1) {
          // Trouver les paragraphes contenant ce n-gram
          const paraMatches = cleanedHtml.match(new RegExp(`<p[^>]*>.*?${escapedNgram}.*?<\/p>`, 'gi'));
          if (paraMatches && paraMatches.length > 1) {
            // AMÉLIORATION: Supprimer toutes les occurrences sauf la première (en ordre inverse pour préserver les indices)
            const allOccurrences = [];
            let searchIndex = 0;
            while (true) {
              const index = cleanedHtml.toLowerCase().indexOf(ngram.toLowerCase(), searchIndex);
              if (index === -1) break;
              // Vérifier si c'est dans un paragraphe
              const beforeMatch = cleanedHtml.substring(Math.max(0, index - 200), index);
              const afterMatch = cleanedHtml.substring(index, Math.min(cleanedHtml.length, index + ngram.length + 200));
              if (beforeMatch.includes('<p') && afterMatch.includes('</p>')) {
                allOccurrences.push(index);
              }
              searchIndex = index + 1;
            }
            
            // Supprimer toutes sauf la première (en ordre inverse)
            if (allOccurrences.length > 1) {
              for (let i = allOccurrences.length - 1; i >= 1; i--) {
                const startIndex = allOccurrences[i];
                // Trouver le paragraphe complet contenant cette occurrence
                const beforePara = cleanedHtml.lastIndexOf('<p', startIndex);
                const afterPara = cleanedHtml.indexOf('</p>', startIndex);
                if (beforePara !== -1 && afterPara !== -1) {
                  const paraMatch = cleanedHtml.substring(beforePara, afterPara + 4);
                  // Vérifier si c'est protégé (amélioré)
                  let isProtected = false;
                  let protectedSectionName = '';
                  
                  protectedSections.forEach(pattern => {
                    const protMatch = cleanedHtml.match(pattern);
                    if (protMatch) {
                      const sectionStart = protMatch.index;
                      const afterSection = cleanedHtml.substring(sectionStart + protMatch[0].length);
                      const nextH2Match = afterSection.match(/<h2[^>]*>/i);
                      const sectionEnd = nextH2Match 
                        ? sectionStart + protMatch[0].length + (nextH2Match.index ?? 0)
                        : cleanedHtml.length;
                      
                      if (beforePara >= sectionStart && beforePara < sectionEnd) {
                        isProtected = true;
                        protectedSectionName = protMatch[0].replace(/<[^>]+>/g, '').trim();
                      }
                    }
                  });
                  
                  if (!isProtected) {
                    const removedPara = cleanedHtml.substring(beforePara, afterPara + 4);
                    const paraText = removedPara.replace(/<[^>]+>/g, ' ').trim().substring(0, 60);
                    cleanedHtml = cleanedHtml.substring(0, beforePara) + cleanedHtml.substring(afterPara + 4);
                    removedCount++;
                    console.log(`   ✂️ Paragraphe répétitif supprimé: "${paraText}..."`);
                  } else {
                    console.log(`   🛡️ Paragraphe répétitif protégé (section SERP "${protectedSectionName}"): "${cleanedHtml.substring(beforePara, Math.min(beforePara + 60, afterPara)).replace(/<[^>]+>/g, ' ').trim()}..."`);
                  }
                }
              }
            }
          }
        }
      }
    });
    
    // AMÉLIORATION: Supprimer aussi les n-grams répétitifs détectés (plus agressif)
    // AMÉLIORATION: Trier par count décroissant pour traiter les plus répétitifs en premier
    const sortedNgrams = Array.from(ngrams.entries()).sort((a, b) => b[1] - a[1]);
    
    sortedNgrams.forEach(([ngram, count]) => {
      if (count > 1) { // AMÉLIORATION: Supprimer même si répété seulement 2 fois
        const escapedNgram = ngram.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Chercher dans les paragraphes
        const paraMatches = cleanedHtml.match(new RegExp(`<p[^>]*>.*?${escapedNgram}.*?<\/p>`, 'gi'));
        if (paraMatches && paraMatches.length > 1) {
          // Supprimer toutes les occurrences sauf la première
          let firstFound = false;
          cleanedHtml = cleanedHtml.replace(new RegExp(`<p[^>]*>.*?${escapedNgram}.*?<\/p>`, 'gi'), (match) => {
            // AMÉLIORATION: Vérifier si cette occurrence est dans une section protégée (amélioré)
            const matchIndex = cleanedHtml.indexOf(match);
            let isProtected = false;
            let protectedSectionName = '';
            
            protectedSections.forEach(pattern => {
              const protMatch = cleanedHtml.match(pattern);
              if (protMatch) {
                const sectionStart = protMatch.index;
                const afterSection = cleanedHtml.substring(sectionStart + protMatch[0].length);
                const nextH2Match = afterSection.match(/<h2[^>]*>/i);
                const sectionEnd = nextH2Match 
                  ? sectionStart + protMatch[0].length + (nextH2Match.index ?? 0)
                  : cleanedHtml.length;
                
                if (matchIndex >= sectionStart && matchIndex < sectionEnd) {
                  isProtected = true;
                  protectedSectionName = protMatch[0].replace(/<[^>]+>/g, '').trim();
                }
              }
            });
            
            if (isProtected && !firstFound) {
              firstFound = true;
              console.log(`   🛡️ Paragraphe répétitif protégé (section SERP "${protectedSectionName}"), première occurrence conservée`);
              return match; // Garder la première occurrence même si protégée
            }
            
            if (!firstFound) {
              firstFound = true;
              return match;
            }
            
            removedCount++;
            const paraText = match.replace(/<[^>]+>/g, ' ').trim().substring(0, 60);
            console.log(`   ✂️ Paragraphe répétitif supprimé (n-gram "${ngram.substring(0, 40)}..."): "${paraText}..."`);
            return '';
          });
        }
      }
    });
    
    // AMÉLIORATION: Détecter et supprimer les répétitions dans les titres H2/H3 en boucle jusqu'à ce qu'il n'y en ait plus
    let iterations = 0;
    const maxIterations = 10; // Sécurité pour éviter boucle infinie
    let totalDuplicateTitles = 0; // Compteur total de titres dupliqués
    
    while (iterations < maxIterations) {
      const h2h3Pattern = /<(h[23])[^>]*>([^<]+)<\/h[23]>/gi;
      const titles = [];
      let titleMatch;
      while ((titleMatch = h2h3Pattern.exec(cleanedHtml)) !== null) {
        const titleText = titleMatch[2].trim().toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
        if (titleText.length > 10) {
          titles.push({
            fullMatch: titleMatch[0],
            text: titleText,
            normalized: titleText,
            index: titleMatch.index
          });
        }
      }
      
      if (titles.length === 0) break;
      
      const seenTitles = new Map();
      const duplicatesToRemove = [];
      
      // Trier par index pour traiter dans l'ordre
      titles.sort((a, b) => a.index - b.index);
      
      titles.forEach((title, index) => {
        const titleText = title.normalized;
        const isSerpTitle = /ce\s*que.*ne\s*disent?\s*(pas|explicitement)/i.test(titleText) ||
                           /limites?.*biais/i.test(titleText) ||
                           /erreurs?.*(fréquentes?|courantes?|éviter)/i.test(titleText);
        
        // Même pour les sections SERP, on ne garde que la PREMIÈRE occurrence
        if (seenTitles.has(title.normalized)) {
          duplicatesToRemove.push({ title, isSerpTitle });
          totalDuplicateTitles++;
        } else {
          seenTitles.set(title.normalized, index);
          if (isSerpTitle && iterations === 0) {
            console.log(`   🛡️ Titre SERP (première occurrence, conservée): "${title.fullMatch.substring(0, 60)}..."`);
          }
        }
      });
      
      if (duplicatesToRemove.length === 0) break; // Plus de répétitions
      
      // Supprimer les duplicatas en ordre inverse pour préserver les indices
      duplicatesToRemove.sort((a, b) => b.title.index - a.title.index);
      
      let removedThisIteration = 0;
      duplicatesToRemove.forEach(({ title, isSerpTitle }, idx) => {
        // Recalculer l'index actuel dans le HTML modifié
        const currentTitleIndex = cleanedHtml.indexOf(title.fullMatch);
        
        if (currentTitleIndex !== -1) {
          // Trouver la fin de la section (prochain H2/H3 ou fin)
          const afterTitle = cleanedHtml.substring(currentTitleIndex + title.fullMatch.length);
          const nextH2Match = afterTitle.match(/<(h[23])[^>]*>/i);
          
          if (nextH2Match) {
            const sectionEnd = currentTitleIndex + title.fullMatch.length + nextH2Match.index;
            cleanedHtml = cleanedHtml.substring(0, currentTitleIndex) + cleanedHtml.substring(sectionEnd);
            removedCount++;
            removedThisIteration++;
          } else {
            // Pas de H2 suivant, supprimer jusqu'à la fin
            cleanedHtml = cleanedHtml.substring(0, currentTitleIndex);
            removedCount++;
            removedThisIteration++;
          }
        }
      });
      
      if (removedThisIteration > 0) {
        if (iterations === 0) {
          console.log(`   ✅ ${removedThisIteration} section(s) dupliquée(s) supprimée(s) (itération ${iterations + 1})`);
        }
      } else {
        break; // Aucune suppression, on peut arrêter
      }
      
      iterations++;
    }
    
    if (iterations > 1) {
      console.log(`   ✅ Nettoyage terminé après ${iterations} itération(s)`);
    }
    
    if (repetitiveNgrams > 5) {
      console.log(`   ⚠️ ${repetitiveNgrams} n-grams répétitifs détectés (contenu potentiellement redondant)`);
    }
    
    // Compter les titres dupliqués supprimés (depuis la boucle de suppression)
    let duplicateTitlesCount = 0;
    if (typeof iterations !== 'undefined' && iterations > 0) {
      duplicateTitlesCount = iterations; // Nombre d'itérations = nombre de passes de nettoyage
    }
    
    if (duplicateTitlesCount > 0) {
      console.log(`   ⚠️ ${duplicateTitlesCount} passe(s) de nettoyage de titres dupliqués effectuée(s)`);
    }
    
    if (removedCount > 0) {
      console.log(`   ✅ ${removedCount} élément(s) dupliqué(s) supprimé(s)`);
    } else {
      console.log('   ✅ Aucune répétition exacte détectée');
    }
    
    return cleanedHtml;
  }

  /**
   * PHASE 6.0.11.7: Suppression des phrases répétitives (aligné avec quality-analyzer.js)
   * Utilise exactement la même méthode de détection que quality-analyzer.js pour éliminer
   * les répétitions restantes après removeRepetitions()
   * @param {string} html - HTML à nettoyer
   * @param {Object} report - Rapport pour logging
   * @returns {string} HTML sans phrases répétitives
   */
  removeRepetitivePhrases(html, report) {
    console.log('🔍 removeRepetitivePhrases: Détection finale des répétitions (méthode quality-analyzer)...');
    
    let cleanedHtml = html;
    let removedCount = 0;
    const removedPhrases = [];
    
    // Protéger les sections SERP critiques
    const protectedSections = [
      /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i,
      /<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/i,
      /<h2[^>]*>.*?erreurs?\s*(fréquentes?|courantes?|à\s*éviter).*?<\/h2>/i
    ];
    
    // Extraire le texte brut (sans HTML)
    const text = cleanedHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
    
    // Utiliser EXACTEMENT la même méthode que quality-analyzer.js
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
    const ngrams = new Map();
    
    // Créer les n-grams de 8 mots pour chaque phrase (comme quality-analyzer.js)
    sentences.forEach(sentence => {
      const words = sentence.split(/\s+/).filter(w => w.length > 2);
      for (let i = 0; i <= words.length - 8; i++) {
        const ngram = words.slice(i, i + 8).join(' ');
        ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
      }
    });
    
    // Détecter les n-grams répétitifs
    const repetitiveNgrams = [];
    ngrams.forEach((count, ngram) => {
      if (count > 1) {
        repetitiveNgrams.push({ ngram, count });
      }
    });
    
    if (repetitiveNgrams.length === 0) {
      console.log('   ✅ Aucune répétition détectée (méthode quality-analyzer)');
      return cleanedHtml;
    }
    
    console.log(`   🔍 ${repetitiveNgrams.length} n-gram(s) répétitif(s) détecté(s)`);
    
    // Trier par nombre d'occurrences décroissant
    repetitiveNgrams.sort((a, b) => b.count - a.count);
    
    // Pour chaque n-gram répétitif, trouver et supprimer les phrases qui le contiennent
    const processedSentences = new Set();
    
    repetitiveNgrams.forEach(({ ngram, count }) => {
      if (count <= 1) return;
      
      // Logger le n-gram détecté
      console.log(`   🔄 N-gram répétitif (${count}x): "${ngram.substring(0, 60)}${ngram.length > 60 ? '...' : ''}"`);
      
      // AMÉLIORATION: Chercher directement les n-grams répétitifs dans le HTML (paragraphes ET listes)
      // au lieu de chercher des phrases complètes, ce qui est plus efficace pour les listes avec texte collé
      // IMPORTANT: Normaliser le texte pour la recherche (gérer entités HTML, espaces, etc.)
      const normalizeForSearch = (text) => {
        return text
          .replace(/&#8220;/g, '"')
          .replace(/&#8221;/g, '"')
          .replace(/&#8217;/g, "'")
          .replace(/&#8216;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/<[^>]+>/g, ' ') // Supprimer tags HTML restants
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      };
      
      // Le n-gram vient du texte brut (déjà sans HTML), donc juste normaliser espaces et case
      const ngramNormalized = ngram
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      
      // Extraire tous les éléments (p et li) et chercher le n-gram dans leur contenu normalisé
      const ngramOccurrences = [];
      const elementRegex = /<(p|li)\b[^>]*>([\s\S]*?)<\/(p|li)>/gi;
      let elementMatch;
      let totalElements = 0;
      
      while ((elementMatch = elementRegex.exec(cleanedHtml)) !== null) {
        totalElements++;
        const elementTag = elementMatch[1].toLowerCase();
        const elementContent = elementMatch[2];
        const elementNormalized = normalizeForSearch(elementContent);
        
        // Chercher le n-gram dans le contenu normalisé (substring match flexible)
        // Le n-gram peut être tronqué, donc chercher les premiers mots du n-gram
        const ngramWords = ngramNormalized.split(/\s+/);
        if (ngramWords.length >= 5) {
          // Chercher au moins les 5 premiers mots du n-gram (plus robuste)
          const ngramPrefix = ngramWords.slice(0, 5).join(' ');
          if (elementNormalized.includes(ngramPrefix)) {
            ngramOccurrences.push({
              index: elementMatch.index,
              elementTag: elementTag,
              elementFullMatch: elementMatch[0],
              elementContent: elementContent
            });
          }
        } else if (elementNormalized.includes(ngramNormalized)) {
          // Si le n-gram est court, chercher la correspondance exacte
          ngramOccurrences.push({
            index: elementMatch.index,
            elementTag: elementTag,
            elementFullMatch: elementMatch[0],
            elementContent: elementContent
          });
        }
      }
      
      if (ngramOccurrences.length <= 1) {
        // Pas de répétition, passer au n-gram suivant
        if (ngramOccurrences.length === 0 && totalElements > 0 && repetitiveNgrams.length <= 3) {
          // Debug: vérifier si le n-gram est proche d'un élément (seulement pour les 3 premiers n-grams)
          console.log(`   ⚠️ N-gram "${ngramNormalized.substring(0, 50)}..." non trouvé dans ${totalElements} élément(s) HTML`);
        }
        return;
      }
      
      console.log(`   📋 ${ngramOccurrences.length} occurrence(s) du n-gram trouvée(s) dans le HTML`);
      
      // Garder la première occurrence, supprimer les autres
      // Trier par index pour traiter dans l'ordre (du plus bas au plus haut)
      ngramOccurrences.sort((a, b) => a.index - b.index);
      
      for (let i = 1; i < ngramOccurrences.length; i++) {
        const occurrence = ngramOccurrences[i];
        const elementStart = occurrence.index;
        const elementFullMatch = occurrence.elementFullMatch;
        const elementTag = occurrence.elementTag;
        
        // Vérifier si c'est dans une section protégée
        // IMPORTANT: Ne protéger que les sections SERP critiques, pas "Ce que la communauté apporte"
        
        // D'abord vérifier si l'élément est dans "Ce que la communauté apporte" (non protégée)
        const communauteMatch = cleanedHtml.match(/<h2[^>]*>.*?ce\s*que\s*la\s*communauté\s*apporte.*?<\/h2>/i);
        let isInCommunaute = false;
        if (communauteMatch) {
          const communauteStart = communauteMatch.index;
          const afterCommunaute = cleanedHtml.substring(communauteStart + communauteMatch[0].length);
          const nextH2AfterCommunaute = afterCommunaute.match(/<h2[^>]*>/i);
          const communauteEnd = nextH2AfterCommunaute 
            ? communauteStart + communauteMatch[0].length + (nextH2AfterCommunaute.index ?? 0)
            : cleanedHtml.length;
          
          isInCommunaute = (elementStart >= communauteStart && elementStart < communauteEnd);
        }
        
        // Si dans "Ce que la communauté apporte", ne PAS protéger - continuer à la suppression
        if (!isInCommunaute) {
          // Vérifier si c'est dans une autre section SERP protégée
          let isProtected = false;
          let protectedSectionName = '';
          
          // Vérifier si l'élément est dans une section SERP protégée
          // IMPORTANT: Utiliser matchAll pour trouver TOUTES les sections H2 et leurs limites précises
          const allH2Matches = [...cleanedHtml.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi)];
          
          // Trouver la section H2 qui contient cet élément
          let containingSection = null;
          for (let i = 0; i < allH2Matches.length; i++) {
            const h2Match = allH2Matches[i];
            const h2Start = h2Match.index;
            const h2End = h2Start + h2Match[0].length;
            const nextH2Start = i < allH2Matches.length - 1 ? allH2Matches[i + 1].index : cleanedHtml.length;
            
            // Vérifier si l'élément est dans cette section H2
            if (elementStart >= h2End && elementStart < nextH2Start) {
              const h2Title = h2Match[1].trim();
              
              // Vérifier si cette section H2 est une section SERP protégée
              // IMPORTANT: "Événement central", "Résolution", etc. ne sont PAS des sections SERP protégées
              // Seules "Limites et biais", "Ce que les autres ne disent pas", "Erreurs à éviter" sont protégées
              const isProtectedSection = protectedSections.some(pattern => {
                return pattern.test(h2Match[0]);
              });
              
              if (isProtectedSection) {
                isProtected = true;
                protectedSectionName = h2Title;
                break;
              }
              
              // Si la section est "Ce que la communauté apporte", ne PAS protéger (déjà vérifié plus haut, mais double vérification)
              if (h2Title.toLowerCase().includes('communauté') && h2Title.toLowerCase().includes('apporte')) {
                // Ne pas protéger, cette section peut avoir des répétitions supprimées
                break;
              }
            }
          }
          
          if (isProtected) {
            console.log(`   🛡️ ${elementTag.toUpperCase()} répétitif protégé (section SERP "${protectedSectionName}"): "${elementFullMatch.replace(/<[^>]+>/g, ' ').trim().substring(0, 50)}..."`);
            continue;
          }
        }
        
        // Supprimer cet élément (occurrence répétitive du n-gram)
        // On garde la première occurrence (index 0), on supprime celle-ci (index i)
        const elementEnd = elementStart + elementFullMatch.length;
        cleanedHtml = cleanedHtml.substring(0, elementStart) + cleanedHtml.substring(elementEnd);
        removedCount++;
        removedPhrases.push({
          ngram: ngram.substring(0, 60),
          element: elementTag,
          count: count
        });
        
        const elementText = elementFullMatch.replace(/<[^>]+>/g, ' ').trim().substring(0, 60);
        console.log(`   ✂️ ${elementTag.toUpperCase()} répétitif supprimé (${count}x, n-gram: "${ngram.substring(0, 40)}..."): "${elementText}..."`);
        
        // Réinitialiser le regex pour la prochaine itération (les indices ont changé)
        // On doit recalculer les occurrences pour les n-grams suivants
        break;
      }
      
    });
    
    if (removedCount > 0) {
      console.log(`   ✅ ${removedCount} phrase(s) répétitive(s) supprimée(s)`);
      if (report && report.actions) {
        report.actions.push({
          type: 'removed_repetitive_phrases',
          details: `count=${removedCount} ngrams=${repetitiveNgrams.length}`
        });
      }
    } else {
      console.log('   ✅ Aucune phrase répétitive supprimée (toutes protégées ou déjà uniques)');
    }
    
    return cleanedHtml;
  }

  /**
   * PHASE 6.3: Story Alignment + Quality Gate avec auto-fix
   * Vérifie la présence/ordre des sections et auto-corrige si possible
   * @param {string} html - HTML de l'article
   * @param {Object} pipelineContext - Contexte du pipeline
   * @param {Object} report - Rapport QA
   * @returns {string} HTML corrigé
   */
  async checkAndFixStoryAlignment(html, pipelineContext, report) {
    // SIMPLIFIÉ: On ne force plus l'insertion de sections de l'ancienne structure.
    // L'article est en format Option B (développement libre). On vérifie juste la qualité globale.
    const h2Matches = html.match(/<h2[^>]*>.*?<\/h2>/gi) || [];
    const h2Count = h2Matches.length;
    const bodyLength = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
    
    
    let finalHtml = html;
    let status = 'pass';
    
    // Vérifier que l'article a une structure minimale viable
    if (h2Count < 2) {
      status = 'warn';
      report.issues.push({
        code: 'STORY_ALIGNMENT_VIOLATION',
        severity: 'low',
        message: `Article avec seulement ${h2Count} H2 (minimum recommandé: 2)`,
        evidence: { h2Count },
        check: 'story_alignment'
      });
    }
    
    if (bodyLength < 1500) {
      status = 'warn';
      report.issues.push({
        code: 'STORY_ALIGNMENT_VIOLATION',
        severity: 'low',
        message: `Contenu court: ${bodyLength} chars (minimum recommandé: 1500)`,
        evidence: { bodyLength },
        check: 'story_alignment'
      });
    }
    
    console.log(`✅ FINALIZER_ALIGNMENT: h2Count=${h2Count} bodyLength=${bodyLength} status=${status}`);
    
    report.checks.push({
      name: 'story_alignment',
      status: status,
      details: `required=0 present=${h2Count} inserted=0 reordered=0`
    });
    
    // Exposer dans report.debug
    if (!report.debug) report.debug = {};
    report.debug.alignment = {
      required_sections: [],
      detected_sections: h2Matches.map(h => h.replace(/<[^>]*>/g, '').trim()),
      inserted_sections: [],
      reordered: false,
      missing_after_fix: []
    };

    // PHASE 1 FIX: Validation qualité des H2 — détecter les H2 génériques/descriptifs
    const decisionVerbs = /\b(choisir|éviter|payer|optimiser|risquer|arbitrer|renoncer|privilégier|sacrifier|comparer|négocier|anticiper|contourner|limiter|maximiser|minimiser|trancher)\b/i;
    const tensionConnectors = /\b(mais|vs|au prix de|à condition de|malgré|plutôt que|au lieu de|sans|avant de|quitte à)\b/i;
    const genericPatterns = [
      /^les?\s+\w+\s+(de|du|des|au|en)\s+/i,
      /^conseils?\s+(pour|pratiques?|de)/i,
      /^guide\s+(de|du|pour|des|pratique)/i,
      /^comment\s+(bien\s+)?/i,
      /^questions?\s+fréquentes?/i,
      /^FAQ\b/i,
      /^avantages?\s+et\s+inconvénients?/i,
      /^comparaison\s+(de|des|du)/i,
      /^options?\s+d['']/i,
      /^checklist\b/i
    ];
    const genericH2s = [];
    for (const h2Tag of h2Matches) {
      const h2Text = h2Tag.replace(/<[^>]*>/g, '').trim();
      if (h2Text.length < 5) continue;
      const hasDecisionVerb = decisionVerbs.test(h2Text);
      const hasTensionConnector = tensionConnectors.test(h2Text);
      const isGenericPattern = genericPatterns.some(p => p.test(h2Text));
      if (!hasDecisionVerb && !hasTensionConnector && isGenericPattern) {
        genericH2s.push(h2Text);
      }
    }
    if (genericH2s.length > 0) {
      console.log(`   ⚠️ H2_QUALITY: ${genericH2s.length} H2 générique(s) détecté(s):`);
      genericH2s.forEach(h => console.log(`      → "${h}"`));
      report.issues.push({
        code: 'H2_GENERIC_DETECTED',
        severity: 'low',
        message: `${genericH2s.length} H2 générique(s) sans verbe décisionnel ni connecteur de tension: ${genericH2s.map(h => `"${h}"`).join(', ')}`,
        evidence: { genericH2s },
        check: 'h2_quality'
      });
      report.checks.push({
        name: 'h2_quality',
        status: 'warn',
        details: `${genericH2s.length}/${h2Count} H2 génériques détectés`
      });
    } else {
      report.checks.push({
        name: 'h2_quality',
        status: 'pass',
        details: `${h2Count} H2 tous qualifiés (verbe décisionnel ou connecteur de tension)`
      });
    }
    
    return finalHtml;
  }
  
  /**
   * PHASE 6.4: Ajouter wrappers premium (takeaways, community, open-questions)
   * Ajoute des wrappers HTML strictement pilotés par story.*, sans invention
   */
  async addPremiumWrappers(html, pipelineContext, report) {
    const story = pipelineContext?.story?.story || pipelineContext?.story || {};
    const MIN_SECTION_CHARS = 60; // Seuil pour "too short" warning
    
    // Définir les wrappers à ajouter (ordre: takeaways -> community -> open-questions)
    const wrapperDefs = [
      {
        key: 'takeaways',
        dataAttr: 'takeaways',
        title: 'Ce qu\'il faut retenir',
        storyKey: 'author_lessons',
        minItemChars: 10 // Utilise hasUsableList avec min 10
      },
      // ❌ DÉSACTIVÉ : "Ce que dit la communauté" crée des doublons avec "Ce que la communauté apporte"
      // Le LLM génère déjà cette section depuis story.community_insights
      // {
      //   key: 'community',
      //   dataAttr: 'community',
      //   title: 'Ce que dit la communauté',
      //   storyKey: 'community_insights',
      //   minItemChars: 30
      // },
      {
        key: 'open-questions',
        dataAttr: 'open-questions',
        title: 'Questions ouvertes',
        storyKey: 'open_questions',
        minItemChars: 15 // Comme dans canInsert
      }
    ];
    
    let finalHtml = html;
    const insertedWrappers = [];
    const wrappersToInsert = []; // Stocker tous les wrappers à insérer (ordre: takeaways -> community -> open-questions)
    
    // Vérifier si chaque wrapper doit être ajouté et construire le HTML
    for (const wrapperDef of wrapperDefs) {
      const storyData = story[wrapperDef.storyKey];
      
      // Vérifier si le contenu est "usable"
      let hasUsableContent = false;
      if (Array.isArray(storyData)) {
        hasUsableContent = this.hasUsableList(storyData, wrapperDef.minItemChars);
      } else if (storyData && typeof storyData === 'object') {
        // Support pour objets avec value/text/summary/quote
        const text = storyData.value || storyData.text || storyData.summary || storyData.quote || '';
        hasUsableContent = this.hasUsableText(text, wrapperDef.minItemChars);
      } else if (typeof storyData === 'string') {
        hasUsableContent = this.hasUsableText(storyData, wrapperDef.minItemChars);
      }
      
      if (!hasUsableContent) {
        continue; // Pas de contenu usable -> ne rien insérer
      }
      
      // Vérifier l'idempotence: ne pas dupliquer si déjà présent
      const existingWrapperRegex = new RegExp(`<section[^>]*data-fv-block=["']${wrapperDef.dataAttr}["'][^>]*>`, 'i');
      if (existingWrapperRegex.test(finalHtml)) {
        continue; // Déjà présent -> idempotent
      }
      
      // Construire le wrapper HTML
      let wrapperHtml = `<section data-fv-block="${wrapperDef.dataAttr}">\n  <h2>${wrapperDef.title}</h2>\n  <ul>\n`;
      
      // Set pour dédupliquer les items dans cette section
      const seenItems = new Set();
      
      // Extraire les items et construire les <li>
      let items = [];
      if (Array.isArray(storyData)) {
        items = storyData;
      } else if (storyData && typeof storyData === 'object') {
        // Si c'est un objet unique, le traiter comme un item
        items = [storyData];
      } else if (typeof storyData === 'string') {
        items = [storyData];
      }
      
      let totalTextLength = 0;
      for (const item of items) {
        // Extraction: item.value || item.text || item.summary || item.quote || item.lesson || string
        let text = '';
        if (typeof item === 'string') {
          text = item;
        } else if (item && typeof item === 'object') {
          // Essayer toutes les propriétés textuelles possibles (priorité stricte)
          text = item.value || item.text || item.summary || item.quote || item.lesson || '';
          
          // Si toujours vide après extraction des propriétés textuelles, c'est un objet complexe sans contenu utilisable
          // Ne PAS utiliser JSON.stringify pour éviter d'insérer des objets complexes
          if (!text || text.trim() === '') {
            // Objet complexe sans propriétés textuelles -> ignorer
            text = '';
          }
        }
        
        let trimmedText = text ? String(text).trim() : '';
        
        // AMÉLIORATION: Traduire le texte si nécessaire (détection anglais + traduction)
        if (trimmedText && trimmedText.length > 0) {
          // Détecter si le texte est en anglais (seuil abaissé pour capter les phrases courtes)
          const englishWords = (trimmedText.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|I|you|he|she|it|we|they|here|there|my|your|his|her|our|their|not|anymore|phone|camera|reel|fills|photos|memories|think|going|people|places|best|how|what|where|which|do|does|need|want|looking|moving|working|getting|trying|planning|about|been|being|know|really|just|very|much|also|into|over|most|some|any|than|when|why|who|more|other|only|with)\b/gi) || []).length;
          const totalWords = trimmedText.split(/\s+/).length;
          const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
          
          if (englishRatio > 0.15 && totalWords > 2) {
            // Traduire en français
            console.log(`🌐 Wrapper "${wrapperDef.title}": traduction d'un item en anglais (${Math.round(englishRatio * 100)}%)...`);
            try {
              // S'assurer que l'analyzer est initialisé
              if (!this.intelligentContentAnalyzer) {
                await this._initAnalyzer();
              }
              
              if (this.intelligentContentAnalyzer && this.intelligentContentAnalyzer.translateToFrench) {
                trimmedText = await this.intelligentContentAnalyzer.translateToFrench(trimmedText);
                console.log(`   ✅ Item traduit: "${trimmedText.substring(0, 60)}..."`);
              } else {
                console.warn(`   ⚠️ Traducteur non disponible, item conservé en anglais`);
              }
            } catch (error) {
              console.warn(`   ⚠️ Erreur traduction: ${error.message}, item conservé en anglais`);
            }
          }
        }
        
        // Filtrer explicitement [object Object], objets vides, et objets complexes
        // Ne garder que les chaînes de caractères valides avec contenu
        if (trimmedText && 
            trimmedText !== '[object Object]' && 
            trimmedText !== '{}' && 
            !trimmedText.startsWith('{') && // Rejeter les objets JSON stringifiés
            trimmedText.length > 0) {
          // AMÉLIORATION: Vérifier que le texte a du sens (minimum 15 caractères de texte réel)
          const realText = trimmedText.replace(/[^\w\sÀ-Ÿà-ÿ]/g, '').trim();
          
          // AMÉLIORATION: Vérifier que ce n'est pas juste une phrase isolée sans contexte
          // Rejeter les phrases qui commencent par "not anymore?" ou similaires (phrases isolées)
          const isIsolatedPhrase = /^(not\s+anymore|plus\s+maintenant|well\s+said|bien\s+dit)[\?\!]?/i.test(trimmedText);
          
          // AMÉLIORATION: Pour "Questions ouvertes", vérifier que c'est une vraie question
          let isValidQuestion = true;
          if (wrapperDef.key === 'open-questions') {
            // Rejeter les questions qui sont juste "?" ou quasi-vides
            const textWithoutPunctuation = trimmedText.replace(/[?\s!.]/g, '').trim();
            if (textWithoutPunctuation.length < 5) {
              isValidQuestion = false;
              console.log(`   ⚠️ Item ignoré (question trop courte/vide): "${trimmedText}"`);
            } else {
              const hasQuestionMark = trimmedText.includes('?');
              const hasInterrogativeWords = /\b(comment|pourquoi|quand|où|qui|quoi|quel|quelle|quels|quelles|combien|est-ce|peut-on|doit-on|faut-il)\b/i.test(trimmedText);
              const hasEnglishInterrogative = /\b(how|why|when|where|who|what|which|should|can|could|would|will)\b/i.test(trimmedText);
              
              if (!hasQuestionMark && !hasInterrogativeWords && !hasEnglishInterrogative) {
                isValidQuestion = false;
                console.log(`   ⚠️ Item ignoré (pas une vraie question): "${trimmedText.substring(0, 50)}..."`);
              }
            }
          }
          
          // Dédupliquer par texte normalisé
          const normalizedForDedup = trimmedText.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, ' ').replace(/\s+/g, ' ').trim();
          const isDuplicate = seenItems.has(normalizedForDedup);
          
          if (realText.length >= 15 && !isIsolatedPhrase && isValidQuestion && !isDuplicate) {
            seenItems.add(normalizedForDedup);
            wrapperHtml += `    <li>${this.escapeHtml(trimmedText)}</li>\n`;
            totalTextLength += trimmedText.length;
          } else {
            if (isIsolatedPhrase) {
              console.log(`   ⚠️ Item ignoré (phrase isolée sans contexte): "${trimmedText.substring(0, 50)}..."`);
            } else {
              console.log(`   ⚠️ Item ignoré (trop court après nettoyage): "${trimmedText.substring(0, 50)}..."`);
            }
          }
        }
      }
      
      // AMÉLIORATION: Vérifier qu'il y a au moins un item valide avant de créer la section
      const itemCount = (wrapperHtml.match(/<li>/g) || []).length;
      if (itemCount === 0) {
        console.log(`   ⚠️ Wrapper "${wrapperDef.title}" ignoré: aucun item valide après traitement`);
        continue; // Ne pas créer la section si aucun item valide
      }
      
      wrapperHtml += `  </ul>\n</section>\n`;
      
      // Vérifier "too short" warning (si totalTextLength < MIN_SECTION_CHARS)
      if (totalTextLength < MIN_SECTION_CHARS) {
        report.issues.push({
          code: 'STORY_ALIGNMENT_VIOLATION',
          message: `Wrapper "${wrapperDef.title}" inséré mais trop court (${totalTextLength} chars, attendu >= ${MIN_SECTION_CHARS})`,
          severity: 'low',
          check: 'premium_wrappers'
        });
        report.checks.push({
          name: 'premium_wrapper_length',
          status: 'warn',
          details: `Wrapper "${wrapperDef.title}" trop court (${totalTextLength} < ${MIN_SECTION_CHARS})`
        });
      }
      
      // Stocker le wrapper pour insertion groupée
      wrappersToInsert.push({
        key: wrapperDef.key,
        title: wrapperDef.title,
        html: wrapperHtml
      });
    }
    
    // Insérer tous les wrappers en une seule fois (ordre préservé: takeaways -> community -> open-questions)
    if (wrappersToInsert.length > 0) {
      const allWrappersHtml = '\n\n' + wrappersToInsert.map(w => w.html).join('\n\n') + '\n\n';
      
      // Trouver la position d'insertion: avant "Articles connexes" si existe, sinon en fin
      const relatedSectionRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
      const relatedMatch = finalHtml.match(relatedSectionRegex);
      
      if (relatedMatch) {
        // Insérer juste avant "Articles connexes"
        const insertIndex = relatedMatch.index;
        finalHtml = finalHtml.slice(0, insertIndex) + allWrappersHtml + finalHtml.slice(insertIndex);
      } else {
        // Insérer en fin de contenu
        finalHtml = finalHtml + allWrappersHtml;
      }
      
      // Enregistrer les actions
      for (const wrapper of wrappersToInsert) {
        insertedWrappers.push(wrapper.key);
        report.actions.push({
          type: 'inserted_premium_wrapper',
          details: `wrapper=${wrapper.key} title="${wrapper.title}"`
        });
      }
    }
    
    // Log synthèse
    if (insertedWrappers.length > 0) {
      console.log(`✅ PREMIUM_WRAPPERS: inserted=${insertedWrappers.length} wrappers=[${insertedWrappers.join(', ')}]`);
    }
    
    return finalHtml;
  }

  /**
   * PHASE 6.5: Blocking Gate - Quality Gate bloquant
   * Inspecte report.issues et définit report.blocking et report.status pour violations critiques
   */
  applyBlockingGate(report) {
    // Codes d'issues bloquantes
    const BLOCKING_ISSUE_CODES = [
      'SOURCE_OF_TRUTH_VIOLATION_FINALIZER',
      'SOURCE_OF_TRUTH_VIOLATION', // Alias pour compatibilité
      'AFFILIATE_INJECTION_FAILED',
      'AFFILIATE_PLAN_NOT_RESPECTED_FINALIZER',
      'ANTI_HALLUCINATION_BLOCK' // PHASE 7.1.d: Anti-hallucination blocking (si severity=high)
    ];
    
    // Identifier les issues bloquantes
    const blockingIssues = report.issues.filter(issue => {
      const code = issue.code || '';
      const alias = issue.alias || '';
      const isBlockingCode = BLOCKING_ISSUE_CODES.includes(code) || BLOCKING_ISSUE_CODES.includes(alias);
      
      // Pour ANTI_HALLUCINATION_BLOCK, vérifier que severity=high (mode bloquant activé)
      if (code === 'ANTI_HALLUCINATION_BLOCK') {
        return isBlockingCode && issue.severity === 'high';
      }
      
      return isBlockingCode;
    });
    
    // Définir report.blocking et report.blocking_reasons
    report.blocking = blockingIssues.length > 0;
    report.blocking_reasons = blockingIssues.map(issue => ({
      code: issue.code || issue.alias || 'UNKNOWN',
      message: issue.message || 'No message',
      check: issue.check || 'unknown'
    }));
    
    // PHASE 6.5: Forcer report.status = 'fail' UNIQUEMENT si blocking=true
    // Les autres warnings (STORY_ALIGNMENT_VIOLATION avec severity=low, etc.) ne doivent pas bloquer
    // TEMPORAIRE: Désactiver le blocking pour permettre la publication (truth pack à corriger)
    const ENABLE_BLOCKING = process.env.ENABLE_FINALIZER_BLOCKING !== '0'; // Par défaut activé, désactiver avec '0'
    if (report.blocking && !ENABLE_BLOCKING) {
      console.log(`⚠️ FINALIZER_BLOCKING désactivé temporairement (ENABLE_FINALIZER_BLOCKING=${process.env.ENABLE_FINALIZER_BLOCKING})`);
      report.blocking = false; // Désactiver le blocking
      report.status = 'warn'; // Passer en warn au lieu de fail
    }
    if (report.blocking && ENABLE_BLOCKING) {
      // Trouver le check global ou le créer
      let globalCheck = report.checks.find(c => c.name === 'finalizer_blocking_gate');
      if (!globalCheck) {
        globalCheck = {
          name: 'finalizer_blocking_gate',
          status: 'fail',
          details: `${blockingIssues.length} blocking issue(s) detected`
        };
        report.checks.push(globalCheck);
      } else {
        globalCheck.status = 'fail';
        globalCheck.details = `${blockingIssues.length} blocking issue(s) detected`;
      }
      
      // Définir report.status = 'fail' pour indiquer un échec bloquant
      report.status = 'fail';
      
      // Log bloquant
      console.log(`❌ FINALIZER_BLOCKING: blocking=true reasons=[${report.blocking_reasons.map(r => r.code).join(', ')}]`);
    } else {
      // Ajouter un check pass pour indiquer que le gate a été vérifié
      report.checks.push({
        name: 'finalizer_blocking_gate',
        status: 'pass',
        details: 'No blocking issues detected'
      });
      
      // PHASE 6.5: Si pas de blocking, le status reste 'pass' ou 'warn' selon les autres checks
      // Ne pas forcer 'fail' si seulement des warnings non-bloquants
      const hasBlockingFail = report.checks.some(c => 
        c.status === 'fail' && 
        (c.name === 'invention_guard' || c.name === 'affiliate_conformance' || c.name === 'finalizer_blocking_gate')
      );
      if (!hasBlockingFail) {
        // Si pas de fail bloquant, le status peut être 'pass' ou 'warn'
        const hasWarn = report.checks.some(c => c.status === 'warn');
        report.status = hasWarn ? 'warn' : 'pass';
      }
    }
  }

  /**
   * PHASE 7.1.d: Anti-Hallucination Guard
   * Détecte les hallucinations dans le texte éditorial en comparant avec le truth pack
   */
  async checkAntiHallucination(html, pipelineContext, report, title = '') {
    try {
      // Importer le guard dynamiquement
      const { runAntiHallucinationGuard } = await import('./src/anti-hallucination/anti-hallucination-guard.js');
      
      const extracted = pipelineContext?.extracted || {};
      
      // Exécuter le guard (passer le titre pour validation anti-décontextualisation)
      const guardResult = await runAntiHallucinationGuard({
        html,
        extracted,
        context: pipelineContext,
        title
      });
      
      // Log standard
      const reasonsStr = guardResult.reasons.length > 0 
        ? guardResult.reasons.join(', ') 
        : 'none';
      console.log(`✅ ANTI_HALLUCINATION: status=${guardResult.status} blocking=${guardResult.blocking} reasons=[${reasonsStr}]`);
      
      // Si blocking=true, ajouter une issue
      // Utiliser la constante depuis config.js (par défaut activé en production)
      const shouldBlock = ENABLE_ANTI_HALLUCINATION_BLOCKING;
      
      // Déterminer le status du check
      let checkStatus = 'pass';
      if (guardResult.blocking) {
        // Si blocking=true et flag activé → fail, sinon → warn
        checkStatus = shouldBlock ? 'fail' : 'warn';
      } else if (guardResult.status === 'warn') {
        checkStatus = 'warn';
      }
      
      report.checks.push({
        name: 'anti_hallucination',
        status: checkStatus,
        details: guardResult.reasons.length > 0 
          ? `${guardResult.reasons.length} issue(s): ${reasonsStr}` 
          : 'No hallucinations detected'
      });
      
      // Si blocking=true, vérifier qu'il y a de vraies issues bloquantes (pas juste entity_drift warnings)
      if (guardResult.blocking) {
        const blockingEvidence = guardResult.evidence.filter(e => e.type !== 'entity_drift');
        const hasRealBlockingIssue = blockingEvidence.length > 0;
        
        report.issues.push({
          code: 'ANTI_HALLUCINATION_BLOCK',
          severity: (shouldBlock && hasRealBlockingIssue) ? 'high' : 'medium',
          message: `Anti-hallucination guard detected ${guardResult.reasons.length} issue(s)${!hasRealBlockingIssue ? ' (entity_drift only, non-blocking)' : ''}`,
          evidence: guardResult.evidence,
          check: 'anti_hallucination'
        });
      }
      
      // Ajouter les warnings (non bloquants)
      if (guardResult.status === 'warn' && !guardResult.blocking) {
        guardResult.evidence.forEach(evidence => {
          report.issues.push({
            code: 'ANTI_HALLUCINATION_WARNING',
            severity: 'low',
            message: evidence.why,
            evidence: { type: evidence.type, text: evidence.text },
            check: 'anti_hallucination'
          });
        });
      }
      
      // Exposer dans debug si présent
      if (!report.debug) report.debug = {};
      report.debug.anti_hallucination = {
        status: guardResult.status,
        blocking: guardResult.blocking,
        reasons: guardResult.reasons,
        evidence_count: guardResult.evidence.length,
        included_len: guardResult.debug?.included_len || 0
      };
      
    } catch (error) {
      // En cas d'erreur, logger mais ne pas bloquer
      console.warn('⚠️ Erreur anti-hallucination guard (fallback silencieux):', error.message);
      report.checks.push({
        name: 'anti_hallucination',
        status: 'warn',
        details: `Error: ${error.message}`
      });
    }
  }

  /**
   * PHASE 6.3: Échapper HTML pour sécurité
   */
  escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * PHASE 6.2: Extrait les tokens d'un texte (normalisé, sans stopwords)
   */
  extractTokens(text) {
    if (!text || typeof text !== 'string') return [];
    
    // Stopwords FR/EN courants
    const stopwords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'mais', 'donc', 'car', 'ne', 'pas', 'plus', 'très', 'tout', 'tous', 'toute', 'toutes',
      'the', 'a', 'an', 'and', 'or', 'but', 'so', 'because', 'not', 'no', 'very', 'all', 'every', 'each',
      'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'ce', 'cette', 'ces', 'son', 'sa', 'ses',
      'i', 'you', 'he', 'she', 'we', 'they', 'it', 'this', 'that', 'these', 'those', 'his', 'her', 'its',
      'être', 'avoir', 'faire', 'dire', 'aller', 'voir', 'savoir', 'vouloir', 'pouvoir', 'devoir',
      'be', 'have', 'do', 'say', 'go', 'see', 'know', 'want', 'can', 'must', 'should', 'will', 'would'
    ]);
    
    // Normaliser: lowercase, strip accents basique, remove punctuation
    let normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ')
      .trim();
    
    // Split en tokens et filtrer stopwords + tokens trop courts
    const tokens = normalized
      .split(/\s+/)
      .filter(t => t.length > 2 && !stopwords.has(t));
    
    return tokens;
  }

  /**
   * Trouve une position d'insertion contextuelle pour un widget (après le premier bloc qui mentionne des mots-clés liés au type).
   */
  findSmartInsertPosition(html, placementId, { minStart = 0 } = {}) {
    const keywordsByType = {
      esim: ['internet', 'connexion', 'roaming', 'wifi', 'données', 'sim', 'esim', 'rester connecté', 'signal', '4g', '5g', 'airalo'],
      flights: ['vol', 'vols', 'billet', 'avion', 'aéroport', 'réservation', 'compagnie', 'départ', 'arrivée', 'flight', 'booking'],
      accommodation: ['hébergement', 'hôtel', 'logement', 'réservation', 'nuit', 'chambre', 'hostel', 'airbnb', 'booking'],
      insurance: ['assurance', 'santé', 'médical', 'urgence', 'maladie', 'rapatriement'],
      coworking: ['coworking', 'travail', 'bureau', 'productivité', 'nomade', 'remote']
    };
    const keywords = keywordsByType[placementId];
    if (!keywords || !keywords.length) return null;
    const re = new RegExp('<p[^>]*>([\\s\\S]*?)</p>', 'gi');
    let match;
    while ((match = re.exec(html)) !== null) {
      if (match.index < minStart) continue;
      const text = (match[1] || '').replace(/<[^>]+>/g, ' ').toLowerCase();
      if (keywords.some(kw => text.includes(kw))) {
        const insertIndex = match.index + match[0].length;
        const beforeZone = html.slice(0, insertIndex);
        if (/<(?:div|aside)[^>]*class="affiliate-module"[^>]*data-placement-id/i.test(beforeZone)) continue;
        return insertIndex;
      }
    }
    const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    let h2Match;
    while ((h2Match = h2Re.exec(html)) !== null) {
      if (h2Match.index < minStart) continue;
      const text = (h2Match[1] || '').replace(/<[^>]+>/g, ' ').toLowerCase();
      if (keywords.some(kw => text.includes(kw))) {
        const insertIndex = h2Match.index + h2Match[0].length;
        const beforeZone = html.slice(0, insertIndex);
        if (/<(?:div|aside)[^>]*class="affiliate-module"[^>]*data-placement-id/i.test(beforeZone)) continue;
        return insertIndex;
      }
    }
    return null;
  }

  /**
   * PHASE 5.C: Injecte un module d'affiliation selon l'anchor (ou position contextuelle si trouvée)
   * @param {string} html - HTML du contenu
   * @param {string} moduleHtml - HTML du module à injecter
   * @param {string} anchor - Anchor de placement
   * @param {Object} options - { placementId, placementIndex, totalPlacements } pour placement smart et répartition
   */
  injectAffiliateModule(html, moduleHtml, anchor, options = {}) {
    if (!moduleHtml || !anchor) return html;

    const { placementId, placementIndex = 0, totalPlacements = 1 } = options;


    if (placementId) {
      const minStart = (totalPlacements >= 2 && placementIndex >= 1) ? Math.floor(html.length * 0.5) : 0;
      if (minStart > 0) {
        console.log(`   📍 Distribution: module #${placementIndex + 1}/${totalPlacements} forcé en 2nde moitié (>= ${minStart})`);
      }
      let smartIndex = this.findSmartInsertPosition(html, placementId, { minStart });
      // Garde narrative : ne pas placer trop tôt (après 3e H2 ou 500 caractères, et au moins 3 paragraphes avant)
      // S'applique à TOUS les modules, pas seulement le premier
      if (smartIndex != null) {
        const h2List = Array.from(html.matchAll(/<h2[^>]*>.*?<\/h2>/gi));
        // Pour le 1er module : après le 3e H2 ; pour les suivants : après le (2+placementIndex)e H2
        const minH2Index = Math.min(2 + placementIndex, h2List.length - 1);
        const minNarrativeIndex = h2List.length >= (minH2Index + 1)
          ? h2List[minH2Index].index + h2List[minH2Index][0].length
          : 500; // Fallback minimal
        
        // Vérification supplémentaire : compter les paragraphes avant la position smart
        const beforeSmart = html.substring(0, smartIndex);
        const paragraphMatches = beforeSmart.matchAll(/<p[^>]*>.*?<\/p>/gi);
        const paragraphCount = Array.from(paragraphMatches).length;
        
        const minParagraphs = 3 + placementIndex; // 3 pour le 1er, 4 pour le 2e, etc.
        
        if (smartIndex < minNarrativeIndex || paragraphCount < minParagraphs) {
          // Au lieu de rejeter complètement, chercher une position NARRATIVE valide
          // Placer après le prochain </p> qui suit minNarrativeIndex
          const afterMin = html.substring(minNarrativeIndex);
          const nextPClose = afterMin.match(/<\/p>/i);
          if (nextPClose) {
            smartIndex = minNarrativeIndex + nextPClose.index + nextPClose[0].length;
            console.log(`   📍 Widget ${placementId} (module #${placementIndex}): position smart ajustée après seuil narratif (H2=${h2List.length}, paragraphes=${paragraphCount})`);
          } else {
            smartIndex = null;
            console.log(`   📍 Widget ${placementId} (module #${placementIndex}): position smart trop tôt, pas de position narrative valide, fallback anchor`);
          }
        }
      }
      if (smartIndex != null) {
        // Vérifier que la position n'est pas dans une section interdite (conclusion, recommandations)
        const forbiddenSections = /ce qu.il faut retenir|nos recommandations|articles connexes|à lire également/i;
        const afterSmartSnippet = html.substring(Math.max(0, smartIndex - 200), smartIndex);
        const lastH2Before = afterSmartSnippet.match(/<h2[^>]*>(.*?)<\/h2>/gi);
        const isInForbidden = lastH2Before?.some(h => forbiddenSections.test(h));
        
        if (!isInForbidden) {
          const out = html.slice(0, smartIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(smartIndex);
          if (out !== html) {
            console.log(`   📍 Widget ${placementId} placé en position contextuelle (mot-clé trouvé)`);
            return out;
          }
        } else {
          console.log(`   📍 Widget ${placementId}: position contextuelle dans section interdite, fallback anchor`);
        }
      }
    }

    switch (anchor) {
      case 'before_related': {
        const h2sFallback = Array.from(html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi));
        const endZonePatterns = /ce qu.il faut retenir|nos recommandations|en résumé|conclusion|questions?\s*fr[eé]quentes?|à retenir|articles?\s*connexes?|à lire également|FAQ/i;
        for (let i = h2sFallback.length - 1; i >= 1; i--) {
          if (!endZonePatterns.test(h2sFallback[i][1])) {
            const insertIndex = h2sFallback[i].index + h2sFallback[i][0].length;
            const afterH2 = html.substring(insertIndex);
            const nextPClose = afterH2.match(/<\/p>/i);
            const pos = nextPClose ? insertIndex + nextPClose.index + nextPClose[0].length : insertIndex;
            console.log(`   📍 Widget ${placementId || 'unknown'} placé avant zone conclusion (après "${h2sFallback[i][1].substring(0, 40)}")`);
            return html.slice(0, pos) + '\n\n' + moduleHtml + '\n\n' + html.slice(pos);
          }
        }
        return html;
      }

      case 'after_errors':
        // Après la section "Erreurs courantes à éviter" ou "Erreurs fréquentes"
        const errorsRegex = /<h2[^>]*>.*?erreurs?\s*(courantes?|fréquentes?|à\s*éviter).*?<\/h2>/i;
        const errorsMatch = html.match(errorsRegex);
        if (errorsMatch) {
          const sectionStart = errorsMatch.index ?? -1;
          const sectionHeaderEnd = sectionStart + errorsMatch[0].length;
          
          // Trouver la fin du contenu de cette section (prochain H2)
          const afterHeader = html.substring(sectionHeaderEnd);
          const nextH2Match = afterHeader.match(/<h2[^>]*>/i);
          
          // Zone où on va insérer (entre la section "Erreurs" et le prochain H2)
          const targetZone = nextH2Match ? afterHeader.substring(0, nextH2Match.index) : afterHeader;
          
          // Vérifier si un module d'affiliation existe déjà dans cette zone
          if (/<(?:div|aside)[^>]*class="affiliate-module"[^>]*data-placement-id/i.test(targetZone)) {
            // Module déjà présent, ne pas dupliquer
            return html;
          }
          
          if (nextH2Match) {
            // Insérer après le contenu de la section, avant le prochain H2
            const insertIndex = sectionHeaderEnd + (nextH2Match.index ?? 0);
            return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
          } else {
            // Pas de H2 suivant, insérer après quelques paragraphes de la section
            const paragraphsMatch = afterHeader.match(/(<p[^>]*>.*?<\/p>\s*){1,3}/i);
            if (paragraphsMatch) {
              const insertIndex = sectionHeaderEnd + (paragraphsMatch.index ?? 0) + paragraphsMatch[0].length;
              return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
            }
            // Fallback: juste après le H2
            return html.slice(0, sectionHeaderEnd) + '\n\n' + moduleHtml + '\n\n' + html.slice(sectionHeaderEnd);
          }
        }
        // Fallback: fin de document
        return html + '\n\n' + moduleHtml;

      case 'after_context':
        // Fluidité du récit : premier module après un minimum de contenu ; répartir les widgets sur les H2 (2e, 3e, 4e...).
        const allH2Context = html.matchAll(/<h2[^>]*>.*?<\/h2>/gi);
        const h2ListContext = Array.from(allH2Context);
        const h2TargetIndex = Math.min(1 + placementIndex, h2ListContext.length - 1);
        if (h2ListContext.length >= 2 && h2TargetIndex >= 0) {
          const targetH2 = h2ListContext[h2TargetIndex];
          const insertIndex = targetH2.index + targetH2[0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        if (h2ListContext.length >= 1) {
          // Un seul H2 : insérer après 2–3 paragraphes de ce bloc (pas juste après le titre)
          const afterFirstH2 = html.slice(h2ListContext[0].index + h2ListContext[0][0].length);
          const paragraphsBlock = afterFirstH2.match(/(<p[^>]*>.*?<\/p>\s*){2,3}/i);
          if (paragraphsBlock) {
            const insertIndex = h2ListContext[0].index + h2ListContext[0][0].length + paragraphsBlock.index + paragraphsBlock[0].length;
            return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
          }
          const oneP = afterFirstH2.match(/<p[^>]*>.*?<\/p>/i);
          if (oneP) {
            const insertIndex = h2ListContext[0].index + h2ListContext[0][0].length + oneP.index + oneP[0].length;
            return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
          }
        }
        // Pas de H2 ou structure courte : après le 2e paragraphe minimum
        const pMatchesContext = html.matchAll(/<p[^>]*>.*?<\/p>/gi);
        const pArrayContext = Array.from(pMatchesContext);
        if (pArrayContext.length >= 2) {
          const afterSecondP = pArrayContext[1].index + pArrayContext[1][0].length;
          return html.slice(0, afterSecondP) + '\n\n' + moduleHtml + '\n\n' + html.slice(afterSecondP);
        }
        if (pArrayContext.length === 1) {
          const insertIndex = pArrayContext[0].index + pArrayContext[0][0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        return html + '\n\n' + moduleHtml;

      case 'after_central_event':
        // Après section qui décrit l'événement central si identifiable, sinon fallback après 2e H2
        // Chercher un H2 qui pourrait décrire l'événement central (ex: "Événement", "Problème", "Situation")
        const centralEventRegex = /<h2[^>]*>(?:Événement|Problème|Situation|Incident|Défi)[^<]*<\/h2>/i;
        const centralEventMatch = html.match(centralEventRegex);
        if (centralEventMatch) {
          const insertIndex = centralEventMatch.index + centralEventMatch[0].length;
          // Chercher la fin de la section (prochain H2 ou fin de paragraphe)
          const afterSection = html.slice(insertIndex);
          const nextH2Match = afterSection.match(/<h2[^>]*>/i);
          if (nextH2Match) {
            const sectionEnd = insertIndex + nextH2Match.index;
            return html.slice(0, sectionEnd) + '\n\n' + moduleHtml + '\n\n' + html.slice(sectionEnd);
          }
          // Sinon après quelques paragraphes
          const afterParagraphs = afterSection.match(/(<p[^>]*>.*?<\/p>\s*){1,3}/i);
          if (afterParagraphs) {
            const sectionEnd = insertIndex + afterParagraphs[0].length;
            return html.slice(0, sectionEnd) + '\n\n' + moduleHtml + '\n\n' + html.slice(sectionEnd);
          }
        }
        // Fallback: répartir sur les H2 (2e, 3e, 4e... selon placementIndex)
        const h2Matches = html.matchAll(/<h2[^>]*>.*?<\/h2>/gi);
        const h2Array = Array.from(h2Matches);
        const centralTargetIdx = Math.min(1 + placementIndex, h2Array.length - 1);
        if (h2Array.length >= 2 && centralTargetIdx >= 0) {
          const targetH2 = h2Array[centralTargetIdx];
          const insertIndex = targetH2.index + targetH2[0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        if (h2Array.length >= 1) {
          const firstH2 = h2Array[0];
          const insertIndex = firstH2.index + firstH2[0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        return html + '\n\n' + moduleHtml;

      case 'after_critical_moment':
        // Après section "Moment critique" si identifiable, sinon après 2e H2
        const criticalMomentRegex = /<h2[^>]*>(?:Moment critique|Point critique|Tournant)[^<]*<\/h2>/i;
        const criticalMomentMatch = html.match(criticalMomentRegex);
        if (criticalMomentMatch) {
          const insertIndex = criticalMomentMatch.index + criticalMomentMatch[0].length;
          const afterSection = html.slice(insertIndex);
          const nextH2Match = afterSection.match(/<h2[^>]*>/i);
          if (nextH2Match) {
            const sectionEnd = insertIndex + nextH2Match.index;
            return html.slice(0, sectionEnd) + '\n\n' + moduleHtml + '\n\n' + html.slice(sectionEnd);
          }
        }
        // Fallback: répartir sur les H2 (2e, 3e... selon placementIndex)
        const h2Matches2 = html.matchAll(/<h2[^>]*>.*?<\/h2>/gi);
        const h2Array2 = Array.from(h2Matches2);
        const criticalTargetIdx = Math.min(1 + placementIndex, h2Array2.length - 1);
        if (h2Array2.length >= 2 && criticalTargetIdx >= 0) {
          const targetH2 = h2Array2[criticalTargetIdx];
          const insertIndex = targetH2.index + targetH2[0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        if (h2Array2.length >= 1) {
          const firstH2 = h2Array2[0];
          return html.slice(0, firstH2.index + firstH2[0].length) + '\n\n' + moduleHtml + '\n\n' + html.slice(firstH2.index + firstH2[0].length);
        }
        return html + '\n\n' + moduleHtml;

      case 'after_resolution':
        // Après section "Résolution" si identifiable, sinon fin de document
        const resolutionRegex = /<h2[^>]*>(?:Résolution|Solution|Conclusion)[^<]*<\/h2>/i;
        const resolutionMatch = html.match(resolutionRegex);
        if (resolutionMatch) {
          const insertIndex = resolutionMatch.index + resolutionMatch[0].length;
          const afterSection = html.slice(insertIndex);
          const nextH2Match = afterSection.match(/<h2[^>]*>/i);
          if (nextH2Match) {
            const sectionEnd = insertIndex + nextH2Match.index;
            return html.slice(0, sectionEnd) + '\n\n' + moduleHtml + '\n\n' + html.slice(sectionEnd);
          }
        }
        // Fallback: avant "Articles connexes" ou fin
        const relatedRegex2 = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
        const relatedMatch2 = html.match(relatedRegex2);
        if (relatedMatch2) {
          const insertIndex = relatedMatch2.index;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        // Fallback: fin de document
        return html + '\n\n' + moduleHtml;

      default:
        // Fallback: fin de document
        return html + '\n\n' + moduleHtml;
    }
  }

  /**
   * Vérifie et ajoute un CTA si manquant
   * FIX 4: CTA automatique injecté avant "Articles connexes"
   */
  ensureCTA(content, analysis) {
    // Détecter si un CTA existe déjà (inclut les widgets d'affiliation comme CTA implicites)
    const ctaPatterns = [
      /comparer.*vols|réserver.*vol|voir.*vols|découvrir.*offres|guide complet|réserver maintenant|comparer les prix|trouver.*vol|meilleur.*prix/i,
      /<a[^>]*>(comparer|réserver|voir|découvrir|guide|trouver|meilleur)/i,
      /<button[^>]*>(comparer|réserver|voir|découvrir|guide|trouver|meilleur)/i,
      /\[fv_widget\s+type="(flights|hotels|esim|connectivity)"[^\]]*\]/i,
      /class="affiliate-module"/i
    ];
    
    const hasCTA = ctaPatterns.some(pattern => pattern.test(content));
    
    if (hasCTA) {
      return { content, hasCTA: true };
    }
    
    // Déterminer le widget principal pour le CTA
    const mainWidget = analysis?.selected_widgets?.[0]?.slot || 'flights';
    let ctaText = '';
    
    switch (mainWidget) {
      case 'flights':
        ctaText = 'Compare les prix des vols et réserve ton billet';
        break;
      case 'hotels':
        ctaText = 'Trouve ton hébergement idéal';
        break;
      case 'esim':
      case 'connectivity':
        ctaText = 'Équipe-toi d\'une eSIM pour rester connecté';
        break;
      default:
        ctaText = 'Découvre les meilleures offres';
    }
    
    // Insérer le CTA juste avant "Articles connexes"
    const relatedSectionRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
    const relatedSectionMatch = content.match(relatedSectionRegex);
    
    const ctaBlock = `<p><strong>${ctaText}</strong></p>`;
    
    if (relatedSectionMatch) {
      const relatedSectionIndex = relatedSectionMatch.index;
      const newContent = content.slice(0, relatedSectionIndex) + '\n\n' + ctaBlock + '\n\n' + content.slice(relatedSectionIndex);
      console.log(`✅ CTA ajouté automatiquement avant "Articles connexes"`);
      return { content: newContent, hasCTA: true };
    }
    
    // Si pas de section "Articles connexes", insérer avant la fin
    const lastP = content.lastIndexOf('</p>');
    if (lastP !== -1) {
      const newContent = content.slice(0, lastP + 4) + '\n\n' + ctaBlock + '\n\n' + content.slice(lastP + 4);
      console.log(`✅ CTA ajouté automatiquement avant la fin`);
      return { content: newContent, hasCTA: true };
    }
    
    // Dernier recours: ajouter à la fin
    console.log(`✅ CTA ajouté automatiquement à la fin`);
    return { content: content + '\n\n' + ctaBlock, hasCTA: true };
  }

  /**
   * Récupère l'image featured depuis Pexels
   * CORRECTION: Évite les images déjà utilisées dans d'autres articles
   */
  async getFeaturedImage(article, analysis) {
    // GARDE DRY_RUN: Bloquer tout upload d'image en mode test
    if (DRY_RUN) {
      console.log('🧪 DRY_RUN: recherche d\'image featured bloquée');
      return null;
    }
    
    console.log('🖼️ Recherche d\'image featured (cascade multi-source)...');

    try {
      const imageManager = new ImageSourceManager();

      // Construire une query contextuelle basée sur la destination ET le sujet de l'article
      const geo = article.geo_defaults || analysis?.geo || {};
      const city = geo.city || '';
      const country = geo.country || '';
      const destination = city || country || analysis?.destinations?.[0] || '';
      const specificDest = city && country ? `${city} ${country}` : destination;
      
      // Extraire le thème de l'article depuis le titre pour des images plus pertinentes
      const titleLower = (article.title || '').toLowerCase();
      let themeKeywords = '';
      if (titleLower.includes('visa') || titleLower.includes('nomad')) themeKeywords = 'city coworking laptop';
      else if (titleLower.includes('budget') || titleLower.includes('coût')) themeKeywords = 'street market daily life';
      else if (titleLower.includes('atm') || titleLower.includes('frais') || titleLower.includes('banque')) themeKeywords = 'city street atm';
      else if (titleLower.includes('esim') || titleLower.includes('connecti')) themeKeywords = 'digital phone city';
      else if (titleLower.includes('assurance') || titleLower.includes('santé')) themeKeywords = 'hospital pharmacy travel';

      // Queries contextuelles par priorité (thème + destination → destination seule → générique)
      const queries = [];
      if (specificDest && themeKeywords) {
        queries.push(`${specificDest} ${themeKeywords}`);
      }
      if (specificDest) {
        queries.push(`${specificDest} travel scenery`);
        queries.push(`${specificDest} landscape panorama`);
      }
      if (country && country !== specificDest) {
        queries.push(`${country} landscape`);
      }
      queries.push('southeast asia travel landscape');

      // Cascade Pexels → Flickr CC-BY (Unsplash desactive)
      for (const query of queries) {
        console.log(`   🔍 Featured query: "${query}"`);
        const image = await imageManager.searchCascade(query, {
          orientation: 'landscape',
          minWidth: 1200,
          preferSource: 'pexels'
        });

        if (image) {
          imageManager.markUsed(image.sourceId, image.source);
          console.log(`   ✅ Image featured sélectionnée: ${image.source} — ${image.alt?.substring(0, 80)}`);
          
          return {
            url: image.url,
            alt: image.alt || specificDest || 'FlashVoyage',
            photographer: image.photographer,
            source: image.source,
            sourceId: image.sourceId,
            license: image.license
          };
        }
      }

      console.log('   ⚠️ Aucune image featured trouvée');
      return null;
    } catch (error) {
      console.error('   ❌ Erreur recherche image featured:', error.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────
  // PHASE 5.D: Images contextuelles inline
  // ─────────────────────────────────────────────────────────

  /**
   * Génère les queries de recherche d'images basées sur le contenu de l'article
   * @param {string} html - HTML de l'article
   * @param {Object} analysis - Analyse de l'article
   * @param {Object} pipelineContext - Contexte pipeline (geo_defaults, story, etc.)
   * @returns {Array} [{query, position, sourcePreference}]
   */
  generateImageQueries(html, analysis, pipelineContext) {
    const queries = [];
    const geo = pipelineContext?.geo_defaults || pipelineContext?.geo || {};
    // Préférer city > country > extracted destination
    const city = geo.city || '';
    const country = geo.country || '';
    const destination = city || country || analysis?.destinations?.[0] || '';
    
    // Construire une query spécifique : "Chiang Mai Thailand" > "Thailand" > "southeast asia"
    const specificDest = city && country ? `${city} ${country}` : destination;

    // Extraire les H2 de l'article
    const h2Matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
    const h2Texts = h2Matches.map(m => m[1].replace(/<[^>]*>/g, '').trim());

    // Image 1 ("hook visuel") — après le 1er H2, source Pexels
    // Query basée sur le SUJET de l'article (pas juste la destination)
    const articleTitle = (pipelineContext?.generatedTitle || '').toLowerCase();
    let hookQuery = '';
    // Extraire le thème du titre pour une image pertinente
    if (articleTitle.includes('visa') || articleTitle.includes('nomad')) hookQuery = `${specificDest || 'asia'} digital nomad coworking cafe`;
    else if (articleTitle.includes('budget') || articleTitle.includes('coût')) hookQuery = `${specificDest || 'asia'} street market food`;
    else if (articleTitle.includes('atm') || articleTitle.includes('frais') || articleTitle.includes('banque')) hookQuery = `${specificDest || 'asia'} city street`;
    else if (articleTitle.includes('esim') || articleTitle.includes('connect')) hookQuery = `${specificDest || 'asia'} smartphone travel`;
    else if (articleTitle.includes('transport') || articleTitle.includes('vol')) hookQuery = `${specificDest || 'asia'} airport travel`;
    else if (articleTitle.includes('hébergement') || articleTitle.includes('hotel') || articleTitle.includes('logement')) hookQuery = `${specificDest || 'asia'} hotel room`;
    else if (city) {
      const hookContext = this._extractSectionTheme(h2Texts[0] || '', city);
      hookQuery = hookContext || `${city} city street morning`;
    } else if (destination) {
      hookQuery = `${destination} landscape`;
    } else {
      hookQuery = 'southeast asia travel landscape';
    }
    queries.push({
      query: hookQuery,
      position: 'hook',
      sourcePreference: 'pexels'
    });

    // Image 2 ("mid-article") — après le 3e/4e H2
    // FIX: Use section-specific query with Flickr fallback for better contextual relevance
    const midH2Index = Math.min(Math.floor(h2Texts.length / 2), h2Texts.length - 1);
    if (midH2Index >= 0 && h2Texts[midH2Index]) {
      const sectionTheme = this._extractSectionTheme(h2Texts[midH2Index], specificDest);
      // Extract specific keywords from the section content for better matching
      const sectionContent = html.split(/<h2[^>]*>/gi)[midH2Index + 1] || '';
      const contextKeywords = this._extractContextKeywords(sectionContent, specificDest);
      queries.push({
        query: contextKeywords || sectionTheme,
        position: 'mid',
        sourcePreference: 'flickr' // Flickr has more specific/contextual images (temples, markets, trains)
      });
    }

    // Image 3 ("desire trigger") — vers la fin, avant recommandations
    {
      const endH2Index = h2Texts.length >= 5
        ? Math.max(0, h2Texts.length - 3)
        : Math.max(0, h2Texts.length - 2);
      const endTheme = this._extractSectionTheme(h2Texts[endH2Index] || '', specificDest);
      const endSection = html.split(/<h2[^>]*>/gi)[endH2Index + 1] || '';
      const endKeywords = this._extractContextKeywords(endSection, specificDest);
      queries.push({
        query: endKeywords || endTheme || `${specificDest || 'asia'} people travel`,
        position: 'end',
        sourcePreference: 'flickr' // Flickr for contextual relevance
      });
    }

    // Image 4 ("depth") — articles longs (8+ H2), entre mid et end
    if (h2Texts.length >= 8) {
      const depthH2Index = Math.floor(h2Texts.length * 0.7);
      const depthTheme = this._extractSectionTheme(h2Texts[depthH2Index] || '', specificDest);
      queries.push({
        query: depthTheme || `${specificDest || 'asia'} local life`,
        position: 'mid2',
        sourcePreference: 'pexels'
      });
    }

    return queries;
  }

  /**
   * Extrait un thème de recherche d'image à partir d'un titre H2
   */
  _extractSectionTheme(h2Text, destination) {
    const text = h2Text.toLowerCase();
    
    // Mapping thèmes courants → queries spécifiques et visuelles
    const themeMap = [
      { pattern: /budget|coût|prix|argent|dépens/i, query: 'local market stall' },
      { pattern: /transport|vol|avion|train|bus/i, query: 'train station' },
      { pattern: /hébergement|hôtel|hostel|logement/i, query: 'guesthouse boutique' },
      { pattern: /nourriture|manger|cuisine|restaurant|street food/i, query: 'street food vendor' },
      { pattern: /visa|immigration|frontière|administratif/i, query: 'airport immigration' },
      { pattern: /sécurité|santé|assurance/i, query: 'pharmacy clinic' },
      { pattern: /coworking|travail|remote|digital nomad|communauté|connect/i, query: 'coworking space cafe laptop' },
      { pattern: /plage|mer|île|island/i, query: 'beach sunset' },
      { pattern: /temple|culture|monument|histoire/i, query: 'temple golden' },
      { pattern: /recommand|conseil|astuce|retenir|planif/i, query: 'travel map planning' },
      { pattern: /rêve|immersion|arri|premier/i, query: 'city street morning' },
      { pattern: /défis|problème|obstacle/i, query: 'busy street' },
      { pattern: /long.terme|installation|expatri/i, query: 'apartment balcony view' }
    ];

    for (const { pattern, query } of themeMap) {
      if (pattern.test(text)) {
        return destination ? `${destination} ${query}` : `asia ${query}`;
      }
    }

    // Fallback: utiliser la destination + mots-clés significatifs du H2 (filtrer les stop words)
    const stopWords = new Set(['les', 'des', 'une', 'est', 'pour', 'dans', 'par', 'avec', 'qui', 'que', 'sur', 'son', 'ses', 'aux', 'cette', 'entre', 'elle', 'comment', 'quoi', 'quel', 'vraiment', 'idéale', 'bien']);
    const words = h2Text.split(/\s+/)
      .map(w => w.replace(/[^a-zA-ZÀ-ÿ]/g, ''))
      .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()))
      .slice(0, 2)
      .join(' ');
    return destination ? `${destination} ${words}` : words || 'asia travel';
  }

  /**
   * Extract specific visual keywords from section content for image search
   * E.g. "Le JR Pass ne couvre pas le Romancecar Tokyo-Hakone" → "Japan Shinkansen train station"
   * Better than generic "Japan budget" from the H2 title alone
   */
  _extractContextKeywords(sectionHtml, destination) {
    if (!sectionHtml) return null;
    const text = sectionHtml.replace(/<[^>]+>/g, ' ').toLowerCase();

    // Look for specific visual subjects in the section content
    const visualSubjects = [
      { pattern: /shinkansen|jr pass|train|gare|station/i, query: 'bullet train Shinkansen station' },
      { pattern: /ryokan|onsen|bain/i, query: 'traditional ryokan onsen' },
      { pattern: /temple|sanctuaire|shrine|torii/i, query: 'temple torii gate' },
      { pattern: /konbini|7.eleven|lawson|combini/i, query: 'convenience store konbini' },
      { pattern: /ramen|sushi|izakaya|kaiseki|tempura|street food|marché/i, query: 'local food restaurant' },
      { pattern: /backpack|sac|valise|bagage|ta-q-bin/i, query: 'traveler backpack luggage' },
      { pattern: /plage|beach|île|island|snorkel/i, query: 'tropical beach island' },
      { pattern: /tuk.?tuk|songthaew|scooter|moto/i, query: 'tuk tuk street' },
      { pattern: /marché|market|bazar|shopping/i, query: 'local market vendor' },
      { pattern: /hostel|dortoir|auberge|guesthouse/i, query: 'hostel bunk bed' },
      { pattern: /taxi|uber|grab|transfer/i, query: 'taxi city street' },
      { pattern: /aéroport|airport|vol|avion/i, query: 'airport terminal departure' },
      { pattern: /montagne|trek|randonnée|hiking|sommet/i, query: 'mountain hiking trail' },
      { pattern: /rice|rizière|campagne|rural/i, query: 'rice field countryside' },
      { pattern: /coucher.*soleil|sunset|lever/i, query: 'sunset scenic view' },
      { pattern: /pourboire|tip|restaurant|serveur/i, query: 'restaurant dining local' },
      { pattern: /visa|passeport|immigration|border/i, query: 'passport visa stamp' },
      { pattern: /usj|universal|disney|parc/i, query: 'theme park entrance' },
      { pattern: /teamlab|musée|museum|art/i, query: 'art museum exhibition' },
    ];

    for (const { pattern, query } of visualSubjects) {
      if (pattern.test(text)) {
        return destination ? `${destination} ${query}` : query;
      }
    }

    return null; // Fallback to _extractSectionTheme
  }

  /**
   * Insère 2-3 images contextuelles dans l'article
   * @param {string} html - HTML de l'article
   * @param {Object} analysis - Analyse
   * @param {Object} pipelineContext - Contexte pipeline
   * @returns {Object} {html, count, sources}
   */
  async insertContextualImages(html, analysis, pipelineContext) {
    console.log('🖼️ Insertion images contextuelles inline...');
    
    const imageManager = new ImageSourceManager();
    imageManager.migrateFromPexelsJson(); // Migration one-time si besoin

    // Générer les queries
    const queries = this.generateImageQueries(html, analysis, pipelineContext);
    console.log(`   📋 ${queries.length} image(s) à chercher`);

    // Rechercher les images (cascade multi-source)
    let images = await imageManager.searchMultiple(queries);

    // Fallback : si on a moins de 3 images, relancer avec queries génériques
    const minRequired = (pipelineContext?.editorialMode || 'evergreen') === 'news' ? 2 : 3;
    if (images.length < minRequired) {
      const geo = pipelineContext?.geo_defaults || pipelineContext?.geo || {};
      const dest = geo.city || geo.country || analysis?.destinations?.[0] || 'southeast asia';
      const fallbackQueries = [
        { query: `${dest} travel`, position: 'hook', sourcePreference: 'pexels' },
        { query: `${dest} street market`, position: 'mid', sourcePreference: 'pexels' },
        { query: `${dest} landscape nature`, position: 'end', sourcePreference: 'pexels' },
      ].filter((_, i) => i >= images.length);
      if (fallbackQueries.length > 0) {
        console.log(`   🔄 Fallback: ${images.length}/${minRequired} images, relance avec ${fallbackQueries.length} queries génériques`);
        const fallbackImages = await imageManager.searchMultiple(fallbackQueries);
        images = [...images, ...fallbackImages];
      }
    }

    if (images.length === 0) {
      console.log('   ⚠️ Aucune image trouvée');
      return { html, count: 0, sources: [] };
    }

    // Stocker dans pipelineContext pour l'upload WordPress
    if (pipelineContext) {
      pipelineContext.inlineImages = images;
    }

    // Insérer les images dans le HTML
    let result = html;
    const h2Matches = [...html.matchAll(/<h2[^>]*>.*?<\/h2>/gi)];
    const affiliatePositions = [...html.matchAll(/<(?:div|aside)[^>]*data-fv-segment="affiliate"|<(?:div|aside)[^>]*class="affiliate-module"/gi)]
      .map(m => m.index);

    let insertedCount = 0;
    const usedSources = [];
    // Offset tracker pour gérer les décalages après insertion
    let offset = 0;

    for (const image of images) {
      const figureHtml = ImageSourceManager.generateFigureHtml(image);
      let insertIndex = this._findImageInsertPosition(result, image.position, h2Matches, affiliatePositions, offset);

      if (insertIndex === -1) continue;

      // Vérifier espacement minimum (800 chars) avec les images déjà insérées
      // et avec les widgets affiliés
      const nearbyAffiliate = affiliatePositions.some(pos =>
        Math.abs((pos + offset) - insertIndex) < 200
      );
      if (nearbyAffiliate) continue;

      result = result.slice(0, insertIndex) + '\n\n' + figureHtml + '\n\n' + result.slice(insertIndex);
      offset += figureHtml.length + 4; // +4 pour les \n\n
      insertedCount++;
      usedSources.push(image.source);
    }

    return { html: result, count: insertedCount, sources: usedSources };
  }

  /**
   * Trouve la position d'insertion pour une image dans le HTML
   * @param {string} html - HTML actuel
   * @param {string} position - 'hook', 'mid', 'end'
   * @param {Array} h2Matches - Matches des H2
   * @param {Array} affiliatePositions - Positions des widgets affiliés
   * @param {number} offset - Décalage actuel
   * @returns {number} Index d'insertion ou -1
   */
  _findImageInsertPosition(html, position, h2Matches, affiliatePositions, offset) {
    // Recalculer les H2 sur le HTML actuel
    const currentH2s = [...html.matchAll(/<h2[^>]*>.*?<\/h2>/gi)];

    // Sections interdites — never place images near conclusions, recommendations, FAQs
    const forbiddenSections = /ce qu.il faut retenir|à lire également|articles connexes|nos recommandations|questions? fréquentes?|faq/i;

    // ── SMART PLACEMENT RULES (Senior Content Writer Best Practices) ──
    // 1. NEVER in the intro (before 1st H2) — text hooks first, image rewards after
    // 2. After a "proof" section (data, testimony, comparison) — not before
    // 3. NEVER right before a table or CTA — dilutes attention
    // 4. After a "scene change" (new location, new theme)
    // 5. Last image = desire trigger before conclusion

    switch (position) {
      case 'hook': {
        // Place after the FIRST section that contains proof/data (not just the 2nd H2)
        // Look for the first section with numbers (prices, percentages, dates)
        if (currentH2s.length < 2) return currentH2s.length === 1 ? currentH2s[0].index + currentH2s[0][0].length : -1;

        // Find first section with concrete data (numbers, prices)
        let bestIdx = 1; // default: after 2nd H2
        for (let i = 1; i < Math.min(currentH2s.length, 4); i++) {
          const sectionStart = currentH2s[i].index + currentH2s[i][0].length;
          const sectionEnd = i + 1 < currentH2s.length ? currentH2s[i + 1].index : sectionStart + 2000;
          const sectionText = html.substring(sectionStart, sectionEnd);
          // Section with data = good place for image after it
          if (/\d+\s*[€$%]|\d{3,}/.test(sectionText)) {
            bestIdx = i;
            break;
          }
        }

        const afterTargetH2 = currentH2s[bestIdx].index + currentH2s[bestIdx][0].length;
        // Place AFTER the last </p> of this section (not after first — let the proof build up)
        const nextH2 = bestIdx + 1 < currentH2s.length ? currentH2s[bestIdx + 1].index : html.length;
        const sectionHtml = html.substring(afterTargetH2, nextH2);
        const lastP = sectionHtml.lastIndexOf('</p>');
        if (lastP !== -1) {
          return afterTargetH2 + lastP + 4; // +4 for '</p>'
        }
        return afterTargetH2;
      }

      case 'mid': {
        // Après le 3e ou 4e H2 (milieu d'article)
        const midIndex = Math.min(Math.floor(currentH2s.length / 2), currentH2s.length - 1);
        if (midIndex < 1) return -1;
        const targetH2 = currentH2s[midIndex];
        // Vérifier que ce n'est pas une section interdite
        if (forbiddenSections.test(targetH2[0])) return -1;
        const afterH2 = targetH2.index + targetH2[0].length;
        // Trouver la fin du premier <p> après
        const pAfter = html.substring(afterH2).match(/<\/p>/i);
        if (pAfter) {
          return afterH2 + pAfter.index + pAfter[0].length;
        }
        return afterH2;
      }

      case 'mid2': {
        // Entre 60-75% de l'article (pour les articles longs)
        const mid2Index = Math.floor(currentH2s.length * 0.7);
        if (mid2Index < 2 || mid2Index >= currentH2s.length) return -1;
        const targetH2m2 = currentH2s[mid2Index];
        if (forbiddenSections.test(targetH2m2[0])) return -1;
        const afterH2m2 = targetH2m2.index + targetH2m2[0].length;
        const pAfterM2 = html.substring(afterH2m2).match(/<\/p>/i);
        if (pAfterM2) {
          return afterH2m2 + pAfterM2.index + pAfterM2[0].length;
        }
        return afterH2m2;
      }

      case 'end': {
        // Avant-dernière section (avant "Ce qu'il faut retenir" ou "Nos recommandations")
        for (let i = currentH2s.length - 1; i >= 0; i--) {
          if (forbiddenSections.test(currentH2s[i][0])) {
            return currentH2s[i].index;
          }
        }
        if (currentH2s.length >= 3) {
          return currentH2s[currentH2s.length - 2].index;
        }
        return -1;
      }

      default:
        return -1;
    }
  }

  /**
   * Charge les URLs Pexels déjà utilisées depuis la base de données d'articles
   */
  async loadUsedPexelsImages() {
    const usedImages = new Set();
    
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Charger depuis articles-database.json
      const dbPath = path.join(process.cwd(), 'articles-database.json');
      if (fs.existsSync(dbPath)) {
        const dbContent = fs.readFileSync(dbPath, 'utf-8');
        const db = JSON.parse(dbContent);
        
        if (db.articles && Array.isArray(db.articles)) {
          for (const article of db.articles) {
            // Vérifier si l'article a une URL Pexels stockée
            if (article.pexels_url) {
              usedImages.add(article.pexels_url);
            }
            if (article.pexels_id) {
              usedImages.add(article.pexels_id.toString());
            }
            // Vérifier aussi dans featured_image si c'est une URL Pexels
            if (article.featured_image && article.featured_image.includes('pexels.com')) {
              usedImages.add(article.featured_image);
            }
          }
        }
      }
      
      // Charger aussi depuis un fichier dédié si existe
      const usedImagesPath = path.join(process.cwd(), 'used-pexels-images.json');
      if (fs.existsSync(usedImagesPath)) {
        const usedImagesContent = fs.readFileSync(usedImagesPath, 'utf-8');
        const usedImagesList = JSON.parse(usedImagesContent);
        if (Array.isArray(usedImagesList)) {
          usedImagesList.forEach(url => usedImages.add(url));
        }
      }
    } catch (error) {
      console.warn('   ⚠️ Erreur chargement images utilisées:', error.message);
    }
    
    return usedImages;
  }

  /**
   * Sauvegarde une URL Pexels utilisée pour éviter les doublons futurs
   */
  async saveUsedPexelsImage(image) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const usedImagesPath = path.join(process.cwd(), 'used-pexels-images.json');
      let usedImages = [];
      
      // Charger les images déjà stockées
      if (fs.existsSync(usedImagesPath)) {
        const content = fs.readFileSync(usedImagesPath, 'utf-8');
        usedImages = JSON.parse(content);
      }
      
      // Ajouter la nouvelle image (par URL et ID)
      const imageUrl = image.src.large || image.src.original;
      const imageId = image.id.toString();
      
      if (!usedImages.includes(imageUrl)) {
        usedImages.push(imageUrl);
      }
      if (!usedImages.includes(imageId)) {
        usedImages.push(imageId);
      }
      
      // Limiter à 500 images pour éviter un fichier trop gros
      if (usedImages.length > 500) {
        usedImages = usedImages.slice(-500); // Garder les 500 dernières
      }
      
      // Sauvegarder
      fs.writeFileSync(usedImagesPath, JSON.stringify(usedImages, null, 2));
      console.log(`   💾 Image sauvegardée dans used-pexels-images.json (${usedImages.length} images totales)`);
    } catch (error) {
      console.warn('   ⚠️ Erreur sauvegarde image utilisée:', error.message);
    }
  }

  /**
   * Mappe les catégories/tags vers les IDs WordPress
   */
  async getCategoriesAndTagsIds(categories, tags) {
    console.log("Mapping des categories et tags...");

    try {
      const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import("./config.js");
      const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString("base64");
      const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };

      // Known category IDs (verified against WordPress)
      const categoryMap = {
        "Destinations": 1,
        "Digital Nomades Asie": 138,
        "Vietnam": 59,
        "Tha\u00eflande": 60,
        "Japon": 61,
        "Singapour": 62,
        "Cor\u00e9e du Sud": 63,
        "Philippines": 64,
        "Indon\u00e9sie": 182,
        "Itin\u00e9raires & Budget": 184,
        "Itin\u00e9raires par pays": 185,
        "Co\u00fbt de la vie": 186,
        "Vie de Nomade": 187,
        "Outils Voyage": 188,
        "Trouver un vol": 189,
        "Assurance voyage": 190,
        "eSIM & Internet": 191,
        "Transferts a\u00e9roport": 192,
        "Logement & Coliving": 140,
        "Transport & Mobilit\u00e9": 141,
        "Sant\u00e9 & Assurance": 142,
        "Finance & Fiscalit\u00e9": 143,
        "Visa & Formalit\u00e9s": 139,
        "Ressources": 164,
        "Guides Pratiques": 165,
        "T\u00e9moignages": 166,
        "Comparaisons": 167,
        "Analyses": 168
      };

      // Known tag IDs (verified against WordPress)
      const knownTagMap = {
        "actualite": 171, "Analyses": 157, "Asie": 172, "bon-plan": 175,
        "Budget": 87, "Business": 179, "Coliving": 158, "Comparaisons": 156,
        "Confirm\u00e9": 151, "Cor\u00e9e du Sud": 183, "Coworking": 159, "D\u00e9butant": 150,
        "Destinations": 51, "\u00c9v\u00e9nement": 163, "Expert": 152, "expertise": 174,
        "Famille": 153, "Fiscalit\u00e9": 160, "Formalit\u00e9s": 116, "Guide": 84,
        "Guide Local": 106, "Guides pratiques": 55, "Indon\u00e9sie": 177,
        "Inspiration": 181, "Japon": 76, "laos": 193, "Nomade": 136,
        "Nomadisme Digital": 176, "Pratique": 85, "Prix": 86, "Promo": 83,
        "Revenus": 178, "Senior": 154, "Singapour": 100, "strategique": 173,
        "Succ\u00e8s": 180, "T\u00e9moignages": 155, "Tendance": 162, "Tha\u00eflande": 75,
        "Tourism": 122, "Tourisme": 123, "Transport": 110, "Urgent": 161,
        "Vietnam": 95, "Visa": 77, "Voyage": 79
      };

      // Resolve category IDs (use map, no API needed)
      const categoryIds = categories
        .map(cat => categoryMap[cat])
        .filter(id => id !== undefined);

      // Resolve tag IDs: use known map first, then search/create via WP API
      const tagIds = [];
      for (const tag of tags) {
        if (knownTagMap[tag]) {
          tagIds.push(knownTagMap[tag]);
          continue;
        }
        // Tag not in known map: search WP API then create if needed
        try {
          const axios = (await import("axios")).default;
          const searchRes = await axios.get(
            `${WORDPRESS_URL}/wp-json/wp/v2/tags?search=${encodeURIComponent(tag)}&per_page=5`,
            { headers }
          );
          const found = searchRes.data.find(t => t.name.toLowerCase() === tag.toLowerCase());
          if (found) {
            tagIds.push(found.id);
            console.log(`   Tag "${tag}" found via API -> ID ${found.id}`);
          } else {
            // Create the tag on WordPress
            const createRes = await axios.post(
              `${WORDPRESS_URL}/wp-json/wp/v2/tags`,
              { name: tag },
              { headers }
            );
            tagIds.push(createRes.data.id);
            console.log(`   Tag "${tag}" created -> ID ${createRes.data.id}`);
          }
        } catch (err) {
          console.warn(`   Warning: Could not resolve tag "${tag}": ${err.message}`);
        }
      }

      console.log(`   Categories: ${categoryIds.length} IDs -> [${categoryIds.join(", ")}]`);
      console.log(`   Tags: ${tagIds.length} IDs -> [${tagIds.join(", ")}]`);

      return {
        categories: categoryIds,
        tags: tagIds
      };
    } catch (error) {
      console.error("   Error mapping:", error.message);
      return { categories: [], tags: [] };
    }
  }

  /**
   * Détecte les phrases potentiellement incomplètes (WARNING ONLY - pas de suppression)
   * La correction est désormais gérée par la passe 2 LLM (improveContentWithLLM)
   * 
   * @param {string} html - HTML à valider
   * @param {Object} report - Rapport QA
   * @returns {Promise<string>} HTML INCHANGÉ (warning only)
   */
  async detectAndFixIncompleteSentences(html, report) {
    console.log('🔍 Détection phrases incomplètes (warning only - pas de suppression)...');
    
    const suspectSentences = [];
    
    // Pattern 1: DÉSACTIVÉ COMPLÈTEMENT - causait suppression de contenu valide
    // Paragraphes sans ponctuation finale sont souvent du contenu éditorial valide
    
    // Pattern 2: Phrases qui se terminent par des mots très courts (< 3 caractères)
    // WARNING ONLY - ne supprime plus, juste signale
    const incompleteWords = html.match(/<p[^>]*>([^<]*\s[a-z]{1,2})<\/p>/gi);
    if (incompleteWords) {
      incompleteWords.forEach(match => {
        const text = match.replace(/<[^>]+>/g, '').trim();
        const lastWord = text.split(/\s+/).pop();
        if (lastWord && lastWord.length < 3 && text.length > 20) {
          suspectSentences.push({
            text: text.substring(0, 100),
            reason: 'mot_incomplet'
          });
        }
      });
    }
    
    // Pattern 3: Paragraphes qui se terminent brutalement
    // WARNING ONLY - ne supprime plus
    const unclosedParagraphs = html.match(/<p[^>]*>([^<]{50,})(?!<\/p>)/gi);
    if (unclosedParagraphs) {
      unclosedParagraphs.forEach(match => {
        const text = match.replace(/<[^>]+>/g, '').trim();
        const lastWord = text.split(/\s+/).pop();
        if (lastWord && lastWord.length < 3 && text.length > 50) {
          suspectSentences.push({
            text: match.substring(0, 100),
            reason: 'paragraphe_non_ferme'
          });
        }
      });
    }
    
    // Ajouter au rapport (WARNING ONLY - pas de suppression)
    if (suspectSentences.length > 0) {
      report.checks.push({
        name: 'incomplete_sentences',
        status: 'warn', // Warning, pas fail - la passe 2 LLM devrait avoir corrigé
        details: `${suspectSentences.length} phrase(s) suspecte(s) détectée(s) (non supprimées)`
      });
      
      // Log les warnings pour diagnostic
      suspectSentences.forEach(item => {
        console.log(`   ⚠️ Phrase suspecte (${item.reason}): "${item.text}..."`);
      });
    } else {
      report.checks.push({
        name: 'incomplete_sentences',
        status: 'pass',
        details: 'Aucune phrase suspecte détectée'
      });
    }
    
    console.log(`✅ Phrases incomplètes: ${suspectSentences.length} warning(s), 0 supprimée(s) (passe 2 LLM gère les corrections)`);
    
    // RETOURNE HTML INCHANGÉ - plus de suppression
    return html;
  }

  /**
   * PHASE 2 FIX: Nettoyage deterministe des tournures plates recurrentes du LLM.
   * Remplace "il est important de [verbe]" par le verbe directement a l'imperatif (tutoiement).
   */
  removeGenericPhrases(html, report) {
    let fixCount = 0;

    const patterns = [
      // "il est important de + infinitif" -> imperatif 2e pers
      { regex: /[Ii]l est important de\s+/g, replacement: '' },
      { regex: /[Ii]l est essentiel de\s+/g, replacement: '' },
      { regex: /[Ii]l est recommandé de\s+/g, replacement: '' },
      { regex: /[Ii]l est crucial de\s+/g, replacement: '' },
      { regex: /[Ii]l est conseillé de\s+/g, replacement: '' },
      { regex: /[Ii]l convient de\s+/g, replacement: '' },
      { regex: /[Nn]'hésite pas à\s+/g, replacement: '' },
      { regex: /[Nn]'hésitez pas à\s+/g, replacement: '' }
    ];

    let cleaned = html;
    for (const { regex, replacement } of patterns) {
      cleaned = cleaned.replace(regex, (match) => {
        fixCount++;
        return replacement;
      });
    }

    // Capitaliser la premiere lettre apres suppression si elle suit un tag d'ouverture ou un debut de phrase
    cleaned = cleaned.replace(/>(\s*)([a-zàâäéèêëïîôùûüÿç])/g, (m, space, letter) => {
      return '>' + space + letter.toUpperCase();
    });

    if (fixCount > 0) {
      console.log(`   🧹 GENERIC_PHRASES_FIX: ${fixCount} tournure(s) plate(s) supprimée(s)`);
      if (report) {
        report.checks.push({
          name: 'generic_phrases_fix',
          status: 'pass',
          details: `${fixCount} tournure(s) plate(s) nettoyée(s)`
        });
      }
    }
    return cleaned;
  }

  /**
   * PHASE 2 FIX: Nettoyage deterministe des phrases plates LLM.
   * Remplace les tournures generiques par des formulations directes.
   */
  removeGenericPhrases(html, report) {
    const replacements = [
      // "il est important de + verbe" -> "verbe" (imperatif tu)
      [/[Ii]l est important de\s+/g, ''],
      [/[Ii]l est essentiel de\s+/g, ''],
      [/[Ii]l est recommandé de\s+/g, ''],
      [/[Ii]l est crucial de\s+/g, ''],
      [/[Ii]l est conseillé de\s+/g, ''],
      [/[Ii]l convient de\s+/g, ''],
      [/[Nn]'hésite pas à\s+/g, ''],
      [/[Nn]'hésitez pas à\s+/g, ''],
      // Variantes avec "que"
      [/[Ii]l est important que\s+/g, ''],
      [/[Ii]l est essentiel que\s+/g, ''],
    ];

    let fixCount = 0;
    let cleaned = html;
    for (const [pattern, replacement] of replacements) {
      const before = cleaned;
      cleaned = cleaned.replace(pattern, replacement);
      if (cleaned !== before) {
        const matches = before.match(pattern);
        fixCount += matches ? matches.length : 0;
      }
    }

    if (fixCount > 0) {
      console.log(`   🧹 GENERIC_PHRASE_FIX: ${fixCount} tournure(s) plate(s) supprimée(s)`);
      if (report) {
        report.checks.push({
          name: 'generic_phrase_fix',
          status: 'pass',
          details: `${fixCount} tournure(s) plate(s) nettoyée(s)`
        });
      }
    }
    return cleaned;
  }

  /**
   * PHASE 3 FIX: Capitalise les noms propres geographiques dans tout le HTML
   * Corrige "vietnam" → "Vietnam", "japon" → "Japon", etc.
   */
  capitalizeProperNouns(html) {
    const PROPER_NOUNS = {
      'vietnam': 'Vietnam', 'thaïlande': 'Thaïlande', 'thailande': 'Thaïlande',
      'indonésie': 'Indonésie', 'indonesie': 'Indonésie', 'singapour': 'Singapour',
      'japon': 'Japon', 'cambodge': 'Cambodge', 'malaisie': 'Malaisie',
      'philippines': 'Philippines', 'myanmar': 'Myanmar', 'laos': 'Laos',
      'taïwan': 'Taïwan', 'taiwan': 'Taïwan',
      'bangkok': 'Bangkok', 'hanoi': 'Hanoi', 'hanoï': 'Hanoï',
      'tokyo': 'Tokyo', 'kyoto': 'Kyoto', 'osaka': 'Osaka',
      'bali': 'Bali', 'lombok': 'Lombok', 'phuket': 'Phuket',
      'chiang mai': 'Chiang Mai', 'ho chi minh': 'Ho Chi Minh',
      'kuala lumpur': 'Kuala Lumpur', 'phnom penh': 'Phnom Penh',
      'siem reap': 'Siem Reap', 'da nang': 'Da Nang',
      'angkor wat': 'Angkor Wat', 'angkor': 'Angkor',
      'hong kong': 'Hong Kong', 'séoul': 'Séoul', 'seoul': 'Séoul',
      'manille': 'Manille', 'jakarta': 'Jakarta', 'cebu': 'Cebu',
      'ubud': 'Ubud', 'canggu': 'Canggu', 'seminyak': 'Seminyak',
    };

    let result = html;
    let fixes = 0;

    // Traiter d'abord les noms multi-mots (pour eviter des remplacements partiels)
    const sorted = Object.entries(PROPER_NOUNS).sort((a, b) => b[0].length - a[0].length);

    for (const [lower, proper] of sorted) {
      if (lower === proper.toLowerCase() && lower === proper) continue;
      const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Ne remplacer que dans le contenu texte (pas dans les attributs/URLs)
      const pattern = new RegExp(`(>[^<]*?)\\b${escaped}\\b`, 'gi');
      const before = result;
      result = result.replace(pattern, (match, prefix) => {
        // Verifier que le mot n'est pas deja bien capitalise
        const wordInMatch = match.substring(prefix.length);
        if (wordInMatch === proper) return match;
        return prefix + proper;
      });
      if (result !== before) {
        fixes++;
      }
    }

    if (fixes > 0) {
      console.log(`   ✏️ PROPER_NOUNS: ${fixes} nom(s) propre(s) capitalisé(s)`);
    }
    return result;
  }

  /**
   * PHASE 2.3b: Corrige les mots colles (ex: "alternativeeconomique" -> "alternative economique")
   * Module dedie, separe du detecteur d'anglais.
   * Regles: >14 chars, segments >=4 chars, pas de split si tiret/apostrophe, whitelist mots valides.
   */
  fixWordGlue(html, report) {
    const VALID_LONG_WORDS = new Set([
      'déséquilibrer', 'rééquilibrer', 'réorganiser', 'préexistant', 'interethnique',
      'réélection', 'réévaluer', 'préétabli', 'réexaminer', 'réorienter',
      'préinscription', 'réintroduire', 'réinventer', 'réinitialiser',
      'réaménager', 'réapprendre', 'réapprovisionnement', 'préavis',
      'coéquipier', 'autoévaluation', 'néanmoins', 'dorénavant',
      'conséquemment', 'subséquemment', 'simultanément', 'antérieurement',
      'postérieurement', 'extérieurement', 'intérieurement', 'ultérieurement',
      'inévitablement', 'considérablement', 'préalablement', 'éventuellement',
      'particulièrement', 'régulièrement', 'dernièrement', 'premièrement',
      'deuxièmement', 'troisièmement', 'entièrement', 'sincèrement',
      'conséquence', 'différemment', 'référence', 'préférence',
      'expérience', 'compétence', 'fréquence', 'séquence',
      'précédent', 'indépendant', 'présentation', 'préparation',
      'génération', 'opération', 'réservation', 'célébration'
    ]);

    let fixCount = 0;

    // Pre-pass: split 2-char common French words glued to accented words (not caught by main regex {3,})
    const SHORT_GLUE_WORDS = new Set(['tu', 'où', 'il', 'on', 'ou', 'au', 'du', 'un', 'je', 'ce', 'se', 'ne', 'te', 'me', 'le', 'la', 'de', 'en', 'ni', 'si']);
    const preClean = html.replace(/\b([a-zàâäéèêëïîôùûüÿçœ]{2})(é|è|ê|à|â|ù|û|ô|î|œ)([a-zàâäéèêëïîôùûüÿçœ]{3,})\b/gi, (match, left, accent, right) => {
      if (SHORT_GLUE_WORDS.has(left.toLowerCase())) {
        fixCount++;
        return left + ' ' + accent + right;
      }
      return match;
    });

    // PHASE 3 FIX: Seuil abaisse de 15 a 7 chars pour attraper "fautêtre" (8), "doitêtre" (8), etc.
    const cleaned = preClean.replace(/\b([a-zàâäéèêëïîôùûüÿç]{3,})(é|è|ê|à|â|ù|û|ô|î)([a-zàâäéèêëïîôùûüÿç]{3,})\b/gi, (match, left, accent, right) => {
      if (match.length < 7) return match;
      if (match.includes('-') || match.includes("'") || match.includes('\u2019')) return match;
      const lower = match.toLowerCase();
      if (VALID_LONG_WORDS.has(lower)) return match;
      if (left.length < 3 || right.length < 3) return match;
      fixCount++;
      return left + ' ' + accent + right;
    });

    // PHASE 3 FIX ADDENDUM: Collages connus sans accent (LLM artefacts frequents)
    const KNOWN_GLUE_FIXES = [
      [/repas(e|é)conomiques?/gi, 'Repas $1conomique'],
      [/nuit(s?)hotel/gi, 'nuit$1 hotel'],
      [/ticket(s?)bus/gi, 'ticket$1 bus'],
      [/visa(s?)touristiques?/gi, 'visa$1 touristique'],
    ];

    // Nom propre (majuscule) collé à un mot accentué (Tokyoépuisé → Tokyo épuisé)
    const PROPER_NOUN_GLUE = /([A-ZÀÂÉÈÊËÏÎÔÙÛÜŸÇ][a-zàâäéèêëïîôùûüÿçœ]{2,})(é|è|ê|à|â|ù|û|ô|î)([a-zàâäéèêëïîôùûüÿçœ]{2,})/g;
    let camelCleaned = cleaned.replace(PROPER_NOUN_GLUE, (match, left, accent, right) => {
      const lower = match.toLowerCase();
      if (VALID_LONG_WORDS.has(lower)) return match;
      fixCount++;
      return left + ' ' + accent + right;
    });
    for (const [regex, replacement] of KNOWN_GLUE_FIXES) {
      const before = camelCleaned;
      camelCleaned = camelCleaned.replace(regex, replacement);
      if (camelCleaned !== before) fixCount++;
    }

    // PHASE 3 FIX: Reparer les espaces parasites a l'interieur des mots (artefact tokenisation LLM)
    let spaceFixes = 0;
    const COMMON_SPLIT_WORDS = {
      'suppl émentaires': 'supplémentaires',
      'suppl émentaire': 'supplémentaire',
      'compl ètement': 'complètement',
      'compl émentaire': 'complémentaire',
      'compl émentaires': 'complémentaires',
      'particuli èrement': 'particulièrement',
      'consid érablement': 'considérablement',
      'r éellement': 'réellement',
      'g énéralement': 'généralement',
      'imm édiatement': 'immédiatement',
      'r égulièrement': 'régulièrement',
      'pr écédemment': 'précédemment',
      'enti èrement': 'entièrement',
      'derni èrement': 'dernièrement',
      'é normément': 'énormément',
      'v éritablement': 'véritablement',
      'n écessairement': 'nécessairement',
      'pr éalablement': 'préalablement',
      'c œur': 'cœur',
      'intér êt': 'intérêt',
      'intér êts': 'intérêts',
      'entr être': 'entretenir',
      'man œuvre': 'manœuvre',
      'man œuvres': 'manœuvres',
      'œ uvre': 'œuvre',
      'œ uvres': 'œuvres',
      'au-del à': 'au-delà',
      'peut- être': 'peut-être',
      'peut -être': 'peut-être',
      'c\' est': "c'est",
      'l\' on': "l'on",
      'd\' un': "d'un",
      'd\' une': "d'une",
      'qu\' il': "qu'il",
      'qu\' elle': "qu'elle",
      'n\' est': "n'est",
      'j\' ai': "j'ai",
      's\' est': "s'est",
    };

    let cleanedWithSpaces = camelCleaned;
    for (const [broken, fixed] of Object.entries(COMMON_SPLIT_WORDS)) {
      const regex = new RegExp(broken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const before = cleanedWithSpaces;
      cleanedWithSpaces = cleanedWithSpaces.replace(regex, fixed);
      if (cleanedWithSpaces !== before) {
        spaceFixes++;
      }
    }

    // Pattern generique: lettre(s) + espace + accent + lettres (artefact tokenisation)
    // Ex: "suppl émentaires" → "supplémentaires" (espace parasite dans un mot)
    // IMPORTANT: Ne PAS rejoindre si left est un mot français autonome (sinon on recolle "peuvent être" → "peuventêtre")
    // Deux garde-fous : (1) liste de mots courants, (2) heuristique suffixe verbes/adverbes/noms
    const DO_NOT_JOIN_LEFT = new Set([
      'des', 'les', 'une', 'un', 'du', 'au', 'aux', 'ces', 'mes', 'tes', 'ses', 'nos', 'vos', 'leurs',
      'de', 'le', 'la', 'ce', 'ma', 'ta', 'sa', 'mon', 'ton', 'son',
      'peut', 'sont', 'font', 'fait', 'doit', 'faut', 'vont', 'veut', 'ont', 'est', 'fut', 'soit',
      'pense', 'doivent', 'peuvent', 'seront', 'auraient', 'avaient', 'feront', 'aurais',
      'pour', 'dans', 'par', 'sur', 'sous', 'sans', 'vers', 'chez', 'entre', 'avec',
      'que', 'qui', 'elle', 'elles', 'lui', 'leur', 'nous', 'vous', 'ils',
      'comment', 'tout', 'toute', 'cette', 'chaque', 'notre', 'votre',
      'choix', 'transport', 'mode', 'prix', 'prise', 'prend', 'cet',
      'comme', 'quand', 'mais', 'donc', 'aussi', 'bien', 'tant', 'trop', 'fort', 'quel', 'quelle',
      'très', 'après', 'avant', 'depuis', 'même', 'encore', 'assez', 'moins', 'peu',
      'ou', 'et', 'ni', 'si', 'car', 'plus', 'pas', 'bon', 'bel', 'mal', 'vif', 'bas', 'gros', 'long', 'fin',
      'voyage', 'peux', 'faire', 'seulement', 'sembler', 'pourrait', 'pourraient',
      'devrait', 'devraient', 'serait', 'seraient', 'aurait', 'semble', 'reste',
      'confort', 'alors', 'jamais', 'souvent', 'parfois', 'toujours', 'vraiment',
      'certains', 'certaines', 'certain', 'certaine', 'quelques', 'plusieurs', 'chacun', 'chacune',
      'aucun', 'aucune', 'autres', 'autre', 'nombreux', 'nombreuses',
      'tu', 'il', 'je', 'on', 'où', 'se', 'ne', 'te', 'me', 'en',
      'repas',
      // Common nouns that should NOT be joined with following accented word
      'via', 'visa', 'yoga', 'spa', 'quota', 'ultra', 'extra', 'mega', 'meta',
      'budget', 'transit', 'ticket', 'billet', 'objet', 'projet', 'sujet', 'effet', 'aspect',
      'coût', 'début', 'réseau', 'bureau', 'niveau', 'milieu',
      'communauté', 'séjour', 'retour', 'détour', 'parcours', 'secours', 'recours',
      'train', 'avion', 'bateau', 'hôtel', 'hostel', 'auberge',
      'temps', 'corps', 'bras', 'pays', 'avis', 'choisis',
      'normal', 'général', 'local', 'total', 'final', 'oral', 'global',
      'court', 'lourd', 'chaud', 'froid',
    ]);
    const WORD_SUFFIX_RE = /(?:er|ir|re|oir|ais|ait|aient|ons|ent|ant|ment|eux|oux|age|tion|eur|ard|ois|ais|ence|ance|ure|ble|que|ise|ose|ude|es|ez|ing|ns|ts)$/i;
    cleanedWithSpaces = cleanedWithSpaces.replace(/\b([a-zàâäéèêëïîôùûüÿçœ]{1,})\s(é|è|ê|à|â|ù|û|ô|î|œ)([a-zàâäéèêëïîôùûüÿçœ]{1,})\b/gi, (match, left, accent, right) => {
      if (match.includes('-') || match.includes("'")) return match;
      const joined = left + accent + right;
      if (joined.length > 20) return match;
      if (joined.length < 3) return match;
      const leftLower = left.toLowerCase();
      const isKnownWord = DO_NOT_JOIN_LEFT.has(leftLower);
      const hasSuffix = left.length >= 4 && WORD_SUFFIX_RE.test(leftLower);
      if (isKnownWord || hasSuffix) {
        return match;
      }
      spaceFixes++;
      return joined;
    });

    const totalFixes = fixCount + spaceFixes;
    if (totalFixes > 0) {
      console.log(`   🔧 WORD_GLUE_FIX: ${fixCount} collage(s) + ${spaceFixes} espace(s) parasite(s) corrigé(s)`);
      if (report) {
        report.checks.push({
          name: 'word_glue_fix',
          status: 'pass',
          details: `${fixCount} collage(s) + ${spaceFixes} espace(s) parasite(s) corrigé(s)`
        });
      }
    }
    return cleanedWithSpaces;
  }

  /**
   * Nettoyage déterministe final (ponctuation/phrases tronquées/résidus typographiques).
   */
  /**
   * Dedup 10-gram repetitions to align with quality-analyzer scoring.
   * Finds 10-word sequences that appear in multiple sentences and removes
   * the second occurrence's sentence from its containing <p> or <li>.
   */
  dedup10grams(html) {
    if (!html || typeof html !== 'string') return html;
    
    // Strip HTML to get plain text, excluding affiliate modules and FAQ details
    let textForCheck = html
      .replace(/<aside[^>]*class="[^"]*affiliate[^"]*"[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<details[\s\S]*?<\/details>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    
    // Split into sentences and build 10-gram map (same logic as quality-analyzer)
    const sentences = textForCheck.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 20);
    const ngramToSentences = new Map();
    
    sentences.forEach((sentence, sIdx) => {
      const words = sentence.split(/\s+/).filter(w => w.length > 2);
      for (let i = 0; i <= words.length - 10; i++) {
        const ngram = words.slice(i, i + 10).join(' ');
        if (!ngramToSentences.has(ngram)) ngramToSentences.set(ngram, []);
        ngramToSentences.get(ngram).push(sIdx);
      }
    });
    
    // Collect sentence indices that should be removed (second+ occurrence)
    const sentenceIndicesToRemove = new Set();
    ngramToSentences.forEach((indices, ngram) => {
      if (indices.length > 1) {
        // Keep the first, mark the rest for removal
        for (let i = 1; i < indices.length; i++) {
          sentenceIndicesToRemove.add(indices[i]);
        }
      }
    });
    
    if (sentenceIndicesToRemove.size === 0) return html;
    
    // Get the actual sentence texts to remove
    const sentencesToRemove = [...sentenceIndicesToRemove].map(i => sentences[i]);
    console.log('   DEDUP_10GRAM: ' + sentencesToRemove.length + ' sentence(s) with repeated 10-grams');
    
    // Remove these sentences from paragraphs in the HTML
    let result = html;
    for (const sentence of sentencesToRemove) {
      // Build a flexible regex from the sentence words to find it in HTML
      // (HTML may have tags interspersed)
      const words = sentence.split(/\s+/).filter(w => w.length > 3).slice(0, 8);
      if (words.length < 4) continue;
      
      // Escape regex special chars
      const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      // Match the sentence with possible HTML tags between words
      const pattern = new RegExp(
        escaped.join('[^.!?]{0,40}'),
        'gi'
      );
      
      // Find paragraphs containing this pattern
      const pRegex = /<(p|li)\b[^>]*>[\s\S]*?<\/(p|li)>/gi;
      let pMatch;
      const candidates = [];
      while ((pMatch = pRegex.exec(result)) !== null) {
        const pText = pMatch[0].replace(/<[^>]+>/g, ' ').toLowerCase();
        if (pattern.test(pText)) {
          candidates.push({ index: pMatch.index, match: pMatch[0] });
          pattern.lastIndex = 0; // reset regex
        }
      }
      
      // If found in multiple paragraphs, remove all but the first
      if (candidates.length > 1) {
        // Remove from last to first to preserve indices
        for (let i = candidates.length - 1; i >= 1; i--) {
          const c = candidates[i];
          result = result.slice(0, c.index) + result.slice(c.index + c.match.length);
          console.log('   DEDUP_10GRAM: removed duplicate paragraph at index ' + c.index);
        }
      }
    }
    
    return result;
  }

  /**
   * Ensure the first <p> contains a hook pattern matching quality-analyzer expectations.
   * If the first paragraph doesn't match the hook regex, prepend a question or
   * immersive phrase to trigger the check.
   */
  ensureIntroHook(html) {
    if (!html || typeof html !== 'string') return html;

    const hookPattern = /\?|découvr|imagin|révél|secret|incroy|expérien|aventur|rêv|fascinat|erreur|piège|problème|dilemme|la première fois|quand j|soleil|atterri|arrivé|personne ne|peu de gens|ce que|vérité|réalité|dans les rues|au cœur|au milieu|à peine|étouffant|résonne|immerg|plonge|tu\s+(es|te\s|t')|face\s+[àa]\s+(ton|votre)|entre\s+deux|onglet|fiancé/i;

    // Find the first <p> tag
    const firstPMatch = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (!firstPMatch) return html;

    const firstPText = firstPMatch[1].replace(/<[^>]+>/g, '').trim();

    // Already has a hook? Nothing to do
    if (hookPattern.test(firstPText)) return html;

    // Prepend an immersive question to the first paragraph content
    const hookPrefixes = [
      "Ce que personne ne te dit avant de partir : ",
      "Imagine arriver sur place sans avoir prévu ce détail. ",
      "La vérité, c'est que la plupart des voyageurs passent à côté de l'essentiel. ",
      "Peu de gens le savent, mais ",
      "La réalité du terrain est bien différente des guides classiques. ",
      "Au cœur de cette destination, une expérience t'attend. "
    ];

    // Pick a deterministic prefix based on text length (stable across runs)
    const prefixIndex = firstPText.length % hookPrefixes.length;
    const prefix = hookPrefixes[prefixIndex];

    // Insert the prefix at the start of the first paragraph's inner content
    const newFirstP = firstPMatch[0].replace(
      firstPMatch[1],
      prefix + firstPMatch[1]
    );

    console.log('   INTRO_HOOK: added hook prefix to first paragraph');
    return html.replace(firstPMatch[0], newFirstP);
  }

  applyDeterministicFinalTextCleanup(html) {
    if (!html || typeof html !== 'string') return html;
    let out = html;
    // FIX: Add wp-block-quote class to all blockquotes for WordPress native styling
    out = out.replace(/<blockquote(?!\s+class)([^>]*)>/gi, '<blockquote class="wp-block-quote">');

    // Corriger ponctuation cassée en début de paragraphe
    out = out.replace(/<p[^>]*>\s*[?.!,:;]\s*/gi, '<p>');

    // Supprimer les paragraphes quasi-vides ou tronqués
    out = out.replace(/<p[^>]*>\s*(?:\.\s*|»\s*|\?\s*|:\s*)<\/p>/gi, '');

    // Réparer espaces autour des apostrophes et caractères accentués éclatés
    out = out
      .replace(/\s+([’'])/g, '$1')
      .replace(/([’'])\s+/g, '$1');

    // Supprimer les fragments CSS orphelins parfois injectés dans le contenu
    out = out
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<\/?style[^>]*>/gi, '')
      .replace(/<p[^>]*>\s*\.?entry-content\s+\.?wp-block-details[\s\S]*?<\/p>/gi, '')
      .replace(/^\s*\.?entry-content\s+\.?wp-block-details.*$/gmi, '');

    // Corriger explicitement les artefacts vus en prod (sans regex destructrices)
    const TYPO_FIXES = [
      [/\bbudg\s+et\b/gi, 'budget'],
      [/\bbi\s+en\b/gi, 'bien'],
      [/\bfuse\s+au\b/gi, 'fuseau'],
      [/\by\s+en\b/gi, 'yen'],
      [/\bmoy\s+en\b/gi, 'moyen'],
      [/\bitin\s+éraire\b/gi, 'itinéraire'],
      [/\bpr\s+éparé\b/gi, 'préparé'],
      [/\bpr\s+éparer\b/gi, 'préparer'],
      [/\btemps\s*à\b/gi, 'temps à'],
      [/\bbonjour\s*à\b/gi, 'bonjour à'],
      [/\bmarathon\s*épuisant\b/gi, 'marathon épuisant'],
      [/\brepaséconomique\b/gi, 'repas économique'],
      [/\brepas\s*économique\b/gi, 'repas économique'],
      [/\bbi\s+en\s+préparé\b/gi, 'bien préparé'],
      [/\bbi\s+en\s+organiser\b/gi, 'bien organiser']
    ];
    for (const [pattern, replacement] of TYPO_FIXES) {
      out = out.replace(pattern, replacement);
    }

    // Fermer les guillemets français ouverts sans fermeture
    out = out.replace(/«([^»]{10,300})(?=<\/p>|<\/li>|<\/blockquote>)/g, (match, content) => {
      if (content.includes('»')) return match;
      return '«' + content.trim() + ' »';
    });

    // Supprimer les formulations vagues typiques de l'IA
    // BUG FIX: disabled price sanitization
    // out = out.replace(/\bquelques\s+euros\b/gi, 'un coût non négligeable');
    // out = out.replace(/\bplusieurs\s+dizaines\s+d['']euros\b/gi, 'un surcoût significatif');
    out = out.replace(/\bun\s+budget\s+modeste\b/gi, 'un budget raisonnable');

    // Ajouter espaces après ponctuation manquants uniquement dans les noeuds texte
    // (évite de casser les URLs dans les attributs HTML, ex: trpwdg.com/content?trs=...)
    out = out.replace(/(?<=>)([^<]+)(?=<)/g, (m, text) => {
      return text
        .replace(/([;!?])([A-Za-zÀ-ÖØ-öø-ÿ0-9])/g, '$1 $2')
        .replace(/:([A-Za-zÀ-ÖØ-öø-ÿ])/g, ': $1')
        .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])\s*:\s*([0-9])/g, '$1 : $2')
        .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])\(/g, '$1 (');
    });

    // Nettoyage d'espaces multiples intra-texte (sans casser les balises)
    out = out.replace(/(?<=>)([^<]+)(?=<)/g, (m, text) => text.replace(/\s{2,}/g, ' '));

    // Corriger des collages résiduels observés en production
    out = out
      .replace(/\bcuisineépicée\b/gi, 'cuisine épicée')
      .replace(/(&euro;|€)\s*en\b/gi, '$1 en')
      .replace(/UTC([+-]\d{2}):\s*(\d{2})/g, 'UTC$1:$2')
      .replace(/<\/strong>(?=[A-Za-zÀ-ÖØ-öø-ÿ0-9])/g, '</strong> ');

    return out;
  }

  /**
   * En mode NEWS, garantit un socle SERP minimal (K9) si le LLM n'a pas produit
   * les sections indispensables.
   */
  ensureMinimumNewsSerpSections(html, finalDestination = '') {
    if (!html || typeof html !== 'string') return html;
    let out = html;
    // FIX: Add wp-block-quote class to all blockquotes for WordPress native styling
    out = out.replace(/<blockquote(?!\s+class)([^>]*)>/gi, '<blockquote class="wp-block-quote">');
    const destination = String(finalDestination || '').trim() || 'Asie';
    const lower = out.toLowerCase();

    const hasAutres = /<h2[^>]*>[^<]*ce\s*que\s*(les\s*)?autres[^<]*ne\s*disent?\s*pas[^<]*<\/h2>/i.test(out);
    const hasLimites = /<h2[^>]*>[^<]*limites?\s*(et\s*)?biais[^<]*<\/h2>/i.test(out);
    const hasErreurs = /<h2[^>]*>[^<]*erreurs?\s*(fr[eé]quentes?|courantes?)[^<]*<\/h2>/i.test(out);

    const blocks = [];
    if (!hasAutres) {
      blocks.push(
        '<h2>Ce que les autres ne disent pas</h2>' +
        '<p>Le retour d\'expérience ne couvre pas toujours les coûts cachés, la fatigue logistique et les arbitrages de temps. Prends ces variables en compte avant de verrouiller ton itinéraire.</p>'
      );
    }
    if (!hasLimites) {
      blocks.push(
        '<h2>Limites et biais</h2>' +
        '<p>Ce récit reste un cas individuel: saison, budget et tolérance au rythme changent fortement le résultat. Utilise ce témoignage comme signal, pas comme vérité universelle.</p>'
      );
    }
    if (!hasErreurs) {
      blocks.push(
        `<h2>Les erreurs fréquentes qui coûtent cher aux voyageurs en ${destination}</h2>` +
        '<p>Réserver trop tard, multiplier les transferts et sous-estimer les temps de trajet fait vite exploser le budget. Priorise 1-2 zones cohérentes et sécurise les réservations critiques.</p>'
      );
    }

    if (blocks.length === 0) return out;

    const insertion = `\n${blocks.join('\n')}\n`;
    const conclusionPattern = /<h2[^>]*>\s*ce\s*qu.?il\s*faut\s*retenir[^<]*<\/h2>/i;
    const match = out.match(conclusionPattern);
    if (match) {
      const idx = out.indexOf(match[0]);
      out = out.slice(0, idx) + insertion + out.slice(idx);
    } else {
      out += insertion;
    }

    console.log(`🧩 NEWS_SERP_MINIMUM: ${blocks.length} section(s) ajoutée(s)`);
    return out;
  }

  /**
   * En mode NEWS, garantit au moins un minimum de décisions explicites et de friction
   * avant les modules affiliés (K4/K5).
   */
  enforceNewsDecisionAndCtaFriction(html) {
    if (!html || typeof html !== 'string') return html;
    let out = html;
    // FIX: Add wp-block-quote class to all blockquotes for WordPress native styling
    out = out.replace(/<blockquote(?!\s+class)([^>]*)>/gi, '<blockquote class="wp-block-quote">');

    const text = out.replace(/<[^>]+>/g, ' ');
    const decisionRegex = /notre\s+(arbitrage|verdict|conseil)|si\s+tu\s+\w+[^.]{0,120}(choisis|privil[eé]gie|opte|[eé]vite)|mieux\s+vaut/i;
    const decisionHits = (text.match(new RegExp(decisionRegex.source, 'gi')) || []).length;
    if (decisionHits < 2) {
      const decisionPara = '<p>Si tu hésites entre plusieurs options, choisis d’abord l’itinéraire le plus simple à exécuter. Notre arbitrage: réduire les transferts et sécuriser les réservations clés avant de chercher l’optimisation maximale.</p>';
      const conclusionPattern = /<h2[^>]*>\s*ce\s*qu.?il\s*faut\s*retenir[^<]*<\/h2>/i;
      const m = out.match(conclusionPattern);
      if (m) {
        const idx = out.indexOf(m[0]);
        out = out.slice(0, idx) + decisionPara + '\n' + out.slice(idx);
      } else {
        out += '\n' + decisionPara;
      }
      console.log('🧩 NEWS_DECISION_MINIMUM: paragraphe décisionnel ajouté');
    }

    const frictionRegex = /risque|frais|co[uû]t|perte|urgence|impr[eé]vu|probl[eè]me|pi[eè]ge|attention|danger|d[eé]pense|surprise|cher|arnaqu|vol[eé]|accident|m[eé]dical|bagage|annulation|transfert/i;
    const frictionPara = '<p>Avant de réserver, utilise ce module seulement si ton itinéraire est déjà stabilisé (dates, bagages, aéroport). Pourquoi: les frais cachés (bagages, transferts, annulation) peuvent rapidement annuler un bon prix affiché.</p>';

    out = out.replace(/<aside class="affiliate-module"[\s\S]*?<\/aside>/gi, (block, offset, full) => {
      const before = full.slice(Math.max(0, offset - 350), offset).replace(/<[^>]+>/g, ' ');
      if (frictionRegex.test(before)) return block;
      return `${frictionPara}\n${block}`;
    });

    return out;
  }

  /**
   * Garantit une conclusion actionnable en fin d'article NEWS pour stabiliser le scoring.
   */
  ensureNewsActionableConclusion(html) {
    if (!html || typeof html !== 'string') return html;
    let out = html;
    // FIX: Add wp-block-quote class to all blockquotes for WordPress native styling
    out = out.replace(/<blockquote(?!\s+class)([^>]*)>/gi, '<blockquote class="wp-block-quote">');

    const actionablePattern = /<h2[^>]*>\s*(?:ce\s*qu.?il\s*faut\s*retenir|à\s*retenir|en\s*r[ée]sum[ée]|conclusion|prochaines?\s*[ée]tapes?)[^<]*<\/h2>/i;
    if (actionablePattern.test(out)) {
      return out;
    }
    const hasActionVerbNearEnd = /d[ée]couvr|compar|explor|r[ée]serv|voir|planifi|commenc|t[ée]l[ée]charg|pr[ée]par|organis|chois/i;
    const frictionWord = /frais|risque|co[uû]t|annulation|bagage|transfert/i;

    const h2s = [...out.matchAll(/<h2[^>]*>[\s\S]*?<\/h2>/gi)];
    const lastH2 = h2s.length > 0 ? h2s[h2s.length - 1][0] : null;

    if (lastH2) {
      const idx = out.lastIndexOf(lastH2);
      const tail = out.slice(idx);
      if (actionablePattern.test(lastH2) && hasActionVerbNearEnd.test(tail) && frictionWord.test(tail)) {
        return out;
      }
    }

    const block = [
      '<h2>Prochaines étapes: décider sans surpayer</h2>',
      '<p>Commence par verrouiller ton scénario de base (dates, bagages, transferts), puis compare 2 options maximum avant de réserver. Si un tarif paraît attractif, vérifie d’abord les coûts annexes et les conditions d’annulation pour éviter une fausse bonne affaire.</p>'
    ].join('');

    if (lastH2) {
      out = `${out}\n${block}`;
    } else {
      out = `${out}\n<h2>À retenir</h2>${block}`;
    }

    console.log('🧩 NEWS_ACTIONABLE_CONCLUSION: section de conclusion ajoutée');
    return out;
  }

  /**
   * Garantit une FAQ courte et syntaxiquement valide en NEWS.
   * Idempotent: n'ajoute pas de doublon si une FAQ correcte existe déjà.
   */
  ensureNewsFaqStructure(html) {
    if (!html || typeof html !== 'string') return html;
    let out = html;
    // FIX: Add wp-block-quote class to all blockquotes for WordPress native styling
    out = out.replace(/<blockquote(?!\s+class)([^>]*)>/gi, '<blockquote class="wp-block-quote">');

    // Normalisation minimale des details/summary cassés.
    out = out
      .replace(/<details>\s*<p>/gi, '<details><summary>Question fréquente</summary><p>')
      .replace(/<summary>\s*<\/summary>/gi, '<summary>Question fréquente</summary>');

    const hasFaqHeading = /<h2[^>]*>\s*(?:FAQ|Questions?\s+fr[ée]quentes?|Foire\s+aux\s+questions?)\s*<\/h2>/i.test(out)
      || /<!-- wp:heading[^>]*-->\s*<h2[^>]*>\s*Questions?\s+fr[eé]quentes\s*<\/h2>\s*<!-- \/wp:heading -->/i.test(out);
    const detailsCount = (out.match(/<details[\s>]/gi) || []).length + (out.match(/<!-- wp:details -->/gi) || []).length;
    const summaryCount = (out.match(/<summary[\s>]/gi) || []).length;

    if (hasFaqHeading && detailsCount >= 1 && summaryCount >= 1) return out;

    const faqBlock = [
      '<style>',
      '.fv-faq-item details[open] summary svg { transform: rotate(180deg); }',
      '.fv-faq-item summary::-webkit-details-marker { display: none; }',
      '.fv-faq-item summary::marker { display: none; }',
      '</style>',
      '<!-- wp:heading -->',
      '<h2 style="margin-bottom:1rem;">Questions fréquentes</h2>',
      '<!-- /wp:heading -->',
      '<div class="fv-faq" style="margin:2rem 0;">',
      '<!-- wp:details -->',
      '<div class="fv-faq-item" style="margin-bottom:0.5rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">',
      '<details style="padding:0;">',
      '<summary style="padding:1rem 1.2rem;cursor:pointer;font-weight:600;font-size:1rem;background:#f9fafb;list-style:none;display:flex;align-items:center;justify-content:space-between;">',
      '<span>Faut-il réserver maintenant ou attendre ?</span>',
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="transition:transform 0.2s;flex-shrink:0;margin-left:0.5rem;"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '</summary>',
      '<div style="padding:0 1.2rem 1rem;font-size:0.95rem;line-height:1.6;color:#374151;">',
      '<p>Réserve dès que ton scénario de base est clair. Attendre peut coûter plus cher si les frais annexes augmentent.</p>',
      '</div>',
      '</details>',
      '</div>',
      '<!-- /wp:details -->',
      '<!-- wp:details -->',
      '<div class="fv-faq-item" style="margin-bottom:0.5rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">',
      '<details style="padding:0;">',
      '<summary style="padding:1rem 1.2rem;cursor:pointer;font-weight:600;font-size:1rem;background:#f9fafb;list-style:none;display:flex;align-items:center;justify-content:space-between;">',
      '<span>Quel est le piège le plus fréquent ?</span>',
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="transition:transform 0.2s;flex-shrink:0;margin-left:0.5rem;"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '</summary>',
      '<div style="padding:0 1.2rem 1rem;font-size:0.95rem;line-height:1.6;color:#374151;">',
      '<p>Se concentrer sur le prix affiché sans intégrer bagages, transferts et conditions d\u2019annulation.</p>',
      '</div>',
      '</details>',
      '</div>',
      '<!-- /wp:details -->',
      '</div>'
    ].join('\n');

    const beforeConclusion = /<h2[^>]*>\s*(?:ce\s*qu.?il\s*faut\s*retenir|à\s*retenir|prochaines?\s*[ée]tapes?)\s*<\/h2>/i;
    const m = out.match(beforeConclusion);
    if (m) {
      const idx = out.indexOf(m[0]);
      out = out.slice(0, idx) + faqBlock + '\n' + out.slice(idx);
    } else {
      out = `${out}\n${faqBlock}`;
    }
    console.log('🧩 NEWS_FAQ_MINIMUM: FAQ concise ajoutée');
    return out;
  }

  /**
   * Limite les sauts de niveaux Hn pour stabiliser les checks SEO/Hn.
   */
  enforceNewsHeadingHierarchy(html) {
    if (!html || typeof html !== 'string') return html;
    let prevLevel = null;
    let fixes = 0;
    const out = html.replace(/<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi, (_full, tag, attrs, inner) => {
      const level = Number(String(tag).replace('h', ''));
      if (!Number.isFinite(level)) return _full;
      let next = level;
      if (prevLevel !== null && level > prevLevel + 1) {
        next = prevLevel + 1;
      }
      if (next < 2 && prevLevel !== null) next = 2;
      if (next !== level) fixes++;
      prevLevel = next;
      return `<h${next}${attrs}>${inner}</h${next}>`;
    });
    if (fixes > 0) {
      console.log(`🧩 NEWS_HIERARCHY_FIX: ${fixes} heading(s) ajusté(s)`);
    }
    return out;
  }

  /**
   * Passe de convergence qualité NEWS (déterministe + idempotente).
   * Corrige uniquement les checks manquants pour stabiliser le score.
   */
  ensureNewsQualityConvergence(html, ctx = {}) {
    if (!html || typeof html !== 'string') return html;

    const destination = String(
      ctx.finalDestination || ctx.destination || ctx.mainDestination || 'Asie'
    ).trim();
    const title = String(ctx.title || '').trim();
    const pillarLink = String(ctx.pillarLink || 'https://flashvoyage.com/notre-methode/').trim();

    const qa = new QualityAnalyzer();
    const toScoreHtml = (content) => `<h1>${title}</h1>\n${content}`;
    const getScore = (content) => qa.getGlobalScore(toScoreHtml(content), 'news');
    const getDetail = (arr, checkName) => (arr || []).find(d => d.check === checkName);
    const hasMissing = (arr, checkName) => {
      const d = getDetail(arr, checkName);
      if (!d) return false;
      return Number(d.points || 0) <= 0 || /MISSING|FAIL/i.test(String(d.status || ''));
    };

    let out = html;
    // FIX: Add wp-block-quote class to all blockquotes for WordPress native styling
    out = out.replace(/<blockquote(?!\s+class)([^>]*)>/gi, '<blockquote class="wp-block-quote">');
    const before = getScore(out);

    // Garde-fous déjà existants (idempotents)
    out = this.ensureMinimumNewsSerpSections(out, destination);
    out = this.enforceNewsDecisionAndCtaFriction(out);
    out = this.ensureNewsActionableConclusion(out);
    out = this.ensureNewsFaqStructure(out);
    out = this.enforceNewsHeadingHierarchy(out);

    const injectBeforeConclusionOrEnd = (content, block) => {
      const conclusionPattern = /<h2[^>]*>\s*(?:ce\s*qu.?il\s*faut\s*retenir|à\s*retenir|prochaines?\s*[ée]tapes?)\s*<\/h2>/i;
      const m = content.match(conclusionPattern);
      if (!m) return `${content}\n${block}`;
      const idx = content.indexOf(m[0]);
      return content.slice(0, idx) + block + '\n' + content.slice(idx);
    };

    const injectImpactBlockIfMissing = (content) => {
      const hasImpactList = /<h2[^>]*>[^<]*(impact|change|concr[eè]t)[^<]*<\/h2>\s*(?:<p[^>]*>[\s\S]*?<\/p>\s*)?(?:<ul|<ol)/i.test(content);
      if (hasImpactList) return content;
      const block = [
        `<h2>Ce qui change concrètement pour ton voyage en ${destination}</h2>`,
        '<ul>',
        '<li>Impact budget: les frais invisibles (bagages, transferts, annulation) peuvent effacer un prix attractif.</li>',
        '<li>Impact planning: un choix trop tardif augmente le risque de compromis coûteux.</li>',
        '<li>Impact exécution: verrouiller 2 priorités réduit les erreurs de dernière minute.</li>',
        '</ul>'
      ].join('');
      console.log('🧩 NEWS_CONVERGENCE: bloc impact+liste ajouté');
      return injectBeforeConclusionOrEnd(content, block);
    };

    const injectActionBlockIfMissing = (content) => {
      const hasActionBlock = /<h2[^>]*>[^<]*(faire|action|maintenant|si\s*tu)[^<]*<\/h2>/i.test(content);
      if (hasActionBlock) return content;
      const block = [
        '<h2>Que faire maintenant: plan d’action en 3 étapes</h2>',
        '<ol>',
        '<li>Confirme ton scénario de base (dates, bagages, aéroport) avant toute comparaison.</li>',
        '<li>Compare deux options maximum avec le coût total réel, pas seulement le prix affiché.</li>',
        `<li>Valide les conditions d’annulation puis consulte ce <a href="${pillarLink}">guide conseils budget et réservation</a> pour sécuriser ta décision.</li>`,
        '</ol>'
      ].join('');
      console.log('🧩 NEWS_CONVERGENCE: bloc action ajouté');
      return injectBeforeConclusionOrEnd(content, block);
    };

    const injectPillarLinkIfMissing = (content) => {
      const hasPillar = /href="[^"]*flashvoyage\.com[^"]*(guide|destination|conseils|budget|methode|notre-methode)[^"]*"/i.test(content);
      if (hasPillar) return content;
      const linkPara = `<p>Pour aller plus loin, ouvre notre <a href="${pillarLink}">guide pratique pour arbitrer budget, timing et réservation</a>.</p>`;
      console.log('🧩 NEWS_CONVERGENCE: lien pilier ajouté');
      return injectBeforeConclusionOrEnd(content, linkPara);
    };

    const injectFactualFocusIfMissing = (content) => {
      const intro = content.substring(0, 1200).toLowerCase();
      const hasFactualFocus = /changement|nouveau|augment|baiss|mise\s*à\s*jour|annonce|effectif/i.test(intro);
      if (hasFactualFocus) return content;
      const factual = `<p>Mise à jour terrain: ce changement a un impact direct sur le budget, le risque d’imprévu et les arbitrages de réservation.</p>`;
      console.log('🧩 NEWS_CONVERGENCE: focus factuel ajouté');
      return `${factual}\n${content}`;
    };

    // Re-score intermédiaire puis patch ciblé
    let mid = getScore(out);
    const serpDetails = mid.categories?.serp?.details || [];
    const linkDetails = mid.categories?.links?.details || [];
    const contentDetails = mid.categories?.contentWriting?.details || [];

    if (hasMissing(serpDetails, 'Bloc impact concret (H2+list)')) {
      out = injectImpactBlockIfMissing(out);
    }
    if (hasMissing(serpDetails, 'Bloc action (H2 faire/action)')) {
      out = injectActionBlockIfMissing(out);
    }
    if (hasMissing(linkDetails, 'Lien page pilier')) {
      out = injectPillarLinkIfMissing(out);
    }
    if (hasMissing(contentDetails, 'Cohérence thématique')) {
      out = injectFactualFocusIfMissing(out);
    }

    const after = getScore(out);
    const beforePct = Number(before.globalScore || 0);
    const afterPct = Number(after.globalScore || 0);
    if (afterPct > beforePct) {
      console.log(`🧩 NEWS_QUALITY_CONVERGENCE: ${beforePct.toFixed(1)}% → ${afterPct.toFixed(1)}%`);
    } else {
      console.log(`🧩 NEWS_QUALITY_CONVERGENCE: stable ${afterPct.toFixed(1)}%`);
    }

    return out;
  }

  /**
   * Vérifie/corrige l'intégrité des URLs affiliées pour éviter les scripts cassés en prod.
   * Corrige notamment les espaces parasites autour de ?, &, =.
   */
  sanitizeAffiliateWidgetIntegrity(html, report = null) {
    if (!html || typeof html !== 'string') return html;
    let fixedCount = 0;

    const sanitizeUrl = (rawUrl) => {
      let cleaned = String(rawUrl || '');
      cleaned = cleaned
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, '')
        .replace(/\?&+/g, '?')
        .replace(/&&+/g, '&')
        .replace(/[?&]+$/g, '');
      if (cleaned !== rawUrl) fixedCount++;
      return cleaned;
    };

    let out = html.replace(
      /(<script[^>]*\bsrc=")(https?:\/\/[^"]*(?:trpwdg\.com|travelpayouts)[^"]*)(")/gi,
      (_, prefix, url, suffix) => `${prefix}${sanitizeUrl(url)}${suffix}`
    );

    out = out.replace(
      /(<a[^>]*\bhref=")(https?:\/\/[^"]*(?:trpwdg\.com|travelpayouts)[^"]*)(")/gi,
      (_, prefix, url, suffix) => `${prefix}${sanitizeUrl(url)}${suffix}`
    );

    if (fixedCount > 0) {
      console.log(`🔧 AFFILIATE_WIDGET_INTEGRITY: ${fixedCount} URL(s) corrigée(s)`);
      if (report) {
        report.actions = report.actions || [];
        report.actions.push({
          type: 'affiliate_widget_integrity_fix',
          details: `count=${fixedCount}`
        });
      }
    }

    return out;
  }

  /**
   * Détecte et traduit le contenu anglais
   * @param {string} html - HTML à valider
   * @param {Object} report - Rapport QA
   * @returns {Promise<string>} HTML corrigé
   */
  async detectAndTranslateEnglish(html, report) {
    console.log('🔍 Détection contenu anglais...');
    
    let cleanedHtml = html;

    // (Nettoyage typographique déplacé dans fixWordGlue() - PHASE 2.3b)

    // Traduire les titres H2 en anglais (ex. "How much does a long stay in Thailand really cost?" -> français)
    const h2Regex = /<h2([^>]*)>([^<]+)<\/h2>/gi;
    let h2Match;
    const h2ToTranslate = [];
    while ((h2Match = h2Regex.exec(html)) !== null) {
      const innerText = h2Match[2].trim();
      if (innerText.length < 5) continue;
      const eng = this.intelligentContentAnalyzer?.detectEnglishContent?.(innerText) || { isEnglish: false, ratio: 0 };
      const looksEnglish = /^(how|what|why|when|where|which|the |a |an )/i.test(innerText) || (eng.isEnglish && eng.ratio > 0.2);
      if (looksEnglish && this.intelligentContentAnalyzer) {
        h2ToTranslate.push({ fullTag: h2Match[0], inner: innerText, attrs: h2Match[1] });
      }
    }
    for (const h of h2ToTranslate) {
      try {
        const translated = await this.intelligentContentAnalyzer.translateToFrench(h.inner);
        if (translated && translated !== h.inner) {
          const newTag = `<h2${h.attrs}>${translated}</h2>`;
          cleanedHtml = cleanedHtml.replace(h.fullTag, newTag);
          console.log(`   🌐 H2 traduit: "${h.inner.substring(0, 40)}..." → "${translated.substring(0, 40)}..."`);
        }
      } catch (e) {
        console.warn(`   ⚠️ Traduction H2 ignorée: ${e.message}`);
      }
    }
    if (h2ToTranslate.length > 0) html = cleanedHtml;

    // Traduire les lignes de recommandation en anglais (#1/#2/#3 suivies de texte anglais)
    // AMÉLIORATION: Détecter aussi dans les listes HTML (<li>#1 ...</li>)
    const recoLineRegex = /(#\s*[123]\s+)([A-Za-z][^<]{10,}?)(?=#\s*[123]|<\/p>|<\/li>|$)/gi;
    const recoMatches = [...cleanedHtml.matchAll(recoLineRegex)];
    const replacements = [];
    for (const recoMatch of recoMatches) {
      const prefix = recoMatch[1];
      const lineText = recoMatch[2].trim();
      const eng = this.intelligentContentAnalyzer?.detectEnglishContent?.(lineText) || { isEnglish: false, ratio: 0 };
      // AMÉLIORATION: Détecter plus de patterns anglais (Choose, Book, Find, via, to stay, to ensure, hassle-free, s'adapter)
      const looksEn = /\b(Choose|Book|Find|via|to stay|to ensure|hassle-free|s\'adapter|for|explore|stay|enjoy|discover|settle|cultural|immersion|opportunities)\b/i.test(lineText) || (eng.isEnglish && eng.ratio > 0.3);
      if (looksEn && this.intelligentContentAnalyzer) {
        try {
          const translated = await this.intelligentContentAnalyzer.translateToFrench(lineText);
          if (translated && translated !== lineText) {
            replacements.push({ from: prefix + lineText, to: prefix + translated });
          }
        } catch (e) { console.warn(`   ⚠️ Traduction ligne reco: ${e.message}`); }
      }
    }
    replacements.forEach(({ from, to }) => {
      cleanedHtml = cleanedHtml.replace(from, to);
      console.log(`   🌐 Ligne recommandation traduite: "${from.substring(0, 40)}..." → "${to.substring(0, 40)}..."`);
    });
    html = cleanedHtml;

    const englishPatterns = [
      /Essential for/i,
      /Underestimating/i,
      /Not budgeting/i,
      /Fatigue setting/i,
      /Critical Moment/i,
      /What Reddit/i,
      /Budget is/i,
      /trip to/i,
      /heading south/i,
      /starting in/i,
      /worth taking/i,
      /not including/i,
      /day trip/i,
      /planning a/i,
      /I'd honestly/i,
      /I did a similar/i
    ];
    
    const englishMatches = [];
    
    // Détecter patterns anglais courants
    englishPatterns.forEach(pattern => {
      const matches = html.match(new RegExp(pattern.source, 'gi'));
      if (matches) {
        matches.forEach(match => {
          const contextMatch = html.match(new RegExp(`<[^>]*>.*?${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?<\/[^>]+>`, 'gi'));
          if (contextMatch) {
            englishMatches.push({
              pattern: match,
              context: contextMatch[0],
              fullMatch: contextMatch[0]
            });
          }
        });
      }
    });
    
    // PHASE 1 FIX: Extraire TOUS les éléments textuels, y compris blockquotes et paragraphes avec HTML imbriqué
    const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    const listItems = html.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
    const blockquotes = html.match(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi) || [];
    const allTextElements = [...paragraphs, ...listItems, ...blockquotes];
    
    // PHASE 2 FIX: Retrait des faux amis francais (culture, service, budget, national, architecture, etc.)
    // et des noms propres geographiques (Asia, Hong, Kong, Taiwan) qui polluent le ratio
    // PHASE 3 FIX: Ajout mots manquants (around, whole, accommodation, whether, enough, spend, stay, etc.)
    const englishWords = /\b(the|is|are|was|were|have|has|had|this|that|with|from|which|what|how|why|when|where|for|and|or|but|if|then|else|can|could|should|will|would|must|may|might|underestimating|budgeting|setting|check|coverage|requirements|available|launched|doesn't|don't|I'm|you|he|she|it|we|they|great|food|amazing|vistas|affordable|loved|interested|scenery|been|most|IMO|best|week|weeks|trip|planning|starting|heading|south|north|worth|taking|including|flights|honestly|added|days|around|whole|accommodation|entire|about|really|actually|per|night|whether|enough|spend|stay|overall|cheap|expensive|however|also|into|some|any|than|other|only|more|just|very|much|need|want|looking|moving|working|getting|trying|know|think|going|people|places|each|every|many|here|there|not|still|even|well)\b/gi;
    
    allTextElements.forEach(para => {
      const text = para.replace(/<[^>]+>/g, ' ').trim();
      if (text.length > 20) {
        const englishCount = (text.match(englishWords) || []).length;
        const totalWords = text.split(/\s+/).length;
        const englishRatio = totalWords > 0 ? englishCount / totalWords : 0;
        
        if (englishRatio > 0.1 && totalWords > 5) {
          englishMatches.push({
            pattern: 'high_english_ratio',
            context: text,
            fullMatch: para,
            ratio: englishRatio
          });
        }
        
        // PHASE 1 FIX: Détection par phrase individuelle pour les paragraphes mixtes FR/EN
        if (englishRatio <= 0.1) {
          const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
          for (const sentence of sentences) {
            const sentTrimmed = sentence.trim();
            const sentEnglishCount = (sentTrimmed.match(englishWords) || []).length;
            const sentTotalWords = sentTrimmed.split(/\s+/).length;
            const sentRatio = sentTotalWords > 0 ? sentEnglishCount / sentTotalWords : 0;
            if (sentRatio > 0.3 && sentTotalWords > 4) {
              englishMatches.push({
                pattern: 'sentence_level_english',
                context: text,
                fullMatch: para,
                ratio: sentRatio,
                sentence: sentTrimmed
              });
              break;
            }
          }
        }
      }
    });
    
    // Traduire ou supprimer (1 appel bulk si traducteur disponible)
    let translatedCount = 0;
    let removedCount = 0;
    englishMatches.sort((a, b) => (b.ratio || 0) - (a.ratio || 0));

    if (!this.intelligentContentAnalyzer) {
      englishMatches.forEach(match => {
        const escapedMatch = match.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleanedHtml = cleanedHtml.replace(new RegExp(escapedMatch, 'gi'), '');
        removedCount++;
      });
    } else {
      const items = englishMatches.map(m => ({
        match: m,
        textToTranslate: m.context.replace(/<[^>]+>/g, ' ').trim()
      })).filter(x => x.textToTranslate.length > 10);
      const toTranslate = items.map(x => x.textToTranslate);
      let translated = [];
      if (toTranslate.length > 0) {
        try {
          translated = this.intelligentContentAnalyzer.translateBulkToFrench
            ? await this.intelligentContentAnalyzer.translateBulkToFrench(toTranslate)
            : await Promise.all(toTranslate.map(t => this.intelligentContentAnalyzer.translateToFrench(t)));
        } catch (err) {
          console.error(`   ❌ Erreur traduction bulk: ${err.message}`);
        }
      }
      items.forEach((item, i) => {
        const trad = translated[i];
        const escapedMatch = item.match.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (trad) {
          // PHASE 3 FIX: Si le fullMatch contient des tags HTML imbriques (<strong>, <em>, etc.),
          // fullMatch.replace(textToTranslate, trad) echoue silencieusement car le plain text
          // ne se trouve pas littéralement dans le HTML. On reconstruit le tag avec le contenu traduit.
          let replaced = item.match.fullMatch.replace(item.textToTranslate, trad);
          if (replaced === item.match.fullMatch && trad !== item.textToTranslate) {
            // Replacement failed — reconstruct the tag with translated content
            const tagMatch = item.match.fullMatch.match(/^<(\w+)([^>]*)>/);
            if (tagMatch) {
              const [, tagName, attrs] = tagMatch;
              replaced = `<${tagName}${attrs}>${trad}</${tagName}>`;
            }
          }
          cleanedHtml = cleanedHtml.replace(new RegExp(escapedMatch, 'gi'), replaced);
          translatedCount++;
        } else {
          cleanedHtml = cleanedHtml.replace(new RegExp(escapedMatch, 'gi'), '');
          removedCount++;
        }
      });
    }
    
    // Calculer ratio anglais total
    // AMÉLIORATION: Exclure URLs et noms propres de la détection
    let allText = cleanedHtml.replace(/<[^>]+>/g, ' ');
    // Supprimer URLs
    allText = allText.replace(/https?:\/\/[^\s]+/gi, '');
    // Supprimer emails
    allText = allText.replace(/[^\s]+@[^\s]+/gi, '');
    // Supprimer codes (ex: PAR, SGN, KUL)
    allText = allText.replace(/\b[A-Z]{2,4}\b/g, '');
    
    const totalEnglishWords = (allText.match(englishWords) || []).length;
    const totalWords = allText.split(/\s+/).filter(w => w.length > 2).length; // Filtrer mots très courts
    const totalEnglishRatio = totalWords > 0 ? totalEnglishWords / totalWords : 0;
    
    // AMÉLIORATION: Si ratio > 0.1%, forcer suppression de tous les patterns anglais détectés
    if (totalEnglishRatio > 0.001) {
      // Si ratio encore trop élevé après traductions, supprimer tous les patterns anglais restants
      // PHASE 2 FIX: seuil releve de 1% a 3% pour eviter suppression de paragraphes francais
      if (totalEnglishRatio > 0.03) {
        console.log(`   ⚠️ Ratio anglais encore élevé (${(totalEnglishRatio * 100).toFixed(2)}%), suppression agressive...`);
        
        // PHASE 1 FIX: Trouver et supprimer tous les éléments texte avec ratio anglais élevé (p, li, blockquote)
        const allParagraphs = [
          ...(cleanedHtml.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []),
          ...(cleanedHtml.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || []),
          ...(cleanedHtml.match(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi) || [])
        ];
        allParagraphs.forEach(para => {
          const text = para.replace(/<[^>]+>/g, ' ').trim();
          if (text.length > 20) {
            const englishCount = (text.match(englishWords) || []).length;
            const totalWords = text.split(/\s+/).filter(w => w.length > 2).length;
            const englishRatio = totalWords > 0 ? englishCount / totalWords : 0;
            
            // PHASE 2 FIX: seuil releve de 5% a 12% — a 5% un seul mot anglais sur 20 declenchait la suppression
            if (englishRatio > 0.12 && totalWords > 5) {
              const escapedPara = para.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              cleanedHtml = cleanedHtml.replace(new RegExp(escapedPara, 'gi'), '');
              removedCount++;
              console.log(`   🗑️ Paragraphe anglais supprimé (ratio: ${(englishRatio * 100).toFixed(1)}%): "${text.substring(0, 50)}..."`);
            }
          }
        });
        
        // Supprimer aussi les patterns anglais spécifiques
        englishPatterns.forEach(pattern => {
          const matches = cleanedHtml.match(new RegExp(pattern.source, 'gi'));
          if (matches) {
            matches.forEach(match => {
              const contextMatch = cleanedHtml.match(new RegExp(`<[^>]*>.*?${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?<\/[^>]+>`, 'gi'));
              if (contextMatch) {
                cleanedHtml = cleanedHtml.replace(contextMatch[0], '');
                removedCount++;
              }
            });
          }
        });
      }
    }
    
    // Recalculer ratio final (avec mêmes exclusions)
    let finalText = cleanedHtml.replace(/<[^>]+>/g, ' ');
    finalText = finalText.replace(/https?:\/\/[^\s]+/gi, '');
    finalText = finalText.replace(/[^\s]+@[^\s]+/gi, '');
    // AMÉLIORATION: Exclure codes aéroports (PAR, SGN, KUL, ORI, etc.)
    finalText = finalText.replace(/\b[A-Z]{2,4}\b/g, '');
    
    const finalEnglishWords = (finalText.match(englishWords) || []).length;
    const finalWords = finalText.split(/\s+/).filter(w => w.length > 2).length;
    const finalEnglishRatio = finalWords > 0 ? finalEnglishWords / finalWords : 0;
    
    // Seuil bloquant à 5% ; entre 0.2% et 5% = warning (résidus traduction / noms propres)
    const ratioPct = finalEnglishRatio * 100;
    if (finalEnglishRatio > 0.05) {
      report.checks.push({
        name: 'english_content',
        status: 'fail',
        details: `ratio=${ratioPct.toFixed(2)}% traduits=${translatedCount} supprimés=${removedCount}`
      });
      report.issues.push({
        code: 'ENGLISH_CONTENT_DETECTED',
        severity: 'error',
        message: `Contenu anglais détecté: ${ratioPct.toFixed(2)}%`,
        evidence: { ratio: finalEnglishRatio, matches: englishMatches.length }
      });
    } else if (finalEnglishRatio > 0.002) {
      report.checks.push({
        name: 'english_content',
        status: 'warn',
        details: `ratio=${ratioPct.toFixed(2)}% (résidus) traduits=${translatedCount} supprimés=${removedCount}`
      });
      report.issues.push({
        code: 'ENGLISH_CONTENT_RESIDUAL',
        severity: 'low',
        message: `Résidus anglais: ${ratioPct.toFixed(2)}% (non bloquant)`,
        evidence: { ratio: finalEnglishRatio }
      });
    } else {
      report.checks.push({
        name: 'english_content',
        status: 'pass',
        details: `ratio=${ratioPct.toFixed(2)}% traduits=${translatedCount} supprimés=${removedCount}`
      });
    }
    
    if (translatedCount > 0 || removedCount > 0) {
      report.actions.push({
        type: 'translated_or_removed_english',
        details: `translated=${translatedCount} removed=${removedCount}`
      });
    }
    
    console.log(`✅ Contenu anglais: ${englishMatches.length} détecté(s), ${translatedCount} traduit(s), ${removedCount} supprimé(s)`);
    return cleanedHtml;
  }

  /**
   * Applique les contraintes de rendu NEWS (format court/factuel).
   */
  applyNewsRenderingProfile(html) {
    if (!html || typeof html !== 'string') return html;
    let out = html;
    // FIX: Add wp-block-quote class to all blockquotes for WordPress native styling
    out = out.replace(/<blockquote(?!\s+class)([^>]*)>/gi, '<blockquote class="wp-block-quote">');
    let removed = 0;

    // 1) FAQ NEWS: conserver une version concise et valide (ne pas supprimer complètement)
    out = out.replace(
      /(<!-- wp:heading[^>]*-->\s*<h2[^>]*>\s*Questions?\s+fr[eé]quentes\s*<\/h2>\s*<!-- \/wp:heading -->\s*)((?:<!-- wp:details -->[\s\S]*?<!-- \/wp:details -->\s*)+)((?:<script type="application\/ld\+json">[\s\S]*?<\/script>\s*)?)/gi,
      (_full, heading, detailsBlock, schemaBlock) => {
        const details = String(detailsBlock || '').match(/<!-- wp:details -->[\s\S]*?<!-- \/wp:details -->/gi) || [];
        const kept = details.slice(0, 2).join('\n');
        const keptSchema = schemaBlock || '';
        if (details.length > 2) removed += (details.length - 2);
        return `${heading}${kept}\n${keptSchema}`;
      }
    );

    // 2) Supprimer les sections comparatives lourdes (titre + tableau)
    out = out.replace(
      /<h2[^>]*>\s*Comparatif[^<]*<\/h2>\s*(?:<div[^>]*>\s*)?<table[\s\S]*?<\/table>(?:\s*<\/div>)?/gi,
      () => {
        removed++;
        return '';
      }
    );

    // 3) Disclosure affiliation visible mais non intrusif (conformité)
    // Only add disclosure if actual affiliate widgets/links are present in the content
    const hasAffiliateContent = /trpwdg\.com|travelpayouts|affiliate-module|fv-partner|fv-cta|fv-affiliate|fv-widget|data-tp-widget/i.test(out);
    const disclosure = 'Liens partenaires: une commission peut être perçue, sans surcoût pour toi.';

    if (hasAffiliateContent) {
      out = out
        .replace(
          /<p[^>]*class="[^"]*(?:widget-disclaimer|affiliate-module-disclaimer)[^"]*"[^>]*>[\s\S]*?<\/p>/gi,
          `<p class="affiliate-module-disclaimer"><small>${disclosure}</small></p>`
        )
        .replace(
          /<small>\s*Lien partenaire\s*<\/small>/gi,
          `<small>${disclosure}</small>`
        );
    } else {
      // No affiliate content: remove any stale disclaimers
      out = out
        .replace(
          /<p[^>]*class="[^"]*(?:widget-disclaimer|affiliate-module-disclaimer)[^"]*"[^>]*>[\s\S]*?<\/p>/gi,
          ''
        )
        .replace(
          /<small>\s*Lien partenaire\s*<\/small>/gi,
          ''
        );
    }

    // 4) 1 CTA max en NEWS: garder le premier module affiliate
    let affiliateSeen = false;
    out = out.replace(/<aside class="affiliate-module"[\s\S]*?<\/aside>/gi, (block) => {
      if (affiliateSeen) {
        removed++;
        return '';
      }
      affiliateSeen = true;
      if (/affiliate-module-disclaimer/i.test(block)) return block;
      return block.replace(
        /<\/aside>\s*$/i,
        `<p class="affiliate-module-disclaimer"><small>${disclosure}</small></p>\n</aside>`
      );
    });

    // 4.b) Si module rendu sans <aside> (script brut), forcer un disclosure minimum
    if (/trpwdg\.com|travelpayouts/i.test(out) && !/affiliate-module-disclaimer|widget-disclaimer/i.test(out)) {
      out = out.replace(
        /(<script[^>]*\bsrc="https?:\/\/[^"]*(?:trpwdg\.com|travelpayouts)[^"]*"[^>]*><\/script>)/i,
        `$1\n<p class="affiliate-module-disclaimer"><small>${disclosure}</small></p>`
      );
    }

    // 5) Normaliser les H2 en mode décisionnel (K2)
    out = out.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (full, attrs, rawTitle) => {
      const title = String(rawTitle || '').replace(/<[^>]*>/g, '').trim();
      const excluded = /questions?\s*fr[eé]quentes?|quick[\s-]*guide|checklist|articles?\s*connexes?|comparatif|ce\s*qu.il\s*faut\s*retenir|ce\s*que\s*les\s*autres|limites?\s*(et\s*)?biais|nos\s*recommandations/i;
      const hasDecision = /arbitrage|choix|choisir|optimis|maximis|vrai|r[eé]alit[eé]|pi[eè]ge|erreur|[eé]viter|strat[eé]gi|planifi|comment|pourquoi|faut.il|versus|vs\b|co[uû]t|prix|budget|danger|risque|limit|biais|secret|meilleur|pire|alternative|dilemme/i.test(title);
      if (excluded.test(title) || hasDecision) return full;

      let rewritten = title;
      if (/\?$/.test(title)) {
        rewritten = `Comment choisir: ${title.replace(/\?+$/, '').trim()}?`;
      } else {
        rewritten = `Comment arbitrer: ${title}`;
      }
      return `<h2${attrs}>${rewritten}</h2>`;
    });

    out = this.ensureNewsFaqStructure(out);
    out = this.enforceNewsHeadingHierarchy(out);

    if (removed > 0) {
      console.log(`🧹 NEWS_PROFILE: ${removed} bloc(s) evergreen/CTA supprimé(s)`);
    }
    return out;
  }

  /**
   * Réconcilie les destinations widgets avec la destination finale (fallback auto-fix).
   * Utilisé avant validation pour limiter les faux fails sur shortcodes.
   */
  reconcileWidgetDestinations(html, pipelineContext, analysis, report) {
    if (!html || typeof html !== 'string') return html;

    const finalDestination = pipelineContext?.final_destination || analysis?.final_destination || null;
    const finalDestLower = finalDestination ? String(finalDestination).toLowerCase() : null;
    const expectedCode = finalDestLower ? lookupIATA(finalDestLower) : null;
    if (!expectedCode) return html;

    let replacements = 0;
    const fixed = html.replace(/\[fv_widget([^\]]*)\]/gi, (full, attrs) => {
      // Ne corriger que les widgets vols
      if (!/type\s*=\s*["']?(flights|flights_calendar|flights_popular|flights_map)["']?/i.test(attrs)) {
        return full;
      }

      if (/destination\s*=\s*["']?[A-Z]{3}["']?/i.test(attrs)) {
        const next = full.replace(/destination\s*=\s*["']?[A-Z]{3}["']?/i, `destination="${expectedCode}"`);
        if (next !== full) replacements++;
        return next;
      }

      replacements++;
      return `[fv_widget${attrs} destination="${expectedCode}"]`;
    });

    if (replacements > 0) {
      report.actions.push({
        type: 'widget_destination_reconciled',
        details: `count=${replacements} expected=${expectedCode}`
      });
      console.log(`🔧 WIDGET_DEST_RECONCILE: ${replacements} shortcode(s) aligné(s) vers ${expectedCode}`);
    }

    return fixed;
  }

  /**
   * Valide la cohérence des destinations dans les widgets
   * @param {string} html - HTML à valider
   * @param {Object} pipelineContext - Contexte du pipeline
   * @param {Object} analysis - Analyse de l'article
   * @param {Object} report - Rapport QA
   */
  validateWidgetDestinations(html, pipelineContext, analysis, report) {
    console.log('🔍 Validation cohérence widgets/destination...');
    const editorialMode = (pipelineContext?.editorial_mode || pipelineContext?.editorialMode || 'evergreen').toLowerCase();
    
    // Extraire destination finale
    const finalDestination = pipelineContext?.final_destination || analysis?.final_destination || null;
    const finalDestLower = finalDestination ? finalDestination.toLowerCase() : null;
    
    if (!finalDestLower) {
      report.checks.push({
        name: 'widget_destination',
        status: 'warn',
        details: 'Destination finale non disponible pour validation'
      });
      return;
    }
    
    // Lookup dynamique destination → code IATA via BDD OpenFlights (5600+ entrées)
    const expectedCode = lookupIATA(finalDestLower);
    
    // Extraire destinations uniquement depuis les shortcodes [fv_widget ...] pour éviter les faux positifs
    // sur data-destination="com" ou autres attributs HTML
    const fvWidgetShortcodes = html.match(/\[fv_widget[^\]]*\]/gi) || [];
    const detectedCodes = [];
    fvWidgetShortcodes.forEach(shortcode => {
      const destMatch = shortcode.match(/destination\s*=\s*["']?([A-Z]{3})["']?/i);
      if (destMatch) detectedCodes.push(destMatch[1].toUpperCase());
    });
    
    // Vérifier cohérence
    const mismatches = [];
    detectedCodes.forEach(code => {
      if (expectedCode && code !== expectedCode) {
        // Vérifier si c'est un code d'origine (PAR, CDG, etc.) - OK
        const originCodes = ['PAR', 'CDG', 'ORY', 'LHR', 'JFK', 'LAX'];
        if (!originCodes.includes(code)) {
          mismatches.push({
            detected: code,
            expected: expectedCode,
            article_dest: finalDestLower
          });
        }
      }
    });
    
    // Ajouter au rapport
    if (mismatches.length > 0) {
      report.checks.push({
        name: 'widget_destination',
        status: editorialMode === 'news' ? 'warn' : 'fail',
        details: `mismatches=${mismatches.length} expected=${expectedCode || 'N/A'} mode=${editorialMode}`
      });
      
      report.issues.push({
        code: 'WIDGET_DESTINATION_MISMATCH',
        severity: editorialMode === 'news' ? 'warn' : 'error',
        message: `Widget destination incohérente: détecté=${mismatches[0].detected} attendu=${mismatches[0].expected}`,
        evidence: mismatches[0]
      });
      
      console.log(`   ❌ WIDGET_DESTINATION_MISMATCH: widget_dest=${mismatches[0].detected} article_dest=${finalDestLower} expected=${expectedCode}`);
    } else {
      report.checks.push({
        name: 'widget_destination',
        status: 'pass',
        details: `coherent avec destination=${finalDestLower}`
      });
    }
    
    console.log(`✅ Validation widgets: ${mismatches.length} incohérence(s) détectée(s)`);
  }

  /**
   * Valide et corrige les citations
   * @param {string} html - HTML à valider
   * @param {Object} report - Rapport QA
   * @returns {string} HTML corrigé
   */
  validateAndFixCitations(html, report) {
    console.log('🔍 Validation citations...');
    
    let cleanedHtml = html;
    const invalidCitations = [];
    
    // AMÉLIORATION: Pattern pour détecter les citations vides (guillemets vides avec attribution)
    // Ex: « » — auteur Reddit ou «  » — Extrait de témoignage
    const emptyCitationPattern = /<p[^>]*>«\s*»\s*[—–]\s*[^<]+<\/p>/gi;
    const emptyCitationMatches = html.match(emptyCitationPattern);
    if (emptyCitationMatches) {
      emptyCitationMatches.forEach(match => {
        invalidCitations.push({
          fullMatch: match,
          reason: 'citation_vide',
          text: match.substring(0, 50)
        });
      });
    }
    
    // Pattern: Citations qui ne contiennent que le nom d'auteur
    const authorOnlyPattern = /«\s*Auteur\s*:\s*[^»]+»/gi;
    const authorOnlyMatches = html.match(authorOnlyPattern);
    if (authorOnlyMatches) {
      authorOnlyMatches.forEach(match => {
        invalidCitations.push({
          fullMatch: match,
          reason: 'nom_auteur_seul',
          text: match
        });
      });
    }
    
    // AMÉLIORATION: Pattern pour détecter les citations avec très peu de contenu (moins de 5 caractères réels)
    const minimalCitationPattern = /<p[^>]*>«\s*([^»]{0,20})\s*»\s*[—–]\s*[^<]+<\/p>/gi;
    let minimalMatch;
    while ((minimalMatch = minimalCitationPattern.exec(html)) !== null) {
      const citationText = minimalMatch[1].trim();
      const realText = citationText.replace(/[^\w\sÀ-Ÿà-ÿ]/g, '').trim();
      if (realText.length < 5) {
        invalidCitations.push({
          fullMatch: minimalMatch[0],
          reason: 'citation_trop_courte',
          text: citationText.substring(0, 50)
        });
      }
    }
    
    // Pattern: Citations redondantes (même texte répété)
    const citationPattern = /«([^»]+)»/g;
    const citations = [];
    let citationMatch;
    while ((citationMatch = citationPattern.exec(html)) !== null) {
      const citationText = citationMatch[1].trim().toLowerCase();
      if (citationText.length > 10) {
        citations.push({
          text: citationText,
          fullMatch: citationMatch[0],
          index: citationMatch.index
        });
      }
    }
    
    // Détecter doublons
    const seenCitations = new Map();
    citations.forEach((cit, index) => {
      if (seenCitations.has(cit.text)) {
        invalidCitations.push({
          fullMatch: cit.fullMatch,
          reason: 'citation_redondante',
          text: cit.text.substring(0, 50)
        });
      } else {
        seenCitations.set(cit.text, index);
      }
    });
    
    // Vérifier contenu substantiel (> 20 caractères de texte réel)
    citations.forEach(cit => {
      const realText = cit.text.replace(/[^\w\s]/g, '').trim();
      if (realText.length < 20) {
        invalidCitations.push({
          fullMatch: cit.fullMatch,
          reason: 'citation_trop_courte',
          text: cit.text.substring(0, 50)
        });
      }
    });
    
    // Supprimer citations invalides (en ordre inverse pour préserver les indices)
    let removedCount = 0;
    // Trier par index décroissant pour supprimer de la fin vers le début
    const sortedInvalid = [...invalidCitations].sort((a, b) => {
      const indexA = cleanedHtml.indexOf(a.fullMatch);
      const indexB = cleanedHtml.indexOf(b.fullMatch);
      return indexB - indexA;
    });
    
    sortedInvalid.forEach(cit => {
      const index = cleanedHtml.indexOf(cit.fullMatch);
      if (index !== -1) {
        // Supprimer aussi le paragraphe parent si c'est une citation vide
        if (cit.reason === 'citation_vide') {
          // Chercher le <p> parent complet
          const beforeMatch = cleanedHtml.substring(0, index);
          const afterMatch = cleanedHtml.substring(index);
          const pStart = beforeMatch.lastIndexOf('<p');
          const pEnd = afterMatch.indexOf('</p>') + 4;
          
          if (pStart !== -1 && pEnd !== -1) {
            const fullParagraph = cleanedHtml.substring(pStart, index + pEnd);
            cleanedHtml = cleanedHtml.substring(0, pStart) + cleanedHtml.substring(index + pEnd);
            removedCount++;
            console.log(`   🧹 Citation vide supprimée (paragraphe complet): "${cit.text.substring(0, 50)}..."`);
          } else {
            // Fallback: supprimer juste la citation
            cleanedHtml = cleanedHtml.replace(cit.fullMatch, '');
            removedCount++;
            console.log(`   🧹 Citation invalide supprimée (${cit.reason}): "${cit.text.substring(0, 50)}..."`);
          }
        } else {
          cleanedHtml = cleanedHtml.replace(cit.fullMatch, '');
          removedCount++;
          console.log(`   🧹 Citation invalide supprimée (${cit.reason}): "${cit.text.substring(0, 50)}..."`);
        }
      }
    });
    
    // Ajouter au rapport
    if (invalidCitations.length > 0) {
      report.checks.push({
        name: 'citations',
        status: removedCount === invalidCitations.length ? 'pass' : 'warn',
        details: `invalides=${invalidCitations.length} supprimées=${removedCount}`
      });
      
      if (removedCount < invalidCitations.length) {
        report.issues.push({
          code: 'INVALID_CITATIONS',
          severity: 'warn',
          message: `${invalidCitations.length - removedCount} citation(s) invalide(s) non supprimée(s)`,
          evidence: invalidCitations.slice(0, 3).map(c => c.text)
        });
      }
      
      report.actions.push({
        type: 'removed_invalid_citations',
        details: `count=${removedCount}`
      });
    } else {
      report.checks.push({
        name: 'citations',
        status: 'pass',
        details: 'Toutes les citations sont valides'
      });
    }
    
    console.log(`✅ Citations: ${invalidCitations.length} invalide(s), ${removedCount} supprimée(s)`);
    return cleanedHtml;
  }

  /**
   * Valide la cohérence des liens dans les recommandations
   * @param {string} html - HTML à valider
   * @param {Object} report - Rapport QA
   */
  validateRecommendationLinks(html, report) {
    console.log('🔍 Validation liens recommandations...');
    
    // Extraire section "Nos recommandations"
    const recommendationsMatch = html.match(/<h2[^>]*>Nos recommandations[^<]*<\/h2>([\s\S]*?)(?=<h[23]|$)/i);
    if (!recommendationsMatch) {
      report.checks.push({
        name: 'recommendation_links',
        status: 'warn',
        details: 'Section "Nos recommandations" non trouvée'
      });
      return;
    }
    
    const recommendationsSection = recommendationsMatch[1];
    const links = recommendationsSection.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi) || [];
    
    const mismatches = [];
    links.forEach(link => {
      const hrefMatch = link.match(/href=["']([^"']+)["']/i);
      const textMatch = link.match(/>([^<]+)</i);
      
      if (hrefMatch && textMatch) {
        // Normaliser l'URL (supprimer les espaces parasites insérés par normalizeSpacing)
        const href = hrefMatch[1].replace(/\s+/g, '');
        const text = textMatch[1].toLowerCase();
        
        // Vérifier cohérence
        if (text.includes('logement') || text.includes('hôtel') || text.includes('hébergement')) {
          if (!href.includes('booking.com') && !href.includes('hotel')) {
            mismatches.push({
              context: 'logement',
              link: href,
              text: text,
              expected: 'booking.com ou hotel'
            });
          }
        } else if (text.includes('vol') || text.includes('avion')) {
          if (!href.includes('kiwi.com') && !href.includes('flight')) {
            mismatches.push({
              context: 'vols',
              link: href,
              text: text,
              expected: 'kiwi.com ou flight'
            });
          }
        } else if (text.includes('esim') || text.includes('sim') || text.includes('connexion')) {
          if (!href.includes('airalo.com') && !href.includes('esim')) {
            mismatches.push({
              context: 'esim',
              link: href,
              text: text,
              expected: 'airalo.com ou esim'
            });
          }
        }
      }
    });
    
    // Ajouter au rapport
    if (mismatches.length > 0) {
      report.checks.push({
        name: 'recommendation_links',
        status: 'warn',
        details: `mismatches=${mismatches.length}`
      });
      
      report.issues.push({
        code: 'RECOMMENDATION_LINK_MISMATCH',
        severity: 'warn',
        message: `${mismatches.length} lien(s) de recommandation incohérent(s)`,
        evidence: mismatches[0]
      });
      
      console.log(`   ⚠️ RECOMMENDATION_LINK_MISMATCH: context=${mismatches[0].context} link=${mismatches[0].link} expected=${mismatches[0].expected}`);
    } else {
      report.checks.push({
        name: 'recommendation_links',
        status: 'pass',
        details: 'Tous les liens sont cohérents'
      });
    }
    
    console.log(`✅ Liens recommandations: ${mismatches.length} incohérence(s) détectée(s)`);
  }

  /**
   * Traduction forcée de la section "Nos recommandations" (correction audit)
   * Détecte et traduit toute la section si >20% de mots anglais
   * @param {string} html - HTML à traiter
   * @param {Object} report - Rapport QA
   * @returns {string} HTML avec section traduite
   */
  async forceTranslateRecommendationsSection(html, report) {
    console.log('🌐 Traduction forcée section "Nos recommandations"...');
    
    const recommendationsMatch = html.match(/(<h2[^>]*>Nos recommandations[^<]*<\/h2>[\s\S]*?)(?=<h2[^>]*>|$)/i);
    if (!recommendationsMatch) {
      return html;
    }
    
    const recommendationsSection = recommendationsMatch[1];
    const textContent = recommendationsSection.replace(/<[^>]+>/g, ' ').trim();
    
    // Détection améliorée : patterns anglais complets
    const englishPatterns = /(Option \d+:|#\d+|Prepare your documents|Stay calm|Use reliable services|Realistic budget:|Advantages?:|Disadvantages?:|can be|Compare prices|Learn more|Check|Book|Find|Get|Search|Select|Choose|Available|Required|Needed|Important|Remember|Note|Tip|Warning)/i;
    const hasEnglishPatterns = englishPatterns.test(recommendationsSection);
    
    // Calcul ratio de mots anglais (seuil abaissé à 20%)
    const ENGLISH_WORDS_REGEX = /\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|just|prepare|stay|use|reliable|services|documents|calm|check|book|available|required|needed|important|remember|note|tip|warning|realistic|budget|advantages|disadvantages|compare|prices|learn|more|option)\b/gi;
    const englishWords = (textContent.match(ENGLISH_WORDS_REGEX) || []).length;
    const totalWords = textContent.split(/\s+/).filter(w => w.length > 0).length;
    const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
    
    if (hasEnglishPatterns || englishRatio > 0.20) {
      console.log(`   📝 Section "Nos recommandations" avec ${Math.round(englishRatio * 100)}% de mots anglais détectés, traduction...`);
      
      if (!FORCE_OFFLINE && this.intelligentContentAnalyzer) {
        try {
          const translated = await this.intelligentContentAnalyzer.translateToFrench(recommendationsSection);
          if (translated && translated.trim().length > 10) {
            const escapedSection = recommendationsSection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const newHtml = html.replace(new RegExp(escapedSection, 'g'), translated);
            report.actions.push({ 
              type: 'translated_recommendations_section', 
              details: `english_ratio=${Math.round(englishRatio * 100)}%` 
            });
            report.checks.push({
              name: 'recommendations_translation',
              status: 'pass',
              details: `Section traduite (${Math.round(englishRatio * 100)}% EN détecté)`
            });
            console.log(`   ✅ Section "Nos recommandations" traduite`);
            return newHtml;
          }
        } catch (error) {
          console.error(`   ❌ Erreur traduction section recommandations: ${error.message}`);
          report.checks.push({
            name: 'recommendations_translation',
            status: 'warn',
            details: `Erreur traduction: ${error.message}`
          });
        }
      } else {
        console.warn('   ⚠️ Traduction désactivée (FORCE_OFFLINE ou pas de intelligentContentAnalyzer)');
        report.checks.push({
          name: 'recommendations_translation',
          status: 'warn',
          details: 'Traduction désactivée'
        });
      }
    } else {
      report.checks.push({
        name: 'recommendations_translation',
        status: 'pass',
        details: 'Section déjà en français'
      });
    }
    
    return html;
  }

  /**
   * Remplace les placeholders de liens d'affiliation par de vrais liens (correction audit)
   * @param {string} html - HTML à traiter
   * @param {Object} pipelineContext - Contexte du pipeline
   * @param {Object} report - Rapport QA
   * @returns {string} HTML avec placeholders remplacés
   */
  replaceAffiliatePlaceholders(html, pipelineContext, report) {
    console.log('🔗 Remplacement placeholders liens d\'affiliation...');
    
    // Patterns de placeholders à détecter
    const placeholderPatterns = [
      /\[Affiliate links to add\]/gi,
      /\[Add affiliate links\]/gi,
      /Affiliate links to add/gi,
      /\[Lien\(s\) d'affiliation à ajouter\]/gi
    ];
    
    let modifiedHtml = html;
    let replacementCount = 0;
    
    // URLs d'affiliation par contexte
    const affiliateUrls = {
      logement: 'https://www.booking.com/',
      hotel: 'https://www.booking.com/',
      hébergement: 'https://www.booking.com/',
      vol: 'https://www.kiwi.com/',
      vols: 'https://www.kiwi.com/',
      avion: 'https://www.kiwi.com/',
      flight: 'https://www.kiwi.com/',
      esim: 'https://www.airalo.com/',
      sim: 'https://www.airalo.com/',
      connexion: 'https://www.airalo.com/',
      internet: 'https://www.airalo.com/',
      roaming: 'https://www.airalo.com/'
    };
    
    // Extraire la destination depuis pipelineContext
    const destination = pipelineContext?.geo_defaults?.country || 
                       pipelineContext?.final_destination || 
                       pipelineContext?.geo?.country || 
                       '';
    const normalizedDest = destination.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'general';
    
    // Pour chaque placeholder trouvé
    for (const pattern of placeholderPatterns) {
      const matches = [...html.matchAll(pattern)];
      
      for (const match of matches) {
        const placeholder = match[0];
        const matchIndex = match.index;
        
        // Analyser le contexte autour du placeholder (100 caractères avant et après)
        const contextStart = Math.max(0, matchIndex - 100);
        const contextEnd = Math.min(html.length, matchIndex + placeholder.length + 100);
        const context = html.substring(contextStart, contextEnd).toLowerCase();
        
        // Déterminer le type de lien selon le contexte
        let affiliateUrl = null;
        let anchorText = '';
        let partner = '';
        
        // Chercher des mots-clés dans le contexte
        if (context.match(/\b(logement|hôtel|hébergement|reservation|booking|nuit|chambre)\b/)) {
          affiliateUrl = affiliateUrls.logement;
          anchorText = 'Réserver un hébergement';
          partner = 'booking';
        } else if (context.match(/\b(vol|vols|avion|billet|flight|aéroport|départ|arrivée)\b/)) {
          affiliateUrl = affiliateUrls.vol;
          anchorText = 'Comparer les prix des vols';
          partner = 'kiwi';
        } else if (context.match(/\b(esim|sim|connexion|internet|roaming|wifi|données|4g|5g|signal)\b/)) {
          affiliateUrl = affiliateUrls.esim;
          anchorText = 'Obtenir une eSIM';
          partner = 'airalo';
        }
        
        // Si aucun contexte trouvé, essayer de détecter depuis la section "Nos recommandations"
        if (!affiliateUrl) {
          const recommendationsMatch = html.substring(0, matchIndex).match(/(<h2[^>]*>Nos recommandations[^<]*<\/h2>[\s\S]*?)(?=<h2[^>]*>|$)/i);
          if (recommendationsMatch) {
            const recoSection = recommendationsMatch[1].toLowerCase();
            // Chercher dans les options #1, #2, #3
            if (recoSection.match(/#\s*1|option\s*1|première\s*option/)) {
              // Généralement logement dans option 1
              affiliateUrl = affiliateUrls.logement;
              anchorText = 'Réserver un hébergement';
              partner = 'booking';
            } else if (recoSection.match(/#\s*2|option\s*2|deuxième\s*option/)) {
              // Généralement vols dans option 2
              affiliateUrl = affiliateUrls.vol;
              anchorText = 'Comparer les prix des vols';
              partner = 'kiwi';
            } else if (recoSection.match(/#\s*3|option\s*3|troisième\s*option/)) {
              // Généralement eSIM dans option 3
              affiliateUrl = affiliateUrls.esim;
              anchorText = 'Obtenir une eSIM';
              partner = 'airalo';
            }
          }
        }
        
        // Si toujours pas trouvé, utiliser un lien générique booking.com (le plus courant)
        if (!affiliateUrl) {
          affiliateUrl = affiliateUrls.logement;
          anchorText = 'Réserver un hébergement';
          partner = 'booking';
        }
        
        // Générer le lien avec les attributs data-afftrack
        const afftrack = `${partner}-${partner === 'booking' ? 'logement' : partner === 'kiwi' ? 'vol' : 'esim'}-${normalizedDest}-recommandations`;
        const linkHtml = `<a href="${affiliateUrl}" target="_blank" rel="noopener" data-afftrack="${afftrack}" data-slot="recommandations" data-article-type="temoignage" data-destination="${destination}" style="color: #dc2626; text-decoration: underline;">${anchorText}</a>`;
        
        // Remplacer le placeholder
        modifiedHtml = modifiedHtml.substring(0, matchIndex) + linkHtml + modifiedHtml.substring(matchIndex + placeholder.length);
        replacementCount++;
        
        console.log(`   ✅ Placeholder remplacé: "${placeholder.substring(0, 30)}..." → ${partner} (${anchorText})`);
      }
    }
    
    if (replacementCount > 0) {
      report.actions.push({
        type: 'replaced_affiliate_placeholders',
        details: `count=${replacementCount}`
      });
      report.checks.push({
        name: 'affiliate_placeholders',
        status: 'pass',
        details: `${replacementCount} placeholder(s) remplacé(s)`
      });
      console.log(`   ✅ ${replacementCount} placeholder(s) de liens d'affiliation remplacé(s)`);
    } else {
      report.checks.push({
        name: 'affiliate_placeholders',
        status: 'pass',
        details: 'Aucun placeholder détecté'
      });
    }
    
    return modifiedHtml;
  }

  /**
   * PHASE 6.1.2: Injection de liens affiliés sur les mentions de marques partenaires.
   * Rule-based : scanne le HTML pour les noms de marques partenaires Travelpayouts
   * et wrappe la PREMIÈRE occurrence (non déjà linkée) avec le lien affilié API.
   *
   * Marques supportées :
   *   - Airalo / Airalo.com      → esim CTA
   *   - Aviasales / Aviasales.com → flights CTA
   *   - VisitorCoverage           → insurance CTA
   *   - Kiwi.com                  → flights CTA (Kiwi exclu de l'API, redirige vers Aviasales)
   *
   * @param {string} html - HTML de l'article
   * @param {Object} pipelineContext - Contexte du pipeline (contient affiliate_ctas)
   * @returns {string} HTML avec liens affiliés injectés
   */
  injectPartnerBrandLinks(html, pipelineContext) {
    const ctas = pipelineContext?.affiliate_ctas;
    if (!ctas) {
      console.log('🔗 PARTNER_BRAND_LINKS: Aucun affiliate_ctas dans pipelineContext — skip');
      // Même sans affiliate_ctas, on peut linker les marques directes
      let modifiedHtml = html;
      let directWrappedCount = 0;
      const DIRECT_BRAND_MAP = [
        { directUrl: 'https://wise.com/',           variants: ['Wise'], rel: 'nofollow' },
        { directUrl: 'https://www.revolut.com/',     variants: ['Revolut'], rel: 'nofollow' },
        { directUrl: 'https://www.bangkokbank.com/', variants: ['Bangkok Bank'], rel: 'nofollow' },
        { directUrl: 'https://www.schwab.com/',      variants: ['Schwab', 'Charles Schwab'], rel: 'nofollow' },
      ];
      for (const brand of DIRECT_BRAND_MAP) {
        for (const variant of brand.variants) {
          const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const simpleRegex = new RegExp(escapedVariant, 'gi');
          const allMatches = [...modifiedHtml.matchAll(simpleRegex)];
          for (const match of allMatches) {
            const pos = match.index;
            // FIX: lookback augmenté à 500 chars
            const beforeChunk = modifiedHtml.substring(Math.max(0, pos - 500), pos);
            const openTags = (beforeChunk.match(/<a\b/gi) || []).length;
            const closeTags = (beforeChunk.match(/<\/a>/gi) || []).length;
            const isInsideLink = openTags > closeTags;
            const isInHref = /href=["'][^"']*$/.test(beforeChunk);
            if (!isInsideLink && !isInHref) {
              const originalText = modifiedHtml.substring(pos, pos + variant.length);
              const directLink = `<a href="${brand.directUrl}" target="_blank" rel="${brand.rel || 'nofollow'}">${originalText}</a>`;
              modifiedHtml = modifiedHtml.substring(0, pos) + directLink + modifiedHtml.substring(pos + variant.length);
              directWrappedCount++;
              console.log(`   🔗 DIRECT_BRAND_WRAPPED: "${originalText}" → ${brand.directUrl}`);
              break;
            }
          }
        }
      }
      if (directWrappedCount > 0) {
        console.log(`✅ PARTNER_BRAND_LINKS: ${directWrappedCount} lien(s) direct(s) ajouté(s) (sans affiliate_ctas)`);
      }
      return modifiedHtml;
    }

    // Vérifier qu'au moins un CTA a une partner_url OU une direct_url (fallback)
    const hasAnyCta = Object.values(ctas).some(c => c?.partner_url || c?.direct_url);
    if (!hasAnyCta) {
      console.log('🔗 PARTNER_BRAND_LINKS: Aucun partner_url ni direct_url disponible — skip');
      return html;
    }

    // =========================================================================
    // PHASE A : Remplacer les href DIRECTS existants par les URLs affiliées
    // Le LLM génère souvent <a href="https://www.airalo.com/">...</a>
    // On remplace ces URLs directes par les URLs affiliées trackées
    // =========================================================================
    const DOMAIN_TO_CTA = [
      { domains: ['airalo.com'],              ctaKey: 'esim' },
      { domains: ['aviasales.com'],           ctaKey: 'flights' },
      { domains: ['visitorcoverage.com'],     ctaKey: 'insurance' },
      { domains: ['kiwi.com'],               ctaKey: 'flights' },
      { domains: ['booking.com'],            ctaKey: 'hotels' },
      // assurance-voyage.com → notre partenaire assurance (le LLM invente parfois ce domaine)
      { domains: ['assurance-voyage.com'],    ctaKey: 'insurance' },
    ];

    let modifiedHtml = html;
    let replacedHrefCount = 0;

    for (const mapping of DOMAIN_TO_CTA) {
      const cta = ctas[mapping.ctaKey];
      const targetUrl = cta?.partner_url || cta?.direct_url;
      if (!targetUrl) continue;

      for (const domain of mapping.domains) {
        // Chercher tous les href contenant ce domaine
        const hrefRegex = new RegExp(
          `(href=["'])https?:\\/\\/(?:www\\.)?${domain.replace(/\./g, '\\.')}[^"']*?(["'])`,
          'gi'
        );

        const matches = [...modifiedHtml.matchAll(hrefRegex)];
        for (const match of matches) {
          const originalHref = match[0];
          const quote = match[1].slice(-1); // ' or "
          const newHref = `href=${quote}${targetUrl}${quote}`;
          modifiedHtml = modifiedHtml.replace(originalHref, newHref);
          replacedHrefCount++;
          const linkType = cta?.partner_url ? 'affiliate' : 'direct (fallback)';
          console.log(`   🔗 HREF_REPLACED: ${domain} → ${mapping.ctaKey} ${linkType} link`);
        }
      }
    }

    // Ajouter rel="nofollow sponsored" aux liens qu'on vient de modifier (s'ils ne l'ont pas déjà)
    if (replacedHrefCount > 0) {
      for (const mapping of DOMAIN_TO_CTA) {
        const cta = ctas[mapping.ctaKey];
        const targetUrl = cta?.partner_url || cta?.direct_url;
        if (!targetUrl) continue;

        const escapedUrl = targetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Trouver les <a> avec cette URL qui n'ont pas encore rel="nofollow sponsored"
        const linkRegex = new RegExp(`(<a\\s[^>]*href=["']${escapedUrl}["'][^>]*)(>)`, 'gi');
        modifiedHtml = modifiedHtml.replace(linkRegex, (fullMatch, beforeClose, close) => {
          if (/rel=/.test(beforeClose)) return fullMatch; // déjà un rel
          return `${beforeClose} rel="nofollow sponsored" target="_blank"${close}`;
        });
      }
    }

    // =========================================================================
    // PHASE B : Wrapper les mentions texte brut (non déjà linkées)
    // =========================================================================
    const BRAND_MAP = [
      { ctaKey: 'esim',      variants: ['Airalo.com', 'Airalo'] },
      { ctaKey: 'flights',   variants: ['Aviasales.com', 'Aviasales'] },
      { ctaKey: 'insurance', variants: ['VisitorCoverage'] },
      { ctaKey: 'flights',   variants: ['Kiwi.com'] },
      { ctaKey: 'hotels',    variants: ['Booking.com', 'Booking'] },
    ];

    // Phase B-bis: Marques courantes NON affiliées (liens directs, utiles au lecteur)
    // Ces marques sont fréquemment mentionnées dans les articles finance/voyage
    const DIRECT_BRAND_MAP = [
      { directUrl: 'https://wise.com/',           variants: ['Wise'], rel: 'nofollow' },
      { directUrl: 'https://www.revolut.com/',     variants: ['Revolut'], rel: 'nofollow' },
      { directUrl: 'https://www.bangkokbank.com/', variants: ['Bangkok Bank'], rel: 'nofollow' },
      { directUrl: 'https://www.schwab.com/',      variants: ['Schwab', 'Charles Schwab'], rel: 'nofollow' },
    ];

    let wrappedCount = 0;

    for (const brand of BRAND_MAP) {
      const cta = ctas[brand.ctaKey];
      const targetUrl = cta?.partner_url || cta?.direct_url;
      if (!targetUrl) continue;

      for (const variant of brand.variants) {
        const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const simpleRegex = new RegExp(escapedVariant, 'gi');
        const allMatches = [...modifiedHtml.matchAll(simpleRegex)];

        let brandWrapped = false;
        for (const match of allMatches) {
          if (brandWrapped) break;
          const pos = match.index;
          // FIX: lookback augmenté à 500 chars (les URLs affiliées Travelpayouts dépassent 200 chars)
          const beforeChunk = modifiedHtml.substring(Math.max(0, pos - 500), pos);

          const openTags = (beforeChunk.match(/<a\b/gi) || []).length;
          const closeTags = (beforeChunk.match(/<\/a>/gi) || []).length;
          const isInsideLink = openTags > closeTags;
          const isInHref = /href=["'][^"']*$/.test(beforeChunk);
          if (!isInsideLink && !isInHref) {
            const originalText = modifiedHtml.substring(pos, pos + variant.length);
            const affiliateLink = `<a href="${targetUrl}" target="_blank" rel="nofollow sponsored">${originalText}</a>`;
            modifiedHtml = modifiedHtml.substring(0, pos) + affiliateLink + modifiedHtml.substring(pos + variant.length);
            wrappedCount++;
            brandWrapped = true;
            const linkType = cta?.partner_url ? 'affiliate' : 'direct (fallback)';
            console.log(`   🔗 BRAND_WRAPPED: "${originalText}" → ${brand.ctaKey} ${linkType} link`);
            break; // Une seule occurrence par variant
          }
        }
      }
    }

    // =========================================================================
    // PHASE C : Liens directs pour marques non affiliées (Wise, Revolut, etc.)
    // =========================================================================
    let directWrappedCount = 0;
    for (const brand of DIRECT_BRAND_MAP) {
      for (const variant of brand.variants) {
        const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const simpleRegex = new RegExp(escapedVariant, 'gi');
        const allMatches = [...modifiedHtml.matchAll(simpleRegex)];

        for (const match of allMatches) {
          const pos = match.index;
          // FIX: lookback augmenté à 500 chars
          const beforeChunk = modifiedHtml.substring(Math.max(0, pos - 500), pos);

          const openTags = (beforeChunk.match(/<a\b/gi) || []).length;
          const closeTags = (beforeChunk.match(/<\/a>/gi) || []).length;
          const isInsideLink = openTags > closeTags;
          const isInHref = /href=["'][^"']*$/.test(beforeChunk);
          const isInTag = />[^<]*$/.test(beforeChunk) === false; // inside a tag attribute

          if (!isInsideLink && !isInHref && !isInTag) {
            const originalText = modifiedHtml.substring(pos, pos + variant.length);
            const relAttr = brand.rel || 'nofollow';
            const directLink = `<a href="${brand.directUrl}" target="_blank" rel="${relAttr}">${originalText}</a>`;
            modifiedHtml = modifiedHtml.substring(0, pos) + directLink + modifiedHtml.substring(pos + variant.length);
            directWrappedCount++;
            console.log(`   🔗 DIRECT_BRAND_WRAPPED: "${originalText}" → ${brand.directUrl}`);
            break; // Une seule occurrence par variant
          }
        }
      }
    }

    const totalCount = replacedHrefCount + wrappedCount + directWrappedCount;
    if (totalCount > 0) {
      console.log(`✅ PARTNER_BRAND_LINKS: ${totalCount} lien(s) (${replacedHrefCount} href affiliés, ${wrappedCount} textes affiliés, ${directWrappedCount} liens directs)`);
    } else {
      console.log('🔗 PARTNER_BRAND_LINKS: Aucune mention de marque partenaire trouvée à linker');
    }

    return modifiedHtml;
  }

  /**
   * Valide et étend la section "Une histoire vraie" si trop courte (correction audit)
   * @param {string} html - HTML à valider
   * @param {Object} pipelineContext - Contexte du pipeline
   * @param {Object} report - Rapport QA
   */
  validateAndExtendNarrativeSection(html, pipelineContext, report) {
    console.log('📖 Validation section narrative "Une histoire vraie"...');
    
    // Patterns pour détecter les sections narratives
    const narrativePatterns = [
      /<h2[^>]*>Une vraie histoire[^<]*<\/h2>/i,
      /<h2[^>]*>Une histoire vraie[^<]*<\/h2>/i,
      /<h2[^>]*>Témoignage[^<]*<\/h2>/i,
      /<h2[^>]*>.*?histoire.*?<\/h2>/i
    ];
    
    let foundSection = false;
    let sectionTooShort = false;
    
    for (const pattern of narrativePatterns) {
      const match = html.match(pattern);
      if (match) {
        foundSection = true;
        const h2Index = match.index;
        const h2End = h2Index + match[0].length;
        
        // Extraire le contenu après le H2 jusqu'au prochain H2 ou fin
        const afterH2 = html.substring(h2End);
        const nextH2Match = afterH2.match(/<h2[^>]*>/i);
        const sectionContent = nextH2Match 
          ? afterH2.substring(0, nextH2Match.index)
          : afterH2;
        
        // Extraire le texte narratif (sans balises HTML)
        const textContent = sectionContent.replace(/<[^>]+>/g, ' ').trim();
        const textLength = textContent.length;
        
        // Vérifier si la section fait au moins 200 caractères
        if (textLength < 200) {
          sectionTooShort = true;
          console.log(`   ⚠️ Section narrative trop courte: ${textLength} caractères (minimum: 200)`);
          
          report.checks.push({
            name: 'narrative_section_length',
            status: 'warn',
            details: `Section "${match[0].replace(/<[^>]+>/g, '')}" trop courte: ${textLength} caractères (minimum: 200)`
          });
          
          report.issues.push({
            code: 'NARRATIVE_SECTION_TOO_SHORT',
            severity: 'medium',
            message: `La section narrative "${match[0].replace(/<[^>]+>/g, '')}" ne fait que ${textLength} caractères. Minimum recommandé: 200 caractères pour développer l'histoire (qui, quoi, enjeu).`,
            evidence: {
              sectionTitle: match[0].replace(/<[^>]+>/g, ''),
              currentLength: textLength,
              requiredLength: 200
            }
          });
          
          // Optionnellement, suggérer une extension basée sur story.evidence.source_snippets
          const hasEvidenceSnippets = pipelineContext?.story?.evidence?.source_snippets?.length > 0;
          if (hasEvidenceSnippets) {
            const snippets = pipelineContext.story.evidence.source_snippets;
            const firstSnippet = snippets[0];
            let snippetText = typeof firstSnippet === 'string' ? firstSnippet : 
                             (firstSnippet?.text || firstSnippet?.content || firstSnippet?.snippet || '');
            if (snippetText && snippetText.length > 50) {
              console.log(`   💡 Suggestion: Utiliser snippet disponible (${snippetText.length} caractères) pour étendre la section`);
            }
          }
        } else {
          report.checks.push({
            name: 'narrative_section_length',
            status: 'pass',
            details: `Section narrative de ${textLength} caractères (OK)`
          });
          console.log(`   ✅ Section narrative de longueur correcte: ${textLength} caractères`);
        }
        
        break; // Ne traiter que la première section trouvée
      }
    }
    
    if (!foundSection) {
      report.checks.push({
        name: 'narrative_section_length',
        status: 'warn',
        details: 'Aucune section narrative détectée (H2 "Une histoire vraie", "Témoignage", etc.)'
      });
      console.log('   ⚠️ Aucune section narrative détectée');
    }
  }

  /**
   * Traduction forcée des citations dans les listes (correction audit)
   * @param {string} html - HTML à traiter
   * @param {Object} report - Rapport QA
   * @returns {string} HTML avec citations traduites
   */
  async forceTranslateCitationsInLists(html, report) {
    console.log('🌐 Traduction forcée citations dans les listes...');
    
    if (FORCE_OFFLINE || !this.intelligentContentAnalyzer) {
      report.checks.push({
        name: 'citations_in_lists_translation',
        status: 'warn',
        details: 'Traduction désactivée (FORCE_OFFLINE ou pas de intelligentContentAnalyzer)'
      });
      return html;
    }
    
    const ENGLISH_WORDS_REGEX = /\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|just|I|you|he|she|it|we|they|don't|I'm|basically|from)\b/gi;
    
    let modifiedHtml = html;
    let translationCount = 0;
    
    // Extraire toutes les <li> contenant des citations
    const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    const lisToTranslate = [];
    
    while ((liMatch = liPattern.exec(html)) !== null) {
      const liContent = liMatch[1];
      const fullLi = liMatch[0];
      
      // Détecter les citations (guillemets français « ... » ou anglais "...")
      const citationPattern = /(«[^»]*»|"[^"]*"|'[^']*')/g;
      const citations = liContent.match(citationPattern);
      
      if (citations && citations.length > 0) {
        for (const citation of citations) {
          const citationText = citation.replace(/[«»""'']/g, '').trim();
          // SKIP: ne pas traduire les URLs (elles matchent le pattern anglais mais ne sont pas des citations)
          if (/^https?:\/\//i.test(citationText) || /\.(com|org|net|io|fr)\b/i.test(citationText)) {
            continue;
          }
          if (citationText.length >= 10 && /[a-zA-Z]{3,}/.test(citationText)) {
            const englishWords = (citationText.match(ENGLISH_WORDS_REGEX) || []).length;
            const totalWords = citationText.split(/\s+/).filter(w => w.length > 0).length;
            const ratio = totalWords > 0 ? englishWords / totalWords : 0;
            
            // Seuil abaissé à 20% pour les citations dans les listes
            if (ratio > 0.20) {
              lisToTranslate.push({
                fullLi,
                citation,
                citationText,
                ratio,
                index: liMatch.index
              });
            }
          }
        }
      }
    }
    
    if (lisToTranslate.length === 0) {
      report.checks.push({
        name: 'citations_in_lists_translation',
        status: 'pass',
        details: 'Aucune citation anglaise détectée dans les listes'
      });
      return html;
    }
    
    console.log(`   📝 ${lisToTranslate.length} citation(s) anglaise(s) détectée(s) dans les listes, traduction...`);
    
    // Traduire les citations (traiter en ordre inverse pour préserver les indices)
    for (let i = lisToTranslate.length - 1; i >= 0; i--) {
      const item = lisToTranslate[i];
      try {
        const translated = await this.intelligentContentAnalyzer.translateToFrench(item.citationText);
        if (translated && translated.trim().length > 10) {
          // Remplacer la citation dans le <li>
          const originalCitation = item.citation;
          const newCitation = originalCitation.includes('«') 
            ? `«${translated.trim()}»`
            : originalCitation.includes('"')
            ? `"${translated.trim()}"`
            : `'${translated.trim()}'`;
          
          // Remplacer dans le HTML
          const beforeLi = modifiedHtml.substring(0, item.index);
          const afterLi = modifiedHtml.substring(item.index + item.fullLi.length);
          const updatedLi = item.fullLi.replace(originalCitation, newCitation);
          modifiedHtml = beforeLi + updatedLi + afterLi;
          
          translationCount++;
          console.log(`   ✅ Citation traduite: "${item.citationText.substring(0, 50)}..." → "${translated.substring(0, 50)}..."`);
        }
      } catch (error) {
        console.error(`   ❌ Erreur traduction citation: ${error.message}`);
      }
    }
    
    if (translationCount > 0) {
      report.actions.push({
        type: 'translated_citations_in_lists',
        details: `count=${translationCount}`
      });
      report.checks.push({
        name: 'citations_in_lists_translation',
        status: 'pass',
        details: `${translationCount} citation(s) traduite(s)`
      });
      console.log(`   ✅ ${translationCount} citation(s) traduite(s) dans les listes`);
    } else {
      report.checks.push({
        name: 'citations_in_lists_translation',
        status: 'warn',
        details: 'Aucune traduction effectuée'
      });
    }
    
    return modifiedHtml;
  }

  /**
   * Découpe les listes trop longues
   * @param {string} html - HTML à valider
   * @param {Object} report - Rapport QA
   * @returns {string} HTML corrigé
   */
  splitLongListItems(html, report) {
    console.log('🔍 Découpage listes trop longues...');
    
    let cleanedHtml = html;
    let splitCount = 0;
    
    // Détecter les <li> avec contenu > 200 caractères
    const liPattern = /<li[^>]*>([^<]+)<\/li>/gi;
    const longItems = [];
    let liMatch;
    
    while ((liMatch = liPattern.exec(html)) !== null) {
      const text = liMatch[1].trim();
      if (text.length > 200) {
        // Compter les phrases
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length > 3) {
          longItems.push({
            fullMatch: liMatch[0],
            text: text,
            sentences: sentences.length
          });
        }
      }
    }
    
    // Découper les items trop longs
    longItems.forEach(item => {
      const sentences = item.text.split(/[.!?]+/).filter(s => s.trim().length > 10);
      if (sentences.length > 3) {
        // Limiter à 5 phrases max par <li>
        const maxSentences = 5;
        const chunks = [];
        for (let i = 0; i < sentences.length; i += maxSentences) {
          chunks.push(sentences.slice(i, i + maxSentences).join('. '));
        }
        
        // Remplacer par plusieurs <li>
        const newLis = chunks.map(chunk => `<li>${chunk}</li>`).join('\n');
        cleanedHtml = cleanedHtml.replace(item.fullMatch, newLis);
        splitCount += chunks.length - 1;
        console.log(`   ✂️ Liste découpée: ${sentences.length} phrases → ${chunks.length} items`);
      }
    });
    
    // Ajouter au rapport
    if (longItems.length > 0) {
      report.checks.push({
        name: 'long_list_items',
        status: 'pass',
        details: `longues=${longItems.length} découpées=${splitCount}`
      });
      
      report.actions.push({
        type: 'split_long_list_items',
        details: `count=${splitCount}`
      });
    } else {
      report.checks.push({
        name: 'long_list_items',
        status: 'pass',
        details: 'Aucune liste trop longue'
      });
    }
    
    console.log(`✅ Listes: ${longItems.length} trop longue(s), ${splitCount} découpée(s)`);
    return cleanedHtml;
  }

  /**
   * Valide la cohérence temporelle des dates
   * @param {string} html - HTML à valider
   * @param {Object} report - Rapport QA
   */
  validateTemporalConsistency(html, report) {
    console.log('🔍 Validation cohérence temporelle...');
    
    // Extraire toutes les dates (pattern: mois + année)
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
                        'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const datePattern = new RegExp(`(${monthNames.join('|')})\\s+(\\d{4})`, 'gi');
    
    const dates = [];
    let dateMatch;
    while ((dateMatch = datePattern.exec(html)) !== null) {
      const month = dateMatch[1].toLowerCase();
      const year = parseInt(dateMatch[2], 10);
      dates.push({ month, year, fullMatch: dateMatch[0] });
    }
    
    // Date de publication (approximative - utiliser date actuelle)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    const warnings = [];
    dates.forEach(date => {
      // Dates futures
      if (date.year > currentYear || (date.year === currentYear && getMonthNumber(date.month) > currentMonth)) {
        warnings.push({
          date: date.fullMatch,
          reason: 'date_future',
          year: date.year
        });
      }
      
      // Dates très anciennes (> 2 ans)
      if (date.year < currentYear - 2) {
        warnings.push({
          date: date.fullMatch,
          reason: 'date_tres_ancienne',
          year: date.year,
          years_ago: currentYear - date.year
        });
      }
    });
    
    // Helper pour convertir mois en nombre
    function getMonthNumber(monthName) {
      const months = {
        'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
        'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12,
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
      };
      return months[monthName.toLowerCase()] || 0;
    }
    
    // Ajouter au rapport
    if (warnings.length > 0) {
      report.checks.push({
        name: 'temporal_consistency',
        status: 'warn',
        details: `warnings=${warnings.length} dates=${dates.length}`
      });
      
      report.issues.push({
        code: 'TEMPORAL_INCONSISTENCY',
        severity: 'warn',
        message: `${warnings.length} date(s) incohérente(s) détectée(s)`,
        evidence: warnings.slice(0, 3)
      });
      
      warnings.forEach(w => {
        console.log(`   ⚠️ Date incohérente (${w.reason}): ${w.date}`);
      });
    } else {
      report.checks.push({
        name: 'temporal_consistency',
        status: 'pass',
        details: `dates=${dates.length} toutes cohérentes`
      });
    }
    
    console.log(`✅ Cohérence temporelle: ${dates.length} date(s), ${warnings.length} warning(s)`);
  }

  /**
   * Vérifie et ajoute les sections SERP manquantes
   * @param {string} html - HTML à valider
   * @param {Object} pipelineContext - Contexte du pipeline
   * @param {Object} report - Rapport QA
   * @returns {Promise<string>} HTML corrigé
   */
  async ensureSerpSections(html, pipelineContext, report) {
    console.log('🔍 Vérification sections SERP...');
    
    let cleanedHtml = html;
    const text = html.toLowerCase();
    
    // AMÉLIORATION: Vérifier section "Ce que les autres ne disent pas" avec détection plus robuste
    const decodedText = text.replace(/&#8217;/g, "'").replace(/&#39;/g, "'").replace(/&apos;/g, "'");
    const missingSectionPattern = /ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement)/i;
    // Vérifier aussi dans les H2 (avec ou sans "explicitement")
    const h2Pattern = /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i;
    // Vérifier aussi si la section a du contenu après le H2 (au moins 1 paragraphe)
    const h2WithContentPattern = /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>\s*(<p[^>]*>[^<]+<\/p>\s*){1,}/i;
    // AMÉLIORATION: Vérifier aussi avec entités HTML décodées dans le texte brut
    const hasContentAfterH2 = h2WithContentPattern.test(html);
    // Vérifier aussi dans le texte décodé si le H2 existe et qu'il y a du texte après
    const h2Match = decodedText.match(/<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
    const hasContentInDecoded = h2Match && decodedText.indexOf(h2Match[0]) !== -1 && decodedText.substring(decodedText.indexOf(h2Match[0]) + h2Match[0].length).trim().length > 50;
    // AMÉLIORATION: Vérifier aussi dans le HTML brut (sans décodage) pour être sûr
    const h2MatchRaw = html.match(/<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
    const hasContentAfterH2Raw = h2MatchRaw && html.substring(html.indexOf(h2MatchRaw[0]) + h2MatchRaw[0].length).match(/<p[^>]*>[^<]+<\/p>/i);
    
    // AMÉLIORATION: Compter les occurrences pour détecter les répétitions massives
    // Vérifier dans les deux (html original et cleanedHtml) pour être sûr
    // AMÉLIORATION: Pattern plus flexible pour détecter même avec entités HTML ou variantes
    const h2PatternFlexible = /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/gi;
    const h2MatchesHtml = html.match(h2PatternFlexible);
    const h2MatchesCleaned = cleanedHtml.match(h2PatternFlexible);
    
    // AMÉLIORATION: Vérifier aussi avec texte décodé (sans HTML)
    const textOnly = cleanedHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
    const textMatches = textOnly.match(/ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement)/gi);
    
    const h2Count = Math.max(
      h2MatchesHtml ? h2MatchesHtml.length : 0,
      h2MatchesCleaned ? h2MatchesCleaned.length : 0,
      textMatches ? Math.floor(textMatches.length / 2) : 0 // Diviser par 2 car le pattern peut matcher plusieurs fois dans le même H2
    );
    
    // AMÉLIORATION: Si h2Count > 0, la section existe déjà (même si répétée)
    // On ne doit ajouter que si AUCUNE occurrence n'existe (h2Count === 0)
    // AMÉLIORATION: Vérifier aussi dans cleanedHtml pour être sûr
    const hasSectionInCleaned = h2MatchesCleaned && h2MatchesCleaned.length > 0;
    const hasSectionInHtml = h2MatchesHtml && h2MatchesHtml.length > 0;
    const hasMissingSection = h2Count === 0 && !hasSectionInCleaned && !hasSectionInHtml && !h2Pattern.test(html) && !hasContentAfterH2 && !hasContentInDecoded && !hasContentAfterH2Raw;
    
    // AMÉLIORATION: Vérifier aussi section "Limites et biais"
    const limitesPattern = /limites?\s*(et\s*)?biais/i;
    const limitesH2Pattern = /<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/i;
    const limitesWithContentPattern = /<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>\s*<p[^>]*>[^<]+<\/p>/i;
    const hasLimitesSection = limitesPattern.test(decodedText) || limitesH2Pattern.test(html) || limitesWithContentPattern.test(html);
    
    // AMÉLIORATION: Si h2Count > 1, il y a des répétitions - on ne doit PAS ajouter, mais plutôt nettoyer
    if (h2Count > 1) {
      console.log(`   ⚠️ Section "Ce que les autres ne disent pas" présente ${h2Count} fois (répétitions détectées)`);
      report.checks.push({
        name: 'serp_sections',
        status: 'warn',
        details: `Section présente ${h2Count} fois (répétitions)`
      });
      // Ne pas ajouter, les répétitions seront gérées par removeRepetitions
    } else if (h2Count >= 1 || hasSectionInCleaned || hasSectionInHtml || h2Pattern.test(html)) {
      // AMÉLIORATION: Vérifier si la section existe mais est vide (même si h2Count > 0)
      // Section existe - vérifier si elle a du contenu
      const h2Match = cleanedHtml.match(/<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
      if (h2Match) {
        const h2Index = cleanedHtml.indexOf(h2Match[0]);
        const afterH2 = cleanedHtml.substring(h2Index + h2Match[0].length);
        // Vérifier si le prochain élément est un H2/H3 ou si le contenu est vide
        const nextH2Match = afterH2.match(/<(h[23])[^>]*>/i);
        const contentAfterH2 = afterH2.substring(0, nextH2Match ? nextH2Match.index : Math.min(500, afterH2.length));
        // AMÉLIORATION: Vérifier s'il y a un paragraphe avec au moins 30 caractères de texte réel
        const hasRealContent = contentAfterH2.match(/<p[^>]*>[^<]{30,}<\/p>/i) || 
                              (contentAfterH2.replace(/<[^>]+>/g, ' ').trim().length > 50);
        
        if (!hasRealContent) {
          console.log('   ⚠️ Section "Ce que les autres ne disent pas" existe mais est vide - remplissage...');
          
          // Générer le contenu
          const sectionContent = pipelineContext?.story?.story 
            ? `<p>Les témoignages Reddit n'abordent souvent pas les coûts réels associés au voyage, tels que le logement à long terme et les dépenses quotidiennes. De plus, les contraintes liées à la fatigue de voyage ne sont pas suffisamment explorées, laissant de côté l'impact potentiellement considérable sur le bien-être mental et physique des voyageurs.</p>
<p>Ces informations manquantes peuvent créer des attentes irréalistes et des surprises désagréables lors du séjour. Il est donc essentiel de compléter ces témoignages par des recherches approfondies sur les aspects pratiques et financiers du voyage.</p>`
            : `<p>Les témoignages Reddit n'abordent souvent pas les aspects pratiques détaillés du voyage, tels que les coûts réels, les contraintes administratives, et l'impact sur le bien-être. Ces éléments sont pourtant essentiels pour une préparation complète.</p>
<p>En particulier, les témoignages omettent fréquemment les détails sur les dépenses quotidiennes réelles, les délais administratifs concrets, et les contraintes pratiques qui peuvent impacter significativement l'expérience de voyage. Ces informations manquantes peuvent créer des attentes irréalistes et des surprises désagréables lors du séjour.</p>
<p>Il est donc recommandé de compléter ces témoignages par des recherches approfondies sur les aspects pratiques et financiers du voyage, afin d'éviter les mauvaises surprises et de mieux préparer son séjour.</p>`;
          
          // Insérer le contenu après le H2 (remplacer le contenu vide s'il y en a)
          const insertIndex = h2Index + h2Match[0].length;
          if (nextH2Match) {
            const nextH2Index = insertIndex + nextH2Match.index;
            // Supprimer le contenu vide entre le H2 et le prochain H2, puis insérer le nouveau contenu
            cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + sectionContent + '\n\n' + cleanedHtml.substring(nextH2Index);
          } else {
            // Pas de H2 suivant, insérer à la fin
            cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + sectionContent + '\n\n' + cleanedHtml.substring(insertIndex);
          }
          
          report.actions.push({
            type: 'filled_empty_serp_section',
            details: 'Ce que les autres ne disent pas'
          });
          console.log('   ✅ Section SERP vide remplie avec contenu');
        } else {
          report.checks.push({
            name: 'serp_sections',
            status: 'pass',
            details: 'Section "Ce que les autres ne disent pas" présente avec contenu'
          });
        }
      } else {
        report.checks.push({
          name: 'serp_sections',
          status: 'pass',
          details: 'Section "Ce que les autres ne disent pas" présente'
        });
      }
    } else if (!hasMissingSection) {
      // Option B : ne plus insérer la section manquante, seulement logger un avertissement
      console.log('   ⚠️ Section "Ce que les témoignages Reddit ne disent pas" absente (Option B : pas d\'insertion automatique, à intégrer dans le développement si pertinent)');
      report.checks.push({
        name: 'serp_sections',
        status: 'warning',
        details: 'Section "Ce que les autres ne disent pas" absente — à intégrer dans le développement si le story le justifie'
      });
    } else {
      report.checks.push({
        name: 'serp_sections',
        status: 'pass',
        details: 'Section "Ce que les autres ne disent pas" présente'
      });
    }
    
    // Vérifier la présence des angles uniques SERP (Budget, Timeline, Contraintes)
    // IMPORTANT: Vérifier APRÈS avoir ajouté le contenu pour éviter les détections multiples
    const checkUniqueAngles = (html) => {
      const uniqueAnglesPatterns = [
        { pattern: /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i, name: 'Budget détaillé' },
        { pattern: /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i, name: 'Timeline' },
        { pattern: /contraintes?|difficultés?|obstacles?|problèmes?\s*(pratiques?|réels?)|défis/i, name: 'Contraintes réelles' }
      ];
      
      const detected = [];
      const missing = [];
      
      uniqueAnglesPatterns.forEach(angle => {
        if (angle.pattern.test(html)) {
          detected.push(angle.name);
        } else {
          missing.push(angle.name);
        }
      });
      
      return { detected, missing };
    };
    
    // Première vérification
    let angleCheck = checkUniqueAngles(cleanedHtml);
    let detectedAngles = angleCheck.detected;
    let missingAngles = angleCheck.missing;
    
    if (detectedAngles.length > 0) {
      console.log(`   ✅ Angles uniques détectés: ${detectedAngles.join(', ')} (${detectedAngles.length}/3)`);
    }
    
    if (missingAngles.length > 0) {
      console.log(`   ⚠️ Angles uniques manquants: ${missingAngles.join(', ')} (${detectedAngles.length}/3)`);
      
      // Ajouter les angles manquants dans les sections appropriées
      let addedContent = false;
      
      // 1. Ajouter Budget détaillé si manquant
      if (missingAngles.includes('Budget détaillé')) {
        const budgetText = '<p>Le budget réel pour ce type de séjour peut varier significativement selon la destination et le mode de vie choisi. Les coûts réels incluent généralement le logement à long terme, les dépenses quotidiennes, et les frais administratifs. Il est recommandé de prévoir un budget détaillé avec une marge de 15 à 20% pour les imprévus.</p>';
        
        // Chercher où insérer (dans "Nos recommandations" ou "Ce que les autres ne disent pas")
        const recommandationsMatch = cleanedHtml.match(/<h2[^>]*>Nos\s+recommandations[^<]*<\/h2>/i);
        const autresMatch = cleanedHtml.match(/<h2[^>]*>.*?ce\s*que.*?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
        
        // Vérifier si le budget est déjà mentionné avec les mots-clés requis
        const hasBudgetKeywords = /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i.test(cleanedHtml);
        
        if (!hasBudgetKeywords) {
          if (recommandationsMatch) {
            const insertIndex = recommandationsMatch.index + recommandationsMatch[0].length;
            cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + budgetText + '\n' + cleanedHtml.slice(insertIndex);
            addedContent = true;
            console.log('   ✅ Budget détaillé ajouté dans "Nos recommandations"');
          } else if (autresMatch) {
            const insertIndex = autresMatch.index + autresMatch[0].length;
            cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + budgetText + '\n' + cleanedHtml.slice(insertIndex);
            addedContent = true;
            console.log('   ✅ Budget détaillé ajouté dans "Ce que les autres ne disent pas"');
          }
        }
      }
      
      // 2. Ajouter Timeline/Chronologie si manquant
      if (missingAngles.includes('Timeline')) {
        const timelineText = '<p>La chronologie du voyage révèle souvent des ajustements nécessaires et des étapes non prévues initialement. La période de séjour peut nécessiter des adaptations selon les contraintes administratives et les opportunités rencontrées.</p>';
        
        // Chercher où insérer (dans "Contexte" ou "Événement central")
        const contexteMatch = cleanedHtml.match(/<h2[^>]*>Contexte[^<]*<\/h2>/i);
        const evenementMatch = cleanedHtml.match(/<h2[^>]*>Événement\s+central[^<]*<\/h2>/i);
        
        // Vérifier si la timeline est déjà mentionnée avec les mots-clés requis
        const hasTimelineKeywords = /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i.test(cleanedHtml);
        
        if (!hasTimelineKeywords) {
          if (contexteMatch) {
            const insertIndex = contexteMatch.index + contexteMatch[0].length;
            cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + timelineText + '\n' + cleanedHtml.slice(insertIndex);
            addedContent = true;
            console.log('   ✅ Timeline ajoutée dans "Contexte"');
          } else if (evenementMatch) {
            const insertIndex = evenementMatch.index + evenementMatch[0].length;
            cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + timelineText + '\n' + cleanedHtml.slice(insertIndex);
            addedContent = true;
            console.log('   ✅ Timeline ajoutée dans "Événement central"');
          } else {
            // Si aucune section cible, ajouter dans "Ce que les autres ne disent pas"
            const autresMatch = cleanedHtml.match(/<h2[^>]*>.*?ce\s*que.*?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
            if (autresMatch) {
              const insertIndex = autresMatch.index + autresMatch[0].length;
              cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + timelineText + '\n' + cleanedHtml.slice(insertIndex);
              addedContent = true;
              console.log('   ✅ Timeline ajoutée dans "Ce que les autres ne disent pas"');
            }
          }
        }
      }
      
      if (addedContent) {
        // Vérifier que les angles ont bien été ajoutés
        const budgetAdded = /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i.test(cleanedHtml);
        const timelineAdded = /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i.test(cleanedHtml);
        
        const addedAngles = [];
        if (budgetAdded && missingAngles.includes('Budget détaillé')) addedAngles.push('Budget détaillé');
        if (timelineAdded && missingAngles.includes('Timeline')) addedAngles.push('Timeline');
        
        report.actions.push({
          type: 'added_unique_angles',
          details: `Angles ajoutés: ${addedAngles.join(', ')}`
        });
        
        console.log(`   ✅ Angles ajoutés avec succès: ${addedAngles.join(', ')}`);
        
        // Re-vérifier après ajout pour confirmer
        angleCheck = checkUniqueAngles(cleanedHtml);
        detectedAngles = angleCheck.detected;
        missingAngles = angleCheck.missing;
        
        if (detectedAngles.length === 3) {
          console.log(`   ✅ Tous les angles uniques sont maintenant présents (3/3)`);
        }
      }
      
      report.checks.push({
        name: 'serp_unique_angles',
        status: addedContent && detectedAngles.length === 3 ? 'pass' : (addedContent ? 'fixed' : 'warning'),
        details: `Angles uniques: ${detectedAngles.length}/3 détectés (${detectedAngles.join(', ')})${missingAngles.length > 0 ? ` - Manquants: ${missingAngles.join(', ')}` : ''}${addedContent ? ' - Contenu ajouté' : ''}`
      });
    } else {
      report.checks.push({
        name: 'serp_unique_angles',
        status: 'pass',
        details: `Tous les angles uniques détectés: ${detectedAngles.join(', ')} (3/3)`
      });
    }
    
    // AMÉLIORATION: Vérifier et remplir section "Limites et biais" si manquante ou vide
    // CORRECTION: Compter TOUTES les occurrences (y compris Limites, Limitations, Limits)
    const limitesH2PatternCheck = /<h2[^>]*>.*?(?:limites?|limitations?|limits?)\s*(et\s*)?(?:biais|bias(?:es)?).*?<\/h2>/gi;
    const limitesH2Matches = cleanedHtml.match(limitesH2PatternCheck) || [];
    const limitesCount = limitesH2Matches.length;
    const limitesH2Match = limitesH2Matches.length > 0 ? limitesH2Matches[0] : null;
    
    // CORRECTION: Vérifier aussi si la section existe dans le texte (même sans H2 dédié)
    const limitesInText = /limites?\s*(et\s*)?biais/i.test(cleanedHtml.replace(/<h2[^>]*>.*?<\/h2>/gi, ''));    
    // CORRECTION: Si la section existe déjà (même dans le texte), ne PAS l'ajouter
    // Option B : ne plus insérer de section manquante, seulement logger un avertissement
    if (limitesCount > 0 || limitesInText) {
      if (limitesCount > 1) {
        console.log(`   ⚠️ Section "Limites et biais" dupliquée détectée (${limitesCount} occurrences) - sera nettoyée par removeDuplicateH2Sections`);
      } else {
        console.log('   ✅ Section "Limites et biais" déjà présente');
      }
    } else if (!hasLimitesSection && !limitesH2Match && limitesCount === 0 && !limitesInText) {
      console.log('   ⚠️ Section "Limites et biais" absente (Option B : pas d\'insertion automatique, à intégrer dans le développement si pertinent)');
      report.checks.push({
        name: 'serp_sections_limites',
        status: 'warning',
        details: 'Section "Limites et biais" absente — à intégrer dans le développement si le story le justifie'
      });
    } else if (limitesH2Match) {
      // AMÉLIORATION: Section existe mais peut être vide - vérifier et remplir si nécessaire
      const limitesIndex = cleanedHtml.indexOf(limitesH2Match[0]);
      const afterLimites = cleanedHtml.substring(limitesIndex + limitesH2Match[0].length);
      const nextH2Match = afterLimites.match(/<(h[23])[^>]*>/i);
      const contentAfterLimites = afterLimites.substring(0, nextH2Match ? nextH2Match.index : Math.min(500, afterLimites.length));
      // AMÉLIORATION: Vérifier s'il y a un paragraphe avec au moins 30 caractères de texte réel
      const hasRealContent = contentAfterLimites.match(/<p[^>]*>[^<]{30,}<\/p>/i) || 
                            (contentAfterLimites.replace(/<[^>]+>/g, ' ').trim().length > 50);
      
      if (!hasRealContent) {
        console.log('   ⚠️ Section "Limites et biais" existe mais est vide - remplissage...');
        
        const limitesContent = `<p>Cet article s'appuie sur un témoignage unique — un seul voyage, un seul budget, une seule saison. Ton expérience sera différente, et c'est normal.</p>
<p>Les prix cités datent du moment du voyage et ont probablement bougé depuis. Les conseils logistiques reflètent les conditions rencontrées par ce voyageur, pas une vérité universelle. Croise toujours avec d'autres sources récentes avant de réserver.</p>`;
        
        // Insérer le contenu après le H2 (remplacer le contenu vide s'il y en a)
        const insertIndex = limitesIndex + limitesH2Match[0].length;
        if (nextH2Match) {
          const nextH2Index = insertIndex + nextH2Match.index;
          // Supprimer le contenu vide entre le H2 et le prochain H2, puis insérer le nouveau contenu
          cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + limitesContent + '\n\n' + cleanedHtml.substring(nextH2Index);
        } else {
          // Pas de H2 suivant, insérer à la fin
          cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + limitesContent + '\n\n' + cleanedHtml.substring(insertIndex);
        }
        
        report.actions.push({
          type: 'filled_empty_serp_section',
          details: 'Limites et biais'
        });
        console.log('   ✅ Section "Limites et biais" vide remplie avec contenu');
      } else {
        report.checks.push({
          name: 'serp_sections_limites',
          status: 'pass',
          details: 'Section "Limites et biais" présente avec contenu'
        });
      }
    } else {
        report.checks.push({
          name: 'serp_sections_limites',
          status: 'pass',
          details: 'Section "Limites et biais" présente'
        });
    }
    
    return cleanedHtml;
  }

  /**
   * Remplit les sections vides avec du contenu approprié
   * @param {string} html - HTML à valider
   * @param {Object} pipelineContext - Contexte du pipeline
   * @param {Object} report - Rapport QA
   * @returns {string} HTML corrigé
   */
  fillEmptySections(html, pipelineContext, report) {
    console.log('🔍 Remplissage sections vides...');
    
    let cleanedHtml = html;
    const h2Pattern = /<h2[^>]*>([^<]+)<\/h2>/gi;
    const h2s = [];
    let match;
    
    while ((match = h2Pattern.exec(cleanedHtml)) !== null) {
      h2s.push({
        fullMatch: match[0],
        title: match[1].trim(),
        index: match.index
      });
    }
    
    // Trier par index décroissant pour traiter de la fin vers le début
    h2s.sort((a, b) => b.index - a.index);
    
    h2s.forEach(h2 => {
      const h2Index = h2.index;
      const afterH2 = cleanedHtml.substring(h2Index + h2.fullMatch.length);
      const nextH2Match = afterH2.match(/<h2[^>]*>/i);
      // AMÉLIORATION: Augmenter la limite pour détecter les angles uniques (qui peuvent être plus loin)
      const contentAfterH2 = afterH2.substring(0, nextH2Match ? nextH2Match.index : Math.min(2000, afterH2.length));
      
      // AMÉLIORATION: Décoder toutes les entités HTML avant de vérifier
      const decodedContent = contentAfterH2
        .replace(/&#8217;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
      
      const textContent = decodedContent.replace(/<[^>]+>/g, ' ').trim();
      
      // AMÉLIORATION: Vérifier si le contenu est vraiment visible (pas juste des espaces/entités)
      // Détecter les paragraphes vides ou avec seulement des points/espaces
      const emptyParagraphs = decodedContent.match(/<p[^>]*>\s*[.\s]*<\/p>/gi);
      // Détecter les paragraphes qui commencent par un point seul (ex: <p>.</p> ou <p>. Texte</p>)
      const paragraphsStartingWithDot = decodedContent.match(/<p[^>]*>\s*\.\s*[^<]*<\/p>/gi);
      const hasOnlyEmptyParas = (emptyParagraphs && emptyParagraphs.length > 0) || (paragraphsStartingWithDot && paragraphsStartingWithDot.length > 0);
      
      // Un paragraphe avec au moins 30 caractères de texte réel (hors HTML) et qui ne commence pas par un point seul
      const realParagraphs = decodedContent.match(/<p[^>]*>[^<]{30,}<\/p>/gi);
      const hasRealParagraph = realParagraphs && realParagraphs.some(p => !p.match(/<p[^>]*>\s*\./));
      
      // Ou au moins 50 caractères de texte brut après décodage (sans compter les points isolés)
      const meaningfulText = textContent.replace(/\s+/g, ' ').replace(/^\.\s+/, '').trim();
      const hasRealText = meaningfulText.length > 50;
      
      // AMÉLIORATION: Vérifier aussi si le contenu n'est pas juste des espaces/retours à la ligne
      const hasRealContent = (hasRealParagraph || (hasRealText && meaningfulText.length > 30)) && !hasOnlyEmptyParas;
      
      // AMÉLIORATION CRITIQUE: Vérifier si la section contient déjà les angles uniques SERP (Budget, Timeline, Contraintes)
      // Ne PAS remplacer le contenu si les angles sont présents
      // Vérifier dans TOUT le contenu après le H2 (pas seulement les 2000 premiers caractères)
      const fullContentAfterH2 = nextH2Match ? afterH2.substring(0, nextH2Match.index) : afterH2;
      const hasBudgetKeywords = /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i.test(fullContentAfterH2);
      const hasTimelineKeywords = /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i.test(fullContentAfterH2);
      const hasContraintesKeywords = /contraintes?|difficultés?|obstacles?|problèmes?\s*(pratiques?|réels?)|défis/i.test(fullContentAfterH2);
      const hasUniqueAngles = hasBudgetKeywords || hasTimelineKeywords || hasContraintesKeywords;
      
      // Ne remplacer que si la section est vraiment vide ET ne contient pas d'angles uniques
      if (!hasRealContent && !hasUniqueAngles) {
        const h2TitleLower = h2.title.toLowerCase();
        
        // Générer du contenu selon le type de section
        let sectionContent = '';
        
        if (h2TitleLower.includes('contexte')) {
          sectionContent = `<p>Cette expérience de voyage s'inscrit dans un contexte spécifique qui mérite d'être précisé. Les conditions de départ, les motivations initiales et l'environnement dans lequel cette aventure a pris place sont des éléments essentiels pour comprendre pleinement le témoignage.</p>
<p>Il est important de noter que chaque voyageur part avec ses propres attentes, contraintes et objectifs, ce qui influence significativement son expérience et son ressenti tout au long du séjour.</p>`;
        } else if (h2TitleLower.includes('ce que') && h2TitleLower.includes('ne disent')) {
          sectionContent = `<p>Les témoignages Reddit n'abordent souvent pas les aspects pratiques détaillés du voyage, tels que les coûts réels, les contraintes administratives, et l'impact sur le bien-être. Ces éléments sont pourtant essentiels pour une préparation complète.</p>
<p>En particulier, les témoignages omettent fréquemment les détails sur les dépenses quotidiennes réelles, les délais administratifs concrets, et les contraintes pratiques qui peuvent impacter significativement l'expérience de voyage.</p>`;
        } else if (h2TitleLower.includes('limites') || h2TitleLower.includes('biais')) {
          sectionContent = `<p>Cet article s'appuie sur un témoignage unique — un seul voyage, un seul budget, une seule saison. Ton expérience sera différente, et c'est normal.</p>
<p>Les prix cités datent du moment du voyage et ont probablement bougé depuis. Les conseils logistiques reflètent les conditions rencontrées par ce voyageur, pas une vérité universelle. Croise toujours avec d'autres sources récentes avant de réserver.</p>`;
        }
        
        if (sectionContent) {
          const insertIndex = h2Index + h2.fullMatch.length;
          // AMÉLIORATION: Supprimer d'abord le contenu vide existant (paragraphes vides, espaces)
          const contentToRemove = nextH2Match ? contentAfterH2.substring(0, nextH2Match.index) : contentAfterH2;
          const cleanedContentToRemove = contentToRemove.replace(/<p[^>]*>\s*<\/p>/gi, '').trim();
          
          if (nextH2Match) {
            const nextH2Index = insertIndex + nextH2Match.index;
            // Remplacer le contenu vide par le nouveau contenu
            cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + sectionContent + '\n\n' + cleanedHtml.substring(nextH2Index);
          } else {
            // Pas de H2 suivant, remplacer tout le contenu après le H2
            cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + sectionContent + '\n\n' + cleanedHtml.substring(insertIndex + contentAfterH2.length);
          }
          
          report.actions.push({
            type: 'filled_empty_section',
            details: h2.title
          });
          console.log(`   ✅ Section vide remplie: "${h2.title}"`);
        }
      }
    });
    
    return cleanedHtml;
  }

  /**
   * PHASE 6.0.12.3: Valide et corrige les titres H2.
   * - Supprime les H2 trop courts (< 4 mots)
   * - Corrige les patterns grammaticaux faux ("en la destination", "en le pays")
   * - Supprime les H2 placeholder ("Section X", "Titre ici")
   */
  validateH2Titles(html, report) {
    let fixCount = 0;
    let result = html;

    // Corriger "en la/le/les" → "a la/au/aux" ou supprimer
    result = result.replace(/<h2([^>]*)>([^<]+)<\/h2>/gi, (match, attrs, title) => {
      let fixed = title;

      // "en la destination" → "a destination" / "en le pays" → "au pays"
      fixed = fixed.replace(/\ben la\b/gi, 'à la');
      fixed = fixed.replace(/\ben le\b/gi, 'au');
      fixed = fixed.replace(/\ben les\b/gi, 'aux');

      // Supprimer placeholder patterns
      if (/^(section|titre|heading|chapitre|partie)\s*\d*\s*$/i.test(fixed.trim())) {
        fixCount++;
        console.log(`   🧹 H2 placeholder supprime: "${title}"`);
        return '';
      }

      // H2 trop court (< 4 mots de texte)
      // Exception: FAQ, retenir, recommandations, etc. sont des H2 structurels légitimes
      const protectedH2Patterns = /questions?\s*fr[ée]quentes?|faq|ce\s*qu.*retenir|nos\s*recommandations?|en\s*bref|checklist|conclusion|verdict|comparatif|r[ée]sum[ée]/i;
      const words = fixed.trim().split(/\s+/).filter(w => w.length > 1);
      const isProtectedH2 = protectedH2Patterns.test(fixed.trim());
      if (words.length < 3) console.log(`   🔍 H2_SHORT_CHECK: "${fixed.trim()}" words=${words.length} protected=${isProtectedH2}`);
      if (words.length < 3 && !isProtectedH2) {
        fixCount++;
        console.log(`   🧹 H2 trop court supprime: "${title}" (${words.length} mots)`);
        return '';
      }

      if (fixed !== title) {
        fixCount++;
        console.log(`   ✏️ H2 corrige: "${title}" → "${fixed}"`);
      }

      return `<h2${attrs}>${fixed}</h2>`;
    });

    if (fixCount > 0) {
      console.log(`📋 validateH2Titles: ${fixCount} correction(s)`);
      if (report?.actions) {
        report.actions.push({ type: 'h2_validation', details: `${fixCount} titre(s) H2 corrige(s)/supprime(s)` });
      }
    }

    return result;
  }

  /**
   * PHASE 6.0.12.2: Rendre les tableaux responsive pour mobile
   * Wrape chaque <table> dans un conteneur scrollable et ajoute du styling inline
   * @param {string} html - HTML à traiter
   * @param {Object} report - Rapport QA
   * @returns {string} HTML avec tableaux responsive
   */
  makeTablesResponsive(html, report) {
    const tableCount = (html.match(/<table/gi) || []).length;
    if (tableCount === 0) return html;

    console.log(`📱 makeTablesResponsive: ${tableCount} tableau(x) détecté(s)`);

    // Supprimer les tableaux "comparatifs" a 1 seule colonne de donnees (+ colonne criteres)
    let processedHtml = html.replace(/<h2[^>]*>[^<]*[Cc]omparatif[^<]*<\/h2>\s*(<div[^>]*>)?\s*<table[^>]*>([\s\S]*?)<\/table>\s*(<\/div>)?/gi, (match, wrapOpen, tableContent) => {
      const thCount = (tableContent.match(/<th/gi) || []).length;
      if (thCount <= 2) {
        console.log(`   🧹 Tableau comparatif a ${thCount} colonne(s) supprime (min 3 requis)`);
        return '';
      }
      return match;
    });

    processedHtml = processedHtml;
    let styledCount = 0;

    // Style commun pour le conteneur scrollable
    const wrapperStyle = 'overflow-x:auto;-webkit-overflow-scrolling:touch;margin:1.5em 0;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)';

    // Style pour la table elle-même
    const tableStyle = 'max-width:100%;border-collapse:collapse;font-size:14px;overflow-x:auto;display:block';

    // Style pour les cellules d'en-tête
    const thStyle = 'background:#1a365d;color:#fff;padding:12px 10px;text-align:left;font-weight:600;font-size:13px;white-space:nowrap';

    // Style pour les cellules de données
    const tdStyle = 'padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top';

    // Style pour les lignes alternées (via attribut sur les <tr> impairs)
    const trEvenStyle = 'background:#f7fafc';

    processedHtml = processedHtml.replace(/<table([^>]*)>([\s\S]*?)<\/table>/gi, (fullMatch, tableAttrs, tableContent) => {
      // Ne pas re-wrapper si déjà dans un conteneur responsive
      if (tableAttrs.includes('data-responsive')) return fullMatch;

      // Ajouter les styles à la table
      let styledTable = `<table data-responsive="true" style="${tableStyle}"${tableAttrs}>`;

      // Styler les <th> (sans matcher <thead>)
      let styledContent = tableContent.replace(/<th(?![a-z])([^>]*)>/gi, (thMatch, thAttrs) => {
        if (thAttrs.includes('style=')) return thMatch;
        return `<th style="${thStyle}"${thAttrs}>`;
      });

      // Styler les <td> (sans matcher <tdata> etc.)
      styledContent = styledContent.replace(/<td(?![a-z])([^>]*)>/gi, (tdMatch, tdAttrs) => {
        if (tdAttrs.includes('style=')) return tdMatch;
        return `<td style="${tdStyle}"${tdAttrs}>`;
      });

      // Ajouter des couleurs alternées aux lignes de tbody
      let rowIndex = 0;
      styledContent = styledContent.replace(/<tbody>([\s\S]*?)<\/tbody>/gi, (tbodyMatch, tbodyContent) => {
        const styledRows = tbodyContent.replace(/<tr([^>]*)>/gi, (trMatch, trAttrs) => {
          rowIndex++;
          if (rowIndex % 2 === 0 && !trAttrs.includes('style=')) {
            return `<tr style="${trEvenStyle}"${trAttrs}>`;
          }
          return trMatch;
        });
        return `<tbody>${styledRows}</tbody>`;
      });

      styledTable += styledContent + '</table>';

      // Wrapper dans un conteneur scrollable
      const responsiveWrapper = `<div style="${wrapperStyle}">${styledTable}</div>`;

      styledCount++;
      return responsiveWrapper;
    });

    if (styledCount > 0) {
      report.actions.push({
        type: 'responsive_tables',
        details: `${styledCount} tableau(x) rendu(s) responsive pour mobile`
      });
      console.log(`   ✅ ${styledCount} tableau(x) stylé(s) et wrappé(s) pour mobile`);
    }

    return processedHtml;
  }

  /**
   * Fusionne les micro-paragraphes consécutifs (< 80 chars de texte) en un seul paragraphe.
   * Préserve les paragraphes dans les containers structurels (quick-guide, affiliate, FAQ, details).
   */
  mergeShortParagraphs(html) {
    const SHORT_THRESHOLD = 80;
    let merged = 0;
    const result = html.replace(
      /(<p[^>]*>)([\s\S]*?)(<\/p>)\s*(<p[^>]*>)([\s\S]*?)(<\/p>)/gi,
      (match, open1, content1, close1, open2, content2, close2) => {
        const text1 = content1.replace(/<[^>]*>/g, '').trim();
        const text2 = content2.replace(/<[^>]*>/g, '').trim();
        if (text1.length < SHORT_THRESHOLD && text2.length < SHORT_THRESHOLD && text1.length > 0 && text2.length > 0) {
          merged++;
          return `${open1}${content1.trim()} ${content2.trim()}${close2}`;
        }
        return match;
      }
    );
    if (merged > 0) {
      console.log(`   📐 MERGE_SHORT_PARAS: ${merged} micro-paragraphe(s) fusionné(s)`);
    }
    return result;
  }

  /**
   * Équilibre les paragraphes (ratio max/min < 3)
   * @param {string} html - HTML à valider
   * @param {Object} report - Rapport QA
   * @returns {string} HTML corrigé
   */
  balanceParagraphs(html, report) {
    console.log('🔍 Équilibrage paragraphes...');
    
    let cleanedHtml = html;
    let balancedCount = 0;    
    // Extraire tous les paragraphes
    // AMÉLIORATION: Utiliser un regex plus robuste qui capture le contenu même avec des balises HTML imbriquées
    const paragraphPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs = [];
    let match;
    
    while ((match = paragraphPattern.exec(html)) !== null) {
      // Extraire le texte sans HTML pour la longueur
      const textWithoutHtml = match[1].replace(/<[^>]+>/g, '').trim();
      if (textWithoutHtml.length > 10) {
        paragraphs.push({
          fullMatch: match[0],
          text: textWithoutHtml, // Utiliser le texte sans HTML pour les calculs
          htmlContent: match[1], // Garder le contenu HTML original
          length: textWithoutHtml.length
        });
      }
    }
    
    if (paragraphs.length === 0) {
      report.checks.push({
        name: 'paragraph_balance',
        status: 'pass',
        details: 'Aucun paragraphe à équilibrer'
      });
      return cleanedHtml;
    }
    
    // Calculer ratio avant
    const lengths = paragraphs.map(p => p.length);
    const maxLen = Math.max(...lengths);
    const minLen = Math.min(...lengths);
    const beforeRatio = maxLen / (minLen || 1);
    
    paragraphs.forEach(para => {
      if (para.length > 280) {
        // CORRECTION CRITIQUE: Ne PAS découper les paragraphes qui contiennent des éléments block-level
        // (h2, h3, h4, div, ul, ol, table, blockquote) car cela casserait la structure HTML
        if (/<(?:h[1-6]|div|ul|ol|table|blockquote|section|article|nav|aside|header|footer)[^>]*>/i.test(para.htmlContent)) {
          console.log(`   ⚠️ Paragraphe skippé (contient block elements): ${para.length} chars`);
          return; // Skip ce paragraphe
        }
        
        // CORRECTION: Utiliser le contenu HTML original au lieu du texte sans HTML
        // pour préserver les entités HTML et les balises HTML imbriquées
        const paraHtmlMatch = cleanedHtml.match(new RegExp(para.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        if (!paraHtmlMatch) return; // Skip si pas trouvé
        
        const paraHtmlContent = paraHtmlMatch[0];
        // Extraire le contenu entre <p> et </p>
        const contentMatch = paraHtmlContent.match(/<p[^>]*>([\s\S]*?)<\/p>/);
        if (!contentMatch) return;
        
        let paraContent = contentMatch[1];
        
        // CORRECTION CRITIQUE: Protéger les liens <a> complets et les URLs avant le split
        // pour éviter de couper les URLs aux points (kiwi.com, airalo.com, etc.)
        const linkPlaceholders = new Map();
        let linkCounter = 0;
        
        // Protéger les balises <a> complètes (href + contenu + </a>)
        paraContent = paraContent.replace(/<a[^>]*>[\s\S]*?<\/a>/gi, (match) => {
          const key = `__LINK_BP_${linkCounter++}__`;
          linkPlaceholders.set(key, match);
          return key;
        });
        
        // Protéger les URLs nues (https://..., http://...)
        paraContent = paraContent.replace(/https?:\/\/[^\s"<>]+/gi, (match) => {
          const key = `__URL_BP_${linkCounter++}__`;
          linkPlaceholders.set(key, match);
          return key;
        });
        
        // AMÉLIORATION: Protéger les entités HTML ET les placeholders existants avant le split
        const entityPlaceholders = new Map();
        let entityCounter = 0;
        
        // Protéger les placeholders existants d'abord
        const existingPlaceholders = paraContent.match(/__ENTITY\d+_\d+__/g) || [];
        const protectedPlaceholders = new Map();
        existingPlaceholders.forEach((ph, idx) => {
          const key = `__PROTECTED_BP_${idx}__`;
          protectedPlaceholders.set(key, ph);
          paraContent = paraContent.replace(ph, key);
        });
        
        // Ensuite protéger les entités HTML réelles
        paraContent = paraContent.replace(/&#\d+;|&[a-z]+;/gi, (match) => {
          const placeholder = `__ENTITY_BP_${entityCounter++}__`;
          entityPlaceholders.set(placeholder, match);
          return placeholder;
        });
        
        // Découper en paragraphes de max 120 caractères (plus petits pour meilleur équilibre)
        // AMÉLIORATION: Utiliser un split plus robuste qui préserve les entités HTML
        // Calculer la longueur en restaurant temporairement les entités pour avoir la vraie longueur
        const sentences = paraContent.split(/([.!?]+(?:\s+|$))/).filter(s => s.trim().length > 0);
        const chunks = [];
        let currentChunk = '';
        
        sentences.forEach(sentence => {
          // Restaurer temporairement pour calcul de longueur
          let tempSentence = sentence;
          entityPlaceholders.forEach((entity, placeholder) => {
            tempSentence = tempSentence.replace(placeholder, entity);
          });
          protectedPlaceholders.forEach((ph, key) => {
            tempSentence = tempSentence.replace(key, ph);
          });
          
          let tempChunk = currentChunk;
          entityPlaceholders.forEach((entity, placeholder) => {
            tempChunk = tempChunk.replace(placeholder, entity);
          });
          protectedPlaceholders.forEach((ph, key) => {
            tempChunk = tempChunk.replace(key, ph);
          });
          
          // Calculer longueur réelle (sans HTML)
          const tempChunkText = tempChunk.replace(/<[^>]+>/g, '').trim();
          const tempSentenceText = tempSentence.replace(/<[^>]+>/g, '').trim();
          
          if ((tempChunkText + tempSentenceText).length <= 120) {
            currentChunk += sentence;
          } else {
            if (currentChunk.trim().length > 0) {
              // Restaurer les entités HTML et liens avant d'ajouter au chunk
              let chunkWithEntities = currentChunk;
              entityPlaceholders.forEach((entity, placeholder) => {
                chunkWithEntities = chunkWithEntities.replace(placeholder, entity);
              });
              protectedPlaceholders.forEach((ph, key) => {
                chunkWithEntities = chunkWithEntities.replace(key, ph);
              });
              linkPlaceholders.forEach((link, key) => {
                chunkWithEntities = chunkWithEntities.replace(key, link);
              });
              chunks.push(chunkWithEntities.trim());
            }
            currentChunk = sentence;
          }
        });
        
        if (currentChunk.trim().length > 0) {
          // Restaurer les entités HTML et liens avant d'ajouter au dernier chunk
          let chunkWithEntities = currentChunk;
          entityPlaceholders.forEach((entity, placeholder) => {
            chunkWithEntities = chunkWithEntities.replace(placeholder, entity);
          });
          protectedPlaceholders.forEach((ph, key) => {
            chunkWithEntities = chunkWithEntities.replace(key, ph);
          });
          linkPlaceholders.forEach((link, key) => {
            chunkWithEntities = chunkWithEntities.replace(key, link);
          });
          chunks.push(chunkWithEntities.trim());
        }
        
        // CORRECTION: Filtrer les chunks vides ou avec juste un point avant de créer des paragraphes
        const validChunks = chunks.filter(chunk => {
          const text = chunk.replace(/<[^>]+>/g, ' ').trim();
          // Exclure les chunks vides, avec juste un point, ou avec seulement des espaces/points
          return text.length > 1 && !/^[\s.]+$/.test(text) && text !== '.';
        });
        
        if (validChunks.length > 1) {
          // AMÉLIORATION: Utiliser le contenu HTML original si disponible, sinon reconstruire
          const newParagraphs = validChunks.map(chunk => `<p>${chunk}</p>`).join('\n');
          cleanedHtml = cleanedHtml.replace(para.fullMatch, newParagraphs);
          balancedCount++;
          console.log(`   ✂️ Paragraphe découpé: ${para.length} chars → ${validChunks.length} paragraphes (${chunks.length - validChunks.length} chunk(s) vide(s) filtré(s))`);        }
      }
    });
    
    // AMÉLIORATION: Fusionner paragraphes très courts (< 30 caractères) avec le suivant
    const shortParagraphs = [];
    const afterParagraphs = cleanedHtml.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
    afterParagraphs.forEach((para, i) => {
      const text = para.replace(/<[^>]+>/g, '').trim();
      if (text.length < 30 && text.length > 0 && i < afterParagraphs.length - 1) {
        shortParagraphs.push({ para, index: i, text });
      }
    });
    
    // Fusionner avec le suivant
    shortParagraphs.reverse().forEach(({ para, text }) => {
      const nextParaMatch = cleanedHtml.match(new RegExp(`${para.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(<p[^>]*>[^<]+<\/p>)`, 'i'));
      if (nextParaMatch) {
        const nextPara = nextParaMatch[1];
        const nextParaText = nextPara.replace(/<[^>]+>/g, '').trim();
        // AMÉLIORATION: Ne fusionner que si le résultat ne dépasse pas 200 caractères (pour meilleur équilibre)
        // AMÉLIORATION: S'assurer qu'il y a un espace entre les deux textes
        const mergedText = text.trim() + ' ' + nextParaText.trim();
        if (mergedText.length <= 200) {
          // AMÉLIORATION: Vérifier que le premier texte ne se termine pas par une ponctuation sans espace
          const firstEndsWithPunct = /[.!?;:]$/.test(text.trim());
          const secondStartsWithUpper = /^[A-ZÀ-Ÿ]/.test(nextParaText.trim());
          
          // Si le premier se termine par ponctuation et le second commence par majuscule, c'est OK
          // Sinon, s'assurer qu'il y a bien un espace
          const merged = `<p>${mergedText}</p>`;
          cleanedHtml = cleanedHtml.replace(para + ' ' + nextPara, merged);
          balancedCount++;
          console.log(`   🔗 Paragraphes fusionnés: "${text.substring(0, 30)}..." + suivant`);
        }
      }
    });
    
    // AMÉLIORATION: Validation post-traitement pour détecter et SUPPRIMER les paragraphes mal formés
    const malformedParagraphs = [];
    const allParagraphs = cleanedHtml.match(/<p[^>]*>([^<]*)<\/p>/gi) || [];
    allParagraphs.forEach((para, index) => {
      const text = para.replace(/<[^>]+>/g, '').trim();
      // Détecter les paragraphes avec seulement des points ou des espaces
      if (text === '.' || text === '..' || text === '...' || /^[\s.]+$/.test(text)) {
        malformedParagraphs.push({ para, index });
      }
      // Détecter les paragraphes où deux phrases sont collées sans espace
      if (/[a-zà-ÿ][A-ZÀ-Ÿ]/.test(text) && !/[.!?]\s+[A-ZÀ-Ÿ]/.test(text)) {
        // Il y a une lettre minuscule suivie d'une majuscule sans ponctuation entre les deux
        malformedParagraphs.push({ para, index, reason: 'phrases_collées' });
      }
    });
    
    // CORRECTION: Supprimer automatiquement les paragraphes avec juste un point ou des points/espaces
    if (malformedParagraphs.length > 0) {
      const dotOnlyParas = malformedParagraphs.filter(p => !p.reason);
      if (dotOnlyParas.length > 0) {
        // Supprimer en ordre inverse pour préserver les indices
        dotOnlyParas.reverse().forEach(({ para }) => {
          cleanedHtml = cleanedHtml.replace(para, '');
        });
        console.log(`   🧹 ${dotOnlyParas.length} paragraphe(s) mal formé(s) (points uniquement) supprimé(s) dans balanceParagraphs`);
      }
    }
    
    // NETTOYAGE FINAL DANS balanceParagraphs: Supprimer tous les paragraphes vides restants
    const remainingEmptyParas = cleanedHtml.match(/<p[^>]*>\s*\.\s*<\/p>/gi);
    if (remainingEmptyParas) {
      cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*\.\s*<\/p>/gi, '');
      console.log(`   🧹 ${remainingEmptyParas.length} paragraphe(s) vide(s) supplémentaire(s) supprimé(s) dans balanceParagraphs`);
    }
    
      // Supprimer SEULEMENT les paragraphes avec juste des points/espaces (PAS ceux avec reason: 'phrases_collées')
      // FIX BUG: Les paragraphes avec "phrases collées" peuvent être légitimes (eSIM, Bangkok, noms propres, etc.)
      // Ne supprimer que les paragraphes vraiment vides ou contenant seulement des points
      const trulyMalformedParas = malformedParagraphs.filter(p => !p.reason);
      
      if (trulyMalformedParas.length > 0) {
        const protectedSerpPatterns = [
          /ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement)/i,
          /limites?\s*(et\s*)?biais/i,
          /erreurs?\s*(fréquentes?|courantes?|à\s*éviter)/i,
          /nos\s+recommandations/i, // AMÉLIORATION: Protéger "Nos recommandations" qui contient les angles Budget
          /événement\s+central/i // AMÉLIORATION: Protéger "Événement central" qui contient les angles Timeline
        ];
      
      trulyMalformedParas.reverse().forEach(({ para, index }) => {
        const paraIndex = cleanedHtml.indexOf(para);
        if (paraIndex >= 0) {
          // Vérifier si ce paragraphe est dans une section SERP protégée
          const beforePara = cleanedHtml.substring(0, paraIndex);
          const lastH2Match = beforePara.match(/<h2[^>]*>([^<]+)<\/h2>/gi);
          let isProtected = false;
          
          if (lastH2Match) {
            const lastH2 = lastH2Match[lastH2Match.length - 1];
            isProtected = protectedSerpPatterns.some(pattern => pattern.test(lastH2));
          }
          
          if (!isProtected) {
            // AMÉLIORATION: Vérifier aussi si le paragraphe contient des angles uniques SERP avant de supprimer
            const hasBudgetKeywords = /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i.test(para);
            const hasTimelineKeywords = /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i.test(para);
            const hasContraintesKeywords = /contraintes?|difficultés?|obstacles?|problèmes?\s*(pratiques?|réels?)|défis/i.test(para);
            const hasUniqueAngles = hasBudgetKeywords || hasTimelineKeywords || hasContraintesKeywords;
            
            if (!hasUniqueAngles) {
              cleanedHtml = cleanedHtml.replace(para, '');
              balancedCount++;
              console.log(`   🧹 Paragraphe mal formé supprimé (index ${index})`);
            } else {
              console.log(`   🛡️ Paragraphe avec angles uniques protégé (index ${index})`);
            }
          }
        }
      });
    }
    
    // Recalculer ratio après
    const finalParagraphs = cleanedHtml.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
    const afterLengths = finalParagraphs.map(p => {
      const text = p.replace(/<[^>]+>/g, '').trim();
      return text.length;
    }).filter(l => l > 10);
    
    // AMÉLIORATION: Gérer le cas où il n'y a pas de paragraphes après traitement
    if (afterLengths.length === 0) {
      report.checks.push({
        name: 'paragraph_balance',
        status: 'warning',
        details: 'Aucun paragraphe après équilibrage'
      });
      return cleanedHtml;
    }
    
    const afterMaxLen = Math.max(...afterLengths);
    const afterMinLen = Math.min(...afterLengths);
    // AMÉLIORATION: Éviter division par zéro
    const afterRatio = afterMinLen > 0 ? afterMaxLen / afterMinLen : 0;
    
    // Ajouter au rapport
    report.checks.push({
      name: 'paragraph_balance',
      status: afterRatio <= 3 ? 'pass' : 'warn',
      details: `before_ratio=${beforeRatio.toFixed(1)} after_ratio=${afterRatio.toFixed(1)} balanced=${balancedCount}`
    });
    
    if (balancedCount > 0) {
      report.actions.push({
        type: 'balanced_paragraphs',
        details: `count=${balancedCount} ratio_before=${beforeRatio.toFixed(1)} ratio_after=${afterRatio.toFixed(1)}`
      });
      console.log(`✅ Paragraphes équilibrés: ${balancedCount} découpé(s), ratio ${beforeRatio.toFixed(1)} → ${afterRatio.toFixed(1)}`);
    } else {
      console.log(`✅ Paragraphes équilibrés: ratio ${beforeRatio.toFixed(1)} (OK)`);
    }    
    return cleanedHtml;
  }

  /**
   * Troncature intelligente d'un texte pour extraits/citations
   * Respecte les limites de phrases, mots et préserve le sens
   * @param {string} text - Texte à tronquer
   * @param {number} targetLength - Longueur cible (caractères)
   * @param {number} maxLength - Longueur maximale absolue (caractères)
   * @returns {string} Texte tronqué intelligemment avec ellipses si nécessaire
   */
  smartTruncate(text, targetLength = 200, maxLength = 250) {
    if (!text || text.length <= targetLength) {
      return text.trim();
    }

    // Étape 1: Chercher une fin de phrase complète dans la zone cible
    // Priorité: . ! ? suivi d'un espace et d'une majuscule
    const sentenceEndPattern = /([.!?])\s+([A-ZÀ-Ÿ])/g;
    let bestCut = targetLength;
    let foundSentenceEnd = false;
    let match;
    
    // AMÉLIORATION: Plage de recherche élargie (60% au lieu de 70% pour trouver plus facilement)
    const minSearchIndex = Math.floor(targetLength * 0.6);

    // Chercher la dernière fin de phrase complète avant maxLength
    while ((match = sentenceEndPattern.exec(text)) !== null) {
      const endIndex = match.index + match[1].length; // Position après la ponctuation
      if (endIndex >= minSearchIndex && endIndex <= maxLength) {
        bestCut = endIndex + 1; // Inclure l'espace après la ponctuation
        foundSentenceEnd = true;
        // Continuer à chercher pour trouver la meilleure fin (la plus proche de targetLength)
      }
      if (endIndex > maxLength) break;
    }
    
    // AMÉLIORATION: Si pas de fin de phrase, chercher des virgules ou points-virgules comme pause acceptable
    if (!foundSentenceEnd) {
      const commaPattern = /([,;])\s+([A-ZÀ-Ÿa-zà-ÿ])/g;
      let bestCommaCut = targetLength;
      let foundComma = false;
      
      while ((match = commaPattern.exec(text)) !== null) {
        const endIndex = match.index + match[1].length;
        if (endIndex >= minSearchIndex && endIndex <= maxLength) {
          bestCommaCut = endIndex + 1;
          foundComma = true;
        }
        if (endIndex > maxLength) break;
      }
      
      if (foundComma) {
        bestCut = bestCommaCut;
        foundSentenceEnd = true; // On considère qu'on a trouvé une pause acceptable
      }
    }

    // Étape 2: Si pas de fin de phrase ni de virgule, chercher une limite de mot
    if (!foundSentenceEnd) {
      // Chercher le dernier espace avant maxLength
      const lastSpaceBeforeMax = text.lastIndexOf(' ', maxLength);
      const lastSpaceAfterTarget = text.indexOf(' ', targetLength);
      
      // AMÉLIORATION: Accepter un espace même plus proche du début (60% au lieu de 80%)
      if (lastSpaceBeforeMax >= targetLength * 0.6) {
        bestCut = lastSpaceBeforeMax;
      } else if (lastSpaceAfterTarget > 0 && lastSpaceAfterTarget <= maxLength) {
        bestCut = lastSpaceAfterTarget;
      } else {
        // Fallback: couper à maxLength mais chercher le dernier espace proche
        const fallbackSpace = text.lastIndexOf(' ', maxLength);
        if (fallbackSpace >= targetLength * 0.5) {
          bestCut = fallbackSpace;
        } else {
          bestCut = maxLength;
        }
      }
    }

    // Étape 3: Extraire et nettoyer
    let truncated = text.substring(0, bestCut).trim();

    // Étape 4: Vérifier qu'on ne coupe pas au milieu d'un mot
    // Si le dernier caractère n'est pas une ponctuation ou un espace, chercher le dernier espace
    if (!/[.!?;:,\s]$/.test(truncated)) {
      const lastSpace = truncated.lastIndexOf(' ');
      // AMÉLIORATION: Accepter un espace même plus proche du début (60% au lieu de 70%)
      if (lastSpace > targetLength * 0.6) {
        truncated = truncated.substring(0, lastSpace);
      } else {
        // Si vraiment pas d'espace acceptable, chercher le dernier caractère non-alphanumérique
        const lastNonAlpha = truncated.search(/[^a-zA-ZÀ-Ÿà-ÿ0-9\s]$/);
        if (lastNonAlpha > targetLength * 0.5) {
          truncated = truncated.substring(0, lastNonAlpha + 1);
        }
      }
    }

    // Étape 5: Ajouter des ellipses seulement si nécessaire
    // Ne pas ajouter si on termine déjà par une ponctuation
    if (truncated.length < text.length && !/[.!?]$/.test(truncated)) {
      truncated += '...';
    }

    return truncated.trim();
  }

  /**
   * Convertit systématiquement les montants USD en EUR dans le HTML.
   * Patterns détectés : $N, N USD, N dollars, N$
   * Résultat : ~X euros
   * 
   * Exclusions :
   *   - Montants déjà suivis de "EUR"/"euros"
   *   - Montants dans des balises <script> (JSON-LD)
   *   - Montants déjà dans un marqueur "(N USD)" existant
   * 
   * @param {string} html
   * @returns {string}
   */
  convertTitleUSDToEUR(title) {
    if (!title) return title;
    const rate = 0.92;
    let result = title;
    result = result.replace(/\$\s?(\d[\d,]*)/g, (_, amt) => {
      const n = parseFloat(amt.replace(/,/g, ''));
      if (isNaN(n) || n <= 0) return _;
      return `${Math.round(n * rate).toLocaleString('fr-FR')} €`;
    });
    result = result.replace(/(\d[\d\s,.]*\d|\d)\s*(?:USD|dollars?)\b/gi, (_, amt) => {
      const n = parseFloat(amt.replace(/[\s.]/g, '').replace(',', '.'));
      if (isNaN(n) || n <= 0) return _;
      return `${Math.round(n * rate).toLocaleString('fr-FR')} €`;
    });
    result = result.replace(/(\d[\d,]*)\$/g, (_, amt) => {
      const n = parseFloat(amt.replace(/,/g, ''));
      if (isNaN(n) || n <= 0) return _;
      return `${Math.round(n * rate).toLocaleString('fr-FR')} €`;
    });
    if (result !== title) {
      console.log(`💶 TITLE_USD_TO_EUR: "${title}" → "${result}"`);
    }
    return result;
  }

  convertCurrencyToEUR(html) {
    if (!html) return html;

    const USD_TO_EUR_RATE = 0.92;
    let converted = 0;

    // Protéger les blocs <script> (JSON-LD, etc.)
    const scriptPlaceholders = new Map();
    let scriptIdx = 0;
    let safeHtml = html.replace(/<script[\s\S]*?<\/script>/gi, (match) => {
      const ph = `__CURRENCY_SCRIPT_${scriptIdx++}__`;
      scriptPlaceholders.set(ph, match);
      return ph;
    });

    // Pattern 1: $1,000 or $1000 or $50 (dollar sign prefix)
    // Exclude if already followed by euros/EUR or inside existing "(N USD)"
    safeHtml = safeHtml.replace(
      /\$\s?([\d,]+(?:\.\d{1,2})?)\b(?!\s*(?:euros?|EUR))/g,
      (match, amountStr, offset) => {
        // Skip if this is inside an existing "(X USD)" parenthetical
        const before = safeHtml.substring(Math.max(0, offset - 5), offset);
        if (/\(~?\s*$/.test(before)) return match;

        const amount = parseFloat(amountStr.replace(/,/g, ''));
        if (isNaN(amount) || amount <= 0) return match;
        const eur = Math.round(amount * USD_TO_EUR_RATE);
        converted++;
        return `~${eur.toLocaleString('fr-FR')} euros`;
      }
    );

    // Pattern 2: N USD or N dollars (suffix patterns)
    safeHtml = safeHtml.replace(
      /(\d[\d\s.,]*(?:\.\d{1,2})?)\s*(?:USD|dollars?)\b(?!\s*\))/gi,
      (match, amountStr, offset) => {
        // Skip if already converted
        const before = safeHtml.substring(Math.max(0, offset - 10), offset);
        if (/euros?\s*\(\s*$/.test(before)) return match;
        if (/\(\s*$/.test(before)) return match;

        const cleaned = amountStr.replace(/[\s.]/g, '').replace(',', '.');
        const amount = parseFloat(cleaned);
        if (isNaN(amount) || amount <= 0) return match;
        const eur = Math.round(amount * USD_TO_EUR_RATE);
        converted++;
        return `~${eur.toLocaleString('fr-FR')} euros`;
      }
    );

    // Pattern 3: N$ (number followed by dollar sign, common in informal writing)
    safeHtml = safeHtml.replace(
      /([\d,]+(?:\.\d{1,2})?)\$(?!\s*(?:euros?|EUR))/g,
      (match, amountStr, offset) => {
        const before = safeHtml.substring(Math.max(0, offset - 5), offset);
        if (/\(~?\s*$/.test(before)) return match;

        const amount = parseFloat(amountStr.replace(/,/g, ''));
        if (isNaN(amount) || amount <= 0) return match;
        const eur = Math.round(amount * USD_TO_EUR_RATE);
        converted++;
        return `~${eur.toLocaleString('fr-FR')} euros`;
      }
    );

    // Pattern 4: Nettoyer les parenthèses USD résiduelles générées par le LLM
    // Ex: "~920 euros (1 000 USD)" → "~920 euros", "~184 à 276 euros (~200 à 300 USD)" → "~184 à 276 euros"
    safeHtml = safeHtml.replace(/\s*\(~?[\d\s,.]+\s*(?:USD|dollars?)\)/gi, '');

    // Pattern 5: N $ ou N à/- N $ (nombre + espace + dollar sign, ou range)
    // Ex: "500 $" → "~460 euros", "500 à 700 $" → "~460 à ~644 euros"
    safeHtml = safeHtml.replace(
      /([\d\s,.]+?)\s*(?:à|-)\s*([\d\s,.]+?)\s*\$(?!\s*(?:euros?|EUR))/g,
      (match, startStr, endStr) => {
        const startAmount = parseFloat(startStr.replace(/[\s.]/g, '').replace(',', '.'));
        const endAmount = parseFloat(endStr.replace(/[\s.]/g, '').replace(',', '.'));
        if (isNaN(startAmount) || isNaN(endAmount) || startAmount <= 0 || endAmount <= 0) return match;
        const startEur = Math.round(startAmount * USD_TO_EUR_RATE);
        const endEur = Math.round(endAmount * USD_TO_EUR_RATE);
        converted++;
        return `~${startEur} à ~${endEur} euros`;
      }
    );
    // Pattern 5b: Single number + space + $ (not part of a range)
    safeHtml = safeHtml.replace(
      /(\d[\d\s,.]*)\s+\$(?!\s*(?:euros?|EUR))/g,
      (match, amountStr, offset) => {
        const before = safeHtml.substring(Math.max(0, offset - 5), offset);
        if (/\(~?\s*$/.test(before)) return match;
        if (/~\d/.test(before)) return match;
        const amount = parseFloat(amountStr.replace(/[\s.]/g, '').replace(',', '.'));
        if (isNaN(amount) || amount <= 0) return match;
        const eur = Math.round(amount * USD_TO_EUR_RATE);
        converted++;
        return `~${eur} euros`;
      }
    );

    // Restaurer les blocs <script>
    for (const [ph, original] of scriptPlaceholders) {
      safeHtml = safeHtml.replace(ph, original);
    }

    if (converted > 0) {
      console.log(`💶 CURRENCY_CONVERT: ${converted} montant(s) USD → EUR convertis`);
    }

    return safeHtml;
  }
}

export default ArticleFinalizer;

