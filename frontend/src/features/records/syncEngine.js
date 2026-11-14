/**
 * CareBridge Offline Synchronization Engine (Phase 5 Enhanced).
 *
 * Implements:
 * - Local-first optimistic writes with Dexie.js (IndexedDB).
 * - Outbox pattern: every write (visit, vitals, note, consent, symptom, voice note) gets:
 *   client UUID, idempotency key (UUID), and created_at timestamp.
 * - Atomic batch draining via POST /sync with idempotency receipts and server-wins conflict detection.
 * - 4-state status tracking: 'online' | 'offline' | 'syncing' | 'sync_failed'.
 * - Queue cap warning when pending items reach >= 80% of capacity (QUEUE_CAP = 100).
 * - Auto-drain on 'online' event, exponential backoff timer (5s -> 60s), and Background Sync API.
 * - Never drops an item silently.
 */

import { db } from './carebridgeDb';

const API_BASE = '/api'; // Proxied to backend port 8000 via Vite dev server
export const QUEUE_CAP = 100;
const WARN_THRESHOLD = 0.8; // 80%

function getAuthToken() {
  return localStorage.getItem('access_token') || localStorage.getItem('token') || '';
}

// Global subscribers for sync status changes
const subscribers = new Set();

let currentState = navigator.onLine ? 'online' : 'offline';
let lastSyncTime = localStorage.getItem('carebridge_last_sync_time') || null;
let currentPendingCount = 0;
let backoffSeconds = 5;
let timerId = null;

function notifySubscribers() {
  const isHighQueue = currentPendingCount >= Math.floor(QUEUE_CAP * WARN_THRESHOLD);
  subscribers.forEach((callback) => {
    try {
      callback({
        state: currentState,
        pendingCount: currentPendingCount,
        lastSyncTime,
        isHighQueue,
        queueCap: QUEUE_CAP,
      });
    } catch (e) {
      console.error('Sync subscriber callback error:', e);
    }
  });
}

