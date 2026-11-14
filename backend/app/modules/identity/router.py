"""Identity and Authentication API router.

Endpoints:
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- GET /me
- GET /auth/doctors/pending (admin only)
- POST /auth/doctors/{doctor_id}/approve (admin only)
"""

from typing import List
from fastapi import APIRouter, Depends, status

from app.core.config import settings
from app.core.dependencies import get_current_user, require_roles
from app.core.rate_limit import RateLimiter
from app.modules.identity.models import User, UserRole
from app.modules.identity.schemas import (
    DoctorApprovalAction,
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse
)
from app.modules.identity.service import (
    approve_doctor_status,
    authenticate_user,
    list_pending_doctors,
    refresh_access_token,
    register_user,
    user_to_response
)

router = APIRouter(prefix="/auth", tags=["Identity & Auth"])

# Rate limiters for auth endpoints
login_limiter = RateLimiter(
    max_requests=settings.RATE_LIMIT_LOGIN_ATTEMPTS,
    window_seconds=settings.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    prefix="rl_login"
)
register_limiter = RateLimiter(
    max_requests=settings.RATE_LIMIT_REGISTER_ATTEMPTS,
    window_seconds=settings.RATE_LIMIT_REGISTER_WINDOW_SECONDS,
    prefix="rl_register"
)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(register_limiter)]
)
async def register_endpoint(data: RegisterRequest):
    """Register a new user (patient, doctor, chw, pharmacy, admin)."""
    return await register_user(data)


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(login_limiter)]
)
async def login_endpoint(data: LoginRequest):
    """Authenticate with email and password to receive JWT access and refresh tokens."""
    return await authenticate_user(data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_endpoint(data: RefreshTokenRequest):
    """Submit refresh token to obtain a fresh pair of access and refresh tokens."""
    return await refresh_access_token(data.refresh_token)


@router.get("/me", response_model=UserResponse)
async def get_me_endpoint(current_user: User = Depends(get_current_user)):
    """Return profile of the currently authenticated user."""
    return user_to_response(current_user)


@router.get(
    "/doctors/pending",
    response_model=List[UserResponse],
    dependencies=[Depends(require_roles(UserRole.ADMIN))]
)
async def get_pending_doctors_endpoint():
    """Admin-only: Retrieve all registered doctors awaiting medical license approval."""
    return await list_pending_doctors()


@router.post(
    "/doctors/{doctor_id}/approve",
    response_model=UserResponse,
    dependencies=[Depends(require_roles(UserRole.ADMIN))]
)
async def approve_doctor_endpoint(
    doctor_id: str,
    action: DoctorApprovalAction,
    admin: User = Depends(get_current_user)
):
    """Admin-only: Approve or reject doctor verification."""
    return await approve_doctor_status(
        doctor_user_id=doctor_id,
        admin_user=admin,
        action=action
    )
