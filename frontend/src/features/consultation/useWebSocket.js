import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Custom React Hook for CareBridge WebSocket Layer (Phase 3 Reliable Messaging).
 * 
 * Features:
 * - JWT authentication via query parameter.
 * - JSON envelope: { type, id, ts, room, payload }.
 * - Exponential backoff with jitter on disconnect.
 * - Last received sequence tracking & automatic history gap replay on reconnect.
 * - Client unacknowledged message retry queue.
 * - Delivery receipts.
 * - Consultation mode synchronization (VIDEO, AUDIO_ONLY, VOICE_NOTE, TEXT).
 * - WebRTC signalling & ICE restart negotiation.
 */
export const useWebSocket = ({
  roomId,
  onSignal,
  onCallEnded,
  onModeChange,
  enabled = true,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [peerPresence, setPeerPresence] = useState({});
  const [peerMode, setPeerMode] = useState('VIDEO');
  const [remoteTyping, setRemoteTyping] = useState({ isTyping: false, name: '' });

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const typingTimerRef = useRef(null);
  const isComponentMounted = useRef(true);

  // Reliable messaging refs
  const lastReceivedSeqRef = useRef(0);
  const unacknowledgedQueueRef = useRef(new Map()); // message_id -> messagePayload
  const isTemporarilyDisconnectedRef = useRef(false);

  // Synchronize lastReceivedSeq with highest message sequence seen
  useEffect(() => {
    if (messages && messages.length > 0) {
      let maxSeq = lastReceivedSeqRef.current;
      for (const m of messages) {
        if (typeof m.sequence === 'number' && m.sequence > maxSeq) {
          maxSeq = m.sequence;
        }
      }
      lastReceivedSeqRef.current = maxSeq;
    }
  }, [messages]);

  // Send envelope utility
  const sendEnvelope = useCallback((type, payload = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send envelope: socket not OPEN. Type:', type);
      return false;
    }

    const envelope = {
      type,
      id: crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ts: new Date().toISOString(),
      room: roomId,
      payload,
    };

    try {
      wsRef.current.send(JSON.stringify(envelope));
      return true;
    } catch (err) {
      console.error('[WS] Failed to send envelope:', err);
      return false;
    }
  }, [roomId]);

  // Connect to WebSocket endpoint with exponential backoff & jitter
  const connect = useCallback(() => {
    if (!enabled || !roomId || isTemporarilyDisconnectedRef.current) return;

    const token = localStorage.getItem('access_token');
    if (!token) {
      console.warn('[WS] No access token available, aborting connection');
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiHost = import.meta.env.VITE_WS_URL || (
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? `${wsProtocol}//${window.location.hostname}:8000`
        : `${wsProtocol}//${window.location.host}`
    );

    const wsUrl = `${apiHost}/ws?token=${encodeURIComponent(token)}&room=${encodeURIComponent(roomId)}`;

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isComponentMounted.current) return;
        console.log(`[WS] Connected to room ${roomId}`);
        setIsConnected(true);
        reconnectAttemptRef.current = 0;

        // Requirement: Client reconnects, sends its last received sequence, server replays the gap
        console.log(`[WS] Requesting gap replay after sequence ${lastReceivedSeqRef.current}`);
        sendEnvelope('sync_history', { last_seq: lastReceivedSeqRef.current });

        // Flush unacknowledged messages
        if (unacknowledgedQueueRef.current.size > 0) {
          console.log(`[WS] Resending ${unacknowledgedQueueRef.current.size} unacknowledged message(s)`);
          unacknowledgedQueueRef.current.forEach((msgPayload) => {
            sendEnvelope('chat_message', msgPayload);
          });
        }
      };

      socket.onmessage = (event) => {
        if (!isComponentMounted.current) return;
        try {
          const envelope = JSON.parse(event.data);
          const { type, payload } = envelope;

          switch (type) {
            case 'chat_message': {
              const msgId = payload.message_id;
              const seq = payload.sequence || 0;

              // Track highest sequence seen
              if (seq > lastReceivedSeqRef.current) {
                lastReceivedSeqRef.current = seq;
              }

              // Remove from unacknowledged queue if ours
              if (msgId && unacknowledgedQueueRef.current.has(msgId)) {
                unacknowledgedQueueRef.current.delete(msgId);
              }

              // Send delivery receipt back
              if (msgId) {
                sendEnvelope('delivery_receipt', { message_id: msgId });
              }

              setMessages((prev) => {
                // Strict deduplication by message_id
                if (prev.some((m) => m.message_id === msgId)) {
                  return prev;
                }
                return [...prev, payload];
              });
              break;
            }

            case 'history_replay': {
              const replayedMessages = payload.messages || [];
              console.log(`[WS] Received history replay with ${replayedMessages.length} message(s)`);

              setMessages((prev) => {
                const existingIds = new Set(prev.map((m) => m.message_id));
                const newItems = [];

                for (const item of replayedMessages) {
                  if (!existingIds.has(item.message_id)) {
                    newItems.push(item);
                    existingIds.add(item.message_id);
                  }
                  if (item.sequence > lastReceivedSeqRef.current) {
                    lastReceivedSeqRef.current = item.sequence;
                  }
                }

                if (newItems.length === 0) return prev;
                const merged = [...prev, ...newItems];
                merged.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
                return merged;
              });
              break;
            }

            case 'delivery_receipt': {
              const targetId = payload.message_id;
              setMessages((prev) =>
                prev.map((m) =>
                  m.message_id === targetId
                    ? {
                        ...m,
                        delivered_to: Array.from(new Set([...(m.delivered_to || []), payload.delivered_to_user_id])),
                        delivered: true,
                      }
                    : m
                )
              );
              break;
            }

            case 'mode_change': {
              const newPeerMode = payload.to_mode;
              if (newPeerMode) {
                setPeerMode(newPeerMode);
              }
              if (onModeChange) {
                onModeChange(payload);
              }
              break;
            }

            case 'presence': {
              if (payload?.user_id) {
                setPeerPresence((prev) => ({
                  ...prev,
                  [payload.user_id]: {
                    userId: payload.user_id,
                    name: payload.full_name || 'Participant',
                    role: payload.role,
                    status: payload.status,
                    lastSeen: new Date().toISOString(),
                  },
                }));
              }
              break;
            }

            case 'typing': {
              if (payload?.is_typing) {
                setRemoteTyping({ isTyping: true, name: payload.user_name || 'Peer' });
                if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                typingTimerRef.current = setTimeout(() => {
                  if (isComponentMounted.current) {
                    setRemoteTyping({ isTyping: false, name: '' });
                  }
                }, 3000);
              } else {
                setRemoteTyping({ isTyping: false, name: '' });
              }
              break;
            }

            case 'signal_offer':
            case 'signal_answer':
            case 'signal_ice':
            case 'signal_ice_restart':
              if (onSignal) {
                onSignal(type, payload);
              }
              break;

            case 'call_ended':
              if (onCallEnded) {
                onCallEnded(payload);
              }
              break;

            default:
              console.log('[WS] Received unhandled envelope:', type, payload);
          }
        } catch (err) {
          console.error('[WS] Failed to parse message JSON', err);
        }
      };

      socket.onerror = (err) => {
        console.error('[WS] Socket error:', err);
      };

      socket.onclose = (event) => {
        if (!isComponentMounted.current) return;
        setIsConnected(false);
        console.log(`[WS] Disconnected from room ${roomId}, code: ${event.code}`);

        // Reconnect with exponential backoff and jitter
        if (enabled && !isTemporarilyDisconnectedRef.current) {
          const attempt = reconnectAttemptRef.current;
          // min(1000 * 1.5^attempt, 10000) + jitter (0-500ms)
          const baseDelay = Math.min(1000 * Math.pow(1.5, attempt), 10000);
          const jitter = Math.floor(Math.random() * 500);
          const backoffDelay = baseDelay + jitter;

          reconnectAttemptRef.current += 1;
          console.log(`[WS] Scheduling reconnect in ${Math.round(backoffDelay)} ms (attempt ${reconnectAttemptRef.current})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isComponentMounted.current) {
              connect();
            }
          }, backoffDelay);
        }
      };
    } catch (err) {
      console.error('[WS] Setup failed', err);
    }
  }, [roomId, enabled, onSignal, onCallEnded, onModeChange, sendEnvelope]);

  useEffect(() => {
    isComponentMounted.current = true;
    connect();

    return () => {
      isComponentMounted.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // High-level send functions
  const sendChatMessage = useCallback((content, msgType = 'text', metadata = null) => {
    const messageId = crypto.randomUUID
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const payload = {
      message_id: messageId,
      content,
      msg_type: msgType,
      metadata,
    };

    // Store in unacknowledged queue for retry
    unacknowledgedQueueRef.current.set(messageId, payload);

    // Send immediately over WebSocket
    const sent = sendEnvelope('chat_message', payload);
    return { sent, messageId };
  }, [sendEnvelope]);

  const broadcastModeChange = useCallback((fromMode, toMode, reason, statsSnapshot = null) => {
    return sendEnvelope('mode_change', {
      from_mode: fromMode,
      to_mode: toMode,
      reason,
      stats_snapshot: statsSnapshot,
    });
  }, [sendEnvelope]);

  const sendIceRestart = useCallback(() => {
    return sendEnvelope('signal_ice_restart', { action: 'restart_ice' });
  }, [sendEnvelope]);

  const sendSignal = useCallback((signalType, payload) => {
    return sendEnvelope(signalType, payload);
  }, [sendEnvelope]);

  const sendTyping = useCallback((isTyping) => {
    return sendEnvelope('typing', { is_typing: isTyping });
  }, [sendEnvelope]);

  const endCall = useCallback(() => {
    return sendEnvelope('call_ended', { reason: 'user_ended' });
  }, [sendEnvelope]);

  // Method to simulate temporary disconnect (e.g. 15s offline test)
  const disconnectTemporarily = useCallback((durationSeconds = 15) => {
    console.warn(`[WS Simulation] Disconnecting for ${durationSeconds} seconds...`);
    isTemporarilyDisconnectedRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsConnected(false);

    setTimeout(() => {
      console.warn('[WS Simulation] Reconnecting after offline simulation window...');
      isTemporarilyDisconnectedRef.current = false;
      connect();
    }, durationSeconds * 1000);
  }, [connect]);

  return {
    isConnected,
    messages,
    setMessages,
    peerPresence,
    peerMode,
    remoteTyping,
    lastReceivedSeq: lastReceivedSeqRef.current,
    unacknowledgedCount: unacknowledgedQueueRef.current.size,
    sendChatMessage,
    broadcastModeChange,
    sendIceRestart,
    sendSignal,
    sendTyping,
    endCall,
    disconnectTemporarily,
    reconnectNow: connect,
  };
};
