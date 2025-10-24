/**
 * PARTENAIRES NOMADES DIGITAUX EN ASIE
 * Liens externes vers des services typiques utilisés par les nomades
 */

export const NOMAD_PARTNERS_LINKS = {
  // ===== HÉBERGEMENT & COLIVING =====
  accommodation: {
    coliving: {
      name: "Coliving.com",
      url: "https://coliving.com",
      description: "Plateforme de coliving pour nomades digitaux",
      context: "Articles sur logement, coliving, communauté nomade"
    },
    outsite: {
      name: "Outsite",
      url: "https://outsite.co",
      description: "Coliving spaces pour nomades digitaux",
      context: "Articles sur coliving, espaces de travail, communauté"
    },
    selina: {
      name: "Selina",
      url: "https://selina.com",
      description: "Hôtels et coliving pour nomades",
      context: "Articles sur hébergement nomade, communauté"
    },
    nomadlist: {
      name: "Nomad List",
      url: "https://nomadlist.com",
      description: "Base de données des villes nomades",
      context: "Articles sur destinations nomades, coût de la vie"
    }
  },

  // ===== BUDGET & FINANCE =====
  budget: {
    wise: {
      name: "Wise (ex-TransferWise)",
      url: "https://wise.com",
      description: "Compte multi-devises pour nomades",
      context: "Articles sur budget, finance, transferts d'argent"
    },
    revolut: {
      name: "Revolut",
      url: "https://revolut.com",
      description: "Banque digitale pour nomades",
      context: "Articles sur finance nomade, gestion d'argent"
    },
    n26: {
      name: "N26",
      url: "https://n26.com",
      description: "Banque mobile européenne",
      context: "Articles sur comptes bancaires nomades"
    },
    crypto: {
      name: "Binance",
      url: "https://binance.com",
      description: "Plateforme crypto pour nomades",
      context: "Articles sur crypto, finance décentralisée"
    }
  },

  // ===== ASSURANCE NOMADE =====
  insurance: {
    safetywing: {
      name: "SafetyWing",
      url: "https://safetywing.com",
      description: "Assurance santé pour nomades digitaux",
      context: "Articles sur assurance nomade, santé, protection"
    },
    worldnomads: {
      name: "World Nomads",
      url: "https://worldnomads.com",
      description: "Assurance voyage pour nomades",
      context: "Articles sur assurance voyage, protection nomade"
    },
    insubuy: {
      name: "Insubuy",
      url: "https://insubuy.com",
      description: "Assurance voyage internationale",
      context: "Articles sur assurance voyage, protection"
    },
    nomadinsurance: {
      name: "Nomad Insurance",
      url: "https://nomadinsurance.com",
      description: "Assurance spécialisée nomades",
      context: "Articles sur assurance nomade, protection santé"
    }
  },

  // ===== COWORKING =====
  coworking: {
    wework: {
      name: "WeWork",
      url: "https://wework.com",
      description: "Espaces de coworking globaux",
      context: "Articles sur coworking, espaces de travail"
    },
    regus: {
      name: "Regus",
      url: "https://regus.com",
      description: "Espaces de travail flexibles",
      context: "Articles sur coworking, bureaux nomades"
    },
    croissant: {
      name: "Croissant",
      url: "https://croissant.com",
      description: "Réseau de coworking à la demande",
      context: "Articles sur coworking flexible, espaces de travail"
    }
  }
};

/**
 * Générateur de liens externes contextuels
 */
export class NomadPartnersLinkGenerator {
  constructor() {
    this.partners = NOMAD_PARTNERS_LINKS;
  }

