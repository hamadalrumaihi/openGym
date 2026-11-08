// Cloudflare Pages Function: proxies /api/* to the openGym API (Railway), so the browser only ever
// talks to the pages.dev origin. One origin is what the passkey RP ID and the first-party
// session cookie need (docs/SELF_HOSTING.md). The same job frontend/vercel.json did on Vercel.
//
// The API's origin comes from the Pages project's API_ORIGIN variable; without one, this fork's
// Railway origin, the same fallback vercel.json carried. Headers pass through both ways, so the
// API still sees Origin (its cross-site check) and the cookie, and the browser receives
// Set-Cookie unchanged. Only /api/* reaches this Function (public/_routes.json).
const FALLBACK_API = 'https://api-production-1ff2.up.railway.app'

export async function onRequest({ request, env }) {
  const api = String(env.API_ORIGIN || FALLBACK_API).replace(/\/+$/, '')
  const url = new URL(request.url)
  const target = api + url.pathname + url.search
  const headers = new Headers(request.headers)
  // Hop-by-hop and host headers are the upstream's business.
  for (const h of ['host', 'connection', 'keep-alive', 'transfer-encoding', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry']) headers.delete(h)
  const init = { method: request.method, headers, redirect: 'manual' }
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body
  const upstream = await fetch(target, init)
  const out = new Headers(upstream.headers)
  out.set('Cache-Control', out.get('Cache-Control') || 'no-store')
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}
