import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export interface NativeSpeechResultEvent {
  text: string;
  isFinal: boolean;
}

export interface NativeSpeechErrorEvent {
  message: string;
}

export interface NativeSpeechStateEvent {
  state: 'idle' | 'recording';
}

export interface NativeSpeechAuthorization {
  status: 'authorized' | 'denied' | 'restricted' | 'notDetermined' | 'unknown';
  granted: boolean;
}

export interface NativeSpeechStopResult {
  text: string;
}

export type TabitomoNativeSpeechEvents = {
  onSpeechResult: (event: NativeSpeechResultEvent) => void;
  onSpeechError: (event: NativeSpeechErrorEvent) => void;
  onSpeechState: (event: NativeSpeechStateEvent) => void;
};

export class TabitomoNativeSpeechModule extends NativeModule<TabitomoNativeSpeechEvents> {
  isAvailableAsync!: (localeIdentifier?: string) => Promise<boolean>;
  isOnDeviceAvailableAsync!: (localeIdentifier?: string) => Promise<boolean>;
  requestAuthorizationAsync!: () => Promise<NativeSpeechAuthorization>;
  startRecognitionAsync!: (
    localeIdentifier?: string,
    requiresOnDeviceRecognition?: boolean
  ) => Promise<void>;
  stopRecognitionAsync!: () => Promise<NativeSpeechStopResult>;
  cancelRecognitionAsync!: () => Promise<void>;
}

export default requireOptionalNativeModule<TabitomoNativeSpeechModule>('TabitomoNativeSpeech');
