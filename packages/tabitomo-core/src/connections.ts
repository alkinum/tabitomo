import type { GeneralAISettings } from './settings';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1';

export interface AvailableModel { id: string; label: string; vision: boolean | undefined }
/** Discovery is explicit; keys are sent only to the endpoint the user selected. */
export async function fetchAvailableModels(config: GeneralAISettings, signal?: AbortSignal): Promise<AvailableModel[]> {
  const url = new URL(config.endpoint.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter a valid HTTP or HTTPS provider endpoint.');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`;
  url.search = ''; url.hash = '';
  const headers: Record<string, string> = {};
  if (config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  if (config.apiFormat === 'anthropic') {
    delete headers.Authorization;
    headers['x-api-key'] = config.apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  const response = await fetch(url.toString(), { headers, signal });
  if (!response.ok) throw new Error(`Could not load models (${response.status}). You can enter a model ID manually.`);
  const payload = await response.json() as { data?: Array<{ id?: unknown; name?: string; display_name?: string; architecture?: { input_modalities?: string[] } }> };
  if (!Array.isArray(payload.data)) throw new Error('This provider does not list models. Enter a model ID manually.');
  return payload.data.filter((m) => m && typeof m.id === 'string' && m.id.trim()).map((m) => ({
    id: m.id as string,
    label: typeof m.name === 'string' && m.name.trim() ? m.name : typeof m.display_name === 'string' && m.display_name.trim() ? m.display_name : m.id as string,
    vision: Array.isArray(m.architecture?.input_modalities) ? m.architecture.input_modalities.includes('image') : undefined,
  })).sort((a, b) => a.label.localeCompare(b.label));
}
