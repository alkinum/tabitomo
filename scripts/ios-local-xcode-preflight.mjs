import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const workspaceRelativePath = 'apps/mobile/ios/tabitomo.xcworkspace';
const workspacePath = path.join(rootDir, workspaceRelativePath);
const scheme = process.env.TABITOMO_XCODE_SCHEME || 'tabitomo';
const configuration = process.env.TABITOMO_XCODE_CONFIGURATION || 'Release';
const sdk = process.env.TABITOMO_XCODE_SDK || 'iphoneos';
const requireSigning = /^(1|true|yes|on)$/i.test(process.env.TABITOMO_XCODE_REQUIRE_SIGNING || '');

const expected = {
  bundleIdentifier: process.env.TABITOMO_IOS_BUNDLE_ID || 'com.backrunner.tabitomo',
  buildNumber: process.env.TABITOMO_IOS_BUILD_NUMBER || '1',
  minIOS: process.env.TABITOMO_IOS_MIN_VERSION || '16.4',
  teamId: process.env.TABITOMO_DEVELOPMENT_TEAM || 'PB8H83VL3Z',
};

const checks = [];
const notes = [];

const pass = (message) => checks.push({ ok: true, message });
const fail = (message) => checks.push({ ok: false, message });
const assert = (condition, message) => (condition ? pass(message) : fail(message));

const run = (command, args, timeoutMs = 30_000) => new Promise((resolve) => {
  execFile(command, args, { cwd: rootDir, timeout: timeoutMs, env: process.env }, (error, stdout, stderr) => {
    resolve({
      ok: !error,
      code: typeof error?.code === 'number' ? error.code : error ? 1 : 0,
      stdout: String(stdout || '').trim(),
      stderr: String(stderr || '').trim(),
      error: error ? error.message : '',
    });
  });
});

const fileExists = async (absolutePath, label) => {
  try {
    await access(absolutePath);
    pass(`${label} exists`);
    return true;
  } catch {
    fail(`${label} is missing`);
    return false;
  }
};

const parseBuildSettings = (output, targetName) => {
  const settings = new Map();
  const targetMarker = `Build settings for action build and target ${targetName}:`;
  let inTarget = false;
  for (const line of output.split('\n')) {
    if (line.includes('Build settings for action build and target ')) {
      inTarget = line.includes(targetMarker);
      continue;
    }
    if (!inTarget) {
      continue;
    }
    const match = line.match(/^\s+([A-Z0-9_]+)\s=\s(.*)$/);
    if (match) {
      settings.set(match[1], match[2].trim());
    }
  }
  return settings;
};

const plistValue = (plist, key) => {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return match?.[1] ?? null;
};

