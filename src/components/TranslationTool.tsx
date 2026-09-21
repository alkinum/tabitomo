import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hasProviderConnection } from '../utils/config/settings';
import React, { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { translateText, SUPPORTED_LANGUAGES, type LanguageCode } from '../utils/translation/translation';
import { speakText, stopSpeaking, getSpeechLocale } from '../utils/audio/speech';
import { transcribeCloudAudio } from '../utils/audio/audioTranscription';
import { RealtimeTranscriptionService } from '../utils/audio/realtimeTranscription';
import { localAsrService } from '../utils/audio/localAsr';
import { performOCR, imageToBase64, streamTranslateImageWithVLM } from '../utils/image/imageOcr';
import { getSpeechConnection } from '../../packages/tabitomo-core/src/speech';
import { isLocalProviderEndpoint } from '../utils/config/settings';
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
  const [furiganaHtml, setFuriganaHtml] = useState<{ text: string; html: string } | null>(null);
  // UI state
  const [inputMethod, setInputMethod] = useState<InputMethod>('text');
  const [textMode, setTextMode] = useState<TextMode>('translation');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyGenerationRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingSessionRef = useRef(0);
  const recordingStartingRef = useRef(false);
  const audioAbortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
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
  const imageSelectionRef = useRef(0);
  // Translation cache
  const translationCacheRef = useRef<Map<string, CachedTranslation>>(new Map());
  const speechProvider = settings.speechRecognition.provider;
  // Toast hook
  const { toast } = useToast();

  const cancelAudio = useCallback(() => {
    recordingSessionRef.current += 1;
    recordingStartingRef.current = false;
    audioAbortRef.current?.abort();
    audioAbortRef.current = null;
    if (realtimeTranslationTimerRef.current) clearTimeout(realtimeTranslationTimerRef.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = () => {};
      recognition.onerror = () => {};
      recognition.onend = () => {};
      try { recognition.stop(); } catch { /* Already stopped. */ }
    }
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      recorder.stream.getTracks().forEach(track => track.stop());
    }
    const realtime = realtimeTranscriptionRef.current;
    realtimeTranscriptionRef.current = null;
    if (realtime) void realtime.stop().catch(() => {});
    setIsRecording(false);
    setIsTranscribing(false);
    setInterimTranscript('');
  }, []);
  useEffect(() => cancelAudio, [settings, inputMethod, sourceLang, targetLang, textMode, cancelAudio]);

  const cancelWorkspaceRequest = useCallback(() => {
    imageSelectionRef.current += 1;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    for (const ref of [translationAbortControllerRef, explanationAbortControllerRef, qaAbortControllerRef, imageAbortControllerRef]) {
      ref.current?.abort();
      ref.current = null;
    }
    setIsTranslating(false);
    setIsProcessingImage(false);
    setIsThinking(false);
    setError(null);
  }, []);

  useEffect(() => {
    cancelWorkspaceRequest();
    translationCacheRef.current.clear();
    setTargetText('');
    setTranslatedImage(null);
    return cancelWorkspaceRequest;
  }, [settings, cancelWorkspaceRequest]);

  useEffect(() => {
    copyGenerationRef.current += 1;
    setCopied(false);
    setIsSpeaking(false);
    stopSpeaking();
    return () => {
      copyGenerationRef.current += 1;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      stopSpeaking();
    };
  }, [targetText, targetLang]);

  const changeLanguage = (side: 'source' | 'target', language: LanguageCode) => {
    cancelWorkspaceRequest();
    setTargetText('');
    setTranslatedImage(null);
    if (side === 'source') setSourceLang(language);
    else setTargetLang(language);
  };

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
    cancelWorkspaceRequest();
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

  // Ignore annotation work for an old result or a streamed Markdown response.
  useEffect(() => {
    let active = true;
    setFuriganaHtml(null);
    if (targetText && targetLang === 'ja' && inputMethod === 'text' && textMode === 'translation') {
      void import('../utils/language/japanese').then(({ addFuriganaAnnotations }) => addFuriganaAnnotations(targetText))
        .then(html => { if (active) setFuriganaHtml({ text: targetText, html }); })
        .catch(() => { if (active) setFuriganaHtml(null); });
    }
    return () => { active = false; };
  }, [targetText, targetLang, inputMethod, textMode]);

  // Handle language swap
  const handleSwapLanguages = () => {
    cancelWorkspaceRequest();
    setTranslatedImage(null);
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    if (inputMethod !== 'image') {
      setSourceText(targetText);
      setTargetText(sourceText);
    } else {
      setTargetText('');
    }
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

    cancelWorkspaceRequest();
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
      if (abortController.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
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
      if (abortController.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
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
      if (abortController.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
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
    cancelAudio();
    cancelWorkspaceRequest();
    setTargetText('');

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
  // Copy feedback belongs to the result that was actually copied.
  const copyToClipboard = async () => {
    if (!targetText) return;
    const generation = ++copyGenerationRef.current;
    try {
      await navigator.clipboard.writeText(targetText);
      if (generation !== copyGenerationRef.current) return;
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Allow clipboard access or select and copy the text.' });
    }
  };
  const toggleSpeech = () => {
    if (isSpeaking) { stopSpeaking(); setIsSpeaking(false); return; }
    try {
      const started = speakText(targetText, targetLang, () => setIsSpeaking(false));
      setIsSpeaking(started);
      if (!started) toast({ variant: 'destructive', title: 'Audio unavailable', description: 'Speech playback is not available in this browser.' });
    } catch {
      setIsSpeaking(false);
      toast({ variant: 'destructive', title: 'Audio unavailable', description: 'Could not start speech playback. Try again.' });
    }
  };
  // Scope every permission prompt, transcript and media callback to its recording.
  const startRecording = async () => {
    if (recordingStartingRef.current || isRecording || isTranscribing) return;
    if (speechProvider === 'local' && !settings.speechRecognition.localModelPath?.trim()) {
      setError('Set a local model directory in Speech settings before recording.');
      onOpenSettings('speech');
      return;
    }
    if (speechProvider === 'openai-compatible') {
      const connection = getSpeechConnection(settings);
      if (!connection.endpoint || !connection.modelName || (!connection.apiKey && !isLocalProviderEndpoint(connection.endpoint))) {
        setError('Configure the speech endpoint, model and API key before recording.');
        onOpenSettings('speech');
        return;
      }
    }
    cancelAudio();
    cancelWorkspaceRequest();
    const session = ++recordingSessionRef.current;
    const current = () => session === recordingSessionRef.current;
    recordingStartingRef.current = true;
    setSourceText(''); setTargetText(''); setInterimTranscript('');
    setIsRecording(true);
    try {
      if (speechProvider === 'web-speech') {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) throw new Error('Voice recognition is not supported in this browser.');
        const recognition = new SpeechRecognitionAPI();
        recognitionRef.current = recognition;
        recognition.lang = getSpeechLocale(sourceLang);
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        let transcript = '';
        recognition.onresult = event => {
          if (!current()) return;
          transcript = Array.from(event.results).map(result => result[0].transcript).join('');
          setSourceText(transcript);
        };
        recognition.onerror = event => {
          if (!current()) return;
          cancelAudio();
          setError(event.error === 'not-allowed' || event.error === 'audio-capture'
            ? 'Allow microphone access in your browser settings to use voice input.'
            : `Voice recognition error: ${event.error}`);
        };
        recognition.onend = () => {
          if (!current()) return;
          recognitionRef.current = null;
          setIsRecording(false);
          if (transcript.trim()) runCurrentText(transcript.trim());
        };
        recognition.start();
        return;
      }
      if (settings.speechRecognition.enableRealtimeTranscription !== false) {
        let transcript = '';
        const realtime = new RealtimeTranscriptionService(settings, {
          sourceLang,
          onTranscript: (text, isFinal) => {
            if (!current()) return;
            if (!isFinal) { setInterimTranscript(text); return; }
            const separator = ['zh', 'zh-Hant', 'ja', 'ko'].includes(sourceLang) ? '' : ' ';
            transcript = transcript ? transcript + separator + text : text;
            setSourceText(transcript); setInterimTranscript('');
            if (realtimeTranslationTimerRef.current) clearTimeout(realtimeTranslationTimerRef.current);
            realtimeTranslationTimerRef.current = setTimeout(() => {
              if (current() && transcript.trim()) runCurrentText(transcript.trim());
            }, 800);
          },
          onError: error => { if (current()) setError(error.message); },
        });
        realtimeTranscriptionRef.current = realtime;
        await realtime.start();
        if (!current()) await realtime.stop();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return; }
      try {
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        const chunks: Blob[] = [];
        recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
        recorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          if (!current()) return;
          mediaRecorderRef.current = null;
          setIsRecording(false); setIsTranscribing(true);
          const controller = new AbortController();
          audioAbortRef.current = controller;
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
            const text = speechProvider === 'local'
              ? await localAsrService.transcribeBlob(blob, settings, { sourceLang })
              : await transcribeCloudAudio(blob, settings, controller.signal);
            if (current()) { setSourceText(text); if (text.trim()) runCurrentText(text); }
          } catch (error) {
            if (current() && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Transcription failed');
          } finally {
            if (current()) { audioAbortRef.current = null; setIsTranscribing(false); }
          }
        };
        recorder.start();
      } catch (error) {
        stream.getTracks().forEach(track => track.stop());
        throw error;
      }
    } catch (error) {
      if (current()) {
        cancelAudio();
        setError(error instanceof Error ? error.message : 'Could not start voice input.');
      }
    } finally {
      if (current()) recordingStartingRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (recordingStartingRef.current) { cancelAudio(); return; }
    const session = recordingSessionRef.current;
    if (realtimeTranslationTimerRef.current) clearTimeout(realtimeTranslationTimerRef.current);
    const realtime = realtimeTranscriptionRef.current;
    if (realtime) {
      realtimeTranscriptionRef.current = null;
      setIsRecording(false); setIsTranscribing(true);
      try {
        const transcript = await realtime.stop();
        if (session !== recordingSessionRef.current) return;
        if (realtimeTranslationTimerRef.current) clearTimeout(realtimeTranslationTimerRef.current);
        setInterimTranscript(''); setSourceText(transcript);
        if (transcript.trim()) runCurrentText(transcript.trim());
      } catch (error) {
        if (session === recordingSessionRef.current) setError(error instanceof Error ? error.message : 'Could not finish voice input.');
      } finally {
        if (session === recordingSessionRef.current) setIsTranscribing(false);
      }
      return;
    }
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); }
      catch { cancelAudio(); }
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
      setSourceText('');
      setTargetText('');
      setTranslatedImage(null);
      setImage(base64Image);

      // VLM Mode: Direct translation without OCR (with streaming)
      if (visionMode) {
        console.log('[Image VLM] Starting VLM streaming translation...');

        // Check if VLM is configured
        if (!isVLMConfigured()) {
          setIsProcessingImage(false);
          setError('Configure Vision translation in Image settings, or choose OCR text.');
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
          if (abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
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
        } else {
          setError('Could not create the image overlay. Try Vision translation.');
          setIsProcessingImage(false);
          imageAbortControllerRef.current = null;
        }
      };
      img.onerror = (err) => {
        console.error('[Canvas] Failed to load image:', err);
        if (abortController.signal.aborted) return;
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
      if (abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        console.log('[Image Processing] Request was cancelled');
        return;
      }
      console.error('[Image Processing] Error:', err);
      setError(err instanceof Error ? err.message : 'OCR failed');
      // Keep the selected image so the user can retry.
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
      const selection = ++imageSelectionRef.current;

      try {
        const base64Image = await imageToBase64(file);
        if (selection !== imageSelectionRef.current) return;
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
    cancelWorkspaceRequest();
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
  const busy = isTranslating || isProcessingImage || isTranscribing;
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
        <Select value={sourceLang} disabled={isRecording} onValueChange={(value) => changeLanguage('source', value as LanguageCode)}><SelectTrigger aria-label="Source language"><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map((lang) => <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>)}</SelectContent></Select>
        <button id="swap-button" aria-label="Swap languages" title="Swap languages" className="workspace-icon" disabled={isRecording} onClick={handleSwapLanguages}><ArrowLeftRight size={18} /></button>
      </>}
      {assistantMode && <span className="workspace-language-label">Target Language</span>}
      <Select value={targetLang} disabled={isRecording} onValueChange={(value) => changeLanguage('target', value as LanguageCode)}><SelectTrigger aria-label="Target language"><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map((lang) => <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className="workspace-content">
      <section className="workspace-source" aria-label="Source">
        <div className="workspace-panel-heading"><h2>{inputMethod === 'image' ? 'Photo' : inputMethod === 'qa' ? 'Your question' : 'Source'}</h2>{(sourceText || image) && <button className="workspace-clear" aria-label="Clear" title="Clear" disabled={isRecording} onClick={() => { cancelAudio(); cancelWorkspaceRequest(); setSourceText(''); setTargetText(''); setImage(null); setTranslatedImage(null); setIsTranslating(false); setIsProcessingImage(false); setError(null); }}>Clear</button>}</div>
        {inputMethod === 'image' ? <div className="workspace-photo">
          {image ? <><img src={image} alt="Original" /><button className="workspace-icon photo-remove" aria-label="Remove image" onClick={() => { cancelWorkspaceRequest(); setImage(null); setSourceText(''); setTranslatedImage(null); setTargetText(''); }}><X size={17} /></button></> : <div {...getRootProps()} className="workspace-dropzone"><input {...getInputProps()} /><ImageIcon size={30} /><strong>Bring a photo, find the words.</strong><span>Drop an image or tap to choose</span><button className="workspace-secondary" onClick={(e) => { e.stopPropagation(); setIsCameraOpen(true); }}><Camera size={16} />Open camera</button></div>}
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
          {busy && !targetText ? <div role="status" className="workspace-empty"><Loader2 size={26} className="animate-spin" /><strong>{isProcessingImage ? 'Reading your photo…' : isTranscribing ? 'Transcribing…' : 'Finding the right words…'}</strong></div>
          : error ? <div role="alert" className="workspace-empty workspace-error"><p>{error}</p><button className="workspace-secondary" onClick={() => onOpenSettings(inputMethod === 'image' ? 'image' : 'general')}>Open Settings</button></div>
          : translatedImage && !useVLMMode ? <img src={translatedImage} alt="Translated" className="workspace-translated-image" onClick={() => setIsLightboxOpen(true)} />
          : targetText ? <>{busy && <p className="workspace-thinking" role="status">{isThinking ? 'Thinking…' : 'Translating…'}</p>}{!busy && isThinking && <p className="workspace-thinking" role="status">Thinking…</p>}{(inputMethod === 'image' && useVLMMode) || assistantMode ? <div className="prose dark:prose-invert prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{targetText}</ReactMarkdown></div> : furiganaHtml?.text === targetText ? <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: furiganaHtml.html }} /> : <p className="whitespace-pre-wrap">{targetText}</p>}</>
          : <div className="workspace-empty"><p>{inputMethod === 'qa' ? 'Ask a question and get a quick answer' : textMode === 'explanation' ? 'Enter text to see its explanation' : 'Translation will appear here'}</p>{!isGeneralAIConfigured() && !(hasProviderConnection(settings)) && <button className="workspace-secondary" onClick={() => onOpenSettings('general')}>Connect your AI</button>}</div>}
        </div>
        <div className="workspace-result-toolbar"><span role="status">{copied ? 'Copied to clipboard' : ''}</span><div className="workspace-toolbar-group"><button className="workspace-icon" disabled={!targetText} aria-label={isSpeaking ? 'Stop audio' : 'Play audio'} title={isSpeaking ? 'Stop audio' : 'Play audio'} aria-pressed={isSpeaking} onClick={toggleSpeech}><Volume2 size={18} /></button><button className="workspace-icon" disabled={!targetText} aria-label="Copy to clipboard" title="Copy to clipboard" onClick={copyToClipboard}>{copied ? <Check size={18} /> : <Copy size={18} />}</button></div></div>
      </section>
    </div>
    <Suspense fallback={null}><CameraPanel isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onCapture={handleCameraCapture} /></Suspense>
    <ImageLightbox isOpen={isLightboxOpen} imageUrl={translatedImage} onClose={() => setIsLightboxOpen(false)} />
  </main>;
};
