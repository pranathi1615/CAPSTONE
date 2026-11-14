"""Identity and Authentication Service.

Handles user registration, credential verification, JWT token issuance,
doctor verification approval workflow, and audit logging.
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional
from fastapi import HTTPException, status
import jwt

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password
)
from app.modules.audit.service import append_audit_log
from app.modules.identity.models import DoctorStatus, User, UserRole
from app.modules.identity.schemas import (
    DoctorApprovalAction,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse
)

logger = logging.getLogger(__name__)


def user_to_response(user: User) -> UserResponse:
    """Helper to convert User Beanie document to UserResponse schema."""
    return UserResponse(
        user_id=user.user_id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        phone=user.phone,
        is_active=user.is_active,
        registration_number=user.registration_number,
        specialty=user.specialty,
        doctor_status=user.doctor_status,
        created_at=user.created_at
    )


async def register_user(data: RegisterRequest) -> UserResponse:
    """Register a new user.

    If role is doctor:
    - doctor_status starts as PENDING
    - Registration number is mandatory
    - Only admin can approve (pending doctors cannot be booked later).
    """
    normalized_email = data.email.lower().strip()
    existing = await User.find_one(User.email == normalized_email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address is already registered."
        )

    doctor_status = None
    if data.role == UserRole.DOCTOR:
        doctor_status = DoctorStatus.PENDING

    user = User(
        email=normalized_email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name.strip(),
        role=data.role,
        phone=data.phone.strip() if data.phone else None,
        registration_number=data.registration_number.strip() if data.registration_number else None,
        specialty=data.specialty.strip() if data.specialty else None,
        doctor_status=doctor_status,
        is_active=True
    )
    await user.insert()

    # Append audit log for registration
    await append_audit_log(
        event_type="USER_REGISTER",
        actor_id=user.user_id,
        actor_role=user.role.value,
        target_id=user.user_id,
        payload={
            "email": user.email,
            "role": user.role.value,
            "doctor_status": user.doctor_status.value if user.doctor_status else None
        }
    )

    return user_to_response(user)


async def authenticate_user(data: LoginRequest) -> TokenResponse:
    """Authenticate user credentials, log login event, and issue JWT token pair."""
    normalized_email = data.email.lower().strip()
    user = await User.find_one(User.email == normalized_email)

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated."
        )

    token_payload = {
        "sub": user.user_id,
        "email": user.email,
        "role": user.role.value,
        "full_name": user.full_name
    }
    access_token = create_access_token(token_payload)
    refresh_token = create_refresh_token(token_payload)

    # Append audit log for successful login
    await append_audit_log(
        event_type="USER_LOGIN",
        actor_id=user.user_id,
        actor_role=user.role.value,
        target_id=user.user_id,
        payload={"email": user.email}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=user_to_response(user)
    )


async def refresh_access_token(refresh_token: str) -> TokenResponse:
    """Validate refresh token and issue a fresh token pair."""
    try:
        payload = decode_token(refresh_token)
        if payload.get("token_type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type: refresh token required"
            )
        user_id = payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired. Please sign in again."
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    user = await User.find_one(User.user_id == user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer valid"
        )

    token_payload = {
        "sub": user.user_id,
        "email": user.email,
        "role": user.role.value,
        "full_name": user.full_name
    }
    new_access_token = create_access_token(token_payload)
    new_refresh_token = create_refresh_token(token_payload)

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        user=user_to_response(user)
    )


async def list_pending_doctors() -> List[UserResponse]:
    """List all doctors with PENDING verification status (Admin only)."""
    doctors = await User.find(
        User.role == UserRole.DOCTOR,
        User.doctor_status == DoctorStatus.PENDING
    ).to_list()
    return [user_to_response(d) for d in doctors]


async def approve_doctor_status(
    doctor_user_id: str,
    admin_user: User,
    action: DoctorApprovalAction
) -> UserResponse:
    """Admin approves or rejects a pending doctor's medical council verification."""
    doctor = await User.find_one(User.user_id == doctor_user_id)
    if not doctor or doctor.role != UserRole.DOCTOR:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found"
        )

    new_status = DoctorStatus.APPROVED if action.approved else DoctorStatus.REJECTED
    doctor.doctor_status = new_status
    doctor.updated_at = datetime.now(timezone.utc)
    await doctor.save()

    # Append audit log for doctor approval/rejection
    await append_audit_log(
        event_type="DOCTOR_APPROVAL_UPDATED",
        actor_id=admin_user.user_id,
        actor_role=admin_user.role.value,
        target_id=doctor.user_id,
        payload={
            "doctor_email": doctor.email,
            "registration_number": doctor.registration_number,
            "new_status": new_status.value,
            "rejection_reason": action.rejection_reason
        }
    )

    return user_to_response(doctor)
