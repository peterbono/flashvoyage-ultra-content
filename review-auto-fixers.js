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
import { existsSync, readFileSync } from 'fs';

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

function isTruncatedAnchorText(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return true;
  const tooShort = cleaned.length < 12 || cleaned.split(/\s+/).length <= 2;
  const incompleteTail = /\b(que|tu|l['’]|d['’]|un|une|le|la|les|des|en|du|de|et|ou|a|au|aux)\s*$/i.test(cleaned);
  return tooShort || cleaned.endsWith('...') || incompleteTail;
}

function normalizeAnchorFromTitle(title) {
  let anchor = String(title || '').replace(/\s+/g, ' ').trim();
  if (anchor.length > 90) {
    anchor = anchor.substring(0, 90).replace(/\s+\S*$/, '').trim();
  }
  while (/\b(que|tu|l['’]|d['’]|un|une|le|la|les|des|en|du|de|et|ou|a|au|aux)\s*$/i.test(anchor)) {
    anchor = anchor.replace(/\s+\S+\s*$/, '').trim();
  }
  return anchor;
}

function loadInternalLinksCandidates() {
  const candidates = [];
  const paths = [
    `${process.cwd()}/data/internal-links.json`,
    `${process.cwd()}/articles-database.json`
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const rows = Array.isArray(raw?.articles) ? raw.articles : (Array.isArray(raw) ? raw : []);
      for (const row of rows) {
        const link = String(row.link || row.url || '').trim();
        const title = String(row.title || row.post_title || row.name || '').trim();
        if (!link.includes('flashvoyage.com')) continue;
        candidates.push({ link, title });
      }
    } catch {
      // ignore malformed index file
    }
  }
  const uniq = new Map();
  for (const c of candidates) {
    if (!uniq.has(c.link)) uniq.set(c.link, c);
  }
  return Array.from(uniq.values());
}

