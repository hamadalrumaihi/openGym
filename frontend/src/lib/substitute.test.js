import { describe, expect, it } from 'vitest'
import { EXIDX, EXDB } from './exercises.js'
import { eqAvailable, ALL_EQUIPMENT } from './equipment.js'
import { roleOf, roleCompatible, adaptPrescription, CURATED, PATTERNS, PURPOSES, PATTERN_LABEL } from './exercise-roles.js'
import { findSubstitute, fitSlot, samePatternFirst, swapPatternOf } from './substitute.js'

describe('exercise roles', () => {
  it('names every curated id to a real exercise with a listed pattern and purpose', () => {
    for (const [id, r] of Object.entries(CURATED)) {
      expect(EXIDX[id], id).toBeTruthy()
      expect(PATTERNS, id).toContain(r.pattern)
      expect(PURPOSES, id).toContain(r.purpose)
    }
    for (const p of PATTERNS) expect(PATTERN_LABEL[p]).toBeTruthy()
  })

  it('reads the curated role first, then the rules, then nothing', () => {
    expect(roleOf('0043')).toMatchObject({ pattern: 'squat', purpose: 'strength', mode: 'reps', source: 'curated' })
    expect(roleOf('2917')).toMatchObject({ pattern: 'carry', purpose: 'carry', mode: 'time' })
    expect(roleOf('5055')).toMatchObject({ pattern: 'grip', purpose: 'grip', mode: 'time' })
    expect(roleOf('2138')).toMatchObject({ pattern: 'conditioning', mode: 'cardio' })
    // Rules over the catalogue's own fields and the name, whole words only.
    expect(roleOf(EXDB.find(e => e.n === 'barbell incline rear delt row'))).toMatchObject({ pattern: 'hpull', purpose: 'strength', source: 'rule' })
    expect(roleOf(EXDB.find(e => e.n === 'jump squat v. 2'))).toMatchObject({ pattern: 'jump', purpose: 'power' })
    expect(roleOf(EXDB.find(e => e.n === 'bodyweight squatting row (with towel)')).pattern).toBe('hpull')
    expect(roleOf(EXDB.find(e => e.n === 'lever leg extension')).pattern).toBe('squat')
    expect(roleOf(EXDB.find(e => e.n === 'cat cow stretch'))).toMatchObject({ pattern: 'mobility', purpose: 'mobility' })
    expect(roleOf({ id: 'cx', n: 'My thing', bp: 'waist', custom: true })).toMatchObject({ pattern: null, source: null })
    expect(roleOf('no-such')).toMatchObject({ pattern: null, mode: 'reps' })
  })

  it('is deterministic over the whole catalogue and never guesses a mode it cannot log', () => {
    for (const e of EXDB) {
      const a = roleOf(e), b = roleOf(e)
      expect(a).toEqual(b)
      expect(['reps', 'time', 'cardio']).toContain(a.mode)
      if (a.pattern) expect(PATTERNS).toContain(a.pattern)
    }
  })

  it('keeps power with power, carries with carries, and lets a hold stand in for slow trunk work', () => {
    expect(roleCompatible('0514', '1600')).toBe(true)       // jump squat → standing long jump
    expect(roleCompatible('0514', '0043')).toBe(false)      // jump squat ↛ barbell squat
    expect(roleCompatible('0043', '0514')).toBe(false)      // barbell squat ↛ jump squat
    expect(roleCompatible('2917', '3576')).toBe(true)       // dumbbell carry → kettlebell carry
    expect(roleCompatible('2917', '0126')).toBe(false)      // carry ↛ wrist curl
    expect(roleCompatible('0276', '0463')).toBe(true)       // dead bug → plank
    expect(roleCompatible('0085', '1459')).toBe(true)       // barbell RDL → dumbbell RDL
    expect(roleCompatible('0085', '0043')).toBe(false)      // hinge ↛ squat
    expect(roleCompatible('2138', '0685')).toBe(true)       // bike → run
    expect(roleCompatible('2138', '0043')).toBe(false)
    // No pattern on either side: anything goes, the muscle match decides.
    expect(roleCompatible({ id: 'a', n: 'thing' }, { id: 'b', n: 'other' })).toBe(true)
  })

  it('adapts a prescription across logging modes instead of copying the number', () => {
    expect(adaptPrescription({ sets: 3, reps: 12, weight: 0 }, 'reps', 'time')).toEqual({ sets: 3, mode: 'time', sec: 30, weight: 0, adapted: true })
    expect(adaptPrescription({ sets: 3, sec: 45, mode: 'time', weight: 0 }, 'time', 'reps')).toEqual({ sets: 3, mode: 'reps', reps: 10, weight: 0, adapted: true })
    expect(adaptPrescription({ sets: 3, reps: 12, restSec: 60, note: 'x' }, 'reps', 'reps')).toEqual({ sets: 3, reps: 12, restSec: 60, note: 'x' })
    expect(adaptPrescription({ sets: 3, reps: 12 }, 'reps', 'cardio')).toMatchObject({ sets: 1, min: 10, speed: 8, adapted: true })
  })
})

