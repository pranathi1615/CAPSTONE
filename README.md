# CareBridge (కేర్‌బ్రిడ్జ్ / केयरब्रिज)
**Real-Time Telemedicine Platform for Weak Networks, Regional Languages, and Shared Phones**

CareBridge is a resilient, low-bandwidth telemedicine platform tailored for underserved rural clinics, primary healthcare centers (PHCs), and community health workers (CHWs/ASHAs).

---

## Current Status: Phase 2 (Real-Time Visit, WebRTC & Doctor Queue)

### Phase 2 Features Built
1. **WebRTC One-to-One Audio & Video Calling**:
   - Real peer-to-peer audio/video connection using standard `RTCPeerConnection`.
   - Coturn TURN/STUN server embedded in Docker Compose with credentials configured via environment variables.
   - Dynamic ICE server configuration served from `GET /appointments/config/ice-servers`.
   - In-call controls: Microphone mute/unmute, Camera on/off, and clean call teardown.
2. **Authenticated WebSocket Signalling Layer**:
   - Single authenticated `/ws?token=<jwt>&room=<room_id>` endpoint with JWT verification.
   - Standard JSON envelope (`type`, `id`, `ts`, `room`, `payload`).
   - Redis Pub/Sub integration for horizontal multi-instance backend scalability.
   - Live user presence tracking (`online`/`offline`) and real-time typing indicators with debounce.
3. **Double-Booking Prevention with Partial Unique Index**:
   - MongoDB partial unique index on `(doctor_id, slot_start)` filtered by active statuses (`booked`, `waiting`, `in_call`).
   - Hard guarantee against concurrent double booking without race conditions.
   - Cancelled or completed slots are atomically freed for re-booking.
4. **Live Arrival-Ordered Doctor Queue**:
   - Patients tapping **Join Consultation** transition to `waiting` with `joined_waiting_at` timestamp.
   - Doctor dashboard displays waiting patients ordered strictly by arrival time.
   - Dynamic wait duration timer updates **every second** in the browser without page reloads.
   - Prominent **Call Patient** button directly initiates WebRTC consultation.
5. **In-Call Real-Time Chat & Clinical Notes**:
   - Chat messages persisted to MongoDB `messages` collection with unique index on `message_id` and compound index on `(room, sequence)`.
   - Chat history reloaded automatically upon reconnect or rejoin.
   - Dedicated Clinical Notes panel allowing doctors to record diagnosis and mark visits completed.
6. **MOCK SMS Notification Provider & Dev Inbox**:
   - Automated synthetic SMS dispatched on appointment booking, queue entry, and status updates.
   - Clearly labeled with `[MOCK SMS - CareBridge]` badge in code, logs, and frontend UI.
   - Dedicated Developer SMS Inbox page (`/dev-inbox`) to inspect simulated SMS alerts in real time.

---

## Important Notice: Camera & Microphone Permissions (WebRTC)

> [!IMPORTANT]
> **Browser Security Policy (W3C WebRTC Specification)**:
> In all modern browsers (Chrome, Edge, Firefox, Safari), `navigator.mediaDevices.getUserMedia()` works **ONLY on `localhost` or over secure `HTTPS` origins**. Plain HTTP access over local network IPs (e.g. `http://192.168.1.x:5173`) will be blocked by the browser.

### Testing on a Physical Phone via a Secure Tunnel
To test CareBridge video consultations on a physical smartphone or another computer:
1. Start CareBridge frontend and backend locally.
2. Expose the frontend and backend using a secure HTTPS tunnel (such as **Cloudflare Tunnel** or **ngrok**):
   ```bash
   ngrok http 5173
   ```
3. Open the resulting HTTPS URL (`https://<random-id>.ngrok-free.app`) on your mobile browser.
4. Allow camera and microphone permissions when prompted.

---

## Repository Structure

