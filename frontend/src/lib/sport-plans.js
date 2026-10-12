// The sport templates: gym sessions for judo, Brazilian jiu-jitsu, or both.
//
// Training data only, like lib/starter.js: names and blurbs live in lib/sport-copy.js as t()
// literals. What is here is which exercise fills which SLOT, at which prescription, for whom.
//
// The shape every plan is cut from (the "foundation"):
//   a power move · a squat or single-leg lift · a hinge · a pull · a push · a loaded carry
//   · trunk stability · grip · conditioning · a warm-up drill
// The sport only moves the emphasis: judo leans on grip endurance, fast force and single-leg
// strength; BJJ on pulling endurance, hips and trunk, grip suited to gi or no-gi, and
// conditioning. "Both" shares the foundation and spends ONE accessory budget, not two.
//
// What the research says and what is a programme-design call are kept apart (sport-copy.js
// names the sources). The research: grappling is repeated high-intensity effort with short
// rests; strength and power show in the decisive actions; grip endurance matters more than
// peak grip; strength work and intervals feature in the judo protocols that improved
// performance; strength is kept on as little as one session a week when the intensity stays
// up. The judgement calls — which lift, how many sets, which day — are ours, and every one of
// them is a starting template the person is expected to edit, not an assessment of anyone's
// recovery.
//
// Every exercise id below was checked against the catalogue: a real entry with equipment,
// a demonstration, steps and the logging mode the slot expects (sport-plans.test.js pins it).
import { uid } from './format.js'
import { EXIDX } from './exercises.js'
import { fitSlot } from './substitute.js'
import { roleModeOf } from './exercise-roles.js'

export const PLAN_SIZES = ['one', 'two', 'three', 'ab']
export const SPORT_LABEL = { judo: 'Judo', bjj: 'BJJ', both: 'Judo + BJJ' }

/* ---------- prescriptions ----------
   `rest` is seconds between sets (cfg.restSec). Weights start at 0 everywhere: history and the
   progression engine decide the load from the first session on. */
const REPS = (id, sets, reps, { repsMin, prog = 'double', rest = 120, side, repsMax, role, optional, inc } = {}) => ({
  id, sets, reps, weight: 0, mode: 'reps', prog, restSec: rest,
  ...(repsMin ? { repsMin } : {}), ...(repsMax ? { repsMax } : {}), ...(side ? { side: true } : {}),
  ...(inc ? { inc } : {}), role, ...(optional ? { optional: true } : {}),
})
const HOLD = (id, sets, sec, { prog = 'time', rest = 60, side, role, optional, secMax } = {}) => ({
  id, sets, sec, weight: 0, mode: 'time', prog, restSec: rest,
  ...(side ? { side: true } : {}), ...(secMax ? { secMax } : {}), role, ...(optional ? { optional: true } : {}),
})
const CARDIO = (id, min, { speed = 8, role, optional } = {}) => ({ id, sets: 1, min, speed, mode: 'cardio', prog: 'off', role, ...(optional ? { optional: true } : {}) })

// Main lifts by lifting experience — the gym experience, never the mat experience. New lifters
// get the dumbbell or bodyweight version and a rep range; regulars the barbell and a 3 × 5.
const pick = (lifting, { new: n, returning: r, regular: g }) => (lifting === 'regular' ? g : lifting === 'returning' ? (r || g) : n)
const MAIN = (lifting, ids, { sets = 3 } = {}) => {
  const id = pick(lifting, ids)
  return lifting === 'regular'
    ? REPS(id, sets, 5, { prog: 'linear', rest: 180, role: null })
    : REPS(id, sets, 8, { repsMin: 6, rest: 150, role: null })
}

/* ---------- the sessions ----------
   Each is a function of the context: { kind, gi, lifting, priorities }. Accessories carry
   `optional: true`: the short session leaves them out, and "both" spends a budget across them. */
const ctxOf = ({ kind, gi, lifting, priorities }) => ({
  kind, gi: kind === 'judo' ? 'gi' : gi || 'both', lifting: lifting || 'new', priorities: priorities || [],
  judo: kind === 'judo' || kind === 'both', bjj: kind === 'bjj' || kind === 'both',
})
const powerSets = c => (c.priorities.includes('power') ? 4 : c.lifting === 'new' ? 2 : 3)
const legSets = c => (c.priorities.includes('legs') ? 4 : 3)

