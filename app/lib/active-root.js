// The active workspace's folder, for the scripts the agent runs (output.js, deliverable.js).
// The same rule as the server: the project folder holds .maybee/active-workspace.json, and the workspace lives in
// workspaces/<name>/. Works from the source repo (app/ is in the project) and from an installed package
// (.maybee/package/app). MAYBEE_WORKSPACE points at a workspace folder directly, when given.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function projectRoot() {
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  return path.basename(path.dirname(appDir)) === 'package' ? path.resolve(appDir, '../../..') : path.resolve(appDir, '..')
}

export function activeRoot() {
  if (process.env.MAYBEE_WORKSPACE) return path.resolve(process.env.MAYBEE_WORKSPACE)
  const base = projectRoot()
  try {
    const name = JSON.parse(fs.readFileSync(path.join(base, '.maybee', 'active-workspace.json'), 'utf8')).name
    if (name && /^[a-z0-9][a-z0-9-]{0,48}$/.test(name) && fs.existsSync(path.join(base, 'workspaces', name))) return path.join(base, 'workspaces', name)
  } catch {}
  if (fs.existsSync(path.join(base, 'workspaces', 'default'))) return path.join(base, 'workspaces', 'default')
  return base
}
