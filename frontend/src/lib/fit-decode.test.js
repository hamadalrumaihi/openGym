import { describe, expect, it } from 'vitest'
import { decodeFit, activityFromFit, fitRunId, fitFromZip, looksZipped, FitError } from './fit-decode.js'
import { encodeFit, fitTime, fitCrc, FIT_EPOCH_OFFSET } from './fit-export.js'

const T0 = Date.UTC(2026, 10, 10, 15, 0, 0)   // 2026-11-10 15:00Z, 18:00 in Qatar
const F0 = fitTime(T0)
const QATAR = 3 * 3600

// A short run the way a watch writes it: file_id, records every 10 s, two laps, session, activity.
function runFile({ withGps = true, laps = 2, hr = true } = {}) {
  const msgs = [{ global: 0, fields: [[0, 'enum', 4], [1, 'uint16', 1], [2, 'uint16', 4315], [4, 'uint32', F0]] }]
  const secs = 1800
  for (let t = 0; t <= secs; t += 10) {
    msgs.push({ global: 20, fields: [
      [253, 'uint32', F0 + t],
      withGps ? [0, 'uint32', 300000000 + t] : null,
      withGps ? [1, 'uint32', 600000000 + t] : null,
      hr ? [3, 'uint8', t < 900 ? 120 : 150] : null,
      [4, 'uint8', 82],
      [5, 'uint32', Math.round(t * 2.5 * 100)],   // 2.5 m/s, cm
    ] })
  }
  for (let i = 0; i < laps; i++) {
    msgs.push({ global: 19, fields: [[253, 'uint32', F0 + (i + 1) * 900], [2, 'uint32', F0 + i * 900], [8, 'uint32', 900000], [9, 'uint32', 225000], [15, 'uint8', i ? 150 : 120]] })
  }
  msgs.push({ global: 18, fields: [
    [253, 'uint32', F0 + secs], [2, 'uint32', F0], [5, 'enum', 1], [6, 'enum', 0],
    [7, 'uint32', secs * 1000], [8, 'uint32', secs * 1000], [9, 'uint32', 450000],
    [16, 'uint8', 135], [17, 'uint8', 160], [18, 'uint8', 82], [22, 'uint16', 14],
  ] })
  msgs.push({ global: 34, fields: [[253, 'uint32', F0 + secs], [5, 'uint32', F0 + secs + QATAR], [0, 'uint32', secs * 1000], [1, 'uint16', 1]] })
  return encodeFit(msgs)
}

describe('decoding FIT', () => {
  it('reads back what the writer wrote, message by message, with the CRC checked', () => {
    const d = decodeFit(runFile())
    expect(d.crcOk).toBe(true)
    expect(d.protocol).toBe(0x10)
    const session = d.messages.find(m => m.global === 18)
    expect(session.fields).toMatchObject({ 2: F0, 5: 1, 9: 450000, 16: 135, 17: 160, 18: 82, 22: 14 })
    expect(d.messages.filter(m => m.global === 20).length).toBe(181)
    expect(d.messages.filter(m => m.global === 19).length).toBe(2)
  })

  it('refuses something that is not FIT and reports a corrupt CRC without giving up', () => {
    expect(() => decodeFit(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]))).toThrow(FitError)
    const bytes = runFile()
    bytes[bytes.length - 1] ^= 0xFF
    const d = decodeFit(bytes)
    expect(d.crcOk).toBe(false)
    expect(d.messages.find(m => m.global === 18)).toBeTruthy()
  })

  it('handles compressed-timestamp headers, big-endian definitions, arrays, strings and developer fields', () => {
    // Hand-built: a 14-byte header, one big-endian definition of a record with a uint16 array and
    // a string, a field_description + developer field, then data with a compressed timestamp.
    const body = []
    const u8 = v => body.push(v & 0xFF)
    const u16be = v => { u8(v >> 8); u8(v) }
    const u32be = v => { u16be(v >>> 16); u16be(v & 0xFFFF) }
    // developer_data_id (207): developer_data_index 3 = 0
    u8(0x41); u8(0); u8(1); u16be(207); u8(1); u8(3); u8(1); u8(0x02)
    u8(0x01); u8(0)
    // field_description (206): developer_data_index 0, field_definition_number 1, base type 2 (uint8 = 0x02), name 8
    u8(0x42); u8(0); u8(1); u16be(206); u8(4); u8(0); u8(1); u8(0x02); u8(1); u8(1); u8(0x02); u8(2); u8(1); u8(0x02); u8(3); u8(8); u8(0x07)
    u8(0x02); u8(0); u8(1); u8(0x02); for (const c of 'Doughnut') u8(c.charCodeAt(0))
    // record (20) definition with a developer field: timestamp u32, heart_rate u8, left_right_balance array u16×2, plus dev field (0,1) size 1
    u8(0x60 | 0); u8(0); u8(1); u16be(20); u8(3); u8(253); u8(4); u8(0x86); u8(3); u8(1); u8(0x02); u8(30); u8(4); u8(0x84)
    u8(1); u8(1); u8(1); u8(0)
    // data: full timestamp
    u8(0x00); u32be(1000); u8(140); u16be(10); u16be(0xFFFF); u8(7)
    // a second definition (local 1) without the timestamp field, for compressed-timestamp records
    u8(0x61); u8(0); u8(1); u16be(20); u8(2); u8(3); u8(1); u8(0x02); u8(30); u8(4); u8(0x84)
    u8(1); u8(1); u8(1); u8(0)
    // data: compressed timestamp header, local 1, offset 5 → 1000 & ~31 = 992 | 5 = 997 < 1000 → +32 = 1029
    u8(0x80 | (1 << 5) | 5); u8(141); u16be(11); u16be(12); u8(9)
    const data = Uint8Array.from(body)
    const header = new Uint8Array(14)
    const hv = new DataView(header.buffer)
    header[0] = 14; header[1] = 0x20; hv.setUint16(2, 2132, true); hv.setUint32(4, data.length, true); header.set([0x2E, 0x46, 0x49, 0x54], 8)
    hv.setUint16(12, fitCrc(header.subarray(0, 12)), true)
    const file = new Uint8Array(16 + data.length)
    file.set(header); file.set(data, 14)
    const crc = fitCrc(file.subarray(0, 14 + data.length))
    file[file.length - 2] = crc & 0xFF; file[file.length - 1] = crc >> 8
    const d = decodeFit(file)
    expect(d.crcOk).toBe(true)
    const recs = d.messages.filter(m => m.global === 20)
    expect(recs.length).toBe(2)
    expect(recs[0].fields).toEqual({ 253: 1000, 3: 140, 30: [10, null] })
    expect(recs[0].dev).toEqual({ Doughnut: 7 })
    expect(recs[1].fields[253]).toBe(1029)
    expect(recs[1].fields[30]).toEqual([11, 12])
    expect(recs[1].dev.Doughnut).toBe(9)
    expect(d.messages.find(m => m.global === 206).fields[3]).toBe('Doughnut')
  })

  it('reads two chained files one after the other', () => {
    const a = runFile({ laps: 1 }), b = runFile({ laps: 1 })
    const both = new Uint8Array(a.length + b.length); both.set(a); both.set(b, a.length)
    expect(decodeFit(both).messages.filter(m => m.global === 18).length).toBe(2)
  })
})

