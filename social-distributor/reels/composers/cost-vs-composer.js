/**
 * Cost-vs Composer — FlashVoyage Reels v2
 *
 * Generates an 8s fully-static reel comparing the cost of 8 items in a
 * destination vs France, with a yellow monthly-total band visible from
 * frame 1.
 *
 *   - 1 scene (8s) : all 8 rows + yellow total band visible the whole time
 *
 * Data layout on screen:
 *   - Header title: "Coût en [X] vs France"
 *   - Column flag headers: [DEST flag] [FRANCE flag]
 *   - 8 rows: emoji + item label + [dest price, YELLOW] | [france price, white line-through red]
 *   - Total row (yellow band): "Total/mois" + [dest total] vs [france total, line-through]
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate } from '../core/overlay-renderer.js';
import { prepareClip, loopClip } from '../core/clip-preparer.js';
import { fetchPexelsVideo, downloadVideo, pickMusicTrack } from '../asset-fetcher.js';
import { generateCostVsScript } from '../data/generators/cost-vs.js';
import { flushCosts } from '../cost-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

// ── Constants ───────────────────────────────────────────────────────────────

const SCENE_DURATIONS = [8]; // 1 static scene, all elements visible from frame 1
const TOTAL_DURATION = SCENE_DURATIONS.reduce((a, b) => a + b, 0);

const WIDTH = 1080;
const HEIGHT = 1920;

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

function safeUnlink(filePath) {
  try {
    if (filePath && existsSync(filePath)) unlinkSync(filePath);
  } catch {}
}

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
    '-r', '30',
    '-an',
    '-y',
    outputPath,
  ]);
  return outputPath;
}

async function concatClips(clips, outputPath) {
  const listPath = outputPath + '.txt';
  const fs = await import('fs');
  fs.writeFileSync(listPath, clips.map((c) => `file '${c}'`).join('\n'));
  await ffmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-y',
    outputPath,
  ]);
  try { fs.unlinkSync(listPath); } catch {}
  return outputPath;
}

async function addAudioTrack(videoPath, outputPath, duration) {
  const musicPath = pickMusicTrack('upbeat');
  if (!musicPath) {
    // No music track — just copy the video
    await ffmpeg(['-i', videoPath, '-c:v', 'copy', '-an', '-y', outputPath]);
    return outputPath;
  }
  await ffmpeg([
    '-i', videoPath,
    '-i', musicPath,
    '-filter_complex',
      `[1:a]volume=0.18,atrim=0:${duration},afade=t=in:d=0.5,afade=t=out:st=${duration - 1}:d=1,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aud]`,
    '-map', '0:v', '-map', '[aud]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-y',
    outputPath,
  ]);
  return outputPath;
}

/**
 * Build the overlay replacements map.
 *
 * @param {Object} script - cost-vs script from generator
 */
function buildOverlayReplacements(script) {
  const { destination, rows, totals } = script;

  const replacements = {
    '{{DEST_NAME}}': destination.displayName,
    '{{DEST_FLAG}}': destination.flag,
    '{{FRANCE_FLAG}}': '🇫🇷',
    '{{TOTAL_DEST}}': totals.destFormatted,
    '{{TOTAL_FRANCE}}': totals.franceFormatted,
  };

  // Fill 8 rows (or pad to 8 if fewer)
  for (let i = 0; i < 8; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    replacements[`{{ROW_${rowNum}_EMOJI}}`] = row?.emoji || '';
    replacements[`{{ROW_${rowNum}_LABEL}}`] = row?.label || '';
    replacements[`{{ROW_${rowNum}_DEST}}`] = row?.destPrice || '';
    replacements[`{{ROW_${rowNum}_FRANCE}}`] = row?.francePrice || '';
  }

  return replacements;
}

// ── Main composer ───────────────────────────────────────────────────────────

