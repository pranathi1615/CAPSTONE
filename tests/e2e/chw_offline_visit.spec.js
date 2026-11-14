import { test, expect } from '@playwright/test';

test.describe('Phase 5: Offline-First Sync & CHW Assisted Visits', () => {
  test.setTimeout(120000);

  test('Test 1: Complete 3 assisted visits offline -> go online -> server holds exactly 3 visits', async ({
    browser,
    request,
  }) => {
    // 1. CHW login
    const chwLoginRes = await request.post('http://localhost:8000/auth/login', {
      data: {
        email: 'chw.lakshmi@carebridge.local',
        password: 'Chw@123',
      },
    });
    expect(chwLoginRes.ok()).toBeTruthy();
    const { access_token: chwToken, user: chwUser } = await chwLoginRes.json();

    // Query initial count of assisted visits for this CHW
    const initVisitsRes = await request.get('http://localhost:8000/assisted-visits', {
      headers: { Authorization: `Bearer ${chwToken}` },
    });
    expect(initVisitsRes.ok()).toBeTruthy();
    const initialVisits = await initVisitsRes.json();
    const initialCount = initialVisits.length;

    // 2. Open CHW dashboard in browser
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');
    await page.fill('input[type="email"]', 'chw.lakshmi@carebridge.local');
    await page.fill('input[type="password"]', 'Chw@123');
    await page.click('button[type="submit"]');

    // Confirm dashboard & offline status banner visible
    await expect(page.locator('[data-testid="chw-dashboard-heading"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="offline-sync-status-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="sync-state-badge"]')).toHaveAttribute('data-sync-state', 'online', { timeout: 10000 });

    // 3. Cut off network: GO OFFLINE
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('[data-testid="sync-state-badge"]')).toHaveAttribute('data-sync-state', 'offline', { timeout: 10000 });

    // 4. Complete 3 assisted visits offline
    const testPatients = [
      { name: 'Ravi Kumar', phone: '+919876500001', bpSys: '120', bpDia: '80', sugar: '95', spo2: '98', temp: '36.8', pulse: '72' },
      { name: 'Sita Bai', phone: '+919876500002', bpSys: '145', bpDia: '95', sugar: '160', spo2: '93', temp: '38.5', pulse: '92' },
      { name: 'Gopal Rao', phone: '+919876500003', bpSys: '118', bpDia: '78', sugar: '105', spo2: '99', temp: '37.0', pulse: '70' },
    ];

    for (let i = 0; i < testPatients.length; i++) {
      const p = testPatients[i];

      // Step 1: Patient lookup / quick register
      await page.click('text=+ Quick Register New Patient (Offline)');
      await page.fill('[data-testid="new-patient-name"]', p.name);
      await page.fill('[data-testid="new-patient-phone"]', p.phone);
      await page.fill('[data-testid="new-patient-age"]', '45');
      await page.click('[data-testid="save-new-patient-btn"]');

      // Step 2: Consent FIRST (Mandatory Gate)
      await expect(page.locator('text=Step 2: Mandatory Telehealth Consent')).toBeVisible({ timeout: 5000 });
      await page.click('[data-testid="grant-consent-first-btn"]');

      // Step 3: Symptoms entry
      await expect(page.locator('text=Step 3: Capture Symptoms & Voice Notes')).toBeVisible({ timeout: 5000 });
      await page.click('[data-testid="symptom-card-fever"]');
      await page.click('[data-testid="symptom-card-cough"]');
      await page.click('[data-testid="proceed-to-vitals-btn"]');

      // Step 4: Vitals capture with out-of-range evaluation
      await expect(page.locator('text=Step 4: Capture Patient Vitals')).toBeVisible({ timeout: 5000 });
      await page.fill('[data-testid="vitals-systolic-input"]', p.bpSys);
      await page.fill('[data-testid="vitals-diastolic-input"]', p.bpDia);
      await page.fill('[data-testid="vitals-sugar-input"]', p.sugar);
      await page.fill('[data-testid="vitals-spo2-input"]', p.spo2);
      await page.fill('[data-testid="vitals-temp-input"]', p.temp);
      await page.fill('[data-testid="vitals-pulse-input"]', p.pulse);

      // For patient 2, verify out-of-range alert chip appears
      if (i === 1) {
        await expect(page.locator('[data-testid="out-of-range-alert-chip"]')).toBeVisible({ timeout: 5000 });
      }

      await page.click('[data-testid="proceed-to-review-btn"]');

      // Step 5: Review & Send Asynchronous Consult
      await expect(page.locator('text=Step 5: Review Visit & Choose Delivery Mode')).toBeVisible({ timeout: 5000 });
      await page.click('[data-testid="submit-async-consult-btn"]');

      // Confirmation banner & Shared-device End visit wipe
      await expect(page.locator('[data-testid="visit-completed-banner"]')).toBeVisible({ timeout: 5000 });
      await page.click('[data-testid="end-visit-wipe-btn"]');

      // Verify form is wiped and ready for next patient
      await expect(page.locator('text=Step 1: Look up or Register Patient')).toBeVisible({ timeout: 5000 });
    }

    // Verify outbox pending counter shows at least 3 items pending sync
    const pendingText = await page.locator('[data-testid="pending-queue-count"]').innerText();
    expect(parseInt(pendingText)).toBeGreaterThanOrEqual(3);

    // 5. RESTORE NETWORK: GO ONLINE
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Trigger sync drain
    await page.click('[data-testid="manual-sync-btn"]');

    // Wait until outbox drains and badge shows Online
    await expect(page.locator('[data-testid="sync-state-badge"]')).toHaveAttribute('data-sync-state', 'online', { timeout: 15000 });
    await expect(page.locator('[data-testid="pending-queue-count"]')).toHaveText(/0 (items|item) pending/, { timeout: 15000 });

    // 6. Verify server holds exactly the 3 newly synced visits!
    const finalVisitsRes = await request.get('http://localhost:8000/assisted-visits', {
      headers: { Authorization: `Bearer ${chwToken}` },
    });
    expect(finalVisitsRes.ok()).toBeTruthy();
    const finalVisits = await finalVisitsRes.json();
    expect(finalVisits.length).toBe(initialCount + 3);

    await context.close();
  });

  test('Test 2: Shared-Device Safety (Inactivity / Manual Lock & PIN unlock)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');
    await page.fill('input[type="email"]', 'chw.lakshmi@carebridge.local');
    await page.fill('input[type="password"]', 'Chw@123');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="chw-dashboard-heading"]')).toBeVisible({ timeout: 10000 });

    // Tap manual lock button
    await page.click('[data-testid="manual-lock-device-btn"]');

    // Screen lock modal must be visible
    await expect(page.locator('[data-testid="chw-screen-lock-modal"]')).toBeVisible();
    await expect(page.locator('text=Device Locked')).toBeVisible();

    // Wrong PIN test
    await page.fill('[data-testid="lock-screen-pin-input"]', '9999');
    await page.click('[data-testid="lock-screen-unlock-btn"]');
    await expect(page.locator('[data-testid="lock-pin-error"]')).toBeVisible();

    // Correct PIN test (default: 1234)
    await page.fill('[data-testid="lock-screen-pin-input"]', '1234');
    await page.click('[data-testid="lock-screen-unlock-btn"]');

    // Screen lock modal dismissed
    await expect(page.locator('[data-testid="chw-screen-lock-modal"]')).not.toBeVisible();

    await context.close();
  });

  test('Test 3: Idempotency: replay the same sync batch twice -> second returns duplicate and creates no duplicate records', async ({
    request,
  }) => {
    const chwLoginRes = await request.post('http://localhost:8000/auth/login', {
      data: {
        email: 'chw.lakshmi@carebridge.local',
        password: 'Chw@123',
      },
    });
    expect(chwLoginRes.ok()).toBeTruthy();
    const { access_token: chwToken } = await chwLoginRes.json();

    const idempotencyKeyConsent = `test-consent-idem-${Date.now()}`;
    const idempotencyKeyVisit = `test-visit-idem-${Date.now()}`;
    const patientUuid = 'befe74db-99f7-4946-8afe-38c84a91e1b1';
    const consentUuid = `consent-${Date.now()}`;
    const visitUuid = `visit-${Date.now()}`;

    const batchPayload = {
      batch: [
        {
          idempotency_key: idempotencyKeyConsent,
          item_type: 'consent',
          item_id: consentUuid,
          client_id: 'cli-consent-101',
          client_timestamp: new Date().toISOString(),
          payload: {
            patient_id: patientUuid,
            purpose: 'teleconsultation',
          },
        },
        {
          idempotency_key: idempotencyKeyVisit,
          item_type: 'visit',
          item_id: visitUuid,
          client_id: 'cli-visit-101',
          client_timestamp: new Date().toISOString(),
          payload: {
            patient_id: patientUuid,
            consent_id: consentUuid,
            vitals: {
              systolic: 120,
              diastolic: 80,
              spo2: 98,
              pulse: 72,
            },
            symptoms: ['headache', 'fatigue'],
            consultation_type: 'async_consult',
          },
        },
      ],
    };

    // First execution
    const firstRes = await request.post('http://localhost:8000/sync', {
      headers: { Authorization: `Bearer ${chwToken}` },
      data: batchPayload,
    });
    expect(firstRes.status()).toBe(200);
    const firstJson = await firstRes.json();
    expect(firstJson.applied).toBe(2);
    expect(firstJson.duplicates).toBe(0);

    // Second execution (REPLAY)
    const secondRes = await request.post('http://localhost:8000/sync', {
      headers: { Authorization: `Bearer ${chwToken}` },
      data: batchPayload,
    });
    expect(secondRes.status()).toBe(200);
    const secondJson = await secondRes.json();

    // Verify idempotency: duplicates is 2, applied is 0
    expect(secondJson.applied).toBe(0);
    expect(secondJson.duplicates).toBe(2);
    expect(secondJson.results[0].status).toBe('duplicate');
    expect(secondJson.results[1].status).toBe('duplicate');
  });

  test('Test 4: Abort & Resume: 10-item batch sync idempotency and resume without duplicates', async ({
    request,
  }) => {
    const chwLoginRes = await request.post('http://localhost:8000/auth/login', {
      data: {
        email: 'chw.lakshmi@carebridge.local',
        password: 'Chw@123',
      },
    });
    expect(chwLoginRes.ok()).toBeTruthy();
    const { access_token: chwToken } = await chwLoginRes.json();

    const timestamp = Date.now();
    const patientUuid = 'befe74db-99f7-4946-8afe-38c84a91e1b1';

    // Generate 10 distinct items
    const items = [];
    for (let i = 0; i < 10; i++) {
      items.push({
        idempotency_key: `abort-test-key-${timestamp}-${i}`,
        item_type: 'clinical_record',
        item_id: `rec-uuid-${timestamp}-${i}`,
        client_id: `cli-rec-${i}`,
        client_timestamp: new Date().toISOString(),
        payload: {
          patient_id: patientUuid,
          record_type: 'observation',
          category: 'vital-signs',
          code: 'blood-pressure',
          value_quantity: { value: 120 + i, unit: 'mmHg' },
          notes: `Batch item #${i + 1} for abort/resume verification`,
        },
      });
    }

    // Simulate partial failure / network drop: client sends first 5 items
    const partialBatch = { batch: items.slice(0, 5) };
    const firstRes = await request.post('http://localhost:8000/sync', {
      headers: { Authorization: `Bearer ${chwToken}` },
      data: partialBatch,
    });
    expect(firstRes.status()).toBe(200);
    const firstJson = await firstRes.json();
    expect(firstJson.applied).toBe(5);

    // Client reconnects and resumes the full 10-item batch!
    const fullBatch = { batch: items };
    const resumeRes = await request.post('http://localhost:8000/sync', {
      headers: { Authorization: `Bearer ${chwToken}` },
      data: fullBatch,
    });
    expect(resumeRes.status()).toBe(200);
    const resumeJson = await resumeRes.json();

    // First 5 must be reported as duplicate, remaining 5 applied!
    expect(resumeJson.duplicates).toBe(5);
    expect(resumeJson.applied).toBe(5);
    expect(resumeJson.processed).toBe(10);
  });

  test('Test 5: Rapid Offline/Online Transition Resilience (20 cycles)', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');
    await page.fill('input[type="email"]', 'chw.lakshmi@carebridge.local');
    await page.fill('input[type="password"]', 'Chw@123');
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="chw-dashboard-heading"]')).toBeVisible({ timeout: 10000 });

    // Perform 20 rapid online/offline network transitions
    for (let cycle = 1; cycle <= 20; cycle++) {
      const isOffline = cycle % 2 === 1;
      await context.setOffline(isOffline);
      await page.evaluate((offline) => {
        window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
      }, isOffline);
      await page.waitForTimeout(50);
    }

    // Restore online state
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Confirm UI remains robust, un-crashed, and operational
    await expect(page.locator('[data-testid="offline-sync-status-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="sync-state-badge"]')).toHaveAttribute('data-sync-state', 'online', { timeout: 10000 });

    await context.close();
  });
});
