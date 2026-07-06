import { generateObject, generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { AISettings } from '../config/settings';

// All supported languages with their codes and English names
export const SUPPORTED_LANGUAGES = {
  zh: 'Chinese',
  en: 'English',
  fr: 'French',
  pt: 'Portuguese',
  es: 'Spanish',
  ja: 'Japanese',
  tr: 'Turkish',
  ru: 'Russian',
  ar: 'Arabic',
  ko: 'Korean',
  th: 'Thai',
  it: 'Italian',
  de: 'German',
  vi: 'Vietnamese',
  ms: 'Malay',
  id: 'Indonesian',
  tl: 'Filipino',
  hi: 'Hindi',
  'zh-Hant': 'Traditional Chinese',
  pl: 'Polish',
  cs: 'Czech',
  nl: 'Dutch',
  km: 'Khmer',
  my: 'Burmese',
  fa: 'Persian',
  gu: 'Gujarati',
  ur: 'Urdu',
  te: 'Telugu',
  mr: 'Marathi',
  he: 'Hebrew',
  bn: 'Bengali',
  ta: 'Tamil',
  uk: 'Ukrainian',
  bo: 'Tibetan',
  kk: 'Kazakh',
  mn: 'Mongolian',
  ug: 'Uyghur',
  yue: 'Cantonese'
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

// Translation result schema for structured output
const translationSchema = z.object({
  translatedText: z.string().describe('The translated text in the target language'),
  detectedLanguage: z.string().optional().describe('The detected source language code if language detection was performed'),
  confidence: z.number().min(0).max(1).optional().describe('Translation confidence score between 0 and 1')
});

// Initialize AI client based on provider
const getAIClient = (settings: AISettings) => {
  // Priority: 1. Translation service settings (if fully configured), 2. General AI service
  // Check if Translation service is fully configured (all three fields must be present)
  const useTranslationService = !!(settings.apiKey && settings.endpoint && settings.modelName);

  const apiKey = useTranslationService ? settings.apiKey : settings.generalAI.apiKey;
  const endpoint = useTranslationService ? settings.endpoint : settings.generalAI.endpoint;

  if (!apiKey) {
    throw new Error('API key is not configured');
  }

  // Always use OpenAI-compatible SDK
  return createOpenAICompatible({
    name: 'ai-provider',
    apiKey,
    baseURL: endpoint,
  });
};

/**
 * Check if the model is Hunyuan-MT
 */
const isHunyuanMT = (modelName: string): boolean => {
  const normalized = modelName.toLowerCase();
  return normalized === 'hunyuan-mt-7b' || normalized === 'tencent/hunyuan-mt-7b';
};

/**
 * Check if text contains any brackets (English, Chinese, or other forms)
 */
const containsBrackets = (text: string): boolean => {
  // Match English brackets: () [] {}
  // Match Chinese brackets: （） 【】 ｛｝
  // Match other bracket forms
  const bracketRegex = /[()[\]{}（）【】｛｝]/;
  return bracketRegex.test(text);
};

/**
 * Filter trailing brackets from Hunyuan-MT output
 * Only removes brackets at the end of the text if they were not in the source
 */
const filterTrailingBrackets = (text: string, sourceText: string): string => {
  // If source text contains brackets, don't filter
  if (containsBrackets(sourceText)) {
    return text;
  }

  // If output doesn't contain brackets, no need to filter
  if (!containsBrackets(text)) {
    return text;
  }

  // Remove trailing brackets and their content
  // Match brackets at the end with optional whitespace
  // This regex captures trailing bracket content: (xxx), （xxx）, [xxx], 【xxx】, {xxx}, ｛xxx｝
  const trailingBracketRegex = /\s*[(（[【{｛][^)）\]】}｝]*[)）\]】}｝]\s*$/;

  return text.replace(trailingBracketRegex, '').trim();
};

/**
 * Translate text using AI with structured JSON output
 * @param text - The text to translate
 * @param sourceLang - Source language code
 * @param targetLang - Target language code
 * @param settings - AI settings containing API key, endpoint, and model
 * @param abortSignal - Optional AbortSignal to cancel the request
 * @returns Translated text
 */
