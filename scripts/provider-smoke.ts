import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  DEFAULT_SETTINGS,
  annotateJapaneseFurigana,
  answerQuestionStream,
  collectAssistantStream,
  explainTextStream,
  hasFuriganaReadings,
  normalizeSettings,
  performOCR,
  streamTranslateImageWithVLM,
  transcribeAudioFile,
  translateText,
  type AISettings,
  type APIFormat,
} from '../packages/tabitomo-core/src/index.ts';

type StepName = 'translation' | 'explanation' | 'qa' | 'furigana' | 'vlm' | 'ocr' | 'asr';
type StepStatus = 'passed' | 'skipped' | 'failed';

interface StepResult {
  name: StepName;
  status: StepStatus;
  detail: string;
  elapsedMs: number;
}

interface ProviderTriplet {
  apiKey: string;
  endpoint: string;
  modelName: string;
}

const stepNames: StepName[] = ['translation', 'explanation', 'qa', 'furigana', 'vlm', 'ocr', 'asr'];
const textSteps: StepName[] = ['translation', 'explanation', 'qa', 'furigana'];
const defaultTimeoutMs = 60_000;

const env = (name: string): string => process.env[name]?.trim() || '';
const truthyEnv = (name: string): boolean => /^(1|true|yes|on)$/i.test(env(name));

const requiredSteps = new Set<StepName>(
  env('TABITOMO_PROVIDER_SMOKE_REQUIRED')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .flatMap((item) => {
      if (!item) return [];
      if (item === 'all') return stepNames;
      if (item === 'text') return textSteps;
      return stepNames.includes(item as StepName) ? [item as StepName] : [];
    })
);

const timeoutMs = Number.parseInt(env('TABITOMO_PROVIDER_SMOKE_TIMEOUT_MS'), 10) || defaultTimeoutMs;

const apiFormat = (): APIFormat => {
  const value = env('TABITOMO_GENERAL_API_FORMAT') || env('TABITOMO_PROVIDER_API_FORMAT') || 'openai-chat';
  return ['openai-chat', 'openai-responses', 'anthropic'].includes(value) ? value as APIFormat : 'openai-chat';
};

const readTriplet = (prefix: string, aliases: string[] = []): ProviderTriplet | null => {
  const apiKey = env(`${prefix}_API_KEY`) || aliases.map((alias) => env(`${alias}_API_KEY`)).find(Boolean) || '';
  const endpoint = env(`${prefix}_ENDPOINT`) || aliases.map((alias) => env(`${alias}_ENDPOINT`)).find(Boolean) || '';
  const modelName = env(`${prefix}_MODEL`) || aliases.map((alias) => env(`${alias}_MODEL`)).find(Boolean) || '';
  const provided = [apiKey, endpoint, modelName].filter(Boolean).length;

  if (provided > 0 && provided < 3) {
    throw new Error(`${prefix}_API_KEY, ${prefix}_ENDPOINT, and ${prefix}_MODEL must be provided together.`);
  }

  return provided === 3 ? { apiKey, endpoint, modelName } : null;
};

const general = readTriplet('TABITOMO_GENERAL', ['TABITOMO_PROVIDER']);
const translation = readTriplet('TABITOMO_TRANSLATION');
const ocr = readTriplet('TABITOMO_OCR');
const vlm = readTriplet('TABITOMO_VLM');
const speech = readTriplet('TABITOMO_SPEECH');

const useGeneralForVLM = truthyEnv('TABITOMO_PROVIDER_SMOKE_VLM_USE_GENERAL') || !vlm;

const settings: AISettings = normalizeSettings({
  ...DEFAULT_SETTINGS,
  generalAI: {
    ...DEFAULT_SETTINGS.generalAI,
    apiFormat: apiFormat(),
    apiKey: general?.apiKey || '',
    endpoint: general?.endpoint || '',
    modelName: general?.modelName || '',
  },
  provider: translation ? 'custom' : DEFAULT_SETTINGS.provider,
  endpoint: translation?.endpoint || '',
  modelName: translation?.modelName || '',
  apiKey: translation?.apiKey || '',
  translation: {
    outputMode: env('TABITOMO_TRANSLATION_OUTPUT_MODE') === 'plain' ? 'plain' : 'structured',
  },
  imageOCR: {
    ...DEFAULT_SETTINGS.imageOCR,
    provider: ocr ? 'qwen' : DEFAULT_SETTINGS.imageOCR.provider,
    useGeneralAI: false,
    apiKey: ocr?.apiKey || '',
    endpoint: ocr?.endpoint || DEFAULT_SETTINGS.imageOCR.endpoint,
    modelName: ocr?.modelName || DEFAULT_SETTINGS.imageOCR.modelName,
  },
  vlm: {
    ...DEFAULT_SETTINGS.vlm,
    useGeneralAI: useGeneralForVLM,
    useCustom: Boolean(vlm),
    apiKey: vlm?.apiKey || '',
    endpoint: vlm?.endpoint || '',
    modelName: vlm?.modelName || '',
    enableThinking: truthyEnv('TABITOMO_PROVIDER_SMOKE_SHOW_THINKING'),
  },
  speechRecognition: {
    ...DEFAULT_SETTINGS.speechRecognition,
    provider: speech ? 'siliconflow' : DEFAULT_SETTINGS.speechRecognition.provider,
    apiKey: speech?.apiKey || '',
    endpoint: speech?.endpoint || '',
    modelName: speech?.modelName || DEFAULT_SETTINGS.speechRecognition.modelName,
  },
});

