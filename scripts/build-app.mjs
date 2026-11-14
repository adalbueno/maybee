// Builds the app for a release: the interface is pre-compiled (web/) and the server and agent scripts are
// bundled and minified, so the installed package holds no readable source and no build tooling.
// Usage: node scripts/build-app.mjs <output app dir> [<source maps dir>]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP = path.join(ROOT, 'source', 'app')
const out = path.resolve(process.argv[2] || '')
const mapsOut = process.argv[3] ? path.resolve(process.argv[3]) : null
if (!process.argv[2]) { console.error('usage: build-app.mjs <output app dir> [<source maps dir>]'); process.exit(1) }

const require = createRequire(path.join(APP, 'package.json'))
const esbuild = require('esbuild')
const { build: viteBuild } = await import(pathToFileURL(path.join(APP, 'node_modules', 'vite', 'dist', 'node', 'index.js')))

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

// 1. The interface.
await viteBuild({
  root: APP,
  configFile: path.join(APP, 'vite.config.js'),
  logLevel: 'warn',
  build: { outDir: path.join(out, 'web'), emptyOutDir: true, sourcemap: false },
})

// 2. The server and the scripts agents run. Playwright stays outside the bundle: it is installed on the machine.
const entries = ['server.js', 'scripts/listen.js', 'scripts/status.js', 'scripts/reply.js', 'scripts/deliverable.js', 'scripts/browser.js', 'scripts/browser-lib.js', 'scripts/migrate.js']
await esbuild.build({
  entryPoints: entries.map(e => path.join(APP, e)),
  outdir: out,
  outbase: APP,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: true,
  legalComments: 'none',
  sourcemap: 'external',
  external: ['playwright-core', 'vite', '@vitejs/plugin-vue'],
  define: { __MAYBEE_BUNDLED__: 'true' },
  banner: { js: "import { createRequire as __maybeeRequire } from 'node:module'; const require = __maybeeRequire(import.meta.url);" },
  logLevel: 'warning',
})

// 3. What stays as it is: the manifest of dependencies (only playwright-core is installed) and the shell hook.
fs.copyFileSync(path.join(APP, 'package.json'), path.join(out, 'package.json'))
fs.copyFileSync(path.join(APP, 'package-lock.json'), path.join(out, 'package-lock.json'))
fs.copyFileSync(path.join(APP, 'scripts', 'session-start.sh'), path.join(out, 'scripts', 'session-start.sh'))
fs.chmodSync(path.join(out, 'scripts', 'session-start.sh'), 0o755)

// 4. Source maps are kept by the maintainers to read a stack trace; they do not ship.
const maps = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.map')) maps.push(p)
  }
})(out)
for (const m of maps) {
  if (mapsOut) {
    const dest = path.join(mapsOut, path.relative(out, m))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(m, dest)
  }
  fs.rmSync(m)
}
console.log(`Built app into ${out}${mapsOut ? ` (source maps in ${mapsOut})` : ''}`)
