import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hasProviderConnection } from '../utils/config/settings';
import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { translateText, SUPPORTED_LANGUAGES, type LanguageCode } from '../utils/translation/translation';
import { speakText, getSpeechLocale } from '../utils/audio/speech';
import { transcribeCloudAudio } from '../utils/audio/audioTranscription';
import { RealtimeTranscriptionService } from '../utils/audio/realtimeTranscription';
import { localAsrService } from '../utils/audio/localAsr';
import { performOCR, imageToBase64, streamTranslateImageWithVLM } from '../utils/image/imageOcr';
import { supportsOCROverlay } from '../../packages/tabitomo-core/src/inputOptions';
import { explainWord, quickQA } from '../utils/translation/explanation';
import { Mic, Image as ImageIcon, ArrowLeftRight, X, Copy, Check, Volume2, Camera, Keyboard, Settings, Loader2 } from 'lucide-react';
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
    return !!(hasProviderConnection(settings.generalAI));
  };

  // Check if VLM is configured
  const isVLMConfigured = () => {
    const vlmConfig = settings.vlm;

    if (vlmConfig.useGeneralAI) {
      // Using general AI settings
      return isGeneralAIConfigured();
    } else if (vlmConfig.useCustom) {
      // Using custom VLM settings
      return !!(hasProviderConnection(vlmConfig));
    } else {
      // Using OCR settings - check if OCR is using General AI or its own settings
      if (settings.imageOCR.useGeneralAI) {
        return isGeneralAIConfigured();
      } else if (settings.imageOCR.provider === 'local-ppocr' || settings.imageOCR.provider === 'jina') {
        return false;
      } else {
        return !!(hasProviderConnection(settings.imageOCR));
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
      return !!(hasProviderConnection(settings.imageOCR));
    }
  };

  // Handle input method change and clear inputs
  const handleInputMethodChange = (method: InputMethod) => {
    const previousMethod = inputMethod;
    setInputMethod(method);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    translationAbortControllerRef.current?.abort(); explanationAbortControllerRef.current?.abort();
    qaAbortControllerRef.current?.abort(); imageAbortControllerRef.current?.abort();
    setIsTranslating(false); setIsProcessingImage(false);
    // Reset text mode when changing input method
    setTextMode('translation');
    // Clear all inputs and outputs
    if (previousMethod === 'image' || method === 'image') setSourceText('');
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

  const runCurrentText = (text: string) => {
    if (inputMethod === 'qa') void handleQA(text, sourceLang, targetLang);
    else if (textMode === 'explanation') void handleWordExplanation(text, sourceLang, targetLang);
    else void handleTranslate(text, sourceLang, targetLang);
  };

  // Handle text input
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setSourceText(newText);
    translationAbortControllerRef.current?.abort(); explanationAbortControllerRef.current?.abort(); qaAbortControllerRef.current?.abort();
    setIsTranslating(false); setError(null); setTargetText('');

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
    if (speechProvider === 'openai-compatible' || speechProvider === 'local') {
      // Check if realtime transcription is enabled
      const useRealtime = settings.speechRecognition.enableRealtimeTranscription !== false;

      if (useRealtime) {
        // Use realtime transcription with VAD
        console.log('[Realtime] Starting realtime transcription...');
        try {
          // Helper to determine if source language uses spaces
          const sourceLangUsesSpaces = !['zh', 'ja', 'ko'].includes(sourceLang);

          let accumulatedTranscript = '';
          realtimeTranscriptionRef.current = new RealtimeTranscriptionService(settings, {
            sourceLang,
            onTranscript: (text: string, isFinal: boolean) => {
              console.log('[Realtime] Received transcript:', text, 'isFinal:', isFinal);

              if (isFinal) {
                // Final transcript - append to source text
                const separator = sourceLangUsesSpaces ? ' ' : '';
                accumulatedTranscript = accumulatedTranscript ? accumulatedTranscript + separator + text : text;
                setSourceText(accumulatedTranscript);

                // Clear interim transcript
                setInterimTranscript('');

                // Debounce translation to avoid too many API calls
                if (realtimeTranslationTimerRef.current) {
                  clearTimeout(realtimeTranslationTimerRef.current);
                }

                realtimeTranslationTimerRef.current = setTimeout(() => {
                  const currentText = accumulatedTranscript;
                  if (currentText.trim()) {
                    runCurrentText(currentText.trim());
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
                : await transcribeCloudAudio(audioBlob, settings);
              setSourceText(transcribedText);
              if (transcribedText) {
                runCurrentText(transcribedText);
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
        runCurrentText(textToTranslate);
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
      runCurrentText(sourceText);
    }
  };

  // Process image (shared between upload and camera)
  const processImage = async (base64Image: string, visionMode = useVLMMode) => {
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
      if (visionMode) {
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

      if (!isOCRConfigured()) throw new Error('Connect an OCR provider in Image settings.');
      // OCR Mode: OCR + Canvas overlay
      console.log('[Image OCR] Starting OCR process...');
      console.log('[Image OCR] Image size:', base64Image.length, 'bytes');

      // Perform OCR
      const ocrTexts = await performOCR(base64Image, settings, abortController.signal);

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

      if (!ocrTexts.some((line) => line.rotate_rect)) {
        setTranslatedImage(null);
        setSourceText(ocrTexts.map((line) => line.text).join('\n'));
        setTargetText(translations.join('\n'));
        setIsProcessingImage(false); imageAbortControllerRef.current = null;
        if (!ocrTexts.length) setError('No readable text found. Try a clearer photo.');
        return;
      }

      // Create canvas for image overlay
      console.log('[Canvas] Creating canvas for image overlay');
      const img = new Image();
      img.onload = () => {
        if (abortController.signal.aborted) return;
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
  const selectWorkspaceMode = (mode: 'translation' | 'explanation' | 'qa') => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    translationAbortControllerRef.current?.abort();
    explanationAbortControllerRef.current?.abort();
    qaAbortControllerRef.current?.abort();
    imageAbortControllerRef.current?.abort();
    setIsTranslating(false); setIsProcessingImage(false); setError(null);
    setTargetText(''); setTranslatedImage(null);
    handleInputMethodChange(mode === 'qa' ? 'qa' : 'text');
    setTextMode(mode === 'explanation' ? 'explanation' : 'translation');
  };
  const runText = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (inputMethod === 'qa') void handleQA(sourceText, sourceLang, targetLang);
    else if (textMode === 'explanation') void handleWordExplanation(sourceText, sourceLang, targetLang);
    else void handleTranslate(sourceText, sourceLang, targetLang);
  };
  const busy = isTranslating || isProcessingImage;
  const assistantMode = inputMethod === 'qa' || (inputMethod === 'text' && textMode === 'explanation');
  const resultTitle = inputMethod === 'qa' ? 'Answer' : textMode === 'explanation' ? 'Explanation' : 'Translation';
  return <main className="tabitomo-workspace" aria-label="Translation workspace">
    <header className="workspace-brandbar">
      <div className="workspace-brand"><img src="/icons/buddy.png" alt="" /><h1>tabitomo</h1></div>
      <button type="button" className="workspace-icon" title="Settings" aria-label="Settings" onClick={() => onOpenSettings()}><Settings size={20} /></button>
    </header>
    <nav className="workspace-modes" aria-label="Assistant mode">
      <button disabled={isRecording} aria-pressed={!assistantMode} onClick={() => selectWorkspaceMode('translation')}>Translate</button>
      <button disabled={isRecording} aria-pressed={inputMethod === 'text' && textMode === 'explanation'} onClick={() => selectWorkspaceMode('explanation')}>Explain</button>
      <button disabled={isRecording} aria-pressed={inputMethod === 'qa'} onClick={() => selectWorkspaceMode('qa')}>Q&A</button>
    </nav>
    <div className="workspace-languages">
      {/* For explanation and Q/A: Only show target language */}
      {!assistantMode && <>
        <Select value={sourceLang} onValueChange={(value) => setSourceLang(value as LanguageCode)}><SelectTrigger aria-label="Source language"><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map((lang) => <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>)}</SelectContent></Select>
        <button id="swap-button" aria-label="Swap languages" title="Swap languages" className="workspace-icon" onClick={handleSwapLanguages}><ArrowLeftRight size={18} /></button>
      </>}
      {assistantMode && <span className="workspace-language-label">Target Language</span>}
      <Select value={targetLang} onValueChange={(value) => setTargetLang(value as LanguageCode)}><SelectTrigger aria-label="Target language"><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map((lang) => <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="workspace-content">
      <section className="workspace-source" aria-label="Source">
        <div className="workspace-panel-heading"><h2>{inputMethod === 'image' ? 'Photo' : inputMethod === 'qa' ? 'Your question' : 'Source'}</h2>{(sourceText || image) && <button className="workspace-clear" aria-label="Clear" title="Clear" disabled={isRecording} onClick={() => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); translationAbortControllerRef.current?.abort(); explanationAbortControllerRef.current?.abort(); qaAbortControllerRef.current?.abort(); imageAbortControllerRef.current?.abort(); setSourceText(''); setTargetText(''); setImage(null); setTranslatedImage(null); setIsTranslating(false); setIsProcessingImage(false); setError(null); }}>Clear</button>}</div>
        {inputMethod === 'image' ? <div className="workspace-photo">
          {image ? <><img src={image} alt="Original" /><button className="workspace-icon photo-remove" aria-label="Remove image" onClick={() => { imageAbortControllerRef.current?.abort(); setIsProcessingImage(false); setImage(null); setTranslatedImage(null); setTargetText(''); }}><X size={17} /></button></> : <div {...getRootProps()} className="workspace-dropzone"><input {...getInputProps()} /><ImageIcon size={30} /><strong>Bring a photo, find the words.</strong><span>Drop an image or tap to choose</span><button className="workspace-secondary" onClick={(e) => { e.stopPropagation(); setIsCameraOpen(true); }}><Camera size={16} />Open camera</button></div>}
        </div> : <textarea ref={textareaRef} aria-label="Source text" value={sourceText + (interimTranscript && isRecording ? (sourceText ? ' ' : '') + interimTranscript : '')} onChange={handleTextChange} placeholder={isRecording ? 'Listening…' : inputMethod === 'qa' ? 'How do I ask for the check?' : textMode === 'explanation' ? 'A word, a phrase, something new…' : `What would you like to say in ${SUPPORTED_LANGUAGES[sourceLang]}?`} readOnly={isRecording} className="workspace-textarea custom-scrollbar" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runText(); } }} />}
        <div className="workspace-source-toolbar">
          <div className="workspace-toolbar-group">
            <button className={`workspace-icon ${isRecording ? 'is-recording' : ''}`} aria-label={isRecording ? 'Stop recording' : 'Start recording'} title={isRecording ? 'Stop recording' : 'Start recording'} disabled={!isRecording && (busy || inputMethod === 'image')} onClick={isRecording ? stopRecording : startRecording}><Mic size={19} /></button>
            <button className="workspace-icon" aria-label={inputMethod === 'image' ? 'Text/Audio input' : 'Image input'} title={inputMethod === 'image' ? 'Text/Audio input' : 'Image input'} aria-pressed={inputMethod === 'image'} disabled={isRecording} onClick={() => { handleInputMethodChange(inputMethod === 'image' ? 'text' : 'image'); setTextMode('translation'); }} >{inputMethod === 'image' ? <Keyboard size={19} /> : <Camera size={19} />}</button>

          </div>
          <button className="workspace-primary" disabled={busy || isRecording || (inputMethod === 'image' ? !image : !sourceText.trim())} onClick={() => inputMethod === 'image' && image ? processImage(image) : runText()}>{busy && <Loader2 size={16} className="animate-spin" />}{inputMethod === 'qa' ? 'Ask' : textMode === 'explanation' ? 'Explain' : 'Translate'}</button>
        </div>
        {inputMethod === 'image' && <div className="workspace-image-modes"><button aria-pressed={!useVLMMode} onClick={() => { setUseVLMMode(false); if (image) void processImage(image, false); }}>OCR text{supportsOCROverlay(settings.imageOCR) ? ' + overlay' : ''}</button><button aria-pressed={useVLMMode} onClick={() => { setUseVLMMode(true); if (image) void processImage(image, true); }}>Vision translation</button></div>}
      </section>
      <section className="workspace-result" aria-label={resultTitle} aria-busy={busy}>
        <div className="workspace-panel-heading"><h2>{resultTitle}</h2><span>{SUPPORTED_LANGUAGES[targetLang]}</span></div>
        <div className="workspace-result-body custom-scrollbar" ref={targetInputRef}>
          {busy && !targetText ? <div role="status" className="workspace-empty"><Loader2 size={26} className="animate-spin" /><strong>{isProcessingImage ? 'Reading your photo…' : 'Finding the right words…'}</strong></div>
          : error ? <div role="alert" className="workspace-empty workspace-error"><p>{error}</p><button className="workspace-secondary" onClick={() => onOpenSettings(inputMethod === 'image' ? 'image' : 'general')}>Open Settings</button></div>
          : translatedImage && !useVLMMode ? <img src={translatedImage} alt="Translated" className="workspace-translated-image" onClick={() => setIsLightboxOpen(true)} />
          : targetText ? <>{isThinking && <p className="workspace-thinking" role="status">Thinking…</p>}{useVLMMode || assistantMode ? <div className="prose dark:prose-invert prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{targetText}</ReactMarkdown></div> : furiganaHtml ? <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: furiganaHtml }} /> : <p className="whitespace-pre-wrap">{targetText}</p>}</>
          : <div className="workspace-empty"><p>{inputMethod === 'qa' ? 'Ask a question and get a quick answer' : textMode === 'explanation' ? 'Enter text to see its explanation' : 'Translation will appear here'}</p>{!isGeneralAIConfigured() && !(hasProviderConnection(settings)) && <button className="workspace-secondary" onClick={() => onOpenSettings('general')}>Connect your AI</button>}</div>}
        </div>
        <div className="workspace-result-toolbar"><span role="status">{copied ? 'Copied to clipboard' : ''}</span><div className="workspace-toolbar-group"><button className="workspace-icon" disabled={!targetText} aria-label="Play audio" title="Play audio" onClick={() => speakText(targetText, targetLang)}><Volume2 size={18} /></button><button className="workspace-icon" disabled={!targetText} aria-label="Copy to clipboard" title="Copy to clipboard" onClick={copyToClipboard}>{copied ? <Check size={18} /> : <Copy size={18} />}</button></div></div>
      </section>
    </div>
    <Suspense fallback={null}><CameraPanel isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onCapture={handleCameraCapture} /></Suspense>
    <ImageLightbox isOpen={isLightboxOpen} imageUrl={translatedImage} onClose={() => setIsLightboxOpen(false)} />
  </main>;
};
