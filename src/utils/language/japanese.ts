import Kuroshiro from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';

// Singleton instance for kuroshiro
let kuroshiroInstance: Kuroshiro | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize kuroshiro with kuromoji analyzer
 * This is async and only needs to be done once
 */
async function initKuroshiro(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }
  if (kuroshiroInstance) return;

  initPromise = (async () => {
    const instance = new Kuroshiro();
    await instance.init(new KuromojiAnalyzer({
      dictPath: '/kuromoji/dict/'
    }));
    kuroshiroInstance = instance;
  })().finally(() => { initPromise = null; });

  return initPromise;
}

/**
 * Convert Japanese text to furigana with ruby annotations
 * @param text - Japanese text to process
 * @returns HTML string with ruby annotations for furigana
 */
export async function addFuriganaAnnotations(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return '';
  }

  // Kuroshiro emits ruby markup but does not escape source text. Escape before
  // conversion, including the dictionary-failure fallback, before rendering HTML.
  const escapedText = text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  try {
    // Initialize kuroshiro if not already done
    await initKuroshiro();

    if (!kuroshiroInstance) {
      throw new Error('Kuroshiro failed to initialize');
    }

    // Convert to furigana using ruby mode
    const result = await kuroshiroInstance.convert(escapedText, {
      mode: 'furigana',
      to: 'hiragana',
    });

    return result;
  } catch (error) {
    console.error('Furigana conversion error:', error);
    // Return original text if conversion fails
    return escapedText;
  }
}

/**
 * Check if text contains Japanese characters
 */
export function isJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}
