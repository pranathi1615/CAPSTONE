import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Mic,
  MicOff,
  Volume2,
  CheckCircle,
  AlertCircle,
  Thermometer,
  Wind,
  Headphones,
  HeartCrack,
  Activity,
  Zap,
  Info,
  Square,
  Play,
} from 'lucide-react';

// Symptom catalog with localized synonyms for automatic keyword mapping
export const SYMPTOM_CATALOG = [
  {
    id: 'fever',
    labelEn: 'Fever / High Body Temp',
    labelHi: 'बुखार / तेज तापमान',
    labelTe: 'జ్వరం / అధిక ఉష్ణోగ్రత',
    icon: <Thermometer className="w-5 h-5 text-rose-500" />,
    keywords: ['fever', 'temperature', 'pyrexia', 'बुखार', 'ताप', 'జ్వరం', 'వేడి'],
  },
  {
    id: 'cough',
    labelEn: 'Cough / Phlegm',
    labelHi: 'खांसी / बलगम',
    labelTe: 'దగ్గు / కఫం',
    icon: <Wind className="w-5 h-5 text-amber-500" />,
    keywords: ['cough', 'phlegm', 'dry cough', 'खांसी', 'बलगम', 'దగ్గు', 'కఫం'],
  },
  {
    id: 'headache',
    labelEn: 'Headache / Migraine',
    labelHi: 'सिरदर्द / आधासीसी',
    labelTe: 'తలనెప్పి / మైగ్రేన్',
    icon: <Zap className="w-5 h-5 text-indigo-500" />,
    keywords: ['headache', 'head pain', 'migraine', 'सिरदर्द', 'सर दर्द', 'తలనెప్పి', 'తలపోటు'],
  },
  {
    id: 'chest_pain',
    labelEn: 'Chest Pain / Tightness',
    labelHi: 'सीने में दर्द / जकड़न',
    labelTe: 'ఛాతీ నొప్పి / పట్టేసినట్లు ఉండడం',
    icon: <HeartCrack className="w-5 h-5 text-red-600" />,
    keywords: ['chest pain', 'chest tightness', 'heart pain', 'सीने में दर्द', 'छाती में दर्द', 'ఛాతీ నొప్పి'],
  },
  {
    id: 'shortness_of_breath',
    labelEn: 'Shortness of Breath',
    labelHi: 'सांस लेने में कठिनाई',
    labelTe: 'శ్వాస ఆడకపోవడం',
    icon: <Activity className="w-5 h-5 text-cyan-600" />,
    keywords: ['breath', 'breathing', 'dyspnea', 'सांस', 'दम घुटना', 'శ్వాస', 'ఆయాసం'],
  },
  {
    id: 'stomach_pain',
    labelEn: 'Abdominal / Stomach Pain',
    labelHi: 'पेट में दर्द / मरोड़',
    labelTe: 'కడుపు నొప్పి',
    icon: <Activity className="w-5 h-5 text-orange-500" />,
    keywords: ['stomach', 'belly', 'abdomen', 'cramp', 'पेट दर्द', 'पेट में दर्द', 'కడుపు నొప్పి'],
  },
  {
    id: 'nausea_vomiting',
    labelEn: 'Nausea / Vomiting',
    labelHi: 'उल्टी / जी मिचलाना',
    labelTe: 'వాంతులు / వికారం',
    icon: <Activity className="w-5 h-5 text-emerald-500" />,
    keywords: ['vomit', 'vomiting', 'nausea', 'उल्टी', 'मिचली', 'వాంతులు', 'వికారం'],
  },
  {
    id: 'weakness_fatigue',
    labelEn: 'Weakness / Fatigue',
    labelHi: 'कमजोरी / अत्यधिक थकान',
    labelTe: 'నీరసం / అలసట',
    icon: <Activity className="w-5 h-5 text-purple-500" />,
    keywords: ['weakness', 'fatigue', 'tired', 'कमजोरी', 'थकान', 'నీరసం', 'అలసట'],
  },
];

