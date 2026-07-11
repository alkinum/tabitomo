/**
 * Config Migration System
 * Handles upgrading config from older versions to the current schema
 */

import { AIConfigV1, CURRENT_SCHEMA_VERSION } from './configSchema';

/**
 * Unknown record type for untyped data
 */
type UnknownRecord = Record<string, unknown>;

type SpeechProvider = 'web-speech' | 'siliconflow' | 'local';
type LocalAsrEngine = 'whisper' | 'sensevoice';
type LocalVadMode = 'silero' | 'energy' | 'off';
type SenseVoiceLanguage = 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'yue';
type WhisperTask = 'transcribe' | 'translate';

const normalizeSpeechProvider = (provider: unknown): SpeechProvider => {
  if (provider === 'local-whisper') return 'local';
  if (provider === 'web-speech' || provider === 'siliconflow' || provider === 'local') {
    return provider;
  }
  return 'web-speech';
};

const normalizeEnum = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => (
  values.includes(value as T) ? value as T : fallback
);

const normalizeSpeechRecognitionConfig = (speechRecognition: unknown): AIConfigV1['speechRecognition'] => {
  const oldSpeechRecognition = (speechRecognition as UnknownRecord | undefined) || {};

  return {
    provider: normalizeSpeechProvider(oldSpeechRecognition.provider),
    modelName: (oldSpeechRecognition.modelName as string | undefined) || 'TeleAI/TeleSpeechASR',
    enableRealtimeTranscription: (oldSpeechRecognition.enableRealtimeTranscription as boolean | undefined) ?? true,
    localEngine: normalizeEnum<LocalAsrEngine>(oldSpeechRecognition.localEngine, ['whisper', 'sensevoice'], 'whisper'),
    localModelPath: (oldSpeechRecognition.localModelPath as string | undefined) || '',
    localAssetBaseUrl: (oldSpeechRecognition.localAssetBaseUrl as string | undefined) || '',
    vadMode: normalizeEnum<LocalVadMode>(oldSpeechRecognition.vadMode, ['silero', 'energy', 'off'], 'silero'),
    senseVoiceLanguage: normalizeEnum<SenseVoiceLanguage>(oldSpeechRecognition.senseVoiceLanguage, ['auto', 'zh', 'en', 'ja', 'ko', 'yue'], 'auto'),
    senseVoiceUseItn: (oldSpeechRecognition.senseVoiceUseItn as boolean | undefined) ?? true,
    whisperLanguage: (oldSpeechRecognition.whisperLanguage as string | undefined) || 'auto',
    whisperTask: normalizeEnum<WhisperTask>(oldSpeechRecognition.whisperTask, ['transcribe', 'translate'], 'transcribe'),
    whisperModel: (oldSpeechRecognition.whisperModel as 'tiny' | 'base' | 'small' | undefined) || 'base',
    whisperModelDownloaded: (oldSpeechRecognition.whisperModelDownloaded as boolean | undefined) ?? false,
    ...(oldSpeechRecognition.apiKey !== undefined && { apiKey: oldSpeechRecognition.apiKey as string }),
  };
};

const normalizeCurrentConfig = (config: UnknownRecord): AIConfigV1 => ({
  ...(config as AIConfigV1),
  _version: CURRENT_SCHEMA_VERSION,
  speechRecognition: normalizeSpeechRecognitionConfig(config.speechRecognition),
});

/**
 * Migration function type
 * Takes config from version N and migrates to version N+1
 */
export type MigrationFn<TFrom = UnknownRecord, TTo = UnknownRecord> = (oldConfig: TFrom) => TTo;

/**
 * Migration metadata
 */
export interface Migration<TFrom = UnknownRecord, TTo = UnknownRecord> {
  fromVersion: number;
  toVersion: number;
  description: string;
  migrate: MigrationFn<TFrom, TTo>;
}

/**
 * Migration from v0 (no version) to v1
 * Handles legacy configs that don't have a version field
 */
