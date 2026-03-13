/**
 * FINALIZER PASSES - Translation passes
 * FV-115: Extracted from article-finalizer.js
 * Each function is bound to the ArticleFinalizer instance at runtime.
 */
import { FORCE_OFFLINE } from '../config.js';


export function translateCityNamesToFrench(html) {
  // Map des noms anglais → français (word-boundary safe)
  const cityTranslations = {
    'Singapore': 'Singapour',
    'Thailand': 'Thaïlande',
    'Vietnam': 'Vietnam', // déjà FR
    'Indonesia': 'Indonésie',
    'Philippines': 'Philippines', // identique
    'Japan': 'Japon',
    'Cambodia': 'Cambodge',
    'Malaysia': 'Malaisie',
    'South Korea': 'Corée du Sud',
    'North Korea': 'Corée du Nord',
    'Myanmar': 'Myanmar', // identique
    'Laos': 'Laos', // identique
    'Taiwan': 'Taïwan',
    'Hong Kong': 'Hong Kong', // identique
    'Southeast Asia': 'Asie du Sud-Est',
    'South East Asia': 'Asie du Sud-Est',
    'South Asia': 'Asie du Sud',
    'East Asia': 'Asie de l\'Est',
    'Digital Nomad': 'Nomade Digital',
    'Kuala Lumpur': 'Kuala Lumpur', // identique
    'Ho Chi Minh City': 'Hô-Chi-Minh-Ville',
    'Phnom Penh': 'Phnom Penh' // identique
  };

  let result = html;
  let replacements = 0;

  for (const [eng, fr] of Object.entries(cityTranslations)) {
    if (eng === fr) continue; // Pas besoin de remplacer si identique
    // Remplacement word-boundary dans les tags textuels (H2, H3, P, LI, blockquote, figcaption)
    const engEscaped = eng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(>[^<]*?)\\b${engEscaped}\\b`, 'gi');
    const before = result;
    result = result.replace(pattern, (match, prefix) => {
      return prefix + fr;
    });
    if (result !== before) {
      const count = (before.match(new RegExp(`\\b${engEscaped}\\b`, 'g')) || []).length - 
                    (result.match(new RegExp(`\\b${engEscaped}\\b`, 'g')) || []).length;
      if (count > 0) {
        replacements += count;
        console.log(`   🌐 CITY_TRANSLATE: "${eng}" → "${fr}" (${count}x)`);
      }
    }
  }

  if (replacements > 0) {
    console.log(`✅ CITY_TRANSLATE: ${replacements} nom(s) traduit(s) en français`);
  }
  return result;
}

/**
 * PHASE 6.0.8b: Garantir un paragraphe introductif avant le premier H2
 * Si le HTML commence directement par <h2>, déplacer le premier <p> qui suit le H2 vers avant le H2.
 */

export async function detectAndTranslateEnglish(html, report) {
  console.log('🔍 Détection contenu anglais...');
  
  let cleanedHtml = html;

  // (Nettoyage typographique déplacé dans fixWordGlue() - PHASE 2.3b)

  // Traduire les titres H2 en anglais (ex. "How much does a long stay in Thailand really cost?" -> français)
  const h2Regex = /<h2([^>]*)>([^<]+)<\/h2>/gi;
  let h2Match;
  const h2ToTranslate = [];
  while ((h2Match = h2Regex.exec(html)) !== null) {
    const innerText = h2Match[2].trim();
    if (innerText.length < 5) continue;
    const eng = this.intelligentContentAnalyzer?.detectEnglishContent?.(innerText) || { isEnglish: false, ratio: 0 };
    const looksEnglish = /^(how|what|why|when|where|which|the |a |an )/i.test(innerText) || (eng.isEnglish && eng.ratio > 0.2);
    if (looksEnglish && this.intelligentContentAnalyzer) {
      h2ToTranslate.push({ fullTag: h2Match[0], inner: innerText, attrs: h2Match[1] });
    }
  }
  for (const h of h2ToTranslate) {
    try {
      const translated = await this.intelligentContentAnalyzer.translateToFrench(h.inner);
      if (translated && translated !== h.inner) {
        const newTag = `<h2${h.attrs}>${translated}</h2>`;
        cleanedHtml = cleanedHtml.replace(h.fullTag, newTag);
        console.log(`   🌐 H2 traduit: "${h.inner.substring(0, 40)}..." → "${translated.substring(0, 40)}..."`);
      }
    } catch (e) {
      console.warn(`   ⚠️ Traduction H2 ignorée: ${e.message}`);
    }
  }
  if (h2ToTranslate.length > 0) html = cleanedHtml;

  // Traduire les lignes de recommandation en anglais (#1/#2/#3 suivies de texte anglais)
  // AMÉLIORATION: Détecter aussi dans les listes HTML (<li>#1 ...</li>)
  const recoLineRegex = /(#\s*[123]\s+)([A-Za-z][^<]{10,}?)(?=#\s*[123]|<\/p>|<\/li>|$)/gi;
  const recoMatches = [...cleanedHtml.matchAll(recoLineRegex)];
  const replacements = [];
  for (const recoMatch of recoMatches) {
    const prefix = recoMatch[1];
    const lineText = recoMatch[2].trim();
    const eng = this.intelligentContentAnalyzer?.detectEnglishContent?.(lineText) || { isEnglish: false, ratio: 0 };
    // AMÉLIORATION: Détecter plus de patterns anglais (Choose, Book, Find, via, to stay, to ensure, hassle-free, s'adapter)
    const looksEn = /\b(Choose|Book|Find|via|to stay|to ensure|hassle-free|s\'adapter|for|explore|stay|enjoy|discover|settle|cultural|immersion|opportunities)\b/i.test(lineText) || (eng.isEnglish && eng.ratio > 0.3);
    if (looksEn && this.intelligentContentAnalyzer) {
      try {
        const translated = await this.intelligentContentAnalyzer.translateToFrench(lineText);
        if (translated && translated !== lineText) {
          replacements.push({ from: prefix + lineText, to: prefix + translated });
        }
      } catch (e) { console.warn(`   ⚠️ Traduction ligne reco: ${e.message}`); }
    }
  }
  replacements.forEach(({ from, to }) => {
    cleanedHtml = cleanedHtml.replace(from, to);
    console.log(`   🌐 Ligne recommandation traduite: "${from.substring(0, 40)}..." → "${to.substring(0, 40)}..."`);
  });
  html = cleanedHtml;

  const englishPatterns = [
    /Essential for/i,
    /Underestimating/i,
    /Not budgeting/i,
    /Fatigue setting/i,
    /Critical Moment/i,
    /What Reddit/i,
    /Budget is/i,
    /trip to/i,
    /heading south/i,
    /starting in/i,
    /worth taking/i,
    /not including/i,
    /day trip/i,
    /planning a/i,
    /I'd honestly/i,
    /I did a similar/i
  ];
  
  const englishMatches = [];
  
  // Détecter patterns anglais courants
  englishPatterns.forEach(pattern => {
    const matches = html.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      matches.forEach(match => {
        const contextMatch = html.match(new RegExp(`<[^>]*>.*?${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?<\/[^>]+>`, 'gi'));
        if (contextMatch) {
          englishMatches.push({
            pattern: match,
            context: contextMatch[0],
            fullMatch: contextMatch[0]
          });
        }
      });
    }
  });
  
  // PHASE 1 FIX: Extraire TOUS les éléments textuels, y compris blockquotes et paragraphes avec HTML imbriqué
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  const listItems = html.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
  const blockquotes = html.match(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi) || [];
  const allTextElements = [...paragraphs, ...listItems, ...blockquotes];
  
  // PHASE 2 FIX: Retrait des faux amis francais (culture, service, budget, national, architecture, etc.)
  // et des noms propres geographiques (Asia, Hong, Kong, Taiwan) qui polluent le ratio
  // PHASE 3 FIX: Ajout mots manquants (around, whole, accommodation, whether, enough, spend, stay, etc.)
  const englishWords = /\b(the|is|are|was|were|have|has|had|this|that|with|from|which|what|how|why|when|where|for|and|or|but|if|then|else|can|could|should|will|would|must|may|might|underestimating|budgeting|setting|check|coverage|requirements|available|launched|doesn't|don't|I'm|you|he|she|it|we|they|great|food|amazing|vistas|affordable|loved|interested|scenery|been|most|IMO|best|week|weeks|trip|planning|starting|heading|south|north|worth|taking|including|flights|honestly|added|days|around|whole|accommodation|entire|about|really|actually|per|night|whether|enough|spend|stay|overall|cheap|expensive|however|also|into|some|any|than|other|only|more|just|very|much|need|want|looking|moving|working|getting|trying|know|think|going|people|places|each|every|many|here|there|not|still|even|well)\b/gi;
  
  allTextElements.forEach(para => {
    const text = para.replace(/<[^>]+>/g, ' ').trim();
    if (text.length > 20) {
      const englishCount = (text.match(englishWords) || []).length;
      const totalWords = text.split(/\s+/).length;
      const englishRatio = totalWords > 0 ? englishCount / totalWords : 0;
      
      if (englishRatio > 0.1 && totalWords > 5) {
        englishMatches.push({
          pattern: 'high_english_ratio',
          context: text,
          fullMatch: para,
          ratio: englishRatio
        });
      }
      
      // PHASE 1 FIX: Détection par phrase individuelle pour les paragraphes mixtes FR/EN
      if (englishRatio <= 0.1) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
        for (const sentence of sentences) {
          const sentTrimmed = sentence.trim();
          const sentEnglishCount = (sentTrimmed.match(englishWords) || []).length;
          const sentTotalWords = sentTrimmed.split(/\s+/).length;
          const sentRatio = sentTotalWords > 0 ? sentEnglishCount / sentTotalWords : 0;
          if (sentRatio > 0.3 && sentTotalWords > 4) {
            englishMatches.push({
              pattern: 'sentence_level_english',
              context: text,
              fullMatch: para,
              ratio: sentRatio,
              sentence: sentTrimmed
            });
            break;
          }
        }
      }
    }
  });
  
  // Traduire ou supprimer (1 appel bulk si traducteur disponible)
  let translatedCount = 0;
  let removedCount = 0;
  englishMatches.sort((a, b) => (b.ratio || 0) - (a.ratio || 0));

  if (!this.intelligentContentAnalyzer) {
    englishMatches.forEach(match => {
      const escapedMatch = match.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleanedHtml = cleanedHtml.replace(new RegExp(escapedMatch, 'gi'), '');
      removedCount++;
    });
  } else {
    const items = englishMatches.map(m => ({
      match: m,
      textToTranslate: m.context.replace(/<[^>]+>/g, ' ').trim()
    })).filter(x => x.textToTranslate.length > 10);
    const toTranslate = items.map(x => x.textToTranslate);
    let translated = [];
    if (toTranslate.length > 0) {
      try {
        translated = this.intelligentContentAnalyzer.translateBulkToFrench
          ? await this.intelligentContentAnalyzer.translateBulkToFrench(toTranslate)
          : await Promise.all(toTranslate.map(t => this.intelligentContentAnalyzer.translateToFrench(t)));
      } catch (err) {
        console.error(`   ❌ Erreur traduction bulk: ${err.message}`);
      }
    }
    items.forEach((item, i) => {
      const trad = translated[i];
      const escapedMatch = item.match.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (trad) {
        // PHASE 3 FIX: Si le fullMatch contient des tags HTML imbriques (<strong>, <em>, etc.),
        // fullMatch.replace(textToTranslate, trad) echoue silencieusement car le plain text
        // ne se trouve pas littéralement dans le HTML. On reconstruit le tag avec le contenu traduit.
        let replaced = item.match.fullMatch.replace(item.textToTranslate, trad);
        if (replaced === item.match.fullMatch && trad !== item.textToTranslate) {
          // Replacement failed — reconstruct the tag with translated content
          const tagMatch = item.match.fullMatch.match(/^<(\w+)([^>]*)>/);
          if (tagMatch) {
            const [, tagName, attrs] = tagMatch;
            replaced = `<${tagName}${attrs}>${trad}</${tagName}>`;
          }
        }
        cleanedHtml = cleanedHtml.replace(new RegExp(escapedMatch, 'gi'), replaced);
        translatedCount++;
      } else {
        cleanedHtml = cleanedHtml.replace(new RegExp(escapedMatch, 'gi'), '');
        removedCount++;
      }
    });
  }
  
  // Calculer ratio anglais total
  // AMÉLIORATION: Exclure URLs et noms propres de la détection
  let allText = cleanedHtml.replace(/<[^>]+>/g, ' ');
  // Supprimer URLs
  allText = allText.replace(/https?:\/\/[^\s]+/gi, '');
  // Supprimer emails
  allText = allText.replace(/[^\s]+@[^\s]+/gi, '');
  // Supprimer codes (ex: PAR, SGN, KUL)
  allText = allText.replace(/\b[A-Z]{2,4}\b/g, '');
  
  const totalEnglishWords = (allText.match(englishWords) || []).length;
  const totalWords = allText.split(/\s+/).filter(w => w.length > 2).length; // Filtrer mots très courts
  const totalEnglishRatio = totalWords > 0 ? totalEnglishWords / totalWords : 0;
  
  // AMÉLIORATION: Si ratio > 0.1%, forcer suppression de tous les patterns anglais détectés
  if (totalEnglishRatio > 0.001) {
    // Si ratio encore trop élevé après traductions, supprimer tous les patterns anglais restants
    // PHASE 2 FIX: seuil releve de 1% a 3% pour eviter suppression de paragraphes francais
    if (totalEnglishRatio > 0.03) {
      console.log(`   ⚠️ Ratio anglais encore élevé (${(totalEnglishRatio * 100).toFixed(2)}%), suppression agressive...`);
      
      // PHASE 1 FIX: Trouver et supprimer tous les éléments texte avec ratio anglais élevé (p, li, blockquote)
      const allParagraphs = [
        ...(cleanedHtml.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []),
        ...(cleanedHtml.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || []),
        ...(cleanedHtml.match(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi) || [])
      ];
      allParagraphs.forEach(para => {
        const text = para.replace(/<[^>]+>/g, ' ').trim();
        if (text.length > 20) {
          const englishCount = (text.match(englishWords) || []).length;
          const totalWords = text.split(/\s+/).filter(w => w.length > 2).length;
          const englishRatio = totalWords > 0 ? englishCount / totalWords : 0;
          
          // PHASE 2 FIX: seuil releve de 5% a 12% — a 5% un seul mot anglais sur 20 declenchait la suppression
          if (englishRatio > 0.12 && totalWords > 5) {
            const escapedPara = para.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cleanedHtml = cleanedHtml.replace(new RegExp(escapedPara, 'gi'), '');
            removedCount++;
            console.log(`   🗑️ Paragraphe anglais supprimé (ratio: ${(englishRatio * 100).toFixed(1)}%): "${text.substring(0, 50)}..."`);
          }
        }
      });
      
      // Supprimer aussi les patterns anglais spécifiques
      englishPatterns.forEach(pattern => {
        const matches = cleanedHtml.match(new RegExp(pattern.source, 'gi'));
        if (matches) {
          matches.forEach(match => {
            const contextMatch = cleanedHtml.match(new RegExp(`<[^>]*>.*?${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?<\/[^>]+>`, 'gi'));
            if (contextMatch) {
              cleanedHtml = cleanedHtml.replace(contextMatch[0], '');
              removedCount++;
            }
          });
        }
      });
    }
  }
  
  // Recalculer ratio final (avec mêmes exclusions)
  let finalText = cleanedHtml.replace(/<[^>]+>/g, ' ');
  finalText = finalText.replace(/https?:\/\/[^\s]+/gi, '');
  finalText = finalText.replace(/[^\s]+@[^\s]+/gi, '');
  // AMÉLIORATION: Exclure codes aéroports (PAR, SGN, KUL, ORI, etc.)
  finalText = finalText.replace(/\b[A-Z]{2,4}\b/g, '');
  
  const finalEnglishWords = (finalText.match(englishWords) || []).length;
  const finalWords = finalText.split(/\s+/).filter(w => w.length > 2).length;
  const finalEnglishRatio = finalWords > 0 ? finalEnglishWords / finalWords : 0;
  
  // Seuil bloquant à 5% ; entre 0.2% et 5% = warning (résidus traduction / noms propres)
  const ratioPct = finalEnglishRatio * 100;
  if (finalEnglishRatio > 0.05) {
    report.checks.push({
      name: 'english_content',
      status: 'fail',
      details: `ratio=${ratioPct.toFixed(2)}% traduits=${translatedCount} supprimés=${removedCount}`
    });
    report.issues.push({
      code: 'ENGLISH_CONTENT_DETECTED',
      severity: 'error',
      message: `Contenu anglais détecté: ${ratioPct.toFixed(2)}%`,
      evidence: { ratio: finalEnglishRatio, matches: englishMatches.length }
    });
  } else if (finalEnglishRatio > 0.002) {
    report.checks.push({
      name: 'english_content',
      status: 'warn',
      details: `ratio=${ratioPct.toFixed(2)}% (résidus) traduits=${translatedCount} supprimés=${removedCount}`
    });
    report.issues.push({
      code: 'ENGLISH_CONTENT_RESIDUAL',
      severity: 'low',
      message: `Résidus anglais: ${ratioPct.toFixed(2)}% (non bloquant)`,
      evidence: { ratio: finalEnglishRatio }
    });
  } else {
    report.checks.push({
      name: 'english_content',
      status: 'pass',
      details: `ratio=${ratioPct.toFixed(2)}% traduits=${translatedCount} supprimés=${removedCount}`
    });
  }
  
  if (translatedCount > 0 || removedCount > 0) {
    report.actions.push({
      type: 'translated_or_removed_english',
      details: `translated=${translatedCount} removed=${removedCount}`
    });
  }
  
  console.log(`✅ Contenu anglais: ${englishMatches.length} détecté(s), ${translatedCount} traduit(s), ${removedCount} supprimé(s)`);
  return cleanedHtml;
}

/**
 * Applique les contraintes de rendu NEWS (format court/factuel).
 */

export async function forceTranslateRecommendationsSection(html, report) {
  console.log('🌐 Traduction forcée section "Nos recommandations"...');
  
  const recommendationsMatch = html.match(/(<h2[^>]*>Nos recommandations[^<]*<\/h2>[\s\S]*?)(?=<h2[^>]*>|$)/i);
  if (!recommendationsMatch) {
    return html;
  }
  
  const recommendationsSection = recommendationsMatch[1];
  const textContent = recommendationsSection.replace(/<[^>]+>/g, ' ').trim();
  
  // Détection améliorée : patterns anglais complets
  const englishPatterns = /(Option \d+:|#\d+|Prepare your documents|Stay calm|Use reliable services|Realistic budget:|Advantages?:|Disadvantages?:|can be|Compare prices|Learn more|Check|Book|Find|Get|Search|Select|Choose|Available|Required|Needed|Important|Remember|Note|Tip|Warning)/i;
  const hasEnglishPatterns = englishPatterns.test(recommendationsSection);
  
  // Calcul ratio de mots anglais (seuil abaissé à 20%)
  const ENGLISH_WORDS_REGEX = /\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|just|prepare|stay|use|reliable|services|documents|calm|check|book|available|required|needed|important|remember|note|tip|warning|realistic|budget|advantages|disadvantages|compare|prices|learn|more|option)\b/gi;
  const englishWords = (textContent.match(ENGLISH_WORDS_REGEX) || []).length;
  const totalWords = textContent.split(/\s+/).filter(w => w.length > 0).length;
  const englishRatio = totalWords > 0 ? englishWords / totalWords : 0;
  
  if (hasEnglishPatterns || englishRatio > 0.20) {
    console.log(`   📝 Section "Nos recommandations" avec ${Math.round(englishRatio * 100)}% de mots anglais détectés, traduction...`);
    
    if (!FORCE_OFFLINE && this.intelligentContentAnalyzer) {
      try {
        const translated = await this.intelligentContentAnalyzer.translateToFrench(recommendationsSection);
        if (translated && translated.trim().length > 10) {
          const escapedSection = recommendationsSection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const newHtml = html.replace(new RegExp(escapedSection, 'g'), translated);
          report.actions.push({ 
            type: 'translated_recommendations_section', 
            details: `english_ratio=${Math.round(englishRatio * 100)}%` 
          });
          report.checks.push({
            name: 'recommendations_translation',
            status: 'pass',
            details: `Section traduite (${Math.round(englishRatio * 100)}% EN détecté)`
          });
          console.log(`   ✅ Section "Nos recommandations" traduite`);
          return newHtml;
        }
      } catch (error) {
        console.error(`   ❌ Erreur traduction section recommandations: ${error.message}`);
        report.checks.push({
          name: 'recommendations_translation',
          status: 'warn',
          details: `Erreur traduction: ${error.message}`
        });
      }
    } else {
      console.warn('   ⚠️ Traduction désactivée (FORCE_OFFLINE ou pas de intelligentContentAnalyzer)');
      report.checks.push({
        name: 'recommendations_translation',
        status: 'warn',
        details: 'Traduction désactivée'
      });
    }
  } else {
    report.checks.push({
      name: 'recommendations_translation',
      status: 'pass',
      details: 'Section déjà en français'
    });
  }
  
  return html;
}

/**
 * Remplace les placeholders de liens d'affiliation par de vrais liens (correction audit)
 * @param {string} html - HTML à traiter
 * @param {Object} pipelineContext - Contexte du pipeline
 * @param {Object} report - Rapport QA
 * @returns {string} HTML avec placeholders remplacés
 */

export async function forceTranslateCitationsInLists(html, report) {
  console.log('🌐 Traduction forcée citations dans les listes...');
  
  if (FORCE_OFFLINE || !this.intelligentContentAnalyzer) {
    report.checks.push({
      name: 'citations_in_lists_translation',
      status: 'warn',
      details: 'Traduction désactivée (FORCE_OFFLINE ou pas de intelligentContentAnalyzer)'
    });
    return html;
  }
  
  const ENGLISH_WORDS_REGEX = /\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|just|I|you|he|she|it|we|they|don't|I'm|basically|from)\b/gi;
  
  let modifiedHtml = html;
  let translationCount = 0;
  
  // Extraire toutes les <li> contenant des citations
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  const lisToTranslate = [];
  
  while ((liMatch = liPattern.exec(html)) !== null) {
    const liContent = liMatch[1];
    const fullLi = liMatch[0];
    
    // Détecter les citations (guillemets français « ... » ou anglais "...")
    const citationPattern = /(«[^»]*»|"[^"]*"|'[^']*')/g;
    const citations = liContent.match(citationPattern);
    
    if (citations && citations.length > 0) {
      for (const citation of citations) {
        const citationText = citation.replace(/[«»""'']/g, '').trim();
        // SKIP: ne pas traduire les URLs (elles matchent le pattern anglais mais ne sont pas des citations)
        if (/^https?:\/\//i.test(citationText) || /\.(com|org|net|io|fr)\b/i.test(citationText)) {
          continue;
        }
        if (citationText.length >= 10 && /[a-zA-Z]{3,}/.test(citationText)) {
          const englishWords = (citationText.match(ENGLISH_WORDS_REGEX) || []).length;
          const totalWords = citationText.split(/\s+/).filter(w => w.length > 0).length;
          const ratio = totalWords > 0 ? englishWords / totalWords : 0;
          
          // Seuil abaissé à 20% pour les citations dans les listes
          if (ratio > 0.20) {
            lisToTranslate.push({
              fullLi,
              citation,
              citationText,
              ratio,
              index: liMatch.index
            });
          }
        }
      }
    }
  }
  
  if (lisToTranslate.length === 0) {
    report.checks.push({
      name: 'citations_in_lists_translation',
      status: 'pass',
      details: 'Aucune citation anglaise détectée dans les listes'
    });
    return html;
  }
  
  console.log(`   📝 ${lisToTranslate.length} citation(s) anglaise(s) détectée(s) dans les listes, traduction...`);
  
  // Traduire les citations (traiter en ordre inverse pour préserver les indices)
  for (let i = lisToTranslate.length - 1; i >= 0; i--) {
    const item = lisToTranslate[i];
    try {
      const translated = await this.intelligentContentAnalyzer.translateToFrench(item.citationText);
      if (translated && translated.trim().length > 10) {
        // Remplacer la citation dans le <li>
        const originalCitation = item.citation;
        const newCitation = originalCitation.includes('«') 
          ? `«${translated.trim()}»`
          : originalCitation.includes('"')
          ? `"${translated.trim()}"`
          : `'${translated.trim()}'`;
        
        // Remplacer dans le HTML
        const beforeLi = modifiedHtml.substring(0, item.index);
        const afterLi = modifiedHtml.substring(item.index + item.fullLi.length);
        const updatedLi = item.fullLi.replace(originalCitation, newCitation);
        modifiedHtml = beforeLi + updatedLi + afterLi;
        
        translationCount++;
        console.log(`   ✅ Citation traduite: "${item.citationText.substring(0, 50)}..." → "${translated.substring(0, 50)}..."`);
      }
    } catch (error) {
      console.error(`   ❌ Erreur traduction citation: ${error.message}`);
    }
  }
  
  if (translationCount > 0) {
    report.actions.push({
      type: 'translated_citations_in_lists',
      details: `count=${translationCount}`
    });
    report.checks.push({
      name: 'citations_in_lists_translation',
      status: 'pass',
      details: `${translationCount} citation(s) traduite(s)`
    });
    console.log(`   ✅ ${translationCount} citation(s) traduite(s) dans les listes`);
  } else {
    report.checks.push({
      name: 'citations_in_lists_translation',
      status: 'warn',
      details: 'Aucune traduction effectuée'
    });
  }
  
  return modifiedHtml;
}

/**
 * Découpe les listes trop longues
 * @param {string} html - HTML à valider
 * @param {Object} report - Rapport QA
 * @returns {string} HTML corrigé
 */

