#!/usr/bin/env node
/**
 * set-featured-image.mjs — fetch a stock photo and set it as the WP featured
 * image (cover) for a post that has none.
 *
 * Usage:
 *   node scripts/set-featured-image.mjs <postId> "<search query>" ["alt text"]
 *   node scripts/set-featured-image.mjs 6195 "Thailand temple travel"
 *
 * Env: WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD, PEXELS_API_KEY
 *
 * Idempotent: refuses to overwrite an existing featured image unless --force.
 * Reused by generate-money-page.js so every money page ships with a cover.
 */
import axios from 'axios';
import ImageSourceManager from '../image-source-manager.js';

const WP = (process.env.WORDPRESS_URL || '').replace(/\/$/, '');
const USER = process.env.WORDPRESS_USERNAME;
const PASS = process.env.WORDPRESS_APP_PASSWORD;

export async function setFeaturedImage(postId, query, altText, { force = false } = {}) {
  if (!WP || !USER || !PASS) throw new Error('WORDPRESS_URL/USERNAME/APP_PASSWORD required');
  const auth = Buffer.from(`${USER}:${PASS}`).toString('base64');
  const H = { Authorization: `Basic ${auth}` };

  // 1. Skip if already has a cover (unless forced)
  const post = await axios.get(`${WP}/wp-json/wp/v2/posts/${postId}?_fields=id,featured_media,title`, { headers: H });
  if (post.data.featured_media && !force) {
    console.log(`  ⊘ post ${postId} already has featured_media=${post.data.featured_media} — skip (use --force to override)`);
    return { skipped: true, mediaId: post.data.featured_media };
  }

  // 2. Source an image
  const ism = new ImageSourceManager();
  const img = await ism.searchCascade(query, { minWidth: 1200, orientation: 'landscape' });
  if (!img) throw new Error(`no image found for query "${query}"`);
  console.log(`  → ${img.source}: ${img.url}  (${img.width}x${img.height})  by ${img.photographer || '?'}`);

  // 3. Download
  const dl = await axios.get(img.url, { responseType: 'arraybuffer' });
  const ct = dl.headers['content-type'] || 'image/jpeg';
  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';

  // 4. Upload to WP media
  const up = await axios.post(`${WP}/wp-json/wp/v2/media`, dl.data, {
    headers: {
      ...H,
      'Content-Type': ct,
      'Content-Disposition': `attachment; filename="cover-${postId}.${ext}"`,
    },
  });
  const mediaId = up.data.id;

  // 5. Alt text + attribution caption (SEO + license compliance)
  await axios.post(`${WP}/wp-json/wp/v2/media/${mediaId}`, {
    alt_text: altText || img.alt || query,
    caption: img.photographer ? `Photo : ${img.photographer} / ${img.source} (${img.license || ''})` : '',
  }, { headers: { ...H, 'Content-Type': 'application/json' } });

  // 6. Attach to post
  await axios.post(`${WP}/wp-json/wp/v2/posts/${postId}`, { featured_media: mediaId },
    { headers: { ...H, 'Content-Type': 'application/json' } });

  // 7. Mark image used (dedup across the catalog)
  ism.markUsed(img.sourceId, img.source);

  console.log(`  ✓ post ${postId} "${post.data.title?.rendered?.slice(0,50) || ''}" → featured_media=${mediaId}`);
  return { skipped: false, mediaId, source: img.source };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [postId, query, alt] = process.argv.slice(2).filter(a => a !== '--force');
  const force = process.argv.includes('--force');
  if (!postId || !query) {
    console.error('Usage: node scripts/set-featured-image.mjs <postId> "<query>" ["alt"] [--force]');
    process.exit(1);
  }
  setFeaturedImage(Number(postId), query, alt, { force })
    .then(() => process.exit(0))
    .catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
}
