const workerGlobal = globalThis as Record<string, unknown>;

if (typeof workerGlobal.document === 'undefined') {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('Local PP-OCR requires OffscreenCanvas support in Web Workers.');
  }

  workerGlobal.document = {
    currentScript: null,
    title: '',
    createElement: (tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return new OffscreenCanvas(1, 1);
      }

      return {};
    },
    getElementById: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
}

workerGlobal.HTMLCanvasElement ??= OffscreenCanvas;
workerGlobal.HTMLImageElement ??= class HTMLImageElement {};
workerGlobal.HTMLVideoElement ??= class HTMLVideoElement {};
