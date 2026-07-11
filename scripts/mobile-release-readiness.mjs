import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const mobileDir = path.join(rootDir, 'apps/mobile');

const expected = {
  appName: 'tabitomo',
  slug: 'tabitomo',
  scheme: 'tabitomo',
  bundleIdentifier: process.env.TABITOMO_IOS_BUNDLE_ID || 'com.backrunner.tabitomo',
  buildNumber: process.env.TABITOMO_IOS_BUILD_NUMBER || '1',
  minIOS: process.env.TABITOMO_IOS_MIN_VERSION || '16.4',
  teamId: process.env.TABITOMO_DEVELOPMENT_TEAM || 'PB8H83VL3Z',
};

const requiredRootScripts = [
  'test:core',
  'test:provider-smoke',
  'test:mobile:device-qa-report',
  'test:mobile:ios-xcode-preflight',
  'test:mobile:parity-audit',
  'test:mobile:release-evidence',
  'test:mobile:web-smoke',
  'test:mobile:ios-smoke',
  'test:mobile:release-readiness',
  'test:mobile:model-assets',
  'test:mobile:icon-parity',
  'native-runtimes:prepare',
  'icons:sync-mobile',
  'ios:sync-project',
  'ios:open',
  'ios:set-build-number',
  'ios:archive',
  'ios:upload-testflight',
];

const requiredMobileDependencies = [
  '@tabitomo/core',
  '@tabitomo/native-cloudkit',
  '@tabitomo/native-speech',
  '@tabitomo/native-vision',
  '@tabitomo/native-local-models',
  'expo-dev-client',
  'expo-device',
  'expo-secure-store',
  'expo-camera',
  'expo-audio',
  'expo-image-picker',
  'expo-document-picker',
  'expo-sharing',
  'expo-speech',
  'expo-file-system',
];

const requiredPrivacyStrings = {
  NSCameraUsageDescription: 'Allow tabitomo to capture signs, menus, and labels for translation.',
  NSPhotoLibraryUsageDescription: 'Allow tabitomo to read travel photos for image translation.',
  NSMicrophoneUsageDescription: 'Allow tabitomo to record speech for translation.',
  NSSpeechRecognitionUsageDescription: 'Allow tabitomo to recognize speech for voice translation.',
};

const requiredEasProfiles = ['development', 'development-simulator', 'preview', 'preview-simulator', 'production'];
const requiredEasIgnoreEntries = ['node_modules/', 'dist/', 'output/', 'playwright-report/', 'test-results/'];

const checks = [];

const readText = (relativePath) => readFile(path.join(rootDir, relativePath), 'utf8');
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));

const pass = (message) => {
  checks.push({ ok: true, message });
};

const fail = (message) => {
  checks.push({ ok: false, message });
};

const assert = (condition, message) => {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
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

const pluginName = (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin);
const pluginOptions = (plugins, name) => {
  const plugin = plugins.find((candidate) => pluginName(candidate) === name);
  return Array.isArray(plugin) && plugin[1] && typeof plugin[1] === 'object' ? plugin[1] : {};
};

const plistValue = (plist, key) => {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return match?.[1] ?? null;
};

const plistBoolean = (plist, key) => {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<(true|false)\\s*/>`));
  return match?.[1] ?? null;
};

const plistArrayValues = (plist, key) => {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`));
  if (!match) {
    return [];
  }
  return Array.from(match[1].matchAll(/<string>([^<]*)<\/string>/g), (value) => value[1]);
};

const assertPbxSetting = (pbxproj, key, expectedValue) => {
  const matches = Array.from(pbxproj.matchAll(new RegExp(`${key} = ([^;]+);`, 'g')), (match) => match[1].replace(/^"|"$/g, ''));
  assert(matches.length > 0, `Xcode project declares ${key}`);
  const unexpected = matches.filter((value) => value !== expectedValue);
  assert(unexpected.length === 0, `Xcode project ${key} is ${expectedValue} in every build configuration`);
};

const assertEasBuildProfile = (easConfig, profileName) => {
  assert(Boolean(easConfig.build?.[profileName]), `EAS build profile ${profileName} exists`);
};

