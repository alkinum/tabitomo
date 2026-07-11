export type SpeechRecognitionProvider = 'web-speech' | 'siliconflow' | 'local';
export type LegacySpeechRecognitionProvider = SpeechRecognitionProvider | 'local-whisper';
export type LocalAsrEngine = 'whisper' | 'sensevoice';
export type LocalVadMode = 'silero' | 'energy' | 'off';
export type SenseVoiceLanguage = 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'yue';
export type WhisperTask = 'transcribe' | 'translate';

export interface SpeechRecognitionSettings {
  provider: SpeechRecognitionProvider;
  endpoint?: string; // Optional provider-specific OpenAI-compatible transcription endpoint
  apiKey?: string; // Only for SiliconFlow
  modelName?: string; // Model name for AI Service providers (e.g., TeleAI/TeleSpeechASR for SiliconFlow)
  enableRealtimeTranscription?: boolean; // Enable realtime transcription with VAD
  localEngine?: LocalAsrEngine; // Local ASR engine for sherpa-onnx
  localModelPath?: string; // URL/path to an extracted sherpa-onnx model directory
  localAssetBaseUrl?: string; // Optional URL/path to sherpa runtime assets
  vadMode?: LocalVadMode; // Local realtime VAD mode
  senseVoiceLanguage?: SenseVoiceLanguage;
  senseVoiceUseItn?: boolean;
  whisperLanguage?: string;
  whisperTask?: WhisperTask;
  whisperModel?: 'tiny' | 'base' | 'small'; // Legacy Remotion Whisper model size
  whisperModelDownloaded?: boolean; // Legacy Remotion Whisper download marker
}

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

export interface ImageOCRSettings {
  provider: 'local-ppocr' | 'qwen' | 'custom';
  useGeneralAI?: boolean; // true = use general AI settings, false = use custom settings
  localModel?: 'ppocr-v5-mobile';
  apiKey: string;
  endpoint: string;
  modelName?: string; // For custom provider
}

export interface VLMSettings {
  useGeneralAI?: boolean; // true = use general AI settings, false = use OCR or custom settings
  useCustom: boolean; // false = use OCR settings, true = use custom settings (only applies when useGeneralAI is false)
  apiKey?: string;
  endpoint?: string;
  modelName?: string;
  enableThinking: boolean; // Enable thinking mode (show model's reasoning process)
}

export interface TranslationSettings {
  outputMode: 'plain' | 'structured'; // plain = plain text, structured = JSON structured output
}

export interface AISettings {
  // General AI service (fallback for all features)
  generalAI: GeneralAISettings;
  // Text translation settings (deprecated, kept for backward compatibility)
  provider: 'openai' | 'custom';
  endpoint: string;
  modelName: string;
  apiKey: string;
  // Translation-specific settings
  translation: TranslationSettings;
  // Speech recognition settings
  speechRecognition: SpeechRecognitionSettings;
  // Image OCR settings
  imageOCR: ImageOCRSettings;
  // VLM (Vision Language Model) settings
  vlm: VLMSettings;
}

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1';
export const DASHSCOPE_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_INTL_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_OCR_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
export const DASHSCOPE_OCR_INTL_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
export const QWEN_OCR_MODELS = ['qwen3.5-ocr', 'qwen-vl-ocr-latest'] as const;

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
    outputMode: 'structured', // Default to structured output for better compatibility
  },
  speechRecognition: {
    provider: 'web-speech',
    endpoint: '',
    modelName: 'TeleAI/TeleSpeechASR', // Default model for AI Service
    enableRealtimeTranscription: true, // Enable by default
    localEngine: 'whisper',
    localModelPath: '',
    localAssetBaseUrl: '',
    vadMode: 'silero',
    senseVoiceLanguage: 'auto',
    senseVoiceUseItn: true,
    whisperLanguage: 'auto',
    whisperTask: 'transcribe',
    whisperModel: 'base', // Legacy whisper model
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
    useGeneralAI: true, // Default to using general AI
    useCustom: false,
    enableThinking: false, // Disable thinking mode by default
  },
};

const SETTINGS_KEY = 'tabitomo_ai_settings';

