// The Garmin and Strava connections: the encrypted store, the two clients against local mocks,
// the sync into the pending list, and the routes on a booted server. No real provider is called.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-secret-integrations-0123456789';
const uid = 'u_run_1';
const cookie = () => { const p = `${uid}:${Date.now() + 86400000}:0`; return `gymsid=${p}.${crypto.createHmac('sha256', SECRET).update(p).digest('base64url')}`; };

// A data directory for the in-process module tests, set before the store is imported.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-integ-'));
fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
process.env.DATA_DIR = dataDir;
const store = await import('../integrations/store.js');
const { createStrava, rateInfo, trimActivity: trimStrava, StravaError } = await import('../integrations/strava.js');
const { createGarmin, trimActivity: trimGarmin, GarminError } = await import('../integrations/garmin.js');
const { syncStrava, syncGarmin } = await import('../integrations/sync.js');

/* ---------- a mock of both providers ---------- */
const mock = { calls: [], rate: '50,500', limit: '200,2000', fail401Once: false, tokenFail: false, garminKeyOk: 'good-key', status429: false };
const stravaActivity = (id, over = {}) => ({
  id, name: 'Run ' + id, type: 'Run', sport_type: 'Run', start_date: '2026-11-10T15:02:11Z', start_date_local: '2026-11-10T18:02:11Z',
  distance: 4512.3, moving_time: 1790, elapsed_time: 1830, total_elevation_gain: 13.6, average_heartrate: 148.3, max_heartrate: 171, average_cadence: 81.6,
  device_name: 'Garmin Forerunner 965', external_id: 'garmin_push_' + id, map: { summary_polyline: 'xyz' }, start_latlng: [25.28, 51.53], end_latlng: [25.28, 51.53],
  segment_efforts: [{ id: 1 }], ...over,
});
const garminActivity = (id, typeKey = 'running') => ({
  activityId: id, activityName: 'Doha Run', startTimeLocal: '2026-11-10 18:02:11', startTimeGMT: '2026-11-10 15:02:11', beginTimestamp: Date.UTC(2026, 10, 10, 15, 2, 11),
  activityType: { typeId: 1, typeKey, parentTypeId: 17 }, distance: 4512.3, duration: 1811.4, averageHR: 148, maxHR: 171, averageRunningCadenceInStepsPerMinute: 163.2,
  elevationGain: 13.6, hrTimeInZone_1: 120, hrTimeInZone_2: 900, hrTimeInZone_3: 600, hrTimeInZone_4: 191, hrTimeInZone_5: 0, aerobicTrainingEffect: 2.8, activityTrainingLoad: 61.7,
  vO2MaxValue: 41, startLatitude: 25.2854, startLongitude: 51.531, endLatitude: 25.29, endLongitude: 51.54, hasPolyline: true, ownerDisplayName: 'someone',
});
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  mock.calls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), auth: req.headers.authorization || null });
  const send = (code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'x-ratelimit-limit': mock.limit, 'x-ratelimit-usage': mock.rate, ...headers }); res.end(JSON.stringify(body)); };
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    // Strava
    if (u.pathname === '/oauth/token') {
      const form = Object.fromEntries(new URLSearchParams(body));
      if (mock.tokenFail) return send(400, { message: 'Bad Request', errors: [{ field: 'code', code: 'invalid' }] });
      const n = form.grant_type === 'refresh_token' ? 'R' : 'A';
      return send(200, { access_token: 'acc-' + n + '-' + form.code || 'x', refresh_token: 'ref-' + n, expires_at: Math.floor(Date.now() / 1000) + 21600, scope: 'read,activity:read_all', athlete: { id: 777 } });
    }
    if (u.pathname === '/oauth/deauthorize') return send(200, { access_token: 'gone' });
    if (u.pathname === '/api/v3/athlete/activities') {
      if (mock.status429) return send(429, { message: 'Rate Limit Exceeded' });
      if (mock.fail401Once) { mock.fail401Once = false; return send(401, { message: 'Authorization Error' }); }
      const page = Number(u.searchParams.get('page') || 1);
      if (page > 1) return send(200, []);
      return send(200, [stravaActivity(101), stravaActivity(102, { type: 'Ride', sport_type: 'Ride' }), stravaActivity(103, { sport_type: 'Walk', type: 'Walk' })]);
    }
    if (/^\/api\/v3\/activities\/\d+\/laps$/.test(u.pathname)) return send(200, [{ id: 1, lap_index: 1, moving_time: 600, distance: 1500, average_heartrate: 140.2, start_latlng: [1, 2] }, { id: 2, lap_index: 2, moving_time: 1190, distance: 3012.3, average_heartrate: 152 }]);
    // Garmin
    if (u.pathname === '/personalapitoken-service/personal-api/personal-api-key/token') {
      if (req.headers.authorization !== `ApiKey ${mock.garminKeyOk}`) return send(401, { message: 'unauthorized' });
      return send(200, { access_token: 'gtoken', expires_in: 86400 });
    }
    if (u.pathname === '/activitylist-service/activities/search/activities') {
      if (req.headers.authorization !== 'Bearer gtoken' || mock.garminKeyOk !== 'good-key') return send(401, {});
      const type = u.searchParams.get('activityType');
      if (Number(u.searchParams.get('start') || 0) > 0) return send(200, []);
      return send(200, type === 'running' ? [garminActivity(20001), garminActivity(20002)] : type === 'walking' ? [garminActivity(20003, 'walking')] : []);
    }
    if (u.pathname === '/biometric-service/heartRateZones/v2') return send(200, [{ sport: 'RUNNING', trainingMethod: 'HR_RESERVE', maxHeartRateUsed: 185, restingHeartRateUsed: 52, zone1Floor: 118, zone2Floor: 132, zone3Floor: 145, zone4Floor: 158, zone5Floor: 172 }]);
    send(404, { error: 'mock: not found ' + u.pathname });
  });
});
let base = '';
before(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

/* ---------- the store ---------- */
test('tokens are encrypted at rest, the file is 0600, and disconnecting the last provider deletes it', () => {
  const u = 'u_store';
  let rec = store.withProvider(store.load(u), 'strava', { connectedAt: 1, athleteId: 5 }, { accessToken: 'secret-a', refreshToken: 'secret-r' });
  store.save(u, rec);
  const file = path.join(dataDir, 'integrations-u_store.json');
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes('secret-a') && !raw.includes('secret-r'), 'token material must not be readable in the file');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(store.secretOf(store.load(u), 'strava'), { accessToken: 'secret-a', refreshToken: 'secret-r' });
  const pub = store.publicStatus(store.load(u));
  assert.equal(pub.strava.connected, true);
  assert.equal(pub.strava.enc, undefined);
  assert.equal(pub.garmin.connected, false);
  rec = store.withPending(rec, [{ src: 'strava', id: '1', data: { a: 1 } }, { src: 'strava', id: '1', data: { a: 2 } }, { src: 'garmin', id: '9', data: {} }], 1000);
  assert.equal(rec.pending.length, 2);
  assert.equal(rec.pending.find(a => a.src === 'strava').data.a, 2);
  rec = store.withoutPending(rec, ['strava:1']);
  assert.equal(rec.pending.length, 1);
  rec = store.withoutSource(rec, 'garmin');
  assert.equal(rec.pending.length, 0);
  // An entry nobody collected for a week is dropped.
  const old = store.withPending(rec, [{ src: 'strava', id: '2', data: {}, fetchedAt: 1000 }], 1000 + 8 * 86400000);
  assert.equal(old.pending.length, 0);
  rec = store.withProvider(rec, 'strava', null, null);
  store.save(u, rec);
  assert.equal(fs.existsSync(file), false);
  // A tampered blob reads as null, not as a crash.
  assert.equal(store.decrypt('AAAA'), null);
  assert.ok(store.connectedUids().every(x => x !== u));
});

