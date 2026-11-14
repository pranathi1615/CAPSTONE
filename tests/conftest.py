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
    yield
    await User.delete_all()
    await Consent.delete_all()
    await AuditLog.delete_all()
    await DoctorSlot.delete_all()
    await Booking.delete_all()
    await MockSMS.delete_all()
    await ChatMessage.delete_all()
    await close_redis()
    await close_db()


@pytest_asyncio.fixture(scope="function")
async def client():
    """Async HTTP test client for FastAPI application."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
