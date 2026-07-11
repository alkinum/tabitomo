import TabitomoNativeCloudKitModule, {
  type NativeCloudKitAccountStatus,
  type NativeCloudKitSettingsSnapshot,
} from './TabitomoNativeCloudKitModule';

export type {
  NativeCloudKitAccountStatus,
  NativeCloudKitSettingsSnapshot,
} from './TabitomoNativeCloudKitModule';

export function isNativeCloudKitModuleAvailable(): boolean {
  return Boolean(TabitomoNativeCloudKitModule);
}

export async function getCloudKitAccountStatusAsync(): Promise<NativeCloudKitAccountStatus> {
  return await TabitomoNativeCloudKitModule?.getAccountStatusAsync() ?? 'could-not-determine';
}

export async function loadCloudKitSettingsAsync(): Promise<NativeCloudKitSettingsSnapshot | null> {
  return await TabitomoNativeCloudKitModule?.loadSettingsAsync() ?? null;
}

export async function saveCloudKitSettingsAsync(
  payload: string,
  updatedAt: number
): Promise<NativeCloudKitSettingsSnapshot> {
  if (!TabitomoNativeCloudKitModule) {
    throw new Error('Native iOS CloudKit module is not available in this build.');
  }
  return TabitomoNativeCloudKitModule.saveSettingsAsync(payload, updatedAt);
}

export async function deleteCloudKitSettingsAsync(): Promise<boolean> {
  return await TabitomoNativeCloudKitModule?.deleteSettingsAsync() ?? false;
}
