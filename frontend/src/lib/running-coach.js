// The running coach: plain rules over what was planned, what was run and what the person
// reported, each answer naming its reasons. It never diagnoses, never predicts recovery, and
// never changes the plan on its own: a substantial change (repeat or reduce a week, move the
// race) is a proposal the person approves on the Running screen; a small one (make today's
// run easier, rest today) is advice.
//
// Inputs it reads from S: the running profile and plan (lib/running.js, lib/running-plan.js),
// the run log and session states, the mat log and the readiness check-in (lib/sport.js). The
// thresholds below are design calls, documented in docs/dev/RUNNING.md, not evidence.
import { runningOf, runsOf, sessionStatesOf, hrZoneOf } from './running.js'
import { expandPlan, allSessions, missedSessions, nextSession, weekOf } from './running-plan.js'
import { matWeekOf, readinessAdvice } from './sport.js'
import { todayISO } from './format.js'

export const HARD_RPE = 8           // an easy session that felt this hard was too much
export const PAIN_STOP = 2          // "it hurt" or worse
export const SHORT_FRACTION = 0.8   // a run under this share of the planned time was cut short
export const EASY_RPE = 6           // sessions at or under this, with no pain, count as going well
export const HARD_MAT_SESSIONS = 3  // this many hard mat sessions in seven days is a heavy week

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)

/**
 * How one planned session went, given the run that was recorded for it (if any) and what the
 * person reported. `{ verdict, reasons }`, verdict one of completed · short · hard · pain ·
 * missed · skipped.
 */
export function evaluateRun(session, run, state, hrMax = null) {
  const reasons = []
  if (!state && !run) return { verdict: 'missed', reasons: ['Nothing was recorded for this session.'] }
  if (state?.status === 'skipped') return { verdict: 'skipped', reasons: ['Skipped on purpose.'] }
  const pain = state?.pain ?? run?.pain ?? null
  const rpe = state?.rpe ?? run?.rpe ?? null
  if (pain != null && pain >= PAIN_STOP) {
    reasons.push(pain >= 3 ? 'You had to stop because something hurt.' : 'You reported pain during the run.')
    return { verdict: 'pain', reasons }
  }
  let verdict = 'completed'
  if (run && session?.totalMin && run.sec < session.totalMin * 60 * SHORT_FRACTION) {
    verdict = 'short'
    reasons.push(`The run lasted ${Math.round(run.sec / 60)} min of the ${session.totalMin} planned.`)
  }
  if (rpe != null && rpe >= HARD_RPE && session?.kind !== 'race') {
    verdict = 'hard'
    reasons.push(`It felt ${rpe}/10, hard for an easy session.`)
  }
  if (run?.avgHr && hrMax && session?.kind !== 'race') {
    const z = hrZoneOf(run.avgHr, hrMax)
    if (z >= 4) { verdict = verdict === 'completed' ? 'hard' : verdict; reasons.push(`Average heart rate ${run.avgHr} bpm sat in zone ${z}; easy running is zone 2.`) }
  }
  if (verdict === 'completed') reasons.push(rpe != null ? `Completed, felt ${rpe}/10.` : 'Completed.')
  return { verdict, reasons }
}

/** Every session up to `today` with its verdict, oldest first. */
export function sessionReview(S, today = todayISO()) {
  const running = runningOf(S)
  if (!running) return []
  const states = sessionStatesOf(S)
  const runs = runsOf(S)
  const byId = Object.fromEntries(runs.map(r => [r.id, r]))
  return allSessions(running, today).filter(s => s.date <= today).map(s => {
    const st = states[s.id] || null
    const run = st?.runId ? byId[st.runId] || null : null
    return { session: s, state: st, run, ...evaluateRun(s, run, st, running.hrMax) }
  })
}

/**
 * What to do next, in one of these kinds, with the reasons spelled out:
 *   rest          pain was reported in the last week; take today off and see how it feels
 *   easier        a poor check-in or a heavy mat week; make today's session shorter
 *   repeat-week   two or more sessions of the last week were missed (substantial)
 *   reduce-week   the last week's running was too demanding (substantial)
 *   reschedule    one session this week was missed and a free day remains
 *   advance       the last three sessions went well; keep climbing
 *   keep          nothing to change
 *   none          no plan
 */
