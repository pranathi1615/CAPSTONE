import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Lock, Mail, User, Phone, Stethoscope, ArrowRight } from 'lucide-react';
import { useAuth } from './AuthContext';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

export const RegisterPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'patient',
    registration_number: '',
    specialty: '',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      await register(formData);
      setSuccess(t('auth.register_success'));
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err) {
      setError(
        err.response?.data?.detail || 'Failed to create account. Please check your inputs.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
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
              {t('auth.register_title')}
            </h2>
            <p className="text-sm text-slate-600 text-center mt-1">
              {t('auth.register_subtitle')}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t('auth.full_name')} *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  name="full_name"
                  required
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="Anita Devi"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900 text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t('auth.email')} *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="anita@carebridge.local"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900 text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t('auth.password')} *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900 text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t('auth.role')}
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="block w-full px-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900 text-base bg-white"
              >
                <option value="patient">{t('roles.patient')}</option>
                <option value="doctor">{t('roles.doctor')}</option>
                <option value="chw">{t('roles.chw')}</option>
                <option value="pharmacy">{t('roles.pharmacy')}</option>
                <option value="admin">{t('roles.admin')}</option>
              </select>
            </div>

            {formData.role === 'doctor' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                  <Stethoscope className="w-4 h-4" />
                  <span>Medical Verification Required (Starts in Pending status)</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">
                    {t('auth.doctor_reg_no')} *
                  </label>
                  <input
                    type="text"
                    name="registration_number"
                    required
                    value={formData.registration_number}
                    onChange={handleChange}
                    placeholder="MCI-2024-XXXX"
                    className="block w-full px-3 py-2.5 rounded-lg border border-amber-300 text-slate-900 text-sm bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">
                    {t('auth.specialty')}
                  </label>
                  <input
                    type="text"
                    name="specialty"
                    value={formData.specialty}
                    onChange={handleChange}
                    placeholder="General Medicine / Cardiology"
                    className="block w-full px-3 py-2.5 rounded-lg border border-amber-300 text-slate-900 text-sm bg-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t('auth.phone')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-5 h-5" />
                </div>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 98765 43210"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] rounded-xl border border-slate-300 shadow-2xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900 text-base"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[50px] mt-4 flex items-center justify-center gap-2 py-3 px-4 rounded-xl shadow-xs text-base font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? t('loading') : t('auth.register_btn')}
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <Link
              to="/login"
              className="text-sm font-semibold text-sky-600 hover:text-sky-700"
            >
              {t('auth.already_have_account')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
