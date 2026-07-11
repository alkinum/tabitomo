import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const defaultReportPath = path.join(rootDir, 'scripts/fixtures/ios-device-qa-report.sample.json');
const reportPath = path.resolve(process.argv[2] || defaultReportPath);
const requiredMode = process.env.TABITOMO_DEVICE_QA_REQUIRED || 'all';
const isCheckedInSampleFixture = path.normalize(reportPath) === path.normalize(defaultReportPath);

const requiredCheckIds = [
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
];

const requiredCoreCheckIds = [
  'secure-settings',
  'icloud-settings',
  'provider-text',
  'provider-image',
  'provider-speech',
  'local-asr-runtime',
  'local-ocr-runtime',
  'model-pack-storage',
];

const forbiddenPatterns = [
  { name: 'OpenAI-style API key', pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/i },
  { name: 'Authorization header', pattern: /\bAuthorization\b/i },
  { name: 'Bearer token', pattern: /\bBearer\s+[A-Za-z0-9._-]+/i },
  { name: 'raw API key field', pattern: /"?api[_-]?key"?\s*[:=]/i },
  { name: 'encrypted config payload', pattern: /tabitomo-config:/i },
  { name: 'image data URL', pattern: /data:image\//i },
  { name: 'file URI', pattern: /\bfile:\/\//i },
  { name: 'content URI', pattern: /\bcontent:\/\//i },
  { name: 'photo library URI', pattern: /\b(ph|assets-library):\/\//i },
  { name: 'HTTP endpoint URL', pattern: /https?:\/\//i },
  { name: 'known device QA synthetic secret', pattern: /device-qa-[a-z-]*key/i },
  { name: 'known simulator smoke secret', pattern: /ios-smoke-[a-z-]*key/i },
];

const errors = [];
const notes = [];

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isIsoDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

const addError = (message) => {
  errors.push(message);
};

const assert = (condition, message) => {
  if (!condition) {
    addError(message);
  }
};

const requiredIdsForMode = () => {
  if (requiredMode === 'none') {
    return [];
  }
  if (requiredMode === 'core') {
    return requiredCoreCheckIds;
  }
  if (requiredMode === 'all') {
    return requiredCheckIds;
  }
  addError(`Unsupported TABITOMO_DEVICE_QA_REQUIRED value "${requiredMode}". Use all, core, or none.`);
  return requiredCheckIds;
};

const reportText = await readFile(reportPath, 'utf8');
let report;
try {
  report = JSON.parse(reportText);
} catch (error) {
  throw new Error(`Device QA report is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`);
}

assert(isRecord(report), 'Report root must be an object.');
assert(report.schemaVersion === 1, 'Report schemaVersion must be 1.');
assert(isIsoDate(report.generatedAt), 'Report generatedAt must be an ISO timestamp.');
assert(isRecord(report.app), 'Report app metadata must be an object.');
assert(report.app?.name === 'tabitomo', 'Report app.name must be tabitomo.');
assert(typeof report.app?.version === 'string' && report.app.version.length > 0, 'Report app.version must be present.');
assert(report.app?.bundleIdentifier === 'com.backrunner.tabitomo', 'Report app.bundleIdentifier must be com.backrunner.tabitomo.');
assert(typeof report.app?.buildNumber === 'string' && report.app.buildNumber.length > 0, 'Report app.buildNumber must be present.');
assert(typeof report.app?.buildSource === 'string' && report.app.buildSource.length > 0, 'Report app.buildSource must be present.');
assert(isRecord(report.runtime), 'Report runtime metadata must be an object.');
assert(report.runtime?.platform === 'ios', 'Report runtime.platform must be ios for release evidence.');
assert(typeof report.runtime?.platformVersion === 'string' && report.runtime.platformVersion.length > 0, 'Report runtime.platformVersion must be present.');
assert(typeof report.runtime?.isPhysicalDevice === 'boolean', 'Report runtime.isPhysicalDevice must be boolean.');
assert(typeof report.runtime?.isSimulator === 'boolean', 'Report runtime.isSimulator must be boolean.');
assert(typeof report.runtime?.deviceModel === 'string' && report.runtime.deviceModel.length > 0, 'Report runtime.deviceModel must be present.');
assert(typeof report.runtime?.deviceType === 'string' && report.runtime.deviceType.length > 0, 'Report runtime.deviceType must be present.');
assert(typeof report.runtime?.osName === 'string' && report.runtime.osName.length > 0, 'Report runtime.osName must be present.');
assert(typeof report.runtime?.osVersion === 'string' && report.runtime.osVersion.length > 0, 'Report runtime.osVersion must be present.');
if (!isCheckedInSampleFixture) {
  assert(report.runtime?.isPhysicalDevice === true, 'Release Device QA report must be exported from a physical iPhone.');
  assert(report.runtime?.isSimulator === false, 'Release Device QA report must not be exported from a simulator.');
}
assert(typeof report.runtime?.sourceLanguage === 'string' && report.runtime.sourceLanguage.length > 0, 'Report runtime.sourceLanguage must be present.');
assert(isRecord(report.imageState), 'Report imageState must be an object.');
assert(typeof report.imageState?.hasPreparedImage === 'boolean', 'Report imageState.hasPreparedImage must be boolean.');
assert(['none', 'data-uri', 'local-file'].includes(report.imageState?.imageKind), 'Report imageState.imageKind must be none, data-uri, or local-file.');
assert(isRecord(report.privacy), 'Report privacy metadata must be an object.');
assert(report.privacy?.redacted === true, 'Report privacy.redacted must be true.');
assert(typeof report.privacy?.note === 'string' && report.privacy.note.length > 0, 'Report privacy.note must be present.');
assert(Array.isArray(report.checks), 'Report checks must be an array.');

for (const forbidden of forbiddenPatterns) {
  if (forbidden.pattern.test(reportText)) {
    addError(`Report appears to leak ${forbidden.name}.`);
  }
}

const checksById = new Map();
for (const check of Array.isArray(report.checks) ? report.checks : []) {
  if (!isRecord(check)) {
    addError('Every check entry must be an object.');
    continue;
  }

  if (checksById.has(check.id)) {
    addError(`Duplicate check id "${check.id}".`);
  }
  checksById.set(check.id, check);

  assert(requiredCheckIds.includes(check.id), `Unknown check id "${check.id}".`);
  assert(typeof check.label === 'string' && check.label.length > 0, `Check ${check.id} label must be present.`);
  assert(['recorded', 'pending'].includes(check.status), `Check ${check.id} status must be recorded or pending.`);
  assert(check.outcome === 'passed' || check.outcome === 'failed' || check.outcome === null, `Check ${check.id} outcome must be passed, failed, or null.`);
  assert(typeof check.result === 'string' && check.result.length > 0, `Check ${check.id} result must be a non-empty string.`);

  if (check.status === 'recorded') {
    assert(check.outcome === 'passed' || check.outcome === 'failed', `Recorded check ${check.id} must have an outcome.`);
    assert(isIsoDate(check.startedAt), `Recorded check ${check.id} must include startedAt.`);
    assert(isIsoDate(check.finishedAt), `Recorded check ${check.id} must include finishedAt.`);
    assert(Number.isFinite(check.durationMs) && check.durationMs >= 0, `Recorded check ${check.id} must include non-negative durationMs.`);
    if (isIsoDate(check.startedAt) && isIsoDate(check.finishedAt)) {
      assert(Date.parse(check.finishedAt) >= Date.parse(check.startedAt), `Check ${check.id} finishedAt must not precede startedAt.`);
    }
  } else {
    assert(check.outcome === null, `Pending check ${check.id} outcome must be null.`);
    assert(check.startedAt === null, `Pending check ${check.id} startedAt must be null.`);
    assert(check.finishedAt === null, `Pending check ${check.id} finishedAt must be null.`);
    assert(check.durationMs === null, `Pending check ${check.id} durationMs must be null.`);
  }
}

for (const id of requiredCheckIds) {
  assert(checksById.has(id), `Report is missing check "${id}".`);
}

const requiredIds = requiredIdsForMode();
for (const id of requiredIds) {
  const check = checksById.get(id);
  if (!check) {
    continue;
  }
  assert(check.status === 'recorded', `Required check ${id} must be recorded.`);
  assert(check.outcome === 'passed', `Required check ${id} must pass.`);
}

const recordedCount = Array.from(checksById.values()).filter((check) => check.status === 'recorded').length;
const passedCount = Array.from(checksById.values()).filter((check) => check.outcome === 'passed').length;
const failedCount = Array.from(checksById.values()).filter((check) => check.outcome === 'failed').length;
const pendingCount = Array.from(checksById.values()).filter((check) => check.status === 'pending').length;

notes.push(`recorded=${recordedCount}`);
notes.push(`passed=${passedCount}`);
notes.push(`failed=${failedCount}`);
notes.push(`pending=${pendingCount}`);
notes.push(`required=${requiredMode}`);
if (isCheckedInSampleFixture) {
  notes.push('sampleFixture=true');
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`not ok - ${error}`);
  }
  console.error(`iOS Device QA report check failed for ${reportPath}.`);
  process.exit(1);
}

console.log(`iOS Device QA report check passed for ${reportPath}. ${notes.join(', ')}.`);
