/**
 * Versus Composer — FlashVoyage Reels v2
 *
 * Generates a ~14s split-screen comparison reel:
 *   - Scene 1 (2s): VS title only, split-screen destinations footage
 *   - Scene 2 (2.5s): + row 1 (Budget)
 *   - Scene 3 (2.5s): + rows 1-2 (Budget + Visa)
 *   - Scene 4 (2.5s): + rows 1-3 (Budget + Visa + Période)
 *   - Scene 5 (2.5s): + rows 1-4 (Budget + Visa + Période + Top Spots)
 *   - Scene 6 (2s): + all 5 rows + CTA
 *
 * Audio: upbeat at 18% volume with fade in/out
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate } from '../core/overlay-renderer.js';
import { prepareClip, loopClip, concatClips } from '../core/clip-preparer.js';
import { fetchPexelsVideo, downloadVideo, pickMusicTrack } from '../asset-fetcher.js';
import { generateVersusScript } from '../data/generators/versus.js';
import { flushCosts } from '../cost-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

// ── Constants ───────────────────────────────────────────────────────────────

const SCENE_DURATIONS = [1.2, 1, 1, 1, 1, 1.8]; // 6 scenes = 7s total (rapid fire)
const TOTAL_DURATION = SCENE_DURATIONS.reduce((a, b) => a + b, 0); // 7s
const ROW_COUNT = 5;

const WIDTH = 1080;
const HEIGHT = 1920;
const HALF_WIDTH = 540; // Each side of the split-screen

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Prepare a clip cropped to half-width (540x1920) for split-screen usage.
 * @param {string} inputPath - Raw video clip
 * @param {string} outputPath - Where to write the prepared half-clip
 * @param {number} duration - Target duration in seconds
 * @returns {Promise<string>} outputPath
 */
