// Road to 10K: the programme generator and the plan's bookkeeping. Pure functions over the
// `running` profile (lib/running.js); nothing here touches the store.
//
// The shape of the programme (a design call, documented in docs/dev/RUNNING.md):
//
//   - Three sessions a week on the person's days, the last of them the long one.
//   - A run/walk LADDER from one minute running / two walking up to continuous running. A build
//     week climbs one rung; every fourth week eases (same rung, less time); the last week is a
//     taper with the race (or the goal distance, run/walk allowed) on the long day. A half
//     marathon gets two tapering weeks.
//   - The long session grows by about ten per cent a week, rounded to five minutes, and never
//     past the goal's cap. The midweek sessions grow two minutes a week to a ceiling.
//   - Every session is five minutes of walking in, the work, five minutes of walking out.
//   - No mandatory speed work: the only "fast" thing in the plan is a few optional relaxed
//     pickups in race week.
//
// The plan is stored as a skeleton (one small record per week: rung, kind, minutes, reduced)
// and expanded to dated sessions on read, so a week can be repeated, skipped or reduced by
// editing the skeleton, and the session ids stay stable through renumbering (they carry the
// week's key, never its position).
import { isoOf } from './format.js'
import { runningOf, GOAL_KM, DEFAULT_DAYS, hrZones } from './running.js'

/** Run/walk rungs, seconds. The last rung is continuous running. */
export const LADDER = [
  { run: 60, walk: 120 },
  { run: 90, walk: 120 },
  { run: 120, walk: 120 },
  { run: 180, walk: 120 },
  { run: 240, walk: 120 },
  { run: 300, walk: 120 },
  { run: 480, walk: 120 },
  { run: 600, walk: 120 },
  { run: 900, walk: 90 },
  { run: 1200, walk: 60 },
  { run: 0, walk: 0 },
]
export const CONTINUOUS = LADDER.length - 1

export const GOAL_WEEKS = { '5k': 8, '10k': 10, half: 16 }
export const LONG_CAP_MIN = { '5k': 35, '10k': 65, half: 110 }
export const MID_CAP_MIN = 35
export const WARM_MIN = 5
export const COOL_MIN = 5
export const START_STAGE = { new: 0, returning: 0, base: 3 }
export const START_MID_MIN = { new: 18, returning: 20, base: 25 }
export const START_LONG_MIN = { new: 24, returning: 25, base: 30 }
export const EASE_FACTOR = { mid: 0.85, long: 0.8 }
export const REDUCE_FACTOR = 0.75
export const BUSY_FACTOR = 0.8
export const RECOVERY_FACTOR = 0.7
export const WEEK_ACTIONS = ['repeat', 'skip', 'reduce', 'restore']

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const round5 = n => Math.round(n / 5) * 5
const ceil5 = n => Math.ceil(n / 5) * 5
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const mondayOf = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d) }
const weekdayOffset = day => (day + 6) % 7   // Monday 0 … Sunday 6

/* ============================ building the skeleton ============================ */

/**
 * The skeleton for a profile: `{ weeks: [{ key, stage, kind, midMin, longMin }], nextKey }`.
 * `stage` overrides the level's starting rung (the baseline assessment hands one in).
 */
