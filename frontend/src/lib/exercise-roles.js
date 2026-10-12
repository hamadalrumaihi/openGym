// What an exercise is FOR: its movement pattern and its training purpose, so a substitution
// can keep the job and not just the muscle. The catalogue (5,600 rows) describes exercises by
// body part, target muscle, equipment and a category (strength, plyometrics, isometric, …);
// nothing in it says "this is a hinge" or "this is power work". A swap that only matches the
// muscle hands a jump squat to someone whose box is taken and offers them a leg extension.
//
// Two layers, in this order:
//   1. CURATED — the exercises the sport templates and the starter plans use, and the common
//      lifts around them, each given its role by hand. This is the source of truth where it
//      has an entry.
//   2. a deterministic rule set over the catalogue's own fields (category, body part, target)
//      and the words of the name, for everything else. The rules are plain and listed below;
//      the same exercise always classifies the same way, and anything the rules cannot place
//      gets no pattern at all (`pattern: null`) rather than a guess — a swap then falls back to
//      the muscle match the app always had.
//
// Patterns:  squat · unilateral · hinge · hpull · vpull · hpush · vpush · carry · grip ·
//            trunk (anti-extension, flexion) · rotation (anti-rotation, rotation) ·
//            jump · throw · olympic · conditioning · mobility · neck · arms · calves · shoulders
// Purposes:  strength · power · isometric · carry · grip · conditioning · mobility
//
// `mode` is how the exercise is logged (lib/history.js modeOf): a carry or a hold by time, a
// bike by minutes, the rest by reps. The templates read it from here so a planned hold never
// opens as "3 × 45 reps".
import { EXIDX } from './exercises.js'

export const PATTERNS = ['squat', 'unilateral', 'hinge', 'hpull', 'vpull', 'hpush', 'vpush', 'carry', 'grip', 'trunk', 'rotation', 'jump', 'throw', 'olympic', 'conditioning', 'mobility', 'neck', 'arms', 'calves', 'shoulders']
export const PURPOSES = ['strength', 'power', 'isometric', 'carry', 'grip', 'conditioning', 'mobility']

// Plain words for each pattern, as t() keys (all 18 packs carry them).
export const PATTERN_LABEL = {
  squat: 'Squat', unilateral: 'Single-leg', hinge: 'Hip hinge', hpull: 'Horizontal pull', vpull: 'Vertical pull',
  hpush: 'Horizontal push', vpush: 'Vertical push', carry: 'Loaded carry', grip: 'Grip', trunk: 'Trunk',
  rotation: 'Anti-rotation', jump: 'Jump', throw: 'Throw', olympic: 'Olympic lift', conditioning: 'Conditioning',
  mobility: 'Mobility', neck: 'Neck', arms: 'Arms', calves: 'Calves', shoulders: 'Shoulders',
}

const R = (pattern, purpose, mode) => ({ pattern, purpose, ...(mode ? { mode } : {}) })
const S = p => R(p, 'strength')

/* The hand-set roles. Every id the sport templates use is here, plus the starter plans' lifts and
   the everyday variants a swap is likely to land on. Keep ids sorted by pattern for review. */
