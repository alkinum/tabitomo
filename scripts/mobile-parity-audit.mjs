import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const checks = [];
const textCache = new Map();
const jsonCache = new Map();

const pass = (message) => checks.push({ ok: true, message });
const fail = (message) => checks.push({ ok: false, message });
const assert = (condition, message) => (condition ? pass(message) : fail(message));

const readText = async (relativePath) => {
  if (!textCache.has(relativePath)) {
    textCache.set(relativePath, await readFile(path.join(rootDir, relativePath), 'utf8'));
  }
  return textCache.get(relativePath);
};

const readJson = async (relativePath) => {
  if (!jsonCache.has(relativePath)) {
    jsonCache.set(relativePath, JSON.parse(await readText(relativePath)));
  }
  return jsonCache.get(relativePath);
};

const fileExists = async (relativePath) => {
  try {
    await access(path.join(rootDir, relativePath));
    pass(`${relativePath} exists`);
    return true;
  } catch {
    fail(`${relativePath} is missing`);
    return false;
  }
};

const includesAll = async (relativePath, section, needles) => {
  const text = await readText(relativePath);
  for (const [label, needle] of needles) {
    assert(text.includes(needle), `${section}: ${relativePath} contains ${label}`);
  }
};

const excludesAll = async (relativePath, section, needles) => {
  const text = await readText(relativePath);
  for (const [label, needle] of needles) {
    assert(!text.includes(needle), `${section}: ${relativePath} excludes ${label}`);
  }
};

const dependencyDeclared = (packageJson, dependencyName) => (
  Boolean(packageJson.dependencies?.[dependencyName] || packageJson.devDependencies?.[dependencyName])
);

for (const relativePath of [
  'src/components/TranslationTool.tsx',
  'src/components/SettingsPanel.tsx',
  'src/components/WelcomeWizard.tsx',
  'src/components/ImportExportDialog.tsx',
  'apps/mobile/App.tsx',
  'apps/mobile/app.json',
  'apps/mobile/package.json',
  'apps/mobile/assets/icon.png',
  'public/icon.png',
  'apps/mobile/src/storage.ts',
  'apps/mobile/src/modelPacks.ts',
  'packages/tabitomo-native-cloudkit/expo-module.config.json',
  'packages/tabitomo-native-cloudkit/src/index.ts',
  'packages/tabitomo-native-cloudkit/ios/TabitomoNativeCloudKitModule.swift',
  'packages/tabitomo-core/src/index.ts',
  'packages/tabitomo-core/src/image.ts',
  'packages/tabitomo-native-speech/ios/TabitomoNativeSpeechModule.swift',
  'packages/tabitomo-native-vision/ios/TabitomoNativeVisionModule.swift',
  'packages/tabitomo-native-local-models/expo-module.config.json',
  'packages/tabitomo-native-local-models/src/index.ts',
  'packages/tabitomo-native-local-models/ios/TabitomoNativeLocalModelsModule.swift',
  'packages/tabitomo-native-local-models/ios/TabitomoLocalModelsBridge.mm',
  'scripts/prepare-mobile-native-runtimes.mjs',
  'scripts/mobile-model-assets-check.mjs',
  'scripts/expo-web-smoke.mjs',
  'scripts/ios-simulator-smoke.mjs',
  'scripts/provider-smoke.ts',
  'scripts/ios-device-qa-report-check.mjs',
  'scripts/mobile-release-readiness.mjs',
  'scripts/mobile-release-evidence.mjs',
  'scripts/sync-mobile-app-icon.mjs',
  '.agents/skills/tabitomo-platform-parity/SKILL.md',
  '.agents/cloud-ocr-provider-research.zh-CN.md',
]) {
  await fileExists(relativePath);
}

const rootPackage = await readJson('package.json');
const mobilePackage = await readJson('apps/mobile/package.json');
const appConfig = await readJson('apps/mobile/app.json');
const mobileApp = await readText('apps/mobile/App.tsx');
const iosSmoke = await readText('scripts/ios-simulator-smoke.mjs');

