/* HTTP surface for the Garmin and Strava connections, as a factory taking server.js's own helpers
 * (the coach routes are built the same way). Every route is for the signed-in person's own
 * connections; nothing here is an admin surface, and no route ever writes to Strava or Garmin.
 *
 *   GET  /api/integrations                      what is configured and connected, pending count
 *   POST /api/integrations/strava/connect       → { url } to send the browser to Strava
 *   GET  /api/integrations/strava/callback      Strava sends the browser back here → 302 into the app
 *   POST /api/integrations/strava/sync          fetch new activities now (optional `{ days }` for history)
 *   POST /api/integrations/strava/disconnect    revoke at Strava, delete tokens and fetched activities
 *   GET  /api/integrations/strava/webhook       Strava's subscription validation (hub.challenge)
 *   POST /api/integrations/strava/webhook       Strava's events: a new activity → sync soon; deauthorize → delete
 *   POST /api/integrations/garmin/connect       { key }: a Garmin Personal API key, checked with one token call
 *   POST /api/integrations/garmin/sync
 *   POST /api/integrations/garmin/disconnect
 *   GET  /api/integrations/activities           the pending activities, trimmed, for the app to turn into runs
 *   POST /api/integrations/activities/ack       { keys: ['strava:123', …] } the app has stored these
 *
 * The OAuth `state` is a one-time random value kept hashed in memory with the uid and a ten-minute
 * life, burned on use, so a callback can only land on the account that started it.
 */
import crypto from 'node:crypto';
import * as store from './store.js';
import { createStrava, StravaError } from './strava.js';
import { createGarmin, GarminError } from './garmin.js';
import { syncStrava, syncGarmin, HISTORY_DAYS_MAX } from './sync.js';

const STATE_TTL_MS = 10 * 60000;
const hash = v => crypto.createHash('sha256').update(String(v)).digest('base64url');

/** The provider clients the routes and the poller share; Strava only when the instance has keys. */
export function createClients({ env = process.env, fetch: f = globalThis.fetch, now = Date.now } = {}) {
  const strava = env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET
    ? createStrava({ clientId: env.STRAVA_CLIENT_ID, clientSecret: env.STRAVA_CLIENT_SECRET, base: env.STRAVA_API_BASE || undefined, fetch: f, now })
    : null;
  const garmin = createGarmin({ base: env.GARMIN_PERSONAL_API_BASE || undefined, fetch: f, now });
  return { strava, garmin };
}

