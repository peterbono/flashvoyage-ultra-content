/**
 * FlashVoyage Social Distributor — Article Recycler
 *
 * Recycles existing WordPress articles into multiple social post variants.
 * Each article generates 3-5 variants using different caption templates.
 *
 * Usage:
 *   import { recycleAllArticles, recycleArticle } from './sources/article-recycler.js';
 *   const allVariants = await recycleAllArticles();
 *   const singleVariants = await recycleArticle(4250);
 */

import { extractFromPost, extractFromId, fetchAllPosts } from '../extractor.js';
import { buildCaption, CONTENT_TYPES } from '../caption-builder.js';

// ── Type detection ──────────────────────────────────────────────────────────

const TYPE_RULES = [
  {
    type: 'budget',
    keywords: ['budget', 'coût', 'cout', 'prix', '€', 'euro', 'combien', 'dépenses', 'depenses', 'tarif'],
  },
  {
    type: 'comparatif',
    keywords: ['vs', ' ou ', 'comparatif', 'choisir', 'comparer', 'différence', 'difference', 'meilleur'],
  },
  {
    type: 'insolite',
    keywords: ['piège', 'piege', 'caché', 'cache', 'erreur', 'risque', 'danger', 'arnaque', 'secret', 'interdit', 'insolite'],
  },
  {
    type: 'news',
    keywords: ['visa', 'esim', 'e-sim', 'assurance', 'passeport', 'ambassade', 'frontière', 'frontiere', 'règle', 'réglementation'],
  },
];

/**
 * Detect the primary content type from article title and category.
 * Returns an array of applicable types (always at least one).
 */
function detectTypes(title, category = '') {
  const haystack = `${title} ${category}`.toLowerCase();
  const matched = [];

  for (const rule of TYPE_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) {
        matched.push(rule.type);
        break;
      }
    }
  }

  // If no specific match, default to both question + storytelling
  if (matched.length === 0) {
    return ['question', 'storytelling'];
  }

  return [...new Set(matched)];
}

/**
 * Build a visual template suggestion based on content type.
 * This provides guidance for the image generation step (if any).
 *
 * VP slide combinations per type:
 *   - budget:      Hook + Budget + CTA  (3 slides)
 *   - comparatif:  Hook + Compare + Budget? + CTA (3-4 slides)
 *   - insolite:    Hook + CTA (2 slides)
 *   - news:        Hook + CTA (2 slides)
 *   - question:    Hook + CTA (2 slides)
 *   - storytelling: Hook + CTA (2 slides)
 */
function suggestVisualTemplate(type, extracted) {
  // VP slide combinations — determines which slides generateVPCarousel will produce
  const vpSlideMap = {
    budget: {
      vpSlides: ['hook', 'budget', 'cta'],
      template: 'vp-carousel',
    },
    comparatif: {
      vpSlides: ['hook', 'compare', 'budget', 'cta'],
      template: 'vp-carousel',
    },
    insolite: {
      vpSlides: ['hook', 'cta'],
      template: 'vp-carousel',
    },
    news: {
      vpSlides: ['hook', 'cta'],
      template: 'vp-carousel',
    },
    question: {
      vpSlides: ['hook', 'cta'],
      template: 'vp-carousel',
    },
    storytelling: {
      vpSlides: ['hook', 'cta'],
      template: 'vp-carousel',
    },
  };

  const combo = vpSlideMap[type] || vpSlideMap['question'];

  return {
    template: combo.template,
    vpSlides: combo.vpSlides,
    data: {
      title: extracted.title,
      category: extracted.category,
      imageUrl: extracted.imageUrl,
      keyStats: extracted.keyStats,
      highlights: extracted.highlights,
      hook: extracted.hook,
      shockFact: extracted.shockFact,
    },
  };
}

/**
 * Generate social post variants for a single article.
 *
 * Each variant contains:
 * - postId: WordPress post ID
 * - type: content type used
 * - caption: { text, cta, linkComment, hashtags }
 * - visualTemplate: suggested visual template name
 * - visualData: data for visual rendering
 *
 * @param {object} extracted — Output of extractor.js
 * @param {number|string} postId — WordPress post ID
 * @returns {Array<{ postId, type, caption, visualTemplate, visualData }>}
 */
function generateVariants(extracted, postId) {
  const detectedTypes = detectTypes(extracted.title, extracted.category);
  const variants = [];

  // Generate captions for each detected type
  for (const type of detectedTypes) {
    const caption = buildCaption(extracted, type, 'facebook');
    const visual = suggestVisualTemplate(type, extracted);

    variants.push({
      postId,
      type,
      caption,
      visualTemplate: visual.template,
      visualData: visual.data,
    });
  }

  // Always add extra variants to reach 3-5 total
  const complementaryTypes = CONTENT_TYPES.filter(t => !detectedTypes.includes(t));

  // Add question variant if not already present (universal template)
  if (!detectedTypes.includes('question') && variants.length < 5) {
    const caption = buildCaption(extracted, 'question', 'facebook');
    const visual = suggestVisualTemplate('question', extracted);
    variants.push({
      postId,
      type: 'question',
      caption,
      visualTemplate: visual.template,
      visualData: visual.data,
    });
  }

  // Add storytelling variant if not already present
  if (!detectedTypes.includes('storytelling') && variants.length < 5) {
    const caption = buildCaption(extracted, 'storytelling', 'facebook');
    const visual = suggestVisualTemplate('storytelling', extracted);
    variants.push({
      postId,
      type: 'storytelling',
      caption,
      visualTemplate: visual.template,
      visualData: visual.data,
    });
  }

  // Add one more complementary type if we still have room
  for (const t of complementaryTypes) {
    if (variants.length >= 5) break;
    if (variants.some(v => v.type === t)) continue;

    const caption = buildCaption(extracted, t, 'facebook');
    const visual = suggestVisualTemplate(t, extracted);
    variants.push({
      postId,
      type: t,
      caption,
      visualTemplate: visual.template,
      visualData: visual.data,
    });
  }

  return variants;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Recycle a single article into 3-5 social post variants.
 *
 * @param {number|string} postId — WordPress post ID
 * @returns {Promise<Array<{ postId, type, caption, visualTemplate, visualData }>>}
 */
export async function recycleArticle(postId) {
  const extracted = await extractFromId(postId);
  return generateVariants(extracted, postId);
}

/**
 * Recycle ALL published articles into social post variants.
 * Warning: This fetches all posts and may take a while.
 *
 * @returns {Promise<Array<{ postId, type, caption, visualTemplate, visualData }>>}
 */
export async function recycleAllArticles() {
  console.log('[article-recycler] Fetching all published posts...');
  const posts = await fetchAllPosts();
  console.log(`[article-recycler] Found ${posts.length} published posts.`);

  const allVariants = [];
  let processed = 0;

  for (const post of posts) {
    try {
      const extracted = extractFromPost(post);
      const variants = generateVariants(extracted, post.id);
      allVariants.push(...variants);
      processed++;

      if (processed % 20 === 0) {
        console.log(`[article-recycler] Processed ${processed}/${posts.length} posts (${allVariants.length} variants so far)`);
      }
    } catch (err) {
      console.warn(`[article-recycler] Skipping post ${post.id}: ${err.message}`);
    }
  }

  console.log(`[article-recycler] Done. ${allVariants.length} total variants from ${processed} posts.`);
  return allVariants;
}

// Re-export type detection for testing
export { detectTypes, generateVariants };
