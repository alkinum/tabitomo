import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS,
  createSettingsSyncSnapshot,
  mergeSettingsSyncSnapshots,
  normalizeSettings,
  normalizeSettingsSyncSnapshot,
} from './index';

test('settings sync migrates a legacy whole-settings snapshot', () => {
  const snapshot = normalizeSettingsSyncSnapshot({
    ...DEFAULT_SETTINGS,
    generalAI: { ...DEFAULT_SETTINGS.generalAI, endpoint: 'https://example.com/v1' },
    updatedAt: 12,
  }, 12);

  assert.ok(snapshot);
  assert.equal(snapshot.settings.generalAI.modelName, 'gpt-5.6-terra');
  assert.equal(snapshot.groups.generalAI.updatedAt, 12);
  assert.equal(snapshot.groups.imageOCR.updatedAt, 12);
});

test('settings sync migrates the previous mobile wrapper', () => {
  const snapshot = normalizeSettingsSyncSnapshot({
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      speechRecognition: { ...DEFAULT_SETTINGS.speechRecognition, localEngine: 'sensevoice' },
    },
    updatedAt: 42,
  });

  assert.ok(snapshot);
  assert.equal(snapshot.settings.speechRecognition.localEngine, 'sensevoice');
  assert.equal(snapshot.groups.speechRecognition.updatedAt, 42);
});

test('settings sync merges independent section edits', () => {
  const base = createSettingsSyncSnapshot(normalizeSettings(DEFAULT_SETTINGS), 10);
  const local = createSettingsSyncSnapshot(normalizeSettings({
    ...base.settings,
    speechRecognition: { ...base.settings.speechRecognition, localEngine: 'sensevoice' },
  }), 20, base);
  const remote = createSettingsSyncSnapshot(normalizeSettings({
    ...base.settings,
    imageOCR: { ...base.settings.imageOCR, provider: 'qwen' },
  }), 30, base);

  const merged = mergeSettingsSyncSnapshots(local, remote);
  assert.equal(merged.snapshot.settings.speechRecognition.localEngine, 'sensevoice');
  assert.equal(merged.snapshot.settings.imageOCR.provider, 'qwen');
  assert.ok(merged.localGroups.includes('speechRecognition'));
  assert.ok(merged.remoteGroups.includes('imageOCR'));
});

test('settings sync keeps the current device on an exact timestamp tie', () => {
  const base = createSettingsSyncSnapshot(normalizeSettings(DEFAULT_SETTINGS), 10);
  const local = createSettingsSyncSnapshot(normalizeSettings({
    ...base.settings,
    generalAI: { ...base.settings.generalAI, endpoint: 'https://local.example/v1' },
  }), 20, base);
  const remote = createSettingsSyncSnapshot(normalizeSettings({
    ...base.settings,
    generalAI: { ...base.settings.generalAI, endpoint: 'https://remote.example/v1' },
  }), 20, base);

  const merged = mergeSettingsSyncSnapshots(local, remote);
  assert.equal(merged.snapshot.settings.generalAI.endpoint, 'https://local.example/v1');
  assert.deepEqual(merged.conflictedGroups, ['generalAI']);
});
