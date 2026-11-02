import {defineConfig} from '@playwright/test';
const port=process.env.PSL_TEST_PORT??'8765';
export default defineConfig({testDir:'tests/e2e',webServer:{command:`python -m uvicorn server.app:app --host 127.0.0.1 --port ${port}`,url:`http://127.0.0.1:${port}/api/health`,reuseExistingServer:true,timeout:30000},fullyParallel:false,workers:1,timeout:30000,use:{launchOptions:process.env.PSL_BROWSER_PATH?{executablePath:process.env.PSL_BROWSER_PATH}:undefined,baseURL:`http://127.0.0.1:${port}`,viewport:{width:1440,height:1000},trace:'retain-on-failure'},reporter:'list'});
