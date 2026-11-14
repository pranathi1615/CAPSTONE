import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, RefreshCw, Smartphone, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { getMockSmsInboxApi } from '../consultation/api';

export const DevInboxPage = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchInbox = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getMockSmsInboxApi(50);
      setMessages(res.data || []);
    } catch (err) {
      setError('Failed to load simulated SMS inbox.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInbox();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchInbox, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-700 to-indigo-800 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-white">
              <Smartphone className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-extrabold tracking-tight">
                  {t('notifications.dev_inbox_title') || 'Developer SMS Inbox'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider">
                  MOCK
                </span>
              </div>
              <p className="text-violet-200 text-xs sm:text-sm mt-0.5">
                Simulated SMS gateway messages for appointment confirmations & reminders
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchInbox}
            disabled={loading}
            className="self-start sm:self-auto min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Messages List */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Dispatched SMS Transmissions ({messages.length})
            </h3>
            <p className="text-xs text-slate-500">
              Labelled [MOCK SMS - CareBridge] in accordance with standing rules
            </p>
          </div>
        </div>

        {loading && messages.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">{t('loading')}</div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No SMS messages sent yet.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {messages.map((sms) => {
              const time = new Date(sms.sent_at || Date.now());
              return (
                <div
                  key={sms.sms_id}
                  className="p-4 rounded-2xl border border-slate-200 hover:border-violet-300 bg-slate-50/50 hover:bg-violet-50/20 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-[10px] uppercase">
                        MOCK SMS
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-800">
                        To: {sms.recipient_phone}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] uppercase">
                        {sms.template_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{time.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}</span>
                    </div>
                  </div>

                  <p className="mt-2.5 text-sm font-mono text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
                    {sms.message_body}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>ID: {sms.sms_id}</span>
                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <CheckCircle className="w-3 h-3" />
                      Delivered (Simulated)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
