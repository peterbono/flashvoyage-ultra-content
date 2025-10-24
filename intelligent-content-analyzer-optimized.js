#!/usr/bin/env node

import axios from 'axios';
import { OPENAI_API_KEY } from './config.js';

class IntelligentContentAnalyzerOptimized {
  constructor() {
    this.apiKey = OPENAI_API_KEY;
  }

  // Analyser intelligemment le contenu d'un article avec les 4 types de témoignage
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

TYPES DE CONTENU DISPONIBLES:
1. TEMOIGNAGE_SUCCESS_STORY (15% du contenu)
   - Récits de réussite, transformation, objectifs atteints
   - Structure: Défi → Action → Résultat
   - Ton: Inspirant, motivant, authentique
   - Exemples: "Comment j'ai doublé mes revenus", "Ma transformation nomade"

2. TEMOIGNAGE_ECHEC_LEÇONS (10% du contenu)
   - Erreurs commises, leçons apprises, prévention
   - Structure: Erreur → Conséquences → Leçons
   - Ton: Humble, préventif, éducatif
   - Exemples: "Mon échec avec le visa", "L'erreur qui m'a coûté cher"

3. TEMOIGNAGE_TRANSITION (10% du contenu)
   - Changements de vie, adaptations, évolutions
   - Structure: Avant → Pendant → Après
   - Ton: Réfléchi, adaptatif, encourageant
   - Exemples: "De salarié à nomade", "Ma transition vers l'Asie"

4. TEMOIGNAGE_COMPARAISON (5% du contenu)
   - Comparaisons entre destinations, méthodes, options
   - Structure: Option A vs Option B → Recommandation
   - Ton: Comparatif, objectif, informatif
   - Exemples: "Bali vs Vietnam", "Coliving vs Airbnb"

5. GUIDE_PRATIQUE (20% du contenu)
   - Guides step-by-step, procédures, checklists
   - Structure: Introduction → Étapes → Conclusion
   - Ton: Pratique, utilitaire, actionnable
   - Exemples: "Comment obtenir un visa", "Guide coliving Asie"

6. COMPARAISON_DESTINATIONS (15% du contenu)
   - Comparaisons détaillées entre pays/villes
   - Structure: Critères → Analyse → Recommandation
   - Ton: Analytique, objectif, informatif
   - Exemples: "Vietnam vs Thaïlande", "Bangkok vs Chiang Mai"

7. ACTUALITE_NOMADE (15% du contenu)
   - Nouvelles, tendances, réglementations
   - Structure: Contexte → Impact → Conseils
   - Ton: Informé, réactif, pratique
   - Exemples: "Nouveau visa nomade", "Changements réglementaires"

8. CONSEIL_PRATIQUE (10% du contenu)
   - Astuces, bonnes pratiques, optimisations
   - Structure: Problème → Solution → Bénéfices
   - Ton: Expert, confident, pratique
   - Exemples: "Comment économiser", "Astuces productivité"

ANALYSE REQUISE:
1. Type de contenu (un des 8 types ci-dessus)
2. Sous-catégorie spécifique (visa, logement, transport, santé, finance, communauté)
3. Angle éditorial (pratique, comparatif, analyse, conseil, inspirant, préventif)
4. Audience cible spécifique (débutant, confirmé, expert, famille, senior)
5. Destination concernée (Vietnam, Thaïlande, Indonésie, Japon, Corée du Sud, Singapour, Asie)
6. Niveau d'urgence (high, medium, low)
7. Mots-clés pertinents (max 5)
8. CTA approprié
9. Score de pertinence (0-100)
10. Recommandation: template_fixe OU generation_llm
11. Template spécifique à utiliser (si template_fixe)

RÉPONDRE UNIQUEMENT EN JSON VALIDE:
{
  "type_contenu": "TEMOIGNAGE_SUCCESS_STORY",
  "sous_categorie": "visa",
  "angle": "inspirant",
  "audience": "nomades_debutants_vietnam",
  "destination": "Vietnam",
  "urgence": "medium",
  "keywords": "visa nomade vietnam, réussite, transformation",
  "cta": "Découvrez comment réussir votre visa nomade au Vietnam",
  "pertinence": 85,
  "recommandation": "generation_llm",
  "template_specifique": "success_story",
  "raison": "Récit de réussite avec conseils pratiques pour débutants"
}`;

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
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

  // Générer du contenu intelligent avec 2 appels LLM séquentiels
  async generateIntelligentContent(article, analysis) {
    try {
      console.log('🔍 DEBUG: Author dans article:', article.author);
      // Extraire le contenu complet de l'article source
      const fullContent = await this.extractFullContent(article);
      
      // APPEL 1 : Extraction et structure
      console.log('🧠 Appel 1 : Extraction et structure...');
      const extractionResult = await this.extractAndStructure(article, analysis, fullContent);
      
      // APPEL 2 : Génération finale
      console.log('🧠 Appel 2 : Génération finale...');
      const finalContent = await this.generateFinalArticle(extractionResult, analysis, article);
      
      return finalContent;

    } catch (error) {
      console.error('❌ Erreur génération intelligente:', error.message);
      // Refuser de publier plutôt que de créer du faux contenu
      throw new Error(`ERREUR TECHNIQUE: Impossible de générer le contenu pour "${article.title}". Refus de publier du contenu générique.`);
    }
  }

  // APPEL 1 : Extraction et structure avec contexte système
  async extractAndStructure(article, analysis, fullContent) {
    const systemMessage = `Tu es un expert FlashVoyages spécialisé dans l'analyse de témoignages Reddit. 

Extrait les éléments clés selon la structure SUCCESS_STORY:
- Défi initial et objectifs
- Stratégies gagnantes (3-5 points)
- Résultats concrets (chiffres, pourcentages)
- Coûts détaillés (breakdown mensuel)
- Erreurs commises et leçons
- Spécificités locales
- Comparaisons avec autres destinations
- Conseils pratiques pour reproduire

Réponds UNIQUEMENT en JSON avec ces clés: citations, donnees_cles, structure, enseignements, defis, strategies, resultats, couts, erreurs, specificites, comparaisons, conseils.`;

    const userMessage = `TITRE: ${article.title}
CONTENU: ${fullContent.substring(0, 1000)}`;

    console.log(`📏 Taille system: ${systemMessage.length} caractères`);
    console.log(`📏 Taille user: ${userMessage.length} caractères`);

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 800,
      temperature: 0.7,
      response_format: { type: "json_object" }
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const content = JSON.parse(response.data.choices[0].message.content);
    console.log('✅ Extraction terminée:', Object.keys(content));
    return content;
  }

  // APPEL 2 : Génération finale avec contexte système
  async generateFinalArticle(extraction, analysis, article) {
    const systemMessage = `Tu es un expert FlashVoyages. Crée un article de qualité exceptionnelle avec la STRUCTURE IMMERSIVE:

STRUCTURE IMMERSIVE OBLIGATOIRE:
1. INTRODUCTION FOMO + CURATION (OBLIGATOIRE)
   Format: "Pendant que vous hésitez, d'autres agissent. Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui montre comment [transformation]."

2. TÉMOIGNAGE AVEC CITATIONS DIRECTES (OBLIGATOIRE) - 3 citations minimum
   - Utilise les citations RÉELLES de l'article source
   - Format OBLIGATOIRE EXACT (en string simple):
     <blockquote>Citation textuelle du Reddit...</blockquote>
     <p>Témoignage de [AUTHOR_REDDIT_REEL] sur [source]</p>
   - IMPORTANT: Utilise UNIQUEMENT l'author Reddit fourni dans les données pour les citations
   - JAMAIS d'inventer de pseudos - utilise SEULEMENT l'author réel
   - Le titre de l'article NE DOIT PAS contenir le nom de l'auteur
   - Génère les citations comme des strings simples, pas des objets

3. TRANSITIONS NARRATEUR (OBLIGATOIRE)
   - Utilise les transitions naturelles basées sur le contenu Reddit réel
   - Crée des liens fluides entre les sections
   - Évite les phrases modèles répétitives

4. SCÈNES SENSORIELLES (OBLIGATOIRE)
   - Bruits, odeurs, sensations du témoignage
   - Utilise UNIQUEMENT les détails du témoignage Reddit réel
   - JAMAIS d'inventer de scènes génériques

5. QUESTIONS RHÉTORIQUES (OBLIGATOIRE)
   - "Imaginez-vous...", "Et si vous...", "Que feriez-vous si..."
   - 2-3 questions par section

6. VARIATION DU RYTHME (OBLIGATOIRE)
   - Phrases courtes et percutantes
   - Phrases plus longues pour expliquer et respirer

7. CONTEXTE DES CITATIONS (OBLIGATOIRE)
   - 'L'auteur écrit:', 'Dans les commentaires un lecteur a dit:'
   - Toujours préciser d'où vient la citation (Reddit)

8. MISE EN PERSPECTIVE (OBLIGATOIRE)
   - Terminer chaque section par un enseignement pratique
   - Quel piège à éviter, quelle leçon pour le lecteur nomade

TON: Inspirant, motivant, authentique
FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <ul><li>, <strong>, <table>
LONGUEUR: 1500-2000 mots

IMPORTANT: Le titre de l'article NE DOIT PAS contenir le nom de l'auteur Reddit. Utilise l'author UNIQUEMENT dans les citations.

Réponds UNIQUEMENT en JSON avec cette structure: { "article": { "titre": "...", "introduction": "...", "citations": [...], "developpement": "...", "conseils_pratiques": "...", "signature": "..." } }`;

    const userMessage = `TITRE: ${extraction.title || 'Témoignage Reddit'}
AUTHOR_REDDIT_REEL: ${article.author}
CITATIONS: ${extraction.citations || 'Citations'}
DONNÉES: ${extraction.donnees_cles || 'Données'}
ENSEIGNEMENTS: ${extraction.enseignements || 'Enseignements'}
DÉFIS: ${extraction.defis || 'Défis'}
STRATÉGIES: ${extraction.strategies || 'Stratégies'}
RÉSULTATS: ${extraction.resultats || 'Résultats'}
COÛTS: ${extraction.couts || 'Coûts'}
ERREURS: ${extraction.erreurs || 'Erreurs'}
SPÉCIFICITÉS: ${extraction.specificites || 'Spécificités'}
COMPARAISONS: ${extraction.comparaisons || 'Comparaisons'}
CONSEILS: ${extraction.conseils || 'Conseils'}`;

    console.log(`📏 Taille system: ${systemMessage.length} caractères`);
    console.log(`📏 Taille user: ${userMessage.length} caractères`);

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 1500,
      temperature: 0.7,
      response_format: { type: "json_object" }
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const content = JSON.parse(response.data.choices[0].message.content);
    console.log('✅ Article final généré:', Object.keys(content));
    
    // Reconstruire le contenu final à partir de la structure article
    if (content.article) {
      const article = content.article;
      const finalContent = {
        title: article.titre || 'Témoignage Reddit décrypté par FlashVoyages',
        content: [
          article.introduction,
          ...(article.citations || []).map(citation => {
            if (typeof citation === 'string') {
              return citation;
            }
            // Si c'est un objet, essayer d'extraire le texte
            const text = citation.text || citation.quote || citation.content || citation;
            // JAMAIS DE FAKE DATA - Utiliser SEULEMENT les vraies données
            if (!article.author) {
              throw new Error(`ERREUR CRITIQUE: Pas d'author Reddit disponible pour "${article.title}". Refus de publier avec des données inventées.`);
            }
            const auteur = `u/${article.author}`;
            const source = citation.source || 'Reddit';
            return `<blockquote>${text}</blockquote>\n<p>Témoignage de ${auteur} sur ${source}</p>`;
          }),
          article.developpement,
          article.conseils_pratiques,
          article.signature
        ].filter(Boolean).join('\n\n')
      };
      console.log('📄 Contenu final reconstruit:', finalContent.title);
      return finalContent;
    }
    
    return content;
  }

  // Génération de contenu simple en cas d'erreur - UNIQUEMENT avec vraies données
  async generateSimpleContent(article, analysis) {
    try {
      const fullContent = await this.extractFullContent(article);
      
      // Vérifier qu'on a du vrai contenu
      if (!fullContent || fullContent.length < 100) {
        throw new Error(`CONTENU INSUFFISANT: Impossible d'extraire le contenu de "${article.title}". Refus de publier.`);
      }
      
      const simplePrompt = `Crée un article FlashVoyages basé sur ce témoignage Reddit RÉEL:

TITRE REDDIT: ${article.title}
CONTENU REDDIT COMPLET: ${fullContent.substring(0, 1200)}

IMPORTANT: Utilise UNIQUEMENT les informations du témoignage Reddit fourni. Ne pas inventer de citations ou de données.

Génère un article complet avec:
1. Introduction FOMO basée sur le contenu réel
2. Citations directes du Reddit (extrait du contenu fourni) avec attribution complète
3. Transitions du narrateur
4. Scènes sensorielles basées sur le témoignage
5. Questions rhétoriques
6. Enseignements pratiques

FORMAT CITATIONS OBLIGATOIRE EXACT (en string simple):
<blockquote>Citation textuelle du Reddit...</blockquote>
<p>Témoignage de [nom_utilisateur] sur [source]</p>

EXEMPLE:
<blockquote>J'ai commencé avec 2500€/mois et maintenant je gagne 12000€/mois</blockquote>
<p>Témoignage de u/nomade_indonesie sur Reddit</p>

IMPORTANT: Génère les citations comme des strings simples, pas des objets JSON

Format HTML: <h2>, <h3>, <p>, <blockquote>, <ul><li>, <strong>
Longueur: 700-1000 mots
Titre en français

Réponse JSON:`;

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [{ role: 'user', content: simplePrompt }],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" }
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const content = JSON.parse(response.data.choices[0].message.content);
      console.log('✅ Contenu simple généré avec vraies données:', Object.keys(content));
      return content;

    } catch (error) {
      console.error('❌ Erreur génération simple:', error.message);
      // Refuser de publier plutôt que de créer du faux contenu
      throw new Error(`ERREUR TECHNIQUE: Impossible de générer le contenu pour "${article.title}". Refus de publier du contenu générique.`);
    }
  }

  // Obtenir le prompt selon le type de contenu
  getPromptByType(typeContenu, article, analysis, fullContent) {
    const basePrompt = `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE SOURCE COMPLET:
- Titre: ${article.title}
- Source: ${article.source}
- Contenu complet: ${fullContent.substring(0, 800)}
- Lien: ${article.link}

ANALYSE ÉDITORIALE:
- Type: ${analysis.type_contenu}
- Sous-catégorie: ${analysis.sous_categorie}
- Angle: ${analysis.angle}
- Audience: ${analysis.audience}
- Destination: ${analysis.destination}
- Mots-clés: ${analysis.keywords}
- CTA: ${analysis.cta}

MISSION: Créer un article éditorial de qualité qui transforme cette source en contenu FlashVoyages.

GUIDELINES FLASHVOYAGES:
- Cible: Digital nomades et voyageurs passionnés d'Asie
- Objectif: Valeur ajoutée, conseils pratiques, économies concrètes
- Structure: H2/H3, listes, sections, CTA
- Signature: "Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie."

INSTRUCTIONS SPÉCIFIQUES:
1. EXTRACTION DE DONNÉES: Utilise les informations spécifiques de l'article source
2. PERSONNALISATION: Adapte le contenu à l'audience ciblée
3. VALEUR AJOUTÉE: Ajoute des conseils pratiques et des astuces
4. STRUCTURE: Utilise des H2/H3 pour organiser, des listes pour les détails
5. SPÉCIFICITÉ: Évite les généralités, utilise des données précises
6. LONGUEUR: MINIMUM 500 mots, IDÉAL 700-1000 mots. Développe chaque section en détail avec des exemples concrets, des chiffres, des conseils actionnables

CONTENU REQUIS:
1. Titre accrocheur (sans emoji, avec mention "témoignage Reddit" à la fin)
2. Introduction FOMO + Curation FlashVoyages (OBLIGATOIRE)
   Format: "Pendant que vous [action], d'autres [résultat]. Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui montre comment [transformation]."
   Exemples:
   - "Pendant que vous hésitez, d'autres agissent. Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui montre comment un nomade a triplé ses revenus en Indonésie."
   - "Pendant que vous planifiez, d'autres apprennent de leurs erreurs. Nous avons analysé ce témoignage Reddit qui détaille les erreurs à éviter en Thaïlande."
3. Développement structuré selon le type
4. Conseils pratiques et concrets
5. CTA spécifique
6. Signature FlashVoyages

FORMAT HTML OBLIGATOIRE:
- Utilise <h2> pour les titres principaux (PAS ##)
- Utilise <h3> pour les sous-titres (PAS ###)
- Utilise <p> pour les paragraphes
- Utilise <ul><li> pour les listes
- Utilise <strong> pour le gras
- JAMAIS de Markdown (##, ###, **, etc.)

RÉPONDRE UNIQUEMENT EN JSON VALIDE:`;

    // Prompts spécialisés par type
    switch (typeContenu) {
      case 'TEMOIGNAGE_SUCCESS_STORY':
        return basePrompt + `
{
  "title": "🌍 ${article.title} - Témoignage Reddit décrypté par FlashVoyages",
  "target_audience": "${analysis.audience}",
  "ton": "Inspirant, motivant, authentique",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Introduction → Défi → Stratégie → Résultats → Conseils"
}`;

      case 'TEMOIGNAGE_ECHEC_LEÇONS':
        return basePrompt + `
{
  "title": "⚠️ Mon échec en {destination} : {erreur} et les leçons apprises",
  "target_audience": "${analysis.audience}",
  "ton": "Humble, préventif, éducatif",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "STRUCTURE IMMERSIVE TÉMOIGNAGE (même que SUCCESS_STORY):
  
  1. INTRODUCTION FOMO + CURATION (OBLIGATOIRE)
  2. TÉMOIGNAGE AVEC CITATIONS DIRECTES (OBLIGATOIRE) - 3 citations minimum
  3. TRANSITIONS NARRATEUR (OBLIGATOIRE)
  4. SCÈNES SENSORIELLES (OBLIGATOIRE)
  5. QUESTIONS RHÉTORIQUES (OBLIGATOIRE)
  6. VARIATION DU RYTHME (OBLIGATOIRE)
  7. CONTEXTE DES CITATIONS (OBLIGATOIRE)
  8. MISE EN PERSPECTIVE (OBLIGATOIRE)
  
  TON: Humble, préventif, éducatif. L'émotion doit émerger du contenu.
  FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <em>, <strong>. JAMAIS de Markdown.
  LONGUEUR: MINIMUM 700 mots, IDÉAL 900-1200 mots."
}`;

      case 'TEMOIGNAGE_TRANSITION':
        return basePrompt + `
{
  "title": "🔄 Ma transition de {situation_avant} à {situation_apres} en {destination}",
  "target_audience": "${analysis.audience}",
  "ton": "Réfléchi, adaptatif, encourageant",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "IMPORTANT: Analyse le contenu RÉEL de l'article source et adapte le contenu en conséquence.

  Si l'article parle de:
  - Rêve réalisé → Structure: Rêve → Défis → Réalisation → Conseils
  - Transition de vie → Structure: Avant → Pendant → Après → Leçons
  - Défis surmontés → Structure: Problème → Solutions → Résultats → Conseils
  
  STRUCTURE:
  1. Introduction FOMO: "Pendant que vous hésitez, d'autres agissent. Chez FlashVoyages, nous avons sélectionné ce témoignage Reddit qui montre comment [transformation]."
  2. Citations directes du Reddit (3+ en <blockquote> avec attribution complète)
  3. Transitions du narrateur
  4. Mise en perspective
  
  TON: Réfléchi, adaptatif, encourageant. L'émotion doit émerger du contenu réel.
  FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <em>, <strong>. JAMAIS de Markdown.
  LONGUEUR: MINIMUM 700 mots, IDÉAL 900-1200 mots."
}`;

      case 'TEMOIGNAGE_COMPARAISON':
        return basePrompt + `
{
  "title": "⚖️ {destination_a} vs {destination_b} : mon expérience comparative",
  "target_audience": "${analysis.audience}",
  "ton": "Comparatif, objectif, informatif",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "STRUCTURE IMMERSIVE TÉMOIGNAGE (même que SUCCESS_STORY):
  
  1. INTRODUCTION FOMO + CURATION (OBLIGATOIRE)
  2. TÉMOIGNAGE AVEC CITATIONS DIRECTES (OBLIGATOIRE) - 3 citations minimum
  3. TRANSITIONS NARRATEUR (OBLIGATOIRE)
  4. SCÈNES SENSORIELLES (OBLIGATOIRE)
  5. QUESTIONS RHÉTORIQUES (OBLIGATOIRE)
  6. VARIATION DU RYTHME (OBLIGATOIRE)
  7. CONTEXTE DES CITATIONS (OBLIGATOIRE)
  8. MISE EN PERSPECTIVE (OBLIGATOIRE)
  
  TON: Comparatif, objectif, informatif. L'émotion doit émerger du contenu.
  FORMAT HTML: <h2>, <h3>, <p>, <blockquote>, <em>, <strong>. JAMAIS de Markdown.
  LONGUEUR: MINIMUM 700 mots, IDÉAL 900-1200 mots."
}`;

      case 'GUIDE_PRATIQUE':
        return basePrompt + `
{
  "title": "📋 Guide complet : {sujet} en {destination}",
  "target_audience": "${analysis.audience}",
  "ton": "Pratique, utilitaire, actionnable",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Introduction → Étapes détaillées → Conseils → Ressources → Conclusion"
}`;

      case 'COMPARAISON_DESTINATIONS':
        return basePrompt + `
{
  "title": "🏆 {destination_a} vs {destination_b} : Le guide définitif pour nomades",
  "target_audience": "${analysis.audience}",
  "ton": "Analytique, objectif, informatif",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Introduction → Critères → Analyse détaillée → Tableau comparatif → Recommandation"
}`;

      case 'ACTUALITE_NOMADE':
        return basePrompt + `
{
  "title": "{sujet} : Témoignage Reddit et analyse FlashVoyages",
  "target_audience": "${analysis.audience}",
  "ton": "Informé, réactif, pratique, personnel",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "IMPORTANT: Génère un article COMPLET de 500-700 mots minimum avec cette structure détaillée:
  
  <p><strong>Source :</strong> <a href=\"${article.link}\" target=\"_blank\" rel=\"noopener\">${article.title}</a> - ${article.source}</p>
  
  <h2>Le contexte du témoignage</h2>
  <p>Développe le contexte complet (100-150 mots): Qui est la personne? Quelle est sa situation? Pourquoi ce témoignage est important?</p>
  
  <h2>L'expérience détaillée</h2>
  <p>Décris l'expérience en détail (150-200 mots): Les faits concrets, les chiffres, les dates, les lieux précis, les défis rencontrés</p>
  
  <h2>Les leçons et conseils pratiques</h2>
  <p>Liste 5-7 conseils actionnables (150-200 mots):</p>
  <ul>
    <li>Conseil 1 avec explication détaillée</li>
    <li>Conseil 2 avec explication détaillée</li>
    <li>Conseil 3 avec explication détaillée</li>
    <li>Conseil 4 avec explication détaillée</li>
    <li>Conseil 5 avec explication détaillée</li>
  </ul>
  
  <h2>Les actions à prendre maintenant</h2>
  <p>Donne des actions concrètes (100-150 mots): Que faire immédiatement? Quelles ressources utiliser? Comment se préparer?</p>
  
  <h3>Préparer votre voyage</h3>
  <p>IMPORTANT: Mentionne OBLIGATOIREMENT les aspects pratiques du voyage (50-100 mots):
  - Comment se rendre sur place (vols, routes aériennes)
  - Où loger une fois sur place (types d'hébergement, quartiers recommandés)
  - Budget transport et logement estimé
  Cela permettra d'insérer des outils de comparaison utiles pour le lecteur.</p>
  
  <p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie.</em></p>"
}`;

      case 'CONSEIL_PRATIQUE':
        return basePrompt + `
{
  "title": "💡 {astuce} : Comment {bénéfice} en {destination}",
  "target_audience": "${analysis.audience}",
  "ton": "Expert, confident, pratique",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Problème → Solution → Bénéfices → Mise en pratique → Ressources"
}`;

      default:
        return basePrompt + `
{
  "title": "🌏 {sujet} : Guide nomade pour {destination}",
  "target_audience": "${analysis.audience}",
  "ton": "Expert, confident, pratique",
  "keywords": "${analysis.keywords}",
  "cta": "${analysis.cta}",
  "urgence": "${analysis.urgence}",
  "destinations": "${analysis.destination}",
  "content": "Structure: Introduction → Développement → Conseils → Conclusion"
}`;
    }
  }

  // Sélection intelligente du contenu Reddit
  async selectSmartContent(article) {
    try {
      const fullContent = await this.extractFullContent(article);
      
      // Analyser le contenu pour extraire les éléments clés
      const lines = fullContent.split('\n').filter(line => line.trim().length > 0);
      
      // Identifier les meilleures citations (phrases avec "I", "We", "My", etc.)
      const personalQuotes = lines.filter(line => 
        /^(I|We|My|Our|I'm|We're|I've|We've)/.test(line.trim()) && 
        line.length > 20 && 
        line.length < 200
      );
      
      // Identifier les détails clés (chiffres, résultats, conseils)
      const keyDetails = lines.filter(line => 
        /\d+/.test(line) || 
        /(success|failed|learned|advice|tip|recommend|suggest)/i.test(line)
      );
      
      // Identifier le contexte essentiel (première phrase, dernière phrase)
      const context = [
        lines[0], // Première phrase
        lines[lines.length - 1] // Dernière phrase
      ].filter(Boolean);
      
      // Construire le contenu sélectionné
      const selectedContent = [
        ...context,
        ...personalQuotes.slice(0, 3), // Top 3 citations personnelles
        ...keyDetails.slice(0, 2) // Top 2 détails clés
      ].join('\n\n');
      
      console.log(`🎯 Contenu sélectionné: ${selectedContent.length} caractères (${personalQuotes.length} citations, ${keyDetails.length} détails)`);
      return selectedContent;
      
    } catch (error) {
      console.log('⚠️ Erreur sélection intelligente, utilisation du contenu complet');
      return await this.extractFullContent(article);
    }
  }

  // Extraction du contenu complet (même méthode que l'original)
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

      const html = response.data;
      const contentMatch = html.match(/<article[^>]*>(.*?)<\/article>/s) || 
                          html.match(/<main[^>]*>(.*?)<\/main>/s) ||
                          html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/s);
      
      if (contentMatch) {
        const content = contentMatch[1]
          .replace(/<script[^>]*>.*?<\/script>/gs, '')
          .replace(/<style[^>]*>.*?<\/style>/gs, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        console.log(`✅ Contenu extrait: ${content.length} caractères`);
        return content.substring(0, 3000);
      }

      console.log('⚠️ Impossible d\'extraire le contenu - Utilisation du contenu disponible');
      return article.content || 'Contenu non disponible';
    } catch (error) {
      console.log(`⚠️ Erreur extraction contenu: ${error.message}`);
      return article.content || 'Contenu non disponible';
    }
  }

  // Analyse de fallback quand OpenAI n'est pas disponible
  getFallbackAnalysis(article) {
    console.log('🔄 Utilisation de l\'analyse de fallback...');
    
    const title = article.title.toLowerCase();
    const content = (article.content || '').toLowerCase();
    const text = `${title} ${content}`;
    
    // Détection de type de contenu
    let typeContenu = 'CONSEIL_PRATIQUE';
    if (text.includes('success') || text.includes('réussite') || text.includes('doublé')) {
      typeContenu = 'TEMOIGNAGE_SUCCESS_STORY';
    } else if (text.includes('erreur') || text.includes('échec') || text.includes('mistake')) {
      typeContenu = 'TEMOIGNAGE_ECHEC_LEÇONS';
    } else if (text.includes('transition') || text.includes('changement') || text.includes('devenir')) {
      typeContenu = 'TEMOIGNAGE_TRANSITION';
    } else if (text.includes('vs') || text.includes('comparaison') || text.includes('compare')) {
      typeContenu = 'TEMOIGNAGE_COMPARAISON';
    } else if (text.includes('guide') || text.includes('comment') || text.includes('tutorial')) {
      typeContenu = 'GUIDE_PRATIQUE';
    } else if (text.includes('news') || text.includes('nouvelle') || text.includes('réglementation')) {
      typeContenu = 'ACTUALITE_NOMADE';
    }
    
    // Détection de sous-catégorie
    let sousCategorie = 'général';
    if (text.includes('visa') || text.includes('résidence')) {
      sousCategorie = 'visa';
    } else if (text.includes('coliving') || text.includes('logement')) {
      sousCategorie = 'logement';
    } else if (text.includes('transport') || text.includes('vol')) {
      sousCategorie = 'transport';
    } else if (text.includes('santé') || text.includes('assurance')) {
      sousCategorie = 'santé';
    } else if (text.includes('budget') || text.includes('coût')) {
      sousCategorie = 'finance';
    }
    
    // Détection d'audience
    let audience = 'nomades_generaux';
    if (text.includes('débutant') || text.includes('premier')) {
      audience = 'nomades_debutants';
    } else if (text.includes('expert') || text.includes('avancé')) {
      audience = 'nomades_experts';
    } else if (text.includes('famille')) {
      audience = 'nomades_famille';
    }
    
    return {
      type_contenu: typeContenu,
      sous_categorie: sousCategorie,
      angle: 'pratique',
      audience: audience,
      destination: this.extractDestinations(text),
      urgence: 'medium',
      keywords: this.extractKeywords(text),
      cta: 'Découvrez nos guides nomades Asie',
      pertinence: 70,
      recommandation: 'generation_llm',
      template_specifique: 'generic',
      raison: 'Analyse de fallback basée sur les mots-clés'
    };
  }

  // Extraire les mots-clés du texte
  extractKeywords(text) {
    const keywords = [];
    const nomadKeywords = ['nomad', 'digital nomad', 'remote work', 'coliving', 'coworking', 'visa', 'résidence', 'fiscal'];
    const asiaKeywords = ['asia', 'asie', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia'];
    
    nomadKeywords.forEach(keyword => {
      if (text.includes(keyword)) keywords.push(keyword);
    });
    
    asiaKeywords.forEach(keyword => {
      if (text.includes(keyword)) keywords.push(keyword);
    });
    
    return keywords.slice(0, 5).join(', ');
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

  // Contenu de fallback - UNIQUEMENT si erreur technique, PAS de fausses données
  getFallbackContent(article, analysis) {
    // Si erreur technique, on refuse de publier plutôt que de créer du faux contenu
    throw new Error(`ERREUR TECHNIQUE: Impossible de générer le contenu pour "${article.title}". Refus de publier du contenu générique.`);
  }
}

export default IntelligentContentAnalyzerOptimized;