/* ---------- the Strava client ---------- */
test('the Strava client reads rate limits, trims coordinates, pages and refreshes a stale token', async () => {
  const strava = createStrava({ clientId: 'cid', clientSecret: 'csec', base });
  assert.match(strava.authUrl('st4te', 'https://gym.example/api/integrations/strava/callback'), /oauth\/authorize\?client_id=cid&response_type=code&redirect_uri=https%3A%2F%2Fgym.example%2Fapi%2Fintegrations%2Fstrava%2Fcallback&approval_prompt=auto&scope=read%2Cactivity%3Aread_all&state=st4te$/);
  const tokens = await strava.exchange('c0de');
  assert.equal(tokens.athleteId, 777);
  assert.match(tokens.accessToken, /^acc-A/);
  const stale = { ...tokens, expiresAt: Date.now() - 1 };
  const { tokens: fresh, refreshed } = await strava.fresh(stale);
  assert.equal(refreshed, true);
  assert.match(fresh.accessToken, /^acc-R/);
  assert.equal((await strava.fresh(tokens)).refreshed, false);
  const { activities, rate, complete } = await strava.activitiesSince(tokens.accessToken, 0);
  assert.equal(activities.length, 3);
  assert.equal(complete, true);
  assert.deepEqual(rate, { short: 50, daily: 500, shortLimit: 200, dailyLimit: 2000, nearLimit: false });
  const a = activities[0];
  assert.equal(a.gps, true);
  assert.equal(a.map, undefined);
  assert.equal(a.start_latlng, undefined);
  assert.equal(a.segment_efforts, undefined);
  assert.equal(a.device_name, 'Garmin Forerunner 965');
  const { laps } = await strava.laps(tokens.accessToken, 101);
  assert.equal(laps.length, 2);
  assert.equal(laps[0].start_latlng, undefined);
  assert.equal(rateInfo({ 'x-ratelimit-limit': '200,2000', 'x-ratelimit-usage': '180,1000' }).nearLimit, true);
  assert.equal(rateInfo({}), null);
  assert.equal(trimStrava(null), null);
  assert.throws(() => createStrava({ clientId: '', clientSecret: '' }), StravaError);
  mock.tokenFail = true;
  await assert.rejects(() => strava.exchange('bad'), e => e instanceof StravaError && e.code === 'http');
  mock.tokenFail = false;
  mock.status429 = true;
  await assert.rejects(() => strava.activitiesSince(tokens.accessToken, 0), e => e instanceof StravaError && e.code === 'rate-limit' && e.retryAt > Date.now());
  mock.status429 = false;
});