export const VoiceSymptomInput = ({
  selectedSymptoms = [],
  onSymptomsChange,
  transcript = '',
  onTranscriptChange,
  voiceNoteBlob = null,
  onVoiceNoteBlobChange,
}) => {
  const { t, i18n } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [selectedLang, setSelectedLang] = useState('en-IN');
  const [speechError, setSpeechError] = useState('');
  const recognitionRef = useRef(null);

  // Audio voice note recording fallback
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioTimerRef = useRef(null);

  // Sync selected recognition language with app locale
  useEffect(() => {
    const currentLang = i18n.language || 'en';
    if (currentLang === 'te') setSelectedLang('te-IN');
    else if (currentLang === 'hi') setSelectedLang('hi-IN');
    else setSelectedLang('en-IN');
  }, [i18n.language]);

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLang;

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }

      if (finalTranscript.trim()) {
        const updated = transcript ? `${transcript} ${finalTranscript.trim()}` : finalTranscript.trim();
        onTranscriptChange(updated);
        mapTranscriptToSymptoms(updated);
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        setSpeechError('Microphone access denied. Please check permissions or use icon picker.');
      } else if (event.error === 'network') {
        setSpeechError('Web Speech API requires network connectivity. Using offline fallback picker.');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, [selectedLang, transcript]);

  // Keyword mapping logic from spoken transcript into symptom pills
  const mapTranscriptToSymptoms = (text) => {
    const lower = text.toLowerCase();
    const detected = new Set(selectedSymptoms);

    SYMPTOM_CATALOG.forEach((item) => {
      const match = item.keywords.some((kw) => lower.includes(kw.toLowerCase()));
      if (match) {
        detected.add(item.id);
      }
    });

    onSymptomsChange(Array.from(detected));
  };

  const toggleListening = () => {
    if (!speechSupported) {
      setSpeechError('Speech recognition is not supported in this browser. Please use icon picker below.');
      return;
    }

    setSpeechError('');
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
      setIsListening(false);
    } else {
      try {
        if (recognitionRef.current) {
          recognitionRef.current.lang = selectedLang;
          recognitionRef.current.start();
          setIsListening(true);
        }
      } catch (err) {
        console.warn('Error starting speech recognition:', err);
        setIsListening(false);
      }
    }
  };

  const toggleSymptom = (symptomId) => {
    if (selectedSymptoms.includes(symptomId)) {
      onSymptomsChange(selectedSymptoms.filter((id) => id !== symptomId));
    } else {
      onSymptomsChange([...selectedSymptoms, symptomId]);
    }
  };

  // Push-to-Talk Fallback Voice Note
  const startAudioRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        onVoiceNoteBlobChange(audioBlob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(0);

      audioTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Audio recording failed:', err);
      setSpeechError('Microphone capture failed. Please use icon picker.');
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
      clearInterval(audioTimerRef.current);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Voice Recognition Header & Language Selector */}
      <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-sky-700" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                {t('symptoms.voice_input_heading') || 'Regional Voice Symptom Input'}
              </h4>
              <p className="text-[11px] text-slate-500">
                Speak in Telugu, Hindi, or English to auto-extract symptoms
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              data-testid="voice-lang-select"
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800"
            >
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">हिन्दी (Hindi)</option>
              <option value="te-IN">తెలుగు (Telugu)</option>
            </select>

            <button
              type="button"
              data-testid="toggle-voice-btn"
              onClick={toggleListening}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                isListening
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-4 h-4" />
                  <span>{t('symptoms.stop_listening') || 'Stop Listening'}</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>{t('symptoms.speak_symptoms') || 'Speak Symptoms'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Speech Transcript Box */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">
            {t('symptoms.confirmed_transcript_label') || 'Confirmed Speech Transcript'}:
          </label>
          <div className="relative">
            <textarea
              data-testid="symptoms-transcript-textarea"
              rows={2}
              value={transcript}
              onChange={(e) => {
                onTranscriptChange(e.target.value);
                mapTranscriptToSymptoms(e.target.value);
              }}
              placeholder="e.g. Patient has severe fever, body ache, and persistent cough since 3 days..."
              className="w-full text-xs p-3 rounded-xl border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-sky-500"
            />
            {transcript && (
              <button
                type="button"
                onClick={() => {
                  onTranscriptChange('');
                  onSymptomsChange([]);
                }}
                className="absolute right-2 bottom-2 text-[10px] text-slate-400 hover:text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Web Speech Disclaimer */}
        <div className="flex items-start gap-1.5 text-[10px] text-slate-500 bg-white/80 p-2.5 rounded-xl border border-slate-200">
          <Info className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
          <span>
            {t('symptoms.speech_disclaimer') ||
              'Web Speech API recognition accuracy depends on browser engine & network access. If offline or unavailable, use the touch icon picker or recorded voice note below.'}
          </span>
        </div>

        {speechError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{speechError}</span>
          </div>
        )}
      </div>

      {/* 2. Fallback Push-To-Talk Voice Note Recording */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Headphones className="w-4 h-4 text-slate-600" />
          <div>
            <span className="font-bold text-slate-800">
              {t('symptoms.voice_note_fallback_heading') || 'Push-to-Talk Voice Note (Offline Outbox Fallback)'}
            </span>
            <p className="text-[10px] text-slate-500">
              Record patient voice description locally to queue for doctor review
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isRecordingAudio ? (
            <button
              type="button"
              data-testid="stop-voice-note-rec-btn"
              onClick={stopAudioRecording}
              className="px-3 py-1.5 bg-rose-600 text-white rounded-xl font-bold flex items-center gap-1.5 animate-pulse cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop ({recordingSeconds}s)</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="start-voice-note-rec-btn"
              onClick={startAudioRecording}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition active:scale-95"
            >
              <Mic className="w-3.5 h-3.5 text-rose-400" />
              <span>{voiceNoteBlob ? 'Re-record Voice Note' : 'Record Voice Note'}</span>
            </button>
          )}

          {voiceNoteBlob && (
            <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
              Audio Saved ✓ ({(voiceNoteBlob.size / 1024).toFixed(1)} KB)
            </span>
          )}
        </div>
      </div>

      {/* 3. Icon-Based Touch Symptom Picker */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-800">
          {t('symptoms.select_symptoms_heading') || 'Select Symptoms (Touch Icon Picker)'}:
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SYMPTOM_CATALOG.map((sym) => {
            const isSelected = selectedSymptoms.includes(sym.id);
            const label =
              i18n.language === 'te' ? sym.labelTe : i18n.language === 'hi' ? sym.labelHi : sym.labelEn;

            return (
              <button
                type="button"
                key={sym.id}
                data-testid={`symptom-card-${sym.id}`}
                onClick={() => toggleSymptom(sym.id)}
                className={`min-h-[56px] p-3 rounded-2xl border text-left transition-all flex items-start gap-2.5 cursor-pointer touch-manipulation ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/90 ring-2 ring-sky-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="mt-0.5 shrink-0">{sym.icon}</div>
                <div className="flex-1 min-w-0">
                  <span
                    className={`block text-xs font-bold leading-tight ${
                      isSelected ? 'text-sky-950 font-extrabold' : 'text-slate-800'
                    }`}
                  >
                    {label}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] text-sky-700 font-bold flex items-center gap-1 mt-1">
                      <CheckCircle className="w-3 h-3 text-sky-600" /> Selected
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