export const CURATED = {
  // squat
  '0043': S('squat'), '3593': S('squat'), '1436': S('squat'), '1435': S('squat'), '0042': S('squat'), '0029': S('squat'),
  '1760': S('squat'), '0534': S('squat'), '5304': S('squat'), '0739': S('squat'), '2966': S('squat'), '0533': S('squat'),
  '4246': S('squat'), '4962': S('squat'), '0127': S('squat'), '1595': S('squat'),
  // single-leg
  '2290': S('unilateral'), '3691': S('unilateral'), '0431': S('unilateral'), '4295': S('unilateral'), '4400': S('unilateral'),
  '3743': S('unilateral'), '0336': S('unilateral'), '0054': S('unilateral'), '0612': S('unilateral'), '1460': S('unilateral'),
  '2925': S('unilateral'), '7549': S('unilateral'), '4134': S('unilateral'), '0114': S('unilateral'), '1757': S('unilateral'),
  '3928': S('unilateral'), '4523': S('unilateral'),
  // hinge
  '0085': S('hinge'), '1459': S('hinge'), '4861': S('hinge'), '0032': S('hinge'), '0811': S('hinge'), '0117': S('hinge'),
  '1060': S('hinge'), '4742': S('hinge'), '0044': S('hinge'), '4455': S('hinge'), '7746': S('hinge'), '4204': S('hinge'),
  '0586': S('hinge'), '3322': S('hinge'), '0300': S('hinge'), '1409': S('hinge'), '3335': S('hinge'), '0549': R('hinge', 'power'),
  // horizontal pull
  '0027': S('hpull'), '0292': S('hpull'), '2393': S('hpull'), '0861': S('hpull'), '1323': S('hpull'), '0499': S('hpull'),
  '9698': S('hpull'), '0293': S('hpull'), '3017': S('hpull'), '0049': S('hpull'), '0327': S('hpull'), '1773': R('hpull', 'grip'),
  '3165': S('hpull'), '0498': S('hpull'), '1080': S('hpull'), '5609': S('hpull'), '1503': S('hpull'), '4568': S('hpull'),
  // vertical pull
  '0652': S('vpull'), '0651': S('vpull'), '0017': S('vpull'), '2330': S('vpull'), '0198': S('vpull'), '7385': S('vpull'),
  '1198': S('vpull'), '0674': S('vpull'), '1431': S('vpull'), '5473': S('vpull'), '0238': S('vpull'), '0150': S('vpull'),
  '1047': S('vpull'), '0007': S('vpull'),
  // horizontal push
  '0025': S('hpush'), '0289': S('hpush'), '0662': S('hpush'), '0047': S('hpush'), '0251': S('hpush'), '0314': S('hpush'),
  '2982': S('hpush'), '5093': S('hpush'), '1298': S('hpush'), '0030': S('hpush'),
  // vertical push
  '1162': S('vpush'), '0405': S('vpush'), '0426': S('vpush'), '9695': S('vpush'), '1226': S('vpush'), '0404': S('vpush'),
  '1700': R('vpush', 'power'), '1200': R('vpush', 'power'), '0540': R('vpush', 'power'),
  // carries (logged by time: seconds of walking)
  '2917': R('carry', 'carry', 'time'), '3576': R('carry', 'carry', 'time'), '2912': R('carry', 'carry', 'time'),
  '2133': R('carry', 'carry', 'time'), '4528': R('carry', 'carry', 'time'), '2734': R('carry', 'carry', 'time'),
  '2910': R('carry', 'carry', 'time'), '2918': R('carry', 'carry', 'time'), '2913': R('carry', 'carry', 'time'),
  '2916': R('carry', 'carry', 'time'), '4244': R('carry', 'carry', 'time'), '5099': R('carry', 'carry', 'time'),
  '2914': R('carry', 'carry', 'time'), '3548': R('carry', 'carry', 'time'), '2911': R('carry', 'carry', 'time'),
  // grip (the bar hang is filed as a stretch in the catalogue; its demonstration is a dead hang)
  '5055': R('grip', 'grip', 'time'), '1357': R('grip', 'grip', 'time'), '4983': R('grip', 'isometric', 'time'),
  '10438': R('grip', 'grip', 'time'), '0126': R('grip', 'strength'), '0082': R('grip', 'strength'), '6262': R('grip', 'strength'),
  '0364': R('grip', 'strength'), '0358': R('grip', 'strength'), '1016': R('grip', 'strength'), '0994': R('grip', 'strength'),
  // trunk: anti-extension and flexion
  '0463': R('trunk', 'isometric', 'time'), '5159': R('trunk', 'isometric', 'time'), '1246': R('trunk', 'isometric', 'time'),
  '6547': R('trunk', 'isometric', 'time'), '0276': S('trunk'), '4840': S('trunk'), '1241': S('trunk'), '0472': S('trunk'),
  '9819': S('trunk'), '4093': S('trunk'),
  // anti-rotation and rotation
  '1202': R('rotation', 'isometric', 'time'), '0979': R('rotation', 'isometric', 'time'), '1015': R('rotation', 'isometric', 'time'),
  '1213': R('rotation', 'isometric', 'time'), '4240': S('rotation'), '4193': S('rotation'), '4106': S('rotation'),
  '0715': R('rotation', 'isometric', 'time'), '0706': R('rotation', 'isometric', 'time'), '2899': R('rotation', 'isometric', 'time'),
  '1470': R('rotation', 'isometric', 'time'), '5879': R('rotation', 'isometric', 'time'), '3337': R('rotation', 'isometric', 'time'),
  '0562': S('rotation'), '0243': S('rotation'), '8193': S('rotation'), '1697': S('rotation'),
  // jumps
  '0514': R('jump', 'power'), '0513': R('jump', 'power'), '1600': R('jump', 'power'), '4242': R('jump', 'power'),
  '9514': R('jump', 'power'), '9513': R('jump', 'power'), '0564': R('jump', 'power'), '3877': R('jump', 'power'),
  '3543': R('jump', 'power'), '4844': R('jump', 'power'), '10160': R('jump', 'power'), '5166': R('jump', 'power'),
  '0053': R('jump', 'power'), '1552': R('jump', 'power'), '4166': R('jump', 'power'),
  // throws
  '1302': R('throw', 'power'), '1354': R('throw', 'power'), '3442': R('throw', 'power'), '1699': R('throw', 'power'),
  '4383': R('throw', 'power'), '4243': R('throw', 'power'), '3439': R('throw', 'power'), '5144': R('throw', 'power'),
  '0640': R('throw', 'power'), '10197': R('throw', 'power'),
  // olympic-style pulls
  '4739': R('olympic', 'power'), '4889': R('olympic', 'power'), '5704': R('olympic', 'power'), '0648': R('olympic', 'power'),
  '1520': R('olympic', 'power'), '1530': R('olympic', 'power'), '4532': R('olympic', 'power'), '0295': R('olympic', 'power'),
  // conditioning (logged in minutes at a pace)
  '2138': R('conditioning', 'conditioning', 'cardio'), '3893': R('conditioning', 'conditioning', 'cardio'),
  '1161': R('conditioning', 'conditioning', 'cardio'), '0685': R('conditioning', 'conditioning', 'cardio'),
  '2197': R('conditioning', 'conditioning', 'cardio'), '3666': R('conditioning', 'conditioning', 'cardio'),
  '2612': R('conditioning', 'conditioning', 'cardio'), '2142': R('conditioning', 'conditioning', 'cardio'),
  '5216': R('conditioning', 'conditioning', 'cardio'), '2259': R('conditioning', 'conditioning', 'cardio'),
  '2279': R('conditioning', 'conditioning', 'cardio'), '0798': R('conditioning', 'conditioning', 'cardio'),
  // mobility and warm-up drills
  '2569': R('mobility', 'mobility'), '1471': R('mobility', 'mobility'), '4553': R('mobility', 'mobility'),
  '8052': R('mobility', 'mobility'), '5555': R('mobility', 'mobility'), '2993': R('mobility', 'mobility'),
  '3561': R('mobility', 'mobility'), '4633': R('mobility', 'mobility'), '4580': R('mobility', 'mobility'),
  // neck
  '10780': S('neck'), '10781': S('neck'), '5145': R('neck', 'isometric', 'time'),
  // arms, calves, shoulders (accessories)
  '0313': S('arms'), '0031': S('arms'), '0241': S('arms'), '0334': S('shoulders'), '0605': S('calves'),
}

