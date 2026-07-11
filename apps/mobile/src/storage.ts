import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  deleteCloudKitSettingsAsync,
  getCloudKitAccountStatusAsync,
  isNativeCloudKitModuleAvailable,
  loadCloudKitSettingsAsync,
  saveCloudKitSettingsAsync,
  type NativeCloudKitAccountStatus,
} from '@tabitomo/native-cloudkit';
import {
  createModelPackStorageSnapshot,
  createSettingsSyncSnapshot,
  mergeSettingsSyncSnapshots,
  normalizeModelPackStorageSnapshot,
  normalizeSettings,
  normalizeSettingsSyncSnapshot,
  type AISettings,
  type InstalledModelPack,
  type SettingsSyncSnapshot,
} from '@tabitomo/core';

const SETTINGS_KEY = 'tabitomo.mobile.settings.v1';
const SETTINGS_SYNC_ENABLED_KEY = 'tabitomo.mobile.icloud-sync-enabled.v1';
const MODEL_PACKS_KEY = 'tabitomo.mobile.model-packs.v1';
const MODEL_PACKS_FILE_NAME = 'tabitomo-mobile-model-packs.v1.json';

export type MobileSettingsSyncState = 'synced' | 'ready' | 'disabled' | 'local-only' | 'unavailable' | 'error';

export interface MobileSettingsSyncStatus {
  state: MobileSettingsSyncState;
  detail: string;
  lastSyncedAt?: number;
}

let mobileSettingsSyncStatus: MobileSettingsSyncStatus = {
  state: Platform.OS === 'ios' ? 'ready' : 'unavailable',
  detail: Platform.OS === 'ios'
    ? 'iCloud sync is enabled by default.'
    : 'iCloud settings sync is available in the iOS app.',
};
let mobileSettingsSyncEnabled = true;

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function loadMobileSettings(): Promise<AISettings | null> {
  const localSnapshot = parseStoredSettingsSnapshot(await readLocalSettings());

  if (Platform.OS !== 'ios') {
    return localSnapshot?.settings ?? null;
  }

  mobileSettingsSyncEnabled = await loadMobileSettingsSyncEnabled();
  if (!mobileSettingsSyncEnabled) {
    setSyncStatus('disabled', 'iCloud sync is off. Settings stay on this device.');
    return localSnapshot?.settings ?? null;
  }

  try {
    if (!isNativeCloudKitModuleAvailable()) {
      setSyncStatus('local-only', 'iCloud sync will be available in a native iOS build.');
      return localSnapshot?.settings ?? null;
    }

    const accountStatus = await getCloudKitAccountStatusAsync();
    if (accountStatus !== 'available') {
      setSyncStatus('local-only', cloudKitAccountDetail(accountStatus));
      return localSnapshot?.settings ?? null;
    }

    const cloudSnapshot = await loadCloudKitSettingsAsync();
    const parsedCloudSnapshot = cloudSnapshot
      ? parseSettingsPayload(cloudSnapshot.payload, cloudSnapshot.updatedAt)
      : null;

    if (cloudSnapshot && !parsedCloudSnapshot) {
      if (localSnapshot) {
        const repairedAt = Math.max(Date.now(), localSnapshot.updatedAt, cloudSnapshot.updatedAt + 1);
        const repairedLocalSnapshot = { ...localSnapshot, updatedAt: repairedAt };
        const repairedCloudSnapshot = await saveCloudKitSettingsAsync(
          JSON.stringify(repairedLocalSnapshot),
          repairedAt
        );
        setSyncStatus('synced', 'Restored the iCloud settings copy from this device.', repairedCloudSnapshot.updatedAt);
      } else {
        setSyncStatus('error', 'The iCloud settings copy could not be read. Local settings remain unchanged.');
      }
      return localSnapshot?.settings ?? null;
    }

    if (localSnapshot && parsedCloudSnapshot) {
      const merged = mergeSettingsSyncSnapshots(localSnapshot, parsedCloudSnapshot);
      const mergedAt = Math.max(localSnapshot.updatedAt, cloudSnapshot?.updatedAt || 0, Date.now());
      const mergedSnapshot = { ...merged.snapshot, updatedAt: mergedAt };
      await writeLocalSettingsSnapshot(mergedSnapshot);

      const cloudNeedsMerge = JSON.stringify(mergedSnapshot.settings)
        !== JSON.stringify(parsedCloudSnapshot.settings);
      if (cloudNeedsMerge || merged.conflictedGroups.length > 0) {
        const saved = await saveCloudKitSettingsAsync(JSON.stringify(mergedSnapshot), mergedAt);
        setSyncStatus('synced', 'Settings were merged and synced with iCloud.', saved.updatedAt);
      } else {
        setSyncStatus('synced', 'Settings are up to date in iCloud.', mergedAt);
      }
      return mergedSnapshot.settings;
    }

    if (localSnapshot) {
      const savedSnapshot = await saveCloudKitSettingsAsync(JSON.stringify(localSnapshot), localSnapshot.updatedAt);
      setSyncStatus('synced', 'Uploaded settings to iCloud.', savedSnapshot.updatedAt);
    } else if (parsedCloudSnapshot) {
      await writeLocalSettingsSnapshot(parsedCloudSnapshot);
      setSyncStatus('synced', 'Loaded settings from iCloud.', cloudSnapshot?.updatedAt);
      return parsedCloudSnapshot.settings;
    } else {
      setSyncStatus('ready', 'iCloud sync is ready. Settings will sync after the first save.');
    }

    return localSnapshot?.settings ?? null;
  } catch (error) {
    setSyncStatus('error', cloudKitErrorDetail(error));
    return localSnapshot?.settings ?? null;
  }
}

