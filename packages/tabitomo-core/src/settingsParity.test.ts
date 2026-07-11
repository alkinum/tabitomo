import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  API_FORMAT_OPTIONS,
  DEFAULT_SETTINGS,
  normalizeSettings,
  normalizeSpeechRecognitionSettings,
  type AISettings,
} from './settings';
import {
  API_FORMAT_OPTIONS as WEB_API_FORMAT_OPTIONS,
  DEFAULT_SETTINGS as WEB_DEFAULT_SETTINGS,
  loadSettings as loadWebSettings,
  normalizeSpeechRecognitionSettings as normalizeWebSpeechRecognitionSettings,
} from '../../../src/utils/config/settings';

const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;

function restoreLocalStorage() {
  if (originalLocalStorage === undefined) {
    Reflect.deleteProperty(globalThis, 'localStorage');
    return;
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string) {
        store.delete(key);
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    },
  });
}

afterEach(() => {
  restoreLocalStorage();
});

test('web and shared core default settings stay aligned', () => {
  assert.deepEqual(WEB_DEFAULT_SETTINGS, DEFAULT_SETTINGS);
  assert.deepEqual(WEB_API_FORMAT_OPTIONS, API_FORMAT_OPTIONS);
});

test('web and shared core speech normalization stay aligned', () => {
  const legacySpeechSettings = {
    provider: 'local-whisper',
    localEngine: 'not-a-real-engine',
    vadMode: 'bad-vad',
    senseVoiceLanguage: 'bad-language',
    whisperTask: 'bad-task',
    whisperLanguage: 'ja',
  } as unknown as AISettings['speechRecognition'];

  assert.deepEqual(
    normalizeWebSpeechRecognitionSettings(legacySpeechSettings),
    normalizeSpeechRecognitionSettings(legacySpeechSettings),
  );
});

test('web loadSettings normalization matches shared core normalization', () => {
  installMemoryLocalStorage();

  const legacySettings = {
    generalAI: {
      apiKey: 'general-key',
      endpoint: 'https://example.test/v1',
      modelName: 'bad-format-model',
      apiFormat: 'not-a-real-api-format',
    },
    modelName: 'Tencent/Hunyuan-MT-7B',
    endpoint: 'https://translation.example.test/v1',
    apiKey: 'translation-key',
    speechRecognition: {
      provider: 'local-whisper',
      localEngine: 'bad-engine',
      vadMode: 'bad-vad',
      senseVoiceLanguage: 'bad-language',
      whisperTask: 'bad-task',
    },
    imageOCR: {
      provider: 'bad-provider',
      endpoint: 'https://ocr.example.test/v1',
      apiKey: 'ocr-key',
    },
  } as unknown as Partial<AISettings>;

  localStorage.setItem('tabitomo_ai_settings', JSON.stringify(legacySettings));

  assert.deepEqual(loadWebSettings(), normalizeSettings(legacySettings));
});
