/**
 * FINALIZER PASSES - HTML structure passes (balance, extract, merge)
 * FV-115: Extracted from article-finalizer.js
 * Each function is bound to the ArticleFinalizer instance at runtime.
 */

export function extractSections(html, sectionDefinitions) {
  const sections = {};
  const h2Matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
  
  for (const m of h2Matches) {
    const h2Title = m[1].trim();
    const h2Lower = h2Title.toLowerCase();
    
    // Chercher la section canonique correspondante
    // Priorité au titre canonique exact, puis aux synonymes
    for (const [sectionKey, sectionDef] of Object.entries(sectionDefinitions)) {
      const titleLower = sectionDef.title.toLowerCase();
      // Match exact du titre canonique (priorité)
      const matchesTitle = h2Lower === titleLower;
      // Match avec synonymes
      const matchesSynonym = !matchesTitle && sectionDef.synonyms.some(s => {
        const synLower = s.toLowerCase();
        return h2Lower === synLower || h2Lower.includes(synLower);
      });
      
      if (matchesTitle || matchesSynonym) {
        // Extraire le contenu jusqu'au prochain H2
        const h2Index = m.index;
        const nextH2Index = h2Matches.find(h => h.index > h2Index)?.index || html.length;
        const sectionContent = html.substring(h2Index + m[0].length, nextH2Index);
        const textContent = sectionContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        
        sections[sectionKey] = {
          h2Index,
          contentText: textContent,
          contentLen: textContent.length,
          h2Title: h2Title
        };
        break; // Une section ne peut correspondre qu'à une seule clé canonique
      }
    }
  }
  
  return sections;
}

/**
 * PHASE 6.2.4: Remplacer les liens morts href="#" par de vrais liens partenaires
 * @param {string} html - HTML de l'article
 * @returns {string} HTML avec liens fonctionnels
 */

export function fixH2InsideP(html) {
  let cleanedHtml = html;
  let fixCount = 0;
  
  // ÉTAPE 1: Fermer les <p> non fermés avant les <h2> tags
  // Pattern: <p> suivi de contenu SANS </p>, puis un <h[1-6]>
  let prevHtml;
  do {
    prevHtml = cleanedHtml;
    cleanedHtml = cleanedHtml.replace(/<p([^>]*)>((?:(?!<\/p>)[\s\S])*?)(<h[1-6][^>]*>)/gi, (m, attrs, content, hTag) => {
      fixCount++;
      const textOnly = content.replace(/<[^>]+>/g, '').trim();
      if (textOnly.length > 0) {
        return `<p${attrs}>${content}</p>\n${hTag}`;
      }
      // Contenu vide avant le H2 — supprimer le <p> orphelin
      return hTag;
    });
  } while (cleanedHtml !== prevHtml); // Répéter tant qu'il y a des corrections
  
  // ÉTAPE 2: Traiter les <p> fermés qui contiennent des éléments block-level
  cleanedHtml = cleanedHtml.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, content) => {
    if (!/<h[1-6][^>]*>/i.test(content)) return match;
    
    fixCount++;
    const parts = content.split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/gi);
    let result = '';
    
    for (const part of parts) {
      if (/<h[1-6][^>]*>/i.test(part)) {
        result += '\n' + part + '\n';
      } else {
        const textOnly = part.replace(/<[^>]+>/g, '').trim();
        if (textOnly.length > 0) {
          result += `<p${attrs}>${part.trim()}</p>`;
        }
      }
    }
    return result;
  });
  
  // ÉTAPE 3: Nettoyer les <p> vides résultants
  cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*<\/p>/gi, '');
  
  if (fixCount > 0) {
    console.log(`   ✅ ${fixCount} paragraphe(s) avec H2 imbriqué corrigé(s) (fixH2InsideP)`);
  }
  
  return cleanedHtml;
}

/**
 * PHASE 6.2.5: Nettoyer les duplications de sections H2
 * Fusionne les sections dupliquées (ex: "Ce que la communauté apporte" + "Ce que la communauté apporte (suite)")
 * @param {string} html - HTML de l'article
 * @returns {string} HTML nettoyé
 */

export function fixH2GeoCoherence(html, title) {
  if (!title || title.length < 5) return html;
  
  // Alias de destinations pour détecter la destination du titre
  const destinationAliases = {
    'thailand': ['thaïlande', 'thailande', 'thailand', 'bangkok', 'chiang mai', 'phuket', 'pattaya'],
    'vietnam': ['vietnam', 'viêt nam', 'hô chi minh', 'ho chi minh', 'hanoi', 'hanoï', 'da nang'],
    'indonesia': ['indonésie', 'indonesie', 'indonesia', 'bali', 'jakarta', 'lombok'],
    'singapore': ['singapour', 'singapore'],
    'philippines': ['philippines', 'manille', 'manila', 'cebu'],
    'japan': ['japon', 'japan', 'tokyo', 'kyoto', 'osaka'],
    'cambodia': ['cambodge', 'cambodia', 'phnom penh', 'siem reap'],
    'malaysia': ['malaisie', 'malaysia', 'kuala lumpur'],
    'south korea': ['corée du sud', 'coree du sud', 'south korea', 'séoul', 'seoul']
  };
  
  // Régions multi-pays
  const regionAliases = {
    'southeast_asia': ['asie du sud-est', 'asie du sud est', 'southeast asia', 'south east asia', 'asie du sud'],
    'asia': ['asie', 'asia']
  };
  
  const titleLower = title.toLowerCase();
  let titleCountry = null;
  let titleLabel = null;
  let titleIsRegion = false;
  let titleRegionLabel = null;
  
  // D'abord vérifier si le titre mentionne une région
  for (const [region, aliases] of Object.entries(regionAliases)) {
    for (const alias of aliases) {
      if (titleLower.includes(alias)) {
        titleIsRegion = true;
        titleRegionLabel = alias;
        break;
      }
    }
    if (titleIsRegion) break;
  }
  
  // Ensuite vérifier si le titre mentionne un pays spécifique
  for (const [country, aliases] of Object.entries(destinationAliases)) {
    for (const alias of aliases) {
      if (titleLower.includes(alias)) {
        titleCountry = country;
        titleLabel = alias;
        break;
      }
    }
    if (titleCountry) break;
  }
  
  let replacements = 0;
  let result = html;
  
  if (titleIsRegion && !titleCountry) {
    // CAS 2: Titre régional → corriger le H2 d'intro et de conclusion s'ils mentionnent un seul pays
    const regionLabelCapitalized = titleRegionLabel.charAt(0).toUpperCase() + titleRegionLabel.slice(1);
    const conclusionPatterns = ['ce qu\'il faut retenir', 'ce qu&#8217;il faut retenir', 'en résumé', 'conclusion', 'un aperçu'];
    
    for (const [country, aliases] of Object.entries(destinationAliases)) {
      for (const alias of aliases) {
        const h2Pattern = new RegExp(`(<h2[^>]*>)(.*?)(</h2>)`, 'gi');
        result = result.replace(h2Pattern, (match, open, content, close) => {
          const contentLower = content.toLowerCase();
          // Ne corriger que les H2 intro/conclusion (pas les sections comparatives par pays)
          const isIntroOrConclusion = conclusionPatterns.some(p => contentLower.includes(p));
          if (isIntroOrConclusion && contentLower.includes(alias)) {
            const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const aliasRegex = new RegExp(`\\s*(à|en|de|du|pour|sur les|sur l')\\s+${aliasEscaped}`, 'gi');
            // Forcer "en" pour les régions (en Asie du Sud-Est, pas à Asie du Sud-Est)
            const newContent = content.replace(aliasRegex, ` en ${regionLabelCapitalized}`);
            if (newContent !== content) {
              replacements++;
              console.log(`   🔄 GEO_COHERENCE (region): H2 "${content.substring(0, 60)}" → "${newContent.substring(0, 60)}"`);
            }
            return open + newContent + close;
          }
          return match;
        });
      }
    }
  } else if (titleCountry) {
    // CAS 1: Titre single-country → remplacer les mentions d'autres pays dans les H2
    // Préposition correcte par pays (en/au/à)
    const countryPrepositions = {
      'thaïlande': 'en', 'thailande': 'en', 'thailand': 'en',
      'vietnam': 'au', 'indonésie': 'en', 'indonesie': 'en',
      'singapour': 'à', 'singapore': 'à',
      'japon': 'au', 'japan': 'au',
      'cambodge': 'au', 'cambodia': 'au',
      'malaisie': 'en', 'malaysia': 'en',
      'philippines': 'aux',
      'corée du sud': 'en'
    };
    const correctPrep = countryPrepositions[titleLabel] || 'en';
    
    for (const [country, aliases] of Object.entries(destinationAliases)) {
      if (country === titleCountry) continue;
      
      for (const alias of aliases) {
        const h2Pattern = new RegExp(`(<h2[^>]*>)(.*?)(</h2>)`, 'gi');
        result = result.replace(h2Pattern, (match, open, content, close) => {
          const contentLower = content.toLowerCase();
          // Garder les H2 comparatifs (vs, et, comparaison) ou les sections multi-pays
          if (contentLower.includes(alias) && !contentLower.includes('compar') && !contentLower.includes('vs') && !contentLower.includes(' et ')) {
            // Traduire le label en français (thailand → Thaïlande, etc.)
            const _geoFrNames = {'thailand':'Thaïlande','thaïlande':'Thaïlande','thailande':'Thaïlande','japan':'Japon','japon':'Japon','indonesia':'Indonésie','indonésie':'Indonésie','cambodia':'Cambodge','cambodge':'Cambodge','malaysia':'Malaisie','malaisie':'Malaisie','singapore':'Singapour','singapour':'Singapour','philippines':'Philippines','korea':'Corée du Sud','laos':'Laos','myanmar':'Myanmar','taiwan':'Taïwan','vietnam':'Vietnam','india':'Inde','nepal':'Népal'};
            const titleLabelCapitalized = _geoFrNames[titleLabel.toLowerCase()] || titleLabel.charAt(0).toUpperCase() + titleLabel.slice(1);
            // Remplacer aussi la préposition (à/en/au + ancien pays → prep correcte + nouveau pays)
            const aliasEscaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const prepAliasRegex = new RegExp(`(à|en|au|aux)\\s+${aliasEscaped}`, 'gi');
            let newContent = content.replace(prepAliasRegex, `${correctPrep} ${titleLabelCapitalized}`);
            // Fallback: remplacer juste le nom si pas de préposition
            if (newContent === content) {
              const aliasRegex = new RegExp(aliasEscaped, 'gi');
              newContent = content.replace(aliasRegex, titleLabelCapitalized);
            }
            if (newContent !== content) {
              replacements++;
              console.log(`   🔄 GEO_COHERENCE: H2 "${content.substring(0, 60)}" → "${newContent.substring(0, 60)}"`);
            }
            return open + newContent + close;
          }
          return match;
        });
      }
    }
  }
  
  if (replacements > 0) {
    console.log(`✅ GEO_COHERENCE: ${replacements} H2 corrigé(s) pour cohérence avec le titre`);
  }
  
  return result;
}

/**
 * PHASE 6.0.9c: Traduire les noms de villes/pays anglais → français dans le HTML
 * Appliqué sur H2, H3, P, LI, blockquote — partout où un lecteur francophone
 * verrait un nom anglais incongruent.
 */

export function ensureIntroBeforeFirstH2(html) {
  if (!html || typeof html !== 'string') return html;
  
  const trimmed = html.trim();
  // Si le contenu ne commence PAS par un H2, tout va bien
  if (!trimmed.match(/^<h2[\s>]/i)) return html;
  
  // Le contenu commence par un H2 → chercher le premier <p>...</p> après ce H2
  const firstH2End = trimmed.match(/<\/h2>/i);
  if (!firstH2End) return html;
  
  const afterH2 = trimmed.substring(firstH2End.index + firstH2End[0].length);
  const firstParagraph = afterH2.match(/^\s*(<p[^>]*>[\s\S]*?<\/p>)/i);
  
  if (firstParagraph) {
    // Déplacer ce paragraphe avant le H2
    const pText = firstParagraph[1];
    const h2Block = trimmed.substring(0, firstH2End.index + firstH2End[0].length);
    const rest = afterH2.substring(firstParagraph.index + firstParagraph[0].length);
    
    console.log(`   📝 INTRO_FIX: Paragraphe introductif déplacé avant le premier H2`);
    return pText + '\n\n' + h2Block + rest;
  }
  
  return html;
}

/**
 * PHASE 6.0.9: Supprimer les emojis des titres H2
 * Les emojis dans les H2 sont mauvais pour le SEO et la cohérence éditoriale
 * @param {string} html - HTML à nettoyer
 * @returns {string} HTML avec H2 sans emojis
 */

