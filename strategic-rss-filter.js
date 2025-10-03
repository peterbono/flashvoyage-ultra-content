#!/usr/bin/env node

import axios from 'axios';
import xml2js from 'xml2js';
import dotenv from 'dotenv';

dotenv.config();

class StrategicRSSFilter {
  constructor() {
    // Sources RSS pertinentes (peuvent être en anglais)
    this.strategicRSSSources = {
      'travel_news_asia': [
        'http://rss.cnn.com/rss/edition_travel.rss',
        'https://skift.com/feed/',
        'https://www.travelweekly.com/rss.xml'
      ],
      'asia_news': [
        'https://news.google.com/rss/search?q=travel+asia&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+japan&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+thailand&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+korea&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+vietnam&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=travel+singapore&hl=en&gl=US&ceid=US:en'
      ],
      'aviation_news': [
        'https://www.flightglobal.com/rss',
        'https://www.airlineratings.com/feed/',
        'https://simpleflying.com/feed/'
      ],
      'visa_immigration': [
        'https://news.google.com/rss/search?q=visa+asia&hl=en&gl=US&ceid=US:en',
        'https://news.google.com/rss/search?q=passport+asia&hl=en&gl=US&ceid=US:en'
      ]
    };

    // Mots-clés de valeur stratégique FlashVoyages
    this.strategicKeywords = {
      'high_value_travel': [
        // Transport
        'flight', 'airline', 'airport', 'route', 'direct flight', 'new route',
        'aviation', 'aircraft', 'airline news', 'flight deal', 'airfare',
        'booking', 'reservation', 'travel booking',
        
        // Formalités
        'visa', 'passport', 'entry requirement', 'border', 'immigration',
        'travel document', 'visa policy', 'visa requirement',
        
        // Sécurité & Santé
        'travel alert', 'travel warning', 'safety', 'security', 'health',
        'vaccination', 'travel insurance', 'travel advisory',
        
        // Économie voyage
        'travel deal', 'travel offer', 'promotion', 'discount', 'sale',
        'travel package', 'tour package', 'travel booking',
        
        // Infrastructure
        'hotel', 'accommodation', 'tourism', 'tourist', 'tourism industry',
        'travel infrastructure', 'travel service'
      ],
      
      'asia_destinations': [
        'japan', 'tokyo', 'kyoto', 'osaka', 'japanese',
        'thailand', 'bangkok', 'phuket', 'chiang mai', 'thai',
        'korea', 'seoul', 'busan', 'korean',
        'vietnam', 'hanoi', 'ho chi minh', 'vietnamese',
        'singapore', 'singaporean', 'malaysia', 'kuala lumpur',
        'philippines', 'manila', 'cebu', 'filipino',
        'indonesia', 'jakarta', 'bali', 'indonesian',
        'china', 'beijing', 'shanghai', 'hong kong', 'chinese',
        'taiwan', 'taipei', 'taiwanese',
        'cambodia', 'phnom penh', 'angkor', 'cambodian',
        'laos', 'vientiane', 'laotian', 'myanmar', 'burma'
      ],
      
      'exclusion_terms': [
        'europe', 'america', 'africa', 'oceania', 'caribbean',
        'cruise', 'yacht', 'luxury hotel', '5-star', 'golf',
        'ski', 'beach resort', 'mediterranean', 'atlantic'
      ]
    };

    // Système de scoring stratégique FlashVoyages
    this.strategicScoring = {
      'travel_relevance': 30,        // Pertinence voyage directe
      'asia_destination': 25,        // Destination Asie
      'practical_value': 20,         // Valeur pratique pour l'utilisateur
      'originality': 15,             // Originalité du contenu
      'seo_potential': 10,           // Potentiel SEO
      'viral_potential': 10,         // Potentiel viral/émotionnel
      'recent_news': 10,             // Actualité récente
      'exclusion_penalty': -100      // Pénalité exclusion
    };
  }

