import { utf8ToBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const MODEL_PACK_MANIFEST_SCHEMA_VERSION = 1;

export type ModelPackFeature = 'asr' | 'ocr' | 'vad' | 'furigana';
export type ModelPackRuntime =
  | 'apple-speech'
  | 'apple-vision'
  | 'whisper-cpp-coreml'
  | 'sherpa-onnx-ios'
  | 'onnxruntime-mobile'
  | 'coreml'
  | 'native-dictionary'
  | 'server-fallback';

export interface ModelPackFile {
  name: string;
  url: string;
  sha256: string;
  bytes: number;
}

export interface ModelPack {
  id: string;
  feature: ModelPackFeature;
  runtime: ModelPackRuntime;
  version: string;
  minAppVersion: string;
  minIOS?: string;
  bytes: number;
  license: string;
  label?: string;
  description?: string;
  files: ModelPackFile[];
}

export interface ModelPackManifest {
  schemaVersion: typeof MODEL_PACK_MANIFEST_SCHEMA_VERSION;
  packs: ModelPack[];
}

export interface InstalledModelPackFile {
  name: string;
  uri: string;
  sha256: string;
  bytes: number;
}

export interface InstalledModelPack {
  id: string;
  feature: ModelPackFeature;
  runtime: ModelPackRuntime;
  version: string;
  minAppVersion?: string;
  minIOS?: string;
  label?: string;
  description?: string;
  installedAt: string;
  rootUri: string;
  bytes: number;
  license: string;
  manifestSha256?: string;
  files: InstalledModelPackFile[];
}

export interface ModelPackStorageSnapshot {
  schemaVersion: typeof MODEL_PACK_MANIFEST_SCHEMA_VERSION;
  installed: InstalledModelPack[];
}

export type ModelPackRuntimePlatform = 'ios' | 'android' | 'web' | 'unknown';

export type ModelPackCompatibilityStatus =
  | 'ready'
  | 'needs-runtime'
  | 'unsupported-platform'
  | 'unsupported-ios'
  | 'unsupported-app-version'
  | 'invalid-install';

export interface ModelPackRuntimeEnvironment {
  platform: ModelPackRuntimePlatform;
  iosVersion?: string | number;
  appVersion?: string | number;
  availableRuntimes?: readonly ModelPackRuntime[];
}

export interface ModelPackCompatibility {
  status: ModelPackCompatibilityStatus;
  canActivate: boolean;
  reason: string;
}

export type ModelPackActivationStatus =
  | 'installed-pack'
  | 'native-baseline'
  | 'no-compatible-pack'
  | 'no-baseline';

export interface ModelPackActivation {
  feature: ModelPackFeature;
  status: ModelPackActivationStatus;
  runtime: ModelPackRuntime | null;
  pack: InstalledModelPack | null;
  compatibility: ModelPackCompatibility | null;
  reason: string;
}

const MODEL_PACK_FEATURES: readonly ModelPackFeature[] = ['asr', 'ocr', 'vad', 'furigana'];
const MODEL_PACK_RUNTIMES: readonly ModelPackRuntime[] = [
  'apple-speech',
  'apple-vision',
  'whisper-cpp-coreml',
  'sherpa-onnx-ios',
  'onnxruntime-mobile',
  'coreml',
  'native-dictionary',
  'server-fallback',
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readString = (record: Record<string, unknown>, key: string, context: string): string => {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${context}.${key} must be a non-empty string.`);
  }
  return value.trim();
};

const readOptionalString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const readBytes = (record: Record<string, unknown>, key: string, context: string): number => {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${context}.${key} must be a non-negative safe integer.`);
  }
  return value;
};

const readEnum = <T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: readonly T[],
  context: string
): T => {
  const value = readString(record, key, context);
  if (!values.includes(value as T)) {
    throw new Error(`${context}.${key} has unsupported value "${value}".`);
  }
  return value as T;
};

