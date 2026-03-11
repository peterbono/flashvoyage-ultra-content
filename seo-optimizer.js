#!/usr/bin/env node

/**
 * SEO OPTIMIZER
 * Optimise le contenu HTML pour le SEO sans inventer de contenu
 * 
 * PHASE 8.1 - CONTRAT D'ENTRÉE EXPLICITE
 * ======================================
 * 
 * INPUTS ATTENDUS :
 * - html (string) : HTML de l'article à optimiser
 * - pipelineContext (Object) : Contexte du pipeline avec :
 *   - pipelineContext.story.extracted (Object) : Données extraites (source de vérité)
 *   - pipelineContext.story.story (Object) : Story compilée (source de vérité)
 * - report (Object) : Rapport QA existant (sera enrichi)
 * 
 * INTERDICTIONS ABSOLUES :
 * - ❌ Ne pas inventer de contenu
 * - ❌ Ne pas ajouter de tokens (lieu, entité, mot-clé, thème) qui ne viennent pas de pipelineContext.story.extracted ou pipelineContext.story.story
 * - ❌ Ne pas appeler de LLM
 * - ❌ Ne pas modifier pipelineContext (lecture seule)
 * 
 * TOKEN AUDIT :
 * - Chaque token ajouté doit être loggé avec SEO_TOKEN_ADDED { token, source_path }
 * - Si un token n'a pas de source_path valide → SOURCE_OF_TRUTH_VIOLATION_SEO + status fail
 * 
 * OUTPUT :
 * - { html: string, report: Object }
 */

import { isKnownLocation } from './airport-lookup.js';
import { CITY_TO_COUNTRY } from './destinations.js';

class SeoOptimizer {
  constructor() {
    this.tokenAudit = [];
  }

  /**
   * Méthode principale d'optimisation SEO
   * @param {string} html - HTML à optimiser
   * @param {Object} pipelineContext - Contexte du pipeline
   * @param {Object} report - Rapport QA (sera enrichi)
   * @returns {Object} { html, report }
   */
  async optimize(html, pipelineContext, report) {
    // PHASE 8.1: Log d'entrée unique (preuve d'exécution)
    const hasStory = Boolean(pipelineContext?.story);
    const hasExtracted = Boolean(pipelineContext?.story?.extracted);
    const hasStoryData = Boolean(pipelineContext?.story?.story);
    console.log(`✅ SEO_OPTIMIZER_INPUT_READY: has_story=${hasStory} has_extracted=${hasExtracted} has_story_data=${hasStoryData} html_length=${html.length}`);
    
    console.log('\n🔍 OPTIMISATION SEO');
    console.log('==================\n');
    
    // Initialiser le rapport si nécessaire
    if (!report) {
      report = {
        checks: [],
        issues: [],
        actions: [],
        debug: {}
      };
    }
    
    // Initialiser le token audit
    this.tokenAudit = [];
    
    // Vérifier que pipelineContext.story existe
    if (!pipelineContext?.story) {
      console.warn('⚠️ pipelineContext.story manquant - optimisation SEO limitée');
      report.checks.push({
        name: 'seo_optimizer',
        status: 'warn',
        details: 'pipelineContext.story manquant'
      });
      return { html, report };
    }
    
    // Extraire les sources de vérité
    const extracted = pipelineContext.story.extracted || {};
    const storyData = pipelineContext.story.story || {};
    
    // PHASE 8.2: Extraction SEO déterministe
    const seoData = this.extractSeoData(extracted, storyData);
    
    // Injecter la main_destination depuis pipelineContext (smart destination)
    if (pipelineContext.main_destination) {
      seoData.main_destination = pipelineContext.main_destination;
    }
    
    // Exposer seoData dans report.debug
    if (!report.debug) report.debug = {};
    report.debug.seo_data = seoData;
    
    // PHASE 8.4: Génération title/meta (templates + audit tokens)
    const meta = this.buildMeta(seoData, report);
    html = this.injectMeta(html, meta, report);
    
    // PHASE 8.3: Optimisation des headings (réécriture contrôlée)
    html = this.optimizeHeadings(html, seoData, report);
    
    // Stub: Optimisation des alt text (à implémenter)
    html = this.optimizeAltText(html, extracted, storyData, report);
    
    // PHASE 8.5: Injection de liens internes (matching déterministe + limites)
    html = await this.injectInternalLinks(html, seoData, report);
    
    // Stub: Optimisation des mots-clés (à implémenter)
    html = this.optimizeKeywords(html, extracted, storyData, report);
    
    // Vérifier le token audit
    this.validateTokenAudit(report);
    
    // PHASE 8.6: Quality gate SEO (fail bloquant si tokens hors source)
    this.checkSeoQualityGate(html, meta, report);
    
    // Ajouter le check SEO
    const hasViolations = report.issues.some(issue => 
      issue.code === 'SOURCE_OF_TRUTH_VIOLATION_SEO'
    );
    
    report.checks.push({
      name: 'seo_optimizer',
      status: hasViolations ? 'fail' : 'pass',
      details: hasViolations 
        ? `${report.issues.filter(i => i.code === 'SOURCE_OF_TRUTH_VIOLATION_SEO').length} violation(s) détectée(s)`
        : `Optimisation SEO réussie (${this.tokenAudit.length} token(s) ajouté(s))`
    });
    
    // Exposer le token audit dans debug
    if (!report.debug) report.debug = {};
    report.debug.seo_token_audit = this.tokenAudit;
    
    console.log(`✅ SEO_OPTIMIZER: tokens_added=${this.tokenAudit.length} violations=${hasViolations ? 1 : 0}`);
    
    // PHASE 8.7: Build schema markup JSON-LD (stored separately, not in HTML body)
    const schemaMarkup = this.buildSchemaMarkup(html, seoData, meta, pipelineContext);
    if (schemaMarkup.length > 0) {
      report.schemaMarkup = schemaMarkup;
    }
    
    return { html, report };
  }

