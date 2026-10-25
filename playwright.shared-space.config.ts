import { defineConfig } from '@playwright/test';
import base from './playwright.wardrobe.config';
export default defineConfig({ ...base, testMatch: ['shared-space.spec.ts', 'companion-space.spec.ts', 'character-motion.spec.ts'], outputDir: './test-results/shared-space' });