/* ---------- the Garmin client ---------- */
test('the Garmin client buys a token with the key, pages running and walking, and trims coordinates', async () => {
  const garmin = createGarmin({ base });
  await assert.rejects(() => garmin.token('wrong'), e => e instanceof GarminError && e.code === 'unauthorized');
  const tok = await garmin.token('good-key');
  assert.equal(tok.accessToken, 'gtoken');
  assert.ok(tok.expiresAt > Date.now() + 23 * 3600000);
  assert.equal((await garmin.fresh('good-key', tok)).refreshed, false);
  assert.equal((await garmin.fresh('good-key', { ...tok, expiresAt: 0 })).refreshed, true);
  const acts = await garmin.activities('gtoken', { startDate: '2026-10-01', endDate: '2026-11-11' });
  assert.equal(acts.length, 3);
  assert.equal(acts[0].startLatitude, undefined);
  assert.equal(acts[0].ownerDisplayName, undefined);
  assert.deepEqual(acts[0].activityType, { typeKey: 'running', typeId: 1 });
  assert.equal(acts[0].activityTrainingLoad, 61.7);
  const q = mock.calls.filter(c => c.path.endsWith('/search/activities')).map(c => c.query);
  assert.ok(q.some(x => x.activityType === 'running' && x.startDate === '2026-10-01' && x.limit === '99'));
  assert.ok(q.some(x => x.activityType === 'walking'));
  const z = await garmin.heartRateZones('gtoken');
  assert.deepEqual(z, { maxHr: 185, restingHr: 52, floors: [118, 132, 145, 158, 172], method: 'HR_RESERVE' });
  assert.equal(trimGarmin({}), null);
});

