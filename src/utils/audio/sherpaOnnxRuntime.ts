import type { AISettings, LocalAsrEngine, SenseVoiceLanguage } from '../config/settings';
import type { LanguageCode } from '../translation/translation';

export type SherpaModule = {
  FS?: {
    analyzePath?: (path: string) => { exists: boolean };
    mkdir?: (path: string) => void;
    unlink?: (path: string) => void;
  };
  FS_createDataFile?: (
    parent: string,
    name: string,
    data: Uint8Array,
    canRead: boolean,
    canWrite: boolean,
    canOwn: boolean
  ) => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  _SherpaOnnxCreateOfflineRecognizer?: (ptr: number) => number;
  _SherpaOnnxCreateVoiceActivityDetector?: (ptr: number, bufferSizeInSeconds: number) => number;
};

type OfflineRecognizerResult = { text?: string };

type OfflineStream = {
  acceptWaveform: (sampleRate: number, samples: Float32Array) => void;
  free?: () => void;
};

type OfflineRecognizer = {
  createStream: () => OfflineStream;
  decode: (stream: OfflineStream) => void;
  getResult: (stream: OfflineStream) => OfflineRecognizerResult;
  free?: () => void;
};

type OfflineRecognizerConstructor = new (config: SherpaOfflineRecognizerConfig, module: SherpaModule) => OfflineRecognizer;

interface SherpaWindow extends Window {
  Module?: SherpaModule;
  OfflineRecognizer?: OfflineRecognizerConstructor;
  webkitAudioContext?: typeof AudioContext;
}

export interface SherpaModelPaths {
  modelBaseUrl: string;
  runtimeBaseUrl: string;
  data: string;
  wasmJs: string;
  wasm: string;
  asrJs: string;
  vadJs: string;
}

export interface SherpaLocalModelInfo {
  engine: LocalAsrEngine;
  label: string;
  description: string;
  runtimeFiles: string[];
  modelFiles: string[];
  requiredFiles: string[];
  configured: boolean;
  modelPath: string;
  runtimePath: string;
}

export interface SherpaOfflineRecognizerConfig {
  featConfig: {
    sampleRate: number;
    featureDim: number;
  };
  modelConfig: {
    tokens: string;
    numThreads: number;
    debug: number;
    provider: 'cpu';
    whisper?: {
      encoder: string;
      decoder: string;
      language: string;
      task: 'transcribe' | 'translate';
      tailPaddings: number;
    };
    senseVoice?: {
      model: string;
      language: SenseVoiceLanguage;
      useInverseTextNormalization: number;
    };
  };
  decodingMethod: 'greedy_search';
  maxActivePaths: number;
}

export interface SherpaRuntimeInstance {
  module: SherpaModule;
  recognizer: OfflineRecognizer;
  paths: SherpaModelPaths;
  decode: (samples: Float32Array, sampleRate?: number) => string;
  destroy: () => void;
}

export const SHERPA_SAMPLE_RATE = 16000;
export const SHERPA_MOUNT_DIR = '/tabitomo-local-asr';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const joinUrl = (base: string, file: string): string => {
  const normalizedBase = trimTrailingSlash(base.trim());
  const normalizedFile = file.replace(/^\/+/, '');
  return normalizedBase ? `${normalizedBase}/${normalizedFile}` : normalizedFile;
};

export const toSherpaMountedPath = (file: string): string => `${SHERPA_MOUNT_DIR}/${file.replace(/^\/+/, '')}`;

const getRuntimeBaseUrl = (settings: AISettings): string => {
  const runtimeBaseUrl = settings.speechRecognition.localAssetBaseUrl?.trim();
  const modelBaseUrl = settings.speechRecognition.localModelPath?.trim() || '';
  return trimTrailingSlash(runtimeBaseUrl || modelBaseUrl);
};

