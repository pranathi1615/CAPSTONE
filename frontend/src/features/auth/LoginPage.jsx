import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Lock, Mail, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from './AuthContext';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

const DEMO_ACCOUNTS = [
  { label: 'Demo Patient (Clean - No Bookings)', email: 'patient.demo@carebridge.local', pass: 'Patient@123', role: 'patient' },
  { label: 'Patient (Anita)', email: 'patient.anita@carebridge.local', pass: 'Patient@123', role: 'patient' },
  { label: 'Doctor (Dr. Sharma - Approved)', email: 'dr.sharma@carebridge.local', pass: 'Doctor@123', role: 'doctor' },
  { label: 'Doctor (Dr. Patel - Pending)', email: 'dr.pending@carebridge.local', pass: 'Doctor@123', role: 'doctor' },
  { label: 'CHW (Lakshmi)', email: 'chw.lakshmi@carebridge.local', pass: 'Chw@123', role: 'chw' },
  { label: 'Pharmacy (Apollo)', email: 'pharmacy.apollo@carebridge.local', pass: 'Pharmacy@123', role: 'pharmacy' },
  { label: 'Admin', email: 'admin@carebridge.local', pass: 'Admin@123', role: 'admin' },
];

export const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(
        err.response?.data?.detail || 'Invalid email or password. Please verify your credentials.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFill = (acc) => {
    setEmail(acc.email);
    setPassword(acc.pass);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header bar with language selection */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center text-white shadow-sm">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-none">
              {t('app_title')}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">{t('app_tagline')}</p>
          </div>
        </div>
        <LanguageSwitcher />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-sm rounded-2xl border border-slate-200">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 text-center">
              {t('auth.login_title')}
            </h2>
            <p className="text-sm text-slate-600 text-center mt-1">
              {t('auth.login_subtitle')}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t('auth.email')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@carebridge.local"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900 text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t('auth.password')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900 text-base"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[50px] mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl shadow-xs text-base font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? t('loading') : t('auth.sign_in_btn')}
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <Link
              to="/register"
              className="text-sm font-semibold text-sky-600 hover:text-sky-700"
            >
              {t('auth.dont_have_account')}
            </Link>
          </div>

          {/* Quick Demo Credentials Picker for Viva & Examiners */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Demo Synthetic Accounts (Click to Fill):
            </span>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickFill(acc)}
                  className="text-left text-xs p-2 rounded-lg bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-slate-700 transition-colors"
                >
                  <span className="font-semibold block truncate">{acc.label}</span>
                  <span className="text-[10px] text-slate-500 block truncate">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
