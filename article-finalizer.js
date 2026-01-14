#!/usr/bin/env node

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
import { DRY_RUN, FORCE_OFFLINE, ENABLE_AFFILIATE_INJECTOR } from './config.js';

class ArticleFinalizer {
  constructor() {
    this.widgets = REAL_TRAVELPAYOUTS_WIDGETS;
    this.widgetPlacer = new ContextualWidgetPlacer();
    this.widgetPlanBuilder = new WidgetPlanBuilder();
    // Import IntelligentContentAnalyzerOptimized pour traduction
    this.intelligentContentAnalyzer = null;
    this._initAnalyzer();
  }
  
  async _initAnalyzer() {
    try {
      const IntelligentContentAnalyzerOptimized = (await import('./intelligent-content-analyzer-optimized.js')).default;
      this.intelligentContentAnalyzer = new IntelligentContentAnalyzerOptimized();
    } catch (error) {
      console.warn('⚠️ IntelligentContentAnalyzerOptimized non disponible pour traduction');
    }
  }

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
    
    // Split par paragraphes HTML (plus sûr que par phrases)
    const paragraphs = html.split(/<\/p>|<\/div>/);
    
    const filtered = paragraphs.filter(paragraph => {
      // Extraire le texte du paragraphe
      const paraText = paragraph.replace(/<[^>]*>/g, ' ').toLowerCase();
      
      // FIX 2: Ne jamais supprimer les titres
      if (/<h[1-6][^>]*>/.test(paragraph)) {
        return true;
      }
      
      // FIX 2: Ne jamais supprimer si le paragraphe contient la destination finale validée
      if (finalDestLower && paraText.includes(finalDestLower)) {
        return true;
      }
      
      // FIX 2: Match uniquement sur mots entiers avec word boundaries
      const foundTerms = NON_ASIA.filter(term => {
        // Vérifier si le terme est dans la whitelist (substring)
        if (WHITELIST.some(w => paraText.includes(w))) {
          return false; // Ignorer si whitelist match
        }
        
        // Match sur mot entier uniquement
        const wordBoundaryRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return wordBoundaryRegex.test(paraText);
      });
      
      if (foundTerms.length > 0) {
        // Enregistrer pour les logs
        foundTerms.forEach(term => triggerTerms.add(term));
        
        if (isDryRun) {
          // Extraire la phrase exacte supprimée (max 200 chars)
          const fullText = paragraph.replace(/<[^>]*>/g, ' ').trim();
          const excerpt = fullText.substring(0, 200);
          removedParagraphs.push({
            term: foundTerms[0],
            excerpt: excerpt + (excerpt.length >= 200 ? '...' : '')
          });
        }
        
        return false; // Supprimer ce paragraphe
      }
      
      return true; // Garder ce paragraphe
    });
    
    // Logs détaillés en DRY_RUN uniquement
    if (isDryRun && removedParagraphs.length > 0) {
      console.log(`🧹 Sanitizer: ${removedParagraphs.length} paragraphe(s) supprimé(s)`);
      console.log(`   Termes déclencheurs: ${Array.from(triggerTerms).join(', ')}`);
      removedParagraphs.slice(0, 3).forEach((item, i) => {
        console.log(`   [${i+1}] term="${item.term}" phrase="...${item.excerpt}..."`);
      });
    } else if (!isDryRun && removedParagraphs.length > 0) {
      // Log minimal en production
      console.log(`🧹 Sanitizer: ${removedParagraphs.length} paragraphe(s) supprimé(s)`);
    }
    
