import {defineConfig} from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
	...base,
	testMatch:'demo.spec.ts',
	outputDir:'production-test-results',
	use:{...base.use,baseURL:'http://127.0.0.1:5180'},
	webServer:{command:'bun run preview --host 127.0.0.1 --port 5180 --strictPort',url:'http://127.0.0.1:5180'}
})
