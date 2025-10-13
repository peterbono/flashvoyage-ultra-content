/**
 * PROMPTS ENRICHIS - DONNÉES ULTRA-PRÉCISES
 * Extraction automatique de données précises pour tous les témoignages
 */

class EnhancedPreciseDataPrompts {
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
   * PROMPT D'ANALYSE ENRICHIE - DONNÉES PRÉCISES
   */
  getEnhancedAnalysisPrompt(article) {
    return `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE À ANALYSER:
- Titre: ${article.title}
- Source: ${article.source}
- Type: ${article.type}
- Contenu: ${article.content}
- Lien: ${article.link}

MISSION: Analyser ce contenu et extraire des données ultra-précises pour créer un témoignage de niveau 9/10.

GUIDELINES FLASHVOYAGES:
- Cible: ${this.baseGuidelines.cible}
- Spécialités: ${this.baseGuidelines.specialites}
- Objectif: ${this.baseGuidelines.objectif}
- Ton: ${this.baseGuidelines.ton}
- Style: ${this.baseGuidelines.style}

EXTRACTION DE DONNÉES ULTRA-PRÉCISES REQUISE:

1. **COÛTS RÉELS ET PRÉCIS:**
   - Logement: Prix exact par type (coliving, Airbnb, hôtel), par quartier, par saison
   - Nourriture: Coût par repas, par type (street food, restaurant, supermarché)
   - Transport: Coût par trajet, par moyen (scooter, Grab, BTS, vol)
   - Internet: Vitesse, opérateur, coût mensuel, fiabilité
   - Loisirs: Coût par activité, par type (bars, activités, voyages)

2. **MÉTRIQUES BUSINESS:**
   - Revenus: Avant vs Après, croissance mensuelle, ROI
   - Coûts opérationnels: Bureau, services, main-d'œuvre
   - Économies: Montant exact économisé, pourcentage
   - Investissements: Coût initial, retour sur investissement

3. **TIMELINE PRÉCISE:**
   - Mois 1-3: Adaptation, défis, coûts
   - Mois 4-6: Optimisation, résultats, économies
   - Mois 7-12: Scaling, croissance, nouveaux défis

4. **SPÉCIFICITÉS LOCALES:**
   - Quartiers: Avantages/inconvénients par zone
   - Réseaux: Groupes Facebook, coworking, communautés
   - Réglementations: Visa, fiscalité, démarches
   - Infrastructure: Internet, transport, santé

5. **ERREURS COÛTEUSES:**
   - Erreurs commises: Coût exact, conséquences
   - Erreurs évitées: Grâce à quoi, économies réalisées
   - Leçons apprises: Comment éviter, alternatives

TYPES DE CONTENU DISPONIBLES:
1. TEMOIGNAGE_SUCCESS_STORY (15% du contenu)
   - Récits de réussite avec données précises
   - Structure: Défi → Action → Résultat (avec métriques)
   - Ton: Inspirant, motivant, authentique
   - Données: ROI, croissance, économies quantifiées
   - Exemples: "Comment j'ai doublé mes revenus de 3000€ à 8000€/mois"

2. TEMOIGNAGE_ECHEC_LEÇONS (10% du contenu)
   - Erreurs avec coûts réels
   - Structure: Erreur → Coût → Leçons
   - Ton: Humble, préventif, éducatif
   - Données: Coûts exacts des erreurs, économies des leçons
   - Exemples: "L'erreur qui m'a coûté 2000€ : Ne pas déclarer mes revenus"

3. TEMOIGNAGE_TRANSITION (10% du contenu)
   - Changements avec timeline précise
   - Structure: Avant → Pendant → Après (avec métriques)
   - Ton: Réfléchi, adaptatif, encourageant
   - Données: Évolution des coûts, revenus, qualité de vie
   - Exemples: "De salarié 3000€/mois à nomade 8000€/mois en 6 mois"

4. TEMOIGNAGE_COMPARAISON (5% du contenu)
   - Comparaisons avec données précises
   - Structure: A vs B → Métriques → Recommandation
   - Ton: Comparatif, objectif, informatif
   - Données: Coûts, vitesses, métriques par destination
   - Exemples: "Chiang Mai vs Bangkok : 300€ vs 500€/mois, 50Mbps vs 100Mbps"

ANALYSE REQUISE:
1. Type de contenu (un des 4 types ci-dessus)
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
13. Données précises extraites (coûts, revenus, métriques)
14. Comparaisons possibles (destinations, méthodes, options)
15. Erreurs coûteuses identifiées (coûts, conséquences)
16. Spécificités locales (quartiers, réseaux, réglementations)

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
  "donnees_precises": {
    "cout_logement": "Coliving Hubba Sukhumvit : 280€/mois, The Hive Thonglor : 320€/mois",
    "cout_nourriture": "Street food : 2-3€/repas, Restaurant : 8-15€/repas",
    "cout_transport": "Scooter : 800€ achat, 50€/mois essence, Grab : 3-8€/trajet",
    "internet": "AIS 4G : 20€/mois, 50Mbps, très fiable",
    "revenus": "Avant : 3000€/mois, Après : 8000€/mois, +167% en 6 mois"
  },
  "comparaisons_possibles": [
    "Chiang Mai vs Bangkok : 300€ vs 500€/mois logement",
    "Coliving vs Airbnb : 280€ vs 400€/mois",
    "Thaïlande vs Vietnam : 300€ vs 200€/mois coût de vie"
  ],
  "erreurs_couteuses": [
    "Erreur visa : 200€ de frais supplémentaires",
    "Erreur logement : 500€ de caution perdue",
    "Erreur transport : 300€ de scooter cassé"
  ],
  "specificites_locales": {
    "quartiers": "Sukhumvit : cher mais central, Thonglor : expat, Ari : local",
    "reseaux": "Facebook : Digital Nomads Thailand, Coworking : Hubba, The Hive",
    "reglementations": "Visa touristique 60j, extension 30j, visa ED possible"
  },
  "raison": "Récit de réussite avec données précises et métriques business"
}`;
  }

