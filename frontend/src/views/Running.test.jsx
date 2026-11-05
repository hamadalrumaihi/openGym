// @vitest-environment happy-dom
// The running screens end to end against the real store: set up Road to 10K from the sheet, see
// today's session on the Running screen and the Home card, tick it off with an effort, log a run
// by hand and watch it match the next session, repeat a week, and read the stats card.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
vi.mock('./lib/api.js', () => ({ api: vi.fn(() => Promise.reject(Object.assign(new Error('offline'), { code: 'timeout' }))), setRemoteAuth: vi.fn(), webauthnOK: () => false, IS_ANDROID: false }))
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { runningSetupSheet, runSessionSheet, manualRunSheet, weekActionsSheet } from '../running-sheets.jsx'
import Running from './Running.jsx'
import RunningCard from '../components/RunningCard.jsx'
import RunningStatsCard from '../components/RunningStatsCard.jsx'
import { runningOf, runsOf, sessionStatesOf } from '../lib/running.js'
import { allSessions } from '../lib/running-plan.js'
import { todayISO } from '../lib/format.js'

const mounted = []
const S = () => useStore.getState().S
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<MemoryRouter>{el}</MemoryRouter>))
  return host
}
function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  return mount(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const chip = (host, text) => [...host.querySelectorAll('.chip')].find(b => b.textContent.trim() === text)
const click = el => act(() => { el.click() })
const setInput = (el, value) => act(() => { const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value').set; setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  const s = structuredClone(DEF)
  s.routines = []
  useStore.setState({ S: s, user: null, ready: true })
})
afterEach(() => { for (const r of mounted.splice(0)) act(() => r.unmount()); document.body.innerHTML = '' })

describe('Road to 10K end to end', () => {
  it('sets up a plan from the sheet and shows today on the screen and the card', () => {
    const home = mount(<RunningCard />)
    expect(home.textContent).toContain('Road to 10K')
    click(button(home, 'Set up Road to 10K'))
    const sheet = renderTop()
    expect(sheet.textContent).toContain('From your recorded runs')
    click(chip(sheet, 'Can run 20-30 minutes today'))
    // Start today, so today is a run day in the test regardless of the weekday.
    const today = todayISO()
    const start = sheet.querySelector('input[type="date"]')
    setInput(start, today)
    const dayChips = [...sheet.querySelectorAll('.chip')].filter(c => /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/.test(c.textContent))
    for (const c of dayChips) if (c.classList.contains('on')) click(c)
    const wd = new Date(today + 'T12:00:00').getDay()
    const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd]
    click(dayChips.find(c => c.textContent.startsWith(name)))
    click(button(sheet, 'Build my plan'))
    const r = runningOf(S())
    expect(r).toMatchObject({ goal: '10k', level: 'base', days: [wd], startDate: today })
    expect(r.plan.weeks.length).toBe(10)
    expect(r.plan.weeks[0].stage).toBe(3)
    expect(r.raceDate).toBeTruthy()

    const view = mount(<Running />)
    expect(view.textContent).toContain('Today')
    expect(view.textContent).toContain('Week 1 of 10')
    expect(view.textContent).toMatch(/\d+ × \(3 min run · 2 min walk\)/)
    expect(view.textContent).toContain('The plan')
    const card = mount(<RunningCard />)
    expect(card.textContent).toContain('Today’s run')
    expect(card.textContent).toContain('Tick it off')
  })

  it('ticks a session with an effort and pain, then the coach says rest', () => {
    const today = todayISO()
    const wd = new Date(today + 'T12:00:00').getDay()
    useStore.getState().update(s => { s.running = { goal: '10k', level: 'returning', days: [wd], startDate: today, strength: false, remind: true, hrMax: 180, plan: { weeks: Array.from({ length: 10 }, (_, i) => ({ key: 'k' + (i + 1), stage: i, kind: i === 9 ? 'race' : 'build', midMin: 20, longMin: 30 })), nextKey: 11 }, setAt: 1 } })
    const session = allSessions(runningOf(S()))[0]
    expect(session.date).toBe(today)
    runSessionSheet(session, 1)
    const sheet = renderTop()
    expect(sheet.textContent).toContain('Easy: 108-126 bpm (zone 2)')
    click(chip(sheet, '9'))
    click(chip(sheet, 'It hurt'))
    expect(sheet.textContent).toContain('Pain is a reason to rest')
    click(button(sheet, 'Save'))
    expect(sessionStatesOf(S())[session.id]).toMatchObject({ status: 'done', rpe: 9, pain: 2 })
    const view = mount(<Running />)
    expect(view.textContent).toContain('Rest today')
    expect(view.textContent).toContain('Pain was reported in the last week.')
  })

  it('logs a run by hand, matches it to the next session, and repeats a week from the menu', () => {
    const today = todayISO()
    const wd = new Date(today + 'T12:00:00').getDay()
    useStore.getState().update(s => { s.running = { goal: '5k', level: 'new', days: [wd], startDate: today, plan: { weeks: Array.from({ length: 8 }, (_, i) => ({ key: 'k' + (i + 1), stage: i, kind: i === 7 ? 'race' : 'build', midMin: 20, longMin: 25 })), nextKey: 9 }, setAt: 1 } })
    manualRunSheet(today)
    const sheet = renderTop()
    const nums = sheet.querySelectorAll('input[type="number"]')
    setInput(nums[0], '28')
    setInput(nums[1], '3.2')
    click(chip(sheet, '5'))
    click(button(sheet, 'Save'))
    const runs = runsOf(S())
    expect(runs.length).toBe(1)
    expect(runs[0]).toMatchObject({ sec: 1680, distM: 3200, rpe: 5, src: 'manual', d: today })
    const first = allSessions(runningOf(S()))[0]
    expect(sessionStatesOf(S())[first.id]).toMatchObject({ status: 'done', runId: runs[0].id })

    const view = mount(<Running />)
    expect(view.textContent).toContain('Runs')
    expect(view.textContent).toContain('28:00 · 3.2 km · 8:45 /km')
    // Repeat week 1 through its menu: the sheet is the menu sheet, so drive the action directly.
    const before = runningOf(S()).plan.weeks.length
    weekActionsSheet({ n: 1, kind: 'build', reduced: false })
    const menu = renderTop()
    click([...menu.querySelectorAll('button, .item, .lrow, [role="button"]')].find(e => e.textContent.includes('Repeat this week')))
    expect(runningOf(S()).plan.weeks.length).toBe(before + 1)
    expect(sessionStatesOf(S())[first.id].status).toBe('done')   // ticks survive the renumbering

    const stats = mount(<RunningStatsCard S={S()} />)
    expect(stats.textContent).toContain('Running')
    expect(stats.textContent).toContain('This week')
    expect(stats.textContent).toContain('3.2 km')
  })

  it('shows nothing on Stats and folds the Home card away without a plan or a run', () => {
    expect(mount(<RunningStatsCard S={S()} />).textContent).toBe('')
    const home = mount(<RunningCard />)
    click(home.querySelector('button[aria-label="Hide"]'))
    expect(S().hints.runningCard).toBe(true)
    expect(mount(<RunningCard />).textContent).toBe('')
  })
})
