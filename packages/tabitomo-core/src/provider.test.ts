import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  formatProviderTextStream,
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
