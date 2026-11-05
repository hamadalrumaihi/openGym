# Running: the programme, the coach's rules, the connections

How the running side is built, what rests on published guidance and what is a design call, and
where the data lives. The user-facing guide is [docs/RUNNING.md](../RUNNING.md).

## Files

| Piece | Where |
|---|---|
| State model (profile, run log, session states), pace/zone helpers | `frontend/src/lib/running.js` |
| The ladder, plan skeleton, dated sessions, week actions, matching runs to sessions | `lib/running-plan.js` |
| The coach's rules | `lib/running-coach.js` |
| The two strength sessions and their placement | `lib/running-strength.js` |
| Weekly numbers, bests, consistency, progress, training mix | `lib/running-stats.js` |
| Garmin / Strava / FIT → run log shape, duplicate detection, merge | `lib/run-import.js` |
| FIT reader (activity files, zipped exports) | `lib/fit-decode.js` |
| FIT workout writer (on `lib/fit-export.js`'s encoder) | `lib/fit-workout.js` |
| App side of the connections (status, collect pending, ack) | `lib/integrations.js` |
| Sheets, the screen, the Home and Stats cards, the Settings page | `running-sheets.jsx`, `views/Running.jsx`, `components/RunningCard.jsx`, `components/RunningStatsCard.jsx`, `components/IntegrationsSettings.jsx` |
| Server: encrypted store, Strava and Garmin clients, sync, poller, routes, run-day reminder | `api/integrations/*.js` |

Every helper has its test beside it; `api/test/integrations.test.js` runs the server side
against a local mock of both providers.

## The programme (design calls)

The shape follows the common "couch to" run/walk pattern: short run intervals with walking
recovery, lengthened week by week, three times a week, with a longer weekend session, an easier
week every fourth, and a taper. What is ours:

- **The ladder** (`LADDER`): 1:2, 1.5:2, 2:2, 3:2, 4:2, 5:2, 8:2, 10:2, 15:1.5, 20:1, continuous.
  One rung per build week; an ease week holds the rung. A 10K plan from the first rung reaches
  15:1.5 by race week, so the race is run with walk breaks. That is deliberate: the brief was a
  returning runner who cannot sustain much running yet, and a finish is the goal, not a time.
- **Volumes**: midweek work 20 min + 2 min a week to 35; the long session 25 min, +10 % rounded
  up to 5 min, capped at 35/65/110 min for 5K/10K/half; ease weeks ×0.85 (midweek) and ×0.8
  (long); the half gets a taper week (×0.8, ×0.6) before race week; race week is 20 and 15 min
  easy. Warm-up and cool-down are five minutes of walking each.
- **The baseline** (`baselineFrom`): from the last six weeks of recorded runs. Three runs with
  one of 30 min at ≤ 8:00/km → rung 5; two runs with one of 20 min at ≤ 9:00/km → rung 3; any
  run of 15 min → rung 1; else rung 0. A summary cannot see walk breaks inside a run, so it
  never starts anyone past rung 5.
- **Week actions**: repeat inserts a copy after the week with a fresh key (before it when it is
  the race or taper week, as a build week); skip removes it (never the race, never below two
  weeks); reduce scales the week to three quarters. Session ids carry the week's key, so ticks
  survive renumbering.
- **Week modes**: busy ×0.8 and the second midweek run optional; recovery ×0.7. Seven days,
  applied to the week that contains the window.

None of this is an assessment of anyone's capacity. The screen says so and everything is
editable: weeks, days, the race date, the rung (through the level).

## The coach (rules, in priority order)

`coachAdvice(S, today)` in `lib/running-coach.js`. Each rule returns its reasons as sentences.

1. **Pain** ≥ "it hurt" in the last seven days → `rest`. The copy says to see someone qualified
   if it keeps hurting and that the app cannot tell what it is.
2. **Readiness** (`readinessAdvice` level `light`) or **≥ 3 hard mat sessions** in seven days
   (`matWeekOf`) on a run day → `easier` (same rung, two thirds of the time).
3. **Last week ≥ 2 missed** → `repeat-week` (substantial). **≥ 2 demanding** (cut short under 80 %
   of the planned time, effort ≥ 8/10, or average heart rate in zone 4+ against a known maximum)
   → `reduce-week` (substantial, not twice).
4. **One missed this week** with a free day before the next → `reschedule`, with the rule "never
   two runs on consecutive days to catch up".
5. **Three completed at ≤ 6/10, no pain** → `advance` (keep climbing).
6. Else `keep`.

Substantial proposals are applied only through the sheet's **Approve**; the others are advice.
The thresholds (80 %, 8/10, zone 4, three mat sessions, seven days) are design calls. No rule
produces a percentage, a prediction or a diagnosis; `running-coach.test.js` greps the reasons for
those words.

## Strength (design calls)

`lib/running-strength.js`: session A (goblet squat, Romanian deadlift, standing and seated calf
raise, side plank, dead bug) and B (step-up, Bulgarian split squat, hip thrust, Nordic curl,
single-leg Romanian deadlift, Pallof press, band hip abduction), every id checked against the
catalogue by the test like the sport plans. Placement: the free days, never the eve of the long
run, as far apart as the week allows; one session in a busy or recovery week, accessories off in
recovery. The routines are ordinary routines on the weekday grid, so the planner, the workout
screen and the progression engine (double progression) treat them like any other.

## Data

| Field | Shape | Merge |
|---|---|---|
| `S.running` | `{ goal, raceDate, startDate, days[], level, hrMax, strength, remind, weekMode, plan: { weeks: [{ key, stage, kind, midMin, longMin, reduced? }], nextKey }, setAt }` | one setting (`edited.running`), last save wins whole |
| `S.runLog` | `{ [id]: { d, start, src, srcId, name, kind, sec, distM, avgHr, maxHr, cadence, elevM, laps[], zones[5], rpe, pain, note, planRef, gps, device, viaGarmin, garmin{te,ate,load,vo2,vo,gct,stride,vratio}, _ts } }` | stamped map, per entry (`STAMPED_MAPS` both sides) |
| `S.runSessions` | `{ [sessionId]: { status, d, runId, rpe, pain, note, _ts } }` | stamped map |

Ids: `garmin:<activityId>`, `strava:<id>`, `fit:<start second>`, `manual:<uid>`. Laps are capped
at 60; a coordinate never gets past `readRun`. `run-import.test.js` asserts the serialised run
carries no latitude.

**Duplicates** (`sameRun`): same start within three minutes and distance within five per cent
(or, without start times, same day with duration within two minutes); the device's record
(fit > garmin > strava > manual) replaces the platform's and inherits the person's effort, pain,
note and session link; the loser becomes a stamped clear.

## The connections (server)

`api/integrations/`:

- `store.js`: `DATA/integrations-<uid>.json`, 0600, atomic; tokens AES-256-GCM under
  HKDF(`DATA/secret`, `opengym-integrations-v1`), the Coach's pattern. Holds the pending list
  (fetched activities the app has not collected: capped at 300, dropped after seven days).
  The file is deleted when the last provider goes.
- `strava.js`: OAuth code exchange and refresh, `/athlete/activities?after=` paged at 100, laps,
  deauthorise; rate info from `X-RateLimit-*`, a pull stops at 85 % of the 15-minute budget;
  a 401 is answered with one refresh; coordinates, maps and segment efforts stripped.
- `garmin.js`: the Personal API (`personal.connectapi.garmin.com`, verified against Garmin's
  own OpenAPI document): `ApiKey` → 24 h token (no refresh token), activity search by type and
  local date range, heart-rate zones. Coordinates stripped.
- `sync.js`: per provider, since the last sync minus two days (90 days on a first connection,
  up to 400 on request), into the pending list; errors and rate-limit pauses land on the
  provider record. The poller runs every `INTEGRATIONS_POLL_MIN` minutes, one user at a time.
- `routes.js`: the twelve routes in `openapi.yaml`; the OAuth state is a random value kept
  hashed with the uid for ten minutes and burned on use; the callback redirects into
  `#/settings/running?strava=<reason>`.
- `run-days.js`: the day reminder's run-day rule, a hand-copy of the date math like
  `api/queue.js`.

The app collects the pending list (`lib/integrations.js collectPending`), converts, merges, ticks
sessions, adopts Garmin's maximum heart rate when the profile has none, and acknowledges. The
state file keeps one writer.

## What the brief asked for that is not here, and why

- **Pushing workouts to the watch through Garmin.** The Personal API is read-only; the Training
  API needs a Developer Program application. The FIT workout file and the Garmin Connect manual
  route are documented instead; neither has been run on a Forerunner 965 from this repository.
- **Strava webhooks** are implemented (`STRAVA_WEBHOOK_VERIFY_TOKEN`) but the subscription is
  created by the operator with Strava's API, once, and needs a public callback URL.
- **A native iOS build** is unchanged: the Capacitor shell is there (`docs/MOBILE.md`), the
  running screens are plain web and work in it, but no cloud macOS build was set up here.
- **Strava data and the AI Coach / MCP.** Strava's API policy forbids AI use of its data, so
  `runLog` is not part of the Coach payload or the MCP tools. A future running section of either
  must filter `src === 'strava'` out.
