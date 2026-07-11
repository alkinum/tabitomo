import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DASHSCOPE_ENDPOINT,
  DEFAULT_SETTINGS,
  exportConfigPayload,
  importConfigPayload,
  normalizeEncryptedConfigPayload,
  normalizeSettings,
  wrapConfigForExport,
  type AISettings,
} from './index';

test('normalizeSettings migrates legacy speech provider and invalid enum values', () => {
  const normalized = normalizeSettings({
    generalAI: {
      apiKey: 'general-key',
      endpoint: 'https://example.com/v1',
      modelName: 'gpt-4o-mini',
      apiFormat: 'bad-format',
    },
    speechRecognition: {
      provider: 'local-whisper',
      localEngine: 'bad-engine',
      vadMode: 'bad-vad',
      senseVoiceLanguage: 'bad-language',
      whisperTask: 'bad-task',
    },
    imageOCR: {
      provider: 'bad-provider',
      apiKey: 'ocr-key',
      endpoint: 'https://ocr.example.com/v1',
    },
  } as unknown as Partial<AISettings>);

  assert.equal(normalized.generalAI.apiFormat, 'openai-chat');
  assert.equal(normalized.speechRecognition.provider, 'local');
  assert.equal(normalized.speechRecognition.localEngine, DEFAULT_SETTINGS.speechRecognition.localEngine);
  assert.equal(normalized.speechRecognition.vadMode, DEFAULT_SETTINGS.speechRecognition.vadMode);
  assert.equal(normalized.speechRecognition.senseVoiceLanguage, DEFAULT_SETTINGS.speechRecognition.senseVoiceLanguage);
  assert.equal(normalized.speechRecognition.whisperTask, DEFAULT_SETTINGS.speechRecognition.whisperTask);
  assert.equal(normalized.imageOCR.provider, DEFAULT_SETTINGS.imageOCR.provider);
  assert.equal(normalized.imageOCR.endpoint, 'https://ocr.example.com/v1');
});

test('normalizeSettings selects plain output for Hunyuan-MT translation providers', () => {
  const translationOverride = normalizeSettings({
    provider: 'custom',
    endpoint: 'https://api.siliconflow.cn/v1',
    modelName: 'tencent/Hunyuan-MT-7B',
    apiKey: 'translation-key',
  });

  const generalAI = normalizeSettings({
    generalAI: {
      apiKey: 'general-key',
      endpoint: 'https://api.siliconflow.cn/v1',
      modelName: 'Tencent/Hunyuan-MT-7B',
      apiFormat: 'openai-chat',
    },
  });

  const explicitStructured = normalizeSettings({
    provider: 'custom',
    endpoint: 'https://api.siliconflow.cn/v1',
    modelName: 'tencent/Hunyuan-MT-7B',
    apiKey: 'translation-key',
    translation: {
      outputMode: 'structured',
    },
  });

  assert.equal(translationOverride.translation.outputMode, 'plain');
  assert.equal(generalAI.translation.outputMode, 'plain');
  assert.equal(explicitStructured.translation.outputMode, 'structured');
});

test('wrapConfigForExport emits normalized versioned payloads', () => {
  const wrapped = wrapConfigForExport(normalizeSettings({
    speechRecognition: {
      provider: 'local-whisper',
    },
    imageOCR: {
      provider: 'bad-provider',
      apiKey: '',
      endpoint: DASHSCOPE_ENDPOINT,
    },
  } as unknown as Partial<AISettings>));

  assert.equal(wrapped.version, 1);
  assert.equal(wrapped.config._version, 1);
  assert.equal(wrapped.config.speechRecognition.provider, 'local');
  assert.equal(wrapped.config.imageOCR.provider, 'local-ppocr');
  assert.match(wrapped.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('encrypted config payload round trips with normalization', async () => {
  const source = normalizeSettings({
    generalAI: {
      apiKey: 'general-key',
      endpoint: 'https://example.com/v1',
      modelName: 'gpt-4o-mini',
      apiFormat: 'openai-responses',
    },
    speechRecognition: {
      provider: 'local-whisper',
      localModelPath: 'https://example.com/models/sherpa',
    },
    imageOCR: {
      provider: 'bad-provider',
      apiKey: 'ocr-key',
      endpoint: 'https://ocr.example.com/v1',
    },
    vlm: {
      useGeneralAI: false,
      useCustom: true,
      apiKey: 'vlm-key',
      endpoint: 'https://vlm.example.com/v1',
      modelName: 'gpt-4o',
      enableThinking: true,
    },
  } as unknown as Partial<AISettings>);

  const password = 'round-trip-password';
  const payload = await exportConfigPayload(source, password);
  const imported = await importConfigPayload(`tabitomo-config:${payload}`, password);

  assert.equal(normalizeEncryptedConfigPayload(` tabitomo-config:${payload} `), payload);
  assert.equal(imported.generalAI.apiFormat, 'openai-responses');
  assert.equal(imported.generalAI.apiKey, 'general-key');
  assert.equal(imported.speechRecognition.provider, 'local');
  assert.equal(imported.speechRecognition.localModelPath, 'https://example.com/models/sherpa');
  assert.equal(imported.imageOCR.provider, 'local-ppocr');
  assert.equal(imported.imageOCR.endpoint, 'https://ocr.example.com/v1');
  assert.equal(imported.vlm.useCustom, true);
  assert.equal(imported.vlm.enableThinking, true);
});

test('encrypted config import rejects bad passwords', async () => {
  const payload = await exportConfigPayload(normalizeSettings(DEFAULT_SETTINGS), 'correct-password');

  await assert.rejects(
    () => importConfigPayload(payload, 'wrong-password'),
    /Invalid password or corrupted config/
  );
});
