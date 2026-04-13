/**
 * Leaderboard Composer — FlashVoyage Reels v2
 *
 * Generates a 9s FULLY STATIC reel showing a top-10 country ranking.
 * Everything is visible from frame 1: title + 10 ranked rows + yellow
 * highlighted #1 + source credit. No hook scene, no reveal animation.
 *
 * Data layout on screen:
 *   - Top: title (2 lines)
 *   - Middle: 10 rows of (rank, flag, country name, metric value) — #1
 *     permanently highlighted on a yellow band (brand signature)
 *   - Bottom: source credit "Data FlashVoyage 2026"
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg } from '../core/ffmpeg.js';
import { renderTemplate } from '../core/overlay-renderer.js';
import { prepareClip, loopClip } from '../core/clip-preparer.js';
import { fetchPexelsVideo, downloadVideo, pickMusicTrack } from '../asset-fetcher.js';
import { generateLeaderboardScript } from '../data/generators/leaderboard.js';
import { flushCosts } from '../cost-tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

const SCENE_DURATIONS = [9]; // 1 static scene, everything visible from frame 1
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
  await ffmpeg([
    '-f', 'concat', '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-y',
    outputPath,
  ]);
  try { fs.unlinkSync(listPath); } catch {}
  return outputPath;
}

async function addAudioTrack(videoPath, outputPath, duration, destination = null) {
  // FV-FIX 2026-04-13: ASMR-first for leaderboard reels — ranking format where
  // viewer reads/scans content. Ambient sound > competing energy. Fallback chain.
  // Destination-aware: #1 country gets the spotlight (yellow band + Pexels bg),
  // so we pick geo-matched ASMR for the #1. Falls back to generic if unknown.
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
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-y',
    outputPath,
  ]);
  return outputPath;
}

// ── Hard truncation helpers (prevent text overflow in overlay) ──────────────
const MAX_TITLE = 30;
const MAX_VALUE = 15;
const DANGLING = /\s+(?:en|de|du|d|à|au|aux|le|la|les|un|une|des|pour|par|sans|sur|avec|et|ou|qui|que|ne|se|ce)\s*$/i;
function truncate(s, max) {
  if (!s || s.length <= max) return s;
  let t = s.slice(0, max).replace(/\s+\S*$/, ''); // cut at word boundary
  t = t.replace(DANGLING, '');                      // drop trailing preposition/article
  return t || s.slice(0, max);                      // fallback if regex ate everything
}

function buildOverlayReplacements(script) {
  // Fully static layout: #1 is permanently highlighted via is-highlighted
  // class. No hook scene, no reveal animation.
  const rawLine1 = (script.title || '').split('\n')[0] || '';
  const rawLine2 = (script.title || '').split('\n')[1] || '';
  const replacements = {
    '{{TITLE_LINE_1}}': truncate(rawLine1, MAX_TITLE),
    '{{TITLE_LINE_2}}': truncate(rawLine2, MAX_TITLE),
    '{{METRIC_LABEL}}': script.metricLabel || '',
    '{{HIGHLIGHT_CLASS}}': 'is-highlighted', // permanent yellow band on #1
  };

  for (let i = 0; i < 10; i++) {
    const item = script.items[i];
    const n = i + 1;
    replacements[`{{RANK_${n}}}`] = item ? String(item.rank) : '';
    replacements[`{{FLAG_${n}}}`] = item ? item.flag : '';
    replacements[`{{NAME_${n}}}`] = item ? item.displayName : '';
    replacements[`{{VALUE_${n}}}`] = item ? truncate(item.display, MAX_VALUE) : '';
  }

  return replacements;
}

export async function composeLeaderboardReel(script, opts = {}) {
  ensureTmpDir();
  const ts = Date.now();
  const outputPath = opts.outputPath || join(TMP_DIR, `leaderboard-final-${ts}.mp4`);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const tempFiles = [];

  try {
    // Fetch a generic travel clip for background (use #1 country pexels query if available)
    const bgQuery = script.items[0]
      ? `${script.items[0].displayName} travel aerial landscape`
      : 'world travel map aerial';
    console.log(`[REEL/LEADERBOARD] Fetching Pexels clip: "${bgQuery}"`);
    const videoUrl = await fetchPexelsVideo(bgQuery, 'portrait');
    if (!videoUrl) {
      throw new Error(`[REEL/LEADERBOARD] No Pexels clip found for "${bgQuery}"`);
    }

    const rawClipPath = join(TMP_DIR, `leaderboard-raw-${ts}.mp4`);
    await downloadVideo(videoUrl, rawClipPath);
    tempFiles.push(rawClipPath);

    const preparedPath = join(TMP_DIR, `leaderboard-prepared-${ts}.mp4`);
    await prepareClip(rawClipPath, preparedPath, { duration: TOTAL_DURATION, width: WIDTH, height: HEIGHT });
    tempFiles.push(preparedPath);

    const loopedPath = join(TMP_DIR, `leaderboard-looped-${ts}.mp4`);
    await loopClip(preparedPath, loopedPath, TOTAL_DURATION);
    tempFiles.push(loopedPath);

    // Render 1 static overlay — everything visible from frame 1
    const overlayPath = join(TMP_DIR, `leaderboard-overlay-${ts}.png`);
    const replacements = buildOverlayReplacements(script);
    await renderTemplate('leaderboard-overlay.html', replacements, overlayPath);
    const overlayPaths = [overlayPath];
    tempFiles.push(overlayPath);
    console.log(`[REEL/LEADERBOARD] 1 overlay rendered (static, #1 permanently highlighted)`);

    // Extract + overlay per scene
    const composedScenes = [];
    let timeOffset = 0;
    for (let i = 0; i < SCENE_DURATIONS.length; i++) {
      const sceneDuration = SCENE_DURATIONS[i];
      const segmentPath = join(TMP_DIR, `leaderboard-seg-${i}-${ts}.mp4`);
      await ffmpeg([
        '-ss', String(timeOffset),
        '-i', loopedPath,
        '-t', String(sceneDuration),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-r', '30', '-an', '-y',
        segmentPath,
      ]);
      tempFiles.push(segmentPath);

      const composedPath = join(TMP_DIR, `leaderboard-comp-${i}-${ts}.mp4`);
      await overlayPngOnClip(segmentPath, overlayPaths[0], sceneDuration, composedPath);
      tempFiles.push(composedPath);
      composedScenes.push(composedPath);
      console.log(`[REEL/LEADERBOARD] Scene ${i + 1}/${SCENE_DURATIONS.length} composed (${sceneDuration}s, static)`);
      timeOffset += sceneDuration;
    }

    const concatPath = join(TMP_DIR, `leaderboard-concat-${ts}.mp4`);
    await concatClips(composedScenes, concatPath);
    tempFiles.push(concatPath);

    const beforeCtaPath = join(TMP_DIR, `leaderboard-before-cta-${ts}.mp4`);
    // Top-10 ranking: #1 is permanently highlighted (yellow band) and drives
    // the Pexels background query. Use it as the geo-matching destination.
    const topName = script.items?.[0]?.displayName || null;
    await addAudioTrack(concatPath, beforeCtaPath, TOTAL_DURATION, topName);
    tempFiles.push(beforeCtaPath);

    // Append global save CTA (+2.5s) to boost IG save rate
    const { appendSaveCtaScene } = await import('../core/save-cta.js');
    await appendSaveCtaScene(beforeCtaPath, outputPath);
    console.log(`[REEL/LEADERBOARD] Leaderboard reel complete: ${outputPath} (~${TOTAL_DURATION + 2.5}s + save CTA)`);

    return outputPath;
  } finally {
    console.log(`[REEL/LEADERBOARD] Cleaning up ${tempFiles.length} temp files...`);
    for (const f of tempFiles) safeUnlink(f);
    try { await flushCosts(); } catch {}
  }
}

export async function generateLeaderboardReelFromArticle(article, opts = {}) {
  console.log(`[REEL/LEADERBOARD] Generating Leaderboard reel from article: "${(article.title || '').slice(0, 60)}..."`);
  const script = await generateLeaderboardScript(article);
  console.log(`[REEL/LEADERBOARD] Script ready: ${script.configId} — ${script.items.length} items`);
  const videoPath = await composeLeaderboardReel(script, opts);
  return { videoPath, script };
}
