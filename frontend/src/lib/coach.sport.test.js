// Applying a Coach plan built as a rotation (gym days not known): the routines go into the loop
// in order, the week is left alone, and Revert puts back the loop that was there before. The
// role and short-session flag the Coach wrote travel into the routines, through add-exercise too.
import { describe, expect, it } from 'vitest'
import { applyCreatedPlan, applyChangeSet, revertLast, profileLines, lightBundle } from './coach.js'
import { queueOf } from './queue.js'
import { scheduleModeOf } from './rotation.js'

const fresh = () => ({
  unit: 'kg', routines: [{ id: 'old', name: 'Old', ex: [{ id: '0043', sets: 3, reps: 5 }] }],
  week: { 1: ['old'] }, dayPlan: {}, workouts: [], customEx: [], coach: null,
  rotation: { id: 'rot', sequence: ['old'], label: '' }, queue: { ids: ['old'], since: 1, startsOn: '2026-01-01', label: '', rotationId: 'rot' },
})
const proposal = rotation => ({
  id: 'p1', kind: 'create', summary: 's',
  bundle: {
    name: 'Judo plan', week: rotation ? {} : { 2: 'a', 4: 'b' }, ...(rotation ? { rotation: true } : {}), customEx: [],
    routines: [
      { id: 'a', name: 'Judo A', ex: [{ id: '0043', sets: 3, reps: 5, role: 'squat' }, { id: '5055', sets: 2, mode: 'time', sec: 30, prog: 'grip', role: 'grip_hang', optional: true }] },
      { id: 'b', name: 'Judo B', ex: [{ id: '1600', sets: 3, reps: 5, prog: 'power', role: 'power_lower' }] },
    ],
  },
})

describe('a rotation plan from the Coach', () => {
  it('becomes the loop, in order, with the week untouched', () => {
    const s = fresh()
    applyCreatedPlan(s, proposal(true), { schedule: true })
    const [a, b] = s.routines.slice(-2)
    expect([a.name, b.name]).toEqual(['Judo A', 'Judo B'])
    expect(queueOf(s).ids).toEqual([a.id, b.id])
    expect(s.rotation.sequence).toEqual([a.id, b.id])
    expect(scheduleModeOf(s)).toBe('rotation')
    expect(s.week).toEqual({ 1: ['old'] })
    // Role and the short-session flag travel into the routine.
    expect(a.ex[1]).toMatchObject({ role: 'grip_hang', optional: true, prog: 'grip', mode: 'time', sec: 30 })
    expect(s.coach.log.at(-1)).toMatchObject({ kind: 'create', rotation: true, scheduled: true })
    expect(lightBundle(proposal(true).bundle).rotation).toBe(true)
  })

  it('with the switch off, adds the routines and changes neither the loop nor the week', () => {
    const s = fresh()
    applyCreatedPlan(s, proposal(true), { schedule: false })
    expect(s.routines).toHaveLength(3)
    expect(queueOf(s).ids).toEqual(['old'])
    expect(s.week).toEqual({ 1: ['old'] })
  })

  it('reverts to the loop that was there before', () => {
    const s = fresh()
    applyCreatedPlan(s, proposal(true), { schedule: true })
    expect(revertLast(s)).toBe(true)
    expect(s.routines.map(r => r.id)).toEqual(['old'])
    expect(queueOf(s).ids).toEqual(['old'])
    expect(s.rotation).toEqual({ id: 'rot', sequence: ['old'], label: '' })
  })

  it('an ordinary weekly plan still sets the week and leaves the loop alone', () => {
    const s = fresh()
    applyCreatedPlan(s, proposal(false), { schedule: true })
    const [a, b] = s.routines.slice(-2)
    expect(s.week[2]).toEqual([a.id])
    expect(s.week[4]).toEqual([b.id])
    expect(s.rotation.sequence).toEqual(['old'])
  })
})

describe('the review path', () => {
  it('add-exercise carries the role and the short-session flag', () => {
    const s = fresh()
    applyChangeSet(s, { id: 'p2', changes: [{ id: 'c1', type: 'add-exercise', target: { routineId: 'old' }, after: { id: '2917', sets: 3, mode: 'time', sec: 40, prog: 'carry', role: 'carry', optional: true }, why: 'x' }] }, ['c1'])
    expect(s.routines[0].ex[1]).toMatchObject({ id: '2917', mode: 'time', sec: 40, prog: 'carry', role: 'carry', optional: true })
  })
})

describe('the intake as the chat shows it', () => {
  it('names the sport, the mat count or that it is unknown, the rotation and the competition', () => {
    expect(profileLines({ goal: 'strength', experience: 'new', sport: 'bjj', gi: 'nogi', matPerWeek: 3, compDate: '2026-12-05', priorities: ['grip', 'power'] }))
      .toEqual(['Get stronger', 'New to lifting', 'BJJ · No-gi', '3 mat sessions a week', 'Competition: 2026-12-05', 'Lean on: Grip, Explosive power'])
    expect(profileLines({ goal: 'strength', sport: 'judo', matPerWeek: null, gymDaysUnknown: true }))
      .toEqual(['Get stronger', 'Judo', 'Mat schedule: not sure / irregular', 'Gym days: not sure, A/B rotation'])
  })
})
