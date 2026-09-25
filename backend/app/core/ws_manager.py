import logging
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = {}

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(user_id, set()).add(websocket)
        logger.info("ws_connected user_id=%s active=%d", user_id, len(self._connections[user_id]))

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        conns = self._connections.get(user_id)
        if not conns or websocket not in conns:
            return
        conns.discard(websocket)
        if not conns:
            del self._connections[user_id]
        logger.info("ws_disconnected user_id=%s", user_id)

    async def send_to_user(self, user_id: UUID, message: dict) -> None:
        conns = list(self._connections.get(user_id, ()))
        if not conns:
            return
        for websocket in conns:
            try:
                await websocket.send_json(message)
            except Exception:
                logger.exception("ws_send_failed user_id=%s", user_id)
                self.disconnect(user_id, websocket)


manager = ConnectionManager()
