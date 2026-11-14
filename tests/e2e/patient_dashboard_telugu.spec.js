import { test, expect } from '@playwright/test';

test.describe('Patient Authentication and Telugu Localization', () => {
  test('log in as a patient and see the dashboard in Telugu', async ({ page }) => {
    // 1. Navigate to CareBridge login page
    await page.goto('/login');

    // 2. Select Telugu from the Language Switcher
    const teluguButton = page.getByRole('button', { name: 'Switch language to Telugu' });
    await teluguButton.click();

    // Verify login screen updates into Telugu
    await expect(page.getByText('కేర్‌బ్రిడ్జ్‌కి సైన్ ఇన్ చేయండి')).toBeVisible();

    // 3. Fill in seeded synthetic patient credentials
    await page.fill('input[type="email"]', 'patient.anita@carebridge.local');
    await page.fill('input[type="password"]', 'Patient@123');

    // 4. Click Submit / Sign In
    const submitBtn = page.getByRole('button', { name: /సైన్ ఇన్ చేయండి/i });
    await submitBtn.click();

    // 5. Verify redirection to Dashboard
    await page.waitForURL('**/dashboard');

    // 6. Assert Patient Dashboard shell in Telugu
    // Heading: "స్వాగతం, Anita Devi!"
    await expect(page.getByText(/స్వాగతం/)).toBeVisible();
    await expect(page.getByText(/Anita Devi/)).toBeVisible();

    // Consents Section Header in Telugu: "నా టెలిహెల్త్ సమ్మతులు"
    await expect(page.getByText('నా టెలిహెల్త్ సమ్మతులు')).toBeVisible();

    // Grant Consent Button in Telugu: "కొత్త సమ్మతిని మంజూరు చేయండి"
    await expect(page.getByText('కొత్త సమ్మతిని మంజూరు చేయండి')).toBeVisible();

    // Quick Actions Header in Telugu: "త్వరిత చర్యలు"
    await expect(page.getByText('త్వరిత చర్యలు')).toBeVisible();

    // Sign out button should also be accessible
    const logoutBtn = page.getByRole('button', { name: /లాగ్ అవుట్/i });
    await expect(logoutBtn).toBeVisible();
  });
});
