import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchAvailableModels, OPENROUTER_ENDPOINT } from './connections';
import { DEFAULT_SETTINGS, JINA_OCR_ENDPOINT, JINA_OCR_MODEL, hasProviderConnection, isLocalProviderEndpoint, normalizeSettings } from './settings';
import { getOCRMode, selectOCRMode, supportsOCROverlay } from './inputOptions';
import { exportConfigPayload, importConfigPayload } from './configExport';
import { applyGeneralAIPreset, matchGeneralAIPreset } from './providerPresets';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('OpenRouter discovers models directly with a user-supplied API key', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, `${OPENROUTER_ENDPOINT}/models`);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer direct-key');
    assert.equal(init?.method, undefined);
    return Response.json({ data: [{ id: 'vendor/model' }] });
  };
  const models = await fetchAvailableModels({ ...DEFAULT_SETTINGS.generalAI, endpoint: OPENROUTER_ENDPOINT, apiKey: 'direct-key' });
  assert.equal(models[0].id, 'vendor/model');
});

test('legacy protocol preferences and keys survive config import and share one OpenAI preset', async () => {
  for (const apiFormat of ['openai-chat', 'openai-responses', 'anthropic'] as const) {
    const settings = normalizeSettings({ generalAI: { apiFormat, apiKey: 'saved-key', endpoint: 'https://api.openai.com/v1', modelName: 'saved-model' } });
    const restored = await importConfigPayload(await exportConfigPayload(settings, 'test-password'), 'test-password');
    assert.deepEqual(restored.generalAI, settings.generalAI);
    if (apiFormat !== 'anthropic') {
      assert.equal(matchGeneralAIPreset(restored), 'openai');
      assert.equal(applyGeneralAIPreset(restored, apiFormat).generalAI.apiKey, 'saved-key');
    }
  }
});

test('model discovery filters malformed entries, preserves unknown capabilities, and targets the selected service', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://models.example/v1/models');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer my-key');
    return Response.json({ data: [null, { id: 5 }, { id: 'text', name: 6 }, { id: 'vision', name: 'A vision', architecture: { input_modalities: ['text', 'image'] } }, { id: 'unknown', architecture: { input_modalities: 'image' } }] });
  };
  const models = await fetchAvailableModels({ ...DEFAULT_SETTINGS.generalAI, endpoint: 'https://models.example/v1/?ignored=yes', apiKey: 'my-key' });
  assert.equal(models.length, 3);
  assert.equal(models.find((m) => m.id === 'vision')?.vision, true);
  assert.equal(models.find((m) => m.id === 'unknown')?.vision, undefined);
  assert.equal(models.find((m) => m.id === 'text')?.label, 'text');
});

test('local HTTP services accept a blank key only with an explicit model and trusted local address', () => {
  for (const endpoint of ['http://localhost:1234/v1', 'http://192.168.1.5:11434/v1', 'http://[::1]:8080/v1']) {
    assert.equal(hasProviderConnection({ endpoint, modelName: 'local-model' }), true);
  }
  for (const endpoint of ['https://public.example/v1', 'http://localhost.evil.test/v1', 'file:///tmp/model', 'http://user:pass@localhost:1234/v1']) {
    assert.equal(isLocalProviderEndpoint(endpoint), false);
    assert.equal(hasProviderConnection({ endpoint, modelName: 'model' }), false);
  }
  assert.equal(hasProviderConnection({ endpoint: 'http://localhost:1234/v1' }), false);
});

test('custom OCR and blank cloud defaults survive encrypted cross-platform config round trips', async () => {
  assert.equal(DEFAULT_SETTINGS.speechRecognition.modelName, '');
  assert.equal(DEFAULT_SETTINGS.generalAI.modelName, '');
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, imageOCR: { ...selectOCRMode(DEFAULT_SETTINGS, 'custom'), endpoint: 'http://192.168.1.5:1234/v1', modelName: 'my-vision' } });
  const restored = await importConfigPayload(await exportConfigPayload(settings, 'test-password'), 'test-password');
  assert.equal(getOCRMode(restored.imageOCR), 'custom');
  assert.equal(restored.imageOCR.modelName, 'my-vision');
  assert.equal(restored.imageOCR.apiKey, '');
  assert.equal(getOCRMode(selectOCRMode(settings, 'general')), 'general');
});

test('Jina key-only setup survives encrypted export/import and isolates provider credentials', async () => {
  const previous = normalizeSettings({ imageOCR: { provider: 'qwen', endpoint: 'https://old.example/v1', apiKey: 'old-key' } });
  const jina = selectOCRMode(previous, 'jina');
  assert.equal(jina.apiKey, '');
  assert.equal(jina.endpoint, JINA_OCR_ENDPOINT);
  assert.equal(jina.modelName, JINA_OCR_MODEL);
  const settings = normalizeSettings({ imageOCR: { provider: 'jina', apiKey: 'jina-test-key', endpoint: '' } });
  assert.equal(hasProviderConnection(settings.imageOCR), true);
  assert.equal(selectOCRMode(settings, 'jina'), settings.imageOCR);
  for (const mode of ['qwen', 'custom'] as const) {
    assert.equal(selectOCRMode(settings, mode).apiKey, '');
  }
  const restored = await importConfigPayload(await exportConfigPayload(settings, 'test-password'), 'test-password');
  assert.deepEqual(restored.imageOCR, settings.imageOCR);
  assert.equal(getOCRMode(restored.imageOCR), 'jina');
  assert.equal(supportsOCROverlay(restored.imageOCR), false);
  assert.equal(supportsOCROverlay(selectOCRMode(settings, 'qwen')), true);
});
