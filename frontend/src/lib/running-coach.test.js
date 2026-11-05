import { describe, expect, it } from 'vitest'
import { evaluateRun, coachAdvice, sessionReview, easierSession, runDaysAhead, HARD_RPE } from './running-coach.js'
import { readRunning, withRun, withSessionState } from './running.js'
import { buildPlan, allSessions } from './running-plan.js'
import { withMatSession, withReadiness } from './sport.js'

const START = '2026-11-09'
const running = readRunning({ goal: '10k', startDate: START, days: [2, 4, 0], level: 'returning', hrMax: 180, plan: buildPlan({ goal: '10k' }) })
const sessions = allSessions(running)
const base = () => ({ running, runLog: {}, runSessions: {}, matLog: {}, readiness: {} })
const tick = (S, id, state, runId = null, run = null) => {
  const s = sessions.find(x => x.id === id)
  if (run) S.runLog = withRun(S.runLog, runId, { d: s.date, sec: s.totalMin * 60, distM: 3000, ...run })
  S.runSessions = withSessionState(S.runSessions, id, { status: 'done', d: s.date, ...(runId ? { runId } : {}), ...state })
  return S
}

describe('evaluating one session', () => {
  const s = sessions[0]   // 28 min total
  it('calls a session completed, short, hard, pain, missed or skipped and says why', () => {
    expect(evaluateRun(s, null, null).verdict).toBe('missed')
    expect(evaluateRun(s, null, { status: 'skipped', d: s.date }).verdict).toBe('skipped')
    expect(evaluateRun(s, { sec: 28 * 60, avgHr: 120 }, { status: 'done', d: s.date, rpe: 5 }, 180)).toMatchObject({ verdict: 'completed', reasons: ['Completed, felt 5/10.'] })
    expect(evaluateRun(s, { sec: 15 * 60 }, { status: 'done', d: s.date }).verdict).toBe('short')
    expect(evaluateRun(s, { sec: 28 * 60 }, { status: 'done', d: s.date, rpe: HARD_RPE }).verdict).toBe('hard')
    expect(evaluateRun(s, { sec: 28 * 60, avgHr: 160 }, { status: 'done', d: s.date, rpe: 5 }, 180)).toMatchObject({ verdict: 'hard' })
    expect(evaluateRun(s, { sec: 28 * 60, avgHr: 160 }, { status: 'done', d: s.date, rpe: 5 }, null).verdict).toBe('completed')
    expect(evaluateRun(s, { sec: 28 * 60 }, { status: 'done', d: s.date, pain: 2 }).verdict).toBe('pain')
    expect(evaluateRun(s, { sec: 28 * 60, pain: 3 }, { status: 'done', d: s.date }).reasons[0]).toMatch(/had to stop/)
  })
  it('does not call a race hard', () => {
    const race = sessions[sessions.length - 1]
    expect(evaluateRun(race, { sec: 4000, avgHr: 170 }, { status: 'done', d: race.date, rpe: 9 }, 180).verdict).toBe('completed')
  })
  it('never writes a percentage or a diagnosis', () => {
    for (const v of [evaluateRun(s, { sec: 900 }, { status: 'done', d: s.date, pain: 3 }), evaluateRun(s, { sec: 1680, avgHr: 170 }, { status: 'done', d: s.date }, 180)]) {
      for (const line of v.reasons) expect(line).not.toMatch(/%|injur|tendin|fractur|recover(ed|y) in/i)
    }
  })
})

