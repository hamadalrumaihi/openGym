import { describe, expect, it } from 'vitest'
import {
  LADDER, CONTINUOUS, GOAL_WEEKS, LONG_CAP_MIN, WARM_MIN, COOL_MIN,
  buildPlan, baselineFrom, expandPlan, allSessions, planEndDate, sessionOn, nextSession, upcomingSessions,
  missedSessions, weekOf, applyWeekAction, matchRunToSession, autoCompletions, sessionLine,
} from './running-plan.js'
import { readRunning, withRun, withSessionState } from './running.js'

const START = '2026-11-09'   // a Monday
const profile = (over = {}) => readRunning({ goal: '10k', startDate: START, days: [2, 4, 0], level: 'returning', plan: buildPlan({ goal: '10k', level: 'returning' }), ...over })

describe('the ladder and the skeleton', () => {
  it('climbs from one minute of running to continuous, never jumping more than one rung a week', () => {
    expect(LADDER[0]).toEqual({ run: 60, walk: 120 })
    expect(LADDER[CONTINUOUS]).toEqual({ run: 0, walk: 0 })
    for (let i = 1; i < CONTINUOUS; i++) expect(LADDER[i].run).toBeGreaterThan(LADDER[i - 1].run)
    for (const goal of Object.keys(GOAL_WEEKS)) {
      const { weeks } = buildPlan({ goal })
      expect(weeks.length).toBe(GOAL_WEEKS[goal])
      for (let i = 1; i < weeks.length; i++) {
        expect(weeks[i].stage - weeks[i - 1].stage).toBeLessThanOrEqual(1)
        expect(weeks[i].stage).toBeGreaterThanOrEqual(weeks[i - 1].stage)
      }
      expect(weeks[weeks.length - 1].kind).toBe('race')
      expect(weeks.every(w => w.longMin <= LONG_CAP_MIN[goal])).toBe(true)
    }
  })

  it('eases every fourth week, grows the long session by about ten per cent, and tapers at the end', () => {
    const { weeks } = buildPlan({ goal: '10k', level: 'returning' })
    expect(weeks.map(w => w.kind)).toEqual(['build', 'build', 'build', 'ease', 'build', 'build', 'build', 'build', 'build', 'race'])
    expect(weeks[3].stage).toBe(weeks[2].stage + 1)   // the ease week keeps the new rung…
    expect(weeks[4].stage).toBe(weeks[3].stage)       // …and the next week does not climb twice
    expect(weeks[3].longMin).toBeLessThan(weeks[2].longMin)
    for (let i = 1; i < weeks.length - 1; i++) if (weeks[i].kind === 'build' && weeks[i - 1].kind === 'build') {
      expect(weeks[i].longMin).toBeLessThanOrEqual(Math.ceil(weeks[i - 1].longMin * 1.1 / 5) * 5)
    }
    expect(weeks[8].longMin).toBe(LONG_CAP_MIN['10k'])
    expect(weeks[9].midMin).toBeLessThan(weeks[8].midMin)
    // A half gets a tapering week before race week; a 5K and a 10K go straight into race week.
    const half = buildPlan({ goal: 'half' }).weeks
    expect(half[half.length - 2].kind).toBe('taper')
    expect(half.filter(w => w.kind === 'ease').length).toBe(3)
    expect(half[half.length - 1].stage).toBe(CONTINUOUS)
  })

  it('starts a runner with a base further up and honours a baseline rung', () => {
    expect(buildPlan({ goal: '10k', level: 'base' }).weeks[0].stage).toBe(3)
    expect(buildPlan({ goal: '10k', level: 'new' }).weeks[0].stage).toBe(0)
    expect(buildPlan({ goal: '10k', stage: 5 }).weeks[0].stage).toBe(5)
    expect(buildPlan({ goal: '10k', stage: 99 }).weeks[0].stage).toBe(CONTINUOUS)
  })
})

describe('the baseline from imported runs', () => {
  const today = '2026-11-08'
  const run = (d, sec, distM) => ({ d, kind: 'run', sec, distM })
  it('starts from the first rung with nothing recorded, and says so', () => {
    const b = baselineFrom([], today)
    expect(b.stage).toBe(0)
    expect(b.reasons[0]).toMatch(/No runs/)
  })
  it('never starts past the five-minute rung, whatever the watch shows', () => {
    const runs = [run('2026-11-01', 3600, 10000), run('2026-11-03', 3600, 10000), run('2026-11-05', 3600, 10000), run('2026-11-07', 3600, 10000)]
    expect(baselineFrom(runs, today).stage).toBe(5)
  })
  it('reads twenty minutes at a running pace as the three-minute rung, a slow shuffle as one rung up', () => {
    expect(baselineFrom([run('2026-11-01', 1300, 2600), run('2026-11-05', 1300, 2600)], today).stage).toBe(3)
    expect(baselineFrom([run('2026-11-01', 1300, 1500)], today).stage).toBe(1)
    // Old runs do not count, nor do walks.
    expect(baselineFrom([run('2026-08-01', 3600, 10000)], today).stage).toBe(0)
    expect(baselineFrom([{ d: '2026-11-01', kind: 'walk', sec: 3600, distM: 6000 }], today).stage).toBe(0)
  })
})