const migrateV0ToV1: Migration<UnknownRecord, AIConfigV1> = {
  fromVersion: 0,
  toVersion: 1,
  description: 'Initial versioning - adds _version field and ensures all required fields exist',
  migrate: (oldConfig: UnknownRecord): AIConfigV1 => {
    const oldGeneralAI = (oldConfig.generalAI as UnknownRecord | undefined) || {};
    const oldTranslation = (oldConfig.translation as UnknownRecord | undefined) || {};
    const oldImageOCR = (oldConfig.imageOCR as UnknownRecord | undefined) || {};
    const oldVlm = (oldConfig.vlm as UnknownRecord | undefined) || {};

    return {
      ...oldConfig,
      _version: 1,
      // Ensure generalAI exists
      generalAI: {
        apiKey: (oldGeneralAI.apiKey as string | undefined) || '',
        endpoint: (oldGeneralAI.endpoint as string | undefined) || '',
        modelName: (oldGeneralAI.modelName as string | undefined) || 'gpt-5.6-terra',
      },
      // Ensure translation exists with defaults
      translation: {
        outputMode: (oldTranslation.outputMode as 'plain' | 'structured' | undefined) || 'structured',
      },
      // Ensure speechRecognition exists with defaults
      speechRecognition: normalizeSpeechRecognitionConfig(oldConfig.speechRecognition),
      // Ensure imageOCR exists with defaults
      imageOCR: {
        provider: (oldImageOCR.provider as 'qwen' | 'custom' | undefined) || 'qwen',
        useGeneralAI: (oldImageOCR.useGeneralAI as boolean | undefined) ?? false,
        localModel: 'ppocr-v5-mobile',
        apiKey: (oldImageOCR.apiKey as string | undefined) || '',
        endpoint: (oldImageOCR.endpoint as string | undefined) || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        modelName: (oldImageOCR.modelName as string | undefined) || 'qwen3.5-ocr',
      },
      // Ensure vlm exists with defaults
      vlm: {
        useGeneralAI: (oldVlm.useGeneralAI as boolean | undefined) ?? true,
        useCustom: (oldVlm.useCustom as boolean | undefined) ?? false,
        enableThinking: (oldVlm.enableThinking as boolean | undefined) ?? false,
        ...(oldVlm.apiKey !== undefined && { apiKey: oldVlm.apiKey as string }),
        ...(oldVlm.endpoint !== undefined && { endpoint: oldVlm.endpoint as string }),
        ...(oldVlm.modelName !== undefined && { modelName: oldVlm.modelName as string }),
      },
      // Preserve legacy fields
      provider: (oldConfig.provider as 'openai' | 'custom' | undefined) || 'openai',
      endpoint: (oldConfig.endpoint as string | undefined) || '',
      modelName: (oldConfig.modelName as string | undefined) || '',
      apiKey: (oldConfig.apiKey as string | undefined) || '',
    };
  },
};

/**
 * Example migration for future schema changes
 * This shows how to add new migrations when you update the schema
 */
/*
const migrateV1ToV2: Migration<AIConfigV1, AIConfigV2> = {
  fromVersion: 1,
  toVersion: 2,
  description: 'Add new feature X config',
  migrate: (oldConfig: AIConfigV1): AIConfigV2 => {
    return {
      ...oldConfig,
      _version: 2,
      // Add new fields with defaults
      newFeature: {
        enabled: false,
        option: 'default',
      },
      // Transform existing fields if needed
      speechRecognition: {
        ...oldConfig.speechRecognition,
        // Add new speech recognition options
        newOption: 'value',
      },
    };
  },
};
*/

/**
 * Registry of all migrations, ordered by version
 * Add new migrations here when creating new schema versions
 */
export const MIGRATIONS: Migration[] = [
  migrateV0ToV1,
  // Future migrations go here:
  // migrateV1ToV2,
  // migrateV2ToV3,
  // etc.
];

/**
 * Get the version of a config object
 * Returns 0 if no version field exists (legacy config)
 */
export function getConfigVersion(config: UnknownRecord): number {
  const version = config._version;
  return typeof version === 'number' ? version : 0;
}

/**
 * Migrate config from any version to the current version
 * Applies all necessary migrations in sequence
 */
export function migrateConfig(config: UnknownRecord): AIConfigV1 {
  let currentVersion = getConfigVersion(config);
  let migratedConfig: UnknownRecord = { ...config };

  // If already at current version, return as-is
  if (currentVersion === CURRENT_SCHEMA_VERSION) {
    return normalizeCurrentConfig(migratedConfig);
  }

  // If version is higher than current, this is from a newer version
  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Config version ${currentVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}. ` +
      `Please update the application to import this config.`
    );
  }

  // Apply migrations sequentially
  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.find(m => m.fromVersion === currentVersion);

    if (!migration) {
      throw new Error(
        `No migration path found from version ${currentVersion} to ${CURRENT_SCHEMA_VERSION}. ` +
        `This config may be corrupted or from an incompatible version.`
      );
    }

    console.log(`Migrating config: ${migration.description}`);
    migratedConfig = migration.migrate(migratedConfig);
    currentVersion = migration.toVersion;
  }

  return normalizeCurrentConfig(migratedConfig);
}

/**
 * Validate that all required migrations exist
 * Should be called during app initialization to catch migration gaps early
 */
export function validateMigrationChain(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for gaps in migration chain
  for (let version = 0; version < CURRENT_SCHEMA_VERSION; version++) {
    const migration = MIGRATIONS.find(m => m.fromVersion === version);
    if (!migration) {
      errors.push(`Missing migration from version ${version} to ${version + 1}`);
    } else if (migration.toVersion !== version + 1) {
      errors.push(
        `Invalid migration: expected version ${version + 1}, got ${migration.toVersion}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get a human-readable migration history
 * Shows what changes would be applied to migrate from a given version
 */
export function getMigrationHistory(fromVersion: number): string[] {
  const history: string[] = [];
  let version = fromVersion;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.find(m => m.fromVersion === version);
    if (migration) {
      history.push(`v${migration.fromVersion} → v${migration.toVersion}: ${migration.description}`);
      version = migration.toVersion;
    } else {
      break;
    }
  }

  return history;
}