assert(rootPackage.scripts?.['test:mobile:parity-audit'] === 'node scripts/mobile-parity-audit.mjs', 'Root script test:mobile:parity-audit is declared');
assert(rootPackage.scripts?.['test:mobile:icon-parity'] === 'node scripts/sync-mobile-app-icon.mjs --check', 'Root script test:mobile:icon-parity is declared');
assert(rootPackage.scripts?.['icons:sync-mobile'] === 'node scripts/sync-mobile-app-icon.mjs', 'Root script icons:sync-mobile is declared');
assert(dependencyDeclared(mobilePackage, 'expo'), 'Expo dependency is declared');
assert(dependencyDeclared(mobilePackage, 'react-native'), 'React Native dependency is declared');
assert(dependencyDeclared(mobilePackage, '@tabitomo/native-cloudkit'), 'Native CloudKit dependency is declared');
assert(dependencyDeclared(mobilePackage, '@tabitomo/native-local-models'), 'Native local-model dependency is declared');
assert(!dependencyDeclared(mobilePackage, 'react-native-webview'), 'Mobile app does not depend on react-native-webview');
assert(appConfig.expo?.scheme === 'tabitomo', 'Expo URL scheme is tabitomo');
assert(appConfig.expo?.icon === './assets/icon.png', 'Expo uses the PWA-derived mobile app icon');
await includesAll('scripts/sync-mobile-app-icon.mjs', 'Web/mobile app icon parity', [
  ['PWA icon source', "'public/icon.png'"],
  ['mobile icon destination', "'apps/mobile/assets/icon.png'"],
  ['native Xcode icon destination', 'App-Icon-1024x1024@1x.png'],
  ['alpha removal', '.removeAlpha()'],
]);
assert(
  appConfig.expo?.ios?.entitlements?.['com.apple.developer.icloud-services']?.includes('CloudKit'),
  'Expo iOS entitlements enable CloudKit',
);
assert(
  appConfig.expo?.ios?.entitlements?.['com.apple.developer.icloud-container-identifiers']?.includes('iCloud.com.backrunner.tabitomo'),
  'Expo iOS entitlements declare the tabitomo iCloud container',
);

await includesAll('apps/mobile/App.tsx', 'Native shell', [
  ['React Native imports', "from 'react-native'"],
  ['SafeAreaView', 'SafeAreaView'],
  ['Pressable interactions', 'Pressable'],
  ['native modal surfaces', 'Modal'],
  ['native gradient background', 'LinearGradient'],
  ['system color scheme', 'useColorScheme'],
  ['flat press feedback', 'buttonPressed'],
  ['shadow styling', 'shadowOffset'],
]);
await excludesAll('apps/mobile/App.tsx', 'Native shell', [
  ['WebView wrapper', 'WebView'],
]);

await includesAll('packages/tabitomo-core/src/index.ts', 'Shared core exports', [
  ['languages', "export * from './languages';"],
  ['settings', "export * from './settings';"],
  ['provider presets', "export * from './providerPresets';"],
  ['translation', "export * from './translation';"],
  ['assistant', "export * from './assistant';"],
  ['image', "export * from './image';"],
  ['speech', "export * from './speech';"],
  ['config export', "export * from './configExport';"],
  ['Japanese helpers', "export * from './japanese';"],
  ['model packs', "export * from './modelPacks';"],
  ['settings sync merge', "export * from './settingsSync';"],
]);

await includesAll('apps/mobile/App.tsx', 'Shared core integration', [
  ['core import', "from '@tabitomo/core'"],
  ['translateText', 'translateText'],
  ['explainTextStream', 'explainTextStream'],
  ['answerQuestionStream', 'answerQuestionStream'],
  ['performOCR', 'performOCR'],
  ['streamTranslateImageWithVLM', 'streamTranslateImageWithVLM'],
  ['transcribeAudioFile', 'transcribeAudioFile'],
  ['importConfigPayload', 'importConfigPayload'],
  ['exportConfigPayload', 'exportConfigPayload'],
  ['selectModelPackActivation', 'selectModelPackActivation'],
]);

