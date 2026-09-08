import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, test } from 'node:test';
import { createOpenRouterSession, exchangeOpenRouterCode, fetchAvailableModels, OPENROUTER_ENDPOINT } from './connections';
import { DEFAULT_SETTINGS, hasProviderConnection, isLocalProviderEndpoint, normalizeSettings } from './settings';
import { getOCRMode, selectOCRMode } from './inputOptions';
import { exportConfigPayload, importConfigPayload } from './configExport';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('OpenRouter authorization uses random S256 PKCE and never exposes its verifier in the URL', () => {
  const session = createOpenRouterSession();
  const url = new URL(session.url);
  assert.equal(url.origin, 'https://openrouter.ai');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(session.verifier).digest('base64url'));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.has('callback_url'), false);
  assert.equal(session.url.includes(session.verifier), false);
  assert.match(session.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(session.verifier, createOpenRouterSession().verifier);
});

test('authorization exchanges only a nonexpired code with the fixed OpenRouter endpoint', async () => {
  let calls = 0;
  const session = createOpenRouterSession();
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, `${OPENROUTER_ENDPOINT}/auth/keys`);
    assert.deepEqual(JSON.parse(String(init?.body)), { code: 'one-time-code', code_verifier: session.verifier, code_challenge_method: 'S256' });
    return Response.json({ key: 'returned-key' });
  };
  await assert.rejects(exchangeOpenRouterCode(session, ' '), /Paste/);
  await assert.rejects(exchangeOpenRouterCode({ ...session, createdAt: Date.now() - 601_000 }, 'code'), /expired/);
  assert.equal(calls, 0);
  assert.equal(await exchangeOpenRouterCode(session, ' one-time-code '), 'returned-key');
  assert.equal(calls, 1);
  globalThis.fetch = async () => new Response('secret-key-and-code', { status: 400 });
  await assert.rejects(exchangeOpenRouterCode(session, 'code'), (error: Error) => !error.message.includes('secret-key') && error.message.includes('400'));
});

test('model discovery filters malformed entries, preserves unknown capabilities, and targets the selected service', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://models.example/v1/models');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer my-key');
    return Response.json({ data: [null, { id: 5 }, { id: 'text', name: 6 }, { id: 'vision', name: 'A vision', architecture: { input_modalities: ['text', 'image'] } }, { id: 'unknown', architecture: { input_modalities: 'image' } }] });
  };
  const models = await fetchAvailableModels({ ...DEFAULT_SETTINGS.generalAI, endpoint: 'https://models.example/v1/?ignored=yes', apiKey: 'my-key' });
  assert.equal(models.length, 3);
  assert.equal(models.find((m) => m.id === 'vision')?.vision, true);
  assert.equal(models.find((m) => m.id === 'unknown')?.vision, undefined);
  assert.equal(models.find((m) => m.id === 'text')?.label, 'text');
});

test('local HTTP services accept a blank key only with an explicit model and trusted local address', () => {
  for (const endpoint of ['http://localhost:1234/v1', 'http://192.168.1.5:11434/v1', 'http://[::1]:8080/v1']) {
    assert.equal(hasProviderConnection({ endpoint, modelName: 'local-model' }), true);
  }
  for (const endpoint of ['https://public.example/v1', 'http://localhost.evil.test/v1', 'file:///tmp/model', 'http://user:pass@localhost:1234/v1']) {
    assert.equal(isLocalProviderEndpoint(endpoint), false);
    assert.equal(hasProviderConnection({ endpoint, modelName: 'model' }), false);
  }
  assert.equal(hasProviderConnection({ endpoint: 'http://localhost:1234/v1' }), false);
});

test('custom OCR and blank cloud defaults survive encrypted cross-platform config round trips', async () => {
  assert.equal(DEFAULT_SETTINGS.speechRecognition.modelName, '');
  assert.equal(DEFAULT_SETTINGS.generalAI.modelName, '');
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, imageOCR: { ...selectOCRMode(DEFAULT_SETTINGS, 'custom'), endpoint: 'http://192.168.1.5:1234/v1', modelName: 'my-vision' } });
  const restored = await importConfigPayload(await exportConfigPayload(settings, 'test-password'), 'test-password');
  assert.equal(getOCRMode(restored.imageOCR), 'custom');
  assert.equal(restored.imageOCR.modelName, 'my-vision');
  assert.equal(restored.imageOCR.apiKey, '');
  assert.equal(getOCRMode(selectOCRMode(settings, 'general')), 'general');
});
