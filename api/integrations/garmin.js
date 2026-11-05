/* The Garmin Connect Personal API client. Garmin opened this on 2026-10-21 for individuals to read
 * their own data (https://developer.garmin.com/gc-developer-program/personal/personal-api/): a
 * person creates a Personal API key in Garmin Connect (Settings → Personal API key, shown once,
 * 30 days to a year), the key buys 24-hour access tokens, and everything is pull-only and
 * read-only. There is no refresh token and nothing can be written: workouts cannot be pushed this
 * way (that is the business-tier Training API).
 *
 * Endpoints, from Garmin's own OpenAPI document (servers: https://personal.connectapi.garmin.com):
 *   POST /personalapitoken-service/personal-api/personal-api-key/token   Authorization: ApiKey <key>
 *   GET  /activitylist-service/activities/search/activities?start&limit&startDate&endDate&activityType
 *        → SummarizedActivityDTO[]: activityId, activityName, startTimeLocal, startTimeGMT,
 *          beginTimestamp, activityType{typeKey}, distance, duration, movingDuration,
 *          elevationGain, averageSpeed, averageHR, maxHR, averageRunningCadenceInStepsPerMinute,
 *          hrTimeInZone_1..5, aerobicTrainingEffect, anaerobicTrainingEffect, activityTrainingLoad,
 *          vO2MaxValue, avgVerticalOscillation, avgGroundContactTime, avgStrideLength,
 *          avgVerticalRatio, lapCount, hasPolyline, startLatitude/startLongitude (dropped here)
 *   GET  /biometric-service/heartRateZones/v2 → HeartRateZonesDTO[] (maxHeartRateUsed, zone floors)
 *   GET  /download-service/files/activity/{activityId} → the original .FIT, zipped (not used here)
 *
 * `fetch` is injected so the tests run against a local mock. Coordinates never leave this module.
 */

export const DEFAULT_BASE = 'https://personal.connectapi.garmin.com';
export const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';
export const SEARCH_PATH = '/activitylist-service/activities/search/activities';
export const HR_ZONES_PATH = '/biometric-service/heartRateZones/v2';
export const PAGE = 99;                 // the endpoint's default and documented maximum
export const TOKEN_TTL_MS = 24 * 3600000;

export class GarminError extends Error {
  constructor(code, message, status = 0) { super(message || code); this.code = code; this.status = status; }
}

const KEEP = new Set([
  'activityId', 'activityName', 'description', 'startTimeLocal', 'startTimeGMT', 'beginTimestamp', 'distance', 'duration', 'elapsedDuration',
  'movingDuration', 'elevationGain', 'elevationLoss', 'averageSpeed', 'maxSpeed', 'averageHR', 'maxHR', 'averageRunningCadenceInStepsPerMinute',
  'maxRunningCadenceInStepsPerMinute', 'steps', 'calories', 'aerobicTrainingEffect', 'anaerobicTrainingEffect', 'trainingEffectLabel',
  'activityTrainingLoad', 'vO2MaxValue', 'avgVerticalOscillation', 'avgGroundContactTime', 'avgStrideLength', 'avgVerticalRatio',
  'hrTimeInZone_1', 'hrTimeInZone_2', 'hrTimeInZone_3', 'hrTimeInZone_4', 'hrTimeInZone_5', 'lapCount', 'hasPolyline', 'manufacturer',
  'deviceId', 'isManualActivity', 'minTemperature', 'maxTemperature', 'fastestSplit_1000', 'fastestSplit_5000', 'fastestSplit_10000',
  'moderateIntensityMinutes', 'vigorousIntensityMinutes', 'avgGradeAdjustedSpeed',
]);

/** A summary with the documented fields kept and every coordinate gone. */
export function trimActivity(a) {
  if (!a || typeof a !== 'object' || a.activityId == null) return null;
  const out = {};
  for (const k of KEEP) if (a[k] != null) out[k] = a[k];
  if (a.activityType && typeof a.activityType === 'object') out.activityType = { typeKey: a.activityType.typeKey ?? null, typeId: a.activityType.typeId ?? null };
  if (a.eventType && typeof a.eventType === 'object') out.eventType = { typeKey: a.eventType.typeKey ?? null };
  return out;
}

