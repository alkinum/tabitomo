import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  assertModelPackFileIntegrity,
  assertSafeModelPackFileName,
  createInstalledModelPack,
  normalizeModelPackManifest,
  replaceInstalledModelPack,
  sha256Utf8Hex,
  type InstalledModelPack,
  type InstalledModelPackFile,
  type ModelPack,
  type ModelPackFile,
  type ModelPackManifest,
} from '@tabitomo/core';

const MODEL_PACKS_WEB_ROOT = 'web-local-storage://tabitomo/model-packs';
const MODEL_PACKS_TMP_DIR = 'tabitomo-model-pack-downloads';

export const TABITOMO_MODEL_ASSET_ORIGIN = 'https://assets.tabitomo.alkinum.io';

export type OfflineModelId =
  | 'whisper-base'
  | 'sensevoice-small'
  | 'ppocr-v5-mobile';

export interface OfflineModelDefinition {
  id: OfflineModelId;
  packId: string;
  label: string;
  feature: 'asr' | 'ocr';
  description: string;
  manifestUrl: string;
}

const modelManifestUrl = (feature: 'asr' | 'ocr', id: OfflineModelId): string => (
  `${TABITOMO_MODEL_ASSET_ORIGIN}/models/${feature}/${id}/manifest.json`
);

export const OFFLINE_MODEL_DEFINITIONS: readonly OfflineModelDefinition[] = [
  {
    id: 'whisper-base',
    packId: 'whisper-base',
    label: 'Whisper Base',
    feature: 'asr',
    description: 'Balanced offline speech recognition for travel use.',
    manifestUrl: modelManifestUrl('asr', 'whisper-base'),
  },
  {
    id: 'sensevoice-small',
    packId: 'sensevoice-small',
    label: 'SenseVoice Small',
    feature: 'asr',
    description: 'Multilingual offline speech recognition with ITN support.',
    manifestUrl: modelManifestUrl('asr', 'sensevoice-small'),
  },
  {
    id: 'ppocr-v5-mobile',
    packId: 'ppocr-v5-mobile',
    label: 'PP-OCR v5 Mobile',
    feature: 'ocr',
    description: 'On-device text detection and recognition for images.',
    manifestUrl: modelManifestUrl('ocr', 'ppocr-v5-mobile'),
  },
] as const;

export const getOfflineModelDefinition = (modelId: OfflineModelId): OfflineModelDefinition => {
  const definition = OFFLINE_MODEL_DEFINITIONS.find((model) => model.id === modelId);
  if (!definition) throw new Error(`Unknown offline model: ${modelId}`);
  return definition;
};

export interface InstallModelPackResult {
  manifest: ModelPackManifest;
  installedPack: InstalledModelPack;
  installed: InstalledModelPack[];
}

export interface InstallModelPackOptions {
  manifestUrl: string;
  existingInstalled: readonly InstalledModelPack[];
  packId?: string;
  allowedAssetOrigin?: string;
  validateInstalledPack?: (pack: InstalledModelPack) => Promise<void>;
  onStatus?: (status: string) => void;
}

export interface InstallOfflineModelOptions {
  modelId: OfflineModelId;
  existingInstalled: readonly InstalledModelPack[];
  validateInstalledPack?: (pack: InstalledModelPack) => Promise<void>;
  onStatus?: (status: string) => void;
}

export async function installOfflineModel({
  modelId,
  existingInstalled,
  validateInstalledPack,
  onStatus,
}: InstallOfflineModelOptions): Promise<InstallModelPackResult> {
  const model = getOfflineModelDefinition(modelId);
  return installModelPackFromManifestUrl({
    manifestUrl: model.manifestUrl,
    existingInstalled,
    packId: model.packId,
    allowedAssetOrigin: TABITOMO_MODEL_ASSET_ORIGIN,
    validateInstalledPack,
    onStatus,
  });
}

