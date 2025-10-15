#!/usr/bin/env node

/**
 * CONTEXTUAL WIDGET PLACER
 * Utilise GPT-4o pour analyser le contenu et placer les widgets
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
        },
        {
          context: "Les prix des vols varient jusqu'à 300€ selon le site de réservation. Notre outil compare automatiquement les tarifs pour vous garantir le meilleur prix.",
          cta: "Consultez les tarifs actuels :"
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
        },
        {
          context: "Les colivings les mieux notés par les nomades se remplissent 3 semaines à l'avance en haute saison. Notre outil vous permet de comparer et réserver rapidement.",
          cta: "Consultez les disponibilités :"
        }
      ]
    };
  }

  /**
   * Analyse le contenu et suggère où placer les widgets
   */
  async analyzeAndPlaceWidgets(content, articleContext) {
    try {
      console.log('\n🎯 ANALYSE CONTEXTUELLE POUR PLACEMENT WIDGETS');
      console.log('==============================================\n');

      const prompt = `Tu es un expert en UX et content marketing pour un site de voyage.

MISSION: Analyser ce contenu d'article et déterminer OÙ placer les widgets de manière contextuelle et naturelle.

ARTICLE:
${content}

CONTEXTE:
- Type: ${articleContext.type || 'Témoignage'}
- Destination: ${articleContext.destination || 'Asie'}
- Audience: ${articleContext.audience || 'Nomades digitaux'}

WIDGETS DISPONIBLES (UNIQUEMENT CEUX-CI):
1. FLIGHTS (vols) - Formulaire de recherche Kiwi.com
2. HOTELS (hébergement) - Formulaire de recherche Hotellook

RÈGLES D'ANALYSE:
1. Identifie les sections (H2/H3) qui parlent de:
   - Vols, transport aérien, "comment s'y rendre", voyage, déplacement → FLIGHTS
   - Logement, hébergement, "où dormir", coliving, hôtel → HOTELS

2. Place le widget JUSTE APRÈS le paragraphe qui introduit le sujet
3. Maximum 2 widgets par article (1 FLIGHTS + 1 HOTELS si pertinent)
4. Évite de mettre plusieurs widgets d'affilée
5. NE SUGGÈRE QUE flights et hotels (pas insurance, pas transport)

RÉPONSE EN JSON UNIQUEMENT (PAS DE TEXTE AVANT OU APRÈS):
{
  "placements": [
    {
      "widget_type": "flights",
      "after_text": "extrait exact du texte après lequel placer (20-50 caractères)",
      "reason": "pourquoi ce placement est pertinent",
      "priority": 1
    }
  ]
}

IMPORTANT: Réponds UNIQUEMENT avec le JSON, rien d'autre. Commence directement par {`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });

      let responseText = response.choices[0].message.content.trim();
      
      // Nettoyer la réponse si elle contient du markdown
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      }
      
      const analysis = JSON.parse(responseText);
      
      console.log(`✅ ${analysis.placements.length} placements suggérés\n`);
      
      analysis.placements.forEach((p, i) => {
        console.log(`${i + 1}. ${p.widget_type.toUpperCase()}`);
        console.log(`   Après: "${p.after_text}"`);
        console.log(`   Raison: ${p.reason}`);
        console.log(`   Priorité: ${p.priority}/3\n`);
      });

      return analysis.placements;

    } catch (error) {
      console.error('❌ Erreur analyse placement:', error.message);
      return [];
    }
  }

  /**
   * Insère les widgets dans le contenu avec accroches humanisées
   */
  insertWidgetsContextually(content, placements, widgetScripts) {
    console.log('📝 INSERTION DES WIDGETS AVEC ACCROCHES\n');
    
    let updatedContent = content;
    let insertCount = 0;

    // Trier par priorité (1 = le plus important)
    const sortedPlacements = placements
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3); // Maximum 3 widgets

    sortedPlacements.forEach((placement, index) => {
      const widgetType = placement.widget_type;
      const widgetScript = widgetScripts[widgetType];

      if (!widgetScript) {
        console.log(`   ⚠️ Widget ${widgetType} non disponible`);
        return;
      }

      // Choisir une intro aléatoire (contexte + CTA)
      const intros = this.widgetIntros[widgetType] || [];
      const intro = intros[Math.floor(Math.random() * intros.length)];

      // Créer le bloc widget avec contexte + accroche style TPG
      const widgetBlock = `

<p>${intro.context}</p>

<p><strong>${intro.cta}</strong></p>

${widgetScript}

`;

      // Trouver le texte après lequel insérer
      const searchText = placement.after_text;
      
      // Chercher le texte dans le contenu
      const textIndex = updatedContent.indexOf(searchText);
      
      if (textIndex !== -1) {
        // Trouver la fin du paragraphe (</p>)
        const endParagraph = updatedContent.indexOf('</p>', textIndex);
        
        if (endParagraph !== -1) {
          // Insérer après le </p>
          updatedContent = 
            updatedContent.slice(0, endParagraph + 4) + 
            widgetBlock + 
            updatedContent.slice(endParagraph + 4);
          
          insertCount++;
          console.log(`   ✅ Widget ${widgetType.toUpperCase()} inséré`);
          console.log(`      Après: "${searchText.substring(0, 40)}..."`);
        }
      } else {
        console.log(`   ⚠️ Texte de référence non trouvé pour ${widgetType}`);
      }
    });

    console.log(`\n✅ ${insertCount} widgets insérés dans le contenu\n`);

    return updatedContent;
  }

  /**
   * Processus complet: analyse + insertion
   */
  async placeWidgetsIntelligently(content, articleContext, widgetScripts) {
    try {
      // 1. Analyser et obtenir les placements suggérés
      const placements = await this.analyzeAndPlaceWidgets(content, articleContext);

      if (placements.length === 0) {
        console.log('⚠️ Aucun placement suggéré, widgets non insérés');
        return content;
      }

      // 2. Insérer les widgets avec accroches
      const updatedContent = this.insertWidgetsContextually(
        content,
        placements,
        widgetScripts
      );

      return updatedContent;

    } catch (error) {
      console.error('❌ Erreur placement widgets:', error.message);
      return content;
    }
  }

  /**
   * Génère une accroche personnalisée selon le contexte
   */
  generateCustomAccroche(widgetType, context) {
    // Style TPG: sobre et informatif
    const templates = {
      flights: [
        `Comparez les vols pour ${context.destination} :`,
        `Trouvez votre vol pour ${context.destination} :`,
        `Consultez les tarifs pour ${context.destination} :`
      ],
      hotels: [
        `Trouvez votre hébergement à ${context.destination} :`,
        `Comparez les logements à ${context.destination} :`,
        `Consultez les options à ${context.destination} :`
      ]
    };

    const options = templates[widgetType] || this.accroches[widgetType];
    return options[Math.floor(Math.random() * options.length)];
  }
}

export default ContextualWidgetPlacer;