const assertText = (label: string, value: string): string => {
  const text = value.trim();
  if (text.length < 2) {
    throw new Error(`${label} returned empty or too-short text.`);
  }
  return text;
};

const sample = (value: string): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
};

const runStep = async (
  name: StepName,
  available: boolean,
  unavailableReason: string,
  run: (signal: AbortSignal) => Promise<string>
): Promise<StepResult> => {
  const started = Date.now();
  const required = requiredSteps.has(name);

  if (!available) {
    if (required) {
      return {
        name,
        status: 'failed',
        detail: `Required but unavailable: ${unavailableReason}`,
        elapsedMs: Date.now() - started,
      };
    }
    return {
      name,
      status: 'skipped',
      detail: unavailableReason,
      elapsedMs: Date.now() - started,
    };
  }

  try {
    const detail = await run(AbortSignal.timeout(timeoutMs));
    return {
      name,
      status: 'passed',
      detail,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      name,
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    };
  }
};

const makeAudioFile = async (): Promise<File | null> => {
  const audioPath = env('TABITOMO_SPEECH_AUDIO_FILE');
  if (!audioPath) {
    return null;
  }

  const data = await readFile(audioPath);
  const mimeType = env('TABITOMO_SPEECH_AUDIO_MIME') || guessAudioMime(audioPath);
  return new File([new Uint8Array(data)], path.basename(audioPath), { type: mimeType });
};

const guessAudioMime = (filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.m4a') return 'audio/m4a';
  if (extension === '.webm') return 'audio/webm';
  return 'application/octet-stream';
};

