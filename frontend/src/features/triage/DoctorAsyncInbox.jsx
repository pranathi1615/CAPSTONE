import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Inbox,
  Clock,
  AlertCircle,
  CheckCircle,
  FileText,
  Mic,
  Send,
  User,
  Activity,
  AlertTriangle,
  Play,
  Pill,
} from 'lucide-react';
import { getDoctorAsyncInboxApi, replyAsyncConsultApi } from './api';

export const DoctorAsyncInbox = () => {
  const { t } = useTranslation();
  const [consults, setConsults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConsult, setSelectedConsult] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [prescriptionId, setPrescriptionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadInbox = async () => {
    try {
      setLoading(true);
      const res = await getDoctorAsyncInboxApi();
      setConsults(res.data || []);
    } catch (err) {
      console.error('Failed to load doctor async inbox:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, []);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!selectedConsult) return;
    if (!replyText.trim()) {
      setErrorMsg('Please enter your clinical advice or recommendations.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');
      await replyAsyncConsultApi(selectedConsult.consult_id, {
        reply_text: replyText.trim(),
        prescription_id: prescriptionId.trim() || null,
      });

      setSuccessMsg('Reply sent successfully! Patient notified in-app and via MOCK SMS.');
      setReplyText('');
      setPrescriptionId('');
      await loadInbox();
      setTimeout(() => {
        setSelectedConsult(null);
        setSuccessMsg('');
      }, 2000);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to send reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const getUrgencyBadge = (urgency, isOverdue) => {
    if (isOverdue) {
      return 'bg-rose-600 text-white animate-pulse font-bold';
    }
    switch (urgency) {
      case 'emergency':
        return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      case 'urgent':
        return 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
      case 'soon':
        return 'bg-sky-100 text-sky-800 border-sky-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {t('async.doctor_inbox_title') || 'Asynchronous Consultations Inbox'}
            </h3>
            <p className="text-xs text-slate-500">
              {t('async.doctor_inbox_desc') || 'Review patient symptoms, vitals, photos & reply with prescriptions'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadInbox}
          className="text-xs font-semibold text-sky-600 hover:text-sky-800 cursor-pointer"
        >
          Refresh Inbox
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-xs text-slate-400">Loading consultations...</div>
      ) : consults.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-700">All caught up!</p>
          <p className="text-[11px] text-slate-400 mt-0.5">No pending async consults in your specialty queue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {consults.map((c) => {
            const isSelected = selectedConsult?.consult_id === c.consult_id;
            return (
              <div
                key={c.consult_id}
                onClick={() => setSelectedConsult(c)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/50 ring-2 ring-sky-500/20 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-bold text-sm text-slate-900 block">{c.patient_name}</span>
                    <span className="text-[11px] text-slate-500">{c.specialty} • Submitted by {c.submitted_by_role.toUpperCase()}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide border ${getUrgencyBadge(c.urgency, c.is_overdue)}`}>
                      {c.is_overdue ? 'OVERDUE' : c.urgency}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(c.deadline_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-700 mt-2 line-clamp-2">
                  {c.symptom_text || c.symptoms.join(', ') || 'No symptom text'}
                </p>

                {c.status === 'replied' ? (
                  <div className="mt-2 text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Replied</span>
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-sky-600 font-bold flex items-center gap-1">
                    <span>Click to review and reply →</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reply Modal */}
      {selectedConsult && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 relative">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wide border mb-1 ${getUrgencyBadge(selectedConsult.urgency, selectedConsult.is_overdue)}`}>
                  {selectedConsult.is_overdue ? 'OVERDUE (Needs Immediate Response)' : selectedConsult.urgency.toUpperCase()}
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Consultation: {selectedConsult.patient_name}
                </h3>
                <p className="text-xs text-slate-500">
                  Specialty: {selectedConsult.specialty} • Window: {selectedConsult.response_window_hours}h
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConsult(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mt-3 p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Clinical Details */}
            <div className="mt-4 space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Reported Symptoms</span>
                <p className="text-xs text-slate-800 font-medium mt-0.5">
                  {selectedConsult.symptom_text || selectedConsult.symptoms.join(', ')}
                </p>
              </div>

              {selectedConsult.vitals && Object.keys(selectedConsult.vitals).length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Recorded Vitals</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(selectedConsult.vitals).map(([k, v]) => (
                      <span key={k} className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-700">
                        {k.replace('_', ' ')}: <b>{v}</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Reply Form */}
            <form onSubmit={handleSendReply} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Doctor Clinical Advice & Instructions *
                </label>
                <textarea
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Enter medical advice, recommended home remedies, follow-up guidance..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Attach Prescription ID (Optional)
                </label>
                <div className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-emerald-600" />
                  <input
                    type="text"
                    value={prescriptionId}
                    onChange={(e) => setPrescriptionId(e.target.value)}
                    placeholder="e.g. prescription UUID if issued"
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">
                  Patient receives SMS & in-app update.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedConsult(null)}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submitting ? 'Sending...' : 'Send Reply'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
