import { normalizeSettings, type AISettings } from './settings';

export const SETTINGS_SYNC_SCHEMA_VERSION = 2;

export type SettingsSyncGroup =
  | 'generalAI'
  | 'translation'
  | 'speechRecognition'
  | 'imageOCR'
  | 'vlm';

export const SETTINGS_SYNC_GROUPS: readonly SettingsSyncGroup[] = [
  'generalAI',
  'translation',
  'speechRecognition',
  'imageOCR',
  'vlm',
];

export interface SettingsSyncGroupMetadata {
  updatedAt: number;
}

export interface SettingsSyncSnapshot {
  version: typeof SETTINGS_SYNC_SCHEMA_VERSION;
  settings: AISettings;
  updatedAt: number;
  groups: Record<SettingsSyncGroup, SettingsSyncGroupMetadata>;
}

export interface SettingsSyncMergeResult {
  snapshot: SettingsSyncSnapshot;
  remoteGroups: SettingsSyncGroup[];
  localGroups: SettingsSyncGroup[];
  conflictedGroups: SettingsSyncGroup[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const groupValue = (settings: AISettings, group: SettingsSyncGroup): unknown => {
  if (group === 'translation') {
    return {
      provider: settings.provider,
      endpoint: settings.endpoint,
      modelName: settings.modelName,
      apiKey: settings.apiKey,
      translation: settings.translation,
    };
  }
  return settings[group];
};

const groupEquals = (left: AISettings, right: AISettings, group: SettingsSyncGroup): boolean => (
  JSON.stringify(groupValue(left, group)) === JSON.stringify(groupValue(right, group))
);

const applyGroup = (
  target: AISettings,
  source: AISettings,
  group: SettingsSyncGroup
): AISettings => {
  if (group === 'translation') {
    return {
      ...target,
      provider: source.provider,
      endpoint: source.endpoint,
      modelName: source.modelName,
      apiKey: source.apiKey,
      translation: clone(source.translation),
    };
  }
  return { ...target, [group]: clone(source[group]) };
};

const validTimestamp = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
);

export function createSettingsSyncSnapshot(
  settings: AISettings,
  updatedAt: number,
  previous?: SettingsSyncSnapshot | null
): SettingsSyncSnapshot {
  const normalized = normalizeSettings(settings);
  const timestamp = validTimestamp(updatedAt, Date.now());
  const groups = {} as SettingsSyncSnapshot['groups'];

  for (const group of SETTINGS_SYNC_GROUPS) {
    groups[group] = {
      updatedAt: previous && groupEquals(previous.settings, normalized, group)
        ? previous.groups[group].updatedAt
        : timestamp,
    };
  }

  return {
    version: SETTINGS_SYNC_SCHEMA_VERSION,
    settings: normalized,
    updatedAt: timestamp,
    groups,
  };
}

export function normalizeSettingsSyncSnapshot(
  value: unknown,
  fallbackUpdatedAt = 0
): SettingsSyncSnapshot | null {
  if (!isRecord(value)) return null;

  const isV2 = value.version === SETTINGS_SYNC_SCHEMA_VERSION
    && isRecord(value.settings)
    && isRecord(value.groups);
  const settingsValue = isRecord(value.settings) ? value.settings : value;
  const updatedAt = validTimestamp(value.updatedAt, fallbackUpdatedAt);
  const settings = normalizeSettings(settingsValue as Partial<AISettings>);
  const groups = {} as SettingsSyncSnapshot['groups'];

  for (const group of SETTINGS_SYNC_GROUPS) {
    const metadata = isV2 && isRecord(value.groups) && isRecord(value.groups[group])
      ? value.groups[group]
      : null;
    groups[group] = { updatedAt: validTimestamp(metadata?.updatedAt, updatedAt) };
  }

  return {
    version: SETTINGS_SYNC_SCHEMA_VERSION,
    settings,
    updatedAt,
    groups,
  };
}

export function mergeSettingsSyncSnapshots(
  local: SettingsSyncSnapshot,
  remote: SettingsSyncSnapshot
): SettingsSyncMergeResult {
  let settings = normalizeSettings(local.settings);
  const groups = {} as SettingsSyncSnapshot['groups'];
  const remoteGroups: SettingsSyncGroup[] = [];
  const localGroups: SettingsSyncGroup[] = [];
  const conflictedGroups: SettingsSyncGroup[] = [];

  for (const group of SETTINGS_SYNC_GROUPS) {
    const localUpdatedAt = local.groups[group].updatedAt;
    const remoteUpdatedAt = remote.groups[group].updatedAt;
    const differs = !groupEquals(local.settings, remote.settings, group);
    const useRemote = remoteUpdatedAt > localUpdatedAt;

    if (differs && remoteUpdatedAt === localUpdatedAt) conflictedGroups.push(group);
    if (useRemote) {
      settings = applyGroup(settings, remote.settings, group);
      remoteGroups.push(group);
    } else {
      localGroups.push(group);
    }
    groups[group] = { updatedAt: Math.max(localUpdatedAt, remoteUpdatedAt) };
  }

  return {
    snapshot: {
      version: SETTINGS_SYNC_SCHEMA_VERSION,
      settings: normalizeSettings(settings),
      updatedAt: Math.max(local.updatedAt, remote.updatedAt),
      groups,
    },
    remoteGroups,
    localGroups,
    conflictedGroups,
  };
}
