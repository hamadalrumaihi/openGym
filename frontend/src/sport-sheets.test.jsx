// @vitest-environment happy-dom
// The sport screens end to end against the real store: set a sport, load a plan as a loop (and
// only replace an existing loop after asking), start the shorter session, log a mat session and
// a check-in, and read it all back on the Home card. Nothing here touches a routine or a workout
// that was there before.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { beginWorkout } from './sheets.jsx'
import { loadSportPlan, sportPlanSheet, sportSetupSheet, matLogSheet, readinessSheet, weekModeSheet, exercisePurposeSheet } from './sport-sheets.jsx'
import SportCard from './components/SportCard.jsx'
import { buildSportPlan } from './lib/sport-plans.js'
import { queueOf } from './lib/queue.js'
import { matSessionsOf, readinessOf, sportOf, weekModeOf } from './lib/sport.js'
import { todayISO } from './lib/format.js'
import { effectiveRoutineIds } from './lib/history.js'
import { EXIDX } from './lib/exercises.js'

const mounted = []
const S = () => useStore.getState().S
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}
function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  return mount(<MemoryRouter>{sheet.render(() => useUI.getState().closeSheet(sheet.id))}</MemoryRouter>)
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const chip = (host, text) => [...host.querySelectorAll('.chip')].find(b => b.textContent.trim() === text)
const click = el => act(() => { el.click() })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  const s = structuredClone(DEF)
  s.routines = [{ id: 'mine', name: 'My routine', emoji: 'star', ex: [{ id: '0043', sets: 3, reps: 5, weight: 100 }] }]
  s.week = { 1: ['mine'] }
  s.workouts = [{ id: 'w0', d: '2026-09-01', start: 1, end: 2, name: 'My routine', routineIds: ['mine'], entries: [] }]
  s.weighIn = false
  useStore.setState({ S: s, user: null })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('the sport profile sheet', () => {
  it('saves the sport, gi, lifting experience and the unknowns as unknown', () => {
    sportSetupSheet()
    const host = renderTop()
    click(chip(host, 'BJJ'))
    click(chip(host, 'No-gi'))
    click([...host.querySelectorAll('.item')].find(i => i.textContent.startsWith('Lifting regularly')))
    click(chip(host, 'Not sure'))
    click(button(host, 'Save'))
    expect(sportOf(S())).toMatchObject({ kind: 'bjj', gi: 'nogi', lifting: 'regular', matPerWeek: null, gymDays: null })
    // Routines, the week and history are untouched by a profile change.
    expect(S().routines.map(r => r.id)).toEqual(['mine'])
    expect(S().week).toEqual({ 1: ['mine'] })
    expect(S().workouts).toHaveLength(1)
  })
})

describe('loading a sport plan', () => {
  it('adds the routines and makes them the loop, leaving your own routine, week and history alone', () => {
    const plan = buildSportPlan({ kind: 'judo', size: 'ab' })
    loadSportPlan(plan)
    const added = S().routines.filter(r => r.id !== 'mine')
    expect(added.map(r => r.name)).toEqual(['Judo A', 'Judo B'])
    expect(queueOf(S()).ids).toEqual(added.map(r => r.id))
    expect(S().scheduleMode).toBe('rotation')
    expect(S().routines.find(r => r.id === 'mine').ex[0].weight).toBe(100)
    expect(S().week[1]).toEqual(['mine'])
    expect(S().workouts).toHaveLength(1)
  })

  it('asks before replacing a loop that is already running, and changes nothing on cancel', () => {
    loadSportPlan(buildSportPlan({ kind: 'judo', size: 'ab' }))
    const before = structuredClone(S())
    useUI.setState({ sheets: [] })
    loadSportPlan(buildSportPlan({ kind: 'bjj', size: 'three' }))
    expect(useUI.getState().sheets).toHaveLength(1)                 // the confirmation
    expect(S().routines).toEqual(before.routines)
    const host = renderTop()
    click(button(host, 'Replace the loop'))
    expect(queueOf(S()).ids).toHaveLength(3)
    expect(S().routines.filter(r => r.name.startsWith('Judo '))).toHaveLength(2)   // still there
  })

  it('reuses identical routines instead of adding a second copy', () => {
    loadSportPlan(buildSportPlan({ kind: 'judo', size: 'ab' }))
    useUI.setState({ sheets: [] })
    loadSportPlan(buildSportPlan({ kind: 'judo', size: 'ab' }))
    renderTop(); click(button(document.body, 'Replace the loop'))
    expect(S().routines.filter(r => r.name === 'Judo A')).toHaveLength(1)
  })

  it('on fixed weekdays, asks before taking a day that holds a routine', () => {
    const plan = buildSportPlan({ kind: 'judo', size: 'two' })
    loadSportPlan(plan, { fixed: true })
    expect(useUI.getState().sheets).toHaveLength(1)
    expect(S().week[1]).toEqual(['mine'])
  })
})

