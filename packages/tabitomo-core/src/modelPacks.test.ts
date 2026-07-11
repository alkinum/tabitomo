import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MODEL_PACK_MANIFEST_SCHEMA_VERSION,
  assertModelPackFileIntegrity,
  assertSafeModelPackFileName,
  createInstalledModelPack,
  createModelPackStorageSnapshot,
  evaluateInstalledModelPackCompatibility,
  formatModelPackBytes,
  getInstalledModelPackBytes,
  getModelPackFileBytes,
  getModelPackKey,
  normalizeInstalledModelPack,
  normalizeModelPackManifest,
  normalizeModelPackStorageSnapshot,
  replaceInstalledModelPack,
  selectModelPackActivation,
  sha256Hex,
  type InstalledModelPack,
} from './modelPacks';

const manifestPack = {
  id: 'asr-whisper-base-ja-en',
  feature: 'asr',
  runtime: 'whisper-cpp-coreml',
  version: '2026.07.1',
  minAppVersion: '0.1.0',
  minIOS: '17.0',
  bytes: 145000000,
  license: 'TBD',
  label: 'Whisper base JA/EN',
  files: [
    {
      name: 'model.bin',
      url: 'https://example.com/models/model.bin',
      sha256: 'ABCDEF',
      bytes: 145000000,
    },
  ],
};

test('normalizeModelPackManifest validates and normalizes model packs', () => {
  const manifest = normalizeModelPackManifest({
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    packs: [manifestPack],
  });

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.packs.length, 1);
  assert.equal(manifest.packs[0].id, 'asr-whisper-base-ja-en');
  assert.equal(manifest.packs[0].runtime, 'whisper-cpp-coreml');
  assert.equal(manifest.packs[0].files[0].sha256, 'abcdef');
  assert.equal(getModelPackKey(manifest.packs[0]), 'asr-whisper-base-ja-en@2026.07.1');
  assert.equal(getModelPackFileBytes(manifest.packs[0]), 145000000);
});

test('normalizeModelPackManifest rejects unsupported schema and duplicate packs', () => {
  assert.throws(
    () => normalizeModelPackManifest({ schemaVersion: 99, packs: [] }),
    /Unsupported model pack manifest schema version/
  );

  assert.throws(
    () => normalizeModelPackManifest({
      schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
      packs: [manifestPack, manifestPack],
    }),
    /duplicate pack/
  );
});

test('normalizeModelPackManifest rejects duplicate files within a pack', () => {
  assert.throws(
    () => normalizeModelPackManifest({
      schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
      packs: [{
        ...manifestPack,
        files: [
          manifestPack.files[0],
          {
            ...manifestPack.files[0],
            url: 'https://example.com/models/model-copy.bin',
          },
        ],
      }],
    }),
    /duplicate file/
  );
});

test('normalizeModelPackManifest rejects mismatched total bytes', () => {
  assert.throws(
    () => normalizeModelPackManifest({
      schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
      packs: [{
        ...manifestPack,
        bytes: manifestPack.bytes + 1,
      }],
    }),
    /total bytes/
  );
});

test('normalizeModelPackManifest rejects unsafe model-pack file names', () => {
  for (const name of ['../model.bin', 'models/model.bin', 'models\\model.bin', 'model..bin', '.']) {
    assert.throws(
      () => normalizeModelPackManifest({
        schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
        packs: [{
          ...manifestPack,
          files: [{
            ...manifestPack.files[0],
            name,
          }],
        }],
      }),
      /file name/
    );
  }

  assert.doesNotThrow(() => assertSafeModelPackFileName('model.bin'));
});

