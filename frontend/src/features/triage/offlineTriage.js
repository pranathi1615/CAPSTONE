/**
 * CareBridge Client-Side Offline Triage Evaluator (Phase 6).
 *
 * Implements deterministic red-flag checking from shared triage_rules.json.
 * A red-flag match ALWAYS produces 'emergency' urgency and cannot be overridden.
 * Offline evaluations are explicitly labeled 'Rules-Only (Offline)'.
 *
 * DISCLAIMER: Clinical decision support only - a qualified doctor makes the final decision.
 */

import triageRules from './triage_rules.json';

export function evaluateOfflineTriage({ symptoms = [], vitals = {} }) {
  const normSymptoms = (Array.isArray(symptoms) ? symptoms : [symptoms])
    .map((s) => (typeof s === 'string' ? s.toLowerCase().trim().replace(/[-\s]+/g, '_') : ''))
    .filter(Boolean);

  // 1. Check Symptom-based Red Flags
  for (const rule of triageRules.red_flag_rules) {
    const reqMet =
      !rule.required_symptoms ||
      rule.required_symptoms.length === 0 ||
      rule.required_symptoms.every((r) => normSymptoms.includes(r.toLowerCase()));

    const anyMet =
      !rule.any_of_symptoms ||
      rule.any_of_symptoms.length === 0 ||
      rule.any_of_symptoms.some((a) => normSymptoms.includes(a.toLowerCase()));

    if (reqMet && anyMet) {
      return {
        urgency: 'emergency',
        suggested_specialty: rule.suggested_specialty,
        reason: rule.reason,
        is_red_flag: true,
        rule_id: rule.id,
        mode: 'Rules-Only (Offline)',
        disclaimer: triageRules.disclaimer,
      };
    }
  }

  // 2. Check Vital Sign Emergency Thresholds
  const { vital_sign_emergency_thresholds: vThresh } = triageRules;
  if (vitals && typeof vitals === 'object') {
    if (vitals.spo2 != null && Number(vitals.spo2) < vThresh.spo2_min) {
      return {
        urgency: 'emergency',
        suggested_specialty: 'Pulmonology',
        reason: `Red-flag vital: critical hypoxia (SpO2 ${vitals.spo2}% < ${vThresh.spo2_min}%)`,
        is_red_flag: true,
        mode: 'Rules-Only (Offline)',
        disclaimer: triageRules.disclaimer,
      };
    }
    if (vitals.systolic_bp != null && Number(vitals.systolic_bp) >= vThresh.systolic_bp_max) {
      return {
        urgency: 'emergency',
        suggested_specialty: 'Cardiology',
        reason: `Red-flag vital: hypertensive crisis (Systolic BP ${vitals.systolic_bp} >= ${vThresh.systolic_bp_max} mmHg)`,
        is_red_flag: true,
        mode: 'Rules-Only (Offline)',
        disclaimer: triageRules.disclaimer,
      };
    }
    if (vitals.systolic_bp != null && Number(vitals.systolic_bp) <= vThresh.systolic_bp_min && Number(vitals.systolic_bp) > 0) {
      return {
        urgency: 'emergency',
        suggested_specialty: 'General Medicine',
        reason: `Red-flag vital: profound hypotension / shock (Systolic BP ${vitals.systolic_bp} <= ${vThresh.systolic_bp_min} mmHg)`,
        is_red_flag: true,
        mode: 'Rules-Only (Offline)',
        disclaimer: triageRules.disclaimer,
      };
    }
    if (vitals.pulse != null && (Number(vitals.pulse) > vThresh.pulse_max || (Number(vitals.pulse) < vThresh.pulse_min && Number(vitals.pulse) > 0))) {
      return {
        urgency: 'emergency',
        suggested_specialty: 'Cardiology',
        reason: `Red-flag vital: extreme hemodynamic instability (Pulse ${vitals.pulse} bpm)`,
        is_red_flag: true,
        mode: 'Rules-Only (Offline)',
        disclaimer: triageRules.disclaimer,
      };
    }
  }

  // 3. Fallback heuristic rules for offline when non-emergency
  if (
    normSymptoms.some((s) => ['severe_headache', 'high_fever', 'persistent_vomiting', 'acute_abdominal_pain'].includes(s))
  ) {
    return {
      urgency: 'urgent',
      suggested_specialty: 'General Medicine',
      reason: 'Offline heuristic: acute systemic warning signs',
      is_red_flag: false,
      mode: 'Rules-Only (Offline)',
      disclaimer: triageRules.disclaimer,
    };
  }

  if (
    normSymptoms.some((s) => ['mild_fever', 'ear_pain', 'cough_cold', 'rash_mild', 'joint_pain'].includes(s))
  ) {
    return {
      urgency: 'soon',
      suggested_specialty: normSymptoms.includes('joint_pain') ? 'Orthopedics' : 'General Medicine',
      reason: 'Offline heuristic: moderate non-acute symptoms',
      is_red_flag: false,
      mode: 'Rules-Only (Offline)',
      disclaimer: triageRules.disclaimer,
    };
  }

  return {
    urgency: 'routine',
    suggested_specialty: 'General Medicine',
    reason: 'Offline heuristic: standard routine evaluation',
    is_red_flag: false,
    mode: 'Rules-Only (Offline)',
    disclaimer: triageRules.disclaimer,
  };
}