export function buildPlan({ goal = '10k', level = 'returning', stage = null } = {}) {
  const n = GOAL_WEEKS[goal] || GOAL_WEEKS['10k']
  const cap = LONG_CAP_MIN[goal] || LONG_CAP_MIN['10k']
  let rung = clamp(stage ?? START_STAGE[level] ?? 0, 0, CONTINUOUS)
  let midMin = START_MID_MIN[level] ?? START_MID_MIN.returning
  let longMin = START_LONG_MIN[level] ?? START_LONG_MIN.returning
  const weeks = []
  for (let i = 0; i < n; i++) {
    const last = i === n - 1
    const taper = !last && goal === 'half' && i === n - 2
    const ease = !last && !taper && (i + 1) % 4 === 0 && i + 3 < n
    const kind = last ? 'race' : taper ? 'taper' : ease ? 'ease' : 'build'
    weeks.push({
      key: 'k' + (i + 1), stage: rung, kind,
      midMin: kind === 'race' ? 20 : taper ? Math.round(midMin * 0.8) : ease ? Math.round(midMin * EASE_FACTOR.mid) : midMin,
      longMin: kind === 'race' ? 0 : taper ? round5(longMin * 0.6) : ease ? round5(longMin * EASE_FACTOR.long) : longMin,
    })
    if (kind === 'build') {
      rung = Math.min(CONTINUOUS, rung + 1)
      midMin = Math.min(MID_CAP_MIN, midMin + 2)
      longMin = Math.min(cap, ceil5(longMin * 1.1))
    }
  }
  return { weeks, nextKey: n + 1 }
}

/* ============================ the baseline ============================ */

/**
 * Where to start the ladder, from the runs of the last six weeks. Written against what a watch
 * summary can actually tell us: how long the longest recent run lasted, roughly how fast, and
 * how often the person ran. It cannot see walk breaks inside a run, so it never starts anyone
 * past the five-minute rung without a run that was plainly continuous. Returns the rung and
 * why, so the screen can say so.
 */
export function baselineFrom(runs, today) {
  const since = addDays(today, -42)
  const recent = (runs || []).filter(r => r.kind === 'run' && r.d >= since && r.d <= today)
  if (!recent.length) return { stage: 0, reasons: ['No runs recorded in the last six weeks: start from the first rung.'] }
  const longest = recent.reduce((a, r) => (r.sec > (a?.sec || 0) ? r : a), null)
  const pace = longest.distM >= 500 ? longest.sec / (longest.distM / 1000) : null
  const reasons = [`${recent.length} run${recent.length === 1 ? '' : 's'} in the last six weeks; the longest lasted ${Math.round(longest.sec / 60)} min.`]
  let stage = 0
  if (recent.length >= 3 && longest.sec >= 30 * 60 && pace && pace <= 8 * 60) {
    stage = 5; reasons.push('Thirty minutes at a running pace: start at the five-minute rung.')
  } else if (recent.length >= 2 && longest.sec >= 20 * 60 && pace && pace <= 9 * 60) {
    stage = 3; reasons.push('Twenty minutes at a running pace: start at the three-minute rung.')
  } else if (longest.sec >= 15 * 60) {
    stage = 1; reasons.push('Some running already: start one rung up.')
  } else reasons.push('Start from the first rung.')
  return { stage, reasons }
}

/* ============================ expanding to sessions ============================ */

const cadenceFor = (mode, mins) => Math.round(mins * (mode === 'busy' ? BUSY_FACTOR : mode === 'recovery' ? RECOVERY_FACTOR : 1))

function sessionOf(week, weekIdx, idx, day, date, running, mode) {
  const rung = LADDER[clamp(week.stage, 0, CONTINUOUS)]
  const long = idx === running.days.length - 1
  const race = week.kind === 'race' && long
  let workMin = long ? week.longMin : week.midMin
  if (week.kind === 'race' && !long) workMin = idx === 0 ? week.midMin : Math.round(week.midMin * 0.75)
  if (week.reduced) workMin = Math.round(workMin * REDUCE_FACTOR)
  if (mode && !race) workMin = cadenceFor(mode, workMin)
  const continuous = rung.run === 0
  const cycle = rung.run + rung.walk
  const reps = continuous || race ? 1 : Math.max(1, Math.floor((workMin * 60) / cycle))
  const runSec = continuous ? workMin * 60 : rung.run
  const walkSec = continuous ? 0 : rung.walk
  const actualWork = race ? null : continuous ? workMin : Math.round((reps * cycle) / 60)
  const kind = race ? 'race' : long ? 'long' : continuous ? 'easy' : 'runwalk'
  const optional = mode === 'busy' && !long && idx === running.days.length - 2
  const zones = hrZones(running.hrMax)
  const target = zones ? { hrLow: zones[1][0], hrHigh: zones[1][1], zone: 2 } : { zone: 2 }
  const s = {
    id: `${week.key}-${idx}`, weekKey: week.key, weekIdx, idx, day, date, kind,
    warmMin: WARM_MIN, coolMin: COOL_MIN, workMin: actualWork, reps, runSec, walkSec,
    totalMin: actualWork == null ? null : WARM_MIN + COOL_MIN + actualWork,
    distKm: race ? GOAL_KM[running.goal] : null,
    target, optional,
    pickups: week.kind === 'race' && !long && idx === running.days.length - 2,
  }
  return s
}

