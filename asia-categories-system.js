#!/usr/bin/env node

// Système de catégorisation ultra-spécialisé Asie pour FlashVoyages
export const ASIA_CATEGORIES = {
  // Par type de voyageur
  'digital-nomad': {
    name: 'Digital Nomad Asie',
    description: 'Conseils pour les nomades digitaux en Asie',
    keywords: ['coworking', 'wifi', 'visa long séjour', 'coliving', 'productivité']
  },
  'backpacker': {
    name: 'Backpacker Asie', 
    description: 'Guide backpacker pour l\'Asie du Sud-Est',
    keywords: ['auberge', 'budget', 'transport local', 'rencontres', 'aventure']
  },
  'luxury-traveler': {
    name: 'Luxe Asie',
    description: 'Voyages haut de gamme en Asie',
    keywords: ['5 étoiles', 'spa', 'gastronomie', 'hôtels de luxe', 'expériences exclusives']
  },
  'family-asia': {
    name: 'Famille Asie',
    description: 'Voyager en famille en Asie',
    keywords: ['enfants', 'sécurité', 'activités familiales', 'hébergement adapté', 'santé']
  },
  'solo-female': {
    name: 'Solo Féminin Asie',
    description: 'Conseils pour voyager seule en Asie',
    keywords: ['sécurité femme', 'hébergement sûr', 'transport sécurisé', 'communauté', 'autonomie']
  },
  
  // Par expérience
  'first-time-asia': {
    name: 'Premier voyage Asie',
    description: 'Guide pour votre premier voyage en Asie',
    keywords: ['débutant', 'préparation', 'essentiels', 'erreurs à éviter', 'premiers pas']
  },
  'asia-expert': {
    name: 'Expert Asie',
    description: 'Pour les voyageurs expérimentés',
    keywords: ['destinations secrètes', 'expériences uniques', 'conseils avancés', 'insider tips']
  },
  'off-the-beaten-path': {
    name: 'Hors des sentiers battus',
    description: 'Destinations secrètes et authentiques',
    keywords: ['authentique', 'local', 'secret', 'peu touristique', 'découverte']
  },
  
  // Par budget
  'budget-asia': {
    name: 'Budget serré Asie',
    description: 'Voyager en Asie avec un petit budget',
    keywords: ['économies', 'gratuit', 'bon marché', 'astuces budget', 'low cost']
  },
  'mid-range-asia': {
    name: 'Confort Asie',
    description: 'Voyage confortable sans se ruiner',
    keywords: ['confort', 'qualité-prix', 'équilibré', 'modéré', 'accessible']
  },
  'premium-asia': {
    name: 'Premium Asie',
    description: 'Expériences premium en Asie',
    keywords: ['premium', 'qualité', 'exclusif', 'haut de gamme', 'exceptionnel']
  },
  
  // Par saison
  'monsoon-season': {
    name: 'Saison des pluies',
    description: 'Voyager pendant la mousson',
    keywords: ['mousson', 'pluie', 'saison humide', 'préparatifs', 'activités intérieures']
  },
  'peak-season': {
    name: 'Haute saison',
    description: 'Voyager en haute saison',
    keywords: ['haute saison', 'réservation', 'prix élevés', 'foule', 'planification']
  },
  'shoulder-season': {
    name: 'Mi-saison',
    description: 'La meilleure période pour voyager',
    keywords: ['mi-saison', 'optimal', 'prix raisonnables', 'météo favorable', 'moins de monde']
  },
  
  // Par type d'expérience
  'street-food': {
    name: 'Street Food',
    description: 'Découvrir la street food asiatique',
    keywords: ['nourriture de rue', 'gastronomie locale', 'spécialités', 'marchés', 'saveurs']
  },
  'temples': {
    name: 'Temples & Spiritualité',
    description: 'Temples et lieux spirituels d\'Asie',
    keywords: ['temple', 'spiritualité', 'bouddhisme', 'hindouisme', 'méditation']
  },
  'beaches': {
    name: 'Plages & Îles',
    description: 'Plages paradisiaques d\'Asie',
    keywords: ['plage', 'île', 'paradis', 'farniente', 'eau turquoise']
  },
  'mountains': {
    name: 'Montagnes & Trek',
    description: 'Randonnées et treks en Asie',
    keywords: ['trek', 'randonnée', 'montagne', 'nature', 'aventure']
  },
  'cities': {
    name: 'Mégalopoles',
    description: 'Villes dynamiques d\'Asie',
    keywords: ['mégapole', 'urbain', 'moderne', 'dynamique', 'métropole']
  },
  'rural': {
    name: 'Campagne & Villages',
    description: 'Découvrir la vie rurale asiatique',
    keywords: ['village', 'rural', 'traditions', 'authentique', 'local']
  }
};

