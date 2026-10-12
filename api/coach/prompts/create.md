# Task: build a weekly training plan

Design a complete plan from `coachProfile` (their intake answers) and, if present, `history` (what they have already been lifting).

## Constraints

- Schedule exactly `coachProfile.daysPerWeek` training days. Use `preferredDays` when given (0 = Sunday … 6 = Saturday).
- **When `coachProfile.gymDaysUnknown` is true** (no `daysPerWeek`), do not invent a week: answer `"rotation": true` with an **empty `week`** and two full-body routines, A and B, that take turns on whatever days they train (a third, C, only if they asked for more). The app runs the loop: the next session is simply the next one, a missed week is not caught up, nothing restarts. A rotation is also the right shape when they say their schedule is irregular.
- With `coachProfile.sport` set, build from the foundation in the common rules, move the emphasis with the sport and `gi`, honour `priorities`, keep grip work small, and put jumps and throws on `prog: "power"`, carries on `mode: "time"` with `prog: "carry"`, hangs and holds on `prog: "grip"` or `prog: "time"`. Mark accessories `"optional": true` so the shorter session can skip them. Stay inside `coachProfile.sessionMin` with the accessories in; the essentials alone should fit in about two thirds of it.
- Fit `coachProfile.sessionMin` minutes: roughly 2–3 minutes per straight set including rest; supersets (`sg`) buy time back when the session is tight.
- Only exercises from `library`. Respect `equipment`, `limitations`, and `dislikes` — a plan someone will not do is a plan that failed.
- If `history.workingWeights` is present, any starting `weight` you set must be at or below what they have already handled for that exercise. For anything they have not trained, omit `weight` entirely — the app's first session sets the baseline.
- 1–7 routines, each 3–12 exercises, compound work before accessories.

## Output

```
{
  "coach_contract": 1,
  "opengym_plan": 1,
  "name": "<short plan name>",
  "summary": "<2-4 sentences: the shape of the plan and why it fits what they asked for>",
  "basedOn": "<what you used — e.g. 'your last 12 weeks' or 'no history yet'>",
  "week": { "1": "r1", "3": "r2", "5": "r3" },
  "rotation": false,
  "routines": [
    {
      "id": "r1",
      "name": "<routine name>",
      "emoji": "<one icon: figureStrength, arm, abs, legs, pullup, dumbbell, barbell, kettlebell, plate, machine, figureRun, bike, swim, boxing, timer, stretch, moon, heart, flame or bolt>",
      "prog": "linear",
      "why": "<1-2 sentences: what this day is for>",
      "ex": [
        {
          "id": "<library id>",
          "sets": 3,
          "mode": "reps",
          "reps": 8,
          "prog": "linear",
          "inc": 2.5,
          "repsMin": 8,
          "sg": "a",
          "role": "hpull",
          "optional": false,
          "why": "<1-2 sentences naming why this exercise, here, at this prescription>"
        }
      ]
    }
  ],
  "customEx": []
}
```

- `week` keys are weekday numbers as strings, values are `routines[].id` from this same answer. With `"rotation": true` the week is `{}` and the routines take turns in their listed order (at most four).
- `role` (one of the sport-template roles in the common rules) and `optional` are for a plan with a sport set; leave them out otherwise.
- `mode` is `reps` (use `reps`), `time` (use `sec`), or `cardio` (use `min` and `speed`).
- `prog` on a routine is its default; on an exercise it overrides. `inc` is the load step in `meta.unit`; `repsMin` only matters for `double`.
- `sg`: give two exercises the same short string to superset them. They must be adjacent in the list.
- `customEx` stays empty unless the library genuinely lacks something the plan needs; then add `{ "id": "cx1", "n": "<name>", "bp": "<body part>", "desc": "<how to do it>" }` and reference `cx1` from a routine.
