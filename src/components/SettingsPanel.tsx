import { TranslationConnection } from './TranslationConnection';
import { hasTranslationOverride } from '../../packages/tabitomo-core/src/translationConnection';
import { clearTranslationOverride } from '../../packages/tabitomo-core/src/providerPresets';
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../../packages/tabitomo-core/src/settingsNavigation';
import { OCRSettings } from './OCRSettings';
import { AIConnection } from './AIConnection';
import React, { useState, lazy, Suspense } from 'react';
import { X, Settings as SettingsIcon, Mic, Image as ImageIcon, ArrowLeftRight, Languages, CheckCircle, AlertCircle, CircleHelp } from 'lucide-react';
import { AISettings, saveSettings, loadSettings, DEFAULT_SETTINGS, type LocalAsrEngine, type LocalVadMode, type SenseVoiceLanguage, type WhisperTask } from '../utils/config/settings';
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

type WebSettingsSection = Exclude<SettingsSectionId, 'offline'>;
const SETTINGS_ICONS = { general: SettingsIcon, translation: Languages, speech: Mic, image: ImageIcon, config: ArrowLeftRight };
const WEB_SETTINGS_SECTIONS = SETTINGS_SECTIONS.filter((section): section is typeof SETTINGS_SECTIONS[number] & { id: WebSettingsSection } => section.id !== 'offline');

