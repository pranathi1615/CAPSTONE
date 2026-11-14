import { useEffect, useRef, useState, useCallback } from 'react';
import { getIceServersApi } from './api';

/**
 * Custom React Hook for WebRTC 1-to-1 Audio/Video Calling.
 * Features:
 * - Real peer-to-peer media pipeline (RTCPeerConnection)
 * - Fetches STUN/TURN server configuration from backend API
 * - Local audio/video capture with toggle controls (Mute / Camera off)
 * - Remote media track binding
 * - Signalling integration (Offer, Answer, Trickle ICE)
 * - Graceful cleanup of media hardware and connection
 */
export const useWebRTC = ({ sendSignal, isInitiator = false }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState('new');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [mediaError, setMediaError] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidatesQueue = useRef([]);
  const iceServersRef = useRef([
    { urls: 'stun:stun.l.google.com:19302' },
  ]);

  const sendSignalRef = useRef(sendSignal);
  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  // 1. Fetch ICE configuration from backend
  useEffect(() => {
    const fetchIceConfig = async () => {
      try {
        const res = await getIceServersApi();
        if (res.data?.ice_servers?.length > 0) {
          iceServersRef.current = res.data.ice_servers;
          console.log('[WebRTC] Loaded ICE servers from backend:', iceServersRef.current);
        }
      } catch (err) {
        console.warn('[WebRTC] Using fallback STUN server:', err);
      }
    };
    fetchIceConfig();
  }, []);

  // 2. Initialize Local Media Stream
  const initLocalMedia = useCallback(async () => {
    try {
      setMediaError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { max: 24 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('[WebRTC] Error acquiring media devices:', err);
      setMediaError(err.message || 'Could not access camera/microphone');
      return null;
    }
  }, []);

  // 3. Create or Reset PeerConnection
  const createPeerConnection = useCallback((stream) => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceCandidatePoolSize: 2,
    });

    // Add local tracks to peer connection
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    // Handle incoming remote media tracks
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        const inboundStream = new MediaStream([event.track]);
        setRemoteStream(inboundStream);
      }
    };

    // Handle ICE candidates generated locally
    pc.onicecandidate = (event) => {
      if (event.candidate && sendSignalRef.current) {
        sendSignalRef.current('signal_ice', {
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Track connection state transitions
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state changed:', pc.connectionState);
      setConnectionState(pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', pc.iceConnectionState);
      if ((pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') && pc.connectionState !== 'connected') {
        setConnectionState('connected');
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendSignal]);

  // 4. Start call as Initiator (create & send offer)
  const createOffer = useCallback(async () => {
    let pc = pcRef.current;
    if (!pc) {
      let stream = localStreamRef.current;
      if (!stream) {
        stream = await initLocalMedia();
      }
      pc = createPeerConnection(stream);
    }

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      console.log('[WebRTC] Sending offer SDP');
      sendSignalRef.current?.('signal_offer', {
        sdp: offer.sdp,
        type: offer.type,
      });
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
    }
  }, [createPeerConnection, initLocalMedia, sendSignal]);

  // 5. Signalling Handler for incoming Offer, Answer, ICE
  const handleSignal = useCallback(async (type, payload) => {
    console.log('[WebRTC] Handling signal:', type);

    if (type === 'signal_offer') {
      try {
        let pc = pcRef.current;
        if (!pc) {
          let stream = localStreamRef.current;
          if (!stream) {
            stream = await initLocalMedia();
          }
          pc = createPeerConnection(stream);
        }

        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: payload.sdp,
        }));

        // Flush any queued ICE candidates received before the offer
        while (iceCandidatesQueue.current.length > 0) {
          const cand = iceCandidatesQueue.current.shift();
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log('[WebRTC] Sending answer SDP');
        sendSignalRef.current?.('signal_answer', {
          sdp: answer.sdp,
          type: answer.type,
        });
      } catch (err) {
        console.error('[WebRTC] Failed to handle offer:', err);
      }
    } else if (type === 'signal_answer') {
      try {
        const pc = pcRef.current;
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: payload.sdp,
          }));

          // Flush queued candidates
          while (iceCandidatesQueue.current.length > 0) {
            const cand = iceCandidatesQueue.current.shift();
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
        }
      } catch (err) {
        console.error('[WebRTC] Failed to handle answer:', err);
      }
    } else if (type === 'signal_ice') {
      try {
        const pc = pcRef.current;
        if (payload?.candidate) {
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            // Queue until remote description is set
            iceCandidatesQueue.current.push(payload.candidate);
          }
        }
      } catch (err) {
        console.error('[WebRTC] Failed to add ICE candidate:', err);
      }
    }
  }, [createPeerConnection, initLocalMedia, sendSignal]);

  // 6. Media Controls
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const newMuted = !audioTracks[0].enabled;
        audioTracks[0].enabled = newMuted;
        setIsAudioMuted(!newMuted);
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const newDisabled = !videoTracks[0].enabled;
        videoTracks[0].enabled = newDisabled;
        setIsVideoDisabled(!newDisabled);
      }
    }
  }, []);

  // 7. Cleanup & Hangup
  const endCall = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionState('closed');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        pcRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    localStream,
    remoteStream,
    connectionState,
    isAudioMuted,
    isVideoDisabled,
    mediaError,
    initLocalMedia,
    createPeerConnection,
    createOffer,
    handleSignal,
    toggleAudio,
    toggleVideo,
    endCall,
  };
};
