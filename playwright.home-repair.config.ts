import { defineConfig } from '@playwright/test';
import base from './playwright.wardrobe.config';
const {channel: _channel, ...use}=base.use!;
export default defineConfig({...base,use,testMatch:['home-repair.spec.ts'],projects:[{name:'chromium',use:{channel:'msedge'}},{name:'webkit',use:{browserName:'webkit'}}]});
