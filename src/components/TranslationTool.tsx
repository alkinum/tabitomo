import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { translateText, SUPPORTED_LANGUAGES, type LanguageCode } from '../utils/translation/translation';
import { speakText, getSpeechLocale } from '../utils/audio/speech';
import { transcribeAudioSiliconFlow } from '../utils/audio/audioTranscription';
import { RealtimeTranscriptionService } from '../utils/audio/realtimeTranscription';
import { localAsrService } from '../utils/audio/localAsr';
import { performOCR, imageToBase64, streamTranslateImageWithVLM } from '../utils/image/imageOcr';
import { explainWord, quickQA } from '../utils/translation/explanation';
import { Mic, Image as ImageIcon, ArrowUpDown, X, Copy, Check, Volume2, Camera, Keyboard, Settings, MessageCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { AISettings } from '../utils/config/settings';
import { ImageLightbox } from './ImageLightbox';

// Lazy load CameraPanel - only loaded when user opens camera
const CameraPanel = lazy(() => import('./CameraPanel').then(module => ({ default: module.CameraPanel })));
import { useToast } from './ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

// Language options - generated from SUPPORTED_LANGUAGES
const languageOptions = Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
  value: code,
  label: name
}));

type InputMethod = 'text' | 'image' | 'qa';
type TextMode = 'translation' | 'explanation';

interface TranslationToolProps {
  settings: AISettings;
  onOpenSettings: (initialTab?: 'general' | 'translation' | 'speech' | 'image') => void;
}

interface CachedTranslation {
  result: string;
  timestamp: number;
}

// Cache duration: 10 minutes
const CACHE_DURATION = 10 * 60 * 1000;

