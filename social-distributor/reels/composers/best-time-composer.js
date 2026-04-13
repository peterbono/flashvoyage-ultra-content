/**
 * Best-time Composer — FlashVoyage Reels v2
 *
 * Generates a 10s reel showing a Gantt-style travel calendar: 12 month
 * columns × 6 countries, with each cell colour-coded as best / sweet /
 * avoid / neutral so the viewer can see when each destination is optimal
 * as if reading an activity timeline.
 *
 * 1 static scene (10s). All elements visible from frame 1.
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate } from '../core/overlay-renderer.js';
import { prepareClip, loopClip } from '../core/clip-preparer.js';
import { fetchPexelsVideo, downloadVideo, pickMusicTrack } from '../asset-fetcher.js';
import { generateBestTimeScript } from '../data/generators/best-time.js';
import { flushCosts } from '../cost-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

const SCENE_DURATIONS = [10]; // 1 static scene, everything visible from frame 1
const TOTAL_DURATION = SCENE_DURATIONS.reduce((a, b) => a + b, 0);
const WIDTH = 1080;
const HEIGHT = 1920;

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
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', outputPath]);
  try { fs.unlinkSync(listPath); } catch {}
  return outputPath;
}

async function addAudioTrack(videoPath, outputPath, duration, destination = null) {
  // FV-FIX 2026-04-13: ASMR-first for slow-paced informational format.
  // Best-time reels show calendar data — ambient sound reinforces immersion
  // better than generic upbeat. Fallback chain: asmr → upbeat.
  // Destination-aware: best-time is REGIONAL (e.g. SEA = 6 countries on
  // screen). When no single destination dominates, we stay on the full generic
  // ASMR pool. Single-country regions fall back cleanly too.
  const musicPath = pickMusicTrack('asmr', { destination }) || pickMusicTrack('upbeat');
  if (!musicPath) {
    await ffmpeg(['-i', videoPath, '-c:v', 'copy', '-an', '-y', outputPath]);
    return outputPath;
  }
  await ffmpeg([
    '-i', videoPath,
    '-i', musicPath,
    '-filter_complex',
      `[1:a]volume=0.18,atrim=0:${duration},afade=t=in:d=0.5,afade=t=out:st=${duration - 1}:d=1,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aud]`,
    '-map', '0:v', '-map', '[aud]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-shortest', '-y',
    outputPath,
  ]);
  return outputPath;
}

// ── Hard truncation helpers (prevent text overflow in overlay) ──────────────
const MAX_TITLE = 30;
const DANGLING = /\s+(?:en|de|du|d|à|au|aux|le|la|les|un|une|des|pour|par|sans|sur|avec|et|ou|qui|que|ne|se|ce)\s*$/i;
function truncate(s, max) {
  if (!s || s.length <= max) return s;
  let t = s.slice(0, max).replace(/\s+\S*$/, ''); // cut at word boundary
  t = t.replace(DANGLING, '');                      // drop trailing preposition/article
  return t || s.slice(0, max);                      // fallback if regex ate everything
}

function buildOverlayReplacements(script) {
  const rawLine1 = (script.title || '').split('\n')[0] || '';
  const rawLine2 = (script.title || '').split('\n')[1] || '';
  const replacements = {
    '{{TITLE_LINE_1}}': truncate(rawLine1, MAX_TITLE),
    '{{TITLE_LINE_2}}': truncate(rawLine2, MAX_TITLE),
  };

  // Fill 6 country rows × 12 month cells + flag + name
  for (let i = 0; i < 6; i++) {
    const item = script.items[i];
    const n = i + 1;
    replacements[`{{C${n}_FLAG}}`] = item?.flag || '';
    replacements[`{{C${n}_NAME}}`] = item?.displayName || '';

    const timeline = item?.timeline || Array(12).fill('ok');
    for (let m = 0; m < 12; m++) {
      // Status class: 'best' | 'sweet' | 'avoid' | 'ok'
      replacements[`{{C${n}_M${m + 1}}}`] = timeline[m] || 'ok';
    }
  }

  return replacements;
}

export async function composeBestTimeReel(script, opts = {}) {
  ensureTmpDir();
  const ts = Date.now();
  const outputPath = opts.outputPath || join(TMP_DIR, `best-time-final-${ts}.mp4`);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const tempFiles = [];

  try {
    const bgQuery = 'southeast asia travel aerial landscape tropical';
    console.log(`[REEL/BEST-TIME] Fetching Pexels clip: "${bgQuery}"`);
    const videoUrl = await fetchPexelsVideo(bgQuery, 'portrait');
    if (!videoUrl) {
      throw new Error(`[REEL/BEST-TIME] No Pexels clip found`);
    }

    const rawClipPath = join(TMP_DIR, `best-time-raw-${ts}.mp4`);
    await downloadVideo(videoUrl, rawClipPath);
    tempFiles.push(rawClipPath);

    const preparedPath = join(TMP_DIR, `best-time-prepared-${ts}.mp4`);
    await prepareClip(rawClipPath, preparedPath, { duration: TOTAL_DURATION, width: WIDTH, height: HEIGHT });
    tempFiles.push(preparedPath);

    const loopedPath = join(TMP_DIR, `best-time-looped-${ts}.mp4`);
    await loopClip(preparedPath, loopedPath, TOTAL_DURATION);
    tempFiles.push(loopedPath);

    const overlayPath = join(TMP_DIR, `best-time-overlay-${ts}.png`);
    const replacements = buildOverlayReplacements(script);
    await renderTemplate('best-time-overlay.html', replacements, overlayPath);
    const overlayPaths = [overlayPath];
    tempFiles.push(overlayPath);
    console.log(`[REEL/BEST-TIME] 1 overlay rendered (static Gantt calendar)`);

    const composedScenes = [];
    let timeOffset = 0;
    for (let i = 0; i < SCENE_DURATIONS.length; i++) {
      const sceneDuration = SCENE_DURATIONS[i];
      const segmentPath = join(TMP_DIR, `best-time-seg-${i}-${ts}.mp4`);
      await ffmpeg([
        '-ss', String(timeOffset),
        '-i', loopedPath,
        '-t', String(sceneDuration),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-r', '30', '-an', '-y',
        segmentPath,
      ]);
      tempFiles.push(segmentPath);

      const composedPath = join(TMP_DIR, `best-time-comp-${i}-${ts}.mp4`);
      await overlayPngOnClip(segmentPath, overlayPaths[0], sceneDuration, composedPath);
      tempFiles.push(composedPath);
      composedScenes.push(composedPath);
      console.log(`[REEL/BEST-TIME] Scene ${i + 1}/${SCENE_DURATIONS.length} composed (${sceneDuration}s, static)`);
      timeOffset += sceneDuration;
    }

    const concatPath = join(TMP_DIR, `best-time-concat-${ts}.mp4`);
    await concatClips(composedScenes, concatPath);
    tempFiles.push(concatPath);

    const beforeCtaPath = join(TMP_DIR, `best-time-before-cta-${ts}.mp4`);
    // TODO: best-time is regional (6 countries). If a future variant targets a
    // single country, pass it here. For now the regional reel uses the generic
    // ASMR pool (null destination → fallback path).
    await addAudioTrack(concatPath, beforeCtaPath, TOTAL_DURATION, null);
    tempFiles.push(beforeCtaPath);

    // Append global save CTA (+2.5s) to boost IG save rate
    const { appendSaveCtaScene } = await import('../core/save-cta.js');
    await appendSaveCtaScene(beforeCtaPath, outputPath);
    console.log(`[REEL/BEST-TIME] Best-time reel complete: ${outputPath} (~${TOTAL_DURATION + 2.5}s + save CTA)`);

    return outputPath;
  } finally {
    console.log(`[REEL/BEST-TIME] Cleaning up ${tempFiles.length} temp files...`);
    for (const f of tempFiles) safeUnlink(f);
    try { await flushCosts(); } catch {}
  }
}

export async function generateBestTimeReelFromArticle(article, opts = {}) {
  console.log(`[REEL/BEST-TIME] Generating Best-time reel from article: "${(article.title || '').slice(0, 60)}..."`);
  const script = await generateBestTimeScript(article);
  console.log(`[REEL/BEST-TIME] Script ready: ${script.regionId} — ${script.items.length} items`);
  const videoPath = await composeBestTimeReel(script, opts);
  return { videoPath, script };
}
