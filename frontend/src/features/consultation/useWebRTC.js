import { useEffect, useRef, useState, useCallback } from 'react';
import { getIceServersApi } from './api';
import { ADAPTIVE_CONFIG } from './adaptiveCallConfig';

/**
 * Custom React Hook for WebRTC 1-to-1 Audio/Video Calling (Phase 3 Adaptive).
 * 
 * Features:
 * - Real peer-to-peer media pipeline (RTCPeerConnection).
 * - Exposes active RTCPeerConnection for quality monitoring.
 * - Dynamic mode switching:
 *   - VIDEO -> AUDIO_ONLY: stops video track & sets low audio sender bitrate.
 *   - AUDIO_ONLY -> VOICE_NOTE: cleanly closes peer connection, keeping room open.
 *   - Stepping up reverses these transitions.
 *   - ICE restart attempt prior to degrading.
 * - Media controls: Mute audio, camera on/off, clean hangup.
 */
export const useWebRTC = ({ sendSignal, isInitiator = false }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState('new');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [, setForceUpdate] = useState(0);

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

  // 2. Initialize Local Media Stream (audio + optional video)
  const initLocalMedia = useCallback(async (videoEnabled = true) => {
    try {
      setMediaError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { max: 24 },
        } : false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoDisabled(!videoEnabled);
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
      if (
        (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') &&
        pc.connectionState !== 'connected'
      ) {
        setConnectionState('connected');
      }
    };

    pcRef.current = pc;
    setForceUpdate((v) => v + 1);
    return pc;
  }, [sendSignal]);

  // 4. Start call as Initiator (create & send offer)
  const createOffer = useCallback(async (options = {}) => {
    let pc = pcRef.current;
    if (!pc) {
      let stream = localStreamRef.current;
      if (!stream) {
        stream = await initLocalMedia(!options.audioOnly);
      }
      pc = createPeerConnection(stream);
    }

    try {
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: !options.audioOnly,
        iceRestart: Boolean(options.iceRestart),
      };

      if (options.iceRestart && typeof pc.restartIce === 'function') {
        pc.restartIce();
      }

      const offer = await pc.createOffer(offerOptions);
      await pc.setLocalDescription(offer);

      console.log('[WebRTC] Sending offer SDP, iceRestart:', Boolean(options.iceRestart));
      sendSignalRef.current?.('signal_offer', {
        sdp: offer.sdp,
        type: offer.type,
        iceRestart: Boolean(options.iceRestart),
      });
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
    }
  }, [createPeerConnection, initLocalMedia, sendSignal]);

  // 5. Signalling Handler for incoming Offer, Answer, ICE, ICE Restart
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
            iceCandidatesQueue.current.push(payload.candidate);
          }
        }
      } catch (err) {
        console.error('[WebRTC] Failed to add ICE candidate:', err);
      }
    } else if (type === 'signal_ice_restart') {
      console.log('[WebRTC] Received ICE restart request from peer');
      if (pcRef.current) {
        createOffer({ iceRestart: true });
      }
    }
  }, [createPeerConnection, createOffer, initLocalMedia, sendSignal]);

  // 6. Mode Actions (Phase 3 Adaptive Transitions)

  // VIDEO -> AUDIO_ONLY: stops video track & lowers audio bitrate
  const stepDownToAudioOnly = useCallback(async () => {
    console.log('[WebRTC Mode] Step down to AUDIO_ONLY: disabling video track & throttling audio');
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = false;
        // Optionally stop camera hardware
        track.stop();
      });
      setIsVideoDisabled(true);
    }

    // Lower sender bitrate on audio track
    if (pcRef.current) {
      try {
        const senders = pcRef.current.getSenders();
        const audioSender = senders.find((s) => s.track && s.track.kind === 'audio');
        if (audioSender && audioSender.getParameters) {
          const params = audioSender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = ADAPTIVE_CONFIG.AUDIO_ONLY_TARGET_BITRATE_BPS;
          await audioSender.setParameters(params);
          console.log('[WebRTC Mode] Lowered audio sender bitrate to', ADAPTIVE_CONFIG.AUDIO_ONLY_TARGET_BITRATE_BPS);
        }
      } catch (err) {
        console.warn('[WebRTC Mode] Could not set sender parameters:', err);
      }
    }
  }, []);

  // AUDIO_ONLY -> VOICE_NOTE: closes peer connection cleanly but keeps room open
  const stepDownToVoiceNote = useCallback(() => {
    console.log('[WebRTC Mode] Step down to VOICE_NOTE: closing peer connection cleanly');
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
    setForceUpdate((v) => v + 1);
  }, []);

  // Step up: re-establish audio or video call
  const stepUpToAudioOnly = useCallback(async () => {
    console.log('[WebRTC Mode] Step up to AUDIO_ONLY: re-establishing audio peer connection');
    const stream = await initLocalMedia(false);
    if (stream) {
      const pc = createPeerConnection(stream);
      await createOffer({ audioOnly: true });
    }
  }, [initLocalMedia, createPeerConnection, createOffer]);

  const stepUpToVideo = useCallback(async () => {
    console.log('[WebRTC Mode] Step up to VIDEO: re-enabling camera and video track');
    let stream = localStreamRef.current;
    if (!stream || stream.getVideoTracks().length === 0) {
      stream = await initLocalMedia(true);
    } else {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
      setIsVideoDisabled(false);
    }
    if (stream) {
      createPeerConnection(stream);
      await createOffer({ audioOnly: false });
    }
  }, [initLocalMedia, createPeerConnection, createOffer]);

  // Attempt ICE restart before degrading
  const attemptIceRestart = useCallback(async () => {
    console.log('[WebRTC Mode] Attempting ICE restart prior to degrading...');
    if (pcRef.current) {
      await createOffer({ iceRestart: true });
    }
  }, [createOffer]);

  // Media Controls
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

  // Cleanup on unmount or hangup
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
    setForceUpdate((v) => v + 1);
  }, []);

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
    peerConnection: pcRef.current,
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
    stepDownToAudioOnly,
    stepDownToVoiceNote,
    stepUpToAudioOnly,
    stepUpToVideo,
    attemptIceRestart,
    toggleAudio,
    toggleVideo,
    endCall,
  };
};
