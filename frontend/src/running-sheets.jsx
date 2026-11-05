// The Running side's sheets: setting up Road to 10K, ticking a session, typing in a run, a
// week's actions, the coach's proposal, importing a watch's FIT file, exporting a session to
// the watch, and the busy/recovery week. Store writes go through pure helpers (lib/running.js,
// lib/running-plan.js) the way sport-sheets.jsx does; nothing here decides what to run next.
import { useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { t, tn } from './lib/i18n.js'
import { todayISO, isoOf, uid, DAYN, fmtDate } from './lib/format.js'
import { MOBILE, shareExportBlob } from './lib/mobile.js'
import {
  RUN_GOALS, GOAL_LABEL, RUN_LEVELS, RUN_WEEK_MODES, RUN_WEEK_MODE_DAYS, DEFAULT_DAYS, PAIN_LEVELS, RPE_MAX, RUN_NOTE_MAX,
  runningOf, withRunning, runsOf, withRun, withoutRun, withSessionState, withoutSessionState, sessionStatesOf, runIdFor,
  fmtPace, fmtRunDur, fmtKm, paceSecPerKm, hrZones,
} from './lib/running.js'
import { buildPlan, baselineFrom, applyWeekAction, allSessions, planEndDate, sessionLine, autoCompletions, LADDER, CONTINUOUS } from './lib/running-plan.js'
import { easierSession } from './lib/running-coach.js'
import { workoutFit, workoutFitName, workoutName } from './lib/fit-workout.js'
import { decodeFit, activityFromFit, fitRunId, fitFromZip, looksZipped } from './lib/fit-decode.js'
import { mergeRuns, RUN_SOURCE_LABEL } from './lib/run-import.js'
import { Button, Row, Switch } from './components/ui.jsx'
import Icon from './components/Icon.jsx'
import { useSheetKeyboard, tappable } from './lib/use-sheet-keyboard.js'
import { menuSheet, confirmSheet } from './sheets.jsx'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

const Chips = ({ options, value, onChange, multi, labelOf }) => <div className="chips" style={{ flexWrap: 'wrap', margin: '4px 0 12px' }}>
  {options.map(o => {
    const on = multi ? value.includes(o) : value === o
    return <button key={String(o)} type="button" className={'chip nocap' + (on ? ' on' : '')} aria-pressed={on}
      onClick={() => onChange(multi ? (on ? value.filter(v => v !== o) : [...value, o]) : o)}>{labelOf(o)}</button>
  })}
</div>
const Label = ({ children }) => <div className="small muted" style={{ marginBottom: 4, marginTop: 8 }}>{children}</div>
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const nextMonday = today => { const d = new Date(today + 'T12:00:00'); const k = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + k); return isoOf(d) }

export const LEVEL_LABEL = { new: () => t('Never really ran'), returning: () => t('Used to run, cannot sustain much now'), base: () => t('Can run 20-30 minutes today') }
export const KIND_LABEL = { runwalk: () => t('Run / walk'), easy: () => t('Easy run'), long: () => t('Long session'), race: () => t('Race'), rest: () => t('Rest') }
export const RUN_MODE_LABEL = { busy: () => t('Busy week'), recovery: () => t('Recovery week') }
const PAIN_LABEL = { 0: () => t('No pain'), 1: () => t('A niggle'), 2: () => t('It hurt'), 3: () => t('Had to stop') }

/** A file to the person: shared on the phone, downloaded in a browser. */
async function saveBytes(bytes, name, type) {
  const blob = new Blob([bytes], { type })
  if (MOBILE) { try { await shareExportBlob(blob, name); return } catch { /* fall through to a download */ } }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.style.display = 'none'
  document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 1000)
}

/* ============================ set-up ============================ */

