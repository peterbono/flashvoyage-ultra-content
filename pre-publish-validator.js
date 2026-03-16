#!/usr/bin/env node

/**
 * PRE-PUBLISH VALIDATOR
 * 
 * 4 validation gates programmatiques (sans LLM) exécutées AVANT le panel multi-agent.
 * Détecte et corrige les problèmes structurels évidents que le générateur produit.
 * 
 * Gates :
 *   1. HTML Completeness — balises fermées, phrases complètes, pas de troncation
 *   2. Fact-Check — durées de vol/trajet, distances, cohérence chiffres
 *   3. Internal Links — liens flashvoyage existants, thématiquement cohérents
 *   4. Image Coherence — alt text correspond à la destination
 */

import { parse } from 'node-html-parser';
import axios from 'axios';
import { existsSync, readFileSync } from 'fs';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';

// ─── Lookup Tables ───────────────────────────────────────

const FLIGHT_DURATIONS = {
  'bangkok-chiang mai': { min: 1, max: 1.5 },
  'chiang mai-bangkok': { min: 1, max: 1.5 },
  'bangkok-krabi': { min: 1.25, max: 1.75 },
  'krabi-bangkok': { min: 1.25, max: 1.75 },
  'bangkok-phuket': { min: 1.25, max: 1.75 },
  'phuket-bangkok': { min: 1.25, max: 1.75 },
  'bangkok-koh samui': { min: 1, max: 1.5 },
  'paris-bangkok': { min: 11, max: 13 },
  'paris-tokyo': { min: 11, max: 13 },
  'paris-bali': { min: 15, max: 18 },
  'paris-hanoi': { min: 11, max: 13 },
};

const TRAIN_DURATIONS = {
  'bangkok-chiang mai': { min: 10, max: 13, note: 'train de nuit' },
  'chiang mai-bangkok': { min: 10, max: 13, note: 'train de nuit' },
};

const COUNTRY_FOR_CITY = {
  'bangkok': 'thaïlande', 'chiang mai': 'thaïlande', 'phuket': 'thaïlande',
  'krabi': 'thaïlande', 'koh samui': 'thaïlande', 'koh phi phi': 'thaïlande',
  'koh lanta': 'thaïlande', 'koh tao': 'thaïlande', 'pai': 'thaïlande',
  'hanoi': 'vietnam', 'ho chi minh': 'vietnam', 'da nang': 'vietnam',
  'hoi an': 'vietnam', 'nha trang': 'vietnam', 'sapa': 'vietnam',
  'bali': 'indonésie', 'jakarta': 'indonésie', 'yogyakarta': 'indonésie',
  'lombok': 'indonésie', 'ubud': 'indonésie',
  'tokyo': 'japon', 'osaka': 'japon', 'kyoto': 'japon',
  'singapour': 'singapour', 'kuala lumpur': 'malaisie',
  'manille': 'philippines', 'cebu': 'philippines',
  'phnom penh': 'cambodge', 'siem reap': 'cambodge',
};

const DESTINATION_ALIASES = {
  'thailande': 'thaïlande', 'thailand': 'thaïlande', 'thaïlande': 'thaïlande',
  'vietnam': 'vietnam', 'indonesie': 'indonésie', 'indonesia': 'indonésie', 'indonésie': 'indonésie',
  'japon': 'japon', 'japan': 'japon', 'singapour': 'singapour', 'singapore': 'singapour',
  'malaisie': 'malaisie', 'malaysia': 'malaisie', 'philippines': 'philippines',
  'cambodge': 'cambodge', 'cambodia': 'cambodge',
};

const SEA_COUNTRIES = new Set(['thaïlande', 'vietnam', 'indonésie', 'singapour', 'malaisie', 'philippines', 'cambodge', 'laos', 'myanmar']);
const EAST_ASIA_OUTLIERS = {
  'chine': ['chine', 'china', 'pekin', 'beijing', 'shanghai', 'xian'],
  'japon': ['japon', 'japan', 'tokyo', 'osaka', 'kyoto'],
  'corée': ['coree', 'corée', 'korea', 'seoul', 'busan']
};

// ─── Gate 1: HTML Completeness ───────────────────────────

