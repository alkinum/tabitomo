import { TranslationConnection } from './TranslationConnection';
import { clearTranslationOverride } from '../../packages/tabitomo-core/src/providerPresets';
import { OCRSettings } from './OCRSettings';
import { hasProviderConnection } from '../utils/config/settings';
import { AIConnection } from './AIConnection';
import React, { useState, useRef, useEffect } from 'react';
import { Settings as SettingsIcon, X, Upload, Scan, Eye, EyeOff, Mic, Image as ImageIcon, CheckCircle } from 'lucide-react';
import { AISettings, DEFAULT_SETTINGS, normalizeSettings, type LocalAsrEngine, type LocalVadMode } from '../utils/config/settings';
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const scannerGeneration = useRef(0);
  useEffect(() => {
    setIsScanning(false);
    return () => {
      scannerGeneration.current += 1;
      const scanner = qrScannerRef.current;
      qrScannerRef.current = null;
      if (scanner?.isScanning) void scanner.stop().catch(() => {});
    };
  }, [isOpen, setupMode, importMode]);

  const backdropCloseHandlers = useBackdropClose<HTMLDivElement>({ onClose: onSkip });

  if (!isOpen) return null;

  const handleTranslationNext = () => {
    // Validate based on config mode
    if (configMode === 'general') {
      const hasGeneralAI = hasProviderConnection(settings.generalAI);
      if (!hasGeneralAI) return;
    } else {
      const hasTranslation = hasProviderConnection(settings);
      if (!hasTranslation) return;
    }

    setCurrentStep('speech');
  };

  const handleSpeechNext = () => {
    setCurrentStep('image');
  };

  const handleImageComplete = () => {
    const finalSettings = normalizeSettings(configMode === 'general' ? clearTranslationOverride(settings) : settings);
    setSaveError(null);
    try { onComplete(finalSettings); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not save settings. Try again.'); }
  };

  const handleSetLater = () => {
    if (currentStep === 'speech') {
      setCurrentStep('image');
    } else if (currentStep === 'image') {
      handleImageComplete();
    }
  };

  // Import handlers
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !password) {
      setImportError('Please select a file and enter the password');
      return;
    }

    const generation = scannerGeneration.current;
    setIsProcessing(true);
    setImportError(null);
    try {
      const imported = await importConfigFromFile(file, password);
      if (generation !== scannerGeneration.current) return;
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

    const generation = ++scannerGeneration.current;
    setIsScanning(true);
    setImportError(null);

    try {
      const scanner = new Html5Qrcode('qr-reader-wizard');
      qrScannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (generation !== scannerGeneration.current) return;
          try {
            const imported = await importConfigFromQRCode(decodedText, password);
            if (generation !== scannerGeneration.current) return;
            scannerGeneration.current += 1;
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
      if (generation !== scannerGeneration.current && scanner.isScanning) await scanner.stop();
    } catch (err) {
      if (generation !== scannerGeneration.current) return;
      setImportError(`Scanner failed: ${err instanceof Error ? err.message : 'Camera access denied'}`);
      setIsScanning(false);
    }
  };

  const stopQRScanner = async () => {
    scannerGeneration.current += 1;
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
      className="safe-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropCloseHandlers}
    >
      <div className="setup-dialog relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <img src="/icons/buddy.png" alt="Buddy" className="w-8 h-8" />
            <div>
              <h2 className="text-base sm:text-xl font-bold text-gray-800 dark:text-white">Welcome to tabitomo!</h2>

            </div>
          </div>
          <button onClick={onSkip} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-all duration-200 btn-pop" title="Skip for now">
            <X className="w-5 h-5" />
          </button>
        </div>

        {saveError && <p role="alert" className="px-6 pt-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
        {/* Content */}
        <div className="p-6 pt-4 max-h-[60vh] overflow-y-overlay custom-scrollbar">
          {currentStep === 'choice' && setupMode === 'manual' && (
            <div className="space-y-3">

              {/* Manual Setup */}
              <button
                onClick={() => {
                  setSetupMode('manual');
                  setCurrentStep('translation');
                }}
                className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200 cute-shadow btn-pop text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg shrink-0 cute-shadow">
                    <SettingsIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white">Manual Setup</h3>

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
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg shrink-0 cute-shadow">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white">Import Settings</h3>

                  </div>
                </div>
              </button>

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

                  </button>
                  <button onClick={() => setConfigMode('translation')} className={`p-3 rounded-xl border-2 transition-all duration-200 ${configMode === 'translation' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                    <div className="text-sm font-bold text-gray-800 dark:text-white">Translation</div>

                  </button>
                </div>
              </div>

              {/* Step 2: Fill Config Fields */}
              {configMode === 'general' ? (
                <div className="space-y-3">
                  <AIConnection value={settings.generalAI} onChange={(generalAI) => setSettings({ ...settings, generalAI })}>

                    <div className="space-y-2">
                      <label htmlFor="setup-endpoint" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Endpoint</label>
                      <input id="setup-endpoint" type="text" value={settings.generalAI.endpoint} onChange={(e) => setSettings({ ...settings, generalAI: { ...settings.generalAI, endpoint: e.target.value } })} placeholder="https://api.openai.com/v1" className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="setup-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300">API key</label>
                      <input id="setup-api-key" type="password" value={settings.generalAI.apiKey} onChange={(e) => setSettings({ ...settings, generalAI: { ...settings.generalAI, apiKey: e.target.value } })} placeholder="sk-..." className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="setup-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model</label>
                      <input id="setup-model" type="text" value={settings.generalAI.modelName} onChange={(e) => setSettings({ ...settings, generalAI: { ...settings.generalAI, modelName: e.target.value } })} placeholder="Model ID" className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors" />
                    </div>
                  </AIConnection>
                </div>
              ) : (
                <div className="space-y-3">
                  <TranslationConnection settings={settings} onChange={setSettings} />
                </div>
              )}

              <button onClick={handleImageComplete} disabled={configMode === 'general' ? !hasProviderConnection(settings.generalAI) : !hasProviderConnection(settings)} className="workspace-primary w-full justify-center">Start translating</button>
              <button onClick={handleTranslationNext} disabled={configMode === 'general' ? !(hasProviderConnection(settings.generalAI)) : !(hasProviderConnection(settings))} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-500 text-white font-semibold rounded-xl cute-shadow hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-pop">
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
                    onValueChange={(value: 'web-speech' | 'openai-compatible' | 'local') =>
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
                      <SelectItem value="openai-compatible">Compatible transcription API</SelectItem>
                      <SelectItem value="local">Local Model (sherpa-onnx)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {settings.speechRecognition.provider === 'openai-compatible' && (
                  <>
<div className="space-y-1.5">
                        <label htmlFor="speechEndpoint" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Speech endpoint</label>
                        <input id="speechEndpoint" value={settings.speechRecognition.endpoint || ''} onChange={(e) => setSettings({ ...settings, speechRecognition: { ...settings.speechRecognition, endpoint: e.target.value } })} placeholder="https://api.example.com/v1" className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">OpenAI-compatible audio/transcriptions API, including local servers.</p>
                      </div>
                    <div className="space-y-2">
                      <label htmlFor="setup-speech-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model</label>
                      <input
                        id="setup-speech-model" type="text"
                        value={settings.speechRecognition.modelName || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            speechRecognition: { ...settings.speechRecognition, modelName: e.target.value },
                          })
                        }
                        placeholder="Transcription model ID"
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="setup-speech-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300">API key</label>
                      <input
                        id="setup-speech-key" type="password"
                        value={settings.speechRecognition.apiKey || ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            speechRecognition: { ...settings.speechRecognition, apiKey: e.target.value },
                          })
                        }
                        placeholder="Optional for local servers"
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">Optional for local servers. A saved key is reused only for the same endpoint.</p>
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

                {(settings.speechRecognition.provider === 'openai-compatible' || settings.speechRecognition.provider === 'local') && (
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
                <OCRSettings settings={settings} onChange={setSettings} />

                {/* VLM Section */}
                <div className="space-y-3 pt-5 border-t-2 border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
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

                      </button>
                    </div>
                  </div>

                  {!settings.vlm.useGeneralAI && !settings.vlm.useCustom && (
                    <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-800 dark:bg-indigo-900/20">
                      <div className="text-sm font-semibold text-gray-800 dark:text-white">OCR settings used by VLM</div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {['local-ppocr', 'jina'].includes(settings.imageOCR.provider)
                          ? 'Choose General AI or Custom for direct image translation.'
                          : 'Uses your OCR vision connection.'}
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

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setImportMode('import-file')} className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200 min-h-[100px] flex flex-col items-center justify-center btn-pop">
                      <Upload className="w-6 h-6 mb-2 text-indigo-500" />
                      <div className="text-sm font-bold text-gray-800 dark:text-white">File</div>

                    </button>
                    <button onClick={() => setImportMode('import-qr')} className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200 min-h-[100px] flex flex-col items-center justify-center btn-pop">
                      <Scan className="w-6 h-6 mb-2 text-indigo-500" />
                      <div className="text-sm font-bold text-gray-800 dark:text-white">Scan QR</div>

                    </button>
                  </div>

                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs text-indigo-800 dark:text-indigo-200">
                      Use the password chosen during export.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <button onClick={() => { void stopQRScanner(); setImportMode(null); }} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
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

                  {importMode === 'import-qr' && <div id="qr-reader-wizard" className="overflow-hidden rounded-xl" />}
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