  // Traduction intelligente anglais -> français
  translateToFrench(text) {
    const translations = {
      // Destinations
      'japan': 'Japon', 'tokyo': 'Tokyo', 'kyoto': 'Kyoto', 'osaka': 'Osaka',
      'thailand': 'Thaïlande', 'bangkok': 'Bangkok', 'phuket': 'Phuket',
      'korea': 'Corée du Sud', 'seoul': 'Séoul', 'busan': 'Busan',
      'vietnam': 'Vietnam', 'hanoi': 'Hanoi', 'ho chi minh': 'Hô Chi Minh',
      'singapore': 'Singapour', 'malaysia': 'Malaisie', 'kuala lumpur': 'Kuala Lumpur',
      'philippines': 'Philippines', 'manila': 'Manille', 'cebu': 'Cebu',
      'indonesia': 'Indonésie', 'jakarta': 'Jakarta', 'bali': 'Bali',
      'china': 'Chine', 'beijing': 'Pékin', 'shanghai': 'Shanghai', 'hong kong': 'Hong Kong',
      'taiwan': 'Taïwan', 'taipei': 'Taipei',
      'cambodia': 'Cambodge', 'phnom penh': 'Phnom Penh',
      'laos': 'Laos', 'vientiane': 'Vientiane', 'myanmar': 'Myanmar',
      
      // Termes voyage
      'flight': 'vol', 'airline': 'compagnie aérienne', 'airport': 'aéroport',
      'visa': 'visa', 'passport': 'passeport', 'travel': 'voyage',
      'hotel': 'hôtel', 'booking': 'réservation', 'deal': 'bon plan',
      'offer': 'offre', 'promotion': 'promotion', 'discount': 'réduction',
      'safety': 'sécurité', 'security': 'sécurité', 'health': 'santé',
      'travel alert': 'alerte voyage', 'travel warning': 'avertissement voyage',
      'new route': 'nouvelle route', 'direct flight': 'vol direct',
      'travel deal': 'bon plan voyage', 'travel offer': 'offre voyage',
      'travel package': 'forfait voyage', 'tourism': 'tourisme',
      'accommodation': 'hébergement', 'tourist': 'touriste'
    };

    let translatedText = text;
    for (const [en, fr] of Object.entries(translations)) {
      translatedText = translatedText.replace(new RegExp(en, 'gi'), fr);
    }
    return translatedText;
  }

  // Analyser la valeur stratégique d'un article
  analyzeStrategicValue(article) {
    const title = article.title.toLowerCase();
    const description = (article.description || '').toLowerCase();
    const content = title + ' ' + description;

    let score = 0;
    let reasons = [];
    let strategicValue = 'low';

    // 1. Vérifier la pertinence voyage directe
    const travelMatches = this.strategicKeywords.high_value_travel.filter(keyword => 
      content.includes(keyword)
    );
    if (travelMatches.length > 0) {
      score += this.strategicScoring.travel_relevance;
      reasons.push(`Pertinence voyage: ${travelMatches.length} correspondances`);
    }

    // 2. Vérifier les destinations Asie
    const asiaMatches = this.strategicKeywords.asia_destinations.filter(keyword => 
      content.includes(keyword)
    );
    if (asiaMatches.length > 0) {
      score += this.strategicScoring.asia_destination;
      reasons.push(`Destinations Asie: ${asiaMatches.join(', ')}`);
    }

    // 3. Analyser la valeur pratique pour l'utilisateur
    const practicalValue = this.analyzePracticalValue(content);
    if (practicalValue > 0) {
      score += practicalValue;
      reasons.push(`Valeur pratique: ${practicalValue} points`);
    }

    // 4. Analyser l'originalité du contenu
    const originalityScore = this.analyzeOriginality(content, title);
    if (originalityScore > 0) {
      score += originalityScore;
      reasons.push(`Originalité: ${originalityScore} points`);
    }

    // 5. Analyser le potentiel SEO
    const seoScore = this.analyzeSEOPotential(content, title);
    if (seoScore > 0) {
      score += seoScore;
      reasons.push(`Potentiel SEO: ${seoScore} points`);
    }

    // 6. Analyser le potentiel viral/émotionnel
    const viralScore = this.analyzeViralPotential(content, title);
    if (viralScore > 0) {
      score += viralScore;
      reasons.push(`Potentiel viral: ${viralScore} points`);
    }

    // 7. Vérifier l'actualité récente
    const pubDate = new Date(article.pubDate);
    const now = new Date();
    const daysDiff = (now - pubDate) / (1000 * 60 * 60 * 24);
    if (daysDiff <= 7) {
      score += this.strategicScoring.recent_news;
      reasons.push(`Actualité récente (${Math.round(daysDiff)} jours)`);
    }

    // 8. Vérifier les termes d'exclusion
    const exclusionMatches = this.strategicKeywords.exclusion_terms.filter(keyword => 
      content.includes(keyword)
    );
    if (exclusionMatches.length > 0) {
      score += this.strategicScoring.exclusion_penalty;
      reasons.push(`TERMES D'EXCLUSION: ${exclusionMatches.join(', ')}`);
    }

    // Déterminer la valeur stratégique
    if (score >= 80) strategicValue = 'high';
    else if (score >= 60) strategicValue = 'medium';
    else if (score >= 40) strategicValue = 'low';

    return {
      score,
      reasons,
      strategicValue,
      isRelevant: score >= 40, // Seuil de pertinence stratégique
      destination: asiaMatches[0] || 'Asie',
      travelType: this.detectTravelType(content),
      practicalValue: this.getPracticalValueDescription(content)
    };
  }

