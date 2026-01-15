#!/usr/bin/env node

/**
 * Editorial Enhancer - Amélioration qualitative article (post-production)
 * 
 * Objectif : Élever le niveau éditorial et SEO des articles FlashVoyage
 * pour dépasser les meilleurs résultats Google, sans jamais inventer de contenu.
 * 
 * Contraintes absolues :
 * - ❌ Aucune invention de faits, chiffres, lieux ou événements
 * - ❌ Aucun ajout non présent dans extraction Reddit / story / insights
 * - ✅ Tout ajout = reformulation, structuration ou mise en valeur de matière existante
 */

import { parseBool } from './config.js';

const ENABLE_EDITORIAL_ENHANCER = parseBool(process.env.ENABLE_EDITORIAL_ENHANCER ?? '1');

class EditorialEnhancer {
  constructor() {
    this.enabled = ENABLE_EDITORIAL_ENHANCER;
    // Import pour traduction (lazy initialization)
    this.intelligentAnalyzer = null;
    this._analyzerInitialized = false;
  }

  async _initAnalyzer() {
    if (this._analyzerInitialized) return;
    
    try {
      const IntelligentContentAnalyzerOptimized = (await import('./intelligent-content-analyzer-optimized.js')).default;
      this.intelligentAnalyzer = new IntelligentContentAnalyzerOptimized();
      this._analyzerInitialized = true;
      console.log('✅ Editorial Enhancer: IntelligentAnalyzer initialisé pour traduction');
    } catch (error) {
      console.warn('⚠️ Impossible d\'initialiser IntelligentContentAnalyzer pour traduction:', error.message);
    }
  }

  /**
   * Améliore l'article avec des éléments éditoriaux premium
   * @param {string} html - Contenu HTML de l'article
   * @param {Object} pipelineContext - Contexte du pipeline (story, pattern, extraction)
   * @returns {Object} { html: string, enhancements: Object }
   */
  async enhanceArticle(html, pipelineContext = {}) {
    if (!this.enabled) {
      console.log('⚠️ Editorial Enhancer désactivé');
      return { html, enhancements: {} };
    }

    console.log('\n🎨 ÉDITORIAL ENHANCER - Amélioration qualitative');
    console.log('='.repeat(60));

    // Accéder correctement aux données depuis pipelineContext
    // Structure: pipelineContext.story = { extracted, story: story.story, evidence }
    const storyData = pipelineContext.story?.story || pipelineContext.story;
    const extraction = pipelineContext.story?.extracted || pipelineContext.extraction;
    const pattern = pipelineContext.pattern;
    const evidence = pipelineContext.story?.evidence;
    
    if (!storyData || !extraction) {
      console.warn('⚠️ Contexte incomplet (story/extraction manquants)');
      return { html, enhancements: {} };
    }
    
    // Reconstruire l'objet story avec evidence
    const story = {
      ...storyData,
      evidence: evidence || storyData.evidence || { source_snippets: [] }
    };

    let enhancedHtml = html;
    const enhancements = {
      citationsAdded: 0,
      faqAdded: false,
      semanticReinforcement: 0,
      actionableLists: 0,
      hierarchyImproved: 0
    };

    // 1️⃣ Ajouter des blocs de citations Reddit explicites (avec traduction)
    enhancedHtml = await this.addRedditCitations(enhancedHtml, story, extraction, enhancements);

    // 2️⃣ Ajouter une section FAQ SEO structurée (avec traduction)
    enhancedHtml = await this.addFAQSection(enhancedHtml, story, pattern, enhancements);

    // 3️⃣ Renforcer la sémantique SEO (répétition intelligente)
    enhancedHtml = this.reinforceSemanticSEO(enhancedHtml, story, pattern, extraction, enhancements);

    // 4️⃣ Transformer passages narratifs en listes actionnables
    enhancedHtml = this.addActionableLists(enhancedHtml, story, enhancements);

    // 5️⃣ Renforcer la hiérarchie éditoriale (H2/H3)
    enhancedHtml = this.improveEditorialHierarchy(enhancedHtml, story, pattern, enhancements);

    console.log(`\n✅ Enhancements appliqués:`);
    console.log(`   📝 Citations Reddit: ${enhancements.citationsAdded}`);
    console.log(`   ❓ FAQ: ${enhancements.faqAdded ? 'Oui' : 'Non'}`);
    console.log(`   🔍 Renforcement SEO: ${enhancements.semanticReinforcement} occurrences`);
    console.log(`   📋 Listes actionnables: ${enhancements.actionableLists}`);
    console.log(`   📊 Hiérarchie améliorée: ${enhancements.hierarchyImproved} sections`);

    return { html: enhancedHtml, enhancements };
  }

