// A sport plan shared as a plan file keeps what each slot is for: its role, whether the shorter
// session skips it, and where a hold or a carry stops getting longer. Junk in those fields from a
// hand-edited file is dropped on the way in.
import { describe, expect, it } from 'vitest'
import { buildPlanBundle, parsePlan } from './plan-share.js'
import { buildSportPlan } from './sport-plans.js'

describe('sport plans in a plan file', () => {
  it('round-trips role, optional and secMax', () => {
    const plan = buildSportPlan({ kind: 'judo', size: 'two' })
    const S = { unit: 'kg', routines: plan.routines, week: { 1: [plan.routines[0].id] }, customEx: [] }
    const bundle = JSON.parse(JSON.stringify(buildPlanBundle(S)))
    const back = parsePlan(JSON.stringify(bundle), 'kg')
    const a = back.routines[0].ex
    expect(a.map(e => e.role)).toEqual(plan.routines[0].ex.map(e => e.role))
    expect(a.filter(e => e.optional).length).toBe(plan.routines[0].ex.filter(e => e.optional).length)
    expect(a.find(e => e.role === 'carry').secMax).toBe(60)
  })

  it('drops junk in those fields', () => {
    const raw = JSON.stringify({ opengym_plan: 1, unit: 'kg', week: {}, routines: [{ id: 'r', name: 'X', ex: [{ id: '2917', sets: 3, mode: 'time', sec: 40, role: '<script>', optional: 'yes', secMax: 1e9 }] }] })
    const [e] = parsePlan(raw, 'kg').routines[0].ex
    expect(e.role).toBeUndefined()
    expect(e.optional).toBeUndefined()
    expect(e.secMax).toBeUndefined()
  })
})