/* ---------- the sync ---------- */
test('a Strava sync fills the pending list with runs and walks, their laps, and moves the cursor; a Garmin sync too', async () => {
  const strava = createStrava({ clientId: 'cid', clientSecret: 'csec', base });
  const garmin = createGarmin({ base });
  const tokens = await strava.exchange('c0de');
  store.save(uid, store.withProvider(store.load(uid), 'strava', { connectedAt: 1, athleteId: 777 }, tokens));
  const t0 = Date.UTC(2026, 10, 11, 12);
  let r = await syncStrava(uid, { strava, now: () => t0 });
  assert.deepEqual({ fetched: r.fetched, complete: r.complete }, { fetched: 2, complete: true });
  let rec = store.load(uid);
  assert.equal(rec.pending.length, 2);
  assert.ok(rec.pending.every(a => a.src === 'strava' && a.laps?.length === 2 && a.data.map === undefined));
  assert.equal(rec.strava.lastSync, t0);
  assert.equal(rec.strava.error, null);
  // The next sync asks from two days before the last one.
  mock.calls.length = 0;
  r = await syncStrava(uid, { strava, now: () => t0 + 3600000 });
  const after = Number(mock.calls.find(c => c.path === '/api/v3/athlete/activities').query.after) * 1000;
  assert.equal(after, t0 - 2 * 86400000);
  assert.equal(store.load(uid).pending.length, 2, 'the same activities update their entry rather than doubling');
  // A 401 mid-sync is recorded as an error, not thrown.
  mock.fail401Once = true;
  r = await syncStrava(uid, { strava, now: () => t0 + 7200000 });
  assert.equal(r.error, 'unauthorized');
  assert.equal(store.load(uid).strava.error, 'unauthorized');
  assert.ok(store.secretOf(store.load(uid), 'strava'), 'the tokens are kept for a retry');
  // A rate limit sets retryAt and the next run skips.
  mock.status429 = true;
  r = await syncStrava(uid, { strava, now: () => t0 + 7200000 });
  assert.equal(r.error, 'rate-limit');
  mock.status429 = false;
  r = await syncStrava(uid, { strava, now: () => t0 + 7200000 });
  assert.equal(r.skipped, 'rate-limited');
  r = await syncStrava(uid, { strava, now: () => t0 + 7200000 + 900000 });
  assert.equal(r.fetched, 2);
  // Garmin alongside, with its zones.
  store.save(uid, store.withProvider(store.load(uid), 'garmin', { connectedAt: 1 }, { apiKey: 'good-key' }));
  r = await syncGarmin(uid, { garmin, now: () => t0 });
  assert.equal(r.fetched, 3);
  rec = store.load(uid);
  assert.equal(rec.pending.filter(a => a.src === 'garmin').length, 3);
  assert.equal(rec.garmin.zones.maxHr, 185);
  assert.equal(store.secretOf(rec, 'garmin').token.accessToken, 'gtoken');
  assert.deepEqual(store.publicStatus(rec, t0).pending, 5);
  // The key no longer works: the error says so and the key stays so the person sees why.
  mock.garminKeyOk = 'other';
  r = await syncGarmin(uid, { garmin, now: () => t0 + 30 * 3600000 });
  assert.equal(r.error, 'unauthorized');
  mock.garminKeyOk = 'good-key';
  // Not connected → nothing happens.
  assert.equal((await syncStrava('nobody', { strava })).skipped, 'not connected');
  store.remove(uid);
});

