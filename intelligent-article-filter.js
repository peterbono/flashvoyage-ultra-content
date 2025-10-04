#!/usr/bin/env node

/**
 * Filtre intelligent pour les articles
 * Améliore la pertinence avant application des templates
 */

class IntelligentArticleFilter {
  constructor() {
    this.nomadeKeywords = [
      'digital nomad', 'nomade numérique', 'coliving', 'coworking', 
      'visa nomade', 'nomad visa', 'remote work', 'travail à distance',
      'nomade', 'nomadic', 'freelance', 'freelancer', 'entrepreneur',
      'startup', 'tech', 'programming', 'coding', 'developer',
      'designer', 'marketing', 'consultant', 'consulting'
    ];
    
    this.asiaKeywords = [
      'asie', 'asia', 'japon', 'japan', 'corée', 'korea', 'thailande', 
      'thailand', 'vietnam', 'singapour', 'singapore', 'indonésie', 
      'indonesia', 'malaisie', 'malaysia', 'philippines', 'taiwan',
      'hong kong', 'bangkok', 'tokyo', 'seoul', 'singapore', 'ho chi minh',
      'jakarta', 'kuala lumpur', 'manila', 'taipei'
    ];
    
    this.travelKeywords = [
      'voyage', 'travel', 'trip', 'vacation', 'holiday', 'backpacking',
      'budget travel', 'voyage pas cher', 'bon plan', 'deal', 'offre',
      'vol', 'flight', 'hotel', 'hébergement', 'accommodation'
    ];
  }

  // Analyser la pertinence d'un article pour les nomades
  analyzeRelevance(article) {
    const text = `${article.title} ${article.content}`.toLowerCase();
    
    let nomadeScore = 0;
    let asiaScore = 0;
    let travelScore = 0;
    
    // Score nomade
    this.nomadeKeywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        nomadeScore += 1;
      }
    });
    
    // Score Asie
    this.asiaKeywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        asiaScore += 1;
      }
    });
    
    // Score voyage
    this.travelKeywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        travelScore += 1;
      }
    });
    
    // Calculer le score total
    const totalScore = nomadeScore + asiaScore + travelScore;
    const maxPossibleScore = this.nomadeKeywords.length + this.asiaKeywords.length + this.travelKeywords.length;
    const relevancePercentage = (totalScore / maxPossibleScore) * 100;
    
    return {
      nomadeScore,
      asiaScore,
      travelScore,
      totalScore,
      relevancePercentage,
      isNomadeRelevant: nomadeScore >= 2,
      isAsiaRelevant: asiaScore >= 1,
      isTravelRelevant: travelScore >= 1,
      category: this.categorizeArticle(nomadeScore, asiaScore, travelScore)
    };
  }

  // Catégoriser l'article selon les scores
  categorizeArticle(nomadeScore, asiaScore, travelScore) {
    if (nomadeScore >= 2 && asiaScore >= 1) {
      return 'nomade_asie';
    } else if (nomadeScore >= 2) {
      return 'nomade_general';
    } else if (asiaScore >= 1 && travelScore >= 1) {
      return 'voyage_asie';
    } else if (asiaScore >= 1) {
      return 'asie_general';
    } else if (travelScore >= 1) {
      return 'voyage_general';
    } else {
      return 'general';
    }
  }

  // Filtrer les articles pertinents
  filterRelevantArticles(articles, minRelevance = 5) {
    const filteredArticles = [];
    
    articles.forEach(article => {
      const analysis = this.analyzeRelevance(article);
      
      // Utiliser la pertinence de l'article si disponible, sinon utiliser l'analyse
      const relevance = article.relevance || analysis.relevancePercentage;
      
      if (relevance >= minRelevance) {
        filteredArticles.push({
          ...article,
          relevanceAnalysis: analysis,
          relevance: relevance
        });
      }
    });
    
    // Trier par pertinence
    return filteredArticles.sort((a, b) => 
      (b.relevance || 0) - (a.relevance || 0)
    );
  }

  // Obtenir le meilleur article pour chaque catégorie
  getBestArticlesByCategory(articles) {
    const categories = {};
    
    articles.forEach(article => {
      const category = article.relevanceAnalysis.category;
      if (!categories[category] || 
          article.relevanceAnalysis.relevancePercentage > categories[category].relevanceAnalysis.relevancePercentage) {
        categories[category] = article;
      }
    });
    
    return categories;
  }

  // Recommander le template approprié
  recommendTemplate(article) {
    const analysis = article.relevanceAnalysis;
    
    if (analysis.category === 'nomade_asie') {
      return 'nomade_coliving_visa_asie';
    } else if (analysis.category === 'nomade_general') {
      return 'nomade_general';
    } else if (analysis.category === 'voyage_asie') {
      return 'asie_general'; // Corrigé : utiliser asie_general au lieu de voyage_asie
    } else if (analysis.category === 'voyage_general') {
      return 'voyage_general';
    } else if (analysis.category === 'asie_general') {
      return 'asie_general';
    } else {
      return 'general';
    }
  }
}

export default IntelligentArticleFilter;
