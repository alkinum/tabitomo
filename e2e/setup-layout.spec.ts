import { test } from '@playwright/test';
import { reviewSetupLayout } from '../scripts/setup-layout-review.mjs';

test('setup expands after choosing a path and keeps navigation above the form', async ({ page }, testInfo) => {
  await page.goto('/');
  await reviewSetupLayout(page, { screenshots: `output/landing-review/${testInfo.project.name}` });
});