```text
Capstone/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI for backend tests & frontend build
├── backend/
│   ├── Dockerfile               # Production container definition for Python 3.12 FastAPI
│   ├── requirements.txt         # Pinned backend dependencies
│   └── app/
│       ├── main.py              # FastAPI app instance and router mounts
│       ├── seed.py              # Synthetic data generator for viva demonstrations
│       ├── core/                # Core configs, database, security, and rate limiting
│       │   ├── config.py        # Pydantic Settings including Coturn STUN/TURN URLs
│       │   ├── database.py      # Async Motor client & Beanie initialization
│       │   ├── redis.py         # Async Redis client with in-memory fallback
│       │   ├── security.py      # Bcrypt hashing & 15-min JWT token generator
│       │   ├── dependencies.py  # get_current_user & require_roles RBAC dependency
│       │   ├── rate_limit.py    # Sliding window rate limiter for auth routes
│       │   └── audit.py         # Audit helper exports
│       ├── modules/
│       │   ├── core/            # GET /health endpoint (MongoDB & Redis probe)
│       │   ├── identity/        # Auth, JWT refresh, doctor registration & approval
│       │   ├── consent/         # Patient & CHW telehealth consent management
│       │   ├── audit/           # Tamper-evident audit chain & verification
│       │   ├── appointments/    # Slots, bookings, partial unique index, queue & ICE config
│       │   ├── chat/            # WebSocket ConnectionManager, Redis pub/sub & signalling
│       │   └── notifications/   # MOCK SMS provider and dev inbox endpoint
│       └── migrations/          # One-off data migrations directory
├── frontend/
│   ├── Dockerfile               # Multi-stage build with Nginx reverse proxy
│   ├── package.json             # React, Vite, react-i18next, Lucide, Tailwind
│   ├── vite.config.js           # Vite config with PWA manifest and service worker
│   └── src/
│       ├── App.jsx              # React router definitions (Dashboard, Consultation, Dev Inbox)
│       ├── i18n/                # Translation files (en.json, hi.json, te.json)
│       ├── components/          # Navbar, LanguageSwitcher, ProtectedRoute
│       └── features/
│           ├── auth/            # Auth pages (Login, Register) & AuthContext
│           ├── dashboard/       # Role dashboards (Patient, Doctor, CHW, Admin, Pharmacy)
│           ├── consent/         # Consent granting modal
│           ├── consultation/    # ConsultationRoom, useWebRTC, useWebSocket, booking modals
│           └── notifications/   # Dev SMS Inbox Page (MOCK SMS)
├── infra/
│   ├── mongo/
│   │   └── init-replica-set.sh  # MongoDB rs0 replica set initiator
│   └── docker/
│       └── nginx.conf           # Nginx SPA fallback and API reverse proxy
├── tests/
│   ├── conftest.py              # Pytest async database fixtures
│   ├── test_auth.py             # Auth, token refresh, and /health test cases
│   ├── test_roles.py            # RBAC and doctor approval tests
│   ├── test_consent.py          # Patient and CHW consent flow tests
│   ├── test_audit_chain.py      # Monotonic sequence and tamper-detection tests
│   ├── test_appointments.py     # Slot availability, partial unique index & queue tests
│   ├── test_websocket.py        # WebSocket auth, presence, chat, and signalling tests
│   └── e2e/
│       ├── playwright.config.js # Playwright configuration with media stream flags
│       ├── patient_dashboard_telugu.spec.js # Patient login in Telugu E2E test
│       └── consultation_call.spec.js        # Doctor & Patient WebRTC call E2E test
├── docker-compose.yml           # Multi-service Compose with Coturn TURN, Mongo rs0, Redis
├── .env.example                 # Sample environment variables with TURN secrets
└── README.md
```

---

## Quick Start (Docker Compose)

Run the entire platform with one command:

```bash
docker compose up --build
```

Services will start:
- **Frontend PWA**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Interactive Swagger Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health
- **MongoDB**: `localhost:27017` (Replica set `rs0`)
- **Redis**: `localhost:6379`
- **Coturn TURN Server**: `localhost:3478` (UDP/TCP)

---

## Seeded Synthetic Credentials (Viva Demo)

| Role | Name | Email (Username) | Password | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | System Administrator | `admin@carebridge.local` | `Admin@123` | Active |
| **Doctor (Approved)** | Dr. Rajesh Sharma, MD | `dr.sharma@carebridge.local` | `Doctor@123` | Approved (`MCI-2024-9871`) |
| **Doctor (Pending)** | Dr. Sneha Patel, MBBS | `dr.pending@carebridge.local` | `Doctor@123` | Pending Verification |
| **Patient** | Anita Devi | `patient.anita@carebridge.local` | `Patient@123` | Active |
| **CHW (Health Worker)** | Lakshmi Bai | `chw.lakshmi@carebridge.local` | `Chw@123` | Active |
| **Pharmacy** | Apollo Care Pharmacy | `pharmacy.apollo@carebridge.local` | `Pharmacy@123` | Active |

---

## Running Automated Tests

### 1. Pytest Full Test Suite (20 tests):
```bash
pytest -v tests
```
Verifies:
- All 11 Phase 1 tests (Auth, RBAC, Doctor approval, Consent, Audit chain).
- 5 Appointments tests (approved-only doctor booking, partial unique index double booking prevention, live queue, lifecycle).
- 4 WebSocket tests (token auth, room lifecycle, presence, chat persistence & rejoin, signalling relay).

### 2. Playwright End-to-End Suite:
```bash
cd tests/e2e
npm install
npx playwright test
```
Tests:
1. `patient_dashboard_telugu.spec.js`: Patient login in regional Telugu language.
2. `consultation_call.spec.js`: Two browser contexts (Doctor + Patient) completing a real video call, media verification, live queue arrival ordering, and real-time bidirectional chat.