export interface InstallModelPackFromBytesOptions {
  manifest: ModelPackManifest;
  existingInstalled: readonly InstalledModelPack[];
  fileBytes: Record<string, Uint8Array>;
  manifestSha256?: string;
  packId?: string;
  onStatus?: (status: string) => void;
}

interface InstallPreparedModelPackOptions {
  manifest: ModelPackManifest;
  manifestSha256: string;
  existingInstalled: readonly InstalledModelPack[];
  packId?: string;
  allowedAssetOrigin?: string;
  validateInstalledPack?: (pack: InstalledModelPack) => Promise<void>;
  onStatus?: (status: string) => void;
  writeFileToTemp: (file: ModelPackFile, tempFile: File) => Promise<Uint8Array>;
}

export function getModelPackRootUri(): string {
  if (Platform.OS === 'web') {
    return MODEL_PACKS_WEB_ROOT;
  }
  return new Directory(Paths.document, 'tabitomo', 'model-packs').uri;
}

export function ensureModelPackRootDirectory(): string {
  if (Platform.OS === 'web') {
    return MODEL_PACKS_WEB_ROOT;
  }

  const directory = new Directory(Paths.document, 'tabitomo', 'model-packs');
  directory.create({ intermediates: true, idempotent: true });
  return directory.uri;
}

export function deleteInstalledModelPackFiles(pack: InstalledModelPack): void {
  if (Platform.OS === 'web') {
    return;
  }

  const directory = new Directory(pack.rootUri);
  if (directory.exists) {
    directory.delete();
  }
  cleanupModelPackInstallArtifacts(pack);
}

const sanitizePathSegment = (value: string): string => {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'pack';
};

const removeDirectoryIfExists = (directory: Directory): void => {
  if (directory.exists) {
    directory.delete();
  }
};

const isModelPackInstallArtifactName = (name: string, safeVersion: string): boolean => (
  name.startsWith(`${safeVersion}.staging-`) || name.startsWith(`${safeVersion}.previous-`)
);

const getModelPackDirectory = (pack: Pick<ModelPack | InstalledModelPack, 'id' | 'version'>): {
  directory: Directory;
  safeVersion: string;
} => {
  const root = new Directory(Paths.document, 'tabitomo', 'model-packs');
  return {
    directory: new Directory(root, sanitizePathSegment(pack.id)),
    safeVersion: sanitizePathSegment(pack.version),
  };
};

const listModelPackInstallArtifactUrisForDirectory = (
  packDirectory: Directory,
  safeVersion: string
): string[] => {
  if (!packDirectory.exists) {
    return [];
  }

  return packDirectory
    .list()
    .filter((entry): entry is Directory => entry instanceof Directory)
    .filter((entry) => isModelPackInstallArtifactName(entry.name, safeVersion))
    .map((entry) => entry.uri);
};

const cleanupModelPackInstallArtifactsForDirectory = (
  packDirectory: Directory,
  safeVersion: string
): string[] => {
  const artifactUris = listModelPackInstallArtifactUrisForDirectory(packDirectory, safeVersion);
  for (const artifactUri of artifactUris) {
    removeDirectoryIfExists(new Directory(artifactUri));
  }
  return artifactUris;
};

export function listModelPackInstallArtifactUris(
  pack: Pick<ModelPack | InstalledModelPack, 'id' | 'version'>
): string[] {
  if (Platform.OS === 'web') {
    return [];
  }

  const { directory, safeVersion } = getModelPackDirectory(pack);
  return listModelPackInstallArtifactUrisForDirectory(directory, safeVersion);
}

export function cleanupModelPackInstallArtifacts(
  pack: Pick<ModelPack | InstalledModelPack, 'id' | 'version'>
): string[] {
  if (Platform.OS === 'web') {
    return [];
  }

  const { directory, safeVersion } = getModelPackDirectory(pack);
  return cleanupModelPackInstallArtifactsForDirectory(directory, safeVersion);
}

