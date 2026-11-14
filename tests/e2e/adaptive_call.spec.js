import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Phase 3: Network-Adaptive Consultation & Reliable Reconnection', () => {
  test.beforeEach(() => {
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

  test('Mode drops to AUDIO_ONLY on 2G throttling/loss and recovers to VIDEO on stable network', async ({ browser }) => {
    test.setTimeout(90000);

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
      // 1. Patient logs in & joins visit
      await patientPage.goto('/login');
      await patientPage.fill('input[type="email"]', 'patient.anita@carebridge.local');
      await patientPage.fill('input[type="password"]', 'Patient@123');
      await patientPage.click('button[type="submit"]');

      await patientPage.waitForURL('**/dashboard');
      const joinBtn = patientPage.getByRole('button', { name: /Join Consultation|Return to Waiting Room|Rejoin/i }).first();
      await expect(joinBtn).toBeVisible({ timeout: 10000 });
      await joinBtn.click();

      await patientPage.waitForURL(/\/consultation\//);
      const consultationUrl = patientPage.url();
      await expect(patientPage.locator('[data-testid="current-mode-indicator"]')).toBeVisible();

      // 2. Doctor logs in & joins same call
      await doctorPage.goto('/login');
      await doctorPage.fill('input[type="email"]', 'dr.sharma@carebridge.local');
      await doctorPage.fill('input[type="password"]', 'Doctor@123');
      await doctorPage.click('button[type="submit"]');

      await doctorPage.waitForURL('**/dashboard');
      await doctorPage.goto(consultationUrl);
      await doctorPage.waitForURL(/\/consultation\//);

      // Verify both initially in VIDEO mode
      await expect(patientPage.locator('[data-testid="current-mode-indicator"]')).toContainText(/Video/i);

      // 3. Emulate 2G Network Conditions using Chrome DevTools Protocol (CDP)
      const cdpSession = await patientContext.newCDPSession(patientPage);
      await cdpSession.send('Network.enable');
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 1200, // 1.2s RTT
        downloadThroughput: (50 * 1024) / 8, // 50 kbps
        uploadThroughput: (50 * 1024) / 8,
      });

      // Also trigger weak conditions via Dev Simulator panel to simulate packet loss > 8%
      const devPanelHeader = patientPage.locator('[data-testid="dev-simulator-panel"]');
      await expect(devPanelHeader).toBeVisible();
      await devPanelHeader.click();

      const weak2gBtn = patientPage.getByRole('button', { name: /Weak 2G/i });
      await expect(weak2gBtn).toBeVisible();
      await weak2gBtn.click();

      // 4. Assert mode drops to AUDIO_ONLY after consecutive bad samples
      // Hysteresis: 3 consecutive bad samples (each interval 2s = ~6s)
      await expect(patientPage.locator('[data-testid="current-mode-indicator"]')).toContainText(/Audio Only/i, { timeout: 20000 });
      await expect(patientPage.locator('[data-testid="audio-only-viewport"]')).toBeVisible({ timeout: 10000 });
      await expect(patientPage.locator('[data-testid="mode-change-banner"]')).toBeVisible();

      // 5. Restore network conditions to 4G/Wi-Fi via CDP and Simulator
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });

      const stableBtn = patientPage.getByRole('button', { name: /Stable 4G/i });
      await stableBtn.click();

      // 6. Assert mode recovers to VIDEO after 10 consecutive good samples
      // 10 samples * 2s = ~20s
      await expect(patientPage.locator('[data-testid="current-mode-indicator"]')).toContainText(/Video/i, { timeout: 35000 });
    } finally {
      await patientContext.close();
      await doctorContext.close();
    }
  });

  test('Reconnection gap replay: going offline mid-chat for 15s replays missing messages with zero duplicates', async ({ browser }) => {
    test.setTimeout(90000);

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
      // 1. Patient and Doctor join consultation
      await patientPage.goto('/login');
      await patientPage.fill('input[type="email"]', 'patient.anita@carebridge.local');
      await patientPage.fill('input[type="password"]', 'Patient@123');
      await patientPage.click('button[type="submit"]');

      await patientPage.waitForURL('**/dashboard');
      const joinBtn = patientPage.getByRole('button', { name: /Join Consultation|Return to Waiting Room|Rejoin/i }).first();
      await expect(joinBtn).toBeVisible({ timeout: 10000 });
      await joinBtn.click();
      await patientPage.waitForURL(/\/consultation\//);
      const consultationUrl = patientPage.url();

      await doctorPage.goto('/login');
      await doctorPage.fill('input[type="email"]', 'dr.sharma@carebridge.local');
      await doctorPage.fill('input[type="password"]', 'Doctor@123');
      await doctorPage.click('button[type="submit"]');

      await doctorPage.waitForURL('**/dashboard');
      await doctorPage.goto(consultationUrl);
      await doctorPage.waitForURL(/\/consultation\//);

      // Wait until both WebSocket connections are active and see peer online
      await expect(patientPage.getByText(/Online/i).first()).toBeVisible({ timeout: 15000 });
      await expect(doctorPage.getByText(/Online/i).first()).toBeVisible({ timeout: 15000 });

      // 2. Doctor sends initial message
      const doctorInput = doctorPage.locator('[data-testid="chat-input"]');
      await expect(doctorInput).toBeVisible({ timeout: 10000 });
      await doctorInput.fill('Initial message before disconnect');
      await doctorInput.press('Enter');
      await expect(patientPage.getByText('Initial message before disconnect').first()).toBeVisible({ timeout: 15000 });

      // 3. Patient goes offline for 15 seconds
      const devPanelHeader = patientPage.locator('[data-testid="dev-simulator-panel"]');
      await devPanelHeader.click();
      const offlineBtn = patientPage.locator('[data-testid="simulate-offline-15s-btn"]');
      await expect(offlineBtn).toBeVisible({ timeout: 5000 });
      await offlineBtn.click();

      // Wait 2 seconds while patient is offline
      await patientPage.waitForTimeout(2000);

      // 4. While Patient is offline, Doctor sends 2 gap messages
      const runId = Date.now();
      const gapMsg1 = `Doctor gap message 1 - ${runId}`;
      const gapMsg2 = `Doctor gap message 2 - ${runId}`;

      await doctorInput.fill(gapMsg1);
      await doctorInput.press('Enter');
      await doctorPage.waitForTimeout(1000);

      await doctorInput.fill(gapMsg2);
      await doctorInput.press('Enter');

      // 5. Wait for Patient's 15s offline simulation window to conclude and reconnect
      // Patient will reconnect with its last received sequence, and server replays gap
      await patientPage.waitForTimeout(16000);

      // 6. Verify missing messages replayed on Patient's timeline
      await expect(patientPage.getByText(gapMsg1).first()).toBeVisible({ timeout: 15000 });
      await expect(patientPage.getByText(gapMsg2).first()).toBeVisible({ timeout: 15000 });

      // 7. Verify NO DUPLICATES exist (each gap message appeared exactly once)
      const count1 = await patientPage.locator('[data-testid="chat-message-item"]').filter({ hasText: gapMsg1 }).count();
      const count2 = await patientPage.locator('[data-testid="chat-message-item"]').filter({ hasText: gapMsg2 }).count();
      expect(count1).toBe(1);
      expect(count2).toBe(1);
    } finally {
      await patientContext.close();
      await doctorContext.close();
    }
  });
});
