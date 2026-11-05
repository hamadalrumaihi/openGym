// Turning what a source hands over into runs the log understands (lib/running.js readRun), and
// telling two copies of the same run apart.
//
// Sources and the fields each one really exposes (checked against the published specs, see
// docs/RUNNING_GARMIN.md and docs/RUNNING_STRAVA.md):
//   Garmin Connect Personal API, SummarizedActivityDTO from
//     /activitylist-service/activities/search/activities: activityId, activityName,
//     startTimeLocal, startTimeGMT, beginTimestamp, activityType.typeKey, distance (m),
//     duration / movingDuration (s), elevationGain (m), averageSpeed (m/s), averageHR, maxHR,
//     averageRunningCadenceInStepsPerMinute, hrTimeInZone_1..5 (s), aerobicTrainingEffect,
//     activityTrainingLoad, vO2MaxValue, avgVerticalOscillation, avgGroundContactTime,
//     avgStrideLength, lapCount, startLatitude/startLongitude (never kept).
//   Strava API v3, SummaryActivity / DetailedActivity: id, name, start_date, start_date_local,
//     sport_type / type, distance (m), moving_time / elapsed_time (s), total_elevation_gain (m),
//     average_heartrate, max_heartrate, average_cadence (one foot, so doubled), device_name,
//     external_id ("garmin_push_…" for a Garmin-recorded activity), laps[] with moving_time,
//     distance, average_heartrate.
//   A FIT file: lib/fit-decode.js activityFromFit.
//
// Duplicates: the same run reaches the log twice when the watch syncs to Strava and the file is
// also imported. Two runs within three minutes of each other with distances within five per
// cent are one run; the copy from the device (fit, garmin) is kept over Strava's, because it is
// the original record.
import { readRun, runIdFor, RUN_SOURCES } from './running.js'

export const SAME_START_MS = 3 * 60 * 1000
export const SAME_DIST_FRAC = 0.05
export const SOURCE_RANK = { fit: 3, garmin: 2, strava: 1, manual: 0 }

const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const localDate = s => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null)
const RUN_TYPES = /^(run|running|trail_run|trail_running|treadmill|treadmill_running|track_running|virtual_run|virtualrun|indoor_running|street_running|ultra_run|ultra_running|obstacle_run)$/i
const WALK_TYPES = /^(walk|walking|hike|hiking|casual_walking|speed_walking)$/i

/** 'run', 'walk' or null for an activity type key from either source. */
export function kindOfType(type) {
  // Strava spells its sport types in CamelCase ('TrailRun'), Garmin in snake_case ('trail_running').
  const t = String(type || '').trim().replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
  if (RUN_TYPES.test(t)) return 'run'
  if (WALK_TYPES.test(t)) return 'walk'
  return null
}

/* ------------------------------------------------------------------ Garmin -- */

/** A Garmin Personal API activity summary as `{ id, run }`, or null when it is not a run or walk. */
export function runFromGarmin(a) {
  if (!a || a.activityId == null) return null
  const kind = kindOfType(a.activityType?.typeKey || a.activityType)
  if (!kind) return null
  const sec = Math.round(num(a.duration) ?? num(a.movingDuration) ?? 0)
  if (sec <= 0) return null
  const d = localDate(a.startTimeLocal)
  const startGmt = typeof a.startTimeGMT === 'string' ? Date.parse(a.startTimeGMT.replace(' ', 'T') + (/(Z|[+-]\d\d:?\d\d)$/.test(a.startTimeGMT) ? '' : 'Z')) : null
  const start = num(a.beginTimestamp) ?? (Number.isFinite(startGmt) ? startGmt : null)
  const zones = [1, 2, 3, 4, 5].map(i => num(a[`hrTimeInZone_${i}`]))
  const run = {
    d: d || (start ? new Date(start).toISOString().slice(0, 10) : null),
    start,
    src: 'garmin',
    srcId: String(a.activityId),
    name: a.activityName || '',
    kind,
    sec,
    distM: Math.round(num(a.distance) ?? 0),
    avgHr: num(a.averageHR) != null ? Math.round(num(a.averageHR)) : null,
    maxHr: num(a.maxHR) != null ? Math.round(num(a.maxHR)) : null,
    cadence: num(a.averageRunningCadenceInStepsPerMinute) != null ? Math.round(num(a.averageRunningCadenceInStepsPerMinute)) : null,
    elevM: num(a.elevationGain) != null ? Math.round(num(a.elevationGain)) : null,
    zones: zones.every(z => z != null) ? zones.map(z => Math.round(z)) : null,
    gps: !!(a.hasPolyline || a.startLatitude != null),
    laps: [],
  }
  // Garmin's own training numbers ride along as a small, clearly-sourced block.
  const g = {}
  for (const [from, to] of [['aerobicTrainingEffect', 'te'], ['anaerobicTrainingEffect', 'ate'], ['activityTrainingLoad', 'load'], ['vO2MaxValue', 'vo2'], ['avgVerticalOscillation', 'vo'], ['avgGroundContactTime', 'gct'], ['avgStrideLength', 'stride'], ['avgVerticalRatio', 'vratio']]) {
    const v = num(a[from]); if (v != null) g[to] = Math.round(v * 100) / 100
  }
  const clean = readRun(run)
  if (!clean) return null
  return { id: runIdFor('garmin', a.activityId), run: Object.keys(g).length ? { ...clean, garmin: g } : clean }
}

/* ------------------------------------------------------------------ Strava -- */

