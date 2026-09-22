import { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Browser geometry verifies density and navigation. Actual software-keyboard
// insets are verified separately by the iOS Release simulator scenes.
export async function reviewSetupLayout(page, { mobile = false, screenshots }) {
  await mkdir(screenshots, { recursive: true });
  const header = mobile ? page.getByTestId('setup-header') : page.locator('.setup-header');
  const panel = header.locator('..');
  const scroll = mobile ? page.getByTestId('setup-scroll') : page.locator('.setup-content');
  const manual = page.getByRole('button', { name: /Manual setup/ });
  const back = page.getByRole('button', { name: 'Back', exact: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 720 }]) {
    await page.setViewportSize(viewport);
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      await expect(manual).toBeVisible();
      await expect.poll(() => manual.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(colorScheme === 'light' ? 'rgb(245, 245, 247)' : 'rgb(17, 17, 19)');
      await expect.poll(async () => (await panel.boundingBox()).height).toBeLessThan(viewport.height * 0.65);
      const compact = await panel.boundingBox();
      const prefix = `${mobile ? 'expo' : 'web'}-${viewport.width}-${colorScheme}`;
      await page.screenshot({ path: path.join(screenshots, `${prefix}-choice.png`) });
      await manual.click();
      await expect(back).toBeVisible();
      await expect.poll(async () => (await panel.boundingBox()).height).toBeGreaterThan(compact.height + 100);
      const form = await panel.boundingBox();
      expect(form.x).toBeGreaterThanOrEqual(0);
      expect(form.x + form.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(form.y + form.height).toBeLessThanOrEqual(viewport.height + 1);
      const backBefore = await back.boundingBox();
      const scrollBounds = await scroll.boundingBox();
      expect(backBefore.y + backBefore.height).toBeLessThanOrEqual(scrollBounds.y + 1);
      const load = page.getByRole('button', { name: 'Load available models', exact: true });
      await load.scrollIntoViewIfNeeded();
      const button = await load.boundingBox();
      const label = await load.getByText('Load available models', { exact: true }).boundingBox();
      expect(Math.abs(label.x + label.width / 2 - button.x - button.width / 2)).toBeLessThan(1);
      const model = page.getByLabel('Model', { exact: true });
      await model.fill('layout-review-model');
      await model.blur();
      expect(Math.abs((await back.boundingBox()).y - backBefore.y)).toBeLessThan(1);
      await page.screenshot({ path: path.join(screenshots, `${prefix}-form.png`) });
      await back.click();
      await expect(manual).toBeVisible();
      await expect.poll(async () => (await panel.boundingBox()).height).toBeLessThan(viewport.height * 0.65);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Import config', exact: true }).click();
  if (!mobile) {
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await back.click();
    await expect(page.getByRole('button', { name: 'File', exact: true })).toBeVisible();
  }
  await back.click();
  await expect(manual).toBeVisible();
}
