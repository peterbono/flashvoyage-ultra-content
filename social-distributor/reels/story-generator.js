/**
 * story-generator.js — FlashVoyage Auto-Story
 *
 * Generates a 1080x1920 Story image promoting a just-published Reel or Post.
 * Extracts a thumbnail frame from the video, renders the Story overlay template,
 * composites them together, and returns a PNG Buffer ready for publishStory().
 *
 * Usage:
 *   import { generateStoryImage } from './story-generator.js';
 *
 *   const buf = await generateStoryImage({
 *     videoPath: '/path/to/reel.mp4',
 *     title: 'Bali vs Thailande',
 *     subtitle: 'Le comparatif ultime',
 *     ctaText: 'VOIR LE REEL ↗',
 *   });
 *
 *   await publishStory({ imageBuffer: buf, pageToken, link: articleUrl });
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from './core/ffmpeg.js';
import { renderTemplate } from './core/overlay-renderer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, 'tmp');

const WIDTH = 1080;
const HEIGHT = 1920;

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Safely remove a temp file. Non-fatal on failure.
 * @param {string} filePath
 */
function safeUnlink(filePath) {
  try {
    if (filePath && existsSync(filePath)) unlinkSync(filePath);
  } catch { /* ignore */ }
}

// ── Core functions ──────────────────────────────────────────────────────────

/**
 * Extract a single frame from a video at a given timestamp.
 * The frame is scaled/cropped to exactly 1080x1920 (portrait Story format).
 *
 * @param {string} videoPath - Path to source video (MP4)
 * @param {string} outputPath - Where to write the extracted PNG frame
 * @param {number} [timestamp=2] - Seconds into the video to extract
 * @returns {Promise<string>} outputPath
 */
async function extractFrame(videoPath, outputPath, timestamp = 2) {
  console.log(`[STORY] Extracting frame at t=${timestamp}s from ${videoPath}`);

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Scale to cover 1080x1920, then crop to exact dimensions.
  // This handles any aspect ratio input (landscape, portrait, square).
  await ffmpeg([
    '-ss', String(timestamp),
    '-i', videoPath,
    '-vf', [
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
      `crop=${WIDTH}:${HEIGHT}`,
    ].join(','),
    '-frames:v', '1',
    '-q:v', '2',
    '-y',
    outputPath,
  ]);

  console.log(`[STORY] Frame extracted -> ${outputPath}`);
  return outputPath;
}

/**
 * Render the auto-story-overlay.html template to a transparent PNG.
 *
 * @param {Object} params
 * @param {string} params.title - Content title
 * @param {string} params.subtitle - Optional subtitle
 * @param {string} params.ctaText - CTA button text
 * @param {string} outputPath - Where to write the overlay PNG
 * @returns {Promise<string>} outputPath
 */
async function renderStoryOverlay({ title, subtitle, ctaText }, outputPath) {
  console.log(`[STORY] Rendering overlay: "${title}"`);

  const replacements = {
    '{{TITLE}}': title || '',
    '{{SUBTITLE}}': subtitle || '',
    '{{CTA_TEXT}}': ctaText || 'VOIR LE REEL ↗',
  };

  await renderTemplate('auto-story-overlay.html', replacements, outputPath);
  console.log(`[STORY] Overlay rendered -> ${outputPath}`);
  return outputPath;
}

/**
 * Composite the background frame and the transparent overlay PNG.
 * Result is a single 1080x1920 PNG ready for IG Story upload.
 *
 * @param {string} framePath - Background image (1080x1920 PNG)
 * @param {string} overlayPath - Transparent overlay (1080x1920 PNG)
 * @param {string} outputPath - Final composited Story PNG
 * @returns {Promise<string>} outputPath
 */
