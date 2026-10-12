// A lighter week and a competition week, laid over the progression engine's answer.
//
// Both are explicit choices (Home's sport card, lib/sport.js withWeekMode) with a date they
// end on, never something the app switches on by itself from a readiness number. What each
// does is plain and the same every time, so the person can read it before choosing it:
//
//   lighter — loads down a tenth, one set fewer (never below two), holds and carries a fifth
//             shorter. Power work keeps its load and loses a set: the point is to stay fast.
//   comp    — the week of a competition: loads down 15 %, two sets at most, holds and carries
//             about a third shorter, power work at two sets. Conditioning is left to the
//             person (its line says so); the app cannot know what the camp already did.
//
// The engine's own reason is kept and the week's line goes in front of it, so the number on
// the screen is still explained. Every target stays editable in the session.
import { weekModeOf } from './sport.js'
import { modeOf } from './history.js'
import { defaultIncrement } from './exercises.js'
import { t } from './i18n-core.js'

export const LIGHTER = { load: 0.9, setsOff: 1, minSets: 2, hold: 0.8 }
export const COMP = { load: 0.85, maxSets: 2, hold: 0.7 }

const round1 = v => Math.round(v * 10) / 10
const snap = (v, step) => (step > 0 ? Math.max(step, round1(Math.round(v / step) * step)) : round1(v))
const roundSec = v => Math.max(10, Math.round(v / 5) * 5)

/** What a week mode does, in one line, for the card that offers it. */
export const WEEK_MODE_LINE = {
  lighter: () => t('Loads down a tenth, one set fewer, holds a little shorter. Power work keeps its load.'),
  comp: () => t('Loads down 15 %, two sets at most, holds shorter, power work stays sharp. Keep conditioning easy or skip it.'),
}

/**
 * `p`, the engine's prescription for `cfg`, with the week mode in force applied. Unchanged in a
 * normal week. `mode` can be passed for tests; it is read from the state otherwise.
 */
export function applyWeekMode(S, p, cfg, mode = weekModeOf(S)) {
  if (!p || (mode !== 'lighter' && mode !== 'comp')) return p
  const logMode = modeOf(cfg)
  if (logMode === 'cardio') return p
  const rule = mode === 'lighter' ? LIGHTER : COMP
  const policy = p.policy || 'off'
  const out = { ...p, weekMode: mode }
  // The engine's own 'off' and 'first' answers change nothing on their own; the week does, so
  // the prescription has to be one applyPrescription acts on.
  if (out.kind === 'off' || out.kind === 'first') out.kind = 'hold'
  const baseSets = Number.isFinite(p.sets) ? p.sets : Math.max(1, Number(cfg?.sets) || 1)
  const fewer = mode === 'lighter' ? Math.max(rule.minSets, baseSets - rule.setsOff) : Math.min(rule.maxSets, baseSets)
  if (fewer < baseSets) { out.sets = fewer; out.cut = true }
  if (logMode === 'time') {
    const sec = Number.isFinite(p.sec) ? p.sec : Number(cfg?.sec) || 0
    if (sec > 0) out.sec = roundSec(sec * rule.hold)
  } else if (policy !== 'power') {
    // Power work keeps its load: lighter means fewer fast sets, not slower ones.
    const w = Number.isFinite(p.weight) ? p.weight : Number(cfg?.weight) || 0
    if (w > 0) out.weight = snap(w * rule.load, cfg?.inc > 0 ? cfg.inc : defaultIncrement(cfg?.id, S?.unit || 'kg'))
  }
  const own = p.why ? t(...p.why) : ''
  const kind = logMode === 'time' ? 'hold' : policy === 'power' ? 'power' : 'lift'
  const line = WEEK_LINE[mode][kind]()
  out.why = own ? ['{0} {1}', line, own] : ['{0}', line]
  return out
}

// Literal t() calls, so check-source-strings sees every key (see lib/sport-copy.js).
const WEEK_LINE = {
  lighter: {
    lift: () => t('Lighter week: load down a tenth, a set fewer.'),
    power: () => t('Lighter week: a set fewer, same load, every rep fast.'),
    hold: () => t('Lighter week: shorter holds, a set fewer.'),
  },
  comp: {
    lift: () => t('Competition week: load down 15 %, two sets at most.'),
    power: () => t('Competition week: two fast sets, same load.'),
    hold: () => t('Competition week: short holds, two sets at most.'),
  },
}
