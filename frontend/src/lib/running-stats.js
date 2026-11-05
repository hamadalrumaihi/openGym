// Running numbers for the Stats screen and the Running dashboard: weekly distance and time,
// average pace, heart-rate trend, longest run, consistency against the plan, the best recent
// 5K and 10K, progress to race day. Pure functions over the run log and the plan.
//
// Every estimate says it is one. A "5K time" from a 6 km run is the run's average pace over
// five kilometres, not a race result; the screen labels it so.
import { runsOf, runningOf, sessionStatesOf, paceSecPerKm, runAt, GOAL_KM } from './running.js'
import { allSessions, planEndDate, expandPlan } from './running-plan.js'
import { matSessionsOf } from './sport.js'
import { weekKey, todayISO } from './format.js'

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Runs (not walks) between two dates inclusive. */
export const runsBetween = (S, from, to) => runsOf(S).filter(r => r.kind === 'run' && r.d >= from && r.d <= to)

/**
 * One row per week from the first run (or the plan's first week) to `today`:
 * `{ week, distM, sec, runs, avgPaceSecKm, avgHr, longestSec }`. Empty weeks are kept, so the
 * chart shows the gaps.
 */
export function weeklyRunning(S, today = todayISO(), weeks = 12) {
  const ws = S?.weekStart === 0 ? 0 : 1
  const runs = runsOf(S).filter(r => r.kind === 'run' && r.d <= today)
  const end = weekKey(today, ws)
  const start = weekKey(addDays(end, -7 * (weeks - 1)), ws)
  const byWeek = new Map()
  for (let k = start; k <= end; k = addDays(k, 7)) byWeek.set(k, { week: k, distM: 0, sec: 0, runs: 0, hr: [], longestSec: 0 })
  for (const r of runs) {
    const k = weekKey(r.d, ws)
    const row = byWeek.get(k)
    if (!row) continue
    row.distM += r.distM || 0
    row.sec += r.sec
    row.runs += 1
    if (r.avgHr) row.hr.push(r.avgHr)
    row.longestSec = Math.max(row.longestSec, r.sec)
  }
  return [...byWeek.values()].map(({ hr, ...row }) => ({ ...row, avgPaceSecKm: paceSecPerKm(row.sec, row.distM), avgHr: hr.length ? Math.round(avg(hr)) : null }))
}

/** The longest run by time and by distance, each with its id, or null. */
export function longestRun(S) {
  const runs = runsOf(S).filter(r => r.kind === 'run')
  if (!runs.length) return null
  const byTime = runs.reduce((a, r) => (r.sec > a.sec ? r : a))
  const byDist = runs.reduce((a, r) => ((r.distM || 0) > (a.distM || 0) ? r : a))
  return { byTime, byDist }
}

/**
 * The best recent time over a distance (5000 or 10000 m), from runs at least that long:
 * `{ sec, d, id, exact }` where `exact` is true only when the run was within 2 % of the distance
 * itself; otherwise the time is the run's average pace held over the distance, an estimate.
 */
export function bestOver(S, distM, since = null) {
  const runs = runsOf(S).filter(r => r.kind === 'run' && r.distM >= distM * 0.98 && (!since || r.d >= since))
  let best = null
  for (const r of runs) {
    const pace = paceSecPerKm(r.sec, r.distM)
    if (!pace) continue
    const sec = Math.round(pace * (distM / 1000))
    if (!best || sec < best.sec) best = { sec, d: r.d, id: r.id, exact: Math.abs(r.distM - distM) <= distM * 0.02 }
  }
  return best
}

/**
 * Planned versus done: sessions whose day has passed, how many were ticked done, how many
 * skipped, how many simply missed, as counts and a share. Null without a plan.
 */
export function consistency(S, today = todayISO()) {
  const running = runningOf(S)
  if (!running?.plan) return null
  const states = sessionStatesOf(S)
  const past = allSessions(running, today).filter(s => s.date < today)
  const done = past.filter(s => states[s.id]?.status === 'done').length
  const skipped = past.filter(s => states[s.id]?.status === 'skipped').length
  const missed = past.length - done - skipped
  return { planned: past.length, done, skipped, missed, share: past.length ? done / past.length : null }
}

/** Where the plan stands: weeks done of weeks total, days to the race, the plan's own end date. */
export function raceProgress(S, today = todayISO()) {
  const running = runningOf(S)
  if (!running?.plan) return null
  const weeks = running.plan.weeks.length
  const end = planEndDate(running)
  const weeksDone = expandPlan(running, today).filter(w => w.end < today).length
  const race = running.raceDate || end
  const daysToRace = race ? Math.round((new Date(race + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000) : null
  return { weeks, weeksDone, planEnd: end, raceDate: race, daysToRace, goalKm: GOAL_KM[running.goal], overrun: !!(running.raceDate && end && end > running.raceDate) }
}

/**
 * All training in the last `days` days, side by side: runs, gym workouts, mat sessions, with
 * minutes for each. `S.workouts` is the gym log; a workout's minutes come from its clock.
 */
export function trainingMix(S, today = todayISO(), days = 28) {
  const from = addDays(today, -(days - 1))
  const runs = runsBetween(S, from, today)
  const gym = (S?.workouts || []).filter(w => w?.d >= from && w?.d <= today)
  const mat = matSessionsOf(S).filter(s => s.d >= from && s.d <= today)
  const gymMin = gym.reduce((n, w) => n + (Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start ? Math.round((w.end - w.start) / 60000) : 0), 0)
  return {
    from, to: today,
    runs: { count: runs.length, min: Math.round(runs.reduce((n, r) => n + r.sec, 0) / 60), distM: runs.reduce((n, r) => n + (r.distM || 0), 0) },
    gym: { count: gym.length, min: gymMin },
    mat: { count: mat.length, min: mat.reduce((n, s) => n + (s.min || 0), 0) },
  }
}

/** Heart-rate trend points for a chart: average HR of each run that had one, oldest first. */
export const hrTrend = S => runsOf(S).filter(r => r.kind === 'run' && r.avgHr).map(r => ({ t: runAt(r), y: r.avgHr, d: r.d }))

/** Pace trend points: average pace of each run with a distance, seconds per km, oldest first. */
export const paceTrend = S => runsOf(S).filter(r => r.kind === 'run' && paceSecPerKm(r.sec, r.distM)).map(r => ({ t: runAt(r), y: Math.round(paceSecPerKm(r.sec, r.distM)), d: r.d }))
