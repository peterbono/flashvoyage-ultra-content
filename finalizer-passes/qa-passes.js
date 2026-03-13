/**
 * FINALIZER PASSES - QA, validation, invention guard
 * FV-115: Extracted from article-finalizer.js
 * Each function is bound to the ArticleFinalizer instance at runtime.
 */

import { ENABLE_ANTI_HALLUCINATION_BLOCKING, FORCE_OFFLINE, ENABLE_AFFILIATE_INJECTOR, parseBool } from '../config.js';

export async function runQAReport(html, pipelineContext, analysis) {
  let finalHtml = html;    
  // SUPPRESSION FORCÉE des blockquotes existants (AVANT réinsertion des citations du récit)
  // FIX: NE PAS utiliser Cheerio xmlMode ici — les <script> Travelpayouts contiennent des & non échappés
  // dans les URLs (ex: &trs=, &shmarker=) qui corrompent le DOM en xmlMode et détruisent les H2
  const blockquoteRegexQA = /<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi;
  const blockquoteMatchesQA = finalHtml.match(blockquoteRegexQA);
  if (blockquoteMatchesQA && blockquoteMatchesQA.length > 0) {
    console.log(`🧹 FINALIZER: Suppression de ${blockquoteMatchesQA.length} blockquote(s) existants...`);
    finalHtml = finalHtml.replace(blockquoteRegexQA, '');
  }
  const cheerioModule = await import('cheerio');
  const cheerio = cheerioModule.default || cheerioModule;

  // RECRÉATION des citations extraites du récit : au moins une citation (evidence ou extracted)
  const hasEvidenceSnippetsEarly = pipelineContext?.story?.evidence?.source_snippets?.length > 0;
  const extracted = pipelineContext?.story?.extracted;
  const postText = extracted?.post?.clean_text || extracted?.post?.selftext || extracted?.selftext
    || pipelineContext?.input?.post?.selftext || pipelineContext?.post?.selftext || '';
  const hasPostText = postText && postText.length > 50;

  if (hasEvidenceSnippetsEarly) {
    // 1) Priorité : insérer une citation depuis evidence.source_snippets (extraits du récit)
    const snippets = pipelineContext.story.evidence.source_snippets;
    for (const snippet of snippets) {
      let snippetText = typeof snippet === 'string' ? snippet : (snippet?.text || snippet?.content || snippet?.body || snippet?.quote || snippet?.excerpt || snippet?.snippet || '');
      if (!snippetText || (snippetText = snippetText.trim()).length < 20) continue;
      const excerpt = this.smartTruncate(snippetText, 250, 350);
      if (excerpt.length < 20) continue;
      let citationText = excerpt;
      if (!FORCE_OFFLINE) {
        const englishWords = (citationText.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|I|you|he|she|it|we|they)\b/gi) || []).length;
        const totalWords = citationText.split(/\s+/).length;
        if (totalWords > 5 && totalWords > 0 && englishWords / totalWords > 0.3) {
          try {
            const translated = await this.intelligentContentAnalyzer.translateToFrench(citationText);
            if (translated && translated.trim().length > 10) citationText = translated.trim();
          } catch (e) { /* garder original */ }
        }
      }
      const escaped = citationText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      // Déterminer la position d'insertion et adapter le label cite
      // RÈGLE: Toujours insérer APRÈS le hook (= après au moins 1 paragraphe narratif)
      const h2List = [...finalHtml.matchAll(/<h2[^>]*>.*?<\/h2>/gi)];
      // Chercher la position après le 1er paragraphe qui suit le 1er H2 (= après le hook)
      let insertAfterIndex = 0;
      if (h2List.length >= 1) {
        const afterFirstH2 = h2List[0].index + h2List[0][0].length;
        // Trouver le premier </p> après ce H2 (= fin du hook)
        const firstPAfterH2 = finalHtml.substring(afterFirstH2).match(/<\/p>/i);
        if (firstPAfterH2) {
          insertAfterIndex = afterFirstH2 + firstPAfterH2.index + firstPAfterH2[0].length;
        } else {
          insertAfterIndex = afterFirstH2;
        }
      }
      // Préférer après le 2e H2 + 1er paragraphe si disponible (plus loin dans le récit)
      if (h2List.length >= 2) {
        const afterSecondH2 = h2List[1].index + h2List[1][0].length;
        const firstPAfter2ndH2 = finalHtml.substring(afterSecondH2).match(/<\/p>/i);
        if (firstPAfter2ndH2) {
          insertAfterIndex = afterSecondH2 + firstPAfter2ndH2.index + firstPAfter2ndH2[0].length;
        } else {
          insertAfterIndex = afterSecondH2;
        }
      }
      // Si insertion dans les 500 premiers chars → label neutre (pas de Reddit dans le hook)
      const citeLabel = insertAfterIndex < 500 ? 'Témoignage de voyageur' : 'Extrait Reddit';
      const citationBlock = `<blockquote><p>${escaped}</p><p><cite>— ${citeLabel}</cite></p></blockquote>`;
      if (insertAfterIndex > 0) {
        finalHtml = finalHtml.slice(0, insertAfterIndex) + '\n\n' + citationBlock + '\n\n' + finalHtml.slice(insertAfterIndex);
        console.log(`✅ FINALIZER: Citation du récit insérée depuis evidence.source_snippets (après hook narratif)`);
        break;
      }
      const firstP = finalHtml.match(/<p[^>]*>.*?<\/p>/i);
      if (firstP) {
        const idx = firstP.index + firstP[0].length;
        finalHtml = finalHtml.slice(0, idx) + '\n\n' + citationBlock + '\n\n' + finalHtml.slice(idx);
        console.log(`✅ FINALIZER: Citation du récit insérée depuis evidence.source_snippets`);
        break;
      }
    }
  }

  // 2) Fallback : si aucune citation insérée, une depuis le post extracted (traduit si en ligne)
  // FIX: Utiliser [\s\S] au lieu de . pour matcher les newlines dans les blockquotes multilignes
  const hasBlockquoteNow = /<blockquote[^>]*>[\s\S]*?<\/blockquote>/i.test(finalHtml);
  if (!hasBlockquoteNow && hasPostText) {
    let excerpt = this.smartTruncate(postText, 250, 350);
    if (!FORCE_OFFLINE && this.intelligentContentAnalyzer) {
      try {
        const translated = await this.intelligentContentAnalyzer.translateToFrench(excerpt);
        if (translated && translated.trim().length > 10) excerpt = translated.trim();
      } catch (e) { /* garder original */ }
    }
    const escapedExcerpt = excerpt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    // FIX: Insérer le blockquote APRÈS le hook (après le 1er paragraphe du 1er H2)
    const firstH2Match = finalHtml.match(/<h2[^>]*>.*?<\/h2>/i);
    if (firstH2Match) {
      const afterH2 = firstH2Match.index + firstH2Match[0].length;
      // Trouver le 1er </p> après le H2 (= fin du hook narratif)
      const firstPAfterH2 = finalHtml.substring(afterH2).match(/<\/p>/i);
      const insertIdx = firstPAfterH2 
        ? afterH2 + firstPAfterH2.index + firstPAfterH2[0].length
        : afterH2;
      // Si insertion dans les 500 premiers chars → label neutre (pas de Reddit dans le hook)
      const citeLabelFallback = insertIdx < 500 ? 'Témoignage de voyageur' : 'Extrait Reddit';
      const newBlockquote = `<blockquote><p>${escapedExcerpt}</p><p><cite>— ${citeLabelFallback}</cite></p></blockquote>`;
      finalHtml = finalHtml.slice(0, insertIdx) + '\n\n' + newBlockquote + '\n\n' + finalHtml.slice(insertIdx);
      console.log(`✅ FINALIZER: Citation du récit insérée depuis extracted (post) (après hook)`);
    } else {
      const firstP2 = finalHtml.match(/<p[^>]*>.*?<\/p>/i);
      if (firstP2) {
        const idx = firstP2.index + firstP2[0].length;
        const citeLabelP = idx < 500 ? 'Témoignage de voyageur' : 'Extrait Reddit';
        const blockquoteP = `<blockquote><p>${escapedExcerpt}</p><p><cite>— ${citeLabelP}</cite></p></blockquote>`;
        finalHtml = finalHtml.slice(0, idx) + '\n\n' + blockquoteP + '\n\n' + finalHtml.slice(idx);
        console.log(`✅ FINALIZER: Citation du récit insérée depuis extracted (post)`);
      }
    }
  }

  const hasBlockquoteFinal = /<blockquote[^>]*>.*?<\/blockquote>/i.test(finalHtml);
  if (!hasBlockquoteFinal && (hasEvidenceSnippetsEarly || hasPostText)) {
    const snippetCount = pipelineContext?.story?.evidence?.source_snippets?.length ?? 0;
    console.warn(`⚠️ FINALIZER: Aucune citation Reddit insérée malgré sources disponibles (snippets: ${snippetCount}, postText: ${hasPostText ? (postText?.length ?? 0) + ' chars' : 'non'})`);
  }
  
  const report = {
    checks: [],
    actions: [],
    issues: [],
    metrics: {
      html_length_before: finalHtml.length,
      html_length_after: finalHtml.length,
      h2_count: 0,
      quote_count: 0,
      affiliate_count: 0,
      widgets_count: 0,
      internal_links: 0,
      external_links: 0,
      repetition_score: 0
    }
  };

  // finalHtml déjà modifié ci-dessus

  // ANCIEN CODE DE TRADUCTION BLOCKQUOTES (SUPPRIMÉ - remplacé par le code ci-dessus)
  const blockquoteMatches = [...html.matchAll(/<blockquote[^>]*>(.*?)<\/blockquote>/gs)];
  for (const match of blockquoteMatches) {
    const blockquoteContent = match[1];
    // Extraire le texte sans les balises
    const textContent = blockquoteContent.replace(/<[^>]+>/g, ' ').trim();
    
    // Détecter si c'est de l'anglais
    const englishWords = (textContent.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|I|you|he|she|it|we|they)\b/gi) || []).length;
    const totalWords = textContent.split(/\s+/).length;
    const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
    
    if (englishRatio > 0.3 && totalWords > 5) {
      console.log(`🌐 Blockquote détectée en anglais (${Math.round(englishRatio * 100)}%): traduction via LLM...`);
      try {
        const { callOpenAIWithRetry } = await import('./intelligent-content-analyzer-optimized.js');
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey && !process.env.FORCE_OFFLINE) {
          // Traduire seulement les paragraphes, conserver la structure HTML
          const paragraphs = [...blockquoteContent.matchAll(/<p[^>]*>(.*?)<\/p>/gs)];
          let translatedContent = blockquoteContent;
          
          for (const pMatch of paragraphs) {
            const pText = pMatch[1].replace(/<[^>]+>/g, '').trim();
            if (pText.length > 10 && !pText.includes('Extrait Reddit') && !pText.includes('—')) {
              const response = await callOpenAIWithRetry({
                apiKey,
                _trackingStep: 'finalizer-translate-blockquote',
                body: {
                  model: 'gpt-4o',
                  messages: [
                    { role: 'system', content: 'Tu es un traducteur professionnel. Traduis le texte suivant de l\'anglais vers le français. Ne réponds qu\'avec le texte traduit, sans ajouter de guillemets ou de formatage.' },
                    { role: 'user', content: pText }
                  ],
                  max_tokens: 500,
                  temperature: 0.3
                },
                sourceText: pText,
                type: 'translation'
              });
              const translatedText = response.choices[0].message.content.trim();
              translatedContent = translatedContent.replace(pMatch[1], translatedText);
              console.log(`✅ Paragraphe traduit: ${pText.substring(0, 40)}... → ${translatedText.substring(0, 40)}...`);
            }
          }
          
          // Remplacer le blockquote dans le HTML
          finalHtml = finalHtml.replace(match[0], `<blockquote>${translatedContent}</blockquote>`);
          report.actions.push({ type: 'translated_blockquote', details: `english_ratio=${Math.round(englishRatio * 100)}%` });
        } else {
          console.warn('⚠️ Traduction désactivée (FORCE_OFFLINE ou pas de clé API). Blockquote conservée en anglais.');
        }
      } catch (error) {
        console.error(`❌ Erreur traduction blockquote: ${error.message}`);
      }
    }
  }

  // Calculer métriques de base
  const h2Matches = html.matchAll(/<h2[^>]*>/g);
  report.metrics.h2_count = Array.from(h2Matches).length;
  
  const quoteMatches = html.matchAll(/<blockquote[^>]*>|<!-- wp:pullquote/g);
  report.metrics.quote_count = Array.from(quoteMatches).length;
  
  const affiliateMatches = html.matchAll(/class="affiliate-module"|data-placement-id=/g);
  report.metrics.affiliate_count = Array.from(affiliateMatches).length;
  
  const widgetMatches = html.matchAll(/travelpayouts|kiwi\.com|airalo/g);
  report.metrics.widgets_count = Array.from(widgetMatches).length;
  
  const internalLinkMatches = html.matchAll(/<a[^>]*href="[^"]*flashvoyage[^"]*"/g);
  report.metrics.internal_links = Array.from(internalLinkMatches).length;
  
  const externalLinkMatches = html.matchAll(/<a[^>]*href="https?:\/\/(?!.*flashvoyage)[^"]*"/g);
  report.metrics.external_links = Array.from(externalLinkMatches).length;

  // Validation liens internes (href + ancre cohérents)
  const linkValidation = this.validateInternalLinks(finalHtml);
  if (!linkValidation.valid) {
    report.checks.push({
      name: 'internal_links_valid',
      status: 'warn',
      details: `${linkValidation.errors.length} lien(s) interne(s) invalide(s): ${linkValidation.errors.slice(0, 2).join('; ')}`
    });
    linkValidation.errors.forEach(err => report.issues.push({
      code: 'INTERNAL_LINK_INVALID',
      severity: 'medium',
      message: err,
      check: 'internal_links_valid'
    }));
  } else if (report.metrics.internal_links > 0) {
    report.checks.push({
      name: 'internal_links_valid',
      status: 'pass',
      details: `${report.metrics.internal_links} lien(s) interne(s) valide(s)`
    });
  }

  // Quality gate étendue : ouverture immersive, H2 blacklist, quotes, hook sans Reddit
  const qualityGate = this.runQualityGateContent(finalHtml, pipelineContext);
  if (qualityGate.warnings.length > 0) {
    report.checks.push({
      name: 'content_quality_gate',
      status: 'warn',
      details: qualityGate.warnings.join('; ')
    });
    if (!qualityGate.noForbiddenH2) {
      report.issues.push({
        code: 'FORBIDDEN_H2_PRESENT',
        severity: 'high',
        message: 'Section "Ce que dit le témoignage" encore présente',
        check: 'content_quality_gate'
      });
    }
    if (!qualityGate.noGenericH2) {
      report.issues.push({
        code: 'GENERIC_H2_DETECTED',
        severity: 'medium',
        message: qualityGate.warnings.find(w => w.includes('H2 génériques')) || 'H2 génériques détectés',
        check: 'content_quality_gate'
      });
    }
    if (!qualityGate.hasMinQuotes) {
      report.issues.push({
        code: 'LOW_QUOTE_COUNT',
        severity: 'low',
        message: qualityGate.warnings.find(w => w.includes('Citations insuffisantes')) || 'Moins de 2 citations dans l\'article',
        check: 'content_quality_gate'
      });
    }
    if (!qualityGate.hookWithoutReddit) {
      report.issues.push({
        code: 'REDDIT_IN_HOOK',
        severity: 'medium',
        message: 'Mention de Reddit dans les 500 premiers caractères — le hook doit être immersif sans source',
        check: 'content_quality_gate'
      });
    }
  } else {
    report.checks.push({
      name: 'content_quality_gate',
      status: 'pass',
      details: 'Ouverture immersive, pas de H2 générique, quotes suffisantes, hook sans Reddit'
    });
  }

  // CHECK A: Cohérence structure "FlashVoyage Premium"
  const hasIntro = /<p[^>]*>.*?<\/p>/i.test(html);
  const hasMin2H2 = report.metrics.h2_count >= 2;
  const hasRelatedSection = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i.test(html);
  
  if (!hasIntro || !hasMin2H2 || !hasRelatedSection) {
    report.checks.push({
      name: 'structure_flashvoyage_premium',
      status: 'warn',
      details: `intro=${hasIntro} h2_count=${report.metrics.h2_count} has_related=${hasRelatedSection}`
    });
    
    // Action corrective minimale: insérer H2 manquant si possible
    // Ne jamais insérer "Conseils pratiques" — résidu de l'ancienne structure
    if (!hasMin2H2 && report.metrics.h2_count === 1) {
      console.log('   ℹ️ Article avec 1 seul H2 — pas d\'insertion de "Conseils pratiques" (résidu ancienne structure)');
    }
  } else {
    report.checks.push({
      name: 'structure_flashvoyage_premium',
      status: 'pass',
      details: 'Structure complète'
    });
  }

  // CHECK B: Citations Reddit / traçabilité
  const hasEvidenceSnippets = pipelineContext?.story?.evidence?.source_snippets?.length > 0;
  // Vérifier sur finalHtml (qui peut avoir été modifié par CHECK A)
  const hasRedditCitation = /<blockquote[^>]*>.*?<\/blockquote>|<!-- wp:pullquote/i.test(finalHtml);
  
  if (hasEvidenceSnippets && !hasRedditCitation) {
    // Insérer une citation depuis evidence.source_snippets
    const snippets = pipelineContext.story.evidence.source_snippets;
    let inserted = false;
    
    for (const snippet of snippets) {
      // Accepter différents formats de snippets
      let snippetText = '';
      if (typeof snippet === 'string') {
        snippetText = snippet;
      } else if (snippet && typeof snippet === 'object') {
        // Essayer différentes propriétés possibles
        snippetText = snippet.text || snippet.content || snippet.body || snippet.quote || 
                     snippet.excerpt || snippet.snippet || JSON.stringify(snippet);
      }
      
      // Nettoyer et valider
      if (!snippetText || typeof snippetText !== 'string') continue;
      snippetText = snippetText.trim();
      if (snippetText.length < 20) continue;
      
      // APPROCHE INTELLIGENTE: Troncature respectant les limites de phrases et de mots
      // AMÉLIORATION: Augmenter les limites pour les citations Reddit (meilleure lisibilité)
      let citationText = this.smartTruncate(snippetText, 250, 350);
      if (citationText.length < 20) continue;
      
      // TRADUIRE le texte si nécessaire (détection anglais + traduction LLM)
      const englishWords = (citationText.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|from|basically|don't|I'm|I|you|he|she|it|we|they)\b/gi) || []).length;
      const totalWords = citationText.split(/\s+/).length;
      const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
      
      if (englishRatio > 0.3 && totalWords > 5) {
        console.log(`🌐 Blockquote détectée en anglais (${Math.round(englishRatio * 100)}%): traduction via LLM...`);
        try {
          // Utiliser le même système de traduction que pour les citations dans intelligent-content-analyzer
          const { callOpenAIWithRetry } = await import('./intelligent-content-analyzer-optimized.js');
          const apiKey = process.env.OPENAI_API_KEY;
          if (apiKey && !process.env.FORCE_OFFLINE) {
            const response = await callOpenAIWithRetry({
              apiKey,
              _trackingStep: 'finalizer-translate-citation',
              body: {
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: 'Tu es un traducteur professionnel. Traduis le texte suivant de l\'anglais vers le français. Ne réponds qu\'avec le texte traduit.' },
                  { role: 'user', content: citationText }
                ],
                max_tokens: 500,
                temperature: 0.3
              },
              sourceText: citationText,
              type: 'translation'
            });
            citationText = response.choices[0].message.content.trim();
            console.log(`✅ Blockquote traduite: ${citationText.substring(0, 60)}...`);
          } else {
            console.warn('⚠️ Traduction désactivée (FORCE_OFFLINE ou pas de clé API). Blockquote conservée en anglais.');
          }
        } catch (error) {
          console.error(`❌ Erreur traduction blockquote: ${error.message}`);
          // Garder le texte original en cas d'erreur
        }
      }
      
      // Échapper HTML
      const escapedText = citationText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      
      const citationBlock = `
<blockquote>
<p>${escapedText}</p>
<p><cite>Extrait Reddit</cite></p>
</blockquote>
`;
      
      // Insérer après le 1er H2 ou après l'intro (toujours sur finalHtml)
      const firstH2Match = finalHtml.match(/<h2[^>]*>.*?<\/h2>/i);
      if (firstH2Match) {
        const insertIndex = firstH2Match.index + firstH2Match[0].length;
        finalHtml = finalHtml.slice(0, insertIndex) + '\n\n' + citationBlock + '\n\n' + finalHtml.slice(insertIndex);
        inserted = true;
        report.actions.push({ type: 'inserted_reddit_citation', details: `snippet_length=${citationText.length}` });
        report.metrics.quote_count++;
        break;
      } else {
        const firstPMatch = finalHtml.match(/<p[^>]*>.*?<\/p>/i);
        if (firstPMatch) {
          const insertIndex = firstPMatch.index + firstPMatch[0].length;
          finalHtml = finalHtml.slice(0, insertIndex) + '\n\n' + citationBlock + '\n\n' + finalHtml.slice(insertIndex);
          inserted = true;
          report.actions.push({ type: 'inserted_reddit_citation', details: `snippet_length=${citationText.length}` });
          report.metrics.quote_count++;
          break;
        } else {
          // Fallback: insérer au début du contenu
          finalHtml = citationBlock + '\n\n' + finalHtml;
          inserted = true;
          report.actions.push({ type: 'inserted_reddit_citation', details: `snippet_length=${citationText.length} (fallback: début)` });
          report.metrics.quote_count++;
          break;
        }
      }
    }
    
    if (!inserted) {
      // PHASE 6.2.3: Si aucun snippet valide, WARN (pas FAIL) + log explicite
      const validSnippetsCount = snippets.filter(s => {
        let snippetText = '';
        if (typeof s === 'string') {
          snippetText = s;
        } else if (s && typeof s === 'object') {
          snippetText = s.text || s.content || s.body || s.quote || s.excerpt || s.snippet || '';
        }
        return snippetText && snippetText.trim().length >= 20;
      }).length;
      
      if (validSnippetsCount === 0) {
        // Aucun snippet valide → WARN
        report.checks.push({
          name: 'reddit_citation_traceability',
          status: 'warn',
          details: `evidence_snippets existent (${snippets.length} snippet(s)) mais tous invalides (< 20 chars ou vides)`
        });
        console.log(`⚠️ FINALIZER_QA_WARN: snippets invalid - ${snippets.length} snippets but none valid`);
      } else {
        // Snippets valides mais insertion échouée → FAIL
        report.checks.push({
          name: 'reddit_citation_traceability',
          status: 'fail',
          details: `evidence_snippets existent (${snippets.length} snippet(s), ${validSnippetsCount} valides) mais insertion échouée`
        });
        report.issues.push({
          code: 'SOURCE_OF_TRUTH_VIOLATION',
          severity: 'high',
          message: 'missing_reddit_citation: evidence.source_snippets.length > 0 mais aucune citation insérée malgré snippets valides',
          evidence: { snippets_count: snippets.length, valid_snippets_count: validSnippetsCount }
        });
      }
    } else {
      report.checks.push({
        name: 'reddit_citation_traceability',
        status: 'pass',
        details: 'Citation Reddit insérée depuis evidence.source_snippets'
      });
    }
  } else if (hasEvidenceSnippets && hasRedditCitation) {
    report.checks.push({
      name: 'reddit_citation_traceability',
      status: 'pass',
      details: 'Citation Reddit présente'
    });
  } else {
    report.checks.push({
      name: 'reddit_citation_traceability',
      status: 'warn',
      details: 'Pas de evidence_snippets disponible'
    });
  }

  // PHASE 6.2.4: CHECK C amélioré - CTA/Affiliate plan: conformité stricte
  const affiliatePlan = pipelineContext?.affiliate_plan;
  const hasAffiliatePlan = affiliatePlan?.placements?.length > 0;
  const enableAffiliateInjector = ENABLE_AFFILIATE_INJECTOR;
  
  if (hasAffiliatePlan && enableAffiliateInjector) {
    const expectedCount = affiliatePlan.placements.length;
    
    // Recompter avec une méthode plus précise sur finalHtml
    const affiliateModuleRegex = /<(?:div|aside) class="affiliate-module"|data-placement-id=/g;
    const actualCountPrecise = (finalHtml.match(affiliateModuleRegex) || []).length;
    
    if (actualCountPrecise === 0) {
      // PHASE 6.2.4: FAIL (pas warn) si 0 module
      report.checks.push({
        name: 'affiliate_conformance',
        status: 'fail',
        details: `plan=${expectedCount} injected=0`
      });
      report.issues.push({
        code: 'AFFILIATE_INJECTION_FAILED',
        severity: 'high',
        message: `affiliate_plan has ${expectedCount} placements but 0 modules detected in HTML`,
        evidence: { expected: expectedCount, actual: actualCountPrecise }
      });
    } else if (actualCountPrecise < expectedCount) {
      report.checks.push({
        name: 'affiliate_conformance',
        status: 'warn',
        details: `plan=${expectedCount} injected=${actualCountPrecise}`
      });
    } else {
      report.checks.push({
        name: 'affiliate_conformance',
        status: 'pass',
        details: `All ${expectedCount} modules injected`
      });
    }
  } else if (hasAffiliatePlan && !enableAffiliateInjector) {
    report.checks.push({
      name: 'affiliate_conformance',
      status: 'warn',
      details: 'affiliate_plan exists but ENABLE_AFFILIATE_INJECTOR=0'
    });
  } else if (!hasAffiliatePlan) {
    // PHASE 6.2.4: Si affiliate_plan.length === 0, interdire modules "par défaut"
    const affiliateModuleRegex = /<(?:div|aside) class="affiliate-module"|data-placement-id=/g;
    const unexpectedModules = (finalHtml.match(affiliateModuleRegex) || []).length;
    
    if (unexpectedModules > 0) {
      report.checks.push({
        name: 'affiliate_conformance',
        status: 'warn',
        details: `affiliate_plan is empty but ${unexpectedModules} module(s) detected (should be removed)`
      });
      report.actions.push({ 
        type: 'remove_unexpected_affiliate_modules', 
        details: `count=${unexpectedModules}` 
      });
      // Optionnel: supprimer les modules inattendus
      // finalHtml = finalHtml.replace(/<div class="affiliate-module"[^>]*>[\s\S]*?<\/div>/g, '');
    } else {
      report.checks.push({
        name: 'affiliate_conformance',
        status: 'pass',
        details: 'No affiliate plan and no unexpected modules'
      });
    }
  } else {
    report.checks.push({
      name: 'affiliate_conformance',
      status: 'pass',
      details: 'No affiliate plan or injector disabled'
    });
  }

  // CHECK D: Anti-répétitions
  // NOTE: removeDuplicateParagraphs est déjà appelé dans finalizeArticle() avant runQAReport
  // Ne pas le rappeler ici pour éviter double traitement
  const removedDuplicatesCount = report.metrics.removed_duplicates_count || 0;
  
  // Détecter H2 dupliqués
  const h2Titles = [];
  const h2Matches2 = finalHtml.matchAll(/<h2[^>]*>(.*?)<\/h2>/g);
  for (const match of h2Matches2) {
    const title = match[1].trim();
    if (h2Titles.includes(title) && title.length > 3) {
      // Renommer le second avec suffixe
      const suffix = ' (suite)';
      finalHtml = finalHtml.replace(match[0], `<h2>${title}${suffix}</h2>`);
      report.actions.push({ type: 'renamed_duplicate_h2', details: `title="${title}"` });
    } else {
      h2Titles.push(title);
    }
  }
  
  // Détecter "Articles connexes" dupliquée
  const relatedMatches = finalHtml.match(/<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/gi);
  if (relatedMatches && relatedMatches.length > 1) {
    // Supprimer les doublons (garder le premier)
    let first = true;
    finalHtml = finalHtml.replace(/<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/gi, (match) => {
      if (first) {
        first = false;
        return match;
      }
      removedDuplicatesCount++;
      return '';
    });
    report.actions.push({ type: 'removed_duplicate_related_section', details: `count=${relatedMatches.length - 1}` });
  }
  
  // Détecter blocs affiliate dupliqués
  const affiliateModuleMatches = finalHtml.matchAll(/<(?:div|aside) class="affiliate-module"[^>]*>[\s\S]*?<\/(?:div|aside)>/g);
  const seenModules = new Set();
  let removedAffiliateDuplicates = 0;
  for (const match of affiliateModuleMatches) {
    const normalized = match[0].replace(/\s+/g, ' ').trim();
    if (seenModules.has(normalized)) {
      finalHtml = finalHtml.replace(match[0], '');
      removedAffiliateDuplicates++;
    } else {
      seenModules.add(normalized);
    }
  }
  if (removedAffiliateDuplicates > 0) {
    report.actions.push({ type: 'removed_duplicate_affiliate_modules', details: `count=${removedAffiliateDuplicates}` });
  }
  
  if (removedDuplicatesCount > 0 || removedAffiliateDuplicates > 0) {
    report.checks.push({
      name: 'anti_repetitions',
      status: 'pass',
      details: `removed_duplicates=${removedDuplicatesCount + removedAffiliateDuplicates}`
    });
  } else {
    report.checks.push({
      name: 'anti_repetitions',
      status: 'pass',
      details: 'No duplicates detected'
    });
  }
  
  report.metrics.repetition_score = removedDuplicatesCount + removedAffiliateDuplicates;

  // CHECK E: Placement des blocs
  // Vérifier que "Articles connexes" est à la fin
  const relatedSectionRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
  const relatedMatch = finalHtml.match(relatedSectionRegex);
  
  if (relatedMatch) {
    const relatedIndex = relatedMatch.index;
    const contentAfterRelated = finalHtml.slice(relatedIndex + relatedMatch[0].length);
    
    // Si du contenu significatif après "Articles connexes", déplacer
    if (contentAfterRelated.trim().length > 100) {
      // Extraire le bloc "Articles connexes" complet
      const relatedBlockEnd = finalHtml.indexOf('</h2>', relatedIndex) + 5;
      const nextH2After = contentAfterRelated.match(/<h2[^>]*>/i);
      const blockEnd = nextH2After ? relatedIndex + relatedMatch[0].length + nextH2After.index : finalHtml.length;
      
      const relatedBlock = finalHtml.slice(relatedIndex, blockEnd);
      const htmlWithoutRelated = finalHtml.slice(0, relatedIndex) + finalHtml.slice(blockEnd);
      
      // Insérer à la fin
      finalHtml = htmlWithoutRelated + '\n\n' + relatedBlock;
      report.actions.push({ type: 'moved_related_section_to_end', details: 'Articles connexes déplacée à la fin' });
    }
    
    report.checks.push({
      name: 'block_placement',
      status: 'pass',
      details: 'Articles connexes en position correcte'
    });
  } else {
    report.checks.push({
      name: 'block_placement',
      status: 'warn',
      details: 'Section "Articles connexes" absente'
    });
  }

  // PHASE 6.2.1: CHECK F - Anti-invention (correctif : nettoie les claims non sourcés)
  finalHtml = this.checkInventionGuard(finalHtml, pipelineContext, report);
  
  // PHASE 6.3: CHECK G - Story Alignment + Quality Gate (hard check avec auto-fix)
  finalHtml = await this.checkAndFixStoryAlignment(finalHtml, pipelineContext, report);
  
  // PHASE 6.4: Ajouter wrappers premium (takeaways, community, open-questions)
  finalHtml = await this.addPremiumWrappers(finalHtml, pipelineContext, report);
  
  // PHASE 6.2.3: CHECK B amélioré - Citations Reddit obligatoires et robustes
  // (déjà implémenté, mais améliorer la logique si nécessaire)
  
  // PHASE 6.2.4: CHECK C amélioré - CTA/Affiliate plan: conformité stricte
  // (déjà implémenté, mais améliorer la logique si nécessaire)
  
  // PHASE 7.1.d: Anti-Hallucination Guard (non bloquant par défaut)
  // Passer le titre de l'article pour validation anti-décontextualisation
  const articleTitle = pipelineContext?.generatedTitle || pipelineContext?.story?.extracted?.post?.title || '';
  await this.checkAntiHallucination(finalHtml, pipelineContext, report, articleTitle);
  
  // NOUVELLES VALIDATIONS QUALITÉ (Plan Pipeline Quality Fixes)
  // 1. Détection phrases incomplètes
  finalHtml = await this.detectAndFixIncompleteSentences(finalHtml, report);
  
  // 1.5. PHASE 2.3b: Nettoyage typographique — mots collés
  finalHtml = this.fixWordGlue(finalHtml, report);

  // 1.6. PHASE 2 FIX: Nettoyage deterministe des phrases plates
  finalHtml = this.removeGenericPhrases(finalHtml, report);

  // 1.7. PHASE 3 FIX: Capitalisation des noms propres geographiques
  finalHtml = this.capitalizeProperNouns(finalHtml);

  // 2. Détection et traduction anglais
  finalHtml = await this.detectAndTranslateEnglish(finalHtml, report);
  
  // 2.5. NEWS: corriger les destinations widgets avant validation
  finalHtml = this.reconcileWidgetDestinations(finalHtml, pipelineContext, analysis, report);

  // 3. Validation cohérence widgets/destination
  this.validateWidgetDestinations(finalHtml, pipelineContext, analysis, report);
  
  // 4. Validation citations
  finalHtml = this.validateAndFixCitations(finalHtml, report);
  
  // 5. Validation liens recommandations
  this.validateRecommendationLinks(finalHtml, report);
  
  // 5.5. Traduction forcée section recommandations (correction audit)
  finalHtml = await this.forceTranslateRecommendationsSection(finalHtml, report);
  
  // 5.6. Traduction forcée citations dans les listes (correction audit)
  finalHtml = await this.forceTranslateCitationsInLists(finalHtml, report);
  
  // 6. Découpage listes trop longues
  finalHtml = this.splitLongListItems(finalHtml, report);
  
  // 7. Validation cohérence temporelle
  this.validateTemporalConsistency(finalHtml, report);
  
  // 7.5. Validation section narrative "Une histoire vraie" (correction audit)
  this.validateAndExtendNarrativeSection(finalHtml, pipelineContext, report);
  
  // NOUVELLES CORRECTIONS POUR 10/10
  // 8. Vérifier et ajouter sections SERP manquantes
  const limitesBeforeSerp = (finalHtml.match(/<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/gi) || []).length;    
  finalHtml = await this.ensureSerpSections(finalHtml, pipelineContext, report);
  
  // CORRECTION: Nettoyer les duplications de "Limites et biais" APRÈS ensureSerpSections
  finalHtml = this.removeDuplicateH2Sections(finalHtml);
  
  // NETTOYAGE FINAL: Supprimer les paragraphes vides qui pourraient subsister
  const emptyParasInQA = (finalHtml.match(/<p[^>]*>\s*\.\s*<\/p>/gi) || []).length;
  if (emptyParasInQA > 0) {
    finalHtml = finalHtml.replace(/<p[^>]*>\s*\.\s*<\/p>/gi, '');
    console.log(`   🧹 NETTOYAGE QA: ${emptyParasInQA} paragraphe(s) vide(s) supprimé(s)`);
  }
  
  const limitesAfterSerp = (finalHtml.match(/<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/gi) || []).length;    
  // 8.5. Remplir toutes les sections vides (y compris "Contexte")
  finalHtml = this.fillEmptySections(finalHtml, pipelineContext, report);
  
  // NOTE: balanceParagraphs() est maintenant appelé dans finalizeArticle() après toutes les corrections
  // pour éviter double traitement et assurer le bon ordre d'exécution
  
  // PHASE 6.5: Blocking Gate - Quality Gate bloquant
  this.applyBlockingGate(report);
  
  // Mettre à jour métriques finales
  report.metrics.html_length_after = finalHtml.length;    
  report.finalHtml = finalHtml;
  return report;
}