export async function translateText(
  text: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  settings: AISettings,
  abortSignal?: AbortSignal
): Promise<string> {
  // If source and target are the same, return original text
  if (sourceLang === targetLang) {
    return text;
  }

  // Validate text input
  if (!text || text.trim().length === 0) {
    return '';
  }

  try {
    const client = getAIClient(settings);
    // Priority: 1. Translation service (if fully configured), 2. General AI service
    const useTranslationService = !!(settings.apiKey && settings.endpoint && settings.modelName);
    const modelName = useTranslationService ? settings.modelName : settings.generalAI.modelName;
    const sourceLangName = SUPPORTED_LANGUAGES[sourceLang];
    const targetLangName = SUPPORTED_LANGUAGES[targetLang];

    // Use chat completion for Hunyuan-MT model
    if (isHunyuanMT(modelName)) {
      // Determine if either source or target is Chinese
      const isChineseInvolved = sourceLang === 'zh' || sourceLang === 'zh-Hant' ||
                                targetLang === 'zh' || targetLang === 'zh-Hant';

      let prompt: string;
      if (isChineseInvolved) {
        // Chinese prompt for ZH<=>XX translation
        prompt = `把下面的文本翻译成${targetLangName}，不要输出任何的额外解释。\n\n${text}`;
      } else {
        // English prompt for XX<=>XX translation
        prompt = `Translate the following segment into ${targetLangName}, without additional explanation.\n\n${text}`;
      }

      const result = await generateText({
        model: client(modelName),
        prompt: prompt,
        abortSignal,
      });

      // Filter trailing brackets from the translation result
      const filteredText = filterTrailingBrackets(result.text, text);

      return filteredText;
    }

    // For general AI models, check output mode preference
    if (!useTranslationService) {
      const outputMode = settings.translation?.outputMode || 'structured';

      if (outputMode === 'plain') {
        // Plain text output mode - simpler prompt, no JSON parsing
        const result = await generateText({
          model: client(modelName),
          prompt: `You are a professional translator. Translate the following text from ${sourceLangName} (${sourceLang}) to ${targetLangName} (${targetLang}).

Text to translate: "${text}"

Instructions:
1. Provide an accurate and natural translation
2. Preserve the tone and style of the original text
3. If the text contains idioms or cultural references, adapt them appropriately for the target language
4. Maintain any formatting or special characters
5. Return ONLY the translated text, without any additional explanation or formatting`,
          abortSignal,
        });

        // Strip any thinking tags that some models might add
        let cleanText = result.text.trim();
        cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '');
        cleanText = cleanText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        cleanText = cleanText.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
        cleanText = cleanText.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
        return cleanText.trim();
      }

      // Structured output mode - JSON response with parsing
      const result = await generateText({
        model: client(modelName),
        prompt: `You are a professional translator. Translate the following text from ${sourceLangName} (${sourceLang}) to ${targetLangName} (${targetLang}).

Text to translate: "${text}"

Instructions:
1. Provide an accurate and natural translation
2. Preserve the tone and style of the original text
3. If the text contains idioms or cultural references, adapt them appropriately for the target language
4. Maintain any formatting or special characters
5. Return ONLY a JSON object with the translation

Respond with ONLY a JSON object in this format:
{"translation": "your translated text here"}

Do not include any other text, explanation, or markdown formatting.`,
        abortSignal,
      });

      // Try to parse JSON response, handling different structures
      try {
        // Remove thinking tags and other XML-like tags that some models add
        let jsonText = result.text.trim();

        // Remove thinking tags: <think>...</think>, <thinking>...</thinking>, etc.
        jsonText = jsonText.replace(/<think>[\s\S]*?<\/think>/gi, '');
        jsonText = jsonText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        jsonText = jsonText.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
        jsonText = jsonText.replace(/<thought>[\s\S]*?<\/thought>/gi, '');

        // Remove markdown code blocks if present
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/```\s*/g, '').replace(/```\s*$/g, '');
        }

        // Trim again after removing tags
        jsonText = jsonText.trim();

        const parsed = JSON.parse(jsonText);

        // Check for various possible field names
        const translatedText = parsed.translation || parsed.translate || parsed.translatedText || parsed.text || '';

        if (translatedText && typeof translatedText === 'string') {
          return translatedText;
        }

        // If no recognized field found, throw error
        throw new Error('Translation response does not contain a valid translation field');
      } catch (parseError) {
        console.warn('Failed to parse JSON response, using raw text:', result.text, parseError);
        // Fallback: return the raw text if JSON parsing fails, but strip thinking tags
        let cleanText = result.text;
        cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '');
        cleanText = cleanText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        cleanText = cleanText.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
        cleanText = cleanText.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
        return cleanText.trim();
      }
    }

    // Use structured output for translation service (more strict validation)
    const result = await generateObject({
      model: client(modelName),
      schema: translationSchema,
      prompt: `You are a professional translator. Translate the following text from ${sourceLangName} (${sourceLang}) to ${targetLangName} (${targetLang}).

Text to translate: "${text}"

Instructions:
1. Provide an accurate and natural translation
2. Preserve the tone and style of the original text
3. If the text contains idioms or cultural references, adapt them appropriately for the target language
4. Maintain any formatting or special characters
5. Return only the translation in the JSON format specified

Respond with the translation in JSON format.`,
      abortSignal,
    });

    return result.object.translatedText;
  } catch (error) {
    console.error('Translation error:', error);

    // Provide user-friendly error messages
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();

      // API Key errors
      if (errorMsg.includes('api key') || errorMsg.includes('unauthorized') || errorMsg.includes('401')) {
        throw new Error('Invalid API key. Please check your API key in Settings.');
      }

      // Network errors
      if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('econnrefused')) {
        throw new Error('Network error. Please check your internet connection and API endpoint.');
      }

      // Endpoint errors
      if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        throw new Error('Invalid API endpoint. Please check your endpoint URL in Settings.');
      }

      // Rate limit errors
      if (errorMsg.includes('rate limit') || errorMsg.includes('429') || errorMsg.includes('quota')) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      // Model errors
      if (errorMsg.includes('model') || errorMsg.includes('not support')) {
        throw new Error('Model error. Please check your model name in Settings.');
      }

      // Timeout errors
      if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        throw new Error('Request timed out. Please try again.');
      }

      // Generic error with original message
      throw new Error(`Translation failed: ${error.message}`);
    }

    throw new Error('Translation failed. Please try again.');
  }
}

