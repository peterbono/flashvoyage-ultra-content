#!/usr/bin/env node

/**
 * ANALYSEUR DE LIENS CONTEXTUELS
 * Détecte automatiquement les opportunités de liens dans le contenu
 */

class ContextualLinksAnalyzer {
  constructor() {
    // Articles internes FlashVoyages (Priorité 1)
    this.internalArticles = {
      'Bali': '/bali-guide-nomade-digital',
      'Jakarta': '/jakarta-guide-nomade-digital',
      'Yogyakarta': '/yogyakarta-guide-nomade-digital',
      'Bandung': '/bandung-guide-nomade-digital',
      'Surabaya': '/surabaya-guide-nomade-digital',
      'Indonésie': '/indonesie-guide-nomade-digital',
      'Thaïlande': '/thailande-guide-nomade-digital',
      'Vietnam': '/vietnam-guide-nomade-digital',
      'Dojo Bali': '/coliving-dojo-bali-guide-complet',
      'Outpost': '/outpost-coliving-bali',
      'Selina': '/selina-coliving-bali'
    };

    // Sites officiels des compagnies (Priorité 2)
    this.officialWebsites = {
      'Telkomsel': 'https://www.telkomsel.com',
      'Indosat': 'https://www.indosatooredoo.com',
      'XL': 'https://www.xl.co.id',
      'Tri': 'https://www.tri.co.id',
      'Smartfren': 'https://www.smartfren.com',
      'Gojek': 'https://www.gojek.com',
      'Grab': 'https://www.grab.com',
      'Blue Bird': 'https://www.bluebirdgroup.com',
      'Transjakarta': 'https://transjakarta.co.id',
      'KRL': 'https://www.krl.co.id',
      'Aviasales': 'https://aviasales.com',
      'Hotellook': 'https://hotellook.com',
      'Booking': 'https://booking.com',
      'Agoda': 'https://agoda.com',
      'Airbnb': 'https://airbnb.com'
    };

    // Liens Travelpayouts génériques (Priorité 3)
    this.travelpayoutsLinks = {
      'vols': 'https://aviasales.com',
      'vol': 'https://aviasales.com',
      'avion': 'https://aviasales.com',
      'compagnie': 'https://aviasales.com',
      'aérien': 'https://aviasales.com',
      'billet': 'https://aviasales.com',
      'réservation': 'https://aviasales.com',
      'réserver': 'https://aviasales.com',
      'hébergement': 'https://hotellook.com',
      'hôtel': 'https://hotellook.com',
      'auberge': 'https://hotellook.com',
      'logement': 'https://hotellook.com',
      'chambre': 'https://hotellook.com',
      'appartement': 'https://hotellook.com',
      'location': 'https://hotellook.com',
      'dormir': 'https://hotellook.com',
      'nuitée': 'https://hotellook.com',
      'SIM': 'https://sim-card.com',
      'sim': 'https://sim-card.com',
      'téléphone': 'https://sim-card.com',
      'communication': 'https://sim-card.com',
      'internet': 'https://sim-card.com',
      'données': 'https://sim-card.com',
      'mobile': 'https://sim-card.com',
      'réseau': 'https://sim-card.com',
      'budget': 'https://travelpayouts.com',
      'coût': 'https://travelpayouts.com',
      'prix': 'https://travelpayouts.com',
      'argent': 'https://travelpayouts.com',
      'dépenses': 'https://travelpayouts.com',
      'économiser': 'https://travelpayouts.com',
      'transport': 'https://transport.com',
      'bus': 'https://transport.com',
      'train': 'https://transport.com',
      'métro': 'https://transport.com',
      'taxi': 'https://transport.com',
      'moto': 'https://transport.com',
      'vélo': 'https://transport.com',
      'déplacement': 'https://transport.com'
    };

    this.color = '#dc2626';
  }

  /**
   * ANALYSER LE CONTENU POUR DÉTECTER LES OPPORTUNITÉS DE LIENS
   */
  analyzeContent(content) {
    console.log('🔍 ANALYSE DU CONTENU POUR LES LIENS CONTEXTUELS');
    console.log('================================================\n');

    const opportunities = [];
    const contentLower = content.toLowerCase();

    // 1. Détecter les mots-clés dans le contenu
    const allKeywords = [
      ...Object.keys(this.internalArticles),
      ...Object.keys(this.officialWebsites),
      ...Object.keys(this.travelpayoutsLinks)
    ];

    const foundKeywords = this.findKeywordMatches(contentLower, allKeywords);
    
    if (foundKeywords.length > 0) {
      foundKeywords.forEach(keyword => {
        const linkInfo = this.getBestLink(keyword);
        if (linkInfo) {
          opportunities.push({
            keyword: keyword,
            url: linkInfo.url,
            type: linkInfo.type,
            isInternal: linkInfo.isInternal,
            context: this.extractContext(content, keyword)
          });
          
          console.log(`✅ ${keyword.toUpperCase()}: ${linkInfo.type}`);
          console.log(`   - URL: ${linkInfo.url}`);
          console.log(`   - Type: ${linkInfo.type}`);
        }
      });
    }

    console.log(`\n📊 RÉSULTAT: ${opportunities.length} opportunités détectées`);
    return opportunities;
  }

