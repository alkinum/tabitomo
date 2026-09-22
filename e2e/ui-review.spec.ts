import { test, expect, type Page } from '@playwright/test';

async function configured(page: Page) {
  await page.addInitScript(() => localStorage.setItem('tabitomo_ai_settings', JSON.stringify({
    generalAI: { endpoint: 'https://mock.example/v1', apiKey: 'mock-key', modelName: 'mock-model' },
  })));
  await page.goto('/');
}

for (const width of [320, 390, 1440]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`all settings sections stay usable at ${width}px ${colorScheme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    await page.emulateMedia({ colorScheme });
    await configured(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
    for (const name of ['AI', 'Translate', 'Speech', 'Image', 'Data']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name, selected: true, exact: true })).toBeVisible();
      if (name === 'Data') await expect(dialog.getByRole('button', { name: 'Export file', exact: true })).toBeVisible();
      const save = dialog.getByRole('button', { name: 'Save Settings', exact: true });
      await expect(save).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const panel = page.locator('.settings-dialog');
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await page.screenshot({ animations: 'disabled', path: `output/ui-review-2026-09-22/web/${testInfo.project.name}-${width}-${colorScheme}-${name.toLowerCase()}.png` });
    }
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test('modal focus, nested help and provider Escape return to the correct layer', async ({ page }) => {
  await configured(page);
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await settings.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(dialog).toBeFocused();
  // Both ends of the tab sequence stay inside the modal.
  await page.getByRole('button', { name: 'Close settings', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Save Settings', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close settings', exact: true })).toBeFocused();
  const help = page.getByRole('button', { name: 'About General AI', exact: true });
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'General AI', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(help).toBeFocused();
  await page.getByRole('tab', { name: 'Speech', exact: true }).click();
  await page.getByRole('button', { name: 'Local Model', exact: true }).click();
  const provider = page.getByRole('combobox', { name: 'VAD Mode', exact: true });
  await provider.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(provider).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
});

test('camera permission error can retry and close without trapping the workspace', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: {
      getUserMedia: async () => { throw new DOMException('Denied for UI test', 'NotAllowedError'); },
    } });
  });
  await configured(page);
  await page.getByRole('button', { name: 'Image input', exact: true }).click();
  const open = page.getByRole('button', { name: 'Open camera', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  const camera = page.getByRole('dialog', { name: 'Camera', exact: true });
  await expect(camera.getByRole('alert')).toContainText('Could not open the camera');
  await expect(camera.getByRole('button', { name: 'Take photo', exact: true })).toBeDisabled();
  await camera.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(camera.getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(camera).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('closing camera before permission resolves releases the late stream', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { requested: false, stopped: false, resolve: (() => {}) as (stream: MediaStream) => void };
    Object.assign(window, { pendingCamera: state });
    Object.defineProperty(navigator, 'mediaDevices', { value: {
      getUserMedia: () => new Promise(resolve => { state.requested = true; state.resolve = resolve; }),
    } });
  });
  await configured(page);
  await page.getByRole('button', { name: 'Image input', exact: true }).click();
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Opening camera' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { pendingCamera: { requested: boolean } }).pendingCamera.requested)).toBe(true);
  await page.getByRole('button', { name: 'Close camera', exact: true }).click();
  await page.evaluate(() => {
    const state = (window as unknown as { pendingCamera: { stopped: boolean; resolve: (stream: MediaStream) => void } }).pendingCamera;
    state.resolve({ getTracks: () => [{ stop: () => { state.stopped = true; } }] } as unknown as MediaStream);
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { pendingCamera: { stopped: boolean } }).pendingCamera.stopped)).toBe(true);
});
