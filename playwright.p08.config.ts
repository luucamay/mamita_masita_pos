import{defineConfig}from"@playwright/test";import p07 from"./playwright.p07.config";
export default defineConfig({...p07,testMatch:"profile.spec.ts",outputDir:"./test-results/p08"});
