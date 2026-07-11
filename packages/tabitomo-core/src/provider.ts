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

const stripBoxTokens = (text: string): string => text
  .replace(/<\|begin_of_box\|>/g, '')
  .replace(/<\|end_of_box\|>/g, '');

const parseOpenAIText = (payload: unknown): string => {
  const data = payload as {
    choices?: Array<{ message?: { content?: string | null }; text?: string | null }>;
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  };

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

  if (typeof data.delta === 'string' && (!data.type || data.type.includes('.delta'))) {
    return data.delta;
  }

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
  if (!config.apiKey.trim()) {
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

  if (config.apiFormat === 'openai-responses') {
    const response = await fetch(joinEndpoint(config.endpoint, 'responses'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        input: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI Responses request failed: ${await response.text()}`);
    }

    return parseOpenAIText(await response.json());
  }

  const response = await fetch(joinEndpoint(config.endpoint, 'chat/completions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible request failed: ${await response.text()}`);
  }

  return parseOpenAIText(await response.json());
}

export async function* generateProviderTextStream(
  config: ProviderConfig,
  messages: ProviderMessage[],
  abortSignal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  if (!config.apiKey.trim()) {
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

  if (config.apiFormat === 'openai-responses') {
    const response = await fetch(joinEndpoint(config.endpoint, 'responses'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        stream: true,
        input: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI Responses request failed: ${await response.text()}`);
    }

    yield* streamProviderResponseText(response, extractOpenAIStreamText, parseOpenAIText);
    return;
  }

  const response = await fetch(joinEndpoint(config.endpoint, 'chat/completions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      stream: true,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible request failed: ${await response.text()}`);
  }

  yield* streamProviderResponseText(response, extractOpenAIStreamText, parseOpenAIText);
}
