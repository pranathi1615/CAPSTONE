import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Custom React Hook for CareBridge WebSocket Layer.
 * Provides real-time bidirectional communication over /ws with:
 * - JWT authentication via query parameter
 * - JSON envelope: { type, id, ts, room, payload }
 * - Real-time chat message delivery
 * - WebRTC signalling dispatch (offer, answer, ICE)
 * - User presence tracking (online/offline)
 * - Typing indicator broadcast and debounce
 * - Graceful auto-reconnect
 */
export const useWebSocket = ({ roomId, onSignal, onCallEnded, enabled = true }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [peerPresence, setPeerPresence] = useState({});
  const [remoteTyping, setRemoteTyping] = useState({ isTyping: false, name: '' });

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isComponentMounted = useRef(true);

  // Connect to WebSocket endpoint
  const connect = useCallback(() => {
    if (!enabled || !roomId) return;

    const token = localStorage.getItem('access_token');
    if (!token) {
      console.warn('[WS] No access token available, aborting connection');
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Fallback host if running via vite dev server proxy or direct port 8000
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
      };

      socket.onmessage = (event) => {
        if (!isComponentMounted.current) return;
        try {
          const envelope = JSON.parse(event.data);
          const { type, payload } = envelope;

          switch (type) {
            case 'chat_message':
              setMessages((prev) => {
                // Deduplicate by message_id
                if (prev.some((m) => m.message_id === payload.message_id)) {
                  return prev;
                }
                return [...prev, payload];
              });
              break;

            case 'presence':
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

            case 'typing':
              if (payload?.is_typing) {
                setRemoteTyping({ isTyping: true, name: payload.full_name || 'Peer' });
                // Reset after 3 seconds if no follow-up received
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

            case 'signal_offer':
            case 'signal_answer':
            case 'signal_ice':
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
              console.log('[WS] Received unhandled message type:', type, payload);
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

        // Reconnect after 2 seconds if still mounted
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isComponentMounted.current) {
              console.log('[WS] Attempting reconnect...');
              connect();
            }
          }, 2000);
        }
      };
    } catch (err) {
      console.error('[WS] Setup failed', err);
    }
  }, [roomId, enabled, onSignal, onCallEnded]);

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

  // Send envelope utility
  const sendEnvelope = useCallback((type, payload = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send message, socket is not OPEN');
      return false;
    }

    const envelope = {
      type,
      id: crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ts: new Date().toISOString(),
      room: roomId,
      payload,
    };

    wsRef.current.send(JSON.stringify(envelope));
    return true;
  }, [roomId]);

  // High-level send functions
  const sendChatMessage = useCallback((content) => {
    return sendEnvelope('chat_message', { content });
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

  return {
    isConnected,
    messages,
    setMessages,
    peerPresence,
    remoteTyping,
    sendChatMessage,
    sendSignal,
    sendTyping,
    endCall,
  };
};