/**
 * The plan as dated weeks of sessions. `today` decides which week the week mode applies to
 * (the mode is set for seven days, so it covers the week it was chosen in).
 */
export function expandPlan(running, today = null) {
  if (!running?.plan?.weeks?.length) return []
  const days = running.days?.length ? running.days : DEFAULT_DAYS
  const r = { ...running, days }
  const monday = mondayOf(running.startDate)
  const modeFrom = running.weekMode ? addDays(running.weekMode.until, -(7 - 1)) : null
  return running.plan.weeks.map((w, i) => {
    const weekStart = addDays(monday, i * 7)
    const weekEnd = addDays(weekStart, 6)
    const mode = running.weekMode && today && running.weekMode.until >= today && weekStart <= running.weekMode.until && weekEnd >= modeFrom ? running.weekMode.mode : null
    const sessions = days
      .map((day, idx) => sessionOf(w, i, idx, day, addDays(weekStart, weekdayOffset(day)), r, mode))
      .filter(s => s.date >= running.startDate)
    return { key: w.key, n: i + 1, kind: w.kind, stage: w.stage, reduced: !!w.reduced, mode, start: weekStart, end: weekEnd, sessions }
  })
}

/** Every session of the plan in date order. */
export const allSessions = (running, today) => expandPlan(running, today).flatMap(w => w.sessions)

/** The date of the plan's last session (the race), or null. */
export function planEndDate(running) {
  const s = allSessions(running)
  return s.length ? s[s.length - 1].date : null
}

export const sessionOn = (running, iso, today = iso) => allSessions(running, today).find(s => s.date === iso) || null

/** The next planned session on or after `today` that has no state yet. */
export function nextSession(running, states, today) {
  return allSessions(running, today).find(s => s.date >= today && !states?.[s.id]) || null
}

export function upcomingSessions(running, states, today, n = 3) {
  return allSessions(running, today).filter(s => s.date >= today && !states?.[s.id]).slice(0, n)
}

/** Sessions whose day has passed with nothing recorded: not done, not skipped. */
export function missedSessions(running, states, today) {
  return allSessions(running, today).filter(s => s.date < today && !states?.[s.id])
}

/** The week that contains `iso`, or null outside the plan. */
export const weekOf = (running, iso, today = iso) => expandPlan(running, today).find(w => w.start <= iso && iso <= w.end) || null

/* ============================ week actions ============================ */

/**
 * `plan` with `action` applied to the week at `idx`: repeat (do that week again before
 * moving on), skip (drop it), reduce (three quarters of its time) or restore. The race week
 * is never skipped and a plan is never shorter than two weeks; an impossible action returns
 * the plan unchanged.
 */
