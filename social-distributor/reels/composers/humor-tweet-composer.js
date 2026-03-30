/**
 * Humor Tweet-Style Meme Composer — FlashVoyage Reels v2
 *
 * Variant B of the humor A/B test (Thailuminati-style tweet layout).
 * Generates an 8s reel: black background + tweet header + sentence-case text
 * + Pexels clip in a framed clip zone + comedy SFX.
 *
 * Key differences from humor-composer.js (variant A):
 * - Tweet-style layout (profile pic + handle + sentence-case text)
 * - Clip is NOT full-screen — placed inside a 960x870 clip zone at (60, 660)
 * - 8 seconds duration (slightly longer to let the joke land)
 * - Text is sentence case, NOT uppercase Montserrat
 *
 * Pipeline: Pexels video → crop 960x870 → render tweet overlay PNG → composite → mix audio → H.264
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate } from '../core/overlay-renderer.js';
import { prepareClip, loopClip } from '../core/clip-preparer.js';
import { fetchPexelsVideo, downloadVideo, pickMusicTrack } from '../asset-fetcher.js';
import { generateHumorScript } from '../data/generators/humor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

const DURATION = 8; // 8 seconds — slightly longer than variant A to let the joke land

/**
 * Ensure the tmp directory exists.
 */
function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Safely remove a temp file. Never throws.
 * @param {string} filePath
 */
function safeUnlink(filePath) {
  try {
    if (filePath && existsSync(filePath)) unlinkSync(filePath);
  } catch { /* ignore cleanup errors */ }
}

/**
 * Convert UPPERCASE text from the humor generator to sentence case.
 * "QUAND TU DÉCOUVRES QUE LE PAD THAI COÛTE 1,50 €" → "Quand tu découvres que le pad thai coûte 1,50 €"
 *
 * @param {string} text - The uppercase situation text
 * @returns {string} Sentence-case version
 */
