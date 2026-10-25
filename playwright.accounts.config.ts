import base from './playwright.wardrobe.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
 ...base, testMatch: 'accounts.spec.ts', timeout: 45000, outputDir: './test-results/accounts',
 webServer: (base.webServer as any[]).map((server, index) => index === 0 ? { ...server, env: { ...server.env, AUTH_ENABLED: 'true' } } : server),
});