export function applyWeekAction(plan, idx, action) {
  if (!plan?.weeks?.length || !WEEK_ACTIONS.includes(action) || idx < 0 || idx >= plan.weeks.length) return plan
  const weeks = plan.weeks.map(w => ({ ...w }))
  const w = weeks[idx]
  if (action === 'repeat') {
    const copy = { ...w, key: 'k' + (plan.nextKey || weeks.length + 1), reduced: false }
    if (w.kind === 'race' || w.kind === 'taper') { copy.kind = 'build'; copy.longMin = copy.longMin || round5(Math.max(25, w.midMin * 1.5)); weeks.splice(idx, 0, copy) }
    else weeks.splice(idx + 1, 0, copy)
    return { ...plan, weeks, nextKey: (plan.nextKey || weeks.length) + 1 }
  }
  if (action === 'skip') {
    if (w.kind === 'race' || weeks.length <= 2) return plan
    weeks.splice(idx, 1)
    return { ...plan, weeks }
  }
  if (action === 'reduce') { weeks[idx] = { ...w, reduced: true }; return { ...plan, weeks } }
  if (action === 'restore') { const { reduced, ...rest } = w; weeks[idx] = rest; return { ...plan, weeks } }
  return plan
}

/* ============================ matching runs to sessions ============================ */

/**
 * The planned session a recorded run most plausibly was: the session on the run's day, else one
 * the day before or after that nobody has ticked yet (a Sunday long run done on Saturday still
 * counts). Null when the plan has nothing nearby.
 */
export function matchRunToSession(sessions, states, run) {
  const free = s => !states?.[s.id]
  const same = sessions.find(s => s.date === run.d && free(s))
  if (same) return same
  const near = sessions.filter(s => free(s) && Math.abs(new Date(s.date + 'T12:00:00') - new Date(run.d + 'T12:00:00')) <= 86400000)
  return near.length ? near[0] : null
}

/**
 * The runSessions map with every imported run that is not yet tied to a session ticked onto
 * the one it matches. Pure: the caller stores the result. A run already named by a state is
 * left alone, so a manual tick is never overridden.
 */
export function autoCompletions(S, today, now = Date.now()) {
  const running = runningOf(S)
  if (!running) return S?.runSessions || {}
  const sessions = allSessions(running, today)
  let states = { ...(S.runSessions || {}) }
  const clean = Object.fromEntries(Object.entries(states).map(([k, v]) => [k, v && v.status ? v : null]).filter(([, v]) => v))
  const tied = new Set(Object.values(clean).map(v => v.runId).filter(Boolean))
  const runs = Object.entries(S.runLog || {}).map(([id, v]) => (v && v.d && v.sec ? { id, ...v } : null)).filter(Boolean).sort((a, b) => (a.d < b.d ? -1 : 1))
  for (const run of runs) {
    if (tied.has(run.id) || run.kind === 'walk') continue
    const s = matchRunToSession(sessions, clean, run)
    if (!s) continue
    const entry = { status: 'done', d: run.d, runId: run.id, ...(run.rpe ? { rpe: run.rpe } : {}), ...(run.pain != null ? { pain: run.pain } : {}), _ts: now }
    states = { ...states, [s.id]: entry }
    clean[s.id] = entry
    tied.add(run.id)
  }
  return states
}

/* ============================ words ============================ */

/** A one-line description of a session's work: "8 × (1 min run · 2 min walk)", "30 min easy run", "10K race". */
export function sessionLine(s) {
  if (!s) return ''
  if (s.kind === 'race') {
    const name = s.distKm >= 21 ? 'Half marathon' : `${s.distKm}K`
    const m = sec => (sec % 60 ? (sec / 60).toFixed(1) : String(sec / 60))
    return `${name} race${s.walkSec ? ` · run ${m(s.runSec)} min, walk ${m(s.walkSec)} min as needed` : ''}`
  }
  if (s.walkSec === 0) return `${s.workMin} min easy run`
  const r = s.runSec % 60 ? `${(s.runSec / 60).toFixed(1)}` : `${s.runSec / 60}`
  const w = s.walkSec % 60 ? `${(s.walkSec / 60).toFixed(1)}` : `${s.walkSec / 60}`
  return `${s.reps} × (${r} min run · ${w} min walk)`
}
