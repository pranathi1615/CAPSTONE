import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadVoiceNoteApi } from './api';

/**
 * CareBridge Push-to-Record Voice Notes Component (Phase 3).
 * 
 * Features:
 * - Browser MediaRecorder audio capture (opus / webm).
 * - Live recording timer and audio visualizer wave pulse.
 * - Chunked multipart upload with automatic retries.
 * - Consecutive failure reporting to trigger step-down to TEXT.
 */
export const VoiceNoteRecorder = ({
  roomId,
  onVoiceNoteSent,
  onUploadFailed,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const failedUploadsCountRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setUploadError(null);
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await handleUpload(audioBlob, recordingDuration);
      };

      recorder.start(250); // 250ms chunks
      setIsRecording(true);
      setRecordingDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[VoiceNote] Error accessing microphone:', err);
      setUploadError(err.message || 'Microphone access denied');
    }
  }, [recordingDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    }
  }, [isRecording]);

  const handleUpload = async (audioBlob, duration) => {
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', audioBlob, `voice_note_${Date.now()}.webm`);
    formData.append('room_id', roomId);
    formData.append('duration_seconds', Math.max(1, duration).toString());

    // Upload with up to 3 automatic retries
    let attempt = 0;
    let uploadSuccess = false;

    while (attempt < 3 && !uploadSuccess) {
      attempt += 1;
      try {
        const res = await uploadVoiceNoteApi(formData);
        uploadSuccess = true;
        failedUploadsCountRef.current = 0;
        setIsUploading(false);
        if (onVoiceNoteSent) {
          onVoiceNoteSent(res.data);
        }
        return;
      } catch (err) {
        console.warn(`[VoiceNote] Upload attempt ${attempt} failed:`, err);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    // If all retries failed
    setIsUploading(false);
    failedUploadsCountRef.current += 1;
    setUploadError(t('consultation.voice_note_failed', 'Voice note upload failed.'));

    if (onUploadFailed) {
      onUploadFailed(failedUploadsCountRef.current);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex flex-col gap-1 w-full bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRecording && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
          )}
          <span className="text-xs font-semibold text-slate-300">
            {isRecording
              ? `${t('consultation.recording', 'Recording')} (${formatTimer(recordingDuration)})`
              : isUploading
              ? t('consultation.uploading_voice', 'Uploading voice note...')
              : t('consultation.push_to_record', 'Push-to-Talk Voice Note')}
          </span>
        </div>

        {uploadError && (
          <span className="text-[11px] text-rose-400 font-medium">
            {uploadError}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-1">
        {!isRecording ? (
          <button
            type="button"
            data-testid="record-voice-note-btn"
            disabled={disabled || isUploading}
            onClick={startRecording}
            className="flex-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20 active:scale-98 transition disabled:opacity-50"
          >
            <span className="text-base">🎙️</span>
            <span>{t('consultation.hold_to_record', 'Tap to Record Voice Note')}</span>
          </button>
        ) : (
          <button
            type="button"
            data-testid="stop-voice-note-btn"
            onClick={stopRecording}
            className="flex-1 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 active:scale-98 transition"
          >
            <span className="text-base">⏹️</span>
            <span>{t('consultation.stop_and_send', 'Stop & Send')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
