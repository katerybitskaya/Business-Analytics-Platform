from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.interfaces.base_repository import BaseRepository
from app.models.user import PasswordResetToken, User, UserProfile


class UserRepository(BaseRepository[User]):
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, entity_id: UUID) -> User | None:
        stmt = select(User).options(selectinload(User.profile)).where(User.id == entity_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(User).options(selectinload(User.profile)).where(User.email == email)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> User | None:
        stmt = select(User).options(selectinload(User.profile)).where(User.username == username)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_login(self, login: str) -> User | None:
        user = await self.get_by_email(login)
        if user:
            return user
        return await self.get_by_username(login)

    async def list_all(self, **filters) -> list[User]:
        stmt = select(User)
        for field, value in filters.items():
            stmt = stmt.where(getattr(User, field) == value)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, **fields) -> User:
        user = User(**fields)
        self.db.add(user)
        await self.db.flush()
        self.db.add(UserProfile(user_id=user.id, profile_complete=False))
        await self.db.commit()
        return await self.get_by_id(user.id)

    async def update(self, entity_id: UUID, **fields) -> User | None:
        user = await self.get_by_id(entity_id)
        if not user:
            return None
        for key, value in fields.items():
            if value is not None and hasattr(user, key):
                setattr(user, key, value)
        await self.db.commit()
        return await self.get_by_id(entity_id)

    async def update_photo(self, entity_id: UUID, photo_url: str | None) -> User | None:
        user = await self.get_by_id(entity_id)
        if not user:
            return None
        user.photo = photo_url
        await self.db.commit()
        return await self.get_by_id(entity_id)

    async def update_profile(self, user_id: UUID, **fields) -> UserProfile | None:
        stmt = select(UserProfile).where(UserProfile.user_id == user_id)
        result = await self.db.execute(stmt)
        profile = result.scalar_one_or_none()
        if not profile:
            return None
        for key, value in fields.items():
            if hasattr(profile, key):
                setattr(profile, key, value)
        profile.profile_complete = bool(profile.industry)
        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def delete(self, entity_id: UUID) -> bool:
        user = await self.get_by_id(entity_id)
        if not user:
            return False
        await self.db.delete(user)
        await self.db.commit()
        return True


    async def create_password_reset_token(self, user_id: UUID, token: str, expires_at) -> PasswordResetToken:
        reset_token = PasswordResetToken(user_id=user_id, token=token, expires_at=expires_at)
        self.db.add(reset_token)
        await self.db.commit()
        return reset_token

    async def get_valid_reset_token(self, token: str) -> PasswordResetToken | None:
        from datetime import datetime, timezone

        stmt = select(PasswordResetToken).where(
            PasswordResetToken.token == token,
            PasswordResetToken.used.is_(False),
        )
        result = await self.db.execute(stmt)
        reset_token = result.scalar_one_or_none()
        if not reset_token:
            return None
        if reset_token.expires_at < datetime.now(timezone.utc):
            return None
        return reset_token

    async def mark_reset_token_used(self, reset_token: PasswordResetToken) -> None:
        reset_token.used = True
        await self.db.commit()
