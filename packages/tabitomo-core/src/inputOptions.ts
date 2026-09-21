import { DASHSCOPE_OCR_INTL_ENDPOINT, JINA_OCR_ENDPOINT, JINA_OCR_MODEL, type AISettings, type ImageOCRSettings } from './settings';

export const OCR_HELP = 'Local and Qwen OCR support image overlays. Jina OCR, General AI and custom vision return text.';
export const LOCAL_MODEL_GUIDANCE = {
  whisper: 'Whisper Base · broad multilingual coverage. A good starting point for travel across languages.',
  sensevoice: 'SenseVoice Small · Chinese, Cantonese, English, Japanese and Korean; optional punctuation and number formatting.',
  ocr: 'PP-OCR v6 Small · text detection and recognition. iOS falls back to Apple Vision when the pack cannot run.',
  vision: 'For a local vision model, connect an Ollama or LM Studio server. On-device VLM inference is not included in this build.',
} as const;
export const OCR_MODE_OPTIONS = [
  { value: 'local', label: 'Local OCR' },
  { value: 'general', label: 'General AI' },
  { value: 'jina', label: 'Jina OCR' },
  { value: 'qwen', label: 'Alibaba Qwen-OCR' },
  { value: 'custom', label: 'Custom vision' },
] as const;
export type OCRMode = typeof OCR_MODE_OPTIONS[number]['value'];
export function supportsOCROverlay(ocr: ImageOCRSettings): boolean {
  return !ocr.useGeneralAI && (ocr.provider === 'local-ppocr' || ocr.provider === 'qwen');
}
export function getOCRMode(ocr: ImageOCRSettings): OCRMode {
  return ocr.useGeneralAI ? 'general' : ocr.provider === 'local-ppocr' ? 'local' : ocr.provider;
}
export function selectOCRMode(settings: AISettings, mode: OCRMode): ImageOCRSettings {
  const current = settings.imageOCR;
  if (mode === getOCRMode(current)) return current;
  if (mode === 'local') return { ...current, provider: 'local-ppocr', useGeneralAI: false };
  if (mode === 'general') return { ...current, provider: 'custom', useGeneralAI: true };
  if (mode === 'qwen') return { ...current, provider: 'qwen', useGeneralAI: false, endpoint: DASHSCOPE_OCR_INTL_ENDPOINT, modelName: 'qwen3.5-ocr', apiKey: '' };
  if (mode === 'jina') return { ...current, provider: 'jina', useGeneralAI: false, endpoint: JINA_OCR_ENDPOINT, modelName: JINA_OCR_MODEL, apiKey: '' };
  return { ...current, provider: 'custom', useGeneralAI: false, endpoint: '', modelName: '', apiKey: '' };
}
