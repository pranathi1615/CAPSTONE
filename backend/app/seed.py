"""CareBridge Seed Script (Phase 1 & 2).

Seeds synthetic accounts for every role:
- Admin
- Approved Doctor (with availability slots)
- Pending Doctor (Awaiting verification)
- Patient (with active booking & consent)
- Community Health Worker (CHW)
- Pharmacy
- MOCK SMS notifications

Run directly via:
    python -m app.seed
"""

import asyncio
from datetime import datetime, timedelta, timezone
import logging
from tabulate import tabulate

from app.core.database import close_db, init_db
from app.core.redis import close_redis, init_redis
from app.core.security import hash_password
from app.modules.appointments.models import Booking, BookingStatus, DoctorSlot
from app.modules.audit.service import append_audit_log
from app.modules.consent.models import Consent
from app.modules.identity.models import DoctorStatus, User, UserRole
from app.modules.notifications.service import MockSMSProvider

logging.basicConfig(level=logging.WARNING)

SEED_USERS = [
    {
        "email": "admin@carebridge.local",
        "password": "Admin@123",
        "full_name": "System Administrator",
        "role": UserRole.ADMIN,
        "phone": "+919800000001",
        "doctor_status": None,
        "registration_number": None,
        "specialty": None,
    },
    {
        "email": "dr.sharma@carebridge.local",
        "password": "Doctor@123",
        "full_name": "Dr. Rajesh Sharma, MD",
        "role": UserRole.DOCTOR,
        "phone": "+919800000002",
        "doctor_status": DoctorStatus.APPROVED,
        "registration_number": "MCI-2024-9871",
        "specialty": "Cardiology",
    },
    {
        "email": "dr.pending@carebridge.local",
        "password": "Doctor@123",
        "full_name": "Dr. Sneha Patel, MBBS",
        "role": UserRole.DOCTOR,
        "phone": "+919800000003",
        "doctor_status": DoctorStatus.PENDING,
        "registration_number": "MCI-2024-1122",
        "specialty": "General Medicine",
    },
    {
        "email": "patient.anita@carebridge.local",
        "password": "Patient@123",
        "full_name": "Anita Devi",
        "role": UserRole.PATIENT,
        "phone": "+919800000004",
        "doctor_status": None,
        "registration_number": None,
        "specialty": None,
    },
    {
        "email": "chw.lakshmi@carebridge.local",
        "password": "Chw@123",
        "full_name": "Lakshmi Bai (ASHA / CHW)",
        "role": UserRole.CHW,
        "phone": "+919800000005",
        "doctor_status": None,
        "registration_number": None,
        "specialty": None,
    },
    {
        "email": "pharmacy.apollo@carebridge.local",
        "password": "Pharmacy@123",
        "full_name": "Apollo Rural Care Pharmacy",
        "role": UserRole.PHARMACY,
        "phone": "+919800000006",
        "doctor_status": None,
        "registration_number": None,
        "specialty": None,
    }
]


