import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn, useLang, exerciseNameClass } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { effectiveRoutineIds, nextTrainingDay } from '../lib/history.js'
import { queueView } from '../lib/queue.js'
import { fatigueOf } from '../lib/recovery.js'
import { fatigueStateOf } from '../lib/recovery-view.js'
import { sportOf, weekModeOf, daysToCompetition, matWeekOf, readinessOf, readinessAdvice, COMP_WEEK_DAYS } from '../lib/sport.js'
import { SPORT_NAME, GI_NAME } from '../lib/sport-copy.js'
import { shortRoutine, hasShortVersion } from '../lib/sport-plans.js'
import { estimateMinutes, routineEquipment } from '../lib/routine-info.js'
import { exOr } from '../lib/exercises.js'
import { startFlow } from '../sheets.jsx'
import { sportSetupSheet, sportPlanSheet, matLogSheet, readinessSheet, weekModeSheet, sessionTargets, ADVICE_WORD, reasonText } from '../sport-sheets.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'

/**
 * Home's sport card: the sport profile, the next gym session with its length, its equipment
 * and the loads it opens at, a shorter way to start it, and the three bits of context beside
 * the plan — today's readiness check-in, this week's mat sessions, and the week mode.
 *
 * The readiness and the mat log are what the person reported. The fatigue line is the app's
 * estimate from logged lifts only, and it is labelled as that: it knows nothing about the
 * mat, and nothing here calls anyone recovered.
 */
