import { defineConfig } from '@playwright/test';
import base from './playwright.wardrobe.config';
export default defineConfig({ ...base, testMatch: 'rankings.spec.ts', outputDir: './test-results/rankings', timeout: 45000 });