test('normalizeModelPackStorageSnapshot normalizes installed pack metadata', () => {
  const installedPack: InstalledModelPack = {
    id: 'ocr-ppocr-mobile',
    feature: 'ocr',
    runtime: 'onnxruntime-mobile',
    version: '2026.07.1',
    installedAt: '2026-07-09T00:00:00.000Z',
    rootUri: 'file:///models/ocr-ppocr-mobile/2026.07.1',
    bytes: 42000000,
    license: 'TBD',
    manifestSha256: 'AABBCC',
    files: [
      {
        name: 'det.onnx',
        uri: 'file:///models/ocr-ppocr-mobile/2026.07.1/det.onnx',
        sha256: 'DDEEFF',
        bytes: 12000000,
      },
    ],
  };

  const snapshot = createModelPackStorageSnapshot([installedPack, installedPack]);

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.installed.length, 1);
  assert.equal(snapshot.installed[0].minIOS, undefined);
  assert.equal(snapshot.installed[0].manifestSha256, 'aabbcc');
  assert.equal(snapshot.installed[0].files[0].sha256, 'ddeeff');
  assert.equal(getInstalledModelPackBytes(snapshot.installed), 42000000);

  assert.deepEqual(normalizeModelPackStorageSnapshot(null), {
    schemaVersion: 1,
    installed: [],
  });
});

test('assertModelPackFileIntegrity validates bytes and SHA-256', () => {
  const bytes = new TextEncoder().encode('hello');
  const file = {
    name: 'hello.txt',
    url: 'https://example.com/hello.txt',
    sha256: sha256Hex(bytes),
    bytes: bytes.byteLength,
  };

  assert.doesNotThrow(() => assertModelPackFileIntegrity(file, bytes));
  assert.throws(
    () => assertModelPackFileIntegrity({ ...file, bytes: 99 }, bytes),
    /expected 99/
  );
  assert.throws(
    () => assertModelPackFileIntegrity({ ...file, sha256: '00' }, bytes),
    /failed checksum/
  );
});

test('createInstalledModelPack builds normalized installed metadata', () => {
  const [pack] = normalizeModelPackManifest({
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    packs: [manifestPack],
  }).packs;
  const installed = createInstalledModelPack(
    pack,
    'file:///models/asr-whisper-base-ja-en/2026.07.1',
    [{
      name: 'model.bin',
      uri: 'file:///models/asr-whisper-base-ja-en/2026.07.1/model.bin',
      sha256: manifestPack.files[0].sha256,
      bytes: manifestPack.files[0].bytes,
    }],
    '2026-07-09T00:00:00.000Z',
    'ABC123'
  );

  assert.equal(installed.id, pack.id);
  assert.equal(installed.minAppVersion, '0.1.0');
  assert.equal(installed.minIOS, '17.0');
  assert.equal(installed.label, 'Whisper base JA/EN');
  assert.equal(installed.rootUri, 'file:///models/asr-whisper-base-ja-en/2026.07.1');
  assert.equal(installed.bytes, manifestPack.files[0].bytes);
  assert.equal(installed.manifestSha256, 'abc123');
  assert.deepEqual(replaceInstalledModelPack([installed], {
    ...installed,
    installedAt: '2026-07-10T00:00:00.000Z',
  }).map((item) => item.installedAt), ['2026-07-10T00:00:00.000Z']);
});

test('createInstalledModelPack rejects installed metadata that does not match the manifest', () => {
  const [pack] = normalizeModelPackManifest({
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    packs: [manifestPack],
  }).packs;
  const installedFile = {
    name: 'model.bin',
    uri: 'file:///models/asr-whisper-base-ja-en/2026.07.1/model.bin',
    sha256: manifestPack.files[0].sha256,
    bytes: manifestPack.files[0].bytes,
  };

  assert.throws(
    () => createInstalledModelPack(
      pack,
      'file:///models/asr-whisper-base-ja-en/2026.07.1',
      [],
      '2026-07-09T00:00:00.000Z'
    ),
    /missing file/
  );

  assert.throws(
    () => createInstalledModelPack(
      pack,
      'file:///models/asr-whisper-base-ja-en/2026.07.1',
      [{ ...installedFile, bytes: installedFile.bytes - 1 }],
      '2026-07-09T00:00:00.000Z'
    ),
    /mismatched byte/
  );

  assert.throws(
    () => createInstalledModelPack(
      pack,
      'file:///models/asr-whisper-base-ja-en/2026.07.1',
      [{ ...installedFile, name: 'extra.bin' }],
      '2026-07-09T00:00:00.000Z'
    ),
    /missing file/
  );
});