describe('the shorter session', () => {
  it('starts the routine without its optional accessories, under the routine’s own name', () => {
    loadSportPlan(buildSportPlan({ kind: 'judo', size: 'ab' }))
    const A = S().routines.find(r => r.name === 'Judo A')
    beginWorkout([A.id], null, { short: true })
    const a = S().active
    expect(a.name).toBe('Judo A')
    expect(a.routineIds).toEqual([A.id])
    expect(a.entries.map(e => e.id)).toEqual(A.ex.filter(e => !e.optional).map(e => e.id))
    expect(a.entries.length).toBeLessThan(A.ex.length)
    // The routine itself keeps its accessories.
    expect(S().routines.find(r => r.id === A.id).ex).toHaveLength(A.ex.length)
  })

  it('the full session keeps them', () => {
    loadSportPlan(buildSportPlan({ kind: 'judo', size: 'ab' }))
    const A = S().routines.find(r => r.name === 'Judo A')
    beginWorkout([A.id], null)
    expect(S().active.entries).toHaveLength(A.ex.length)
  })
})

describe('mat log, check-in and week mode', () => {
  it('logs a mat session and deletes it again', () => {
    useStore.getState().update(s => { s.sport = { kind: 'judo' } })
    matLogSheet()
    const host = renderTop()
    click(chip(host, '120 min'))
    click(chip(host, '5 · Very hard'))
    click(button(host, 'Log mat session'))
    const [m] = matSessionsOf(S())
    expect(m).toMatchObject({ d: todayISO(), sport: 'judo', min: 120, effort: 5 })
    matLogSheet()
    const again = renderTop()
    click(again.querySelector('[aria-label="Delete"]'))
    expect(matSessionsOf(S())).toEqual([])
  })

  it('saves a check-in and shows the suggestion it leads to, explained', () => {
    readinessSheet()
    const host = renderTop()
    const scales = [...host.querySelectorAll('.chips')]
    click([...scales[0].querySelectorAll('.chip')][0])     // energy 1
    click([...scales[1].querySelectorAll('.chip')][4])     // soreness 5
    click([...scales[2].querySelectorAll('.chip')][0])     // sleep 1
    expect(host.textContent).toContain('Keep it light')
    expect(host.textContent).toContain('not a measurement')
    click(button(host, 'Save'))
    expect(readinessOf(S())).toEqual({ energy: 1, soreness: 5, sleep: 1 })
  })

  it('sets a lighter week and goes back to normal', () => {
    useStore.getState().update(s => { s.sport = { kind: 'bjj' } })
    weekModeSheet()
    click([...renderTop().querySelectorAll('.item')].find(i => i.textContent.startsWith('Lighter week')))
    expect(weekModeOf(S())).toBe('lighter')
    weekModeSheet()
    click([...renderTop().querySelectorAll('.item')].find(i => i.textContent.startsWith('Normal week')))
    expect(weekModeOf(S())).toBe('normal')
  })
})

describe('why this exercise', () => {
  it('says what the slot trains, why for the sport, the cues, the prescription, the rule and stand-ins', () => {
    useStore.getState().update(s => { s.sport = { kind: 'judo' } })
    exercisePurposeSheet({ id: '2917', mode: 'time', sets: 3, sec: 40, prog: 'carry', role: 'carry', restSec: 90 }, null)
    const text = renderTop().textContent
    expect(text).toContain('Grip and trunk under load')
    expect(text).toContain('holding a gi')
    expect(text).not.toContain('holding a collar')        // the BJJ line is for a BJJ profile
    expect(text).toContain('Carry: time, then load')
    expect(text).toContain('3 × 0:40')
    expect(text).toContain('Could also be')
  })
})

