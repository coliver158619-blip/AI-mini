import {defineConfig} from '@playwright/test';
import base from './playwright.home-repair.config';

export default defineConfig({
 ...base,testMatch:'accounts.spec.ts',grep:/充电新手提示|明星滚轮/,timeout:45000,
 outputDir:'./test-results/charge',
 webServer:(base.webServer as any[]).map((server,index)=>index===0?{...server,env:{...server.env,AUTH_ENABLED:'true'}}:server),
});
