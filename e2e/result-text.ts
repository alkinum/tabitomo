import type { Page } from '@playwright/test';

// Ruby readings and their fallback parentheses are visible annotations, not
// changes to the provider's base translation.
export const readTranslationText = (page: Page) => page.locator('.workspace-result-body').evaluate(element => {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('rt, rp').forEach(annotation => annotation.remove());
  return clone.textContent || '';
});
