import { isLocalProviderEndpoint, type AISettings } from './settings';

export interface NativeAudioFile {
  uri: string;
  name: string;
  type: string;
}

const appendPath = (endpoint: string, path: string): string => `${endpoint.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

/** Reuse a credential only when its configured base URL matches the speech service. */
export function getSpeechConnection(settings: AISettings) {
  const endpoint = (settings.speechRecognition.endpoint || settings.endpoint || settings.generalAI.endpoint).trim();
  const sameEndpoint = (candidate: string) => candidate.trim().replace(/\/+$/, '') === endpoint.replace(/\/+$/, '');
  const apiKey = settings.speechRecognition.apiKey?.trim()
    || (sameEndpoint(settings.endpoint) ? settings.apiKey.trim() : '')
    || (sameEndpoint(settings.generalAI.endpoint) ? settings.generalAI.apiKey.trim() : '');
  return { endpoint, apiKey, modelName: settings.speechRecognition.modelName?.trim() || '' };
}

export async function transcribeAudioFile(
  file: Blob | NativeAudioFile,
  settings: AISettings,
  abortSignal?: AbortSignal
): Promise<string> {
  if (settings.speechRecognition.provider === 'local') {
    throw new Error('Local ASR must be handled by the platform native layer before calling cloud transcription.');
  }

  const { apiKey, endpoint, modelName } = getSpeechConnection(settings);
  if (!endpoint) throw new Error('Speech API endpoint is not configured');
  if (!apiKey && !isLocalProviderEndpoint(endpoint)) throw new Error('Speech API key is not configured');
  if (!modelName) throw new Error('Speech model is not configured');

  const formData = new FormData();
  formData.append('model', modelName);
  if (file instanceof Blob) formData.append('file', file, 'name' in file && typeof file.name === 'string' ? file.name : file.type.includes('wav') ? 'audio.wav' : 'audio.webm');
  else formData.append('file', file as never);

  const response = await fetch(appendPath(endpoint, 'audio/transcriptions'), {
    method: 'POST',
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    body: formData,
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Audio transcription failed: ${await response.text()}`);
  }

  const result = await response.json() as { text?: string };
  return result.text || '';
}