test('evaluateInstalledModelPackCompatibility gates installed packs', () => {
  const [pack] = normalizeModelPackManifest({
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    packs: [manifestPack],
  }).packs;
  const installed = createInstalledModelPack(
    pack,
    'file:///models/asr-whisper-base-ja-en/2026.07.1',
    [{
      name: 'model.bin',
      uri: 'file:///models/asr-whisper-base-ja-en/2026.07.1/model.bin',
      sha256: manifestPack.files[0].sha256,
      bytes: manifestPack.files[0].bytes,
    }],
    '2026-07-09T00:00:00.000Z'
  );

  assert.deepEqual(evaluateInstalledModelPackCompatibility(installed, {
    platform: 'ios',
    iosVersion: '17.0',
    appVersion: '0.1.0',
    availableRuntimes: ['whisper-cpp-coreml'],
  }), {
    status: 'ready',
    canActivate: true,
    reason: 'Ready in this build.',
  });

  assert.equal(evaluateInstalledModelPackCompatibility(installed, {
    platform: 'ios',
    iosVersion: '16.7',
    appVersion: '0.1.0',
    availableRuntimes: ['whisper-cpp-coreml'],
  }).status, 'unsupported-ios');

  assert.equal(evaluateInstalledModelPackCompatibility(installed, {
    platform: 'ios',
    iosVersion: '17.0',
    appVersion: '0.0.9',
    availableRuntimes: ['whisper-cpp-coreml'],
  }).status, 'unsupported-app-version');

  assert.equal(evaluateInstalledModelPackCompatibility(installed, {
    platform: 'ios',
    iosVersion: '17.0',
    appVersion: '0.1.0',
    availableRuntimes: ['apple-speech'],
  }).status, 'needs-runtime');

  assert.equal(evaluateInstalledModelPackCompatibility(installed, {
    platform: 'web',
    appVersion: '0.1.0',
    availableRuntimes: [],
  }).status, 'unsupported-platform');

  assert.equal(evaluateInstalledModelPackCompatibility({
    ...installed,
    bytes: 0,
    files: [],
  }, {
    platform: 'ios',
    iosVersion: '17.0',
    appVersion: '0.1.0',
    availableRuntimes: ['whisper-cpp-coreml'],
  }).status, 'invalid-install');
});

test('selectModelPackActivation prefers the newest ready installed pack', () => {
  const manifest = normalizeModelPackManifest({
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    packs: [
      manifestPack,
      {
        ...manifestPack,
        id: 'asr-whisper-base-ja-en-newer',
        version: '2026.07.2',
      },
    ],
  });
  const installed = manifest.packs.map((pack, index) => createInstalledModelPack(
    pack,
    `file:///models/${pack.id}/${pack.version}`,
    [{
      name: 'model.bin',
      uri: `file:///models/${pack.id}/${pack.version}/model.bin`,
      sha256: pack.files[0].sha256,
      bytes: pack.files[0].bytes,
    }],
    `2026-07-0${index + 1}T00:00:00.000Z`
  ));

  const activation = selectModelPackActivation(installed, {
    platform: 'ios',
    iosVersion: '17.0',
    appVersion: '0.1.0',
    availableRuntimes: ['whisper-cpp-coreml', 'apple-speech'],
  }, 'asr', 'apple-speech');

  assert.equal(activation.status, 'installed-pack');
  assert.equal(activation.pack?.id, 'asr-whisper-base-ja-en-newer');
  assert.equal(activation.runtime, 'whisper-cpp-coreml');
});

test('selectModelPackActivation falls back to native baseline when custom packs are not ready', () => {
  const [pack] = normalizeModelPackManifest({
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    packs: [manifestPack],
  }).packs;
  const installed = createInstalledModelPack(
    pack,
    'file:///models/asr-whisper-base-ja-en/2026.07.1',
    [{
      name: 'model.bin',
      uri: 'file:///models/asr-whisper-base-ja-en/2026.07.1/model.bin',
      sha256: pack.files[0].sha256,
      bytes: pack.files[0].bytes,
    }],
    '2026-07-09T00:00:00.000Z'
  );

  const activation = selectModelPackActivation([installed], {
    platform: 'ios',
    iosVersion: '17.0',
    appVersion: '0.1.0',
    availableRuntimes: ['apple-speech'],
  }, 'asr', 'apple-speech');

  assert.equal(activation.status, 'native-baseline');
  assert.equal(activation.runtime, 'apple-speech');
  assert.equal(activation.pack, null);
});