const appConfig = await readJson('apps/mobile/app.json');
const rootPackage = await readJson('package.json');
const mobilePackage = await readJson('apps/mobile/package.json');
const easConfig = await readJson('eas.json');
const podfileProperties = await readJson('apps/mobile/ios/Podfile.properties.json');
const easIgnore = await readText('.easignore');
const infoPlist = await readText('apps/mobile/ios/tabitomo/Info.plist');
const pbxproj = await readText('apps/mobile/ios/tabitomo.xcodeproj/project.pbxproj');
const podfile = await readText('apps/mobile/ios/Podfile');
const entitlements = await readText('apps/mobile/ios/tabitomo/tabitomo.entitlements');
const podfileLock = await readText('apps/mobile/ios/Podfile.lock');
const exportOptions = await readText('apps/mobile/ExportOptionsAppStore.plist');
const generatedExportOptions = await readText('apps/mobile/ios/ExportOptionsAppStore.plist');
const mobileGitignore = await readText('apps/mobile/.gitignore');
const rootGitignore = await readText('.gitignore');
const managedSigningPlugin = await readText('apps/mobile/plugins/withXcodeManagedSigning.js');
const xcodeSyncScript = await readText('scripts/ios-sync-xcode-project.sh');
const xcodeReleaseScript = await readText('scripts/ios-xcode-release.sh');
const mobileIconSyncScript = await readText('scripts/sync-mobile-app-icon.mjs');
const cloudKitModuleSource = await readText('packages/tabitomo-native-cloudkit/ios/TabitomoNativeCloudKitModule.swift');
const localModelsBridgeSource = await readText('packages/tabitomo-native-local-models/ios/TabitomoLocalModelsBridge.mm');
const nativeRuntimePrepareScript = await readText('scripts/prepare-mobile-native-runtimes.mjs');
const mobileAppSource = await readText('apps/mobile/App.tsx');
const deviceQaReportValidator = await readText('scripts/ios-device-qa-report-check.mjs');
const releaseEvidenceScript = await readText('scripts/mobile-release-evidence.mjs');
const deviceQaSampleReport = await readJson('scripts/fixtures/ios-device-qa-report.sample.json');
const webTranslationTool = await readText('src/components/TranslationTool.tsx');
const coreLanguages = await readText('packages/tabitomo-core/src/languages.ts');

const expo = appConfig.expo || {};
const ios = expo.ios || {};
const plugins = expo.plugins || [];

assert(expo.name === expected.appName, `Expo app name is ${expected.appName}`);
assert(expo.slug === expected.slug, `Expo slug is ${expected.slug}`);
assert(expo.scheme === expected.scheme, `Expo scheme is ${expected.scheme}`);
assert(expo.userInterfaceStyle === 'automatic', 'Expo userInterfaceStyle is automatic');
assert(ios.bundleIdentifier === expected.bundleIdentifier, `Expo iOS bundleIdentifier is ${expected.bundleIdentifier}`);
assert(ios.buildNumber === expected.buildNumber, `Expo iOS buildNumber is ${expected.buildNumber}`);
assert(ios.appleTeamId === expected.teamId, `Expo iOS appleTeamId is ${expected.teamId}`);
assert(ios.supportsTablet === true, 'Expo iOS supportsTablet is enabled');
assert(expo.icon === './assets/icon.png', 'Expo app icon uses the PWA-derived mobile asset');
assert(ios.infoPlist?.ITSAppUsesNonExemptEncryption === false, 'Expo declares no non-exempt encryption for App Store review');
assert(ios.infoPlist?.NSMicrophoneUsageDescription === requiredPrivacyStrings.NSMicrophoneUsageDescription, 'Expo source microphone privacy string is set');
assert(ios.infoPlist?.NSSpeechRecognitionUsageDescription === requiredPrivacyStrings.NSSpeechRecognitionUsageDescription, 'Expo source speech-recognition privacy string is set');

const pluginNames = new Set(plugins.map(pluginName));
for (const name of ['expo-secure-store', 'expo-camera', 'expo-audio', 'expo-image-picker', 'expo-asset', 'expo-sharing']) {
  assert(pluginNames.has(name), `Expo plugin ${name} is configured`);
}