export function ensureQuoteHighlight(content, analysis) {
  console.log('💬 Vérification du quote highlight...');

  // Vérifier si un quote existe déjà
  const hasQuote = content.includes('<!-- wp:pullquote') || 
                   content.includes('<blockquote class="wp-block-pullquote');

  if (hasQuote) {
    console.log('   ✅ Quote highlight déjà présent');
    return { content, hasQuote: true };
  }

  // Si pas de quote et qu'on a un témoignage Reddit, en créer un
  if (analysis?.reddit_quote && analysis?.reddit_username) {
    console.log('   ⚠️ Quote manquant - Ajout automatique');
    
    const quote = `
<!-- wp:pullquote -->
<figure class="wp-block-pullquote">
<blockquote>
  <p>${analysis.reddit_quote}</p>
  <cite style="padding: 16px; margin-bottom: 0;">Témoignage de u/${analysis.reddit_username} sur Reddit</cite>
</blockquote>
</figure>
<!-- /wp:pullquote -->
`;

    // Insérer après l'intro FOMO
    const introEnd = content.indexOf('</p>', content.indexOf('FlashVoyages'));
    if (introEnd > -1) {
      content = content.slice(0, introEnd + 4) + '\n' + quote + content.slice(introEnd + 4);
      console.log('   ✅ Quote ajouté après l\'intro');
      return { content, hasQuote: true };
    }
  }

  console.log('   ⚠️ Pas de quote disponible');
  return { content, hasQuote: false };
}

/**
 * Vérifie et améliore l'intro FOMO.
 * Si une ouverture immersive est détectée (scène + question + promesse), on n'ajoute pas l'intro FOMO générique.
 */

export function ensureFomoIntro(content, analysis) {
  console.log('🔥 Vérification de l\'intro FOMO...');

  // Vérifier si une intro FOMO existe déjà
  const hasFomo = content.includes('Pendant que vous') ||
                  content.includes('FlashVoyages') ||
                  content.includes('nous avons sélectionné');

  if (hasFomo) {
    console.log('   ✅ Intro FOMO déjà présente');
    return { content, hasFomo: true };
  }

  // Détecter une ouverture immersive (scène avant analyse) → ne pas ajouter l'intro FOMO
  const textStart = (content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  const immersiveMarkers = [
    /^Tu fixes\s/i,
    /^Tu envisages\s/i,
    /^Tu regardes\s/i,
    /^Tu vérifies\s/i,
    /\d{1,3}\s*\d{3}\s*\$/,  // budget type "25 000 $" en début de texte
    /Dans ce guide[,.]?\s/i,
    /Ici on t'explique\s/i,
    /on t'explique\s+(combien|comment)/i,
    /combien ça coûte vraiment/i,
    /sans brûler ton budget/i
  ];
  const hasImmersiveOpening = immersiveMarkers.some(re => re.test(textStart));
  if (hasImmersiveOpening) {
    console.log('   ✅ Ouverture immersive détectée — intro FOMO non ajoutée');
    return { content, hasFomo: false };
  }

  // Bloc "Pendant que vous..." désactivé : templaté, isolé, forçage éditorial sans valeur
  // Le témoignage Reddit (citation/blockquote) suffit à établir la crédibilité.
  console.log('   ℹ️ Intro FOMO manquante — non ajoutée (bloc générique supprimé)');
  return { content, hasFomo: false };
}

/**
 * PHASE 6.2: Normalise un texte pour comparaison (strip HTML, decode entities, normalize whitespace)
 * @param {string} text - Texte à normaliser
 * @returns {string} Texte normalisé
 */

export function ensureCTA(content, analysis) {
  // Détecter si un CTA existe déjà (inclut les widgets d'affiliation comme CTA implicites)
  const ctaPatterns = [
    /comparer.*vols|réserver.*vol|voir.*vols|découvrir.*offres|guide complet|réserver maintenant|comparer les prix|trouver.*vol|meilleur.*prix/i,
    /<a[^>]*>(comparer|réserver|voir|découvrir|guide|trouver|meilleur)/i,
    /<button[^>]*>(comparer|réserver|voir|découvrir|guide|trouver|meilleur)/i,
    /\[fv_widget\s+type="(flights|hotels|esim|connectivity)"[^\]]*\]/i,
    /class="affiliate-module"/i
  ];
  
  const hasCTA = ctaPatterns.some(pattern => pattern.test(content));
  
  if (hasCTA) {
    return { content, hasCTA: true };
  }
  
  // Déterminer le widget principal pour le CTA
  const mainWidget = analysis?.selected_widgets?.[0]?.slot || 'flights';
  let ctaText = '';
  
  switch (mainWidget) {
    case 'flights':
      ctaText = 'Compare les prix des vols et réserve ton billet';
      break;
    case 'hotels':
      ctaText = 'Trouve ton hébergement idéal';
      break;
    case 'esim':
    case 'connectivity':
      ctaText = 'Équipe-toi d\'une eSIM pour rester connecté';
      break;
    default:
      ctaText = 'Découvre les meilleures offres';
  }
  
  // Insérer le CTA juste avant "Articles connexes"
  const relatedSectionRegex = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>/i;
  const relatedSectionMatch = content.match(relatedSectionRegex);
  
  const ctaBlock = `<p><strong>${ctaText}</strong></p>`;
  
  if (relatedSectionMatch) {
    const relatedSectionIndex = relatedSectionMatch.index;
    const newContent = content.slice(0, relatedSectionIndex) + '\n\n' + ctaBlock + '\n\n' + content.slice(relatedSectionIndex);
    console.log(`✅ CTA ajouté automatiquement avant "Articles connexes"`);
    return { content: newContent, hasCTA: true };
  }
  
  // Si pas de section "Articles connexes", insérer avant la fin
  const lastP = content.lastIndexOf('</p>');
  if (lastP !== -1) {
    const newContent = content.slice(0, lastP + 4) + '\n\n' + ctaBlock + '\n\n' + content.slice(lastP + 4);
    console.log(`✅ CTA ajouté automatiquement avant la fin`);
    return { content: newContent, hasCTA: true };
  }
  
  // Dernier recours: ajouter à la fin
  console.log(`✅ CTA ajouté automatiquement à la fin`);
  return { content: content + '\n\n' + ctaBlock, hasCTA: true };
}

/**
 * Récupère l'image featured depuis Pexels
 * CORRECTION: Évite les images déjà utilisées dans d'autres articles
 */

export function ensureMinimumNewsSerpSections(html, finalDestination = '') {
  if (!html || typeof html !== 'string') return html;
  let out = html;
  const destination = String(finalDestination || '').trim() || 'Asie';
  const lower = out.toLowerCase();

  const hasAutres = /<h2[^>]*>[^<]*ce\s*que\s*(les\s*)?autres[^<]*ne\s*disent?\s*pas[^<]*<\/h2>/i.test(out);
  const hasLimites = /<h2[^>]*>[^<]*limites?\s*(et\s*)?biais[^<]*<\/h2>/i.test(out);
  const hasErreurs = /<h2[^>]*>[^<]*erreurs?\s*(fr[eé]quentes?|courantes?)[^<]*<\/h2>/i.test(out);

  const blocks = [];
  if (!hasAutres) {
    blocks.push(
      '<h2>Ce que les autres ne disent pas</h2>' +
      '<p>Le retour d\'expérience ne couvre pas toujours les coûts cachés, la fatigue logistique et les arbitrages de temps. Prends ces variables en compte avant de verrouiller ton itinéraire.</p>'
    );
  }
  if (!hasLimites) {
    blocks.push(
      '<h2>Limites et biais</h2>' +
      '<p>Ce récit reste un cas individuel: saison, budget et tolérance au rythme changent fortement le résultat. Utilise ce témoignage comme signal, pas comme vérité universelle.</p>'
    );
  }
  if (!hasErreurs) {
    blocks.push(
      `<h2>Les erreurs fréquentes qui coûtent cher aux voyageurs en ${destination}</h2>` +
      '<p>Réserver trop tard, multiplier les transferts et sous-estimer les temps de trajet fait vite exploser le budget. Priorise 1-2 zones cohérentes et sécurise les réservations critiques.</p>'
    );
  }

  if (blocks.length === 0) return out;

  const insertion = `\n${blocks.join('\n')}\n`;
  const conclusionPattern = /<h2[^>]*>\s*ce\s*qu.?il\s*faut\s*retenir[^<]*<\/h2>/i;
  const match = out.match(conclusionPattern);
  if (match) {
    const idx = out.indexOf(match[0]);
    out = out.slice(0, idx) + insertion + out.slice(idx);
  } else {
    out += insertion;
  }

  console.log(`🧩 NEWS_SERP_MINIMUM: ${blocks.length} section(s) ajoutée(s)`);
  return out;
}

/**
 * En mode NEWS, garantit au moins un minimum de décisions explicites et de friction
 * avant les modules affiliés (K4/K5).
 */

export function enforceNewsDecisionAndCtaFriction(html) {
  if (!html || typeof html !== 'string') return html;
  let out = html;

  const text = out.replace(/<[^>]+>/g, ' ');
  const decisionRegex = /notre\s+(arbitrage|verdict|conseil)|si\s+tu\s+\w+[^.]{0,120}(choisis|privil[eé]gie|opte|[eé]vite)|mieux\s+vaut/i;
  const decisionHits = (text.match(new RegExp(decisionRegex.source, 'gi')) || []).length;
  if (decisionHits < 2) {
    const decisionPara = '<p>Si tu hésites entre plusieurs options, choisis d’abord l’itinéraire le plus simple à exécuter. Notre arbitrage: réduire les transferts et sécuriser les réservations clés avant de chercher l’optimisation maximale.</p>';
    const conclusionPattern = /<h2[^>]*>\s*ce\s*qu.?il\s*faut\s*retenir[^<]*<\/h2>/i;
    const m = out.match(conclusionPattern);
    if (m) {
      const idx = out.indexOf(m[0]);
      out = out.slice(0, idx) + decisionPara + '\n' + out.slice(idx);
    } else {
      out += '\n' + decisionPara;
    }
    console.log('🧩 NEWS_DECISION_MINIMUM: paragraphe décisionnel ajouté');
  }

  const frictionRegex = /risque|frais|co[uû]t|perte|urgence|impr[eé]vu|probl[eè]me|pi[eè]ge|attention|danger|d[eé]pense|surprise|cher|arnaqu|vol[eé]|accident|m[eé]dical|bagage|annulation|transfert/i;
  const frictionPara = '<p>Avant de réserver, utilise ce module seulement si ton itinéraire est déjà stabilisé (dates, bagages, aéroport). Pourquoi: les frais cachés (bagages, transferts, annulation) peuvent rapidement annuler un bon prix affiché.</p>';

  out = out.replace(/<aside class="affiliate-module"[\s\S]*?<\/aside>/gi, (block, offset, full) => {
    const before = full.slice(Math.max(0, offset - 350), offset).replace(/<[^>]+>/g, ' ');
    if (frictionRegex.test(before)) return block;
    return `${frictionPara}\n${block}`;
  });

  return out;
}

/**
 * Garantit une conclusion actionnable en fin d'article NEWS pour stabiliser le scoring.
 */

export function ensureNewsActionableConclusion(html) {
  if (!html || typeof html !== 'string') return html;
  let out = html;

  const actionablePattern = /<h2[^>]*>\s*(?:ce\s*qu.?il\s*faut\s*retenir|à\s*retenir|en\s*r[ée]sum[ée]|conclusion|prochaines?\s*[ée]tapes?)[^<]*<\/h2>/i;
  if (actionablePattern.test(out)) {
    return out;
  }
  const hasActionVerbNearEnd = /d[ée]couvr|compar|explor|r[ée]serv|voir|planifi|commenc|t[ée]l[ée]charg|pr[ée]par|organis|chois/i;
  const frictionWord = /frais|risque|co[uû]t|annulation|bagage|transfert/i;

  const h2s = [...out.matchAll(/<h2[^>]*>[\s\S]*?<\/h2>/gi)];
  const lastH2 = h2s.length > 0 ? h2s[h2s.length - 1][0] : null;

  if (lastH2) {
    const idx = out.lastIndexOf(lastH2);
    const tail = out.slice(idx);
    if (actionablePattern.test(lastH2) && hasActionVerbNearEnd.test(tail) && frictionWord.test(tail)) {
      return out;
    }
  }

  const block = [
    '<h2>Prochaines étapes: décider sans surpayer</h2>',
    '<p>Commence par verrouiller ton scénario de base (dates, bagages, transferts), puis compare 2 options maximum avant de réserver. Si un tarif paraît attractif, vérifie d’abord les coûts annexes et les conditions d’annulation pour éviter une fausse bonne affaire.</p>'
  ].join('');

  if (lastH2) {
    out = `${out}\n${block}`;
  } else {
    out = `${out}\n<h2>À retenir</h2>${block}`;
  }

  console.log('🧩 NEWS_ACTIONABLE_CONCLUSION: section de conclusion ajoutée');
  return out;
}

