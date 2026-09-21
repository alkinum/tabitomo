export type TranslationModelFamily = 'hy-mt2' | 'general';

/** Provider prefixes and quantized variants do not change the model's prompt contract. */
export function getTranslationModelFamily(modelName: string): TranslationModelFamily {
  const name = modelName.trim().split('/').pop()?.toLowerCase() || '';
  if (/^(?:hy|hunyuan)-mt-?2(?:[.\-_:]|$)/.test(name)) return 'hy-mt2';
  return 'general';
}

export const preferredTranslationOutputMode = (modelName: string): 'plain' | 'structured' =>
  getTranslationModelFamily(modelName) === 'general' ? 'structured' : 'plain';