describe('an activity from a FIT file', () => {
  it('becomes a run in the log’s shape, dated in the watch’s local time, doubling running cadence, counting GPS but keeping none', () => {
    const { run } = activityFromFit(decodeFit(runFile()), { hrMax: 180, name: 'Evening run' })
    expect(run).toMatchObject({ d: '2026-11-10', start: T0, src: 'fit', kind: 'run', sec: 1800, distM: 4500, avgHr: 135, maxHr: 160, cadence: 164, elevM: 14, gps: true, name: 'Evening run' })
    expect(run.laps).toEqual([{ sec: 900, distM: 2250, avgHr: 120 }, { sec: 900, distM: 2250, avgHr: 150 }])
    // 900 s at 120 bpm (zone 2 of 180: 108-126), 900 s at 150 (zone 4: 144-162)
    expect(run.zones).toEqual([0, 900, 0, 900, 0])
    expect(JSON.stringify(run)).not.toMatch(/300000|600000|lat|lng|long/i)
    expect(fitRunId(run)).toBe(`fit:${Math.round(T0 / 1000)}`)
  })

  it('dates a late-evening run by the watch’s offset, not the reader’s', () => {
    // 22:30Z on the 10th is 01:30 on the 11th in Qatar.
    const late = Date.UTC(2026, 10, 10, 22, 30)
    const F = fitTime(late)
    const msgs = [
      { global: 18, fields: [[253, 'uint32', F + 600], [2, 'uint32', F], [5, 'enum', 1], [8, 'uint32', 600000], [9, 'uint32', 100000]] },
      { global: 34, fields: [[253, 'uint32', F + 600], [5, 'uint32', F + 600 + QATAR]] },
    ]
    expect(activityFromFit(decodeFit(encodeFit(msgs))).run.d).toBe('2026-11-11')
  })

  it('returns null without a session, a walk as a walk, and no zones without a maximum or records', () => {
    expect(activityFromFit(decodeFit(encodeFit([{ global: 0, fields: [[0, 'enum', 4]] }])))).toBeNull()
    const walk = encodeFit([{ global: 18, fields: [[253, 'uint32', F0 + 60], [2, 'uint32', F0], [5, 'enum', 11], [8, 'uint32', 60000], [9, 'uint32', 10000], [18, 'uint8', 60]] }])
    const w = activityFromFit(decodeFit(walk), { hrMax: 180 }).run
    expect(w.kind).toBe('walk')
    expect(w.cadence).toBe(120)
    expect(w.zones).toBeNull()
    expect(w.laps).toEqual([])
    expect(activityFromFit(decodeFit(runFile({ hr: false }))).run.zones).toBeNull()
  })
})

describe('zipped exports', () => {
  it('finds a stored .fit inside a zip and ignores other entries', async () => {
    const fit = runFile({ laps: 1 })
    const entry = (name, data) => {
      const n = new TextEncoder().encode(name)
      const h = new Uint8Array(30 + n.length)
      const dv = new DataView(h.buffer)
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(8, 0, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, n.length, true)
      h.set(n, 30)
      const out = new Uint8Array(h.length + data.length); out.set(h); out.set(data, h.length)
      return out
    }
    const a = entry('readme.txt', new TextEncoder().encode('hi')), b = entry('12345_ACTIVITY.fit', fit)
    const zip = new Uint8Array(a.length + b.length); zip.set(a); zip.set(b, a.length)
    expect(looksZipped(zip)).toBe(true)
    expect(looksZipped(fit)).toBe(false)
    const got = await fitFromZip(zip)
    expect(got.length).toBe(fit.length)
    expect(decodeFit(got).crcOk).toBe(true)
    expect(await fitFromZip(a)).toBeNull()
  })
})
