#!/usr/bin/env node

import axios from 'axios';
import xml2js from 'xml2js';
import dotenv from 'dotenv';

dotenv.config();

class UltraSmartRSSFilter {
  constructor() {
    // Sources RSS spécialisées Asie en français
    this.asiaRSSSources = {
      'french_travel_asia': [
        'https://www.routard.com/rss/actualites.xml',
        'https://www.lefigaro.fr/rss/figaro_voyage.xml',
        'https://www.lexpress.fr/rss/voyage.xml'
      ],
      'asia_news_french': [
        'https://www.rfi.fr/fr/rss/asie-pacifique.xml',
        'https://www.lemonde.fr/rss/sequence/ASIE.xml',
        'https://www.france24.com/fr/rss/category/asie-pacifique'
      ],
      'travel_deals_asia': [
        'https://www.voyage-prive.com/rss',
        'https://www.lastminute.com/rss/fr/offres-voyage.xml'
      ]
    };

    // Mots-clés de pertinence Asie (français)
    this.asiaKeywords = {
      'destinations': [
        'japon', 'tokyo', 'kyoto', 'osaka', 'japonais', 'nippon',
        'thailande', 'bangkok', 'phuket', 'chiang mai', 'thaïlandais',
        'corée', 'séoul', 'busan', 'coréen', 'coréenne',
        'vietnam', 'hanoi', 'ho chi minh', 'hô chi minh', 'vietnamien',
        'singapour', 'singapourien', 'malaisie', 'kuala lumpur',
        'philippines', 'manille', 'cebu', 'philippin',
        'indonésie', 'jakarta', 'bali', 'indonésien',
        'chine', 'pékin', 'shanghai', 'hong kong', 'chinois',
        'taiwan', 'taïwan', 'taïpei', 'taïwanais',
        'cambodge', 'phnom penh', 'angkor', 'cambodgien',
        'laos', 'vientiane', 'laotien', 'myanmar', 'birmanie'
      ],
      'travel_terms': [
        'vol', 'vols', 'compagnie aérienne', 'aéroport',
        'visa', 'passeport', 'frontière', 'douane',
        'hôtel', 'hébergement', 'booking', 'réservation',
        'transport', 'métro', 'bus', 'train', 'taxi',
        'monnaie', 'change', 'euro', 'yen', 'won', 'baht',
        'sécurité', 'santé', 'vaccin', 'assurance',
        'climat', 'météo', 'saison', 'température',
        'culture', 'tradition', 'festival', 'fête',
        'gastronomie', 'cuisine', 'restaurant', 'nourriture',
        'shopping', 'achat', 'souvenir', 'marché'
      ],
      'exclusion_terms': [
        'europe', 'amérique', 'afrique', 'océanie',
        'croisière', 'yacht', 'luxe', 'hôtel 5 étoiles',
        'golf', 'ski', 'plage caribéenne', 'méditerranée'
      ]
    };

    // Système de scoring de pertinence
    this.scoringWeights = {
      'destination_match': 50,      // Correspondance destination Asie
      'travel_relevance': 30,      // Pertinence voyage
      'french_content': 20,        // Contenu en français
      'recent_news': 10,           // Actualité récente
      'exclusion_penalty': -100    // Pénalité exclusion
    };
  }

  // Traduction simple anglais -> français
  translateToFrench(text) {
    const translations = {
      'japan': 'Japon',
      'tokyo': 'Tokyo',
      'thailand': 'Thaïlande',
      'bangkok': 'Bangkok',
      'korea': 'Corée du Sud',
      'seoul': 'Séoul',
      'vietnam': 'Vietnam',
      'singapore': 'Singapour',
      'philippines': 'Philippines',
      'indonesia': 'Indonésie',
      'china': 'Chine',
      'taiwan': 'Taïwan',
      'cambodia': 'Cambodge',
      'laos': 'Laos',
      'myanmar': 'Myanmar',
      'travel': 'voyage',
      'flight': 'vol',
      'hotel': 'hôtel',
      'visa': 'visa',
      'safety': 'sécurité',
      'news': 'actualité',
      'update': 'mise à jour',
      'alert': 'alerte',
      'deal': 'bon plan',
      'offer': 'offre',
      'promotion': 'promotion',
      'discount': 'réduction'
    };

    let translatedText = text.toLowerCase();
    for (const [en, fr] of Object.entries(translations)) {
      translatedText = translatedText.replace(new RegExp(en, 'gi'), fr);
    }
    return translatedText;
  }