function RunningSetup({ close, onDone }) {
  const st = useStore(s => s.S)
  const cur = runningOf(st)
  const today = todayISO()
  const [p, setP] = useState(() => cur ? { ...cur } : { goal: '10k', level: 'returning', days: [...DEFAULT_DAYS], startDate: nextMonday(today), raceDate: null, hrMax: null, strength: true, remind: true })
  const set = patch => setP(v => ({ ...v, ...patch }))
  const baseline = baselineFrom(runsOf(st), today)
  const rebuild = !cur || cur.goal !== p.goal || cur.level !== p.level || !cur.plan
  const preview = rebuild ? buildPlan({ goal: p.goal, level: p.level, stage: p.level === 'base' ? null : baseline.stage }) : cur.plan
  const end = planEndDate({ ...p, plan: preview })
  const save = () => {
    if (!p.days.length) { toast(t('Pick at least one run day')); return }
    const plan = rebuild ? preview : cur.plan
    update(s => { s.running = withRunning(s, { ...p, plan, raceDate: p.raceDate || end }) })
    toast(cur ? t('Running profile saved') : t('Road to 10K is set up'))
    close()
    onDone?.()
  }
  const toggleDay = d => set({ days: p.days.includes(d) ? p.days.filter(x => x !== d) : [...p.days, d].slice(-4) })
  return <>
    <h3>{cur ? t('Running profile') : t('Road to 10K')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('A run/walk programme that climbs one rung a week, eases every fourth, and tapers into the race. The date is a target, not a promise; weeks can be repeated.')}</div>
    <Label>{t('Goal')}</Label>
    <Chips options={RUN_GOALS} value={p.goal} onChange={goal => set({ goal, raceDate: null })} labelOf={g => GOAL_LABEL[g]} />
    <Label>{t('Where you are now')}</Label>
    <Chips options={RUN_LEVELS} value={p.level} onChange={level => set({ level })} labelOf={l => LEVEL_LABEL[l]()} />
    {p.level !== 'base' && <div className="exnote small" style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 600 }}>{t('From your recorded runs')}</div>
      {baseline.reasons.map(r => <div key={r}>{t(r)}</div>)}
      <div className="dim">{t('Starting rung: {0}', baseline.stage === CONTINUOUS ? t('continuous') : `${LADDER[baseline.stage].run / 60} min run · ${LADDER[baseline.stage].walk / 60} min walk`)}</div>
    </div>}
    <Label>{t('Run days (the last one is the long session)')}</Label>
    <div className="chips" style={{ flexWrap: 'wrap', margin: '4px 0 12px' }}>
      {[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} type="button" className={'chip nocap' + (p.days.includes(d) ? ' on' : '')} aria-pressed={p.days.includes(d)} onClick={() => toggleDay(d)}>{t(DAYN[d])}{p.days.length && p.days[p.days.length - 1] === d ? ' · ' + t('long') : ''}</button>)}
    </div>
    <Row icon="calendar" iconTint="var(--green)" title={t('Start date')}><input type="date" className="timef" value={p.startDate} onChange={e => set({ startDate: e.target.value || p.startDate })} /></Row>
    <Row icon="flag" iconTint="var(--orange)" title={t('Race date')} subtitle={end ? t('The plan ends on {0}', fmtDate(end, true, true)) : undefined}><input type="date" className="timef" value={p.raceDate || end || ''} onChange={e => set({ raceDate: e.target.value || null })} /></Row>
    <Row icon="heart" iconTint="var(--red)" title={t('Max heart rate')} subtitle={t('Optional. Gives every session a zone-2 band; Garmin Connect can fill it in.')}>
      <input type="number" className="timef" inputMode="numeric" min={100} max={230} placeholder="—" value={p.hrMax ?? ''} style={{ width: 70 }} onChange={e => set({ hrMax: e.target.value ? Number(e.target.value) : null })} />
    </Row>
    <Row icon="figureStrength" iconTint="var(--indigo)" title={t('Two running-strength sessions a week')} subtitle={t('Calves, hamstrings, glutes, quads, single-leg work and trunk. Never the day before the long run.')}>
      <Switch checked={!!p.strength} onChange={v => set({ strength: v })} />
    </Row>
    <Row icon="bell" iconTint="var(--red)" title={t('Run day reminders')} subtitle={t('With the day reminder, at its time.')}>
      <Switch checked={p.remind !== false} onChange={v => set({ remind: v })} />
    </Row>
    {!rebuild && <div className="muted small" style={{ marginTop: 8 }}>{t('Your plan and its progress are kept. Change the goal or where you are now to rebuild it.')}</div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{cur ? t('Save') : t('Build my plan')}</Button>
    {cur && <><div style={{ height: 10 }} /><Button variant="ghost" icon="trash" onClick={() => confirmSheet({ title: t('Remove the running plan?'), message: t('Your recorded runs stay. The plan and its ticks are removed.'), confirmText: t('Remove'), danger: true, onConfirm: () => { update(s => { s.running = null; s.runSessions = Object.fromEntries(Object.keys(s.runSessions || {}).map(k => [k, { _ts: Date.now() }])) }); close() } })}>{t('Remove the plan')}</Button></>}
  </>
}
export const runningSetupSheet = onDone => ui().openSheet(close => <RunningSetup close={close} onDone={onDone} />)

