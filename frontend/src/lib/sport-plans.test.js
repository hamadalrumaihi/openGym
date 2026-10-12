import { describe, expect, it } from 'vitest'
import { EXIDX } from './exercises.js'
import { eqAvailable, ALL_EQUIPMENT, accessoriesOf } from './equipment.js'
import { roleModeOf, roleOf } from './exercise-roles.js'
import { modeOf } from './history.js'
import { buildSportPlan, planProblems, shortRoutine, hasShortVersion, fitRoutines, PLAN_SIZES, ACCESSORY_BUDGET } from './sport-plans.js'
import { ROLE_COPY, ROLE_IDS } from './sport-copy.js'
import { estimateMinutes, routineEquipment } from './routine-info.js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const CATALOGUE = resolve(__dirname, '../../../catalogue')
const KINDS = ['judo', 'bjj', 'both']
const LIFTING = ['new', 'returning', 'regular']
const every = fn => { for (const kind of KINDS) for (const lifting of LIFTING) for (const size of PLAN_SIZES) for (const gi of ['gi', 'nogi', 'both']) fn(buildSportPlan({ kind, gi, lifting, size }), { kind, lifting, size, gi }) }
const ids = plan => plan.routines.flatMap(r => r.ex.map(e => e.id))

describe('every template exercise', () => {
  it('is a real catalogue entry with equipment metadata, a demonstration, steps and the logging mode its slot expects', () => {
    const seen = new Set()
    every(plan => {
      expect(planProblems(plan)).toEqual([])
      for (const id of ids(plan)) {
        if (seen.has(id)) continue
        seen.add(id)
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
    expect(seen.size).toBeGreaterThan(30)
  })

  it('carries a role the copy explains, and a prescription in the right unit', () => {
    every(plan => {
      for (const r of plan.routines) for (const e of r.ex) {
        expect(ROLE_IDS, e.id).toContain(e.role)
        const copy = ROLE_COPY[e.role]()
        for (const k of ['quality', 'judo', 'bjj', 'cues', 'effort', 'progression']) expect(copy[k], `${e.role}.${k}`).toBeTruthy()
        const mode = modeOf(e)
        if (mode === 'time') { expect(e.sec).toBeGreaterThan(0); expect(e.reps).toBeUndefined() }
        else if (mode === 'cardio') { expect(e.min).toBeGreaterThan(0) }
        else { expect(e.reps).toBeGreaterThan(0); expect(e.sec).toBeUndefined(); if (e.side) expect(e.reps % 2).toBe(0) }
        if (e.repsMin) expect(e.repsMin).toBeLessThan(e.reps)
        expect(e.weight === 0 || e.weight === undefined).toBe(true)
        // A power move is never on a load-adding policy, a hold never on a rep policy.
        if (roleOf(e.id).purpose === 'power') expect(e.prog).toBe('power')
        if (mode === 'time') expect(['time', 'carry', 'grip']).toContain(e.prog)
        if (mode === 'cardio') expect(e.prog).toBe('off')
      }
    })
  })

  it('never repeats an exercise inside one routine', () => {
    every(plan => { for (const r of plan.routines) { const own = r.ex.map(e => e.id); expect(new Set(own).size).toBe(own.length) } })
  })
})

describe('plan sizes', () => {
  it('builds one, two, three sessions and an A/B loop, all as rotations', () => {
    expect(buildSportPlan({ kind: 'judo', size: 'one' }).routines.map(r => r.name)).toEqual(['Judo · Busy week'])
    expect(buildSportPlan({ kind: 'bjj', size: 'two' }).routines.map(r => r.name)).toEqual(['BJJ A', 'BJJ B'])
    expect(buildSportPlan({ kind: 'both', size: 'three' }).routines.map(r => r.name)).toEqual(['Judo + BJJ A', 'Judo + BJJ B', 'Judo + BJJ C'])
    const ab = buildSportPlan({ kind: 'judo', size: 'ab' })
    expect(ab.routines).toHaveLength(2)
    expect(ab.rotation).toEqual(ab.routines.map(r => r.id))
    expect(ab.extra).toEqual([])
    const three = buildSportPlan({ kind: 'judo', size: 'three' })
    expect(three.rotation).toHaveLength(3)
    expect(three.suggestedDays).toEqual([1, 3, 5])
    expect(buildSportPlan({ kind: 'judo', size: 'one' }).rotation).toHaveLength(1)
  })

  it('with the frequency unknown, offers A and B in the loop and C on the side', () => {
    const plan = buildSportPlan({ kind: 'bjj', size: 'ab', unknownDays: true })
    expect(plan.routines.map(r => r.name)).toEqual(['BJJ A', 'BJJ B', 'BJJ C'])
    expect(plan.rotation).toHaveLength(2)
    expect(plan.extra).toEqual([plan.routines[2].id])
  })

  it('changes nothing for an unknown sport or size', () => {
    expect(buildSportPlan({ kind: 'mma', size: 'two' })).toBeNull()
    expect(buildSportPlan({ kind: 'judo', size: 'five' })).toBeNull()
    expect(buildSportPlan()).toBeNull()
  })

  it('mints fresh ids and independent objects on every build', () => {
    const a = buildSportPlan({ kind: 'judo', size: 'two' }), b = buildSportPlan({ kind: 'judo', size: 'two' })
    expect(a.routines.map(r => r.id)).not.toEqual(b.routines.map(r => r.id))
    a.routines[0].ex[0].sets = 99
    expect(b.routines[0].ex[0].sets).not.toBe(99)
    expect(buildSportPlan({ kind: 'judo', size: 'two' }).routines[0].ex[0].sets).not.toBe(99)
  })
})

describe('the shared foundation', () => {
  const roles = r => r.ex.map(e => e.role)
  it('gives every A and B session a power move, a leg lift, a pull, a push and a carry or hinge', () => {
    every((plan, { size }) => {
      if (size === 'one') return
      const [a, b] = plan.routines
      expect(roles(a)).toEqual(expect.arrayContaining(['power_lower', 'squat', 'hpull', 'push', 'carry']))
      expect(roles(b).some(x => x === 'power_hinge' || x === 'power_rotation')).toBe(true)
      expect(roles(b)).toEqual(expect.arrayContaining(['hinge', 'unilateral', 'vpull', 'push']))
    })
  })

  it('tells gym experience from mat experience: a new lifter gets the goblet squat and push-ups, a regular the barbell', () => {
    const neu = buildSportPlan({ kind: 'judo', lifting: 'new', size: 'two' }).routines[0]
    const reg = buildSportPlan({ kind: 'judo', lifting: 'regular', size: 'two' }).routines[0]
    expect(neu.ex.find(e => e.role === 'squat').id).toBe('1760')
    expect(neu.ex.find(e => e.role === 'push').id).toBe('0662')
    expect(neu.ex.find(e => e.role === 'squat').prog).toBe('double')
    expect(reg.ex.find(e => e.role === 'squat').id).toBe('0043')
    expect(reg.ex.find(e => e.role === 'squat')).toMatchObject({ prog: 'linear', sets: 3, reps: 5 })
    expect(reg.ex.find(e => e.role === 'push').id).toBe('0025')
  })

  it('moves the emphasis with the sport and the gi, inside one accessory budget', () => {
    const judo = buildSportPlan({ kind: 'judo', size: 'two' })
    const gi = buildSportPlan({ kind: 'bjj', gi: 'gi', size: 'two' })
    const nogi = buildSportPlan({ kind: 'bjj', gi: 'nogi', size: 'two' })
    const both = buildSportPlan({ kind: 'both', size: 'two' })
    expect(roles(judo.routines[0])).toContain('grip_hang')
    expect(judo.routines[0].ex.find(e => e.role === 'grip_hang').sets).toBe(3)
    expect(judo.routines[1].ex.find(e => e.role === 'power_hinge').id).toBe('0549')
    expect(gi.routines[1].ex.find(e => e.role === 'power_rotation').id).toBe('1699')
    expect(gi.routines[1].ex.find(e => e.role === 'pull_endurance').id).toBe('1773')
    expect(nogi.routines[1].ex.find(e => e.role === 'pull_endurance').id).toBe('0499')
    for (const plan of [judo, gi, nogi, both]) for (const r of plan.routines) {
      expect(r.ex.filter(e => e.optional && e.role !== 'mobility').length).toBeLessThanOrEqual(ACCESSORY_BUDGET[plan.kind])
    }
    // "Both" is not judo's accessories plus BJJ's: its sessions are no longer than either sport's.
    for (let i = 0; i < 2; i++) expect(both.routines[i].ex.length).toBeLessThanOrEqual(Math.max(judo.routines[i].ex.length, gi.routines[i].ex.length))
  })

  it('lets a priority move its accessories to the front of the budget', () => {
    const plain = buildSportPlan({ kind: 'bjj', gi: 'nogi', size: 'two' })
    const cond = buildSportPlan({ kind: 'bjj', gi: 'nogi', size: 'two', priorities: ['conditioning'] })
    expect(roles(cond.routines[0])).toContain('cond_aerobic')
    expect(roles(cond.routines[1])).toContain('cond_intervals')
    expect(roles(plain.routines[1]).indexOf('cond_intervals')).not.toBe(roles(cond.routines[1]).indexOf('cond_intervals'))
    const power = buildSportPlan({ kind: 'judo', size: 'two', priorities: ['power'] })
    expect(power.routines[0].ex.find(e => e.role === 'power_lower').sets).toBe(4)
    const mob = buildSportPlan({ kind: 'judo', size: 'two', priorities: ['mobility'] })
    expect(mob.routines[0].ex.find(e => e.role === 'mobility').optional).toBeUndefined()
  })
})

describe('the shorter session', () => {
  it('keeps the essentials and leaves the accessories', () => {
    every((plan, { size }) => {
      for (const r of plan.routines) {
        expect(hasShortVersion(r)).toBe(true)
        const short = shortRoutine(r)
        expect(short.ex.every(e => !e.optional)).toBe(true)
        expect(short.ex.map(e => e.role)).toEqual(expect.arrayContaining(size === 'one' ? ['squat', 'hinge', 'hpull', 'push', 'carry'] : []))
        expect(short.ex.length).toBeLessThan(r.ex.length)
        // The short version is shorter, by the same estimate the Home card shows.
        const S = { restSec: 90 }
        expect(estimateMinutes(short, S)).toBeLessThan(estimateMinutes(r, S))
      }
    })
  })

  it('is about an hour or less for the standard sessions and well under for the busy-week one', () => {
    const S = { restSec: 90 }
    for (const kind of KINDS) {
      const plan = buildSportPlan({ kind, size: 'three', lifting: 'regular' })
      for (const r of plan.routines) expect(estimateMinutes(r, S)).toBeLessThanOrEqual(75)
      expect(estimateMinutes(buildSportPlan({ kind, size: 'one' }).routines[0], S)).toBeLessThanOrEqual(55)
    }
  })
})

describe('fitting a sport plan to equipment', () => {
  it('only ever uses exercises the equipment allows, or keeps an essential slot and says so', () => {
    for (const eq of [['dumbbell'], ['kettlebell'], ['barbell', 'bench', 'pull-up bar'], ['band'], []]) {
      for (const kind of KINDS) {
        const plan = buildSportPlan({ kind, size: 'three', equipment: eq, lifting: 'regular' })
        const keptIds = new Set(plan.fit.kept.map(k => k.id))
        for (const r of plan.routines) for (const e of r.ex) {
          const ok = eqAvailable(eq, EXIDX[e.id])
          if (!ok) expect(keptIds.has(e.id), `${e.id} kept without a report`).toBe(true)
          // A stand-in keeps the slot's role and is logged the way the slot says.
          expect(roleModeOf(e.id)).toBe(modeOf(e))
        }
      }
    }
  })

  it('swaps by job, not by muscle: a kettlebell gym gets kettlebell carries, swings and hinges', () => {
    const plan = buildSportPlan({ kind: 'judo', size: 'two', equipment: ['kettlebell', 'pull-up bar'], lifting: 'regular' })
    const b = plan.routines[1]
    const hinge = b.ex.find(e => e.role === 'hinge')
    expect(EXIDX[hinge.id].eq).toBe('kettlebell')
    expect(roleOf(hinge.id).pattern).toBe('hinge')
    const carry = plan.routines[0].ex.find(e => e.role === 'carry')
    expect(EXIDX[carry.id].eq).toBe('kettlebell')
    expect(roleOf(carry.id).pattern).toBe('carry')
    expect(carry.mode).toBe('time')
    expect(carry.sec).toBe(40)
    expect(plan.fit.swapped).toBeGreaterThan(0)
  })

  it('drops an optional accessory it cannot fit but never an essential one', () => {
    const plan = buildSportPlan({ kind: 'bjj', size: 'two', equipment: [], lifting: 'regular' })
    expect(plan.fit.kept.length).toBeGreaterThan(0)
    for (const k of plan.fit.kept) expect(k.routine).toMatch(/^BJJ/)
    for (const r of plan.routines) expect(r.ex.some(e => e.role === 'squat' || e.role === 'hinge')).toBe(true)
  })

  it('is deterministic', () => {
    const shape = p => p.routines.map(r => r.ex.map(e => [e.id, e.sets, e.reps, e.sec]))
    expect(shape(buildSportPlan({ kind: 'both', size: 'three', equipment: ['dumbbell'] }))).toEqual(shape(buildSportPlan({ kind: 'both', size: 'three', equipment: ['dumbbell'] })))
  })
})

describe('routine info', () => {
  it('lists the equipment a session needs, bench and bar included, most used first', () => {
    const plan = buildSportPlan({ kind: 'judo', size: 'two', lifting: 'regular' })
    const eq = routineEquipment(plan.routines[0])
    expect(eq).toContain('barbell')
    expect(eq).toContain('bench')
    expect(eq).not.toContain('body weight')
    expect(routineEquipment(plan.routines[1])).toContain('pull-up bar')
    expect(routineEquipment({ ex: [{ id: '0662' }] })).toEqual([])
  })

  it('estimates longer sessions for more sets and rest', () => {
    const r = { ex: [{ id: '0043', sets: 3, reps: 5, restSec: 180 }] }
    expect(estimateMinutes(r, {})).toBeGreaterThan(estimateMinutes({ ex: [{ id: '0043', sets: 3, reps: 5, restSec: 60 }] }, {}))
    expect(estimateMinutes({ ex: [{ id: '2138', min: 30, mode: 'cardio' }] }, {})).toBeGreaterThanOrEqual(30)
    expect(estimateMinutes({ ex: [] }, {})).toBe(5)
  })
})

describe('fitRoutines on its own', () => {
  it('reports what it kept', () => {
    const r = { name: 'X', ex: [{ id: '2917', sets: 3, sec: 40, mode: 'time', role: 'carry' }, { id: '5055', sets: 2, sec: 30, mode: 'time', role: 'grip_hang', optional: true }] }
    const fit = fitRoutines([r], [])
    expect(fit.kept).toEqual([{ routine: 'X', id: '2917' }])
    expect(fit.dropped).toBe(0)   // the hang needs only a bar, which body weight never gates
    expect(r.ex.map(e => e.id)).toEqual(['2917', '5055'])
    expect(accessoriesOf(EXIDX['5055'])).toEqual([])
  })
})
