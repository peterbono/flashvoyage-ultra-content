#!/usr/bin/env node

import axios from 'axios';
import { OPENAI_API_KEY } from './config.js';

class IntelligentContentAnalyzer {
  constructor() {
    this.apiKey = OPENAI_API_KEY;
  }

  // Analyser intelligemment le contenu d'un article
  async analyzeContent(article) {
    try {
      const prompt = `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE À ANALYSER:
- Titre: ${article.title}
- Source: ${article.source}
- Type: ${article.type}
- Contenu: ${article.content}
- Lien: ${article.link}

MISSION: Analyser ce contenu et déterminer la meilleure approche éditoriale.

GUIDELINES FLASHVOYAGES:
- Cible: Digital nomades et voyageurs passionnés d'Asie
- Spécialités: Bons plans, formalités, transports, sécurité, tourisme
- Objectif: Contenu unique, valeur ajoutée, économies concrètes
- Ton: Expert, confident, proche (comme Voyage Pirate mais pour l'Asie)

ANALYSE REQUISE:
1. Catégorie éditoriale (nomade_visa, nomade_coliving, nomade_budget, nomade_communaute, voyage_asie, voyage_general, etc.)
2. Angle éditorial principal (pratique, comparatif, analyse, conseil, etc.)
3. Niveau d'urgence (high, medium, low)
4. Audience cible spécifique
5. Mots-clés pertinents
6. CTA approprié
7. Destinations concernées
8. Score de pertinence (0-100)
9. Recommandation: template_fixe OU generation_llm

Réponds UNIQUEMENT en JSON valide:
{
  "categorie": "nomade_communaute",
  "angle": "comparatif",
  "urgence": "medium",
  "audience": "Digital nomades hésitant entre régions",
  "keywords": "nomade, asie, amérique latine, comparaison, choix destination",
  "cta": "Découvrez notre guide complet Asie vs Amérique Latine",
  "destinations": "Asie du Sud-Est, Amérique Latine",
  "pertinence": 85,
  "recommandation": "generation_llm",
  "raison": "Question complexe nécessitant analyse comparative approfondie"
}`;

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const analysis = JSON.parse(response.data.choices[0].message.content);
      return analysis;

    } catch (error) {
      console.error('❌ Erreur analyse intelligente:', error.message);
      return this.getFallbackAnalysis(article);
    }
  }

