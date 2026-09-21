// Language code to Web Speech API locale mapping
const SPEECH_LANG_MAP: Record<string, string> = {
  zh: 'zh-CN',
  'zh-Hant': 'zh-TW',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-BR',
  ru: 'ru-RU',
  ar: 'ar-SA',
  it: 'it-IT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  tr: 'tr-TR',
  vi: 'vi-VN',
  th: 'th-TH',
  hi: 'hi-IN',
  id: 'id-ID',
  ms: 'ms-MY',
  cs: 'cs-CZ',
  uk: 'uk-UA',
  he: 'he-IL',
  fa: 'fa-IR',
  bn: 'bn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  ur: 'ur-PK',
  tl: 'fil-PH',
  yue: 'yue-Hant-HK',
};

/**
 * Get the Web Speech API locale for a language code
 */
export function getSpeechLocale(langCode: string): string {
  return SPEECH_LANG_MAP[langCode] || langCode;
}

/**
 * Text-to-speech using Web Speech API
 */
export function speakText(text: string, langCode: string, onEnd?: () => void): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }

  // Check if browser supports speech synthesis
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported in this browser');
    return false;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  utterance.lang = getSpeechLocale(langCode);
  utterance.rate = 0.9; // Slightly slower for better clarity
  utterance.pitch = 1;
  utterance.volume = 1;

  // Try to find a voice that matches the language
  const voices = window.speechSynthesis.getVoices();
  const matchingVoice = voices.find(voice =>
    voice.lang.startsWith(getSpeechLocale(langCode).split('-')[0])
  );

  if (matchingVoice) {
    utterance.voice = matchingVoice;
  }

  window.speechSynthesis.speak(utterance);
  return true;
}

/**
 * Stop any ongoing speech
 */
export function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
