import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { DEFAULT_SETTINGS, normalizeSettings, type AISettings } from './settings';
import { transcribeAudioFile } from './speech';

const originalFetch = globalThis.fetch;

type SettingsPatch = Omit<Partial<AISettings>, 'generalAI' | 'speechRecognition'> & {
  generalAI?: Partial<AISettings['generalAI']>;
  speechRecognition?: Partial<AISettings['speechRecognition']>;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const makeAudioBlob = () => new Blob(['audio-bytes'], { type: 'audio/webm' });

const makeSettings = (patch: SettingsPatch = {}): AISettings => normalizeSettings({
  ...DEFAULT_SETTINGS,
  provider: 'custom',
  ...patch,
  generalAI: {
    ...DEFAULT_SETTINGS.generalAI,
    ...(patch.generalAI || {}),
  },
  speechRecognition: {
    ...DEFAULT_SETTINGS.speechRecognition,
    provider: 'siliconflow',
    ...(patch.speechRecognition || {}),
  },
});

test('transcribeAudioFile rejects local ASR before making a network request', async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return Response.json({ text: 'should not happen' });
  }) as typeof fetch;

  await assert.rejects(
    transcribeAudioFile(makeAudioBlob(), makeSettings({
      speechRecognition: {
        provider: 'local',
      },
      endpoint: 'https://translation.example.test/v1',
      apiKey: 'translation-key',
    })),
    /Local ASR must be handled by the platform native layer/,
  );

  assert.equal(fetchCalls, 0);
});

test('transcribeAudioFile validates missing cloud credentials before fetch', async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return Response.json({ text: 'should not happen' });
  }) as typeof fetch;

  await assert.rejects(
    transcribeAudioFile(makeAudioBlob(), makeSettings({
      endpoint: 'https://translation.example.test/v1',
      generalAI: {
        endpoint: 'https://general.example.test/v1',
      },
    })),
    /Speech API key is not configured/,
  );

  await assert.rejects(
    transcribeAudioFile(makeAudioBlob(), makeSettings({
      apiKey: 'translation-key',
      generalAI: {
        apiKey: 'general-key',
      },
    })),
    /Speech API endpoint is not configured/,
  );

  assert.equal(fetchCalls, 0);
});

test('transcribeAudioFile posts OpenAI-compatible transcription form data', async () => {
  let requestURL = '';
  let requestAuthorization = '';
  let requestBody = new FormData();
  let requestSignal: AbortSignal | undefined;
  const abortController = new AbortController();

  globalThis.fetch = (async (input, init) => {
    requestURL = String(input);
    requestAuthorization = new Headers(init?.headers).get('authorization') || '';
    requestBody = init?.body as FormData;
    requestSignal = init?.signal || undefined;
    return Response.json({ text: 'Where is the station?' });
  }) as typeof fetch;

  const result = await transcribeAudioFile(
    makeAudioBlob(),
    makeSettings({
      endpoint: 'https://translation.example.test/v1/',
      apiKey: 'translation-key',
      generalAI: {
        endpoint: 'https://general.example.test/v1',
        apiKey: 'general-key',
      },
      speechRecognition: {
        provider: 'siliconflow',
        endpoint: 'https://speech.example.test/v1/',
        apiKey: 'speech-key',
        modelName: 'speech-model',
      },
    }),
    abortController.signal,
  );

  assert.equal(result, 'Where is the station?');
  assert.equal(requestURL, 'https://speech.example.test/v1/audio/transcriptions');
  assert.equal(requestAuthorization, 'Bearer speech-key');
  assert.equal(requestSignal, abortController.signal);
  assert.equal(requestBody.get('model'), 'speech-model');
  assert.ok(requestBody.get('file') instanceof Blob);
});

test('transcribeAudioFile falls back to translation credentials before general AI credentials', async () => {
  const seenRequests: Array<{ url: string; authorization: string }> = [];

  globalThis.fetch = (async (input, init) => {
    seenRequests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('authorization') || '',
    });
    return Response.json({ text: 'ok' });
  }) as typeof fetch;

  await transcribeAudioFile(makeAudioBlob(), makeSettings({
    endpoint: 'https://translation.example.test/v1',
    apiKey: 'translation-key',
    generalAI: {
      endpoint: 'https://general.example.test/v1',
      apiKey: 'general-key',
    },
  }));

  await transcribeAudioFile(makeAudioBlob(), makeSettings({
    generalAI: {
      endpoint: 'https://general.example.test/v1/',
      apiKey: 'general-key',
    },
  }));

  assert.deepEqual(seenRequests, [
    {
      url: 'https://translation.example.test/v1/audio/transcriptions',
      authorization: 'Bearer translation-key',
    },
    {
      url: 'https://general.example.test/v1/audio/transcriptions',
      authorization: 'Bearer general-key',
    },
  ]);
});

test('transcribeAudioFile surfaces provider error text', async () => {
  globalThis.fetch = (async () => new Response('provider exploded', { status: 400 })) as typeof fetch;

  await assert.rejects(
    transcribeAudioFile(makeAudioBlob(), makeSettings({
      endpoint: 'https://translation.example.test/v1',
      apiKey: 'translation-key',
    })),
    /Audio transcription failed: provider exploded/,
  );
});
