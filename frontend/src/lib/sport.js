// The sport profile (judo, Brazilian jiu-jitsu, or both) and the little mat context the gym
// side needs: which sport, gi or no-gi, how the lifting experience compares with the mat
// experience, roughly how many classes a week, how many gym days are realistic, a competition
// date, and two small logs — mat sessions done and a morning readiness check-in.
//
// Everything here is a pure read or a pure "with" over the synced state `S`:
//
//   S.sport = null | {
//     kind:       'judo' | 'bjj' | 'both'
//     gi:         'gi' | 'nogi' | 'both'      what the grip work is for (judo is always gi)
//     lifting:    'new' | 'returning' | 'regular'   gym experience, NOT mat experience
//     matPerWeek: number | null              classes a week; null = unknown or irregular
//     gymDays:    1 | 2 | 3 | 'ab' | null    what the templates were loaded for; null = not sure
//     sessionMin: number                     the session length the templates were cut to
//     compDate:   'YYYY-MM-DD' | null
//     priorities: string[]                   subset of PRIORITIES, most wanted first
//     weekMode:   null | { mode: 'lighter' | 'comp', until: 'YYYY-MM-DD' }
//     setAt:      number                     when the profile was last saved (ms)
//   }
//   S.matLog    = { [id]:  { d, sport, min, effort, note?, _ts } }   a cleared entry is { _ts }
//   S.readiness = { [iso]: { energy, soreness, sleep, _ts } }         a cleared entry is { _ts }
//
// `sport` is one object stamped as a whole on every change (lib/sync-merge.js `edited`), so two
// devices keep the profile saved last. The two logs are stamped maps, one entry per key, like
// the day notes (lib/day-notes.js): a mat session logged on the phone and a check-in made on
// the laptop both survive the next sync, and a removal is a stamped empty entry rather than a
// deleted key, or the other device's copy would bring it straight back.
//
// Changing the sport profile never touches routines, workouts or records: it is context for
// the templates, the Home card and the Coach, not a switch that rewrites the plan.
import { todayISO, isoOf } from './format.js'

export const SPORT_KINDS = ['judo', 'bjj', 'both']
export const GI_OPTIONS = ['gi', 'nogi', 'both']
export const LIFTING_LEVELS = ['new', 'returning', 'regular']
export const GYM_DAY_OPTIONS = [1, 2, 3, 'ab']
// The physical qualities a person can ask the templates and the Coach to lean towards.
export const PRIORITIES = ['grip', 'power', 'pull', 'trunk', 'legs', 'conditioning', 'mobility']
export const WEEK_MODES = ['lighter', 'comp']
export const SESSION_MIN_OPTIONS = [45, 60, 75]
export const EFFORT_LEVELS = [1, 2, 3, 4, 5]   // easy … very hard, how a mat session felt
export const MAT_NOTE_MAX = 200
export const COMP_WEEK_DAYS = 7     // the competition-week option is offered this many days out
export const LIGHTER_WEEK_DAYS = 7

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const iso = v => (typeof v === 'string' && ISO.test(v) ? v : null)
const level = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null }
const oneOf = (list, v, fallback = null) => (list.includes(v) ? v : fallback)

/* ============================ the sport profile ============================ */

