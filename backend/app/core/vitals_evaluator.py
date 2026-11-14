"""Configurable clinical vitals evaluator with out-of-range flag detection.

NOTE FOR CLINICAL VIVA / AUDIT:
Default ranges are sample thresholds requiring clinical validation by a licensed
medical practitioner before real-world field deployment.
"""

import json
import os
from typing import Any, Dict, List, Optional

RANGES_FILE = os.path.join(os.path.dirname(__file__), "vitals_ranges.json")

def load_vitals_ranges() -> Dict[str, Any]:
    """Load configurable clinical vitals ranges from JSON file."""
    if os.path.exists(RANGES_FILE):
        with open(RANGES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def evaluate_vitals_data(vitals: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate raw vitals data against configurable thresholds.
    
    Returns:
        {
            "is_out_of_range": bool,
            "flags": List[Dict[str, Any]],
            "evaluated_vitals": Dict[str, Any]
        }
    """
    ranges = load_vitals_ranges()
    flags: List[Dict[str, Any]] = []

    # 1. Blood Pressure: Systolic & Diastolic
    bp_ranges = ranges.get("blood_pressure", {})
    systolic = vitals.get("systolic") or vitals.get("bp_systolic")
    diastolic = vitals.get("diastolic") or vitals.get("bp_diastolic")

    if systolic is not None:
        try:
            sys_val = float(systolic)
            sys_cfg = bp_ranges.get("systolic", {})
            if sys_val >= sys_cfg.get("critical_high", 180):
                flags.append({
                    "field": "systolic",
                    "flag": "HYPERTENSIVE_CRISIS",
                    "level": "critical",
                    "value": sys_val,
                    "unit": "mmHg",
                    "message": f"Critical Systolic BP {sys_val} mmHg (≥{sys_cfg.get('critical_high')} mmHg)"
                })
            elif sys_val > sys_cfg.get("stage1_max", 140):
                flags.append({
                    "field": "systolic",
                    "flag": "HIGH_BP_STAGE2",
                    "level": "warning",
                    "value": sys_val,
                    "unit": "mmHg",
                    "message": f"High Systolic BP {sys_val} mmHg (>140 mmHg)"
                })
            elif sys_val > sys_cfg.get("normal_max", 120):
                flags.append({
                    "field": "systolic",
                    "flag": "PREHYPERTENSION",
                    "level": "caution",
                    "value": sys_val,
                    "unit": "mmHg",
                    "message": f"Elevated Systolic BP {sys_val} mmHg (>120 mmHg)"
                })
            elif sys_val < sys_cfg.get("critical_low", 80):
                flags.append({
                    "field": "systolic",
                    "flag": "CRITICAL_HYPOTENSION",
                    "level": "critical",
                    "value": sys_val,
                    "unit": "mmHg",
                    "message": f"Critical Low Systolic BP {sys_val} mmHg (<80 mmHg)"
                })
            elif sys_val < sys_cfg.get("normal_min", 90):
                flags.append({
                    "field": "systolic",
                    "flag": "HYPOTENSION",
                    "level": "warning",
                    "value": sys_val,
                    "unit": "mmHg",
                    "message": f"Low Systolic BP {sys_val} mmHg (<90 mmHg)"
                })
        except (ValueError, TypeError):
            pass

    if diastolic is not None:
        try:
            dia_val = float(diastolic)
            dia_cfg = bp_ranges.get("diastolic", {})
            if dia_val >= dia_cfg.get("critical_high", 120):
                flags.append({
                    "field": "diastolic",
                    "flag": "HYPERTENSIVE_CRISIS_DIASTOLIC",
                    "level": "critical",
                    "value": dia_val,
                    "unit": "mmHg",
                    "message": f"Critical Diastolic BP {dia_val} mmHg (≥{dia_cfg.get('critical_high')} mmHg)"
                })
            elif dia_val > sys_cfg.get("stage1_max", 90):
                flags.append({
                    "field": "diastolic",
                    "flag": "HIGH_DIASTOLIC_BP",
                    "level": "warning",
                    "value": dia_val,
                    "unit": "mmHg",
                    "message": f"High Diastolic BP {dia_val} mmHg (>90 mmHg)"
                })
            elif dia_val < dia_cfg.get("critical_low", 50):
                flags.append({
                    "field": "diastolic",
                    "flag": "CRITICAL_LOW_DIASTOLIC",
                    "level": "critical",
                    "value": dia_val,
                    "unit": "mmHg",
                    "message": f"Critical Low Diastolic BP {dia_val} mmHg (<50 mmHg)"
                })
        except (ValueError, TypeError):
            pass

    # 2. Blood Sugar
    sugar_ranges = ranges.get("blood_sugar", {})
    sugar = vitals.get("blood_sugar") or vitals.get("glucose")
    if sugar is not None:
        try:
            s_val = float(sugar)
            if s_val >= sugar_ranges.get("critical_high", 250):
                flags.append({
                    "field": "blood_sugar",
                    "flag": "CRITICAL_HYPERGLYCEMIA",
                    "level": "critical",
                    "value": s_val,
                    "unit": "mg/dL",
                    "message": f"Critical High Blood Sugar {s_val} mg/dL (≥250 mg/dL)"
                })
            elif s_val >= sugar_ranges.get("high_alert", 180):
                flags.append({
                    "field": "blood_sugar",
                    "flag": "HIGH_BLOOD_SUGAR",
                    "level": "warning",
                    "value": s_val,
                    "unit": "mg/dL",
                    "message": f"Elevated Blood Sugar {s_val} mg/dL (≥180 mg/dL)"
                })
            elif s_val <= sugar_ranges.get("critical_low", 54):
                flags.append({
                    "field": "blood_sugar",
                    "flag": "CRITICAL_HYPOGLYCEMIA",
                    "level": "critical",
                    "value": s_val,
                    "unit": "mg/dL",
                    "message": f"Critical Low Blood Sugar {s_val} mg/dL (≤54 mg/dL)"
                })
            elif s_val < sugar_ranges.get("low_alert", 70):
                flags.append({
                    "field": "blood_sugar",
                    "flag": "LOW_BLOOD_SUGAR",
                    "level": "warning",
                    "value": s_val,
                    "unit": "mg/dL",
                    "message": f"Low Blood Sugar {s_val} mg/dL (<70 mg/dL)"
                })
        except (ValueError, TypeError):
            pass

    # 3. SpO2 Oxygen Saturation
    spo2_ranges = ranges.get("spo2", {})
    spo2 = vitals.get("spo2") or vitals.get("oxygen_saturation")
    if spo2 is not None:
        try:
            sp_val = float(spo2)
            if sp_val < spo2_ranges.get("critical_low", 90):
                flags.append({
                    "field": "spo2",
                    "flag": "CRITICAL_HYPOXIA",
                    "level": "critical",
                    "value": sp_val,
                    "unit": "%",
                    "message": f"Critical Low SpO2 {sp_val}% (<90%) - Supplemental O2 required"
                })
            elif sp_val < spo2_ranges.get("low_alert", 94):
                flags.append({
                    "field": "spo2",
                    "flag": "LOW_SPO2",
                    "level": "warning",
                    "value": sp_val,
                    "unit": "%",
                    "message": f"Low SpO2 {sp_val}% (<94%)"
                })
        except (ValueError, TypeError):
            pass

    # 4. Temperature
    temp_ranges = ranges.get("temperature", {})
    temp = vitals.get("temperature")
    if temp is not None:
        try:
            t_val = float(temp)
            if t_val >= temp_ranges.get("critical_high", 40.0):
                flags.append({
                    "field": "temperature",
                    "flag": "HYPERPYREXIA",
                    "level": "critical",
                    "value": t_val,
                    "unit": "°C",
                    "message": f"Dangerously High Temperature {t_val}°C (≥40.0°C)"
                })
            elif t_val >= temp_ranges.get("high_fever", 38.5):
                flags.append({
                    "field": "temperature",
                    "flag": "HIGH_FEVER",
                    "level": "warning",
                    "value": t_val,
                    "unit": "°C",
                    "message": f"High Fever {t_val}°C (≥38.5°C)"
                })
            elif t_val >= temp_ranges.get("fever", 37.5):
                flags.append({
                    "field": "temperature",
                    "flag": "FEVER",
                    "level": "caution",
                    "value": t_val,
                    "unit": "°C",
                    "message": f"Fever {t_val}°C (≥37.5°C)"
                })
            elif t_val < temp_ranges.get("critical_low", 35.0):
                flags.append({
                    "field": "temperature",
                    "flag": "HYPOTHERMIA",
                    "level": "critical",
                    "value": t_val,
                    "unit": "°C",
                    "message": f"Hypothermia {t_val}°C (<35.0°C)"
                })
        except (ValueError, TypeError):
            pass

    # 5. Pulse / Heart Rate
    pulse_ranges = ranges.get("pulse", {})
    pulse = vitals.get("pulse") or vitals.get("pulse_rate")
    if pulse is not None:
        try:
            p_val = float(pulse)
            if p_val >= pulse_ranges.get("critical_high", 140):
                flags.append({
                    "field": "pulse",
                    "flag": "CRITICAL_TACHYCARDIA",
                    "level": "critical",
                    "value": p_val,
                    "unit": "bpm",
                    "message": f"Critical Tachycardia {p_val} bpm (≥140 bpm)"
                })
            elif p_val > pulse_ranges.get("tachycardia", 100):
                flags.append({
                    "field": "pulse",
                    "flag": "TACHYCARDIA",
                    "level": "warning",
                    "value": p_val,
                    "unit": "bpm",
                    "message": f"Tachycardia {p_val} bpm (>100 bpm)"
                })
            elif p_val <= pulse_ranges.get("critical_low", 45):
                flags.append({
                    "field": "pulse",
                    "flag": "CRITICAL_BRADYCARDIA",
                    "level": "critical",
                    "value": p_val,
                    "unit": "bpm",
                    "message": f"Critical Bradycardia {p_val} bpm (≤45 bpm)"
                })
            elif p_val < pulse_ranges.get("bradycardia", 60):
                flags.append({
                    "field": "pulse",
                    "flag": "BRADYCARDIA",
                    "level": "warning",
                    "value": p_val,
                    "unit": "bpm",
                    "message": f"Bradycardia {p_val} bpm (<60 bpm)"
                })
        except (ValueError, TypeError):
            pass

    return {
        "is_out_of_range": len(flags) > 0,
        "flags": flags,
        "raw_vitals": vitals
    }
