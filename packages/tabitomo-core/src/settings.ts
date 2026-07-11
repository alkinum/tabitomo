export type SpeechRecognitionProvider = 'web-speech' | 'siliconflow' | 'local';
export type LegacySpeechRecognitionProvider = SpeechRecognitionProvider | 'local-whisper';
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
  provider: 'local-ppocr' | 'qwen' | 'custom';
  useGeneralAI?: boolean;
  localModel?: 'ppocr-v5-mobile';
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
export const QWEN_OCR_MODELS = ['qwen3.5-ocr', 'qwen-vl-ocr-latest'] as const;
export type QwenOCRModel = typeof QWEN_OCR_MODELS[number];

export const DEFAULT_SETTINGS: AISettings = {
  generalAI: {
    apiKey: '',
    endpoint: '',
    modelName: 'gpt-5.6-terra',
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
    modelName: 'TeleAI/TeleSpeechASR',
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
    localModel: 'ppocr-v5-mobile',
    apiKey: '',
    endpoint: DASHSCOPE_OCR_ENDPOINT,
    modelName: 'qwen3.5-ocr',
  },
  vlm: {
    useGeneralAI: true,
    useCustom: false,
    enableThinking: false,
  },
};

const API_FORMAT_VALUES: readonly APIFormat[] = API_FORMAT_OPTIONS.map((option) => option.value);
const IMAGE_OCR_PROVIDERS: readonly ImageOCRSettings['provider'][] = ['local-ppocr', 'qwen', 'custom'];
const SPEECH_PROVIDERS: readonly SpeechRecognitionProvider[] = ['web-speech', 'siliconflow', 'local'];
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

const isHunyuanMT = (modelName: string): boolean => modelName.toLowerCase().includes('hunyuan-mt');

const determineOutputMode = (settings: Partial<AISettings>): TranslationSettings['outputMode'] => {
  const useTranslationService = Boolean(settings.apiKey && settings.endpoint && settings.modelName);
  const modelName = useTranslationService
    ? settings.modelName || ''
    : settings.generalAI?.modelName || '';

  return isHunyuanMT(modelName) ? 'plain' : DEFAULT_SETTINGS.translation.outputMode;
};

export function normalizeSpeechRecognitionSettings(
  settings?: PartialSpeechRecognitionSettings
): SpeechRecognitionSettings {
  const incomingProvider = settings?.provider;
  const provider: SpeechRecognitionProvider = incomingProvider === 'local-whisper'
    ? 'local'
    : normalizeEnum(incomingProvider, SPEECH_PROVIDERS, DEFAULT_SETTINGS.speechRecognition.provider);

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
    localModel: 'ppocr-v5-mobile',
    modelName: settings?.modelName?.trim() || DEFAULT_SETTINGS.imageOCR.modelName,
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
  return Boolean(settings.generalAI.apiKey && settings.generalAI.endpoint && settings.generalAI.modelName);
}