function sessionA(c) {
  const ex = [
    { ...REPS('2569', 2, 16, { prog: 'off', rest: 30, side: true, role: 'mobility', optional: !c.priorities.includes('mobility') }) },
    REPS(c.kind === 'bjj' ? '0514' : '1600', powerSets(c), 5, { prog: 'power', rest: 120, role: 'power_lower' }),
    { ...MAIN(c.lifting, { new: '1760', returning: '0043', regular: '0043' }, { sets: legSets(c) }), role: 'squat' },
    c.lifting === 'regular'
      ? REPS('0027', 3, 10, { repsMin: 6, rest: 120, role: 'hpull' })
      : REPS('2393', 3, 20, { repsMin: 12, rest: 120, side: true, role: 'hpull' }),
    c.lifting === 'new'
      ? REPS('0662', 3, 8, { repsMin: 6, repsMax: 15, rest: 90, role: 'push' })
      : REPS(pick(c.lifting, { returning: '0289', regular: '0025' }), 3, 8, { repsMin: 6, rest: 150, role: 'push' }),
    HOLD('2917', 3, 40, { prog: 'carry', rest: 90, role: 'carry', secMax: 60 }),
  ]
  const acc = [
    HOLD('1202', 3, 30, { side: true, role: 'trunk_anti', optional: true, secMax: 60 }),
    HOLD('5055', c.judo ? 3 : 2, 30, { prog: 'grip', role: 'grip_hang', optional: true, secMax: 60 }),
    CARDIO('2138', 10, { role: 'cond_aerobic', optional: true }),
  ]
  return { ex, acc }
}

function sessionB(c) {
  const ex = [
    REPS('1471', 2, 6, { prog: 'off', rest: 30, role: 'mobility', optional: !c.priorities.includes('mobility') }),
    c.kind === 'bjj'
      ? REPS('1699', powerSets(c), 12, { prog: 'power', rest: 90, side: true, role: 'power_rotation' })
      : REPS('0549', powerSets(c), 8, { prog: 'power', rest: 120, role: 'power_hinge' }),
    { ...MAIN(c.lifting, { new: '1459', returning: '0085', regular: '0811' }), role: 'hinge' },
    REPS('2290', legSets(c), 16, { repsMin: 12, rest: 120, side: true, role: 'unilateral' }),
    c.lifting === 'new'
      ? REPS('2330', 3, 12, { repsMin: 8, rest: 120, role: 'vpull' })
      : c.lifting === 'returning'
        ? REPS('0017', 3, 10, { repsMin: 6, rest: 120, role: 'vpull' })
        : REPS('0652', 3, 8, { repsMin: 5, repsMax: 10, rest: 150, role: 'vpull' }),
    REPS(c.lifting === 'regular' ? '1162' : '0405', 3, 10, { repsMin: 6, rest: 120, role: 'push' }),
  ]
  const acc = [
    HOLD('0715', 3, 30, { side: true, role: 'trunk_lateral', optional: true, secMax: 60 }),
    c.gi === 'nogi'
      ? REPS('0499', 2, 15, { repsMin: 12, repsMax: 20, rest: 75, role: 'pull_endurance', optional: true })
      : REPS('1773', 2, 20, { repsMin: 16, repsMax: 24, rest: 75, side: true, role: 'pull_endurance', optional: true }),
    CARDIO('3893', 8, { role: 'cond_intervals', optional: true }),
  ]
  return { ex, acc }
}

