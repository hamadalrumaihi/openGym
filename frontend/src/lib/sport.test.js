// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  readSport, sportOf, withSport, sportsOf, weekModeOf, withWeekMode, daysToCompetition,
  readMatSession, matSessionsOf, withMatSession, withoutMatSession, matWeekOf, recentMatOf,
  readReadiness, readinessOf, withReadiness, readinessAdvice,
} from './sport.js'
import { mergeStates, stampChange, resetIdsOf, STAMPED_MAPS } from './sync-merge.js'
import * as srv from '../../../api/sync-stamps.js'
import { DEF, restoredStateFor } from '../store/useStore.js'

const T = '2026-10-12'

describe('the sport profile', () => {
  it('reads nothing for no profile or an unknown sport', () => {
    expect(readSport(null)).toBeNull()
    expect(readSport({ kind: 'wrestling' })).toBeNull()
    expect(sportOf({})).toBeNull()
  })

  it('cleans what it reads: judo is always gi, gym days are one of the options, priorities are known and unique', () => {
    const p = readSport({ kind: 'judo', gi: 'nogi', gymDays: '2', matPerWeek: '3.6', sessionMin: 1, priorities: ['grip', 'grip', 'nope', 'power'], compDate: 'tomorrow', weekMode: { mode: 'comp', until: 'x' } })
    expect(p).toEqual({ kind: 'judo', gi: 'gi', lifting: 'new', matPerWeek: 4, gymDays: 2, sessionMin: 20, compDate: null, priorities: ['grip', 'power'], weekMode: null, setAt: 0 })
    expect(readSport({ kind: 'bjj', gymDays: 'ab' }).gymDays).toBe('ab')
    expect(readSport({ kind: 'bjj', gymDays: 5 }).gymDays).toBeNull()
    expect(readSport({ kind: 'bjj' }).gi).toBe('both')
    // Unknown mat frequency stays unknown, never zero.
    expect(readSport({ kind: 'bjj', matPerWeek: null }).matPerWeek).toBeNull()
    expect(readSport({ kind: 'bjj', matPerWeek: 0 }).matPerWeek).toBe(0)
  })

  it('patches the whole object and stamps setAt', () => {
    const S = { sport: { kind: 'bjj', gi: 'gi', priorities: ['grip'] } }
    const next = withSport(S, { kind: 'both', compDate: '2026-11-01' }, 5)
    expect(next.kind).toBe('both')
    expect(next.gi).toBe('gi')
    expect(next.priorities).toEqual(['grip'])
    expect(next.compDate).toBe('2026-11-01')
    expect(next.setAt).toBe(5)
    expect(sportsOf(next)).toEqual(['judo', 'bjj'])
    expect(sportsOf(sportOf({ sport: { kind: 'judo' } }))).toEqual(['judo'])
  })

  it('runs a week mode until its date, then reads as normal again', () => {
    const S = { sport: { kind: 'judo' } }
    const lighter = withWeekMode(S, 'lighter', T, 7)
    expect(lighter.weekMode).toEqual({ mode: 'lighter', until: '2026-10-18' })
    expect(weekModeOf({ sport: lighter }, T)).toBe('lighter')
    expect(weekModeOf({ sport: lighter }, '2026-10-18')).toBe('lighter')
    expect(weekModeOf({ sport: lighter }, '2026-10-19')).toBe('normal')
    expect(withWeekMode({ sport: lighter }, null, T).weekMode).toBeNull()
    expect(weekModeOf({}, T)).toBe('normal')
  })

  it('counts the days to a competition', () => {
    expect(daysToCompetition({ sport: { kind: 'judo', compDate: '2026-10-19' } }, T)).toBe(7)
    expect(daysToCompetition({ sport: { kind: 'judo', compDate: '2026-10-10' } }, T)).toBe(-2)
    expect(daysToCompetition({ sport: { kind: 'judo' } }, T)).toBeNull()
  })
})

