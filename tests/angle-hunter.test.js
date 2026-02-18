/**
 * angle-hunter.test.js
 * 
 * Unit tests for AngleHunter module.
 * Uses Node.js built-in test runner (node:test + node:assert).
 * 
 * Run: node --test tests/angle-hunter.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import AngleHunter from '../angle-hunter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadFixture(name) {
  const path = join(__dirname, 'fixtures', 'angle-hunter', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function runHunt(name, mode = 'evergreen') {
  const { extracted, pattern, story } = loadFixture(name);
  return AngleHunter.hunt(extracted, pattern, story, mode);
}

const VALID_ANGLE_TYPES = ['cost_arbitrage', 'hidden_risk', 'consensus_breaker', 'timeline_tension', 'logistic_dilemma'];
const VALID_HOOK_MODES = ['chiffre', 'contrainte', 'decision'];
const VALID_EMOTIONAL_VECTORS = ['doubt_to_decision', 'frustration_to_optimization', 'fear_to_confidence', 'confusion_to_clarity', 'inertia_to_action'];
const VALID_BUSINESS_PRIMARIES = ['cost_optimization', 'insurance_necessity', 'booking_urgency', 'connectivity_need', 'planning_tool'];
const VALID_SEO_INTENTS = ['informational', 'transactional', 'commercial_investigation'];
const VALID_RESOLVERS = ['insurance', 'bank_card', 'esim', 'flight', 'accommodation', 'vpn', 'tours', 'gear', 'none'];

// ─── Schema Validation (shared) ──────────────────────────────────────────────

function assertValidSchema(result) {
  // angle_version
  assert.equal(result.angle_version, '1.0', 'angle_version must be 1.0');

  // source_facts
  assert.ok(Array.isArray(result.source_facts), 'source_facts must be an array');
  assert.ok(result.source_facts.length > 0, 'source_facts must be non-empty');
  for (const fact of result.source_facts) {
    assert.match(fact, /^[a-z_]+:\d+$/, `source_fact "${fact}" must match key:number pattern`);
  }

  // primary_angle
  assert.ok(VALID_ANGLE_TYPES.includes(result.primary_angle.type), `type "${result.primary_angle.type}" must be a valid angle type`);
  assert.ok(VALID_HOOK_MODES.includes(result.primary_angle.hook_mode), `hook_mode "${result.primary_angle.hook_mode}" must be valid`);
  assert.ok(result.primary_angle.hook.length >= 60, `hook must be >= 60 chars, got ${result.primary_angle.hook.length}`);
  assert.ok(result.primary_angle.tension.length >= 40, `tension must be >= 40 chars, got ${result.primary_angle.tension.length}`);
  assert.ok(result.primary_angle.stake.length >= 30, `stake must be >= 30 chars, got ${result.primary_angle.stake.length}`);

  // emotional_vector
  assert.ok(VALID_EMOTIONAL_VECTORS.includes(result.emotional_vector), `emotional_vector "${result.emotional_vector}" must be valid`);

  // business_vector
  assert.ok(VALID_BUSINESS_PRIMARIES.includes(result.business_vector.primary), `business primary "${result.business_vector.primary}" must be valid`);
  assert.ok(typeof result.business_vector.max_placements === 'number', 'max_placements must be a number');
  assert.ok(result.business_vector.max_placements >= 0 && result.business_vector.max_placements <= 3, `max_placements must be 0-3, got ${result.business_vector.max_placements}`);

  // Friction coherence
  if (result.business_vector.affiliate_friction === null) {
    assert.equal(result.business_vector.max_placements, 0, 'max_placements must be 0 when friction is null');
  } else {
    assert.ok(result.business_vector.affiliate_friction.moment.length >= 15, `friction.moment must be >= 15 chars`);
    assert.ok(result.business_vector.affiliate_friction.cost_of_inaction.length >= 15, `friction.cost_of_inaction must be >= 15 chars`);
    assert.ok(VALID_RESOLVERS.includes(result.business_vector.affiliate_friction.resolver), `resolver "${result.business_vector.affiliate_friction.resolver}" must be valid`);
    assert.notEqual(result.business_vector.affiliate_friction.resolver, 'none', 'resolver must not be none when friction is present');
  }

  // seo_intent
  assert.ok(VALID_SEO_INTENTS.includes(result.seo_intent), `seo_intent "${result.seo_intent}" must be valid`);

  // competitive_positioning
  assert.ok(typeof result.competitive_positioning === 'string', 'competitive_positioning must be a string');
  assert.ok(result.competitive_positioning.length > 20, 'competitive_positioning must be > 20 chars');

  // _debug
  assert.ok(typeof result._debug === 'object', '_debug must be an object');
  assert.ok(typeof result._debug.detectors === 'object', '_debug.detectors must be an object');
  assert.equal(Object.keys(result._debug.detectors).length, 5, '_debug.detectors must have 5 keys');
  assert.equal(result._debug.winner, result.primary_angle.type, '_debug.winner must match primary_angle.type');
  assert.ok(typeof result._debug.confidence === 'number', '_debug.confidence must be a number');
  assert.ok(typeof result._debug.fallback === 'boolean', '_debug.fallback must be a boolean');
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('AngleHunter', () => {
  describe('Schema validation (all fixtures)', () => {
    const fixtures = ['vietnam-itinerary', 'high-cost', 'warning-heavy', 'contradiction', 'sparse'];
    for (const name of fixtures) {
      it(`${name}: valid schema`, () => {
        const result = runHunt(name);
        assertValidSchema(result);
      });
    }
  });

  describe('vietnam-itinerary', () => {
    it('detects cost_arbitrage (2 costs, itinerary dilemma)', () => {
      const result = runHunt('vietnam-itinerary');
      assert.equal(result.primary_angle.type, 'cost_arbitrage');
      assert.equal(result._debug.fallback, false);
    });

    it('uses chiffre hook mode (budget data present)', () => {
      const result = runHunt('vietnam-itinerary');
      assert.equal(result.primary_angle.hook_mode, 'chiffre');
      assert.match(result.primary_angle.hook, /\d/, 'hook must contain a number');
    });

    it('source_facts reflects real signal counts', () => {
      const result = runHunt('vietnam-itinerary');
      assert.ok(result.source_facts.includes('costs:2'));
      assert.ok(result.source_facts.includes('warnings:0'));
      assert.ok(result.source_facts.includes('contradictions:0'));
    });
  });

  describe('high-cost', () => {
    it('detects cost_arbitrage with high confidence', () => {
      const result = runHunt('high-cost');
      assert.equal(result.primary_angle.type, 'cost_arbitrage');
      assert.ok(result._debug.confidence >= 0.8, `confidence ${result._debug.confidence} must be >= 0.8`);
      assert.equal(result._debug.fallback, false);
    });

    it('uses largest budget amount (1800 USD, not 150)', () => {
      const result = runHunt('high-cost');
      assert.match(result.primary_angle.hook, /1800/, 'hook must reference the largest budget');
    });

    it('resolves to bank_card (ATM fee signals)', () => {
      const result = runHunt('high-cost');
      assert.equal(result.business_vector.affiliate_friction?.resolver, 'bank_card');
    });

    it('business primary is cost_optimization (money theme)', () => {
      const result = runHunt('high-cost');
      assert.equal(result.business_vector.primary, 'cost_optimization');
    });
  });

  describe('warning-heavy', () => {
    it('detects hidden_risk (4 warnings + 5 problems)', () => {
      const result = runHunt('warning-heavy');
      assert.equal(result.primary_angle.type, 'hidden_risk');
      assert.equal(result._debug.fallback, false);
    });

    it('resolves to insurance (scam/safety theme)', () => {
      const result = runHunt('warning-heavy');
      assert.equal(result.business_vector.affiliate_friction?.resolver, 'insurance');
      assert.equal(result.business_vector.primary, 'insurance_necessity');
    });

    it('detectors show high risk score', () => {
      const result = runHunt('warning-heavy');
      const riskScore = result._debug.detectors.hidden_risk.score;
      assert.ok(riskScore >= 0.5, `risk score ${riskScore} must be >= 0.5`);
    });
  });

  describe('contradiction', () => {
    it('detects consensus_breaker (2 structured contradictions + conflict pairs)', () => {
      const result = runHunt('contradiction');
      assert.equal(result.primary_angle.type, 'consensus_breaker');
      assert.equal(result._debug.fallback, false);
    });

    it('contradiction detector has positive score', () => {
      const result = runHunt('contradiction');
      const contradScore = result._debug.detectors.consensus_breaker.score;
      assert.ok(contradScore > 0, `contradiction score ${contradScore} must be > 0`);
    });

    it('emotional vector is doubt_to_decision', () => {
      const result = runHunt('contradiction');
      assert.equal(result.emotional_vector, 'doubt_to_decision');
    });
  });

  describe('sparse', () => {
    it('triggers fallback (insufficient data)', () => {
      const result = runHunt('sparse');
      assert.equal(result._debug.fallback, true);
      assert.equal(result.primary_angle.type, 'logistic_dilemma');
    });

    it('max_placements is 0 (no friction)', () => {
      const result = runHunt('sparse');
      assert.equal(result.business_vector.max_placements, 0);
      assert.equal(result.business_vector.affiliate_friction, null);
    });

    it('confidence is 0', () => {
      const result = runHunt('sparse');
      assert.equal(result._debug.confidence, 0);
    });
  });

  describe('Editorial mode caps', () => {
    it('news mode caps max_placements to 1', () => {
      const result = runHunt('high-cost', 'news');
      assert.ok(result.business_vector.max_placements <= 1, `news max_placements ${result.business_vector.max_placements} must be <= 1`);
    });

    it('evergreen mode allows up to 3 placements', () => {
      const result = runHunt('high-cost', 'evergreen');
      assert.ok(result.business_vector.max_placements <= 3, `evergreen max_placements must be <= 3`);
      assert.ok(result.business_vector.max_placements >= 1, `evergreen max_placements should be >= 1 with good friction`);
    });
  });

  describe('Determinism', () => {
    it('produces identical output for same input', () => {
      const r1 = runHunt('vietnam-itinerary');
      const r2 = runHunt('vietnam-itinerary');
      assert.deepEqual(r1, r2, 'two runs on same input must produce identical output');
    });
  });
});
