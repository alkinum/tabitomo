import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const mobileDir = path.join(rootDir, 'apps/mobile');
const workspace = path.join(mobileDir, 'ios/tabitomo.xcworkspace');
const scheme = process.env.IOS_SMOKE_SCHEME || 'tabitomo';
const configuration = process.env.IOS_SMOKE_CONFIGURATION || 'Release';
const bundleId = process.env.IOS_SMOKE_BUNDLE_ID || 'com.backrunner.tabitomo';
const keepArtifacts = process.env.IOS_SMOKE_KEEP_ARTIFACTS === '1';
const verboseXcode = process.env.IOS_SMOKE_VERBOSE_XCODE === '1';
const requestedSmokeScenes = (process.env.IOS_SMOKE_SCENES || '')
  .split(',')
  .map((scene) => scene.trim())
  .filter(Boolean);
const smokeSceneFileName = 'tabitomo-smoke-scene.json';
const smokeSceneAckFileName = 'tabitomo-smoke-scene-ack.json';
const modelPackSmokeResultFileName = 'tabitomo-model-pack-smoke-result.json';
const configRoundTripSmokeResultFileName = 'tabitomo-config-roundtrip-smoke-result.json';
const hunyuanOutputSmokeResultFileName = 'tabitomo-hunyuan-output-smoke-result.json';
const textProviderSmokeResultFileName = 'tabitomo-text-provider-smoke-result.json';
const imageProviderSmokeResultFileName = 'tabitomo-image-provider-smoke-result.json';
const speechProviderSmokeResultFileName = 'tabitomo-speech-provider-smoke-result.json';
const localModelRuntimeSmokeResultFileName = 'tabitomo-local-model-runtime-smoke-result.json';
const qrImportSmokeResultFileName = 'tabitomo-qr-import-smoke-result.json';