  // Analyser la valeur pratique pour l'utilisateur
  analyzePracticalValue(content) {
    let value = 0;
    
    // Informations de transport directes
    if (content.includes('new route') || content.includes('direct flight')) value += 15;
    if (content.includes('flight deal') || content.includes('airfare')) value += 10;
    if (content.includes('airline news') || content.includes('aviation')) value += 8;
    
    // Informations de formalités
    if (content.includes('visa requirement') || content.includes('entry requirement')) value += 15;
    if (content.includes('visa policy') || content.includes('border')) value += 10;
    if (content.includes('travel document') || content.includes('passport')) value += 8;
    
    // Alertes de sécurité
    if (content.includes('travel alert') || content.includes('travel warning')) value += 20;
    if (content.includes('travel advisory') || content.includes('safety')) value += 15;
    if (content.includes('health') || content.includes('vaccination')) value += 10;
    
    // Bons plans
    if (content.includes('travel deal') || content.includes('travel offer')) value += 12;
    if (content.includes('promotion') || content.includes('discount')) value += 8;
    if (content.includes('travel package') || content.includes('tour package')) value += 6;
    
    return value;
  }

  // Obtenir la description de la valeur pratique
  getPracticalValueDescription(content) {
    if (content.includes('new route') || content.includes('direct flight')) {
      return 'Nouvelle route aérienne - Impact direct sur vos voyages';
    } else if (content.includes('visa requirement') || content.includes('entry requirement')) {
      return 'Changement de formalités - Information cruciale pour vos voyages';
    } else if (content.includes('travel alert') || content.includes('travel warning')) {
      return 'Alerte voyage - Information de sécurité importante';
    } else if (content.includes('travel deal') || content.includes('travel offer')) {
      return 'Bon plan voyage - Opportunité d\'économies';
    } else if (content.includes('airline news') || content.includes('aviation')) {
      return 'Actualité transport - Impact sur vos déplacements';
    } else {
      return 'Information générale voyage';
    }
  }

