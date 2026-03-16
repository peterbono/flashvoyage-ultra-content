#!/usr/bin/env node

/**
 * PIPELINE REPORT - Rapport unifié (artifact de vérité)
 * 
 * Agrège pour chaque module :
 * - status
 * - issues[]
 * - actions[]
 * - debug
 * - timings
 * 
 * Le runner doit toujours sortir ce JSON (même en fail) et les tests doivent pouvoir l'assert.
 */

class PipelineReport {
  constructor(vizBridge = null) {
    this._vizBridge = vizBridge;
    this.report = {
      success: false,
      blocking: false,
      blockingReasons: [],
      steps: {},
      errors: [],
      warnings: [],
      metrics: {
        startTime: null,
        endTime: null,
        duration: null
      },
      timings: {}
    };
    
    this.stepTimings = {};
  }

  /**
   * Initialise le rapport
   */
  initialize() {
    this.report.metrics.startTime = Date.now();
    this.report.metrics.endTime = null;
    this.report.metrics.duration = null;
  }

  /**
   * Enregistre le début d'une étape
   * @param {string} stepName - Nom de l'étape
   */
  startStep(stepName) {
    if (this._vizBridge) {
      const vizAgent = this._mapStepToVizAgent(stepName);
      if (vizAgent) this._vizBridge.emit({ type: "stage_start", agent: vizAgent });
    }
    this.stepTimings[stepName] = {
      start: Date.now(),
      end: null,
      duration: null
    };
  }

  /**
   * Enregistre la fin d'une étape avec ses résultats
   * @param {string} stepName - Nom de l'étape
   * @param {Object} result - Résultat de l'étape
   * @param {Object} options - Options supplémentaires
   */
  endStep(stepName, result, options = {}) {
    const timing = this.stepTimings[stepName];
    if (timing) {
      timing.end = Date.now();
      timing.duration = timing.end - timing.start;
    }

    // Extraire les informations du résultat
    const stepReport = {
      success: result !== null && result !== undefined,
      status: options.status || (result !== null ? 'pass' : 'fail'),
      issues: this.extractIssues(result, options),
      actions: this.extractActions(result, options),
      debug: this.extractDebug(result, options),
      timing: timing || null,
      data: options.includeData !== false ? this.sanitizeData(result) : undefined
    };

    // Si le résultat contient un rapport QA, l'agréger
    if (result?.qaReport) {
      stepReport.qaReport = {
        status: result.qaReport.status,
        checks: result.qaReport.checks || [],
        issues: result.qaReport.issues || [],
        actions: result.qaReport.actions || [],
        debug: result.qaReport.debug || {},
        blocking: result.qaReport.blocking || false,
        blocking_reasons: result.qaReport.blocking_reasons || []
      };
    }

    // Si le résultat contient un rapport SEO, l'agréger
    if (result?.report) {
      stepReport.seoReport = {
        status: result.report.status,
        checks: result.report.checks || [],
        issues: result.report.issues || [],
        actions: result.report.actions || [],
        debug: result.report.debug || {}
      };
    }

    // Si le résultat contient un rapport anti-hallucination, l'agréger
    if (result?.status !== undefined && result?.blocking !== undefined) {
      stepReport.antiHallucinationReport = {
        status: result.status,
        blocking: result.blocking,
        reasons: result.reasons || [],
        evidence: result.evidence || [],
        debug: result.debug || {}
      };
    }

    this.report.steps[stepName] = stepReport;
    this.report.timings[stepName] = timing;
    if (this._vizBridge) {
      const vizAgent = this._mapStepToVizAgent(stepName);
      if (vizAgent) this._vizBridge.emit({ type: "stage_complete", agent: vizAgent, data: { duration_ms: timing?.duration || 0, status: stepReport.status || "success", detail: "Completed: " + stepName }});
    }

    // Vérifier si cette étape a des violations bloquantes
    if (stepReport.qaReport?.blocking === true) {
      this.report.blocking = true;
      this.report.blockingReasons.push(`FINALIZER_BLOCKING_${stepName.toUpperCase()}`);
    }

    if (stepReport.antiHallucinationReport?.blocking === true) {
      this.report.blocking = true;
      this.report.blockingReasons.push(`ANTI_HALLUCINATION_BLOCKING_${stepName.toUpperCase()}`);
    }

    return stepReport;
  }

  /**
   * Extrait les issues d'un résultat
   */
  extractIssues(result, options) {
    const issues = [];

    // Issues explicites
    if (options.issues && Array.isArray(options.issues)) {
      issues.push(...options.issues);
    }

    // Issues depuis qaReport
    if (result?.qaReport?.issues) {
      issues.push(...result.qaReport.issues);
    }

    // Issues depuis report (SEO)
    if (result?.report?.issues) {
      issues.push(...result.report.issues);
    }

    // Issues depuis anti-hallucination
    if (result?.reasons && Array.isArray(result.reasons)) {
      result.reasons.forEach(reason => {
        issues.push({
          code: reason,
          severity: 'high',
          message: `Anti-hallucination: ${reason}`,
          check: 'anti_hallucination_guard'
        });
      });
    }

    return issues;
  }

