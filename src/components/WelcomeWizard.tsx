import React, { useState, useRef } from 'react';
import { Settings as SettingsIcon, X, Upload, Scan, Eye, EyeOff, Mic, Image as ImageIcon, CheckCircle, Sparkles } from 'lucide-react';
import { AISettings, DEFAULT_SETTINGS, DASHSCOPE_OCR_ENDPOINT, DASHSCOPE_OCR_INTL_ENDPOINT, API_FORMAT_OPTIONS, type APIFormat, type LocalAsrEngine, type LocalVadMode } from '../utils/config/settings';
import { importConfigFromFile, importConfigFromQRCode } from '../utils/config/export';
import { Html5Qrcode } from 'html5-qrcode';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { useBackdropClose } from '../hooks/useBackdropClose';

interface WelcomeWizardProps {
  isOpen: boolean;
  onComplete: (settings: AISettings) => void;
  onSkip: () => void;
}

const SILICONFLOW_ENDPOINT = 'https://api.siliconflow.cn/v1';
const HUNYUAN_MT_MODEL = 'tencent/Hunyuan-MT-7B';

/**
 * Check if the model is Hunyuan-MT
 */
const isHunyuanMT = (modelName: string): boolean => {
  const normalized = modelName.toLowerCase();
  return normalized.includes('hunyuan-mt');
};

/**
 * Determine the appropriate output mode based on model
 */
const determineOutputMode = (settings: AISettings): 'plain' | 'structured' => {
  // Check if user is using translation service or general AI
  const useTranslationService = !!(settings.apiKey && settings.endpoint && settings.modelName);
  const modelName = useTranslationService
    ? settings.modelName
    : settings.generalAI.modelName;

  // If model is Hunyuan-MT, use plain text mode
  if (isHunyuanMT(modelName)) {
    return 'plain';
  }

  // Otherwise, use structured mode (default)
  return 'structured';
};

type ConfigMode = 'general' | 'translation';
type Mode = 'import-file' | 'import-qr';
type Step = 'choice' | 'translation' | 'speech' | 'image';