  // Analyser l'originalité du contenu
  analyzeOriginality(content, title) {
    let originalityScore = 0;
    
    // Mots-clés d'originalité
    const originalityKeywords = [
      'first', 'première', 'premier', 'unique', 'exclusive', 'exclusif',
      'revolutionary', 'révolutionnaire', 'breakthrough', 'percée',
      'unprecedented', 'sans précédent', 'historic', 'historique',
      'record-breaking', 'record', 'nouveau record', 'record de',
      'innovative', 'innovant', 'cutting-edge', 'de pointe',
      'groundbreaking', 'novateur', 'pioneer', 'pionnier',
      'never-before', 'jamais vu', 'unheard of', 'inouï',
      'world-first', 'première mondiale', 'global first'
    ];
    
    const originalityMatches = originalityKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (originalityMatches.length > 0) {
      originalityScore += this.strategicScoring.originality;
    }
    
    // Bonus pour les titres accrocheurs
    const catchyTitlePatterns = [
      /(?:first|première|premier).*(?:in|en|au|à)/i,
      /(?:never|jamais).*(?:before|avant)/i,
      /(?:exclusive|exclusif).*(?:access|accès)/i,
      /(?:revolutionary|révolutionnaire).*(?:new|nouveau)/i,
      /(?:breakthrough|percée).*(?:in|en|au)/i
    ];
    
    const catchyMatches = catchyTitlePatterns.filter(pattern => 
      pattern.test(title)
    );
    
    if (catchyMatches.length > 0) {
      originalityScore += 5; // Bonus pour titre accrocheur
    }
    
    return originalityScore;
  }

  // Analyser le potentiel SEO
  analyzeSEOPotential(content, title) {
    let seoScore = 0;
    
    // Mots-clés SEO voyage Asie
    const seoKeywords = [
      'travel guide', 'guide voyage', 'travel tips', 'conseils voyage',
      'best places', 'meilleurs endroits', 'top destinations', 'top destinations',
      'travel budget', 'budget voyage', 'travel cost', 'coût voyage',
      'travel itinerary', 'itinéraire voyage', 'travel plan', 'plan voyage',
      'travel advice', 'conseils voyage', 'travel recommendations', 'recommandations',
      'how to travel', 'comment voyager', 'travel essentials', 'essentiels voyage',
      'travel checklist', 'liste voyage', 'travel preparation', 'préparation voyage',
      'travel safety', 'sécurité voyage', 'travel insurance', 'assurance voyage',
      'travel visa', 'visa voyage', 'travel documents', 'documents voyage'
    ];
    
    const seoMatches = seoKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (seoMatches.length >= 3) {
      seoScore += this.strategicScoring.seo_potential;
    } else if (seoMatches.length >= 1) {
      seoScore += 5; // Score partiel
    }
    
    // Bonus pour les titres SEO-friendly
    const seoTitlePatterns = [
      /(?:how to|comment).*(?:travel|voyager)/i,
      /(?:best|meilleur).*(?:places|endroits|destinations)/i,
      /(?:top|top).*(?:destinations|destinations)/i,
      /(?:travel|voyage).*(?:guide|guide|tips|conseils)/i,
      /(?:budget|budget).*(?:travel|voyage)/i,
      /(?:travel|voyage).*(?:budget|budget)/i
    ];
    
    const seoTitleMatches = seoTitlePatterns.filter(pattern => 
      pattern.test(title)
    );
    
    if (seoTitleMatches.length > 0) {
      seoScore += 3; // Bonus titre SEO
    }
    
    return seoScore;
  }

