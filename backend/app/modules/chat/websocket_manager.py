"""WebSocket Connection Manager and Redis Pub/Sub Signalling Layer.

Phase 3 Features:
- Authenticated /ws endpoint with JWT.
- JSON envelope: {type, id, ts, room, payload}.
- Dual-dispatch: local socket delivery + Redis Pub/Sub for multi-instance scaling.
- WebRTC signalling (offer, answer, ICE, ice_restart).
- Monotonic per-room atomic sequence allocation via MongoDB $inc and Redis INCR.
- Recent messages per room recorded in Redis Stream.
- Message deduplication by message_id (unique index guard).
- Replay gap delivery for clients reconnecting with last_received_seq.
- Consultation mode transitions (VIDEO, AUDIO_ONLY, VOICE_NOTE, TEXT) with audit events.
- Push-to-record voice notes and delivery receipts.
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
from app.modules.chat.models import ChatMessage, ConsultationModeEvent, RoomCounter

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

        # Send presence of existing room members to this newly connected client
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

    async def broadcast_to_role(
        self,
        role: str,
        message_type: str,
        payload: Dict[str, Any]
    ):
        """Broadcast envelope to all connected sockets matching a specific role."""
        envelope = {
            "type": message_type,
            "id": str(uuid.uuid4()),
            "ts": datetime.now(timezone.utc).isoformat(),
            "room": "role_alerts",
            "payload": payload
        }
        for room_id, conns in list(self.active_rooms.items()):
            for cid, meta in list(conns.items()):
                if meta.get("user", {}).get("role") == role:
                    try:
                        await meta["ws"].send_text(json.dumps(envelope))
                    except Exception:
                        pass
        try:
            r = get_redis()
            await r.publish(f"carebridge:role:{role}", json.dumps(envelope))
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

    async def send_to_connection(self, room_id: str, connection_id: str, envelope: Dict[str, Any]):
        """Send envelope directly to a specific connected client."""
        room_connections = self.active_rooms.get(room_id, {})
        conn = room_connections.get(connection_id)
        if conn:
            try:
                await conn["ws"].send_text(json.dumps(envelope))
            except Exception:
                await self.disconnect(room_id, connection_id)

    async def allocate_room_sequence(self, room_id: str) -> int:
        """Allocate next monotonic sequence atomically via Redis INCR or MongoDB $inc."""
        # 1. Primary: Redis INCR for high throughput atomic increment
        try:
            r = get_redis()
            return await r.incr(f"carebridge:room:{room_id}:seq")
        except Exception:
            pass

        # 2. Secondary fallback: MongoDB atomic $inc on RoomCounter collection
        try:
            raw_coll = RoomCounter.get_motor_collection()
            res = await raw_coll.find_one_and_update(
                {"room_id": room_id},
                {"$inc": {"current_seq": 1}},
                upsert=True,
                return_document=True
            )
            return res.get("current_seq", 1)
        except Exception as exc:
            logger.warning("MongoDB atomic sequence allocation error: %s, falling back to query max", exc)
            latest = await ChatMessage.find(ChatMessage.room == room_id).sort("-sequence").first_or_none()
            return (latest.sequence + 1) if latest else 1

    async def push_to_redis_stream(self, room_id: str, message_dict: Dict[str, Any]):
        """Append recent message to Redis Stream for fast replaying."""
        try:
            r = get_redis()
            stream_key = f"carebridge:stream:{room_id}"
            serialized = {k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) for k, v in message_dict.items()}
            await r.xadd(stream_key, serialized, maxlen=1000)
        except Exception:
            pass

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

        # WebRTC Signalling (offer, answer, ice, ice_restart)
        if msg_type in ["signal_offer", "signal_answer", "signal_ice", "signal_ice_restart"]:
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

        # Typing Indicator
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

        # Chat Message with Monotonic Sequence, Deduplication and Redis Stream
        elif msg_type == "chat_message":
            content = payload.get("content", "").strip()
            msg_type_field = payload.get("msg_type", "text")
            metadata = payload.get("metadata", None)

            if not content and not metadata:
                return

            msg_id = payload.get("message_id") or str(uuid.uuid4())

            # Requirement: De-duplicate by message id (unique index guard)
            existing = await ChatMessage.find_one(ChatMessage.message_id == msg_id)
            if existing:
                logger.info("De-duplicated incoming message %s in room %s", msg_id, room_id)
                # Client resent an unacknowledged message: re-broadcast or ack it back
                await self.broadcast_envelope(
                    room=room_id,
                    msg_type="chat_message",
                    payload={
                        "message_id": existing.message_id,
                        "sequence": existing.sequence,
                        "sender_id": existing.sender_id,
                        "sender_name": existing.sender_name,
                        "sender_role": existing.sender_role,
                        "content": existing.content,
                        "msg_type": existing.msg_type,
                        "metadata": existing.metadata,
                        "delivered_to": existing.delivered_to,
                        "timestamp": existing.timestamp.isoformat()
                    },
                    sender_connection_id=None
                )
                return

            # Allocate monotonic sequence atomically
            seq = await self.allocate_room_sequence(room_id)

            chat_doc = ChatMessage(
                message_id=msg_id,
                room=room_id,
                sequence=seq,
                sender_id=user["user_id"],
                sender_name=user["full_name"],
                sender_role=user["role"],
                content=content,
                msg_type=msg_type_field,
                metadata=metadata,
                delivered_to=[user["user_id"]],
                timestamp=datetime.now(timezone.utc)
            )

            try:
                await chat_doc.insert()
            except Exception as exc:
                # In case of rare race condition on duplicate message_id
                logger.warning("Duplicate key prevented insert: %s", exc)
                return

            msg_dict = {
                "message_id": chat_doc.message_id,
                "sequence": chat_doc.sequence,
                "sender_id": chat_doc.sender_id,
                "sender_name": chat_doc.sender_name,
                "sender_role": chat_doc.sender_role,
                "content": chat_doc.content,
                "msg_type": chat_doc.msg_type,
                "metadata": chat_doc.metadata,
                "delivered_to": chat_doc.delivered_to,
                "timestamp": chat_doc.timestamp.isoformat()
            }

            # Store recent messages in Redis Stream
            await self.push_to_redis_stream(room_id, msg_dict)

            # Broadcast to room
            await self.broadcast_envelope(
                room=room_id,
                msg_type="chat_message",
                payload=msg_dict,
                sender_connection_id=None
            )

        # Message History Replay on Reconnect
        # Client sends its last received sequence; server replays the gap
        elif msg_type == "sync_history":
            last_seq = payload.get("last_seq", 0)
            logger.info("Client requested history replay in room %s after seq %s", room_id, last_seq)

            missed_messages = await ChatMessage.find(
                ChatMessage.room == room_id,
                ChatMessage.sequence > int(last_seq)
            ).sort("sequence").to_list()

            replayed_list = [
                {
                    "message_id": m.message_id,
                    "sequence": m.sequence,
                    "sender_id": m.sender_id,
                    "sender_name": m.sender_name,
                    "sender_role": m.sender_role,
                    "content": m.content,
                    "msg_type": m.msg_type,
                    "metadata": m.metadata,
                    "delivered_to": m.delivered_to,
                    "timestamp": m.timestamp.isoformat()
                }
                for m in missed_messages
            ]

            replay_envelope = {
                "type": "history_replay",
                "id": str(uuid.uuid4()),
                "ts": datetime.now(timezone.utc).isoformat(),
                "room": room_id,
                "payload": {
                    "last_seq": last_seq,
                    "messages": replayed_list,
                    "count": len(replayed_list)
                }
            }
            await self.send_to_connection(room_id, connection_id, replay_envelope)

        # Delivery Receipt
        elif msg_type == "delivery_receipt":
            target_msg_id = payload.get("message_id")
            if target_msg_id:
                # Update message delivered_to in MongoDB
                msg = await ChatMessage.find_one(ChatMessage.message_id == target_msg_id)
                if msg and user["user_id"] not in msg.delivered_to:
                    msg.delivered_to.append(user["user_id"])
                    await msg.save()

                await self.broadcast_envelope(
                    room=room_id,
                    msg_type="delivery_receipt",
                    payload={
                        "message_id": target_msg_id,
                        "delivered_to_user_id": user["user_id"],
                        "delivered_to_name": user["full_name"],
                        "delivered_at": datetime.now(timezone.utc).isoformat()
                    },
                    sender_connection_id=None
                )

        # Consultation Mode Change Event
        elif msg_type == "mode_change":
            from_mode = payload.get("from_mode", "UNKNOWN")
            to_mode = payload.get("to_mode", "UNKNOWN")
            reason = payload.get("reason", "Network adaptation")
            stats = payload.get("stats_snapshot", {})

            # Persist to consultation_mode_events collection
            event = ConsultationModeEvent(
                consultation_id=room_id,
                from_mode=from_mode,
                to_mode=to_mode,
                reason=reason,
                stats_snapshot=stats
            )
            await event.insert()

            # Broadcast mode change to all room participants
            await self.broadcast_envelope(
                room=room_id,
                msg_type="mode_change",
                payload={
                    "event_id": event.event_id,
                    "consultation_id": room_id,
                    "from_mode": from_mode,
                    "to_mode": to_mode,
                    "reason": reason,
                    "stats_snapshot": stats,
                    "triggered_by": user["full_name"],
                    "timestamp": event.timestamp.isoformat()
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