describe('the mat log', () => {
  it('reads an entry back with the junk left out, and nothing for a cleared one', () => {
    expect(readMatSession({ d: T, sport: 'judo', min: '90.4', effort: 4, note: ' randori ' })).toEqual({ d: T, sport: 'judo', min: 90, effort: 4, note: 'randori' })
    expect(readMatSession({ d: T, sport: 'mma' })).toBeNull()
    expect(readMatSession({ _ts: 1 })).toBeNull()
    expect(readMatSession({ d: T, sport: 'bjj', effort: 9 })).toEqual({ d: T, sport: 'bjj', min: null, effort: null, note: '' })
  })

  it('adds, lists oldest first and clears with a stamped empty entry', () => {
    let map = withMatSession({}, 'b', { d: '2026-10-11', sport: 'bjj', min: 60, effort: 3 }, 10)
    map = withMatSession(map, 'a', { d: '2026-10-10', sport: 'judo', min: 90, effort: 5 }, 11)
    expect(matSessionsOf({ matLog: map }).map(s => s.id)).toEqual(['a', 'b'])
    expect(map.b._ts).toBe(10)
    const gone = withoutMatSession(map, 'a', 12)
    expect(gone.a).toEqual({ _ts: 12 })
    expect(matSessionsOf({ matLog: gone }).map(s => s.id)).toEqual(['b'])
    // A broken session adds nothing.
    expect(withMatSession(map, 'c', { d: 'nope' }, 13)).toBe(map)
  })

  it('summarises the week honestly: an empty log is unlogged, not a quiet week', () => {
    expect(matWeekOf({}, T)).toEqual({ logged: false, sessions: 0, minutes: 0, hard: 0, days: [] })
    let map = {}
    map = withMatSession(map, '1', { d: '2026-10-06', sport: 'judo', min: 60, effort: 5 })   // 6 days ago: in
    map = withMatSession(map, '2', { d: '2026-10-05', sport: 'judo', min: 60, effort: 5 })   // 7 days ago: out
    map = withMatSession(map, '3', { d: T, sport: 'bjj', min: 75, effort: 2 })
    map = withMatSession(map, '4', { d: T, sport: 'bjj', min: 30, effort: 4 })
    expect(matWeekOf({ matLog: map }, T)).toEqual({ logged: true, sessions: 3, minutes: 165, hard: 2, days: ['2026-10-06', T] })
    expect(recentMatOf({ matLog: map }, T).map(s => s.id)).toEqual(['4', '3'])
  })
})

describe('the readiness check-in', () => {
  it('needs all three answers in range', () => {
    expect(readReadiness({ energy: 3, soreness: 2, sleep: 4 })).toEqual({ energy: 3, soreness: 2, sleep: 4 })
    expect(readReadiness({ energy: 3, soreness: 2 })).toBeNull()
    expect(readReadiness({ energy: 6, soreness: 2, sleep: 4 })).toBeNull()
    const map = withReadiness({}, T, { energy: 3, soreness: 2, sleep: 4 }, 7)
    expect(readinessOf({ readiness: map }, T)).toEqual({ energy: 3, soreness: 2, sleep: 4 })
    expect(withReadiness(map, T, null, 8)[T]).toEqual({ _ts: 8 })
  })

  it('says nothing with nothing to go on, and explains every level', () => {
    expect(readinessAdvice({}, T)).toBeNull()
    const S = r => ({ readiness: withReadiness({}, T, r) })
    expect(readinessAdvice(S({ energy: 5, soreness: 1, sleep: 5 }), T)).toMatchObject({ level: 'go', checkedIn: true })
    expect(readinessAdvice(S({ energy: 3, soreness: 3, sleep: 3 }), T)).toMatchObject({ level: 'ease' })
    expect(readinessAdvice(S({ energy: 1, soreness: 5, sleep: 2 }), T)).toMatchObject({ level: 'light' })
    // Heavy soreness alone is reason enough to ease off.
    expect(readinessAdvice(S({ energy: 5, soreness: 5, sleep: 5 }), T).level).toBe('ease')
  })

  it('reads the mat log beside the check-in, never as a recovery number', () => {
    const map = withMatSession(withMatSession({}, 'a', { d: '2026-10-11', sport: 'judo', effort: 5 }), 'b', { d: T, sport: 'bjj', effort: 4 })
    const a = readinessAdvice({ matLog: map }, T)
    expect(a.level).toBe('ease')
    expect(a.checkedIn).toBe(false)
    expect(a.matSessions).toBe(2)
    expect(a.reasons).toContain('Two hard mat sessions in the last two days.')
    // A great check-in and two hard sessions: still a step down, and both reasons are named.
    const both = readinessAdvice({ matLog: map, readiness: withReadiness({}, T, { energy: 5, soreness: 1, sleep: 5 }) }, T)
    expect(both.level).toBe('ease')
    expect(both.reasons).toContain('Energy, sleep and soreness all look fine.')
    // An easy class yesterday on its own is only mentioned.
    const easy = readinessAdvice({ matLog: withMatSession({}, 'c', { d: '2026-10-11', sport: 'bjj', effort: 2 }) }, T)
    expect(easy.level).toBe('go')
    // Nothing reports percentages or numbers.
    for (const r of [a, both, easy]) for (const line of r.reasons) expect(line).not.toMatch(/%|\d{2,}/)
  })
})

