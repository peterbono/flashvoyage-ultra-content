#!/usr/bin/env node

/**
 * Nomade Persona Detector - Détecteur de persona nomade coliving/visa Asie
 * Identifie automatiquement les articles liés aux nomades numériques en Asie
 */

class NomadePersonaDetector {
  constructor() {
    this.nomadeKeywords = {
      // Mots-clés nomades
      digital_nomad: [
        "digital nomad", "nomade numérique", "travailleur à distance", 
        "remote worker", "location independent", "nomade digital"
      ],
      
      // Mots-clés coliving
      coliving: [
        "coliving", "coworking", "espace partagé", "communauté nomade",
        "shared space", "co-living", "co-working", "nomade community"
      ],
      
      // Mots-clés visa
      visa: [
        "visa", "permis", "résidence", "séjour longue durée", "long stay",
        "work visa", "digital nomad visa", "visa nomade", "permis séjour"
      ],
      
      // Mots-clés budget
      budget: [
        "budget", "coût", "prix", "économiser", "pas cher", "abordable",
        "cost of living", "cheap", "affordable", "budget nomade"
      ]
    };
    
    this.asieKeywords = [
      "asie", "japon", "corée", "thailande", "vietnam", "singapour", 
      "bali", "indonésie", "philippines", "malaisie", "cambodge",
      "asia", "japan", "korea", "thailand", "singapore", "indonesia"
    ];
    
    this.destinations = {
      "japon": ["japon", "japan", "tokyo", "osaka", "kyoto"],
      "coree": ["corée", "korea", "séoul", "seoul", "busan"],
      "thailande": ["thailande", "thailand", "bangkok", "chiang mai", "phuket"],
      "vietnam": ["vietnam", "ho chi minh", "hanoi", "da nang"],
      "singapour": ["singapour", "singapore"],
      "bali": ["bali", "indonésie", "indonesia"],
      "philippines": ["philippines", "manille", "manila", "cebu"]
    };
  }

  // Détecter la persona d'un article
  detectPersona(article) {
    const title = (article.title || '').toLowerCase();
    const content = (article.content || '').toLowerCase();
    const source = (article.source || '').toLowerCase();
    
    const text = `${title} ${content} ${source}`;
    
    // Vérifier si c'est lié à l'Asie
    const isAsie = this.asieKeywords.some(keyword => text.includes(keyword));
    if (!isAsie) {
      return { persona: 'default', confidence: 0, details: 'Pas lié à l\'Asie' };
    }
    
    // Analyser les catégories nomades
    const categories = this.analyzeCategories(text);
    const destination = this.detectDestination(text);
    
    // Déterminer la persona principale
    const persona = this.determinePersona(categories, destination);
    
    return {
      persona: persona.name,
      confidence: persona.confidence,
      details: persona.details,
      categories: categories,
      destination: destination,
      keywords_found: persona.keywords_found
    };
  }

  // Analyser les catégories présentes dans le texte
  analyzeCategories(text) {
    const categories = {};
    
    Object.keys(this.nomadeKeywords).forEach(category => {
      const keywords = this.nomadeKeywords[category];
      const foundKeywords = keywords.filter(keyword => text.includes(keyword));
      
      if (foundKeywords.length > 0) {
        categories[category] = {
          present: true,
          keywords_found: foundKeywords,
          score: foundKeywords.length
        };
      } else {
        categories[category] = {
          present: false,
          keywords_found: [],
          score: 0
        };
      }
    });
    
    return categories;
  }

  // Détecter la destination asiatique
  detectDestination(text) {
    for (const [destination, keywords] of Object.entries(this.destinations)) {
      const foundKeywords = keywords.filter(keyword => text.includes(keyword));
      if (foundKeywords.length > 0) {
        return {
          name: destination,
          keywords_found: foundKeywords,
          confidence: foundKeywords.length / keywords.length
        };
      }
    }
    
    return {
      name: 'asie_generale',
      keywords_found: [],
      confidence: 0
    };
  }

  // Déterminer la persona principale
  determinePersona(categories, destination) {
    const scores = {
      'nomade_coliving_visa_asie': 0,
      'nomade_coliving_asie': 0,
      'nomade_visa_asie': 0,
      'nomade_budget_asie': 0,
      'nomade_general_asie': 0
    };
    
    // Calculer les scores pour chaque persona
    if (categories.digital_nomad.present && categories.coliving.present && categories.visa.present) {
      scores.nomade_coliving_visa_asie = 100;
    }
    
    if (categories.digital_nomad.present && categories.coliving.present) {
      scores.nomade_coliving_asie = 80;
    }
    
    if (categories.digital_nomad.present && categories.visa.present) {
      scores.nomade_visa_asie = 75;
    }
    
    if (categories.digital_nomad.present && categories.budget.present) {
      scores.nomade_budget_asie = 70;
    }
    
    if (categories.digital_nomad.present) {
      scores.nomade_general_asie = 60;
    }
    
    // Trouver la persona avec le score le plus élevé
    const bestPersona = Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b);
    
    if (bestPersona[1] === 0) {
      return {
        name: 'default',
        confidence: 0,
        details: 'Aucune persona nomade détectée',
        keywords_found: []
      };
    }
    
    return {
      name: bestPersona[0],
      confidence: bestPersona[1],
      details: this.getPersonaDescription(bestPersona[0]),
      keywords_found: this.getFoundKeywords(categories)
    };
  }

  // Obtenir la description d'une persona
  getPersonaDescription(persona) {
    const descriptions = {
      'nomade_coliving_visa_asie': 'Nomade numérique cherchant coliving + visa en Asie',
      'nomade_coliving_asie': 'Nomade numérique cherchant coliving en Asie',
      'nomade_visa_asie': 'Nomade numérique cherchant visa en Asie',
      'nomade_budget_asie': 'Nomade numérique avec budget limité en Asie',
      'nomade_general_asie': 'Nomade numérique général en Asie'
    };
    
    return descriptions[persona] || 'Persona inconnue';
  }

  // Obtenir les mots-clés trouvés
  getFoundKeywords(categories) {
    const found = [];
    Object.values(categories).forEach(category => {
      if (category.present) {
        found.push(...category.keywords_found);
      }
    });
    return [...new Set(found)]; // Supprimer les doublons
  }

  // Vérifier si un article correspond à une persona spécifique
  isNomadeArticle(article) {
    const detection = this.detectPersona(article);
    return detection.persona.startsWith('nomade_') && detection.confidence > 50;
  }

  // Obtenir les mots-clés de recherche pour une persona
  getSearchKeywords(persona) {
    const keywords = {
      'nomade_coliving_visa_asie': [
        'digital nomad coliving visa asie',
        'nomade numérique coliving visa asie',
        'visa coliving nomade asie'
      ],
      'nomade_coliving_asie': [
        'digital nomad coliving asie',
        'nomade numérique coliving asie',
        'coliving nomade asie'
      ],
      'nomade_visa_asie': [
        'digital nomad visa asie',
        'nomade numérique visa asie',
        'visa nomade asie'
      ],
      'nomade_budget_asie': [
        'digital nomad budget asie',
        'nomade numérique budget asie',
        'budget nomade asie'
      ]
    };
    
    return keywords[persona] || [];
  }
}

export default NomadePersonaDetector;
