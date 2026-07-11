import type { AISettings } from './settings';

export interface NativeAudioFile {
  uri: string;
  name: string;
  type: string;
}

const appendPath = (endpoint: string, path: string): string => `${endpoint.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

const getSpeechApiKey = (settings: AISettings): string => settings.speechRecognition.apiKey || settings.apiKey || settings.generalAI.apiKey;

const getSpeechEndpoint = (settings: AISettings): string => (
  settings.speechRecognition.endpoint || settings.endpoint || settings.generalAI.endpoint
);

export async function transcribeAudioFile(
  file: Blob | NativeAudioFile,
  settings: AISettings,
  abortSignal?: AbortSignal
): Promise<string> {
  if (settings.speechRecognition.provider === 'local') {
    throw new Error('Local ASR must be handled by the platform native layer before calling cloud transcription.');
  }

  const apiKey = getSpeechApiKey(settings);
  const endpoint = getSpeechEndpoint(settings);
  const modelName = settings.speechRecognition.modelName || 'TeleAI/TeleSpeechASR';

  if (!apiKey) {
    throw new Error('Speech API key is not configured');
  }
  if (!endpoint) {
    throw new Error('Speech API endpoint is not configured');
  }

  const formData = new FormData();
  formData.append('model', modelName);
  formData.append('file', file as never);

  const response = await fetch(appendPath(endpoint, 'audio/transcriptions'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Audio transcription failed: ${await response.text()}`);
  }

  const result = await response.json() as { text?: string };
  return result.text || '';
}
