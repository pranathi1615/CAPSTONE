"""WebSocket Router for Signalling, Live Chat, and Queue Events.

Endpoint: /ws?token=<jwt_access_token>&room=<room_id>
"""

import logging
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from app.modules.chat.websocket_manager import ws_manager

logger = logging.getLogger("carebridge.websocket")

router = APIRouter(tags=["Real-Time WebSockets"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT Bearer access token"),
    room: str = Query(default="global", description="Consultation room ID or doctor queue ID")
):
    """Authenticated WebSocket endpoint.

    Accepts JWT access token, joins consultation room, and establishes
    real-time bidirectional envelope messaging with Redis pub/sub.
    """
    user = await ws_manager.authenticate_token(token)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    connection_id = await ws_manager.connect(websocket, room, user)

    try:
        while True:
            raw_text = await websocket.receive_text()
            await ws_manager.handle_incoming_message(
                room_id=room,
                connection_id=connection_id,
                user=user,
                raw_text=raw_text
            )
    except WebSocketDisconnect:
        await ws_manager.disconnect(room, connection_id)
    except Exception as exc:
        logger.error("WebSocket unhandled exception: %s", exc)
        await ws_manager.disconnect(room, connection_id)