export const ASIA_ANALYSIS_CONTEXT = {
  // Contexte culturel
  'cultural-etiquette': {
    name: 'Savoir-vivre local',
    description: 'Règles de politesse et coutumes locales',
    keywords: ['étiquette', 'coutumes', 'politesse', 'respect', 'traditions']
  },
  'language-tips': {
    name: 'Expressions utiles',
    description: 'Phrases essentielles pour voyager',
    keywords: ['langue', 'expressions', 'communication', 'traduction', 'local']
  },
  'local-insights': {
    name: 'Secrets d\'initiés',
    description: 'Conseils que seuls les locaux connaissent',
    keywords: ['secret', 'local', 'initié', 'conseil', 'astuce']
  },
  
  // Contexte pratique
  'visa-complexity': {
    name: 'Complexité des visas',
    description: 'Gérer les formalités de visa',
    keywords: ['visa', 'formalités', 'documents', 'procédure', 'délai']
  },
  'transport-options': {
    name: 'Options de transport local',
    description: 'Se déplacer efficacement en Asie',
    keywords: ['transport', 'déplacement', 'local', 'efficace', 'pratique']
  },
  'safety-concerns': {
    name: 'Sécurité spécifique',
    description: 'Conseils de sécurité pour l\'Asie',
    keywords: ['sécurité', 'précautions', 'risque', 'protection', 'vigilance']
  },
  'health-considerations': {
    name: 'Santé & vaccins',
    description: 'Préparer sa santé pour l\'Asie',
    keywords: ['santé', 'vaccin', 'médicament', 'prévention', 'soins']
  },
  
  // Contexte économique
  'currency-fluctuation': {
    name: 'Fluctuation des devises',
    description: 'Gérer les taux de change',
    keywords: ['devise', 'taux de change', 'euro', 'monnaie locale', 'économie']
  },
  'bargaining-tips': {
    name: 'Art de la négociation',
    description: 'Négocier comme un local',
    keywords: ['négociation', 'marchandage', 'prix', 'astuce', 'local']
  },
  'local-costs': {
    name: 'Coûts locaux réels',
    description: 'Budget réel pour vivre en Asie',
    keywords: ['coût', 'budget', 'prix local', 'réel', 'quotidien']
  },
  'tourist-traps': {
    name: 'Pièges à touristes',
    description: 'Éviter les arnaques touristiques',
    keywords: ['piège', 'arnaque', 'touriste', 'éviter', 'précaution']
  }
};

export const ASIA_FOMO_TITLES = {
  'visa': [
    '🚨 URGENT : {country} simplifie les visas pour les Français !',
    '⚡ {country} : Visa gratuit confirmé - Dépêchez-vous !',
    '🔥 RÉVOLUTION : {country} supprime les formalités !',
    '🎯 {country} : Nouveau visa express en 24h !',
    '🚀 {country} : Formalités réduites de 50% !'
  ],
  'flights': [
    '✈️ {country} : Nouveaux vols directs - Prix en chute libre !',
    '🚀 {country} : Compagnies en guerre des prix !',
    '⚡ {country} : Vols directs rétablis - Réservez MAINTENANT !',
    '🔥 OFFRE LIMITÉE : Vols {country} à prix cassés !',
    '🎯 {country} : Vols directs confirmés - Ne ratez pas ça !'
  ],
  'safety': [
    '⚠️ {country} : Nouvelles règles de sécurité - Info cruciale !',
    '🛡️ {country} : Zones à éviter mises à jour !',
    '🚨 {country} : Alerte voyageurs - Lisez avant de partir !',
    '⚠️ URGENT : {country} modifie ses règles de sécurité !',
    '🛡️ {country} : Nouveaux conseils sécurité pour les Français !'
  ],
  'deals': [
    '💰 {country} : Hôtels à prix cassés - Offre limitée !',
    '🎯 {country} : Séjour de rêve à -50% !',
    '🔥 {country} : Deal exceptionnel - Ne ratez pas ça !',
    '💎 {country} : Offre secrète révélée !',
    '🎁 {country} : Cadeau surprise pour nos lecteurs !'
  ],
  'cultural': [
    '🎭 {country} : Événement culturel unique - Info exclusive !',
    '🏛️ {country} : Nouveau temple ouvert au public !',
    '🎨 {country} : Festival secret découvert !',
    '🎪 {country} : Cérémonie traditionnelle exceptionnelle !',
    '🎊 {country} : Fête locale à ne pas manquer !'
  ]
};

