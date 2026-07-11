const ASSET_ORIGIN = 'https://assets.tabitomo.alkinum.io';
const MODELS = [
  {
    id: 'whisper-base',
    feature: 'asr',
    runtime: 'sherpa-onnx-ios',
    requiredFiles: ['base-encoder.int8.onnx', 'base-decoder.int8.onnx', 'base-tokens.txt'],
  },
  {
    id: 'sensevoice-small',
    feature: 'asr',
    runtime: 'sherpa-onnx-ios',
    requiredFiles: ['model.int8.onnx', 'tokens.txt'],
  },
  {
    id: 'ppocr-v5-mobile',
    feature: 'ocr',
    runtime: 'onnxruntime-mobile',
    requiredFiles: ['det.onnx', 'rec.onnx', 'dict.txt'],
  },
];

const failures = [];
const passed = [];
const assert = (condition, message) => {
  if (condition) passed.push(message);
  else failures.push(message);
};

for (const expected of MODELS) {
  const manifestUrl = `${ASSET_ORIGIN}/models/${expected.feature}/${expected.id}/manifest.json`;
  const response = await fetch(manifestUrl, { cache: 'no-store' });
  assert(response.ok, `${expected.id} manifest is reachable`);
  if (!response.ok) continue;

  const manifest = await response.json();
  assert(manifest.schemaVersion === 1, `${expected.id} manifest schema is supported`);
  assert(Array.isArray(manifest.packs) && manifest.packs.length === 1, `${expected.id} manifest contains one fixed model`);
  const pack = manifest.packs?.[0];
  if (!pack) continue;
  assert(pack.id === expected.id, `${expected.id} manifest ID matches the fixed app model`);
  assert(pack.feature === expected.feature, `${expected.id} feature matches`);
  assert(pack.runtime === expected.runtime, `${expected.id} runtime matches`);
  assert(typeof pack.license === 'string' && pack.license.length > 0, `${expected.id} records a redistribution license`);
  assert(Array.isArray(pack.files) && pack.files.length > 0, `${expected.id} contains runtime files`);
  const fileNames = new Set((pack.files || []).map((file) => file.name));
  for (const requiredFile of expected.requiredFiles) {
    assert(fileNames.has(requiredFile), `${expected.id} contains required runtime file ${requiredFile}`);
  }

  let totalBytes = 0;
  for (const file of pack.files || []) {
    assert(typeof file.name === 'string' && !/[\\/]|\.\./.test(file.name), `${expected.id}/${file.name} has a safe flat file name`);
    assert(typeof file.sha256 === 'string' && /^[a-f0-9]{64}$/.test(file.sha256), `${expected.id}/${file.name} has SHA-256 metadata`);
    assert(Number.isSafeInteger(file.bytes) && file.bytes > 0, `${expected.id}/${file.name} has byte metadata`);
    assert(typeof file.url === 'string' && file.url.startsWith(`${ASSET_ORIGIN}/models/`), `${expected.id}/${file.name} uses the fixed asset origin`);
    totalBytes += file.bytes || 0;

    const head = await fetch(file.url, { method: 'HEAD', cache: 'no-store' });
    assert(head.ok, `${expected.id}/${file.name} is reachable`);
    const contentLength = Number(head.headers.get('content-length'));
    assert(contentLength === file.bytes, `${expected.id}/${file.name} content length matches manifest`);
  }
  assert(totalBytes === pack.bytes, `${expected.id} total bytes match its files`);
}

for (const message of passed) console.log(`ok - ${message}`);
for (const message of failures) console.error(`not ok - ${message}`);
if (failures.length) {
  console.error(`Mobile model asset check failed: ${failures.length}/${passed.length + failures.length} checks failed.`);
  process.exit(1);
}
console.log(`Mobile model asset check passed: ${passed.length} checks.`);