const normalizeModelPackFile = (value: unknown, context: string): ModelPackFile => {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const name = readString(value, 'name', context);
  assertSafeModelPackFileName(name);

  return {
    name,
    url: readString(value, 'url', context),
    sha256: readString(value, 'sha256', context).toLowerCase(),
    bytes: readBytes(value, 'bytes', context),
  };
};

const normalizeInstalledModelPackFile = (value: unknown, context: string): InstalledModelPackFile => {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const name = readString(value, 'name', context);
  assertSafeModelPackFileName(name);

  return {
    name,
    uri: readString(value, 'uri', context),
    sha256: readString(value, 'sha256', context).toLowerCase(),
    bytes: readBytes(value, 'bytes', context),
  };
};

const assertUniqueNames = (files: readonly { name: string }[], context: string): void => {
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.name)) {
      throw new Error(`${context} contains duplicate file "${file.name}".`);
    }
    seen.add(file.name);
  }
};

const HEX_ALPHABET = '0123456789abcdef';

const bytesToHex = (bytes: Uint8Array): string => {
  let output = '';
  for (const byte of bytes) {
    output += HEX_ALPHABET[byte >> 4] + HEX_ALPHABET[byte & 15];
  }
  return output;
};

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

export function sha256Utf8Hex(value: string): string {
  return sha256Hex(utf8ToBytes(value));
}

export function getModelPackKey(pack: Pick<ModelPack | InstalledModelPack, 'id' | 'version'>): string {
  return `${pack.id}@${pack.version}`;
}

export function getModelPackFileBytes(pack: { files: readonly { bytes: number }[] }): number {
  return pack.files.reduce((sum, file) => sum + file.bytes, 0);
}

const assertModelPackBytesMatchFiles = (
  bytes: number,
  files: readonly ModelPackFile[],
  context: string
): void => {
  const fileBytes = getModelPackFileBytes({ files });
  if (bytes !== fileBytes) {
    throw new Error(`${context}.bytes must equal the total bytes of its files.`);
  }
};

export function assertModelPackFileIntegrity(file: ModelPackFile, bytes: Uint8Array): void {
  if (bytes.byteLength !== file.bytes) {
    throw new Error(`Model pack file "${file.name}" has ${bytes.byteLength} bytes; expected ${file.bytes}.`);
  }

  const digest = sha256Hex(bytes);
  if (digest !== file.sha256.toLowerCase()) {
    throw new Error(`Model pack file "${file.name}" failed checksum verification.`);
  }
}

export function assertSafeModelPackFileName(name: string): void {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..') || name === '.' || name === '..') {
    throw new Error(`Model pack file name "${name}" is not supported.`);
  }
}

const assertInstalledFilesMatchPack = (
  pack: ModelPack,
  files: readonly InstalledModelPackFile[]
): void => {
  const installedByName = new Map(files.map((file) => [file.name, file]));

  if (installedByName.size !== files.length) {
    throw new Error(`Installed model pack "${pack.id}" contains duplicate file metadata.`);
  }

  for (const expected of pack.files) {
    const installed = installedByName.get(expected.name);
    if (!installed) {
      throw new Error(`Installed model pack "${pack.id}" is missing file "${expected.name}".`);
    }
    if (installed.bytes !== expected.bytes) {
      throw new Error(`Installed model pack "${pack.id}" file "${expected.name}" has mismatched byte metadata.`);
    }
    if (installed.sha256.toLowerCase() !== expected.sha256.toLowerCase()) {
      throw new Error(`Installed model pack "${pack.id}" file "${expected.name}" has mismatched checksum metadata.`);
    }
  }

  if (files.length !== pack.files.length) {
    throw new Error(`Installed model pack "${pack.id}" contains unexpected file metadata.`);
  }
};