describe('persistence of the new fields', () => {
  it('has defaults in DEF, so a profile saved before them overlays cleanly', () => {
    expect(DEF.sport).toBeNull()
    expect(DEF.matLog).toEqual({})
    expect(DEF.readiness).toEqual({})
  })

  it('survives a backup restore and a pull into a copy that never had them', () => {
    const backup = { _ts: 5, routines: [], workouts: [], sport: { kind: 'bjj', gi: 'nogi' }, matLog: withMatSession({}, 'm', { d: T, sport: 'bjj', min: 60 }), readiness: withReadiness({}, T, { energy: 3, soreness: 3, sleep: 3 }) }
    const restored = restoredStateFor({ routines: [], workouts: [] }, backup)
    expect(sportOf(restored)).toMatchObject({ kind: 'bjj', gi: 'nogi' })
    expect(matSessionsOf(restored).map(s => s.id)).toEqual(['m'])
    expect(readinessOf(restored, T)).toEqual({ energy: 3, soreness: 3, sleep: 3 })
    // A legacy copy with none of the fields reads as no sport, an empty log, no check-in.
    const legacy = restoredStateFor({ routines: [], workouts: [] }, { _ts: 5, routines: [], workouts: [] })
    expect(sportOf(legacy)).toBeNull()
    expect(matSessionsOf(legacy)).toEqual([])
    expect(readinessOf(legacy, T)).toBeNull()
  })

  it('stamps the logs per entry on both sides and the profile as a whole', () => {
    expect(STAMPED_MAPS).toContain('matLog')
    expect(STAMPED_MAPS).toContain('readiness')
    expect(srv.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    expect(resetIdsOf({ matLog: { a: { d: T, sport: 'judo', _ts: 1 } }, readiness: { [T]: { _ts: 1 } } })).toMatchObject({ matLog: ['a'], readiness: [T] })
  })

  it('merges two devices’ mat sessions and check-ins instead of keeping one copy whole', () => {
    const base = { _ts: 100, routines: [], workouts: [], matLog: {}, readiness: {}, sport: null }
    const phone = structuredClone(base)
    phone.matLog = withMatSession({}, 'p', { d: T, sport: 'judo', min: 60, effort: 4 }, 200)
    phone.sport = withSport(phone, { kind: 'judo' }, 200)
    phone._ts = stampChange(base, phone, 200)
    const laptop = structuredClone(base)
    laptop.readiness = withReadiness({}, T, { energy: 4, soreness: 2, sleep: 4 }, 300)
    laptop.sport = withSport(laptop, { kind: 'both', gi: 'nogi' }, 300)
    laptop._ts = stampChange(base, laptop, 300)
    const merged = mergeStates(phone, laptop)
    expect(matSessionsOf(merged).map(s => s.id)).toEqual(['p'])
    expect(readinessOf(merged, T)).toEqual({ energy: 4, soreness: 2, sleep: 4 })
    // The profile is one setting: the copy that saved it last wins, whole.
    expect(sportOf(merged).kind).toBe('both')
    expect(sportOf(merged).gi).toBe('nogi')
    // A removal on one device beats the other copy's older entry.
    const cleared = structuredClone(merged)
    cleared.matLog = withoutMatSession(cleared.matLog, 'p', 400)
    cleared._ts = stampChange(merged, cleared, 400)
    expect(matSessionsOf(mergeStates(phone, cleared))).toEqual([])
    expect(matSessionsOf(mergeStates(cleared, phone))).toEqual([])
  })
})