const fetchManifest = async (manifestUrl: string): Promise<{
  manifest: ModelPackManifest;
  manifestSha256: string;
}> => {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Model pack manifest download failed (${response.status}).`);
  }

  const body = await response.text();
  return {
    manifest: normalizeModelPackManifest(JSON.parse(body) as unknown),
    manifestSha256: sha256Utf8Hex(body),
  };
};

const selectModelPack = (manifest: ModelPackManifest, packId?: string): ModelPack => {
  if (!manifest.packs.length) {
    throw new Error('Model pack manifest does not contain any packs.');
  }
  if (!packId) {
    return manifest.packs[0];
  }

  const pack = manifest.packs.find((candidate) => candidate.id === packId);
  if (!pack) {
    throw new Error(`Model pack "${packId}" was not found in the manifest.`);
  }
  return pack;
};

export async function installModelPackFromManifestUrl({
  manifestUrl,
  existingInstalled,
  packId,
  allowedAssetOrigin,
  validateInstalledPack,
  onStatus,
}: InstallModelPackOptions): Promise<InstallModelPackResult> {
  if (Platform.OS === 'web') {
    throw new Error('Model pack downloads require a native Expo build.');
  }

  const trimmedManifestUrl = manifestUrl.trim();
  if (!trimmedManifestUrl) {
    throw new Error('Enter a model-pack manifest URL first.');
  }

  onStatus?.('Downloading manifest...');
  const { manifest, manifestSha256 } = await fetchManifest(trimmedManifestUrl);
  return installPreparedModelPack({
    manifest,
    manifestSha256,
    existingInstalled,
    packId,
    allowedAssetOrigin,
    validateInstalledPack,
    onStatus,
    writeFileToTemp: async (file, tempFile) => {
      assertSafeModelPackFileName(file.name);
      onStatus?.(`Downloading ${file.name}...`);
      const downloaded = await File.downloadFileAsync(file.url, tempFile, { idempotent: true });
      return new Uint8Array(await downloaded.arrayBuffer());
    },
  });
}

export async function installModelPackFromBytes({
  manifest,
  existingInstalled,
  fileBytes,
  manifestSha256,
  packId,
  onStatus,
}: InstallModelPackFromBytesOptions): Promise<InstallModelPackResult> {
  if (Platform.OS === 'web') {
    throw new Error('Model pack installs require a native Expo build.');
  }

  const normalizedManifest = normalizeModelPackManifest(manifest);
  return installPreparedModelPack({
    manifest: normalizedManifest,
    manifestSha256: manifestSha256 || sha256Utf8Hex(JSON.stringify(normalizedManifest)),
    existingInstalled,
    packId,
    onStatus,
    writeFileToTemp: async (file, tempFile) => {
      assertSafeModelPackFileName(file.name);
      const bytes = fileBytes[file.name];
      if (!bytes) {
        throw new Error(`Missing local bytes for model-pack file "${file.name}".`);
      }
      onStatus?.(`Writing ${file.name}...`);
      tempFile.write(bytes);
      return bytes;
    },
  });
}

async function installPreparedModelPack({
  manifest,
  manifestSha256,
  existingInstalled,
  packId,
  allowedAssetOrigin,
  validateInstalledPack,
  onStatus,
  writeFileToTemp,
}: InstallPreparedModelPackOptions): Promise<InstallModelPackResult> {
  const pack = selectModelPack(manifest, packId);
  if (allowedAssetOrigin) {
    for (const file of pack.files) {
      let origin = '';
      try {
        origin = new URL(file.url).origin;
      } catch {
        throw new Error(`Model file "${file.name}" has an invalid download URL.`);
      }
      if (origin !== allowedAssetOrigin) {
        throw new Error(`Model file "${file.name}" must be downloaded from ${allowedAssetOrigin}.`);
      }
    }
  }
  const safeId = sanitizePathSegment(pack.id);
  const safeVersion = sanitizePathSegment(pack.version);
  const installStamp = Date.now();
  const root = new Directory(Paths.document, 'tabitomo', 'model-packs');
  const packDirectory = new Directory(root, safeId);
  const tempRoot = new Directory(Paths.cache, MODEL_PACKS_TMP_DIR);
  const tempDirectory = new Directory(tempRoot, `${safeId}-${safeVersion}-${installStamp}`);
  const stagingDirectory = new Directory(packDirectory, `${safeVersion}.staging-${installStamp}`);
  const finalDirectory = new Directory(packDirectory, safeVersion);
  const previousName = `${safeVersion}.previous-${installStamp}`;
  const previousDirectory = new Directory(packDirectory, previousName);

  root.create({ intermediates: true, idempotent: true });
  packDirectory.create({ intermediates: true, idempotent: true });
  tempRoot.create({ intermediates: true, idempotent: true });
  removeDirectoryIfExists(tempDirectory);
  removeDirectoryIfExists(stagingDirectory);
  removeDirectoryIfExists(previousDirectory);
  tempDirectory.create({ intermediates: true, idempotent: true });

  let activatedNewPack = false;
  let movedPreviousPack = false;
  let installedPack: InstalledModelPack | null = null;

  try {
    for (const file of pack.files) {
      assertSafeModelPackFileName(file.name);
      const tempFile = new File(tempDirectory, file.name);
      const bytes = await writeFileToTemp(file, tempFile);

      onStatus?.(`Verifying ${file.name}...`);
      assertModelPackFileIntegrity(file, bytes);
    }

    onStatus?.('Preparing verified model pack...');
    stagingDirectory.create({ intermediates: true, idempotent: true });

    for (const file of pack.files) {
      const source = new File(tempDirectory, file.name);
      const destination = new File(stagingDirectory, file.name);
      await source.copy(destination, { overwrite: true });
    }

    onStatus?.('Activating verified model pack...');
    try {
      if (finalDirectory.exists) {
        finalDirectory.rename(previousName);
        movedPreviousPack = true;
      }
      stagingDirectory.rename(safeVersion);
      activatedNewPack = true;
    } catch (error) {
      if (movedPreviousPack) {
        removeDirectoryIfExists(new Directory(packDirectory, safeVersion));
      }
      if (movedPreviousPack && previousDirectory.exists) {
        previousDirectory.rename(safeVersion);
      }
      throw error;
    }

    const activeDirectory = new Directory(packDirectory, safeVersion);
    const installedFiles: InstalledModelPackFile[] = pack.files.map((file) => ({
      name: file.name,
      uri: new File(activeDirectory, file.name).uri,
      sha256: file.sha256,
      bytes: file.bytes,
    }));
    installedPack = createInstalledModelPack(
      pack,
      activeDirectory.uri,
      installedFiles,
      new Date().toISOString(),
      manifestSha256
    );

    if (validateInstalledPack) {
      onStatus?.('Validating model with the native runtime...');
      await validateInstalledPack(installedPack);
    }

    try {
      const removedArtifacts = cleanupModelPackInstallArtifactsForDirectory(packDirectory, safeVersion);
      if (removedArtifacts.length > 0) {
        onStatus?.('Installed and cleaned previous model-pack artifacts.');
      }
    } catch {
      onStatus?.('Installed. Previous model-pack cleanup will be retried on delete.');
    }
  } catch (error) {
    removeDirectoryIfExists(stagingDirectory);
    if (activatedNewPack) {
      removeDirectoryIfExists(new Directory(packDirectory, safeVersion));
      if (movedPreviousPack && previousDirectory.exists) {
        previousDirectory.rename(safeVersion);
      }
    }
    throw error;
  } finally {
    removeDirectoryIfExists(tempDirectory);
  }

  if (!installedPack) {
    throw new Error('Model installation completed without active metadata.');
  }

  return {
    manifest,
    installedPack,
    installed: replaceInstalledModelPack(existingInstalled, installedPack),
  };
}
