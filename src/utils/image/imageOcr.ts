import type { ImageOCRSettings, AISettings } from '../config/settings';
import { performLocalPpocr } from './localPpocr';
import { performOCR as performCloudOCR, type OCRTextLocation } from '../../../packages/tabitomo-core/src/image';
export { translateImageWithVLM, streamTranslateImageWithVLM, type OCRTextLocation } from '../../../packages/tabitomo-core/src/image';

/** Perform local PP-OCR in the browser or coordinate OCR through shared core. */
export async function performOCR(
  imageBase64: string,
  settings: ImageOCRSettings | AISettings,
  abortSignal?: AbortSignal
): Promise<OCRTextLocation[]> {
  const ocr = 'imageOCR' in settings ? settings.imageOCR : settings;
  if (ocr.provider === 'local-ppocr' && !ocr.useGeneralAI) {
    return performLocalPpocr(imageBase64);
  }
  return performCloudOCR(imageBase64, settings, abortSignal);
}

/**
 * Convert image file to base64
 */
export function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
