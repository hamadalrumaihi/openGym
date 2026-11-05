// A FIT reader for activity files (#running): the mirror image of lib/fit-export.js's writer,
// hand-written for the same reason — the format is a page of rules, and the official SDK's
// licence does not sit with an AGPL tree. It reads what a Forerunner writes: a 12- or 14-byte
// header, definition records with or without developer fields, data records with normal or
// compressed-timestamp headers, either byte order, arrays and strings, chained files. Fields are
// handed back raw by number; `activityFromFit` turns the session, laps and records of a run
// into the run-log shape (lib/running.js) and keeps no coordinate.
import { fitCrc, FIT_EPOCH_OFFSET } from './fit-export.js'

// base type byte → [size, invalid value, reader]
const BASE_TYPES = {
  0x00: [1, 0xFF, 'u8'], 0x01: [1, 0x7F, 's8'], 0x02: [1, 0xFF, 'u8'], 0x83: [2, 0x7FFF, 's16'], 0x84: [2, 0xFFFF, 'u16'],
  0x85: [4, 0x7FFFFFFF, 's32'], 0x86: [4, 0xFFFFFFFF, 'u32'], 0x07: [1, 0x00, 'str'], 0x88: [4, null, 'f32'], 0x89: [8, null, 'f64'],
  0x0A: [1, 0x00, 'u8'], 0x8B: [2, 0x0000, 'u16'], 0x8C: [4, 0x00000000, 'u32'], 0x0D: [1, 0xFF, 'u8'],
  0x8E: [8, null, 's64'], 0x8F: [8, null, 'u64'], 0x90: [8, null, 'u64'],
}

export class FitError extends Error { constructor(code, message) { super(message || code); this.code = code } }

const readNum = (dv, off, kind, le) => {
  switch (kind) {
    case 'u8': return dv.getUint8(off)
    case 's8': return dv.getInt8(off)
    case 'u16': return dv.getUint16(off, le)
    case 's16': return dv.getInt16(off, le)
    case 'u32': return dv.getUint32(off, le)
    case 's32': return dv.getInt32(off, le)
    case 'f32': return dv.getFloat32(off, le)
    case 'f64': return dv.getFloat64(off, le)
    case 'u64': return Number(dv.getBigUint64(off, le))
    case 's64': return Number(dv.getBigInt64(off, le))
    default: return null
  }
}

/**
 * Every message in `bytes` (a Uint8Array or ArrayBuffer), in file order, as
 * `{ global, local, fields: { [num]: value }, dev: { [key]: value } }`. Invalid values are left
 * out. Strings are trimmed at the NUL; a field wider than its base type comes back as an array.
 * Throws FitError('not-fit') when the header is not a FIT header; a bad CRC sets `crcOk` false
 * but still returns what could be read.
 */
export function decodeFit(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const messages = []
  let crcOk = true
  let pos = 0
  let protocol = null, profile = null
  while (pos + 12 <= bytes.length) {
    const hsize = bytes[pos]
    if ((hsize !== 12 && hsize !== 14) || String.fromCharCode(...bytes.subarray(pos + 8, pos + 12)) !== '.FIT') {
      if (messages.length) break
      throw new FitError('not-fit', 'Not a FIT file')
    }
    protocol ??= bytes[pos + 1]
    profile ??= dv.getUint16(pos + 2, true)
    const dataSize = dv.getUint32(pos + 4, true)
    if (hsize === 14 && dv.getUint16(pos + 12, true) !== 0 && dv.getUint16(pos + 12, true) !== fitCrc(bytes.subarray(pos, pos + 12))) crcOk = false
    const dataStart = pos + hsize
    const dataEnd = Math.min(bytes.length, dataStart + dataSize)
    if (dataEnd + 2 <= bytes.length) {
      const want = dv.getUint16(dataEnd, true)
      if (want !== fitCrc(bytes.subarray(pos, dataEnd))) crcOk = false
    } else crcOk = false
    decodeRecords(bytes, dv, dataStart, dataEnd, messages)
    pos = dataEnd + 2
  }
  return { protocol, profile, crcOk, messages }
}

