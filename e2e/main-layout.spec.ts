import { test, expect } from '@playwright/test';

// Route provider requests at the page boundary, including WebKit after PWA activation.
test.use({ serviceWorkers: 'block' });

const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

const configured = {
  generalAI: { endpoint: 'https://mock.example/v1', apiKey: 'mock-key', modelName: 'mock-model', apiFormat: 'openai-chat' },
  translation: { outputMode: 'plain' },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((settings) => { if (!localStorage.getItem('tabitomo_ai_settings')) localStorage.setItem('tabitomo_ai_settings', JSON.stringify(settings)); }, configured);
});

for (const width of [1440, 390, 320]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`workspace at ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await expect(page.getByRole('main', { name: 'Translation workspace' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy to clipboard' })).toBeDisabled();
      const source = await page.getByRole('region', { name: 'Source', exact: true }).boundingBox();
      const result = await page.getByRole('region', { name: 'Translation', exact: true }).boundingBox();
      expect(source).toBeTruthy(); expect(result).toBeTruthy();
      if (width > 700) {
        expect(result!.x).toBeGreaterThan(source!.x + source!.width);
        expect(Math.abs(result!.y - source!.y)).toBeLessThan(2);
      } else {
        expect(result!.y).toBeGreaterThan(source!.y + source!.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `output/playwright/web-${width}-${colorScheme}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Connect with OpenRouter' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `output/playwright/web-settings-${width}-${colorScheme}.png`, fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}

test('translation, mode switching and clear keep source text usable', async ({ page }) => {
  await page.route('https://mock.example/v1/chat/completions', (route) => route.fulfill({ headers: corsHeaders,
    json: { id: 'test', object: 'chat.completion', created: 1, model: 'mock-model', choices: [{ index: 0, message: { role: 'assistant', content: '駅はどこですか' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
  }));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Source text' }).fill('Where is the station?');
  await expect(page.getByRole('button', { name: 'Copy to clipboard' })).toBeEnabled();
  await page.getByRole('navigation', { name: 'Assistant mode' }).getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Source text' })).toHaveValue('Where is the station?');
  await expect(page.getByRole('combobox', { name: 'Source language' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Target language' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Source text' })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Copy to clipboard' })).toBeDisabled();
});

test('OpenRouter authorization, vision catalog selection, and manual provider fallback', async ({ page, context }) => {
  await context.route('https://openrouter.ai/auth?**', (route) => route.fulfill({ headers: corsHeaders, body: 'Mock authorization page' }));
  let exchanges = 0;
  await page.route('https://openrouter.ai/api/v1/auth/keys', async (route) => {
    exchanges++;
    const body = route.request().postDataJSON();
    expect(body.code).toBe('one-time-code');
    expect(body.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await route.fulfill({ headers: corsHeaders, json: { key: 'mock-authorized-key' } });
  });
  await page.route('https://openrouter.ai/api/v1/models', (route) => route.fulfill({ headers: corsHeaders, json: { data: [
    { id: 'vendor/vision', name: 'Travel Vision', architecture: { input_modalities: ['text', 'image'] } },
    { id: 'vendor/text', name: 'Travel Text', architecture: { input_modalities: ['text'] } },
  ] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Connect with OpenRouter' }).click();
  await page.getByLabel('Authorization code').fill('one-time-code');
  await page.getByRole('button', { name: 'Finish connection' }).click();
  await expect(page.getByText('Connected. Load models to choose one, then save your settings.')).toBeVisible();
  expect(exchanges).toBe(1);
  await page.getByRole('button', { name: 'Load available models' }).click();
  await page.getByLabel('Image-capable models').check();
  await expect(page.getByRole('button', { name: /Travel Text/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Travel Vision/ }).click();
  await expect(page.getByRole('button', { name: /Travel Vision/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Or choose a provider').selectOption('local-server');
  await expect(page.locator('#generalApiKey')).toHaveValue('');
});

test('voice input follows Q&A mode and permits the same output language', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeSpeechRecognition {
      onresult?: (event: unknown) => void;
      onend?: () => void;
      start() { this.onresult?.({ results: [[{ transcript: 'Where is platform two?' }]] }); }
      stop() { this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: FakeSpeechRecognition });
  });
  let requestText = '';
  await page.route('https://mock.example/v1/chat/completions', (route) => {
    requestText = route.request().postData() || '';
    return route.fulfill({ headers: corsHeaders, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ id: 'qa', choices: [{ index: 0, delta: { content: 'Use platform two.' }, finish_reason: null }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Target language' }).click();
  await page.getByRole('option', { name: 'Chinese', exact: true }).click();
  await page.getByRole('button', { name: 'Q&A', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('textbox', { name: 'Source text' })).toHaveValue('Where is platform two?');
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByRole('region', { name: 'Answer' })).toContainText('Use platform two.');
  expect(requestText).toContain('Where is platform two?');
  expect(requestText).toContain('"stream":true');
});

test('custom vision OCR displays translated text without a fabricated overlay', async ({ page }) => {
  await page.addInitScript((settings) => localStorage.setItem('tabitomo_ai_settings', JSON.stringify({
    ...settings,
    imageOCR: { provider: 'custom', endpoint: 'https://mock.example/v1', apiKey: 'mock-key', modelName: 'custom-vision' },
  })), configured);
  let usedVision = false;
  await page.route('https://mock.example/v1/chat/completions', (route) => {
    const request = route.request().postDataJSON();
    const isOCR = request.model === 'custom-vision';
    usedVision ||= isOCR;
    return route.fulfill({ headers: corsHeaders, json: { choices: [{ message: { content: isOCR ? 'カフェ' : 'Cafe' } }] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Image input' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'cafe.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lM7qjAAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(page.getByRole('region', { name: 'Translation', exact: true })).toContainText('Cafe');
  expect(usedVision).toBe(true);
  await expect(page.getByRole('img', { name: 'Translated', exact: true })).toHaveCount(0);
});
