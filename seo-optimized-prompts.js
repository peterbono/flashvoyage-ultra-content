/**
 * PROMPTS SEO OPTIMISÉS - FLASHVOYAGES
 * Basés sur les dernières tendances SEO 2024-2025
 * Approche conservatrice : garde les structures existantes
 */

class SEOOptimizedPrompts {
  constructor() {
    this.baseGuidelines = {
      cible: "Digital nomades et voyageurs passionnés d'Asie",
      specialites: "Bons plans, formalités, transports, sécurité, tourisme",
      objectif: "Contenu unique, valeur ajoutée, économies concrètes",
      ton: "Expert mais accessible, authentique, pratique",
      style: "Comme Voyage Pirate mais pour l'Asie"
    };
  }

  /**
   * PROMPT D'ANALYSE OPTIMISÉ
   * Micro-intentions + SEO moderne
   */
  getAnalysisPrompt(article) {
    return `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE À ANALYSER:
- Titre: ${article.title}
- Source: ${article.source}
- Type: ${article.type}
- Contenu: ${article.content}
- Lien: ${article.link}

MISSION: Analyser ce contenu et déterminer la meilleure approche éditoriale.

GUIDELINES FLASHVOYAGES:
- Cible: ${this.baseGuidelines.cible}
- Spécialités: ${this.baseGuidelines.specialites}
- Objectif: ${this.baseGuidelines.objectif}
- Ton: ${this.baseGuidelines.ton}
- Style: ${this.baseGuidelines.style}

TYPES DE CONTENU DISPONIBLES:
1. TEMOIGNAGE_SUCCESS_STORY (15% du contenu)
   - Récits de réussite, transformation, objectifs atteints
   - Structure: Défi → Action → Résultat
   - Ton: Inspirant, motivant, authentique
   - Micro-intentions: "nomade débutant vietnam réussite", "nomade confirmé thailand transformation", "nomade expert asie scaling"
   - Exemples: "Comment j'ai doublé mes revenus", "Ma transformation nomade"

2. TEMOIGNAGE_ECHEC_LEÇONS (10% du contenu)
   - Erreurs commises, leçons apprises, prévention
   - Structure: Erreur → Conséquences → Leçons
   - Ton: Humble, préventif, éducatif
   - Micro-intentions: "nomade débutant erreur visa", "nomade confirmé échec logement", "nomade expert erreur fiscalité"
   - Exemples: "Mon échec avec le visa", "L'erreur qui m'a coûté cher"

3. TEMOIGNAGE_TRANSITION (10% du contenu)
   - Changements de vie, adaptations, évolutions
   - Structure: Avant → Pendant → Après
   - Ton: Réfléchi, adaptatif, encourageant
   - Micro-intentions: "salarié vers nomade asie", "nomade amérique vers asie", "nomade famille asie"
   - Exemples: "De salarié à nomade", "Ma transition vers l'Asie"

4. TEMOIGNAGE_COMPARAISON (5% du contenu)
   - Comparaisons entre destinations, méthodes, options
   - Structure: Option A vs Option B → Recommandation
   - Ton: Comparatif, objectif, informatif
   - Micro-intentions: "nomade vietnam vs thailand", "nomade coliving vs airbnb", "nomade budget vs premium"
   - Exemples: "Bali vs Vietnam", "Coliving vs Airbnb"

5. GUIDE_PRATIQUE (20% du contenu)
   - Guides step-by-step, procédures, checklists
   - Structure: Introduction → Étapes → Conclusion
   - Ton: Pratique, utilitaire, actionnable
   - Micro-intentions: "nomade débutant guide visa", "nomade confirmé guide logement", "nomade expert guide fiscalité"
   - Exemples: "Comment obtenir un visa", "Guide coliving Asie"

6. COMPARAISON_DESTINATIONS (15% du contenu)
   - Comparaisons détaillées entre pays/villes
   - Structure: Critères → Analyse → Recommandation
   - Ton: Analytique, objectif, informatif
   - Micro-intentions: "nomade vietnam vs thailand", "nomade bangkok vs chiang mai", "nomade asie vs amérique latine"
   - Exemples: "Vietnam vs Thaïlande", "Bangkok vs Chiang Mai"

7. ACTUALITE_NOMADE (15% du contenu)
   - Nouvelles, tendances, réglementations
   - Structure: Contexte → Impact → Conseils
   - Ton: Informé, réactif, pratique
   - Micro-intentions: "nomade actualité visa", "nomade actualité transport", "nomade actualité fiscalité"
   - Exemples: "Nouveau visa nomade", "Changements réglementaires"

8. CONSEIL_PRATIQUE (10% du contenu)
   - Astuces, bonnes pratiques, optimisations
   - Structure: Problème → Solution → Bénéfices
   - Ton: Expert, confident, pratique
   - Micro-intentions: "nomade astuce budget", "nomade astuce productivité", "nomade astuce santé"
   - Exemples: "Comment économiser", "Astuces productivité"

ANALYSE REQUISE:
1. Type de contenu (un des 8 types ci-dessus)
2. Sous-catégorie spécifique (visa, logement, transport, santé, finance, communauté)
3. Angle éditorial (pratique, comparatif, analyse, conseil, inspirant, préventif)
4. Audience cible spécifique (débutant, confirmé, expert, famille, senior)
5. Destination concernée (Vietnam, Thaïlande, Indonésie, Japon, Corée du Sud, Singapour, Asie)
6. Niveau d'urgence (high, medium, low)
7. Mots-clés pertinents (max 5) - Focus long-tail SEO
8. CTA approprié
9. Score de pertinence (0-100)
10. Recommandation: template_fixe OU generation_llm
11. Template spécifique à utiliser (si template_fixe)
12. Micro-intention détectée (pour SEO agentique)

RÉPONDRE UNIQUEMENT EN JSON VALIDE:
{
  "type_contenu": "TEMOIGNAGE_SUCCESS_STORY",
  "sous_categorie": "visa",
  "angle": "inspirant",
  "audience": "nomades_debutants_vietnam",
  "destination": "Vietnam",
  "urgence": "medium",
  "keywords": "visa nomade vietnam, réussite, transformation, débutant",
  "cta": "Découvrez comment réussir votre visa nomade au Vietnam",
  "pertinence": 85,
  "recommandation": "generation_llm",
  "template_specifique": "success_story",
  "micro_intention": "nomade débutant vietnam réussite business",
  "raison": "Récit de réussite avec conseils pratiques pour débutants"
}`;
  }

