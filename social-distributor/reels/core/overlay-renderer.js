/**
 * core/overlay-renderer.js — FlashVoyage Reels v2
 *
 * Shared HTML-to-PNG overlay rendering via node-html-to-image.
 * Handles Chrome detection, Puppeteer config, and template substitution.
 * All functions are named ESM exports with no circular dependencies.
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import nodeHtmlToImage from 'node-html-to-image';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');
const TMP_DIR = join(__dirname, '..', 'tmp');

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];

/**
 * Detect the Chrome/Chromium executable path.
 * Tries puppeteer's bundled Chromium first, then common macOS fallback locations.
 *
 * @returns {string|undefined} Path to Chrome executable, or undefined if not found
 */
export function getChromePath() {
  try {
    const puppeteer = require('puppeteer');
    const p = puppeteer.executablePath();
    if (existsSync(p)) return p;
  } catch { /* ignore — puppeteer may not be installed */ }

  const fallbacks = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const fb of fallbacks) {
    if (existsSync(fb)) return fb;
  }
  return undefined;
}

// Resolve once at module load
const CHROME_PATH = getChromePath();

/**
 * Render a raw HTML string to a transparent PNG image.
 *
 * @param {string} htmlContent - Full HTML string to render
 * @param {string} outputPath - Where to write the resulting PNG
 * @returns {Promise<string>} The output PNG path
 */
export async function renderOverlay(htmlContent, outputPath) {
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  await nodeHtmlToImage({
    output: outputPath,
    html: htmlContent,
    type: 'png',
    transparent: true,
    puppeteerArgs: {
      args: PUPPETEER_ARGS,
      ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {}),
    },
    waitUntil: 'networkidle0',
  });

  console.log(`[REEL/CORE] Rendered overlay → ${outputPath}`);
  return outputPath;
}

/**
 * Read an HTML template from the templates/ directory, apply placeholder
 * replacements, and render it to a transparent PNG.
 *
 * Template files use {{KEY}} placeholders that get replaced with the
 * corresponding values from the replacements object.
 *
 * @param {string} templateName - Filename of the template (e.g. 'reel-text-overlay.html')
 * @param {Object<string, string>} replacements - Map of {{KEY}} to replacement value
 * @param {string} outputPath - Where to write the resulting PNG
 * @returns {Promise<string>} The output PNG path
 */
export async function renderTemplate(templateName, replacements, outputPath) {
  const templatePath = join(TEMPLATES_DIR, templateName);

  if (!existsSync(templatePath)) {
    throw new Error(`[REEL/CORE] Template not found: ${templatePath}`);
  }

  let html = readFileSync(templatePath, 'utf-8');

  // Apply all replacements: {{KEY}} → value
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(key, String(value));
  }

  return renderOverlay(html, outputPath);
}
