# Cloudflare Pages + Railway: openGym on opengym.pages.dev

This fork's hosting since November 2026, after the Vercel project it used
([VERCEL_RAILWAY.md](VERCEL_RAILWAY.md)) went away: the app is static files on Cloudflare Pages
(free), the API stays on Railway with its volume, and a Pages Function proxies `/api/*` to
Railway so the browser sees one origin. One origin is what passkeys and the first-party session
cookie need (docs/SELF_HOSTING.md).

```
browser ──https──> opengym.pages.dev ──(static)──> app shell, exercise media
                          │
                          └── /api/* ──Pages Function──> Railway service (api/Dockerfile) ── /data volume
```

## What is in the repository

| File | Does |
|---|---|
| `frontend/functions/api/[[path]].js` | the proxy: forwards method, headers, body and cookies to `API_ORIGIN` (a Pages variable; this fork's Railway origin when unset) and passes the answer back unchanged |
| `frontend/public/_routes.json` | only `/api/*` runs the Function; everything else is served as a file |
| `frontend/public/_headers` | the security and cache headers the bundled nginx and the old Vercel config sent |
| `frontend/package.json` `build:pages` | `vite build` plus the exercise media staged into `dist/` (13,200 files, under Pages' 20,000) |
| `.github/workflows/cloudflare-pages.yml` | deploys `dist/` on every push to `main` that touches the app |

The app routes by hash (`#/plan`), and Pages serves `index.html` for a path that is not a file,
so an old bookmark lands on the front page as before.

## Setting it up once

1. **Cloudflare.** Create the Pages project (done for this fork: project `opengym`, production
   branch `main`, hostname `https://opengym.pages.dev`). An API token with the permission
   *Account › Cloudflare Pages › Edit* is what deploys need; keep it out of the repository.
2. **GitHub.** Repository → Settings → Secrets and variables → Actions:
   - secret `CLOUDFLARE_API_TOKEN`: that token;
   - secret `CLOUDFLARE_ACCOUNT_ID`: the account id (Cloudflare dashboard → the account's
     overview page, right-hand column; for this fork it starts `bddadbc9`);
   - variable `CLOUDFLARE_PAGES_PROJECT`: `opengym`.
   The workflow is skipped until the variable exists, so nothing breaks before then.
3. **Railway.** `RP_ID=opengym.pages.dev` and `ORIGIN=https://opengym.pages.dev` on the `api`
   service (set on 2026-11-08; a change redeploys the service). Passkeys are bound to this
   hostname: a passkey registered on the old Vercel hostname cannot sign in here, so register a
   new one and import a backup if the old profile held data.
4. **Deploy.** Push to `main`, or Actions → Cloudflare Pages → Run workflow. The first run
   uploads the media (about 216 MB); later runs upload only what changed.

## Checks

```bash
H=https://opengym.pages.dev
curl -s $H/api/health            # {"ok":true,...} from Railway, through the Function
curl -sI $H/ | grep -i cache     # no-cache: the shell is always revalidated
curl -sI $H/assets/ | head -1    # a hashed bundle: immutable
```

Then on the iPhone: Safari → `https://opengym.pages.dev` → Share → **Add to Home Screen**.
Sign in with a passkey (or continue as a guest on this device), and allow notifications from
Settings → Reminders for run-day and rest-timer pushes.

## Why not deploy from a laptop with wrangler

`wrangler pages deploy dist --project-name opengym` works from any machine with the token in
`CLOUDFLARE_API_TOKEN` and the account id in `CLOUDFLARE_ACCOUNT_ID`. It did not work from the
Claude cloud session that set this up: wrangler fetches a short-lived upload token and sends it
in the same header the session's proxy overwrites with the saved API token, so the asset upload
is refused. GitHub Actions has no such proxy.

## Limits worth knowing (Cloudflare Pages, Free)

20,000 files per site, 25 MiB per file, 500 builds a month (not used: the build runs on
GitHub), Function requests counted against the Workers free quota (100,000 a day), which the
app's few API calls per session do not approach.
