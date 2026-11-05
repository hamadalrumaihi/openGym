# Running: Road to 10K, Garmin and Strava

openGym has a running side next to the gym and the mat: a run/walk programme that takes a
returning runner to a 5K, a 10K or a half marathon, the runs your watch records pulled in
through Garmin Connect, Strava or a FIT file, a coach that reads what was planned, what was run
and what you reported and suggests the next step, and running numbers on the Stats screen.

Nothing here writes to Garmin or Strava. Nothing here diagnoses anything. The race date is a
target, not a promise: the plan can be repeated, reduced or skipped a week at a time.

## 1. Setting up the plan

**Home → "Road to 10K" card → Set up**, or **Settings → Running → Road to 10K**.

| Choice | What it does |
|---|---|
| Goal | 5K (8 weeks), 10K (10 weeks), half marathon (16 weeks) |
| Where you are now | *Never really ran* and *Used to run, cannot sustain much now* start at the first rung (one minute of running, two of walking). *Can run 20-30 minutes today* starts three rungs up. When you already have recorded runs in the last six weeks, the sheet reads them and says where it would start you, and why. |
| Run days | Up to four weekdays. The last one is the long session. Tuesday, Thursday and Sunday by default. |
| Start date | Week 1 starts on that day's week; sessions before the date do not exist. |
| Race date | Defaults to the plan's last day. Repeating a week moves the plan's end; the screen warns when it ends after the race. |
| Max heart rate | Optional. Gives every session a zone-2 band (60-70 % of the maximum) and puts it in the FIT workout. Garmin Connect fills it in when connected. |
| Two running-strength sessions | Adds *Run strength A* and *B* (calves and soleus, hamstrings, glutes, quadriceps, single-leg work, trunk) on the free days, never the day before the long run. |
| Run day reminders | Run days join the day reminder (Settings → Reminders) at its time. |

What the programme does (the full reasoning is in [docs/dev/RUNNING.md](dev/RUNNING.md)):

- three sessions a week, each five minutes of walking in, the work, five minutes of walking out;
- a ladder of run/walk rungs: 1:2, 1.5:2, 2:2, 3:2, 4:2, 5:2, 8:2, 10:2, 15:1.5, 20:1, then
  continuous running; a build week climbs one rung;
- the long session grows by about ten per cent a week, never past 35 min (5K), 65 min (10K)
  or 110 min (half);
- every fourth week eases (same rung, less time); the last week tapers; race day is the last
  long day, run/walk allowed;
- no mandatory speed work. Race week offers a few optional relaxed 20-second pickups and that is
  all.

**Busy week** and **recovery week** (Running screen → This week) last seven days: busy makes the
second midweek run optional and shortens the rest; recovery shortens everything and holds the
rung.

## 2. Day to day

The **Running screen** (Home card → Open, or Settings → Running) shows today's session or the
next one, its rung, its heart-rate band, and three buttons:

- **Tick it off**: done or skipped, effort 1-10, pain (none, a niggle, it hurt, had to stop), a
  note, and which recorded run it was.
- **To watch (.fit)**: the session as a Garmin workout file (section 3).
- **Log a run**: a run typed in by hand, for days without a watch.