  // Générer du contenu intelligent avec LLM
  async generateIntelligentContent(article, analysis) {
    try {
      const prompt = `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE SOURCE:
- Titre: ${article.title}
- Source: ${article.source}
- Contenu: ${article.content}
- Lien: ${article.link}

ANALYSE ÉDITORIALE:
- Catégorie: ${analysis.categorie}
- Angle: ${analysis.angle}
- Audience: ${analysis.audience}
- Mots-clés: ${analysis.keywords}
- CTA: ${analysis.cta}
- Destinations: ${analysis.destinations}

MISSION: Créer un article éditorial de qualité qui transforme cette source en contenu FlashVoyages.

GUIDELINES FLASHVOYAGES:
- Cible: Digital nomades et voyageurs passionnés d'Asie
- Ton: Expert, confident, proche, conversationnel
- Style: Comme Voyage Pirate mais pour l'Asie
- Objectif: Valeur ajoutée, conseils pratiques, économies concrètes
- Structure: H5, listes, sections, CTA

CONTENU REQUIS:
1. Titre accrocheur avec emoji
2. Introduction personnalisée
3. Analyse du sujet avec angle FlashVoyages
4. Conseils pratiques et concrets
5. Comparaison si pertinent
6. CTA spécifique
7. Signature FlashVoyages

Réponds UNIQUEMENT en JSON valide:
{
  "title": "🌏 Asie vs Amérique Latine : Le Guide Définitif pour Digital Nomades",
  "target_audience": "Digital nomades hésitant entre régions",
  "ton": "Expert, confident, pratique",
  "keywords": "nomade, asie, amérique latine, comparaison, choix destination",
  "cta": "Découvrez notre guide complet Asie vs Amérique Latine",
  "urgence": "medium",
  "destinations": "Asie du Sud-Est, Amérique Latine",
  "content": "<p><strong>Source :</strong> <a href=\\"${article.link}\\" target=\\"_blank\\" rel=\\"noopener\\">${article.title}</a> - ${article.source}</p>\\n\\n<p>Salut nomade ! Si tu hésites entre l'Asie et l'Amérique Latine pour ton prochain séjour prolongé, cette question Reddit va t'aider à y voir plus clair. Chez FlashVoyages, on connaît bien les deux régions et on va te donner notre analyse d'experts.</p>\\n\\n<h5>Pourquoi cette question est cruciale pour toi</h5>\\n<p>Choisir entre l'Asie et l'Amérique Latine, c'est pas juste une question de préférence. C'est un choix qui va impacter ton budget, ton style de vie, et tes opportunités professionnelles pendant des mois.</p>\\n\\n<p>On a analysé les réponses de la communauté nomade et on va te donner notre perspective FlashVoyages, basée sur notre expérience terrain.</p>\\n\\n<h5>Notre analyse FlashVoyages : Asie vs Amérique Latine</h5>\\n<p>Voici ce que nos experts pensent :</p>\\n\\n<ul>\\n<li><strong>Asie du Sud-Est :</strong> Meilleur rapport qualité-prix, infrastructure nomade développée, communauté active</li>\\n<li><strong>Amérique Latine :</strong> Culture plus proche, langue plus accessible, horaires compatibles Europe</li>\\n<li><strong>Budget :</strong> Asie gagne sur le coût de la vie, Amérique Latine sur les vols</li>\\n<li><strong>Visa :</strong> Asie plus flexible, Amérique Latine plus restrictive</li>\\n</ul>\\n\\n<h5>Notre conseil FlashVoyages</h5>\\n<p>Commence par l'Asie si tu veux maximiser ton budget et découvrir une culture totalement différente. Choisis l'Amérique Latine si tu préfères une transition plus douce et des horaires compatibles avec l'Europe.</p>\\n\\n<h5>Contexte nomade</h5>\\n<p>Les deux régions offrent des opportunités incroyables pour les digital nomades. L'important, c'est de choisir selon tes priorités : budget, culture, ou opportunités professionnelles.</p>\\n\\n<h5>Notre analyse</h5>\\n<p><strong>Score FlashVoyages :</strong> ${analysis.pertinence}/100 — Question cruciale pour nomades</p>\\n<p><strong>Pourquoi c'est important :</strong> Impact direct sur ton expérience nomade</p>\\n<p><strong>Action recommandée :</strong> Tester les deux régions si possible</p>\\n\\n<p><em>Cet article a été analysé par notre équipe FlashVoyages — ton spécialiste du nomadisme en Asie.</em></p>"
}`;

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const rawContent = response.data.choices[0].message.content;
      console.log('🔍 Réponse LLM brute:', rawContent.substring(0, 200) + '...');
      
      const content = JSON.parse(rawContent);
      console.log('✅ Contenu parsé:', Object.keys(content));
      return content;

    } catch (error) {
      console.error('❌ Erreur génération intelligente:', error.message);
      return this.getFallbackContent(article, analysis);
    }
  }

  // Analyse de fallback
  getFallbackAnalysis(article) {
    return {
      categorie: 'voyage_general',
      angle: 'informatif',
      urgence: 'low',
      audience: 'Voyageurs généraux',
      keywords: 'voyage, information, conseils',
      cta: 'Découvrez nos conseils voyage',
      destinations: 'Divers',
      pertinence: 50,
      recommandation: 'template_fixe',
      raison: 'Analyse LLM indisponible'
    };
  }

  // Contenu de fallback
  getFallbackContent(article, analysis) {
    return {
      title: `📰 ${article.title} - FlashVoyages`,
      target_audience: analysis.audience,
      ton: 'Informatif, neutre',
      keywords: analysis.keywords,
      cta: analysis.cta,
      urgence: analysis.urgence,
      destinations: analysis.destinations,
      content: `<p><strong>Source :</strong> <a href="${article.link}" target="_blank" rel="noopener">${article.title}</a> - ${article.source}</p>

<p>Bonjour ! Si tu cherches des informations utiles, cette actualité pourrait t'intéresser. Chez FlashVoyages, on partage des informations qui nous semblent pertinentes.</p>

<h5>Pourquoi cette info est pertinente</h5>
<p>Cette information sur ${article.type} est une actualité générale qui peut avoir un impact sur divers aspects de vos voyages.</p>

<p>Nous la relayons pour vous tenir au courant des faits marquants qui pourraient vous concerner.</p>

<h5>Ce qu'il faut savoir</h5>
<p>Voici les points clés :</p>

<ul>
<li><strong>${article.type} :</strong> ${article.content}</li>
<li><strong>Validité :</strong> Information récente - Source ${article.source}</li>
<li><strong>Pour qui :</strong> Tous les lecteurs intéressés</li>
<li><strong>Bénéfices :</strong> Information générale, mise à jour</li>
</ul>

<h5>Notre point de vue FlashVoyages</h5>
<p>Nous vous invitons à consulter la source originale pour plus de détails. Notre objectif est de vous fournir un aperçu rapide et pertinent.</p>

<p><em>Cet article a été analysé par notre équipe FlashVoyages.</em></p>`
    };
  }
}

export default IntelligentContentAnalyzer;
