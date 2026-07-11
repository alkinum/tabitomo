import type { EventSubscription } from 'expo-modules-core';
import TabitomoNativeSpeechModule, {
  type NativeSpeechAuthorization,
  type NativeSpeechErrorEvent,
  type NativeSpeechResultEvent,
  type NativeSpeechStateEvent,
  type NativeSpeechStopResult,
} from './TabitomoNativeSpeechModule';

export type {
  NativeSpeechAuthorization,
  NativeSpeechErrorEvent,
  NativeSpeechResultEvent,
  NativeSpeechStateEvent,
  NativeSpeechStopResult,
} from './TabitomoNativeSpeechModule';

const unavailableAuthorization: NativeSpeechAuthorization = {
  status: 'unknown',
  granted: false,
};

export function isNativeSpeechModuleAvailable(): boolean {
  return Boolean(TabitomoNativeSpeechModule);
}

export async function isNativeSpeechAvailableAsync(localeIdentifier?: string): Promise<boolean> {
  return Boolean(await TabitomoNativeSpeechModule?.isAvailableAsync(localeIdentifier));
}

export async function isNativeOnDeviceSpeechAvailableAsync(localeIdentifier?: string): Promise<boolean> {
  return Boolean(await TabitomoNativeSpeechModule?.isOnDeviceAvailableAsync(localeIdentifier));
}

export async function requestNativeSpeechAuthorizationAsync(): Promise<NativeSpeechAuthorization> {
  return await TabitomoNativeSpeechModule?.requestAuthorizationAsync() ?? unavailableAuthorization;
}

export async function startNativeSpeechRecognitionAsync(
  localeIdentifier?: string,
  requiresOnDeviceRecognition = false
): Promise<void> {
  if (!TabitomoNativeSpeechModule) {
    throw new Error('Native iOS speech recognition module is not available in this build.');
  }
  await TabitomoNativeSpeechModule.startRecognitionAsync(localeIdentifier, requiresOnDeviceRecognition);
}

export async function stopNativeSpeechRecognitionAsync(): Promise<NativeSpeechStopResult> {
  if (!TabitomoNativeSpeechModule) {
    throw new Error('Native iOS speech recognition module is not available in this build.');
  }
  return TabitomoNativeSpeechModule.stopRecognitionAsync();
}

export async function cancelNativeSpeechRecognitionAsync(): Promise<void> {
  await TabitomoNativeSpeechModule?.cancelRecognitionAsync();
}

export function addNativeSpeechResultListener(
  listener: (event: NativeSpeechResultEvent) => void
): EventSubscription | null {
  return TabitomoNativeSpeechModule?.addListener('onSpeechResult', listener) ?? null;
}

export function addNativeSpeechErrorListener(
  listener: (event: NativeSpeechErrorEvent) => void
): EventSubscription | null {
  return TabitomoNativeSpeechModule?.addListener('onSpeechError', listener) ?? null;
}

export function addNativeSpeechStateListener(
  listener: (event: NativeSpeechStateEvent) => void
): EventSubscription | null {
  return TabitomoNativeSpeechModule?.addListener('onSpeechState', listener) ?? null;
}