function sessionC(c) {
  const ex = [
    REPS('4633', 2, 10, { prog: 'off', rest: 30, side: true, role: 'mobility', optional: !c.priorities.includes('mobility') }),
    c.kind === 'bjj'
      ? REPS('1302', powerSets(c), 5, { prog: 'power', rest: 120, role: 'power_upper' })
      : REPS('1700', powerSets(c), 5, { prog: 'power', rest: 120, role: 'power_upper' }),
    c.lifting === 'regular'
      ? REPS('0042', legSets(c), 6, { repsMin: 4, rest: 180, role: 'squat' })
      : REPS('0431', legSets(c), 16, { repsMin: 12, rest: 120, side: true, role: 'unilateral' }),
    REPS(c.lifting === 'new' ? '4742' : '1060', 3, 12, { repsMin: 8, rest: 120, role: 'hinge' }),
    REPS('9698', 3, 12, { repsMin: 8, rest: 120, role: 'hpull' }),
    HOLD('2910', 3, 30, { prog: 'carry', rest: 90, side: true, role: 'carry', secMax: 45 }),
  ]
  const acc = [
    c.lifting === 'new'
      ? REPS('0276', 3, 16, { repsMin: 10, repsMax: 20, rest: 60, side: true, role: 'trunk_flex', optional: true })
      : REPS('9819', 3, 8, { repsMin: 6, repsMax: 15, rest: 75, role: 'trunk_flex', optional: true }),
    HOLD('4983', 3, 20, { prog: 'grip', role: 'grip_iso', optional: true, secMax: 40 }),
    REPS('7746', 2, 5, { repsMin: 3, repsMax: 8, rest: 90, role: 'hinge', optional: true }),
    REPS('10780', 2, 10, { prog: 'off', rest: 45, role: 'neck', optional: true }),
    REPS('10781', 2, 10, { prog: 'off', rest: 45, role: 'neck', optional: true }),
    CARDIO('1161', 12, { role: 'cond_aerobic', optional: true }),
  ]
  return { ex, acc }
}

// The busy-week session: the essentials in under an hour. Enough to keep strength while the
// mat gets most of the week, which is what the maintenance research supports for one session
// at a kept-up intensity; it is not a programme to get much stronger on.
function sessionOne(c) {
  const ex = [
    REPS('1600', 2, 4, { prog: 'power', rest: 120, role: 'power_lower' }),
    { ...MAIN(c.lifting, { new: '1760', returning: '0043', regular: '0043' }), role: 'squat' },
    REPS(pick(c.lifting, { new: '1459', returning: '0085', regular: '0085' }), 2, 8, { repsMin: 6, rest: 150, role: 'hinge' }),
    REPS('2393', 3, 20, { repsMin: 12, rest: 90, side: true, role: 'hpull' }),
    c.lifting === 'new'
      ? REPS('0662', 2, 10, { repsMin: 6, repsMax: 15, rest: 90, role: 'push' })
      : REPS('0289', 2, 8, { repsMin: 6, rest: 120, role: 'push' }),
    HOLD('2917', 2, 40, { prog: 'carry', rest: 90, role: 'carry', secMax: 60 }),
  ]
  const acc = [
    HOLD('5055', 2, 30, { prog: 'grip', role: 'grip_hang', optional: true, secMax: 60 }),
    HOLD('0979', 2, 30, { side: true, role: 'trunk_anti', optional: true, secMax: 60 }),
  ]
  return { ex, acc }
}

/* ---------- the accessory budget ----------
   Order of preference by sport, then the person's own priorities move theirs to the front. One
   budget per session: "both" never gets judo's accessories AND BJJ's on top of the foundation. */
const SPORT_ORDER = {
  judo: ['grip_hang', 'grip_iso', 'trunk_anti', 'trunk_lateral', 'pull_endurance', 'cond_intervals', 'trunk_flex', 'neck', 'cond_aerobic', 'hinge'],
  bjj: ['pull_endurance', 'trunk_lateral', 'trunk_anti', 'cond_intervals', 'grip_hang', 'trunk_flex', 'cond_aerobic', 'grip_iso', 'neck', 'hinge'],
  both: ['grip_hang', 'pull_endurance', 'trunk_anti', 'trunk_lateral', 'cond_intervals', 'grip_iso', 'trunk_flex', 'cond_aerobic', 'neck', 'hinge'],
}
const PRIORITY_ROLES = {
  grip: ['grip_hang', 'grip_iso'], pull: ['pull_endurance'], trunk: ['trunk_anti', 'trunk_lateral', 'trunk_flex'],
  conditioning: ['cond_intervals', 'cond_aerobic'], power: [], legs: ['hinge'], mobility: [],
}
export const ACCESSORY_BUDGET = { judo: 3, bjj: 3, both: 3 }

function chooseAccessories(c, acc) {
  const order = [...c.priorities.flatMap(p => PRIORITY_ROLES[p] || []), ...SPORT_ORDER[c.kind]]
  const rank = role => { const i = order.indexOf(role); return i < 0 ? order.length : i }
  const sorted = acc.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e.role) - rank(b.e.role) || a.i - b.i).map(x => x.e)
  // Neck work comes as a pair; a budget that takes one takes both.
  const out = []
  for (const e of sorted) {
    if (out.length >= ACCESSORY_BUDGET[c.kind] && !(e.role === 'neck' && out.some(x => x.role === 'neck'))) continue
    out.push(e)
  }
  return out
}

