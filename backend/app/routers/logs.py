from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from app.core.logging_config import get_frontend_logger
from app.middleware.auth_middleware import get_current_user
from app.models.user import User

router = APIRouter()


class ClientLogEntry(BaseModel):
    level: str
    message: str
    url: str | None = None
    stack: str | None = None


@router.post("/client", status_code=status.HTTP_204_NO_CONTENT)
async def receive_client_log(
    entry: ClientLogEntry,
    current_user: User = Depends(get_current_user),
) -> None:
    fe_logger = get_frontend_logger()

    prefix = f"[{current_user.email}] [{entry.url or '?'}]"
    body = entry.message

    if entry.stack:
        body += f"\n  Stack: {entry.stack[:2000]}"

    level = entry.level.lower()
    if level == "error":
        fe_logger.error("%s %s", prefix, body)
    elif level in ("warn", "warning"):
        fe_logger.warning("%s %s", prefix, body)
    else:
        fe_logger.info("%s %s", prefix, body)
