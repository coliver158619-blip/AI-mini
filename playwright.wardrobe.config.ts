import { defineConfig } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const python = process.env.PYTHON || (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python');
const backendURL = 'http://127.0.0.1:5090';
const frontendURL = 'http://127.0.0.1:5190';

export default defineConfig({
 testDir: './tests', testMatch: 'wardrobe.spec.ts', timeout: 30000, workers: 1,
 outputDir: './test-results/wardrobe', reporter: 'list',
 use: { baseURL: frontendURL, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'darwin' ? 'chrome' : 'msedge'), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, trace: 'retain-on-failure' },
 webServer: [
  { command: `${python} -m backend.app`, url: `${backendURL}/api/health`, timeout: 30000,
   env: { HOST: '127.0.0.1', PORT: '5090', FLASK_DEBUG: '0', PET_CHAT_MODE: 'local', SEED_DEMO: 'false', APP_DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'wardrobe-tests-')), 'test.sqlite3') } },
  { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5190 --strictPort', url: frontendURL, timeout: 30000, env: { API_PROXY_TARGET: backendURL, VITE_RELATIONSHIP_PREVIEW: 'false' } },
 ],
});
