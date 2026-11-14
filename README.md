# CareBridge (కేర్‌బ్రిడ్జ్ / केयरब्रिज)
**Real-Time Telemedicine Platform for Weak Networks, Regional Languages, and Shared Phones**

CareBridge is a resilient, low-bandwidth telemedicine platform tailored for underserved rural clinics, primary healthcare centers (PHCs), and community health workers (CHWs/ASHAs).

---

## Current Status: Phase 1 (Foundation, Sign-In, RBAC & Consent)

### Phase 1 Features Built
1. **Containerized Architecture**: Single-command startup with Docker Compose (`docker compose up --build`), managing backend, frontend, single-node MongoDB replica set (`rs0`), and Redis with healthchecks.
2. **Modular Monolith Backend**: FastAPI application with domain separation under `backend/app/modules/` (`identity`, `consent`, `audit`, `core`).
3. **Role-Based Access Control (RBAC)**: Support for 5 roles: `patient`, `doctor`, `chw`, `pharmacy`, and `admin` with a reusable route-level dependency.
4. **Doctor Verification Workflow**: Doctors register with their Medical Council Registration number and start in `pending` status. Only admins can approve doctors, preventing unverified doctors from being booked.
5. **Patient Consent Engine**: Grant, list, and revoke telehealth consents. Patients grant consent for themselves; CHWs can record consent on behalf of patients.
6. **Append-Only Cryptographic Audit Log**: Monotonically sequenced hash chain (SHA-256) with optimistic concurrency retry preventing chain forks. Includes a complete verification algorithm (`/audit/verify`) detecting sequence gaps, altered blocks, and parent-hash tampering.
7. **Trilingual PWA Frontend**: React + Vite + Tailwind CSS + react-i18next with large touch targets (minimum 44px) supporting **English**, **Hindi (हिन्दी)**, and **Telugu (తెలుగు)** with 100% translated UI. Installable PWA configured via `vite-plugin-pwa`.
8. **Synthetic Seed Data**: Pre-seeded accounts across all 5 roles ready for viva and examiner demonstrations.
9. **Automated CI/CD**: GitHub Actions workflow testing backend with MongoDB & Redis services and building the frontend PWA.

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
│       │   ├── config.py        # Pydantic Settings
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
│       │   └── audit/           # Tamper-evident audit chain & verification
│       └── migrations/          # One-off data migrations directory
├── frontend/
│   ├── Dockerfile               # Multi-stage build with Nginx reverse proxy
│   ├── package.json             # React, Vite, react-i18next, Lucide, Tailwind
│   ├── vite.config.js           # Vite config with PWA manifest and service worker
│   └── src/
│       ├── App.jsx              # React router definitions
│       ├── i18n/                # Translation files (en.json, hi.json, te.json)
│       ├── components/          # Navbar, LanguageSwitcher, ProtectedRoute
│       └── features/            # Auth pages & role-specific dashboards
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
│   └── e2e/
│       ├── playwright.config.js # Playwright configuration
│       └── patient_dashboard_telugu.spec.js # Patient login in Telugu E2E test
├── docker-compose.yml           # Multi-service Compose with healthchecks
├── .env.example                 # Sample environment variables
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

---

## Local Development (Without Docker)

### 1. Backend Setup
```bash
cd backend
python -m venv .venv

# On Windows:
.\.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt

# Run seed script to populate synthetic test users
python -m app.seed

# Start backend server
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 in your browser.

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

### Pytest Backend Test Suite:
```bash
pytest -v tests
```
Runs 11 automated test cases verifying:
- Authentication & JWT token refresh
- Role-based authorization & doctor approval
- Patient self-consent & CHW assisted-consent
- Audit log monotonic sequencing, concurrent lockless append, and tamper detection

### Playwright E2E Test (Patient Login in Telugu):
```bash
cd tests/e2e
npm install
npx playwright test
```