/* ============================ a session ============================ */

const Scale10 = ({ value, onChange }) => <div className="chips" style={{ flexWrap: 'wrap', margin: '4px 0 2px' }}>
  {Array.from({ length: RPE_MAX }, (_, i) => i + 1).map(n => <button key={n} type="button" className={'chip nocap' + (value === n ? ' on' : '')} aria-pressed={value === n} onClick={() => onChange(n)} style={{ minWidth: 36, justifyContent: 'center' }}>{n}</button>)}
</div>

function SessionSheet({ close, session, weekN }) {
  const st = useStore(s => s.S)
  const had = sessionStatesOf(st)[session.id] || null
  const runsThatDay = runsOf(st).filter(r => r.kind === 'run' && Math.abs(new Date(r.d + 'T12:00:00') - new Date(session.date + 'T12:00:00')) <= 86400000)
  const [status, setStatus] = useState(had?.status || 'done')
  const [rpe, setRpe] = useState(had?.rpe || null)
  const [pain, setPain] = useState(had?.pain ?? 0)
  const [note, setNote] = useState(had?.note || '')
  const [runId, setRunId] = useState(had?.runId || runsThatDay[0]?.id || null)
  const noteRef = useRef(null)
  const onNoteFocus = useSheetKeyboard(noteRef)
  const save = () => {
    update(s => {
      s.runSessions = withSessionState(s.runSessions, session.id, { status, d: session.date, runId: status === 'done' ? runId : null, rpe: status === 'done' ? rpe : null, pain: status === 'done' ? pain : null, note })
      if (runId && status === 'done' && s.runLog?.[runId]?.d) s.runLog = withRun(s.runLog, runId, { ...s.runLog[runId], rpe, pain, planRef: session.id })
    })
    toast(status === 'done' ? t('Session ticked') : t('Session skipped'))
    close()
  }
  const clear = () => { update(s => { s.runSessions = withoutSessionState(s.runSessions, session.id) }); close() }
  const toWatch = async () => {
    const running = runningOf(st)
    try { await saveBytes(workoutFit(session, { name: workoutName(session, weekN, running?.goal) }), workoutFitName(session, weekN), 'application/vnd.ant.fit'); toast(t('Workout file saved. Copy it to GARMIN/NewFiles on the watch.')) }
    catch { toast(t('Could not write the workout file')) }
  }
  return <>
    <h3>{KIND_LABEL[session.kind]?.() || t('Session')} · {fmtDate(session.date, true)}</h3>
    <div className="muted small" style={{ marginBottom: 6 }}>{sessionLine(session)}{session.totalMin ? ` · ${t('about {0} min', session.totalMin)}` : ''}</div>
    {session.target?.hrLow && <div className="small dim" style={{ marginBottom: 8 }}>{t('Easy: {0}-{1} bpm (zone 2)', session.target.hrLow, session.target.hrHigh)}</div>}
    <Label>{t('How did it go?')}</Label>
    <Chips options={['done', 'skipped']} value={status} onChange={setStatus} labelOf={v => (v === 'done' ? t('Done') : t('Skipped'))} />
    {status === 'done' && <>
      {runsThatDay.length > 0 && <>
        <Label>{t('The run that was this session')}</Label>
        <div className="list" style={{ marginBottom: 10 }}>
          {runsThatDay.map(r => <div key={r.id} className="item" {...tappable(() => setRunId(runId === r.id ? null : r.id))}>
            <span className="lrow-i" style={{ '--tint': 'var(--green)' }}><Icon name="figureRun" /></span>
            <div className="grow"><div className="tt">{r.name || fmtDate(r.d, true)}</div><div className="ss">{[fmtRunDur(r.sec), fmtKm(r.distM), r.avgHr ? `${r.avgHr} bpm` : null, RUN_SOURCE_LABEL[r.src]].filter(Boolean).join(' · ')}</div></div>
            {runId === r.id && <Icon name="check" className="chev" style={{ color: 'var(--acc)' }} />}
          </div>)}
        </div>
      </>}
      <Label>{t('Effort, 1 easy to 10 all-out')}</Label>
      <Scale10 value={rpe} onChange={setRpe} />
      <div className="row between small dim" style={{ marginBottom: 8 }}><span>{t('Could chat the whole way')}</span><span>{t('Nothing left')}</span></div>
      <Label>{t('Any pain?')}</Label>
      <Chips options={PAIN_LEVELS} value={pain} onChange={setPain} labelOf={v => PAIN_LABEL[v]()} />
      {pain >= 2 && <div className="exnote small" style={{ marginBottom: 8 }}>{t('Pain is a reason to rest, not to push through. The coach will suggest a rest day; if it keeps hurting, see someone qualified.')}</div>}
    </>}
    <Label>{t('Note')}</Label>
    <textarea ref={noteRef} className="input" rows={2} maxLength={RUN_NOTE_MAX} value={note} onChange={e => setNote(e.target.value)} onFocus={onNoteFocus} placeholder={t('Weather, how the legs felt, anything worth remembering')} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    <div style={{ height: 10 }} />
    <div className="row" style={{ gap: 8 }}>
      <Button size="sm" icon="download" onClick={toWatch}>{t('To watch (.fit)')}</Button>
      {had && <Button size="sm" variant="ghost" icon="trash" onClick={clear}>{t('Clear')}</Button>}
    </div>
  </>
}
export const runSessionSheet = (session, weekN) => ui().openSheet(close => <SessionSheet close={close} session={session} weekN={weekN} />)

