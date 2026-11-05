// The running side of openGym: a goal (5K, 10K, half), the plan that leads to it, the runs
// that were done (recorded on a watch and imported, or typed in), and how each planned
// session went. Everything here is a pure read or a pure "with" over the synced state `S`,
// in the style of lib/sport.js.
//
//   S.running = null | {
//     goal:      '5k' | '10k' | 'half'
//     raceDate:  'YYYY-MM-DD' | null       the target; a target, not a promise of readiness
//     startDate: 'YYYY-MM-DD'              week 1 begins on this day's week
//     days:      number[]                  weekdays (0 Sunday … 6 Saturday); the last is the long day
//     level:     'new' | 'returning' | 'base'   never ran / used to run / can run 20-30 min now
//     hrMax:     number | null             for heart-rate zones, when the person knows it
//     strength:  boolean                   the two optional running-strength sessions are wanted
//     remind:    boolean                   run days join the day reminder (default true)
//     weekMode:  null | { mode: 'busy' | 'recovery', until: 'YYYY-MM-DD' }
//     plan:      { weeks: [...], nextKey } the skeleton lib/running-plan.js expands (stage, kind, reduced per week)
//     setAt:     number                    when the profile was last saved (ms)
//   }
//   S.runLog      = { [id]: { d, start, src, srcId, name, kind, sec, distM, avgHr, maxHr, cadence,
//                             elevM, laps, zones, rpe, pain, note, planRef, gps, _ts } }
//   S.runSessions = { [sessionId]: { status, d, runId, rpe, pain, note, _ts } }
//
// `running` is one object stamped as a whole on every change (lib/sync-merge.js `edited`), so two
// devices keep the profile saved last. The two logs are stamped maps, one entry per key, like
// the mat log: a run imported on the phone and a session ticked on the laptop both survive the
// next sync, and a removal is a stamped empty entry rather than a deleted key.
//
// Ids in the run log are deterministic per source (`strava:<id>`, `fit:<hash>`, `manual:<uid>`),
// so importing the same activity twice overwrites one entry instead of making two.
//
// Nothing here stores a GPS coordinate: a run keeps `gps: true` and nothing else about where it
// went. Laps are capped so one summer of running cannot outgrow the state document.
import { todayISO } from './format.js'

export const RUN_GOALS = ['5k', '10k', 'half']
export const GOAL_KM = { '5k': 5, '10k': 10, half: 21.0975 }
export const GOAL_LABEL = { '5k': '5K', '10k': '10K', half: 'Half marathon' }
export const RUN_LEVELS = ['new', 'returning', 'base']
export const RUN_WEEK_MODES = ['busy', 'recovery']
export const RUN_KINDS = ['run', 'walk']
export const RUN_SOURCES = ['strava', 'fit', 'manual', 'garmin']
export const RUN_NOTE_MAX = 300
export const RUN_NAME_MAX = 80
export const PAIN_LEVELS = [0, 1, 2, 3]   // none · a niggle · it hurt · had to stop
export const RPE_MAX = 10
export const LAPS_MAX = 60
export const DEFAULT_DAYS = [2, 4, 0]     // Tuesday, Thursday, Sunday (the long day last)
export const RUN_WEEK_MODE_DAYS = 7

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const iso = v => (typeof v === 'string' && ISO.test(v) ? v : null)
const oneOf = (list, v, fallback = null) => (list.includes(v) ? v : fallback)
const num = (v, lo, hi, round = true) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < lo || n > hi) return null
  return round ? Math.round(n) : n
}
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/* ============================ the profile ============================ */

/** The stored profile read back, or null when there is none or it is broken. */
export function readRunning(v) {
  if (!isMap(v)) return null
  const goal = oneOf(RUN_GOALS, v.goal)
  const startDate = iso(v.startDate)
  if (!goal || !startDate) return null
  const days = Array.isArray(v.days)
    ? [...new Set(v.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))]
    : []
  const weekMode = isMap(v.weekMode) && oneOf(RUN_WEEK_MODES, v.weekMode.mode) && iso(v.weekMode.until)
    ? { mode: v.weekMode.mode, until: v.weekMode.until } : null
  const plan = isMap(v.plan) && Array.isArray(v.plan.weeks) ? v.plan : null
  return {
    goal,
    raceDate: iso(v.raceDate),
    startDate,
    days: days.length ? days : [...DEFAULT_DAYS],
    level: oneOf(RUN_LEVELS, v.level, 'returning'),
    hrMax: num(v.hrMax, 100, 230),
    strength: !!v.strength,
    remind: v.remind !== false,
    weekMode,
    plan,
    setAt: Number.isFinite(Number(v.setAt)) ? Number(v.setAt) : 0,
  }
}
export const runningOf = S => readRunning(S?.running)

