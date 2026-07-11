import { VoiceActivityDetector, VADConfig, VADCallbacks } from './vad';
import { transcribeAudioSiliconFlow } from './audioTranscription';
import { localAsrService } from './localAsr';
import { AISettings } from '../config/settings';
import type { LanguageCode } from '../translation/translation';

export interface RealtimeTranscriptionConfig {
  vadConfig?: VADConfig;
  sourceLang?: LanguageCode;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
}

/**
 * Realtime transcription service using VAD and audio transcription API
 */
export class RealtimeTranscriptionService {
  private vad: VoiceActivityDetector | null = null;
  private settings: AISettings;
  private config: RealtimeTranscriptionConfig;
  private mediaStream: MediaStream | null = null;

  private isRunning = false;
  private pendingTranscriptions = 0;
  private localRealtimeActive = false;
  private transcriptionTasks = new Set<Promise<void>>();
  private finalTranscripts: string[] = [];

  constructor(settings: AISettings, config: RealtimeTranscriptionConfig = {}) {
    this.settings = settings;
    this.config = config;
  }

  /**
   * Start realtime transcription
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('Realtime transcription is already running');
      return;
    }

    try {
      const provider = this.settings.speechRecognition.provider;
      const localVadMode = this.settings.speechRecognition.vadMode || 'silero';

      if (provider === 'local' && (localVadMode === 'silero' || localVadMode === 'off')) {
        try {
          await localAsrService.startRealtime(this.settings, this.config.sourceLang || 'en', {
            onTranscript: (text, isFinal) => this.emitTranscript(text, isFinal),
            onError: this.config.onError,
          });
          this.localRealtimeActive = true;
          this.isRunning = true;
          console.log(`Local realtime transcription started with ${localVadMode === 'silero' ? 'sherpa/Silero VAD' : 'full-recording mode'}`);
          return;
        } catch (error) {
          await localAsrService.stopRealtime();

          if (localVadMode === 'off') {
            throw error;
          }

          console.warn('Sherpa/Silero VAD failed to start, falling back to energy VAD:', error);
        }
      }

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create VAD callbacks
      const vadCallbacks: VADCallbacks = {
        onVoiceStart: () => {
          console.log('Voice detected, starting capture...');
        },
        onVoiceEnd: (audioBlob: Blob) => {
          console.log('Voice ended, transcribing...', audioBlob.size, 'bytes');
          this.trackTranscription(this.transcribeAudioSegment(audioBlob));
        },
      };

      // Create and start VAD
      this.vad = new VoiceActivityDetector(this.config.vadConfig, vadCallbacks);
      await this.vad.start(this.mediaStream);

      this.isRunning = true;
      console.log('Realtime transcription started');
    } catch (error) {
      console.error('Failed to start realtime transcription:', error);
      if (this.config.onError) {
        this.config.onError(error as Error);
      }
      throw error;
    }
  }

  /**
   * Stop realtime transcription
   */
  async stop(): Promise<string> {
    if (!this.isRunning) {
      return this.getFinalTranscript();
    }

    if (this.localRealtimeActive) {
      await localAsrService.stopRealtime();
      this.localRealtimeActive = false;
      this.isRunning = false;
      console.log('Local realtime transcription stopped');
      return this.getFinalTranscript();
    }

    // Stop VAD
    if (this.vad) {
      this.vad.stop();
      this.vad = null;
    }

    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.isRunning = false;
    await Promise.allSettled(Array.from(this.transcriptionTasks));
    console.log('Realtime transcription stopped');
    return this.getFinalTranscript();
  }

  /**
   * Transcribe an audio segment
   */
  private async transcribeAudioSegment(audioBlob: Blob): Promise<void> {
    this.pendingTranscriptions++;

    try {
      // Convert to appropriate format if needed
      const transcriptionBlob = await this.convertAudioFormat(audioBlob);

      // Use the configured transcription provider
      const provider = this.settings.speechRecognition.provider;

      if (provider === 'local') {
        const text = await localAsrService.transcribeBlob(transcriptionBlob, this.settings, {
          sourceLang: this.config.sourceLang,
        });

        this.emitTranscript(text, true);
      } else if (provider === 'siliconflow') {
        // Use SiliconFlow transcription
        const text = await transcribeAudioSiliconFlow(transcriptionBlob, this.settings);

        this.emitTranscript(text, true);
      } else {
        // Fallback: use Web Speech API (not ideal for file-based transcription)
        console.warn('Web Speech API does not support file-based transcription in realtime mode');
      }
    } catch (error) {
      console.error('Failed to transcribe audio segment:', error);
      if (this.config.onError) {
        this.config.onError(error as Error);
      }
    } finally {
      this.pendingTranscriptions--;
    }
  }

  /**
   * Convert audio format if needed
   */
  private async convertAudioFormat(audioBlob: Blob): Promise<Blob> {
    // SiliconFlow API expects webm or wav format
    // MediaRecorder produces webm by default, which is supported
    if (audioBlob.type.includes('webm') || audioBlob.type.includes('wav')) {
      return audioBlob;
    }

    // If we get another format, try to keep it as-is
    // The API should handle common formats
    console.log('Audio blob type:', audioBlob.type);
    return audioBlob;
  }

  /**
   * Check if service is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get number of pending transcriptions
   */
  getPendingCount(): number {
    return this.pendingTranscriptions;
  }

  getFinalTranscript(): string {
    const separator = this.config.sourceLang && !['zh', 'zh-Hant', 'ja', 'ko'].includes(this.config.sourceLang)
      ? ' '
      : '';
    return this.finalTranscripts.join(separator).trim();
  }

  private emitTranscript(text: string, isFinal: boolean): void {
    const normalizedText = text.trim();
    if (!normalizedText) return;

    if (isFinal) {
      this.finalTranscripts.push(normalizedText);
    }

    this.config.onTranscript?.(normalizedText, isFinal);
  }

  private trackTranscription(task: Promise<void>): void {
    this.transcriptionTasks.add(task);
    task.finally(() => this.transcriptionTasks.delete(task));
  }
}