const cameraOptions = pluginOptions(plugins, 'expo-camera');
assert(cameraOptions.barcodeScannerEnabled === true, 'expo-camera barcode scanner is enabled for QR setup import');
assert(cameraOptions.cameraPermission === 'Allow tabitomo to scan encrypted settings QR codes.', 'expo-camera QR permission string is set');

const imagePickerOptions = pluginOptions(plugins, 'expo-image-picker');
assert(imagePickerOptions.cameraPermission === requiredPrivacyStrings.NSCameraUsageDescription, 'expo-image-picker camera permission string is set');
assert(imagePickerOptions.photosPermission === requiredPrivacyStrings.NSPhotoLibraryUsageDescription, 'expo-image-picker photo-library permission string is set');

const audioOptions = pluginOptions(plugins, 'expo-audio');
assert(audioOptions.microphonePermission === requiredPrivacyStrings.NSMicrophoneUsageDescription, 'expo-audio microphone permission string is set');

assert(podfileProperties['ios.deploymentTarget'] === expected.minIOS, `Podfile.properties.json pins iOS deployment target ${expected.minIOS}`);
assert(podfile.includes("podfile_properties['ios.deploymentTarget'] || '16.4'"), 'Podfile reads ios.deploymentTarget from Podfile.properties.json');
assertPbxSetting(pbxproj, 'IPHONEOS_DEPLOYMENT_TARGET', expected.minIOS);
assertPbxSetting(pbxproj, 'PRODUCT_BUNDLE_IDENTIFIER', expected.bundleIdentifier);
assertPbxSetting(pbxproj, 'CODE_SIGN_STYLE', 'Automatic');
assertPbxSetting(pbxproj, 'DEVELOPMENT_TEAM', expected.teamId);
assertPbxSetting(pbxproj, 'PROVISIONING_PROFILE_SPECIFIER', '');
assert(pbxproj.includes('ProvisioningStyle = Automatic;'), 'Xcode target enables automatic provisioning');
assert(pbxproj.includes(`DevelopmentTeam = ${expected.teamId};`), 'Xcode target attributes use the expected development team');
assert(!mobileGitignore.split(/\r?\n/).includes('/ios'), 'Source-controlled iOS project is not ignored');
assert(managedSigningPlugin.includes("CODE_SIGN_STYLE = 'Automatic'"), 'Expo config plugin preserves Xcode-managed signing');
assert(managedSigningPlugin.includes("ProvisioningStyle = 'Automatic'"), 'Expo config plugin preserves automatic provisioning');
assert(xcodeSyncScript.includes('expo prebuild'), 'iOS sync script regenerates the Expo Xcode project');
assert(xcodeSyncScript.includes('pod install'), 'iOS sync script installs CocoaPods dependencies');
assert(xcodeSyncScript.includes('sync-mobile-app-icon.mjs'), 'iOS sync script refreshes the PWA-derived app icon');
assert(mobileIconSyncScript.includes("'public/icon.png'"), 'Mobile icon sync uses the PWA icon as source');
assert(mobileIconSyncScript.includes('.removeAlpha()'), 'Mobile icon sync removes alpha for Apple App Icon compliance');
assert(xcodeReleaseScript.includes('-allowProvisioningUpdates'), 'iOS release script allows Xcode to manage provisioning');
assert(xcodeReleaseScript.includes('CODE_SIGN_STYLE=Automatic'), 'iOS release script forces automatic signing');
assert(plistValue(exportOptions, 'destination') === 'upload', 'App Store export uploads to App Store Connect');
assert(plistValue(exportOptions, 'method') === 'app-store-connect', 'App Store export uses app-store-connect method');
assert(plistValue(exportOptions, 'signingStyle') === 'automatic', 'App Store export uses automatic signing');
assert(plistValue(exportOptions, 'teamID') === expected.teamId, `App Store export team is ${expected.teamId}`);
assert(plistValue(exportOptions, 'iCloudContainerEnvironment') === 'Production', 'App Store export uses CloudKit Production');
assert(generatedExportOptions === exportOptions, 'Generated iOS export options match the source template');
assert(rootGitignore.split(/\r?\n/).includes('/build/ios/'), 'Local iOS release artifacts are ignored');
for (const signingMaterial of ['*.p8', '*.p12', '*.mobileprovision', '*.keychain-db']) {
  assert(rootGitignore.split(/\r?\n/).includes(signingMaterial), `Apple signing material ${signingMaterial} is ignored`);
}