await includesAll('src/components/TranslationTool.tsx', 'Web first-screen language defaults', [
  ['Chinese source default', "useState<LanguageCode>('zh')"],
  ['Japanese target default', "useState<LanguageCode>('ja')"],
]);

await includesAll('packages/tabitomo-core/src/languages.ts', 'Shared language defaults match web', [
  ['Chinese source default', "DEFAULT_SOURCE_LANGUAGE: LanguageCode = 'zh'"],
  ['Japanese target default', "DEFAULT_TARGET_LANGUAGE: LanguageCode = 'ja'"],
]);

await includesAll('apps/mobile/App.tsx', 'Mobile first-screen language defaults', [
  ['shared source default', 'useState<LanguageCode>(DEFAULT_SOURCE_LANGUAGE)'],
  ['shared target default', 'useState<LanguageCode>(DEFAULT_TARGET_LANGUAGE)'],
]);

await includesAll('src/components/TranslationTool.tsx', 'Web text/image source features', [
  ['text input mode', "type InputMethod = 'text' | 'image' | 'qa';"],
  ['translation flow', 'handleTranslate'],
  ['explanation flow', 'handleWordExplanation'],
  ['Q&A flow', 'handleQA'],
  ['assistant target-only language bar', 'For explanation and Q/A: Only show target language'],
  ['VLM flow', 'streamTranslateImageWithVLM'],
  ['OCR flow', 'performOCR'],
  ['text to image language auto-swap', "previousMethod === 'text' && method === 'image'"],
  ['image to text language auto-swap', "previousMethod === 'image' && method === 'text'"],
  ['copy result', 'copyToClipboard'],
  ['copy success state', 'const [copied, setCopied]'],
  ['copy success timeout', 'setTimeout(() => setCopied(false), 2000)'],
]);

await includesAll('apps/mobile/App.tsx', 'Mobile text/image parity features', [
  ['text modes', "type TextMode = 'translation' | 'explanation' | 'qa';"],
  ['image modes', "type ImageMode = 'ocr' | 'vlm';"],
  ['text mode switcher', 'TextModeSwitcher'],
  ['assistant target-only language state', 'usesTargetOnlyLanguageBar'],
  ['assistant target-only language style', 'languageBarTargetOnly'],
  ['assistant target-only language label', 'Target Language'],
  ['image mode segmented control', 'SegmentButton label="VLM"'],
  ['OCR overlay segmented control', 'SegmentButton label="OCR overlay"'],
  ['copy action', 'handleCopy'],
  ['copy success state', 'const [resultCopied, setResultCopied]'],
  ['copy success reset timer', 'resultCopyResetTimerRef'],
  ['copy success label', "label={resultCopied ? 'Copied' : 'Copy'}"],
  ['TTS action', 'Speech.speak'],
  ['markdown renderer', 'function MarkdownText'],
  ['furigana renderer', 'function FuriganaText'],
  ['image lightbox', 'function ImageLightbox'],
  ['inline config guidance card', 'ConfigGuidanceCard'],
  ['targeted settings jump from guidance', 'settingsInitialJumpId'],
]);

await includesAll('apps/mobile/App.tsx', 'Audio parity features', [
  ['Expo audio recording', "from 'expo-audio'"],
  ['cloud ASR upload', 'transcribeAudioFile'],
  ['native speech module', "from '@tabitomo/native-speech'"],
  ['standard iOS Speech', 'startNativeSpeechRecognitionAsync(locale)'],
  ['on-device iOS Speech', 'startNativeSpeechRecognitionAsync(locale, true)'],
  ['microphone permission QA', "'mic-permission'"],
  ['speech provider QA', "'provider-speech'"],
]);

