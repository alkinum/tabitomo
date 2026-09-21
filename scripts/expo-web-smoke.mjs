import { reviewTranslationModels } from './translation-model-mobile-smoke.mjs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { reviewMobileInteractions } from './mobile-interaction-review.mjs';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const outDir = await mkdtemp(path.join(tmpdir(), 'tabitomo-expo-web-'));

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
]);

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
  }
};

const runCapture = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
  }

  return result.stdout.trim();
};

const importPassword = 'tabitomo-smoke-import-password';
const importedEndpoint = 'https://import.example.test/v1';
const importedModel = 'tabitomo-import-model';
const importedApiKey = 'sk-tabitomo-import';
const mockProviderEndpoint = 'https://example.test/v1';
const mockOCRProviderEndpoint = 'https://example.test/api/v1/services/aigc/multimodal-generation/generation';
const mockTranslation = 'Where is the station?';
const mockExplanation = 'This asks where the station is.';
const mockAnswer = 'Use: Where is the station?';
const mockImageTranslation = 'Cafe menu';
const mockOCRText = 'カフェ';
const mockOCRTranslation = 'Cafe';
const smokePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lM7qjAAAAABJRU5ErkJggg==';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const streamChunk = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

const createEncryptedConfigPayload = () => {
  const script = `
    import { DEFAULT_SETTINGS, exportConfigPayload, normalizeSettings } from './src/index.ts';

    void (async () => {
      const settings = normalizeSettings({
        ...DEFAULT_SETTINGS,
        generalAI: {
          ...DEFAULT_SETTINGS.generalAI,
          endpoint: ${JSON.stringify(importedEndpoint)},
          modelName: ${JSON.stringify(importedModel)},
          apiKey: ${JSON.stringify(importedApiKey)},
          apiFormat: 'openai-chat',
        },
        speechRecognition: {
          ...DEFAULT_SETTINGS.speechRecognition,
          provider: 'openai-compatible',
          modelName: 'mock-transcription-model',
          apiKey: 'speech-import-key',
        },
        imageOCR: {
          ...DEFAULT_SETTINGS.imageOCR,
          provider: 'qwen',
          endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
          modelName: 'qwen3.5-ocr',
          apiKey: 'ocr-import-key',
        },
        vlm: {
          ...DEFAULT_SETTINGS.vlm,
          useGeneralAI: false,
          useCustom: true,
          endpoint: 'https://vlm.import.example.test/v1',
          modelName: 'qwen-vl-max-latest',
          apiKey: 'vlm-import-key',
          enableThinking: true,
        },
      });

      const payload = await exportConfigPayload(settings, ${JSON.stringify(importPassword)});
      console.log('tabitomo-config:' + payload);
    })();
  `;

  return runCapture('pnpm', [
    '--dir',
    'packages/tabitomo-core',
    'exec',
    'tsx',
    '-e',
    script,
  ]).split('\n').at(-1);
};

const safeFilePath = async (urlPath) => {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0] || '/');
  const candidate = path.normalize(cleanPath === '/' ? '/index.html' : cleanPath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(outDir, candidate);

  if (!fullPath.startsWith(outDir)) {
    return path.join(outDir, 'index.html');
  }

  try {
    const fileStat = await stat(fullPath);
    return fileStat.isDirectory() ? path.join(fullPath, 'index.html') : fullPath;
  } catch {
    return path.join(outDir, 'index.html');
  }
};

let server;
let browser;

