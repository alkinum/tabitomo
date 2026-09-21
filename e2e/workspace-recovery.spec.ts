import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });
const endpoint = 'https://review.example/v1';
const settings = { generalAI: { endpoint, apiKey: 'synthetic-key', modelName: 'first-model' }, translation: { outputMode: 'plain' } };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const completion = (text: string) => ({ headers: cors, json: { choices: [{ message: { content: text } }] } });

test.beforeEach(async ({ page }, info) => {
  if (info.title.startsWith('manual setup')) return;
  await page.addInitScript(value => { if (!localStorage.getItem('tabitomo_ai_settings')) localStorage.setItem('tabitomo_ai_settings', JSON.stringify(value)); }, settings);
});

test('stopping while microphone permission is pending releases the late stream', async ({ page }) => {
  await page.addInitScript(value => {
    localStorage.setItem('tabitomo_ai_settings', JSON.stringify({ ...value, speechRecognition: {
      provider: 'openai-compatible', endpoint: value.generalAI.endpoint, modelName: 'mock-asr', enableRealtimeTranscription: false,
    } }));
    const state = { requested: false, stopped: false, recorderStarts: 0, release: () => {} };
    Object.defineProperty(window, 'reviewMic', { value: state });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => new Promise(resolve => {
      state.requested = true;
      state.release = () => resolve({ getTracks: () => [{ stop: () => { state.stopped = true; } }] } as unknown as MediaStream);
    }) } });
    Object.defineProperty(window, 'MediaRecorder', { value: class { start() { state.recorderStarts++; } } });
  }, settings);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { reviewMic: { requested: boolean } }).reviewMic.requested)).toBe(true);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.evaluate(() => (window as unknown as { reviewMic: { release: () => void } }).reviewMic.release());
  await expect.poll(() => page.evaluate(() => (window as unknown as { reviewMic: { stopped: boolean } }).reviewMic.stopped)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { reviewMic: { recorderStarts: number } }).reviewMic.recorderStarts)).toBe(0);
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled();
});

test('voice stop uses the final transcript and locks the language during recording', async ({ page }) => {
  await page.addInitScript(() => {
    class Recognition {
      onresult?: (event: unknown) => void;
      onend?: () => void;
      start() { this.onresult?.({ results: [[{ transcript: 'Partial' }]] }); }
      stop() { this.onresult?.({ results: [[{ transcript: 'Complete final transcript' }]] }); this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: Recognition });
  });
  let request = '';
  await page.route(`${endpoint}/chat/completions`, route => {
    request = route.request().postData() || '';
    return route.fulfill(completion('Translated final transcript'));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('combobox', { name: 'Target language' })).toBeDisabled();
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByRole('button', { name: 'Copy to clipboard' })).toBeEnabled();
  expect(request).toContain('Complete final transcript');
  await expect(page.getByLabel('Source text')).toHaveValue('Complete final transcript');
});

