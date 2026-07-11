import React, { useState, lazy, Suspense } from 'react';
import { X, Save, Settings as SettingsIcon, Sparkles, Mic, Image as ImageIcon, ArrowLeftRight, Languages, CheckCircle, AlertCircle, CircleHelp } from 'lucide-react';
import { AISettings, saveSettings, loadSettings, DEFAULT_SETTINGS, DASHSCOPE_OCR_ENDPOINT, DASHSCOPE_OCR_INTL_ENDPOINT, API_FORMAT_OPTIONS, type APIFormat, type LocalAsrEngine, type LocalVadMode, type SenseVoiceLanguage, type WhisperTask } from '../utils/config/settings';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/Tabs';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { checkSherpaModelDirectory, getSherpaModelInfo } from '../utils/audio/sherpaOnnxRuntime';
import { toast } from './ui/use-toast';
import { useBackdropClose } from '../hooks/useBackdropClose';

// Lazy load ImportExportDialog - only loaded when user opens it
const ImportExportDialog = lazy(() => import('./ImportExportDialog').then(module => ({ default: module.ImportExportDialog })));

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AISettings) => void;
  initialTab?: 'general' | 'translation' | 'speech' | 'image';
}

const SETTINGS_HELP: Record<'general' | 'translation' | 'speech' | 'image', { title: string; body: string }> = {
  general: {
    title: 'General AI',
    body: 'General AI powers explanations, Quick Q&A, and features configured to reuse the main provider. Match the API format to your endpoint, then enter the provider model name and API key. The default model is gpt-5.6-terra.',
  },
  translation: {
    title: 'Translation',
    body: 'Use General AI for the simplest setup. Configure a separate translation service only for a specialized model or provider. Structured output improves parsing; models such as Hunyuan-MT require plain output.',
  },
  speech: {
    title: 'Speech',
    body: 'Browser speech uses the browser recognition service. Cloud speech uploads recordings to your configured transcription endpoint. Local Whisper and SenseVoice models run in the browser runtime and may require a substantial first download.',
  },
  image: {
    title: 'Images',
    body: 'OCR extracts text and coordinates before translation. Local uses PP-OCR v5. Cloud OCR currently supports Alibaba Cloud Model Studio Qwen-OCR only, using the native advanced_recognition response for accurate overlay coordinates. A normal OpenAI-compatible VLM endpoint is not an adapted OCR API.',
  },
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, onSave, initialTab = 'general' }) => {
  const [settings, setSettings] = useState<AISettings>(() => {
    const loaded = loadSettings() || DEFAULT_SETTINGS;
    // Ensure generalAI exists for backward compatibility
    if (!loaded.generalAI) {
      loaded.generalAI = DEFAULT_SETTINGS.generalAI;
    }
    if (!loaded.vlm) {
      loaded.vlm = DEFAULT_SETTINGS.vlm;
    }
    if (!loaded.translation) {
      loaded.translation = DEFAULT_SETTINGS.translation;
    }
    return loaded;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);

  const [isCheckingLocalModel, setIsCheckingLocalModel] = useState(false);
  const [localModelStatus, setLocalModelStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const backdropCloseHandlers = useBackdropClose<HTMLDivElement>({ onClose });

  // Reload settings when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      const loaded = loadSettings() || DEFAULT_SETTINGS;
      // Ensure generalAI exists for backward compatibility
      if (!loaded.generalAI) {
        loaded.generalAI = DEFAULT_SETTINGS.generalAI;
      }
      if (!loaded.vlm) {
        loaded.vlm = DEFAULT_SETTINGS.vlm;
      }
      if (!loaded.translation) {
        loaded.translation = DEFAULT_SETTINGS.translation;
      }
      setSettings(loaded);
      setActiveTab(initialTab);
      setShowSettingsHelp(false);
    }
  }, [isOpen, initialTab]);

  const handleSave = () => {
    setIsSaving(true);
    saveSettings(settings);
    onSave(settings);

    setTimeout(() => {
      setIsSaving(false);
      // Don't call onClose here, parent handles closing after save
    }, 300);
  };

  const handleImport = (importedSettings: AISettings) => {
    setSettings(importedSettings);
    saveSettings(importedSettings);
    onSave(importedSettings);
  };

  const handleCheckLocalModel = async () => {
    try {
      setIsCheckingLocalModel(true);
      setLocalModelStatus(null);
      await checkSherpaModelDirectory(settings);
      setLocalModelStatus({ ok: true, message: 'Model directory looks ready.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check model directory.';
      setLocalModelStatus({ ok: false, message });
      toast({
        title: 'Model Check Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsCheckingLocalModel(false);
    }
  };

  if (!isOpen) return null;

  const localModelInfo = getSherpaModelInfo(settings);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropCloseHandlers}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-xl cute-shadow">
              <SettingsIcon className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-base sm:text-xl font-bold text-gray-800 dark:text-white">
              Settings
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettingsHelp(true)}
              className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-all duration-200 btn-pop"
              title={`About ${SETTINGS_HELP[activeTab].title}`}
              aria-label={`About ${SETTINGS_HELP[activeTab].title}`}
            >
              <CircleHelp className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowImportExport(true)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-all duration-200 btn-pop"
              title="Import/Export Settings"
            >
              <ArrowLeftRight className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-all duration-200 btn-pop"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'general' | 'translation' | 'speech' | 'image')}>
            <TabsList className="w-full grid grid-cols-4 mb-6">
              <TabsTrigger value="general" className="flex flex-col items-center gap-1 px-2 py-2">
                <SettingsIcon className="w-4 h-4" />
                <span className="text-xs sm:text-sm">General</span>
              </TabsTrigger>
              <TabsTrigger value="translation" className="flex flex-col items-center gap-1 px-2 py-2">
                <Languages className="w-4 h-4" />
                <span className="text-xs sm:text-sm">Translate</span>
              </TabsTrigger>
              <TabsTrigger value="speech" className="flex flex-col items-center gap-1 px-2 py-2">
                <Mic className="w-4 h-4" />
                <span className="text-xs sm:text-sm">Speech</span>
              </TabsTrigger>
              <TabsTrigger value="image" className="flex flex-col items-center gap-1 px-2 py-2">
                <ImageIcon className="w-4 h-4" />
                <span className="text-xs sm:text-sm">Image</span>
              </TabsTrigger>
            </TabsList>

            {/* General AI Service Tab */}
            <TabsContent value="general">
              <div className="space-y-4">
                {/* API Format */}
                <div className="space-y-1.5">
                  <label htmlFor="generalApiFormat" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    API Format
                  </label>
                  <Select
                    value={settings.generalAI.apiFormat || DEFAULT_SETTINGS.generalAI.apiFormat}
                    onValueChange={(value) => setSettings({
                      ...settings,
                      generalAI: {
                        ...settings.generalAI,
                        apiFormat: value as APIFormat,
                      },
                    })}
                  >
                    <SelectTrigger id="generalApiFormat">
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

                {/* API Endpoint */}
                <div className="space-y-1.5">
                  <label htmlFor="generalEndpoint" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    API Endpoint
                  </label>
                  <input
                    id="generalEndpoint"
                    type="text"
                    value={settings.generalAI.endpoint}
                    onChange={(e) => setSettings({ ...settings, generalAI: { ...settings.generalAI, endpoint: e.target.value } })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Model Name */}
                <div className="space-y-1.5">
                  <label htmlFor="generalModel" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Model Name
                  </label>
                  <input
                    id="generalModel"
                    type="text"
                    value={settings.generalAI.modelName}
                    onChange={(e) => setSettings({ ...settings, generalAI: { ...settings.generalAI, modelName: e.target.value } })}
                    placeholder="gpt-5.6-terra"
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <label htmlFor="generalApiKey" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    API Key
                  </label>
                  <input
                    id="generalApiKey"
                    type="password"
                    value={settings.generalAI.apiKey}
                    onChange={(e) => setSettings({ ...settings, generalAI: { ...settings.generalAI, apiKey: e.target.value } })}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Info Box */}
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <p className="text-sm text-indigo-800 dark:text-indigo-200">
                    <strong>Note:</strong> Your API key is stored locally and never sent to our servers.
                    It's only used for direct communication with your chosen AI provider.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Translation Tab */}
            <TabsContent value="translation">
              <div className="space-y-4">
                {/* Endpoint URL */}
                <div className="space-y-1.5">
                  <label htmlFor="endpoint" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    API Endpoint
                  </label>
                  <input
                    id="endpoint"
                    type="text"
                    value={settings.endpoint}
                    onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })}
                    placeholder="https://api.example.com/v1"
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Model Name */}
                <div className="space-y-1.5">
                  <label htmlFor="model" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Model Name
                  </label>
                  <input
                    id="model"
                    type="text"
                    value={settings.modelName}
                    onChange={(e) => setSettings({ ...settings, modelName: e.target.value })}
                    placeholder="gpt-5"
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <label htmlFor="apiKey" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    API Key
                  </label>
                  <input
                    id="apiKey"
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Output Mode Selection */}
                {(() => {
                  // Check if user is using general AI or a non-hunyuan-mt model
                  const useTranslationService = !!(settings.apiKey && settings.endpoint && settings.modelName);
                  const modelName = useTranslationService ? settings.modelName : settings.generalAI.modelName;
                  const isHunyuanMT = modelName.toLowerCase().includes('hunyuan-mt');
                  const canChooseOutputMode = !isHunyuanMT;

                  return (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Output Mode
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            if (canChooseOutputMode) {
                              setSettings({ ...settings, translation: { ...settings.translation, outputMode: 'plain' } });
                            }
                          }}
                          disabled={!canChooseOutputMode}
                          className={`p-3 rounded-xl border-2 transition-all duration-200 ${
                            settings.translation?.outputMode === 'plain'
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow'
                              : canChooseOutputMode
                              ? 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              : 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="text-sm font-bold text-gray-800 dark:text-white">Plain Text</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Direct output</div>
                        </button>
                        <button
                          onClick={() => {
                            if (canChooseOutputMode) {
                              setSettings({ ...settings, translation: { ...settings.translation, outputMode: 'structured' } });
                            }
                          }}
                          disabled={!canChooseOutputMode}
                          className={`p-3 rounded-xl border-2 transition-all duration-200 ${
                            settings.translation?.outputMode === 'structured'
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow'
                              : canChooseOutputMode
                              ? 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              : 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="text-sm font-bold text-gray-800 dark:text-white">Structured</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">JSON output</div>
                        </button>
                      </div>
                      {isHunyuanMT && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          Hunyuan-MT only supports plain text mode. Output mode is automatically set to plain.
                        </p>
                      )}
                      {!isHunyuanMT && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <strong>Plain:</strong> Direct text output, more reliable for models with weak instruction following.
                          <br />
                          <strong>Structured:</strong> JSON output with better parsing, recommended for advanced models.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Info Box */}
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <p className="text-sm text-indigo-800 dark:text-indigo-200">
                    <strong>Note:</strong> Your API key is stored locally and never sent to our servers.
                    It's only used for direct communication with your chosen AI provider.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Speech Tab */}
            <TabsContent value="speech">
              <div className="space-y-4">
                {/* Speech Recognition Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Mic className="w-4 h-4" />
                    Speech Recognition
                  </h3>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Provider
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSettings({ ...settings, speechRecognition: { ...settings.speechRecognition, provider: 'web-speech' } })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.speechRecognition.provider === 'web-speech' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Web Speech</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Browser API</div>
                      </button>
                      <button
                        onClick={() => setSettings({
                          ...settings,
                          speechRecognition: {
                            ...settings.speechRecognition,
                            provider: 'siliconflow',
                            apiKey: settings.apiKey
                          }
                        })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.speechRecognition.provider === 'siliconflow' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">AI Service</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cloud-based</div>
                      </button>
                      <button
                        onClick={() => setSettings({
                          ...settings,
                          speechRecognition: {
                            ...settings.speechRecognition,
                            provider: 'local',
                            localEngine: settings.speechRecognition.localEngine || 'whisper',
                            vadMode: settings.speechRecognition.vadMode || 'silero'
                          }
                        })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.speechRecognition.provider === 'local' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Local Model</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Offline</div>
                      </button>
                    </div>
                  </div>

                  {settings.speechRecognition.provider === 'siliconflow' && (
                    <>
                      <div className="space-y-1.5">
                        <label htmlFor="aiServiceProvider" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          AI Service Provider
                        </label>
                        <Select value="siliconflow" disabled>
                          <SelectTrigger>
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="siliconflow">SiliconFlow</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="speechModelName" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Model Name
                        </label>
                        <input
                          id="speechModelName"
                          type="text"
                          value={settings.speechRecognition.modelName || 'TeleAI/TeleSpeechASR'}
                          onChange={(e) => setSettings({
                            ...settings,
                            speechRecognition: {
                              ...settings.speechRecognition,
                              modelName: e.target.value
                            }
                          })}
                          placeholder="TeleAI/TeleSpeechASR"
                          className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                      <label htmlFor="speechApiKey" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                        API Key
                      </label>
                      <input
                        id="speechApiKey"
                        type="password"
                        value={settings.speechRecognition.apiKey || ''}
                        onChange={(e) => setSettings({
                          ...settings,
                          speechRecognition: {
                            ...settings.speechRecognition,
                            apiKey: e.target.value
                          }
                        })}
                        placeholder={settings.apiKey ? 'Using Translation API Key' : 'sk-...'}
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Leave empty to use the same API key as translation service
                      </p>
                    </div>
                    </>
                  )}

                  {settings.speechRecognition.provider === 'local' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Local Engine
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['whisper', 'sensevoice'] as LocalAsrEngine[]).map((engine) => (
                            <button
                              key={engine}
                              onClick={() => {
                                setLocalModelStatus(null);
                                setSettings({
                                  ...settings,
                                  speechRecognition: {
                                    ...settings.speechRecognition,
                                    localEngine: engine,
                                  },
                                });
                              }}
                              className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.speechRecognition.localEngine === engine ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                            >
                              <div className="text-sm font-bold text-gray-800 dark:text-white">{engine === 'whisper' ? 'Whisper' : 'SenseVoice'}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{engine === 'whisper' ? 'General ASR' : 'ZH/EN/JA/KO/YUE'}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="localModelPath" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Model Directory URL
                        </label>
                        <input
                          id="localModelPath"
                          type="text"
                          value={settings.speechRecognition.localModelPath || ''}
                          onChange={(e) => {
                            setLocalModelStatus(null);
                            setSettings({
                              ...settings,
                              speechRecognition: {
                                ...settings.speechRecognition,
                                localModelPath: e.target.value,
                              },
                            });
                          }}
                          placeholder="https://example.com/models/sherpa-whisper-base"
                          className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {localModelInfo.description}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="localAssetBaseUrl" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Runtime Assets URL
                        </label>
                        <input
                          id="localAssetBaseUrl"
                          type="text"
                          value={settings.speechRecognition.localAssetBaseUrl || ''}
                          onChange={(e) => {
                            setLocalModelStatus(null);
                            setSettings({
                              ...settings,
                              speechRecognition: {
                                ...settings.speechRecognition,
                                localAssetBaseUrl: e.target.value,
                              },
                            });
                          }}
                          placeholder="Leave empty to use the model directory"
                          className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Optional separate folder for sherpa-onnx .js/.wasm/.data runtime files.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          VAD Mode
                        </label>
                        <Select
                          value={settings.speechRecognition.vadMode || 'silero'}
                          onValueChange={(value: LocalVadMode) => setSettings({
                            ...settings,
                            speechRecognition: {
                              ...settings.speechRecognition,
                              vadMode: value,
                            },
                          })}
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

                      {settings.speechRecognition.localEngine === 'whisper' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <label htmlFor="whisperLanguage" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                              Language
                            </label>
                            <input
                              id="whisperLanguage"
                              type="text"
                              value={settings.speechRecognition.whisperLanguage || 'auto'}
                              onChange={(e) => setSettings({
                                ...settings,
                                speechRecognition: {
                                  ...settings.speechRecognition,
                                  whisperLanguage: e.target.value,
                                },
                              })}
                              className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                              Task
                            </label>
                            <Select
                              value={settings.speechRecognition.whisperTask || 'transcribe'}
                              onValueChange={(value: WhisperTask) => setSettings({
                                ...settings,
                                speechRecognition: {
                                  ...settings.speechRecognition,
                                  whisperTask: value,
                                },
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="transcribe">Transcribe</SelectItem>
                                <SelectItem value="translate">Translate</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {settings.speechRecognition.localEngine === 'sensevoice' && (
                        <div className="space-y-1.5">
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                            SenseVoice Language
                          </label>
                          <div className="flex gap-2">
                            <Select
                              value={settings.speechRecognition.senseVoiceLanguage || 'auto'}
                              onValueChange={(value: SenseVoiceLanguage) => setSettings({
                                ...settings,
                                speechRecognition: {
                                  ...settings.speechRecognition,
                                  senseVoiceLanguage: value,
                                },
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">Auto</SelectItem>
                                <SelectItem value="zh">Chinese</SelectItem>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="ja">Japanese</SelectItem>
                                <SelectItem value="ko">Korean</SelectItem>
                                <SelectItem value="yue">Cantonese</SelectItem>
                              </SelectContent>
                            </Select>
                            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={settings.speechRecognition.senseVoiceUseItn !== false}
                                onChange={(e) => setSettings({
                                  ...settings,
                                  speechRecognition: {
                                    ...settings.speechRecognition,
                                    senseVoiceUseItn: e.target.checked,
                                  },
                                })}
                              />
                              ITN
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <button
                          onClick={handleCheckLocalModel}
                          disabled={isCheckingLocalModel || !settings.speechRecognition.localModelPath?.trim()}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white font-semibold rounded-xl cute-shadow hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-pop"
                        >
                          {isCheckingLocalModel ? 'Checking...' : `Check ${localModelInfo.label} Model`}
                        </button>
                        {localModelStatus && (
                          <div className={`flex items-start gap-2 p-3 rounded-xl border ${localModelStatus.ok ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'}`}>
                            {localModelStatus.ok ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />}
                            <p className={`text-xs ${localModelStatus.ok ? 'text-green-700 dark:text-green-200' : 'text-red-700 dark:text-red-200'}`}>{localModelStatus.message}</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Realtime Transcription Toggle */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label htmlFor="realtimeTranscription" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Enable Realtime Transcription
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Transcribe audio in real-time using VAD (Voice Activity Detection)
                        </p>
                      </div>
                      <Switch
                        id="realtimeTranscription"
                        checked={settings.speechRecognition.enableRealtimeTranscription ?? true}
                        onCheckedChange={(checked: boolean) => setSettings({
                          ...settings,
                          speechRecognition: {
                            ...settings.speechRecognition,
                            enableRealtimeTranscription: checked
                          }
                        })}
                      />
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <p className="text-sm text-indigo-800 dark:text-indigo-200">
                    <strong>Web Speech:</strong> Uses your browser's built-in speech recognition (free, works offline).
                    <br />
                    <strong>AI Service:</strong> Cloud-based AI providers (SiliconFlow) with better accuracy for multiple languages.
                    <br />
                    <strong>Local Model:</strong> Runs sherpa-onnx Whisper or SenseVoice from a configured model directory URL.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Image Tab */}
            <TabsContent value="image">
              <div className="space-y-4">
                {/* OCR Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    OCR Recognition
                  </h3>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      OCR Provider
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setSettings({
                          ...settings,
                          imageOCR: {
                            ...settings.imageOCR,
                            provider: 'local-ppocr',
                            useGeneralAI: false,
                          }
                        })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.imageOCR.provider === 'local-ppocr' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Local</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">PP-OCRv5</div>
                      </button>
                      <button
                        onClick={() => setSettings({
                          ...settings,
                          imageOCR: {
                            ...settings.imageOCR,
                            provider: 'qwen',
                            useGeneralAI: false,
                            endpoint: settings.imageOCR.endpoint.includes('aliyuncs.com') ? settings.imageOCR.endpoint : DASHSCOPE_OCR_ENDPOINT,
                            modelName: settings.imageOCR.modelName || 'qwen3.5-ocr',
                          }
                        })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.imageOCR.provider !== 'local-ppocr' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Alibaba Qwen-OCR</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Model Studio API</div>
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Cloud OCR accepts an Alibaba Cloud Model Studio / DashScope API key and native OCR endpoint. Other OCR providers are not adapted yet.</p>
                    {(settings.imageOCR.provider === 'custom' || settings.imageOCR.useGeneralAI) && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">This imported legacy OCR configuration is not an adapted coordinate API. Select Local or Alibaba Qwen-OCR before using OCR.</p>
                    )}
                  </div>
                </div>

                {/* Region Selection for Qwen */}
                {settings.imageOCR.provider !== 'local-ppocr' && (
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Region
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSettings({ ...settings, imageOCR: { ...settings.imageOCR, provider: 'qwen', useGeneralAI: false, endpoint: DASHSCOPE_OCR_ENDPOINT } })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.imageOCR.endpoint === DASHSCOPE_OCR_ENDPOINT ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Beijing</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">China Mainland</div>
                      </button>
                      <button
                        onClick={() => setSettings({ ...settings, imageOCR: { ...settings.imageOCR, provider: 'qwen', useGeneralAI: false, endpoint: DASHSCOPE_OCR_INTL_ENDPOINT } })}
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
                    <div className="space-y-1.5">
                      <label htmlFor="ocrEndpoint" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Alibaba OCR Endpoint
                      </label>
                      <input
                        id="ocrEndpoint"
                        type="text"
                        value={settings.imageOCR.endpoint}
                        onChange={(e) => setSettings({ ...settings, imageOCR: { ...settings.imageOCR, provider: 'qwen', useGeneralAI: false, endpoint: e.target.value } })}
                        placeholder={DASHSCOPE_OCR_INTL_ENDPOINT}
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Qwen OCR Model</label>
                      <Select value={settings.imageOCR.modelName || 'qwen3.5-ocr'} onValueChange={(modelName) => setSettings({ ...settings, imageOCR: { ...settings.imageOCR, provider: 'qwen', modelName } })}>
                        <SelectTrigger aria-label="Qwen OCR model"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qwen3.5-ocr">qwen3.5-ocr (Recommended)</SelectItem>
                          <SelectItem value="qwen-vl-ocr-latest">qwen-vl-ocr-latest (Compatibility)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 dark:text-gray-400">advanced_recognition returns line text, four-point absolute coordinates, and rotation data for translated overlays.</p>
                    </div>
                  </>
                )}

                {/* API Key */}
                {settings.imageOCR.provider !== 'local-ppocr' && (
                  <div className="space-y-1.5">
                    <label htmlFor="imageApiKey" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Alibaba Model Studio API Key
                    </label>
                    <input
                      id="imageApiKey"
                      type="password"
                      value={settings.imageOCR.apiKey}
                      onChange={(e) => setSettings({ ...settings, imageOCR: { ...settings.imageOCR, apiKey: e.target.value } })}
                      placeholder="sk-..."
                      className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                    />
                  </div>
                )}

                {/* VLM Section */}
                <div className="space-y-3 pt-3 border-t-2 border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    VLM Direct Translation
                  </h3>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      VLM Settings
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setSettings({ ...settings, vlm: { ...settings.vlm, useGeneralAI: true, useCustom: false } })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.vlm.useGeneralAI ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">General AI</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Use General</div>
                      </button>
                      <button
                        onClick={() => setSettings({ ...settings, vlm: { ...settings.vlm, useGeneralAI: false, useCustom: false } })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${!settings.vlm.useGeneralAI && !settings.vlm.useCustom ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Use OCR</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Same as OCR</div>
                      </button>
                      <button
                        onClick={() => setSettings({ ...settings, vlm: { ...settings.vlm, useGeneralAI: false, useCustom: true } })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${!settings.vlm.useGeneralAI && settings.vlm.useCustom ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Custom</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Custom VLM</div>
                      </button>
                    </div>
                  </div>

                  {!settings.vlm.useGeneralAI && !settings.vlm.useCustom && (
                    <div className="space-y-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-900/20 p-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-800 dark:text-white">OCR settings used by VLM</div>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Alibaba credentials and region are shared with OCR above. Direct translation uses qwen-vl-max-latest; the OCR model remains dedicated to coordinate extraction.</p>
                      </div>
                      <Select
                        value={settings.imageOCR.provider === 'local-ppocr' ? 'local-ppocr' : 'qwen'}
                        onValueChange={(provider) => setSettings({
                          ...settings,
                          imageOCR: {
                            ...settings.imageOCR,
                            provider: provider as 'local-ppocr' | 'qwen',
                            useGeneralAI: false,
                            localModel: provider === 'local-ppocr' ? 'ppocr-v5-mobile' : settings.imageOCR.localModel,
                            endpoint: provider === 'qwen' && !settings.imageOCR.endpoint.includes('aliyuncs.com') ? DASHSCOPE_OCR_ENDPOINT : settings.imageOCR.endpoint,
                          },
                        })}
                      >
                        <SelectTrigger aria-label="VLM OCR provider">
                          <SelectValue placeholder="Select OCR provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local-ppocr">Local PP-OCR v5</SelectItem>
                          <SelectItem value="qwen">Alibaba Qwen-OCR</SelectItem>
                        </SelectContent>
                      </Select>
                      {settings.imageOCR.provider === 'local-ppocr' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Local PP-OCR is an OCR pipeline, not a VLM. In OCR overlay mode it extracts local coordinates before line-by-line translation; choose General AI or Custom for direct VLM translation.</p>
                      )}
                      {settings.imageOCR.provider !== 'local-ppocr' && (
                        <>
                          <input
                            type="text"
                            aria-label="VLM OCR endpoint"
                            value={settings.imageOCR.endpoint}
                            onChange={(event) => setSettings({ ...settings, imageOCR: { ...settings.imageOCR, endpoint: event.target.value } })}
                            placeholder={DASHSCOPE_OCR_INTL_ENDPOINT}
                            className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                          />
                          <Select value={settings.imageOCR.modelName || 'qwen3.5-ocr'} onValueChange={(modelName) => setSettings({ ...settings, imageOCR: { ...settings.imageOCR, provider: 'qwen', modelName } })}>
                            <SelectTrigger aria-label="VLM OCR model"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="qwen3.5-ocr">qwen3.5-ocr (Recommended)</SelectItem>
                              <SelectItem value="qwen-vl-ocr-latest">qwen-vl-ocr-latest (Compatibility)</SelectItem>
                            </SelectContent>
                          </Select>
                          <input
                            type="password"
                            aria-label="VLM OCR API key"
                            value={settings.imageOCR.apiKey}
                            onChange={(event) => setSettings({ ...settings, imageOCR: { ...settings.imageOCR, apiKey: event.target.value } })}
                            placeholder="OCR API key"
                            className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                          />
                        </>
                      )}
                    </div>
                  )}

                  {!settings.vlm.useGeneralAI && settings.vlm.useCustom && (
                    <>
                      <div className="space-y-1.5">
                        <label htmlFor="vlmEndpoint" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          VLM API Endpoint
                        </label>
                        <input
                          id="vlmEndpoint"
                          type="text"
                          value={settings.vlm.endpoint || ''}
                          onChange={(e) => setSettings({ ...settings, vlm: { ...settings.vlm, endpoint: e.target.value } })}
                          placeholder="https://api.example.com/v1"
                          className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="vlmModel" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          VLM Model Name
                        </label>
                        <input
                          id="vlmModel"
                          type="text"
                          value={settings.vlm.modelName || ''}
                          onChange={(e) => setSettings({ ...settings, vlm: { ...settings.vlm, modelName: e.target.value } })}
                          placeholder="gpt-4o"
                          className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="vlmApiKey" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          VLM API Key
                        </label>
                        <input
                          id="vlmApiKey"
                          type="password"
                          value={settings.vlm.apiKey || ''}
                          onChange={(e) => setSettings({ ...settings, vlm: { ...settings.vlm, apiKey: e.target.value } })}
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
                        <label htmlFor="thinkingMode" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Enable Thinking Mode
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Show model's reasoning process in VLM translations
                        </p>
                      </div>
                      <Switch
                        id="thinkingMode"
                        checked={settings.vlm.enableThinking}
                        onCheckedChange={(checked: boolean) => setSettings({ ...settings, vlm: { ...settings.vlm, enableThinking: checked } })}
                      />
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800">
                  <p className="text-sm text-indigo-800 dark:text-indigo-200">
                    <strong>OCR Mode:</strong> Recognizes text regions and overlays translations on image.
                    <br />
                    <strong>Local:</strong> Runs PP-OCRv5 in your browser. Models are downloaded on first use.
                    <br />
                    <strong>VLM Mode:</strong> Directly translates image content using vision models (text output only).
                    <br />
                    <strong>Tip:</strong> VLM defaults to General AI service. Configure it in the General tab.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 bg-indigo-500 text-white text-sm sm:text-base font-semibold rounded-xl cute-shadow hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Import/Export Dialog - Lazy Loaded */}
      <Suspense fallback={null}>
        <ImportExportDialog
          isOpen={showImportExport}
          onClose={() => setShowImportExport(false)}
          currentSettings={settings}
          onImport={handleImport}
        />
      </Suspense>

      {showSettingsHelp && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/45"
          onClick={() => setShowSettingsHelp(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-help-title"
            className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="settings-help-title" className="text-base font-bold text-gray-900 dark:text-white">
                  {SETTINGS_HELP[activeTab].title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {SETTINGS_HELP[activeTab].body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsHelp(false)}
                className="shrink-0 p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg"
                aria-label="Close settings help"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
