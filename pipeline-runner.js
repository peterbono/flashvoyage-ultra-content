#!/usr/bin/env node

/**
 * PIPELINE RUNNER - Orchestrator unique pour le pipeline FlashVoyage
 * 
 * Exécute strictement la séquence :
 * 1. extractor → reddit-semantic-extractor
 * 2. pattern-detector → reddit-pattern-detector
 * 3. story-compiler → reddit-story-compiler
 * 4. generator → intelligent-content-analyzer-optimized
 * 5. affiliate-injector → contextual-affiliate-injector
 * 6. seo-optimizer → seo-optimizer
 * 7. finalizer → article-finalizer
 * 8. anti-hallucination-guard → anti-hallucination-guard
 * 
 * Supporte :
 * - FLASHVOYAGE_DRY_RUN=1 (aucune écriture/publish)
 * - FORCE_OFFLINE=1
 * - Stop immédiat si FINALIZER_BLOCKING.blocking === true ou si antiHallucination.blocking === true
 * 
 * Retourne un pipelineReport JSON
 */

import { extractRedditSemantics } from './reddit-semantic-extractor.js';
import { detectRedditPattern } from './reddit-pattern-detector.js';
import { compileRedditStory } from './reddit-story-compiler.js';
import IntelligentContentAnalyzerOptimized from './intelligent-content-analyzer-optimized.js';
import { decideAffiliatePlacements } from './contextual-affiliate-injector.js';
import SeoOptimizer from './seo-optimizer.js';
import EditorialEnhancer from './editorial-enhancer.js';
import SerpCompetitiveEnhancer from './serp-competitive-enhancer.js';
import ArticleFinalizer from './article-finalizer.js';
import { runAntiHallucinationGuard } from './src/anti-hallucination/anti-hallucination-guard.js';
import PipelineReport from './pipeline-report.js';
import { applyContentMarketingPass } from './content-marketing-pass.js';
import { DRY_RUN, FORCE_OFFLINE, ENABLE_MARKETING_PASS, parseBool } from './config.js';

class PipelineRunner {
  constructor() {
    this.dryRun = DRY_RUN;
    this.forceOffline = FORCE_OFFLINE;
    
    // Initialiser les composants
    this.generator = new IntelligentContentAnalyzerOptimized();
    this.seoOptimizer = new SeoOptimizer();
    this.editorialEnhancer = new EditorialEnhancer();
    this.serpEnhancer = new SerpCompetitiveEnhancer();
    this.finalizer = new ArticleFinalizer();
  }