export const saveSettings = (settings: AISettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

const API_FORMAT_VALUES: readonly APIFormat[] = API_FORMAT_OPTIONS.map((option) => option.value);
const IMAGE_OCR_PROVIDERS: readonly ImageOCRSettings['provider'][] = ['local-ppocr', 'qwen', 'custom'];

const normalizeAPIFormat = (apiFormat?: string): APIFormat => (
  API_FORMAT_VALUES.includes(apiFormat as APIFormat)
    ? apiFormat as APIFormat
    : DEFAULT_SETTINGS.generalAI.apiFormat
);

const normalizeImageOCRSettings = (settings: ImageOCRSettings): ImageOCRSettings => ({
  ...settings,
  provider: IMAGE_OCR_PROVIDERS.includes(settings.provider)
    ? settings.provider
    : DEFAULT_SETTINGS.imageOCR.provider,
  localModel: 'ppocr-v5-mobile',
  modelName: settings.modelName?.trim() || DEFAULT_SETTINGS.imageOCR.modelName,
});

const SPEECH_PROVIDERS: readonly SpeechRecognitionProvider[] = ['web-speech', 'siliconflow', 'local'];
const LOCAL_ASR_ENGINES: readonly LocalAsrEngine[] = ['whisper', 'sensevoice'];
const LOCAL_VAD_MODES: readonly LocalVadMode[] = ['silero', 'energy', 'off'];
const SENSE_VOICE_LANGUAGES: readonly SenseVoiceLanguage[] = ['auto', 'zh', 'en', 'ja', 'ko', 'yue'];
const WHISPER_TASKS: readonly WhisperTask[] = ['transcribe', 'translate'];

type PartialSpeechRecognitionSettings = Partial<Omit<SpeechRecognitionSettings, 'provider'>> & {
  provider?: LegacySpeechRecognitionProvider | string;
};

export const normalizeSpeechRecognitionSettings = (
  settings?: PartialSpeechRecognitionSettings
): SpeechRecognitionSettings => {
  const incomingProvider = settings?.provider;
  const provider: SpeechRecognitionProvider = incomingProvider === 'local-whisper'
    ? 'local'
    : SPEECH_PROVIDERS.includes(incomingProvider as SpeechRecognitionProvider)
      ? incomingProvider as SpeechRecognitionProvider
      : DEFAULT_SETTINGS.speechRecognition.provider;

  const localEngine = LOCAL_ASR_ENGINES.includes(settings?.localEngine as LocalAsrEngine)
    ? settings?.localEngine as LocalAsrEngine
    : DEFAULT_SETTINGS.speechRecognition.localEngine;

  const vadMode = LOCAL_VAD_MODES.includes(settings?.vadMode as LocalVadMode)
    ? settings?.vadMode as LocalVadMode
    : DEFAULT_SETTINGS.speechRecognition.vadMode;

  const senseVoiceLanguage = SENSE_VOICE_LANGUAGES.includes(settings?.senseVoiceLanguage as SenseVoiceLanguage)
    ? settings?.senseVoiceLanguage as SenseVoiceLanguage
    : DEFAULT_SETTINGS.speechRecognition.senseVoiceLanguage;

  const whisperTask = WHISPER_TASKS.includes(settings?.whisperTask as WhisperTask)
    ? settings?.whisperTask as WhisperTask
    : DEFAULT_SETTINGS.speechRecognition.whisperTask;

  return {
    ...DEFAULT_SETTINGS.speechRecognition,
    ...(settings || {}),
    provider,
    localEngine,
    vadMode,
    senseVoiceLanguage,
    whisperTask,
  };
};

/**
 * Check if the model is Hunyuan-MT
 */
const isHunyuanMT = (modelName: string): boolean => {
  const normalized = modelName.toLowerCase();
  return normalized.includes('hunyuan-mt');
};

/**
 * Determine the appropriate output mode based on model
 */
const determineOutputMode = (settings: Partial<AISettings>): 'plain' | 'structured' => {
  // Check if user is using translation service or general AI
  const useTranslationService = !!(settings.apiKey && settings.endpoint && settings.modelName);
  const modelName = useTranslationService
    ? (settings.modelName || '')
    : (settings.generalAI?.modelName || '');

  // If model is Hunyuan-MT, use plain text mode
  if (isHunyuanMT(modelName)) {
    return 'plain';
  }

  // Otherwise, use structured mode (default)
  return 'structured';
};

export const loadSettings = (): AISettings | null => {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<AISettings>;

    // Determine output mode if not set
    const outputMode = parsed.translation?.outputMode || determineOutputMode(parsed);

    // Merge with default settings to ensure all properties exist
    const merged: AISettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      generalAI: {
        ...DEFAULT_SETTINGS.generalAI,
        ...(parsed.generalAI || {}),
        apiFormat: normalizeAPIFormat(parsed.generalAI?.apiFormat),
        modelName: parsed.generalAI?.modelName?.trim() || DEFAULT_SETTINGS.generalAI.modelName,
      },
      translation: {
        ...DEFAULT_SETTINGS.translation,
        ...(parsed.translation || {}),
        outputMode, // Use determined output mode
      },
      speechRecognition: {
        ...normalizeSpeechRecognitionSettings(parsed.speechRecognition as PartialSpeechRecognitionSettings | undefined),
      },
      imageOCR: {
        ...DEFAULT_SETTINGS.imageOCR,
        ...(parsed.imageOCR || {}),
      },
      vlm: {
        ...DEFAULT_SETTINGS.vlm,
        ...(parsed.vlm || {}),
      },
    };

    merged.imageOCR = normalizeImageOCRSettings(merged.imageOCR);
    merged.speechRecognition = normalizeSpeechRecognitionSettings(merged.speechRecognition);

    return merged;
  } catch {
    return null;
  }
};

export const hasSettings = (): boolean => {
  return loadSettings() !== null;
};

export const clearSettings = (): void => {
  localStorage.removeItem(SETTINGS_KEY);
};