/** Save a session's workout file without opening the sheet. */
export async function exportSessionFit(session, weekN) {
  const running = runningOf(S())
  try { await saveBytes(workoutFit(session, { name: workoutName(session, weekN, running?.goal) }), workoutFitName(session, weekN), 'application/vnd.ant.fit'); toast(t('Workout file saved. Copy it to GARMIN/NewFiles on the watch.')) }
  catch { toast(t('Could not write the workout file')) }
}

/* ============================ a run typed in ============================ */

function ManualRun({ close, date, existingId }) {
  const st = useStore(s => s.S)
  const had = existingId ? runsOf(st).find(r => r.id === existingId) : null
  const [d, setD] = useState(had?.d || date || todayISO())
  const [min, setMin] = useState(had ? Math.round(had.sec / 60) : 30)
  const [km, setKm] = useState(had?.distM ? Math.round(had.distM / 100) / 10 : '')
  const [hr, setHr] = useState(had?.avgHr || '')
  const [rpe, setRpe] = useState(had?.rpe || null)
  const [pain, setPain] = useState(had?.pain ?? 0)
  const [note, setNote] = useState(had?.note || '')
  const [kind, setKind] = useState(had?.kind || 'run')
  const pace = paceSecPerKm(min * 60, Number(km) * 1000)
  const save = () => {
    if (!(min > 0)) { toast(t('How long did it take?')); return }
    const id = existingId || runIdFor('manual', uid())
    update(s => {
      s.runLog = withRun(s.runLog, id, { ...(had || {}), d, kind, sec: Math.round(min * 60), distM: Math.round(Number(km || 0) * 1000), avgHr: hr ? Number(hr) : null, rpe, pain, note, src: had?.src || 'manual', srcId: had?.srcId || id })
      if (runningOf(s)?.plan) s.runSessions = autoCompletions(s, todayISO())
    })
    toast(had ? t('Run updated') : t('Run logged'))
    close()
  }
  const remove = () => confirmSheet({ title: t('Delete this run?'), message: t('It is removed from your log on every device.'), confirmText: t('Delete'), danger: true, onConfirm: () => { update(s => { s.runLog = withoutRun(s.runLog, existingId) }); close() } })
  return <>
    <h3>{had ? t('Edit run') : t('Log a run')}</h3>
    {had && had.src !== 'manual' && <div className="muted small" style={{ marginBottom: 8 }}>{t('Recorded by {0}. The numbers come from the device; effort, pain and the note are yours.', RUN_SOURCE_LABEL[had.src])}</div>}
    <Row icon="calendar" iconTint="var(--orange)" title={t('Date')}><input type="date" className="timef" max={todayISO()} value={d} onChange={e => setD(e.target.value || d)} /></Row>
    {(!had || had.src === 'manual') && <>
      <Label>{t('Kind')}</Label>
      <Chips options={['run', 'walk']} value={kind} onChange={setKind} labelOf={v => (v === 'run' ? t('Run') : t('Walk'))} />
      <Row icon="timer" iconTint="var(--green)" title={t('Minutes')}><input type="number" className="timef" inputMode="numeric" min={1} max={600} value={min} style={{ width: 70 }} onChange={e => setMin(Number(e.target.value))} /></Row>
      <Row icon="figureRun" iconTint="var(--blue)" title={t('Distance (km)')} subtitle={pace ? t('{0} /km', fmtPace(pace)) : t('Optional')}><input type="number" className="timef" inputMode="decimal" step="0.1" min={0} max={200} value={km} placeholder="—" style={{ width: 70 }} onChange={e => setKm(e.target.value)} /></Row>
      <Row icon="heart" iconTint="var(--red)" title={t('Average heart rate')} subtitle={t('Optional')}><input type="number" className="timef" inputMode="numeric" min={30} max={250} value={hr} placeholder="—" style={{ width: 70 }} onChange={e => setHr(e.target.value)} /></Row>
    </>}
    <Label>{t('Effort, 1 easy to 10 all-out')}</Label>
    <Scale10 value={rpe} onChange={setRpe} />
    <Label>{t('Any pain?')}</Label>
    <Chips options={PAIN_LEVELS} value={pain} onChange={setPain} labelOf={v => PAIN_LABEL[v]()} />
    <Label>{t('Note')}</Label>
    <textarea className="input" rows={2} maxLength={RUN_NOTE_MAX} value={note} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {had && <><div style={{ height: 10 }} /><Button variant="ghost" icon="trash" onClick={remove}>{t('Delete run')}</Button></>}
  </>
}
export const manualRunSheet = (date = null) => ui().openSheet(close => <ManualRun close={close} date={date} />)
export const editRunSheet = id => ui().openSheet(close => <ManualRun close={close} existingId={id} />)

