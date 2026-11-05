import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configuredBasePath = process.env.VITE_BASE_PATH?.trim()
const base = configuredBasePath
  ? `${configuredBasePath.replace(/\/+$/, '')}/`
  : '/'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
  resolve: { alias: { '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src') } },
  test: { environment: 'jsdom', clearMocks: true },
})
