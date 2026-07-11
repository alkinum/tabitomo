import './localPpocrWorkerDom';
import { PaddleOCR, type OcrResultItem } from '@paddleocr/paddleocr-js';
import type { OCRTextLocation } from './imageOcr';

interface LocalPpocrWorkerRequest {
  id: number;
  imageData: ImageData;
}

interface LocalPpocrWorkerResponse {
  id: number;
  result?: OCRTextLocation[];
  error?: string;
}

type PaddleOCRInstance = Awaited<ReturnType<typeof PaddleOCR.create>>;

let ocrPromise: Promise<PaddleOCRInstance> | null = null;
let requestQueue: Promise<void> = Promise.resolve();

const getLocalOCR = (): Promise<PaddleOCRInstance> => {
  if (!ocrPromise) {
    ocrPromise = PaddleOCR.create({
      lang: 'ch',
      ocrVersion: 'PP-OCRv5',
      textRecognitionBatchSize: 6,
      ortOptions: {
        backend: 'wasm',
        numThreads: 1,
        simd: true,
      },
    }).catch((error) => {
      ocrPromise = null;
      throw error;
    });
  }

  return ocrPromise;
};

const toLocation = (poly: OcrResultItem['poly']): OCRTextLocation['location'] | undefined => {
  if (poly.length < 4) return undefined;

  const points = poly.slice(0, 4);
  return [
    points[0][0],
    points[0][1],
    points[1][0],
    points[1][1],
    points[2][0],
    points[2][1],
    points[3][0],
    points[3][1],
  ];
};

const toRotateRect = (poly: OcrResultItem['poly']): OCRTextLocation['rotate_rect'] | undefined => {
  if (poly.length < 4) return undefined;

  const xs = poly.map(([x]) => x);
  const ys = poly.map(([, y]) => y);
  const centerX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const centerY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const width = Math.hypot(poly[1][0] - poly[0][0], poly[1][1] - poly[0][1]);
  const height = Math.hypot(poly[2][0] - poly[1][0], poly[2][1] - poly[1][1]);
  const angle = Math.atan2(poly[1][1] - poly[0][1], poly[1][0] - poly[0][0]) * 180 / Math.PI;

  return [centerX, centerY, width, height, angle];
};

const performLocalPpocrInWorker = async (imageData: ImageData): Promise<OCRTextLocation[]> => {
  const ocr = await getLocalOCR();
  const [result] = await ocr.predict(imageData);

  if (!result) {
    return [];
  }

  console.log('[Local PP-OCR] Recognition metrics:', result.metrics);

  return result.items
    .filter((item) => item.text.trim().length > 0)
    .map((item) => ({
      text: item.text,
      location: toLocation(item.poly),
      rotate_rect: toRotateRect(item.poly),
    }));
};

const handleRequest = async ({ id, imageData }: LocalPpocrWorkerRequest) => {
  console.log('[Local PP-OCR] Running local OCR request');

  try {
    const result = await performLocalPpocrInWorker(imageData);
    self.postMessage({ id, result } satisfies LocalPpocrWorkerResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, error: message } satisfies LocalPpocrWorkerResponse);
  }
};

self.onmessage = (event: MessageEvent<LocalPpocrWorkerRequest>) => {
  const { id, imageData } = event.data;

  try {
    requestQueue = requestQueue.then(
      () => handleRequest({ id, imageData }),
      () => handleRequest({ id, imageData })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, error: message } satisfies LocalPpocrWorkerResponse);
  }
};
