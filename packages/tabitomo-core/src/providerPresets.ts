import {
  DASHSCOPE_ENDPOINT,
  DASHSCOPE_OCR_ENDPOINT,
  DASHSCOPE_OCR_INTL_ENDPOINT,
  DEFAULT_SETTINGS,
  OPENAI_ENDPOINT,
  type AISettings,
  type APIFormat,
  type ImageOCRSettings,
  type SpeechRecognitionProvider,
} from './settings';

export interface ModelOption {
  id: string;
  label: string;
  description?: string;
}

export interface GeneralAIPreset {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  apiFormat: APIFormat;
  defaultModel: string;
  models: ModelOption[];
}

export interface TranslationProviderPreset extends GeneralAIPreset {
  outputMode?: AISettings['translation']['outputMode'];
}

export interface SpeechProviderPreset {
  id: string;
  label: string;
  description: string;
  provider: SpeechRecognitionProvider;
  endpoint?: string;
  defaultModel?: string;
  models?: ModelOption[];
}

export interface ImageOCRPreset {
  id: string;
  label: string;
  description: string;
  provider: ImageOCRSettings['provider'];
  endpoint?: string;
  defaultModel?: string;
  useGeneralAI?: boolean;
  models?: ModelOption[];
}

export interface VLMPreset {
  id: string;
  label: string;
  description: string;
  mode: 'general' | 'ocr' | 'custom';
  endpoint?: string;
  defaultModel?: string;
  models?: ModelOption[];
}

export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1';

export const GENERAL_AI_PRESETS: readonly GeneralAIPreset[] = [
  {
    id: 'openrouter', label: 'OpenRouter', description: 'Enter your API key and choose from the live model catalog.',
    endpoint: 'https://openrouter.ai/api/v1', apiFormat: 'openai-chat', defaultModel: '', models: [],
  },
  {
    id: 'local-server', label: 'Local server', description: 'Ollama, LM Studio or another compatible server. On a phone, use the computer’s LAN address.',
    endpoint: 'http://localhost:1234/v1', apiFormat: 'openai-chat', defaultModel: '', models: [],
  },

  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Choose an available model from your account.',
    endpoint: OPENAI_ENDPOINT,
    apiFormat: 'openai-responses',
    defaultModel: '',
    models: [],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Claude Messages API for explanation and Q&A quality.',
    endpoint: ANTHROPIC_ENDPOINT,
    apiFormat: 'anthropic',
    defaultModel: '',
    models: [],
  },
  {
    id: 'dashscope-qwen',
    label: 'DashScope Qwen',
    description: 'OpenAI-compatible Qwen models, useful for Chinese/Japanese flows.',
    endpoint: DASHSCOPE_ENDPOINT,
    apiFormat: 'openai-chat',
    defaultModel: '',
    models: [],
  },
] as const;

/** Translation overrides use compatible APIs and a live catalog, never a pinned model. */
export const TRANSLATION_PROVIDER_PRESETS: readonly TranslationProviderPreset[] = GENERAL_AI_PRESETS
  .filter((preset) => preset.apiFormat !== 'anthropic')
  .map((preset) => ({ ...preset, apiFormat: 'openai-chat', outputMode: 'plain' }));

export const SPEECH_PROVIDER_PRESETS: readonly SpeechProviderPreset[] = [
  {
    id: 'native-speech',
    label: 'Native speech',
    description: 'Uses Web Speech on web and Apple Speech on iOS when available.',
    provider: 'web-speech',
  },
  {
    id: 'openai-transcribe',
    label: 'OpenAI transcription',
    description: 'OpenAI-compatible audio transcription endpoint.',
    provider: 'openai-compatible',
    endpoint: OPENAI_ENDPOINT,
    defaultModel: 'gpt-4o-mini-transcribe',
    models: [
      { id: 'gpt-4o-mini-transcribe', label: 'GPT-4o mini transcribe' },
      { id: 'gpt-4o-transcribe', label: 'GPT-4o transcribe' },
      { id: 'whisper-1', label: 'Whisper 1' },
    ],
  },
  {
    id: 'local-asr-runtime',
    label: 'Local ASR runtime',
    description: 'Native/Core ML, whisper.cpp, or sherpa-onnx runtime track.',
    provider: 'local',
  },
] as const;

