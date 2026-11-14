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
  Clock,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useWebSocket } from './useWebSocket';
import { useWebRTC } from './useWebRTC';
import { getConsultationMessagesApi, completeConsultationApi } from './api';

export const ConsultationRoom = () => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('bookingId');

  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'notes'
  const [chatInput, setChatInput] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSubmittingNotes, setIsSubmittingNotes] = useState(false);
  const [completeSuccess, setCompleteSuccess] = useState(false);
  const [hasStartedMedia, setHasStartedMedia] = useState(false);

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

  const {
    isConnected: isWsConnected,
    messages,
    setMessages,
    peerPresence,
    remoteTyping,
    sendChatMessage,
    sendSignal,
    sendTyping,
    endCall: wsEndCall,
  } = useWebSocket({
    roomId,
    onSignal: handleIncomingSignal,
    onCallEnded: handleRemoteCallEnded,
    enabled: Boolean(roomId),
  });

  // 2. WebRTC Hook
  const {
    localStream,
    remoteStream,
    connectionState,
    isAudioMuted,
    isVideoDisabled,
    mediaError,
    initLocalMedia,
    createOffer,
    handleSignal,
    toggleAudio,
    toggleVideo,
    endCall: rtcEndCall,
  } = useWebRTC({
    sendSignal,
    isInitiator: isDoctor,
  });

  // Keep a ref to handleSignal so the WS callback always has the latest reference
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

      // Initialize media automatically
      try {
        const stream = await initLocalMedia();
        if (isMounted && stream) {
          setHasStartedMedia(true);
        }
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

  // 6. Chat input & typing indicator handlers
  const handleChatInputChange = (e) => {
    setChatInput(e.target.value);
    sendTyping(e.target.value.length > 0);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    sendChatMessage(chatInput.trim());
    sendTyping(false);
    setChatInput('');
  };

  // 7. Doctor starts WebRTC Offer
  const handleStartCall = async () => {
    await createOffer();
  };

  // 8. End Call & Hangup
  const handleEndCall = () => {
    if (window.confirm(t('consultation.confirm_leave') || 'Are you sure you want to leave the consultation?')) {
      wsEndCall();
      rtcEndCall();
      navigate('/dashboard');
    }
  };

  // 9. Doctor completes visit
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

  // Find if other peer is online
  const peers = Object.values(peerPresence).filter((p) => p.userId !== user?.user_id);
  const otherPeer = peers.length > 0 ? peers[0] : null;
  const isPeerOnline = otherPeer?.status === 'online';

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

        <div className="flex items-center gap-3">
          {/* Peer Presence Indicator */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs">
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

      {/* Main Split Layout: Left = Video, Right = Chat & Notes */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Column: Video & Media Controls (Cols 1-7 or 1-8) */}
        <section className="lg:col-span-7 xl:col-span-8 bg-black flex flex-col justify-between relative p-4">
          {/* Main Remote Video Viewport */}
          <div className="relative flex-1 rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center border border-slate-800 shadow-inner">
            <video
              ref={remoteVideoRef}
              data-testid="remote-video"
              autoPlay
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                remoteStream ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Placeholder when remote video is not yet streaming */}
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

                {/* Doctor Initiator Button */}
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

            {/* Local Video Picture-in-Picture (PiP) */}
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
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-slate-400 text-xs">
                  <VideoOff className="w-6 h-6" />
                </div>
              )}
              <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-white/90 bg-black/60 px-1.5 py-0.5 rounded">
                {t('consultation.you') || 'You'} ({isAudioMuted ? 'Muted' : 'Live'})
              </div>
            </div>

            {/* Media Permission Warning */}
            {mediaError && (
              <div className="absolute top-4 left-4 right-4 bg-rose-950/90 border border-rose-800 text-rose-200 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 z-20">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{mediaError}</span>
              </div>
            )}
          </div>

          {/* Bottom Floating Call Controls */}
          <div className="pt-4 flex items-center justify-center gap-4">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={toggleAudio}
              className={`min-h-[48px] min-w-[48px] p-3 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                isAudioMuted
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title={isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
              aria-label={isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {isAudioMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            {/* Video Toggle */}
            <button
              type="button"
              onClick={toggleVideo}
              className={`min-h-[48px] min-w-[48px] p-3 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                isVideoDisabled
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title={isVideoDisabled ? 'Turn Video On' : 'Turn Video Off'}
              aria-label={isVideoDisabled ? 'Turn Video On' : 'Turn Video Off'}
            >
              {isVideoDisabled ? <VideoOff className="w-6 h-6" /> : <VideoIcon className="w-6 h-6" />}
            </button>

            {/* End Call Button */}
            <button
              type="button"
              onClick={handleEndCall}
              className="min-h-[48px] px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-rose-900/40 transition-all cursor-pointer"
              title="End Call"
            >
              <PhoneOff className="w-6 h-6" />
              <span className="hidden sm:inline">{t('consultation.end_call') || 'End Call'}</span>
            </button>
          </div>
        </section>

        {/* Right Column: In-Call Chat & Clinical Notes (Cols 8-12) */}
        <section className="lg:col-span-5 xl:col-span-4 bg-slate-900 border-l border-slate-800 flex flex-col h-full overflow-hidden">
          {/* Tab Navigation: Chat vs Notes */}
          <div className="flex border-b border-slate-800 bg-slate-900/60 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex-1 min-h-[48px] py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'chat'
                  ? 'border-sky-500 text-sky-400 bg-sky-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              {t('consultation.tab_chat') || 'In-Call Chat'}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`flex-1 min-h-[48px] py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'notes'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              {t('consultation.tab_notes') || 'Clinical Notes'}
            </button>
          </div>

          {/* TAB 1: Real-time In-Call Chat */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-xs">
                      {t('consultation.chat_empty') || 'No messages yet. Send a message to start conversation.'}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isMe = msg.sender_id === user?.user_id;
                    return (
                      <div
                        key={msg.message_id || idx}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-300">
                            {isMe ? t('consultation.you') || 'You' : msg.sender_name}
                          </span>
                          <span>•</span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(msg.created_at || Date.now()).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            isMe
                              ? 'bg-sky-600 text-white rounded-br-xs'
                              : 'bg-slate-800 text-slate-100 rounded-bl-xs border border-slate-700'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Remote Typing Indicator */}
                {remoteTyping.isTyping && (
                  <div className="flex items-center gap-2 text-xs text-sky-400 italic py-1 animate-pulse">
                    <span>{remoteTyping.name} is typing...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Field */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900/90 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={handleChatInputChange}
                  placeholder={t('consultation.type_message_placeholder') || 'Type a message...'}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="min-h-[48px] min-w-[48px] px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Send"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: Empty Clinical Notes Panel & Visit Completion (Goal 7) */}
          {activeTab === 'notes' && (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200">
                  {t('consultation.notes_heading') || 'Consultation Summary & Notes'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {isDoctor
                    ? t('consultation.notes_doctor_desc') || 'Record diagnosis, clinical observations, and advice for the patient record.'
                    : t('consultation.notes_patient_desc') || 'Clinical notes recorded by your doctor will appear here.'}
                </p>
              </div>

              {completeSuccess ? (
                <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm">Consultation Completed!</h4>
                    <p className="text-xs mt-0.5 text-emerald-300">
                      Notes have been saved and the session marked as completed. Redirecting...
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    rows={8}
                    value={clinicalNotes}
                    onChange={(e) => setClinicalNotes(e.target.value)}
                    disabled={!isDoctor || isSubmittingNotes}
                    placeholder={
                      isDoctor
                        ? 'Enter clinical findings, diagnosis, recommended dosage, or advice...'
                        : 'Doctor is conducting the consultation...'
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />

                  {isDoctor && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleCompleteVisit}
                        disabled={isSubmittingNotes}
                        className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle className="w-5 h-5" />
                        {isSubmittingNotes
                          ? 'Saving & Completing...'
                          : t('consultation.complete_visit_btn') || 'Mark Consultation Completed'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
