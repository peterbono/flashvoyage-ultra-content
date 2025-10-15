#!/usr/bin/env node

/**
 * CONTEXTUAL WIDGET PLACER
 * Utilise GPT-4o pour analyser le contenu et placer les widgets
 * de manière contextuelle et humanisée avec FOMO doux
 */

import OpenAI from 'openai';
import { OPENAI_API_KEY } from './config.js';

class ContextualWidgetPlacer {
  constructor() {
    this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    // Phrases d'accroche FOMO doux par type de widget
    this.accroches = {
      flights: [
        "Pour votre vol, on a comparé les prix et trouvé les meilleures offres du moment. Réservez maintenant pour profiter des tarifs les plus bas :",
        "Voici les vols les moins chers que nous avons trouvés pour vous. Les places à ces prix partent vite :",
        "On a déniché ces pépites pour votre vol. Profitez-en avant que les prix ne remontent :",
        "Comparez les prix des vols et réservez au meilleur moment. Nos partenaires vous garantissent les meilleurs tarifs :"
      ],
      hotels: [
        "Pour l'hébergement, voici les options les mieux notées par les nomades digitaux. Les places partent vite, surtout en haute saison :",
        "On a sélectionné ces hébergements pour leur excellent rapport qualité-prix. Réservez maintenant pour garantir votre place :",
        "Voici où les autres nomades logent. Ces adresses sont très demandées, on vous conseille de réserver rapidement :",
        "Comparez les hébergements et trouvez celui qui vous correspond. Les meilleurs deals sont ici :"
      ],
      insurance: [
        "Pour voyager l'esprit tranquille, voici les assurances les plus recommandées par la communauté nomade :",
        "Protégez-vous avec une assurance adaptée. On a comparé les offres pour vous :",
        "Ne partez pas sans assurance ! Voici les meilleures options pour les nomades digitaux :",
        "Comparez les assurances voyage et choisissez celle qui vous convient. La sécurité avant tout :"
      ],
      transport: [
        "Pour vos déplacements sur place, voici les meilleures options de transport :",
        "Découvrez comment vous déplacer facilement une fois sur place :",
        "On a trouvé les meilleurs moyens de transport locaux pour vous :",
        "Comparez les options de transport et réservez à l'avance pour économiser :"
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

WIDGETS DISPONIBLES:
1. FLIGHTS (vols)
2. HOTELS (hébergement)
3. INSURANCE (assurance)
4. TRANSPORT (transport local)

RÈGLES D'ANALYSE:
1. Identifie les sections (H2) qui parlent de:
   - Vols, transport aérien, "comment s'y rendre" → FLIGHTS
   - Logement, hébergement, "où dormir" → HOTELS
   - Sécurité, santé, formalités → INSURANCE
   - Déplacements locaux, mobilité → TRANSPORT

2. Place le widget JUSTE APRÈS le paragraphe qui introduit le sujet
3. Maximum 3 widgets par article (les plus pertinents)
4. Évite de mettre plusieurs widgets d'affilée

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
    const templates = {
      flights: [
        `Pour votre vol vers ${context.destination}, on a trouvé les meilleures offres. Réservez maintenant :`,
        `Comparez les prix des vols pour ${context.destination} et économisez jusqu'à 30% :`,
        `Les nomades recommandent ces compagnies pour ${context.destination}. Profitez des meilleurs tarifs :`
      ],
      hotels: [
        `Voici où loger à ${context.destination} selon les autres nomades. Les places partent vite :`,
        `On a sélectionné les meilleurs hébergements de ${context.destination} pour vous :`,
        `Comparez les logements à ${context.destination} et réservez au meilleur prix :`
      ]
    };

    const options = templates[widgetType] || this.accroches[widgetType];
    return options[Math.floor(Math.random() * options.length)];
  }
}

export default ContextualWidgetPlacer;

