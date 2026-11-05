// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  readRunning, runningOf, withRunning, runWeekModeOf, daysToRace,
  readRun, runsOf, runOf, withRun, withoutRun, runIdFor,
  readSessionState, sessionStatesOf, withSessionState, withoutSessionState,
  paceSecPerKm, fmtPace, fmtRunDur, fmtKm, hrZones, hrZoneOf, DEFAULT_DAYS, LAPS_MAX,
} from './running.js'
import { mergeStates, stampChange, resetIdsOf, STAMPED_MAPS } from './sync-merge.js'
import * as srv from '../../../api/sync-stamps.js'
import { DEF, restoredStateFor } from '../store/useStore.js'

const T = '2026-11-09'

describe('the running profile', () => {
  it('reads a profile back with defaults for what was left out and null for junk', () => {
    expect(readRunning(null)).toBeNull()
    expect(readRunning({ goal: 'marathon', startDate: T })).toBeNull()
    expect(readRunning({ goal: '10k' })).toBeNull()
    const r = readRunning({ goal: '10k', startDate: T, days: [2, 4, 0, 9, 4], hrMax: '185', strength: 1 })
    expect(r).toMatchObject({ goal: '10k', startDate: T, days: [2, 4, 0], hrMax: 185, strength: true, level: 'returning', raceDate: null, weekMode: null, plan: null })
    expect(readRunning({ goal: '5k', startDate: T, days: 'x' }).days).toEqual(DEFAULT_DAYS)
    expect(readRunning({ goal: '5k', startDate: T, hrMax: 40 }).hrMax).toBeNull()
  })

  it('patches the whole object and stamps it', () => {
    const S = { running: null }
    const a = withRunning(S, { goal: '10k', startDate: T }, 5)
    expect(a.setAt).toBe(5)
    const b = withRunning({ running: a }, { raceDate: '2027-01-17', weekMode: { mode: 'busy', until: '2026-11-15' } }, 6)
    expect(b).toMatchObject({ goal: '10k', raceDate: '2027-01-17', weekMode: { mode: 'busy', until: '2026-11-15' }, setAt: 6 })
    expect(runWeekModeOf({ running: b }, '2026-11-15')).toBe('busy')
    expect(runWeekModeOf({ running: b }, '2026-11-16')).toBeNull()
    expect(daysToRace({ running: b }, T)).toBe(69)
    expect(daysToRace({ running: a }, T)).toBeNull()
    expect(runningOf({})).toBeNull()
  })
})

