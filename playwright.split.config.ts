import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backendURL = 'http://127.0.0.1:5001';
const frontendPort = process.env.SPLIT_FRONTEND_PORT || '5175';
const frontendURL = `http://127.0.0.1:${frontendPort}`;
const database = join(mkdtempSync(join(tmpdir(), 'music-h5-split-')), 'test.sqlite3');

export default defineConfig({
 testDir: './tests',
 testMatch: 'app.spec.ts',
 timeout: 45000,
 workers: 1,
 fullyParallel: false,
 outputDir: './test-results/split',
 use: {
  baseURL: frontendURL,
  channel: 'msedge',
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  trace: 'retain-on-failure',
 },
 reporter: 'list',
 webServer: [
  {
   command: 'python -m backend.app',
   url: `${backendURL}/api/health`,
   timeout: 30000,
   reuseExistingServer: false,
   env: {
    HOST: '127.0.0.1', PORT: '5001', FLASK_DEBUG: '0',
    PYTHONPATH: resolve('.python-deps'), APP_DATABASE_PATH: database,
    SEED_DEMO: 'true', PET_CHAT_MODE: 'local', PET_CHAT_BASE_URL: '',
   },
  },
  {
   command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${frontendPort} --strictPort`,
   url: frontendURL,
   timeout: 30000,
   reuseExistingServer: false,
   env: { API_PROXY_TARGET: backendURL },
  },
 ],
});
