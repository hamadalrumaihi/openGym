#!/usr/bin/env node
// Turns a built frontend/dist (exercise media already staged into it) into Vercel's Build Output
// API layout, .vercel/output, so one Vercel project can serve openGym as a static app while the
// API runs on its own host (docs/deploy/VERCEL_RAILWAY.md).
//
//   API_ORIGIN=https://api.example.com node scripts/vercel/output.mjs [frontend/dist]
//
// The output goes next to the build, frontend/.vercel/output: the Vercel project's Root Directory
// is frontend/ (frontend/vercel.json), which is also what keeps Vercel from reading the
// repository's api/ folder as serverless functions. The frontend still imports the Coach core
// from ../api, so "include files outside the Root Directory" stays on.
//
// Why the Build Output API and not a vercel.json rewrite: the API's address is per deployment
// (a Railway domain), and a vercel.json is read before the build, so it could only carry that
// address hard-coded in the repository. Here it comes from the API_ORIGIN environment variable
// of the Vercel project, and the repository names no host at all.
//
// /api/* is proxied to API_ORIGIN by Vercel, so the browser only ever talks to one origin: the
// session cookie stays first-party and host-only, and the passkey RP ID is the public hostname.
// A production build without API_ORIGIN fails rather than shipping an app whose every sign-in
// would fail; a preview without it serves the app with /api answering 503, which the app treats
// as "server unreachable" and keeps working on this device only.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dist = path.resolve(process.argv[2] || path.join(ROOT, 'frontend/dist'))
const out = path.join(path.dirname(dist), '.vercel/output')

const fail = msg => { console.error('vercel output: ' + msg); process.exit(1) }

if (!fs.existsSync(path.join(dist, 'index.html'))) fail(`no index.html in ${dist}: build the frontend first`)
if (!fs.existsSync(path.join(dist, 'exercise-media/still'))) fail('exercise media is not staged: run scripts/catalogue/stage-media.mjs first')

// An https origin, optionally with a path prefix; never a trailing slash, query or fragment.
function apiOrigin(raw) {
  const v = String(raw || '').trim().replace(/\/+$/, '')
  if (!v) return ''
  let u
  try { u = new URL(v) } catch { fail('API_ORIGIN is not a URL') }
  if (u.protocol !== 'https:') fail('API_ORIGIN must be https://')
  if (u.search || u.hash || u.username || u.password) fail('API_ORIGIN must be a bare origin (an optional path prefix is allowed)')
  return v
}
const API = apiOrigin(process.env.API_ORIGIN)
const ENV = process.env.VERCEL_ENV || 'local'
if (!API && ENV === 'production') fail('API_ORIGIN is not set for a production build (the openGym API on Railway)')

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(path.join(out, 'static'), { recursive: true })
fs.cpSync(dist, path.join(out, 'static'), { recursive: true })
fs.writeFileSync(path.join(out, 'static', '_api-unavailable.json'),
  JSON.stringify({ error: 'the openGym API is not configured for this deployment', code: 'no_api' }) + '\n')

// The same headers the bundled nginx sends (web/nginx.conf.template). HSTS is Vercel's own.
const base = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "frame-ancestors 'none'",
}
const REVALIDATE = 'no-cache'
const IMMUTABLE = 'public, max-age=31536000, immutable'

const routes = [
  // The app shell and the worker are always revalidated, so a deploy shows up on the next load and
  // an old worker is replaced by the new one. The root page also expires the cookie the CID portal
  // that used to live on this hostname set, so nothing of it outlives the replacement.
  { src: '^/(?:index\\.html)?$', headers: { ...base, 'Cache-Control': REVALIDATE, 'Set-Cookie': 'cid-portal-mode=; Path=/; Max-Age=0; Secure; SameSite=Lax' }, continue: true },
  { src: '^/(?:sw\\.js|manifest\\.json)$', headers: { ...base, 'Cache-Control': REVALIDATE }, continue: true },
  // Hashed bundles never change under a name.
  { src: '^/assets/(.*)$', headers: { ...base, 'Cache-Control': IMMUTABLE }, continue: true },
  // Licensed exercise media (catalogue/media/NOTICE.md): same-origin only, as nginx serves it.
  { src: '^/exercise-media/(.*)$', headers: { ...base, 'Cache-Control': 'public, max-age=2592000, immutable', 'Cross-Origin-Resource-Policy': 'same-origin' }, continue: true },
  // Everything else that is a file gets the base headers.
  { src: '^/(.*)$', headers: base, continue: true },
  // The API: proxied, never cached by Vercel's edge (the API sets its own no-store).
  API
    ? { src: '^/api/(.*)$', dest: API + '/api/$1' }
    : { src: '^/api/(.*)$', dest: '/_api-unavailable.json', status: 503, headers: { 'Cache-Control': 'no-store' } },
  // The CID portal's web-app manifest lived here; a browser that kept it gets openGym's.
  { src: '^/manifest\\.webmanifest$', dest: '/manifest.json', headers: { ...base, 'Cache-Control': REVALIDATE } },
  { handle: 'filesystem' },
  // The app routes by hash (#/plan), so any other path is not openGym's: an old bookmark or a
  // CID route goes to the app's front page, as the nginx config does with its 302.
  { src: '^/(.*)$', status: 302, headers: { Location: '/' } },
]

fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2) + '\n')
let files = 0
const count = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? count(path.join(d, e.name)) : files++ }
count(path.join(out, 'static'))
console.log(`vercel output: ${files} files, /api -> ${API ? new URL(API).host : '503 (no API_ORIGIN)'} [${ENV}]`)
