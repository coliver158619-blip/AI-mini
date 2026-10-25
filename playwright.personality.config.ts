import { defineConfig } from '@playwright/test';
import base from './playwright.wardrobe.config';

export default defineConfig({ ...base, testMatch: ['personality.spec.ts', 'wardrobe.spec.ts', 'companion-space.spec.ts'], outputDir: './test-results/personality' });
