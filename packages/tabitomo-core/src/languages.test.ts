import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from './languages';

test('default languages match the web first-screen translator', () => {
  assert.equal(DEFAULT_SOURCE_LANGUAGE, 'zh');
  assert.equal(DEFAULT_TARGET_LANGUAGE, 'ja');
  assert.equal(SUPPORTED_LANGUAGES[DEFAULT_SOURCE_LANGUAGE], 'Chinese');
  assert.equal(SUPPORTED_LANGUAGES[DEFAULT_TARGET_LANGUAGE], 'Japanese');
});
