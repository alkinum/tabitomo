import TabitomoNativeVisionModule, {
  type NativeOCRTextLocation,
} from './TabitomoNativeVisionModule';

export type { NativeOCRTextLocation } from './TabitomoNativeVisionModule';

export function isNativeVisionModuleAvailable(): boolean {
  return Boolean(TabitomoNativeVisionModule);
}

export async function isNativeVisionAvailableAsync(): Promise<boolean> {
  return Boolean(await TabitomoNativeVisionModule?.isAvailableAsync());
}

export async function recognizeTextInImageAsync(
  imageUri: string,
  recognitionLanguages: string[] = []
): Promise<NativeOCRTextLocation[]> {
  if (!TabitomoNativeVisionModule) {
    throw new Error('Native iOS Vision OCR module is not available in this build.');
  }

  return TabitomoNativeVisionModule.recognizeTextAsync(imageUri, recognitionLanguages);
}