function tokenizeSimple(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function destinationTokens(destination = '') {
  return tokenizeSimple(destination).filter(t => t.length >= 3);
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

    if (!isTruncatedAnchorText(text)) continue;

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

    const fallbackTitle = href
      .replace(/^https?:\/\/[^/]+\//i, '')
      .replace(/\/+$/, '')
      .split('/')
      .pop()
      ?.replace(/-/g, ' ');
    const shortTitle = normalizeAnchorFromTitle(fullTitle || fallbackTitle || '');
    if (!shortTitle) continue;

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

export async function fixAffiliateCoverage(html, destination = '') {
  if (!html || typeof html !== 'string') return { html, fixed: false, description: null };
  let out = html;
  const modules = out.match(/<aside class="affiliate-module"[\s\S]*?<\/aside>/gi) || [];
  const textLength = out.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
  const hasCommercialIntent = /(budget|prix|r[ée]servation|vol|h[ée]bergement|assurance|eSIM|transport)/i.test(out);
  if (textLength < 1800 || !hasCommercialIntent) {
    return { html, fixed: false, description: null };
  }
  if (modules.length >= 2) return { html, fixed: false, description: null };

  const disclosure = '<p class="affiliate-module-disclaimer"><small>Liens partenaires: une commission peut être perçue, sans surcoût pour toi.</small></p>';
  const safeDest = destination || 'ta destination';
  const buildModule = (id, title, txt) => [
    `<aside class="affiliate-module" data-placement-id="${id}">`,
    `<h3>${title}</h3>`,
    `<p>${txt}</p>`,
    disclosure,
    '</aside>'
  ].join('');

  const needed = 2 - modules.length;
  const firstBlock = buildModule(
    'flights',
    'Comparer les vols',
    `Pour ${safeDest}, compare le coût total (bagages + horaires) avant de réserver.`
  );
  const secondBlock = buildModule(
    'hotels',
    'Vérifier les hébergements',
    'Valide l’emplacement et les conditions d’annulation avant de confirmer.'
  );

  if (needed >= 1) {
    const firstH2Idx = out.search(/<h2[\s>]/i);
    if (firstH2Idx > 0) out = `${out.slice(0, firstH2Idx)}${firstBlock}\n${out.slice(firstH2Idx)}`;
    else out = `${firstBlock}\n${out}`;
  }
  if (needed >= 2) {
    out = `${out}\n${secondBlock}`;
  }
  return {
    html: out,
    fixed: true,
    description: `${needed} module(s) affilié(s) ajouté(s) pour couverture minimale`
  };
}

export async function fixMissingSourceAttribution(html, sourceUrl = '') {
  if (!html || typeof html !== 'string') return { html, fixed: false, description: null };
  if (!sourceUrl || !/reddit\.com/i.test(sourceUrl)) return { html, fixed: false, description: null };
  const hasSourceLink = new RegExp(sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(html);
  if (hasSourceLink) return { html, fixed: false, description: null };
  const mentionsTestimony = /t[ée]moignage|retour\s+terrain|source\s+reddit|discussion\s+originale/i.test(html);
  if (!mentionsTestimony) return { html, fixed: false, description: null };

  const sourcePara = `<p><a href="${sourceUrl}" target="_blank" rel="noopener nofollow">Source Reddit vérifiable</a> utilisée pour le contexte de ce retour terrain.</p>`;
  const insertBeforeFaq = /<h2[^>]*>\s*(?:questions?\s+fr[ée]quentes?|faq)\s*<\/h2>/i;
  const m = html.match(insertBeforeFaq);
  const out = m ? html.slice(0, html.indexOf(m[0])) + sourcePara + '\n' + html.slice(html.indexOf(m[0])) : `${html}\n${sourcePara}`;
  return {
    html: out,
    fixed: true,
    description: 'Lien de source Reddit ajouté pour traçabilité'
  };
}

export async function fixInternalLinkVolume(html, maxLinks = 8) {
  if (!html || typeof html !== 'string') return { html, fixed: false, description: null };
  let seen = 0;
  let removed = 0;
  const out = html.replace(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (full, pre, href, post, text) => {
    if (!/flashvoyage\.com/i.test(href)) return full;
    seen++;
    if (seen <= maxLinks) return full;
    removed++;
    return String(text || '').trim() || full;
  });
  return {
    html: out,
    fixed: removed > 0,
    description: removed > 0 ? `${removed} lien(s) interne(s) retiré(s) (cap=${maxLinks})` : null
  };
}

export async function fixDeadInternalLinks(html, wpAuth) {
  if (!wpAuth) return { html, fixed: false, description: null };
  const root = parse(html);
  const internalLinks = root.querySelectorAll('a').filter(a => {
    const href = a.getAttribute('href') || '';
    return href.includes('flashvoyage.com') && href.startsWith('http');
  });

  let fixedHtml = html;
  let fixCount = 0;
  const fixes = [];

  for (const link of internalLinks.slice(0, 12)) {
    const href = link.getAttribute('href') || '';
    const text = link.text.trim();
    try {
      await axios.head(href, { timeout: 5000, headers: { Authorization: `Basic ${wpAuth.auth}` }, maxRedirects: 3 });
    } catch (err) {
      if (err.response?.status !== 404) continue;

      const query = normalizeAnchorFromTitle(text).split(/\s+/).slice(0, 5).join(' ');
      if (!query) continue;
      try {
        const res = await axios.get(`${wpAuth.url}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&_fields=link,title&per_page=5`, {
          headers: { Authorization: `Basic ${wpAuth.auth}` },
          timeout: 5000
        });
        const fallback = Array.isArray(res.data)
          ? res.data.find(p => p?.link && p.link !== href)
          : null;
        if (!fallback?.link) continue;
        const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hrefRegex = new RegExp(`href=["']${escapedHref}["']`, 'g');
        fixedHtml = fixedHtml.replace(hrefRegex, `href="${fallback.link}"`);
        fixCount++;
        fixes.push(`404 "${text.substring(0, 40)}..." → ${fallback.link}`);
      } catch {
        // no fallback found, keep as-is
      }
    }
  }

  return {
    html: fixedHtml,
    fixed: fixCount > 0,
    description: fixCount > 0 ? `${fixCount} lien(s) 404 remplacé(s): ${fixes.join('; ')}` : null
  };
}

// ─── Fixer 2c : Maillage interne minimal ──────────────────
export async function fixMinimumInternalLinks(html, title = '', destination = '') {
  const root = parse(html);
  const currentLinks = root.querySelectorAll('a').filter(a => {
    const href = a.getAttribute('href') || '';
    return href.includes('flashvoyage.com');
  });
  if (currentLinks.length >= 3) {
    return { html, fixed: false, description: null };
  }

  const existing = new Set(currentLinks.map(a => a.getAttribute('href') || '').filter(Boolean));
  const destTokens = destinationTokens(destination);
  const tokens = new Set([
    ...tokenizeSimple(title).slice(0, 8),
    ...destTokens
  ]);

  const candidates = loadInternalLinksCandidates()
    .filter(c => c.link && !existing.has(c.link))
    .map(c => {
      const hay = `${c.title} ${c.link}`.toLowerCase();
      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score += 1;
      if (destTokens.length > 0) {
        const hasDest = destTokens.some(t => hay.includes(t));
        if (!hasDest) score -= 2;
      }
      return { ...c, score };
    })
    .filter(c => c.score >= 1)
    .sort((a, b) => b.score - a.score);

  const needed = Math.max(0, 3 - currentLinks.length);
  const selected = candidates.slice(0, needed);
  if (selected.length === 0) {
    return { html, fixed: false, description: null };
  }

  const block = [
    '<h3>À lire aussi</h3>',
    '<ul>',
    ...selected.map(s => `<li><a href="${s.link}">${s.title || 'Guide flashvoyage'}</a></li>`),
    '</ul>'
  ].join('');

  const fixedHtml = `${html}\n${block}`;
  return {
    html: fixedHtml,
    fixed: true,
    description: `${selected.length} lien(s) interne(s) ajouté(s) pour atteindre le minimum`
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

// ─── Fixer 4b : Anti-patterns éditoriaux récurrents ───────
export async function fixEditorialAntiPatterns(html) {
  if (!html || typeof html !== 'string') return { html, fixed: false, description: null };
  let out = html;
  let fixCount = 0;

  const rules = [
    {
      re: /arbitrer\s+entre\s+([^.,;:\n]{2,80})\s+sans\s+sacrifier\s+([^.,;:\n]{2,80})/gi,
      to: 'choisir entre $1 en gardant $2'
    },
    {
      re: /la\s+vraie\s+question\s+n['’]est\s+pas\s+([^.,;:\n]{2,80})\s+mais\s+([^.,;:\n]{2,80})/gi,
      to: 'la question centrale est de prioriser $2 plutôt que $1'
    },
    {
      re: /\boption\s+1\s*[:\-]/gi,
      to: 'Première option :'
    },
    {
      re: /\boption\s+2\s*[:\-]/gi,
      to: 'Deuxième option :'
    },
    {
      re: /\boption\s+3\s*[:\-]/gi,
      to: 'Troisième option :'
    }
  ];

  for (const rule of rules) {
    out = out.replace(rule.re, (...args) => {
      fixCount++;
      // Supporte les backrefs ($1, $2) pour garder le contexte local.
      const g1 = args[1] || '';
      const g2 = args[2] || '';
      return String(rule.to).replace(/\$1/g, g1).replace(/\$2/g, g2);
    });
  }

  return {
    html: out,
    fixed: fixCount > 0,
    description: fixCount > 0 ? `${fixCount} anti-pattern(s) éditoriaux corrigé(s)` : null
  };
}

// ─── Fixer 4c : Cohérence factuelle prudente ──────────────
export async function fixFactualOverclaims(html) {
  if (!html || typeof html !== 'string') return { html, fixed: false, description: null };
  let out = html;
  let fixCount = 0;
  const replacements = [
    [/\b(?:toujours|jamais)\s+le\s+meilleur\s+choix\b/gi, 'souvent un bon choix selon ton contexte'],
    [/garanti\s+à\s+100%/gi, 'dans la plupart des cas'],
    [/\bsans\s+aucun\s+risque\b/gi, 'avec un risque limité si bien préparé'],
    [/\bprix\s+fixe\s+garanti\b/gi, 'prix généralement stable']
  ];
  for (const [re, value] of replacements) {
    out = out.replace(re, () => {
      fixCount++;
      return value;
    });
  }
  out = out
    .replace(/\b\d+\s*quelques\s+euros\b/gi, 'un budget à préciser')
    .replace(/\bco[ûu]tent\s*quelques\b/gi, 'coûtent')
    .replace(/\b2quelques\b/gi, 'quelques');
  return {
    html: out,
    fixed: fixCount > 0,
    description: fixCount > 0 ? `${fixCount} affirmation(s) factuelle(s) risquée(s) atténuée(s)` : null
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
export async function applyAllFixes(html, title, issues = [], wpAuth = null, context = {}) {
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

  // 2b. Liens internes 404
  const deadLinkResult = await fixDeadInternalLinks(currentHtml, wpAuth);
  if (deadLinkResult.fixed) {
    currentHtml = deadLinkResult.html;
    appliedFixes.push({ type: 'dead-links', description: deadLinkResult.description });
    console.log(`    ✅ ${deadLinkResult.description}`);
  }

  // 2d. Couverture affiliation minimale (>=2 modules)
  const affiliateCoverage = await fixAffiliateCoverage(currentHtml, context.destination || extractDestinationFromTitle(title) || '');
  if (affiliateCoverage.fixed) {
    currentHtml = affiliateCoverage.html;
    appliedFixes.push({ type: 'affiliate-coverage', description: affiliateCoverage.description });
    console.log(`    ✅ ${affiliateCoverage.description}`);
  }

  // 2c. Maillage interne minimum (>=3)
  const minLinksResult = await fixMinimumInternalLinks(currentHtml, title, extractDestinationFromTitle(title) || '');
  if (minLinksResult.fixed) {
    currentHtml = minLinksResult.html;
    appliedFixes.push({ type: 'links-minimum', description: minLinksResult.description });
    console.log(`    ✅ ${minLinksResult.description}`);
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

  // 4b. Anti-patterns éditoriaux récurrents
  const antiPatternResult = await fixEditorialAntiPatterns(currentHtml);
  if (antiPatternResult.fixed) {
    currentHtml = antiPatternResult.html;
    appliedFixes.push({ type: 'editorial-anti-patterns', description: antiPatternResult.description });
    console.log(`    ✅ ${antiPatternResult.description}`);
  }

  // 4c. Cohérence factuelle prudente
  const factualResult = await fixFactualOverclaims(currentHtml);
  if (factualResult.fixed) {
    currentHtml = factualResult.html;
    appliedFixes.push({ type: 'factual-overclaims', description: factualResult.description });
    console.log(`    ✅ ${factualResult.description}`);
  }

  // 4d. Attribution source (intégrité)
  const sourceFix = await fixMissingSourceAttribution(currentHtml, context.sourceUrl || '');
  if (sourceFix.fixed) {
    currentHtml = sourceFix.html;
    appliedFixes.push({ type: 'source-attribution', description: sourceFix.description });
    console.log(`    ✅ ${sourceFix.description}`);
  }

  // 4e. Limiter le volume de liens internes (éviter la sur-correction SEO)
  const linkVolumeFix = await fixInternalLinkVolume(currentHtml, 8);
  if (linkVolumeFix.fixed) {
    currentHtml = linkVolumeFix.html;
    appliedFixes.push({ type: 'link-volume', description: linkVolumeFix.description });
    console.log(`    ✅ ${linkVolumeFix.description}`);
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
  fixDeadInternalLinks,
  fixBrokenPhrases,
  fixBrokenCitations,
  fixMinimumInternalLinks,
  fixAffiliateCoverage,
  fixMissingSourceAttribution,
  fixInternalLinkVolume,
  fixEditorialAntiPatterns,
  fixFactualOverclaims,
  fixWithLlm,
  applyAllFixes
};
