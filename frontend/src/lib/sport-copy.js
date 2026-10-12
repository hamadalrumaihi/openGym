// What each sport-plan role is for, in the person's language. Written as literal t() calls (the
// way PLAN_COPY in sheets.jsx and CATEGORY_TEXT in lib/coach.js are) so check-source-strings
// sees every key and check-locales holds every pack to it. lib/sport-plans.js only names the
// role; this file says what it means.
//
// The claims stay modest on purpose. The two reviews the templates lean on say what grappling
// asks for (Andreato et al. 2017, Sports Med Open, on BJJ: intermittent high-intensity effort,
// strength and power in the decisive actions, grip endurance; da Silva et al. 2021, J Strength
// Cond Res, on judo: strength work and high-intensity intervals in most protocols that improved
// performance). They do not say that any one gym exercise wins matches, and neither does this.
import { t } from './i18n.js'

/* Per role: the quality it trains, why that matters in judo and in BJJ, the cues, the effort
   target, the substitutions (exercise ids the templates would reach for) and how it progresses. */
export const ROLE_COPY = {
  power_lower: () => ({
    quality: t('Explosive leg power'),
    judo: t('Throws start from the legs. Jumps train producing force fast, which is a different quality from grinding out a heavy set.'),
    bjj: t('Standing up, shooting and bridging out are fast leg actions. Jumps train producing force quickly.'),
    cues: t('Few reps, full rest, every rep as fast and clean as the first. Land softly and stop the set the moment it slows down.'),
    effort: t('Nowhere near failure. Stop at 5 crisp reps, rest 2 minutes.'),
    progression: t('Quality first: the load stays put. After three clean sessions a set is added, up to five. Only then is a small load or a harder variation worth it.'),
  }),
  power_hinge: () => ({
    quality: t('Explosive hip power'),
    judo: t('Hip drive is the engine of most throws. The swing trains a fast, repeatable hip snap.'),
    bjj: t('Bridging, hip escapes and sweeps all come from the hips. The swing trains a fast hip snap you can repeat.'),
    cues: t('Hinge, not squat: hips back, flat back, snap the hips through and let the bell float. The arms only guide.'),
    effort: t('Sharp and short. Stop while every rep still snaps, rest 90 seconds or more.'),
    progression: t('The load stays until every rep stays sharp for three sessions; then a set is added, up to five, before any heavier bell.'),
  }),
  power_upper: () => ({
    quality: t('Explosive upper-body power'),
    judo: t('Pulling an opponent off balance and finishing a throw are fast actions. Throws and push presses train upper-body speed.'),
    bjj: t('Framing, posting and pushing an opponent off you are fast pushes. Throws and push presses train that speed.'),
    cues: t('Whole body into it: legs first, then arms. Catch or reset calmly, then throw again at full intent.'),
    effort: t('Every throw at full speed, never to tiredness. Rest until you can repeat it.'),
    progression: t('The load stays. After three sessions with every rep fast, a set is added, up to five. A heavier ball or bar only once that is easy.'),
  }),
  power_rotation: () => ({
    quality: t('Rotational power'),
    judo: t('Most throws turn the body under load. Rotational throws train turning the hips and trunk fast as one piece.'),
    bjj: t('Sweeps, passes and scrambles turn the body hard. Rotational throws train the hips and trunk to turn fast together.'),
    cues: t('Feet set, turn from the hips, the ball follows the trunk. Equal sets each side.'),
    effort: t('Fast and relaxed. Stop before it gets sloppy, rest 90 seconds.'),
    progression: t('Same ball until every throw is sharp for three sessions, then a set is added. A heavier ball comes last.'),
  }),
  squat: () => ({
    quality: t('Leg strength'),
    judo: t('Lifting an opponent, entering low and driving through a throw all ask for strong legs. Heavy, slow strength is the base the fast work sits on.'),
    bjj: t('Standing up with someone attached, stacking, lifting for a pass: all leg strength. This is the base the faster work sits on.'),
    cues: t('Brace before you move. Knees track the toes, full depth you can control, drive the floor away.'),
    effort: t('Two or three reps in reserve on every set. The last set is hard, not a grind.'),
    progression: t('Every rep in every set and the weight goes up next time; missed reps hold it, a stall backs it off. You can edit any target.'),
  }),
  unilateral: () => ({
    quality: t('Single-leg strength and balance'),
    judo: t('Every throw is one leg loaded and the other free. Split squats and step-ups train strength and balance on one leg at a time.'),
    bjj: t('Takedowns, standing up in base and sweeping all load one leg at a time. Split squats and step-ups train that directly.'),
    cues: t('Tall trunk, slow down, drive up through the whole front foot. Same reps on both sides.'),
    effort: t('Two reps in reserve. Balance before load: steady beats heavy.'),
    progression: t('Reps climb through the range at the same weight; at the top of the range the weight goes up and the reps start over.'),
  }),
  hinge: () => ({
    quality: t('Hip and hamstring strength'),
    judo: t('Pulling an opponent in and lifting them means a strong hinge: hips, hamstrings and back working together.'),
    bjj: t('Breaking posture, stacking and standing out of a guard load the hips and lower back. A strong hinge protects and powers both.'),
    cues: t('Hips back, bar or bells close to the legs, flat back the whole way. Stand tall at the top without leaning back.'),
    effort: t('Two or three reps in reserve. Never round the back to finish a set.'),
    progression: t('Every rep in every set and the weight goes up next time; missed reps hold it, a stall backs it off.'),
  }),
  hpull: () => ({
    quality: t('Pulling strength'),
    judo: t('Grip fighting and kuzushi are pulling. Rows build the back and arms that keep pulling when the grip is set.'),
    bjj: t('Pulling guard, holding a collar, finishing a hold: pulling strength, mostly from the back. Rows build it.'),
    cues: t('Set the shoulder blades first, pull the elbow past the ribs, lower under control. No jerking the weight up.'),
    effort: t('Two reps in reserve. Control the way down.'),
    progression: t('Reps climb through the range at the same weight; at the top of the range the weight goes up and the reps start over.'),
  }),
  vpull: () => ({
    quality: t('Vertical pulling strength'),
    judo: t('Pull-ups load the lats, arms and grip together, close to how a pull on the gi loads them.'),
    bjj: t('Pull-ups build the lats and arms behind every pull on a collar or a sleeve, and they load the grip at the same time.'),
    cues: t('Full hang at the bottom, chest to the bar at the top, no swinging. Use assistance or a pulldown until you have clean reps.'),
    effort: t('One or two reps in reserve. A sloppy rep does not count.'),
    progression: t('Body weight: reps climb, then a set is added. Assisted: less help each time you hit every rep. Pulldown: the weight goes up.'),
  }),
  pull_endurance: () => ({
    quality: t('Pulling endurance'),
    judo: t('A round of grip fighting is many pulls, not one. Higher-rep rows train pulling that lasts.'),
    bjj: t('Holding a position or a collar for a whole round is pulling endurance. Higher-rep rows and inverted rows train it.'),
    cues: t('Smooth rhythm, full range, no rest at the top. Lighter than you think and all the reps.'),
    effort: t('Burning but not failing. Two reps left on the last set.'),
    progression: t('Reps climb to the top of the range at the same weight, then the weight goes up and the reps start over.'),
  }),
  push: () => ({
    quality: t('Pushing strength'),
    judo: t('Pushing is the other half of grip fighting and of posting on the mat. A press keeps the shoulders balanced against all the pulling.'),
    bjj: t('Framing, posting and pushing an opponent off you are pushes. A press keeps the shoulders strong and balanced against all the pulling.'),
    cues: t('Shoulder blades set, elbows under the bar or bells, full lockout. Lower under control.'),
    effort: t('Two reps in reserve on every set.'),
    progression: t('Reps climb through the range at the same weight; at the top of the range the weight goes up and the reps start over.'),
  }),
  carry: () => ({
    quality: t('Grip and trunk under load'),
    judo: t('A carry holds a heavy grip while you walk braced: close to holding a gi and moving an opponent.'),
    bjj: t('A carry holds a heavy grip while you walk braced: close to holding a collar or a wrist while you move.'),
    cues: t('Stand tall, shoulders down, walk steadily. Suitcase carries: do not lean away from the weight.'),
    effort: t('Hard grip, calm walk. Put it down before your posture goes.'),
    progression: t('Time first: the carry gets longer until it reaches the cap, then the weight goes up and the time starts over.'),
  }),
  grip_hang: () => ({
    quality: t('Grip endurance'),
    judo: t('Grip endurance, more than peak grip strength, is what the research on judo gripping points at. A hang trains holding on for time.'),
    bjj: t('Gi grips are held for whole rounds. A hang trains holding on for time; in no-gi it still builds the forearms that hold a wrist or a neck.'),
    cues: t('Full hang, shoulders active, breathe. Gi players: hang from a towel over the bar for a cloth grip. Stop before the grip fails.'),
    effort: t('Stop with a few seconds left in the grip, never at failure. Your hands also train on the mat.'),
    progression: t('A few seconds more each clean session, up to a cap. After a heavy mat week the target holds instead of climbing.'),
  }),
  grip_iso: () => ({
    quality: t('Isometric pulling hold'),
    judo: t('Holding a bent-arm position under load is how a grip is kept once it is set.'),
    bjj: t('Holding a bent-arm pull under load is how a collar grip, a hold or a choke is kept.'),
    cues: t('Chin over the bar or elbows pinned, stay still, breathe. Assist with a box if needed.'),
    effort: t('Stop when the position starts to slip. Not to failure.'),
    progression: t('A few seconds more each clean session, up to a cap, then a harder variation.'),
  }),
  trunk_anti: () => ({
    quality: t('Trunk stability'),
    judo: t('Resisting being turned and keeping posture under a pull is trunk stability. Pallof presses and planks train it.'),
    bjj: t('Keeping posture in guard and resisting being turned or stacked is trunk stability. Pallof presses and planks train it.'),
    cues: t('Ribs down, squeeze the glutes, do not let the hips turn or sag. Breathe through the hold.'),
    effort: t('Hard brace, steady breathing. Stop before the position shakes apart.'),
    progression: t('Holds get longer up to a cap, then a harder variation or more load.'),
  }),
  trunk_lateral: () => ({
    quality: t('Lateral trunk stability'),
    judo: t('Side bending under load happens in every throw entry and defence. Side planks and suitcase carries train resisting it.'),
    bjj: t('Shrimping, framing and holding side control all load the trunk sideways. Side planks and suitcase carries train resisting it.'),
    cues: t('Straight line from head to feet, hips forward, top shoulder stacked. Same time each side.'),
    effort: t('Steady breathing, stop before the hips drop.'),
    progression: t('Holds get longer up to a cap, then a harder variation or more load.'),
  }),
  trunk_flex: () => ({
    quality: t('Trunk control'),
    judo: t('Controlling the trunk and hips against a pull keeps your posture. Dead bugs and hanging raises train that without the lower back.'),
    bjj: t('Guard work and inversions ask for a trunk that bends and holds on command. Dead bugs and hanging raises train it with the lower back protected.'),
    cues: t('Lower back stays pressed down or the body stays still; move only the limbs. Slow.'),
    effort: t('Controlled, two reps in reserve.'),
    progression: t('Reps climb, then a set is added, then a harder variation.'),
  }),
  neck: () => ({
    quality: t('Neck strength'),
    judo: t('The neck is loaded in grip fighting, posting and falling. Light, controlled neck work builds it gradually.'),
    bjj: t('Guillotines, cranks and posting on the head all load the neck. Light, controlled neck work builds it gradually.'),
    cues: t('Slow, small range, no jerking. Hands support the head on the first sessions.'),
    effort: t('Easy. Several reps in reserve; the neck adapts slowly.'),
    progression: t('Reps climb slowly. Add resistance only after weeks of easy work.'),
  }),
  cond_aerobic: () => ({
    quality: t('Aerobic base'),
    judo: t('A match is repeated hard efforts with short rests. An aerobic base is what you recover on between them and between rounds.'),
    bjj: t('Rolls are repeated hard efforts. An aerobic base is what lets you recover between them, and it helps the next day too.'),
    cues: t('Easy pace: you could speak in sentences. Any machine or a run works; pick what you have.'),
    effort: t('Easy. Finish feeling you could go on.'),
    progression: t('Add a few minutes every week or two before adding pace. Targets are yours to edit.'),
  }),
  cond_intervals: () => ({
    quality: t('Repeated-effort conditioning'),
    judo: t('Judo protocols that improved performance in the research often used high-intensity intervals. Short hard efforts with short rests are the closest gym version of a match.'),
    bjj: t('Short hard efforts with short rests mirror the way a roll goes. Intervals train recovering between them.'),
    cues: t('Example: 20 to 30 seconds hard, 60 to 90 seconds easy, 6 to 8 rounds. Hard means honest, not all-out on the first one.'),
    effort: t('Hard rounds, real recovery between them. Skip this on a day after heavy sparring.'),
    progression: t('Add a round every week or two, then shorten the rests. Never on the day before a competition.'),
  }),
  mobility: () => ({
    quality: t('Hip and shoulder mobility'),
    judo: t('Deep entries and safe falls need hips and a thoracic spine that move. These drills also warm you up for the lifts.'),
    bjj: t('Guard work, inversions and shoulder positions need hips and a thoracic spine that move. These drills also warm you up for the lifts.'),
    cues: t('Slow, breathing, no bouncing. A little further each rep, never into pain.'),
    effort: t('Easy. This is a warm-up, not a workout.'),
    progression: t('None to chase: do them every session and let the range come.'),
  }),
}

