declare module 'kuroshiro' {
  export interface KuroshiroOptions {
    to?: 'hiragana' | 'katakana' | 'romaji';
    mode?: 'normal' | 'spaced' | 'okurigana' | 'furigana';
    romajiSystem?: 'nippon' | 'passport' | 'hepburn';
  }

  export default class Kuroshiro {
    constructor();
    init(analyzer: unknown): Promise<void>;
    convert(text: string, options?: KuroshiroOptions): Promise<string>;
  }
}

declare module 'kuroshiro-analyzer-kuromoji' {
  export default class KuromojiAnalyzer {
    constructor(options?: { dictPath?: string });
  }
}
