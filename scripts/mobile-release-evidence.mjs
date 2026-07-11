import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const mobileDir = path.join(rootDir, 'apps/mobile');
const sampleDeviceReportPath = path.join(rootDir, 'scripts/fixtures/ios-device-qa-report.sample.json');

const args = process.argv.slice(2);
const options = {
  deviceReportPath: '',
  outPath: '',
  strict: /^(1|true|yes|on)$/i.test(process.env.TABITOMO_RELEASE_EVIDENCE_STRICT || ''),
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--') {
    continue;
  } else if (arg === '--device-report') {
    options.deviceReportPath = args[index + 1] || '';
    index += 1;
  } else if (arg === '--out') {
    options.outPath = args[index + 1] || '';
    index += 1;
  } else if (arg === '--strict') {
    options.strict = true;
  } else if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  } else {
    throw new Error(`Unknown argument "${arg}". Use --help for usage.`);
  }
}

const env = (name) => process.env[name]?.trim() || '';
const truthyEnv = (name) => /^(1|true|yes|on)$/i.test(env(name));

const readText = (relativePath) => readFile(path.join(rootDir, relativePath), 'utf8');
const readJson = async (relativePath) => JSON.parse(await readText(relativePath));

const fileExists = async (absolutePath) => {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
};

const sameFilePath = async (left, right) => {
  const [leftPath, rightPath] = await Promise.all([
    realpath(left).catch(() => path.resolve(left)),
    realpath(right).catch(() => path.resolve(right)),
  ]);
  return path.normalize(leftPath) === path.normalize(rightPath);
};

const run = (command, commandArgs = [], runOptions = {}) => new Promise((resolve) => {
  execFile(command, commandArgs, {
    cwd: runOptions.cwd || rootDir,
    timeout: runOptions.timeoutMs || 5000,
    env: process.env,
  }, (error, stdout, stderr) => {
    resolve({
      ok: !error,
      code: typeof error?.code === 'number' ? error.code : error ? 1 : 0,
      stdout: String(stdout || '').trim(),
      stderr: String(stderr || '').trim(),
      error: error ? error.message : '',
    });
  });
});

const tripletStatus = (label, prefixes) => {
  const candidates = prefixes.map((prefix) => {
    const variableNames = [`${prefix}_API_KEY`, `${prefix}_ENDPOINT`, `${prefix}_MODEL`];
    const presentVars = variableNames.filter((name) => Boolean(env(name)));
    return {
      prefix,
      presentVars,
      missingVars: variableNames.filter((name) => !env(name)),
      ready: presentVars.length === variableNames.length,
      partial: presentVars.length > 0 && presentVars.length < variableNames.length,
    };
  });
  const selected = candidates.find((candidate) => candidate.ready) || null;
  return {
    label,
    ready: Boolean(selected),
    selectedPrefix: selected?.prefix || null,
    candidates,
  };
};

const providerStatuses = async () => {
  const general = tripletStatus('General AI', ['TABITOMO_GENERAL', 'TABITOMO_PROVIDER']);
  const translation = tripletStatus('Translation override', ['TABITOMO_TRANSLATION']);
  const vlm = tripletStatus('VLM', ['TABITOMO_VLM']);
  const ocr = tripletStatus('OCR', ['TABITOMO_OCR']);
  const speech = tripletStatus('Speech', ['TABITOMO_SPEECH']);
  const speechAudioFile = env('TABITOMO_SPEECH_AUDIO_FILE');
  const speechAudioFileExists = speechAudioFile ? await fileExists(path.resolve(rootDir, speechAudioFile)) : false;

  const useGeneralForVLM = truthyEnv('TABITOMO_PROVIDER_SMOKE_VLM_USE_GENERAL') || !vlm.ready;
  const useGeneralForOCR = truthyEnv('TABITOMO_PROVIDER_SMOKE_OCR_USE_GENERAL');
  const steps = {
    translation: general.ready || translation.ready,
    explanation: general.ready,
    qa: general.ready,
    furigana: general.ready,
    vlm: vlm.ready || (useGeneralForVLM && general.ready),
    ocr: ocr.ready || (useGeneralForOCR && general.ready),
    asr: speech.ready && speechAudioFileExists,
  };
  const partialConfigs = [general, translation, vlm, ocr, speech].flatMap((status) => (
    status.candidates
      .filter((candidate) => candidate.partial)
      .map((candidate) => ({
        label: status.label,
        prefix: candidate.prefix,
        presentVars: candidate.presentVars,
        missingVars: candidate.missingVars,
      }))
  ));

  return {
    requiredMode: env('TABITOMO_PROVIDER_SMOKE_REQUIRED') || 'dry-run',
    statuses: {
      general,
      translation,
      vlm,
      ocr,
      speech,
      speechAudioFile: {
        present: Boolean(speechAudioFile),
        exists: speechAudioFileExists,
        basename: speechAudioFile ? path.basename(speechAudioFile) : null,
      },
      useGeneralForVLM,
      useGeneralForOCR,
    },
    steps,
    partialConfigs,
    readyForRequiredAll: Object.values(steps).every(Boolean),
  };
};