describe('the coach’s advice', () => {
  it('has nothing to say without a plan', () => {
    expect(coachAdvice({ running: null }, '2026-11-10').kind).toBe('none')
  })

  it('tells a plan that is going well to carry on', () => {
    const S = tick(tick(tick(base(), 'k1-0', { rpe: 5 }), 'k1-1', { rpe: 5 }), 'k1-2', { rpe: 6 })
    const a = coachAdvice(S, '2026-11-16')
    expect(a.kind).toBe('advance')
    expect(a.substantial).toBe(false)
    expect(coachAdvice(base(), '2026-11-10')).toMatchObject({ kind: 'keep', substantial: false })
  })

  it('puts pain first and tells the person to rest, without diagnosing', () => {
    const S = tick(base(), 'k1-0', { rpe: 5, pain: 2 })
    const a = coachAdvice(S, '2026-11-12')
    expect(a.kind).toBe('rest')
    expect(a.reasons.join(' ')).toMatch(/Pain was reported/)
    expect(a.reasons.join(' ')).not.toMatch(/%|injur/i)
    // A week later it no longer rules.
    expect(coachAdvice(S, '2026-11-20').kind).not.toBe('rest')
  })

  it('makes today easier after a poor check-in or a heavy mat week', () => {
    const S = base()
    S.readiness = withReadiness({}, '2026-11-12', { energy: 1, soreness: 5, sleep: 1 })
    const a = coachAdvice(S, '2026-11-12')
    expect(a).toMatchObject({ kind: 'easier', substantial: false, sessionId: 'k1-1' })
    const M = base()
    for (const [i, d] of ['2026-11-07', '2026-11-08', '2026-11-10'].entries()) M.matLog = withMatSession(M.matLog, 'm' + i, { d, sport: 'bjj', effort: 5 })
    expect(coachAdvice(M, '2026-11-12').kind).toBe('easier')
    // Not on a rest day: there is nothing to make easier.
    expect(coachAdvice(M, '2026-11-13').kind).not.toBe('easier')
    // Two hard mat sessions do not trip it.
    const two = base()
    two.matLog = withMatSession(withMatSession({}, 'a', { d: '2026-11-10', sport: 'judo', effort: 5 }), 'b', { d: '2026-11-11', sport: 'judo', effort: 5 })
    expect(coachAdvice(two, '2026-11-12').kind).not.toBe('easier')
  })

  it('proposes repeating a week with two sessions missed, and marks it substantial', () => {
    const S = tick(base(), 'k1-0', { rpe: 5 })
    const a = coachAdvice(S, '2026-11-17')
    expect(a).toMatchObject({ kind: 'repeat-week', substantial: true, weekIdx: 0 })
    expect(a.reasons[0]).toMatch(/2 of last week’s 3 sessions were missed/)
  })

  it('proposes reducing this week when last week was too demanding', () => {
    const S = tick(tick(tick(base(), 'k1-0', { rpe: 9 }), 'k1-1', { rpe: 8 }), 'k1-2', { rpe: 5 })
    const a = coachAdvice(S, '2026-11-17')
    expect(a).toMatchObject({ kind: 'reduce-week', substantial: true, weekIdx: 1 })
    // Short runs count as demanding too.
    const T = tick(tick(tick(base(), 'k1-0', { rpe: 5 }, 'r1', { sec: 600 }), 'k1-1', { rpe: 5 }, 'r2', { sec: 600 }), 'k1-2', { rpe: 5 })
    expect(coachAdvice(T, '2026-11-17').kind).toBe('reduce-week')
    // An already reduced week is not reduced again.
    const R = { ...S, running: { ...running, plan: { ...running.plan, weeks: running.plan.weeks.map((w, i) => (i === 1 ? { ...w, reduced: true } : w)) } } }
    expect(coachAdvice(R, '2026-11-17').kind).not.toBe('reduce-week')
  })

  it('suggests catching up one missed session only when a free day remains', () => {
    const S = base()
    // Tuesday missed, Wednesday is free, Thursday still ahead.
    const a = coachAdvice(S, '2026-11-11')
    expect(a).toMatchObject({ kind: 'reschedule', substantial: false, sessionId: 'k1-0' })
    expect(a.reasons.join(' ')).toMatch(/never two runs on consecutive days/)
    // On a planned day the plan simply continues.
    expect(coachAdvice(S, '2026-11-12').kind).toBe('keep')
  })
})

describe('around the advice', () => {
  it('reviews every past session with its verdict', () => {
    const S = tick(base(), 'k1-0', { rpe: 5 })
    const rows = sessionReview(S, '2026-11-13')
    expect(rows.map(r => r.verdict)).toEqual(['completed', 'missed'])
  })
  it('eases a session to about two thirds of its time on the same rung', () => {
    const s = sessions[0]
    const e = easierSession(s)
    expect(e.runSec).toBe(s.runSec)
    expect(e.reps).toBeLessThan(s.reps)
    expect(e.totalMin).toBeLessThan(s.totalMin)
    expect(e.eased).toBe(true)
    const cont = easierSession({ ...s, runSec: 1800, walkSec: 0, reps: 1, workMin: 30, totalMin: 40 })
    expect(cont.workMin).toBe(20)
    expect(easierSession(null)).toBeNull()
  })
  it('lists the run days ahead for reminders, leaving out ticked sessions', () => {
    const S = tick(base(), 'k1-0', { rpe: 5 })
    const days = runDaysAhead(S, '2026-11-10', 7)
    expect(days.map(d => d.date)).toEqual(['2026-11-12', '2026-11-15', '2026-11-17'])
    expect(runDaysAhead({ running: null }, '2026-11-10')).toEqual([])
  })
})
