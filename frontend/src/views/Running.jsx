import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO, fmtDate, DAYS } from '../lib/format.js'
import { runningOf, runsOf, sessionStatesOf, daysToRace, runWeekModeOf, GOAL_LABEL, fmtKm, fmtRunDur } from '../lib/running.js'
import { expandPlan, nextSession, upcomingSessions, planEndDate, sessionLine, LADDER, CONTINUOUS } from '../lib/running-plan.js'
import { coachAdvice, sessionReview } from '../lib/running-coach.js'
import { weeklyRunning, consistency, raceProgress } from '../lib/running-stats.js'
import { strengthWeek, buildRunStrength } from '../lib/running-strength.js'
import { RUN_SOURCE_LABEL } from '../lib/run-import.js'
import { integrationsStatus, collectPending, syncProvider } from '../lib/integrations.js'
import { runningSetupSheet, runSessionSheet, manualRunSheet, editRunSheet, weekActionsSheet, runWeekModeSheet, coachAdviceSheet, pickFitFiles, exportSessionFit, runLine, KIND_LABEL, WEEK_KIND_LABEL, RUN_MODE_LABEL, ADVICE_TITLE } from '../running-sheets.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'

const STATUS_WORD = { completed: () => t('Done'), short: () => t('Cut short'), hard: () => t('Hard'), pain: () => t('Pain'), missed: () => t('Missed'), skipped: () => t('Skipped') }
const STATUS_TINT = { completed: 'var(--green)', short: 'var(--yellow)', hard: 'var(--orange)', pain: 'var(--red)', missed: 'var(--grey)', skipped: 'var(--grey)' }

/**
 * Road to 10K: today's session, the coach's word, the weeks of the plan with their actions, the
 * runs that were recorded, and the connections' state. One column, built for a phone.
 */
