import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({ ...base, use: { ...base.use, baseURL: 'http://127.0.0.1:5179' }, webServer: { command: 'SQLITE_BENCH=1 bun run dev --host 127.0.0.1 --port 5179 --strictPort', url: 'http://127.0.0.1:5179' }, testDir: './benchmarks', timeout: 300_000, outputDir: 'benchmark-results' })
