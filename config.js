#!/usr/bin/env node

import dotenv from 'dotenv';

dotenv.config();

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const WORDPRESS_URL = process.env.WORDPRESS_URL;
export const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
export const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
export const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