export function coachAdvice(S, today = todayISO()) {
  const running = runningOf(S)
  if (!running?.plan) return { kind: 'none', reasons: [], substantial: false }
  const review = sessionReview(S, today)
  const weeks = expandPlan(running, today)
  const thisWeek = weekOf(running, today, today)
  const reasons = []

  // 1. Pain in the last seven days outranks everything.
  const painful = review.filter(r => r.verdict === 'pain' && dayDiff(r.session.date, today) <= 7)
  const painfulRuns = runsOf(S).filter(r => r.pain != null && r.pain >= PAIN_STOP && dayDiff(r.d, today) <= 7)
  if (painful.length || painfulRuns.length) {
    reasons.push('Pain was reported in the last week.')
    reasons.push('Rest today, walk if it is comfortable, and come back only when the next run does not hurt. If it keeps hurting, see someone qualified; this app cannot tell what it is.')
    return { kind: 'rest', reasons, substantial: false }
  }

  // 2. Today's check-in or the mat week says ease off.
  const ready = readinessAdvice(S, today)
  const mat = matWeekOf(S, today)
  const todaySession = allSessions(running, today).find(s => s.date === today)
  if (todaySession && ready?.level === 'light') {
    reasons.push('Today’s check-in says keep it light.', ...ready.reasons)
    return { kind: 'easier', reasons, substantial: false, sessionId: todaySession.id }
  }
  if (todaySession && mat.logged && mat.hard >= HARD_MAT_SESSIONS) {
    reasons.push(`${mat.hard} hard mat sessions in the last seven days.`)
    reasons.push('Make today’s run shorter rather than adding to the load.')
    return { kind: 'easier', reasons, substantial: false, sessionId: todaySession.id }
  }

  // 3. The last finished week.
  const lastWeek = [...weeks].reverse().find(w => w.end < today)
  if (lastWeek && thisWeek) {
    const rows = review.filter(r => r.session.weekKey === lastWeek.key)
    const missed = rows.filter(r => r.verdict === 'missed').length
    const demanding = rows.filter(r => r.verdict === 'hard' || r.verdict === 'short').length
    if (missed >= 2 && lastWeek.kind !== 'race') {
      reasons.push(`${missed} of last week’s ${rows.length} sessions were missed.`)
      reasons.push('Repeat that week before moving on, rather than doubling up.')
      return { kind: 'repeat-week', reasons, substantial: true, weekIdx: lastWeek.n - 1 }
    }
    if (demanding >= 2 && thisWeek.kind !== 'race' && !thisWeek.reduced) {
      for (const r of rows.filter(r => r.verdict === 'hard' || r.verdict === 'short')) reasons.push(...r.reasons)
      reasons.push('Reduce this week to three quarters and let the body catch up.')
      return { kind: 'reduce-week', reasons, substantial: true, weekIdx: thisWeek.n - 1 }
    }
  }

  // 4. One missed session this week, with a free day left before the next one.
  if (thisWeek) {
    const missedNow = missedSessions(running, sessionStatesOf(S), today).filter(s => s.weekKey === thisWeek.key)
    const next = nextSession(running, sessionStatesOf(S), today)
    if (missedNow.length === 1 && next && next.date > today && !todaySession) {
      reasons.push(`${missedNow[0].kind === 'long' ? 'The long session' : 'A session'} on ${missedNow[0].date} was missed.`)
      reasons.push(`Do it today if you feel fresh, or let it go; never two runs on consecutive days to catch up.`)
      return { kind: 'reschedule', reasons, substantial: false, sessionId: missedNow[0].id }
    }
  }

  // 5. Three good sessions in a row.
  const recent = review.filter(r => r.verdict !== 'skipped').slice(-3)
  if (recent.length === 3 && recent.every(r => r.verdict === 'completed' && (r.state?.rpe == null || r.state.rpe <= EASY_RPE))) {
    reasons.push('The last three sessions were completed and felt easy enough.')
    reasons.push('Keep to the plan: the next rung is yours.')
    return { kind: 'advance', reasons, substantial: false }
  }

  return { kind: 'keep', reasons: ['Nothing to change: follow the plan.'], substantial: false }
}

/** A short line for a session that was made easier: the same rung, two thirds of the time. */
export function easierSession(s) {
  if (!s) return null
  const cycle = s.runSec + s.walkSec
  const workMin = Math.max(10, Math.round((s.workMin || 20) * 2 / 3))
  const reps = s.walkSec ? Math.max(1, Math.floor((workMin * 60) / cycle)) : 1
  return { ...s, reps, workMin: s.walkSec ? Math.round((reps * cycle) / 60) : workMin, runSec: s.walkSec ? s.runSec : workMin * 60, totalMin: s.warmMin + s.coolMin + (s.walkSec ? Math.round((reps * cycle) / 60) : workMin), eased: true }
}

/** Dates in the next `n` days with a planned run, for reminders. */
export function runDaysAhead(S, today = todayISO(), n = 60) {
  const running = runningOf(S)
  if (!running?.plan) return []
  const states = sessionStatesOf(S)
  const end = addDays(today, n)
  return allSessions(running, today).filter(s => s.date >= today && s.date <= end && !states[s.id]).map(s => ({ date: s.date, id: s.id, kind: s.kind }))
}
