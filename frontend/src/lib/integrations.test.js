// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
vi.mock('./api.js', () => ({ api: vi.fn() }))
import { api } from './api.js'
import { runsFromPending, collectPending, withoutSourceRuns, stravaCallbackMessage, syncProvider, disconnectProvider, connectGarmin, stravaConnectUrl } from './integrations.js'
import { readRunning, runsOf, sessionStatesOf, withRun } from './running.js'
import { buildPlan } from './running-plan.js'

const strava = { src: 'strava', id: '101', data: { id: 101, name: 'Run', sport_type: 'Run', start_date: '2026-11-10T15:02:11Z', start_date_local: '2026-11-10T18:02:11Z', distance: 4500, moving_time: 1800, average_heartrate: 150, device_name: 'Garmin Forerunner 965', external_id: 'garmin_push_1' }, laps: [{ moving_time: 900, distance: 2250 }] }
const garmin = { src: 'garmin', id: '20001', data: { activityId: 20001, activityName: 'Doha', startTimeLocal: '2026-11-12 18:00:00', beginTimestamp: Date.UTC(2026, 10, 12, 15), activityType: { typeKey: 'running' }, distance: 3000, duration: 1500, averageHR: 140 } }
const ride = { src: 'strava', id: '102', data: { id: 102, sport_type: 'Ride', start_date: '2026-11-11T10:00:00Z', distance: 20000, moving_time: 3600 } }

beforeEach(() => { api.mockReset() })

describe('pending activities become runs', () => {
  it('converts both sources and drops other sports', () => {
    const items = runsFromPending([strava, garmin, ride, null, { src: 'tiktok', id: 1, data: {} }])
    expect(items.map(i => i.id)).toEqual(['strava:101', 'garmin:20001'])
    expect(items[0].run.laps.length).toBe(1)
  })

  it('collects, merges, ticks the planned session, adopts Garmin’s max HR, and acknowledges', async () => {
    let S = { running: readRunning({ goal: '10k', startDate: '2026-11-09', days: [2, 4, 0], plan: buildPlan({ goal: '10k' }) }), runLog: {}, runSessions: {} }
    const update = mut => { const next = structuredClone(S); mut(next); S = next }
    api.mockImplementation(async (path, opts) => {
      if (path === '/api/integrations/activities') return { activities: [strava, garmin, ride], garminZones: { maxHr: 185 } }
      if (path === '/api/integrations/activities/ack') return { ok: true, pending: 0 }
      throw new Error('unexpected ' + path)
    })
    const r = await collectPending({ update, getState: () => S, today: '2026-11-13', now: 50 })
    expect(r).toMatchObject({ added: 2, updated: 0, duplicates: 0, collected: 3 })
    expect(runsOf(S).map(x => x.id)).toEqual(['strava:101', 'garmin:20001'])
    const states = sessionStatesOf(S)
    expect(states['k1-0']).toMatchObject({ status: 'done', runId: 'strava:101' })   // Tuesday 10th
    expect(states['k1-1']).toMatchObject({ status: 'done', runId: 'garmin:20001' }) // Thursday 12th
    expect(S.running.hrMax).toBe(185)
    const ack = api.mock.calls.find(([p]) => p === '/api/integrations/activities/ack')
    expect(JSON.parse(ack[1].body).keys).toEqual(['strava:101', 'garmin:20001', 'strava:102'])
    // A second collection of the same activities changes nothing and does not re-tick.
    const again = await collectPending({ update, getState: () => S, today: '2026-11-13', now: 60 })
    expect(again).toMatchObject({ added: 0, updated: 0 })
    expect(sessionStatesOf(S)['k1-0'].runId).toBe('strava:101')
  })

  it('keeps a person’s own maximum heart rate', async () => {
    let S = { running: readRunning({ goal: '10k', startDate: '2026-11-09', hrMax: 178 }), runLog: {}, runSessions: {} }
    api.mockResolvedValueOnce({ activities: [], garminZones: { maxHr: 185 } })
    await collectPending({ update: mut => { const n = structuredClone(S); mut(n); S = n }, getState: () => S })
    expect(S.running.hrMax).toBe(178)
    expect(api).toHaveBeenCalledTimes(1)   // nothing to acknowledge
  })

  it('reports offline and signed-out without touching the state', async () => {
    const update = vi.fn()
    api.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'timeout' }))
    expect(await collectPending({ update, getState: () => ({}) })).toMatchObject({ added: 0, skipped: 'offline' })
    api.mockRejectedValueOnce(Object.assign(new Error('not signed in'), { status: 401 }))
    expect(await collectPending({ update, getState: () => ({}) })).toMatchObject({ skipped: 'signed-out' })
    expect(update).not.toHaveBeenCalled()
  })
})

describe('the small calls', () => {
  it('post the right bodies', async () => {
    api.mockResolvedValue({ ok: true, url: 'https://www.strava.com/oauth/authorize?x' })
    expect(await stravaConnectUrl()).toMatch(/^https:\/\/www\.strava\.com/)
    await syncProvider('strava', 365)
    await syncProvider('garmin')
    await disconnectProvider('strava', true)
    await connectGarmin('k3y', '2027-01-01')
    const calls = api.mock.calls.map(([p, o]) => [p, o?.method, o?.body])
    expect(calls).toEqual([
      ['/api/integrations/strava/connect', 'POST', '{}'],
      ['/api/integrations/strava/sync', 'POST', '{"days":365}'],
      ['/api/integrations/garmin/sync', 'POST', '{}'],
      ['/api/integrations/strava/disconnect', 'POST', '{"deleteRuns":true}'],
      ['/api/integrations/garmin/connect', 'POST', '{"key":"k3y","keyExpires":"2027-01-01"}'],
    ])
  })
  it('clears one source’s runs with stamped empties and words the callback codes', () => {
    const map = withRun(withRun({}, 'strava:1', { d: '2026-11-10', sec: 60, src: 'strava' }), 'fit:2', { d: '2026-11-10', sec: 60, src: 'fit' })
    const { map: out, removed } = withoutSourceRuns(map, 'strava', 9)
    expect(removed).toBe(1)
    expect(out['strava:1']).toEqual({ _ts: 9 })
    expect(out['fit:2'].src).toBe('fit')
    expect(stravaCallbackMessage('connected')).toMatch(/connected/)
    expect(stravaCallbackMessage('scope')).toMatch(/activities/)
    expect(stravaCallbackMessage('')).toBe('')
    expect(stravaCallbackMessage('http')).toMatch(/Try again/)
  })
})
