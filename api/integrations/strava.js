/* The Strava API v3 client (https://developers.strava.com/docs/): OAuth code exchange and refresh,
 * the athlete's activities since a time, one activity's laps, deauthorisation. Written against
 * the published reference, with `fetch` injected so the tests run it against a local mock.
 *
 * Rules it keeps (Strava API Agreement and API Policy, see docs/RUNNING_STRAVA.md):
 *   - the data is shown to the athlete it belongs to and nobody else;
 *   - nothing is ever written to Strava: no uploads, no edits, read-only scopes only;
 *   - rate limits are read from the response headers (X-RateLimit-Limit / X-RateLimit-Usage,
 *     "15-minute,daily") and a sync stops short of them rather than running into a 429;
 *   - a 401 is answered with one token refresh and one retry, then given up;
 *   - on disconnect the token is revoked at Strava and everything stored is deleted.
 *
 * Coordinates, maps and segment efforts are stripped before anything leaves this module: the app
 * keeps no GPS. The fields kept are the ones frontend lib/run-import.js reads.
 */

export const DEFAULT_BASE = 'https://www.strava.com';
export const SCOPES = 'read,activity:read_all';
export const PER_PAGE = 100;              // the reference allows up to 200; 100 keeps a response small
export const LAPS_PER_SYNC = 20;          // extra calls a sync may spend on laps
export const RATE_HEADROOM = 0.85;        // stop at 85 % of the 15-minute budget

export class StravaError extends Error {
  constructor(code, message, status = 0, retryAt = null) { super(message || code); this.code = code; this.status = status; this.retryAt = retryAt; }
}

const KEEP = new Set([
  'id', 'name', 'type', 'sport_type', 'start_date', 'start_date_local', 'timezone', 'utc_offset', 'distance', 'moving_time', 'elapsed_time',
  'total_elevation_gain', 'average_speed', 'max_speed', 'average_heartrate', 'max_heartrate', 'has_heartrate', 'average_cadence',
  'device_name', 'external_id', 'upload_id', 'manual', 'trainer', 'workout_type', 'suffer_score', 'elev_high', 'elev_low', 'average_temp',
]);
const LAP_KEEP = new Set(['id', 'lap_index', 'name', 'moving_time', 'elapsed_time', 'distance', 'average_heartrate', 'max_heartrate', 'average_cadence', 'average_speed', 'total_elevation_gain']);

/** An activity with only the documented summary fields kept, plus a flag for whether it had GPS. */
export function trimActivity(a) {
  if (!a || typeof a !== 'object') return null;
  const out = {};
  for (const k of KEEP) if (a[k] != null) out[k] = a[k];
  out.gps = !!(a.map?.summary_polyline || (Array.isArray(a.start_latlng) && a.start_latlng.length));
  return out;
}
export const trimLap = l => {
  const out = {};
  for (const k of LAP_KEEP) if (l?.[k] != null) out[k] = l[k];
  return out;
};

/** The usage this response leaves: `{ short, daily, shortLimit, dailyLimit, nearLimit }` or null. */
export function rateInfo(headers) {
  const get = n => headers?.get?.(n) ?? headers?.[n] ?? null;
  const limit = String(get('x-ratelimit-limit') || '').split(',').map(Number);
  const usage = String(get('x-ratelimit-usage') || '').split(',').map(Number);
  if (limit.length < 2 || usage.length < 2 || !limit.every(Number.isFinite) || !usage.every(Number.isFinite)) return null;
  return { short: usage[0], daily: usage[1], shortLimit: limit[0], dailyLimit: limit[1], nearLimit: usage[0] >= limit[0] * RATE_HEADROOM || usage[1] >= limit[1] * RATE_HEADROOM };
}

/** When a 429 clears: the next quarter hour. */
export const nextWindow = (now = Date.now()) => Math.floor(now / 900000) * 900000 + 900000;

