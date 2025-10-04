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
      // Vérifier si la clé API est disponible
      if (!this.apiKey) {
        console.log('⚠️ Clé OpenAI non disponible - Utilisation du fallback');
        return this.getFallbackAnalysis(article);
      }
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

  // Analyse de fallback quand OpenAI n'est pas disponible
  getFallbackAnalysis(article) {
    console.log('🔄 Utilisation de l\'analyse de fallback...');
    
    // Analyse basique basée sur les mots-clés
    const title = article.title.toLowerCase();
    const content = (article.content || '').toLowerCase();
    const text = `${title} ${content}`;
    
    // Détection de catégorie
    let category = 'voyage_general';
    if (text.includes('nomad') || text.includes('digital nomad') || text.includes('remote work')) {
      category = 'nomade_asie';
    } else if (text.includes('visa') || text.includes('residence') || text.includes('fiscal')) {
      category = 'nomade_asie';
    } else if (text.includes('coliving') || text.includes('coworking')) {
      category = 'nomade_asie';
    }
    
    // Détection d'angle
    let angle = 'informatif';
    if (text.includes('comparaison') || text.includes('vs') || text.includes('match')) {
      angle = 'comparatif';
    } else if (text.includes('guide') || text.includes('comment') || text.includes('tutorial')) {
      angle = 'pratique';
    }
    
    // Recommandation
    let recommendation = 'template_fixe';
    if (category === 'nomade_asie' && text.includes('visa')) {
      recommendation = 'llm_generation';
    }
    
    return {
      category,
      angle,
      audience: 'Digital nomades et voyageurs Asie',
      keywords: this.extractKeywords(text),
      cta: 'Découvrez nos guides nomades Asie',
      destinations: this.extractDestinations(text),
      recommendation,
      confidence: 0.6,
      reason: 'Analyse de fallback basée sur les mots-clés'
    };
  }

  // Extraire les mots-clés du texte
  extractKeywords(text) {
    const keywords = [];
    const nomadKeywords = ['nomad', 'digital nomad', 'remote work', 'coliving', 'coworking', 'visa', 'residence', 'fiscal'];
    const asiaKeywords = ['asia', 'asie', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia'];
    
    nomadKeywords.forEach(keyword => {
      if (text.includes(keyword)) keywords.push(keyword);
    });
    
    asiaKeywords.forEach(keyword => {
      if (text.includes(keyword)) keywords.push(keyword);
    });
    
    return keywords.slice(0, 5); // Max 5 mots-clés
  }

  // Extraire les destinations du texte
  extractDestinations(text) {
    const destinations = [];
    const asiaCountries = ['vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong'];
    
    asiaCountries.forEach(country => {
      if (text.includes(country)) destinations.push(country);
    });
    
    return destinations.length > 0 ? destinations.join(', ') : 'Asie';
  }

  // Extraire le contenu complet de l'article source
  async extractFullContent(article) {
    try {
      if (!article.link || article.link.includes('news.google.com')) {
        console.log('⚠️ Lien Google News - Utilisation du contenu disponible');
        return article.content || 'Contenu non disponible';
      }

      console.log('🔍 Extraction du contenu complet de l\'article source...');
      
      const response = await axios.get(article.link, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 10000
      });

      // Extraction simple du contenu principal
      const html = response.data;
      const contentMatch = html.match(/<article[^>]*>(.*?)<\/article>/s) || 
                          html.match(/<main[^>]*>(.*?)<\/main>/s) ||
                          html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/s);
      
      if (contentMatch) {
        // Nettoyer le HTML et extraire le texte
        const content = contentMatch[1]
          .replace(/<script[^>]*>.*?<\/script>/gs, '')
          .replace(/<style[^>]*>.*?<\/style>/gs, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        console.log(`✅ Contenu extrait: ${content.length} caractères`);
        return content.substring(0, 3000); // Limiter à 3000 caractères
      }

      console.log('⚠️ Impossible d\'extraire le contenu - Utilisation du contenu disponible');
      return article.content || 'Contenu non disponible';
    } catch (error) {
      console.log(`⚠️ Erreur extraction contenu: ${error.message}`);
      return article.content || 'Contenu non disponible';
    }
  }

  // Générer du contenu intelligent avec LLM
  async generateIntelligentContent(article, analysis) {
    try {
      // Extraire le contenu complet de l'article source
      const fullContent = await this.extractFullContent(article);
      
      const prompt = `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE SOURCE COMPLET:
- Titre: ${article.title}
- Source: ${article.source}
- Contenu complet: ${fullContent}
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
- Style: Expert, data-driven, avec des conseils pratiques concrets
- Ton: Professionnel mais accessible, avec une touche personnelle
- Structure: Introduction engageante, développement détaillé, conclusion actionnable
- Ton: Expert, confident, proche, conversationnel
- Style: Comme Voyage Pirate mais pour l'Asie
- Objectif: Valeur ajoutée, conseils pratiques, économies concrètes
- Structure: H5, listes, sections, CTA

INSTRUCTIONS SPÉCIFIQUES:
1. EXTRACTION DE DONNÉES: Utilise les informations spécifiques de l'article source (prix, dates, lieux, détails concrets)
2. PERSONNALISATION: Adapte le contenu à l'audience nomade asiatique
3. VALEUR AJOUTÉE: Ajoute des conseils pratiques, des alternatives, des astuces
4. STRUCTURE: Utilise des H5 pour organiser, des listes pour les détails, des CTA pour l'action
5. SPÉCIFICITÉ: Évite les généralités, utilise des données précises de l'article source

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

  // Valider le contenu généré
  validateGeneratedContent(llmContent, sourceArticle) {
    const validation = {
      score: 0,
      issues: [],
      strengths: []
    };

    // Vérifier la longueur du contenu
    if (llmContent.content && llmContent.content.length > 500) {
      validation.score += 20;
      validation.strengths.push('Contenu de longueur appropriée');
    } else {
      validation.issues.push('Contenu trop court');
    }

    // Vérifier la présence de données spécifiques
    const hasSpecificData = /(\d+|\$|€|%|km|m²|heures?|jours?|mois?|années?)/.test(llmContent.content || '');
    if (hasSpecificData) {
      validation.score += 25;
      validation.strengths.push('Contient des données spécifiques');
    } else {
      validation.issues.push('Manque de données spécifiques');
    }

    // Vérifier la structure (présence de H5)
    const hasStructure = /<h5>/.test(llmContent.content || '');
    if (hasStructure) {
      validation.score += 15;
      validation.strengths.push('Structure bien organisée');
    } else {
      validation.issues.push('Structure manquante');
    }

    // Vérifier la pertinence nomade
    const nomadKeywords = ['nomade', 'digital nomad', 'remote work', 'coworking', 'coliving', 'visa', 'residence'];
    const hasNomadContent = nomadKeywords.some(keyword => 
      (llmContent.content || '').toLowerCase().includes(keyword)
    );
    if (hasNomadContent) {
      validation.score += 20;
      validation.strengths.push('Contenu pertinent pour les nomades');
    } else {
      validation.issues.push('Manque de pertinence nomade');
    }

    // Vérifier la présence d'un CTA
    if (llmContent.cta && llmContent.cta.length > 10) {
      validation.score += 10;
      validation.strengths.push('CTA présent et engageant');
    } else {
      validation.issues.push('CTA manquant ou trop court');
    }

    // Vérifier l'évitement des généralités
    const genericPhrases = ['pays à définir', 'lieu à préciser', 'information non disponible'];
    const hasGenericContent = genericPhrases.some(phrase => 
      (llmContent.content || '').toLowerCase().includes(phrase)
    );
    if (!hasGenericContent) {
      validation.score += 10;
      validation.strengths.push('Évite les généralités');
    } else {
      validation.issues.push('Contient des généralités à éviter');
    }

    validation.score = Math.min(validation.score, 100);
    
    console.log(`📊 Validation contenu: ${validation.score}/100`);
    if (validation.issues.length > 0) {
      console.log(`⚠️ Problèmes: ${validation.issues.join(', ')}`);
    }
    if (validation.strengths.length > 0) {
      console.log(`✅ Points forts: ${validation.strengths.join(', ')}`);
    }

    return validation;
  }
}

export default IntelligentContentAnalyzer;