test('selectModelPackActivation reports incompatible installed packs without a baseline', () => {
  const [pack] = normalizeModelPackManifest({
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    packs: [manifestPack],
  }).packs;
  const installed = createInstalledModelPack(
    pack,
    'file:///models/asr-whisper-base-ja-en/2026.07.1',
    [{
      name: 'model.bin',
      uri: 'file:///models/asr-whisper-base-ja-en/2026.07.1/model.bin',
      sha256: pack.files[0].sha256,
      bytes: pack.files[0].bytes,
    }],
    '2026-07-09T00:00:00.000Z'
  );

  const activation = selectModelPackActivation([installed], {
    platform: 'ios',
    iosVersion: '17.0',
    appVersion: '0.1.0',
    availableRuntimes: ['apple-vision'],
  }, 'asr');

  assert.equal(activation.status, 'no-compatible-pack');
  assert.equal(activation.compatibility?.status, 'needs-runtime');
  assert.match(activation.reason, /none ready/);
});

test('selectModelPackActivation reports missing baseline and pack', () => {
  const activation = selectModelPackActivation([], {
    platform: 'web',
    appVersion: '0.1.0',
    availableRuntimes: [],
  }, 'ocr', 'apple-vision');

  assert.equal(activation.status, 'no-baseline');
  assert.equal(activation.runtime, 'apple-vision');
  assert.equal(activation.pack, null);
});

test('runtime-specific model packs require every inference file before activation', () => {
  const baseEnvironment = {
    platform: 'ios' as const,
    iosVersion: '17.0',
    appVersion: '0.1.0',
    availableRuntimes: ['sherpa-onnx-ios', 'onnxruntime-mobile'] as const,
  };
  const common = {
    version: '1',
    installedAt: '2026-07-11T00:00:00.000Z',
    rootUri: 'file:///models/runtime',
    bytes: 1,
    license: 'MIT',
  };

  const whisper = normalizeInstalledModelPack({
    ...common,
    id: 'whisper-base',
    feature: 'asr',
    runtime: 'sherpa-onnx-ios',
    files: [
      { name: 'base-encoder.int8.onnx', uri: 'file:///encoder', sha256: 'a', bytes: 1 },
      { name: 'base-decoder.int8.onnx', uri: 'file:///decoder', sha256: 'b', bytes: 1 },
    ],
  });
  assert.deepEqual(evaluateInstalledModelPackCompatibility(whisper, baseEnvironment), {
    status: 'invalid-install',
    canActivate: false,
    reason: 'Missing runtime file: base-tokens.txt.',
  });

  const ppocr = normalizeInstalledModelPack({
    ...common,
    id: 'ppocr-v5-mobile',
    feature: 'ocr',
    runtime: 'onnxruntime-mobile',
    files: [
      { name: 'det.onnx', uri: 'file:///det', sha256: 'a', bytes: 1 },
      { name: 'rec.onnx', uri: 'file:///rec', sha256: 'b', bytes: 1 },
    ],
  });
  assert.deepEqual(evaluateInstalledModelPackCompatibility(ppocr, baseEnvironment), {
    status: 'invalid-install',
    canActivate: false,
    reason: 'Missing runtime file: dict.txt.',
  });
});

test('formatModelPackBytes formats user-facing model sizes', () => {
  assert.equal(formatModelPackBytes(0), '0 B');
  assert.equal(formatModelPackBytes(512), '512 B');
  assert.equal(formatModelPackBytes(1536), '1.5 KB');
  assert.equal(formatModelPackBytes(12 * 1024 * 1024), '12 MB');
  assert.equal(formatModelPackBytes(512 * 1024 * 1024), '512 MB');
});
