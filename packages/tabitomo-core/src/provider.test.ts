import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  formatProviderTextStream,
  generateProviderText,
  generateProviderTextStream,
  type ProviderConfig,
  type ProviderMessage,
} from './provider';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const streamFromText = (text: string): ReadableStream<Uint8Array> => new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(text));
    controller.close();
  },
});

const collect = async (chunks: AsyncIterable<string>): Promise<string> => {
  let result = '';
  for await (const chunk of chunks) {
    result += chunk;
  }
  return result;
};

const openAIConfig: ProviderConfig = {
  apiFormat: 'openai-chat',
  apiKey: 'test-key',
  endpoint: 'https://api.example.com/v1',
  modelName: 'gpt-test',
};

const messages: ProviderMessage[] = [
  {
    role: 'user',
    content: 'Translate this.',
  },
];

test('generateProviderTextStream streams OpenAI-compatible chat deltas', async () => {
  let requestURL = '';
  let requestBody: { stream?: boolean } = {};

  globalThis.fetch = (async (input, init) => {
    requestURL = String(input);
    requestBody = JSON.parse(String(init?.body)) as { stream?: boolean };

    return new Response(
      streamFromText([
        'data: {"choices":[{"delta":{"content":"Hello "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"world"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n')),
      {
        headers: {
          'content-type': 'text/event-stream',
        },
      },
    );
  }) as typeof fetch;

  const result = await collect(generateProviderTextStream(openAIConfig, messages));

  assert.equal(requestURL, 'https://api.example.com/v1/chat/completions');
  assert.equal(requestBody.stream, true);
  assert.equal(result, 'Hello world');
});

test('generateProviderTextStream streams Anthropic content deltas', async () => {
  globalThis.fetch = (async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body)) as { stream?: boolean };
    assert.equal(requestBody.stream, true);

    return new Response(
      streamFromText([
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Bonjour "}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Paris"}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
      ].join('\n')),
      {
        headers: {
          'content-type': 'text/event-stream',
        },
      },
    );
  }) as typeof fetch;

  const result = await collect(generateProviderTextStream({
    apiFormat: 'anthropic',
    apiKey: 'test-key',
    endpoint: 'https://anthropic.example.com/v1',
    modelName: 'claude-test',
  }, messages));

  assert.equal(result, 'Bonjour Paris');
});

test('formatProviderTextStream strips hidden thinking and box tokens', async () => {
  const result = await collect(formatProviderTextStream((async function* () {
    yield 'A <thi';
    yield 'nk>secret';
    yield '</think> B <|begin_of_box|>C<|end_of_box|>';
  })(), false));

  assert.equal(result, 'A  B C');
});

test('formatProviderTextStream keeps visible thinking when enabled', async () => {
  const result = await collect(formatProviderTextStream((async function* () {
    yield 'A <think>';
    yield 'visible';
    yield '</think> B';
  })(), true));

  assert.equal(result, 'A Thinking:\nvisible\n\n B');
});

test('chat-only legacy settings negotiate Responses, convert images, and reuse the model hint', async () => {
  const urls: string[] = [];
  const config = { ...openAIConfig, modelName: 'responses-only' };
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-key');
    if (String(url).endsWith('/chat/completions')) return Response.json({ error: { message: 'Unknown endpoint' } }, { status: 404 });
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.deepEqual(body.input, [{ role: 'user', content: [
      { type: 'input_text', text: 'Read this.' },
      { type: 'input_image', image_url: 'data:image/png;base64,abc', detail: 'auto' },
    ] }]);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: 'Station' }] }] });
  };
  const imageMessages: ProviderMessage[] = [{ role: 'user', content: [
    { type: 'text', text: 'Read this.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
  ] }];
  assert.equal(await generateProviderText(config, imageMessages), 'Station');
  assert.equal(await generateProviderText(config, imageMessages), 'Station');
  assert.deepEqual(urls.map((url) => url.split('/').pop()), ['completions', 'responses', 'responses']);
});

