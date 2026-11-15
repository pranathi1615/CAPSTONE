"""CareBridge Backend Main Application.

Phase 1 & 2: Modular Monolith with Real-time Visits, WebSockets, WebRTC Signalling,
Doctor Queue, In-Call Chat, and MOCK Notifications.
"""

from contextlib import asynccontextmanager
import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import close_db, init_db
from app.core.redis import close_redis, init_redis
from app.modules.core.router import router as core_router
from app.modules.identity.router import router as identity_router
from app.modules.consent.router import router as consent_router
from app.modules.audit.router import router as audit_router
from app.modules.notifications.router import router as notifications_router
from app.modules.appointments.router import router as appointments_router
from app.modules.chat.router import router as chat_router
from app.modules.clinical.router import router as clinical_router
from app.modules.sync.router import router as sync_router
from app.modules.prescriptions.router import router as prescriptions_router
from app.modules.pharmacies.router import router as pharmacies_router
from app.modules.assisted_visits.router import router as assisted_visits_router
from app.modules.triage.router import router as triage_router
from app.modules.async_consults.router import router as async_consults_router
from app.modules.followups.router import router as followups_router
from app.modules.referrals.router import router as referrals_router
from app.modules.analytics.router import router as analytics_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("carebridge")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown hooks."""
    logger.info("Starting up %s v%s...", settings.APP_NAME, settings.APP_VERSION)
    await init_db()
    await init_redis()
    yield
    logger.info("Shutting down %s...", settings.APP_NAME)
    await close_redis()
    await close_db()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Real-time telemedicine platform for weak networks, regional languages, and shared phones.",
    lifespan=lifespan
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers_middleware(request, call_next):
    """Production deployment hardening: security headers middleware."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=*, microphone=*, geolocation=*"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; "
        "connect-src 'self' ws: wss: http: https: data: blob:; "
        "media-src 'self' blob: data:; "
        "img-src 'self' data: blob: https:; "
        "font-src 'self' data: https:;"
    )
    return response


# Static files for audio voice notes & uploads
uploads_dir = os.path.join(os.getcwd(), "uploads")
os.makedirs(os.path.join(uploads_dir, "voice_notes"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Register modular monolith domain routers
app.include_router(core_router)
app.include_router(identity_router)
app.include_router(consent_router)
app.include_router(audit_router)
app.include_router(notifications_router)
app.include_router(appointments_router)
app.include_router(chat_router)
app.include_router(clinical_router)
app.include_router(sync_router)
app.include_router(prescriptions_router)
app.include_router(pharmacies_router)
app.include_router(assisted_visits_router)
app.include_router(triage_router)
app.include_router(async_consults_router)
app.include_router(followups_router)
app.include_router(referrals_router)
app.include_router(analytics_router)


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "phase": 7,
        "docs": "/docs",
        "health": "/health",
        "ws": "/ws"
    }
