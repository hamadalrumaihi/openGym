// The app's side of the Garmin and Strava connections (api/integrations): asking the server for
// the status, starting a connection, pulling the activities it fetched into the run log, and
// disconnecting. The server keeps the tokens and talks to the providers; the app turns what it
// fetched into runs (lib/run-import.js), ticks the planned sessions they match
// (lib/running-plan.js autoCompletions) and acknowledges them, so the state keeps one writer.
import { api } from './api.js'
import { runFromStrava, runFromGarmin, mergeRuns } from './run-import.js'
import { autoCompletions } from './running-plan.js'
import { runningOf, withRunning } from './running.js'
import { todayISO } from './format.js'

const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) })

/** `{ strava: { configured, connected, … }, garmin: {…}, pending, poll }`. */
export const integrationsStatus = () => api('/api/integrations')
/** The Strava authorisation URL to send the browser to. */
export const stravaConnectUrl = () => post('/api/integrations/strava/connect').then(r => r.url)
/** Pull now; `days` asks for history (up to 400). */
export const syncProvider = (provider, days = 0) => post(`/api/integrations/${provider}/sync`, days ? { days } : {})
export const disconnectProvider = (provider, deleteRuns = false) => post(`/api/integrations/${provider}/disconnect`, { deleteRuns })
export const connectGarmin = (key, keyExpires = null) => post('/api/integrations/garmin/connect', { key, ...(keyExpires ? { keyExpires } : {}) })

/** Pending activities from the server as `[{ id, run }]`, dropping anything that is not a run or walk. */
export function runsFromPending(activities) {
  const out = []
  for (const a of activities || []) {
    const r = a?.src === 'strava' ? runFromStrava(a.data, a.laps) : a?.src === 'garmin' ? runFromGarmin(a.data) : null
    if (r) out.push(r)
  }
  return out
}

/** S.runLog with every entry from `src` cleared (a stamped empty entry each), for "delete my Strava runs". */
export function withoutSourceRuns(map, src, now = Date.now()) {
  const out = { ...(map || {}) }
  let n = 0
  for (const [id, v] of Object.entries(out)) if (v && v.d && v.src === src) { out[id] = { _ts: now }; n++ }
  return { map: out, removed: n }
}

/**
 * Collect what the server fetched: convert, merge into the run log, tick the sessions the new
 * runs match, adopt Garmin's maximum heart rate when the profile has none, then acknowledge.
 * `update` is the store's `update(mut)`; `getState` returns S. Returns the merge counts, or
 * `{ added: 0, … , skipped }` when there was nothing or the server could not be reached.
 */
export async function collectPending({ update, getState, today = todayISO(), now = Date.now() }) {
  let res
  try { res = await api('/api/integrations/activities') }
  catch (e) { return { added: 0, updated: 0, duplicates: 0, skipped: e?.status === 401 ? 'signed-out' : 'offline' } }
  const items = runsFromPending(res?.activities)
  const keys = (res?.activities || []).map(a => `${a.src}:${a.id}`)
  let counts = { added: 0, updated: 0, duplicates: 0 }
  if (items.length || res?.garminZones?.maxHr) {
    update(s => {
      if (items.length) {
        const r = mergeRuns(s.runLog, items, now)
        s.runLog = r.map
        counts = { added: r.added, updated: r.updated, duplicates: r.duplicates }
        if (runningOf(s)?.plan) s.runSessions = autoCompletions(s, today, now)
      }
      const running = runningOf(s)
      if (running && !running.hrMax && res?.garminZones?.maxHr) s.running = withRunning(s, { hrMax: res.garminZones.maxHr }, now)
    })
  }
  if (keys.length) { try { await post('/api/integrations/activities/ack', { keys }) } catch { /* collected again next time; the merge is idempotent */ } }
  return { ...counts, collected: keys.length }
}

/** The reason code a callback redirect carries (`?strava=…`), as a sentence for the screen. */
export function stravaCallbackMessage(code) {
  switch (code) {
    case 'connected': return 'Strava connected. Your recent runs are on their way.'
    case 'denied': return 'Strava access was not granted.'
    case 'scope': return 'Strava did not grant activity reading. Connect again and keep “View data about your activities” ticked.'
    case 'state': return 'That Strava sign-in did not start from this account. Try again.'
    case 'signin': return 'Sign in to openGym first, then connect Strava.'
    case 'unconfigured': return 'Strava is not set up on this server.'
    case null: case undefined: case '': return ''
    default: return 'Strava could not be connected. Try again in a minute.'
  }
}
