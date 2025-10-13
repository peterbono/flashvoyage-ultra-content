/**
 * ANALYSEUR REDDIT ULTRA-AVANCÉ
 * Extraction multidimensionnelle inspirée de la concurrence
 * Version 2.0 - Analyse ultra-précise pour témoignages
 */

export class AdvancedRedditAnalyzer {
  constructor() {
    this.sentimentKeywords = {
      excitement: ['amazing', 'incredible', 'love', 'perfect', 'fantastic', 'wow', 'stunning'],
      anxiety: ['worried', 'scared', 'nervous', 'concerned', 'stressed', 'overwhelmed'],
      satisfaction: ['happy', 'content', 'pleased', 'satisfied', 'fulfilled', 'grateful'],
      frustration: ['frustrated', 'annoyed', 'disappointed', 'upset', 'angry', 'irritated'],
      nostalgia: ['miss', 'homesick', 'remember', 'used to', 'back then', 'good old days']
    };
    
    this.experienceIndicators = {
      beginner: ['first time', 'new to', 'just started', 'beginner', 'noob', 'learning'],
      intermediate: ['few months', 'couple of years', 'some experience', 'getting used to'],
      expert: ['years of', 'veteran', 'expert', 'pro', 'seasoned', 'experienced']
    };
    
    this.budgetKeywords = {
      accommodation: ['rent', 'apartment', 'hotel', 'hostel', 'airbnb', 'coliving'],
      food: ['food', 'restaurant', 'cooking', 'grocery', 'market', 'street food'],
      transport: ['flight', 'bus', 'train', 'taxi', 'grab', 'uber', 'scooter'],
      entertainment: ['party', 'bar', 'club', 'tourist', 'attraction', 'activity']
    };
  }

  /**
   * ANALYSE MULTIDIMENSIONNELLE D'UN POST REDDIT
   */
  async analyzeRedditPost(postData) {
    const analysis = {
      // === DIMENSION ÉMOTIONNELLE ===
      sentiment: this.analyzeSentiment(postData),
      
      // === DIMENSION PRATIQUE ===
      practical_insights: this.extractPracticalInsights(postData),
      
      // === DIMENSION STRATÉGIQUE ===
      strategic_value: this.analyzeStrategicValue(postData),
      
      // === DIMENSION COMPARATIVE ===
      competitive_analysis: this.performCompetitiveAnalysis(postData),
      
      // === PROFIL NOMADE ===
      nomad_profile: this.detectNomadProfile(postData),
      
      // === PROFIL PROFESSIONNEL ===
      professional_profile: this.detectProfessionalProfile(postData),
      
      // === PROFIL LIFESTYLE ===
      lifestyle_profile: this.detectLifestyleProfile(postData),
      
      // === ANALYSE GÉOGRAPHIQUE ===
      geographical_analysis: this.analyzeGeographicalContext(postData),
      
      // === INSIGHTS ACTIONNABLES ===
      actionable_insights: this.extractActionableInsights(postData),
      
      // === SCORING DE PERTINENCE ===
      relevance_scoring: this.calculateRelevanceScoring(postData),
      
      // === DÉTECTION DE PATTERNS ===
      pattern_detection: this.detectPatterns(postData)
    };

    return analysis;
  }

  /**
   * ANALYSE ÉMOTIONNELLE AVANCÉE
   */
  analyzeSentiment(postData) {
    const text = postData.content.toLowerCase();
    const title = postData.title.toLowerCase();
    const fullText = `${title} ${text}`;
    
    const sentimentScores = {};
    let totalScore = 0;
    let sentimentCount = 0;
    
    // Analyse des émotions primaires
    Object.keys(this.sentimentKeywords).forEach(emotion => {
      const keywords = this.sentimentKeywords[emotion];
      let score = 0;
      
      keywords.forEach(keyword => {
        const matches = (fullText.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      
      if (score > 0) {
        sentimentScores[emotion] = score;
        totalScore += score;
        sentimentCount++;
      }
    });
    
    // Détermination de l'émotion primaire
    const primaryEmotion = Object.keys(sentimentScores).reduce((a, b) => 
      sentimentScores[a] > sentimentScores[b] ? a : b, 'neutral'
    );
    
    // Calcul de l'intensité (0-100)
    const intensity = Math.min(100, (totalScore / sentimentCount) * 20);
    
    // Détection de l'évolution émotionnelle
    const evolution = this.detectEmotionalEvolution(fullText);
    
    // Identification des déclencheurs
    const triggers = this.identifyEmotionalTriggers(fullText);
    
    return {
      primary: primaryEmotion,
      intensity: Math.round(intensity),
      evolution: evolution,
      triggers: triggers,
      scores: sentimentScores
    };
  }

  /**
   * EXTRACTION D'INSIGHTS PRATIQUES
   */
  extractPracticalInsights(postData) {
    const text = postData.content.toLowerCase();
    
    // Extraction du budget
    const budgetBreakdown = this.extractBudgetBreakdown(text);
    
    // Extraction de la timeline
    const timeline = this.extractTimeline(text);
    
    // Extraction des coûts spécifiques
    const specificCosts = this.extractSpecificCosts(text);
    
    return {
      budget_breakdown: budgetBreakdown,
      timeline: timeline,
      specific_costs: specificCosts,
      practical_tips: this.extractPracticalTips(text)
    };
  }

  extractSpecificCosts(text) {
    const costs = [];
    const costPatterns = [
      /\$(\d+)(?:-|\s+to\s+)\$(\d+)/g,
      /(\d+)\s*(?:USD|dollars?|bucks?)/gi
    ];
    
    costPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        costs.push(...matches);
      }
    });
    
    return costs.slice(0, 10);
  }