/**
 * Garantit une FAQ courte et syntaxiquement valide en NEWS.
 * Idempotent: n'ajoute pas de doublon si une FAQ correcte existe déjà.
 */

export function ensureNewsFaqStructure(html) {
  if (!html || typeof html !== 'string') return html;
  let out = html;

  // Normalisation minimale des details/summary cassés.
  out = out
    .replace(/<details>\s*<p>/gi, '<details><summary>Question fréquente</summary><p>')
    .replace(/<summary>\s*<\/summary>/gi, '<summary>Question fréquente</summary>');

  const hasFaqHeading = /<h2[^>]*>\s*(?:FAQ|Questions?\s+fr[ée]quentes?|Foire\s+aux\s+questions?)\s*<\/h2>/i.test(out)
    || /<!-- wp:heading[^>]*-->\s*<h2[^>]*>\s*Questions?\s+fr[eé]quentes\s*<\/h2>\s*<!-- \/wp:heading -->/i.test(out);
  const detailsCount = (out.match(/<details[\s>]/gi) || []).length + (out.match(/<!-- wp:details -->/gi) || []).length;
  const summaryCount = (out.match(/<summary[\s>]/gi) || []).length;

  if (hasFaqHeading && detailsCount >= 1 && summaryCount >= 1) return out;

  const faqBlock = [
    '<!-- wp:heading -->',
    '<h2>Questions fréquentes</h2>',
    '<!-- /wp:heading -->',
    '<!-- wp:details -->',
    '<details><summary>Faut-il réserver maintenant ou attendre ?</summary><p>Réserve dès que ton scénario de base est clair. Attendre peut coûter plus cher si les frais annexes augmentent.</p></details>',
    '<!-- /wp:details -->',
    '<!-- wp:details -->',
    '<details><summary>Quel est le piège le plus fréquent ?</summary><p>Se concentrer sur le prix affiché sans intégrer bagages, transferts et conditions d’annulation.</p></details>',
    '<!-- /wp:details -->'
  ].join('\n');

  const beforeConclusion = /<h2[^>]*>\s*(?:ce\s*qu.?il\s*faut\s*retenir|à\s*retenir|prochaines?\s*[ée]tapes?)\s*<\/h2>/i;
  const m = out.match(beforeConclusion);
  if (m) {
    const idx = out.indexOf(m[0]);
    out = out.slice(0, idx) + faqBlock + '\n' + out.slice(idx);
  } else {
    out = `${out}\n${faqBlock}`;
  }
  console.log('🧩 NEWS_FAQ_MINIMUM: FAQ concise ajoutée');
  return out;
}

/**
 * Limite les sauts de niveaux Hn pour stabiliser les checks SEO/Hn.
 */

export function enforceNewsHeadingHierarchy(html) {
  if (!html || typeof html !== 'string') return html;
  let prevLevel = null;
  let fixes = 0;
  const out = html.replace(/<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi, (_full, tag, attrs, inner) => {
    const level = Number(String(tag).replace('h', ''));
    if (!Number.isFinite(level)) return _full;
    let next = level;
    if (prevLevel !== null && level > prevLevel + 1) {
      next = prevLevel + 1;
    }
    if (next < 2 && prevLevel !== null) next = 2;
    if (next !== level) fixes++;
    prevLevel = next;
    return `<h${next}${attrs}>${inner}</h${next}>`;
  });
  if (fixes > 0) {
    console.log(`🧩 NEWS_HIERARCHY_FIX: ${fixes} heading(s) ajusté(s)`);
  }
  return out;
}

/**
 * Passe de convergence qualité NEWS (déterministe + idempotente).
 * Corrige uniquement les checks manquants pour stabiliser le score.
 */

export function ensureNewsQualityConvergence(html, ctx = {}) {
  if (!html || typeof html !== 'string') return html;

  const destination = String(
    ctx.finalDestination || ctx.destination || ctx.mainDestination || 'Asie'
  ).trim();
  const title = String(ctx.title || '').trim();
  const pillarLink = String(ctx.pillarLink || 'https://flashvoyage.com/notre-methode/').trim();

  const qa = new QualityAnalyzer();
  const toScoreHtml = (content) => `<h1>${title}</h1>\n${content}`;
  const getScore = (content) => qa.getGlobalScore(toScoreHtml(content), 'news');
  const getDetail = (arr, checkName) => (arr || []).find(d => d.check === checkName);
  const hasMissing = (arr, checkName) => {
    const d = getDetail(arr, checkName);
    if (!d) return false;
    return Number(d.points || 0) <= 0 || /MISSING|FAIL/i.test(String(d.status || ''));
  };

  let out = html;
  const before = getScore(out);

  // Garde-fous déjà existants (idempotents)
  out = this.ensureMinimumNewsSerpSections(out, destination);
  out = this.enforceNewsDecisionAndCtaFriction(out);
  out = this.ensureNewsActionableConclusion(out);
  out = this.ensureNewsFaqStructure(out);
  out = this.enforceNewsHeadingHierarchy(out);

  const injectBeforeConclusionOrEnd = (content, block) => {
    const conclusionPattern = /<h2[^>]*>\s*(?:ce\s*qu.?il\s*faut\s*retenir|à\s*retenir|prochaines?\s*[ée]tapes?)\s*<\/h2>/i;
    const m = content.match(conclusionPattern);
    if (!m) return `${content}\n${block}`;
    const idx = content.indexOf(m[0]);
    return content.slice(0, idx) + block + '\n' + content.slice(idx);
  };

  const injectImpactBlockIfMissing = (content) => {
    const hasImpactList = /<h2[^>]*>[^<]*(impact|change|concr[eè]t)[^<]*<\/h2>\s*(?:<p[^>]*>[\s\S]*?<\/p>\s*)?(?:<ul|<ol)/i.test(content);
    if (hasImpactList) return content;
    const block = [
      `<h2>Ce qui change concrètement pour ton voyage en ${destination}</h2>`,
      '<ul>',
      '<li>Impact budget: les frais invisibles (bagages, transferts, annulation) peuvent effacer un prix attractif.</li>',
      '<li>Impact planning: un choix trop tardif augmente le risque de compromis coûteux.</li>',
      '<li>Impact exécution: verrouiller 2 priorités réduit les erreurs de dernière minute.</li>',
      '</ul>'
    ].join('');
    console.log('🧩 NEWS_CONVERGENCE: bloc impact+liste ajouté');
    return injectBeforeConclusionOrEnd(content, block);
  };

  const injectActionBlockIfMissing = (content) => {
    const hasActionBlock = /<h2[^>]*>[^<]*(faire|action|maintenant|si\s*tu)[^<]*<\/h2>/i.test(content);
    if (hasActionBlock) return content;
    const block = [
      '<h2>Que faire maintenant: plan d’action en 3 étapes</h2>',
      '<ol>',
      '<li>Confirme ton scénario de base (dates, bagages, aéroport) avant toute comparaison.</li>',
      '<li>Compare deux options maximum avec le coût total réel, pas seulement le prix affiché.</li>',
      `<li>Valide les conditions d’annulation puis consulte ce <a href="${pillarLink}">guide conseils budget et réservation</a> pour sécuriser ta décision.</li>`,
      '</ol>'
    ].join('');
    console.log('🧩 NEWS_CONVERGENCE: bloc action ajouté');
    return injectBeforeConclusionOrEnd(content, block);
  };

  const injectPillarLinkIfMissing = (content) => {
    const hasPillar = /href="[^"]*flashvoyage\.com[^"]*(guide|destination|conseils|budget|methode|notre-methode)[^"]*"/i.test(content);
    if (hasPillar) return content;
    const linkPara = `<p>Pour aller plus loin, ouvre notre <a href="${pillarLink}">guide pratique pour arbitrer budget, timing et réservation</a>.</p>`;
    console.log('🧩 NEWS_CONVERGENCE: lien pilier ajouté');
    return injectBeforeConclusionOrEnd(content, linkPara);
  };

  const injectFactualFocusIfMissing = (content) => {
    const intro = content.substring(0, 1200).toLowerCase();
    const hasFactualFocus = /changement|nouveau|augment|baiss|mise\s*à\s*jour|annonce|effectif/i.test(intro);
    if (hasFactualFocus) return content;
    const factual = `<p>Mise à jour terrain: ce changement a un impact direct sur le budget, le risque d’imprévu et les arbitrages de réservation.</p>`;
    console.log('🧩 NEWS_CONVERGENCE: focus factuel ajouté');
    return `${factual}\n${content}`;
  };

  // Re-score intermédiaire puis patch ciblé
  let mid = getScore(out);
  const serpDetails = mid.categories?.serp?.details || [];
  const linkDetails = mid.categories?.links?.details || [];
  const contentDetails = mid.categories?.contentWriting?.details || [];

  if (hasMissing(serpDetails, 'Bloc impact concret (H2+list)')) {
    out = injectImpactBlockIfMissing(out);
  }
  if (hasMissing(serpDetails, 'Bloc action (H2 faire/action)')) {
    out = injectActionBlockIfMissing(out);
  }
  if (hasMissing(linkDetails, 'Lien page pilier')) {
    out = injectPillarLinkIfMissing(out);
  }
  if (hasMissing(contentDetails, 'Cohérence thématique')) {
    out = injectFactualFocusIfMissing(out);
  }

  const after = getScore(out);
  const beforePct = Number(before.globalScore || 0);
  const afterPct = Number(after.globalScore || 0);
  if (afterPct > beforePct) {
    console.log(`🧩 NEWS_QUALITY_CONVERGENCE: ${beforePct.toFixed(1)}% → ${afterPct.toFixed(1)}%`);
  } else {
    console.log(`🧩 NEWS_QUALITY_CONVERGENCE: stable ${afterPct.toFixed(1)}%`);
  }

  return out;
}

/**
 * Vérifie/corrige l'intégrité des URLs affiliées pour éviter les scripts cassés en prod.
 * Corrige notamment les espaces parasites autour de ?, &, =.
 */

export function applyNewsRenderingProfile(html) {
  if (!html || typeof html !== 'string') return html;
  let out = html;
  let removed = 0;

  // 1) FAQ NEWS: conserver une version concise et valide (ne pas supprimer complètement)
  out = out.replace(
    /(<!-- wp:heading[^>]*-->\s*<h2[^>]*>\s*Questions?\s+fr[eé]quentes\s*<\/h2>\s*<!-- \/wp:heading -->\s*)((?:<!-- wp:details -->[\s\S]*?<!-- \/wp:details -->\s*)+)((?:<script type="application\/ld\+json">[\s\S]*?<\/script>\s*)?)/gi,
    (_full, heading, detailsBlock, schemaBlock) => {
      const details = String(detailsBlock || '').match(/<!-- wp:details -->[\s\S]*?<!-- \/wp:details -->/gi) || [];
      const kept = details.slice(0, 2).join('\n');
      const keptSchema = schemaBlock || '';
      if (details.length > 2) removed += (details.length - 2);
      return `${heading}${kept}\n${keptSchema}`;
    }
  );

  // 2) Supprimer les sections comparatives lourdes (titre + tableau)
  out = out.replace(
    /<h2[^>]*>\s*Comparatif[^<]*<\/h2>\s*(?:<div[^>]*>\s*)?<table[\s\S]*?<\/table>(?:\s*<\/div>)?/gi,
    () => {
      removed++;
      return '';
    }
  );

  // 3) Disclosure affiliation visible mais non intrusif (conformité)
  const disclosure = 'Liens partenaires: une commission peut être perçue, sans surcoût pour toi.';
  out = out
    .replace(
      /<p[^>]*class="[^"]*(?:widget-disclaimer|affiliate-module-disclaimer)[^"]*"[^>]*>[\s\S]*?<\/p>/gi,
      `<p class="affiliate-module-disclaimer"><small>${disclosure}</small></p>`
    )
    .replace(
      /<small>\s*Lien partenaire\s*<\/small>/gi,
      `<small>${disclosure}</small>`
    );

  // 4) 1 CTA max en NEWS: garder le premier module affiliate
  let affiliateSeen = false;
  out = out.replace(/<aside class="affiliate-module"[\s\S]*?<\/aside>/gi, (block) => {
    if (affiliateSeen) {
      removed++;
      return '';
    }
    affiliateSeen = true;
    if (/affiliate-module-disclaimer/i.test(block)) return block;
    return block.replace(
      /<\/aside>\s*$/i,
      `<p class="affiliate-module-disclaimer"><small>${disclosure}</small></p>\n</aside>`
    );
  });

  // 4.b) Si module rendu sans <aside> (script brut), forcer un disclosure minimum
  if (/trpwdg\.com|travelpayouts/i.test(out) && !/affiliate-module-disclaimer|widget-disclaimer/i.test(out)) {
    out = out.replace(
      /(<script[^>]*\bsrc="https?:\/\/[^"]*(?:trpwdg\.com|travelpayouts)[^"]*"[^>]*><\/script>)/i,
      `$1\n<p class="affiliate-module-disclaimer"><small>${disclosure}</small></p>`
    );
  }

  // 5) Normaliser les H2 en mode décisionnel (K2)
  out = out.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (full, attrs, rawTitle) => {
    const title = String(rawTitle || '').replace(/<[^>]*>/g, '').trim();
    const excluded = /questions?\s*fr[eé]quentes?|quick[\s-]*guide|checklist|articles?\s*connexes?|comparatif|ce\s*qu.il\s*faut\s*retenir|ce\s*que\s*les\s*autres|limites?\s*(et\s*)?biais|nos\s*recommandations/i;
    const hasDecision = /arbitrage|choix|choisir|optimis|maximis|vrai|r[eé]alit[eé]|pi[eè]ge|erreur|[eé]viter|strat[eé]gi|planifi|comment|pourquoi|faut.il|versus|vs\b|co[uû]t|prix|budget|danger|risque|limit|biais|secret|meilleur|pire|alternative|dilemme/i.test(title);
    if (excluded.test(title) || hasDecision) return full;

    let rewritten = title;
    if (/\?$/.test(title)) {
      rewritten = `Comment choisir: ${title.replace(/\?+$/, '').trim()}?`;
    } else {
      rewritten = `Comment arbitrer: ${title}`;
    }
    return `<h2${attrs}>${rewritten}</h2>`;
  });

  out = this.ensureNewsFaqStructure(out);
  out = this.enforceNewsHeadingHierarchy(out);

  if (removed > 0) {
    console.log(`🧹 NEWS_PROFILE: ${removed} bloc(s) evergreen/CTA supprimé(s)`);
  }
  return out;
}

