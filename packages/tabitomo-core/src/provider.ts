import { isLocalProviderEndpoint } from './settings';
import type { APIFormat } from './settings';

export interface ProviderConfig {
  apiFormat: APIFormat;
  apiKey: string;
  endpoint: string;
  modelName: string;
}

export type ProviderContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ProviderContentPart[];
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const joinEndpoint = (endpoint: string, path: string): string => `${trimTrailingSlash(endpoint)}/${path.replace(/^\/+/, '')}`;

type OpenAIProtocol = 'openai-chat' | 'openai-responses';
// Capabilities can differ by model. Keep only short-lived, non-secret hints in memory.
const protocolHints = new Map<string, { protocol: OpenAIProtocol; expires: number }>();

const toResponsesInput = (messages: ProviderMessage[]): unknown[] => messages.map((message) => ({
  role: message.role,
  content: typeof message.content === 'string' ? message.content : message.content.map((part) => (
    part.type === 'text'
      ? { type: message.role === 'assistant' ? 'output_text' : 'input_text', text: part.text }
      : { type: 'input_image', image_url: part.image_url.url, detail: 'auto' }
  )),
}));

function isUnsupportedProtocol(status: number, body: string): boolean {
  if (![400, 404, 405, 422, 501].includes(status)) return false;
  if (/model_not_found|invalid_api_key|insufficient_quota|no endpoints found/i.test(body)) return false;
  // A missing model, invalid key or exhausted balance is not a missing endpoint.
  if (/model_not_found|invalid_api_key|insufficient_quota|\b(model|key|quota|credit|balance|billing|permission|access)\b/i.test(body)
    && !/(only|must|does not|not supported|unsupported).{0,100}(responses|chat.?completions)|(responses|chat.?completions).{0,100}(not supported|unsupported)/i.test(body)) return false;
  if ([404, 405, 501].includes(status)) return true;
  return /(?:unsupported|not supported|unknown|unrecognized|not found|only supports?|must use|use instead).{0,100}(?:endpoint|route|responses|chat.?completions)|(?:endpoint|route|responses|chat.?completions).{0,100}(?:unsupported|not supported|not found|not available)/i.test(body);
}

function providerRequestError(status: number): Error {
  const action = status === 401 || status === 403 ? 'Check your API key and model access.'
    : status === 402 ? 'Check your provider balance.'
    : status === 429 ? 'Rate limit or quota reached. Try again later.'
    : status === 404 ? 'Check your endpoint and model ID.'
    : 'Check your provider settings or try again later.';
  // Provider error bodies may contain credentials or submitted content.
  return new Error(`AI request failed (${status}). ${action}`);
}