/** A Strava activity (summary or detailed, laps optional) as `{ id, run }`, or null when it is not a run or walk. */
export function runFromStrava(a, laps = null) {
  if (!a || a.id == null) return null
  const kind = kindOfType(a.sport_type || a.type)
  if (!kind) return null
  const sec = Math.round(num(a.moving_time) ?? num(a.elapsed_time) ?? 0)
  if (sec <= 0) return null
  const start = typeof a.start_date === 'string' ? Date.parse(a.start_date) : null
  const d = localDate(a.start_date_local) || (Number.isFinite(start) ? new Date(start).toISOString().slice(0, 10) : null)
  const lapRows = Array.isArray(laps) ? laps : Array.isArray(a.laps) ? a.laps : []
  const run = {
    d,
    start: Number.isFinite(start) ? start : null,
    src: 'strava',
    srcId: String(a.id),
    name: a.name || '',
    kind,
    sec,
    distM: Math.round(num(a.distance) ?? 0),
    avgHr: num(a.average_heartrate) != null ? Math.round(num(a.average_heartrate)) : null,
    maxHr: num(a.max_heartrate) != null ? Math.round(num(a.max_heartrate)) : null,
    cadence: num(a.average_cadence) != null ? Math.round(num(a.average_cadence) * 2) : null,
    elevM: num(a.total_elevation_gain) != null ? Math.round(num(a.total_elevation_gain)) : null,
    gps: !!(a.map?.summary_polyline || a.start_latlng?.length),
    laps: lapRows.map(l => ({ sec: Math.round(num(l.moving_time) ?? num(l.elapsed_time) ?? 0), distM: Math.round(num(l.distance) ?? 0), avgHr: num(l.average_heartrate) != null ? Math.round(num(l.average_heartrate)) : undefined })).filter(l => l.sec > 0),
  }
  const clean = readRun(run)
  if (!clean) return null
  const device = typeof a.device_name === 'string' ? a.device_name : ''
  const viaGarmin = /garmin/i.test(device) || /^garmin_/i.test(String(a.external_id || ''))
  return { id: runIdFor('strava', a.id), run: { ...clean, ...(device ? { device } : {}), ...(viaGarmin ? { viaGarmin: true } : {}) } }
}

/* -------------------------------------------------------------- duplicates -- */

/** True when two runs are one run recorded twice. */
export function sameRun(a, b) {
  if (!a || !b) return false
  const ta = a.start ?? (a.d ? new Date(a.d + 'T12:00:00').getTime() : null)
  const tb = b.start ?? (b.d ? new Date(b.d + 'T12:00:00').getTime() : null)
  if (ta == null || tb == null) return false
  if (a.start == null || b.start == null) {
    // Without a start time, the same day and a near-identical duration and distance.
    return a.d === b.d && Math.abs(a.sec - b.sec) <= 120 && Math.abs((a.distM || 0) - (b.distM || 0)) <= Math.max(100, (a.distM || 0) * SAME_DIST_FRAC)
  }
  if (Math.abs(ta - tb) > SAME_START_MS) return false
  const da = a.distM || 0, db = b.distM || 0
  if (!da && !db) return Math.abs(a.sec - b.sec) <= 120
  return Math.abs(da - db) <= Math.max(da, db) * SAME_DIST_FRAC
}

/** Which of two copies to keep: the device's record over a platform's. */
export const preferRun = (a, b) => ((SOURCE_RANK[b.src] ?? 0) > (SOURCE_RANK[a.src] ?? 0) ? b : a)

/**
 * Fold `incoming` (`[{ id, run }]`) into `map` (S.runLog), stamping new or replaced entries
 * `now`: a run already there under the same id is updated; a run that duplicates one from
 * another source either replaces it (when it comes from a better source) or is dropped, and
 * the person's own notes, effort and pain on the kept entry survive either way. Returns
 * `{ map, added, updated, duplicates }`.
 */
export function mergeRuns(map, incoming, now = Date.now()) {
  let out = { ...(map || {}) }
  let added = 0, updated = 0, duplicates = 0
  const live = () => Object.entries(out).map(([id, v]) => ({ id, ...v })).filter(r => r.d && r.sec)
  for (const item of incoming || []) {
    if (!item?.id || !item.run) continue
    const run = readRun(item.run)
    if (!run) continue
    const existing = out[item.id]
    if (existing && existing.d) {
      const kept = compact({ ...run, ...own(existing), _ts: now })
      const same = JSON.stringify(sorted({ ...existing, _ts: 0 })) === JSON.stringify(sorted({ ...kept, _ts: 0 }))
      if (!same) { out[item.id] = kept; updated++ }
      continue
    }
    const twin = live().find(r => r.id !== item.id && r.src !== run.src && sameRun(r, run))
    if (twin) {
      duplicates++
      if (preferRun(twin, { ...run, id: item.id }) === twin) continue   // keep what we have
      // The better copy replaces the twin, carrying the person's notes over; the twin is cleared.
      out[item.id] = compact({ ...run, ...own(twin), _ts: now })
      out[twin.id] = { _ts: now }
      added++
      continue
    }
    out[item.id] = compact({ ...run, _ts: now })
    added++
  }
  return { map: out, added, updated, duplicates }
}

const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]))

// What the person typed on a run: kept through any re-import.
const own = r => Object.fromEntries(Object.entries({ rpe: r.rpe, pain: r.pain, note: r.note, planRef: r.planRef }).filter(([, v]) => v != null && v !== ''))

const compact = run => {
  const out = {}
  for (const [k, v] of Object.entries(run)) {
    if (v == null || v === '' || v === false) continue
    if (Array.isArray(v) && !v.length) continue
    out[k] = v
  }
  return out
}

/** Sources a run may come from, for the screens. */
export const RUN_SOURCE_LABEL = Object.fromEntries(RUN_SOURCES.map(s => [s, s === 'fit' ? 'FIT file' : s === 'strava' ? 'Strava' : s === 'garmin' ? 'Garmin Connect' : 'Typed in']))
