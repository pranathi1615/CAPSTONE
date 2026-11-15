import { test, expect } from '@playwright/test';

test.describe('Phase 7: Platform Analytics, Audit Verification & Hardening E2E Tests', () => {
  test('Admin verifies Phase 7 badge, runs 1-click cryptographic audit verification, filters logs, and inspects public health telemetry', async ({ page }) => {
    // 1. Log in as Administrator
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@carebridge.local');
    await page.fill('input[type="password"]', 'Admin@123');
    await page.click('button[type="submit"]');

    // 2. Wait for dashboard and check Navbar Phase 7 badge
    await expect(page.getByText('Phase 7 (Analytics, Audit Verification & Hardening)')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('admin-dashboard')).toBeVisible();

    // 3. Verify Audit Chain Inspector is the default tab and displays metrics
    await expect(page.getByText('Audit Chain Inspector')).toBeVisible();
    await expect(page.getByText('Chain Length')).toBeVisible();
    await expect(page.getByText('100% INTACT')).toBeVisible();
    await expect(page.getByText('Genesis Parent')).toBeVisible();

    // 4. Click 'Verify Audit Chain Integrity' button
    const verifyBtn = page.getByRole('button', { name: /Verify Audit Chain Integrity/i });
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();

    // 5. Assert verification result banner appears with green valid status
    await expect(page.getByText('Audit Chain Intact & Verified')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/All \d+ blocks are intact/i)).toBeVisible();
    await expect(page.getByText(/Algorithm:/i)).toBeVisible();

    // 6. Test Event Type Filter in Audit Log table
    const eventFilter = page.getByTestId('audit-event-filter');
    await expect(eventFilter).toBeVisible();
    await eventFilter.selectOption('SEED_USER_CREATED');
    await page.waitForTimeout(500);

    // 7. Switch to Platform Analytics tab
    const analyticsTabBtn = page.getByRole('button', { name: /Platform Analytics/i });
    await expect(analyticsTabBtn).toBeVisible();
    await analyticsTabBtn.click();

    // 8. Assert Analytics Dashboard renders all sections
    const analyticsDash = page.getByTestId('analytics-dashboard');
    await expect(analyticsDash).toBeVisible();

    await expect(page.getByText('Platform Telemetry & Public Health Analytics')).toBeVisible();
    await expect(page.getByText('Total Consultations', { exact: true })).toBeVisible();
    await expect(page.getByText('Avg Wait Time', { exact: true })).toBeVisible();
    await expect(page.getByText('Network Resilience', { exact: true })).toBeVisible();
    await expect(page.getByText('Offline Sync Idempotency', { exact: true })).toBeVisible();

    // Specialty & Triage sections
    await expect(page.getByText('Consultations by Medical Specialty')).toBeVisible();
    await expect(page.getByText('Triage Acuity & Urgency Distribution')).toBeVisible();

    // Weak network adaptive degradation
    await expect(page.getByText('Network Mode Adaptive Degradation')).toBeVisible();
    await expect(page.getByText('High Bandwidth Video')).toBeVisible();
    await expect(page.getByText('Low Bandwidth Audio')).toBeVisible();

    // Clinical interventions
    await expect(page.getByText('Clinical Interventions & Prescriptions')).toBeVisible();

    // 9. Switch to Doctor Approvals tab and back
    const approvalsTabBtn = page.getByRole('button', { name: /Doctor Approvals/i });
    await approvalsTabBtn.click();
    await expect(page.getByText(/Doctor Approvals/i).first()).toBeVisible();

    const auditTabBtn = page.getByRole('button', { name: /Audit Chain Inspector/i });
    await auditTabBtn.click();
    await expect(page.getByText('Chain Length')).toBeVisible();
  });
});
