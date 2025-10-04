#!/usr/bin/env node

/**
 * Nomade Hub Organizer - Organisateur par catégories pour le hub nomade
 * Organise et structure le contenu collecté par catégories et priorités
 */

import NomadePersonaDetector from './nomade-persona-detector.js';

class NomadeHubOrganizer {
  constructor() {
    this.personaDetector = new NomadePersonaDetector();
    this.organizedContent = {
      coliving: {
        urgent: [],
        trending: [],
        guides: [],
        reviews: []
      },
      visa: {
        urgent: [],
        guides: [],
        updates: [],
        tips: []
      },
      budget: {
        deals: [],
        comparisons: [],
        tips: [],
        calculators: []
      },
      community: {
        discussions: [],
        experiences: [],
        questions: [],
        meetups: []
      },
      news: {
        breaking: [],
        industry: [],
        destinations: [],
        technology: []
      }
    };
  }

  // Organiser le contenu collecté
  organizeContent(collectedContent) {
    console.log('📊 Organisation du contenu par catégories...\n');
    
    // Organiser chaque catégorie
    this.organizeColivingContent(collectedContent.coliving || []);
    this.organizeVisaContent(collectedContent.visa || []);
    this.organizeBudgetContent(collectedContent.budget || []);
    this.organizeCommunityContent(collectedContent.community || []);
    this.organizeNewsContent(collectedContent.news || []);
    
    // Debug: afficher le contenu reçu
    console.log('🔍 Debug - Contenu reçu:');
    console.log(`   Coliving: ${(collectedContent.coliving || []).length} articles`);
    console.log(`   Visa: ${(collectedContent.visa || []).length} articles`);
    console.log(`   Budget: ${(collectedContent.budget || []).length} articles`);
    console.log(`   Communauté: ${(collectedContent.community || []).length} articles`);
    console.log(`   News: ${(collectedContent.news || []).length} articles`);
    
    // Calculer les statistiques
    const stats = this.calculateOrganizationStats();
    
    console.log('✅ Organisation terminée:');
    console.log(`   🏠 Coliving: ${stats.coliving.total} articles organisés`);
    console.log(`   ✈️ Visa: ${stats.visa.total} articles organisés`);
    console.log(`   💰 Budget: ${stats.budget.total} articles organisés`);
    console.log(`   👥 Communauté: ${stats.community.total} articles organisés`);
    console.log(`   📰 News: ${stats.news.total} articles organisés`);
    
    return this.organizedContent;
  }

  // Organiser le contenu coliving
  organizeColivingContent(colivingContent) {
    colivingContent.forEach(item => {
      const title = item.title.toLowerCase();
      const content = item.content.toLowerCase();
      
      // Urgent - offres limitées, nouvelles ouvertures
      if (title.includes('urgent') || 
          title.includes('limité') || 
          title.includes('nouveau') ||
          title.includes('offre') ||
          item.urgency === 'high') {
        this.organizedContent.coliving.urgent.push({
          ...item,
          priority: this.calculatePriority(item, 'urgent'),
          category: 'urgent'
        });
      }
      
      // Trending - discussions populaires, tendances
      else if (item.upvotes > 20 || 
               item.comments > 10 ||
               title.includes('tendance') ||
               title.includes('populaire')) {
        this.organizedContent.coliving.trending.push({
          ...item,
          priority: this.calculatePriority(item, 'trending'),
          category: 'trending'
        });
      }
      
      // Guides - tutoriels, conseils
      else if (title.includes('guide') || 
               title.includes('comment') ||
               title.includes('tutoriel') ||
               title.includes('conseil')) {
        this.organizedContent.coliving.guides.push({
          ...item,
          priority: this.calculatePriority(item, 'guide'),
          category: 'guide'
        });
      }
      
      // Reviews - expériences, avis
      else if (title.includes('expérience') || 
               title.includes('avis') ||
               title.includes('review') ||
               title.includes('test')) {
        this.organizedContent.coliving.reviews.push({
          ...item,
          priority: this.calculatePriority(item, 'review'),
          category: 'review'
        });
      }
      
      // Par défaut, mettre dans trending
      else {
        this.organizedContent.coliving.trending.push({
          ...item,
          priority: this.calculatePriority(item, 'trending'),
          category: 'trending'
        });
      }
    });
    
    // Trier chaque sous-catégorie par priorité
    Object.keys(this.organizedContent.coliving).forEach(subCategory => {
      this.organizedContent.coliving[subCategory].sort((a, b) => b.priority - a.priority);
    });
  }