function checkHtmlCompleteness(html) {
  const issues = [];
  
  const selfClosing = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'col', 'embed', 'wbr']);
  const openTags = [];
  const tagPattern = /<\/?([a-z][a-z0-9]*)\b[^>]*\/?>/gi;
  let m;
  while ((m = tagPattern.exec(html)) !== null) {
    const full = m[0];
    const tag = m[1].toLowerCase();
    if (selfClosing.has(tag) || full.endsWith('/>')) continue;
    if (full.startsWith('</')) {
      if (openTags.length > 0 && openTags[openTags.length - 1] === tag) {
        openTags.pop();
      }
    } else {
      openTags.push(tag);
    }
  }
  
  if (openTags.length > 0) {
    const unclosed = openTags.slice(-5).join(', ');
    const structuralTags = new Set(['html', 'head', 'body', 'article', 'section', 'main', 'div', 'p', 'ul', 'ol', 'table']);
    const onlySoftTags = openTags.every(t => !structuralTags.has(t));
    issues.push({
      gate: 'html-completeness',
      severity: onlySoftTags ? 'major' : 'critical',
      message: `Balises non fermées : ${unclosed}`,
      auto_fixable: true
    });
  }
  
  if (/\[\.\.\.\s*tronqué\s*\.\.\.\]/i.test(html)) {
    issues.push({
      gate: 'html-completeness',
      severity: 'critical',
      message: 'Contenu tronqué détecté ([...tronqué...])',
      auto_fixable: false
    });
  }
  
  if (/<\/br>/g.test(html)) {
    issues.push({
      gate: 'html-completeness',
      severity: 'minor',
      message: 'Balise </br> invalide détectée',
      auto_fixable: true
    });
  }

  if (!/<h1[\s>]/i.test(html)) {
    issues.push({
      gate: 'html-completeness',
      severity: 'major',
      message: 'Aucune balise H1 détectée',
      auto_fixable: true
    });
  }

  const headingMatches = [...html.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi)];
  let prevLevel = null;
  for (const heading of headingMatches) {
    const tag = String(heading[1] || '').toLowerCase();
    const level = Number(tag.replace('h', ''));
    const text = String(heading[2] || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!Number.isFinite(level) || level < 1 || level > 6) continue;
    if (prevLevel !== null && level > prevLevel + 1) {
      issues.push({
        gate: 'html-completeness',
        severity: 'major',
        message: `Hiérarchie Hn incohérente : ${`h${prevLevel}`} suivi de ${tag} ("${text.substring(0, 80)}")`,
        location: `<${tag}>${text.substring(0, 80)}`,
        auto_fixable: true
      });
    }
    prevLevel = level;
  }

  const root = parse(html);
  const paragraphs = root.querySelectorAll('p');
  for (const p of paragraphs) {
    const text = p.text.trim();
    if (text.length < 10) continue;
    const gluedPattern = /[a-zà-ÿ]{30,}/gi;
    const gluedMatches = text.match(gluedPattern);
    if (gluedMatches) {
      for (const match of gluedMatches) {
        issues.push({
          gate: 'html-completeness',
          severity: 'critical',
          message: `Mots collés détectés : "${match.substring(0, 40)}..."`,
          location: text.substring(0, 80),
          auto_fixable: true
        });
      }
    }
  }


  // ── Duplicate paragraph detection ──
  const longParagraphs = paragraphs
    .map(p => p.text.trim())
    .filter(t => t.length > 50);
  const duplicateParagraphs = [];
  for (let i = 0; i < longParagraphs.length; i++) {
    for (let j = i + 1; j < longParagraphs.length; j++) {
      if (longParagraphs[i] === longParagraphs[j]) {
        duplicateParagraphs.push(longParagraphs[i]);
      } else {
        // Near-exact duplicate: >90% word overlap
        const wordsA = new Set(longParagraphs[i].toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const wordsB = new Set(longParagraphs[j].toLowerCase().split(/\s+/).filter(w => w.length > 2));
        if (wordsA.size > 0 && wordsB.size > 0) {
          let overlap = 0;
          for (const w of wordsA) if (wordsB.has(w)) overlap++;
          const similarity = overlap / Math.max(wordsA.size, wordsB.size);
          if (similarity > 0.9) {
            duplicateParagraphs.push(longParagraphs[i]);
          }
        }
      }
    }
  }
  if (duplicateParagraphs.length > 2) {
    issues.push({
      gate: 'html-completeness',
      severity: 'critical',
      message: `${duplicateParagraphs.length} paragraphes dupliqués ou quasi-identiques détectés : "${duplicateParagraphs[0].substring(0, 60)}..."`,
      auto_fixable: false
    });
  } else if (duplicateParagraphs.length > 0) {
    issues.push({
      gate: 'html-completeness',
      severity: 'major',
      message: `${duplicateParagraphs.length} paragraphe(s) dupliqué(s) détecté(s) : "${duplicateParagraphs[0].substring(0, 60)}..."`,
      auto_fixable: false
    });
  }

  // ── Encoding artifacts detection ──
  const fullText = root.text;
  const encodingPatterns = [
    { re: /\b([a-zà-ÿ])\s([A-Z][a-zà-ÿ]{2,})/g, label: 'mot coupé (ex: "e SIM")' },
    { re: /\b(view)\s*(Box)\b/gi, label: 'artefact SVG (viewBox)' },
    { re: /([A-ZÀ-Ÿa-zà-ÿ]{2,})\s{2,}([A-ZÀ-Ÿa-zà-ÿ]{2,})/g, label: 'espaces multiples intra-mot' },
  ];
  const encodingArtifacts = [];
  for (const { re, label } of encodingPatterns) {
    const matches = fullText.match(re);
    if (matches && matches.length > 0) {
      // Filter false positives for the first pattern (single lowercase letter + capitalized word)
      const filtered = label.includes('mot coupé')
        ? matches.filter(m => !/^[aàâäyoô]\s(A|E|I|O|U|Y|Un|Une|Il|Le|La|Les|De|Du|Des|En|Et|Au|Ou|On|Ce|Sa|Se|Si|Je|Tu|Ne|Ni|Or)$/i.test(m))
        : matches;
      if (filtered.length > 2) {
        encodingArtifacts.push({ label, count: filtered.length, sample: filtered[0] });
      }
    }
  }
  if (encodingArtifacts.length > 0) {
    for (const art of encodingArtifacts) {
      issues.push({
        gate: 'html-completeness',
        severity: 'major',
        message: `Artefact d'encodage détecté (${art.label}) : ${art.count} occurrences, ex: "${art.sample}"`,
        auto_fixable: false
      });
    }
  }

  // ── Generic H2 detection ──
  const genericH2Patterns = [
    /^nos\s+recommandations$/i,
    /^ce\s+qu['\u2019]il\s+faut\s+retenir$/i,
    /^questions?\s+fréquentes?$/i,
    /^nos\s+conseils$/i,
    /^en\s+résumé$/i,
    /^conclusion$/i,
    /^informations?\s+pratiques?$/i,
    /^notre\s+avis$/i,
    /^à\s+retenir$/i,
  ];
  const h2Elements = root.querySelectorAll('h2');
  for (const h2 of h2Elements) {
    const h2Text = h2.text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    for (const pattern of genericH2Patterns) {
      if (pattern.test(h2Text)) {
        issues.push({
          gate: 'html-completeness',
          severity: 'minor',
          message: `H2 trop générique (manque la destination) : "${h2Text}"`,
          auto_fixable: false
        });
        break;
      }
    }
  }



  return issues;
}

// ─── Gate 2: Fact-Check ──────────────────────────────────

function checkFacts(html, destination, title = '') {
  const issues = [];
  const text = parse(html).text.toLowerCase();

  for (const [route, expected] of Object.entries(FLIGHT_DURATIONS)) {
    const [from, to] = route.split('-');
    const pattern = new RegExp(`${from}.*?${to}.*?vol.*?(\\d+)\\s*h`, 'i');
    const altPattern = new RegExp(`vol.*?${from}.*?${to}.*?(\\d+)\\s*h`, 'i');
    const match = text.match(pattern) || text.match(altPattern);
    if (match) {
      const claimed = parseFloat(match[1]);
      if (claimed < expected.min * 0.7 || claimed > expected.max * 1.5) {
        issues.push({
          gate: 'fact-check',
          severity: 'major',
          message: `Durée vol ${from}→${to} suspecte : ${claimed}h affirmé vs ${expected.min}-${expected.max}h réel`,
          auto_fixable: false
        });
      }
    }
  }

  for (const [route, expected] of Object.entries(TRAIN_DURATIONS)) {
    const [from, to] = route.split('-');
    const pattern = new RegExp(`${from}.*?${to}.*?train.*?(\\d+).*?h`, 'i');
    const match = text.match(pattern);
    if (match) {
      const claimed = parseFloat(match[1]);
      if (claimed < expected.min * 0.7 || claimed > expected.max * 1.3) {
        issues.push({
          gate: 'fact-check',
          severity: 'major',
          message: `Durée train ${from}→${to} suspecte : ${claimed}h affirmé vs ${expected.min}-${expected.max}h réel`,
          auto_fixable: false
        });
      }
    }
  }

  const destinationScopeIssues = checkDestinationScope(text, destination, title);
  issues.push(...destinationScopeIssues);


  // ── Untranslated English content detection ──
  const bodyRoot = parse(html);
  // Remove blockquotes (citations) before checking
  const blockquotes = bodyRoot.querySelectorAll('blockquote');
  for (const bq of blockquotes) bq.remove();
  const bodyText = bodyRoot.text;
  
  const commonEnglishPhrases = [
    'tips and tricks', 'hidden gems', 'must-visit', 'must visit',
    'top things to do', 'best places', 'travel guide', 'bucket list',
    'off the beaten path', 'insider tips', 'local guide', 'day trip',
    'things to know', 'what to expect', 'how to get', 'where to stay',
    'best time to visit', 'getting around', 'cost of living',
    "don't miss", 'worth visiting', 'highly recommend',
    'you should', 'make sure to', 'keep in mind',
  ];
  
  const englishPhraseMatches = [];
  for (const phrase of commonEnglishPhrases) {
    const phraseEscaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$' + '&');
    if (new RegExp(phraseEscaped, 'gi').test(bodyText)) {
      englishPhraseMatches.push(phrase);
    }
  }
  
  // Count English-looking words vs total words (simple heuristic)
  const englishStopwords = new Set([
    'the', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'shall', 'can', 'need', 'must', 'that', 'which', 'who', 'whom', 'this',
    'these', 'those', 'there', 'here', 'where', 'when', 'how', 'what', 'why',
    'not', 'but', 'and', 'for', 'with', 'about', 'against', 'between',
    'through', 'during', 'before', 'after', 'above', 'below', 'from', 'into',
    'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
    'while', 'if', 'or', 'so', 'yet', 'also', 'back', 'even', 'still',
    'already', 'since', 'however', 'although', 'though', 'whether',
    'your', 'their', 'its', 'our', 'his', 'her', 'my',
    'you', 'they', 'we', 'he', 'she', 'it',
  ]);
  // French-English shared words to exclude from English count
  const frenchEnglishShared = new Set([
    'a', 'est', 'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'en',
    'et', 'ou', 'que', 'qui', 'ne', 'pas', 'plus', 'par', 'pour', 'sur',
    'dans', 'avec', 'son', 'ses', 'aux', 'au', 'ce', 'se', 'si', 'je',
    'tu', 'il', 'on', 'nous', 'vous', 'ils', 'mon', 'ma', 'mes', 'ton',
    'ta', 'tes', 'hotel', 'restaurant', 'transport', 'budget', 'guide',
    'route', 'temple', 'village', 'centre', 'service', 'note', 'place',
    'simple', 'possible', 'nature', 'culture', 'experience',
  ]);
  
  const allWords = bodyText.split(/\s+/).filter(w => w.length > 2);
  if (allWords.length > 50) {
    let englishWordCount = 0;
    for (const word of allWords) {
      const lower = word.toLowerCase().replace(/[^a-z]/g, '');
      if (lower.length > 2 && englishStopwords.has(lower) && !frenchEnglishShared.has(lower)) {
        englishWordCount++;
      }
    }
    const englishRatio = englishWordCount / allWords.length;
    if (englishRatio > 0.05) {
      issues.push({
        gate: 'fact-check',
        severity: 'major',
        message: `Contenu anglais non traduit détecté : ~${Math.round(englishRatio * 100)}% de mots anglais (${englishWordCount}/${allWords.length})`,
        auto_fixable: false
      });
    }
  }
  
  if (englishPhraseMatches.length >= 2) {
    issues.push({
      gate: 'fact-check',
      severity: 'major',
      message: `Expressions anglaises non traduites : ${englishPhraseMatches.slice(0, 5).map(p => '"' + p + '"').join(', ')}`,
      auto_fixable: false
    });
  }


  return issues;
}

function countMentions(text, terms) {
  let count = 0;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = text.match(re);
    count += matches ? matches.length : 0;
  }
  return count;
}