export const ASIA_SCORING_SYSTEM = {
  'relevance': {
    'asia-specific': 25, // Info spécifique à l'Asie
    'french-traveler': 20, // Pertinence pour voyageurs français
    'practical-value': 15, // Valeur pratique immédiate
    'cultural-insight': 10, // Insight culturel
    'safety-info': 10, // Info sécurité
    'cost-impact': 10, // Impact sur le budget
    'timing': 10 // Actualité récente
  },
  
  'emotional_triggers': {
    'fomo': 15, // Fear of missing out
    'exclusivity': 10, // Exclusivité
    'urgency': 10, // Urgence
    'dream': 10, // Rêve/aspiration
    'fear': 5 // Peur (sécurité, etc.)
  },
  
  'content_quality': {
    'originality': 15, // Originalité du contenu
    'seo_potential': 10, // Potentiel SEO
    'viral_potential': 10, // Potentiel viral
    'expertise': 10, // Niveau d'expertise
    'actionability': 10 // Capacité d'action
  }
};

export const VOICE_TONE_ASIA = {
  'expertise': 'Expert Asie reconnu',
  'complicity': 'Complice avec la communauté',
  'cleverness': 'Malin et astucieux', 
  'confidence': 'Sûr de ses conseils',
  'asia-focused': '100% concentré sur l\'Asie',
  'french-perspective': 'Vue française sur l\'Asie',
  'cultural-sensitivity': 'Respectueux des cultures',
  'practical': 'Concret et applicable'
};

// Fonction pour générer un titre FOMO spécialisé Asie
export function generateAsiaFOMOTitle(country, articleType, originalTitle = '') {
  const countryFrench = country === 'china' ? 'Chine' :
                       country === 'korea' ? 'Corée du Sud' :
                       country === 'japan' ? 'Japon' :
                       country === 'vietnam' ? 'Vietnam' :
                       country === 'thailand' ? 'Thaïlande' :
                       country === 'singapore' ? 'Singapour' :
                       country === 'malaysia' ? 'Malaisie' :
                       country === 'indonesia' ? 'Indonésie' :
                       country === 'philippines' ? 'Philippines' :
                       country === 'taiwan' ? 'Taïwan' :
                       country === 'hong kong' ? 'Hong Kong' :
                       country;

  const templates = ASIA_FOMO_TITLES[articleType] || ASIA_FOMO_TITLES['deals'];
  const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
  
  return randomTemplate.replace('{country}', countryFrench);
}

// Fonction pour scorer un article selon le système Asie
export function scoreAsiaArticle(article, title, content) {
  let score = 0;
  let reasons = [];
  
  // Scoring de pertinence
  const asiaKeywords = ['asia', 'chinese', 'japanese', 'korean', 'vietnamese', 'thai', 'singapore', 'malaysia', 'indonesia', 'philippines', 'taiwan', 'hong kong'];
  const frenchKeywords = ['french', 'france', 'français', 'european'];
  const practicalKeywords = ['visa', 'flight', 'hotel', 'travel', 'safety', 'cost', 'budget'];
  
  // Vérifier la pertinence Asie
  const asiaRelevance = asiaKeywords.some(keyword => 
    title.toLowerCase().includes(keyword) || content.toLowerCase().includes(keyword)
  );
  if (asiaRelevance) {
    score += ASIA_SCORING_SYSTEM.relevance['asia-specific'];
    reasons.push('Pertinence Asie: 25 points');
  }
  
  // Vérifier la pertinence voyageurs français
  const frenchRelevance = frenchKeywords.some(keyword => 
    title.toLowerCase().includes(keyword) || content.toLowerCase().includes(keyword)
  );
  if (frenchRelevance) {
    score += ASIA_SCORING_SYSTEM.relevance['french-traveler'];
    reasons.push('Pertinence voyageurs français: 20 points');
  }
  
  // Vérifier la valeur pratique
  const practicalRelevance = practicalKeywords.some(keyword => 
    title.toLowerCase().includes(keyword) || content.toLowerCase().includes(keyword)
  );
  if (practicalRelevance) {
    score += ASIA_SCORING_SYSTEM.relevance['practical-value'];
    reasons.push('Valeur pratique: 15 points');
  }
  
  // Scoring émotionnel
  const fomoKeywords = ['urgent', 'urgent', 'limited', 'exclusive', 'secret', 'now', 'immediately'];
  const fomoRelevance = fomoKeywords.some(keyword => 
    title.toLowerCase().includes(keyword) || content.toLowerCase().includes(keyword)
  );
  if (fomoRelevance) {
    score += ASIA_SCORING_SYSTEM.emotional_triggers['fomo'];
    reasons.push('Trigger FOMO: 15 points');
  }
  
  return {
    score,
    reasons,
    strategicValue: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low'
  };
}

