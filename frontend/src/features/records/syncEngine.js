/**
 * CareBridge Offline Synchronization Engine.
 *
 * Implements:
 * - Local-first optimistic writes with Dexie.js (IndexedDB).
 * - Outbox pattern: write locally first, assign client UUID, queue for push.
 * - Auto-drain on window 'online' event and periodic timer.
 * - Version conflict detection and resolution workflow (Keep Mine / Keep Server / Merge).
 * - Multi-device pull sync to ingest server-side changes.
 */

import { db } from './carebridgeDb';

const API_BASE = '/api'; // Proxied to backend port 8000 via Vite dev server

// Helper to get access token from localStorage
function getAuthToken() {
  return localStorage.getItem('access_token') || localStorage.getItem('token') || '';
}

export const syncEngine = {
  /**
   * Save a clinical record locally with optimistic UI update and enqueue mutation.
   */
  async saveRecordLocally({ patientId, doctorId = null, recordType, data, recordId = null, version = 1 }) {
    const isNew = !recordId;
    const resolvedRecordId = recordId || crypto.randomUUID();
    const clientId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const recordEntry = {
      record_id: resolvedRecordId,
      patient_id: patientId,
      doctor_id: doctorId,
      record_type: recordType,
      data,
      version: version,
      client_id: clientId,
      is_deleted: false,
      updated_at: nowIso,
      client_timestamp: nowIso,
      sync_status: 'pending',
    };

    // 1. Write to Dexie clinical_records table
    await db.clinical_records.put(recordEntry);

    // 2. Queue in sync_outbox table
    const outboxMutation = {
      client_id: clientId,
      record_id: resolvedRecordId,
      patient_id: patientId,
      doctor_id: doctorId,
      record_type: recordType,
      data,
      client_version: isNew ? 1 : version,
      client_timestamp: nowIso,
      mutation_type: isNew ? 'create' : 'update',
      is_deleted: false,
    };

    await db.sync_outbox.add({
      client_id: clientId,
      record_id: resolvedRecordId,
      mutation: outboxMutation,
      timestamp: nowIso,
      attempts: 0,
    });

    // 3. Trigger immediate sync if currently online
    if (navigator.onLine) {
      this.drainOutbox().catch((err) => console.warn('Background sync push deferred:', err));
    }

    return recordEntry;
  },

  /**
   * Drain all pending mutations from IndexedDB outbox to the server via POST /sync/push.
   */
  async drainOutbox() {
    if (!navigator.onLine) return { applied: 0, conflicts: 0, total: 0 };

    const token = getAuthToken();
    if (!token) return { applied: 0, conflicts: 0, total: 0 };

    const outboxItems = await db.sync_outbox.toArray();
    if (!outboxItems || outboxItems.length === 0) {
      return { applied: 0, conflicts: 0, total: 0 };
    }

    const mutations = outboxItems.map((item) => item.mutation);

    try {
      const response = await fetch(`${API_BASE}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mutations }),
      });

      if (!response.ok) {
        throw new Error(`Sync push failed with status ${response.status}`);
      }

      const result = await response.json();
      const resultsMap = new Map();
      result.results.forEach((r) => resultsMap.set(r.record_id, r));

      for (const item of outboxItems) {
        const itemResult = resultsMap.get(item.record_id);
        if (!itemResult) continue;

        if (itemResult.status === 'applied') {
          // Success: update local record with confirmed server version and mark synced
          await db.clinical_records.update(item.record_id, {
            sync_status: 'synced',
            version: itemResult.server_version,
          });
          // Remove from outbox
          await db.sync_outbox.delete(item.id);
        } else if (itemResult.status === 'conflict') {
          // CONFLICT detected: move to sync_conflicts and notify UI
          await db.sync_conflicts.add({
            record_id: item.record_id,
            client_mutation: item.mutation,
            server_document: itemResult.server_document,
            detected_at: new Date().toISOString(),
            resolved: false,
          });

          await db.clinical_records.update(item.record_id, {
            sync_status: 'conflict',
          });

          // Remove from outbox so it does not loop
          await db.sync_outbox.delete(item.id);
        }
      }

      return {
        applied: result.applied,
        conflicts: result.conflicts,
        total: mutations.length,
      };
    } catch (err) {
      console.error('Error draining sync outbox:', err);
      // Increment attempt counters
      for (const item of outboxItems) {
        await db.sync_outbox.update(item.id, { attempts: (item.attempts || 0) + 1 });
      }
      throw err;
    }
  },

  /**
   * Pull server-side changes and merge into local IndexedDB.
   */
  async pullRemoteUpdates(patientId) {
    if (!navigator.onLine || !patientId) return;
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/sync/pull?patient_id=${encodeURIComponent(patientId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) return;

      const data = await response.json();
      const serverRecords = data.records || [];

      for (const sRec of serverRecords) {
        const local = await db.clinical_records.get(sRec.record_id);
        // If local is pending or in conflict, don't blindly overwrite
        if (!local || local.sync_status === 'synced') {
          await db.clinical_records.put({
            record_id: sRec.record_id,
            patient_id: sRec.patient_id,
            doctor_id: sRec.doctor_id,
            record_type: sRec.record_type,
            data: sRec.data,
            version: sRec.version,
            client_id: sRec.client_id,
            is_deleted: sRec.is_deleted,
            updated_at: sRec.updated_at,
            sync_status: 'synced',
          });
        }
      }
    } catch (err) {
      console.warn('Error pulling remote updates:', err);
    }
  },

  /**
   * Resolve an offline conflict with user choice: "keep_mine", "keep_server", or "merge".
   */
  async resolveConflict(conflictId, resolutionChoice, mergedData = null) {
    const conflict = await db.sync_conflicts.get(conflictId);
    if (!conflict) return;

    const { record_id, client_mutation, server_document } = conflict;
    const nowIso = new Date().toISOString();

    if (resolutionChoice === 'keep_server') {
      // Overwrite local with server's confirmed document
      await db.clinical_records.put({
        record_id: server_document.record_id,
        patient_id: server_document.patient_id,
        doctor_id: server_document.doctor_id,
        record_type: server_document.record_type,
        data: server_document.data,
        version: server_document.version,
        client_id: server_document.client_id,
        is_deleted: server_document.is_deleted,
        updated_at: server_document.updated_at,
        sync_status: 'synced',
      });
    } else if (resolutionChoice === 'keep_mine') {
      // Re-queue local mutation with base version = server_document.version
      const reMutation = {
        ...client_mutation,
        client_version: server_document.version,
        client_timestamp: nowIso,
      };

      await db.clinical_records.update(record_id, {
        sync_status: 'pending',
        version: server_document.version,
      });

      await db.sync_outbox.add({
        client_id: reMutation.client_id,
        record_id,
        mutation: reMutation,
        timestamp: nowIso,
        attempts: 0,
      });
    } else if (resolutionChoice === 'merge') {
      // Merge: user provided combined fields
      const finalData = mergedData || {
        ...server_document.data,
        ...client_mutation.data,
      };

      const mergeMutation = {
        ...client_mutation,
        data: finalData,
        client_version: server_document.version,
        client_timestamp: nowIso,
      };

      await db.clinical_records.put({
        ...server_document,
        data: finalData,
        sync_status: 'pending',
        version: server_document.version,
        updated_at: nowIso,
      });

      await db.sync_outbox.add({
        client_id: mergeMutation.client_id,
        record_id,
        mutation: mergeMutation,
        timestamp: nowIso,
        attempts: 0,
      });
    }

    // Mark conflict resolved
    await db.sync_conflicts.delete(conflictId);

    // Auto-drain outbox if online
    if (navigator.onLine) {
      await this.drainOutbox();
    }
  },
};