  /**
   * Extrait les actions d'un résultat
   */
  extractActions(result, options) {
    const actions = [];

    // Actions explicites
    if (options.actions && Array.isArray(options.actions)) {
      actions.push(...options.actions);
    }

    // Actions depuis qaReport
    if (result?.qaReport?.actions) {
      actions.push(...result.qaReport.actions);
    }

    // Actions depuis report (SEO)
    if (result?.report?.actions) {
      actions.push(...result.report.actions);
    }

    return actions;
  }

  /**
   * Extrait les informations de debug d'un résultat
   */
  extractDebug(result, options) {
    const debug = {};

    // Debug explicite
    if (options.debug && typeof options.debug === 'object') {
      Object.assign(debug, options.debug);
    }

    // Debug depuis qaReport
    if (result?.qaReport?.debug) {
      Object.assign(debug, result.qaReport.debug);
    }

    // Debug depuis report (SEO)
    if (result?.report?.debug) {
      Object.assign(debug, result.report.debug);
    }

    // Debug depuis anti-hallucination
    if (result?.debug) {
      Object.assign(debug, result.debug);
    }

    return debug;
  }

  /**
   * Nettoie les données pour éviter les références circulaires
   */
  sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Limiter la profondeur pour éviter les structures trop complexes
    const seen = new WeakSet();
    
    const sanitize = (obj, depth = 0) => {
      if (depth > 5) {
        return '[Max depth reached]';
      }

      if (obj === null || typeof obj !== 'object') {
        return obj;
      }

      if (seen.has(obj)) {
        return '[Circular reference]';
      }

      seen.add(obj);

      if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item, depth + 1));
      }

      const sanitized = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // Ignorer les fonctions
          if (typeof obj[key] === 'function') {
            continue;
          }
          sanitized[key] = sanitize(obj[key], depth + 1);
        }
      }

      return sanitized;
    };

    return sanitize(data);
  }

  /**
   * Ajoute une erreur globale
   */
  addError(step, message, stack = null) {
    this.report.errors.push({
      step,
      message,
      stack: stack ? stack.split('\n').slice(0, 5).join('\n') : null,
      timestamp: Date.now()
    });
  }

  /**
   * Ajoute un avertissement global
   */
  addWarning(step, message) {
    this.report.warnings.push({
      step,
      message,
      timestamp: Date.now()
    });
  }

  /**
   * Finalise le rapport
   */
  finalize(success = false, finalArticle = null) {
    this.report.metrics.endTime = Date.now();
    this.report.metrics.duration = this.report.metrics.endTime - this.report.metrics.startTime;
    // TEMPORAIRE: Ignorer blocking si ENABLE_PIPELINE_BLOCKING=0
    const ENABLE_BLOCKING = process.env.ENABLE_PIPELINE_BLOCKING !== '0';
    this.report.success = success && (ENABLE_BLOCKING ? !this.report.blocking : true);
    
    if (finalArticle) {
      this.report.finalArticle = {
        title: finalArticle.title,
        excerpt: finalArticle.excerpt,
        content: finalArticle.content, // Inclure le contenu HTML complet
        contentLength: finalArticle.content?.length || 0,
        qaReport: finalArticle.qaReport ? {
          status: finalArticle.qaReport.status,
          checks: finalArticle.qaReport.checks?.length || 0,
          issues: finalArticle.qaReport.issues?.length || 0,
          blocking: finalArticle.qaReport.blocking || false
        } : null,
        antiHallucinationReport: finalArticle.antiHallucinationReport ? {
          status: finalArticle.antiHallucinationReport.status,
          blocking: finalArticle.antiHallucinationReport.blocking || false,
          reasons: finalArticle.antiHallucinationReport.reasons || []
        } : null,
        inlineImages: finalArticle.inlineImages || [],
        featuredImage: finalArticle.featuredImage || null,
        angle: finalArticle.angle || null,
        _truthPack: finalArticle._truthPack || null
      };
    }

    return this.report;
  }

  /**
   * Retourne le rapport JSON
   */
  toJSON() {
    return JSON.stringify(this.report, null, 2);
  }

  /**
   * Retourne le rapport comme objet
   */
  getReport() {
    return this.report;
  }
  _mapStepToVizAgent(stepName) {
    const map = { extractor: "extractor", generator: "generator", finalizer: "finalizer" };
    return map[stepName] || null;
  }
}

export default PipelineReport;
