import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pill, QrCode, Store, ShieldAlert } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export const PharmacyDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white">
            <Pill className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t('pharmacy_dashboard.welcome')}
            </h2>
            <p className="text-blue-100 text-sm mt-0.5">
              {user?.full_name} • Dispensary & Verification Gateway
            </p>
          </div>
        </div>
      </div>

      {/* Prescription Verification Shell (Phase 4) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <QrCode className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t('pharmacy_dashboard.scanner_heading')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              {t('pharmacy_dashboard.scanner_desc')}
            </p>
          </div>
        </div>

        <div className="mt-8 py-10 border-2 border-dashed border-slate-200 rounded-2xl text-center">
          <QrCode className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">
            Ed25519 single-use cryptographic QR verify & dispense module (Phase 4)
          </p>
        </div>
      </div>

      {/* Stock Management Shell */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 text-sm">
              {t('pharmacy_dashboard.stock_management_shell')}
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Live generic inventory & patient distance finder (Phase 4)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