  /**
   * Injecte des schemas JSON-LD dans le HTML :
   * - Article (auteur, datePublished, publisher, image)
   * - FAQPage (si section FAQ presente dans le HTML)
   * - BreadcrumbList (accueil > categorie > article)
   * - TravelAction (destination)
   */
  buildSchemaMarkup(html, seoData, meta, pipelineContext) {
    const schemas = [];
    const title = seoData?.title || pipelineContext?.generatedTitle || '';
    const destination = pipelineContext?.final_destination || seoData?.main_destination || '';
    const slug = pipelineContext?.slug || '';
    const wpUrl = (process.env.WORDPRESS_URL || 'https://flashvoyage.com').replace(/\/+$/, '');
    const articleUrl = slug ? `${wpUrl}/${slug}/` : wpUrl;
    const now = new Date().toISOString();

    // Build description from meta or fallback
    const description = meta?.metaDescription
      || (destination ? `Guide pratique ${destination} — conseils, budget et itineraire par FlashVoyage.` : '')
      || title;

    // 1. Article schema
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description,
      author: { '@type': 'Person', name: 'FlashVoyage' },
      publisher: {
        '@type': 'Organization',
        name: 'FlashVoyage',
        url: wpUrl,
        logo: { '@type': 'ImageObject', url: `${wpUrl}/wp-content/uploads/flashvoyage-logo.png` },
      },
      datePublished: now,
      dateModified: now,
      mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
      inLanguage: 'fr',
    });

    // 2. FAQPage schema (si section FAQ presente)
    const faqPattern = /<h[23][^>]*>(?:FAQ|Questions?\s+fr[ée]quentes?|Foire\s+aux\s+questions?)[^<]*<\/h[23]>/i;
    if (faqPattern.test(html)) {
      const faqItems = [];
      const qaPairs = html.matchAll(/<(?:h[34]|strong|b)[^>]*>([^<]{10,200})\?<\/(?:h[34]|strong|b)>\s*(?:<[^>]+>\s*)*<p>([^<]{20,1000})<\/p>/gi);
      for (const m of qaPairs) {
        faqItems.push({
          '@type': 'Question',
          name: m[1].trim() + '?',
          acceptedAnswer: { '@type': 'Answer', text: m[2].trim() },
        });
      }
      if (faqItems.length > 0) {
        schemas.push({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems,
        });
        console.log(`📋 SCHEMA: FAQPage injecte (${faqItems.length} questions)`);
      }
    }

    // 3. BreadcrumbList schema
    const breadcrumbs = [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: wpUrl },
    ];
    if (destination) {
      breadcrumbs.push({ '@type': 'ListItem', position: 2, name: destination, item: `${wpUrl}/destination/${destination.toLowerCase().replace(/\s+/g, '-')}/` });
    }
    breadcrumbs.push({ '@type': 'ListItem', position: breadcrumbs.length + 1, name: title });
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs,
    });

    // 4. TravelAction schema (si destination identifiee)
    if (destination) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'TravelAction',
        name: `Voyager vers ${destination}`,
        toLocation: { '@type': 'Place', name: destination },
        fromLocation: { '@type': 'Place', name: 'France' },
      });
    }

    console.log(`📋 SCHEMA: ${schemas.length} schema(s) JSON-LD genere(s) (Article, ${destination ? 'BreadcrumbList, TravelAction' : 'BreadcrumbList'}${faqPattern.test(html) ? ', FAQPage' : ''})`);

    return schemas;
  }

  /**
   * Helper: Vérifie qu'un token a une source valide
   * @param {string} token - Token à vérifier
   * @param {Object} extracted - Données extraites
   * @param {Object} storyData - Données de la story
   * @returns {Object|null} { source_path: string } ou null si pas de source
   */
  findTokenSource(token, extracted, storyData) {
    if (!token || typeof token !== 'string') {
      return null;
    }
    
    const normalizedToken = token.toLowerCase().trim();
    if (!normalizedToken) {
      return null;
    }
    
    // Chercher dans extracted
    const extractedPaths = this.searchInObject(extracted, normalizedToken);
    if (extractedPaths.length > 0) {
      return {
        source_path: `story.extracted.${extractedPaths[0]}`,
        source_type: 'extracted'
      };
    }
    
    // Chercher dans storyData
    const storyPaths = this.searchInObject(storyData, normalizedToken);
    if (storyPaths.length > 0) {
      return {
        source_path: `story.story.${storyPaths[0]}`,
        source_type: 'story'
      };
    }
    
    return null;
  }

  /**
   * Helper: Recherche récursive dans un objet
   * @param {Object} obj - Objet à rechercher
   * @param {string} searchTerm - Terme à chercher
   * @param {string} prefix - Préfixe du chemin (pour récursion)
   * @returns {Array<string>} Liste des chemins où le terme a été trouvé
   */
  searchInObject(obj, searchTerm, prefix = '') {
    const paths = [];
    
    if (!obj || typeof obj !== 'object') {
      return paths;
    }
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'string') {
        // Normaliser et chercher le terme dans la valeur
        const normalizedValue = value.toLowerCase();
        if (normalizedValue.includes(searchTerm) || 
            normalizedValue === searchTerm ||
            normalizedValue.split(/\s+/).includes(searchTerm)) {
          paths.push(currentPath);
        }
      } else if (Array.isArray(value)) {
        // Chercher dans les éléments du tableau
        value.forEach((item, index) => {
          if (typeof item === 'string') {
            const normalizedItem = item.toLowerCase();
            if (normalizedItem.includes(searchTerm) || 
                normalizedItem === searchTerm ||
                normalizedItem.split(/\s+/).includes(searchTerm)) {
              paths.push(`${currentPath}[${index}]`);
            }
          } else if (typeof item === 'object' && item !== null) {
            const nestedPaths = this.searchInObject(item, searchTerm, `${currentPath}[${index}]`);
            paths.push(...nestedPaths);
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        // Récursion pour les objets imbriqués
        const nestedPaths = this.searchInObject(value, searchTerm, currentPath);
        paths.push(...nestedPaths);
      }
    }
    
    return paths;
  }

  /**
   * Helper: Enregistre un token ajouté dans l'audit
   * @param {string} token - Token ajouté
   * @param {Object} extracted - Données extraites
   * @param {Object} storyData - Données de la story
   * @param {string} context - Contexte de l'ajout (ex: "meta_title", "heading")
   * @returns {boolean} true si le token a une source valide, false sinon
   */
  auditToken(token, extracted, storyData, context = 'unknown') {
    if (!token || typeof token !== 'string') {
      return false;
    }
    
    const source = this.findTokenSource(token, extracted, storyData);
    
    // Enregistrer dans l'audit
    this.tokenAudit.push({
      token,
      context,
      source_path: source?.source_path || null,
      source_type: source?.source_type || null,
      timestamp: Date.now()
    });
    
    // Logger
    if (source) {
      console.log(`   ✅ SEO_TOKEN_ADDED: token="${token}" source_path="${source.source_path}" context="${context}"`);
    } else {
      console.warn(`   ⚠️ SEO_TOKEN_NO_SOURCE: token="${token}" context="${context}"`);
    }
    
    return source !== null;
  }

  /**
   * Valide le token audit et ajoute des issues si nécessaire
   * @param {Object} report - Rapport QA
   */
  validateTokenAudit(report) {
    const invalidTokens = this.tokenAudit.filter(entry => !entry.source_path);
    
    if (invalidTokens.length > 0) {
      invalidTokens.forEach(entry => {
        report.issues.push({
          code: 'SOURCE_OF_TRUTH_VIOLATION_SEO',
          severity: 'high',
          message: `Token SEO ajouté sans source valide: "${entry.token}" (context: ${entry.context})`,
          evidence: {
            token: entry.token,
            context: entry.context,
            source_path: null
          },
          check: 'seo_optimizer'
        });
      });
      
      // Forcer le status à fail
      report.status = 'fail';
      
      console.error(`❌ SEO_TOKEN_AUDIT_FAILED: ${invalidTokens.length} token(s) sans source valide`);
    } else {
      console.log(`✅ SEO_TOKEN_AUDIT_PASSED: ${this.tokenAudit.length} token(s) avec source valide`);
    }
  }

  /**
   * PHASE 8.6: Quality gate SEO (fail bloquant si tokens hors source)
   * Vérifie que tous les tokens AJOUTÉS dans title/meta sont tracés dans l'audit
   * Note: Les tokens du post_title original sont considérés comme valides (viennent de extracted)
   * @param {string} html - HTML final
   * @param {Object} meta - { title, metaDescription }
   * @param {Object} report - Rapport QA
   */
  checkSeoQualityGate(html, meta, report) {
    const violations = [];
    
    // 1. Vérifier SOURCE_OF_TRUTH_VIOLATION_SEO présent (déjà fait dans validateTokenAudit)
    const hasSourceViolations = report.issues.some(issue => 
      issue.code === 'SOURCE_OF_TRUTH_VIOLATION_SEO' && 
      issue.check === 'seo_optimizer' // Seulement les violations du token audit, pas celles de la quality gate
    );
    
    // 2. Vérifier tokens dans title/meta absents de l'audit
    // Mais seulement les tokens AJOUTÉS, pas ceux du post_title original
    const stopwords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'à', 'au', 'en', 'sur', 'pour', 'avec', 'dans', 'par', 'sous', 'vers', 'chez', 'on',
      'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from',
      '|', '—', ':', '.', ',', ';', '!', '?', '(', ')', '[', ']', '{', '}',
      'flashvoyage', 'flash', 'voyage' // Marque, toujours autorisé
    ]);
    
    // Extraire les tokens audités (normalisés) - seulement ceux avec source_path valide
    const auditedTokens = new Set(
      this.tokenAudit
        .filter(entry => entry.source_path) // Seulement ceux avec source valide
        .map(entry => this.normalizeToken(entry.token))
    );
    
    // Extraire les tokens du post_title original (valides car viennent de extracted)
    // On les obtient depuis seoData qui est dans report.debug
    const originalTitleTokens = new Set();
    if (report.debug && report.debug.seo_data && report.debug.seo_data.post_title) {
      const originalTitle = report.debug.seo_data.post_title;
      const tokens = this.extractTokens(originalTitle);
      tokens.forEach(token => {
        const normalized = this.normalizeToken(token);
        // Inclure tous les tokens du post_title original (même courts, sauf stopwords)
        if (normalized.length > 0 && !stopwords.has(normalized)) {
          originalTitleTokens.add(normalized);
        }
      });
    }
    
    // Vérifier title - seulement les tokens AJOUTÉS (pas ceux du post_title original)
    if (meta && meta.title) {
      const titleTokens = this.extractTokens(meta.title);
      const untrackedTitleTokens = titleTokens.filter(token => {
        const normalized = this.normalizeToken(token);
        // Ignorer si c'est un stopword ou la marque
        if (stopwords.has(normalized) || normalized === 'flashvoyage') {
          return false;
        }
        // Ignorer si c'est dans le post_title original (valide, même si court)
        if (originalTitleTokens.has(normalized)) {
          return false;
        }
        // Pour les autres tokens, vérifier si c'est dans l'audit (seulement si > 2 chars)
        if (normalized.length <= 2) {
          return false; // Ignorer les tokens très courts qui ne sont pas dans le post_title
        }
        return !auditedTokens.has(normalized);
      });
      
      if (untrackedTitleTokens.length > 0) {
        violations.push({
          type: 'untracked_title_tokens',
          tokens: untrackedTitleTokens,
          context: 'meta_title'
        });
      }
    }
    
    // Vérifier meta description - seulement les tokens AJOUTÉS
    // Les tokens du primaryTopic original sont valides (viennent de seoData)
    const originalDescTokens = new Set();
    if (report.debug && report.debug.seo_data && report.debug.seo_data.primaryTopic) {
      const originalTopic = report.debug.seo_data.primaryTopic;
      const tokens = this.extractTokens(originalTopic);
      tokens.forEach(token => {
        const normalized = this.normalizeToken(token);
        // Inclure tous les tokens du primaryTopic original (même courts, sauf stopwords)
        if (normalized.length > 0 && !stopwords.has(normalized)) {
          originalDescTokens.add(normalized);
        }
      });
    }
    
    // Ajouter aussi les tokens des places (valides car viennent de seoData)
    if (report.debug && report.debug.seo_data && report.debug.seo_data.places) {
      report.debug.seo_data.places.forEach(place => {
        const normalized = this.normalizeToken(place);
        if (normalized.length > 0 && !stopwords.has(normalized)) {
          originalDescTokens.add(normalized);
        }
      });
    }
    
    if (meta && meta.metaDescription) {
      const descTokens = this.extractTokens(meta.metaDescription);
      const untrackedDescTokens = descTokens.filter(token => {
        const normalized = this.normalizeToken(token);
        // Ignorer si c'est un stopword ou la marque
        if (stopwords.has(normalized) || normalized === 'flashvoyage') {
          return false;
        }
        // Ignorer si c'est dans le primaryTopic original ou places (valide)
        if (originalDescTokens.has(normalized)) {
          return false;
        }
        // Pour les autres tokens, vérifier si c'est dans l'audit (seulement si > 2 chars)
        if (normalized.length <= 2) {
          return false; // Ignorer les tokens très courts qui ne sont pas dans les sources originales
        }
        return !auditedTokens.has(normalized);
      });
      
      if (untrackedDescTokens.length > 0) {
        violations.push({
          type: 'untracked_meta_tokens',
          tokens: untrackedDescTokens,
          context: 'meta_description'
        });
      }
    }
    
    // Ajouter les violations comme issues
    violations.forEach(violation => {
      report.issues.push({
        code: 'SOURCE_OF_TRUTH_VIOLATION_SEO',
        severity: 'high',
        message: `Token(s) dans ${violation.context} absent(s) de l'audit: ${violation.tokens.join(', ')}`,
        evidence: {
          tokens: violation.tokens,
          context: violation.context,
          type: violation.type
        },
        check: 'seo_quality_gate'
      });
    });
    
    // Ajouter le check seo_quality_gate
    // Note: On ne compte que les violations de la quality gate (untracked tokens)
    // Les violations de source_path sont déjà gérées par validateTokenAudit
    const hasFailures = violations.length > 0;
    const hasSourceViolationsFromAudit = report.issues.some(issue => 
      issue.code === 'SOURCE_OF_TRUTH_VIOLATION_SEO' && 
      issue.check === 'seo_optimizer' // Seulement celles du token audit
    );
    
    report.checks.push({
      name: 'seo_quality_gate',
      status: (hasSourceViolationsFromAudit || hasFailures) ? 'fail' : 'pass',
      details: (hasSourceViolationsFromAudit || hasFailures)
        ? `${hasSourceViolationsFromAudit ? 1 : 0} violation(s) source + ${violations.length} token(s) non tracé(s)`
        : `Quality gate SEO passée (${this.tokenAudit.length} token(s) tracé(s))`,
      blocking: (hasSourceViolationsFromAudit || hasFailures)
    });
    
    if (hasSourceViolationsFromAudit || hasFailures) {
      report.status = 'fail';
      console.error(`❌ SEO_QUALITY_GATE_FAILED: ${hasSourceViolationsFromAudit ? 1 : 0} violation(s) source + ${violations.length} token(s) non tracé(s)`);
    } else {
      console.log(`✅ SEO_QUALITY_GATE_PASSED: tous les tokens tracés`);
    }
  }

  /**
   * Helper: Extrait les tokens d'un texte (mots significatifs)
   * @param {string} text - Texte à analyser
   * @returns {Array<string>} Liste des tokens
   */
  extractTokens(text) {
    if (!text || typeof text !== 'string') return [];
    const normalized = this.normalizeText(text);
    const rawMatches = normalized.match(/[a-z0-9à-öø-ÿ]+(?:['-][a-z0-9à-öø-ÿ]+)*/gi) || [];
    return rawMatches
      .map(token => this.normalizeToken(token))
      .filter(token => token.length > 0);
  }

  /**
   * PHASE 8.2: Extraction SEO déterministe
   * @param {Object} extracted - Données extraites
   * @param {Object} storyData - Données de la story
   * @returns {Object} seoData = { primaryTopic, entities, places, keywords, category, subreddit, post_title }
   */
  extractSeoData(extracted, storyData) {
    const seoData = {
      primaryTopic: null,
      entities: [],
      places: [],
      keywords: [],
      category: null,
      subreddit: null,
      post_title: null
    };
    
    // Extraire post_title
    seoData.post_title = extracted?.source?.title || 
                        extracted?.post?.title ||
                        extracted?.title ||
                        null;
    
    // Extraire subreddit
    seoData.subreddit = extracted?.source?.subreddit ||
                        extracted?.subreddit ||
                        null;
    
    // Extraire places (uniquement depuis extraction, pas de NER sur HTML)
    const locationPaths = [
      'post.signals.locations',
      'post.evidence.locations',
      'reddit_extraction.post.signals.locations',
      'reddit_extraction.post.evidence.locations',
      'signals.locations',
      'locations'
    ];
    const rawLocations = this.extractStringsDeep(extracted, locationPaths);
    seoData.places = this.uniq(rawLocations.map(l => this.normalizeText(l))).filter(l => l.length > 0);
    
    // Extraire keywords déterministiquement
    const keywordSources = [];
    
    // 1. post_title
    if (seoData.post_title) {
      keywordSources.push(seoData.post_title);
    }
    
    // 2. central_event.summary
    if (storyData?.central_event?.summary) {
      keywordSources.push(storyData.central_event.summary);
    }
    
    // 3. context.summary
    if (storyData?.context?.summary) {
      keywordSources.push(storyData.context.summary);
    }
    
    // 4. community_insights (tous les items)
    if (Array.isArray(storyData?.community_insights)) {
      storyData.community_insights.forEach(item => {
        const text = item.value || item.text || item.summary || item.quote || '';
        if (text) keywordSources.push(text);
      });
    }
    
    // Extraire les top termes (stopwords FR/EN minimal)
    seoData.keywords = this.extractTopKeywords(keywordSources.join(' '));
    
    // Construire primaryTopic (1 phrase courte via templates + tokens existants)
    seoData.primaryTopic = this.buildPrimaryTopic(seoData, storyData);
    
    // Extraire entities (lieux + autres entités si disponibles)
    seoData.entities = [...seoData.places];
    // Ajouter d'autres entités si disponibles dans extracted
    const entityPaths = [
      'post.signals.events',
      'post.evidence.events',
      'signals.events',
      'events'
    ];
    const rawEvents = this.extractStringsDeep(extracted, entityPaths);
    if (rawEvents.length > 0) {
      seoData.entities.push(...rawEvents.slice(0, 3).map(e => this.normalizeText(e)));
    }
    
    // Extraire category (si disponible)
    seoData.category = extracted?.category ||
                       extracted?.pattern?.theme_primary ||
                       null;
    
    // Log SEO_EXTRACTOR_SUMMARY
    const placesCount = seoData.places.length;
    const keywordsCount = seoData.keywords.length;
    const entitiesCount = seoData.entities.length;
    const topKeywords = seoData.keywords.slice(0, 5).join(', ');
    console.log(`✅ SEO_EXTRACTOR_SUMMARY: places=${placesCount} keywords=${keywordsCount} entities=${entitiesCount} top_keywords=[${topKeywords}]`);
    
    return seoData;
  }

  /**
   * Helper: Normalise un texte (trim, collapse spaces, casefold)
   */
  normalizeText(s) {
    if (typeof s !== 'string') return '';
    return s
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  /**
   * Helper: normalise un token (retire ponctuation/fragments)
   */
  normalizeToken(token) {
    if (typeof token !== 'string') return '';
    return token
      .toLowerCase()
      .replace(/^[^a-z0-9à-öø-ÿ]+/gi, '')
      .replace(/[^a-z0-9à-öø-ÿ]+$/gi, '')
      .replace(/['’]/g, "'")
      .trim();
  }

  /**
   * Helper: Retourne un tableau unique (sans doublons)
   */
  uniq(arr) {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    return arr.filter(item => {
      const normalized = typeof item === 'string' ? this.normalizeText(item) : String(item);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  /**
   * Helper: Extrait des chaînes depuis un objet profond en testant plusieurs chemins possibles
   */
  extractStringsDeep(obj, pathCandidates) {
    if (!obj || typeof obj !== 'object') return [];
    
    const results = [];
    
    for (const path of pathCandidates) {
      const parts = path.split('.');
      let current = obj;
      let found = true;
      
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          found = false;
          break;
        }
      }
      
      if (found) {
        if (Array.isArray(current)) {
          const values = current.map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && 'value' in item) return item.value;
            return String(item);
          }).filter(v => v && v.trim().length > 0);
          results.push(...values);
        } else if (typeof current === 'string' && current.trim().length > 0) {
          results.push(current);
        }
      }
    }
    
    return results;
  }

  /**
   * Helper: Extrait les top keywords d'un texte (stopwords FR/EN minimal)
   */
  extractTopKeywords(text) {
    if (!text || typeof text !== 'string') return [];
    
    // Stopwords FR/EN minimal
    const stopwords = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'mais', 'donc', 'car', 'ne', 'pas', 'plus', 'très', 'tout', 'tous', 'toute', 'toutes',
      'the', 'a', 'an', 'and', 'or', 'but', 'so', 'because', 'not', 'no', 'very', 'all', 'every', 'each',
      'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'ce', 'cette', 'ces', 'son', 'sa', 'ses',
      'i', 'you', 'he', 'she', 'we', 'they', 'it', 'this', 'that', 'these', 'those', 'his', 'her', 'its',
      'être', 'avoir', 'faire', 'dire', 'aller', 'voir', 'savoir', 'vouloir', 'pouvoir', 'devoir',
      'be', 'have', 'do', 'say', 'go', 'see', 'know', 'want', 'can', 'must', 'should', 'will', 'would',
      'à', 'au', 'en', 'dans', 'sur', 'pour', 'avec', 'sans', 'par', 'sous', 'vers', 'chez',
      'to', 'in', 'on', 'at', 'for', 'with', 'without', 'by', 'from', 'into', 'onto'
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
    
    // Compter les occurrences
    const tokenCounts = new Map();
    tokens.forEach(token => {
      const count = tokenCounts.get(token) || 0;
      tokenCounts.set(token, count + 1);
    });
    
    // Trier par fréquence décroissante et retourner les top 10
    const sorted = Array.from(tokenCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([token]) => token);
    
    return sorted;
  }

  /**
   * Helper: Construit primaryTopic (1 phrase courte via templates + tokens existants)
   */
  buildPrimaryTopic(seoData, storyData) {
    // Templates possibles
    const templates = [
      '{place} : {topic}',
      '{topic} à {place}',
      '{topic} en {place}',
      'Guide {topic} {place}',
      '{topic} - {place}'
    ];
    
    // Extraire le topic principal depuis le titre ou central_event
    let topic = null;
    if (seoData.post_title) {
      // Prendre les premiers mots significatifs du titre
      const titleWords = seoData.post_title.split(/\s+/).slice(0, 4).join(' ');
      topic = titleWords.length > 50 ? titleWords.substring(0, 50) : titleWords;
    } else if (storyData?.central_event?.summary) {
      topic = storyData.central_event.summary.substring(0, 50);
    } else if (storyData?.context?.summary) {
      topic = storyData.context.summary.substring(0, 50);
    }
    
    // Extraire le lieu principal
    const place = seoData.places.length > 0 ? seoData.places[0] : null;
    
    // Construire la phrase
    if (topic && place) {
      // Utiliser le premier template qui fonctionne
      return templates[0].replace('{place}', place).replace('{topic}', topic);
    } else if (topic) {
      return topic;
    } else if (place) {
      return `Guide voyage ${place}`;
    }
    
    return null;
  }

  /**
   * PHASE 8.4: Génération title/meta (templates + audit tokens)
   * @param {Object} seoData - Données SEO extraites
   * @param {Object} report - Rapport QA
   * @returns {Object} { title, metaDescription }
   */
  buildMeta(seoData, report) {
    const meta = {
      title: null,
      metaDescription: null
    };
    
    // Construire le title via template
    // Template: {post_title} — {place?} | FlashVoyage (si place existe)
    if (seoData.post_title) {
      let title = seoData.post_title;
      
      // Ajouter le lieu si disponible
      if (seoData.places && seoData.places.length > 0) {
        const place = seoData.places[0];
        title = `${title} — ${place}`;
        
        // Auditer le token "place"
        const source = this.findTokenSourceInSeoData(place, seoData);
        if (source) {
          this.tokenAudit.push({
            token: place,
            context: 'meta_title',
            source_path: source.source_path,
            source_type: source.source_type,
            timestamp: Date.now()
          });
          console.log(`   ✅ SEO_TOKEN_ADDED: token="${place}" source_path="${source.source_path}" context="meta_title"`);
        }
      }
      
      // Ajouter le suffixe FlashVoyage
      title = `${title} | FlashVoyage`;
      meta.title = title;
    } else {
      // Fallback si pas de post_title
      meta.title = 'FlashVoyage';
    }
    
    // Construire la meta description (140-160 chars)
    // Basé sur primaryTopic + {place?}
    const descriptionParts = [];
    
    // Ajouter primaryTopic si disponible
    if (seoData.primaryTopic) {
      descriptionParts.push(seoData.primaryTopic);
      
      // Auditer les tokens de primaryTopic
      const topicWords = this.extractTokens(seoData.primaryTopic).filter(w => w.length > 2);
      topicWords.forEach(word => {
        const source = this.findTokenSourceInSeoData(word, seoData);
        if (source) {
          this.tokenAudit.push({
            token: word,
            context: 'meta_description',
            source_path: source.source_path,
            source_type: source.source_type,
            timestamp: Date.now()
          });
        }
      });
    }
    
    // Ajouter le lieu si disponible
    if (seoData.places && seoData.places.length > 0) {
      const place = seoData.places[0];
      descriptionParts.push(`à ${place}`);
      
      // Auditer le token "place" (déjà fait pour title, mais on le refait pour la description)
      const source = this.findTokenSourceInSeoData(place, seoData);
      if (source) {
        this.tokenAudit.push({
          token: place,
          context: 'meta_description',
          source_path: source.source_path,
          source_type: source.source_type,
          timestamp: Date.now()
        });
      }
    }
    
    // Construire la description
    let description = descriptionParts.join('. ');
    
    // Truncate déterministe à 140-160 chars
    if (description.length > 160) {
      // Tronquer à 157 chars et ajouter "..."
      description = description.substring(0, 157).trim() + '...';
    } else if (description.length < 140) {
      // Si trop court, on garde tel quel (pas d'invention pour compléter)
      // On pourrait ajouter un suffixe générique si nécessaire, mais on évite l'invention
    }
    
    meta.metaDescription = description || null;
    
    return meta;
  }

  /**
   * PHASE 8.4: Injecte les meta tags dans le HTML
   * @param {string} html - HTML
   * @param {Object} meta - { title, metaDescription }
   * @param {Object} report - Rapport QA
   * @returns {string} HTML modifié
   */
  injectMeta(html, meta, report) {    if (!html || typeof html !== 'string') {
      return html;
    }
    
    if (!meta || !meta.title) {
      return html;
    }
    
    let modifiedHtml = html;
    
    // Vérifier si <head> existe
    const hasHead = /<head[^>]*>/i.test(html);
    
    // Vérifier si <title> existe
    const titleRegex = /<title[^>]*>.*?<\/title>/i;
    const hasTitle = titleRegex.test(html);
    
    // Remplacer ou ajouter <title>
    if (hasTitle) {
      // Remplacer le title existant
      modifiedHtml = modifiedHtml.replace(titleRegex, `<title>${this.escapeHtml(meta.title)}</title>`);
      console.log(`   ✅ SEO_META_UPDATED: title remplacé`);
    } else {
      // Ajouter <title> dans <head>
      if (hasHead) {
        // Insérer après <head>
        modifiedHtml = modifiedHtml.replace(/(<head[^>]*>)/i, `$1\n<title>${this.escapeHtml(meta.title)}</title>`);
        console.log(`   ✅ SEO_META_UPDATED: title ajouté dans <head>`);
      } else {
        // FIX H2: NE PAS injecter <head><title> dans le contenu WordPress!
        // WordPress gère les balises <title> et <meta> via le thème et les plugins SEO (Yoast, etc.)
        // Injecter ces balises dans le body du contenu pollue le DOM et crée des problèmes SEO        console.log(`   ℹ️ SEO_META_SKIPPED: Pas de <head> dans le contenu - WordPress gère les meta tags via API/plugins`);
        // Ne rien injecter - les métadonnées sont passées à WordPress via l'API (title, excerpt)
      }
    }
    
    // FIX H2: NE PAS injecter <meta name="description"> dans le contenu WordPress!
    // La meta description est gérée par WordPress/Yoast via l'API, pas dans le body
    // On skip complètement cette section pour éviter de polluer le contenu
    /* DÉSACTIVÉ - WordPress gère les meta descriptions via plugins SEO
    // Ajouter <meta name="description">
    if (meta.metaDescription) {
      const metaDescriptionTag = `<meta name="description" content="${this.escapeHtml(meta.metaDescription)}">`;
      
      // Vérifier si meta description existe déjà
      const metaDescriptionRegex = /<meta\s+name=["']description["'][^>]*>/i;
      if (metaDescriptionRegex.test(modifiedHtml)) {
        // Remplacer la meta description existante
        modifiedHtml = modifiedHtml.replace(metaDescriptionRegex, metaDescriptionTag);
        console.log(`   ✅ SEO_META_UPDATED: meta description remplacée`);
      } else {
        // Ajouter la meta description dans <head>
        if (hasHead || /<head[^>]*>/i.test(modifiedHtml)) {
          // Insérer après <head> ou après <title>
          if (hasTitle || /<title[^>]*>/i.test(modifiedHtml)) {
            modifiedHtml = modifiedHtml.replace(/(<\/title>)/i, `$1\n${metaDescriptionTag}`);
          } else {
            modifiedHtml = modifiedHtml.replace(/(<head[^>]*>)/i, `$1\n${metaDescriptionTag}`);
          }
          console.log(`   ✅ SEO_META_UPDATED: meta description ajoutée`);
        } else {
          // Si pas de head, l'ajouter dans le head minimal créé précédemment
          modifiedHtml = modifiedHtml.replace(/(<\/head>)/i, `\n${metaDescriptionTag}$1`);
        }
      }
    }
    FIN DÉSACTIVATION - WordPress gère les meta descriptions */
    
    // Enregistrer l'action
    if (report.actions) {
      report.actions.push({
        type: 'seo_meta_injected',
        details: `Meta tags injectés: title="${meta.title}", description="${meta.metaDescription?.substring(0, 50)}..."`,
        meta: {
          title: meta.title,
          description: meta.metaDescription
        }
      });
    }
    
    return modifiedHtml;
  }

  /**
   * Helper: Échappe le HTML pour sécurité
   * @param {string} text - Texte à échapper
   * @returns {string} Texte échappé
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
   * Décode les entités HTML dans un titre (ex: &#8217; → ') pour construire une ancre lisible
   * sans tronquer au milieu d'une entité ni afficher du code brut.
   */
  decodeHtmlEntitiesForAnchor(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&apos;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&ldquo;|&rdquo;/g, '"');
  }

  /**
   * STUB: Optimisation des meta tags (déprécié, utiliser buildMeta + injectMeta)
   * @param {string} html - HTML
   * @param {Object} extracted - Données extraites
   * @param {Object} storyData - Données de la story
   * @param {Object} report - Rapport QA
   * @returns {string} HTML modifié
   */
  optimizeMetaTags(html, extracted, storyData, report) {
    // Déprécié: utiliser buildMeta + injectMeta à la place
    return html;
  }

  /**
   * PHASE 8.3: Optimisation des headings (réécriture contrôlée)
   * Ne réécrit que les H2/H3 "génériques" selon mapping
   * @param {string} html - HTML
   * @param {Object} seoData - Données SEO extraites
   * @param {Object} report - Rapport QA
   * @returns {string} HTML modifié
   */
  optimizeHeadings(html, seoData, report) {
    if (!html || typeof html !== 'string') {
      return html;
    }
    
    // Mapping des headings génériques vers templates
    const genericHeadings = {
      'Contexte': {
        template: 'Contexte : {place}',
        requires: ['place'],
        fallback: null // Inchangé si place manquant
      },
      'Événement central': {
        template: 'Événement central : {primaryTopic}',
        requires: ['primaryTopic'],
        fallback: null
      },
      'Ce que dit la communauté': {
        template: 'Ce que dit la communauté sur {place}',
        requires: ['place'],
        fallback: null
      },
      'Questions ouvertes': {
        template: 'Questions ouvertes sur {place}',
        requires: ['place'],
        fallback: null
      }
    };
    
    // Créer une whitelist de tokens autorisés
    const whitelist = new Set();
    if (seoData.places && seoData.places.length > 0) {
      seoData.places.forEach(place => whitelist.add(this.normalizeText(place)));
    }
    if (seoData.entities && seoData.entities.length > 0) {
      seoData.entities.forEach(entity => whitelist.add(this.normalizeText(entity)));
    }
    if (seoData.keywords && seoData.keywords.length > 0) {
      seoData.keywords.forEach(keyword => whitelist.add(this.normalizeText(keyword)));
    }
    if (seoData.primaryTopic) {
      const topicWords = this.normalizeText(seoData.primaryTopic).split(/\s+/);
      topicWords.forEach(word => {
        if (word.length > 2) whitelist.add(word);
      });
    }
    
    // Fonction pour vérifier si un heading est générique
    const isGenericHeading = (headingText) => {
      const normalized = this.normalizeText(headingText);
      
      // Vérifier si c'est exactement un heading générique (sans enrichissement)
      for (const genericKey of Object.keys(genericHeadings)) {
        const normalizedGeneric = this.normalizeText(genericKey);
        // Exact match uniquement (pas de contenu après)
        if (normalized === normalizedGeneric) {
          return true;
        }
        // Ou commence par le générique suivi uniquement de ponctuation/espace (pas de mots supplémentaires)
        const matchPattern = new RegExp(`^${normalizedGeneric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s:]*$`);
        if (matchPattern.test(normalized)) {
          return true;
        }
      }
      
      return false;
    };
    
    // Fonction pour réécrire un heading générique
    const rewriteGenericHeading = (originalText) => {
      const normalized = this.normalizeText(originalText);
      
      // Trouver le mapping correspondant
      for (const [genericKey, mapping] of Object.entries(genericHeadings)) {
        const normalizedGeneric = this.normalizeText(genericKey);
        // Exact match uniquement (pas de contenu après)
        const isExactMatch = normalized === normalizedGeneric;
        // Ou commence par le générique suivi uniquement de ponctuation/espace (pas de mots supplémentaires)
        const matchPattern = new RegExp(`^${normalizedGeneric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s:]*$`);
        const isGenericStart = matchPattern.test(normalized);
        
        if (isExactMatch || isGenericStart) {
          // Vérifier les prérequis
          let canRewrite = true;
          const replacements = {};
          
          if (mapping.requires.includes('place')) {
            if (!seoData.places || seoData.places.length === 0) {
              canRewrite = false;
            } else {
              replacements.place = seoData.places[0]; // Prendre le premier lieu
            }
          }
          
          if (mapping.requires.includes('primaryTopic')) {
            if (!seoData.primaryTopic) {
              canRewrite = false;
            } else {
              replacements.primaryTopic = seoData.primaryTopic;
            }
          }
          
          if (!canRewrite) {
            // Fallback : ne pas modifier
            return mapping.fallback !== null ? mapping.fallback : originalText;
          }
          
          // Construire le nouveau heading
          let newHeading = mapping.template;
          for (const [key, value] of Object.entries(replacements)) {
            // Capitaliser la première lettre pour les noms de lieux
            const capitalizedValue = key === 'place' || key === 'primaryTopic' 
              ? value.charAt(0).toUpperCase() + value.slice(1)
              : value;
            newHeading = newHeading.replace(`{${key}}`, capitalizedValue);
          }
          
          // Vérifier que tous les tokens ajoutés sont dans la whitelist
          // Ignorer les mots de liaison courts (sur, à, en, etc.)
          const stopwordsShort = new Set(['sur', 'à', 'au', 'en', 'de', 'du', 'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'pour', 'avec', 'dans', 'par', 'sous', 'vers', 'chez', 'on', 'in', 'at', 'to', 'for', 'with', 'by', 'from']);
          const newWords = this.normalizeText(newHeading).split(/\s+/);
          const invalidTokens = newWords.filter(word => 
            word.length > 2 && 
            !stopwordsShort.has(word) &&
            !whitelist.has(word) &&
            !this.normalizeText(originalText).split(/\s+/).includes(word)
          );
          
          if (invalidTokens.length > 0) {
            // Refuser la réécriture si des tokens invalides
            console.warn(`   ⚠️ SEO_HEADING_REWRITE_REFUSED: tokens invalides "${invalidTokens.join(', ')}"`);
            return originalText;
          }
          
          // Auditer chaque token ajouté (ignorer les mots de liaison courts)
          const originalWords = this.normalizeText(originalText).split(/\s+/);
          const addedWords = newWords.filter(word => 
            word.length > 2 && 
            !stopwordsShort.has(word) &&
            !originalWords.includes(word)
          );
          
          addedWords.forEach(word => {
            // Trouver la source du token dans seoData
            const source = this.findTokenSourceInSeoData(word, seoData);
            if (source) {
              // Enregistrer dans l'audit avec la source correcte
              this.tokenAudit.push({
                token: word,
                context: `heading_${genericKey.toLowerCase().replace(/\s+/g, '_')}`,
                source_path: source.source_path,
                source_type: source.source_type,
                timestamp: Date.now()
              });
              console.log(`   ✅ SEO_TOKEN_ADDED: token="${word}" source_path="${source.source_path}" context="heading_${genericKey.toLowerCase().replace(/\s+/g, '_')}"`);
            } else {
              // Token sans source (ne devrait pas arriver si whitelist fonctionne)
              console.warn(`   ⚠️ SEO_TOKEN_NO_SOURCE: token="${word}" context="heading_${genericKey.toLowerCase().replace(/\s+/g, '_')}"`);
            }
          });
          
          // Enregistrer l'action
          if (report.actions) {
            report.actions.push({
              type: 'seo_heading_rewritten',
              details: `Heading "${originalText}" réécrit en "${newHeading}"`,
              original: originalText,
              rewritten: newHeading
            });
          }
          
          console.log(`   ✅ SEO_HEADING_REWRITTEN: "${originalText}" → "${newHeading}"`);
          
          return newHeading;
        }
      }
      
      return originalText;
    };
    
    // Parser le HTML et réécrire les H2/H3 génériques
    // Utiliser regex pour trouver les H2/H3
    const headingRegex = /<(h[23])[^>]*>(.*?)<\/\1>/gi;
    let modifiedHtml = html;
    let match;
    const replacements = [];
    
    while ((match = headingRegex.exec(html)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];
      const headingText = match[2].replace(/<[^>]*>/g, '').trim(); // Retirer les tags HTML internes
      
      // Vérifier si c'est un heading générique
      if (isGenericHeading(headingText)) {
        const rewritten = rewriteGenericHeading(headingText);
        if (rewritten !== headingText) {
          // Remplacer uniquement le texte, pas le tag
          const newFullTag = fullTag.replace(headingText, rewritten);
          replacements.push({ original: fullTag, replacement: newFullTag });
        }
      }
    }
    
    // Appliquer les remplacements
    replacements.forEach(({ original, replacement }) => {
      modifiedHtml = modifiedHtml.replace(original, replacement);
    });
    
    return modifiedHtml;
  }

  /**
   * Helper: Trouve la source d'un token dans seoData
   * @param {string} token - Token à chercher
   * @param {Object} seoData - Données SEO
   * @returns {Object|null} { source_path, source_type } ou null
   */
  findTokenSourceInSeoData(token, seoData) {
    if (!token || !seoData) return null;
    
    const normalizedToken = this.normalizeText(token);
    
    // Chercher dans places
    if (seoData.places && seoData.places.some(p => this.normalizeText(p) === normalizedToken)) {
      return {
        source_path: 'seo_data.places',
        source_type: 'seo_data'
      };
    }
    
    // Chercher dans entities
    if (seoData.entities && seoData.entities.some(e => this.normalizeText(e) === normalizedToken)) {
      return {
        source_path: 'seo_data.entities',
        source_type: 'seo_data'
      };
    }
    
    // Chercher dans keywords
    if (seoData.keywords && seoData.keywords.some(k => this.normalizeText(k) === normalizedToken)) {
      return {
        source_path: 'seo_data.keywords',
        source_type: 'seo_data'
      };
    }
    
    // Chercher dans primaryTopic
    if (seoData.primaryTopic) {
      const topicWords = this.normalizeText(seoData.primaryTopic).split(/\s+/);
      if (topicWords.includes(normalizedToken)) {
        return {
          source_path: 'seo_data.primaryTopic',
          source_type: 'seo_data'
        };
      }
    }
    
    return null;
  }

  /**
   * STUB: Optimisation des alt text
   * @param {string} html - HTML
   * @param {Object} extracted - Données extraites
   * @param {Object} storyData - Données de la story
   * @param {Object} report - Rapport QA
   * @returns {string} HTML modifié
   */
  optimizeAltText(html, extracted, storyData, report) {
    // TODO: Implémenter l'optimisation des alt text
    // - Ajouter des alt text descriptifs aux images
    // - Utiliser uniquement des tokens de extracted/storyData
    return html;
  }

  /**
   * PHASE 8.5: Injection de liens internes (matching déterministe + limites)
   * @param {string} html - HTML
   * @param {Object} seoData - Données SEO extraites
   * @param {Object} report - Rapport QA
   * @returns {Promise<string>} HTML modifié
   */
  async injectInternalLinks(html, seoData, report) {
    if (!html || typeof html !== 'string') {
      return html;
    }
    
    // Charger l'index local des liens internes
    let internalLinksIndex = null;
    try {
      // Essayer de charger depuis data/internal-links.json
      // Utiliser fs/promises pour compatibilité ESM
      const fs = await import('fs/promises');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      // Déterminer le chemin du fichier
      let currentDir;
      if (typeof import.meta !== 'undefined' && import.meta.url) {
        currentDir = path.dirname(fileURLToPath(import.meta.url));
      } else {
        // Fallback : utiliser le répertoire de travail
        currentDir = process.cwd();
      }
      
      const indexPath = path.join(currentDir, 'data', 'internal-links.json');
      
      // Lire le fichier
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      internalLinksIndex = JSON.parse(indexContent);
    } catch (error) {
      // En cas d'erreur, utiliser stub minimal
      console.warn(`   ⚠️ SEO_INTERNAL_LINKS: erreur chargement index (${error.message}), utilisation stub minimal`);
      internalLinksIndex = {
        articles: [],
        blacklist: []
      };
    }
    
    if (!internalLinksIndex || !internalLinksIndex.articles || internalLinksIndex.articles.length === 0) {
      // Pas d'articles disponibles, retourner HTML inchangé
      return html;
    }
    
    // Matching basé sur seoData.category + keywords
    console.log(`   🔗 SEO_INTERNAL_LINKS: ${internalLinksIndex.articles.length} articles dans l'index`);
    console.log(`   🔗 SEO_INTERNAL_LINKS: keywords=[${(seoData.keywords || []).slice(0, 5).join(', ')}] places=[${(seoData.places || []).slice(0, 3).join(', ')}]`);
    
    const matchedLinks = this.matchInternalLinks(internalLinksIndex, seoData);
    
    if (matchedLinks.length === 0) {
      console.log(`   ⚠️ SEO_INTERNAL_LINKS: aucun lien matché`);
      return html;
    }
    
    // Déduplication : exclure les URLs déjà présentes dans le HTML
    const existingUrls = new Set();
    const existingLinkRegex = /<a[^>]*href="([^"]*flashvoyage[^"]*)"[^>]*>/gi;
    let urlMatch;
    while ((urlMatch = existingLinkRegex.exec(html)) !== null) {
      existingUrls.add(urlMatch[1].replace(/\/$/, '').toLowerCase());
    }
    const freshLinks = matchedLinks.filter(l => {
      const norm = (l.url || '').replace(/\/$/, '').toLowerCase();
      return !existingUrls.has(norm);
    });
    
    if (freshLinks.length === 0) {
      console.log(`   ⚠️ SEO_INTERNAL_LINKS: ${matchedLinks.length} matché(s) mais tous déjà présents dans le HTML`);
      return html;
    }
    
    // Limiter à 5 liens max
    let linksToInject = freshLinks.slice(0, 5);
    
    // Garantir au moins 1 lien pilier (guide/destination/budget/visa/itineraire)
    const hasPillar = linksToInject.some(l => l.isPillar);
    if (!hasPillar) {
      const bestPillar = freshLinks.find(l => l.isPillar);
      if (bestPillar) {
        linksToInject[linksToInject.length - 1] = bestPillar;
        console.log(`   🏛️ PILLAR_GUARANTEE: injecté "${bestPillar.slug}" en remplacement du dernier lien`);
      }
    }
    
    // Injecter dans la section "Articles connexes" ou créer si absente
    const modifiedHtml = this.injectLinksIntoRelatedSection(html, linksToInject);
    
    // Log
    const slugs = linksToInject.map(link => link.slug).join(', ');
    console.log(`   ✅ SEO_INTERNAL_LINKS_ADDED: ${linksToInject.length} lien(s) ajouté(s) [${slugs}]`);
    
    // Enregistrer l'action
    if (report.actions) {
      report.actions.push({
        type: 'seo_internal_links_injected',
        details: `${linksToInject.length} lien(s) interne(s) ajouté(s)`,
        links: linksToInject.map(link => ({
          slug: link.slug,
          title: link.title,
          url: link.url
        }))
      });
    }
    
    return modifiedHtml;
  }

  /**
   * Matching des liens internes basé sur category + keywords
   * @param {Object} index - Index des liens internes
   * @param {Object} seoData - Données SEO
   * @returns {Array} Liens matchés (triés par score)
   */
  matchInternalLinks(index, seoData) {
    const matched = [];
    const blacklist = new Set((index.blacklist || []).map(item => item.toLowerCase()));
    
    // Normaliser les keywords de seoData
    const seoKeywords = (seoData.keywords || []).map(k => this.normalizeText(k));
    const seoCategory = seoData.category ? this.normalizeText(seoData.category) : null;
    
    // AMÉLIORATION: Extraire destination de l'article (priorité: main_destination du pipeline > places[0])
    const articleDestination = seoData.main_destination 
      ? this.normalizeText(seoData.main_destination)
      : (seoData.places && seoData.places.length > 0 ? this.normalizeText(seoData.places[0]) : null);
    
    for (const article of index.articles) {
      // Vérifier blacklist
      if (blacklist.has(article.slug.toLowerCase()) || 
          blacklist.has(article.title.toLowerCase())) {
        continue;
      }
      
      let score = 0;
      
      // Matching par category (exact)
      if (seoCategory && article.category) {
        const articleCategory = this.normalizeText(article.category);
        if (articleCategory === seoCategory) {
          score += 10; // Score élevé pour match exact category
        }
      }
      
      // Matching par keywords (exact ou contains)
      if (article.keywords && Array.isArray(article.keywords)) {
        const articleKeywords = article.keywords.map(k => this.normalizeText(k));
        
        for (const seoKeyword of seoKeywords) {
          // Match exact
          if (articleKeywords.includes(seoKeyword)) {
            score += 5;
          } else {
            // Match contains (tolérant)
            for (const articleKeyword of articleKeywords) {
              if (articleKeyword.includes(seoKeyword) || seoKeyword.includes(articleKeyword)) {
                score += 2;
                break;
              }
            }
          }
        }
      }
      
      // Matching par places (si disponible)
      if (seoData.places && seoData.places.length > 0 && article.keywords) {
        const articleKeywords = article.keywords.map(k => this.normalizeText(k));
        for (const place of seoData.places) {
          const normalizedPlace = this.normalizeText(place);
          if (articleKeywords.includes(normalizedPlace)) {
            score += 3;
          }
        }
      }
      
      // AMÉLIORATION: Matching par destination (bonus/pénalité)
      if (articleDestination) {
        // CITY_TO_COUNTRY importé depuis destinations.js (source unique de vérité)
        
        // Normaliser la destination de l'article vers un pays
        const normalizedArticleDest = CITY_TO_COUNTRY[articleDestination] || articleDestination;
        
        // Extraire destination de l'article candidat depuis keywords ou titre
        const candidateTitle = this.normalizeText(article.title || '');
        const candidateKeywords = article.keywords 
          ? article.keywords.map(k => this.normalizeText(k))
          : [];
        
        // Chercher destination dynamiquement via BDD OpenFlights (5600+ entrées)
        let candidateDestination = null;
        const allCandidateWords = [...candidateTitle.split(/[\s,;.()!?-]+/), ...candidateKeywords.flatMap(k => k.split(/[\s,;.()!?-]+/))];
        for (const word of allCandidateWords) {
          if (word.length > 2 && isKnownLocation(word)) {
            candidateDestination = word;
            break;
          }
        }
        
        // Normaliser la destination candidate vers un pays
        const normalizedCandidateDest = candidateDestination ? (CITY_TO_COUNTRY[candidateDestination] || candidateDestination) : null;
        
        // Pays d'Asie du Sud-Est (pour bonus régional)
        const seaCountries = ['thailand', 'vietnam', 'indonesia', 'philippines', 'singapore', 'cambodia', 'malaysia', 'laos', 'myanmar'];
        const isRegionalArticle = seaCountries.includes(normalizedArticleDest) || 
          (seoData.main_destination || '').toLowerCase().includes('asie') || 
          (seoData.main_destination || '').toLowerCase().includes('asia');
        
        // Score bonus pour match destination (même pays) (+20 points)
        if (normalizedCandidateDest && normalizedArticleDest === normalizedCandidateDest) {
          score += 20;
          console.log(`   ✅ INTERNAL_LINK_MATCH: article_dest=${articleDestination} link_dest=${candidateDestination} (${normalizedArticleDest}) score_bonus=+20`);
        }
        // Bonus réduit pour articles de la même région (+10 au lieu de -10)
        else if (normalizedCandidateDest && isRegionalArticle && seaCountries.includes(normalizedCandidateDest)) {
          score += 10;
          console.log(`   ✅ INTERNAL_LINK_REGION: article_dest=${articleDestination} link_dest=${candidateDestination} (même région SEA) score_bonus=+10`);
        }
        // Pénalité pour destination hors région (-10 points)
        else if (normalizedCandidateDest && normalizedArticleDest !== normalizedCandidateDest) {
          score -= 10;
          console.log(`   ⚠️ INTERNAL_LINK_MISMATCH: article_dest=${articleDestination} link_dest=${candidateDestination} (${normalizedCandidateDest}≠${normalizedArticleDest}) score_penalty=-10`);
        }
      }
      
      // Bonus pilier : les URLs contenant guide/destination/conseils/budget/itineraire/visa
      // sont des pages structurantes qui renforcent le maillage interne
      const pillarKeywords = /guide|destination|conseils|budget|itineraire|visa/i;
      const isPillar = pillarKeywords.test(article.slug || '');
      if (isPillar) {
        score += 15;
      }
      
      if (score > 0) {
        matched.push({
          ...article,
          matchScore: score,
          isPillar
        });
      }
    }
    
    // Trier par score décroissant
    const sorted = matched.sort((a, b) => b.matchScore - a.matchScore);
    
    const filtered = sorted.filter(article => article.matchScore >= 3);
    
    if (filtered.length < sorted.length) {
      console.log(`   🔗 Liens filtrés: ${sorted.length} → ${filtered.length} (seuil pertinence: 5)`);
    }
    
    return filtered;
  }

  // ─── Helpers for contextual internal link injection ───

  _extractLinkKeywords(link) {
    const STOPWORDS = new Set([
      'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'mais', 'donc', 'car',
      'ne', 'pas', 'plus', 'très', 'tout', 'tous', 'toute', 'toutes', 'ce', 'cette', 'ces',
      'son', 'sa', 'ses', 'ton', 'ta', 'tes', 'mon', 'ma', 'mes', 'en', 'au', 'aux', 'avec',
      'pour', 'par', 'sur', 'dans', 'qui', 'que', 'quoi', 'dont', 'où',
      'est', 'sont', 'être', 'avoir', 'fait', 'faire', 'comme', 'sans', 'entre',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does',
      'not', 'no', 'how', 'what', 'when', 'where', 'which', 'who', 'why',
      'you', 'your', 'it', 'its', 'they', 'their', 'this', 'that', 'these', 'those',
      'from', 'than', 'more', 'each', 'every', 'some', 'any', 'other',
    ]);

    const GEO_VARIANTS = {
      'thailande': ['thaïlande', 'thailand', 'thai'],
      'vietnam': ['viêt nam', 'viet nam'],
      'indonesie': ['indonésie', 'indonesia'],
      'japon': ['japan'],
      'coree': ['corée', 'korea'],
      'malaisie': ['malaysia'],
      'singapour': ['singapore'],
      'cambodge': ['cambodia'],
      'bali': ['denpasar'],
      'phuket': [],
      'bangkok': [],
      'chiang': ['chiangmai', 'chiang mai'],
      'lombok': [],
      'tokyo': [],
      'osaka': [],
      'ubud': [],
    };

    const raw = new Set();
    const slug = (link.slug || '').toLowerCase();
    slug.split('-').forEach(w => { if (w.length > 2) raw.add(w); });

    const title = this.decodeHtmlEntitiesForAnchor(link.title || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\sàâéèêëïîôùûüç]/g, ' ');
    title.split(/\s+/).forEach(w => { if (w.length > 2) raw.add(w); });

    if (link.keywords) {
      link.keywords.forEach(kw => {
        const decoded = this.decodeHtmlEntitiesForAnchor(kw).toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (decoded.length > 2) raw.add(decoded);
      });
    }

    const keywords = new Set();
    for (const w of raw) {
      if (STOPWORDS.has(w)) continue;
      if (/^\d+$/.test(w)) continue;
      keywords.add(w);
      const variants = GEO_VARIANTS[w];
      if (variants) variants.forEach(v => keywords.add(v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    }
    return keywords;
  }

  _scoreParagraphForLink(paraText, linkKeywords) {
    const normalized = paraText
      .replace(/<[^>]+>/g, ' ')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\sàâéèêëïîôùûüç]/g, ' ');

    let hits = 0;
    for (const kw of linkKeywords) {
      if (normalized.includes(kw)) hits++;
    }
    return linkKeywords.size > 0 ? hits / linkKeywords.size : 0;
  }

  _findInlineAnchor(paraHtml, linkKeywords) {
    const plainText = paraHtml.replace(/<[^>]+>/g, '');
    const words = plainText.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 3) return null;

    const isAlreadyLinked = (startIdx) => {
      const target = words[startIdx];
      const pos = paraHtml.indexOf(target);
      if (pos < 0) return false;
      const before = paraHtml.substring(0, pos);
      const openA = (before.match(/<a[\s>]/gi) || []).length;
      const closeA = (before.match(/<\/a>/gi) || []).length;
      return openA > closeA;
    };

    const normalizeWord = (w) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]/g, '');

    const wordMatchesKw = (w, kw) => {
      if (w.length < 3 || kw.length < 3) return false;
      if (w === kw) return true;
      if (w.length >= 4 && kw.length >= 4) {
        if (w.startsWith(kw) || kw.startsWith(w)) return true;
      }
      return false;
    };

    let bestSequence = null;
    let bestScore = 0;
    let bestLen = Infinity;

    for (let windowSize = 2; windowSize <= 5; windowSize++) {
      for (let i = 0; i <= words.length - windowSize; i++) {
        const seq = words.slice(i, i + windowSize);
        const seqNormalized = seq.map(normalizeWord);
        let matchCount = 0;
        for (const kw of linkKeywords) {
          if (seqNormalized.some(w => wordMatchesKw(w, kw))) matchCount++;
        }
        if (matchCount < 2) continue;
        if (matchCount < bestScore) continue;
        if (matchCount === bestScore && seq.length >= bestLen) continue;
        if (isAlreadyLinked(i)) continue;
        const seqText = seq.join(' ');
        if (seqText.length < 8 || seqText.length > 60) continue;
        bestSequence = seqText;
        bestScore = matchCount;
        bestLen = seq.length;
      }
    }

    return bestSequence;
  }

  _getLinkTheme(linkKeywords) {
    const THEME_KEYWORDS = {
      visa:         ['visa', 'passeport', 'formalite', 'entree', 'sortie', 'frontiere', 'douane', 'immigration'],
      budget:       ['budget', 'cout', 'couts', 'prix', 'frais', 'depense', 'economiser', 'argent', 'euro', 'cher'],
      transport:    ['vol', 'vols', 'avion', 'aeroport', 'transport', 'train', 'bus', 'ferry', 'deplacement', 'billet'],
      hebergement:  ['hotel', 'hebergement', 'logement', 'airbnb', 'hostel', 'auberge', 'nuit', 'chambre', 'coliving'],
      itineraire:   ['itineraire', 'parcours', 'trajet', 'etape', 'jours', 'semaines', 'planifier', 'route'],
      sante:        ['vaccin', 'sante', 'medical', 'assurance', 'hopital', 'maladie', 'rage'],
      connectivite: ['esim', 'sim', 'internet', 'wifi', 'connexion', 'roaming', 'telephone'],
      travail:      ['coworking', 'nomade', 'digital', 'remote', 'travail', 'travailler', 'freelance', 'fiscal'],
    };

    let bestTheme = 'general';
    let bestCount = 0;
    for (const [theme, themeKws] of Object.entries(THEME_KEYWORDS)) {
      let count = 0;
      for (const kw of linkKeywords) {
        if (themeKws.some(tk => kw.includes(tk) || tk.includes(kw))) count++;
      }
      if (count > bestCount) { bestCount = count; bestTheme = theme; }
    }
    return bestTheme;
  }

  _buildTransitionPhrase(link, theme) {
    const TEMPLATES = {
      visa:         ['Si tu prépares aussi ton visa, on a détaillé ', 'Côté formalités, ', 'Pour anticiper les démarches de visa, '],
      budget:       ['Pour aller plus loin sur les coûts réels, ', 'Côté budget, ', 'Sur la question des dépenses, ', 'Pour anticiper les frais, ', 'Si le budget te préoccupe, '],
      transport:    ['Pour comparer les options de transport, ', 'Côté vols et déplacements, ', 'Sur la logistique des transports, '],
      hebergement:  ['Pour l\'hébergement, ', 'Si tu cherches où dormir, ', 'Côté logement, '],
      itineraire:   ['Si tu hésites sur ton itinéraire, ', 'Pour affiner ton parcours, ', 'Côté planification, '],
      sante:        ['Côté santé et prévention, ', 'Pour les précautions médicales, '],
      connectivite: ['Pour rester connecté sur place, ', 'Côté connectivité, '],
      travail:      ['Si tu comptes travailler sur place, ', 'Côté coworking et nomadisme, ', 'Pour le travail à distance, '],
      general:      ['On a aussi détaillé ', 'Dans le même esprit, ', 'Pour compléter, '],
    };

    const decodedTitle = this.decodeHtmlEntitiesForAnchor(link.title);
    const words = decodedTitle.split(/\s+/).filter(w => w.length > 0);
    let shortAnchor = words.slice(0, Math.min(8, words.length)).join(' ');
    if (shortAnchor.length > 55) {
      shortAnchor = shortAnchor.substring(0, 55).replace(/\s+\S*$/, '') || shortAnchor.substring(0, 55);
    }

    const templates = TEMPLATES[theme] || TEMPLATES.general;
    if (!this._transitionCounters) this._transitionCounters = {};
    const idx = (this._transitionCounters[theme] || 0) % templates.length;
    this._transitionCounters[theme] = idx + 1;
    const template = templates[idx];
    const linkHtml = `<a href="${this.escapeHtml(link.url)}">${this.escapeHtml(shortAnchor)}</a>`;
    return `${template}${linkHtml}.`;
  }

  // ─── Main contextual link injection ───

  /**
   * Injecte les liens internes de manière contextuelle dans le corps de l'article.
   * Stratégie : ancrage inline sur texte existant > phrase de transition > section fallback.
   */
  injectLinksIntoRelatedSection(html, links) {
    let modifiedHtml = html;
    const MAX_INTERNAL_LINKS = 5;
    const MIN_SCORE = 0.15;

    const alreadyInjected = new Set();
    const existingLinks = html.match(/href="https?:\/\/flashvoyage\.com\/[^"]*"/g) || [];
    existingLinks.forEach(h => alreadyInjected.add(h));
    links = links.filter(l => !alreadyInjected.has(`href="${l.url}"`));
    if (links.length === 0) return html;

    const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gs;
    const paragraphs = [];
    let match;
    while ((match = paragraphRegex.exec(html)) !== null) {
      if (match[1].length < 50) continue;
      if (/<p[^>]*class="[^"]*internal-link-transition/.test(match[0])) continue;
      paragraphs.push({ index: match.index, fullMatch: match[0], content: match[1] });
    }

    if (paragraphs.length === 0) {
      const linksHtml = links.map(link =>
        `  <li><a href="${this.escapeHtml(link.url)}">${this.escapeHtml(this.decodeHtmlEntitiesForAnchor(link.title))}</a></li>`
      ).join('\n');
      return html + `\n\n<h2>À lire aussi</h2>\n<ul>\n${linksHtml}\n</ul>`;
    }

    const firstH2Pos = html.search(/<h2[\s>]/i);
    const forbiddenSections = /ce qu.il faut retenir|nos recommandations|articles connexes|à lire|foire aux questions|FAQ/i;
    const eligibleParagraphs = paragraphs.filter(p => {
      if (firstH2Pos > 0 && p.index <= firstH2Pos) return false;
      const before200 = html.substring(Math.max(0, p.index - 300), p.index);
      const lastH2 = before200.match(/<h2[^>]*>(.*?)<\/h2>/gi);
      if (lastH2 && lastH2.some(h => forbiddenSections.test(h))) return false;
      return true;
    });

    if (eligibleParagraphs.length === 0) {
      const linksHtml = links.map(link =>
        `  <li><a href="${this.escapeHtml(link.url)}">${this.escapeHtml(this.decodeHtmlEntitiesForAnchor(link.title))}</a></li>`
      ).join('\n');
      return html + `\n\n<h3>À lire également</h3>\n<ul>\n${linksHtml}\n</ul>`;
    }

    const sortedLinks = [...links].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)).slice(0, MAX_INTERNAL_LINKS);
    const usedParagraphs = new Set();
    const unplacedLinks = [];

    for (const link of sortedLinks) {
      const linkKeywords = this._extractLinkKeywords(link);

      let bestPara = null;
      let bestScore = 0;
      for (const para of eligibleParagraphs) {
        if (usedParagraphs.has(para.index)) continue;
        const score = this._scoreParagraphForLink(para.content, linkKeywords);
        if (score > bestScore) { bestScore = score; bestPara = para; }
      }

      if (!bestPara || bestScore < MIN_SCORE) {
        unplacedLinks.push(link);
        continue;
      }

      usedParagraphs.add(bestPara.index);

      const inlineAnchor = this._findInlineAnchor(bestPara.content, linkKeywords);
      if (inlineAnchor) {
        const linkTag = `<a href="${this.escapeHtml(link.url)}">${inlineAnchor}</a>`;
        const newContent = bestPara.content.replace(inlineAnchor, linkTag);
        if (newContent !== bestPara.content) {
          const newPara = `<p${bestPara.fullMatch.match(/^<p([^>]*)>/)?.[1] || ''}>${newContent}</p>`;
          modifiedHtml = modifiedHtml.replace(bestPara.fullMatch, newPara);
          bestPara.fullMatch = newPara;
          bestPara.content = newContent;
          console.log(`   🔗 Lien interne (inline): "${inlineAnchor}" → ${link.slug}`);
          continue;
        }
      }

      const theme = this._getLinkTheme(linkKeywords);
      const transitionPhrase = this._buildTransitionPhrase(link, theme);
      const insertionPoint = bestPara.fullMatch;
      const transitionP = `<p class="internal-link-transition">${transitionPhrase}</p>`;
      modifiedHtml = modifiedHtml.replace(insertionPoint, insertionPoint + '\n' + transitionP);
      console.log(`   🔗 Lien interne (transition ${theme}): ${link.slug}`);
    }

    if (unplacedLinks.length > 0) {
      const hasExistingFallback = /À lire aussi|À lire également|Articles connexes/i.test(modifiedHtml);
      if (hasExistingFallback) {
        const existingList = modifiedHtml.match(/<h3>[^<]*(?:À lire aussi|À lire également)[^<]*<\/h3>\s*<ul>([\s\S]*?)<\/ul>/i);
        if (existingList) {
          const newItems = unplacedLinks.map(link => {
            const decoded = this.decodeHtmlEntitiesForAnchor(link.title);
            const words = decoded.split(/\s+/).filter(w => w.length > 0);
            let anchor = words.slice(0, 8).join(' ');
            if (anchor.length > 55) anchor = anchor.substring(0, 55).replace(/\s+\S*$/, '');
            return `  <li><a href="${this.escapeHtml(link.url)}">${this.escapeHtml(anchor)}</a></li>`;
          }).join('\n');
          modifiedHtml = modifiedHtml.replace(existingList[0], existingList[0].replace('</ul>', newItems + '\n</ul>'));
          console.log(`   🔗 Lien(s) interne(s) ajoutés au fallback existant: ${unplacedLinks.length}`);
        }
      } else {
        const retainSection = modifiedHtml.search(/<h2[^>]*>[^<]*ce qu.il faut retenir/i);
        const recoSection = modifiedHtml.search(/<h2[^>]*>[^<]*nos recommandations/i);
        const insertBefore = retainSection > 0 ? retainSection : (recoSection > 0 ? recoSection : -1);

        const listItems = unplacedLinks.map(link => {
          const decoded = this.decodeHtmlEntitiesForAnchor(link.title);
          const words = decoded.split(/\s+/).filter(w => w.length > 0);
          let anchor = words.slice(0, 8).join(' ');
          if (anchor.length > 55) anchor = anchor.substring(0, 55).replace(/\s+\S*$/, '');
          return `  <li><a href="${this.escapeHtml(link.url)}">${this.escapeHtml(anchor)}</a></li>`;
        }).join('\n');
        const fallbackSection = `\n<h3>À lire aussi</h3>\n<ul>\n${listItems}\n</ul>\n\n`;

        if (insertBefore > 0) {
          modifiedHtml = modifiedHtml.slice(0, insertBefore) + fallbackSection + modifiedHtml.slice(insertBefore);
        } else {
          modifiedHtml += fallbackSection;
        }
        console.log(`   🔗 Lien(s) interne(s) fallback (section): ${unplacedLinks.length} lien(s)`);
      }
    }

    return modifiedHtml;
  }

  /**
   * STUB: Optimisation des liens internes (déprécié, utiliser injectInternalLinks)
   * @param {string} html - HTML
   * @param {Object} extracted - Données extraites
   * @param {Object} storyData - Données de la story
   * @param {Object} report - Rapport QA
   * @returns {string} HTML modifié
   */
  optimizeInternalLinks(html, extracted, storyData, report) {
    // Déprécié: utiliser injectInternalLinks à la place
    return html;
  }

  /**
   * STUB: Optimisation des mots-clés
   * @param {string} html - HTML
   * @param {Object} extracted - Données extraites
   * @param {Object} storyData - Données de la story
   * @param {Object} report - Rapport QA
   * @returns {string} HTML modifié
   */
  optimizeKeywords(html, extracted, storyData, report) {
    // TODO: Implémenter l'optimisation des mots-clés
    // - Ajouter des mots-clés pertinents dans le contenu
    // - Utiliser uniquement des tokens de extracted/storyData
    return html;
  }
}

export default SeoOptimizer;
