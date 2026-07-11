import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes, utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { AISettings } from './settings';
import { normalizeSettings } from './settings';

const CURRENT_SCHEMA_VERSION = 1;
const APP_VERSION = '0.1.0';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

type UnknownRecord = Record<string, unknown>;

export interface VersionedConfig {
  version: number;
  config: AISettings & { _version?: number };
  exportedAt: string;
  appVersion?: string;
}

export function wrapConfigForExport(config: AISettings): VersionedConfig {
  return {
    version: CURRENT_SCHEMA_VERSION,
    config: {
      ...normalizeSettings(config),
      _version: CURRENT_SCHEMA_VERSION,
    },
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    output += BASE64_ALPHABET[(triplet >> 18) & 63];
    output += BASE64_ALPHABET[(triplet >> 12) & 63];
    output += BASE64_ALPHABET[(triplet >> 6) & 63];
    output += BASE64_ALPHABET[triplet & 63];
  }

  if (i < bytes.length) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const triplet = (a << 16) | (b << 8);
    output += BASE64_ALPHABET[(triplet >> 18) & 63];
    output += BASE64_ALPHABET[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? BASE64_ALPHABET[(triplet >> 6) & 63] : '=';
    output += '=';
  }

  return output;
}

function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/\s/g, '');
  if (clean.length % 4 !== 0) {
    throw new Error('Invalid encrypted config payload.');
  }

  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    const values = [...chunk].map((char) => {
      if (char === '=') return 0;
      const index = BASE64_ALPHABET.indexOf(char);
      if (index < 0) {
        throw new Error('Invalid encrypted config payload.');
      }
      return index;
    });

    const triplet = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    bytes.push((triplet >> 16) & 255);
    if (chunk[2] !== '=') bytes.push((triplet >> 8) & 255);
    if (chunk[3] !== '=') bytes.push(triplet & 255);
  }

  return Uint8Array.from(bytes);
}

async function deriveConfigKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (!password) {
    throw new Error('Password is required.');
  }

  return pbkdf2Async(sha256, utf8ToBytes(password), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
    asyncTick: 20,
  });
}

export async function encryptConfig(config: AISettings, password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveConfigKey(password, salt);
  const plaintext = utf8ToBytes(JSON.stringify(wrapConfigForExport(config)));
  const ciphertext = gcm(key, iv).encrypt(plaintext);

  const combined = new Uint8Array(salt.length + iv.length + ciphertext.length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(ciphertext, salt.length + iv.length);
  return bytesToBase64(combined);
}

function isVersionedConfig(data: unknown): data is VersionedConfig {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const record = data as UnknownRecord;
  return typeof record.version === 'number' && typeof record.config === 'object' && record.config !== null;
}

export async function decryptConfig(encryptedData: string, password: string): Promise<AISettings> {
  const combined = base64ToBytes(encryptedData);
  if (combined.length <= SALT_LENGTH + IV_LENGTH) {
    throw new Error('Invalid encrypted config payload.');
  }

  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
  const key = await deriveConfigKey(password, salt);

  let plaintext: Uint8Array;
  try {
    plaintext = gcm(key, iv).decrypt(ciphertext);
  } catch {
    throw new Error('Invalid password or corrupted config.');
  }

  const parsed = JSON.parse(bytesToUtf8(plaintext)) as unknown;
  if (isVersionedConfig(parsed)) {
    return normalizeSettings(parsed.config);
  }
  return normalizeSettings(parsed as Partial<AISettings>);
}

export function normalizeEncryptedConfigPayload(payload: string): string {
  return payload.trim().replace(/^tabitomo-config:/, '').trim();
}

export async function importConfigPayload(payload: string, password: string): Promise<AISettings> {
  return decryptConfig(normalizeEncryptedConfigPayload(payload), password);
}

export async function exportConfigPayload(config: AISettings, password: string): Promise<string> {
  return encryptConfig(config, password);
}