async function prepareHalfClip(inputPath, outputPath, duration) {
  ensureTmpDir();
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  console.log(`[REEL/VERSUS] Preparing half-clip: ${HALF_WIDTH}x${HEIGHT}, ${duration}s`);

  await ffmpeg([
    '-i', inputPath,
    '-vf', `crop=ih*${HALF_WIDTH}/${HEIGHT}:ih,scale=${HALF_WIDTH}:${HEIGHT}`,
    '-t', String(duration),
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
 * Compose a split-screen (hstack) video from two half-clips.
 * Both clips must be 540x1920 and the same duration.
 *
 * @param {string} leftClip - Path to left half-clip
 * @param {string} rightClip - Path to right half-clip
 * @param {number} duration - Target duration in seconds
 * @param {string} outputPath - Where to write the composited split-screen
 * @returns {Promise<string>} outputPath
 */
async function composeSplitScreen(leftClip, rightClip, duration, outputPath) {
  console.log(`[REEL/VERSUS] Composing split-screen: ${HALF_WIDTH}x2 = ${WIDTH}x${HEIGHT}, ${duration}s`);

  await ffmpeg([
    '-i', leftClip,
    '-i', rightClip,
    '-filter_complex', `[0:v][1:v]hstack=inputs=2[v]`,
    '-map', '[v]',
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
 * Overlay a PNG onto a video clip.
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
 * Add audio track (upbeat music or silent fallback) to a video.
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
      '-filter_complex', `[1:a]volume=0.18,atrim=0:${duration},afade=t=in:d=0.5,afade=t=out:st=${duration - 1}:d=1,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aud]`,
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
    // Silent fallback
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

/**
 * Build the overlay template replacements for a progressive reveal scene.
 *
 * @param {Object} script - Versus script
 * @param {number} revealUpTo - How many rows to show (0 = title only, 1-5 = progressive)
 * @param {boolean} showCta - Whether to show the CTA text
 * @returns {Object} Replacements map for renderTemplate
 */
function buildOverlayReplacements(script, revealUpTo, showCta = false) {
  const HIDDEN = 'display:none';
  const VISIBLE = '';

  const replacements = {
    '{{DEST_A}}': script.destA.name,
    '{{DEST_B}}': script.destB.name,
    '{{FLAG_A}}': script.destA.flag,
    '{{FLAG_B}}': script.destB.flag,
    '{{CTA_TEXT}}': showCta ? 'COMMENTE TON CHOIX' : '',
  };

  // CTA zone visibility
  if (!showCta) {
    replacements['{{CTA_TEXT}}'] = '';
  }

  // Fill all 5 rows
  for (let i = 0; i < ROW_COUNT; i++) {
    const row = script.rows[i];
    const rowNum = i + 1;
    const isVisible = i < revealUpTo;

    replacements[`{{ROW_${rowNum}_LABEL}}`] = row ? row.label : '';
    replacements[`{{ROW_${rowNum}_LEFT}}`] = row ? row.left : '';
    replacements[`{{ROW_${rowNum}_RIGHT}}`] = row ? row.right : '';
    replacements[`{{ROW_${rowNum}_STYLE}}`] = isVisible ? VISIBLE : HIDDEN;
  }

  return replacements;
}

// ── Main composer ───────────────────────────────────────────────────────────

/**
 * Compose a Versus Reel from a generated script.
 *
 * @param {Object} script - From versus generator:
 *   { destA: {name, flag, pexelsQuery}, destB: {name, flag, pexelsQuery},
 *     rows: [{label, left, right}], caption, hashtags }
 * @param {Object} opts
 * @param {string} [opts.outputPath] - Where to write the final MP4
 * @returns {Promise<string>} Path to the final MP4
 */
export async function composeVersusReel(script, opts = {}) {
  const ts = Date.now();
  const outputPath = opts.outputPath || join(TMP_DIR, `versus-final-${ts}.mp4`);
  ensureTmpDir();

  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const tempFiles = [];

  try {
    // ── 1. Fetch 2 Pexels portrait clips (destA and destB) ─────────────────
    console.log(`[REEL/VERSUS] Fetching Pexels clips for "${script.destA.name}" and "${script.destB.name}"...`);

    const [videoUrlA, videoUrlB] = await Promise.all([
      fetchPexelsVideo(script.destA.pexelsQuery, 'portrait'),
      fetchPexelsVideo(script.destB.pexelsQuery, 'portrait'),
    ]);

    // Download clips (with fallback)
    let rawClipA = null;
    let rawClipB = null;

    if (videoUrlA) {
      rawClipA = join(TMP_DIR, `versus-raw-A-${ts}.mp4`);
      await downloadVideo(videoUrlA, rawClipA);
      tempFiles.push(rawClipA);
      console.log(`[REEL/VERSUS] Clip A downloaded`);
    }

    if (videoUrlB) {
      rawClipB = join(TMP_DIR, `versus-raw-B-${ts}.mp4`);
      await downloadVideo(videoUrlB, rawClipB);
      tempFiles.push(rawClipB);
      console.log(`[REEL/VERSUS] Clip B downloaded`);
    }

    // If one clip is missing, try generic fallback
    if (!rawClipA && !rawClipB) {
      console.warn(`[REEL/VERSUS] Both clips failed, trying generic fallback...`);
      const fallbackUrl = await fetchPexelsVideo('travel aerial landscape drone', 'portrait');
      if (!fallbackUrl) {
        throw new Error('[REEL/VERSUS] Could not fetch any video clips — aborting');
      }
      rawClipA = join(TMP_DIR, `versus-raw-A-${ts}.mp4`);
      await downloadVideo(fallbackUrl, rawClipA);
      tempFiles.push(rawClipA);
      rawClipB = rawClipA; // Use same clip for both sides
    } else if (!rawClipA) {
      rawClipA = rawClipB; // Use B for both
    } else if (!rawClipB) {
      rawClipB = rawClipA; // Use A for both
    }

    // ── 2. Prepare half-clips (540x1920) and loop to full duration ─────────
    const halfClipA = join(TMP_DIR, `versus-half-A-${ts}.mp4`);
    await prepareHalfClip(rawClipA, halfClipA, TOTAL_DURATION);
    tempFiles.push(halfClipA);

    const loopedClipA = join(TMP_DIR, `versus-loop-A-${ts}.mp4`);
    await loopClip(halfClipA, loopedClipA, TOTAL_DURATION);
    tempFiles.push(loopedClipA);

    const halfClipB = join(TMP_DIR, `versus-half-B-${ts}.mp4`);
    await prepareHalfClip(rawClipB, halfClipB, TOTAL_DURATION);
    tempFiles.push(halfClipB);

    const loopedClipB = join(TMP_DIR, `versus-loop-B-${ts}.mp4`);
    await loopClip(halfClipB, loopedClipB, TOTAL_DURATION);
    tempFiles.push(loopedClipB);

    console.log(`[REEL/VERSUS] Half-clips prepared and looped to ${TOTAL_DURATION}s`);

    // ── 3. Compose full-duration split-screen base video ───────────────────
    const splitScreenPath = join(TMP_DIR, `versus-split-${ts}.mp4`);
    await composeSplitScreen(loopedClipA, loopedClipB, TOTAL_DURATION, splitScreenPath);
    tempFiles.push(splitScreenPath);
    console.log(`[REEL/VERSUS] Split-screen base composed (${TOTAL_DURATION}s)`);

    // ── 4. Render 6 progressive overlay PNGs ───────────────────────────────
    const overlayPaths = [];

    // Scene 1: title only (0 rows visible)
    // Scene 2: + row 1
    // Scene 3: + rows 1-2
    // Scene 4: + rows 1-3
    // Scene 5: + rows 1-4
    // Scene 6: + all 5 rows + CTA
    const sceneConfigs = [
      { revealUpTo: 0, showCta: false },
      { revealUpTo: 1, showCta: false },
      { revealUpTo: 2, showCta: false },
      { revealUpTo: 3, showCta: false },
      { revealUpTo: 4, showCta: false },
      { revealUpTo: 5, showCta: true },
    ];

    for (let i = 0; i < sceneConfigs.length; i++) {
      const { revealUpTo, showCta } = sceneConfigs[i];
      const overlayPath = join(TMP_DIR, `versus-overlay-${i}-${ts}.png`);
      const replacements = buildOverlayReplacements(script, revealUpTo, showCta);
      await renderTemplate('versus-overlay.html', replacements, overlayPath);
      overlayPaths.push(overlayPath);
      tempFiles.push(overlayPath);
    }
    console.log(`[REEL/VERSUS] ${overlayPaths.length} progressive overlays rendered`);

    // ── 5. For each scene, extract the split-screen segment + overlay ──────
    const composedScenes = [];
    let timeOffset = 0;

    for (let i = 0; i < SCENE_DURATIONS.length; i++) {
      const sceneDuration = SCENE_DURATIONS[i];

      // Extract segment from the split-screen base
      const segmentPath = join(TMP_DIR, `versus-seg-${i}-${ts}.mp4`);
      await ffmpeg([
        '-ss', String(timeOffset),
        '-i', splitScreenPath,
        '-t', String(sceneDuration),
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-an',
        '-y',
        segmentPath,
      ]);
      tempFiles.push(segmentPath);

      // Overlay the PNG on this segment
      const composedPath = join(TMP_DIR, `versus-comp-${i}-${ts}.mp4`);
      await overlayPngOnClip(segmentPath, overlayPaths[i], sceneDuration, composedPath);
      tempFiles.push(composedPath);
      composedScenes.push(composedPath);

      const rowsShown = sceneConfigs[i].revealUpTo;
      console.log(`[REEL/VERSUS] Scene ${i + 1}/6 composed (${sceneDuration}s, ${rowsShown} rows${sceneConfigs[i].showCta ? ' + CTA' : ''})`);

      timeOffset += sceneDuration;
    }

    if (composedScenes.length === 0) {
      throw new Error('[REEL/VERSUS] No scenes were composed — cannot produce reel');
    }

    // ── 6. Concatenate all scenes ──────────────────────────────────────────
    const concattedPath = join(TMP_DIR, `versus-concat-${ts}.mp4`);
    await concatClips(composedScenes, concattedPath);
    tempFiles.push(concattedPath);
    console.log(`[REEL/VERSUS] ${composedScenes.length} scenes concatenated`);

    // ── 7. Add audio (upbeat) + final encode ───────────────────────────────
    await addAudioTrack(concattedPath, outputPath, TOTAL_DURATION);

    console.log(`[REEL/VERSUS] Versus reel complete: ${outputPath} (~${TOTAL_DURATION}s, ${composedScenes.length} scenes)`);
    return outputPath;

  } finally {
    // ── Cleanup temp files ────────────────────────────────────────────────
    console.log(`[REEL/VERSUS] Cleaning up ${tempFiles.length} temp files...`);
    for (const f of new Set(tempFiles)) {
      if (f && f !== outputPath && existsSync(f)) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
    }
  }
}

// ── Convenience: generate from article ──────────────────────────────────────

/**
 * Generate a Versus reel end-to-end from an article object.
 *
 * 1. Generates the script via Claude Haiku (versus generator)
 * 2. Composes the reel via composeVersusReel
 *
 * @param {Object} article - Article data { title, hook, rawText, ... }
 * @param {Object} opts
 * @param {string} [opts.outputPath] - Where to write the final MP4
 * @returns {Promise<{ videoPath: string, script: Object }>}
 */
export async function generateVersusReelFromArticle(article, opts = {}) {
  console.log(`[REEL/VERSUS] Generating Versus reel from article: "${(article.title || '').slice(0, 60)}..."`);

  // 1. Generate script via Haiku
  const script = await generateVersusScript(article);
  console.log(`[REEL/VERSUS] Script ready: "${script.destA.name}" vs "${script.destB.name}" — ${script.rows.length} rows`);

  // 2. Compose the reel
  const videoPath = await composeVersusReel(script, opts);

  console.log(`[REEL/VERSUS] Versus reel generated: ${videoPath}`);

  flushCosts({ format: 'versus', destination: `${script.destA?.name || 'unknown'} vs ${script.destB?.name || 'unknown'}` });

  return { videoPath, script };
}
