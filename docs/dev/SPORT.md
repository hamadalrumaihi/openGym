# Judo and BJJ: sport plans, mat context and the Coach

openGym can build gym sessions that support judo, Brazilian jiu-jitsu (BJJ), or both. This note
says what the feature does, which parts rest on research and which are programme-design calls,
and how the data is stored and synced.

It is a gym app feature. It does not record technique, sparring rounds, belts or academies.

## Using it

1. **Home → "Gym plan for the mat" → Set up sport profile.** Pick judo, BJJ or both, gi or
   no-gi, your **lifting** experience (gym, not mat), mat sessions a week (or "not sure"), gym
   days you can keep (1, 2, 3, A/B, or "not sure"), session length, an optional competition date,
   and up to three qualities to lean on. The same sheet is under Settings → Plan & schedule.
2. **Plan → share menu → Sport plan** (or the Home card). Choose one, two or three gym days, or
   the A/B rotation. Each session shows its exercises, its role, about how long it takes, and
   how long the shorter version takes. Fit it to an equipment profile if you have one.
3. **Add these routines.** They join your routine list and become your loop (Plan → Schedule
   shows it). Your other routines, your weekdays and your history are not touched. Switch on
   "Put on fixed weekdays instead" if you would rather have a weekly plan.
4. **Train.** Home shows the next session, its length, the equipment, the loads it opens at,
   and a **Shorter session** button that keeps the essentials and skips the accessories. During
   the session each exercise has a chip naming what it trains; tap it for why it is there, the
   cues, the effort target, how it progresses and what could stand in for it.
5. **Context, when you want it.** Log a mat session (date, sport, minutes, how hard it felt).
   Do the readiness check-in (energy, soreness, sleep). Choose a lighter or a competition week.

Everything is editable: sets, reps, rest, exercises, the progression rule. The templates are a
starting point, not an assessment of anyone's recovery capacity.

## The templates (`frontend/src/lib/sport-plans.js`)

Every session is cut from one foundation:

| Slot | Example (new lifter / regular) |
|---|---|
| Warm-up drill (optional unless you lean on mobility) | cossack squat, inchworm, world's greatest stretch |
| Power | standing long jump, jump squat, kettlebell swing, dumbbell push press, medicine-ball throws |
| Squat or single-leg | goblet squat / back squat, Bulgarian split squat, step-up, front squat |
| Hinge | dumbbell RDL / barbell RDL, trap-bar deadlift, hip thrust |
| Horizontal and vertical pull | one-arm row / bent-over row, lat pulldown / assisted / pull-up, chest-supported row |
| Push | push-up / bench press, seated / standing press |
| Loaded carry | farmer's carry, suitcase carry |
| Accessories (one budget) | dead hang, pull-up hold, Pallof press, side plank, towel row or inverted row, hanging knee raise or dead bug, Nordic curl, neck work, bike or rower |

Sizes: **One** (the busy-week session, about 40 minutes), **Two** (A and B), **Three** (A, B,
C), and **A/B rotation**. All of them run as a rotation: the next session is simply the next
one, a missed week is not caught up, and nothing restarts (`sport-rotation.test.js` walks an
irregular month). When the gym days are "not sure", C is built as an optional third session
outside the loop.

Sport moves the emphasis, not the foundation:

- **Judo:** grip work first in the accessory budget (three sets of hangs), the swing and the
  push press for fast hip and upper-body force, single-leg work, the towel row for gi pulling.
- **BJJ:** pulling endurance first (towel row for gi, inverted row for no-gi), lateral and
  anti-rotation trunk work, the rotational medicine-ball throw, conditioning intervals.
- **Both:** one shared foundation and **one** accessory budget of three per session. It never
  stacks two programmes; `sport-plans.test.js` checks that a "both" session is no longer than
  either sport's.

Lifting experience picks the variant: a new lifter gets the goblet squat, push-ups and the
pulldown on a rep range; a regular lifter the barbell lifts on 3 × 5 with linear progression.

Every exercise id is checked by the tests against the catalogue: a real entry with equipment,
a still and a clip, a description and at least four steps, logged the way its slot expects
(a carry or a hang by time, a bike by minutes). No exercise was invented and no media was added
or changed.

## What rests on research, and what is a design call

Research that informed the shape (all reviews, none of them a programme prescription):

- Andreato et al. 2017, *Physical and Physiological Profiles of Brazilian Jiu-Jitsu Athletes: a
  Systematic Review*, Sports Medicine - Open (PMID 28194734). BJJ is intermittent high-,
  moderate- and low-intensity effort, often several matches a day. Maximal, isometric and
  endurance strength may relate to success; muscular power appears central to decisive actions;
  aerobic fitness did not separate competitive levels; the evidence base is limited.
- da Silva et al. 2021, *Training Protocols and Specific Performance in Judo Athletes: A Systematic
  Review*, J Strength Cond Res (PMID 33795601). Across 19 studies, high-intensity interval
  training and judo-specific training produced the larger physiological and neuromuscular
  effects; strength training appeared in most protocols. Few studies included women.
- Bonitch-Góngora and Almeida's review of judo grip strength (Revista de Artes Marciales
  Asiáticas, 2014) and Franchini's judogi grip tests: peak grip force barely separates elite from
  non-elite judoka; grip endurance appears to matter more.