/* ---------- the routes on a booted server ---------- */
test('the routes: connect state, callback, status, sync, pending, ack, disconnect, webhook', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-integ-srv-'));
  fs.writeFileSync(path.join(dir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: uid, name: 'Runner', created: new Date().toISOString() }], creds: [], subs: [], invites: [] }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', STRAVA_CLIENT_ID: 'cid', STRAVA_CLIENT_SECRET: 'csec', STRAVA_API_BASE: base, GARMIN_PERSONAL_API_BASE: base, STRAVA_WEBHOOK_VERIFY_TOKEN: 'verify-me', INTEGRATIONS_POLL_MIN: '0' },
  });
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dir, { recursive: true, force: true }); });
  let log = '';
  child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  const srv = `http://127.0.0.1:${await boundPort(child, () => log)}`;
  const h = { cookie: cookie(), origin: 'http://localhost:8080', 'content-type': 'application/json' };
  const get = (p, hh = h) => fetch(srv + p, { headers: hh, redirect: 'manual' });
  const post = (p, body = {}, hh = h) => fetch(srv + p, { method: 'POST', headers: hh, body: JSON.stringify(body) });
  const until = async (pred, tries = 50) => { for (let i = 0; i < tries; i++) { const v = await pred(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } throw new Error('timed out'); };

  // Signed out: 401 everywhere that is personal.
  assert.equal((await fetch(srv + '/api/integrations')).status, 401);
  let st = await (await get('/api/integrations')).json();
  assert.deepEqual(st.strava, { configured: true, connected: false });
  assert.deepEqual(st.garmin, { configured: true, connected: false });
  assert.equal(st.pending, 0);

  // Connect: the state must come back from the account that asked for it.
  const { url } = await (await post('/api/integrations/strava/connect')).json();
  const state = new URL(url).searchParams.get('state');
  assert.equal(new URL(url).searchParams.get('redirect_uri'), 'http://localhost:8080/api/integrations/strava/callback');
  let cb = await get(`/api/integrations/strava/callback?code=c0de&scope=read,activity:read_all&state=forged`);
  assert.equal(cb.status, 302);
  assert.match(cb.headers.get('location'), /strava=state$/);
  cb = await get(`/api/integrations/strava/callback?code=c0de&scope=read&state=${state}`);
  assert.match(cb.headers.get('location'), /strava=scope$/, 'a grant without activity reading is refused');
  // The state was burned: ask again.
  const again = new URL((await (await post('/api/integrations/strava/connect')).json()).url).searchParams.get('state');
  cb = await get(`/api/integrations/strava/callback?code=c0de&scope=read,activity:read_all&state=${again}`);
  assert.equal(cb.headers.get('location'), 'http://localhost:8080/#/settings/integrations?strava=connected');
  st = await until(async () => { const s = await (await get('/api/integrations')).json(); return s.pending ? s : null; });
  assert.equal(st.strava.connected, true);
  assert.equal(st.strava.athleteId, 777);
  assert.equal(st.strava.enc, undefined);
  assert.equal(st.pending, 2);

  // The pending list, trimmed, then acknowledged.
  let pend = await (await get('/api/integrations/activities')).json();
  assert.equal(pend.activities.length, 2);
  assert.ok(pend.activities.every(a => a.data.start_latlng === undefined && a.data.map === undefined));
  const ack = await (await post('/api/integrations/activities/ack', { keys: pend.activities.map(a => `${a.src}:${a.id}`) })).json();
  assert.deepEqual(ack, { ok: true, pending: 0 });

  // Sync on demand with history.
  const sy = await (await post('/api/integrations/strava/sync', { days: 365 })).json();
  assert.equal(sy.ok, true);
  assert.equal(sy.pending, 2);

  // Garmin: a bad key is refused, a good one connects and pulls.
  assert.equal((await post('/api/integrations/garmin/connect', { key: 'wrong' })).status, 401);
  assert.equal((await post('/api/integrations/garmin/connect', {})).status, 400);
  assert.equal((await post('/api/integrations/garmin/connect', { key: 'good-key', keyExpires: '2027-05-01' })).status, 200);
  st = await until(async () => { const s = await (await get('/api/integrations')).json(); return s.garmin.lastSync ? s : null; });
  assert.equal(st.garmin.keyExpires, '2027-05-01');
  assert.equal(st.pending, 5);
  pend = await (await get('/api/integrations/activities')).json();
  assert.equal(pend.garminZones.maxHr, 185);
  assert.ok(pend.activities.filter(a => a.src === 'garmin').every(a => a.data.startLatitude === undefined));

  // Webhook: validation, then an activity event pulls, then a deauthorisation disconnects.
  assert.equal((await fetch(srv + '/api/integrations/strava/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc')).status, 403);
  const chal = await (await fetch(srv + '/api/integrations/strava/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc')).json();
  assert.deepEqual(chal, { 'hub.challenge': 'abc' });
  await (await post('/api/integrations/activities/ack', { keys: pend.activities.map(a => `${a.src}:${a.id}`) })).json();
  const ev = await fetch(srv + '/api/integrations/strava/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ object_type: 'activity', object_id: 101, aspect_type: 'create', owner_id: 777, subscription_id: 1, event_time: 1 }) });
  assert.equal(ev.status, 200);
  st = await until(async () => { const s = await (await get('/api/integrations')).json(); return s.pending ? s : null; });
  assert.equal(st.pending, 2);
  await fetch(srv + '/api/integrations/strava/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ object_type: 'athlete', object_id: 777, aspect_type: 'update', owner_id: 777, updates: { authorized: 'false' } }) });
  st = await until(async () => { const s = await (await get('/api/integrations')).json(); return !s.strava.connected ? s : null; });
  assert.equal(st.strava.connected, false);
  assert.equal(st.pending, 0, 'the Strava activities waiting were forgotten with the connection');

  // Disconnect Garmin: the file goes.
  const dis = await (await post('/api/integrations/garmin/disconnect', { deleteRuns: true })).json();
  assert.deepEqual(dis, { ok: true, deleteRuns: true });
  st = await (await get('/api/integrations')).json();
  assert.equal(st.garmin.connected, false);
  assert.equal(fs.existsSync(path.join(dir, `integrations-${uid}.json`)), false);
  // The data directory never held a readable token.
  assert.ok(!log.includes('acc-A'));
});
