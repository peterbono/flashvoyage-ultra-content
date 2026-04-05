/**
 * Avant/Apres Composer — FlashVoyage Reels v2
 *
 * Generates an 8s reel: Expectation (3s) → Reality (3s) → CTA (2s)
 * Pipeline: 2 Pexels clips → 3 overlay PNGs → compose → concat → audio → H.264
 *
 * Scene breakdown:
 *   Scene 1 (3s): "AVANT" — beautiful/pristine Pexels clip + expectation overlay
 *   Scene 2 (3s): "APRES" — chaotic/real Pexels clip + reality overlay
 *   Scene 3 (2s): CTA — blurred clip + "ET TOI C'ETAIT COMMENT ?" overlay
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate } from '../core/overlay-renderer.js';
import { prepareClip, concatClips } from '../core/clip-preparer.js';
import { fetchPexelsVideo, downloadVideo, pickMusicTrack } from '../asset-fetcher.js';
import { generateAvantApresScript } from '../data/generators/avantapres.js';
import { flushCosts } from '../cost-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

// ── Constants ────────────────────────────────────────────────────────────────

const EXPECTATION_DURATION = 3;  // seconds
const REALITY_DURATION = 3;      // seconds
const CTA_DURATION = 2;          // seconds
const TOTAL_DURATION = EXPECTATION_DURATION + REALITY_DURATION + CTA_DURATION; // 8s

const WIDTH = 1080;
const HEIGHT = 1920;

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Overlay a transparent PNG onto a video clip.
 * @param {string} clipPath - Prepared video clip
 * @param {string} overlayPath - Transparent PNG overlay
 * @param {number} duration - Scene duration in seconds
 * @param {string} outputPath - Where to write the composited clip
 * @returns {Promise<string>} outputPath
 */
async function overlayPngOnClip(clipPath, overlayPath, duration, outputPath) {
  await ffmpeg([
    '-i', clipPath,
    '-i', overlayPath,
    '-filter_complex', `[1]scale=${WIDTH}:${HEIGHT}[ovl];[0][ovl]overlay=0:0`,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y',
    outputPath,
  ]);
  return outputPath;
}

/**
 * Prepare a blurred + darkened CTA background clip from a source clip.
 * @param {string} inputPath - Source clip (raw Pexels download)
 * @param {string} outputPath - Where to write the blurred clip
 * @returns {Promise<string>} outputPath
 */
async function prepareCtaBackground(inputPath, outputPath) {
  await ffmpeg([
    '-i', inputPath,
    '-vf', `crop=ih*${WIDTH}/${HEIGHT}:ih,scale=${WIDTH}:${HEIGHT},boxblur=20:20,eq=brightness=-0.3`,
    '-t', String(CTA_DURATION),
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y',
    outputPath,
  ]);
  return outputPath;
}

/**
 * Add audio track (music or silent fallback) to a video.
 * @param {string} inputPath - Video without audio
 * @param {string} outputPath - Final video with audio
 * @param {number} duration - Total duration in seconds
 * @returns {Promise<string>} outputPath
 */