describe('the run log', () => {
  const run = { d: T, start: Date.UTC(2026, 10, 9, 6), src: 'strava', srcId: '123', name: 'Morning Run', sec: 1800, distM: 4200, avgHr: 150, maxHr: 170, cadence: 165, elevM: 12, laps: [{ sec: 600, distM: 1400, avgHr: 145 }], rpe: 6, pain: 0, note: ' felt ok ', gps: true }

  it('reads a run back clean and drops what it cannot use', () => {
    const r = readRun(run)
    expect(r).toMatchObject({ d: T, src: 'strava', kind: 'run', sec: 1800, distM: 4200, avgHr: 150, cadence: 165, note: 'felt ok', gps: true, rpe: 6, pain: 0 })
    expect(r.laps).toEqual([{ sec: 600, distM: 1400, avgHr: 145 }])
    expect(readRun({ d: T })).toBeNull()
    expect(readRun({ d: 'nope', sec: 60 })).toBeNull()
    expect(readRun({ d: T, sec: 60, src: 'tiktok' }).src).toBe('manual')
    expect(readRun({ d: T, sec: 60, avgHr: 999 }).avgHr).toBeNull()
    // Laps are capped, zones must be exactly five non-negative numbers.
    expect(readRun({ d: T, sec: 60, laps: Array.from({ length: 100 }, () => ({ sec: 1 })) }).laps.length).toBe(LAPS_MAX)
    expect(readRun({ d: T, sec: 60, zones: [1, 2, 3] }).zones).toBeNull()
    expect(readRun({ d: T, sec: 60, zones: [0, 100, 200, 50, 0] }).zones).toEqual([0, 100, 200, 50, 0])
  })

  it('never keeps a coordinate, whatever the source hands over', () => {
    const r = readRun({ ...run, startLatitude: 25.28, startLongitude: 51.53, latlng: [[25.2, 51.5]] })
    expect(JSON.stringify(r)).not.toMatch(/25\.2|51\.5|lat/i)
  })

  it('stores compactly with a stamp, re-imports onto the same key, and clears with a stamped empty entry', () => {
    const id = runIdFor('strava', 123)
    expect(id).toBe('strava:123')
    const m1 = withRun({}, id, run, 10)
    expect(m1[id]._ts).toBe(10)
    expect(m1[id]).not.toHaveProperty('maxHr', null)
    expect(Object.keys(m1[id])).not.toContain('planRef')
    const m2 = withRun(m1, id, { ...run, sec: 1900 }, 11)
    expect(Object.keys(m2)).toEqual([id])
    expect(runOf({ runLog: m2 }, id).sec).toBe(1900)
    expect(withRun(m2, id, { d: T }, 12)).toBe(m2)
    const m3 = withoutRun(m2, id, 13)
    expect(m3[id]).toEqual({ _ts: 13 })
    expect(runsOf({ runLog: m3 })).toEqual([])
    expect(withoutRun(m3, 'nothing', 14)).toBe(m3)
  })

  it('lists runs oldest first by start time, then date', () => {
    const map = withRun(withRun(withRun({}, 'b', { d: T, start: Date.UTC(2026, 10, 9, 17), sec: 60 }), 'a', { d: T, start: Date.UTC(2026, 10, 9, 6), sec: 60 }), 'c', { d: '2026-11-08', sec: 60 })
    expect(runsOf({ runLog: map }).map(r => r.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('session states', () => {
  it('reads, writes and clears like the other logs', () => {
    expect(readSessionState({ status: 'done' })).toBeNull()
    expect(readSessionState({ status: 'maybe', d: T })).toBeNull()
    const m = withSessionState({}, 'k1-0', { status: 'done', d: T, runId: 'strava:1', rpe: 7, pain: 1, note: 'calf tight' }, 5)
    expect(sessionStatesOf({ runSessions: m })['k1-0']).toEqual({ status: 'done', d: T, runId: 'strava:1', rpe: 7, pain: 1, note: 'calf tight' })
    const m2 = withSessionState(m, 'k1-1', { status: 'skipped', d: '2026-11-12' }, 6)
    expect(Object.keys(sessionStatesOf({ runSessions: m2 }))).toEqual(['k1-0', 'k1-1'])
    const m3 = withoutSessionState(m2, 'k1-1', 7)
    expect(sessionStatesOf({ runSessions: m3 })).not.toHaveProperty('k1-1')
    expect(m3['k1-1']).toEqual({ _ts: 7 })
  })
})

describe('numbers and words', () => {
  it('formats pace, duration and distance the way a runner reads them', () => {
    expect(paceSecPerKm(1800, 5000)).toBe(360)
    expect(paceSecPerKm(1800, 50)).toBeNull()
    expect(fmtPace(365.4)).toBe('6:05')
    expect(fmtPace(null)).toBe('')
    expect(fmtRunDur(1930)).toBe('32:10')
    expect(fmtRunDur(3730)).toBe('1:02:10')
    expect(fmtKm(5240)).toBe('5.2 km')
    expect(fmtKm(0)).toBe('')
  })

  it('derives the five heart-rate bands from a maximum and places a reading in one', () => {
    expect(hrZones(null)).toBeNull()
    expect(hrZones(180)).toEqual([[90, 108], [108, 126], [126, 144], [144, 162], [162, 180]])
    expect(hrZoneOf(120, 180)).toBe(2)
    expect(hrZoneOf(80, 180)).toBe(0)
    expect(hrZoneOf(185, 180)).toBe(5)
    expect(hrZoneOf(120, null)).toBeNull()
  })
})

describe('persistence of the new fields', () => {
  it('has defaults in DEF, so a profile saved before them overlays cleanly', () => {
    expect(DEF.running).toBeNull()
    expect(DEF.runLog).toEqual({})
    expect(DEF.runSessions).toEqual({})
  })

  it('survives a backup restore and a pull into a copy that never had them', () => {
    const backup = { _ts: 5, routines: [], workouts: [], running: { goal: '10k', startDate: T }, runLog: withRun({}, 'manual:1', { d: T, sec: 1200 }), runSessions: withSessionState({}, 'k1-0', { status: 'done', d: T }) }
    const restored = restoredStateFor({ routines: [], workouts: [] }, backup)
    expect(runningOf(restored)).toMatchObject({ goal: '10k' })
    expect(runsOf(restored).map(r => r.id)).toEqual(['manual:1'])
    expect(sessionStatesOf(restored)['k1-0'].status).toBe('done')
    const legacy = restoredStateFor({ routines: [], workouts: [] }, { _ts: 5, routines: [], workouts: [] })
    expect(runningOf(legacy)).toBeNull()
    expect(runsOf(legacy)).toEqual([])
    expect(sessionStatesOf(legacy)).toEqual({})
  })

  it('stamps the two logs per entry on both sides and the profile as a whole', () => {
    expect(STAMPED_MAPS).toContain('runLog')
    expect(STAMPED_MAPS).toContain('runSessions')
    expect(srv.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    expect(resetIdsOf({ runLog: { a: { d: T, sec: 1, _ts: 1 } }, runSessions: { 'k1-0': { _ts: 1 } } })).toMatchObject({ runLog: ['a'], runSessions: ['k1-0'] })
  })

  it('merges two devices’ runs and ticks instead of keeping one copy whole', () => {
    const base = { _ts: 100, routines: [], workouts: [], runLog: {}, runSessions: {}, running: null }
    const phone = structuredClone(base)
    phone.runLog = withRun({}, 'strava:1', { d: T, sec: 1800, distM: 4000 }, 200)
    phone.running = withRunning(phone, { goal: '10k', startDate: T }, 200)
    phone._ts = stampChange(base, phone, 200)
    const laptop = structuredClone(base)
    laptop.runSessions = withSessionState({}, 'k1-0', { status: 'done', d: T, rpe: 5 }, 300)
    laptop.running = withRunning(laptop, { goal: '5k', startDate: T, hrMax: 180 }, 300)
    laptop._ts = stampChange(base, laptop, 300)
    const merged = mergeStates(phone, laptop)
    expect(runsOf(merged).map(r => r.id)).toEqual(['strava:1'])
    expect(sessionStatesOf(merged)['k1-0'].rpe).toBe(5)
    expect(runningOf(merged).goal).toBe('5k')
    expect(runningOf(merged).hrMax).toBe(180)
    const cleared = structuredClone(merged)
    cleared.runLog = withoutRun(cleared.runLog, 'strava:1', 400)
    cleared._ts = stampChange(merged, cleared, 400)
    expect(runsOf(mergeStates(phone, cleared))).toEqual([])
    expect(runsOf(mergeStates(cleared, phone))).toEqual([])
  })

  it('round-trips through the server’s stampPut without being stamped as one setting', () => {
    const cur = { _ts: 1, routines: [], workouts: [], runLog: withRun({}, 'manual:1', { d: T, sec: 600 }, 50) }
    const next = { _ts: 2, routines: [], workouts: [], runLog: withRun(cur.runLog, 'manual:2', { d: T, sec: 700 }, 60) }
    const out = srv.stampPut(cur, next, { overRead: true, now: 70 })
    expect(Object.keys(out.runLog).sort()).toEqual(['manual:1', 'manual:2'])
    expect(out.edited?.runLog).toBeUndefined()
  })
})