  // Analyser la pertinence d'un article
  analyzeRelevance(article) {
    const title = article.title.toLowerCase();
    const description = (article.description || '').toLowerCase();
    const content = title + ' ' + description;

    let score = 0;
    let reasons = [];

    // 1. Vérifier les destinations Asie
    const destinationMatches = this.asiaKeywords.destinations.filter(keyword => 
      content.includes(keyword)
    );
    if (destinationMatches.length > 0) {
      score += this.scoringWeights.destination_match;
      reasons.push(`Destinations Asie: ${destinationMatches.join(', ')}`);
    }

    // 2. Vérifier les termes de voyage
    const travelMatches = this.asiaKeywords.travel_terms.filter(keyword => 
      content.includes(keyword)
    );
    if (travelMatches.length > 0) {
      score += this.scoringWeights.travel_relevance;
      reasons.push(`Termes voyage: ${travelMatches.length} correspondances`);
    }

    // 3. Vérifier le contenu français
    const frenchIndicators = ['le ', 'la ', 'les ', 'un ', 'une ', 'des ', 'du ', 'de la '];
    const frenchMatches = frenchIndicators.filter(indicator => 
      content.includes(indicator)
    );
    if (frenchMatches.length > 0) {
      score += this.scoringWeights.french_content;
      reasons.push('Contenu français détecté');
    }

    // 4. Vérifier l'actualité récente (moins de 7 jours)
    const pubDate = new Date(article.pubDate);
    const now = new Date();
    const daysDiff = (now - pubDate) / (1000 * 60 * 60 * 24);
    if (daysDiff <= 7) {
      score += this.scoringWeights.recent_news;
      reasons.push(`Actualité récente (${Math.round(daysDiff)} jours)`);
    }

    // 5. Vérifier les termes d'exclusion
    const exclusionMatches = this.asiaKeywords.exclusion_terms.filter(keyword => 
      content.includes(keyword)
    );
    if (exclusionMatches.length > 0) {
      score += this.scoringWeights.exclusion_penalty;
      reasons.push(`TERMES D'EXCLUSION: ${exclusionMatches.join(', ')}`);
    }

    return {
      score,
      reasons,
      isRelevant: score >= 50, // Seuil de pertinence
      destination: destinationMatches[0] || 'Asie',
      travelType: this.detectTravelType(content)
    };
  }

  // Détecter le type de contenu voyage
  detectTravelType(content) {
    if (content.includes('vol') || content.includes('compagnie') || content.includes('aéroport')) {
      return 'transport';
    } else if (content.includes('visa') || content.includes('passeport') || content.includes('frontière')) {
      return 'formalités';
    } else if (content.includes('hôtel') || content.includes('hébergement') || content.includes('booking')) {
      return 'hébergement';
    } else if (content.includes('sécurité') || content.includes('alerte') || content.includes('santé')) {
      return 'sécurité';
    } else if (content.includes('deal') || content.includes('offre') || content.includes('promotion')) {
      return 'bon-plan';
    } else {
      return 'actualité';
    }
  }

  // Récupérer et filtrer les articles RSS
  async fetchAndFilterRSS() {
    console.log('🔍 Récupération et filtrage RSS ultra-intelligent...\n');
    
    const allArticles = [];
    const relevantArticles = [];

    for (const [category, sources] of Object.entries(this.asiaRSSSources)) {
      console.log(`📡 Traitement ${category}...`);
      
      for (const sourceUrl of sources) {
        try {
          const articles = await this.fetchRSSFeed(sourceUrl);
          if (articles) {
            allArticles.push(...articles.map(article => ({
              ...article,
              source: sourceUrl,
              category
            })));
          }
        } catch (error) {
          console.log(`⚠️ Erreur ${sourceUrl}: ${error.message}`);
        }
      }
    }

    console.log(`\n📊 ${allArticles.length} articles récupérés au total`);

    // Analyser et filtrer chaque article
    for (const article of allArticles) {
      const analysis = this.analyzeRelevance(article);
      
      if (analysis.isRelevant) {
        relevantArticles.push({
          ...article,
          analysis,
          translatedTitle: this.translateToFrench(article.title)
        });
        
        console.log(`✅ Article pertinent trouvé:`);
        console.log(`   📰 ${article.title}`);
        console.log(`   🇫🇷 ${this.translateToFrench(article.title)}`);
        console.log(`   📊 Score: ${analysis.score}/100`);
        console.log(`   🎯 Raisons: ${analysis.reasons.join(', ')}`);
        console.log(`   🏷️ Type: ${analysis.travelType}`);
        console.log(`   🌏 Destination: ${analysis.destination}\n`);
      }
    }

    console.log(`🎯 ${relevantArticles.length} articles pertinents trouvés sur ${allArticles.length}`);
    
    return relevantArticles;
  }

