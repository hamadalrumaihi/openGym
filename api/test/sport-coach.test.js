/* The Coach's sport side: what reaches the model about judo and BJJ, and what a plan built as a
   rotation (gym days not known) has to look like to get through the validator. The payload is
   the consent promise, so this checks what is there AND that nothing else rides along. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData, sampleState } from './helpers.mjs';

tempData();
const payload = await import('../coach/core/payload.js');
const { validatePlan, validateReview } = await import('../coach/core/validate.js');
const { DATA_CATEGORIES } = await import('../coach/core/categories.js');
const { CREATE_SCHEMA } = await import('../coach/core/schemas.js');
const { PROMPTS } = await import('../coach/core/prompts.js');
const { handleFor } = await import('../coach/handle.js');

const today = new Date().toISOString().slice(0, 10);
const daysAgo = n => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

test('the consent list names the sport context, and the plan schema knows a rotation', () => {
  assert.ok(DATA_CATEGORIES.includes('sport'));
  assert.equal(CREATE_SCHEMA.properties.rotation.type, 'boolean');
  for (const k of ['rotation', 'gymDaysUnknown', 'matLog', 'readiness', 'never zero']) {
    assert.ok((PROMPTS.common + PROMPTS.create).includes(k), `the prompt explains ${k}`);
  }
});

test('the intake\'s sport answers are copied by name and bounded; an unknown mat count stays null', () => {
  const S = sampleState();
  const intake = {
    goal: 'strength', experience: 'new', daysPerWeek: null, sport: 'bjj', gi: 'nogi', matPerWeek: null,
    gymDaysUnknown: true, compDate: '2026-12-05', priorities: ['grip', 'nonsense', 'power'], secret: 'x'.repeat(50)
  };
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'create', intake });
  assert.deepEqual(
    { sport: p.coachProfile.sport, gi: p.coachProfile.gi, matPerWeek: p.coachProfile.matPerWeek, gymDaysUnknown: p.coachProfile.gymDaysUnknown, compDate: p.coachProfile.compDate, priorities: p.coachProfile.priorities },
    { sport: 'bjj', gi: 'nogi', matPerWeek: null, gymDaysUnknown: true, compDate: '2026-12-05', priorities: ['grip', 'power'] }
  );
  assert.equal(p.coachProfile.daysPerWeek, null);
  assert.ok(!JSON.stringify(p).includes('xxxxxxxxxx'), 'an unknown intake field does not ride along');
  // Judo is a gi sport whatever the answer says; zero classes is an answer and stays zero.
  const judo = payload.build(S, { handle: handleFor('u1'), kind: 'create', intake: { goal: 'strength', sport: 'judo', gi: 'nogi', matPerWeek: 0 } });
  assert.equal(judo.coachProfile.gi, 'gi');
  assert.equal(judo.coachProfile.matPerWeek, 0);
  // No sport: no sport fields at all.
  const plain = payload.build(S, { handle: handleFor('u1'), kind: 'create', intake: { goal: 'strength', sport: 'karate' } });
  assert.equal('sport' in plain.coachProfile, false);
});

test('the sport context carries the profile, two weeks of mat sessions and a week of check-ins, nothing derived', () => {
  const S = sampleState();
  S.sport = { kind: 'both', gi: 'gi', lifting: 'new', matPerWeek: 4, gymDays: 'ab', sessionMin: 60, compDate: '2026-12-05', priorities: ['grip'], weekMode: { mode: 'lighter', until: '2999-01-01' }, setAt: 1 };
  S.matLog = {
    a: { d: daysAgo(1), sport: 'judo', min: 90, effort: 5, note: 'private note about my coach', _ts: 1 },
    b: { d: daysAgo(20), sport: 'bjj', min: 60, effort: 3, _ts: 1 },     // older than two weeks: out
    c: { _ts: 2 },                                                       // a cleared entry: out
    d: { d: daysAgo(3), sport: 'wrestling', min: 60, _ts: 1 },           // not a sport of ours: out
  };
  S.readiness = { [today]: { energy: 2, soreness: 4, sleep: 2, _ts: 1 }, [daysAgo(10)]: { energy: 5, soreness: 1, sleep: 5, _ts: 1 }, junk: { energy: 9 } };
  for (const kind of ['create', 'review', 'debrief']) {
    const p = payload.build(S, { handle: handleFor('u1'), kind });
    assert.equal(p.sport.kind, 'both', kind);
    assert.deepEqual(p.sport.matLog, [{ d: daysAgo(1), sport: 'judo', min: 90, effort: 5 }], kind);
    assert.deepEqual(p.sport.readiness, [{ d: today, energy: 2, soreness: 4, sleep: 2 }], kind);
    assert.deepEqual(p.sport.weekMode, { mode: 'lighter', until: '2999-01-01' });
    assert.equal(p.sport.gymDays, 'ab');
    const json = JSON.stringify(p.sport);
    assert.ok(!json.includes('private note'), 'the mat session note never leaves');
    assert.ok(!/percent|fatigue|recover/i.test(json), 'no derived recovery number');
  }
  // A week mode that has ended is not sent; an empty log is an empty list, not a missing key.
  S.sport.weekMode = { mode: 'comp', until: '2000-01-01' };
  S.matLog = {};
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'review' });
  assert.equal(p.sport.weekMode, null);
  assert.deepEqual(p.sport.matLog, []);
  // No sport profile: no sport context.
  delete S.sport;
  assert.equal('sport' in payload.build(S, { handle: handleFor('u1'), kind: 'review' }), false);
});

test('a plan exercise\'s role and optional flag reach the model', () => {
  const S = sampleState();
  S.routines[0].ex[0] = { ...S.routines[0].ex[0], role: 'trunk_flex', optional: true };
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'review' });
  assert.equal(p.plan.routines[0].ex[0].role, 'trunk_flex');
  assert.equal(p.plan.routines[0].ex[0].optional, true);
});

/* ---------------- the validator ---------------- */