/* ---------- the rule set ----------
   Checked top to bottom; the first rule that fires names the pattern. The words are matched on
   the catalogue's English name, whole words only, so "squat" never fires on "squatting row". */
const W = words => new RegExp('\\b(' + words + ')\\b', 'i')
const NAME_RULES = [
  ['carry', W('carry|carries|farmers? walk|farmer\'s walk|suitcase|waiter walk|overhead walk')],
  ['throw', W('throw|toss|pass|slam|smash')],
  ['olympic', W('clean|snatch|jerk|high pull')],
  ['jump', W('jump|jumps|hop|hops|bound|bounds|skater|depth drop')],
  ['unilateral', W('split squat|bulgarian|lunge|lunges|step[- ]?ups?|step up|single leg|one leg|pistol|skater squat|rear foot elevated')],
  ['squat', W('squat|squats|leg press|hack|wall sit|leg extension')],
  ['hinge', W('deadlift|romanian|rdl|good morning|hip thrust|glute bridge|hip extension|back extension|hyperextension|swing|swings|nordic|leg curl|pull[- ]?through|kickback')],
  ['vpull', W('pull[- ]?ups?|chin[- ]?ups?|pulldowns?|pull downs?|lat pull|muscle[- ]?up')],
  ['hpull', W('row|rows|face pull|pull apart|pull-apart|rear delt|reverse fly|reverse flyes?|shrug')],
  ['vpush', W('overhead press|shoulder press|military press|push press|arnold press|landmine press|z press|pike push')],
  ['hpush', W('bench press|chest press|push[- ]?ups?|press[- ]?ups?|dip|dips|fly|flye|flyes|flies|floor press|crossover')],
  ['rotation', W('pallof|anti[- ]rotation|side plank|side bridge|landmine 180|chop|chops|woodchop|twist|twists|rotation|rotational|windmill')],
  ['trunk', W('plank|dead bug|deadbug|hollow|rollout|roll-out|bird dog|leg raise|knee raise|crunch|sit[- ]?up|ab wheel|l[- ]sit|v[- ]up|toes to bar|flutter')],
  ['neck', W('neck')],
  ['calves', W('calf|calves')],
  ['arms', W('curl|curls|extension|extensions|pushdown|skull|kickbacks?')],
  ['shoulders', W('lateral raise|front raise|raise|raises')],
]
const GRIP_HANG = /\b(dead hang|hang|hangs)\b/i
const GRIP_WORK = /gripper|hand grip|grip|pinch|wrist|crush|roller/i
const POWER_CATS = new Set(['plyometrics', 'olympic'])
const MOBILITY_CATS = new Set(['stretching', 'yoga', 'mobility', 'rehab', 'pilates'])

