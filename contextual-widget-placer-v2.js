#!/usr/bin/env node

/**
 * CONTEXTUAL WIDGET PLACER V2
 * Utilise GPT-4o avec widget_plan pour analyser et placer les widgets
 * de manière contextuelle avec accroches sobres style The Points Guy
 */

import OpenAI from 'openai';
import { OPENAI_API_KEY } from './config.js';
import { RealStatsScraper } from './real-stats-scraper.js';
import { NomadPartnersLinkGenerator } from './nomad-partners-links.js';

class ContextualWidgetPlacer {
  constructor() {
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
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
  async placeWidgetsIntelligently(content, articleContext, widgetPlan) {
    try {
      console.log('\n🎯 PLACEMENT INTELLIGENT AVEC WIDGET_PLAN');
      console.log('==========================================\n');

      const prompt = `Tu es un expert en UX et content marketing pour un site de voyage.

MISSION: Analyser ce contenu et placer les widgets selon le plan fourni, en respectant les contraintes et en optimisant l'expérience utilisateur.

ARTICLE:
${content}

CONTEXTE:
- Type: ${articleContext.type || 'Témoignage'}
- Destination: ${articleContext.destination || 'Asie'}
- Audience: ${articleContext.audience || 'Nomades digitaux'}

ANALYSE SÉMANTIQUE REQUISE:
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

INSTRUCTIONS:
1. ANALYSE SÉMANTIQUE: Identifie les mots-clés contextuels dans le contenu
2. MAPPING CONTEXTUEL: Associe chaque section à l'intent le plus pertinent :
   - Si le contenu parle de "vols", "transport", "déplacement", "voyage", "arrivée", "départ" → widget FLIGHTS
   - Si le contenu parle de "connectivité", "eSIM", "internet", "téléphone" → widget CONNECTIVITY
   - Si le contenu parle de "coliving", "coworking", "hébergement", "logement", "appartement" → LIEN EXTERNE (Coliving.com, Outsite, Selina)
   - Si le contenu parle de "budget", "finance", "argent", "coût", "prix" → LIEN EXTERNE (Wise, Revolut, N26)
   - Si le contenu parle de "assurance", "santé", "protection" → LIEN EXTERNE (SafetyWing, World Nomads)
   - IMPORTANT: Si le contenu parle de "coliving" → ÉVITE le widget FLIGHTS (incohérent)
   - IMPORTANT: Si le contenu parle de "vols" → ÉVITE les liens externes coliving (incohérent)
3. PLACEMENT INTELLIGENT: Place les widgets dans les sections qui correspondent sémantiquement
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

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      console.log('✅ Analyse LLM terminée');
      console.log(`📊 Widgets sélectionnés: ${analysis.selected_widgets.length}`);
      console.log(`💭 Raisonnement: ${analysis.reasoning}`);

      // Limiter à 1-2 widgets maximum pour éviter les doublons
      const limitedWidgets = analysis.selected_widgets.slice(0, 2);
      console.log(`🎯 Widgets limités à: ${limitedWidgets.length}`);
      
      // VÉRIFICATION CONTEXTUELLE OBLIGATOIRE AVANT PLACEMENT
      const validatedWidgets = this.validateWidgetContext(content, limitedWidgets);
      console.log(`🔍 Widgets validés: ${validatedWidgets.length}/${limitedWidgets.length}`);
      
      // Placer les widgets dans le contenu
      const enhancedContent = await this.insertWidgetsContextually(
        content, 
        validatedWidgets, 
        widgetPlan
      );

      return enhancedContent;

    } catch (error) {
      console.error('❌ Erreur placement widgets:', error.message);
      return content; // Retourner le contenu original en cas d'erreur
    }
  }

  /**
   * Valide le contexte des widgets avant placement
   */
  validateWidgetContext(content, widgets) {
    const lowerContent = content.toLowerCase();
    const validatedWidgets = [];
    
    for (const widget of widgets) {
      let isValid = true;
      
      // VÉRIFICATION CONTEXTUELLE STRICTE - TOUS LES MOTS-CLÉS D'HÉBERGEMENT
      const accommodationKeywords = [
        'coliving', 'coworking', 'hébergement', 'logement', 'appartement',
        'chambre', 'chambres', 'studio', 'airbnb', 'booking', 'hostel', 'auberge'
      ];
      
      const hasAccommodationKeywords = accommodationKeywords.some(keyword => 
        lowerContent.includes(keyword)
      );
      
      // INTERDIT de placer des widgets FLIGHTS/HOTELS quand on parle d'hébergement
      if (hasAccommodationKeywords && (widget.slot === 'flights' || widget.slot === 'hotels')) {
        console.log(`❌ Widget ${widget.slot.toUpperCase()} rejeté - Contexte hébergement détecté`);
        isValid = false;
      }
      
      // VÉRIFICATION CONTEXTUELLE FAMILIALE
      const familyKeywords = ['famille', 'enfant', 'mineur', 'parents'];
      const hasFamilyKeywords = familyKeywords.some(keyword => 
        lowerContent.includes(keyword)
      );
      
      // INTERDIT de placer des widgets crypto/coliving pour familles
      if (hasFamilyKeywords && (widget.slot === 'flights' || widget.slot === 'hotels')) {
        console.log(`❌ Widget ${widget.slot.toUpperCase()} rejeté - Contexte familial détecté`);
        isValid = false;
      }
      
      if (isValid) {
        validatedWidgets.push(widget);
        console.log(`✅ Widget ${widget.slot} validé`);
      }
    }
    
    return validatedWidgets;
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
    let context = 'generic';
    
    // VÉRIFICATION INTELLIGENTE : Seulement si le contexte JUSTIFIE l'intro
    if (lowerContent.includes('famille') && lowerContent.includes('enfant') && 
        (lowerContent.includes('voyager avec des enfants') || lowerContent.includes('familles qui voyagent'))) {
      context = 'minors_travel';
    } else if (lowerContent.includes('préparation') || lowerContent.includes('document') || lowerContent.includes('formulaire')) {
      context = 'preparation';
    } else if (lowerContent.includes('sécurité') || lowerContent.includes('précaution') || lowerContent.includes('protection')) {
      context = 'safety';
    } else if (lowerContent.includes('voyage') || lowerContent.includes('expérience') || lowerContent.includes('découverte') || lowerContent.includes('aventure')) {
      context = 'travel_experience';
    }

    const availableIntros = contextualIntros[context];
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
   */
  async insertWidgetsContextually(content, selectedWidgets, widgetPlan) {
    let enhancedContent = content;
    const usedContexts = new Set(); // Éviter la duplication

    for (const widget of selectedWidgets) {
      const widgetScript = this.getWidgetScript(widget.slot, widgetPlan);
      if (!widgetScript) continue;

      // Vérifier si le contexte existe déjà
      const existingContext = this.findExistingContext(enhancedContent, widget.slot);
      if (existingContext) {
        console.log(`⚠️ Contexte ${widget.slot} déjà présent, widget ignoré`);
        continue;
      }

      // Générer un contexte FOMO avec stats réelles
      console.log(`📊 Génération de stats réelles pour ${widget.slot}...`);
      const fomoData = await this.statsScraper.generateFOMOContext(widget.slot, widgetPlan.geo_defaults);
      
      // VÉRIFICATION CONTEXTUELLE STRICTE - INTERDIRE les widgets inappropriés
      const lowerContent = content.toLowerCase();
      
      // INTERDIRE TOUS les widgets pour les familles
      if (lowerContent.includes('famille') && lowerContent.includes('enfant')) {
        console.log('❌ Widget INTERDIT - Contexte familial détecté');
        continue; // Passer au widget suivant
      }
      
      // INTERDIRE les widgets FLIGHTS si le contenu parle d'hébergement
      if (widget.slot === 'flights' && (lowerContent.includes('chambre') || lowerContent.includes('hébergement') || lowerContent.includes('coliving') || lowerContent.includes('hébergements') || lowerContent.includes('Comparez les hébergements'))) {
        console.log('❌ Widget FLIGHTS INTERDIT - Contexte hébergement détecté');
        continue; // Passer au widget suivant
      }
      
      // INTERDIRE les widgets HOTELS si le contenu parle de vols
      if (widget.slot === 'hotels' && (lowerContent.includes('vol') || lowerContent.includes('avion'))) {
        console.log('❌ Widget HOTELS INTERDIT - Contexte vols détecté');
        continue; // Passer au widget suivant
      }
      
      let context = fomoData.context;
      
      const intro = {
        context: context,
        cta: this.getCTAText(widget.slot)
      };

      // Vérifier si ce contexte est déjà utilisé
      if (usedContexts.has(intro.context)) {
        console.log(`⚠️ Contexte déjà utilisé, passage au suivant`);
        continue;
      }
      usedContexts.add(intro.context);

      const widgetBlock = `
<p>${intro.context}</p>
<p><strong>${intro.cta}</strong></p>
${widgetScript}
`;

      // Insérer le widget selon la position
      if (widget.position === 'after_section') {
        enhancedContent = this.insertAfterSection(enhancedContent, widget.section_title, widgetBlock);
      } else if (widget.position === 'before_section') {
        enhancedContent = this.insertBeforeSection(enhancedContent, widget.section_title, widgetBlock);
      } else {
        // Position par défaut: avant la section "Articles connexes" ou fin d'article
        enhancedContent = this.insertBeforeRelatedArticles(enhancedContent, widgetBlock);
      }
    }

    return enhancedContent;
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
   */
  getWidgetScript(slot, widgetPlan) {
    // Simulation - en réalité, on récupérerait le vrai script
    const scripts = {
      flights: `<div class="travelpayouts-widget" data-widget="flights" data-provider="${widgetPlan.providers.flights}"></div>`,
      hotels: `<div class="travelpayouts-widget" data-widget="hotels" data-provider="${widgetPlan.providers.hotels}"></div>`,
      transport: `<div class="12go-widget" data-widget="transport"></div>`,
      esim: `<div class="airalo-widget" data-widget="esim"></div>`,
      insurance: `<div class="safetywing-widget" data-widget="insurance"></div>`
    };

    return scripts[slot] || null;
  }

  /**
   * Insère le widget après une section
   */
  insertAfterSection(content, sectionTitle, widgetBlock) {
    const sectionRegex = new RegExp(`(<h[2-3][^>]*>${sectionTitle}[^<]*</h[2-3]>)`, 'i');
    const match = content.match(sectionRegex);
    
    if (match) {
      const sectionIndex = content.indexOf(match[0]);
      const afterSection = content.indexOf('</h2>', sectionIndex) + 5;
      return content.slice(0, afterSection) + '\n\n' + widgetBlock + '\n\n' + content.slice(afterSection);
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
