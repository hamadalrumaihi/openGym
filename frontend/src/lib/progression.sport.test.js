// The three sport-template policies and the two week modes (lib/week-mode.js). A jump is judged
// on speed and never gets load added by the app; a carry grows in time and then in load; a hang
// grows slowly and holds after a heavy mat week; a lighter or a competition week lays its own
// change over any of them and says so.
import { describe, it, expect } from 'vitest'
import { nextPrescription, applyPrescription, policyFor, POLICIES, POLICIES_FOR, POLICY_NAME, POLICY_DESC, DEFAULT_SEC_CAP, MAX_POWER_SETS } from './progression.js'
import { applyWeekMode, LIGHTER, COMP, WEEK_MODE_LINE } from './week-mode.js'
import { withWeekMode, withMatSession } from './sport.js'
import { progressionGuidance } from './progression-copy.js'
import { buildPlannedEntry } from './session-start.js'

const JUMP = '1600'      // standing long jump (power)
const CARRY = '2917'     // dumbbell farmers carry (time)
const HANG = '5055'      // dead hang (time)
const SQUAT = '0043'     // barbell full squat

// Sessions of a reps exercise: [weight, ...reps] per session, null = set never checked off.
const repsHist = (id, cfg, rows) => ({
  unit: 'kg',
  workouts: rows.map((row, i) => ({
    d: '2026-01-' + String(i + 1).padStart(2, '0'),
    entries: [{ id, target: { ...cfg, weight: row[0] }, planned: { sets: cfg.sets, reps: cfg.reps }, sets: row.slice(1).map(r => (r === null ? { w: row[0], r: 0, done: false } : { w: row[0], r, done: true })) }]
  }))
})
// Sessions of a timed exercise: [weight, goalSec, ...secondsHeld] per session. The plan (what
// the routine asks for) is `cfg`; the goal is what progression had moved the target to.
const timeHist = (id, cfg, rows) => ({
  unit: 'kg',
  workouts: rows.map((row, i) => ({
    d: '2026-01-' + String(i + 1).padStart(2, '0'),
    entries: [{ id, target: { ...cfg, sec: row[1], weight: row[0] }, planned: { sets: cfg.sets, sec: cfg.sec }, sets: row.slice(2).map(s => (s === null ? { w: row[0], sec: 0, done: false } : { w: row[0], sec: s, done: true })) }]
  }))
})

describe('the policies exist for the modes they make sense in', () => {
  it('lists power under reps and carry and grip under time, each with a name and a description', () => {
    expect(POLICIES).toEqual(expect.arrayContaining(['power', 'carry', 'grip']))
    expect(POLICIES_FOR.reps).toContain('power')
    expect(POLICIES_FOR.time).toEqual(expect.arrayContaining(['carry', 'grip']))
    expect(POLICIES_FOR.cardio).toEqual(['off'])
    for (const p of ['power', 'carry', 'grip']) { expect(POLICY_NAME[p]).toBeTruthy(); expect(POLICY_DESC[p]).toBeTruthy() }
    expect(policyFor({ id: JUMP, mode: 'reps', prog: 'power' })).toBe('power')
    expect(policyFor({ id: CARRY, mode: 'time', prog: 'carry' })).toBe('carry')
    expect(policyFor({ id: CARRY, mode: 'reps', prog: 'carry' })).toBe('off')   // a carry policy on rep work is nonsense: off
  })
})

describe('power', () => {
  const cfg = { id: JUMP, mode: 'reps', sets: 3, reps: 5, prog: 'power', weight: 0 }
  it('sets the baseline on a first session', () => {
    expect(nextPrescription({ unit: 'kg', workouts: [] }, cfg).kind).toBe('first')
  })
  it('never adds load: a clean session holds the load and counts towards an added set', () => {
    const p = nextPrescription(repsHist(JUMP, cfg, [[0, 5, 5, 5]]), cfg)
    expect(p).toMatchObject({ policy: 'power', kind: 'hold' })
    expect(p.weight).toBeUndefined()
    expect(p.why[0]).toMatch(/clean sessions/)
    const loaded = nextPrescription(repsHist(JUMP, { ...cfg, weight: 10 }, [[10, 5, 5, 5], [10, 5, 5, 5]]), { ...cfg, weight: 10 })
    expect(loaded.weight).toBe(10)
    expect(loaded.kind).toBe('hold')
  })
  it('adds a set after three clean sessions, up to the ceiling, and then hands the decision over', () => {
    const three = nextPrescription(repsHist(JUMP, cfg, [[0, 5, 5, 5], [0, 5, 5, 5], [0, 5, 5, 5]]), cfg)
    expect(three).toMatchObject({ kind: 'up', sets: 4 })
    expect(three.weight).toBeUndefined()
    // At the ceiling: holds, and the line says the load is a person's call.
    const atMax = nextPrescription(repsHist(JUMP, { ...cfg, sets: MAX_POWER_SETS }, [[0, 5, 5, 5, 5, 5], [0, 5, 5, 5, 5, 5], [0, 5, 5, 5, 5, 5]]), { ...cfg, sets: MAX_POWER_SETS })
    expect(atMax.kind).toBe('hold')
    expect(atMax.why[0]).toMatch(/never adds load/)
  })
  it('holds, and never deloads, after a short session', () => {
    const p = nextPrescription(repsHist(JUMP, cfg, [[0, 5, 5, 5], [0, 5, 5, 3], [0, 5, null, null], [0, 4, 4, 4]]), cfg)
    expect(p.kind).toBe('hold')
    expect(p.why[0]).toMatch(/speed drops/)
  })
  it('keeps an added set once it is there', () => {
    const S = repsHist(JUMP, cfg, [[0, 5, 5, 5], [0, 5, 5, 5], [0, 5, 5, 5]])
    S.workouts.push({ d: '2026-01-04', entries: [{ id: JUMP, target: { ...cfg, sets: 4, weight: 0 }, planned: { sets: 3, reps: 5 }, sets: [5, 5, 5, 5].map(r => ({ w: 0, r, done: true })) }] })
    const p = nextPrescription(S, cfg)
    expect(p.sets).toBe(4)
    const rows = applyPrescription([{ w: 0, r: 5 }, { w: 0, r: 5 }, { w: 0, r: 5 }], p)
    expect(rows).toHaveLength(4)
  })
})

