import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.ws_manager import manager
from app.database import AsyncSessionLocal
from app.repositories.user_repository import UserRepository
from app.utils.security import decode_access_token

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/notifications")
async def notifications_ws(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    user_id = decode_access_token(token) if token else None
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    async with AsyncSessionLocal() as db:
        user = await UserRepository(db).get_by_id(user_id)

    if user is None or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(user.id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user.id, websocket)
