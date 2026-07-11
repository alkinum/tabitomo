import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ASSET_ORIGIN = 'https://assets.tabitomo.alkinum.io';
const DEFAULT_BUCKET = 'tabitomo-assets';
const APP_VERSION = '0.1.0';
const MIN_IOS = '16.4';

const MODELS = {
  'whisper-tiny': { feature: 'asr', runtime: 'sherpa-onnx-ios', label: 'Whisper Tiny' },
  'whisper-base': { feature: 'asr', runtime: 'sherpa-onnx-ios', label: 'Whisper Base' },
  'whisper-small': { feature: 'asr', runtime: 'sherpa-onnx-ios', label: 'Whisper Small' },
  'sensevoice-small': { feature: 'asr', runtime: 'sherpa-onnx-ios', label: 'SenseVoice Small' },
  'ppocr-v5-mobile': { feature: 'ocr', runtime: 'onnxruntime-mobile', label: 'PP-OCR v5 Mobile' },
};

const args = process.argv.slice(2);
const readOption = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const modelId = args[0];
const sourceDirectory = args[1] ? path.resolve(args[1]) : null;
const version = readOption('--version');
const license = readOption('--license');
const bucket = readOption('--bucket') || DEFAULT_BUCKET;
const accountId = readOption('--account-id') || process.env.TABITOMO_R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
const dryRun = args.includes('--dry-run');
const model = MODELS[modelId];

if (!model || !sourceDirectory || !version || !license) {
  console.error('Usage: pnpm models:publish-mobile <model-id> <flat-source-directory> --version <version> --license <SPDX-or-license-name> [--bucket tabitomo-assets] [--account-id id] [--dry-run]');
  console.error(`Supported model IDs: ${Object.keys(MODELS).join(', ')}`);
  process.exit(1);
}
if (!dryRun && !accountId) {
  console.error('Set TABITOMO_R2_ACCOUNT_ID or pass --account-id before publishing.');
  process.exit(1);
}
if (!/^[a-zA-Z0-9._-]+$/.test(version)) {
  console.error('Version may contain only letters, numbers, dots, underscores, and hyphens.');
  process.exit(1);
}

const entries = await readdir(sourceDirectory, { withFileTypes: true });
const unsupported = entries.filter((entry) => !entry.isFile() || entry.name.startsWith('.') || entry.name.includes('..'));
if (unsupported.length) {
  console.error(`The source directory must be flat and contain only model files. Unsupported: ${unsupported.map((entry) => entry.name).join(', ')}`);
  process.exit(1);
}
if (!entries.length) {
  console.error('The source directory is empty.');
  process.exit(1);
}

const prefix = `models/${model.feature}/${modelId}`;
const files = [];
for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
  const filePath = path.join(sourceDirectory, entry.name);
  const [bytes, metadata] = await Promise.all([readFile(filePath), stat(filePath)]);
  const objectKey = `${prefix}/files/${version}/${entry.name}`;
  files.push({
    name: entry.name,
    url: `${ASSET_ORIGIN}/${objectKey}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: metadata.size,
    filePath,
    objectKey,
  });
}

const manifest = {
  schemaVersion: 1,
  packs: [{
    id: modelId,
    feature: model.feature,
    runtime: model.runtime,
    version,
    minAppVersion: APP_VERSION,
    minIOS: MIN_IOS,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    license,
    label: model.label,
    description: `${model.label} files distributed by tabitomo for verified on-device download.`,
    files: files.map(({ name, url, sha256, bytes }) => ({ name, url, sha256, bytes })),
  }],
};

await mkdir(path.resolve('output/model-manifests'), { recursive: true });
const manifestPath = path.resolve('output/model-manifests', `${modelId}.json`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

if (dryRun) {
  console.log(`Validated ${files.length} files (${manifest.packs[0].bytes} bytes).`);
  console.log(`Manifest: ${manifestPath}`);
  process.exit(0);
}

const wranglerEnv = { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId };
const putObject = (key, file, contentType, cacheControl) => {
  execFileSync('pnpm', [
    'exec', 'wrangler', 'r2', 'object', 'put', `${bucket}/${key}`,
    '--file', file,
    '--content-type', contentType,
    '--cache-control', cacheControl,
    '--remote',
  ], { cwd: process.cwd(), env: wranglerEnv, stdio: 'inherit' });
};

for (const file of files) {
  putObject(file.objectKey, file.filePath, 'application/octet-stream', 'public, max-age=31536000, immutable');
}
putObject(`${prefix}/manifest.json`, manifestPath, 'application/json; charset=utf-8', 'no-cache');

console.log(`Published ${model.label} ${version}: ${ASSET_ORIGIN}/${prefix}/manifest.json`);