/* ============================ weeks ============================ */

export const WEEK_KIND_LABEL = { build: () => t('Build'), ease: () => t('Easier week'), taper: () => t('Taper'), race: () => t('Race week') }

/** Repeat, skip, reduce or restore a week, through the menu sheet. */
export function weekActionsSheet(week) {
  const apply = action => () => {
    update(s => { const r = runningOf(s); if (r?.plan) s.running = withRunning(s, { plan: applyWeekAction(r.plan, week.n - 1, action) }) })
    toast(t('Plan updated'))
  }
  const items = [
    { icon: 'repeat', label: t('Repeat this week'), onClick: apply('repeat') },
    week.reduced ? { icon: 'undo', label: t('Restore the full week'), onClick: apply('restore') } : { icon: 'minus', label: t('Reduce this week (three quarters)'), onClick: apply('reduce') },
    ...(week.kind !== 'race' ? [{ icon: 'skipForward', label: t('Skip this week'), danger: true, onClick: apply('skip') }] : []),
  ]
  menuSheet({ title: t('Week {0}', week.n), subtitle: t('Repeating moves the race out a week; the screen shows the new end date.'), items })
}

/** The busy / recovery week, like the sport side's lighter and competition weeks. */
export function runWeekModeSheet() {
  const today = todayISO()
  const cur = runningOf(S())
  const choose = mode => () => {
    update(s => { s.running = withRunning(s, { weekMode: mode ? { mode, until: addDays(today, RUN_WEEK_MODE_DAYS - 1) } : null }) })
    toast(mode ? RUN_MODE_LABEL[mode]() : t('Normal week'))
  }
  menuSheet({
    title: t('This week'),
    subtitle: t('Busy: the second midweek run becomes optional and sessions are shorter. Recovery: everything shorter, same rung. Seven days, then back to normal.'),
    items: [
      { icon: 'check', label: t('Normal week'), onClick: choose(null) },
      ...RUN_WEEK_MODES.map(m => ({ icon: m === 'busy' ? 'hourglass' : 'heart', label: RUN_MODE_LABEL[m]() + (cur?.weekMode?.mode === m && cur.weekMode.until >= today ? ' ✓' : ''), onClick: choose(m) })),
    ],
  })
}

/* ============================ the coach's proposal ============================ */

export const ADVICE_TITLE = {
  rest: () => t('Rest today'), easier: () => t('Make today easier'), 'repeat-week': () => t('Repeat last week'), 'reduce-week': () => t('Reduce this week'),
  reschedule: () => t('A session was missed'), advance: () => t('Going well'), keep: () => t('On plan'), none: () => '',
}