export const IMAGE_OCR_PRESETS: readonly ImageOCRPreset[] = [
  {
    id: 'native-local-ocr',
    label: 'Local OCR',
    description: 'Web PP-OCR; iOS uses Apple Vision until custom local runtime lands.',
    provider: 'local-ppocr',
    useGeneralAI: false,
  },
  {
    id: 'qwen-ocr-beijing',
    label: 'Qwen OCR Beijing',
    description: 'Alibaba Cloud Model Studio native Qwen-OCR endpoint with coordinate output.',
    provider: 'qwen',
    endpoint: DASHSCOPE_OCR_ENDPOINT,
    defaultModel: 'qwen3.5-ocr',
    useGeneralAI: false,
    models: [
      { id: 'qwen3.5-ocr', label: 'Qwen 3.5 OCR (recommended)' },
      { id: 'qwen-vl-ocr-latest', label: 'Qwen VL OCR latest (compatibility)' },
    ],
  },
  {
    id: 'qwen-ocr-singapore',
    label: 'Qwen OCR Singapore',
    description: 'DashScope international endpoint for Qwen-OCR.',
    provider: 'qwen',
    endpoint: DASHSCOPE_OCR_INTL_ENDPOINT,
    defaultModel: 'qwen3.5-ocr',
    useGeneralAI: false,
    models: [
      { id: 'qwen3.5-ocr', label: 'Qwen 3.5 OCR (recommended)' },
      { id: 'qwen-vl-ocr-latest', label: 'Qwen VL OCR latest (compatibility)' },
    ],
  },
] as const;

export const VLM_PROVIDER_PRESETS: readonly VLMPreset[] = [
  {
    id: 'general-ai-vlm',
    label: 'General AI',
    description: 'Use the main multimodal provider for direct image translation.',
    mode: 'general',
  },
  {
    id: 'ocr-provider-vlm',
    label: 'Use OCR provider',
    description: 'Reuse Alibaba Qwen credentials and region with qwen-vl-max-latest.',
    mode: 'ocr',
  },
  {
    id: 'qwen-vl-max',
    label: 'Qwen VL Max',
    description: 'DashScope vision model for direct image translation.',
    mode: 'custom',
    endpoint: DASHSCOPE_ENDPOINT,
    defaultModel: 'qwen-vl-max-latest',
    models: [
      { id: 'qwen-vl-max', label: 'Qwen VL Max' },
      { id: 'qwen-vl-plus', label: 'Qwen VL Plus' },
    ],
  },
  {
    id: 'openai-vision',
    label: 'OpenAI Vision',
    description: 'Choose an available vision model on your account.',
    mode: 'custom',
    endpoint: OPENAI_ENDPOINT,
    defaultModel: '',
    models: [],
  },
] as const;

const findById = <T extends { id: string }>(items: readonly T[], id: string): T | undefined => (
  items.find((item) => item.id === id)
);

export function applyGeneralAIPreset(settings: AISettings, presetId: string): AISettings {
  const preset = findById(GENERAL_AI_PRESETS, ['openai-chat', 'openai-responses'].includes(presetId) ? 'openai' : presetId);
  if (!preset) return settings;

  return {
    ...settings,
    generalAI: {
      ...settings.generalAI,
      apiKey: settings.generalAI.endpoint.replace(/\/+$/, '') === preset.endpoint.replace(/\/+$/, '') ? settings.generalAI.apiKey : '',
      apiFormat: preset.apiFormat,
      endpoint: preset.endpoint,
      modelName: preset.defaultModel,
    },
  };
}

export function applyTranslationProviderPreset(settings: AISettings, presetId: string): AISettings {
  const preset = findById(TRANSLATION_PROVIDER_PRESETS, presetId);
  if (!preset) return settings;

  return {
    ...settings,
    provider: 'custom',
    apiKey: settings.endpoint === preset.endpoint ? settings.apiKey : '',
    endpoint: preset.endpoint,
    modelName: preset.defaultModel,
    translation: {
      ...settings.translation,
      outputMode: preset.outputMode || settings.translation.outputMode,
    },
  };
}