function checkDestinationScope(text, destination, title = '') {
  const issues = [];
  const normalizedDestination = normalizeDestination(destination);
  const titleLower = String(title || '').toLowerCase();
  // Important: ne pas activer ce garde-fou à partir du body seul.
  // Des liens internes peuvent mentionner "Asie du Sud-Est" même si l'article cible le Japon.
  const isSeaTitle = /asie\s+du\s+sud-?est|sud-?est\s+asiat/i.test(titleLower);
  const isSeaDestination = normalizedDestination ? SEA_COUNTRIES.has(normalizedDestination) : false;

  if (!isSeaTitle && !isSeaDestination) return issues;

  let outlierMentions = 0;
  const outlierDetails = [];
  for (const [country, aliases] of Object.entries(EAST_ASIA_OUTLIERS)) {
    const count = countMentions(text, aliases);
    if (count > 0) {
      outlierMentions += count;
      outlierDetails.push(`${country}:${count}`);
    }
  }

  if (outlierMentions >= 3) {
    issues.push({
      gate: 'fact-check',
      severity: 'critical',
      message: `Incohérence de périmètre destination (hors zone dominante): ${outlierDetails.join(', ')}`,
      auto_fixable: false
    });
  }

  if (normalizedDestination) {
    const destinationCount = countMentions(text, [normalizedDestination]);
    if (destinationCount === 0 && outlierMentions >= 2) {
      issues.push({
        gate: 'fact-check',
        severity: 'major',
        message: `Destination cible "${normalizedDestination}" absente alors que d'autres destinations dominent`,
        auto_fixable: false
      });
    }
  }

  return issues;
}

