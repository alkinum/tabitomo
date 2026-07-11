import { AISettings } from '../config/settings';

/**
 * Check if the provider is a cloud OpenAI-compatible speech service.
 */
export function useSiliconFlowSpeech(settings: AISettings): boolean {
  return settings.speechRecognition.provider === 'siliconflow';
}

const appendPath = (endpoint: string, path: string): string => `${endpoint.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

const getSpeechApiKey = (settings: AISettings): string => (
  settings.speechRecognition.apiKey || settings.apiKey || settings.generalAI.apiKey
);

const getSpeechEndpoint = (settings: AISettings): string => (
  settings.speechRecognition.endpoint || settings.endpoint || settings.generalAI.endpoint
);

/**
 * Transcribe audio using an OpenAI-compatible audio transcription API.
 */
export async function transcribeAudioSiliconFlow(
  audioBlob: Blob,
  settings: AISettings
): Promise<string> {
  const apiKey = getSpeechApiKey(settings);
  const endpoint = getSpeechEndpoint(settings);
  if (!apiKey) {
    throw new Error('Speech API key is not configured');
  }
  if (!endpoint) {
    throw new Error('Speech API endpoint is not configured');
  }

  const formData = new FormData();
  // Use model from settings, fallback to default if not set
  const modelName = settings.speechRecognition.modelName || 'TeleAI/TeleSpeechASR';
  formData.append('model', modelName);
  formData.append('file', audioBlob, 'audio.webm');

  const response = await fetch(appendPath(endpoint, 'audio/transcriptions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Audio transcription failed: ${errorText}`);
  }

  const result = await response.json();
  return result.text || '';
}
