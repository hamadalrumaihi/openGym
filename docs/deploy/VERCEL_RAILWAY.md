# Vercel + Railway: openGym on cidportal-ody.vercel.app

This is the split hosting this fork runs on. The app is static files on the existing Vercel
project `cid`; the API runs as its own Railway service with a persistent volume; Vercel proxies
`/api/*` to Railway, so the browser only ever sees one origin. One origin is what passkeys and
the first-party session cookie need (docs/SELF_HOSTING.md).

```
browser ──https──> cidportal-ody.vercel.app ──(static)──> app shell, exercise media
                              │
                              └── /api/* ──proxy──> Railway service (api/Dockerfile) ── /data volume
```

Both halves build from this repository: Vercel from the root (`vercel.json`), Railway from
`api/` (`api/railway.json`).

## Railway: the API

Create it in its own Railway project (not in Blue Belt Media's).

1. New project → Deploy from GitHub repo → `hamadalrumaihi/openGym`, branch `main`.
2. Service settings:
   - Root Directory: `/api`
   - Config-as-code path: `/api/railway.json` (Dockerfile builder, health check
     `/api/health`, one replica, restart on failure)
3. Add a volume to the service, mount path `/data`. Every user, passkey, session secret and
   workout lives there. Without it a redeploy starts from an empty server.
4. Variables:

   | Name | Value |
   | --- | --- |
   | `RP_ID` | `cidportal-ody.vercel.app` |
   | `ORIGIN` | `https://cidportal-ody.vercel.app` |
   | `DATA_DIR` | `/data` |

   Railway sets `PORT` itself and the server reads it. Leave `TRUST_PROXY` unset (see "Client
   addresses" below). Optional ones (`INVITE_ONLY`, `ADMIN_UIDS`, `SESSION_DAYS`,
   `ALLOW_GUEST`, `VAPID_SUBJECT`) behave as in docs/SELF_HOSTING.md.
5. Networking → Generate domain. The `https://….up.railway.app` origin is what Vercel needs.

The Dockerfile's default target is built, which carries no AI runtime: the Coach stays off and
everything else works without it. The data files are plain JSON written atomically, so the
service must stay at one replica.

## Vercel: the app

Project `cid` (prj_jCH56lKXHShTJv9IArloAk3GRZdx), team hamadalrumaihis-projects.

1. Settings → Git: disconnect `hamadalrumaihi/cid`, connect `hamadalrumaihi/openGym`, production
   branch `main`.
2. Settings → Build and Deployment: Framework Preset "Other", Root Directory empty, no overrides
   (the commands come from `vercel.json`).
3. Settings → Environment Variables: `API_ORIGIN` = the Railway origin from step 5 above, for
   Production and Preview. Remove the CID portal's variables after recording them (below).
4. Redeploy `main`.

What the build does (`vercel.json`): installs and builds `frontend/`, copies the exercise media
into the build (`scripts/catalogue/stage-media.mjs`), then `scripts/vercel/output.mjs` writes
Vercel's Build Output API layout to `.vercel/output` with the routes:

- `/api/*` proxied to `API_ORIGIN`. A production build without `API_ORIGIN` fails on purpose. A
  preview without it serves the app with `/api` answering 503, so the app runs device-only.
- `/`, `index.html`, `sw.js`, `manifest.json`: `Cache-Control: no-cache`, so each deploy is
  picked up on the next load and the service worker updates.
- `/assets/*`: immutable. `/exercise-media/*`: 30 days, `Cross-Origin-Resource-Policy:
  same-origin`, as the bundled nginx serves it.
- Any other path redirects to `/`. The app routes by hash (`#/plan`), so an old CID bookmark
  such as `/cases/123` lands on openGym's front page.
- `/manifest.webmanifest` (the CID portal's manifest URL) serves openGym's manifest, and the
  front page expires the CID portal's `cid-portal-mode` cookie.

### Exercise media

The 180 px stills (WebP) and clips (MP4) are in the repository under `catalogue/media`, licensed
for openGym, which allows a website or self-hosted server to carry them
(`catalogue/media/NOTICE.md`). They ship inside the Vercel deployment as static files at
`/exercise-media/still/` and `/exercise-media/clip/`, the same paths the Docker web image uses,
so the app needs no media configuration. The Railway API never serves them. Photos and videos a
user attaches to their own exercises are a different thing: those go through `/api/media/` and
live on the Railway volume.

## Proxy, cookies and passkeys

- Passkeys: `RP_ID` must be the public hostname and `ORIGIN` the exact https origin the
  browser shows. A Railway or preview URL is a different origin, so passkey sign-in only works
  on `cidportal-ody.vercel.app`. A preview deployment can show the app, but cannot sign in.
- Session cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, host-only. Vercel's proxy passes
  `Set-Cookie` through unchanged, so the browser stores it for `cidportal-ody.vercel.app`.
- Cross-site protection: state-changing requests must carry `Origin:
  https://cidportal-ody.vercel.app` (or `Sec-Fetch-Site: same-origin`). Vercel forwards the
  browser's `Origin`, so the check holds behind the proxy.
- Client addresses: behind Vercel and Railway the API cannot tell users apart by IP. With
  `TRUST_PROXY` unset the sign-in throttle counts every request against Railway's proxy
  address, so failed password or code attempts throttle everyone together. Setting
  `TRUST_PROXY` would not fix that, and it would let a client choose its address through a
  forged `CF-Connecting-IP`. Keep it unset.

## Cutover check

```bash
H=https://cidportal-ody.vercel.app
curl -s $H/api/health            # {"ok":true,...} from Railway, through Vercel
curl -sI $H/ | grep -i cache     # cache-control: no-cache
curl -sI $H/cases/123            # 302 to /
```

Then, in a browser on the real hostname: create a profile with a passkey, sign out and back in,
log a workout, and check it is still there after a Railway redeploy.

## The CID portal this replaced

Recorded on 2026-10-12, before any change to the Vercel project.

- Source: `github.com/hamadalrumaihi/cid`, branch `main`, commit
  `433fdf110f4623704d321b48d996401d30cba0d9` ("Add a reversible portal mode", merged as PR #405),
  preserved on the branch `archive/cid-portal-final-production` in that repository. The working copy had no uncommitted
  changes. Nothing in that repository was changed or deleted.
- Last production deployment: `dpl_CgKNJgFgczoFEYPTLm8XfNtv1DUy`
  (cid-3u0y0gnx7-hamadalrumaihis-projects.vercel.app), a rollback candidate.
- It was already serving its "CID Portal Retired" page (HTTP 503, `PORTAL_MODE=retired`).
- Project settings: framework set in the repository's `vercel.json` (`nextjs`), Node 24.x, no
  password, SSO or IP protection. Domains: `cidportal-ody.vercel.app` plus the two generated
  project domains.
- Environment variable names, from the portal's `.env.example` and `docs/DEPLOYMENT.md` (values
  stay in the Vercel dashboard): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_FIVEMANAGE_API_KEY`, `NEXT_PUBLIC_FIVEMANAGE_BASE_URL`, `PORTAL_MODE`, and the
  optional `NEXT_PUBLIC_EVIDENCE_HOST`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENV`,
  `OTEL_EXPORTER_OTLP_ENDPOINT`, `NEXT_PUBLIC_PAGE_AGENT_*`, `NEXT_PUBLIC_ENABLE_*`. Export the
  actual values (Settings → Environment Variables, or `vercel env pull`) before deleting them.
- Its data lives in its Supabase project and Edge Functions, not on Vercel. Replacing the
  website does not touch it; do not delete it as part of this.

### Rolling back to the CID portal

1. Fastest, no rebuild: Vercel → project `cid` → Deployments → `dpl_CgKNJgFgczoFEYPTLm8XfNtv1DUy`
   → Instant Rollback (or "Promote to Production"). It brings back the exact build with the
   environment it was built with.
2. Full: reconnect Git to `hamadalrumaihi/cid`, set Framework Preset back to Next.js, restore
   the recorded environment variables, and redeploy `main` (or `archive/cid-portal-final-production`).
3. The openGym API on Railway keeps running independently. Pause it there if needed; its
   volume keeps the openGym data.
