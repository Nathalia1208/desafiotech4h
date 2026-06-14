import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from ..core.dependencies import get_db
from ..core.security import decode_token
from ..models.user import User
from ..services.connection_manager import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{forum_id}")
async def websocket_endpoint(
    forum_id: str,
    websocket: WebSocket,
    token: str,
    db: Session = Depends(get_db),
):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        await websocket.close(code=4001)
        return

    await manager.connect(forum_id, websocket, user.id, user.username, user.color)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event_type = event.get("type")

            if event_type == "heartbeat":
                manager.heartbeat(forum_id, user.id, user.username, user.color)
                await manager.broadcast_presence(forum_id)

            elif event_type == "typing":
                await manager.broadcast_typing(forum_id, user.id, user.username)

    except WebSocketDisconnect:
        manager.disconnect(forum_id, user.id)
        await manager.broadcast_presence(forum_id)
