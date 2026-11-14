import { test, expect } from '@playwright/test';

test.describe('Phase 4: Clinical Records, Offline Sync & Ed25519 Prescriptions', () => {
  test('Complete Flow: Doctor prescribes -> Patient views offline & QR -> Pharmacy dispenses -> 2nd dispense blocked', async ({
    request,
    browser,
  }) => {
    // --------------------------------------------------------------------------
    // 1. Get Patient Anita Devi's user_id from login
    // --------------------------------------------------------------------------
    const patLoginRes = await request.post('http://localhost:8000/auth/login', {
      data: {
        email: 'patient.anita@carebridge.local',
        password: 'Patient@123',
      },
    });
    expect(patLoginRes.ok()).toBeTruthy();
    const patJson = await patLoginRes.json();
    const patientUserId = patJson.user.user_id;
    expect(patientUserId).toBeTruthy();

    // --------------------------------------------------------------------------
    // 2. Doctor logs in and issues Ed25519 digitally signed prescription
    // --------------------------------------------------------------------------
    const docLoginRes = await request.post('http://localhost:8000/auth/login', {
      data: {
        email: 'dr.sharma@carebridge.local',
        password: 'Doctor@123',
      },
    });
    expect(docLoginRes.ok()).toBeTruthy();
    const { access_token: docToken } = await docLoginRes.json();

    const rxRes = await request.post('http://localhost:8000/prescriptions', {
      headers: { Authorization: `Bearer ${docToken}` },
      data: {
        patient_id: patientUserId,
        patient_name: 'Anita Devi',
        items: [
          {
            drug_name: 'Amoxicillin Trihydrate',
            dose: '500mg',
            frequency: '1-0-1',
            duration: '5 days',
            instructions: 'భోజనం తర్వాత వేసుకోండి (Take after meals)',
          },
          {
            drug_name: 'Paracetamol',
            dose: '650mg',
            frequency: 'SOS',
            duration: '3 days',
            instructions: 'Take when fever exceeds 100°F',
          },
        ],
        notes: 'Rest and hydration advised. Avoid cold drinks.',
        valid_days: 14,
      },
    });

    expect(rxRes.status()).toBe(201);
    const rxData = await rxRes.json();
    const prescriptionId = rxData.prescription_id;
    expect(prescriptionId).toBeTruthy();
    expect(rxData.signature_valid).toBe(true);
    expect(rxData.status).toBe('issued');

    // --------------------------------------------------------------------------
    // 3. Patient logs in, logs FHIR vitals, and views Ed25519 prescription QR
    // --------------------------------------------------------------------------
    const patientContext = await browser.newContext();
    const patientPage = await patientContext.newPage();

    await patientPage.goto('/login');
    await patientPage.fill('input[type="email"]', 'patient.anita@carebridge.local');
    await patientPage.fill('input[type="password"]', 'Patient@123');
    await patientPage.click('button[type="submit"]');

    // Confirm dashboard reached
    await expect(patientPage.locator('h2:has-text("Anita Devi")')).toBeVisible({ timeout: 10000 });

    // Switch to Clinical Records tab
    await patientPage.click('[data-testid="tab-clinical-records-btn"]');
    await expect(patientPage.locator('[data-testid="network-sync-status-badge"]')).toBeVisible();

    // Add a new FHIR Vitals record
    await patientPage.click('[data-testid="open-add-record-btn"]');
    await patientPage.fill('[data-testid="systolic-input"]', '120');
    await patientPage.fill('[data-testid="diastolic-input"]', '80');
    await patientPage.fill('[data-testid="pulse-input"]', '72');
    await patientPage.fill('[data-testid="spo2-input"]', '98');
    await patientPage.click('[data-testid="save-record-submit-btn"]');

    // Verify vital sign card rendered in timeline
    await expect(patientPage.locator('[data-testid="clinical-record-card"]').first()).toBeVisible({ timeout: 8000 });
    await expect(patientPage.locator('text=120 / 80 mmHg').first()).toBeVisible();

    // Switch to Digital Prescriptions tab
    await patientPage.click('[data-testid="tab-prescriptions-btn"]');
    await expect(patientPage.locator('[data-testid="prescription-card"]').first()).toBeVisible({ timeout: 8000 });
    await expect(patientPage.locator('text=Dr. Rajesh Sharma, MD').first()).toBeVisible();

    // Open Prescription Viewer and verify Ed25519 cryptographic badge and QR
    await patientPage.locator(`[data-testid="view-rx-qr-${prescriptionId}"]`).click();
    await expect(patientPage.locator('[data-testid="ed25519-valid-badge"]')).toBeVisible();
    await expect(patientPage.locator('[data-testid="prescription-qr-image"]')).toBeVisible();

    // Click to find nearby pharmacies
    await patientPage.click('[data-testid="open-pharmacy-finder-btn"]');
    await expect(patientPage.locator('text=Verified Pharmacy Finder')).toBeVisible();
    await expect(patientPage.locator('text=MOCK PROVIDER DATA')).toBeVisible();
    await expect(patientPage.locator('[data-testid="pharmacy-item-card"]').first()).toBeVisible();

    await patientContext.close();

    // --------------------------------------------------------------------------
    // 4. Pharmacy verifies Ed25519 signature and dispenses with atomic single-use guard
    // --------------------------------------------------------------------------
    const pharmacyContext = await browser.newContext();
    const pharmacyPage = await pharmacyContext.newPage();

    await pharmacyPage.goto('/login');
    await pharmacyPage.fill('input[type="email"]', 'pharmacy.apollo@carebridge.local');
    await pharmacyPage.fill('input[type="password"]', 'Pharmacy@123');
    await pharmacyPage.click('button[type="submit"]');

    // Confirm pharmacy gateway reached
    await expect(pharmacyPage.locator('[data-testid="pharmacy-dashboard-heading"]')).toBeVisible({ timeout: 10000 });

    // Paste prescription UUID into scanner input and verify
    await pharmacyPage.fill('[data-testid="prescription-search-input"]', prescriptionId);
    await pharmacyPage.click('[data-testid="verify-prescription-btn"]');

    // Confirm Ed25519 cryptographic signature is verified and status is ISSUED
    await expect(pharmacyPage.locator('[data-testid="ed25519-verified-chip"]')).toBeVisible({ timeout: 8000 });
    await expect(pharmacyPage.locator('[data-testid="status-issued-badge"]')).toBeVisible();
    await expect(pharmacyPage.locator('text=Amoxicillin Trihydrate — 500mg')).toBeVisible();

    // Perform First Dispense -> succeeds
    await pharmacyPage.click('[data-testid="confirm-dispense-btn"]');
    await expect(pharmacyPage.locator('[data-testid="dispense-success-banner"]')).toBeVisible({ timeout: 8000 });
    await expect(pharmacyPage.locator('[data-testid="status-dispensed-badge"]')).toBeVisible();

    // Attempt Second Dispense on the exact same prescription -> BLOCKED by atomic guard
    await pharmacyPage.fill('[data-testid="prescription-search-input"]', prescriptionId);
    await pharmacyPage.click('[data-testid="verify-prescription-btn"]');

    // Confirm UI shows already dispensed warning and blocks further dispensing
    await expect(pharmacyPage.locator('[data-testid="status-dispensed-badge"]')).toBeVisible();
    await expect(
      pharmacyPage.locator('text=The CareBridge single-use atomic rule blocks any further dispensing.')
    ).toBeVisible();

    await pharmacyContext.close();
  });
});
