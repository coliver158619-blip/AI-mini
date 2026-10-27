import {defineConfig} from '@playwright/test';
import base from './playwright.charge.config';
export default defineConfig({...base,testMatch:'gifts.spec.ts',grep:undefined,outputDir:'./test-results/gifts'});
