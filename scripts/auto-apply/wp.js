/**
 * Thin WordPress REST API wrapper for the auto-apply runner.
 *
 * We intentionally do NOT reuse ContentRefresher — it does live-data
 * enrichment (flights, safety, cost-of-living) which is out of scope for
 * LOW-tier mechanical edits.
 *
 * Environment variables expected (standard repo convention, same as
 * .github/workflows/refresh-articles.yml):
 *   WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD
 */

import axios from 'axios';

function getCreds() {
  const url = process.env.WORDPRESS_URL;
  const user = process.env.WORDPRESS_USERNAME;
  const pass = process.env.WORDPRESS_APP_PASSWORD;
  if (!url || !user || !pass) {
    const missing = [
      !url && 'WORDPRESS_URL',
      !user && 'WORDPRESS_USERNAME',
      !pass && 'WORDPRESS_APP_PASSWORD',
    ].filter(Boolean).join(', ');
    const err = new Error(`Missing WordPress credentials: ${missing}`);
    err.code = 'WP_CREDS_MISSING';
    throw err;
  }
  return { url, user, pass };
}

function authHeader() {
  const { user, pass } = getCreds();
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

/**
 * Fetch all published posts with edit context so we get raw content
 * (not rendered HTML) for accurate diff + regex operations.
 *
 * @param {number} maxPages
 * @returns {Promise<Array<object>>}
 */
export async function fetchAllPublishedPosts(maxPages = 10) {
  const { url } = getCreds();
  const headers = { Authorization: authHeader() };

  const posts = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const resp = await axios.get(`${url}/wp-json/wp/v2/posts`, {
        headers,
        params: {
          status: 'publish',
          per_page: 50,
          page,
          context: 'edit',
          _fields: 'id,title,slug,modified,link,content,meta,tags',
        },
      });
      posts.push(...resp.data);
      const totalPages = parseInt(resp.headers['x-wp-totalpages'] || '1', 10);
      if (page >= totalPages) break;
    } catch (err) {
      if (err.response?.status === 400) break;
      throw err;
    }
  }
  return posts;
}

/**
 * Fetch a single post by slug (edit context).
 */
export async function fetchPostBySlug(slug) {
  const { url } = getCreds();
  const headers = { Authorization: authHeader() };
  const resp = await axios.get(`${url}/wp-json/wp/v2/posts`, {
    headers,
    params: {
      slug,
      status: 'publish',
      context: 'edit',
      _fields: 'id,title,slug,modified,link,content,meta,tags',
    },
  });
  return Array.isArray(resp.data) && resp.data.length > 0 ? resp.data[0] : null;
}

/**
 * Update a post. payload is e.g. { title, content }.
 * Caller is responsible for ensuring content is edit-context raw HTML.
 */
export async function updatePost(postId, payload) {
  const { url } = getCreds();
  const headers = {
    Authorization: authHeader(),
    'Content-Type': 'application/json',
  };
  const resp = await axios.post(
    `${url}/wp-json/wp/v2/posts/${postId}`,
    payload,
    { headers }
  );
  return resp.data;
}

/**
 * Extract the raw (edit-context) title string. WP returns objects like
 * { raw, rendered } when context=edit.
 */
export function getRawTitle(post) {
  if (!post?.title) return '';
  if (typeof post.title === 'string') return post.title;
  return post.title.raw ?? post.title.rendered ?? '';
}

/**
 * Extract the raw (edit-context) content string.
 */
export function getRawContent(post) {
  if (!post?.content) return '';
  if (typeof post.content === 'string') return post.content;
  return post.content.raw ?? post.content.rendered ?? '';
}
