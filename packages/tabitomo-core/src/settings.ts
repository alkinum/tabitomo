import { preferredTranslationOutputMode } from './translationModels';

export type SpeechRecognitionProvider = 'web-speech' | 'openai-compatible' | 'local';
export type LegacySpeechRecognitionProvider = SpeechRecognitionProvider | 'local-whisper' | 'siliconflow';
export type LocalAsrEngine = 'whisper' | 'sensevoice';
export type LocalVadMode = 'silero' | 'energy' | 'off';
export type SenseVoiceLanguage = 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'yue';
export type WhisperTask = 'transcribe' | 'translate';

export const API_FORMAT_OPTIONS = [
  { value: 'openai-chat', label: 'OpenAI Chat' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic' },
] as const;

export type APIFormat = typeof API_FORMAT_OPTIONS[number]['value'];

export interface GeneralAISettings {
  apiKey: string;
  endpoint: string;
  modelName: string;
  /** Internal protocol preference; OpenAI-compatible requests negotiate automatically. Kept for config compatibility. */
  apiFormat: APIFormat;
}

export interface SpeechRecognitionSettings {
  provider: SpeechRecognitionProvider;
  endpoint?: string;
  apiKey?: string;
  modelName?: string;
  enableRealtimeTranscription?: boolean;
  localEngine?: LocalAsrEngine;
  localModelPath?: string;
  localAssetBaseUrl?: string;
  vadMode?: LocalVadMode;
  senseVoiceLanguage?: SenseVoiceLanguage;
  senseVoiceUseItn?: boolean;
  whisperLanguage?: string;
  whisperTask?: WhisperTask;
  whisperModel?: 'tiny' | 'base' | 'small';
  whisperModelDownloaded?: boolean;
}

export interface ImageOCRSettings {
  provider: 'local-ppocr' | 'qwen' | 'jina' | 'custom';
  useGeneralAI?: boolean;
  localModel?: 'ppocr-v6-small';
  apiKey: string;
  endpoint: string;
  modelName?: string;
}

export interface VLMSettings {
  useGeneralAI?: boolean;
  useCustom: boolean;
  apiKey?: string;
  endpoint?: string;
  modelName?: string;
  enableThinking: boolean;
}

export interface TranslationSettings {
  outputMode: 'plain' | 'structured';
}

export interface AISettings {
  generalAI: GeneralAISettings;
  provider: 'openai' | 'custom';
  endpoint: string;
  modelName: string;
  apiKey: string;
  translation: TranslationSettings;
  speechRecognition: SpeechRecognitionSettings;
  imageOCR: ImageOCRSettings;
  vlm: VLMSettings;
}

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1';
export const DASHSCOPE_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_INTL_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_OCR_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
export const DASHSCOPE_OCR_INTL_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
export const JINA_OCR_ENDPOINT = 'https://api.jina.ai/v1';
export const JINA_OCR_MODEL = 'jina-ocr-v1';
export const QWEN_OCR_MODELS = ['qwen3.5-ocr', 'qwen-vl-ocr-latest'] as const;
export type QwenOCRModel = typeof QWEN_OCR_MODELS[number];

export const DEFAULT_SETTINGS: AISettings = {
  generalAI: {
    apiKey: '',
    endpoint: '',
    modelName: '',
    apiFormat: 'openai-chat',
  },
  provider: 'openai',
  endpoint: '',
  modelName: '',
  apiKey: '',
  translation: {
    outputMode: 'structured',
  },
  speechRecognition: {
    provider: 'web-speech',
    endpoint: '',
    modelName: '',
    enableRealtimeTranscription: true,
    localEngine: 'whisper',
    localModelPath: '',
    localAssetBaseUrl: '',
    vadMode: 'silero',
    senseVoiceLanguage: 'auto',
    senseVoiceUseItn: true,
    whisperLanguage: 'auto',
    whisperTask: 'transcribe',
    whisperModel: 'base',
    whisperModelDownloaded: false,
  },
  imageOCR: {
    provider: 'local-ppocr',
    useGeneralAI: false,
    localModel: 'ppocr-v6-small',
    apiKey: '',
    endpoint: '',
    modelName: '',
  },
  vlm: {
    useGeneralAI: true,
    useCustom: false,
    enableThinking: false,
  },
};

const API_FORMAT_VALUES: readonly APIFormat[] = API_FORMAT_OPTIONS.map((option) => option.value);
const IMAGE_OCR_PROVIDERS: readonly ImageOCRSettings['provider'][] = ['local-ppocr', 'qwen', 'jina', 'custom'];
const SPEECH_PROVIDERS: readonly SpeechRecognitionProvider[] = ['web-speech', 'openai-compatible', 'local'];
const LOCAL_ASR_ENGINES: readonly LocalAsrEngine[] = ['whisper', 'sensevoice'];
const LOCAL_VAD_MODES: readonly LocalVadMode[] = ['silero', 'energy', 'off'];
const SENSE_VOICE_LANGUAGES: readonly SenseVoiceLanguage[] = ['auto', 'zh', 'en', 'ja', 'ko', 'yue'];
const WHISPER_TASKS: readonly WhisperTask[] = ['transcribe', 'translate'];

type PartialSpeechRecognitionSettings = Partial<Omit<SpeechRecognitionSettings, 'provider'>> & {
  provider?: LegacySpeechRecognitionProvider | string;
};

const normalizeEnum = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => (
  values.includes(value as T) ? value as T : fallback
);

const determineOutputMode = (settings: Partial<AISettings>): TranslationSettings['outputMode'] => {
  const useTranslationService = Boolean(hasProviderConnection(settings));
  const modelName = useTranslationService
    ? settings.modelName || ''
    : settings.generalAI?.modelName || '';

  return preferredTranslationOutputMode(modelName);
};

/** Read old exported provider IDs only at the configuration boundary. */
export function normalizeSpeechRecognitionProvider(provider: unknown): SpeechRecognitionProvider {
  if (provider === 'local-whisper') return 'local';
  if (provider === 'siliconflow') return 'openai-compatible';
  return normalizeEnum(provider, SPEECH_PROVIDERS, DEFAULT_SETTINGS.speechRecognition.provider);
}

export function normalizeSpeechRecognitionSettings(
  settings?: PartialSpeechRecognitionSettings
): SpeechRecognitionSettings {
  const provider = normalizeSpeechRecognitionProvider(settings?.provider);

  return {
    ...DEFAULT_SETTINGS.speechRecognition,
    ...(settings || {}),
    provider,
    localEngine: normalizeEnum(settings?.localEngine, LOCAL_ASR_ENGINES, DEFAULT_SETTINGS.speechRecognition.localEngine || 'whisper'),
    vadMode: normalizeEnum(settings?.vadMode, LOCAL_VAD_MODES, DEFAULT_SETTINGS.speechRecognition.vadMode || 'silero'),
    senseVoiceLanguage: normalizeEnum(
      settings?.senseVoiceLanguage,
      SENSE_VOICE_LANGUAGES,
      DEFAULT_SETTINGS.speechRecognition.senseVoiceLanguage || 'auto'
    ),
    whisperTask: normalizeEnum(settings?.whisperTask, WHISPER_TASKS, DEFAULT_SETTINGS.speechRecognition.whisperTask || 'transcribe'),
  };
}

export function normalizeImageOCRSettings(settings?: Partial<ImageOCRSettings>): ImageOCRSettings {
  return {
    ...DEFAULT_SETTINGS.imageOCR,
    ...(settings || {}),
    provider: normalizeEnum(settings?.provider, IMAGE_OCR_PROVIDERS, DEFAULT_SETTINGS.imageOCR.provider),
    localModel: 'ppocr-v6-small',
    modelName: settings?.modelName?.trim() || (settings?.provider === 'qwen' ? 'qwen3.5-ocr' : ''),
    ...(settings?.provider === 'jina' ? { endpoint: JINA_OCR_ENDPOINT, modelName: JINA_OCR_MODEL } : {}),
  };
}

export function normalizeSettings(settings?: Partial<AISettings> | null): AISettings {
  if (!settings) {
    return DEFAULT_SETTINGS;
  }

  const outputMode = settings.translation?.outputMode || determineOutputMode(settings);

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    generalAI: {
      ...DEFAULT_SETTINGS.generalAI,
      ...(settings.generalAI || {}),
      apiFormat: normalizeEnum(settings.generalAI?.apiFormat, API_FORMAT_VALUES, DEFAULT_SETTINGS.generalAI.apiFormat),
      modelName: settings.generalAI?.modelName?.trim() || DEFAULT_SETTINGS.generalAI.modelName,
    },
    translation: {
      ...DEFAULT_SETTINGS.translation,
      ...(settings.translation || {}),
      outputMode,
    },
    speechRecognition: normalizeSpeechRecognitionSettings(settings.speechRecognition as PartialSpeechRecognitionSettings | undefined),
    imageOCR: normalizeImageOCRSettings(settings.imageOCR),
    vlm: {
      ...DEFAULT_SETTINGS.vlm,
      ...(settings.vlm || {}),
    },
  };
}

export function hasGeneralAISettings(settings: AISettings): boolean {
  return hasProviderConnection(settings.generalAI);
}

/** Keyless connections are limited to explicit local-network servers. */
export function isLocalProviderEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '[::1]' || host.endsWith('.local')
      || /^127\.\d+\.\d+\.\d+$/.test(host) || /^10\.\d+\.\d+\.\d+$/.test(host)
      || /^192\.168\.\d+\.\d+$/.test(host) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
  } catch { return false; }
}
export function hasProviderConnection(config: { endpoint?: string; apiKey?: string; modelName?: string }): boolean {
  return Boolean(config.endpoint?.trim() && config.modelName?.trim()
    && (config.apiKey?.trim() || isLocalProviderEndpoint(config.endpoint)));
}