export const getSherpaModelInfo = (settings: AISettings): SherpaLocalModelInfo => {
  const engine = settings.speechRecognition.localEngine || 'whisper';
  const modelPath = settings.speechRecognition.localModelPath?.trim() || '';
  const runtimePath = getRuntimeBaseUrl(settings);
  const runtimeFiles = [
    'sherpa-onnx-wasm-main-asr.js',
    'sherpa-onnx-wasm-main-asr.wasm',
    'sherpa-onnx-wasm-main-asr.data',
    'sherpa-onnx-asr.js',
    ...(settings.speechRecognition.vadMode === 'silero' ? ['sherpa-onnx-vad.js'] : []),
  ];

  if (engine === 'sensevoice') {
    const modelFiles = [
      'tokens.txt',
      'model.onnx',
      ...(settings.speechRecognition.vadMode === 'silero' ? ['silero_vad.onnx'] : []),
    ];
    return {
      engine,
      label: 'SenseVoice',
      description: 'Sherpa-ONNX SenseVoice for Chinese, Cantonese, English, Japanese, and Korean.',
      runtimeFiles,
      modelFiles,
      requiredFiles: [...runtimeFiles, ...modelFiles],
      configured: modelPath.length > 0,
      modelPath,
      runtimePath,
    };
  }

  const modelFiles = [
    'tokens.txt',
    'encoder.onnx',
    'decoder.onnx',
    ...(settings.speechRecognition.vadMode === 'silero' ? ['silero_vad.onnx'] : []),
  ];
  return {
    engine,
    label: 'Whisper',
    description: 'Sherpa-ONNX Whisper offline transcription using encoder/decoder ONNX files.',
    runtimeFiles,
    modelFiles,
    requiredFiles: [...runtimeFiles, ...modelFiles],
    configured: modelPath.length > 0,
    modelPath,
    runtimePath,
  };
};

export const resolveSherpaModelPaths = (settings: AISettings): SherpaModelPaths => {
  const modelBaseUrl = settings.speechRecognition.localModelPath?.trim();

  if (!modelBaseUrl) {
    throw new Error('Local ASR model directory is not configured. Open Settings > Speech and set a sherpa-onnx model directory URL.');
  }

  const modelBase = trimTrailingSlash(modelBaseUrl);
  const runtimeBase = getRuntimeBaseUrl(settings);

  return {
    modelBaseUrl: modelBase,
    runtimeBaseUrl: runtimeBase,
    data: joinUrl(runtimeBase, 'sherpa-onnx-wasm-main-asr.data'),
    wasmJs: joinUrl(runtimeBase, 'sherpa-onnx-wasm-main-asr.js'),
    wasm: joinUrl(runtimeBase, 'sherpa-onnx-wasm-main-asr.wasm'),
    asrJs: joinUrl(runtimeBase, 'sherpa-onnx-asr.js'),
    vadJs: joinUrl(runtimeBase, 'sherpa-onnx-vad.js'),
  };
};

export const getSenseVoiceLanguage = (settings: AISettings): SenseVoiceLanguage => (
  settings.speechRecognition.senseVoiceLanguage || 'auto'
);

const mapWhisperLanguage = (settings: AISettings, sourceLang?: LanguageCode): string => {
  const selected = settings.speechRecognition.whisperLanguage || sourceLang || 'auto';
  if (selected === 'zh-Hant') return 'zh';
  return selected;
};

export const buildSherpaOfflineRecognizerConfig = (
  settings: AISettings,
  sourceLang?: LanguageCode
): SherpaOfflineRecognizerConfig => {
  const engine = settings.speechRecognition.localEngine || 'whisper';
  const modelConfig: SherpaOfflineRecognizerConfig['modelConfig'] = {
    tokens: toSherpaMountedPath('tokens.txt'),
    numThreads: 1,
    debug: 0,
    provider: 'cpu',
  };

  if (engine === 'sensevoice') {
    modelConfig.senseVoice = {
      model: toSherpaMountedPath('model.onnx'),
      language: getSenseVoiceLanguage(settings),
      useInverseTextNormalization: settings.speechRecognition.senseVoiceUseItn === false ? 0 : 1,
    };
  } else {
    modelConfig.whisper = {
      encoder: toSherpaMountedPath('encoder.onnx'),
      decoder: toSherpaMountedPath('decoder.onnx'),
      language: mapWhisperLanguage(settings, sourceLang),
      task: settings.speechRecognition.whisperTask || 'transcribe',
      tailPaddings: 2000,
    };
  }

  return {
    featConfig: {
      sampleRate: SHERPA_SAMPLE_RATE,
      featureDim: 80,
    },
    modelConfig,
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
  };
};