const GLYPH = { A: 'figureStrength', B: 'kettlebell', C: 'bolt', One: 'timer' }
const build = (c, letter, session) => {
  const { ex, acc } = session(c)
  const name = letter === 'One' ? `${SPORT_LABEL[c.kind]} · Busy week` : `${SPORT_LABEL[c.kind]} ${letter}`
  // A new lifter's routine progresses by double progression unless an exercise says otherwise;
  // the regular's main lifts carry `linear` on the exercise itself.
  return { id: uid(), name, emoji: GLYPH[letter], prog: 'double', ex: [...ex, ...chooseAccessories(c, acc)].map(e => ({ ...e })) }
}

/* ---------- the plan ----------
   size: 'one' | 'two' | 'three' | 'ab'. Every size runs as a rotation (lib/rotation.js): the
   next session is simply the next one, a missed week is not caught up, nothing restarts. 'ab'
   is two sessions with no weekly target at all; 'two' is the same two with a suggested pair of
   weekdays for people who want them; 'three' adds C to the loop; 'one' is the one session,
   repeated. With `unknownDays`, C is built too but left out of the loop: the optional third
   session, there for a good week. */
export function buildSportPlan({ kind, gi, lifting, size = 'ab', priorities, equipment = null, unknownDays = false } = {}) {
  if (!SPORT_LABEL[kind] || !PLAN_SIZES.includes(size)) return null
  const c = ctxOf({ kind, gi, lifting, priorities })
  const routines = size === 'one' ? [build(c, 'One', sessionOne)]
    : [build(c, 'A', sessionA), build(c, 'B', sessionB), ...(size === 'three' || unknownDays ? [build(c, 'C', sessionC)] : [])]
  const loop = size === 'three' ? routines.map(r => r.id) : routines.slice(0, size === 'one' ? 1 : 2).map(r => r.id)
  const extra = routines.filter(r => !loop.includes(r.id)).map(r => r.id)
  const fit = equipment ? fitRoutines(routines, equipment) : null
  return {
    kind, size, routines, rotation: loop, extra,
    // Suggested weekdays for someone who would rather have a fixed week. DAYN index: 1 Monday.
    suggestedDays: size === 'one' ? [3] : size === 'three' ? [1, 3, 5] : [1, 4],
    ...(fit ? { fit } : {}),
  }
}

/**
 * Refit every routine to an equipment list (lib/substitute.js fitSlot), in place. An essential
 * exercise with no stand-in STAYS, and is reported, so the person can swap it by hand or tick
 * the equipment: dropping a squat because the rack is not ticked would quietly remove the
 * category the session is built around. An optional accessory with no stand-in is dropped.
 */
export function fitRoutines(routines, equipment) {
  let swapped = 0, dropped = 0
  const kept = []
  for (const r of routines) {
    const taken = new Set(r.ex.map(e => e.id))
    const out = []
    for (const e of r.ex) {
      const res = fitSlot(e, equipment, taken)
      if (res.cfg) { if (res.swapped) swapped++; out.push(res.cfg); continue }
      if (e.optional) { dropped++; continue }
      kept.push({ routine: r.name, id: e.id })
      out.push(e)
    }
    r.ex = out
  }
  return { swapped, dropped, kept }
}

/** The routine without its optional accessories — the shorter session that keeps the essentials. */
export const shortRoutine = r => ({ ...r, ex: (r.ex || []).filter(e => !e.optional) })
export const hasShortVersion = r => (r?.ex || []).some(e => e.optional) && (r.ex || []).some(e => !e.optional)

/** A sanity check the tests and the chooser share: every exercise is real and logged the way its slot expects. */
export function planProblems(plan) {
  const out = []
  for (const r of plan?.routines || []) {
    for (const e of r.ex) {
      const ex = EXIDX[e.id]
      if (!ex) { out.push(`${r.name}: ${e.id} is not in the catalogue`); continue }
      const want = e.mode || 'reps'
      const have = roleModeOf(ex)
      if (want !== have && !(want === 'reps' && have === 'reps')) out.push(`${r.name}: ${ex.n} is logged by ${have}, the slot says ${want}`)
    }
  }
  return out
}
