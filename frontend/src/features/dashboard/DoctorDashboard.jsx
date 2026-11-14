import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stethoscope, CheckCircle, AlertTriangle, Video, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export const DoctorDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const isApproved = user?.doctor_status === 'approved';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white">
            <Stethoscope className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t('doctor_dashboard.welcome')}, {user?.full_name}
            </h2>
            <p className="text-emerald-100 text-sm mt-0.5">
              {user?.specialty || 'General Practitioner'} • Reg No: {user?.registration_number || 'Pending'}
            </p>
          </div>
        </div>
      </div>

      {/* Verification Status Card */}
      <div
        className={`rounded-3xl p-6 border shadow-xs transition-all ${
          isApproved
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-300'
        }`}
      >
        <div className="flex items-start gap-3">
          {isApproved ? (
            <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {t('doctor_dashboard.verification_notice')}
              </h3>
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                  isApproved
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}
              >
                {isApproved ? t('approved') : t('pending')}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {isApproved
                ? t('doctor_dashboard.status_approved_msg')
                : t('doctor_dashboard.status_pending_msg')}
            </p>
          </div>
        </div>
      </div>

      {/* Upcoming Consultation Queue Shell (Phase 2 Preview) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t('doctor_dashboard.schedule_preview')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Live doctor queue and WebRTC signalling portal (Phase 2)
            </p>
          </div>
          <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">
            0 {t('patient_dashboard.waiting_patients') || 'Waiting'}
          </span>
        </div>

        <div className="py-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">{t('doctor_dashboard.queue_empty')}</p>
        </div>
      </div>
    </div>
  );
};