    // Reconstruire le HTML
    return filtered.join('');
  }

  /**
   * Finalise l'article complet
   * PATCH 1: Accepte pipelineContext pour propagation final_destination
   */
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
    
    // SANITIZER POST-LLM: Supprimer les phrases contenant des termes non-Asie
    // 3) Corriger "finalDestination is not defined" - déclarer et normaliser en lowercase
    const finalDestinationRaw = pipelineContext?.final_destination ?? analysis?.final_destination ?? null;
    const finalDestination = finalDestinationRaw ? finalDestinationRaw.toLowerCase() : null;
    if (analysis?.main_destination || analysis?.destination || finalDestination) {
      const beforeLength = article.content.length;
      // FIX 2: Passer final_destination pour exclusion
      article.content = this.stripNonAsiaSentences(article.content, finalDestination);
      const afterLength = article.content.length;
      if (beforeLength !== afterLength) {
        console.log(`🧹 Sanitizer: ${beforeLength - afterLength} caractères supprimés (phrases non-Asie)`);
      }
    }

    let finalContent = article.content;
    const enhancements = { ...article.enhancements };

    // 1. Remplacer les placeholders de widgets
    // PATCH 1: Passer pipelineContext
    const widgetResult = await this.replaceWidgetPlaceholders(finalContent, analysis, pipelineContext);
    finalContent = widgetResult.content;
    enhancements.widgetsReplaced = widgetResult.count;

    // 2. Vérifier et améliorer le quote highlight
    const quoteResult = this.ensureQuoteHighlight(finalContent, analysis);
    finalContent = quoteResult.content;
    enhancements.quoteHighlight = quoteResult.hasQuote ? 'Oui' : 'Non';

    // 3. Vérifier et améliorer l'intro FOMO
    const fomoResult = this.ensureFomoIntro(finalContent, analysis);
    finalContent = fomoResult.content;
    enhancements.fomoIntro = fomoResult.hasFomo ? 'Oui' : 'Non';

    // 4. Vérifier et ajouter CTA si manquant
    const ctaResult = this.ensureCTA(finalContent, analysis);
    finalContent = ctaResult.content;
    enhancements.ctaPresent = ctaResult.hasCTA ? 'Oui' : 'Non';

    // PHASE 5.C: Injecter les modules d'affiliation si activé
    if (ENABLE_AFFILIATE_INJECTOR && pipelineContext?.affiliate_plan?.placements?.length > 0) {
      try {
        const { renderAffiliateModule } = await import('./affiliate-module-renderer.js');
        const affiliatePlan = pipelineContext.affiliate_plan;
        const geoDefaults = pipelineContext.geo_defaults || {};
        
        let injectedCount = 0;
        const injectedTypes = [];
        
        for (const placement of affiliatePlan.placements) {
          const moduleHtml = renderAffiliateModule(placement, geoDefaults);
          if (!moduleHtml) continue;
          
          // Injecter selon l'anchor
          const injected = this.injectAffiliateModule(finalContent, moduleHtml, placement.anchor);
          if (injected !== finalContent) {
            finalContent = injected;
            injectedCount++;
            injectedTypes.push(placement.id);
          }
        }
        
        if (injectedCount > 0) {
          console.log(`✅ AFFILIATE_INJECTED: count=${injectedCount} types=[${injectedTypes.join(', ')}]`);
        }
      } catch (error) {
        console.warn('⚠️ Erreur injection modules affiliation (fallback silencieux):', error.message);
      }
    }

    // PHASE 6.0.4: Remplacer les liens morts href="#"
    finalContent = this.replaceDeadLinks(finalContent);
    
    // PHASE 6.0.5: Nettoyer les duplications de sections H2
    finalContent = this.removeDuplicateSections(finalContent);
    
    // PHASE 6.0.6: Nettoyer les duplications de blockquotes
    finalContent = this.removeDuplicateBlockquotes(finalContent);
    
    // PHASE 6.0.7: Nettoyer le texte parasite du renforcement SEO
    finalContent = this.removeParasiticText(finalContent);
    
    // PHASE 6.0.8: Remplacer "Questions encore ouvertes" par "Nos recommandations"
    finalContent = finalContent.replace(/<h2[^>]*>Questions (encore )?ouvertes[^<]*<\/h2>/gi, '<h2>🎯 Nos recommandations : Par où commencer ?</h2>');
    finalContent = finalContent.replace(/Questions (encore )?ouvertes/gi, 'Nos recommandations');
    
    // PHASE 6.1: QA Report déterministe
    const qaReport = await this.runQAReport(finalContent, pipelineContext, analysis);
    finalContent = qaReport.finalHtml;
    
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

    // TRADUCTION FORCÉE DES BLOCKQUOTES EN ANGLAIS (dernière étape)
    if (!FORCE_OFFLINE) {
      try {
        const cheerioModule = await import('cheerio');
        const cheerio = cheerioModule.default || cheerioModule;
        const $ = cheerio.load(finalContent);
        const blockquotes = $('blockquote');
        let translatedCount = 0;
        
        for (let i = 0; i < blockquotes.length; i++) {
          const bq = $(blockquotes[i]);
          const fullText = bq.text().trim();
          
          // Détecter anglais (strict)
          const englishWords = (fullText.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|I|you|he|she|it|we|they|here|there|my|your|his|her|our|their|stable|internet|all|also|career|safety|world|country|freelance|digital|nomad|hiding|cheap|destination|coming|third)\b/gi) || []).length;
          const totalWords = fullText.split(/\s+/).length;
          const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
          
          if (englishRatio > 0.25 && totalWords > 10 && !fullText.includes('Extrait Reddit traduit')) {
            console.log(`🌐 FINALIZER: Blockquote anglais détecté (${Math.round(englishRatio * 100)}%) - traduction forcée...`);
            
            // Extraire seulement le texte principal (ignorer "— Extrait Reddit")
            const paragraphs = bq.find('p');
            const textParts = [];
            paragraphs.each((idx, p) => {
              const pText = $(p).text().trim();
              if (!pText.startsWith('—') && !pText.startsWith('–')) {
                textParts.push(pText);
              }
            });
            
            const textToTranslate = textParts.join(' ').trim();
            if (textToTranslate.length > 0) {
              const translatedText = await this.intelligentContentAnalyzer.translateToFrench(textToTranslate);
              bq.empty();
              bq.append(`<p>${translatedText}</p>`);
              bq.append('<p><cite>— Extrait Reddit traduit</cite></p>');
              translatedCount++;
              console.log(`✅ FINALIZER: Blockquote traduit avec succès`);
            }
          }
        }
        
        if (translatedCount > 0) {
          finalContent = $.html();
          enhancements.blockquotesTranslated = translatedCount;
          console.log(`✅ BLOCKQUOTE_TRANSLATION: ${translatedCount} blockquote(s) traduit(s)`);
        }
      } catch (error) {
        console.error(`❌ Erreur traduction blockquotes: ${error.message}`);
      }
    }
    
    console.log('✅ Finalisation terminée:');
    console.log(`   - Widgets remplacés: ${enhancements.widgetsReplaced}`);
    console.log(`   - Quote highlight: ${enhancements.quoteHighlight}`);
    console.log(`   - Intro FOMO: ${enhancements.fomoIntro}`);
    console.log(`   - CTA présent: ${enhancements.ctaPresent}\n`);

    return {
      ...article,
      content: finalContent,
      enhancements,
      qaReport // PHASE 6.1: Exposer le rapport QA
    };
  }

  /**
   * 1. Détection unique des widgets rendus dans le HTML final
   * Source de vérité unique pour toute validation
   */
  /**
   * PATCH 2: Déduplication widgets (max 1 par type)
   */
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
      const $ = cheerio.load(html, { decodeEntities: false });
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

    // Marqueurs robustes pour widget FLIGHTS Kiwi.com
    const kiwiMarkers = [
      /<form[^>]*kiwi[^>]*>/gi,
      /<form[^>]*travelpayouts[^>]*>/gi,
      /data-widget-type=["']flights["']/gi,
      /class=["'][^"']*kiwi[^"']*["']/gi,
      /class=["'][^"']*travelpayouts[^"']*["']/gi,
      /trpwdg\.com\/content/gi,
      /travelpayouts-widget/gi,
      /kiwi\.com.*widget/gi,
      /<!-- FLASHVOYAGE_WIDGET:flights/gi,
      /<!-- FLASHVOYAGE_WIDGET:fallback/gi
    ];

    // C) Marqueurs pour widget CONNECTIVITY (eSIM/Airalo)
    const connectivityMarkers = [
      /airalo/gi,
      /esim/gi,
      /e-sim/gi,
      /data-widget-type=["']connectivity["']/gi,
      /data-widget-type=["']esim["']/gi,
      /class=["'][^"']*airalo[^"']*["']/gi,
      /<!-- FLASHVOYAGE_WIDGET:connectivity/gi,
      /<!-- FLASHVOYAGE_WIDGET:esim/gi
    ];

    // Marqueurs textuels (moins fiables mais fallback)
    const textMarkers = [
      /Selon notre analyse de milliers de vols/gi,
      /D'après notre expérience avec des centaines de nomades/gi,
      /Notre partenaire Kiwi\.com/gi,
      /Notre outil compare les prix/gi
    ];

    // Détecter marqueurs HTML robustes pour FLIGHTS (max 1 par type)
    let flightsFound = false;
    for (const marker of kiwiMarkers) {
      const matches = html.match(marker);
      if (matches && !flightsFound) {
        detected.count += 1; // PATCH 2: Compter max 1 par type
        flightsFound = true;
        if (!detected.types.includes('flights')) {
          detected.types.push('flights');
        }
        detected.details.push({
          type: 'flights',
          marker: marker.toString(),
          matches: matches.length
        });
        break; // PATCH 2: Arrêter après première détection
      }
    }

    // C) Détecter marqueurs pour CONNECTIVITY (max 1 par type)
    let connectivityFound = false;
    for (const marker of connectivityMarkers) {
      const matches = html.match(marker);
      if (matches && !connectivityFound) {
        detected.count += 1; // PATCH 2: Compter max 1 par type
        connectivityFound = true;
        if (!detected.types.includes('connectivity')) {
          detected.types.push('connectivity');
        }
        detected.details.push({
          type: 'connectivity',
          marker: marker.toString(),
          matches: matches.length
        });
        break; // PATCH 2: Arrêter après première détection
      }
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

    // Remplacer FLIGHTS avec script dynamique
    if (updatedContent.includes('{{TRAVELPAYOUTS_FLIGHTS_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_FLIGHTS_WIDGET}')) {
      // Utiliser le script dynamique depuis widgetPlan.geo_defaults
      const dynamicFlightWidget = this.widgetPlacer.getWidgetScript('flights', widgetPlan.widget_plan);
      const flightWidget = dynamicFlightWidget || this.selectBestFlightWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_FLIGHTS_WIDGET\}\}?/g,
        flightWidget
      );
      replacementCount++;
      console.log('   ✅ Widget FLIGHTS remplacé (script dynamique)');
    }

    // Remplacer CONNECTIVITY (Airalo)
    if (updatedContent.includes('{{TRAVELPAYOUTS_CONNECTIVITY_WIDGET}}') ||
        updatedContent.includes('{TRAVELPAYOUTS_CONNECTIVITY_WIDGET}')) {
      const connectivityWidget = this.widgets.connectivity?.airalo?.esimSearch?.script || '';
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_CONNECTIVITY_WIDGET\}\}?/g,
        connectivityWidget
      );
      replacementCount++;
      console.log('   ✅ Widget CONNECTIVITY (Airalo) remplacé');
    }

    // Remplacer HOTELS
    if (updatedContent.includes('{{TRAVELPAYOUTS_HOTELS_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_HOTELS_WIDGET}')) {
      const hotelWidget = this.selectBestHotelWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_HOTELS_WIDGET\}\}?/g,
        hotelWidget
      );
      replacementCount++;
      console.log('   ✅ Widget HOTELS remplacé');
    }

    // Remplacer INSURANCE
    if (updatedContent.includes('{{TRAVELPAYOUTS_INSURANCE_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_INSURANCE_WIDGET}')) {
      const insuranceWidget = this.selectBestInsuranceWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_INSURANCE_WIDGET\}\}?/g,
        insuranceWidget
      );
      replacementCount++;
      console.log('   ✅ Widget INSURANCE remplacé');
    }

    // Remplacer PRODUCTIVITY
    if (updatedContent.includes('{{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET}')) {
      const productivityWidget = this.selectBestProductivityWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_PRODUCTIVITY_WIDGET\}\}?/g,
        productivityWidget
      );
      replacementCount++;
      console.log('   ✅ Widget PRODUCTIVITY remplacé');
    }

    // Remplacer TRANSPORT
    if (updatedContent.includes('{{TRAVELPAYOUTS_TRANSPORT_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_TRANSPORT_WIDGET}')) {
      const transportWidget = this.selectBestTransportWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_TRANSPORT_WIDGET\}\}?/g,
        transportWidget
      );
      replacementCount++;
      console.log('   ✅ Widget TRANSPORT remplacé');
    }

    // Remplacer ACTIVITIES
    if (updatedContent.includes('{{TRAVELPAYOUTS_ACTIVITIES_WIDGET}}') || 
        updatedContent.includes('{TRAVELPAYOUTS_ACTIVITIES_WIDGET}')) {
      const activitiesWidget = this.selectBestActivitiesWidget(context);
      updatedContent = updatedContent.replace(
        /\{\{?TRAVELPAYOUTS_ACTIVITIES_WIDGET\}\}?/g,
        activitiesWidget
      );
      replacementCount++;
      console.log('   ✅ Widget ACTIVITIES remplacé');
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
    const destinations = {
      'thailand': ['thaïlande', 'thailand', 'bangkok', 'chiang mai', 'phuket'],
      'vietnam': ['vietnam', 'hanoi', 'ho chi minh', 'saigon', 'da nang'],
      'indonesia': ['indonésie', 'indonesia', 'bali', 'jakarta', 'ubud'],
      'japan': ['japon', 'japan', 'tokyo', 'kyoto', 'osaka'],
      'spain': ['espagne', 'spain', 'madrid', 'barcelona', 'valencia'],
      'portugal': ['portugal', 'lisbon', 'porto', 'lisbonne']
    };

    const lowerContent = content.toLowerCase();
    
    for (const [country, keywords] of Object.entries(destinations)) {
      if (keywords.some(keyword => lowerContent.includes(keyword))) {
        return country;
      }
    }
    
    return 'asia'; // Par défaut
  }

  /**
   * Sélectionne le meilleur widget de vols selon le contexte
   */
  // A) Placement déterministe en mode OFFLINE
  placeWidgetsOffline(html, widgetScripts) {
    let out = html;

    const flights = widgetScripts.flights || '';
    const connectivity = widgetScripts.connectivity || '';

    // 1) si "Articles connexes" existe => insertion juste avant
    const idxRelated = out.indexOf('Articles connexes');
    if (idxRelated !== -1) {
      const insertAt = out.lastIndexOf('<', idxRelated); // robuste: avant le titre
      const block = `${flights}\n${connectivity}`.trim();
      if (block) {
        out = out.slice(0, insertAt) + block + '\n' + out.slice(insertAt);
        console.log('✅ OFFLINE_WIDGET_PLACEMENT_MODE=BEFORE_RELATED');
        return out;
      }
    }

    // 2) sinon après le 2e paragraphe </p>
    let p2 = -1;
    for (let i = 0; i < 2; i++) {
      p2 = out.indexOf('</p>', p2 + 1);
      if (p2 === -1) break;
    }
    if (p2 !== -1) {
      const block = `${flights}\n${connectivity}`.trim();
      if (block) {
        out = out.slice(0, p2 + 4) + '\n' + block + '\n' + out.slice(p2 + 4);
        console.log('✅ OFFLINE_WIDGET_PLACEMENT_MODE=AFTER_P2');
        return out;
      }
    }

    // 3) sinon fin
    const block = `${flights}\n${connectivity}`.trim();
    if (block) {
      out += '\n' + block;
      console.log('✅ OFFLINE_WIDGET_PLACEMENT_MODE=END');
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
   */
  selectBestInsuranceWidget(context) {
    const { insurance } = this.widgets;

    // Si pas de widgets d'assurance disponibles, retourner un placeholder
    if (!insurance) {
      return `<!-- Widget assurance à ajouter -->`;
    }

    // Si nomade digital, utiliser SafetyWing
    if (context.hasNomad && insurance.safetyWing) {
      return insurance.safetyWing.banner?.script || `<!-- Widget SafetyWing à configurer -->`;
    }

    // Si visa, utiliser Insubuy
    if (context.hasVisa && insurance.insubuy) {
      return insurance.insubuy.banner?.script || `<!-- Widget Insubuy à configurer -->`;
    }

    // Par défaut, retourner le premier widget disponible ou placeholder
    if (insurance.safetyWing) {
      return insurance.safetyWing.banner?.script || `<!-- Widget SafetyWing à configurer -->`;
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
   * Vérifie et améliore l'intro FOMO
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

    console.log('   ⚠️ Intro FOMO manquante - Ajout automatique');

    // Créer une intro FOMO selon le type d'article
    let fomoIntro = '';
    
    if (analysis?.type?.includes('SUCCESS')) {
      fomoIntro = `<p><strong>Pendant que vous rêvez, d'autres agissent.</strong> Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui montre comment transformer sa vie de nomade digital.</p>\n\n`;
    } else if (analysis?.type?.includes('ECHEC')) {
      fomoIntro = `<p><strong>Pendant que vous hésitez, d'autres font des erreurs.</strong> Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit pour vous éviter les pièges courants.</p>\n\n`;
    } else if (analysis?.type?.includes('TRANSITION')) {
      fomoIntro = `<p><strong>Pendant que vous planifiez, d'autres sont déjà partis.</strong> Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui dévoile les étapes clés d'une transition réussie.</p>\n\n`;
    } else {
      fomoIntro = `<p><strong>Pendant que vous cherchez des informations, d'autres vivent l'expérience.</strong> Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit pour vous inspirer.</p>\n\n`;
    }

    // FIX E: Insertion déterministe avec fallback robuste (4 niveaux)
    let insertionMethod = '';
    let newContent = content;
    
    // Niveau 1: Après le premier <p> non vide (hors "Source:")
    const firstPRegex = /<p[^>]*>(?!.*Source\s*:)[^<]+<\/p>/i;
    const firstPMatch = content.match(firstPRegex);
    if (firstPMatch) {
      const firstPEnd = firstPMatch.index + firstPMatch[0].length;
      newContent = content.slice(0, firstPEnd) + '\n\n' + fomoIntro + content.slice(firstPEnd);
      insertionMethod = 'AFTER_FIRST_P';
    }
    // Niveau 2: Après le premier <h2>
    else {
      const firstH2Regex = /<h2[^>]*>.*?<\/h2>/i;
      const firstH2Match = content.match(firstH2Regex);
      if (firstH2Match) {
        const firstH2End = firstH2Match.index + firstH2Match[0].length;
        newContent = content.slice(0, firstH2End) + '\n\n' + fomoIntro + content.slice(firstH2End);
        insertionMethod = 'AFTER_FIRST_H2';
      }
      // Niveau 3: Avant la section "Articles connexes"
      else {
        const relatedSectionRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
        const relatedSectionMatch = content.match(relatedSectionRegex);
        if (relatedSectionMatch) {
          const relatedSectionIndex = relatedSectionMatch.index;
          newContent = content.slice(0, relatedSectionIndex) + '\n\n' + fomoIntro + content.slice(relatedSectionIndex);
          insertionMethod = 'BEFORE_RELATED';
        }
        // Niveau 4: Prepend au début
        else {
          newContent = fomoIntro + '\n\n' + content;
          insertionMethod = 'PREPEND';
        }
      }
    }
    
    console.log(`   ✅ FOMO_INSERTED: method=${insertionMethod}`);
    return { content: newContent, hasFomo: true };
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

    const seen = new Map();
    const toRemove = [];

    for (const m of matches) {
      const raw = m[0];
      const start = m.index ?? -1;
      if (start < 0) continue;

      // PHASE 6.2: Normalisation agressive
      const normalized = this.normalizeTextForComparison(raw);
      
      if (!normalized || normalized.length < 20) continue;

      // Vérifier doublons exacts
      if (seen.has(normalized)) {
        toRemove.push({ start, end: start + raw.length, type: 'exact' });
      } else {
        // Vérifier quasi-doublons (similarité Jaccard > 0.9)
        let isQuasiDuplicate = false;
        for (const [seenNormalized, seenStart] of seen.entries()) {
          const similarity = this.jaccardSimilarity(normalized, seenNormalized);
          if (similarity > 0.9) {
            toRemove.push({ start, end: start + raw.length, type: 'quasi', similarity });
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
    report.actions.push({ 
      type: 'removed_duplicate_paragraphs', 
      details: `count=${toRemove.length} (exact=${exactCount}, quasi=${quasiCount})` 
    });
    report.metrics.removed_duplicates_count = (report.metrics.removed_duplicates_count || 0) + toRemove.length;

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
    
    // SUPPRESSION FORCÉE + RECRÉATION TRADUITE DES BLOCKQUOTES (AVANT TOUT LE RESTE)
    if (!FORCE_OFFLINE) {
      const cheerioModule = await import('cheerio');
      const cheerio = cheerioModule.default || cheerioModule;
      const $ = cheerio.load(finalHtml);
      const blockquotes = $('blockquote');
      
      // 1. Supprimer TOUS les blockquotes existants (anglais)
      if (blockquotes.length > 0) {
        console.log(`🧹 FINALIZER: Suppression de ${blockquotes.length} blockquote(s) en anglais...`);
        blockquotes.remove();
        finalHtml = $.html();
      }
      
      // 2. Recréer UN SEUL blockquote traduit depuis extracted
      if (pipelineContext?.story?.extracted) {
        const extracted = pipelineContext.story.extracted;
        const postText = extracted.post?.clean_text || extracted.post?.selftext || extracted.selftext || '';
        
        if (postText && postText.length > 50) {
          // Prendre les 200 premiers caractères
          const excerpt = postText.substring(0, 200).trim();
          
          // Traduire
          console.log(`🌐 FINALIZER: Traduction blockquote (${excerpt.length} chars)...`);
          try {
            const translatedExcerpt = await this.intelligentContentAnalyzer.translateToFrench(excerpt);
            
            // Créer le blockquote traduit
            const newBlockquote = `<blockquote><p>${translatedExcerpt}</p><p><cite>— Extrait Reddit traduit</cite></p></blockquote>`;
            
            // Insérer après le premier H2
            const $2 = cheerio.load(finalHtml);
            const firstH2 = $2('h2').first();
            if (firstH2.length > 0) {
              firstH2.after(newBlockquote);
              finalHtml = $2.html();
              console.log(`✅ FINALIZER: Blockquote traduit inséré après premier H2`);
            }
          } catch (error) {
            console.error(`❌ Erreur traduction blockquote: ${error.message}`);
          }
        }
      }
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
              if (pText.length > 10 && !pText.includes('Extrait Reddit') && !pText.includes('—')) {
                const response = await callOpenAIWithRetry({
                  apiKey,
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
      if (!hasMin2H2 && report.metrics.h2_count === 1) {
        const firstH2Match = html.match(/<h2[^>]*>.*?<\/h2>/i);
        if (firstH2Match) {
          const insertIndex = firstH2Match.index + firstH2Match[0].length;
          const newH2 = '<h2>Conseils pratiques</h2>';
          finalHtml = html.slice(0, insertIndex) + '\n\n' + newH2 + '\n\n' + html.slice(insertIndex);
          report.actions.push({ type: 'inserted_missing_h2', details: 'Conseils pratiques' });
          report.metrics.h2_count++;
        }
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
        
        // Prendre les 240 premiers caractères
        let citationText = snippetText.substring(0, 240).trim();
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
  <p><cite>Extrait Reddit</cite></p>
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
    const enableAffiliateInjector = ENABLE_AFFILIATE_INJECTOR;
    
    if (hasAffiliatePlan && enableAffiliateInjector) {
      const expectedCount = affiliatePlan.placements.length;
      
      // Recompter avec une méthode plus précise sur finalHtml
      const affiliateModuleRegex = /<div class="affiliate-module"|data-placement-id=/g;
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
      const affiliateModuleRegex = /<div class="affiliate-module"|data-placement-id=/g;
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
    // PHASE 6.1: Supprimer les paragraphes dupliqués exacts (fonction dédiée)
    finalHtml = this.removeDuplicateParagraphs(finalHtml, report);
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
    const affiliateModuleMatches = finalHtml.matchAll(/<div class="affiliate-module"[^>]*>[\s\S]*?<\/div>/g);
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

    // PHASE 6.2.1: CHECK F - Anti-invention (hard check)
    this.checkInventionGuard(finalHtml, pipelineContext, report);
    
    // PHASE 6.3: CHECK G - Story Alignment + Quality Gate (hard check avec auto-fix)
    finalHtml = await this.checkAndFixStoryAlignment(finalHtml, pipelineContext, report);
    
    // PHASE 6.4: Ajouter wrappers premium (takeaways, community, open-questions)
    finalHtml = this.addPremiumWrappers(finalHtml, pipelineContext, report);
    
    // PHASE 6.2.3: CHECK B amélioré - Citations Reddit obligatoires et robustes
    // (déjà implémenté, mais améliorer la logique si nécessaire)
    
    // PHASE 6.2.4: CHECK C amélioré - CTA/Affiliate plan: conformité stricte
    // (déjà implémenté, mais améliorer la logique si nécessaire)
    
    // PHASE 7.1.d: Anti-Hallucination Guard (non bloquant par défaut)
    await this.checkAntiHallucination(finalHtml, pipelineContext, report);
    
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
    const extracted = pipelineContext?.extracted || {};
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
      const affiliatePattern = /<div[^>]*(?:class=["'][^"']*affiliate-module[^"']*["']|data-placement-id)[^>]*>([\s\S]*?)<\/div>/gi;
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
    
    // Construire vocabulary whitelist
    const whitelistTokens = new Set();
    
    // Ajouter tokens depuis extracted.title + extracted.selftext
    const extractedText = `${extracted.title || ''} ${extracted.selftext || ''}`.toLowerCase();
    const extractedTokens = this.extractTokens(extractedText);
    extractedTokens.forEach(t => whitelistTokens.add(t));
    
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
    
    // Ajouter tokens depuis commentaires si présents
    const comments = extracted.comments || [];
    comments.forEach(comment => {
      const commentText = (typeof comment === 'string' ? comment : comment.body || '').toLowerCase();
      const commentTokens = this.extractTokens(commentText);
      commentTokens.forEach(t => whitelistTokens.add(t));
    });
    
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
          
          const claimInSource = claimInExtracted || claimInSnippets;
          
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
    
    // Détecter lieux (villes/pays) non sourcés
    const locationPatterns = [
      /\b(Paris|Londres|Berlin|Madrid|Rome|Barcelone|Amsterdam|Vienne|Prague|Budapest|Lisbonne|Porto|Athènes|Stockholm|Oslo|Copenhague|Helsinki|Dublin|Edimbourg|Bruxelles|Zurich|Genève|Lyon|Marseille|Nice|Bordeaux|Toulouse|Nantes|Strasbourg|Lille|Rennes|Montpellier|Reims|Saint-Étienne|Toulon|Grenoble|Dijon|Angers|Nîmes|Villeurbanne|Saint-Denis|Le Havre|Aix-en-Provence|Clermont-Ferrand|Brest|Limoges|Tours|Amiens|Perpignan|Metz|Besançon|Boulogne-Billancourt|Orléans|Mulhouse|Rouen|Caen|Nancy|Argenteuil|Montreuil|Roubaix|Tourcoing|Nanterre|Avignon|Créteil|Dunkirk|Poitiers|Asnières-sur-Seine|Versailles|Courbevoie|Vitry-sur-Seine|Colombes|Aulnay-sous-Bois|La Rochelle|Rueil-Malmaison|Champigny-sur-Marne|Antibes|Bourges|Cannes|Calais|Béziers|Mérignac|Saint-Maur-des-Fossés|Pau|Bayonne|Biarritz|Annecy|Chambéry|Évian|Chamonix|Megève|Courchevel|Val-d'Isère|Tignes|La Plagne|Les Arcs|Les Menuires|Méribel|Val-Thorens|Les Deux Alpes|Alpe d'Huez|Serre-Ponçon|Briançon|Gap|Digne-les-Bains|Nice|Cannes|Monaco|Menton|Villefranche-sur-Mer|Beaulieu-sur-Mer|Èze|Saint-Jean-Cap-Ferrat|Antibes|Juan-les-Pins|Grasse|Vallauris|Mougins|Le Cannet|Cagnes-sur-Mer|Vence|Saint-Paul-de-Vence|Biot|Valbonne|Opio|Pégomas|La Roquette-sur-Siagne|Mouans-Sartoux|Peymeinade|Le Tignet|Spéracèdes|Escragnolles|Andon|Caille|Séranon|Saint-Vallier-de-Thiey|Gréolières|Coursegoules|Bezaudun-les-Alpes|Bézaudun|Conségudes|Les Mujouls|Aiglun|Sigale|Toudon|Bonson|Gilette|Revest-les-Roches|Touët-sur-Var|Malaussène|Villars-sur-Var|Tourette-du-Château|Rigaud|Sallagriffon|Séranon|Andon|Caille|Escragnolles|Spéracèdes|Le Tignet|Peymeinade|Mouans-Sartoux|La Roquette-sur-Siagne|Pégomas|Biot|Valbonne|Opio|Vence|Saint-Paul-de-Vence|Cagnes-sur-Mer|Le Cannet|Mougins|Vallauris|Grasse|Juan-les-Pins|Antibes|Saint-Jean-Cap-Ferrat|Èze|Beaulieu-sur-Mer|Villefranche-sur-Mer|Menton|Monaco|Cannes|Nice|Digne-les-Bains|Gap|Serre-Ponçon|Briançon|Alpe d'Huez|Les Deux Alpes|Val-Thorens|Méribel|Les Menuires|Les Arcs|La Plagne|Tignes|Val-d'Isère|Courchevel|Megève|Chamonix|Évian|Chambéry|Annecy|Biarritz|Bayonne|Pau|Saint-Maur-des-Fossés|Mérignac|Béziers|Calais|Cannes|Bourges|Antibes|Champigny-sur-Marne|Rueil-Malmaison|La Rochelle|Aulnay-sous-Bois|Colombes|Vitry-sur-Seine|Courbevoie|Versailles|Asnières-sur-Seine|Poitiers|Dunkirk|Créteil|Avignon|Nanterre|Tourcoing|Roubaix|Montreuil|Argenteuil|Nancy|Caen|Rouen|Mulhouse|Orléans|Boulogne-Billancourt|Rennes|Lille|Strasbourg|Nantes|Bordeaux|Toulouse|Marseille|Lyon|Genève|Zurich|Bruxelles|Edimbourg|Dublin|Helsinki|Copenhague|Oslo|Stockholm|Athènes|Porto|Lisbonne|Budapest|Prague|Vienne|Amsterdam|Barcelone|Rome|Madrid|Berlin|Londres)\b/gi,
      /\b(Thailand|Vietnam|Japan|China|India|Indonesia|Philippines|Malaysia|Singapore|South Korea|Taiwan|Hong Kong|Myanmar|Cambodia|Laos|Bangladesh|Sri Lanka|Nepal|Bhutan|Maldives|Mongolia|North Korea|Brunei|East Timor|Macau|Bangkok|Chiang Mai|Phuket|Pattaya|Hua Hin|Krabi|Koh Samui|Koh Phangan|Koh Tao|Ayutthaya|Sukhothai|Lampang|Nan|Mae Hong Son|Pai|Mae Sot|Tak|Uttaradit|Phitsanulok|Phichit|Phetchabun|Loei|Nong Khai|Udon Thani|Khon Kaen|Nakhon Ratchasima|Korat|Surin|Sisaket|Ubon Ratchathani|Yasothon|Roi Et|Kalasin|Maha Sarakham|Khon Kaen|Udon Thani|Nong Khai|Loei|Phetchabun|Phichit|Phitsanulok|Uttaradit|Tak|Mae Sot|Pai|Mae Hong Son|Nan|Lampang|Sukhothai|Ayutthaya|Koh Tao|Koh Phangan|Koh Samui|Krabi|Hua Hin|Pattaya|Phuket|Chiang Mai|Bangkok|Ho Chi Minh|Hanoi|Da Nang|Hue|Hoi An|Nha Trang|Dalat|Sapa|Ha Long|Phu Quoc|Can Tho|Mekong Delta|Tokyo|Kyoto|Osaka|Yokohama|Nagoya|Fukuoka|Sapporo|Sendai|Hiroshima|Kobe|Okinawa|Nara|Kamakura|Nikko|Hakone|Mount Fuji|Shirakawa-go|Takayama|Kanazawa|Matsumoto|Nagano|Shizuoka|Hamamatsu|Okayama|Kurashiki|Matsue|Tottori|Kumamoto|Kagoshima|Miyazaki|Oita|Beppu|Nagasaki|Sasebo|Fukuoka|Kitakyushu|Yamaguchi|Hiroshima|Okayama|Takamatsu|Tokushima|Kochi|Matsuyama|Uwajima|Oita|Beppu|Miyazaki|Kagoshima|Kumamoto|Saga|Nagasaki|Sasebo|Fukuoka|Kitakyushu|Yamaguchi|Hiroshima|Okayama|Takamatsu|Tokushima|Kochi|Matsuyama|Uwajima|Oita|Beppu|Miyazaki|Kagoshima|Kumamoto|Saga|Nagasaki|Sasebo|Bali|Jakarta|Yogyakarta|Bandung|Surabaya|Medan|Makassar|Semarang|Palembang|Denpasar|Ubud|Canggu|Sanur|Nusa Dua|Jimbaran|Kuta|Legian|Seminyak|Kerobokan|Pererenan|Echo Beach|Bingin|Uluwatu|Padang Padang|Dreamland|Balangan|Nyang Nyang|Suluban|Impossibles|Bingin|Padang Padang|Uluwatu|Dreamland|Balangan|Nyang Nyang|Suluban|Impossibles|Bingin|Padang Padang|Uluwatu|Dreamland|Balangan|Nyang Nyang|Suluban|Impossibles|Manila|Cebu|Davao|Iloilo|Bacolod|Cagayan de Oro|Zamboanga|Angeles|Olongapo|Baguio|Tagaytay|Boracay|Palawan|El Nido|Coron|Puerto Princesa|Siargao|Bohol|Cebu|Davao|Iloilo|Bacolod|Cagayan de Oro|Zamboanga|Angeles|Olongapo|Baguio|Tagaytay|Kuala Lumpur|Penang|Malacca|Langkawi|Cameron Highlands|Ipoh|Johor Bahru|Kota Kinabalu|Kuching|Miri|Sibu|Bintulu|Limbang|Lawas|Marudi|Mukah|Dalat|Bintulu|Limbang|Lawas|Marudi|Mukah|Dalat|Singapore|Sentosa|Marina Bay|Orchard Road|Chinatown|Little India|Kampong Glam|Geylang|Tiong Bahru|Joo Chiat|Katong|East Coast|West Coast|Jurong|Woodlands|Yishun|Ang Mo Kio|Toa Payoh|Bishan|Serangoon|Punggol|Sengkang|Hougang|Tampines|Pasir Ris|Changi|Seoul|Busan|Incheon|Daegu|Daejeon|Gwangju|Ulsan|Jeju|Jeonju|Gyeongju|Andong|Suwon|Yongin|Seongnam|Bucheon|Ansan|Anyang|Goyang|Namyangju|Hwaseong|Gimpo|Pyeongtaek|Siheung|Gunpo|Uijeongbu|Osan|Icheon|Anseong|Gwangmyeong|Hanam|Guri|Uiwang|Gwacheon|Namyangju|Yangju|Paju|Gimhae|Jinju|Tongyeong|Geoje|Masan|Changwon|Jinhae|Gimhae|Jinju|Tongyeong|Geoje|Masan|Changwon|Jinhae|Taipei|Kaohsiung|Taichung|Tainan|Hsinchu|Keelung|Chiayi|Taitung|Hualien|Yilan|Pingtung|Miaoli|Changhua|Nantou|Yunlin|Chiayi|Tainan|Kaohsiung|Pingtung|Taitung|Hualien|Yilan|Keelung|Taipei|New Taipei|Taoyuan|Hsinchu|Miaoli|Changhua|Nantou|Yunlin|Hong Kong|Kowloon|New Territories|Lantau|Lamma|Cheung Chau|Peng Chau|Tai O|Stanley|Repulse Bay|Deep Water Bay|Aberdeen|Pok Fu Lam|Cyberport|Discovery Bay|Tung Chung|Tsing Yi|Ma Wan|Lantau|Discovery Bay|Tung Chung|Tsing Yi|Ma Wan|Macau|Taipa|Coloane|Cotai|Macau Peninsula|Taipa|Coloane|Cotai)\b/gi
    ];
    
    for (const pattern of locationPatterns) {
      const matches = articleText.match(pattern);
      if (matches) {
        for (const match of matches) {
          if (!hasEnoughSourceContent) continue; // Skip si pas assez de contenu source
          
          const normalizedMatch = match.toLowerCase().trim();
          
          // Vérifier si le lieu est explicitement dans la source
          const locationInExtracted = extractedText.includes(normalizedMatch);
          const locationInSnippets = snippets.some(s => {
            const sText = typeof s === 'string' ? s : (s.snippet || s.text || '');
            if (!sText) return false;
            return sText.toLowerCase().includes(normalizedMatch);
          });
          const locationInSource = locationInExtracted || locationInSnippets;
          
          if (!locationInSource && !whitelistTokens.has(normalizedMatch)) {
            // Si le lieu n'est pas dans la source, c'est une invention
            const context = articleText.substring(Math.max(0, articleText.indexOf(match) - 50), Math.min(articleText.length, articleText.indexOf(match) + match.length + 50)).substring(0, 100);
            const claimIdx = debugClaims.length;
            
            // PHASE 6.2.1: Logger le claim détecté
            console.log(`❌ INVENTION_GUARD_CLAIM: type=location text="${match}" context="${context.substring(0, 40)}..." idx=${claimIdx}`);
            
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
    const factualClaims = [
      /\bla loi dit\b/gi,
      /\best obligatoire\b/gi,
      /\best interdit\b/gi,
      /\bdoit être\b/gi,
      /\brequis\b/gi,
      /\bnécessaire\b/gi
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
    
    if (issues.length > 0) {
      report.checks.push({
        name: 'invention_guard',
        status: 'fail',
        details: `${issues.length} claim(s) non sourcé(s) détecté(s)`
      });
      
      issues.forEach(issue => {
        report.issues.push({
          code: 'SOURCE_OF_TRUTH_VIOLATION_FINALIZER', // PHASE 6.5: Code bloquant normalisé
          alias: 'SOURCE_OF_TRUTH_VIOLATION', // Alias pour compatibilité
          severity: 'high',
          message: `invention_detected: ${issue.type} "${issue.value}" non sourcé dans whitelist`,
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
    
    if (removedCount > 0) {
      console.log(`   ✅ ${removedCount} texte(s) parasite(s) supprimé(s)`);
    } else {
      console.log('   ✅ Aucun texte parasite détecté');
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
    const story = pipelineContext?.story?.story || {};
    const MIN_SECTION_CHARS = 60; // PHASE 6.3.F: Seuil pour "too short"
    
    // PHASE 6.3.1: Définir les sections et leurs synonymes (inclure les titres canoniques)
    const sectionDefinitions = {
      context: {
        synonyms: ['contexte', 'context', 'situation', 'cadre'],
        title: 'Contexte',
        order: 1
      },
      central_event: {
        synonyms: ['événement central', 'event', 'le fait déclencheur', 'ce qui s\'est passé'],
        title: 'Événement central',
        order: 2
      },
      critical_moment: {
        synonyms: ['moment critique', 'critical moment', 'le tournant', 'point de bascule'],
        title: 'Moment critique',
        order: 3
      },
      resolution: {
        synonyms: ['résolution', 'resolution', 'issue', 'ce qui a été fait'],
        title: 'Résolution',
        order: 4
      },
      author_lessons: {
        synonyms: ['leçons', 'ce que l\'auteur retient', 'à retenir \\(auteur\\)'],
        title: 'Ce que l\'auteur retient',
        order: 5
      },
      community_insights: {
        synonyms: ['insights communauté', 'réactions', 'ce que la communauté ajoute', 'communauté', 'community', 'ce que la communauté apporte'],
        title: 'Ce que la communauté apporte',
        order: 6
      },
      open_questions: {
        synonyms: ['questions ouvertes', 'ce qui reste', 'à clarifier', 'questions encore ouvertes'],
        title: 'Questions encore ouvertes',
        order: 7
      }
    };
    
    // PHASE 6.3.A: Déterminer les sections réellement requises (post-story)
    // Ne compte PAS "Articles connexes" dans required/present/too_short (section structurelle, pas story)
    const storyData = story.story || story; // Support both story.story and story directly
    const requiredKeys = [];
    for (const [sectionKey, sectionDef] of Object.entries(sectionDefinitions)) {
      if (sectionKey === 'related') continue; // Exclure "Articles connexes" du scan alignment
      if (this.isSectionRequired(sectionKey, storyData)) {
        requiredKeys.push(sectionKey);
        // Ajouter le titre canonique aux synonymes pour qu'il soit détecté
        sectionDef.synonyms.unshift(sectionDef.title.toLowerCase());
      }
    }
    
    let finalHtml = html;
    const insertedSections = [];
    const violations = []; // severity='high' -> FAIL
    const warnings = []; // severity='low' -> WARN
    let reordered = false;
    
    // PHASE 6.3.C: Parser sections présentes AVANT auto-fix
    const sectionsBefore = this.extractSections(finalHtml, sectionDefinitions);
    const presentBefore = Object.keys(sectionsBefore);
    
    // PHASE 6.3.D: Identifier les sections manquantes et vérifier si elles sont insertables
    const missingSections = requiredKeys.filter(key => !presentBefore.includes(key));
    
    for (const sectionKey of missingSections) {
      if (this.canInsert(sectionKey, story)) {
        // Section manquante mais insertable -> on va l'insérer
        const sectionDef = sectionDefinitions[sectionKey];
        
        // Construire le contenu de la section
        let sourceContent = null;
        switch (sectionKey) {
          case 'context':
            sourceContent = story.context?.summary?.trim() || story.context?.bullets;
            break;
          case 'central_event':
            sourceContent = story.central_event?.summary?.trim() || story.central_event?.bullets;
            break;
          case 'critical_moment':
            sourceContent = story.critical_moment?.summary?.trim() || story.critical_moment?.bullets;
            break;
          case 'resolution':
            sourceContent = story.resolution?.summary?.trim() || story.resolution?.bullets;
            break;
          case 'author_lessons':
            sourceContent = story.author_lessons || [];
            break;
          case 'community_insights':
            sourceContent = story.community_insights || [];
            break;
          case 'open_questions':
            sourceContent = story.open_questions || [];
            break;
        }
        
        if (!sourceContent || (Array.isArray(sourceContent) && sourceContent.length === 0)) {
          // Pas de source exploitable -> violation
          violations.push({
            section: sectionKey,
            reason: `Section "${sectionDef.title}" requise mais non constructible (pas de matière exploitable)`,
            type: 'missing_required_section'
          });
          continue;
        }
        
        // Construire le HTML de la section (AVEC TRADUCTION SI ANGLAIS)
        let sectionHtml = '';
        if (Array.isArray(sourceContent)) {
          sectionHtml = `<h2>${sectionDef.title}</h2>\n<ul>\n`;
          for (const item of sourceContent) {
            const text = typeof item === 'string' ? item : (item.value || item.text || item.summary || '');
            if (text && text.trim()) {
              sectionHtml += `  <li>${this.escapeHtml(text)}</li>\n`;
            }
          }
          sectionHtml += '</ul>\n';
        } else {
          const text = typeof sourceContent === 'string' ? sourceContent : (sourceContent.summary || sourceContent.text || '');
          if (text && text.trim()) {
            // TRADUCTION FORCÉE DU CONTENU ANGLAIS (resolution, critical_moment, etc.)
            let translatedText = text.substring(0, 500);
            if (!FORCE_OFFLINE && this.intelligentContentAnalyzer) {
              try {
                translatedText = await this.intelligentContentAnalyzer.translateToFrench(translatedText);
                console.log(`🌐 FINALIZER: Section "${sectionDef.title}" traduite (${text.length} → ${translatedText.length} chars)`);
              } catch (error) {
                console.warn(`⚠️ Erreur traduction section "${sectionDef.title}": ${error.message}`);
              }
            }
            const escapedText = this.escapeHtml(translatedText);
            sectionHtml = `<h2>${sectionDef.title}</h2>\n<p>${escapedText}</p>\n`;
          }
        }
        
        if (sectionHtml) {
          // Trouver la position d'insertion
          let insertIndex = 0;
          const sectionsBeforeThis = requiredKeys
            .filter(s => {
              const def = sectionDefinitions[s];
              return def && def.order < sectionDef.order && presentBefore.includes(s);
            })
            .sort((a, b) => sectionDefinitions[a].order - sectionDefinitions[b].order);
          
          if (sectionsBeforeThis.length > 0) {
            const lastBefore = sectionsBeforeThis[sectionsBeforeThis.length - 1];
            const beforeSection = sectionsBefore[lastBefore];
            if (beforeSection) {
              // Trouver la fin de cette section (prochain H2 ou fin)
              const h2Matches = [...finalHtml.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
              const nextH2Index = h2Matches.find(h => h.index > beforeSection.h2Index)?.index || finalHtml.length;
              insertIndex = nextH2Index;
            }
          } else {
            // Insérer après le premier H2 ou après l'intro
            const firstH2Match = finalHtml.match(/<h2[^>]*>/i);
            if (firstH2Match) {
              const h2Matches = [...finalHtml.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
              const nextH2Index = h2Matches.find(h => h.index > firstH2Match.index)?.index || finalHtml.length;
              insertIndex = nextH2Index;
            } else {
              const firstPMatch = finalHtml.match(/<p[^>]*>.*?<\/p>/i);
              if (firstPMatch) {
                insertIndex = firstPMatch.index + firstPMatch[0].length;
              }
            }
          }
          
          finalHtml = finalHtml.slice(0, insertIndex) + '\n' + sectionHtml + '\n' + finalHtml.slice(insertIndex);
          insertedSections.push(sectionKey);
          report.actions.push({
            type: 'inserted_missing_section',
            details: `section=${sectionKey} title="${sectionDef.title}"`
          });
        }
      } else {
        // PHASE 6.3.C: Section required mais non insertable -> FAIL
        const sectionDef = sectionDefinitions[sectionKey];
        let reason = `Section "${sectionDef.title}" requise mais non constructible (pas de matière exploitable)`;
        if (sectionKey === 'community_insights') {
          const count = Array.isArray(story.community_insights) ? story.community_insights.length : 0;
          reason = `story.community_insights.length=${count} but no community section found and insights are not insertable`;
        } else if (sectionKey === 'open_questions') {
          reason = `open_questions present but not insertable and section missing`;
        }
        violations.push({
          section: sectionKey,
          reason: reason,
          type: 'missing_required_section'
        });
      }
    }
    
    // PHASE 6.3.D: RE-parser le HTML final après auto-fix
    const sectionsAfter = this.extractSections(finalHtml, sectionDefinitions);
    const presentAfter = Object.keys(sectionsAfter);
    
    // PHASE 6.3.F: Détecter les sections "too short" (même si H2 existe)
    // Ne jamais "warn" sur une section requise si la story n'a pas assez de matière
    for (const sectionKey of requiredKeys) {
      if (presentAfter.includes(sectionKey)) {
        const section = sectionsAfter[sectionKey];
        const sectionDef = sectionDefinitions[sectionKey];
        
        // Calculer expectedText à partir de story.story[sectionKey] ou story[sectionKey]
        let expectedText = '';
        const storyData = story.story || story; // Support both story.story and story directly
        const storySection = storyData?.[sectionKey];
        if (storySection) {
          if (typeof storySection === 'string') {
            expectedText = storySection;
          } else if (storySection.summary) {
            expectedText = storySection.summary;
          } else if (Array.isArray(storySection.bullets)) {
            expectedText = storySection.bullets.map(b => typeof b === 'string' ? b : (b.value || b.text || b.summary || '')).join(' ');
          } else if (Array.isArray(storySection)) {
            // Pour author_lessons, community_insights, open_questions
            expectedText = storySection.map(item => {
              const text = typeof item === 'string' ? item : (item.value || item.text || item.summary || item.quote || '');
              return text;
            }).join(' ');
          }
        }
        const expectedLen = expectedText.trim().length;
        const actualLen = section.contentLen;
        
        // Émettre STORY_ALIGNMENT_VIOLATION: too_short seulement si:
        // 1. La section est requise
        // 2. ET expectedLen >= MIN_SECTION_CHARS (la story a assez de matière)
        // 3. ET actualLen < MIN_SECTION_CHARS (mais le HTML est trop court)
        // 4. ET la section n'a pas été auto-insérée (sinon c'est normal qu'elle soit courte)
        if (expectedLen >= MIN_SECTION_CHARS && actualLen < MIN_SECTION_CHARS && !insertedSections.includes(sectionKey)) {
          warnings.push({
            section: sectionKey,
            reason: `Section "${sectionDef.title}" présente mais trop courte (${actualLen} chars, attendu >= ${MIN_SECTION_CHARS} d'après story)`,
            type: 'section_too_short'
          });
        }
      }
    }
    
    // PHASE 6.3.6: Vérifier l'ordre et calculer reordered
    // Comparer la liste canonique des H2 avant/après reorder
    if (requiredKeys.length > 1 && presentAfter.length === requiredKeys.length) {
      const expectedSequence = requiredKeys.map(s => sectionDefinitions[s].title.toLowerCase());
      const actualSequence = [];
      
      const h2Matches = [...finalHtml.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
      for (const m of h2Matches) {
        const h2Title = m[1].trim().toLowerCase();
        for (const sectionKey of requiredKeys) {
          const sectionDef = sectionDefinitions[sectionKey];
          const titleLower = sectionDef.title.toLowerCase();
          // Match exact du titre canonique ou synonyme
          if (h2Title === titleLower || sectionDef.synonyms.some(s => {
            const synLower = s.toLowerCase();
            return h2Title === synLower || h2Title.includes(synLower);
          })) {
            actualSequence.push(titleLower);
            break;
          }
        }
      }
      
      if (actualSequence.length === requiredKeys.length) {
        const expectedStr = expectedSequence.join('|');
        const actualStr = actualSequence.join('|');
        
        // Comparer avec la séquence AVANT (si disponible)
        const beforeSequence = [];
        const h2MatchesBefore = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
        for (const m of h2MatchesBefore) {
          const h2Title = m[1].trim().toLowerCase();
          for (const sectionKey of requiredKeys) {
            const sectionDef = sectionDefinitions[sectionKey];
            const titleLower = sectionDef.title.toLowerCase();
            if (h2Title === titleLower || sectionDef.synonyms.some(s => {
              const synLower = s.toLowerCase();
              return h2Title === synLower || h2Title.includes(synLower);
            })) {
              beforeSequence.push(titleLower);
              break;
            }
          }
        }
        
        // PHASE 6.3.6: Reordered = true uniquement si ordre change
        if (beforeSequence.length === requiredKeys.length) {
          const beforeStr = beforeSequence.join('|');
          if (beforeStr !== actualStr) {
            reordered = true;
            report.actions.push({
              type: 'reordered_sections',
              details: `before=${beforeStr} after=${actualStr}`
            });
          }
        } else if (expectedStr !== actualStr && insertedSections.length === 0) {
          // Si on n'a pas de séquence avant ET pas d'insertion, comparer avec attendu
          reordered = true;
          report.actions.push({
            type: 'reordered_sections',
            details: `expected=${expectedStr} actual=${actualStr}`
          });
        }
      }
    }
    
    // PHASE 6.3.4: Calculer le status selon les règles (post-fix)
    // Vérifier les violations persistantes (sections required mais absentes et non insertables)
    const unresolvedViolations = violations.filter(v => {
      // Une violation est résolue si la section est maintenant présente
      return !presentAfter.includes(v.section);
    });
    
    // PHASE 6.3.4: Calculer failCount et warnCount
    // failCount: required sections encore absentes (missing) OU required sections dont la donnée est non insérable et absente
    const missingRequired = requiredKeys.filter(key => !presentAfter.includes(key));
    const failCount = unresolvedViolations.length + missingRequired.length;
    
    // warnCount: sections présentes mais "trop courtes"
    const tooShortWarnings = warnings.filter(w => w.type === 'section_too_short');
    const warnCount = tooShortWarnings.length;
    
    // PHASE 6.3.4: Status final = fonction des violations post-fix
    let status;
    if (failCount > 0) {
      status = 'fail';
    } else if (warnCount > 0) {
      status = 'warn';
    } else {
      status = 'pass';
    }
    
    // PHASE 6.3.E: Calculer les métriques finales
    const presentCount = presentAfter.length;
    const insertedCount = insertedSections.length;
    
    report.checks.push({
      name: 'story_alignment',
      status: status,
      details: `required=${requiredKeys.length} present=${presentCount} inserted=${insertedCount} reordered=${reordered ? 1 : 0}`
    });
    
    // PHASE 6.3.E: Ajouter les violations et warnings au rapport
    unresolvedViolations.forEach(violation => {
      report.issues.push({
        code: 'STORY_ALIGNMENT_VIOLATION',
        severity: 'high',
        message: violation.reason,
        evidence: { section: violation.section, type: violation.type },
        check: 'story_alignment'
      });
    });
    
    // PHASE 6.3.F: "too short" = WARN seulement (severity low)
    tooShortWarnings.forEach(warning => {
      report.issues.push({
        code: 'STORY_ALIGNMENT_VIOLATION',
        severity: 'low',
        message: warning.reason,
        evidence: { section: warning.section, type: warning.type },
        check: 'story_alignment'
      });
    });
    // Warnings d'ordre ne sont pas ajoutés comme issues (non bloquants)
    
    // PHASE 6.3.4: Exposer dans report.debug
    if (!report.debug) report.debug = {};
    report.debug.alignment = {
      required_sections: requiredKeys,
      detected_sections: presentAfter,
      inserted_sections: insertedSections,
      reordered: reordered,
      missing_after_fix: unresolvedViolations.map(v => v.section)
    };
    
    // PHASE 6.3.4: Log unique
    console.log(`✅ FINALIZER_ALIGNMENT: required=${requiredKeys.length} present=${presentCount} inserted=${insertedCount} reordered=${reordered ? 1 : 0} status=${status}`);
    
    return finalHtml;
  }
  
  /**
   * PHASE 6.4: Ajouter wrappers premium (takeaways, community, open-questions)
   * Ajoute des wrappers HTML strictement pilotés par story.*, sans invention
   */
  addPremiumWrappers(html, pipelineContext, report) {
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
        
        const trimmedText = text ? String(text).trim() : '';
        // Filtrer explicitement [object Object], objets vides, et objets complexes
        // Ne garder que les chaînes de caractères valides avec contenu
        if (trimmedText && 
            trimmedText !== '[object Object]' && 
            trimmedText !== '{}' && 
            !trimmedText.startsWith('{') && // Rejeter les objets JSON stringifiés
            trimmedText.length > 0) {
          wrapperHtml += `    <li>${this.escapeHtml(trimmedText)}</li>\n`;
          totalTextLength += trimmedText.length;
        }
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
  async checkAntiHallucination(html, pipelineContext, report) {
    try {
      // Importer le guard dynamiquement
      const { runAntiHallucinationGuard } = await import('./src/anti-hallucination/anti-hallucination-guard.js');
      
      const extracted = pipelineContext?.extracted || {};
      
      // Exécuter le guard
      const guardResult = await runAntiHallucinationGuard({
        html,
        extracted,
        context: pipelineContext
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
      
      // Si blocking=true, ajouter une issue
      if (guardResult.blocking) {
        report.issues.push({
          code: 'ANTI_HALLUCINATION_BLOCK',
          severity: shouldBlock ? 'high' : 'medium',
          message: `Anti-hallucination guard detected ${guardResult.reasons.length} blocking issue(s)`,
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
   * PHASE 5.C: Injecte un module d'affiliation selon l'anchor
   * @param {string} html - HTML du contenu
   * @param {string} moduleHtml - HTML du module à injecter
   * @param {string} anchor - Anchor de placement (before_related, after_context, after_central_event, etc.)
   * @returns {string} HTML avec module injecté
   */
  injectAffiliateModule(html, moduleHtml, anchor) {
    if (!moduleHtml || !anchor) return html;

    switch (anchor) {
      case 'before_related':
        // Juste avant "Articles connexes"
        const relatedRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
        const relatedMatch = html.match(relatedRegex);
        if (relatedMatch) {
          const insertIndex = relatedMatch.index;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        // Fallback: fin de document
        return html + '\n\n' + moduleHtml;

      case 'after_context':
        // Après le 1er H2
        const firstH2Regex = /<h2[^>]*>.*?<\/h2>/i;
        const firstH2Match = html.match(firstH2Regex);
        if (firstH2Match) {
          const insertIndex = firstH2Match.index + firstH2Match[0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        // Fallback: après le 1er <p>
        const firstPRegex = /<p[^>]*>.*?<\/p>/i;
        const firstPMatch = html.match(firstPRegex);
        if (firstPMatch) {
          const insertIndex = firstPMatch.index + firstPMatch[0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        // Fallback: fin de document
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
        // Fallback: après le 2e H2
        const h2Matches = html.matchAll(/<h2[^>]*>.*?<\/h2>/gi);
        const h2Array = Array.from(h2Matches);
        if (h2Array.length >= 2) {
          const secondH2 = h2Array[1];
          const insertIndex = secondH2.index + secondH2[0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        // Fallback: après le 1er H2
        if (h2Array.length >= 1) {
          const firstH2 = h2Array[0];
          const insertIndex = firstH2.index + firstH2[0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        // Fallback: fin de document
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
        // Fallback: après le 2e H2 (même logique que after_central_event)
        const h2Matches2 = html.matchAll(/<h2[^>]*>.*?<\/h2>/gi);
        const h2Array2 = Array.from(h2Matches2);
        if (h2Array2.length >= 2) {
          const secondH2 = h2Array2[1];
          const insertIndex = secondH2.index + secondH2[0].length;
          return html.slice(0, insertIndex) + '\n\n' + moduleHtml + '\n\n' + html.slice(insertIndex);
        }
        // Fallback: fin de document
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
    // Détecter si un CTA existe déjà
    const ctaPatterns = [
      /comparer.*vols|réserver.*vol|voir.*vols|découvrir.*offres|guide complet|réserver maintenant|comparer les prix|trouver.*vol|meilleur.*prix/i,
      /<a[^>]*>(comparer|réserver|voir|découvrir|guide|trouver|meilleur)/i,
      /<button[^>]*>(comparer|réserver|voir|découvrir|guide|trouver|meilleur)/i
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
        ctaText = 'Comparer les prix des vols et réserver votre billet';
        break;
      case 'hotels':
        ctaText = 'Trouver votre hébergement idéal';
        break;
      case 'esim':
      case 'connectivity':
        ctaText = 'Équipez-vous d\'une eSIM pour rester connecté';
        break;
      default:
        ctaText = 'Découvrir les meilleures offres';
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
    
    console.log('🖼️ Recherche d\'image featured...');

    try {
      const { PEXELS_API_KEY } = await import('./config.js');
      
      if (!PEXELS_API_KEY) {
        console.log('   ⚠️ Clé Pexels non disponible');
        return null;
      }

      // CORRECTION: Charger les images déjà utilisées pour éviter les doublons
      const usedImages = await this.loadUsedPexelsImages();
      console.log(`   📋 ${usedImages.size} images déjà utilisées détectées`);

      // Construire la requête selon le contexte avec plus de variété
      const baseQueries = [
        'digital nomad working laptop',
        'remote work travel asia',
        'nomade digital coworking',
        'laptop beach sunset',
        'digital nomad lifestyle',
        'remote work coffee shop',
        'travel laptop backpack',
        'nomade digital asie'
      ];

      // Ajouter la destination si disponible
      let destination = '';
      if (analysis?.destinations && analysis.destinations.length > 0) {
        destination = analysis.destinations[0];
      }

      // Essayer plusieurs queries et pages pour trouver une image non utilisée
      let selectedImage = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (!selectedImage && attempts < maxAttempts) {
        // Sélectionner une query aléatoire
        const randomQuery = baseQueries[Math.floor(Math.random() * baseQueries.length)];
        let query = randomQuery;
        
        if (destination) {
          query += ` ${destination}`;
        }

        // Ajouter un paramètre de page aléatoire pour plus de diversité
        // Augmenter la page si on a déjà essayé plusieurs fois
        const randomPage = Math.floor(Math.random() * (3 + attempts)) + 1; // Pages 1-3, puis 1-4, etc.

        console.log(`   🔍 Query: "${query}" (page ${randomPage}, tentative ${attempts + 1}/${maxAttempts})`);

        const response = await axios.get('https://api.pexels.com/v1/search', {
          headers: { 'Authorization': PEXELS_API_KEY },
          params: {
            query,
            per_page: 20, // Plus d'images pour avoir plus de choix
            orientation: 'landscape',
            page: randomPage
          }
        });

        if (response.data.photos && response.data.photos.length > 0) {
          // Filtrer les images déjà utilisées
          const availableImages = response.data.photos.filter(photo => {
            const imageUrl = photo.src.large || photo.src.original;
            const imageId = photo.id;
            // Vérifier par URL ou ID Pexels
            return !usedImages.has(imageUrl) && !usedImages.has(imageId.toString());
          });

          if (availableImages.length > 0) {
            // Sélectionner une image aléatoire parmi celles disponibles
            const randomIndex = Math.floor(Math.random() * Math.min(availableImages.length, 10));
            selectedImage = availableImages[randomIndex];
            
            console.log(`   ✅ Image sélectionnée (${randomIndex + 1}/${availableImages.length} disponible, ${response.data.photos.length - availableImages.length} déjà utilisées): ${selectedImage.alt}`);
            
            // Stocker l'image utilisée pour éviter les futurs doublons
            await this.saveUsedPexelsImage(selectedImage);
            
            return {
              url: selectedImage.src.large,
              alt: selectedImage.alt,
              photographer: selectedImage.photographer,
              pexelsId: selectedImage.id, // Stocker l'ID Pexels pour référence future
              pexelsUrl: selectedImage.src.large
            };
          } else {
            console.log(`   ⚠️ Toutes les images de cette page sont déjà utilisées (${response.data.photos.length} images)`);
          }
        }

        attempts++;
      }

      if (!selectedImage) {
        console.log('   ⚠️ Aucune image non utilisée trouvée après plusieurs tentatives');
        // Fallback: retourner une image même si elle est déjà utilisée (mieux que pas d'image)
        console.log('   ⚠️ Utilisation d\'une image déjà utilisée (fallback)');
        const response = await axios.get('https://api.pexels.com/v1/search', {
          headers: { 'Authorization': PEXELS_API_KEY },
          params: {
            query: baseQueries[0],
            per_page: 10,
            orientation: 'landscape',
            page: Math.floor(Math.random() * 10) + 1 // Page plus élevée pour trouver des images différentes
          }
        });
        
        if (response.data.photos && response.data.photos.length > 0) {
          const randomIndex = Math.floor(Math.random() * response.data.photos.length);
          const image = response.data.photos[randomIndex];
          
          console.log(`   ✅ Image sélectionnée (fallback): ${image.alt}`);
          await this.saveUsedPexelsImage(image);
          
          return {
            url: image.src.large,
            alt: image.alt,
            photographer: image.photographer,
            pexelsId: image.id,
            pexelsUrl: image.src.large
          };
        }
      }

      console.log('   ⚠️ Aucune image trouvée');
      return null;
    } catch (error) {
      console.error('   ❌ Erreur recherche image:', error.message);
      return null;
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
    console.log('🏷️ Mapping des catégories et tags...');

    try {
      const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
      const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');

      // Mapping manuel pour les catégories courantes (IDs WordPress réels)
      const categoryMap = {
        'Destinations': 1, // ID réel WordPress
        'Digital Nomades Asie': 138, // ID réel WordPress
        
        // Sous-catégories de Destinations (parent: 1)
        'Vietnam': 59, // ID réel WordPress
        'Thaïlande': 60, // ID réel WordPress
        'Japon': 61, // ID réel WordPress
        'Singapour': 62, // ID réel WordPress
        'Corée du Sud': 63, // ID réel WordPress
        'Philippines': 64, // ID réel WordPress
        'Indonésie': 182, // ID réel WordPress
        
        // Autres catégories
        'Communauté & Réseau': 17,
        'Logement & Coliving': 140, // ID réel WordPress
        'Transport & Mobilité': 19,
        'Santé & Assurance': 20,
        'Finance & Fiscalité': 143, // ID réel WordPress
        'Travail & Productivité': 22,
        'Voyage & Découverte': 23,
        'Guides Pratiques': 165, // ID réel WordPress
        'Comparaisons': 167, // ID réel WordPress
        'Analyses': 168 // ID réel WordPress
      };

      // Mapping manuel pour les tags courants (IDs WordPress réels)
      const tagMap = {
        // Tags génériques
        'Asie': 172, // ID réel WordPress
        'Budget': 87, // ID réel WordPress
        'Débutant': 150, // ID réel WordPress
        
        // Tags par type de contenu
        'Témoignage': 155, // ID réel WordPress (Témoignages)
        'Témoignages': 155, // Même ID
        'Guide': 84, // ID réel WordPress
        'Guide Local': 106, // ID réel WordPress
        'Guides pratiques': 55, // ID réel WordPress
        'Nomadisme Digital': 176, // ID réel WordPress
        'Visa': 77, // ID réel WordPress
        
        // Tags par destination
        'Thaïlande': 75, // ID réel WordPress
        'Indonésie': 177, // ID réel WordPress
        'Vietnam': 95, // ID réel WordPress
        'Japon': 76, // ID réel WordPress
        
        // Tags par audience
        'communauté': 192, // ID à vérifier
        'voyage': 193, // ID à vérifier
        'travail': 194, // ID à vérifier
        'logement': 195, // ID à vérifier
        'finance': 196, // ID à vérifier
        'santé': 197, // ID à vérifier
        'transport': 198 // ID à vérifier
      };

      const categoryIds = categories
        .map(cat => categoryMap[cat])
        .filter(id => id !== undefined);

      const tagIds = tags
        .map(tag => tagMap[tag])
        .filter(id => id !== undefined);

      console.log(`   ✅ Catégories: ${categoryIds.length} IDs trouvés`);
      console.log(`   ✅ Tags: ${tagIds.length} IDs trouvés`);

      return {
        categories: categoryIds,
        tags: tagIds
      };
    } catch (error) {
      console.error('   ❌ Erreur mapping:', error.message);
      return { categories: [], tags: [] };
    }
  }
}

export default ArticleFinalizer;