assert(plistValue(infoPlist, 'CFBundleDisplayName') === expected.appName, `Info.plist display name is ${expected.appName}`);
assert(plistValue(infoPlist, 'CFBundleShortVersionString') === expo.version, 'Info.plist marketing version matches Expo version');
assert(plistValue(infoPlist, 'CFBundleVersion') === expected.buildNumber, 'Info.plist build number matches Expo buildNumber');
assert(plistBoolean(infoPlist, 'ITSAppUsesNonExemptEncryption') === 'false', 'Info.plist declares no non-exempt encryption');
assert(plistArrayValues(infoPlist, 'CFBundleURLSchemes').includes(expected.scheme), `Info.plist URL schemes include ${expected.scheme}`);
assert(plistArrayValues(infoPlist, 'CFBundleURLSchemes').includes(expected.bundleIdentifier), 'Info.plist URL schemes include bundle identifier callback');
assert(plistArrayValues(infoPlist, 'UIBackgroundModes').includes('audio'), 'Info.plist enables audio background mode for native recording flow');

for (const [key, value] of Object.entries(requiredPrivacyStrings)) {
  assert(plistValue(infoPlist, key) === value, `Info.plist ${key} is release-specific`);
}

const cloudKitContainer = 'iCloud.com.backrunner.tabitomo';
assert(ios.entitlements?.['com.apple.developer.icloud-services']?.includes('CloudKit'), 'Expo source enables the CloudKit iCloud service');
assert(ios.entitlements?.['com.apple.developer.icloud-container-identifiers']?.includes(cloudKitContainer), 'Expo source declares the tabitomo iCloud container');
assert(plistArrayValues(entitlements, 'com.apple.developer.icloud-services').includes('CloudKit'), 'Native entitlements enable CloudKit');
assert(plistArrayValues(entitlements, 'com.apple.developer.icloud-container-identifiers').includes(cloudKitContainer), 'Native entitlements declare the tabitomo iCloud container');
assert(plistValue(entitlements, 'com.apple.developer.ubiquity-kvstore-identifier') === '$(TeamIdentifierPrefix)com.backrunner.tabitomo', 'Native entitlements declare the tabitomo ubiquity store');
assert(pbxproj.includes('com.apple.iCloud = {'), 'Xcode target declares the iCloud system capability');
assert(podfileLock.includes('TabitomoNativeCloudKit'), 'CocoaPods autolinks the native CloudKit module');
assert(podfileLock.includes('TabitomoNativeLocalModels'), 'CocoaPods autolinks the native local-model module');
assert(podfileLock.includes('onnxruntime-c (= 1.27.0)'), 'CocoaPods pins ONNX Runtime 1.27.0 for PP-OCR and sherpa compatibility');
assert(cloudKitModuleSource.includes('privateCloudDatabase'), 'Native CloudKit module uses the private database');
assert(cloudKitModuleSource.includes('record.encryptedValues["payload"]'), 'Native CloudKit module encrypts the settings payload');
assert(localModelsBridgeSource.includes('SherpaOnnxCreateOfflineRecognizer'), 'Native local-model module runs Whisper and SenseVoice through sherpa-onnx');
assert(localModelsBridgeSource.includes('Ort::Session'), 'Native local-model module runs PP-OCR through ONNX Runtime');
assert(nativeRuntimePrepareScript.includes('dcc5f1748144e88bdb17dfb7b9e5d06d194f478cdb6047adc133f9480c473b1a'), 'Native runtime archive checksum is pinned');
assert(mobileAppSource.includes('transcribeWithNativeLocalModelAsync'), 'Mobile local speech consumes the downloaded ASR model');
assert(mobileAppSource.includes('recognizeTextWithNativePPOCRAsync'), 'Mobile local OCR consumes the downloaded PP-OCR model');
assert(mobileAppSource.includes('validateNativeLocalModelPackAsync'), 'Mobile validates model files in the native runtime before activation');
assert(mobileAppSource.includes(`const TABITOMO_BUNDLE_IDENTIFIER = '${expected.bundleIdentifier}'`), 'Mobile Device QA report uses expected bundle identifier constant');
assert(mobileAppSource.includes(`const TABITOMO_BUILD_NUMBER = '${expected.buildNumber}'`), 'Mobile Device QA report uses expected build number constant');
assert(mobileAppSource.includes('buildSource: TABITOMO_BUILD_SOURCE'), 'Mobile Device QA report includes build source metadata');
assert(mobileAppSource.includes("from 'expo-device'"), 'Mobile Device QA report imports expo-device metadata');
assert(mobileAppSource.includes('isPhysicalDevice: Device.isDevice === true'), 'Mobile Device QA report includes physical-device metadata');
assert(mobileAppSource.includes('isSimulator: Device.isDevice !== true'), 'Mobile Device QA report includes simulator metadata');
assert(mobileAppSource.includes("settings.speechRecognition.provider === 'local'"), 'Mobile speech flow exposes the native on-device provider boundary');
assert(mobileAppSource.includes('transcribeAudioFile(new File(recorder.uri), settings)'), 'Mobile cloud speech uses record-then-transcribe after recording stops');
assert(webTranslationTool.includes("useState<LanguageCode>('zh')"), 'Web first-screen source language defaults to Chinese');
assert(webTranslationTool.includes("useState<LanguageCode>('ja')"), 'Web first-screen target language defaults to Japanese');
assert(coreLanguages.includes("DEFAULT_SOURCE_LANGUAGE: LanguageCode = 'zh'"), 'Shared default source language matches web');
assert(coreLanguages.includes("DEFAULT_TARGET_LANGUAGE: LanguageCode = 'ja'"), 'Shared default target language matches web');
assert(mobileAppSource.includes('useState<LanguageCode>(DEFAULT_SOURCE_LANGUAGE)'), 'Mobile source language uses shared default');
assert(mobileAppSource.includes('useState<LanguageCode>(DEFAULT_TARGET_LANGUAGE)'), 'Mobile target language uses shared default');
assert(deviceQaSampleReport.app?.bundleIdentifier === expected.bundleIdentifier, 'Device QA sample report includes expected bundle identifier');
assert(deviceQaSampleReport.app?.buildNumber === expected.buildNumber, 'Device QA sample report includes expected build number');
assert(typeof deviceQaSampleReport.app?.buildSource === 'string' && deviceQaSampleReport.app.buildSource.length > 0, 'Device QA sample report includes build source');
assert(deviceQaSampleReport.runtime?.isPhysicalDevice === false, 'Device QA sample report is marked as non-physical sample');
assert(deviceQaSampleReport.runtime?.isSimulator === true, 'Device QA sample report is marked as simulator sample');
assert(typeof deviceQaSampleReport.runtime?.deviceModel === 'string' && deviceQaSampleReport.runtime.deviceModel.length > 0, 'Device QA sample report includes device model');
assert(deviceQaReportValidator.includes("report.app?.bundleIdentifier === 'com.backrunner.tabitomo'"), 'Device QA report validator requires bundle identifier');
assert(deviceQaReportValidator.includes('report.app?.buildNumber'), 'Device QA report validator requires build number');
assert(deviceQaReportValidator.includes('report.app?.buildSource'), 'Device QA report validator requires build source');
assert(deviceQaReportValidator.includes('Release Device QA report must be exported from a physical iPhone'), 'Device QA report validator rejects non-physical release reports');
assert(deviceQaReportValidator.includes('Release Device QA report must not be exported from a simulator'), 'Device QA report validator rejects simulator release reports');
assert(releaseEvidenceScript.includes('sampleDeviceReportPath'), 'Release evidence detects the checked-in Device QA sample fixture');
assert(releaseEvidenceScript.includes('Device QA report is the checked-in sample fixture'), 'Strict release evidence rejects the checked-in Device QA sample fixture');
assert(releaseEvidenceScript.includes('selectionSource'), 'Release evidence records release path selection source');
assert(releaseEvidenceScript.includes('default-local-xcode'), 'Release evidence defaults to local Xcode when EAS CLI is unavailable');

