// Portable settings, defaults and migrations are owned by shared core.
export * from '../../../packages/tabitomo-core/src/settings';
import { normalizeSettings, type AISettings } from '../../../packages/tabitomo-core/src/settings';

const SETTINGS_KEY = 'tabitomo_ai_settings';
export const saveSettings = (settings: AISettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
};
export const loadSettings = (): AISettings | null => {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return null;
  try { return normalizeSettings(JSON.parse(stored)); }
  catch { return null; }
};
export const hasSettings = (): boolean => loadSettings() !== null;
export const clearSettings = (): void => localStorage.removeItem(SETTINGS_KEY);