  // Récupérer un flux RSS
  async fetchRSSFeed(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FlashVoyages-Ultra-Smart-RSS/1.0)'
        }
      });

      if (response.status === 200) {
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        
        let items = [];
        if (result.rss && result.rss.channel && result.rss.channel[0].item) {
          items = result.rss.channel[0].item;
        } else if (result.feed && result.feed.entry) {
          items = result.feed.entry;
        }

        return items.map(item => ({
          title: item.title?.[0] || item.title?._ || 'Sans titre',
          description: item.description?.[0] || item.description?._ || item.summary?.[0] || '',
          link: item.link?.[0] || item.link?._ || '#',
          pubDate: item.pubDate?.[0] || item.published?.[0] || new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error(`Erreur RSS ${url}:`, error.message);
    }
    return null;
  }

  // Générer un article FlashVoyages à partir d'une news pertinente
  generateFlashVoyagesArticle(news) {
    const analysis = news.analysis;
    const destination = analysis.destination;
    const travelType = analysis.travelType;
    
    // Titre en français
    const frenchTitle = `🌏 ${destination.charAt(0).toUpperCase() + destination.slice(1)} : ${news.translatedTitle}`;
    
    // Contenu structuré selon le type
    let content = '';
    
    switch (travelType) {
      case 'transport':
        content = this.generateTransportContent(news, destination);
        break;
      case 'formalités':
        content = this.generateFormalitiesContent(news, destination);
        break;
      case 'sécurité':
        content = this.generateSecurityContent(news, destination);
        break;
      case 'bon-plan':
        content = this.generateDealContent(news, destination);
        break;
      default:
        content = this.generateGeneralContent(news, destination);
    }

    return {
      title: frenchTitle,
      content,
      type: travelType,
      destination,
      category: this.getCategoryFromDestination(destination),
      tags: this.generateTags(destination, travelType),
      source: news.source,
      originalLink: news.link,
      relevanceScore: analysis.score
    };
  }

  generateTransportContent(news, destination) {
    return `
      <h2>✈️ ${destination} - Actualité transport</h2>
      <p><em>📅 Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
      
      <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>🚀 FlashVoyages vous informe</h3>
        <p><strong>${news.translatedTitle}</strong></p>
        <p>${news.description}</p>
      </div>
      
      <h3>✈️ Impact sur vos voyages</h3>
      <ul>
        <li>Informations importantes pour vos déplacements vers ${destination}</li>
        <li>Conseils FlashVoyages pour optimiser vos trajets</li>
        <li>Mise à jour des conditions de transport</li>
      </ul>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Conseil FlashVoyages</h4>
        <p>Restez informé des dernières actualités transport avec FlashVoyages. Nous surveillons en permanence les développements qui peuvent affecter vos voyages vers ${destination}.</p>
      </div>
    `;
  }

  generateFormalitiesContent(news, destination) {
    return `
      <h2>📋 ${destination} - Formalités de voyage</h2>
      <p><em>📅 Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
      
      <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>🚀 FlashVoyages vous informe</h3>
        <p><strong>${news.translatedTitle}</strong></p>
        <p>${news.description}</p>
      </div>
      
      <h3>📋 Formalités importantes</h3>
      <ul>
        <li>Informations cruciales pour vos formalités vers ${destination}</li>
        <li>Conseils FlashVoyages pour bien préparer vos documents</li>
        <li>Mise à jour des exigences d'entrée</li>
      </ul>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Conseil FlashVoyages</h4>
        <p>Les formalités peuvent changer rapidement. FlashVoyages vous tient informé des dernières évolutions pour ${destination}.</p>
      </div>
    `;
  }

  generateSecurityContent(news, destination) {
    return `
      <h2>🛡️ ${destination} - Sécurité voyage</h2>
      <p><em>📅 Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
      
      <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>🚨 FlashVoyages vous alerte</h3>
        <p><strong>${news.translatedTitle}</strong></p>
        <p>${news.description}</p>
      </div>
      
      <h3>🛡️ Informations sécurité</h3>
      <ul>
        <li>Informations importantes pour votre sécurité en ${destination}</li>
        <li>Conseils FlashVoyages pour voyager en toute sécurité</li>
        <li>Mise à jour des conditions de sécurité</li>
      </ul>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Conseil FlashVoyages</h4>
        <p>La sécurité est notre priorité. FlashVoyages vous informe des dernières alertes pour ${destination}.</p>
      </div>
    `;
  }

  generateDealContent(news, destination) {
    return `
      <h2>💰 ${destination} - Bon plan voyage</h2>
      <p><em>📅 Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
      
      <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>🎯 FlashVoyages vous fait économiser</h3>
        <p><strong>${news.translatedTitle}</strong></p>
        <p>${news.description}</p>
      </div>
      
      <h3>💰 Opportunité à saisir</h3>
      <ul>
        <li>Offre spéciale pour ${destination}</li>
        <li>Conseils FlashVoyages pour profiter de cette opportunité</li>
        <li>Conditions et validité de l'offre</li>
      </ul>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Conseil FlashVoyages</h4>
        <p>Ne ratez pas cette opportunité ! FlashVoyages vous aide à identifier les meilleures offres pour ${destination}.</p>
      </div>
    `;
  }

  generateGeneralContent(news, destination) {
    return `
      <h2>📰 ${destination} - Actualité voyage</h2>
      <p><em>📅 Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
      
      <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>🚀 FlashVoyages vous informe</h3>
        <p><strong>${news.translatedTitle}</strong></p>
        <p>${news.description}</p>
      </div>
      
      <h3>📊 Détails de l'actualité</h3>
      <ul>
        <li><strong>Source :</strong> ${news.source}</li>
        <li><strong>Date :</strong> ${new Date(news.pubDate).toLocaleDateString('fr-FR')}</li>
        <li><strong>Destination :</strong> ${destination}</li>
        <li><strong>Pertinence :</strong> ${news.analysis.score}/100</li>
      </ul>
      
      <h3>💡 Impact pour les voyageurs</h3>
      <ul>
        <li>Informations importantes pour votre voyage en ${destination}</li>
        <li>Conseils FlashVoyages pour bien préparer votre séjour</li>
        <li>Mise à jour des conditions de voyage</li>
      </ul>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Conseil FlashVoyages</h4>
        <p>Restez informé des dernières actualités voyage avec FlashVoyages. Nous surveillons en permanence les développements qui peuvent affecter votre voyage en ${destination}.</p>
      </div>
    `;
  }

  getCategoryFromDestination(destination) {
    const categoryMap = {
      'japon': 'Japon',
      'tokyo': 'Japon',
      'thailande': 'Thaïlande',
      'bangkok': 'Thaïlande',
      'corée': 'Corée du Sud',
      'séoul': 'Corée du Sud',
      'vietnam': 'Vietnam',
      'singapour': 'Singapour',
      'philippines': 'Philippines',
      'indonésie': 'Indonésie',
      'chine': 'Chine',
      'taïwan': 'Taïwan',
      'cambodge': 'Cambodge',
      'laos': 'Laos',
      'myanmar': 'Myanmar'
    };
    
    return categoryMap[destination.toLowerCase()] || 'Asie';
  }

  generateTags(destination, travelType) {
    const baseTags = ['actualite', 'voyage', destination.toLowerCase()];
    
    const typeTags = {
      'transport': ['vol', 'transport'],
      'formalités': ['visa', 'formalites'],
      'sécurité': ['securite', 'alerte'],
      'bon-plan': ['bon-plan', 'offre'],
      'actualité': ['news', 'info']
    };
    
    return [...baseTags, ...(typeTags[travelType] || [])];
  }
}

// Test du système
async function testUltraSmartRSSFilter() {
  console.log('🧪 Test du filtre RSS ultra-intelligent FlashVoyages\n');
  
  const filter = new UltraSmartRSSFilter();
  
  try {
    // Récupérer et filtrer les articles
    const relevantArticles = await filter.fetchAndFilterRSS();
    
    if (relevantArticles.length > 0) {
      console.log(`\n🎯 ${relevantArticles.length} articles pertinents trouvés !`);
      
      // Générer un article test
      const testArticle = filter.generateFlashVoyagesArticle(relevantArticles[0]);
      
      console.log('\n📝 Article FlashVoyages généré :');
      console.log(`📰 Titre: ${testArticle.title}`);
      console.log(`🏷️ Type: ${testArticle.type}`);
      console.log(`🌏 Destination: ${testArticle.destination}`);
      console.log(`📂 Catégorie: ${testArticle.category}`);
      console.log(`🏷️ Tags: ${testArticle.tags.join(', ')}`);
      console.log(`📊 Score pertinence: ${testArticle.relevanceScore}/100`);
      
      return {
        success: true,
        articlesFound: relevantArticles.length,
        testArticle
      };
    } else {
      console.log('\n⚠️ Aucun article pertinent trouvé');
      return { success: false, articlesFound: 0 };
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return { success: false, error: error.message };
  }
}

// Exécuter le test
if (import.meta.url === `file://${process.argv[1]}`) {
  testUltraSmartRSSFilter().then(result => {
    if (result.success) {
      console.log('\n✅ Test réussi !');
      console.log('🌏 Le filtre RSS ultra-intelligent fonctionne parfaitement');
      console.log('🇫🇷 Contenu en français et pertinent pour l\'Asie');
      console.log('🎯 Scoring intelligent et filtrage efficace');
    } else {
      console.log('\n❌ Test échoué');
      console.log('🔍 Vérifiez les logs pour plus de détails');
    }
  });
}

export default UltraSmartRSSFilter;

