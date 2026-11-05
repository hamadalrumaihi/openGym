/* Per-user integration records: the Strava tokens and the Garmin Personal API key a person
 * connected, where the sync left off, and activities fetched for them that the app has not
 * picked up yet.
 *
 * One file per user, DATA/integrations-<uid>.json, mode 0600, written atomically. Token material
 * is encrypted at rest the way the Coach's provider credentials are (api/coach/config.js): AES-256-GCM
 * under a key derived from DATA/secret, so a copied data directory without the secret holds
 * nothing usable. The file is deleted whole when the last provider is disconnected.
 *
 * Nothing here ever reaches state-<uid>.json: tokens must not sync to the browser, ride in a
 * backup or travel in an export. The app pulls the pending activities over the API and writes the
 * runs into its own state (frontend lib/run-import.js), so the state file keeps one writer.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite } from '../durable.js';

const DATA = process.env.DATA_DIR || '/data';
export const PROVIDERS = ['strava', 'garmin'];
export const PENDING_MAX = 300;          // activities waiting for the app, per user
export const PENDING_DAYS = 7;           // a fetched activity the app never collected is dropped after this

const fileFor = uid => path.join(DATA, 'integrations-' + String(uid).replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');

let keyCache = null;
function key() {
  if (keyCache) return keyCache;
  const secret = fs.readFileSync(path.join(DATA, 'secret'), 'utf8').trim();
  keyCache = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), Buffer.from('opengym-integrations-v1'), 32));
  return keyCache;
}
export function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function decrypt(blob) {
  try {
    const buf = Buffer.from(String(blob || ''), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}
/** Forget the derived key (tests swap the data directory). */
export const resetKey = () => { keyCache = null; };

const EMPTY = () => ({ strava: null, garmin: null, pending: [] });

/** The record for `uid`, with secrets still encrypted; a fresh empty one when there is none. */
export function load(uid) {
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(uid), 'utf8'));
    if (!raw || typeof raw !== 'object') return EMPTY();
    return { ...EMPTY(), ...raw, pending: Array.isArray(raw.pending) ? raw.pending : [] };
  } catch { return EMPTY(); }
}

export function save(uid, rec) {
  if (!rec.strava && !rec.garmin && !rec.pending?.length) { remove(uid); return; }
  atomicWrite(fileFor(uid), JSON.stringify(rec), 0o600);
}

export function remove(uid) {
  try { fs.unlinkSync(fileFor(uid)); } catch { /* already gone */ }
}

export const exists = uid => fs.existsSync(fileFor(uid));

/** The secret part of a provider's record (tokens or the API key), decrypted, or null. */
export const secretOf = (rec, provider) => (rec?.[provider]?.enc ? decrypt(rec[provider].enc) : null);

/** `rec` with `provider` set to `{ ...meta, enc: encrypt(secret) }`; `secret` null clears the provider. */
export function withProvider(rec, provider, meta, secret) {
  const next = { ...rec };
  next[provider] = meta ? { ...meta, enc: secret ? encrypt(secret) : undefined } : null;
  return next;
}

/** What the app may see: never the encrypted blob, never the secret. */
export function publicStatus(rec, now = Date.now()) {
  const one = p => {
    const r = rec?.[p];
    if (!r) return { connected: false };
    const { enc, ...rest } = r;
    return { connected: true, ...rest };
  };
  return {
    strava: one('strava'),
    garmin: one('garmin'),
    pending: (rec?.pending || []).filter(a => now - (a.fetchedAt || 0) <= PENDING_DAYS * 86400000).length,
  };
}

/**
 * `rec` with `items` ([{ src, id, fetchedAt, data, laps? }]) added to the pending list: one entry
 * per `src:id`, newest fetch wins, old entries dropped by age and the list capped.
 */
export function withPending(rec, items, now = Date.now()) {
  const byKey = new Map((rec.pending || []).map(a => [`${a.src}:${a.id}`, a]));
  for (const it of items || []) if (it && it.src && it.id != null) byKey.set(`${it.src}:${it.id}`, { ...it, fetchedAt: it.fetchedAt || now });
  const pending = [...byKey.values()].filter(a => now - (a.fetchedAt || 0) <= PENDING_DAYS * 86400000).sort((a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0)).slice(0, PENDING_MAX);
  return { ...rec, pending };
}

/** `rec` without the pending entries whose `src:id` is in `keys`. */
export function withoutPending(rec, keys) {
  const drop = new Set(keys || []);
  return { ...rec, pending: (rec.pending || []).filter(a => !drop.has(`${a.src}:${a.id}`)) };
}

/** `rec` without every pending entry from `src` (a disconnect forgets what was fetched). */
export const withoutSource = (rec, src) => ({ ...rec, pending: (rec.pending || []).filter(a => a.src !== src) });

/** Every uid with an integrations file, for the poller. */
export function connectedUids() {
  try {
    return fs.readdirSync(DATA).map(f => /^integrations-(.+)\.json$/.exec(f)?.[1]).filter(Boolean);
  } catch { return []; }
}
