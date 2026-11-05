/* Pulling a person's recent activities from the providers they connected into their pending list,
 * on request and on a timer. The app collects the pending list, turns each entry into a run
 * (frontend lib/run-import.js) and acknowledges it; nothing here touches state-<uid>.json.
 *
 * Each provider's sync is one unit: tokens made fresh, the window since the last sync (with a
 * two-day overlap, so an activity edited or uploaded late is seen), the fetch, the pending list,
 * the cursor. Failures land on the provider record as `error` with a code the app can show, and a
 * rate-limit pause as `retryAt`; the next run skips a provider until then.
 */
import * as store from './store.js';
import { StravaError, nextWindow } from './strava.js';
import { GarminError } from './garmin.js';

export const OVERLAP_MS = 2 * 86400000;
export const FIRST_SYNC_DAYS = 90;        // how far back a fresh connection looks
export const HISTORY_DAYS_MAX = 400;      // the optional "import my history" reach

const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

/** Fetch new Strava activities for `uid` into the pending list. Returns `{ fetched, complete }`. */
export async function syncStrava(uid, { strava, now = Date.now(), since = null }) {
  let rec = store.load(uid);
  if (!rec.strava) return { fetched: 0, complete: true, skipped: 'not connected' };
  if (rec.strava.retryAt && rec.strava.retryAt > now()) return { fetched: 0, complete: false, skipped: 'rate-limited' };
  const tokens = store.secretOf(rec, 'strava');
  if (!tokens) {
    rec = store.withProvider(rec, 'strava', { ...rec.strava, error: 'unreadable' }, null);
    store.save(uid, rec);
    return { fetched: 0, complete: false, skipped: 'unreadable' };
  }
  try {
    const { tokens: live, refreshed } = await strava.fresh(tokens);
    const afterMs = since ?? (rec.strava.lastSync ? rec.strava.lastSync - OVERLAP_MS : now() - FIRST_SYNC_DAYS * 86400000);
    const { activities, rate, complete } = await strava.activitiesSince(live.accessToken, afterMs / 1000);
    const runs = activities.filter(a => /run|walk|hike/i.test(String(a.sport_type || a.type || '')));
    // Laps for the newest runs, within the call budget and the rate headroom.
    let budget = rate?.nearLimit ? 0 : 20;
    const items = [];
    for (const a of runs) {
      let laps;
      if (budget > 0) {
        try { const r = await strava.laps(live.accessToken, a.id); laps = r.laps; budget -= 1; if (r.rate?.nearLimit) budget = 0; }
        catch (e) { if (e instanceof StravaError && e.code === 'rate-limit') budget = 0; else laps = undefined; }
      }
      items.push({ src: 'strava', id: String(a.id), data: a, ...(laps ? { laps } : {}), fetchedAt: now() });
    }
    rec = store.load(uid);   // re-read: a disconnect may have happened meanwhile
    if (!rec.strava) return { fetched: 0, complete: true, skipped: 'disconnected' };
    rec = store.withPending(rec, items, now());
    const meta = { ...rec.strava, lastSync: now(), lastFetched: items.length, error: null, retryAt: null, athleteId: live.athleteId ?? rec.strava.athleteId ?? null, expiresAt: live.expiresAt };
    rec = store.withProvider(rec, 'strava', meta, refreshed ? live : tokens);
    store.save(uid, rec);
    return { fetched: items.length, complete };
  } catch (e) {
    rec = store.load(uid);
    if (!rec.strava) return { fetched: 0, complete: true, skipped: 'disconnected' };
    const code = e instanceof StravaError ? e.code : 'error';
    const meta = { ...rec.strava, error: code, errorAt: now(), retryAt: code === 'rate-limit' ? nextWindow(now()) : null };
    store.save(uid, store.withProvider(rec, 'strava', meta, store.secretOf(rec, 'strava')));
    return { fetched: 0, complete: false, error: code };
  }
}

/** Fetch new Garmin activities for `uid` into the pending list. Returns `{ fetched, complete }`. */
export async function syncGarmin(uid, { garmin, now = Date.now(), since = null }) {
  let rec = store.load(uid);
  if (!rec.garmin) return { fetched: 0, complete: true, skipped: 'not connected' };
  if (rec.garmin.retryAt && rec.garmin.retryAt > now()) return { fetched: 0, complete: false, skipped: 'rate-limited' };
  const secret = store.secretOf(rec, 'garmin');
  if (!secret?.apiKey) {
    store.save(uid, store.withProvider(rec, 'garmin', { ...rec.garmin, error: 'unreadable' }, null));
    return { fetched: 0, complete: false, skipped: 'unreadable' };
  }
  try {
    const { token, refreshed } = await garmin.fresh(secret.apiKey, secret.token);
    const fromMs = since ?? (rec.garmin.lastSync ? rec.garmin.lastSync - OVERLAP_MS : now() - FIRST_SYNC_DAYS * 86400000);
    const activities = await garmin.activities(token.accessToken, { startDate: isoDay(fromMs), endDate: isoDay(now() + 86400000) });
    const items = activities.map(a => ({ src: 'garmin', id: String(a.activityId), data: a, fetchedAt: now() }));
    let zones = rec.garmin.zones || null;
    if (!zones || now() - (rec.garmin.zonesAt || 0) > 7 * 86400000) {
      try { zones = await garmin.heartRateZones(token.accessToken); } catch { /* zones are a nicety */ }
    }
    rec = store.load(uid);
    if (!rec.garmin) return { fetched: 0, complete: true, skipped: 'disconnected' };
    rec = store.withPending(rec, items, now());
    const meta = { ...rec.garmin, lastSync: now(), lastFetched: items.length, error: null, retryAt: null, zones, zonesAt: zones ? now() : rec.garmin.zonesAt || null };
    rec = store.withProvider(rec, 'garmin', meta, refreshed ? { apiKey: secret.apiKey, token } : secret);
    store.save(uid, rec);
    return { fetched: items.length, complete: true };
  } catch (e) {
    rec = store.load(uid);
    if (!rec.garmin) return { fetched: 0, complete: true, skipped: 'disconnected' };
    const code = e instanceof GarminError ? e.code : 'error';
    // An unauthorized answer most likely means the key expired (they run 30 days to a year).
    const meta = { ...rec.garmin, error: code, errorAt: now(), retryAt: code === 'rate-limit' ? now() + 3600000 : null };
    store.save(uid, store.withProvider(rec, 'garmin', meta, store.secretOf(rec, 'garmin')));
    return { fetched: 0, complete: false, error: code };
  }
}

/**
 * The timer: every `intervalMs` (INTEGRATIONS_POLL_MIN minutes; 0 switches it off), each
 * connected user's providers in turn, one user at a time, errors kept per user. Returns a stop().
 */
export function startPoller({ intervalMs, strava, garmin, log = console, now = Date.now }) {
  if (!intervalMs || intervalMs <= 0) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const uid of store.connectedUids()) {
        try {
          const rec = store.load(uid);
          if (rec.strava && strava) await syncStrava(uid, { strava, now });
          if (rec.garmin && garmin) await syncGarmin(uid, { garmin, now });
        } catch (e) { log.error?.('integrations poll', uid, e?.message || e); }
      }
    } finally { running = false; }
  };
  const first = setTimeout(tick, 15000);
  first.unref?.();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => { clearTimeout(first); clearInterval(timer); };
}
