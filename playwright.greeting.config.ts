import {defineConfig} from '@playwright/test';import base from './playwright.wardrobe.config';export default defineConfig({...base,testMatch:'greeting-preview.spec.ts'});
