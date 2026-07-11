import { access, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const mobileDir = path.join(rootDir, 'apps/mobile');
const workspace = path.join(mobileDir, 'ios/tabitomo.xcworkspace');

const usage = `Usage: pnpm ios:install-device [options]

Builds the native iOS app and installs it on a paired iPhone. Use --launch to open it.

Options:
  --device <id>                 CoreDevice UUID, UDID, name, or DNS name.
                                Required only when more than one paired iPhone is available.
  --configuration <Debug|Release>
                                Xcode configuration. Default: Release.
  --derived-data <path>         Preserve Xcode build products at this path.
  --launch                      Launch the app after installation. The device must be unlocked.
  --verbose                     Show full Xcode build output.
  -h, --help                    Show this help.

Environment:
  TABITOMO_IOS_DEVICE           Default value for --device.
  TABITOMO_IOS_CONFIGURATION    Default value for --configuration.
  TABITOMO_IOS_DERIVED_DATA     Default value for --derived-data.
`;

const fail = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    encoding: 'utf8',
    env: process.env,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    throw new Error(`Could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}${output ? `:\n${output}` : '.'}`);
  }
  return result.stdout?.trim() || '';
};

const findApps = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const apps = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      apps.push(fullPath);
    } else if (entry.isDirectory()) {
      apps.push(...(await findApps(fullPath)));
    }
  }
  return apps;
};

const findBuiltApp = async (derivedDataPath, productName) => {
  const productsDir = path.join(derivedDataPath, 'Build', 'Products');
  const apps = await findApps(productsDir);
  const expectedName = `${productName}.app`;
  const expectedApp = apps.find((appPath) => path.basename(appPath) === expectedName);

  if (expectedApp) {
    return expectedApp;
  }
  if (apps.length === 1) {
    return apps[0];
  }
  fail(`Could not uniquely identify the built app in ${productsDir}. Found: ${apps.join(', ') || 'none'}`);
};

const deviceDisplayName = (device) => device.deviceProperties?.name || device.hardwareProperties?.udid || device.identifier;

const parseArgs = () => {
  const options = {
    device: process.env.TABITOMO_IOS_DEVICE,
    configuration: process.env.TABITOMO_IOS_CONFIGURATION || 'Release',
    derivedData: process.env.TABITOMO_IOS_DERIVED_DATA,
    launch: false,
    verbose: false,
  };

  for (let index = 0; index < process.argv.slice(2).length; index += 1) {
    const argument = process.argv.slice(2)[index];
    const value = process.argv.slice(2)[index + 1];

    switch (argument) {
      case '--':
        break;
      case '--device':
        if (!value) fail('--device requires a value.');
        options.device = value;
        index += 1;
        break;
      case '--configuration':
        if (!value) fail('--configuration requires a value.');
        options.configuration = value;
        index += 1;
        break;
      case '--derived-data':
        if (!value) fail('--derived-data requires a value.');
        options.derivedData = path.resolve(rootDir, value);
        index += 1;
        break;
      case '--launch':
        options.launch = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '-h':
      case '--help':
        console.log(usage);
        process.exit(0);
      default:
        fail(`Unknown option: ${argument}\n\n${usage}`);
    }
  }

  if (!['Debug', 'Release'].includes(options.configuration)) {
    fail(`Unsupported configuration "${options.configuration}". Use Debug or Release.`);
  }
  return options;
};

const selectDevice = async (requestedDevice) => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'tabitomo-devicectl-'));
  const outputPath = path.join(outputDir, 'devices.json');
  run('xcrun', ['devicectl', 'list', 'devices', '--json-output', outputPath]);
  const output = JSON.parse(await readFile(outputPath, 'utf8'));
  const devices = output.result?.devices || [];
  const pairedIPhones = devices.filter((device) => (
    device.connectionProperties?.pairingState === 'paired'
    && device.hardwareProperties?.platform === 'iOS'
    && device.hardwareProperties?.deviceType === 'iPhone'
  ));
  const candidates = requestedDevice
    ? pairedIPhones.filter((device) => [
      device.identifier,
      device.hardwareProperties?.udid,
      device.hardwareProperties?.serialNumber,
      device.connectionProperties?.potentialHostnames?.[0],
      device.deviceProperties?.name,
    ].includes(requestedDevice))
    : pairedIPhones;

  if (candidates.length === 0) {
    const available = pairedIPhones.map((device) => `${deviceDisplayName(device)} (${device.identifier})`).join(', ');
    fail(requestedDevice
      ? `No paired iPhone matches "${requestedDevice}". Available: ${available || 'none'}.`
      : 'No paired iPhone is available. Pair, unlock, and enable Developer Mode on the device, then retry.');
  }
  if (candidates.length > 1) {
    fail(`Multiple paired iPhones are available. Re-run with --device <id>: ${candidates.map((device) => `${deviceDisplayName(device)} (${device.identifier})`).join(', ')}.`);
  }
  return candidates[0];
};

const options = parseArgs();
await access(workspace).catch(() => fail(`Xcode workspace is missing: ${workspace}. Run pnpm ios:sync-project first.`));

const appConfig = JSON.parse(await readFile(path.join(mobileDir, 'app.json'), 'utf8'));
const scheme = appConfig.expo?.name || 'tabitomo';
const bundleId = appConfig.expo?.ios?.bundleIdentifier;
if (!bundleId) fail('apps/mobile/app.json is missing expo.ios.bundleIdentifier.');

const device = await selectDevice(options.device);
const deviceId = device.identifier;
const deviceUdid = device.hardwareProperties?.udid || deviceId;
const derivedDataPath = options.derivedData || await mkdtemp(path.join(tmpdir(), 'tabitomo-ios-device-'));

console.log(`Using paired device: ${deviceDisplayName(device)} (${deviceUdid})`);
console.log(`Building ${scheme} ${options.configuration} for iOS...`);
run('xcodebuild', [
  ...(options.verbose ? [] : ['-quiet']),
  '-workspace', workspace,
  '-scheme', scheme,
  '-configuration', options.configuration,
  '-sdk', 'iphoneos',
  '-destination', 'generic/platform=iOS',
  '-derivedDataPath', derivedDataPath,
  'build',
]);

const appPath = await findBuiltApp(derivedDataPath, scheme);
console.log(`Installing ${bundleId} from ${appPath}...`);
run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', deviceId, appPath]);

console.log('Verifying installation...');
const installedApps = run('xcrun', [
  'devicectl', 'device', 'info', 'apps', '--device', deviceId, '--bundle-id', bundleId,
], { capture: true });
if (!installedApps.includes(bundleId)) {
  fail(`Installation succeeded but ${bundleId} was not returned by devicectl device info apps.`);
}

if (options.launch) {
  console.log(`Launching ${bundleId}...`);
  run('xcrun', [
    'devicectl', 'device', 'process', 'launch', '--device', deviceId,
    '--terminate-existing', bundleId,
  ]);
}

console.log(`iOS device install complete: ${deviceDisplayName(device)} (${deviceUdid}).`);
console.log(`Build products: ${derivedDataPath}`);