for (const scriptName of requiredRootScripts) {
  assert(typeof rootPackage.scripts?.[scriptName] === 'string', `Root package script ${scriptName} exists`);
}

for (const dependencyName of requiredMobileDependencies) {
  assert(
    typeof mobilePackage.dependencies?.[dependencyName] === 'string',
    `Mobile dependency ${dependencyName} is declared`,
  );
}

for (const profileName of requiredEasProfiles) {
  assertEasBuildProfile(easConfig, profileName);
}
assert(easConfig.build?.development?.developmentClient === true, 'EAS development profile builds the dev client');
assert(easConfig.build?.development?.distribution === 'internal', 'EAS development profile uses internal distribution');
assert(easConfig.build?.['development-simulator']?.extends === 'development', 'EAS development-simulator extends development');
assert(easConfig.build?.['development-simulator']?.ios?.simulator === true, 'EAS development-simulator targets iOS simulator');
assert(easConfig.build?.preview?.distribution === 'internal', 'EAS preview profile uses internal distribution');
assert(easConfig.build?.['preview-simulator']?.extends === 'preview', 'EAS preview-simulator extends preview');
assert(easConfig.build?.['preview-simulator']?.ios?.simulator === true, 'EAS preview-simulator targets iOS simulator');
assert(easConfig.build?.production?.autoIncrement === true, 'EAS production profile auto-increments native build numbers');
assert(Boolean(easConfig.submit?.production?.ios), 'EAS production submit profile exists for iOS');
for (const entry of requiredEasIgnoreEntries) {
  assert(easIgnore.includes(entry), `.easignore excludes ${entry}`);
}

