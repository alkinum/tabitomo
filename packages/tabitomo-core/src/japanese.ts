import type { AISettings } from './settings';
import { generateProviderText, type ProviderConfig } from './provider';

export interface JapaneseFuriganaToken {
  text: string;
  reading?: string;
}

const THINKING_PATTERN = /<(think|thinking|reasoning|thought)>[\s\S]*?<\/\1>/gi;

export const hasJapaneseText = (text: string): boolean => /[\u3040-\u30ff\u3400-\u9fff]/.test(text);

export const hasFuriganaReadings = (tokens: JapaneseFuriganaToken[] | null | undefined): boolean => (
  Boolean(tokens?.some((token) => token.reading && token.reading !== token.text))
);

const plainFuriganaTokens = (text: string): JapaneseFuriganaToken[] => [{ text }];

const getAnnotationProviderConfig = (settings: AISettings): ProviderConfig | null => {
  if (settings.generalAI.apiKey && settings.generalAI.endpoint && settings.generalAI.modelName) {
    return {
      apiFormat: settings.generalAI.apiFormat || 'openai-chat',
      apiKey: settings.generalAI.apiKey,
      endpoint: settings.generalAI.endpoint,
      modelName: settings.generalAI.modelName,
    };
  }

  if (settings.apiKey && settings.endpoint && settings.modelName) {
    return {
      apiFormat: 'openai-chat',
      apiKey: settings.apiKey,
      endpoint: settings.endpoint,
      modelName: settings.modelName,
    };
  }

  return null;
};

const cleanJsonCandidate = (text: string): string => {
  const withoutThinking = text
    .replace(THINKING_PATTERN, '')
    .replace(/<\|begin_of_box\|>/g, '')
    .replace(/<\|end_of_box\|>/g, '')
    .trim();
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1] : withoutThinking).trim();
};

const parseFuriganaTokens = (responseText: string, originalText: string): JapaneseFuriganaToken[] => {
  const candidate = cleanJsonCandidate(responseText);

  try {
    const parsed = JSON.parse(candidate) as unknown;
    const rawTokens = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { tokens?: unknown }).tokens)
        ? (parsed as { tokens: unknown[] }).tokens
        : [];

    const tokens = rawTokens
      .map((item): JapaneseFuriganaToken | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const token = item as { text?: unknown; reading?: unknown; ruby?: unknown; furigana?: unknown };
        if (typeof token.text !== 'string' || token.text.length === 0) {
          return null;
        }

        const reading = typeof token.reading === 'string'
          ? token.reading
          : typeof token.ruby === 'string'
            ? token.ruby
            : typeof token.furigana === 'string'
              ? token.furigana
              : '';

        return reading.trim()
          ? { text: token.text, reading: reading.trim() }
          : { text: token.text };
      })
      .filter((token): token is JapaneseFuriganaToken => Boolean(token));

    if (tokens.length && tokens.map((token) => token.text).join('') === originalText) {
      return tokens;
    }
  } catch {
    // Fall back to plain output below.
  }

  return plainFuriganaTokens(originalText);
};

export async function annotateJapaneseFurigana(
  text: string,
  settings: AISettings,
  abortSignal?: AbortSignal
): Promise<JapaneseFuriganaToken[]> {
  if (!text.trim() || !hasJapaneseText(text)) {
    return plainFuriganaTokens(text);
  }

  const config = getAnnotationProviderConfig(settings);
  if (!config) {
    return plainFuriganaTokens(text);
  }

  const response = await generateProviderText(
    config,
    [
      {
        role: 'system',
        content: `You annotate Japanese text for a mobile furigana renderer.

Return strict JSON only. Do not translate, normalize, summarize, or rewrite the input.

Output shape:
{"tokens":[{"text":"日本語","reading":"にほんご"},{"text":"です"}]}

Rules:
1. Preserve every original character exactly, including spaces, punctuation, emoji, and line breaks.
2. The concatenation of every "text" value must exactly equal the input string.
3. Add "reading" only for Japanese kanji or kanji-containing words that benefit from furigana.
4. Readings must be hiragana.
5. Kana-only, Latin, numeric, punctuation, and emoji tokens usually do not need readings.`,
      },
      {
        role: 'user',
        content: `Annotate the value of "text" in this JSON object.

Input JSON:
${JSON.stringify({ text }, null, 2)}`,
      },
    ],
    abortSignal
  );

  return parseFuriganaTokens(response, text);
}
