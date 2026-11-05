import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDayOn } from '../integrations/run-days.js';

const weeks = Array.from({ length: 10 }, (_, i) => ({ key: 'k' + (i + 1), kind: i === 9 ? 'race' : 'build', stage: i, midMin: 20, longMin: 30 }));
const S = { running: { goal: '10k', startDate: '2026-11-09', days: [2, 4, 0], plan: { weeks } }, runSessions: {}, runLog: {} };

test('names the planned run days and nothing else', () => {
  assert.deepEqual(runDayOn(S, '2026-11-10'), { kind: 'run', week: 1 });
  assert.deepEqual(runDayOn(S, '2026-11-15'), { kind: 'long', week: 1 });
  assert.equal(runDayOn(S, '2026-11-11'), null);
  assert.equal(runDayOn(S, '2026-11-08'), null, 'before the start');
  assert.deepEqual(runDayOn(S, '2027-01-17'), { kind: 'race', week: 10 });
  assert.equal(runDayOn(S, '2027-01-19'), null, 'after the plan');
});

test('is quiet for a ticked session, a logged run, a switched-off reminder, or no plan', () => {
  assert.equal(runDayOn({ ...S, runSessions: { 'k1-0': { status: 'done', d: '2026-11-10', _ts: 1 } } }, '2026-11-10'), null);
  assert.equal(runDayOn({ ...S, runLog: { 'strava:1': { d: '2026-11-10', sec: 600, _ts: 1 } } }, '2026-11-10'), null);
  assert.equal(runDayOn({ ...S, running: { ...S.running, remind: false } }, '2026-11-10'), null);
  assert.equal(runDayOn({ running: null }, '2026-11-10'), null);
  assert.equal(runDayOn({ running: { startDate: 'nope', plan: { weeks } } }, '2026-11-10'), null);
  // A session that starts midweek drops the days before it.
  assert.equal(runDayOn({ ...S, running: { ...S.running, startDate: '2026-11-11' } }, '2026-11-10'), null);
  assert.deepEqual(runDayOn({ ...S, running: { ...S.running, startDate: '2026-11-11' } }, '2026-11-12'), { kind: 'run', week: 1 });
});
