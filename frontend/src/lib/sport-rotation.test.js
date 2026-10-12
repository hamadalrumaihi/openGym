// The A/B loop a sport plan runs on (lib/rotation.js), walked through an irregular month: the next
// session is always the next one, a missed week neither restarts the loop nor adds catch-up work,
// and a third session on a good week is just a session — it never moves the loop.
import { describe, expect, it } from 'vitest'
import { saveRotation, refillAfter } from './rotation.js'
import { queueView } from './queue.js'
import { effectiveRoutineIds } from './history.js'
import { buildSportPlan } from './sport-plans.js'

function setup() {
  const plan = buildSportPlan({ kind: 'both', size: 'ab', unknownDays: true })
  const s = { routines: plan.routines, week: {}, dayPlan: {}, workouts: [], rotation: null, queue: null }
  saveRotation(s, plan.rotation, '', '2026-10-01', new Date('2026-10-01T08:00:00').getTime())
  const [A, B, C] = plan.routines
  return { s, A, B, C }
}
// A finished workout on `iso`, the way finishWorkout writes it, then the refill finishWorkout runs.
function train(s, routine, iso) {
  const start = new Date(iso + 'T18:00:00').getTime()
  const w = { id: 'w' + iso + routine.id, d: iso, start, end: start + 3600e3, name: routine.name, routineIds: [routine.id], entries: [] }
  s.workouts.push(w)
  refillAfter(s, w, iso, start + 3600e3)
}
const next = (s, iso) => queueView(s, iso).items.find(i => i.state === 'next')?.id
const all = (s, iso) => queueView(s, iso).items.map(i => i.state)

describe('the A/B loop through an irregular month', () => {
  it('always offers the next session, never a catch-up, and never restarts', () => {
    const { s, A, B, C } = setup()
    expect(next(s, '2026-10-01')).toBe(A.id)
    expect(effectiveRoutineIds(s, '2026-10-01', '2026-10-01')).toEqual([A.id])

    train(s, A, '2026-10-01')                        // Thursday
    expect(next(s, '2026-10-02')).toBe(B.id)

    // Ten days with no gym at all: B is still simply next, A is not owed again, nothing doubles.
    expect(next(s, '2026-10-12')).toBe(B.id)
    expect(all(s, '2026-10-12')).toEqual(['done', 'next'])
    expect(queueView(s, '2026-10-12').items).toHaveLength(2)

    train(s, B, '2026-10-12')
    // The pass is complete and the loop refills itself from the day after: A comes round again.
    expect(next(s, '2026-10-13')).toBe(A.id)
    expect(all(s, '2026-10-13')).toEqual(['next', 'later'])

    // A good week: A, then the optional C (not in the loop), then B.
    train(s, A, '2026-10-13')
    train(s, C, '2026-10-14')
    expect(next(s, '2026-10-15')).toBe(B.id)          // C did not move the loop
    train(s, B, '2026-10-16')
    expect(next(s, '2026-10-17')).toBe(A.id)
  })

  it('two sessions on one day still advance one at a time', () => {
    const { s, A, B } = setup()
    train(s, A, '2026-10-01')
    train(s, B, '2026-10-01')
    expect(next(s, '2026-10-02')).toBe(A.id)
    expect(queueView(s, '2026-10-02').items.every(i => i.state !== 'done')).toBe(true)
  })
})
