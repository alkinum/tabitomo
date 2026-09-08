import { lightTheme, darkTheme, type AppTheme } from '@tabitomo/core';
import { OCR_HELP, LOCAL_MODEL_GUIDANCE, getOCRMode, selectOCRMode } from '@tabitomo/core';
import { hasProviderConnection } from '@tabitomo/core';
import { AIConnection } from './src/AIConnection';
import { NativeMaterial, NativePreferencesProvider, useNativePreferences, selectionFeedback, actionFeedback } from './src/NativeChrome';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type DimensionValue,
  type ImageSourcePropType,
  type StyleProp,
  useColorScheme,
  useWindowDimensions,
  type ViewStyle,
  View,
} from 'react-native';
import * as QRCode from 'qrcode';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Camera as ExpoCamera, CameraView, type BarcodeScanningResult } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Speech from 'expo-speech';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeftRight,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Cloud,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Import,
  Languages,
  MessageCircle,
  Mic,
  MicOff,
  QrCode,
  ScanText,
  Settings,
  Share2,
  Sparkles,
  Upload,
  Volume2,
  X,
} from 'lucide-react-native';
import {
  addNativeSpeechErrorListener,
  addNativeSpeechResultListener,
  addNativeSpeechStateListener,
  isNativeOnDeviceSpeechAvailableAsync,
  isNativeSpeechAvailableAsync,
  requestNativeSpeechAuthorizationAsync,
  startNativeSpeechRecognitionAsync,
  stopNativeSpeechRecognitionAsync,
} from '@tabitomo/native-speech';
import { isNativeVisionAvailableAsync, recognizeTextInImageAsync } from '@tabitomo/native-vision';
import {
  isNativeLocalModelsModuleAvailable,
  recognizeTextWithNativePPOCRAsync,
  transcribeWithNativeLocalModelAsync,
  unloadNativeLocalModelAsync,
  validateNativeLocalModelPackAsync,
  type NativeLocalModelId,
} from '@tabitomo/native-local-models';
import {
  API_FORMAT_OPTIONS,
  DASHSCOPE_OCR_ENDPOINT,
  DASHSCOPE_OCR_INTL_ENDPOINT,
  DEFAULT_SETTINGS,
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  LANGUAGE_OPTIONS,
  SUPPORTED_LANGUAGES,
  type AISettings,
  type APIFormat,
  type ImageOCRSettings,
  type InstalledModelPack,
  type ModelPackActivation,
  type ModelPackCompatibility,
  type ModelPackManifest,
  type ModelPackRuntime,
  type ModelPackRuntimeEnvironment,
  type LanguageCode,
  type LocalAsrEngine,
  type LocalVadMode,
  type OCRTextLocation,
  type SenseVoiceLanguage,
  type SpeechRecognitionProvider,
  type WhisperTask,
  type JapaneseFuriganaToken,
  annotateJapaneseFurigana,
  answerQuestionStream,
  clearTranslationOverride,
  explainTextStream,
  exportConfigPayload,
  evaluateInstalledModelPackCompatibility,
  hasFuriganaReadings,
  hasGeneralAISettings,
  hasJapaneseText,
  importConfigPayload,
  formatModelPackBytes,
  getInstalledModelPackBytes,
  getModelPackKey,
  normalizeSettings,
  performOCR,
  selectModelPackActivation,
  sha256Utf8Hex,
  transcribeAudioFile,
  streamTranslateImageWithVLM,
  translateText,
} from '@tabitomo/core';
import {
  deleteMobileSettings,
  getMobileSettingsSyncStatus,
  getMobileSettingsSyncEnabled,
  loadInstalledModelPacks,
  loadMobileSettings,
  loadMobileSettingsSyncEnabled,
  refreshMobileSettingsSyncStatus,
  saveInstalledModelPacks,
  saveMobileSettings,
  setMobileSettingsSyncEnabled,
} from './src/storage';
import {
  OFFLINE_MODEL_DEFINITIONS,
  deleteInstalledModelPackFiles,
  ensureModelPackRootDirectory,
  getModelPackRootUri,
  getOfflineModelDefinition,
  installOfflineModel,
  installModelPackFromBytes,
  installModelPackFromManifestUrl,
  listModelPackInstallArtifactUris,
  type OfflineModelDefinition,
  type OfflineModelId,
} from './src/modelPacks';
import Svg, { Rect } from 'react-native-svg';

type BusyState = 'idle' | 'translating' | 'recording' | 'transcribing' | 'image';
type ImageMode = 'ocr' | 'vlm';
type TextMode = 'translation' | 'explanation' | 'qa';
type ResultFormat = 'plain' | 'markdown';
type LanguagePickerTarget = 'source' | 'target' | null;
type SetupWizardStep = 'choice' | 'translation' | 'speech' | 'image' | 'import';
type SetupConfigMode = 'general' | 'translation';
type QRCodeModel = ReturnType<typeof QRCode.create>;
type SettingsImportFailurePhase = 'password' | 'payload' | 'decrypt' | 'save';
type SettingsImportResult =
  | { settings: AISettings; phase: 'saved' | 'save-skipped-secure-store-entitlement' }
  | { settings: null; phase: SettingsImportFailurePhase; error: string };
interface ConfigGuidance {
  title: string;
  message: string;
  actionLabel: string;
  target: SettingsJumpId;
}
interface CachedTextResult {
  result: string;
  timestamp: number;
}
const SMOKE_SCENES = [
  'main',
  'main-keyboard',
  'config-guidance',
  'settings',
  'settings-image',
  'settings-config',
  'settings-qr',
  'settings-qr-import',
  'settings-config-roundtrip',
  'settings-hunyuan-output',
  'settings-local',
  'settings-model-packs',
  'settings-model-pack-install',
  'text-provider-smoke',
  'image-provider-smoke',
  'speech-provider-smoke',
  'local-model-runtime-smoke',
  'setup-choice',
  'setup-manual',
  'setup-import',
  'markdown',
  'longtext',
  'image',
  'image-lightbox',
  'furigana',
  'language-picker',
  'qr-scanner',
  'device-qa',
] as const;
const TABITOMO_APP_VERSION = '0.1.0';
const TABITOMO_BUNDLE_IDENTIFIER = 'com.backrunner.tabitomo';
const TABITOMO_BUILD_NUMBER = '1';
const TABITOMO_BUILD_SOURCE = 'expo-native';
const IOS_AVAILABLE_MODEL_PACK_RUNTIMES: readonly ModelPackRuntime[] = isNativeLocalModelsModuleAvailable()
  ? ['apple-speech', 'apple-vision', 'sherpa-onnx-ios', 'onnxruntime-mobile', 'server-fallback']
  : ['apple-speech', 'apple-vision', 'server-fallback'];
const FALLBACK_AVAILABLE_MODEL_PACK_RUNTIMES: readonly ModelPackRuntime[] = ['server-fallback'];
type SmokeScene = typeof SMOKE_SCENES[number];
type SettingsSmokeVariant = 'qr-export' | 'qr-import' | 'config-roundtrip' | 'hunyuan-output' | 'local-runtime' | 'model-packs' | 'model-pack-install';
type SettingsJumpId = 'general' | 'translation' | 'speech' | 'image' | 'local' | 'config';
type SettingsCategoryId = 'ai' | 'speech' | 'image' | 'offline' | 'config';
const SETTINGS_CATEGORY_ITEMS: readonly {
  id: SettingsCategoryId;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}[] = [
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'speech', label: 'Speech', icon: Mic },
  { id: 'image', label: 'Image', icon: ScanText },
  { id: 'offline', label: 'Offline', icon: Download },
  { id: 'config', label: 'Config', icon: Settings },
];
const getSettingsCategoryForJump = (target?: SettingsJumpId | null): SettingsCategoryId => {
  if (target === 'speech' || target === 'image' || target === 'config') {
    return target;
  }
  if (target === 'local') {
    return 'offline';
  }
  return 'ai';
};
interface SmokeSceneOptions {
  modelPackManifestUrl?: string;
  textProviderEndpoint?: string;
  imageProviderEndpoint?: string;
  speechProviderEndpoint?: string;
}
type SettingsLocalRuntimeCheckId = 'asr' | 'ocr';
type DeviceQACheckId =
  | 'secure-settings'
  | 'icloud-settings'
  | 'provider-text'
  | 'provider-image'
  | 'provider-speech'
  | 'tts'
  | 'mic-permission'
  | 'speech-permission'
  | 'on-device-speech'
  | 'local-asr-runtime'
  | 'local-ocr-runtime'
  | 'model-pack-storage'
  | 'camera-permission'
  | 'qr-camera-permission'
  | 'photo-permission'
  | 'capture-image'
  | 'pick-image'
  | 'vision-ocr'
  | 'share-file'
  | 'import-file';
type DeviceQACheckOutcome = 'passed' | 'failed';

interface DeviceQACheckRecord {
  outcome: DeviceQACheckOutcome;
  result: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

interface OverlayItem {
  id: string;
  source: string;
  translation: string;
  location?: OCRTextLocation['location'];
  rotate_rect?: OCRTextLocation['rotate_rect'];
}

interface ImageSize {
  width: number;
  height: number;
}

interface PreparedImageData {
  dataUri: string;
  uri: string;
  size: ImageSize;
}

const isBusy = (state: BusyState): boolean => state !== 'idle';

const SILICONFLOW_ENDPOINT = 'https://api.siliconflow.cn/v1';
const HUNYUAN_MT_MODEL = 'tencent/Hunyuan-MT-7B';
const SMOKE_SCENE_FILE_NAME = 'tabitomo-smoke-scene.json';
const SMOKE_SCENE_ACK_FILE_NAME = 'tabitomo-smoke-scene-ack.json';
const SMOKE_MODEL_PACK_RESULT_FILE_NAME = 'tabitomo-model-pack-smoke-result.json';
const SMOKE_CONFIG_ROUND_TRIP_RESULT_FILE_NAME = 'tabitomo-config-roundtrip-smoke-result.json';
const SMOKE_HUNYUAN_OUTPUT_RESULT_FILE_NAME = 'tabitomo-hunyuan-output-smoke-result.json';
const SMOKE_TEXT_PROVIDER_RESULT_FILE_NAME = 'tabitomo-text-provider-smoke-result.json';
const SMOKE_IMAGE_PROVIDER_RESULT_FILE_NAME = 'tabitomo-image-provider-smoke-result.json';
const SMOKE_SPEECH_PROVIDER_RESULT_FILE_NAME = 'tabitomo-speech-provider-smoke-result.json';
const SMOKE_LOCAL_MODEL_RUNTIME_RESULT_FILE_NAME = 'tabitomo-local-model-runtime-smoke-result.json';
const SMOKE_QR_IMPORT_RESULT_FILE_NAME = 'tabitomo-qr-import-smoke-result.json';
const DEVICE_QA_REPORT_FILE_NAME = 'tabitomo-ios-device-qa-report.json';
const DEVICE_QA_PROVIDER_SPEECH_AUDIO_FILE_NAME = 'tabitomo-device-qa-provider-speech.wav';
const MODEL_PACK_INSTALL_BUSY_KEY = '__install-model-pack__';
const TEXT_AUTO_RUN_DELAY_MS = 650;
const TEXT_CACHE_DURATION_MS = 10 * 60 * 1000;
const TEXT_CACHE_MAX_ENTRIES = 100;
const TEXT_CACHE_PRUNE_COUNT = 20;
const BUDDY_IMAGE = require('./assets/buddy.png') as ImageSourcePropType;
const SMOKE_IMAGE_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAPCAIAAAD0Dk09AAAAGElEQVR4nGP8z0A+YKJA76jmUc2jmkc1U0EzackBHjDP9wUAAAAASUVORK5CYII=';
const DEVICE_QA_PROVIDER_IMAGE_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAADACAIAAAD9bUwwAAAUb0lEQVR42u3de1iP9x/H8c83KiSJ5JBick7MQkhrKCJibBiiHJdtdplNV4xwTcXM4eKaWKQ5zBxrNJJT1yjnVUxIU+TUiYhU+vr90fXb9dtv0/dTfU/V8/HXxqfv977vPu7Xfd+fz/3+KF6/fi0AADWPAYcAAAgAAAABAAAgAAAABAAAgAAAABAAAAACAABAAAAACAAAAAEAACAAAAAEAACAAAAAEAAAAAIAAEAAAAAIAAAAAQAAIAAAAAQAAIAAAAAQAAAAAgAACAAAAAEAACAAAAAEAACAAAAAEAAAAAIAAEAAAAAIAAAAAQAAIAAAAAQAAIAAAAAQAAAAAgAAQAAAAAgAAAABAAAgAAAABAAAgAAAABAAAAACAAAIAAAAAQAAIAAAAAQAAIAAAAAQAACAqq02h0D/ZWZmXrx4MTk5+ebNm2lpaY8ePcrKysrPzy8sLCwuLjY2Nq5Tp46JiUmzZs1atGhhY2PTpUuXrl27duvWrV69ehw9AG/0GnopNzd3165d3t7erVu3rthv1tDQsF+/fgEBAQkJCfq/v5cuXWrYsKHKnerRo0dRUZFOttDf31+hUOj5P+eWLVs+fPiw7B0pLCy0t7evQucohUIxb948zgmaQADol4KCgp07d3p4eBgaGqrxn1CnTp0CAwOzs7P1dsfHjx8vuS+7du3SyRZ269atSpwuDx8+XPaOpKSkVLnrVDs7O04OmsAYgL64d+/e/Pnzra2tx48fHxUVVVxcrMYPT05OLv1wX1/fjIwMfdv3J0+eHDhwQLLxhg0b6C2AYBC4erh///7s2bNtbW2DgoKys7M190UFBQUhISHt27dfsGBBfn6+/hyBnTt3FhQUSDaOjY29du0a3QYgAKq2wsLCZcuWtWvXbt26dYWFhdr50oKCgsDAQHt7+5MnT+rJcdi8eXO52oeEhNB5AAKgCjt9+rSdnd3XX3/94sUL7X97WlrawIED/f39lUqlbo9DYmLi5cuXy/UjP/74o04OGkAAoLJevXrl7+/v4uKSmpoqdDoBLDg4eNiwYXl5eVXo8l8IkZeXt3PnTjoSQABUMTk5OYMHDw4ODtb5pbf476QRFxeXrKwsoaOHYBU7lTMUDBAAVczt27cdHR1PnDihV1uVmJjo4uLy8OFD7X91RERETk5OBX7w8uXL58+fp0cBBEDVcP36dWdnZ90+9hFvnifq4eGh/alBW7ZsqfDPchMACEpBVAlpaWkDBgx48OBBxX7c3Nzc2dm5e/fudnZ2rVq1atasmbm5ubGxsUKhePz48ZMnT548eXLjxo1z586dP38+MTGxqKioAtfUY8eOPXjwoIGBli4L7t69e+zYsQr/+M8//7xq1Spzc3N611+srKy6d+9ezXZKoVB4eHjwyxWUgqiisrOz27dvX4HfjqWl5RdffBEfH69UKuW/LicnZ+3atV27dq3AN37zzTdaOyxLliypZO9dtWqVXr0J7ODgoP+9UfJN4KCgIP7lUgoClVVSUjJw4MDyntpsbW3Dw8MLCwsr89UxMTEdO3Ys1/fWqlXr9OnTWjgsSqWywmWO/tK+fftyRSMBQACAUhBatXDhwuPHj8u3NzExWbVq1fXr1ydNmmRkZFSZr3Z1dU1MTAwMDJT/nJKSkmnTplXgCVJ5HT9+PC0trZIfcvPmTX0bUQcEg8AodebMmeDgYPn29vb2SUlJc+bMqV1bPcMzRkZG/v7+J06csLCwENKD1StXrhS6Hv41NjaWOXQMBQMEgD56+fLllClT5Of7e3p6xsXFtWnTRu1b4uTkdOLEiSZNmki2X7Zs2aNHj4ROq785Ozv7+PioDMLIyMj79+/T2QACQL+sWLHi5s2bko0/++yziIiI+vXra2hj7O3tIyMjjY2NZRq/ePFi+fLlmjsyO3bsePnyZdlt3N3dLS0tXV1dharXqkNDQ+lsAAEg9KrG54oVKyQbf/DBB2vXrtX0eiN9+vRZvXq1kC64lpmZKXRX/qF05p+Xl5fKlj/88ENJSQldDiAA9MXixYufP38ueV7etm2bdlab8vX1dXd3F3JFQzV0ZZ2QkPD777+X3aZjx46l85dGjhyp8q4oIyPj4MGDdDmAABB6srpLeHi4TEszM7N9+/bVqVNHa9u2fv16yQdBGzdu1MSVtczl/6hRo0r/o169eqNHjxYMBQMEQFWxcuVKyZmUQUFBzZs31+a22drafvrppzIt79y5o/ZJlpLV3/4KACH3FCgmJubWrVt0PIAA0LGCgoKwsDCZlr179545c6b2t3DevHn16tWTablnzx71fvWBAwdyc3PLbtO2bVsHB4e//rd///7W1tZC1QvtGzdupO8BBICO7d69W7LC/vLly7VWeEf8vcLEpEmTJM/X6i1bLVP9beLEiX/rowYGMjcBYWFhKmcWASAANGvr1q0yzbp27fruu+/qaiM/+eQTmWampqZqjKj09HSZl6InTJjwf38yefJkIbHQgtrvVwACAOWQlZX122+/CbmJ/zrczi5duvTo0UO8oRbFgAEDFi1aFB0dffXqVTV+aVhYmMr7id69e7dt21b8o+ZPnz59BEPBgKActB6LjIyUmTljamr6z+tcLZs4ceLFixdL/7tZs2ZOTk79+vVzcnLq3r27ugpRiL8/ppe5N5oyZcq//rm3t3d8fHzZPxsfH5+YmChTtQ0AAaB+R44ckWnm5uZWt25d3W6qr6/vq1evLCws+vXrZ2trq+mvO3bsWHp6ulBVCG/cuHH/+lfjxo2bM2eOyrXgN2zYEBISQj8EBI+AhNYXV4iNjZVpOWzYMJ1vrZGR0dy5cydPnqyFs7+QG/4dM2aMqanpv/5VgwYNxowZIySKTDx79oyuCBAA2vbHH39kZ2cLVjj6h8ePH6us/iaEmDZtWhl/O2PGDJWfkJ+fv23bNroiQABo21+P1IWqumyWlpY16sjs2LGjsLCw7DadOnXq27evKLNmhp2dnWAoGCAA9JDKEjelevbsWdOOjEz5h6lTp6psM336dJVtrl69evr0aXojQABoVVJSkkyzXr161bRcTEhIKLuNoaGhzLtpXl5eMoWMuAkACABtS01NlWn2pgn4Nfny39PTU2a9mkaNGsnUhtu7d29WVhYdEiAAtKSoqOjevXsyLTt06FBzDotk9beyh39FOZ8CFRUVyUw6AggACHWVgJYpm2NhYWFiYlJzDsv+/fsfP35cdhtra+tBgwZJfuB7773Xrl07IVHLWr1VjGoaf39/hU4ZGBj4+fnxiyAARFUpAiHTrFWrVoLnP3/n4+NTropDMrcLt2/fjo6O1vLOXrp0SZunyMaNG1++fFlU37dqoqKiOLEQAFWDzBsAQggbG5uac0zS0tJUriigUCjeVP7hTby9vQ0NDUWNHwrOzc2Ni4vjnx4IAN178uSJkKuvWXOOSVhY2OvXr8tu4+rqWt67IktLyxEjRqhsFhUVdefOHXomQAAILYx2yjSrOQMASqVSZl1M+eFfUc6hYKVSuWnTJnomQAAILcwCkmkmuRRXNSBT/a1x48YjR46swIe7ubm1bt1aZbPQ0NDi4mI6J0AAaJbk+ulGRkY15IDITMT08vKq2AFRKBQybw4/evRIpgYRQACgUiRr6NeQZQtzc3MjIiKEZp7/iP/OHapVq5bgrWCAABB6UF1ZppnKivaixlR/c3R0lCnu9iZWVlZDhw5V2ezUqVPJycn0T4AA0CDJh/s1JABknv9U5vJfSA8FCyFYIgYgADTL3NxcpllBQUG1PxSXLl1SWf3NxMRk7NixlfyioUOHWllZqWwWHh5eQ3K3OqmBy2YQAFVY48aNhdzSKFz+CyHGjh1b+VciatWq5ePjo7JZXl7eTz/9VC2vOcpeQaEygoKCXuuUUqlcvnw5JxbBmsBVQrNmzYTcy7HV+zi8fPlSpvrbli1btFmvbcOGDTKzhirJwcFBclEggDuA6hYAMuPAd+/erd5Fyvbv3y/5UrTQ7lOpCxcu0EsBAkAzh9LAwNraWki8L/bgwQNRs6u/6QTzQQECQIPat28v0+z27dui+lZ/O3nypH5u265du2rCAAxAAOiGvb29UN/a8aJqDv+qrP6mKwUFBTK1iQACABXRtWtXmWZnz57Vq9OiuqZISlZ/0yFeCAAIAE2RXO1dfwIgKyvLysqqYcOGTk5OCxYsiImJef78eYU/LSYmRs/LL9+4cUPl+gQAAYCKaNeunczK5unp6Q8fPtSHDT5y5Mjjx4+Li4vj4uICAwMHDRpUOrV8/vz5R48eLW8Y6O3wr2AoGCAAtMDZ2Vmm2aFDh/Rha0+dOvV/f1JcXBwfHx8UFDR48OCGDRv26dMnICBAJglycnJ++eUX/f8FRUREVO9ZWAABoDODBw+WabZ7926hB2uuHjlypIwGr169Onv27NKlS/fu3avy07Zv3y65JI5uvXr1KjQ0lI4KEADq5+7uLtPs5MmTOTk5ut3Us2fP3r9/X6hpdlNYWFhV+R1t2rRJcvEGgABAOdjY2HTv3l3mOnTfvn263VTJ8jjNmzdXuUcXL15MTExU+VFr167VaPWYzMxMmcXiMzIy9OQRHEAAVDeSRS7XrFmjwynzBQUF27ZtE3IVNxUKhah09bdatWpVvvxn2Zo0aTJkyBDBUDBAAOgwAFSeMYUQycnJOlytMDw8XLJiz4cffihUVX+TuZkYMGBA06ZNNb1f3t7eMs2OHj2amppKXwUBADVr3br1gAEDZFoGBgbqZAuLi4uDg4OF3PMfV1fXstvs27dPJkvGjx+vhV0bNmyYhYWFkBgA37hxI30VBADUb8aMGUKuROXWrVu1v3nr169PT0+XaTlx4kSV6+7KTP+vU6fOqFGjtLBrhoaGH330kUzLsLCwKjFtCSAAqpj3339fpjKoEOLzzz/X8tuzGRkZAQEBkvVNZ86cKVQVtvvnywT/5OHh0aBBA+3soORToOzs7D179tBXQQBA/dehc+bMkWn59OlTb29vrY0GK5XKSZMmPXv2TDLGbG1thTqqv2nn+U+pd955R7IqH0PBIACgEdOnT5d5GC2EOHny5KxZs7SzVQsWLJAv1/zVV1+ppfqbmZmZlhd3nTx5skyzuLi4pKQk+ioIAKhZ/fr1Fy5cKKSrVM6ePVvTm7Ru3TrJsV8hhKenp6Ojo1A1l+bu3bsqP2rUqFHGxsbaPPgTJ06sXbs2NwEAAaAzvr6+bdu2lT87+/r6am5YcsWKFfIZU7t2bZn1uCWrv02YMEHLR75p06aSNTm2b98u+UAMIAAgyjUS8P3334vyVKvv1avXtWvXhLpXaZ85c6afn5/8j8yaNatjx45CHdXfmjdv3r9/f+0ffMmh4Pz8/O3bt9NXQQBA/dzc3CTPRKWSkpIcHByCgoIqU5f/f507d65Xr16bNm2S/5E2bdrIvKCwbdu2oqIiIfFanIGBDrrZ8OHDGzVqJHgKBBAAOrRmzZo2bdqU64J9/vz5bdq0+e677yqzVteff/7p4+PTt2/fK1euyP+UQqHYsmWLiYmJUFP1N23O//lfxsbG48aNk2l55cqVM2fO0FFBAED9zMzM9uzZU95R0MzMzC+//NLKymrq1KnHjh2Tr15ZWFh46NChUaNGdejQYevWrUqlslzfu3TpUhcXF5XNLly4IDN/pm3btj179tTVkZe/9+ImADXUa2jFjh07ZAoEvYmFhYWHh8eiRYsiIyMTEhLS09Pz8vJKSkpevHiRmZmZkJAQERGxePFiDw8PmYt38ebpOkqlUmZ3Pv74Y5kPXLRokW4Pe+fOnSVvF7Kyssr+qG7duqn8HAcHB/3viikpKaLKjqhxJlEvAkB75Kdg6oSTk1N+fr7Mjrx48cLMzEzmM69fv67bYy4zl6nU8uXLCQA9N2LECE4j6sUjIO3x8/NbsmSJfm5bz549f/31V8m7h7179+bl5QmJN3I7dOig2/3y8vJSWcuo1MaNG3VYnRtgDKD6W7Ro0cqVKyvzLEgT+vfvf/ToUflaPTLV/4Xuhn/F3yehurm5Cbkx8+joaLooCABo0Ny5c/fv31+/fn092R5vb+/o6OiGDRsK6clFsbGxMoXkJCfhMBQMEAA1yMiRI8+ePSvzTFmj6tWrFxISEhYWJrOMYnmrv7m4uFhZWQn9eHAsGW9RUVEylS0AAgCVYmdnd/78eT8/v3KdfNXI0dHx8uXLKqs9iwpVfxP68fxH/HcpAsmlKEtKSsr1xhxAAKCCjIyMgoODk5KS3N3dtfm9lpaWmzdvjo+Pr8AIbXR0dEZGhsyujR49Wn8OtfxToNDQ0OLiYjonCABoQ8eOHQ8fPhwXF+fp6anpweGmTZsGBwffunVrypQpFfsuyepvQ4YMMTc315+D3Lt3b8m0e/jwYUREBN0SBAC0p0+fPpGRkampqQEBAeWqGyHkqju8++67W7ZsSUtL8/PzMzU1rdjn5OfnHzx4UFSp5z+inCsECCF0skgnQADUdG+99dbixYtTU1OvXr367bffDh48WLKc2b8yMTEZMmTI6tWrU1NTY2NjfXx86tSpIypXXUdliVAhhL29/fDhw/Xt2E6ZMkVykU47O7s33daUfdtkYGAwdOhQ/e9mNjY2kiumCT17E1iyxDfKcXXIyy96LiUl5erVqykpKbdu3crIyMjKysrKynr69GlhYWFRUZFSqTQ2Nq5bt279+vVbtGjRsmXLVq1a2dvbv/322507d9bVCDMAAgAAIHgEBAAgAAAABAAAgAAAABAAAAACAABAAAAACAAAAAEAACAAAAAEAACAAAAAEAAAAAIAAAgADgEAEAAAAAIAAEAAAAAIAAAAAQAAIAAAAAQAAIAAAAAQAAAAAgAAQAAAAAgAAAABAAAgAAAABAAAgAAAABAAAAACAABAAAAACAAAAAEAACAAAAAEAAAQAAAAAgAAQAAAAAgAAAABAAAgAAAABAAAgAAAABAAAAACAABAAAAACAAAAAEAACAAAAAEAABAM/4DtgQE/1b3zYsAAAAASUVORK5CYII=';
const SMOKE_CONFIG_PAYLOAD = [
  'tabitomo-config-smoke',
  'v1',
  'expo-universal-parity',
  'encrypted-payload-preview',
  'settings-import-export-qr',
].join(':');
const SMOKE_TEXT_PROVIDER_API_KEY = 'ios-smoke-provider-key';
const SMOKE_IMAGE_PROVIDER_API_KEY = 'ios-smoke-image-provider-key';
const SMOKE_SPEECH_PROVIDER_API_KEY = 'ios-smoke-speech-provider-key';
const SMOKE_SPEECH_AUDIO_FILE_NAME = 'tabitomo-speech-provider-smoke.wav';
const SMOKE_QR_IMPORT_PASSWORD = 'tabitomo-qr-import-smoke-password';
const SMOKE_QR_IMPORT_GENERAL_API_KEY = 'ios-smoke-qr-import-general-key';
const SMOKE_QR_IMPORT_TRANSLATION_API_KEY = 'ios-smoke-qr-import-translation-key';
const SMOKE_QR_IMPORT_SPEECH_API_KEY = 'ios-smoke-qr-import-speech-key';
const SMOKE_QR_IMPORT_OCR_API_KEY = 'ios-smoke-qr-import-ocr-key';
const SMOKE_QR_IMPORT_VLM_API_KEY = 'ios-smoke-qr-import-vlm-key';
const SMOKE_QR_IMPORT_SECRET_MARKERS = [
  SMOKE_QR_IMPORT_PASSWORD,
  SMOKE_QR_IMPORT_GENERAL_API_KEY,
  SMOKE_QR_IMPORT_TRANSLATION_API_KEY,
  SMOKE_QR_IMPORT_SPEECH_API_KEY,
  SMOKE_QR_IMPORT_OCR_API_KEY,
  SMOKE_QR_IMPORT_VLM_API_KEY,
];

const deviceTypeLabel = (deviceType: Device.DeviceType | null): string => {
  switch (deviceType) {
    case Device.DeviceType.PHONE:
      return 'phone';
    case Device.DeviceType.TABLET:
      return 'tablet';
    case Device.DeviceType.TV:
      return 'tv';
    case Device.DeviceType.DESKTOP:
      return 'desktop';
    case Device.DeviceType.UNKNOWN:
      return 'unknown';
    default:
      return 'unknown';
  }
};

const isHunyuanMTModel = (modelName: string): boolean => modelName.toLowerCase().includes('hunyuan-mt');

const createSyntheticSpeechWav = (): Uint8Array => {
  const sampleRate = 16_000;
  const durationSeconds = 1.2;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.sin(Math.PI * Math.min(1, index / 1200));
    const frequency = index < sampleCount / 2 ? 440 : 660;
    const sample = Math.round(Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 32767 * 0.18 * envelope);
    view.setInt16(44 + index * bytesPerSample, sample, true);
  }

  return new Uint8Array(buffer);
};

const getModelPackRuntimePlatform = (): ModelPackRuntimeEnvironment['platform'] => {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return Platform.OS;
  }
  return 'unknown';
};

const getAvailableModelPackRuntimes = (): readonly ModelPackRuntime[] => (
  Platform.OS === 'ios' ? IOS_AVAILABLE_MODEL_PACK_RUNTIMES : FALLBACK_AVAILABLE_MODEL_PACK_RUNTIMES
);

const getModelPackRuntimeEnvironment = (): ModelPackRuntimeEnvironment => ({
  platform: getModelPackRuntimePlatform(),
  iosVersion: Platform.OS === 'ios' ? Platform.Version : undefined,
  appVersion: TABITOMO_APP_VERSION,
  availableRuntimes: getAvailableModelPackRuntimes(),
});

const getSelectedLocalASRModelId = (settings: AISettings): 'whisper-base' | 'sensevoice-small' => (
  settings.speechRecognition.localEngine === 'sensevoice' ? 'sensevoice-small' : 'whisper-base'
);

const isNativeLocalModelId = (value: string): value is NativeLocalModelId => (
  value === 'whisper-base' || value === 'sensevoice-small' || value === 'ppocr-v6-small'
);

const selectInstalledModelPackById = (
  installed: readonly InstalledModelPack[],
  modelId: NativeLocalModelId,
  nativeBaselineRuntime?: ModelPackRuntime
): ModelPackActivation => (
  selectModelPackActivation(
    installed.filter((pack) => pack.id === modelId),
    getModelPackRuntimeEnvironment(),
    modelId === 'ppocr-v6-small' ? 'ocr' : 'asr',
    nativeBaselineRuntime
  )
);

const getReadyInstalledModelPackById = (
  installed: readonly InstalledModelPack[],
  modelId: NativeLocalModelId
): InstalledModelPack | null => {
  const activation = selectInstalledModelPackById(installed, modelId);
  return activation.status === 'installed-pack' ? activation.pack : null;
};

const getNativeBaselineModelPackRuntime = (feature: InstalledModelPack['feature']): ModelPackRuntime | undefined => {
  if (feature === 'asr') {
    return 'apple-speech';
  }
  if (feature === 'ocr') {
    return 'apple-vision';
  }
  return undefined;
};

const SMOKE_SETTINGS: AISettings = normalizeSettings({
  ...DEFAULT_SETTINGS,
  generalAI: {
    apiFormat: 'openai-chat',
    endpoint: 'https://example.test/v1',
    modelName: 'tabitomo-smoke-general',
    apiKey: 'smoke-general-key',
  },
  provider: 'custom',
  endpoint: 'https://example.test/v1',
  modelName: 'tabitomo-smoke-translation',
  apiKey: 'smoke-translation-key',
  speechRecognition: {
    ...DEFAULT_SETTINGS.speechRecognition,
    provider: 'siliconflow',
    apiKey: 'smoke-speech-key',
    modelName: 'TeleAI/TeleSpeechASR',
  },
  imageOCR: {
    ...DEFAULT_SETTINGS.imageOCR,
    provider: 'qwen',
    useGeneralAI: false,
    endpoint: 'https://example.test/v1',
    modelName: 'qwen3.5-ocr',
    apiKey: 'smoke-ocr-key',
  },
  vlm: {
    ...DEFAULT_SETTINGS.vlm,
    useGeneralAI: true,
    useCustom: false,
    enableThinking: false,
  },
});

const SMOKE_IMAGE_SETTINGS: AISettings = normalizeSettings({
  ...SMOKE_SETTINGS,
  vlm: {
    ...SMOKE_SETTINGS.vlm,
    useGeneralAI: false,
    useCustom: false,
  },
});

