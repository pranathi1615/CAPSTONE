import React, { useState, useEffect } from 'react';
import { AlertCircle, PhoneCall, X, ShieldAlert, Clock } from 'lucide-react';

export const DoctorEmergencyAlertBanner = ({ ws, onSelectEmergency }) => {
  const [activeAlert, setActiveAlert] = useState(null);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      try {
        const envelope = JSON.parse(event.data);
        if (envelope.type === 'emergency_alert') {
          setActiveAlert(envelope.payload);
        }
      } catch (err) {
        // Non-JSON or other format
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  if (!activeAlert) return null;

  return (
    <div
      data-testid="on-call-emergency-alert-banner"
      className="fixed top-16 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 animate-in slide-in-from-top duration-300 shadow-2xl"
    >
      <div className="bg-rose-600 text-white p-4 rounded-2xl border-2 border-rose-300 shadow-rose-900/40 relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center animate-pulse">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full inline-block">
                On-Call Urgent Alert
              </span>
              <h4 className="text-sm font-bold mt-0.5">Emergency Triage Escalated</h4>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveAlert(null)}
            className="text-white/70 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-2.5 text-xs text-rose-100 bg-rose-700/60 p-2.5 rounded-xl">
          <p className="font-bold text-white text-xs">
            Patient: {activeAlert.patient_name}
          </p>
          <p className="mt-1">{activeAlert.reason}</p>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-rose-200">
            <Clock className="w-3 h-3" />
            <span>Target Response: <b>IMMEDIATE (0 min)</b></span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {onSelectEmergency && (
            <button
              type="button"
              onClick={() => {
                onSelectEmergency(activeAlert);
                setActiveAlert(null);
              }}
              className="flex-1 py-1.5 px-3 rounded-xl bg-white text-rose-700 hover:bg-rose-50 font-bold text-xs transition-colors cursor-pointer text-center"
            >
              Respond Immediately
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveAlert(null)}
            className="py-1.5 px-3 rounded-xl bg-rose-800/80 hover:bg-rose-800 text-white font-medium text-xs transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
