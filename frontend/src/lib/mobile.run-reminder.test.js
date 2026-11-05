import { describe, expect, it } from 'vitest'
import { buildRunNotifications } from './mobile.js'
import { readRunning, withRun, withSessionState } from './running.js'
import { buildPlan } from './running-plan.js'

const running = readRunning({ goal: '10k', startDate: '2026-11-09', days: [2, 4, 0], plan: buildPlan({ goal: '10k' }) })
const base = over => ({ reminder: { on: true, time: '07:30' }, running, runLog: {}, runSessions: {}, dayNotes: {}, ...over })
const now = new Date(2026, 10, 9, 8, 0)   // Monday 9 November, 08:00

describe('buildRunNotifications', () => {
  it('schedules one notification per planned run day at the reminder time, with stable ids', () => {
    const n = buildRunNotifications(base(), now)
    expect(n.length).toBeGreaterThan(20)
    expect(n[0].schedule.at.getTime()).toBe(new Date(2026, 10, 10, 7, 30).getTime())
    expect(n[0].id).toBe(3001)
    expect(n[0].title).toBe('Run day')
    expect(n[2].title).toBe('Long run today')
    expect(new Set(n.map(x => x.id)).size).toBe(n.length)
    expect(n.every(x => x.id >= 3000 && x.id < 3060)).toBe(true)
  })
  it('leaves out ticked sessions, logged days, excused days, and everything when switched off', () => {
    const S = base({
      runSessions: withSessionState({}, 'k1-0', { status: 'done', d: '2026-11-10' }),
      runLog: withRun({}, 'strava:1', { d: '2026-11-12', sec: 600 }),
      dayNotes: { '2026-11-15': { tag: 'sick', _ts: 1 } },
    })
    const dates = buildRunNotifications(S, now).map(x => x.schedule.at.getDate())
    expect(dates.slice(0, 2)).toEqual([17, 19])
    expect(buildRunNotifications(base({ reminder: { on: false } }), now)).toEqual([])
    expect(buildRunNotifications(base({ running: { ...running, remind: false } }), now)).toEqual([])
    expect(buildRunNotifications(base({ running: null }), now)).toEqual([])
  })
})
