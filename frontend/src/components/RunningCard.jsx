import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO, fmtDate } from '../lib/format.js'
import { runningOf, sessionStatesOf, daysToRace, GOAL_LABEL, fmtKm } from '../lib/running.js'
import { nextSession, sessionLine } from '../lib/running-plan.js'
import { coachAdvice } from '../lib/running-coach.js'
import { weeklyRunning } from '../lib/running-stats.js'
import { runningSetupSheet, runSessionSheet, coachAdviceSheet, KIND_LABEL, ADVICE_TITLE } from '../running-sheets.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'

/**
 * Home's running card: the next planned run (today's first), the coach's one line when it has
 * one, this week's distance, and the door to the Running screen. Before a plan exists it offers
 * to set one up, and folds away with the × like the sport card.
 */
export default function RunningCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const running = runningOf(S)
  const today = todayISO()
  const states = useMemo(() => sessionStatesOf(S), [S.runSessions])
  const next = useMemo(() => (running ? nextSession(running, states, today) : null), [running, states, today])
  const advice = useMemo(() => (running ? coachAdvice(S, today) : null), [S, today])
  const week = useMemo(() => weeklyRunning(S, today, 1)[0], [S.runLog, today])

  if (!running) {
    if (S.hints?.runningCard) return null
    return <div className="card">
      <div className="row between">
        <div className="row" style={{ gap: 9 }}>
          <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="figureRun" /></span>
          <div><div className="lbl2">{t('Returning runner?')}</div><div className="ttl">{t('Road to 10K')}</div></div>
        </div>
        <button className="iconbtn" aria-label={t('Hide')} onClick={() => useStore.getState().update(s => { s.hints = { ...(s.hints || {}), runningCard: true } })}><Icon name="xmark" /></button>
      </div>
      <div className="muted small" style={{ margin: '8px 0 10px' }}>{t('A ten-week run/walk plan to a 10K, your watch’s runs pulled in, and a coach that only ever suggests.')}</div>
      <Button variant="primary" icon="figureRun" onClick={() => runningSetupSheet(() => nav('/running'))}>{t('Set up Road to 10K')}</Button>
    </div>
  }

  const toRace = daysToRace(S, today)
  const isToday = next?.date === today
  return <div className="card running-card">
    <div className="row between" style={{ marginBottom: 8 }}>
      <div className="row" style={{ gap: 9, minWidth: 0 }} {...tappable(() => nav('/running'))}>
        <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="figureRun" /></span>
        <div style={{ minWidth: 0 }}>
          <div className="lbl2">{t('Road to {0}', GOAL_LABEL[running.goal])}</div>
          <div className="ttl">{toRace != null && toRace >= 0 ? tn('Race in {0} day', 'Race in {0} days', toRace) : t('Running')}</div>
        </div>
      </div>
      <button className="iconbtn" aria-label={t('Running')} onClick={() => nav('/running')}><Icon name="chevronRight" /></button>
    </div>
    {next ? <>
      <div className="small muted">{isToday ? t('Today’s run') : t('Next run: {0}', fmtDate(next.date, true))}</div>
      <div className="big" style={{ fontSize: 20 }}>{KIND_LABEL[next.kind]()}</div>
      <div className="small dim">{sessionLine(next)}{next.totalMin ? ` · ${t('about {0} min', next.totalMin)}` : ''}</div>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <Button variant="primary" size="sm" icon="check" onClick={() => runSessionSheet(next)}>{t('Tick it off')}</Button>
        <Button size="sm" onClick={() => nav('/running')}>{t('Open')}</Button>
      </div>
    </> : <div className="muted small">{t('Every session of the plan is behind you.')}</div>}
    <div className="sect-b" style={{ marginTop: 10 }}>
      {advice && advice.kind !== 'keep' && advice.kind !== 'none' && <div className="lrow tap" {...tappable(() => coachAdviceSheet(advice, { todaySession: isToday ? next : null }))}>
        <span className="lrow-i" style={{ '--tint': advice.kind === 'rest' ? 'var(--red)' : advice.substantial ? 'var(--orange)' : 'var(--green)' }}><Icon name="sparkles" /></span>
        <span className="lrow-m"><span className="lrow-t">{ADVICE_TITLE[advice.kind]()}</span><span className="lrow-s">{t(advice.reasons[0] || '')}</span></span>
        <Icon name="chevronRight" className="lrow-c" />
      </div>}
      <div className="lrow tap" {...tappable(() => nav('/stats'))}>
        <span className="lrow-i" style={{ '--tint': 'var(--blue)' }}><Icon name="chartLine" /></span>
        <span className="lrow-m"><span className="lrow-t">{t('This week')}</span><span className="lrow-s">{week?.runs ? `${tn('{0} run', '{0} runs', week.runs)}${week.distM ? ' · ' + fmtKm(week.distM) : ''}` : t('No runs recorded yet this week')}</span></span>
        <Icon name="chevronRight" className="lrow-c" />
      </div>
    </div>
  </div>
}