// ─── Gate 3: Internal Links ──────────────────────────────

async function checkInternalLinks(html, destination) {
  const issues = [];
  const root = parse(html);
  const links = root.querySelectorAll('a').filter(a =>
    (a.getAttribute('href') || '').includes('flashvoyage.com')
  );

  if (links.length < 3) {
    issues.push({
      gate: 'internal-links',
      severity: 'major',
      message: `Seulement ${links.length} liens internes (minimum 3 requis)`,
      auto_fixable: true
    });
  }

  const destNormalized = normalizeDestination(destination);

  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const text = link.text.trim();

    if (isTruncatedAnchorText(text)) {
      issues.push({
        gate: 'internal-links',
        severity: 'critical',
        message: `Lien tronqué : "${text.substring(0, 60)}"`,
        location: href.substring(0, 100),
        auto_fixable: true
      });
    }

    if (destNormalized) {
      const slug = href.toLowerCase();
      const otherCountries = ['singapour', 'singapore', 'malaisie', 'malaysia'];
      for (const other of otherCountries) {
        if (slug.includes(other) && !destNormalized.includes(other)) {
          issues.push({
            gate: 'internal-links',
            severity: 'minor',
            message: `Lien hors-contexte : article ${other} dans un article sur ${destNormalized}`,
            location: href.substring(0, 100),
            auto_fixable: false
          });
        }
      }
    }
  }


  // ── Duplicate links detection ──
  const hrefCounts = new Map();
  const anchorHrefCounts = new Map();
  for (const link of links) {
    const href2 = (link.getAttribute('href') || '').trim();
    const text2 = link.text.trim();
    hrefCounts.set(href2, (hrefCounts.get(href2) || 0) + 1);
    const key = `${text2}||||${href2}`;
    anchorHrefCounts.set(key, (anchorHrefCounts.get(key) || 0) + 1);
  }
  for (const [href2, count] of hrefCounts) {
    if (count > 2) {
      issues.push({
        gate: 'internal-links',
        severity: 'minor',
        message: `Lien dupliqué ${count}x : ${href2.substring(0, 80)}`,
        auto_fixable: false
      });
    }
  }
  for (const [key, count] of anchorHrefCounts) {
    if (count > 2) {
      const [anchorText2, href2] = key.split('||||');
      issues.push({
        gate: 'internal-links',
        severity: 'minor',
        message: `Même ancre + href répétés ${count}x : "${anchorText2.substring(0, 40)}" → ${href2.substring(0, 60)}`,
        auto_fixable: false
      });
    }
  }

    if (WORDPRESS_URL && WORDPRESS_USERNAME && WORDPRESS_APP_PASSWORD) {
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    for (const link of links.slice(0, 10)) {
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('http')) continue;
      try {
        await axios.head(href, { timeout: 5000, headers: { Authorization: `Basic ${auth}` }, maxRedirects: 3 });
      } catch (e) {
        if (e.response?.status === 404) {
          issues.push({
            gate: 'internal-links',
            severity: 'critical',
            message: `Lien mort (404) : ${href.substring(0, 80)}`,
            auto_fixable: true
          });
        }
      }
    }
  }

  return issues;
}