  // Organiser le contenu visa
  organizeVisaContent(visaContent) {
    visaContent.forEach(item => {
      const title = item.title.toLowerCase();
      const content = item.content.toLowerCase();
      
      // Urgent - changements réglementaires, délais
      if (title.includes('urgent') || 
          title.includes('changement') ||
          title.includes('nouveau') ||
          title.includes('règlement') ||
          item.urgency === 'high') {
        this.organizedContent.visa.urgent.push({
          ...item,
          priority: this.calculatePriority(item, 'urgent'),
          category: 'urgent'
        });
      }
      
      // Guides - procédures, étapes
      else if (title.includes('guide') || 
               title.includes('procédure') ||
               title.includes('étape') ||
               title.includes('comment')) {
        this.organizedContent.visa.guides.push({
          ...item,
          priority: this.calculatePriority(item, 'guide'),
          category: 'guide'
        });
      }
      
      // Updates - mises à jour, nouvelles
      else if (title.includes('mise à jour') || 
               title.includes('update') ||
               title.includes('nouvelle') ||
               title.includes('2025')) {
        this.organizedContent.visa.updates.push({
          ...item,
          priority: this.calculatePriority(item, 'update'),
          category: 'update'
        });
      }
      
      // Tips - conseils, astuces
      else if (title.includes('conseil') || 
               title.includes('astuce') ||
               title.includes('tip') ||
               title.includes('truc')) {
        this.organizedContent.visa.tips.push({
          ...item,
          priority: this.calculatePriority(item, 'tip'),
          category: 'tip'
        });
      }
      
      // Par défaut, mettre dans updates
      else {
        this.organizedContent.visa.updates.push({
          ...item,
          priority: this.calculatePriority(item, 'update'),
          category: 'update'
        });
      }
    });
    
    // Trier chaque sous-catégorie par priorité
    Object.keys(this.organizedContent.visa).forEach(subCategory => {
      this.organizedContent.visa[subCategory].sort((a, b) => b.priority - a.priority);
    });
  }

  // Organiser le contenu budget
  organizeBudgetContent(budgetContent) {
    budgetContent.forEach(item => {
      const title = item.title.toLowerCase();
      const content = item.content.toLowerCase();
      
      // Deals - offres, promotions
      if (title.includes('deal') || 
          title.includes('offre') ||
          title.includes('promo') ||
          title.includes('réduction') ||
          title.includes('bon plan')) {
        this.organizedContent.budget.deals.push({
          ...item,
          priority: this.calculatePriority(item, 'deal'),
          category: 'deal'
        });
      }
      
      // Comparisons - comparaisons, analyses
      else if (title.includes('comparaison') || 
               title.includes('vs') ||
               title.includes('analyse') ||
               title.includes('comparison')) {
        this.organizedContent.budget.comparisons.push({
          ...item,
          priority: this.calculatePriority(item, 'comparison'),
          category: 'comparison'
        });
      }
      
      // Tips - conseils, astuces
      else if (title.includes('conseil') || 
               title.includes('astuce') ||
               title.includes('tip') ||
               title.includes('économiser')) {
        this.organizedContent.budget.tips.push({
          ...item,
          priority: this.calculatePriority(item, 'tip'),
          category: 'tip'
        });
      }
      
      // Calculators - outils, calculateurs
      else if (title.includes('calculateur') || 
               title.includes('calcul') ||
               title.includes('outil') ||
               title.includes('simulateur')) {
        this.organizedContent.budget.calculators.push({
          ...item,
          priority: this.calculatePriority(item, 'calculator'),
          category: 'calculator'
        });
      }
      
      // Par défaut, mettre dans tips
      else {
        this.organizedContent.budget.tips.push({
          ...item,
          priority: this.calculatePriority(item, 'tip'),
          category: 'tip'
        });
      }
    });
    
    // Trier chaque sous-catégorie par priorité
    Object.keys(this.organizedContent.budget).forEach(subCategory => {
      this.organizedContent.budget[subCategory].sort((a, b) => b.priority - a.priority);
    });
  }

  // Organiser le contenu communauté
  organizeCommunityContent(communityContent) {
    communityContent.forEach(item => {
      // Par défaut, mettre dans discussions (tous les articles communauté)
      this.organizedContent.community.discussions.push({
        ...item,
        priority: this.calculatePriority(item, 'discussion'),
        category: 'discussion'
      });
    });
    
    // Trier chaque sous-catégorie par priorité
    Object.keys(this.organizedContent.community).forEach(subCategory => {
      this.organizedContent.community[subCategory].sort((a, b) => b.priority - a.priority);
    });
  }