  /**
   * ANALYSE DE LA VALEUR STRATÉGIQUE
   */
  analyzeStrategicValue(postData) {
    const text = postData.content.toLowerCase();
    
    return {
      business_opportunities: this.identifyBusinessOpportunities(text),
      network_potential: this.assessNetworkPotential(text),
      skill_development: this.identifySkillDevelopment(text),
      market_insights: this.extractMarketInsights(text)
    };
  }

  identifyBusinessOpportunities(text) {
    const opportunities = [];
    const opportunityPatterns = [
      /(?:business|opportunity|market|startup|entrepreneur)[^.]*\./gi,
      /(?:consulting|freelance|remote work|client)[^.]*\./gi
    ];
    
    opportunityPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        opportunities.push(...matches.map(match => match.trim()));
      }
    });
    
    return opportunities.slice(0, 8);
  }

  assessNetworkPotential(text) {
    const networkScore = {
      score: 0,
      indicators: []
    };
    
    if (text.includes('community') || text.includes('network') || text.includes('friends')) {
      networkScore.score += 30;
      networkScore.indicators.push('community_mention');
    }
    if (text.includes('coworking') || text.includes('meetup') || text.includes('event')) {
      networkScore.score += 25;
      networkScore.indicators.push('professional_networking');
    }
    if (text.includes('collaboration') || text.includes('partnership') || text.includes('team')) {
      networkScore.score += 25;
      networkScore.indicators.push('business_collaboration');
    }
    if (text.includes('mentor') || text.includes('advice') || text.includes('help')) {
      networkScore.score += 20;
      networkScore.indicators.push('mentorship');
    }
    
    return networkScore;
  }

  identifySkillDevelopment(text) {
    const skills = [];
    const skillPatterns = [
      /(?:learn|skill|improve|develop|master)[^.]*\./gi,
      /(?:language|technical|soft skill)[^.]*\./gi
    ];
    
    skillPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        skills.push(...matches.map(match => match.trim()));
      }
    });
    
    return skills.slice(0, 6);
  }

  extractMarketInsights(text) {
    const insights = [];
    const insightPatterns = [
      /(?:market|industry|trend|growth|opportunity)[^.]*\./gi,
      /(?:competition|demand|supply|pricing)[^.]*\./gi
    ];
    
    insightPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        insights.push(...matches.map(match => match.trim()));
      }
    });
    
    return insights.slice(0, 6);
  }

  /**
   * ANALYSE COMPARATIVE
   */
  performCompetitiveAnalysis(postData) {
    const text = postData.content.toLowerCase();
    
    return {
      vs_home_country: this.compareWithHomeCountry(text),
      vs_other_destinations: this.compareWithOtherDestinations(text),
      advantages: this.identifyAdvantages(text),
      disadvantages: this.identifyDisadvantages(text)
    };
  }

  compareWithHomeCountry(text) {
    const comparison = {
      cost_advantage: 0,
      quality_of_life: 'unknown',
      work_opportunities: 'unknown'
    };
    
    if (text.includes('cheaper') || text.includes('less expensive')) {
      comparison.cost_advantage = 30;
    }
    if (text.includes('better quality') || text.includes('improved lifestyle')) {
      comparison.quality_of_life = 'better';
    }
    if (text.includes('more opportunities') || text.includes('better work')) {
      comparison.work_opportunities = 'more';
    }
    
    return comparison;
  }

  compareWithOtherDestinations(text) {
    const comparison = {
      mentioned_alternatives: [],
      why_chosen: [],
      regrets: []
    };
    
    const alternatives = ['vietnam', 'indonesia', 'philippines', 'malaysia', 'singapore'];
    alternatives.forEach(alt => {
      if (text.includes(alt)) {
        comparison.mentioned_alternatives.push(alt);
      }
    });
    
    if (text.includes('chose') || text.includes('decided')) {
      comparison.why_chosen.push('decision_mentioned');
    }
    if (text.includes('regret') || text.includes('should have')) {
      comparison.regrets.push('regret_mentioned');
    }
    
    return comparison;
  }

  identifyAdvantages(text) {
    const advantages = [];
    const advantagePatterns = [
      /(?:advantage|benefit|pro|positive|good)[^.]*\./gi,
      /(?:cheaper|better|easier|convenient)[^.]*\./gi
    ];
    
    advantagePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        advantages.push(...matches.map(match => match.trim()));
      }
    });
    
    return advantages.slice(0, 6);
  }

  identifyDisadvantages(text) {
    const disadvantages = [];
    const disadvantagePatterns = [
      /(?:disadvantage|con|negative|bad|difficult)[^.]*\./gi,
      /(?:expensive|harder|inconvenient|challenging)[^.]*\./gi
    ];
    
    disadvantagePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        disadvantages.push(...matches.map(match => match.trim()));
      }
    });
    
    return disadvantages.slice(0, 6);
  }

  /**
   * DÉTECTION DU PROFIL NOMADE
   */
  detectNomadProfile(postData) {
    const text = postData.content.toLowerCase();
    
    // Détection du niveau d'expérience
    const experienceLevel = this.detectExperienceLevel(text);
    
    // Détection de la motivation
    const motivationDriver = this.detectMotivationDriver(text);
    
    // Détection du style de voyage
    const travelStyle = this.detectTravelStyle(text);
    
    return {
      experience_level: experienceLevel,
      motivation_driver: motivationDriver,
      travel_style: travelStyle,
      countries_mentioned: this.extractCountriesMentioned(text),
      duration_mentioned: this.extractDurationMentioned(text)
    };
  }

  detectTravelStyle(text) {
    if (text.includes('solo') || text.includes('alone')) return 'solo';
    if (text.includes('couple') || text.includes('partner')) return 'couple';
    if (text.includes('family') || text.includes('children')) return 'family';
    if (text.includes('group') || text.includes('team')) return 'group';
    return 'unknown';
  }

  extractCountriesMentioned(text) {
    const countries = [];
    const countryKeywords = [
      'thailand', 'vietnam', 'indonesia', 'philippines', 'malaysia', 'singapore',
      'japan', 'korea', 'china', 'taiwan', 'cambodia', 'laos', 'myanmar'
    ];
    
    countryKeywords.forEach(country => {
      if (text.includes(country)) {
        countries.push(country);
      }
    });
    
    return countries;
  }

  extractDurationMentioned(text) {
    const durations = [];
    const durationPatterns = [
      /(\d+)\s*(?:months?|years?|weeks?)/gi,
      /(?:for|since|during)\s*(\d+)\s*(?:months?|years?|weeks?)/gi
    ];
    
    durationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        durations.push(...matches);
      }
    });
    
    return durations.slice(0, 5);
  }

  /**
   * DÉTECTION DU PROFIL PROFESSIONNEL
   */
  detectProfessionalProfile(postData) {
    const text = postData.content.toLowerCase();
    
    return {
      industry: this.identifyIndustry(text),
      income_level: this.assessIncomeLevel(text),
      work_style: this.identifyWorkStyle(text),
      skills_mentioned: this.extractSkillsMentioned(text),
      business_mentions: this.extractBusinessMentions(text)
    };
  }

  identifyIndustry(text) {
    const industries = {
      tech: ['developer', 'programmer', 'software', 'coding', 'tech', 'IT'],
      marketing: ['marketing', 'social media', 'content', 'SEO', 'advertising'],
      design: ['designer', 'graphic', 'UI', 'UX', 'creative'],
      consulting: ['consultant', 'advisor', 'coach', 'mentor'],
      education: ['teacher', 'instructor', 'tutor', 'education'],
      finance: ['finance', 'accounting', 'banking', 'investment']
    };
    
    for (const [industry, keywords] of Object.entries(industries)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return industry;
      }
    }
    
    return 'unknown';
  }

  assessIncomeLevel(text) {
    if (text.includes('high income') || text.includes('6 figures') || text.includes('wealthy')) {
      return 'high_earner';
    }
    if (text.includes('budget') || text.includes('cheap') || text.includes('low cost')) {
      return 'budget';
    }
    if (text.includes('comfortable') || text.includes('decent') || text.includes('good income')) {
      return 'comfortable';
    }
    if (text.includes('business') || text.includes('entrepreneur') || text.includes('owner')) {
      return 'entrepreneur';
    }
    
    return 'unknown';
  }

  identifyWorkStyle(text) {
    if (text.includes('freelance') || text.includes('freelancer')) return 'solo_freelancer';
    if (text.includes('remote employee') || text.includes('remote worker')) return 'remote_employee';
    if (text.includes('business owner') || text.includes('entrepreneur')) return 'business_owner';
    if (text.includes('investor') || text.includes('investment')) return 'investor';
    
    return 'unknown';
  }

  extractSkillsMentioned(text) {
    const skills = [];
    const skillKeywords = [
      'programming', 'coding', 'design', 'marketing', 'writing', 'photography',
      'language', 'teaching', 'consulting', 'management', 'sales'
    ];
    
    skillKeywords.forEach(skill => {
      if (text.includes(skill)) {
        skills.push(skill);
      }
    });
    
    return skills;
  }

  extractBusinessMentions(text) {
    const businessMentions = [];
    const businessPatterns = [
      /(?:business|company|startup|venture)[^.]*\./gi,
      /(?:client|customer|revenue|profit)[^.]*\./gi
    ];
    
    businessPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        businessMentions.push(...matches.map(match => match.trim()));
      }
    });
    
    return businessMentions.slice(0, 6);
  }

  /**
   * DÉTECTION DU PROFIL LIFESTYLE
   */
  detectLifestyleProfile(postData) {
    const text = postData.content.toLowerCase();
    
    return {
      social_preference: this.detectSocialPreference(text),
      activity_level: this.assessActivityLevel(text),
      cultural_interest: this.assessCulturalInterest(text),
      comfort_zone: this.assessComfortZone(text),
      hobbies_mentioned: this.extractHobbiesMentioned(text)
    };
  }

  detectSocialPreference(text) {
    if (text.includes('introvert') || text.includes('quiet') || text.includes('alone')) {
      return 'introvert';
    }
    if (text.includes('extrovert') || text.includes('social') || text.includes('party')) {
      return 'extrovert';
    }
    if (text.includes('balanced') || text.includes('mix')) {
      return 'ambivert';
    }
    
    return 'unknown';
  }

  assessActivityLevel(text) {
    if (text.includes('low key') || text.includes('relaxed') || text.includes('chill')) {
      return 'low';
    }
    if (text.includes('active') || text.includes('sport') || text.includes('fitness')) {
      return 'high';
    }
    if (text.includes('extreme') || text.includes('adventure') || text.includes('intense')) {
      return 'extreme';
    }
    
    return 'moderate';
  }

  assessCulturalInterest(text) {
    if (text.includes('culture') || text.includes('local') || text.includes('traditional')) {
      return 'high';
    }
    if (text.includes('not interested') || text.includes('don\'t care')) {
      return 'low';
    }
    
    return 'moderate';
  }

  assessComfortZone(text) {
    if (text.includes('adventure') || text.includes('risk') || text.includes('challenge')) {
      return 'adventurous';
    }
    if (text.includes('comfortable') || text.includes('safe') || text.includes('secure')) {
      return 'conservative';
    }
    
    return 'balanced';
  }

  extractHobbiesMentioned(text) {
    const hobbies = [];
    const hobbyKeywords = [
      'photography', 'cooking', 'reading', 'gaming', 'music', 'art',
      'sports', 'fitness', 'travel', 'hiking', 'diving', 'surfing'
    ];
    
    hobbyKeywords.forEach(hobby => {
      if (text.includes(hobby)) {
        hobbies.push(hobby);
      }
    });
    
    return hobbies;
  }

  /**
   * ANALYSE GÉOGRAPHIQUE CONTEXTUELLE
   */
  analyzeGeographicalContext(postData) {
    const text = postData.content.toLowerCase();
    
    return {
      local_context: this.analyzeLocalContext(text),
      regional_context: this.analyzeRegionalContext(text),
      infrastructure: this.assessInfrastructure(text),
      community: this.assessCommunity(text)
    };
  }

  analyzeLocalContext(text) {
    return {
      city_type: this.detectCityType(text),
      expat_community: this.assessExpatCommunity(text),
      infrastructure: this.assessLocalInfrastructure(text)
    };
  }

  detectCityType(text) {
    if (text.includes('megacity') || text.includes('huge') || text.includes('massive')) {
      return 'megacity';
    }
    if (text.includes('small town') || text.includes('village') || text.includes('rural')) {
      return 'small_town';
    }
    if (text.includes('rural') || text.includes('countryside')) {
      return 'rural';
    }
    
    return 'mid_size';
  }

  assessExpatCommunity(text) {
    const community = {
      size: 'unknown',
      integration_level: 'unknown',
      support_network: 'unknown'
    };
    
    if (text.includes('large community') || text.includes('many expats')) {
      community.size = 'large';
    }
    if (text.includes('small community') || text.includes('few expats')) {
      community.size = 'small';
    }
    if (text.includes('integrated') || text.includes('local friends')) {
      community.integration_level = 'integrated';
    }
    if (text.includes('isolated') || text.includes('alone')) {
      community.integration_level = 'isolated';
    }
    
    return community;
  }

  assessLocalInfrastructure(text) {
    const infrastructure = {
      internet_quality: 'unknown',
      transport: 'unknown',
      healthcare: 'unknown'
    };
    
    if (text.includes('good internet') || text.includes('fast wifi')) {
      infrastructure.internet_quality = 'excellent';
    }
    if (text.includes('bad internet') || text.includes('slow wifi')) {
      infrastructure.internet_quality = 'poor';
    }
    if (text.includes('good transport') || text.includes('convenient')) {
      infrastructure.transport = 'excellent';
    }
    if (text.includes('bad transport') || text.includes('difficult')) {
      infrastructure.transport = 'poor';
    }
    
    return infrastructure;
  }

  analyzeRegionalContext(text) {
    return {
      visa_friendliness: this.assessVisaFriendliness(text),
      cost_of_living_trend: this.assessCostTrend(text),
      business_environment: this.assessBusinessEnvironment(text)
    };
  }

  assessVisaFriendliness(text) {
    if (text.includes('easy visa') || text.includes('simple process')) {
      return 'very_easy';
    }
    if (text.includes('difficult visa') || text.includes('complicated process')) {
      return 'difficult';
    }
    if (text.includes('moderate') || text.includes('average')) {
      return 'moderate';
    }
    
    return 'unknown';
  }

  assessCostTrend(text) {
    if (text.includes('increasing') || text.includes('rising costs')) {
      return 'increasing';
    }
    if (text.includes('decreasing') || text.includes('cheaper')) {
      return 'decreasing';
    }
    
    return 'stable';
  }

  assessBusinessEnvironment(text) {
    if (text.includes('business friendly') || text.includes('easy to start')) {
      return 'very_friendly';
    }
    if (text.includes('difficult business') || text.includes('bureaucracy')) {
      return 'challenging';
    }
    
    return 'neutral';
  }

  assessInfrastructure(text) {
    const infrastructure = {
      internet_quality: 'unknown',
      transport: 'unknown',
      healthcare: 'unknown',
      score: 0
    };
    
    let score = 0;
    
    if (text.includes('good internet') || text.includes('fast wifi')) {
      infrastructure.internet_quality = 'excellent';
      score += 30;
    }
    if (text.includes('good transport') || text.includes('convenient')) {
      infrastructure.transport = 'excellent';
      score += 30;
    }
    if (text.includes('good healthcare') || text.includes('quality medical')) {
      infrastructure.healthcare = 'excellent';
      score += 40;
    }
    
    infrastructure.score = score;
    return infrastructure;
  }

  assessCommunity(text) {
    const community = {
      size: 'unknown',
      integration_level: 'unknown',
      support_network: 'unknown',
      score: 0
    };
    
    let score = 0;
    
    if (text.includes('large community') || text.includes('many expats')) {
      community.size = 'large';
      score += 30;
    }
    if (text.includes('integrated') || text.includes('local friends')) {
      community.integration_level = 'integrated';
      score += 40;
    }
    if (text.includes('supportive') || text.includes('helpful community')) {
      community.support_network = 'strong';
      score += 30;
    }
    
    community.score = score;
    return community;
  }

  /**
   * EXTRACTION D'INSIGHTS ACTIONNABLES
   */
  extractActionableInsights(postData) {
    const text = postData.content.toLowerCase();
    
    return {
      practical_tips: this.extractPracticalTips(text),
      business_opportunities: this.identifyBusinessOpportunities(text),
      recommended_resources: this.extractRecommendedResources(text),
      common_mistakes: this.extractCommonMistakes(text),
      success_factors: this.extractSuccessFactors(text)
    };
  }

  /**
   * CALCUL DU SCORING DE PERTINENCE
   */
  calculateRelevanceScoring(postData) {
    // Éviter la récursion en analysant directement le contenu
    const text = postData.content.toLowerCase();
    
    return {
      overall_score: this.calculateOverallScoreDirect(text),
      audience_scores: this.calculateAudienceScoresDirect(text),
      thematic_scores: this.calculateThematicScoresDirect(text),
      business_potential: this.calculateBusinessPotentialDirect(text)
    };
  }

  /**
   * DÉTECTION DE PATTERNS ÉVOLUTIFS
   */
  detectPatterns(postData) {
    const text = postData.content.toLowerCase();
    
    return {
      temporal_patterns: this.detectTemporalPatterns(text),
      behavioral_patterns: this.detectBehavioralPatterns(text),
      success_patterns: this.detectSuccessPatterns(text),
      failure_patterns: this.detectFailurePatterns(text)
    };
  }

  // === MÉTHODES UTILITAIRES ===

  detectEmotionalEvolution(text) {
    // Détection de l'évolution émotionnelle dans le texte
    const positiveWords = ['improved', 'better', 'growing', 'increasing', 'enhanced'];
    const negativeWords = ['worse', 'declining', 'decreasing', 'deteriorating'];
    
    const positiveCount = positiveWords.reduce((count, word) => 
      count + (text.match(new RegExp(word, 'g')) || []).length, 0);
    const negativeCount = negativeWords.reduce((count, word) => 
      count + (text.match(new RegExp(word, 'g')) || []).length, 0);
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'stable';
  }

  identifyEmotionalTriggers(text) {
    const triggers = [];
    
    if (text.includes('cost') || text.includes('expensive') || text.includes('cheap')) {
      triggers.push('cost_of_living');
    }
    if (text.includes('community') || text.includes('friends') || text.includes('network')) {
      triggers.push('community');
    }
    if (text.includes('work') || text.includes('job') || text.includes('business')) {
      triggers.push('work_opportunities');
    }
    if (text.includes('culture') || text.includes('language') || text.includes('local')) {
      triggers.push('cultural_shock');
    }
    
    return triggers;
  }

  extractBudgetBreakdown(text) {
    // Extraction des informations de budget
    const budgetInfo = {
      accommodation: this.extractCostInfo(text, this.budgetKeywords.accommodation),
      food: this.extractCostInfo(text, this.budgetKeywords.food),
      transport: this.extractCostInfo(text, this.budgetKeywords.transport),
      entertainment: this.extractCostInfo(text, this.budgetKeywords.entertainment)
    };
    
    return budgetInfo;
  }

  extractCostInfo(text, keywords) {
    const costInfo = { min: null, max: null, currency: 'USD' };
    
    keywords.forEach(keyword => {
      const regex = new RegExp(`${keyword}[^.]*?(\\$?\\d+)`, 'gi');
      const matches = text.match(regex);
      
      if (matches) {
        matches.forEach(match => {
          const amount = parseFloat(match.replace(/[^0-9.]/g, ''));
          if (amount) {
            if (!costInfo.min || amount < costInfo.min) costInfo.min = amount;
            if (!costInfo.max || amount > costInfo.max) costInfo.max = amount;
          }
        });
      }
    });
    
    return costInfo;
  }

  extractTimeline(text) {
    const timeline = {
      preparation: 'unknown',
      adaptation: 'unknown',
      integration: 'unknown'
    };
    
    // Détection de la période de préparation
    if (text.includes('weeks') || text.includes('month')) {
      timeline.preparation = 'weeks';
    } else if (text.includes('months') || text.includes('year')) {
      timeline.preparation = 'months';
    }
    
    // Détection de l'adaptation
    if (text.includes('immediate') || text.includes('right away')) {
      timeline.adaptation = 'immediate';
    } else if (text.includes('gradual') || text.includes('slowly')) {
      timeline.adaptation = 'gradual';
    } else if (text.includes('challenging') || text.includes('difficult')) {
      timeline.adaptation = 'challenging';
    }
    
    return timeline;
  }

  detectExperienceLevel(text) {
    let level = 'unknown';
    let score = 0;
    
    Object.keys(this.experienceIndicators).forEach(expLevel => {
      const indicators = this.experienceIndicators[expLevel];
      const matches = indicators.reduce((count, indicator) => 
        count + (text.match(new RegExp(indicator, 'g')) || []).length, 0);
      
      if (matches > score) {
        score = matches;
        level = expLevel;
      }
    });
    
    return level;
  }

  detectMotivationDriver(text) {
    const motivations = {
      financial: ['money', 'cost', 'cheap', 'expensive', 'budget', 'income'],
      lifestyle: ['lifestyle', 'quality of life', 'work-life balance', 'freedom'],
      adventure: ['adventure', 'explore', 'discover', 'new', 'different'],
      business: ['business', 'opportunity', 'market', 'entrepreneur', 'startup'],
      family: ['family', 'children', 'kids', 'education', 'school']
    };
    
    let maxScore = 0;
    let primaryMotivation = 'unknown';
    
    Object.keys(motivations).forEach(motivation => {
      const keywords = motivations[motivation];
      const score = keywords.reduce((count, keyword) => 
        count + (text.match(new RegExp(keyword, 'g')) || []).length, 0);
      
      if (score > maxScore) {
        maxScore = score;
        primaryMotivation = motivation;
      }
    });
    
    return primaryMotivation;
  }

  calculateOverallScoreDirect(text) {
    const scores = {
      authenticity: this.calculateAuthenticityScoreDirect(text),
      actionability: this.calculateActionabilityScoreDirect(text),
      uniqueness: this.calculateUniquenessScoreDirect(text),
      emotional_impact: this.calculateEmotionalImpactScoreDirect(text),
      business_potential: this.calculateBusinessPotentialDirect(text)
    };
    
    return {
      ...scores,
      average: Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length)
    };
  }

  calculateAuthenticityScoreDirect(text) {
    // Score basé sur la spécificité des détails
    let score = 50; // Base score
    
    // Vérifier la présence de coûts spécifiques
    if (text.includes('$') || text.includes('USD') || text.includes('dollars')) score += 20;
    
    // Vérifier la mention de pays
    const countries = ['thailand', 'vietnam', 'indonesia', 'philippines', 'malaysia', 'singapore'];
    if (countries.some(country => text.includes(country))) score += 15;
    
    // Vérifier la présence de conseils pratiques
    if (text.includes('tip') || text.includes('advice') || text.includes('recommend')) score += 15;
    
    return Math.min(100, score);
  }

  calculateActionabilityScoreDirect(text) {
    // Score basé sur le nombre de conseils pratiques
    const tipsCount = (text.match(/tip|advice|recommend|suggest/gi) || []).length;
    const resourcesCount = (text.match(/use|try|check|website|app/gi) || []).length;
    
    return Math.min(100, (tipsCount * 10) + (resourcesCount * 5));
  }

  calculateUniquenessScoreDirect(text) {
    // Score basé sur l'originalité du contenu
    let score = 30; // Base score
    
    if (text.includes('business') || text.includes('opportunity') || text.includes('startup')) score += 20;
    if (text.includes('success') || text.includes('worked') || text.includes('helped')) score += 25;
    if (text.includes('advantage') || text.includes('benefit') || text.includes('pro')) score += 25;
    
    return Math.min(100, score);
  }

  calculateEmotionalImpactScoreDirect(text) {
    // Score basé sur l'intensité émotionnelle
    const emotionalWords = ['amazing', 'incredible', 'love', 'perfect', 'fantastic', 'wow', 'stunning'];
    const emotionalCount = emotionalWords.reduce((count, word) => 
      count + (text.match(new RegExp(word, 'gi')) || []).length, 0);
    
    return Math.min(100, emotionalCount * 15);
  }

  calculateBusinessPotentialDirect(text) {
    // Score basé sur le potentiel de monétisation
    let score = 20; // Base score
    
    if (text.includes('business') || text.includes('opportunity') || text.includes('startup')) score += 30;
    if (text.includes('developer') || text.includes('programmer') || text.includes('tech')) score += 25;
    if (text.includes('good internet') || text.includes('fast wifi') || text.includes('infrastructure')) score += 25;
    
    return Math.min(100, score);
  }

  calculateAudienceScoresDirect(text) {
    const audienceScores = {};
    
    // Score pour débutants
    audienceScores.beginner = this.calculateBeginnerScoreDirect(text);
    
    // Score pour confirmés
    audienceScores.intermediate = this.calculateIntermediateScoreDirect(text);
    
    // Score pour experts
    audienceScores.expert = this.calculateExpertScoreDirect(text);
    
    // Score pour familles
    audienceScores.family = this.calculateFamilyScoreDirect(text);
    
    // Score pour seniors
    audienceScores.senior = this.calculateSeniorScoreDirect(text);
    
    return audienceScores;
  }

  calculateBeginnerScoreDirect(text) {
    let score = 0;
    
    if (text.includes('first time') || text.includes('new to') || text.includes('beginner')) score += 40;
    if (text.includes('mistake') || text.includes('error') || text.includes('wrong')) score += 30;
    if (text.includes('preparation') || text.includes('prepare') || text.includes('planning')) score += 30;
    
    return Math.min(100, score);
  }

  calculateIntermediateScoreDirect(text) {
    let score = 0;
    
    if (text.includes('few months') || text.includes('couple of years') || text.includes('some experience')) score += 40;
    if (text.includes('network') || text.includes('community') || text.includes('friends')) score += 30;
    if (text.includes('business') || text.includes('opportunity') || text.includes('startup')) score += 30;
    
    return Math.min(100, score);
  }

  calculateExpertScoreDirect(text) {
    let score = 0;
    
    if (text.includes('years of') || text.includes('veteran') || text.includes('expert')) score += 40;
    if (text.includes('business') || text.includes('opportunity') || text.includes('startup')) score += 35;
    if (text.includes('business owner') || text.includes('entrepreneur') || text.includes('owner')) score += 25;
    
    return Math.min(100, score);
  }

  calculateFamilyScoreDirect(text) {
    let score = 0;
    
    if (text.includes('family') || text.includes('children') || text.includes('kids')) score += 40;
    if (text.includes('healthcare') || text.includes('medical') || text.includes('health')) score += 30;
    if (text.includes('comfortable') || text.includes('safe') || text.includes('secure')) score += 30;
    
    return Math.min(100, score);
  }

  calculateSeniorScoreDirect(text) {
    let score = 0;
    
    if (text.includes('low key') || text.includes('relaxed') || text.includes('chill')) score += 30;
    if (text.includes('healthcare') || text.includes('medical') || text.includes('health')) score += 40;
    if (text.includes('budget') || text.includes('cheap') || text.includes('affordable')) score += 30;
    
    return Math.min(100, score);
  }

  calculateThematicScoresDirect(text) {
    return {
      visa_legal: this.calculateVisaLegalScoreDirect(text),
      accommodation: this.calculateAccommodationScoreDirect(text),
      work_opportunities: this.calculateWorkOpportunitiesScoreDirect(text),
      transport: this.calculateTransportScoreDirect(text),
      health_safety: this.calculateHealthSafetyScoreDirect(text),
      finance_taxes: this.calculateFinanceTaxesScoreDirect(text)
    };
  }

  calculateVisaLegalScoreDirect(text) {
    let score = 0;
    
    if (text.includes('preparation') || text.includes('prepare') || text.includes('planning')) score += 30;
    if (text.includes('visa') || text.includes('legal') || text.includes('document')) score += 40;
    if (text.includes('easy visa') || text.includes('simple process') || text.includes('visa friendly')) score += 30;
    
    return Math.min(100, score);
  }

  calculateAccommodationScoreDirect(text) {
    let score = 0;
    
    if (text.includes('$') || text.includes('USD') || text.includes('dollars')) score += 40;
    if (text.includes('airbnb') || text.includes('hotel') || text.includes('apartment')) score += 30;
    if (text.includes('city') || text.includes('urban') || text.includes('downtown')) score += 30;
    
    return Math.min(100, score);
  }

  calculateWorkOpportunitiesScoreDirect(text) {
    let score = 0;
    
    if (text.includes('business') || text.includes('opportunity') || text.includes('startup')) score += 40;
    if (text.includes('developer') || text.includes('programmer') || text.includes('tech')) score += 30;
    if (text.includes('network') || text.includes('community') || text.includes('friends')) score += 30;
    
    return Math.min(100, score);
  }

  calculateTransportScoreDirect(text) {
    let score = 0;
    
    if (text.includes('$') || text.includes('USD') || text.includes('dollars')) score += 40;
    if (text.includes('good transport') || text.includes('convenient') || text.includes('easy')) score += 30;
    if (text.includes('transport') || text.includes('flight') || text.includes('bus')) score += 30;
    
    return Math.min(100, score);
  }

  calculateHealthSafetyScoreDirect(text) {
    let score = 0;
    
    if (text.includes('healthcare') || text.includes('medical') || text.includes('health')) score += 40;
    if (text.includes('health') || text.includes('safety') || text.includes('secure')) score += 30;
    if (text.includes('good healthcare') || text.includes('quality medical')) score += 30;
    
    return Math.min(100, score);
  }

  calculateFinanceTaxesScoreDirect(text) {
    let score = 0;
    
    if (text.includes('$') || text.includes('USD') || text.includes('dollars')) score += 30;
    if (text.includes('business') || text.includes('opportunity') || text.includes('startup')) score += 40;
    if (text.includes('business owner') || text.includes('entrepreneur') || text.includes('owner')) score += 30;
    
    return Math.min(100, score);
  }

  // === MÉTHODES D'EXTRACTION SPÉCIFIQUES ===

  extractPracticalTips(text) {
    const tips = [];
    const tipPatterns = [
      /(?:tip|advice|recommend|suggest|should|don't|avoid)[^.]*\./gi,
      /(?:pro tip|insider tip|secret)[^.]*\./gi
    ];
    
    tipPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        tips.push(...matches.map(match => match.trim()));
      }
    });
    
    return tips.slice(0, 10); // Limite à 10 conseils
  }

  extractRecommendedResources(text) {
    const resources = [];
    const resourcePatterns = [
      /(?:use|try|check out|recommend|suggest)[^.]*\./gi,
      /(?:website|app|service|tool)[^.]*\./gi
    ];
    
    resourcePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        resources.push(...matches.map(match => match.trim()));
      }
    });
    
    return resources.slice(0, 8); // Limite à 8 ressources
  }

  extractCommonMistakes(text) {
    const mistakes = [];
    const mistakePatterns = [
      /(?:mistake|error|wrong|don't|avoid|warning)[^.]*\./gi,
      /(?:learned|realized|discovered)[^.]*\./gi
    ];
    
    mistakePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        mistakes.push(...matches.map(match => match.trim()));
      }
    });
    
    return mistakes.slice(0, 6); // Limite à 6 erreurs
  }

  extractSuccessFactors(text) {
    const factors = [];
    const successPatterns = [
      /(?:success|worked|helped|key|important|crucial)[^.]*\./gi,
      /(?:secret|trick|hack|insider)[^.]*\./gi
    ];
    
    successPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        factors.push(...matches.map(match => match.trim()));
      }
    });
    
    return factors.slice(0, 6); // Limite à 6 facteurs
  }

  // === MÉTHODES DE DÉTECTION DE PATTERNS ===

  detectTemporalPatterns(text) {
    const patterns = {
      seasonal_trends: [],
      market_changes: [],
      community_evolution: []
    };
    
    // Détection des tendances saisonnières
    if (text.includes('season') || text.includes('weather')) {
      patterns.seasonal_trends.push('seasonal_awareness');
    }
    
    // Détection des changements de marché
    if (text.includes('increasing') || text.includes('rising') || text.includes('cheaper')) {
      patterns.market_changes.push('cost_changes');
    }
    
    // Détection de l'évolution communautaire
    if (text.includes('growing') || text.includes('more people') || text.includes('community')) {
      patterns.community_evolution.push('community_growth');
    }
    
    return patterns;
  }

  detectBehavioralPatterns(text) {
    const patterns = {
      common_journeys: [],
      success_factors: [],
      failure_patterns: []
    };
    
    // Détection des parcours communs
    if (text.includes('typical') || text.includes('common') || text.includes('usual')) {
      patterns.common_journeys.push('typical_path');
    }
    
    // Détection des facteurs de succès
    if (text.includes('success') || text.includes('worked') || text.includes('helped')) {
      patterns.success_factors.push('success_indicators');
    }
    
    // Détection des patterns d'échec
    if (text.includes('mistake') || text.includes('error') || text.includes('wrong')) {
      patterns.failure_patterns.push('failure_indicators');
    }
    
    return patterns;
  }

  detectSuccessPatterns(text) {
    const patterns = [];
    
    if (text.includes('network') || text.includes('community')) {
      patterns.push('networking_success');
    }
    if (text.includes('business') || text.includes('opportunity')) {
      patterns.push('business_success');
    }
    if (text.includes('skill') || text.includes('learn')) {
      patterns.push('skill_development');
    }
    
    return patterns;
  }

  detectFailurePatterns(text) {
    const patterns = [];
    
    if (text.includes('isolated') || text.includes('lonely')) {
      patterns.push('social_isolation');
    }
    if (text.includes('expensive') || text.includes('cost')) {
      patterns.push('financial_strain');
    }
    if (text.includes('difficult') || text.includes('challenging')) {
      patterns.push('adaptation_difficulties');
    }
    
    return patterns;
  }
}

export default AdvancedRedditAnalyzer;
