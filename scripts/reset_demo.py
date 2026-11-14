"""CareBridge Demo Reset Script (Phases 1-3).

Clears old bookings and past slots, generates fresh open slots for the next 7 days
for all approved doctors, and ensures a clean demo patient with NO bookings exists.
Prints synthetic credentials for all roles.

Usage:
    python scripts/reset_demo.py
"""

import asyncio
from datetime import datetime, timedelta, timezone
import os
import sys

# Ensure backend root is on Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import close_db, init_db
from app.core.redis import close_redis, init_redis
from app.core.security import hash_password
from app.modules.appointments.models import Booking, DoctorSlot
from app.modules.audit.service import append_audit_log
from app.modules.chat.models import ChatMessage, ConsultationModeEvent, VoiceNote
from app.modules.consent.models import Consent
from app.modules.identity.models import DoctorStatus, User, UserRole
from tabulate import tabulate

SEEDED_ACCOUNTS = [
    {
        "role": UserRole.PATIENT,
        "name": "Kavita Verma (Demo Patient - Clean)",
        "email": "patient.demo@carebridge.local",
        "password": "Patient@123",
        "phone": "+919800000010",
        "doctor_status": None,
        "specialty": None,
        "reg_no": None,
        "notes": "Fresh patient with zero bookings. Ready for new booking."
    },
    {
        "role": UserRole.PATIENT,
        "name": "Anita Devi",
        "email": "patient.anita@carebridge.local",
        "password": "Patient@123",
        "phone": "+919800000004",
        "doctor_status": None,
        "specialty": None,
        "reg_no": None,
        "notes": "Patient account for general and localization tests."
    },
    {
        "role": UserRole.DOCTOR,
        "name": "Dr. Rajesh Sharma, MD",
        "email": "dr.sharma@carebridge.local",
        "password": "Doctor@123",
        "phone": "+919800000002",
        "doctor_status": DoctorStatus.APPROVED,
        "specialty": "General Medicine",
        "reg_no": "MCI-2024-9871",
        "notes": "Approved Doctor (General Medicine) with 7 days of open slots."
    },
    {
        "role": UserRole.DOCTOR,
        "name": "Dr. Sunita Rao, MD",
        "email": "dr.cardio@carebridge.local",
        "password": "Doctor@123",
        "phone": "+919800000007",
        "doctor_status": DoctorStatus.APPROVED,
        "specialty": "Cardiology",
        "reg_no": "MCI-2024-5544",
        "notes": "Approved Doctor (Cardiology) with 7 days of open slots."
    },
    {
        "role": UserRole.DOCTOR,
        "name": "Dr. Sneha Patel, MBBS",
        "email": "dr.pending@carebridge.local",
        "password": "Doctor@123",
        "phone": "+919800000003",
        "doctor_status": DoctorStatus.PENDING,
        "specialty": "Pediatrics",
        "reg_no": "MCI-2024-1122",
        "notes": "Pending Doctor (Blocked from booking until Admin approves)."
    },
    {
        "role": UserRole.CHW,
        "name": "Lakshmi Bai (ASHA / CHW)",
        "email": "chw.lakshmi@carebridge.local",
        "password": "Chw@123",
        "phone": "+919800000005",
        "doctor_status": None,
        "specialty": None,
        "reg_no": None,
        "notes": "Community Health Worker (record consent & book on behalf)."
    },
    {
        "role": UserRole.PHARMACY,
        "name": "Apollo Rural Care Pharmacy",
        "email": "pharmacy.apollo@carebridge.local",
        "password": "Pharmacy@123",
        "phone": "+919800000006",
        "doctor_status": None,
        "specialty": None,
        "reg_no": None,
        "notes": "Dispensary portal shell (Phase 4 QR verify preview)."
    },
    {
        "role": UserRole.ADMIN,
        "name": "System Administrator",
        "email": "admin@carebridge.local",
        "password": "Admin@123",
        "phone": "+919800000001",
        "doctor_status": None,
        "specialty": None,
        "reg_no": None,
        "notes": "Admin dashboard (approve pending doctors & verify audit chain)."
    }
]


