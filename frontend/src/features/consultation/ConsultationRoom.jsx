import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Send,
  MessageSquare,
  FileText,
  CheckCircle,
  Activity,
  User,
  AlertCircle,
  PhoneCall,
  Radio,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useWebSocket } from './useWebSocket';
import { useWebRTC } from './useWebRTC';
import { useQualityMonitor } from './useQualityMonitor';
import { CALL_MODES, ADAPTIVE_CONFIG } from './adaptiveCallConfig';
import { stepModeStateMachine } from './adaptiveCallStateMachine';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { VoiceNoteCard } from './VoiceNoteCard';
import { DevSimulatorPanel } from './DevSimulatorPanel';
import {
  getConsultationMessagesApi,
  completeConsultationApi,
  recordModeEventApi,
} from './api';

export const ConsultationRoom = () => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('bookingId');

  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Consultation Navigation & UI tabs
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'notes'
  const [chatInput, setChatInput] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSubmittingNotes, setIsSubmittingNotes] = useState(false);
  const [completeSuccess, setCompleteSuccess] = useState(false);

  // Phase 3: Adaptive Call Mode State
  const [currentMode, setCurrentMode] = useState(CALL_MODES.VIDEO);
  const [modeNotice, setModeNotice] = useState(null);
  const [consecutiveBadSamples, setConsecutiveBadSamples] = useState(0);
  const [consecutiveGoodSamples, setConsecutiveGoodSamples] = useState(0);
  const [failedUploads, setFailedUploads] = useState(0);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isDoctor = user?.role === 'doctor';

  // 1. WebSocket Hook
  const handleIncomingSignal = useCallback((type, payload) => {
    rtcHandleSignalRef.current?.(type, payload);
  }, []);

  const handleRemoteCallEnded = useCallback(() => {
    alert(t('consultation.call_ended_by_peer') || 'The consultation has ended.');
    navigate('/dashboard');
  }, [navigate, t]);

  const handleRemoteModeChange = useCallback((payload) => {
    console.log('[Consultation] Peer initiated mode change:', payload);
    const newPeerMode = payload.to_mode;
    if (newPeerMode) {
      setModeNotice({
        mode: newPeerMode,
        reason: payload.reason,
        timestamp: Date.now(),
      });
    }
  }, []);

  const {
    isConnected: isWsConnected,
    messages,
    setMessages,
    peerPresence,
    peerMode,
    remoteTyping,
    sendChatMessage,
    broadcastModeChange,
    sendSignal,
    sendTyping,
    endCall: wsEndCall,
    disconnectTemporarily,
  } = useWebSocket({
    roomId,
    onSignal: handleIncomingSignal,
    onCallEnded: handleRemoteCallEnded,
    onModeChange: handleRemoteModeChange,
    enabled: Boolean(roomId),
  });

  // 2. WebRTC Hook
  const {
    peerConnection,
    localStream,
    remoteStream,
    connectionState,
    isAudioMuted,
    isVideoDisabled,
    mediaError,
    initLocalMedia,
    createOffer,
    handleSignal,
    stepDownToAudioOnly,
    stepDownToVoiceNote,
    stepUpToAudioOnly,
    stepUpToVideo,
    attemptIceRestart,
    toggleAudio,
    toggleVideo,
    endCall: rtcEndCall,
  } = useWebRTC({
    sendSignal,
    isInitiator: isDoctor,
  });

  const rtcHandleSignalRef = useRef(handleSignal);
  useEffect(() => {
    rtcHandleSignalRef.current = handleSignal;
  }, [handleSignal]);

  // 3. Attach MediaStreams to <video> elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // 4. Initial Media Acquisition & Chat History Loading
  useEffect(() => {
    let isMounted = true;

    const setupRoom = async () => {
      // Pre-load past chat messages
      if (roomId) {
        try {
          const res = await getConsultationMessagesApi(roomId);
          if (isMounted && res.data) {
            setMessages(res.data);
          }
        } catch (err) {
          console.warn('[Consultation] Could not load message history:', err);
        }
      }

      // Initialize media automatically for video mode
      try {
        await initLocalMedia(true);
      } catch (e) {
        console.error('[Consultation] Error starting camera/mic:', e);
      }
    };

    setupRoom();

    return () => {
      isMounted = false;
    };
  }, [roomId, initLocalMedia, setMessages]);

  // 5. Scroll chat to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, remoteTyping]);

  // 6. Quality Monitor and State Machine Integration
  const executeModeTransition = useCallback(async (fromMode, toMode, reason, statsSnapshot) => {
    console.log(`[CareBridge Transition] ${fromMode} -> ${toMode} (Reason: ${reason})`);
    setCurrentMode(toMode);

    // Perform mode-specific WebRTC actions
    if (toMode === CALL_MODES.AUDIO_ONLY) {
      await stepDownToAudioOnly();
    } else if (toMode === CALL_MODES.VOICE_NOTE) {
      stepDownToVoiceNote();
    } else if (toMode === CALL_MODES.TEXT) {
      stepDownToVoiceNote();
    } else if (toMode === CALL_MODES.VIDEO) {
      await stepUpToVideo();
    }

    // Persist mode transition audit log in MongoDB
    try {
      await recordModeEventApi({
        consultation_id: roomId,
        from_mode: fromMode,
        to_mode: toMode,
        reason,
        stats_snapshot: statsSnapshot,
      });
    } catch (err) {
      console.warn('[Consultation] Failed to record mode event to API:', err);
    }

    // Broadcast over WebSocket to peer
    broadcastModeChange(fromMode, toMode, reason, statsSnapshot);

    // Display banner notice
    setModeNotice({
      mode: toMode,
      reason,
      timestamp: Date.now(),
    });

    // Append system message to timeline
    const modeNameKey = `consultation.mode_${toMode.toLowerCase()}`;
    const modeName = t(modeNameKey, toMode);
    sendChatMessage(`[CareBridge System] ${t('consultation.mode_changed_notice', { mode: modeName })}: ${reason}`, 'system');
  }, [roomId, stepDownToAudioOnly, stepDownToVoiceNote, stepUpToVideo, broadcastModeChange, sendChatMessage, t]);

  const handleQualityUpdate = useCallback(async (sample) => {
    // Attempt ICE restart if connection dropped before stepping down
    if (sample.disconnectedSeconds > 2.0 && currentMode === CALL_MODES.VIDEO) {
      console.log('[Quality] Interruption detected, attempting ICE restart...');
      await attemptIceRestart();
    }

    const result = stepModeStateMachine({
      currentMode,
      stats: sample,
      consecutiveBad: consecutiveBadSamples,
      consecutiveGood: consecutiveGoodSamples,
      failedUploads,
      config: ADAPTIVE_CONFIG,
    });

    setConsecutiveBadSamples(result.nextBadCount);
    setConsecutiveGoodSamples(result.nextGoodCount);

    if (result.transitioned && result.nextMode !== currentMode) {
      await executeModeTransition(currentMode, result.nextMode, result.reason, sample);
    }
  }, [currentMode, consecutiveBadSamples, consecutiveGoodSamples, failedUploads, attemptIceRestart, executeModeTransition]);

  const {
    stats: currentStats,
    setSimulatedStats,
  } = useQualityMonitor({
    peerConnection,
    currentMode,
    enabled: Boolean(roomId),
    onQualityUpdate: handleQualityUpdate,
  });

  // Handle Voice Note Upload Failure (triggers step down to TEXT if consecutive >= 2)
  const handleVoiceNoteUploadFailed = useCallback(async (failedCount) => {
    setFailedUploads(failedCount);
    if (failedCount >= ADAPTIVE_CONFIG.MAX_FAILED_VOICE_NOTE_UPLOADS && currentMode === CALL_MODES.VOICE_NOTE) {
      const reason = t('consultation.voice_note_failed_downgrade', 'Voice note upload failed repeatedly. Auto-downgraded to TEXT mode.');
      await executeModeTransition(currentMode, CALL_MODES.TEXT, reason, currentStats);
    }
  }, [currentMode, currentStats, executeModeTransition, t]);

  // Dev Simulator forced mode change
  const handleDevForceMode = useCallback(async (targetMode) => {
    if (targetMode === currentMode) return;
    await executeModeTransition(currentMode, targetMode, `Forced manually via Dev Simulator`, currentStats);
  }, [currentMode, currentStats, executeModeTransition]);

  // Chat message sending
  const handleChatInputChange = (e) => {
    setChatInput(e.target.value);
    sendTyping(e.target.value.length > 0);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    sendChatMessage(chatInput.trim(), 'text');
    sendTyping(false);
    setChatInput('');
  };

  const handleStartCall = async () => {
    await createOffer();
  };

  const handleEndCall = () => {
    if (window.confirm(t('consultation.confirm_leave') || 'Are you sure you want to leave the consultation?')) {
      wsEndCall();
      rtcEndCall();
      navigate('/dashboard');
    }
  };

  const handleCompleteVisit = async () => {
    if (!bookingId) {
      alert('No booking ID associated with this session.');
      return;
    }

    try {
      setIsSubmittingNotes(true);
      await completeConsultationApi(bookingId, clinicalNotes);
      setCompleteSuccess(true);
      wsEndCall();
      rtcEndCall();
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to complete visit.');
    } finally {
      setIsSubmittingNotes(false);
    }
  };

  const peers = Object.values(peerPresence).filter((p) => p.userId !== user?.user_id);
  const otherPeer = peers.length > 0 ? peers[0] : null;
  const isPeerOnline = otherPeer?.status === 'online';

  const getModeBadge = (mode) => {
    switch (mode) {
      case CALL_MODES.VIDEO:
        return { label: t('consultation.mode_video', 'Video Call'), icon: '📹', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      case CALL_MODES.AUDIO_ONLY:
        return { label: t('consultation.mode_audio', 'Audio Only'), icon: '🎙️', color: 'bg-sky-500/20 text-sky-300 border-sky-500/40' };
      case CALL_MODES.VOICE_NOTE:
        return { label: t('consultation.mode_voice_note', 'Voice Note'), icon: '📻', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case CALL_MODES.TEXT:
        return { label: t('consultation.mode_text', 'Text Only'), icon: '💬', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      default:
        return { label: mode, icon: '📶', color: 'bg-slate-700 text-slate-300 border-slate-600' };
    }
  };

  const currentBadge = getModeBadge(currentMode);
  const peerBadge = getModeBadge(peerMode);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Header bar */}
      <header className="h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center text-white">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              {t('consultation.title') || 'Teleconsultation Visit'}
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                {roomId}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Own Mode Badge */}
          <div
            data-testid="current-mode-indicator"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${currentBadge.color}`}
          >
            <span>{currentBadge.icon}</span>
            <span>{currentBadge.label}</span>
          </div>

          {/* Peer Mode Badge */}
          <div
            data-testid="peer-mode-indicator"
            className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium opacity-90 ${peerBadge.color}`}
          >
            <span className="text-slate-400">{t('consultation.peer_mode', 'Peer')}:</span>
            <span>{peerBadge.icon} {peerBadge.label}</span>
          </div>

          {/* Peer Presence Indicator */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs" data-testid="peer-presence">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isPeerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-300 hidden sm:inline">
              {otherPeer ? otherPeer.name : t('consultation.waiting_for_peer') || 'Waiting for peer...'}
            </span>
            <span className="text-[10px] text-slate-400 uppercase">
              ({isPeerOnline ? t('online') || 'Online' : t('offline') || 'Offline'})
            </span>
          </div>

          {/* WebRTC State Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-xs font-mono" data-testid="rtc-status">
            <span
              className={`${
                connectionState === 'connected'
                  ? 'text-emerald-400 font-bold'
                  : connectionState === 'connecting'
                  ? 'text-amber-400 font-bold'
                  : 'text-slate-400'
              }`}
            >
              RTC: {connectionState}
            </span>
          </div>
        </div>
      </header>

      {/* Mode Change Notice Banner */}
      {modeNotice && (
        <div
          data-testid="mode-change-banner"
          className="bg-amber-900/80 border-b border-amber-600/50 text-amber-100 px-4 py-2 text-xs flex items-center justify-between animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>
              <strong>{t('consultation.mode_changed_notice', { mode: getModeBadge(modeNotice.mode).label })}:</strong>{' '}
              {modeNotice.reason}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setModeNotice(null)}
            className="text-amber-300 hover:text-white px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Split Layout: Left = Media Viewport, Right = Chat & Notes */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Column: Media Viewport */}
        <section className="lg:col-span-7 xl:col-span-8 bg-black flex flex-col justify-between relative p-4">
          <div className="relative flex-1 rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-800 shadow-inner">
            {/* 1. VIDEO Mode: Render WebRTC Video streams */}
            {currentMode === CALL_MODES.VIDEO && (
              <>
                <video
                  ref={remoteVideoRef}
                  data-testid="remote-video"
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    remoteStream ? 'opacity-100' : 'opacity-0'
                  }`}
                />

                {!remoteStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <div className="w-20 h-20 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                      <User className="w-10 h-10" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-200">
                        {otherPeer
                          ? `${otherPeer.name} (${otherPeer.role})`
                          : t('consultation.waiting_connection') || 'Waiting for connection...'}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm">
                        {connectionState === 'connected'
                          ? t('consultation.media_flowing') || 'Media flowing, receiving stream...'
                          : t('consultation.connecting_webrtc') || 'Establishing peer-to-peer WebRTC connection...'}
                      </p>
                    </div>

                    {isDoctor && connectionState !== 'connected' && (
                      <button
                        type="button"
                        onClick={handleStartCall}
                        className="min-h-[48px] inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/40 transition-all cursor-pointer"
                      >
                        <PhoneCall className="w-4 h-4" />
                        {t('consultation.start_call_btn') || 'Connect Media (Start Call)'}
                      </button>
                    )}
                  </div>
                )}

                {/* Local PiP Video */}
                <div className="absolute bottom-4 right-4 w-36 h-28 sm:w-48 sm:h-36 rounded-xl overflow-hidden bg-slate-900 border-2 border-slate-700 shadow-2xl z-10">
                  <video
                    ref={localVideoRef}
                    data-testid="local-video"
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-200 ${
                      isVideoDisabled ? 'opacity-0' : 'opacity-100'
                    }`}
                  />
                  {isVideoDisabled && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-2 text-center text-xs">
                      <VideoOff className="w-6 h-6 mb-1 text-slate-500" />
                      <span>Camera Off</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 2. AUDIO_ONLY Mode: Video paused, audio stream active */}
            {currentMode === CALL_MODES.AUDIO_ONLY && (
              <div data-testid="audio-only-viewport" className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-sky-950 border-2 border-sky-500/60 flex items-center justify-center text-sky-400 shadow-xl shadow-sky-500/10">
                    <Volume2 className="w-12 h-12 animate-pulse" />
                  </div>
                  <span className="absolute -top-1 -right-1 bg-sky-500 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded-full">
                    AUDIO
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white">
                    {t('consultation.mode_audio', 'Audio Only Consultation')}
                  </h3>
                  <p className="text-xs text-sky-200/80 mt-1">
                    {t('consultation.audio_only_banner', 'Video paused to preserve weak connection. Real-time audio stream is active.')}
                  </p>
                </div>

                {/* Live audio connection badge */}
                <div className="inline-flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="text-slate-300">Live Voice Link Active</span>
                </div>
              </div>
            )}

            {/* 3. VOICE_NOTE Mode: Push-to-Talk active, call paused */}
            {currentMode === CALL_MODES.VOICE_NOTE && (
              <div data-testid="voice-note-viewport" className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md">
                <div className="w-24 h-24 rounded-full bg-amber-950 border-2 border-amber-500/60 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
                  <Radio className="w-12 h-12" />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white">
                    {t('consultation.mode_voice_note', 'Voice Note Mode')}
                  </h3>
                  <p className="text-xs text-amber-200/80 mt-1">
                    {t('consultation.voice_note_banner', 'Real-time call paused due to unstable network. Tap and hold the button below to send voice notes.')}
                  </p>
                </div>

                <div className="w-full max-w-sm pt-2">
                  <VoiceNoteRecorder
                    roomId={roomId}
                    onVoiceNoteSent={(res) => {
                      console.log('[VoiceNote] Sent successfully:', res);
                    }}
                    onUploadFailed={handleVoiceNoteUploadFailed}
                  />
                </div>
              </div>
            )}

            {/* 4. TEXT Mode: Chat only, severely degraded network */}
            {currentMode === CALL_MODES.TEXT && (
              <div data-testid="text-only-viewport" className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md">
                <div className="w-24 h-24 rounded-full bg-purple-950 border-2 border-purple-500/60 flex items-center justify-center text-purple-400 shadow-xl shadow-purple-500/10">
                  <MessageSquare className="w-12 h-12" />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white">
                    {t('consultation.mode_text', 'Text-Only Mode')}
                  </h3>
                  <p className="text-xs text-purple-200/80 mt-1">
                    {t('consultation.text_banner', 'Connection severely degraded. Voice calls paused; send real-time text messages in the chat panel.')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Floating Media Control Bar */}
          <div className="mt-4 flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-2">
              {(currentMode === CALL_MODES.VIDEO || currentMode === CALL_MODES.AUDIO_ONLY) && (
                <button
                  type="button"
                  data-testid="toggle-mic-btn"
                  onClick={toggleAudio}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-white transition active:scale-95 ${
                    isAudioMuted ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                  title={isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
                >
                  {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}

              {currentMode === CALL_MODES.VIDEO && (
                <button
                  type="button"
                  data-testid="toggle-cam-btn"
                  onClick={toggleVideo}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-white transition active:scale-95 ${
                    isVideoDisabled ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                  title={isVideoDisabled ? 'Turn Video On' : 'Turn Video Off'}
                >
                  {isVideoDisabled ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="end-call-btn"
                onClick={handleEndCall}
                className="h-11 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-900/30 transition active:scale-95"
              >
                <PhoneOff className="w-4 h-4" />
                <span>{t('consultation.end_call') || 'Leave Room'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Chat Timeline & Clinical Notes (Cols 8-12) */}
        <section className="lg:col-span-5 xl:col-span-4 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col h-full overflow-hidden">
          {/* Tab Navigation: Chat vs Clinical Notes */}
          <div className="flex border-b border-slate-800 shrink-0 bg-slate-950/60">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex-1 min-h-[48px] py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition ${
                activeTab === 'chat'
                  ? 'border-sky-500 text-sky-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>{t('consultation.tab_chat') || 'In-Call Chat'}</span>
            </button>

            {isDoctor && (
              <button
                type="button"
                onClick={() => setActiveTab('notes')}
                className={`flex-1 min-h-[48px] py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition ${
                  activeTab === 'notes'
                    ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>{t('consultation.tab_notes') || 'Clinical Notes'}</span>
              </button>
            )}
          </div>

          {/* TAB 1: Real-Time Chat & Voice Notes Timeline */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Message List */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <MessageSquare className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-xs">
                      {t('consultation.chat_empty') || 'No messages yet. Send a message to start conversation.'}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isOwn = msg.sender_id === user?.user_id;

                    // System notice message
                    if (msg.msg_type === 'system') {
                      return (
                        <div
                          key={msg.message_id || `sys-${index}`}
                          data-testid="system-notice-message"
                          className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-2 text-[11px] text-amber-200 text-center mx-auto max-w-sm"
                        >
                          {msg.content}
                        </div>
                      );
                    }

                    // Voice Note Card
                    if (msg.msg_type === 'voice_note') {
                      return (
                        <VoiceNoteCard
                          key={msg.message_id || `vn-${index}`}
                          audioUrl={msg.metadata?.file_url || ''}
                          durationSeconds={msg.metadata?.duration_seconds || 0}
                          senderName={msg.sender_name}
                          isOwn={isOwn}
                          timestamp={msg.timestamp}
                          delivered={Boolean(msg.delivered_to?.length > 1)}
                        />
                      );
                    }

                    // Regular Text Message
                    return (
                      <div
                        key={msg.message_id || `msg-${index}`}
                        data-testid="chat-message-item"
                        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {isOwn ? t('consultation.you') || 'You' : msg.sender_name}
                          </span>
                          <span className="text-[9px] text-slate-500">
                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>

                        <div
                          className={`px-3 py-2 rounded-2xl text-xs max-w-[85%] break-words shadow-sm ${
                            isOwn
                              ? 'bg-sky-600 text-white rounded-br-none'
                              : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700'
                          }`}
                        >
                          {msg.content}
                        </div>

                        {/* Delivery receipt */}
                        {isOwn && (
                          <div className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-0.5" data-testid="delivery-receipt">
                            <span>{msg.delivered_to?.length > 1 ? '✓✓ Delivered' : '✓ Sent'}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Remote Typing Indicator */}
                {remoteTyping.isTyping && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 italic">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-bounce"></span>
                    <span>{remoteTyping.name} is typing...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Optional Voice Note recorder toolbar when in VOICE_NOTE mode */}
              {currentMode === CALL_MODES.VOICE_NOTE && (
                <div className="p-2 border-t border-slate-800 bg-slate-950/40">
                  <VoiceNoteRecorder
                    roomId={roomId}
                    onVoiceNoteSent={() => {}}
                    onUploadFailed={handleVoiceNoteUploadFailed}
                  />
                </div>
              )}

              {/* Chat Input Bar */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center gap-2"
              >
                <input
                  type="text"
                  data-testid="chat-input"
                  value={chatInput}
                  onChange={handleChatInputChange}
                  placeholder={t('consultation.type_message_placeholder') || 'Type a message...'}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />

                <button
                  type="submit"
                  title="Send"
                  data-testid="send-chat-btn"
                  disabled={!chatInput.trim()}
                  className="h-10 w-10 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white flex items-center justify-center transition active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: Doctor Clinical Notes */}
          {activeTab === 'notes' && isDoctor && (
            <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {t('consultation.notes_heading') || 'Consultation Summary & Notes'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {t('consultation.notes_doctor_desc') ||
                    'Record diagnosis, clinical observations, and advice for the patient record.'}
                </p>
              </div>

              <textarea
                data-testid="clinical-notes-textarea"
                rows={10}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="Enter patient diagnosis, observations, and prescription advice..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />

              {completeSuccess ? (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <span>Consultation marked as completed successfully! Redirecting...</span>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="complete-consultation-btn"
                  disabled={isSubmittingNotes}
                  onClick={handleCompleteVisit}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition active:scale-98"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {isSubmittingNotes
                      ? 'Submitting...'
                      : t('consultation.complete_visit_btn') || 'Mark Consultation Completed'}
                  </span>
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Dev Simulator Panel (hidden in production) */}
      <DevSimulatorPanel
        currentMode={currentMode}
        peerMode={peerMode}
        stats={currentStats}
        badSampleCount={consecutiveBadSamples}
        goodSampleCount={consecutiveGoodSamples}
        failedUploadCount={failedUploads}
        onForceMode={handleDevForceMode}
        onSimulateStats={setSimulatedStats}
        onResetSimulation={() => setSimulatedStats(null)}
        onSimulateFailedUpload={() => handleVoiceNoteUploadFailed(failedUploads + 1)}
        onSimulateOffline={disconnectTemporarily}
      />
    </div>
  );
};