export default function Running() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const update = useStore(s => s.update)
  const running = runningOf(S)
  const today = todayISO()
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // Signed in: collect what the server fetched since the last visit, then read the status.
  useEffect(() => {
    if (!user) return
    let gone = false
    collectPending({ update, getState: () => useStore.getState().S, today }).then(r => {
      if (gone) return
      if (r.added) useUI.getState().toast(tn('{0} run imported', '{0} runs imported', r.added))
    }).catch(() => {})
    integrationsStatus().then(s => { if (!gone) setStatus(s) }).catch(() => { if (!gone) setStatus(null) })
    return () => { gone = true }
  }, [user])

  const states = useMemo(() => sessionStatesOf(S), [S.runSessions])
  const weeks = useMemo(() => (running ? expandPlan(running, today) : []), [running, today])
  const review = useMemo(() => (running ? sessionReview(S, today) : []), [S, today])
  const verdictOf = useMemo(() => Object.fromEntries(review.map(r => [r.session.id, r.verdict])), [review])
  const advice = useMemo(() => (running ? coachAdvice(S, today) : null), [S, today])
  const runs = useMemo(() => runsOf(S).slice().reverse(), [S.runLog])
  const thisWeek = weeks.find(w => w.start <= today && today <= w.end) || null
  const todaySession = thisWeek?.sessions.find(s => s.date === today) || null
  const next = running ? nextSession(running, states, today) : null
  const upcoming = running ? upcomingSessions(running, states, today, 4).filter(s => s.date !== today) : []
  const progress = running ? raceProgress(S, today) : null
  const cons = running ? consistency(S, today) : null
  const week7 = weeklyRunning(S, today, 1)[0]
  const mode = runWeekModeOf(S, today)
  const toRace = daysToRace(S, today)
  const anyConnected = status?.strava?.connected || status?.garmin?.connected

  const syncNow = async () => {
    setBusy(true)
    try {
      if (status?.strava?.connected) await syncProvider('strava').catch(() => {})
      if (status?.garmin?.connected) await syncProvider('garmin').catch(() => {})
      const r = await collectPending({ update, getState: () => useStore.getState().S, today })
      useUI.getState().toast(r.added ? tn('{0} run imported', '{0} runs imported', r.added) : t('Nothing new'))
      setStatus(await integrationsStatus())
    } catch { /* the status row says what is wrong */ }
    setBusy(false)
  }

  const header = <div className="hdr">
    <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, minWidth: 0 }}>
      <h1 style={{ fontSize: 28 }}>{running ? t('Road to {0}', GOAL_LABEL[running.goal]) : t('Running')}</h1>
      <div className="sub">{running && toRace != null ? (toRace >= 0 ? tn('Race in {0} day', 'Race in {0} days', toRace) : t('Race day has passed')) : t('A run/walk plan to a finish line')}</div>
    </div>
    {running && <button className="iconbtn" aria-label={t('Running profile')} onClick={() => runningSetupSheet()}><Icon name="gear" /></button>}
  </div>

  if (!running) return <div className="narrow">
    {header}
    <div className="card">
      <div className="row" style={{ gap: 9 }}>
        <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="figureRun" /></span>
        <div><div className="lbl2">{t('Returning runner?')}</div><div className="ttl">{t('Road to 10K')}</div></div>
      </div>
      <div className="muted small" style={{ margin: '8px 0 10px' }}>{t('Three sessions a week, from one minute of running at a time to a 10K with walk breaks allowed. Your watch’s runs come in through Garmin Connect, Strava or a FIT file; the coach only ever suggests.')}</div>
      <Button variant="primary" icon="figureRun" onClick={() => runningSetupSheet()}>{t('Set up Road to 10K')}</Button>
    </div>
    {runs.length > 0 && <RunsCard runs={runs} />}
    <ConnectionsCard status={status} busy={busy} syncNow={syncNow} nav={nav} anyConnected={anyConnected} user={user} />
  </div>

  const rung = thisWeek ? LADDER[Math.min(CONTINUOUS, thisWeek.stage)] : null
  const strength = running.strength ? strengthWeek(running.days, mode) : []

  return <div className="narrow">
    {header}

    {/* The coach's word, when it has one. Substantial changes wait for a tap on Approve. */}
    {advice && advice.kind !== 'keep' && advice.kind !== 'none' && <div className="card tappable" style={{ cursor: 'pointer', borderLeft: `3px solid ${advice.kind === 'rest' ? 'var(--red)' : advice.substantial ? 'var(--orange)' : advice.kind === 'advance' ? 'var(--green)' : 'var(--yellow)'}` }} {...tappable(() => coachAdviceSheet(advice, { todaySession }))}>
      <div className="row between">
        <div style={{ minWidth: 0 }}>
          <div className="lbl2">{t('Coach')}</div>
          <div className="ttl">{ADVICE_TITLE[advice.kind]()}</div>
          <div className="small muted" style={{ marginTop: 4 }}>{t(advice.reasons[0] || '')}</div>
        </div>
        <Icon name="chevronRight" className="chev" />
      </div>
      {advice.substantial && <div className="small" style={{ marginTop: 6, color: 'var(--orange)' }}>{t('Tap to review and approve')}</div>}
    </div>}

    {/* Today */}
    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="small muted">{todaySession ? t('Today') : next ? t('Next session') : t('Plan finished')}</div>
        {thisWeek && <span className="tag">{t('Week {0} of {1}', thisWeek.n, weeks.length)}{thisWeek.reduced ? ' · ' + t('reduced') : ''}{thisWeek.mode ? ' · ' + RUN_MODE_LABEL[thisWeek.mode]() : ''}</span>}
      </div>
      {(todaySession || next) ? <>
        <div className="big" style={{ fontSize: 20 }}>{KIND_LABEL[(todaySession || next).kind]()}{!todaySession && next ? ' · ' + fmtDate(next.date, true) : ''}</div>
        <div className="small" style={{ margin: '2px 0' }}>{sessionLine(todaySession || next)}</div>
        <div className="small dim">
          {(todaySession || next).totalMin ? t('{0} min walk in · work · {1} min walk out · about {2} min', (todaySession || next).warmMin, (todaySession || next).coolMin, (todaySession || next).totalMin) : t('Walk in, race, walk out')}
          {(todaySession || next).target?.hrLow ? ` · ${t('{0}-{1} bpm', (todaySession || next).target.hrLow, (todaySession || next).target.hrHigh)}` : ` · ${t('easy, zone 2')}`}
          {(todaySession || next).optional ? ` · ${t('optional this week')}` : ''}
          {(todaySession || next).pickups ? ` · ${t('a few relaxed 20 s pickups if you like')}` : ''}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm" icon="check" onClick={() => runSessionSheet(todaySession || next, (weeks.find(w => w.key === (todaySession || next).weekKey) || {}).n)}>{t('Tick it off')}</Button>
          <Button size="sm" icon="download" onClick={() => exportSessionFit(todaySession || next, (weeks.find(w => w.key === (todaySession || next).weekKey) || {}).n)}>{t('To watch (.fit)')}</Button>
          <Button size="sm" variant="ghost" icon="plus" onClick={() => manualRunSheet(today)}>{t('Log a run')}</Button>
        </div>
      </> : <div className="muted small">{t('Every session of the plan is behind you. Set a new goal from the profile.')}</div>}
      {rung && <div className="small dim" style={{ marginTop: 8 }}>{rung.run ? t('This week’s rung: {0} min run · {1} min walk', rung.run / 60, rung.walk / 60) : t('This week’s rung: continuous running')}</div>}
    </div>

    {/* Upcoming + week mode + strength */}
    <div className="card">
      <h2>{t('Coming up')}</h2>
      {upcoming.length ? <div className="list">
        {upcoming.map(s => <div key={s.id} className="item" {...tappable(() => runSessionSheet(s, (weeks.find(w => w.key === s.weekKey) || {}).n))}>
          <span className="lrow-i" style={{ '--tint': s.kind === 'long' ? 'var(--orange)' : s.kind === 'race' ? 'var(--red)' : 'var(--green)' }}><Icon name="figureRun" /></span>
          <div className="grow"><div className="tt">{fmtDate(s.date, true)} · {KIND_LABEL[s.kind]()}</div><div className="ss">{sessionLine(s)}{s.totalMin ? ` · ${t('{0} min', s.totalMin)}` : ''}</div></div>
          <Icon name="chevronRight" className="chev" />
        </div>)}
      </div> : <div className="muted small">{t('Nothing further planned.')}</div>}
      <div className="sect-b" style={{ marginTop: 10 }}>
        <div className="lrow tap" {...tappable(runWeekModeSheet)}>
          <span className="lrow-i" style={{ '--tint': mode ? 'var(--yellow)' : 'var(--grey)' }}><Icon name="calendar" /></span>
          <span className="lrow-m"><span className="lrow-t">{mode ? RUN_MODE_LABEL[mode]() : t('Normal week')}</span><span className="lrow-s">{t('Busy or recovery week, when you need it.')}</span></span>
          <Icon name="chevronRight" className="lrow-c" />
        </div>
        {running.strength && <div className="lrow tap" {...tappable(() => addStrengthRoutines(S, update))}>
          <span className="lrow-i" style={{ '--tint': 'var(--indigo)' }}><Icon name="figureStrength" /></span>
          <span className="lrow-m"><span className="lrow-t">{t('Run strength')}</span><span className="lrow-s">{strength.length ? strength.map(x => `${x.letter}: ${t(DAYN_SHORT[x.day])}`).join(' · ') + (strength.some(x => x.short) ? ' · ' + t('short') : '') : t('No free day this week')}{hasStrengthRoutines(S) ? '' : ' · ' + t('tap to add the routines')}</span></span>
          <Icon name="chevronRight" className="lrow-c" />
        </div>}
      </div>
    </div>

    {/* Progress */}
    {progress && <div className="card">
      <h2>{t('Progress')}</h2>
      <div className="tiles" style={{ marginTop: 6 }}>
        <div className="tile"><div className="l"><Icon name="calendar" />{t('Weeks')}</div><div className="v">{progress.weeksDone}/{progress.weeks}</div></div>
        <div className="tile"><div className="l"><Icon name="check" />{t('Kept')}</div><div className="v">{cons?.planned ? `${cons.done}/${cons.planned}` : '–'}</div></div>
        <div className="tile"><div className="l"><Icon name="figureRun" />{t('This week')}</div><div className="v" style={{ fontSize: 20 }}>{week7?.distM ? fmtKm(week7.distM) : week7?.sec ? fmtRunDur(week7.sec) : '–'}</div></div>
        <div className="tile"><div className="l"><Icon name="flag" />{t('Race')}</div><div className="v" style={{ fontSize: 20 }}>{progress.raceDate ? fmtDate(progress.raceDate, false) : '–'}</div></div>
      </div>
      {progress.overrun && <div className="small" style={{ color: 'var(--orange)', marginTop: 6 }}>{t('The plan now ends on {0}, after the race date. Move the race or skip a week.', fmtDate(progress.planEnd, true, true))}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}><Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/stats')}>{t('Running stats')}</Button></div>
    </div>}

    {/* The weeks */}
    <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>{t('The plan')}</h2><Button size="xs" variant="ghost" onClick={() => setShowAll(v => !v)}>{showAll ? t('This week and next') : t('All weeks')}</Button></div>
      {(showAll ? weeks : weeks.filter(w => w.end >= today).slice(0, 2)).map(w => <div key={w.key} style={{ marginTop: 10 }}>
        <div className="row between">
          <div className="small"><b>{t('Week {0}', w.n)}</b> <span className="dim">· {WEEK_KIND_LABEL[w.kind]()}{w.reduced ? ' · ' + t('reduced') : ''} · {LADDER[Math.min(CONTINUOUS, w.stage)].run ? `${LADDER[Math.min(CONTINUOUS, w.stage)].run / 60}:${LADDER[Math.min(CONTINUOUS, w.stage)].walk / 60}` : t('continuous')}</span></div>
          <button className="iconbtn" aria-label={t('Week {0}', w.n)} onClick={() => weekActionsSheet(w)}><Icon name="more" /></button>
        </div>
        <div className="list">
          {w.sessions.map(s => {
            const v = verdictOf[s.id] || (states[s.id]?.status === 'skipped' ? 'skipped' : null)
            return <div key={s.id} className="item" {...tappable(() => runSessionSheet(s, w.n))}>
              <span className="lrow-i" style={{ '--tint': v ? STATUS_TINT[v] : s.kind === 'long' ? 'var(--orange)' : s.kind === 'race' ? 'var(--red)' : 'var(--green)' }}><Icon name={v === 'completed' ? 'check' : v === 'missed' || v === 'skipped' ? 'xmark' : 'figureRun'} /></span>
              <div className="grow"><div className="tt">{t(DAYS[s.day])} {fmtDate(s.date, false)} · {KIND_LABEL[s.kind]()}</div><div className="ss">{sessionLine(s)}{v ? ` · ${STATUS_WORD[v]()}` : s.date === today ? ` · ${t('today')}` : ''}</div></div>
              <Icon name="chevronRight" className="chev" />
            </div>
          })}
        </div>
      </div>)}
    </div>

    <RunsCard runs={runs} />
    <ConnectionsCard status={status} busy={busy} syncNow={syncNow} nav={nav} anyConnected={anyConnected} user={user} />
  </div>
}

