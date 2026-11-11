// Workspace-local discovery and authenticated restart; never kill by port/PID.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export async function startInstance(server, root, preferredPort, host) {
  if (!Number.isInteger(preferredPort) || preferredPort < 0 || preferredPort > 65535) throw new Error('Invalid port')
  const dir = path.join(root, '.maybee')
  const file = path.join(dir, 'server.json')
  fs.mkdirSync(dir, { recursive: true })
  const token = crypto.randomBytes(32).toString('hex')
  let previous
  try { previous = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  if (previous?.workspace === root && previous.token && Number.isInteger(previous.port)) {
    try {
      const response = await fetch(`http://${host}:${previous.port}/api/instance/stop`, {
        method: 'POST', headers: { Authorization: `Bearer ${previous.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: root }), signal: AbortSignal.timeout(2000),
      })
      if (!response.ok) throw new Error('Previous instance did not accept restart')
    } catch { /* Stale metadata or a different process: leave it alone. */ }
  }
  const listen = port => new Promise((resolve, reject) => {
    const failed = error => { server.off('listening', ready); reject(error) }
    const ready = () => { server.off('error', failed); resolve() }
    server.once('error', failed)
    server.once('listening', ready)
    server.listen(port, host)
  })
  try { await listen(preferredPort) } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error
    await listen(0) // Let the OS reserve a free port atomically.
  }
  const port = server.address().port
  const info = { workspace: root, pid: process.pid, port, url: `http://${host}:${port}`, token, startedAt: new Date().toISOString() }
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(info, null, 2), { mode: 0o600 })
  fs.renameSync(temp, file)
  process.on('exit', () => {
    try {
      if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.unlinkSync(file)
    } catch {}
  })
  return info
}

export function stopInstance(req, res, info, body) {
  if (!info || req.headers.authorization !== `Bearer ${info.token}` || body?.workspace !== info.workspace) {
    res.writeHead(403); res.end(); return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end('{"stopping":true}', () => setImmediate(() => process.exit(0)))
}
