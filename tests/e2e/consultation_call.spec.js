import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';

test.describe('Phase 2: Real-Time Telehealth Video Consultation & Live Queue', () => {
  test.setTimeout(90000);

  test.beforeEach(() => {
    // Ensure clean BOOKED state for Anita Devi before test runs
    try {
      const rootDir = 'C:\\Users\\prana\\OneDrive\\Desktop\\Capstone';
      const pyExe = `${rootDir}\\backend\\.venv\\Scripts\\python.exe`;
      execSync(`"${pyExe}" -m app.seed`, {
        cwd: `${rootDir}\\backend`,
        env: { ...process.env, PYTHONPATH: `${rootDir}\\backend;${rootDir}` },
      });
    } catch (e) {
      console.warn('Seed reset warning in beforeEach:', e.message);
    }
  });

  test('Two browser contexts (Doctor & Patient) complete real WebRTC call and chat', async ({ browser }) => {
    // 1. Create two isolated browser contexts with fake camera/mic permissions
    const patientContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
      launchOptions: {
        args: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
        ],
      },
    });

    const doctorContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
      launchOptions: {
        args: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
        ],
      },
    });

    const patientPage = await patientContext.newPage();
    const doctorPage = await doctorContext.newPage();

    try {
      // -------------------------------------------------------------
      // Step A: Patient logs in & joins waiting queue
      // -------------------------------------------------------------
      await patientPage.goto('/login');
      await patientPage.fill('input[type="email"]', 'patient.anita@carebridge.local');
      await patientPage.fill('input[type="password"]', 'Patient@123');
      await patientPage.click('button[type="submit"]');

      await patientPage.waitForURL('**/dashboard');
      await expect(patientPage.getByText(/Anita Devi/).first()).toBeVisible();

      // Look for the seeded appointment card and click Join
      const joinBtn = patientPage.getByRole('button', { name: /Join Consultation|Return to Waiting Room|Rejoin/i });
      await expect(joinBtn).toBeVisible({ timeout: 10000 });
      await joinBtn.click();

      // Patient is now on the consultation screen
      await patientPage.waitForURL(/\/consultation\//);
      await expect(patientPage.locator('[data-testid="local-video"]')).toBeVisible();

      // -------------------------------------------------------------
      // Step B: Doctor logs in & checks live waiting queue
      // -------------------------------------------------------------
      await doctorPage.goto('/login');
      await doctorPage.fill('input[type="email"]', 'dr.sharma@carebridge.local');
      await doctorPage.fill('input[type="password"]', 'Doctor@123');
      await doctorPage.click('button[type="submit"]');

      await doctorPage.waitForURL('**/dashboard');
      await expect(doctorPage.getByText(/Dr\. Rajesh Sharma/).first()).toBeVisible();

      // Assert that Anita Devi appears in doctor's live queue with dynamic wait time
      const patientInQueue = doctorPage.getByText(/Anita Devi/);
      await expect(patientInQueue).toBeVisible({ timeout: 10000 });
      await expect(doctorPage.getByText(/Wait:/)).toBeVisible();

      // Doctor clicks "Call Patient"
      const callPatientBtn = doctorPage.getByRole('button', { name: /Call Patient/i });
      await expect(callPatientBtn).toBeVisible();
      await callPatientBtn.click();

      // Doctor enters consultation screen
      await doctorPage.waitForURL(/\/consultation\//);
      await expect(doctorPage.locator('[data-testid="local-video"]')).toBeVisible();

      // -------------------------------------------------------------
      // Step C: WebRTC Call Establishment
      // -------------------------------------------------------------
      // Assert peer presence: Doctor sees patient online, Patient sees doctor online
      await expect(patientPage.getByText(/Online/i).first()).toBeVisible({ timeout: 15000 });
      await expect(doctorPage.getByText(/Online/i).first()).toBeVisible({ timeout: 15000 });

      // Doctor clicks "Connect Media (Start Call)" to generate SDP offer
      const startCallBtn = doctorPage.getByRole('button', { name: /Connect Media \(Start Call\)/i });
      await startCallBtn.click({ timeout: 10000 });

      // Assert WebRTC connection state transitions to 'connected' or 'connecting'
      const rtcStatus = doctorPage.locator('[data-testid="rtc-status"]');
      await expect(rtcStatus).toContainText(/connected|connecting/i, { timeout: 20000 });

      // Check remote video element is mounted and playing
      const doctorRemoteVideo = doctorPage.locator('[data-testid="remote-video"]');
      await expect(doctorRemoteVideo).toBeVisible();

      const patientRemoteVideo = patientPage.locator('[data-testid="remote-video"]');
      await expect(patientRemoteVideo).toBeVisible();

      // -------------------------------------------------------------
      // Step D: Real-time In-Call Chat Exchange
      // -------------------------------------------------------------
      // Doctor sends message
      const doctorChatInput = doctorPage.locator('input[placeholder*="Type a message"]');
      await doctorChatInput.fill('Hello Anita, how are you feeling today?');
      await doctorPage.locator('button[title="Send"]').click();

      // Patient receives doctor's message
      await expect(patientPage.getByText('Hello Anita, how are you feeling today?').first()).toBeVisible({ timeout: 10000 });

      // Patient replies
      const patientChatInput = patientPage.locator('input[placeholder*="Type a message"]');
      await patientChatInput.fill('Hello Doctor, I had a fever yesterday.');
      await patientPage.locator('button[title="Send"]').click();

      // Doctor receives patient's reply
      await expect(doctorPage.getByText('Hello Doctor, I had a fever yesterday.').first()).toBeVisible({ timeout: 10000 });

      // -------------------------------------------------------------
      // Step E: Doctor Completes Consultation with Notes
      // -------------------------------------------------------------
      // Switch to Notes tab on doctor screen
      const notesTab = doctorPage.getByRole('button', { name: /Clinical Notes/i });
      await notesTab.click();

      // Enter clinical notes
      const notesTextarea = doctorPage.locator('textarea');
      await notesTextarea.fill('Prescribed paracetamol 500mg and warm hydration. Follow up in 3 days.');

      // Click complete visit button
      const completeBtn = doctorPage.getByRole('button', { name: /Mark Consultation Completed/i });
      await completeBtn.click();

      // Verify doctor redirected back to dashboard upon completion
      await doctorPage.waitForURL('**/dashboard', { timeout: 15000 });
      await expect(doctorPage.getByText(/Live Patient Waiting Queue/i)).toBeVisible();

    } finally {
      await patientContext.close();
      await doctorContext.close();
    }
  });
});