export const syncEngine = {
  /**
   * Subscribe to live sync engine status changes (state, pendingCount, lastSyncTime, isHighQueue).
   */
  subscribe(callback) {
    subscribers.add(callback);
    // Emit initial status immediately
    this.refreshPendingCount().then(() => notifySubscribers());
    return () => subscribers.delete(callback);
  },

  /**
   * Refresh pending count from Dexie outbox.
   */
  async refreshPendingCount() {
    try {
      currentPendingCount = await db.sync_outbox.count();
      notifySubscribers();
    } catch (err) {
      console.warn('Failed to read outbox count:', err);
    }
    return currentPendingCount;
  },

  /**
   * Enqueue a generic item into Dexie outbox with client UUID, idempotency key, and created_at.
   */
  async enqueueOutboxItem({ itemType, itemId, payload, clientVersion = 1 }) {
    const clientId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const outboxItem = {
      idempotency_key: idempotencyKey,
      client_id: clientId,
      item_type: itemType,
      item_id: itemId || clientId,
      payload,
      client_version: clientVersion,
      timestamp: nowIso,
      created_at: nowIso,
      status: 'pending',
      attempts: 0,
    };

    await db.sync_outbox.add(outboxItem);
    await this.refreshPendingCount();

    // Trigger immediate drain if online
    if (navigator.onLine) {
      this.drainOutbox().catch((err) => console.warn('Outbox push deferred:', err));
    }

    return { clientId, idempotencyKey, timestamp: nowIso };
  },

  /**
   * Save a clinical record locally and queue for push (Phase 4 compatibility).
   */
  async saveRecordLocally({ patientId, doctorId = null, recordType, data, recordId = null, version = 1 }) {
    const resolvedRecordId = recordId || crypto.randomUUID();
    const clientId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const recordEntry = {
      record_id: resolvedRecordId,
      patient_id: patientId,
      doctor_id: doctorId,
      record_type: recordType,
      data,
      version,
      client_id: clientId,
      is_deleted: false,
      updated_at: nowIso,
      client_timestamp: nowIso,
      sync_status: 'pending',
    };

    await db.clinical_records.put(recordEntry);

    // Queue in outbox
    await this.enqueueOutboxItem({
      itemType: recordType in ['vitals', 'note'] ? recordType : 'clinical_record',
      itemId: resolvedRecordId,
      payload: {
        patient_id: patientId,
        doctor_id: doctorId,
        record_type: recordType,
        data,
        is_deleted: false,
      },
      clientVersion: version,
    });

    return recordEntry;
  },

  /**
   * Save a CHW assisted visit locally in Dexie and queue for push.
   */
  async saveAssistedVisitLocally(visitData) {
    const visitId = visitData.visit_id || crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const localVisit = {
      ...visitData,
      visit_id: visitId,
      created_at: nowIso,
      sync_status: 'pending',
    };

    await db.assisted_visits.put(localVisit);

    // Queue in outbox
    await this.enqueueOutboxItem({
      itemType: 'visit',
      itemId: visitId,
      payload: localVisit,
      clientVersion: 1,
    });

    return localVisit;
  },

  /**
   * Save a patient consent locally in Dexie and queue for push.
   */
  async saveConsentLocally({ patientId, purpose, grantedBy, grantedByRole = 'chw' }) {
    const consentId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const consentData = {
      consent_id: consentId,
      patient_id: patientId,
      purpose,
      granted_by: grantedBy,
      granted_by_role: grantedByRole,
      granted_at: nowIso,
    };

    await this.enqueueOutboxItem({
      itemType: 'consent',
      itemId: consentId,
      payload: consentData,
      clientVersion: 1,
    });

    return consentData;
  },

  /**
   * Drain all pending mutations from IndexedDB outbox to the server via POST /sync.
   */
  async drainOutbox() {
    if (!navigator.onLine) {
      currentState = 'offline';
      notifySubscribers();
      return { processed: 0, applied: 0, duplicates: 0, conflicts: 0, rejected: 0 };
    }

    const token = getAuthToken();
    if (!token) {
      currentState = 'offline';
      notifySubscribers();
      return { processed: 0, applied: 0, duplicates: 0, conflicts: 0, rejected: 0 };
    }

    const outboxItems = await db.sync_outbox.toArray();
    if (!outboxItems || outboxItems.length === 0) {
      currentState = 'online';
      currentPendingCount = 0;
      notifySubscribers();
      return { processed: 0, applied: 0, duplicates: 0, conflicts: 0, rejected: 0 };
    }

    // Set state to syncing
    currentState = 'syncing';
    notifySubscribers();

    // Prepare batch
    const batch = outboxItems.map((item) => ({
      idempotency_key: item.idempotency_key || item.client_id,
      client_id: item.client_id,
      item_type: item.item_type || 'clinical_record',
      item_id: item.item_id || item.record_id,
      payload: item.payload || (item.mutation ? item.mutation.data : {}),
      client_version: item.client_version || (item.mutation ? item.mutation.client_version : 1),
      client_timestamp: item.timestamp || item.created_at || new Date().toISOString(),
    }));

    try {
      const response = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ batch }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed with HTTP ${response.status}`);
      }

      const resData = await response.json();
      const results = resData.results || [];

      // Process item-level outcomes
      for (const res of results) {
        const matchingOutbox = outboxItems.find(
          (o) => (o.idempotency_key && o.idempotency_key === res.idempotency_key) || o.item_id === res.item_id
        );

        if (res.status === 'applied' || res.status === 'duplicate') {
          // Success or idempotent duplicate -> remove from outbox
          if (matchingOutbox) {
            await db.sync_outbox.delete(matchingOutbox.id);
          }

          // Mark local entities synced
          if (res.item_type === 'visit') {
            await db.assisted_visits.update(res.item_id, { sync_status: 'synced' });
          } else if (res.item_type === 'clinical_record' || res.item_type === 'vitals') {
            await db.clinical_records.update(res.item_id, {
              sync_status: 'synced',
              version: res.server_version || 1,
            });
          }
        } else if (res.status === 'conflict') {
          // Server-wins conflict detected! Keep in conflicts table for user visibility
          await db.sync_conflicts.add({
            record_id: res.item_id,
            detected_at: new Date().toISOString(),
            server_document: res.server_document,
            resolved: false,
          });

          // Update local copy with server document
          if (res.server_document) {
            await db.clinical_records.put({
              ...res.server_document,
              sync_status: 'conflict',
            });
          }

          if (matchingOutbox) {
            await db.sync_outbox.delete(matchingOutbox.id);
          }
        } else {
          // Rejected item: increment retry counter, do NOT drop silently
          if (matchingOutbox) {
            await db.sync_outbox.update(matchingOutbox.id, {
              attempts: (matchingOutbox.attempts || 0) + 1,
              last_error: res.message,
            });
          }
        }
      }

      // Record successful sync timestamp
      const nowIso = new Date().toISOString();
      lastSyncTime = nowIso;
      localStorage.setItem('carebridge_last_sync_time', nowIso);

      // Reset exponential backoff on success
      backoffSeconds = 5;
      currentState = 'online';

      await this.refreshPendingCount();
      return resData;
    } catch (err) {
      console.error('Sync batch error:', err);
      currentState = 'sync_failed';
      // Exponential backoff
      backoffSeconds = Math.min(backoffSeconds * 2, 60);
      await this.refreshPendingCount();
      return { error: err.message };
    }
  },

  /**
   * Schedule automatic background sync timer with exponential backoff.
   */
  startScheduler() {
    if (timerId) clearTimeout(timerId);

    const scheduleNext = () => {
      timerId = setTimeout(async () => {
        if (navigator.onLine && (await db.sync_outbox.count()) > 0) {
          await this.drainOutbox();
        }
        scheduleNext();
      }, backoffSeconds * 1000);
    };

    scheduleNext();
  },

  /**
   * Pull remote updates for a given patient from server and cache in IndexedDB.
   */
  async pullRemoteUpdates(patientId) {
    if (!patientId || !navigator.onLine) return;
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/clinical/records/patient/${patientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const records = await res.json();
        for (const rec of records) {
          const existing = await db.clinical_records.get(rec.record_id);
          if (!existing || new Date(rec.updated_at) >= new Date(existing.updated_at)) {
            await db.clinical_records.put(rec);
          }
        }
      }
    } catch (e) {
      console.warn('pullRemoteUpdates failed:', e);
    }
  },

  /**
   * Initialize online event listener and Background Sync where supported.
   */
  init() {
    window.addEventListener('online', () => {
      currentState = 'online';
      backoffSeconds = 5;
      notifySubscribers();
      this.drainOutbox();
    });

    window.addEventListener('offline', () => {
      currentState = 'offline';
      notifySubscribers();
    });

    // Background Sync API where supported by browser service worker
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.sync.register('carebridge-sync'))
        .catch((err) => console.log('Background Sync registration not supported/skipped:', err));
    }

    this.startScheduler();
    this.refreshPendingCount();
  },
};

// Initialize listeners on import
if (typeof window !== 'undefined') {
  syncEngine.init();
}

export default syncEngine;
