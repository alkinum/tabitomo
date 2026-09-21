import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  normalizeSettings, translateText, getTranslationModelFamily,
  getTranslationConnection, updateTranslationConnection, hasTranslationOverride,
  applyTranslationProviderPreset, clearTranslationOverride, TRANSLATION_PROVIDER_PRESETS,
  exportConfigPayload, importConfigPayload,
} from './index';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const mt2 = normalizeSettings({
  provider: 'custom', endpoint: 'https://openrouter.ai/api/v1', apiKey: 'translation-test-key', modelName: 'tencent/hy-mt2-7b',
  generalAI: { endpoint: 'https://general.example/v1', apiKey: 'general-test-key', modelName: 'general-model', apiFormat: 'openai-chat' },
});

test('MT2 variants are distinct from legacy translation models and unrelated IDs', () => {
  for (const id of ['tencent/hy-mt2-1.8b', 'tencent/hy-mt2-7b', 'tencent/hy-mt2-30b-a3b', 'Tencent/Hunyuan-MT2-7B', 'Hy-MT2-7B:Q4_K_M']) {
    assert.equal(getTranslationModelFamily(id), 'hy-mt2', id);
    assert.equal(normalizeSettings({ endpoint: mt2.endpoint, apiKey: mt2.apiKey, modelName: id }).translation.outputMode, 'plain');
  }
  for (const id of ['tencent/Hunyuan-MT-7B', 'tencent/HY-MT1.5-1.8B', 'HY-MT1.5-7B-FP8']) {
    assert.equal(getTranslationModelFamily(id), 'general', id);
  }
  for (const id of ['qwen-mt-plus', 'vendor/custom-translator', 'hy-mt3-7b', 'hy-mt-3', 'hunyuan-mt20', 'not-hy-mt2']) {
    assert.equal(getTranslationModelFamily(id), 'general', id);
  }
});

test('MT2 plain requests use the selected ID, isolated credentials and single user instruction', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer translation-test-key');
    assert.equal(init?.signal, controller.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'tencent/hy-mt2-7b');
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
    assert.match(body.messages[0].content, /^Translate the following text into English\./);
    assert.match(body.messages[0].content, /駅はどこですか/);
    assert.doesNotMatch(body.messages[0].content, /valid JSON/);
    return Response.json({ choices: [{ message: { content: 'Where is the station? (north entrance)' } }] });
  };
  // Parenthetical content must remain part of the translation.
  assert.equal(await translateText('駅はどこですか', 'ja', 'en', mt2, controller.signal), 'Where is the station? (north entrance)');
});

test('structured output and parenthetical text are not overridden by an old model ID', async () => {
  globalThis.fetch = async (_, init) => {
    const body = JSON.parse(String(init?.body));
    assert.match(body.messages[0].content, /valid JSON/);
    return Response.json({ choices: [{ message: { content: '{"translation":"Hello (friend)"}' } }] });
  };
  const structured = normalizeSettings({ ...mt2, translation: { outputMode: 'structured' } });
  assert.equal(await translateText('你好', 'zh', 'en', structured), 'Hello (friend)');
  assert.equal(await translateText('你好', 'zh', 'en', { ...structured, modelName: 'tencent/Hunyuan-MT-7B' }), 'Hello (friend)');
});

test('custom translation models work without a pinned model and General AI reuse restores its own credentials', async () => {
  let calls = 0;
  const custom = updateTranslationConnection(mt2, { ...getTranslationConnection(mt2), modelName: 'vendor/new-translator' });
  assert.equal(custom.translation.outputMode, 'plain');
  globalThis.fetch = async (input, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    const general = body.model === 'general-model';
    assert.equal(String(input), general ? 'https://general.example/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(new Headers(init?.headers).get('authorization'), general ? 'Bearer general-test-key' : 'Bearer translation-test-key');
    return Response.json({ choices: [{ message: { content: general ? '{"translation":"Hello"}' : 'Hello' } }] });
  };
  assert.equal(await translateText('你好', 'zh', 'en', custom), 'Hello');
  const reused = clearTranslationOverride(custom);
  assert.equal(hasTranslationOverride(reused), false);
  assert.equal(await translateText('你好', 'zh', 'en', reused), 'Hello');
  assert.equal(await translateText('  ', 'zh', 'en', custom), '  ');
  assert.equal(await translateText('你好', 'zh', 'zh', custom), '你好');
  assert.equal(calls, 2);
});

test('dedicated provider presets have no pinned models and never carry a key to a different provider', () => {
  for (const preset of TRANSLATION_PROVIDER_PRESETS) assert.equal(preset.defaultModel, '', preset.id);
  const switched = applyTranslationProviderPreset(mt2, 'openai');
  assert.equal(switched.apiKey, '');
  assert.equal(switched.modelName, '');
  assert.equal(switched.translation.outputMode, 'plain');
  assert.deepEqual(switched.generalAI, mt2.generalAI);
});

test('MT2 and custom model IDs and explicit output choices survive encrypted config transfer', async () => {
  for (const modelName of ['tencent/hy-mt2-7b', 'vendor/new-translator']) {
    const settings = normalizeSettings({ ...mt2, modelName, translation: { outputMode: 'structured' } });
    const restored = await importConfigPayload(await exportConfigPayload(settings, 'test-password'), 'test-password');
    assert.equal(restored.modelName, modelName);
    assert.equal(restored.translation.outputMode, 'structured');
    assert.equal(restored.apiKey, 'translation-test-key');
    assert.deepEqual(restored.generalAI, settings.generalAI);
  }
});
