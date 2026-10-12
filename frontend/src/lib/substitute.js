// Standing in for an exercise the equipment cannot do, or that someone wants swapped.
//
// The muscle match the app always had (same body part, shared target or helper muscle, closest
// name wins) is kept, and a layer goes in front of it: the exercise's ROLE (lib/exercise-roles.js).
// When the exercise being replaced has a known movement pattern — a hinge, a vertical pull, a
// carry, a jump — only an exercise of the same pattern and a compatible purpose may stand in,
// whatever muscles the catalogue lists. A jump squat whose box is taken is replaced by another
// jump, never by a leg extension; a farmer's carry by another carry, never by a wrist curl; a
// plank by a plank, not a crunch. An exercise the rules cannot place falls back to the muscle
// match exactly as before, so nothing that used to find a substitute stops finding one.
//
// When nothing fits, the answer is null and the caller says so. A plan loader must then keep
// the slot and tell the person, or drop an optional accessory — never swap in something that
// trains the same muscle a different way and call it the same exercise.
import { EXIDX } from './exercises.js'
import { eqAvailable, ALL_EQUIPMENT } from './equipment.js'
import { roleOf, roleCompatible, adaptPrescription, roleModeOf } from './exercise-roles.js'

// Words that name the equipment, not the movement ("barbell", "lever", "machine"…), so that
// "barbell bench press" and "dumbbell bench press" read as the same lift.
const EQ_WORDS = new Set(ALL_EQUIPMENT.flatMap(e => e.split(/[^a-z0-9]+/)).concat(['lever', 'leverage', 'machine', 'sled']))
const words = ex => new Set(String(ex.n || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !EQ_WORDS.has(w)))
const jaccard = (a, b) => {
  const inter = [...a].filter(x => b.has(x)).length
  return inter ? inter / (a.size + b.size - inter) : 0
}

// Names that are not working sets: stretches, holds, mobility and warm-up drills. Never a
// stand-in for a lift, whatever body part and muscle they share with it.
export const NOT_A_LIFT = /stretch|isometric|squeeze|yoga|\bpose\b|toe touch|\broll(er)?\b|mobility|circles|warm-?up|boxing|against wall/i
// "… on exercise ball" is tagged with its weight (dumbbell), but needs a ball nobody ticked.
export const NEEDS_BALL = /exercise ball|stability ball|swiss ball|bosu/i
// Patterns where "the same muscle" is the job, so the muscle chip stays the swap's first offer.
export const ACCESSORY_PATTERNS = new Set(['arms', 'shoulders', 'calves', 'neck', 'mobility'])

// A lift is anything that is not a hold, a carry, a hang or a mobility drill: for those the
// catalogue's "stretch" and "isometric" words describe the exercise, not a reason to skip it.
const isLiftLike = role => !role.purpose || ['strength', 'power'].includes(role.purpose)

/**
 * The best stand-in for `ex` among exercises `equipment` allows, or null. Same role when `ex`
 * has one (see the top of this file), else the muscle match: same body part, and it has to
 * share the target muscle, the main muscle or a helper muscle. Closest wins: same target
 * muscle, then the movement by name, then helper muscles; loaded beats body weight for a
 * loaded lift. `taken` keeps a routine from ending up with the same exercise twice. With
 * `sameMode`, only an exercise logged the same way (reps, time, minutes) is considered.
 */
export function findSubstitute(ex, equipment, taken = new Set(), { sameMode = false, list } = {}) {
  if (!ex) return null
  const hasBall = equipment.includes('stability ball') || equipment.includes('bosu ball')
  const role = roleOf(ex)
  const byRole = !!role.pattern
  const exWords = words(ex), exSm = new Set([ex.mg, ...(ex.sm || [])].filter(Boolean))
  const loaded = ex.eq !== 'body weight'
  let best = null, bestScore = -Infinity
  for (const c of list || Object.values(EXIDX)) {
    if (!c || c.id === ex.id || taken.has(c.id) || !eqAvailable(equipment, c)) continue
    if (!hasBall && NEEDS_BALL.test(c.n)) continue
    const cRole = roleOf(c)
    if (byRole) {
      if (!roleCompatible(ex, c)) continue
      if (sameMode && cRole.mode !== role.mode) continue
      if (isLiftLike(cRole) && NOT_A_LIFT.test(c.n)) continue
    } else {
      if (c.bp !== ex.bp || NOT_A_LIFT.test(c.n)) continue
      // An exercise with no pattern never takes over a job it does not know: a jump, a carry,
      // a hang or a bike cannot stand in for plain lifting work.
      if (cRole.pattern && !['arms', 'shoulders', 'calves', 'neck'].includes(cRole.pattern) && cRole.purpose !== 'strength') continue
      if (sameMode && cRole.mode !== (role.mode || 'reps')) continue
    }
    const sm = jaccard(exSm, new Set([c.mg, ...(c.sm || [])].filter(Boolean)))
    if (!byRole && c.tg !== ex.tg && c.mg !== ex.mg && !sm) continue
    const score = 2 * (c.tg === ex.tg) + (c.mg === ex.mg) + 3 * jaccard(exWords, words(c)) + 2 * sm
      + (byRole && c.bp === ex.bp ? 1 : 0) + (byRole && cRole.purpose === role.purpose ? 1 : 0)
      - (loaded && c.eq === 'body weight' ? 3 : 0)
    // id as the last key: the same equipment always gives the same plan
    if (score > bestScore || (score === bestScore && c.id < best.id)) { best = c; bestScore = score }
  }
  return best
}

/**
 * A routine slot refitted to `equipment`: the slot as it is when the equipment covers it; a
 * stand-in with the prescription carried over (adapted when the two log differently, lib/
 * exercise-roles.js adaptPrescription) when one exists; and `{ cfg: null }` when nothing fits —
 * the caller decides what that means for the slot. `taken` is updated with the chosen id.
 */
export function fitSlot(cfg, equipment, taken = new Set()) {
  const ex = EXIDX[cfg?.id]
  if (!ex || eqAvailable(equipment, ex)) return { cfg, swapped: false }
  const sub = findSubstitute(ex, equipment, taken)
  if (!sub) return { cfg: null, swapped: false }
  taken.add(sub.id)
  const fromMode = roleModeOf(ex), toMode = roleModeOf(sub)
  const next = adaptPrescription({ ...cfg }, fromMode, toMode)
  // The flags describe the movement, not the prescription: the stand-in follows the catalogue.
  delete next.bodyweight; delete next.side
  return { cfg: { ...next, id: sub.id }, swapped: true, from: ex.id }
}

/**
 * The exercises in `list` that can take over `ex`'s job (roleCompatible), `ex` itself left
 * out, those on its equipment first; the list's own order otherwise (Array#sort is stable).
 * Empty when `ex` has no pattern — the picker then offers the muscle chip alone, as before.
 */
export function samePatternFirst(list, ex) {
  const role = roleOf(ex)
  if (!ex || !role.pattern) return []
  const eq = ex.eq || ''
  return list
    .filter(e => e && e.id !== ex.id && roleCompatible(ex, e) && !(isLiftLike(roleOf(e)) && NOT_A_LIFT.test(e.n)))
    .sort((a, b) => Number(!!eq && b.eq === eq) - Number(!!eq && a.eq === eq))
}

/** The pattern a swap away from `ex` should open on, or '' for an accessory or an unknown one. */
export function swapPatternOf(ex) {
  const p = roleOf(ex).pattern
  return p && !ACCESSORY_PATTERNS.has(p) ? p : ''
}