describe('carry', () => {
  const cfg = { id: CARRY, mode: 'time', sets: 3, sec: 40, prog: 'carry', secMax: 60, inc: 10, weight: 0 }
  it('grows in time while under the cap', () => {
    const p = nextPrescription(timeHist(CARRY, cfg, [[24, 40, 40, 40, 40]]), cfg)
    expect(p).toMatchObject({ policy: 'carry', kind: 'up', sec: 50 })
    expect(p.weight).toBeUndefined()
  })
  it('at the cap the weight goes up and the time starts over', () => {
    const p = nextPrescription(timeHist(CARRY, cfg, [[24, 60, 60, 60, 60]]), cfg)
    expect(p).toMatchObject({ kind: 'up', sec: 40 })
    expect(p.weight).toBeGreaterThan(24)
    expect(p.why[0]).toMatch(/cap/)
  })
  it('with no weight logged, says to pick up a heavier pair instead of inventing a load', () => {
    const p = nextPrescription(timeHist(CARRY, cfg, [[0, 60, 60, 60, 60]]), cfg)
    expect(p.kind).toBe('hold')
    expect(p.weight).toBeUndefined()
    expect(p.why[0]).toMatch(/heavier pair/)
  })
  it('holds after a short carry and backs off after three', () => {
    expect(nextPrescription(timeHist(CARRY, cfg, [[24, 40, 40, 40, 25]]), cfg)).toMatchObject({ kind: 'hold', sec: 40 })
    expect(nextPrescription(timeHist(CARRY, cfg, [[24, 40, 40, 30, 25], [24, 40, 40, 30, 25], [24, 40, 40, 30, 25]]), cfg).kind).toBe('deload')
  })
  it('uses the default cap when the slot sets none', () => {
    const noCap = { ...cfg, secMax: undefined }
    expect(nextPrescription(timeHist(CARRY, noCap, [[24, 50, 50, 50, 50]]), noCap).sec).toBe(DEFAULT_SEC_CAP)
    expect(nextPrescription(timeHist(CARRY, noCap, [[24, DEFAULT_SEC_CAP, 60, 60, 60]]), noCap)).toMatchObject({ sec: 40, kind: 'up' })
  })
})

describe('grip', () => {
  const cfg = { id: HANG, mode: 'time', sets: 3, sec: 30, prog: 'grip', secMax: 60, weight: 0 }
  it('adds five seconds after a clean session, never past the cap', () => {
    expect(nextPrescription(timeHist(HANG, cfg, [[0, 30, 30, 30, 30]]), cfg)).toMatchObject({ policy: 'grip', kind: 'up', sec: 35 })
    const capped = nextPrescription(timeHist(HANG, cfg, [[0, 60, 60, 60, 60]]), cfg)
    expect(capped).toMatchObject({ kind: 'hold', sec: 60 })
    expect(capped.why[0]).toMatch(/cap/)
  })
  it('holds the target after three or more mat sessions this week, and says so', () => {
    const S = timeHist(HANG, cfg, [[0, 30, 30, 30, 30]])
    S.workouts[0].d = new Date().toISOString().slice(0, 10)
    const today = S.workouts[0].d
    let log = {}
    for (let i = 0; i < 3; i++) log = withMatSession(log, 'm' + i, { d: today, sport: 'judo', min: 60, effort: 3 })
    const p = nextPrescription({ ...S, matLog: log }, cfg)
    expect(p).toMatchObject({ kind: 'hold', sec: 30 })
    expect(p.why[0]).toMatch(/mat sessions/)
    // An unlogged mat week is not a quiet one, but it is also not a reason to hold: the target moves.
    expect(nextPrescription(S, cfg).kind).toBe('up')
    // Two sessions is not three.
    let two = {}
    for (let i = 0; i < 2; i++) two = withMatSession(two, 'm' + i, { d: today, sport: 'judo', min: 60, effort: 5 })
    expect(nextPrescription({ ...S, matLog: two }, cfg).kind).toBe('up')
  })
  it('holds after a short hold', () => {
    expect(nextPrescription(timeHist(HANG, cfg, [[0, 30, 30, 20, 15]]), cfg)).toMatchObject({ kind: 'hold', sec: 30 })
  })
})

