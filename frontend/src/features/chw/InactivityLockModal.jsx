import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Unlock, ShieldAlert, KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export const InactivityLockModal = ({ inactivityTimeoutMs = 5 * 60 * 1000 }) => {
  const { t } = useTranslation();
  const { logout, user } = useAuth();

  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [configuredPin, setConfiguredPin] = useState(() => {
    return localStorage.getItem('chw_security_pin') || '1234';
  });

  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef(null);

  // Track activity
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    // Inactivity check interval
    timerRef.current = setInterval(() => {
      if (!isLocked && Date.now() - lastActivityRef.current >= inactivityTimeoutMs) {
        setIsLocked(true);
      }
    }, 5000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [inactivityTimeoutMs, isLocked]);

  const handleUnlock = (e) => {
    if (e) e.preventDefault();
    if (pin === configuredPin) {
      setIsLocked(false);
      setPin('');
      setErrorMsg('');
      lastActivityRef.current = Date.now();
    } else {
      setErrorMsg(t('lock_screen.wrong_pin') || 'Incorrect 4-digit PIN. Default is 1234.');
      setPin('');
    }
  };

  const handleManualLock = () => {
    setIsLocked(true);
    setPin('');
    setErrorMsg('');
  };

  const handleLogout = () => {
    sessionStorage.clear();
    logout();
  };

  return (
    <>
      {/* Floating Manual Lock Button for CHW */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          data-testid="manual-lock-device-btn"
          onClick={handleManualLock}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-semibold shadow-lg backdrop-blur-xs border border-slate-700 cursor-pointer transition active:scale-95"
          title="Lock device now to protect patient privacy"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('lock_screen.lock_device_btn') || 'Lock Device'}</span>
        </button>
      </div>

      {/* Screen Lock Overlay */}
      {isLocked && (
        <div
          data-testid="chw-screen-lock-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 transition-all"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-slate-200 text-center space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center shadow-inner">
              <Lock className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900">
                {t('lock_screen.title') || 'Device Locked'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {t('lock_screen.subtitle') ||
                  'Shared-device safety lock active to protect patient clinical privacy.'}
              </p>
              <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                CHW: {user?.full_name || 'Health Worker'}
              </span>
            </div>

            {errorMsg && (
              <div
                data-testid="lock-pin-error"
                className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2"
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 text-left">
                  {t('lock_screen.enter_pin_label') || 'Enter 4-Digit Security PIN'}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={4}
                    autoFocus
                    data-testid="lock-screen-pin-input"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full text-center tracking-[0.5em] font-mono font-bold text-lg py-2.5 pl-9 pr-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-slate-50 focus:bg-white"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 text-left">
                  {t('lock_screen.pin_hint') || 'Default demonstration PIN: 1234'}
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  data-testid="lock-screen-unlock-btn"
                  className="w-full min-h-[46px] rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <Unlock className="w-4 h-4" />
                  <span>{t('lock_screen.unlock_btn') || 'Unlock Screen'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1.5 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t('lock_screen.logout_btn') || 'Log Out Entirely'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
