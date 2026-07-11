/**
 * Versioned Config Schema
 * Defines the structure of configuration with versioning for migration support
 */

import { schema, ObjectSchema, validateSchema as validateSchemaBase, applyDefaults } from './schema';
import { DASHSCOPE_OCR_ENDPOINT } from './settings';

// Re-export validation functions
export { validateSchemaBase as validateSchema, applyDefaults };

/**
 * Current schema version
 * Increment this when making breaking changes to the config structure
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Translation Config Schema
 */
export const translationSchema = {
  outputMode: schema.enum(['plain', 'structured'] as const, { default: 'structured' }),
};

/**
 * Speech Recognition Config Schema
 */
export const speechRecognitionSchema = {
  provider: schema.enum(['web-speech', 'siliconflow', 'local'] as const, {
    default: 'web-speech',
  }),
  endpoint: schema.string({ optional: true, default: '' }),
  apiKey: schema.string({ optional: true }),
  modelName: schema.string({ optional: true, default: 'TeleAI/TeleSpeechASR' }),
  enableRealtimeTranscription: schema.boolean({ optional: true, default: true }),
  localEngine: schema.enum(['whisper', 'sensevoice'] as const, {
    optional: true,
    default: 'whisper',
  }),
  localModelPath: schema.string({ optional: true, default: '' }),
  localAssetBaseUrl: schema.string({ optional: true, default: '' }),
  vadMode: schema.enum(['silero', 'energy', 'off'] as const, {
    optional: true,
    default: 'silero',
  }),
  senseVoiceLanguage: schema.enum(['auto', 'zh', 'en', 'ja', 'ko', 'yue'] as const, {
    optional: true,
    default: 'auto',
  }),
  senseVoiceUseItn: schema.boolean({ optional: true, default: true }),
  whisperLanguage: schema.string({ optional: true, default: 'auto' }),
  whisperTask: schema.enum(['transcribe', 'translate'] as const, {
    optional: true,
    default: 'transcribe',
  }),
  whisperModel: schema.enum(['tiny', 'base', 'small'] as const, {
    optional: true,
    default: 'base',
  }),
  whisperModelDownloaded: schema.boolean({ optional: true, default: false }),
};

/**
 * General AI Config Schema
 */
export const generalAISchema = {
  apiKey: schema.string({ default: '' }),
  endpoint: schema.string({ default: '' }),
  modelName: schema.string({ default: 'gpt-5.6-terra' }),
  apiFormat: schema.enum(['openai-chat', 'openai-responses', 'anthropic'] as const, { default: 'openai-chat' }),
};

/**
 * Image OCR Config Schema
 */
export const imageOCRSchema = {
  provider: schema.enum(['local-ppocr', 'qwen', 'custom'] as const, { default: 'local-ppocr' }),
  useGeneralAI: schema.boolean({ optional: true, default: false }),
  localModel: schema.enum(['ppocr-v5-mobile'] as const, { optional: true, default: 'ppocr-v5-mobile' }),
  apiKey: schema.string({ default: '' }),
  endpoint: schema.string({ default: DASHSCOPE_OCR_ENDPOINT }),
  modelName: schema.string({ optional: true, default: 'qwen3.5-ocr' }),
};

/**
 * VLM (Vision Language Model) Config Schema
 */
export const vlmSchema = {
  useGeneralAI: schema.boolean({ optional: true, default: true }),
  useCustom: schema.boolean({ default: false }),
  apiKey: schema.string({ optional: true }),
  endpoint: schema.string({ optional: true }),
  modelName: schema.string({ optional: true }),
  enableThinking: schema.boolean({ default: false }),
};

/**
 * Main AI Config Schema (v1)
 */
export const aiConfigSchemaV1 = {
  // Schema version for migration tracking
  _version: schema.number({ optional: true, default: CURRENT_SCHEMA_VERSION }),

  // General AI service (fallback for all features)
  generalAI: schema.object(generalAISchema),

  // Legacy text translation config (deprecated, kept for backward compatibility)
  provider: schema.enum(['openai', 'custom'] as const, { default: 'openai' }),
  endpoint: schema.string({ default: '' }),
  modelName: schema.string({ default: '' }),
  apiKey: schema.string({ default: '' }),

  // Translation config
  translation: schema.object(translationSchema),

  // Speech recognition config
  speechRecognition: schema.object(speechRecognitionSchema),

  // Image OCR config
  imageOCR: schema.object(imageOCRSchema),

  // VLM config
  vlm: schema.object(vlmSchema),
};

/**
 * Type inference from schema
 */
export type AIConfigV1 = {
  _version?: number;
  generalAI: {
    apiKey: string;
    endpoint: string;
    modelName: string;
    apiFormat?: 'openai-chat' | 'openai-responses' | 'anthropic';
  };
  provider: 'openai' | 'custom';
  endpoint: string;
  modelName: string;
  apiKey: string;
  translation: {
    outputMode: 'plain' | 'structured';
  };
  speechRecognition: {
    provider: 'web-speech' | 'siliconflow' | 'local';
    endpoint?: string;
    apiKey?: string;
    modelName?: string;
    enableRealtimeTranscription?: boolean;
    localEngine?: 'whisper' | 'sensevoice';
    localModelPath?: string;
    localAssetBaseUrl?: string;
    vadMode?: 'silero' | 'energy' | 'off';
    senseVoiceLanguage?: 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'yue';
    senseVoiceUseItn?: boolean;
    whisperLanguage?: string;
    whisperTask?: 'transcribe' | 'translate';
    whisperModel?: 'tiny' | 'base' | 'small';
    whisperModelDownloaded?: boolean;
  };
  imageOCR: {
    provider: 'local-ppocr' | 'qwen' | 'custom';
    useGeneralAI?: boolean;
    localModel?: 'ppocr-v5-mobile';
    apiKey: string;
    endpoint: string;
    modelName?: string;
  };
  vlm: {
    useGeneralAI?: boolean;
    useCustom: boolean;
    apiKey?: string;
    endpoint?: string;
    modelName?: string;
    enableThinking: boolean;
  };
};

/**
 * Versioned config container
 * All exported config will be wrapped in this structure
 */
export interface VersionedConfig {
  version: number;
  config: AIConfigV1; // or future versions
  exportedAt: string; // ISO timestamp
  appVersion?: string; // App version that exported this config
}

/**
 * Get the appropriate schema for a given version
 */
export function getSchemaForVersion(version: number): ObjectSchema {
  switch (version) {
    case 1:
      return aiConfigSchemaV1;
    default:
      throw new Error(`Unsupported schema version: ${version}`);
  }
}