async def seed() -> None:
    print("\n" + "=" * 70)
    print(" CareBridge Phase 1 & 2 Synthetic Data Seed Script")
    print("=" * 70)

    await init_db()
    await init_redis()

    seeded_table = []
    created_patient = None
    created_doctor = None

    for item in SEED_USERS:
        email = item["email"].lower()
        existing = await User.find_one(User.email == email)
        if not existing:
            user = User(
                email=email,
                hashed_password=hash_password(item["password"]),
                full_name=item["full_name"],
                role=item["role"],
                phone=item["phone"],
                doctor_status=item["doctor_status"],
                registration_number=item["registration_number"],
                specialty=item["specialty"],
                is_active=True
            )
            await user.insert()

            await append_audit_log(
                event_type="SEED_USER_CREATED",
                actor_id="system_seed",
                actor_role="system",
                target_id=user.user_id,
                payload={
                    "email": user.email,
                    "role": user.role.value,
                    "doctor_status": user.doctor_status.value if user.doctor_status else None
                }
            )
            created_user = user
        else:
            created_user = existing

        if item["role"] == UserRole.PATIENT:
            created_patient = created_user
        if item["email"] == "dr.sharma@carebridge.local":
            created_doctor = created_user

        status_str = created_user.doctor_status.value if created_user.doctor_status else "active"
        reg_str = created_user.registration_number or "-"
        seeded_table.append([
            item["role"].value.upper(),
            item["full_name"],
            item["email"],
            item["password"],
            status_str,
            reg_str
        ])

    # Seed an initial sample consent for the patient if none exists
    if created_patient:
        existing_consent = await Consent.find_one(Consent.patient_id == created_patient.user_id)
        if not existing_consent:
            consent = Consent(
                patient_id=created_patient.user_id,
                purpose="teleconsultation",
                granted_by=created_patient.user_id,
                granted_by_role="patient"
            )
            await consent.insert()
            await append_audit_log(
                event_type="SEED_CONSENT_CREATED",
                actor_id=created_patient.user_id,
                actor_role="patient",
                target_id=created_patient.user_id,
                payload={"consent_id": consent.consent_id, "purpose": consent.purpose}
            )

    # Seed Doctor availability slots for Dr. Sharma
    if created_doctor:
        now = datetime.now(timezone.utc)
        existing_slots = await DoctorSlot.find(DoctorSlot.doctor_id == created_doctor.user_id).count()
        if existing_slots == 0:
            for i in range(1, 5):
                slot_start = now + timedelta(hours=i)
                slot_end = slot_start + timedelta(minutes=30)
                slot = DoctorSlot(
                    doctor_id=created_doctor.user_id,
                    doctor_name=created_doctor.full_name,
                    specialty=created_doctor.specialty,
                    slot_start=slot_start,
                    slot_end=slot_end,
                    is_booked=(i == 1)  # First slot is booked for sample
                )
                await slot.insert()

        # Seed or reset sample booking for Anita Devi with Dr. Sharma
        if created_patient:
            first_slot_start = now + timedelta(hours=1)
            first_slot_end = first_slot_start + timedelta(minutes=30)
            existing_booking = await Booking.find_one(
                Booking.patient_id == created_patient.user_id,
                Booking.doctor_id == created_doctor.user_id
            )
            if existing_booking:
                existing_booking.status = BookingStatus.BOOKED
                existing_booking.joined_waiting_at = None
                existing_booking.call_started_at = None
                existing_booking.call_ended_at = None
                existing_booking.slot_start = first_slot_start
                existing_booking.slot_end = first_slot_end
                await existing_booking.save()
            else:
                booking = Booking(
                    patient_id=created_patient.user_id,
                    patient_name=created_patient.full_name,
                    patient_phone=created_patient.phone,
                    doctor_id=created_doctor.user_id,
                    doctor_name=created_doctor.full_name,
                    doctor_specialty=created_doctor.specialty,
                    booked_by=created_patient.user_id,
                    booked_by_role="patient",
                    slot_start=first_slot_start,
                    slot_end=first_slot_end,
                    status=BookingStatus.BOOKED,
                    consultation_room_id="room-anita-sharma-demo"
                )
                await booking.insert()

                # Dispatch synthetic MOCK SMS
                await MockSMSProvider.send_sms(
                    recipient_phone=created_patient.phone or "+919800000004",
                    recipient_name=created_patient.full_name,
                    message=f"Your consultation with Dr. Rajesh Sharma is confirmed for {first_slot_start.strftime('%d %b %Y at %H:%M UTC')}.",
                    event_type="BOOKING_CONFIRMED"
                )

    headers = ["Role", "Full Name", "Email (Login)", "Password", "Status", "Reg No."]
    print("\n" + tabulate(seeded_table, headers=headers, tablefmt="grid"))
    print("\n[+] Database seeded successfully with synthetic credentials, doctor slots & mock SMS.\n")

    await close_redis()
    await close_db()


if __name__ == "__main__":
    asyncio.run(seed())
