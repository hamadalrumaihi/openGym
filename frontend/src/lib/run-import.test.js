import { describe, expect, it } from 'vitest'
import { kindOfType, runFromGarmin, runFromStrava, sameRun, preferRun, mergeRuns } from './run-import.js'
import { readRun, withRun } from './running.js'

// Shapes as the two APIs document them (Garmin Connect Personal API SummarizedActivityDTO,
// Strava v3 DetailedActivity), with the fields we read and a few we must ignore.
const garmin = {
  activityId: 20123456789, activityName: 'Doha Evening Run', startTimeLocal: '2026-11-10 18:02:11', startTimeGMT: '2026-11-10 15:02:11',
  beginTimestamp: Date.UTC(2026, 10, 10, 15, 2, 11), activityType: { typeId: 1, typeKey: 'running', parentTypeId: 17 },
  distance: 4512.3, duration: 1811.4, movingDuration: 1790.2, elapsedDuration: 1830, elevationGain: 13.6,
  averageSpeed: 2.49, averageHR: 148, maxHR: 171, averageRunningCadenceInStepsPerMinute: 163.2,
  hrTimeInZone_1: 120.5, hrTimeInZone_2: 900, hrTimeInZone_3: 600, hrTimeInZone_4: 190.9, hrTimeInZone_5: 0,
  aerobicTrainingEffect: 2.8, anaerobicTrainingEffect: 0.3, activityTrainingLoad: 61.7, vO2MaxValue: 41,
  avgVerticalOscillation: 9.1, avgGroundContactTime: 266, avgStrideLength: 92.3, avgVerticalRatio: 9.8,
  startLatitude: 25.2854, startLongitude: 51.531, hasPolyline: true, lapCount: 5, manufacturer: 'GARMIN',
}
const strava = {
  id: 1234567890123, name: 'Doha Evening Run', sport_type: 'Run', type: 'Run', start_date: '2026-11-10T15:02:11Z', start_date_local: '2026-11-10T18:02:11Z',
  distance: 4512.3, moving_time: 1790, elapsed_time: 1830, total_elevation_gain: 13.6, average_heartrate: 148.3, max_heartrate: 171,
  average_cadence: 81.6, device_name: 'Garmin Forerunner 965', external_id: 'garmin_push_20123456789', map: { summary_polyline: 'abc' },
  start_latlng: [25.2854, 51.531], end_latlng: [25.2855, 51.532],
  laps: [{ moving_time: 600, distance: 1500, average_heartrate: 140.2 }, { moving_time: 1190, distance: 3012.3, average_heartrate: 152 }],
}

describe('activity types', () => {
  it('knows a run from a walk from anything else, in both vocabularies', () => {
    expect(kindOfType('running')).toBe('run')
    expect(kindOfType('Run')).toBe('run')
    expect(kindOfType('trail_running')).toBe('run')
    expect(kindOfType('TrailRun')).toBe('run')
    expect(kindOfType('VirtualRun')).toBe('run')
    expect(kindOfType('walking')).toBe('walk')
    expect(kindOfType('Hike')).toBe('walk')
    expect(kindOfType('cycling')).toBeNull()
    expect(kindOfType('WeightTraining')).toBeNull()
  })
})

describe('from Garmin', () => {
  it('reads the documented summary fields, rounds, dates by local time, and keeps no coordinate', () => {
    const { id, run } = runFromGarmin(garmin)
    expect(id).toBe('garmin:20123456789')
    expect(run).toMatchObject({ d: '2026-11-10', start: Date.UTC(2026, 10, 10, 15, 2, 11), src: 'garmin', srcId: '20123456789', name: 'Doha Evening Run', kind: 'run', sec: 1811, distM: 4512, avgHr: 148, maxHr: 171, cadence: 163, elevM: 14, gps: true })
    expect(run.zones).toEqual([121, 900, 600, 191, 0])
    expect(run.garmin).toEqual({ te: 2.8, ate: 0.3, load: 61.7, vo2: 41, vo: 9.1, gct: 266, stride: 92.3, vratio: 9.8 })
    expect(JSON.stringify(run)).not.toMatch(/25\.28|51\.53|atitude|ongitude/)
    // The stored shape reads back whole.
    expect(readRun(run).garmin.load).toBe(61.7)
  })
  it('falls back to the GMT start when the timestamp is missing, and ignores other sports', () => {
    const { run } = runFromGarmin({ ...garmin, beginTimestamp: undefined })
    expect(run.start).toBe(Date.UTC(2026, 10, 10, 15, 2, 11))
    expect(runFromGarmin({ ...garmin, activityType: { typeKey: 'cycling' } })).toBeNull()
    expect(runFromGarmin({ ...garmin, duration: 0, movingDuration: 0 })).toBeNull()
    expect(runFromGarmin(null)).toBeNull()
    expect(runFromGarmin({ ...garmin, hrTimeInZone_3: undefined }).run.zones).toBeNull()
  })
})

