# CareBridge (కేర్‌బ్రిడ్జ్ / केयरब्रिज)
**Real-Time Telemedicine Platform for Weak Networks, Regional Languages, and Shared Phones**

[![CI Build](https://github.com/pranathi1615/CAPSTONE/actions/workflows/ci.yml/badge.svg)](https://github.com/pranathi1615/CAPSTONE/actions)
**Repository**: [https://github.com/pranathi1615/CAPSTONE](https://github.com/pranathi1615/CAPSTONE)

CareBridge is a resilient, low-bandwidth telemedicine platform tailored for underserved rural clinics, primary healthcare centers (PHCs), and community health workers (CHWs/ASHAs).

---

## Complete Project Architecture & Status (Phases 1–7)

CareBridge is built as a production-grade modular monolith adhering to microservice boundaries and FHIR R4 clinical compliance:

### 1. Phase 1: Foundation, Security & Trilingual Support
- **Multi-Role RBAC**: 5 distinct roles (`patient`, `doctor`, `chw`, `pharmacy`, `admin`).
- **Doctor Verification**: Admin approvals workflow with cryptographic audit logging.
- **Trilingual Localization**: Native support for **English**, **Hindi (हिन्दी)**, and **Telugu (తెలుగు)** across every screen.
- **Tamper-Evident Audit Chain**: SHA-256 monotonic parent-hash chaining with collision-free append.
- **Consent Engine**: Patient self-grant and CHW assisted-grant with revocation tracking.

### 2. Phase 2: Real-Time Teleconsultation & Doctor Queue
- **WebRTC Audio/Video Calling**: Peer-to-peer real-time communication with STUN/TURN (Coturn) integration.
- **WebSocket Signalling**: Authenticated real-time session signalling with Redis Pub/Sub multi-instance scaling.
- **Dynamic Arrival Queue**: Live arrival-ordered doctor queue with 1-second dynamic wait timer.
- **Double-Booking Prevention**: Partial unique index on `(doctor_id, slot_start)` preventing concurrent race conditions.
- **MOCK SMS Provider**: Simulated automated SMS notification engine with dedicated Developer Inbox (`/dev-inbox`).

### 3. Phase 3: Weak-Network Adaptive Degradation
- **4-Mode State Machine**: Dynamic graceful degradation with hysteresis:
  - `VIDEO` (High bandwidth)
  - `AUDIO_ONLY` (Low bandwidth / 3G)
  - `VOICE_NOTE` (Asynchronous voice messaging / 2G)
  - `TEXT` (Ultra-low bandwidth / SMS fallback)
- **Voice Note System**: Chunked audio upload with delivery receipts and shared room timeline.
- **Reliable Messaging**: Monotonic sequence numbering, client gap detection, and duplicate-free retransmission.

### 4. Phase 4: Clinical Records, Offline Sync & Ed25519 E-Prescriptions
- **FHIR R4 Resource Compliance**: Standardized Condition, Observation (Vitals), and Encounter records with optimistic concurrency.
- **Ed25519 Digital Signatures**: Cryptographically signed e-prescriptions with tamper detection and QR verification.
- **Verified Pharmacy Network**: Geospatial MongoDB `2dsphere` index with Haversine distance lookups and atomic single-use dispense.

### 5. Phase 5: Offline-First CHW Assisted Visits & Shared Devices
- **IndexedDB Sync Engine**: Bidirectional offline mutation queue with client UUID idempotency and deterministic server-wins resolution.
- **CHW Assisted Visits**: CHW conducts visits on behalf of patients with voice-assisted triage and vitals evaluation.
- **Shared-Device Security**: Auto-inactivity lockout and quick 4-digit PIN unlock for community phones.

### 6. Phase 6: Clinical Decision Support, Emergency Escalation & Follow-ups
- **Deterministic Red-Flag Rules**: 8 clinical safety rules with immediate escalation priority.
- **ML Triage Engine**: Scikit-learn Random Forest model trained on synthetic vignettes with trilingual non-diagnostic CDS notices.
- **On-Call Doctor Emergency Broadcast**: Real-time emergency WebSocket alert banner (<50ms delivery latency).
- **Asynchronous Consultations**: 24-hour turnaround inbox with overdue tracking.
- **Follow-up Planner**: Injectable-clock reminder scheduler at T+23h and missed status at T+30h.
- **Clinical Referral Notes**: Standardized PDF note generation with ReportLab.

### 7. Phase 7: Analytics, Audit Verification & Deployment Hardening
- **Platform Telemetry Dashboard**: Operational KPIs, consultations by specialty, triage urgency breakdown, network mode distributions, and offline sync statistics.
- **Cryptographic Audit Inspector**: 1-click verification tool scanning the SHA-256 chain from genesis to tip with block filtering.
- **Deployment Hardening**: Production security headers (`CSP`, `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`), rate limiting, PWA service worker asset caching, and Docker compose orchestration.

---

## Test Suite & Verification (100% Pass Rate)

- **Backend Pytest**: **57 passed out of 57** (`pytest -v tests`)
- **Playwright E2E**: **14 passed out of 14** (`npx playwright test`)

---

## Quickstart & Running Locally

### 1. Prerequisites
- Docker & Docker Compose
- Node.js (v18+)
- Python 3.12+
- MongoDB 7.0 & Redis 7.0

### 2. Environment Setup
```bash
cp .env.example .env
```

### 3. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or on Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000 --host 0.0.0.0
```

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 5. Demo Credentials
Run `python scripts/reset_demo.py` to seed fresh availability slots:
- **Admin**: `admin@carebridge.local` / `Admin@123`
- **Doctor (On-Call)**: `dr.sharma@carebridge.local` / `Doctor@123`
- **Patient**: `patient.demo@carebridge.local` / `Patient@123`
- **CHW**: `chw.lakshmi@carebridge.local` / `Chw@123`
- **Pharmacy**: `pharmacy.apollo@carebridge.local` / `Pharmacy@123`
