import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  DASHSCOPE_OCR_ENDPOINT,
  normalizeDashScopeOCREndpoint,
  normalizeSettings,
  performOCR,
} from './index';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('normalizes legacy compatible DashScope endpoints to the native OCR task endpoint', () => {
  assert.equal(
    normalizeDashScopeOCREndpoint('https://dashscope.aliyuncs.com/compatible-mode/v1/'),
    DASHSCOPE_OCR_ENDPOINT,
  );
  assert.equal(
    normalizeDashScopeOCREndpoint('https://workspace.ap-southeast-1.maas.aliyuncs.com'),
    'https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  );
});

test('performs Qwen advanced recognition and parses absolute overlay coordinates', async () => {
  let requestUrl = '';
  let requestBody: Record<string, unknown> = {};
  let authorization = '';

  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get('authorization') || '';
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      output: {
        choices: [
          {
            message: {
              content: [
                {
                  ocr_result: {
                    words_info: [
                      {
                        text: 'カフェ',
                        location: [10, 20, 110, 20, 110, 60, 10, 60],
                        rotate_rect: [60, 40, 100, 40, 0],
                      },
                      {
                        text: 'invalid geometry is omitted',
                        location: [1, 2],
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const settings = normalizeSettings({
    imageOCR: {
      provider: 'qwen',
      useGeneralAI: false,
      apiKey: 'dashscope-test-key',
      endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      modelName: 'qwen3.5-ocr',
    },
  });
  const lines = await performOCR('data:image/png;base64,AAAA', settings);

  assert.equal(requestUrl, 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
  assert.equal(authorization, 'Bearer dashscope-test-key');
  assert.equal(requestBody.model, 'qwen3.5-ocr');
  assert.deepEqual((requestBody.parameters as { ocr_options: unknown }).ocr_options, { task: 'advanced_recognition' });
  assert.equal(JSON.stringify(requestBody).includes('data:image/png;base64,AAAA'), true);
  assert.deepEqual(lines[0], {
    text: 'カフェ',
    location: [10, 20, 110, 20, 110, 60, 10, 60],
    rotate_rect: [60, 40, 100, 40, 0],
  });
  assert.deepEqual(lines[1], { text: 'invalid geometry is omitted' });
});

test('rejects unadapted General AI and custom coordinate OCR providers before network', async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}');
  };

  await assert.rejects(
    () => performOCR('data:image/png;base64,AAAA', normalizeSettings({
      imageOCR: {
        provider: 'custom',
        useGeneralAI: false,
        apiKey: 'legacy-key',
        endpoint: 'https://ocr.example.test/v1',
      },
    })),
    /supports only Alibaba Cloud Model Studio Qwen-OCR/,
  );
  assert.equal(called, false);
});

test('surfaces DashScope API errors without returning fake OCR output', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 'InvalidApiKey',
    message: 'Invalid API-key provided.',
  }), { status: 401, headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    () => performOCR('data:image/png;base64,AAAA', normalizeSettings({
      imageOCR: {
        provider: 'qwen',
        useGeneralAI: false,
        apiKey: 'bad-key',
        endpoint: DASHSCOPE_OCR_ENDPOINT,
      },
    })),
    /Invalid API-key provided/,
  );
});
