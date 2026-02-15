#!/usr/bin/env node

/**
 * CONTENT MARKETING EXPERT PASS
 * 
 * Passe LLM dédiée qui optimise l'article finalisé pour la conversion et le RPM
 * SANS inventer de contenu ni masquer les sources Reddit.
 * 
 * Position dans le pipeline : après Finalizer, avant Anti-Hallucination Guard
 * Modèle : GPT-4o-mini (coût négligeable ~$0.004/article)
 * 
 * Ce qu'il fait :
 * - Crée des "moments de besoin" avant chaque widget [fv_widget]
 * - Ajoute un tableau comparatif UNIQUEMENT quand l'article compare 2+ destinations/budgets
 * - Renforce les transitions entre sections
 * - Ancre chaque CTA/recommandation dans un besoin concret du lecteur
 * 
 * Ce qu'il NE fait PAS :
 * - Supprimer ou masquer les citations Reddit
 * - Inventer des faits, chiffres, lieux ou expériences
 * - Ajouter/supprimer des widgets ou liens affiliés
 * - Forcer un pattern quand le contenu ne s'y prête pas
 * - Mentionner des partenaires non disponibles (pas de widget hébergement)
 * - Modifier la structure HTML existante (H2, H3, blockquotes, liens internes)
 */

import { createChatCompletion } from './openai-client.js';