  /**
   * DÉTERMINER LE MEILLEUR LIEN SELON LA PRIORITÉ
   */
  getBestLink(keyword) {
    // Priorité 1: Article interne FlashVoyages
    if (this.internalArticles[keyword]) {
      return {
        url: this.internalArticles[keyword],
        type: 'Article interne',
        isInternal: true
      };
    }

    // Priorité 2: Site officiel de la compagnie
    if (this.officialWebsites[keyword]) {
      return {
        url: this.officialWebsites[keyword],
        type: 'Site officiel',
        isInternal: false
      };
    }

    // Priorité 3: Lien Travelpayouts générique
    if (this.travelpayoutsLinks[keyword]) {
      return {
        url: this.travelpayoutsLinks[keyword],
        type: 'Travelpayouts',
        isInternal: false
      };
    }

    return null;
  }

  /**
   * TROUVER LES MATCHES DE MOTS-CLÉS
   */
  findKeywordMatches(content, keywords) {
    const matches = [];
    
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const found = content.match(regex);
      if (found) {
        matches.push(keyword);
      }
    });
    
    return matches;
  }

  /**
   * EXTRAIRE LE CONTEXTE AUTOUR D'UN MATCH
   */
  extractContext(content, keyword) {
    const index = content.toLowerCase().indexOf(keyword);
    if (index === -1) return '';
    
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + keyword.length + 50);
    
    return content.substring(start, end).trim();
  }

  /**
   * GÉNÉRER LES LIENS CONTEXTUELS
   */
  generateContextualLinks(opportunities) {
    console.log('\n🔗 GÉNÉRATION DES LIENS CONTEXTUELS');
    console.log('====================================\n');

    const links = [];
    
    opportunities.forEach(opportunity => {
      const target = opportunity.isInternal ? '_self' : '_blank';
      const link = `<a href="${opportunity.url}" target="${target}" rel="noopener" style="color: ${this.color}; text-decoration: underline;">${opportunity.keyword}</a>`;
      
      links.push({
        keyword: opportunity.keyword,
        link: link,
        type: opportunity.type,
        isInternal: opportunity.isInternal,
        context: opportunity.context
      });
      
      console.log(`✅ ${opportunity.keyword}: ${opportunity.type}`);
      console.log(`   - ${opportunity.isInternal ? 'Lien interne' : 'Lien externe'}`);
    });

    return links;
  }

  /**
   * INTÉGRER LES LIENS DANS LE CONTENU
   */
  integrateLinks(content, opportunities) {
    console.log('\n🔗 INTÉGRATION DES LIENS DANS LE CONTENU');
    console.log('========================================\n');

    let updatedContent = content;
    let linksAdded = 0;

    opportunities.forEach(opportunity => {
      const target = opportunity.isInternal ? '_self' : '_blank';
      const linkWithKeyword = `<a href="${opportunity.url}" target="${target}" rel="noopener" style="color: ${this.color}; text-decoration: underline;">${opportunity.keyword}</a>`;
      
      if (updatedContent.toLowerCase().includes(opportunity.keyword.toLowerCase())) {
        updatedContent = updatedContent.replace(
          new RegExp(`\\b${opportunity.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
          linkWithKeyword
        );
        linksAdded++;
        console.log(`✅ "${opportunity.keyword}" → ${opportunity.type}`);
      }
    });

    console.log(`\n📊 RÉSULTAT: ${linksAdded} liens intégrés`);
    return updatedContent;
  }

  /**
   * ANALYSER UN ARTICLE COMPLET
   */
  analyzeArticle(articleContent) {
    console.log('📰 ANALYSE D\'UN ARTICLE COMPLET');
    console.log('===============================\n');

    // 1. Analyser les opportunités
    const opportunities = this.analyzeContent(articleContent);
    
    if (opportunities.length === 0) {
      console.log('ℹ️ Aucune opportunité de lien détectée');
      return {
        opportunities: [],
        links: [],
        updatedContent: articleContent
      };
    }

    // 2. Générer les liens
    const links = this.generateContextualLinks(opportunities);
    
    // 3. Intégrer dans le contenu
    const updatedContent = this.integrateLinks(articleContent, opportunities);

    return {
      opportunities: opportunities,
      links: links,
      updatedContent: updatedContent
    };
  }
}

// Export pour utilisation
export default ContextualLinksAnalyzer;

// Test si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new ContextualLinksAnalyzer();
  
  // Test avec un contenu d'exemple
  const testContent = `
    J'ai réservé mes vols pour l'Indonésie via une compagnie locale.
    L'hébergement était excellent dans cet hôtel de Jakarta.
    J'ai utilisé Telkomsel pour internet en Indonésie.
    J'ai séjourné au Dojo Bali pendant 2 mois.
    Pour me déplacer, j'utilisais Gojek et Grab.
    Le budget total était de 2000€ pour 3 mois.
    Le transport local était très pratique avec les bus.
  `;
  
  console.log('🧪 TEST DE L\'ANALYSEUR');
  console.log('======================\n');
  
  const result = analyzer.analyzeArticle(testContent);
  
  console.log('\n🎯 RÉSULTAT FINAL:');
  console.log('==================');
  console.log(`Opportunités détectées: ${result.opportunities.length}`);
  console.log(`Liens générés: ${result.links.length}`);
  console.log(`Contenu mis à jour: ${result.updatedContent !== testContent ? 'Oui' : 'Non'}`);
}