await includesAll('apps/mobile/App.tsx', 'Image parity features', [
  ['camera/photo picker', "from 'expo-image-picker'"],
  ['image manipulation', "from 'expo-image-manipulator'"],
  ['native Vision module', "from '@tabitomo/native-vision'"],
  ['OCR overlay process', 'setOverlayItems(translatedItems)'],
  ['camera entry', "handlePickImage('camera')"],
  ['library entry', "handlePickImage('library')"],
  ['enter image language context', 'enterImageLanguageContext'],
  ['leave image language context', 'leaveImageLanguageContext'],
  ['OCR config guidance', 'OCR Service Not Configured'],
  ['VLM config guidance', 'VLM Service Not Configured'],
  ['Vision OCR QA', "'vision-ocr'"],
  ['image provider QA', "'provider-image'"],
]);

await includesAll('src/components/SettingsPanel.tsx', 'Web settings surface', [
  ['General tab', 'value="general"'],
  ['Translation tab', 'value="translation"'],
  ['Speech tab', 'value="speech"'],
  ['Image tab', 'value="image"'],
  ['General AI format', 'settings.generalAI.apiFormat'],
  ['translation output mode', 'settings.translation?.outputMode'],
  ['speech provider', 'settings.speechRecognition.provider'],
  ['local ASR engine', 'localEngine'],
  ['OCR provider', 'settings.imageOCR.provider'],
  ['VLM settings', 'settings.vlm'],
  ['Alibaba Qwen OCR provider', 'Alibaba Qwen-OCR'],
  ['recommended Qwen OCR model', 'qwen3.5-ocr (Recommended)'],
  ['Qwen coordinate explanation', 'four-point absolute coordinates'],
]);

await excludesAll('src/components/SettingsPanel.tsx', 'Web supported OCR providers', [
  ['custom OCR provider option', 'Custom OCR provider'],
  ['General AI OCR option', 'General AI OCR'],
]);

await includesAll('apps/mobile/App.tsx', 'Mobile settings parity surface', [
  ['General AI section', 'title="General AI"'],
  ['General AI protocol selector', 'options={API_FORMAT_OPTIONS.map'],
  ['Translation override section', 'title="Translation override"'],
  ['Speech section', 'title="Speech"'],
  ['Image OCR section', 'title="Image OCR"'],
  ['VLM section', 'title="VLM image translation"'],
  ['Import/export section', 'title="Import / Export"'],
  ['Shared popup panel', 'function PopupPanel'],
  ['Settings category bar', 'SettingsCategoryBar'],
  ['Settings category items', 'SETTINGS_CATEGORY_ITEMS'],
  ['Initial Settings jump target', 'initialJumpId'],
  ['Settings jump category mapping', 'getSettingsCategoryForJump'],
  ['AI category view', "activeSettingsCategory === 'ai'"],
  ['Speech category view', "activeSettingsCategory === 'speech'"],
  ['Image category view', "activeSettingsCategory === 'image'"],
  ['Offline category view', "activeSettingsCategory === 'offline'"],
  ['Config category view', "activeSettingsCategory === 'config'"],
  ['native runtime section', 'title="Native local runtime"'],
  ['local models section', 'title="Local models"'],
  ['Hunyuan plain-output parity', 'Hunyuan-MT requires plain text output'],
  ['iCloud sync section', 'title="iCloud sync"'],
  ['truthful iCloud status', 'cloudSyncStatus.detail'],
  ['iCloud opt-out toggle', 'Sync settings with iCloud'],
  ['iCloud conflict help', 'newer edit wins'],
  ['settings help entry', 'function SettingsSection'],
  ['settings help popup', 'Alert.alert(title, help)'],
  ['native keyboard inset', 'automaticallyAdjustKeyboardInsets'],
  ['Alibaba Qwen OCR provider', 'Alibaba Qwen-OCR'],
  ['recommended Qwen OCR model', 'qwen3.5-ocr · Recommended'],
]);

await includesAll('packages/tabitomo-core/src/image.ts', 'Shared native Qwen OCR adapter', [
  ['advanced recognition task', "task: 'advanced_recognition'"],
  ['native response geometry path', 'ocr_result?.words_info'],
  ['default Qwen 3.5 OCR model', "'qwen3.5-ocr'"],
  ['legacy endpoint normalization', "endsWith('/compatible-mode/v1')"],
  ['unadapted provider error', 'custom OCR endpoints are not adapted'],
]);

