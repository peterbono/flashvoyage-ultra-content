/**
 * core/save-cta.js — FlashVoyage Reels v2
 *
 * Appends a final "save CTA" scene to every composed reel to boost the
 * Instagram save rate (growth hacker diagnostic: save rate = 0.06%).
 *
 * Usage (at the end of any composer, after addAudioTrack):
 *   const { appendSaveCtaScene } = await import('../core/save-cta.js');
 *   await appendSaveCtaScene(beforeCtaPath, outputPath);
 *
 * The CTA scene is:
 *   - 1080x1920, 30fps, 2.5s by default
 *   - Dark background (#0a0e1a)
 *   - Yellow FlashVoyage pill (#FFD700) with "SAUVEGARDE / tu en auras besoin"
 *   - SILENT (no audio track, no music) — relies on the input video's audio
 *     stream ending naturally; the concat demuxer handles the transition
 *   - Rendered via templates/save-cta-overlay.html (static, no variables)
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from './ffmpeg.js';
import { renderTemplate } from './overlay-renderer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

const WIDTH = 1080;
const HEIGHT = 1920;
const DEFAULT_DURATION = 2.5;
const BG_COLOR = '0x0a0e1a';

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

function safeUnlink(path) {
  try {
    if (path && existsSync(path)) unlinkSync(path);
  } catch { /* ignore */ }
}

/**
 * Build the 2.5s "save CTA" scene as a standalone MP4 that matches the
 * codec/resolution/framerate of the rest of the reel (so it can be concatenated
 * with `-f concat -c copy`).
 *
 * @param {string} outputPath - Where to write the CTA scene MP4
 * @param {number} duration - Scene duration in seconds
 * @returns {Promise<{scenePath: string, overlayPath: string, bgPath: string}>}
 */
async function buildSaveCtaScene(outputPath, duration) {
  ensureTmpDir();
  const ts = Date.now();

  // 1. Render the static overlay PNG
  const overlayPath = join(TMP_DIR, `save-cta-overlay-${ts}.png`);
  await renderTemplate('save-cta-overlay.html', {}, overlayPath);

  // 2. Generate a dark background video (silent audio for concat compatibility)
  const bgPath = join(TMP_DIR, `save-cta-bg-${ts}.mp4`);
  await ffmpeg([
    '-f', 'lavfi',
    '-i', `color=${BG_COLOR}:size=${WIDTH}x${HEIGHT}:duration=${duration}:rate=30`,
    '-f', 'lavfi',
    '-i', 'anullsrc=r=44100:cl=stereo',
    '-map', '0:v',
    '-map', '1:a',
    '-t', String(duration),
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-y',
    bgPath,
  ]);

  // 3. Overlay the PNG on the dark background
  await ffmpeg([
    '-i', bgPath,
    '-i', overlayPath,
    '-filter_complex', `[1]scale=${WIDTH}:${HEIGHT}[ovl];[0][ovl]overlay=0:0`,
    '-map', '0:a',
    '-t', String(duration),
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ]);

  return { scenePath: outputPath, overlayPath, bgPath };
}

/**
 * Append a 2.5s "💾 SAUVEGARDE — tu en auras besoin" CTA scene to the end of
 * an already-composed reel. Uses the ffmpeg concat demuxer to avoid re-encoding
 * the main video (fast, lossless).
 *
 * Because the concat demuxer requires the same codec/resolution/framerate/audio
 * layout on every segment, the CTA scene is produced via a normalisation pass
 * (libx264 + aac + 30fps + yuv420p) matching what every composer produces.
 * If the concat copy fails (e.g. subtle timebase mismatch), we fall back to a
 * full re-encode of both segments.
 *
 * @param {string} inputVideoPath - Path to the composed reel (video + audio)
 * @param {string} outputPath - Where to write the final reel (input + CTA)
 * @param {Object} [opts]
 * @param {number} [opts.duration=2.5] - CTA scene duration in seconds
 * @returns {Promise<string>} outputPath
 */
export async function appendSaveCtaScene(inputVideoPath, outputPath, opts = {}) {
  ensureTmpDir();
  const duration = typeof opts.duration === 'number' ? opts.duration : DEFAULT_DURATION;
  const ts = Date.now();

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const ctaScenePath = join(TMP_DIR, `save-cta-scene-${ts}.mp4`);
  const normalisedInputPath = join(TMP_DIR, `save-cta-norm-input-${ts}.mp4`);
  const concatListPath = join(TMP_DIR, `save-cta-concat-${ts}.txt`);

  let overlayPath = null;
  let bgPath = null;

  try {
    console.log(`[REEL/SAVE-CTA] Building ${duration}s save CTA scene...`);

    // 1. Build the CTA scene
    const built = await buildSaveCtaScene(ctaScenePath, duration);
    overlayPath = built.overlayPath;
    bgPath = built.bgPath;

    // 2. Re-encode the input video with the SAME codec settings as the CTA
    //    scene. This is the most reliable way to guarantee that the concat
    //    demuxer (which uses -c copy) will accept both segments without
    //    timebase/pix_fmt mismatches.
    console.log(`[REEL/SAVE-CTA] Normalising input reel for concat...`);
    await ffmpeg([
      '-i', inputVideoPath,
      '-r', '30',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      '-y',
      normalisedInputPath,
    ]);

    // 3. Write the concat list and concatenate
    const concatContent = [normalisedInputPath, ctaScenePath]
      .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n');
    writeFileSync(concatListPath, concatContent, 'utf-8');

    console.log(`[REEL/SAVE-CTA] Concatenating reel + CTA scene → ${outputPath}`);
    await ffmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);

    console.log(`[REEL/SAVE-CTA] Save CTA appended (+${duration}s)`);
    return outputPath;
  } finally {
    safeUnlink(ctaScenePath);
    safeUnlink(normalisedInputPath);
    safeUnlink(concatListPath);
    safeUnlink(overlayPath);
    safeUnlink(bgPath);
  }
}