describe('expanding the plan to dated sessions', () => {
  it('puts three sessions a week on the chosen days, the long one last, with a walk in and out', () => {
    const r = profile()
    const weeks = expandPlan(r)
    expect(weeks.length).toBe(10)
    expect(weeks[0].sessions.map(s => s.date)).toEqual(['2026-11-10', '2026-11-12', '2026-11-15'])
    expect(weeks[0].sessions.map(s => s.kind)).toEqual(['runwalk', 'runwalk', 'long'])
    const first = weeks[0].sessions[0]
    expect(first).toMatchObject({ id: 'k1-0', reps: 6, runSec: 60, walkSec: 120, warmMin: WARM_MIN, coolMin: COOL_MIN, workMin: 18, totalMin: 28 })
    expect(sessionLine(first)).toBe('6 × (1 min run · 2 min walk)')
    expect(weeks[0].sessions[2].workMin).toBeGreaterThan(first.workMin)
    expect(planEndDate(r)).toBe('2027-01-17')
    expect(weeks[9].sessions[2]).toMatchObject({ kind: 'race', distKm: 10, date: '2027-01-17' })
    expect(sessionLine(weeks[9].sessions[2])).toMatch(/^10K race/)
    expect(weeks[9].sessions[1].pickups).toBe(true)
  })

  it('writes continuous running as an easy run once the ladder is climbed', () => {
    const r = profile({ plan: buildPlan({ goal: 'half', level: 'base' }) })
    const late = expandPlan(r)[12].sessions[0]
    expect(late.walkSec).toBe(0)
    expect(late.reps).toBe(1)
    expect(sessionLine(late)).toMatch(/min easy run$/)
    expect(late.kind).toBe('easy')
  })

  it('carries a heart-rate target when the maximum is known, and zone 2 by name otherwise', () => {
    expect(allSessions(profile())[0].target).toEqual({ zone: 2 })
    expect(allSessions(profile({ hrMax: 180 }))[0].target).toEqual({ hrLow: 108, hrHigh: 126, zone: 2 })
  })

  it('drops sessions before the start date and never moves the race by starting midweek', () => {
    const r = profile({ startDate: '2026-11-11' })
    expect(expandPlan(r)[0].sessions.map(s => s.date)).toEqual(['2026-11-12', '2026-11-15'])
    expect(planEndDate(r)).toBe('2027-01-17')
  })

  it('finds today, the next, the upcoming and the missed sessions', () => {
    const r = profile()
    expect(sessionOn(r, '2026-11-12').id).toBe('k1-1')
    expect(sessionOn(r, '2026-11-13')).toBeNull()
    const states = withSessionState({}, 'k1-0', { status: 'done', d: '2026-11-10' })
    expect(nextSession(r, states, '2026-11-10').id).toBe('k1-1')
    expect(upcomingSessions(r, states, '2026-11-10', 2).map(s => s.id)).toEqual(['k1-1', 'k1-2'])
    expect(missedSessions(r, {}, '2026-11-13').map(s => s.id)).toEqual(['k1-0', 'k1-1'])
    expect(missedSessions(r, states, '2026-11-13').map(s => s.id)).toEqual(['k1-1'])
    expect(weekOf(r, '2026-11-20').n).toBe(2)
    expect(weekOf(r, '2026-11-01')).toBeNull()
  })

  it('applies the week mode to the week it was chosen in and nowhere else', () => {
    const r = profile({ weekMode: { mode: 'busy', until: '2026-11-22' } })
    const [w1, w2, w3] = expandPlan(r, '2026-11-16')
    expect(w1.mode).toBeNull()
    expect(w2.mode).toBe('busy')
    expect(w3.mode).toBeNull()
    expect(w2.sessions[1].optional).toBe(true)
    expect(w2.sessions[2].workMin).toBeLessThan(expandPlan(profile())[1].sessions[2].workMin)
    const rec = profile({ weekMode: { mode: 'recovery', until: '2026-11-22' } })
    expect(expandPlan(rec, '2026-11-16')[1].sessions[0].reps).toBeLessThan(expandPlan(profile())[1].sessions[0].reps)
    // Once it has run out nothing changes.
    expect(expandPlan(r, '2026-11-23')[1].mode).toBeNull()
  })
})