export async function saveMobileSettings(settings: AISettings): Promise<AISettings> {
  const normalized = normalizeSettings(settings);
  const updatedAt = Date.now();
  const previousSnapshot = parseStoredSettingsSnapshot(await readLocalSettings());
  const snapshot = createSettingsSyncSnapshot(normalized, updatedAt, previousSnapshot);

  await writeLocalSettingsSnapshot(snapshot);

  if (Platform.OS !== 'ios') {
    return normalized;
  }

  mobileSettingsSyncEnabled = await loadMobileSettingsSyncEnabled();
  if (!mobileSettingsSyncEnabled) {
    setSyncStatus('disabled', 'Saved on this device. iCloud sync is off.');
    return normalized;
  }

  try {
    if (!isNativeCloudKitModuleAvailable()) {
      setSyncStatus('local-only', 'Saved locally. iCloud sync requires a native iOS build.');
      return normalized;
    }

    const accountStatus = await getCloudKitAccountStatusAsync();
    if (accountStatus !== 'available') {
      setSyncStatus('local-only', cloudKitAccountDetail(accountStatus));
      return normalized;
    }

    const savedSnapshot = await saveCloudKitSettingsAsync(JSON.stringify(snapshot), updatedAt);
    if (savedSnapshot.updatedAt > updatedAt) {
      const newerCloudSnapshot = parseSettingsPayload(savedSnapshot.payload, savedSnapshot.updatedAt);
      if (newerCloudSnapshot) {
        const merged = mergeSettingsSyncSnapshots(snapshot, newerCloudSnapshot);
        const mergeUpdatedAt = Math.max(Date.now(), savedSnapshot.updatedAt + 1);
        const mergedSnapshot = { ...merged.snapshot, updatedAt: mergeUpdatedAt };
        await writeLocalSettingsSnapshot(mergedSnapshot);
        await saveCloudKitSettingsAsync(JSON.stringify(mergedSnapshot), mergeUpdatedAt);
        setSyncStatus('synced', 'Concurrent changes were merged and synced with iCloud.', mergeUpdatedAt);
        return mergedSnapshot.settings;
      }
    }
    setSyncStatus('synced', 'Settings saved locally and synced to iCloud.', savedSnapshot.updatedAt);
  } catch (error) {
    setSyncStatus('error', `Saved locally. ${cloudKitErrorDetail(error)}`);
  }
  return normalized;
}

export async function deleteMobileSettings(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(SETTINGS_KEY);
  } else {
    await SecureStore.deleteItemAsync(SETTINGS_KEY, secureStoreOptions);
  }

  mobileSettingsSyncEnabled = await loadMobileSettingsSyncEnabled();
  if (Platform.OS === 'ios' && mobileSettingsSyncEnabled && isNativeCloudKitModuleAvailable()) {
    try {
      await deleteCloudKitSettingsAsync();
      setSyncStatus('ready', 'Local and iCloud settings were removed.');
    } catch (error) {
      setSyncStatus('error', cloudKitErrorDetail(error));
    }
  }
}

export function getMobileSettingsSyncStatus(): MobileSettingsSyncStatus {
  return mobileSettingsSyncStatus;
}

export function getMobileSettingsSyncEnabled(): boolean {
  return mobileSettingsSyncEnabled;
}

export async function loadMobileSettingsSyncEnabled(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const stored = await SecureStore.getItemAsync(SETTINGS_SYNC_ENABLED_KEY, secureStoreOptions);
  return stored !== 'false';
}

