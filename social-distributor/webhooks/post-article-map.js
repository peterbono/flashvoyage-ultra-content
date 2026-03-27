/**
 * Post-Article Map — FlashVoyage Webhook System
 * Maps Instagram post IDs to article URLs so we can reply with the right link
 * when someone comments "INFO" on a post.
 *
 * Storage: ../data/post-article-map.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(__dirname, '..', 'data', 'post-article-map.json');

function loadMap() {
  if (!existsSync(MAP_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MAP_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveMap(map) {
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), 'utf-8');
}

/**
 * Save a mapping between an IG post ID and an article.
 * Called after each successful IG publish.
 *
 * @param {string} igPostId — Instagram media ID (from Graph API)
 * @param {string} articleUrl — Full URL of the article on flashvoyage.com
 * @param {string} title — Article title (for Haiku prompt context)
 */
export function savePostMapping(igPostId, articleUrl, title) {
  const map = loadMap();
  map[igPostId] = {
    articleUrl,
    title,
    savedAt: new Date().toISOString(),
  };
  saveMap(map);
  console.log(`[POST-MAP] Saved: ${igPostId} -> ${articleUrl}`);
}

/**
 * Look up which article a post is about.
 * @param {string} igPostId
 * @returns {{ articleUrl: string, title: string } | null}
 */
export function lookupPost(igPostId) {
  const map = loadMap();
  return map[igPostId] || null;
}

/**
 * Get all mappings (for debugging).
 * @returns {Object}
 */
export function getAllMappings() {
  return loadMap();
}