export async function composeCostVsReel(script, opts = {}) {
  ensureTmpDir();
  const ts = Date.now();
  const outputPath = opts.outputPath || join(TMP_DIR, `cost-vs-final-${ts}.mp4`);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const tempFiles = [];

  try {
    // 1. Fetch one Pexels clip of the destination (background)
    console.log(`[REEL/COST-VS] Fetching Pexels clip for "${script.destination.displayName}"...`);
    const videoUrl = await fetchPexelsVideo(script.destination.pexelsQuery, 'portrait');
    if (!videoUrl) {
      throw new Error(`[REEL/COST-VS] No Pexels clip found for "${script.destination.pexelsQuery}"`);
    }

    const rawClipPath = join(TMP_DIR, `cost-vs-raw-${ts}.mp4`);
    await downloadVideo(videoUrl, rawClipPath);
    tempFiles.push(rawClipPath);
    console.log(`[REEL/COST-VS] Clip downloaded`);

    // 2. Prepare clip: 1080x1920, TOTAL_DURATION seconds, darkened for legibility
    const preparedPath = join(TMP_DIR, `cost-vs-prepared-${ts}.mp4`);
    await prepareClip(rawClipPath, preparedPath, {
      duration: TOTAL_DURATION,
      width: WIDTH,
      height: HEIGHT,
    });
    tempFiles.push(preparedPath);

    const loopedPath = join(TMP_DIR, `cost-vs-looped-${ts}.mp4`);
    await loopClip(preparedPath, loopedPath, TOTAL_DURATION);
    tempFiles.push(loopedPath);
    console.log(`[REEL/COST-VS] Base clip prepared (${TOTAL_DURATION}s)`);

    // 3. Render 1 overlay PNG — static, everything visible
    const overlayPath = join(TMP_DIR, `cost-vs-overlay-${ts}.png`);
    const replacements = buildOverlayReplacements(script);
    await renderTemplate('cost-vs-overlay.html', replacements, overlayPath);
    const overlayPaths = [overlayPath];
    tempFiles.push(overlayPath);
    console.log(`[REEL/COST-VS] 1 overlay rendered (static)`);

    // 4. For each scene, extract segment + overlay
    const composedScenes = [];
    let timeOffset = 0;
    for (let i = 0; i < SCENE_DURATIONS.length; i++) {
      const sceneDuration = SCENE_DURATIONS[i];
      const segmentPath = join(TMP_DIR, `cost-vs-seg-${i}-${ts}.mp4`);
      await ffmpeg([
        '-ss', String(timeOffset),
        '-i', loopedPath,
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

      const composedPath = join(TMP_DIR, `cost-vs-comp-${i}-${ts}.mp4`);
      // Single static overlay reused across all scenes (currently only 1 scene)
      await overlayPngOnClip(segmentPath, overlayPaths[0], sceneDuration, composedPath);
      tempFiles.push(composedPath);
      composedScenes.push(composedPath);
      console.log(`[REEL/COST-VS] Scene ${i + 1}/${SCENE_DURATIONS.length} composed (${sceneDuration}s, static)`);
      timeOffset += sceneDuration;
    }

    // 5. Concatenate scenes
    const concatPath = join(TMP_DIR, `cost-vs-concat-${ts}.mp4`);
    await concatClips(composedScenes, concatPath);
    tempFiles.push(concatPath);
    console.log(`[REEL/COST-VS] ${composedScenes.length} scenes concatenated`);

    // 6. Add audio (before save CTA)
    const beforeCtaPath = join(TMP_DIR, `cost-vs-before-cta-${ts}.mp4`);
    await addAudioTrack(concatPath, beforeCtaPath, TOTAL_DURATION);
    tempFiles.push(beforeCtaPath);

    // 7. Append global save CTA (+2.5s) to boost IG save rate
    const { appendSaveCtaScene } = await import('../core/save-cta.js');
    await appendSaveCtaScene(beforeCtaPath, outputPath);
    console.log(`[REEL/COST-VS] Cost-vs reel complete: ${outputPath} (~${TOTAL_DURATION + 2.5}s, ${composedScenes.length} scenes + save CTA)`);

    return outputPath;
  } finally {
    // Cleanup temp files
    console.log(`[REEL/COST-VS] Cleaning up ${tempFiles.length} temp files...`);
    for (const f of tempFiles) safeUnlink(f);
    try { await flushCosts(); } catch {}
  }
}

/**
 * High-level entry point used by index-v2.js routeToComposer.
 * Takes an article object, generates the script, composes the reel.
 */
export async function generateCostVsReelFromArticle(article, opts = {}) {
  console.log(`[REEL/COST-VS] Generating Cost-vs reel from article: "${(article.title || '').slice(0, 60)}..."`);
  const script = await generateCostVsScript(article);
  console.log(`[REEL/COST-VS] Script ready: ${script.destination.displayName} vs France — ${script.rows.length} rows`);
  const videoPath = await composeCostVsReel(script, opts);
  return { videoPath, script };
}
