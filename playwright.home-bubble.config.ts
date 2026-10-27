import { defineConfig } from '@playwright/test';
import base from './playwright.wardrobe.config';
export default defineConfig({ ...base, testMatch: 'home-bubble.spec.ts', use: { ...base.use, timezoneId: 'Asia/Shanghai' } });
