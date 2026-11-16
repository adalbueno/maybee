// A small zip reader (stored and deflate entries) for importing a playbook. No dependency: node:zlib does the inflating.
// It refuses what an import never needs: encryption, zip64, too many files, too much data, and names that leave the folder.
import zlib from 'node:zlib'

export const ZIP_LIMITS = { files: 2000, total: 50 * 1024 * 1024 }

export function readZip(buf, limits = ZIP_LIMITS) {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('That is not a zip file.')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || p === 0xffffffff) throw new Error('Zip64 archives are not supported.')
  if (count > limits.files) throw new Error('The zip has too many files.')
  const out = []
  let total = 0
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('The zip is damaged.')
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24)
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nlen).replace(/\\/g, '/')
    p += 46 + nlen + xlen + clen
    if (name.endsWith('/')) continue
    if (flags & 1) throw new Error('Encrypted zips are not supported.')
    if (name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.split('/').some(s => s === '..' || s === '')) throw new Error(`The zip has an unsafe path: ${name}`)
    total += usize
    if (total > limits.total) throw new Error('The zip is too large.')
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error('The zip is damaged.')
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + size)
    let data
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: limits.total })
    else throw new Error('The zip uses a compression this import does not support.')
    out.push({ name, data })
  }
  return out
}
