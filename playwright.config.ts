import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export default defineConfig({
 testDir: './tests', timeout: 45000, workers: 1, fullyParallel: false,
 use: { baseURL: 'http://127.0.0.1:5001', channel: 'msedge', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, trace: 'retain-on-failure' },
 reporter: 'list',
 webServer: { command: 'python -m backend.app', url: 'http://127.0.0.1:5001/api/health', timeout: 30000, env: { PORT: '5001', PYTHONPATH: resolve('.python-deps'), PET_CHAT_MODE: 'local', APP_DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'music-h5-tests-')), 'test.sqlite3') } },
});
