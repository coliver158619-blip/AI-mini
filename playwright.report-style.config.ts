import {defineConfig} from '@playwright/test';
import base from './playwright.home-repair.config';
const servers=base.webServer as {env:Record<string,string>}[];
export default defineConfig({...base,testMatch:'report-style.spec.ts',webServer:[{...servers[0],env:{...servers[0].env,SEED_DEMO:'true'}},servers[1]]});
