import {defineConfig} from '@playwright/test';
import base from './playwright.home-repair.config';
export default defineConfig({...base,testMatch:'all-motion.spec.ts',timeout:60000});
