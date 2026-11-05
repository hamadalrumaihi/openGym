import { describe, expect, it } from 'vitest'
import { weeklyRunning, longestRun, bestOver, consistency, raceProgress, trainingMix, hrTrend, paceTrend } from './running-stats.js'
import { readRunning, withRun, withSessionState } from './running.js'
import { buildPlan } from './running-plan.js'
import { withMatSession } from './sport.js'

const START = '2026-11-09'
const running = readRunning({ goal: '10k', startDate: START, raceDate: '2027-01-17', days: [2, 4, 0], plan: buildPlan({ goal: '10k' }) })
const run = (id, d, sec, distM, over = {}) => [id, { d, sec, distM, kind: 'run', ...over }]
const log = pairs => pairs.reduce((m, [id, r]) => withRun(m, id, r), {})

describe('weekly running', () => {
  it('sums distance, time and runs per week, keeps empty weeks, and averages pace and heart rate', () => {
    const S = { runLog: log([run('a', '2026-11-10', 1800, 3000, { avgHr: 150 }), run('b', '2026-11-12', 1500, 2500, { avgHr: 140 }), run('c', '2026-11-24', 2400, 4000), ['w', { d: '2026-11-11', sec: 3600, distM: 5000, kind: 'walk' }]]) }
    const rows = weeklyRunning(S, '2026-11-25', 3)
    expect(rows.map(r => r.week)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'])
    expect(rows[0]).toMatchObject({ distM: 5500, sec: 3300, runs: 2, avgHr: 145, longestSec: 1800 })
    expect(rows[0].avgPaceSecKm).toBe(600)
    expect(rows[1]).toMatchObject({ distM: 0, sec: 0, runs: 0, avgHr: null, avgPaceSecKm: null })
    expect(rows[2].runs).toBe(1)
    // A Sunday week start moves the buckets.
    expect(weeklyRunning({ ...S, weekStart: 0 }, '2026-11-25', 3)[0].week).toBe('2026-11-08')
  })
})

describe('bests and longest', () => {
  const S = { runLog: log([run('a', '2026-11-10', 1800, 3000), run('b', '2026-11-20', 3000, 5050), run('c', '2026-12-01', 3900, 6500), run('d', '2026-12-10', 3700, 5000)]) }
  it('finds the longest run by time and by distance', () => {
    const l = longestRun(S)
    expect(l.byTime.id).toBe('c')
    expect(l.byDist.id).toBe('c')
    expect(longestRun({})).toBeNull()
  })
  it('estimates a 5K from the fastest pace held over at least five kilometres, and says whether it was exact', () => {
    const b = bestOver(S, 5000)
    expect(b.id).toBe('b')          // 3000 s over 5.05 km ≈ 2970 s for 5 km, faster than c's 3000 s
    expect(b.sec).toBe(2970)
    expect(b.exact).toBe(true)
    expect(bestOver(S, 5000, '2026-12-01')).toMatchObject({ id: 'c', exact: false, sec: 3000 })
    expect(bestOver(S, 10000)).toBeNull()
  })
})

describe('consistency and race progress', () => {
  it('counts planned sessions done, skipped and missed up to today', () => {
    const S = { running, runSessions: withSessionState(withSessionState({}, 'k1-0', { status: 'done', d: '2026-11-10' }), 'k1-1', { status: 'skipped', d: '2026-11-12' }) }
    expect(consistency(S, '2026-11-16')).toEqual({ planned: 3, done: 1, skipped: 1, missed: 1, share: 1 / 3 })
    expect(consistency(S, '2026-11-10')).toEqual({ planned: 0, done: 0, skipped: 0, missed: 0, share: null })
    expect(consistency({ running: null })).toBeNull()
  })
  it('reports weeks done, the days to the race and whether the plan overruns the date', () => {
    const p = raceProgress({ running }, '2026-11-24')
    expect(p).toMatchObject({ weeks: 10, weeksDone: 2, planEnd: '2027-01-17', raceDate: '2027-01-17', daysToRace: 54, goalKm: 10, overrun: false })
    const longer = { running: { ...running, plan: { ...running.plan, weeks: [...running.plan.weeks.slice(0, 9), { ...running.plan.weeks[8], key: 'k11' }, running.plan.weeks[9]], nextKey: 12 } } }
    expect(raceProgress(longer, '2026-11-24')).toMatchObject({ planEnd: '2027-01-24', overrun: true })
    expect(raceProgress({ running: null })).toBeNull()
  })
})

describe('training mix and trends', () => {
  it('puts runs, gym and mat side by side for the window', () => {
    const S = {
      runLog: log([run('a', '2026-11-10', 1800, 3000), run('old', '2026-09-01', 1800, 3000)]),
      workouts: [{ d: '2026-11-11', start: 1000, end: 1000 + 50 * 60000 }, { d: '2026-10-01', start: 1, end: 2 }],
      matLog: withMatSession({}, 'm', { d: '2026-11-12', sport: 'bjj', min: 90, effort: 4 }),
    }
    expect(trainingMix(S, '2026-11-20', 14)).toEqual({ from: '2026-11-07', to: '2026-11-20', runs: { count: 1, min: 30, distM: 3000 }, gym: { count: 1, min: 50 }, mat: { count: 1, min: 90 } })
  })
  it('gives chart points for heart rate and pace, oldest first', () => {
    const S = { runLog: log([run('b', '2026-11-12', 1500, 2500, { avgHr: 140, start: Date.UTC(2026, 10, 12, 6) }), run('a', '2026-11-10', 1800, 3000, { avgHr: 150 }), run('c', '2026-11-13', 900, 0)]) }
    expect(hrTrend(S).map(p => p.y)).toEqual([150, 140])
    expect(paceTrend(S).map(p => [p.d, p.y])).toEqual([['2026-11-10', 600], ['2026-11-12', 600]])
  })
})
