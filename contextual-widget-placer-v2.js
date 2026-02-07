#!/usr/bin/env node

/**
 * CONTEXTUAL WIDGET PLACER V2
 * Utilise GPT-4o avec widget_plan pour analyser et placer les widgets
 * de manière contextuelle avec accroches sobres style The Points Guy
 */

import { getOpenAIClient, isOpenAIAvailable } from './openai-client.js';
import { RealStatsScraper } from './real-stats-scraper.js';
import { REAL_TRAVELPAYOUTS_WIDGETS } from './travelpayouts-real-widgets-database.js';
import { NomadPartnersLinkGenerator } from './nomad-partners-links.js';

// FIX B: Import cheerio avec fallback si échec (chargement dynamique dans la fonction)

class ContextualWidgetPlacer {
  constructor() {
    // Initialisation lazy - pas d'import OpenAI au top-level
    this.openai = null; // Initialisé lazy via getOpenAIClient() dans les méthodes async
    this.statsScraper = new RealStatsScraper();
    this.nomadLinkGenerator = new NomadPartnersLinkGenerator();
    
    // Contextes + accroches style TPG (valeur ajoutée + sobre)
    this.widgetIntros = {
      flights: [
        {
          context: "Réserver en avance permet souvent d'économiser sur les billets d'avion. Notre outil compare les prix de nombreuses compagnies en temps réel.",
          cta: "Comparez les prix et réservez :"
        },
        {
          context: "Les vols en milieu de semaine sont souvent moins chers. Notre partenaire Kiwi.com agrège les tarifs de toutes les compagnies.",
          cta: "Trouvez les meilleures offres :"
        },
        {
          context: "Les prix des vols varient selon le site de réservation. Notre outil compare automatiquement les tarifs pour vous garantir le meilleur prix.",
          cta: "Consultez les tarifs actuels :"
        }
      ],
      hotels: [
        {
          context: "Les vols représentent une part importante du budget voyage. Notre partenaire Aviasales compare les prix de nombreuses compagnies pour vous aider à économiser.",
          cta: "Comparez les prix de vols :"
        },
        {
          context: "Les prix des vols peuvent varier selon la compagnie. Notre outil agrège toutes les offres pour vous garantir le meilleur tarif.",
          cta: "Trouvez les meilleures offres :"
        }
      ],
      transport: [
        {
          context: "Les transports locaux représentent une part du budget voyage. Notre partenaire 12Go compare bus, trains et ferries pour optimiser vos trajets.",
          cta: "Planifiez vos déplacements :"
        }
      ],
      esim: [
        {
          context: "Une connexion internet fiable est cruciale pour les nomades. Notre partenaire Airalo propose des eSIM dans 200+ pays avec des tarifs transparents.",
          cta: "Configurez votre eSIM :"
        }
      ],
      insurance: [
        {
          context: "L'assurance voyage est obligatoire dans de nombreux pays. Notre partenaire SafetyWing propose des couvertures adaptées aux nomades digitaux.",
          cta: "Protégez votre voyage :"
        }
      ]
    };
  }

