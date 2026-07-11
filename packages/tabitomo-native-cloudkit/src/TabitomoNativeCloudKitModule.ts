import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export type NativeCloudKitAccountStatus =
  | 'available'
  | 'no-account'
  | 'restricted'
  | 'temporarily-unavailable'
  | 'could-not-determine';

export interface NativeCloudKitSettingsSnapshot {
  payload: string;
  updatedAt: number;
}

export class TabitomoNativeCloudKitModule extends NativeModule {
  getAccountStatusAsync!: () => Promise<NativeCloudKitAccountStatus>;
  loadSettingsAsync!: () => Promise<NativeCloudKitSettingsSnapshot | null>;
  saveSettingsAsync!: (payload: string, updatedAt: number) => Promise<NativeCloudKitSettingsSnapshot>;
  deleteSettingsAsync!: () => Promise<boolean>;
}

export default requireOptionalNativeModule<TabitomoNativeCloudKitModule>('TabitomoNativeCloudKit');
