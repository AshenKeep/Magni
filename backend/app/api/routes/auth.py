from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    RegisterRequest, LoginRequest, TokenResponse,
    UserResponse, SetupRequest,
)
from app.core.security import hash_password, verify_password, create_access_token, get_current_user_id

router = APIRouter(prefix="/auth", tags=["auth"])


async def _user_count(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Setup — first-run account creation
# ---------------------------------------------------------------------------

@router.get("/setup-required")
async def setup_required(db: AsyncSession = Depends(get_db)):
    """Returns whether first-time setup is still needed (no users exist)."""
    count = await _user_count(db)
    return {"required": count == 0}


@router.post("/setup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def setup(payload: SetupRequest, db: AsyncSession = Depends(get_db)):
    """
    Creates the first user account. Only works if no users exist.
    Returns a JWT token immediately so the user is logged in right away.
    """
    count = await _user_count(db)
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Setup already complete. Use /auth/login.",
        )

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    await db.flush()

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# Standard auth
# ---------------------------------------------------------------------------

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    await db.flush()
    return user


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserResponse)
async def me(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
