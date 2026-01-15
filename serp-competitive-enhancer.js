#!/usr/bin/env node

/**
 * SERP COMPETITIVE ENHANCER
 * 
 * Objectif : Dépasser les articles concurrents, pas les égaler.
 * 
 * Processus en 7 étapes :
 * 1. Analyse SERP factuelle (non générative)
 * 2. Détection des manques concurrentiels
 * 3. Enrichissement structurel (pas de remplissage)
 * 4. Renforcement E-E-A-T (sans storytelling artificiel)
 * 5. Optimisation sémantique contrôlée
 * 6. Validation anti-SERP-spam
 * 7. Output final
 */

import { parseBool } from './config.js';
import IntelligentContentAnalyzerOptimized from './intelligent-content-analyzer-optimized.js';

const ENABLE_SERP_ENHANCER = parseBool(process.env.ENABLE_SERP_ENHANCER ?? '1');

class SerpCompetitiveEnhancer {
  constructor() {
    this.enabled = ENABLE_SERP_ENHANCER;
    this.intelligentAnalyzer = new IntelligentContentAnalyzerOptimized();
  }

  /**
   * ÉTAPE 1 : Analyse SERP factuelle (non générative)
   * Extrait uniquement : structure H2/H3, types de sections, formats, intentions
   * GRATUIT : Utilise scraping HTTP simple (pas d'API payante)
   */
  async analyzeSerp(query) {
    if (!this.enabled) {
      console.log('⚠️ SERP Enhancer désactivé');
      return null;
    }

    console.log('\n🔍 ÉTAPE 1: Analyse SERP factuelle (GRATUIT)');
    console.log('============================================================\n');
    console.log(`   Requête: "${query}"`);

    try {
      // Scraping gratuit via Google Search (sans API)
      const serpData = await this.scrapeGoogleSerpFree(query);
      
      if (!serpData || serpData.length === 0) {
        console.log('   ⚠️ Aucun résultat SERP trouvé');
        return this.createEmptySerpAnalysis(query);
      }

      // Analyser les structures H2/H3 des résultats
      const commonStructures = await this.extractCommonStructures(serpData);

      const serpAnalysis = {
        query,
        results: serpData,
        commonStructures,
        timestamp: new Date().toISOString()
      };

      console.log(`   ✅ ${serpData.length} résultat(s) analysé(s)`);
      console.log(`   ✅ ${commonStructures.h2Sections.length} H2 commun(s) détecté(s)`);
      console.log(`   ✅ ${commonStructures.h3Sections.length} H3 commun(s) détecté(s)`);

      return serpAnalysis;
    } catch (error) {
      console.warn(`   ⚠️ Erreur analyse SERP: ${error.message}`);
      console.log('   → Retour d\'analyse vide (mode dégradé)');
      return this.createEmptySerpAnalysis(query);
    }
  }

  /**
   * Scraping Google SERP GRATUIT (sans API payante)
   * Utilise fetch HTTP simple avec User-Agent
   */
  async scrapeGoogleSerpFree(query) {
    try {
      // Encoder la requête pour l'URL Google
      const encodedQuery = encodeURIComponent(query);
      const googleUrl = `https://www.google.com/search?q=${encodedQuery}&num=10&hl=fr`;

      console.log(`   🔍 Scraping Google (gratuit): ${googleUrl.substring(0, 80)}...`);

      // Fetch avec User-Agent pour éviter le blocage
      const response = await fetch(googleUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Extraire les URLs des résultats (sans parser HTML complexe)
      const urls = this.extractResultUrls(html);
      
      if (urls.length === 0) {
        console.log('   ⚠️ Aucune URL trouvée dans les résultats Google');
        return [];
      }

      console.log(`   ✅ ${urls.length} URL(s) extraite(s) depuis Google`);

      // Scraper le contenu de chaque URL (max 5 pour éviter timeout)
      const results = [];
      for (const url of urls.slice(0, 5)) {
        try {
          console.log(`   🔍 Scraping ${url.substring(0, 60)}...`);
          const content = await this.scrapeUrlContent(url);
          if (content && content.length > 1000) { // Min 1000 caractères pour être valide
            results.push({ url, content });
            console.log(`   ✅ ${url.substring(0, 60)}... (${content.length} caractères)`);
          } else {
            console.log(`   ⚠️ ${url.substring(0, 60)}... (contenu trop court ou vide)`);
          }
        } catch (error) {
          console.warn(`   ⚠️ Erreur scraping ${url}: ${error.message}`);
        }
      }

      return results;
    } catch (error) {
      console.warn(`   ⚠️ Erreur scraping Google: ${error.message}`);
      return [];
    }
  }

  /**
   * Extrait les URLs des résultats Google depuis le HTML
   */
  extractResultUrls(html) {
    const urls = [];
    // Pattern simple pour extraire les URLs des résultats Google
    const urlPattern = /<a[^>]+href="\/url\?q=([^&"]+)[^"]*"[^>]*>/gi;
    let match;

    while ((match = urlPattern.exec(html)) !== null && urls.length < 10) {
      const url = decodeURIComponent(match[1]);
      // Filtrer les URLs Google internes
      if (!url.includes('google.com') && !url.includes('youtube.com/watch')) {
        urls.push(url);
      }
    }

    return urls;
  }

