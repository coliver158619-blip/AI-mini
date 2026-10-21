import { defineConfig } from '@playwright/test';
import base from './playwright.wardrobe.config';

export default defineConfig({ ...base, testMatch: ['fullscreen.spec.ts', 'mobile-interactions.spec.ts'], outputDir: './test-results/fullscreen' });