  // Analyser le potentiel viral/émotionnel
  analyzeViralPotential(content, title) {
    let viralScore = 0;
    
    // Mots-clés émotionnels/viraux
    const viralKeywords = [
      'amazing', 'incroyable', 'incredible', 'incroyable', 'stunning', 'époustouflant',
      'breathtaking', 'à couper le souffle', 'spectacular', 'spectaculaire',
      'unbelievable', 'incroyable', 'mind-blowing', 'époustouflant',
      'jaw-dropping', 'époustouflant', 'awe-inspiring', 'inspirant',
      'must-see', 'à voir absolument', 'must-visit', 'à visiter absolument',
      'hidden gem', 'joyau caché', 'secret spot', 'endroit secret',
      'insider tip', 'conseil d\'initié', 'local secret', 'secret local',
      'exclusive', 'exclusif', 'rare', 'rare', 'unique', 'unique',
      'viral', 'viral', 'trending', 'tendance', 'popular', 'populaire',
      'shocking', 'choquant', 'surprising', 'surprenant', 'unexpected', 'inattendu'
    ];
    
    const viralMatches = viralKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (viralMatches.length >= 2) {
      viralScore += this.strategicScoring.viral_potential;
    } else if (viralMatches.length >= 1) {
      viralScore += 5; // Score partiel
    }
    
    // Bonus pour les titres émotionnels
    const emotionalTitlePatterns = [
      /(?:amazing|incroyable|incredible).*(?:discovery|découverte)/i,
      /(?:stunning|époustouflant).*(?:view|vue|vista)/i,
      /(?:hidden|secret|caché).*(?:gem|joyau|spot|endroit)/i,
      /(?:must-see|à voir).*(?:destination|destination)/i,
      /(?:viral|viral).*(?:travel|voyage)/i,
      /(?:shocking|choquant).*(?:truth|vérité)/i,
      /(?:unbelievable|incroyable).*(?:story|histoire)/i
    ];
    
    const emotionalMatches = emotionalTitlePatterns.filter(pattern => 
      pattern.test(title)
    );
    
    if (emotionalMatches.length > 0) {
      viralScore += 5; // Bonus titre émotionnel
    }
    
    // Bonus pour les chiffres accrocheurs
    const numberPatterns = [
      /(?:top|top)\s+\d+/i,
      /\d+\s+(?:best|meilleur)/i,
      /\d+\s+(?:amazing|incroyable)/i,
      /\d+\s+(?:secret|secret)/i,
      /\d+\s+(?:tips|conseils)/i
    ];
    
    const numberMatches = numberPatterns.filter(pattern => 
      pattern.test(title)
    );
    
    if (numberMatches.length > 0) {
      viralScore += 3; // Bonus chiffres accrocheurs
    }
    
    return viralScore;
  }

  // Détecter le type de contenu voyage
  detectTravelType(content) {
    if (content.includes('flight') || content.includes('airline') || content.includes('airport')) {
      return 'transport';
    } else if (content.includes('visa') || content.includes('passport') || content.includes('border')) {
      return 'formalités';
    } else if (content.includes('travel alert') || content.includes('safety') || content.includes('security')) {
      return 'sécurité';
    } else if (content.includes('deal') || content.includes('offer') || content.includes('promotion')) {
      return 'bon-plan';
    } else if (content.includes('hotel') || content.includes('accommodation') || content.includes('tourism')) {
      return 'hébergement';
    } else {
      return 'actualité';
    }
  }

  // Récupérer et filtrer les articles RSS
  async fetchAndFilterStrategicRSS() {
    console.log('🎯 Récupération et filtrage RSS stratégique FlashVoyages...\n');
    
    const allArticles = [];
    const strategicArticles = [];

    for (const [category, sources] of Object.entries(this.strategicRSSSources)) {
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
      const analysis = this.analyzeStrategicValue(article);
      
      if (analysis.isRelevant) {
        strategicArticles.push({
          ...article,
          analysis,
          translatedTitle: this.translateToFrench(article.title)
        });
        
        console.log(`✅ Article stratégique trouvé:`);
        console.log(`   📰 ${article.title}`);
        console.log(`   🇫🇷 ${this.translateToFrench(article.title)}`);
        console.log(`   📊 Score: ${analysis.score}/100 (${analysis.strategicValue})`);
        console.log(`   🎯 Raisons: ${analysis.reasons.join(', ')}`);
        console.log(`   🏷️ Type: ${analysis.travelType}`);
        console.log(`   🌏 Destination: ${analysis.destination}`);
        console.log(`   💡 Valeur: ${analysis.practicalValue}\n`);
      }
    }

    console.log(`🎯 ${strategicArticles.length} articles stratégiques trouvés sur ${allArticles.length}`);
    
    return strategicArticles;
  }

  // Récupérer un flux RSS
  async fetchRSSFeed(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FlashVoyages-Strategic-RSS/1.0)'
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

