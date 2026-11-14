/**
 * React Hook for offline-first clinical records management.
 *
 * Integrates Dexie IndexedDB, syncEngine outbox, online/offline detection,
 * and conflict monitoring.
 */

import { useState, useEffect, useCallback } from 'react';
import { db } from './carebridgeDb';
import { syncEngine } from './syncEngine';

export function useOfflineRecords(patientId) {
  const [records, setRecords] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [outboxCount, setOutboxCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load records from local Dexie IndexedDB
  const refreshLocalState = useCallback(async () => {
    if (!patientId) return;
    try {
      const localRecords = await db.clinical_records
        .where('patient_id')
        .equals(patientId)
        .reverse()
        .sortBy('updated_at');

      // Filter out deleted
      const activeRecords = localRecords.filter((r) => !r.is_deleted);
      setRecords(activeRecords);

      // Check outbox count
      const pendingOutbox = await db.sync_outbox.count();
      setOutboxCount(pendingOutbox);

      // Check unresolved conflicts
      const activeConflicts = await db.sync_conflicts.toArray();
      setConflicts(activeConflicts.filter((c) => !c.resolved));
    } catch (err) {
      console.error('Failed reading IndexedDB records:', err);
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  // Synchronize: drain outbox, then pull updates from server
  const performSync = useCallback(async () => {
    if (!navigator.onLine || !patientId) return;
    setIsSyncing(true);
    try {
      await syncEngine.drainOutbox();
      await syncEngine.pullRemoteUpdates(patientId);
      await refreshLocalState();
    } catch (err) {
      console.warn('Sync cycle failed or partial:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [patientId, refreshLocalState]);

  // Setup listeners and initial load
  useEffect(() => {
    refreshLocalState();

    // Online/offline window listeners
    const handleOnline = () => {
      setIsOnline(true);
      performSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial pull if online
    if (navigator.onLine && patientId) {
      performSync();
    }

    // Periodic sync every 30 seconds when online
    const interval = setInterval(() => {
      if (navigator.onLine && patientId) {
        performSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [patientId, refreshLocalState, performSync]);

  // Add new clinical record (optimistic write)
  const addRecord = async ({ recordType, data, doctorId = null }) => {
    const saved = await syncEngine.saveRecordLocally({
      patientId,
      doctorId,
      recordType,
      data,
    });
    await refreshLocalState();
    return saved;
  };

  // Update existing record
  const updateRecord = async ({ recordId, data, version }) => {
    const existing = await db.clinical_records.get(recordId);
    if (!existing) return;
    const saved = await syncEngine.saveRecordLocally({
      patientId: existing.patient_id,
      doctorId: existing.doctor_id,
      recordType: existing.record_type,
      data,
      recordId,
      version: version || existing.version,
    });
    await refreshLocalState();
    return saved;
  };

  // Resolve conflict
  const resolveConflict = async (conflictId, choice, mergedData = null) => {
    await syncEngine.resolveConflict(conflictId, choice, mergedData);
    await refreshLocalState();
  };

  return {
    records,
    conflicts,
    outboxCount,
    isOnline,
    isSyncing,
    isLoading,
    addRecord,
    updateRecord,
    resolveConflict,
    syncNow: performSync,
    refreshLocal: refreshLocalState,
  };
}
