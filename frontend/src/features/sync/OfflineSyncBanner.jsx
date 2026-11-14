import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import syncEngine, { QUEUE_CAP } from '../records/syncEngine';

export const OfflineSyncBanner = () => {
  const { t } = useTranslation();
  const [syncStatus, setSyncStatus] = useState({
    state: navigator.onLine ? 'online' : 'offline',
    pendingCount: 0,
    lastSyncTime: localStorage.getItem('carebridge_last_sync_time') || null,
    isHighQueue: false,
    queueCap: QUEUE_CAP,
  });
  const [manualSyncing, setManualSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((status) => {
      setSyncStatus(status);
    });
    return () => unsubscribe();
  }, []);

  const handleManualSync = async () => {
    setManualSyncing(true);
    try {
      await syncEngine.drainOutbox();
    } finally {
      setManualSyncing(false);
    }
  };

  const formatLastSync = (isoString) => {
    if (!isoString) return t('sync.never_synced') || 'Never synced';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // State presentation configs
  const configMap = {
    online: {
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      icon: <Wifi className="w-3.5 h-3.5 text-emerald-600" />,
      label: t('sync.status_online') || 'Online (Synced)',
    },
    offline: {
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      icon: <WifiOff className="w-3.5 h-3.5 text-amber-600" />,
      label: t('sync.status_offline') || 'Offline (Local Dexie)',
    },
    syncing: {
      badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
      icon: <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" />,
      label: t('sync.status_syncing') || 'Syncing...',
    },
    sync_failed: {
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
      icon: <AlertCircle className="w-3.5 h-3.5 text-rose-600" />,
      label: t('sync.status_failed') || 'Sync Failed (Will Retry)',
    },
  };

  const currentCfg = configMap[syncStatus.state] || configMap.online;

  return (
    <div className="space-y-2">
      {/* 80% Queue Cap Warning Banner */}
      {syncStatus.isHighQueue && (
        <div
          data-testid="queue-cap-warning"
          className="p-3 bg-amber-500 text-white rounded-2xl flex items-center justify-between shadow-xs animate-pulse text-xs font-semibold"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {t('sync.high_queue_warning') ||
                `Warning: Local outbox queue is at ${syncStatus.pendingCount}/${syncStatus.queueCap} (≥80% capacity). Connect to network soon to sync records.`}
            </span>
          </div>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={!navigator.onLine || manualSyncing}
            className="px-3 py-1 bg-white text-amber-800 rounded-xl text-[11px] font-bold hover:bg-amber-50 active:scale-95 transition disabled:opacity-50"
          >
            {manualSyncing ? t('sync.syncing_short') || 'Syncing...' : t('sync.sync_now') || 'Sync Now'}
          </button>
        </div>
      )}

      {/* Main 4-State Status Pill Banner */}
      <div
        data-testid="offline-sync-status-banner"
        className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-center gap-2.5">
          <span
            data-testid="sync-state-badge"
            data-sync-state={syncStatus.state}
            className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-all ${currentCfg.badgeClass}`}
          >
            {currentCfg.icon}
            <span>{currentCfg.label}</span>
          </span>

          <span
            data-testid="pending-queue-count"
            className={`font-semibold ${
              syncStatus.pendingCount > 0 ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200' : 'text-slate-500'
            }`}
          >
            {syncStatus.pendingCount}{' '}
            {syncStatus.pendingCount === 1 ? t('sync.pending_single') || 'item pending' : t('sync.pending_plural') || 'items pending'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span data-testid="last-sync-time" className="text-slate-500 text-[11px]">
            {t('sync.last_synced') || 'Last synced'}:{' '}
            <span className="font-mono text-slate-700 font-semibold">{formatLastSync(syncStatus.lastSyncTime)}</span>
          </span>

          <button
            type="button"
            data-testid="manual-sync-btn"
            onClick={handleManualSync}
            disabled={!navigator.onLine || manualSyncing || syncStatus.state === 'syncing'}
            className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-slate-100 rounded-xl transition cursor-pointer disabled:opacity-40"
            title={t('sync.sync_now') || 'Force sync outbox with server'}
          >
            <RefreshCw className={`w-4 h-4 ${manualSyncing || syncStatus.state === 'syncing' ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
