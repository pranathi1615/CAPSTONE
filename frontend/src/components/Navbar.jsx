import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, LogOut, Smartphone } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { LanguageSwitcher } from './LanguageSwitcher';

export const Navbar = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'doctor':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'chw':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'pharmacy':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-sky-100 text-sky-800 border-sky-300';
    }
  };

  const isDevInbox = location.pathname === '/dev-inbox';

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center text-white shadow-sm">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xl font-bold text-slate-900 tracking-tight">
                  {t('app_title')}
                </span>
                <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                  Phase 2 (Real-Time Visit)
                </span>
              </div>
            </Link>
          </div>

          {/* Controls: Dev Inbox Link + Language Switcher + User Info + Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Dev Inbox Link */}
            <Link
              to="/dev-inbox"
              className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                isDevInbox
                  ? 'bg-violet-100 border-violet-300 text-violet-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="View Simulated SMS Inbox"
            >
              <Smartphone className="w-4 h-4 text-violet-600" />
              <span className="hidden md:inline">SMS Inbox</span>
              <span className="px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 font-extrabold text-[9px]">
                MOCK
              </span>
            </Link>

            <LanguageSwitcher />

            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-sm font-semibold text-slate-800">
                    {user.full_name}
                  </span>
                  <span className={`text-xs px-2 py-0.2 rounded-full border self-end ${getRoleBadgeColor(user.role)}`}>
                    {t(`roles.${user.role}`)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                  title={t('logout')}
                  aria-label={t('logout')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