describe('repeat, skip, reduce a week', () => {
  const plan = buildPlan({ goal: '10k' })
  it('repeats a week after itself with a fresh key, so ticks on the original stay put', () => {
    const p = applyWeekAction(plan, 2, 'repeat')
    expect(p.weeks.length).toBe(11)
    expect(p.weeks[3]).toMatchObject({ stage: plan.weeks[2].stage, kind: 'build', longMin: plan.weeks[2].longMin })
    expect(p.weeks[3].key).not.toBe(p.weeks[2].key)
    expect(new Set(p.weeks.map(w => w.key)).size).toBe(11)
    expect(p.nextKey).toBe(plan.nextKey + 1)
    expect(plan.weeks.length).toBe(10)   // never in place
    // Repeating the race week puts a build week before it.
    const q = applyWeekAction(plan, 9, 'repeat')
    expect(q.weeks[9].kind).toBe('build')
    expect(q.weeks[10].kind).toBe('race')
    expect(q.weeks[9].longMin).toBeGreaterThan(0)
  })
  it('skips a week but never the race, and never below two weeks', () => {
    const p = applyWeekAction(plan, 1, 'skip')
    expect(p.weeks.length).toBe(9)
    expect(p.weeks.map(w => w.key)).not.toContain('k2')
    expect(applyWeekAction(plan, 9, 'skip')).toBe(plan)
    const tiny = { weeks: plan.weeks.slice(8), nextKey: 11 }
    expect(applyWeekAction(tiny, 0, 'skip')).toBe(tiny)
  })
  it('reduces a week to three quarters and restores it', () => {
    const r = profile()
    const full = expandPlan(r)[2].sessions[2].workMin
    const p = applyWeekAction(plan, 2, 'reduce')
    const reduced = expandPlan(profile({ plan: p }))[2]
    expect(reduced.reduced).toBe(true)
    expect(reduced.sessions[2].workMin).toBeLessThan(full)
    expect(reduced.sessions[2].workMin).toBeGreaterThanOrEqual(Math.floor(full * 0.7))
    expect(applyWeekAction(p, 2, 'restore').weeks[2]).not.toHaveProperty('reduced')
    expect(applyWeekAction(plan, 99, 'reduce')).toBe(plan)
    expect(applyWeekAction(plan, 1, 'explode')).toBe(plan)
  })
  it('keeps the race moving out when weeks are repeated, so the screen can warn about the date', () => {
    const r = profile({ raceDate: '2027-01-17', plan: applyWeekAction(plan, 4, 'repeat') })
    expect(planEndDate(r)).toBe('2027-01-24')
  })
})

describe('matching runs to sessions', () => {
  const r = profile()
  const sessions = allSessions(r)
  it('ticks the session on the run’s day, else a free one a day either side', () => {
    expect(matchRunToSession(sessions, {}, { d: '2026-11-10', sec: 1800 }).id).toBe('k1-0')
    expect(matchRunToSession(sessions, {}, { d: '2026-11-14', sec: 1800 }).id).toBe('k1-2')
    expect(matchRunToSession(sessions, {}, { d: '2026-11-13', sec: 1800 }).id).toBe('k1-1')
    const done = withSessionState({}, 'k1-1', { status: 'done', d: '2026-11-12' })
    expect(matchRunToSession(sessions, done, { d: '2026-11-13', sec: 1800 })).toBeNull()
    expect(matchRunToSession(sessions, {}, { d: '2026-10-01', sec: 1800 })).toBeNull()
  })
  it('auto-completes imported runs without touching ticks a person made', () => {
    const S = {
      running: r,
      runLog: withRun(withRun(withRun({}, 'strava:1', { d: '2026-11-10', sec: 1700, distM: 3000, rpe: 5 }), 'strava:2', { d: '2026-11-15', sec: 2000, distM: 4000 }), 'strava:3', { d: '2026-11-12', sec: 1500, kind: 'walk' }),
      runSessions: withSessionState({}, 'k1-0', { status: 'done', d: '2026-11-10', rpe: 8, runId: 'manual:x' }, 1),
    }
    const out = autoCompletions(S, '2026-11-16', 99)
    expect(out['k1-0']).toMatchObject({ rpe: 8, runId: 'manual:x' })   // untouched
    expect(out['k1-2']).toMatchObject({ status: 'done', runId: 'strava:2', _ts: 99 })
    expect(out['k1-1']).toBeUndefined()   // a walk does not tick a run session
    // The run already tied stays tied; running it again changes nothing.
    expect(autoCompletions({ ...S, runSessions: out }, '2026-11-16', 100)).toEqual(out)
    // Without a plan nothing happens.
    expect(autoCompletions({ runLog: S.runLog }, '2026-11-16')).toEqual({})
  })
})