const DAYN_SHORT = DAYS

function RunsCard({ runs }) {
  const [all, setAll] = useState(false)
  const shown = all ? runs : runs.slice(0, 5)
  return <div className="card">
    <div className="row between"><h2 style={{ margin: 0 }}>{t('Runs')}</h2>
      <div className="row" style={{ gap: 6 }}>
        <Button size="xs" icon="download" onClick={pickFitFiles}>{t('FIT file')}</Button>
        <Button size="xs" icon="plus" onClick={() => manualRunSheet()}>{t('Log')}</Button>
      </div>
    </div>
    {shown.length ? <div className="list" style={{ marginTop: 8 }}>
      {shown.map(r => <div key={r.id} className="item" {...tappable(() => editRunSheet(r.id))}>
        <span className="lrow-i" style={{ '--tint': r.kind === 'walk' ? 'var(--teal)' : 'var(--green)' }}><Icon name={r.kind === 'walk' ? 'steps' : 'figureRun'} /></span>
        <div className="grow"><div className="tt">{fmtDate(r.d, true)}{r.name ? ' · ' + r.name : ''}</div><div className="ss">{runLine(r)}{r.rpe ? ` · ${t('effort {0}', r.rpe)}` : ''}{r.pain >= 2 ? ` · ${t('pain')}` : ''} · {RUN_SOURCE_LABEL[r.src]}{r.viaGarmin && r.src === 'strava' ? ` (${t('from Garmin')})` : ''}</div></div>
        <Icon name="chevronRight" className="chev" />
      </div>)}
    </div> : <div className="muted small" style={{ marginTop: 6 }}>{t('No runs yet. Connect Garmin or Strava in Settings, import a FIT file, or log one by hand.')}</div>}
    {runs.length > 5 && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}><Button size="sm" variant="ghost" onClick={() => setAll(v => !v)}>{all ? t('Fewer') : t('All runs ({0})', runs.length)}</Button></div>}
  </div>
}

