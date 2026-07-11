import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export interface NativeOCRTextLocation {
  text: string;
  location?: [number, number, number, number, number, number, number, number];
  rotate_rect?: [number, number, number, number, number];
}

export class TabitomoNativeVisionModule extends NativeModule {
  isAvailableAsync!: () => Promise<boolean>;
  recognizeTextAsync!: (
    imageUri: string,
    recognitionLanguages: string[]
  ) => Promise<NativeOCRTextLocation[]>;
}

export default requireOptionalNativeModule<TabitomoNativeVisionModule>('TabitomoNativeVision');