const SMOKE_LOCAL_RUNTIME_SETTINGS: AISettings = normalizeSettings({
  ...SMOKE_SETTINGS,
  speechRecognition: {
    ...SMOKE_SETTINGS.speechRecognition,
    provider: 'local',
    localEngine: 'whisper',
    localModelPath: 'ios-native-speech',
  },
  imageOCR: {
    ...SMOKE_SETTINGS.imageOCR,
    provider: 'local-ppocr',
    useGeneralAI: false,
    modelName: 'apple-vision',
    apiKey: '',
  },
});

const createTextProviderSmokeSettings = (endpoint: string): AISettings => normalizeSettings({
  ...SMOKE_SETTINGS,
  generalAI: {
    ...SMOKE_SETTINGS.generalAI,
    endpoint,
    modelName: 'tabitomo-native-provider-smoke',
    apiKey: SMOKE_TEXT_PROVIDER_API_KEY,
    apiFormat: 'openai-chat',
  },
  provider: 'custom',
  endpoint,
  modelName: 'tabitomo-native-provider-smoke',
  apiKey: SMOKE_TEXT_PROVIDER_API_KEY,
  translation: {
    ...SMOKE_SETTINGS.translation,
    outputMode: 'plain',
  },
});

const createImageProviderSmokeSettings = (endpoint: string): AISettings => {
  const ocrEndpoint = new URL(endpoint);
  ocrEndpoint.pathname = '/api/v1/services/aigc/multimodal-generation/generation';
  ocrEndpoint.search = '';
  ocrEndpoint.hash = '';

  return normalizeSettings({
    ...SMOKE_SETTINGS,
    generalAI: {
      ...SMOKE_SETTINGS.generalAI,
      endpoint,
      modelName: 'tabitomo-native-image-general-smoke',
      apiKey: SMOKE_IMAGE_PROVIDER_API_KEY,
      apiFormat: 'openai-chat',
    },
    provider: 'custom',
    endpoint,
    modelName: 'tabitomo-native-image-translation-smoke',
    apiKey: SMOKE_IMAGE_PROVIDER_API_KEY,
    translation: {
      ...SMOKE_SETTINGS.translation,
      outputMode: 'plain',
    },
    imageOCR: {
      ...SMOKE_SETTINGS.imageOCR,
      provider: 'qwen',
      useGeneralAI: false,
      endpoint: ocrEndpoint.toString(),
      modelName: 'qwen3.5-ocr',
      apiKey: SMOKE_IMAGE_PROVIDER_API_KEY,
    },
    vlm: {
      ...SMOKE_SETTINGS.vlm,
      useGeneralAI: false,
      useCustom: true,
      endpoint,
      modelName: 'tabitomo-native-image-vlm-smoke',
      apiKey: SMOKE_IMAGE_PROVIDER_API_KEY,
      enableThinking: false,
    },
  });
};

const createSpeechProviderSmokeSettings = (endpoint: string): AISettings => normalizeSettings({
  ...SMOKE_SETTINGS,
  speechRecognition: {
    ...SMOKE_SETTINGS.speechRecognition,
    provider: 'siliconflow',
    endpoint,
    modelName: 'tabitomo-native-speech-smoke',
    apiKey: SMOKE_SPEECH_PROVIDER_API_KEY,
  },
});

const createQrImportSmokeSettings = (): AISettings => normalizeSettings({
  ...SMOKE_SETTINGS,
  generalAI: {
    ...SMOKE_SETTINGS.generalAI,
    endpoint: 'https://qr-import.example.test/v1',
    modelName: 'tabitomo-qr-import-general',
    apiKey: SMOKE_QR_IMPORT_GENERAL_API_KEY,
    apiFormat: 'openai-responses',
  },
  provider: 'custom',
  endpoint: 'https://qr-import.example.test/v1',
  modelName: 'tabitomo-qr-import-translation',
  apiKey: SMOKE_QR_IMPORT_TRANSLATION_API_KEY,
  translation: {
    ...SMOKE_SETTINGS.translation,
    outputMode: 'plain',
  },
  speechRecognition: {
    ...SMOKE_SETTINGS.speechRecognition,
    provider: 'siliconflow',
    endpoint: 'https://qr-import.example.test/v1',
    modelName: 'tabitomo-qr-import-speech',
    apiKey: SMOKE_QR_IMPORT_SPEECH_API_KEY,
  },
  imageOCR: {
    ...SMOKE_SETTINGS.imageOCR,
    provider: 'custom',
    useGeneralAI: false,
    endpoint: 'https://qr-import.example.test/v1',
    modelName: 'tabitomo-qr-import-ocr',
    apiKey: SMOKE_QR_IMPORT_OCR_API_KEY,
  },
  vlm: {
    ...SMOKE_SETTINGS.vlm,
    useGeneralAI: false,
    useCustom: true,
    endpoint: 'https://qr-import.example.test/v1',
    modelName: 'tabitomo-qr-import-vlm',
    apiKey: SMOKE_QR_IMPORT_VLM_API_KEY,
    enableThinking: true,
  },
});

const getQrImportSmokeChecks = (settings: AISettings): Record<string, boolean> => ({
  generalAI: settings.generalAI.endpoint === 'https://qr-import.example.test/v1'
    && settings.generalAI.modelName === 'tabitomo-qr-import-general'
    && settings.generalAI.apiFormat === 'openai-responses',
  translation: settings.provider === 'custom'
    && settings.endpoint === 'https://qr-import.example.test/v1'
    && settings.modelName === 'tabitomo-qr-import-translation'
    && settings.translation.outputMode === 'plain',
  speech: settings.speechRecognition.provider === 'siliconflow'
    && settings.speechRecognition.endpoint === 'https://qr-import.example.test/v1'
    && settings.speechRecognition.modelName === 'tabitomo-qr-import-speech',
  ocr: settings.imageOCR.provider === 'custom'
    && settings.imageOCR.useGeneralAI === false
    && settings.imageOCR.endpoint === 'https://qr-import.example.test/v1'
    && settings.imageOCR.modelName === 'tabitomo-qr-import-ocr',
  vlm: settings.vlm.useGeneralAI === false
    && settings.vlm.useCustom === true
    && settings.vlm.endpoint === 'https://qr-import.example.test/v1'
    && settings.vlm.modelName === 'tabitomo-qr-import-vlm'
    && settings.vlm.enableThinking === true,
  apiKeysPresent: Boolean(
    settings.generalAI.apiKey
    && settings.apiKey
    && settings.speechRecognition.apiKey
    && settings.imageOCR.apiKey
    && settings.vlm.apiKey
  ),
});

const SMOKE_INSTALLED_MODEL_PACKS: InstalledModelPack[] = [
  {
    id: 'ocr-apple-vision-ja',
    feature: 'ocr',
    runtime: 'apple-vision',
    version: '2026.07.1',
    minAppVersion: TABITOMO_APP_VERSION,
    minIOS: '17.0',
    label: 'Apple Vision Japanese OCR',
    description: 'Synthetic smoke pack for the iOS Vision baseline.',
    installedAt: '2026-07-09T00:00:00.000Z',
    rootUri: 'file:///tabitomo-smoke/model-packs/ocr-apple-vision-ja/2026.07.1',
    bytes: 4096,
    license: 'Apple system framework',
    manifestSha256: '111111',
    files: [
      {
        name: 'vision-runtime.json',
        uri: 'file:///tabitomo-smoke/model-packs/ocr-apple-vision-ja/2026.07.1/vision-runtime.json',
        sha256: '111111',
        bytes: 4096,
      },
    ],
  },
  {
    id: 'asr-whisper-base-ja-en',
    feature: 'asr',
    runtime: 'whisper-cpp-coreml',
    version: '2026.07.1',
    minAppVersion: TABITOMO_APP_VERSION,
    minIOS: '17.0',
    label: 'Whisper base JA/EN',
    description: 'Synthetic smoke pack used to verify incompatible model states.',
    installedAt: '2026-07-09T00:00:00.000Z',
    rootUri: 'file:///tabitomo-smoke/model-packs/asr-whisper-base-ja-en/2026.07.1',
    bytes: 145000000,
    license: 'TBD',
    manifestSha256: '222222',
    files: [
      {
        name: 'model.bin',
        uri: 'file:///tabitomo-smoke/model-packs/asr-whisper-base-ja-en/2026.07.1/model.bin',
        sha256: '222222',
        bytes: 145000000,
      },
    ],
  },
];

const SMOKE_FURIGANA_TOKENS: JapaneseFuriganaToken[] = [
  { text: '駅', reading: 'えき' },
  { text: 'はどこですか' },
];

const parseSmokeScene = (url: string): SmokeScene | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'tabitomo:') {
    return null;
  }

  const candidate = parsed.searchParams.get('scene') || parsed.hostname || parsed.pathname.replace(/^\/+/, '');
  return (SMOKE_SCENES as readonly string[]).includes(candidate)
    ? candidate as SmokeScene
    : null;
};