export default function SportCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  // Exercise names and the per-side suffix arrive with the language's packs, after the first
  // render on a cold start: the card re-renders, and the targets are worked out again, then.
  const langVersion = useLang()
  const sport = sportOf(S)
  const today = todayISO()
  // Hooks first, before the early return below: the card switches between its two shapes while
  // mounted (a sport set from the card itself), and React needs the same hooks either way.
  const todayIds = effectiveRoutineIds(S, today)
  const q = queueView(S, today)
  const nextId = todayIds[0] || q?.items.find(i => i.state === 'next')?.id || nextTrainingDay(S, today)?.routine?.id || null
  const routine = nextId ? S.routines.find(r => r.id === nextId) || null : null
  const targets = useMemo(() => (sport && routine ? sessionTargets(S, routine) : []), [S, routine, !!sport, langVersion])
  const fatigue = useMemo(() => {
    if (!sport) return 0
    try {
      const f = fatigueOf(S.workouts || [], Date.now(), { unit: S.unit })
      return Object.values(f).filter(v => fatigueStateOf(v) !== 'ready').length
    } catch { return 0 }
  }, [S.workouts, S.unit, !!sport])

  if (!sport) {
    if (S.hints?.sportCard) return null
    return <div className="card">
      <div className="row between">
        <div className="row" style={{ gap: 9 }}>
          <span className="lrow-i" style={{ background: 'var(--orange)' }}><Icon name="figureStrength" /></span>
          <div><div className="lbl2">{t('Judo or BJJ?')}</div><div className="ttl">{t('Gym plan for the mat')}</div></div>
        </div>
        <button className="iconbtn" aria-label={t('Hide')} onClick={() => useStore.getState().update(s => { s.hints = { ...(s.hints || {}), sportCard: true } })}><Icon name="xmark" /></button>
      </div>
      <div className="muted small" style={{ margin: '8px 0 10px' }}>{t('Strength, power, grip and conditioning sessions cut for judo, BJJ or both, on one, two or three gym days or an A/B loop.')}</div>
      <Button variant="primary" icon="figureStrength" onClick={() => sportSetupSheet(() => sportPlanSheet())}>{t('Set up sport profile')}</Button>
    </div>
  }

  // Today only when the today row would offer it (effectiveRoutineIds): a refilled loop that
  // starts tomorrow has a next session, but not a session for today.
  const isToday = todayIds.length > 0
  const minutes = routine ? estimateMinutes(routine, S) : 0
  const shortMin = routine && hasShortVersion(routine) ? estimateMinutes(shortRoutine(routine), S) : 0
  const equipment = routine ? routineEquipment(routine) : []
  const mode = weekModeOf(S, today)
  const toComp = daysToCompetition(S, today)
  const mat = matWeekOf(S, today)
  const checkIn = readinessOf(S, today)
  const advice = readinessAdvice(S, today)
  // Starts the session the card describes: its name, length, equipment, opening loads and
  // shorter version are all this one routine's. A second routine due today (fixed days beside
  // a loop) stays on Home's today row; starting both from here opened a far longer session
  // than the card had just announced.
  const start = short => { if (S.active) nav('/workout'); else if (routine) startFlow([routine.id], { short }) }

  return <div className="card sport-card">
    <div className="row between" style={{ marginBottom: 8 }}>
      <div className="row" style={{ gap: 9, minWidth: 0 }}>
        <span className="lrow-i" style={{ background: 'var(--orange)' }}><Icon name="figureStrength" /></span>
        <div style={{ minWidth: 0 }}>
          <div className="lbl2">{t('Sport plan')}</div>
          <div className="ttl">{SPORT_NAME[sport.kind]()}{sport.kind !== 'judo' ? ' · ' + GI_NAME[sport.gi]() : ''}</div>
        </div>
      </div>
      <button className="iconbtn" aria-label={t('Sport profile')} onClick={() => sportSetupSheet()}><Icon name="gear" /></button>
    </div>

    {routine ? <>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="small muted">{isToday ? t('Next gym session: today') : t('Next gym session')}</div>
          <div className="big" style={{ fontSize: 20 }}>{routine.name}</div>
          <div className="small dim">{t('about {0} min', minutes)}{shortMin ? ' · ' + t('short: about {0} min', shortMin) : ''}</div>
        </div>
      </div>
      {equipment.length > 0 && <div className="chips" style={{ flexWrap: 'wrap', margin: '6px 0 2px' }}>
        {equipment.map(e => <span key={e} className="chip" style={{ pointerEvents: 'none', fontSize: 12 }}>{t(e)}</span>)}
      </div>}
      {targets.length > 0 && <div className="small" style={{ margin: '6px 0' }}>
        {targets.map(x => <div key={x.id} className="row between" style={{ gap: 8 }}><span className={exerciseNameClass(exOr(x.id))} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span><bdi dir="ltr" className="dim" style={{ whiteSpace: 'nowrap' }}>{x.line}</bdi></div>)}
      </div>}
      <div className="row" style={{ gap: 8, marginTop: 6 }}>
        <Button variant="primary" size="sm" icon="play" onClick={() => start(false)}>{S.active ? t('Resume') : t('Start')}</Button>
        {!!shortMin && !S.active && <Button size="sm" icon="timer" onClick={() => start(true)}>{t('Shorter session')}</Button>}
      </div>
    </> : <div className="muted small" style={{ marginBottom: 6 }}>
      {t('No sport sessions in your plan yet.')}
      <div style={{ marginTop: 8 }}><Button size="sm" variant="tinted" icon="clipboard" onClick={sportPlanSheet}>{t('Load a sport plan')}</Button></div>
    </div>}

    <div className="sect-b" style={{ marginTop: 10 }}>
      <div className="lrow tap" {...tappable(readinessSheet)}>
        <span className="lrow-i" style={{ '--tint': 'var(--green)' }}><Icon name="heart" /></span>
        <span className="lrow-m">
          <span className="lrow-t">{checkIn ? t('Today: {0}', ADVICE_WORD[advice?.level || 'go']()) : t('Readiness check-in')}</span>
          <span className="lrow-s">{checkIn
            ? (advice?.reasons || []).slice(0, 2).map(reasonText).join(' ')
            : advice ? t('{0}. From your mat log: {1}', ADVICE_WORD[advice.level](), advice.reasons.map(reasonText).join(' ')) : t('Energy, soreness, sleep: a suggestion, never a rule.')}</span>
        </span>
        <Icon name="chevronRight" className="lrow-c" />
      </div>
      <div className="lrow tap" {...tappable(matLogSheet)}>
        <span className="lrow-i" style={{ '--tint': 'var(--blue)' }}><Icon name="figureStrength" /></span>
        <span className="lrow-m">
          <span className="lrow-t">{mat.logged ? tn('{0} mat session this week', '{0} mat sessions this week', mat.sessions) : t('Mat sessions')}</span>
          <span className="lrow-s">{mat.logged
            ? (mat.minutes ? t('{0} min', mat.minutes) + (mat.hard ? ' · ' + tn('{0} hard', '{0} hard', mat.hard) : '') : tn('{0} hard', '{0} hard', mat.hard))
            : t('Nothing logged this week. Unlogged is unknown, not zero.')}</span>
        </span>
        <Icon name="chevronRight" className="lrow-c" />
      </div>
      <div className="lrow tap" {...tappable(weekModeSheet)}>
        <span className="lrow-i" style={{ '--tint': mode === 'normal' ? 'var(--grey)' : 'var(--yellow)' }}><Icon name="calendar" /></span>
        <span className="lrow-m">
          <span className="lrow-t">{mode === 'comp' ? t('Competition week') : mode === 'lighter' ? t('Lighter week') : t('Normal week')}</span>
          <span className="lrow-s">{toComp != null && toComp >= 0 && toComp <= 14
            ? tn('Competition in {0} day.', 'Competition in {0} days.', toComp) + (mode === 'normal' && toComp <= COMP_WEEK_DAYS ? ' ' + t('The competition week is one tap away.') : '')
            : t('Lighter or competition week, when you want it.')}</span>
        </span>
        <Icon name="chevronRight" className="lrow-c" />
      </div>
      <div className="lrow tap" {...tappable(() => nav('/stats'))}>
        <span className="lrow-i" style={{ '--tint': 'var(--purple)' }}><Icon name="chartLine" /></span>
        <span className="lrow-m">
          <span className="lrow-t">{t('Lifting fatigue estimate')}</span>
          <span className="lrow-s">{(fatigue ? tn('{0} muscle group still recovering', '{0} muscle groups still recovering', fatigue) : t('Nothing still recovering')) + ' · ' + t('from logged lifts only, not the mat')}</span>
        </span>
        <Icon name="chevronRight" className="lrow-c" />
      </div>
    </div>
  </div>
}