const SETTINGS_HELP: Record<WebSettingsSection, { title: string; body: string }> = {
  general: {
    title: 'General AI',
    body: 'General AI powers explanations, Quick Q&A, and features configured to reuse the main provider. Enter your provider API key and choose a model. Compatible API formats are detected automatically. Photo translation needs an image-capable model. Keys stay in this browser and are sent only to your provider. Create an OpenRouter API key in your own account.',
  },
  translation: {
    title: 'Translation',
    body: 'Use General AI or connect a separate translation model with its endpoint, API key and model ID. Load the provider catalog or enter an ID manually. Plain text works with specialized translation models, including Hy-MT2; structured output is available under More options. Keys are sent only to the selected provider.',
  },
  speech: {
    title: 'Speech',
    body: 'Browser speech uses the browser recognition service. Cloud speech uploads recordings to your configured transcription endpoint. Local Whisper and SenseVoice models run in the browser runtime and may require a substantial first download.',
  },
  config: { title: 'Import / Export', body: 'Transfer settings as a password-encrypted file or QR code. Exports include your API keys. Keep the file and password safe.' },
  image: {
    title: 'Images',
    body: 'Local and Qwen OCR support image overlays. Local models download on first use and run on this device. Jina OCR, General AI and custom vision return text. VLM translates a photo directly using an image-capable model. Show thinking displays the model reasoning when available.',
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
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);
  const [activeTab, setActiveTab] = useState<WebSettingsSection>(initialTab);
  const [wideLayout, setWideLayout] = useState(() => window.matchMedia('(min-width: 700px)').matches);
  const [saveError, setSaveError] = useState<string | null>(null);
  React.useEffect(() => {
    const query = window.matchMedia('(min-width: 700px)');
    const update = () => setWideLayout(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

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
      setSaveError(null);
    }
  }, [isOpen, initialTab]);

  const handleSave = () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      saveSettings(settings);
      onSave(settings);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save settings. Try again.');
    } finally {
      setIsSaving(false);
    }
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
      className="safe-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      {...backdropCloseHandlers}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="settings-title"
        className="settings-dialog relative w-full rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="workspace-icon"><X size={20} /></button>
        </div>

        <Tabs className="settings-layout" value={activeTab} onValueChange={(value) => { setActiveTab(value as WebSettingsSection); setShowSettingsHelp(false); }}>
          <TabsList className="settings-navigation" orientation={wideLayout ? 'vertical' : 'horizontal'} aria-label="Settings sections">
            {WEB_SETTINGS_SECTIONS.map(({ id, label }) => {
              const Icon = SETTINGS_ICONS[id];
              return <TabsTrigger key={id} value={id} className="settings-tab"><Icon size={18} aria-hidden="true" /><span>{label}</span></TabsTrigger>;
            })}
          </TabsList>
          <div key={activeTab} className="settings-dialog-content custom-scrollbar">
            <div className="settings-panel-heading">
              <h3>{SETTINGS_HELP[activeTab].title}</h3>
              <button type="button" className="workspace-icon" aria-label={`About ${SETTINGS_HELP[activeTab].title}`} onClick={() => setShowSettingsHelp(true)}><CircleHelp size={18} /></button>
            </div>

            {/* General AI Service Tab */}
            <TabsContent value="general">
              <div className="space-y-4">
                <AIConnection value={settings.generalAI} onChange={(generalAI) => setSettings({ ...settings, generalAI })}>

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
                      placeholder="Model ID"
                      className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                    />
                  </div>
                </AIConnection>
              </div>
            </TabsContent>

            {/* Translation Tab */}
            <TabsContent value="translation">
              <div className="space-y-4">
                <div className="settings-choice-grid" role="group" aria-label="Translation service">
                  <button type="button" aria-pressed={!hasTranslationOverride(settings)} onClick={() => setSettings(clearTranslationOverride(settings))}>General AI</button>
                  <button type="button" aria-pressed={hasTranslationOverride(settings)} onClick={() => setSettings({ ...settings, provider: 'custom' })}>Separate model</button>
                </div>
                {hasTranslationOverride(settings) && <TranslationConnection settings={settings} onChange={setSettings} />}
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

                      </button>
                      <button
                        onClick={() => setSettings({
                          ...settings,
                          speechRecognition: {
                            ...settings.speechRecognition,
                            provider: 'openai-compatible'
                          }
                        })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${settings.speechRecognition.provider === 'openai-compatible' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">AI Service</div>

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

                      </button>
                    </div>
                  </div>

                  {settings.speechRecognition.provider === 'openai-compatible' && (
                    <>
<div className="space-y-1.5">
                        <label htmlFor="speechEndpoint" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Speech endpoint</label>
                        <input id="speechEndpoint" value={settings.speechRecognition.endpoint || ''} onChange={(e) => setSettings({ ...settings, speechRecognition: { ...settings.speechRecognition, endpoint: e.target.value } })} placeholder="https://api.example.com/v1" className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">OpenAI-compatible audio/transcriptions API, including local servers.</p>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="speechModelName" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Model Name
                        </label>
                        <input
                          id="speechModelName"
                          type="text"
                          value={settings.speechRecognition.modelName || ''}
                          onChange={(e) => setSettings({
                            ...settings,
                            speechRecognition: {
                              ...settings.speechRecognition,
                              modelName: e.target.value
                            }
                          })}
                          placeholder="Transcription model ID"
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
                        placeholder="Optional for local servers"
                        className="w-full px-3 py-2 text-sm rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none transition-colors"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Optional for local servers. A saved key is reused only for the same endpoint.
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

</div>
            </TabsContent>

            {/* Image Tab */}
            <TabsContent value="image">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Image OCR</h3>
                <OCRSettings settings={settings} onChange={setSettings} />

                {/* VLM Section */}
                <div className="space-y-3 pt-3 border-t-2 border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
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

                      </button>
                      <button
                        onClick={() => setSettings({ ...settings, vlm: { ...settings.vlm, useGeneralAI: false, useCustom: false } })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${!settings.vlm.useGeneralAI && !settings.vlm.useCustom ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Use OCR</div>

                      </button>
                      <button
                        onClick={() => setSettings({ ...settings, vlm: { ...settings.vlm, useGeneralAI: false, useCustom: true } })}
                        className={`p-3 rounded-xl border-2 transition-all duration-200 ${!settings.vlm.useGeneralAI && settings.vlm.useCustom ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 cute-shadow' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                      >
                        <div className="text-sm font-bold text-gray-800 dark:text-white">Custom</div>

                      </button>
                    </div>
                  </div>

                  {!settings.vlm.useGeneralAI && !settings.vlm.useCustom && <div className="ocr-settings"><strong>OCR settings used by VLM</strong>{['local-ppocr', 'jina'].includes(settings.imageOCR.provider) && <p>Choose General AI or Custom for direct image translation.</p>}<OCRSettings settings={settings} onChange={setSettings} /></div>}

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

                      </div>
                      <Switch
                        id="thinkingMode"
                        checked={settings.vlm.enableThinking}
                        onCheckedChange={(checked: boolean) => setSettings({ ...settings, vlm: { ...settings.vlm, enableThinking: checked } })}
                      />
                    </div>
                  </div>
                </div>

</div>
            </TabsContent>
            <TabsContent value="config">
              <Suspense fallback={<div role="status">Loading…</div>}>
                <ImportExportDialog embedded isOpen onClose={() => setActiveTab('general')} currentSettings={settings} onImport={handleImport} />
              </Suspense>
            </TabsContent>
          </div>
        </Tabs>
        {saveError && <p role="alert" className="settings-save-error">{saveError}</p>}
        <div className="settings-footer">
          <button type="button" onClick={onClose} className="workspace-secondary">Cancel</button>
          <button type="button" onClick={handleSave} disabled={isSaving} aria-label="Save Settings" className="workspace-primary">{isSaving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {showSettingsHelp && (
        <div
          className="safe-modal fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/45"
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
