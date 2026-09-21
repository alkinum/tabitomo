import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Run against the exported Expo app, with synthetic credentials and provider responses. */
export async function reviewTranslationModels(page, rootDir, expectedHTTPFailures) {
  const model = 'tencent/hy-mt2-7b';
  await page.route('https://openrouter.ai/api/v1/models', route => {
    if (route.request().headers().authorization !== 'Bearer mt2-test-key') throw new Error('Wrong translation catalog credential.');
    return route.fulfill({ json: { data: [{ id: model, name: 'Tencent: Hy-MT2 7B', architecture: { input_modalities: ['text'] } }] } });
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'AI settings' }).click();
  await page.getByRole('button', { name: 'Choose AI provider' }).click();
  if (await page.getByRole('button', { name: /SiliconFlow/ }).count()) throw new Error('Removed provider remains in General AI.');
  await page.getByRole('button', { name: 'Choose AI provider' }).click();
  await page.getByRole('tab', { name: 'Translate settings' }).click();
  await page.getByRole('button', { name: 'Separate model', exact: true }).click();
  await page.getByRole('button', { name: 'Choose translation provider' }).click();
  if (await page.getByRole('button', { name: /SiliconFlow/ }).count()) throw new Error('Removed translation provider remains.');
  await page.getByRole('button', { name: 'OpenRouter', exact: true }).click();
  await page.getByPlaceholder('Provider API key').fill('mt2-test-key');
  await page.getByRole('button', { name: 'Load available models' }).click();
  await page.getByLabel('Search models').fill('hy-mt2');
  if (await page.getByRole('checkbox', { name: 'Image-capable models' }).count()) throw new Error('Vision filtering leaked into translation.');
  await page.getByRole('button', { name: /Tencent: Hy-MT2/ }).click();
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  if (await page.getByRole('button', { name: 'Structured', exact: true }).isDisabled()) throw new Error('MT2 incorrectly inherits legacy restrictions.');
  await page.getByRole('button', { name: 'Structured', exact: true }).click();
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  await page.getByRole('button', { name: 'Fewer options', exact: true }).click();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  let calls = 0;
  await page.route('https://openrouter.ai/api/v1/chat/completions', route => {
    calls++;
    const body = route.request().postDataJSON();
    if (body.model !== model || route.request().headers().authorization !== 'Bearer mt2-test-key') throw new Error('Wrong dedicated translation connection.');
    if (body.messages.length !== 1 || !body.messages[0].content.startsWith('Translate the following text into ')) throw new Error('Incorrect MT2 instruction.');
    return route.fulfill({ json: { choices: [{ message: { content: 'MT2 translation (preserved)' } }] } });
  });
  await page.getByRole('tab', { name: 'Translate text mode' }).click();
  await page.getByLabel('Source text').fill('你好');
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
  await page.getByText('MT2 translation (preserved)', { exact: true }).waitFor({ state: 'visible' });
  if (!calls) throw new Error('MT2 was not called.');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'AI settings' }).click();
  if (await page.getByPlaceholder('sk-...').inputValue() !== 'mock-direct-key') throw new Error('Translation changed the General AI key.');
  await page.getByRole('tab', { name: 'Translate settings' }).click();
  if (await page.getByPlaceholder('Model ID', { exact: true }).inputValue() !== model) throw new Error('MT2 selection did not persist.');
  const out = path.join(rootDir, 'output/translation-model-review');
  await mkdir(out, { recursive: true });
  for (const width of [320, 390]) for (const colorScheme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    await page.emulateMedia({ colorScheme });
    await page.getByRole('button', { name: 'Choose translation provider' }).scrollIntoViewIfNeeded();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Translation form overflow.');
    await page.screenshot({ path: path.join(out, `expo-${width}-${colorScheme}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Choose translation provider' }).click();
  await page.getByRole('button', { name: 'OpenAI', exact: true }).click();
  if (await page.getByPlaceholder('Provider API key').inputValue() || await page.getByPlaceholder('Model ID', { exact: true }).inputValue()) throw new Error('Provider change retained credentials/model.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  // The same compact form must work during first-run setup with an unlisted model.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Manual setup', exact: true }).click();
  await page.getByRole('button', { name: 'Translation only', exact: true }).click();
  await page.getByPlaceholder('https://api.example.com/v1', { exact: true }).fill('https://custom.example/v1');
  await page.getByPlaceholder('Provider API key').fill('custom-test-key');
  expectedHTTPFailures.add('https://custom.example/v1/models');
  await page.route('https://custom.example/v1/models', route => route.fulfill({ status: 404, json: {} }));
  await page.getByRole('button', { name: 'Load available models' }).click();
  await page.getByText('Could not load models (404). You can enter a model ID manually.').waitFor({ state: 'visible' });
  await page.getByPlaceholder('Model ID', { exact: true }).fill('vendor/custom-translator');
  await page.getByRole('button', { name: 'Start translating', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Translate settings' }).click();
  if (await page.getByPlaceholder('Model ID', { exact: true }).inputValue() !== 'vendor/custom-translator') throw new Error('Custom translation setup did not persist.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
}
