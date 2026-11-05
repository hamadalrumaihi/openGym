# Running coach, Road to 10K, Garmin and Strava: design

Status: approved brief from the project owner (the "master implementation prompt" of
2026-11-05), recorded here as the design the implementation follows. Decisions that the brief
left open are marked **(design call)**.

## Intent

Make openGym the owner's one training app: keep every gym, judo and BJJ feature, and add a
running side that takes a returning runner who cannot yet sustain much running to a 10 km race
in about ten weeks, with the Forerunner 965 as the recording device and Strava as a second
source. The race date is a target, not a promise: the plan must be able to stretch.

Success looks like: open the app on an iPhone (PWA) and see today's run; finish it on the
watch; have it land in openGym (Strava sync or a FIT file) and be matched to the planned
session; get a conservative, explainable suggestion for the next session; see weekly distance,
pace and heart-rate trends next to the gym and mat work.

## What already exists and is reused

| Need | Existing piece |
|---|---|
| Synced per-user state, two-device merge, backups, reset | `S` in `store/useStore.js`, `lib/sync-merge.js` + `api/sync-stamps.js` (stamped maps) |
| Pure-helper convention with tests beside | `lib/sport.js`, `lib/day-notes.js` |
| Mat load and morning readiness | `S.matLog`, `S.readiness`, `readinessAdvice` (`lib/sport.js`) |
| Week modes (lighter / competition) | `lib/week-mode.js` |
| FIT binary writer, CRC, base types | `lib/fit-export.js` (`encodeFit`) |
| Cardio logging mode (min + speed), the `run` exercise | `lib/history.js` `modeOf`, catalogue id `0685` |
| Routine schema and catalogue-checked templates | `lib/sport-plans.js`, `lib/starter.js` |
| Home card, sheets, settings pages, stats cards | `components/SportCard.jsx`, `sport-sheets.jsx`, `views/settings-pages.js`, `views/Stats.jsx` |
| Server routes, session auth, CSRF, rate limits, audit, atomic writes | `api/server.js` |
| Secret encryption at rest (AES-GCM over HKDF of `DATA/secret`) | `api/coach/config.js` |
| Reminders (web push tick, Capacitor local notifications) | `api/server.js` reminder tick, `lib/mobile.js` |

## State (synced, in `S`)

| Field | Shape | Merge |
|---|---|---|
| `running` | `null \| { goal: '5k'\|'10k'\|'half', raceDate, startDate, days: [weekday…], level: 'new'\|'returning'\|'base', hrMax, strength: bool, weekMode: null\|{mode:'busy'\|'recovery', until}, plan: { weeks: [...] , built: ms }, setAt }` | one setting, last save wins whole (like `S.sport`) |
| `runLog` | `{ [id]: { d, start, src: 'strava'\|'fit'\|'manual', srcId, name, kind: 'run'\|'walk', sec, distM, avgHr, maxHr, cadence, elevM, laps[], zones[], rpe, pain, note, planRef, _ts } }` | stamped map (`STAMPED_MAPS`) |
| `runSessions` | `{ [sessionId]: { status: 'done'\|'skipped', d, runId, rpe, pain, note, _ts } }` | stamped map |

No GPS coordinates are ever stored: a run keeps only `gps: true/false`. Laps are capped at 60.
Ids are deterministic (`strava:<id>`, `fit:<sha256 prefix>`, `manual:<uid>`) so a re-import
overwrites instead of duplicating. All three have defaults in `DEF`; older copies overlay.

Integration tokens never enter `S`: they live server-side in `DATA/integrations-<uid>.json`,
encrypted, 0600, and are deleted on disconnect.

## Pure helpers (`frontend/src/lib`)

- `running.js` — the state model: `readRunning`, `runningOf`, `withRunning`, `readRun`,
  `runsOf`, `withRun`, `withoutRun`, `sessionStateOf`, `withSessionState`, pace/format helpers.
- `running-plan.js` — the programme: a run/walk ladder from 1:2 to continuous running, three
  days a week (Tue/Thu/Sun by default), a long session that grows no more than about 10 % a
  week, every fourth week eased, a taper in the last week, race day last. Goals 5K (8 weeks),
  10K (10 weeks), half (16 weeks) share one generator. `buildRunPlan(profile)`,
  `applyWeekAction(plan, weekIdx, 'repeat'|'skip'|'reduce')`, `sessionDates`, `todaySession`,
  `baselineFrom(runs)` (start later in the ladder when imported runs show it is safe).
- `running-coach.js` — rules: `evaluateRun(session, run, feedback)`, `coachAdvice(S, today)`
  returning `{ kind, reasons[], substantial }`; every rule names its reason; substantial
  changes (repeat/reduce a week, move the race) are proposed, never applied.
- `running-strength.js` — two optional catalogue-checked sessions (calves/soleus, hamstrings,
  glutes, quads, single-leg stability, trunk) placed away from the long run; busy and
  recovery week variants. Produces ordinary routines the planner already understands.
- `running-stats.js` — weekly distance and time, average pace, HR trend, longest run,
  consistency, best 5K/10K estimates, progress to race, cross-training counts.
- `run-import.js` — normalisation of a Strava activity and of a decoded FIT session into the
  `runLog` shape, duplicate detection (same start ±3 min and distance ±5 %), source preference
  (FIT/Garmin over Strava).
- `fit-decode.js` — a FIT reader (header, definitions incl. developer fields, compressed
  timestamps, both endiannesses) for session/lap/record messages.
- `fit-workout.js` — a FIT WORKOUT file writer (workout + workout_step) built on `encodeFit`:
  warm-up, repeated run/walk steps, HR-zone or pace targets, cool-down.

## Server (`api/`)

- `integrations/strava.js`: `GET /api/integrations` (status), `POST /api/integrations/strava/connect`
  (authorisation URL with a hashed one-time state), `GET /api/integrations/strava/callback`,
  `POST /api/integrations/strava/sync` (pull activities since the last sync, laps for runs),
  `POST /api/integrations/strava/disconnect` (revokes the token at Strava, deletes the stored
  tokens and the cached import cursor). Env: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
  `STRAVA_API_BASE` (tests point it at a local mock). Rate limits honoured from Strava's
  headers; 401 → refresh once; 429 → stop and report. Nothing is ever written to Strava.
- The client stores imported runs into `S.runLog` itself (the server returns normalised runs),
  so the existing sync model stays the single writer of state files.
- Garmin Connect Developer Program APIs need a business application and approval; the
  connector is documented and the FIT path works today. See `docs/RUNNING_GARMIN.md`.

## UI

- `#/running` (`views/Running.jsx`): today, this week, the plan by week with repeat / skip /
  reduce, completion with RPE and pain, coach suggestions with Approve, imported runs, sync
  status, FIT upload and FIT workout export. Mobile-first, one column.
- Home: a "Road to 10K" card after the sport card.
- Settings → Running & integrations: Strava connect/disconnect/sync/delete, FIT import/export,
  reminder toggle for run days.
- Stats: a running card (weekly distance, pace and HR lines, tiles).

## Testing

Unit tests beside every helper (plan generation, ladder monotonicity, taper, week actions,
coach rules incl. missed sessions and pain, strength placement, stats, import normalisation,
duplicate detection, FIT round trip encode→decode, sync merge of the new maps on both sides).
Server tests boot the real server against a mock Strava. The full frontend, api and mcp suites
and `npm run build` must stay green; iPhone layout checked with Playwright at 390×844.

## Out of scope, by the brief or by verification

Garmin device sync is not claimed until it works on a real watch. No unofficial Garmin
endpoints. No upload to Strava. No AI prediction of injury or recovery.