try {
  const encryptedConfigPayload = createEncryptedConfigPayload();

  run('pnpm', [
    '--dir',
    'apps/mobile',
    'exec',
    'expo',
    'export',
    '--platform',
    'web',
    '--output-dir',
    outDir,
  ]);

  const smokeImagePath = path.join(outDir, 'tabitomo-smoke-image.png');
  await writeFile(smokeImagePath, Buffer.from(smokePngBase64, 'base64'));

  server = createServer(async (request, response) => {
    try {
      const filePath = await safeFilePath(request.url || '/');
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': contentTypes.get(path.extname(filePath)) || 'application/octet-stream',
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : 'Internal server error');
    }
  });

  const baseURL = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not allocate smoke test server port.'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const runtimeErrors = [];
  const expectedHTTPFailures = new Set();
  const providerRequests = [];

  page.on('pageerror', (error) => {
    runtimeErrors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !expectedHTTPFailures.has(message.location().url)) {
      runtimeErrors.push(`console error: ${message.text()}`);
    }
  });

  await page.route('https://example.test/**/chat/completions', async (route) => {
    const request = route.request();

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: corsHeaders,
      });
      return;
    }

    const body = request.postDataJSON();
    providerRequests.push(body);

    const userContent = body.messages?.findLast?.((message) => message.role === 'user')?.content || '';
    const isImageRequest = Array.isArray(userContent)
        && userContent.some((part) => part?.type === 'image_url');

    if (body?.stream) {
      const responseText = isImageRequest
        ? mockImageTranslation
        : String(userContent).includes('Answer only')
        ? mockAnswer
        : mockExplanation;

      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders,
          'content-type': 'text/event-stream',
        },
        body: `${streamChunk(responseText.slice(0, 12))}${streamChunk(responseText.slice(12))}data: [DONE]\n\n`,
      });
      return;
    }

    if (isImageRequest) {
      await route.fulfill({ status: 200, headers: corsHeaders, json: { choices: [{ message: { content: mockOCRText } }] } });
      return;
    }

    const translationText = JSON.stringify(body).includes(mockOCRText)
      ? mockOCRTranslation
      : mockTranslation;

    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ translation: translationText }),
            },
          },
        ],
      }),
    });
  });

  await page.route(mockOCRProviderEndpoint, async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    providerRequests.push(body);
    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        output: {
          choices: [
            {
              message: {
                content: [
                  {
                    ocr_result: {
                      words_info: [
                        {
                          text: mockOCRText,
                          location: [0, 0, 1, 0, 1, 1, 0, 1],
                          rotate_rect: [0.5, 0.5, 1, 1, 0],
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    });
  });

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await page.getByText('tabitomo').first().waitFor({ state: 'visible' });
  await page.getByText('Set up tabitomo').waitFor({ state: 'visible' });
  await page.getByText('Import config').click();
  await page.getByText('Import encrypted config').waitFor({ state: 'visible' });
  await page.getByPlaceholder('Required for import').fill(importPassword);
  await page.getByPlaceholder('Encrypted .ttconfig payload').fill(encryptedConfigPayload);
  await page.getByRole('button', { name: 'Import pasted payload' }).click();
  await page.getByText('Set up tabitomo').waitFor({ state: 'detached' });
  await page.getByText('Source').waitFor({ state: 'visible' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Set up tabitomo').waitFor({ state: 'detached' });
  await page.getByText('Source').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByPlaceholder('https://api.openai.com/v1').waitFor({ state: 'visible' });
  let persistedEndpoint = await page.getByPlaceholder('https://api.openai.com/v1').inputValue();
  let persistedModel = await page.getByPlaceholder('Model ID', { exact: true }).inputValue();
  let persistedApiKey = await page.getByPlaceholder('sk-...').inputValue();

  if (
    persistedEndpoint !== importedEndpoint
    || persistedModel !== importedModel
    || persistedApiKey !== importedApiKey
  ) {
    throw new Error(`First-run encrypted config import did not persist imported General AI settings. endpoint=${JSON.stringify(persistedEndpoint)}, model=${JSON.stringify(persistedModel)}, apiKey=${JSON.stringify(persistedApiKey)}.`);
  }

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByPlaceholder('https://api.openai.com/v1').waitFor({ state: 'detached' });

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await page.getByText('tabitomo').first().waitFor({ state: 'visible' });
  await page.getByText('Set up tabitomo').waitFor({ state: 'visible' });
  await page.getByText('Manual setup').waitFor({ state: 'visible' });
  await page.getByText('Import config').waitFor({ state: 'visible' });

  await page.getByText('Manual setup').click();
  await page.getByText('Translation service', { exact: true }).waitFor({ state: 'visible' });
  if (await page.getByText('OpenAI Chat', { exact: true }).count()) throw new Error('Legacy protocol picker remains.');
  await page.getByPlaceholder('https://api.openai.com/v1').waitFor({ state: 'visible' });
  await page.getByPlaceholder('sk-...').first().waitFor({ state: 'visible' });

  await page.getByText('Back').click();
  await page.getByText('Import config').click();
  await page.getByText('Import encrypted config').waitFor({ state: 'visible' });
  await page.getByPlaceholder('Required for import').waitFor({ state: 'visible' });
  await page.getByText('Import file').waitFor({ state: 'visible' });
  await page.getByText('Scan QR').waitFor({ state: 'visible' });

  await page.getByText('Set up later').click();
  await page.getByText('Set up tabitomo').waitFor({ state: 'detached' });
  await page.getByText('Source').waitFor({ state: 'visible' });
  await page.getByText('Translation', { exact: true }).waitFor({ state: 'visible' });

  const sourceInput = page.getByLabel('Source text');
  await sourceInput.waitFor({ state: 'visible' });
  await sourceInput.fill('Where is the station?');

  await page.getByRole('tab', { name: 'Explain text mode' }).click();
  await page.getByText('Explanation setup needed').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Explain' }).waitFor({ state: 'visible' });

  await page.getByRole('tab', { name: 'Q&A text mode' }).click();
  await page.getByText('Answer setup needed').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Answer' }).waitFor({ state: 'visible' });

  await page.getByRole('tab', { name: 'Translate text mode' }).click();
  await page.getByText('Translation setup needed').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Translate' }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Speak' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Camera' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Album' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByText('Translation setup needed').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Japanese language' }).click();
  await page.getByText('Choose language').waitFor({ state: 'visible' });
  await page.getByLabel('Search languages').fill('no-such-language');
  await page.getByText('No matching languages.').waitFor({ state: 'visible' });
  await page.getByLabel('Search languages').fill('English');
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByRole('button', { name: 'English language' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'English language' }).click();
  if (await page.getByLabel('Search languages').inputValue()) throw new Error('Language search was retained after reopening.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Swap' }).click();
  await page.getByRole('button', { name: 'English language' }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByPlaceholder('https://api.openai.com/v1').waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'Translate settings' }).click();
  await page.getByText('Translation model', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'AI settings' }).click();

  await page.getByPlaceholder('https://api.openai.com/v1').fill(mockProviderEndpoint);
  await page.getByPlaceholder('Model ID', { exact: true }).fill('tabitomo-smoke-model');
  await page.getByPlaceholder('sk-...').fill('sk-tabitomo-smoke');

  await page.getByRole('tab', { name: 'Speech settings' }).click();
  await page.getByRole('button', { name: 'Native' }).waitFor({ state: 'visible' });

  await page.getByRole('tab', { name: 'Image settings' }).click();
  await page.getByText('Image OCR', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('VLM image translation', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Alibaba Qwen-OCR' }).click();
  if (await page.getByRole('textbox', { name: 'OCR model', exact: true }).count()) throw new Error('Qwen advanced fields should start collapsed.');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByPlaceholder(/dashscope-intl\.aliyuncs\.com/).fill(mockOCRProviderEndpoint);
  await page.getByPlaceholder('DashScope API key').fill('sk-tabitomo-ocr-smoke');
  await page.getByRole('button', { name: 'OCR settings' }).click();
  await page.getByText('OCR settings used by VLM', { exact: true }).waitFor({ state: 'visible' });
  if (await page.getByRole('textbox', { name: 'OCR model', exact: true }).first().inputValue() !== 'qwen3.5-ocr') throw new Error('Explicit Qwen model selection was lost.');
  await page.getByPlaceholder('DashScope API key').nth(1).waitFor({ state: 'visible' });

  await page.getByRole('tab', { name: 'Offline settings' }).click();
  await page.getByText('Local models', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Downloaded models', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText(/0 downloaded.*0 runtime-ready.*0 B/).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Download Whisper Base' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Download SenseVoice Small' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Download PP-OCR v6 Small' }).waitFor({ state: 'visible' });

  await page.getByRole('tab', { name: 'Data settings' }).click();
  await page.getByText('Import / Export', { exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('tab', { name: 'AI settings' }).click();
  if (await page.getByPlaceholder('Model ID', { exact: true }).inputValue() !== 'tabitomo-smoke-model') throw new Error('Switching sections discarded the AI draft.');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByText('Settings saved securely on this device.').waitFor({ state: 'visible' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Set up tabitomo').waitFor({ state: 'detached' });
  await page.getByText('Source').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByPlaceholder('https://api.openai.com/v1').waitFor({ state: 'visible' });
  persistedEndpoint = await page.getByPlaceholder('https://api.openai.com/v1').inputValue();
  persistedModel = await page.getByPlaceholder('Model ID', { exact: true }).inputValue();
  persistedApiKey = await page.getByPlaceholder('sk-...').inputValue();

  if (
    persistedEndpoint !== mockProviderEndpoint
    || persistedModel !== 'tabitomo-smoke-model'
    || persistedApiKey !== 'sk-tabitomo-smoke'
  ) {
    throw new Error('Settings did not persist across Expo web reload.');
  }

  await page.getByRole('tab', { name: 'Data settings' }).click();
  await page.getByPlaceholder('Required for export/import').fill('tabitomo-export-password');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByText('Encrypted .ttconfig payload copied. QR is ready below.').waitFor({ state: 'visible' });
  await page.getByText('Scan this from web or another device.').waitFor({ state: 'visible' });
  const exportedSettingsPayload = await page.getByLabel('Encrypted config payload').inputValue();
  if (!exportedSettingsPayload.trim()) {
    throw new Error('Settings export did not write an encrypted payload.');
  }

  await page.getByRole('tab', { name: 'AI settings' }).click();
  await page.getByPlaceholder('https://api.openai.com/v1').fill('https://changed.example.test/v1');
  await page.getByPlaceholder('Model ID', { exact: true }).fill('changed-model');
  await page.getByPlaceholder('sk-...').fill('sk-changed');
  await page.getByRole('tab', { name: 'Data settings' }).click();
  await page.getByLabel('Encrypted config payload').fill(exportedSettingsPayload);
  await page.getByRole('button', { name: 'Import pasted payload' }).click();
  await page.getByPlaceholder('https://api.openai.com/v1').waitFor({ state: 'detached' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Source').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByPlaceholder('https://api.openai.com/v1').waitFor({ state: 'visible' });
  persistedEndpoint = await page.getByPlaceholder('https://api.openai.com/v1').inputValue();
  persistedModel = await page.getByPlaceholder('Model ID', { exact: true }).inputValue();
  persistedApiKey = await page.getByPlaceholder('sk-...').inputValue();

  if (
    persistedEndpoint !== mockProviderEndpoint
    || persistedModel !== 'tabitomo-smoke-model'
    || persistedApiKey !== 'sk-tabitomo-smoke'
  ) {
    throw new Error('Settings import did not restore the exported provider settings.');
  }

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByPlaceholder('https://api.openai.com/v1').waitFor({ state: 'detached' });

  await page.getByLabel('Source text').fill('駅はどこですか？');
  await page.getByRole('button', { name: 'Translate' }).click();
  await page.getByText(mockTranslation).waitFor({ state: 'visible' });

  await page.getByRole('tab', { name: 'Explain text mode' }).click();
  await page.getByLabel('Source text').fill('駅はどこですか？');
  await page.getByRole('button', { name: 'Explain' }).click();
  await page.getByText(mockExplanation).waitFor({ state: 'visible' });

  await page.getByRole('tab', { name: 'Q&A text mode' }).click();
  await page.getByLabel('Source text').fill('How do I ask for the station?');
  await page.getByRole('button', { name: 'Answer' }).click();
  await page.getByText(mockAnswer).waitFor({ state: 'visible' });

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Album' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(smokeImagePath);
  await page.getByText(mockImageTranslation).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'OCR overlay image mode' }).click();
  const ocrFileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Album' }).click();
  const ocrFileChooser = await ocrFileChooserPromise;
  await ocrFileChooser.setFiles(smokeImagePath);
  await page.getByText(mockOCRText).first().waitFor({ state: 'visible' });
  await page.getByText(mockOCRTranslation).first().waitFor({ state: 'visible' });

  const completionRequests = providerRequests.filter((request) => request?.model === 'tabitomo-smoke-model');
  const streamingRequests = completionRequests.filter((request) => request?.stream === true);
  const nonStreamingRequests = completionRequests.filter((request) => request?.stream !== true);
  const imageRequests = providerRequests.filter((request) => {
    const userContent = request?.messages?.findLast?.((message) => message.role === 'user')?.content;
    return Array.isArray(userContent) && userContent.some((part) => part?.type === 'image_url');
  });
  const reusedOcrVlmRequests = providerRequests.filter((request) => request?.model === 'qwen-vl-max-latest' && request?.stream === true && imageRequests.includes(request));
  const reusedOcrRecognitionRequests = providerRequests.filter((request) => request?.model === 'qwen3.5-ocr' && JSON.stringify(request).includes('data:image'));

  if (completionRequests.length < 4 || streamingRequests.length < 2 || nonStreamingRequests.length < 2 || imageRequests.length < 1 || reusedOcrVlmRequests.length < 1 || reusedOcrRecognitionRequests.length < 1) {
    throw new Error(`Expected translation plus streaming assistant provider requests, got ${JSON.stringify(providerRequests)}.`);
  }

  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Settings', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'Image settings' }).click();
  await page.getByText('VLM image translation', { exact: true }).waitFor({ state: 'visible' });
  const narrowLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  if (narrowLayout.documentWidth > narrowLayout.viewportWidth) {
    throw new Error(`Expo mobile Settings overflows at 320x720: ${JSON.stringify(narrowLayout)}.`);
  }
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Custom OCR returns text; never require Qwen geometry or reuse its credentials.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Image settings' }).click();
  await page.getByRole('button', { name: 'Custom vision', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Custom OCR endpoint', exact: true }).first().fill(mockProviderEndpoint);
  await page.getByRole('textbox', { name: 'OCR model', exact: true }).first().fill('custom-vision');
  await page.getByLabel('OCR API key', { exact: true }).first().fill('custom-key');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  const customChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Album' }).click();
  await (await customChooser).setFiles(smokeImagePath);
  await page.getByText(mockOCRTranslation).first().waitFor({ state: 'visible' });
  if (!providerRequests.some((request) => request.model === 'custom-vision')) throw new Error('Custom OCR did not use the selected model.');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();

  const screenshots = path.join(rootDir, 'output/playwright');
  const reviewErrorStart = runtimeErrors.length;
  await reviewMobileInteractions(page, { endpoint: mockProviderEndpoint, imagePath: smokeImagePath });
  // Chromium logs our deliberate HTTP 503 recovery fixture as a resource error.
  // Consume only that one expected error; preserve every other runtime error.
  const expectedFailure = runtimeErrors.findIndex((message, index) => index >= reviewErrorStart && message === 'console error: Failed to load resource: the server responded with a status of 503 (Service Unavailable)');
  if (expectedFailure >= 0) runtimeErrors.splice(expectedFailure, 1);
  await mkdir(screenshots, { recursive: true });
  // Jina needs only a key; use the official route with a synthetic response.
  let jinaRequests = 0;
  await page.route('https://api.jina.ai/v1/chat/completions', (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    if (body.model !== 'jina-ocr-v1' || !body.messages[0].content[1].image_url.url.startsWith('data:image/')) throw new Error('Invalid Jina image request.');
    if (request.headers().authorization !== 'Bearer jina-smoke-key') throw new Error('Jina used the wrong credential.');
    jinaRequests++;
    return route.fulfill({ headers: corsHeaders, json: { choices: [{ message: { content: mockOCRText } }] } });
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Image settings' }).click();
  await page.getByRole('button', { name: 'General AI', exact: true }).nth(1).click();
  await page.getByText('OCR settings used by VLM', { exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Jina OCR', exact: true }).click();
  await page.getByLabel('Jina API key', { exact: true }).fill('jina-smoke-key');
  if (await page.getByRole('textbox', { name: 'OCR model', exact: true }).count()) throw new Error('Jina should not expose a model field.');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Jina settings overflow.');
    await page.screenshot({ path: path.join(screenshots, `expo-jina-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Image settings' }).click();
  if (await page.getByLabel('Jina API key', { exact: true }).inputValue() !== 'jina-smoke-key') throw new Error('Jina settings did not persist.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const jinaChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Album' }).click();
  await (await jinaChooser).setFiles(smokeImagePath);
  await page.getByRole('button', { name: 'OCR text image mode', exact: true }).click();
  await page.getByText(mockOCRTranslation).first().waitFor({ state: 'visible' });
  if (!jinaRequests) throw new Error('Jina OCR did not run.');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const actions = await Promise.all(['Speak', 'Camera', 'Album', 'Translate'].map((name) => page.getByRole('button', { name, exact: true }).boundingBox()));
      for (let index = 0; index < actions.length; index++) {
        const box = actions[index];
        if (!box || box.x < 16 || box.x + box.width > width - 16 || box.height < 40) throw new Error('Mobile input action is clipped or too small.');
        if (index && box.x + 0.5 < actions[index - 1].x + actions[index - 1].width) throw new Error(`Mobile input actions overlap at ${width}px (${colorScheme}): ${JSON.stringify(actions)}`);
      }
      await page.screenshot({ path: path.join(screenshots, `expo-${width}-${colorScheme}.png`), fullPage: true });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile workspace overflow.');
      for (const mode of ['Explain', 'Q&A']) {
        await page.getByRole('tab', { name: `${mode} text mode` }).click();
        await page.getByText('Target Language', { exact: true }).waitFor({ state: 'visible' });
        // Let the React Native spring indicator settle before capturing the mode.
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(screenshots, `expo-${width}-${colorScheme}-${mode === 'Explain' ? 'explain' : 'qa'}.png`), fullPage: true });
      }
      await page.getByRole('tab', { name: 'Translate text mode' }).click();
      await page.waitForTimeout(500);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByLabel('Source text').fill('駅はどこですか？');
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
  await page.getByText(mockTranslation, { exact: true }).waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(screenshots, 'expo-390-result-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'AI settings' }).click();
  await page.getByRole('button', { name: 'Choose AI provider', exact: true }).waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(screenshots, 'expo-settings-320-light.png'), fullPage: true });
  await page.route('https://openrouter.ai/api/v1/models', (route) => {
    if (route.request().headers().authorization !== 'Bearer mock-direct-key') throw new Error('Direct API key was not sent.');
    return route.fulfill({ json: { data: [
    { id: 'vendor/vision', name: 'Travel Vision', architecture: { input_modalities: ['text', 'image'] } },
    { id: 'vendor/text', name: 'Travel Text', architecture: { input_modalities: ['text'] } },
  ] } }); });
  await page.getByRole('button', { name: 'Choose AI provider', exact: true }).click();
  await page.getByRole('button', { name: 'OpenRouter', exact: true }).click();
  await page.getByPlaceholder('sk-...').fill('mock-direct-key');
  if (await page.getByText('OpenAI Chat', { exact: true }).count() || await page.getByRole('button', { name: 'Connect with OpenRouter' }).count()) throw new Error('Legacy connection controls remain.');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      await page.getByRole('button', { name: 'Choose AI provider', exact: true }).scrollIntoViewIfNeeded();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Connection form overflow.');
      await page.screenshot({ path: path.join(screenshots, `expo-connection-form-${width}-${colorScheme}.png`), fullPage: true });
      const tabBar = page.getByRole('tablist', { name: 'Settings sections' });
      const navY = (await tabBar.boundingBox()).y;
      const saveY = (await page.getByRole('button', { name: 'Save settings' }).boundingBox()).y;
      for (const label of ['Translate', 'Image', 'Data']) {
        const tab = page.getByRole('tab', { name: `${label} settings` });
        await tab.click();
        await page.getByRole('tab', { name: `${label} settings`, selected: true }).waitFor({ state: 'visible' });
        await page.waitForFunction((name) => { const tab = document.querySelector(`[role="tab"][aria-label="${name}"]`); const bounds = tab?.getBoundingClientRect(); return bounds && bounds.x >= 0 && bounds.right <= innerWidth + 1; }, `${label} settings`);
        const bounds = await tab.boundingBox();
        if (bounds.x < 0 || bounds.x + bounds.width > width + 1) throw new Error(`${label} tab was not revealed.`);
        if (label === 'Image' || label === 'Data') {
          const toggleLabel = label === 'Image' ? 'Show thinking' : 'Sync settings with iCloud';
          const control = page.getByRole('switch', { name: toggleLabel });
          await control.scrollIntoViewIfNeeded();
          const geometry = await control.evaluate((element) => {
            const widget = element.parentElement.getBoundingClientRect();
            const row = element.parentElement.parentElement.getBoundingClientRect();
            return { centerOffset: Math.abs(widget.y + widget.height / 2 - row.y - row.height / 2), inside: widget.x >= row.x && widget.right <= row.right };
          });
          if (geometry.centerOffset > 1 || !geometry.inside) throw new Error(`${toggleLabel} is not centered inside its settings row.`);
          if (label === 'Image') {
            const checked = await control.isChecked();
            await control.click();
            if (await control.isChecked() === checked) throw new Error('Show thinking switch did not change.');
            await control.click();
          }
        }
        await page.screenshot({ path: path.join(screenshots, `expo-settings-${label.toLowerCase()}-${width}-${colorScheme}.png`), fullPage: true });
      }
      await page.getByLabel('Encrypted config payload').scrollIntoViewIfNeeded();
      if (Math.abs((await tabBar.boundingBox()).y - navY) > 1) throw new Error('Settings navigation scrolled with form content.');
      if (Math.abs((await page.getByRole('button', { name: 'Save settings' }).boundingBox()).y - saveY) > 1) throw new Error('Save button scrolled with form content.');
      await page.getByRole('tab', { name: 'AI settings' }).click();
      if (await page.getByPlaceholder('sk-...').inputValue() !== 'mock-direct-key') throw new Error('Category switching lost draft credentials.');
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Load available models' }).click();
  await page.getByRole('checkbox', { name: 'Image-capable models' }).click();
  await page.getByRole('button', { name: /Travel Vision/ }).click();
  if (await page.getByPlaceholder('Model ID', { exact: true }).inputValue() !== 'vendor/vision') throw new Error('Model discovery selection was lost.');
  if (await page.getByRole('button', { name: /Travel Text/ }).count()) throw new Error('Vision filter failed.');
  await page.screenshot({ path: path.join(screenshots, 'expo-connection-320.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  let chatCalls = 0;
  let responsesCalls = 0;
  expectedHTTPFailures.add('https://openrouter.ai/api/v1/chat/completions');
  await page.route('https://openrouter.ai/api/v1/chat/completions', (route) => {
    chatCalls++;
    return route.fulfill({ status: 404, json: { error: { message: 'Unknown endpoint' } } });
  });
  await page.route('https://openrouter.ai/api/v1/responses', (route) => {
    responsesCalls++;
    if (route.request().headers().authorization !== 'Bearer mock-direct-key' || !route.request().postDataJSON().input) throw new Error('Invalid Responses fallback.');
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"response.output_text.delta","delta":"Automatic connection works."}\n\ndata: {"type":"response.completed"}\n\n' });
  });
  await page.getByRole('tab', { name: 'Explain text mode' }).click();
  await page.getByLabel('Source text').fill('駅');
  await page.getByRole('button', { name: 'Explain', exact: true }).click();
  await page.getByText('Automatic connection works.', { exact: true }).waitFor({ state: 'visible' });
  if (chatCalls !== 1 || responsesCalls !== 1) throw new Error('Automatic protocol negotiation did not run exactly once.');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'AI settings' }).click();
  if (await page.getByPlaceholder('sk-...').inputValue() !== 'mock-direct-key') throw new Error('API key was not persisted.');
  await page.getByRole('button', { name: 'Choose AI provider', exact: true }).click();
  await page.screenshot({ path: path.join(screenshots, 'expo-providers-320-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Local server', exact: true }).click();
  await page.getByRole('button', { name: 'Local server', exact: true }).waitFor({ state: 'detached' });
  if (await page.getByRole('button', { name: 'Choose AI provider', exact: true }).getAttribute('aria-expanded') !== 'false') throw new Error('Provider picker did not close after selection.');
  if (await page.getByPlaceholder('sk-...').inputValue()) throw new Error('Provider switch retained credentials.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await reviewTranslationModels(page, rootDir, expectedHTTPFailures);

  if (runtimeErrors.length) {
    throw new Error(`Expo web smoke found runtime errors:\n${runtimeErrors.join('\n')}`);
  }

  console.log('Expo web smoke passed.');
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await mkdir(path.join(rootDir, 'output/mobile-review'), { recursive: true });
    await page.screenshot({ path: path.join(rootDir, 'output/mobile-review/smoke-failure.png') }).catch(() => {});
  }
  throw error;
} finally {
  if (browser) {
    await browser.close();
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(outDir, { recursive: true, force: true });
}
