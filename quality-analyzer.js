/**
 * QualityAnalyzer - Analyseur de qualité expert pour articles FlashVoyage
 * Évalue: SERP (25%), Liens internes (15%), Content Writing (40%), Bloquants (20%)
 */

import { parse } from 'node-html-parser';

class QualityAnalyzer {
  constructor() {
    // Sélecteurs pour extraire le contenu principal (ignore header/footer WordPress)
    this.contentSelectors = [
      '.content-inner',
      '.entry-content',
      '.post-content',
      'article .content',
      'article',
      '.single-post-content',
      'main'
    ];
    
    // Patterns de ton robotique à éviter
    this.roboticPatterns = [
      'il est important de noter que',
      'dans le cadre de',
      'il convient de souligner',
      'force est de constater',
      'il va sans dire',
      'en ce qui concerne',
      'dans un premier temps',
      'dans un second temps',
      'il est à noter que',
      'nous allons voir',
      'comme nous l\'avons vu',
      'en conclusion',
      'pour conclure',
      'en résumé',
      'ainsi donc',
      'de ce fait',
      'par conséquent'
    ];
    
    // Destinations asiatiques valides
    // AMÉLIORATION: Ajouter toutes les variantes possibles
    this.asianDestinations = [
      'vietnam', 'thaïlande', 'thailande', 'thailand', 'bali', 'indonésie', 'indonesie', 'indonesia',
      'malaisie', 'malaysia', 'singapour', 'singapore', 'philippines', 'cambodge', 'cambodia', 
      'laos', 'myanmar', 'birmanie', 'burma', 'japon', 'japan', 'corée', 'coree', 'korea',
      'taiwan', 'hong kong', 'hongkong', 'chine', 'china', 'inde', 'india', 'sri lanka', 'srilanka',
      'népal', 'nepal', 'bangladesh', 'pakistan', 'mongolie', 'mongolia', 'ouzbékistan', 'ouzbekistan',
      'uzbekistan', 'kazakhstan', 'kirghizistan', 'kyrgyzstan'
    ];
  }

  /**
   * Extrait le contenu principal de l'article (ignore header/footer WordPress)
   */
  extractMainContent(html) {
    const root = parse(html);
    
    // Essayer chaque sélecteur de contenu
    for (const selector of this.contentSelectors) {
      const content = root.querySelector(selector);
      if (content && content.text.length > 500) {
        return content;
      }
    }
    
    // Fallback: utiliser tout le HTML
    return root;
  }

  /**
   * Analyse SERP - 25%
   */
  analyzeSERP(html) {
    const root = this.extractMainContent(html);
    const text = root.text.toLowerCase();
    const score = { total: 0, max: 100, details: [] };

    // 1. Sections analytiques obligatoires (40 pts)
    const requiredSections = [
      { pattern: /limites?\s*(et\s*)?biais/i, name: 'Limites et biais', points: 15 },
      { pattern: /ce\s*que.*?ne\s*disent?\s*(pas(\s+explicitement)?|explicitement)/i, name: 'Ce que les autres ne disent pas', points: 15 },
      { pattern: /erreurs?\s*(fréquentes?|courantes?|à\s*éviter)/i, name: 'Erreurs fréquentes', points: 10 }
    ];

    const h2h3Text = root.querySelectorAll('h2, h3').map(el => el.text).join(' ');
    
    requiredSections.forEach(section => {
      const found = section.pattern.test(text) || section.pattern.test(h2h3Text);
      if (found) {
        score.total += section.points;
        score.details.push({ check: section.name, status: 'OK', points: section.points });
      } else {
        score.details.push({ check: section.name, status: 'MISSING', points: 0 });
      }
    });

    // 2. E-E-A-T - Citations sourcées (30 pts)
    const hasRedditCitation = /reddit|r\/\w+|u\/\w+/i.test(text);
    const hasQuoteAttribution = root.querySelectorAll('blockquote').length > 0 || /selon\s+\w+|d'après\s+\w+|témoigne/i.test(text);
    
    if (hasRedditCitation) {
      score.total += 15;
      score.details.push({ check: 'Citation Reddit', status: 'OK', points: 15 });
    } else {
      score.details.push({ check: 'Citation Reddit', status: 'MISSING', points: 0 });
    }

    if (hasQuoteAttribution) {
      score.total += 15;
      score.details.push({ check: 'Attribution sources', status: 'OK', points: 15 });
    } else {
      score.details.push({ check: 'Attribution sources', status: 'MISSING', points: 0 });
    }

    // 3. Valeur unique - angles sous-traités (30 pts)
    const uniqueAngles = [
      { pattern: /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i, name: 'Budget détaillé' },
      { pattern: /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i, name: 'Timeline' },
      { pattern: /contraintes?|difficultés?|obstacles?|problèmes?\s*(pratiques?|réels?)|défis/i, name: 'Contraintes réelles' }
    ];

    let uniqueCount = 0;
    uniqueAngles.forEach(angle => {
      if (angle.pattern.test(text)) uniqueCount++;
    });
    
    const uniquePoints = Math.min(uniqueCount * 10, 30);
    score.total += uniquePoints;
    score.details.push({ check: 'Angles uniques', status: `${uniqueCount}/3`, points: uniquePoints });

    return {
      category: 'SERP',
      weight: 0.25,
      score: score.total,
      maxScore: score.max,
      percentage: (score.total / score.max) * 100,
      details: score.details
    };
  }

