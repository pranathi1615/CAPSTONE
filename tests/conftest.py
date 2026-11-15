"""Pytest configuration and fixtures for CareBridge tests."""

import os
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# Set test environment variables before importing app
os.environ["MONGO_DB_NAME"] = "carebridge_test"
os.environ["ENVIRONMENT"] = "testing"

from app.core.database import close_db, init_db
from app.core.redis import close_redis, init_redis
from app.main import app
from app.modules.identity.models import User
from app.modules.consent.models import Consent
from app.modules.audit.models import AuditLog
from app.modules.appointments.models import DoctorSlot, Booking
from app.modules.notifications.models import MockSMS
from app.modules.chat.models import ChatMessage
from app.modules.clinical.models import ClinicalRecord
from app.modules.prescriptions.models import Prescription
from app.modules.pharmacies.models import Pharmacy
from app.modules.sync.models import SyncReceipt
from app.modules.assisted_visits.models import AssistedVisit
from app.modules.triage.models import TriageEvaluation
from app.modules.async_consults.models import AsyncConsult
from app.modules.followups.models import FollowUp
from app.modules.referrals.models import ReferralNote


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_test_db_and_collections():
    """Initialize database connection per test on active event loop and clean up."""
    await init_db()
    await init_redis()
    await User.delete_all()
    await Consent.delete_all()
    await AuditLog.delete_all()
    await DoctorSlot.delete_all()
    await Booking.delete_all()
    await MockSMS.delete_all()
    await ChatMessage.delete_all()
    await ClinicalRecord.delete_all()
    await Prescription.delete_all()
    await Pharmacy.delete_all()
    await SyncReceipt.delete_all()
    await AssistedVisit.delete_all()
    await TriageEvaluation.delete_all()
    await AsyncConsult.delete_all()
    await FollowUp.delete_all()
    await ReferralNote.delete_all()
    yield
    await User.delete_all()
    await Consent.delete_all()
    await AuditLog.delete_all()
    await DoctorSlot.delete_all()
    await Booking.delete_all()
    await MockSMS.delete_all()
    await ChatMessage.delete_all()
    await ClinicalRecord.delete_all()
    await Prescription.delete_all()
    await Pharmacy.delete_all()
    await SyncReceipt.delete_all()
    await AssistedVisit.delete_all()
    await TriageEvaluation.delete_all()
    await AsyncConsult.delete_all()
    await FollowUp.delete_all()
    await ReferralNote.delete_all()
    await close_redis()
    await close_db()


@pytest_asyncio.fixture(scope="function")
async def client():
    """Async HTTP test client for FastAPI application."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
