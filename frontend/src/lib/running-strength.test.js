import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildRunStrength, shortStrength, strengthDays, strengthWeek, strengthProblems, RUN_STRENGTH } from './running-strength.js'
import { EXIDX } from './exercises.js'

const CATALOGUE = resolve(import.meta.dirname, '../../../catalogue')

describe('every running-strength exercise', () => {
  it('is a real catalogue entry with equipment, a still, a clip, steps and the logging mode its slot expects', () => {
    const routines = buildRunStrength()
    expect(strengthProblems(routines)).toEqual([])
    const ids = new Set(routines.flatMap(r => r.ex.map(e => e.id)))
    expect(ids.size).toBe(Object.keys(RUN_STRENGTH).length)
    for (const id of ids) {
      const ex = EXIDX[id]
      expect(ex, id).toBeTruthy()
      expect(ex.eq, id).toBeTruthy()
      expect(existsSync(resolve(CATALOGUE, 'media/still', id + '.webp')), id + ' still').toBe(true)
      expect(existsSync(resolve(CATALOGUE, 'media/clip', id + '.mp4')), id + ' clip').toBe(true)
      const json = JSON.parse(readFileSync(resolve(CATALOGUE, 'exercises', id + '.json'), 'utf8'))
      expect(json.instructions.length, id + ' steps').toBeGreaterThanOrEqual(4)
      expect(json.description, id + ' description').toBeTruthy()
    }
  })

  it('covers calves and soleus, hamstrings, glutes, quadriceps, single-leg stability and trunk', () => {
    const names = buildRunStrength().flatMap(r => r.ex.map(e => EXIDX[e.id].n))
    expect(names.filter(n => /calf/.test(n)).length).toBe(2)
    expect(names.some(n => /seated calf/.test(n))).toBe(true)
    expect(names.some(n => /romanian deadlift|nordic hamstring/.test(n))).toBe(true)
    expect(names.some(n => /hip thrust/.test(n))).toBe(true)
    expect(names.some(n => /goblet squat|split squat|step-up/.test(n))).toBe(true)
    expect(names.some(n => /single leg rdl/.test(n))).toBe(true)
    expect(names.some(n => /plank|dead bug|pallof/.test(n))).toBe(true)
    // Per-side work is marked, holds carry seconds, the rest reps.
    for (const e of buildRunStrength().flatMap(r => r.ex)) {
      if (e.mode === 'time') expect(e.sec).toBeGreaterThan(0); else expect(e.reps).toBeGreaterThan(0)
    }
  })

  it('mints fresh ids and keeps a shorter version without the accessories', () => {
    const [a1] = buildRunStrength(), [a2] = buildRunStrength()
    expect(a1.id).not.toBe(a2.id)
    expect(a1.ex).not.toBe(a2.ex)
    const short = shortStrength(a1)
    expect(short.ex.length).toBeLessThan(a1.ex.length)
    expect(short.ex.every(e => !e.optional)).toBe(true)
    expect(short.ex.length).toBeGreaterThanOrEqual(4)
  })
})

describe('placing the sessions in the week', () => {
  it('lifts on free days, never the day before the long run, as far apart as possible', () => {
    // Tue/Thu/Sun: Saturday is the eve of the long run; Monday and Friday are the pick.
    expect(strengthDays([2, 4, 0])).toEqual([1, 5])
    // Mon/Wed/Sat: Friday is out; Tuesday and Thursday or Sunday remain. Sunday–Tuesday are the widest gap.
    const d = strengthDays([1, 3, 6])
    expect(d.length).toBe(2)
    expect(d).not.toContain(5)
    for (const x of d) expect([1, 3, 6]).not.toContain(x)
    // A busy or recovery week keeps one.
    expect(strengthDays([2, 4, 0], 'busy')).toEqual([1])
    expect(strengthDays([2, 4, 0], 'recovery')).toEqual([1])
    // Running six days leaves nothing.
    expect(strengthDays([0, 1, 2, 3, 4, 5])).toEqual([6])
    expect(strengthDays([0, 1, 2, 3, 4])).toEqual([5, 6])
  })
  it('names the routine per day and shortens it in a recovery week', () => {
    expect(strengthWeek([2, 4, 0])).toEqual([{ day: 1, letter: 'A', short: false }, { day: 5, letter: 'B', short: false }])
    expect(strengthWeek([2, 4, 0], 'recovery')).toEqual([{ day: 1, letter: 'A', short: true }])
  })
})