export const TranslationTool: React.FC<TranslationToolProps> = ({ settings, onOpenSettings }) => {
  // Language state
  const [sourceLang, setSourceLang] = useState<LanguageCode>('zh');
  const [targetLang, setTargetLang] = useState<LanguageCode>('ja');
  // Text state
  const [sourceText, setSourceText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [furiganaHtml, setFuriganaHtml] = useState<string | null>(null);
  // UI state
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [textMode, setTextMode] = useState<TextMode>('translation');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const realtimeTranscriptionRef = useRef<RealtimeTranscriptionService | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const realtimeTranslationTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Image state
  const [image, setImage] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [translatedImage, setTranslatedImage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [useVLMMode, setUseVLMMode] = useState(false);
  const [parsedMarkdown, setParsedMarkdown] = useState<string>('');
  // Animation refs
  const targetInputRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // AbortController refs for cancelling ongoing requests
  const translationAbortControllerRef = useRef<AbortController | null>(null);
  const explanationAbortControllerRef = useRef<AbortController | null>(null);
  const qaAbortControllerRef = useRef<AbortController | null>(null);
  const imageAbortControllerRef = useRef<AbortController | null>(null);
  // Translation cache
  const translationCacheRef = useRef<Map<string, CachedTranslation>>(new Map());
  const speechProvider = settings.speechRecognition.provider;
  // Toast hook
  const { toast } = useToast();

  // Check if general AI service is configured
  const isGeneralAIConfigured = () => {
    return !!(settings.generalAI.apiKey && settings.generalAI.endpoint && settings.generalAI.modelName);
  };

  // Check if VLM is configured
  const isVLMConfigured = () => {
    const vlmConfig = settings.vlm;

    if (vlmConfig.useGeneralAI) {
      // Using general AI settings
      return isGeneralAIConfigured();
    } else if (vlmConfig.useCustom) {
      // Using custom VLM settings
      return !!(vlmConfig.apiKey && vlmConfig.endpoint && vlmConfig.modelName);
    } else {
      // Using OCR settings - check if OCR is using General AI or its own settings
      if (settings.imageOCR.useGeneralAI) {
        return isGeneralAIConfigured();
      } else if (settings.imageOCR.provider === 'local-ppocr') {
        return false;
      } else {
        return !!(settings.imageOCR.apiKey && settings.imageOCR.endpoint);
      }
    }
  };

  // Check if OCR is configured
  const isOCRConfigured = () => {
    if (settings.imageOCR.useGeneralAI) {
      return isGeneralAIConfigured();
    } else if (settings.imageOCR.provider === 'local-ppocr') {
      return true;
    } else {
      return !!(settings.imageOCR.apiKey && settings.imageOCR.endpoint);
    }
  };

  // Handle input method change and clear inputs
  const handleInputMethodChange = (method: InputMethod) => {
    const previousMethod = inputMethod;
    setInputMethod(method);
    // Reset text mode when changing input method
    setTextMode('translation');
    // Clear all inputs and outputs
    setSourceText('');
    setTargetText('');
    setImage(null);
    setTranslatedImage(null);
    setError(null);
    // Stop any ongoing recording
    if (isRecording) {
      stopRecording();
    }
    // Auto-swap languages when switching between modes
    if (previousMethod === 'text' && method === 'image') {
      // Switching from text to image: swap languages
      const tempLang = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(tempLang);
    } else if (previousMethod === 'image' && method === 'text') {
      // Switching from image to text: swap back
      const tempLang = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(tempLang);
    } else if (previousMethod === 'image' && method === 'qa') {
      // Switching from image to q/a: swap languages
      const tempLang = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(tempLang);
    } else if (previousMethod === 'qa' && method === 'image') {
      // Switching from q/a to image: swap back
      const tempLang = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(tempLang);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && inputMethod === 'text') {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [sourceText, inputMethod]);

  // Generate cache key
  const getCacheKey = (text: string, from: LanguageCode, to: LanguageCode): string => {
    return `${from}:${to}:${text}`;
  };

  // Check if cached translation is still valid
  const getCachedTranslation = (text: string, from: LanguageCode, to: LanguageCode): string | null => {
    const key = getCacheKey(text, from, to);
    const cached = translationCacheRef.current.get(key);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.result;
    }

    // Remove expired cache entry
    if (cached) {
      translationCacheRef.current.delete(key);
    }

    return null;
  };

  // Save translation to cache
  const cacheTranslation = (text: string, from: LanguageCode, to: LanguageCode, result: string): void => {
    const key = getCacheKey(text, from, to);
    translationCacheRef.current.set(key, {
      result,
      timestamp: Date.now(),
    });

    // Clean up old cache entries (keep cache size manageable)
    if (translationCacheRef.current.size > 100) {
      const entries = Array.from(translationCacheRef.current.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      // Remove oldest 20 entries
      for (let i = 0; i < 20; i++) {
        translationCacheRef.current.delete(entries[i][0]);
      }
    }
  };

  // Generate furigana HTML when target text changes and target is Japanese
  useEffect(() => {
    if (targetText && targetLang === 'ja') {
      // Dynamically import Japanese utilities only when needed
      import('../utils/language/japanese').then(({ addFuriganaAnnotations }) => {
        addFuriganaAnnotations(targetText).then(html => {
          setFuriganaHtml(html);
        });
      });
    } else {
      setFuriganaHtml(null);
    }
  }, [targetText, targetLang]);

  // Parse markdown when targetText changes for VLM/QA/Explanation modes
  useEffect(() => {
    if (targetText && (useVLMMode || inputMethod === 'qa' || textMode === 'explanation')) {
      // Dynamically import marked only when needed
      import('marked').then(({ marked }) => {
        setParsedMarkdown(marked.parse(targetText) as string);
      });
    } else {
      setParsedMarkdown('');
    }
  }, [targetText, useVLMMode, inputMethod, textMode]);

  // Handle language swap
  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(targetText);
    setTargetText(sourceText);
    // Add a little animation to the swap button
    const swapButton = document.getElementById('swap-button');
    if (swapButton) {
      swapButton.classList.add('rotate-animation');
      setTimeout(() => {
        swapButton.classList.remove('rotate-animation');
      }, 500);
    }
  };
  // Handle translation
  const handleTranslate = async (text: string, from: LanguageCode, to: LanguageCode) => {
    if (!text.trim()) {
      setTargetText('');
      return;
    }

    // Check if source and target languages are the same
    if (from === to) {
      toast({
        variant: "destructive",
        title: "Invalid Language Selection",
        description: "Source and target languages cannot be the same. Please select different languages.",
      });
      return;
    }

    // Check cache first
    const cachedResult = getCachedTranslation(text, from, to);
    if (cachedResult) {
      setTargetText(cachedResult);
      return;
    }

    // Cancel any existing translation request
    if (translationAbortControllerRef.current) {
      translationAbortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    translationAbortControllerRef.current = abortController;

    setIsTranslating(true);
    setError(null);

    try {
      const result = await translateText(text, from, to, settings, abortController.signal);

      // Only update state if this request wasn't cancelled
      if (!abortController.signal.aborted) {
        setTargetText(result);
        // Cache the result
        cacheTranslation(text, from, to, result);
      }
    } catch (error) {
      // Don't show error if request was cancelled
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[Translation] Request was cancelled');
        return;
      }
      console.error('Translation error:', error);
      setError(error instanceof Error ? error.message : 'Translation failed');
      setTargetText('');
    } finally {
      // Only clear loading state if this is still the active request
      if (translationAbortControllerRef.current === abortController) {
        setIsTranslating(false);
        translationAbortControllerRef.current = null;
      }
    }
  };
  // Handle explanation (word/sentence/grammar)
  const handleWordExplanation = async (word: string, wordLang: LanguageCode, explanationLang: LanguageCode) => {
    if (!word.trim()) {
      setTargetText('');
      return;
    }

    // Check if source and target languages are the same
    if (wordLang === explanationLang) {
      toast({
        variant: "destructive",
        title: "Invalid Language Selection",
        description: "Source and target languages cannot be the same. Please select a different target language.",
      });
      return;
    }

    // Check if general AI is configured
    if (!isGeneralAIConfigured()) {
      toast({
        variant: "destructive",
        title: "General AI Service Required",
        description: "Please configure the General AI service in Settings to use the Explanation feature.",
        action: (
          <button
            onClick={() => onOpenSettings('general')}
            className="px-3 py-1.5 bg-white text-indigo-600 text-xs rounded-lg hover:bg-indigo-50"
          >
            Open Settings
          </button>
        ),
      });
      return;
    }

    // Cancel any existing explanation request
    if (explanationAbortControllerRef.current) {
      explanationAbortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    explanationAbortControllerRef.current = abortController;

    setIsTranslating(true);
    setError(null);
    setTargetText('');
    setIsThinking(false);

    try {
      let streamedText = '';
      for await (const chunk of explainWord(word, wordLang, explanationLang, settings, abortController.signal)) {
        // Check if request was cancelled
        if (abortController.signal.aborted) {
          break;
        }

        // Handle thinking markers
        if (chunk === '___THINKING_START___') {
          setIsThinking(true);
          continue;
        }
        if (chunk === '___THINKING_END___') {
          setIsThinking(false);
          continue;
        }

        streamedText += chunk;
        setTargetText(streamedText);
      }
    } catch (error) {
      // Don't show error if request was cancelled
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[Explanation] Request was cancelled');
        return;
      }
      console.error('Explanation error:', error);
      setError(error instanceof Error ? error.message : 'Explanation failed');
      setTargetText('');
    } finally {
      // Only clear loading state if this is still the active request
      if (explanationAbortControllerRef.current === abortController) {
        setIsTranslating(false);
        setIsThinking(false);
        explanationAbortControllerRef.current = null;
      }
    }
  };

  // Handle Q/A
  const handleQA = async (question: string, questionLang: LanguageCode, answerLang: LanguageCode) => {
    if (!question.trim()) {
      setTargetText('');
      return;
    }

    // Check if source and target languages are the same
    if (questionLang === answerLang) {
      toast({
        variant: "destructive",
        title: "Invalid Language Selection",
        description: "Source and target languages cannot be the same. Please select a different target language.",
      });
      return;
    }

    // Check if general AI is configured
    if (!isGeneralAIConfigured()) {
      toast({
        variant: "destructive",
        title: "General AI Service Required",
        description: "Please configure the General AI service in Settings to use the Q&A feature.",
        action: (
          <button
            onClick={() => onOpenSettings('general')}
            className="px-3 py-1.5 bg-white text-indigo-600 text-xs rounded-lg hover:bg-indigo-50"
          >
            Open Settings
          </button>
        ),
      });
      return;
    }

    // Cancel any existing Q/A request
    if (qaAbortControllerRef.current) {
      qaAbortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    qaAbortControllerRef.current = abortController;

    setIsTranslating(true);
    setError(null);
    setTargetText('');
    setIsThinking(false);

    try {
      let streamedText = '';
      for await (const chunk of quickQA(question, questionLang, answerLang, settings, abortController.signal)) {
        // Check if request was cancelled
        if (abortController.signal.aborted) {
          break;
        }

        // Handle thinking markers
        if (chunk === '___THINKING_START___') {
          setIsThinking(true);
          continue;
        }
        if (chunk === '___THINKING_END___') {
          setIsThinking(false);
          continue;
        }

        streamedText += chunk;
        setTargetText(streamedText);
      }
    } catch (error) {
      // Don't show error if request was cancelled
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[Q/A] Request was cancelled');
        return;
      }
      console.error('Q/A error:', error);
      setError(error instanceof Error ? error.message : 'Q/A failed');
      setTargetText('');
    } finally {
      // Only clear loading state if this is still the active request
      if (qaAbortControllerRef.current === abortController) {
        setIsTranslating(false);
        setIsThinking(false);
        qaAbortControllerRef.current = null;
      }
    }
  };

  // Handle text input
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setSourceText(newText);

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Auto translate/explain/answer after a short delay
    if (newText.trim()) {
      debounceTimerRef.current = setTimeout(() => {
        if (inputMethod === 'text' && textMode === 'explanation') {
          handleWordExplanation(newText, sourceLang, targetLang);
        } else if (inputMethod === 'qa') {
          handleQA(newText, sourceLang, targetLang);
        } else {
          handleTranslate(newText, sourceLang, targetLang);
        }
      }, 600);
    } else {
      setTargetText('');
    }
  };
  // Handle copy to clipboard
  const copyToClipboard = () => {
    if (!targetText) return;
    navigator.clipboard.writeText(targetText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  // Handle audio recording
  const startRecording = async () => {
    // Clear existing text when starting new recording
    setSourceText('');
    setTargetText('');
    setError(null);

    setIsRecording(true);
    setInterimTranscript('');

    if (speechProvider === 'local' && !settings.speechRecognition.localModelPath?.trim()) {
      setIsRecording(false);
      toast({
        variant: "destructive",
        title: "Local Model Required",
        description: "Set a sherpa-onnx model directory in Speech settings before using local voice input.",
        action: (
          <button
            onClick={() => onOpenSettings('speech')}
            className="px-3 py-1.5 bg-white text-indigo-600 text-xs rounded-lg hover:bg-indigo-50"
          >
            Open Settings
          </button>
        ),
      });
      return;
    }

    // Use cloud or local transcription providers when configured
    if (speechProvider === 'siliconflow' || speechProvider === 'local') {
      // Check if realtime transcription is enabled
      const useRealtime = settings.speechRecognition.enableRealtimeTranscription !== false;

      if (useRealtime) {
        // Use realtime transcription with VAD
        console.log('[Realtime] Starting realtime transcription...');
        try {
          // Helper to determine if source language uses spaces
          const sourceLangUsesSpaces = !['zh', 'ja', 'ko'].includes(sourceLang);

          realtimeTranscriptionRef.current = new RealtimeTranscriptionService(settings, {
            sourceLang,
            onTranscript: (text: string, isFinal: boolean) => {
              console.log('[Realtime] Received transcript:', text, 'isFinal:', isFinal);

              if (isFinal) {
                // Final transcript - append to source text
                setSourceText(prev => {
                  if (!prev) return text;
                  // Smart joining: use space for languages that use spaces, no space for CJK
                  const separator = sourceLangUsesSpaces ? ' ' : '';
                  return prev + separator + text;
                });

                // Clear interim transcript
                setInterimTranscript('');

                // Debounce translation to avoid too many API calls
                if (realtimeTranslationTimerRef.current) {
                  clearTimeout(realtimeTranslationTimerRef.current);
                }

                realtimeTranslationTimerRef.current = setTimeout(() => {
                  const currentText = sourceText + (sourceLangUsesSpaces ? ' ' : '') + text;
                  if (currentText.trim()) {
                    handleTranslate(currentText.trim(), sourceLang, targetLang);
                  }
                }, 800); // Wait 800ms after last final transcript before translating
              } else {
                // Interim result - show as preview
                setInterimTranscript(text);
              }
            },
            onError: (error: Error) => {
              console.error('[Realtime] Error:', error);
              setError(error.message);
            },
          });

          await realtimeTranscriptionRef.current.start();
          console.log('[Realtime] Realtime transcription started');
        } catch (err) {
          console.error('[Realtime] Failed to start realtime transcription:', err);

          // Check if it's a permission error
          if (err instanceof Error &&
              (err.name === 'NotAllowedError' ||
               err.name === 'PermissionDeniedError' ||
               err.message.includes('Permission denied') ||
               err.message.includes('permission'))) {
            toast({
              variant: "destructive",
              title: "Microphone Permission Denied",
              description: "Please allow microphone access in your browser settings to use voice input.",
            });
          } else {
            setError('Failed to access microphone for realtime transcription');
          }
          setIsRecording(false);
        }
      } else {
        // Use traditional recording (wait for full audio)
        console.log('[Audio] Starting traditional audio recording...');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioChunksRef.current = [];

          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

            try {
              const transcribedText = speechProvider === 'local'
                ? await localAsrService.transcribeBlob(audioBlob, settings, { sourceLang })
                : await transcribeAudioSiliconFlow(audioBlob, settings);
              setSourceText(transcribedText);
              if (transcribedText) {
                handleTranslate(transcribedText, sourceLang, targetLang);
              }
            } catch (err) {
              console.error('Transcription error:', err);
              setError(err instanceof Error ? err.message : 'Transcription failed');
            }

            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
          };

          mediaRecorder.start();
        } catch (err) {
          console.error('Failed to start recording:', err);

          // Check if it's a permission error
          if (err instanceof Error &&
              (err.name === 'NotAllowedError' ||
               err.name === 'PermissionDeniedError' ||
               err.message.includes('Permission denied') ||
               err.message.includes('permission'))) {
            toast({
              variant: "destructive",
              title: "Microphone Permission Denied",
              description: "Please allow microphone access in your browser settings to use voice input.",
            });
          } else {
            setError('Failed to access microphone');
          }
          setIsRecording(false);
        }
      }
    } else {
      // Use Web Speech API
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognitionAPI) {
        recognitionRef.current = new SpeechRecognitionAPI();

        // Set language using proper locale
        recognitionRef.current.lang = getSpeechLocale(sourceLang);
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.maxAlternatives = 1;

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map((result: SpeechRecognitionResult) => result[0].transcript)
            .join('');
          setSourceText(transcript);
        };

        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);

          // Check if it's a permission error
          if (event.error === 'not-allowed' || event.error === 'audio-capture') {
            toast({
              variant: "destructive",
              title: "Microphone Permission Denied",
              description: "Please allow microphone access in your browser settings to use voice input.",
            });
          } else {
            setError(`Voice recognition error: ${event.error}`);
          }
          setIsRecording(false);
        };

        recognitionRef.current.onend = () => {
          setIsRecording(false);
        };

        try {
          recognitionRef.current.start();
        } catch (err) {
          console.error('Failed to start recognition:', err);
          setError('Failed to start voice recognition');
          setIsRecording(false);
        }
      } else {
        setError('Voice recognition is not supported in this browser');
        setIsRecording(false);
      }
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);

    // Clear any pending translation timer
    if (realtimeTranslationTimerRef.current) {
      clearTimeout(realtimeTranslationTimerRef.current);
      realtimeTranslationTimerRef.current = null;
    }

    // Stop realtime transcription if active
    if (realtimeTranscriptionRef.current && realtimeTranscriptionRef.current.isActive()) {
      console.log('[Realtime] Stopping realtime transcription...');
      const finalTranscript = await realtimeTranscriptionRef.current.stop();
      realtimeTranscriptionRef.current = null;

      // Clear interim transcript
      setInterimTranscript('');

      // Translate accumulated text if not already translating
      const textToTranslate = (finalTranscript || sourceText).trim();
      if (textToTranslate && !isTranslating) {
        setSourceText(textToTranslate);
        handleTranslate(textToTranslate, sourceLang, targetLang);
      }
      return;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error('Failed to stop recognition:', err);
      }
    }

    // Translate after stopping (only for Web Speech API; other providers translate after transcription finishes)
    if (speechProvider === 'web-speech' && sourceText) {
      handleTranslate(sourceText, sourceLang, targetLang);
    }
  };

  // Process image (shared between upload and camera)
  const processImage = async (base64Image: string) => {
    // Check if source and target languages are the same
    if (sourceLang === targetLang) {
      toast({
        variant: "destructive",
        title: "Invalid Language Selection",
        description: "Source and target languages cannot be the same. Please select different languages.",
      });
      return;
    }

    // Cancel any existing image processing request
    if (imageAbortControllerRef.current) {
      imageAbortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    imageAbortControllerRef.current = abortController;

    try {
      setIsProcessingImage(true);
      setError(null);
      setImage(base64Image);

      // VLM Mode: Direct translation without OCR (with streaming)
      if (useVLMMode) {
        console.log('[Image VLM] Starting VLM streaming translation...');

        // Check if VLM is configured
        if (!isVLMConfigured()) {
          setIsProcessingImage(false);
          setImage(null);
          imageAbortControllerRef.current = null;
          toast({
            variant: "destructive",
            title: "VLM Service Required",
            description: "Please configure VLM service in Settings (General AI, OCR, or Custom VLM).",
            action: (
              <button
                onClick={() => onOpenSettings('general')}
                className="px-3 py-1.5 bg-white text-indigo-600 text-xs rounded-lg hover:bg-indigo-50"
              >
                Open Settings
              </button>
            ),
          });
          return;
        }

        setSourceText(''); // No source text in VLM mode
        setTargetText(''); // Clear target text before streaming
        setTranslatedImage(null); // No translated image in VLM mode

        let streamedText = '';

        try {
          for await (const chunk of streamTranslateImageWithVLM(base64Image, sourceLang, targetLang, settings, abortController.signal)) {
            // Check if request was cancelled
            if (abortController.signal.aborted) {
              break;
            }

            streamedText += chunk;
            setTargetText(streamedText);
          }
          console.log('[Image VLM] VLM translation completed');
        } catch (err) {
          // Don't show error if request was cancelled
          if (err instanceof Error && err.name === 'AbortError') {
            console.log('[Image VLM] Request was cancelled');
            return;
          }
          console.error('[Image VLM] Streaming error:', err);
          setError(err instanceof Error ? err.message : 'VLM translation failed');
        } finally {
          // Only clear loading state if this is still the active request
          if (imageAbortControllerRef.current === abortController) {
            setIsProcessingImage(false);
            imageAbortControllerRef.current = null;
          }
        }

        console.log('[Image VLM] Complete!');
        return;
      }

      // OCR Mode: OCR + Canvas overlay
      console.log('[Image OCR] Starting OCR process...');
      console.log('[Image OCR] Image size:', base64Image.length, 'bytes');

      // Perform OCR
      const ocrTexts = await performOCR(base64Image, settings.imageOCR);

      // Check if request was cancelled after OCR
      if (abortController.signal.aborted) {
        console.log('[Image OCR] Request was cancelled after OCR');
        return;
      }

      console.log('[Image OCR] OCR completed, found', ocrTexts.length, 'text regions');
      console.log('[Image OCR] OCR results:', ocrTexts.map((ocr, idx) => ({
        index: idx,
        text: ocr.text,
        location: ocr.location,
        rotate_rect: ocr.rotate_rect,
      })));

      // Batch translate all detected texts
      console.log('[Image Translation] Starting batch translation for', ocrTexts.length, 'texts');
      const translations = await Promise.all(
        ocrTexts.map(async (ocr, idx) => {
          console.log(`[Image Translation] Translating text ${idx + 1}/${ocrTexts.length}: "${ocr.text}"`);
          const result = await translateText(ocr.text, sourceLang, targetLang, settings, abortController.signal);
          console.log(`[Image Translation] Result ${idx + 1}: "${result}"`);
          return result;
        })
      );

      // Check if request was cancelled after translation
      if (abortController.signal.aborted) {
        console.log('[Image Translation] Request was cancelled after translation');
        return;
      }

      console.log('[Image Translation] All translations completed');

      // Create canvas for image overlay
      console.log('[Canvas] Creating canvas for image overlay');
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        console.log('[Canvas] Canvas size:', canvas.width, 'x', canvas.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Draw original image
          console.log('[Canvas] Drawing original image');
          ctx.drawImage(img, 0, 0);

          // Overlay translated text
          ctx.textBaseline = 'middle';
          console.log('[Canvas] Starting text overlay for', translations.length, 'translations');

          // Track occupied rectangles to avoid overlapping
          const occupiedRects: Array<{ x: number; y: number; width: number; height: number }> = [];

          // Helper function to check if two rectangles overlap
          const checkOverlap = (
            rect1: { x: number; y: number; width: number; height: number },
            rect2: { x: number; y: number; width: number; height: number }
          ): boolean => {
            return !(
              rect1.x + rect1.width < rect2.x ||
              rect2.x + rect2.width < rect1.x ||
              rect1.y + rect1.height < rect2.y ||
              rect2.y + rect2.height < rect1.y
            );
          };

          // Helper function to adjust position to avoid overlap
          const adjustPosition = (
            cx: number,
            cy: number,
            width: number,
            height: number,
            fontSize: number,
            minFontSize: number
          ): { cx: number; cy: number; fontSize: number; width: number; height: number } => {
            let adjusted = { cx, cy, fontSize, width, height };
            let attempts = 0;
            const maxAttempts = 20;

            while (attempts < maxAttempts) {
              const currentRect = {
                x: adjusted.cx - adjusted.width / 2,
                y: adjusted.cy - adjusted.height / 2,
                width: adjusted.width,
                height: adjusted.height
              };

              // Check if current position overlaps with any occupied rect
              const hasOverlap = occupiedRects.some(occupied => checkOverlap(currentRect, occupied));

              if (!hasOverlap) {
                return adjusted;
              }

              // First try to reduce font size (down to 90% of current, but not below minimum)
              if (attempts < 5 && adjusted.fontSize > minFontSize * 1.2) {
                const newFontSize = Math.max(minFontSize, adjusted.fontSize * 0.9);
                const scale = newFontSize / adjusted.fontSize;
                adjusted = {
                  cx: adjusted.cx,
                  cy: adjusted.cy,
                  fontSize: newFontSize,
                  width: adjusted.width * scale,
                  height: adjusted.height * scale
                };
                attempts++;
                continue;
              }

              // Then try moving in different directions
              const offset = 10 * (attempts - 4);
              const directions = [
                { dx: 0, dy: -offset }, // up
                { dx: 0, dy: offset },  // down
                { dx: -offset, dy: 0 }, // left
                { dx: offset, dy: 0 },  // right
                { dx: -offset, dy: -offset }, // up-left
                { dx: offset, dy: -offset },  // up-right
                { dx: -offset, dy: offset },  // down-left
                { dx: offset, dy: offset },   // down-right
              ];

              for (const dir of directions) {
                const testPos = {
                  cx: cx + dir.dx,
                  cy: cy + dir.dy,
                  fontSize: adjusted.fontSize,
                  width: adjusted.width,
                  height: adjusted.height
                };
                const testRect = {
                  x: testPos.cx - testPos.width / 2,
                  y: testPos.cy - testPos.height / 2,
                  width: testPos.width,
                  height: testPos.height
                };

                if (!occupiedRects.some(occupied => checkOverlap(testRect, occupied))) {
                  adjusted = testPos;
                  return adjusted;
                }
              }

              attempts++;
            }

            // If couldn't find non-overlapping position, return original
            return { cx, cy, fontSize, width, height };
          };

          translations.forEach((translatedText, index) => {
            const ocr = ocrTexts[index];

            // Skip if no location or rotate_rect data
            if (!ocr.rotate_rect || ocr.rotate_rect.length !== 5) {
              console.log(`[Canvas] Skipping text ${index + 1}: missing rotate_rect data`);
              return;
            }

            const [cx, cy, width, height, angle] = ocr.rotate_rect;

            // Validate dimensions
            if (!cx || !cy || !width || !height || width <= 0 || height <= 0) {
              console.log(`[Canvas] Skipping text ${index + 1}: invalid dimensions`, { cx, cy, width, height });
              return;
            }

            try {
              ctx.save();

              // Split text by newlines if present
              const lines = translatedText.split('\n');

              // Calculate appropriate font size
              const minFontSize = 12;
              const maxFontSize = 48;
              const baseFontSize = Math.min(width, height) * 0.5;
              const fontSize = Math.max(minFontSize, Math.min(baseFontSize / lines.length, maxFontSize));

              ctx.font = `${fontSize}px Arial`;

              // Function to wrap text within width
              const wrapText = (text: string, maxWidth: number): string[] => {
                const words = text.split('');
                const wrappedLines: string[] = [];
                let currentLine = '';

                for (const char of words) {
                  const testLine = currentLine + char;
                  const metrics = ctx.measureText(testLine);

                  if (metrics.width > maxWidth && currentLine.length > 0) {
                    wrappedLines.push(currentLine);
                    currentLine = char;
                  } else {
                    currentLine = testLine;
                  }
                }
                if (currentLine) {
                  wrappedLines.push(currentLine);
                }
                return wrappedLines;
              };

              // Process all lines and wrap if needed
              const maxWidth = width * 0.9;
              const maxHeight = height * 0.9;
              const allWrappedLines: string[] = [];

              for (const line of lines) {
                const wrapped = wrapText(line, maxWidth);
                allWrappedLines.push(...wrapped);
              }

              // Calculate required dimensions
              const lineHeight = fontSize * 1.3;
              const totalHeight = allWrappedLines.length * lineHeight;
              const maxTextWidth = Math.max(...allWrappedLines.map(line => ctx.measureText(line).width));

              // Expand rect if needed to fit text at minimum readable size
              let finalWidth = width;
              let finalHeight = height;

              if (totalHeight > maxHeight || maxTextWidth > maxWidth) {
                const requiredWidth = maxTextWidth / 0.9;
                const requiredHeight = totalHeight / 0.9;

                finalWidth = Math.max(width, requiredWidth);
                finalHeight = Math.max(height, requiredHeight);
              }

              // Adjust position to avoid overlap (only adjust if angle is 0 or close to it)
              let adjustedCx = cx;
              let adjustedCy = cy;
              let adjustedFontSize = fontSize;
              let adjustedWidth = finalWidth;
              let adjustedHeight = finalHeight;

              if (Math.abs(angle || 0) < 5) {
                const adjusted = adjustPosition(cx, cy, finalWidth, finalHeight, fontSize, minFontSize);
                adjustedCx = adjusted.cx;
                adjustedCy = adjusted.cy;
                adjustedFontSize = adjusted.fontSize;
                adjustedWidth = adjusted.width;
                adjustedHeight = adjusted.height;

                // If font size was adjusted, recalculate text wrapping
                if (adjustedFontSize !== fontSize) {
                  ctx.font = `${adjustedFontSize}px Arial`;

                  // Recalculate wrapping with new font size
                  const newMaxWidth = adjustedWidth * 0.9;
                  const newAllWrappedLines: string[] = [];

                  for (const line of lines) {
                    const wrapped = wrapText(line, newMaxWidth);
                    newAllWrappedLines.push(...wrapped);
                  }

                  // Update line height and total height
                  const newLineHeight = adjustedFontSize * 1.3;
                  const newTotalHeight = newAllWrappedLines.length * newLineHeight;

                  // Update height if needed
                  if (newTotalHeight > adjustedHeight * 0.9) {
                    adjustedHeight = newTotalHeight / 0.9;
                  }

                  // Replace wrapped lines
                  allWrappedLines.length = 0;
                  allWrappedLines.push(...newAllWrappedLines);
                }
              }

              console.log(`[Canvas] Drawing text ${index + 1}:`, {
                original: ocr.text,
                translated: translatedText,
                originalPos: [cx, cy],
                adjustedPos: [adjustedCx, adjustedCy],
                size: [adjustedWidth, adjustedHeight],
                fontSize: adjustedFontSize,
                angle: angle || 0,
              });

              // Move to adjusted center and rotate
              ctx.translate(adjustedCx, adjustedCy);
              ctx.rotate(((angle || 0) * Math.PI) / 180);

              // Set font size (use adjusted if it was changed)
              ctx.font = `${adjustedFontSize}px Arial`;

              // Calculate line height with adjusted font size
              const adjustedLineHeight = adjustedFontSize * 1.3;

              // Fill background with semi-transparent white
              ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.fillRect(-adjustedWidth / 2, -adjustedHeight / 2, adjustedWidth, adjustedHeight);

              // Draw text lines
              ctx.fillStyle = '#000000';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const startY = -(allWrappedLines.length - 1) * adjustedLineHeight / 2;

              allWrappedLines.forEach((line, i) => {
                ctx.fillText(line, 0, startY + i * adjustedLineHeight);
              });

              // Add to occupied rects
              occupiedRects.push({
                x: adjustedCx - adjustedWidth / 2,
                y: adjustedCy - adjustedHeight / 2,
                width: adjustedWidth,
                height: adjustedHeight
              });

              ctx.restore();
            } catch (err) {
              console.error(`[Canvas] Error drawing text ${index + 1}:`, err);
              ctx.restore();
            }
          });

          // Set translated image
          const translatedImageUrl = canvas.toDataURL();
          console.log('[Canvas] Canvas rendered, image size:', translatedImageUrl.length, 'bytes');
          setTranslatedImage(translatedImageUrl);

          // Set as source text (join all original texts)
          const allText = ocrTexts.map(o => o.text).join('\n');
          setSourceText(allText);
          console.log('[Image OCR] Source text set:', allText);

          // Set as target text (join all translations)
          const allTranslations = translations.join('\n');
          setTargetText(allTranslations);
          console.log('[Image Translation] Target text set:', allTranslations);

          // Keep original image in input area, show translated in output
          // Only clear loading state if this is still the active request
          if (imageAbortControllerRef.current === abortController) {
            setIsProcessingImage(false);
            imageAbortControllerRef.current = null;
          }
          console.log('[Image Processing] Complete!');
        }
      };
      img.onerror = (err) => {
        console.error('[Canvas] Failed to load image:', err);
        setError('Failed to load image for processing');
        // Only clear loading state if this is still the active request
        if (imageAbortControllerRef.current === abortController) {
          setIsProcessingImage(false);
          imageAbortControllerRef.current = null;
        }
      };
      img.src = base64Image;
    } catch (err) {
      // Don't show error if request was cancelled
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Image Processing] Request was cancelled');
        return;
      }
      console.error('[Image Processing] Error:', err);
      setError(err instanceof Error ? err.message : 'OCR failed');
      setImage(null);
      // Only clear loading state if this is still the active request
      if (imageAbortControllerRef.current === abortController) {
        setIsProcessingImage(false);
        imageAbortControllerRef.current = null;
      }
    }
  };

  // Handle camera capture
  const handleCameraCapture = async (base64Image: string) => {
    await processImage(base64Image);
  };
  // Handle image upload
  const {
    getRootProps,
    getInputProps
  } = useDropzone({
    onDrop: async acceptedFiles => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];

      try {
        const base64Image = await imageToBase64(file);
        await processImage(base64Image);
      } catch (err) {
        console.error('Image processing error:', err);
        setError(err instanceof Error ? err.message : 'Image processing failed');
      }
    },
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png']
    },
    maxFiles: 1,
  });
  // Add animation styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes rotate {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .rotate-animation {
        animation: rotate 0.5s ease;
      }
      @keyframes fadeIn {
        0% { opacity: 0.7; transform: translateY(5px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .fade-in {
        animation: fadeIn 0.3s ease forwards;
      }
      .cute-shadow {
        box-shadow: 0 4px 0 rgba(0,0,0,0.1);
        transform: translateY(0);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .cute-shadow:active {
        box-shadow: 0 2px 0 rgba(0,0,0,0.1);
        transform: translateY(2px);
      }
      .static-shadow {
        box-shadow: 0 4px 0 rgba(0,0,0,0.1);
      }
      .btn-pop {
        transition: transform 0.2s ease;
      }
      .btn-pop:active {
        transform: scale(0.95);
      }
      /* Ruby annotation styles for furigana */
      ruby {
        display: inline-flex;
        flex-direction: column;
        vertical-align: baseline;
        line-height: 2;
        text-align: center;
      }
      rt {
        display: block;
        font-size: 0.5em;
        line-height: 1;
        text-align: center;
        user-select: none;
      }
      rb {
        display: block;
        line-height: 1.2;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  return <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-lg overflow-hidden -mt-4 sm:mt-0">
      {/* Header */}
      <div className="p-4 bg-indigo-500 text-white flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <img src="/icons/buddy.png" alt="tabitomo" className="h-8 w-8" />
          <h1 className="text-lg font-bold">tabitomo</h1>
        </div>
        <button
          onClick={() => onOpenSettings()}
          className="p-2 text-white/80 hover:text-white hover:bg-indigo-600 rounded-lg transition-all duration-200 btn-pop"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
      {/* Language Selection */}
      <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-gray-700">
        {(inputMethod === 'text' && textMode === 'explanation') || inputMethod === 'qa' ? (
          // For explanation and Q/A: Only show target language
          <div className="w-full flex items-center justify-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Target Language:</span>
            <Select value={targetLang} onValueChange={(value) => setTargetLang(value as LanguageCode)}>
              <SelectTrigger className="w-48 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map(lang => (
                  <SelectItem key={`target-${lang.value}`} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          // For translation and image: Show source and target
          <>
            <div className="flex-1">
              <Select value={sourceLang} onValueChange={(value) => setSourceLang(value as LanguageCode)}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map(lang => (
                    <SelectItem key={`source-${lang.value}`} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button id="swap-button" onClick={handleSwapLanguages} className="mx-2 p-2 bg-white dark:bg-gray-600 rounded-full shadow-md btn-pop">
              <ArrowUpDown className="h-4 w-4 text-indigo-500 dark:text-white" />
            </button>
            <div className="flex-1">
              <Select value={targetLang} onValueChange={(value) => setTargetLang(value as LanguageCode)}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map(lang => (
                    <SelectItem key={`target-${lang.value}`} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
      {/* Main Content Area */}
      <div className="p-4">
        {/* Source Input */}
        <div className="relative">
            {inputMethod === 'image' ? <div className="w-full h-32 rounded-2xl border border-indigo-100 dark:border-gray-600 bg-white dark:bg-gray-700 overflow-hidden static-shadow">
                {image ? (
                  <div className="relative w-full h-full">
                    <img
                      src={image}
                      alt="Original"
                      className="w-full h-full object-contain rounded"
                    />
                    {isProcessingImage && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
                        <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full"></div>
                      </div>
                    )}
                    {!isProcessingImage && (
                      <button
                        onClick={() => {
                          setImage(null);
                          setTranslatedImage(null);
                          setSourceText('');
                          setTargetText('');
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-md btn-pop"
                        title="Remove image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ) : !isOCRConfigured() && !useVLMMode ? (
                  // Show settings guidance when OCR is not configured
                  <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-indigo-500/10 dark:bg-indigo-500/20">
                    <Settings className="h-8 w-8 text-indigo-600 dark:text-indigo-400 mb-2" />
                    <p className="text-indigo-800 dark:text-indigo-200 text-center text-xs font-medium mb-3">
                      OCR Service Not Configured
                    </p>
                    <button
                      onClick={() => onOpenSettings('image')}
                      className="px-3 py-1.5 bg-indigo-500 text-white text-xs rounded-lg cute-shadow hover:bg-indigo-400 transition-all duration-200"
                    >
                      Open Settings
                    </button>
                  </div>
                ) : !isVLMConfigured() && useVLMMode ? (
                  // Show settings guidance when VLM is not configured
                  <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-indigo-500/10 dark:bg-indigo-500/20">
                    <Settings className="h-8 w-8 text-indigo-600 dark:text-indigo-400 mb-2" />
                    <p className="text-indigo-800 dark:text-indigo-200 text-center text-xs font-medium mb-3">
                      VLM Service Not Configured
                    </p>
                    <button
                      onClick={() => onOpenSettings('general')}
                      className="px-3 py-1.5 bg-indigo-500 text-white text-xs rounded-lg cute-shadow hover:bg-indigo-400 transition-all duration-200"
                    >
                      Open Settings
                    </button>
                  </div>
                ) : (
                  <div {...getRootProps()} className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-2">
                    <input {...getInputProps()} />
                    <div className="mb-2 p-2 bg-indigo-100/50 dark:bg-indigo-900/30 rounded-xl" style={{ filter: 'drop-shadow(0 2px 4px rgba(99, 102, 241, 0.15))' }}>
                      <ImageIcon className="h-6 w-6 text-indigo-500 dark:text-indigo-400" />
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 text-center text-xs font-medium mb-1.5">
                      Upload an Image
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCameraOpen(true);
                      }}
                      className="px-3 py-1 bg-indigo-500 text-white text-xs font-medium rounded-lg cute-shadow hover:bg-indigo-400 transition-colors duration-200 flex items-center space-x-1.5"
                    >
                      <Camera className="h-3 w-3" />
                      <span>Camera</span>
                    </button>
                  </div>
                )}
              </div> : <div className="relative">
                {/* Check if Q/A requires General AI and show warning if not configured */}
                {(inputMethod === 'qa' || (inputMethod === 'text' && textMode === 'explanation')) && !isGeneralAIConfigured() ? (
                  <div className="w-full min-h-[8rem] rounded-2xl border border-indigo-100 dark:border-gray-600 bg-indigo-500/10 dark:bg-indigo-500/20 overflow-hidden static-shadow flex flex-col items-center justify-center p-4">
                    <Settings className="h-8 w-8 text-indigo-600 dark:text-indigo-400 mb-2" />
                    <p className="text-indigo-800 dark:text-indigo-200 text-center text-xs font-medium mb-3">
                      {inputMethod === 'qa' ? 'Q&A Service Not Configured' : 'Explanation Service Not Configured'}
                    </p>
                    <button
                      onClick={() => onOpenSettings('general')}
                      className="px-3 py-1.5 bg-indigo-500 text-white text-xs rounded-lg cute-shadow hover:bg-indigo-400 transition-all duration-200"
                    >
                      Open Settings
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Textarea for text/audio input */}
                    <textarea
                      ref={textareaRef}
                      value={sourceText + (interimTranscript && isRecording ? (sourceText ? ' ' : '') + interimTranscript : '')}
                      onChange={handleTextChange}
                      placeholder={isRecording
                        ? 'Listening...'
                        : inputMethod === 'qa'
                        ? 'Ask a question (e.g., "How to ask for the check?")'
                        : textMode === 'explanation'
                        ? 'Enter text to explain (word/sentence/grammar)...'
                        : `Type in ${languageOptions.find(l => l.value === sourceLang)?.label}...`
                      }
                      className="w-full min-h-[8rem] max-h-[12.5rem] p-3 pr-12 rounded-2xl border-2 border-indigo-100 dark:border-gray-600 focus:outline-none focus:border-indigo-300 dark:focus:border-indigo-400 dark:bg-gray-700 dark:text-gray-100 resize-none cute-shadow overflow-y-auto custom-scrollbar"
                      style={{ height: 'auto' }}
                      readOnly={isRecording}
                    />
                {/* Audio recording button (visible in text mode, hidden in Q/A) */}
                {inputMethod !== 'qa' && (
                  <div className="absolute right-2 bottom-3">
                    {isRecording ? (
                      <button
                        onClick={stopRecording}
                        className="p-2 bg-red-500 text-white rounded-full shadow-md btn-pop flex items-center justify-center w-8 h-8"
                        title="Stop recording"
                      >
                        <div className="w-3 h-3 bg-white rounded-sm"></div>
                      </button>
                    ) : (
                      <button
                        onClick={startRecording}
                        className="p-2 bg-indigo-500 text-white rounded-full shadow-md btn-pop flex items-center justify-center w-8 h-8"
                        title="Start recording"
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
              </div>}
            {/* Input Method Controls */}
            <div className="flex items-center justify-center mt-3 space-x-2">
              <button onClick={() => handleInputMethodChange('text')} className={`p-2 rounded-xl ${inputMethod === 'text' ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'} btn-pop`} title="Text/Audio input">
                <Keyboard className="h-4 w-4" />
              </button>
              <button onClick={() => handleInputMethodChange('image')} className={`p-2 rounded-xl ${inputMethod === 'image' ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'} btn-pop`} title="Image input">
                <Camera className="h-4 w-4" />
              </button>
              <button onClick={() => handleInputMethodChange('qa')} className={`p-2 rounded-xl ${inputMethod === 'qa' ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'} btn-pop`} title="Quick Q&A">
                <MessageCircle className="h-4 w-4" />
              </button>
            </div>
            {/* Translation Result */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {inputMethod === 'qa'
                    ? 'Answer'
                    : textMode === 'explanation'
                    ? 'Explanation'
                    : `${languageOptions.find(l => l.value === targetLang)?.label} Translation`}
                </h3>
                <div className="flex items-center space-x-2">
                  {inputMethod === 'text' && (
                    <button
                      onClick={() => {
                        const newMode = textMode === 'translation' ? 'explanation' : 'translation';
                        setTextMode(newMode);
                        // Clear output when changing mode
                        setTargetText('');
                        // Cancel any ongoing request
                        if (textMode === 'translation' && translationAbortControllerRef.current) {
                          translationAbortControllerRef.current.abort();
                          translationAbortControllerRef.current = null;
                        } else if (textMode === 'explanation' && explanationAbortControllerRef.current) {
                          explanationAbortControllerRef.current.abort();
                          explanationAbortControllerRef.current = null;
                        }
                        // Trigger new request with new mode if there's text
                        if (sourceText.trim()) {
                          if (newMode === 'explanation') {
                            handleWordExplanation(sourceText, sourceLang, targetLang);
                          } else {
                            handleTranslate(sourceText, sourceLang, targetLang);
                          }
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded-lg transition-all duration-200 ${
                        textMode === 'explanation'
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                      title={textMode === 'explanation' ? 'Switch to Translation' : 'Switch to Explanation'}
                    >
                      {textMode === 'explanation' ? 'Explanation' : 'Translation'}
                    </button>
                  )}
                  {inputMethod === 'image' && (
                    <button
                      onClick={() => {
                        const newMode = !useVLMMode;
                        setUseVLMMode(newMode);
                        // Clear output when changing mode
                        setTargetText('');
                        setTranslatedImage(null);
                        // Cancel any ongoing request
                        if (imageAbortControllerRef.current) {
                          imageAbortControllerRef.current.abort();
                          imageAbortControllerRef.current = null;
                        }
                        // Trigger new request with new mode if there's an image
                        if (image) {
                          processImage(image);
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded-lg transition-all duration-200 ${
                        useVLMMode
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                      title={useVLMMode ? 'Switch to OCR mode' : 'Switch to VLM mode'}
                    >
                      {useVLMMode ? 'VLM' : 'OCR'}
                    </button>
                  )}
                  {targetText && (
                    <div className="flex space-x-2">
                    <button
                      onClick={() => speakText(targetText, targetLang)}
                      className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors btn-pop"
                      title="Play audio"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={copyToClipboard}
                      className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors btn-pop"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  )}
                </div>
              </div>
              <div className="mt-2 p-3 min-h-[8rem] max-h-[24rem] bg-indigo-50 dark:bg-gray-700 rounded-2xl cute-shadow overflow-y-auto custom-scrollbar" ref={targetInputRef}>
                {isTranslating && !targetText ? <div className="flex items-center justify-center py-4 min-h-[7rem]">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bounce" style={{
                  animationDelay: '0ms'
                }}></div>
                      <div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bounce" style={{
                  animationDelay: '150ms'
                }}></div>
                      <div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bounce" style={{
                  animationDelay: '300ms'
                }}></div>
                    </div>
                  </div> : error ? <p className="text-red-500 dark:text-red-400 text-center py-6 text-sm min-h-[7rem] flex items-center justify-center">
                    {error}
                  </p> : translatedImage && !useVLMMode ? (
                    <div className="w-full">
                      <img
                        src={translatedImage}
                        alt="Translated"
                        className="w-full rounded cursor-pointer"
                        onClick={() => setIsLightboxOpen(true)}
                      />
                    </div>
                  ) : targetText ? (
                    <div className="w-full">
                      {/* Thinking indicator */}
                      {isThinking && (
                        <div className="mb-2 flex items-center space-x-2 text-xs text-amber-600 dark:text-amber-400">
                          <div className="flex space-x-1">
                            <div className="w-1.5 h-1.5 bg-amber-500 dark:bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-1.5 h-1.5 bg-amber-500 dark:bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-1.5 h-1.5 bg-amber-500 dark:bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <span className="font-medium">Thinking...</span>
                        </div>
                      )}
                      {useVLMMode || inputMethod === 'qa' || textMode === 'explanation' ? (
                        // VLM mode / Q&A / Explanation: Render as markdown
                        <div
                          className="text-gray-800 dark:text-gray-200 w-full leading-relaxed prose dark:prose-invert prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: parsedMarkdown }}
                        />
                      ) : furiganaHtml ? (
                      <div
                        className="text-gray-800 dark:text-gray-200 w-full leading-relaxed whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: furiganaHtml }}
                      />
                      ) : (
                        <p className="text-gray-800 dark:text-gray-200 w-full whitespace-pre-wrap">
                          {targetText}
                        </p>
                      )}
                    </div>
                  ) : <p className="text-gray-400 dark:text-gray-500 text-center py-6 min-h-[7rem] flex items-center justify-center">
                    {inputMethod === 'qa'
                      ? 'Ask a question and get a quick answer'
                      : textMode === 'explanation'
                      ? 'Enter text to see its explanation'
                      : 'Translation will appear here'}
                  </p>}
              </div>
            </div>
          </div>
      </div>

      {/* Camera Panel - Lazy Loaded */}
      <Suspense fallback={null}>
        <CameraPanel
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onCapture={handleCameraCapture}
        />
      </Suspense>

      {/* Image Lightbox */}
      <ImageLightbox
        isOpen={isLightboxOpen}
        imageUrl={translatedImage}
        onClose={() => setIsLightboxOpen(false)}
      />
    </div>;
};