  // Organiser le contenu news
  organizeNewsContent(newsContent) {
    newsContent.forEach(item => {
      const title = item.title.toLowerCase();
      const content = item.content.toLowerCase();
      
      // Breaking - actualités urgentes
      if (title.includes('breaking') || 
          title.includes('urgent') ||
          title.includes('alerte') ||
          item.urgency === 'high') {
        this.organizedContent.news.breaking.push({
          ...item,
          priority: this.calculatePriority(item, 'breaking'),
          category: 'breaking'
        });
      }
      
      // Industry - industrie, business
      else if (title.includes('industrie') || 
               title.includes('business') ||
               title.includes('startup') ||
               title.includes('tech')) {
        this.organizedContent.news.industry.push({
          ...item,
          priority: this.calculatePriority(item, 'industry'),
          category: 'industry'
        });
      }
      
      // Destinations - destinations, pays
      else if (title.includes('japon') || 
               title.includes('thailande') ||
               title.includes('corée') ||
               title.includes('singapour') ||
               title.includes('bali')) {
        this.organizedContent.news.destinations.push({
          ...item,
          priority: this.calculatePriority(item, 'destination'),
          category: 'destination'
        });
      }
      
      // Technology - technologie, outils
      else if (title.includes('technologie') || 
               title.includes('tech') ||
               title.includes('outil') ||
               title.includes('app') ||
               title.includes('digital')) {
        this.organizedContent.news.technology.push({
          ...item,
          priority: this.calculatePriority(item, 'technology'),
          category: 'technology'
        });
      }
      
      // Par défaut, mettre dans destinations
      else {
        this.organizedContent.news.destinations.push({
          ...item,
          priority: this.calculatePriority(item, 'destination'),
          category: 'destination'
        });
      }
    });
    
    // Trier chaque sous-catégorie par priorité
    Object.keys(this.organizedContent.news).forEach(subCategory => {
      this.organizedContent.news[subCategory].sort((a, b) => b.priority - a.priority);
    });
  }

  // Calculer la priorité d'un article
  calculatePriority(item, category) {
    let priority = item.relevance || 50;
    
    // Bonus pour l'urgence
    if (item.urgency === 'high') priority += 20;
    else if (item.urgency === 'medium') priority += 10;
    
    // Bonus pour l'engagement
    if (item.upvotes > 50) priority += 15;
    else if (item.upvotes > 20) priority += 10;
    else if (item.upvotes > 10) priority += 5;
    
    if (item.comments > 20) priority += 10;
    else if (item.comments > 10) priority += 5;
    
    // Bonus pour la fraîcheur
    const now = new Date();
    const itemDate = new Date(item.date);
    const hoursAgo = (now - itemDate) / (1000 * 60 * 60);
    
    if (hoursAgo < 1) priority += 20;
    else if (hoursAgo < 6) priority += 15;
    else if (hoursAgo < 24) priority += 10;
    else if (hoursAgo < 72) priority += 5;
    
    // Bonus selon la catégorie
    const categoryBonuses = {
      'urgent': 25,
      'breaking': 25,
      'deal': 20,
      'guide': 15,
      'trending': 10,
      'discussion': 5
    };
    
    priority += categoryBonuses[category] || 0;
    
    return Math.min(priority, 100);
  }

  // Calculer les statistiques d'organisation
  calculateOrganizationStats() {
    const stats = {};
    
    Object.keys(this.organizedContent).forEach(category => {
      stats[category] = {
        total: 0,
        subcategories: {}
      };
      
      Object.keys(this.organizedContent[category]).forEach(subCategory => {
        const count = this.organizedContent[category][subCategory].length;
        stats[category].total += count;
        stats[category].subcategories[subCategory] = count;
      });
    });
    
    return stats;
  }

  // Obtenir le contenu organisé
  getOrganizedContent() {
    return this.organizedContent;
  }

  // Obtenir les articles les plus prioritaires
  getTopPriorityArticles(limit = 10) {
    const allArticles = [];
    
    Object.values(this.organizedContent).forEach(category => {
      Object.values(category).forEach(subCategory => {
        allArticles.push(...subCategory);
      });
    });
    
    return allArticles
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  // Obtenir les articles par catégorie et sous-catégorie
  getArticlesByCategory(category, subCategory = null) {
    if (subCategory) {
      return this.organizedContent[category]?.[subCategory] || [];
    }
    
    const articles = [];
    Object.values(this.organizedContent[category] || {}).forEach(subCat => {
      articles.push(...subCat);
    });
    
    return articles.sort((a, b) => b.priority - a.priority);
  }
}

export default NomadeHubOrganizer;