const r = (id, ex) => ({ id, name: id.toUpperCase(), ex });
const A = r('a', [{ id: '0043', sets: 3, reps: 5, role: 'squat' }, { id: '2917', sets: 3, mode: 'time', sec: 40, prog: 'carry', role: 'carry' }, { id: '5055', sets: 2, mode: 'time', sec: 30, prog: 'grip', role: 'grip_hang', optional: true }]);
const B = r('b', [{ id: '0085', sets: 3, reps: 8, role: 'hinge' }, { id: '1600', sets: 3, reps: 5, prog: 'power', role: 'power_lower' }, { id: '0652', sets: 3, reps: 8, role: 'nonsense' }]);

test('a rotation plan passes with an empty week, keeps role and optional, and drops an unknown role', () => {
  const res = validatePlan({ rotation: true, week: {}, routines: [A, B] }, { gymDaysUnknown: true });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.bundle.rotation, true);
  assert.deepEqual(res.bundle.week, {});
  assert.equal(res.bundle.routines[0].ex[2].optional, true);
  assert.equal(res.bundle.routines[0].ex[1].prog, 'carry');
  assert.equal(res.bundle.routines[1].ex[1].prog, 'power');
  assert.equal(res.bundle.routines[1].ex[0].role, 'hinge');
  assert.equal('role' in res.bundle.routines[1].ex[2], false, 'an invented role is dropped, never carried');
});

test('unknown gym days and an invented week, or a rotation that also fills the week, go back for repair', () => {
  const noLoop = validatePlan({ week: {}, routines: [A, B] }, { gymDaysUnknown: true });
  assert.equal(noLoop.ok, false);
  assert.ok(noLoop.errors.some(e => e.includes('rotation')));
  const both = validatePlan({ rotation: true, week: { 1: 'a' }, routines: [A, B] }, {});
  assert.equal(both.ok, false);
  assert.ok(both.errors.some(e => e.includes('leave week empty')));
  const long = validatePlan({ rotation: true, week: {}, routines: ['a', 'b', 'c', 'd', 'e'].map(id => r(id, [{ id: '0043', sets: 3, reps: 5 }])) }, {});
  assert.equal(long.ok, false);
  // A rotation is exempt from the day count, and an ordinary plan still has to meet it.
  assert.equal(validatePlan({ rotation: true, week: {}, routines: [A, B] }, { daysPerWeek: 3 }).ok, true);
  assert.equal(validatePlan({ week: { 1: 'a' }, routines: [A, B] }, { daysPerWeek: 3 }).ok, false);
});

test('a review may add an exercise with a role and the short-session flag', () => {
  const plan = { routines: [{ id: 'r1', name: 'A', ex: [{ id: '0043', sets: 3, reps: 5 }] }] };
  const res = validateReview({
    coach_contract: 1, summary: 's',
    changes: [{ id: 'c1', type: 'add-exercise', target: { routineId: 'r1' }, after: { id: '2917', sets: 3, mode: 'time', sec: 40, prog: 'carry', role: 'carry', optional: true }, why: 'grip under load' }]
  }, plan);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.deepEqual(
    { role: res.proposal.changes[0].after.role, optional: res.proposal.changes[0].after.optional, prog: res.proposal.changes[0].after.prog },
    { role: 'carry', optional: true, prog: 'carry' }
  );
});

test('every progression policy the app has reaches the model on a plan exercise (triple was dropped before)', () => {
  const S = sampleState();
  for (const prog of ['triple', 'power', 'carry', 'grip']) {
    S.routines[0].ex[0] = { ...S.routines[0].ex[0], prog };
    assert.equal(payload.build(S, { handle: handleFor('u1'), kind: 'review' }).plan.routines[0].ex[0].prog, prog, prog);
  }
});