export function integrationsRoutes({ json, readBody, readSession, audit = () => {}, origin, env = process.env, clients = null, now = Date.now, onEvent = () => {} }) {
  const { strava, garmin } = clients || createClients({ env, now });
  const verifyToken = env.STRAVA_WEBHOOK_VERIFY_TOKEN || null;
  const states = new Map();   // hash(state) → { uid, exp }
  const sweep = () => { for (const [k, v] of states) if (v.exp < now()) states.delete(k); };
  const appPage = q => `${origin.replace(/\/$/, '')}/#/settings/integrations${q ? '?' + q : ''}`;
  const redirect = (res, to) => { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };
  const signedIn = (req, res) => { const u = readSession(req); if (!u) json(res, 401, { error: 'not signed in' }); return u; };
  const providerError = e => (e instanceof StravaError || e instanceof GarminError ? e.code : 'error');
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  return {
    'GET /api/integrations': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const rec = store.load(user.id);
      json(res, 200, { strava: { configured: !!strava, ...store.publicStatus(rec, now()).strava }, garmin: { configured: true, ...store.publicStatus(rec, now()).garmin }, pending: store.publicStatus(rec, now()).pending, poll: Number(env.INTEGRATIONS_POLL_MIN ?? 30) });
    },

    /* ---------- Strava ---------- */
    'POST /api/integrations/strava/connect': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      if (!strava) return json(res, 503, { error: 'Strava is not configured on this instance', code: 'unconfigured' });
      sweep();
      const state = crypto.randomBytes(24).toString('base64url');
      states.set(hash(state), { uid: user.id, exp: now() + STATE_TTL_MS });
      json(res, 200, { url: strava.authUrl(state, `${origin.replace(/\/$/, '')}/api/integrations/strava/callback`) });
    },
    'GET /api/integrations/strava/callback': async (req, res) => {
      const q = new URL(req.url, 'http://x').searchParams;
      const user = readSession(req);
      if (!strava) return redirect(res, appPage('strava=unconfigured'));
      if (!user) return redirect(res, appPage('strava=signin'));
      sweep();
      const entry = states.get(hash(q.get('state') || ''));
      states.delete(hash(q.get('state') || ''));
      if (!entry || entry.uid !== user.id) { audit(req, 'integrations.strava.state', { ok: false, user }); return redirect(res, appPage('strava=state')); }
      if (q.get('error')) return redirect(res, appPage('strava=denied'));
      const scope = String(q.get('scope') || '');
      if (!/activity:read/.test(scope)) return redirect(res, appPage('strava=scope'));
      try {
        const tokens = await strava.exchange(q.get('code') || '');
        let rec = store.load(user.id);
        rec = store.withProvider(rec, 'strava', { connectedAt: now(), athleteId: tokens.athleteId, scope: tokens.scope || scope, expiresAt: tokens.expiresAt, lastSync: null, error: null }, tokens);
        store.save(user.id, rec);
        audit(req, 'integrations.strava.connect', { user });
        // First pull in the background: the page shows "syncing" and polls the status.
        syncStrava(user.id, { strava, now }).catch(() => {});
        redirect(res, appPage('strava=connected'));
      } catch (e) {
        audit(req, 'integrations.strava.connect', { ok: false, user, msg: e?.message });
        redirect(res, appPage('strava=' + providerError(e)));
      }
    },
    'POST /api/integrations/strava/sync': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      if (!strava) return json(res, 503, { error: 'Strava is not configured on this instance', code: 'unconfigured' });
      const body = await readBody(req);
      const days = Math.min(HISTORY_DAYS_MAX, Math.max(0, Math.round(Number(body?.days) || 0)));
      const r = await syncStrava(user.id, { strava, now, since: days ? now() - days * 86400000 : null });
      if (r.error) return json(res, r.error === 'rate-limit' ? 429 : r.error === 'unauthorized' ? 401 : 502, { error: r.error, code: r.error, ...r });
      json(res, 200, { ok: true, ...r, pending: store.publicStatus(store.load(user.id), now()).pending });
    },
    'POST /api/integrations/strava/disconnect': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const body = await readBody(req);
      let rec = store.load(user.id);
      const tokens = store.secretOf(rec, 'strava');
      if (tokens && strava) await strava.deauthorize(tokens.accessToken);
      rec = store.withProvider(rec, 'strava', null, null);
      rec = store.withoutSource(rec, 'strava');
      store.save(user.id, rec);
      audit(req, 'integrations.strava.disconnect', { user });
      // The app deletes the Strava-sourced runs from the state itself when asked to (`deleteRuns`
      // is echoed so the client knows the server saw the request).
      json(res, 200, { ok: true, deleteRuns: !!body?.deleteRuns });
    },
    'GET /api/integrations/strava/webhook': async (req, res) => {
      const q = new URL(req.url, 'http://x').searchParams;
      if (!verifyToken) return json(res, 404, { error: 'not found' });
      if (q.get('hub.mode') !== 'subscribe' || q.get('hub.verify_token') !== verifyToken) return json(res, 403, { error: 'verify token mismatch' });
      json(res, 200, { 'hub.challenge': q.get('hub.challenge') || '' });
    },
    'POST /api/integrations/strava/webhook': async (req, res) => {
      if (!verifyToken || !strava) return json(res, 404, { error: 'not found' });
      let ev = null;
      try { ev = await readBody(req); } catch { return json(res, 200, { ok: true }); }
      // Answer within two seconds, always 200: the work happens after.
      json(res, 200, { ok: true });
      try {
        const athleteId = Number(ev?.owner_id);
        if (!athleteId) return;
        const uid = store.connectedUids().find(u => Number(store.load(u).strava?.athleteId) === athleteId);
        if (!uid) return;
        if (ev.object_type === 'athlete' && ev.aspect_type === 'update' && String(ev.updates?.authorized) === 'false') {
          let rec = store.load(uid);
          rec = store.withoutSource(store.withProvider(rec, 'strava', null, null), 'strava');
          store.save(uid, rec);
          onEvent({ kind: 'deauthorized', uid });
          return;
        }
        if (ev.object_type === 'activity') {
          await syncStrava(uid, { strava, now });
          onEvent({ kind: 'activity', uid, id: ev.object_id, aspect: ev.aspect_type });
        }
      } catch (e) { console.error('strava webhook', e?.message || e); }
    },

    /* ---------- Garmin Connect Personal API ---------- */
    'POST /api/integrations/garmin/connect': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const body = await readBody(req);
      const apiKey = str(body?.key, 512);
      if (!apiKey) return json(res, 400, { error: 'a Personal API key is required', code: 'no-key' });
      try {
        const token = await garmin.token(apiKey);
        let rec = store.load(user.id);
        rec = store.withProvider(rec, 'garmin', { connectedAt: now(), keyExpires: /^\d{4}-\d{2}-\d{2}$/.test(String(body?.keyExpires || '')) ? body.keyExpires : null, lastSync: null, error: null }, { apiKey, token });
        store.save(user.id, rec);
        audit(req, 'integrations.garmin.connect', { user });
        syncGarmin(user.id, { garmin, now }).catch(() => {});
        json(res, 200, { ok: true });
      } catch (e) {
        audit(req, 'integrations.garmin.connect', { ok: false, user, msg: e?.message });
        const code = providerError(e);
        json(res, code === 'unauthorized' ? 401 : code === 'network' ? 502 : 400, { error: e?.message || 'could not use the key', code });
      }
    },
    'POST /api/integrations/garmin/sync': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const body = await readBody(req);
      const days = Math.min(HISTORY_DAYS_MAX, Math.max(0, Math.round(Number(body?.days) || 0)));
      const r = await syncGarmin(user.id, { garmin, now, since: days ? now() - days * 86400000 : null });
      if (r.error) return json(res, r.error === 'rate-limit' ? 429 : r.error === 'unauthorized' ? 401 : 502, { error: r.error, code: r.error, ...r });
      json(res, 200, { ok: true, ...r, pending: store.publicStatus(store.load(user.id), now()).pending });
    },
    'POST /api/integrations/garmin/disconnect': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const body = await readBody(req);
      let rec = store.load(user.id);
      rec = store.withoutSource(store.withProvider(rec, 'garmin', null, null), 'garmin');
      store.save(user.id, rec);
      audit(req, 'integrations.garmin.disconnect', { user });
      json(res, 200, { ok: true, deleteRuns: !!body?.deleteRuns });
    },

    /* ---------- the pending activities ---------- */
    'GET /api/integrations/activities': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const rec = store.load(user.id);
      const cutoff = now() - store.PENDING_DAYS * 86400000;
      json(res, 200, { activities: (rec.pending || []).filter(a => (a.fetchedAt || 0) >= cutoff), garminZones: rec.garmin?.zones || null });
    },
    'POST /api/integrations/activities/ack': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const body = await readBody(req);
      const keys = Array.isArray(body?.keys) ? body.keys.filter(k => typeof k === 'string').slice(0, 1000) : [];
      const rec = store.withoutPending(store.load(user.id), keys);
      store.save(user.id, rec);
      json(res, 200, { ok: true, pending: rec.pending.length });
    },
  };
}