// ─── Gate 4: Image Coherence ─────────────────────────────

function checkImageCoherence(html, destination) {
  const issues = [];
  if (!destination) return issues;
  
  const destNorm = normalizeDestination(destination);
  if (!destNorm) return issues;

  const root = parse(html);
  const images = root.querySelectorAll('img');

  for (const img of images) {
    const alt = (img.getAttribute('alt') || '').toLowerCase();
    const src = (img.getAttribute('src') || '').toLowerCase();

    const wrongCountries = [
      'mauritius', 'maurice', 'maldives', 'hawaii', 'caribbean', 'caraïbes',
      'mediterranean', 'méditerranée', 'greece', 'grèce', 'spain', 'espagne',
      'portugal', 'italy', 'italie', 'france', 'mexico', 'mexique', 'brazil', 'brésil'
    ];
    for (const wrong of wrongCountries) {
      if (alt.includes(wrong) || src.includes(wrong)) {
        issues.push({
          gate: 'image-coherence',
          severity: 'critical',
          message: `Image incohérente : "${wrong}" dans alt/src pour article sur "${destNorm}"`,
          location: alt.substring(0, 80),
          auto_fixable: true
        });
      }
    }
  }

  return issues;
}

// ─── Helpers ─────────────────────────────────────────────

function normalizeDestination(dest) {
  if (!dest) return null;
  const lower = dest.toLowerCase().trim();
  return DESTINATION_ALIASES[lower] || COUNTRY_FOR_CITY[lower] || lower;
}
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isTruncatedAnchorText(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return true;
  const hasTooFewWords = cleaned.split(/\s+/).length <= 2;
  const looksIncompleteTail = /\b(que|tu|l['’]|d['’]|un|une|le|la|les|des|en|du|de|et|ou|a|au|aux)\s*$/i.test(cleaned);
  return cleaned.length < 12 || /\.\.\.$/.test(cleaned) || looksIncompleteTail || hasTooFewWords;
}

