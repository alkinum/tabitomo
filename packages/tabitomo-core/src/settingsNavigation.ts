/** Shared section order and names; native model management has its own section. */
export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'AI' },
  { id: 'translation', label: 'Translate' },
  { id: 'speech', label: 'Speech' },
  { id: 'image', label: 'Image' },
  { id: 'offline', label: 'Offline' },
  { id: 'config', label: 'Data' },
] as const;

export type SettingsSectionId = typeof SETTINGS_SECTIONS[number]['id'];