- Spiering, Mujika, Sharp and Foulis 2021, *Maintaining Physical Performance: The Minimal Dose of
  Exercise Needed to Preserve Endurance and Strength Over Time*, J Strength Cond Res (PMID
  33629972), a narrative review: in younger people strength and muscle size were maintained for
  up to 32 weeks with as little as one session a week and one set per exercise, provided the
  relative load was kept; older people may need two sessions; the authors found too little data
  to make recommendations for athletes. This is the case for the one-day busy-week template,
  framed as keeping strength, not building much, and with that caveat.

Design calls (ours, editable, not evidence): the exact exercises, set and rep numbers, rest
times, the order of the accessory budget per sport, the budget of three, the grip caps, the
power ceiling of five sets, the lighter-week and competition-week reductions, and the readiness
thresholds. The copy never claims that an exercise improves throws, submissions, injury rates
or results; `sport-copy.js` describes the quality trained and why it is relevant.

## Substitutions (`lib/exercise-roles.js`, `lib/substitute.js`)

Every exercise has a role: a movement pattern (squat, single-leg, hinge, horizontal pull,
vertical pull, horizontal push, vertical push, carry, grip, trunk, anti-rotation, jump, throw,
Olympic lift, conditioning, mobility, neck, arms, calves, shoulders), a purpose (strength, power,
isometric, carry, grip, conditioning, mobility) and the way it is logged. 217 ids are set by
hand; the rest of the catalogue is classified by a short, deterministic rule list over the
category, body part and whole words of the name. An exercise the rules cannot place gets no
pattern rather than a guess.

A stand-in must share the pattern and a compatible purpose: power stays power, a carry stays a
carry, a hold may stand in for slow trunk work. A prescription that crosses logging modes is
adapted, not copied (3 × 12 reps → 3 × 30 s, never 3 × 12 s). When nothing fits, the answer is
null: the sport plan keeps an essential slot and says so, and drops only an optional accessory.
The starter plans' equipment fitting uses the same rules. Manual swaps open on a **Same job**
chip for compound work, with the old **Same muscle** chip one tap away.

## Progression by kind of exercise (`lib/progression.js`, `lib/week-mode.js`)

| Policy | For | Rule |
|---|---|---|
| `linear`, `double` | strength lifts | unchanged: missed reps never add load, stalls deload |
| `power` | jumps, throws, swings, push press | load never moves; three clean sessions in a row add a set, up to five; a short session holds |
| `carry` | farmer's and suitcase carries | seconds grow to the slot's cap, then the load steps up and the time starts over; with no load logged it asks for a heavier pair |
| `grip` | hangs and holds | five seconds a clean session, up to the cap; holds after three or more mat sessions logged in the last seven days |
| `time` | other holds | unchanged |
| `off` | conditioning, warm-up drills | the target stays where you set it |

**Lighter week** (chosen, seven days): load down a tenth, one set fewer (never below two), holds a
fifth shorter, power keeps its load. **Competition week**: load down 15 %, two sets at most, holds
about a third shorter, power at two fast sets. Each changed target says why on the workout
screen, ahead of the engine's own reason. Only unlogged rows are ever cut.

## Mat context, readiness and the fatigue estimate

The mat log and the check-in are what the person reported. `readinessAdvice` reads them with a
plain rule (good to go / ease off a little / keep it light) and names its reasons; it never
produces a percentage, and nothing changes unless the person picks the shorter session or a week
mode. An empty mat log means "unknown", never "rested": the Home card says so, the grip rule only
holds when sessions are logged, and the Coach prompt says it in as many words.

The fatigue map in Stats is the app's own estimate from logged lifts. The Home card labels it
"from logged lifts only, not the mat" and does not call anyone recovered.

## Data (`lib/sport.js`)

| Field | Shape | Sync |
|---|---|---|
| `S.sport` | one object: kind, gi, lifting, matPerWeek (null = unknown), gymDays (1, 2, 3, 'ab', null), sessionMin, compDate, priorities, weekMode, setAt | stamped as one setting (`edited.sport`), the copy saved last wins whole |
| `S.matLog` | `{ id: { d, sport, min, effort, note?, _ts } }` | stamped map: each session merges on its own stamp, a removal is a stamped empty entry |
| `S.readiness` | `{ 'YYYY-MM-DD': { energy, soreness, sleep, _ts } }` | stamped map, one check-in per day |
| routine slots | `role`, `optional`, `secMax` on `routine.ex[]` | with the routine (per-field stamps), and in plan files |

All three have defaults in `DEF`, so a profile saved before them overlays cleanly and reads as
"no sport". They ride in backups, the phone's file mirror and the server copy like every other
field; `api/sync-stamps.js` knows the two stamped maps, and the reset wipe includes them.
Changing the sport profile never touches routines, workouts or records.

## The Coach

The intake gains a sport screen, a mat-sessions screen, a "not sure" option for gym days, and
the competition date and priorities. A sport set anywhere in the app also sends a `sport` block
in every payload (the consent screen lists it as its own category, consent version 3): the
profile, two weeks of mat sessions without their notes, a week of check-ins, and the week mode.
With the gym days unknown the Coach must answer with `"rotation": true` and an empty week; the
validator enforces it, the plan card shows the loop, and applying it writes the loop and leaves
the weekdays alone. Revert restores the previous loop. `role` and `optional` travel through the
validator, the plan card and `add-exercise`. The phone's own-key Coach runs the same core.