Below: the coming sessions, the week mode, the strength sessions, progress (weeks done, sessions
kept, this week's distance, the race date), the plan week by week with a **⋯** menu per week
(**Repeat**, **Reduce** to three quarters, **Skip**, **Restore**), your runs, and the state of the
connections.

A run that comes in from the watch is matched to the planned session on its day (or the day
before or after, for a long run moved to Saturday) and ticks it; a tick you made by hand is never
overridden.

### The coach

After every run the coach reads: whether the planned session was completed, how long it was,
your effort and pain, the heart rate against your maximum, missed sessions, your mat sessions
and the morning check-in (the judo/BJJ side), and says one of:

| It says | When | What happens |
|---|---|---|
| **Rest today** | pain was reported in the last seven days | advice; one tap skips today's session |
| **Make today easier** | the check-in says keep it light, or three or more hard mat sessions in seven days | advice, with an easier version of today (same rung, two thirds of the time) |
| **Repeat last week** | two or more of last week's sessions were missed | a proposal: **Approve** inserts the week again |
| **Reduce this week** | two or more of last week's sessions were cut short or felt 8/10 or harder (or sat in heart-rate zone 4 and up) | a proposal: **Approve** reduces this week to three quarters |
| **A session was missed** | one session this week, with a free day before the next | advice: do it today if fresh, never two days in a row |
| **Going well** | the last three sessions completed at 6/10 or easier, no pain | carry on |

Every line names its reason. Nothing changes the plan without your tap. The thresholds are
design choices, not clinical ones, and the coach says so.

## 3. Garmin Forerunner 965

### Getting your runs into openGym

**Garmin Connect Personal API (automatic, read-only).** Garmin opened this in October 2026 for
people to read their own data. Set it up once:

1. On a computer, sign in to Garmin Connect and open
   <https://connect.garmin.com/app/settings/personalApiToken>.
2. **Create Key**, accept the terms, choose how long the key lives (30 days to a year),
   **Create**. Copy the key: Garmin shows it once.
3. In openGym (signed in): **Settings → Running → Garmin Connect**, paste the key, **Connect**.
   openGym checks it immediately and pulls your last 90 days of running and walking.

From then on the server pulls new activities every 30 minutes (the operator's
`INTEGRATIONS_POLL_MIN`), and **Sync now** pulls on demand. **Import the last year** reaches
further back. What comes in: distance, duration, average and maximum heart rate, cadence,
elevation gain, time in each heart-rate zone, and Garmin's own training effect, training load and
VO2max estimate, labelled as Garmin's. Your heart-rate zones as Garmin Connect holds them fill in
the plan's maximum heart rate when you have not set one. Never a coordinate: the start and end
locations Garmin sends are dropped before anything is stored.

When the key expires, the Garmin row says so; paste a new one.

**A FIT file (no account needed).** On the watch's activity page in Garmin Connect (web), the
gear menu → **Export original** downloads a zip with the `.fit` inside; openGym reads the zip as
is. Or copy `GARMIN/Activity/*.fit` off the watch over USB. **Settings → Running → Import a FIT
file**, or the Running screen → **FIT file**. Laps, heart rate, cadence and the time in zones
come from the file; GPS points are counted and discarded.

**Through Strava.** With Garmin Connect's Strava connection on, every run lands on Strava and
openGym pulls it from there (section 4). A run seen from both sides is kept once, the Garmin or
FIT copy first.

### Getting a planned session onto the watch

Garmin's Personal API cannot write workouts; writing to Garmin Connect is the business-tier
Training API, which needs a Garmin Connect Developer Program application. openGym therefore
hands you the session as a standard **FIT workout file** and offers the manual route:

**FIT file over USB (verified against Garmin's FIT specification, not yet on a watch).**

1. Running screen → the session → **To watch (.fit)**. The file holds the warm-up walk, the
   run and walk steps with the repeat count, the heart-rate band (or zone 2), and the cool-down.
2. Connect the Forerunner 965 to a computer over USB. The watch appears as a drive (on a Mac it
   needs an MTP helper such as OpenMTP).
3. Copy the file into `GARMIN/NewFiles`. Disconnect the watch safely.
4. On the watch: **Start → Run → hold Menu → Training → My Workouts**, pick the workout,
   **Do Workout**, then Start. The watch counts down each step and buzzes at every change.

Garmin Connect's import takes activity files only, not workouts, so this file goes to the watch
directly, and the workout does not appear in Garmin Connect's calendar. A workout loaded this way
runs on the watch; openGym cannot see whether it did, so the Running screen asks you to tick the
session (or the run that comes back ticks it).

**Garmin Connect, by hand.** Garmin Connect (web or phone) → **Training & Planning → Workouts →
Create a Workout → Run**: add the steps the Running screen lists (warm-up 5 min, repeat N × run
X min / walk Y min, cool-down 5 min), save, then **Send to device** or schedule it on the
calendar; the watch picks it up on the next sync. The Running screen's session line is written to
be typed straight in.

Until a session has run on a real watch, treat the watch workflow as *implemented, not
device-tested*. The file bytes are checked by tests against the FIT specification; the first
real-watch run is the missing step.

## 4. Strava

Strava access needs an API application of your own on the server (the operator sets
`STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`; Strava requires a Strava subscription to create
an application, and the application's *Authorization Callback Domain* must be the instance's
hostname). Then, signed in: **Settings → Running → Strava → Connect**. Strava asks you to allow
*View data about your activities*; keep it ticked. Back in openGym the connection shows as
connected and your last 90 days of runs and walks come in, laps included.

Strava's tokens expire every six hours; the server refreshes them. Strava's rate limits (200
calls per 15 minutes, 2,000 a day per application) are read from every answer and a pull stops
short of them; a 429 pauses the connection until the next quarter hour and the row says so.

**Disconnect** revokes the token at Strava and deletes it from the server, together with any
activity still waiting. You choose whether the runs it brought stay in your log as your own
record or go with it.

What openGym never does with Strava: upload, edit or delete an activity; show your Strava data to
anyone but you; hand Strava-sourced data to the AI Coach or the MCP server (Strava's API policy
forbids AI use of its data); keep anything after you disconnect and ask for deletion.
Garmin-sourced data shown from Strava is attributed to Garmin on the Stats screen, as Strava's
policy asks.

## 5. Stats

The Stats screen gains a **Running** card once there is a run or a plan: this week's distance,
the longest run, the best 5K and 10K (a time from a longer run is the run's average pace held
over the distance and is marked *est.*), weeks done and sessions kept, weekly distance, the
average heart rate and pace per run, and the last 28 days of running, gym and mat sessions side
by side.

## 6. Your data

| What | Where | Sync |
|---|---|---|
| The plan and profile | `running` in your state | one setting, the copy saved last wins |
| Recorded runs | `runLog` | per run, both devices' runs survive a sync; a deleted run stays deleted |
| Session ticks | `runSessions` | per session |
| Garmin key, Strava tokens | the server only, `data/integrations-<you>.json`, encrypted | never in the state, a backup or an export |

Backups carry the plan, the runs and the ticks. *Reset everything* wipes them. No GPS trace is
ever stored, so there is nothing to protect there: a run keeps `gps: true` and nothing else about
where it went.