  /**
   * PROMPT DE GÉNÉRATION OPTIMISÉ
   * SEO moderne + structure conservée
   */
  getGenerationPrompt(article, analysis) {
    return `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE SOURCE COMPLET:
- Titre: ${article.title}
- Source: ${article.source}
- Contenu complet: ${article.content}
- Lien: ${article.link}

ANALYSE ÉDITORIALE:
- Catégorie: ${analysis.categorie}
- Angle: ${analysis.angle}
- Audience: ${analysis.audience}
- Mots-clés: ${analysis.keywords}
- CTA: ${analysis.cta}
- Destinations: ${analysis.destinations}
- Micro-intention: ${analysis.micro_intention}

MISSION: Créer un article éditorial de qualité qui transforme cette source en contenu FlashVoyages.

GUIDELINES FLASHVOYAGES:
- Cible: ${this.baseGuidelines.cible}
- Style: Expert, data-driven, avec des conseils pratiques concrets
- Ton: ${this.baseGuidelines.ton}
- Style: ${this.baseGuidelines.style}
- Objectif: Valeur ajoutée, conseils pratiques, économies concrètes

INSTRUCTIONS SPÉCIFIQUES:
1. EXTRACTION DE DONNÉES: Utilise les informations spécifiques de l'article source (prix, dates, lieux, détails concrets)
2. PERSONNALISATION: Adapte le contenu à l'audience nomade asiatique selon la micro-intention
3. VALEUR AJOUTÉE: Ajoute des conseils pratiques, des alternatives, des astuces
4. STRUCTURE: Utilise des H2/H3 pour organiser, des listes pour les détails, des CTA pour l'action
5. SPÉCIFICITÉ: Évite les généralités, utilise des données précises de l'article source
6. SEO: Intègre naturellement les mots-clés long-tail, optimise pour les micro-intentions
7. EXPÉRIENCE UTILISATEUR: Contenu actionnable, pas juste informatif

CONTENU REQUIS:
1. Titre accrocheur avec emoji (optimisé SEO)
2. Introduction personnalisée (micro-intention)
3. Analyse du sujet avec angle FlashVoyages
4. Conseils pratiques et concrets
5. Comparaison si pertinent
6. CTA spécifique
7. Signature FlashVoyages

RÉPONDRE UNIQUEMENT EN JSON VALIDE:
{
  "title": "🌏 Asie vs Amérique Latine : Le Guide Définitif pour Digital Nomades",
  "target_audience": "Digital nomades hésitant entre régions",
  "ton": "Expert mais accessible, authentique, pratique",
  "keywords": "nomade, asie, amérique latine, comparaison, choix destination",
  "cta": "Découvrez notre guide complet Asie vs Amérique Latine",
  "urgence": "medium",
  "destinations": "Asie du Sud-Est, Amérique Latine",
  "micro_intention": "nomade choix destination asie vs amérique latine",
  "content": "<p><strong>Source :</strong> <a href=\\"${article.link}\\" target=\\"_blank\\" rel=\\"noopener\\">${article.title}</a> - ${article.source}</p>\\n\\n<p>Salut nomade ! Si tu hésites entre l'Asie et l'Amérique Latine pour ton prochain séjour prolongé, cette question Reddit va t'aider à y voir plus clair. Chez FlashVoyages, on connaît bien les deux régions et on va te donner notre analyse d'experts.</p>\\n\\n<h2>Pourquoi cette question est cruciale pour toi</h2>\\n<p>Choisir entre l'Asie et l'Amérique Latine, c'est pas juste une question de préférence. C'est un choix qui va impacter ton budget, ton style de vie, et tes opportunités professionnelles pendant des mois.</p>\\n\\n<p>On a analysé les réponses de la communauté nomade et on va te donner notre perspective FlashVoyages, basée sur notre expérience terrain.</p>\\n\\n<h2>Notre analyse FlashVoyages : Asie vs Amérique Latine</h2>\\n<p>Voici ce que nos experts pensent :</p>\\n\\n<ul>\\n<li><strong>Asie du Sud-Est :</strong> Meilleur rapport qualité-prix, infrastructure nomade développée, communauté active</li>\\n<li><strong>Amérique Latine :</strong> Culture plus proche, langue plus accessible, horaires compatibles Europe</li>\\n<li><strong>Budget :</strong> Asie gagne sur le coût de la vie, Amérique Latine sur les vols</li>\\n<li><strong>Visa :</strong> Asie plus flexible, Amérique Latine plus restrictive</li>\\n</ul>\\n\\n<h2>Notre conseil FlashVoyages</h2>\\n<p>Commence par l'Asie si tu veux maximiser ton budget et découvrir une culture totalement différente. Choisis l'Amérique Latine si tu préfères une transition plus douce et des horaires compatibles avec l'Europe.</p>\\n\\n<h2>Contexte nomade</h2>\\n<p>Les deux régions offrent des opportunités incroyables pour les digital nomades. L'important, c'est de choisir selon tes priorités : budget, culture, ou opportunités professionnelles.</p>\\n\\n<h2>Notre analyse</h2>\\n<p><strong>Score FlashVoyages :</strong> ${analysis.pertinence}/100 — Question cruciale pour nomades</p>\\n<p><strong>Pourquoi c'est important :</strong> Impact direct sur ton expérience nomade</p>\\n<p><strong>Action recommandée :</strong> Tester les deux régions si possible</p>\\n\\n<p><em>Cet article a été analysé par notre équipe FlashVoyages — ton spécialiste du nomadisme en Asie.</em></p>"
}`;
  }

