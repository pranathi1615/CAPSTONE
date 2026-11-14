import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  HeartPulse,
  AlertCircle,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Stethoscope,
  Filter,
} from 'lucide-react';
import { useOfflineRecords } from './useOfflineRecords';
import { AddRecordModal } from './AddRecordModal';

export const ClinicalRecordsTimeline = ({ patientId, doctorId = null, canAdd = true }) => {
  const { t } = useTranslation();
  const {
    records,
    conflicts,
    outboxCount,
    isOnline,
    isSyncing,
    isLoading,
    addRecord,
    resolveConflict,
    syncNow,
  } = useOfflineRecords(patientId);

  const [filterType, setFilterType] = useState('all'); // all, observation, condition, allergy
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Filtered records
  const filteredRecords = records.filter((r) => {
    if (filterType === 'all') return true;
    return r.record_type === filterType;
  });

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar with Sync Status & Network Mode */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">
              {t('clinical.timeline_heading') || 'FHIR R4 Clinical Health Records'}
            </h3>
            <p className="text-xs text-slate-500">
              {t('clinical.offline_first_subheading') ||
                'Offline-first IndexedDB store with automatic version-tracking synchronization.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Online / Offline status badge */}
          <div
            data-testid="network-sync-status-badge"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>
              {isOnline
                ? t('clinical.online_mode') || 'Online (Auto-Sync)'
                : t('clinical.offline_mode') || 'Offline (Local Dexie)'}
            </span>
          </div>

          {/* Outbox count badge */}
          {outboxCount > 0 && (
            <div
              data-testid="outbox-count-badge"
              className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-white animate-pulse"
            >
              {outboxCount} {t('clinical.queued_outbox') || 'queued'}
            </div>
          )}

          {/* Manual Sync Button */}
          <button
            type="button"
            data-testid="manual-sync-btn"
            disabled={!isOnline || isSyncing}
            onClick={syncNow}
            title="Sync with server"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 transition active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-sky-600' : ''}`} />
          </button>

          {/* Add Record Button */}
          {canAdd && (
            <button
              type="button"
              data-testid="open-add-record-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span>{t('clinical.add_record_btn') || 'Add Record'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Trilingual Version Conflict Notification Banner */}
      {conflicts.length > 0 && (
        <div
          data-testid="sync-conflict-banner"
          className="bg-amber-500/10 border-2 border-amber-500 rounded-2xl p-4 text-slate-900 space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-amber-900">
                {t('clinical.conflict_detected_title') || 'Offline Synchronization Conflict Detected'}
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                {t('clinical.conflict_detected_desc') ||
                  'The medical record was updated on the server while you were offline. Please choose how to resolve:'}
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-amber-200">
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="bg-white rounded-xl p-3 border border-amber-200 text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs"
              >
                <div>
                  <span className="font-bold text-slate-800 capitalize">
                    {conflict.client_mutation?.record_type || 'Record'}:{' '}
                  </span>
                  <span className="text-slate-600">
                    Server v{conflict.server_document?.version} vs Local v
                    {conflict.client_mutation?.client_version}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="conflict-keep-mine-btn"
                    onClick={() => resolveConflict(conflict.id, 'keep_mine')}
                    className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] transition"
                  >
                    {t('clinical.keep_mine') || 'Keep Mine'}
                  </button>

                  <button
                    type="button"
                    data-testid="conflict-keep-server-btn"
                    onClick={() => resolveConflict(conflict.id, 'keep_server')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-[11px] transition"
                  >
                    {t('clinical.keep_server') || 'Keep Server'}
                  </button>

                  <button
                    type="button"
                    data-testid="conflict-merge-btn"
                    onClick={() => resolveConflict(conflict.id, 'merge')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition"
                  >
                    {t('clinical.merge') || 'Merge'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'all', label: t('clinical.tab_all') || 'All Records' },
          { id: 'observation', label: t('clinical.tab_vitals') || 'Vitals (Observations)' },
          { id: 'condition', label: t('clinical.tab_conditions') || 'Conditions & Diagnoses' },
          { id: 'allergy', label: t('clinical.tab_allergies') || 'Allergies' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={`filter-${tab.id}-btn`}
            onClick={() => setFilterType(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
              filterType === tab.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Timeline List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-3xl border border-slate-200">
            {t('common.loading') || 'Loading records from IndexedDB...'}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">
              {t('clinical.no_records') || 'No clinical records found for this patient yet.'}
            </p>
            {canAdd && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="mt-3 text-xs text-sky-600 font-bold hover:underline"
              >
                + {t('clinical.add_first_record') || 'Record vitals or conditions now'}
              </button>
            )}
          </div>
        ) : (
          filteredRecords.map((rec) => (
            <div
              key={rec.record_id}
              data-testid="clinical-record-card"
              className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-slate-300 transition space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      rec.record_type === 'observation'
                        ? 'bg-rose-50 text-rose-600'
                        : rec.record_type === 'condition'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {rec.record_type === 'observation' && <HeartPulse className="w-4 h-4" />}
                    {rec.record_type === 'condition' && <Activity className="w-4 h-4" />}
                    {rec.record_type === 'allergy' && <AlertCircle className="w-4 h-4" />}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 capitalize">
                      {rec.record_type === 'observation'
                        ? t('clinical.vitals_entry') || 'Vital Signs'
                        : rec.record_type === 'condition'
                        ? rec.data.code
                        : `Allergy: ${rec.data.substance}`}
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {new Date(rec.updated_at).toLocaleString([], {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                </div>

                {/* Per-card Sync Badge */}
                <div className="flex items-center gap-1.5">
                  {rec.sync_status === 'synced' && (
                    <span
                      data-testid="record-synced-badge"
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{t('clinical.badge_synced') || 'Synced ✓'} (v{rec.version})</span>
                    </span>
                  )}

                  {rec.sync_status === 'pending' && (
                    <span
                      data-testid="record-pending-badge"
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1"
                    >
                      <Clock className="w-3 h-3 animate-spin" />
                      <span>{t('clinical.badge_pending') || 'Stored Offline ⏳'}</span>
                    </span>
                  )}

                  {rec.sync_status === 'conflict' && (
                    <span
                      data-testid="record-conflict-badge"
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>{t('clinical.badge_conflict') || 'Conflict ⚠️'}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Card Details Rendering */}
              {rec.record_type === 'observation' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  {rec.data.systolic_bp && (
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">Blood Pressure</span>
                      <span className="font-bold text-slate-800">
                        {rec.data.systolic_bp} / {rec.data.diastolic_bp || '-'} mmHg
                      </span>
                    </div>
                  )}

                  {rec.data.pulse && (
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">Pulse</span>
                      <span className="font-bold text-slate-800">{rec.data.pulse} bpm</span>
                    </div>
                  )}

                  {rec.data.spo2_percent && (
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">SpO2 Oxygen</span>
                      <span className="font-bold text-slate-800">{rec.data.spo2_percent}%</span>
                    </div>
                  )}

                  {rec.data.temperature_c && (
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">Temperature</span>
                      <span className="font-bold text-slate-800">{rec.data.temperature_c} °C</span>
                    </div>
                  )}

                  {rec.data.weight_kg && (
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-500 block">Weight</span>
                      <span className="font-bold text-slate-800">{rec.data.weight_kg} kg</span>
                    </div>
                  )}
                </div>
              )}

              {rec.record_type === 'condition' && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-semibold text-[10px] uppercase">
                    Status: {rec.data.clinical_status}
                  </span>
                  {rec.data.severity && (
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-semibold text-[10px] uppercase">
                      Severity: {rec.data.severity}
                    </span>
                  )}
                  {rec.data.notes && (
                    <p className="w-full text-slate-600 text-xs italic bg-slate-50 p-2 rounded-xl">
                      "{rec.data.notes}"
                    </p>
                  )}
                </div>
              )}

              {rec.record_type === 'allergy' && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded-lg font-bold text-[10px] uppercase ${
                      rec.data.criticality === 'high'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    Risk: {rec.data.criticality}
                  </span>
                  {rec.data.manifestation && (
                    <span className="text-slate-600 text-xs">
                      Symptoms: <strong>{rec.data.manifestation}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal to add record */}
      <AddRecordModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={addRecord}
        patientId={patientId}
        doctorId={doctorId}
      />
    </div>
  );
};
