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
import { createChatCompletion } from './openai-client.js';

const ENABLE_EDITORIAL_ENHANCER = parseBool(process.env.ENABLE_EDITORIAL_ENHANCER ?? '1');

class EditorialEnhancer {
  constructor() {
    this.enabled = ENABLE_EDITORIAL_ENHANCER;
    // Import pour traduction
    this.intelligentAnalyzer = null;
    this._initAnalyzer();
  }

  async _initAnalyzer() {
    try {
      const IntelligentContentAnalyzerOptimized = (await import('./intelligent-content-analyzer-optimized.js')).default;
      this.intelligentAnalyzer = new IntelligentContentAnalyzerOptimized();
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
    const editorialMode = pipelineContext.editorial_mode || 'evergreen';
    const enhancements = {
      citationsAdded: 0,
      faqAdded: false,
      comparisonTableAdded: false,
      checklistAdded: false,
      semanticReinforcement: 0,
      actionableLists: 0,
      hierarchyImproved: 0
    };

    // 1️⃣ Ajouter des blocs de citations Reddit explicites (avec traduction)
    enhancedHtml = await this.addRedditCitations(enhancedHtml, story, extraction, enhancements);

    // 2️⃣ Ajouter une section FAQ SEO structurée (avec fallback LLM)
    enhancedHtml = await this.addFAQSection(enhancedHtml, story, pattern, enhancements);

    // 2b️⃣ EVERGREEN: Tableau comparatif si pertinent
    if (editorialMode === 'evergreen') {
      enhancedHtml = await this.addComparisonTable(enhancedHtml, story, extraction, pattern, enhancements);
    }

    // 2c️⃣ EVERGREEN: Checklist actionnable si pertinent
    if (editorialMode === 'evergreen') {
      enhancedHtml = await this.addChecklist(enhancedHtml, story, pattern, enhancements);
    }

    // 3️⃣ Renforcer la sémantique SEO (répétition intelligente)
    enhancedHtml = this.reinforceSemanticSEO(enhancedHtml, story, pattern, extraction, enhancements);

    // 4️⃣ Transformer passages narratifs en listes actionnables
    enhancedHtml = this.addActionableLists(enhancedHtml, story, enhancements);

    // 5️⃣ Renforcer la hiérarchie éditoriale (H2/H3)
    enhancedHtml = this.improveEditorialHierarchy(enhancedHtml, story, pattern, enhancements);

    console.log(`\n✅ Enhancements appliqués:`);
    console.log(`   📝 Citations Reddit: ${enhancements.citationsAdded}`);
    console.log(`   ❓ FAQ: ${enhancements.faqAdded ? 'Oui' : 'Non'}`);
    console.log(`   📊 Tableau comparatif: ${enhancements.comparisonTableAdded ? 'Oui' : 'Non'}`);
    console.log(`   ✅ Checklist: ${enhancements.checklistAdded ? 'Oui' : 'Non'}`);
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
   * Fallback LLM si aucune question trouvée dans les données
   */
  async addFAQSection(html, story, pattern, enhancements) {
    console.log('\n❓ 2️⃣ Section FAQ SEO...');

    // Vérifier si une FAQ existe déjà (HTML classique ou bloc Gutenberg)
    if (/<h2[^>]*>(?:FAQ|Questions?\s+fréquentes?|Foire\s+aux\s+questions)/i.test(html) ||
        /wp-block-heading[^>]*>Questions?\s+fréquentes/i.test(html)) {
      console.log('   ℹ️ FAQ déjà présente dans l\'article, skip');
      return html;
    }

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

    // Filtrer les questions nulles (rejetées par formatAsQuestion)
    const validQuestions = questions.filter(q => q.question !== null && q.question !== undefined);
    
    if (validQuestions.length === 0) {
      console.log('   ⚠️ Aucune question dans les données — tentative fallback LLM...');
      try {
        return await this.addFAQViaLLM(html, enhancements);
      } catch (faqError) {
        console.warn(`   ⚠️ Fallback FAQ LLM échoué: ${faqError.message}`);
        return html;
      }
    }

    // FAQ-1a: Détecter si les questions sont en anglais → basculer vers LLM français
    // Stratégie double: (1) stop words anglais ET (2) absence de marqueurs français
    const _enStopWords = /\b(the|a|an|is|are|was|were|have|has|had|in|for|to|with|best|how|what|where|which|do|does|can|will|my|your|I|you|we|they|it|this|that|from|about|would|should|could|been|being|need|want|looking|moving|working|going|getting|trying|planning|through|travel|traveling|tips|guide|recommendations|help|just|really|more|any|some|most)\b/gi;
    const _frMarkers = /\b(le|la|les|un|une|du|des|au|aux|ce|cette|ces|en|est|sont|pour|avec|dans|sur|par|qui|que|dont|où|comment|pourquoi|quand|quel|quelle|quels|quelles|faut|peut|dois|nous|vous|ils|elles|mon|ton|son|notre|votre|leur)\b/gi;
    const englishQuestions = validQuestions.filter(q => {
      const words = q.question.split(/\s+/);
      if (words.length <= 2) return false;
      const enWords = (q.question.match(_enStopWords) || []).length;
      const frWords = (q.question.match(_frMarkers) || []).length;
      const hasFrAccents = /[àâäéèêëïîôùûüÿçœæ]/i.test(q.question);
      // Si aucun marqueur français et question > 3 mots → probablement anglais
      if (frWords === 0 && !hasFrAccents && words.length > 3) return true;
      return enWords / words.length > 0.15;
    });
    if (englishQuestions.length > 0 && englishQuestions.length >= validQuestions.length * 0.3) {
      console.log(`   ⚠️ FAQ en anglais détectée (${englishQuestions.length}/${validQuestions.length}) — bascule vers LLM français`);
      try {
        return await this.addFAQViaLLM(html, enhancements);
      } catch (faqError) {
        console.warn(`   ⚠️ Bascule FAQ LLM échouée: ${faqError.message} — poursuite avec données brutes`);
      }
    }

    // Dédupliquer les questions (par texte normalisé)
    const seen = new Set();
    const uniqueQuestions = validQuestions.filter(q => {
      const normalized = q.question.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      if (seen.has(normalized) || normalized.length < 10) return false;
      seen.add(normalized);
      return true;
    });
    
    if (uniqueQuestions.length === 0) {
      console.log('   ⚠️ Aucune question unique après déduplication');
      return html;
    }

    // Limiter à 5 questions max
    const selectedQuestions = uniqueQuestions.slice(0, 5);

    // Construire la FAQ avec blocs Gutenberg wp:details (accordion natif WordPress)
    const usedSources = new Set();
    const faqPairs = selectedQuestions.map((q, index) => {
      const answer = q.answer || this.generateAnswerFromContext(q.question, story, pattern, usedSources);
      if (!answer) return null;
      return { question: q.question, answer };
    }).filter(Boolean);
    
    if (faqPairs.length === 0) {
      console.log('   ⚠️ FAQ: aucune question avec réponse valide');
      return html;
    }

    const faqSection = this._buildGutenbergFAQ(faqPairs);

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

    // ❌ DÉSACTIVÉ : Ne plus transformer community_insights en section "Ce que la communauté apporte"
    // Cette section est un résidu de l'ancienne structure et sera supprimée par removeOldStructureResidues
    // Les insights de la communauté doivent être intégrés dans le développement narratif, pas dans une section séparée
    if (false && story.community_insights && Array.isArray(story.community_insights) && story.community_insights.length > 2) {
      // Code désactivé - ne plus générer cette section
      console.log('   ⚠️ Section "Ce que la communauté apporte" ignorée dans editorial-enhancer (résidu ancienne structure)');
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
    
    // Rejeter les textes vides ou trop courts
    if (!text || text.length < 5) return null;
    
    // Rejeter les textes qui ne sont qu'un point d'interrogation
    if (text === '?' || text === '? ?' || text.replace(/[?\s]/g, '').length < 3) return null;
    
    // Si c'est déjà une question bien formée
    if (text.endsWith('?')) {
      return text;
    }
    
    // Ajouter "?" si c'est une question implicite (FR ou EN)
    const lower = text.toLowerCase();
    if (lower.startsWith('comment') || lower.startsWith('pourquoi') ||
        lower.startsWith('quand') || lower.startsWith('où') ||
        lower.startsWith('how') || lower.startsWith('why') ||
        lower.startsWith('when') || lower.startsWith('where') ||
        lower.startsWith('what') || lower.startsWith('should') ||
        lower.startsWith('can') || lower.startsWith('is') ||
        lower.startsWith('are') || lower.startsWith('do')) {
      return text + ' ?';
    }
    
    // Sinon, reformuler en question — mais NE PAS utiliser "Qu'en est-il de" (trop générique)
    return `${text} : quels sont les enjeux ?`;
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

  generateAnswerFromContext(question, story, pattern, usedSources = new Set()) {
    // Générer une réponse basée sur le contexte existant
    // Chercher dans les sections de story
    const sources = [
      story.context?.summary,
      story.resolution?.summary,
      ...(story.community_insights || []).map(i => typeof i === 'string' ? i : (i.value || i.text || ''))
    ].filter(Boolean);

    // Trouver la source la plus pertinente (non encore utilisée)
    for (const source of sources) {
      if (source && source.length > 50 && source.length < 300 && !usedSources.has(source)) {
        usedSources.add(source);
        return source;
      }
    }

    // Fallback : ne pas retourner de réponse générique, mieux vaut exclure la question
    return null;
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

  /**
   * Fallback LLM : génère une FAQ SEO basée sur le contenu de l'article
   * Appelé quand aucune question n'est trouvée dans les données story/insights
   */
  async addFAQViaLLM(html, enhancements) {
    // Extraire le texte brut de l'article (max 3000 chars pour le prompt)
    const articleText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 3000);
    
    const response = await createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Tu es un expert SEO voyage. Génère exactement 4 questions fréquentes (FAQ) basées sur l'article fourni.
Chaque question doit être une vraie question que les voyageurs se posent.
Chaque réponse doit être factuelle et basée UNIQUEMENT sur le contenu de l'article (pas d'invention).
ÉCRIS EN FRANÇAIS. Utilise le tutoiement.
Retourne un JSON array: [{"question": "...", "answer": "..."}]` },
        { role: 'user', content: articleText }
      ],
      max_tokens: 1500,
      temperature: 0.3,
      response_format: { type: "json_object" }
    }, 3, 'editorial-faq');

    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error('Réponse LLM vide');
    
    let parsed;
    try {
      parsed = JSON.parse(content);
      // Handle any JSON structure: direct array, { questions: [...] }, { faq: [...] }, or any key containing an array
      let faqArray = [];
      if (Array.isArray(parsed)) {
        faqArray = parsed;
      } else if (typeof parsed === 'object') {
        // Try common keys first, then any key that contains an array of objects with 'question'
        faqArray = parsed.questions || parsed.faq || parsed.items || parsed.data || [];
        if (!Array.isArray(faqArray) || faqArray.length === 0) {
          // Fallback: find any array value in the object
          for (const val of Object.values(parsed)) {
            if (Array.isArray(val) && val.length > 0 && val[0]?.question) {
              faqArray = val;
              break;
            }
          }
        }
      }
      if (!Array.isArray(faqArray) || faqArray.length === 0) throw new Error('Pas de questions dans la réponse: ' + JSON.stringify(Object.keys(parsed)));
      
      const selectedFaq = faqArray.slice(0, 5);
      const faqPairs = selectedFaq.map(q => ({ question: q.question, answer: q.answer }));
      const faqSection = this._buildGutenbergFAQ(faqPairs);
      
      // Insérer avant "Nos recommandations" ou avant le dernier H2
      const insertedHtml = this.insertBeforeRecommandations(html, faqSection);
      enhancements.faqAdded = true;
      console.log(`   ✅ FAQ ajoutée via LLM (${faqArray.length} question(s))`);
      return insertedHtml;
    } catch (parseError) {
      throw new Error(`Parsing FAQ LLM échoué: ${parseError.message}`);
    }
  }

  /**
   * EVERGREEN: Ajouter un tableau comparatif si l'article compare 2+ destinations/options
   */
  async addComparisonTable(html, story, extraction, pattern, enhancements) {
    console.log('\n📊 Tableau comparatif EVERGREEN...');
    
    // Vérifier si un tableau existe déjà
    if (/<table/i.test(html)) {
      console.log('   ℹ️ Tableau déjà présent, skip');
      return html;
    }
    
    // Détecter les destinations/options mentionnées
    const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const destinationPatterns = [
      /thaïlande|thailand|bangkok|chiang\s*mai/gi,
      /vietnam|ho\s*chi\s*minh|hcmc|da\s*nang|hanoi/gi,
      /bali|indonésie|indonesia|canggu|ubud/gi,
      /malaisie|malaysia|kuala\s*lumpur|penang/gi,
      /philippines|cebu|manille/gi,
      /japon|japan|tokyo|osaka|kyoto/gi,
      /cambodge|cambodia|phnom\s*penh|siem\s*reap/gi,
      /singapour|singapore/gi
    ];
    
    const foundDestinations = new Set();
    for (const pattern of destinationPatterns) {
      if (pattern.test(textContent)) {
        foundDestinations.add(pattern.source.split('|')[0].replace(/\\s\*/, ' '));
      }
      pattern.lastIndex = 0; // Reset regex
    }
    
    // Détection par titre "vs" / "comparaison" / "arbitrer entre" : force le tableau
    const titleText = (story?.title || extraction?.title || '').toLowerCase();
    const isComparisonArticle = /\bvs\b|compar|arbitrer\s+entre|face\s+[àa]|plutôt\s+que/i.test(titleText);
    
    if (foundDestinations.size < 2 && !isComparisonArticle) {
      console.log(`   ℹ️ ${foundDestinations.size} destination(s) détectée(s), pas assez pour un comparatif`);
      return html;
    }
    
    if (isComparisonArticle && foundDestinations.size < 2) {
      console.log(`   📍 Article de comparaison détecté par titre ("${titleText.substring(0, 50)}...") — génération tableau forcée`);
    }
    
    console.log(`   📍 ${foundDestinations.size} destinations détectées: ${[...foundDestinations].join(', ')} — génération tableau...`);
    
    // Extraire le texte brut (max 3000 chars)
    const articleText = textContent.substring(0, 3000);
    
    try {
      const response = await createChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Tu es un expert en voyage. Génère UN tableau HTML comparatif basé sur l'article fourni.
Le tableau doit comparer les destinations/options mentionnées dans l'article.
Critères de comparaison suggérés: budget mensuel, logement, nourriture, coworking, avantages, inconvénients.
Adapte les critères au contenu réel de l'article.
Base-toi UNIQUEMENT sur les données présentes dans l'article. Aucune invention.
ÉCRIS EN FRANÇAIS.
Retourne UNIQUEMENT le HTML du tableau, rien d'autre. Format: <table><thead><tr><th>...</th></tr></thead><tbody><tr><td>...</td></tr></tbody></table>` },
          { role: 'user', content: articleText }
        ],
        max_tokens: 2000,
        temperature: 0.2
      }, 3, 'editorial-table');

