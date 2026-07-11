import type { AISettings } from '../config/settings';
import type { LanguageCode } from '../translation/translation';
import {
  createSherpaRuntime,
  decodeAudioBlobTo16Khz,
  resampleTo16Khz,
  SHERPA_SAMPLE_RATE,
  type SherpaLocalModelInfo,
  type SherpaRuntimeInstance,
  getSherpaModelInfo,
} from './sherpaOnnxRuntime';
import { SherpaVadSegmenter } from './sherpaVad';

export interface LocalAsrCallbacks {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  onReady?: () => void;
}

export interface LocalAsrTranscriptionOptions {
  sourceLang?: LanguageCode;
}

type AudioContextConstructor = typeof AudioContext;

interface AudioWindow extends Window {
  webkitAudioContext?: AudioContextConstructor;
}

interface RealtimeSession {
  mediaStream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  vad: SherpaVadSegmenter | null;
  chunks: Float32Array[];
  sampleCount: number;
  callbacks: LocalAsrCallbacks;
  isStopping: boolean;
}

const buildRuntimeKey = (settings: AISettings, sourceLang?: LanguageCode): string => JSON.stringify({
  engine: settings.speechRecognition.localEngine || 'whisper',
  modelPath: settings.speechRecognition.localModelPath?.trim() || '',
  assetBaseUrl: settings.speechRecognition.localAssetBaseUrl?.trim() || '',
  sourceLang: sourceLang || '',
  whisperLanguage: settings.speechRecognition.whisperLanguage || 'auto',
  whisperTask: settings.speechRecognition.whisperTask || 'transcribe',
  senseVoiceLanguage: settings.speechRecognition.senseVoiceLanguage || 'auto',
  senseVoiceUseItn: settings.speechRecognition.senseVoiceUseItn !== false,
});

const concatSamples = (chunks: Float32Array[], sampleCount: number): Float32Array => {
  const samples = new Float32Array(sampleCount);
  let offset = 0;

  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  return samples;
};

class LocalAsrService {
  private runtime: SherpaRuntimeInstance | null = null;
  private runtimeKey = '';
  private initPromise: Promise<void> | null = null;
  private ready = false;
  private realtimeSession: RealtimeSession | null = null;

  getModelInfo(settings: AISettings): SherpaLocalModelInfo {
    return getSherpaModelInfo(settings);
  }

  isReady(): boolean {
    return this.ready && !!this.runtime;
  }

  async initialize(settings: AISettings, sourceLang?: LanguageCode, callbacks: LocalAsrCallbacks = {}): Promise<void> {
    const nextKey = buildRuntimeKey(settings, sourceLang);

    if (this.runtime && this.ready && this.runtimeKey === nextKey) {
      callbacks.onReady?.();
      return;
    }

    this.destroyRuntime();
    this.runtimeKey = nextKey;

    this.initPromise = createSherpaRuntime(settings, sourceLang).then((runtime) => {
      this.runtime = runtime;
      this.ready = true;
      callbacks.onReady?.();
    });

    await this.initPromise;
  }

  async transcribeBlob(
    audioBlob: Blob,
    settings: AISettings,
    options: LocalAsrTranscriptionOptions = {}
  ): Promise<string> {
    await this.initialize(settings, options.sourceLang);

    if (!this.runtime) {
      throw new Error('Local ASR engine is not initialized.');
    }

    const samples = await decodeAudioBlobTo16Khz(audioBlob);
    return this.runtime.decode(samples, SHERPA_SAMPLE_RATE);
  }

  async startRealtime(settings: AISettings, sourceLang: LanguageCode, callbacks: LocalAsrCallbacks): Promise<void> {
    if (this.realtimeSession) return;

    await this.initialize(settings, sourceLang, callbacks);

    if (!this.runtime) {
      throw new Error('Local ASR engine is not initialized.');
    }

    const audioWindow = window as AudioWindow;
    const AudioContextCtor = audioWindow.AudioContext || audioWindow.webkitAudioContext;

    if (!AudioContextCtor) {
      throw new Error('Web Audio API is not available in this browser.');
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const audioContext = new AudioContextCtor();

    try {
      const vadMode = settings.speechRecognition.vadMode || 'silero';
      const vad = vadMode === 'silero'
        ? await SherpaVadSegmenter.create(this.runtime)
        : null;
      const source = audioContext.createMediaStreamSource(mediaStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      this.attachRealtimeProcessor({
        mediaStream,
        audioContext,
        source,
        processor,
        vad,
        chunks: [],
        sampleCount: 0,
        callbacks,
        isStopping: false,
      });
    } catch (error) {
      mediaStream.getTracks().forEach(track => track.stop());
      await audioContext.close().catch(() => undefined);
      throw error;
    }
  }

  private attachRealtimeProcessor(session: RealtimeSession): void {
    const { audioContext, processor, source } = session;

    processor.onaudioprocess = (event) => {
      if (!this.runtime || session.isStopping) return;

      const input = event.inputBuffer.getChannelData(0);
      const samples = resampleTo16Khz(input, audioContext.sampleRate);
      if (!samples.length) return;

      if (session.vad) {
        const segments = session.vad.process(samples);
        for (const segment of segments) {
          this.decodeRealtimeSegment(segment, session.callbacks);
        }
      } else {
        const copy = new Float32Array(samples);
        session.chunks.push(copy);
        session.sampleCount += copy.length;
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    this.realtimeSession = session;
  }

  async stopRealtime(): Promise<string[]> {
    const session = this.realtimeSession;
    if (!session) return [];

    session.isStopping = true;
    const finalTexts: string[] = [];

    try {
      session.processor.disconnect();
      session.source.disconnect();
      session.mediaStream.getTracks().forEach(track => track.stop());

      if (session.vad) {
        for (const segment of session.vad.flush()) {
          const text = this.decodeRealtimeSegment(segment, session.callbacks);
          if (text) finalTexts.push(text);
        }
      } else if (session.sampleCount > 0) {
        const text = this.decodeRealtimeSegment(concatSamples(session.chunks, session.sampleCount), session.callbacks);
        if (text) finalTexts.push(text);
      }
    } finally {
      session.vad?.destroy();
      await session.audioContext.close().catch(() => undefined);
      this.realtimeSession = null;
    }

    return finalTexts;
  }

  destroy(): void {
    if (this.realtimeSession) {
      void this.stopRealtime().finally(() => this.destroyRuntime());
      return;
    }

    this.destroyRuntime();
  }

  private decodeRealtimeSegment(samples: Float32Array, callbacks: LocalAsrCallbacks): string {
    if (!this.runtime || !samples.length) return '';

    try {
      const text = this.runtime.decode(samples, SHERPA_SAMPLE_RATE);
      if (text) callbacks.onTranscript?.(text, true);
      return text;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Local realtime transcription failed');
      callbacks.onError?.(normalizedError);
      return '';
    }
  }

  private destroyRuntime(): void {
    if (this.runtime) {
      this.runtime.destroy();
    }
    this.runtime = null;
    this.runtimeKey = '';
    this.initPromise = null;
    this.ready = false;
  }
}

export const localAsrService = new LocalAsrService();