describe('week modes over a prescription', () => {
  const lift = { id: SQUAT, mode: 'reps', sets: 3, reps: 5, prog: 'linear', weight: 100 }
  it('changes nothing in a normal week', () => {
    const S = { unit: 'kg', workouts: [] }
    const p = nextPrescription(S, lift)
    expect(applyWeekMode(S, p, lift)).toBe(p)
    expect(p.weekMode).toBeUndefined()
  })
  it('lighter: a tenth off the load, a set fewer, and the line says so in front of the engine’s own', () => {
    const S = { ...repsHist(SQUAT, lift, [[100, 5, 5, 5]]), sport: withWeekMode({ sport: { kind: 'judo' } }, 'lighter') }
    const p = nextPrescription(S, lift)
    expect(p.weekMode).toBe('lighter')
    // The engine said 105 (a 5 kg step on a leg lift); the week takes a tenth off that and snaps to the step.
    expect(p.weight).toBe(Math.round(105 * LIGHTER.load / 5) * 5)
    expect(p).toMatchObject({ sets: 2, cut: true })
    expect(p.why[0]).toBe('{0} {1}')
    expect(p.why[1]).toMatch(/^Lighter week/)
    expect(p.why[2]).toMatch(/Every rep last time/)
    expect(progressionGuidance(p)).toMatchObject({ policyLabel: 'Lighter week' })
    // Never below two sets.
    expect(applyWeekMode(S, { policy: 'off', kind: 'off' }, { ...lift, sets: 2 }).sets).toBeUndefined()
  })
  it('competition: 15 % off, two sets at most, and power work keeps its load', () => {
    const S = { unit: 'kg', workouts: [], sport: withWeekMode({ sport: { kind: 'judo' } }, 'comp') }
    const p = applyWeekMode(S, { policy: 'off', kind: 'off' }, { ...lift, sets: 4 })
    expect(p).toMatchObject({ kind: 'hold', sets: 2, cut: true, weekMode: 'comp' })
    expect(p.weight).toBe(Math.round(100 * COMP.load / 5) * 5)
    const jump = applyWeekMode(S, { policy: 'power', kind: 'hold', weight: 20, why: ['Every rep fast.'] }, { id: JUMP, mode: 'reps', sets: 3, reps: 5, prog: 'power' })
    expect(jump.weight).toBe(20)
    expect(jump.sets).toBe(2)
    expect(jump.why[1]).toMatch(/Competition week: two fast sets/)
    const hold = applyWeekMode(S, { policy: 'time', kind: 'up', sec: 45, why: ['Up.'] }, { id: HANG, mode: 'time', sets: 3, sec: 40 })
    expect(hold.sec).toBe(Math.round(45 * COMP.hold / 5) * 5)
    expect(hold.sets).toBe(2)
    // Conditioning is left alone.
    const bike = { policy: 'off', kind: 'off' }
    expect(applyWeekMode(S, bike, { id: '2138', mode: 'cardio', sets: 1, min: 10 })).toBe(bike)
    expect(WEEK_MODE_LINE.comp()).toMatch(/conditioning/i)
  })
  it('ends on its date: the day after, the engine’s own answer is back', () => {
    const sport = { kind: 'judo', weekMode: { mode: 'lighter', until: '2020-01-01' } }
    const S = { ...repsHist(SQUAT, lift, [[100, 5, 5, 5]]), sport }
    expect(nextPrescription(S, lift).weekMode).toBeUndefined()
  })
  it('builds a session with the cut sets, and only ever cuts rows nothing was logged in', () => {
    const S = { ...repsHist(SQUAT, lift, [[100, 5, 5, 5]]), sport: withWeekMode({ sport: { kind: 'judo' } }, 'lighter'), restSec: 90 }
    const built = buildPlannedEntry(S, lift, { id: 'r1', ex: [lift] })
    expect(built.sets.filter(s => !s.warmup).length).toBe(2)
    expect(built.target.sets).toBe(2)
    const rows = applyPrescription([{ w: 100, r: 5, done: true }, { w: 100, r: 5 }, { w: 100, r: 5 }], { kind: 'hold', sets: 1, cut: true, weight: 90 })
    expect(rows).toHaveLength(1)
    expect(rows[0].done).toBe(true)
    expect(rows[0].w).toBe(100)
  })
})