function classify(ex) {
  if (!ex) return { pattern: null, purpose: null, mode: 'reps', source: null }
  const cat = ex.cat || ''
  const n = String(ex.n || '')
  if (cat === 'cardio' || ex.bp === 'cardio') return { pattern: 'conditioning', purpose: 'conditioning', mode: 'cardio', source: 'rule' }
  if (MOBILITY_CATS.has(cat)) return { pattern: 'mobility', purpose: 'mobility', mode: 'reps', source: 'rule' }
  let pattern = null
  // Grip first, and narrowly: a hang from a bar (not a hanging leg raise), or forearm work the
  // name calls grip, wrist or pinch work. "Neutral grip pull-up" and "close grip bench press"
  // are not grip exercises, whatever the word says.
  if (!POWER_CATS.has(cat) && GRIP_HANG.test(n) && !/\bhanging (leg|knee|hollow|l[- ]?sit|flutter|front lever|windmill|deadbug|side)/i.test(n) && !/\bhang (clean|snatch|power|pull|high)/i.test(n)) pattern = 'grip'
  else if (ex.tg === 'forearms' && GRIP_WORK.test(n)) pattern = 'grip'
  else for (const [p, re] of NAME_RULES) if (re.test(n)) { pattern = p; break }
  // A power category wins over the name's pattern: "jump squat" is a jump, "barbell clean" an
  // Olympic pull, and a plyometric push-up is still power work.
  let purpose = 'strength'
  if (POWER_CATS.has(cat)) {
    purpose = 'power'
    if (!pattern || ['squat', 'hinge', 'unilateral', 'calves'].includes(pattern)) pattern = cat === 'olympic' ? 'olympic' : 'jump'
    else if (['hpush', 'vpush', 'hpull'].includes(pattern) && cat === 'plyometrics') pattern = 'throw'
  } else if (cat === 'isometric') purpose = 'isometric'
  if (pattern === 'carry') purpose = 'carry'
  if (pattern === 'grip' && purpose !== 'strength') purpose = 'grip'
  if (pattern === 'grip' && /hang/i.test(n)) purpose = 'grip'
  const mode = purpose === 'isometric' || purpose === 'carry' || (purpose === 'grip' && /hang|hold/i.test(n)) ? 'time' : 'reps'
  return { pattern, purpose, mode, source: pattern ? 'rule' : null }
}