const writeSmokeSceneAck = (scene: SmokeScene): void => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const file = new File(Paths.document, SMOKE_SCENE_ACK_FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify({
      scene,
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Simulator smoke still falls back to screenshots if the ack cannot be written.
  }
};

const writeModelPackSmokeResult = (result: Record<string, unknown>): void => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const file = new File(Paths.document, SMOKE_MODEL_PACK_RESULT_FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify({
      ...result,
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Simulator smoke should still surface failures through the visible status text.
  }
};

const writeLocalModelRuntimeSmokeResult = (result: Record<string, unknown>): void => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const file = new File(Paths.document, SMOKE_LOCAL_MODEL_RUNTIME_RESULT_FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify({
      ...result,
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // The visible smoke state still reports failures if the result file cannot be written.
  }
};

const writeConfigRoundTripSmokeResult = (result: Record<string, unknown>): void => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const file = new File(Paths.document, SMOKE_CONFIG_ROUND_TRIP_RESULT_FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify({
      ...result,
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Simulator smoke should still surface failures through the visible status text.
  }
};

const writeHunyuanOutputSmokeResult = (result: Record<string, unknown>): void => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const file = new File(Paths.document, SMOKE_HUNYUAN_OUTPUT_RESULT_FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify({
      ...result,
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Simulator smoke should still surface failures through the visible status text.
  }
};

const writeTextProviderSmokeResult = (result: Record<string, unknown>): void => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const file = new File(Paths.document, SMOKE_TEXT_PROVIDER_RESULT_FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify({
      ...result,
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Simulator smoke should still surface failures through the visible status text.
  }
};

const writeImageProviderSmokeResult = (result: Record<string, unknown>): void => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const file = new File(Paths.document, SMOKE_IMAGE_PROVIDER_RESULT_FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify({
      ...result,
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Simulator smoke should still surface failures through the visible status text.
  }
};

const writeSpeechProviderSmokeResult = (result: Record<string, unknown>): void => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const file = new File(Paths.document, SMOKE_SPEECH_PROVIDER_RESULT_FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify({
      ...result,
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Simulator smoke should still surface failures through the visible status text.
  }
};

const writeQrImportSmokeResult = (result: Record<string, unknown>): void => {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const file = new File(Paths.document, SMOKE_QR_IMPORT_RESULT_FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify({
      ...result,
      writtenAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Simulator smoke should still surface failures through the visible status text.
  }
};

const sanitizeQrImportSmokeDiagnostic = (message: string): string => {
  let diagnostic = message;
  SMOKE_QR_IMPORT_SECRET_MARKERS.forEach((secret) => {
    diagnostic = diagnostic.split(secret).join('[redacted]');
  });
  return diagnostic
    .replace(/tabitomo-config:[A-Za-z0-9+/=_-]+/g, 'tabitomo-config:[redacted]')
    .slice(0, 500);
};

const isMissingSecureStoreEntitlementError = (error: unknown): boolean => (
  error instanceof Error && /required entitlement/i.test(error.message)
);

const isTextTranslationConfigured = (settings: AISettings): boolean => (
  hasGeneralAISettings(settings) || Boolean(hasProviderConnection(settings))
);

const getTextActionKey = (
  text: string,
  mode: TextMode,
  sourceLang: LanguageCode,
  targetLang: LanguageCode
): string => `${mode}:${sourceLang}:${targetLang}:${text}`;

const getTranslationCacheKey = (
  text: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode
): string => `${sourceLang}:${targetLang}:${text}`;

const isAbortError = (error: unknown): boolean => (
  error instanceof Error
  && (error.name === 'AbortError' || /abort/i.test(error.message))
);

const isCloudImageConfigured = (settings: AISettings, mode: ImageMode): boolean => {
  if (mode === 'ocr' && settings.imageOCR.useGeneralAI) return hasGeneralAISettings(settings);
  if (mode === 'vlm') {
    if (settings.vlm.useGeneralAI) {
      return hasGeneralAISettings(settings);
    }
    if (settings.vlm.useCustom) {
      return Boolean(hasProviderConnection(settings.vlm));
    }
    if (settings.imageOCR.provider === 'local-ppocr') {
      return Platform.OS === 'ios';
    }
    return hasProviderConnection(settings.imageOCR);
  }

  if (settings.imageOCR.provider === 'local-ppocr') {
    return true;
  }
  return hasProviderConnection(settings.imageOCR);
};

const languageLabel = (code: LanguageCode): string => `${SUPPORTED_LANGUAGES[code]} (${code})`;

const NATIVE_SPEECH_LOCALES: Partial<Record<LanguageCode, string>> = {
  ar: 'ar-SA',
  bn: 'bn-IN',
  cs: 'cs-CZ',
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fa: 'fa-IR',
  fr: 'fr-FR',
  gu: 'gu-IN',
  he: 'he-IL',
  hi: 'hi-IN',
  id: 'id-ID',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ms: 'ms-MY',
  nl: 'nl-NL',
  pl: 'pl-PL',
  pt: 'pt-PT',
  ru: 'ru-RU',
  ta: 'ta-IN',
  te: 'te-IN',
  th: 'th-TH',
  tr: 'tr-TR',
  uk: 'uk-UA',
  ur: 'ur-PK',
  vi: 'vi-VN',
  yue: 'yue-Hant-HK',
  zh: 'zh-CN',
  'zh-Hant': 'zh-TW',
};

const nativeSpeechLocale = (code: LanguageCode): string => NATIVE_SPEECH_LOCALES[code] || code;

const NATIVE_VISION_OCR_LANGUAGES: Partial<Record<LanguageCode, string[]>> = {
  ar: ['ar'],
  de: ['de-DE'],
  en: ['en-US'],
  es: ['es-ES'],
  fr: ['fr-FR'],
  it: ['it-IT'],
  ja: ['ja-JP'],
  ko: ['ko-KR'],
  pt: ['pt-BR', 'pt-PT'],
  ru: ['ru-RU'],
  uk: ['uk-UA'],
  vi: ['vi-VN'],
  zh: ['zh-Hans'],
  'zh-Hant': ['zh-Hant'],
};

const nativeVisionOCRLanguages = (code: LanguageCode): string[] => NATIVE_VISION_OCR_LANGUAGES[code] || [];

const textModeTitle = (mode: TextMode): string => {
  if (mode === 'explanation') return 'Explanation';
  if (mode === 'qa') return 'Answer';
  return 'Translation';
};

const textModeActionLabel = (mode: TextMode): string => {
  if (mode === 'explanation') return 'Explain';
  if (mode === 'qa') return 'Answer';
  return 'Translate';
};

const textModePlaceholder = (mode: TextMode): string => {
  if (mode === 'explanation') return 'Enter a word, sentence, or grammar pattern...';
  if (mode === 'qa') return 'Ask a travel language question...';
  return 'Type, speak, or translate a photo...';
};

const textModeEmptyText = (mode: TextMode): string => {
  if (mode === 'explanation') return 'Your explanation will appear here.';
  if (mode === 'qa') return 'Your answer will appear here.';
  return 'Your translated text will appear here.';
};

const textModeBusyText = (mode: TextMode): string => {
  if (mode === 'explanation') return 'Explaining...';
  if (mode === 'qa') return 'Answering...';
  return 'Translating...';
};

const buildImageDataUri = async (asset: ImagePicker.ImagePickerAsset): Promise<PreparedImageData> => {
  const longestSide = Math.max(asset.width || 0, asset.height || 0);
  const resize = longestSide > 1920
    ? [{ resize: asset.width >= asset.height ? { width: 1920 } : { height: 1920 } }]
    : [];

  const manipulated = await ImageManipulator.manipulateAsync(asset.uri, resize, {
    base64: true,
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  if (!manipulated.base64) {
    throw new Error('Could not prepare image data.');
  }

  return {
    dataUri: `data:image/jpeg;base64,${manipulated.base64}`,
    uri: manipulated.uri,
    size: {
      width: manipulated.width,
      height: manipulated.height,
    },
  };
};

type AppStyles = ReturnType<typeof createStyles>;

const AppThemeContext = createContext<{ theme: AppTheme; styles: AppStyles } | null>(null);

const getAppTheme = (scheme: ReturnType<typeof useColorScheme>): AppTheme => (
  scheme === 'dark' ? darkTheme : lightTheme
);

function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeContext.');
  }
  return context;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NativePreferencesProvider><AppContent /></NativePreferencesProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const colorScheme = useColorScheme();
  const { width: viewportWidth } = useWindowDimensions();
  const theme = useMemo(() => getAppTheme(colorScheme), [colorScheme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const themeContext = useMemo(() => ({ theme, styles }), [styles, theme]);
  const insets = useSafeAreaInsets();
  const isCompactViewport = viewportWidth <= 430;
  const isNarrowViewport = viewportWidth <= 340;
  const sourceToolbarButtonSize = 44;
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialJumpId, setSettingsInitialJumpId] = useState<SettingsJumpId | null>(null);
  const [showWelcomeWizard, setShowWelcomeWizard] = useState(false);
  const [languagePickerTarget, setLanguagePickerTarget] = useState<LanguagePickerTarget>(null);
  const [sourceLang, setSourceLang] = useState<LanguageCode>(DEFAULT_SOURCE_LANGUAGE);
  const [targetLang, setTargetLang] = useState<LanguageCode>(DEFAULT_TARGET_LANGUAGE);
  const [sourceText, setSourceText] = useState('');
  const [sourceInputFocused, setSourceInputFocused] = useState(false);
  const [targetText, setTargetText] = useState('');
  const [resultCopied, setResultCopied] = useState(false);
  const [textMode, setTextMode] = useState<TextMode>('translation');
  const [resultFormat, setResultFormat] = useState<ResultFormat>('plain');
  const [furiganaTokens, setFuriganaTokens] = useState<JapaneseFuriganaToken[] | null>(null);
  const [isFuriganaLoading, setIsFuriganaLoading] = useState(false);
  const [imageMode, setImageMode] = useState<ImageMode>('vlm');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [overlayItems, setOverlayItems] = useState<OverlayItem[]>([]);
  const [busyState, setBusyState] = useState<BusyState>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [configGuidanceOverride, setConfigGuidanceOverride] = useState<ConfigGuidance | null>(null);
  const [nativeSpeechActive, setNativeSpeechActive] = useState(false);
  const [nativeSpeechMode, setNativeSpeechMode] = useState<'standard' | 'on-device' | null>(null);
  const [smokeScene, setSmokeScene] = useState<SmokeScene | null>(null);
  const [smokeModelPackManifestUrl, setSmokeModelPackManifestUrl] = useState<string | null>(null);
  const [smokeTextProviderEndpoint, setSmokeTextProviderEndpoint] = useState<string | null>(null);
  const [smokeImageProviderEndpoint, setSmokeImageProviderEndpoint] = useState<string | null>(null);
  const [smokeSpeechProviderEndpoint, setSmokeSpeechProviderEndpoint] = useState<string | null>(null);
  const [showSmokeQrScanner, setShowSmokeQrScanner] = useState(false);
  const [showDeviceQA, setShowDeviceQA] = useState(false);
  const [showImageLightbox, setShowImageLightbox] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const isVoiceRecording = recorderState.isRecording || nativeSpeechActive;
  const sourceInputRef = useRef<TextInput>(null);
  const textActionAbortRef = useRef<AbortController | null>(null);
  const textAutoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultCopyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoTextRunKeyRef = useRef<string | null>(null);
  const translationCacheRef = useRef<Map<string, CachedTextResult>>(new Map());
  const imageLanguageContextRef = useRef(false);
  const localRecordingPackRef = useRef<InstalledModelPack | null>(null);

  useEffect(() => {
    if (smokeScene !== 'main-keyboard') return;
    const timer = setTimeout(() => sourceInputRef.current?.focus(), 450);
    return () => clearTimeout(timer);
  }, [smokeScene]);

  const applySmokeScene = useCallback((scene: SmokeScene, options: SmokeSceneOptions = {}) => {
    writeSmokeSceneAck(scene);
    setSmokeScene(scene);
    setSmokeModelPackManifestUrl(options.modelPackManifestUrl?.trim() || null);
    setSmokeTextProviderEndpoint(options.textProviderEndpoint?.trim() || null);
    setSmokeImageProviderEndpoint(options.imageProviderEndpoint?.trim() || null);
    setSmokeSpeechProviderEndpoint(options.speechProviderEndpoint?.trim() || null);
    setSettings(scene === 'settings-image' ? SMOKE_IMAGE_SETTINGS : SMOKE_SETTINGS);
    setSettingsInitialJumpId(
      scene === 'settings-image' ? 'image' : scene === 'settings-config' ? 'config' : null
    );
    setShowWelcomeWizard(false);
    setShowSettings(
      scene === 'settings'
      || scene === 'settings-image'
      || scene === 'settings-config'
      || scene === 'settings-qr'
      || scene === 'settings-qr-import'
      || scene === 'settings-config-roundtrip'
      || scene === 'settings-hunyuan-output'
      || scene === 'settings-local'
      || scene === 'settings-model-packs'
      || scene === 'settings-model-pack-install'
    );
    setShowSmokeQrScanner(false);
    setShowDeviceQA(false);
    setShowImageLightbox(false);
    setLanguagePickerTarget(null);
    setBusyState('idle');
    setNativeSpeechActive(false);
    setNativeSpeechMode(null);
    setNotice(`Smoke preview: ${scene}`);
    setFuriganaTokens(null);
    setIsFuriganaLoading(false);
    imageLanguageContextRef.current = false;
    setImageBase64(null);
    setImageUri(null);
    setImageSize(null);
    setOverlayItems([]);

    if (scene === 'settings') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('駅はどこですか');
      setTargetText('Where is the station?');
      return;
    }

    if (scene === 'config-guidance') {
      setSettings(normalizeSettings(DEFAULT_SETTINGS));
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('explanation');
      setImageMode('vlm');
      setResultFormat('markdown');
      setSourceText('駅はどこですか');
      setTargetText('');
      setNotice('Smoke preview: missing General AI guidance.');
      return;
    }

    if (scene === 'settings-qr') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('設定をQRで共有したいです');
      setTargetText('I want to share settings by QR code.');
      return;
    }

    if (scene === 'settings-qr-import') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('QRから設定を読み込みます');
      setTargetText('Import settings from a QR code.');
      return;
    }

    if (scene === 'settings-config-roundtrip') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('設定を保存して読み戻します');
      setTargetText('Export, import, save, and reload settings.');
      return;
    }

    if (scene === 'settings-hunyuan-output') {
      setSettings(normalizeSettings({
        ...SMOKE_SETTINGS,
        provider: 'custom',
        endpoint: SILICONFLOW_ENDPOINT,
        modelName: HUNYUAN_MT_MODEL,
        apiKey: 'ios-smoke-hunyuan-key',
        translation: {
          outputMode: 'structured',
        },
      }));
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('Hunyuan-MT output mode');
      setTargetText('Hunyuan-MT should use plain output.');
      return;
    }

    if (scene === 'settings-local') {
      setSettings(SMOKE_LOCAL_RUNTIME_SETTINGS);
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('ocr');
      setResultFormat('plain');
      setSourceText('ローカル認識を確認します');
      setTargetText('Checking local recognition.');
      return;
    }

    if (scene === 'settings-model-packs') {
      setSettings(SMOKE_LOCAL_RUNTIME_SETTINGS);
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('ocr');
      setResultFormat('plain');
      setSourceText('モデルパックを確認します');
      setTargetText('Checking model packs.');
      return;
    }

    if (scene === 'settings-model-pack-install') {
      setSettings(SMOKE_LOCAL_RUNTIME_SETTINGS);
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('ocr');
      setResultFormat('plain');
      setSourceText('小さなモデルパックをインストールします');
      setTargetText('Installing a tiny model pack.');
      return;
    }

    if (scene === 'text-provider-smoke') {
      const endpoint = options.textProviderEndpoint?.trim() || SMOKE_SETTINGS.generalAI.endpoint;
      setSettings(createTextProviderSmokeSettings(endpoint));
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('qa');
      setImageMode('vlm');
      setResultFormat('markdown');
      setSourceText('駅はどこですか');
      setTargetText('Running native provider smoke...');
      setNotice('Smoke: running Translation, Explanation, and Quick Q&A against a local mock provider.');
      return;
    }

    if (scene === 'image-provider-smoke') {
      const endpoint = options.imageProviderEndpoint?.trim() || SMOKE_SETTINGS.generalAI.endpoint;
      setSettings(createImageProviderSmokeSettings(endpoint));
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('ocr');
      setResultFormat('markdown');
      setSourceText('カフェ');
      setTargetText('Running native image provider smoke...');
      setImageUri(SMOKE_IMAGE_URI);
      setImageBase64(SMOKE_IMAGE_URI);
      setImageSize({ width: 400, height: 300 });
      setNotice('Smoke: running VLM, OCR, and OCR-line translation against a local mock provider.');
      return;
    }

    if (scene === 'speech-provider-smoke') {
      const endpoint = options.speechProviderEndpoint?.trim() || SMOKE_SETTINGS.generalAI.endpoint;
      setSettings(createSpeechProviderSmokeSettings(endpoint));
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('');
      setTargetText('Running native speech provider smoke...');
      setNotice('Smoke: running cloud ASR against a local mock provider.');
      return;
    }

    if (scene === 'setup-choice' || scene === 'setup-manual' || scene === 'setup-import') {
      setShowWelcomeWizard(true);
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('');
      setTargetText('');
      setNotice(`Smoke preview: first-run ${scene.replace('setup-', '')}`);
      return;
    }

    if (scene === 'markdown') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('explanation');
      setImageMode('vlm');
      setResultFormat('markdown');
      setSourceText('駅はどこですか');
      setTargetText([
        '## Phrase breakdown',
        '- **駅** means station.',
        '- **どこ** asks where.',
        '1. Use `すみません` first for politeness.',
        '```',
        '駅はどこですか',
        '```',
      ].join('\n'));
      return;
    }

    if (scene === 'longtext') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('qa');
      setImageMode('vlm');
      setResultFormat('markdown');
      setSourceText([
        '旅行中に駅員さんへ相談したいです。',
        '大きな荷物があります。成田空港まで行きたいですが、乗り換えが少なくて、できればエレベーターを使えるルートを教えてください。',
        'あと、切符を買う場所と、改札で何を見せればいいかも知りたいです。',
      ].join('\n\n'));
      setTargetText([
        '## Suggested phrase',
        'すみません、成田空港まで行きたいです。荷物が大きいので、乗り換えが少なくてエレベーターを使える行き方を教えてください。',
        '',
        '## What to ask next',
        '- Ticket counter: ask `切符はどこで買えますか`.',
        '- Gate check: show the ticket or IC card and ask staff before tapping.',
        '- Accessibility: say **エレベーターを使いたいです** if stairs are difficult.',
      ].join('\n'));
      return;
    }

    if (scene === 'image') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('ocr');
      setResultFormat('plain');
      setSourceText('カフェ\n入口');
      setTargetText('Cafe\nEntrance');
      setImageUri(SMOKE_IMAGE_URI);
      setImageBase64(SMOKE_IMAGE_URI);
      setImageSize({ width: 400, height: 300 });
      setOverlayItems([
        {
          id: 'smoke-cafe',
          source: 'カフェ',
          translation: 'Cafe',
          location: [48, 54, 184, 54, 184, 112, 48, 112],
        },
        {
          id: 'smoke-entry',
          source: '入口',
          translation: 'Entrance',
          rotate_rect: [275, 194, 150, 52, -6],
        },
      ]);
      return;
    }

    if (scene === 'image-lightbox') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('ocr');
      setResultFormat('plain');
      setSourceText('カフェ\n入口');
      setTargetText('Cafe\nEntrance');
      setImageUri(SMOKE_IMAGE_URI);
      setImageBase64(SMOKE_IMAGE_URI);
      setImageSize({ width: 400, height: 300 });
      setOverlayItems([
        {
          id: 'smoke-cafe-lightbox',
          source: 'カフェ',
          translation: 'Cafe',
          location: [48, 54, 184, 54, 184, 112, 48, 112],
        },
        {
          id: 'smoke-entry-lightbox',
          source: '入口',
          translation: 'Entrance',
          rotate_rect: [275, 194, 150, 52, -6],
        },
      ]);
      setShowImageLightbox(true);
      return;
    }

    if (scene === 'language-picker') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('駅はどこですか');
      setTargetText('Where is the station?');
      setLanguagePickerTarget('target');
      return;
    }

    if (scene === 'qr-scanner') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('QRコードで設定を読み込みます');
      setTargetText('Import settings by QR code.');
      setShowSmokeQrScanner(true);
      return;
    }

    if (scene === 'device-qa') {
      setSourceLang('ja');
      setTargetLang('en');
      setTextMode('translation');
      setImageMode('ocr');
      setResultFormat('plain');
      setSourceText('真机チェック');
      setTargetText('Device QA');
      setShowDeviceQA(true);
      return;
    }

    if (scene === 'furigana') {
      setSourceLang('en');
      setTargetLang('ja');
      setTextMode('translation');
      setImageMode('vlm');
      setResultFormat('plain');
      setSourceText('Where is the station?');
      setTargetText('駅はどこですか');
      setFuriganaTokens(SMOKE_FURIGANA_TOKENS);
      return;
    }

    setSourceLang('ja');
    setTargetLang('en');
    setTextMode('translation');
    setImageMode('vlm');
    setResultFormat('plain');
    setSourceText('駅はどこですか');
    setTargetText('Where is the station?');
  }, []);

  useEffect(() => {
    let isMounted = true;
    loadMobileSettings()
      .then((stored) => {
        if (isMounted && stored) {
          setSettings(stored);
        } else if (isMounted) {
          setShowWelcomeWizard(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setResultCopied(false);
    if (resultCopyResetTimerRef.current) {
      clearTimeout(resultCopyResetTimerRef.current);
      resultCopyResetTimerRef.current = null;
    }

    return () => {
      if (resultCopyResetTimerRef.current) {
        clearTimeout(resultCopyResetTimerRef.current);
        resultCopyResetTimerRef.current = null;
      }
    };
  }, [targetText]);

  useEffect(() => {
    if (smokeScene !== 'settings-config-roundtrip') {
      return;
    }

    let isCancelled = false;

    const runSmoke = async () => {
      const password = 'tabitomo-config-roundtrip-smoke';
      const expected = normalizeSettings({
        ...SMOKE_SETTINGS,
        generalAI: {
          ...SMOKE_SETTINGS.generalAI,
          endpoint: 'https://ios-smoke.example.test/v1',
          modelName: 'ios-smoke-general-roundtrip',
          apiKey: 'ios-smoke-general-key',
        },
        provider: 'custom',
        endpoint: 'https://ios-smoke-translation.example.test/v1',
        modelName: 'ios-smoke-translation-roundtrip',
        apiKey: 'ios-smoke-translation-key',
        translation: {
          ...SMOKE_SETTINGS.translation,
          outputMode: 'plain',
        },
        speechRecognition: {
          ...SMOKE_SETTINGS.speechRecognition,
          provider: 'siliconflow',
          endpoint: 'https://ios-smoke-speech.example.test/v1',
          modelName: 'ios-smoke-speech-roundtrip',
          apiKey: 'ios-smoke-speech-key',
        },
        imageOCR: {
          ...SMOKE_SETTINGS.imageOCR,
          provider: 'custom',
          endpoint: 'https://ios-smoke-ocr.example.test/v1',
          modelName: 'ios-smoke-ocr-roundtrip',
          apiKey: 'ios-smoke-ocr-key',
          useGeneralAI: false,
        },
        vlm: {
          ...SMOKE_SETTINGS.vlm,
          useGeneralAI: false,
          useCustom: true,
          endpoint: 'https://ios-smoke-vlm.example.test/v1',
          modelName: 'ios-smoke-vlm-roundtrip',
          apiKey: 'ios-smoke-vlm-key',
          enableThinking: true,
        },
      });
      const buildChecks = (observed: AISettings) => ({
        generalModel: observed.generalAI.modelName === expected.generalAI.modelName,
        generalEndpoint: observed.generalAI.endpoint === expected.generalAI.endpoint,
        translationModel: observed.modelName === expected.modelName,
        translationOutputMode: observed.translation.outputMode === expected.translation.outputMode,
        speechProvider: observed.speechRecognition.provider === expected.speechRecognition.provider,
        speechModel: observed.speechRecognition.modelName === expected.speechRecognition.modelName,
        imageOCRProvider: observed.imageOCR.provider === expected.imageOCR.provider,
        imageOCRModel: observed.imageOCR.modelName === expected.imageOCR.modelName,
        vlmMode: observed.vlm.useCustom === expected.vlm.useCustom && observed.vlm.modelName === expected.vlm.modelName,
        apiKeysPersisted: observed.generalAI.apiKey === expected.generalAI.apiKey
          && observed.apiKey === expected.apiKey
          && observed.speechRecognition.apiKey === expected.speechRecognition.apiKey
          && observed.imageOCR.apiKey === expected.imageOCR.apiKey
          && observed.vlm.apiKey === expected.vlm.apiKey,
      });
      const assertChecks = (checks: Record<string, boolean>, label: string) => {
        const failedChecks = Object.entries(checks)
          .filter(([, passed]) => !passed)
          .map(([name]) => name);

        if (failedChecks.length > 0) {
          throw new Error(`${label} mismatch: ${failedChecks.join(', ')}`);
        }
      };
      const redactedSettingsSummary = (observed: AISettings) => ({
        generalAI: {
          apiFormat: observed.generalAI.apiFormat,
          endpoint: observed.generalAI.endpoint,
          modelName: observed.generalAI.modelName,
          hasApiKey: Boolean(observed.generalAI.apiKey),
        },
        translation: {
          provider: observed.provider,
          endpoint: observed.endpoint,
          modelName: observed.modelName,
          outputMode: observed.translation.outputMode,
          hasApiKey: Boolean(observed.apiKey),
        },
        speech: {
          provider: observed.speechRecognition.provider,
          endpoint: observed.speechRecognition.endpoint || null,
          modelName: observed.speechRecognition.modelName || null,
          hasApiKey: Boolean(observed.speechRecognition.apiKey),
        },
        imageOCR: {
          provider: observed.imageOCR.provider,
          useGeneralAI: observed.imageOCR.useGeneralAI,
          endpoint: observed.imageOCR.endpoint,
          modelName: observed.imageOCR.modelName,
          hasApiKey: Boolean(observed.imageOCR.apiKey),
        },
        vlm: {
          useGeneralAI: observed.vlm.useGeneralAI,
          useCustom: observed.vlm.useCustom,
          endpoint: observed.vlm.endpoint || null,
          modelName: observed.vlm.modelName || null,
          enableThinking: observed.vlm.enableThinking,
          hasApiKey: Boolean(observed.vlm.apiKey),
        },
      });
      const isMissingEntitlementError = (error: unknown) => (
        error instanceof Error && /required entitlement/i.test(error.message)
      );

      writeConfigRoundTripSmokeResult({
        passed: false,
        status: 'running',
      });

      try {
        if (!isCancelled) {
          setNotice('Smoke: exporting encrypted config...');
        }

        const payload = await exportConfigPayload(expected, password);
        const imported = await importConfigPayload(`tabitomo-config:${payload}`, password);
        const importChecks = buildChecks(imported);
        assertChecks(importChecks, 'Config import');

        let loaded: AISettings | null = null;
        let secureStorageStatus = 'persisted';

        try {
          await saveMobileSettings(imported);
          loaded = await loadMobileSettings();
        } catch (storageError) {
          if (!isMissingEntitlementError(storageError)) {
            throw storageError;
          }
          secureStorageStatus = 'skipped-secure-store-entitlement';
        }

        if (!loaded && secureStorageStatus === 'persisted') {
          throw new Error('Saved settings did not load.');
        }

        const observed = loaded || imported;
        const checks = buildChecks(observed);
        assertChecks(checks, secureStorageStatus === 'persisted' ? 'Config round-trip' : 'Config import');

        if (!isCancelled) {
          setSettings(observed);
          setNotice(secureStorageStatus === 'persisted'
            ? 'Smoke: settings export/import/save/load round-trip passed.'
            : 'Smoke: config import passed; unsigned simulator skipped SecureStore persistence.');
        }

        writeConfigRoundTripSmokeResult({
          passed: true,
          status: secureStorageStatus === 'persisted' ? 'passed' : 'skipped-secure-store-entitlement',
          payloadLength: payload.length,
          importedWithPrefix: true,
          secureStorage: {
            attempted: true,
            persisted: secureStorageStatus === 'persisted',
            reason: secureStorageStatus === 'persisted'
              ? null
              : 'Unsigned Release simulator build lacks the keychain entitlement required by expo-secure-store.',
          },
          importChecks,
          checks,
          persisted: secureStorageStatus === 'persisted',
          settings: redactedSettingsSummary(observed),
          privacy: {
            redacted: true,
            payloadOmitted: true,
            apiKeysOmitted: true,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Config round-trip smoke failed.';
        if (!isCancelled) {
          setNotice(`Smoke failed: ${message}`);
        }
        writeConfigRoundTripSmokeResult({
          passed: false,
          status: 'failed',
          error: message,
          privacy: {
            redacted: true,
            payloadOmitted: true,
            apiKeysOmitted: true,
          },
        });
      }
    };

    void runSmoke();

    return () => {
      isCancelled = true;
    };
  }, [smokeScene]);

  useEffect(() => {
    if (smokeScene !== 'text-provider-smoke') {
      return;
    }

    let isCancelled = false;

    const collectStream = async (stream: AsyncGenerator<string, void, unknown>) => {
      let text = '';
      for await (const chunk of stream) {
        text += chunk;
      }
      return text;
    };

    const runSmoke = async () => {
      const endpoint = smokeTextProviderEndpoint || SMOKE_SETTINGS.generalAI.endpoint;
      const smokeSettings = createTextProviderSmokeSettings(endpoint);
      const expected = {
        translation: 'Where is the station?',
        explanation: 'This asks where the station is.',
        qa: 'Use: Where is the station?',
      };

      writeTextProviderSmokeResult({
        passed: false,
        status: 'running',
        privacy: {
          redacted: true,
          apiKeysOmitted: true,
        },
      });

      try {
        if (!isCancelled) {
          setSettings(smokeSettings);
          setBusyState('translating');
          setResultFormat('markdown');
          setTargetText('Running native provider smoke...');
          setNotice('Smoke: contacting local provider...');
        }

        const translation = await translateText('駅はどこですか', 'ja', 'en', smokeSettings);
        const explanation = await collectStream(explainTextStream('駅はどこですか', 'ja', 'en', smokeSettings));
        const qa = await collectStream(answerQuestionStream('How do I ask where the station is?', 'en', 'ja', smokeSettings));
        const checks = {
          translation: translation.trim() === expected.translation,
          explanation: explanation.trim() === expected.explanation,
          qa: qa.trim() === expected.qa,
        };
        const failed = Object.entries(checks)
          .filter(([, passed]) => !passed)
          .map(([name]) => name);

        if (failed.length > 0) {
          throw new Error(`Provider smoke mismatch: ${failed.join(', ')}`);
        }

        if (!isCancelled) {
          setTargetText([
            '## Native provider smoke passed',
            `- Translation: ${translation}`,
            `- Explanation stream: ${explanation}`,
            `- Quick Q&A stream: ${qa}`,
          ].join('\n'));
          setNotice('Smoke: native provider flows passed.');
        }

        writeTextProviderSmokeResult({
          passed: true,
          status: 'passed',
          checks,
          outputLengths: {
            translation: translation.length,
            explanation: explanation.length,
            qa: qa.length,
          },
          outputs: {
            translation,
            explanation,
            qa,
          },
          privacy: {
            redacted: true,
            apiKeysOmitted: true,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Native provider smoke failed.';
        if (!isCancelled) {
          setTargetText(`Native provider smoke failed.\n\n${message}`);
          setNotice(`Smoke failed: ${message}`);
        }
        writeTextProviderSmokeResult({
          passed: false,
          status: 'failed',
          error: message,
          privacy: {
            redacted: true,
            apiKeysOmitted: true,
          },
        });
      } finally {
        if (!isCancelled) {
          setBusyState('idle');
        }
      }
    };

    void runSmoke();

    return () => {
      isCancelled = true;
    };
  }, [smokeScene, smokeTextProviderEndpoint]);

  useEffect(() => {
    if (smokeScene !== 'image-provider-smoke') {
      return;
    }

    let isCancelled = false;

    const collectStream = async (stream: AsyncGenerator<string, void, unknown>) => {
      let text = '';
      for await (const chunk of stream) {
        text += chunk;
      }
      return text;
    };

    const runSmoke = async () => {
      const endpoint = smokeImageProviderEndpoint || SMOKE_SETTINGS.generalAI.endpoint;
      const smokeSettings = createImageProviderSmokeSettings(endpoint);
      const expected = {
        vlm: 'Cafe\nEntrance',
        ocrText: 'カフェ',
        ocrTranslation: 'Cafe',
      };

      writeImageProviderSmokeResult({
        passed: false,
        status: 'running',
        privacy: {
          redacted: true,
          apiKeysOmitted: true,
          imagePayloadOmitted: true,
        },
      });

      try {
        if (!isCancelled) {
          setSettings(smokeSettings);
          setBusyState('image');
          setResultFormat('markdown');
          setImageMode('ocr');
          setImageUri(SMOKE_IMAGE_URI);
          setImageBase64(SMOKE_IMAGE_URI);
          setImageSize({ width: 400, height: 300 });
          setOverlayItems([]);
          setTargetText('Running native image provider smoke...');
          setNotice('Smoke: contacting local image provider...');
        }

        const vlm = await collectStream(streamTranslateImageWithVLM(SMOKE_IMAGE_URI, 'ja', 'en', smokeSettings));
        const ocrLines = await performOCR(SMOKE_IMAGE_URI, smokeSettings);
        const translatedItems = await Promise.all(
          ocrLines.map(async (item, index) => ({
            id: `${index}-${item.text.slice(0, 10)}`,
            source: item.text,
            translation: await translateText(item.text, 'ja', 'en', smokeSettings),
            location: item.location,
            rotate_rect: item.rotate_rect,
          }))
        );
        const firstLine = ocrLines[0];
        const firstTranslation = translatedItems[0]?.translation || '';
        const checks = {
          vlm: vlm.trim() === expected.vlm,
          ocrCount: ocrLines.length === 1,
          ocrText: firstLine?.text === expected.ocrText,
          ocrGeometry: Array.isArray(firstLine?.location) && firstLine.location.length === 8,
          ocrTranslation: firstTranslation.trim() === expected.ocrTranslation,
        };
        const failed = Object.entries(checks)
          .filter(([, passed]) => !passed)
          .map(([name]) => name);

        if (failed.length > 0) {
          throw new Error(`Image provider smoke mismatch: ${failed.join(', ')}`);
        }

        if (!isCancelled) {
          setOverlayItems(translatedItems);
          setSourceText(ocrLines.map((item) => item.text).join('\n'));
          setTargetText([
            '## Native image provider smoke passed',
            '',
            '### VLM',
            vlm,
            '',
            '### OCR overlay',
            translatedItems.map((item) => `- ${item.source} -> ${item.translation}`).join('\n'),
          ].join('\n'));
          setNotice('Smoke: native image provider flows passed.');
        }

        writeImageProviderSmokeResult({
          passed: true,
          status: 'passed',
          checks,
          outputLengths: {
            vlm: vlm.length,
            ocrLines: ocrLines.length,
            translations: translatedItems.length,
          },
          outputs: {
            vlm,
            ocrTexts: ocrLines.map((item) => item.text),
            translations: translatedItems.map((item) => item.translation),
          },
          geometry: ocrLines.map((item) => ({
            hasLocation: Array.isArray(item.location),
            hasRotateRect: Array.isArray(item.rotate_rect),
          })),
          privacy: {
            redacted: true,
            apiKeysOmitted: true,
            imagePayloadOmitted: true,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Native image provider smoke failed.';
        if (!isCancelled) {
          setTargetText(`Native image provider smoke failed.\n\n${message}`);
          setNotice(`Smoke failed: ${message}`);
        }
        writeImageProviderSmokeResult({
          passed: false,
          status: 'failed',
          error: message,
          privacy: {
            redacted: true,
            apiKeysOmitted: true,
            imagePayloadOmitted: true,
          },
        });
      } finally {
        if (!isCancelled) {
          setBusyState('idle');
        }
      }
    };

    void runSmoke();

    return () => {
      isCancelled = true;
    };
  }, [smokeImageProviderEndpoint, smokeScene]);

  useEffect(() => {
    if (smokeScene !== 'speech-provider-smoke') {
      return;
    }

    let isCancelled = false;

    const runSmoke = async () => {
      const endpoint = smokeSpeechProviderEndpoint || SMOKE_SETTINGS.generalAI.endpoint;
      const smokeSettings = createSpeechProviderSmokeSettings(endpoint);
      const expectedTranscript = '駅はどこですか';

      writeSpeechProviderSmokeResult({
        passed: false,
        status: 'running',
        privacy: {
          redacted: true,
          apiKeysOmitted: true,
          localFileUriOmitted: true,
        },
      });

      try {
        if (!isCancelled) {
          setSettings(smokeSettings);
          setBusyState('transcribing');
          setSourceText('');
          setTargetText('Running native speech provider smoke...');
          setNotice('Smoke: contacting local speech provider...');
        }

        const audioFile = new File(Paths.document, SMOKE_SPEECH_AUDIO_FILE_NAME);
        audioFile.create({ overwrite: true });
        audioFile.write(createSyntheticSpeechWav());

        const transcript = await transcribeAudioFile(audioFile, smokeSettings);
        const checks = {
          transcript: transcript.trim() === expectedTranscript,
          provider: smokeSettings.speechRecognition.provider === 'siliconflow',
          model: smokeSettings.speechRecognition.modelName === 'tabitomo-native-speech-smoke',
        };
        const failed = Object.entries(checks)
          .filter(([, passed]) => !passed)
          .map(([name]) => name);

        if (failed.length > 0) {
          throw new Error(`Speech provider smoke mismatch: ${failed.join(', ')}`);
        }

        if (!isCancelled) {
          setSourceText(transcript);
          setTargetText(`Speech provider smoke passed.\n\nTranscript: ${transcript}`);
          setNotice('Smoke: native speech provider flow passed.');
        }

        writeSpeechProviderSmokeResult({
          passed: true,
          status: 'passed',
          checks,
          transcriptLength: transcript.length,
          transcript,
          provider: {
            name: smokeSettings.speechRecognition.provider,
            modelName: smokeSettings.speechRecognition.modelName,
            hasApiKey: Boolean(smokeSettings.speechRecognition.apiKey),
          },
          privacy: {
            redacted: true,
            apiKeysOmitted: true,
            localFileUriOmitted: true,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Native speech provider smoke failed.';
        if (!isCancelled) {
          setTargetText(`Native speech provider smoke failed.\n\n${message}`);
          setNotice(`Smoke failed: ${message}`);
        }
        writeSpeechProviderSmokeResult({
          passed: false,
          status: 'failed',
          error: message,
          privacy: {
            redacted: true,
            apiKeysOmitted: true,
            localFileUriOmitted: true,
          },
        });
      } finally {
        if (!isCancelled) {
          setBusyState('idle');
        }
      }
    };

    void runSmoke();

    return () => {
      isCancelled = true;
    };
  }, [smokeScene, smokeSpeechProviderEndpoint]);

  useEffect(() => {
    if (smokeScene !== 'local-model-runtime-smoke') {
      return;
    }

    let isCancelled = false;

    const runSmoke = async () => {
      writeLocalModelRuntimeSmokeResult({
        passed: false,
        status: 'running',
        privacy: {
          mediaOmitted: true,
          recognizedTextOmitted: true,
          localFileUrisOmitted: true,
        },
      });

      try {
        if (!isCancelled) {
          setBusyState('transcribing');
          setSourceText('');
          setTargetText('Downloading and validating fixed local models...');
          setNotice('Smoke: downloading Whisper Base...');
        }

        let installed = await loadInstalledModelPacks();
        const installAndValidate = async (modelId: OfflineModelId) => {
          const result = await installOfflineModel({
            modelId,
            existingInstalled: installed,
            onStatus: (status) => {
              if (!isCancelled) setNotice(`Smoke ${modelId}: ${status}`);
            },
            validateInstalledPack: async (pack) => {
              await unloadNativeLocalModelAsync(modelId, pack.rootUri);
              try {
                await validateNativeLocalModelPackAsync(modelId, pack.rootUri);
              } catch (error) {
                await unloadNativeLocalModelAsync(modelId, pack.rootUri);
                throw error;
              }
            },
          });
          installed = result.installed;
          await saveInstalledModelPacks(installed);
          return result.installedPack;
        };

        const audioFile = new File(Paths.document, 'tabitomo-local-model-runtime-smoke.wav');
        audioFile.create({ overwrite: true });
        audioFile.write(createSyntheticSpeechWav());

        const whisperPack = await installAndValidate('whisper-base');
        const whisper = await transcribeWithNativeLocalModelAsync(
          audioFile.uri,
          'whisper-base',
          whisperPack.rootUri,
          { language: 'auto', task: 'transcribe' }
        );

        const senseVoicePack = await installAndValidate('sensevoice-small');
        const senseVoice = await transcribeWithNativeLocalModelAsync(
          audioFile.uri,
          'sensevoice-small',
          senseVoicePack.rootUri,
          { language: 'auto', useInverseTextNormalization: true }
        );

        const imageBase64 = DEVICE_QA_PROVIDER_IMAGE_URI.split(',')[1] || '';
        if (!imageBase64 || imageBase64.length % 4 !== 0) {
          throw new Error('The deterministic CAFE PNG fixture is not valid base64.');
        }
        const imageBinary = atob(imageBase64);
        const imageBytes = Uint8Array.from(imageBinary, (character) => character.charCodeAt(0));
        const imageFile = new File(Paths.document, 'tabitomo-local-model-runtime-smoke.png');
        imageFile.create({ overwrite: true });
        imageFile.write(imageBytes);

        const ocrPack = await installAndValidate('ppocr-v6-small');
        const ocr = await recognizeTextWithNativePPOCRAsync(imageFile.uri, 'ppocr-v6-small', ocrPack.rootUri);
        if (ocr.items.length === 0) {
          throw new Error('PP-OCR completed but detected no text in the deterministic CAFE fixture.');
        }

        const result = {
          passed: true,
          status: 'passed',
          models: {
            whisper: {
              modelId: whisper.modelId,
              runtime: whisper.runtime,
              durationMs: whisper.durationMs,
              transcriptLength: whisper.text.trim().length,
            },
            senseVoice: {
              modelId: senseVoice.modelId,
              runtime: senseVoice.runtime,
              durationMs: senseVoice.durationMs,
              transcriptLength: senseVoice.text.trim().length,
            },
            ppocr: {
              modelId: ocr.modelId,
              runtime: ocr.runtime,
              durationMs: ocr.durationMs,
              lines: ocr.items.length,
            },
          },
          privacy: {
            mediaOmitted: true,
            recognizedTextOmitted: true,
            localFileUrisOmitted: true,
          },
        };
        writeLocalModelRuntimeSmokeResult(result);
        if (!isCancelled) {
          setBusyState('idle');
          setTargetText([
            '## Local model runtime smoke passed',
            `- Whisper Base: ${whisper.durationMs} ms`,
            `- SenseVoice Small: ${senseVoice.durationMs} ms`,
            `- PP-OCR v6 Small: ${ocr.durationMs} ms, ${ocr.items.length} line(s)`,
          ].join('\n'));
          setNotice('Smoke: all fixed local models executed successfully.');
        }
      } catch (error) {
        const message = (error instanceof Error ? error.message : 'Local model runtime smoke failed.')
          .replace(/file:\/\/[^\s"')]+/g, '[local-file-uri]');
        writeLocalModelRuntimeSmokeResult({
          passed: false,
          status: 'failed',
          error: message,
          privacy: {
            mediaOmitted: true,
            recognizedTextOmitted: true,
            localFileUrisOmitted: true,
          },
        });
        if (!isCancelled) {
          setBusyState('idle');
          setTargetText(`Local model runtime smoke failed.\n\n${message}`);
          setNotice(`Smoke failed: ${message}`);
        }
      }
    };

    void runSmoke();

    return () => {
      isCancelled = true;
    };
  }, [smokeScene]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const applySmokeURL = (url: string | null) => {
      if (!url) {
        return;
      }

      const scene = parseSmokeScene(url);
      if (!scene) {
        return;
      }

      applySmokeScene(scene);
    };

    Linking.getInitialURL().then(applySmokeURL).catch(() => undefined);
    const subscription = Linking.addEventListener('url', (event) => applySmokeURL(event.url));

    return () => {
      subscription.remove();
    };
  }, [applySmokeScene, isReady]);

  useEffect(() => {
    if (!isReady || Platform.OS === 'web') {
      return;
    }

    let isMounted = true;
    const smokeSceneFile = new File(Paths.document, SMOKE_SCENE_FILE_NAME);

    if (!smokeSceneFile.exists) {
      return;
    }

    smokeSceneFile
      .json()
      .then((payload) => {
        if (!isMounted || !payload || typeof payload !== 'object') {
          return;
        }

        const scene = (payload as { scene?: unknown }).scene;
        const modelPackManifestUrl = (payload as { modelPackManifestUrl?: unknown }).modelPackManifestUrl;
        const textProviderEndpoint = (payload as { textProviderEndpoint?: unknown }).textProviderEndpoint;
        const imageProviderEndpoint = (payload as { imageProviderEndpoint?: unknown }).imageProviderEndpoint;
        const speechProviderEndpoint = (payload as { speechProviderEndpoint?: unknown }).speechProviderEndpoint;
        if (typeof scene === 'string') {
          const parsedScene = parseSmokeScene(`tabitomo://smoke?scene=${encodeURIComponent(scene)}`);
          if (parsedScene) {
            applySmokeScene(parsedScene, {
              modelPackManifestUrl: typeof modelPackManifestUrl === 'string' ? modelPackManifestUrl : undefined,
              textProviderEndpoint: typeof textProviderEndpoint === 'string' ? textProviderEndpoint : undefined,
              imageProviderEndpoint: typeof imageProviderEndpoint === 'string' ? imageProviderEndpoint : undefined,
              speechProviderEndpoint: typeof speechProviderEndpoint === 'string' ? speechProviderEndpoint : undefined,
            });
          }
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [applySmokeScene, isReady]);

  useEffect(() => {
    const resultSubscription = addNativeSpeechResultListener((event) => {
      setSourceText(event.text);
      if (event.isFinal) {
        setNotice('Speech transcribed.');
      }
    });
    const errorSubscription = addNativeSpeechErrorListener((event) => {
      setNativeSpeechActive(false);
      setNativeSpeechMode(null);
      setBusyState('idle');
      setNotice(event.message);
      Alert.alert('tabitomo', event.message);
    });
    const stateSubscription = addNativeSpeechStateListener((event) => {
      setNativeSpeechActive(event.state === 'recording');
      if (event.state === 'idle') {
        setNativeSpeechMode(null);
        setBusyState((current) => current === 'recording' ? 'idle' : current);
      }
    });

    return () => {
      resultSubscription?.remove();
      errorSubscription?.remove();
      stateSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (smokeScene === 'furigana') {
      return;
    }

    if (!targetText || targetLang !== 'ja' || resultFormat !== 'plain' || !hasJapaneseText(targetText)) {
      setFuriganaTokens(null);
      setIsFuriganaLoading(false);
      return;
    }

    const abortController = new AbortController();
    let isMounted = true;
    setIsFuriganaLoading(true);

    annotateJapaneseFurigana(targetText, settings, abortController.signal)
      .then((tokens) => {
        if (isMounted) {
          setFuriganaTokens(hasFuriganaReadings(tokens) ? tokens : null);
        }
      })
      .catch((error) => {
        if (isMounted && !(error instanceof Error && error.name === 'AbortError')) {
          setFuriganaTokens(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsFuriganaLoading(false);
        }
      });

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [resultFormat, settings, smokeScene, targetLang, targetText]);

  const canRunTextMode = useMemo(() => {
    const hasText = Boolean(sourceText.trim());
    if (textMode === 'translation') {
      return hasText && isTextTranslationConfigured(settings);
    }
    return hasText && hasGeneralAISettings(settings);
  }, [settings, sourceText, textMode]);

  const ResultIcon = textMode === 'qa'
    ? MessageCircle
    : textMode === 'explanation'
      ? ScanText
      : Sparkles;

  const openSettingsAt = useCallback((target: SettingsJumpId | null = null) => {
    setSettingsInitialJumpId(target);
    setShowSettings(true);
  }, []);

  const textConfigGuidance = useMemo<ConfigGuidance | null>(() => {
    if (textMode === 'translation' && !isTextTranslationConfigured(settings)) {
      return {
        title: 'Translation setup needed',
        message: 'Choose a provider in Settings to start translating.',
        actionLabel: 'Open Settings',
        target: 'translation',
      };
    }

    if (textMode !== 'translation' && !hasGeneralAISettings(settings)) {
      return {
        title: `${textModeTitle(textMode)} setup needed`,
        message: 'Add General AI in Settings to use explanations, Q&A, and furigana.',
        actionLabel: 'Open Settings',
        target: 'general',
      };
    }

    return null;
  }, [settings, textMode]);

  const activeConfigGuidance = configGuidanceOverride ?? textConfigGuidance;

  const showError = (message: string) => {
    setNotice(message);
    Alert.alert('tabitomo', message);
  };

  const handleSaveSettings = async (nextSettings: AISettings) => {
    const normalized = normalizeSettings(nextSettings);
    const persisted = await saveMobileSettings(normalized);
    setSettings(persisted);
    setShowSettings(false);
    setSettingsInitialJumpId(null);
    setConfigGuidanceOverride(null);
    setShowWelcomeWizard(false);
    setNotice('Settings saved securely on this device.');
  };

  const handleWelcomeComplete = async (nextSettings: AISettings) => {
    const normalized = normalizeSettings(nextSettings);
    const persisted = await saveMobileSettings(normalized);
    setSettings(persisted);
    setShowWelcomeWizard(false);
    setNotice('Setup saved securely on this device.');
  };

  const handleWelcomeSkip = () => {
    setShowWelcomeWizard(false);
    setNotice(null);
  };

  useEffect(() => {
    if (!notice || smokeScene) {
      return;
    }

    const timer = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [notice, smokeScene]);

  useEffect(() => {
    setConfigGuidanceOverride(null);
  }, [imageMode, settings, textMode]);

  const handleSelectTextMode = (nextMode: TextMode) => {
    if (nextMode === textMode) {
      return;
    }

    if (imageLanguageContextRef.current) {
      imageLanguageContextRef.current = false;
      setSourceLang(targetLang);
      setTargetLang(sourceLang);
    }

    textActionAbortRef.current?.abort();
    textActionAbortRef.current = null;
    if (textAutoRunTimerRef.current) {
      clearTimeout(textAutoRunTimerRef.current);
      textAutoRunTimerRef.current = null;
    }
    lastAutoTextRunKeyRef.current = null;
    setTextMode(nextMode);
    setTargetText('');
    setResultFormat(nextMode === 'translation' ? 'plain' : 'markdown');
    setFuriganaTokens(null);
    setNotice(null);

    if (nextMode !== 'translation') {
      setImageUri(null);
      setImageBase64(null);
      setImageSize(null);
      setOverlayItems([]);
    }
  };

  const enterImageLanguageContext = (): { source: LanguageCode; target: LanguageCode } => {
    if (!imageLanguageContextRef.current) {
      imageLanguageContextRef.current = true;
      setSourceLang(targetLang);
      setTargetLang(sourceLang);
      return { source: targetLang, target: sourceLang };
    }

    return { source: sourceLang, target: targetLang };
  };

  const leaveImageLanguageContext = () => {
    if (!imageLanguageContextRef.current) {
      return;
    }

    imageLanguageContextRef.current = false;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

  const getCachedTranslation = (
    text: string,
    from: LanguageCode,
    to: LanguageCode
  ): string | null => {
    const key = getTranslationCacheKey(text, from, to);
    const cached = translationCacheRef.current.get(key);

    if (cached && Date.now() - cached.timestamp < TEXT_CACHE_DURATION_MS) {
      return cached.result;
    }

    if (cached) {
      translationCacheRef.current.delete(key);
    }

    return null;
  };

  const cacheTranslation = (
    text: string,
    from: LanguageCode,
    to: LanguageCode,
    result: string
  ) => {
    const key = getTranslationCacheKey(text, from, to);
    translationCacheRef.current.set(key, {
      result,
      timestamp: Date.now(),
    });

    if (translationCacheRef.current.size > TEXT_CACHE_MAX_ENTRIES) {
      const entries = Array.from(translationCacheRef.current.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, TEXT_CACHE_PRUNE_COUNT)
        .forEach(([entryKey]) => translationCacheRef.current.delete(entryKey));
    }
  };

  const handleRunTextMode = async (
    text = sourceText,
    mode = textMode,
    options: { silent?: boolean } = {}
  ) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      setTargetText('');
      return;
    }

    if (sourceLang === targetLang) {
      if (options.silent) {
        return;
      }
      showError('Source and target languages must be different.');
      return;
    }

    if (mode === 'translation' && !isTextTranslationConfigured(settings)) {
      if (options.silent) {
        return;
      }
      showError('Configure General AI or Translation settings first.');
      openSettingsAt('translation');
      return;
    }

    if (mode !== 'translation' && !hasGeneralAISettings(settings)) {
      if (options.silent) {
        return;
      }
      showError(`Configure General AI settings first to use ${textModeTitle(mode).toLowerCase()} mode.`);
      openSettingsAt('general');
      return;
    }

    if (!options.silent) {
      if (textAutoRunTimerRef.current) {
        clearTimeout(textAutoRunTimerRef.current);
        textAutoRunTimerRef.current = null;
      }
      lastAutoTextRunKeyRef.current = getTextActionKey(trimmedText, mode, sourceLang, targetLang);
    }

    textActionAbortRef.current?.abort();
    const abortController = new AbortController();
    textActionAbortRef.current = abortController;

    try {
      setBusyState('translating');
      setNotice(null);
      setTargetText('');
      setFuriganaTokens(null);
      setResultFormat(mode === 'translation' ? 'plain' : 'markdown');

      if (mode === 'translation') {
        const cached = getCachedTranslation(trimmedText, sourceLang, targetLang);
        if (cached) {
          if (!abortController.signal.aborted) {
            setTargetText(cached);

          }
          return;
        }

        const result = await translateText(
          trimmedText,
          sourceLang,
          targetLang,
          settings,
          abortController.signal
        );
        if (!abortController.signal.aborted) {
          setTargetText(result);
          cacheTranslation(trimmedText, sourceLang, targetLang, result);
        }
        return;
      }

      const stream = mode === 'explanation'
        ? explainTextStream(trimmedText, sourceLang, targetLang, settings, abortController.signal)
        : answerQuestionStream(trimmedText, sourceLang, targetLang, settings, abortController.signal);
      let streamedText = '';

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          break;
        }
        streamedText += chunk;
        setTargetText(streamedText);
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : `${textModeTitle(mode)} failed.`;
      if (options.silent) {
        setNotice(message);
      } else {
        showError(message);
      }
    } finally {
      if (textActionAbortRef.current === abortController) {
        textActionAbortRef.current = null;
        setBusyState('idle');
      }
    }
  };

  useEffect(() => () => {
    textActionAbortRef.current?.abort();
    if (textAutoRunTimerRef.current) {
      clearTimeout(textAutoRunTimerRef.current);
      textAutoRunTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (
      smokeScene
      || showSettings
      || showWelcomeWizard
      || languagePickerTarget
      || imageBase64
      || busyState !== 'idle'
      || nativeSpeechActive
    ) {
      return;
    }

    const trimmedText = sourceText.trim();
    if (!trimmedText) {
      lastAutoTextRunKeyRef.current = null;
      if (textAutoRunTimerRef.current) {
        clearTimeout(textAutoRunTimerRef.current);
        textAutoRunTimerRef.current = null;
      }
      setTargetText('');
      setFuriganaTokens(null);
      return;
    }

    if (sourceLang === targetLang) {
      return;
    }

    const canAutoRun = textMode === 'translation'
      ? isTextTranslationConfigured(settings)
      : hasGeneralAISettings(settings);
    if (!canAutoRun) {
      return;
    }

    const actionKey = getTextActionKey(trimmedText, textMode, sourceLang, targetLang);
    if (lastAutoTextRunKeyRef.current === actionKey) {
      return;
    }

    if (textAutoRunTimerRef.current) {
      clearTimeout(textAutoRunTimerRef.current);
    }

    textAutoRunTimerRef.current = setTimeout(() => {
      textAutoRunTimerRef.current = null;
      lastAutoTextRunKeyRef.current = actionKey;
      void handleRunTextMode(trimmedText, textMode, { silent: true });
    }, TEXT_AUTO_RUN_DELAY_MS);

    return () => {
      if (textAutoRunTimerRef.current) {
        clearTimeout(textAutoRunTimerRef.current);
        textAutoRunTimerRef.current = null;
      }
    };
  }, [
    busyState,
    imageBase64,
    languagePickerTarget,
    nativeSpeechActive,
    settings,
    showSettings,
    showWelcomeWizard,
    smokeScene,
    sourceLang,
    sourceText,
    targetLang,
    textMode,
  ]);

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(targetText);
    setTargetText(sourceText);
  };

  const handleSpeak = async () => {
    const text = targetText || sourceText;
    if (!text.trim()) {
      return;
    }
    await Speech.stop();
    Speech.speak(text, {
      language: targetText ? targetLang : sourceLang,
      rate: 0.95,
    });
  };

  const handleCopy = async () => {
    if (!targetText.trim()) {
      return;
    }
    await Clipboard.setStringAsync(targetText);
    if (resultCopyResetTimerRef.current) {
      clearTimeout(resultCopyResetTimerRef.current);
    }
    setResultCopied(true);
    resultCopyResetTimerRef.current = setTimeout(() => {
      setResultCopied(false);
      resultCopyResetTimerRef.current = null;
    }, 2000);
    setNotice(`${textModeTitle(textMode)} copied.`);
  };

  const startFileRecording = async (listeningNotice = 'Listening...'): Promise<boolean> => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        showError('Microphone permission is required for voice translation.');
        return false;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setBusyState('recording');
      setNotice(listeningNotice);
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Could not start recording.');
      setBusyState('idle');
      return false;
    }
  };

  const handleStartRecording = async () => {
    if (settings.speechRecognition.provider === 'local') {
      if (Platform.OS !== 'ios') {
        showError('Local ASR currently requires an iOS native build.');
        return;
      }

      const modelId = getSelectedLocalASRModelId(settings);
      let installed: InstalledModelPack[] = [];
      try {
        installed = await loadInstalledModelPacks();
      } catch {
        setNotice('Downloaded model state could not be read. Trying Apple on-device Speech.');
      }
      const pack = getReadyInstalledModelPackById(installed, modelId);

      if (pack) {
        try {
          setBusyState('transcribing');
          setNotice(`Preparing ${pack.label || pack.id}...`);
          await validateNativeLocalModelPackAsync(modelId, pack.rootUri);
          localRecordingPackRef.current = pack;
          const started = await startFileRecording(`Listening with ${pack.label || pack.id}...`);
          if (started) return;
          localRecordingPackRef.current = null;
          return;
        } catch {
          localRecordingPackRef.current = null;
          setBusyState('idle');
          setNotice(`${pack.label || pack.id} could not load. Trying Apple on-device Speech.`);
        }
      }

      const locale = nativeSpeechLocale(sourceLang);
      const available = await isNativeOnDeviceSpeechAvailableAsync(locale);

      if (!available) {
        showError(pack
          ? `${pack.label || pack.id} could not load, and Apple on-device Speech is unavailable for this language.`
          : `Download ${modelId === 'whisper-base' ? 'Whisper Base' : 'SenseVoice Small'} in Settings, or use a language supported by Apple on-device Speech.`);
        return;
      }

      try {
        const authorization = await requestNativeSpeechAuthorizationAsync();
        if (!authorization.granted) {
          showError('Speech recognition permission is required for local voice translation.');
          return;
        }

        await startNativeSpeechRecognitionAsync(locale, true);
        setNativeSpeechActive(true);
        setNativeSpeechMode('on-device');
        setBusyState('recording');
        setNotice('Listening on device...');
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Could not start local speech recognition.');
        setBusyState('idle');
      }
      return;
    }

    if (settings.speechRecognition.provider === 'web-speech' && Platform.OS === 'ios') {
      const locale = nativeSpeechLocale(sourceLang);
      const available = await isNativeSpeechAvailableAsync(locale);

      if (available) {
        try {
          const authorization = await requestNativeSpeechAuthorizationAsync();
          if (!authorization.granted) {
            showError('Speech recognition permission is required for native voice translation.');
            return;
          }

          await startNativeSpeechRecognitionAsync(locale);
          setNativeSpeechActive(true);
          setNativeSpeechMode('standard');
          setBusyState('recording');
          setNotice('Listening with iOS Speech...');
          return;
        } catch (error) {
          showError(error instanceof Error ? error.message : 'Could not start native speech recognition.');
          setBusyState('idle');
          return;
        }
      }

      setNotice('Native speech recognition is unavailable in this build. Falling back to cloud audio.');
    }

    localRecordingPackRef.current = null;
    await startFileRecording();
  };

  const handleStopRecording = async () => {
    if (nativeSpeechActive) {
      try {
        setBusyState('transcribing');
        const { text } = await stopNativeSpeechRecognitionAsync();
        setNativeSpeechActive(false);
        setSourceText(text);
        setNotice(nativeSpeechMode === 'on-device' ? 'Speech transcribed on device.' : 'Speech transcribed with iOS Speech.');
        if (text.trim()) {
          await handleRunTextMode(text);
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Native speech recognition failed.');
      } finally {
        setNativeSpeechActive(false);
        setNativeSpeechMode(null);
        setBusyState('idle');
      }
      return;
    }

    try {
      setBusyState('transcribing');
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (!recorder.uri) {
        throw new Error('No recording file was produced.');
      }

      const localPack = localRecordingPackRef.current;
      const transcribed = localPack
        ? (await transcribeWithNativeLocalModelAsync(
            recorder.uri,
            localPack.id as 'whisper-base' | 'sensevoice-small',
            localPack.rootUri,
            localPack.id === 'sensevoice-small'
              ? {
                  language: settings.speechRecognition.senseVoiceLanguage || 'auto',
                  useInverseTextNormalization: settings.speechRecognition.senseVoiceUseItn ?? true,
                }
              : {
                  language: settings.speechRecognition.whisperLanguage || 'auto',
                  task: settings.speechRecognition.whisperTask || 'transcribe',
                }
          )).text
        : await transcribeAudioFile(new File(recorder.uri), settings);

      setSourceText(transcribed);
      setNotice(localPack
        ? `Speech transcribed with ${localPack.label || localPack.id}.`
        : 'Speech transcribed.');
      if (transcribed.trim()) {
        await handleRunTextMode(transcribed);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Audio transcription failed.');
    } finally {
      localRecordingPackRef.current = null;
      setBusyState('idle');
    }
  };

  const resetImageWorkspace = () => {
    textActionAbortRef.current?.abort();
    textActionAbortRef.current = null;
    if (textAutoRunTimerRef.current) {
      clearTimeout(textAutoRunTimerRef.current);
      textAutoRunTimerRef.current = null;
    }
    lastAutoTextRunKeyRef.current = null;

    setTextMode('translation');
    setSourceText('');
    setTargetText('');
    setOverlayItems([]);
    setFuriganaTokens(null);
    setNotice(null);
  };

  const handlePickImage = async (source: 'camera' | 'library') => {
    if (textMode !== 'translation') {
      setTextMode('translation');
    }

    if (!isCloudImageConfigured(settings, imageMode)) {
      const guidance: ConfigGuidance = imageMode === 'ocr'
        ? {
            title: 'OCR Service Not Configured',
            message: 'Add a cloud OCR provider or choose Local PP-OCR on iOS for native Vision OCR.',
            actionLabel: 'Open Settings',
            target: 'image',
          }
        : {
            title: 'VLM Service Not Configured',
            message: 'Add General AI or custom VLM settings before translating images directly.',
            actionLabel: 'Open Settings',
            target: 'general',
          };
      setConfigGuidanceOverride(guidance);
      setNotice(guidance.message);
      return;
    }

    try {
      setBusyState('image');
      setNotice(null);

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.9,
            base64: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.9,
            base64: false,
          });

      if (result.canceled || !result.assets[0]) {
        setBusyState('idle');
        return;
      }

      resetImageWorkspace();
      const languageContext = enterImageLanguageContext();
      const prepared = await buildImageDataUri(result.assets[0]);
      setImageUri(prepared.uri);
      setImageBase64(prepared.dataUri);
      setImageSize(prepared.size);
      await handleProcessImage(prepared.dataUri, prepared.uri, languageContext);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Image translation failed.');
    } finally {
      setBusyState('idle');
    }
  };

  const handleDeviceQAImagePrepared = (prepared: PreparedImageData) => {
    resetImageWorkspace();
    setImageMode('ocr');
    setImageUri(prepared.uri);
    setImageBase64(prepared.dataUri);
    setImageSize(prepared.size);
    setResultFormat('plain');
    setNotice('Device QA image ready for Vision OCR or OCR overlay.');
  };

  const handleProcessImage = async (
    dataUri = imageBase64,
    nativeImageUri = imageUri,
    languageContext?: { source: LanguageCode; target: LanguageCode }
  ) => {
    if (!dataUri) {
      return;
    }

    if (textMode !== 'translation') {
      setTextMode('translation');
    }

    const processSourceLang = languageContext?.source ?? sourceLang;
    const processTargetLang = languageContext?.target ?? targetLang;

    if (processSourceLang === processTargetLang) {
      showError('Source and target languages must be different.');
      return;
    }

    setOverlayItems([]);
    setTargetText('');
    setFuriganaTokens(null);

    const vlmUsesLocalOCR = imageMode === 'vlm'
      && !settings.vlm.useGeneralAI
      && !settings.vlm.useCustom
      && !settings.imageOCR.useGeneralAI
      && settings.imageOCR.provider === 'local-ppocr';

    if (imageMode === 'vlm' && !vlmUsesLocalOCR) {
      setResultFormat('markdown');
      let streamedText = '';
      for await (const chunk of streamTranslateImageWithVLM(dataUri, processSourceLang, processTargetLang, settings)) {
        streamedText += chunk;
        setTargetText(streamedText);
      }
      return;
    }

    let ocrTexts: OCRTextLocation[];
    if (settings.imageOCR.provider === 'local-ppocr' && !settings.imageOCR.useGeneralAI) {
      if (Platform.OS !== 'ios') {
        throw new Error('Local PP-OCR currently requires the native iOS build. Use cloud OCR on this platform.');
      }
      if (!nativeImageUri) {
        throw new Error('A local image file is required for native OCR.');
      }

      const installed = await loadInstalledModelPacks();
      const pack = getReadyInstalledModelPackById(installed, 'ppocr-v6-small');
      if (pack) {
        try {
          const result = await recognizeTextWithNativePPOCRAsync(nativeImageUri, 'ppocr-v6-small', pack.rootUri);
          ocrTexts = result.items;
          setNotice(`Text recognized with ${pack.label || 'PP-OCR v6 Small'}.`);
        } catch {
          setNotice('PP-OCR could not process this image. Apple Vision was used instead.');
          ocrTexts = await recognizeTextInImageAsync(
            nativeImageUri,
            nativeVisionOCRLanguages(processSourceLang)
          );
        }
      } else {
        setNotice('PP-OCR is not ready. Apple Vision was used instead.');
        ocrTexts = await recognizeTextInImageAsync(
          nativeImageUri,
          nativeVisionOCRLanguages(processSourceLang)
        );
      }
    } else {
      ocrTexts = await performOCR(dataUri, settings);
    }

    if (!ocrTexts.length) {
      setNotice('No readable text found.');
      return;
    }

    const translatedItems = await Promise.all(
      ocrTexts.map(async (item, index) => {
        const translation = await translateText(item.text, processSourceLang, processTargetLang, settings);
        return {
          id: `${index}-${item.text.slice(0, 10)}`,
          source: item.text,
          translation,
          location: item.location,
          rotate_rect: item.rotate_rect,
        };
      })
    );

    setOverlayItems(vlmUsesLocalOCR ? [] : translatedItems);
    setSourceText(ocrTexts.map((item) => item.text).join('\n'));
    setResultFormat('plain');
    setFuriganaTokens(null);
    setTargetText(translatedItems.map((item) => item.translation).join('\n'));
  };

  const handleClear = () => {
    textActionAbortRef.current?.abort();
    textActionAbortRef.current = null;
    if (textAutoRunTimerRef.current) {
      clearTimeout(textAutoRunTimerRef.current);
      textAutoRunTimerRef.current = null;
    }
    lastAutoTextRunKeyRef.current = null;
    setSourceText('');
    setTargetText('');
    setImageUri(null);
    setImageBase64(null);
    setImageSize(null);
    setOverlayItems([]);
    setResultFormat('plain');
    setFuriganaTokens(null);
    leaveImageLanguageContext();
    setNotice(null);
  };

  const selectLanguage = (code: LanguageCode) => {
    if (languagePickerTarget === 'source') {
      setSourceLang(code);
    }
    if (languagePickerTarget === 'target') {
      setTargetLang(code);
    }
    setLanguagePickerTarget(null);
  };

  if (!isReady) {
    return (
      <AppThemeContext.Provider value={themeContext}>
        <LinearGradient colors={theme.gradient} style={styles.root}>
          <StatusBar style={theme.statusBarStyle} />
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={styles.loadingText}>Loading tabitomo...</Text>
          </View>
        </LinearGradient>
      </AppThemeContext.Provider>
    );
  }

  const usesTargetOnlyLanguageBar = textMode === 'explanation' || textMode === 'qa';
  const needsSetupAttention = !isTextTranslationConfigured(settings);

  return (
    <AppThemeContext.Provider value={themeContext}>
      <LinearGradient colors={theme.gradient} style={styles.root}>
          <StatusBar style={theme.statusBarStyle} />
          <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            <View style={styles.appShell}>
              <View style={[styles.header, keyboardVisible && styles.headerEditing]}>
                <View style={styles.brandRow}>
                  <Image source={BUDDY_IMAGE} style={[styles.brandIcon, keyboardVisible && styles.brandIconEditing]} />
                  <View><Text style={[styles.brand, keyboardVisible && styles.brandEditing]}>tabitomo</Text>{!keyboardVisible && <Text style={styles.subtitle}>A little help, wherever you go.</Text>}</View>
                </View>
                <NativeMaterial theme={theme} style={styles.headerSettingsMaterial} interactive>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Settings"
                  accessibilityHint={needsSetupAttention ? 'Setup required' : undefined}
                  onPress={() => { selectionFeedback(); openSettingsAt(null); }}
                  style={({ pressed }) => [
                    styles.headerSettingsButton,
                    pressed && styles.headerSettingsButtonPressed,
                  ]}
                >
                  <Settings size={20} color={theme.mutedText} strokeWidth={1.8} />
                  {needsSetupAttention && <View style={styles.settingsStatusDot} />}
                </Pressable>
                </NativeMaterial>
              </View>

              <View style={[styles.appBody, isCompactViewport && styles.appBodyCompact, { paddingBottom: keyboardVisible ? 8 : (isCompactViewport ? 10 : 12) + insets.bottom }]}>
                {!keyboardVisible && <TextModeSwitcher mode={textMode} onChange={handleSelectTextMode} />}
                <NativeMaterial theme={theme} style={[styles.languageBar, usesTargetOnlyLanguageBar && styles.languageBarTargetOnly]}>
                  {usesTargetOnlyLanguageBar ? (
                    <View style={styles.targetLanguageOnly}>
                      <Text numberOfLines={1} style={styles.languageBarLabel}>Target Language</Text>
                      <View style={styles.targetLanguageButtonRow}>
                        <LanguageButton code={targetLang} align="right" onPress={() => setLanguagePickerTarget('target')} />
                      </View>
                    </View>
                  ) : (
                    <>
                      <LanguageButton code={sourceLang} onPress={() => setLanguagePickerTarget('source')} />
                      <IconButton icon={ArrowLeftRight} label="Swap" onPress={handleSwapLanguages} compact quiet />
                      <LanguageButton code={targetLang} onPress={() => setLanguagePickerTarget('target')} />
                    </>
                  )}
                </NativeMaterial>

                <ScrollView
                  style={[styles.workspace, { marginHorizontal: isCompactViewport ? -16 : -20 }]}
                  contentContainerStyle={[styles.workspaceContent, { paddingHorizontal: isCompactViewport ? 16 : 20 }]}
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.translationSheet}>
                  <View style={[styles.panel, isCompactViewport && styles.panelCompact, sourceInputFocused && styles.panelFocused]}>
                    <View style={styles.panelHeader}>
                      <View style={styles.panelTitleRow}>
                        <Languages size={16} color={theme.mutedText} strokeWidth={1.8} />
                        <Text style={styles.panelTitle}>Source</Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel="Clear" disabled={!sourceText && !imageUri} onPress={handleClear} style={({ pressed }) => [styles.clearButton, (!sourceText && !imageUri) && styles.disabled, pressed && styles.buttonPressed]}>
                        <Eraser size={16} color={theme.mutedText} strokeWidth={1.8} />
                        <Text style={styles.clearButtonText}>Clear</Text>
                      </Pressable>
                    </View>
                    <View
                      style={[
                        styles.sourceInputFrame,
                        isCompactViewport && styles.sourceInputFrameCompact,
                        isNarrowViewport && styles.sourceInputFrameNarrow,
                      ]}
                    >
                      <TextInput
                        ref={sourceInputRef}
                        accessibilityLabel="Source text"
                        value={sourceText}
                        onChangeText={setSourceText}
                        multiline
                        placeholder={textModePlaceholder(textMode)}
                        placeholderTextColor={theme.sourcePlaceholder}
                        textAlignVertical="top"
                        onFocus={() => setSourceInputFocused(true)}
                        onBlur={() => setSourceInputFocused(false)}
                        style={[styles.sourceInput, isCompactViewport && styles.sourceInputCompact, isNarrowViewport && styles.sourceInputNarrow]}
                      />

                    </View>
                  </View>

                  {imageUri && (
                    <>
                      <ImagePreview
                        uri={imageUri}
                        imageSize={imageSize}
                        items={overlayItems}
                        onPress={() => setShowImageLightbox(true)}
                      />
                      <View style={styles.imageToolbar}>
                        <View style={styles.imageModeBar}>
                          <SegmentButton label="VLM" active={imageMode === 'vlm'} onPress={() => setImageMode('vlm')} />
                          <SegmentButton label={settings.imageOCR.useGeneralAI || settings.imageOCR.provider === 'custom' ? 'OCR text' : 'OCR overlay'} active={imageMode === 'ocr'} onPress={() => setImageMode('ocr')} />
                        </View>
                        <IconButton
                          icon={ScanText}
                          label="Rerun image"
                          onPress={() => handleProcessImage()}
                          disabled={!imageBase64 || isBusy(busyState)}
                          compact
                        />
                      </View>
                    </>
                  )}

                  <View style={[styles.resultPanel, isNarrowViewport && styles.resultPanelNarrow]}>
                    <View style={styles.panelHeader}>
                      <View style={styles.panelTitleRow}>
                        <ResultIcon size={16} color={theme.accentStrong} strokeWidth={1.8} />
                        <Text style={styles.panelTitle}>{textModeTitle(textMode)}</Text>
                      </View>
                      <Text style={styles.panelMeta}>{SUPPORTED_LANGUAGES[targetLang]}</Text>
                    </View>
                    {targetText ? (
                      resultFormat === 'markdown'
                        ? <MarkdownText text={targetText} />
                        : furiganaTokens
                          ? <FuriganaText tokens={furiganaTokens} />
                          : <Text style={styles.resultText}>{targetText}</Text>
                    ) : activeConfigGuidance ? (
                      <ConfigGuidanceCard
                        guidance={activeConfigGuidance}
                        onPress={() => openSettingsAt(activeConfigGuidance.target)}
                      />
                    ) : (
                      <View style={[styles.resultEmpty, isNarrowViewport && styles.resultEmptyNarrow]}>
                        <View style={styles.resultEmptyIcon}><Sparkles size={25} color={theme.accentStrong} strokeWidth={1.5} /></View>
                        <Text style={styles.resultEmptyTitle}>{textMode === 'qa' ? 'A little local knowledge.' : textMode === 'explanation' ? 'Make sense of something new.' : 'Good conversations start here.'}</Text>
                        <Text style={styles.emptyText}>{textModeEmptyText(textMode)}</Text>
                      </View>
                    )}
                    {isFuriganaLoading && <Text style={styles.furiganaStatus}>Adding furigana...</Text>}
                    {!!targetText && (
                      <View style={styles.resultActions}>
                        <IconButton icon={Volume2} label="Listen" onPress={handleSpeak} compact />
                        <IconButton
                          icon={resultCopied ? Check : Copy}
                          label={resultCopied ? 'Copied' : 'Copy'}
                          onPress={handleCopy}
                          compact
                        />
                      </View>
                    )}
                  </View>
                  </View>
                </ScrollView>

                {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
                <NativeMaterial theme={theme} style={styles.inputDock}>
                      <View style={[styles.sourceToolbar]}>
                        <View style={[styles.sourceToolbarGroup, isCompactViewport && styles.sourceToolbarGroupCompact]}>
                          <IconButton
                            icon={isVoiceRecording ? MicOff : Mic}
                            label={isVoiceRecording ? 'Stop' : 'Speak'}
                            onPress={isVoiceRecording ? handleStopRecording : handleStartRecording}
                            disabled={busyState === 'translating' || busyState === 'image' || busyState === 'transcribing'}
                            emphasized={isVoiceRecording}
                            compact
                            quiet
                            compactSize={sourceToolbarButtonSize}
                          />
                          <IconButton
                            icon={Camera}
                            label="Camera"
                            onPress={() => handlePickImage('camera')}
                            disabled={isBusy(busyState)}
                            compact
                            quiet
                            compactSize={sourceToolbarButtonSize}
                          />
                          <IconButton
                            icon={ImageIcon}
                            label="Album"
                            onPress={() => handlePickImage('library')}
                            disabled={isBusy(busyState)}
                            compact
                            quiet
                            compactSize={sourceToolbarButtonSize}
                          />
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={textModeActionLabel(textMode)}
                          onPress={() => { actionFeedback(); void handleRunTextMode(); }}
                          disabled={!canRunTextMode || isBusy(busyState)}
                          style={({ pressed }) => [styles.translateButton, (!canRunTextMode || isBusy(busyState)) && styles.translateButtonDisabled, pressed && styles.buttonPressed]}
                        >
                          <LinearGradient pointerEvents="none" colors={[theme.accent, '#4338ca']} style={styles.translateButtonFill} />
                          <Text style={styles.translateButtonText}>{textModeActionLabel(textMode)}</Text>
                          <ArrowRight size={17} color={theme.inverseText} strokeWidth={2} />
                        </Pressable>
                      </View>
                </NativeMaterial>
              </View>
            </View>

            {isBusy(busyState) && (
              <View style={styles.busyOverlay}>
                <ActivityIndicator color={theme.inverseText} />
                <Text style={styles.busyText}>
                  {busyState === 'recording' ? 'Recording...' : busyState === 'transcribing' ? 'Transcribing...' : busyState === 'image' ? 'Reading image...' : textModeBusyText(textMode)}
                </Text>
              </View>
            )}
        </SafeAreaView>
          </KeyboardAvoidingView>

        <LanguagePicker
          visible={languagePickerTarget !== null}
          selected={languagePickerTarget === 'target' ? targetLang : sourceLang}
          onSelect={selectLanguage}
          onClose={() => setLanguagePickerTarget(null)}
        />

        <SettingsSheet
          visible={showSettings}
          settings={settings}
          sourceLang={sourceLang}
          initialJumpId={settingsInitialJumpId}
          onClose={() => {
            setShowSettings(false);
            setSettingsInitialJumpId(null);
          }}
          onSave={handleSaveSettings}
          smokeVariant={smokeScene === 'settings-qr'
            ? 'qr-export'
            : smokeScene === 'settings-qr-import'
              ? 'qr-import'
              : smokeScene === 'settings-config-roundtrip'
                ? 'config-roundtrip'
                : smokeScene === 'settings-hunyuan-output'
                  ? 'hunyuan-output'
                  : smokeScene === 'settings-local'
                    ? 'local-runtime'
                    : smokeScene === 'settings-model-packs'
                      ? 'model-packs'
                      : smokeScene === 'settings-model-pack-install'
                        ? 'model-pack-install'
                        : undefined}
          smokeModelPackManifestUrl={smokeModelPackManifestUrl || undefined}
        />

        <SetupWizard
          visible={showWelcomeWizard}
          onComplete={handleWelcomeComplete}
          onSkip={handleWelcomeSkip}
          smokeInitialStep={smokeScene === 'setup-import'
            ? 'import'
            : smokeScene === 'setup-manual'
              ? 'translation'
              : smokeScene === 'setup-choice'
                ? 'choice'
                : undefined}
        />

        <QRScannerSheet
          visible={showSmokeQrScanner}
          onClose={() => setShowSmokeQrScanner(false)}
          onScanned={(payload) => {
            setShowSmokeQrScanner(false);
            setNotice(`Smoke QR scanned: ${payload.slice(0, 24)}`);
          }}
        />

        <DeviceQASheet
          visible={showDeviceQA}
          settings={settings}
          sourceLang={sourceLang}
          targetLang={targetLang}
          currentImageUri={imageUri}
          onClose={() => setShowDeviceQA(false)}
          onImagePrepared={handleDeviceQAImagePrepared}
        />
        <ImageLightbox
          visible={showImageLightbox}
          uri={imageUri}
          imageSize={imageSize}
          items={overlayItems}
          onClose={() => setShowImageLightbox(false)}
        />
        </LinearGradient>
    </AppThemeContext.Provider>
  );
}

function IconButton({
  icon: Icon,
  label,
  onPress,
  disabled = false,
  emphasized = false,
  compact = false,
  quiet = false,
  compactSize,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  emphasized?: boolean;
  compact?: boolean;
  quiet?: boolean;
  compactSize?: number;
}) {
  const { styles, theme } = useAppTheme();
  const color = emphasized ? theme.inverseText : quiet ? theme.mutedText : theme.accentStrong;
  const iconSize = compact ? 20 : 21;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { selectionFeedback(); onPress(); }}
      disabled={disabled}
      hitSlop={compactSize ? Math.max(3, (44 - compactSize) / 2) : undefined}
      style={({ pressed }) => [
        compact ? styles.iconButtonCompact : styles.iconButton,
        compact && compactSize ? { width: compactSize, height: compactSize } : null,
        quiet && styles.iconButtonQuiet,
        emphasized && styles.iconButtonEmphasized,
        disabled && styles.disabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Icon size={iconSize} color={disabled ? theme.disabledIcon : color} strokeWidth={1.8} />
      {!compact && <Text style={[styles.iconButtonLabel, emphasized && styles.iconButtonLabelEmphasized]}>{label}</Text>}
    </Pressable>
  );
}

function ConfigGuidanceCard({
  guidance,
  onPress,
}: {
  guidance: ConfigGuidance;
  onPress: () => void;
}) {
  const { styles, theme } = useAppTheme();
  return (
    <View style={styles.configGuidanceCard}>
      <View style={styles.configGuidanceCopy}>
        <Text style={styles.configGuidanceTitle}>{guidance.title}</Text>
        <Text numberOfLines={2} style={styles.configGuidanceText}>{guidance.message}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={guidance.actionLabel}
        onPress={onPress}
        style={({ pressed }) => [
          styles.configGuidanceButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Settings size={16} color={theme.inverseText} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

function LanguageButton({ code, onPress, align = 'center' }: { code: LanguageCode; onPress: () => void; align?: 'center' | 'right' }) {
  const { styles, theme } = useAppTheme();
  const label = `${SUPPORTED_LANGUAGES[code]} language`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.languageButton, align === 'right' && styles.languageButtonRight, pressed && styles.buttonPressed]}
      onPress={() => { selectionFeedback(); onPress(); }}
    >
      <Text numberOfLines={1} style={styles.languageName}>{SUPPORTED_LANGUAGES[code]}</Text>
      <ChevronDown size={13} color={theme.subtleText} strokeWidth={1.8} />
    </Pressable>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { styles } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} image mode`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.segmentButton, active && styles.segmentButtonActive, pressed && styles.buttonPressed]}
    >
      <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TextModeSwitcher({ mode, onChange }: { mode: TextMode; onChange: (mode: TextMode) => void }) {
  const { styles, theme } = useAppTheme();
  if (Platform.OS !== 'ios') return <PortableTextModeSwitcher mode={mode} onChange={onChange} />;
  const modes: TextMode[] = ['translation', 'explanation', 'qa'];
  return <SegmentedControl
    accessibilityLabel="Assistant mode"
    values={['Translate', 'Explain', 'Q&A']}
    selectedIndex={modes.indexOf(mode)}
    appearance={theme.name}
    fontStyle={{ fontSize: 14, color: theme.mutedText, fontWeight: '500' }}
    activeFontStyle={{ fontSize: 14, color: theme.accentStrong, fontWeight: '600' }}
    style={styles.nativeModeControl}
    onChange={(event) => { selectionFeedback(); onChange(modes[event.nativeEvent.selectedSegmentIndex]); }}
  />;
}

function PortableTextModeSwitcher({ mode, onChange }: { mode: TextMode; onChange: (mode: TextMode) => void }) {
  const { styles, theme } = useAppTheme();
  const { reduceMotion } = useNativePreferences();
  const [trackWidth, setTrackWidth] = useState(0);
  const modeIndex = mode === 'translation' ? 0 : mode === 'explanation' ? 1 : 2;
  const indicatorPosition = useRef(new Animated.Value(modeIndex)).current;
  const options = [
    { mode: 'translation' as const, label: 'Translate', icon: Languages },
    { mode: 'explanation' as const, label: 'Explain', icon: ScanText },
    { mode: 'qa' as const, label: 'Q&A', icon: MessageCircle },
  ];

  useEffect(() => {
    if (reduceMotion) { indicatorPosition.setValue(modeIndex); return; }
    const animation = Animated.spring(indicatorPosition, {
      toValue: modeIndex,
      damping: 18,
      stiffness: 240,
      mass: 0.65,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();

    return () => animation.stop();
  }, [indicatorPosition, modeIndex, reduceMotion]);

  const segmentWidth = Math.max(0, (trackWidth - 8) / options.length);
  const indicatorTranslateX = indicatorPosition.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, segmentWidth, segmentWidth * 2],
  });

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={styles.textModeBar}
    >
      {trackWidth > 0 && (
        <Animated.View
          style={[
            styles.textModeIndicator,
            {
              width: segmentWidth,
              transform: [{ translateX: indicatorTranslateX }],
            },
          ]}
        />
      )}
      {options.map((option) => {
        const active = option.mode === mode;
        const Icon = option.icon;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={`${option.label} text mode`}
            accessibilityState={{ selected: active }}
            key={option.mode}
            onPress={() => onChange(option.mode)}
            style={({ pressed }) => [
              styles.textModeButton,
              pressed && styles.textModeButtonPressed,
            ]}
          >
            <Icon size={16} color={active ? theme.accentStrong : theme.mutedText} strokeWidth={1.8} />
            <Text style={[styles.textModeButtonText, active && styles.textModeButtonTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type PopupPanelProps = {
  visible: boolean;
  onClose: () => void;
  panelStyle: StyleProp<ViewStyle>;
  baseBottomPadding?: number;
  children: React.ReactNode;
};

function PopupPanel(props: PopupPanelProps) {
  if (Platform.OS === 'ios') return <NativePopupPanel {...props} />;
  return <AnimatedPopupPanel {...props} />;
}

function NativePopupPanel({ visible, onClose, panelStyle, children }: PopupPanelProps) {
  const { styles, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useNativePreferences();
  return <Modal visible={visible} presentationStyle="pageSheet" animationType={reduceMotion ? 'none' : 'slide'} allowSwipeDismissal onRequestClose={onClose}>
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { backgroundColor: theme.field }]}>
      <View accessibilityElementsHidden style={styles.sheetGrabber} />
      <View accessibilityViewIsModal style={[panelStyle, styles.nativeSheetContent, { paddingBottom: Math.max(12, insets.bottom) }]}>
        {children}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function AnimatedPopupPanel({
  visible,
  onClose,
  panelStyle,
  baseBottomPadding = 10,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  panelStyle: StyleProp<ViewStyle>;
  baseBottomPadding?: number;
  children: React.ReactNode;
}) {
  const { styles } = useAppTheme();
  const { reduceMotion } = useNativePreferences();
  const insets = useSafeAreaInsets();
  const sheetOffscreenY = useRef(Math.max(480, Dimensions.get('screen').height)).current;
  const [rendered, setRendered] = useState(visible);
  const renderedRef = useRef(visible);
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const sheetTranslateY = useRef(new Animated.Value(visible ? 0 : sheetOffscreenY)).current;

  useEffect(() => {
    let frame: number | undefined;
    let animation: Animated.CompositeAnimation | undefined;

    backdropOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();

    if (visible) {
      const isFreshEntrance = !renderedRef.current;
      renderedRef.current = true;
      setRendered(true);

      if (isFreshEntrance) {
        backdropOpacity.setValue(0);
        sheetTranslateY.setValue(sheetOffscreenY);
      }

      frame = requestAnimationFrame(() => {
        animation = Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: reduceMotion ? 0 : 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(sheetTranslateY, {
            toValue: 0,
            duration: reduceMotion ? 0 : 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]);
        animation.start();
      });
    } else if (renderedRef.current) {
      animation = Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: reduceMotion ? 0 : 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(sheetTranslateY, {
          toValue: sheetOffscreenY,
          duration: reduceMotion ? 0 : 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]);
      animation.start(({ finished }) => {
        if (finished) {
          renderedRef.current = false;
          setRendered(false);
        }
      });
    }

    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      animation?.stop();
    };
  }, [backdropOpacity, sheetOffscreenY, sheetTranslateY, visible, reduceMotion]);

  if (!rendered) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      hardwareAccelerated
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.languageModalRoot}>
        <Animated.View style={[styles.languageModalBackdrop, { opacity: backdropOpacity }]} />
        <Animated.View
          style={[
            panelStyle,
            {
              paddingBottom: Math.max(baseBottomPadding, insets.bottom + 10),
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

function LanguagePicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: LanguageCode;
  onSelect: (code: LanguageCode) => void;
  onClose: () => void;
}) {
  const { styles, theme } = useAppTheme();
  const [displayedSelected, setDisplayedSelected] = useState(selected);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setDisplayedSelected(selected);
      setQuery('');
    }
  }, [selected, visible]);

  return (
    <PopupPanel
      visible={visible}
      onClose={onClose}
      panelStyle={styles.sheet}
      baseBottomPadding={18}
    >
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>Choose language</Text>
        <IconButton icon={X} label="Close" onPress={onClose} compact />
      </View>
      <TextInput accessibilityLabel="Search languages" placeholder="Search languages" placeholderTextColor={theme.mutedText} value={query} onChangeText={setQuery} clearButtonMode="while-editing" autoCorrect={false} style={styles.languageSearch} />
      <ScrollView style={styles.languageList} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {LANGUAGE_OPTIONS.filter((language) => `${language.name} ${language.code}`.toLowerCase().includes(query.trim().toLowerCase())).map((language) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={language.name}
            accessibilityState={{ selected: displayedSelected === language.code }}
            key={language.code}
            onPress={() => {
              selectionFeedback();
              setDisplayedSelected(language.code);
              onSelect(language.code);
            }}
            style={({ pressed }) => [
              styles.languageRow,
              displayedSelected === language.code && styles.languageRowActive,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.languageRowName}>{language.name}</Text>
            {displayedSelected === language.code && <Check size={19} color={theme.accentStrong} />}
          </Pressable>
        ))}
        {!LANGUAGE_OPTIONS.some((language) => `${language.name} ${language.code}`.toLowerCase().includes(query.trim().toLowerCase())) && <Text style={styles.settingsHelp}>No matching languages.</Text>}
      </ScrollView>
    </PopupPanel>
  );
}

function SetupWizard({
  visible,
  onComplete,
  onSkip,
  smokeInitialStep,
}: {
  visible: boolean;
  onComplete: (settings: AISettings) => void | Promise<void>;
  onSkip: () => void;
  smokeInitialStep?: SetupWizardStep;
}) {
  const { styles, theme } = useAppTheme();
  const [step, setStep] = useState<SetupWizardStep>('choice');
  const [configMode, setConfigMode] = useState<SetupConfigMode>('general');
  const [draft, setDraft] = useState<AISettings>(DEFAULT_SETTINGS);
  const [configPassword, setConfigPassword] = useState('');
  const [configPayload, setConfigPayload] = useState('');
  const [configStatus, setConfigStatus] = useState<string | null>(null);
  const [isConfigBusy, setIsConfigBusy] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(smokeInitialStep || 'choice');
      setConfigMode('general');
      setDraft(normalizeSettings(DEFAULT_SETTINGS));
      setConfigPassword('');
      setConfigPayload('');
      setConfigStatus(null);
      setIsConfigBusy(false);
      setShowQrScanner(false);
    }
  }, [smokeInitialStep, visible]);

  const updateGeneralAI = (patch: Partial<AISettings['generalAI']>) => {
    setDraft((current) => ({ ...current, generalAI: { ...current.generalAI, ...patch } }));
  };

  const updateTranslation = (patch: Partial<AISettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateSpeech = (patch: Partial<AISettings['speechRecognition']>) => {
    setDraft((current) => ({ ...current, speechRecognition: { ...current.speechRecognition, ...patch } }));
  };

  const updateVLM = (patch: Partial<AISettings['vlm']>) => {
    setDraft((current) => ({ ...current, vlm: { ...current.vlm, ...patch } }));
  };

  const canContinueTranslation = configMode === 'general'
    ? Boolean(hasProviderConnection(draft.generalAI))
    : Boolean(hasProviderConnection(draft));

  const completeWithDraft = async () => {
    await onComplete(normalizeSettings(draft));
  };

  const requireConfigPassword = () => {
    if (!configPassword.trim()) {
      setConfigStatus('Enter the config password first.');
      return false;
    }
    return true;
  };

  const handlePasteConfig = async () => {
    const value = await Clipboard.getStringAsync();
    setConfigPayload(value.trim());
    setConfigStatus(value.trim() ? 'Clipboard payload pasted.' : 'Clipboard is empty.');
  };

  const handleImportConfig = async (payload = configPayload) => {
    if (!requireConfigPassword()) return;
    if (!payload.trim()) {
      setConfigStatus('Paste, select, or scan an encrypted config payload first.');
      return;
    }

    try {
      setIsConfigBusy(true);
      const imported = await importConfigPayload(payload, configPassword);
      await onComplete(imported);
      setConfigStatus('Settings imported.');
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : 'Config import failed.');
    } finally {
      setIsConfigBusy(false);
    }
  };

  const handleImportConfigFile = async () => {
    if (!requireConfigPassword()) return;

    try {
      setIsConfigBusy(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });

      if (result.canceled) {
        setConfigStatus('Config file import cancelled.');
        return;
      }

      const asset = result.assets[0];
      if (!asset) {
        throw new Error('No config file was selected.');
      }

      const payload = (await new File(asset.uri).text()).trim();
      setConfigPayload(payload);
      await handleImportConfig(payload);
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : 'Config file import failed.');
    } finally {
      setIsConfigBusy(false);
    }
  };

  const handleScannedConfig = async (payload: string) => {
    setShowQrScanner(false);
    setConfigPayload(payload);
    await handleImportConfig(payload);
  };

  const stepIndex = step === 'translation' ? 1 : step === 'speech' ? 2 : step === 'image' ? 3 : 0;

  return (
    <>
    <PopupPanel visible={visible} onClose={onSkip} panelStyle={styles.setupSheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.sheetTitle}>Set up tabitomo</Text>
              <Text style={styles.sheetSubtitle}>Configure providers now, import settings, or continue with defaults.</Text>
            </View>
            <IconButton icon={X} label="Skip" onPress={onSkip} compact />
          </View>

          {step === 'translation' && canContinueTranslation && <Pressable accessibilityRole="button" onPress={completeWithDraft} style={({ pressed }) => [styles.wizardButtonPrimary, { marginHorizontal: 16, marginBottom: 8 }, pressed && styles.buttonPressed]}><Text style={styles.wizardButtonPrimaryText}>Start translating</Text></Pressable>}
          {step !== 'choice' && step !== 'import' && (
            <View style={styles.wizardStepRow}>
              {[1, 2, 3].map((index) => (
                <View
                  key={index}
                  style={[
                    styles.wizardStepPill,
                    index <= stepIndex && styles.wizardStepPillActive,
                  ]}
                />
              ))}
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.setupContent}>
            {step === 'choice' && (
              <>
                <Pressable
                  onPress={() => setStep('translation')}
                  style={({ pressed }) => [styles.setupChoice, pressed && styles.buttonPressed]}
                >
                  <Sparkles size={21} color={theme.accentStrong} strokeWidth={2.5} />
                  <View style={styles.setupChoiceTextWrap}>
                    <Text style={styles.setupChoiceTitle}>Manual setup</Text>
                    <Text style={styles.setupChoiceText}>Add General AI, speech, OCR, and VLM settings in a short guided flow.</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => setStep('import')}
                  style={({ pressed }) => [styles.setupChoice, pressed && styles.buttonPressed]}
                >
                  <Import size={21} color={theme.accentStrong} strokeWidth={2.5} />
                  <View style={styles.setupChoiceTextWrap}>
                    <Text style={styles.setupChoiceTitle}>Import config</Text>
                    <Text style={styles.setupChoiceText}>Use an encrypted .ttconfig payload, file, or QR code from the web app.</Text>
                  </View>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.wizardButton, pressed && styles.buttonPressed]} onPress={onSkip}>
                  <Text style={styles.wizardButtonText}>Set up later</Text>
                </Pressable>
              </>
            )}

            {step === 'translation' && (
              <SettingsSection title="Translation service">
                <ChoiceRow
                  options={['general', 'translation']}
                  value={configMode}
                  labels={{ general: 'General AI', translation: 'Translation only' }}
                  onChange={(value) => setConfigMode(value)}
                />
                {configMode === 'general' ? (
                  <>
                    {visible && <AIConnection theme={theme} value={draft.generalAI} onChange={(generalAI) => setDraft((current) => ({ ...current, generalAI }))} />}
                    <ChoiceRow
                      options={API_FORMAT_OPTIONS.map((option) => option.value)}
                      labels={API_FORMAT_OPTIONS.reduce<Record<string, string>>((labels, option) => {
                        labels[option.value] = option.label;
                        return labels;
                      }, {})}
                      value={draft.generalAI.apiFormat}
                      onChange={(value) => updateGeneralAI({ apiFormat: value as APIFormat })}
                    />
                    <Field label="Endpoint" value={draft.generalAI.endpoint} onChangeText={(endpoint) => updateGeneralAI({ endpoint })} placeholder="https://api.openai.com/v1" />
                    <Field label="Model" value={draft.generalAI.modelName} onChangeText={(modelName) => updateGeneralAI({ modelName })} placeholder="Model ID" />
                    <Field label="API key" value={draft.generalAI.apiKey} onChangeText={(apiKey) => updateGeneralAI({ apiKey })} secureTextEntry placeholder="sk-..." />
                  </>
                ) : (
                  <>
                    <Field label="Endpoint" value={draft.endpoint} onChangeText={(endpoint) => updateTranslation({ endpoint, provider: 'custom' })} placeholder="https://api.example.com/v1" />
                    <Field label="Model" value={draft.modelName} onChangeText={(modelName) => updateTranslation({ modelName, provider: 'custom' })} placeholder="Translation model" />
                    <Field label="API key" value={draft.apiKey} onChangeText={(apiKey) => updateTranslation({ apiKey, provider: 'custom' })} secureTextEntry placeholder="Provider API key" />
                  </>
                )}
              </SettingsSection>
            )}

            {step === 'speech' && (
              <SettingsSection title="Speech input">
                <ChoiceRow
                  options={['web-speech', 'siliconflow', 'local']}
                  labels={{ 'web-speech': 'Native', siliconflow: 'Cloud API', local: 'Local' }}
                  value={draft.speechRecognition.provider}
                  onChange={(provider) => updateSpeech({ provider: provider as SpeechRecognitionProvider })}
                />
                {draft.speechRecognition.provider === 'siliconflow' && (
                  <>
                    <Field label="Endpoint" value={draft.speechRecognition.endpoint || ''} onChangeText={(endpoint) => updateSpeech({ endpoint })} placeholder="https://api.example.com/v1" />
                    <Field label="Model" value={draft.speechRecognition.modelName || ''} onChangeText={(modelName) => updateSpeech({ modelName })} placeholder="Transcription model" />
                    <Field label="API key" value={draft.speechRecognition.apiKey || ''} onChangeText={(apiKey) => updateSpeech({ apiKey })} secureTextEntry placeholder="Provider API key" />
                  </>
                )}
                {draft.speechRecognition.provider === 'local' && (
                  <Text style={styles.wizardHint}>Local ASR uses iOS on-device Speech when the selected language supports it. Custom Core ML or Whisper/SenseVoice model runtime is still a native track.</Text>
                )}
              </SettingsSection>
            )}

            {step === 'image' && (
              <>
                <SettingsSection title="Image OCR" help={OCR_HELP}>
                  <OCRFields settings={draft} onChange={setDraft} />
                </SettingsSection>

                <SettingsSection title="VLM image translation">
                  <ChoiceRow
                    options={['general', 'ocr', 'custom']}
                    labels={{ general: 'General AI', ocr: 'OCR settings', custom: 'Custom' }}
                    value={draft.vlm.useGeneralAI ? 'general' : draft.vlm.useCustom ? 'custom' : 'ocr'}
                    onChange={(mode) => updateVLM({
                      useGeneralAI: mode === 'general',
                      useCustom: mode === 'custom',
                    })}
                  />
                  <SettingToggle label="Show thinking" value={draft.vlm.enableThinking} onValueChange={(enableThinking) => updateVLM({ enableThinking })} />
                  {!draft.vlm.useGeneralAI && !draft.vlm.useCustom && (
                    <Text style={styles.settingsHelp}>{draft.imageOCR.provider === 'local-ppocr'
                      ? 'Local PP-OCR is an OCR overlay pipeline, not a direct VLM. Choose General AI or Custom for direct image translation.'
                      : 'Reuses your OCR vision model. The legacy Qwen adapter uses its corresponding vision endpoint.'}</Text>
                  )}
                  {draft.vlm.useCustom && (
                    <>
                      <Field label="VLM endpoint" value={draft.vlm.endpoint || ''} onChangeText={(endpoint) => updateVLM({ endpoint })} placeholder="https://api.example.com/v1" />
                      <Field label="VLM model" value={draft.vlm.modelName || ''} onChangeText={(modelName) => updateVLM({ modelName })} placeholder="Vision model ID" />
                      <Field label="VLM API key" value={draft.vlm.apiKey || ''} onChangeText={(apiKey) => updateVLM({ apiKey })} secureTextEntry placeholder="Optional custom VLM key" />
                    </>
                  )}
                </SettingsSection>
              </>
            )}

            {step === 'import' && (
              <SettingsSection title="Import encrypted config">
                <Text style={styles.settingsHelp}>Compatible with web .ttconfig exports. Password is used for AES-GCM decryption and is not stored.</Text>
                <Field label="Password" value={configPassword} onChangeText={setConfigPassword} secureTextEntry placeholder="Required for import" />
                <View style={styles.configActionGrid}>
                  <ConfigAction icon={Import} label="Paste" onPress={handlePasteConfig} disabled={isConfigBusy} />
                  <ConfigAction icon={Upload} label="Import file" onPress={handleImportConfigFile} disabled={isConfigBusy} />
                  <ConfigAction icon={QrCode} label="Scan QR" onPress={() => setShowQrScanner(true)} disabled={isConfigBusy} />
                </View>
                <TextInput
                  value={configPayload}
                  onChangeText={setConfigPayload}
                  placeholder="Encrypted .ttconfig payload"
                  placeholderTextColor={theme.placeholder}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.payloadInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Import pasted payload"
                  style={({ pressed }) => [
                    styles.importPayloadButton,
                    (!configPayload || isConfigBusy) && styles.disabled,
                    pressed && configPayload && !isConfigBusy && styles.buttonPressed,
                  ]}
                  disabled={!configPayload || isConfigBusy}
                  onPress={() => handleImportConfig()}
                >
                  <Text style={styles.importPayloadButtonText}>Import pasted payload</Text>
                </Pressable>
                {configStatus && <Text style={styles.configStatus}>{configStatus}</Text>}
              </SettingsSection>
            )}
          </ScrollView>

          {step !== 'choice' && step !== 'import' && (
            <View style={styles.wizardActions}>
              <Pressable
                style={({ pressed }) => [styles.wizardButton, pressed && styles.buttonPressed]}
                onPress={() => step === 'translation' ? setStep('choice') : step === 'speech' ? setStep('translation') : setStep('speech')}
              >
                <Text style={styles.wizardButtonText}>Back</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.wizardButtonPrimary,
                  step === 'translation' && !canContinueTranslation && styles.disabled,
                  pressed && !(step === 'translation' && !canContinueTranslation) && styles.buttonPressed,
                ]}
                disabled={step === 'translation' && !canContinueTranslation}
                onPress={() => step === 'translation' ? setStep('speech') : step === 'speech' ? setStep('image') : completeWithDraft()}
              >
                <Text style={styles.wizardButtonPrimaryText}>{step === 'image' ? 'Finish setup' : 'Continue'}</Text>
              </Pressable>
            </View>
          )}

          {step === 'import' && (
            <View style={styles.wizardActions}>
              <Pressable style={({ pressed }) => [styles.wizardButton, pressed && styles.buttonPressed]} onPress={() => setStep('choice')}>
                <Text style={styles.wizardButtonText}>Back</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.wizardButtonPrimary, pressed && styles.buttonPressed]} onPress={onSkip}>
                <Text style={styles.wizardButtonPrimaryText}>Set up later</Text>
              </Pressable>
            </View>
          )}
    </PopupPanel>

      <QRScannerSheet
        visible={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanned={handleScannedConfig}
      />
    </>
  );
}

function ImagePreview({
  uri,
  imageSize,
  items,
  onPress,
}: {
  uri: string;
  imageSize: ImageSize | null;
  items: OverlayItem[];
  onPress: () => void;
}) {
  const { styles } = useAppTheme();
  const aspectRatio = imageSize ? imageSize.width / imageSize.height : 4 / 3;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open translated image preview"
      onPress={onPress}
      style={({ pressed }) => [
        styles.imagePreview,
        { aspectRatio },
        pressed && styles.buttonPressed,
      ]}
    >
      <Image source={{ uri }} resizeMode="cover" style={styles.previewImage} />
      {imageSize && items.map((item) => (
        <OverlayLabel key={item.id} item={item} imageSize={imageSize} />
      ))}
    </Pressable>
  );
}

function ImageLightbox({
  visible,
  uri,
  imageSize,
  items,
  onClose,
}: {
  visible: boolean;
  uri: string | null;
  imageSize: ImageSize | null;
  items: OverlayItem[];
  onClose: () => void;
}) {
  const { styles, theme } = useAppTheme();
  const aspectRatio = imageSize ? imageSize.width / imageSize.height : 4 / 3;

  if (!uri) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.lightboxBackdrop}>
        <SafeAreaView style={styles.lightboxSafeArea}>
          <View style={styles.lightboxHeader}>
            <View>
              <Text style={styles.lightboxTitle}>Translated Image</Text>
              <Text style={styles.lightboxSubtitle}>
                {items.length ? `${items.length} overlay label${items.length === 1 ? '' : 's'}` : 'Original image preview'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close translated image preview"
              onPress={onClose}
              style={({ pressed }) => [styles.lightboxCloseButton, pressed && styles.buttonPressed]}
            >
              <X size={22} color={theme.inverseText} strokeWidth={2.6} />
            </Pressable>
          </View>
          <View style={styles.lightboxBody}>
            <View style={[styles.lightboxImageFrame, { aspectRatio }]}>
              <Image source={{ uri }} resizeMode="contain" style={styles.previewImage} />
              {imageSize && items.map((item) => (
                <OverlayLabel key={`lightbox-${item.id}`} item={item} imageSize={imageSize} />
              ))}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function OverlayLabel({ item, imageSize }: { item: OverlayItem; imageSize: ImageSize }) {
  const { styles } = useAppTheme();
  const frame = getOverlayFrame(item, imageSize);
  if (!frame) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.overlayLabel, frame.style]}>
      <Text
        numberOfLines={frame.maxLines}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        style={styles.overlayText}
      >
        {item.translation}
      </Text>
    </View>
  );
}

function FuriganaText({ tokens }: { tokens: JapaneseFuriganaToken[] }) {
  const { styles } = useAppTheme();
  const lines = splitFuriganaLines(tokens);

  return (
    <View style={styles.furiganaContainer}>
      {lines.map((line, lineIndex) => (
        <View key={`furigana-line-${lineIndex}`} style={styles.furiganaLine}>
          {line.length ? line.map((token, tokenIndex) => (
            token.reading ? (
              <View key={`furigana-token-${lineIndex}-${tokenIndex}`} style={styles.furiganaToken}>
                <Text style={styles.furiganaReading}>{token.reading}</Text>
                <Text style={styles.furiganaBase}>{token.text}</Text>
              </View>
            ) : (
              <Text key={`furigana-token-${lineIndex}-${tokenIndex}`} style={styles.furiganaPlain}>
                {token.text}
              </Text>
            )
          )) : <View style={styles.furiganaBlankLine} />}
        </View>
      ))}
    </View>
  );
}

function splitFuriganaLines(tokens: JapaneseFuriganaToken[]): JapaneseFuriganaToken[][] {
  const lines: JapaneseFuriganaToken[][] = [[]];

  tokens.forEach((token) => {
    const parts = token.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push([]);
      }

      if (part.length) {
        lines[lines.length - 1].push({ ...token, text: part });
      }
    });
  });

  return lines;
}

function MarkdownText({ text }: { text: string }) {
  const { styles } = useAppTheme();
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let inCodeBlock = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const key = `md-${index}`;

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return;
    }

    if (!trimmed) {
      blocks.push(<View key={key} style={styles.markdownGap} />);
      return;
    }

    if (inCodeBlock) {
      blocks.push(
        <Text key={key} style={styles.markdownCodeBlock}>
          {line}
        </Text>
      );
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push(
        <Text
          key={key}
          style={[
            styles.markdownHeading,
            heading[1].length > 1 && styles.markdownHeadingSmall,
          ]}
        >
          {renderInlineMarkdown(heading[2], key, styles)}
        </Text>
      );
      return;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      blocks.push(
        <View key={key} style={styles.markdownListRow}>
          <Text style={styles.markdownBullet}>•</Text>
          <Text style={styles.markdownListText}>{renderInlineMarkdown(bullet[1], key, styles)}</Text>
        </View>
      );
      return;
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      blocks.push(
        <View key={key} style={styles.markdownListRow}>
          <Text style={styles.markdownNumber}>{ordered[1]}.</Text>
          <Text style={styles.markdownListText}>{renderInlineMarkdown(ordered[2], key, styles)}</Text>
        </View>
      );
      return;
    }

    blocks.push(
      <Text key={key} style={styles.markdownParagraph}>
        {renderInlineMarkdown(line, key, styles)}
      </Text>
    );
  });

  return <View style={styles.markdownContainer}>{blocks}</View>;
}

function renderInlineMarkdown(text: string, keyPrefix: string, styles: AppStyles) {
  const segments: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    if (token.startsWith('`')) {
      segments.push(
        <Text key={`${keyPrefix}-code-${match.index}`} style={styles.markdownInlineCode}>
          {token.slice(1, -1)}
        </Text>
      );
    } else {
      segments.push(
        <Text key={`${keyPrefix}-strong-${match.index}`} style={styles.markdownStrong}>
          {token.slice(2, -2)}
        </Text>
      );
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return segments;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

function getOverlayFrame(item: OverlayItem, imageSize: ImageSize) {
  if (imageSize.width <= 0 || imageSize.height <= 0) {
    return null;
  }

  let x = 0;
  let y = 0;
  let width = 0;
  let height = 0;
  let angle = 0;

  if (item.rotate_rect) {
    const [cx, cy, w, h, rotateAngle] = item.rotate_rect;
    x = cx - w / 2;
    y = cy - h / 2;
    width = w;
    height = h;
    angle = rotateAngle || 0;
  } else if (item.location) {
    const xs = [item.location[0], item.location[2], item.location[4], item.location[6]];
    const ys = [item.location[1], item.location[3], item.location[5], item.location[7]];
    x = Math.min(...xs);
    y = Math.min(...ys);
    width = Math.max(...xs) - x;
    height = Math.max(...ys) - y;
    angle = Math.atan2(item.location[3] - item.location[1], item.location[2] - item.location[0]) * 180 / Math.PI;
  } else {
    return null;
  }

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  const leftPercent = clamp((x / imageSize.width) * 100, 0, 99);
  const topPercent = clamp((y / imageSize.height) * 100, 0, 99);
  const widthPercent = clamp((width / imageSize.width) * 100, 8, Math.max(8, 100 - leftPercent));
  const heightPercent = clamp((height / imageSize.height) * 100, 4, Math.max(4, 100 - topPercent));
  const maxLines = clamp(Math.round(heightPercent / 4), 1, 5);

  const style: ViewStyle = {
    left: `${leftPercent}%` as DimensionValue,
    top: `${topPercent}%` as DimensionValue,
    width: `${widthPercent}%` as DimensionValue,
    height: `${heightPercent}%` as DimensionValue,
    minHeight: 24,
    transform: [{ rotate: `${angle}deg` }],
  };

  return {
    maxLines,
    style,
  };
}

function SettingsSheet({
  visible,
  settings,
  sourceLang,
  initialJumpId,
  onClose,
  onSave,
  smokeVariant,
  smokeModelPackManifestUrl,
}: {
  visible: boolean;
  settings: AISettings;
  sourceLang: LanguageCode;
  initialJumpId?: SettingsJumpId | null;
  onClose: () => void;
  onSave: (settings: AISettings) => void | Promise<void>;
  smokeVariant?: SettingsSmokeVariant;
  smokeModelPackManifestUrl?: string;
}) {
  const { styles, theme } = useAppTheme();
  const [draft, setDraft] = useState<AISettings>(settings);
  const [configPassword, setConfigPassword] = useState('');
  const [configPayload, setConfigPayload] = useState('');
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrImportSmokePayload, setQrImportSmokePayload] = useState<string | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [configStatus, setConfigStatus] = useState<string | null>(null);
  const [isConfigBusy, setIsConfigBusy] = useState(false);
  const [localRuntimeStatuses, setLocalRuntimeStatuses] = useState<Partial<Record<SettingsLocalRuntimeCheckId, string>>>({});
  const [localRuntimeBusy, setLocalRuntimeBusy] = useState<SettingsLocalRuntimeCheckId | null>(null);
  const [installedModelPacks, setInstalledModelPacks] = useState<InstalledModelPack[]>([]);
  const [modelPackRootUri, setModelPackRootUri] = useState(getModelPackRootUri());
  const [modelPackStatus, setModelPackStatus] = useState<string | null>(null);
  const [modelPackBusyKey, setModelPackBusyKey] = useState<string | null>(null);
  const [modelPackManifestUrl, setModelPackManifestUrl] = useState('');
  const [modelPackSmokeRunKey, setModelPackSmokeRunKey] = useState<string | null>(null);
  const [activeSettingsCategory, setActiveSettingsCategory] = useState<SettingsCategoryId>('ai');
  const [cloudSyncStatus, setCloudSyncStatus] = useState(getMobileSettingsSyncStatus());
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(getMobileSettingsSyncEnabled());
  const [settingsContentReady, setSettingsContentReady] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (!visible) {
      setSettingsContentReady(Platform.OS === 'web');
      return;
    }
    if (Platform.OS === 'web') {
      setSettingsContentReady(true);
      return;
    }
    setSettingsContentReady(false);
    const task = InteractionManager.runAfterInteractions(() => setSettingsContentReady(true));
    return () => task.cancel();
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (initialJumpId) {
      setActiveSettingsCategory(getSettingsCategoryForJump(initialJumpId));
      return;
    }
    if (smokeVariant === 'qr-export' || smokeVariant === 'qr-import' || smokeVariant === 'config-roundtrip') {
      setActiveSettingsCategory('config');
      return;
    }
    if (smokeVariant === 'local-runtime' || smokeVariant === 'model-packs' || smokeVariant === 'model-pack-install') {
      setActiveSettingsCategory('offline');
      return;
    }
    setActiveSettingsCategory('ai');
  }, [initialJumpId, smokeVariant, visible]);

  useEffect(() => {
    if (!visible) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void Promise.all([
        loadMobileSettingsSyncEnabled(),
        refreshMobileSettingsSyncStatus(),
      ]).then(([enabled, status]) => {
        setCloudSyncEnabled(enabled);
        setCloudSyncStatus(status);
      });
    });
    return () => task.cancel();
  }, [visible]);

  const refreshInstalledModelPacks = useCallback(async () => {
    try {
      setModelPackRootUri(ensureModelPackRootDirectory());
      setInstalledModelPacks(await loadInstalledModelPacks());
      setModelPackStatus(null);
    } catch (error) {
      setModelPackRootUri(getModelPackRootUri());
      setInstalledModelPacks([]);
      setModelPackStatus(error instanceof Error ? error.message : 'Could not load local model packs.');
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setDraft(settings);
      setConfigPassword(smokeVariant === 'qr-export'
        ? 'tabitomo-smoke-password'
        : smokeVariant === 'qr-import'
          ? SMOKE_QR_IMPORT_PASSWORD
          : '');
      setConfigPayload(smokeVariant === 'qr-export' ? SMOKE_CONFIG_PAYLOAD : '');
      setQrImportSmokePayload(null);
      setConfigStatus(smokeVariant === 'qr-export'
          ? 'Encrypted .ttconfig payload copied. QR is ready below.'
          : smokeVariant === 'qr-import'
            ? 'Smoke: preparing encrypted QR import payload...'
          : null);
      setQrPayload(smokeVariant === 'qr-export' ? SMOKE_CONFIG_PAYLOAD : null);
      setShowQrScanner(false);
      setIsConfigBusy(false);
      setLocalRuntimeStatuses({});
      setLocalRuntimeBusy(null);
      setModelPackStatus(null);
      setModelPackBusyKey(null);
      setModelPackSmokeRunKey(null);
      setModelPackManifestUrl(smokeVariant === 'model-pack-install' ? smokeModelPackManifestUrl || '' : '');
      if (smokeVariant === 'model-packs') {
        setModelPackRootUri('file:///tabitomo-smoke/model-packs');
        setInstalledModelPacks(SMOKE_INSTALLED_MODEL_PACKS);
        setModelPackStatus('Smoke preview: model-pack compatibility states are synthetic.');
      } else if (smokeVariant === 'model-pack-install') {
        setModelPackStatus(smokeModelPackManifestUrl
          ? 'Smoke install will run automatically with a tiny local model pack.'
          : 'Smoke install is missing a model-pack manifest URL.');
        const task = InteractionManager.runAfterInteractions(() => {
          void refreshInstalledModelPacks();
        });
        return () => task.cancel();
      } else {
        const task = InteractionManager.runAfterInteractions(() => {
          void refreshInstalledModelPacks();
        });
        return () => task.cancel();
      }
    }
  }, [refreshInstalledModelPacks, settings, smokeModelPackManifestUrl, smokeVariant, visible]);

  const updateGeneralAI = (patch: Partial<AISettings['generalAI']>) => {
    setDraft((current) => ({ ...current, generalAI: { ...current.generalAI, ...patch } }));
  };

  const updateTranslation = (patch: Partial<AISettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateSpeech = (patch: Partial<AISettings['speechRecognition']>) => {
    setDraft((current) => ({ ...current, speechRecognition: { ...current.speechRecognition, ...patch } }));
  };

  const updateVLM = (patch: Partial<AISettings['vlm']>) => {
    setDraft((current) => ({ ...current, vlm: { ...current.vlm, ...patch } }));
  };

  const requireConfigPassword = (password = configPassword) => {
    if (!password.trim()) {
      setConfigStatus('Enter an export/import password first.');
      return false;
    }
    return true;
  };

  const exportCurrentConfigPayload = async () => {
    const payload = await exportConfigPayload(draft, configPassword);
    setConfigPayload(payload);
    setQrPayload(payload.length <= 2953 ? payload : null);
    await Clipboard.setStringAsync(payload);
    return payload;
  };

  const handleExportConfig = async () => {
    if (!requireConfigPassword()) return;
    try {
      setIsConfigBusy(true);
      const payload = await exportCurrentConfigPayload();
      setConfigStatus(payload.length <= 2953
        ? 'Encrypted .ttconfig payload copied. QR is ready below.'
        : 'Encrypted .ttconfig payload copied. It is too large for QR.');
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : 'Config export failed.');
    } finally {
      setIsConfigBusy(false);
    }
  };

  const handleShareConfigFile = async () => {
    if (!requireConfigPassword()) return;

    try {
      setIsConfigBusy(true);
      const payload = await exportCurrentConfigPayload();
      if (!(await Sharing.isAvailableAsync())) {
        setConfigStatus(payload.length <= 2953
          ? 'File sharing is unavailable here. Payload was copied and QR is ready below.'
          : 'File sharing is unavailable here. Payload was copied.');
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File(Paths.cache, `tabitomo-config-${timestamp}.ttconfig`);
      file.create({ overwrite: true });
      file.write(payload);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
        dialogTitle: 'Export tabitomo settings',
      });
      setConfigStatus('Encrypted .ttconfig file is ready to share. Payload was also copied.');
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : 'Config file export failed.');
    } finally {
      setIsConfigBusy(false);
    }
  };

  const handlePasteConfig = async () => {
    const value = await Clipboard.getStringAsync();
    setConfigPayload(value.trim());
    setConfigStatus(value.trim() ? 'Clipboard payload pasted.' : 'Clipboard is empty.');
  };

  const handleImportConfig = async (
    payload = configPayload,
    password = configPassword,
    options: { allowMissingSecureStoreEntitlement?: boolean } = {},
  ): Promise<SettingsImportResult> => {
    if (!requireConfigPassword(password)) {
      return { settings: null, phase: 'password', error: 'Missing config password.' };
    }
    if (!payload.trim()) {
      setConfigStatus('Paste or scan an encrypted config payload first.');
      return { settings: null, phase: 'payload', error: 'Missing config payload.' };
    }

    try {
      setIsConfigBusy(true);
      const imported = await importConfigPayload(payload, password);
      setDraft(imported);
      try {
        await onSave(imported);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Settings save failed.';
        if (options.allowMissingSecureStoreEntitlement && isMissingSecureStoreEntitlementError(error)) {
          setConfigStatus('Settings imported; unsigned simulator skipped SecureStore persistence.');
          return { settings: imported, phase: 'save-skipped-secure-store-entitlement' };
        }
        setConfigStatus(message);
        return { settings: null, phase: 'save', error: message };
      }
      setConfigStatus('Settings imported and saved.');
      return { settings: imported, phase: 'saved' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Config import failed.';
      setConfigStatus(message);
      return { settings: null, phase: 'decrypt', error: message };
    } finally {
      setIsConfigBusy(false);
    }
  };

  const handleImportConfigFile = async () => {
    if (!requireConfigPassword()) return;

    try {
      setIsConfigBusy(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });

      if (result.canceled) {
        setConfigStatus('Config file import cancelled.');
        return;
      }

      const asset = result.assets[0];
      if (!asset) {
        throw new Error('No config file was selected.');
      }

      const payload = (await new File(asset.uri).text()).trim();
      if (!payload) {
        throw new Error('The selected config file is empty.');
      }

      const imported = await importConfigPayload(payload, configPassword);
      setDraft(imported);
      setConfigPayload(payload);
      setQrPayload(payload.length <= 2953 ? payload : null);
      await onSave(imported);
      setConfigStatus(`${asset.name || '.ttconfig'} imported and saved.`);
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : 'Config file import failed.');
    } finally {
      setIsConfigBusy(false);
    }
  };

  const handleScannedConfig = async (payload: string) => {
    setShowQrScanner(false);
    setConfigPayload(payload);
    const password = smokeVariant === 'qr-import' ? SMOKE_QR_IMPORT_PASSWORD : configPassword;
    const importResult = await handleImportConfig(payload, password, {
      allowMissingSecureStoreEntitlement: smokeVariant === 'qr-import',
    });

    if (smokeVariant !== 'qr-import') {
      return;
    }

    if (!importResult.settings) {
      writeQrImportSmokeResult({
        passed: false,
        status: 'failed',
        error: 'QR import returned no imported settings.',
        phase: importResult.phase,
        diagnostic: sanitizeQrImportSmokeDiagnostic(importResult.error),
        payloadLength: payload.length,
        passwordPresent: Boolean(password),
        privacy: {
          redacted: true,
          apiKeysOmitted: true,
          payloadOmitted: true,
        },
      });
      return;
    }

    const checks = getQrImportSmokeChecks(importResult.settings);
    const failed = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);

    writeQrImportSmokeResult({
      passed: failed.length === 0,
      status: failed.length === 0 ? 'passed' : 'failed',
      checks,
      failed,
      payloadLength: payload.length,
      storage: importResult.phase === 'saved' ? 'persisted' : 'skipped-secure-store-entitlement',
      privacy: {
        redacted: true,
        apiKeysOmitted: true,
        payloadOmitted: true,
      },
    });
  };

  const runLocalRuntimeCheck = async (
    id: SettingsLocalRuntimeCheckId,
    task: () => Promise<string>
  ) => {
    setLocalRuntimeBusy(id);
    setLocalRuntimeStatuses((current) => ({ ...current, [id]: 'Checking...' }));
    try {
      const status = await task();
      setLocalRuntimeStatuses((current) => ({ ...current, [id]: status }));
    } catch (error) {
      setLocalRuntimeStatuses((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : 'Runtime check failed.',
      }));
    } finally {
      setLocalRuntimeBusy(null);
    }
  };

  const checkLocalASRRuntime = async () => {
    if (Platform.OS !== 'ios') {
      return 'Local ASR validation requires an iOS native build.';
    }
    const modelId = getSelectedLocalASRModelId(draft);
    const pack = getReadyInstalledModelPackById(installedModelPacks, modelId);
    if (pack) {
      const validation = await validateNativeLocalModelPackAsync(modelId, pack.rootUri);
      return `${pack.label || pack.id} ${pack.version} loaded with ${validation.runtime}.`;
    }
    const locale = nativeSpeechLocale(sourceLang);
    const [speechAvailable, onDeviceAvailable] = await Promise.all([
      isNativeSpeechAvailableAsync(locale),
      isNativeOnDeviceSpeechAvailableAsync(locale),
    ]);
    if (onDeviceAvailable) {
      return `${modelId === 'whisper-base' ? 'Whisper Base' : 'SenseVoice Small'} is not ready. Apple on-device Speech is available for ${locale} as fallback.`;
    }
    if (speechAvailable) {
      return `Apple Speech is available for ${locale}, but on-device recognition is not.`;
    }
    return `Apple Speech is unavailable for ${locale} on this runtime.`;
  };

  const checkLocalOCRRuntime = async () => {
    if (Platform.OS !== 'ios') {
      return 'Local OCR validation requires an iOS native build.';
    }
    const pack = getReadyInstalledModelPackById(installedModelPacks, 'ppocr-v6-small');
    if (pack) {
      const validation = await validateNativeLocalModelPackAsync('ppocr-v6-small', pack.rootUri);
      return `${pack.label || 'PP-OCR v6 Small'} ${pack.version} loaded with ${validation.runtime}.`;
    }
    const visionAvailable = await isNativeVisionAvailableAsync();
    const languages = nativeVisionOCRLanguages(sourceLang);
    if (!visionAvailable) {
      return 'PP-OCR v6 Small is not ready, and Apple Vision OCR is unavailable in this build.';
    }
    return languages.length
      ? `PP-OCR v6 Small is not ready. Apple Vision fallback is available for ${languages.join(', ')}.`
      : 'PP-OCR v6 Small is not ready. Apple Vision fallback will use language auto-detection.';
  };

  const handleDeleteModelPack = async (pack: InstalledModelPack) => {
    const packKey = getModelPackKey(pack);
    setModelPackBusyKey(packKey);
    setModelPackStatus(`Removing ${pack.id}...`);
    try {
      if (isNativeLocalModelId(pack.id)) {
        await unloadNativeLocalModelAsync(pack.id, pack.rootUri);
      }
      deleteInstalledModelPackFiles(pack);
      const nextInstalled = installedModelPacks.filter((installed) => getModelPackKey(installed) !== packKey);
      await saveInstalledModelPacks(nextInstalled);
      setInstalledModelPacks(nextInstalled);
      setModelPackStatus(`${pack.id} removed.`);
    } catch (error) {
      setModelPackStatus(error instanceof Error ? error.message : 'Could not remove local model pack.');
    } finally {
      setModelPackBusyKey(null);
    }
  };

  const handleInstallModelPack = async () => {
    setModelPackBusyKey(MODEL_PACK_INSTALL_BUSY_KEY);
    setModelPackStatus('Preparing model-pack install...');
    try {
      const result = await installModelPackFromManifestUrl({
        manifestUrl: modelPackManifestUrl,
        existingInstalled: installedModelPacks,
        onStatus: setModelPackStatus,
      });
      await saveInstalledModelPacks(result.installed);
      setInstalledModelPacks(result.installed);
      setModelPackStatus(`${result.installedPack.id} ${result.installedPack.version} installed.`);
    } catch (error) {
      setModelPackStatus(error instanceof Error ? error.message : 'Model-pack install failed.');
    } finally {
      setModelPackBusyKey(null);
    }
  };

  const handleInstallOfflineModel = async (modelId: OfflineModelId) => {
    const model = getOfflineModelDefinition(modelId);
    setModelPackBusyKey(model.id);
    setModelPackStatus(`Preparing ${model.label}...`);
    try {
      const result = await installOfflineModel({
        modelId,
        existingInstalled: installedModelPacks,
        validateInstalledPack: async (installedPack) => {
          await unloadNativeLocalModelAsync(model.id, installedPack.rootUri);
          try {
            await validateNativeLocalModelPackAsync(model.id, installedPack.rootUri);
          } catch (error) {
            await unloadNativeLocalModelAsync(model.id, installedPack.rootUri);
            throw new Error(`${model.label} downloaded but failed native runtime validation: ${
              error instanceof Error ? error.message : 'unknown validation error'
            }`);
          }
        },
        onStatus: setModelPackStatus,
      });
      const superseded = result.installed.filter((pack) => (
        pack.id === result.installedPack.id
        && getModelPackKey(pack) !== getModelPackKey(result.installedPack)
      ));
      for (const pack of superseded) {
        if (isNativeLocalModelId(pack.id)) {
          await unloadNativeLocalModelAsync(pack.id, pack.rootUri);
        }
        deleteInstalledModelPackFiles(pack);
      }
      const installed = result.installed.filter((pack) => (
        pack.id !== result.installedPack.id
        || getModelPackKey(pack) === getModelPackKey(result.installedPack)
      ));
      await saveInstalledModelPacks(installed);
      setInstalledModelPacks(installed);
      setModelPackStatus(`${model.label} was downloaded and verified.`);
    } catch (error) {
      setModelPackStatus(error instanceof Error ? error.message : `${model.label} download failed.`);
    } finally {
      setModelPackBusyKey(null);
    }
  };

  const handleCloudSyncChange = async (enabled: boolean) => {
    setCloudSyncEnabled(enabled);
    try {
      await setMobileSettingsSyncEnabled(enabled);
      if (enabled) {
        const saved = await saveMobileSettings(draft);
        setDraft(saved);
      }
      setCloudSyncStatus(await refreshMobileSettingsSyncStatus());
    } catch (error) {
      setCloudSyncEnabled(!enabled);
      setCloudSyncStatus({
        state: 'error',
        detail: error instanceof Error ? error.message.replace(/CloudKit/gi, 'iCloud') : 'Could not update iCloud sync.',
      });
    }
  };

  const installedModelPackBytes = getInstalledModelPackBytes(installedModelPacks);
  const modelPackRuntimeEnvironment = useMemo<ModelPackRuntimeEnvironment>(getModelPackRuntimeEnvironment, []);
  const modelPackCompatibilityByKey = useMemo(() => {
    const entries = installedModelPacks.map((pack) => [
      getModelPackKey(pack),
      evaluateInstalledModelPackCompatibility(pack, modelPackRuntimeEnvironment),
    ] as const);
    return new Map(entries);
  }, [installedModelPacks, modelPackRuntimeEnvironment]);
  const asrModelPackActivation = useMemo(() => (
    selectModelPackActivation(
      installedModelPacks.filter((pack) => pack.id === getSelectedLocalASRModelId(draft)),
      modelPackRuntimeEnvironment,
      'asr',
      getNativeBaselineModelPackRuntime('asr')
    )
  ), [draft.speechRecognition.localEngine, installedModelPacks, modelPackRuntimeEnvironment]);
  const ocrModelPackActivation = useMemo(() => (
    selectModelPackActivation(
      installedModelPacks.filter((pack) => pack.id === 'ppocr-v6-small'),
      modelPackRuntimeEnvironment,
      'ocr',
      getNativeBaselineModelPackRuntime('ocr')
    )
  ), [installedModelPacks, modelPackRuntimeEnvironment]);
  const readyModelPackCount = installedModelPacks.filter((pack) => (
    modelPackCompatibilityByKey.get(getModelPackKey(pack))?.canActivate
  )).length;
  const selectedWhisperModelId: OfflineModelId = 'whisper-base';
  const speechOfflineModels = [
    getOfflineModelDefinition(selectedWhisperModelId),
    getOfflineModelDefinition('sensevoice-small'),
  ];
  const ppocrOfflineModel = getOfflineModelDefinition('ppocr-v6-small');
  const translationModelForOutputMode = hasProviderConnection(draft)
    ? draft.modelName
    : draft.generalAI.modelName;
  const isHunyuanTranslationModel = isHunyuanMTModel(translationModelForOutputMode);

  useEffect(() => {
    if (!visible || !isHunyuanTranslationModel || draft.translation.outputMode === 'plain') {
      return;
    }

    setDraft((current) => {
      const currentModel = hasProviderConnection(current)
        ? current.modelName
        : current.generalAI.modelName;
      if (!isHunyuanMTModel(currentModel) || current.translation.outputMode === 'plain') {
        return current;
      }
      return {
        ...current,
        translation: {
          ...current.translation,
          outputMode: 'plain',
        },
      };
    });
  }, [draft.translation.outputMode, isHunyuanTranslationModel, translationModelForOutputMode, visible]);

  useEffect(() => {
    if (!visible || smokeVariant !== 'hunyuan-output') {
      return;
    }

    const passed = isHunyuanTranslationModel && draft.translation.outputMode === 'plain';
    writeHunyuanOutputSmokeResult({
      passed,
      status: passed ? 'passed' : 'running',
      modelName: translationModelForOutputMode,
      outputMode: draft.translation.outputMode,
      structuredDisabled: isHunyuanTranslationModel,
      privacy: {
        redacted: true,
        apiKeysOmitted: true,
      },
    });
  }, [draft.translation.outputMode, isHunyuanTranslationModel, smokeVariant, translationModelForOutputMode, visible]);

  useEffect(() => {
    if (!visible || smokeVariant !== 'qr-import') {
      return;
    }

    let isCancelled = false;

    const runSmoke = async () => {
      writeQrImportSmokeResult({
        passed: false,
        status: 'running',
        privacy: {
          redacted: true,
          apiKeysOmitted: true,
          payloadOmitted: true,
        },
      });

      try {
        const payload = await exportConfigPayload(createQrImportSmokeSettings(), SMOKE_QR_IMPORT_PASSWORD);

        if (isCancelled) {
          return;
        }

        setConfigPayload(payload);
        setQrImportSmokePayload(payload);
        setQrPayload(payload.length <= 2953 ? payload : null);
        setConfigStatus('Smoke: generated encrypted QR payload; scanning it through the native QR callback...');
        setShowQrScanner(true);
      } catch (error) {
        writeQrImportSmokeResult({
          passed: false,
          status: 'failed',
          error: error instanceof Error ? error.message : 'QR import smoke setup failed.',
          privacy: {
            redacted: true,
            apiKeysOmitted: true,
            payloadOmitted: true,
          },
        });
      }
    };

    void runSmoke();

    return () => {
      isCancelled = true;
    };
  }, [smokeVariant, visible]);

  useEffect(() => {
    if (!visible || smokeVariant !== 'model-pack-install') {
      return;
    }

    const manifestUrl = smokeModelPackManifestUrl?.trim();
    if (!manifestUrl || modelPackSmokeRunKey === manifestUrl) {
      return;
    }

    let isCancelled = false;
    setModelPackSmokeRunKey(manifestUrl);

    const runSmoke = async () => {
      setModelPackBusyKey(MODEL_PACK_INSTALL_BUSY_KEY);
      setModelPackStatus('Smoke: preparing tiny model-pack install...');
      writeModelPackSmokeResult({
        passed: false,
        status: 'running',
        manifestUrl,
      });

      try {
        const existingInstalled = await loadInstalledModelPacks();
        const firstResult = await installModelPackFromManifestUrl({
          manifestUrl,
          existingInstalled,
          onStatus: (status) => {
            if (!isCancelled) {
              setModelPackStatus(`Smoke: ${status}`);
            }
          },
        });

        if (!isCancelled) {
          setModelPackStatus(`Smoke: first install passed for ${firstResult.installedPack.id}; replacing tiny pack...`);
        }

        const result = await installModelPackFromManifestUrl({
          manifestUrl,
          existingInstalled: firstResult.installed,
          onStatus: (status) => {
            if (!isCancelled) {
              setModelPackStatus(`Smoke replace: ${status}`);
            }
          },
        });
        const packKey = getModelPackKey(result.installedPack);

        for (const file of result.installedPack.files) {
          if (!new File(file.uri).exists) {
            throw new Error(`Installed file "${file.name}" was not written.`);
          }
        }
        const leftoverInstallArtifacts = listModelPackInstallArtifactUris(result.installedPack);
        if (leftoverInstallArtifacts.length > 0) {
          throw new Error(`Model-pack replacement left install artifacts: ${leftoverInstallArtifacts.join(', ')}`);
        }

        await saveInstalledModelPacks(result.installed);
        const compatibility = evaluateInstalledModelPackCompatibility(result.installedPack, modelPackRuntimeEnvironment);
        if (!compatibility.canActivate) {
          throw new Error(`Installed smoke pack is not ready: ${compatibility.reason}`);
        }
        const activation = selectModelPackActivation(
          result.installed,
          modelPackRuntimeEnvironment,
          result.installedPack.feature,
          getNativeBaselineModelPackRuntime(result.installedPack.feature)
        );
        if (activation.status !== 'installed-pack' || !activation.pack || getModelPackKey(activation.pack) !== packKey) {
          throw new Error(`Installed smoke pack was not selected for activation: ${activation.reason}`);
        }

        if (!isCancelled) {
          setInstalledModelPacks(result.installed);
          setModelPackStatus(`Smoke install passed for ${result.installedPack.id}; deleting tiny pack...`);
        }

        deleteInstalledModelPackFiles(result.installedPack);
        const nextInstalled = result.installed.filter((pack) => getModelPackKey(pack) !== packKey);
        await saveInstalledModelPacks(nextInstalled);

        for (const file of result.installedPack.files) {
          if (new File(file.uri).exists) {
            throw new Error(`Deleted file "${file.name}" still exists.`);
          }
        }
        const leftoverDeleteArtifacts = listModelPackInstallArtifactUris(result.installedPack);
        if (leftoverDeleteArtifacts.length > 0) {
          throw new Error(`Model-pack delete left install artifacts: ${leftoverDeleteArtifacts.join(', ')}`);
        }

        if (!isCancelled) {
          setInstalledModelPacks(nextInstalled);
          setModelPackStatus(`Smoke install/delete passed: ${result.installedPack.id} verified and removed.`);
        }
        writeModelPackSmokeResult({
          passed: true,
          status: 'passed',
          manifestUrl,
          packKey,
          bytes: result.installedPack.bytes,
          compatibility: compatibility.status,
          activation: {
            status: activation.status,
            runtime: activation.runtime,
            packKey: activation.pack ? getModelPackKey(activation.pack) : null,
            reason: activation.reason,
          },
          deleted: true,
          replacementClean: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Model-pack smoke failed.';
        if (!isCancelled) {
          setModelPackStatus(`Smoke failed: ${message}`);
        }
        writeModelPackSmokeResult({
          passed: false,
          status: 'failed',
          manifestUrl,
          error: message,
        });
      } finally {
        if (!isCancelled) {
          setModelPackBusyKey(null);
        }
      }
    };

    void runSmoke();

    return () => {
      isCancelled = true;
    };
  }, [
    modelPackRuntimeEnvironment,
    modelPackSmokeRunKey,
    smokeModelPackManifestUrl,
    smokeVariant,
    visible,
  ]);

  return (
    <>
      <PopupPanel
        visible={visible}
        onClose={onClose}
        panelStyle={styles.settingsSheet}
        baseBottomPadding={10}
      >
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.sheetTitle}>Settings</Text>
              <Text style={styles.sheetSubtitle}>Stored securely on this device.</Text>
            </View>
            <IconButton icon={X} label="Close" onPress={onClose} compact />
          </View>

          <SettingsCategoryBar
            active={activeSettingsCategory}
            onChange={setActiveSettingsCategory}
          />

          <ScrollView
            key={activeSettingsCategory}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.settingsContent}
          >
            {!settingsContentReady ? (
              <View style={styles.settingsContentLoading}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : (
              <>
            {activeSettingsCategory === 'config' && smokeVariant === 'qr-export' && (
              <SettingsSection title="Import / Export preview">
                <Text style={styles.settingsHelp}>
                  Deterministic preview for the encrypted settings QR surface.
                </Text>
                <QRCodePreview payload={SMOKE_CONFIG_PAYLOAD} />
                <Text style={styles.configStatus}>Encrypted .ttconfig payload copied. QR is ready below.</Text>
              </SettingsSection>
            )}

            {activeSettingsCategory === 'config' && smokeVariant === 'config-roundtrip' && (
              <SettingsSection title="Config round-trip smoke">
                <Text style={styles.settingsHelp}>
                  Exports encrypted settings, imports the prefixed payload, saves it to native storage, reloads it, and writes a redacted result for the iOS simulator smoke.
                </Text>
              </SettingsSection>
            )}

            {activeSettingsCategory === 'offline' && smokeVariant === 'model-packs' && (
              <SettingsSection title="Local model pack preview">
                <Text style={styles.settingsHelp}>
                  Synthetic installed packs verify ready, fallback, and incompatible model states.
                </Text>
                <LocalModelStatusRow
                  icon={Mic}
                  label="Active ASR"
                  detail={modelPackActivationDetail(asrModelPackActivation)}
                />
                <LocalModelStatusRow
                  icon={ScanText}
                  label="Active OCR"
                  detail={modelPackActivationDetail(ocrModelPackActivation)}
                />
                <LocalModelStatusRow
                  icon={Download}
                  label="Custom packs"
                  detail={`${installedModelPacks.length} installed · ${readyModelPackCount} ready · ${formatModelPackBytes(installedModelPackBytes)}`}
                />
                {installedModelPacks.map((pack) => {
                  const packKey = getModelPackKey(pack);
                  const compatibility = modelPackCompatibilityByKey.get(packKey)
                    ?? evaluateInstalledModelPackCompatibility(pack, modelPackRuntimeEnvironment);
                  return (
                    <InstalledModelPackRow
                      key={packKey}
                      pack={pack}
                      compatibility={compatibility}
                      busy={false}
                      disabled
                      onDelete={() => undefined}
                    />
                  );
                })}
                {modelPackStatus && <Text style={styles.configStatus}>{modelPackStatus}</Text>}
              </SettingsSection>
            )}

            {activeSettingsCategory === 'offline' && smokeVariant === 'model-pack-install' && (
              <SettingsSection title="Local model install smoke">
                <Text style={styles.settingsHelp}>
                  Downloads a tiny local manifest, verifies bytes and SHA-256, stages the pack, checks readiness, then deletes it.
                </Text>
                <LocalModelStatusRow
                  icon={Download}
                  label="Tiny pack"
                  detail={modelPackBusyKey === MODEL_PACK_INSTALL_BUSY_KEY
                    ? 'Install/delete smoke is running...'
                    : `${installedModelPacks.length} installed · ${readyModelPackCount} ready · ${formatModelPackBytes(installedModelPackBytes)}`}
                />
                <Text style={styles.modelPackRoot} numberOfLines={2}>
                  {modelPackManifestUrl || 'No manifest URL provided.'}
                </Text>
                {modelPackStatus && <Text style={styles.configStatus}>{modelPackStatus}</Text>}
              </SettingsSection>
            )}

            {activeSettingsCategory === 'offline' && smokeVariant === 'local-runtime' && (
              <SettingsSection title="Native local runtime preview">
                <Text style={styles.settingsHelp}>
                  Local ASR and Local PP-OCR are selected. These checks load a downloaded model when present and report the native fallback otherwise.
                </Text>
                <RuntimeCheckButton
                  icon={Mic}
                  label="Check local ASR"
                  detail="Loads the selected Whisper or SenseVoice model, or reports the Apple Speech fallback."
                  running={false}
                  disabled={false}
                  onPress={() => runLocalRuntimeCheck('asr', checkLocalASRRuntime)}
                />
                <RuntimeCheckButton
                  icon={ScanText}
                  label="Check local OCR"
                  detail="Loads PP-OCR v6 Small, or reports the Apple Vision fallback."
                  running={false}
                  disabled={false}
                  onPress={() => runLocalRuntimeCheck('ocr', checkLocalOCRRuntime)}
                />
              </SettingsSection>
            )}

            {activeSettingsCategory === 'ai' && smokeVariant === 'hunyuan-output' && (
              <SettingsSection title="Hunyuan-MT output smoke">
                <Text style={styles.settingsHelp}>
                  Hunyuan-MT is selected for translation. Plain output must be active and Structured mode must be disabled.
                </Text>
                <Text style={styles.configStatus}>
                  {`Model: ${translationModelForOutputMode || 'none'} · Output: ${draft.translation.outputMode} · Structured disabled: ${isHunyuanTranslationModel ? 'yes' : 'no'}`}
                </Text>
              </SettingsSection>
            )}

            {activeSettingsCategory === 'ai' && (
              <>
            <SettingsSection
              title="General AI"
              help="Connect your account or use any compatible provider. The API format must match the endpoint. Choose an image-capable model for direct photo translation."
            >
              {visible && <AIConnection theme={theme} value={draft.generalAI} onChange={(generalAI) => setDraft((current) => ({ ...current, generalAI }))} />}
              <ChoiceRow
                options={API_FORMAT_OPTIONS.map((option) => option.value)}
                labels={API_FORMAT_OPTIONS.reduce<Record<string, string>>((labels, option) => {
                  labels[option.value] = option.label;
                  return labels;
                }, {})}
                value={draft.generalAI.apiFormat}
                onChange={(value) => updateGeneralAI({ apiFormat: value as APIFormat })}
              />
              <Field label="Endpoint" value={draft.generalAI.endpoint} onChangeText={(endpoint) => updateGeneralAI({ endpoint })} placeholder="https://api.openai.com/v1" />
              <Field label="Model" value={draft.generalAI.modelName} onChangeText={(modelName) => updateGeneralAI({ modelName })} placeholder="Model ID" />
              <Field label="API key" value={draft.generalAI.apiKey} onChangeText={(apiKey) => updateGeneralAI({ apiKey })} secureTextEntry placeholder="sk-..." />
            </SettingsSection>

            <SettingsSection
              title="Translation override"
              help="Use General AI for the simplest setup. Choose Separate model only when translation should use a different provider or specialized translation model. Structured output improves parsing; some models, including Hunyuan-MT, require Plain output."
            >
              <ChoiceRow
                options={['general', 'custom']}
                labels={{ general: 'General AI', custom: 'Separate model' }}
                value={draft.provider === 'custom' ? 'custom' : 'general'}
                onChange={(mode) => mode === 'general'
                  ? setDraft((current) => normalizeSettings(clearTranslationOverride(current)))
                  : updateTranslation({ provider: 'custom' })}
              />
              {draft.provider === 'custom' && (
                <>
                <ChoiceRow
                  options={['structured', 'plain']}
                  value={isHunyuanTranslationModel ? 'plain' : draft.translation.outputMode}
                  labels={{ structured: 'Structured', plain: 'Plain' }}
                  disabledOptions={isHunyuanTranslationModel ? ['structured'] : []}
                  onChange={(outputMode) => setDraft((current) => ({ ...current, translation: { ...current.translation, outputMode: outputMode as 'structured' | 'plain' } }))}
                />
                  {isHunyuanTranslationModel && (
                    <Text style={styles.settingsHelp}>Hunyuan-MT requires plain text output.</Text>
                  )}
                  <Field label="Endpoint" value={draft.endpoint} onChangeText={(endpoint) => updateTranslation({ endpoint, provider: 'custom' })} placeholder="https://api.example.com/v1" />
                  <Field label="Model" value={draft.modelName} onChangeText={(modelName) => updateTranslation({ modelName, provider: 'custom' })} placeholder="Translation model" />
                  <Field label="API key" value={draft.apiKey} onChangeText={(apiKey) => updateTranslation({ apiKey, provider: 'custom' })} secureTextEntry placeholder="Provider API key" />
                </>
              )}
            </SettingsSection>
              </>
            )}

            {activeSettingsCategory === 'speech' && (
            <SettingsSection
              title="Speech"
              help="Native uses Apple Speech. Cloud API uploads a recording to your configured transcription provider. Local uses a downloaded Whisper or SenseVoice model when the compatible native runtime is available, with Apple on-device Speech as fallback."
            >
              <ChoiceRow
                options={['web-speech', 'siliconflow', 'local']}
                labels={{ 'web-speech': 'Native', siliconflow: 'Cloud API', local: 'Local' }}
                value={draft.speechRecognition.provider}
                onChange={(provider) => updateSpeech({ provider: provider as SpeechRecognitionProvider })}
              />
              {draft.speechRecognition.provider === 'siliconflow' && (
                <>
                  <Field label="Endpoint" value={draft.speechRecognition.endpoint || ''} onChangeText={(endpoint) => updateSpeech({ endpoint })} placeholder="https://api.example.com/v1" />
                  <Field label="Model" value={draft.speechRecognition.modelName || ''} onChangeText={(modelName) => updateSpeech({ modelName })} placeholder="Transcription model" />
                  <Field label="API key" value={draft.speechRecognition.apiKey || ''} onChangeText={(apiKey) => updateSpeech({ apiKey })} secureTextEntry placeholder="Provider API key" />
                </>
              )}
              {draft.speechRecognition.provider === 'local' && (
                <>
                  <Text style={styles.settingsHelp}>Choose an offline speech engine and download it directly from tabitomo assets. The selected model runs fully on this device. Apple on-device Speech is used only when that model is missing or cannot load.</Text>
                  <ChoiceRow
                    options={['whisper', 'sensevoice']}
                    value={draft.speechRecognition.localEngine || 'whisper'}
                    labels={{ whisper: 'Whisper', sensevoice: 'SenseVoice' }}
                    onChange={(localEngine) => updateSpeech({ localEngine: localEngine as LocalAsrEngine })}
                  />
                  {speechOfflineModels
                    .filter((model) => draft.speechRecognition.localEngine === 'sensevoice'
                      ? model.id === 'sensevoice-small'
                      : model.id === selectedWhisperModelId)
                    .map((model) => {
                      const installed = installedModelPacks.find((pack) => pack.id === model.packId);
                      return (
                        <OfflineModelRow
                          key={model.id}
                          model={model}
                          installed={installed}
                          busy={modelPackBusyKey === model.id}
                          disabled={modelPackBusyKey !== null && modelPackBusyKey !== model.id}
                          onDownload={() => handleInstallOfflineModel(model.id)}
                          onDelete={() => installed && handleDeleteModelPack(installed)}
                        />
                      );
                    })}
                  <ChoiceRow
                    options={['silero', 'energy', 'off']}
                    value={draft.speechRecognition.vadMode || 'silero'}
                    labels={{ silero: 'Silero VAD', energy: 'Energy', off: 'Off' }}
                    onChange={(vadMode) => updateSpeech({ vadMode: vadMode as LocalVadMode })}
                  />
                  {draft.speechRecognition.localEngine === 'sensevoice' ? (
                    <>
                      <ChoiceRow
                        options={['auto', 'zh', 'en', 'ja', 'ko', 'yue']}
                        value={draft.speechRecognition.senseVoiceLanguage || 'auto'}
                        labels={{ auto: 'Auto', zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean', yue: 'Cantonese' }}
                        onChange={(senseVoiceLanguage) => updateSpeech({ senseVoiceLanguage: senseVoiceLanguage as SenseVoiceLanguage })}
                      />
                      <SettingToggle
                        label="SenseVoice ITN"
                        value={draft.speechRecognition.senseVoiceUseItn ?? true}
                        onValueChange={(senseVoiceUseItn) => updateSpeech({ senseVoiceUseItn })}
                      />
                    </>
                  ) : (
                    <>
                      <Field label="Whisper language" value={draft.speechRecognition.whisperLanguage || 'auto'} onChangeText={(whisperLanguage) => updateSpeech({ whisperLanguage })} placeholder="auto / en / ja / zh" />
                      <ChoiceRow
                        options={['transcribe', 'translate']}
                        value={draft.speechRecognition.whisperTask || 'transcribe'}
                        labels={{ transcribe: 'Transcribe', translate: 'Translate' }}
                        onChange={(whisperTask) => updateSpeech({ whisperTask: whisperTask as WhisperTask })}
                      />
                    </>
                  )}
                </>
              )}
            </SettingsSection>
            )}

            {activeSettingsCategory === 'image' && (
            <SettingsSection title="Image OCR" help={OCR_HELP}>
              <OCRFields settings={draft} onChange={setDraft} />
              {draft.imageOCR.provider === 'local-ppocr' && !draft.imageOCR.useGeneralAI && (() => {
                const installed = installedModelPacks.find((pack) => pack.id === ppocrOfflineModel.packId);
                return (
                  <>
                    <Text style={styles.settingsHelp}>Download and verify PP-OCR v6 Small on this device. Once ready, PP-OCR handles image text locally; Apple Vision is used only when the model is missing or cannot run.</Text>
                    <OfflineModelRow
                      model={ppocrOfflineModel}
                      installed={installed}
                      busy={modelPackBusyKey === ppocrOfflineModel.id}
                      disabled={modelPackBusyKey !== null && modelPackBusyKey !== ppocrOfflineModel.id}
                      onDownload={() => handleInstallOfflineModel(ppocrOfflineModel.id)}
                      onDelete={() => installed && handleDeleteModelPack(installed)}
                    />
                  </>
                );
              })()}
            </SettingsSection>
            )}

            {activeSettingsCategory === 'offline' && (
              <>
            <SettingsSection title="Native local runtime">
              <Text style={styles.settingsHelp}>
                Validates the iOS native replacements used by Local speech and Local PP-OCR for the current source language, {languageLabel(sourceLang)}.
              </Text>
              <RuntimeCheckButton
                icon={Mic}
                label="Check local ASR"
                detail={localRuntimeStatuses.asr || (draft.speechRecognition.provider === 'local'
                  ? modelPackActivationDetail(asrModelPackActivation)
                  : 'Shows whether Local speech can run on this iOS build.')}
                running={localRuntimeBusy === 'asr'}
                disabled={localRuntimeBusy !== null && localRuntimeBusy !== 'asr'}
                onPress={() => runLocalRuntimeCheck('asr', checkLocalASRRuntime)}
              />
              <RuntimeCheckButton
                icon={ScanText}
                label="Check local OCR"
                detail={localRuntimeStatuses.ocr || (draft.imageOCR.provider === 'local-ppocr' && !draft.imageOCR.useGeneralAI
                  ? modelPackActivationDetail(ocrModelPackActivation)
                  : 'Shows whether Local PP-OCR can use the iOS Vision module.')}
                running={localRuntimeBusy === 'ocr'}
                disabled={localRuntimeBusy !== null && localRuntimeBusy !== 'ocr'}
                onPress={() => runLocalRuntimeCheck('ocr', checkLocalOCRRuntime)}
              />
            </SettingsSection>

            <SettingsSection
              title="Local models"
              help="Offline models are downloaded only from tabitomo's fixed asset domain, verified before activation, and stored on this device. They are not included in iCloud sync or configuration exports. Downloading a larger model can improve accuracy but uses more storage."
            >
              <Text style={styles.settingsHelp}>
                Download supported models directly from assets.tabitomo.alkinum.io. Model files stay on this device and are never included in iCloud sync or settings exports.
              </Text>
              <LocalModelStatusRow
                icon={Mic}
                label="Active ASR"
                detail={modelPackActivationDetail(asrModelPackActivation)}
              />
              <LocalModelStatusRow
                icon={ScanText}
                label="Active OCR"
                detail={modelPackActivationDetail(ocrModelPackActivation)}
              />
              <LocalModelStatusRow
                icon={Download}
                label="Downloaded models"
                detail={`${installedModelPacks.length} downloaded · ${readyModelPackCount} runtime-ready · ${formatModelPackBytes(installedModelPackBytes)}`}
              />
              {[...speechOfflineModels, ppocrOfflineModel].map((model) => {
                const installed = installedModelPacks.find((pack) => pack.id === model.packId);
                return (
                  <OfflineModelRow
                    key={model.id}
                    model={model}
                    installed={installed}
                    busy={modelPackBusyKey === model.id}
                    disabled={modelPackBusyKey !== null && modelPackBusyKey !== model.id}
                    onDownload={() => handleInstallOfflineModel(model.id)}
                    onDelete={() => installed && handleDeleteModelPack(installed)}
                  />
                );
              })}
              {modelPackStatus && <Text style={styles.configStatus}>{modelPackStatus}</Text>}
            </SettingsSection>
              </>
            )}

            {activeSettingsCategory === 'image' && (
            <SettingsSection
              title="VLM image translation"
              help="A VLM translates an image directly. General AI reuses the main model. OCR settings reuse your configured vision model. The legacy Qwen adapter uses its corresponding vision endpoint. Custom uses a dedicated vision model."
            >
              <ChoiceRow
                options={['general', 'ocr', 'custom']}
                labels={{ general: 'General AI', ocr: 'OCR settings', custom: 'Custom' }}
                value={draft.vlm.useGeneralAI ? 'general' : draft.vlm.useCustom ? 'custom' : 'ocr'}
                onChange={(mode) => updateVLM({
                  useGeneralAI: mode === 'general',
                  useCustom: mode === 'custom',
                })}
              />
              <SettingToggle label="Show thinking" value={draft.vlm.enableThinking} onValueChange={(enableThinking) => updateVLM({ enableThinking })} />
              {!draft.vlm.useGeneralAI && !draft.vlm.useCustom && (
                <View style={styles.linkedSettingsPanel}>
                  <Text style={styles.linkedSettingsTitle}>OCR settings used by VLM</Text>
                  <Text style={styles.settingsHelp}>Custom vision reuses the OCR model. Qwen coordinate OCR uses its companion vision model. For Local OCR, choose General AI or Custom for direct vision translation.</Text>
                  <OCRFields settings={draft} onChange={setDraft} />
                </View>
              )}
              {draft.vlm.useCustom && (
                <>
                  <Field label="VLM endpoint" value={draft.vlm.endpoint || ''} onChangeText={(endpoint) => updateVLM({ endpoint })} placeholder="Optional custom VLM endpoint" />
                  <Field label="VLM model" value={draft.vlm.modelName || ''} onChangeText={(modelName) => updateVLM({ modelName })} placeholder="Vision model ID" />
                  <Field label="VLM API key" value={draft.vlm.apiKey || ''} onChangeText={(apiKey) => updateVLM({ apiKey })} secureTextEntry placeholder="Optional custom VLM key" />
                </>
              )}
            </SettingsSection>
            )}

            {activeSettingsCategory === 'config' && (
              <>
            <SettingsSection
              title="iCloud sync"
              help="When enabled, settings are kept up to date across devices using the same iCloud account. Changes are merged by settings section; the newer edit wins, and this device wins an exact timestamp tie. Downloaded model files never sync. Turning this off keeps the current local settings and stops uploading or applying changes."
            >
              <SettingToggle
                label="Sync settings with iCloud"
                value={cloudSyncEnabled}
                disabled={Platform.OS !== 'ios'}
                onValueChange={(enabled) => void handleCloudSyncChange(enabled)}
              />
              <Text style={styles.settingsHelp}>
                {cloudSyncEnabled
                  ? 'iCloud sync is enabled. Your settings stay up to date across devices signed in to the same iCloud account.'
                  : 'iCloud sync is off. This device keeps its settings locally and will not upload or apply iCloud changes.'}
              </Text>
              <LocalModelStatusRow
                icon={Cloud}
                label={cloudSyncEnabled ? 'iCloud sync' : 'Sync disabled'}
                detail={cloudSyncStatus.detail}
              />
            </SettingsSection>

            <SettingsSection
              title="Import / Export"
              help="Export creates an encrypted .ttconfig payload compatible with tabitomo Web and Mobile. The password encrypts the payload and is not stored. Downloaded offline models and the iCloud opt-out choice are device-specific and are not exported."
            >
              <Text style={styles.settingsHelp}>
                Compatible with web .ttconfig exports. Password is used only for AES-GCM encryption and is not stored.
              </Text>
              <Field label="Password" value={configPassword} onChangeText={setConfigPassword} secureTextEntry placeholder="Required for export/import" />
              <View style={styles.configActionGrid}>
                <ConfigAction icon={Download} label="Export" onPress={handleExportConfig} disabled={isConfigBusy} />
                <ConfigAction icon={Share2} label="Share file" onPress={handleShareConfigFile} disabled={isConfigBusy} />
                <ConfigAction icon={Copy} label="Copy" onPress={() => Clipboard.setStringAsync(configPayload)} disabled={!configPayload || isConfigBusy} />
                <ConfigAction icon={Import} label="Paste" onPress={handlePasteConfig} disabled={isConfigBusy} />
                <ConfigAction icon={Upload} label="Import file" onPress={handleImportConfigFile} disabled={isConfigBusy} />
                <ConfigAction icon={QrCode} label="Scan QR" onPress={() => setShowQrScanner(true)} disabled={isConfigBusy} />
              </View>
              <TextInput
                accessibilityLabel="Encrypted config payload"
                value={configPayload}
                onChangeText={setConfigPayload}
                placeholder="Encrypted .ttconfig payload"
                placeholderTextColor={theme.placeholder}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.payloadInput}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Import pasted payload"
                style={({ pressed }) => [
                  styles.importPayloadButton,
                  (!configPayload || isConfigBusy) && styles.disabled,
                  pressed && configPayload && !isConfigBusy && styles.buttonPressed,
                ]}
                disabled={!configPayload || isConfigBusy}
                onPress={() => handleImportConfig()}
              >
                <Text style={styles.importPayloadButtonText}>Import pasted payload</Text>
              </Pressable>
              {qrPayload && <QRCodePreview payload={qrPayload} />}
              {configStatus && <Text style={styles.configStatus}>{configStatus}</Text>}
            </SettingsSection>
              </>
            )}
              </>
            )}
          </ScrollView>

          <View style={styles.settingsFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [styles.footerButton, pressed && styles.buttonPressed]}
              onPress={onClose}
            >
              <Text style={styles.footerButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save settings"
              style={({ pressed }) => [
                styles.footerButtonPrimary,
                styles.settingsSaveButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => onSave(draft)}
            >
              <Text style={styles.footerButtonPrimaryText}>Save</Text>
            </Pressable>
          </View>
      </PopupPanel>

      <QRScannerSheet
        visible={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanned={handleScannedConfig}
        smokeAutoScanPayload={smokeVariant === 'qr-import' ? qrImportSmokePayload || undefined : undefined}
      />
    </>
  );
}

function QRCodePreview({ payload }: { payload: string }) {
  const { styles, theme } = useAppTheme();
  const qr = useMemo<QRCodeModel>(() => QRCode.create(payload, { errorCorrectionLevel: 'M' }), [payload]);
  const size = qr.modules.size;
  const modules = Array.from(qr.modules.data);
  const quietZone = 4;
  const viewBoxSize = size + quietZone * 2;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Generated config QR"
      style={styles.qrPreview}
    >
      <Svg width={220} height={220} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}>
        <Rect x={0} y={0} width={viewBoxSize} height={viewBoxSize} fill={theme.qrLight} />
        {modules.map((active, index) => {
          if (!active) return null;
          const x = (index % size) + quietZone;
          const y = Math.floor(index / size) + quietZone;
          return <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={theme.qrDark} />;
        })}
      </Svg>
      <Text style={styles.qrCaption}>Scan this from web or another device.</Text>
    </View>
  );
}

function QRScannerSheet({
  visible,
  onClose,
  onScanned,
  smokeAutoScanPayload,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (payload: string) => void | Promise<void>;
  smokeAutoScanPayload?: string;
}) {
  const { styles } = useAppTheme();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  useEffect(() => {
    if (!visible) {
      setHasScanned(false);
      return;
    }

    ExpoCamera.requestCameraPermissionsAsync().then((permission) => {
      setPermissionGranted(permission.granted);
    });
  }, [visible]);

  useEffect(() => {
    if (!visible || hasScanned || !smokeAutoScanPayload) {
      return;
    }

    const timeout = setTimeout(() => {
      setHasScanned(true);
      void onScanned(smokeAutoScanPayload);
    }, 250);

    return () => clearTimeout(timeout);
  }, [hasScanned, onScanned, smokeAutoScanPayload, visible]);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (hasScanned || !result.data) {
      return;
    }
    setHasScanned(true);
    void onScanned(result.data);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.qrScannerSheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.sheetTitle}>Scan settings QR</Text>
            </View>
            <IconButton icon={X} label="Close" onPress={onClose} compact />
          </View>
          {permissionGranted ? (
            <View style={styles.cameraShell}>
              <CameraView
                style={styles.cameraPreview}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
              />
              <View style={styles.scanFrame} pointerEvents="none" />
            </View>
          ) : (
            <Text style={styles.settingsHelp}>Camera permission is required to import QR settings.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DeviceQASheet({
  visible,
  settings,
  sourceLang,
  targetLang,
  currentImageUri,
  onClose,
  onImagePrepared,
}: {
  visible: boolean;
  settings: AISettings;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  currentImageUri: string | null;
  onClose: () => void;
  onImagePrepared: (prepared: PreparedImageData) => void;
}) {
  const { styles, theme } = useAppTheme();
  const [statuses, setStatuses] = useState<Partial<Record<DeviceQACheckId, string>>>({});
  const [records, setRecords] = useState<Partial<Record<DeviceQACheckId, DeviceQACheckRecord>>>({});
  const [runningId, setRunningId] = useState<DeviceQACheckId | null>(null);
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStatuses({});
      setRecords({});
      setRunningId(null);
      setReportStatus(null);
    }
  }, [visible]);

  const setCheckStatus = (id: DeviceQACheckId, status: string) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  };

  const runCheck = async (id: DeviceQACheckId, task: () => Promise<string>) => {
    setRunningId(id);
    setCheckStatus(id, 'Running...');
    const startedAt = new Date();
    const startedMs = Date.now();
    try {
      const result = await task();
      const finishedAt = new Date();
      const record: DeviceQACheckRecord = {
        outcome: 'passed',
        result,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, Date.now() - startedMs),
      };
      setRecords((current) => ({ ...current, [id]: record }));
      setCheckStatus(id, result);
    } catch (error) {
      const result = error instanceof Error ? error.message : 'Check failed.';
      const finishedAt = new Date();
      const record: DeviceQACheckRecord = {
        outcome: 'failed',
        result,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, Date.now() - startedMs),
      };
      setRecords((current) => ({ ...current, [id]: record }));
      setCheckStatus(id, result);
    } finally {
      setRunningId(null);
    }
  };

  const permissionStatus = (permission: { granted: boolean; status?: string }) => (
    permission.granted ? `Granted${permission.status ? ` (${permission.status})` : ''}` : `Not granted${permission.status ? ` (${permission.status})` : ''}`
  );

  const redactProviderCheckMessage = (message: string) => {
    const secretValues = [
      settings.apiKey,
      settings.endpoint,
      settings.generalAI.apiKey,
      settings.generalAI.endpoint,
      settings.speechRecognition.apiKey,
      settings.speechRecognition.endpoint,
      settings.imageOCR.apiKey,
      settings.imageOCR.endpoint,
      settings.vlm.apiKey,
      settings.vlm.endpoint,
      SMOKE_IMAGE_URI,
      DEVICE_QA_PROVIDER_IMAGE_URI,
      DEVICE_QA_PROVIDER_SPEECH_AUDIO_FILE_NAME,
    ].filter((value): value is string => Boolean(value && value.trim().length > 0));

    const redacted = secretValues.reduce(
      (current, value) => current.split(value).join('[redacted]'),
      message
    );

    return redacted.replace(/file:\/\/[^\s"')]+/g, '[local-file-uri]');
  };

  const runProviderTask = async <T,>(task: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      return await task(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  };

  const collectStream = async (stream: AsyncIterable<string>) => {
    let text = '';
    for await (const chunk of stream) {
      text += chunk;
    }
    return text.trim();
  };

  const runTextProviderCheck = async () => {
    const hasTranslationProvider = Boolean(
      hasProviderConnection(settings)
    ) || hasGeneralAISettings(settings);
    const hasGeneralProvider = hasGeneralAISettings(settings);

    if (!hasTranslationProvider) {
      throw new Error('Translation provider is not configured.');
    }
    if (!hasGeneralProvider) {
      throw new Error('General AI provider is required for Explanation, Quick Q&A, and furigana.');
    }

    try {
      const translationTarget = targetLang === 'ja' ? 'en' : targetLang;
      const translation = await runProviderTask((signal) => (
        translateText('駅はどこですか', 'ja', translationTarget, settings, signal)
      ));
      const explanation = await runProviderTask((signal) => (
        collectStream(explainTextStream('駅はどこですか', 'ja', targetLang, settings, signal))
      ));
      const qa = await runProviderTask((signal) => (
        collectStream(answerQuestionStream('How do I ask where the station is?', 'en', targetLang, settings, signal))
      ));
      const furigana = await runProviderTask((signal) => (
        annotateJapaneseFurigana('駅はどこですか', settings, signal)
      ));

      const checks = {
        translation: translation.trim().length >= 2,
        explanation: explanation.trim().length >= 8,
        qa: qa.trim().length >= 8,
        furiganaText: furigana.map((token) => token.text).join('') === '駅はどこですか',
        furiganaReadings: hasFuriganaReadings(furigana),
      };
      const failed = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);

      if (failed.length > 0) {
        throw new Error(`Provider text check failed: ${failed.join(', ')}.`);
      }

      return [
        'Provider text passed',
        `translation=${translation.trim().length} chars`,
        `explanation=${explanation.trim().length} chars`,
        `qa=${qa.trim().length} chars`,
        `furigana=${furigana.length} tokens`,
      ].join('; ');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider text check failed.';
      throw new Error(redactProviderCheckMessage(message));
    }
  };

  const hasVLMProvider = () => {
    if (settings.vlm.useGeneralAI) {
      return hasGeneralAISettings(settings);
    }
    if (settings.vlm.useCustom) {
      return Boolean(hasProviderConnection(settings.vlm));
    }
    if (settings.imageOCR.useGeneralAI) {
      return hasGeneralAISettings(settings);
    }
    return settings.imageOCR.provider !== 'local-ppocr'
      && Boolean(hasProviderConnection(settings.imageOCR));
  };

  const hasCloudOCRProvider = () => {
    if (settings.imageOCR.useGeneralAI) {
      return hasGeneralAISettings(settings);
    }
    return settings.imageOCR.provider !== 'local-ppocr'
      && Boolean(hasProviderConnection(settings.imageOCR));
  };

  const runImageProviderCheck = async () => {
    const hasTranslationProvider = Boolean(
      hasProviderConnection(settings)
    ) || hasGeneralAISettings(settings);

    if (!hasVLMProvider()) {
      throw new Error('VLM provider is not configured for image translation.');
    }
    if (!hasCloudOCRProvider()) {
      throw new Error('Cloud OCR provider is not configured. Local Vision/PP-OCR is covered by the Vision OCR check.');
    }
    if (!hasTranslationProvider) {
      throw new Error('Translation provider is required for OCR-line translation.');
    }

    try {
      const imageTargetLang = targetLang === 'en' ? 'ja' : targetLang;
      const vlm = await runProviderTask((signal) => (
        collectStream(streamTranslateImageWithVLM(DEVICE_QA_PROVIDER_IMAGE_URI, 'en', imageTargetLang, settings, signal))
      ));
      const ocrLines = await runProviderTask((signal) => (
        performOCR(DEVICE_QA_PROVIDER_IMAGE_URI, settings, signal)
      ));
      const firstOcrText = ocrLines[0]?.text.trim() || '';
      if (!firstOcrText) {
        throw new Error('Cloud OCR returned no text for the generated CAFE image.');
      }
      const firstTranslation = await runProviderTask((signal) => (
        translateText(firstOcrText, 'en', imageTargetLang, settings, signal)
      ));

      const checks = {
        vlm: vlm.trim().length >= 2,
        ocrLines: ocrLines.length > 0,
        firstOcrText: firstOcrText.length > 0,
        ocrLineTranslation: firstTranslation.trim().length >= 1,
      };
      const failed = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);

      if (failed.length > 0) {
        throw new Error(`Provider image check failed: ${failed.join(', ')}.`);
      }

      return [
        'Provider image passed',
        `vlm=${vlm.trim().length} chars`,
        `ocr=${ocrLines.length} lines`,
        `ocrLineTranslation=${firstTranslation.trim().length} chars`,
      ].join('; ');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider image check failed.';
      throw new Error(redactProviderCheckMessage(message));
    }
  };

  const runSpeechProviderCheck = async () => {
    if (settings.speechRecognition.provider === 'local') {
      throw new Error('Cloud speech provider is required. Local Apple Speech is covered by the Apple Speech and On-device ASR checks.');
    }

    const apiKey = settings.speechRecognition.apiKey || settings.apiKey || settings.generalAI.apiKey;
    const endpoint = settings.speechRecognition.endpoint || settings.endpoint || settings.generalAI.endpoint;

    if (!apiKey) {
      throw new Error('Speech API key is not configured.');
    }
    if (!endpoint) {
      throw new Error('Speech API endpoint is not configured.');
    }

    try {
      const audioFile = new File(Paths.cache, DEVICE_QA_PROVIDER_SPEECH_AUDIO_FILE_NAME);
      audioFile.create({ overwrite: true });
      audioFile.write(createSyntheticSpeechWav());

      const transcript = await runProviderTask((signal) => (
        transcribeAudioFile(audioFile, settings, signal)
      ));

      return [
        'Provider speech upload passed',
        `provider=${settings.speechRecognition.provider}`,
        `transcript=${transcript.trim().length} chars`,
      ].join('; ');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider speech check failed.';
      throw new Error(redactProviderCheckMessage(message));
    }
  };

  const runLocalASRModelCheck = async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('Local ASR model inference requires an iOS native build.');
    }
    const modelId = getSelectedLocalASRModelId(settings);
    const installed = await loadInstalledModelPacks();
    const pack = getReadyInstalledModelPackById(installed, modelId);
    if (!pack) {
      throw new Error(`Download ${modelId === 'whisper-base' ? 'Whisper Base' : 'SenseVoice Small'} before running this check.`);
    }

    await validateNativeLocalModelPackAsync(modelId, pack.rootUri);
    const audioFile = new File(Paths.cache, 'tabitomo-device-qa-local-asr.wav');
    audioFile.create({ overwrite: true });
    audioFile.write(createSyntheticSpeechWav());
    const result = await transcribeWithNativeLocalModelAsync(
      audioFile.uri,
      modelId,
      pack.rootUri,
      modelId === 'sensevoice-small'
        ? {
            language: settings.speechRecognition.senseVoiceLanguage || 'auto',
            useInverseTextNormalization: settings.speechRecognition.senseVoiceUseItn ?? true,
          }
        : {
            language: settings.speechRecognition.whisperLanguage || 'auto',
            task: settings.speechRecognition.whisperTask || 'transcribe',
          }
    );
    return `${modelId} inference completed with ${result.runtime}; transcript=${result.text.trim().length} chars; native=${result.durationMs} ms.`;
  };

  const runLocalOCRModelCheck = async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('Local PP-OCR inference requires an iOS native build.');
    }
    if (!currentImageUri || currentImageUri.startsWith('data:')) {
      throw new Error('Capture or import a device image before running PP-OCR.');
    }
    const installed = await loadInstalledModelPacks();
    const pack = getReadyInstalledModelPackById(installed, 'ppocr-v6-small');
    if (!pack) {
      throw new Error('Download PP-OCR v6 Small before running this check.');
    }

    await validateNativeLocalModelPackAsync('ppocr-v6-small', pack.rootUri);
    const result = await recognizeTextWithNativePPOCRAsync(currentImageUri, 'ppocr-v6-small', pack.rootUri);
    return `ppocr-v6-small inference completed with ${result.runtime}; lines=${result.items.length}; native=${result.durationMs} ms.`;
  };

  const prepareImageFromPicker = async (source: 'camera' | 'library') => {
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          base64: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          base64: false,
        });

    if (result.canceled || !result.assets[0]) {
      return 'Cancelled.';
    }

    const prepared = await buildImageDataUri(result.assets[0]);
    onImagePrepared(prepared);
    return `Image ready: ${prepared.size.width}x${prepared.size.height}.`;
  };

  const runSettingsStorageCheck = async () => {
    const previousSettings = await loadMobileSettings();
    const expected = normalizeSettings({
      ...DEFAULT_SETTINGS,
      generalAI: {
        ...DEFAULT_SETTINGS.generalAI,
        endpoint: 'https://device-qa-general.example.test/v1',
        modelName: 'device-qa-general',
        apiKey: 'device-qa-general-key',
      },
      provider: 'custom',
      endpoint: 'https://device-qa-translation.example.test/v1',
      modelName: 'device-qa-translation',
      apiKey: 'device-qa-translation-key',
      translation: {
        ...DEFAULT_SETTINGS.translation,
        outputMode: 'plain',
      },
      speechRecognition: {
        ...DEFAULT_SETTINGS.speechRecognition,
        provider: 'siliconflow',
        endpoint: 'https://device-qa-speech.example.test/v1',
        modelName: 'device-qa-speech',
        apiKey: 'device-qa-speech-key',
      },
      imageOCR: {
        ...DEFAULT_SETTINGS.imageOCR,
        provider: 'custom',
        useGeneralAI: false,
        endpoint: 'https://device-qa-ocr.example.test/v1',
        modelName: 'device-qa-ocr',
        apiKey: 'device-qa-ocr-key',
      },
      vlm: {
        ...DEFAULT_SETTINGS.vlm,
        useGeneralAI: false,
        useCustom: true,
        endpoint: 'https://device-qa-vlm.example.test/v1',
        modelName: 'device-qa-vlm',
        apiKey: 'device-qa-vlm-key',
        enableThinking: true,
      },
    });
    let shouldRestore = false;

    try {
      await saveMobileSettings(expected);
      shouldRestore = true;

      const loaded = await loadMobileSettings();
      if (!loaded) {
        throw new Error('SecureStore returned no settings after save.');
      }

      const checks = {
        generalAI: loaded.generalAI.endpoint === expected.generalAI.endpoint
          && loaded.generalAI.modelName === expected.generalAI.modelName
          && loaded.generalAI.apiKey === expected.generalAI.apiKey,
        translation: loaded.provider === expected.provider
          && loaded.endpoint === expected.endpoint
          && loaded.modelName === expected.modelName
          && loaded.apiKey === expected.apiKey
          && loaded.translation.outputMode === expected.translation.outputMode,
        speech: loaded.speechRecognition.provider === expected.speechRecognition.provider
          && loaded.speechRecognition.endpoint === expected.speechRecognition.endpoint
          && loaded.speechRecognition.modelName === expected.speechRecognition.modelName
          && loaded.speechRecognition.apiKey === expected.speechRecognition.apiKey,
        imageOCR: loaded.imageOCR.provider === expected.imageOCR.provider
          && loaded.imageOCR.endpoint === expected.imageOCR.endpoint
          && loaded.imageOCR.modelName === expected.imageOCR.modelName
          && loaded.imageOCR.apiKey === expected.imageOCR.apiKey,
        vlm: loaded.vlm.useCustom === expected.vlm.useCustom
          && loaded.vlm.endpoint === expected.vlm.endpoint
          && loaded.vlm.modelName === expected.vlm.modelName
          && loaded.vlm.apiKey === expected.vlm.apiKey
          && loaded.vlm.enableThinking === expected.vlm.enableThinking,
      };
      const failed = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);

      if (failed.length > 0) {
        throw new Error(`SecureStore round-trip mismatch: ${failed.join(', ')}.`);
      }

      return 'SecureStore settings round-trip passed; previous settings restored.';
    } finally {
      if (shouldRestore) {
        if (previousSettings) {
          await saveMobileSettings(previousSettings);
        } else {
          await deleteMobileSettings();
        }
      }
    }
  };

  const runICloudSettingsCheck = async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('CloudKit settings sync requires a native iOS build.');
    }

    await saveMobileSettings(settings);
    const loaded = await loadMobileSettings();
    const syncStatus = await refreshMobileSettingsSyncStatus();
    if (!loaded) {
      throw new Error('No settings were returned after the iCloud sync round-trip.');
    }
    if (syncStatus.state !== 'synced') {
      throw new Error(syncStatus.detail);
    }
    return 'Private CloudKit settings sync passed; encrypted payload is up to date.';
  };

  const runModelPackStorageCheck = async () => {
    const previousInstalled = await loadInstalledModelPacks();
    const stamp = Date.now();
    const packId = `device-qa-tiny-${stamp}`;
    const fileName = 'device-qa-model.txt';
    const content = `tabitomo device qa model pack\n${stamp}\n`;
    const bytes = Uint8Array.from(Array.from(content).map((character) => character.charCodeAt(0)));
    const manifest: ModelPackManifest = {
      schemaVersion: 1,
      packs: [
        {
          id: packId,
          feature: 'ocr',
          runtime: 'server-fallback',
          version: '2026.07.device-qa',
          minAppVersion: TABITOMO_APP_VERSION,
          bytes: bytes.byteLength,
          license: 'Device QA fixture',
          label: 'Device QA Tiny Pack',
          description: 'Tiny local model-pack fixture used to verify real-device file storage and metadata persistence.',
          files: [
            {
              name: fileName,
              url: 'device-qa://tiny-model.txt',
              sha256: sha256Utf8Hex(content),
              bytes: bytes.byteLength,
            },
          ],
        },
      ],
    };
    let installedPack: InstalledModelPack | null = null;

    try {
      const result = await installModelPackFromBytes({
        manifest,
        existingInstalled: previousInstalled,
        fileBytes: {
          [fileName]: bytes,
        },
        onStatus: (status) => setCheckStatus('model-pack-storage', status),
      });
      installedPack = result.installedPack;
      await saveInstalledModelPacks(result.installed);

      const reloaded = await loadInstalledModelPacks();
      const persisted = reloaded.find((pack) => getModelPackKey(pack) === getModelPackKey(result.installedPack));
      if (!persisted) {
        throw new Error('Installed model-pack metadata was not persisted.');
      }

      const missingFiles = persisted.files
        .filter((file) => !new File(file.uri).exists)
        .map((file) => file.name);
      if (missingFiles.length > 0) {
        throw new Error(`Installed model-pack files are missing: ${missingFiles.join(', ')}.`);
      }

      const leftoverInstallArtifacts = listModelPackInstallArtifactUris(persisted);
      if (leftoverInstallArtifacts.length > 0) {
        throw new Error(`Model-pack install left staging artifacts: ${leftoverInstallArtifacts.length}.`);
      }

      deleteInstalledModelPackFiles(persisted);
      await saveInstalledModelPacks(previousInstalled);

      const deletedFiles = persisted.files
        .filter((file) => new File(file.uri).exists)
        .map((file) => file.name);
      if (deletedFiles.length > 0) {
        throw new Error(`Model-pack delete left files: ${deletedFiles.join(', ')}.`);
      }

      const leftoverDeleteArtifacts = listModelPackInstallArtifactUris(persisted);
      if (leftoverDeleteArtifacts.length > 0) {
        throw new Error(`Model-pack delete left staging artifacts: ${leftoverDeleteArtifacts.length}.`);
      }

      return `Model-pack storage round-trip passed: ${persisted.id}, ${getInstalledModelPackBytes([persisted])} bytes.`;
    } finally {
      if (installedPack) {
        try {
          deleteInstalledModelPackFiles(installedPack);
        } catch {
          // Best-effort cleanup; the report captures the original failure.
        }
      }
      await saveInstalledModelPacks(previousInstalled);
    }
  };

  const checks: Array<{
    id: DeviceQACheckId;
    label: string;
    detail: string;
    icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
    task: () => Promise<string>;
  }> = [
    {
      id: 'secure-settings',
      label: 'Settings storage',
      detail: 'SecureStore round-trip',
      icon: Settings,
      task: runSettingsStorageCheck,
    },
    {
      id: 'icloud-settings',
      label: 'iCloud settings',
      detail: 'Private CloudKit sync',
      icon: Cloud,
      task: runICloudSettingsCheck,
    },
    {
      id: 'provider-text',
      label: 'Provider text',
      detail: 'Translation / tutor / Q&A',
      icon: Languages,
      task: runTextProviderCheck,
    },
    {
      id: 'provider-image',
      label: 'Provider image',
      detail: 'VLM / OCR / line translate',
      icon: ImageIcon,
      task: runImageProviderCheck,
    },
    {
      id: 'provider-speech',
      label: 'Provider speech',
      detail: 'Cloud ASR upload',
      icon: Mic,
      task: runSpeechProviderCheck,
    },
    {
      id: 'tts',
      label: 'TTS',
      detail: 'expo-speech output',
      icon: Volume2,
      task: async () => {
        await Speech.stop();
        Speech.speak('tabitomo device QA', {
          language: nativeSpeechLocale(sourceLang),
          rate: 0.95,
        });
        return `Started speech synthesis with ${nativeSpeechLocale(sourceLang)}.`;
      },
    },
    {
      id: 'mic-permission',
      label: 'Mic',
      detail: 'recording permission',
      icon: Mic,
      task: async () => permissionStatus(await requestRecordingPermissionsAsync()),
    },
    {
      id: 'speech-permission',
      label: 'Apple Speech',
      detail: 'permission and locale',
      icon: MessageCircle,
      task: async () => {
        if (Platform.OS !== 'ios') {
          return 'Apple Speech is available only in an iOS native build.';
        }
        const locale = nativeSpeechLocale(sourceLang);
        const authorization = await requestNativeSpeechAuthorizationAsync();
        const available = await isNativeSpeechAvailableAsync(locale);
        return `${authorization.granted ? 'Authorized' : `Not authorized (${authorization.status})`}; ${available ? 'available' : 'unavailable'} for ${locale}.`;
      },
    },
    {
      id: 'on-device-speech',
      label: 'On-device ASR',
      detail: 'local provider path',
      icon: ScanText,
      task: async () => {
        if (Platform.OS !== 'ios') {
          return 'On-device Speech is available only in an iOS native build.';
        }
        const locale = nativeSpeechLocale(sourceLang);
        const available = await isNativeOnDeviceSpeechAvailableAsync(locale);
        return `${available ? 'Available' : 'Unavailable'} for ${locale}.`;
      },
    },
    {
      id: 'local-asr-runtime',
      label: 'Local ASR model',
      detail: 'sherpa-onnx inference',
      icon: Mic,
      task: runLocalASRModelCheck,
    },
    {
      id: 'local-ocr-runtime',
      label: 'PP-OCR model',
      detail: 'ONNX Runtime inference',
      icon: ScanText,
      task: runLocalOCRModelCheck,
    },
    {
      id: 'model-pack-storage',
      label: 'Model pack',
      detail: 'tiny install/delete',
      icon: Download,
      task: runModelPackStorageCheck,
    },
    {
      id: 'camera-permission',
      label: 'Camera',
      detail: 'photo capture permission',
      icon: Camera,
      task: async () => permissionStatus(await ImagePicker.requestCameraPermissionsAsync()),
    },
    {
      id: 'qr-camera-permission',
      label: 'QR Camera',
      detail: 'scanner permission',
      icon: QrCode,
      task: async () => permissionStatus(await ExpoCamera.requestCameraPermissionsAsync()),
    },
    {
      id: 'photo-permission',
      label: 'Photos',
      detail: 'library permission',
      icon: ImageIcon,
      task: async () => permissionStatus(await ImagePicker.requestMediaLibraryPermissionsAsync()),
    },
    {
      id: 'capture-image',
      label: 'Capture',
      detail: 'camera image path',
      icon: Camera,
      task: async () => prepareImageFromPicker('camera'),
    },
    {
      id: 'pick-image',
      label: 'Album',
      detail: 'photo import path',
      icon: Upload,
      task: async () => prepareImageFromPicker('library'),
    },
    {
      id: 'vision-ocr',
      label: 'Vision OCR',
      detail: 'local OCR module',
      icon: ScanText,
      task: async () => {
        if (Platform.OS !== 'ios') {
          return 'Vision OCR is available only in an iOS native build.';
        }
        if (!await isNativeVisionAvailableAsync()) {
          return 'Native Vision module is not available in this build.';
        }
        if (!currentImageUri || currentImageUri.startsWith('data:')) {
          return 'Capture or import a device image first.';
        }
        const lines = await recognizeTextInImageAsync(currentImageUri, nativeVisionOCRLanguages(sourceLang));
        return lines.length
          ? `Detected ${lines.length} line${lines.length === 1 ? '' : 's'}: ${lines.map((line) => line.text).join(' / ').slice(0, 96)}`
          : 'No text detected.';
      },
    },
    {
      id: 'share-file',
      label: 'Share',
      detail: 'native share sheet',
      icon: Share2,
      task: async () => {
        const file = new File(Paths.cache, 'tabitomo-device-qa.txt');
        file.create({ overwrite: true });
        file.write(`tabitomo device QA\n${new Date().toISOString()}\n`);
        if (!await Sharing.isAvailableAsync()) {
          return 'Sharing is unavailable in this runtime.';
        }
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/plain',
          UTI: 'public.plain-text',
          dialogTitle: 'tabitomo device QA',
        });
        return 'Share sheet opened.';
      },
    },
    {
      id: 'import-file',
      label: 'Import',
      detail: 'document picker',
      icon: Import,
      task: async () => {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['text/plain', 'application/octet-stream', '*/*'],
          copyToCacheDirectory: true,
          multiple: false,
          base64: false,
        });
        if (result.canceled || !result.assets[0]) {
          return 'Cancelled.';
        }
        return `Selected ${result.assets[0].name || 'file'}.`;
      },
    },
  ];

  const buildDeviceQAReport = () => {
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      app: {
        name: 'tabitomo',
        version: TABITOMO_APP_VERSION,
        bundleIdentifier: TABITOMO_BUNDLE_IDENTIFIER,
        buildNumber: TABITOMO_BUILD_NUMBER,
        buildSource: TABITOMO_BUILD_SOURCE,
      },
      runtime: {
        platform: Platform.OS,
        platformVersion: String(Platform.Version ?? 'unknown'),
        isPhysicalDevice: Device.isDevice === true,
        isSimulator: Device.isDevice !== true,
        deviceModel: Device.modelName || 'unknown',
        deviceType: deviceTypeLabel(Device.deviceType),
        osName: Device.osName || 'unknown',
        osVersion: Device.osVersion || String(Platform.Version ?? 'unknown'),
        sourceLanguage: sourceLang,
      },
      imageState: {
        hasPreparedImage: Boolean(currentImageUri),
        imageKind: currentImageUri
          ? currentImageUri.startsWith('data:')
            ? 'data-uri'
            : 'local-file'
          : 'none',
      },
      privacy: {
        redacted: true,
        note: 'Provider credentials, imported config payloads, provider response bodies, and image/file URIs are intentionally omitted.',
      },
      checks: checks.map((check) => {
        const record = records[check.id];
        return {
          id: check.id,
          label: check.label,
          status: record ? 'recorded' : 'pending',
          outcome: record?.outcome || null,
          result: record?.result || 'Pending',
          startedAt: record?.startedAt || null,
          finishedAt: record?.finishedAt || null,
          durationMs: record?.durationMs ?? null,
        };
      }),
    };

    return JSON.stringify(report, null, 2);
  };

  const copyDeviceQAReport = async () => {
    try {
      await Clipboard.setStringAsync(buildDeviceQAReport());
      setReportStatus('Redacted QA report copied.');
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : 'Could not copy QA report.');
    }
  };

  const shareDeviceQAReport = async () => {
    try {
      const payload = buildDeviceQAReport();
      const file = new File(Paths.cache, DEVICE_QA_REPORT_FILE_NAME);
      file.create({ overwrite: true });
      file.write(payload);

      if (!await Sharing.isAvailableAsync()) {
        await Clipboard.setStringAsync(payload);
        setReportStatus('Sharing is unavailable here. Redacted report was copied instead.');
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: 'tabitomo iOS Device QA report',
      });
      setReportStatus('Redacted QA report is ready to share.');
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : 'Could not share QA report.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.deviceQASheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.sheetTitle}>iOS Device QA</Text>
              <Text style={styles.sheetSubtitle}>Run on a real iPhone before release candidate sign-off.</Text>
            </View>
            <IconButton icon={X} label="Close" onPress={onClose} compact />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.deviceQAContent}>
            {checks.map((check) => (
              <DeviceQACheckButton
                key={check.id}
                icon={check.icon}
                label={check.label}
                detail={check.detail}
                status={statuses[check.id]}
                running={runningId === check.id}
                disabled={runningId !== null && runningId !== check.id}
                onPress={() => runCheck(check.id, check.task)}
              />
            ))}
            <SettingsSection title="QA report">
              <Text style={styles.settingsHelp}>
                Export a redacted JSON report after running real-device checks. Credentials, imported config payloads, and local image/file URIs are omitted.
              </Text>
              <View style={styles.configActionGrid}>
                <ConfigAction
                  icon={Copy}
                  label="Copy report"
                  onPress={copyDeviceQAReport}
                  disabled={runningId !== null}
                />
                <ConfigAction
                  icon={Share2}
                  label="Share report"
                  onPress={shareDeviceQAReport}
                  disabled={runningId !== null}
                />
              </View>
              {reportStatus && <Text style={styles.configStatus}>{reportStatus}</Text>}
            </SettingsSection>
          </ScrollView>
          <View style={styles.settingsFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close device QA"
              style={({ pressed }) => [styles.footerButtonPrimary, pressed && styles.buttonPressed]}
              onPress={onClose}
            >
              <Text style={styles.footerButtonPrimaryText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DeviceQACheckButton({
  icon: Icon,
  label,
  detail,
  status,
  running,
  disabled,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  detail: string;
  status?: string;
  running: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { styles, theme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Run ${label} device QA`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.deviceQACheck,
        disabled && styles.disabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <View style={styles.deviceQACheckIcon}>
        {running
          ? <ActivityIndicator size="small" color={theme.accentStrong} />
          : <Icon size={18} color={theme.accentStrong} strokeWidth={2.5} />}
      </View>
      <View style={styles.deviceQACheckText}>
        <Text style={styles.deviceQACheckTitle}>{label}</Text>
        <Text style={styles.deviceQACheckDetail}>{status || detail}</Text>
      </View>
      <Check size={16} color={status && !running ? theme.secondaryAccent : theme.subtleText} strokeWidth={2.5} />
    </Pressable>
  );
}

function RuntimeCheckButton({
  icon: Icon,
  label,
  detail,
  running,
  disabled,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  detail: string;
  running: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { styles, theme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.runtimeCheck,
        disabled && styles.disabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <View style={styles.runtimeCheckIcon}>
        {running
          ? <ActivityIndicator size="small" color={theme.accentStrong} />
          : <Icon size={17} color={theme.accentStrong} strokeWidth={2.5} />}
      </View>
      <View style={styles.runtimeCheckText}>
        <Text style={styles.runtimeCheckTitle}>{label}</Text>
        <Text style={styles.runtimeCheckDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function LocalModelStatusRow({
  icon: Icon,
  label,
  detail,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  detail: string;
}) {
  const { styles, theme } = useAppTheme();

  return (
    <View style={styles.runtimeCheck}>
      <View style={styles.runtimeCheckIcon}>
        <Icon size={17} color={theme.accentStrong} strokeWidth={2.5} />
      </View>
      <View style={styles.runtimeCheckText}>
        <Text style={styles.runtimeCheckTitle}>{label}</Text>
        <Text style={styles.runtimeCheckDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const modelPackCompatibilityLabel = (compatibility: ModelPackCompatibility): string => {
  switch (compatibility.status) {
    case 'ready':
      return 'Ready';
    case 'needs-runtime':
      return 'Needs runtime';
    case 'unsupported-ios':
    case 'unsupported-platform':
    case 'unsupported-app-version':
      return 'Unsupported';
    case 'invalid-install':
      return 'Invalid install';
  }
};

const modelPackActivationDetail = (activation: ModelPackActivation): string => {
  if (activation.status === 'installed-pack' && activation.pack) {
    return `${activation.pack.label || activation.pack.id} · ${activation.pack.runtime} · ${activation.pack.version} · ${formatModelPackBytes(activation.pack.bytes)}`;
  }
  if (activation.status === 'native-baseline') {
    return activation.reason;
  }
  if (activation.status === 'no-compatible-pack') {
    return activation.reason;
  }
  return activation.reason;
};

function InstalledModelPackRow({
  pack,
  compatibility,
  busy,
  disabled,
  onDelete,
}: {
  pack: InstalledModelPack;
  compatibility: ModelPackCompatibility;
  busy: boolean;
  disabled: boolean;
  onDelete: () => void;
}) {
  const { styles, theme } = useAppTheme();
  const StatusIcon = compatibility.canActivate ? Check : Download;

  return (
    <View style={styles.modelPackRow}>
      <View style={styles.runtimeCheckIcon}>
        <StatusIcon size={17} color={theme.accentStrong} strokeWidth={2.5} />
      </View>
      <View style={styles.runtimeCheckText}>
        <Text style={styles.runtimeCheckTitle}>{pack.label || pack.id}</Text>
        <Text style={styles.runtimeCheckDetail}>
          {modelPackCompatibilityLabel(compatibility)}: {compatibility.reason} · {pack.runtime} · {pack.version} · {formatModelPackBytes(pack.bytes)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${pack.id} model pack`}
        onPress={onDelete}
        disabled={disabled}
        style={({ pressed }) => [
          styles.modelPackDelete,
          disabled && styles.disabled,
          pressed && !disabled && styles.buttonPressed,
        ]}
      >
        {busy
          ? <ActivityIndicator size="small" color={theme.accentStrong} />
          : <Eraser size={16} color={theme.accentStrong} strokeWidth={2.5} />}
      </Pressable>
    </View>
  );
}

function OfflineModelRow({
  model,
  installed,
  busy,
  disabled,
  onDownload,
  onDelete,
}: {
  model: OfflineModelDefinition;
  installed?: InstalledModelPack;
  busy: boolean;
  disabled: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const { styles, theme } = useAppTheme();
  return (
    <View style={styles.modelPackRow}>
      <View style={styles.runtimeCheckIcon}>
        {installed
          ? <Check size={17} color={theme.accentStrong} strokeWidth={2.5} />
          : <Download size={17} color={theme.accentStrong} strokeWidth={2.5} />}
      </View>
      <View style={styles.runtimeCheckText}>
        <Text style={styles.runtimeCheckTitle}>{model.label}</Text>
        <Text style={styles.runtimeCheckDetail}>
          {installed
            ? `Downloaded · ${installed.version} · ${formatModelPackBytes(installed.bytes)}`
            : model.description}
        </Text>
      </View>
      <View style={styles.offlineModelActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${installed ? 'Update' : 'Download'} ${model.label}`}
          onPress={onDownload}
          disabled={disabled}
          style={({ pressed }) => [
            styles.modelPackDelete,
            disabled && styles.disabled,
            pressed && !disabled && styles.buttonPressed,
          ]}
        >
          {busy
            ? <ActivityIndicator size="small" color={theme.accentStrong} />
            : <Download size={16} color={theme.accentStrong} strokeWidth={2.5} />}
        </Pressable>
        {installed && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${model.label}`}
            onPress={onDelete}
            disabled={disabled}
            style={({ pressed }) => [
              styles.modelPackDelete,
              disabled && styles.disabled,
              pressed && !disabled && styles.buttonPressed,
            ]}
          >
            <Eraser size={16} color={theme.accentStrong} strokeWidth={2.5} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ConfigAction({
  icon: Icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { styles, theme } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.configAction,
        disabled && styles.disabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Icon size={17} color={theme.accentStrong} strokeWidth={2.4} />
      <Text style={styles.configActionText}>{label}</Text>
    </Pressable>
  );
}

function SettingsCategoryBar({
  active,
  onChange,
}: {
  active: SettingsCategoryId;
  onChange: (id: SettingsCategoryId) => void;
}) {
  const { styles, theme } = useAppTheme();

  if (Platform.OS === 'ios') return <SegmentedControl
    accessibilityLabel="Settings category"
    values={SETTINGS_CATEGORY_ITEMS.map((item) => item.label)}
    selectedIndex={SETTINGS_CATEGORY_ITEMS.findIndex((item) => item.id === active)}
    appearance={theme.name}
    fontStyle={{ fontSize: 12, color: theme.mutedText, fontWeight: '500' }}
    activeFontStyle={{ fontSize: 12, color: theme.accentStrong, fontWeight: '600' }}
    style={styles.nativeCategoryControl}
    onChange={(event) => { selectionFeedback(); onChange(SETTINGS_CATEGORY_ITEMS[event.nativeEvent.selectedSegmentIndex].id); }}
  />;

  return (
    <View accessibilityRole="tablist" style={styles.settingsCategoryBar}>
        {SETTINGS_CATEGORY_ITEMS.map((item) => {
          const selected = active === item.id;
          const Icon = item.icon;
          return (
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={`${item.label} settings`}
            accessibilityState={{ selected }}
            key={item.id}
            onPress={() => onChange(item.id)}
            style={({ pressed }) => [
              styles.settingsCategoryTab,
              selected && styles.settingsCategoryTabActive,
              pressed && styles.settingsCategoryTabPressed,
            ]}
          >
            <Icon
              size={15}
              color={selected ? theme.accentStrong : theme.mutedText}
              strokeWidth={2.4}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.settingsCategoryTabText,
                selected && styles.settingsCategoryTabTextActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
          );
        })}
    </View>
  );
}

function SettingsSection({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  const { styles, theme } = useAppTheme();
  return (
    <View style={styles.settingsSection}>
      <View style={styles.settingsSectionHeader}>
        <Text style={styles.settingsSectionTitle}>{title}</Text>
        {help && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`About ${title}`}
            hitSlop={8}
            onPress={() => Alert.alert(title, help)}
            style={({ pressed }) => [styles.settingsHelpButton, pressed && styles.buttonPressed]}
          >
            <CircleHelp size={17} color={theme.mutedText} strokeWidth={2.3} />
          </Pressable>
        )}
      </View>
      <View style={styles.settingsGroup}>{children}</View>
    </View>
  );
}

function OCRFields({ settings, onChange }: { settings: AISettings; onChange: (settings: AISettings) => void }) {
  const { styles } = useAppTheme();
  const ocr = settings.imageOCR;
  const mode = getOCRMode(ocr);
  const update = (patch: Partial<ImageOCRSettings>) => onChange({ ...settings, imageOCR: { ...ocr, ...patch } });
  return <>
    <ChoiceRow options={['local', 'general', 'custom', 'qwen']} labels={{ local: 'Local PP-OCR', general: 'General AI OCR', custom: 'Custom vision', qwen: 'Alibaba Qwen-OCR' }} value={mode} onChange={(value) => onChange({ ...settings, imageOCR: selectOCRMode(settings, value) })} />
    {mode === 'local' && <Text style={styles.settingsHelp}>{LOCAL_MODEL_GUIDANCE.ocr}</Text>}
    {mode === 'general' && <Text style={styles.settingsHelp}>Uses an image-capable General AI model. Extracted text appears without coordinate overlays.</Text>}
    {(mode === 'custom' || mode === 'qwen') && <>
      {mode === 'qwen' && <ChoiceRow options={['beijing', 'singapore']} labels={{ beijing: 'Beijing', singapore: 'Singapore' }} value={ocr.endpoint === DASHSCOPE_OCR_ENDPOINT ? 'beijing' : 'singapore'} onChange={(region) => update({ endpoint: region === 'beijing' ? DASHSCOPE_OCR_ENDPOINT : DASHSCOPE_OCR_INTL_ENDPOINT, apiKey: '' })} />}
      {mode === 'custom' && <Text style={styles.settingsHelp}>Use any vision-capable OpenAI-compatible model. Text is extracted without coordinate overlays.</Text>}
      <Field label={mode === 'qwen' ? 'Alibaba OCR endpoint' : 'Custom OCR endpoint'} value={ocr.endpoint} onChangeText={(endpoint) => update({ endpoint })} placeholder={mode === 'qwen' ? DASHSCOPE_OCR_INTL_ENDPOINT : 'https://api.example.com/v1'} />
      <Field label="OCR model" value={ocr.modelName || ''} onChangeText={(modelName) => update({ modelName })} placeholder={mode === 'qwen' ? 'qwen3.5-ocr' : 'Vision model ID'} />
      <Field label={mode === 'qwen' ? 'Alibaba Model Studio API key' : 'OCR API key'} value={ocr.apiKey} onChangeText={(apiKey) => update({ apiKey })} secureTextEntry placeholder={mode === 'qwen' ? 'DashScope API key' : 'Optional for local servers'} />
    </>}
  </>;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
}) {
  const { styles, theme } = useAppTheme();
  const [secureTextVisible, setSecureTextVisible] = useState(false);
  const secureInputMasked = secureTextEntry && !secureTextVisible;
  const SecureIcon = secureTextVisible ? EyeOff : Eye;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {secureTextEntry ? (
        <View style={styles.secureFieldInputWrap}>
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={theme.placeholder}
            secureTextEntry={secureInputMasked}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.fieldInput, styles.secureFieldInput]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${secureTextVisible ? 'Hide' : 'Show'} ${label}`}
            hitSlop={8}
            onPress={() => setSecureTextVisible((visible) => !visible)}
            style={({ pressed }) => [styles.secureFieldReveal, pressed && styles.buttonPressed]}
          >
            <SecureIcon size={18} color={theme.mutedText} strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : (
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.placeholder}
          secureTextEntry={false}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.fieldInput}
        />
      )}
    </View>
  );
}

function ChoiceRow<T extends string>({
  options,
  value,
  labels,
  disabledOptions = [],
  onChange,
}: {
  options: readonly T[];
  value: T;
  labels?: Record<string, string>;
  disabledOptions?: readonly T[];
  onChange: (value: T) => void;
}) {
  const { styles } = useAppTheme();
  const disabledSet = new Set(disabledOptions);
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = option === value;
        const disabled = disabledSet.has(option);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={labels?.[option] || option}
            accessibilityState={{ selected: active, disabled }}
            key={option}
            disabled={disabled}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.choice,
              active && styles.choiceActive,
              disabled && styles.disabled,
              pressed && !disabled && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
              {labels?.[option] || option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingToggle({
  label,
  value,
  onValueChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { styles, theme } = useAppTheme();
  return (
    <View style={[styles.toggleRow, disabled && styles.disabled]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.switchTrackOff, true: theme.switchTrackOn }}
        thumbColor={value ? theme.accent : theme.switchThumbOff}
      />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  headerSettingsMaterial: { width: 48, height: 48, borderRadius: 24 },
  headerEditing: { minHeight: 56, paddingTop: 0, paddingBottom: 4 },
  brandEditing: { fontSize: 22, letterSpacing: -0.6 },
  brandIconEditing: { width: 32, height: 32 },
  nativeModeControl: { height: 40, marginBottom: 16 },
  nativeCategoryControl: { height: 36, marginBottom: 10 },
  translationSheet: { borderRadius: 30, borderCurve: 'continuous', backgroundColor: theme.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.name === 'dark' ? theme.border : '#ffffff', shadowColor: theme.shadow, shadowOpacity: theme.name === 'dark' ? 0.2 : 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 9 } },
  inputDock: { marginTop: 14, borderRadius: 32, shadowColor: theme.shadow, shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  translateButtonFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 24 },
  nativeSheetContent: { flex: 1, height: '100%', maxHeight: '100%', borderRadius: 0, paddingTop: 4, paddingHorizontal: 16, backgroundColor: theme.field },
  sheetGrabber: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 9, marginBottom: 15, backgroundColor: theme.choiceBorder },
  settingsGroup: { gap: 14, padding: 14, borderRadius: 20, borderCurve: 'continuous', backgroundColor: theme.panel },
  languageSearch: { minHeight: 44, borderRadius: 12, backgroundColor: theme.choice, paddingHorizontal: 12, fontSize: 17, color: theme.text, marginBottom: 16, outlineWidth: 0 },
  root: {
    flex: 1,
  },
  resultEmpty: { flex: 1, minHeight: 155, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12 },
  resultEmptyNarrow: { minHeight: 130 },
  resultEmptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: theme.activeSurface, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  resultEmptyTitle: { color: theme.text, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  workspaceFooterText: { color: theme.subtleText, fontSize: 11, textAlign: 'center', paddingTop: 6 },
  safeArea: {
    flex: 1,
    paddingTop: 8,
  },
  keyboardAvoiding: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: theme.mutedText,
    fontSize: 15,
    fontWeight: '700',
  },
  appShell: {
    flex: 1, width: '100%', maxWidth: 460, alignSelf: 'center',
  },
  appBody: {
    flex: 1, paddingHorizontal: 20, paddingTop: 6,
  },
  appBodyCompact: {
    paddingHorizontal: 16, paddingTop: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 88, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 18,
  },
  brandRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  brandIcon: {
    width: 42, height: 42,
  },
  brand: {
    color: theme.text, fontSize: 30, fontWeight: '700', letterSpacing: -1.1,
  },
  subtitle: {
    color: theme.mutedText, fontSize: 12, fontWeight: '400', marginTop: 3,
  },
  headerSettingsButton: {
    width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24,
  },
  headerSettingsButtonPressed: {
    transform: [{ scale: 0.94 }], opacity: 0.75,
  },
  settingsStatusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.secondaryAccent,
    borderWidth: 2,
    borderColor: theme.accent,
  },
  languageBar: {
    flexDirection: 'row', alignItems: 'center', gap: 2, padding: 5, marginBottom: 18, borderRadius: 28, shadowColor: theme.shadow, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  languageBarTargetOnly: {
    justifyContent: 'flex-start',
  },
  targetLanguageOnly: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  targetLanguageButtonRow: {
    flex: 1,
    minWidth: 0,
    maxWidth: 190,
    flexDirection: 'row',
  },
  languageBarLabel: {
    color: theme.mutedText, fontSize: 12, fontWeight: '400', textAlign: 'left', flexShrink: 1, paddingLeft: 12,
  },
  languageButton: {
    flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 6, paddingVertical: 8,
  },
  languageButtonRight: {
    justifyContent: 'flex-end', paddingRight: 12,
  },
  languageName: {
    color: theme.accentStrong, fontSize: 15, fontWeight: '600', textAlign: 'center', flexShrink: 1,
  },
  textModeBar: {
    position: 'relative', flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: theme.choice, padding: 4, marginBottom: 16,
  },
  textModeIndicator: {
    position: 'absolute', pointerEvents: 'none', left: 4, top: 4, bottom: 4, borderRadius: 12, backgroundColor: theme.name === 'dark' ? theme.activeSurface : theme.panel, shadowColor: theme.shadow, shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
  },
  textModeButton: {
    flex: 1,
    minHeight: 44,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 11,
    paddingHorizontal: 4,
    zIndex: 1,
  },
  textModeButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  textModeButtonText: {
    color: theme.mutedText, fontSize: 12, fontWeight: '500',
  },
  textModeButtonTextActive: {
    color: theme.accentStrong, fontWeight: '600',
  },
  workspace: {
    flex: 1, marginTop: -10,
  },
  workspaceContent: {
    paddingBottom: 24, paddingTop: 12,
  },
  panel: {
    borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 20, backgroundColor: theme.panel,
  },
  panelCompact: {
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18,
  },
  resultPanel: {
    borderBottomLeftRadius: 30, borderBottomRightRadius: 30, borderCurve: 'continuous', backgroundColor: theme.name === 'dark' ? '#242846' : '#f1f2fd', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, padding: 20, minHeight: 212,
  },
  resultPanelNarrow: { minHeight: 190, padding: 18 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelTitle: {
    color: theme.mutedText, fontSize: 13, fontWeight: '500',
  },
  panelMeta: {
    color: theme.accentStrong, fontSize: 13, fontWeight: '500', flexShrink: 1, textAlign: 'right',
  },
  sourceInputFrame: {
    minHeight: 124, paddingTop: 6,
  },
  sourceInputFrameCompact: {
    minHeight: 116,
  },
  sourceInputFrameNarrow: { minHeight: 104 },
  panelFocused: {
    backgroundColor: theme.name === 'dark' ? '#20263f' : '#fdfdff',
  },
  sourceInput: {
    minHeight: 116, maxHeight: 260, color: theme.text, fontSize: 22, lineHeight: 32, fontWeight: '400', padding: 0, outlineWidth: 0,
  },
  sourceInputCompact: {
    minHeight: 108, maxHeight: 230, fontSize: 21, lineHeight: 31,
  },
  sourceInputNarrow: { minHeight: 96, fontSize: 20, lineHeight: 30 },
  sourceToolbar: {
    minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 7, paddingVertical: 6,
  },
  sourceToolbarCompact: {
    gap: 6,
  },
  sourceToolbarGroup: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  sourceToolbarGroupCompact: {
    gap: 3,
  },
  resultText: {
    color: theme.text, fontSize: 22, lineHeight: 33, fontWeight: '400',
  },
  furiganaContainer: {
    gap: 4,
  },
  furiganaLine: {
    minHeight: 34,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  furiganaToken: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginRight: 3,
    marginBottom: 4,
    minHeight: 34,
  },
  furiganaReading: {
    color: theme.secondaryAccent,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
  furiganaBase: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  },
  furiganaPlain: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    marginRight: 2,
    marginBottom: 4,
  },
  furiganaBlankLine: {
    height: 22,
  },
  furiganaStatus: {
    color: theme.subtleText,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  markdownContainer: {
    gap: 6,
  },
  markdownGap: {
    height: 4,
  },
  markdownParagraph: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  markdownHeading: {
    color: theme.accentDeep,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '700',
    marginTop: 2,
  },
  markdownHeadingSmall: {
    fontSize: 16,
    lineHeight: 23,
  },
  markdownListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  markdownBullet: {
    width: 18,
    color: theme.secondaryAccent,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  markdownNumber: {
    minWidth: 22,
    color: theme.secondaryAccent,
    fontSize: 15,
    lineHeight: 25,
    fontWeight: '700',
    textAlign: 'right',
  },
  markdownListText: {
    flex: 1,
    color: theme.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  markdownStrong: {
    color: theme.text,
    fontWeight: '700',
  },
  markdownInlineCode: {
    color: theme.accentDeep,
    fontWeight: '400',
  },
  markdownCodeBlock: {
    color: theme.accentDeep,
    backgroundColor: theme.field,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.fieldBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  emptyText: {
    color: theme.mutedText, fontSize: 12, lineHeight: 19, fontWeight: '400', textAlign: 'center',
  },
  configGuidanceCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: theme.field,
    borderWidth: 1,
    borderColor: theme.fieldBorder,
    padding: 10,
    gap: 10,
  },
  configGuidanceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  configGuidanceTitle: {
    color: theme.accentDeep,
    fontSize: 12,
    fontWeight: '700',
  },
  configGuidanceText: {
    color: theme.mutedText,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
  },
  configGuidanceButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: theme.accent,
    shadowColor: theme.shadow,
    shadowOpacity: theme.name === 'dark' ? 0.36 : 0.1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
  },
  imagePreview: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: theme.imageBackground,
    borderWidth: 1,
    borderColor: theme.border,
  },
  imageToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.92)',
  },
  lightboxSafeArea: {
    flex: 1,
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  lightboxTitle: {
    color: theme.inverseText,
    fontSize: 18,
    fontWeight: '700',
  },
  lightboxSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  lightboxCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  lightboxBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  lightboxImageFrame: {
    width: '100%',
    maxHeight: '86%',
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: theme.imageBackground,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  previewImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  overlayLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: theme.overlayBackground,
    borderWidth: 1,
    borderColor: theme.overlayBorder,
  },
  overlayText: {
    color: theme.overlayText,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  notice: {
    color: theme.mutedText, fontSize: 12, fontWeight: '400', textAlign: 'center', paddingVertical: 6,
  },
  imageModeBar: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.field,
    borderWidth: 1,
    borderColor: theme.fieldBorder,
    borderRadius: 999,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  segmentButtonActive: {
    backgroundColor: theme.accent,
    shadowColor: theme.shadow,
    shadowOpacity: theme.name === 'dark' ? 0.34 : 0.1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
  },
  segmentButtonText: {
    color: theme.mutedText,
    fontSize: 13,
    fontWeight: '600',
  },
  segmentButtonTextActive: {
    color: theme.inverseText,
  },
  resultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
    marginTop: 'auto',
    paddingTop: 14,
  },
  iconButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 14,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: theme.shadow,
    shadowOpacity: theme.name === 'dark' ? 0.36 : 0.1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 },
  },
  iconButtonCompact: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: theme.chip,
  },
  iconButtonQuiet: { backgroundColor: 'transparent' },
  clearButton: { minHeight: 44, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 5 },
  clearButtonText: { color: theme.mutedText, fontSize: 11, fontWeight: '400' },
  translateButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 15, borderRadius: 24, borderCurve: 'continuous', backgroundColor: theme.accent, shadowColor: theme.accentStrong, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  translateButtonDisabled: { opacity: 0.45, shadowOpacity: 0 },
  translateButtonText: { color: theme.inverseText, fontSize: 14, fontWeight: '600' },
  iconButtonEmphasized: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
    shadowOpacity: theme.name === 'dark' ? 0.42 : 0.1,
  },
  iconButtonLabel: {
    color: theme.accentStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  iconButtonLabelEmphasized: {
    color: theme.inverseText,
  },
  disabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    transform: [{ scale: 0.96 }], opacity: 0.8,
  },
  busyOverlay: {
    position: 'absolute', left: 26, right: 26, bottom: 110, minHeight: 46, borderRadius: 23, backgroundColor: theme.busyBackground, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  busyText: {
    color: theme.inverseText,
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.backdrop,
  },
  languageModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  languageModalBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
    backgroundColor: theme.backdrop,
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: theme.card,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  settingsSheet: {
    height: '92%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: theme.card,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  setupSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: theme.card,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, paddingHorizontal: 4,
  },
  sheetHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    color: theme.text, fontSize: 23, fontWeight: '700', letterSpacing: -0.5, flexShrink: 1,
  },
  sheetSubtitle: {
    color: theme.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    marginTop: 2,
    flexShrink: 1,
  },
  languageList: {
    flexGrow: 0, maxHeight: 640, borderRadius: 20, backgroundColor: theme.panel,
  },
  languageRow: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border,
  },
  languageRowActive: {
    backgroundColor: theme.activeSurface,
  },
  languageRowName: {
    color: theme.text, fontSize: 17, fontWeight: '400',
  },
  settingsCategoryBar: {
    minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 16, padding: 4, marginBottom: 8, backgroundColor: theme.field,
  },
  settingsCategoryTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  settingsCategoryTabActive: {
    backgroundColor: theme.panel, borderColor: theme.border, shadowColor: theme.shadow, shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  settingsCategoryTabPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  settingsCategoryTabText: {
    color: theme.mutedText,
    fontSize: 10,
    fontWeight: '600',
  },
  settingsCategoryTabTextActive: {
    color: theme.accentStrong,
    fontWeight: '700',
  },
  settingsContent: {
    gap: 6, paddingBottom: 16,
  },
  setupContent: {
    gap: 12,
    paddingBottom: 14,
  },
  setupChoice: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    backgroundColor: theme.field,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  setupChoiceTextWrap: {
    flex: 1,
    gap: 3,
  },
  setupChoiceTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  setupChoiceText: {
    color: theme.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    outlineWidth: 0,
  },
  wizardStepRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  wizardStepPill: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.choice,
  },
  wizardStepPillActive: {
    backgroundColor: theme.accent,
  },
  wizardActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.footerBorder,
  },
  wizardButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: theme.choice,
  },
  wizardButtonPrimary: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: theme.accent,
    shadowColor: theme.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
  },
  wizardButtonText: {
    color: theme.mutedText,
    fontSize: 14,
    fontWeight: '600',
  },
  wizardButtonPrimaryText: {
    color: theme.inverseText,
    fontSize: 14,
    fontWeight: '600',
  },
  quickFillButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: theme.activeSurface,
    borderWidth: 1,
    borderColor: theme.activeBorder,
  },
  quickFillButtonText: {
    color: theme.accentStrong,
    fontSize: 12,
    fontWeight: '600',
  },
  wizardHint: {
    color: theme.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    borderRadius: 14,
    backgroundColor: theme.field,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  settingsSection: {
    gap: 9, paddingTop: 16, paddingBottom: 8,
  },
  settingsSectionTitle: {
    color: theme.mutedText, fontSize: 13, fontWeight: '500',
  },
  settingsSectionHeader: {
    minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 8,
  },
  settingsHelpButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  settingsHelp: {
    color: theme.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  settingsContentLoading: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedSettingsPanel: {
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.fieldBorder,
    backgroundColor: theme.field,
    padding: 11,
  },
  linkedSettingsTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  runtimeCheck: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: theme.field,
    borderWidth: 1,
    borderColor: theme.fieldBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  runtimeCheckIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: theme.activeSurface,
  },
  runtimeCheckText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  runtimeCheckTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
  },
  runtimeCheckDetail: {
    color: theme.mutedText,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
  },
  modelPackRoot: {
    color: theme.subtleText,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '400',
    borderRadius: 12,
    backgroundColor: theme.field,
    borderWidth: 1,
    borderColor: theme.fieldBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modelPackRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: theme.field,
    borderWidth: 1,
    borderColor: theme.fieldBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  modelPackDelete: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: theme.activeSurface,
  },
  offlineModelActions: {
    flexDirection: 'row',
    gap: 6,
  },
  field: {
    gap: 5,
  },
  fieldLabel: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: '600',
  },
  fieldInput: {
    minHeight: 48, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, backgroundColor: theme.field, color: theme.text, paddingHorizontal: 12, fontSize: 15, fontWeight: '400',
  },
  secureFieldInputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  secureFieldInput: {
    paddingRight: 46,
  },
  secureFieldReveal: {
    position: 'absolute',
    right: 6,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    minHeight: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: theme.field, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border,
  },
  choiceActive: {
    backgroundColor: theme.activeSurface,
    borderColor: theme.activeBorder,
  },
  choiceText: {
    color: theme.mutedText, fontSize: 12, fontWeight: '500',
  },
  choiceTextActive: {
    color: theme.accentStrong,
  },
  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    backgroundColor: theme.field,
    paddingHorizontal: 12,
  },
  toggleLabel: {
    color: theme.text, fontSize: 14, fontWeight: '400', flex: 1, paddingVertical: 10, paddingRight: 10,
  },
  configActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  configAction: {
    minHeight: 42,
    minWidth: '47%',
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    backgroundColor: theme.activeSurface,
    borderWidth: 1,
    borderColor: theme.activeBorder,
  },
  configActionText: {
    color: theme.accentStrong,
    fontSize: 12,
    fontWeight: '600',
  },
  payloadInput: {
    minHeight: 92,
    maxHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.fieldBorder,
    backgroundColor: theme.field,
    color: theme.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  importPayloadButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: theme.accent,
    shadowColor: theme.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
  },
  importPayloadButtonText: {
    color: theme.inverseText,
    fontSize: 13,
    fontWeight: '600',
  },
  qrPreview: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    shadowColor: theme.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 },
  },
  qrCaption: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: '600',
  },
  configStatus: {
    color: theme.accentStrong,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  qrScannerSheet: {
    height: '72%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: theme.card,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  deviceQASheet: {
    height: '82%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: theme.card,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  deviceQAContent: {
    gap: 8,
    paddingBottom: 14,
  },
  deviceQACheck: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: theme.field,
    borderWidth: 1,
    borderColor: theme.fieldBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  deviceQACheckIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: theme.activeSurface,
  },
  deviceQACheckText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  deviceQACheckTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '700',
  },
  deviceQACheckDetail: {
    color: theme.mutedText,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
  },
  cameraShell: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: theme.imageBackground,
  },
  cameraPreview: {
    flex: 1,
  },
  scanFrame: {
    position: 'absolute',
    left: '16%',
    right: '16%',
    top: '24%',
    bottom: '24%',
    borderWidth: 3,
    borderColor: theme.scanFrame,
    borderRadius: 22,
    backgroundColor: 'transparent',
  },
  settingsFooter: {
    flexDirection: 'row', gap: 10, paddingTop: 12, paddingBottom: 2,
  },
  footerButton: {
    flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: theme.choice,
  },
  footerButtonPrimary: {
    flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: theme.accent, shadowColor: theme.accentStrong, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  settingsSaveButton: {
    shadowColor: theme.accentStrong, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  footerButtonText: {
    color: theme.mutedText,
    fontSize: 15,
    fontWeight: '600',
  },
  footerButtonPrimaryText: {
    color: theme.inverseText,
    fontSize: 15,
    fontWeight: '600',
  },
  });
}
