import {defineConfig} from '@playwright/test';
import daily from './playwright.cash-daily.config';
export default defineConfig({...daily,testMatch:'zero-day.spec.ts',outputDir:'./test-results/zero-day'});
