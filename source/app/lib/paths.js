// Where Maybee keeps what it writes while it runs (requests, snapshots, access session, browser profile).
// An installed package is read-only, so this lives beside it in `.maybee/data/`.
// Running from the source repository (no `.maybee/package` above) keeps an `app/data/` folder.
// Walks up from this file, so it gives the same answer from the source tree and from the built bundle.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function locate() {
  const start = path.dirname(fileURLToPath(import.meta.url))
  let appDir = null
  for (let dir = start; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (!appDir && fs.existsSync(path.join(dir, 'package.json'))) appDir = dir
    if (path.basename(dir) === 'package' && path.basename(path.dirname(dir)) === '.maybee') {
      return path.join(path.dirname(dir), 'data')
    }
  }
  return path.join(appDir || start, 'data')
}

export const DATA_DIR = process.env.MAYBEE_DATA_DIR || locate()
export const dataPath = (...parts) => path.join(DATA_DIR, ...parts)
