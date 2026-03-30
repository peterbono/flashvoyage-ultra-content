/**
 * Humor/Situation Relatable Composer — FlashVoyage Reels v2
 *
 * Generates a 5-8s reel: Pexels clip + humor overlay PNG + background music.
 * Pipeline: Pexels video → crop 9:16 → overlay PNG → mix audio → H.264
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

const DURATION = 6; // 6 seconds — enough to read the situation + react

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
 * Compose a humor/situation reel from a pre-generated script.
 *
 * @param {Object} script - From humor generator: { situation, reactionEmoji, fontSize, pexelsQuery, caption, hashtags }
 * @param {Object} opts - { outputPath: string }
 * @returns {Promise<string>} Path to final MP4
 */
export async function composeHumorReel(script, opts = {}) {
  ensureTmpDir();

  const ts = Date.now();
  const rawClipPath = join(TMP_DIR, `humor-raw-${ts}.mp4`);
  const preparedClipPath = join(TMP_DIR, `humor-prepared-${ts}.mp4`);
  const loopedClipPath = join(TMP_DIR, `humor-looped-${ts}.mp4`);
  const overlayPath = join(TMP_DIR, `humor-overlay-${ts}.png`);
  const outputPath = opts.outputPath || join(TMP_DIR, `humor-final-${ts}.mp4`);

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  try {
    // ── Step 1: Fetch a Pexels video clip ────────────────────────────────────
    console.log(`[REEL/HUMOR] Fetching Pexels video for query: "${script.pexelsQuery}"`);
    const videoUrl = await fetchPexelsVideo(script.pexelsQuery, 'portrait');

    if (!videoUrl) {
      throw new Error(`[REEL/HUMOR] No Pexels video found for "${script.pexelsQuery}"`);
    }

    await downloadVideo(videoUrl, rawClipPath);
    console.log(`[REEL/HUMOR] Downloaded raw clip: ${rawClipPath}`);

    // ── Step 2: Prepare clip — crop 9:16, scale 1080x1920, trim ─────────────
    await prepareClip(rawClipPath, preparedClipPath, {
      duration: DURATION,
      width: 1080,
      height: 1920,
    });

    // Loop if the prepared clip is shorter than DURATION
    await loopClip(preparedClipPath, loopedClipPath, DURATION);
    console.log(`[REEL/HUMOR] Clip prepared and looped to ${DURATION}s`);

    // ── Step 3: Render the humor overlay HTML → PNG ─────────────────────────
    const replacements = {
      '{{SITUATION_TEXT}}': script.situation || 'QUAND TU VOYAGES EN ASIE',
      '{{FONT_SIZE}}': String(script.fontSize || 62),
      '{{REACTION_EMOJI}}': script.reactionEmoji || '😂',
    };

    await renderTemplate('humor-situation-overlay.html', replacements, overlayPath);
    console.log(`[REEL/HUMOR] Overlay rendered: ${overlayPath}`);

    // ── Step 4: Overlay PNG onto video + mix audio + encode final ──────────
    const audioPath = pickMusicTrack('tropical') || pickMusicTrack('chill');
    const audioArgs = audioPath
      ? ['-i', audioPath, '-filter_complex', `[1]scale=1080:1920[ovl];[0][ovl]overlay=0:0[vid];[2:a]volume=0.18,atrim=0:${DURATION},afade=t=out:st=${DURATION - 1.5}:d=1.5,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aud]`, '-map', '[vid]', '-map', '[aud]']
      : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-filter_complex', '[1]scale=1080:1920[ovl];[0][ovl]overlay=0:0', '-shortest'];

    await ffmpeg([
      '-i', loopedClipPath,
      '-i', overlayPath,
      ...audioArgs,
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

    console.log(`[REEL/HUMOR] Final reel encoded: ${outputPath}`);

    // ── Step 5: Clean up temp files ─────────────────────────────────────────
    safeUnlink(rawClipPath);
    safeUnlink(preparedClipPath);
    safeUnlink(loopedClipPath);
    safeUnlink(overlayPath);
    console.log(`[REEL/HUMOR] Temp files cleaned up`);

    return outputPath;

  } catch (err) {
    // Clean up on error too
    safeUnlink(rawClipPath);
    safeUnlink(preparedClipPath);
    safeUnlink(loopedClipPath);
    safeUnlink(overlayPath);
    console.error(`[REEL/HUMOR] Composition failed: ${err.message}`);
    throw err;
  }
}

/**
 * Full flow: generate a humor reel from an article.
 * 1. Generate script via humor generator (Haiku)
 * 2. Compose reel via composeHumorReel
 *
 * @param {Object} article - Article data: { title, hook, keyStats, ... }
 * @param {Object} opts - { outputPath: string }
 * @returns {Promise<{ videoPath: string, script: Object }>}
 */
export async function generateHumorReelFromArticle(article, opts = {}) {
  console.log(`[REEL/HUMOR] Starting full humor reel pipeline for: "${(article.title || '').slice(0, 60)}"`);

  // Step 1: Generate the humor script from the article
  const script = await generateHumorScript(article);
  console.log(`[REEL/HUMOR] Script generated: "${script.situation}" ${script.reactionEmoji} (${script.fontSize}px)`);

  // Step 2: Compose the reel
  const videoPath = await composeHumorReel(script, opts);
  console.log(`[REEL/HUMOR] Humor reel complete: ${videoPath}`);

  return { videoPath, script };
}