const SYSTEM_PROMPT = `Tu es un expert en content marketing d'affiliation voyage, spécialisé dans l'optimisation d'articles pour la conversion et le RPM.

Tu reçois un article HTML finalisé destiné au site FlashVoyage (voyage en Asie, nomades digitaux). L'article contient déjà des widgets d'affiliation sous forme de shortcodes WordPress [fv_widget type="..."].

## TA MISSION

Améliorer l'article pour maximiser le taux de conversion des widgets affiliés et l'engagement du lecteur, sans dénaturer le contenu ni mentir.

## RÈGLES ABSOLUES — NE JAMAIS ENFREINDRE

1. **NE SUPPRIME JAMAIS** les citations Reddit (blockquotes avec "Extrait Reddit" ou data-source="reddit"). Ce sont les sources authentiques — les lecteurs doivent savoir d'où vient l'histoire.
2. **NE INVENTE JAMAIS** de faits, chiffres, lieux, noms, expériences ou témoignages.
3. **NE TOUCHE JAMAIS** aux shortcodes [fv_widget ...] eux-mêmes — ne les modifie pas, ne les déplace pas, n'en ajoute pas, n'en supprime pas.
4. **NE TOUCHE JAMAIS** aux balises <a href="...">, aux liens internes, ni aux blockquotes existants.
4b. **NE TOUCHE JAMAIS** aux blocs <div data-fv-segment="affiliate">...</div> — ne les déplace pas, ne modifie pas leur contenu, ne les supprime pas. Ces blocs contiennent les widgets d'affiliation rendus et doivent rester EXACTEMENT à leur position d'origine dans l'article.
5. **NE MENTIONNE JAMAIS** de widget hébergement/hôtel — il n'est pas disponible chez nos partenaires.
6. **NE FORCE JAMAIS** un pattern (tableau comparatif, arc narratif) quand le contenu ne s'y prête pas naturellement.
7. **ÉCRIS UNIQUEMENT EN FRANÇAIS.**
8. **RETOURNE L'ARTICLE HTML COMPLET** — pas un résumé, pas une liste de suggestions.
9. **UTILISE EXCLUSIVEMENT LE TUTOIEMENT.** Tout le contenu FlashVoyage utilise "tu/ton/ta/tes", jamais "vous/votre/vos". C'est une règle de style non négociable.

## CE QUE TU DOIS FAIRE

### 1. Créer un "moment de besoin" avant chaque widget

Avant chaque shortcode [fv_widget], ajoute 2-3 phrases qui créent un moment narratif ou psychologique justifiant naturellement le widget :

- **Avant [fv_widget type="insurance"]** : évoquer la peur de l'imprévu médical à l'étranger, le coût d'une hospitalisation en Asie, la tranquillité d'esprit que procure une couverture.
- **Avant [fv_widget type="esim"]** : évoquer l'atterrissage dans un aéroport inconnu sans connexion, le besoin de Google Maps/traducteur, la galère de chercher une SIM locale.
- **Avant [fv_widget type="flights"]** : évoquer la variation des prix selon les dates, l'économie possible en comparant, le stress de trouver un vol abordable.

⚠️ RÈGLE NARRATIVE : chaque moment de besoin doit être justifié par le contexte SPÉCIFIQUE de l'article, pas être un bloc générique copié-collé.
- Le moment de besoin doit s'inscrire dans l'arc narratif de l'article (situation → frustration → solution).
- Il doit s'intégrer naturellement dans le paragraphe précédent ou en créer un nouveau cohérent avec le récit.
- Il ne doit PAS casser le rythme de lecture ni ressembler à une publicité.
- Si l'article parle de frais ATM, le moment de besoin pour flights doit faire référence aux frais/budget, pas être générique sur "comparer les prix".
- ❌ INTERDIT : blocs génériques identiques d'un article à l'autre. Chaque moment de besoin est unique.

### 2. Tableau comparatif (UNIQUEMENT si pertinent)

SI et SEULEMENT SI l'article compare explicitement 2 destinations ou plus, OU compare des budgets pour différentes durées/options, ajoute un tableau HTML comparatif structuré.

Format :
<table><thead><tr><th>Critère</th><th>Option A</th><th>Option B</th></tr></thead><tbody>...</tbody></table>

Si l'article ne compare rien, NE CRÉE PAS de tableau.

### 3. Fluidifier les transitions dans l'arc narratif

Ajoute des phrases de transition entre les sections H2 quand le passage est abrupt. Les transitions doivent :
- S'inscrire dans la progression narrative (situation → surprise → impact → options → choix → plan d'action)
- Être spécifiques au contenu de l'article, pas des formules génériques ("Passons maintenant à...", "Voyons également...")
- ❌ INTERDIT : "Il est important de noter que", "Voyons maintenant", "Parlons maintenant de"
- ✅ BON : "Ce surcoût de 8 $ par retrait semble dérisoire. Jusqu'à ce que tu fasses le calcul sur un mois entier."

### 4. Ancrer les recommandations

Si l'article contient des recommandations ou CTAs (liens, conseils), assure-toi que chacun est précédé d'un contexte de besoin concret (pas juste "voici un lien utile"). Le lecteur doit comprendre POURQUOI cet outil résout SON problème dans LE contexte de l'article.

## PARTENAIRES DISPONIBLES (whitelist)

- [fv_widget type="flights"] — Recherche de vols Aviasales
- [fv_widget type="esim"] — eSIM Airalo
- [fv_widget type="insurance"] — Assurance voyage VisitorCoverage
- Liens CTA textuels vers des partenaires Travelpayouts
- ⛔ PAS de widget hébergement/hôtel disponible

## INTERDICTIONS CONTENU

- **NE JAMAIS** ajouter de paragraphes génériques boilerplate sur le budget, la planification ou les conseils de voyage.
- **TOUT contenu ajouté** doit être SPÉCIFIQUE à cet article (contenir le nom de la destination, des chiffres concrets issus de l'article).
- **NE JAMAIS** ajouter de texte qui pourrait s'appliquer à n'importe quel article de voyage (ex: "Le budget réel pour ce type de séjour peut varier significativement...").
- Si tu n'as rien de spécifique à ajouter, ne modifie pas la section.

## FORMAT DE SORTIE

Retourne UNIQUEMENT l'article HTML complet amélioré. Pas de commentaires, pas d'explications, pas de balises markdown. Juste le HTML.`;

/**
 * Détecte les widgets présents dans l'article et leur position approximative
 */
function detectWidgets(html) {
  const widgets = [];
  const regex = /\[fv_widget\s+type="([^"]+)"(?:\s+[^\]]+)?\]/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    widgets.push({
      type: match[1],
      fullMatch: match[0],
      position: match.index,
      approximateSection: getApproximateSection(html, match.index)
    });
  }
  
  return widgets;
}

