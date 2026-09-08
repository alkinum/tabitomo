import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export type NativeLocalModelId = 'whisper-base' | 'sensevoice-small' | 'ppocr-v6-small';

export interface NativeLocalASROptions {
  language?: string;
  task?: 'transcribe' | 'translate';
  useInverseTextNormalization?: boolean;
}

export interface NativeLocalASRResult {
  text: string;
  runtime: 'sherpa-onnx-ios';
  modelId: 'whisper-base' | 'sensevoice-small';
  durationMs: number;
}

export interface NativeLocalOCRTextLocation {
  text: string;
  confidence: number;
  location: [number, number, number, number, number, number, number, number];
  rotate_rect: [number, number, number, number, number];
}

export interface NativeLocalOCRResult {
  items: NativeLocalOCRTextLocation[];
  runtime: 'onnxruntime-mobile';
  modelId: 'ppocr-v6-small';
  durationMs: number;
}

export interface NativeLocalModelValidationResult {
  modelId: NativeLocalModelId;
  runtime: 'sherpa-onnx-ios' | 'onnxruntime-mobile';
  valid: true;
}

export class TabitomoNativeLocalModelsModule extends NativeModule {
  isAvailableAsync!: () => Promise<boolean>;
  validateModelPackAsync!: (
    modelId: NativeLocalModelId,
    modelRootUri: string
  ) => Promise<NativeLocalModelValidationResult>;
  transcribeAudioAsync!: (
    audioUri: string,
    modelId: 'whisper-base' | 'sensevoice-small',
    modelRootUri: string,
    options: NativeLocalASROptions
  ) => Promise<NativeLocalASRResult>;
  recognizeTextAsync!: (
    imageUri: string,
    modelId: 'ppocr-v6-small',
    modelRootUri: string
  ) => Promise<NativeLocalOCRResult>;
  unloadModelAsync!: (modelId: NativeLocalModelId, modelRootUri: string) => Promise<void>;
}

export default requireOptionalNativeModule<TabitomoNativeLocalModelsModule>('TabitomoNativeLocalModels');