  /**
   * 1️⃣ Ajouter des blocs de citations Reddit explicites
   * Format strict: <blockquote data-source="reddit">Texte exact traduit</blockquote>
   */
  async addRedditCitations(html, story, extraction, enhancements) {
    // Initialiser l'analyzer si pas encore fait
    await this._initAnalyzer();
    
    if (!story.evidence?.source_snippets || story.evidence.source_snippets.length === 0) {
      return html;
    }

    console.log('\n📝 1️⃣ Citations Reddit explicites...');

    // Extraire les snippets les plus pertinents (max 3-5)
    let snippets = story.evidence.source_snippets
      .filter(s => s.snippet && s.snippet.length > 30 && s.snippet.length < 300)
      .filter(s => s.origin === 'selftext' || s.origin === 'comment');

    if (snippets.length === 0) {
      console.log('   ⚠️ Aucun snippet valide trouvé');
      return html;
    }

    // DÉDUPLICATION : Normaliser et supprimer les doublons
    const normalizeText = (text) => {
      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100); // Prendre les 100 premiers caractères pour comparaison
    };

    const seen = new Map();
    const uniqueSnippets = [];
    for (const snippet of snippets) {
      const text = snippet.snippet.trim();
      const normalized = normalizeText(text);
      if (!seen.has(normalized)) {
        seen.set(normalized, true);
        uniqueSnippets.push(snippet);
        if (uniqueSnippets.length >= 5) break; // Max 5 citations uniques
      }
    }

    snippets = uniqueSnippets;

    if (snippets.length === 0) {
      console.log('   ⚠️ Aucun snippet unique trouvé après déduplication');
      return html;
    }

    // Vérifier si la section existe déjà (éviter duplication)
    if (html.includes('<h2>💬 Ce que dit le témoignage</h2>') || 
        html.includes('<h2>Ce que dit le témoignage</h2>')) {
      console.log('   ⚠️ Section citations déjà présente, skip');
      return html;
    }

    // Trouver l'emplacement optimal : après le premier H2 "Contexte" ou au début
    let insertionPoint = html.indexOf('<h2>Contexte</h2>');
    if (insertionPoint === -1) {
      insertionPoint = html.indexOf('<h2>');
    }
    if (insertionPoint === -1) {
      insertionPoint = html.indexOf('</h1>') + 5; // Après le titre H1
    }

    if (insertionPoint === -1 || insertionPoint < 0) {
      console.log('   ⚠️ Impossible de trouver un point d\'insertion');
      return html;
    }

