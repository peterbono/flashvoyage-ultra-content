#!/usr/bin/env node

/**
 * REVIEW AUTO-FIXERS — Corrections programmatiques post-publication
 *
 * Chaque fixer reçoit le HTML, détecte un problème, et retourne le HTML corrigé.
 * Utilisé par post-publish-review-loop.js entre chaque itération de la boucle.
 */

import { parse } from 'node-html-parser';
import ImageSourceManager from './image-source-manager.js';
import { generateWithClaude } from './anthropic-client.js';
import axios from 'axios';

const imageManager = new ImageSourceManager();

// ─── Utilitaires ──────────────────────────────────────────

function extractDestinationFromTitle(title) {
  const patterns = [
    /en\s+(Thaïlande|Thailande|Vietnam|Indonésie|Japon|Corée|Malaisie|Singapour|Cambodge|Philippines|Sri Lanka|Bali|Laos|Myanmar|Birmanie)/i,
    /à\s+(Bangkok|Chiang Mai|Krabi|Phuket|Hanoi|Tokyo|Kyoto|Seoul|Bali|Ubud|Lombok|Singapour|Kuala Lumpur)/i,
    /(Thaïlande|Thailand|Vietnam|Indonesia|Indonésie|Japan|Japon|Korea|Corée|Malaysia|Singapore|Cambodia|Philippines|Sri Lanka|Bali|Laos|Myanmar)/i
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─── Fixer 1 : Image incohérente ──────────────────────────

/**
 * Détecte si l'image hero (première <img>) a un alt text qui référence
 * un lieu différent de la destination de l'article. Si oui, remplace via Pexels.
 */
export async function fixIncoherentImage(html, title) {
  const root = parse(html);
  const images = root.querySelectorAll('img');
  if (images.length === 0) return { html, fixed: false, description: null };

  const destination = extractDestinationFromTitle(title);
  if (!destination) return { html, fixed: false, description: null };

  const destLower = destination.toLowerCase();
  const firstImg = images[0];
  const alt = (firstImg.getAttribute('alt') || '').toLowerCase();
  const src = (firstImg.getAttribute('src') || '').toLowerCase();

  const wrongLocations = [
    'mauritius', 'maurice', 'quatre cocos', 'maldives', 'hawaii', 'caribbean',
    'méditerranée', 'mediterranean', 'mexico', 'greece', 'grèce', 'italy', 'italie',
    'france', 'spain', 'espagne', 'croatia', 'croatie', 'portugal', 'turkey', 'turquie',
    'brazil', 'brésil', 'australia', 'australie', 'fiji', 'tahiti', 'seychelles'
  ];

  const isWrongLocation = wrongLocations.some(loc => alt.includes(loc) || src.includes(loc));
  const mentionsDest = alt.includes(destLower) || src.includes(destLower);

  if (!isWrongLocation && mentionsDest) {
    return { html, fixed: false, description: null };
  }

  if (!isWrongLocation && !mentionsDest) {
    return { html, fixed: false, description: null };
  }

  console.log(`    🖼️ Image incohérente détectée : alt="${firstImg.getAttribute('alt')}" pour destination "${destination}"`);

  try {
    const query = `${destination} travel landscape`;
    const newImage = await imageManager.searchCascade(query, { orientation: 'landscape' });

    if (!newImage) {
      return { html, fixed: false, description: `Image incohérente mais pas de remplacement trouvé pour "${query}"` };
    }

    const oldSrc = firstImg.getAttribute('src');
    const oldAlt = firstImg.getAttribute('alt');

    let fixedHtml = html;

    if (oldSrc) {
      fixedHtml = fixedHtml.replace(oldSrc, newImage.url);
    }
    if (oldAlt) {
      const newAlt = `${destination} — ${newImage.alt || 'paysage voyage'}`;
      fixedHtml = fixedHtml.replace(
        `alt="${oldAlt}"`,
        `alt="${newAlt}"`
      );
    }

    const figcaptionMatch = fixedHtml.match(/<figcaption>Photo\s*:\s*[^<]+<\/figcaption>/);
    if (figcaptionMatch && newImage.photographer) {
      const source = newImage.source === 'pexels' ? 'Pexels' : newImage.source === 'flickr' ? 'Flickr' : newImage.source;
      fixedHtml = fixedHtml.replace(
        figcaptionMatch[0],
        `<figcaption>Photo : ${newImage.photographer} / <a href="${newImage.sourceUrl || 'https://www.pexels.com'}" target="_blank" rel="noopener nofollow">${source}</a></figcaption>`
      );
    }

    return {
      html: fixedHtml,
      fixed: true,
      description: `Image hero remplacée : "${oldAlt?.substring(0, 60)}..." → image ${destination} (${newImage.source})`
    };
  } catch (err) {
    console.error(`    ❌ Erreur remplacement image: ${err.message}`);
    return { html, fixed: false, description: `Erreur remplacement image: ${err.message}` };
  }
}

// ─── Fixer 2 : Liens internes tronqués ────────────────────

/**
 * Détecte les liens internes dont le texte d'ancre est coupé
 * (se termine abruptement, mot incomplet ou "que tu", "que", "l'", etc.)
 */
export async function fixTruncatedLinks(html, wpAuth) {
  const root = parse(html);
  const internalLinks = root.querySelectorAll('a').filter(a => {
    const href = a.getAttribute('href') || '';
    return href.includes('flashvoyage.com') && !href.includes('#');
  });

  let fixedHtml = html;
  let fixCount = 0;
  const fixes = [];

  for (const link of internalLinks) {
    const text = link.text.trim();
    const href = link.getAttribute('href') || '';

    const isTruncated =
      text.length < 15 ||
      /\b(que|tu|l['']|d['']|un|le|la|les|des|en|du|de|et|ou|à|au)\s*$/i.test(text) ||
      text.endsWith('...') ||
      /[a-zàâéèêëïôùûü]$/i.test(text) && text.split(/\s+/).length <= 3;

    if (!isTruncated) continue;

    let fullTitle = null;
    if (wpAuth) {
      try {
        const slug = href.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
        const res = await axios.get(`${wpAuth.url}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=title`, {
          headers: { Authorization: `Basic ${wpAuth.auth}` },
          timeout: 5000
        });
        if (res.data[0]) {
          fullTitle = res.data[0].title.rendered
            .replace(/&#8217;/g, "'")
            .replace(/&#8216;/g, "'")
            .replace(/&#8211;/g, "–")
            .replace(/&#8212;/g, "—")
            .replace(/&amp;/g, "&")
            .replace(/&#8230;/g, "…");
        }
      } catch { /* silently skip */ }
    }

    if (!fullTitle) continue;

    const shortTitle = fullTitle.length > 80
      ? fullTitle.substring(0, 77) + '...'
      : fullTitle;

    const oldAnchor = `>${text}</a>`;
    const newAnchor = `>${shortTitle}</a>`;

    if (fixedHtml.includes(oldAnchor)) {
      fixedHtml = fixedHtml.replace(oldAnchor, newAnchor);
      fixCount++;
      fixes.push(`"${text}" → "${shortTitle}"`);
    }
  }

  return {
    html: fixedHtml,
    fixed: fixCount > 0,
    description: fixCount > 0 ? `${fixCount} lien(s) tronqué(s) corrigé(s): ${fixes.join('; ')}` : null
  };
}

// ─── Fixer 3 : Phrases cassées ────────────────────────────

/**
 * Détecte les phrases qui contiennent des mots collés ou du texte corrompu.
 * Utilise un LLM pour réécrire le fragment.
 */
export async function fixBrokenPhrases(html) {
  const brokenPatterns = [
    /[a-zàâéèêëïôùûü]{2,}[A-ZÀÂÉÈÊËÏÔÙÛÜ][a-zàâéèêëïôùûü]{2,}/g,
    /\b\w+quelques\s+\w+\s+à\s+un\s+coût\s+non\s+négligeable\s+\w+\s+maximum\b/gi,
    /tesquelques/gi,
    /\bcela\s+réduit\s+tes?quelques\b/gi,
  ];

  const allBroken = [];

  for (const pattern of brokenPatterns) {
    const matches = html.match(pattern);
    if (matches) {
      for (const m of matches) {
        allBroken.push(m);
      }
    }
  }

  const pTagPattern = /<p[^>]*>([^<]{10,})<\/p>/g;
  let match;
  const brokenParagraphs = [];

  while ((match = pTagPattern.exec(html)) !== null) {
    const text = match[1];
    const hasGlued = /[a-z]{3,}[A-Z][a-z]{3,}/.test(text);
    const hasNonsense = /\b(tesquelques|actifs\s+maximum)\b/i.test(text);
    if (hasGlued || hasNonsense) {
      brokenParagraphs.push({ full: match[0], text, index: match.index });
    }
  }

  if (brokenParagraphs.length === 0 && allBroken.length === 0) {
    return { html, fixed: false, description: null };
  }

  let fixedHtml = html;
  let fixCount = 0;
  const fixes = [];

  for (const bp of brokenParagraphs) {
    try {
      const prompt = `Voici un paragraphe d'article voyage qui contient du texte corrompu (mots collés, phrases sans sens). Réécris UNIQUEMENT ce paragraphe en corrigeant les erreurs tout en gardant le sens original. Retourne UNIQUEMENT le texte corrigé du paragraphe, sans balises HTML, sans explication.

Paragraphe corrompu :
"${bp.text}"`;

      const fixed = await generateWithClaude(
        'Tu es un correcteur de texte. Corrige le texte donné sans changer le sens. Retourne uniquement le texte corrigé.',
        prompt,
        { maxTokens: 500, trackingStep: 'review-fix-phrase' }
      );

      const cleaned = fixed.trim().replace(/^["']|["']$/g, '');
      if (cleaned.length > 20 && cleaned.length < bp.text.length * 2) {
        fixedHtml = fixedHtml.replace(bp.text, cleaned);
        fixCount++;
        fixes.push(`"${bp.text.substring(0, 50)}..." → corrigé`);
      }
    } catch (err) {
      console.error(`    ❌ Erreur correction phrase: ${err.message}`);
    }
  }

  return {
    html: fixedHtml,
    fixed: fixCount > 0,
    description: fixCount > 0 ? `${fixCount} phrase(s) cassée(s) corrigée(s): ${fixes.join('; ')}` : null
  };
}

// ─── Fixer 4 : Citations Reddit vides/incomplètes ────────

/**
 * Détecte les blockquotes dont le contenu ne forme pas une phrase complète.
 * Les remplace ou les supprime.
 */
export async function fixBrokenCitations(html) {
  const root = parse(html);
  const blockquotes = root.querySelectorAll('blockquote');

  let fixedHtml = html;
  let fixCount = 0;
  const fixes = [];

  for (const bq of blockquotes) {
    const text = bq.text.trim().replace(/\s+/g, ' ');

    const isBroken =
      text.length < 20 ||
      !text.includes(' ') ||
      !/[.!?…]/.test(text) && text.length < 100 ||
      /^(je recommanderais|voyager en|il est|c'est)\s+/i.test(text) && text.split(/\s+/).length < 10;

    if (!isBroken) continue;

    const outerHtml = bq.outerHTML;

    const promptText = `Cette citation tirée d'un article voyage est incomplète ou incompréhensible :
"${text}"

Le contexte est un article sur le voyage. 
Si la citation a un sens partiel, complète-la pour qu'elle forme une phrase utile et pertinente (1-2 phrases max).
Si elle est irrécupérable, retourne exactement "SUPPRIMER".

Retourne UNIQUEMENT le texte de la citation corrigée ou "SUPPRIMER".`;

    try {
      const result = await generateWithClaude(
        'Tu es un éditeur. Corrige ou supprime les citations cassées. Réponds uniquement avec le texte corrigé ou "SUPPRIMER".',
        promptText,
        { maxTokens: 200, trackingStep: 'review-fix-citation' }
      );

      const cleaned = result.trim().replace(/^["']|["']$/g, '');

      if (cleaned === 'SUPPRIMER' || cleaned.length < 10) {
        fixedHtml = fixedHtml.replace(outerHtml, '');
        fixCount++;
        fixes.push(`Citation supprimée: "${text.substring(0, 40)}..."`);
      } else {
        const newBq = outerHtml.replace(/>[\s\S]*?<\/blockquote>/, `><p>${cleaned}</p></blockquote>`);
        fixedHtml = fixedHtml.replace(outerHtml, newBq);
        fixCount++;
        fixes.push(`Citation corrigée: "${text.substring(0, 30)}..." → "${cleaned.substring(0, 40)}..."`);
      }
    } catch (err) {
      console.error(`    ❌ Erreur correction citation: ${err.message}`);
    }
  }

  return {
    html: fixedHtml,
    fixed: fixCount > 0,
    description: fixCount > 0 ? `${fixCount} citation(s) corrigée(s): ${fixes.join('; ')}` : null
  };
}

// ─── Fixer 5 : Correction LLM ciblée ─────────────────────

/**
 * Prend une issue identifiée par un agent et tente de corriger le fragment HTML.
 * Utilisé pour les issues dont fix_type = 'llm'.
 */
export async function fixWithLlm(html, issue) {
  const location = issue.location || issue.description;
  if (!location || location.length < 10) return { html, fixed: false, description: null };

  const searchText = location.substring(0, 100);
  const idx = html.indexOf(searchText);
  if (idx === -1) return { html, fixed: false, description: `Fragment introuvable: "${searchText.substring(0, 40)}..."` };

  const start = Math.max(0, idx - 200);
  const end = Math.min(html.length, idx + location.length + 200);
  const fragment = html.substring(start, end);

  try {
    const prompt = `Voici un fragment HTML d'un article voyage qui contient un problème.

PROBLÈME DÉTECTÉ : ${issue.description}
SUGGESTION : ${issue.fix_suggestion || 'Corriger le problème'}

FRAGMENT HTML :
${fragment}

Retourne UNIQUEMENT le fragment HTML corrigé. Garde la structure HTML identique, corrige uniquement le problème. Pas d'explication.`;

    const fixed = await generateWithClaude(
      'Tu es un correcteur HTML expert. Corrige uniquement le problème indiqué sans changer le reste. Retourne le fragment HTML corrigé.',
      prompt,
      { maxTokens: 1000, trackingStep: 'review-fix-llm' }
    );

    const cleanedFix = fixed.trim();
    if (cleanedFix.length < 20 || cleanedFix.length > fragment.length * 3) {
      return { html, fixed: false, description: 'Correction LLM invalide (trop courte ou trop longue)' };
    }

    const fixedHtml = html.substring(0, start) + cleanedFix + html.substring(end);
    return {
      html: fixedHtml,
      fixed: true,
      description: `Correction LLM: "${issue.description.substring(0, 60)}..."`
    };
  } catch (err) {
    return { html, fixed: false, description: `Erreur correction LLM: ${err.message}` };
  }
}

// ─── Runner : applique tous les fixers ────────────────────

/**
 * Applique tous les auto-fixers disponibles sur le HTML
 * @param {string} html - HTML de l'article
 * @param {string} title - Titre de l'article
 * @param {Array} issues - Issues détectées par les agents
 * @param {Object} wpAuth - { url, auth } pour WordPress API
 * @returns {Promise<Object>} { html, fixes[], totalFixed }
 */
export async function applyAllFixes(html, title, issues = [], wpAuth = null) {
  console.log('\n  🔧 Application des auto-fixes...');
  let currentHtml = html;
  const appliedFixes = [];

  // 1. Image incohérente
  const imgResult = await fixIncoherentImage(currentHtml, title);
  if (imgResult.fixed) {
    currentHtml = imgResult.html;
    appliedFixes.push({ type: 'image', description: imgResult.description });
    console.log(`    ✅ ${imgResult.description}`);
  }

  // 2. Liens tronqués
  const linkResult = await fixTruncatedLinks(currentHtml, wpAuth);
  if (linkResult.fixed) {
    currentHtml = linkResult.html;
    appliedFixes.push({ type: 'links', description: linkResult.description });
    console.log(`    ✅ ${linkResult.description}`);
  }

  // 3. Phrases cassées
  const phraseResult = await fixBrokenPhrases(currentHtml);
  if (phraseResult.fixed) {
    currentHtml = phraseResult.html;
    appliedFixes.push({ type: 'phrases', description: phraseResult.description });
    console.log(`    ✅ ${phraseResult.description}`);
  }

  // 4. Citations cassées
  const citResult = await fixBrokenCitations(currentHtml);
  if (citResult.fixed) {
    currentHtml = citResult.html;
    appliedFixes.push({ type: 'citations', description: citResult.description });
    console.log(`    ✅ ${citResult.description}`);
  }

  // 5. Corrections LLM ciblées (issues avec fix_type = 'llm', max 3)
  const llmIssues = issues
    .filter(i => i.fix_type === 'llm' && i.severity === 'critical')
    .slice(0, 3);

  for (const issue of llmIssues) {
    const llmResult = await fixWithLlm(currentHtml, issue);
    if (llmResult.fixed) {
      currentHtml = llmResult.html;
      appliedFixes.push({ type: 'llm', description: llmResult.description });
      console.log(`    ✅ ${llmResult.description}`);
    }
  }

  if (appliedFixes.length === 0) {
    console.log('    ℹ️ Aucun auto-fix applicable');
  } else {
    console.log(`    📝 ${appliedFixes.length} correction(s) appliquée(s)`);
  }

  return {
    html: currentHtml,
    fixes: appliedFixes,
    totalFixed: appliedFixes.length
  };
}

export default {
  fixIncoherentImage,
  fixTruncatedLinks,
  fixBrokenPhrases,
  fixBrokenCitations,
  fixWithLlm,
  applyAllFixes
};