/**
 * Detect the language of the input text
 * @param text - The text to analyze
 * @param settings - AI settings containing API key, endpoint, and model
 * @returns Detected language code
 */
export async function detectLanguage(text: string, settings: AISettings): Promise<LanguageCode> {
  if (!text || text.trim().length === 0) {
    return 'en'; // Default to English
  }

  try {
    const client = getAIClient(settings);
    // Priority: 1. Translation service (if fully configured), 2. General AI service
    const useTranslationService = !!(settings.apiKey && settings.endpoint && settings.modelName);
    const modelName = useTranslationService ? settings.modelName : settings.generalAI.modelName;

    const languageDetectionSchema = z.object({
      languageCode: z.string().describe('The detected language code'),
      confidence: z.number().min(0).max(1).describe('Detection confidence score')
    });

    const supportedCodes = Object.keys(SUPPORTED_LANGUAGES).join(', ');

    const result = await generateObject({
      model: client(modelName),
      schema: languageDetectionSchema,
      prompt: `Detect the language of the following text. Return the language code from this list: ${supportedCodes}.

Text: "${text}"

Respond with the language code and confidence score in JSON format.`,
    });

    const detectedCode = result.object.languageCode as LanguageCode;

    // Validate the detected code is in our supported list
    if (detectedCode in SUPPORTED_LANGUAGES) {
      return detectedCode;
    }

    return 'en'; // Fallback to English
  } catch (error) {
    console.error('Language detection error:', error);
    return 'en'; // Fallback to English on error
  }
}