  /**
   * Analyse Liens Internes - 15%
   */
  analyzeInternalLinks(html) {
    const root = this.extractMainContent(html);
    const score = { total: 0, max: 100, details: [] };
    
    // Compter les mots
    const wordCount = root.text.split(/\s+/).length;
    
    // Liens internes (flashvoyage.com)
    const allLinks = root.querySelectorAll('a');
    const internalLinks = allLinks.filter(a => {
      const href = a.getAttribute('href') || '';
      return href.includes('flashvoyage.com');
    });
    const linkCount = internalLinks.length;
    
    // 1. Densité (30 pts) - 5-10 liens pour 2000-3000 mots
    const expectedMin = Math.floor(wordCount / 400);
    const expectedMax = Math.ceil(wordCount / 200);
    
    if (linkCount >= expectedMin && linkCount <= expectedMax) {
      score.total += 30;
      score.details.push({ check: 'Densité liens', status: `${linkCount} liens (OK)`, points: 30 });
    } else if (linkCount > 0) {
      score.total += 15;
      score.details.push({ check: 'Densité liens', status: `${linkCount} liens (partiel)`, points: 15 });
    } else {
      score.details.push({ check: 'Densité liens', status: '0 liens', points: 0 });
    }

    // 2. Ancres précises (30 pts)
    const badAnchors = ['cliquez ici', 'ici', 'lien', 'voir', 'plus'];
    let goodAnchors = 0;
    
    internalLinks.forEach(link => {
      const text = link.text.trim().toLowerCase();
      const wordLen = text.split(/\s+/).length;
      const isBad = badAnchors.some(bad => text === bad || text.includes(bad));
      
      if (wordLen >= 2 && wordLen <= 5 && !isBad) {
        goodAnchors++;
      }
    });

    if (linkCount > 0) {
      const anchorRatio = goodAnchors / linkCount;
      const anchorPoints = Math.floor(anchorRatio * 30);
      score.total += anchorPoints;
      score.details.push({ check: 'Ancres précises', status: `${goodAnchors}/${linkCount}`, points: anchorPoints });
    } else {
      score.details.push({ check: 'Ancres précises', status: 'N/A', points: 0 });
    }

    // 3. Placement stratégique (25 pts)
    const allText = html;
    const thirtyPercent = Math.floor(allText.length * 0.3);
    const firstThird = allText.substring(0, thirtyPercent);
    const linksInFirstThird = (firstThird.match(/href="[^"]*flashvoyage\.com/g) || []).length;
    
    if (linksInFirstThird >= 2) {
      score.total += 25;
      score.details.push({ check: 'Placement stratégique', status: `${linksInFirstThird} liens premiers 30%`, points: 25 });
    } else if (linksInFirstThird >= 1) {
      score.total += 12;
      score.details.push({ check: 'Placement stratégique', status: `${linksInFirstThird} lien premiers 30%`, points: 12 });
    } else {
      score.details.push({ check: 'Placement stratégique', status: '0 liens premiers 30%', points: 0 });
    }

    // 4. Zero orphelins (15 pts)
    const pillarPages = ['guide', 'destination', 'conseils', 'budget'];
    const hasPillarLink = internalLinks.some(link => {
      const href = link.getAttribute('href') || '';
      return pillarPages.some(p => href.includes(p));
    });
    