describe('findSubstitute', () => {
  it('keeps the pattern: a kettlebell-only gym gets a kettlebell hinge for the barbell RDL, a carry for a carry', () => {
    const rdl = findSubstitute(EXIDX['0085'], ['kettlebell'], new Set())
    expect(rdl.eq).toBe('kettlebell')
    expect(roleOf(rdl).pattern).toBe('hinge')
    const carry = findSubstitute(EXIDX['2917'], ['kettlebell'], new Set())
    expect(roleOf(carry)).toMatchObject({ pattern: 'carry', purpose: 'carry' })
    expect(carry.eq).toBe('kettlebell')
  })

  it('never replaces a power exercise with a slow lift', () => {
    const noBox = ALL_EQUIPMENT.filter(e => e !== 'medicine ball')
    const ball = findSubstitute(EXIDX['1699'], noBox, new Set())   // medicine ball rotational throw
    if (ball) expect(roleOf(ball).purpose).toBe('power')
    const jump = findSubstitute(EXIDX['0514'], ['barbell'], new Set(['0514']))
    expect(jump).toBeTruthy()
    expect(roleOf(jump)).toMatchObject({ pattern: 'jump', purpose: 'power' })
  })

  it('answers null, not a different kind of exercise, when nothing fits', () => {
    // A rower with no cardio equipment of any kind: body weight still allows running, so the
    // honest case is a pattern nothing in the catalogue does on this kit — a loaded carry with
    // nothing to carry is one (carries are tagged by their implement, never body weight).
    expect(findSubstitute(EXIDX['2917'], [], new Set())).toBeNull()
    const taken = new Set(Object.keys(EXIDX))
    expect(findSubstitute(EXIDX['0043'], ALL_EQUIPMENT, taken)).toBeNull()
  })

  it('keeps the old muscle match for an exercise with no known pattern', () => {
    const odd = EXDB.find(e => !roleOf(e).pattern && e.eq === 'cable' && e.bp === 'upper arms')
    expect(odd).toBeTruthy()
    const sub = findSubstitute(odd, ['dumbbell'], new Set())
    expect(sub).toBeTruthy()
    expect(sub.bp).toBe(odd.bp)
    expect(eqAvailable(['dumbbell'], sub)).toBe(true)
  })

  it('with sameMode, a hold never stands in for rep work in a sets × reps table', () => {
    const sub = findSubstitute(EXIDX['0276'], ['body weight'], new Set(['0276']), { sameMode: true })
    expect(sub).toBeTruthy()
    expect(roleOf(sub).mode).toBe('reps')
  })
})

describe('fitSlot', () => {
  it('leaves a covered slot alone, carries the prescription on a swap, adapts it across modes', () => {
    const cfg = { id: '0085', sets: 3, reps: 8, weight: 60, restSec: 120, note: 'slow eccentric' }
    expect(fitSlot(cfg, ['barbell'], new Set())).toEqual({ cfg, swapped: false })
    const kb = fitSlot(cfg, ['kettlebell'], new Set())
    expect(kb.swapped).toBe(true)
    expect(kb.from).toBe('0085')
    expect(kb.cfg).toMatchObject({ sets: 3, reps: 8, weight: 60, restSec: 120, note: 'slow eccentric' })
    expect(EXIDX[kb.cfg.id].eq).toBe('kettlebell')
    const hold = fitSlot({ id: '0276', sets: 3, reps: 12, weight: 0, side: true }, ['cable'], new Set(['0276', '4840', '1241', '0472', '9819', '4093']))
    if (hold.swapped && roleOf(hold.cfg.id).mode === 'time') {
      expect(hold.cfg.sec).toBe(30)
      expect(hold.cfg.reps).toBeUndefined()
      expect(hold.cfg.side).toBeUndefined()
    }
    expect(fitSlot({ id: '2917', sets: 3, mode: 'time', sec: 40 }, [], new Set())).toEqual({ cfg: null, swapped: false })
  })
})

describe('the picker’s pattern chip', () => {
  it('offers the pattern for compound work and stays quiet for accessories', () => {
    expect(swapPatternOf(EXIDX['0085'])).toBe('hinge')
    expect(swapPatternOf(EXIDX['2917'])).toBe('carry')
    expect(swapPatternOf(EXIDX['0313'])).toBe('')          // hammer curl: the muscle is the job
    expect(swapPatternOf({ id: 'x', n: 'nothing' })).toBe('')
  })

  it('lists compatible exercises, same equipment first, the exercise itself left out', () => {
    const list = samePatternFirst(EXDB, EXIDX['0652'])     // pull-up
    expect(list.length).toBeGreaterThan(5)
    expect(list.some(e => e.id === '0652')).toBe(false)
    expect(list.every(e => roleOf(e).pattern === 'vpull')).toBe(true)
    const firstOther = list.findIndex(e => e.eq !== 'body weight')
    if (firstOther > 0) expect(list.slice(firstOther).some(e => e.eq === 'body weight')).toBe(false)
    expect(samePatternFirst(EXDB, { id: 'x', n: 'nothing' })).toEqual([])
  })
})
