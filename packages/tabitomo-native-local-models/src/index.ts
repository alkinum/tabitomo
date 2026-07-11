import TabitomoNativeLocalModelsModule, {
  type NativeLocalASROptions,
  type NativeLocalASRResult,
  type NativeLocalModelId,
  type NativeLocalModelValidationResult,
  type NativeLocalOCRResult,
} from './TabitomoNativeLocalModelsModule';

export type {
  NativeLocalASROptions,
  NativeLocalASRResult,
  NativeLocalModelId,
  NativeLocalModelValidationResult,
  NativeLocalOCRResult,
  NativeLocalOCRTextLocation,
} from './TabitomoNativeLocalModelsModule';

export function isNativeLocalModelsModuleAvailable(): boolean {
  return Boolean(TabitomoNativeLocalModelsModule);
}

export async function isNativeLocalModelsAvailableAsync(): Promise<boolean> {
  return Boolean(await TabitomoNativeLocalModelsModule?.isAvailableAsync());
}

export async function validateNativeLocalModelPackAsync(
  modelId: NativeLocalModelId,
  modelRootUri: string
): Promise<NativeLocalModelValidationResult> {
  if (!TabitomoNativeLocalModelsModule) {
    throw new Error('Native local-model runtime is not available in this build.');
  }
  return TabitomoNativeLocalModelsModule.validateModelPackAsync(modelId, modelRootUri);
}

export async function transcribeWithNativeLocalModelAsync(
  audioUri: string,
  modelId: 'whisper-base' | 'sensevoice-small',
  modelRootUri: string,
  options: NativeLocalASROptions = {}
): Promise<NativeLocalASRResult> {
  if (!TabitomoNativeLocalModelsModule) {
    throw new Error('Native offline speech runtime is not available in this build.');
  }
  return TabitomoNativeLocalModelsModule.transcribeAudioAsync(audioUri, modelId, modelRootUri, options);
}

export async function recognizeTextWithNativePPOCRAsync(
  imageUri: string,
  modelRootUri: string
): Promise<NativeLocalOCRResult> {
  if (!TabitomoNativeLocalModelsModule) {
    throw new Error('Native PP-OCR runtime is not available in this build.');
  }
  return TabitomoNativeLocalModelsModule.recognizeTextAsync(imageUri, modelRootUri);
}

export async function unloadNativeLocalModelAsync(
  modelId: NativeLocalModelId,
  modelRootUri: string
): Promise<void> {
  await TabitomoNativeLocalModelsModule?.unloadModelAsync(modelId, modelRootUri);
}