    // Construire les blockquotes avec TRADUCTION
    const citationsHtmlPromises = snippets.map(async (snippet) => {
      const text = snippet.snippet.trim();
      // Nettoyer le texte (retirer guillemets superflus)
      let cleanText = text.replace(/^["']+|["']+$/g, '').trim();
      
      // TRADUIRE si anglais
      if (this.intelligentAnalyzer) {
        const englishDetection = this.intelligentAnalyzer.detectEnglishContent(cleanText);
        if (englishDetection.isEnglish && englishDetection.ratio > 0.3) {
          console.log(`   🔄 Traduction citation: "${cleanText.substring(0, 50)}..." (${Math.round(englishDetection.ratio * 100)}% EN)`);
          try {
            cleanText = await this.intelligentAnalyzer.translateToFrench(cleanText);
            console.log(`   ✅ Traduit: "${cleanText.substring(0, 50)}..."`);
          } catch (error) {
            console.warn(`   ⚠️ Échec traduction: ${error.message}`);
          }
        }
      }
      
      return `    <blockquote data-source="reddit">
      <p>${this.escapeHtml(cleanText)}</p>
    </blockquote>`;
    });

    const citationsHtml = (await Promise.all(citationsHtmlPromises)).join('\n\n');

    const citationsSection = `\n\n<h2>💬 Ce que dit le témoignage</h2>
${citationsHtml}\n`;

    // Insérer après le point d'insertion
    const before = html.substring(0, insertionPoint);
    const after = html.substring(insertionPoint);
    
    // Trouver la fin de la section (prochain H2 ou </p>)
    const nextH2 = after.indexOf('<h2>');
    const sectionEnd = nextH2 > 0 ? insertionPoint + nextH2 : insertionPoint + after.indexOf('</p>', 100) + 4;
    
    if (sectionEnd > insertionPoint && sectionEnd < html.length) {
      const newHtml = html.substring(0, sectionEnd) + citationsSection + html.substring(sectionEnd);
      enhancements.citationsAdded = snippets.length;
      console.log(`   ✅ ${snippets.length} citation(s) Reddit ajoutée(s) et traduite(s)`);
      return newHtml;
    }

    // Fallback : insérer directement après le point
    const newHtml = before + citationsSection + after;
    enhancements.citationsAdded = snippets.length;
    console.log(`   ✅ ${snippets.length} citation(s) Reddit ajoutée(s) et traduite(s)`);
    return newHtml;
  }

  /**
   * 2️⃣ Ajouter une section FAQ SEO structurée
   * Basée sur open_questions + community_insights + story contextuelle
   * TRADUITE EN FRANÇAIS
   */
  async addFAQSection(html, story, pattern, enhancements) {
    // Initialiser l'analyzer si pas encore fait
    await this._initAnalyzer();
    
    console.log('\n❓ 2️⃣ Section FAQ SEO...');

    const questions = [];

    // Extraire questions depuis open_questions
    if (story.open_questions && Array.isArray(story.open_questions) && story.open_questions.length > 0) {
      story.open_questions.forEach(q => {
        if (typeof q === 'string' && q.length > 10 && q.length < 200) {
          questions.push({ question: this.formatAsQuestion(q), source: 'open_questions' });
        }
      });
    }

    // Extraire questions implicites depuis community_insights
    if (story.community_insights && Array.isArray(story.community_insights) && story.community_insights.length > 0) {
      story.community_insights.forEach(insight => {
        const text = typeof insight === 'string' ? insight : (insight.value || insight.text || '');
        if (text && text.length > 20) {
          // Détecter si l'insight répond à une question implicite
          const question = this.extractImplicitQuestion(text, pattern);
          if (question) {
            questions.push({ question, answer: text, source: 'community_insights' });
          }
        }
      });
    }

    // Extraire questions depuis le contexte (si pattern = question/guide)
    if (pattern && (pattern.story_type === 'question' || pattern.story_type === 'guide')) {
      if (story.context?.summary) {
        const contextQuestion = this.extractQuestionFromContext(story.context.summary);
        if (contextQuestion) {
          questions.push({ question: contextQuestion, source: 'context' });
        }
      }
    }

    if (questions.length === 0) {
      console.log('   ⚠️ Aucune question trouvée pour la FAQ');
      return html;
    }

    // Limiter à 5 questions max
    const selectedQuestions = questions.slice(0, 5);

    // Construire la FAQ HTML avec TRADUCTION
    const faqItemsPromises = selectedQuestions.map(async (q, index) => {
      let question = q.question;
      let answer = q.answer || this.generateAnswerFromContext(q.question, story, pattern);
      
      // TRADUIRE question et answer si anglais
      if (this.intelligentAnalyzer) {
        const questionEnglish = this.intelligentAnalyzer.detectEnglishContent(question);
        if (questionEnglish.isEnglish && questionEnglish.ratio > 0.3) {
          console.log(`   🔄 Traduction question FAQ: "${question.substring(0, 50)}..."`);
          question = await this.intelligentAnalyzer.translateToFrench(question);
        }
        
        const answerEnglish = this.intelligentAnalyzer.detectEnglishContent(answer);
        if (answerEnglish.isEnglish && answerEnglish.ratio > 0.3) {
          console.log(`   🔄 Traduction réponse FAQ: "${answer.substring(0, 50)}..."`);
          answer = await this.intelligentAnalyzer.translateToFrench(answer);
        }
      }
      
      return `    <h3>${this.escapeHtml(question)}</h3>
    <p>${this.escapeHtml(answer)}</p>`;
    });
    
    const faqItems = (await Promise.all(faqItemsPromises)).join('\n\n');

    const faqSection = `\n\n<h2>Questions fréquentes</h2>
${faqItems}\n`;

    // Insérer avant "Nos recommandations" ou à la fin
    let insertionPoint = html.indexOf('<h2>🎯 Nos recommandations');
    if (insertionPoint === -1) {
      insertionPoint = html.indexOf('<h2>Nos recommandations');
    }
    if (insertionPoint === -1) {
      // Insérer avant le dernier H2
      const lastH2 = html.lastIndexOf('<h2>');
      if (lastH2 > 0) {
        insertionPoint = lastH2;
      } else {
        // Insérer à la fin
        insertionPoint = html.length;
      }
    }

    const before = html.substring(0, insertionPoint);
    const after = html.substring(insertionPoint);
    const newHtml = before + faqSection + after;

    enhancements.faqAdded = true;
    console.log(`   ✅ FAQ ajoutée avec ${selectedQuestions.length} question(s)`);
    return newHtml;
  }

  /**
   * 3️⃣ Renforcer la sémantique SEO (répétition intelligente)
   * Répète destination, thème principal, concepts clés (visa, assurance, etc.)
   * DÉSACTIVÉ : Provoque du texte parasite répétitif
   */
  reinforceSemanticSEO(html, story, pattern, extraction, enhancements) {
    console.log('\n🔍 3️⃣ Renforcement sémantique SEO...');
    console.log('   ⚠️ DÉSACTIVÉ : Évite le texte parasite répétitif');
    
    // DÉSACTIVÉ : Le renforcement sémantique automatique crée du texte parasite
    // Le LLM doit déjà intégrer les concepts clés naturellement dans le prompt
    enhancements.semanticReinforcement = 0;
    return html;
  }

  /**
   * 4️⃣ Transformer passages narratifs en listes actionnables
   */
  addActionableLists(html, story, enhancements) {
    console.log('\n📋 4️⃣ Listes actionnables...');

    let enhancedHtml = html;
    let listsAdded = 0;

    // Transformer author_lessons en liste si présent comme paragraphe
    if (story.author_lessons && Array.isArray(story.author_lessons) && story.author_lessons.length > 0) {
      const lessonsText = story.author_lessons.map(l => typeof l === 'string' ? l : (l.text || l.value || '')).filter(Boolean);
      
      if (lessonsText.length > 0) {
        // Chercher si les leçons sont déjà en liste
        const hasList = html.includes('<ul>') && html.includes('leçons');
        if (!hasList) {
          // Trouver la section "Ce que l'auteur retient"
          const sectionRegex = /<h2>Ce que l'auteur retient<\/h2>[\s\S]*?(?=<h2>|$)/i;
          const match = enhancedHtml.match(sectionRegex);
          
          if (match) {
            // Remplacer le contenu par une liste
            const listItems = lessonsText.map(lesson => `      <li>${this.escapeHtml(lesson)}</li>`).join('\n');
            const listHtml = `<h2>Ce que l'auteur retient</h2>\n<ul>\n${listItems}\n    </ul>`;
            enhancedHtml = enhancedHtml.replace(sectionRegex, listHtml);
            listsAdded++;
          }
        }
      }
    }

    // Transformer community_insights en checklist si approprié
    if (story.community_insights && Array.isArray(story.community_insights) && story.community_insights.length > 2) {
      const insightsText = story.community_insights
        .map(i => typeof i === 'string' ? i : (i.value || i.text || ''))
        .filter(i => i && i.length > 20 && i.length < 150);
      
      if (insightsText.length > 2) {
        // Vérifier si déjà en liste
        const hasList = html.includes('<h2>Ce que la communauté apporte</h2>') && html.includes('<ul>');
        if (!hasList) {
          const sectionRegex = /<h2>Ce que la communauté apporte<\/h2>[\s\S]*?(?=<h2>|$)/i;
          const match = enhancedHtml.match(sectionRegex);
          
          if (match) {
            const listItems = insightsText.slice(0, 5).map(insight => 
              `      <li>${this.escapeHtml(insight)}</li>`
            ).join('\n');
            const listHtml = `<h2>Ce que la communauté apporte</h2>\n<ul>\n${listItems}\n    </ul>`;
            enhancedHtml = enhancedHtml.replace(sectionRegex, listHtml);
            listsAdded++;
          }
        }
      }
    }

    enhancements.actionableLists = listsAdded;
    console.log(`   ✅ ${listsAdded} liste(s) actionnable(s) ajoutée(s)`);
    return enhancedHtml;
  }

  /**
   * 5️⃣ Renforcer la hiérarchie éditoriale (H2 = intentions, H3 = réponses)
   */
  improveEditorialHierarchy(html, story, pattern, enhancements) {
    console.log('\n📊 5️⃣ Hiérarchie éditoriale...');

    let enhancedHtml = html;
    let improvements = 0;

    // Vérifier que chaque H2 a au moins un H3 ou un contenu structuré
    const h2Regex = /<h2>([^<]+)<\/h2>/g;
    const h2Matches = [...html.matchAll(h2Regex)];

    h2Matches.forEach((match, index) => {
      const h2Title = match[1];
      const h2Start = match.index + match[0].length;
      const nextH2 = index < h2Matches.length - 1 ? h2Matches[index + 1].index : html.length;
      const sectionContent = html.substring(h2Start, nextH2);

      // Si la section n'a pas de H3 et contient plus de 300 caractères, ajouter des H3
      if (!sectionContent.includes('<h3>') && sectionContent.length > 300) {
        // Détecter les paragraphes qui pourraient devenir des H3
        const paragraphs = sectionContent.match(/<p>([^<]+)<\/p>/g);
        if (paragraphs && paragraphs.length > 2) {
          // Transformer le premier paragraphe en H3 si approprié
          const firstP = paragraphs[0];
          const firstPText = firstP.replace(/<[^>]+>/g, '').trim();
          
          if (firstPText.length > 30 && firstPText.length < 100) {
            const h3Title = this.generateH3Title(h2Title, firstPText, pattern);
            if (h3Title) {
              const h3Html = `<h3>${this.escapeHtml(h3Title)}</h3>`;
              enhancedHtml = enhancedHtml.replace(firstP, h3Html + '\n' + firstP);
              improvements++;
            }
          }
        }
      }
    });

    enhancements.hierarchyImproved = improvements;
    console.log(`   ✅ ${improvements} amélioration(s) de hiérarchie appliquée(s)`);
    return enhancedHtml;
  }

  // ========== HELPERS ==========

  formatAsQuestion(text) {
    // Reformuler un texte en question
    text = text.trim();
    if (text.endsWith('?')) {
      return text;
    }
    // Ajouter "?" si c'est une question implicite
    if (text.toLowerCase().startsWith('comment') || 
        text.toLowerCase().startsWith('pourquoi') ||
        text.toLowerCase().startsWith('quand') ||
        text.toLowerCase().startsWith('où')) {
      return text + ' ?';
    }
    // Sinon, reformuler en question
    return `Qu'en est-il de ${text.toLowerCase()} ?`;
  }

  extractImplicitQuestion(insightText, pattern) {
    // Détecter une question implicite dans un insight
    const lower = insightText.toLowerCase();
    
    // Patterns de questions implicites
    if (lower.includes('comment') || lower.includes('how to')) {
      return `Comment ${pattern?.theme_primary || 'procéder'} ?`;
    }
    if (lower.includes('pourquoi') || lower.includes('why')) {
      return `Pourquoi ${pattern?.theme_primary || 'cela'} ?`;
    }
    
    return null;
  }

  extractQuestionFromContext(contextText) {
    // Extraire une question depuis le contexte
    if (contextText && contextText.includes('?')) {
      const questionMatch = contextText.match(/([^.!?]*\?)/);
      if (questionMatch) {
        return questionMatch[1].trim();
      }
    }
    return null;
  }

  generateAnswerFromContext(question, story, pattern) {
    // Générer une réponse basée sur le contexte existant
    // Chercher dans les sections de story
    const sources = [
      story.context?.summary,
      story.resolution?.summary,
      ...(story.community_insights || []).map(i => typeof i === 'string' ? i : (i.value || i.text || ''))
    ].filter(Boolean);

    // Trouver la source la plus pertinente
    for (const source of sources) {
      if (source && source.length > 50 && source.length < 300) {
        return source;
      }
    }

    // Fallback : réponse générique basée sur le thème
    return `Cette question est abordée dans le témoignage. Pour plus de détails, consultez les sections ci-dessus.`;
  }

  extractKeyConcepts(story, pattern, extraction) {
    const concepts = [];

    // Destination
    if (extraction?.geo?.country || extraction?.geo?.city) {
      concepts.push({
        term: extraction.geo.country || extraction.geo.city,
        synonyms: [extraction.geo.city || extraction.geo.country]
      });
    }

    // Thème principal
    if (pattern.theme_primary) {
      const themeSynonyms = {
        'visa': ['visa', 'permis de séjour', 'documentation'],
        'assurance': ['assurance', 'couverture santé', 'protection'],
        'logement': ['logement', 'hébergement', 'appartement'],
        'budget': ['budget', 'coût', 'dépenses'],
        'logistique': ['logistique', 'organisation', 'préparation']
      };
      
      concepts.push({
        term: pattern.theme_primary,
        synonyms: themeSynonyms[pattern.theme_primary] || [pattern.theme_primary]
      });
    }

    return concepts;
  }

  generateH3Title(h2Title, paragraphText, pattern) {
    // Générer un titre H3 approprié basé sur le H2 et le paragraphe
    const lower = paragraphText.toLowerCase();
    
    // Patterns de titres H3
    if (lower.includes('visa') || lower.includes('document')) {
      return 'Documents et visa';
    }
    if (lower.includes('budget') || lower.includes('coût') || lower.includes('prix')) {
      return 'Budget et coûts';
    }
    if (lower.includes('logement') || lower.includes('hébergement')) {
      return 'Logement';
    }
    if (lower.includes('assurance') || lower.includes('santé')) {
      return 'Assurance et santé';
    }
    if (lower.includes('transport') || lower.includes('vol')) {
      return 'Transport et déplacements';
    }
    if (lower.includes('travail') || lower.includes('coworking')) {
      return 'Travail et coworking';
    }
    
    // Extraire les premiers mots du paragraphe (mais seulement si c'est une phrase complète)
    const words = paragraphText.split(' ').slice(0, 5).join(' ');
    if (words.length > 10 && words.length < 50 && words.includes(' ')) {
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
    
    return null;
  }

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default EditorialEnhancer;
