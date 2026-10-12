import { POLICY_NAME } from './progression.js'

/**
 * Presentation-only view of a progression result. The engine remains the source of truth for
 * both the outcome and its explanation; this helper only makes the policy behind that result
 * explicit in the workout guidance.
 */
export function progressionGuidance(plan) {
  if (!plan?.why) return null
  // A lighter or a competition week (lib/week-mode.js) explains itself even where the policy
  // is off: the sets and loads moved, and the line says why.
  if (plan.weekMode === 'lighter' || plan.weekMode === 'comp') {
    return { policyLabel: plan.weekMode === 'comp' ? 'Competition week' : 'Lighter week', why: plan.why }
  }
  if (plan.kind === 'off' || plan.policy === 'off') return null
  const policyLabel = POLICY_NAME[plan.policy]
  if (!policyLabel) return null
  return { policyLabel, why: plan.why }
}
