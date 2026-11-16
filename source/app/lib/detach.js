// Runs the current script again, in a session of its own, and returns when it says it is ready (or has stopped).
// Why: an assistant such as Codex stops everything a command left behind when the command ends, and the app (with the
// browser it opened) was gone as soon as `start.sh` returned. A process started with `detached` gets a session of
// its own, and when this one exits it is no longer a child of the command. Node does this on Linux, macOS and Windows alike,
// where `setsid` or `nohup` in a shell script is not the same everywhere.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }

// script: the file to run (process.argv[1]); args: its arguments without --detach; ready: a RegExp the log shows when it is up.
export function detachSelf({ script, args, logFile, ready, timeoutMs = 90000, env = process.env }) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  const out = fs.openSync(logFile, 'w')
  const child = spawn(process.execPath, [script, ...args], { detached: true, stdio: ['ignore', out, out], env: { ...env, MAYBEE_DETACHED: '1' } })
  child.unref()
  const start = Date.now()
  return new Promise(resolve => {
    const text = () => { try { return fs.readFileSync(logFile, 'utf8') } catch { return '' } }
    const done = result => { clearInterval(timer); resolve({ pid: child.pid, text: text(), ...result }) }
    const timer = setInterval(() => {
      const match = ready.exec(text())
      if (match) done({ ok: true, match })
      else if (!alive(child.pid)) done({ ok: false, reason: 'stopped' })
      else if (Date.now() - start > timeoutMs) done({ ok: false, reason: 'timeout' })
    }, 250)
  })
}
