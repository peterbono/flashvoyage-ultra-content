#!/usr/bin/env node

/**
 * CONTEXTUAL WIDGET PLACER V2
 * Utilise GPT-4o avec widget_plan pour analyser et placer les widgets
 * de manière contextuelle avec accroches sobres style The Points Guy
 */

import OpenAI from 'openai';
import { OPENAI_API_KEY } from './config.js';
import { RealStatsScraper } from './real-stats-scraper.js';

class ContextualWidgetPlacer {
  constructor() {
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    this.statsScraper = new RealStatsScraper();
    
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
          context: "L'hébergement représente une part importante du budget voyage. Notre partenaire Hotellook compare les prix de nombreux sites de réservation pour vous aider à économiser.",
          cta: "Trouvez votre hébergement idéal :"
        },
        {
          context: "Les prix d'hébergement peuvent varier selon le site de réservation. Notre outil agrège toutes les offres pour vous garantir le meilleur tarif.",
          cta: "Comparez les hébergements :"
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
1. Analyse le contenu pour identifier les sections pertinentes
2. Sélectionne 1-3 widgets les plus pertinents selon les intents
3. Place-les contextuellement dans le contenu
4. Génère des accroches sobres et informatives
5. Respecte toutes les contraintes du plan

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
      
      // Placer les widgets dans le contenu
      const enhancedContent = await this.insertWidgetsContextually(
        content, 
        limitedWidgets, 
        widgetPlan
      );

      return enhancedContent;

    } catch (error) {
      console.error('❌ Erreur placement widgets:', error.message);
      return content; // Retourner le contenu original en cas d'erreur
    }
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
      
      const intro = {
        context: fomoData.context,
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
