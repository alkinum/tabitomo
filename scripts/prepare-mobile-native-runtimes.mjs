import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SHERPA_VERSION = '1.13.4';
const SHERPA_ARCHIVE_SHA256 = 'dcc5f1748144e88bdb17dfb7b9e5d06d194f478cdb6047adc133f9480c473b1a';
const SHERPA_ARCHIVE_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/sherpa-onnx-v${SHERPA_VERSION}-ios-no-tts.tar.bz2`;
const root = path.resolve(import.meta.dirname, '..');
const vendorRoot = path.join(root, 'packages/tabitomo-native-local-models/ios/vendor');
const frameworkPath = path.join(vendorRoot, 'sherpa-onnx.xcframework');
const markerPath = path.join(vendorRoot, 'runtime.json');
const SHERPA_LIBRARY_SLICES = ['ios-arm64', 'ios-arm64_x86_64-simulator'];

const pathExists = async (value) => {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
};

const repairSherpaLibraryAliases = async () => {
  for (const slice of SHERPA_LIBRARY_SLICES) {
    const sliceRoot = path.join(frameworkPath, slice);
    const libraryPath = path.join(sliceRoot, 'sherpa-onnx.a');
    const aliasPath = path.join(sliceRoot, 'libsherpa-onnx.a');
    if (!await pathExists(libraryPath)) {
      throw new Error(`Prepared sherpa-onnx runtime is missing ${slice}/sherpa-onnx.a.`);
    }
    await rm(aliasPath, { force: true });
    await symlink('sherpa-onnx.a', aliasPath);
  }
};

if (await pathExists(frameworkPath) && await pathExists(markerPath)) {
  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  if (marker.version === SHERPA_VERSION && marker.sha256 === SHERPA_ARCHIVE_SHA256) {
    await repairSherpaLibraryAliases();
    console.log(`Native local-model runtime is ready: sherpa-onnx ${SHERPA_VERSION}.`);
    process.exit(0);
  }
}

const tempRoot = await mkdtemp(path.join(tmpdir(), 'tabitomo-native-runtimes-'));
const archivePath = path.join(tempRoot, 'sherpa-onnx-ios.tar.bz2');

try {
  console.log(`Downloading sherpa-onnx ${SHERPA_VERSION} iOS runtime...`);
  const response = await fetch(SHERPA_ARCHIVE_URL);
  if (!response.ok) {
    throw new Error(`Runtime download failed (${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== SHERPA_ARCHIVE_SHA256) {
    throw new Error(`Runtime checksum mismatch: received ${digest}.`);
  }
  await writeFile(archivePath, bytes);

  execFileSync('tar', [
    '-xjf', archivePath,
    '-C', tempRoot,
    './build-ios-no-tts/sherpa-onnx.xcframework',
  ], { stdio: 'inherit' });

  await mkdir(vendorRoot, { recursive: true });
  await rm(frameworkPath, { recursive: true, force: true });
  await cp(
    path.join(tempRoot, 'build-ios-no-tts/sherpa-onnx.xcframework'),
    frameworkPath,
    { recursive: true }
  );
  await repairSherpaLibraryAliases();
  await writeFile(markerPath, `${JSON.stringify({
    version: SHERPA_VERSION,
    sha256: SHERPA_ARCHIVE_SHA256,
    source: SHERPA_ARCHIVE_URL,
    onnxRuntimeVersion: '1.27.0',
  }, null, 2)}\n`);
  console.log(`Prepared sherpa-onnx ${SHERPA_VERSION} at ${frameworkPath}.`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
