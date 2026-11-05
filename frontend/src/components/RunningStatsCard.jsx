import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t, tn } from '../lib/i18n.js'
import { todayISO, fmtDate } from '../lib/format.js'
import { runningOf, runsOf, fmtKm, fmtRunDur, fmtPace, paceSecPerKm } from '../lib/running.js'
import { weeklyRunning, longestRun, bestOver, consistency, raceProgress, trainingMix, hrTrend, paceTrend } from '../lib/running-stats.js'
import LineChart from './LineChart.jsx'
import { Button, Segmented } from './ui.jsx'
import Icon from './Icon.jsx'

const RANGES = () => [{ value: 8, label: '8W' }, { value: 13, label: '3M' }, { value: 26, label: '6M' }, { value: 52, label: '1Y' }]

/**
 * The running numbers on Stats: this week, the longest run, the best 5K and 10K (estimates are
 * labelled), weekly distance and time, the heart-rate and pace trends, and the training mix
 * next to the gym and the mat. Shown once there is a run or a plan.
 */
export default function RunningStatsCard({ S }) {
  const nav = useNavigate()
  const today = todayISO()
  const [weeks, setWeeks] = useState(13)
  const runs = useMemo(() => runsOf(S).filter(r => r.kind === 'run'), [S.runLog])
  const rows = useMemo(() => weeklyRunning(S, today, weeks), [S.runLog, S.weekStart, today, weeks])
  const distPts = useMemo(() => rows.map(r => ({ t: new Date(r.week + 'T12:00:00').getTime(), y: Math.round(r.distM / 100) / 10, d: r.week })), [rows])
  const hrPts = useMemo(() => hrTrend(S).filter(p => p.d >= rows[0]?.week), [S.runLog, rows])
  const pacePts = useMemo(() => paceTrend(S).filter(p => p.d >= rows[0]?.week).map(p => ({ ...p, y: Math.round(p.y / 6) / 10 })), [S.runLog, rows])
  const longest = useMemo(() => longestRun(S), [S.runLog])
  const best5 = useMemo(() => bestOver(S, 5000), [S.runLog])
  const best10 = useMemo(() => bestOver(S, 10000), [S.runLog])
  const cons = useMemo(() => consistency(S, today), [S, today])
  const progress = useMemo(() => raceProgress(S, today), [S.running, today])
  const mix = useMemo(() => trainingMix(S, today, 28), [S, today])
  const running = runningOf(S)
  if (!runs.length && !running) return null
  const thisWeek = rows[rows.length - 1]
  const bestLine = b => (b ? `${fmtRunDur(b.sec)}${b.exact ? '' : ' ' + t('(est.)')}` : '–')

  return <div className="card">
    <div className="row between bw-head" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t('Running')}</h2>
      <Button size="sm" variant="tinted" trailingIcon="chevronRight" onClick={() => nav('/running')}>{t('Open')}</Button>
    </div>
    <div className="tiles">
      <div className="tile"><div className="l"><Icon name="figureRun" />{t('This week')}</div><div className="v" style={{ fontSize: 20 }}>{thisWeek?.distM ? fmtKm(thisWeek.distM) : thisWeek?.sec ? fmtRunDur(thisWeek.sec) : '–'}</div></div>
      <div className="tile"><div className="l"><Icon name="stopwatch" />{t('Longest')}</div><div className="v" style={{ fontSize: 20 }}>{longest ? (longest.byDist.distM ? fmtKm(longest.byDist.distM) : fmtRunDur(longest.byTime.sec)) : '–'}</div></div>
      <div className="tile"><div className="l"><Icon name="medal" />5K</div><div className="v" style={{ fontSize: 20 }}>{bestLine(best5)}</div></div>
      <div className="tile"><div className="l"><Icon name="trophy" />10K</div><div className="v" style={{ fontSize: 20 }}>{bestLine(best10)}</div></div>
    </div>
    {progress && <div className="small muted" style={{ marginTop: 8 }}>
      {t('Week {0} of {1}', Math.min(progress.weeks, progress.weeksDone + 1), progress.weeks)}
      {cons?.planned ? ` · ${t('{0} of {1} sessions kept', cons.done, cons.planned)}` : ''}
      {progress.daysToRace != null && progress.daysToRace >= 0 ? ` · ${tn('race in {0} day', 'race in {0} days', progress.daysToRace)}` : ''}
    </div>}
    {runs.length > 0 && <>
      <Segmented className="seg-range" value={weeks} onChange={setWeeks} options={RANGES()} />
      <div className="small muted" style={{ marginTop: 6 }}>{t('Weekly distance (km)')}</div>
      <div className="chart"><LineChart points={distPts} h={120} unit="km" color="var(--green)" /></div>
      {hrPts.length >= 2 && <>
        <div className="small muted" style={{ marginTop: 6 }}>{t('Average heart rate per run (bpm)')}</div>
        <div className="chart"><LineChart points={hrPts} h={110} unit="bpm" color="var(--red)" /></div>
      </>}
      {pacePts.length >= 2 && <>
        <div className="small muted" style={{ marginTop: 6 }}>{t('Average pace per run (min/km, lower is faster)')}</div>
        <div className="chart"><LineChart points={pacePts} h={110} unit="" color="var(--blue)" invert /></div>
      </>}
    </>}
    <div className="small dim" style={{ marginTop: 8 }}>
      {t('Last 28 days: {0} · {1} · {2}', tn('{0} run', '{0} runs', mix.runs.count) + (mix.runs.distM ? ` (${fmtKm(mix.runs.distM)})` : ''), tn('{0} gym session', '{0} gym sessions', mix.gym.count), tn('{0} mat session', '{0} mat sessions', mix.mat.count))}
    </div>
    {longest && <div className="small dim">{t('Longest run: {0} on {1}', longest.byTime.distM ? `${fmtKm(longest.byTime.distM)} · ${fmtRunDur(longest.byTime.sec)}` : fmtRunDur(longest.byTime.sec), fmtDate(longest.byTime.d, true))}{paceSecPerKm(longest.byTime.sec, longest.byTime.distM) ? ` · ${t('{0} /km', fmtPace(paceSecPerKm(longest.byTime.sec, longest.byTime.distM)))}` : ''}</div>}
    {runs.some(r => r.src === 'strava') && <div className="small dim" style={{ marginTop: 4 }}>{t('Strava runs: Powered by Strava, shown only to you.')}{runs.some(r => r.src === 'garmin' || r.viaGarmin) ? ' · ' + t('Garmin data from Garmin Connect.') : ''}</div>}
  </div>
}