describe('from Strava', () => {
  it('reads the documented fields, doubles the one-foot cadence, keeps laps, and notes the Garmin device', () => {
    const { id, run } = runFromStrava(strava)
    expect(id).toBe('strava:1234567890123')
    expect(run).toMatchObject({ d: '2026-11-10', start: Date.UTC(2026, 10, 10, 15, 2, 11), src: 'strava', kind: 'run', sec: 1790, distM: 4512, avgHr: 148, maxHr: 171, cadence: 163, elevM: 14, gps: true, device: 'Garmin Forerunner 965', viaGarmin: true })
    expect(run.laps).toEqual([{ sec: 600, distM: 1500, avgHr: 140 }, { sec: 1190, distM: 3012, avgHr: 152 }])
    expect(JSON.stringify(run)).not.toMatch(/25\.28|51\.53|polyline|latlng/)
  })
  it('takes laps from a separate call, and leaves out rides and junk', () => {
    const { laps, ...summary } = strava
    expect(runFromStrava(summary).run.laps).toEqual([])
    expect(runFromStrava(summary, laps).run.laps.length).toBe(2)
    expect(runFromStrava({ ...strava, sport_type: 'Ride', type: 'Ride' })).toBeNull()
    expect(runFromStrava({ ...strava, moving_time: 0, elapsed_time: 0 })).toBeNull()
    expect(runFromStrava({ ...strava, device_name: 'iPhone', external_id: 'x.fit' }).run.viaGarmin).toBe(false)
  })
})

describe('duplicates', () => {
  const g = runFromGarmin(garmin).run
  const s = runFromStrava(strava).run
  it('recognises one run recorded twice, and not two runs on the same day', () => {
    expect(sameRun(g, s)).toBe(true)
    expect(sameRun(g, { ...s, start: s.start + 10 * 60000 })).toBe(false)
    expect(sameRun(g, { ...s, distM: 6000 })).toBe(false)
    expect(sameRun({ d: '2026-11-10', sec: 1800, distM: 4500 }, { d: '2026-11-10', sec: 1790, distM: 4512 })).toBe(true)
    expect(sameRun({ d: '2026-11-10', sec: 1800, distM: 4500 }, { d: '2026-11-11', sec: 1800, distM: 4500 })).toBe(false)
    expect(sameRun(null, s)).toBe(false)
  })
  it('prefers the device’s record over Strava’s', () => {
    expect(preferRun(s, g)).toBe(g)
    expect(preferRun(g, s)).toBe(g)
    expect(preferRun(s, { ...s, src: 'fit' }).src).toBe('fit')
    expect(preferRun(s, { ...s, src: 'manual' })).toBe(s)
  })
  it('merges an import into the log: adds, updates in place, drops or replaces duplicates, keeps what was typed', () => {
    const r1 = mergeRuns({}, [{ id: 'strava:1234567890123', run: s }], 10)
    expect(r1).toMatchObject({ added: 1, updated: 0, duplicates: 0 })
    expect(r1.map['strava:1234567890123']._ts).toBe(10)
    // The person adds effort and a note.
    const withNote = withRun(r1.map, 'strava:1234567890123', { ...readRun(r1.map['strava:1234567890123']), rpe: 6, note: 'warm' }, 11)
    // The same Strava activity again, with a new name: updated in place, note kept.
    const r2 = mergeRuns(withNote, [{ id: 'strava:1234567890123', run: { ...s, name: 'Renamed' } }], 12)
    expect(r2).toMatchObject({ added: 0, updated: 1, duplicates: 0 })
    expect(r2.map['strava:1234567890123']).toMatchObject({ name: 'Renamed', rpe: 6, note: 'warm', _ts: 12 })
    // Unchanged content is not re-stamped.
    expect(mergeRuns(r2.map, [{ id: 'strava:1234567890123', run: { ...s, name: 'Renamed' } }], 13).updated).toBe(0)
    // The Garmin copy of the same run replaces the Strava one and inherits the note; the Strava key is cleared.
    const r3 = mergeRuns(r2.map, [{ id: 'garmin:20123456789', run: g }], 14)
    expect(r3).toMatchObject({ added: 1, duplicates: 1 })
    expect(r3.map['garmin:20123456789']).toMatchObject({ src: 'garmin', rpe: 6, note: 'warm', _ts: 14 })
    expect(r3.map['strava:1234567890123']).toEqual({ _ts: 14 })
    // A Strava copy arriving after the Garmin one is dropped.
    const r4 = mergeRuns(r3.map, [{ id: 'strava:1234567890123', run: s }], 15)
    expect(r4).toMatchObject({ added: 0, duplicates: 1 })
    expect(r4.map['strava:1234567890123']).toEqual({ _ts: 14 })
    // Junk is skipped.
    expect(mergeRuns(r4.map, [null, { id: 'x' }, { id: 'manual:1', run: { d: 'nope' } }], 16).added).toBe(0)
  })
})