export function createInstalledModelPack(
  pack: ModelPack,
  rootUri: string,
  files: readonly InstalledModelPackFile[],
  installedAt = new Date().toISOString(),
  manifestSha256?: string
): InstalledModelPack {
  assertInstalledFilesMatchPack(pack, files);

  return normalizeInstalledModelPack({
    id: pack.id,
    feature: pack.feature,
    runtime: pack.runtime,
    version: pack.version,
    minAppVersion: pack.minAppVersion,
    minIOS: pack.minIOS,
    label: pack.label,
    description: pack.description,
    installedAt,
    rootUri,
    bytes: getModelPackFileBytes({ files }),
    license: pack.license,
    manifestSha256,
    files,
  });
}

export function replaceInstalledModelPack(
  installed: readonly InstalledModelPack[],
  pack: InstalledModelPack
): InstalledModelPack[] {
  const packKey = getModelPackKey(pack);
  return [
    ...installed.filter((current) => getModelPackKey(current) !== packKey),
    pack,
  ];
}

export function normalizeModelPack(value: unknown, context = 'pack'): ModelPack {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const filesValue = value.files;
  if (!Array.isArray(filesValue) || filesValue.length === 0) {
    throw new Error(`${context}.files must contain at least one file.`);
  }

  const files = filesValue.map((file, index) => normalizeModelPackFile(file, `${context}.files[${index}]`));
  assertUniqueNames(files, `${context}.files`);
  const bytes = readBytes(value, 'bytes', context);
  assertModelPackBytesMatchFiles(bytes, files, context);

  return {
    id: readString(value, 'id', context),
    feature: readEnum(value, 'feature', MODEL_PACK_FEATURES, context),
    runtime: readEnum(value, 'runtime', MODEL_PACK_RUNTIMES, context),
    version: readString(value, 'version', context),
    minAppVersion: readString(value, 'minAppVersion', context),
    minIOS: readOptionalString(value, 'minIOS'),
    bytes,
    license: readString(value, 'license', context),
    label: readOptionalString(value, 'label'),
    description: readOptionalString(value, 'description'),
    files,
  };
}