test('audio can be stopped and copying reports failures without losing the result', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { value: { cancel() {}, getVoices() { return []; }, speak() {} } });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied'); } } });
  });
  await page.route(`${endpoint}/chat/completions`, route => route.fulfill(completion('Review translation')));
  await page.goto('/');
  await page.getByLabel('Source text').fill('Original');
  await page.getByRole('button', { name: 'Play audio' }).click();
  await expect(page.getByRole('button', { name: 'Stop audio' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop audio' }).click();
  await expect(page.getByRole('button', { name: 'Play audio' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy to clipboard' }).click();
  await expect(page.getByText('Copy failed', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Translation', exact: true })).toContainText('Review translation');
});

test('changing language cancels both pending debounce and in-flight output', async ({ page }) => {
  let release!: () => void;
  let calls = 0;
  await page.route(`${endpoint}/chat/completions`, async route => {
    calls++;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill(completion('Stale Japanese output')).catch(() => {});
  });
  await page.goto('/');
  await page.getByLabel('Source text').fill('First text');
  await expect.poll(() => calls).toBe(1);
  await page.getByRole('combobox', { name: 'Target language' }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  release();
  await expect(page.getByRole('region', { name: 'Translation', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.waitForTimeout(700);
  await expect(page.getByRole('button', { name: 'Copy to clipboard' })).toBeDisabled();
  await page.getByLabel('Source text').fill('Debounced text');
  await page.getByRole('combobox', { name: 'Target language' }).click();
  await page.getByRole('option', { name: 'French', exact: true }).click();
  await page.waitForTimeout(700);
  expect(calls).toBe(1);
});

test('saving a different model invalidates the translation cache', async ({ page }) => {
  const models: string[] = [];
  await page.route(`${endpoint}/chat/completions`, route => {
    const model = route.request().postDataJSON().model;
    models.push(model);
    return route.fulfill(completion(`Result from ${model}`));
  });
  await page.goto('/');
  await page.getByLabel('Source text').fill('Hello');
  await expect(page.getByRole('region', { name: 'Translation', exact: true })).toContainText('Result from first-model');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Model', { exact: true }).fill('second-model');
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await page.locator('.workspace-primary').click();
  await expect(page.getByRole('region', { name: 'Translation', exact: true })).toContainText('Result from second-model');
  expect(models).toEqual(['first-model', 'second-model']);
});

test('Japanese annotation treats provider markup as literal text', async ({ page }) => {
  const text = '<img src="/missing-review-image" onerror="window.reviewInjected=true">日本語 & <b>text</b>';
  await page.route('**/kuromoji/**', route => route.abort());
  await page.route(`${endpoint}/chat/completions`, route => route.fulfill(completion(text)));
  await page.goto('/');
  await page.getByLabel('Source text').fill('Translate this markup');
  const result = page.getByRole('region', { name: 'Translation', exact: true });
  await expect(result).toContainText(text);
  await expect(result.locator('div.whitespace-pre-wrap')).toBeVisible();
  await expect(result).toContainText(text);
  await expect(result.locator('img, b')).toHaveCount(0);
  expect(await page.evaluate(() => 'reviewInjected' in window)).toBe(false);
});

for (const encoding of ['decoded', 'compressed']) test(`production Japanese dictionary produces safe ruby annotations (${encoding})`, async ({ page }) => {
  if (encoding === 'compressed') await page.route('**/kuromoji/dict/*.gz', async route => {
    const filename = new URL(route.request().url()).pathname.split('/').pop();
    await route.fulfill({ contentType: 'application/gzip', body: await readFile(`public/kuromoji/dict/${filename}`) });
  });
  await page.route(`${endpoint}/chat/completions`, route => route.fulfill(completion('日本語 <img src="x" onerror="window.reviewInjected=true">')));
  await page.goto('/');
  await page.getByLabel('Source text').fill('Japanese dictionary review');
  const result = page.getByRole('region', { name: 'Translation', exact: true });
  await expect(result.locator('ruby rt').first()).toHaveText('にほんご', { timeout: 20000 });
  await expect(result).toContainText('<img src="x" onerror="window.reviewInjected=true">');
  await expect(result.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => 'reviewInjected' in window)).toBe(false);
  await page.screenshot({ path: `output/overall-review-2026-09-21/japanese-${encoding}-${test.info().project.name}.png` });
});

test('failed photo processing preserves the image for a retry', async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('tabitomo_ai_settings', JSON.stringify({ ...value, imageOCR: { provider: 'openai-compatible', useGeneralAI: true } })), settings);
  let fail = true;
  await page.route(`${endpoint}/chat/completions`, route => {
    if (fail) return route.fulfill({ headers: cors, status: 503, json: { error: { message: 'Temporarily unavailable' } } });
    return route.fulfill(completion('Readable text'));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Image input' }).click();
  await page.locator('input[type=file]').setInputFiles('public/icons/buddy.png');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Original', exact: true })).toBeVisible();
  fail = false;
  await page.locator('.workspace-primary').click();
  await expect(page.getByRole('button', { name: 'Copy to clipboard' })).toBeEnabled();
});

test('manual setup keeps the draft and reports storage failure', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'tabitomo_ai_settings') throw new Error('Storage unavailable for review');
      original.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Manual Setup' }).click();
  await page.getByLabel('Endpoint', { exact: true }).fill(endpoint);
  await page.getByLabel('API key', { exact: true }).fill('synthetic-key');
  await page.getByLabel('Model', { exact: true }).fill('first-model');
  await page.getByRole('button', { name: 'Start translating' }).click();
  await expect(page.getByRole('alert')).toContainText('Storage unavailable for review');
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('first-model');
});