async function addAudioTrack(inputPath, outputPath, duration) {
  const audioPath = pickMusicTrack('upbeat') || pickMusicTrack('tropical');

  if (audioPath) {
    await ffmpeg([
      '-i', inputPath,
      '-i', audioPath,
      '-filter_complex',
      `[1:a]volume=0.18,atrim=0:${duration},afade=t=in:d=0.5,afade=t=out:st=${duration - 1}:d=1,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aud]`,
      '-map', '0:v',
      '-map', '[aud]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', String(duration),
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);
  } else {
    // Silent fallback — Instagram requires an audio stream
    await ffmpeg([
      '-i', inputPath,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-map', '0:v',
      '-map', '1:a',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', String(duration),
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);
  }
  return outputPath;
}

// ── Main composer ────────────────────────────────────────────────────────────

/**
 * Compose an Avant/Apres Reel from a generated script.
 *
 * @param {Object} script - From avantapres generator:
 *   { destination, expectation: { text, pexelsQuery }, reality: { text, pexelsQuery }, caption, hashtags }
 * @param {Object} opts
 * @param {string} [opts.outputPath] - Where to write the final MP4
 * @returns {Promise<string>} Path to the final MP4
 */
export async function composeAvantApresReel(script, opts = {}) {
  const ts = Date.now();
  const outputPath = opts.outputPath || join(TMP_DIR, `avantapres-final-${ts}.mp4`);
  ensureTmpDir();

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const tempFiles = [];

  try {
    // ── 1. Fetch 2 Pexels video clips ─────────────────────────────────────
    console.log(`[REEL/AVANTAPRES] Fetching "expectation" clip: "${script.expectation.pexelsQuery}"`);
    const expectVideoUrl = await fetchPexelsVideo(script.expectation.pexelsQuery, 'portrait');

    console.log(`[REEL/AVANTAPRES] Fetching "reality" clip: "${script.reality.pexelsQuery}"`);
    const realityVideoUrl = await fetchPexelsVideo(script.reality.pexelsQuery, 'portrait');

    if (!expectVideoUrl && !realityVideoUrl) {
      throw new Error(`[REEL/AVANTAPRES] No Pexels videos found for either query. Aborting.`);
    }

    // Download clips
    const expectRawPath = join(TMP_DIR, `avantapres-expect-raw-${ts}.mp4`);
    const realityRawPath = join(TMP_DIR, `avantapres-reality-raw-${ts}.mp4`);

    if (expectVideoUrl) {
      await downloadVideo(expectVideoUrl, expectRawPath);
      tempFiles.push(expectRawPath);
      console.log(`[REEL/AVANTAPRES] Expectation clip downloaded`);
    }

    if (realityVideoUrl) {
      await downloadVideo(realityVideoUrl, realityRawPath);
      tempFiles.push(realityRawPath);
      console.log(`[REEL/AVANTAPRES] Reality clip downloaded`);
    }

    // Fallback: if one clip failed, reuse the other
    const expectSource = expectVideoUrl ? expectRawPath : realityRawPath;
    const realitySource = realityVideoUrl ? realityRawPath : expectRawPath;

    // ── 2. Render 3 overlay PNGs ──────────────────────────────────────────

    // 2a. Expectation overlay
    const expectOverlayPath = join(TMP_DIR, `avantapres-expect-overlay-${ts}.png`);
    await renderTemplate('avantapres-expectation-overlay.html', {
      '{{DESTINATION}}': script.destination,
      '{{EXPECTATION_TEXT}}': script.expectation.text || '',
    }, expectOverlayPath);
    tempFiles.push(expectOverlayPath);
    console.log(`[REEL/AVANTAPRES] Expectation overlay rendered`);

    // 2b. Reality overlay
    const realityOverlayPath = join(TMP_DIR, `avantapres-reality-overlay-${ts}.png`);
    await renderTemplate('avantapres-reality-overlay.html', {
      '{{DESTINATION}}': script.destination,
      '{{REALITY_TEXT}}': script.reality.text || '',
    }, realityOverlayPath);
    tempFiles.push(realityOverlayPath);
    console.log(`[REEL/AVANTAPRES] Reality overlay rendered`);

    // 2c. CTA overlay
    const ctaOverlayPath = join(TMP_DIR, `avantapres-cta-overlay-${ts}.png`);
    await renderTemplate('avantapres-cta-overlay.html', {}, ctaOverlayPath);
    tempFiles.push(ctaOverlayPath);
    console.log(`[REEL/AVANTAPRES] CTA overlay rendered`);

    // ── 3. Prepare and compose each scene ─────────────────────────────────

    const composedScenes = [];

    // 3a. Scene 1: Expectation (3s)
    const expectPrepPath = join(TMP_DIR, `avantapres-expect-prep-${ts}.mp4`);
    await prepareClip(expectSource, expectPrepPath, { duration: EXPECTATION_DURATION });
    tempFiles.push(expectPrepPath);

    const expectCompPath = join(TMP_DIR, `avantapres-expect-comp-${ts}.mp4`);
    await overlayPngOnClip(expectPrepPath, expectOverlayPath, EXPECTATION_DURATION, expectCompPath);
    tempFiles.push(expectCompPath);
    composedScenes.push(expectCompPath);
    console.log(`[REEL/AVANTAPRES] Scene 1 (Expectation) composed — ${EXPECTATION_DURATION}s`);

    // 3b. Scene 2: Reality (3s)
    const realityPrepPath = join(TMP_DIR, `avantapres-reality-prep-${ts}.mp4`);
    await prepareClip(realitySource, realityPrepPath, { duration: REALITY_DURATION });
    tempFiles.push(realityPrepPath);

    const realityCompPath = join(TMP_DIR, `avantapres-reality-comp-${ts}.mp4`);
    await overlayPngOnClip(realityPrepPath, realityOverlayPath, REALITY_DURATION, realityCompPath);
    tempFiles.push(realityCompPath);
    composedScenes.push(realityCompPath);
    console.log(`[REEL/AVANTAPRES] Scene 2 (Reality) composed — ${REALITY_DURATION}s`);

    // 3c. Scene 3: CTA (2s) — blurred reality clip as background
    const ctaBgPath = join(TMP_DIR, `avantapres-cta-bg-${ts}.mp4`);
    await prepareCtaBackground(realitySource, ctaBgPath);
    tempFiles.push(ctaBgPath);

    const ctaCompPath = join(TMP_DIR, `avantapres-cta-comp-${ts}.mp4`);
    await overlayPngOnClip(ctaBgPath, ctaOverlayPath, CTA_DURATION, ctaCompPath);
    tempFiles.push(ctaCompPath);
    composedScenes.push(ctaCompPath);
    console.log(`[REEL/AVANTAPRES] Scene 3 (CTA) composed — ${CTA_DURATION}s`);

    // ── 4. Concatenate all 3 scenes ───────────────────────────────────────
    const concattedPath = join(TMP_DIR, `avantapres-concat-${ts}.mp4`);
    await concatClips(composedScenes, concattedPath);
    tempFiles.push(concattedPath);
    console.log(`[REEL/AVANTAPRES] ${composedScenes.length} scenes concatenated`);

    // ── 5. Add audio track ────────────────────────────────────────────────
    const beforeCtaPath = join(TMP_DIR, `avantapres-before-cta-${ts}.mp4`);
    await addAudioTrack(concattedPath, beforeCtaPath, TOTAL_DURATION);
    tempFiles.push(beforeCtaPath);

    // ── 6. Append global save CTA (+2.5s) to boost IG save rate ───────────
    const { appendSaveCtaScene } = await import('../core/save-cta.js');
    await appendSaveCtaScene(beforeCtaPath, outputPath);

    console.log(`[REEL/AVANTAPRES] Avant/Apres reel complete: ${outputPath} (~${TOTAL_DURATION + 2.5}s, 3 scenes + save CTA)`);
    return outputPath;

  } finally {
    // ── Cleanup temp files ────────────────────────────────────────────────
    console.log(`[REEL/AVANTAPRES] Cleaning up ${tempFiles.length} temp files...`);
    for (const f of new Set(tempFiles)) {
      if (f && f !== outputPath && existsSync(f)) {
        try { unlinkSync(f); } catch { /* ignore cleanup errors */ }
      }
    }
  }
}

// ── Convenience: generate from article ───────────────────────────────────────

/**
 * Generate an Avant/Apres reel end-to-end from an article object.
 *
 * 1. Generates the script via Claude Haiku (avantapres generator)
 * 2. Composes the reel via composeAvantApresReel
 *
 * @param {Object} article - Article data { title, hook, keyStats, rawText, ... }
 * @param {Object} opts
 * @param {string} [opts.outputPath] - Where to write the final MP4
 * @returns {Promise<{ videoPath: string, script: Object }>}
 */
export async function generateAvantApresReelFromArticle(article, opts = {}) {
  console.log(`[REEL/AVANTAPRES] Starting Avant/Apres reel pipeline for: "${(article.title || '').slice(0, 60)}"`);

  // 1. Generate script via Haiku
  const script = await generateAvantApresScript(article);
  console.log(`[REEL/AVANTAPRES] Script ready: "${script.destination}" — expectation: "${script.expectation.text}" / reality: "${script.reality.text}"`);

  // 2. Compose the reel
  const videoPath = await composeAvantApresReel(script, opts);

  console.log(`[REEL/AVANTAPRES] Avant/Apres reel generated: ${videoPath}`);

  flushCosts({ format: 'avantapres', destination: script.destination || 'unknown' });

  return { videoPath, script };
}
