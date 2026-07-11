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

const pendingRequests = new Map<number, {
  resolve: (value: OCRTextLocation[]) => void;
  reject: (reason?: unknown) => void;
}>();

let worker: Worker | null = null;
let requestId = 0;

const rejectAllPending = (error: Error) => {
  for (const { reject } of pendingRequests.values()) {
    reject(error);
  }
  pendingRequests.clear();
};

const resetWorker = (error: Error) => {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  rejectAllPending(error);
};

const getWorker = (): Worker => {
  if (worker) return worker;

  worker = new Worker(new URL('./localPpocrWorker.ts', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (event: MessageEvent<LocalPpocrWorkerResponse>) => {
    const { id, result, error } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;

    pendingRequests.delete(id);

    if (error) {
      pending.reject(new Error(error));
      return;
    }

    pending.resolve(result || []);
  };

  worker.onerror = (event) => {
    resetWorker(new Error(event.message || 'Local PP-OCR worker failed'));
  };

  worker.onmessageerror = () => {
    resetWorker(new Error('Local PP-OCR worker message failed'));
  };

  return worker;
};

const imageBase64ToImageData = (imageBase64: string): Promise<ImageData> => (
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Failed to create image canvas'));
        return;
      }

      context.drawImage(img, 0, 0);
      resolve(context.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error('Failed to decode image for local OCR'));
    img.src = imageBase64;
  })
);

export async function performLocalPpocr(imageBase64: string): Promise<OCRTextLocation[]> {
  console.log('[Local PP-OCR] Queueing local OCR request');

  const id = ++requestId;
  const currentWorker = getWorker();
  const imageData = await imageBase64ToImageData(imageBase64);

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    const message: LocalPpocrWorkerRequest = { id, imageData };
    try {
      currentWorker.postMessage(message);
    } catch (error) {
      pendingRequests.delete(id);
      reject(error);
    }
  });
}