const preferredDeviceTypes = [
  'com.apple.CoreSimulator.SimDeviceType.iPhone-16',
  'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
  'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
  'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
  'com.apple.CoreSimulator.SimDeviceType.iPhone-13',
];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: options.stdio || 'inherit',
    env: process.env,
    encoding: options.encoding || 'utf8',
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.${
        output ? `\n${output}` : ''
      }`,
    );
  }

  return result;
};

const runCapture = (command, args) =>
  run(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).stdout.trim();

const parseJsonCommand = (command, args) => JSON.parse(runCapture(command, args));

const compareVersionsDesc = (left, right) => {
  const leftParts = String(left || '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right || '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (rightParts[index] || 0) - (leftParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
};

const selectRuntimeAndDevice = () => {
  const { runtimes = [] } = parseJsonCommand('xcrun', ['simctl', 'list', 'runtimes', '-j']);
  const iosRuntimes = runtimes
    .filter((runtime) => runtime.isAvailable && runtime.platform === 'iOS')
    .sort((left, right) => compareVersionsDesc(left.version, right.version));

  for (const runtime of iosRuntimes) {
    const supportedDeviceTypes = runtime.supportedDeviceTypes || [];
    const supportedIdentifiers = new Set(supportedDeviceTypes.map((deviceType) => deviceType.identifier));
    const preferredIdentifier = preferredDeviceTypes.find((identifier) => supportedIdentifiers.has(identifier));
    const fallback = supportedDeviceTypes.find((deviceType) => deviceType.productFamily === 'iPhone');
    const deviceType = preferredIdentifier
      ? supportedDeviceTypes.find((candidate) => candidate.identifier === preferredIdentifier)
      : fallback;

    if (deviceType) {
      return {
        runtime,
        deviceType,
      };
    }
  }

  throw new Error('No available iOS Simulator runtime with an iPhone device type was found.');
};

const findApps = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const apps = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      apps.push(fullPath);
      continue;
    }

    if (entry.isDirectory()) {
      apps.push(...(await findApps(fullPath)));
    }
  }

  return apps;
};

const findBuiltApp = async (derivedDataPath) => {
  const productsDir = path.join(derivedDataPath, 'Build', 'Products');
  const apps = await findApps(productsDir);
  const preferredApp = apps.find((appPath) => path.basename(appPath) === `${scheme}.app`);

  if (preferredApp) {
    return preferredApp;
  }

  if (apps.length === 1) {
    return apps[0];
  }

  throw new Error(`Could not uniquely identify built .app in ${productsDir}. Found: ${apps.join(', ')}`);
};

const ensureScreenshot = async (screenshotPath) => {
  const screenshotStat = await stat(screenshotPath);

  if (screenshotStat.size < 1024) {
    throw new Error(`Screenshot ${screenshotPath} is unexpectedly small (${screenshotStat.size} bytes).`);
  }

  return screenshotStat.size;
};

const hashFile = async (filePath) => createHash('sha256').update(await readFile(filePath)).digest('hex');

const ensureDistinctScreenshots = async (screenshots) => {
  const hashes = new Map();

  for (const screenshot of screenshots) {
    const hash = await hashFile(screenshot.path);
    if (hashes.has(hash)) {
      throw new Error(`${screenshot.name} screenshot is identical to ${hashes.get(hash)}; smoke scene did not visibly update.`);
    }
    hashes.set(hash, screenshot.name);
  }
};

const startTinyModelPackServer = async () => {
  const modelBytes = Buffer.from('tabitomo tiny model pack smoke\n', 'utf8');
  const modelSha256 = createHash('sha256').update(modelBytes).digest('hex');
  const providerRequests = [];
  const speechRequests = [];
  const mockTranslation = 'Where is the station?';
  const mockExplanation = 'This asks where the station is.';
  const mockAnswer = 'Use: Where is the station?';
  const mockImageTranslation = 'Cafe\nEntrance';
  const mockOCRText = 'カフェ';
  const mockOCRTranslation = 'Cafe';
  const mockTranscript = '駅はどこですか';
  let manifestBody = '';

  const readBody = (request) => new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
  const streamChunk = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/tiny-model.bin') {
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(modelBytes.byteLength),
      });
      response.end(modelBytes);
      return;
    }

    if (requestUrl.pathname === '/manifest.json') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(manifestBody)),
      });
      response.end(manifestBody);
      return;
    }

    if (requestUrl.pathname === '/v1/audio/transcriptions') {
      const bodyText = await readBody(request);
      speechRequests.push({
        method: request.method,
        headers: request.headers,
        bodyText,
      });
      const responseBody = JSON.stringify({ text: mockTranscript });
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(responseBody)),
      });
      response.end(responseBody);
      return;
    }

    if (requestUrl.pathname === '/api/v1/services/aigc/multimodal-generation/generation') {
      const bodyText = await readBody(request);
      const body = JSON.parse(bodyText || '{}');
      providerRequests.push(body);
      const responseBody = JSON.stringify({
        output: {
          choices: [
            {
              message: {
                content: [
                  {
                    ocr_result: {
                      words_info: [
                        {
                          text: mockOCRText,
                          location: [0, 0, 100, 0, 100, 50, 0, 50],
                          rotate_rect: [50, 25, 100, 50, 0],
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      });
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(responseBody)),
      });
      response.end(responseBody);
      return;
    }

    if (requestUrl.pathname === '/v1/chat/completions') {
      const bodyText = await readBody(request);
      let body = {};
      try {
        body = JSON.parse(bodyText || '{}');
      } catch {
        response.writeHead(400, { 'content-type': 'text/plain' });
        response.end('invalid json');
        return;
      }

      providerRequests.push(body);
      const userContent = JSON.stringify((body.messages || []).filter((message) => message?.role === 'user'));

      if (body.stream) {
        const responseText = body.model === 'tabitomo-native-image-vlm-smoke'
          ? mockImageTranslation
          : userContent.includes('Answer only')
          ? mockAnswer
          : mockExplanation;
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end(`${streamChunk(responseText.slice(0, 12))}${streamChunk(responseText.slice(12))}data: [DONE]\n\n`);
        return;
      }

      if (body.model === 'tabitomo-native-image-ocr-smoke') {
        const responseBody = JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ocr_result: {
                    words_info: [
                      {
                        text: mockOCRText,
                        location: [0, 0, 100, 0, 100, 50, 0, 50],
                        rotate_rect: [50, 25, 100, 50, 0],
                      },
                    ],
                  },
                }),
              },
            },
          ],
        });
        response.writeHead(200, {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(responseBody)),
        });
        response.end(responseBody);
        return;
      }

      if (body.model === 'tabitomo-native-image-translation-smoke') {
        const responseBody = JSON.stringify({
          choices: [
            {
              message: {
                content: mockOCRTranslation,
              },
            },
          ],
        });
        response.writeHead(200, {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(responseBody)),
        });
        response.end(responseBody);
        return;
      }

      const responseBody = JSON.stringify({
        choices: [
          {
            message: {
              content: mockTranslation,
            },
          },
        ],
      });
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(responseBody)),
      });
      response.end(responseBody);
      return;
    }

    response.writeHead(404);
    response.end('not found');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not start tiny model-pack HTTP server.');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  manifestBody = JSON.stringify({
    schemaVersion: 1,
    packs: [
      {
        id: 'smoke-server-fallback-tiny',
        feature: 'asr',
        runtime: 'server-fallback',
        version: '2026.07.smoke',
        minAppVersion: '0.1.0',
        bytes: modelBytes.byteLength,
        license: 'SMOKE-ONLY',
        label: 'Tiny smoke pack',
        description: 'Simulator-only model-pack installer smoke fixture.',
        files: [
          {
            name: 'tiny-model.bin',
            url: `${baseUrl}/tiny-model.bin`,
            sha256: modelSha256,
            bytes: modelBytes.byteLength,
          },
        ],
      },
    ],
  });

  return {
    manifestUrl: `${baseUrl}/manifest.json`,
    providerEndpoint: `${baseUrl}/v1`,
    providerRequests,
    speechRequests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const waitForJsonFile = async (filePath, timeoutMs = 20000, isReady = () => true) => {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'));
      if (isReady(parsed)) {
        return parsed;
      }
      lastError = new Error(`JSON result is not ready yet: ${parsed.status || 'unknown status'}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${filePath}.${lastError ? ` Last error: ${lastError.message}` : ''}`);
};

let tempRoot;
let deviceSetPath;
let deviceId;
let success = false;
let tinyModelPackServer;

try {
  await access(workspace);

  tempRoot = await mkdtemp(path.join(tmpdir(), 'tabitomo-ios-smoke-'));
  const derivedDataPath = path.join(tempRoot, 'DerivedData');
  const artifactsDir = path.join(tempRoot, 'artifacts');
  deviceSetPath = path.join(tempRoot, 'DeviceSet');
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(deviceSetPath, { recursive: true });

  const { runtime, deviceType } = selectRuntimeAndDevice();
  console.log(`Using ${deviceType.name} on ${runtime.name}.`);

  console.log(`Building ${scheme} ${configuration} for iOS Simulator...`);
  run('xcodebuild', [
    ...(verboseXcode ? [] : ['-quiet']),
    '-workspace',
    workspace,
    '-scheme',
    scheme,
    '-configuration',
    configuration,
    '-sdk',
    'iphonesimulator',
    '-destination',
    'generic/platform=iOS Simulator',
    '-derivedDataPath',
    derivedDataPath,
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ]);

  const appPath = await findBuiltApp(derivedDataPath);
  console.log(`Built app: ${appPath}`);

  deviceId = runCapture('xcrun', [
    'simctl',
    '--set',
    deviceSetPath,
    'create',
    `tabitomo smoke ${Date.now()}`,
    deviceType.identifier,
    runtime.identifier,
  ]);

  console.log(`Booting simulator ${deviceId}...`);
  run('xcrun', ['simctl', '--set', deviceSetPath, 'boot', deviceId]);
  run('xcrun', ['simctl', '--set', deviceSetPath, 'bootstatus', deviceId, '-b']);
  run('xcrun', ['simctl', '--set', deviceSetPath, 'ui', deviceId, 'appearance', 'light']);

  console.log(`Installing ${bundleId}...`);
  run('xcrun', ['simctl', '--set', deviceSetPath, 'install', deviceId, appPath]);
  console.log(`Granting camera permission to ${bundleId}...`);
  run('xcrun', ['simctl', '--set', deviceSetPath, 'privacy', deviceId, 'grant', 'camera', bundleId]);
  const dataContainer = runCapture('xcrun', [
    'simctl',
    '--set',
    deviceSetPath,
    'get_app_container',
    deviceId,
    bundleId,
    'data',
  ]);
  const smokeSceneFile = path.join(dataContainer, 'Documents', smokeSceneFileName);
  const smokeSceneAckFile = path.join(dataContainer, 'Documents', smokeSceneAckFileName);
  const modelPackSmokeResultFile = path.join(dataContainer, 'Documents', modelPackSmokeResultFileName);
  const configRoundTripSmokeResultFile = path.join(dataContainer, 'Documents', configRoundTripSmokeResultFileName);
  const hunyuanOutputSmokeResultFile = path.join(dataContainer, 'Documents', hunyuanOutputSmokeResultFileName);
  const textProviderSmokeResultFile = path.join(dataContainer, 'Documents', textProviderSmokeResultFileName);
  const imageProviderSmokeResultFile = path.join(dataContainer, 'Documents', imageProviderSmokeResultFileName);
  const speechProviderSmokeResultFile = path.join(dataContainer, 'Documents', speechProviderSmokeResultFileName);
  const localModelRuntimeSmokeResultFile = path.join(dataContainer, 'Documents', localModelRuntimeSmokeResultFileName);
  const qrImportSmokeResultFile = path.join(dataContainer, 'Documents', qrImportSmokeResultFileName);
  await mkdir(path.dirname(smokeSceneFile), { recursive: true });
  await rm(smokeSceneFile, { force: true });
  await rm(smokeSceneAckFile, { force: true });
  await rm(modelPackSmokeResultFile, { force: true });
  await rm(configRoundTripSmokeResultFile, { force: true });
  await rm(hunyuanOutputSmokeResultFile, { force: true });
  await rm(textProviderSmokeResultFile, { force: true });
  await rm(imageProviderSmokeResultFile, { force: true });
  await rm(speechProviderSmokeResultFile, { force: true });
  await rm(localModelRuntimeSmokeResultFile, { force: true });
  await rm(qrImportSmokeResultFile, { force: true });
  tinyModelPackServer = await startTinyModelPackServer();

  console.log(`Launching ${bundleId}...`);
  const launchApp = async (waitMs = 6000) => {
    run('xcrun', ['simctl', '--set', deviceSetPath, 'launch', '--terminate-running-process', deviceId, bundleId]);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  };
  await launchApp();

  const capturedScreenshots = [];
  const captureScreenshot = async (name) => {
    const screenshotPath = path.join(artifactsDir, `${name}.png`);
    run('xcrun', ['simctl', '--set', deviceSetPath, 'io', deviceId, 'screenshot', screenshotPath]);
    const size = await ensureScreenshot(screenshotPath);
    const hash = await hashFile(screenshotPath);
    capturedScreenshots.push({ name, path: screenshotPath, size, hash });
    return size;
  };

  const lightSize = await captureScreenshot('first-screen-light');

  run('xcrun', ['simctl', '--set', deviceSetPath, 'ui', deviceId, 'appearance', 'dark']);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const darkSize = await captureScreenshot('first-screen-dark');

  run('xcrun', ['simctl', '--set', deviceSetPath, 'ui', deviceId, 'appearance', 'light']);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const allSmokeScenes = [
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
  ];
  const invalidRequestedScenes = requestedSmokeScenes.filter((scene) => !allSmokeScenes.includes(scene));
  if (invalidRequestedScenes.length > 0) {
    throw new Error(`Unknown iOS smoke scene(s): ${invalidRequestedScenes.join(', ')}`);
  }
  const smokeScenes = requestedSmokeScenes.length > 0 ? requestedSmokeScenes : allSmokeScenes;

  for (const scene of smokeScenes) {
    console.log(`Opening smoke scene: ${scene}...`);
    const payload = scene === 'settings-model-pack-install'
      ? { scene, modelPackManifestUrl: tinyModelPackServer.manifestUrl }
      : scene === 'text-provider-smoke'
        ? { scene, textProviderEndpoint: tinyModelPackServer.providerEndpoint }
      : scene === 'image-provider-smoke'
        ? { scene, imageProviderEndpoint: tinyModelPackServer.providerEndpoint }
      : scene === 'speech-provider-smoke'
        ? { scene, speechProviderEndpoint: tinyModelPackServer.providerEndpoint }
      : { scene };
    if (scene === 'settings-model-pack-install') {
      await rm(modelPackSmokeResultFile, { force: true });
    }
    if (scene === 'settings-config-roundtrip') {
      await rm(configRoundTripSmokeResultFile, { force: true });
    }
    if (scene === 'settings-hunyuan-output') {
      await rm(hunyuanOutputSmokeResultFile, { force: true });
    }
    if (scene === 'settings-qr-import') {
      await rm(qrImportSmokeResultFile, { force: true });
    }
    if (scene === 'text-provider-smoke') {
      await rm(textProviderSmokeResultFile, { force: true });
    }
    if (scene === 'image-provider-smoke') {
      await rm(imageProviderSmokeResultFile, { force: true });
    }
    if (scene === 'speech-provider-smoke') {
      await rm(speechProviderSmokeResultFile, { force: true });
    }
    if (scene === 'local-model-runtime-smoke') {
      await rm(localModelRuntimeSmokeResultFile, { force: true });
    }
    await rm(smokeSceneAckFile, { force: true });
    await writeFile(smokeSceneFile, JSON.stringify(payload), 'utf8');
    await launchApp(scene === 'settings-model-pack-install'
      ? 12000
      : scene === 'text-provider-smoke' || scene === 'image-provider-smoke' || scene === 'speech-provider-smoke'
        ? 11000
      : scene === 'settings-config-roundtrip'
        ? 9000
        : scene === 'settings-hunyuan-output'
          ? 7000
        : scene === 'settings-qr-import'
          ? 9000
        : scene.startsWith('settings') || scene.startsWith('setup') ? 6500 : 5500);
    await waitForJsonFile(
      smokeSceneAckFile,
      20000,
      (candidate) => candidate?.scene === scene,
    );
    await captureScreenshot(`smoke-${scene}`);
    if (scene === 'settings-qr-import') {
      const result = await waitForJsonFile(
        qrImportSmokeResultFile,
        30000,
        (candidate) => candidate && candidate.status !== 'running',
      );
      if (result.passed !== true) {
        throw new Error(`QR import smoke failed: ${JSON.stringify(result)}`);
      }
      const serialized = JSON.stringify(result);
      for (const secret of [
        'ios-smoke-qr-import-general-key',
        'ios-smoke-qr-import-translation-key',
        'ios-smoke-qr-import-speech-key',
        'ios-smoke-qr-import-ocr-key',
        'ios-smoke-qr-import-vlm-key',
      ]) {
        if (serialized.includes(secret)) {
          throw new Error(`QR import smoke result leaked a secret marker: ${secret}`);
        }
      }
      if ('payload' in result || 'configPayload' in result || serialized.includes('tabitomo-config:')) {
        throw new Error('QR import smoke result must not include the encrypted payload.');
      }
      console.log(`QR import smoke passed: payloadLength=${result.payloadLength}.`);
    }
    if (scene === 'settings-config-roundtrip') {
      const result = await waitForJsonFile(
        configRoundTripSmokeResultFile,
        30000,
        (candidate) => candidate && candidate.status !== 'running',
      );
      if (result.passed !== true) {
        throw new Error(`Config round-trip smoke failed: ${JSON.stringify(result)}`);
      }
      const serialized = JSON.stringify(result);
      for (const secret of [
        'ios-smoke-general-key',
        'ios-smoke-translation-key',
        'ios-smoke-speech-key',
        'ios-smoke-ocr-key',
        'ios-smoke-vlm-key',
      ]) {
        if (serialized.includes(secret)) {
          throw new Error(`Config round-trip smoke result leaked a secret marker: ${secret}`);
        }
      }
      if ('payload' in result || 'configPayload' in result) {
        throw new Error('Config round-trip smoke result must not include the encrypted payload.');
      }
      console.log(`Config round-trip smoke passed: payloadLength=${result.payloadLength}.`);
    }
    if (scene === 'settings-hunyuan-output') {
      const result = await waitForJsonFile(
        hunyuanOutputSmokeResultFile,
        20000,
        (candidate) => candidate && candidate.status !== 'running',
      );
      if (
        result.passed !== true
        || result.outputMode !== 'plain'
        || result.structuredDisabled !== true
        || !String(result.modelName || '').toLowerCase().includes('hunyuan-mt')
      ) {
        throw new Error(`Hunyuan output smoke failed: ${JSON.stringify(result)}`);
      }
      const serialized = JSON.stringify(result);
      if (serialized.includes('ios-smoke-hunyuan-key')) {
        throw new Error('Hunyuan output smoke result leaked a provider secret marker.');
      }
      console.log(`Hunyuan output smoke passed: model=${result.modelName}, outputMode=${result.outputMode}.`);
    }
    if (scene === 'text-provider-smoke') {
      const result = await waitForJsonFile(
        textProviderSmokeResultFile,
        30000,
        (candidate) => candidate && candidate.status !== 'running',
      );
      if (result.passed !== true) {
        throw new Error(`Text-provider smoke failed: ${JSON.stringify(result)}`);
      }
      const serialized = JSON.stringify(result);
      if (serialized.includes('ios-smoke-provider-key')) {
        throw new Error('Text-provider smoke result leaked a provider secret marker.');
      }
      const providerRequests = tinyModelPackServer.providerRequests.filter(
        (request) => request?.model === 'tabitomo-native-provider-smoke',
      );
      const streamingRequests = providerRequests.filter((request) => request?.stream === true);
      const nonStreamingRequests = providerRequests.filter((request) => request?.stream !== true);
      if (providerRequests.length !== 3 || streamingRequests.length !== 2 || nonStreamingRequests.length !== 1) {
        throw new Error(`Expected one translation and two streaming text provider requests, got ${JSON.stringify(providerRequests)}.`);
      }
      console.log(`Text-provider smoke passed: requests=${providerRequests.length}.`);
    }
    if (scene === 'image-provider-smoke') {
      const result = await waitForJsonFile(
        imageProviderSmokeResultFile,
        30000,
        (candidate) => candidate && candidate.status !== 'running',
      );
      if (result.passed !== true) {
        throw new Error(`Image-provider smoke failed: ${JSON.stringify(result)}`);
      }
      const serialized = JSON.stringify(result);
      if (serialized.includes('ios-smoke-image-provider-key')) {
        throw new Error('Image-provider smoke result leaked a provider secret marker.');
      }
      if (serialized.includes('data:image')) {
        throw new Error('Image-provider smoke result must not include the image payload.');
      }
      const imageRequests = tinyModelPackServer.providerRequests.filter(
        (request) => [
          'tabitomo-native-image-vlm-smoke',
          'qwen3.5-ocr',
          'tabitomo-native-image-translation-smoke',
        ].includes(request?.model),
      );
      const vlmRequests = imageRequests.filter((request) => request?.model === 'tabitomo-native-image-vlm-smoke');
      const ocrRequests = imageRequests.filter((request) => request?.model === 'qwen3.5-ocr');
      const translationRequests = imageRequests.filter((request) => request?.model === 'tabitomo-native-image-translation-smoke');
      if (
        imageRequests.length !== 3
        || vlmRequests.length !== 1
        || ocrRequests.length !== 1
        || translationRequests.length !== 1
        || vlmRequests[0]?.stream !== true
        || ocrRequests[0]?.stream === true
        || translationRequests[0]?.stream === true
      ) {
        throw new Error(`Expected one streaming VLM, one OCR, and one OCR-line translation request, got ${JSON.stringify(imageRequests)}.`);
      }
      if (!JSON.stringify(vlmRequests[0]).includes('image_url') || !JSON.stringify(ocrRequests[0]).includes('data:image')) {
        throw new Error(`Expected VLM and OCR requests to include image payloads, got ${JSON.stringify(imageRequests)}.`);
      }
      console.log(`Image-provider smoke passed: requests=${imageRequests.length}.`);
    }
    if (scene === 'speech-provider-smoke') {
      const result = await waitForJsonFile(
        speechProviderSmokeResultFile,
        30000,
        (candidate) => candidate && candidate.status !== 'running',
      );
      if (result.passed !== true) {
        throw new Error(`Speech-provider smoke failed: ${JSON.stringify(result)}`);
      }
      const serialized = JSON.stringify(result);
      if (serialized.includes('ios-smoke-speech-provider-key')) {
        throw new Error('Speech-provider smoke result leaked a provider secret marker.');
      }
      if (serialized.includes('tabitomo-speech-provider-smoke.wav') || serialized.includes('file://')) {
        throw new Error('Speech-provider smoke result must not include local audio file details.');
      }
      const speechRequests = tinyModelPackServer.speechRequests.filter(
        (request) => request?.headers?.authorization === 'Bearer ios-smoke-speech-provider-key',
      );
      if (speechRequests.length !== 1) {
        throw new Error(`Expected one speech transcription request, got ${JSON.stringify(tinyModelPackServer.speechRequests)}.`);
      }
      const speechRequest = speechRequests[0];
      const contentType = String(speechRequest.headers['content-type'] || '');
      if (
        speechRequest.method !== 'POST'
        || !contentType.includes('multipart/form-data')
        || !speechRequest.bodyText.includes('name="model"')
        || !speechRequest.bodyText.includes('tabitomo-native-speech-smoke')
        || !speechRequest.bodyText.includes('name="file"')
      ) {
        throw new Error(`Speech transcription request did not look like the expected multipart upload: ${JSON.stringify({
          method: speechRequest.method,
          contentType,
          bodyStart: speechRequest.bodyText.slice(0, 300),
        })}`);
      }
      console.log(`Speech-provider smoke passed: requests=${speechRequests.length}.`);
    }
    if (scene === 'local-model-runtime-smoke') {
      const result = await waitForJsonFile(
        localModelRuntimeSmokeResultFile,
        15 * 60 * 1000,
        (candidate) => candidate && candidate.status !== 'running',
      );
      if (result.passed !== true) {
        throw new Error(`Local-model runtime smoke failed: ${JSON.stringify(result)}`);
      }
      const expectedModels = {
        whisper: ['whisper-base', 'sherpa-onnx-ios'],
        senseVoice: ['sensevoice-small', 'sherpa-onnx-ios'],
        ppocr: ['ppocr-v5-mobile', 'onnxruntime-mobile'],
      };
      for (const [key, [modelId, runtime]] of Object.entries(expectedModels)) {
        if (result.models?.[key]?.modelId !== modelId || result.models?.[key]?.runtime !== runtime) {
          throw new Error(`Local-model runtime smoke returned an unexpected ${key} result: ${JSON.stringify(result.models?.[key])}`);
        }
      }
      if (!(result.models?.ppocr?.lines > 0)) {
        throw new Error(`Local-model runtime smoke PP-OCR detected no lines: ${JSON.stringify(result.models?.ppocr)}`);
      }
      const serialized = JSON.stringify(result);
      if (serialized.includes('file://') || serialized.includes('data:image')) {
        throw new Error('Local-model runtime smoke result leaked local media details.');
      }
      console.log(`Local-model runtime smoke passed: ${JSON.stringify(result.models)}.`);
    }
    if (scene === 'settings-model-pack-install') {
      const result = await waitForJsonFile(modelPackSmokeResultFile);
      if (result.passed !== true) {
        throw new Error(`Model-pack install smoke failed: ${JSON.stringify(result)}`);
      }
      if (result.activation?.status !== 'installed-pack' || result.activation?.packKey !== result.packKey) {
        throw new Error(`Model-pack install smoke did not activate the installed pack: ${JSON.stringify(result.activation)}`);
      }
      console.log(`Model-pack install smoke passed: ${result.packKey}, bytes=${result.bytes}.`);
    }
  }

  await ensureDistinctScreenshots(capturedScreenshots);

  success = true;
  console.log(
    `iOS simulator smoke passed. Screenshot sizes: light=${lightSize} bytes, dark=${darkSize} bytes, scenes=${smokeScenes.length}.`,
  );
  if (keepArtifacts) {
    console.log(`Artifacts retained at ${artifactsDir}`);
  }
} finally {
  if (tinyModelPackServer) {
    await tinyModelPackServer.close();
  }

  if (deviceId && deviceSetPath) {
    spawnSync('xcrun', ['simctl', '--set', deviceSetPath, 'shutdown', deviceId], {
      cwd: rootDir,
      stdio: 'ignore',
      env: process.env,
    });
    spawnSync('xcrun', ['simctl', '--set', deviceSetPath, 'delete', deviceId], {
      cwd: rootDir,
      stdio: 'ignore',
      env: process.env,
    });
  }

  if (tempRoot && (success ? !keepArtifacts : false)) {
    await rm(tempRoot, { recursive: true, force: true });
  } else if (tempRoot && !success) {
    console.error(`iOS smoke artifacts retained at ${tempRoot}`);
  }
}