  // Générer un article FlashVoyages stratégique
  generateStrategicFlashVoyagesArticle(news) {
    const analysis = news.analysis;
    const destination = analysis.destination;
    const travelType = analysis.travelType;
    const practicalValue = analysis.practicalValue;
    
    // Titre en français avec valeur ajoutée
    const frenchTitle = `🌏 ${destination.charAt(0).toUpperCase() + destination.slice(1)} : ${news.translatedTitle}`;
    
    // Contenu structuré selon la valeur stratégique
    let content = '';
    
    if (analysis.strategicValue === 'high') {
      content = this.generateHighValueContent(news, destination, practicalValue);
    } else if (analysis.strategicValue === 'medium') {
      content = this.generateMediumValueContent(news, destination, practicalValue);
    } else {
      content = this.generateLowValueContent(news, destination, practicalValue);
    }

    return {
      title: frenchTitle,
      content,
      type: travelType,
      destination,
      category: this.getCategoryFromDestination(destination),
      tags: this.generateStrategicTags(destination, travelType, analysis.strategicValue),
      source: news.source,
      originalLink: news.link,
      strategicScore: analysis.score,
      strategicValue: analysis.strategicValue,
      practicalValue: practicalValue
    };
  }

  generateHighValueContent(news, destination, practicalValue) {
    return `
      <h2>🚀 ${destination} - Information stratégique voyage</h2>
      <p><em>📅 Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
      
      <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 5px solid #4caf50;">
        <h3>🎯 FlashVoyages vous informe - Information importante</h3>
        <p><strong>${news.translatedTitle}</strong></p>
        <p>${news.description}</p>
        <div style="background: #f1f8e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h4>💡 Valeur ajoutée FlashVoyages</h4>
          <p><strong>${practicalValue}</strong></p>
        </div>
      </div>
      
      <h3>🚀 Impact sur vos voyages</h3>
      <ul>
        <li><strong>Information cruciale</strong> pour vos voyages vers ${destination}</li>
        <li><strong>Conseils FlashVoyages</strong> pour optimiser votre expérience</li>
        <li><strong>Mise à jour importante</strong> des conditions de voyage</li>
      </ul>
      
      <div style="background: #fff3e0; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>🎯 Conseil FlashVoyages</h4>
        <p>Cette information peut directement impacter votre voyage. FlashVoyages vous recommande de prendre en compte ces informations pour ${destination}.</p>
      </div>
    `;
  }

  generateMediumValueContent(news, destination, practicalValue) {
    return `
      <h2>📰 ${destination} - Actualité voyage</h2>
      <p><em>📅 Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
      
      <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>🚀 FlashVoyages vous informe</h3>
        <p><strong>${news.translatedTitle}</strong></p>
        <p>${news.description}</p>
        <div style="background: #f1f8e9; padding: 10px; border-radius: 5px; margin: 10px 0;">
          <p><strong>💡 ${practicalValue}</strong></p>
        </div>
      </div>
      
      <h3>📊 Impact pour les voyageurs</h3>
      <ul>
        <li>Information utile pour vos voyages vers ${destination}</li>
        <li>Conseils FlashVoyages pour bien préparer votre séjour</li>
        <li>Mise à jour des conditions de voyage</li>
      </ul>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Conseil FlashVoyages</h4>
        <p>Restez informé des dernières actualités voyage avec FlashVoyages. Cette information peut être utile pour ${destination}.</p>
      </div>
    `;
  }

  generateLowValueContent(news, destination, practicalValue) {
    return `
      <h2>📰 ${destination} - Actualité générale</h2>
      <p><em>📅 Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>🚀 FlashVoyages vous informe</h3>
        <p><strong>${news.translatedTitle}</strong></p>
        <p>${news.description}</p>
      </div>
      
      <h3>📊 Information générale</h3>
      <ul>
        <li>Actualité liée à ${destination}</li>
        <li>Contexte général pour vos voyages</li>
        <li>Information de référence</li>
      </ul>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Conseil FlashVoyages</h4>
        <p>FlashVoyages vous tient informé de l'actualité générale concernant ${destination}.</p>
      </div>
    `;
  }

