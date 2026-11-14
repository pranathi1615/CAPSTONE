"""WebSocket Connection Manager and Redis Pub/Sub Signalling Layer.

Enforces:
- Authenticated /ws endpoint with JWT.
- JSON envelope: {type, id, ts, room, payload}.
- Rooms per consultation.
- Dual-dispatch: immediate local delivery + Redis Pub/Sub for multi-instance scaling.
- WebRTC signalling (offer, answer, ICE).
- Presence (online/offline) and typing indicators.
- Chat message persistence with monotonic per-room sequence.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import WebSocket
from app.core.redis import get_redis
from app.core.security import decode_token
from app.modules.chat.models import ChatMessage

logger = logging.getLogger("carebridge.websocket")


class ConnectionManager:
    def __init__(self):
        # Local room registry: room_id -> Dict[connection_id, Dict[str, Any]]
        self.active_rooms: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # Active Redis subscription tasks per room
        self.redis_sub_tasks: Dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    async def authenticate_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Validate JWT token signature and return authenticated user claims."""
        try:
            payload = decode_token(token)
            if payload.get("token_type") != "access":
                return None
            user_id = payload.get("sub")
            if not user_id:
                return None
            return {
                "user_id": user_id,
                "email": payload.get("email", ""),
                "full_name": payload.get("full_name") or payload.get("email", "User"),
                "role": payload.get("role", "patient")
            }
        except Exception as exc:
            logger.warning("WebSocket authentication failed: %s", exc)
            return None

    async def connect(self, websocket: WebSocket, room_id: str, user: Dict[str, Any]) -> str:
        """Register newly connected WebSocket client into room."""
        await websocket.accept()
        connection_id = str(uuid.uuid4())

        async with self._lock:
            if room_id not in self.active_rooms:
                self.active_rooms[room_id] = {}

            self.active_rooms[room_id][connection_id] = {
                "ws": websocket,
                "user": user
            }

        logger.info(
            "User %s (%s) joined room %s [Conn: %s]",
            user["full_name"], user["role"], room_id, connection_id
        )

        # Send presence of all existing members in this room to the newly connected client
        existing_peers = []
        async with self._lock:
            for peer_conn_id, peer_meta in self.active_rooms[room_id].items():
                if peer_conn_id != connection_id:
                    existing_peers.append(peer_meta["user"])

        for peer_user in existing_peers:
            peer_envelope = {
                "type": "presence",
                "id": str(uuid.uuid4()),
                "ts": datetime.now(timezone.utc).isoformat(),
                "room": room_id,
                "payload": {
                    "user_id": peer_user["user_id"],
                    "full_name": peer_user["full_name"],
                    "role": peer_user["role"],
                    "status": "online"
                }
            }
            try:
                await websocket.send_text(json.dumps(peer_envelope))
            except Exception:
                pass

        # Broadcast presence ONLINE of new user to everyone in room
        await self.broadcast_envelope(
            room=room_id,
            msg_type="presence",
            payload={
                "user_id": user["user_id"],
                "full_name": user["full_name"],
                "role": user["role"],
                "status": "online"
            },
            sender_connection_id=None
        )

        return connection_id

    async def disconnect(self, room_id: str, connection_id: str):
        """Clean up WebSocket connection on client departure."""
        user_info = None
        async with self._lock:
            if room_id in self.active_rooms and connection_id in self.active_rooms[room_id]:
                user_info = self.active_rooms[room_id][connection_id]["user"]
                del self.active_rooms[room_id][connection_id]

                if len(self.active_rooms[room_id]) == 0:
                    del self.active_rooms[room_id]

        if user_info:
            logger.info("User %s disconnected from room %s", user_info["full_name"], room_id)
            # Broadcast presence OFFLINE
            await self.broadcast_envelope(
                room=room_id,
                msg_type="presence",
                payload={
                    "user_id": user_info["user_id"],
                    "full_name": user_info["full_name"],
                    "role": user_info["role"],
                    "status": "offline"
                },
                sender_connection_id=None
            )

    async def broadcast_envelope(
        self,
        room: str,
        msg_type: str,
        payload: Dict[str, Any],
        sender_connection_id: Optional[str] = None
    ):
        """Broadcast envelope to local connected sockets immediately and publish to Redis."""
        now = datetime.now(timezone.utc).isoformat()
        envelope = {
            "type": msg_type,
            "id": str(uuid.uuid4()),
            "ts": now,
            "room": room,
            "sender_connection_id": sender_connection_id,
            "payload": payload
        }

        # 1. Immediate local dispatch to active connections in room
        await self._dispatch_local(room, envelope)

        # 2. Redis Pub/Sub for cross-instance scaling
        try:
            r = get_redis()
            channel = f"carebridge:room:{room}"
            await r.publish(channel, json.dumps(envelope))
        except Exception:
            pass

    async def _dispatch_local(self, room_id: str, envelope: Dict[str, Any]):
        """Deliver envelope to connected local WebSockets in room."""
        room_connections = self.active_rooms.get(room_id, {})
        sender_cid = envelope.get("sender_connection_id")

        disconnected_cids = []
        for cid, conn in list(room_connections.items()):
            # For WebRTC signalling, don't echo back to sender connection
            if sender_cid and cid == sender_cid and envelope["type"].startswith("signal_"):
                continue

            try:
                await conn["ws"].send_text(json.dumps(envelope))
            except Exception:
                disconnected_cids.append(cid)

        for dead_cid in disconnected_cids:
            await self.disconnect(room_id, dead_cid)

    async def handle_incoming_message(
        self,
        room_id: str,
        connection_id: str,
        user: Dict[str, Any],
        raw_text: str
    ):
        """Process incoming client envelope and route according to type."""
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            logger.warning("Received invalid JSON on WebSocket")
            return

        msg_type = data.get("type")
        payload = data.get("payload", {})

        if msg_type in ["signal_offer", "signal_answer", "signal_ice"]:
            signalling_payload = {
                **payload,
                "sender_id": user["user_id"],
                "sender_role": user["role"],
                "sender_name": user["full_name"]
            }
            await self.broadcast_envelope(
                room=room_id,
                msg_type=msg_type,
                payload=signalling_payload,
                sender_connection_id=connection_id
            )

        elif msg_type == "typing":
            await self.broadcast_envelope(
                room=room_id,
                msg_type="typing",
                payload={
                    "user_id": user["user_id"],
                    "user_name": user["full_name"],
                    "is_typing": bool(payload.get("is_typing", True))
                },
                sender_connection_id=connection_id
            )

        elif msg_type == "chat_message":
            content = payload.get("content", "").strip()
            if not content:
                return

            msg_id = payload.get("message_id") or str(uuid.uuid4())
            try:
                r = get_redis()
                seq = await r.incr(f"carebridge:room:{room_id}:seq")
            except Exception:
                latest = await ChatMessage.find(ChatMessage.room == room_id).sort("-sequence").first_or_none()
                seq = (latest.sequence + 1) if latest else 1

            chat_doc = ChatMessage(
                message_id=msg_id,
                room=room_id,
                sequence=seq,
                sender_id=user["user_id"],
                sender_name=user["full_name"],
                sender_role=user["role"],
                content=content,
                timestamp=datetime.now(timezone.utc)
            )
            await chat_doc.insert()

            await self.broadcast_envelope(
                room=room_id,
                msg_type="chat_message",
                payload={
                    "message_id": chat_doc.message_id,
                    "sequence": chat_doc.sequence,
                    "sender_id": chat_doc.sender_id,
                    "sender_name": chat_doc.sender_name,
                    "sender_role": chat_doc.sender_role,
                    "content": chat_doc.content,
                    "timestamp": chat_doc.timestamp.isoformat()
                },
                sender_connection_id=None
            )

        elif msg_type == "queue_update":
            await self.broadcast_envelope(
                room=room_id,
                msg_type="queue_update",
                payload=payload,
                sender_connection_id=None
            )


ws_manager = ConnectionManager()
