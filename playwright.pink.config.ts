import { defineConfig } from '@playwright/test';
import base from './playwright.wardrobe.config';
export default defineConfig({...base,testMatch:['pink-theme.spec.ts','character-motion.spec.ts','greeting-preview.spec.ts','shared-space.spec.ts','companion-space.spec.ts','bubble-layout.spec.ts']});