      let tableHtml = response.choices?.[0]?.message?.content?.trim();
      if (!tableHtml) throw new Error('Réponse vide');
      
      // Nettoyer markdown wrapper
      tableHtml = tableHtml.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      
      // Vérifier que c'est bien un tableau
      if (!tableHtml.includes('<table') || !tableHtml.includes('</table>')) {
        throw new Error('Réponse ne contient pas de tableau HTML valide');
      }

      // Rejeter les tableaux creux (>40% de cellules vides/non précisé)
      const cells = tableHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      const emptyCells = cells.filter(c => {
        const text = c.replace(/<[^>]+>/g, '').trim().toLowerCase();
        return !text || text === '-' || text === 'n/a' || text.startsWith('non précisé') || text.startsWith('non spécifié');
      });
      if (cells.length > 0 && emptyCells.length / cells.length > 0.4) {
        console.log(`   ⚠️ Tableau trop creux (${emptyCells.length}/${cells.length} cellules vides) — rejeté`);
        return html;
      }
      
      const tableSection = `\n\n<h2>Comparatif des destinations</h2>\n${tableHtml}\n`;
      
      // Insérer avant "Nos recommandations" ou avant FAQ
      const insertedHtml = this.insertBeforeRecommandations(html, tableSection);
      enhancements.comparisonTableAdded = true;
      console.log(`   ✅ Tableau comparatif ajouté (${foundDestinations.size} destinations)`);
      return insertedHtml;
    } catch (error) {
      console.warn(`   ⚠️ Génération tableau échouée: ${error.message}`);
      return html;
    }
  }

  /**
   * EVERGREEN: Ajouter une checklist actionnable si l'article est un guide pratique
   */
  async addChecklist(html, story, pattern, enhancements) {
    console.log('\n✅ Checklist EVERGREEN...');
    
    // Vérifier si une checklist existe déjà (liste avec >= 5 items contenant des verbes d'action)
    const checklistPatterns = /<h[23][^>]*>[^<]*(?:checklist|check-list|liste|à faire|avant de partir|préparer)[^<]*<\/h[23]>/i;
    if (checklistPatterns.test(html)) {
      console.log('   ℹ️ Checklist déjà présente, skip');
      return html;
    }
    
    // Extraire le texte brut (max 2000 chars)
    const articleText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 2000);
    
    try {
      const response = await createChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Tu es un expert en voyage. Génère une checklist de 5-8 actions concrètes basées sur l'article fourni.
Chaque item doit être une action spécifique et pratique (pas un conseil vague).
Base-toi UNIQUEMENT sur le contenu de l'article. Aucune invention.
ÉCRIS EN FRANÇAIS. Utilise le tutoiement.
Retourne UNIQUEMENT le HTML: <h3>Checklist avant de partir</h3><ul><li>Action 1</li><li>Action 2</li>...</ul>` },
          { role: 'user', content: articleText }
        ],
        max_tokens: 1000,
        temperature: 0.2
      }, 3, 'editorial-checklist');

      let checklistHtml = response.choices?.[0]?.message?.content?.trim();
      if (!checklistHtml) throw new Error('Réponse vide');
      
      // Nettoyer markdown wrapper
      checklistHtml = checklistHtml.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      
      // Vérifier que c'est bien une liste
      if (!checklistHtml.includes('<li>')) {
        throw new Error('Réponse ne contient pas de liste HTML valide');
      }
      
      const checklistSection = `\n\n${checklistHtml}\n`;
      
      // Insérer avant "Ce qu'il faut retenir" ou avant le dernier H2
      let insertionPoint = html.search(/<h2[^>]*>Ce qu['']il faut retenir/i);
      if (insertionPoint === -1) {
        insertionPoint = html.search(/<h2[^>]*>À retenir/i);
      }
      if (insertionPoint === -1) {
        // Avant le dernier H2
        const lastH2 = html.lastIndexOf('<h2>');
        insertionPoint = lastH2 > 0 ? lastH2 : html.length;
      }
      
      const result = html.substring(0, insertionPoint) + checklistSection + html.substring(insertionPoint);
      enhancements.checklistAdded = true;
      console.log(`   ✅ Checklist ajoutée`);
      return result;
    } catch (error) {
      console.warn(`   ⚠️ Génération checklist échouée: ${error.message}`);
      return html;
    }
  }

  /**
   * Helper: Insérer du contenu avant "Nos recommandations" ou avant le dernier H2
   */
  insertBeforeRecommandations(html, content) {
    let insertionPoint = html.indexOf('<h2>🎯 Nos recommandations');
    if (insertionPoint === -1) {
      insertionPoint = html.indexOf('<h2>Nos recommandations');
    }
    if (insertionPoint === -1) {
      // Insérer avant le dernier H2
      const lastH2 = html.lastIndexOf('<h2>');
      insertionPoint = lastH2 > 0 ? lastH2 : html.length;
    }
    return html.substring(0, insertionPoint) + content + html.substring(insertionPoint);
  }

  /**
   * Construit la section FAQ en blocs Gutenberg natifs wp:details (accordion Q/R)
   * + JSON-LD FAQPage schema pour le SEO
   * @param {Array<{question: string, answer: string}>} faqPairs
   * @returns {string} HTML Gutenberg FAQ section
   */
  _buildGutenbergFAQ(faqPairs) {
    const detailsBlocks = faqPairs.map(({ question, answer }) => {
      const q = this.escapeHtml(question);
      const a = this.escapeHtml(answer);
      return `<!-- wp:details -->
<details class="wp-block-details">
<summary>${q}</summary>
<!-- wp:paragraph -->
<p>${a}</p>
<!-- /wp:paragraph -->
</details>
<!-- /wp:details -->`;
    }).join('\n\n');

    // FAQPage schema is generated by seo-optimizer.js and injected via WP post meta

    const faqStyles = `<!-- wp:html -->
<style>
.entry-content .wp-block-details{border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;overflow:hidden;transition:box-shadow .2s ease}
.entry-content .wp-block-details:hover{box-shadow:0 2px 8px rgba(0,0,0,.06)}
.entry-content .wp-block-details summary{padding:16px 20px;font-weight:600;font-size:1.05em;background:#f7fafc;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px}
.entry-content .wp-block-details summary::-webkit-details-marker{display:none}
.entry-content .wp-block-details summary::after{content:"\\203A";font-size:1.4em;font-weight:700;color:var(--global-palette1,#3182CE);transition:transform .25s ease;flex-shrink:0}
.entry-content .wp-block-details[open] summary::after{transform:rotate(90deg)}
.entry-content .wp-block-details[open] summary{border-bottom:1px solid #e2e8f0}
.entry-content .wp-block-details>p{padding:16px 20px;margin:0;color:#4a5568;line-height:1.7}
</style>
<!-- /wp:html -->`;

    return `\n\n${faqStyles}

<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading">Questions fréquentes</h2>
<!-- /wp:heading -->

${detailsBlocks}\n`;
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