const plistBoolean = (plist, key) => {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<(true|false)\\s*/>`));
  return match?.[1] ?? null;
};

await fileExists(workspacePath, `Xcode workspace ${workspaceRelativePath}`);

const appConfig = JSON.parse(await readFile(path.join(rootDir, 'apps/mobile/app.json'), 'utf8'));
const podfileProperties = JSON.parse(await readFile(path.join(rootDir, 'apps/mobile/ios/Podfile.properties.json'), 'utf8'));
const infoPlistPath = path.join(rootDir, 'apps/mobile/ios/tabitomo/Info.plist');
const infoPlist = await readFile(infoPlistPath, 'utf8');

const xcodeVersion = await run('xcodebuild', ['-version']);
assert(xcodeVersion.ok, 'xcodebuild is available');
if (xcodeVersion.ok) {
  notes.push(`xcodebuild=${xcodeVersion.stdout.replace(/\n/g, ' / ')}`);
}

const xcrunVersion = await run('xcrun', ['--version']);
assert(xcrunVersion.ok, 'xcrun is available');
if (xcrunVersion.ok) {
  notes.push(`xcrun=${xcrunVersion.stdout}`);
}

const sdkVersion = await run('xcrun', ['--sdk', sdk, '--show-sdk-version']);
assert(sdkVersion.ok, `xcrun can resolve ${sdk} SDK`);
if (sdkVersion.ok) {
  notes.push(`${sdk}=${sdkVersion.stdout}`);
}

const workspaceList = await run('xcodebuild', ['-list', '-json', '-workspace', workspacePath]);
assert(workspaceList.ok, 'xcodebuild can inspect the workspace');
if (workspaceList.ok) {
  try {
    const parsed = JSON.parse(workspaceList.stdout);
    const schemes = parsed.workspace?.schemes || [];
    assert(schemes.includes(scheme), `Xcode workspace exposes scheme ${scheme}`);
  } catch (error) {
    fail(`Could not parse xcodebuild workspace list JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const buildSettingsResult = await run('xcodebuild', [
  '-workspace',
  workspacePath,
  '-scheme',
  scheme,
  '-configuration',
  configuration,
  '-sdk',
  sdk,
  '-showBuildSettings',
], 60_000);
assert(buildSettingsResult.ok, `xcodebuild can show ${configuration}/${sdk} build settings`);

if (buildSettingsResult.ok) {
  const settings = parseBuildSettings(buildSettingsResult.stdout, scheme);
  const productBundleIdentifier = settings.get('PRODUCT_BUNDLE_IDENTIFIER') || '';
  const deploymentTarget = settings.get('IPHONEOS_DEPLOYMENT_TARGET') || '';
  const marketingVersion = settings.get('MARKETING_VERSION') || '';
  const currentProjectVersion = settings.get('CURRENT_PROJECT_VERSION') || '';
  const sdkRoot = settings.get('SDKROOT') || '';
  const codeSignStyle = settings.get('CODE_SIGN_STYLE') || '';
  const developmentTeam = settings.get('DEVELOPMENT_TEAM') || '';
  const provisioningProfileSpecifier = settings.get('PROVISIONING_PROFILE_SPECIFIER') || '';
  const productName = settings.get('PRODUCT_NAME') || '';

  assert(productBundleIdentifier === expected.bundleIdentifier, `Release build PRODUCT_BUNDLE_IDENTIFIER is ${expected.bundleIdentifier}`);
  assert(deploymentTarget === expected.minIOS, `Release build IPHONEOS_DEPLOYMENT_TARGET is ${expected.minIOS}`);
  assert(marketingVersion === appConfig.expo?.version, 'Release build MARKETING_VERSION matches Expo version');
  assert(currentProjectVersion === expected.buildNumber, `Release build CURRENT_PROJECT_VERSION is ${expected.buildNumber}`);
  assert(sdkRoot.startsWith(sdk) || sdkRoot.toLowerCase().includes(`/${sdk.toLowerCase()}`), `Release build SDKROOT targets ${sdk}`);
  assert(productName === 'tabitomo', 'Release build PRODUCT_NAME is tabitomo');
  assert(podfileProperties['ios.deploymentTarget'] === expected.minIOS, `Podfile.properties.json pins iOS deployment target ${expected.minIOS}`);
  assert(plistValue(infoPlist, 'CFBundleDisplayName') === 'tabitomo', 'Info.plist display name is tabitomo');
  assert(plistValue(infoPlist, 'CFBundleShortVersionString') === appConfig.expo?.version, 'Info.plist marketing version matches Expo version');
  assert(plistValue(infoPlist, 'CFBundleVersion') === expected.buildNumber, `Info.plist build number is ${expected.buildNumber}`);
  assert(plistBoolean(infoPlist, 'ITSAppUsesNonExemptEncryption') === 'false', 'Info.plist declares no non-exempt encryption');
  assert(appConfig.expo?.ios?.appleTeamId === expected.teamId, `Expo source Apple team is ${expected.teamId}`);
  assert(codeSignStyle === 'Automatic', 'Release build uses Xcode-managed automatic signing');
  assert(developmentTeam === expected.teamId, `Release build DEVELOPMENT_TEAM is ${expected.teamId}`);
  assert(provisioningProfileSpecifier === '', 'Release build does not pin a provisioning profile');

  const signingReady = codeSignStyle === 'Automatic' && developmentTeam === expected.teamId;
  if (signingReady) {
    pass('Release build has Xcode-managed signing metadata');
  } else {
    const message = 'Release build is missing Xcode-managed signing metadata; signed device archive still needs a valid team configuration.';
    if (requireSigning) {
      fail(message);
    } else {
      pass(message);
    }
  }

  notes.push(`bundle=${productBundleIdentifier}`);
  notes.push(`configuration=${configuration}`);
  notes.push(`sdkroot=${sdkRoot}`);
  notes.push(`codeSignStyle=${codeSignStyle || 'unknown'}`);
  notes.push(`developmentTeam=${developmentTeam || 'missing'}`);
  notes.push(`signingReady=${signingReady ? 'yes' : 'no'}`);
}

const failures = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'not ok'} - ${check.message}`);
}

if (notes.length > 0) {
  console.log(`iOS local Xcode preflight notes: ${notes.join(', ')}.`);
}

if (failures.length > 0) {
  console.error(`iOS local Xcode preflight failed: ${failures.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`iOS local Xcode preflight passed: ${checks.length} checks.`);
