// One semantic palette for Web and native. Layout belongs to each platform.
export interface AppTheme {
  name: 'light' | 'dark';
  gradient: readonly [string, string, string];
  statusBarStyle: 'light' | 'dark';
  accent: string;
  accentStrong: string;
  accentDeep: string;
  secondaryAccent: string;
  text: string;
  inverseText: string;
  mutedText: string;
  subtleText: string;
  disabledIcon: string;
  card: string;
  panel: string;
  resultPanel: string;
  chip: string;
  miniSurface: string;
  field: string;
  fieldBorder: string;
  border: string;
  resultBorder: string;
  activeSurface: string;
  activeBorder: string;
  choice: string;
  choiceBorder: string;
  backdrop: string;
  shadow: string;
  resultShadow: string;
  overlayBackground: string;
  overlayBorder: string;
  overlayText: string;
  imageBackground: string;
  busyBackground: string;
  footerBorder: string;
  scanFrame: string;
  switchTrackOff: string;
  switchTrackOn: string;
  switchThumbOff: string;
  placeholder: string;
  sourcePlaceholder: string;
  qrLight: string;
  qrDark: string;
}

export const lightTheme: AppTheme = {
  name: 'light',
  gradient: ['#eef2ff', '#f7f7fc', '#faf7fc'],
  statusBarStyle: 'dark',
  accent: '#5856d6',
  accentStrong: '#4f46e5',
  accentDeep: '#312e81',
  secondaryAccent: '#7c3aed',
  text: '#1c1c1e',
  inverseText: '#ffffff',
  mutedText: '#636366',
  subtleText: '#7c8197',
  disabledIcon: '#7c8197',
  card: '#ffffff',
  panel: '#ffffff',
  resultPanel: '#fafafa',
  chip: 'rgba(255,255,255,0.74)',
  miniSurface: 'rgba(255,255,255,0.86)',
  field: '#f5f5f7',
  fieldBorder: '#e5e7eb',
  border: '#e8eaf3',
  resultBorder: '#e3e5f5',
  activeSurface: '#eef2ff',
  activeBorder: '#a5b4fc',
  choice: '#e9e9ed',
  choiceBorder: '#e4e4e7',
  backdrop: 'rgba(15,23,42,0.35)',
  shadow: '#343465',
  resultShadow: '#000000',
  overlayBackground: 'rgba(255,255,255,0.9)',
  overlayBorder: 'rgba(99,102,241,0.45)',
  overlayText: '#312e81',
  imageBackground: '#20243d',
  busyBackground: 'rgba(79,70,229,0.92)',
  footerBorder: '#f1f5f9',
  scanFrame: '#a5b4fc',
  switchTrackOff: '#d4d4d8',
  switchTrackOn: '#c7d2fe',
  switchThumbOff: '#ffffff',
  placeholder: '#636366',
  sourcePlaceholder: '#636366',
  qrLight: '#ffffff',
  qrDark: '#20243d',
};

export const darkTheme: AppTheme = {
  name: 'dark',
  gradient: ['#111827', '#1b1b34', '#252036'],
  statusBarStyle: 'light',
  accent: '#5856d6',
  accentStrong: '#a5b4fc',
  accentDeep: '#f1f0ff',
  secondaryAccent: '#a78bfa',
  text: '#f7f5fa',
  inverseText: '#ffffff',
  mutedText: '#b1b5ca',
  subtleText: '#aaa6b2',
  disabledIcon: '#7f7c87',
  card: '#1c1c1e',
  panel: '#1c1c1e',
  resultPanel: '#242426',
  chip: '#2c2c2e',
  miniSurface: '#1c1c1e',
  field: '#111113',
  fieldBorder: '#3a3a3c',
  border: '#38383a',
  resultBorder: '#38383a',
  activeSurface: '#2a3055',
  activeBorder: '#818cf8',
  choice: '#2c2c2e',
  choiceBorder: '#3a3a3c',
  backdrop: 'rgba(22,23,28,0.66)',
  shadow: '#15161c',
  resultShadow: '#211b22',
  overlayBackground: 'rgba(45,47,56,0.92)',
  overlayBorder: 'rgba(208,207,248,0.48)',
  overlayText: '#f7f5fa',
  imageBackground: '#202129',
  busyBackground: 'rgba(79,70,229,0.92)',
  footerBorder: '#333b5a',
  scanFrame: '#d8d5ed',
  switchTrackOff: '#585a64',
  switchTrackOn: '#818cf8',
  switchThumbOff: '#f1eff5',
  placeholder: '#a29eaa',
  sourcePlaceholder: '#aaa6b2',
  qrLight: '#ffffff',
  qrDark: '#20243d',
};


export const DESIGN_METRICS = { controlHeight: 44, radius: 16, panelRadius: 24, motionMs: 220 } as const;