describe('the Home card', () => {
  it('without a sport, offers the setup and can be hidden for good', () => {
    const host = mount(<MemoryRouter><SportCard /></MemoryRouter>)
    expect(host.textContent).toContain('Set up sport profile')
    click(host.querySelector('[aria-label="Hide"]'))
    expect(S().hints.sportCard).toBe(true)
  })

  it('switches to the full card in place once a sport is set, without a hooks error', () => {
    const host = mount(<MemoryRouter><SportCard /></MemoryRouter>)
    expect(host.textContent).toContain('Set up sport profile')
    act(() => { useStore.getState().update(s => { s.sport = { kind: 'judo' } }) })
    expect(host.textContent).toContain('Judo')
    expect(host.textContent).toContain('Readiness check-in')
    act(() => { useStore.getState().update(s => { s.sport = null }) })
    expect(host.textContent).toContain('Set up sport profile')
  })

  it('the plan chooser renders the sizes once a sport is set', () => {
    useStore.getState().update(s => { s.sport = { kind: 'both' } })
    sportPlanSheet()
    const host = renderTop()
    expect(host.textContent).toContain('A/B rotation, whenever you can')
    expect(host.textContent).toContain('Judo + BJJ A')
  })

  it('shows the profile, the next session with length, kit, loads and a shorter start, and labels each estimate', () => {
    useStore.getState().update(s => { s.sport = { kind: 'bjj', gi: 'gi', lifting: 'regular' } })
    loadSportPlan(buildSportPlan({ kind: 'bjj', gi: 'gi', lifting: 'regular', size: 'ab' }))
    const host = mount(<MemoryRouter><SportCard /></MemoryRouter>)
    const text = host.textContent
    expect(text).toContain('BJJ · Gi')
    expect(text).toContain('BJJ A')
    expect(text).toMatch(/about \d+ min/)
    expect(text).toMatch(/short: about \d+ min/)
    expect(text).toContain('barbell')
    expect(text).toContain('barbell full squat')
    // Named as everywhere else (a capitalising class), not left lowercase on the card alone.
    expect([...host.querySelectorAll('.capitalize')].some(el => el.textContent === 'barbell full squat')).toBe(true)
    expect(button(host, 'Shorter session')).toBeTruthy()
    expect(text).toContain('Unlogged is unknown, not zero.')
    expect(text).toContain('from logged lifts only, not the mat')
    click(button(host, 'Shorter session'))
    expect(S().active.entries.every(e => !S().routines.find(r => r.name === 'BJJ A').ex.find(x => x.id === e.id)?.optional)).toBe(true)
  })

  it('starts the one session it shows, even when a fixed day adds a second routine today', () => {
    // The loop's next session plus a routine on today's weekday: Home's today row combines the
    // two, but the card names, times and equips only the first, so Start must open that one.
    useStore.getState().update(s => { s.sport = { kind: 'bjj', gi: 'gi', lifting: 'regular' } })
    loadSportPlan(buildSportPlan({ kind: 'bjj', gi: 'gi', lifting: 'regular', size: 'ab' }))
    const wd = new Date(todayISO() + 'T12:00:00').getDay()
    const loopIds = new Set(S().routines.flatMap(r => r.ex.map(x => x.id)))
    const other = Object.keys(EXIDX).find(id => !loopIds.has(id))
    useStore.getState().update(s => {
      s.routines.push({ id: 'extra', name: 'Extra day', emoji: 'star', ex: [{ id: other, sets: 3, reps: 10, weight: 10 }] })
      s.week = { [wd]: ['extra'] }
    })
    const today = effectiveRoutineIds(S(), todayISO())
    expect(today).toContain('extra')
    expect(today.length).toBe(2)
    const shown = S().routines.find(r => r.id === today[0])
    const host = mount(<MemoryRouter><SportCard /></MemoryRouter>)
    expect(host.textContent).toContain(shown.name)
    click(button(host, 'Start'))
    const ids = new Set(shown.ex.map(x => x.id))
    expect(S().active.entries.length).toBeGreaterThan(0)
    expect(S().active.entries.every(e => ids.has(e.id))).toBe(true)
    expect(S().active.entries.some(e => e.id === other)).toBe(false)
  })
})
