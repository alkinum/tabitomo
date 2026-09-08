import { DASHSCOPE_OCR_INTL_ENDPOINT, type AISettings, type ImageOCRSettings } from './settings';

export const OCR_HELP = 'Local OCR reads text and positions on this device. General AI or a custom vision model reads text without overlays. Qwen OCR provides a separate coordinate API. Pick the provider and model that suit your languages.';
export const LOCAL_MODEL_GUIDANCE = {
  whisper: 'Whisper Base · broad multilingual coverage. A good starting point for travel across languages.',
  sensevoice: 'SenseVoice Small · Chinese, Cantonese, English, Japanese and Korean; optional punctuation and number formatting.',
  ocr: 'PP-OCR v6 Small · text detection and recognition. iOS falls back to Apple Vision when the pack cannot run.',
  vision: 'For a local vision model, connect an Ollama or LM Studio server. On-device VLM inference is not included in this build.',
} as const;
export type OCRMode = 'local' | 'general' | 'custom' | 'qwen';
export function getOCRMode(ocr: ImageOCRSettings): OCRMode {
  return ocr.useGeneralAI ? 'general' : ocr.provider === 'local-ppocr' ? 'local' : ocr.provider;
}
export function selectOCRMode(settings: AISettings, mode: OCRMode): ImageOCRSettings {
  const current = settings.imageOCR;
  if (mode === getOCRMode(current)) return current;
  if (mode === 'local') return { ...current, provider: 'local-ppocr', useGeneralAI: false };
  if (mode === 'general') return { ...current, provider: 'custom', useGeneralAI: true };
  if (mode === 'qwen') return { ...current, provider: 'qwen', useGeneralAI: false, endpoint: DASHSCOPE_OCR_INTL_ENDPOINT, modelName: 'qwen3.5-ocr', apiKey: '' };
  return { ...current, provider: 'custom', useGeneralAI: false, endpoint: '', modelName: '', apiKey: '' };
}
