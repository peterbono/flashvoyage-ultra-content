#!/usr/bin/env node

/**
 * GUARD TESTKIT - Utilitaires communs pour tests anti-hallucination
 * ===================================================================
 * 
 * Helpers standardisés pour les tests du guard anti-hallucination.
 * Standardise l'output et les assertions.
 * 
 * USAGE:
 *   import { makeReport, assertEqual, assertTrue, runTest } from './scripts/_test-utils/guard-testkit.js';
 *   
 *   runTest('Test name', async () => {
 *     const report = makeReport();
 *     assertEqual('Check status', report.checks.length, 0);
 *     assertTrue('Report valid', report.checks !== undefined);
 *   });
 */

// Compteurs globaux pour les tests
let passedCount = 0;
let failedCount = 0;

// Exposer les compteurs pour permettre leur manipulation dans les tests
export { passedCount, failedCount };

/**
 * Crée un rapport standard vide
 * @returns {Object} { checks:[], actions:[], issues:[], debug:{} }
 */
export function makeReport() {
  return {
    checks: [],
    actions: [],
    issues: [],
    debug: {}
  };
}

/**
 * Assertion d'égalité avec label
 * @param {string} label - Label descriptif de l'assertion
 * @param {*} got - Valeur obtenue
 * @param {*} expected - Valeur attendue
 * @throws {Error} Si l'assertion échoue
 */
export function assertEqual(label, got, expected) {
  const gotStr = JSON.stringify(got);
  const expectedStr = JSON.stringify(expected);
  
  if (gotStr !== expectedStr) {
    throw new Error(`${label}: expected ${expectedStr}, got ${gotStr}`);
  }
}

/**
 * Assertion booléenne avec label
 * @param {string} label - Label descriptif de l'assertion
 * @param {boolean} condition - Condition à vérifier
 * @throws {Error} Si l'assertion échoue
 */
export function assertTrue(label, condition) {
  if (!condition) {
    throw new Error(`${label}: expected true, got false`);
  }
}

/**
 * Assertion de présence dans un tableau
 * @param {string} label - Label descriptif de l'assertion
 * @param {*} item - Item à chercher
 * @param {Array} array - Tableau dans lequel chercher
 * @throws {Error} Si l'assertion échoue
 */
export function assertIn(label, item, array) {
  if (!Array.isArray(array)) {
    throw new Error(`${label}: expected array, got ${typeof array}`);
  }
  
  const found = array.some(elem => {
    if (typeof elem === 'object' && typeof item === 'object') {
      return JSON.stringify(elem) === JSON.stringify(item);
    }
    return elem === item;
  });
  
  if (!found) {
    throw new Error(`${label}: expected item in array, got ${JSON.stringify(item)} not found in ${JSON.stringify(array)}`);
  }
}

/**
 * Assertion de non-présence dans un tableau
 * @param {string} label - Label descriptif de l'assertion
 * @param {*} item - Item à chercher
 * @param {Array} array - Tableau dans lequel chercher
 * @throws {Error} Si l'assertion échoue
 */
export function assertNotIn(label, item, array) {
  if (!Array.isArray(array)) {
    throw new Error(`${label}: expected array, got ${typeof array}`);
  }
  
  const found = array.some(elem => {
    if (typeof elem === 'object' && typeof item === 'object') {
      return JSON.stringify(elem) === JSON.stringify(item);
    }
    return elem === item;
  });
  
  if (found) {
    throw new Error(`${label}: expected item not in array, got ${JSON.stringify(item)} found in ${JSON.stringify(array)}`);
  }
}

/**
 * Exécute un test avec gestion d'erreur et affichage standardisé
 * @param {string} name - Nom du test
 * @param {Function} testFn - Fonction de test (peut être async)
 * @returns {Promise<boolean>} true si le test passe, false sinon
 */
export async function runTest(name, testFn) {
  console.log(`\n📋 Test: ${name}`);
  
  try {
    await testFn();
    console.log(`   ✅ PASSED`);
    passedCount++;
    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    if (error.stack && process.env.DEBUG_TESTS === '1') {
      console.error(error.stack);
    }
    failedCount++;
    return false;
  }
}

/**
 * Affiche le résumé des tests
 * @param {string} suiteName - Nom de la suite de tests
 */
export function printSummary(suiteName = 'Tests') {
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Résultats: ${passedCount} passés, ${failedCount} échoués`);
  
  if (failedCount === 0) {
    console.log(`✅ ${suiteName} passed\n`);
    return true;
  } else {
    console.log(`❌ Some tests failed\n`);
    return false;
  }
}

/**
 * Réinitialise les compteurs (utile pour plusieurs suites de tests)
 */
export function resetCounters() {
  passedCount = 0;
  failedCount = 0;
}

/**
 * Affiche l'en-tête standardisé pour une suite de tests
 * @param {string} suiteName - Nom de la suite de tests
 * @param {string} description - Description optionnelle
 */
export function printHeader(suiteName, description = '') {
  console.log(`🧪 ${suiteName}\n`);
  if (description) {
    console.log(description + '\n');
  }
  console.log('='.repeat(60));
}

/**
 * Affiche une valeur pour debug (optionnel)
 * @param {string} label - Label
 * @param {*} value - Valeur à afficher
 */
export function debug(label, value) {
  if (process.env.DEBUG_TESTS === '1') {
    const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    console.log(`   🔍 DEBUG ${label}: ${valueStr}`);
  }
}
