from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import RefreshToken, User
from app.repositories.user_repository import UserRepository
from app.schemas.user import TokenPair, UserLogin, UserRegister
from app.services.email_service import send_password_reset_email
from app.utils.security import (
    create_access_token,
    create_refresh_token_value,
    generate_password_reset_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

settings = get_settings()


class AuthService:

    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)

    async def register(self, data: UserRegister) -> User:
        if await self.users.get_by_email(data.email):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="email_already_registered")
        if await self.users.get_by_username(data.username):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="username_already_taken")

        user = await self.users.create(
            email=data.email,
            username=data.username,
            password_hash=hash_password(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
        )
        return user

    async def authenticate(self, data: UserLogin) -> User:
        user = await self.users.get_by_login(data.login)
        if not user or not verify_password(data.password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
        if not user.is_active:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="account_disabled")
        return user

    async def issue_tokens(self, user: User) -> TokenPair:
        access_token = create_access_token(user.id)
        refresh_value = create_refresh_token_value()

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=settings.jwt_refresh_token_expire_days)
        refresh_record = RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_value),
            expires_at=expires_at,
        )
        self.db.add(refresh_record)

        from sqlalchemy import delete
        await self.db.execute(
            delete(RefreshToken).where(
                RefreshToken.user_id == user.id,
                RefreshToken.expires_at <= now,
            )
        )
        await self.db.commit()

        return TokenPair(access_token=access_token, refresh_token=refresh_value)

    async def refresh_access_token(self, refresh_token_value: str) -> TokenPair:
        from sqlalchemy import select

        token_hash = hash_refresh_token(refresh_token_value)
        stmt = select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
        result = await self.db.execute(stmt)
        matched = result.scalar_one_or_none()

        if not matched:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_refresh_token")

        user = await self.users.get_by_id(matched.user_id)
        if not user or not user.is_active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_refresh_token")

        await self.db.delete(matched)
        await self.db.commit()
        return await self.issue_tokens(user)

    async def change_password(self, user_id: UUID, old_password: str, new_password: str) -> None:
        user = await self.users.get_by_id(user_id)
        if not user or not verify_password(old_password, user.password_hash):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="incorrect_old_password")
        await self.users.update(user_id, password_hash=hash_password(new_password))

    async def request_password_reset(self, email: str) -> None:
        user = await self.users.get_by_email(email)
        if not user:
            return

        token = generate_password_reset_token()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await self.users.create_password_reset_token(user.id, token, expires_at)

        reset_link = f"{settings.frontend_base_url}/reset-password?token={token}"
        try:
            await send_password_reset_email(
                user.email, reset_link,
                language=(user.language or "EN").upper()
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Email send failed for {user.email}: {e}")

    async def confirm_password_reset(self, token: str, new_password: str) -> None:
        reset_token = await self.users.get_valid_reset_token(token)
        if not reset_token:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid_or_expired_token")

        await self.users.update(reset_token.user_id, password_hash=hash_password(new_password))
        await self.users.mark_reset_token_used(reset_token)

        from sqlalchemy import delete
        await self.db.execute(
            delete(RefreshToken).where(RefreshToken.user_id == reset_token.user_id)
        )
        await self.db.commit()