await includesAll('apps/mobile/src/storage.ts', 'iOS CloudKit settings sync', [
  ['native module import', "from '@tabitomo/native-cloudkit'"],
  ['iOS-only sync boundary', "Platform.OS !== 'ios'"],
  ['local sync opt-out key', 'SETTINGS_SYNC_ENABLED_KEY'],
  ['local sync opt-out behavior', "setSyncStatus('disabled'"],
  ['CloudKit load', 'loadCloudKitSettingsAsync'],
  ['CloudKit save', 'saveCloudKitSettingsAsync'],
  ['CloudKit delete', 'deleteCloudKitSettingsAsync'],
  ['group conflict merge', 'mergeSettingsSyncSnapshots'],
  ['local sync preference setter', 'setMobileSettingsSyncEnabled'],
  ['offline local fallback', "setSyncStatus('local-only'"],
]);

await includesAll('packages/tabitomo-native-cloudkit/ios/TabitomoNativeCloudKitModule.swift', 'Native private CloudKit module', [
  ['private database', 'privateCloudDatabase'],
  ['encrypted settings payload', 'record.encryptedValues["payload"]'],
  ['explicit timestamp', 'record["updatedAt"]'],
  ['newer snapshot conflict guard', 'existingUpdatedAt > updatedAt'],
]);

await includesAll('.agents/skills/tabitomo-platform-parity/SKILL.md', 'Project platform parity skill', [
  ['Web and mobile parity workflow', 'Update both product surfaces in the same change'],
  ['Expo phone-first rule', 'signed iPhone builds and phone viewports first'],
  ['Expo Web boundary', 'Expo Web as a development and smoke-test surface'],
  ['default CloudKit sync', 'Enable private CloudKit settings sync by default'],
]);

await includesAll('src/components/WelcomeWizard.tsx', 'Web setup/import surface', [
  ['manual setup choice', 'Manual Setup'],
  ['import settings choice', 'Import Settings'],
  ['file import', 'handleImportFile'],
  ['QR scanner', 'startQRScanner'],
  ['SiliconFlow quick fill', 'handleQuickFillSiliconFlow'],
  ['password reveal toggle', 'showPassword'],
]);

await includesAll('apps/mobile/App.tsx', 'Mobile setup/import parity surface', [
  ['setup choice scene', "'setup-choice'"],
  ['setup manual scene', "'setup-manual'"],
  ['setup import scene', "'setup-import'"],
  ['manual setup', 'Manual setup'],
  ['encrypted config import', 'Import encrypted config'],
  ['sheet header text wraps beside close button', 'sheetHeaderText'],
  ['secure field reveal toggle', 'secureFieldReveal'],
  ['file import', 'handleImportConfigFile'],
  ['QR scanner sheet', 'QRScannerSheet'],
  ['protocol selector', 'options={API_FORMAT_OPTIONS.map'],
]);

await includesAll('src/components/ImportExportDialog.tsx', 'Web config portability', [
  ['settings file export', 'handleExportFile'],
  ['QR export', 'handleExportQR'],
  ['file import', 'handleImportFile'],
  ['QR import', 'startQRScanner'],
  ['password reveal toggle', 'showPassword'],
]);

await includesAll('apps/mobile/App.tsx', 'Mobile config portability', [
  ['SecureStore persistence', 'saveMobileSettings'],
  ['encrypted export', 'exportConfigPayload'],
  ['encrypted import', 'importConfigPayload'],
  ['document picker', 'DocumentPicker.getDocumentAsync'],
  ['share sheet', 'Sharing.shareAsync'],
  ['secure input show action', "'Show'"],
  ['secure input hide action', "'Hide'"],
  ['QR generation', 'QRCodePreview'],
  ['QR scan', 'CameraView'],
  ['settings QR import smoke', "'settings-qr-import'"],
  ['settings config round-trip smoke', "'settings-config-roundtrip'"],
]);