function ConnectionsCard({ status, busy, syncNow, nav, anyConnected, user }) {
  const line = (p, label) => {
    const s = status?.[p]
    if (!s) return null
    if (!s.connected) return `${label}: ${t('not connected')}`
    const when = s.lastSync ? t('synced {0}', fmtDate(new Date(s.lastSync).toISOString().slice(0, 10), false)) : t('first sync pending')
    const err = s.error === 'rate-limit' ? t('paused by the rate limit') : s.error === 'unauthorized' ? t('access expired, reconnect') : s.error ? t('last pull failed') : null
    return `${label}: ${err || when}`
  }
  return <div className="card">
    <div className="row between" style={{ alignItems: 'center', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0 }}>{t('Garmin & Strava')}</h2>
        <div className="muted small" style={{ marginTop: 4 }}>
          {!user ? t('Sign in to connect your watch’s account; FIT files work without.') : status ? [line('garmin', 'Garmin Connect'), line('strava', 'Strava')].filter(Boolean).join(' · ') : t('Checking…')}
        </div>
      </div>
      {user && anyConnected ? <Button size="sm" variant="tinted" icon="reset" disabled={busy} onClick={syncNow}>{busy ? t('Syncing…') : t('Sync now')}</Button>
        : <Button size="sm" variant="tinted" trailingIcon="chevronRight" onClick={() => nav('/settings/running')}>{t('Set up')}</Button>}
    </div>
  </div>
}

/** The two running-strength routines, added once to the plan on the free days. */
const hasStrengthRoutines = S => (S.routines || []).some(r => /^Run strength [AB]$/.test(r.name || ''))
function addStrengthRoutines(S, update) {
  if (hasStrengthRoutines(S)) { nav_plan(); return }
  const running = runningOf(S)
  const days = strengthWeek(running?.days)
  update(s => {
    const routines = buildRunStrength()
    for (const r of routines) s.routines.push(r)
    days.forEach(({ day, letter }) => {
      const r = routines.find(x => x.name.endsWith(letter))
      if (!r) return
      const cur = [].concat(s.week[day] || [])
      s.week[day] = [...cur, r.id]
    })
  })
  useUI.getState().toast(t('Run strength A and B added to your plan'))
}
const nav_plan = () => { window.location.hash = '#/plan' }
