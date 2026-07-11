import {
  fetchSherpaBytes,
  getSherpaGlobal,
  loadSherpaScript,
  mountSherpaFile,
  SHERPA_SAMPLE_RATE,
  toSherpaMountedPath,
  type SherpaRuntimeInstance,
} from './sherpaOnnxRuntime';

type VadSegment = {
  samples?: Float32Array;
  start?: number;
};

type SherpaVad = {
  acceptWaveform: (samples: Float32Array) => void;
  isEmpty: () => boolean;
  front: () => VadSegment;
  pop: () => void;
  flush: () => void;
  free?: () => void;
};

type SherpaCircularBuffer = {
  push: (samples: Float32Array) => void;
  get: (startIndex: number, n: number) => Float32Array;
  pop: (n: number) => void;
  size: () => number;
  head: () => number;
  free?: () => void;
};

type CreateVad = (module: SherpaRuntimeInstance['module'], config: Record<string, unknown>) => SherpaVad;
type CircularBufferConstructor = new (capacity: number, module: SherpaRuntimeInstance['module']) => SherpaCircularBuffer;

const WINDOW_SIZE = 512;

const joinUrl = (base: string, file: string): string => {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedFile = file.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedFile}`;
};

export class SherpaVadSegmenter {
  private vad: SherpaVad;
  private buffer: SherpaCircularBuffer;

  private constructor(vad: SherpaVad, buffer: SherpaCircularBuffer) {
    this.vad = vad;
    this.buffer = buffer;
  }

  static async create(runtime: SherpaRuntimeInstance): Promise<SherpaVadSegmenter> {
    if (!getSherpaGlobal<CreateVad>('createVad') || !getSherpaGlobal<CircularBufferConstructor>('CircularBuffer')) {
      await loadSherpaScript(runtime.paths.vadJs);
    }

    const createVad = getSherpaGlobal<CreateVad>('createVad');
    const CircularBuffer = getSherpaGlobal<CircularBufferConstructor>('CircularBuffer');

    if (!createVad || !CircularBuffer) {
      throw new Error('Sherpa Silero VAD helper was not loaded. Check sherpa-onnx-vad.js in the runtime directory.');
    }

    const sileroModel = await fetchSherpaBytes(joinUrl(runtime.paths.modelBaseUrl, 'silero_vad.onnx'));
    mountSherpaFile(runtime.module, 'silero_vad.onnx', sileroModel);

    const vad = createVad(runtime.module, {
      sileroVad: {
        model: toSherpaMountedPath('silero_vad.onnx'),
        threshold: 0.5,
        minSilenceDuration: 0.5,
        minSpeechDuration: 0.25,
        maxSpeechDuration: 20,
        windowSize: WINDOW_SIZE,
      },
      tenVad: { model: '' },
      sampleRate: SHERPA_SAMPLE_RATE,
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
      bufferSizeInSeconds: 60,
    });

    const buffer = new CircularBuffer(SHERPA_SAMPLE_RATE * 60, runtime.module);
    return new SherpaVadSegmenter(vad, buffer);
  }

  process(samples: Float32Array): Float32Array[] {
    if (!samples.length) return [];

    const segments: Float32Array[] = [];
    this.buffer.push(samples);

    while (this.buffer.size() > WINDOW_SIZE) {
      const chunk = this.buffer.get(this.buffer.head(), WINDOW_SIZE);
      this.vad.acceptWaveform(chunk);
      this.buffer.pop(WINDOW_SIZE);
      segments.push(...this.drainSegments());
    }

    return segments;
  }

  flush(): Float32Array[] {
    this.vad.flush();
    return this.drainSegments();
  }

  destroy(): void {
    this.vad.free?.();
    this.buffer.free?.();
  }

  private drainSegments(): Float32Array[] {
    const segments: Float32Array[] = [];

    while (!this.vad.isEmpty()) {
      const segment = this.vad.front();
      this.vad.pop();
      if (segment.samples?.length) {
        segments.push(segment.samples);
      }
    }

    return segments;
  }
}
