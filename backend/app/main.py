"""CareBridge Backend Main Application.

Phase 1: Foundation, Sign-in, Role-Based Access Control, and Patient Consent.
Modular monolith structure with Beanie ODM, FastAPI, Redis, and cryptographic audit log.
"""

from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import close_db, init_db
from app.core.redis import close_redis, init_redis
from app.modules.core.router import router as core_router
from app.modules.identity.router import router as identity_router
from app.modules.consent.router import router as consent_router
from app.modules.audit.router import router as audit_router

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

# Register modular monolith routers
app.include_router(core_router)
app.include_router(identity_router)
app.include_router(consent_router)
app.include_router(audit_router)


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "phase": 1,
        "docs": "/docs",
        "health": "/health"
    }
