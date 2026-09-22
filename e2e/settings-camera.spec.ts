import { test, expect } from '@playwright/test';

test.skip(({ browserName }) => browserName !== 'chromium', 'Uses Chromium synthetic camera hardware.');
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });
test('leaving the Data tab releases the scanner camera', async ({ page }) => {

  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.defineProperty(window, 'qrTestStreams', { value: streams });
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      streams.push(stream);
      return stream;
    };
  });
  await page.addInitScript(() => localStorage.setItem('tabitomo_ai_settings', JSON.stringify({ generalAI: { endpoint: 'https://mock.example/v1', apiKey: 'mock-key', modelName: 'mock-model' } })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
  await page.getByPlaceholder('Enter encryption password').fill('scanner-test-password');
  await page.getByRole('button', { name: 'Start Scanning', exact: true }).click();
  await expect.poll(() => page.locator('#qr-reader video').evaluateAll(videos => videos.some(video => (video as HTMLVideoElement).readyState >= 2))).toBe(true);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { qrTestStreams: MediaStream[] }).qrTestStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
  await expect(page.getByLabel('Provider', { exact: true })).toBeVisible();
});

test('first-run QR scanner opens and releases the camera on dismiss', async ({ page }) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.defineProperty(window, 'qrTestStreams', { value: streams });
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await getUserMedia(constraints);
      streams.push(stream);
      return stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Import config', exact: true }).click();
  await page.getByRole('button', { name: 'Scan QR', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('scanner-test-password');
  await page.getByRole('button', { name: 'Start Scanning', exact: true }).click();
  await expect.poll(() => page.locator('#qr-reader-wizard video').evaluateAll(videos => videos.some(video => (video as HTMLVideoElement).readyState >= 2))).toBe(true);
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { qrTestStreams: MediaStream[] }).qrTestStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
});

test('photo camera enables capture after preview loads and releases it on close', async ({ page }) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.defineProperty(window, 'cameraTestStreams', { value: streams });
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await getUserMedia(constraints);
      streams.push(stream);
      return stream;
    };
    localStorage.setItem('tabitomo_ai_settings', JSON.stringify({ generalAI: { endpoint: 'https://mock.example/v1', apiKey: 'mock-key', modelName: 'mock-model' } }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Image input', exact: true }).click();
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  const camera = page.getByRole('dialog', { name: 'Camera', exact: true });
  await expect(camera.getByRole('button', { name: 'Take photo', exact: true })).toBeEnabled();
  await camera.getByRole('button', { name: 'Close camera', exact: true }).click();
  await expect(camera).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { cameraTestStreams: MediaStream[] }).cameraTestStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
});
