import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

for (const width of [320, 390]) {
  test(`canvas and fixed settings respect all safe edges at ${width}px`, async ({ page }) => {
    const height = width === 320 ? 720 : 844;
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem('tabitomo_ai_settings', JSON.stringify({ generalAI: { endpoint: 'https://example.test/v1', apiKey: 'test-key', modelName: 'test-model' } })));
    await page.goto('/');
    // Browser engines in CI report zero hardware insets; emulate the CSS inputs.
    await page.evaluate(() => {
      for (const [edge, value] of Object.entries({ top: 59, bottom: 34, left: 22, right: 22 })) document.documentElement.style.setProperty(`--tt-safe-${edge}`, `${value}px`);
    });
    const brand = await page.getByRole('heading', { name: 'tabitomo', exact: true }).boundingBox();
    expect(brand!.y).toBeGreaterThanOrEqual(59);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(59);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height - 34 + 1);
    expect(box!.x).toBeGreaterThanOrEqual(22);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width - 22 + 1);
    const save = await page.getByRole('button', { name: 'Save Settings', exact: true }).boundingBox();
    expect(save!.y + save!.height).toBeLessThanOrEqual(height - 34);
    await page.screenshot({ path: `output/safe-area-review/web-${test.info().project.name}-${width}.png`, animations: 'disabled' });
  });
}