await includesAll('apps/mobile/App.tsx', 'Local model parity track', [
  ['native local runtime status', 'title="Native local runtime"'],
  ['model pack install', 'installModelPackFromManifestUrl'],
  ['model pack bytes install', 'installModelPackFromBytes'],
  ['installed pack activation', 'selectModelPackActivation'],
  ['ASR activation row', 'label="Active ASR"'],
  ['OCR activation row', 'label="Active OCR"'],
  ['model-pack Device QA', "'model-pack-storage'"],
  ['fixed offline model download', 'installOfflineModel'],
  ['Whisper download', "'whisper-base'"],
  ['SenseVoice download', "'sensevoice-small'"],
  ['PP-OCR v5 download', "'ppocr-v5-mobile'"],
  ['OCR settings shown for VLM reuse', 'OCR settings used by VLM'],
  ['image settings smoke selects OCR reuse', 'const SMOKE_IMAGE_SETTINGS'],
  ['native local-model module', "from '@tabitomo/native-local-models'"],
  ['native ASR inference', 'transcribeWithNativeLocalModelAsync'],
  ['native PP-OCR inference', 'recognizeTextWithNativePPOCRAsync'],
  ['native model validation', 'validateNativeLocalModelPackAsync'],
  ['unload before model delete', 'unloadNativeLocalModelAsync'],
  ['selected ASR model binding', 'getSelectedLocalASRModelId'],
]);

await includesAll('apps/mobile/src/modelPacks.ts', 'Fixed tabitomo model assets', [
  ['asset origin', 'https://assets.tabitomo.alkinum.io'],
  ['Whisper fixed asset', "id: 'whisper-base'"],
  ['SenseVoice fixed asset', "id: 'sensevoice-small'"],
  ['PP-OCR v5 fixed asset', "id: 'ppocr-v5-mobile'"],
  ['verified fixed-model installer', 'installOfflineModel'],
  ['manifest file origin enforcement', 'allowedAssetOrigin'],
]);

await includesAll('packages/tabitomo-native-local-models/ios/TabitomoLocalModelsBridge.mm', 'Native local inference adapters', [
  ['sherpa-onnx C API', 'SherpaOnnxCreateOfflineRecognizer'],
  ['Whisper model files', 'base-encoder.int8.onnx'],
  ['SenseVoice model file', 'model.int8.onnx'],
  ['ONNX Runtime session', 'Ort::Session'],
  ['PP-OCR detector', 'det.onnx'],
  ['PP-OCR recognizer', 'rec.onnx'],
  ['PP-OCR dictionary', 'dict.txt'],
]);

await includesAll('scripts/mobile-model-assets-check.mjs', 'Published local-model runtime assets', [
  ['fixed asset origin', 'https://assets.tabitomo.alkinum.io'],
  ['Whisper runtime files', "'base-encoder.int8.onnx', 'base-decoder.int8.onnx', 'base-tokens.txt'"],
  ['SenseVoice runtime files', "'model.int8.onnx', 'tokens.txt'"],
  ['PP-OCR runtime files', "'det.onnx', 'rec.onnx', 'dict.txt'"],
]);

await excludesAll('apps/mobile/App.tsx', 'Mobile local model product surface', [
  ['local model path field', '<Field label="Local model path"'],
  ['runtime asset URL field', '<Field label="Runtime assets URL"'],
  ['manifest URL field', '<Field\n                label="Manifest URL"'],
]);

for (const scene of [
  'main',
  'config-guidance',
  'markdown',
  'longtext',
  'image',
  'image-lightbox',
  'furigana',
  'language-picker',
  'qr-scanner',
  'device-qa',
  'settings',
  'settings-image',
  'settings-config',
  'settings-qr',
  'settings-qr-import',
  'settings-config-roundtrip',
  'settings-hunyuan-output',
  'text-provider-smoke',
  'image-provider-smoke',
  'speech-provider-smoke',
  'local-model-runtime-smoke',
  'settings-local',
  'settings-model-packs',
  'settings-model-pack-install',
  'setup-choice',
  'setup-manual',
  'setup-import',
]) {
  assert(mobileApp.includes(`'${scene}'`), `Mobile smoke scene ${scene} exists in app`);
  assert(iosSmoke.includes(scene), `iOS simulator smoke drives scene ${scene}`);
}

