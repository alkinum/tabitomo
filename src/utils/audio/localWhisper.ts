/**
 * Local Whisper transcription service using @remotion/whisper-web
 * Runs entirely in the browser using WebAssembly
 *
 * Note: Whisper library is dynamically imported to reduce initial bundle size
 */

export type WhisperModelSize = 'tiny' | 'base' | 'small';

export interface WhisperTranscriptionOptions {
  model?: WhisperModelSize;
  language?: string; // WhisperWebLanguage from @remotion/whisper-web
}

interface ModelDownloadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export type ModelDownloadCallback = (progress: ModelDownloadProgress) => void;

class LocalWhisperService {
  private downloadedModels: Set<WhisperModelSize> = new Set();
  private downloadingModels: Set<WhisperModelSize> = new Set();

  /**
   * Download Whisper model with progress tracking
   */
  async downloadModel(
    modelSize: WhisperModelSize,
    onProgress?: ModelDownloadCallback
  ): Promise<void> {
    if (this.downloadedModels.has(modelSize)) {
      console.log(`[Whisper] Model ${modelSize} already downloaded`);
      return;
    }

    if (this.downloadingModels.has(modelSize)) {
      throw new Error(`Model ${modelSize} is already being downloaded`);
    }

    this.downloadingModels.add(modelSize);

    try {
      console.log(`[Whisper] Starting download of ${modelSize} model...`);

      // Dynamically import whisper-web only when needed
      const { downloadWhisperModel } = await import('@remotion/whisper-web');

      await downloadWhisperModel({
        model: modelSize,
        onProgress: (progress) => {
          if (onProgress) {
            onProgress({
              loaded: progress.downloadedBytes,
              total: progress.totalBytes,
              percentage: progress.progress * 100,
            });
          }
        },
      });

      this.downloadedModels.add(modelSize);
      console.log(`[Whisper] Model ${modelSize} downloaded successfully`);
    } catch (error) {
      console.error(`[Whisper] Failed to download model ${modelSize}:`, error);
      throw error;
    } finally {
      this.downloadingModels.delete(modelSize);
    }
  }

  /**
   * Check if a model is downloaded (checks both in-memory cache and browser storage)
   */
  async isModelDownloadedAsync(modelSize: WhisperModelSize): Promise<boolean> {
    // First check in-memory cache
    if (this.downloadedModels.has(modelSize)) {
      return true;
    }

    // Then check browser storage using getLoadedModels
    try {
      // Dynamically import whisper-web only when needed
      const { getLoadedModels } = await import('@remotion/whisper-web');
      const loadedModels = await getLoadedModels();
      const isLoaded = loadedModels.includes(modelSize);

      // Sync in-memory cache with browser storage
      if (isLoaded) {
        this.downloadedModels.add(modelSize);
      }

      return isLoaded;
    } catch (error) {
      console.error('[Whisper] Failed to check loaded models:', error);
      return false;
    }
  }

  /**
   * Check if a model is downloaded (synchronous version, checks only in-memory cache)
   */
  isModelDownloaded(modelSize: WhisperModelSize): boolean {
    return this.downloadedModels.has(modelSize);
  }

  /**
   * Check if a model is currently downloading
   */
  isModelDownloading(modelSize: WhisperModelSize): boolean {
    return this.downloadingModels.has(modelSize);
  }

  /**
   * Transcribe audio blob using Whisper
   */
  async transcribe(
    audioBlob: Blob,
    options: WhisperTranscriptionOptions = {}
  ): Promise<string> {
    const modelSize = options.model || 'base';

    // Ensure model is downloaded
    if (!this.downloadedModels.has(modelSize)) {
      throw new Error(
        `Whisper model "${modelSize}" is not downloaded. Please download it first.`
      );
    }

    try {
      console.log(`[Whisper] Transcribing audio with ${modelSize} model...`);

      // Dynamically import whisper-web only when needed
      const { resampleTo16Khz, transcribe } = await import('@remotion/whisper-web');

      // Resample audio to 16kHz Float32Array for Whisper
      const channelWaveform = await resampleTo16Khz({
        file: audioBlob,
      });

      // Transcribe using whisper-web
      const result = await transcribe({
        model: modelSize,
        channelWaveform,
        language: options.language as Parameters<typeof transcribe>[0]['language'],
      });

      // Concatenate all transcription items into a single string
      const transcription = result.transcription
        .map((item) => item.text)
        .join(' ')
        .trim();

      console.log(`[Whisper] Transcription complete:`, transcription);

      return transcription;
    } catch (error) {
      console.error('[Whisper] Transcription error:', error);
      throw new Error(
        `Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clear cached models (for memory management)
   */
  clearCache(): void {
    this.downloadedModels.clear();
    console.log('[Whisper] Model cache cleared');
  }

  /**
   * Initialize service by syncing with browser storage
   */
  async initialize(): Promise<void> {
    try {
      // Dynamically import whisper-web only when needed
      const { getLoadedModels } = await import('@remotion/whisper-web');
      const loadedModels = await getLoadedModels();
      loadedModels.forEach((model) => {
        if (model === 'tiny' || model === 'base' || model === 'small') {
          this.downloadedModels.add(model);
        }
      });
      console.log('[Whisper] Initialized with models:', Array.from(this.downloadedModels));
    } catch (error) {
      console.error('[Whisper] Failed to initialize:', error);
    }
  }

  /**
   * Get model size information
   */
  getModelInfo(modelSize: WhisperModelSize): { size: string; description: string } {
    const modelInfo: Record<WhisperModelSize, { size: string; description: string }> = {
      tiny: { size: '~75 MB', description: 'Fastest, less accurate' },
      base: { size: '~145 MB', description: 'Good balance of speed and accuracy' },
      small: { size: '~488 MB', description: 'Better accuracy, slower' },
    };

    return modelInfo[modelSize];
  }
}

// Export singleton instance
export const localWhisperService = new LocalWhisperService();