export const WelcomeWizard: React.FC<WelcomeWizardProps> = ({ isOpen, onComplete, onSkip }) => {
  const [setupMode, setSetupMode] = useState<'manual' | 'import'>('manual');
  const [currentStep, setCurrentStep] = useState<Step>('choice');
  const [configMode, setConfigMode] = useState<ConfigMode>('general');
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);

  // Import state
  const [importMode, setImportMode] = useState<Mode | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const backdropCloseHandlers = useBackdropClose<HTMLDivElement>({ onClose: onSkip });

  if (!isOpen) return null;

  // One-click fill for SiliconFlow + Hunyuan-MT (Recommended)
  const handleQuickFillSiliconFlow = () => {
    setSettings({
      ...settings,
      provider: 'custom',
      endpoint: SILICONFLOW_ENDPOINT,
      modelName: HUNYUAN_MT_MODEL,
    });
  };

  const handleTranslationNext = () => {
    // Validate based on config mode
    if (configMode === 'general') {
      const hasGeneralAI = settings.generalAI.apiKey && settings.generalAI.endpoint && settings.generalAI.modelName;
      if (!hasGeneralAI) return;
    } else {
      const hasTranslation = settings.apiKey && settings.endpoint && settings.modelName;
      if (!hasTranslation) return;
    }

    setCurrentStep('speech');
  };

  const handleSpeechNext = () => {
    setCurrentStep('image');
  };

  const handleImageComplete = () => {
    // Determine appropriate output mode before completing
    const outputMode = determineOutputMode(settings);
    const finalSettings = {
      ...settings,
      translation: {
        ...settings.translation,
        outputMode,
      },
    };
    onComplete(finalSettings);
  };

  const handleSetLater = () => {
    if (currentStep === 'speech') {
      setCurrentStep('image');
    } else if (currentStep === 'image') {
      // Determine appropriate output mode before completing
      const outputMode = determineOutputMode(settings);
      const finalSettings = {
        ...settings,
        translation: {
          ...settings.translation,
          outputMode,
        },
      };
      onComplete(finalSettings);
    }
  };

  // Import handlers
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !password) {
      setImportError('Please select a file and enter the password');
      return;
    }

    setIsProcessing(true);
    setImportError(null);
    try {
      const imported = await importConfigFromFile(file, password);
      onComplete(imported);
      setImportSuccess('Settings imported successfully!');
      setTimeout(() => {
        setPassword('');
        setImportMode(null);
        setImportSuccess(null);
      }, 1500);
    } catch (err) {
      setImportError(`Import failed: ${err instanceof Error ? err.message : 'Invalid password or corrupted file'}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const startQRScanner = async () => {
    if (!password) {
      setImportError('Please enter the password first');
      return;
    }

    setIsScanning(true);
    setImportError(null);

    try {
      const scanner = new Html5Qrcode('qr-reader-wizard');
      qrScannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          try {
            const imported = await importConfigFromQRCode(decodedText, password);
            await scanner.stop();
            qrScannerRef.current = null;
            setIsScanning(false);
            onComplete(imported);
            setImportSuccess('Settings imported successfully!');
            setTimeout(() => {
              setPassword('');
              setImportMode(null);
              setImportSuccess(null);
            }, 1500);
          } catch (err) {
            setImportError(`Import failed: ${err instanceof Error ? err.message : 'Invalid password or QR code'}`);
            await scanner.stop();
            qrScannerRef.current = null;
            setIsScanning(false);
          }
        },
        () => {
          // Ignore scan errors (no QR code detected)
        }
      );
    } catch (err) {
      setImportError(`Scanner failed: ${err instanceof Error ? err.message : 'Camera access denied'}`);
      setIsScanning(false);
    }
  };

  const stopQRScanner = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
      qrScannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleBackToChoice = () => {
    setCurrentStep('choice');
    setSetupMode('manual');
    setImportMode(null);
    setPassword('');
    setImportError(null);
    setImportSuccess(null);
    stopQRScanner();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropCloseHandlers}
    >
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <img src="/icons/buddy.png" alt="Buddy" className="w-8 h-8" />
            <div>
              <h2 className="text-base sm:text-xl font-bold text-gray-800 dark:text-white">Welcome to tabitomo!</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Your AI-powered travel companion</p>
            </div>
          </div>
          <button onClick={onSkip} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-all duration-200 btn-pop" title="Skip for now">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 pt-4 max-h-[60vh] overflow-y-overlay custom-scrollbar">
          {currentStep === 'choice' && setupMode === 'manual' && (
            <div className="space-y-3">
              <div className="text-center mb-3 pt-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">Choose how you'd like to get started</p>
              </div>

              {/* Manual Setup */}
              <button
                onClick={() => {
                  setSetupMode('manual');
                  setCurrentStep('translation');
                }}
                className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200 cute-shadow btn-pop text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg shrink-0 cute-shadow">
                    <SettingsIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white">Manual Setup</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Configure your AI service step by step</p>
                  </div>
                </div>
              </button>

              {/* Import Settings */}
              <button
                onClick={() => {
                  setSetupMode('import');
                }}
                className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200 cute-shadow btn-pop text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg shrink-0 cute-shadow">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white">Import Settings</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Load settings from file or QR code</p>
                  </div>
                </div>
              </button>

              {/* Info Box */}
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <strong>Note:</strong> You can always change these settings later from the settings menu. Skipping will show this wizard again on next launch.
                </p>
              </div>
            </div>
          )}

          {currentStep === 'translation' && setupMode === 'manual' && (
            <div className="space-y-4">
              <button onClick={handleBackToChoice} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                ← Back to options
              </button>

              {/* Step 1: Choose Config Mode */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">What would you like to configure?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setConfigMode('general')} className={`p-3 rounded-xl border-2 transition-all duration-200 ${configMode === 'general' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                    <div className="text-sm font-bold text-gray-800 dark:text-white">General AI</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">For all services</div>
                  </button>
                  <button onClick={() => setConfigMode('translation')} className={`p-3 rounded-xl border-2 transition-all duration-200 ${configMode === 'translation' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                    <div className="text-sm font-bold text-gray-800 dark:text-white">Translation</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Specific service</div>
                  </button>
                </div>
              </div>

              {/* Step 2: Fill Config Fields */}
              {configMode === 'general' ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white">General AI Service</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">This service will be used for all AI features (translation, image OCR, VLM)</p>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">API Format</label>
                    <Select
                      value={settings.generalAI.apiFormat || DEFAULT_SETTINGS.generalAI.apiFormat}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          generalAI: {
                            ...settings.generalAI,
                            apiFormat: value as APIFormat,
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select API format" />
                      </SelectTrigger>
                      <SelectContent>
                        {API_FORMAT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">API Endpoint</label>
                    <input type="text" value={settings.generalAI.endpoint} onChange={(e) => setSettings({ ...settings, generalAI: { ...settings.generalAI, endpoint: e.target.value } })} placeholder="https://api.openai.com/v1" className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model Name</label>
                    <input type="text" value={settings.generalAI.modelName} onChange={(e) => setSettings({ ...settings, generalAI: { ...settings.generalAI, modelName: e.target.value } })} placeholder="gpt-5.6-terra" className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">API Key</label>
                    <input type="password" value={settings.generalAI.apiKey} onChange={(e) => setSettings({ ...settings, generalAI: { ...settings.generalAI, apiKey: e.target.value } })} placeholder="sk-..." className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-white">Translation Service</h3>
                    <button onClick={handleQuickFillSiliconFlow} className="px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all duration-200 btn-pop">
                      Recommended Settings
                    </button>
                  </div>

                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs text-indigo-800 dark:text-indigo-200">
                      <strong>Tip:</strong> Use "Recommended Settings" to auto-fill endpoint and model for SiliconFlow + Hunyuan-MT
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">API Endpoint</label>
                    <input type="text" value={settings.endpoint} onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })} placeholder="https://api.siliconflow.cn/v1" className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model Name</label>
                    <input type="text" value={settings.modelName} onChange={(e) => setSettings({ ...settings, modelName: e.target.value })} placeholder="tencent/Hunyuan-MT-7B" className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">API Key</label>
                    <input type="password" value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} placeholder="sk-..." className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                  </div>
                </div>
              )}

              <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <strong>Next:</strong> We'll help you configure speech and image services.
                </p>
              </div>

              <button onClick={handleTranslationNext} disabled={configMode === 'general' ? !(settings.generalAI.apiKey && settings.generalAI.endpoint && settings.generalAI.modelName) : !(settings.apiKey && settings.endpoint && settings.modelName)} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-500 text-white font-semibold rounded-xl cute-shadow hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-pop">
                <Mic className="w-5 h-5" />
                Next: Speech Recognition
              </button>
            </div>
          )}

          {currentStep === 'speech' && (
            <div className="space-y-4">
              <button onClick={() => setCurrentStep('translation')} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                ← Back to translation
              </button>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Mic className="w-4 h-4" />
                  Speech Recognition
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">Step 2 of 3</span>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
                  <Select
                    value={settings.speechRecognition.provider}
                    onValueChange={(value: 'web-speech' | 'siliconflow' | 'local') =>
                      setSettings({
                        ...settings,
                        speechRecognition: {
                          ...settings.speechRecognition,
                          provider: value,
                          localEngine: settings.speechRecognition.localEngine || 'whisper',
                          vadMode: settings.speechRecognition.vadMode || 'silero',
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="web-speech">Web Speech API (Browser)</SelectItem>
                      <SelectItem value="siliconflow">AI Service (SiliconFlow)</SelectItem>
                      <SelectItem value="local">Local Model (sherpa-onnx)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {settings.speechRecognition.provider === 'siliconflow' && (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model Name</label>
                      <input
                        type="text"
                        value={settings.speechRecognition.modelName || 'TeleAI/TeleSpeechASR'}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            speechRecognition: { ...settings.speechRecognition, modelName: e.target.value },
                          })
                        }
                        placeholder="TeleAI/TeleSpeechASR"
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">API Key</label>
                      <input
                        type="password"
                        value={settings.speechRecognition.apiKey || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            speechRecognition: { ...settings.speechRecognition, apiKey: e.target.value },
                          })
                        }
                        placeholder={configMode === 'translation' && settings.apiKey ? 'Using Translation API Key' : 'sk-...'}
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">Leave empty to use the same API key as translation service</p>
                    </div>
                  </>
                )}

                {settings.speechRecognition.provider === 'local' && (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Local Engine</label>
                      <Select
                        value={settings.speechRecognition.localEngine || 'whisper'}
                        onValueChange={(value: LocalAsrEngine) =>
                          setSettings({
                            ...settings,
                            speechRecognition: {
                              ...settings.speechRecognition,
                              localEngine: value,
                            },
                          })
                        }
                      >
                        <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="whisper">Whisper</SelectItem>
                          <SelectItem value="sensevoice">SenseVoice</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model Directory URL</label>
                      <input
                        type="text"
                        value={settings.speechRecognition.localModelPath || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            speechRecognition: { ...settings.speechRecognition, localModelPath: e.target.value },
                          })
                        }
                        placeholder="https://example.com/models/sherpa-whisper-base"
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">You can leave this empty and configure it later in Settings.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Runtime Assets URL</label>
                      <input
                        type="text"
                        value={settings.speechRecognition.localAssetBaseUrl || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            speechRecognition: { ...settings.speechRecognition, localAssetBaseUrl: e.target.value },
                          })
                        }
                        placeholder="Optional separate sherpa runtime folder"
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">VAD Mode</label>
                      <Select
                        value={settings.speechRecognition.vadMode || 'silero'}
                        onValueChange={(value: LocalVadMode) =>
                          setSettings({
                            ...settings,
                            speechRecognition: { ...settings.speechRecognition, vadMode: value },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="silero">Silero VAD</SelectItem>
                          <SelectItem value="energy">Energy fallback</SelectItem>
                          <SelectItem value="off">Off</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {(settings.speechRecognition.provider === 'siliconflow' || settings.speechRecognition.provider === 'local') && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Realtime Transcription</span>
                    <Switch
                      checked={settings.speechRecognition.enableRealtimeTranscription !== false}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          speechRecognition: {
                            ...settings.speechRecognition,
                            enableRealtimeTranscription: checked,
                          },
                        })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <strong>Next:</strong> Configure image recognition service.
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={handleSetLater} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition-all duration-200 btn-pop">
                  Set it later
                </button>
                <button onClick={handleSpeechNext} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-500 text-white font-semibold rounded-xl cute-shadow hover:bg-indigo-400 transition-all duration-200 btn-pop">
                  <ImageIcon className="w-5 h-5" />
                  Next: Image Recognition
                </button>
              </div>
            </div>
          )}

          {currentStep === 'image' && (
            <div className="space-y-4">
              <button onClick={() => setCurrentStep('speech')} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                ← Back to speech
              </button>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  OCR Recognition
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">Step 3 of 3</span>
              </div>

              <div className="space-y-4">
                {/* OCR Section */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">OCR Provider</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() =>
                          setSettings({
                            ...settings,
                            imageOCR: {
                              ...settings.imageOCR,
                              provider: 'local-ppocr',
                              useGeneralAI: false,
                            },
                          })
                        }
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.imageOCR.provider === 'local-ppocr' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Local</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">PP-OCRv5</div>
                      </button>
                      <button
                        onClick={() =>
                          setSettings({
                            ...settings,
                            imageOCR: {
                              ...settings.imageOCR,
                              provider: 'qwen',
                              useGeneralAI: false,
                              endpoint: settings.imageOCR.endpoint.includes('aliyuncs.com') ? settings.imageOCR.endpoint : DASHSCOPE_OCR_ENDPOINT,
                              modelName: settings.imageOCR.modelName || 'qwen3.5-ocr',
                            },
                          })
                        }
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.imageOCR.provider !== 'local-ppocr' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Alibaba Qwen-OCR</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Model Studio API</div>
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Cloud OCR currently accepts only Alibaba Cloud Model Studio / DashScope. It returns absolute coordinates for translated overlays.</p>
                    {(settings.imageOCR.provider === 'custom' || settings.imageOCR.useGeneralAI) && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">The imported legacy OCR provider is not adapted for coordinate OCR. Choose Local or Alibaba Qwen-OCR.</p>
                    )}
                  </div>
                </div>

                {/* Region Selection for Qwen */}
                {settings.imageOCR.provider !== 'local-ppocr' && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Region</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() =>
                          setSettings({
                            ...settings,
                            imageOCR: { ...settings.imageOCR, provider: 'qwen', useGeneralAI: false, endpoint: DASHSCOPE_OCR_ENDPOINT },
                          })
                        }
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.imageOCR.endpoint === DASHSCOPE_OCR_ENDPOINT ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Beijing</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">China Mainland</div>
                      </button>
                      <button
                        onClick={() =>
                          setSettings({
                            ...settings,
                            imageOCR: {
                              ...settings.imageOCR,
                              provider: 'qwen',
                              useGeneralAI: false,
                              endpoint: DASHSCOPE_OCR_INTL_ENDPOINT,
                            },
                          })
                        }
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.imageOCR.endpoint === DASHSCOPE_OCR_INTL_ENDPOINT ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Singapore</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">International</div>
                      </button>
                    </div>
                  </div>
                )}

                {settings.imageOCR.provider !== 'local-ppocr' && (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Alibaba OCR Endpoint</label>
                      <input
                        type="text"
                        value={settings.imageOCR.endpoint || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            imageOCR: { ...settings.imageOCR, provider: 'qwen', useGeneralAI: false, endpoint: e.target.value },
                          })
                        }
                        placeholder={DASHSCOPE_OCR_INTL_ENDPOINT}
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Qwen OCR Model</label>
                      <Select value={settings.imageOCR.modelName || 'qwen3.5-ocr'} onValueChange={(modelName) => setSettings({ ...settings, imageOCR: { ...settings.imageOCR, provider: 'qwen', modelName } })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qwen3.5-ocr">qwen3.5-ocr (Recommended)</SelectItem>
                          <SelectItem value="qwen-vl-ocr-latest">qwen-vl-ocr-latest (Compatibility)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 dark:text-gray-400">The advanced recognition task returns line text and coordinates for overlay translation.</p>
                    </div>
                  </>
                )}

                {/* API Key for OCR */}
                {settings.imageOCR.provider !== 'local-ppocr' && (
                  <div className="space-y-2 pb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Alibaba Model Studio API Key</label>
                    <input
                      type="password"
                      value={settings.imageOCR.apiKey || ''}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          imageOCR: { ...settings.imageOCR, apiKey: e.target.value },
                        })
                      }
                      placeholder="sk-..."
                      className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                    />
                  </div>
                )}

                {/* VLM Section */}
                <div className="space-y-3 pt-5 border-t-2 border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    VLM Direct Translation
                  </h3>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">VLM Settings</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() =>
                          setSettings({
                            ...settings,
                            vlm: { ...settings.vlm, useGeneralAI: true, useCustom: false },
                          })
                        }
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.vlm.useGeneralAI ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">General AI</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Use General</div>
                      </button>
                      <button
                        onClick={() =>
                          setSettings({
                            ...settings,
                            vlm: { ...settings.vlm, useGeneralAI: false, useCustom: false },
                          })
                        }
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${!settings.vlm.useGeneralAI && !settings.vlm.useCustom ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Use OCR</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Same as OCR</div>
                      </button>
                      <button
                        onClick={() =>
                          setSettings({
                            ...settings,
                            vlm: { ...settings.vlm, useGeneralAI: false, useCustom: true },
                          })
                        }
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${!settings.vlm.useGeneralAI && settings.vlm.useCustom ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Custom</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Custom VLM</div>
                      </button>
                    </div>
                  </div>

                  {!settings.vlm.useGeneralAI && !settings.vlm.useCustom && (
                    <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-800 dark:bg-indigo-900/20">
                      <div className="text-sm font-semibold text-gray-800 dark:text-white">OCR settings used by VLM</div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {settings.imageOCR.provider === 'local-ppocr'
                          ? 'Local PP-OCR extracts coordinates for the OCR overlay workflow. It is not a direct VLM; choose General AI or Custom for direct image translation.'
                          : 'Uses the Alibaba API key and region above with qwen-vl-max-latest for direct image translation. qwen3.5-ocr remains the coordinate OCR model.'}
                      </p>
                    </div>
                  )}

                  {!settings.vlm.useGeneralAI && settings.vlm.useCustom && (
                    <>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">VLM API Endpoint</label>
                        <input
                          type="text"
                          value={settings.vlm.endpoint || ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              vlm: { ...settings.vlm, endpoint: e.target.value },
                            })
                          }
                          placeholder="https://api.example.com/v1"
                          className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">VLM Model Name</label>
                        <input
                          type="text"
                          value={settings.vlm.modelName || ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              vlm: { ...settings.vlm, modelName: e.target.value },
                            })
                          }
                          placeholder="gpt-4o"
                          className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">VLM API Key</label>
                        <input
                          type="password"
                          value={settings.vlm.apiKey || ''}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              vlm: { ...settings.vlm, apiKey: e.target.value },
                            })
                          }
                          placeholder="sk-..."
                          className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </>
                  )}

                  {/* Thinking Mode Toggle */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label htmlFor="thinkingMode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Enable Thinking Mode
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Show model's reasoning process in VLM translations</p>
                      </div>
                      <Switch
                        id="thinkingMode"
                        checked={settings.vlm?.enableThinking || false}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            vlm: { ...settings.vlm, enableThinking: checked },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-800">
                <p className="text-xs text-green-800 dark:text-green-200">
                  <strong>Ready!</strong> You're all set to start using tabitomo.
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={handleSetLater} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-xl transition-all duration-200 btn-pop">
                  Set it later
                </button>
                <button onClick={handleImageComplete} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-500 text-white font-semibold rounded-xl cute-shadow hover:bg-indigo-400 transition-all duration-200 btn-pop">
                  <CheckCircle className="w-5 h-5" />
                  Complete Setup
                </button>
              </div>
            </div>
          )}

          {setupMode === 'import' && (
            <div className="space-y-4">
              {!importMode && (
                <button onClick={handleBackToChoice} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                  ← Back to options
                </button>
              )}

              {!importMode ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Import your encrypted settings from file or QR code</p>

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setImportMode('import-file')} className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200 min-h-[100px] flex flex-col items-center justify-center btn-pop">
                      <Upload className="w-6 h-6 mb-2 text-indigo-500" />
                      <div className="text-sm font-bold text-gray-800 dark:text-white">File</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">From .ttconfig</div>
                    </button>
                    <button onClick={() => setImportMode('import-qr')} className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200 min-h-[100px] flex flex-col items-center justify-center btn-pop">
                      <Scan className="w-6 h-6 mb-2 text-indigo-500" />
                      <div className="text-sm font-bold text-gray-800 dark:text-white">Scan QR</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Use camera</div>
                    </button>
                  </div>

                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs text-indigo-800 dark:text-indigo-200">
                      <strong>Security:</strong> Settings are encrypted with AES-256. You'll need the password used during export.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <button onClick={() => setImportMode(null)} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                    ← Back to import options
                  </button>

                  {/* Password Input */}
                  <div className="space-y-1.5">
                    <label htmlFor="password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Password
                    </label>
                    <div className="relative">
                      <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter decryption password" className="w-full px-3 py-2 pr-10 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Import File */}
                  {importMode === 'import-file' && (
                    <>
                      <input ref={fileInputRef} type="file" accept=".ttconfig" onChange={handleImportFile} className="hidden" />
                      <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing || !password} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white font-semibold rounded-xl cute-shadow hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-pop">
                        <Upload className="w-4 h-4" />
                        {isProcessing ? 'Importing...' : 'Select File'}
                      </button>
                    </>
                  )}

                  {/* Import QR */}
                  {importMode === 'import-qr' && (
                    <>
                      {!isScanning ? (
                        <button onClick={startQRScanner} disabled={isProcessing || !password} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white font-semibold rounded-xl cute-shadow hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-pop">
                          <Scan className="w-4 h-4" />
                          Start Scanning
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div id="qr-reader-wizard" className="rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700"></div>
                          <button onClick={stopQRScanner} className="w-full px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all duration-200 btn-pop">
                            Stop Scanning
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Error Message */}
                  {importError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-xl border border-red-200 dark:border-red-800">
                      <p className="text-sm text-red-800 dark:text-red-200">{importError}</p>
                    </div>
                  )}

                  {/* Success Message */}
                  {importSuccess && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-800">
                      <p className="text-sm text-green-800 dark:text-green-200">{importSuccess}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