function decodeRecords(bytes, dv, start, end, out) {
  const defs = new Map()
  const devFields = new Map()   // `${devIndex}:${num}` → { name, base }
  let lastTime = null
  let p = start
  while (p < end) {
    const h = bytes[p++]
    let local, compressedTime = null
    if (h & 0x80) { local = (h >> 5) & 0x03; compressedTime = h & 0x1F } else local = h & 0x0F
    if (!(h & 0x80) && (h & 0x40)) {
      // Definition record.
      const arch = bytes[p + 1]
      const le = arch === 0
      const global = le ? dv.getUint16(p + 2, true) : dv.getUint16(p + 2, false)
      const n = bytes[p + 4]
      p += 5
      const fields = []
      for (let i = 0; i < n; i++, p += 3) fields.push({ num: bytes[p], size: bytes[p + 1], base: bytes[p + 2], dev: false })
      if (h & 0x20) {
        const nd = bytes[p++]
        for (let i = 0; i < nd; i++, p += 3) fields.push({ num: bytes[p], size: bytes[p + 1], devIndex: bytes[p + 2], dev: true })
      }
      defs.set(local, { global, le, fields })
      continue
    }
    const def = defs.get(local)
    if (!def) throw new FitError('bad-record', `Data record for undefined local type ${local} at ${p}`)
    const msg = { global: def.global, local, fields: {}, dev: {} }
    for (const f of def.fields) {
      if (f.dev) {
        const meta = devFields.get(`${f.devIndex}:${f.num}`)
        const bt = BASE_TYPES[meta?.base] || BASE_TYPES[0x0D]
        const v = readField(dv, bytes, p, f.size, bt, def.le)
        if (v != null) msg.dev[meta?.name || `${f.devIndex}:${f.num}`] = v
      } else {
        const bt = BASE_TYPES[f.base] || BASE_TYPES[0x0D]
        const v = readField(dv, bytes, p, f.size, bt, def.le)
        if (v != null) msg.fields[f.num] = v
      }
      p += f.size
    }
    if (compressedTime != null) {
      // The five-bit offset rolls over against the last full timestamp seen.
      if (lastTime != null) {
        let t = (lastTime & ~0x1F) | compressedTime
        if (t < lastTime) t += 0x20
        msg.fields[253] = t
        lastTime = t
      }
    } else if (msg.fields[253] != null) lastTime = msg.fields[253]
    // field_description (206) names a developer field for later data records.
    if (def.global === 206 && msg.fields[0] != null && msg.fields[1] != null) {
      devFields.set(`${msg.fields[0]}:${msg.fields[1]}`, { name: msg.fields[3] || `dev${msg.fields[1]}`, base: msg.fields[2] })
    }
    out.push(msg)
  }
}

function readField(dv, bytes, p, size, [width, invalid, kind], le) {
  if (kind === 'str') {
    let end = p
    while (end < p + size && bytes[end] !== 0) end++
    const s = new TextDecoder().decode(bytes.subarray(p, end))
    return s.length ? s : null
  }
  if (size < width) return null
  const count = Math.floor(size / width)
  if (count === 1) {
    const v = readNum(dv, p, kind, le)
    return invalid != null && v === invalid ? null : v
  }
  const arr = []
  for (let i = 0; i < count; i++) {
    const v = readNum(dv, p + i * width, kind, le)
    arr.push(invalid != null && v === invalid ? null : v)
  }
  return arr.some(v => v != null) ? arr : null
}

/* ------------------------------------------------------------ an activity -- */

export const FIT_MSG = { fileId: 0, session: 18, lap: 19, record: 20, activity: 34 }
const SPORT_RUN = 1, SPORT_WALK = 11
const fitMs = t => (t + FIT_EPOCH_OFFSET) * 1000
const isoLocal = (ms, tzOffsetSec) => new Date(ms + tzOffsetSec * 1000).toISOString().slice(0, 10)

/**
 * A run from a decoded activity file: `{ run, sport, gps }` in the run-log shape (lib/running.js
 * readRun), or null when the file holds no session. `hrMax` fills in the time in zones from the
 * records when the file carries heart rate. Coordinates are counted, never kept.
 */
