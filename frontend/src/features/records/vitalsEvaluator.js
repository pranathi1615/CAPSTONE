/**
 * Configurable clinical vitals evaluator with out-of-range flag detection for CareBridge frontend.
 *
 * NOTE FOR CLINICAL AUDIT / VIVA:
 * Default ranges are sample thresholds requiring clinical validation by a licensed
 * medical practitioner before real-world field deployment.
 */

import vitalsRanges from './vitalsRanges.json';

export function evaluateVitalsOffline(vitals = {}) {
  const flags = [];
  const ranges = vitalsRanges;

  const systolic = vitals.systolic || vitals.bp_systolic;
  const diastolic = vitals.diastolic || vitals.bp_diastolic;
  const sugar = vitals.blood_sugar || vitals.glucose;
  const spo2 = vitals.spo2 || vitals.oxygen_saturation;
  const temp = vitals.temperature;
  const pulse = vitals.pulse || vitals.pulse_rate;

  // 1. Blood Pressure: Systolic
  if (systolic !== undefined && systolic !== '' && !isNaN(Number(systolic))) {
    const sys = Number(systolic);
    const cfg = ranges.blood_pressure?.systolic || {};
    if (sys >= (cfg.critical_high || 180)) {
      flags.push({
        field: 'systolic',
        flag: 'HYPERTENSIVE_CRISIS',
        level: 'critical',
        value: sys,
        unit: 'mmHg',
        message: `Critical Systolic BP ${sys} mmHg (≥${cfg.critical_high || 180} mmHg)`,
      });
    } else if (sys > (cfg.stage1_max || 140)) {
      flags.push({
        field: 'systolic',
        flag: 'HIGH_BP_STAGE2',
        level: 'warning',
        value: sys,
        unit: 'mmHg',
        message: `High Systolic BP ${sys} mmHg (>140 mmHg)`,
      });
    } else if (sys > (cfg.normal_max || 120)) {
      flags.push({
        field: 'systolic',
        flag: 'PREHYPERTENSION',
        level: 'caution',
        value: sys,
        unit: 'mmHg',
        message: `Elevated Systolic BP ${sys} mmHg (>120 mmHg)`,
      });
    } else if (sys < (cfg.critical_low || 80)) {
      flags.push({
        field: 'systolic',
        flag: 'CRITICAL_HYPOTENSION',
        level: 'critical',
        value: sys,
        unit: 'mmHg',
        message: `Critical Low Systolic BP ${sys} mmHg (<80 mmHg)`,
      });
    } else if (sys < (cfg.normal_min || 90)) {
      flags.push({
        field: 'systolic',
        flag: 'HYPOTENSION',
        level: 'warning',
        value: sys,
        unit: 'mmHg',
        message: `Low Systolic BP ${sys} mmHg (<90 mmHg)`,
      });
    }
  }

  // 2. Blood Pressure: Diastolic
  if (diastolic !== undefined && diastolic !== '' && !isNaN(Number(diastolic))) {
    const dia = Number(diastolic);
    const cfg = ranges.blood_pressure?.diastolic || {};
    if (dia >= (cfg.critical_high || 120)) {
      flags.push({
        field: 'diastolic',
        flag: 'HYPERTENSIVE_CRISIS_DIASTOLIC',
        level: 'critical',
        value: dia,
        unit: 'mmHg',
        message: `Critical Diastolic BP ${dia} mmHg (≥${cfg.critical_high || 120} mmHg)`,
      });
    } else if (dia > (cfg.stage1_max || 90)) {
      flags.push({
        field: 'diastolic',
        flag: 'HIGH_DIASTOLIC_BP',
        level: 'warning',
        value: dia,
        unit: 'mmHg',
        message: `High Diastolic BP ${dia} mmHg (>90 mmHg)`,
      });
    } else if (dia < (cfg.critical_low || 50)) {
      flags.push({
        field: 'diastolic',
        flag: 'CRITICAL_LOW_DIASTOLIC',
        level: 'critical',
        value: dia,
        unit: 'mmHg',
        message: `Critical Low Diastolic BP ${dia} mmHg (<50 mmHg)`,
      });
    }
  }

  // 3. Blood Sugar
  if (sugar !== undefined && sugar !== '' && !isNaN(Number(sugar))) {
    const s = Number(sugar);
    const cfg = ranges.blood_sugar || {};
    if (s >= (cfg.critical_high || 250)) {
      flags.push({
        field: 'blood_sugar',
        flag: 'CRITICAL_HYPERGLYCEMIA',
        level: 'critical',
        value: s,
        unit: 'mg/dL',
        message: `Critical High Blood Sugar ${s} mg/dL (≥250 mg/dL)`,
      });
    } else if (s >= (cfg.high_alert || 180)) {
      flags.push({
        field: 'blood_sugar',
        flag: 'HIGH_BLOOD_SUGAR',
        level: 'warning',
        value: s,
        unit: 'mg/dL',
        message: `Elevated Blood Sugar ${s} mg/dL (≥180 mg/dL)`,
      });
    } else if (s <= (cfg.critical_low || 54)) {
      flags.push({
        field: 'blood_sugar',
        flag: 'CRITICAL_HYPOGLYCEMIA',
        level: 'critical',
        value: s,
        unit: 'mg/dL',
        message: `Critical Low Blood Sugar ${s} mg/dL (≤54 mg/dL)`,
      });
    } else if (s < (cfg.low_alert || 70)) {
      flags.push({
        field: 'blood_sugar',
        flag: 'LOW_BLOOD_SUGAR',
        level: 'warning',
        value: s,
        unit: 'mg/dL',
        message: `Low Blood Sugar ${s} mg/dL (<70 mg/dL)`,
      });
    }
  }

  // 4. SpO2 Oxygen Saturation
  if (spo2 !== undefined && spo2 !== '' && !isNaN(Number(spo2))) {
    const sp = Number(spo2);
    const cfg = ranges.spo2 || {};
    if (sp < (cfg.critical_low || 90)) {
      flags.push({
        field: 'spo2',
        flag: 'CRITICAL_HYPOXIA',
        level: 'critical',
        value: sp,
        unit: '%',
        message: `Critical Low SpO2 ${sp}% (<90%) - Oxygen support recommended`,
      });
    } else if (sp < (cfg.low_alert || 94)) {
      flags.push({
        field: 'spo2',
        flag: 'LOW_SPO2',
        level: 'warning',
        value: sp,
        unit: '%',
        message: `Low SpO2 ${sp}% (<94%)`,
      });
    }
  }

  // 5. Temperature
  if (temp !== undefined && temp !== '' && !isNaN(Number(temp))) {
    const t = Number(temp);
    const cfg = ranges.temperature || {};
    if (t >= (cfg.critical_high || 40.0)) {
      flags.push({
        field: 'temperature',
        flag: 'HYPERPYREXIA',
        level: 'critical',
        value: t,
        unit: '°C',
        message: `Dangerously High Temperature ${t}°C (≥40.0°C)`,
      });
    } else if (t >= (cfg.high_fever || 38.5)) {
      flags.push({
        field: 'temperature',
        flag: 'HIGH_FEVER',
        level: 'warning',
        value: t,
        unit: '°C',
        message: `High Fever ${t}°C (≥38.5°C)`,
      });
    } else if (t >= (cfg.fever || 37.5)) {
      flags.push({
        field: 'temperature',
        flag: 'FEVER',
        level: 'caution',
        value: t,
        unit: '°C',
        message: `Fever ${t}°C (≥37.5°C)`,
      });
    } else if (t < (cfg.critical_low || 35.0)) {
      flags.push({
        field: 'temperature',
        flag: 'HYPOTHERMIA',
        level: 'critical',
        value: t,
        unit: '°C',
        message: `Hypothermia ${t}°C (<35.0°C)`,
      });
    }
  }

  // 6. Pulse / Heart Rate
  if (pulse !== undefined && pulse !== '' && !isNaN(Number(pulse))) {
    const p = Number(pulse);
    const cfg = ranges.pulse || {};
    if (p >= (cfg.critical_high || 140)) {
      flags.push({
        field: 'pulse',
        flag: 'CRITICAL_TACHYCARDIA',
        level: 'critical',
        value: p,
        unit: 'bpm',
        message: `Critical Tachycardia ${p} bpm (≥140 bpm)`,
      });
    } else if (p > (cfg.tachycardia || 100)) {
      flags.push({
        field: 'pulse',
        flag: 'TACHYCARDIA',
        level: 'warning',
        value: p,
        unit: 'bpm',
        message: `Tachycardia ${p} bpm (>100 bpm)`,
      });
    } else if (p <= (cfg.critical_low || 45)) {
      flags.push({
        field: 'pulse',
        flag: 'CRITICAL_BRADYCARDIA',
        level: 'critical',
        value: p,
        unit: 'bpm',
        message: `Critical Bradycardia ${p} bpm (≤45 bpm)`,
      });
    } else if (p < (cfg.bradycardia || 60)) {
      flags.push({
        field: 'pulse',
        flag: 'BRADYCARDIA',
        level: 'warning',
        value: p,
        unit: 'bpm',
        message: `Bradycardia ${p} bpm (<60 bpm)`,
      });
    }
  }

  return {
    is_out_of_range: flags.length > 0,
    flags,
  };
}
