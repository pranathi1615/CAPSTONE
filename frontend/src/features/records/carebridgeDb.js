/**
 * Dexie.js IndexedDB schema and database configuration for CareBridge.
 *
 * Implements offline-first storage for:
 * 1. clinical_records: FHIR R4 clinical records with optimistic sync status.
 * 2. sync_outbox: Queued client mutations for outbox pattern draining.
 * 3. sync_conflicts: Detected server vs client version conflicts awaiting user resolution.
 * 4. prescriptions_cache: Locally cached digital prescriptions for offline viewing.
 */

import Dexie from 'dexie';

export const db = new Dexie('CareBridgeOfflineDB');

db.version(1).stores({
  clinical_records: 'record_id, patient_id, record_type, client_id, version, updated_at, sync_status, is_deleted',
  sync_outbox: '++id, client_id, record_id, mutation_type, timestamp, attempts',
  sync_conflicts: '++id, record_id, detected_at, resolved',
  prescriptions_cache: 'prescription_id, patient_id, status, issued_at',
});

export default db;
