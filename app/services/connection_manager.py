import json
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # forum_id -> list of connection dicts
        self._connections: dict[str, list[dict]] = {}
        # forum_id -> user_id -> presence info
        self._presence: dict[str, dict[str, dict]] = {}

    async def connect(
        self, forum_id: str, websocket: WebSocket, user_id: str, username: str, color: str
    ):
        await websocket.accept()
        self._connections.setdefault(forum_id, []).append(
            {"ws": websocket, "user_id": user_id, "username": username, "color": color}
        )
        self._update_presence(forum_id, user_id, username, color)
        await self._broadcast_presence(forum_id)

    def disconnect(self, forum_id: str, user_id: str):
        if forum_id in self._connections:
            self._connections[forum_id] = [
                c for c in self._connections[forum_id] if c["user_id"] != user_id
            ]
            if not self._connections[forum_id]:
                del self._connections[forum_id]

        if forum_id in self._presence:
            self._presence[forum_id].pop(user_id, None)
            if not self._presence[forum_id]:
                del self._presence[forum_id]

    def _update_presence(self, forum_id: str, user_id: str, username: str, color: str):
        self._presence.setdefault(forum_id, {})[user_id] = {
            "userId": user_id,
            "forumId": forum_id,
            "username": username,
            "color": color,
            "lastSeen": datetime.now(timezone.utc).timestamp() * 1000,
        }

    def heartbeat(self, forum_id: str, user_id: str, username: str, color: str):
        self._update_presence(forum_id, user_id, username, color)

    def get_presence(self, forum_id: str) -> list[dict]:
        return list(self._presence.get(forum_id, {}).values())

    async def _broadcast_presence(self, forum_id: str):
        await self._broadcast(forum_id, {
            "type": "presence",
            "forumId": forum_id,
            "users": self.get_presence(forum_id),
        })

    async def broadcast_message(
        self, forum_id: str, message: dict[str, Any], private_to_id: str | None = None
    ):
        payload = {"type": "message", "message": message}
        if private_to_id:
            author_id = message.get("author_id")
            for conn in self._connections.get(forum_id, []):
                if conn["user_id"] in (author_id, private_to_id):
                    await self._safe_send(conn["ws"], payload)
        else:
            await self._broadcast(forum_id, payload)

    async def broadcast_presence(self, forum_id: str):
        await self._broadcast_presence(forum_id)

    async def broadcast_system_event(self, forum_id: str, text: str):
        await self._broadcast(str(forum_id), {
            "type": "system",
            "text": text,
            "at": datetime.now(timezone.utc).timestamp() * 1000,
        })

    async def broadcast_typing(self, forum_id: str, user_id: str, username: str):
        payload = {
            "type": "typing",
            "payload": {
                "userId": user_id,
                "forumId": forum_id,
                "username": username,
                "at": datetime.now(timezone.utc).timestamp() * 1000,
            },
        }
        await self._broadcast(forum_id, payload, exclude=user_id)

    async def _broadcast(
        self, forum_id: str, data: dict, exclude: str | None = None
    ):
        dead: list[str] = []
        for conn in self._connections.get(forum_id, []):
            if exclude and conn["user_id"] == exclude:
                continue
            ok = await self._safe_send(conn["ws"], data)
            if not ok:
                dead.append(conn["user_id"])
        for uid in dead:
            self.disconnect(forum_id, uid)

    async def _safe_send(self, ws: WebSocket, data: dict) -> bool:
        try:
            await ws.send_json(data)
            return True
        except Exception:
            return False


manager = ConnectionManager()
