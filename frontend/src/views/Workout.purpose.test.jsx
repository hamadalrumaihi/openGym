// @vitest-environment happy-dom
// During a sport-plan session each exercise says what it is for: a chip with its quality that
// opens the why, the cues and the stand-ins, and the same panel from the exercise's ⋯ menu.
// A session built from a routine the old way (no role) shows neither.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { beginWorkout } from '../sheets.jsx'
import { loadSportPlan } from '../sport-sheets.jsx'
import { buildSportPlan } from '../lib/sport-plans.js'

vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), appBase: () => '/' }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, host
beforeEach(() => {
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  const S = structuredClone(DEF)
  S.weighIn = false
  S.sport = { kind: 'judo' }
  useStore.setState({ S, user: null })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); useUI.getState().stopRest() })

describe('why this exercise, during the session', () => {
  it('shows the role chip on a sport-plan exercise and opens the explanation', () => {
    loadSportPlan(buildSportPlan({ kind: 'judo', size: 'ab' }))
    const A = useStore.getState().S.routines.find(r => r.name === 'Judo A')
    beginWorkout([A.id], null)
    // The first exercise is the warm-up drill; move to the squat.
    const idx = useStore.getState().S.active.entries.findIndex(e => e.target.role === 'squat')
    act(() => { useStore.getState().update(s => { s.active.cur = idx }) })
    act(() => root.render(<MemoryRouter><Workout /></MemoryRouter>))
    const chip = [...host.querySelectorAll('button.tag')].find(b => b.textContent === 'Leg strength')
    expect(chip).toBeTruthy()
    act(() => chip.click())
    const sheet = useUI.getState().sheets.at(-1)
    const out = document.createElement('div'); document.body.appendChild(out)
    const r2 = createRoot(out)
    act(() => r2.render(<MemoryRouter>{sheet.render(() => {})}</MemoryRouter>))
    expect(out.textContent).toContain('Leg strength')
    expect(out.textContent).toContain('Lifting an opponent')
    expect(out.textContent).toContain('Cues')
    expect(out.textContent).toContain('How it progresses')
    act(() => r2.unmount()); out.remove()
  })

  it('shows no chip on an exercise with no role', () => {
    const S = structuredClone(useStore.getState().S)
    S.active = { id: 'x', d: '2026-10-12', start: Date.now(), name: 'Mine', cur: 0, routineIds: [], entries: [{ id: '0043', target: { sets: 3, reps: 5, mode: 'reps' }, sets: [{ w: 60, r: 5, done: false }] }] }
    useStore.setState({ S })
    act(() => root.render(<MemoryRouter><Workout /></MemoryRouter>))
    expect([...host.querySelectorAll('button.tag')].length).toBe(0)
  })
})
