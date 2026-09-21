import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const catalogURL = 'https://openrouter.ai/api/v1/models';
const model = 'tencent/hy-mt2-7b';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const configured = { generalAI: { endpoint: 'https://general.example/v1', apiKey: 'general-test-key', modelName: 'general-model', apiFormat: 'openai-chat' } };

for (const width of [320, 390]) for (const colorScheme of ['light', 'dark'] as const) {
  test(`MT2 translation connection ${width} ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addInitScript(settings => { if (!localStorage.getItem('tabitomo_ai_settings')) localStorage.setItem('tabitomo_ai_settings', JSON.stringify(settings)); }, configured);
    await page.route(catalogURL, route => {
      expect(route.request().headers().authorization).toBe('Bearer mt2-test-key');
      return route.fulfill({ headers: cors, json: { data: [
        { id: model, name: 'Tencent: Hy-MT2 7B', architecture: { input_modalities: ['text'] } },
        { id: 'vendor/other-translator', name: 'Other translator' },
      ] } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Provider', { exact: true })).not.toContainText('SiliconFlow');
    await page.getByRole('tab', { name: 'Translate', exact: true }).click();
    await page.getByRole('button', { name: 'Separate model', exact: true }).click();
    await expect(page.getByLabel('Provider', { exact: true })).not.toContainText('SiliconFlow');
    await page.getByLabel('Provider', { exact: true }).selectOption('openrouter');
    await page.getByLabel('API key', { exact: true }).fill('mt2-test-key');
    await page.getByRole('button', { name: 'Load available models' }).click();
    await page.getByLabel('Search models').fill('hy-mt2');
    await expect(page.getByLabel('Image-capable models')).toHaveCount(0);
    await page.getByRole('button', { name: /Tencent: Hy-MT2/ }).click();
    await expect(page.getByLabel('Model', { exact: true })).toHaveValue(model);
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Structured', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Plain text', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Fewer options', exact: true }).click();
    await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
    await page.reload();
    let calls = 0;
    await page.route('https://openrouter.ai/api/v1/chat/completions', route => {
      calls++;
      const body = route.request().postDataJSON();
      expect(body.model).toBe(model);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].content).toContain('Translate the following text into Japanese.');
      expect(route.request().headers().authorization).toBe('Bearer mt2-test-key');
      return route.fulfill({ headers: cors, json: { choices: [{ message: { content: 'こんにちは（友達）' } }] } });
    });
    await page.getByLabel('Source text').fill('你好');
    await expect(page.getByRole('region', { name: 'Translation', exact: true })).toContainText('こんにちは（友達）');
    expect(calls).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Translate', exact: true }).click();
    await expect(page.getByLabel('Model', { exact: true })).toHaveValue(model);
    await expect(page.getByRole('tab', { name: 'Translate', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'AI', exact: true })).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/translation-model-review/web-${test.info().project.name}-${width}-${colorScheme}.png`, fullPage: true });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tabitomo_ai_settings')!));
    expect(stored.generalAI).toEqual(configured.generalAI);
    await page.getByLabel('Provider', { exact: true }).selectOption('openai');
    await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Model', { exact: true })).toHaveValue('');
  });
}

test('first-run custom translation setup works when model discovery is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://custom.example/v1/models', route => route.fulfill({ status: 404, headers: cors, json: {} }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Manual Setup', exact: true }).click();
  await page.getByRole('button', { name: 'Translation', exact: true }).click();
  await expect(page.getByLabel('Provider', { exact: true })).not.toContainText('SiliconFlow');
  await expect(page.getByRole('button', { name: 'Recommended Settings' })).toHaveCount(0);
  await page.getByLabel('Endpoint', { exact: true }).fill('https://custom.example/v1');
  await page.getByLabel('API key', { exact: true }).fill('custom-test-key');
  await page.getByRole('button', { name: 'Load available models' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Could not load models' })).toContainText('enter a model ID manually');
  await page.getByLabel('Model', { exact: true }).fill('vendor/custom-translator');
  await page.getByRole('button', { name: 'Start translating', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manual Setup', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Translate', exact: true }).click();
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('vendor/custom-translator');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Plain text', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
