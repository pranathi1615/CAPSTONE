"""MongoDB connection and Beanie ODM initialization.

Initializes the Motor async client, registers Beanie document models,
and automatically builds indexes at startup.
"""

import logging
from typing import Optional
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.modules.identity.models import User
from app.modules.consent.models import Consent
from app.modules.audit.models import AuditLog
from app.modules.notifications.models import MockSMS
from app.modules.appointments.models import DoctorSlot, Booking
from app.modules.chat.models import ChatMessage, ConsultationModeEvent, VoiceNote, RoomCounter
from app.modules.clinical.models import ClinicalRecord
from app.modules.prescriptions.models import Prescription
from app.modules.pharmacies.models import Pharmacy

logger = logging.getLogger(__name__)

mongo_client: Optional[AsyncIOMotorClient] = None


async def init_db() -> None:
    """Connect to MongoDB and initialize Beanie ODM with all document models."""
    global mongo_client
    logger.info("Connecting to MongoDB at %s (db: %s)...", settings.MONGO_URI, settings.MONGO_DB_NAME)
    mongo_client = AsyncIOMotorClient(
        settings.MONGO_URI,
        serverSelectionTimeoutMS=5000,
        uuidRepresentation="standard"
    )
    db = mongo_client[settings.MONGO_DB_NAME]

    # Initialize Beanie with document models
    await init_beanie(
        database=db,
        document_models=[
            User,
            Consent,
            AuditLog,
            MockSMS,
            DoctorSlot,
            Booking,
            ChatMessage,
            ConsultationModeEvent,
            VoiceNote,
            RoomCounter,
            ClinicalRecord,
            Prescription,
            Pharmacy
        ]
    )
    logger.info("MongoDB and Beanie ODM initialized successfully with all indexes.")


async def close_db() -> None:
    """Close MongoDB client connection."""
    global mongo_client
    if mongo_client:
        mongo_client.close()
        mongo_client = None
        logger.info("MongoDB connection closed.")


async def is_mongo_healthy() -> bool:
    """Health check probe for MongoDB."""
    if not mongo_client:
        return False
    try:
        await mongo_client.admin.command("ping")
        return True
    except Exception as exc:
        logger.error("MongoDB healthcheck ping failed: %s", exc)
        return False