async def reset_demo():
    print("=" * 80)
    print(" CareBridge Demo Reset: Clearing Old Bookings & Seeding Fresh 7-Day Slots")
    print("=" * 80)

    await init_db()
    await init_redis()

    # 1. Clear old bookings and slots
    bookings_count = await Booking.find_all().count()
    await Booking.find_all().delete()
    print(f"[-] Cleared {bookings_count} old bookings.")

    slots_count = await DoctorSlot.find_all().count()
    await DoctorSlot.find_all().delete()
    print(f"[-] Cleared {slots_count} old availability slots.")

    # 2. Ensure all seeded users exist with proper passwords and status
    created_users = {}
    for acc in SEEDED_ACCOUNTS:
        email = acc["email"].lower()
        user = await User.find_one(User.email == email)
        if not user:
            user = User(
                email=email,
                hashed_password=hash_password(acc["password"]),
                full_name=acc["name"],
                role=acc["role"],
                phone=acc["phone"],
                doctor_status=acc["doctor_status"],
                registration_number=acc["reg_no"],
                specialty=acc["specialty"],
                is_active=True
            )
            await user.insert()
            await append_audit_log(
                event_type="DEMO_USER_CREATED",
                actor_id="demo_reset",
                actor_role="system",
                target_id=user.user_id,
                payload={"email": user.email, "role": user.role.value}
            )
        else:
            # Update attributes to ensure consistency
            user.hashed_password = hash_password(acc["password"])
            user.full_name = acc["name"]
            user.role = acc["role"]
            user.doctor_status = acc["doctor_status"]
            user.specialty = acc["specialty"]
            user.registration_number = acc["reg_no"]
            await user.save()

        created_users[email] = user

    # Also keep any user-registered doctor as approved General Medicine if present
    for extra_email in ["dr.sharma@carebridge.test", "pranathi@gmail.com"]:
        extra_doc = await User.find_one(User.email == extra_email)
        if extra_doc:
            extra_doc.doctor_status = DoctorStatus.APPROVED
            if not extra_doc.specialty:
                extra_doc.specialty = "General Medicine"
            await extra_doc.save()
            created_users[extra_email] = extra_doc

    # 3. Create Consents for patients
    for patient_email in ["patient.demo@carebridge.local", "patient.anita@carebridge.local"]:
        p = created_users.get(patient_email)
        if p:
            existing_consent = await Consent.find_one(Consent.patient_id == p.user_id)
            if not existing_consent:
                c = Consent(
                    patient_id=p.user_id,
                    purpose="teleconsultation",
                    granted_by=p.user_id,
                    granted_by_role="patient"
                )
                await c.insert()

    # 4. Generate fresh open slots for the NEXT 7 DAYS for every approved doctor
    now = datetime.now(timezone.utc)
    approved_docs = await User.find(
        User.role == UserRole.DOCTOR,
        User.doctor_status == DoctorStatus.APPROVED
    ).to_list()

    total_slots = 0
    for doc in approved_docs:
        # Generate slots for today and next 6 days
        for day_offset in range(7):
            target_date = (now + timedelta(days=day_offset)).date()
            # Morning sessions: 09:00 to 13:00 UTC (8 slots)
            # Afternoon sessions: 14:00 to 18:00 UTC (8 slots)
            for hour in [9, 10, 11, 12, 14, 15, 16, 17]:
                for minute in [0, 30]:
                    slot_start = datetime(
                        target_date.year, target_date.month, target_date.day,
                        hour, minute, tzinfo=timezone.utc
                    )
                    slot_end = slot_start + timedelta(minutes=25)

                    if slot_start > now:
                        slot = DoctorSlot(
                            doctor_id=doc.user_id,
                            doctor_name=doc.full_name,
                            specialty=doc.specialty,
                            slot_start=slot_start,
                            slot_end=slot_end,
                            is_booked=False
                        )
                        await slot.insert()
                        total_slots += 1

    print(f"[+] Successfully generated {total_slots} fresh unbooked slots across 7 days for {len(approved_docs)} approved doctors.")

    # 5. Print Credentials Table
    table_data = []
    for acc in SEEDED_ACCOUNTS:
        status_display = acc["doctor_status"].value if acc["doctor_status"] else "Active"
        table_data.append([
            acc["role"].value.upper(),
            acc["name"],
            acc["email"],
            acc["password"],
            status_display,
            acc["notes"]
        ])

    print("\n" + "=" * 80)
    print(" CareBridge Synthetic Demo Accounts & Credentials")
    print("=" * 80)
    print(tabulate(
        table_data,
        headers=["Role", "Full Name", "Email (Username)", "Password", "Status", "Description / Viva Note"],
        tablefmt="grid"
    ))
    print("\n[✔] Ready for manual testing! Log in as patient.demo@carebridge.local to book any slot.")

    await close_redis()
    await close_db()


if __name__ == "__main__":
    asyncio.run(reset_demo())
