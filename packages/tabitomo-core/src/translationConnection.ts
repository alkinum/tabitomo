import type { AISettings, GeneralAISettings } from './settings';

export const hasTranslationOverride = (settings: AISettings): boolean =>
  settings.provider === 'custom' || Boolean(settings.endpoint || settings.modelName || settings.apiKey);

export const getTranslationConnection = (settings: AISettings): GeneralAISettings => ({
  endpoint: settings.endpoint,
  apiKey: settings.apiKey,
  modelName: settings.modelName,
  apiFormat: 'openai-chat',
});

/** New dedicated translation models start with plain output, including unknown/custom models. */
export function updateTranslationConnection(settings: AISettings, connection: GeneralAISettings): AISettings {
  const modelChanged = settings.modelName !== connection.modelName;
  return {
    ...settings,
    provider: 'custom',
    endpoint: connection.endpoint,
    apiKey: connection.apiKey,
    modelName: connection.modelName,
    translation: { ...settings.translation, outputMode: modelChanged ? 'plain' : settings.translation.outputMode },
  };
}
