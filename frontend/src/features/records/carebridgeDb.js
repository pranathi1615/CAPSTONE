/**
 * Dexie.js IndexedDB schema and database configuration for CareBridge.
 *
 * Implements offline-first storage for:
 * 1. clinical_records: FHIR R4 clinical records with optimistic sync status.
 * 2. sync_outbox: Queued client mutations for outbox pattern draining.
 * 3. sync_conflicts: Detected server vs client version conflicts awaiting user resolution.
 * 4. prescriptions_cache: Locally cached digital prescriptions for offline viewing.
 * 5. assisted_visits: CHW assisted telehealth visits created offline.
 * 6. cached_patients: Locally indexed synthetic patient demographic records for offline search.
 */

import Dexie from 'dexie';

export const db = new Dexie('CareBridgeOfflineDB');

db.version(1).stores({
  clinical_records: 'record_id, patient_id, record_type, client_id, version, updated_at, sync_status, is_deleted',
  sync_outbox: '++id, client_id, record_id, mutation_type, timestamp, attempts',
  sync_conflicts: '++id, record_id, detected_at, resolved',
  prescriptions_cache: 'prescription_id, patient_id, status, issued_at',
});

db.version(2).stores({
  clinical_records: 'record_id, patient_id, record_type, client_id, version, updated_at, sync_status, is_deleted',
  sync_outbox: '++id, idempotency_key, client_id, item_type, item_id, status, timestamp, attempts',
  sync_conflicts: '++id, record_id, detected_at, resolved',
  prescriptions_cache: 'prescription_id, patient_id, status, issued_at',
  assisted_visits: 'visit_id, patient_id, chw_id, status, created_at, sync_status',
  cached_patients: 'user_id, full_name, phone, email',
});

export default db;
