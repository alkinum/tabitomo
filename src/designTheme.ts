import { lightTheme, darkTheme } from '../packages/tabitomo-core/src/designTokens';

/** Native and Web use the same semantic color roles, including system dark mode. */
export function installDesignTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const palette = media.matches ? darkTheme : lightTheme;
    document.documentElement.classList.toggle('dark', media.matches);
    for (const [key, value] of Object.entries(palette)) {
      if (typeof value === 'string') document.documentElement.style.setProperty(`--tt-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value);
    }
    palette.gradient.forEach((value, i) => document.documentElement.style.setProperty(`--tt-gradient-${i}`, value));
  };
  apply();
  media.addEventListener('change', apply);
}
