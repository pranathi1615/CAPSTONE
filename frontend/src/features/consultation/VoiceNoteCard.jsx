import React, { useState, useRef, useEffect } from 'react';

/**
 * CareBridge Voice Note Message Card for Timeline.
 * 
 * Renders push-to-record voice note in consultation chat timeline
 * with playback controls, duration, and delivery receipt indicator.
 */
export const VoiceNoteCard = ({
  audioUrl,
  durationSeconds = 0,
  senderName,
  isOwn = false,
  timestamp,
  delivered = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  // Normalize API backend host for audio file
  const fullAudioUrl = audioUrl.startsWith('http')
    ? audioUrl
    : `${window.location.protocol}//${window.location.hostname}:8000${audioUrl}`;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch((err) => console.warn('Audio play error:', err));
    }
  };

  const formatSecs = (sec) => {
    const s = Math.round(sec);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const effectiveDuration = durationSeconds || (audioRef.current?.duration || 0);

  return (
    <div
      data-testid="voice-note-card"
      className={`flex flex-col gap-1 max-w-[280px] p-2.5 rounded-2xl shadow-sm ${
        isOwn
          ? 'bg-emerald-600 text-white rounded-br-none ml-auto'
          : 'bg-slate-800 text-slate-100 rounded-bl-none mr-auto border border-slate-700'
      }`}
    >
      <audio ref={audioRef} src={fullAudioUrl} preload="metadata" />

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="play-voice-note-btn"
          onClick={togglePlayback}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow transition active:scale-95 ${
            isOwn ? 'bg-white text-emerald-700' : 'bg-amber-500 text-slate-950'
          }`}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="flex-1 flex flex-col gap-0.5">
          <div className="flex items-center justify-between text-[11px] font-mono opacity-90">
            <span>📻 Voice Note</span>
            <span>
              {isPlaying ? formatSecs(currentTime) : formatSecs(effectiveDuration)}
            </span>
          </div>

          {/* Simple progress bar */}
          <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${isOwn ? 'bg-white' : 'bg-amber-400'}`}
              style={{
                width: effectiveDuration > 0
                  ? `${Math.min(100, (currentTime / effectiveDuration) * 100)}%`
                  : '0%',
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] opacity-75 mt-0.5">
        <span className="font-semibold">{isOwn ? 'You' : senderName}</span>
        <div className="flex items-center gap-1">
          <span>{timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          {isOwn && (
            <span
              title={delivered ? 'Delivered' : 'Sent'}
              data-testid="delivery-receipt-indicator"
              className={delivered ? 'text-white font-bold' : 'text-slate-300'}
            >
              {delivered ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
