#!/usr/bin/env node

/**
 * ARTICLE FINALIZER
 * Finalise l'article avant publication :
 * - Remplace les placeholders de widgets Travelpayouts
 * - Ajoute l'image featured
 * - Ajoute les catégories/tags
 * - Vérifie le quote highlight
 * - Vérifie l'intro FOMO
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

class ArticleFinalizer {
  constructor() {
    this.widgets = REAL_TRAVELPAYOUTS_WIDGETS;
    this.widgetPlacer = new ContextualWidgetPlacer();
    this.widgetPlanBuilder = new WidgetPlanBuilder();
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
    
    const isDryRun = process.env.FLASHVOYAGE_DRY_RUN === '1';
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
    if (process.env.ENABLE_AFFILIATE_INJECTOR === '1' && pipelineContext?.affiliate_plan?.placements?.length > 0) {
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

    console.log('✅ Finalisation terminée:');
    console.log(`   - Widgets remplacés: ${enhancements.widgetsReplaced}`);
    console.log(`   - Quote highlight: ${enhancements.quoteHighlight}`);
    console.log(`   - Intro FOMO: ${enhancements.fomoIntro}`);
    console.log(`   - CTA présent: ${enhancements.ctaPresent}\n`);

    return {
      ...article,
      content: finalContent,
      enhancements
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
      const offline = process.env.FORCE_OFFLINE === '1';
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
    if (process.env.FLASHVOYAGE_DRY_RUN === '1') {
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

