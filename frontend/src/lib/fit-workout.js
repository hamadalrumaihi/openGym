// A planned run as a Garmin .fit WORKOUT file, for the watch's own Training > My Workouts.
//
// A workout file is a file_id (type 5), one workout message and its workout_step messages,
// written with the same encoder as the activity export (lib/fit-export.js). The step grammar
// (Garmin's FIT cookbook, "Encoding Workout Files"):
//   duration_type   0 time (ms) · 1 distance (cm) · 2 open · 6 repeat_until_steps_cmplt
//   target_type     0 speed · 1 heart_rate · 2 open
//   heart-rate targets: a zone 1-5 in target_value, or absolute bpm in the custom low/high
//                       fields offset by 100 (125 bpm → 225); 0-100 are relative values
//   speed targets:  custom low/high in mm/s
//   a repeat step:  duration_type 6, duration_value = the index of the first step to repeat,
//                   target_type open, target_value = how many times
//   intensity       0 active · 1 rest · 2 warmup · 3 cooldown · 4 recovery
//
// Loading it onto a Forerunner: plug the watch in over USB and copy the file into
// GARMIN/NewFiles; it appears under Training > My Workouts. Garmin Connect's web import takes
// activity files only, not workouts (docs/RUNNING_GARMIN.md). Nothing here is claimed to have
// run on a watch until it has: the test checks the bytes, not the device.
import { encodeFit, fitTime } from './fit-export.js'
import { GOAL_KM } from './running.js'

export const WKT = { fileId: 0, workout: 26, workoutStep: 27 }
export const DURATION = { time: 0, distance: 1, open: 2, repeat: 6 }
export const TARGET = { speed: 0, heartRate: 1, open: 2 }
export const INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4 }
export const SPORT_RUNNING = 1
const MANUFACTURER_DEVELOPMENT = 255
const HR_OFFSET = 100

const step = (index, name, { durationType, durationValue, targetType = TARGET.open, targetValue, low, high, intensity = INTENSITY.active, notes }) => ({
  global: WKT.workoutStep,
  fields: [
    [254, 'uint16', index],
    [0, 'string', name, 16],
    [1, 'enum', durationType],
    [2, 'uint32', durationValue],
    [3, 'enum', targetType],
    [4, 'uint32', targetValue],
    [5, 'uint32', low],
    [6, 'uint32', high],
    [7, 'enum', intensity],
    notes ? [8, 'string', notes, 50] : null,
  ],
})

/** The target fields for a session: a heart-rate band when known, a zone otherwise, pace if asked. */
function targetOf(session, { paceSecKm = null } = {}) {
  if (paceSecKm && paceSecKm.low && paceSecKm.high) {
    // A pace band in s/km → speed in mm/s; the slower pace is the lower speed.
    const mmps = secKm => Math.round(1000 / secKm * 1000)
    return { targetType: TARGET.speed, targetValue: 0, low: mmps(paceSecKm.high), high: mmps(paceSecKm.low) }
  }
  const t = session?.target
  if (t?.hrLow && t?.hrHigh) return { targetType: TARGET.heartRate, targetValue: 0, low: t.hrLow + HR_OFFSET, high: t.hrHigh + HR_OFFSET }
  if (t?.zone) return { targetType: TARGET.heartRate, targetValue: t.zone }
  return { targetType: TARGET.open }
}

/**
 * The messages of a workout file for one plan session (lib/running-plan.js expandPlan): a
 * warm-up walk, the run/walk block repeated, a cool-down walk; a continuous run as one step; the
 * race as a distance step. `name` is what the watch lists (16 characters are safe).
 */
export function workoutFitMessages(session, { name = 'openGym run', now = Date.now(), paceSecKm = null, serial = 1 } = {}) {
  if (!session) throw new Error('No session')
  const steps = []
  const T0 = fitTime(now)
  const ms = sec => Math.round(sec * 1000)
  if (session.warmMin > 0) steps.push(step(steps.length, 'Warm up walk', { durationType: DURATION.time, durationValue: ms(session.warmMin * 60), intensity: INTENSITY.warmup }))
  if (session.kind === 'race') {
    steps.push(step(steps.length, 'Race', { durationType: DURATION.distance, durationValue: Math.round((session.distKm || GOAL_KM['10k']) * 100000), ...targetOf(session, { paceSecKm }), notes: session.walkSec ? `Run ${Math.round(session.runSec / 60)} min, walk ${Math.round(session.walkSec / 60)} as needed` : undefined }))
  } else if (session.walkSec > 0 && session.reps > 0) {
    const first = steps.length
    steps.push(step(steps.length, 'Run', { durationType: DURATION.time, durationValue: ms(session.runSec), ...targetOf(session, { paceSecKm }), intensity: INTENSITY.active }))
    steps.push(step(steps.length, 'Walk', { durationType: DURATION.time, durationValue: ms(session.walkSec), intensity: INTENSITY.rest }))
    if (session.reps > 1) steps.push(step(steps.length, 'Repeat', { durationType: DURATION.repeat, durationValue: first, targetType: TARGET.open, targetValue: session.reps }))
  } else {
    steps.push(step(steps.length, 'Easy run', { durationType: DURATION.time, durationValue: ms((session.workMin || Math.round(session.runSec / 60)) * 60), ...targetOf(session, { paceSecKm }), intensity: INTENSITY.active }))
  }
  if (session.coolMin > 0) steps.push(step(steps.length, 'Cool down walk', { durationType: DURATION.time, durationValue: ms(session.coolMin * 60), intensity: INTENSITY.cooldown }))

  return [
    { global: WKT.fileId, fields: [[0, 'enum', 5], [1, 'uint16', MANUFACTURER_DEVELOPMENT], [2, 'uint16', 0], [3, 'uint32z', serial], [4, 'uint32', T0]] },
    { global: WKT.workout, fields: [[4, 'enum', SPORT_RUNNING], [6, 'uint16', steps.length], [8, 'string', name, 32]] },
    ...steps,
  ]
}

/** The .fit bytes for a session. */
export const workoutFit = (session, options) => encodeFit(workoutFitMessages(session, options))

/** A file name the watch and a person can both read: "opengym-w3-tue-runwalk.fit". */
export function workoutFitName(session, weekN) {
  const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][session?.day ?? 0]
  return `opengym-w${weekN ?? (session?.weekIdx ?? 0) + 1}-${day}-${session?.kind || 'run'}.fit`
}

/** The workout's name on the watch, kept to 16 characters: "R10K W3 Tue". */
export function workoutName(session, weekN, goal = '10k') {
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][session?.day ?? 0]
  const g = goal === 'half' ? 'HM' : goal === '5k' ? '5K' : '10K'
  return `R${g} W${weekN ?? (session?.weekIdx ?? 0) + 1} ${day}`.slice(0, 16)
}