/** The profile with `patch` applied and stamped `now`; the caller assigns it to `s.running`. */
export function withRunning(S, patch, now = Date.now()) {
  const cur = runningOf(S) || {}
  return readRunning({ ...cur, ...patch, setAt: now })
}

/** The week mode in force on `today`, or null once it has run out. */
export function runWeekModeOf(S, today = todayISO()) {
  const m = runningOf(S)?.weekMode
  return m && m.until >= today ? m.mode : null
}

/** Days from `today` to the race, negative once it has passed, null without a date. */
export function daysToRace(S, today = todayISO()) {
  const d = runningOf(S)?.raceDate
  if (!d) return null
  return Math.round((new Date(d + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000)
}

/* ============================ the run log ============================ */

const lapOf = l => {
  if (!isMap(l)) return null
  const sec = num(l.sec, 1, 86400)
  if (!sec) return null
  const out = { sec }
  const distM = num(l.distM, 0, 500000)
  if (distM) out.distM = distM
  const avgHr = num(l.avgHr, 30, 250)
  if (avgHr) out.avgHr = avgHr
  return out
}

/** A stored run read back, or null for a cleared or broken entry. */
export function readRun(entry) {
  if (!isMap(entry)) return null
  const d = iso(entry.d)
  const sec = num(entry.sec, 1, 86400)
  if (!d || !sec) return null
  const laps = Array.isArray(entry.laps) ? entry.laps.map(lapOf).filter(Boolean).slice(0, LAPS_MAX) : []
  const zones = Array.isArray(entry.zones) && entry.zones.length === 5 && entry.zones.every(z => Number.isFinite(Number(z)) && Number(z) >= 0)
    ? entry.zones.map(z => Math.round(Number(z))) : null
  return {
    d,
    start: num(entry.start, 0, 4102444800000) ?? null,
    src: oneOf(RUN_SOURCES, entry.src, 'manual'),
    srcId: str(entry.srcId, 64),
    name: str(entry.name, RUN_NAME_MAX),
    kind: oneOf(RUN_KINDS, entry.kind, 'run'),
    sec,
    distM: num(entry.distM, 0, 500000) ?? 0,
    avgHr: num(entry.avgHr, 30, 250),
    maxHr: num(entry.maxHr, 30, 250),
    cadence: num(entry.cadence, 20, 300),
    elevM: num(entry.elevM, 0, 20000),
    laps,
    zones,
    rpe: num(entry.rpe, 1, RPE_MAX),
    pain: num(entry.pain, 0, 3),
    note: str(entry.note, RUN_NOTE_MAX),
    planRef: str(entry.planRef, 40) || null,
    gps: !!entry.gps,
    // Where it was recorded, when the source says: the watch's name, and whether a Strava copy
    // came from Garmin. Garmin's own training numbers (training effect, load, VO2max estimate,
    // running dynamics) travel in a small block, labelled as Garmin's on the screen.
    device: str(entry.device, 40) || null,
    viaGarmin: !!entry.viaGarmin,
    garmin: garminBlock(entry.garmin),
  }
}
const GARMIN_KEYS = ['te', 'ate', 'load', 'vo2', 'vo', 'gct', 'stride', 'vratio']
function garminBlock(g) {
  if (!isMap(g)) return null
  const out = {}
  for (const k of GARMIN_KEYS) { const n = Number(g[k]); if (Number.isFinite(n) && n >= 0 && n < 100000) out[k] = Math.round(n * 100) / 100 }
  return Object.keys(out).length ? out : null
}

const runOrder = (a, b) => {
  const ta = a.start ?? new Date(a.d + 'T12:00:00').getTime()
  const tb = b.start ?? new Date(b.d + 'T12:00:00').getTime()
  return ta - tb || (a.id < b.id ? -1 : 1)
}

/** Every run logged, oldest first, each with its id. */
export function runsOf(S) {
  const map = isMap(S?.runLog) ? S.runLog : {}
  return Object.entries(map)
    .map(([id, v]) => { const r = readRun(v); return r ? { id, ...r } : null })
    .filter(Boolean)
    .sort(runOrder)
}

/** One run by id, or null. */
export const runOf = (S, id) => readRun(isMap(S?.runLog) ? S.runLog[id] : null)

const compact = run => {
  const out = {}
  for (const [k, v] of Object.entries(run)) {
    if (v == null || v === '' || v === false) continue
    if (Array.isArray(v) && !v.length) continue
    out[k] = v
  }
  return out
}

/** S.runLog with `id` set to `run`, stamped `now`. Invalid input leaves the map as it was. */
export function withRun(map, id, run, now = Date.now()) {
  const clean = readRun(run)
  if (!clean || typeof id !== 'string' || !id) return isMap(map) ? map : {}
  return { ...(isMap(map) ? map : {}), [id]: { ...compact(clean), _ts: now } }
}

/** S.runLog with `id` cleared (a stamped empty entry, so the removal syncs). */
export function withoutRun(map, id, now = Date.now()) {
  if (!isMap(map) || !(id in map)) return isMap(map) ? map : {}
  return { ...map, [id]: { _ts: now } }
}

/** The run id a source gives an activity: the same activity always lands on the same key. */
export const runIdFor = (src, srcId) => `${oneOf(RUN_SOURCES, src, 'manual')}:${String(srcId)}`

/* ============================ session states ============================ */

export const SESSION_STATUSES = ['done', 'skipped']

/** How a planned session went, read back, or null for a cleared or broken entry. */
export function readSessionState(entry) {
  if (!isMap(entry)) return null
  const status = oneOf(SESSION_STATUSES, entry.status)
  const d = iso(entry.d)
  if (!status || !d) return null
  return {
    status, d,
    runId: str(entry.runId, 80) || null,
    rpe: num(entry.rpe, 1, RPE_MAX),
    pain: num(entry.pain, 0, 3),
    note: str(entry.note, RUN_NOTE_MAX),
  }
}

/** Every session state, keyed by session id. */
export function sessionStatesOf(S) {
  const map = isMap(S?.runSessions) ? S.runSessions : {}
  const out = {}
  for (const [id, v] of Object.entries(map)) { const s = readSessionState(v); if (s) out[id] = s }
  return out
}

/** S.runSessions with `id` set, stamped `now`. */
export function withSessionState(map, id, state, now = Date.now()) {
  const clean = readSessionState(state)
  if (!clean || typeof id !== 'string' || !id) return isMap(map) ? map : {}
  return { ...(isMap(map) ? map : {}), [id]: { ...compact(clean), _ts: now } }
}

/** S.runSessions with `id` cleared (a stamped empty entry). */
export function withoutSessionState(map, id, now = Date.now()) {
  if (!isMap(map) || !(id in map)) return isMap(map) ? map : {}
  return { ...map, [id]: { _ts: now } }
}

/* ============================ numbers and words ============================ */

/** Seconds per kilometre, or null when there is no distance to speak of. */
export function paceSecPerKm(sec, distM) {
  if (!(sec > 0) || !(distM >= 100)) return null
  return sec / (distM / 1000)
}

/** "6:05" for a pace in seconds per kilometre; "" for none. */
export function fmtPace(secPerKm) {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return ''
  const s = Math.round(secPerKm)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "32:10" or "1:02:10" for a duration in seconds. */
export function fmtRunDur(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

/** "5.2 km" for metres (one decimal), "" for nothing. */
export function fmtKm(distM) {
  if (!(distM > 0)) return ''
  return `${(Math.round(distM / 100) / 10).toFixed(1)} km`
}

/**
 * Heart-rate zone bounds from a maximum heart rate: the usual five bands at 50/60/70/80/90 %.
 * Zone 2 (60-70 %) is the easy-running target the plan uses. Null without a maximum.
 */
export function hrZones(hrMax) {
  const m = num(hrMax, 100, 230)
  if (!m) return null
  const at = p => Math.round(m * p)
  return [[at(0.5), at(0.6)], [at(0.6), at(0.7)], [at(0.7), at(0.8)], [at(0.8), at(0.9)], [at(0.9), m]]
}

/** Which zone (1-5) a heart rate falls in, 0 below zone 1, null without a maximum. */
export function hrZoneOf(hr, hrMax) {
  const z = hrZones(hrMax)
  if (!z || !(hr > 0)) return null
  if (hr < z[0][0]) return 0
  for (let i = 0; i < 5; i++) if (hr < z[i][1] || i === 4) return i + 1
  return 5
}
