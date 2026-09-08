import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { GeneralAISettings } from './settings';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1';
export interface OpenRouterSession { verifier: string; createdAt: number; url: string }
const base64url = (bytes: Uint8Array): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '', buffer = 0, bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) { bits -= 6; result += alphabet[(buffer >>> bits) & 63]; }
  }
  if (bits) result += alphabet[(buffer << (6 - bits)) & 63];
  return result;
};

/** Official no-callback PKCE flow. The verifier stays in memory on this device. */
export function createOpenRouterSession(now = Date.now()): OpenRouterSession {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(sha256(utf8ToBytes(verifier)));
  const params = new URLSearchParams({ code_challenge: challenge, code_challenge_method: 'S256', key_label: 'tabitomo' });
  return { verifier, createdAt: now, url: `https://openrouter.ai/auth?${params}` };
}

export async function exchangeOpenRouterCode(session: OpenRouterSession, code: string, signal?: AbortSignal): Promise<string> {
  if (Date.now() - session.createdAt > 10 * 60_000) throw new Error('Authorization expired. Connect to OpenRouter again.');
  if (!code.trim()) throw new Error('Paste the authorization code from OpenRouter.');
  const response = await fetch(`${OPENROUTER_ENDPOINT}/auth/keys`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ code: code.trim(), code_verifier: session.verifier, code_challenge_method: 'S256' }),
  });
  // Never include credential-bearing provider responses in an error or log.
  if (!response.ok) throw new Error(`OpenRouter authorization failed (${response.status}). Try connecting again.`);
  const payload = await response.json() as { key?: unknown };
  if (typeof payload.key !== 'string' || !payload.key.trim()) throw new Error('OpenRouter did not return an API key. Try again.');
  return payload.key;
}

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