async function requestOpenAI(
  config: ProviderConfig, messages: ProviderMessage[], stream: boolean, signal?: AbortSignal,
): Promise<Response> {
  const endpoint = trimTrailingSlash(config.endpoint.trim());
  const hintKey = JSON.stringify([endpoint, config.modelName]);
  const hint = protocolHints.get(hintKey);
  const preferred: OpenAIProtocol = config.apiFormat === 'openai-responses' ? 'openai-responses' : 'openai-chat';
  const first = hint && hint.expires > Date.now() ? hint.protocol : preferred;
  const protocols: OpenAIProtocol[] = [first, first === 'openai-chat' ? 'openai-responses' : 'openai-chat'];

  for (const [index, protocol] of protocols.entries()) {
    if (signal?.aborted) throw Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
    const response = await fetch(joinEndpoint(endpoint, protocol === 'openai-chat' ? 'chat/completions' : 'responses'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey.trim() ? { authorization: `Bearer ${config.apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({
        model: config.modelName,
        ...(stream ? { stream: true } : {}),
        ...(protocol === 'openai-chat' ? { messages } : { input: toResponsesInput(messages), store: false }),
      }),
      signal,
    });
    if (response.ok) {
      if (protocolHints.size >= 100) protocolHints.clear();
      protocolHints.set(hintKey, { protocol, expires: Date.now() + 10 * 60_000 });
      return response;
    }
    const body = await response.text();
    if (index === 0 && !signal?.aborted && isUnsupportedProtocol(response.status, body)) continue;
    throw providerRequestError(response.status);
  }
  throw new Error('This provider does not support a compatible AI endpoint.');
}

const stripBoxTokens = (text: string): string => text
  .replace(/<\|begin_of_box\|>/g, '')
  .replace(/<\|end_of_box\|>/g, '');

const parseOpenAIText = (payload: unknown): string => {
  const data = payload as {
    error?: unknown;
    status?: string;
    choices?: Array<{ message?: { content?: string | null }; text?: string | null }>;
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  };

  if (data.error || data.status === 'failed' || data.status === 'incomplete') {
    throw new Error('The provider could not complete the response. Try again.');
  }

  if (typeof data.output_text === 'string') {
    return data.output_text;
  }

  const choice = data.choices?.[0];
  if (typeof choice?.message?.content === 'string') {
    return choice.message.content;
  }
  if (typeof choice?.text === 'string') {
    return choice.text;
  }

  const outputText = data.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text)
    .filter((text): text is string => typeof text === 'string')
    .join('');

  return outputText || '';
};

const parseAnthropicText = (payload: unknown): string => {
  const data = payload as { content?: Array<{ type?: string; text?: string }> };
  return (data.content || [])
    .map((item) => item.text)
    .filter((text): text is string => typeof text === 'string')
    .join('');
};

const toAnthropicContent = (content: ProviderMessage['content']): unknown => {
  if (typeof content === 'string') {
    return content;
  }

  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }

    const dataUrlMatch = part.image_url.url.match(/^data:([^;]+);base64,(.*)$/);
    if (!dataUrlMatch) {
      throw new Error('Anthropic image input requires a base64 data URL on mobile.');
    }

    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: dataUrlMatch[1],
        data: dataUrlMatch[2],
      },
    };
  });
};

interface ServerSentEvent {
  event?: string;
  data: string;
}

const parseServerSentEvent = (rawEvent: string): ServerSentEvent | null => {
  const data: string[] = [];
  let event: string | undefined;

  for (const line of rawEvent.split('\n')) {
    if (!line || line.startsWith(':')) {
      continue;
    }

    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }

  if (!data.length) {
    return null;
  }

  return {
    event,
    data: data.join('\n'),
  };
};

async function* readServerSentEvents(response: Response): AsyncGenerator<ServerSentEvent, void, unknown> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    while (true) {
      const eventEnd = buffer.indexOf('\n\n');
      if (eventEnd === -1) {
        break;
      }

      const event = parseServerSentEvent(buffer.slice(0, eventEnd));
      buffer = buffer.slice(eventEnd + 2);

      if (event) {
        yield event;
      }
    }
  }

  buffer += decoder.decode().replace(/\r\n/g, '\n');
  const event = parseServerSentEvent(buffer.trim());
  if (event) {
    yield event;
  }
}

const parseJsonPayload = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const extractOpenAIStreamText = (payload: unknown): string => {
  const data = payload as {
    type?: string;
    delta?: string;
    text?: string;
    output_text?: string;
    choices?: Array<{
      delta?: { content?: string | null; text?: string | null };
      message?: { content?: string | null };
      text?: string | null;
    }>;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  };

  if (typeof data.delta === 'string' && (!data.type || data.type === 'response.output_text.delta')) {
    return data.delta;
  }

  if (data.type?.startsWith('response.')) return '';

  const choiceText = data.choices
    ?.map((choice) => choice.delta?.content ?? choice.delta?.text ?? choice.text ?? choice.message?.content ?? '')
    .join('');

  if (choiceText) {
    return choiceText;
  }

  if (typeof data.text === 'string' && data.type?.includes('.delta')) {
    return data.text;
  }

  if (typeof data.output_text === 'string' && !data.type) {
    return data.output_text;
  }

  const outputText = data.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text)
    .filter((text): text is string => typeof text === 'string')
    .join('');

  return outputText || '';
};

const extractAnthropicStreamText = (payload: unknown): string => {
  const data = payload as {
    type?: string;
    delta?: { text?: string };
    content_block?: { text?: string };
  };

  if (data.type === 'content_block_delta' && typeof data.delta?.text === 'string') {
    return data.delta.text;
  }

  if (data.type === 'content_block_start' && typeof data.content_block?.text === 'string') {
    return data.content_block.text;
  }

  return '';
};

async function* streamProviderResponseText(
  response: Response,
  parseText: (payload: unknown) => string,
  parseFullText: (payload: unknown) => string
): AsyncGenerator<string, void, unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/event-stream')) {
    const payload = parseJsonPayload(await response.text());
    const text = payload ? parseFullText(payload) : '';
    if (text) {
      yield text;
    }
    return;
  }

  for await (const event of readServerSentEvents(response)) {
    if (event.data === '[DONE]') {
      break;
    }

    const payload = parseJsonPayload(event.data);
    if (!payload) {
      continue;
    }

    const status = payload as { type?: string; error?: unknown };
    if (event.event === 'error' || status.error || ['error', 'response.failed', 'response.incomplete'].includes(status.type || '')) {
      // Never replay a stream: some output may already have been delivered and billed.
      throw new Error('The provider could not complete the response. Try again.');
    }

    const text = parseText(payload);
    if (text) {
      yield text;
    }
  }
}

export async function* formatProviderTextStream(
  chunks: AsyncIterable<string> | Iterable<string>,
  showThinking: boolean
): AsyncGenerator<string, void, unknown> {
  let inThinkTag = false;
  let buffer = '';

  for await (const chunk of chunks) {
    buffer += stripBoxTokens(chunk);

    while (true) {
      if (!inThinkTag) {
        const thinkStartIndex = buffer.indexOf('<think>');

        if (thinkStartIndex === -1) {
          const lastTagStart = buffer.lastIndexOf('<');

          if (lastTagStart === -1) {
            if (buffer) {
              yield buffer;
              buffer = '';
            }
            break;
          }

          const readyText = buffer.slice(0, lastTagStart);
          if (readyText) {
            yield readyText;
          }
          buffer = buffer.slice(lastTagStart);
          break;
        }

        if (thinkStartIndex > 0) {
          yield buffer.slice(0, thinkStartIndex);
        }

        buffer = buffer.slice(thinkStartIndex + '<think>'.length);
        inThinkTag = true;

        if (showThinking) {
          yield 'Thinking:\n';
        }
        continue;
      }

      const thinkEndIndex = buffer.indexOf('</think>');

      if (thinkEndIndex === -1) {
        if (showThinking && buffer) {
          yield buffer;
        }
        buffer = '';
        break;
      }

      if (showThinking) {
        const thinkingText = buffer.slice(0, thinkEndIndex);
        if (thinkingText) {
          yield thinkingText;
        }
        yield '\n\n';
      }

      buffer = buffer.slice(thinkEndIndex + '</think>'.length);
      inThinkTag = false;
    }
  }

  if (buffer && (!inThinkTag || showThinking)) {
    yield buffer;
  }
}

export async function generateProviderText(
  config: ProviderConfig,
  messages: ProviderMessage[],
  abortSignal?: AbortSignal
): Promise<string> {
  if (!config.apiKey.trim() && !isLocalProviderEndpoint(config.endpoint)) {
    throw new Error('API key is not configured');
  }
  if (!config.endpoint.trim()) {
    throw new Error('API endpoint is not configured');
  }
  if (!config.modelName.trim()) {
    throw new Error('Model name is not configured');
  }

  if (config.apiFormat === 'anthropic') {
    const systemMessage = messages.find((message) => message.role === 'system');
    const userMessages = messages.filter((message) => message.role !== 'system');
    const response = await fetch(joinEndpoint(config.endpoint, 'messages'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.modelName,
        max_tokens: 4096,
        ...(systemMessage ? { system: typeof systemMessage.content === 'string' ? systemMessage.content : toAnthropicContent(systemMessage.content) } : {}),
        messages: userMessages.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: toAnthropicContent(message.content),
        })),
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${await response.text()}`);
    }

    return parseAnthropicText(await response.json());
  }

  const response = await requestOpenAI(config, messages, false, abortSignal);
  return parseOpenAIText(await response.json());
}

export async function* generateProviderTextStream(
  config: ProviderConfig,
  messages: ProviderMessage[],
  abortSignal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  if (!config.apiKey.trim() && !isLocalProviderEndpoint(config.endpoint)) {
    throw new Error('API key is not configured');
  }
  if (!config.endpoint.trim()) {
    throw new Error('API endpoint is not configured');
  }
  if (!config.modelName.trim()) {
    throw new Error('Model name is not configured');
  }

  if (config.apiFormat === 'anthropic') {
    const systemMessage = messages.find((message) => message.role === 'system');
    const userMessages = messages.filter((message) => message.role !== 'system');
    const response = await fetch(joinEndpoint(config.endpoint, 'messages'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.modelName,
        max_tokens: 4096,
        stream: true,
        ...(systemMessage ? { system: typeof systemMessage.content === 'string' ? systemMessage.content : toAnthropicContent(systemMessage.content) } : {}),
        messages: userMessages.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: toAnthropicContent(message.content),
        })),
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${await response.text()}`);
    }

    yield* streamProviderResponseText(response, extractAnthropicStreamText, parseAnthropicText);
    return;
  }

  const response = await requestOpenAI(config, messages, true, abortSignal);
  yield* streamProviderResponseText(response, extractOpenAIStreamText, parseOpenAIText);
}