export const ROLE_IDS = Object.keys(ROLE_COPY)

/** The short label the chip in a workout shows for a role, in the current language. */
export const roleLabel = role => (ROLE_COPY[role] ? ROLE_COPY[role]().quality : '')

/* The plan sizes offered. Names and blurbs here, for the same reason as above. */
export const PLAN_SIZE_COPY = {
  one: () => ({ name: t('One gym day a week'), about: t('A busy-week session: the essentials in under an hour. Enough to keep strength while the mat gets most of your time.') }),
  two: () => ({ name: t('Two gym days a week'), about: t('Two full-body sessions, A and B, that take turns. The usual starting point.') }),
  three: () => ({ name: t('Three gym days a week'), about: t('A, B and a third session with more power and conditioning.') }),
  ab: () => ({ name: t('A/B rotation, whenever you can'), about: t('A and B take turns on whatever days you make it in. A missed week changes nothing: the next session is simply the next one.') }),
}
export const SPORT_NAME = {
  judo: () => t('Judo'), bjj: () => t('BJJ'), both: () => t('Judo + BJJ'),
}
export const GI_NAME = { gi: () => t('Gi'), nogi: () => t('No-gi'), both: () => t('Gi and no-gi') }
export const LIFTING_NAME = {
  new: () => [t('New to lifting'), t('First months in the gym, whatever your mat experience.')],
  returning: () => [t('Coming back after a break'), t('You know the movements; the numbers need rebuilding.')],
  regular: () => [t('Lifting regularly'), t('Consistent in the gym for a while now.')],
}
export const PRIORITY_NAME = {
  grip: () => t('Grip'), power: () => t('Explosive power'), pull: () => t('Pulling'), trunk: () => t('Trunk stability'),
  legs: () => t('Leg strength'), conditioning: () => t('Conditioning'), mobility: () => t('Mobility'),
}
