import {defineConfig} from '@playwright/test';
import base from './playwright.home-repair.config';
export default defineConfig({...base,testMatch:['music-interaction.spec.ts','personality.spec.ts']});