test('Responses preference falls back to Chat and streams without changing messages or signal', async () => {
  const controller = new AbortController();
  const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(init?.signal, controller.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.stream, true);
    if (String(url).endsWith('/responses')) return new Response('Method not allowed', { status: 405 });
    assert.deepEqual(body.messages, messages);
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  };
  assert.equal(await collect(generateProviderTextStream({ ...openAIConfig, apiFormat: 'openai-responses', modelName: 'chat-only' }, messages, controller.signal)), 'Hello');
  assert.deepEqual(urls.map((url) => url.split('/').pop()), ['responses', 'completions']);
});

test('explicit model endpoint incompatibility negotiates Responses SSE', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    if (++calls === 1) return Response.json({ error: { message: 'This model is not supported in chat/completions. Use responses.' } }, { status: 400 });
    return new Response('data: {"type":"response.output_text.delta","delta":"Bonjour"}\n\ndata: {"type":"response.completed"}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  };
  assert.equal(await collect(generateProviderTextStream({ ...openAIConfig, modelName: 'explicit-incompatibility' }, messages)), 'Bonjour');
  assert.equal(calls, 2);
});

test('auth, quota, model errors and server failures are never replayed or exposed verbatim', async () => {
  for (const [status, message] of [[401, 'invalid key secret'], [403, 'forbidden'], [402, 'balance'], [429, 'quota'], [500, 'failure'], [400, 'invalid input'], [404, 'model_not_found secret'], [422, 'image unsupported']] as const) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(message, { status }); };
    await assert.rejects(generateProviderText({ ...openAIConfig, modelName: `error-${status}-${message}` }, messages), (error: Error) => error.message.includes(String(status)) && !error.message.includes('secret'));
    assert.equal(calls, 1);
  }
});

test('network failures and cancellation never start another protocol request', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('Network failure'); };
  await assert.rejects(generateProviderText({ ...openAIConfig, modelName: 'network' }, messages), /Network failure/);
  assert.equal(calls, 1);
  const controller = new AbortController();
  globalThis.fetch = async () => { calls++; controller.abort(); return new Response('Not found', { status: 404 }); };
  await assert.rejects(generateProviderText({ ...openAIConfig, modelName: 'cancelled' }, messages, controller.signal));
  assert.equal(calls, 2);
  await assert.rejects(generateProviderText(openAIConfig, messages, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 2);
});

test('stream errors after partial output never replay the generation', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response('data: {"type":"response.output_text.delta","delta":"Partial"}\n\ndata: {"type":"response.failed","error":{"message":"secret"}}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  };
  let output = '';
  await assert.rejects(async () => {
    for await (const chunk of generateProviderTextStream({ ...openAIConfig, apiFormat: 'openai-responses', modelName: 'stream-error' }, messages)) output += chunk;
  }, /could not complete/);
  assert.equal(output, 'Partial');
  assert.equal(calls, 1);
});

test('Responses output excludes reasoning deltas and rejects failed nonstream payloads', async () => {
  globalThis.fetch = async () => new Response('data: {"type":"response.reasoning_text.delta","delta":"private reasoning"}\n\ndata: {"type":"response.output_text.delta","delta":"Answer"}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  const config = { ...openAIConfig, apiFormat: 'openai-responses' as const, modelName: 'responses-output' };
  assert.equal(await collect(generateProviderTextStream(config, messages)), 'Answer');
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ status: 'failed', error: { message: 'private details' } }); };
  await assert.rejects(generateProviderText(config, messages), /could not complete/);
  assert.equal(calls, 1);
});

test('unsupported protocols stop after one fallback', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('Unknown endpoint', { status: 404 }); };
  await assert.rejects(generateProviderText({ ...openAIConfig, modelName: 'neither-protocol' }, messages), /404/);
  assert.equal(calls, 2);
});
