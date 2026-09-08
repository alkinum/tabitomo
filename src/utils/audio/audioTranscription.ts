import type { AISettings } from '../config/settings';
import { transcribeAudioFile } from '../../../packages/tabitomo-core/src/speech';

// Keep the legacy provider ID for existing exported configurations.
export function useSiliconFlowSpeech(settings: AISettings): boolean {
  return settings.speechRecognition.provider === 'siliconflow';
}

export function transcribeAudioSiliconFlow(audioBlob: Blob, settings: AISettings): Promise<string> {
  return transcribeAudioFile(audioBlob, settings);
}