function toSentenceCase(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Compose a tweet-style humor reel from a pre-generated script.
 *
 * @param {Object} script - From humor generator: { situation, reactionEmoji, fontSize, pexelsQuery, caption, hashtags }
 * @param {Object} opts - { outputPath: string }
 * @returns {Promise<string>} Path to final MP4
 */
export async function composeTweetHumorReel(script, opts = {}) {
  ensureTmpDir();

  const ts = Date.now();
  const rawClipPath = join(TMP_DIR, `humor-tweet-raw-${ts}.mp4`);
  const preparedClipPath = join(TMP_DIR, `humor-tweet-prepared-${ts}.mp4`);
  const loopedClipPath = join(TMP_DIR, `humor-tweet-looped-${ts}.mp4`);
  const overlayPath = join(TMP_DIR, `humor-tweet-overlay-${ts}.png`);
  const baseVideoPath = join(TMP_DIR, `humor-tweet-base-${ts}.mp4`);
  const compositeClipPath = join(TMP_DIR, `humor-tweet-composite-${ts}.mp4`);
  const outputPath = opts.outputPath || join(TMP_DIR, `humor-tweet-final-${ts}.mp4`);

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  try {
    // ── Step 1: Fetch a Pexels video clip ────────────────────────────────────
    console.log(`[REEL/HUMOR-TWEET] Fetching Pexels video for query: "${script.pexelsQuery}"`);
    const videoUrl = await fetchPexelsVideo(script.pexelsQuery, 'landscape');

    if (!videoUrl) {
      throw new Error(`[REEL/HUMOR-TWEET] No Pexels video found for "${script.pexelsQuery}"`);
    }

    await downloadVideo(videoUrl, rawClipPath);
    console.log(`[REEL/HUMOR-TWEET] Downloaded raw clip: ${rawClipPath}`);

    // ── Step 2: Prepare clip — crop to 960x870 (clip zone size), NOT full-screen ─
    // The clip zone is 960px wide x 870px tall (aspect ~1.10:1)
    await prepareClip(rawClipPath, preparedClipPath, {
      duration: DURATION,
      width: 960,
      height: 870,
    });

    // Loop if the prepared clip is shorter than DURATION
    await loopClip(preparedClipPath, loopedClipPath, DURATION);
    console.log(`[REEL/HUMOR-TWEET] Clip prepared and looped to ${DURATION}s`);

    // ── Step 3: Render the tweet overlay HTML → PNG ─────────────────────────
    // Convert the UPPERCASE situation text to sentence case for the tweet style
    const tweetText = toSentenceCase(script.situation || 'Quand tu voyages en Asie');

    const replacements = {
      '{{TWEET_TEXT}}': tweetText,
    };

    await renderTemplate('humor-tweet-overlay.html', replacements, overlayPath);
    console.log(`[REEL/HUMOR-TWEET] Overlay rendered: ${overlayPath}`);

    // ── Step 4: Create a 1080x1920 black base video ─────────────────────────
    await ffmpeg([
      '-f', 'lavfi',
      '-i', `color=c=black:s=1080x1920:d=${DURATION}:r=30`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-t', String(DURATION),
      '-y',
      baseVideoPath,
    ]);
    console.log(`[REEL/HUMOR-TWEET] Black base video created: ${baseVideoPath}`);

    // ── Step 5: Overlay clip onto black base at position (60, 660) ──────────
    // Then overlay the tweet PNG on top of that
    // Then mix audio
    const audioPath = pickMusicTrack('tropical') || pickMusicTrack('chill');

    if (audioPath) {
      // Full composition: base + clip overlay + PNG overlay + audio
      await ffmpeg([
        '-i', baseVideoPath,          // [0] black base 1080x1920
        '-i', loopedClipPath,          // [1] prepared clip 960x870
        '-i', overlayPath,             // [2] tweet overlay PNG 1080x1920
        '-i', audioPath,               // [3] comedy SFX audio
        '-filter_complex', [
          // Place the clip at (60, 660) on the black base
          '[0][1]overlay=60:660[withclip]',
          // Place the tweet overlay PNG on top
          '[withclip][2]overlay=0:0[vid]',
          // Prepare audio: lower volume, trim, fade out
          `[3:a]volume=0.35,atrim=0:${DURATION},afade=t=out:st=${DURATION - 1}:d=1[aud]`,
        ].join(';'),
        '-map', '[vid]',
        '-map', '[aud]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-t', String(DURATION),
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ]);
    } else {
      // No audio available — compose video only with silent track
      await ffmpeg([
        '-i', baseVideoPath,           // [0] black base 1080x1920
        '-i', loopedClipPath,           // [1] prepared clip 960x870
        '-i', overlayPath,              // [2] tweet overlay PNG 1080x1920
        '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=stereo', // [3] silent audio
        '-filter_complex', [
          '[0][1]overlay=60:660[withclip]',
          '[withclip][2]overlay=0:0[vid]',
        ].join(';'),
        '-map', '[vid]',
        '-map', '3:a',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-t', String(DURATION),
        '-shortest',
        '-movflags', '+faststart',
        '-y',
        outputPath,
      ]);
    }

    console.log(`[REEL/HUMOR-TWEET] Final reel encoded: ${outputPath}`);

    // ── Step 6: Clean up temp files ─────────────────────────────────────────
    safeUnlink(rawClipPath);
    safeUnlink(preparedClipPath);
    safeUnlink(loopedClipPath);
    safeUnlink(overlayPath);
    safeUnlink(baseVideoPath);
    safeUnlink(compositeClipPath);
    console.log(`[REEL/HUMOR-TWEET] Temp files cleaned up`);

    return outputPath;

  } catch (err) {
    // Clean up on error too
    safeUnlink(rawClipPath);
    safeUnlink(preparedClipPath);
    safeUnlink(loopedClipPath);
    safeUnlink(overlayPath);
    safeUnlink(baseVideoPath);
    safeUnlink(compositeClipPath);
    console.error(`[REEL/HUMOR-TWEET] Composition failed: ${err.message}`);
    throw err;
  }
}

/**
 * Full flow: generate a tweet-style humor reel from an article.
 * 1. Generate script via humor generator (Haiku) — reuses the SAME generator as variant A
 * 2. Compose reel via composeTweetHumorReel (different template + composition)
 *
 * @param {Object} article - Article data: { title, hook, keyStats, ... }
 * @param {Object} opts - { outputPath: string }
 * @returns {Promise<{ videoPath: string, script: Object }>}
 */
export async function generateTweetHumorReelFromArticle(article, opts = {}) {
  console.log(`[REEL/HUMOR-TWEET] Starting tweet-style humor reel pipeline for: "${(article.title || '').slice(0, 60)}"`);

  // Step 1: Generate the humor script from the article (same generator as variant A)
  const script = await generateHumorScript(article);
  console.log(`[REEL/HUMOR-TWEET] Script generated: "${script.situation}" ${script.reactionEmoji}`);

  // Step 2: Compose the reel with tweet-style layout
  const videoPath = await composeTweetHumorReel(script, opts);
  console.log(`[REEL/HUMOR-TWEET] Tweet-style humor reel complete: ${videoPath}`);

  return { videoPath, script };
}