/** A stored profile read back with the junk left out, or null for none. */
export function readSport(v) {
  if (!isMap(v)) return null
  const kind = oneOf(SPORT_KINDS, v.kind)
  if (!kind) return null
  const gymDays = GYM_DAY_OPTIONS.includes(v.gymDays) ? v.gymDays : (Number(v.gymDays) >= 1 && Number(v.gymDays) <= 3 ? Number(v.gymDays) : null)
  const matPerWeek = Number.isFinite(Number(v.matPerWeek)) && v.matPerWeek != null && v.matPerWeek !== '' ? Math.max(0, Math.min(14, Math.round(Number(v.matPerWeek)))) : null
  const sessionMin = Number(v.sessionMin) > 0 ? Math.max(20, Math.min(180, Math.round(Number(v.sessionMin)))) : 60
  const weekMode = isMap(v.weekMode) && WEEK_MODES.includes(v.weekMode.mode) && iso(v.weekMode.until)
    ? { mode: v.weekMode.mode, until: v.weekMode.until } : null
  return {
    kind,
    // Judo is a gi sport; the choice only means something for BJJ, and "both" keeps it.
    gi: kind === 'judo' ? 'gi' : oneOf(GI_OPTIONS, v.gi, 'both'),
    lifting: oneOf(LIFTING_LEVELS, v.lifting, 'new'),
    matPerWeek,
    gymDays,
    sessionMin,
    compDate: iso(v.compDate),
    priorities: Array.isArray(v.priorities) ? v.priorities.filter((p, i, a) => PRIORITIES.includes(p) && a.indexOf(p) === i) : [],
    weekMode,
    setAt: Number(v.setAt) || 0,
  }
}

export const sportOf = S => readSport(S?.sport)

/** `S.sport` with `patch` applied — the whole object, since it is stamped as one. */
export function withSport(S, patch, now = Date.now()) {
  const cur = sportOf(S) || { kind: 'both' }
  return readSport({ ...cur, ...patch, setAt: now })
}

/** Which sports a profile trains for: ['judo'], ['bjj'] or both. */
export const sportsOf = sport => (sport?.kind === 'both' ? ['judo', 'bjj'] : sport?.kind ? [sport.kind] : [])

/* ============================ week modes ============================ */

/** The week mode in force on `today`: a lighter or a competition week until its date, else 'normal'. */
export function weekModeOf(S, today = todayISO()) {
  const wm = sportOf(S)?.weekMode
  return wm && wm.until >= today ? wm.mode : 'normal'
}

/** Days from `today` to the competition date: 0 on the day, negative once it has passed, null without one. */
export function daysToCompetition(S, today = todayISO()) {
  const d = sportOf(S)?.compDate
  if (!d) return null
  return Math.round((new Date(d + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000)
}

/** The sport profile with a week mode set for `days` days from `today`, or cleared with `mode` null. */
export function withWeekMode(S, mode, today = todayISO(), days = 7, now = Date.now()) {
  if (!mode) return withSport(S, { weekMode: null }, now)
  const until = new Date(today + 'T12:00:00')
  until.setDate(until.getDate() + Math.max(1, days) - 1)
  return withSport(S, { weekMode: { mode, until: isoOf(until) } }, now)
}

/* ============================ the mat log ============================ */

/** A stored mat session read back, or null for a cleared or broken entry. */
export function readMatSession(entry) {
  if (!isMap(entry)) return null
  const d = iso(entry.d)
  const sport = entry.sport === 'judo' || entry.sport === 'bjj' ? entry.sport : null
  if (!d || !sport) return null
  const min = Number(entry.min)
  return {
    d, sport,
    min: Number.isFinite(min) && min > 0 ? Math.min(600, Math.round(min)) : null,
    effort: level(entry.effort),
    note: typeof entry.note === 'string' ? entry.note.trim().slice(0, MAT_NOTE_MAX) : '',
  }
}

/** Every mat session logged, oldest first, each with its id. */
export function matSessionsOf(S) {
  const map = isMap(S?.matLog) ? S.matLog : {}
  return Object.entries(map)
    .map(([id, v]) => { const s = readMatSession(v); return s ? { id, ...s } : null })
    .filter(Boolean)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.id < b.id ? -1 : 1))
}

/** S.matLog with `id` set to `session`, stamped `now`. */
export function withMatSession(map, id, session, now = Date.now()) {
  const clean = readMatSession(session)
  if (!clean) return isMap(map) ? map : {}
  const entry = { d: clean.d, sport: clean.sport, ...(clean.min ? { min: clean.min } : {}), ...(clean.effort ? { effort: clean.effort } : {}), ...(clean.note ? { note: clean.note } : {}), _ts: now }
  return { ...(isMap(map) ? map : {}), [id]: entry }
}

