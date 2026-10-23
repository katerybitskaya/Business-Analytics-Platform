from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.utils.security import decode_access_token

_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if get_settings().is_desktop:
        from app.core.desktop import get_local_user

        user = await get_local_user(db)
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_or_expired_token")
        return user

    if credentials is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not authenticated")

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_or_expired_token")

    user = await UserRepository(db).get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_or_expired_token")

    return user


async def web_only() -> None:
    if get_settings().is_desktop:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not Found")
