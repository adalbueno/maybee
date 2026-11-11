// Run: node scripts/test-instances.mjs (from the package repository).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maybee-instances-'))
const children = []
const moduleURL = new URL('../source/app/lib/instance.js', import.meta.url).href
const fixture = `
import http from 'node:http';
import { startInstance, stopInstance } from ${JSON.stringify(moduleURL)};
let info;
const server = http.createServer(async (req, res) => {
  if (req.url === '/api/instance/stop') {
    let body = ''; for await (const part of req) body += part;
    return stopInstance(req, res, info, JSON.parse(body));
  }
  res.end(JSON.stringify({ workspace: info.workspace, pid: process.pid }));
});
info = await startInstance(server, process.argv[1], Number(process.argv[2]), '127.0.0.1');
process.send(info);
`
async function start(root, port) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', fixture, root, String(port)], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
  children.push(child)
  const info = await Promise.race([
    once(child, 'message').then(([value]) => value),
    once(child, 'exit').then(([code]) => { throw new Error(`Child exited: ${code}`) }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Startup timeout')), 10000).unref()),
  ])
  return { child, info }
}
async function alive(instance) {
  const data = await (await fetch(instance.info.url)).json()
  assert.equal(data.pid, instance.child.pid)
  assert.equal(data.workspace, instance.info.workspace)
}
try {
  const aRoot = path.join(temp, 'a'), bRoot = path.join(temp, 'b')
  const a = await start(aRoot, 0)
  const b = await start(bRoot, a.info.port)
  assert.notEqual(a.info.port, b.info.port)
  await alive(a); await alive(b)
  assert.equal(JSON.parse(fs.readFileSync(path.join(bRoot, '.maybee/server.json'))).port, b.info.port)
  assert.equal(fs.statSync(path.join(bRoot, '.maybee/server.json')).mode & 0o777, 0o600)
  for (const [token, workspace] of [['wrong', bRoot], [b.info.token, aRoot]]) {
    const response = await fetch(b.info.url + '/api/instance/stop', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace }),
    })
    assert.equal(response.status, 403)
    await alive(b)
  }
  const stopped = once(a.child, 'exit')
  const a2 = await start(aRoot, a.info.port)
  await stopped
  await alive(a2); await alive(b)
  assert.equal(JSON.parse(fs.readFileSync(path.join(aRoot, '.maybee/server.json'))).pid, a2.child.pid)
  const cRoot = path.join(temp, 'c')
  fs.mkdirSync(path.join(cRoot, '.maybee'), { recursive: true })
  fs.writeFileSync(path.join(cRoot, '.maybee/server.json'), JSON.stringify({ workspace: cRoot, port: b.info.port, token: 'stale' }))
  const c = await start(cRoot, b.info.port)
  await alive(c); await alive(b)
  assert.notEqual(c.info.port, b.info.port)
  console.log('PASS: separate ports, workspace metadata, private token, rejected foreign restart, same-workspace restart, stale metadata isolation')
} finally {
  await Promise.all(children.filter(child => child.exitCode === null).map(async child => {
    const done = once(child, 'exit'); child.kill(); await done
  }))
  fs.rmSync(temp, { recursive: true, force: true })
}