export async function setMobileSettingsSyncEnabled(enabled: boolean): Promise<void> {
  mobileSettingsSyncEnabled = enabled;
  if (Platform.OS === 'ios') {
    await SecureStore.setItemAsync(SETTINGS_SYNC_ENABLED_KEY, enabled ? 'true' : 'false', secureStoreOptions);
  }
  if (enabled) {
    setSyncStatus('ready', 'iCloud sync is enabled and ready.');
  } else {
    setSyncStatus('disabled', 'iCloud sync is off. Settings stay on this device.');
  }
}

export async function refreshMobileSettingsSyncStatus(): Promise<MobileSettingsSyncStatus> {
  if (Platform.OS !== 'ios') {
    setSyncStatus('unavailable', 'iCloud settings sync is available in the iOS app.');
    return mobileSettingsSyncStatus;
  }
  mobileSettingsSyncEnabled = await loadMobileSettingsSyncEnabled();
  if (!mobileSettingsSyncEnabled) {
    setSyncStatus('disabled', 'iCloud sync is off. Settings stay on this device.');
    return mobileSettingsSyncStatus;
  }
  if (!isNativeCloudKitModuleAvailable()) {
    setSyncStatus('local-only', 'iCloud sync will be available in a native iOS build.');
    return mobileSettingsSyncStatus;
  }

  try {
    const accountStatus = await getCloudKitAccountStatusAsync();
    if (accountStatus === 'available') {
      if (mobileSettingsSyncStatus.state !== 'synced') {
        setSyncStatus('ready', 'iCloud sync is enabled and ready.');
      }
    } else {
      setSyncStatus('local-only', cloudKitAccountDetail(accountStatus));
    }
  } catch (error) {
    setSyncStatus('error', cloudKitErrorDetail(error));
  }
  return mobileSettingsSyncStatus;
}

async function readLocalSettings(): Promise<string | null> {
  return Platform.OS === 'web'
    ? globalThis.localStorage?.getItem(SETTINGS_KEY) ?? null
    : await SecureStore.getItemAsync(SETTINGS_KEY, secureStoreOptions);
}

async function writeLocalSettingsSnapshot(snapshot: SettingsSyncSnapshot): Promise<void> {
  const serialized = JSON.stringify(snapshot);
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(SETTINGS_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(SETTINGS_KEY, serialized, secureStoreOptions);
}

function parseStoredSettingsSnapshot(stored: string | null): SettingsSyncSnapshot | null {
  if (!stored) {
    return null;
  }
  try {
    const parsed = JSON.parse(stored) as unknown;
    return normalizeSettingsSyncSnapshot(parsed, 0);
  } catch {
    return null;
  }
}

function parseSettingsPayload(payload: string, fallbackUpdatedAt: number): SettingsSyncSnapshot | null {
  try {
    return normalizeSettingsSyncSnapshot(JSON.parse(payload) as unknown, fallbackUpdatedAt);
  } catch {
    return null;
  }
}

function setSyncStatus(
  state: MobileSettingsSyncState,
  detail: string,
  lastSyncedAt?: number
): void {
  mobileSettingsSyncStatus = { state, detail, lastSyncedAt };
}

function cloudKitAccountDetail(status: NativeCloudKitAccountStatus): string {
  switch (status) {
    case 'no-account':
      return 'Saved locally. Sign in to iCloud to sync settings.';
    case 'restricted':
      return 'Saved locally. iCloud access is restricted on this device.';
    case 'temporarily-unavailable':
      return 'Saved locally. iCloud is temporarily unavailable.';
    default:
      return 'Saved locally. iCloud account status could not be determined.';
  }
}

function cloudKitErrorDetail(error: unknown): string {
  const detail = error instanceof Error ? error.message : 'iCloud sync failed.';
  return detail.replace(/CloudKit/gi, 'iCloud');
}

export async function loadInstalledModelPacks(): Promise<InstalledModelPack[]> {
  const stored = Platform.OS === 'web'
    ? globalThis.localStorage?.getItem(MODEL_PACKS_KEY) ?? null
    : await readModelPacksFile();
  if (!stored) {
    return [];
  }

  try {
    return normalizeModelPackStorageSnapshot(JSON.parse(stored)).installed;
  } catch {
    return [];
  }
}

export async function saveInstalledModelPacks(installed: readonly InstalledModelPack[]): Promise<void> {
  const serialized = JSON.stringify(createModelPackStorageSnapshot(installed));

  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(MODEL_PACKS_KEY, serialized);
    return;
  }

  writeModelPacksFile(serialized);
}

async function readModelPacksFile(): Promise<string | null> {
  const file = new File(Paths.document, MODEL_PACKS_FILE_NAME);
  if (!file.exists) {
    return null;
  }
  return file.text();
}

function writeModelPacksFile(serialized: string): void {
  const file = new File(Paths.document, MODEL_PACKS_FILE_NAME);
  file.create({ overwrite: true });
  file.write(serialized);
}