  /**
   * PROMPT DE VALIDATION SEO
   * Vérification qualité + SEO + NOUVELLES RÈGLES
   */
  getValidationPrompt(content) {
    return `Tu es un expert SEO pour FlashVoyages.com.

CONTENU À VALIDER:
${content}

VALIDATION REQUISE:
1. Structure sémantique (H1, H2, H3 appropriés)
2. Mots-clés long-tail intégrés naturellement
3. Micro-intentions respectées
4. Ton cohérent (Expert mais accessible, authentique, pratique)
5. CTA clair et actionnable
6. Contenu unique et valeur ajoutée
7. Optimisation pour agents IA (données structurées)
8. **NOUVEAU:** Absence d'emojis dans le titre (pour témoignages)
9. **NOUVEAU:** Absence de répétitions d'introductions
10. **NOUVEAU:** Fluidité de lecture optimale
11. **NOUVEAU:** Diversité des formulations d'introduction
12. **NOUVEAU:** Évitement des patterns répétitifs

RÈGLES SPÉCIFIQUES TÉMOIGNAGES:
- Titre SANS emoji (interdiction totale)
- Maximum 2 phrases commençant par la même expression
- Varier les introductions : "Mon parcours", "Grâce à", "Après X mois", "Mon expérience"
- Éviter : "En tant que nomade digital" répété plus de 2 fois
- Fluidité : Chaque paragraphe doit avoir une introduction différente

RÉPONDRE UNIQUEMENT EN JSON VALIDE:
{
  "score_qualite": 95,
  "score_seo": 90,
  "score_utilisateur": 88,
  "problemes": [],
  "recommandations": [],
  "validation": true,
  "repetitions_detectees": [],
  "emojis_titre": false,
  "fluidite_lecture": "excellente"
}`;
  }
}

export default SEOOptimizedPrompts;
