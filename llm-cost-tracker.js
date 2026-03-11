#!/usr/bin/env node

/**
 * LLM COST TRACKER — Singleton global
 * 
 * Traque chaque appel OpenAI : modèle, tokens in/out, coût USD, étape pipeline, durée.
 * Fournit des vues micro (par appel) et macro (par article).
 * Persiste l'historique dans data/cost-history.jsonl (1 ligne = 1 article).
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COST_HISTORY_PATH = join(__dirname, 'data', 'cost-history.jsonl');

// Grille tarifaire LLM (USD par 1M tokens) — mise à jour mars 2026
const PRICING = {
  // OpenAI
  'gpt-4o':       { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':  { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':  { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo':{ input: 0.50,  output: 1.50  },
  // Anthropic Claude
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
};

function computeCostUSD(model, promptTokens, completionTokens) {
  const pricing = PRICING[model] || PRICING['gpt-4o'];
  return (promptTokens / 1_000_000) * pricing.input +
         (completionTokens / 1_000_000) * pricing.output;
}

class LLMCostTracker {
  constructor() {
    this.records = [];
    this.startTime = null;
  }

  reset() {
    this.records = [];
    this.startTime = Date.now();
  }

  /**
   * Enregistre un appel LLM.
   * @param {string} step - Étape du pipeline (ex: 'generator', 'finalizer-translate')
   * @param {string} model - Modèle utilisé (ex: 'gpt-4o')
   * @param {number} promptTokens
   * @param {number} completionTokens
   * @param {number} durationMs - Durée de l'appel réseau
   */
  record(step, model, promptTokens, completionTokens, durationMs = 0) {
    if (!promptTokens && !completionTokens) return;
    const costUSD = computeCostUSD(model, promptTokens, completionTokens);
    this.records.push({
      step: step || 'unknown',
      model: model || 'unknown',
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUSD,
      durationMs,
      timestamp: Date.now()
    });
  }

  /**
   * Enregistre depuis un objet usage OpenAI brut.
   * Compatible avec les deux formats (SDK et axios).
   */
  recordFromUsage(step, model, usage, durationMs = 0) {
    if (!usage) return;
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    this.record(step, model, promptTokens, completionTokens, durationMs);
  }

  getSummary() {
    const totalCalls = this.records.length;
    const totalPromptTokens = this.records.reduce((s, r) => s + r.promptTokens, 0);
    const totalCompletionTokens = this.records.reduce((s, r) => s + r.completionTokens, 0);
    const totalCostUSD = this.records.reduce((s, r) => s + r.costUSD, 0);
    const totalLLMDurationMs = this.records.reduce((s, r) => s + r.durationMs, 0);
    const totalPipelineDurationMs = this.startTime ? Date.now() - this.startTime : 0;

    // Par étape
    const byStep = {};
    for (const r of this.records) {
      if (!byStep[r.step]) {
        byStep[r.step] = { calls: 0, promptTokens: 0, completionTokens: 0, costUSD: 0, durationMs: 0 };
      }
      byStep[r.step].calls++;
      byStep[r.step].promptTokens += r.promptTokens;
      byStep[r.step].completionTokens += r.completionTokens;
      byStep[r.step].costUSD += r.costUSD;
      byStep[r.step].durationMs += r.durationMs;
    }

    // Par modèle
    const byModel = {};
    for (const r of this.records) {
      if (!byModel[r.model]) {
        byModel[r.model] = { calls: 0, promptTokens: 0, completionTokens: 0, costUSD: 0 };
      }
      byModel[r.model].calls++;
      byModel[r.model].promptTokens += r.promptTokens;
      byModel[r.model].completionTokens += r.completionTokens;
      byModel[r.model].costUSD += r.costUSD;
    }

    return {
      totalCalls,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalCostUSD,
      totalLLMDurationMs,
      totalPipelineDurationMs,
      llmTimeRatio: totalPipelineDurationMs > 0 ? totalLLMDurationMs / totalPipelineDurationMs : 0,
      byStep,
      byModel,
      records: this.records
    };
  }

  printSummary() {
    const s = this.getSummary();
    if (s.totalCalls === 0) {
      console.log('\n💰 LLM COST REPORT: Aucun appel LLM enregistré.\n');
      return s;
    }

    const fmt = (n) => n.toLocaleString('fr-FR');
    const fmtUSD = (n) => `$${n.toFixed(4)}`;
    const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;
    const fmtDuration = (ms) => ms >= 60000 ? `${(ms / 60000).toFixed(1)}min` : `${(ms / 1000).toFixed(0)}s`;

    console.log('\n💰 LLM COST REPORT');
    console.log('══════════════════════════════════════════════════');
    console.log(`  Appels LLM:       ${s.totalCalls}`);
    console.log(`  Tokens IN:        ${fmt(s.totalPromptTokens)}  (prompt)`);
    console.log(`  Tokens OUT:       ${fmt(s.totalCompletionTokens)}  (completion)`);
    console.log(`  Coût estimé:      ${fmtUSD(s.totalCostUSD)}`);
    console.log(`  Durée LLM:        ${fmtDuration(s.totalLLMDurationMs)} / ${fmtDuration(s.totalPipelineDurationMs)} total (${fmtPct(s.llmTimeRatio)})`);
    console.log('──────────────────────────────────────────────────');

    // Par étape (triée par coût décroissant)
    console.log('  Par étape:');
    const steps = Object.entries(s.byStep).sort((a, b) => b[1].costUSD - a[1].costUSD);
    for (const [step, data] of steps) {
      const pct = s.totalCostUSD > 0 ? fmtPct(data.costUSD / s.totalCostUSD) : '0%';
      const callsLabel = data.calls === 1 ? '1 call ' : `${data.calls} calls`;
      console.log(`    ${step.padEnd(24)}│ ${callsLabel.padStart(8)} │ ${fmtUSD(data.costUSD).padStart(8)} │ ${pct.padStart(5)}`);
    }

    // Par modèle
    console.log('  Par modèle:');
    const models = Object.entries(s.byModel).sort((a, b) => b[1].costUSD - a[1].costUSD);
    for (const [model, data] of models) {
      const pct = s.totalCostUSD > 0 ? fmtPct(data.costUSD / s.totalCostUSD) : '0%';
      const callsLabel = data.calls === 1 ? '1 call ' : `${data.calls} calls`;
      console.log(`    ${model.padEnd(24)}│ ${callsLabel.padStart(8)} │ ${fmtUSD(data.costUSD).padStart(8)} │ ${pct.padStart(5)}`);
    }
    console.log('══════════════════════════════════════════════════\n');

    return s;
  }

  /**
   * Sauvegarde le résumé de cet article dans l'historique JSONL.
   * @param {Object} articleMeta - { id, title, slug, wordCount, url }
   */
  saveToDisk(articleMeta = {}) {
    const s = this.getSummary();
    const entry = {
      date: new Date().toISOString(),
      articleId: articleMeta.id || null,
      title: articleMeta.title || null,
      slug: articleMeta.slug || null,
      url: articleMeta.url || null,
      wordCount: articleMeta.wordCount || null,
      totalCostUSD: parseFloat(s.totalCostUSD.toFixed(6)),
      totalTokensIn: s.totalPromptTokens,
      totalTokensOut: s.totalCompletionTokens,
      totalTokens: s.totalTokens,
      totalCalls: s.totalCalls,
      durationMs: s.totalPipelineDurationMs,
      llmDurationMs: s.totalLLMDurationMs,
      llmTimeRatio: parseFloat(s.llmTimeRatio.toFixed(3)),
      costPerWord: articleMeta.wordCount ? parseFloat((s.totalCostUSD / articleMeta.wordCount).toFixed(8)) : null,
      byStep: Object.fromEntries(
        Object.entries(s.byStep).map(([k, v]) => [k, {
          calls: v.calls,
          tokensIn: v.promptTokens,
          tokensOut: v.completionTokens,
          costUSD: parseFloat(v.costUSD.toFixed(6)),
          durationMs: v.durationMs
        }])
      ),
      byModel: Object.fromEntries(
        Object.entries(s.byModel).map(([k, v]) => [k, {
          calls: v.calls,
          tokensIn: v.promptTokens,
          tokensOut: v.completionTokens,
          costUSD: parseFloat(v.costUSD.toFixed(6))
        }])
      )
    };

    const dir = dirname(COST_HISTORY_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(COST_HISTORY_PATH, JSON.stringify(entry) + '\n', 'utf-8');
    console.log(`💾 Cost report sauvegardé dans ${COST_HISTORY_PATH}`);
    return entry;
  }

  /**
   * Lit l'historique complet depuis le fichier JSONL.
   */
  static loadHistory() {
    if (!existsSync(COST_HISTORY_PATH)) return [];
    const lines = readFileSync(COST_HISTORY_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    return lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  }
}

// Singleton global
const tracker = new LLMCostTracker();
export default tracker;
export { LLMCostTracker, PRICING, COST_HISTORY_PATH };