  /**
   * Scrape le contenu HTML d'une URL (gratuit, sans API)
   * Avec timeout via AbortController
   */
  async scrapeUrlContent(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 secondes max

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      return html;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn(`   ⏱️ Timeout scraping ${url}`);
      }
      return null;
    }
  }

  /**
   * Extrait les structures communes (H2/H3) depuis les résultats SERP
   */
  async extractCommonStructures(serpData) {
    const h2Sections = new Map();
    const h3Sections = new Map();
    const sectionTypes = new Set();

    for (const result of serpData) {
      if (!result.content) continue;

      // Extraire H2
      const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gi;
      let match;
      while ((match = h2Regex.exec(result.content)) !== null) {
        const text = match[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
        if (text.length > 5 && text.length < 100) {
          h2Sections.set(text, (h2Sections.get(text) || 0) + 1);
        }
      }

      // Extraire H3
      const h3Regex = /<h3[^>]*>(.*?)<\/h3>/gi;
      while ((match = h3Regex.exec(result.content)) !== null) {
        const text = match[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
        if (text.length > 5 && text.length < 100) {
          h3Sections.set(text, (h3Sections.get(text) || 0) + 1);
        }
      }
    }

    // Garder uniquement les sections présentes chez ≥3 concurrents
    const commonH2s = Array.from(h2Sections.entries())
      .filter(([_, count]) => count >= 3)
      .map(([text, _]) => text);

    const commonH3s = Array.from(h3Sections.entries())
      .filter(([_, count]) => count >= 3)
      .map(([text, _]) => text);

    return {
      h2Sections: commonH2s,
      h3Sections: commonH3s,
      sectionTypes: Array.from(sectionTypes),
      formats: [],
      intents: []
    };
  }

  /**
   * Crée une analyse SERP vide (mode dégradé)
   */
  createEmptySerpAnalysis(query) {
    return {
      query,
      results: [],
      commonStructures: {
        h2Sections: [],
        h3Sections: [],
        sectionTypes: [],
        formats: [],
        intents: []
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * ÉTAPE 2 : Détection des manques concurrentiels
   * Compare l'article actuel avec l'analyse SERP
   */
  detectGaps(currentArticle, serpAnalysis) {
    if (!serpAnalysis || !serpAnalysis.commonStructures) {
      return [];
    }

    console.log('\n🔍 ÉTAPE 2: Détection des manques concurrentiels');
    console.log('============================================================\n');

    const gaps = [];
    const currentSections = this.extractSections(currentArticle);

    // Comparer avec les structures SERP communes
    const commonH2s = serpAnalysis.commonStructures.h2Sections || [];
    const commonH3s = serpAnalysis.commonStructures.h3Sections || [];

    for (const h2 of commonH2s) {
      if (!currentSections.h2.includes(h2.toLowerCase())) {
        gaps.push({
          type: 'missing_h2',
          section: h2,
          priority: 'high',
          justification: `Présent chez ≥3 concurrents SERP`,
          canMapToData: this.canMapToExistingData(h2)
        });
      }
    }

    for (const h3 of commonH3s) {
      if (!currentSections.h3.includes(h3.toLowerCase())) {
        gaps.push({
          type: 'missing_h3',
          section: h3,
          priority: 'medium',
          justification: `Présent chez ≥3 concurrents SERP`,
          canMapToData: this.canMapToExistingData(h3)
        });
      }
    }

    console.log(`   ✅ ${gaps.length} manque(s) détecté(s)`);
    gaps.forEach(gap => {
      console.log(`   - ${gap.type}: "${gap.section}" (${gap.priority})`);
    });

    return gaps;
  }

  /**
   * ÉTAPE 3 : Enrichissement structurel (pas de remplissage)
   * Ajoute UNIQUEMENT des sections structurelles manquantes (H2/H3)
   */
  enrichStructure(html, gaps) {
    if (!gaps || gaps.length === 0) {
      return html;
    }

    console.log('\n🔍 ÉTAPE 3: Enrichissement structurel');
    console.log('============================================================\n');

    let enrichedHtml = html;
    const addedSections = [];

    // Filtrer les gaps qui peuvent être mappés à des données existantes
    const mappableGaps = gaps.filter(gap => gap.canMapToData);

    for (const gap of mappableGaps.slice(0, 5)) { // Max 5 sections ajoutées
      const sectionHtml = this.createEmptySection(gap.section, gap.type);
      
      // Insérer après "Contexte" ou avant "Nos recommandations"
      const insertionPoint = this.findInsertionPoint(enrichedHtml, gap.priority);
      if (insertionPoint > -1) {
        enrichedHtml = enrichedHtml.substring(0, insertionPoint) + 
                      sectionHtml + 
                      enrichedHtml.substring(insertionPoint);
        addedSections.push(gap.section);
        console.log(`   ✅ Section ajoutée: "${gap.section}" (${gap.type})`);
      }
    }

    console.log(`   ✅ ${addedSections.length} section(s) structurelle(s) ajoutée(s)`);
    return enrichedHtml;
  }

  /**
   * ÉTAPE 4 : Renforcement E-E-A-T (sans storytelling artificiel)
   * Renforce les signaux E-E-A-T via la structure
   */
  reinforceEEAT(html, pipelineContext) {
    console.log('\n🔍 ÉTAPE 4: Renforcement E-E-A-T');
    console.log('============================================================\n');

    let enhancedHtml = html;
    const story = pipelineContext?.story?.story;
    const evidence = pipelineContext?.story?.evidence;

    // Ajouter section "Limites et biais" si absente
    if (!html.includes('Limites') && !html.includes('biais')) {
      const limitsSection = this.createLimitsSection(story, evidence);
      const insertionPoint = html.indexOf('<h2>Nos recommandations</h2>');
      if (insertionPoint > -1) {
        enhancedHtml = enhancedHtml.substring(0, insertionPoint) + 
                      limitsSection + 
                      enhancedHtml.substring(insertionPoint);
        console.log('   ✅ Section "Limites et biais" ajoutée');
      }
    }

    // Ajouter section "Source des informations" si absente
    if (!html.includes('Source des informations') && evidence) {
      const sourceSection = this.createSourceSection(evidence);
      const insertionPoint = html.indexOf('</h1>') + 5;
      if (insertionPoint > 4) {
        enhancedHtml = enhancedHtml.substring(0, insertionPoint) + 
                      sourceSection + 
                      enhancedHtml.substring(insertionPoint);
        console.log('   ✅ Section "Source des informations" ajoutée');
      }
    }

    return enhancedHtml;
  }

  /**
   * ÉTAPE 5 : Optimisation sémantique contrôlée
   * Enrichit le champ sémantique UNIQUEMENT à partir des termes SERP
   */
  optimizeSemantics(html, serpAnalysis) {
    if (!serpAnalysis || !serpAnalysis.commonStructures) {
      return html;
    }

    console.log('\n🔍 ÉTAPE 5: Optimisation sémantique contrôlée');
    console.log('============================================================\n');

    // TODO: Implémenter l'enrichissement sémantique contrôlé
    // Basé sur les termes réellement présents dans les contenus SERP
    console.log('   ⚠️ Optimisation sémantique contrôlée non implémentée');
    console.log('   → Nécessite extraction des termes SERP réels');

    return html;
  }

  /**
   * ÉTAPE 6 : Validation anti-SERP-spam
   * Vérifie que chaque ajout apporte une information absente chez ≥50% des concurrents
   */
  validateAntiSpam(html, serpAnalysis) {
    if (!serpAnalysis) {
      return html;
    }

    console.log('\n🔍 ÉTAPE 6: Validation anti-SERP-spam');
    console.log('============================================================\n');

    // TODO: Implémenter la validation anti-spam
    // Vérifier que chaque section ajoutée apporte une valeur unique
    console.log('   ⚠️ Validation anti-SERP-spam non implémentée');
    console.log('   → Nécessite comparaison avec contenu SERP réel');

    return html;
  }

  /**
   * ÉTAPE 7 : Output final
   * Retourne l'article enrichi avec rapport d'enrichissement
   */
  async enhanceArticle(html, pipelineContext = {}) {
    if (!this.enabled) {
      return { html, enhancements: { enabled: false } };
    }

    console.log('\n🎯 SERP COMPETITIVE ENHANCER');
    console.log('============================================================\n');

    const story = pipelineContext?.story?.story;
    const pattern = pipelineContext?.pattern;
    const extraction = pipelineContext?.story?.extracted;

    // Construire la requête principale depuis le pattern
    const mainQuery = this.buildMainQuery(pattern, extraction);

    // ÉTAPE 1 : Analyse SERP
    const serpAnalysis = await this.analyzeSerp(mainQuery);

    // ÉTAPE 2 : Détection des manques
    const gaps = this.detectGaps(html, serpAnalysis);

    // ÉTAPE 3 : Enrichissement structurel
    let enhancedHtml = this.enrichStructure(html, gaps);

    // ÉTAPE 4 : Renforcement E-E-A-T
    enhancedHtml = this.reinforceEEAT(enhancedHtml, pipelineContext);

    // ÉTAPE 5 : Optimisation sémantique
    enhancedHtml = this.optimizeSemantics(enhancedHtml, serpAnalysis);

    // ÉTAPE 6 : Validation anti-spam
    enhancedHtml = this.validateAntiSpam(enhancedHtml, serpAnalysis);

    const enhancements = {
      enabled: true,
      serpAnalyzed: !!serpAnalysis,
      gapsDetected: gaps.length,
      sectionsAdded: gaps.filter(g => g.canMapToData).length,
      eeatReinforced: true,
      semanticOptimized: false,
      antiSpamValidated: false
    };

    console.log('\n✅ Enhancements appliqués:');
    console.log(`   📊 SERP analysé: ${enhancements.serpAnalyzed ? 'Oui' : 'Non'}`);
    console.log(`   🔍 Manques détectés: ${enhancements.gapsDetected}`);
    console.log(`   ➕ Sections ajoutées: ${enhancements.sectionsAdded}`);
    console.log(`   🎯 E-E-A-T renforcé: ${enhancements.eeatReinforced ? 'Oui' : 'Non'}`);

    return { html: enhancedHtml, enhancements };
  }

  // ========================================
  // MÉTHODES UTILITAIRES
  // ========================================

  extractSections(html) {
    const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gi;
    const h3Regex = /<h3[^>]*>(.*?)<\/h3>/gi;
    
    const h2s = [];
    const h3s = [];
    let match;

    while ((match = h2Regex.exec(html)) !== null) {
      h2s.push(match[1].toLowerCase().trim());
    }

    while ((match = h3Regex.exec(html)) !== null) {
      h3s.push(match[1].toLowerCase().trim());
    }

    return { h2: h2s, h3: h3s };
  }

  canMapToExistingData(sectionTitle) {
    // Vérifier si la section peut être mappée à des données existantes
    const mappableKeywords = [
      'erreur', 'coût', 'budget', 'chronologie', 'temporalité',
      'limite', 'biais', 'témoignage', 'reddit', 'source',
      'conseil', 'astuce', 'piège', 'éviter', 'attention'
    ];

    const titleLower = sectionTitle.toLowerCase();
    return mappableKeywords.some(keyword => titleLower.includes(keyword));
  }

  createEmptySection(title, type) {
    const tag = type === 'missing_h2' ? 'h2' : 'h3';
    return `\n<${tag}>${title}</${tag}>\n<p><!-- Section à remplir avec données existantes --></p>\n`;
  }

  findInsertionPoint(html, priority) {
    if (priority === 'high') {
      // Insérer après "Contexte"
      const contexteIndex = html.indexOf('<h2>Contexte</h2>');
      if (contexteIndex > -1) {
        const nextH2 = html.indexOf('<h2>', contexteIndex + 1);
        return nextH2 > -1 ? nextH2 : html.length;
      }
    }

    // Sinon, insérer avant "Nos recommandations"
    const recommandationsIndex = html.indexOf('<h2>Nos recommandations</h2>');
    if (recommandationsIndex > -1) {
      return recommandationsIndex;
    }

    // Fallback : fin du contenu
    return html.length;
  }

  createLimitsSection(story, evidence) {
    return `
<h2>Limites et biais de ce témoignage</h2>
<p>Ce témoignage reflète une expérience individuelle et ne peut être généralisé à tous les contextes. Les informations partagées sont basées sur :</p>
<ul>
  <li>Une expérience personnelle unique</li>
  <li>Un contexte temporel et géographique spécifique</li>
  <li>Des conditions qui peuvent avoir évolué depuis</li>
</ul>
<p>Nous recommandons de croiser ces informations avec d'autres sources et de vérifier les réglementations actuelles.</p>
`;
  }

  createSourceSection(evidence) {
    const sourceCount = evidence?.source_snippets?.length || 0;
    return `
<h2>Source des informations</h2>
<p>Cet article est basé sur ${sourceCount} extrait(s) de témoignages Reddit authentiques. Les informations proviennent directement des retours d'expérience de la communauté des nomades digitaux.</p>
<p>Chaque citation est traçable à sa source originale via les références Reddit mentionnées dans l'article.</p>
`;
  }

  buildMainQuery(pattern, extraction) {
    if (pattern?.destination && pattern?.theme_primary) {
      return `${pattern.destination} ${pattern.theme_primary} nomade digital`;
    }
    if (extraction?.geo?.country) {
      return `${extraction.geo.country} nomade digital`;
    }
    return 'nomade digital asie';
  }
}

export default SerpCompetitiveEnhancer;
