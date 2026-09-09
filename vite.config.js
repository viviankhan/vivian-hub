import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// A build stamp baked in at build time. Shown in Settings and used to bust the
// service-worker cache, so a fresh deploy is always detectable on-device.
const BUILD_ID = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

// Stamp the build id and the precache list into the copied service worker.
// public/ files aren't otherwise transformed by Vite, so this runs after the
// bundle is written and rewrites dist/sw.js in place.
//
// The precache list is the point: the worker can only serve the app offline if
// it holds the hashed JS/CSS bundles, and their filenames aren't knowable until
// the bundle exists. Reading dist/assets here is what turns "cached a shell"
// into "the app actually opens with no network".
function stampServiceWorker() {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const path = resolve(__dirname, 'dist/sw.js')
      const assetsDir = resolve(__dirname, 'dist/assets')
      let assets = []
      try {
        if (existsSync(assetsDir)) {
          assets = readdirSync(assetsDir)
            // Source maps are big and only ever wanted by a debugger that has a
            // network — precaching them would bloat every install for nothing.
            .filter(f => !f.endsWith('.map'))
            .map(f => 'assets/' + f)
        }
      } catch { /* no assets dir — precache just the hand-written shell */ }
      try {
        const src = readFileSync(path, 'utf8')
          .replaceAll('__BUILD_ID__', BUILD_ID)
          .replace("['__PRECACHE__']", JSON.stringify(assets))
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
  build: {
    rollupOptions: {
      output: {
        // Split the dependencies that never change on a normal deploy out of
        // the app chunk. Everything used to ship as one ~1MB file, so editing a
        // single component invalidated React, React DOM and the Supabase client
        // along with it and every returning user re-downloaded all of them.
        // Splitting them out means a deploy usually only invalidates the app
        // chunk (and the tab chunks that actually changed).
        //
        // This matters more here than in most apps: the service worker
        // precaches every file in dist/assets on install, so a deploy that
        // invalidates one 1MB chunk re-downloads 1MB before the update
        // finishes — over a phone connection, on every release.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('@supabase')) return 'vendor-supabase'
          return 'vendor'
        },
      },
    },
  },
})