function loadInternalArticlesIndex() {
  try {
    const dbPath = `${process.cwd()}/articles-database.json`;
    if (!existsSync(dbPath)) return [];
    const raw = JSON.parse(readFileSync(dbPath, 'utf8'));
    const articles = Array.isArray(raw?.articles) ? raw.articles : (Array.isArray(raw) ? raw : []);
    return articles
      .map(a => ({
        title: String(a.title || a.post_title || a.name || '').trim(),
        link: String(a.link || a.url || '').trim(),
        slug: String(a.slug || '').trim()
      }))
      .filter(a => a.link.includes('flashvoyage.com') && (a.slug || a.title));
  } catch {
    return [];
  }
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function extractSlug(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  } catch {
    return String(url || '').replace(/^https?:\/\/[^/]+\//i, '').replace(/^\/+|\/+$/g, '').toLowerCase();
  }
}

function findBestReplacement(deadUrl, anchorText, destination, articlesIndex) {
  const deadSlug = extractSlug(deadUrl);
  const deadTokens = new Set(tokenize(deadSlug.replace(/-/g, ' ')));
  const anchorTokens = new Set(tokenize(anchorText));
  const destinationTokens = new Set(tokenize(destination || ''));

  let best = null;
  let bestScore = -1;

  for (const candidate of articlesIndex) {
    if (!candidate.link || candidate.link === deadUrl) continue;
    const slug = candidate.slug || extractSlug(candidate.link);
    if (!slug) continue;

    const slugTokens = tokenize(slug.replace(/-/g, ' '));
    const titleTokens = tokenize(candidate.title);

    let score = 0;
    for (const t of slugTokens) if (deadTokens.has(t)) score += 3;
    for (const t of titleTokens) if (anchorTokens.has(t)) score += 2;
    for (const t of slugTokens) if (destinationTokens.has(t)) score += 2;

    if (deadSlug && slug && (deadSlug.startsWith(slug) || slug.startsWith(deadSlug))) score += 5;
    if (candidate.title && anchorText && candidate.title.toLowerCase().includes(anchorText.toLowerCase().slice(0, 20))) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= 4 ? best : null;
}

// ─── Auto-Fixers ─────────────────────────────────────────

function autoFixHtml(html, issues, ctx = {}) {
  let fixed = html;
  let fixCount = 0;
  const articlesIndex = Array.isArray(ctx.internalArticlesIndex) ? ctx.internalArticlesIndex : loadInternalArticlesIndex();
  const replacementCache = new Map();

  if (issues.some(i => i.message.includes('</br>'))) {
    fixed = fixed.replace(/<\/br>/g, '');
    fixCount++;
  }

  const unclosedIssue = issues.find(i => i.message.includes('Balises non fermées'));
  if (unclosedIssue) {
    const unclosedTags = unclosedIssue.message.match(/: (.+)/)?.[1]?.split(', ') || [];
    for (const tag of unclosedTags.reverse()) {
      fixed += `</${tag}>`;
      fixCount++;
    }
  }

  if (!/<h1[\s>]/i.test(fixed) && ctx.title) {
    const shortTitle = ctx.title.length > 80 ? ctx.title.substring(0, 77) + '...' : ctx.title;
    fixed = `<h1 class="wp-block-heading">${shortTitle}</h1>\n\n${fixed}`;
    fixCount++;
  }

  // Corriger la hiérarchie des headings quand un saut > +1 est détecté.
  const headingIssue = issues.find(i => i.gate === 'html-completeness' && /Hiérarchie Hn incohérente/i.test(i.message || ''));
  if (headingIssue) {
    const headingTagRe = /<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi;
    let prevLevel = null;
    fixed = fixed.replace(headingTagRe, (full, tag, attrs, inner) => {
      const currentLevel = Number(String(tag).replace('h', ''));
      if (!Number.isFinite(currentLevel)) return full;
      let nextLevel = currentLevel;
      if (prevLevel !== null && currentLevel > prevLevel + 1) {
        nextLevel = prevLevel + 1;
      }
      const safeLevel = Math.max(1, Math.min(6, nextLevel));
      const out = `<h${safeLevel}${attrs}>${inner}</h${safeLevel}>`;
      if (safeLevel !== currentLevel) fixCount++;
      prevLevel = safeLevel;
      return out;
    });
  }

  // Neutraliser les liens internes morts (404) en conservant le texte visible
  const deadLinkUrls = issues
    .filter(i => i.gate === 'internal-links' && /Lien mort \(404\)\s*:/.test(i.message))
    .map(i => i.message.replace(/^.*Lien mort \(404\)\s*:\s*/, '').trim())
    .filter(Boolean);
  for (const url of [...new Set(deadLinkUrls)]) {
    const hrefRe = escapeRegExp(url);
    const anchorPattern = new RegExp(`<a\\b([^>]*?)href=["']${hrefRe}["']([^>]*)>([\\s\\S]*?)<\\/a>`, 'gi');
    let localFixes = 0;
    fixed = fixed.replace(anchorPattern, (_m, beforeHref, afterHref, anchorText) => {
      localFixes++;
      const plainAnchor = parse(`<div>${anchorText}</div>`).text.trim();
      if (!replacementCache.has(url)) {
        replacementCache.set(url, findBestReplacement(url, plainAnchor, ctx.destination, articlesIndex));
      }
      const replacement = replacementCache.get(url);
      if (replacement?.link) {
        return `<a${beforeHref}href="${replacement.link}"${afterHref}>${anchorText}</a>`;
      }
      return anchorText;
    });
    if (localFixes > 0) {
      fixCount += localFixes;
    }
  }

  // Si le maillage interne est insuffisant, injecter des liens "À lire aussi".
  const hasLowInternalLinksIssue = issues.some(i => i.gate === 'internal-links' && /Seulement\s+\d+\s+liens internes/i.test(i.message || ''));
  if (hasLowInternalLinksIssue && articlesIndex.length > 0) {
    const existingHrefs = new Set(
      [...fixed.matchAll(/href=["']([^"']+)["']/gi)]
        .map(m => String(m[1] || '').trim())
        .filter(Boolean)
    );
    const destinationTokens = tokenize(ctx.destination || '').filter(t => t.length > 2);
    const titleTokens = tokenize(ctx.title || '').filter(t => t.length > 2);
    const scored = [];
    const scoredAll = [];
    for (const item of articlesIndex) {
      if (!item.link || existingHrefs.has(item.link)) continue;
      const hay = `${item.title} ${item.slug}`.toLowerCase();
      let score = 0;
      for (const t of destinationTokens) if (hay.includes(t)) score += 3;
      for (const t of titleTokens.slice(0, 8)) if (hay.includes(t)) score += 1;
      const rec = { item, score };
      scoredAll.push(rec);
      if (destinationTokens.length > 0 && score < 2) continue;
      scored.push(rec);
    }
    const ordered = scored.sort((a, b) => b.score - a.score).map(s => s.item);
    const needed = Math.max(0, 3 - existingHrefs.size);
    let selected = ordered.slice(0, needed);
    if (selected.length < needed) {
      const fallback = scoredAll
        .sort((a, b) => b.score - a.score)
        .map(s => s.item)
        .filter(i => !selected.some(s => s.link === i.link))
        .slice(0, needed - selected.length);
      selected = [...selected, ...fallback];
    }

    if (selected.length > 0) {
      const linkList = selected
        .map(s => `<li><a href="${s.link}">${s.title || s.slug || 'Guide associé'}</a></li>`)
        .join('');
      const block = `<h3>À lire aussi</h3><ul>${linkList}</ul>`;
      if (!/À lire aussi/i.test(fixed)) {
        fixed = `${fixed}\n\n${block}`;
        fixCount++;
      }
    }
  }

  // Si FAQ détectée sans JSON-LD FAQPage, ajouter un schema minimal.
  const hasFaqHeading = /<h[23][^>]*>\s*(?:FAQ|Questions?\s+fr[ée]quentes?|Foire\s+aux\s+questions?)\s*<\/h[23]>/i.test(fixed);
  const hasDetails = /<details[\s>]/i.test(fixed) || /<!-- wp:details -->/i.test(fixed);
  const hasFaqJsonLd = /"@type"\s*:\s*"FAQPage"/i.test(fixed);
  if (hasFaqHeading && hasDetails && !hasFaqJsonLd) {
    const qaPairs = [];
    const detailRe = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/details>/gi;
    let dm;
    while ((dm = detailRe.exec(fixed)) !== null && qaPairs.length < 4) {
      const q = String(dm[1] || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const a = String(dm[2] || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (q.length >= 5 && a.length >= 8) {
        qaPairs.push({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a }
        });
      }
    }
    if (qaPairs.length >= 2) {
      const schema = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qaPairs })}</script>`;
      fixed = `${fixed}\n${schema}`;
      fixCount++;
    }
  }

  // Nettoyage des placeholders récurrents qui cassent la qualité.
  // fixed = fixed
  //   .replace(/\b\d+\s*quelques\s+euros\b/gi, 'un budget à préciser')
  //   .replace(/\bco[ûu]tent\s*quelques\b/gi, 'coûtent')
  //   .replace(/\bun\s+co[ûu]t\s+non\s+n[ée]gligeable\b/gi, 'un coût significatif')
  //   .replace(/\b2quelques\b/gi, 'quelques');
  // if (fixed !== beforeCleanup) fixCount++;

  return { html: fixed, fixCount };
}

export function __testAutoFixHtml(html, issues, ctx = {}) {
  return autoFixHtml(html, issues, ctx);
}

// ─── Main Export ─────────────────────────────────────────

/**
 * Run all 4 validation gates on article HTML.
 * @param {string} html - Article HTML
 * @param {Object} ctx - { destination, title }
 * @returns {Promise<Object>} { issues, criticalCount, fixedHtml, gateResults }
 */
export async function validatePrePublish(html, ctx = {}) {
  const destination = ctx.destination || null;
  console.log('\n🔍 PRE-PUBLISH VALIDATOR — 4 Gates');
  console.log(`   Destination : ${destination || 'inconnue'}`);
  console.log(`   HTML : ${html.length} chars\n`);

  const gate1 = checkHtmlCompleteness(html);
  console.log(`   Gate 1 (HTML Completeness) : ${gate1.length} issue(s)`);

  const gate2 = checkFacts(html, destination, ctx.title || '');
  console.log(`   Gate 2 (Fact-Check) : ${gate2.length} issue(s)`);

  let gate3 = [];
  try {
    gate3 = await checkInternalLinks(html, destination);
  } catch (e) {
    console.warn(`   Gate 3 (Internal Links) : erreur — ${e.message}`);
  }
  console.log(`   Gate 3 (Internal Links) : ${gate3.length} issue(s)`);

  const gate4 = checkImageCoherence(html, destination);
  console.log(`   Gate 4 (Image Coherence) : ${gate4.length} issue(s)`);

  const allIssues = [...gate1, ...gate2, ...gate3, ...gate4];
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;

  let fixedHtml = html;
  let totalFixes = 0;

  if (allIssues.some(i => i.auto_fixable)) {
    const result = autoFixHtml(html, allIssues, ctx);
    fixedHtml = result.html;
    totalFixes = result.fixCount;
    if (totalFixes > 0) {
      console.log(`   🔧 ${totalFixes} auto-fix(es) appliqué(s)`);
    }
  }

  console.log(`\n   RÉSULTAT : ${allIssues.length} issues (${criticalCount} critiques)\n`);

  return {
    issues: allIssues,
    criticalCount,
    fixedHtml,
    totalFixes,
    gateResults: {
      htmlCompleteness: gate1,
      factCheck: gate2,
      internalLinks: gate3,
      imageCoherence: gate4
    }
  };
}