const main = async () => {
  const audioFile = await makeAudioFile();
  const cafePngDataUrl = createCafePngDataUrl();
  const hasGeneral = Boolean(general);
  const hasTranslationProvider = hasGeneral || Boolean(translation);
  const hasVLMProvider = Boolean((useGeneralForVLM && general) || vlm);
  const hasOCRProvider = Boolean(ocr);
  const hasASRProvider = Boolean(speech && audioFile);

  const results: StepResult[] = [];
  results.push(await runStep(
    'translation',
    hasTranslationProvider,
    'Set TABITOMO_GENERAL_* or TABITOMO_TRANSLATION_*.',
    async (signal) => {
      const output = assertText(
        'Translation',
        await translateText('駅はどこですか', 'ja', 'en', settings, signal)
      );
      return sample(output);
    }
  ));

  results.push(await runStep(
    'explanation',
    hasGeneral,
    'Set TABITOMO_GENERAL_API_KEY, TABITOMO_GENERAL_ENDPOINT, and TABITOMO_GENERAL_MODEL.',
    async (signal) => {
      const output = assertText(
        'Explanation',
        await collectAssistantStream(explainTextStream('駅はどこですか', 'ja', 'en', settings, signal))
      );
      return sample(output);
    }
  ));

  results.push(await runStep(
    'qa',
    hasGeneral,
    'Set TABITOMO_GENERAL_API_KEY, TABITOMO_GENERAL_ENDPOINT, and TABITOMO_GENERAL_MODEL.',
    async (signal) => {
      const output = assertText(
        'Quick Q&A',
        await collectAssistantStream(answerQuestionStream('How do I ask where the station is?', 'en', 'ja', settings, signal))
      );
      return sample(output);
    }
  ));

  results.push(await runStep(
    'furigana',
    hasGeneral,
    'Set TABITOMO_GENERAL_API_KEY, TABITOMO_GENERAL_ENDPOINT, and TABITOMO_GENERAL_MODEL.',
    async (signal) => {
      const tokens = await annotateJapaneseFurigana('駅はどこですか', settings, signal);
      const joined = tokens.map((token) => token.text).join('');
      if (joined !== '駅はどこですか') {
        throw new Error(`Furigana tokens did not preserve text. Got ${JSON.stringify(tokens)}.`);
      }
      if (!hasFuriganaReadings(tokens)) {
        throw new Error(`Furigana provider returned no readings. Got ${JSON.stringify(tokens)}.`);
      }
      return tokens.map((token) => token.reading ? `${token.text}(${token.reading})` : token.text).join('');
    }
  ));

  results.push(await runStep(
    'vlm',
    hasVLMProvider,
    'Set TABITOMO_VLM_* or TABITOMO_PROVIDER_SMOKE_VLM_USE_GENERAL=1 with TABITOMO_GENERAL_*.',
    async (signal) => {
      const output = assertText(
        'VLM image translation',
        await collectAssistantStream(streamTranslateImageWithVLM(cafePngDataUrl, 'en', 'ja', settings, signal))
      );
      return sample(output);
    }
  ));

  results.push(await runStep(
    'ocr',
    hasOCRProvider,
    'Set TABITOMO_OCR_API_KEY, TABITOMO_OCR_ENDPOINT, and TABITOMO_OCR_MODEL for Alibaba Cloud Model Studio Qwen-OCR.',
    async (signal) => {
      const lines = await performOCR(cafePngDataUrl, settings, signal);
      if (!lines.length) {
        throw new Error('OCR returned no text for the generated CAFE image.');
      }
      return sample(lines.map((line) => line.text).join(' | '));
    }
  ));

  results.push(await runStep(
    'asr',
    hasASRProvider,
    'Set TABITOMO_SPEECH_* and TABITOMO_SPEECH_AUDIO_FILE.',
    async (signal) => {
      if (!audioFile) {
        throw new Error('Audio file was not loaded.');
      }
      const output = assertText('ASR', await transcribeAudioFile(audioFile, settings, signal));
      return sample(output);
    }
  ));

  for (const result of results) {
    const marker = result.status === 'passed' ? 'PASS' : result.status === 'skipped' ? 'SKIP' : 'FAIL';
    console.log(`${marker} ${result.name} ${result.elapsedMs}ms - ${result.detail}`);
  }

  const failed = results.filter((result) => result.status === 'failed');
  const passed = results.filter((result) => result.status === 'passed');
  const skipped = results.filter((result) => result.status === 'skipped');
  console.log(`Provider smoke summary: ${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed.`);

  if (failed.length) {
    process.exitCode = 1;
  }
};

function createCafePngDataUrl(): string {
  const width = 220;
  const height = 100;
  const pixels = Buffer.alloc(width * height * 3, 255);
  drawWord(pixels, width, 24, 24, 9, 'CAFE');

  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(pixels.subarray(y * width * 3, (y + 1) * width * 3));
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.concat([
      u32(width),
      u32(height),
      Buffer.from([8, 2, 0, 0, 0]),
    ])),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  return `data:image/png;base64,${png.toString('base64')}`;
}

function drawWord(pixels: Buffer, width: number, x: number, y: number, scale: number, word: string) {
  let cursor = x;
  for (const letter of word) {
    drawGlyph(pixels, width, cursor, y, scale, letter);
    cursor += 6 * scale;
  }
}

function drawGlyph(pixels: Buffer, width: number, x: number, y: number, scale: number, letter: string) {
  const glyph = glyphs[letter] || glyphs[' '];
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] !== '1') continue;
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          const px = x + column * scale + xx;
          const py = y + row * scale + yy;
          const offset = (py * width + px) * 3;
          pixels[offset] = 10;
          pixels[offset + 1] = 18;
          pixels[offset + 2] = 28;
        }
      }
    }
  }
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([
    u32(data.length),
    typeBuffer,
    data,
    u32(crc32(crcInput)),
  ]);
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const glyphs: Record<string, string[]> = {
  C: [
    '01110',
    '10001',
    '10000',
    '10000',
    '10000',
    '10001',
    '01110',
  ],
  A: [
    '01110',
    '10001',
    '10001',
    '11111',
    '10001',
    '10001',
    '10001',
  ],
  F: [
    '11111',
    '10000',
    '10000',
    '11110',
    '10000',
    '10000',
    '10000',
  ],
  E: [
    '11111',
    '10000',
    '10000',
    '11110',
    '10000',
    '10000',
    '11111',
  ],
  ' ': [
    '00000',
    '00000',
    '00000',
    '00000',
    '00000',
    '00000',
    '00000',
  ],
};

await main();
