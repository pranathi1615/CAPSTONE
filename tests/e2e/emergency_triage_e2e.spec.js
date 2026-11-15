import { test, expect } from '@playwright/test';

test.describe('Phase 6: Triage, Emergency & Follow-up E2E Tests', () => {
  test.setTimeout(90000);

  test('Test 1: Doctor Queue Sorting - Urgent patient jumps ahead of routine patient', async ({
    page,
    request,
  }) => {
    // 1. Doctor login
    const docLoginRes = await request.post('http://localhost:8000/auth/login', {
      data: {
        email: 'dr.sharma@carebridge.local',
        password: 'Doctor@123',
      },
    });
    expect(docLoginRes.ok()).toBeTruthy();
    const { access_token: docToken, user: docUser } = await docLoginRes.json();

    // 2. Doctor creates 2 slots in future
    const now = Date.now();
    const slotStart1 = new Date(now + 3600000);
    const slotEnd1 = new Date(now + 5400000);
    const slotStart2 = new Date(now + 7200000);
    const slotEnd2 = new Date(now + 9000000);

    await request.post('http://localhost:8000/appointments/slots', {
      headers: { Authorization: `Bearer ${docToken}` },
      data: {
        slot_start: slotStart1.toISOString(),
        slot_end: slotEnd1.toISOString(),
      },
    });

    await request.post('http://localhost:8000/appointments/slots', {
      headers: { Authorization: `Bearer ${docToken}` },
      data: {
        slot_start: slotStart2.toISOString(),
        slot_end: slotEnd2.toISOString(),
      },
    });

    // 3. Patient 1 (Routine) logs in, books slot 1, joins waiting queue
    const pat1LoginRes = await request.post('http://localhost:8000/auth/login', {
      data: {
        email: 'patient.anita@carebridge.local',
        password: 'Patient@123',
      },
    });
    expect(pat1LoginRes.ok()).toBeTruthy();
    const { access_token: pat1Token } = await pat1LoginRes.json();

    const pat1Book = await request.post('http://localhost:8000/appointments/book', {
      headers: { Authorization: `Bearer ${pat1Token}` },
      data: {
        doctor_id: docUser.user_id,
        slot_start: slotStart1.toISOString(),
        slot_end: slotEnd1.toISOString(),
        reason: 'Routine checkup and blood pressure refill',
        urgency: 'routine',
        urgency_reason: 'Routine follow-up',
      },
    });
    expect(pat1Book.ok()).toBeTruthy();
    const pat1Data = await pat1Book.json();

    // Join waiting room
    const join1Res = await request.post(`http://localhost:8000/appointments/${pat1Data.booking_id}/join`, {
      headers: { Authorization: `Bearer ${pat1Token}` },
    });
    expect(join1Res.ok()).toBeTruthy();

    // 4. Patient 2 (Urgent) logs in, books slot 2, joins waiting queue AFTER Patient 1
    const pat2LoginRes = await request.post('http://localhost:8000/auth/login', {
      data: {
        email: 'patient.demo@carebridge.local',
        password: 'Patient@123',
      },
    });
    expect(pat2LoginRes.ok()).toBeTruthy();
    const { access_token: pat2Token } = await pat2LoginRes.json();

    const pat2Book = await request.post('http://localhost:8000/appointments/book', {
      headers: { Authorization: `Bearer ${pat2Token}` },
      data: {
        doctor_id: docUser.user_id,
        slot_start: slotStart2.toISOString(),
        slot_end: slotEnd2.toISOString(),
        reason: 'Acute lower abdominal pain with high fever',
        urgency: 'urgent',
        urgency_reason: 'Acute systemic warning signs',
      },
    });
    expect(pat2Book.ok()).toBeTruthy();
    const pat2Data = await pat2Book.json();

    const join2Res = await request.post(`http://localhost:8000/appointments/${pat2Data.booking_id}/join`, {
      headers: { Authorization: `Bearer ${pat2Token}` },
    });
    expect(join2Res.ok()).toBeTruthy();

    // 5. Open Doctor Dashboard in browser
    await page.goto('/login');
    await page.fill('input[type="email"]', 'dr.sharma@carebridge.local');
    await page.fill('input[type="password"]', 'Doctor@123');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="doctor-dashboard-heading"]')).toBeVisible({ timeout: 15000 });

    // Verify queue displays Urgent patient jumping ahead of Routine patient
    const queueCards = page.locator('[data-testid^="queue-item-"]');
    await expect(queueCards.first()).toBeVisible({ timeout: 10000 });

    // First card should have urgent badge / reason
    const firstCardText = await queueCards.first().innerText();
    expect(firstCardText.toLowerCase()).toContain('urgent');

    console.log('[E2E TEST 1] Doctor queue order verified: Urgent patient jumped ahead of Routine patient');
  });

  test('Test 2: Emergency Alert WebSocket delivery to On-Call Doctor', async ({
    page,
    request,
  }) => {
    // 1. Doctor opens dashboard
    await page.goto('/login');
    await page.fill('input[type="email"]', 'dr.sharma@carebridge.local');
    await page.fill('input[type="password"]', 'Doctor@123');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="doctor-dashboard-heading"]')).toBeVisible({ timeout: 15000 });

    // Give 1 second for doctor WebSocket to connect
    await page.waitForTimeout(1000);

    // 2. Trigger an emergency triage evaluation via API
    const chwLoginRes = await request.post('http://localhost:8000/auth/login', {
      data: {
        email: 'chw.lakshmi@carebridge.local',
        password: 'Chw@123',
      },
    });
    expect(chwLoginRes.ok()).toBeTruthy();
    const { access_token: chwToken } = await chwLoginRes.json();

    const tStart = Date.now();
    const evalRes = await request.post('http://localhost:8000/triage/evaluate', {
      headers: { Authorization: `Bearer ${chwToken}` },
      data: {
        patient_id: 'test-emergency-e2e-patient',
        patient_name: 'Emergency Patient Test',
        symptoms: ['chest_pain', 'sweating'],
        vitals: { pulse: 120, systolic_bp: 180 },
        symptom_text: 'Severe crushing chest pain with cold sweat',
      },
    });
    expect(evalRes.ok()).toBeTruthy();
    const evalData = await evalRes.json();
    expect(evalData.urgency).toBe('emergency');

    // 3. Verify WebSocket emergency alert banner appears on doctor dashboard
    const alertBanner = page.locator('[data-testid="on-call-emergency-alert-banner"]');
    await expect(alertBanner).toBeVisible({ timeout: 10000 });
    const latency = Date.now() - tStart;
    console.log(`[E2E TEST 2] Emergency alert received by on-call doctor via WebSocket in ${latency}ms`);

    await expect(alertBanner).toContainText('Emergency');
    await expect(alertBanner).toContainText('Emergency Patient Test');
  });

  test('Test 3: Offline Emergency Screen, 108 Ambulance & Referral PDF Download', async ({
    page,
  }) => {
    // 1. CHW logs in
    await page.goto('/login');
    await page.fill('input[type="email"]', 'chw.lakshmi@carebridge.local');
    await page.fill('input[type="password"]', 'Chw@123');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="chw-dashboard-heading"]')).toBeVisible({ timeout: 15000 });

    // Step 1: Select demo patient
    await page.click('[data-testid="patient-search-input"]');
    const firstPatient = page.locator('[data-testid^="select-patient-"]').first();
    await expect(firstPatient).toBeVisible({ timeout: 10000 });
    await firstPatient.click();

    // Step 2: Mandatory consent first
    await expect(page.locator('[data-testid="grant-consent-first-btn"]')).toBeVisible({ timeout: 10000 });
    await page.click('[data-testid="grant-consent-first-btn"]');

    // Step 3: Symptoms -> Proceed to Vitals
    await expect(page.locator('[data-testid="proceed-to-vitals-btn"]')).toBeVisible({ timeout: 10000 });
    await page.click('[data-testid="proceed-to-vitals-btn"]');

    // Step 4: Input critical red-flag vital (SpO2 = 82%)
    await page.fill('[data-testid="vitals-spo2-input"]', '82');

    // Emergency red-flag trigger appears
    const emergencyAlert = page.locator('[data-testid="chw-emergency-detected-alert"]');
    await expect(emergencyAlert).toBeVisible({ timeout: 10000 });

    // Click to open Emergency Screen Modal
    await page.click('[data-testid="open-emergency-protocol-btn"]');

    const emergencyModal = page.locator('[data-testid="emergency-screen"]');
    await expect(emergencyModal).toBeVisible({ timeout: 10000 });

    // Verify 108 ambulance link and hospital details
    await expect(emergencyModal.locator('text=Dial 108')).toBeVisible();
    await expect(emergencyModal.locator('text=District Area Government Hospital (MOCK)')).toBeVisible();

    // Verify Referral note download button
    const downloadBtn = page.locator('[data-testid="download-referral-pdf-btn"]');
    await expect(downloadBtn).toBeVisible();

    console.log('[E2E TEST 3] Offline emergency screen modal, 108 ambulance dialer and hospital details successfully verified');
  });
});
