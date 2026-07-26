import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// A build stamp baked in at build time. Shown in Settings and used to bust the
// service-worker cache, so a fresh deploy is always detectable on-device.
const BUILD_ID = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

// Stamp the build id into the copied service worker so its bytes change on
// every deploy (public/ files aren't otherwise transformed by Vite).
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const path = resolve(__dirname, 'dist/sw.js')
      try {
        const src = readFileSync(path, 'utf8').replaceAll('__BUILD_ID__', BUILD_ID)
        writeFileSync(path, src)
      } catch { /* dist/sw.js absent — nothing to stamp */ }
    },
  }
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  base: '/vivian-hub/',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
})
