import type { AISettings } from '../config/settings';
import { transcribeAudioFile } from '../../../packages/tabitomo-core/src/speech';

export function transcribeCloudAudio(audioBlob: Blob, settings: AISettings, signal?: AbortSignal): Promise<string> {
  return transcribeAudioFile(audioBlob, settings, signal);
}
