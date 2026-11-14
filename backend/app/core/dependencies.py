"""Authentication and authorization dependencies.

Provides current user extraction from JWT and reusable role-based
access control (RBAC) dependency factory.
"""

from typing import Callable, List, Union
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

from app.core.security import decode_token
from app.modules.identity.models import User, UserRole

security_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> User:
    """Validate Bearer access token and return authenticated User."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("token_type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type: access token required",
                headers={"WWW-Authenticate": "Bearer"}
            )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing subject identifier",
                headers={"WWW-Authenticate": "Bearer"}
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please refresh your session.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except (jwt.InvalidTokenError, Exception):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user = await User.find_one(User.user_id == user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"}
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    return user


def require_roles(*allowed_roles: Union[UserRole, str]) -> Callable:
    """Reusable role-check dependency usable on any route.

    Example:
        @router.get("/admin-only", dependencies=[Depends(require_roles("admin"))])
        or
        async def endpoint(user: User = Depends(require_roles("admin", "doctor"))):
    """
    normalized_roles = [
        r.value if isinstance(r, UserRole) else str(r)
        for r in allowed_roles
    ]

    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role_str = current_user.role.value if isinstance(current_user.role, UserRole) else str(current_user.role)
        if user_role_str not in normalized_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: role '{user_role_str}' lacks permission. Required: {normalized_roles}"
            )
        return current_user

    return role_checker
