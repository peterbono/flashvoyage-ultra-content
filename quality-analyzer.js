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
      'uzbekistan', 'kazakhstan', 'kirghizistan', 'kyrgyzstan',
      'tokyo', 'kyoto', 'osaka', 'bangkok', 'chiang mai', 'phuket', 'hanoi', 'ho chi minh',
      'saigon', 'kuala lumpur', 'penang', 'phnom penh', 'siem reap', 'manila', 'cebu',
      'seoul', 'busan', 'denpasar', 'jakarta', 'katmandou', 'kathmandu', 'colombo',
      // Formulations régionales (évite les faux négatifs "Asie du Sud-Est")
      'asie', 'asie du sud-est', 'asie du sud est', 'sud-est asiatique', 'sud est asiatique',
      'southeast asia', 'south east asia',
      'mumbai', 'delhi', 'goa', 'pékin', 'shanghai', 'luang prabang', 'vientiane'
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
   * En mode NEWS : les sections analytiques profondes sont facultatives (bonus, pas pénalisantes)
   * En mode EVERGREEN : grille complète avec sections obligatoires
   */
  analyzeSERP(html, editorialMode = 'evergreen') {
    const root = this.extractMainContent(html);
    const text = root.text.toLowerCase();
    const h2h3Text = root.querySelectorAll('h2, h3').map(el => el.text).join(' ');

    if (editorialMode === 'news') {
      // ─── MODE NEWS : scoring SERP renforcé ────────────────────────
      // Focus : impact concret + action + preuves + données
      const score = { total: 0, max: 100, details: [] };

      // 1. has_concrete_impact_block (25 pts)
      // H2 contenant "change"/"impact"/"concrètement" suivi d'une bullet list
      const h2Elements = root.querySelectorAll('h2');
      let hasImpactBlock = false;
      for (const h2 of h2Elements) {
        const h2Text = h2.text.toLowerCase();
        if (/change|impact|concr[eè]tement/.test(h2Text)) {
          const nextSibling = h2.nextElementSibling;
          if (nextSibling && (nextSibling.tagName === 'UL' || nextSibling.tagName === 'OL')) {
            hasImpactBlock = true;
            break;
          }
          // Check a bit further (next next sibling)
          const nextNext = nextSibling?.nextElementSibling;
          if (nextNext && (nextNext.tagName === 'UL' || nextNext.tagName === 'OL')) {
            hasImpactBlock = true;
            break;
          }
        }
      }
      if (hasImpactBlock) {
        score.total += 25;
        score.details.push({ check: 'Bloc impact concret (H2+list)', status: 'OK', points: 25 });
      } else {
        score.details.push({ check: 'Bloc impact concret (H2+list)', status: 'MISSING', points: 0 });
      }

      // 2. has_action_block (20 pts)
      // H2 contenant "faire"/"action"/"maintenant"/"si tu" suivi de contenu actionnable
      let hasActionBlock = false;
      for (const h2 of h2Elements) {
        const h2Text = h2.text.toLowerCase();
        if (/faire|action|maintenant|si\s*tu/.test(h2Text)) {
          hasActionBlock = true;
          break;
        }
      }
      if (hasActionBlock) {
        score.total += 20;
        score.details.push({ check: 'Bloc action (H2 faire/action)', status: 'OK', points: 20 });
      } else {
        score.details.push({ check: 'Bloc action (H2 faire/action)', status: 'MISSING', points: 0 });
      }

      // 3. has_source_proof (25 pts) - at least 1 inline citation with guillemets
      const citations = text.match(/\u00ab[\s\u00a0]*[^\u00bb]{5,200}[\s\u00a0]*\u00bb/g) || [];
      if (citations.length >= 1) {
        score.total += 25;
        score.details.push({ check: 'Preuve source (citation inline)', status: `OK (${citations.length})`, points: 25 });
      } else {
        score.details.push({ check: 'Preuve source (citation inline)', status: 'MISSING', points: 0 });
      }

      // 4. Données concrètes (15 pts) - montants, pourcentages, durées
      const hasConcreteData = /\d+\s*(€|euro|usd|\$|%|jour|mois|baht|roupie)/i.test(text);
      if (hasConcreteData) {
        score.total += 15;
        score.details.push({ check: 'Données concrètes', status: 'OK', points: 15 });
      } else {
        score.details.push({ check: 'Données concrètes', status: 'MISSING', points: 0 });
      }

      // 5. Attribution / E-E-A-T (15 pts)
      const hasQuoteAttribution = root.querySelectorAll('blockquote').length > 0 || /selon\s+\w+|d'après\s+\w+|témoigne|voyageur/i.test(text);
      if (hasQuoteAttribution) {
        score.total += 15;
        score.details.push({ check: 'Attribution sources', status: 'OK', points: 15 });
      } else {
        score.details.push({ check: 'Attribution sources', status: 'MISSING', points: 0 });
      }

      return {
        category: 'SERP (NEWS)',
        weight: 0.25,
        score: score.total,
        maxScore: score.max,
        percentage: (score.total / score.max) * 100,
        details: score.details
      };
    }

    // ─── MODE EVERGREEN : scoring SERP complet ──────────────────────
    const score = { total: 0, max: 100, details: [] };

    // 1. Sections analytiques obligatoires (40 pts)
    const requiredSections = [
      { pattern: /ce\s*que.*?ne\s*disent?\s*(pas(\s+explicitement)?|explicitement)/i, name: 'Ce que les autres ne disent pas', points: 20 },
      { pattern: /erreurs?\s*(fréquentes?|courantes?|à\s*éviter)/i, name: 'Erreurs fréquentes', points: 20 }
    ];

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
   * En mode NEWS : attentes réduites (2-4 liens suffisent pour un article court)
   * En mode EVERGREEN : scoring complet (5-10 liens pour 2000-3000 mots)
   */
  analyzeInternalLinks(html, editorialMode = 'evergreen') {
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
    
    // 1. Densité (30 pts)
    // Seuils réalistes : minimum 3 liens internes pour tout article evergreen
    // Scaling progressif avec la taille (1 lien / 600 mots au-delà de 3)
    const expectedMin = editorialMode === 'news' ? 1 : Math.max(3, Math.floor(wordCount / 600));
    const expectedMax = editorialMode === 'news' ? 5 : Math.ceil(wordCount / 200);
    
    if (linkCount >= expectedMin && linkCount <= expectedMax) {
      score.total += 30;
      score.details.push({ check: 'Densité liens', status: `${linkCount} liens (OK, min ${expectedMin})`, points: 30 });
    } else if (linkCount >= 3) {
      score.total += 22;
      score.details.push({ check: 'Densité liens', status: `${linkCount} liens (acceptable, min ${expectedMin})`, points: 22 });
    } else if (linkCount > 0) {
      score.total += 15;
      score.details.push({ check: 'Densité liens', status: `${linkCount} liens (partiel, min ${expectedMin})`, points: 15 });
    } else {
      score.details.push({ check: 'Densité liens', status: '0 liens', points: 0 });
    }

    // 2. Ancres précises (30 pts)
    const badAnchors = ['cliquez ici', 'en savoir plus', 'lire la suite'];
    const badExactAnchors = ['ici', 'lien', 'voir', 'plus', 'cliquez', 'link'];
    let goodAnchors = 0;
    
    internalLinks.forEach(link => {
      const text = link.text.trim().toLowerCase();
      const wordLen = text.split(/\s+/).length;
      const isBad = badAnchors.some(bad => text.includes(bad)) || badExactAnchors.includes(text);
      
      if (wordLen >= 2 && wordLen <= 12 && !isBad) {
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
   * En mode NEWS : fil narratif allégé (hook + impact + solution), pas de recommandations obligatoires
   * En mode EVERGREEN : grille complète
   */
  analyzeContentWriting(html, editorialMode = 'evergreen') {
    const root = this.extractMainContent(html);
    const score = { total: 0, max: 100, details: [] };
    const text = root.text;
    const textLower = text.toLowerCase();

    // 1. Fil narratif (15 pts)
    const h2s = root.querySelectorAll('h2').map(el => el.text.toLowerCase());

    if (editorialMode === 'news') {
      // NEWS : hook + impact + solution (pas de section "analyse" ou "recommandation" obligatoire)
      const hasHookOrFait = /changement|nouveau|augment|impact|mise\s*à\s*jour|récent|solution|que\s*faire/i.test(h2s.join(' ') + ' ' + textLower.substring(0, 500));
      const hasImpactSection = h2s.some(h => h.includes('impact') || h.includes('change') || h.includes('concrèt') || h.includes('conséquence'));
      const hasSolutionSection = h2s.some(h => h.includes('solution') || h.includes('alternative') || h.includes('que faire') || h.includes('recommand') || h.includes('retenir'));
      const narrativeScore = (hasHookOrFait ? 5 : 0) + (hasImpactSection ? 5 : 0) + (hasSolutionSection ? 5 : 0);
      score.total += narrativeScore;
      score.details.push({ check: 'Fil narratif (NEWS)', status: `${narrativeScore}/15`, points: narrativeScore });
    } else {
      // EVERGREEN : contexte + analyse + recommandations (patterns élargis)
      const hasContexte = h2s.some(h => /contexte|témoignage|transport|budget|itinér|préparat|planifi|destination|comment\s+(choisir|organiser|planifier)/i.test(h));
      const hasAnalyse = h2s.some(h => /analyse|erreurs|pièges|ce que les autres/i.test(h));
      const hasRecommandations = h2s.some(h => /recommandation|conseils|retenir|conclusion|bilan|résumé|synthèse|synthese|check.?list|par où commencer|commencer|essentiel|verdict|en résumé|en resume|l.essentiel|à retenir|a retenir|nos conseils|comment commencer/i.test(h));
      const narrativeScore = (hasContexte ? 5 : 0) + (hasAnalyse ? 5 : 0) + (hasRecommandations ? 5 : 0);
      score.total += narrativeScore;
      score.details.push({ check: 'Fil narratif', status: `${narrativeScore}/15`, points: narrativeScore });
    }

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
    
    let coherencePoints = 0;
    if (editorialMode === 'news') {
      // NEWS : cohérence = destination dans titre + sujet factuel clair
      const hasFactualFocus = /changement|nouveau|augment|baiss|mise\s*à\s*jour|annonce|effectif/i.test(textLower.substring(0, 1000));
      if (destinationInTitle && hasFactualFocus) {
        coherencePoints = 15;
      } else if (destinationInTitle || hasFactualFocus) {
        coherencePoints = 10;
      }
    } else {
      // EVERGREEN : cohérence = section conclusion/reco + destination
      const recoSection = h2s.findIndex(h => /recommandation|conseils|retenir|conclusion|bilan|résumé|par où commencer|commencer|essentiel|verdict|synthèse|synthese|en résumé|en resume|l.essentiel|à retenir|a retenir|nos conseils|comment commencer/i.test(h));
      if (recoSection >= 0 && destinationInTitle) {
        coherencePoints = 15;
      } else if (recoSection >= 0) {
        coherencePoints = 10;
      } else if (destinationInTitle) {
        coherencePoints = 5;
      }
    }
    
    score.total += coherencePoints;
    score.details.push({ check: 'Cohérence thématique', status: `${coherencePoints}/15`, points: coherencePoints });

    // 5. Pas de répétitions (10 pts)
    // Exclure le texte des modules affiliés et FAQ pour éviter les faux positifs
    let textForRepCheck = text;
    root.querySelectorAll('aside.affiliate-module, .faq-section, details').forEach(el => {
      textForRepCheck = textForRepCheck.replace(el.text, '');
    });
    const sentences = textForRepCheck.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 20);
    const ngrams = new Map();
    
    sentences.forEach(sentence => {
      const words = sentence.split(/\s+/).filter(w => w.length > 2);
      for (let i = 0; i <= words.length - 10; i++) {
        const ngram = words.slice(i, i + 10).join(' ');
        ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
      }
    });
    
    let repetitions = 0;
    ngrams.forEach((count) => {
      if (count > 1) repetitions++;
    });
    
    const repetitionPoints = repetitions === 0 ? 10 : repetitions <= 8 ? Math.max(5, 10 - repetitions) : Math.max(0, 10 - repetitions * 2);
    score.total += repetitionPoints;
    score.details.push({ check: 'Pas de répétitions', status: repetitions === 0 ? 'OK' : `${repetitions} répétitions`, points: repetitionPoints });

    // 6. Paragraphes équilibrés (10 pts)
    // Mesure l'homogénéité via p75/p25 (robuste aux outliers courts/longs)
    const paragraphs = root.querySelectorAll('p').map(el => el.text.length).filter(l => l > 40);
    
    if (paragraphs.length === 0) {
      score.total += 0;
      score.details.push({ check: 'Équilibre sections', status: 'Aucun paragraphe', points: 0 });
    } else {
      const sorted = [...paragraphs].sort((a, b) => a - b);
      const p25 = sorted[Math.floor(sorted.length * 0.25)] || sorted[0];
      const p75 = sorted[Math.floor(sorted.length * 0.75)] || sorted[sorted.length - 1];
      
      const ratio = p25 > 0 ? p75 / p25 : 0;
      
      const balancePoints = ratio <= 3 ? 10 : ratio <= 5 ? 8 : ratio <= 10 ? 5 : ratio <= 15 ? 3 : 0;
      score.total += balancePoints;
      score.details.push({ check: 'Équilibre sections', status: `ratio p75/p25 ${ratio.toFixed(1)}`, points: balancePoints });
    }

    // 7. Introduction engageante (10 pts)
    const firstP = root.querySelector('p');
    const firstPText = firstP ? firstP.text : '';
    const hasHook = /\?|découvr|imagin|révél|secret|incroy|expérien|aventur|rêv|fascinat|erreur|piège|problème|dilemme|la première fois|quand j|soleil|atterri|arrivé|personne ne|peu de gens|ce que|vérité|réalité|dans les rues|au cœur|au milieu|à peine|étouffant|résonne|immerg|plonge/i.test(firstPText);
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
    const hasCTA = /découvr|compar|explor|réserv|voir|planifi|commenc|télécharg|prépar|organis|chois/i.test(conclusionText);
    const conclusionPoints = hasCTA ? 10 : 0;
    score.total += conclusionPoints;
    score.details.push({ check: 'Conclusion actionnable', status: hasCTA ? 'OK' : 'MISSING', points: conclusionPoints });

    // PÉNALITÉS EVERGREEN: longueur, tableau, FAQ
    if (editorialMode === 'evergreen') {
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      
      // Pénalité longueur: -15 pts si < 1500 mots
      if (wordCount < 1500) {
        const lengthPenalty = -15;
        score.total = Math.max(0, score.total + lengthPenalty);
        score.details.push({ check: 'EVERGREEN longueur', status: `${wordCount} mots < 1500 minimum`, points: lengthPenalty });
      } else {
        score.details.push({ check: 'EVERGREEN longueur', status: `${wordCount} mots OK`, points: 0 });
      }
      
      // Pénalité tableau: -5 pts si 2+ destinations et pas de <table>
      const destPatterns = [/thaïlande|thailand|bangkok/i, /vietnam|ho chi minh/i, /bali|indonésie/i, /malaisie|malaysia/i, /japon|japan/i, /philippines/i, /cambodge/i, /singapour/i];
      const destCount = destPatterns.filter(p => p.test(text)).length;
      const hasTable = /<table/i.test(html);
      if (destCount >= 2 && !hasTable) {
        score.total = Math.max(0, score.total - 5);
        score.details.push({ check: 'EVERGREEN tableau comparatif', status: `${destCount} destinations sans tableau`, points: -5 });
      } else if (hasTable) {
        score.details.push({ check: 'EVERGREEN tableau comparatif', status: 'Présent', points: 0 });
      }
      
      // Pénalité FAQ: -5 pts si pas de FAQ
      const hasFAQ = /<h2[^>]*>(?:FAQ|Questions?\s+fréquentes?|Foire\s+aux\s+questions)/i.test(html);
      if (!hasFAQ) {
        score.total = Math.max(0, score.total - 5);
        score.details.push({ check: 'EVERGREEN FAQ SEO', status: 'Absente', points: -5 });
      } else {
        score.details.push({ check: 'EVERGREEN FAQ SEO', status: 'Présente', points: 0 });
      }

      // ─── Nouveaux checks EVERGREEN ─────────────────────────────────

      // title_specificity: titre pas générique + longueur >= 30 chars
      const fullPageEg = parse(html);
      const h1Eg = fullPageEg.querySelector('h1') || fullPageEg.querySelector('.entry-title');
      const titleTextEg = h1Eg ? h1Eg.text.trim() : '';
      const genericTitleBlacklist = /^(guide complet|budget|sécurité|erreurs à éviter|conseils voyage|voyage en asie|astuces|tout savoir|les meilleurs|top \d+)$/i;
      const titleIsSpecific = titleTextEg.length >= 30 && !genericTitleBlacklist.test(titleTextEg);
      if (titleIsSpecific) {
        score.details.push({ check: 'EVERGREEN titre spécifique', status: `OK (${titleTextEg.length} chars)`, points: 0 });
      } else {
        score.total = Math.max(0, score.total - 5);
        score.details.push({ check: 'EVERGREEN titre spécifique', status: titleTextEg.length < 30 ? `Trop court (${titleTextEg.length} chars)` : 'Générique', points: -5 });
      }

      // evidence_density: >= 2 inline citations avec guillemets français
      const evCitations = text.match(/\u00ab[\s\u00a0]*[^\u00bb]{5,200}[\s\u00a0]*\u00bb/g) || [];
      if (evCitations.length >= 2) {
        score.details.push({ check: 'EVERGREEN densité preuves', status: `OK (${evCitations.length} citations)`, points: 0 });
      } else {
        score.total = Math.max(0, score.total - 5);
        score.details.push({ check: 'EVERGREEN densité preuves', status: `${evCitations.length} citation(s) < 2 minimum`, points: -5 });
      }

      // costs_in_eur: si l'article mentionne des coûts, au moins un en EUR (bonus, pas bloquant)
      const hasCostMention = /\d+\s*(€|euro|usd|\$|baht|roupie)/i.test(text);
      const hasEurCost = /\d+\s*(€|euros?)\b/i.test(text);
      if (hasCostMention && !hasEurCost) {
        score.details.push({ check: 'EVERGREEN coûts en EUR', status: 'Coûts sans EUR', points: -3 });
        score.total = Math.max(0, score.total - 3);
      } else if (hasCostMention && hasEurCost) {
        score.details.push({ check: 'EVERGREEN coûts en EUR', status: 'OK', points: 0 });
      }

      // ─── P6: Checks angle, décisions, pénalités descriptives ────────

      // h2_decisional: >= 80% des H2 doivent contenir un arbitrage/décision/tension
      const decisionPatterns = /arbitrage|choix|choisir|optimis|compar|erreur|piège|limit|biais|vérité|réalité|secret|coût|budget|prix|danger|risque|éviter|stratég|pourquoi|comment|quand|quel|meilleur|pire|vs\b|contre\b|plutôt|différen|trade.?off|dilemme|alternative|investissement|essentiel|économiser|petit\s*prix|transformer|exploser|valoir|révél|verdict|astuce|manger\s*local|hébergement|transport|dépens|prendre\s+en\s+compte|à\s+savoir|ne\s+pas\s+oublier|attention|important|indispensable|incontournable|recommand|commencer|par\s+où/i;
      // Exclure les H2 structurels (SERP, FAQ, Comparatif, Checklist, Retenir) du check décisionnel
      const serpExclusionPatterns = /ce que les autres|erreurs?\s*fréquentes|questions?\s*(fréquentes|ouvertes)|FAQ|comparatif|check.?list|ce qu.il faut retenir/i;
      const allH2Elems = root.querySelectorAll('h2');
      let decisionalH2Count = 0;
      let totalContentH2Count = 0;
      const nonDecisionalH2s = [];
      allH2Elems.forEach(h2El => {
        const h2Text = h2El.text.trim();
        if (serpExclusionPatterns.test(h2Text)) return;
        totalContentH2Count++;
        if (decisionPatterns.test(h2Text)) {
          decisionalH2Count++;
        } else {
          nonDecisionalH2s.push(h2Text);
        }
      });
      const h2DecRatio = totalContentH2Count > 0 ? decisionalH2Count / totalContentH2Count : 1;
      if (h2DecRatio >= 0.8) {
        score.details.push({ check: 'EVERGREEN H2 décisionnels', status: `OK (${decisionalH2Count}/${totalContentH2Count} = ${(h2DecRatio * 100).toFixed(0)}%)`, points: 0 });
      } else {
        const h2DecPenalty = h2DecRatio >= 0.6 ? -3 : h2DecRatio >= 0.4 ? -5 : -8;
        score.total = Math.max(0, score.total + h2DecPenalty);
        score.details.push({ check: 'EVERGREEN H2 décisionnels', status: `${decisionalH2Count}/${totalContentH2Count} (${(h2DecRatio * 100).toFixed(0)}% < 80%). Non-déc: ${nonDecisionalH2s.slice(0, 3).map(h => `"${h}"`).join(', ')}`, points: h2DecPenalty });
      }

      // paragraph_decisional: >= 75% des paragraphes doivent contenir un fait, chiffre, ou décision
      const paraDecisionPatterns = /\d+\s*(€|euro|%|jour|mois|baht|semaine|heure|min|nuit|km|\$)|arbitrage|choix|choisir|optimis|compar|erreur|piège|limit|biais|éviter|stratég|recommand|conseil|attention|plutôt|préfér|mieux|pire|risque|avantage|inconvénient|si\s+tu|en\s+revanche|par\s+contre|cependant|il\s+faut|tu\s+dois|tu\s+devr|vaut|idéal|important|essentiel|indispensable|nécessaire|à\s+noter|à\s+savoir|astuce|bon\s+plan|mérite|prévoir|compter|ne\s+(manque|rate|néglige)|en\s+réalité|en\s+fait|selon|d.après|secret|alternative|verdict|l.erreur|contrairement|privilégi|dommage|à\s+proscrire|incontournable|compromis|impéra|sous.estim|sur.estim|justifi|calculer|ne\s+.*\s+pas|stress|doit\s+(être|se)|peser|minutie|panacée|néanmoins|toutefois|en\s+outre|surpris|dépens|coût|économ|option|viable|offr[eai]|permet|considér|immersiv|développ|satisf|expérien|problème|infrastruct|potentiel|impact|facile|difficile|suffis|manqu|besoin|exig/i;
      const allParas = root.querySelectorAll('p');
      let decisionalParaCount = 0;
      let substantiveParaCount = 0;
      allParas.forEach(pEl => {
        const pText = pEl.text.trim();
        if (pText.length < 50) return;
        substantiveParaCount++;
        if (paraDecisionPatterns.test(pText)) {
          decisionalParaCount++;
        }
      });
      const paraDecRatio = substantiveParaCount > 0 ? decisionalParaCount / substantiveParaCount : 0;
      if (paraDecRatio >= 0.75) {
        score.details.push({ check: 'EVERGREEN paragraphes décisionnels', status: `OK (${decisionalParaCount}/${substantiveParaCount} = ${(paraDecRatio * 100).toFixed(0)}%)`, points: 0 });
      } else {
        const paraDecPenalty = paraDecRatio >= 0.6 ? -3 : paraDecRatio >= 0.4 ? -5 : -8;
        score.total = Math.max(0, score.total + paraDecPenalty);
        score.details.push({ check: 'EVERGREEN paragraphes décisionnels', status: `${decisionalParaCount}/${substantiveParaCount} (${(paraDecRatio * 100).toFixed(0)}% < 75%)`, points: paraDecPenalty });
      }

      // descriptive_penalty: penalty if more than 20% of paragraphs are purely descriptive (no opinion/decision)
      const purelyDescriptivePatterns = /^(le|la|les|un|une|des|ce|cette|il|elle|on|en|au|du|dans|sur|avec|pour|par|l')\s/i;
      const opinionMarkers = /recommand|conseil|attention|choisi|préfér|mieux|pire|évit|piège|erreur|risque|plutôt|mais|cependant|en revanche|par contre|si tu|question|arbitrage|\?|!|\d+\s*(€|euro|%|jour|min|nuit|km|baht|\$)|il\s+faut|tu\s+dois|tu\s+devr|vaut|idéal|important|essentiel|indispensable|nécessaire|à\s+noter|astuce|bon\s+plan|mérite|compter|ne\s+(manque|rate)|en\s+(réalité|fait)|selon|d.après|privilégi|incontournable|contrairement|alternative|verdict|compromis|impéra|sous.estim|sur.estim|justifi|doit\s+(être|se)|ne\s+.*\s+pas|toutefois|néanmoins|en\s+outre|peser|dépens|coût|économ|surpris|stress|calculer|meilleur|impact|complexe|influenc|prépar|négliger|clé\b|biais|transformer|affecter|ajust|adapt|en\s+résumé|option|viable|offr[eai]|permet|considér|immersiv|développ|satisf|expérien|problème|infrastruct|potentiel|facile|difficile|suffis|manqu|besoin|exig/i;
      let purelyDescriptiveCount = 0;
      allParas.forEach(pEl => {
        const pText = pEl.text.trim();
        if (pText.length < 50) return;
        if (!opinionMarkers.test(pText)) {
          purelyDescriptiveCount++;
        }
      });
      const descRatio = substantiveParaCount > 0 ? purelyDescriptiveCount / substantiveParaCount : 0;
      if (descRatio <= 0.2) {
        score.details.push({ check: 'EVERGREEN pas de remplissage descriptif', status: `OK (${(descRatio * 100).toFixed(0)}% descriptifs)`, points: 0 });
      } else {
        const descPenalty = descRatio <= 0.35 ? -3 : descRatio <= 0.5 ? -5 : -8;
        score.total = Math.max(0, score.total + descPenalty);
        score.details.push({ check: 'EVERGREEN pas de remplissage descriptif', status: `${purelyDescriptiveCount}/${substantiveParaCount} (${(descRatio * 100).toFixed(0)}% > 20% seuil)`, points: descPenalty });
      }
    }

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
   * En mode NEWS : Quick Guide non obligatoire
   */
  analyzeBlocking(html, editorialMode = 'evergreen') {
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

    // 2. Quick Guide présent (EVERGREEN seulement — non bloquant en NEWS)
    const hasQuickGuideText = /points?\s*cl[eé]s?|quick[\s-]*guide|r[eé]sum[eé]|en\s*bref|retenir|ce\s*qu.?il\s*faut\s*savoir/i.test(text);
    const hasQuickGuideHtml = /class="[^"]*quick[-_]?guide[^"]*"/i.test(html);
    const hasQuickGuide = hasQuickGuideText || hasQuickGuideHtml;
    if (editorialMode === 'news') {
      // En NEWS, le Quick Guide est optionnel — on le note mais il ne bloque pas
      results.checks.push({ check: 'Quick Guide (optionnel NEWS)', passed: true });
    } else {
      results.checks.push({ check: 'Quick Guide présent', passed: hasQuickGuide });
      if (!hasQuickGuide) results.passed = false;
    }

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
      /erreurs?\s*(fréquentes?|courantes?|à\s*éviter)/i
    ];
    
    let emptySections = 0;
    root.querySelectorAll('h2, h3').forEach(el => {
      const h2Text = el.text.toLowerCase();
      const isProtected = protectedSerpPatterns.some(pattern => pattern.test(h2Text));
      
      // Exclure les H3 dans les containers structurels (quick-guide, affiliate-module, FAQ)
      const parentClass = el.parentNode?.getAttribute?.('class') || '';
      const isInsideContainer = /quick[-_]?guide|affiliate|faq|details/i.test(parentClass);
      
      if (!isProtected && !isInsideContainer) {
        const next = el.nextElementSibling;
        if (!next || next.tagName === 'H2' || next.tagName === 'H3') {
          emptySections++;
        }
      }
    });
    const noEmptySections = emptySections === 0;
    results.checks.push({ check: 'Pas de sections vides', passed: noEmptySections });
    if (!noEmptySections) results.passed = false;

    // 5. no_affiliate_placeholder (BLOQUANT) : aucun placeholder d'affiliation visible
    // Exclure le texte des modules affiliés (aside.affiliate-module) car "Lien partenaire" y est un disclaimer légitime
    let textForPlaceholderCheck = text;
    root.querySelectorAll('aside.affiliate-module, .affiliate-module-disclaimer').forEach(el => {
      textForPlaceholderCheck = textForPlaceholderCheck.replace(el.text, '');
    });
    const affiliatePlaceholderPattern = /Lien\s+partenaire|\[lien\]|\{\{[^}]*\}\}|\[url\]/i;
    const hasAffiliatePlaceholder = affiliatePlaceholderPattern.test(textForPlaceholderCheck);
    results.checks.push({ check: 'Pas de placeholder affiliation', passed: !hasAffiliatePlaceholder });
    if (hasAffiliatePlaceholder) results.passed = false;

    // 6. 100% français - AMÉLIORATION: Détection plus stricte (0.1% toléré pour éviter faux positifs)
    // AMÉLIORATION: Patterns anglais plus complets (exclure mots français communs)
    // Exclure: visa, fatigue, moment (mots français aussi)
    let textForEnglishCheck = text;
    // Exclure codes aéroports (PAR, SGN, KUL, ORI, etc.)
    textForEnglishCheck = textForEnglishCheck.replace(/\b[A-Z]{2,4}\b/g, '');
    // Exclure URLs
    textForEnglishCheck = textForEnglishCheck.replace(/https?:\/\/[^\s]+/gi, '');
    
    const englishPatterns = /\b(the|is|are|was|were|have|has|had|this|that|with|from|which|what|how|why|when|where|for|and|or|but|if|then|else|can|could|should|will|would|must|may|might|underestimating|budgeting|setting|doesn't|don't|I'm|you|he|she|it|we|they)\b/gi;
    const englishMatches = (textForEnglishCheck.toLowerCase().match(englishPatterns) || []).length;
    const wordCount = textForEnglishCheck.split(/\s+/).filter(w => w.length > 2).length;
    const englishRatio = wordCount > 0 ? englishMatches / wordCount : 0;
    const isFrench = englishRatio <= 0.005;
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
   * @param {string} html - Contenu HTML de l'article
   * @param {string} editorialMode - 'news' | 'evergreen' (conditionne seuils et grille)
   */
  getGlobalScore(html, editorialMode = 'evergreen') {
    const serp = this.analyzeSERP(html, editorialMode);
    const links = this.analyzeInternalLinks(html, editorialMode);
    const contentWriting = this.analyzeContentWriting(html, editorialMode);
    const blocking = this.analyzeBlocking(html, editorialMode);

    const weightedScore = 
      (serp.percentage * serp.weight) +
      (links.percentage * links.weight) +
      (contentWriting.percentage * contentWriting.weight) +
      (blocking.percentage * blocking.weight);

    // Seuils par mode : NEWS = 70, EVERGREEN = 85
    const passThreshold = editorialMode === 'news' ? 70 : 85;
    const isExpert = weightedScore >= passThreshold && blocking.passed;
    
    // Critères stricts supplémentaires pour score parfait
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
      editorialMode,
      isExpert,
      isPerfect,
      threshold: passThreshold,
      blockingPassed: blocking.passed,
      categories: { serp, links, contentWriting, blocking },
      strictChecks,
      summary: isPerfect
        ? `✅ QUALITÉ PARFAITE [${editorialMode.toUpperCase()}] atteinte`
        : isExpert
        ? `✅ QUALITÉ EXPERT [${editorialMode.toUpperCase()}] atteinte (seuil: ${passThreshold}%)`
        : `❌ Score ${weightedScore.toFixed(1)}% [${editorialMode.toUpperCase()}] (seuil: ${passThreshold}%) - Bloquants: ${blocking.passed ? 'OK' : 'FAIL'}`
    };
  }

  /**
   * Rapport détaillé
   * @param {string} html - Contenu HTML de l'article
   * @param {string} editorialMode - 'news' | 'evergreen'
   */
  generateReport(html, editorialMode = 'evergreen') {
    const result = this.getGlobalScore(html, editorialMode);
    
    let report = `
════════════════════════════════════════════════════════════════
          RAPPORT QUALITÉ ARTICLE [${editorialMode.toUpperCase()}]
════════════════════════════════════════════════════════════════

📊 SCORE GLOBAL: ${result.globalScore}% ${result.isExpert ? '✅ EXPERT' : '❌ À AMÉLIORER'}
   Mode éditorial: ${editorialMode.toUpperCase()}
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
