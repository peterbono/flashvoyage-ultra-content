/**
 * core/clip-preparer.js — FlashVoyage Reels v2
 *
 * Common clip preparation operations: crop, scale, trim, loop, concat.
 * Uses core/ffmpeg.js for all ffmpeg operations.
 * All functions are named ESM exports with no circular dependencies.
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ffmpeg, getVideoDuration } from './ffmpeg.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, '..', 'tmp');

/**
 * Ensure the tmp directory exists.
 */
function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Prepare a clip for Reel usage:
 * - Crop to 9:16 aspect ratio
 * - Scale to target resolution (default 1080x1920)
 * - Trim to specified duration
 * - Normalize framerate to 30fps
 *
 * @param {string} inputPath - Path to the source video
 * @param {string} outputPath - Where to write the prepared clip
 * @param {Object} options
 * @param {number} options.duration - Target duration in seconds
 * @param {number} [options.width=1080] - Output width in pixels
 * @param {number} [options.height=1920] - Output height in pixels
 * @returns {Promise<string>} The output path
 */
export async function prepareClip(inputPath, outputPath, { duration, width = 1080, height = 1920 }) {
  ensureTmpDir();
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const srcDuration = await getVideoDuration(inputPath);
  const useDuration = Math.min(duration, srcDuration);

  console.log(`[REEL/CORE] Preparing clip: ${inputPath} → ${width}x${height}, ${useDuration}s, 30fps`);

  await ffmpeg([
    '-i', inputPath,
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',  // silent audio (IG requires audio track)
    '-t', String(useDuration),
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    '-y',
    outputPath,
  ]);

  console.log(`[REEL/CORE] Clip prepared: ${outputPath}`);
  return outputPath;
}

/**
 * Loop a short clip to reach a target duration.
 * Uses ffmpeg's -stream_loop to repeat the input, then trims to exact duration.
 *
 * @param {string} inputPath - Path to the short clip
 * @param {string} outputPath - Where to write the looped clip
 * @param {number} targetDuration - Desired duration in seconds
 * @returns {Promise<string>} The output path
 */
export async function loopClip(inputPath, outputPath, targetDuration) {
  ensureTmpDir();
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const srcDuration = await getVideoDuration(inputPath);

  if (srcDuration >= targetDuration) {
    // No looping needed, just trim
    console.log(`[REEL/CORE] Clip already >= ${targetDuration}s, trimming only`);
    await ffmpeg([
      '-i', inputPath,
      '-t', String(targetDuration),
      '-c', 'copy',
      '-y',
      outputPath,
    ]);
    return outputPath;
  }

  const loopCount = Math.ceil(targetDuration / srcDuration);
  console.log(`[REEL/CORE] Looping clip ${loopCount}x to reach ${targetDuration}s`);

  await ffmpeg([
    '-stream_loop', String(loopCount),
    '-i', inputPath,
    '-t', String(targetDuration),
    '-c', 'copy',
    '-y',
    outputPath,
  ]);

  console.log(`[REEL/CORE] Looped clip: ${outputPath}`);
  return outputPath;
}

/**
 * Concatenate multiple clips into a single video using the ffmpeg concat demuxer.
 * All clips must have the same codec, resolution, and framerate.
 * Use prepareClip() on each input first to ensure compatibility.
 *
 * @param {string[]} clipPaths - Array of paths to clips (in order)
 * @param {string} outputPath - Where to write the concatenated video
 * @returns {Promise<string>} The output path
 */
export async function concatClips(clipPaths, outputPath) {
  ensureTmpDir();
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  if (clipPaths.length === 0) {
    throw new Error('[REEL/CORE] concatClips: no clip paths provided');
  }

  if (clipPaths.length === 1) {
    // Single clip — just copy
    console.log(`[REEL/CORE] Single clip, copying directly`);
    await ffmpeg(['-i', clipPaths[0], '-c', 'copy', '-y', outputPath]);
    return outputPath;
  }

  // Write concat demuxer file
  const concatListPath = join(TMP_DIR, `concat-${Date.now()}.txt`);
  const concatContent = clipPaths
    .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n');
  writeFileSync(concatListPath, concatContent, 'utf-8');

  console.log(`[REEL/CORE] Concatenating ${clipPaths.length} clips → ${outputPath}`);

  try {
    await ffmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-y',
      outputPath,
    ]);
  } finally {
    // Clean up the concat list file
    try { unlinkSync(concatListPath); } catch { /* ignore */ }
  }

  console.log(`[REEL/CORE] Concatenated: ${outputPath}`);
  return outputPath;
}