await fileExists('apps/mobile/ios/tabitomo.xcworkspace');
await fileExists('apps/mobile/ios/tabitomo.xcodeproj/project.pbxproj');
await fileExists('apps/mobile/ExportOptionsAppStore.plist');
await fileExists('apps/mobile/ios/ExportOptionsAppStore.plist');
await fileExists('apps/mobile/plugins/withXcodeManagedSigning.js');
await fileExists('public/icon.png');
await fileExists('apps/mobile/assets/icon.png');
await fileExists('apps/mobile/ios/tabitomo/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png');
await fileExists('packages/tabitomo-native-cloudkit/ios/TabitomoNativeCloudKitModule.swift');
await fileExists('packages/tabitomo-native-local-models/ios/TabitomoNativeLocalModelsModule.swift');
await fileExists('packages/tabitomo-native-local-models/ios/TabitomoLocalModelsBridge.mm');
await fileExists('packages/tabitomo-native-local-models/ios/TabitomoNativeLocalModels.podspec');
await fileExists('scripts/prepare-mobile-native-runtimes.mjs');
await fileExists('scripts/mobile-model-assets-check.mjs');
await fileExists('.agents/skills/tabitomo-platform-parity/SKILL.md');
await fileExists('eas.json');
await fileExists('.easignore');
await fileExists('scripts/ios-local-xcode-preflight.mjs');
await fileExists('scripts/ios-sync-xcode-project.sh');
await fileExists('scripts/ios-open-xcode.sh');
await fileExists('scripts/ios-set-build-number.mjs');
await fileExists('scripts/ios-xcode-release.sh');
await fileExists('scripts/sync-mobile-app-icon.mjs');
await fileExists('scripts/provider-smoke.ts');
await fileExists('scripts/ios-device-qa-report-check.mjs');
await fileExists('scripts/mobile-parity-audit.mjs');
await fileExists('scripts/mobile-release-evidence.mjs');
await fileExists('scripts/fixtures/ios-device-qa-report.sample.json');
await fileExists('scripts/ios-simulator-smoke.mjs');
await fileExists('scripts/expo-web-smoke.mjs');
await fileExists('.agents/ios-real-device-qa.md');
await fileExists('.agents/ios-release-evidence.zh-CN.md');
await fileExists('.agents/ios-local-xcode-release-path.zh-CN.md');
await fileExists('.agents/ios-eas-release-path.zh-CN.md');
await fileExists('.agents/ios-local-model-runtime-strategy.md');

const failures = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'not ok'} - ${check.message}`);
}

if (failures.length > 0) {
  console.error(`Mobile release readiness failed: ${failures.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Mobile release readiness passed: ${checks.length} checks.`);
