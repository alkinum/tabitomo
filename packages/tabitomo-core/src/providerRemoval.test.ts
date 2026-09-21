import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SETTINGS, normalizeSettings, normalizeSpeechRecognitionSettings,
  GENERAL_AI_PRESETS, TRANSLATION_PROVIDER_PRESETS, SPEECH_PROVIDER_PRESETS,
  exportConfigPayload, importConfigPayload, type AISettings,
} from './index';
import { encryptConfig, decryptConfig } from '../../../src/utils/config/export';
import { migrateConfig } from '../../../src/utils/config/migration';
import { aiConfigSchemaV1, validateSchema } from '../../../src/utils/config/configSchema';

test('removed services are absent from every provider catalog', () => {
  const catalog = JSON.stringify([GENERAL_AI_PRESETS, TRANSLATION_PROVIDER_PRESETS, SPEECH_PROVIDER_PRESETS]);
  assert.doesNotMatch(catalog, /siliconflow|telespeech|hunyuan-mt-7b/i);
  assert.equal(SPEECH_PROVIDER_PRESETS.find(preset => preset.id === 'openai-transcribe')?.provider, 'openai-compatible');
});

test('old transcription provider IDs migrate once to generic configuration without changing credentials', async () => {
  const speech = { provider: 'siliconflow', endpoint: 'https://speech.example/v1', modelName: 'my-asr', apiKey: 'speech-test-key' };
  const expected = normalizeSpeechRecognitionSettings({ ...speech, provider: 'openai-compatible' });
  const legacy = { ...DEFAULT_SETTINGS, speechRecognition: speech } as unknown as AISettings;
  assert.deepEqual(normalizeSettings(legacy).speechRecognition, expected);
  for (const version of [undefined, 1]) {
    const migrated = migrateConfig({ ...legacy, _version: version });
    assert.deepEqual(migrated.speechRecognition, expected);
    assert.equal(validateSchema(migrated, aiConfigSchemaV1).valid, true);
  }
  // Web's old encryption format preserves the old ID, exercising real legacy import.
  const oldPayload = await encryptConfig(legacy, 'test-password');
  assert.deepEqual((await importConfigPayload(oldPayload, 'test-password')).speechRecognition, expected);
  assert.deepEqual((await decryptConfig(oldPayload, 'test-password')).speechRecognition, expected);
  const newPayload = await exportConfigPayload(normalizeSettings(legacy), 'test-password');
  assert.deepEqual((await decryptConfig(newPayload, 'test-password')).speechRecognition, expected);
});
