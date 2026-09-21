import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  DASHSCOPE_OCR_ENDPOINT,
  normalizeDashScopeOCREndpoint,
  normalizeSettings,
  performOCR,
  JINA_OCR_ENDPOINT,
  JINA_OCR_MODEL,
  getVLMModelConfig,
} from './index';

const originalFetch = globalThis.fetch;
const jinaSettings = () => normalizeSettings({ imageOCR: { provider: 'jina', apiKey: ' jina-test-key ', endpoint: '' } });

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

test('supports custom OpenAI-compatible OCR providers without coordinate overlays', async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Cafe menu' } }] }), { status: 200 });
  };

  const lines = await performOCR('data:image/png;base64,AAAA', normalizeSettings({
      imageOCR: {
        provider: 'custom',
        useGeneralAI: false,
        apiKey: 'legacy-key',
        endpoint: 'https://ocr.example.test/v1',
        modelName: 'vision-model',
      },
    }));
  assert.equal(called, true);
  assert.deepEqual(lines, [{ text: 'Cafe menu' }]);
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

test('Jina uploads an image to its fixed hosted model and preserves Markdown without geometry', async () => {
  const markdown = '# メニュー\n\n| 品名 | 価格 |\n| --- | --- |\n| コーヒー | ¥400 |';
  globalThis.fetch = async (url, init) => {
    assert.equal(url, `${JINA_OCR_ENDPOINT}/chat/completions`);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer jina-test-key');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, JINA_OCR_MODEL);
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
    assert.match(body.messages[0].content[0].text, /Markdown/);
    assert.deepEqual(body.messages[0].content[1], { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } });
    return Response.json({ choices: [{ message: { content: ` ${markdown}\n` }, finish_reason: 'stop' }] });
  };
  // Even a stale/imported endpoint cannot redirect a Jina key or select a different model.
  const settings = jinaSettings();
  settings.imageOCR.endpoint = 'https://unrelated.example/v1';
  settings.imageOCR.modelName = 'other-model';
  assert.deepEqual(await performOCR('data:image/png;base64,AAAA', settings), [{ text: markdown }]);
});

test('Jina distinguishes blank images from malformed or truncated responses', async () => {
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '  \n' } }] });
  assert.deepEqual(await performOCR('image', jinaSettings().imageOCR), []);
  for (const payload of [null, {}, { choices: [] }, { choices: [null] }, { choices: [{ message: { content: 123 } }] }]) {
    globalThis.fetch = async () => Response.json(payload);
    await assert.rejects(performOCR('image', jinaSettings()), /Jina OCR returned an invalid response/);
  }
  globalThis.fetch = async () => new Response('<html>error</html>');
  await assert.rejects(performOCR('image', jinaSettings()), /invalid response/);
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] });
  await assert.rejects(performOCR('image', jinaSettings()), /cropping/);
});

test('Jina reports authentication, credit, quota and service errors without echoing provider data', async () => {
  for (const [status, pattern] of [[401, /API key/], [403, /account access/], [402, /credits/], [429, /quota/], [504, /timed out/], [500, /HTTP 500/]] as const) {
    globalThis.fetch = async () => new Response('private-image-data jina-test-key', { status });
    await assert.rejects(performOCR('image', jinaSettings()), (error: Error) => {
      assert.match(error.message, pattern);
      assert.doesNotMatch(error.message, /private-image|jina-test-key/);
      return true;
    });
  }
});

test('Jina requires only a key and cannot be reused as a direct translation model', async () => {
  globalThis.fetch = async () => { throw new Error('Unexpected network call'); };
  const settings = jinaSettings();
  settings.imageOCR.apiKey = ' ';
  await assert.rejects(performOCR('image', settings), /Add your Jina API key/);
  settings.vlm = { useGeneralAI: false, useCustom: false, enableThinking: false };
  assert.throws(() => getVLMModelConfig(settings), /Choose General AI or Custom/);
});

test('Jina forwards cancellation before and during a request', async () => {
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    const signal = init!.signal!;
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  for (const alreadyAborted of [true, false]) {
    const controller = new AbortController();
    if (alreadyAborted) controller.abort();
    const result = performOCR('image', jinaSettings(), controller.signal);
    const rejected = assert.rejects(result, { name: 'AbortError' });
    controller.abort();
    await rejected;
  }
});

test('Jina times out stalled requests', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const rejected = assert.rejects(performOCR('image', jinaSettings()), /Jina OCR timed out/);
  t.mock.timers.tick(60_000);
  await rejected;
});

test('Jina preserves cancellation while reading the response body', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (_url, init) => {
    const response = new Response();
    response.json = () => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      controller.abort();
    });
    return response;
  };
  await assert.rejects(performOCR('image', jinaSettings(), controller.signal), { name: 'AbortError' });
});
