"""Service layer for Clinical Referral Notes and PDF Generation (Phase 6)."""

from datetime import datetime, timezone
import io
import json
import logging
import os
from typing import Any, Dict, List
from fastapi import HTTPException, status
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.modules.audit.service import append_audit_log
from app.modules.identity.models import User
from app.modules.referrals.models import ReferralNote
from app.modules.referrals.schemas import CreateReferralRequest, ReferralResponse

logger = logging.getLogger("carebridge.referrals")

FACILITIES_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "core", "emergency_facilities.json")
)


def load_facilities_dict() -> Dict[str, Any]:
    try:
        with open(FACILITIES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.error("Failed loading facilities: %s", exc)
        return {"facilities": []}


def referral_to_response(r: ReferralNote) -> ReferralResponse:
    return ReferralResponse(
        referral_id=r.referral_id,
        patient_id=r.patient_id,
        patient_name=r.patient_name,
        patient_phone=r.patient_phone,
        referred_by_name=r.referred_by_name,
        referred_by_role=r.referred_by_role,
        facility_name=r.facility_name,
        facility_address=r.facility_address,
        facility_phone=r.facility_phone,
        urgency=r.urgency,
        clinical_summary=r.clinical_summary,
        vitals=r.vitals,
        transport_mode=r.transport_mode,
        download_pdf_url=f"/referrals/{r.referral_id}/pdf",
        created_at=r.created_at,
    )


async def create_referral_note(data: CreateReferralRequest, actor: User) -> ReferralResponse:
    patient = await User.find_one(User.user_id == data.patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target patient not found.")

    fac_data = load_facilities_dict()
    matched_facility = next((f for f in fac_data.get("facilities", []) if f["id"] == data.facility_id), None)
    if not matched_facility:
        # Default fallback facility if custom ID provided
        matched_facility = {
            "id": data.facility_id,
            "name": "District Area Government Hospital (MOCK)",
            "address": "Collectorate Complex, Medak, Telangana",
            "emergency_phone": "+91-40-23456789"
        }

    now = datetime.now(timezone.utc)
    note = ReferralNote(
        patient_id=patient.user_id,
        patient_name=patient.full_name,
        patient_phone=patient.phone,
        referred_by=actor.user_id,
        referred_by_name=actor.full_name,
        referred_by_role=actor.role.value,
        facility_id=matched_facility["id"],
        facility_name=matched_facility["name"],
        facility_address=matched_facility["address"],
        facility_phone=matched_facility.get("emergency_phone", "+91-40-23456789"),
        urgency=data.urgency,
        clinical_summary=data.clinical_summary,
        vitals=data.vitals,
        red_flags_identified=data.red_flags_identified,
        transport_mode=data.transport_mode,
        created_at=now,
    )
    await note.insert()

    # Append audit trail
    await append_audit_log(
        event_type="REFERRAL_NOTE_GENERATED",
        actor_id=actor.user_id,
        actor_role=actor.role.value,
        target_id=note.referral_id,
        payload={
            "patient_id": patient.user_id,
            "facility_id": note.facility_id,
            "urgency": note.urgency
        }
    )

    return referral_to_response(note)


def generate_referral_pdf(referral: ReferralNote) -> bytes:
    """Renders a clinical referral document into PDF bytes using ReportLab."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "RefTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0284c7"),
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "RefSub",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=12,
    )
    urgency_style = ParagraphStyle(
        "RefUrg",
        parent=styles["Heading2"],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#be123c") if referral.urgency == "emergency" else colors.HexColor("#b45309"),
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "RefBody",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6,
    )

    story = []

    # Header
    story.append(Paragraph("CareBridge Telemedicine Platform", title_style))
    story.append(Paragraph("CLINICAL PATIENT TRANSFER & EMERGENCY REFERRAL NOTE", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0284c7"), spaceAfter=10))

    # Urgency Banner
    urg_text = f"<b>TRANSFER PRIORITY: {referral.urgency.upper()}</b> | Transport: {referral.transport_mode or 'Ambulance 108'}"
    story.append(Paragraph(urg_text, urgency_style))
    story.append(Spacer(1, 6))

    # Referral Meta Grid
    created_str = referral.created_at.strftime("%d %b %Y, %H:%M UTC")
    meta_data = [
        [
            Paragraph("<b>Patient Name:</b> " + referral.patient_name, body_style),
            Paragraph("<b>Referral ID:</b> " + referral.referral_id[:13] + "...", body_style),
        ],
        [
            Paragraph("<b>Patient Phone:</b> " + (referral.patient_phone or "N/A"), body_style),
            Paragraph("<b>Generated Date:</b> " + created_str, body_style),
        ],
        [
            Paragraph("<b>Referring Clinician:</b> " + f"{referral.referred_by_name} ({referral.referred_by_role.upper()})", body_style),
            Paragraph("<b>Target Facility:</b> " + referral.facility_name, body_style),
        ],
        [
            Paragraph("<b>Facility Address:</b> " + referral.facility_address, body_style),
            Paragraph("<b>Emergency Phone:</b> " + referral.facility_phone, body_style),
        ]
    ]

    t = Table(meta_data, colWidths=[270, 270])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 14))

    # Clinical Summary
    story.append(Paragraph("<b>Clinical Presentation & Reason for Referral:</b>", body_style))
    story.append(Paragraph(referral.clinical_summary, body_style))
    story.append(Spacer(1, 10))

    # Vitals table if present
    if referral.vitals and isinstance(referral.vitals, dict):
        v = referral.vitals
        v_rows = [["Vital Sign", "Recorded Value"]]
        if "systolic_bp" in v and "diastolic_bp" in v:
            v_rows.append(["Blood Pressure", f"{v['systolic_bp']} / {v['diastolic_bp']} mmHg"])
        if "spo2" in v:
            v_rows.append(["Oxygen Saturation (SpO2)", f"{v['spo2']} %"])
        if "pulse" in v:
            v_rows.append(["Pulse Rate", f"{v['pulse']} bpm"])
        if "temperature_c" in v:
            v_rows.append(["Temperature", f"{v['temperature_c']} °C"])
        if "blood_glucose_mg_dl" in v:
            v_rows.append(["Blood Glucose", f"{v['blood_glucose_mg_dl']} mg/dL"])

        if len(v_rows) > 1:
            story.append(Paragraph("<b>Recorded Vital Signs at Handover:</b>", body_style))
            vt = Table(v_rows, colWidths=[200, 200])
            vt.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#e0f2fe")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#0369a1")),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#bae6fd")),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e0f2fe")),
            ]))
            story.append(vt)
            story.append(Spacer(1, 14))

    # Red flags identified
    if referral.red_flags_identified:
        story.append(Paragraph(f"<b>Red-Flags Identified:</b> {referral.red_flags_identified}", urgency_style))
        story.append(Spacer(1, 10))

    # Disclaimer Footer
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cbd5e1"), spaceAfter=8))
    footer_text = "<b>MOCK REFERRAL NOTE (CAPSTONE PURPOSES):</b> Standard clinical triage handover for emergency response. This document provides transfer continuity to receiving emergency hospital staff."
    story.append(Paragraph(footer_text, ParagraphStyle("RefFooter", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#94a3b8"))))

    doc.build(story)
    return buffer.getvalue()
