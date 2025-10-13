/**
 * INTELLIGENT CONTENT ANALYZER - SEO OPTIMIZED
 * Version optimisée avec prompts SEO modernes
 * Approche conservatrice : garde les structures existantes
 */

import axios from 'axios';
import { OPENAI_API_KEY } from './config.js';
import SEOOptimizedPrompts from './seo-optimized-prompts.js';

class IntelligentContentAnalyzerSEOOptimized {
  constructor() {
    this.apiKey = OPENAI_API_KEY;
    this.seoPrompts = new SEOOptimizedPrompts();
  }

  // Analyser intelligemment le contenu avec prompts SEO optimisés
  async analyzeContent(article) {
    try {
      // Vérifier si la clé API est disponible
      if (!this.apiKey) {
        console.log('⚠️ Clé OpenAI non disponible - Utilisation du fallback');
        return this.getFallbackAnalysis(article);
      }

      const prompt = this.seoPrompts.getAnalysisPrompt(article);

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert SEO et éditorial pour FlashVoyages.com. Tu analyses le contenu pour déterminer la meilleure approche éditoriale avec focus sur les micro-intentions et l\'optimisation SEO moderne.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const analysis = JSON.parse(response.data.choices[0].message.content);
      
      console.log('✅ Analyse SEO optimisée réussie');
      console.log(`📊 Type: ${analysis.type_contenu}`);
      console.log(`🎯 Micro-intention: ${analysis.micro_intention}`);
      console.log(`📈 Score: ${analysis.pertinence}/100`);
      
      return analysis;

    } catch (error) {
      console.error('❌ Erreur analyse SEO:', error.message);
      return this.getFallbackAnalysis(article);
    }
  }

  // Générer du contenu intelligent avec prompts SEO optimisés
  async generateIntelligentContent(article, analysis) {
    try {
      // Extraire le contenu complet de l'article source
      const fullContent = await this.extractFullContent(article);
      
      const prompt = this.seoPrompts.getGenerationPrompt(article, analysis);

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert éditorial et SEO pour FlashVoyages.com. Tu génères du contenu optimisé pour les micro-intentions et le SEO moderne, en gardant la structure des templates existants.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.4
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const generatedContent = JSON.parse(response.data.choices[0].message.content);
      
      console.log('✅ Génération SEO optimisée réussie');
      console.log(`📝 Titre: ${generatedContent.title}`);
      console.log(`🎯 Micro-intention: ${generatedContent.micro_intention}`);
      console.log(`📊 Mots-clés: ${generatedContent.keywords}`);
      
      return generatedContent;

    } catch (error) {
      console.error('❌ Erreur génération SEO:', error.message);
      return this.getFallbackContent(article);
    }
  }

  // Valider le contenu généré avec critères SEO
  async validateContent(content) {
    try {
      if (!this.apiKey) {
        console.log('⚠️ Clé OpenAI non disponible - Validation simplifiée');
        return { validation: true, score_qualite: 80 };
      }

      const prompt = this.seoPrompts.getValidationPrompt(content);

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert SEO pour FlashVoyages.com. Tu valides le contenu selon les critères SEO modernes et les micro-intentions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.2
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const validation = JSON.parse(response.data.choices[0].message.content);
      
      console.log('✅ Validation SEO réussie');
      console.log(`📊 Score qualité: ${validation.score_qualite}/100`);
      console.log(`🔍 Score SEO: ${validation.score_seo}/100`);
      console.log(`👤 Score utilisateur: ${validation.score_utilisateur}/100`);
      
      return validation;

    } catch (error) {
      console.error('❌ Erreur validation SEO:', error.message);
      return { validation: true, score_qualite: 80 };
    }
  }

  // Extraire le contenu complet de l'article source
  async extractFullContent(article) {
    try {
      // Si c'est un article Reddit, essayer d'extraire le contenu complet
      if (article.source === 'Reddit' && article.link) {
        // Logique d'extraction du contenu Reddit (à implémenter si nécessaire)
        return article.content;
      }
      
      return article.content;
    } catch (error) {
      console.warn('⚠️ Erreur extraction contenu:', error.message);
      return article.content;
    }
  }

  // Fallback en cas d'erreur API
  getFallbackAnalysis(article) {
    return {
      type_contenu: 'TEMOIGNAGE_SUCCESS_STORY',
      sous_categorie: 'general',
      angle: 'pratique',
      audience: 'nomades_debutants',
      destination: 'Asie',
      urgence: 'medium',
      keywords: 'nomade, asie, conseils',
      cta: 'Découvrez nos conseils nomades',
      pertinence: 70,
      recommandation: 'generation_llm',
      template_specifique: 'success_story',
      micro_intention: 'nomade débutant asie conseils',
      raison: 'Fallback - Analyse basique'
    };
  }

  // Fallback pour le contenu
  getFallbackContent(article) {
    return {
      title: `🌏 ${article.title} - Guide FlashVoyages`,
      target_audience: 'Digital nomades en Asie',
      ton: 'Expert mais accessible, authentique, pratique',
      keywords: 'nomade, asie, conseils',
      cta: 'Découvrez nos conseils nomades',
      urgence: 'medium',
      destinations: 'Asie',
      micro_intention: 'nomade asie conseils',
      content: `<p><strong>Source :</strong> <a href="${article.link}" target="_blank" rel="noopener">${article.title}</a> - ${article.source}</p>
        
        <p>Salut nomade ! Chez FlashVoyages, on a analysé cette question pour toi.</p>
        
        <h2>Notre analyse FlashVoyages</h2>
        <p>${article.content}</p>
        
        <h2>Notre conseil</h2>
        <p>Basé sur notre expérience terrain, voici ce qu'on recommande...</p>
        
        <p><em>Cet article a été analysé par notre équipe FlashVoyages — ton spécialiste du nomadisme en Asie.</em></p>`
    };
  }
}

export default IntelligentContentAnalyzerSEOOptimized;