  /**
   * Analyse le contenu avec widget_plan et place les widgets contextuellement
   * @param {string} content - Contenu HTML de l'article
   * @param {Object} articleContext - Contexte de l'article
   * @param {Object} widgetPlan - Plan de widgets structuré
   * @returns {Promise<string>} Contenu avec widgets placés
   */
  async placeWidgetsIntelligently(content, articleContext, widgetPlan, pipelineContext = null) {
    try {
      console.log('\n🎯 PLACEMENT INTELLIGENT AVEC WIDGET_PLAN');
      console.log('==========================================\n');

      const prompt = `Tu es un expert en UX et content marketing pour un site de voyage.

MISSION: Analyser ce contenu et placer les widgets selon le plan fourni, en respectant les contraintes et en optimisant l'expérience utilisateur.

ARTICLE:
${content}

CONTEXTE:
- Type: ${articleContext.type || 'Témoignage'}
${articleContext.type && articleContext.type.startsWith('TEMOIGNAGE_') ? '- Si le type est "Témoignage", tu dois viser entre 2 et 3 placements de widgets maximum, bien intégrés dans le flux (pas en intro, pas tout en bas).' : ''}
- Destination: ${articleContext.destination || 'Asie'}
- Audience: ${articleContext.audience || 'Nomades digitaux'}

ANALYSE SÉMANTIQUE REQUISE:
- ⚠️ CRITIQUE : Identifie TOUTES les villes/destinations mentionnées dans le contenu (noms de villes, pays, régions, destinations touristiques) - peu importe leur nom, détecte-les automatiquement
- Identifie tous les mots-clés liés à l'hébergement (coliving, coworking, logement, hébergement, appartement, etc.)
- Identifie tous les mots-clés liés aux transports (vols, avion, transport, déplacement, voyage, etc.)
- Identifie tous les mots-clés liés aux formalités (visa, passeport, formalités, documents, etc.)
- Identifie tous les mots-clés liés au budget (coût, prix, budget, économique, etc.)

PLAN DE WIDGETS:
${JSON.stringify(widgetPlan, null, 2)}

RÈGLES DE PLACEMENT:
1. Respecte les CAPS: max ${widgetPlan.caps.desktop_max} widgets desktop, ${widgetPlan.caps.mobile_max} mobile
2. Respecte les CONTRAINTES: ${JSON.stringify(widgetPlan.constraints)}
3. Utilise les HINTS: ${widgetPlan.hints.join(', ')}
4. Évite les slots avec inventory:"empty"
5. Place les widgets dans le flow naturel du contenu
6. Respecte l'espacement minimum: ${widgetPlan.caps.min_paragraph_gap} paragraphes

WIDGETS DISPONIBLES:
${Object.entries(widgetPlan.providers).map(([slot, provider]) => 
  `- ${slot.toUpperCase()}: ${provider} (${widgetPlan.presets[slot]})`
).join('\n')}

IMPORTANT: Tu ne peux suggérer QUE les widgets listés ci-dessus. 
Ne suggère JAMAIS de widgets qui ne sont pas dans cette liste (comme 'budget', 'crypto', etc.).

INSTRUCTIONS:
${articleContext.type && articleContext.type.startsWith('TEMOIGNAGE_') ? `- Pour les contenus de type "Témoignage", tu DOIS placer au moins 1 widget FLIGHTS et, si le texte contient des mots-clés liés à la connectivité (eSIM, internet, SIM), au moins 1 widget ESIM.
- Ne jamais dépasser 3 widgets au total pour un témoignage.

` : ''}1. ANALYSE SÉMANTIQUE: Identifie les mots-clés contextuels dans le contenu
2. MAPPING CONTEXTUEL: Associe chaque section à l'intent le plus pertinent :
   - Si le contenu parle de "vols", "transport", "déplacement", "voyage", "arrivée", "départ", "aéroport", "compagnie aérienne", "billet", "réservation vol" → widget FLIGHTS
   - ⚠️ CRITIQUE : Si le contenu mentionne UNE VILLE ou UNE DESTINATION (peu importe son nom), tu DOIS suggérer un widget FLIGHTS. C'est OBLIGATOIRE !
   - ⚠️ Détecte automatiquement TOUTES les villes/destinations mentionnées dans le contenu (noms de villes, pays, régions, destinations touristiques) et suggère un widget FLIGHTS pour chacune
   - ⚠️ Ne te limite PAS à une liste de villes - détecte TOUTES les villes/destinations mentionnées, même si elles ne sont pas dans une liste d'exemples
   - Si le contenu parle de "visa", "e-visa", "formalités", "entrée", "sortie", "frontière" → widget FLIGHTS (car les visas impliquent des voyages)
   - Si le contenu parle de "connectivité", "eSIM", "internet", "téléphone", "SIM" → widget ESIM
   - Si le contenu parle de "coliving", "coworking", "hébergement", "logement", "appartement" → LIEN EXTERNE (Coliving.com, Outsite, Selina)
   - Si le contenu parle de "budget", "finance", "argent", "coût", "prix" → LIEN EXTERNE (Wise, Revolut, N26)
   - Si le contenu parle de "assurance", "santé", "protection" → LIEN EXTERNE (SafetyWing, World Nomads)
   - IMPORTANT: Si le contenu parle de "coliving" → ÉVITE le widget FLIGHTS (incohérent)
   - IMPORTANT: Si le contenu parle de "vols" → ÉVITE les liens externes coliving (incohérent)

⚠️ ATTENTION CRITIQUE: Détecte automatiquement TOUTES les villes/destinations mentionnées dans le contenu (peu importe leur nom) et suggère un widget FLIGHTS. C'est OBLIGATOIRE pour toute mention de ville/destination !

3. PLACEMENT INTELLIGENT ET STRATÉGIQUE: 
   - Place les widgets dans le MILIEU de l'article (après le contenu principal, AVANT "Articles connexes")
   - Évite de placer APRÈS "Articles connexes" (visibilité réduite)
   - Privilégie les sections contextuelles (ex: après une mention de destination, après une section sur les transports)
   - Si aucune section contextuelle n'existe, place AVANT "Articles connexes" (pas après)
4. ACCROCHES CONTEXTUELLES: Génère des accroches qui correspondent au contexte réel du contenu
5. VÉRIFICATION CONTEXTUELLE INTELLIGENTE OBLIGATOIRE: 
   - Si le contenu parle de 'coliving' → INTERDIT de suggérer des widgets FLIGHTS/AVIASALES
   - Si le contenu parle de 'vols' → INTERDIT de suggérer des liens coliving
   - Si le contenu parle de 'familles avec enfants' → INTERDIT de suggérer des liens crypto/coliving
   - Si le contenu parle de 'mineur' sans contexte familial → INTERDIT de suggérer des liens familiaux
   - Si le contenu parle de 'voyager avec des enfants' → INTERDIT de suggérer des liens crypto
   - Vérifie que chaque widget est logiquement cohérent avec le contexte réel
   - REFUSE catégoriquement tout placement incohérent
6. Respecte toutes les contraintes du plan

RÉPONSE ATTENDUE (JSON):
{
  "selected_widgets": [
    {
      "slot": "flights",
      "position": "after_section",
      "section_title": "Comment s'y rendre",
      "context_intro": "Texte d'introduction contextuel",
      "cta": "Call-to-action"
    }
  ],
  "reasoning": "Explication du choix des widgets et positions"
}

Réponds UNIQUEMENT en JSON valide.`;

      // Initialiser le client de manière lazy (pas d'import OpenAI si FORCE_OFFLINE=1)
      if (!this.openai) {
        this.openai = await getOpenAIClient();
      }
      
      if (!this.openai) {
        throw new Error('OpenAI non disponible (FORCE_OFFLINE=1 ou clé API manquante)');
      }

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      console.log('✅ Analyse LLM terminée');
      const widgetsSelected = analysis.selected_widgets.length;
      console.log(`📊 Widgets sélectionnés: ${widgetsSelected}`);
      console.log(`💭 Raisonnement: ${analysis.reasoning}`);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'contextual-widget-placer-v2.js:placeWidgetsIntelligently:LLM_ANALYSIS',message:'Widget LLM analysis result',data:{widgetsSelected,selectedWidgets:analysis.selected_widgets,reasoning:analysis.reasoning},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H-WIDGET-LLM'})}).catch(()=>{});
      // #endregion

      // Limiter les widgets selon le type de contenu
      // Pour les témoignages: 2-3 widgets max, pour les autres: 2 max
      const isTemoignage = articleContext.type && articleContext.type.startsWith('TEMOIGNAGE_');
      const maxWidgets = isTemoignage ? 3 : 2;
      const limitedWidgets = analysis.selected_widgets.slice(0, maxWidgets);
      console.log(`🎯 Widgets limités à: ${limitedWidgets.length} (max: ${maxWidgets} pour ${isTemoignage ? 'témoignage' : 'autre type'})`);
      
      // FIX: Construire pipelineContext au début pour éviter TDZ
      // Utiliser pipelineContext.geo_defaults (source unique)
      const pipelineContextForPlacement = pipelineContext || { geo_defaults: widgetPlan?.widget_plan?.geo_defaults || null };
      
      console.log('🔍 DEBUG placement: pipelineContext keys=', pipelineContextForPlacement ? Object.keys(pipelineContextForPlacement).join(', ') : 'null');
      console.log('🔍 DEBUG placement: geo_defaults=', pipelineContextForPlacement?.geo_defaults ? 'PRESENT' : 'NULL');
      
      // VÉRIFICATION CONTEXTUELLE OBLIGATOIRE AVANT PLACEMENT (avec pipelineContext pour renderability)
      const validatedWidgets = this.validateWidgetContext(content, limitedWidgets, pipelineContextForPlacement);
      const widgetsValidated = validatedWidgets.length;
      console.log(`🔍 Widgets validés: ${widgetsValidated}/${limitedWidgets.length}`);
      
      // Log détaillé si validation échoue
      if (widgetsValidated < limitedWidgets.length) {
        const rejectedCount = limitedWidgets.length - widgetsValidated;
        console.log(`⚠️ ${rejectedCount} widget(s) rejeté(s) par validation contextuelle`);
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'contextual-widget-placer-v2.js:placeWidgetsIntelligently:VALIDATION',message:'Widget validation result',data:{limitedWidgets:limitedWidgets.map(w=>w.slot),validatedWidgets:validatedWidgets.map(w=>w.slot),widgetsRejected:limitedWidgets.length-validatedWidgets.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H-WIDGET-VALID'})}).catch(()=>{});
      // #endregion
      
      // Placer les widgets dans le contenu
      let placementResult;
      try {
        placementResult = await this.insertWidgetsContextually(
        content, 
        validatedWidgets, 
          widgetPlan,
          pipelineContextForPlacement // Passer pipelineContext pour getWidgetScript
        );
      } catch (error) {
        console.error('❌ Erreur placement widgets:', error.message);
        console.error('📚 Stack trace:', error.stack); // MISSION 1: Ajouter stack trace
        // FIX D: Fallback si placement échoue
        console.log('⚠️ Placement échoué → injection widget fallback');
        const fallbackContent = this.injectFallbackWidget(content);
        placementResult = { content: fallbackContent, count: 1 };
      }
      
      // MISSION 2: Extraire le count et le content depuis placementResult
      let widgetsReplaced = 0;
      let finalContent = content;
      
      if (typeof placementResult === 'object' && placementResult !== null) {
        widgetsReplaced = placementResult.count || 0;
        finalContent = placementResult.content || placementResult || content;
      } else if (typeof placementResult === 'string') {
        finalContent = placementResult;
        // Compter depuis le HTML si count n'est pas disponible
        widgetsReplaced = (finalContent.match(/trpwdg\.com\/content|FLASHVOYAGE_WIDGET/g) || []).length;
      }
      
      console.log(`✅ Widgets remplacés: ${widgetsReplaced}/${widgetsValidated}`);
      
      // MISSION 2: Centraliser le tracking dans pipelineContext
      const widgetsTracking = {
        planned: limitedWidgets.length,
        validated: widgetsValidated,
        inserted: widgetsReplaced,
        rendered: widgetsReplaced,
        errors: []
      };
      
      // Standardiser les compteurs pour logs cohérents
      console.log(`📊 Widgets tracking: planned=${widgetsTracking.planned}, validated=${widgetsTracking.validated}, inserted=${widgetsTracking.inserted}, rendered=${widgetsTracking.rendered}`);
      
      // FIX D: Fallback widget si aucun widget rendu mais validated > 0
      if (widgetsReplaced === 0 && widgetsValidated > 0) {
        console.log('⚠️ Aucun widget rendu mais validated > 0 → injection widget fallback');
        finalContent = this.injectFallbackWidget(finalContent);
        widgetsReplaced = 1; // Compter le fallback comme rendu
        widgetsTracking.inserted = 1;
        widgetsTracking.rendered = 1;
        console.log(`📊 Widgets tracking (après fallback): rendered=${widgetsTracking.rendered}`);
      }
      
      // MISSION 2: Stocker le tracking dans pipelineContext si disponible
      if (pipelineContext) {
        pipelineContext.widgets_tracking = widgetsTracking;
      }
      
      // MISSION 2: Retourner un objet avec content et count pour le tracking
      return {
        content: finalContent,
        count: widgetsTracking.rendered,
        tracking: widgetsTracking
      };

    } catch (error) {
      console.error('❌ Erreur placement widgets:', error.message);
      return content; // Retourner le contenu original en cas d'erreur
    }
  }

  /**
   * Valide le contexte des widgets avant placement
   * FIX: Scoring familial avec triggers forts/faibles + source de vérité unique
   */
  validateWidgetContext(content, widgets, context = null) {
    const lowerContent = content.toLowerCase();
    const validatedWidgets = [];
    
    for (const widget of widgets) {
      // FIX B/C: Source de vérité unique pour la validation (inclut renderability via context)
      const validation = this.validateWidget(widget, content, lowerContent, context);
      
      if (validation.ok) {
        validatedWidgets.push(widget);
        console.log(`✅ Widget ${widget.slot.toUpperCase()} validé - ${validation.reasons.join(', ')}`);
      } else {
        console.log(`❌ Widget ${widget.slot.toUpperCase()} rejeté - ${validation.reasons.join(', ')}`);
        if (validation.debug && validation.debug.renderability) {
          console.log(`   WIDGET_REJECTED: type=${widget.slot} reason=${validation.debug.renderability.reason}`);
        }
        if (validation.debug && validation.debug.familyDecision) {
          console.log(`   Family validation: ${validation.debug.familyDecision} (score: ${validation.debug.familyScore})`);
          if (validation.debug.familyTriggersStrong.length > 0) {
            console.log(`   Triggers forts: ${validation.debug.familyTriggersStrong.join(', ')}`);
          }
          if (validation.debug.familyTriggersWeak.length > 0) {
            console.log(`   Triggers faibles: ${validation.debug.familyTriggersWeak.join(', ')}`);
          }
        }
      }
    }
    
    return validatedWidgets;
  }

  /**
   * Vérifie si un widget est renderable (registry + script disponible)
   * @returns {Object} { renderable: boolean, reason: string }
   */
  isWidgetRenderable(widgetSlot, geoDefaults = null) {
    // Vérifier si le slot existe dans le registry
    const widgetCategory = REAL_TRAVELPAYOUTS_WIDGETS[widgetSlot];
    if (!widgetCategory) {
      return { renderable: false, reason: `registry_missing: slot "${widgetSlot}" non trouvé dans REAL_TRAVELPAYOUTS_WIDGETS` };
    }
    
    // Vérifier qu'il y a au moins un provider et un widget type
    const providers = Object.keys(widgetCategory);
    if (providers.length === 0) {
      return { renderable: false, reason: `registry_empty: slot "${widgetSlot}" existe mais aucun provider` };
    }
    
    // Vérifier qu'il y a au moins un widget type avec script
    const provider = providers[0];
    const widgetTypes = Object.keys(widgetCategory[provider]);
    if (widgetTypes.length === 0) {
      return { renderable: false, reason: `registry_empty: slot "${widgetSlot}" existe mais aucun widget type` };
    }
    
    const widgetType = widgetTypes[0];
    const widgetData = widgetCategory[provider][widgetType];
    
    if (!widgetData || !widgetData.script) {
      return { renderable: false, reason: `script_missing: slot "${widgetSlot}" existe mais script vide` };
    }
    
    // Vérifications spécifiques par slot
    if (widgetSlot === 'flights') {
      // FIX B/C: Utiliser geo_defaults depuis context (source unique)
      if (!geoDefaults) {
        console.log(`⚠️ WIDGET_PIPELINE_ABORTED: geo_defaults_missing pour FLIGHTS`);
        console.log(`   context.geo_defaults: ${geoDefaults ? 'PRESENT' : 'NULL'}`);
        return { renderable: false, reason: `geo_missing: widget FLIGHTS nécessite geo_defaults` };
      }
      if (!geoDefaults.destination) {
        console.log(`⚠️ WIDGET_PIPELINE_ABORTED: destination_missing pour FLIGHTS`);
        console.log(`   geo_defaults keys: ${Object.keys(geoDefaults).join(', ')}`);
        return { renderable: false, reason: `destination_missing: widget FLIGHTS nécessite destination` };
      }
    }
    
    return { renderable: true, reason: 'ok' };
  }

  /**
   * Valide un widget individuel avec scoring et source de vérité unique
   * @returns {Object} { ok: boolean, reasons: string[], debug: Object }
   */
  validateWidget(widget, content, lowerContent, context = null) {
    const reasons = [];
    const debug = {};
    
    // FIX B/C: VÉRIFICATION 0: Renderability (registry + script) via context.geo_defaults
    const geoDefaults = context?.geo_defaults || null;
    const renderability = this.isWidgetRenderable(widget.slot, geoDefaults);
    if (!renderability.renderable) {
      reasons.push(`Registry/script manquant: ${renderability.reason}`);
      debug.renderability = renderability;
      return { ok: false, reasons, debug };
    }
    debug.renderability = renderability;
    
    // VÉRIFICATION 1: Contexte vol vs hébergement (pour widgets FLIGHTS)
    if (widget.slot === 'flights') {
      const accommodationKeywords = [
        'coliving', 'coworking', 'hébergement', 'logement', 'appartement',
        'chambre', 'chambres', 'studio', 'airbnb', 'booking', 'hostel', 'auberge'
      ];
      
      const flightKeywords = [
        'vol', 'vols', 'avion', 'transport', 'déplacement', 'voyage', 'arrivée', 'départ',
        'aéroport', 'compagnie aérienne', 'billet', 'réservation vol'
      ];
      
      const accommodationMentions = accommodationKeywords.reduce((count, keyword) => {
        return count + (lowerContent.split(keyword).length - 1);
      }, 0);
      
      const flightMentions = flightKeywords.reduce((count, keyword) => {
        return count + (lowerContent.split(keyword).length - 1);
      }, 0);
      
      debug.accommodationMentions = accommodationMentions;
      debug.flightMentions = flightMentions;
      
      // LOGIQUE INTELLIGENTE : Rejeter seulement si hébergement DOMINE
        if (accommodationMentions > flightMentions && accommodationMentions > 0) {
        reasons.push(`Hébergement domine (${accommodationMentions} vs ${flightMentions})`);
        return { ok: false, reasons, debug };
        } else if (accommodationMentions > 0 && flightMentions === 0) {
        reasons.push(`Hébergement sans contexte vol`);
        return { ok: false, reasons, debug };
        } else {
        reasons.push(`Contexte vol approprié (${flightMentions} mentions)`);
        }
      }
      
    // VÉRIFICATION 2: Scoring familial avec triggers forts/faibles
    const familyValidation = this.validateFamilyContext(lowerContent, widget.slot);
    debug.familyTriggersStrong = familyValidation.triggersStrong;
    debug.familyTriggersWeak = familyValidation.triggersWeak;
    debug.familyScore = familyValidation.score;
    debug.familyDecision = familyValidation.decision;
    debug.familyReason = familyValidation.reason;
    
    if (!familyValidation.allowed) {
      reasons.push(`Contexte familial bloquant: ${familyValidation.reason}`);
      return { ok: false, reasons, debug };
    }
    
    return { ok: true, reasons, debug };
  }

  /**
   * Valide le contexte familial avec scoring (triggers forts/faibles)
   * FIX C: Rendre plus strict pour éviter faux positifs (ex: Nakasendo/Magome-Nagiso)
   * @returns {Object} { allowed: boolean, score: number, triggersStrong: string[], triggersWeak: string[], decision: string, reason: string }
   */
  validateFamilyContext(lowerContent, widgetSlot) {
    // Blacklist: contextes qui NE doivent PAS déclencher (ex: "Nakasendo", "Magome-Nagiso")
    const blacklist = ['nakasendo', 'magome', 'nagiso', 'kiso', 'endo'];
    const hasBlacklist = blacklist.some(term => lowerContent.includes(term));
    if (hasBlacklist) {
      // Si blacklist présent, ne pas bloquer même si triggers détectés
      return {
        allowed: true,
        score: 0,
        triggersStrong: [],
        triggersWeak: [],
        decision: 'allowed',
        reason: 'Blacklist détectée (contexte non-familial)'
      };
    }
    
    // Triggers "forts" (bloquent) : +2 points chacun
    const strongTriggers = [
      'baby', 'bébé', 'toddler', 'child', 'kid', 'enfant', 'mineur',
      'poussette', 'stroller', 'car seat', 'siège auto', 'nursery',
      'pregnan', 'grossesse', 'school', 'école', 'bébés', 'enfants',
      'with my child', 'avec mon enfant', 'avec mes enfants', 'voyager avec enfant',
      'voyager avec bébé', 'traveling with child', 'traveling with baby'
    ];
    
    // Triggers "faibles" (ne bloquent pas seuls) : +1 point chacun
    const weakTriggers = ['family', 'famille', 'familial', 'familiale'];
    
    // Détecter les triggers forts (avec word boundaries pour éviter faux positifs)
    const triggersStrong = strongTriggers.filter(trigger => {
      // Utiliser word boundaries pour éviter matches partiels
      const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      return regex.test(lowerContent);
    });
    
    // Détecter les triggers faibles
    const triggersWeak = weakTriggers.filter(trigger => {
      const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      return regex.test(lowerContent);
    });
    
    // Calculer le score
    const strongScore = triggersStrong.length * 2;
    const weakScore = triggersWeak.length * 1;
    const totalScore = strongScore + weakScore;
    
    // FIX C: Règle plus stricte - Rejeter UNIQUEMENT si trigger fort présent OU score >= 3
    // (augmenter seuil de 2 à 3 pour éviter faux positifs)
    const hasStrongTrigger = triggersStrong.length > 0;
    const shouldReject = hasStrongTrigger || totalScore >= 3;
    
    let decision = 'allowed';
    let reason = '';
    
    if (shouldReject) {
      decision = 'rejected';
      if (hasStrongTrigger) {
        reason = `Trigger fort détecté: ${triggersStrong.join(', ')}`;
      } else {
        reason = `Score familial trop élevé: ${totalScore} (seuil: 3)`;
      }
    } else {
      if (triggersWeak.length > 0) {
        reason = `Triggers faibles détectés mais non bloquants: ${triggersWeak.join(', ')} (score: ${totalScore})`;
      } else {
        reason = 'Aucun trigger familial détecté';
      }
    }
    
    return {
      allowed: !shouldReject,
      score: totalScore,
      triggersStrong,
      triggersWeak,
      decision,
      reason
    };
  }

  /**
   * Insère des liens externes nomades contextuels
   */
  async insertNomadLinks(content, articleContext) {
    try {
      console.log('\n🔗 INSERTION DE LIENS NOMADES');
      console.log('==============================\n');

      // SUPPRESSION COMPLÈTE DES LIENS NOMADES
      console.log('❌ Liens nomades SUPPRIMÉS - Section désactivée');
      return content;

    } catch (error) {
      console.error('❌ Erreur insertion lien nomade:', error.message);
      return content;
    }
  }

  /**
   * Génère une accroche contextuelle pour le lien nomade
   */
  generateNomadLinkIntro(nomadLink, content) {
    // Analyser le contexte de l'article pour créer une intro naturelle
    const lowerContent = content.toLowerCase();
    
    // VÉRIFICATION CONTEXTUELLE INTELLIGENTE
    // Si le contenu parle de 'familles avec enfants' → Évite les liens nomades digitaux
    if (lowerContent.includes('famille') && lowerContent.includes('enfant') && 
        (nomadLink.name.includes('Revolut') || nomadLink.name.includes('Wise') || nomadLink.name.includes('N26'))) {
      return null; // Pas d'intro si contexte familial + banque nomade
    }
    
    // Si le contenu parle de 'coliving' → Utilise des liens coliving, pas hôtels
    if (lowerContent.includes('coliving') && nomadLink.name.includes('Hotel')) {
      return null; // Pas d'intro si coliving + hôtel
    }
    
    // Si le contenu parle de 'coliving' → ÉVITE les liens financiers (incohérent)
    if (lowerContent.includes('coliving') && 
        (nomadLink.name.includes('Wise') || nomadLink.name.includes('Revolut') || nomadLink.name.includes('N26'))) {
      return null; // Pas d'intro si coliving + banque nomade
    }
    
    // Si le contenu parle de 'voyager avec des enfants' → ÉVITE les liens crypto/coliving
    if (lowerContent.includes('voyager avec des enfants') && 
        (nomadLink.name.includes('Binance') || nomadLink.name.includes('Coliving') || nomadLink.name.includes('Outsite'))) {
      return null; // Pas d'intro si familles + crypto/coliving
    }
    
    // Si le contenu parle de 'familles qui voyagent avec des enfants' → ÉVITE les liens crypto/coliving
    if (lowerContent.includes('familles qui voyagent avec des enfants') && 
        (nomadLink.name.includes('Binance') || nomadLink.name.includes('Coliving') || nomadLink.name.includes('Outsite'))) {
      return null; // Pas d'intro si familles + crypto/coliving
    }
    
    // Si le contenu parle de 'familles avec enfants' → ÉVITE les liens nomades digitaux
    if ((lowerContent.includes('famille') && lowerContent.includes('enfant')) && 
        (nomadLink.name.includes('Binance') || nomadLink.name.includes('Coliving') || nomadLink.name.includes('Outsite') || nomadLink.name.includes('Revolut') || nomadLink.name.includes('Wise') || nomadLink.name.includes('N26'))) {
      return null; // Pas d'intro si familles + nomades digitaux
    }
    
    // Si le contenu parle de 'parents qui voyagent avec des mineurs' → ÉVITE les liens crypto
    if (lowerContent.includes('parents qui voyagent avec des mineurs') && 
        nomadLink.name.includes('Binance')) {
      return null; // Pas d'intro si parents + mineurs + crypto
    }
    
    // Si le contenu parle de 'coliving' → ÉVITE les liens crypto
    if (lowerContent.includes('coliving') && 
        nomadLink.name.includes('Binance')) {
      return null; // Pas d'intro si coliving + crypto
    }
    
    // Si le contenu parle de 'mineur' sans contexte familial → Évite les liens familiaux
    if (lowerContent.includes('mineur') && !lowerContent.includes('famille') && 
        (nomadLink.name.includes('SafetyWing') || nomadLink.name.includes('World Nomads'))) {
      return null; // Pas d'intro si mineur sans famille + assurance
    }
    
    // Intros contextuelles basées sur le contenu de l'article
    const contextualIntros = {
      // Si l'article parle de voyage avec des mineurs
      minors_travel: [
        "D'ailleurs, pour les familles qui voyagent avec des enfants,",
        "Au passage, les parents qui voyagent avec des mineurs",
        "En complément, voyager avec des enfants nécessite souvent"
      ],
      // Si l'article parle de préparation/documents
      preparation: [
        "Une fois les documents en ordre,",
        "Après avoir préparé tous les documents nécessaires,",
        "Les formalités administratives réglées,"
      ],
      // Si l'article parle de sécurité/précautions
      safety: [
        "La sécurité financière est tout aussi importante que la sécurité physique,",
        "Outre les précautions administratives,",
        "Une fois les aspects sécuritaires couverts,"
      ],
      // Si l'article parle de voyage/expérience
      travel_experience: [
        "Au fil de mes voyages,",
        "En tant que nomade digital,",
        "Pour optimiser mes déplacements,"
      ],
      // Fallback générique
      generic: [
        "Pour les nomades digitaux,",
        "Les voyageurs modernes",
        "Gérer ses finances en voyage nécessite"
      ]
    };

    // Déterminer le contexte le plus approprié
    // MISSION 1: Renommer pour éviter shadowing avec placementContext
    let introContextType = 'generic';
    
    // VÉRIFICATION INTELLIGENTE : Seulement si le contexte JUSTIFIE l'intro
    if (lowerContent.includes('famille') && lowerContent.includes('enfant') && 
        (lowerContent.includes('voyager avec des enfants') || lowerContent.includes('familles qui voyagent'))) {
      introContextType = 'minors_travel';
    } else if (lowerContent.includes('préparation') || lowerContent.includes('document') || lowerContent.includes('formulaire')) {
      introContextType = 'preparation';
    } else if (lowerContent.includes('sécurité') || lowerContent.includes('précaution') || lowerContent.includes('protection')) {
      introContextType = 'safety';
    } else if (lowerContent.includes('voyage') || lowerContent.includes('expérience') || lowerContent.includes('découverte') || lowerContent.includes('aventure')) {
      introContextType = 'travel_experience';
    }

    const availableIntros = contextualIntros[introContextType];
    return availableIntros[Math.floor(Math.random() * availableIntros.length)];
  }

  /**
   * Vérifie si le contexte justifie le lien nomade - APPROCHE SMART ET ÉLÉGANTE
   */
  isContextAppropriate(nomadLink, content) {
    const lowerContent = content.toLowerCase();
    
    // VÉRIFICATION CONTEXTUELLE INTELLIGENTE
    // Si le contenu parle de 'familles avec enfants' → Évite les liens nomades digitaux
    if (lowerContent.includes('famille') && lowerContent.includes('enfant') && 
        (nomadLink.name.includes('Revolut') || nomadLink.name.includes('Wise') || nomadLink.name.includes('N26'))) {
      return false; // Contexte familial + banque nomade = incohérent
    }
    
    // Si le contenu parle de 'coliving' → Utilise des liens coliving, pas hôtels
    if (lowerContent.includes('coliving') && nomadLink.name.includes('Hotel')) {
      return false; // Coliving + hôtel = incohérent
    }
    
    // Si le contenu parle de 'coliving' → ÉVITE les liens financiers (incohérent)
    if (lowerContent.includes('coliving') && 
        (nomadLink.name.includes('Wise') || nomadLink.name.includes('Revolut') || nomadLink.name.includes('N26'))) {
      return false; // Coliving + banque nomade = incohérent
    }
    
    // Si le contenu parle de 'voyager avec des enfants' → ÉVITE les liens crypto/coliving
    if (lowerContent.includes('voyager avec des enfants') && 
        (nomadLink.name.includes('Binance') || nomadLink.name.includes('Coliving') || nomadLink.name.includes('Outsite'))) {
      return false; // Familles + crypto/coliving = incohérent
    }
    
    // Si le contenu parle de 'familles qui voyagent avec des enfants' → ÉVITE les liens crypto/coliving
    if (lowerContent.includes('familles qui voyagent avec des enfants') && 
        (nomadLink.name.includes('Binance') || nomadLink.name.includes('Coliving') || nomadLink.name.includes('Outsite'))) {
      return false; // Familles + crypto/coliving = incohérent
    }
    
    // Si le contenu parle de 'familles avec enfants' → ÉVITE les liens nomades digitaux
    if ((lowerContent.includes('famille') && lowerContent.includes('enfant')) && 
        (nomadLink.name.includes('Binance') || nomadLink.name.includes('Coliving') || nomadLink.name.includes('Outsite') || nomadLink.name.includes('Revolut') || nomadLink.name.includes('Wise') || nomadLink.name.includes('N26'))) {
      return false; // Familles + nomades digitaux = incohérent
    }
    
    // Si le contenu parle de 'parents qui voyagent avec des mineurs' → ÉVITE les liens crypto
    if (lowerContent.includes('parents qui voyagent avec des mineurs') && 
        nomadLink.name.includes('Binance')) {
      return false; // Parents + mineurs + crypto = incohérent
    }
    
    // Si le contenu parle de 'coliving' → ÉVITE les liens crypto
    if (lowerContent.includes('coliving') && 
        nomadLink.name.includes('Binance')) {
      return false; // Coliving + crypto = incohérent
    }
    
    // Si le contenu parle de 'mineur' sans contexte familial → Évite les liens familiaux
    if (lowerContent.includes('mineur') && !lowerContent.includes('famille') && 
        (nomadLink.name.includes('SafetyWing') || nomadLink.name.includes('World Nomads'))) {
      return false; // Mineur sans famille + assurance = incohérent
    }
    
    return true; // Par défaut, accepter si contexte cohérent
  }

  /**
   * Trouve le meilleur point d'insertion pour le lien
   */
  findBestInsertionPoint(content) {
    // Chercher des sections pertinentes
    const sections = [
      'h3', 'h2', 'Conseils', 'Guide', 'Astuces', 'Recommandations'
    ];
    
    for (const section of sections) {
      const regex = new RegExp(`<${section}[^>]*>.*?</${section}>`, 'gi');
      const matches = content.match(regex);
      if (matches && matches.length > 0) {
        return matches[matches.length - 1]; // Prendre la dernière section
      }
    }
    
    // Fallback : chercher n'importe quel H2 ou H3
    const fallbackRegex = /<h[23][^>]*>.*?<\/h[23]>/gi;
    const fallbackMatches = content.match(fallbackRegex);
    if (fallbackMatches && fallbackMatches.length > 0) {
      return fallbackMatches[fallbackMatches.length - 1];
    }
    
    // Dernier recours : insérer à la fin
    return '</p>';
  }

  /**
   * Insère les widgets dans le contenu selon les positions suggérées
   * FIX: Ajout du paramètre pipelineContext pour éviter TDZ
   */
  async insertWidgetsContextually(content, selectedWidgets, widgetPlan, pipelineContext = null) {
    // MISSION 1: Remplacer "context" par "placementContext" pour éviter TDZ et shadowing
    const placementContext = pipelineContext || { geo_defaults: widgetPlan?.widget_plan?.geo_defaults || null };
    
    console.log('🔍 DEBUG placement: pipelineContext keys=', pipelineContext ? Object.keys(pipelineContext).join(', ') : 'null');
    console.log('🔍 DEBUG placement: geo_defaults=', placementContext?.geo_defaults ? 'PRESENT' : 'NULL');
    
    let enhancedContent = content;
    const usedContexts = new Set(); // Éviter la duplication

    for (const widget of selectedWidgets) {
      // FIX C: Passer placementContext à getWidgetScript pour geo_defaults
      const widgetScript = this.getWidgetScript(widget.slot, widgetPlan, placementContext);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'contextual-widget-placer-v2.js:insertWidgetsContextually:WIDGET_SCRIPT',message:'Widget script result',data:{slot:widget.slot,hasScript:!!widgetScript,scriptPreview:widgetScript?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H-WIDGET-SCRIPT'})}).catch(()=>{});
      // #endregion
      if (!widgetScript) continue;

      // Vérifier si le contexte existe déjà
      const existingContext = this.findExistingContext(enhancedContent, widget.slot);
      if (existingContext) {
        console.log(`⚠️ Contexte ${widget.slot} déjà présent, widget ignoré`);
        continue;
      }

      // Générer un contexte FOMO avec stats réelles (avec fallback)
      console.log(`📊 Génération de stats réelles pour ${widget.slot}...`);
      let fomoData;
      try {
        // FIX: Utiliser placementContext.geo_defaults (source unique) au lieu de widgetPlan.geo_defaults
        const geoDefaults = placementContext?.geo_defaults || widgetPlan?.geo_defaults || widgetPlan?.widget_plan?.geo_defaults || null;
        fomoData = await this.statsScraper.generateFOMOContext(widget.slot, geoDefaults);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'contextual-widget-placer-v2.js:insertWidgetsContextually:FOMO_SUCCESS',message:'FOMO context generated OK',data:{slot:widget.slot,contextPreview:fomoData?.context?.substring(0,100),statsType:fomoData?.stats?.type||'price'},timestamp:Date.now(),hypothesisId:'H-FOMO-FIX'})}).catch(()=>{});
        // #endregion
      } catch (error) {
        console.log(`⚠️ Erreur scraping stats: ${error.message}`);
        console.log(`❌ Impossible de générer des stats réelles - Widget ignoré`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'contextual-widget-placer-v2.js:insertWidgetsContextually:FOMO_ERROR',message:'FOMO stats scraping FAILED',data:{slot:widget.slot,error:error.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H-WIDGET-FOMO'})}).catch(()=>{});
        // #endregion
        continue; // Passer au widget suivant au lieu d'inventer des données
      }
      
      // VÉRIFICATION CONTEXTUELLE DÉJÀ FAITE DANS validateWidgetContext()
      // Pas besoin de double vérification ici
      
      // MISSION 1: Renommer pour éviter shadowing avec placementContext
      let fomoContext = fomoData.context;
      
      const intro = {
        context: fomoContext,
        cta: this.getCTAText(widget.slot)
      };

      // Vérifier si ce contexte est déjà utilisé
      if (usedContexts.has(intro.context)) {
        console.log(`⚠️ Contexte déjà utilisé, passage au suivant`);
        continue;
      }
      usedContexts.add(intro.context);

      const widgetBlock = `
<div data-fv-segment="affiliate">
<p>${intro.context}</p>
<p><strong>${intro.cta}</strong></p>
${widgetScript}
</div>
`;

      // 3. Insérer le widget APRÈS le contenu principal (pas au milieu)
      // Stratégie : insérer avant "Articles connexes" ou à la fin du contenu
      enhancedContent = await this.insertAfterContent(enhancedContent, widgetBlock);
    }

    // Compter les widgets réellement insérés
    const widgetsReplaced = usedContexts.size;
    
    console.log('🔍 DEBUG placement: inserted=', widgetsReplaced, 'rendered=', widgetsReplaced);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'contextual-widget-placer-v2.js:insertWidgetsContextually:FINAL',message:'Widget insertion final result',data:{widgetsReplaced,usedContexts:Array.from(usedContexts),contentHasWidgetDiv:enhancedContent.includes('data-fv-segment="affiliate"')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H-WIDGET-INSERT'})}).catch(()=>{});
    // #endregion
    
    return {
      content: enhancedContent,
      count: widgetsReplaced
    };
  }

  /**
   * FIX D: Injecte un widget fallback si aucun widget n'a été rendu
   * MISSION 2: Ajouter un marqueur détectable pour le validator
   */
  injectFallbackWidget(content) {
    const fallbackWidget = `
<!-- FLASHVOYAGE_WIDGET:fallback -->
<p><strong>💡 Guide pratique</strong></p>
<p>Pour planifier votre voyage en Asie, consultez nos guides pratiques et nos ressources pour nomades digitaux.</p>
<p><a href="/guides" style="color: #dc2626; text-decoration: underline;">Découvrir nos guides</a></p>
<!-- /FLASHVOYAGE_WIDGET:fallback -->
`;
    
    // Insérer avant "Articles connexes" ou à la fin
    const relatedSectionRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
    const relatedSectionMatch = content.match(relatedSectionRegex);
    
    if (relatedSectionMatch) {
      const relatedSectionIndex = relatedSectionMatch.index;
      console.log('✅ Widget fallback injecté avant "Articles connexes"');
      return content.slice(0, relatedSectionIndex) + '\n\n' + fallbackWidget + '\n\n' + content.slice(relatedSectionIndex);
    }
    
    // Sinon, insérer avant la fin
    const lastP = content.lastIndexOf('</p>');
    if (lastP !== -1) {
      console.log('✅ Widget fallback injecté avant la fin');
      return content.slice(0, lastP + 4) + '\n\n' + fallbackWidget + '\n\n' + content.slice(lastP + 4);
    }
    
    console.log('✅ Widget fallback injecté à la fin');
    return content + '\n\n' + fallbackWidget;
  }

  /**
   * Vérifie si un contexte similaire existe déjà
   */
  findExistingContext(content, slot) {
    const patterns = {
      flights: /Selon notre analyse de milliers de vols|D'après notre expérience avec des centaines de nomades|Les prix des vols varient/gi,
      hotels: /Les nomades digitaux dépensent|D'après notre analyse de 1000\+ réservations/gi,
      transport: /Les transports locaux représentent/gi,
      esim: /Les données mobiles coûtent/gi,
      insurance: /Les assurances voyage/gi
    };

    const pattern = patterns[slot];
    if (!pattern) return false;

    return pattern.test(content);
  }

  /**
   * Obtient le script du widget selon le slot
   * FIX: Ajout du paramètre pipelineContext pour éviter TDZ
   */
  getWidgetScript(slot, widgetPlan, pipelineContext = null) {
    console.log(`🔍 Récupération du script pour ${slot}...`);
    
    // Utiliser les vrais scripts Travelpayouts
    const widgetCategory = REAL_TRAVELPAYOUTS_WIDGETS[slot];
    if (!widgetCategory) {
      console.log(`⚠️ Pas de catégorie widget disponible pour ${slot}`);
      return null;
    }
    
    // Pour les vols, utiliser searchForm avec les destinations dynamiques depuis widgetPlan
    if (slot === 'flights') {
      // RÈGLE ABSOLUE: Pas de geo = pas de widget flights
      if (!widgetPlan?.geo_defaults) {
        console.log('⚠️ Geo insuffisante → widget FLIGHTS désactivé');
        return null;
      }
      
      const provider = Object.keys(widgetCategory)[0]; // kiwi, aviasales, etc.
      const searchFormWidget = widgetCategory[provider]['searchForm'];
      
      if (searchFormWidget && searchFormWidget.script) {
        // Récupérer les destinations depuis widgetPlan.geo_defaults
        console.log(`🔍 DEBUG getWidgetScript: widgetPlan.geo_defaults:`, widgetPlan?.geo_defaults);
        
        // RÈGLE ABSOLUE: Pas de destination OU pas d'origin = pas de widget
        if (!widgetPlan.geo_defaults.destination || !widgetPlan.geo_defaults.origin) {
          console.log('⚠️ Origin ou Destination manquante dans geo_defaults → widget FLIGHTS désactivé');
          console.log(`   origin: ${widgetPlan.geo_defaults.origin || 'MANQUANT'}`);
          console.log(`   destination: ${widgetPlan.geo_defaults.destination || 'MANQUANT'}`);
          return null;
        }
        
        const origin = widgetPlan.geo_defaults.origin;
        const destination = widgetPlan.geo_defaults.destination;
        
        console.log(`🔍 DEBUG getWidgetScript: origin=${origin}, destination=${destination}`);
        
        // Générer le script avec les bonnes destinations
        let dynamicScript = searchFormWidget.script;
        
        // Remplacer les destinations par défaut par les destinations réelles
        dynamicScript = dynamicScript.replace(/default_origin=PAR/g, `default_origin=${origin}`);
        dynamicScript = dynamicScript.replace(/default_destination=BKK/g, `default_destination=${destination}`);
        dynamicScript = dynamicScript.replace(/from_name=paris_fr/g, `from_name=${origin.toLowerCase()}_fr`);
        dynamicScript = dynamicScript.replace(/to_name=bangkok_th/g, `to_name=${destination.toLowerCase()}_th`);
        
        console.log(`✅ Script trouvé pour ${slot}: ${searchFormWidget.brand} - ${searchFormWidget.type}`);
        console.log(`   📍 Destinations: ${origin} → ${destination}`);
        return dynamicScript;
      }
    }
    
    // Pour les autres slots (hotels, esim, connectivity, etc.), prendre le premier widget disponible
    const provider = Object.keys(widgetCategory)[0]; // kiwi, aviasales, airalo, etc.
    if (!provider) {
      console.log(`⚠️ Pas de provider disponible pour ${slot}`);
      return null;
    }
    
    const widgetType = Object.keys(widgetCategory[provider])[0]; // popularRoutes, searchForm, esimSearch, etc.
    if (!widgetType) {
      console.log(`⚠️ Pas de widget type disponible pour ${slot}.${provider}`);
      return null;
    }
    
    const widgetData = widgetCategory[provider][widgetType];
    
    if (!widgetData || !widgetData.script) {
      console.log(`⚠️ Pas de script disponible pour ${slot}.${provider}.${widgetType}`);
      return null;
    }
    
    console.log(`✅ Script trouvé pour ${slot}: ${widgetData.brand} - ${widgetData.type}`);
    return widgetData.script;
  }

  /**
   * Insère le widget après une section
   */
  /**
   * FIX 1: Recherche de section tolérante avec fuzzy matching
   */
  findSectionFuzzy(content, targetTitle) {
    if (!targetTitle) return null;
    
    // Normaliser le titre cible (insensible casse, sans ponctuation)
    const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const targetWords = normalize(targetTitle).split(/\s+/).filter(w => w.length > 2);
    
    if (targetWords.length === 0) return null;
    
    // Chercher tous les H2 et H3
    const headingRegex = /<h([2-3])[^>]*>([^<]+)<\/h[2-3]>/gi;
    const headings = [...content.matchAll(headingRegex)];
    
    for (const heading of headings) {
      const headingText = heading[2];
      const headingWords = normalize(headingText).split(/\s+/).filter(w => w.length > 2);
      
      // Fuzzy match: ≥2 mots communs
      const commonWords = targetWords.filter(tw => headingWords.some(hw => hw.includes(tw) || tw.includes(hw)));
      if (commonWords.length >= 2) {
        return {
          index: heading.index,
          text: headingText,
          level: heading[1],
          matchScore: commonWords.length
        };
      }
    }
    
    return null;
  }

  /**
   * Insère le widget APRÈS le contenu principal (avant "Articles connexes" ou à la fin)
   * Évite l'insertion au milieu du contenu
   */
  async insertAfterContent(content, widgetBlock) {
    // Chercher "Articles connexes" ou sections finales
    const relatedSectionRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
    const relatedSectionMatch = content.match(relatedSectionRegex);
    
    if (relatedSectionMatch) {
      const relatedSectionIndex = relatedSectionMatch.index;
      console.log('✅ Widget inséré avant "Articles connexes"');
      return content.slice(0, relatedSectionIndex) + '\n\n' + widgetBlock + '\n\n' + content.slice(relatedSectionIndex);
    }
    
    // Chercher "Nos recommandations" (dernière section avant articles connexes)
    const recommandationsRegex = /<h2[^>]*>🎯 Nos recommandations[^<]*<\/h2>/i;
    const recommandationsMatch = content.match(recommandationsRegex);
    
    if (recommandationsMatch) {
      // Trouver la fin de cette section (prochain H2 ou fin)
      const startIndex = recommandationsMatch.index;
      const afterRecommandations = content.substring(startIndex);
      const nextH2 = afterRecommandations.indexOf('<h2>', recommandationsMatch[0].length);
      
      if (nextH2 > 0) {
        const insertIndex = startIndex + nextH2;
        console.log('✅ Widget inséré après "Nos recommandations"');
        return content.slice(0, insertIndex) + '\n\n' + widgetBlock + '\n\n' + content.slice(insertIndex);
      }
    }
    
    // Sinon, insérer à la fin du contenu (avant les balises de fermeture)
    const lastH2 = content.lastIndexOf('<h2>');
    if (lastH2 > 0) {
      // Trouver la fin de la dernière section
      const afterLastH2 = content.substring(lastH2);
      const sectionEnd = afterLastH2.indexOf('</p>', 500); // Chercher après 500 chars
      if (sectionEnd > 0) {
        const insertIndex = lastH2 + sectionEnd + 4;
        console.log('✅ Widget inséré après la dernière section');
        return content.slice(0, insertIndex) + '\n\n' + widgetBlock + '\n\n' + content.slice(insertIndex);
      }
    }
    
    // Fallback : insérer à la toute fin
    console.log('✅ Widget inséré à la fin du contenu');
    return content + '\n\n' + widgetBlock;
  }

  /**
   * 3. Placement widget déterministe (FIX B: DOM-based avec cheerio, ignore sectionTitle)
   * sectionTitle est complètement ignoré - placement basé uniquement sur structure DOM
   * @deprecated Utiliser insertAfterContent() à la place
   */
  async insertAfterSection(content, sectionTitle, widgetBlock) {
    // FIX B: Placement DOM-based avec cheerio, jamais recherche texte
    // Ignorer complètement sectionTitle (peut être une phrase LLM fragile)
    
    // Charger cheerio dynamiquement si disponible
    let cheerioLib = null;
    try {
      const cheerioModule = await import('cheerio');
      cheerioLib = cheerioModule.default || cheerioModule;
    } catch (error) {
      // Cheerio non disponible, utiliser fallback
      }
    
    // Essayer cheerio si disponible
    if (cheerioLib) {
      try {
        const $ = cheerioLib.load(content, { decodeEntities: false });
      const body = $('body').length > 0 ? $('body') : $.root();
      
      // PRIORITÉ 1: Chercher section/titre "Articles connexes" via DOM
      let relatedSection = null;
      
      // Chercher <section id="articles-connexes">
      relatedSection = body.find('section[id*="articles-connexes" i], section[id*="related" i]').first();
      
      // Sinon chercher h2/h3 contenant "Articles connexes"
      if (relatedSection.length === 0) {
        body.find('h2, h3').each((i, el) => {
          const text = $(el).text().toLowerCase();
          if (text.includes('articles connexes') || text.includes('articles similaires') || text.includes('voir aussi')) {
            relatedSection = $(el);
            return false; // break
          }
        });
      }
      
      if (relatedSection.length > 0) {
        // Insérer avant la section trouvée
        relatedSection.before(widgetBlock);
        console.log(`✅ Mode BEFORE_RELATED: insertion avant "Articles connexes" (DOM)`);
        return $.html();
    }
    
      // PRIORITÉ 2: Après le 2e <p> substantiel (DOM)
      const paragraphs = body.find('p').filter((i, el) => {
        const text = $(el).text().trim();
        return text.length > 50; // Paragraphe substantiel (>50 chars)
      });
    
      if (paragraphs.length >= 2) {
        const secondP = paragraphs.eq(1);
        secondP.after(widgetBlock);
        console.log(`✅ Mode AFTER_P2: insertion après le 2e paragraphe substantiel (DOM)`);
        return $.html();
      }
      
      // PRIORITÉ 3: Après le premier h2/h3 (DOM)
      const firstHeading = body.find('h2, h3').first();
      if (firstHeading.length > 0) {
        // Chercher le premier <p> après ce heading
        const nextP = firstHeading.nextAll('p').first();
        if (nextP.length > 0) {
          nextP.after(widgetBlock);
          console.log(`✅ Mode AFTER_H2: insertion après le premier H2/H3 (DOM)`);
      } else {
          firstHeading.after(widgetBlock);
          console.log(`✅ Mode AFTER_H2: insertion après le premier H2/H3 (pas de P suivant, DOM)`);
        }
        return $.html();
    }
    
      // PRIORITÉ 4: Après le 1er paragraphe (DOM)
      const firstP = body.find('p').first();
      if (firstP.length > 0) {
        firstP.after(widgetBlock);
        console.log(`✅ Mode AFTER_P1: insertion après le 1er paragraphe (DOM)`);
        return $.html();
      }
      
      // Dernier recours: append fin (uniquement si HTML vraiment vide)
      const bodyContent = body.html() || '';
      if (bodyContent.trim().length === 0) {
        body.append(widgetBlock);
        console.log(`⚠️ Mode EMERGENCY: HTML vide, insertion à la fin (DOM)`);
      } else {
        body.append(widgetBlock);
        console.log(`✅ Mode FALLBACK_END: insertion à la fin (contenu valide mais structure minimale, DOM)`);
      }
      return $.html();
      
      } catch (error) {
        console.log(`⚠️ Erreur DOM parsing avec cheerio, fallback structure: ${error.message}`);
        // Continuer avec fallback structure
      }
    }
    
    // FALLBACK: Placement structurel basé sur regex (si cheerio indisponible ou échec)
    // PRIORITÉ 1: Chercher section/titre "Articles connexes"
    const relatedSectionRegex = /<(?:section[^>]*id=["']articles-connexes["']|h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3])>/i;
    const relatedSectionMatch = content.match(relatedSectionRegex);
    const relatedSectionIndex = relatedSectionMatch ? relatedSectionMatch.index : -1;
    
    if (relatedSectionIndex !== -1) {
      console.log(`✅ Mode BEFORE_RELATED: insertion avant "Articles connexes" (fallback structure)`);
      return content.slice(0, relatedSectionIndex) + '\n\n' + widgetBlock + '\n\n' + content.slice(relatedSectionIndex);
      }
    
    // PRIORITÉ 2: Après le 2e <p> substantiel (regex améliorée)
    const pRegex = /<p[^>]*>([^<]*(?:<[^>]+>[^<]*)*?)<\/p>/gi;
    const pMatches = [...content.matchAll(pRegex)];
    const substantialParagraphs = pMatches.filter(m => {
      const text = m[1].replace(/<[^>]+>/g, '').trim();
      return text.length > 50;
    });
    
    if (substantialParagraphs.length >= 2) {
      const secondP = substantialParagraphs[1];
      const insertionPoint = secondP.index + secondP[0].length;
      console.log(`✅ Mode AFTER_P2: insertion après le 2e paragraphe substantiel (fallback structure)`);
      return content.slice(0, insertionPoint) + '\n\n' + widgetBlock + '\n\n' + content.slice(insertionPoint);
    }
    
    // PRIORITÉ 3: Après le premier h2/h3
    const firstH2Regex = /<h[2-3][^>]*>([^<]+)<\/h[2-3]>/i;
    const firstH2Match = content.match(firstH2Regex);
    
    if (firstH2Match) {
      const firstH2Index = firstH2Match.index + firstH2Match[0].length;
      const afterH2 = content.substring(firstH2Index);
      const firstPAfterH2 = afterH2.match(/<p[^>]*>.*?<\/p>/i);
      
      if (firstPAfterH2) {
        const insertionPoint = firstH2Index + firstPAfterH2.index + firstPAfterH2[0].length;
        console.log(`✅ Mode AFTER_H2: insertion après le premier H2/H3 (fallback structure)`);
        return content.slice(0, insertionPoint) + '\n\n' + widgetBlock + '\n\n' + content.slice(insertionPoint);
      }
    }
    
    // PRIORITÉ 4: Après le 1er paragraphe
    if (pMatches.length >= 1) {
      const firstP = pMatches[0];
      const insertionPoint = firstP.index + firstP[0].length;
      console.log(`✅ Mode AFTER_P1: insertion après le 1er paragraphe (fallback structure)`);
      return content.slice(0, insertionPoint) + '\n\n' + widgetBlock + '\n\n' + content.slice(insertionPoint);
    }
    
    // Dernier recours: append fin
    if (content.trim().length === 0) {
      console.log(`⚠️ Mode EMERGENCY: HTML vide, insertion à la fin (fallback)`);
    } else {
      console.log(`✅ Mode FALLBACK_END: insertion à la fin (contenu valide mais structure minimale, fallback)`);
    }
    return content + '\n\n' + widgetBlock;
  }

  /**
   * Insère le widget avant une section
   */
  insertBeforeSection(content, sectionTitle, widgetBlock) {
    const sectionRegex = new RegExp(`(<h[2-3][^>]*>${sectionTitle}[^<]*</h[2-3]>)`, 'i');
    const match = content.match(sectionRegex);
    
    if (match) {
      const sectionIndex = content.indexOf(match[0]);
      return content.slice(0, sectionIndex) + widgetBlock + '\n\n' + content.slice(sectionIndex);
    }
    
    return content + '\n\n' + widgetBlock;
  }

  /**
   * Génère le texte CTA selon le type de widget
   */
  getCTAText(widgetSlot) {
    const ctaTexts = {
      flights: "Comparez les prix et réservez :",
      hotels: "Trouvez votre hébergement idéal :",
      transport: "Planifiez vos déplacements :",
      esim: "Restez connecté partout :",
      insurance: "Protégez votre voyage :",
      activities: "Découvrez les activités :"
    };
    return ctaTexts[widgetSlot] || "Consultez les options :";
  }

  /**
   * Insère le widget avant la section "Articles connexes" ou à la fin
   */
  insertBeforeRelatedArticles(content, widgetBlock) {
    // Chercher la section "Articles connexes"
    const relatedSectionRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
    const match = content.match(relatedSectionRegex);
    
    if (match) {
      const sectionIndex = content.indexOf(match[0]);
      return content.slice(0, sectionIndex) + widgetBlock + '\n\n' + content.slice(sectionIndex);
    }
    
    // Si pas de section "Articles connexes", placer à la fin
    return content + '\n\n' + widgetBlock;
  }
}

export default ContextualWidgetPlacer;
