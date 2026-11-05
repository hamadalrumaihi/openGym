/* Which day is a planned run, for the day reminder (server.js reminder tick), hand-copied from the
 * frontend's date rules (lib/running-plan.js expandPlan) the way api/queue.js copies the
 * planner's: week 1 starts on the Monday of the plan's start date, the plan's days land in each
 * week, sessions before the start date do not exist, the last listed day is the long one. A
 * session already ticked (runSessions) or a run already logged that day (runLog) is not reminded.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

/** `{ kind: 'run' | 'long' | 'race', week }` when `iso` is a planned, unticked run day, else null. */
export function runDayOn(S, iso) {
  const r = S?.running;
  if (!r || r.remind === false || !ISO.test(String(r.startDate || '')) || !Array.isArray(r.plan?.weeks) || !ISO.test(String(iso))) return null;
  if (iso < r.startDate) return null;
  const days = Array.isArray(r.days) && r.days.length ? r.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [2, 4, 0];
  if (!days.length) return null;
  const monday = mondayOf(r.startDate);
  const weekIdx = Math.floor((Date.parse(iso + 'T12:00:00Z') - Date.parse(monday + 'T12:00:00Z')) / 86400000 / 7);
  const week = r.plan.weeks[weekIdx];
  if (!week) return null;
  const weekStart = addDays(monday, weekIdx * 7);
  const idx = days.findIndex(d => addDays(weekStart, (d + 6) % 7) === iso);
  if (idx < 0) return null;
  const id = `${week.key}-${idx}`;
  const state = S.runSessions && S.runSessions[id];
  if (state && state.status) return null;
  if (Object.values(S.runLog || {}).some(x => x && x.d === iso && x.sec)) return null;
  const long = idx === days.length - 1;
  return { kind: week.kind === 'race' && long ? 'race' : long ? 'long' : 'run', week: weekIdx + 1 };
}