  /**
   * Génère un lien externe selon le contexte
   */
  generateContextualLink(content, context) {
    const text = content.toLowerCase();
    
    // VÉRIFICATION CONTEXTUELLE INTELLIGENTE
    // Si le contenu parle de 'familles avec enfants' → Assurance famille, pas crypto/coliving
    if (text.includes('voyager avec des enfants') || 
        (text.includes('famille') && text.includes('enfant'))) {
      return this.getInsuranceLink(); // Assurance pour familles
    }
    
    // Si le contenu parle de 'coliving' → Liens coliving, pas hôtels
    if (text.includes('coliving') || text.includes('coworking')) {
      return this.getAccommodationLink(); // Coliving approprié
    }
    
    // Détection des mots-clés
    if (this.hasAccommodationKeywords(text)) {
      return this.getAccommodationLink();
    }
    
    if (this.hasBudgetKeywords(text)) {
      return this.getBudgetLink();
    }
    
    if (this.hasInsuranceKeywords(text)) {
      return this.getInsuranceLink();
    }
    
    if (this.hasCoworkingKeywords(text)) {
      return this.getCoworkingLink();
    }
    
    // Fallback vers hébergement
    return this.getAccommodationLink();
  }

  /**
   * Détecte les mots-clés d'hébergement
   */
  hasAccommodationKeywords(text) {
    const keywords = [
      'coliving', 'coworking', 'hébergement', 'logement', 'appartement',
      'chambre', 'studio', 'airbnb', 'booking', 'hostel', 'auberge'
    ];
    // Éviter les faux positifs
    const excludeKeywords = ['mineur', 'enfant', 'famille'];
    if (excludeKeywords.some(keyword => text.includes(keyword))) {
      return false;
    }
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * Détecte les mots-clés de budget
   */
  hasBudgetKeywords(text) {
    const keywords = [
      'budget', 'coût', 'prix', 'argent', 'finance', 'banque',
      'compte', 'carte', 'crypto', 'bitcoin', 'euro', 'dollar'
    ];
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * Détecte les mots-clés d'assurance
   */
  hasInsuranceKeywords(text) {
    const keywords = [
      'assurance', 'santé', 'médical', 'protection', 'sécurité',
      'risque', 'couverture', 'mutuelle', 'sécurité sociale'
    ];
    // Priorité pour les familles avec enfants
    const familyKeywords = ['mineur', 'enfant', 'famille'];
    if (familyKeywords.some(keyword => text.includes(keyword))) {
      return true;
    }
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * Détecte les mots-clés de coworking
   */
  hasCoworkingKeywords(text) {
    const keywords = [
      'coworking', 'espace de travail', 'bureau', 'télétravail',
      'remote work', 'workspace', 'open space'
    ];
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * Retourne un lien d'hébergement
   */
  getAccommodationLink() {
    const partners = Object.values(this.partners.accommodation);
    const randomPartner = partners[Math.floor(Math.random() * partners.length)];
    
    return {
      type: 'accommodation',
      name: randomPartner.name,
      url: randomPartner.url,
      description: randomPartner.description,
      context: randomPartner.context
    };
  }

  /**
   * Retourne un lien de budget
   */
  getBudgetLink() {
    const partners = Object.values(this.partners.budget);
    const randomPartner = partners[Math.floor(Math.random() * partners.length)];
    
    return {
      type: 'budget',
      name: randomPartner.name,
      url: randomPartner.url,
      description: randomPartner.description,
      context: randomPartner.context
    };
  }

  /**
   * Retourne un lien d'assurance
   */
  getInsuranceLink() {
    const partners = Object.values(this.partners.insurance);
    const randomPartner = partners[Math.floor(Math.random() * partners.length)];
    
    return {
      type: 'insurance',
      name: randomPartner.name,
      url: randomPartner.url,
      description: randomPartner.description,
      context: randomPartner.context
    };
  }

  /**
   * Retourne un lien de coworking
   */
  getCoworkingLink() {
    const partners = Object.values(this.partners.coworking);
    const randomPartner = partners[Math.floor(Math.random() * partners.length)];
    
    return {
      type: 'coworking',
      name: randomPartner.name,
      url: randomPartner.url,
      description: randomPartner.description,
      context: randomPartner.context
    };
  }
}

export default NomadPartnersLinkGenerator;