export function createStrava({ clientId, clientSecret, base = DEFAULT_BASE, fetch: f = globalThis.fetch, now = Date.now } = {}) {
  if (!clientId || !clientSecret) throw new StravaError('unconfigured', 'STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are not set');
  const api = base.replace(/\/$/, '');
  const timeout = () => AbortSignal.timeout(20000);

  const call = async (url, init = {}) => {
    let res;
    try { res = await f(url, { ...init, signal: timeout() }); }
    catch (e) { throw new StravaError('network', e?.message || 'network error'); }
    const rate = rateInfo(res.headers);
    if (res.status === 429) throw new StravaError('rate-limit', 'Strava rate limit reached', 429, nextWindow(now()));
    if (res.status === 401) throw new StravaError('unauthorized', 'Strava refused the token', 401);
    if (!res.ok) throw new StravaError('http', `Strava answered ${res.status}`, res.status);
    let body = null;
    try { body = await res.json(); } catch { throw new StravaError('bad-response', 'Strava sent something that is not JSON'); }
    return { body, rate };
  };

  const tokenCall = async params => {
    const form = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params });
    const { body } = await call(`${api}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    if (!body?.access_token || !body?.refresh_token) throw new StravaError('bad-response', 'Strava sent no token');
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Number(body.expires_at) * 1000 || now() + 6 * 3600000, athleteId: body.athlete?.id ?? null, scope: body.scope || null };
  };

  return {
    /** Where to send the browser; `state` is this server's one-time value, `redirectUri` built from ORIGIN. */
    authUrl(state, redirectUri) {
      const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, approval_prompt: 'auto', scope: SCOPES, state });
      return `${api}/oauth/authorize?${q}`;
    },
    /** The code from the callback → tokens. The scope granted must include activity reading. */
    exchange: code => tokenCall({ code, grant_type: 'authorization_code' }),
    /** A refresh token → new tokens (the old refresh token is dead afterwards). */
    refresh: refreshToken => tokenCall({ refresh_token: refreshToken, grant_type: 'refresh_token' }),
    /** Tokens good to use: refreshed when within a minute of expiry. Returns `{ tokens, refreshed }`. */
    async fresh(tokens) {
      if (tokens.expiresAt - 60000 > now()) return { tokens, refreshed: false };
      return { tokens: await this.refresh(tokens.refreshToken), refreshed: true };
    },
    /**
     * Activities after `afterSec` (epoch seconds), newest first per page, as trimmed summaries;
     * stops early near the rate limit. Returns `{ activities, rate, complete }`.
     */
    async activitiesSince(accessToken, afterSec, { maxPages = 5 } = {}) {
      const out = [];
      let rate = null, complete = true;
      for (let page = 1; page <= maxPages; page++) {
        const q = new URLSearchParams({ after: String(Math.max(0, Math.floor(afterSec))), page: String(page), per_page: String(PER_PAGE) });
        const r = await call(`${api}/api/v3/athlete/activities?${q}`, { headers: { authorization: `Bearer ${accessToken}` } });
        rate = r.rate;
        const list = Array.isArray(r.body) ? r.body : [];
        out.push(...list.map(trimActivity).filter(Boolean));
        if (list.length < PER_PAGE) break;
        if (rate?.nearLimit) { complete = false; break; }
        if (page === maxPages) complete = false;
      }
      return { activities: out, rate, complete };
    },
    /** The laps of one activity, trimmed. */
    async laps(accessToken, id) {
      const r = await call(`${api}/api/v3/activities/${encodeURIComponent(id)}/laps`, { headers: { authorization: `Bearer ${accessToken}` } });
      return { laps: (Array.isArray(r.body) ? r.body : []).map(trimLap), rate: r.rate };
    },
    /** Revoke this app's access at Strava. Best effort: a failure here never blocks the local delete. */
    async deauthorize(accessToken) {
      try { await f(`${api}/oauth/deauthorize`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, signal: timeout() }); return true; }
      catch { return false; }
    },
  };
}
