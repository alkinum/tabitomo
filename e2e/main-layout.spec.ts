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
      await expect(page.getByLabel('Provider', { exact: true })).toBeVisible();
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

test('OpenRouter API key, vision catalog selection, and manual provider fallback', async ({ page }) => {
  await page.route('https://openrouter.ai/api/v1/models', (route) => {
    expect(route.request().headers().authorization).toBe('Bearer mock-direct-key');
    return route.fulfill({ headers: corsHeaders, json: { data: [
    { id: 'vendor/vision', name: 'Travel Vision', architecture: { input_modalities: ['text', 'image'] } },
    { id: 'vendor/text', name: 'Travel Text', architecture: { input_modalities: ['text'] } },
  ] } }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Provider', { exact: true }).selectOption('openrouter');
  await page.locator('#generalApiKey').fill('mock-direct-key');
  await expect(page.getByText('API Format', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect with OpenRouter' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load available models' }).click();
  await page.getByLabel('Image-capable models').check();
  await expect(page.getByRole('button', { name: /Travel Text/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Travel Vision/ }).click();
  await expect(page.getByRole('button', { name: /Travel Vision/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
  await page.reload();
  let chatCalls = 0;
  let responsesCalls = 0;
  await page.route('https://openrouter.ai/api/v1/chat/completions', (route) => {
    chatCalls++;
    return route.fulfill({ headers: corsHeaders, status: 404, json: { error: { message: 'Unknown endpoint' } } });
  });
  await page.route('https://openrouter.ai/api/v1/responses', (route) => {
    responsesCalls++;
    expect(route.request().headers().authorization).toBe('Bearer mock-direct-key');
    expect(route.request().postDataJSON().input).toBeTruthy();
    return route.fulfill({ headers: corsHeaders, json: { output_text: '駅はこちらです' } });
  });
  await page.getByRole('textbox', { name: 'Source text' }).fill('Where is the station?');
  await expect(page.getByRole('region', { name: 'Translation', exact: true })).toContainText('駅はこちらです');
  expect(chatCalls).toBe(1);
  expect(responsesCalls).toBe(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#generalApiKey')).toHaveValue('mock-direct-key');
  await page.getByLabel('Provider', { exact: true }).selectOption('local-server');
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

for (const width of [390, 320]) {
  test(`Jina key-only setup, reload and image translation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    let recognized = false;
    await page.route('https://api.jina.ai/v1/chat/completions', (route) => {
      const body = route.request().postDataJSON();
      expect(body.model).toBe('jina-ocr-v1');
      expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\//);
      expect(route.request().headers().authorization).toBe('Bearer jina-test-key');
      recognized = true;
      return route.fulfill({ headers: corsHeaders, json: { choices: [{ message: { content: '# カフェ\nコーヒー ¥400' } }] } });
    });
    await page.route('https://mock.example/v1/chat/completions', (route) => route.fulfill({ headers: corsHeaders, json: { choices: [{ message: { content: 'Cafe — Coffee ¥400' } }] } }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Image', exact: true }).click();
    await page.getByRole('button', { name: 'Alibaba Qwen-OCR' }).click();
    await expect(page.getByLabel('OCR model', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page.getByLabel('OCR model', { exact: true })).toHaveValue('qwen3.5-ocr');
    await page.getByRole('button', { name: 'Jina OCR', exact: true }).click();
    await expect(page.locator('.ocr-settings').first().locator('input')).toHaveCount(1);
    await page.getByLabel('Jina API key', { exact: true }).fill('jina-test-key');
    await expect(page.getByLabel('Jina API key')).toHaveAttribute('type', 'password');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/web-jina-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
    await expect(page.getByLabel('Jina API key')).toHaveCount(0);
    await page.reload();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tabitomo_ai_settings')!).imageOCR);
    expect(saved).toMatchObject({ provider: 'jina', endpoint: 'https://api.jina.ai/v1', modelName: 'jina-ocr-v1', apiKey: 'jina-test-key' });
    await page.getByRole('button', { name: 'Image input' }).click();
    await expect(page.getByRole('button', { name: 'OCR text', exact: true })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'cafe.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lM7qjAAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(page.getByRole('region', { name: 'Translation', exact: true })).toContainText('Cafe — Coffee ¥400');
    expect(recognized).toBe(true);
    await expect(page.getByRole('img', { name: 'Translated', exact: true })).toHaveCount(0);
  });
}

for (const width of [1440, 390, 320]) {
  test(`settings tabs preserve drafts and keep navigation available at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const tabs = page.getByRole('tablist', { name: 'Settings sections' });
    await expect(tabs).toHaveAttribute('aria-orientation', width >= 700 ? 'vertical' : 'horizontal');
    await page.locator('#generalModel').fill('unsaved-travel-model');
    await page.getByRole('tab', { name: 'AI', exact: true }).focus();
    await page.keyboard.press(width >= 700 ? 'ArrowDown' : 'ArrowRight');
    await expect(page.getByRole('tab', { name: 'Translate', exact: true })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Translate', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Data', exact: true })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Import / Export', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Export file' }).click();
    await expect(page.getByPlaceholder('Enter encryption password')).toBeVisible();
    await page.getByRole('tab', { name: 'Image', exact: true }).click();
    const navBefore = await tabs.boundingBox();
    const save = page.getByRole('button', { name: 'Save Settings', exact: true });
    const saveBefore = await save.boundingBox();
    await page.locator('.settings-dialog-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect((await tabs.boundingBox())!.y).toBe(navBefore!.y);
    expect((await save.boundingBox())!.y).toBe(saveBefore!.y);
    await expect(save).toBeInViewport();
    await page.getByRole('tab', { name: 'AI', exact: true }).click();
    await expect(page.locator('#generalModel')).toHaveValue('unsaved-travel-model');
    await save.click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.locator('#generalModel')).toHaveValue('unsaved-travel-model');
    await page.getByRole('tab', { name: 'Data', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Data', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/web-settings-data-${width}.png`, fullPage: true });
  });
}

test('Data tab exports and imports encrypted settings including Jina', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#generalModel').fill('exported-draft-model');
  await page.getByRole('tab', { name: 'Image', exact: true }).click();
  await page.getByRole('button', { name: 'Jina OCR', exact: true }).click();
  await page.getByLabel('Jina API key', { exact: true }).fill('jina-export-key');
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await page.getByRole('button', { name: 'Export file', exact: true }).click();
  await page.getByPlaceholder('Enter encryption password').fill('test-export-password');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to File', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  expect(buffer.toString()).not.toContain('jina-export-key');
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await page.locator('#generalModel').fill('changed-model');
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await page.getByRole('button', { name: 'Import file', exact: true }).click();
  await page.getByPlaceholder('Enter encryption password').fill('test-export-password');
  await page.locator('.config-inline input[type="file"]').setInputFiles({ name: download.suggestedFilename(), mimeType: 'text/plain', buffer });
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#generalModel')).toHaveValue('exported-draft-model');
  await page.getByRole('tab', { name: 'Image', exact: true }).click();
  await expect(page.getByLabel('Jina API key', { exact: true })).toHaveValue('jina-export-key');
});
