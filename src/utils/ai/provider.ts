import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { APIFormat, GeneralAISettings } from '../config/settings';

const DEFAULT_API_FORMAT: APIFormat = 'openai-chat';

export function createGeneralAIModel(
  settings: GeneralAISettings,
  providerName = 'general-ai'
): LanguageModel {
  const apiFormat = settings.apiFormat || DEFAULT_API_FORMAT;
  const apiKey = settings.apiKey.trim();
  const endpoint = settings.endpoint.trim();
  const modelName = settings.modelName.trim();

  if (!apiKey) {
    throw new Error('API key is not configured');
  }

  if (!endpoint) {
    throw new Error('API endpoint is not configured');
  }

  if (!modelName) {
    throw new Error('Model name is not configured');
  }

  switch (apiFormat) {
    case 'openai-chat': {
      const provider = createOpenAICompatible({
        name: providerName,
        apiKey,
        baseURL: endpoint,
      });
      return provider(modelName);
    }

    case 'openai-responses': {
      const provider = createOpenAI({
        name: providerName,
        apiKey,
        baseURL: endpoint,
      });
      return provider.responses(modelName);
    }

    case 'anthropic': {
      const provider = createAnthropic({
        name: `${providerName}.messages`,
        apiKey,
        baseURL: endpoint,
      });
      return provider.messages(modelName);
    }
  }
}