const cache = new Map()
/**
 * The role of an exercise (an id or an object): `{ pattern, purpose, mode, source }`, where
 * `source` is 'curated', 'rule' or null when the rules could place nothing. A custom exercise
 * is read like any other, by its name and body part.
 */
export function roleOf(idOrEx) {
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return { pattern: null, purpose: null, mode: 'reps', source: null }
  const cur = CURATED[ex.id]
  if (cur) return { pattern: cur.pattern, purpose: cur.purpose, mode: cur.mode || (cur.purpose === 'conditioning' ? 'cardio' : 'reps'), source: 'curated' }
  const hit = cache.get(ex)
  if (hit) return hit
  const out = classify(ex)
  cache.set(ex, out)
  return out
}

export const patternOf = idOrEx => roleOf(idOrEx).pattern
export const purposeOf = idOrEx => roleOf(idOrEx).purpose
/** How the role says the exercise is logged — reps, time or cardio. */
export const roleModeOf = idOrEx => roleOf(idOrEx).mode

// Which purposes may stand in for which. Strength work and an isometric hold of the same pattern
// are close enough (a plank for a dead bug); power never swaps with slow strength work, a carry
// never with a curl, conditioning only with conditioning.
const PURPOSE_OK = {
  strength: ['strength', 'isometric'], isometric: ['isometric', 'strength'], power: ['power'],
  carry: ['carry'], grip: ['grip', 'isometric'], conditioning: ['conditioning'], mobility: ['mobility'],
}
/**
 * Whether `to` can take over `from`'s job: the same pattern when `from` has one (any pattern when
 * neither is known), and a purpose the table above allows. Both read from the roles, so a
 * curated id and a rule-classified one are judged the same way.
 */
export function roleCompatible(from, to) {
  const a = roleOf(from), b = roleOf(to)
  if (a.pattern && b.pattern !== a.pattern) return false
  if (a.pattern && !b.pattern) return false
  if (a.purpose && b.purpose && !(PURPOSE_OK[a.purpose] || [a.purpose]).includes(b.purpose)) return false
  return true
}

/**
 * A prescription carried from one exercise to another that logs differently. Sets travel; the
 * number that means nothing in the new mode is replaced by a sensible one, never copied: a
 * "3 × 12" dead bug swapped for a plank opens at 3 × 30 s, not 3 × 12 s; a 3 × 45 s hold swapped
 * for reps work opens at 3 × 10. Same mode, same prescription.
 */
export function adaptPrescription(cfg, fromMode, toMode) {
  if (fromMode === toMode) return { ...cfg }
  const { reps, repsMin, repsMax, sec, min, speed, prog, inc, setsMax, ...rest } = cfg || {}
  const sets = Math.max(1, Number(cfg?.sets) || 3)
  if (toMode === 'time') return { ...rest, sets, mode: 'time', sec: 30, weight: 0, adapted: true }
  if (toMode === 'cardio') return { ...rest, sets: 1, min: 10, speed: 8, weight: 0, adapted: true }
  return { ...rest, sets, mode: 'reps', reps: 10, weight: 0, adapted: true }
}
