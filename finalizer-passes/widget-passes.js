/**
 * FINALIZER PASSES - Widget and affiliate passes
 * FV-115: Extracted from article-finalizer.js
 * Each function is bound to the ArticleFinalizer instance at runtime.
 */

import { REAL_TRAVELPAYOUTS_WIDGETS } from '../travelpayouts-real-widgets-database.js';
import { DRY_RUN, FORCE_OFFLINE } from '../config.js';
import { lookupIATA, isKnownLocation } from '../airport-lookup.js';

export function resolveWidgetShortcodes(html, pipelineContext = null) {
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

export async function deduplicateWidgets(html, pipelineContext = null) {
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


export function detectRenderedWidgets(html) {    
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

export function countActualWidgets(content) {
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

export async function replaceWidgetPlaceholders(content, analysis, pipelineContext = null) {
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

export function analyzeArticleContext(content, analysis) {
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

export function extractDestination(content) {
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

export function placeWidgetsOffline(html, widgetScripts) {
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


export function selectBestFlightWidget(context) {
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

export function selectBestHotelWidget(context) {
  const { flights } = this.widgets;

  // HOTELLOOK SUPPRIMÉ - Utiliser Aviasales en remplacement
  return flights.aviasales.searchForm.script;
}

/**
 * Sélectionne le meilleur widget d'assurance selon le contexte
 * Utilise la structure REAL_TRAVELPAYOUTS_WIDGETS.insurance (visitorCoverage, insubuy)
 */

export function selectBestInsuranceWidget(context) {
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

export function selectBestProductivityWidget(context) {
  // Pour l'instant, retourner un widget générique ou vide
  // Tu peux ajouter des widgets de productivité dans la base de données
  return `<!-- Widget productivité à ajouter -->`;
}

/**
 * Sélectionne le meilleur widget de transport selon le contexte
 */

export function selectBestTransportWidget(context) {
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

export function selectBestActivitiesWidget(context) {
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

export function sanitizeAffiliateWidgetIntegrity(html, report = null) {
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

export function reconcileWidgetDestinations(html, pipelineContext, analysis, report) {
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

export function validateWidgetDestinations(html, pipelineContext, analysis, report) {
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

export function replaceAffiliatePlaceholders(html, pipelineContext, report) {
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

export function injectPartnerBrandLinks(html, pipelineContext) {
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

export function findSmartInsertPosition(html, placementId, { minStart = 0 } = {}) {
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

export function injectAffiliateModule(html, moduleHtml, anchor, options = {}) {
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

export async function addPremiumWrappers(html, pipelineContext, report) {
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