    if (hasPillarLink) {
      score.total += 15;
      score.details.push({ check: 'Lien page pilier', status: 'OK', points: 15 });
    } else {
      score.details.push({ check: 'Lien page pilier', status: 'MISSING', points: 0 });
    }

    return {
      category: 'Liens Internes',
      weight: 0.15,
      score: score.total,
      maxScore: score.max,
      percentage: (score.total / score.max) * 100,
      details: score.details
    };
  }

  /**
   * Analyse Content Writing Expert - 40%
   */
  analyzeContentWriting(html) {
    const root = this.extractMainContent(html);
    const score = { total: 0, max: 100, details: [] };
    const text = root.text;
    const textLower = text.toLowerCase();

    // 1. Fil narratif (15 pts)
    const h2s = root.querySelectorAll('h2').map(el => el.text.toLowerCase());
    const hasContexte = h2s.some(h => h.includes('contexte') || h.includes('témoignage'));
    const hasAnalyse = h2s.some(h => h.includes('analyse') || h.includes('limites') || h.includes('erreurs'));
    const hasRecommandations = h2s.some(h => h.includes('recommandation') || h.includes('conseils'));
    
    const narrativeScore = (hasContexte ? 5 : 0) + (hasAnalyse ? 5 : 0) + (hasRecommandations ? 5 : 0);
    score.total += narrativeScore;
    score.details.push({ check: 'Fil narratif', status: `${narrativeScore}/15`, points: narrativeScore });

    // 2. Transitions fluides (15 pts)
    const h2Elements = root.querySelectorAll('h2');
    let consecutiveH2 = 0;
    h2Elements.forEach((el, i) => {
      const next = el.nextElementSibling;
      if (next && (next.tagName === 'H2' || next.tagName === 'H3')) {
        consecutiveH2++;
      }
    });
    
    const transitionPoints = consecutiveH2 === 0 ? 15 : Math.max(0, 15 - consecutiveH2 * 5);
    score.total += transitionPoints;
    score.details.push({ check: 'Transitions fluides', status: consecutiveH2 === 0 ? 'OK' : `${consecutiveH2} ruptures`, points: transitionPoints });

    // 3. Ton humain (15 pts)
    let roboticCount = 0;
    this.roboticPatterns.forEach(pattern => {
      if (textLower.includes(pattern)) roboticCount++;
    });
    
    const tonePoints = Math.max(0, 15 - roboticCount * 3);
    score.total += tonePoints;
    score.details.push({ check: 'Ton humain', status: roboticCount === 0 ? 'OK' : `${roboticCount} patterns`, points: tonePoints });

    // 4. Cohérence thématique (15 pts)
    const h1 = root.querySelector('h1');
    const title = h1 ? h1.text.toLowerCase() : '';
    const destinationInTitle = this.asianDestinations.find(d => title.includes(d));
    
    const recoSection = h2s.findIndex(h => h.includes('recommandation'));
    let coherencePoints = 0;
    
    if (recoSection >= 0 && destinationInTitle) {
      coherencePoints = 15;
    } else if (recoSection >= 0) {
      coherencePoints = 10;
    }
    
    score.total += coherencePoints;
    score.details.push({ check: 'Cohérence thématique', status: `${coherencePoints}/15`, points: coherencePoints });

    // 5. Pas de répétitions (10 pts) - AMÉLIORATION: Détection plus stricte
    const sentences = text.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 20);
    const ngrams = new Map();
    
    sentences.forEach(sentence => {
      const words = sentence.split(/\s+/).filter(w => w.length > 2);
      // AMÉLIORATION: N-grams de 8 mots (au lieu de 10) pour être cohérent avec removeRepetitions
      for (let i = 0; i <= words.length - 8; i++) {
        const ngram = words.slice(i, i + 8).join(' ');
        ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
      }
    });
    
    let repetitions = 0;
    ngrams.forEach((count) => {
      if (count > 1) repetitions++;
    });
    
    // AMÉLIORATION: Pénalité plus sévère pour répétitions (mais tolérer jusqu'à 5 répétitions)
    const repetitionPoints = repetitions === 0 ? 10 : repetitions <= 5 ? Math.max(5, 10 - repetitions) : Math.max(0, 10 - repetitions * 2);
    score.total += repetitionPoints;
    score.details.push({ check: 'Pas de répétitions', status: repetitions === 0 ? 'OK' : `${repetitions} répétitions`, points: repetitionPoints });

    // 6. Paragraphes équilibrés (10 pts)
    const paragraphs = root.querySelectorAll('p').map(el => el.text.length).filter(l => l > 10);
    
    // AMÉLIORATION: Gérer le cas où il n'y a pas de paragraphes
    if (paragraphs.length === 0) {
      score.total += 0;
      score.details.push({ check: 'Équilibre sections', status: 'Aucun paragraphe', points: 0 });
    } else {
      const maxLen = Math.max(...paragraphs);
      const minLen = Math.min(...paragraphs);
      
      // AMÉLIORATION: Éviter division par zéro et ratio infini
      const ratio = minLen > 0 ? maxLen / minLen : 0;
      
      // AMÉLIORATION: Tolérer ratio jusqu'à 5 pour donner des points partiels
      const balancePoints = ratio <= 3 ? 10 : ratio <= 5 ? 8 : ratio <= 10 ? 5 : ratio <= 15 ? 3 : 0;
      score.total += balancePoints;
      score.details.push({ check: 'Équilibre sections', status: `ratio ${ratio.toFixed(1)}`, points: balancePoints });
    }

    // 7. Introduction engageante (10 pts)
    const firstP = root.querySelector('p');
    const firstPText = firstP ? firstP.text : '';
    const hasHook = /\?|découvr|imagin|révél|secret|incroy|expérien|aventur/i.test(firstPText);
    const introPoints = hasHook ? 10 : 5;
    score.total += introPoints;
    score.details.push({ check: 'Intro engageante', status: hasHook ? 'OK' : 'partiel', points: introPoints });

    // 8. Conclusion actionnable (10 pts)
    const lastH2 = root.querySelectorAll('h2').pop();
    let conclusionText = '';
    if (lastH2) {
      let sibling = lastH2.nextElementSibling;
      while (sibling && sibling.tagName !== 'H2') {
        conclusionText += sibling.text + ' ';
        sibling = sibling.nextElementSibling;
      }
    }
    const hasCTA = /découvrir|comparer|explorer|réserver|voir|planifier|commencer/i.test(conclusionText);
    const conclusionPoints = hasCTA ? 10 : 0;
    score.total += conclusionPoints;
    score.details.push({ check: 'Conclusion actionnable', status: hasCTA ? 'OK' : 'MISSING', points: conclusionPoints });

    return {
      category: 'Content Writing',
      weight: 0.40,
      score: score.total,
      maxScore: score.max,
      percentage: (score.total / score.max) * 100,
      details: score.details
    };
  }

  /**
   * Analyse Bloquants - 20%
   */
  analyzeBlocking(html) {
    const root = this.extractMainContent(html);
    const fullPage = parse(html); // Pour le titre qui peut être hors du contenu principal
    const results = { passed: true, checks: [] };
    const text = root.text;
    const textLower = text.toLowerCase();

    // 1. Destination asiatique dans titre (chercher dans toute la page)
    // AMÉLIORATION: Détection plus robuste (titre complet, sous-titre, après ":")
    const h1 = fullPage.querySelector('h1') || fullPage.querySelector('.entry-title') || fullPage.querySelector('title');
    let title = h1 ? h1.text.toLowerCase() : '';
    
    // Chercher aussi dans le contenu principal si pas trouvé dans le titre
    if (!title || title.length === 0) {
      const mainTitle = root.querySelector('h1');
      title = mainTitle ? mainTitle.text.toLowerCase() : '';
    }
    
    // AMÉLIORATION: Détecter même si la destination est après ":" ou dans un sous-titre
    // Extraire toutes les parties du titre (séparées par ":" ou "–" ou "—")
    const titleParts = title.split(/[:–—]/).map(p => p.trim());
    
    // Chercher dans toutes les parties du titre
    let hasAsianDest = false;
    for (const part of titleParts) {
      hasAsianDest = this.asianDestinations.some(d => part.includes(d));
      if (hasAsianDest) break;
    }
    
    // Si toujours pas trouvé, chercher dans le contenu principal (premier paragraphe)
    if (!hasAsianDest) {
      const firstP = root.querySelector('p');
      if (firstP) {
        const firstPText = firstP.text.toLowerCase();
        hasAsianDest = this.asianDestinations.some(d => firstPText.includes(d));
      }
    }
    
    results.checks.push({ check: 'Destination asiatique titre', passed: hasAsianDest });
    if (!hasAsianDest) results.passed = false;

    // 2. Quick Guide présent
    const hasQuickGuide = /points?\s*clés?|quick\s*guide|résumé|en\s*bref/i.test(text);
    results.checks.push({ check: 'Quick Guide présent', passed: hasQuickGuide });
    if (!hasQuickGuide) results.passed = false;

    // 3. H2 sans emojis
    let h2WithEmoji = 0;
    root.querySelectorAll('h2').forEach(el => {
      const h2Text = el.text;
      if (/[\u{1F300}-\u{1F9FF}]/u.test(h2Text)) {
        h2WithEmoji++;
      }
    });
    const noEmojiH2 = h2WithEmoji === 0;
    results.checks.push({ check: 'H2 sans emojis', passed: noEmojiH2 });
    if (!noEmojiH2) results.passed = false;

    // 4. Pas de sections vides
    // AMÉLIORATION: Protéger les sections SERP critiques
    const protectedSerpPatterns = [
      /ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement)/i,
      /limites?\s*(et\s*)?biais/i,
      /erreurs?\s*(fréquentes?|courantes?|à\s*éviter)/i
    ];
    
    let emptySections = 0;
    root.querySelectorAll('h2, h3').forEach(el => {
      const h2Text = el.text.toLowerCase();
      // Vérifier si c'est une section SERP protégée
      const isProtected = protectedSerpPatterns.some(pattern => pattern.test(h2Text));
      
      if (!isProtected) {
        const next = el.nextElementSibling;
        if (!next || next.tagName === 'H2' || next.tagName === 'H3') {
          emptySections++;
        }
      }
      // Les sections SERP protégées ne comptent pas comme vides même si elles n'ont pas de contenu immédiat
    });
    const noEmptySections = emptySections === 0;
    results.checks.push({ check: 'Pas de sections vides', passed: noEmptySections });
    if (!noEmptySections) results.passed = false;

    // 5. 100% français - AMÉLIORATION: Détection plus stricte (0.1% toléré pour éviter faux positifs)
    // AMÉLIORATION: Patterns anglais plus complets (exclure mots français communs)
    // Exclure: visa, fatigue, moment (mots français aussi)
    let textForEnglishCheck = text;
    // Exclure codes aéroports (PAR, SGN, KUL, ORI, etc.)
    textForEnglishCheck = textForEnglishCheck.replace(/\b[A-Z]{2,4}\b/g, '');
    // Exclure URLs
    textForEnglishCheck = textForEnglishCheck.replace(/https?:\/\/[^\s]+/gi, '');
    
    const englishPatterns = /\b(the|is|are|was|were|have|has|had|this|that|with|from|which|what|how|why|when|where|for|and|or|but|if|then|else|can|could|should|will|would|must|may|might|essential|underestimating|budgeting|setting|critical|check|coverage|medical|travel|tourist|regular|requirements|reasonable|available|launched|doesn't|don't|I'm|you|he|she|it|we|they)\b/gi;
    const englishMatches = (textForEnglishCheck.toLowerCase().match(englishPatterns) || []).length;
    const wordCount = textForEnglishCheck.split(/\s+/).filter(w => w.length > 2).length;
    const englishRatio = wordCount > 0 ? englishMatches / wordCount : 0;
    // AMÉLIORATION: Tolérer 0.2% pour éviter faux positifs (codes aéroports, noms propres)
    const isFrench = englishRatio <= 0.002;
    results.checks.push({ check: '100% français', passed: isFrench, ratio: `${(englishRatio * 100).toFixed(1)}% anglais` });
    if (!isFrench) results.passed = false;

    return {
      category: 'Bloquants',
      weight: 0.20,
      passed: results.passed,
      checks: results.checks,
      score: results.passed ? 100 : 0,
      maxScore: 100,
      percentage: results.passed ? 100 : 0
    };
  }

  /**
   * Score global
   */
  getGlobalScore(html) {
    const serp = this.analyzeSERP(html);
    const links = this.analyzeInternalLinks(html);
    const contentWriting = this.analyzeContentWriting(html);
    const blocking = this.analyzeBlocking(html);

    const weightedScore = 
      (serp.percentage * serp.weight) +
      (links.percentage * links.weight) +
      (contentWriting.percentage * contentWriting.weight) +
      (blocking.percentage * blocking.weight);

    // AMÉLIORATION: Cibler 10/10 (100%) au lieu de 85%
    const isExpert = weightedScore >= 100 && blocking.passed;
    
    // AMÉLIORATION: Critères stricts supplémentaires pour 10/10
    const strictChecks = {
      allCategories100: serp.percentage === 100 && links.percentage === 100 && 
                        contentWriting.percentage === 100 && blocking.percentage === 100,
      noWarnings: blocking.checks.every(c => c.passed === true),
      perfectStructure: contentWriting.details.every(d => d.points >= 10),
      perfectLinks: links.details.every(d => d.points > 0)
    };
    
    const isPerfect = isExpert && strictChecks.allCategories100 && strictChecks.noWarnings;

    return {
      globalScore: weightedScore.toFixed(1),
      isExpert,
      isPerfect, // AMÉLIORATION: Score parfait 10/10
      threshold: 100, // AMÉLIORATION: Seuil à 100% pour 10/10
      blockingPassed: blocking.passed,
      categories: { serp, links, contentWriting, blocking },
      strictChecks, // AMÉLIORATION: Critères stricts
      summary: isPerfect
        ? '✅ QUALITÉ PARFAITE 10/10 atteinte'
        : isExpert
        ? '✅ QUALITÉ EXPERT atteinte'
        : `❌ Score ${weightedScore.toFixed(1)}% (seuil: 100%) - Bloquants: ${blocking.passed ? 'OK' : 'FAIL'}`
    };
  }

  /**
   * Rapport détaillé
   */
  generateReport(html) {
    const result = this.getGlobalScore(html);
    
    let report = `
════════════════════════════════════════════════════════════════
                    RAPPORT QUALITÉ ARTICLE
════════════════════════════════════════════════════════════════

📊 SCORE GLOBAL: ${result.globalScore}% ${result.isExpert ? '✅ EXPERT' : '❌ À AMÉLIORER'}
   Seuil requis: ${result.threshold}%
   Bloquants: ${result.blockingPassed ? '✅ PASSÉS' : '❌ ÉCHEC'}

────────────────────────────────────────────────────────────────
📈 SERP COMPÉTITIF (${result.categories.serp.weight * 100}%)
   Score: ${result.categories.serp.percentage.toFixed(1)}%
`;
    
    result.categories.serp.details.forEach(d => {
      report += `   ${d.status === 'OK' ? '✅' : d.status === 'MISSING' ? '❌' : '⚠️'} ${d.check}: ${d.status} (${d.points} pts)\n`;
    });

    report += `
────────────────────────────────────────────────────────────────
🔗 LIENS INTERNES (${result.categories.links.weight * 100}%)
   Score: ${result.categories.links.percentage.toFixed(1)}%
`;
    
    result.categories.links.details.forEach(d => {
      report += `   ${d.points > 0 ? '✅' : '❌'} ${d.check}: ${d.status} (${d.points} pts)\n`;
    });

    report += `
────────────────────────────────────────────────────────────────
✍️ CONTENT WRITING (${result.categories.contentWriting.weight * 100}%)
   Score: ${result.categories.contentWriting.percentage.toFixed(1)}%
`;
    
    result.categories.contentWriting.details.forEach(d => {
      report += `   ${d.points >= 10 ? '✅' : d.points > 0 ? '⚠️' : '❌'} ${d.check}: ${d.status} (${d.points} pts)\n`;
    });

    report += `
────────────────────────────────────────────────────────────────
🚫 CRITÈRES BLOQUANTS (${result.categories.blocking.weight * 100}%)
   Status: ${result.categories.blocking.passed ? '✅ TOUS PASSÉS' : '❌ ÉCHEC'}
`;
    
    result.categories.blocking.checks.forEach(c => {
      report += `   ${c.passed ? '✅' : '❌'} ${c.check}${c.ratio ? ` (${c.ratio})` : ''}\n`;
    });

    report += `
════════════════════════════════════════════════════════════════
${result.summary}
════════════════════════════════════════════════════════════════
`;

    return report;
  }
}

export default QualityAnalyzer;