  /**
   * PROMPT DE GÉNÉRATION ENRICHIE - DONNÉES PRÉCISES
   */
  getEnhancedGenerationPrompt(article, analysis) {
    return `Tu es un expert éditorial pour FlashVoyages.com, spécialisé dans le voyage en Asie.

ARTICLE SOURCE COMPLET:
- Titre: ${article.title}
- Source: ${article.source}
- Contenu complet: ${article.content}
- Lien: ${article.link}

ANALYSE ÉDITORIALE ENRICHIE:
- Catégorie: ${analysis.categorie}
- Angle: ${analysis.angle}
- Audience: ${analysis.audience}
- Mots-clés: ${analysis.keywords}
- CTA: ${analysis.cta}
- Destinations: ${analysis.destinations}
- Micro-intention: ${analysis.micro_intention}
- Données précises: ${JSON.stringify(analysis.donnees_precises)}
- Comparaisons: ${JSON.stringify(analysis.comparaisons_possibles)}
- Erreurs coûteuses: ${JSON.stringify(analysis.erreurs_couteuses)}
- Spécificités locales: ${JSON.stringify(analysis.specificites_locales)}

MISSION: Créer un article éditorial de niveau 9/10 qui transforme cette source en contenu FlashVoyages premium.

GUIDELINES FLASHVOYAGES:
- Cible: ${this.baseGuidelines.cible}
- Style: Expert, data-driven, avec des conseils pratiques concrets
- Ton: ${this.baseGuidelines.ton}
- Style: ${this.baseGuidelines.style}
- Objectif: Valeur ajoutée, conseils pratiques, économies concrètes

INSTRUCTIONS SPÉCIFIQUES POUR NIVEAU 9/10:
1. **DONNÉES ULTRA-PRÉCISES:** Utilise les données précises extraites (coûts exacts, métriques, revenus)
2. **COMPARAISONS DIRECTES:** Intègre les comparaisons possibles (destinations, méthodes, options)
3. **RÉSULATS BUSINESS QUANTIFIÉS:** Montre les résultats business avec métriques (ROI, croissance, économies)
4. **ERREURS COÛTEUSES:** Inclus les erreurs coûteuses avec coûts réels (pas juste des conseils)
5. **SPÉCIFICITÉS LOCALES:** Détaille les spécificités locales (quartiers, réseaux, réglementations)
6. **STRUCTURE PREMIUM:** Utilise des H2/H3 pour organiser, des listes pour les détails, des CTA pour l'action
7. **SEO PREMIUM:** Intègre naturellement les mots-clés long-tail, optimise pour les micro-intentions
8. **EXPÉRIENCE UTILISATEUR:** Contenu actionnable, pas juste informatif

CONTENU REQUIS POUR NIVEAU 9/10:
1. Titre accrocheur avec emoji (optimisé SEO)
2. Introduction personnalisée (micro-intention)
3. **Section "Mon parcours personnel"** avec données précises
4. **Section "Les coûts réels"** avec métriques exactes
5. **Section "Les résultats business"** avec ROI quantifié
6. **Section "Les erreurs coûteuses"** avec coûts réels
7. **Section "Les spécificités locales"** avec détails pratiques
8. **Section "Comparaisons"** avec données directes
9. Conseils pratiques et concrets
10. CTA spécifique
11. Signature FlashVoyages

RÉPONDRE UNIQUEMENT EN JSON VALIDE:
{
  "title": "🌏 Comment j'ai doublé mes revenus en 6 mois au Vietnam : Le guide complet avec données réelles",
  "target_audience": "Digital nomades hésitant entre régions",
  "ton": "Expert mais accessible, authentique, pratique",
  "keywords": "nomade, vietnam, revenus, double, guide, données",
  "cta": "Découvrez comment doubler vos revenus au Vietnam",
  "urgence": "medium",
  "destinations": "Vietnam, Asie du Sud-Est",
  "micro_intention": "nomade débutant vietnam doubler revenus",
  "content": "<p><strong>Source :</strong> <a href=\\"${article.link}\\" target=\\"_blank\\" rel=\\"noopener\\">${article.title}</a> – ${article.source}</p>\\n\\n<p>Salut futur nomade ! Si tu envisages de devenir un nomade digital au Vietnam, ce retour d'expérience va t'aider à préparer ton aventure. Chez FlashVoyages, nous avons analysé ce témoignage pour te donner une vision claire et pratique de ce qui t'attend.</p>\\n\\n<h2>Mon parcours personnel au Vietnam</h2>\\n<p>Après 6 mois au Vietnam en tant que nomade digital, je partage aujourd'hui mon expérience complète pour t'aider dans ta propre aventure. Ho Chi Minh City s'est révélée être une destination exceptionnelle pour les entrepreneurs tech.</p>\\n\\n<p>En tant que développeur freelance avec 3 ans d'expérience, j'ai découvert le Vietnam grâce à mon envie de développer mon business à l'international. Mon objectif était de créer une agence de marketing digital tout en profitant d'un coût de vie avantageux.</p>\\n\\n<h2>Les coûts réels de ma vie au Vietnam</h2>\\n<p>Voici un breakdown détaillé de mes dépenses mensuelles avec données précises :</p>\\n\\n<ul>\\n<li><strong>Logement :</strong> Coliving Hubba District 1 : 280€/mois (chambre privée + espaces communs)</li>\\n<li><strong>Nourriture :</strong> Street food : 2-3€/repas, Restaurant : 8-15€/repas, Total : 150-250€/mois</li>\\n<li><strong>Transport :</strong> Scooter acheté 600€, revendu 550€, essence : 30€/mois</li>\\n<li><strong>Internet :</strong> Viettel 4G : 15€/mois, 50Mbps, très fiable</li>\\n<li><strong>Coworking :</strong> Hubba District 1 : 60€/mois, excellent pour la productivité</li>\\n<li><strong>Loisirs :</strong> Bars, activités, voyages : 100-200€/mois</li>\\n</ul>\\n\\n<h2>Les résultats business que j'ai obtenus</h2>\\n<p>En tant que nomade digital au Vietnam, voici les résultats business que j'ai obtenus :</p>\\n\\n<ul>\\n<li><strong>Revenus :</strong> Avant : 3000€/mois, Après : 8000€/mois, +167% en 6 mois</li>\\n<li><strong>Coût de la vie :</strong> Divisé par 3 par rapport à Paris (1000€ vs 3000€/mois)</li>\\n<li><strong>Épargne :</strong> 2000€ économisés sur 6 mois</li>\\n<li><strong>ROI :</strong> +150% sur mon investissement initial</li>\\n<li><strong>Réseau :</strong> 50+ contacts professionnels, 3 partenariats signés</li>\\n</ul>\\n\\n<h2>Les erreurs coûteuses que j'ai commises</h2>\\n<p>En tant que nomade digital au Vietnam, j'ai commis quelques erreurs coûteuses :</p>\\n\\n<ul>\\n<li><strong>Erreur visa :</strong> 200€ de frais supplémentaires pour extension</li>\\n<li><strong>Erreur logement :</strong> 500€ de caution perdue sur premier appartement</li>\\n<li><strong>Erreur transport :</strong> 300€ de scooter cassé par manque d'assurance</li>\\n<li><strong>Erreur fiscalité :</strong> 1000€ d'amende pour déclaration tardive</li>\\n</ul>\\n\\n<h2>Les spécificités locales du Vietnam</h2>\\n<p>Le Vietnam offre des spécificités locales uniques pour les nomades digitaux :</p>\\n\\n<ul>\\n<li><strong>Quartiers :</strong> District 1 : cher mais central, District 2 : expat, District 3 : local</li>\\n<li><strong>Réseaux :</strong> Facebook : Digital Nomads Vietnam, Coworking : Hubba, The Hive</li>\\n<li><strong>Réglementations :</strong> Visa touristique 30j, extension 30j, visa business possible</li>\\n<li><strong>Infrastructure :</strong> Internet 50Mbps, transport Grab, santé privée</li>\\n</ul>\\n\\n<h2>Comparaisons directes : Vietnam vs Thaïlande</h2>\\n<p>Voici mes comparaisons directes basées sur mon expérience :</p>\\n\\n<ul>\\n<li><strong>Coût de la vie :</strong> Vietnam : 300€/mois vs Thaïlande : 400€/mois</li>\\n<li><strong>Internet :</strong> Vietnam : 50Mbps vs Thaïlande : 100Mbps</li>\\n<li><strong>Communauté :</strong> Vietnam : 1000+ nomades vs Thaïlande : 5000+ nomades</li>\\n<li><strong>Visa :</strong> Vietnam : 30j vs Thaïlande : 60j</li>\\n</ul>\\n\\n<h2>Mon conseil pour votre premier vol</h2>\\n<p><strong>Ne faites pas la même erreur que moi !</strong> J'ai payé mon premier vol 800€ alors que j'aurais pu l'avoir à 450€. J'ai appris à mes dépens que tous les comparateurs ne se valent pas.</p>\\n\\n<p>Depuis que j'utilise <strong>Aviasales</strong>, j'ai économisé plus de 2000€ sur mes vols. Leur système de comparaison en temps réel et leurs offres exclusives m'ont permis de voyager plus souvent et moins cher.</p>\\n\\n<p><strong>💡 Mon secret :</strong> Je réserve toujours mes vols le mardi matin (meilleur jour selon mes tests) et j'active les alertes prix pour être notifié des baisses.</p>\\n\\n<h3>Trouvez votre vol vers le Vietnam</h3>\\n<p><strong>Prêt à faire le grand saut ?</strong> Comparez les prix et réservez au meilleur tarif.</p>\\n\\n<script async src=\\"https://trpwdg.com/content?trs=463418&shmarker=676421&locale=en&powered_by=true&color_button=%23f2685f&color_focused=%23f2685f&secondary=%23FFFFFF&dark=%2311100f&light=%23FFFFFF&special=%23C4C4C4&border_radius=5&plain=false&no_labels=true&promo_id=8588&campaign_id=541\\" charset=\\"utf-8\\"></script>\\n\\n<h2>Mon verdict final</h2>\\n<p>Le Vietnam reste un excellent choix pour les nomades digitaux. Cette destination convient particulièrement aux entrepreneurs tech qui cherchent à développer leur business tout en profitant d'un coût de la vie avantageux.</p>\\n\\n<p><strong>Mon verdict :</strong> Je recommande vivement le Vietnam pour les nomades digitaux, surtout pour les développeurs et marketeurs qui cherchent à créer leur entreprise à l'international.</p>\\n\\n<p><em>Cet article a été analysé par notre équipe FlashVoyages — ton spécialiste du nomadisme en Asie.</em></p>"
}`;
  }
}

export default EnhancedPreciseDataPrompts;
