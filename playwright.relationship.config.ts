import {defineConfig} from '@playwright/test';
import base from './playwright.home-repair.config';
export default defineConfig({...base,testMatch:['relationship.spec.ts'],outputDir:'./test-results/relationship'});
