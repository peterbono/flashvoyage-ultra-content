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
  const isSeaTitle = /asie\s+du\s+sud-?est|sud-?est\s+asiat/i.test(titleLower) || /asie\s+du\s+sud-?est|sud-?est\s+asiat/i.test(text);
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
      auto_fixable: false
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
