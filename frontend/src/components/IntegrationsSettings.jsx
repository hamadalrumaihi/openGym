import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO, fmtDate } from '../lib/format.js'
import { runningOf, withRunning, GOAL_LABEL } from '../lib/running.js'
import { integrationsStatus, stravaConnectUrl, syncProvider, disconnectProvider, connectGarmin, collectPending, withoutSourceRuns, stravaCallbackMessage } from '../lib/integrations.js'
import { runningSetupSheet, pickFitFiles } from '../running-sheets.jsx'
import { menuSheet } from '../sheets.jsx'
import { Section, Row, Switch, Button, TextField } from './ui.jsx'

/**
 * Settings → Running: the plan's door and its reminder switch, the Garmin Connect Personal API
 * key, the Strava connection, and the FIT file import. The server keeps the tokens
 * (api/integrations); this page only ever shows whether a provider is connected, when it last
 * pulled, and what went wrong. Both are read-only by design and say so.
 */
export default function RunningSettingsPage() {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const update = useStore(s => s.update)
  const toast = m => useUI.getState().toast(m)
  const nav = useNavigate()
  const running = runningOf(S)
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(null)
  const [garminKey, setGarminKey] = useState('')
  const [garminOpen, setGarminOpen] = useState(false)
  const today = todayISO()

  const refresh = async () => { try { setSt(await integrationsStatus()) } catch (e) { setSt({ error: e?.status === 401 ? 'signed-out' : 'offline' }) } }
  useEffect(() => { if (user) refresh() }, [user])
  // Strava sent the browser back here with a reason in the query (`#/settings/running?strava=…`).
  useEffect(() => {
    const code = new URLSearchParams((window.location.hash.split('?')[1] || '')).get('strava')
    if (!code) return
    const msg = stravaCallbackMessage(code)
    if (msg) toast(t(msg))
    nav('/settings/running', { replace: true })
    if (code === 'connected') setTimeout(() => { refresh(); collect() }, 2500)
  }, [])

  const collect = async () => {
    const r = await collectPending({ update, getState: () => useStore.getState().S, today })
    if (r.added || r.updated) toast(tn('{0} run imported', '{0} runs imported', r.added + r.updated))
    return r
  }
  const sync = provider => async (days = 0) => {
    setBusy(provider)
    try {
      const r = await syncProvider(provider, days)
      await collect()
      if (!r.fetched) toast(days ? t('No runs found in that period') : t('Nothing new'))
      await refresh()
    } catch (e) {
      toast(e?.data?.code === 'rate-limit' ? t('Rate limit reached. Try again in a quarter of an hour.') : e?.data?.code === 'unauthorized' ? t('Access expired. Reconnect to continue.') : t('Could not reach the server'))
      refresh()
    }
    setBusy(null)
  }
  const disconnect = provider => () => menuSheet({
    title: provider === 'strava' ? t('Disconnect Strava?') : t('Disconnect Garmin Connect?'),
    subtitle: t('The connection and anything still waiting on the server are deleted. Your runs can stay in your log as yours, or go too.'),
    items: [
      { icon: 'check', label: t('Disconnect, keep my runs'), onClick: () => doDisconnect(provider, false) },
      { icon: 'trash', label: t('Disconnect and delete the runs it brought'), danger: true, onClick: () => doDisconnect(provider, true) },
    ],
  })
  const doDisconnect = async (provider, deleteRuns) => {
    setBusy(provider)
    try {
      await disconnectProvider(provider, deleteRuns)
      if (deleteRuns) update(s => { const r = withoutSourceRuns(s.runLog, provider); s.runLog = r.map })
      toast(t('Disconnected'))
      await refresh()
    } catch { toast(t('Could not reach the server')) }
    setBusy(null)
  }
  const connectStrava = async () => {
    setBusy('strava')
    try { window.location.assign(await stravaConnectUrl()) }
    catch (e) { toast(e?.data?.code === 'unconfigured' ? t('Strava is not set up on this server.') : t('Could not reach the server')); setBusy(null) }
  }
  const saveGarmin = async () => {
    const key = garminKey.trim()
    if (!key) return
    setBusy('garmin')
    try {
      await connectGarmin(key)
      setGarminKey(''); setGarminOpen(false)
      toast(t('Garmin Connect connected. Your recent runs are on their way.'))
      setTimeout(() => { refresh(); collect() }, 2500)
      await refresh()
    } catch (e) {
      toast(e?.data?.code === 'unauthorized' ? t('Garmin refused that key. Copy it again from Garmin Connect.') : e?.data?.code === 'network' ? t('Garmin could not be reached') : t('Could not reach the server'))
    }
    setBusy(null)
  }
  const line = p => {
    const s = st?.[p]
    if (!s?.connected) return null
    const err = s.error === 'rate-limit' ? t('Paused by the rate limit until {0}', s.retryAt ? new Date(s.retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…') : s.error === 'unauthorized' ? t('Access expired. Reconnect.') : s.error ? t('The last pull failed; the next one will retry.') : null
    const when = s.lastSync ? t('Last synced {0}', fmtDate(new Date(s.lastSync).toISOString().slice(0, 10), true)) : t('First sync pending')
    return [err || when, s.lastFetched ? tn('{0} activity last time', '{0} activities last time', s.lastFetched) : null].filter(Boolean).join(' · ')
  }

  return <>
    <Section title={t('Road to 10K')} footer={running ? t('The plan, the weeks, your runs and the coach live on the Running screen.') : null}>
      <Row icon="figureRun" iconTint="var(--green)" title={t('Road to 10K')} value={running ? GOAL_LABEL[running.goal] : t('Off')} accessory="chevron" onClick={() => (running ? nav('/running') : runningSetupSheet(() => nav('/running')))} />
      {running && <Row icon="bell" iconTint="var(--red)" title={t('Run day reminders')} subtitle={S.reminder?.on ? t('With the day reminder, at {0}', S.reminder.time || '08:00') : t('Switch the day reminder on under Reminders first')}>
        <Switch checked={running.remind !== false} onChange={v => update(s => { s.running = withRunning(s, { remind: v }) })} />
      </Row>}
    </Section>

    <Section title={t('Garmin Connect')} footer={t('Garmin’s Personal API is read-only: openGym pulls your own runs and never writes to your account or your watch. The key is stored encrypted on the server and never in a backup. Workouts reach the watch as .fit files (Running screen → To watch).')}>
      {!user ? <Row icon="link" iconTint="var(--blue)" title={t('Garmin Connect')} subtitle={t('Sign in to connect. FIT files work without an account.')} />
        : st?.garmin?.connected ? <>
          <Row icon="link" iconTint="var(--green)" title={t('Garmin Connect')} subtitle={line('garmin')} value={t('Connected')} />
          {st.garmin.keyExpires && <Row icon="clock" iconTint="var(--orange)" title={t('Key expires')} value={fmtDate(st.garmin.keyExpires, true, true)} />}
          <Row icon="reset" iconTint="var(--blue)" title={busy === 'garmin' ? t('Syncing…') : t('Sync now')} accessory="chevron" className={busy ? 'dis' : ''} onClick={() => !busy && sync('garmin')()} />
          <Row icon="history" iconTint="var(--teal)" title={t('Import the last year')} accessory="chevron" className={busy ? 'dis' : ''} onClick={() => !busy && sync('garmin')(365)} />
          <Row icon="signOut" iconTint="var(--red)" title={t('Disconnect Garmin Connect')} danger onClick={disconnect('garmin')} />
        </> : <>
          <Row icon="link" iconTint="var(--blue)" title={t('Garmin Connect')} subtitle={st?.garmin?.error === 'unauthorized' ? t('The key stopped working; paste a new one.') : t('Paste the Personal API key from Garmin Connect → Settings → Personal API key.')} accessory="chevron" onClick={() => setGarminOpen(v => !v)} />
          {garminOpen && <div style={{ padding: '8px 12px 12px' }}>
            <TextField value={garminKey} onChange={e => setGarminKey(e.target.value)} placeholder={t('Personal API key')} autoComplete="off" spellCheck={false} />
            <div className="small dim" style={{ margin: '6px 0 8px' }}>{t('connect.garmin.com → Settings → Personal API key → Create Key. Garmin shows it once; it is valid for the period you chose there.')}</div>
            <Button variant="primary" size="sm" disabled={!garminKey.trim() || busy === 'garmin'} onClick={saveGarmin}>{busy === 'garmin' ? t('Checking…') : t('Connect')}</Button>
          </div>}
        </>}
      <Row icon="download" iconTint="var(--teal)" title={t('Import a FIT file')} subtitle={t('An activity from the watch or Garmin Connect’s “Export original” (.fit or .zip).')} accessory="chevron" onClick={pickFitFiles} />
    </Section>

    <Section title="Strava" footer={t('Powered by Strava. Read-only: openGym never uploads or edits an activity. What Strava sends is shown to you alone, and a disconnect deletes it on request. A run recorded on your Garmin and seen on both sides is kept once, the Garmin copy first.')}>
      {!user ? <Row icon="link" iconTint="var(--orange)" title="Strava" subtitle={t('Sign in to connect.')} />
        : st?.strava?.configured === false ? <Row icon="link" iconTint="var(--grey)" title="Strava" subtitle={t('Not set up on this server (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET).')} />
        : st?.strava?.connected ? <>
          <Row icon="link" iconTint="var(--green)" title="Strava" subtitle={line('strava')} value={t('Connected')} />
          <Row icon="reset" iconTint="var(--blue)" title={busy === 'strava' ? t('Syncing…') : t('Sync now')} accessory="chevron" className={busy ? 'dis' : ''} onClick={() => !busy && sync('strava')()} />
          <Row icon="history" iconTint="var(--teal)" title={t('Import the last year')} subtitle={t('A few calls against Strava’s daily limit.')} accessory="chevron" className={busy ? 'dis' : ''} onClick={() => !busy && sync('strava')(365)} />
          <Row icon="signOut" iconTint="var(--red)" title={t('Disconnect Strava')} danger onClick={disconnect('strava')} />
        </> : <Row icon="link" iconTint="var(--orange)" title="Strava" subtitle={t('Tap to connect: Strava asks you to allow “View data about your activities”. Nothing is written back.')} value={t('Connect')} accessory="chevron" onClick={connectStrava} />}
    </Section>
    {st?.error && user && <div className="muted small" style={{ margin: '-8px 4px 16px' }}>{st.error === 'signed-out' ? t('Sign in again to see your connections.') : t('The server could not be reached; connection status is unknown.')}</div>}
  </>
}
