// Two optional strength sessions for a runner, cut like the sport plans (lib/sport-plans.js):
// training data only, every exercise a real catalogue entry with a demonstration and steps
// (running-strength.test.js pins it), prescriptions in the unit the slot is logged in.
//
// What the sessions train, and why (design calls, see docs/dev/RUNNING.md):
//   calves and soleus   the muscles that take the most of every stride; the seated raise is the
//                       soleus, the standing raise the gastrocnemius
//   hamstrings          the Romanian deadlift and the Nordic curl
//   glutes              the hip thrust and the single-leg bridge
//   quadriceps          the goblet squat, the split squat and the step-up
//   single-leg stability the step-up, the split squat and the single-leg Romanian deadlift
//   trunk               the side plank, the dead bug, the Pallof press
//
// Where they go: on the days between runs, never the day before the long run. With runs on
// Tuesday, Thursday and Sunday that is Monday and Friday; the chooser works from whatever days
// the plan has. Busy week: one session (A). Recovery week: one session with the accessories off.
import { uid } from './format.js'
import { EXIDX } from './exercises.js'
import { roleModeOf } from './exercise-roles.js'

const REPS = (id, sets, reps, { repsMin, rest = 90, side, role, optional, prog = 'double' } = {}) => ({
  id, sets, reps, weight: 0, mode: 'reps', prog, restSec: rest,
  ...(repsMin ? { repsMin } : {}), ...(side ? { side: true } : {}), role, ...(optional ? { optional: true } : {}),
})
const HOLD = (id, sets, sec, { rest = 45, side, role, optional, secMax } = {}) => ({
  id, sets, sec, weight: 0, mode: 'time', prog: 'time', restSec: rest,
  ...(side ? { side: true } : {}), ...(secMax ? { secMax } : {}), role, ...(optional ? { optional: true } : {}),
})

/* The exercises, by catalogue id (checked by the test). */
export const RUN_STRENGTH = {
  gobletSquat: '1760', splitSquat: '2290', stepUp: '0431',
  rdl: '1459', singleLegRdl: '4971', nordic: '7746',
  hipThrust: '4742',
  standingCalf: '1373', seatedCalf: '1379',
  sidePlank: '0715', deadBug: '0276', pallof: '0979', hipAbduction: '4031',
}

const sessionA = () => [
  REPS(RUN_STRENGTH.gobletSquat, 3, 10, { repsMin: 8, rest: 120, role: 'squat' }),
  REPS(RUN_STRENGTH.rdl, 3, 8, { repsMin: 6, rest: 120, role: 'hinge' }),
  REPS(RUN_STRENGTH.standingCalf, 3, 15, { repsMin: 12, rest: 60, role: 'calves' }),
  REPS(RUN_STRENGTH.seatedCalf, 3, 12, { repsMin: 10, rest: 60, role: 'calves' }),
  HOLD(RUN_STRENGTH.sidePlank, 3, 30, { side: true, role: 'trunk', optional: true, secMax: 60 }),
  REPS(RUN_STRENGTH.deadBug, 3, 10, { repsMin: 8, rest: 45, role: 'trunk', optional: true }),
]
const sessionB = () => [
  REPS(RUN_STRENGTH.stepUp, 3, 16, { repsMin: 12, side: true, rest: 90, role: 'unilateral' }),
  REPS(RUN_STRENGTH.splitSquat, 3, 16, { repsMin: 12, side: true, rest: 120, role: 'unilateral' }),
  REPS(RUN_STRENGTH.hipThrust, 3, 10, { repsMin: 8, rest: 120, role: 'hinge' }),
  REPS(RUN_STRENGTH.nordic, 3, 5, { repsMin: 3, rest: 120, role: 'hinge', prog: 'double' }),
  REPS(RUN_STRENGTH.singleLegRdl, 3, 16, { repsMin: 12, side: true, rest: 60, role: 'unilateral', optional: true }),
  HOLD(RUN_STRENGTH.pallof, 3, 20, { side: true, role: 'antirotation', optional: true, secMax: 40 }),
  REPS(RUN_STRENGTH.hipAbduction, 2, 15, { repsMin: 12, rest: 45, role: 'unilateral', optional: true }),
]

/**
 * The two routines, fresh ids each build. `prog: 'double'` on the routine: a new rep range is
 * met before the load moves, the gentlest of the engine's rules.
 */
export function buildRunStrength() {
  const mk = (letter, ex, emoji) => ({ id: uid(), name: `Run strength ${letter}`, emoji, prog: 'double', ex: ex.map(e => ({ ...e })) })
  return [mk('A', sessionA(), 'figureStrength'), mk('B', sessionB(), 'legs')]
}

/** The shorter version: essentials only. */
export const shortStrength = r => ({ ...r, ex: (r.ex || []).filter(e => !e.optional) })

/**
 * Which weekdays to lift on, given the run days (0 Sunday … 6 Saturday, the last one the long
 * day): the free days, never the one before the long run, spread as far from each other as the
 * week allows, at most two. Busy or recovery weeks keep one.
 */
export function strengthDays(runDays, mode = null) {
  const days = Array.isArray(runDays) && runDays.length ? runDays : [2, 4, 0]
  const longDay = days[days.length - 1]
  const eve = (longDay + 6) % 7
  const free = [0, 1, 2, 3, 4, 5, 6].filter(d => !days.includes(d) && d !== eve)
  if (!free.length) return []
  const want = mode ? 1 : 2
  if (free.length <= want) return free
  // Pick the pair with the largest gap round the week; Monday first when it is free.
  let best = null
  for (const a of free) for (const b of free) {
    if (a >= b) continue
    const gap = Math.min(b - a, 7 - (b - a))
    if (!best || gap > best.gap) best = { a, b, gap }
  }
  const pair = [best.a, best.b].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7))   // Monday-first order
  return want === 1 ? [pair[0]] : pair
}

/** Which routine goes on which day this week, as [{ day, letter }], honouring the mode. */
export function strengthWeek(runDays, mode = null) {
  const days = strengthDays(runDays, mode)
  return days.map((day, i) => ({ day, letter: i === 0 ? 'A' : 'B', short: mode === 'recovery' }))
}

/** The same check the sport plans run: every exercise real and logged the way its slot expects. */
export function strengthProblems(routines) {
  const out = []
  for (const r of routines || []) {
    for (const e of r.ex) {
      const ex = EXIDX[e.id]
      if (!ex) { out.push(`${r.name}: ${e.id} is not in the catalogue`); continue }
      const want = e.mode || 'reps'
      const have = roleModeOf(ex)
      if (want !== have) out.push(`${r.name}: ${ex.n} is logged by ${have}, the slot says ${want}`)
    }
  }
  return out
}