export function normalizeModelPackManifest(value: unknown): ModelPackManifest {
  if (!isRecord(value)) {
    throw new Error('Model pack manifest must be an object.');
  }
  if (value.schemaVersion !== MODEL_PACK_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported model pack manifest schema version: ${String(value.schemaVersion)}.`);
  }
  if (!Array.isArray(value.packs)) {
    throw new Error('Model pack manifest packs must be an array.');
  }

  const packs = value.packs.map((pack, index) => normalizeModelPack(pack, `packs[${index}]`));
  const seen = new Set<string>();
  for (const pack of packs) {
    const key = getModelPackKey(pack);
    if (seen.has(key)) {
      throw new Error(`Model pack manifest contains duplicate pack "${key}".`);
    }
    seen.add(key);
  }

  return {
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    packs,
  };
}

export function normalizeInstalledModelPack(value: unknown, context = 'installed'): InstalledModelPack {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const filesValue = value.files;
  if (!Array.isArray(filesValue)) {
    throw new Error(`${context}.files must be an array.`);
  }

  const files = filesValue.map((file, index) => normalizeInstalledModelPackFile(file, `${context}.files[${index}]`));
  assertUniqueNames(files, `${context}.files`);

  return {
    id: readString(value, 'id', context),
    feature: readEnum(value, 'feature', MODEL_PACK_FEATURES, context),
    runtime: readEnum(value, 'runtime', MODEL_PACK_RUNTIMES, context),
    version: readString(value, 'version', context),
    minAppVersion: readOptionalString(value, 'minAppVersion'),
    minIOS: readOptionalString(value, 'minIOS'),
    label: readOptionalString(value, 'label'),
    description: readOptionalString(value, 'description'),
    installedAt: readString(value, 'installedAt', context),
    rootUri: readString(value, 'rootUri', context),
    bytes: readBytes(value, 'bytes', context),
    license: readString(value, 'license', context),
    manifestSha256: readOptionalString(value, 'manifestSha256')?.toLowerCase(),
    files,
  };
}

export function normalizeModelPackStorageSnapshot(value: unknown): ModelPackStorageSnapshot {
  if (!isRecord(value)) {
    return {
      schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
      installed: [],
    };
  }
  if (value.schemaVersion !== MODEL_PACK_MANIFEST_SCHEMA_VERSION) {
    return {
      schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
      installed: [],
    };
  }
  if (!Array.isArray(value.installed)) {
    return {
      schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
      installed: [],
    };
  }

  const installed = value.installed.map((pack, index) => normalizeInstalledModelPack(pack, `installed[${index}]`));
  const seen = new Set<string>();
  const deduped: InstalledModelPack[] = [];
  for (const pack of installed) {
    const key = getModelPackKey(pack);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(pack);
  }

  return {
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    installed: deduped,
  };
}

export function createModelPackStorageSnapshot(installed: readonly InstalledModelPack[]): ModelPackStorageSnapshot {
  return normalizeModelPackStorageSnapshot({
    schemaVersion: MODEL_PACK_MANIFEST_SCHEMA_VERSION,
    installed,
  });
}

export function getInstalledModelPackBytes(installed: readonly Pick<InstalledModelPack, 'bytes'>[]): number {
  return installed.reduce((sum, pack) => sum + pack.bytes, 0);
}

const parseVersionParts = (version: string | number | undefined): number[] | null => {
  if (version === undefined || version === null) {
    return null;
  }

  const parts = String(version).match(/\d+/g);
  if (!parts?.length) {
    return null;
  }
  return parts.map((part) => Number(part));
};

const compareVersion = (current: string | number | undefined, minimum: string | number | undefined): number | null => {
  const currentParts = parseVersionParts(current);
  const minimumParts = parseVersionParts(minimum);
  if (!currentParts || !minimumParts) {
    return null;
  }

  const length = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (currentPart > minimumPart) {
      return 1;
    }
    if (currentPart < minimumPart) {
      return -1;
    }
  }
  return 0;
};

const runtimeRequiresIOS = (runtime: ModelPackRuntime): boolean => (
  runtime !== 'server-fallback'
);

export function getMissingModelPackRuntimeFiles(pack: Pick<InstalledModelPack, 'id' | 'feature' | 'runtime' | 'files'>): string[] {
  const installedNames = new Set(pack.files.map((file) => file.name));
  let required: readonly string[] = [];

  if (pack.runtime === 'sherpa-onnx-ios' && pack.id === 'whisper-base') {
    required = ['base-encoder.int8.onnx', 'base-decoder.int8.onnx', 'base-tokens.txt'];
  } else if (pack.runtime === 'sherpa-onnx-ios' && pack.id === 'sensevoice-small') {
    required = ['model.int8.onnx', 'tokens.txt'];
  } else if (pack.runtime === 'onnxruntime-mobile' && pack.feature === 'ocr') {
    required = ['det.onnx', 'rec.onnx', 'dict.txt'];
  }

  return required.filter((name) => !installedNames.has(name));
}

export function evaluateInstalledModelPackCompatibility(
  pack: InstalledModelPack,
  environment: ModelPackRuntimeEnvironment
): ModelPackCompatibility {
  if (pack.files.length === 0 || pack.bytes <= 0) {
    return {
      status: 'invalid-install',
      canActivate: false,
      reason: 'Installed files are missing.',
    };
  }

  const missingRuntimeFiles = getMissingModelPackRuntimeFiles(pack);
  if (missingRuntimeFiles.length > 0) {
    return {
      status: 'invalid-install',
      canActivate: false,
      reason: `Missing runtime file${missingRuntimeFiles.length === 1 ? '' : 's'}: ${missingRuntimeFiles.join(', ')}.`,
    };
  }

  if (runtimeRequiresIOS(pack.runtime) && environment.platform !== 'ios') {
    return {
      status: 'unsupported-platform',
      canActivate: false,
      reason: 'Requires an iOS native build.',
    };
  }

  if (pack.minIOS) {
    if (environment.platform !== 'ios') {
      return {
        status: 'unsupported-platform',
        canActivate: false,
        reason: `Requires iOS ${pack.minIOS} or later.`,
      };
    }

    const iosComparison = compareVersion(environment.iosVersion, pack.minIOS);
    if (iosComparison === null || iosComparison < 0) {
      return {
        status: 'unsupported-ios',
        canActivate: false,
        reason: `Requires iOS ${pack.minIOS} or later.`,
      };
    }
  }

  if (pack.minAppVersion) {
    const appComparison = compareVersion(environment.appVersion, pack.minAppVersion);
    if (appComparison === null || appComparison < 0) {
      return {
        status: 'unsupported-app-version',
        canActivate: false,
        reason: `Requires tabitomo ${pack.minAppVersion} or later.`,
      };
    }
  }

  if (!environment.availableRuntimes?.includes(pack.runtime)) {
    return {
      status: 'needs-runtime',
      canActivate: false,
      reason: `Needs ${pack.runtime} runtime adapter.`,
    };
  }

  return {
    status: 'ready',
    canActivate: true,
    reason: 'Ready in this build.',
  };
}

const getInstalledAtMs = (pack: Pick<InstalledModelPack, 'installedAt'>): number => {
  const timestamp = Date.parse(pack.installedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const compareInstalledModelPackPreference = (
  left: InstalledModelPack,
  right: InstalledModelPack
): number => {
  const installedDelta = getInstalledAtMs(right) - getInstalledAtMs(left);
  if (installedDelta !== 0) {
    return installedDelta;
  }

  const versionComparison = compareVersion(right.version, left.version);
  return versionComparison ?? getModelPackKey(right).localeCompare(getModelPackKey(left));
};

export function selectModelPackActivation(
  installed: readonly InstalledModelPack[],
  environment: ModelPackRuntimeEnvironment,
  feature: ModelPackFeature,
  nativeBaselineRuntime?: ModelPackRuntime
): ModelPackActivation {
  const featurePacks = installed.filter((pack) => pack.feature === feature);
  const evaluated = featurePacks.map((pack) => ({
    pack,
    compatibility: evaluateInstalledModelPackCompatibility(pack, environment),
  }));
  const ready = evaluated
    .filter((candidate) => candidate.compatibility.canActivate)
    .sort((left, right) => compareInstalledModelPackPreference(left.pack, right.pack));

  if (ready[0]) {
    const { pack, compatibility } = ready[0];
    return {
      feature,
      status: 'installed-pack',
      runtime: pack.runtime,
      pack,
      compatibility,
      reason: `Using ${pack.label || pack.id} ${pack.version}.`,
    };
  }

  if (nativeBaselineRuntime && environment.availableRuntimes?.includes(nativeBaselineRuntime)) {
    return {
      feature,
      status: 'native-baseline',
      runtime: nativeBaselineRuntime,
      pack: null,
      compatibility: null,
      reason: `Using ${nativeBaselineRuntime} native baseline.`,
    };
  }

  if (evaluated[0]) {
    const latest = evaluated
      .sort((left, right) => compareInstalledModelPackPreference(left.pack, right.pack))[0];
    return {
      feature,
      status: 'no-compatible-pack',
      runtime: latest.pack.runtime,
      pack: latest.pack,
      compatibility: latest.compatibility,
      reason: `${featurePacks.length} installed pack${featurePacks.length === 1 ? '' : 's'}, none ready. ${latest.compatibility.reason}`,
    };
  }

  return {
    feature,
    status: 'no-baseline',
    runtime: nativeBaselineRuntime || null,
    pack: null,
    compatibility: null,
    reason: nativeBaselineRuntime
      ? `${nativeBaselineRuntime} native baseline is not available in this runtime.`
      : `No ${feature} model pack is installed.`,
  };
}

export function formatModelPackBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${Math.round(value)} ${units[unitIndex]}`;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