async function compositeStory(framePath, overlayPath, outputPath) {
  console.log(`[STORY] Compositing frame + overlay`);

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  await ffmpeg([
    '-i', framePath,
    '-i', overlayPath,
    '-filter_complex', `[1:v]scale=${WIDTH}:${HEIGHT}[ovl];[0:v][ovl]overlay=0:0`,
    '-frames:v', '1',
    '-y',
    outputPath,
  ]);

  console.log(`[STORY] Composited Story -> ${outputPath}`);
  return outputPath;
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Generate a Story image promoting a just-published Reel or Post.
 *
 * Pipeline:
 *   1. Extract a thumbnail frame from the video at 2s
 *   2. Render auto-story-overlay.html with title/subtitle/CTA to transparent PNG
 *   3. Composite frame + overlay into the final Story image
 *   4. Read the final PNG into a Buffer and clean up temp files
 *
 * @param {Object} params
 * @param {string} params.videoPath - Path to the reel/post MP4
 * @param {string} params.title - Short title for the story (e.g. "Bali vs Thailande")
 * @param {string} [params.subtitle] - Optional subtitle line
 * @param {string} [params.ctaText] - CTA text (default: "VOIR LE REEL ↗")
 * @param {number} [params.frameTimestamp=2] - Seconds into video for the thumbnail
 * @param {string} [params.backgroundImagePath] - Use a static image instead of extracting from video
 * @returns {Promise<Buffer>} PNG image buffer (1080x1920), ready for publishStory()
 */
export async function generateStoryImage({
  videoPath,
  title,
  subtitle = '',
  ctaText = 'VOIR LE REEL ↗',
  frameTimestamp = 2,
  backgroundImagePath,
}) {
  const ts = Date.now();
  ensureTmpDir();

  const framePath = join(TMP_DIR, `story-frame-${ts}.png`);
  const overlayPath = join(TMP_DIR, `story-overlay-${ts}.png`);
  const finalPath = join(TMP_DIR, `story-final-${ts}.png`);

  const tempFiles = [framePath, overlayPath, finalPath];

  try {
    // 1. Get the background frame
    if (backgroundImagePath && existsSync(backgroundImagePath)) {
      // Use the provided static image, scaled to 1080x1920
      console.log(`[STORY] Using provided background image: ${backgroundImagePath}`);
      await ffmpeg([
        '-i', backgroundImagePath,
        '-vf', [
          `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
          `crop=${WIDTH}:${HEIGHT}`,
        ].join(','),
        '-frames:v', '1',
        '-q:v', '2',
        '-y',
        framePath,
      ]);
    } else if (videoPath && existsSync(videoPath)) {
      // Extract frame from video
      await extractFrame(videoPath, framePath, frameTimestamp);
    } else {
      throw new Error(`[STORY] No valid videoPath or backgroundImagePath provided`);
    }

    // 2. Render the overlay template to a transparent PNG
    await renderStoryOverlay({ title, subtitle, ctaText }, overlayPath);

    // 3. Composite: frame + overlay
    await compositeStory(framePath, overlayPath, finalPath);

    // 4. Read the final PNG into a Buffer
    const buffer = readFileSync(finalPath);
    console.log(`[STORY] Story image generated (${(buffer.length / 1024).toFixed(0)} KB)`);

    return buffer;

  } finally {
    // Cleanup all temp files
    console.log(`[STORY] Cleaning up ${tempFiles.length} temp files`);
    for (const f of tempFiles) {
      safeUnlink(f);
    }
  }
}

/**
 * Generate a Story image from just a static image (no video).
 * Convenience wrapper for posts that are image-based (not reels).
 *
 * @param {Object} params
 * @param {string} params.imagePath - Path to the source image
 * @param {string} params.title - Short title
 * @param {string} [params.subtitle] - Optional subtitle
 * @param {string} [params.ctaText] - CTA text (default: "LIRE L'ARTICLE ↗")
 * @returns {Promise<Buffer>} PNG image buffer (1080x1920)
 */
export async function generateStoryImageFromPhoto({
  imagePath,
  title,
  subtitle = '',
  ctaText = 'LIRE L\'ARTICLE ↗',
}) {
  return generateStoryImage({
    videoPath: null,
    backgroundImagePath: imagePath,
    title,
    subtitle,
    ctaText,
  });
}