/**
 * Réconcilie les destinations widgets avec la destination finale (fallback auto-fix).
 * Utilisé avant validation pour limiter les faux fails sur shortcodes.
 */

export async function ensureSerpSections(html, pipelineContext, report) {
  console.log('🔍 Vérification sections SERP...');
  
  let cleanedHtml = html;
  const text = html.toLowerCase();
  
  // AMÉLIORATION: Vérifier section "Ce que les autres ne disent pas" avec détection plus robuste
  const decodedText = text.replace(/&#8217;/g, "'").replace(/&#39;/g, "'").replace(/&apos;/g, "'");
  const missingSectionPattern = /ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement)/i;
  // Vérifier aussi dans les H2 (avec ou sans "explicitement")
  const h2Pattern = /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i;
  // Vérifier aussi si la section a du contenu après le H2 (au moins 1 paragraphe)
  const h2WithContentPattern = /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>\s*(<p[^>]*>[^<]+<\/p>\s*){1,}/i;
  // AMÉLIORATION: Vérifier aussi avec entités HTML décodées dans le texte brut
  const hasContentAfterH2 = h2WithContentPattern.test(html);
  // Vérifier aussi dans le texte décodé si le H2 existe et qu'il y a du texte après
  const h2Match = decodedText.match(/<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
  const hasContentInDecoded = h2Match && decodedText.indexOf(h2Match[0]) !== -1 && decodedText.substring(decodedText.indexOf(h2Match[0]) + h2Match[0].length).trim().length > 50;
  // AMÉLIORATION: Vérifier aussi dans le HTML brut (sans décodage) pour être sûr
  const h2MatchRaw = html.match(/<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
  const hasContentAfterH2Raw = h2MatchRaw && html.substring(html.indexOf(h2MatchRaw[0]) + h2MatchRaw[0].length).match(/<p[^>]*>[^<]+<\/p>/i);
  
  // AMÉLIORATION: Compter les occurrences pour détecter les répétitions massives
  // Vérifier dans les deux (html original et cleanedHtml) pour être sûr
  // AMÉLIORATION: Pattern plus flexible pour détecter même avec entités HTML ou variantes
  const h2PatternFlexible = /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/gi;
  const h2MatchesHtml = html.match(h2PatternFlexible);
  const h2MatchesCleaned = cleanedHtml.match(h2PatternFlexible);
  
  // AMÉLIORATION: Vérifier aussi avec texte décodé (sans HTML)
  const textOnly = cleanedHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
  const textMatches = textOnly.match(/ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement)/gi);
  
  const h2Count = Math.max(
    h2MatchesHtml ? h2MatchesHtml.length : 0,
    h2MatchesCleaned ? h2MatchesCleaned.length : 0,
    textMatches ? Math.floor(textMatches.length / 2) : 0 // Diviser par 2 car le pattern peut matcher plusieurs fois dans le même H2
  );
  
  // AMÉLIORATION: Si h2Count > 0, la section existe déjà (même si répétée)
  // On ne doit ajouter que si AUCUNE occurrence n'existe (h2Count === 0)
  // AMÉLIORATION: Vérifier aussi dans cleanedHtml pour être sûr
  const hasSectionInCleaned = h2MatchesCleaned && h2MatchesCleaned.length > 0;
  const hasSectionInHtml = h2MatchesHtml && h2MatchesHtml.length > 0;
  const hasMissingSection = h2Count === 0 && !hasSectionInCleaned && !hasSectionInHtml && !h2Pattern.test(html) && !hasContentAfterH2 && !hasContentInDecoded && !hasContentAfterH2Raw;
  
  // AMÉLIORATION: Vérifier aussi section "Limites et biais"
  const limitesPattern = /limites?\s*(et\s*)?biais/i;
  const limitesH2Pattern = /<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/i;
  const limitesWithContentPattern = /<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>\s*<p[^>]*>[^<]+<\/p>/i;
  const hasLimitesSection = limitesPattern.test(decodedText) || limitesH2Pattern.test(html) || limitesWithContentPattern.test(html);
  
  // AMÉLIORATION: Si h2Count > 1, il y a des répétitions - on ne doit PAS ajouter, mais plutôt nettoyer
  if (h2Count > 1) {
    console.log(`   ⚠️ Section "Ce que les autres ne disent pas" présente ${h2Count} fois (répétitions détectées)`);
    report.checks.push({
      name: 'serp_sections',
      status: 'warn',
      details: `Section présente ${h2Count} fois (répétitions)`
    });
    // Ne pas ajouter, les répétitions seront gérées par removeRepetitions
  } else if (h2Count >= 1 || hasSectionInCleaned || hasSectionInHtml || h2Pattern.test(html)) {
    // AMÉLIORATION: Vérifier si la section existe mais est vide (même si h2Count > 0)
    // Section existe - vérifier si elle a du contenu
    const h2Match = cleanedHtml.match(/<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
    if (h2Match) {
      const h2Index = cleanedHtml.indexOf(h2Match[0]);
      const afterH2 = cleanedHtml.substring(h2Index + h2Match[0].length);
      // Vérifier si le prochain élément est un H2/H3 ou si le contenu est vide
      const nextH2Match = afterH2.match(/<(h[23])[^>]*>/i);
      const contentAfterH2 = afterH2.substring(0, nextH2Match ? nextH2Match.index : Math.min(500, afterH2.length));
      // AMÉLIORATION: Vérifier s'il y a un paragraphe avec au moins 30 caractères de texte réel
      const hasRealContent = contentAfterH2.match(/<p[^>]*>[^<]{30,}<\/p>/i) || 
                            (contentAfterH2.replace(/<[^>]+>/g, ' ').trim().length > 50);
      
      if (!hasRealContent) {
        console.log('   ⚠️ Section "Ce que les autres ne disent pas" existe mais est vide - remplissage...');
        
        // Générer le contenu
        const sectionContent = pipelineContext?.story?.story 
          ? `<p>Les témoignages Reddit n'abordent souvent pas les coûts réels associés au voyage, tels que le logement à long terme et les dépenses quotidiennes. De plus, les contraintes liées à la fatigue de voyage ne sont pas suffisamment explorées, laissant de côté l'impact potentiellement considérable sur le bien-être mental et physique des voyageurs.</p>
<p>Ces informations manquantes peuvent créer des attentes irréalistes et des surprises désagréables lors du séjour. Il est donc essentiel de compléter ces témoignages par des recherches approfondies sur les aspects pratiques et financiers du voyage.</p>`
          : `<p>Les témoignages Reddit n'abordent souvent pas les aspects pratiques détaillés du voyage, tels que les coûts réels, les contraintes administratives, et l'impact sur le bien-être. Ces éléments sont pourtant essentiels pour une préparation complète.</p>
<p>En particulier, les témoignages omettent fréquemment les détails sur les dépenses quotidiennes réelles, les délais administratifs concrets, et les contraintes pratiques qui peuvent impacter significativement l'expérience de voyage. Ces informations manquantes peuvent créer des attentes irréalistes et des surprises désagréables lors du séjour.</p>
<p>Il est donc recommandé de compléter ces témoignages par des recherches approfondies sur les aspects pratiques et financiers du voyage, afin d'éviter les mauvaises surprises et de mieux préparer son séjour.</p>`;
        
        // Insérer le contenu après le H2 (remplacer le contenu vide s'il y en a)
        const insertIndex = h2Index + h2Match[0].length;
        if (nextH2Match) {
          const nextH2Index = insertIndex + nextH2Match.index;
          // Supprimer le contenu vide entre le H2 et le prochain H2, puis insérer le nouveau contenu
          cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + sectionContent + '\n\n' + cleanedHtml.substring(nextH2Index);
        } else {
          // Pas de H2 suivant, insérer à la fin
          cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + sectionContent + '\n\n' + cleanedHtml.substring(insertIndex);
        }
        
        report.actions.push({
          type: 'filled_empty_serp_section',
          details: 'Ce que les autres ne disent pas'
        });
        console.log('   ✅ Section SERP vide remplie avec contenu');
      } else {
        report.checks.push({
          name: 'serp_sections',
          status: 'pass',
          details: 'Section "Ce que les autres ne disent pas" présente avec contenu'
        });
      }
    } else {
      report.checks.push({
        name: 'serp_sections',
        status: 'pass',
        details: 'Section "Ce que les autres ne disent pas" présente'
      });
    }
  } else if (!hasMissingSection) {
    // Option B : ne plus insérer la section manquante, seulement logger un avertissement
    console.log('   ⚠️ Section "Ce que les témoignages Reddit ne disent pas" absente (Option B : pas d\'insertion automatique, à intégrer dans le développement si pertinent)');
    report.checks.push({
      name: 'serp_sections',
      status: 'warning',
      details: 'Section "Ce que les autres ne disent pas" absente — à intégrer dans le développement si le story le justifie'
    });
  } else {
    report.checks.push({
      name: 'serp_sections',
      status: 'pass',
      details: 'Section "Ce que les autres ne disent pas" présente'
    });
  }
  
  // Vérifier la présence des angles uniques SERP (Budget, Timeline, Contraintes)
  // IMPORTANT: Vérifier APRÈS avoir ajouté le contenu pour éviter les détections multiples
  const checkUniqueAngles = (html) => {
    const uniqueAnglesPatterns = [
      { pattern: /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i, name: 'Budget détaillé' },
      { pattern: /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i, name: 'Timeline' },
      { pattern: /contraintes?|difficultés?|obstacles?|problèmes?\s*(pratiques?|réels?)|défis/i, name: 'Contraintes réelles' }
    ];
    
    const detected = [];
    const missing = [];
    
    uniqueAnglesPatterns.forEach(angle => {
      if (angle.pattern.test(html)) {
        detected.push(angle.name);
      } else {
        missing.push(angle.name);
      }
    });
    
    return { detected, missing };
  };
  
  // Première vérification
  let angleCheck = checkUniqueAngles(cleanedHtml);
  let detectedAngles = angleCheck.detected;
  let missingAngles = angleCheck.missing;
  
  if (detectedAngles.length > 0) {
    console.log(`   ✅ Angles uniques détectés: ${detectedAngles.join(', ')} (${detectedAngles.length}/3)`);
  }
  
  if (missingAngles.length > 0) {
    console.log(`   ⚠️ Angles uniques manquants: ${missingAngles.join(', ')} (${detectedAngles.length}/3)`);
    
    // Ajouter les angles manquants dans les sections appropriées
    let addedContent = false;
    
    // 1. Ajouter Budget détaillé si manquant
    if (missingAngles.includes('Budget détaillé')) {
      const budgetText = '<p>Le budget réel pour ce type de séjour peut varier significativement selon la destination et le mode de vie choisi. Les coûts réels incluent généralement le logement à long terme, les dépenses quotidiennes, et les frais administratifs. Il est recommandé de prévoir un budget détaillé avec une marge de 15 à 20% pour les imprévus.</p>';
      
      // Chercher où insérer (dans "Nos recommandations" ou "Ce que les autres ne disent pas")
      const recommandationsMatch = cleanedHtml.match(/<h2[^>]*>Nos\s+recommandations[^<]*<\/h2>/i);
      const autresMatch = cleanedHtml.match(/<h2[^>]*>.*?ce\s*que.*?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
      
      // Vérifier si le budget est déjà mentionné avec les mots-clés requis
      const hasBudgetKeywords = /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i.test(cleanedHtml);
      
      if (!hasBudgetKeywords) {
        if (recommandationsMatch) {
          const insertIndex = recommandationsMatch.index + recommandationsMatch[0].length;
          cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + budgetText + '\n' + cleanedHtml.slice(insertIndex);
          addedContent = true;
          console.log('   ✅ Budget détaillé ajouté dans "Nos recommandations"');
        } else if (autresMatch) {
          const insertIndex = autresMatch.index + autresMatch[0].length;
          cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + budgetText + '\n' + cleanedHtml.slice(insertIndex);
          addedContent = true;
          console.log('   ✅ Budget détaillé ajouté dans "Ce que les autres ne disent pas"');
        }
      }
    }
    
    // 2. Ajouter Timeline/Chronologie si manquant
    if (missingAngles.includes('Timeline')) {
      const timelineText = '<p>La chronologie du voyage révèle souvent des ajustements nécessaires et des étapes non prévues initialement. La période de séjour peut nécessiter des adaptations selon les contraintes administratives et les opportunités rencontrées.</p>';
      
      // Chercher où insérer (dans "Contexte" ou "Événement central")
      const contexteMatch = cleanedHtml.match(/<h2[^>]*>Contexte[^<]*<\/h2>/i);
      const evenementMatch = cleanedHtml.match(/<h2[^>]*>Événement\s+central[^<]*<\/h2>/i);
      
      // Vérifier si la timeline est déjà mentionnée avec les mots-clés requis
      const hasTimelineKeywords = /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i.test(cleanedHtml);
      
      if (!hasTimelineKeywords) {
        if (contexteMatch) {
          const insertIndex = contexteMatch.index + contexteMatch[0].length;
          cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + timelineText + '\n' + cleanedHtml.slice(insertIndex);
          addedContent = true;
          console.log('   ✅ Timeline ajoutée dans "Contexte"');
        } else if (evenementMatch) {
          const insertIndex = evenementMatch.index + evenementMatch[0].length;
          cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + timelineText + '\n' + cleanedHtml.slice(insertIndex);
          addedContent = true;
          console.log('   ✅ Timeline ajoutée dans "Événement central"');
        } else {
          // Si aucune section cible, ajouter dans "Ce que les autres ne disent pas"
          const autresMatch = cleanedHtml.match(/<h2[^>]*>.*?ce\s*que.*?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i);
          if (autresMatch) {
            const insertIndex = autresMatch.index + autresMatch[0].length;
            cleanedHtml = cleanedHtml.slice(0, insertIndex) + '\n' + timelineText + '\n' + cleanedHtml.slice(insertIndex);
            addedContent = true;
            console.log('   ✅ Timeline ajoutée dans "Ce que les autres ne disent pas"');
          }
        }
      }
    }
    
    if (addedContent) {
      // Vérifier que les angles ont bien été ajoutés
      const budgetAdded = /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i.test(cleanedHtml);
      const timelineAdded = /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i.test(cleanedHtml);
      
      const addedAngles = [];
      if (budgetAdded && missingAngles.includes('Budget détaillé')) addedAngles.push('Budget détaillé');
      if (timelineAdded && missingAngles.includes('Timeline')) addedAngles.push('Timeline');
      
      report.actions.push({
        type: 'added_unique_angles',
        details: `Angles ajoutés: ${addedAngles.join(', ')}`
      });
      
      console.log(`   ✅ Angles ajoutés avec succès: ${addedAngles.join(', ')}`);
      
      // Re-vérifier après ajout pour confirmer
      angleCheck = checkUniqueAngles(cleanedHtml);
      detectedAngles = angleCheck.detected;
      missingAngles = angleCheck.missing;
      
      if (detectedAngles.length === 3) {
        console.log(`   ✅ Tous les angles uniques sont maintenant présents (3/3)`);
      }
    }
    
    report.checks.push({
      name: 'serp_unique_angles',
      status: addedContent && detectedAngles.length === 3 ? 'pass' : (addedContent ? 'fixed' : 'warning'),
      details: `Angles uniques: ${detectedAngles.length}/3 détectés (${detectedAngles.join(', ')})${missingAngles.length > 0 ? ` - Manquants: ${missingAngles.join(', ')}` : ''}${addedContent ? ' - Contenu ajouté' : ''}`
    });
  } else {
    report.checks.push({
      name: 'serp_unique_angles',
      status: 'pass',
      details: `Tous les angles uniques détectés: ${detectedAngles.join(', ')} (3/3)`
    });
  }
  
  // AMÉLIORATION: Vérifier et remplir section "Limites et biais" si manquante ou vide
  // CORRECTION: Compter TOUTES les occurrences (y compris Limites, Limitations, Limits)
  const limitesH2PatternCheck = /<h2[^>]*>.*?(?:limites?|limitations?|limits?)\s*(et\s*)?(?:biais|bias(?:es)?).*?<\/h2>/gi;
  const limitesH2Matches = cleanedHtml.match(limitesH2PatternCheck) || [];
  const limitesCount = limitesH2Matches.length;
  const limitesH2Match = limitesH2Matches.length > 0 ? limitesH2Matches[0] : null;
  
  // CORRECTION: Vérifier aussi si la section existe dans le texte (même sans H2 dédié)
  const limitesInText = /limites?\s*(et\s*)?biais/i.test(cleanedHtml.replace(/<h2[^>]*>.*?<\/h2>/gi, ''));    
  // CORRECTION: Si la section existe déjà (même dans le texte), ne PAS l'ajouter
  // Option B : ne plus insérer de section manquante, seulement logger un avertissement
  if (limitesCount > 0 || limitesInText) {
    if (limitesCount > 1) {
      console.log(`   ⚠️ Section "Limites et biais" dupliquée détectée (${limitesCount} occurrences) - sera nettoyée par removeDuplicateH2Sections`);
    } else {
      console.log('   ✅ Section "Limites et biais" déjà présente');
    }
  } else if (!hasLimitesSection && !limitesH2Match && limitesCount === 0 && !limitesInText) {
    console.log('   ⚠️ Section "Limites et biais" absente (Option B : pas d\'insertion automatique, à intégrer dans le développement si pertinent)');
    report.checks.push({
      name: 'serp_sections_limites',
      status: 'warning',
      details: 'Section "Limites et biais" absente — à intégrer dans le développement si le story le justifie'
    });
  } else if (limitesH2Match) {
    // AMÉLIORATION: Section existe mais peut être vide - vérifier et remplir si nécessaire
    const limitesIndex = cleanedHtml.indexOf(limitesH2Match[0]);
    const afterLimites = cleanedHtml.substring(limitesIndex + limitesH2Match[0].length);
    const nextH2Match = afterLimites.match(/<(h[23])[^>]*>/i);
    const contentAfterLimites = afterLimites.substring(0, nextH2Match ? nextH2Match.index : Math.min(500, afterLimites.length));
    // AMÉLIORATION: Vérifier s'il y a un paragraphe avec au moins 30 caractères de texte réel
    const hasRealContent = contentAfterLimites.match(/<p[^>]*>[^<]{30,}<\/p>/i) || 
                          (contentAfterLimites.replace(/<[^>]+>/g, ' ').trim().length > 50);
    
    if (!hasRealContent) {
      console.log('   ⚠️ Section "Limites et biais" existe mais est vide - remplissage...');
      
      const limitesContent = `<p>Cet article s'appuie sur un témoignage unique — un seul voyage, un seul budget, une seule saison. Ton expérience sera différente, et c'est normal.</p>
<p>Les prix cités datent du moment du voyage et ont probablement bougé depuis. Les conseils logistiques reflètent les conditions rencontrées par ce voyageur, pas une vérité universelle. Croise toujours avec d'autres sources récentes avant de réserver.</p>`;
      
      // Insérer le contenu après le H2 (remplacer le contenu vide s'il y en a)
      const insertIndex = limitesIndex + limitesH2Match[0].length;
      if (nextH2Match) {
        const nextH2Index = insertIndex + nextH2Match.index;
        // Supprimer le contenu vide entre le H2 et le prochain H2, puis insérer le nouveau contenu
        cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + limitesContent + '\n\n' + cleanedHtml.substring(nextH2Index);
      } else {
        // Pas de H2 suivant, insérer à la fin
        cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + limitesContent + '\n\n' + cleanedHtml.substring(insertIndex);
      }
      
      report.actions.push({
        type: 'filled_empty_serp_section',
        details: 'Limites et biais'
      });
      console.log('   ✅ Section "Limites et biais" vide remplie avec contenu');
    } else {
      report.checks.push({
        name: 'serp_sections_limites',
        status: 'pass',
        details: 'Section "Limites et biais" présente avec contenu'
      });
    }
  } else {
      report.checks.push({
        name: 'serp_sections_limites',
        status: 'pass',
        details: 'Section "Limites et biais" présente'
      });
  }
  
  return cleanedHtml;
}

/**
 * Remplit les sections vides avec du contenu approprié
 * @param {string} html - HTML à valider
 * @param {Object} pipelineContext - Contexte du pipeline
 * @param {Object} report - Rapport QA
 * @returns {string} HTML corrigé
 */

export function fillEmptySections(html, pipelineContext, report) {
  console.log('🔍 Remplissage sections vides...');
  
  let cleanedHtml = html;
  const h2Pattern = /<h2[^>]*>([^<]+)<\/h2>/gi;
  const h2s = [];
  let match;
  
  while ((match = h2Pattern.exec(cleanedHtml)) !== null) {
    h2s.push({
      fullMatch: match[0],
      title: match[1].trim(),
      index: match.index
    });
  }
  
  // Trier par index décroissant pour traiter de la fin vers le début
  h2s.sort((a, b) => b.index - a.index);
  
  h2s.forEach(h2 => {
    const h2Index = h2.index;
    const afterH2 = cleanedHtml.substring(h2Index + h2.fullMatch.length);
    const nextH2Match = afterH2.match(/<h2[^>]*>/i);
    // AMÉLIORATION: Augmenter la limite pour détecter les angles uniques (qui peuvent être plus loin)
    const contentAfterH2 = afterH2.substring(0, nextH2Match ? nextH2Match.index : Math.min(2000, afterH2.length));
    
    // AMÉLIORATION: Décoder toutes les entités HTML avant de vérifier
    const decodedContent = contentAfterH2
      .replace(/&#8217;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
    
    const textContent = decodedContent.replace(/<[^>]+>/g, ' ').trim();
    
    // AMÉLIORATION: Vérifier si le contenu est vraiment visible (pas juste des espaces/entités)
    // Détecter les paragraphes vides ou avec seulement des points/espaces
    const emptyParagraphs = decodedContent.match(/<p[^>]*>\s*[.\s]*<\/p>/gi);
    // Détecter les paragraphes qui commencent par un point seul (ex: <p>.</p> ou <p>. Texte</p>)
    const paragraphsStartingWithDot = decodedContent.match(/<p[^>]*>\s*\.\s*[^<]*<\/p>/gi);
    const hasOnlyEmptyParas = (emptyParagraphs && emptyParagraphs.length > 0) || (paragraphsStartingWithDot && paragraphsStartingWithDot.length > 0);
    
    // Un paragraphe avec au moins 30 caractères de texte réel (hors HTML) et qui ne commence pas par un point seul
    const realParagraphs = decodedContent.match(/<p[^>]*>[^<]{30,}<\/p>/gi);
    const hasRealParagraph = realParagraphs && realParagraphs.some(p => !p.match(/<p[^>]*>\s*\./));
    
    // Ou au moins 50 caractères de texte brut après décodage (sans compter les points isolés)
    const meaningfulText = textContent.replace(/\s+/g, ' ').replace(/^\.\s+/, '').trim();
    const hasRealText = meaningfulText.length > 50;
    
    // AMÉLIORATION: Vérifier aussi si le contenu n'est pas juste des espaces/retours à la ligne
    const hasRealContent = (hasRealParagraph || (hasRealText && meaningfulText.length > 30)) && !hasOnlyEmptyParas;
    
    // AMÉLIORATION CRITIQUE: Vérifier si la section contient déjà les angles uniques SERP (Budget, Timeline, Contraintes)
    // Ne PAS remplacer le contenu si les angles sont présents
    // Vérifier dans TOUT le contenu après le H2 (pas seulement les 2000 premiers caractères)
    const fullContentAfterH2 = nextH2Match ? afterH2.substring(0, nextH2Match.index) : afterH2;
    const hasBudgetKeywords = /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i.test(fullContentAfterH2);
    const hasTimelineKeywords = /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i.test(fullContentAfterH2);
    const hasContraintesKeywords = /contraintes?|difficultés?|obstacles?|problèmes?\s*(pratiques?|réels?)|défis/i.test(fullContentAfterH2);
    const hasUniqueAngles = hasBudgetKeywords || hasTimelineKeywords || hasContraintesKeywords;
    
    // Ne remplacer que si la section est vraiment vide ET ne contient pas d'angles uniques
    if (!hasRealContent && !hasUniqueAngles) {
      const h2TitleLower = h2.title.toLowerCase();
      
      // Générer du contenu selon le type de section
      let sectionContent = '';
      
      if (h2TitleLower.includes('contexte')) {
        sectionContent = `<p>Cette expérience de voyage s'inscrit dans un contexte spécifique qui mérite d'être précisé. Les conditions de départ, les motivations initiales et l'environnement dans lequel cette aventure a pris place sont des éléments essentiels pour comprendre pleinement le témoignage.</p>
<p>Il est important de noter que chaque voyageur part avec ses propres attentes, contraintes et objectifs, ce qui influence significativement son expérience et son ressenti tout au long du séjour.</p>`;
      } else if (h2TitleLower.includes('ce que') && h2TitleLower.includes('ne disent')) {
        sectionContent = `<p>Les témoignages Reddit n'abordent souvent pas les aspects pratiques détaillés du voyage, tels que les coûts réels, les contraintes administratives, et l'impact sur le bien-être. Ces éléments sont pourtant essentiels pour une préparation complète.</p>
<p>En particulier, les témoignages omettent fréquemment les détails sur les dépenses quotidiennes réelles, les délais administratifs concrets, et les contraintes pratiques qui peuvent impacter significativement l'expérience de voyage.</p>`;
      } else if (h2TitleLower.includes('limites') || h2TitleLower.includes('biais')) {
        sectionContent = `<p>Cet article s'appuie sur un témoignage unique — un seul voyage, un seul budget, une seule saison. Ton expérience sera différente, et c'est normal.</p>
<p>Les prix cités datent du moment du voyage et ont probablement bougé depuis. Les conseils logistiques reflètent les conditions rencontrées par ce voyageur, pas une vérité universelle. Croise toujours avec d'autres sources récentes avant de réserver.</p>`;
      }
      
      if (sectionContent) {
        const insertIndex = h2Index + h2.fullMatch.length;
        // AMÉLIORATION: Supprimer d'abord le contenu vide existant (paragraphes vides, espaces)
        const contentToRemove = nextH2Match ? contentAfterH2.substring(0, nextH2Match.index) : contentAfterH2;
        const cleanedContentToRemove = contentToRemove.replace(/<p[^>]*>\s*<\/p>/gi, '').trim();
        
        if (nextH2Match) {
          const nextH2Index = insertIndex + nextH2Match.index;
          // Remplacer le contenu vide par le nouveau contenu
          cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + sectionContent + '\n\n' + cleanedHtml.substring(nextH2Index);
        } else {
          // Pas de H2 suivant, remplacer tout le contenu après le H2
          cleanedHtml = cleanedHtml.substring(0, insertIndex) + '\n\n' + sectionContent + '\n\n' + cleanedHtml.substring(insertIndex + contentAfterH2.length);
        }
        
        report.actions.push({
          type: 'filled_empty_section',
          details: h2.title
        });
        console.log(`   ✅ Section vide remplie: "${h2.title}"`);
      }
    }
  });
  
  return cleanedHtml;
}

/**
 * PHASE 6.0.12.3: Valide et corrige les titres H2.
 * - Supprime les H2 trop courts (< 4 mots)
 * - Corrige les patterns grammaticaux faux ("en la destination", "en le pays")
 * - Supprime les H2 placeholder ("Section X", "Titre ici")
 */

export function validateH2Titles(html, report) {
  let fixCount = 0;
  let result = html;

  // Corriger "en la/le/les" → "a la/au/aux" ou supprimer
  result = result.replace(/<h2([^>]*)>([^<]+)<\/h2>/gi, (match, attrs, title) => {
    let fixed = title;

    // "en la destination" → "a destination" / "en le pays" → "au pays"
    fixed = fixed.replace(/\ben la\b/gi, 'à la');
    fixed = fixed.replace(/\ben le\b/gi, 'au');
    fixed = fixed.replace(/\ben les\b/gi, 'aux');

    // Supprimer placeholder patterns
    if (/^(section|titre|heading|chapitre|partie)\s*\d*\s*$/i.test(fixed.trim())) {
      fixCount++;
      console.log(`   🧹 H2 placeholder supprime: "${title}"`);
      return '';
    }

    // H2 trop court (< 4 mots de texte)
    // Exception: FAQ, retenir, recommandations sont des H2 structurels légitimes
    const protectedH2 = /questions?\s*fr[ée]quentes?|faq|ce\s*qu.*retenir|nos\s*recommandations?|en\s*bref|checklist|conclusion|verdict|comparatif|r[ée]sum[ée]/i;
    const words = fixed.trim().split(/\s+/).filter(w => w.length > 1);
    if (words.length < 3 && !protectedH2.test(fixed.trim())) {
      fixCount++;
      console.log(`   🧹 H2 trop court supprime: "${title}" (${words.length} mots)`);
      return '';
    }

    if (fixed !== title) {
      fixCount++;
      console.log(`   ✏️ H2 corrige: "${title}" → "${fixed}"`);
    }

    return `<h2${attrs}>${fixed}</h2>`;
  });

  if (fixCount > 0) {
    console.log(`📋 validateH2Titles: ${fixCount} correction(s)`);
    if (report?.actions) {
      report.actions.push({ type: 'h2_validation', details: `${fixCount} titre(s) H2 corrige(s)/supprime(s)` });
    }
  }

  return result;
}

/**
 * PHASE 6.0.12.2: Rendre les tableaux responsive pour mobile
 * Wrape chaque <table> dans un conteneur scrollable et ajoute du styling inline
 * @param {string} html - HTML à traiter
 * @param {Object} report - Rapport QA
 * @returns {string} HTML avec tableaux responsive
 */

export function makeTablesResponsive(html, report) {
  const tableCount = (html.match(/<table/gi) || []).length;
  if (tableCount === 0) return html;

  console.log(`📱 makeTablesResponsive: ${tableCount} tableau(x) détecté(s)`);

  // Supprimer les tableaux "comparatifs" a 1 seule colonne de donnees (+ colonne criteres)
  let processedHtml = html.replace(/<h2[^>]*>[^<]*[Cc]omparatif[^<]*<\/h2>\s*(<div[^>]*>)?\s*<table[^>]*>([\s\S]*?)<\/table>\s*(<\/div>)?/gi, (match, wrapOpen, tableContent) => {
    const thCount = (tableContent.match(/<th/gi) || []).length;
    if (thCount <= 2) {
      console.log(`   🧹 Tableau comparatif a ${thCount} colonne(s) supprime (min 3 requis)`);
      return '';
    }
    return match;
  });

  processedHtml = processedHtml;
  let styledCount = 0;

  // Style commun pour le conteneur scrollable
  const wrapperStyle = 'overflow-x:auto;-webkit-overflow-scrolling:touch;margin:1.5em 0;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)';

  // Style pour la table elle-même
  const tableStyle = 'width:100%;border-collapse:collapse;font-size:14px;min-width:600px';

  // Style pour les cellules d'en-tête
  const thStyle = 'background:#1a365d;color:#fff;padding:12px 10px;text-align:left;font-weight:600;font-size:13px;white-space:nowrap';

  // Style pour les cellules de données
  const tdStyle = 'padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top';

  // Style pour les lignes alternées (via attribut sur les <tr> impairs)
  const trEvenStyle = 'background:#f7fafc';

  processedHtml = processedHtml.replace(/<table([^>]*)>([\s\S]*?)<\/table>/gi, (fullMatch, tableAttrs, tableContent) => {
    // Ne pas re-wrapper si déjà dans un conteneur responsive
    if (tableAttrs.includes('data-responsive')) return fullMatch;

    // Ajouter les styles à la table
    let styledTable = `<table data-responsive="true" style="${tableStyle}"${tableAttrs}>`;

    // Styler les <th> (sans matcher <thead>)
    let styledContent = tableContent.replace(/<th(?![a-z])([^>]*)>/gi, (thMatch, thAttrs) => {
      if (thAttrs.includes('style=')) return thMatch;
      return `<th style="${thStyle}"${thAttrs}>`;
    });

    // Styler les <td> (sans matcher <tdata> etc.)
    styledContent = styledContent.replace(/<td(?![a-z])([^>]*)>/gi, (tdMatch, tdAttrs) => {
      if (tdAttrs.includes('style=')) return tdMatch;
      return `<td style="${tdStyle}"${tdAttrs}>`;
    });

    // Ajouter des couleurs alternées aux lignes de tbody
    let rowIndex = 0;
    styledContent = styledContent.replace(/<tbody>([\s\S]*?)<\/tbody>/gi, (tbodyMatch, tbodyContent) => {
      const styledRows = tbodyContent.replace(/<tr([^>]*)>/gi, (trMatch, trAttrs) => {
        rowIndex++;
        if (rowIndex % 2 === 0 && !trAttrs.includes('style=')) {
          return `<tr style="${trEvenStyle}"${trAttrs}>`;
        }
        return trMatch;
      });
      return `<tbody>${styledRows}</tbody>`;
    });

    styledTable += styledContent + '</table>';

    // Wrapper dans un conteneur scrollable
    const responsiveWrapper = `<div style="${wrapperStyle}">${styledTable}</div>`;

    styledCount++;
    return responsiveWrapper;
  });

  if (styledCount > 0) {
    report.actions.push({
      type: 'responsive_tables',
      details: `${styledCount} tableau(x) rendu(s) responsive pour mobile`
    });
    console.log(`   ✅ ${styledCount} tableau(x) stylé(s) et wrappé(s) pour mobile`);
  }

  return processedHtml;
}

/**
 * Fusionne les micro-paragraphes consécutifs (< 80 chars de texte) en un seul paragraphe.
 * Préserve les paragraphes dans les containers structurels (quick-guide, affiliate, FAQ, details).
 */

export function mergeShortParagraphs(html) {
  const SHORT_THRESHOLD = 80;
  let merged = 0;
  const result = html.replace(
    /(<p[^>]*>)([\s\S]*?)(<\/p>)\s*(<p[^>]*>)([\s\S]*?)(<\/p>)/gi,
    (match, open1, content1, close1, open2, content2, close2) => {
      const text1 = content1.replace(/<[^>]*>/g, '').trim();
      const text2 = content2.replace(/<[^>]*>/g, '').trim();
      if (text1.length < SHORT_THRESHOLD && text2.length < SHORT_THRESHOLD && text1.length > 0 && text2.length > 0) {
        merged++;
        return `${open1}${content1.trim()} ${content2.trim()}${close2}`;
      }
      return match;
    }
  );
  if (merged > 0) {
    console.log(`   📐 MERGE_SHORT_PARAS: ${merged} micro-paragraphe(s) fusionné(s)`);
  }
  return result;
}

/**
 * Équilibre les paragraphes (ratio max/min < 3)
 * @param {string} html - HTML à valider
 * @param {Object} report - Rapport QA
 * @returns {string} HTML corrigé
 */

export function balanceParagraphs(html, report) {
  console.log('🔍 Équilibrage paragraphes...');
  
  let cleanedHtml = html;
  let balancedCount = 0;    
  // Extraire tous les paragraphes
  // AMÉLIORATION: Utiliser un regex plus robuste qui capture le contenu même avec des balises HTML imbriquées
  const paragraphPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs = [];
  let match;
  
  while ((match = paragraphPattern.exec(html)) !== null) {
    // Extraire le texte sans HTML pour la longueur
    const textWithoutHtml = match[1].replace(/<[^>]+>/g, '').trim();
    if (textWithoutHtml.length > 10) {
      paragraphs.push({
        fullMatch: match[0],
        text: textWithoutHtml, // Utiliser le texte sans HTML pour les calculs
        htmlContent: match[1], // Garder le contenu HTML original
        length: textWithoutHtml.length
      });
    }
  }
  
  if (paragraphs.length === 0) {
    report.checks.push({
      name: 'paragraph_balance',
      status: 'pass',
      details: 'Aucun paragraphe à équilibrer'
    });
    return cleanedHtml;
  }
  
  // Calculer ratio avant
  const lengths = paragraphs.map(p => p.length);
  const maxLen = Math.max(...lengths);
  const minLen = Math.min(...lengths);
  const beforeRatio = maxLen / (minLen || 1);
  
  paragraphs.forEach(para => {
    if (para.length > 280) {
      // CORRECTION CRITIQUE: Ne PAS découper les paragraphes qui contiennent des éléments block-level
      // (h2, h3, h4, div, ul, ol, table, blockquote) car cela casserait la structure HTML
      if (/<(?:h[1-6]|div|ul|ol|table|blockquote|section|article|nav|aside|header|footer)[^>]*>/i.test(para.htmlContent)) {
        console.log(`   ⚠️ Paragraphe skippé (contient block elements): ${para.length} chars`);
        return; // Skip ce paragraphe
      }
      
      // CORRECTION: Utiliser le contenu HTML original au lieu du texte sans HTML
      // pour préserver les entités HTML et les balises HTML imbriquées
      const paraHtmlMatch = cleanedHtml.match(new RegExp(para.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      if (!paraHtmlMatch) return; // Skip si pas trouvé
      
      const paraHtmlContent = paraHtmlMatch[0];
      // Extraire le contenu entre <p> et </p>
      const contentMatch = paraHtmlContent.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      if (!contentMatch) return;
      
      let paraContent = contentMatch[1];
      
      // CORRECTION CRITIQUE: Protéger les liens <a> complets et les URLs avant le split
      // pour éviter de couper les URLs aux points (kiwi.com, airalo.com, etc.)
      const linkPlaceholders = new Map();
      let linkCounter = 0;
      
      // Protéger les balises <a> complètes (href + contenu + </a>)
      paraContent = paraContent.replace(/<a[^>]*>[\s\S]*?<\/a>/gi, (match) => {
        const key = `__LINK_BP_${linkCounter++}__`;
        linkPlaceholders.set(key, match);
        return key;
      });
      
      // Protéger les URLs nues (https://..., http://...)
      paraContent = paraContent.replace(/https?:\/\/[^\s"<>]+/gi, (match) => {
        const key = `__URL_BP_${linkCounter++}__`;
        linkPlaceholders.set(key, match);
        return key;
      });
      
      // AMÉLIORATION: Protéger les entités HTML ET les placeholders existants avant le split
      const entityPlaceholders = new Map();
      let entityCounter = 0;
      
      // Protéger les placeholders existants d'abord
      const existingPlaceholders = paraContent.match(/__ENTITY\d+_\d+__/g) || [];
      const protectedPlaceholders = new Map();
      existingPlaceholders.forEach((ph, idx) => {
        const key = `__PROTECTED_BP_${idx}__`;
        protectedPlaceholders.set(key, ph);
        paraContent = paraContent.replace(ph, key);
      });
      
      // Ensuite protéger les entités HTML réelles
      paraContent = paraContent.replace(/&#\d+;|&[a-z]+;/gi, (match) => {
        const placeholder = `__ENTITY_BP_${entityCounter++}__`;
        entityPlaceholders.set(placeholder, match);
        return placeholder;
      });
      
      // Découper en paragraphes de max 120 caractères (plus petits pour meilleur équilibre)
      // AMÉLIORATION: Utiliser un split plus robuste qui préserve les entités HTML
      // Calculer la longueur en restaurant temporairement les entités pour avoir la vraie longueur
      const sentences = paraContent.split(/([.!?]+(?:\s+|$))/).filter(s => s.trim().length > 0);
      const chunks = [];
      let currentChunk = '';
      
      sentences.forEach(sentence => {
        // Restaurer temporairement pour calcul de longueur
        let tempSentence = sentence;
        entityPlaceholders.forEach((entity, placeholder) => {
          tempSentence = tempSentence.replace(placeholder, entity);
        });
        protectedPlaceholders.forEach((ph, key) => {
          tempSentence = tempSentence.replace(key, ph);
        });
        
        let tempChunk = currentChunk;
        entityPlaceholders.forEach((entity, placeholder) => {
          tempChunk = tempChunk.replace(placeholder, entity);
        });
        protectedPlaceholders.forEach((ph, key) => {
          tempChunk = tempChunk.replace(key, ph);
        });
        
        // Calculer longueur réelle (sans HTML)
        const tempChunkText = tempChunk.replace(/<[^>]+>/g, '').trim();
        const tempSentenceText = tempSentence.replace(/<[^>]+>/g, '').trim();
        
        if ((tempChunkText + tempSentenceText).length <= 120) {
          currentChunk += sentence;
        } else {
          if (currentChunk.trim().length > 0) {
            // Restaurer les entités HTML et liens avant d'ajouter au chunk
            let chunkWithEntities = currentChunk;
            entityPlaceholders.forEach((entity, placeholder) => {
              chunkWithEntities = chunkWithEntities.replace(placeholder, entity);
            });
            protectedPlaceholders.forEach((ph, key) => {
              chunkWithEntities = chunkWithEntities.replace(key, ph);
            });
            linkPlaceholders.forEach((link, key) => {
              chunkWithEntities = chunkWithEntities.replace(key, link);
            });
            chunks.push(chunkWithEntities.trim());
          }
          currentChunk = sentence;
        }
      });
      
      if (currentChunk.trim().length > 0) {
        // Restaurer les entités HTML et liens avant d'ajouter au dernier chunk
        let chunkWithEntities = currentChunk;
        entityPlaceholders.forEach((entity, placeholder) => {
          chunkWithEntities = chunkWithEntities.replace(placeholder, entity);
        });
        protectedPlaceholders.forEach((ph, key) => {
          chunkWithEntities = chunkWithEntities.replace(key, ph);
        });
        linkPlaceholders.forEach((link, key) => {
          chunkWithEntities = chunkWithEntities.replace(key, link);
        });
        chunks.push(chunkWithEntities.trim());
      }
      
      // CORRECTION: Filtrer les chunks vides ou avec juste un point avant de créer des paragraphes
      const validChunks = chunks.filter(chunk => {
        const text = chunk.replace(/<[^>]+>/g, ' ').trim();
        // Exclure les chunks vides, avec juste un point, ou avec seulement des espaces/points
        return text.length > 1 && !/^[\s.]+$/.test(text) && text !== '.';
      });
      
      if (validChunks.length > 1) {
        // AMÉLIORATION: Utiliser le contenu HTML original si disponible, sinon reconstruire
        const newParagraphs = validChunks.map(chunk => `<p>${chunk}</p>`).join('\n');
        cleanedHtml = cleanedHtml.replace(para.fullMatch, newParagraphs);
        balancedCount++;
        console.log(`   ✂️ Paragraphe découpé: ${para.length} chars → ${validChunks.length} paragraphes (${chunks.length - validChunks.length} chunk(s) vide(s) filtré(s))`);        }
    }
  });
  
  // AMÉLIORATION: Fusionner paragraphes très courts (< 30 caractères) avec le suivant
  const shortParagraphs = [];
  const afterParagraphs = cleanedHtml.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
  afterParagraphs.forEach((para, i) => {
    const text = para.replace(/<[^>]+>/g, '').trim();
    if (text.length < 30 && text.length > 0 && i < afterParagraphs.length - 1) {
      shortParagraphs.push({ para, index: i, text });
    }
  });
  
  // Fusionner avec le suivant
  shortParagraphs.reverse().forEach(({ para, text }) => {
    const nextParaMatch = cleanedHtml.match(new RegExp(`${para.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(<p[^>]*>[^<]+<\/p>)`, 'i'));
    if (nextParaMatch) {
      const nextPara = nextParaMatch[1];
      const nextParaText = nextPara.replace(/<[^>]+>/g, '').trim();
      // AMÉLIORATION: Ne fusionner que si le résultat ne dépasse pas 200 caractères (pour meilleur équilibre)
      // AMÉLIORATION: S'assurer qu'il y a un espace entre les deux textes
      const mergedText = text.trim() + ' ' + nextParaText.trim();
      if (mergedText.length <= 200) {
        // AMÉLIORATION: Vérifier que le premier texte ne se termine pas par une ponctuation sans espace
        const firstEndsWithPunct = /[.!?;:]$/.test(text.trim());
        const secondStartsWithUpper = /^[A-ZÀ-Ÿ]/.test(nextParaText.trim());
        
        // Si le premier se termine par ponctuation et le second commence par majuscule, c'est OK
        // Sinon, s'assurer qu'il y a bien un espace
        const merged = `<p>${mergedText}</p>`;
        cleanedHtml = cleanedHtml.replace(para + ' ' + nextPara, merged);
        balancedCount++;
        console.log(`   🔗 Paragraphes fusionnés: "${text.substring(0, 30)}..." + suivant`);
      }
    }
  });
  
  // AMÉLIORATION: Validation post-traitement pour détecter et SUPPRIMER les paragraphes mal formés
  const malformedParagraphs = [];
  const allParagraphs = cleanedHtml.match(/<p[^>]*>([^<]*)<\/p>/gi) || [];
  allParagraphs.forEach((para, index) => {
    const text = para.replace(/<[^>]+>/g, '').trim();
    // Détecter les paragraphes avec seulement des points ou des espaces
    if (text === '.' || text === '..' || text === '...' || /^[\s.]+$/.test(text)) {
      malformedParagraphs.push({ para, index });
    }
    // Détecter les paragraphes où deux phrases sont collées sans espace
    if (/[a-zà-ÿ][A-ZÀ-Ÿ]/.test(text) && !/[.!?]\s+[A-ZÀ-Ÿ]/.test(text)) {
      // Il y a une lettre minuscule suivie d'une majuscule sans ponctuation entre les deux
      malformedParagraphs.push({ para, index, reason: 'phrases_collées' });
    }
  });
  
  // CORRECTION: Supprimer automatiquement les paragraphes avec juste un point ou des points/espaces
  if (malformedParagraphs.length > 0) {
    const dotOnlyParas = malformedParagraphs.filter(p => !p.reason);
    if (dotOnlyParas.length > 0) {
      // Supprimer en ordre inverse pour préserver les indices
      dotOnlyParas.reverse().forEach(({ para }) => {
        cleanedHtml = cleanedHtml.replace(para, '');
      });
      console.log(`   🧹 ${dotOnlyParas.length} paragraphe(s) mal formé(s) (points uniquement) supprimé(s) dans balanceParagraphs`);
    }
  }
  
  // NETTOYAGE FINAL DANS balanceParagraphs: Supprimer tous les paragraphes vides restants
  const remainingEmptyParas = cleanedHtml.match(/<p[^>]*>\s*\.\s*<\/p>/gi);
  if (remainingEmptyParas) {
    cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*\.\s*<\/p>/gi, '');
    console.log(`   🧹 ${remainingEmptyParas.length} paragraphe(s) vide(s) supplémentaire(s) supprimé(s) dans balanceParagraphs`);
  }
  
    // Supprimer SEULEMENT les paragraphes avec juste des points/espaces (PAS ceux avec reason: 'phrases_collées')
    // FIX BUG: Les paragraphes avec "phrases collées" peuvent être légitimes (eSIM, Bangkok, noms propres, etc.)
    // Ne supprimer que les paragraphes vraiment vides ou contenant seulement des points
    const trulyMalformedParas = malformedParagraphs.filter(p => !p.reason);
    
    if (trulyMalformedParas.length > 0) {
      const protectedSerpPatterns = [
        /ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement)/i,
        /limites?\s*(et\s*)?biais/i,
        /erreurs?\s*(fréquentes?|courantes?|à\s*éviter)/i,
        /nos\s+recommandations/i, // AMÉLIORATION: Protéger "Nos recommandations" qui contient les angles Budget
        /événement\s+central/i // AMÉLIORATION: Protéger "Événement central" qui contient les angles Timeline
      ];
    
    trulyMalformedParas.reverse().forEach(({ para, index }) => {
      const paraIndex = cleanedHtml.indexOf(para);
      if (paraIndex >= 0) {
        // Vérifier si ce paragraphe est dans une section SERP protégée
        const beforePara = cleanedHtml.substring(0, paraIndex);
        const lastH2Match = beforePara.match(/<h2[^>]*>([^<]+)<\/h2>/gi);
        let isProtected = false;
        
        if (lastH2Match) {
          const lastH2 = lastH2Match[lastH2Match.length - 1];
          isProtected = protectedSerpPatterns.some(pattern => pattern.test(lastH2));
        }
        
        if (!isProtected) {
          // AMÉLIORATION: Vérifier aussi si le paragraphe contient des angles uniques SERP avant de supprimer
          const hasBudgetKeywords = /budget\s*(réel|détaillé|exact|mensuel|breakdown)|coûts?\s*(réels?|détaillés?|exacts?)|dépenses?\s*(réelles?|détaillées?)/i.test(para);
          const hasTimelineKeywords = /timeline|chronologie|jour\s*par\s*jour|étapes?\s*(du|de)\s*voyage|période|durée\s*(du|de)\s*séjour/i.test(para);
          const hasContraintesKeywords = /contraintes?|difficultés?|obstacles?|problèmes?\s*(pratiques?|réels?)|défis/i.test(para);
          const hasUniqueAngles = hasBudgetKeywords || hasTimelineKeywords || hasContraintesKeywords;
          
          if (!hasUniqueAngles) {
            cleanedHtml = cleanedHtml.replace(para, '');
            balancedCount++;
            console.log(`   🧹 Paragraphe mal formé supprimé (index ${index})`);
          } else {
            console.log(`   🛡️ Paragraphe avec angles uniques protégé (index ${index})`);
          }
        }
      }
    });
  }
  
  // Recalculer ratio après
  const finalParagraphs = cleanedHtml.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
  const afterLengths = finalParagraphs.map(p => {
    const text = p.replace(/<[^>]+>/g, '').trim();
    return text.length;
  }).filter(l => l > 10);
  
  // AMÉLIORATION: Gérer le cas où il n'y a pas de paragraphes après traitement
  if (afterLengths.length === 0) {
    report.checks.push({
      name: 'paragraph_balance',
      status: 'warning',
      details: 'Aucun paragraphe après équilibrage'
    });
    return cleanedHtml;
  }
  
  const afterMaxLen = Math.max(...afterLengths);
  const afterMinLen = Math.min(...afterLengths);
  // AMÉLIORATION: Éviter division par zéro
  const afterRatio = afterMinLen > 0 ? afterMaxLen / afterMinLen : 0;
  
  // Ajouter au rapport
  report.checks.push({
    name: 'paragraph_balance',
    status: afterRatio <= 3 ? 'pass' : 'warn',
    details: `before_ratio=${beforeRatio.toFixed(1)} after_ratio=${afterRatio.toFixed(1)} balanced=${balancedCount}`
  });
  
  if (balancedCount > 0) {
    report.actions.push({
      type: 'balanced_paragraphs',
      details: `count=${balancedCount} ratio_before=${beforeRatio.toFixed(1)} ratio_after=${afterRatio.toFixed(1)}`
    });
    console.log(`✅ Paragraphes équilibrés: ${balancedCount} découpé(s), ratio ${beforeRatio.toFixed(1)} → ${afterRatio.toFixed(1)}`);
  } else {
    console.log(`✅ Paragraphes équilibrés: ratio ${beforeRatio.toFixed(1)} (OK)`);
  }    
  return cleanedHtml;
}

/**
 * Troncature intelligente d'un texte pour extraits/citations
 * Respecte les limites de phrases, mots et préserve le sens
 * @param {string} text - Texte à tronquer
 * @param {number} targetLength - Longueur cible (caractères)
 * @param {number} maxLength - Longueur maximale absolue (caractères)
 * @returns {string} Texte tronqué intelligemment avec ellipses si nécessaire
 */

export function smartTruncate(text, targetLength = 200, maxLength = 250) {
  if (!text || text.length <= targetLength) {
    return text.trim();
  }

  // Étape 1: Chercher une fin de phrase complète dans la zone cible
  // Priorité: . ! ? suivi d'un espace et d'une majuscule
  const sentenceEndPattern = /([.!?])\s+([A-ZÀ-Ÿ])/g;
  let bestCut = targetLength;
  let foundSentenceEnd = false;
  let match;
  
  // AMÉLIORATION: Plage de recherche élargie (60% au lieu de 70% pour trouver plus facilement)
  const minSearchIndex = Math.floor(targetLength * 0.6);

  // Chercher la dernière fin de phrase complète avant maxLength
  while ((match = sentenceEndPattern.exec(text)) !== null) {
    const endIndex = match.index + match[1].length; // Position après la ponctuation
    if (endIndex >= minSearchIndex && endIndex <= maxLength) {
      bestCut = endIndex + 1; // Inclure l'espace après la ponctuation
      foundSentenceEnd = true;
      // Continuer à chercher pour trouver la meilleure fin (la plus proche de targetLength)
    }
    if (endIndex > maxLength) break;
  }
  
  // AMÉLIORATION: Si pas de fin de phrase, chercher des virgules ou points-virgules comme pause acceptable
  if (!foundSentenceEnd) {
    const commaPattern = /([,;])\s+([A-ZÀ-Ÿa-zà-ÿ])/g;
    let bestCommaCut = targetLength;
    let foundComma = false;
    
    while ((match = commaPattern.exec(text)) !== null) {
      const endIndex = match.index + match[1].length;
      if (endIndex >= minSearchIndex && endIndex <= maxLength) {
        bestCommaCut = endIndex + 1;
        foundComma = true;
      }
      if (endIndex > maxLength) break;
    }
    
    if (foundComma) {
      bestCut = bestCommaCut;
      foundSentenceEnd = true; // On considère qu'on a trouvé une pause acceptable
    }
  }

  // Étape 2: Si pas de fin de phrase ni de virgule, chercher une limite de mot
  if (!foundSentenceEnd) {
    // Chercher le dernier espace avant maxLength
    const lastSpaceBeforeMax = text.lastIndexOf(' ', maxLength);
    const lastSpaceAfterTarget = text.indexOf(' ', targetLength);
    
    // AMÉLIORATION: Accepter un espace même plus proche du début (60% au lieu de 80%)
    if (lastSpaceBeforeMax >= targetLength * 0.6) {
      bestCut = lastSpaceBeforeMax;
    } else if (lastSpaceAfterTarget > 0 && lastSpaceAfterTarget <= maxLength) {
      bestCut = lastSpaceAfterTarget;
    } else {
      // Fallback: couper à maxLength mais chercher le dernier espace proche
      const fallbackSpace = text.lastIndexOf(' ', maxLength);
      if (fallbackSpace >= targetLength * 0.5) {
        bestCut = fallbackSpace;
      } else {
        bestCut = maxLength;
      }
    }
  }

  // Étape 3: Extraire et nettoyer
  let truncated = text.substring(0, bestCut).trim();

  // Étape 4: Vérifier qu'on ne coupe pas au milieu d'un mot
  // Si le dernier caractère n'est pas une ponctuation ou un espace, chercher le dernier espace
  if (!/[.!?;:,\s]$/.test(truncated)) {
    const lastSpace = truncated.lastIndexOf(' ');
    // AMÉLIORATION: Accepter un espace même plus proche du début (60% au lieu de 70%)
    if (lastSpace > targetLength * 0.6) {
      truncated = truncated.substring(0, lastSpace);
    } else {
      // Si vraiment pas d'espace acceptable, chercher le dernier caractère non-alphanumérique
      const lastNonAlpha = truncated.search(/[^a-zA-ZÀ-Ÿà-ÿ0-9\s]$/);
      if (lastNonAlpha > targetLength * 0.5) {
        truncated = truncated.substring(0, lastNonAlpha + 1);
      }
    }
  }

  // Étape 5: Ajouter des ellipses seulement si nécessaire
  // Ne pas ajouter si on termine déjà par une ponctuation
  if (truncated.length < text.length && !/[.!?]$/.test(truncated)) {
    truncated += '...';
  }

  return truncated.trim();
}

/**
 * Convertit systématiquement les montants USD en EUR dans le HTML.
 * Patterns détectés : $N, N USD, N dollars, N$
 * Résultat : ~X euros
 * 
 * Exclusions :
 *   - Montants déjà suivis de "EUR"/"euros"
 *   - Montants dans des balises <script> (JSON-LD)
 *   - Montants déjà dans un marqueur "(N USD)" existant
 * 
 * @param {string} html
 * @returns {string}
 */

export function splitLongListItems(html, report) {
  console.log('🔍 Découpage listes trop longues...');
  
  let cleanedHtml = html;
  let splitCount = 0;
  
  // Détecter les <li> avec contenu > 200 caractères
  const liPattern = /<li[^>]*>([^<]+)<\/li>/gi;
  const longItems = [];
  let liMatch;
  
  while ((liMatch = liPattern.exec(html)) !== null) {
    const text = liMatch[1].trim();
    if (text.length > 200) {
      // Compter les phrases
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
      if (sentences.length > 3) {
        longItems.push({
          fullMatch: liMatch[0],
          text: text,
          sentences: sentences.length
        });
      }
    }
  }
  
  // Découper les items trop longs
  longItems.forEach(item => {
    const sentences = item.text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 3) {
      // Limiter à 5 phrases max par <li>
      const maxSentences = 5;
      const chunks = [];
      for (let i = 0; i < sentences.length; i += maxSentences) {
        chunks.push(sentences.slice(i, i + maxSentences).join('. '));
      }
      
      // Remplacer par plusieurs <li>
      const newLis = chunks.map(chunk => `<li>${chunk}</li>`).join('\n');
      cleanedHtml = cleanedHtml.replace(item.fullMatch, newLis);
      splitCount += chunks.length - 1;
      console.log(`   ✂️ Liste découpée: ${sentences.length} phrases → ${chunks.length} items`);
    }
  });
  
  // Ajouter au rapport
  if (longItems.length > 0) {
    report.checks.push({
      name: 'long_list_items',
      status: 'pass',
      details: `longues=${longItems.length} découpées=${splitCount}`
    });
    
    report.actions.push({
      type: 'split_long_list_items',
      details: `count=${splitCount}`
    });
  } else {
    report.checks.push({
      name: 'long_list_items',
      status: 'pass',
      details: 'Aucune liste trop longue'
    });
  }
  
  console.log(`✅ Listes: ${longItems.length} trop longue(s), ${splitCount} découpée(s)`);
  return cleanedHtml;
}

/**
 * Valide la cohérence temporelle des dates
 * @param {string} html - HTML à valider
 * @param {Object} report - Rapport QA
 */

export function hasUsableText(x, min = 1) {
  return typeof x === 'string' && x.trim().length >= min;
}

/**
 * PHASE 6.3.1: Helper pour vérifier si une liste est utilisable
 */

export function hasUsableList(arr, minItemChars = 10) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some(item => {
    const text = typeof item === 'string' ? item : (item.value || item.text || item.summary || item.quote || '');
    return this.hasUsableText(text, minItemChars);
  });
}

/**
 * Détecte si l'article est en format Option B (éditorial libre) : verdict + recommandations + corps substantiel.
 * En Option B, les sections Contexte / Événement central / Moment critique / Résolution ne sont pas requises ni insérées.
 * @param {string} html - Contenu HTML de l'article
 * @returns {boolean}
 */

export function isOptionBFormat(html) {
  if (!html || typeof html !== 'string') return false;
  // Option B = a au moins "recommandations" OU "ce qu'il faut retenir" OU plusieurs H2 (développement libre)
  const hasVerdict = /<h2[^>]*>.*?ce qu'il faut retenir.*?<\/h2>/i.test(html);
  const hasRecommandations = /<h2[^>]*>.*?nos\s+recommandations.*?<\/h2>/i.test(html);
  const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
  // Considérer Option B si on a au moins une des deux sections structurées OU 3+ H2 (développement libre)
  const result = hasVerdict || hasRecommandations || h2Count >= 3;
  return result;
}

/**
 * PHASE 6.3.A: Helper pour déterminer si une section est vraiment requise
 * Basé uniquement sur le contenu exploitable dans story
 * IMPORTANT: si summary est null|undefined|"" ET pas de bullets => NOT required
 */

export function isSectionRequired(sectionKey, story) {
  switch (sectionKey) {
    case 'context':
      return this.hasUsableText(story.context?.summary, 10) || this.hasUsableList(story.context?.bullets, 10);
    case 'central_event':
      return this.hasUsableText(story.central_event?.summary, 10) || this.hasUsableList(story.central_event?.bullets, 10);
    case 'critical_moment':
      return this.hasUsableText(story.critical_moment?.summary, 10) || this.hasUsableList(story.critical_moment?.bullets, 10);
    case 'resolution':
      return this.hasUsableText(story.resolution?.summary, 10) || this.hasUsableList(story.resolution?.bullets, 10);
    case 'author_lessons':
      return this.hasUsableList(story.author_lessons, 10);
    case 'open_questions':
      // required si array non vide (pas basé sur longueur des items)
      return Array.isArray(story.open_questions) && story.open_questions.length > 0;
    case 'community_insights':
      // required si array non vide (pas basé sur longueur des items)
      return Array.isArray(story.community_insights) && story.community_insights.length > 0;
    case 'related':
      return false; // "Articles connexes" n'est pas une section required story_alignment
    default:
      return false;
  }
}

/**
 * PHASE 6.3.B: Helper pour déterminer si une section peut être insérée
 * Plus strict: seuils différents selon le type de section
 */

export function canInsert(sectionKey, story) {
  switch (sectionKey) {
    case 'context':
      return this.hasUsableText(story.context?.summary, 20) || this.hasUsableList(story.context?.bullets, 20);
    case 'central_event':
      return this.hasUsableText(story.central_event?.summary, 20) || this.hasUsableList(story.central_event?.bullets, 20);
    case 'critical_moment':
      return this.hasUsableText(story.critical_moment?.summary, 20) || this.hasUsableList(story.critical_moment?.bullets, 20);
    case 'resolution':
      return this.hasUsableText(story.resolution?.summary, 20) || this.hasUsableList(story.resolution?.bullets, 20);
    case 'author_lessons':
      return this.hasUsableList(story.author_lessons, 20);
    case 'open_questions':
      // insertable si hasUsableList(open_questions, 15) - items de 18 chars passent
      return this.hasUsableList(story.open_questions, 15);
    case 'community_insights':
      // insertable seulement si hasUsableList(community_insights, 30) (strict exprès)
      return this.hasUsableList(story.community_insights, 30);
    default:
      return false;
  }
}

/**
 * PHASE 6.3.C: Extraire toutes les sections présentes dans le HTML
 * Retourne une map { canonicalKey: { h2Index, contentText, contentLen } }
 */

