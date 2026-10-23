import getpass
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.utils.security import hash_password

LOCAL_EMAIL = "local@desktop.app"
LOCAL_USERNAME = "local"


def _windows_user_name() -> str:
    try:
        return getpass.getuser() or "User"
    except Exception:
        return "User"


async def get_local_user(db: AsyncSession) -> User | None:
    stmt = select(User.id).order_by(User.created_at).limit(1)
    user_id = (await db.execute(stmt)).scalar_one_or_none()
    if user_id is None:
        return None
    return await UserRepository(db).get_by_id(user_id)


async def ensure_local_user(db: AsyncSession) -> User:
    user = await get_local_user(db)
    if user is not None:
        return user
    return await UserRepository(db).create(
        email=LOCAL_EMAIL,
        username=LOCAL_USERNAME,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        first_name=_windows_user_name(),
        last_name="",
        theme="dark",
    )
