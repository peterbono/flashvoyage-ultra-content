#!/usr/bin/env node

import dotenv from 'dotenv';

dotenv.config();

/**
 * Parse une variable d'environnement en booléen
 * Accepte: '1', 'true', 'yes', 'on' (insensible à la casse)
 * @param {string|undefined} v - Valeur de la variable d'environnement
 * @returns {boolean}
 */
export const parseBool = (v) => ['1','true','yes','on'].includes(String(v).toLowerCase());

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const WORDPRESS_URL = process.env.WORDPRESS_URL;
export const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
export const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
export const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

/**
 * Travelpayouts Partner Links API
 */
export const TRAVELPAYOUTS_API_TOKEN = process.env.TRAVELPAYOUTS_API_TOKEN || process.env.TRAVELPAYOUT_API;
export const TRAVELPAYOUTS_TRS = process.env.TRAVELPAYOUTS_TRS || '463418';
export const TRAVELPAYOUTS_MARKER = process.env.TRAVELPAYOUTS_MARKER || '676421';

/**
 * Variables d'environnement parsées (booléens)
 */
export const DRY_RUN = parseBool(process.env.FLASHVOYAGE_DRY_RUN);
export const FORCE_OFFLINE = parseBool(process.env.FORCE_OFFLINE);

/**
 * FLAGS D'ACTIVATION (cohérence: parseBool + ?? '1' pour actif par défaut)
 */
export const ENABLE_AFFILIATE_INJECTOR = parseBool(process.env.ENABLE_AFFILIATE_INJECTOR ?? '1'); // Activé par défaut
export const ENABLE_ANTI_HALLUCINATION_BLOCKING = parseBool(process.env.ENABLE_ANTI_HALLUCINATION_BLOCKING ?? '1'); // Activé par défaut
export const ENABLE_PIPELINE_BLOCKING = parseBool(process.env.ENABLE_PIPELINE_BLOCKING ?? '1'); // Activé par défaut
export const ENABLE_FINALIZER_BLOCKING = parseBool(process.env.ENABLE_FINALIZER_BLOCKING ?? '1'); // Activé par défaut
export const ENABLE_ARTICLE_VALIDATION = parseBool(process.env.ENABLE_ARTICLE_VALIDATION ?? '1'); // Activé par défaut
export const ENABLE_MARKETING_PASS = parseBool(process.env.ENABLE_MARKETING_PASS ?? '1'); // Activé par défaut
