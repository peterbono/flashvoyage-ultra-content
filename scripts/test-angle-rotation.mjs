#!/usr/bin/env node
/**
 * test-angle-rotation.mjs
 *
 * Sanity test for the angle picker (social-distributor/reels/data/angles/picker.js).
 *
 * Runs pickAngle('avantapres') and pickAngle('versus') 30 times each, prints
 * the sequence, and checks:
 *   1. No angle repeats within any window of MAX_RECENT picks.
 *   2. Coverage: over 30 runs, ≥ 2/3 of the library appears at least once.
 *
 * Usage:
 *   node scripts/test-angle-rotation.mjs
 */

import {
  pickAngle,
  getLibrary,
  resetAngleState,
  MAX_RECENT,
} from '../social-distributor/reels/data/angles/picker.js';

const RUNS = 30;

function checkWindow(sequence, windowSize) {
  // Return first violation index, or null if none
  for (let i = 0; i < sequence.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = sequence.slice(start, i);
    if (slice.includes(sequence[i])) {
      return { index: i, id: sequence[i], window: slice };
    }
  }
  return null;
}

function runTest(libraryName) {
  console.log(`\n══════ ${libraryName.toUpperCase()} ══════`);
  console.log(`Library size: ${getLibrary(libraryName).length}`);
  console.log(`MAX_RECENT : ${MAX_RECENT}`);

  // Clean slate so we don't inherit state from previous runs
  resetAngleState(libraryName);

  const sequence = [];
  for (let i = 0; i < RUNS; i++) {
    const a = pickAngle(libraryName);
    sequence.push(a.id);
    if (i < 10) {
      console.log(`  [${String(i + 1).padStart(2, '0')}] ${a.id.padEnd(32)} — ${a.label}`);
    }
  }

  const violation = checkWindow(sequence, MAX_RECENT);
  const uniqueCount = new Set(sequence).size;
  const totalAvailable = getLibrary(libraryName).length;
  const coverageRatio = uniqueCount / totalAvailable;

  console.log(`\n  Full 30-pick sequence: ${sequence.join(', ')}`);
  console.log(`  Unique angles over ${RUNS} picks : ${uniqueCount}/${totalAvailable} (${Math.round(coverageRatio * 100)}%)`);

  if (violation) {
    console.error(`  ❌ Duplicate within window of ${MAX_RECENT}:`);
    console.error(`     index=${violation.index} id=${violation.id} window=${JSON.stringify(violation.window)}`);
    return false;
  } else {
    console.log(`  ✅ No duplicate within any window of ${MAX_RECENT} picks`);
  }

  if (coverageRatio < 0.66) {
    console.error(`  ❌ Coverage too low (<66%): ${uniqueCount}/${totalAvailable}`);
    return false;
  } else {
    console.log(`  ✅ Coverage ≥ 66% (${uniqueCount}/${totalAvailable})`);
  }

  // Leave state clean so subsequent real runs start fresh
  resetAngleState(libraryName);
  return true;
}

const okA = runTest('avantapres');
const okB = runTest('versus');

if (okA && okB) {
  console.log('\n🎉 ALL GOOD — angle rotation working as expected\n');
  process.exit(0);
} else {
  console.error('\n💥 TEST FAILED — see output above\n');
  process.exit(1);
}