/** S.matLog with `id` cleared (a stamped empty entry, so the removal syncs). */
export function withoutMatSession(map, id, now = Date.now()) {
  if (!isMap(map) || !(id in map)) return isMap(map) ? map : {}
  return { ...map, [id]: { _ts: now } }
}

const dayBefore = (today, n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - n); return isoOf(d) }

/**
 * What the mat log says about the last seven days (today included): sessions, minutes and how
 * many were hard (effort 4 or 5). `logged` is false when nothing at all was logged in the
 * window — a missing log is not a quiet week, and nothing downstream may read it as one.
 */
export function matWeekOf(S, today = todayISO()) {
  const from = dayBefore(today, 6)
  const sessions = matSessionsOf(S).filter(s => s.d >= from && s.d <= today)
  return {
    logged: sessions.length > 0,
    sessions: sessions.length,
    minutes: sessions.reduce((n, s) => n + (s.min || 0), 0),
    hard: sessions.filter(s => s.effort >= 4).length,
    days: [...new Set(sessions.map(s => s.d))].sort(),
  }
}

/** Mat sessions logged today or yesterday, hard ones first — what today's gym session follows. */
export function recentMatOf(S, today = todayISO()) {
  const y = dayBefore(today, 1)
  return matSessionsOf(S).filter(s => s.d === today || s.d === y).sort((a, b) => (b.effort || 0) - (a.effort || 0))
}

/* ============================ readiness check-in ============================ */

/** A stored check-in read back, or null for a cleared or broken entry. */
export function readReadiness(entry) {
  if (!isMap(entry)) return null
  const energy = level(entry.energy), soreness = level(entry.soreness), sleep = level(entry.sleep)
  return energy && soreness && sleep ? { energy, soreness, sleep } : null
}

export const readinessOf = (S, today = todayISO()) => readReadiness(isMap(S?.readiness) ? S.readiness[today] : null)

/** S.readiness with `iso` set, stamped `now`; a null check-in clears the day. */
export function withReadiness(map, iso_, checkIn, now = Date.now()) {
  const clean = readReadiness(checkIn)
  const entry = clean ? { ...clean, _ts: now } : { _ts: now }
  return { ...(isMap(map) ? map : {}), [iso_]: entry }
}

/**
 * What the check-in and the mat log suggest for today's gym session. Reported, not measured:
 * three answers from a person plus what they logged on the mat, read by a plain rule so the
 * screen can say exactly why — never a recovery percentage.
 *
 *   level 'go'    — nothing says hold back
 *   level 'ease'  — a shorter session, or the same session a little lighter
 *   level 'light' — the lighter variant; a hard day is unlikely to go well
 *
 * `reasons` are string keys for t(). null without a check-in today and nothing recent on the
 * mat: there is nothing to say, and the app says nothing.
 */
export function readinessAdvice(S, today = todayISO()) {
  const r = readinessOf(S, today)
  const recent = recentMatOf(S, today)
  const hardRecent = recent.filter(s => s.effort >= 4)
  if (!r && !recent.length) return null
  const reasons = []
  let score = 0   // 0 go, 1 ease, 2 light
  if (r) {
    // 3 … 15: energy and sleep count up, soreness counts down.
    const total = r.energy + r.sleep + (6 - r.soreness)
    if (total <= 7) { score = 2; reasons.push('Low energy, poor sleep or heavy soreness today.') }
    else if (total <= 10) { score = 1; reasons.push('Energy, sleep or soreness is a little off today.') }
    else reasons.push('Energy, sleep and soreness all look fine.')
    if (r.soreness >= 4 && total > 7) { score = Math.max(score, 1); reasons.push('You reported heavy soreness.') }
  }
  if (hardRecent.length >= 2) { score = Math.min(2, score + 1); reasons.push('Two hard mat sessions in the last two days.') }
  else if (hardRecent.length === 1) { if (score === 0) score = 1; reasons.push('A hard mat session yesterday or today.') }
  else if (recent.length) reasons.push('Mat training yesterday or today, logged as easy or moderate.')
  return { level: ['go', 'ease', 'light'][score], reasons, checkedIn: !!r, matSessions: recent.length }
}