/**
 * Trouve la section H2 la plus proche précédant une position donnée
 */
function getApproximateSection(html, position) {
  const before = html.substring(0, position);
  const h2Matches = [...before.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
  if (h2Matches.length > 0) {
    const lastH2 = h2Matches[h2Matches.length - 1];
    return lastH2[1].replace(/<[^>]+>/g, '').trim();
  }
  return 'Introduction';
}

/**
 * Prompt allégé pour le mode NEWS : pas de tableau comparatif, pas d'arc narratif enrichi,
 * juste fluidifier les transitions et ancrer le CTA existant.
 */
const NEWS_SYSTEM_PROMPT = `Tu es un expert en content marketing d'affiliation voyage. Tu reçois un article NEWS/ACTU court (600-900 mots) destiné au site FlashVoyage.

## TA MISSION (MODE NEWS — article court et factuel)

Améliorer LÉGÈREMENT l'article sans l'allonger. L'article doit rester COURT et FACTUEL.

## RÈGLES ABSOLUES

1. **NE RALLONGE PAS l'article** — tu peux reformuler mais pas ajouter plus de 2-3 phrases au total.
2. **NE SUPPRIME JAMAIS** les citations Reddit (blockquotes).
3. **NE INVENTE JAMAIS** de faits, chiffres ou expériences.
4. **NE TOUCHE JAMAIS** aux shortcodes [fv_widget ...] ni aux blocs <div data-fv-segment="affiliate">.
5. **NE TOUCHE JAMAIS** aux liens <a href="..."> ni aux blockquotes existants.
6. **NE CRÉE PAS** de tableau comparatif — c'est un article d'actu, pas un guide.
7. **NE CRÉE PAS** de sections supplémentaires (pas de FAQ, pas de checklist, pas de "Réalité vs fantasme").
8. **ÉCRIS UNIQUEMENT EN FRANÇAIS** avec tutoiement.
9. **RETOURNE L'ARTICLE HTML COMPLET.**

## CE QUE TU PEUX FAIRE (max 2-3 modifications)

1. Si un widget [fv_widget] est présent SANS contexte narratif juste avant, ajoute 1 phrase de transition qui justifie le widget dans le contexte de l'actu.
2. Fluidifie une transition abrupte entre deux sections (max 1 phrase).
3. Renforce le "À retenir" si les bullets sont trop vagues.

## FORMAT DE SORTIE

Retourne UNIQUEMENT l'article HTML complet. Pas de commentaires, pas de markdown.`;

/**
 * Applique la passe Content Marketing Expert sur l'article finalisé
 * 
 * @param {string} htmlContent - Article HTML finalisé
 * @param {Object} pipelineContext - Contexte du pipeline
 * @param {Object} pipelineContext.geo_defaults - {origin, destination}
 * @param {string} pipelineContext.final_destination - Destination principale
 * @param {string} pipelineContext.editorial_mode - 'news' | 'evergreen'
 * @returns {Promise<{html: string, widgetsDetected: Array, improved: boolean}>}
 */
export async function applyContentMarketingPass(htmlContent, pipelineContext) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    console.warn('⚠️ CONTENT_MARKETING_PASS: Contenu vide ou invalide, skip');
    return { html: htmlContent, widgetsDetected: [], improved: false };
  }

  const editorialMode = pipelineContext?.editorial_mode || 'evergreen';
  const originalLength = htmlContent.length;
  
  // Détecter les widgets présents
  const widgets = detectWidgets(htmlContent);
  console.log(`   📊 Widgets détectés: ${widgets.length} (${widgets.map(w => w.type).join(', ') || 'aucun'})`);
  console.log(`   📰 Mode éditorial: ${editorialMode.toUpperCase()}`);
  
  // Construire le contexte géographique
  const geoDefaults = pipelineContext?.geo_defaults || {};
  const destination = pipelineContext?.final_destination || geoDefaults?.destination || 'Asie';
  
  // Choisir le system prompt selon le mode éditorial
  const systemPrompt = editorialMode === 'news' ? NEWS_SYSTEM_PROMPT : SYSTEM_PROMPT;
  
  // Construire le message utilisateur
  const widgetContext = widgets.length > 0
    ? `\n\nWidgets présents dans l'article :\n${widgets.map(w => `- [fv_widget type="${w.type}"] dans la section "${w.approximateSection}"`).join('\n')}`
    : '\n\nAucun widget détecté dans l\'article.';
  
  const userMessage = `Destination principale : ${destination}
Mode éditorial : ${editorialMode.toUpperCase()}
Origine des vols : ${geoDefaults?.origin || 'PAR'}${widgetContext}

Voici l'article HTML à améliorer :

${htmlContent}`;

  try {
    const response = await createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: editorialMode === 'news' ? 4000 : 8000,
      temperature: editorialMode === 'news' ? 0.2 : 0.4
    });

    let improvedHtml = response.choices?.[0]?.message?.content?.trim();
    
    // Nettoyer les wrappers markdown ```html...``` que le LLM peut ajouter
    if (improvedHtml) {
      improvedHtml = improvedHtml.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    
    if (!improvedHtml) {
      console.warn('⚠️ CONTENT_MARKETING_PASS: Réponse LLM vide, conservation du contenu original');
      return { html: htmlContent, widgetsDetected: widgets, improved: false };
    }

    // Garde-fou : rejeter si le contenu est trop court (< 80% de l'original)
    if (improvedHtml.length < originalLength * 0.80) {
      console.warn(`⚠️ CONTENT_MARKETING_PASS: Contenu amélioré trop court (${improvedHtml.length} vs ${originalLength} original, ratio=${(improvedHtml.length / originalLength * 100).toFixed(1)}%), conservation du contenu original`);
      return { html: htmlContent, widgetsDetected: widgets, improved: false };
    }

    // Vérifier que les widgets sont toujours présents
    const improvedWidgets = detectWidgets(improvedHtml);
    if (improvedWidgets.length < widgets.length) {
      console.warn(`⚠️ CONTENT_MARKETING_PASS: Des widgets ont été perdus (${widgets.length} → ${improvedWidgets.length}), conservation du contenu original`);
      return { html: htmlContent, widgetsDetected: widgets, improved: false };
    }

    // Vérifier que les blockquotes Reddit sont préservés
    const originalRedditQuotes = (htmlContent.match(/data-source="reddit"/gi) || []).length;
    const improvedRedditQuotes = (improvedHtml.match(/data-source="reddit"/gi) || []).length;
    if (improvedRedditQuotes < originalRedditQuotes) {
      console.warn(`⚠️ CONTENT_MARKETING_PASS: Citations Reddit perdues (${originalRedditQuotes} → ${improvedRedditQuotes}), conservation du contenu original`);
      return { html: htmlContent, widgetsDetected: widgets, improved: false };
    }

    const lengthDiff = improvedHtml.length - originalLength;
    const lengthDiffPercent = ((lengthDiff / originalLength) * 100).toFixed(1);
    console.log(`   ✅ CONTENT_MARKETING_PASS: Article amélioré (${lengthDiff >= 0 ? '+' : ''}${lengthDiffPercent}% taille, ${improvedWidgets.length} widgets préservés)`);

    return {
      html: improvedHtml,
      widgetsDetected: improvedWidgets,
      improved: true,
      stats: {
        originalLength,
        improvedLength: improvedHtml.length,
        lengthDiffPercent: parseFloat(lengthDiffPercent),
        widgetsOriginal: widgets.length,
        widgetsAfter: improvedWidgets.length,
        redditQuotesPreserved: improvedRedditQuotes >= originalRedditQuotes
      }
    };

  } catch (error) {
    console.warn(`⚠️ CONTENT_MARKETING_PASS: Erreur LLM (${error.message}), conservation du contenu original`);
    return { html: htmlContent, widgetsDetected: widgets, improved: false, error: error.message };
  }
}
