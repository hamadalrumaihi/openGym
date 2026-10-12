// The sport side's sheets: the sport profile, the plan chooser and loader, the mat log, the
// readiness check-in, the week mode, and the "why this exercise" panel a workout opens.
// Kept out of sheets.jsx (which is already long) and importing only what it exports.
import { useMemo, useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { t, tn, exerciseNameFor, exerciseNameClass, useLang } from './lib/i18n.js'
import { fmtDate, fmtNum, todayISO, uid, DAYN } from './lib/format.js'
import { EXIDX, exOr } from './lib/exercises.js'
import { activeProfile, exAvailable, profileEquipment } from './lib/equipment.js'
import { exLine, lastEntryFor, bestWeightForEntry } from './lib/history.js'
import { nextPrescription, POLICY_NAME, policyFor } from './lib/progression.js'
import { speedUnitOf } from './lib/speed.js'
import {
  SPORT_KINDS, GI_OPTIONS, LIFTING_LEVELS, PRIORITIES, SESSION_MIN_OPTIONS, EFFORT_LEVELS, MAT_NOTE_MAX,
  sportOf, withSport, sportsOf, weekModeOf, withWeekMode, daysToCompetition, COMP_WEEK_DAYS, LIGHTER_WEEK_DAYS,
  matSessionsOf, withMatSession, withoutMatSession, readinessOf, withReadiness, readinessAdvice,
} from './lib/sport.js'
import { ROLE_COPY, SPORT_NAME, GI_NAME, LIFTING_NAME, PRIORITY_NAME, PLAN_SIZE_COPY, roleLabel } from './lib/sport-copy.js'
import { buildSportPlan, PLAN_SIZES, shortRoutine } from './lib/sport-plans.js'
import { estimateMinutes, routineEquipment } from './lib/routine-info.js'
import { samePatternFirst } from './lib/substitute.js'
import { WEEK_MODE_LINE } from './lib/week-mode.js'
import { saveRotation } from './lib/rotation.js'
import { queueOf } from './lib/queue.js'
import { confirmSheet } from './sheets.jsx'
import { Button, Row, Switch } from './components/ui.jsx'
import Icon from './components/Icon.jsx'
import { Thumb } from './components/Media.jsx'
import { useSheetKeyboard, tappable } from './lib/use-sheet-keyboard.js'

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

// Which template size the profile's gym days map to; null days means "not sure".
export const sizeOfGymDays = d => (d === 1 ? 'one' : d === 2 ? 'two' : d === 3 ? 'three' : 'ab')

/* ============================ the sport profile ============================ */

function SportSetup({ close, onDone }) {
  const st = useStore(s => s.S)
  const cur = sportOf(st)
  const [p, setP] = useState(() => cur || { kind: 'both', gi: 'both', lifting: 'new', matPerWeek: null, gymDays: null, sessionMin: 60, compDate: null, priorities: [] })
  const [matUnknown, setMatUnknown] = useState(() => !cur || cur.matPerWeek == null)
  const set = patch => setP(v => ({ ...v, ...patch }))
  const save = () => {
    const next = withSport({ sport: cur }, { ...p, matPerWeek: matUnknown ? null : p.matPerWeek })
    update(s => { s.sport = next })
    toast(t('Sport profile saved'))
    close()
    if (onDone) onDone(next)
  }
  return <>
    <h3>{t('Sport profile')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('What the gym plan is for. Changing this never touches your routines or your history.')}</div>
    <Label>{t('Sport')}</Label>
    <Chips options={SPORT_KINDS} value={p.kind} onChange={kind => set({ kind })} labelOf={k => SPORT_NAME[k]()} />
    {p.kind !== 'judo' && <>
      <Label>{t('Gi or no-gi')}</Label>
      <Chips options={GI_OPTIONS} value={p.gi || 'both'} onChange={gi => set({ gi })} labelOf={g => GI_NAME[g]()} />
    </>}
    <Label>{t('Lifting experience')}</Label>
    <div className="muted small" style={{ marginBottom: 6 }}>{t('Your gym experience, not your mat experience. Years of BJJ can go with a first month under a bar.')}</div>
    <div className="list" style={{ marginBottom: 12 }}>
      {LIFTING_LEVELS.map(l => { const [title, sub] = LIFTING_NAME[l](); return <div key={l} className="item" {...tappable(() => set({ lifting: l }))}>
        <div className="grow"><div className="tt">{title}</div><div className="ss">{sub}</div></div>
        {p.lifting === l && <Icon name="check" className="chev" style={{ color: 'var(--acc)' }} />}
      </div> })}
    </div>
    <Label>{t('Mat sessions a week')}</Label>
    <Chips options={[0, 1, 2, 3, 4, 5, 6, 7, 'unknown']} value={matUnknown ? 'unknown' : p.matPerWeek}
      onChange={v => { if (v === 'unknown') setMatUnknown(true); else { setMatUnknown(false); set({ matPerWeek: v }) } }}
      labelOf={v => (v === 'unknown' ? t('Not sure / irregular') : String(v))} />
    <Label>{t('Gym days you can keep')}</Label>
    <div className="muted small" style={{ marginBottom: 6 }}>{t('Not sure is a fine answer: the plan then runs as an A/B rotation and the next session is simply the next one.')}</div>
    <Chips options={[1, 2, 3, 'ab', null]} value={p.gymDays} onChange={gymDays => set({ gymDays })}
      labelOf={v => (v === 'ab' ? t('A/B, whenever') : v == null ? t('Not sure') : String(v))} />
    <Label>{t('Session length')}</Label>
    <Chips options={SESSION_MIN_OPTIONS} value={p.sessionMin} onChange={sessionMin => set({ sessionMin })} labelOf={m => `${m} ${t('min')}`} />
    <Label>{t('Competition date (optional)')}</Label>
    <div className="row" style={{ gap: 8, marginBottom: 12 }}>
      <input type="date" className="timef" value={p.compDate || ''} onChange={e => set({ compDate: e.target.value || null })} />
      {p.compDate && <Button size="sm" variant="ghost" onClick={() => set({ compDate: null })}>{t('Clear')}</Button>}
    </div>
    <Label>{t('What to lean on (up to three)')}</Label>
    <Chips options={PRIORITIES} value={p.priorities || []} multi labelOf={k => PRIORITY_NAME[k]()}
      onChange={v => set({ priorities: v.slice(-3) })} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}
export const sportSetupSheet = onDone => ui().openSheet(close => <SportSetup close={close} onDone={onDone} />)

/* ============================ the plan ============================ */

const RoleTag = ({ role }) => (ROLE_COPY[role] ? <span className="tag nocap" style={{ fontSize: 11 }}>{roleLabel(role)}</span> : null)

function SportPlanChooser({ close }) {
  useLang()
  const st = useStore(s => s.S)
  const sport = sportOf(st)
  const profiles = st.equipProfiles || []
  const [fitId, setFitId] = useState(() => activeProfile(st)?.id || '')
  const [size, setSize] = useState(() => sizeOfGymDays(sport?.gymDays))
  const [fixed, setFixed] = useState(false)
  const [open, setOpen] = useState(0)
  const fit = profiles.find(p => p.id === fitId) || null
  const unknownDays = sport?.gymDays == null
  const plan = useMemo(() => (sport ? buildSportPlan({
    kind: sport.kind, gi: sport.gi, lifting: sport.lifting, size, priorities: sport.priorities,
    equipment: fit ? profileEquipment(fit) : null, unknownDays,
  }) : null), [sport, size, fit, unknownDays])
  if (!sport) { return <>
    <h3>{t('Sport plan')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Set up your sport profile first: sport, gi or no-gi, lifting experience and the days you can keep.')}</div>
    <Button variant="primary" onClick={() => { close(); sportSetupSheet(() => sportPlanSheet()) }}>{t('Set up sport profile')}</Button>
  </> }
  const load = () => {
    close()
    loadSportPlan(plan, { fixed, fitName: fit?.name })
  }
  const kept = plan.fit?.kept || []
  return <>
    <h3>{t('Sport plan')} · {SPORT_NAME[sport.kind]()}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>
      {t('A starting template, not an assessment of your recovery. Every set, rep and exercise is yours to edit once it is in your plan.')}
    </div>
    <div className="list" style={{ marginBottom: 10 }}>
      {PLAN_SIZES.map(id => { const { name, about } = PLAN_SIZE_COPY[id](); return <div key={id} className="item" {...tappable(() => setSize(id))}>
        <div className="grow"><div className="tt">{name}</div><div className="ss">{about}</div></div>
        {size === id && <Icon name="check" className="chev" style={{ color: 'var(--acc)' }} />}
      </div> })}
    </div>
    {unknownDays && size === 'ab' && <div className="small dim" style={{ margin: '0 0 10px' }}>{t('Gym days not sure: A and B take turns, and a third session, C, is added for the good weeks without being part of the loop.')}</div>}
    {profiles.length > 0
      ? <div className="chips" style={{ margin: '0 0 10px' }}>
          <div className="small dim" style={{ width: '100%' }}>{t('Fit to my equipment')}</div>
          <button className={'chip nocap' + (!fit ? ' on' : '')} onClick={() => setFitId('')}>{t('As written')}</button>
          {profiles.map(p => <button key={p.id} className={'chip nocap' + (fit?.id === p.id ? ' on' : '')} onClick={() => setFitId(p.id)}>{p.name}</button>)}
        </div>
      : <div className="small dim" style={{ margin: '0 0 10px' }}>{t('Add an equipment profile in Settings to fit a plan to what you own.')}</div>}
    {kept.length > 0 && <div className="exnote" style={{ color: 'var(--yellow)', marginBottom: 10 }}>
      <Icon name="warning" style={{ fontSize: 13, marginInlineEnd: 5, verticalAlign: '-2px' }} />
      {t('No stand-in with this equipment for: {0}. Kept as written so the session keeps its shape; swap or tick the equipment later.', kept.map(k => exerciseNameFor(exOr(k.id))).join(', '))}
    </div>}
    <div className="list" style={{ marginBottom: 10 }}>
      {plan.routines.map((r, i) => {
        const extra = plan.extra.includes(r.id)
        const minutes = estimateMinutes(r, st), short = estimateMinutes(shortRoutine(r), st)
        return <div key={r.id}>
          <div className="item" {...tappable(() => setOpen(open === i ? -1 : i))}>
            <div className="grow"><div className="tt">{r.name}{extra ? ' · ' + t('optional third session') : ''}</div>
              <div className="ss">{tn('{0} exercise', '{0} exercises', r.ex.length)} · {t('about {0} min', minutes)} · {t('short: about {0} min', short)}</div></div>
            <Icon name={open === i ? 'chevronUp' : 'chevronDown'} className="chev" />
          </div>
          {open === i && r.ex.map((e, k) => <div key={k} className="item" style={{ paddingInlineStart: 24 }}>
            <Thumb ex={exOr(e.id)} />
            <div className="grow"><div className={'tt ' + exerciseNameClass(exOr(e.id))}>{exerciseNameFor(exOr(e.id))}</div>
              <div className="ss"><bdi dir="ltr">{exLine(e, st.unit, speedUnitOf(st))}</bdi>{e.optional ? ' · ' + t('skipped in the short session') : ''}</div>
              <div style={{ marginTop: 3 }}><RoleTag role={e.role} /></div></div>
          </div>)}
        </div>
      })}
    </div>
    <div className="sect-b" style={{ marginBottom: 12 }}>
      <Row icon="calendar" iconTint="var(--orange)" title={t('Put on fixed weekdays instead')}
        subtitle={fixed ? t('On {0}. Missed days are missed; nothing is caught up.', plan.suggestedDays.map(d => t(DAYN[d])).join(', ')) : t('Off: the sessions take turns on whatever days you train. A missed week changes nothing.')}>
        <Switch checked={fixed} onChange={setFixed} />
      </Row>
    </div>
    <Button variant="primary" icon="clipboard" onClick={load}>{t('Add these routines')}</Button>
  </>
}
export const sportPlanSheet = () => ui().openSheet(close => <SportPlanChooser close={close} />)

/**
 * Adds the plan's routines (reusing one you already have under the same name and exercises)
 * and puts them in the loop, or on their suggested weekdays. Nothing of yours is removed: an
 * existing loop is asked about before it is replaced, and weekdays only change where the plan
 * asks for them.
 */
export function loadSportPlan(plan, { fixed = false, fitName } = {}) {
  if (!plan) return false
  const st = S()
  const hasLoop = !!queueOf(st) || (st.rotation?.sequence || []).some(id => st.routines.some(r => r.id === id))
  const apply = () => {
    update(s => {
      const idOf = {}
      const sameLift = (a, b) => a.ex.length === b.ex.length && a.ex.every((e, i) => e.id === b.ex[i].id)
      plan.routines.forEach(r => {
        const have = s.routines.find(x => x.name === r.name && sameLift(x, r))
        if (have) idOf[r.id] = have.id
        else { s.routines.push(structuredClone(r)); idOf[r.id] = r.id }
      })
      const loop = plan.rotation.map(id => idOf[id])
      if (fixed) {
        plan.suggestedDays.forEach((day, i) => { if (loop[i]) s.week[day] = [loop[i]] })
      } else {
        saveRotation(s, loop, '')
        s.scheduleMode = 'rotation'
      }
      // The profile remembers what it was cut for.
      s.sport = withSport(s, { gymDays: plan.size === 'one' ? 1 : plan.size === 'two' ? 2 : plan.size === 'three' ? 3 : (s.sport?.gymDays ?? null) })
    })
    const n = plan.routines.length
    toast(fitName
      ? t('{0} routines added, fitted to “{1}”: {2} swapped, {3} dropped.', n, fitName, plan.fit?.swapped || 0, plan.fit?.dropped || 0)
      : tn('{0} routine added', '{0} routines added', n))
  }
  if (!fixed && hasLoop) {
    confirmSheet({
      title: t('Replace your rotation?'),
      message: t('The new sessions become the loop. Your current routines stay in your list; only the loop changes.'),
      confirmText: t('Replace the loop'),
      onConfirm: apply,
    })
    return true
  }
  if (fixed) {
    const taken = plan.suggestedDays.filter(d => [].concat(st.week[d] || []).some(id => st.routines.some(r => r.id === id)))
    if (taken.length) {
      confirmSheet({
        title: t('Load on {0}?', taken.map(d => t(DAYN[d])).join(', ')),
        message: t('The new plan goes on {0}. Your existing routines stay; only those days of the weekly plan change.', plan.suggestedDays.map(d => t(DAYN[d])).join(', ')),
        confirmText: t('Load plan'),
        onConfirm: apply,
      })
      return true
    }
  }
  apply()
  return true
}

/* ============================ the mat log ============================ */

function MatLog({ close }) {
  const st = useStore(s => s.S)
  const sport = sportOf(st)
  const sports = sportsOf(sport)
  const noteRef = useRef(null)
  const onNoteFocus = useSheetKeyboard(noteRef)
  const today = todayISO()
  const [d, setD] = useState(today)
  const [which, setWhich] = useState(sports[0] || 'bjj')
  const [min, setMin] = useState(90)
  const [effort, setEffort] = useState(3)
  const [note, setNote] = useState('')
  const recent = matSessionsOf(st).slice(-6).reverse()
  const save = () => {
    if (!d || d > today) { toast(t('Pick a day up to today')); return }
    update(s => { s.matLog = withMatSession(s.matLog, uid(), { d, sport: which, min, effort, note }) })
    toast(t('Mat session logged'))
    close()
  }
  const remove = id => update(s => { s.matLog = withoutMatSession(s.matLog, id) })
  const EFFORT_WORD = { 1: t('Easy'), 2: t('Light'), 3: t('Moderate'), 4: t('Hard'), 5: t('Very hard') }
  return <>
    <h3>{t('Mat session')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Date, sport, how long and how hard. That is all the gym side needs; nothing here scores technique or tracks belts.')}</div>
    <Row icon="calendar" iconTint="var(--orange)" title={t('Date')}>
      <input type="date" className="timef" value={d} max={today} onChange={e => setD(e.target.value)} /></Row>
    <Label>{t('Sport')}</Label>
    <Chips options={['judo', 'bjj']} value={which} onChange={setWhich} labelOf={k => SPORT_NAME[k]()} />
    <Label>{t('How long')}</Label>
    <Chips options={[60, 90, 120]} value={min} onChange={setMin} labelOf={m => `${m} ${t('min')}`} />
    <Label>{t('How hard it felt')}</Label>
    <Chips options={EFFORT_LEVELS} value={effort} onChange={setEffort} labelOf={e => `${e} · ${EFFORT_WORD[e]}`} />
    <textarea ref={noteRef} className="input" rows={2} maxLength={MAT_NOTE_MAX} value={note} placeholder={t('Anything else? (optional)')} onFocus={onNoteFocus} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Log mat session')}</Button>
    {recent.length > 0 && <>
      <h4 className="sec" style={{ marginTop: 16 }}>{t('Recent mat sessions')}</h4>
      <div className="list">
        {recent.map(s => <div key={s.id} className="item">
          <span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name="figureStrength" /></span>
          <div className="grow"><div className="tt">{SPORT_NAME[s.sport]()}{s.min ? ` · ${s.min} ${t('min')}` : ''}{s.effort ? ` · ${EFFORT_WORD[s.effort]}` : ''}</div>
            <div className="ss">{fmtDate(s.d, true)}{s.note ? ' · ' + s.note : ''}</div></div>
          <button className="iconbtn chev" aria-label={t('Delete')} onClick={() => remove(s.id)}><Icon name="trash" /></button>
        </div>)}
      </div>
    </>}
  </>
}
export const matLogSheet = () => ui().openSheet(close => <MatLog close={close} />)

/* ============================ readiness ============================ */

const Scale = ({ value, onChange, low, high }) => <div>
  <div className="chips" style={{ margin: '4px 0 2px' }}>
    {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" className={'chip nocap' + (value === n ? ' on' : '')} aria-pressed={value === n} onClick={() => onChange(n)} style={{ minWidth: 44, justifyContent: 'center' }}>{n}</button>)}
  </div>
  <div className="row between small dim" style={{ marginBottom: 10 }}><span>{low}</span><span>{high}</span></div>
</div>

function Readiness({ close }) {
  const st = useStore(s => s.S)
  const today = todayISO()
  const had = readinessOf(st, today)
  const [energy, setEnergy] = useState(had?.energy || 3)
  const [soreness, setSoreness] = useState(had?.soreness || 2)
  const [sleep, setSleep] = useState(had?.sleep || 3)
  const preview = readinessAdvice({ ...st, readiness: withReadiness(st.readiness, today, { energy, soreness, sleep }) }, today)
  const save = () => {
    update(s => { s.readiness = withReadiness(s.readiness, today, { energy, soreness, sleep }) })
    toast(t('Check-in saved'))
    close()
  }
  const clear = () => { update(s => { s.readiness = withReadiness(s.readiness, today, null) }); close() }
  return <>
    <h3>{t('How are you today?')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Three quick answers. They only ever suggest; you choose the session.')}</div>
    <Label>{t('Energy')}</Label>
    <Scale value={energy} onChange={setEnergy} low={t('Flat')} high={t('Full of beans')} />
    <Label>{t('Soreness')}</Label>
    <Scale value={soreness} onChange={setSoreness} low={t('None')} high={t('Everything hurts')} />
    <Label>{t('Sleep')}</Label>
    <Scale value={sleep} onChange={setSleep} low={t('Awful')} high={t('Great')} />
    {preview && <AdviceBox advice={preview} />}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    {had && <><div style={{ height: 10 }} /><Button variant="ghost" icon="trash" onClick={clear}>{t('Clear today’s check-in')}</Button></>}
  </>
}
export const readinessSheet = () => ui().openSheet(close => <Readiness close={close} />)

export const ADVICE_WORD = { go: () => t('Good to go'), ease: () => t('Ease off a little'), light: () => t('Keep it light') }
// The reasons lib/sport.js readinessAdvice names, as literal t() calls so every pack carries them.
const REASON = {
  'Low energy, poor sleep or heavy soreness today.': () => t('Low energy, poor sleep or heavy soreness today.'),
  'Energy, sleep or soreness is a little off today.': () => t('Energy, sleep or soreness is a little off today.'),
  'Energy, sleep and soreness all look fine.': () => t('Energy, sleep and soreness all look fine.'),
  'You reported heavy soreness.': () => t('You reported heavy soreness.'),
  'Two hard mat sessions in the last two days.': () => t('Two hard mat sessions in the last two days.'),
  'A hard mat session yesterday or today.': () => t('A hard mat session yesterday or today.'),
  'Mat training yesterday or today, logged as easy or moderate.': () => t('Mat training yesterday or today, logged as easy or moderate.'),
}
export const reasonText = r => (REASON[r] ? REASON[r]() : t(r))
export function AdviceBox({ advice }) {
  const color = advice.level === 'go' ? 'var(--green)' : advice.level === 'ease' ? 'var(--yellow)' : 'var(--orange)'
  return <div className="exnote" style={{ marginTop: 8 }}>
    <div style={{ color, fontWeight: 600 }}>{ADVICE_WORD[advice.level]()}</div>
    <div className="small">{advice.reasons.map(reasonText).join(' ')}</div>
    <div className="small dim" style={{ marginTop: 2 }}>{t('From what you reported and logged, not a measurement. Train as you see fit.')}</div>
  </div>
}

/* ============================ week mode ============================ */

function WeekMode({ close }) {
  const st = useStore(s => s.S)
  const mode = weekModeOf(st)
  const days = daysToCompetition(st)
  const pick = m => {
    update(s => { s.sport = withWeekMode(s, m, todayISO(), m === 'comp' ? COMP_WEEK_DAYS : LIGHTER_WEEK_DAYS) })
    toast(m ? t('Week mode set for the next {0} days', m === 'comp' ? COMP_WEEK_DAYS : LIGHTER_WEEK_DAYS) : t('Back to a normal week'))
    close()
  }
  return <>
    <h3>{t('This week')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('A choice, never automatic. Each mode says exactly what it changes, and every target stays editable in the session.')}</div>
    {days != null && days >= 0 && days <= 14 && <div className="exnote" style={{ marginBottom: 10 }}>{tn('Competition in {0} day.', 'Competition in {0} days.', days)}</div>}
    <div className="list">
      <div className="item" {...tappable(() => pick(null))}>
        <div className="grow"><div className="tt">{t('Normal week')}</div><div className="ss">{t('The progression rules as they are.')}</div></div>
        {mode === 'normal' && <Icon name="check" className="chev" style={{ color: 'var(--acc)' }} />}
      </div>
      <div className="item" {...tappable(() => pick('lighter'))}>
        <div className="grow"><div className="tt">{t('Lighter week')}</div><div className="ss">{WEEK_MODE_LINE.lighter()}</div></div>
        {mode === 'lighter' && <Icon name="check" className="chev" style={{ color: 'var(--acc)' }} />}
      </div>
      <div className="item" {...tappable(() => pick('comp'))}>
        <div className="grow"><div className="tt">{t('Competition week')}</div><div className="ss">{WEEK_MODE_LINE.comp()}</div></div>
        {mode === 'comp' && <Icon name="check" className="chev" style={{ color: 'var(--acc)' }} />}
      </div>
    </div>
  </>
}
export const weekModeSheet = () => ui().openSheet(close => <WeekMode close={close} />)

/* ============================ why this exercise ============================ */

function ExercisePurpose({ cfg, routine, close, onSwap }) {
  useLang() // names and copy follow a language pack that is still arriving
  const st = useStore(s => s.S)
  const ex = exOr(cfg.id)
  const copy = ROLE_COPY[cfg.role] ? ROLE_COPY[cfg.role]() : null
  const sports = sportsOf(sportOf(st))
  const whyLines = (sports.length ? sports : ['judo', 'bjj']).map(k => copy?.[k]).filter(Boolean)
  const policy = policyFor(cfg, routine)
  const prof = activeProfile(st)
  const subs = samePatternFirst(Object.values(EXIDX), ex).filter(e => !prof || exAvailable(st, e)).slice(0, 4)
  return <>
    <h3 className={exerciseNameClass(ex)}>{exerciseNameFor(ex)}</h3>
    {copy ? <>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}><span className="tag acc nocap">{copy.quality}</span></div>
      {whyLines.map((w, i) => <div key={i} className="exnote">{w}</div>)}
      <h4 className="sec">{t('Cues')}</h4>
      <div className="small">{copy.cues}</div>
      <h4 className="sec">{t('Prescription')}</h4>
      <div className="small"><bdi dir="ltr">{exLine(cfg, st.unit, speedUnitOf(st))}</bdi>{cfg.restSec > 0 ? ` · ${t('{0}s rest', cfg.restSec)}` : ''}</div>
      <div className="small dim" style={{ marginTop: 2 }}>{copy.effort}</div>
      <h4 className="sec">{t('How it progresses')}</h4>
      <div className="small">{copy.progression}</div>
      <div className="small dim" style={{ marginTop: 2 }}>{t('Rule in force: {0}', t(POLICY_NAME[policy] || POLICY_NAME.off))}</div>
    </> : <div className="muted small">{t('This exercise has no sport role on this plan. Open its details for the how-to.')}</div>}
    {subs.length > 0 && <>
      <h4 className="sec">{t('Could also be')}</h4>
      <div className="list">{subs.map(e => <div key={e.id} className="item">
        <Thumb ex={e} /><div className="grow"><div className={'tt ' + exerciseNameClass(e)}>{exerciseNameFor(e)}</div><div className="ss">{t(e.eq)}</div></div>
      </div>)}</div>
    </>}
    {onSwap && <><div style={{ height: 12 }} /><Button icon="swap" onClick={() => { close(); onSwap() }}>{t('Swap exercise')}</Button></>}
  </>
}
export const exercisePurposeSheet = (cfg, routine, onSwap) => ui().openSheet(close => <ExercisePurpose cfg={cfg} routine={routine} onSwap={onSwap} close={close} />)

/* ============================ the targets a session opens with ============================ */

/** For the Home card: the main lifts of `routine` and the load each would open at today. */
export function sessionTargets(st, routine, limit = 3) {
  const main = (routine?.ex || []).filter(e => !e.optional && (e.mode || 'reps') === 'reps' && ['squat', 'hinge', 'hpull', 'vpull', 'push', 'unilateral'].includes(e.role))
  const list = (main.length ? main : (routine?.ex || []).filter(e => !e.optional)).slice(0, limit)
  return list.map(cfg => {
    const p = nextPrescription(st, cfg, routine)
    const last = lastEntryFor(st, cfg.id, routine?.id)
    const weight = p?.weight != null ? p.weight : (last ? bestWeightForEntry(last) : null)
    return { id: cfg.id, name: exerciseNameFor(exOr(cfg.id)), line: exLine({ ...cfg, weight: weight > 0 ? weight : 0 }, st.unit, speedUnitOf(st)), kind: p?.kind || 'off' }
  })
}
export { estimateMinutes, routineEquipment, shortRoutine }
export const fmtMinutes = m => `${fmtNum(m)} ${t('min')}`
