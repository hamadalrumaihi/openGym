import { describe, expect, it } from 'vitest'
import { workoutFit, workoutFitMessages, workoutFitName, workoutName, WKT, DURATION, TARGET, INTENSITY } from './fit-workout.js'
import { decodeFit } from './fit-decode.js'
import { readRunning } from './running.js'
import { buildPlan, allSessions } from './running-plan.js'

const running = readRunning({ goal: '10k', startDate: '2026-11-09', days: [2, 4, 0], hrMax: 180, plan: buildPlan({ goal: '10k' }) })
const sessions = allSessions(running)
const steps = bytes => decodeFit(bytes).messages.filter(m => m.global === WKT.workoutStep).map(m => m.fields)

describe('a run/walk session as a FIT workout', () => {
  it('writes a workout file: file_id type 5, a running workout, warm-up, run, walk, repeat, cool-down', () => {
    const s = sessions[0]   // 6 × (1 min run · 2 min walk)
    const bytes = workoutFit(s, { name: 'R10K W1 Tue', now: Date.UTC(2026, 10, 9) })
    const d = decodeFit(bytes)
    expect(d.crcOk).toBe(true)
    expect(d.messages.find(m => m.global === WKT.fileId).fields[0]).toBe(5)
    const wk = d.messages.find(m => m.global === WKT.workout).fields
    expect(wk[4]).toBe(1)                 // running
    expect(wk[6]).toBe(5)                 // steps
    expect(wk[8]).toBe('R10K W1 Tue')
    const st = steps(bytes)
    expect(st.map(f => f[254])).toEqual([0, 1, 2, 3, 4])
    expect(st[0]).toMatchObject({ 1: DURATION.time, 2: 300000, 3: TARGET.open, 7: INTENSITY.warmup })
    // The run step carries the zone-2 band in bpm, offset by 100.
    expect(st[1]).toMatchObject({ 1: DURATION.time, 2: 60000, 3: TARGET.heartRate, 5: 208, 6: 226, 7: INTENSITY.active })
    expect(st[2]).toMatchObject({ 1: DURATION.time, 2: 120000, 3: TARGET.open, 7: INTENSITY.rest })
    expect(st[3]).toMatchObject({ 1: DURATION.repeat, 2: 1, 3: TARGET.open, 4: 6 })
    expect(st[4]).toMatchObject({ 1: DURATION.time, 2: 300000, 7: INTENSITY.cooldown })
  })

  it('writes a zone number without a known maximum, and a pace band when asked', () => {
    const noHr = allSessions({ ...running, hrMax: null })[0]
    expect(steps(workoutFit(noHr))[1]).toMatchObject({ 3: TARGET.heartRate, 4: 2 })
    // 7:00-8:00 /km → 2.08-2.38 m/s
    const paced = steps(workoutFit(noHr, { paceSecKm: { low: 420, high: 480 } }))[1]
    expect(paced[3]).toBe(TARGET.speed)
    expect(paced[5]).toBe(2083)
    expect(paced[6]).toBe(2381)
  })

  it('writes a continuous run as one step and the race as a distance step', () => {
    const cont = { ...sessions[0], walkSec: 0, runSec: 1800, reps: 1, workMin: 30, kind: 'easy' }
    const st = steps(workoutFit(cont))
    expect(st.length).toBe(3)
    expect(st[1]).toMatchObject({ 1: DURATION.time, 2: 1800000, 7: INTENSITY.active })
    const race = sessions[sessions.length - 1]
    const rs = steps(workoutFit(race))
    expect(rs[1]).toMatchObject({ 1: DURATION.distance, 2: 1000000, 7: INTENSITY.active })
    expect(rs[1][8]).toMatch(/^Run \d+ min, walk/)
  })

  it('names the file and the workout for a watch list', () => {
    expect(workoutFitName(sessions[0], 1)).toBe('opengym-w1-tue-runwalk.fit')
    expect(workoutName(sessions[0], 1)).toBe('R10K W1 Tue')
    expect(workoutName(sessions[2], 12, 'half').length).toBeLessThanOrEqual(16)
    expect(() => workoutFitMessages(null)).toThrow()
  })
})