const loadScript = (src: string, forceReload = false): Promise<void> => {
  const target = new URL(src, window.location.href).href;
  const existing = Array.from(document.scripts || []).find((script) => script.src === target);
  if (existing && !forceReload) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = forceReload ? `${src}${src.includes('?') ? '&' : '?'}reload=${Date.now()}` : src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load sherpa runtime script: ${script.src}`));
    document.head.appendChild(script);
  });
};

export const loadSherpaScript = loadScript;

export const fetchSherpaBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const removeMountedFile = (module: SherpaModule, fullPath: string): void => {
  try {
    if (module.FS?.analyzePath?.(fullPath)?.exists) {
      module.FS.unlink?.(fullPath);
    }
  } catch {
    // Missing files are fine; mounting is idempotent per runtime instance.
  }
};

const ensureMountDir = (module: SherpaModule): void => {
  try {
    if (!module.FS?.analyzePath?.(SHERPA_MOUNT_DIR)?.exists) {
      module.FS?.mkdir?.(SHERPA_MOUNT_DIR);
    }
  } catch {
    // Some sherpa bundles create paths lazily. FS_createDataFile will surface real failures.
  }
};

export const mountSherpaFile = (module: SherpaModule, file: string, data: Uint8Array): void => {
  if (!module.FS_createDataFile) {
    throw new Error('Sherpa runtime does not expose FS_createDataFile; cannot mount external model files.');
  }

  ensureMountDir(module);
  const cleanFile = file.replace(/^\/+/, '');
  removeMountedFile(module, toSherpaMountedPath(cleanFile));
  module.FS_createDataFile(SHERPA_MOUNT_DIR, cleanFile, data, true, false, true);
};

export const mountSherpaFileFromUrl = async (module: SherpaModule, file: string, baseUrl: string): Promise<void> => {
  mountSherpaFile(module, file, await fetchSherpaBytes(joinUrl(baseUrl, file)));
};

const mountModelFiles = async (module: SherpaModule, settings: AISettings, paths: SherpaModelPaths): Promise<void> => {
  const info = getSherpaModelInfo(settings);

  if (!module.FS_createDataFile) {
    throw new Error('Sherpa runtime does not expose FS_createDataFile; cannot mount external local ASR model files.');
  }

  ensureMountDir(module);

  for (const file of info.modelFiles.filter((file) => file !== 'silero_vad.onnx')) {
    await mountSherpaFileFromUrl(module, file, paths.modelBaseUrl);
  }
};

export const getSherpaGlobal = <T>(name: string): T | undefined => {
  try {
    return new Function(`return typeof ${name} !== "undefined" ? ${name} : undefined;`)() as T | undefined;
  } catch {
    return undefined;
  }
};

const loadSherpaModule = (paths: SherpaModelPaths): Promise<SherpaModule> => {
  const sherpaWindow = window as SherpaWindow;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Sherpa WASM runtime load timeout (30s).'));
    }, 30000);

    sherpaWindow.Module = {
      locateFile: (file: string) => {
        if (file.endsWith('.wasm')) return paths.wasm;
        if (file.endsWith('.data')) return paths.data;
        return file;
      },
      print: (...args: unknown[]) => console.log('[Sherpa WASM]', ...args),
      printErr: (...args: unknown[]) => console.error('[Sherpa WASM]', ...args),
      onAbort: (reason: unknown) => {
        window.clearTimeout(timeoutId);
        reject(new Error(`Sherpa WASM aborted: ${String(reason)}`));
      },
      onRuntimeInitialized: () => {
        window.clearTimeout(timeoutId);
        const module = sherpaWindow.Module;
        if (!module?._malloc || !module._SherpaOnnxCreateOfflineRecognizer) {
          reject(new Error('Sherpa WASM loaded, but offline recognizer exports were not found.'));
          return;
        }
        resolve(module);
      },
    } as SherpaModule;

    loadScript(paths.wasmJs, true).catch((error) => {
      window.clearTimeout(timeoutId);
      reject(error);
    });
  });
};

export const resampleTo16Khz = (
  samples: Float32Array,
  sourceRate: number,
  targetRate = SHERPA_SAMPLE_RATE
): Float32Array => {
  if (!samples.length) return new Float32Array(0);
  if (!sourceRate || sourceRate === targetRate) return new Float32Array(samples);

  const targetLength = Math.max(1, Math.round((samples.length / sourceRate) * targetRate));
  const result = new Float32Array(targetLength);
  const ratio = sourceRate / targetRate;

  for (let i = 0; i < targetLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const current = samples[index] || 0;
    const next = samples[Math.min(samples.length - 1, index + 1)] || 0;
    result[i] = current + (next - current) * fraction;
  }

  return result;
};

export async function decodeAudioBlobTo16Khz(blob: Blob): Promise<Float32Array> {
  const sherpaWindow = window as SherpaWindow;
  const AudioContextConstructor = sherpaWindow.AudioContext || sherpaWindow.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('Web Audio API is not available in this browser.');
  }

  const audioContext = new AudioContextConstructor();
  try {
    const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    return resampleTo16Khz(decoded.getChannelData(0), decoded.sampleRate);
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export async function createSherpaRuntime(
  settings: AISettings,
  sourceLang?: LanguageCode
): Promise<SherpaRuntimeInstance> {
  const paths = resolveSherpaModelPaths(settings);
  const sherpaWindow = window as SherpaWindow;

  if (!getSherpaGlobal<OfflineRecognizerConstructor>('OfflineRecognizer')) {
    await loadScript(paths.asrJs);
  }
  const module = await loadSherpaModule(paths);
  await mountModelFiles(module, settings, paths);

  const OfflineRecognizer = getSherpaGlobal<OfflineRecognizerConstructor>('OfflineRecognizer') || sherpaWindow.OfflineRecognizer;
  if (!OfflineRecognizer) {
    throw new Error('Sherpa OfflineRecognizer helper was not loaded. Check sherpa-onnx-asr.js in the runtime directory.');
  }

  const recognizer = new OfflineRecognizer(buildSherpaOfflineRecognizerConfig(settings, sourceLang), module);

  return {
    module,
    recognizer,
    paths,
    decode(samples: Float32Array, sampleRate = SHERPA_SAMPLE_RATE): string {
      const input = sampleRate === SHERPA_SAMPLE_RATE ? samples : resampleTo16Khz(samples, sampleRate);
      if (!input.length) return '';

      const stream = recognizer.createStream();
      try {
        stream.acceptWaveform(SHERPA_SAMPLE_RATE, input);
        recognizer.decode(stream);
        return (recognizer.getResult(stream).text || '').trim();
      } finally {
        stream.free?.();
      }
    },
    destroy() {
      recognizer.free?.();
    },
  };
}

const checkUrl = async (url: string): Promise<boolean> => {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) return true;
  } catch {
    // Some static hosts do not support HEAD.
  }

  try {
    const response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
};

export async function checkSherpaModelDirectory(settings: AISettings): Promise<void> {
  const info = getSherpaModelInfo(settings);

  if (!info.configured) {
    throw new Error('Model directory URL is empty.');
  }

  const failures: string[] = [];
  const runtimeBase = info.runtimePath || info.modelPath;

  await Promise.all([
    ...info.runtimeFiles.map(async (file) => {
      const ok = await checkUrl(joinUrl(runtimeBase, file));
      if (!ok) failures.push(`${file} (runtime)`);
    }),
    ...info.modelFiles.map(async (file) => {
      const ok = await checkUrl(joinUrl(info.modelPath, file));
      if (!ok) failures.push(`${file} (model)`);
    }),
  ]);

  if (failures.length > 0) {
    throw new Error(`Missing or unreachable local ASR assets: ${failures.join(', ')}`);
  }
}
