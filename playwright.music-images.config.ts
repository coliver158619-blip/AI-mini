import {defineConfig} from '@playwright/test';
import base from './playwright.home-repair.config';
export default defineConfig({...base,testMatch:['music-images.spec.ts','personality.spec.ts','home-repair.spec.ts'],grepInvert:/底部遮挡/});