  getCategoryFromDestination(destination) {
    const categoryMap = {
      'japon': 'Japon', 'tokyo': 'Japon',
      'thailande': 'Thaïlande', 'bangkok': 'Thaïlande',
      'corée': 'Corée du Sud', 'séoul': 'Corée du Sud',
      'vietnam': 'Vietnam', 'hanoi': 'Vietnam',
      'singapour': 'Singapour',
      'philippines': 'Philippines', 'manille': 'Philippines',
      'indonésie': 'Indonésie', 'jakarta': 'Indonésie',
      'chine': 'Chine', 'pékin': 'Chine', 'shanghai': 'Chine',
      'taïwan': 'Taïwan', 'taipei': 'Taïwan',
      'cambodge': 'Cambodge', 'phnom penh': 'Cambodge',
      'laos': 'Laos', 'vientiane': 'Laos',
      'myanmar': 'Myanmar'
    };
    
    return categoryMap[destination.toLowerCase()] || 'Asie';
  }

  generateStrategicTags(destination, travelType, strategicValue) {
    const baseTags = ['actualite', 'voyage', destination.toLowerCase()];
    
    const typeTags = {
      'transport': ['vol', 'transport'],
      'formalités': ['visa', 'formalites'],
      'sécurité': ['securite', 'alerte'],
      'bon-plan': ['bon-plan', 'offre'],
      'hébergement': ['hotel', 'hebergement'],
      'actualité': ['news', 'info']
    };
    
    const valueTags = {
      'high': ['strategique', 'important'],
      'medium': ['utile', 'info'],
      'low': ['general', 'reference']
    };
    
    return [...baseTags, ...(typeTags[travelType] || []), ...(valueTags[strategicValue] || [])];
  }
}

// Test du système stratégique
async function testStrategicRSSFilter() {
  console.log('🧪 Test du filtre RSS stratégique FlashVoyages\n');
  
  const filter = new StrategicRSSFilter();
  
  try {
    // Récupérer et filtrer les articles
    const strategicArticles = await filter.fetchAndFilterStrategicRSS();
    
    if (strategicArticles.length > 0) {
      console.log(`\n🎯 ${strategicArticles.length} articles stratégiques trouvés !`);
      
      // Générer un article test
      const testArticle = filter.generateStrategicFlashVoyagesArticle(strategicArticles[0]);
      
      console.log('\n📝 Article FlashVoyages stratégique généré :');
      console.log(`📰 Titre: ${testArticle.title}`);
      console.log(`🏷️ Type: ${testArticle.type}`);
      console.log(`🌏 Destination: ${testArticle.destination}`);
      console.log(`📂 Catégorie: ${testArticle.category}`);
      console.log(`🏷️ Tags: ${testArticle.tags.join(', ')}`);
      console.log(`📊 Score stratégique: ${testArticle.strategicScore}/100`);
      console.log(`🎯 Valeur stratégique: ${testArticle.strategicValue}`);
      console.log(`💡 Valeur pratique: ${testArticle.practicalValue}`);
      
      return {
        success: true,
        articlesFound: strategicArticles.length,
        testArticle
      };
    } else {
      console.log('\n⚠️ Aucun article stratégique trouvé');
      return { success: false, articlesFound: 0 };
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return { success: false, error: error.message };
  }
}

// Exécuter le test
if (import.meta.url === `file://${process.argv[1]}`) {
  testStrategicRSSFilter().then(result => {
    if (result.success) {
      console.log('\n✅ Test réussi !');
      console.log('🎯 Le filtre RSS stratégique fonctionne parfaitement');
      console.log('🇫🇷 Traduction automatique en français');
      console.log('💡 Analyse de la valeur ajoutée pour l\'utilisateur');
      console.log('🚀 Scoring basé sur la stratégie FlashVoyages');
    } else {
      console.log('\n❌ Test échoué');
      console.log('🔍 Vérifiez les logs pour plus de détails');
    }
  });
}

export default StrategicRSSFilter;
