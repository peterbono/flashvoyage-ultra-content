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
    
    // Phrases d'accroche style TPG (sobre, informatif, direct)
    this.accroches = {
      flights: [
        "Comparez les prix des vols et réservez :",
        "Trouvez les meilleures offres de vols :",
        "Consultez les tarifs actuels :",
        "Voici les meilleures options de vol :"
      ],
      hotels: [
        "Comparez les hébergements et réservez :",
        "Trouvez votre logement idéal :",
        "Consultez les options d'hébergement :",
        "Voici les meilleures adresses :"
      ],
      insurance: [
        "Comparez les assurances voyage :",
        "Protégez votre voyage avec une assurance adaptée :",
        "Voici les options d'assurance recommandées :",
        "Consultez les offres d'assurance :"
      ],
      transport: [
        "Comparez les options de transport :",
        "Trouvez le meilleur moyen de vous déplacer :",
        "Consultez les solutions de transport :",
        "Voici les options de transport local :"
      ],
      productivity: [
        "Découvrez les outils essentiels pour travailler en nomade :",
        "Voici les outils recommandés :",
        "Consultez les solutions de productivité :",
        "Optimisez votre travail à distance :"
      ],
      activities: [
        "Découvrez les activités disponibles :",
        "Réservez vos activités à l'avance :",
        "Voici les meilleures expériences locales :",
        "Consultez les activités recommandées :"
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

      // Choisir une accroche aléatoire
      const accroches = this.accroches[widgetType] || [];
      const accroche = accroches[Math.floor(Math.random() * accroches.length)];

      // Créer le bloc widget avec accroche
      const widgetBlock = `

<p><strong>${accroche}</strong></p>

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