for (const checkId of [
  'secure-settings',
  'icloud-settings',
  'provider-text',
  'provider-image',
  'provider-speech',
  'tts',
  'mic-permission',
  'speech-permission',
  'on-device-speech',
  'local-asr-runtime',
  'local-ocr-runtime',
  'model-pack-storage',
  'camera-permission',
  'qr-camera-permission',
  'photo-permission',
  'capture-image',
  'pick-image',
  'vision-ocr',
  'share-file',
  'import-file',
]) {
  assert(mobileApp.includes(`'${checkId}'`), `Device QA check ${checkId} is exposed in mobile app`);
}

await includesAll('apps/mobile/App.tsx', 'Device QA report evidence metadata', [
  ['bundle identifier constant', "const TABITOMO_BUNDLE_IDENTIFIER = 'com.backrunner.tabitomo'"],
  ['build number constant', "const TABITOMO_BUILD_NUMBER = '1'"],
  ['build source constant', 'const TABITOMO_BUILD_SOURCE'],
  ['report bundle identifier field', 'bundleIdentifier: TABITOMO_BUNDLE_IDENTIFIER'],
  ['report build number field', 'buildNumber: TABITOMO_BUILD_NUMBER'],
  ['report build source field', 'buildSource: TABITOMO_BUILD_SOURCE'],
  ['physical device field', 'isPhysicalDevice: Device.isDevice === true'],
  ['simulator field', 'isSimulator: Device.isDevice !== true'],
  ['device model field', 'deviceModel: Device.modelName'],
]);

await includesAll('scripts/ios-device-qa-report-check.mjs', 'Device QA report validator evidence metadata', [
  ['app object requirement', 'Report app metadata must be an object.'],
  ['bundle identifier requirement', "report.app?.bundleIdentifier === 'com.backrunner.tabitomo'"],
  ['build number requirement', 'report.app?.buildNumber'],
  ['build source requirement', 'report.app?.buildSource'],
  ['physical device requirement', 'Release Device QA report must be exported from a physical iPhone'],
  ['simulator rejection requirement', 'Release Device QA report must not be exported from a simulator'],
  ['all checks required by default', "const requiredMode = process.env.TABITOMO_DEVICE_QA_REQUIRED || 'all'"],
]);

await includesAll('scripts/mobile-release-evidence.mjs', 'Release evidence real-device guard', [
  ['sample fixture path', 'sampleDeviceReportPath'],
  ['same-file sample detection', 'sameFilePath'],
  ['sample fixture manifest field', 'sampleFixture'],
  ['strict sample rejection', 'Device QA report is the checked-in sample fixture'],
  ['signed iPhone next action', 'export a signed iPhone report'],
]);

await includesAll('scripts/expo-web-smoke.mjs', 'Expo web smoke parity coverage', [
  ['first-run setup', 'Set up tabitomo'],
  ['settings import/export', 'Settings import'],
  ['mock text provider', 'mockProviderEndpoint'],
  ['VLM image flow', 'VLM'],
  ['OCR overlay flow', 'OCR'],
]);

await includesAll('scripts/provider-smoke.ts', 'Real provider smoke parity coverage', [
  ['translation', "'translation'"],
  ['explanation', "'explanation'"],
  ['Q&A', "'qa'"],
  ['furigana', "'furigana'"],
  ['VLM', "'vlm'"],
  ['OCR', "'ocr'"],
  ['ASR', "'asr'"],
]);

const failures = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'not ok'} - ${check.message}`);
}

if (failures.length > 0) {
  console.error(`Mobile parity audit failed: ${failures.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Mobile parity audit passed: ${checks.length} checks.`);