export function activityFromFit(decoded, { hrMax = null, name = '' } = {}) {
  const msgs = decoded?.messages || []
  const session = msgs.find(m => m.global === FIT_MSG.session)
  if (!session) return null
  const f = session.fields
  const activity = msgs.find(m => m.global === FIT_MSG.activity)
  const tz = activity && activity.fields[5] != null && activity.fields[253] != null ? activity.fields[5] - activity.fields[253] : -new Date().getTimezoneOffset() * 60
  const startFit = f[2] ?? f[253]
  if (startFit == null) return null
  const startMs = fitMs(startFit)
  const sport = f[5]
  const running = sport === SPORT_RUN || sport === SPORT_WALK
  const sec = Math.round((f[8] ?? f[7] ?? 0) / 1000)
  const distM = f[9] != null ? Math.round(f[9] / 100) : 0
  const cadence = f[18] != null ? Math.round(f[18] * (running ? 2 : 1)) : null
  const laps = msgs.filter(m => m.global === FIT_MSG.lap).map(m => ({
    sec: Math.round((m.fields[8] ?? m.fields[7] ?? 0) / 1000),
    distM: m.fields[9] != null ? Math.round(m.fields[9] / 100) : undefined,
    avgHr: m.fields[15] ?? undefined,
  })).filter(l => l.sec > 0)
  const records = msgs.filter(m => m.global === FIT_MSG.record)
  const gps = records.some(m => m.fields[0] != null && m.fields[1] != null)
  let zones = null
  if (hrMax && records.length) {
    zones = [0, 0, 0, 0, 0]
    // Each reading holds until the next one; a gap over 30 s (a pause) is not counted.
    let prev = null, prevHr = null
    for (const r of records) {
      const t = r.fields[253], hr = r.fields[3]
      if (t == null) continue
      if (prev != null && prevHr != null) {
        const dt = t - prev
        if (dt > 0 && dt <= 30) {
          const z = prevHr < hrMax * 0.6 ? 0 : prevHr < hrMax * 0.7 ? 1 : prevHr < hrMax * 0.8 ? 2 : prevHr < hrMax * 0.9 ? 3 : 4
          zones[z] += dt
        }
      }
      prev = t; prevHr = hr ?? null
    }
  }
  const run = {
    d: isoLocal(startMs, tz),
    start: startMs,
    src: 'fit',
    name,
    kind: sport === SPORT_WALK ? 'walk' : 'run',
    sec, distM,
    avgHr: f[16] ?? null,
    maxHr: f[17] ?? null,
    cadence,
    elevM: f[22] ?? null,
    laps, zones, gps,
  }
  return { run, sport, sessionFields: f }
}

/** A stable id for a FIT file's activity: the sport and the start second. */
export const fitRunId = run => `fit:${run.start ? Math.round(run.start / 1000) : run.d}`

/* ------------------------------------------------------------ zipped FIT -- */

const ZIP_LOCAL = 0x04034b50
/**
 * The first `.fit` inside a zip (Garmin Connect's "Export original" hands one over), inflated
 * with the browser's own DecompressionStream when it was deflated. Returns the bytes, or null
 * when the archive holds no FIT file. Only the local headers are walked; no ZIP64.
 */
export async function fitFromZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let p = 0
  while (p + 30 <= bytes.length && dv.getUint32(p, true) === ZIP_LOCAL) {
    const flags = dv.getUint16(p + 6, true)
    const method = dv.getUint16(p + 8, true)
    const csize = dv.getUint32(p + 18, true)
    const nameLen = dv.getUint16(p + 26, true)
    const extraLen = dv.getUint16(p + 28, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen))
    const dataStart = p + 30 + nameLen + extraLen
    if (flags & 0x08) throw new FitError('zip-streamed', 'This zip uses data descriptors; unzip it first')
    const data = bytes.subarray(dataStart, dataStart + csize)
    if (/\.fit$/i.test(name)) {
      if (method === 0) return data
      if (method === 8) {
        if (typeof DecompressionStream !== 'function') throw new FitError('no-inflate', 'This browser cannot unzip; unzip the file first')
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
        return new Uint8Array(await new Response(stream).arrayBuffer())
      }
      throw new FitError('zip-method', 'Unsupported zip compression')
    }
    p = dataStart + csize
  }
  return null
}

/** True when the bytes start like a zip. */
export const looksZipped = bytes => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
