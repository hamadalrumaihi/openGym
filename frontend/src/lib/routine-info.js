// Two things the Home card says about a session before it starts: about how long it takes and
// what it needs from the gym. Both are read off the routine's own exercise configs, so they
// hold for any routine, a sport template or your own.
import { EXIDX } from './exercises.js'
import { accessoriesOf } from './equipment.js'
import { modeOf, isPerSide } from './history.js'

// Seconds a working set takes before its rest: a rep set at a controlled tempo, a hold its
// own length, a warm-up set a little less. Rough on purpose; the number is "about 45 min".
const REP_SET_SEC = 35
const SETUP_SEC = 60          // walking to the rack, loading, the first set's setup
export const MIN_DEFAULT_REST = 90

/**
 * About how many minutes `routine` takes with the profile's rest timer (`S.restSec`) wherever
 * an exercise sets none of its own. A per-side timed hold is done twice; a cardio slot is its
 * minutes. `filter` leaves out what the short session leaves out (lib/sport-plans.js).
 */
export function estimateMinutes(routine, S, filter = () => true) {
  const rest = Number(S?.restSec) > 0 ? Number(S.restSec) : MIN_DEFAULT_REST
  let sec = 0
  for (const e of (routine?.ex || []).filter(filter)) {
    const mode = modeOf(e)
    const sets = Math.max(1, Number(e.sets) || 1)
    if (mode === 'cardio') { sec += (Number(e.min) || 20) * 60 + SETUP_SEC; continue }
    const own = Number(e.restSec) > 0 ? Number(e.restSec) : rest
    const rows = mode === 'time' && isPerSide(e) ? sets * 2 : sets
    const each = mode === 'time' ? (Number(e.sec) || 45) : REP_SET_SEC
    const warm = Math.max(0, Math.min(5, Math.round(e.warmupSets) || 0))
    sec += SETUP_SEC + rows * each + Math.max(0, rows - 1) * own + warm * (REP_SET_SEC * 0.6 + 45)
  }
  return Math.max(5, Math.round(sec / 60 / 5) * 5)
}

/** The equipment a routine needs, most used first: the catalogue's equipment plus the bench and bar an exercise implies. */
export function routineEquipment(routine, filter = () => true) {
  const count = {}
  for (const e of (routine?.ex || []).filter(filter)) {
    const ex = EXIDX[e.id]
    if (!ex) continue
    const items = [ex.eq, ...accessoriesOf(ex)].filter(x => x && x !== 'body weight')
    for (const it of items) count[it] = (count[it] || 0) + 1
  }
  return Object.keys(count).sort((a, b) => count[b] - count[a] || (a < b ? -1 : 1))
}