const validateDeviceReport = async (reportPath) => {
  if (!reportPath) {
    return {
      provided: false,
      valid: false,
      path: null,
      sampleFixture: false,
      command: 'pnpm test:mobile:device-qa-report /path/to/tabitomo-ios-device-qa-report.json',
      stdout: '',
      stderr: '',
    };
  }

  const absolutePath = path.resolve(rootDir, reportPath);
  const sampleFixture = await sameFilePath(absolutePath, sampleDeviceReportPath);
  const result = await run(process.execPath, [
    path.join(rootDir, 'scripts/ios-device-qa-report-check.mjs'),
    absolutePath,
  ], { timeoutMs: 30_000 });

  return {
    provided: true,
    valid: result.ok,
    path: absolutePath,
    sampleFixture,
    command: `pnpm test:mobile:device-qa-report ${absolutePath}`,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const appConfig = await readJson('apps/mobile/app.json');
const rootPackage = await readJson('package.json');
const podfileProperties = await readJson('apps/mobile/ios/Podfile.properties.json');
const expo = appConfig.expo || {};
const ios = expo.ios || {};

const [
  gitBranch,
  gitCommit,
  gitStatus,
  xcodebuildVersion,
  xcrunVersion,
  easVersion,
  providerSmoke,
  deviceReport,
] = await Promise.all([
  run('git', ['branch', '--show-current']),
  run('git', ['rev-parse', '--short', 'HEAD']),
  run('git', ['status', '--porcelain']),
  run('xcodebuild', ['-version']),
  run('xcrun', ['--version']),
  run('eas', ['--version']),
  providerStatuses(),
  validateDeviceReport(options.deviceReportPath),
]);

const workspacePath = path.join(mobileDir, 'ios/tabitomo.xcworkspace');
const easJsonPath = path.join(rootDir, 'eas.json');
const workspaceExists = await fileExists(workspacePath);
const easJsonExists = await fileExists(easJsonPath);
const easConfig = easJsonExists ? JSON.parse(await readFile(easJsonPath, 'utf8')) : null;
const explicitReleasePath = env('TABITOMO_IOS_RELEASE_PATH');
const rootScripts = rootPackage.scripts || {};
const localXcodePreflightScript = path.join(rootDir, 'scripts/ios-local-xcode-preflight.mjs');
const localXcodePreflight = workspaceExists
  ? await run(process.execPath, [localXcodePreflightScript], { timeoutMs: 90_000 })
  : null;
const requiredEasProfiles = ['development', 'development-simulator', 'preview', 'preview-simulator', 'production'];
const easProfiles = requiredEasProfiles.map((name) => {
  const profile = easConfig?.build?.[name] || null;
  return {
    name,
    exists: Boolean(profile),
    extends: profile?.extends || null,
    distribution: profile?.distribution || null,
    developmentClient: profile?.developmentClient === true,
    iosSimulator: profile?.ios?.simulator === true,
    autoIncrement: profile?.autoIncrement === true,
  };
});
const easProfilesReady = easProfiles.every((profile) => profile.exists);
const localXcodeAvailable = xcodebuildVersion.ok && xcrunVersion.ok && workspaceExists && localXcodePreflight?.ok === true;
const easAvailable = easVersion.ok && easJsonExists && easProfilesReady;

let selectedReleasePath = explicitReleasePath || 'undecided';
let releasePathSelectionSource = explicitReleasePath ? 'env' : 'undecided';
if (!explicitReleasePath && localXcodeAvailable && !easAvailable) {
  selectedReleasePath = 'local-xcode';
  releasePathSelectionSource = 'default-local-xcode';
}

const automatedGates = [
  {
    id: 'core-tests',
    command: 'pnpm test:core',
    configured: typeof rootScripts['test:core'] === 'string',
  },
  {
    id: 'mobile-typecheck',
    command: 'pnpm --dir apps/mobile typecheck',
    configured: true,
  },
  {
    id: 'release-readiness',
    command: 'pnpm test:mobile:release-readiness',
    configured: typeof rootScripts['test:mobile:release-readiness'] === 'string',
  },
  {
    id: 'ios-xcode-preflight',
    command: 'pnpm test:mobile:ios-xcode-preflight',
    configured: typeof rootScripts['test:mobile:ios-xcode-preflight'] === 'string',
  },
  {
    id: 'mobile-parity-audit',
    command: 'pnpm test:mobile:parity-audit',
    configured: typeof rootScripts['test:mobile:parity-audit'] === 'string',
  },
  {
    id: 'provider-smoke',
    command: 'pnpm test:provider-smoke',
    configured: typeof rootScripts['test:provider-smoke'] === 'string',
  },
  {
    id: 'expo-web-smoke',
    command: 'pnpm test:mobile:web-smoke',
    configured: typeof rootScripts['test:mobile:web-smoke'] === 'string',
  },
  {
    id: 'ios-simulator-smoke',
    command: 'pnpm test:mobile:ios-smoke',
    configured: typeof rootScripts['test:mobile:ios-smoke'] === 'string',
  },
  {
    id: 'device-qa-report',
    command: 'pnpm test:mobile:device-qa-report /path/to/report.json',
    configured: typeof rootScripts['test:mobile:device-qa-report'] === 'string',
  },
];

const releasePath = {
  selected: selectedReleasePath,
  selectionSource: releasePathSelectionSource,
  localXcode: {
    available: localXcodeAvailable,
    xcodebuildAvailable: xcodebuildVersion.ok,
    xcodebuildVersion: xcodebuildVersion.stdout.split('\n').filter(Boolean),
    xcrunAvailable: xcrunVersion.ok,
    xcrunVersion: xcrunVersion.stdout,
    workspaceExists,
    workspacePath,
    preflightCommand: 'pnpm test:mobile:ios-xcode-preflight',
    preflightPassed: localXcodePreflight?.ok === true,
    preflightSummary: localXcodePreflight?.ok
      ? localXcodePreflight.stdout.split('\n').filter(Boolean).at(-1) || ''
      : localXcodePreflight?.stderr || localXcodePreflight?.error || '',
    archiveCommand: 'xcodebuild -workspace apps/mobile/ios/tabitomo.xcworkspace -scheme tabitomo -configuration Release -destination generic/platform=iOS archive',
  },
  eas: {
    available: easAvailable,
    cliAvailable: easVersion.ok,
    cliVersion: easVersion.stdout,
    easJsonExists,
    easJsonPath,
    profiles: easProfiles,
    submitProfileExists: Boolean(easConfig?.submit?.production?.ios),
    buildCommands: {
      developmentSimulator: 'eas build --platform ios --profile development-simulator',
      preview: 'eas build --platform ios --profile preview',
      previewSimulator: 'eas build --platform ios --profile preview-simulator',
      production: 'eas build --platform ios --profile production',
    },
    submitCommand: 'eas submit --platform ios --profile production',
  },
};

const strictFailures = [];
if (options.strict) {
  if (!['local-xcode', 'eas'].includes(selectedReleasePath)) {
    strictFailures.push('Set TABITOMO_IOS_RELEASE_PATH to local-xcode or eas.');
  }
  if (selectedReleasePath === 'local-xcode' && !releasePath.localXcode.available) {
    strictFailures.push('Selected local-xcode release path is not available.');
  }
  if (selectedReleasePath === 'eas' && !releasePath.eas.available) {
    strictFailures.push('Selected eas release path is not available.');
  }
  if (!providerSmoke.readyForRequiredAll) {
    strictFailures.push('Provider smoke env is not ready for translation/explanation/qa/furigana/vlm/ocr/asr.');
  }
  if (providerSmoke.partialConfigs.length > 0) {
    strictFailures.push('Provider smoke env contains partial API_KEY/ENDPOINT/MODEL triplets.');
  }
  if (!deviceReport.provided) {
    strictFailures.push('Provide --device-report with a signed iPhone Device QA export.');
  } else if (deviceReport.sampleFixture) {
    strictFailures.push('Device QA report is the checked-in sample fixture; export a signed iPhone report.');
  } else if (!deviceReport.valid) {
    strictFailures.push('Device QA report validation failed.');
  }
}

if (deviceReport.provided && !deviceReport.valid) {
  strictFailures.push('Provided Device QA report failed validation.');
}

const nextActions = [];
if (selectedReleasePath === 'undecided') {
  nextActions.push('Decide canonical release path: TABITOMO_IOS_RELEASE_PATH=local-xcode or eas.');
} else if (releasePathSelectionSource === 'default-local-xcode') {
  nextActions.push('Release path defaulted to local-xcode because local Xcode is available and EAS CLI is unavailable; set TABITOMO_IOS_RELEASE_PATH=local-xcode in the RC environment to make it explicit.');
}
if (!releasePath.localXcode.available && selectedReleasePath !== 'eas') {
  nextActions.push('Make local Xcode archive path available or select EAS.');
}
if (!releasePath.eas.available && selectedReleasePath !== 'local-xcode') {
  if (!easJsonExists || !easProfilesReady) {
    nextActions.push('Complete eas.json profiles if EAS will be the canonical path.');
  } else if (!easVersion.ok) {
    nextActions.push('Install/login EAS CLI if EAS will be the canonical path.');
  } else {
    nextActions.push('Finish EAS account credentials if EAS will be the canonical path.');
  }
}
if (!providerSmoke.readyForRequiredAll) {
  nextActions.push('Set real provider smoke env vars, including speech audio fixture, then run TABITOMO_PROVIDER_SMOKE_REQUIRED=all pnpm test:provider-smoke.');
}
if (providerSmoke.partialConfigs.length > 0) {
  nextActions.push('Complete or remove partial provider env triplets; provider-smoke requires API_KEY, ENDPOINT, and MODEL together.');
}
if (!deviceReport.provided) {
  nextActions.push('Run signed iPhone Device QA at tabitomo://smoke?scene=device-qa and pass the exported JSON with --device-report.');
} else if (deviceReport.sampleFixture) {
  nextActions.push('Replace scripts/fixtures/ios-device-qa-report.sample.json with a redacted JSON exported from a signed iPhone Device QA run.');
}
if (gitStatus.stdout) {
  nextActions.push('Review and commit or intentionally carry the dirty worktree before release evidence is frozen.');
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  strict: options.strict,
  rootDir,
  app: {
    name: expo.name,
    slug: expo.slug,
    version: expo.version,
    scheme: expo.scheme,
    bundleIdentifier: ios.bundleIdentifier,
    buildNumber: ios.buildNumber,
    minIOS: podfileProperties['ios.deploymentTarget'] || null,
  },
  git: {
    branch: gitBranch.stdout || null,
    commit: gitCommit.stdout || null,
    dirty: Boolean(gitStatus.stdout),
    dirtyEntryCount: gitStatus.stdout ? gitStatus.stdout.split('\n').filter(Boolean).length : 0,
  },
  releasePath,
  automatedGates,
  providerSmoke,
  deviceReport,
  nextActions,
  status: strictFailures.length === 0 ? 'pass' : 'needs-attention',
  failures: strictFailures,
};

if (options.outPath) {
  const outputPath = path.resolve(rootDir, options.outPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote mobile release evidence manifest to ${outputPath}`);
} else {
  console.log(JSON.stringify(manifest, null, 2));
}

if (strictFailures.length > 0) {
  process.exitCode = 1;
}

function printHelp() {
  console.log(`Usage: node scripts/mobile-release-evidence.mjs [options]

Options:
  --device-report <path>  Validate and include a signed iPhone Device QA JSON report.
  --out <path>            Write the evidence manifest to a JSON file.
  --strict                Fail unless release path, provider env, and device QA report are complete.
  -h, --help              Show this help.

Useful env:
  TABITOMO_IOS_RELEASE_PATH=local-xcode|eas
  TABITOMO_PROVIDER_SMOKE_REQUIRED=all
  TABITOMO_RELEASE_EVIDENCE_STRICT=1
`);
}