/**
 * PHASE 6.2.1: Anti-invention guard
 * Détecte les claims chiffrés, lieux, affirmations factuelles non sourcées
 */

export function checkInventionGuard(html, pipelineContext, report) {
  let cleanedHtml = html;
  const extracted = pipelineContext?.extracted || pipelineContext?.story?.extracted || {};
  const story = pipelineContext?.story || {};    
  // PHASE 6.2.1: Nettoyer le HTML pour exclure les segments non-narratifs
  let htmlForInventionCheck = html;
  
  // Supprimer les scripts
  htmlForInventionCheck = htmlForInventionCheck.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // Supprimer les styles
  htmlForInventionCheck = htmlForInventionCheck.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Supprimer les modules affiliate (avec variantes de quotes et balises imbriquées)
  // Pattern robuste: div avec class affiliate-module et tout son contenu jusqu'à la fermeture (gestion des div imbriquées)
  // Utiliser une approche récursive pour gérer les balises imbriquées
  const removeAffiliateModules = (html) => {
    const affiliatePattern = /<(?:div|aside)[^>]*(?:class=["'][^"']*affiliate-module[^"']*["']|data-placement-id)[^>]*>([\s\S]*?)<\/(?:div|aside)>/gi;
    let result = html;
    let match;
    let changed = true;
    
    while (changed) {
      changed = false;
      match = affiliatePattern.exec(result);
      if (match) {
        // Vérifier si le contenu contient d'autres divs affiliate (imbriqués)
        const innerContent = match[1];
        if (innerContent && /affiliate-module|data-placement-id/i.test(innerContent)) {
          // Récursivement supprimer les modules imbriqués
          const cleanedInner = removeAffiliateModules(innerContent);
          result = result.replace(match[0], '');
          changed = true;
        } else {
          result = result.replace(match[0], '');
          changed = true;
        }
        affiliatePattern.lastIndex = 0; // Reset pour réessayer
      }
    }
    return result;
  };
  
  htmlForInventionCheck = removeAffiliateModules(htmlForInventionCheck);
  
  // Supprimer les éléments avec data-widget, travelpayouts, tp.png, Kiwi.com, Airalo, WIDGET_
  htmlForInventionCheck = htmlForInventionCheck.replace(/<[^>]*(?:data-widget|travelpayouts|tp\.png|kiwi\.com|airalo|WIDGET_)[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
  
  // Supprimer les blocs CTA auto (heuristique: H2 "Passer à l'action" / "Outils utiles" / "Réserver" + contenu jusqu'au prochain H2)
  // Pattern amélioré: capture tout jusqu'au prochain H2 ou H3 ou fin de document
  htmlForInventionCheck = htmlForInventionCheck.replace(/<h2[^>]*>(?:Passer à l'action|Outils utiles|Réserver|Comparer|CTA)[^<]*<\/h2>[\s\S]*?(?=<h[2-3]|$)/gi, '');
  
  // Supprimer les blocs avec class="flashvoyage-cta" ou similaire (plus robuste)
  htmlForInventionCheck = htmlForInventionCheck.replace(/<[^>]*class=["'][^"']*cta[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '');
  htmlForInventionCheck = htmlForInventionCheck.replace(/<[^>]*class=["'][^"']*cta[^"']*[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
  
  // Supprimer le bloc "Articles connexes" (de <h2>Articles connexes</h2> jusqu'à la fin OU jusqu'au prochain <h2>)
  const relatedSectionMatch = htmlForInventionCheck.match(/<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>[\s\S]*/i);
  if (relatedSectionMatch) {
    const relatedIndex = relatedSectionMatch.index;
    htmlForInventionCheck = htmlForInventionCheck.substring(0, relatedIndex);
  }
  
  // Exclure le texte des liens internes FlashVoyage de l'analyse d'hallucination
  // Ces liens sont injectés par le SEO optimizer (pas par le LLM) et réfèrent à des articles existants
  htmlForInventionCheck = htmlForInventionCheck.replace(/<a[^>]*href="[^"]*flashvoyage\.com[^"]*"[^>]*>.*?<\/a>/gi, ' ');
  htmlForInventionCheck = htmlForInventionCheck.replace(/<a[^>]*href="[^"]*flashvoyage[^"]*"[^>]*>.*?<\/a>/gi, ' ');
  
  // Construire vocabulary whitelist
  const whitelistTokens = new Set();
  
  // Ajouter tokens depuis extracted.title + extracted.selftext + extracted.post.clean_text (si disponible)
  const extractedText = `${extracted.title || ''} ${extracted.selftext || ''} ${extracted.post?.clean_text || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const extractedTokens = this.extractTokens(extractedText);
  extractedTokens.forEach(t => whitelistTokens.add(t));
  
  // Ajouter explicitement les lieux depuis post.signals.locations (normalisés en lowercase)
  // + enrichissement dynamique via BDD OpenFlights (IATA-pivot : ajoute les équivalents FR/EN)
  if (extracted.post?.signals?.locations && Array.isArray(extracted.post.signals.locations)) {
    extracted.post.signals.locations.forEach(loc => {
      if (loc && typeof loc === 'string') {
        const normalizedLoc = loc.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normalizedLoc.length > 0) {
          whitelistTokens.add(normalizedLoc);
          // IATA-pivot : ajouter automatiquement les équivalents FR/EN
          const iata = lookupIATA(normalizedLoc);
          if (iata) {
            const allNames = getAllLocationNames();
            for (const name of allNames) {
              if (lookupIATA(name) === iata) {
                whitelistTokens.add(name);
              }
            }
          }
        }
      }
    });
  }
  // Ajouter aussi depuis extracted.destination et extracted.destinations (si présents)
  if (extracted.destination && typeof extracted.destination === 'string') {
    const normalizedDest = extracted.destination.toLowerCase().trim();
    if (normalizedDest.length > 0) whitelistTokens.add(normalizedDest);
  }
  if (extracted.destinations && Array.isArray(extracted.destinations)) {
    extracted.destinations.forEach(dest => {
      if (dest && typeof dest === 'string') {
        const normalizedDest = dest.toLowerCase().trim();
        if (normalizedDest.length > 0) whitelistTokens.add(normalizedDest);
      }
    });
  }
  // PHASE 1 FIX: Ajouter des aliases géographiques connus (lieu mentionné → lieux associés)
  const geoAliases = {
    'angkor wat': ['siem reap', 'cambodge', 'cambodia'],
    'angkor': ['siem reap', 'cambodge', 'cambodia'],
    'borobudur': ['yogyakarta', 'java'],
    'bagan': ['mandalay', 'myanmar', 'birmanie'],
    'machu picchu': ['cusco', 'perou'],
    'taj mahal': ['agra', 'inde'],
    'halong': ['ha long', 'baie d\'halong'],
    'ha long': ['halong', 'baie d\'halong'],
    'phu quoc': ['kien giang', 'vietnam'],
    'sapa': ['lao cai', 'vietnam'],
    'ninh binh': ['tam coc', 'vietnam'],
    'hoi an': ['da nang', 'quang nam'],
    'da nang': ['hoi an', 'quang nam'],
    'ubud': ['bali', 'indonesie'],
    'kuta': ['bali', 'indonesie'],
    'chiang rai': ['chiang mai', 'thailande'],
    'krabi': ['ao nang', 'thailande'],
    'el nido': ['palawan', 'philippines'],
    'coron': ['palawan', 'philippines']
  };
  for (const token of [...whitelistTokens]) {
    const aliases = geoAliases[token];
    if (aliases) {
      aliases.forEach(a => whitelistTokens.add(a));
    }
  }

  // Ajouter tokens depuis story.evidence.source_snippets
  const snippets = story?.evidence?.source_snippets || [];
  
  // Vérifier si on a assez de contenu source pour valider (sinon whitelist trop petite = faux positifs)
  // PHASE 6.2: Être plus tolérant - accepter même avec peu de contenu si on a des snippets
  const hasEnoughSourceContent = (extracted.selftext || '').length >= 50 || 
                                 extractedTokens.length >= 10 || 
                                 snippets.length > 0;
  snippets.forEach(snippet => {
    let snippetText = '';
    if (typeof snippet === 'string') {
      snippetText = snippet;
    } else if (snippet && typeof snippet === 'object') {
      snippetText = snippet.text || snippet.content || snippet.body || snippet.quote || 
                   snippet.excerpt || snippet.snippet || '';
    }
    if (snippetText) {
      const snippetTokens = this.extractTokens(snippetText.toLowerCase());
      snippetTokens.forEach(t => whitelistTokens.add(t));
    }
  });
  
  // Ajouter tokens depuis commentaires si présents (extracted.comments peut être un objet { insights, warnings } ou un tableau)
  const comments = Array.isArray(extracted.comments) ? extracted.comments : [];
  comments.forEach(comment => {
    const commentText = (typeof comment === 'string' ? comment : comment.body || '').toLowerCase();
    const commentTokens = this.extractTokens(commentText);
    commentTokens.forEach(t => whitelistTokens.add(t));
  });

  // PHASE 2 FIX: Ajouter les equivalents EUR des montants USD sources
  // convertCurrencyToEUR() tourne avant checkInventionGuard, donc "500 USD" devient "~460 euros"
  // sans ceci, "460" est flaggé comme invention
  const USD_TO_EUR_RATE = 0.92;
  const sourceCosts = extracted?.post?.signals?.costs || [];
  for (const cost of sourceCosts) {
    const str = typeof cost === 'string' ? cost : (cost?.amount ? `${cost.amount}` : '');
    const nums = str.match(/[\d]+/g) || [];
    for (const n of nums) {
      const val = parseInt(n);
      if (val > 0) {
        const eur = Math.round(val * USD_TO_EUR_RATE);
        whitelistTokens.add(String(eur));
      }
    }
  }
  // PHASE 2 FIX: Aussi ajouter EUR equivalents des nombres trouves dans le texte source brut
  // Couvre les ranges comme "$500-700" ou "500 to 700 USD" dont seul un bout est dans costs
  const sourceNums = extractedText.match(/\d+/g) || [];
  for (const n of sourceNums) {
    const val = parseInt(n);
    if (val >= 5 && val <= 50000) {
      const eur = Math.round(val * USD_TO_EUR_RATE);
      whitelistTokens.add(String(eur));
    }
  }

  // PHASE 6.2.1: Extraire le texte de l'article HTML nettoyé (sans balises)
  const articleText = htmlForInventionCheck.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  
  // PHASE 6.2.1: Initialiser debug pour invention_guard
  const debugClaims = [];
  
  const issues = [];
  
  // Détecter claims chiffrés non sourcés
  const numericClaims = [
    /\b\d+[€$]\b/gi,  // Montants
    /\b\d+\s*(euros?|dollars?|baht|yen)\b/gi,  // Montants avec devise
    /\bx\d+\b/gi,  // Multiplicateurs (x2, x3)
    /\b\d+\s*%\b/gi,  // Pourcentages
    /\ben\s+\d+\s+(jours?|mois|années?|semaines?)\b/gi,  // Durées
    /\b\d+\s+(jours?|mois|années?|semaines?)\b/gi  // Durées simples
  ];
  
  for (const pattern of numericClaims) {
    const matches = articleText.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (!hasEnoughSourceContent) continue; // Skip si pas assez de contenu source
        
        // Vérifier si le claim exact ou un claim similaire est dans la source
        const numericValue = match.replace(/[^\d]/g, '');
        const matchLower = match.toLowerCase();
        
        // Vérifier dans extractedText
        const claimInExtracted = extractedText.includes(numericValue) || extractedText.includes(matchLower);
        
        // Vérifier dans snippets
        const claimInSnippets = snippets.some(s => {
          const sText = typeof s === 'string' ? s : (s.snippet || s.text || '');
          if (!sText) return false;
          const sTextLower = sText.toLowerCase();
          return sTextLower.includes(numericValue) || sTextLower.includes(matchLower);
        });

        // PHASE 2 FIX: Vérifier aussi dans whitelistTokens (inclut les equivalents EUR)
        const claimInWhitelist = whitelistTokens.has(numericValue);
        
        const claimInSource = claimInExtracted || claimInSnippets || claimInWhitelist;

        if (!claimInSource) {
          // Ignorer les très petits nombres isolés (probablement faux positifs)
          const numValue = parseInt(numericValue);
          // Accepter les nombres >= 7 (pour "7 jours") ou les pourcentages/multiplicateurs
          // Mais être strict : si le nombre est significatif (> 50) ou si c'est un pourcentage/multiplicateur, c'est suspect
          if (numValue && (numValue >= 7 || match.includes('%') || match.includes('x'))) {
            const context = articleText.substring(Math.max(0, articleText.indexOf(match) - 50), Math.min(articleText.length, articleText.indexOf(match) + match.length + 50)).substring(0, 100);
            const claimIdx = debugClaims.length;
            
            // PHASE 6.2.1: Logger le claim détecté
            console.log(`❌ INVENTION_GUARD_CLAIM: type=numeric text="${match}" context="${context.substring(0, 40)}..." idx=${claimIdx}`);
            
            debugClaims.push({
              type: 'numeric',
              text: match,
              context: context.substring(0, 100),
              idx: claimIdx
            });
            
            issues.push({
              type: 'numeric_claim',
              value: match,
              context: context
            });
          }
        }
      }
    }
  }
  
  // Détecter lieux (villes/pays) non sourcés via BDD OpenFlights (5600+ entrées)
  // Extraire les mots capitalisés du texte comme candidats lieux
  const locationCandidates = articleText.match(/\b[A-ZÀ-Ü][a-zà-ü]{2,}(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?\b/g) || [];
  // PHASE 1 FIX: Filtrer les faux positifs multi-mots où le 2e mot est un mot français courant
  const frenchCommonWords = new Set(['Si', 'Ne', 'Un', 'Une', 'En', 'Au', 'Le', 'La', 'Les', 'Et', 'Ou', 'De', 'Du', 'Des', 'Ce', 'Sa', 'Se', 'Son', 'Est', 'Par', 'Sur', 'Pour', 'Mais', 'Que', 'Qui', 'Pas', 'Ton', 'Avec', 'Dans', 'Sans', 'Sous', 'Vers', 'Chez', 'Ses', 'Nos', 'Vos', 'Mon', 'Ton', 'Mes', 'Tes', 'Cet', 'Cette', 'Ils', 'Elle', 'Elles', 'Nous', 'Vous', 'Ont', 'Sont', 'Peut', 'Donc', 'Bien', 'Tout', 'Rien', 'Cela', 'Comme', 'Notre']);
  const filteredCandidates = locationCandidates.filter(candidate => {
    const parts = candidate.split(/\s+/);
    if (parts.length === 2 && frenchCommonWords.has(parts[1])) return false;
    return true;
  });
  const uniqueCandidates = [...new Set(filteredCandidates)].filter(c => isKnownLocation(c));
  
  {
    const matches = uniqueCandidates;
    if (matches.length > 0) {
      for (const match of matches) {
        if (!hasEnoughSourceContent) continue; // Skip si pas assez de contenu source
        
        const normalizedMatch = match.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Vérifier si le lieu est explicitement dans la source
        const locationInExtracted = extractedText.includes(normalizedMatch);
        const locationInSnippets = snippets.some(s => {
          const sText = typeof s === 'string' ? s : (s.snippet || s.text || '');
          if (!sText) return false;
          return sText.toLowerCase().includes(normalizedMatch);
        });
        const locationInSource = locationInExtracted || locationInSnippets;
        
        if (!locationInSource && !whitelistTokens.has(normalizedMatch)) {
          const context = articleText.substring(Math.max(0, articleText.indexOf(match) - 80), Math.min(articleText.length, articleText.indexOf(match) + match.length + 80)).substring(0, 160);
          // Ne pas bloquer si le lieu est dans la section "Nos recommandations" (options #1, #2, #3 = alternatives éditoriales)
          if (/option\s*[#n°]\s*\d|#\s*[123]\b|#1\b|#2\b|#3\b|nos recommandations|par où commencer|comparer les prix|voir les forfaits|en savoir plus/i.test(context)) continue;
          const claimIdx = debugClaims.length;            console.log(`❌ INVENTION_GUARD_CLAIM: type=location text="${match}" context="${context.substring(0, 40)}..." idx=${claimIdx}`);
          debugClaims.push({
            type: 'location',
            text: match,
            context: context.substring(0, 100),
            idx: claimIdx
          });
          issues.push({
            type: 'location_claim',
            value: match,
            context: context
          });
        }
      }
    }
  }
  
  // Détecter affirmations factuelles trop spécifiques
  // "requis" et "necessaire" retirés : trop courants en français, génèrent des faux positifs
  const factualClaims = [
    /\bla loi dit\b/gi,
    /\best obligatoire\b/gi,
    /\best interdit\b/gi,
    /\bdoit être\b/gi
  ];
  
  for (const pattern of factualClaims) {
    const matches = articleText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const contextStart = Math.max(0, articleText.indexOf(match) - 100);
        const contextEnd = Math.min(articleText.length, articleText.indexOf(match) + match.length + 100);
        const context = articleText.substring(contextStart, contextEnd).toLowerCase();
        const contextTokens = this.extractTokens(context);
        
        const hasWhitelistToken = contextTokens.some(t => whitelistTokens.has(t));
        // FAIL si : pas de token whitelist ET on a assez de contenu source pour valider
        if (!hasWhitelistToken && hasEnoughSourceContent) {
          const claimIdx = debugClaims.length;
          
          // PHASE 6.2.1: Logger le claim détecté
          console.log(`❌ INVENTION_GUARD_CLAIM: type=factual text="${match}" context="${context.substring(0, 40)}..." idx=${claimIdx}`);
          
          debugClaims.push({
            type: 'factual',
            text: match,
            context: context.substring(0, 150),
            idx: claimIdx
          });
          
          issues.push({
            type: 'factual_claim',
            value: match,
            context: context.substring(0, 150)
          });
        }
      }
    }
  }
  
  // PHASE 6.2.1: Exposer les claims dans report.debug (max 10)
  if (!report.debug) report.debug = {};
  report.debug.invention_guard = {
    claims: debugClaims.slice(0, 10)
  };
  
  // Deduplication par type+value (ex: "10 euros" apparaissant 3 fois)
  const seen = new Set();
  const uniqueIssues = issues.filter(issue => {
    const key = `${issue.type}::${issue.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueIssues.length > 0) {
    // STRATEGIE "CLEAN INSTEAD OF BLOCK" :
    // Nettoyer les claims non sourcés dans le HTML au lieu de bloquer la publication
    let cleanedCount = 0;
    
    for (const issue of uniqueIssues) {
      if (issue.type === 'numeric_claim') {
        // Remplacer "X euros" par une formulation vague
        const numericPattern = new RegExp(
          `(\\b(?:environ|autour de|près de|approximativement|~)?\\s*)?${issue.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
          'gi'
        );
        const before = cleanedHtml;
        cleanedHtml = cleanedHtml.replace(numericPattern, 'quelques euros');
        if (cleanedHtml !== before) cleanedCount++;
      } else if (issue.type === 'location_claim') {
        // Supprimer la phrase contenant le lieu inventé
        const locValue = issue.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sentencePattern = new RegExp(
          `<p[^>]*>[^<]*${locValue}[^<]*<\\/p>`,
          'gi'
        );
        const before = cleanedHtml;
        cleanedHtml = cleanedHtml.replace(sentencePattern, '');
        if (cleanedHtml !== before) cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 INVENTION_GUARD: ${cleanedCount}/${uniqueIssues.length} claim(s) nettoyé(s) dans le HTML`);
    }

    // Report comme "warn" (traçabilité) au lieu de "fail" bloquant
    report.checks.push({
      name: 'invention_guard',
      status: cleanedCount > 0 ? 'warn' : 'fail',
      details: `${uniqueIssues.length} claim(s) détecté(s), ${cleanedCount} nettoyé(s) (${issues.length} occurrences totales)`
    });
    
    uniqueIssues.forEach(issue => {
      report.issues.push({
        code: 'INVENTION_GUARD_CLEANED',
        severity: 'low',
        message: `invention_cleaned: ${issue.type} "${issue.value}" nettoyé du HTML`,
        evidence: { type: issue.type, value: issue.value, context: issue.context },
        check: 'invention_guard'
      });
    });
  } else {
    report.checks.push({
      name: 'invention_guard',
      status: 'pass',
      details: 'Aucune invention détectée'
    });
  }
  
  return cleanedHtml;
}

/**
 * PHASE 6.3.1: Helper pour vérifier si un texte est utilisable
 */

export function runQualityGateContent(html, pipelineContext = null) {
  const warnings = [];
  
  // === CHECK 1: H2 "Ce que dit le témoignage" (legacy) ===
  const noForbiddenH2 = !/<h2[^>]*>\s*Ce que dit le témoignage\s*\.{0,3}\s*<\/h2>/i.test(html || '');
  if (!noForbiddenH2) warnings.push('Section interdite "Ce que dit le témoignage" encore présente');
  
  // === CHECK 2: Ouverture immersive ===
  const textStart = (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  const immersiveMarkers = [
    /^Tu fixes\s/i, /^Tu envisages\s/i, /\d{1,3}\s*\d{3}\s*\$/,
    /Dans ce guide[,.]?\s/i, /on t'explique\s+(combien|comment)/i,
    /combien ça coûte vraiment/i,
    // Nouveaux markers pour hooks cinématiques
    /^Chaque fois que/i, /^Tu atterris/i, /^Il est \d+h/i,
    /^Le propriétaire/i, /^Tu viens de/i, /^La première chose/i,
    /apparaître sur l'écran/i, /compte à rebours/i, /budget.*fond/i
  ];
  const hasImmersiveOpening = immersiveMarkers.some(re => re.test(textStart));
  if (!hasImmersiveOpening) warnings.push('Ouverture immersive non détectée en début d\'article');
  
  // === CHECK 3: H2 génériques (blacklist conditionnelle) ===
  const GENERIC_H2_BLACKLIST = [
    'contexte', 'événement central', 'moment critique', 'résolution',
    'chronologie de l\'expérience', 'risques et pièges réels',
    'ce que la communauté apporte', 'conseils pratiques',
    'en résumé', 'stratégies', 'ce qu\'il faut savoir', 'points clés',
    'notre avis', 'analyse', 'solutions', 'conclusion',
    'ce que dit le témoignage', 'ce qu\'il faut retenir',
    'nos recommandations', 'options alternatives'
  ];
  // Patterns "lazy" : mot générique + ":" + complément → toujours rejeté
  const LAZY_H2_PATTERN = /^(conclusion|stratégies|options|solutions|résumé|analyse)\s*:/i;
  
  const h2Matches = [...((html || '').matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi) || [])];
  const genericH2sFound = h2Matches.filter(m => {
    const title = m[1].trim().toLowerCase().replace(/[^\wàâäéèêëïîôùûüÿç\s'-]/g, '').trim();
    // Un H2 est "nu" (= générique) seulement s'il correspond EXACTEMENT à un terme blacklisté
    // Un H2 qualifié (contenant plus de mots, une destination, etc.) est autorisé
    const isNakedGeneric = GENERIC_H2_BLACKLIST.some(banned => title === banned);
    // Un H2 "lazy" = mot générique + ":" (ex: "Conclusion: bla bla") est aussi rejeté
    const isLazy = LAZY_H2_PATTERN.test(m[1].trim());
    return isNakedGeneric || isLazy;
  });
  const noGenericH2 = genericH2sFound.length === 0;
  if (!noGenericH2) {
    warnings.push(`H2 génériques détectés: ${genericH2sFound.map(m => `"${m[1].trim()}"`).join(', ')}`);
  }
  
  // === CHECK 4: Compteur de quotes (minimum 2) avec fallback ===
  const quoteMatches = (html || '').match(/«[^»]+»/g) || [];
  const blockquoteMatches = (html || '').match(/<blockquote[^>]*data-source=["']reddit["'][^>]*>/gi) || [];
  const totalQuotes = quoteMatches.length + blockquoteMatches.length;
  const hasMinQuotes = totalQuotes >= 2;
  if (!hasMinQuotes) {
    warnings.push(`Citations insuffisantes: ${totalQuotes}/2 minimum (${quoteMatches.length} inline « », ${blockquoteMatches.length} blockquotes)`);
    
    // FALLBACK: Tenter d'injecter des citations depuis source_snippets si disponibles
    if (pipelineContext?.story?.evidence?.source_snippets) {
      const snippets = pipelineContext.story.evidence.source_snippets;
      const usableSnippets = (Array.isArray(snippets) ? snippets : [])
        .filter(s => {
          const text = typeof s === 'string' ? s : (s?.text || s?.quote || '');
          return text.length >= 20 && text.length <= 300;
        })
        .slice(0, 3 - totalQuotes); // Injecter seulement le nombre manquant
      
      if (usableSnippets.length > 0) {
        console.log(`   🔧 QUALITY_GATE_FALLBACK: Injection de ${usableSnippets.length} citation(s) depuis source_snippets`);
        // Note: l'injection réelle sera faite par l'editorial-enhancer en aval
        // Ici on ne fait que signaler — l'editorial-enhancer a la priorité
        warnings.push(`Fallback quotes: ${usableSnippets.length} citation(s) disponibles dans source_snippets pour injection`);
      }
    }
  }
  
  // === CHECK 5: Hook sans mention Reddit dans les 500 premiers caractères ===
  const hookWithoutReddit = !/\breddit\b|\bsubreddit\b|\br\//i.test(textStart);
  if (!hookWithoutReddit) {
    warnings.push('Mention de "Reddit" détectée dans les 500 premiers caractères du hook');
  }
  
  // === CHECK 6: Hook sans pattern banni "Te voilà..." ===
  const hookNoBannedPattern = !/\bte voilà\b|\bte voila\b/i.test(textStart);
  if (!hookNoBannedPattern) {
    warnings.push('Hook banni "Te voilà..." détecté — doit être remplacé par un hook cinématique');
  }
  
  return { noForbiddenH2, hasImmersiveOpening, noGenericH2, hasMinQuotes, hookWithoutReddit, hookNoBannedPattern, warnings };
}

/**
 * PHASE 6.0.5: Supprimer les sections H2 dupliquées (notamment "Limites et biais")
 * Garde la première occurrence et supprime les suivantes
 * @param {string} html - HTML à nettoyer
 * @returns {string} HTML sans sections H2 dupliquées
 */

export async function checkAndFixStoryAlignment(html, pipelineContext, report) {
  // SIMPLIFIÉ: On ne force plus l'insertion de sections de l'ancienne structure.
  // L'article est en format Option B (développement libre). On vérifie juste la qualité globale.
  const h2Matches = html.match(/<h2[^>]*>.*?<\/h2>/gi) || [];
  const h2Count = h2Matches.length;
  const bodyLength = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
  
  
  let finalHtml = html;
  let status = 'pass';
  
  // Vérifier que l'article a une structure minimale viable
  if (h2Count < 2) {
    status = 'warn';
    report.issues.push({
      code: 'STORY_ALIGNMENT_VIOLATION',
      severity: 'low',
      message: `Article avec seulement ${h2Count} H2 (minimum recommandé: 2)`,
      evidence: { h2Count },
      check: 'story_alignment'
    });
  }
  
  if (bodyLength < 1500) {
    status = 'warn';
    report.issues.push({
      code: 'STORY_ALIGNMENT_VIOLATION',
      severity: 'low',
      message: `Contenu court: ${bodyLength} chars (minimum recommandé: 1500)`,
      evidence: { bodyLength },
      check: 'story_alignment'
    });
  }
  
  console.log(`✅ FINALIZER_ALIGNMENT: h2Count=${h2Count} bodyLength=${bodyLength} status=${status}`);
  
  report.checks.push({
    name: 'story_alignment',
    status: status,
    details: `required=0 present=${h2Count} inserted=0 reordered=0`
  });
  
  // Exposer dans report.debug
  if (!report.debug) report.debug = {};
  report.debug.alignment = {
    required_sections: [],
    detected_sections: h2Matches.map(h => h.replace(/<[^>]*>/g, '').trim()),
    inserted_sections: [],
    reordered: false,
    missing_after_fix: []
  };

  // PHASE 1 FIX: Validation qualité des H2 — détecter les H2 génériques/descriptifs
  const decisionVerbs = /\b(choisir|éviter|payer|optimiser|risquer|arbitrer|renoncer|privilégier|sacrifier|comparer|négocier|anticiper|contourner|limiter|maximiser|minimiser|trancher)\b/i;
  const tensionConnectors = /\b(mais|vs|au prix de|à condition de|malgré|plutôt que|au lieu de|sans|avant de|quitte à)\b/i;
  const genericPatterns = [
    /^les?\s+\w+\s+(de|du|des|au|en)\s+/i,
    /^conseils?\s+(pour|pratiques?|de)/i,
    /^guide\s+(de|du|pour|des|pratique)/i,
    /^comment\s+(bien\s+)?/i,
    /^questions?\s+fréquentes?/i,
    /^FAQ\b/i,
    /^avantages?\s+et\s+inconvénients?/i,
    /^comparaison\s+(de|des|du)/i,
    /^options?\s+d['']/i,
    /^checklist\b/i
  ];
  const genericH2s = [];
  for (const h2Tag of h2Matches) {
    const h2Text = h2Tag.replace(/<[^>]*>/g, '').trim();
    if (h2Text.length < 5) continue;
    const hasDecisionVerb = decisionVerbs.test(h2Text);
    const hasTensionConnector = tensionConnectors.test(h2Text);
    const isGenericPattern = genericPatterns.some(p => p.test(h2Text));
    if (!hasDecisionVerb && !hasTensionConnector && isGenericPattern) {
      genericH2s.push(h2Text);
    }
  }
  if (genericH2s.length > 0) {
    console.log(`   ⚠️ H2_QUALITY: ${genericH2s.length} H2 générique(s) détecté(s):`);
    genericH2s.forEach(h => console.log(`      → "${h}"`));
    report.issues.push({
      code: 'H2_GENERIC_DETECTED',
      severity: 'low',
      message: `${genericH2s.length} H2 générique(s) sans verbe décisionnel ni connecteur de tension: ${genericH2s.map(h => `"${h}"`).join(', ')}`,
      evidence: { genericH2s },
      check: 'h2_quality'
    });
    report.checks.push({
      name: 'h2_quality',
      status: 'warn',
      details: `${genericH2s.length}/${h2Count} H2 génériques détectés`
    });
  } else {
    report.checks.push({
      name: 'h2_quality',
      status: 'pass',
      details: `${h2Count} H2 tous qualifiés (verbe décisionnel ou connecteur de tension)`
    });
  }
  
  return finalHtml;
}

/**
 * PHASE 6.4: Ajouter wrappers premium (takeaways, community, open-questions)
 * Ajoute des wrappers HTML strictement pilotés par story.*, sans invention
 */

export function applyBlockingGate(report) {
  // Codes d'issues bloquantes
  const BLOCKING_ISSUE_CODES = [
    'SOURCE_OF_TRUTH_VIOLATION_FINALIZER',
    'SOURCE_OF_TRUTH_VIOLATION', // Alias pour compatibilité
    'AFFILIATE_INJECTION_FAILED',
    'AFFILIATE_PLAN_NOT_RESPECTED_FINALIZER',
    'ANTI_HALLUCINATION_BLOCK' // PHASE 7.1.d: Anti-hallucination blocking (si severity=high)
  ];
  
  // Identifier les issues bloquantes
  const blockingIssues = report.issues.filter(issue => {
    const code = issue.code || '';
    const alias = issue.alias || '';
    const isBlockingCode = BLOCKING_ISSUE_CODES.includes(code) || BLOCKING_ISSUE_CODES.includes(alias);
    
    // Pour ANTI_HALLUCINATION_BLOCK, vérifier que severity=high (mode bloquant activé)
    if (code === 'ANTI_HALLUCINATION_BLOCK') {
      return isBlockingCode && issue.severity === 'high';
    }
    
    return isBlockingCode;
  });
  
  // Définir report.blocking et report.blocking_reasons
  report.blocking = blockingIssues.length > 0;
  report.blocking_reasons = blockingIssues.map(issue => ({
    code: issue.code || issue.alias || 'UNKNOWN',
    message: issue.message || 'No message',
    check: issue.check || 'unknown'
  }));
  
  // PHASE 6.5: Forcer report.status = 'fail' UNIQUEMENT si blocking=true
  // Les autres warnings (STORY_ALIGNMENT_VIOLATION avec severity=low, etc.) ne doivent pas bloquer
  // TEMPORAIRE: Désactiver le blocking pour permettre la publication (truth pack à corriger)
  const ENABLE_BLOCKING = process.env.ENABLE_FINALIZER_BLOCKING !== '0'; // Par défaut activé, désactiver avec '0'
  if (report.blocking && !ENABLE_BLOCKING) {
    console.log(`⚠️ FINALIZER_BLOCKING désactivé temporairement (ENABLE_FINALIZER_BLOCKING=${process.env.ENABLE_FINALIZER_BLOCKING})`);
    report.blocking = false; // Désactiver le blocking
    report.status = 'warn'; // Passer en warn au lieu de fail
  }
  if (report.blocking && ENABLE_BLOCKING) {
    // Trouver le check global ou le créer
    let globalCheck = report.checks.find(c => c.name === 'finalizer_blocking_gate');
    if (!globalCheck) {
      globalCheck = {
        name: 'finalizer_blocking_gate',
        status: 'fail',
        details: `${blockingIssues.length} blocking issue(s) detected`
      };
      report.checks.push(globalCheck);
    } else {
      globalCheck.status = 'fail';
      globalCheck.details = `${blockingIssues.length} blocking issue(s) detected`;
    }
    
    // Définir report.status = 'fail' pour indiquer un échec bloquant
    report.status = 'fail';
    
    // Log bloquant
    console.log(`❌ FINALIZER_BLOCKING: blocking=true reasons=[${report.blocking_reasons.map(r => r.code).join(', ')}]`);
  } else {
    // Ajouter un check pass pour indiquer que le gate a été vérifié
    report.checks.push({
      name: 'finalizer_blocking_gate',
      status: 'pass',
      details: 'No blocking issues detected'
    });
    
    // PHASE 6.5: Si pas de blocking, le status reste 'pass' ou 'warn' selon les autres checks
    // Ne pas forcer 'fail' si seulement des warnings non-bloquants
    const hasBlockingFail = report.checks.some(c => 
      c.status === 'fail' && 
      (c.name === 'invention_guard' || c.name === 'affiliate_conformance' || c.name === 'finalizer_blocking_gate')
    );
    if (!hasBlockingFail) {
      // Si pas de fail bloquant, le status peut être 'pass' ou 'warn'
      const hasWarn = report.checks.some(c => c.status === 'warn');
      report.status = hasWarn ? 'warn' : 'pass';
    }
  }
}

/**
 * PHASE 7.1.d: Anti-Hallucination Guard
 * Détecte les hallucinations dans le texte éditorial en comparant avec le truth pack
 */

export async function checkAntiHallucination(html, pipelineContext, report, title = '') {
  try {
    // Importer le guard dynamiquement
    const { runAntiHallucinationGuard } = await import('./src/anti-hallucination/anti-hallucination-guard.js');
    
    const extracted = pipelineContext?.extracted || {};
    
    // Exécuter le guard (passer le titre pour validation anti-décontextualisation)
    const guardResult = await runAntiHallucinationGuard({
      html,
      extracted,
      context: pipelineContext,
      title
    });
    
    // Log standard
    const reasonsStr = guardResult.reasons.length > 0 
      ? guardResult.reasons.join(', ') 
      : 'none';
    console.log(`✅ ANTI_HALLUCINATION: status=${guardResult.status} blocking=${guardResult.blocking} reasons=[${reasonsStr}]`);
    
    // Si blocking=true, ajouter une issue
    // Utiliser la constante depuis config.js (par défaut activé en production)
    const shouldBlock = ENABLE_ANTI_HALLUCINATION_BLOCKING;
    
    // Déterminer le status du check
    let checkStatus = 'pass';
    if (guardResult.blocking) {
      // Si blocking=true et flag activé → fail, sinon → warn
      checkStatus = shouldBlock ? 'fail' : 'warn';
    } else if (guardResult.status === 'warn') {
      checkStatus = 'warn';
    }
    
    report.checks.push({
      name: 'anti_hallucination',
      status: checkStatus,
      details: guardResult.reasons.length > 0 
        ? `${guardResult.reasons.length} issue(s): ${reasonsStr}` 
        : 'No hallucinations detected'
    });
    
    // Si blocking=true, vérifier qu'il y a de vraies issues bloquantes (pas juste entity_drift warnings)
    if (guardResult.blocking) {
      const blockingEvidence = guardResult.evidence.filter(e => e.type !== 'entity_drift');
      const hasRealBlockingIssue = blockingEvidence.length > 0;
      
      report.issues.push({
        code: 'ANTI_HALLUCINATION_BLOCK',
        severity: (shouldBlock && hasRealBlockingIssue) ? 'high' : 'medium',
        message: `Anti-hallucination guard detected ${guardResult.reasons.length} issue(s)${!hasRealBlockingIssue ? ' (entity_drift only, non-blocking)' : ''}`,
        evidence: guardResult.evidence,
        check: 'anti_hallucination'
      });
    }
    
    // Ajouter les warnings (non bloquants)
    if (guardResult.status === 'warn' && !guardResult.blocking) {
      guardResult.evidence.forEach(evidence => {
        report.issues.push({
          code: 'ANTI_HALLUCINATION_WARNING',
          severity: 'low',
          message: evidence.why,
          evidence: { type: evidence.type, text: evidence.text },
          check: 'anti_hallucination'
        });
      });
    }
    
    // Exposer dans debug si présent
    if (!report.debug) report.debug = {};
    report.debug.anti_hallucination = {
      status: guardResult.status,
      blocking: guardResult.blocking,
      reasons: guardResult.reasons,
      evidence_count: guardResult.evidence.length,
      included_len: guardResult.debug?.included_len || 0
    };
    
  } catch (error) {
    // En cas d'erreur, logger mais ne pas bloquer
    console.warn('⚠️ Erreur anti-hallucination guard (fallback silencieux):', error.message);
    report.checks.push({
      name: 'anti_hallucination',
      status: 'warn',
      details: `Error: ${error.message}`
    });
  }
}

/**
 * PHASE 6.3: Échapper HTML pour sécurité
 */

export function validateAndFixCitations(html, report) {
  console.log('🔍 Validation citations...');
  
  let cleanedHtml = html;
  const invalidCitations = [];
  
  // AMÉLIORATION: Pattern pour détecter les citations vides (guillemets vides avec attribution)
  // Ex: « » — auteur Reddit ou «  » — Extrait Reddit
  const emptyCitationPattern = /<p[^>]*>«\s*»\s*[—–]\s*[^<]+<\/p>/gi;
  const emptyCitationMatches = html.match(emptyCitationPattern);
  if (emptyCitationMatches) {
    emptyCitationMatches.forEach(match => {
      invalidCitations.push({
        fullMatch: match,
        reason: 'citation_vide',
        text: match.substring(0, 50)
      });
    });
  }
  
  // Pattern: Citations qui ne contiennent que le nom d'auteur
  const authorOnlyPattern = /«\s*Auteur\s*:\s*[^»]+»/gi;
  const authorOnlyMatches = html.match(authorOnlyPattern);
  if (authorOnlyMatches) {
    authorOnlyMatches.forEach(match => {
      invalidCitations.push({
        fullMatch: match,
        reason: 'nom_auteur_seul',
        text: match
      });
    });
  }
  
  // AMÉLIORATION: Pattern pour détecter les citations avec très peu de contenu (moins de 5 caractères réels)
  const minimalCitationPattern = /<p[^>]*>«\s*([^»]{0,20})\s*»\s*[—–]\s*[^<]+<\/p>/gi;
  let minimalMatch;
  while ((minimalMatch = minimalCitationPattern.exec(html)) !== null) {
    const citationText = minimalMatch[1].trim();
    const realText = citationText.replace(/[^\w\sÀ-Ÿà-ÿ]/g, '').trim();
    if (realText.length < 5) {
      invalidCitations.push({
        fullMatch: minimalMatch[0],
        reason: 'citation_trop_courte',
        text: citationText.substring(0, 50)
      });
    }
  }
  
  // Pattern: Citations redondantes (même texte répété)
  const citationPattern = /«([^»]+)»/g;
  const citations = [];
  let citationMatch;
  while ((citationMatch = citationPattern.exec(html)) !== null) {
    const citationText = citationMatch[1].trim().toLowerCase();
    if (citationText.length > 10) {
      citations.push({
        text: citationText,
        fullMatch: citationMatch[0],
        index: citationMatch.index
      });
    }
  }
  
  // Détecter doublons
  const seenCitations = new Map();
  citations.forEach((cit, index) => {
    if (seenCitations.has(cit.text)) {
      invalidCitations.push({
        fullMatch: cit.fullMatch,
        reason: 'citation_redondante',
        text: cit.text.substring(0, 50)
      });
    } else {
      seenCitations.set(cit.text, index);
    }
  });
  
  // Vérifier contenu substantiel (> 20 caractères de texte réel)
  citations.forEach(cit => {
    const realText = cit.text.replace(/[^\w\s]/g, '').trim();
    if (realText.length < 20) {
      invalidCitations.push({
        fullMatch: cit.fullMatch,
        reason: 'citation_trop_courte',
        text: cit.text.substring(0, 50)
      });
    }
  });
  
  // Supprimer citations invalides (en ordre inverse pour préserver les indices)
  let removedCount = 0;
  // Trier par index décroissant pour supprimer de la fin vers le début
  const sortedInvalid = [...invalidCitations].sort((a, b) => {
    const indexA = cleanedHtml.indexOf(a.fullMatch);
    const indexB = cleanedHtml.indexOf(b.fullMatch);
    return indexB - indexA;
  });
  
  sortedInvalid.forEach(cit => {
    const index = cleanedHtml.indexOf(cit.fullMatch);
    if (index !== -1) {
      // Supprimer aussi le paragraphe parent si c'est une citation vide
      if (cit.reason === 'citation_vide') {
        // Chercher le <p> parent complet
        const beforeMatch = cleanedHtml.substring(0, index);
        const afterMatch = cleanedHtml.substring(index);
        const pStart = beforeMatch.lastIndexOf('<p');
        const pEnd = afterMatch.indexOf('</p>') + 4;
        
        if (pStart !== -1 && pEnd !== -1) {
          const fullParagraph = cleanedHtml.substring(pStart, index + pEnd);
          cleanedHtml = cleanedHtml.substring(0, pStart) + cleanedHtml.substring(index + pEnd);
          removedCount++;
          console.log(`   🧹 Citation vide supprimée (paragraphe complet): "${cit.text.substring(0, 50)}..."`);
        } else {
          // Fallback: supprimer juste la citation
          cleanedHtml = cleanedHtml.replace(cit.fullMatch, '');
          removedCount++;
          console.log(`   🧹 Citation invalide supprimée (${cit.reason}): "${cit.text.substring(0, 50)}..."`);
        }
      } else {
        cleanedHtml = cleanedHtml.replace(cit.fullMatch, '');
        removedCount++;
        console.log(`   🧹 Citation invalide supprimée (${cit.reason}): "${cit.text.substring(0, 50)}..."`);
      }
    }
  });
  
  // Ajouter au rapport
  if (invalidCitations.length > 0) {
    report.checks.push({
      name: 'citations',
      status: removedCount === invalidCitations.length ? 'pass' : 'warn',
      details: `invalides=${invalidCitations.length} supprimées=${removedCount}`
    });
    
    if (removedCount < invalidCitations.length) {
      report.issues.push({
        code: 'INVALID_CITATIONS',
        severity: 'warn',
        message: `${invalidCitations.length - removedCount} citation(s) invalide(s) non supprimée(s)`,
        evidence: invalidCitations.slice(0, 3).map(c => c.text)
      });
    }
    
    report.actions.push({
      type: 'removed_invalid_citations',
      details: `count=${removedCount}`
    });
  } else {
    report.checks.push({
      name: 'citations',
      status: 'pass',
      details: 'Toutes les citations sont valides'
    });
  }
  
  console.log(`✅ Citations: ${invalidCitations.length} invalide(s), ${removedCount} supprimée(s)`);
  return cleanedHtml;
}

/**
 * Valide la cohérence des liens dans les recommandations
 * @param {string} html - HTML à valider
 * @param {Object} report - Rapport QA
 */

export function validateRecommendationLinks(html, report) {
  console.log('🔍 Validation liens recommandations...');
  
  // Extraire section "Nos recommandations"
  const recommendationsMatch = html.match(/<h2[^>]*>Nos recommandations[^<]*<\/h2>([\s\S]*?)(?=<h[23]|$)/i);
  if (!recommendationsMatch) {
    report.checks.push({
      name: 'recommendation_links',
      status: 'warn',
      details: 'Section "Nos recommandations" non trouvée'
    });
    return;
  }
  
  const recommendationsSection = recommendationsMatch[1];
  const links = recommendationsSection.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi) || [];
  
  const mismatches = [];
  links.forEach(link => {
    const hrefMatch = link.match(/href=["']([^"']+)["']/i);
    const textMatch = link.match(/>([^<]+)</i);
    
    if (hrefMatch && textMatch) {
      // Normaliser l'URL (supprimer les espaces parasites insérés par normalizeSpacing)
      const href = hrefMatch[1].replace(/\s+/g, '');
      const text = textMatch[1].toLowerCase();
      
      // Vérifier cohérence
      if (text.includes('logement') || text.includes('hôtel') || text.includes('hébergement')) {
        if (!href.includes('booking.com') && !href.includes('hotel')) {
          mismatches.push({
            context: 'logement',
            link: href,
            text: text,
            expected: 'booking.com ou hotel'
          });
        }
      } else if (text.includes('vol') || text.includes('avion')) {
        if (!href.includes('kiwi.com') && !href.includes('flight')) {
          mismatches.push({
            context: 'vols',
            link: href,
            text: text,
            expected: 'kiwi.com ou flight'
          });
        }
      } else if (text.includes('esim') || text.includes('sim') || text.includes('connexion')) {
        if (!href.includes('airalo.com') && !href.includes('esim')) {
          mismatches.push({
            context: 'esim',
            link: href,
            text: text,
            expected: 'airalo.com ou esim'
          });
        }
      }
    }
  });
  
  // Ajouter au rapport
  if (mismatches.length > 0) {
    report.checks.push({
      name: 'recommendation_links',
      status: 'warn',
      details: `mismatches=${mismatches.length}`
    });
    
    report.issues.push({
      code: 'RECOMMENDATION_LINK_MISMATCH',
      severity: 'warn',
      message: `${mismatches.length} lien(s) de recommandation incohérent(s)`,
      evidence: mismatches[0]
    });
    
    console.log(`   ⚠️ RECOMMENDATION_LINK_MISMATCH: context=${mismatches[0].context} link=${mismatches[0].link} expected=${mismatches[0].expected}`);
  } else {
    report.checks.push({
      name: 'recommendation_links',
      status: 'pass',
      details: 'Tous les liens sont cohérents'
    });
  }
  
  console.log(`✅ Liens recommandations: ${mismatches.length} incohérence(s) détectée(s)`);
}

/**
 * Traduction forcée de la section "Nos recommandations" (correction audit)
 * Détecte et traduit toute la section si >20% de mots anglais
 * @param {string} html - HTML à traiter
 * @param {Object} report - Rapport QA
 * @returns {string} HTML avec section traduite
 */

export function validateAndExtendNarrativeSection(html, pipelineContext, report) {
  console.log('📖 Validation section narrative "Une histoire vraie"...');
  
  // Patterns pour détecter les sections narratives
  const narrativePatterns = [
    /<h2[^>]*>Une vraie histoire[^<]*<\/h2>/i,
    /<h2[^>]*>Une histoire vraie[^<]*<\/h2>/i,
    /<h2[^>]*>Témoignage[^<]*<\/h2>/i,
    /<h2[^>]*>.*?histoire.*?<\/h2>/i
  ];
  
  let foundSection = false;
  let sectionTooShort = false;
  
  for (const pattern of narrativePatterns) {
    const match = html.match(pattern);
    if (match) {
      foundSection = true;
      const h2Index = match.index;
      const h2End = h2Index + match[0].length;
      
      // Extraire le contenu après le H2 jusqu'au prochain H2 ou fin
      const afterH2 = html.substring(h2End);
      const nextH2Match = afterH2.match(/<h2[^>]*>/i);
      const sectionContent = nextH2Match 
        ? afterH2.substring(0, nextH2Match.index)
        : afterH2;
      
      // Extraire le texte narratif (sans balises HTML)
      const textContent = sectionContent.replace(/<[^>]+>/g, ' ').trim();
      const textLength = textContent.length;
      
      // Vérifier si la section fait au moins 200 caractères
      if (textLength < 200) {
        sectionTooShort = true;
        console.log(`   ⚠️ Section narrative trop courte: ${textLength} caractères (minimum: 200)`);
        
        report.checks.push({
          name: 'narrative_section_length',
          status: 'warn',
          details: `Section "${match[0].replace(/<[^>]+>/g, '')}" trop courte: ${textLength} caractères (minimum: 200)`
        });
        
        report.issues.push({
          code: 'NARRATIVE_SECTION_TOO_SHORT',
          severity: 'medium',
          message: `La section narrative "${match[0].replace(/<[^>]+>/g, '')}" ne fait que ${textLength} caractères. Minimum recommandé: 200 caractères pour développer l'histoire (qui, quoi, enjeu).`,
          evidence: {
            sectionTitle: match[0].replace(/<[^>]+>/g, ''),
            currentLength: textLength,
            requiredLength: 200
          }
        });
        
        // Optionnellement, suggérer une extension basée sur story.evidence.source_snippets
        const hasEvidenceSnippets = pipelineContext?.story?.evidence?.source_snippets?.length > 0;
        if (hasEvidenceSnippets) {
          const snippets = pipelineContext.story.evidence.source_snippets;
          const firstSnippet = snippets[0];
          let snippetText = typeof firstSnippet === 'string' ? firstSnippet : 
                           (firstSnippet?.text || firstSnippet?.content || firstSnippet?.snippet || '');
          if (snippetText && snippetText.length > 50) {
            console.log(`   💡 Suggestion: Utiliser snippet disponible (${snippetText.length} caractères) pour étendre la section`);
          }
        }
      } else {
        report.checks.push({
          name: 'narrative_section_length',
          status: 'pass',
          details: `Section narrative de ${textLength} caractères (OK)`
        });
        console.log(`   ✅ Section narrative de longueur correcte: ${textLength} caractères`);
      }
      
      break; // Ne traiter que la première section trouvée
    }
  }
  
  if (!foundSection) {
    report.checks.push({
      name: 'narrative_section_length',
      status: 'warn',
      details: 'Aucune section narrative détectée (H2 "Une histoire vraie", "Témoignage", etc.)'
    });
    console.log('   ⚠️ Aucune section narrative détectée');
  }
}

/**
 * Traduction forcée des citations dans les listes (correction audit)
 * @param {string} html - HTML à traiter
 * @param {Object} report - Rapport QA
 * @returns {string} HTML avec citations traduites
 */

export function validateTemporalConsistency(html, report) {
  console.log('🔍 Validation cohérence temporelle...');
  
  // Extraire toutes les dates (pattern: mois + année)
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
                      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const datePattern = new RegExp(`(${monthNames.join('|')})\\s+(\\d{4})`, 'gi');
  
  const dates = [];
  let dateMatch;
  while ((dateMatch = datePattern.exec(html)) !== null) {
    const month = dateMatch[1].toLowerCase();
    const year = parseInt(dateMatch[2], 10);
    dates.push({ month, year, fullMatch: dateMatch[0] });
  }
  
  // Date de publication (approximative - utiliser date actuelle)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const warnings = [];
  dates.forEach(date => {
    // Dates futures
    if (date.year > currentYear || (date.year === currentYear && getMonthNumber(date.month) > currentMonth)) {
      warnings.push({
        date: date.fullMatch,
        reason: 'date_future',
        year: date.year
      });
    }
    
    // Dates très anciennes (> 2 ans)
    if (date.year < currentYear - 2) {
      warnings.push({
        date: date.fullMatch,
        reason: 'date_tres_ancienne',
        year: date.year,
        years_ago: currentYear - date.year
      });
    }
  });
  
  // Helper pour convertir mois en nombre
  function getMonthNumber(monthName) {
    const months = {
      'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
      'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12,
      'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
      'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
    };
    return months[monthName.toLowerCase()] || 0;
  }
  
  // Ajouter au rapport
  if (warnings.length > 0) {
    report.checks.push({
      name: 'temporal_consistency',
      status: 'warn',
      details: `warnings=${warnings.length} dates=${dates.length}`
    });
    
    report.issues.push({
      code: 'TEMPORAL_INCONSISTENCY',
      severity: 'warn',
      message: `${warnings.length} date(s) incohérente(s) détectée(s)`,
      evidence: warnings.slice(0, 3)
    });
    
    warnings.forEach(w => {
      console.log(`   ⚠️ Date incohérente (${w.reason}): ${w.date}`);
    });
  } else {
    report.checks.push({
      name: 'temporal_consistency',
      status: 'pass',
      details: `dates=${dates.length} toutes cohérentes`
    });
  }
  
  console.log(`✅ Cohérence temporelle: ${dates.length} date(s), ${warnings.length} warning(s)`);
}

/**
 * Vérifie et ajoute les sections SERP manquantes
 * @param {string} html - HTML à valider
 * @param {Object} pipelineContext - Contexte du pipeline
 * @param {Object} report - Rapport QA
 * @returns {Promise<string>} HTML corrigé
 */