  /**
   * Exécute le pipeline complet
   * @param {Object} input - Données d'entrée (thread Reddit)
   * @param {Object} input.post - Post Reddit
   * @param {Array} input.comments - Commentaires Reddit
   * @param {Object} input.geo - Géolocalisation (optionnel)
   * @param {Object} input.source - Métadonnées source (optionnel)
   * @returns {Promise<Object>} pipelineReport
   */
  async runPipeline(input) {
    // Initialiser le rapport unifié
    const pipelineReport = new PipelineReport();
    pipelineReport.initialize();
    
    // Stocker l'input original pour l'anti-hallucination guard (contient le texte brut)
    this.originalInput = input;

    try {
      console.log('🚀 PIPELINE_RUNNER: Démarrage du pipeline FlashVoyage');
      console.log(`   Mode: ${this.dryRun ? 'DRY_RUN' : 'PRODUCTION'} ${this.forceOffline ? 'OFFLINE' : 'ONLINE'}\n`);

      // ÉTAPE 1: Extractor
      console.log('📋 ÉTAPE 1: Extractor (reddit-semantic-extractor)');
      pipelineReport.startStep('extractor');
      const extracted = await this.runExtractor(input, pipelineReport);
      if (!extracted) {
        throw new Error('Extractor a échoué');
      }
      pipelineReport.endStep('extractor', extracted, { status: 'pass' });

      // ÉTAPE 2: Pattern Detector
      console.log('\n📋 ÉTAPE 2: Pattern Detector (reddit-pattern-detector)');
      pipelineReport.startStep('pattern-detector');
      const pattern = await this.runPatternDetector(input, extracted, pipelineReport);
      if (!pattern) {
        throw new Error('Pattern Detector a échoué');
      }
      pipelineReport.endStep('pattern-detector', pattern, { status: 'pass' });

      // ÉTAPE 3: Story Compiler
      console.log('\n📋 ÉTAPE 3: Story Compiler (reddit-story-compiler)');
      pipelineReport.startStep('story-compiler');
      const story = await this.runStoryCompiler(input, extracted, pattern, pipelineReport);
      if (!story) {
        throw new Error('Story Compiler a échoué');
      }
      pipelineReport.endStep('story-compiler', story, { status: 'pass' });

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'pipeline-runner.js:runPipeline:AFTER_STORY_COMPILER',message:'Story data quality',data:{hasContext:!!story?.story?.context?.summary,hasCentralEvent:!!story?.story?.central_event?.summary,hasCriticalMoment:!!story?.story?.critical_moment?.summary,hasResolution:!!story?.story?.resolution?.summary,contextPreview:story?.story?.context?.summary?.substring(0,300)||'null',centralEventPreview:story?.story?.central_event?.summary?.substring(0,300)||'null',evidenceCount:story?.evidence?.source_snippets?.length||0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H-STORY'})}).catch(()=>{});
      // #endregion

      // ÉTAPE 4: Generator
      console.log('\n📋 ÉTAPE 4: Generator (intelligent-content-analyzer-optimized)');
      pipelineReport.startStep('generator');
      const generated = await this.runGenerator(input, extracted, pattern, story, pipelineReport);
      if (!generated) {
        throw new Error('Generator a échoué');
      }
      pipelineReport.endStep('generator', generated, { status: 'pass' });

      // #region agent log
      const genPreview = generated.content?.substring(0,800) || 'null';
      const hasContexteH2 = /<h2[^>]*>Contexte<\/h2>/i.test(generated.content || '');
      const hasMomentCritiqueH2 = /<h2[^>]*>Moment critique<\/h2>/i.test(generated.content || '');
      fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'pipeline-runner.js:runPipeline:AFTER_GENERATOR',message:'Content after Generator (Passe 1)',data:{contentLength:generated.content?.length||0,hasContexteH2,hasMomentCritiqueH2,preview:genPreview},timestamp:Date.now(),hypothesisId:'H-PASSE1'})}).catch(()=>{});
      // #endregion

      // #endregion

      // ÉTAPE 4.5: Amélioration LLM (Passe 2 - auto-critique et correction)
      console.log('\n📋 ÉTAPE 4.5: Amélioration LLM (passe 2 - auto-critique)');
      pipelineReport.startStep('llm-improvement');
      try {
        const improvementContext = {
          destination: pattern.destination || extracted.destination || 'Asie',
          theme: pattern.theme_primary || 'voyage'
        };
        const improvedContent = await this.generator.improveContentWithLLM(generated.content, improvementContext);
        generated.content = improvedContent;
        pipelineReport.endStep('llm-improvement', { improved: true, lengthBefore: generated.content?.length, lengthAfter: improvedContent?.length }, { status: 'pass' });
      } catch (error) {
        console.warn(`⚠️ Amélioration LLM échouée: ${error.message}, continuation avec contenu original`);
        pipelineReport.endStep('llm-improvement', { improved: false, error: error.message }, { status: 'skip' });
      }

      // ÉTAPE 5: Affiliate Injector
      console.log('\n📋 ÉTAPE 5: Affiliate Injector (contextual-affiliate-injector)');
      pipelineReport.startStep('affiliate-injector');
      const affiliatePlan = await this.runAffiliateInjector(extracted, pattern, story, input.geo, pipelineReport);
      pipelineReport.endStep('affiliate-injector', affiliatePlan, { status: 'pass' });

      // Construire le pipelineContext pour les étapes suivantes
      // Extraire final_destination depuis pattern ou extracted
      // Parcourir les destinations candidates et prendre la première qui est asiatique
      const candidateDestinations = [
        pattern.destination,
        extracted.destination,
        ...(extracted.destinations || [])
      ].filter(Boolean);
      
      // Liste de destinations/pays asiatiques connus (filet de sécurité pour éviter "nice", "reading", etc.)
      const KNOWN_ASIAN_LOCATIONS = new Set([
        // Pays
        'japan', 'japon', 'china', 'chine', 'thailand', 'thaïlande', 'thailande', 'vietnam',
        'indonesia', 'indonésie', 'indonesie', 'malaysia', 'malaisie', 'philippines',
        'cambodia', 'cambodge', 'laos', 'myanmar', 'birmanie', 'singapore', 'singapour',
        'south korea', 'corée du sud', 'korea', 'corée', 'taiwan', 'taïwan',
        'india', 'inde', 'nepal', 'népal', 'sri lanka', 'bangladesh', 'pakistan',
        'mongolia', 'mongolie', 'brunei',
        // Villes majeures
        'tokyo', 'osaka', 'kyoto', 'bangkok', 'chiang mai', 'phuket', 'hanoi',
        'ho chi minh', 'saigon', 'da nang', 'hoi an', 'bali', 'jakarta', 'kuala lumpur',
        'penang', 'manila', 'cebu', 'phnom penh', 'siem reap', 'vientiane',
        'luang prabang', 'yangon', 'seoul', 'busan', 'taipei', 'hong kong',
        'shanghai', 'beijing', 'pékin', 'shenzhen', 'mumbai', 'delhi', 'new delhi',
        'kathmandu', 'colombo', 'dhaka', 'ulaanbaatar', 'nara', 'hiroshima',
        'nagoya', 'fukuoka', 'sapporo', 'okinawa', 'koh samui', 'koh phangan',
        'koh tao', 'krabi', 'pai', 'chiang rai', 'nha trang', 'dalat',
        'yogyakarta', 'lombok', 'ubud', 'langkawi', 'borneo', 'palawan',
        'boracay', 'siargao', 'battambang', 'kampot', 'luang namtha'
      ]);
      
      let finalDestination = null;
      for (const candidate of candidateDestinations) {
        const lower = candidate.toLowerCase().trim();
        if (KNOWN_ASIAN_LOCATIONS.has(lower)) {
          finalDestination = lower;
          break;
        }
      }
      // Fallback: si aucune destination asiatique trouvée, utiliser la première candidate
      if (!finalDestination && candidateDestinations.length > 0) {
        finalDestination = candidateDestinations[0].toLowerCase().trim();
        console.log(`⚠️ PIPELINE: Aucune destination asiatique trouvée dans [${candidateDestinations.join(', ')}], fallback: ${finalDestination}`);
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'pipeline-runner.js:DEST_RESOLUTION',message:'Destination resolution with Asian filter',data:{candidateDestinations,finalDestination,wasFirstCandidate:candidateDestinations[0]},timestamp:Date.now(),hypothesisId:'H-DEST-NICE'})}).catch(()=>{});
      // #endregion
      
      // Construire geo correctement (ne pas mélanger country et city)
      const geo = input.geo || {};
      
      // Utiliser lookupIATA (base OpenFlights 5600+ entrées) pour résoudre la destination
      // buildGeoDefaults gère automatiquement pays vs ville, pas besoin de liste hardcodée
      if (finalDestination) {
        const finalDestLower = finalDestination.toLowerCase();
        // On met la destination comme city par défaut
        // buildGeoDefaults résoudra correctement via la BDD OpenFlights
        if (!geo.city) {
          geo.city = finalDestLower;
        }
        if (!geo.country) {
          geo.country = finalDestLower;
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'pipeline-runner.js:GEO_RESOLVE',message:'OpenFlights geo resolution',data:{finalDestination,geoCity:geo.city,geoCountry:geo.country},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      }
      
      // Construire geo_defaults correctement avec buildGeoDefaults
      let geoDefaults = null;
      if (finalDestination || geo.country || geo.city) {
        const { WidgetPlanBuilder } = await import('./widget-plan-builder.js');
        const widgetPlanBuilder = new WidgetPlanBuilder();
        geoDefaults = widgetPlanBuilder.buildGeoDefaults(geo, finalDestination);
        if (geoDefaults) {
          console.log(`✅ GEO_DEFAULTS construit: origin=${geoDefaults.origin} destination=${geoDefaults.destination}`);
        } else {
          console.log(`⚠️ GEO_DEFAULTS non construit (geo insuffisante)`);
        }
      }
      
      const pipelineContext = {
        story: {
          extracted,
          story: story.story,
          evidence: story.evidence
        },
        pattern,
        affiliate_plan: affiliatePlan,
        final_destination: finalDestination,
        geo_defaults: geoDefaults || geo, // Utiliser geoDefaults si disponible, sinon geo
        geo: geo
      };
      
      console.log(`✅ PIPELINE_CONTEXT: final_destination=${finalDestination || 'null'} geo_city=${geo.city || 'null'}`);

      // ÉTAPE 6: SEO Optimizer
      console.log('\n📋 ÉTAPE 6: SEO Optimizer (seo-optimizer)');
      pipelineReport.startStep('seo-optimizer');
      const seoResult = await this.runSeoOptimizer(generated.content, pipelineContext, pipelineReport);
      if (!seoResult) {
        throw new Error('SEO Optimizer a échoué');
      }
      pipelineReport.endStep('seo-optimizer', seoResult, { status: 'pass' });
      
      // Mettre à jour le contenu avec le résultat SEO
      generated.content = seoResult.html;

      // ÉTAPE 6.5: Editorial Enhancer (amélioration qualitative)
      console.log('\n📋 ÉTAPE 6.5: Editorial Enhancer (editorial-enhancer)');
      pipelineReport.startStep('editorial-enhancer');
      const enhancedResult = await this.runEditorialEnhancer(generated.content, pipelineContext, pipelineReport);
      if (enhancedResult) {
        generated.content = enhancedResult.html;
        pipelineReport.endStep('editorial-enhancer', enhancedResult, { status: 'pass' });
      } else {
        console.warn('⚠️ Editorial Enhancer a échoué, continuation sans amélioration');
        pipelineReport.endStep('editorial-enhancer', null, { status: 'skip' });
      }

      // ÉTAPE 6.6: SERP Competitive Enhancer (dépassement concurrentiel)
      console.log('\n📋 ÉTAPE 6.6: SERP Competitive Enhancer (serp-competitive-enhancer)');
      pipelineReport.startStep('serp-competitive-enhancer');
      const serpResult = await this.runSerpEnhancer(generated.content, pipelineContext, pipelineReport);
      if (serpResult) {
        generated.content = serpResult.html;
        pipelineReport.endStep('serp-competitive-enhancer', serpResult, { status: 'pass' });
      } else {
        console.warn('⚠️ SERP Enhancer a échoué, continuation sans amélioration');
        pipelineReport.endStep('serp-competitive-enhancer', null, { status: 'skip' });
      }

      // ÉTAPE 7: Finalizer
      console.log('\n📋 ÉTAPE 7: Finalizer (article-finalizer)');
      pipelineReport.startStep('finalizer');
      const finalized = await this.runFinalizer(generated, pipelineContext, pipelineReport);
      if (!finalized) {
        throw new Error('Finalizer a échoué');
      }
      
      // DEBUG: Vérifier les widgets APRÈS runFinalizer retourne
      const widgetsAfterRunFinalizer = this.finalizer.detectRenderedWidgets(finalized.content);
      console.log(`🔍 DEBUG pipeline-runner: Widgets dans finalized.content APRÈS runFinalizer: count=${widgetsAfterRunFinalizer.count}, types=[${widgetsAfterRunFinalizer.types.join(', ')}]`);
      
      pipelineReport.endStep('finalizer', finalized, { status: 'pass' });
      
      // DEBUG: Vérifier les widgets APRÈS endStep
      const widgetsAfterEndStep = this.finalizer.detectRenderedWidgets(finalized.content);
      console.log(`🔍 DEBUG pipeline-runner: Widgets dans finalized.content APRÈS endStep: count=${widgetsAfterEndStep.count}, types=[${widgetsAfterEndStep.types.join(', ')}]`);

      // ÉTAPE 7.5: Content Marketing Expert Pass
      // Exécutée AVANT le check de blocage pour que l'article soit toujours amélioré
      if (ENABLE_MARKETING_PASS) {
        console.log('\n📋 ÉTAPE 7.5: Content Marketing Expert Pass (content-marketing-pass)');
        pipelineReport.startStep('content-marketing-pass');
        try {
          const marketingResult = await applyContentMarketingPass(finalized.content, pipelineContext);
          if (marketingResult.improved) {
            finalized.content = marketingResult.html;
            console.log(`   ✅ Content Marketing Pass: article amélioré (${marketingResult.stats?.lengthDiffPercent || 0}% taille)`);
          } else {
            console.log('   ℹ️ Content Marketing Pass: contenu original conservé');
          }
          pipelineReport.endStep('content-marketing-pass', marketingResult, { status: marketingResult.improved ? 'pass' : 'skip' });
        } catch (error) {
          console.warn(`   ⚠️ Content Marketing Pass: ${error.message} — continuation sans amélioration`);
          pipelineReport.endStep('content-marketing-pass', { improved: false, error: error.message }, { status: 'skip' });
        }
      } else {
        console.log('\n📋 ÉTAPE 7.5: Content Marketing Expert Pass — DÉSACTIVÉ (ENABLE_MARKETING_PASS=false)');
      }

      // NETTOYAGE FINAL: Supprimer les points orphelins que WordPress wpautop() 
      // transformerait en <p>.</p>. Ces dots existent entre des balises HTML sans être
      // wrappés dans des <p>, donc nos regex <p>.</p> ne les détectent pas.
      const beforeOrphanClean = finalized.content.length;
      // Pattern 1: point seul entre deux balises HTML (ex: </p>\n.\n<h2>)
      finalized.content = finalized.content.replace(/(<\/[a-z][a-z0-9]*>)\s*\.\s*(<[a-z])/gi, '$1\n$2');
      // Pattern 2: point seul en début de contenu ou après un saut de ligne
      finalized.content = finalized.content.replace(/\n\s*\.\s*\n/g, '\n');
      // Pattern 3: point seul suivi d'un saut de ligne en fin
      finalized.content = finalized.content.replace(/\n\s*\.\s*$/g, '');
      // Pattern 4: <p>.</p> classique (filet de sécurité)
      finalized.content = finalized.content.replace(/<p[^>]*>\s*\.\s*<\/p>/gi, '');
      const orphanDotsRemoved = beforeOrphanClean - finalized.content.length;
      if (orphanDotsRemoved > 0) {
        console.log(`   🧹 Nettoyage final: ${orphanDotsRemoved} caractère(s) de points orphelins supprimés`);
      }

      // Vérifier si le finalizer a bloqué
      if (finalized.qaReport?.blocking === true) {
        pipelineReport.report.blocking = true;
        pipelineReport.report.blockingReasons.push('FINALIZER_BLOCKING');
        console.error('\n❌ PIPELINE_BLOCKED: Finalizer a détecté des violations bloquantes');
        console.error(`   Raisons: ${finalized.qaReport.blocking_reasons?.join(', ') || 'unknown'}`);
        
        // DEBUG: Vérifier les widgets même si blocking
        const widgetsInFinalizedBlocked = this.finalizer.detectRenderedWidgets(finalized.content);
        console.log(`🔍 DEBUG PIPELINE (BLOCKED): Widgets dans finalized.content: count=${widgetsInFinalizedBlocked.count}, types=[${widgetsInFinalizedBlocked.types.join(', ')}]`);
        
        // TEMPORAIRE: Continuer quand même pour permettre la publication (truth pack à corriger)
        const ENABLE_BLOCKING = parseBool(process.env.ENABLE_PIPELINE_BLOCKING ?? '1');
        if (ENABLE_BLOCKING) {
          const finalArticleBlocked = {
            title: generated.title || finalized.title,
            content: finalized.content,
            excerpt: finalized.excerpt,
            qaReport: finalized.qaReport,
            antiHallucinationReport: null
          };
          const widgetsInFinalArticleBlocked = this.finalizer.detectRenderedWidgets(finalArticleBlocked.content);
          console.log(`🔍 DEBUG PIPELINE (BLOCKED): Widgets dans finalArticleBlocked.content: count=${widgetsInFinalArticleBlocked.count}, types=[${widgetsInFinalArticleBlocked.types.join(', ')}]`);
          // Inclure l'article dans le rapport même en cas de blocage (pour inspection / debug)
          return pipelineReport.finalize(false, finalArticleBlocked);
        } else {
          console.warn('⚠️ Blocking détecté mais désactivé - continuation du pipeline');
        }
      }

      // ÉTAPE 8: Anti-Hallucination Guard
      console.log('\n📋 ÉTAPE 8: Anti-Hallucination Guard');
      pipelineReport.startStep('anti-hallucination-guard');
      // FIX: Passer aussi l'input original pour que le truth pack puisse extraire le texte
      const extractedWithInput = {
        ...extracted,
        input: {
          post: {
            title: input.post?.title || '',
            selftext: input.post?.selftext || '',
            author: input.post?.author || ''
          }
        }
      };
      
      const antiHallucination = await this.runAntiHallucinationGuard(
        finalized.content,
        extractedWithInput,
        pipelineContext,
        pipelineReport
      );
      if (!antiHallucination) {
        throw new Error('Anti-Hallucination Guard a échoué');
      }
      pipelineReport.endStep('anti-hallucination-guard', antiHallucination, { status: 'pass' });

      // Vérifier si l'anti-hallucination guard a bloqué
      // TEMPORAIRE: Désactiver le blocking pour permettre la publication (truth pack à corriger)
      const ENABLE_ANTI_HALLUCINATION_BLOCKING = parseBool(process.env.ENABLE_ANTI_HALLUCINATION_BLOCKING ?? '1');
      if (antiHallucination.blocking === true && ENABLE_ANTI_HALLUCINATION_BLOCKING) {
        pipelineReport.report.blocking = true;
        pipelineReport.report.blockingReasons.push('ANTI_HALLUCINATION_BLOCKING');
        console.error('\n❌ PIPELINE_BLOCKED: Anti-Hallucination Guard a détecté des hallucinations bloquantes');
        console.error(`   Raisons: ${antiHallucination.reasons?.join(', ') || 'unknown'}`);
        
        const finalReport = pipelineReport.finalize(false, null);
        return finalReport;
      } else if (antiHallucination.blocking === true && !ENABLE_ANTI_HALLUCINATION_BLOCKING) {
        console.warn(`⚠️ ANTI_HALLUCINATION_BLOCKING détecté mais désactivé temporairement (truth pack à corriger)`);
      }

      // Pipeline réussi
      // DEBUG: Vérifier les widgets dans finalized.content avant de créer finalArticle
      const widgetsInFinalized = this.finalizer.detectRenderedWidgets(finalized.content);
      console.log(`🔍 DEBUG PIPELINE: Widgets dans finalized.content: count=${widgetsInFinalized.count}, types=[${widgetsInFinalized.types.join(', ')}]`);      
      // NOTE: removeOldStructureResidues est DÉJÀ appelé dans finalizeArticle
      // L'appel redondant ici détruisait des widgets (connectivity perdu à chaque run)
      // Supprimé pour protéger les widgets insérés par le finalizer
      let finalContent = finalized.content;
      // #region agent log
      const widgetsBeforeRemoveResidues = this.finalizer.detectRenderedWidgets(finalContent);
      fetch('http://127.0.0.1:7242/ingest/9abb3010-a0f0-475b-865d-f8197825291f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'pipeline-runner.js:runPipeline:WIDGETS_FINAL_CHECK',message:'Widgets in finalContent (no more redundant removeOldStructureResidues)',data:{widgetsCount:widgetsBeforeRemoveResidues.count,widgetsTypes:widgetsBeforeRemoveResidues.types},timestamp:Date.now(),hypothesisId:'A-WIDGET-FIX'})}).catch(()=>{});
      // #endregion
      
      const finalArticle = {
        title: generated.title || finalized.title,
        content: finalContent,
        excerpt: finalized.excerpt,
        qaReport: finalized.qaReport,
        antiHallucinationReport: antiHallucination
      };
      
      // DEBUG: Vérifier les widgets dans finalArticle.content après création
      const widgetsInFinalArticle = this.finalizer.detectRenderedWidgets(finalArticle.content);
      console.log(`🔍 DEBUG PIPELINE: Widgets dans finalArticle.content: count=${widgetsInFinalArticle.count}, types=[${widgetsInFinalArticle.types.join(', ')}]`);
      
      console.log('\n✅ PIPELINE_RUNNER: Pipeline terminé avec succès');
      const finalReport = pipelineReport.finalize(true, finalArticle);
      
      // DEBUG: Vérifier les widgets dans report.finalArticle.content après finalize
      if (finalReport.report?.finalArticle?.content) {
        const widgetsInReport = this.finalizer.detectRenderedWidgets(finalReport.report.finalArticle.content);
        console.log(`🔍 DEBUG PIPELINE: Widgets dans report.finalArticle.content: count=${widgetsInReport.count}, types=[${widgetsInReport.types.join(', ')}]`);
      }
      
      return finalReport;

    } catch (error) {
      console.error(`\n❌ PIPELINE_RUNNER: Erreur dans le pipeline: ${error.message}`);
      pipelineReport.addError('pipeline', error.message, error.stack);
      return pipelineReport.finalize(false, null);
    }
  }

  /**
   * ÉTAPE 1: Extractor
   */
  async runExtractor(input, pipelineReport) {
    try {
      const thread = {
        post: input.post,
        comments: input.comments || []
      };
      
      const extracted = extractRedditSemantics(thread);
      console.log(`   ✅ Extractor: ${Object.keys(extracted).length} champs extraits`);
      return extracted;
    } catch (error) {
      console.error(`   ❌ Extractor: ${error.message}`);
      pipelineReport.addError('extractor', error.message, error.stack);
      return null;
    }
  }

  /**
   * ÉTAPE 2: Pattern Detector
   */
  async runPatternDetector(input, extracted, pipelineReport) {
    try {
      // S'assurer que comments est un array
      let comments = input.comments || [];
      if (!Array.isArray(comments)) {
        comments = [];
      }
      
      const patternInput = {
        title: input.post?.title || '',
        body: input.post?.selftext || input.post?.body || '',
        comments: comments,
        meta: input.source || {}
      };
      
      const pattern = detectRedditPattern(patternInput);
      console.log(`   ✅ Pattern Detector: type=${pattern.story_type} theme=${pattern.theme_primary}`);
      return pattern;
    } catch (error) {
      console.error(`   ❌ Pattern Detector: ${error.message}`);
      pipelineReport.addError('pattern-detector', error.message, error.stack);
      return null;
    }
  }

  /**
   * ÉTAPE 3: Story Compiler
   */
  async runStoryCompiler(input, extracted, pattern, pipelineReport) {
    try {
      const storyInput = {
        reddit: {
          title: input.post?.title || '',
          selftext: input.post?.selftext || input.post?.body || '',
          author: input.post?.author || null,
          created_utc: input.post?.created_utc || null,
          url: input.post?.url || null,
          subreddit: input.post?.subreddit || null,
          comments: input.comments || []
        },
        extraction: extracted,
        pattern: pattern,
        geo: input.geo || {},
        source: input.source || {}
      };
      
      const story = compileRedditStory(storyInput);
      console.log(`   ✅ Story Compiler: story compilée avec ${Object.keys(story.story).length} sections`);
      return story;
    } catch (error) {
      console.error(`   ❌ Story Compiler: ${error.message}`);
      pipelineReport.addError('story-compiler', error.message, error.stack);
      return null;
    }
  }

  /**
   * Charge les titres déjà publiés (anti-répétition angle/contenu)
   * Source : published-articles-cache.json puis articles-database.json en fallback
   */
  async loadExistingTitles() {
    const fs = await import('fs');
    const path = await import('path');
    const cwd = process.cwd();
    const cachePath = path.join(cwd, 'published-articles-cache.json');
    const dbPath = path.join(cwd, 'articles-database.json');

    if (fs.existsSync(cachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        const titles = Array.isArray(data.articles) ? data.articles : [];
        const normalized = titles.map(t => (typeof t === 'string' ? t : t.title || '')).filter(Boolean);
        if (normalized.length > 0) {
          console.log(`   📋 Anti-répétition: ${normalized.length} titre(s) chargé(s) depuis published-articles-cache.json`);
          return normalized;
        }
      } catch (e) {
        console.warn('   ⚠️ Lecture published-articles-cache.json:', e.message);
      }
    }
    if (fs.existsSync(dbPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        const articles = data.articles || [];
        const titles = articles.map(a => (a && a.title) ? a.title : '').filter(Boolean);
        if (titles.length > 0) {
          console.log(`   📋 Anti-répétition: ${titles.length} titre(s) chargé(s) depuis articles-database.json`);
          return titles;
        }
      } catch (e) {
        console.warn('   ⚠️ Lecture articles-database.json:', e.message);
      }
    }
    return [];
  }

  /**
   * ÉTAPE 4: Generator
   */
  async runGenerator(input, extracted, pattern, story, pipelineReport) {
    try {
      const existingTitles = await this.loadExistingTitles();

      // Le generator attend { extracted, pattern, story } dans input
      const generatorInput = {
        extracted: extracted,
        pattern: pattern,
        story: story, // story complet avec evidence, meta, etc.
        geo: input.geo || {},
        // Métadonnées supplémentaires pour contexte
        title: input.post?.title || '',
        author: input.post?.author || null,
        url: input.post?.url || null,
        subreddit: input.post?.subreddit || null,
        existingTitles,
        existingAngles: [] // optionnel : résumés 1 ligne si stockés plus tard
      };

      // Générer le contenu (analysis n'est plus utilisé dans la nouvelle version)
      const generated = await this.generator.generateIntelligentContent(generatorInput, {});
      console.log(`   ✅ Generator: contenu généré (${generated.content?.length || 0} chars)`);
      return generated;
    } catch (error) {
      console.error(`   ❌ Generator: ${error.message}`);
      pipelineReport.addError('generator', error.message, error.stack);
      return null;
    }
  }

  /**
   * ÉTAPE 5: Affiliate Injector
   */
  async runAffiliateInjector(extracted, pattern, story, geo, pipelineReport) {
    try {
      const affiliatePlan = decideAffiliatePlacements({
        extracted,
        pattern,
        story: story.story,
        geo_defaults: geo || {}
      });
      
      const placementsCount = affiliatePlan?.placements?.length || 0;
      console.log(`   ✅ Affiliate Injector: ${placementsCount} placement(s) décidé(s)`);
      return affiliatePlan;
    } catch (error) {
      console.error(`   ❌ Affiliate Injector: ${error.message}`);
      pipelineReport.addWarning('affiliate-injector', error.message);
      // Non bloquant, retourner un plan vide
      return { placements: [] };
    }
  }

  /**
   * ÉTAPE 6: SEO Optimizer
   */
  async runSeoOptimizer(html, pipelineContext, pipelineReport) {
    try {
      const qaReport = {
        checks: [],
        issues: [],
        actions: [],
        debug: {},
        status: 'pass'
      };
      
      const result = await this.seoOptimizer.optimize(html, pipelineContext, qaReport);
      console.log(`   ✅ SEO Optimizer: optimisation terminée (${result.report.checks.length} checks)`);
      return result;
    } catch (error) {
      console.error(`   ❌ SEO Optimizer: ${error.message}`);
      pipelineReport.addError('seo-optimizer', error.message, error.stack);
      return null;
    }
  }

  /**
   * ÉTAPE 6.5: Editorial Enhancer (amélioration qualitative)
   */
  async runEditorialEnhancer(html, pipelineContext, pipelineReport) {
    try {
      const result = await this.editorialEnhancer.enhanceArticle(html, pipelineContext);
      if (result && result.html) {
        console.log(`   ✅ Editorial Enhancer: améliorations appliquées`);
        return result;
      }
      return null;
    } catch (error) {
      console.error(`   ❌ Editorial Enhancer: ${error.message}`);
      pipelineReport.addError('editorial-enhancer', error.message, error.stack);
      return null;
    }
  }

  /**
   * ÉTAPE 6.6: SERP Competitive Enhancer (dépassement concurrentiel)
   */
  async runSerpEnhancer(html, pipelineContext, pipelineReport) {
    try {
      const result = await this.serpEnhancer.enhanceArticle(html, pipelineContext);
      if (result && result.html) {
        console.log(`   ✅ SERP Competitive Enhancer: améliorations appliquées`);
        return result;
      }
      return null;
    } catch (error) {
      console.error(`   ❌ SERP Competitive Enhancer: ${error.message}`);
      pipelineReport.addError('serp-competitive-enhancer', error.message, error.stack);
      return null;
    }
  }

  /**
   * ÉTAPE 7: Finalizer
   */
  async runFinalizer(generated, pipelineContext, pipelineReport) {
    try {
      const article = {
        title: generated.title,
        content: generated.content,
        excerpt: generated.excerpt || ''
      };

      const analysis = {
        extracted: pipelineContext.story.extracted,
        pattern: pipelineContext.pattern,
        story: pipelineContext.story.story
      };

      const finalized = await this.finalizer.finalizeArticle(article, analysis, pipelineContext);
      console.log(`   ✅ Finalizer: article finalisé (${finalized.qaReport?.checks?.length || 0} checks)`);
      
      // DEBUG: Vérifier les widgets IMMÉDIATEMENT après finalizeArticle retourne
      const widgetsInFinalizedImmediate = this.finalizer.detectRenderedWidgets(finalized.content);
      console.log(`🔍 DEBUG runFinalizer: Widgets dans finalized.content IMMÉDIATEMENT après finalizeArticle: count=${widgetsInFinalizedImmediate.count}, types=[${widgetsInFinalizedImmediate.types.join(', ')}]`);
      
      return finalized;
    } catch (error) {
      console.error(`   ❌ Finalizer: ${error.message}`);
      pipelineReport.addError('finalizer', error.message, error.stack);
      return null;
    }
  }

  /**
   * ÉTAPE 8: Anti-Hallucination Guard
   */
  async runAntiHallucinationGuard(html, extracted, pipelineContext, pipelineReport) {
    try {
      // extracted est déjà enrichi avant l'appel, donc on peut l'utiliser directement
      const guardResult = await runAntiHallucinationGuard({
        html,
        extracted,
        context: pipelineContext
      });
      
      console.log(`   ✅ Anti-Hallucination Guard: status=${guardResult.status} blocking=${guardResult.blocking}`);
      return guardResult;
    } catch (error) {
      console.error(`   ❌ Anti-Hallucination Guard: ${error.message}`);
      pipelineReport.addError('anti-hallucination-guard', error.message, error.stack);
      return null;
    }
  }
}

// Export pour utilisation comme module
export default PipelineRunner;

// Si exécuté directement, exécuter le pipeline avec des données de test
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);

// Vérifier si le fichier est exécuté directement (pas importé)
const isMainModule = process.argv[1] && (fileURLToPath(import.meta.url) === process.argv[1] || __filename === process.argv[1]);

if (isMainModule) {
  const runner = new PipelineRunner();
  
  // Exemple d'utilisation avec des données de test
  const testInput = {
    post: {
      title: 'Test Post',
      selftext: 'Test content',
      author: 'testuser',
      url: 'https://reddit.com/r/test',
      subreddit: 'test',
      created_utc: Date.now() / 1000
    },
    comments: [],
    geo: {},
    source: {}
  };

  runner.runPipeline(testInput)
    .then(report => {
      console.log('\n📊 PIPELINE REPORT:');
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.success && !report.blocking ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Erreur fatale:', error);
      process.exit(1);
    });
}