export function createGarmin({ base = DEFAULT_BASE, fetch: f = globalThis.fetch, now = Date.now } = {}) {
  const api = base.replace(/\/$/, '');
  const timeout = () => AbortSignal.timeout(20000);

  const call = async (url, init = {}) => {
    let res;
    try { res = await f(url, { ...init, signal: timeout() }); }
    catch (e) { throw new GarminError('network', e?.message || 'network error'); }
    if (res.status === 401 || res.status === 403) throw new GarminError('unauthorized', 'Garmin refused the key or token', res.status);
    if (res.status === 429) throw new GarminError('rate-limit', 'Garmin rate limit reached', 429);
    if (!res.ok) throw new GarminError('http', `Garmin answered ${res.status}`, res.status);
    const text = await res.text();
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  };

  return {
    /**
     * A 24-hour access token for a Personal API key. The documented call is the curl on Garmin's
     * page; the token's JSON shape is not documented, so the usual spellings are accepted and a
     * bare string is taken as the token itself.
     */
    async token(apiKey) {
      if (!apiKey || typeof apiKey !== 'string') throw new GarminError('no-key', 'No Personal API key');
      const body = await call(`${api}${TOKEN_PATH}`, { method: 'POST', headers: { authorization: `ApiKey ${apiKey.trim()}` } });
      const tok = typeof body === 'string' ? body.trim() : body?.access_token || body?.accessToken || body?.token || null;
      if (!tok) throw new GarminError('bad-response', 'Garmin sent no token');
      const ttl = Number(body?.expires_in ?? body?.expiresIn);
      return { accessToken: tok, expiresAt: Number.isFinite(ttl) && ttl > 0 ? now() + ttl * 1000 : now() + TOKEN_TTL_MS };
    },
    /** A token still good for at least a minute, else a new one. */
    async fresh(apiKey, cached) {
      if (cached?.accessToken && cached.expiresAt - 60000 > now()) return { token: cached, refreshed: false };
      return { token: await this.token(apiKey), refreshed: true };
    },
    /**
     * Running and walking activities whose local start date is between `startDate` and
     * `endDate` (YYYY-MM-DD, inclusive), trimmed, newest first. Pages until a short page.
     */
    async activities(accessToken, { startDate, endDate, maxPages = 5 } = {}) {
      const out = [];
      for (const type of ['running', 'walking']) {
        for (let page = 0; page < maxPages; page++) {
          const q = new URLSearchParams({ start: String(page * PAGE), limit: String(PAGE), activityType: type, sortOrder: 'desc' });
          if (startDate) q.set('startDate', startDate);
          if (endDate) q.set('endDate', endDate);
          const body = await call(`${api}${SEARCH_PATH}?${q}`, { headers: { authorization: `Bearer ${accessToken}` } });
          const list = Array.isArray(body) ? body : [];
          out.push(...list.map(trimActivity).filter(Boolean));
          if (list.length < PAGE) break;
        }
      }
      return out;
    },
    /** The person's heart-rate zones as Garmin Connect holds them (max HR used, zone floors), or null. */
    async heartRateZones(accessToken) {
      const body = await call(`${api}${HR_ZONES_PATH}?generateDefaults=true`, { headers: { authorization: `Bearer ${accessToken}` } });
      const list = Array.isArray(body) ? body : body ? [body] : [];
      const run = list.find(z => /run/i.test(z?.sport || '')) || list[0];
      if (!run) return null;
      const floors = [run.zone1Floor, run.zone2Floor, run.zone3Floor, run.zone4Floor, run.zone5Floor].map(Number);
      return { maxHr: Number(run.maxHeartRateUsed) || null, restingHr: Number(run.restingHeartRateUsed) || null, floors: floors.every(Number.isFinite) ? floors : null, method: run.trainingMethod || null };
    },
  };
}