export function clearTranslationOverride(settings: AISettings): AISettings {
  return {
    ...settings,
    provider: DEFAULT_SETTINGS.provider,
    endpoint: '',
    modelName: '',
    apiKey: '',
    translation: {
      ...settings.translation,
      outputMode: DEFAULT_SETTINGS.translation.outputMode,
    },
  };
}

export function applySpeechProviderPreset(settings: AISettings, presetId: string): AISettings {
  const preset = findById(SPEECH_PROVIDER_PRESETS, presetId);
  if (!preset) return settings;

  return {
    ...settings,
    speechRecognition: {
      ...settings.speechRecognition,
      provider: preset.provider,
      apiKey: settings.speechRecognition.endpoint === preset.endpoint ? settings.speechRecognition.apiKey : '',
      endpoint: preset.endpoint || '',
      modelName: preset.defaultModel || settings.speechRecognition.modelName || DEFAULT_SETTINGS.speechRecognition.modelName,
    },
  };
}

export function applyImageOCRPreset(settings: AISettings, presetId: string): AISettings {
  const preset = findById(IMAGE_OCR_PRESETS, presetId);
  if (!preset) return settings;

  return {
    ...settings,
    imageOCR: {
      ...settings.imageOCR,
      provider: preset.provider,
      useGeneralAI: preset.useGeneralAI ?? false,
      endpoint: preset.endpoint || settings.imageOCR.endpoint,
      modelName: preset.defaultModel || settings.imageOCR.modelName,
    },
  };
}

export function applyVLMPreset(settings: AISettings, presetId: string): AISettings {
  const preset = findById(VLM_PROVIDER_PRESETS, presetId);
  if (!preset) return settings;

  if (preset.mode === 'general') {
    return {
      ...settings,
      vlm: {
        ...settings.vlm,
        useGeneralAI: true,
        useCustom: false,
      },
    };
  }

  if (preset.mode === 'ocr') {
    return {
      ...settings,
      vlm: {
        ...settings.vlm,
        useGeneralAI: false,
        useCustom: false,
      },
    };
  }

  return {
    ...settings,
    vlm: {
      ...settings.vlm,
      useGeneralAI: false,
      useCustom: true,
      apiKey: settings.vlm.endpoint === preset.endpoint ? settings.vlm.apiKey : '',
      endpoint: preset.endpoint,
      modelName: preset.defaultModel,
    },
  };
}

export function matchGeneralAIPreset(settings: AISettings): string | undefined {
  return GENERAL_AI_PRESETS.find((preset) => (
    preset.endpoint.replace(/\/+$/, '') === settings.generalAI.endpoint.trim().replace(/\/+$/, '')
  ))?.id;
}

export function matchTranslationProviderPreset(settings: AISettings): string | undefined {
  if (!settings.endpoint && !settings.modelName && !settings.apiKey) return 'general-ai';
  return TRANSLATION_PROVIDER_PRESETS.find((preset) => (
    preset.endpoint.replace(/\/+$/, '') === settings.endpoint.trim().replace(/\/+$/, '')
  ))?.id;
}

export function matchSpeechProviderPreset(settings: AISettings): string | undefined {
  return SPEECH_PROVIDER_PRESETS.find((preset) => (
    preset.provider === settings.speechRecognition.provider
    && (!preset.endpoint || preset.endpoint === settings.speechRecognition.endpoint)
    && (!preset.defaultModel || preset.defaultModel === settings.speechRecognition.modelName)
  ))?.id;
}

export function matchImageOCRPreset(settings: AISettings): string | undefined {
  return IMAGE_OCR_PRESETS.find((preset) => (
    preset.provider === settings.imageOCR.provider
    && (preset.useGeneralAI ?? false) === Boolean(settings.imageOCR.useGeneralAI)
    && (!preset.endpoint || preset.endpoint === settings.imageOCR.endpoint)
  ))?.id;
}

export function matchVLMPreset(settings: AISettings): string | undefined {
  return VLM_PROVIDER_PRESETS.find((preset) => {
    if (preset.mode === 'general') return Boolean(settings.vlm.useGeneralAI);
    if (preset.mode === 'ocr') return !settings.vlm.useGeneralAI && !settings.vlm.useCustom;
    return !settings.vlm.useGeneralAI
      && settings.vlm.useCustom
      && preset.endpoint === settings.vlm.endpoint
      && preset.defaultModel === settings.vlm.modelName;
  })?.id;
}
