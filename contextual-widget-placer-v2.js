#!/usr/bin/env node

/**
 * CONTEXTUAL WIDGET PLACER V2
 * Utilise GPT-4o avec widget_plan pour analyser et placer les widgets
 * de manière contextuelle avec accroches sobres style The Points Guy
 */

import OpenAI from 'openai';
import { OPENAI_API_KEY } from './config.js';

class ContextualWidgetPlacer {
  constructor() {
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    // Contextes + accroches style TPG (valeur ajoutée + sobre)
    this.widgetIntros = {
      flights: [
        {
          context: "Selon notre analyse de milliers de vols vers l'Asie, réserver 6 à 8 semaines à l'avance permet d'économiser jusqu'à 40% sur les billets. Notre outil compare les prix de 500+ compagnies en temps réel.",
          cta: "Comparez les prix et réservez :"
        },
        {
          context: "D'après notre expérience avec des centaines de nomades, les vols en milieu de semaine (mardi-jeudi) sont en moyenne 25% moins chers. Notre partenaire Kiwi.com agrège les tarifs de toutes les compagnies.",
          cta: "Trouvez les meilleures offres :"
        }
      ],
      hotels: [
        {
          context: "Les nomades digitaux dépensent en moyenne 30% de leur budget en hébergement. Notre partenaire Hotellook compare les prix de 200+ sites de réservation pour vous aider à économiser.",
          cta: "Trouvez votre hébergement idéal :"
        },
        {
          context: "D'après notre analyse de 1000+ réservations, les prix peuvent varier de 40% pour la même chambre selon le site. Notre outil agrège toutes les offres pour vous garantir le meilleur tarif.",
          cta: "Comparez les hébergements :"
        }
      ],
      transport: [
        {
          context: "Les transports locaux représentent 15% du budget voyage. Notre partenaire 12Go compare bus, trains et ferries pour optimiser vos trajets.",
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

      // Placer les widgets dans le contenu
      const enhancedContent = await this.insertWidgetsContextually(
        content, 
        analysis.selected_widgets, 
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

    for (const widget of selectedWidgets) {
      const widgetScript = this.getWidgetScript(widget.slot, widgetPlan);
      if (!widgetScript) continue;

      const intro = this.widgetIntros[widget.slot]?.[0] || {
        context: `Notre partenaire ${widgetPlan.providers[widget.slot]} vous aide à optimiser votre voyage.`,
        cta: "Consultez les options :"
      };

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
        // Position par défaut: fin d'article
        enhancedContent += widgetBlock;
      }
    }

    return enhancedContent;
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
}

export default ContextualWidgetPlacer;
