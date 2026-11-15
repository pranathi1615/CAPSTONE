import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarCheck,
  PhoneCall,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Stethoscope,
  RefreshCw,
} from 'lucide-react';
import { getChwFollowupsDueTodayApi, completeFollowUpApi } from './api';

export const ChwFollowupsDueToday = () => {
  const { t } = useTranslation();
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState(null);
  const [actionMsg, setActionMsg] = useState('');

  const loadDueToday = async () => {
    try {
      setLoading(true);
      const res = await getChwFollowupsDueTodayApi();
      setFollowups(res.data || []);
    } catch (err) {
      console.error('Failed to load follow-ups due today:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDueToday();
  }, []);

  const handleComplete = async (followupId) => {
    try {
      setCompletingId(followupId);
      await completeFollowUpApi(followupId);
      setActionMsg('Follow-up marked completed successfully!');
      await loadDueToday();
      setTimeout(() => setActionMsg(''), 3000);
    } catch (err) {
      console.error('Failed to complete follow-up:', err);
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {t('followup.chw_title') || 'Follow-ups Due Today'}
            </h3>
            <p className="text-xs text-slate-500">
              {t('followup.chw_desc') || 'Community health surveillance: check on patients requiring medical re-evaluation'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadDueToday}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {actionMsg && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-xs text-slate-400">Loading follow-ups...</div>
      ) : followups.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-700">No follow-ups due today</p>
          <p className="text-[11px] text-slate-400 mt-0.5">All scheduled community follow-ups are up to date.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {followups.map((f) => (
            <div
              key={f.followup_id}
              className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">{f.patient_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${
                    f.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : f.status === 'missed'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-900'
                  }`}>
                    {f.status}
                  </span>
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <Stethoscope className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>Dr. {f.doctor_name}</span>
                </div>
                <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <b>Reason:</b> {f.reason}
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {f.patient_phone && (
                  <a
                    href={`tel:${f.patient_phone}`}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Call</span>
                  </a>
                )}
                {f.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={() => handleComplete(f.followup_id)}
                    disabled={completingId === f.followup_id}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{completingId === f.followup_id ? 'Saving...' : 'Mark Completed'}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