/** Approve a substantial change, or see why the coach suggests what it does. */
export function coachAdviceSheet(advice, { todaySession = null } = {}) {
  const approve = () => {
    if (advice.kind === 'repeat-week' || advice.kind === 'reduce-week') {
      update(s => { const r = runningOf(s); if (r?.plan) s.running = withRunning(s, { plan: applyWeekAction(r.plan, advice.weekIdx, advice.kind === 'repeat-week' ? 'repeat' : 'reduce') }) })
      toast(t('Plan updated'))
    } else if (advice.kind === 'rest' && todaySession) {
      update(s => { s.runSessions = withSessionState(s.runSessions, todaySession.id, { status: 'skipped', d: todaySession.date, note: t('Rest: pain reported') }) })
      toast(t('Today’s session skipped'))
    }
  }
  const easier = advice.kind === 'easier' && todaySession ? easierSession(todaySession) : null
  ui().openSheet(close => <>
    <h3>{ADVICE_TITLE[advice.kind]?.() || t('Coach')}</h3>
    <div className="exnote" style={{ marginBottom: 10 }}>
      {advice.reasons.map((r, i) => <div key={i} className="small">{t(r)}</div>)}
      <div className="small dim" style={{ marginTop: 4 }}>{t('Plain rules over what you planned, ran and reported. Never a diagnosis. You decide.')}</div>
    </div>
    {easier && <div className="small" style={{ marginBottom: 10 }}>{t('Easier version of today: {0}, about {1} min.', sessionLine(easier), easier.totalMin)}</div>}
    {advice.substantial || (advice.kind === 'rest' && todaySession) ? <>
      <Button variant="primary" onClick={() => { approve(); close() }}>{advice.kind === 'rest' ? t('Skip today’s session') : t('Approve')}</Button>
      <div style={{ height: 10 }} />
      <Button variant="ghost" onClick={close}>{t('Not now')}</Button>
    </> : <Button variant="primary" onClick={close}>{t('OK')}</Button>}
  </>)
}

/* ============================ FIT files ============================ */

/**
 * Import activity files from the watch (or Garmin Connect's "Export original" zips): decoded,
 * merged into the run log with duplicates folded, matched to planned sessions.
 */
export async function importFitFiles(files) {
  const st = S()
  const hrMax = runningOf(st)?.hrMax || null
  const items = []
  let bad = 0
  for (const f of files) {
    try {
      let bytes = new Uint8Array(await f.arrayBuffer())
      if (looksZipped(bytes)) { const inner = await fitFromZip(bytes); if (!inner) { bad++; continue } bytes = inner }
      const decoded = decodeFit(bytes)
      const a = activityFromFit(decoded, { hrMax, name: f.name.replace(/\.(fit|zip)$/i, '') })
      if (!a) { bad++; continue }
      items.push({ id: fitRunId(a.run), run: { ...a.run, srcId: fitRunId(a.run) } })
    } catch { bad++ }
  }
  let counts = { added: 0, updated: 0, duplicates: 0 }
  if (items.length) {
    update(s => {
      const r = mergeRuns(s.runLog, items)
      s.runLog = r.map
      counts = { added: r.added, updated: r.updated, duplicates: r.duplicates }
      if (runningOf(s)?.plan) s.runSessions = autoCompletions(s, todayISO())
    })
  }
  const parts = []
  if (counts.added) parts.push(tn('{0} run imported', '{0} runs imported', counts.added))
  if (counts.updated) parts.push(tn('{0} updated', '{0} updated', counts.updated))
  if (counts.duplicates) parts.push(tn('{0} already there', '{0} already there', counts.duplicates))
  if (bad) parts.push(tn('{0} file could not be read', '{0} files could not be read', bad))
  toast(parts.join(' · ') || t('Nothing to import'))
  return { ...counts, bad }
}

/** Open the file picker for FIT files. */
export function pickFitFiles() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.fit,.zip,application/vnd.ant.fit,application/zip'; input.multiple = true; input.style.display = 'none'
  input.onchange = () => { const files = [...(input.files || [])]; input.remove(); if (files.length) importFitFiles(files) }
  document.body.appendChild(input)
  input.click()
}

/** A line for a run in a list: "32:10 · 4.5 km · 7:09 /km · 148 bpm". */
export function runLine(r) {
  const pace = paceSecPerKm(r.sec, r.distM)
  return [fmtRunDur(r.sec), fmtKm(r.distM), pace ? t('{0} /km', fmtPace(pace)) : null, r.avgHr ? `${r.avgHr} bpm` : null].filter(Boolean).join(' · ')
}
