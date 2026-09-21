import { expect } from '@playwright/test';

// Run against the exported Expo app, with synthetic providers and credentials.
export async function reviewMobileInteractions(page, { endpoint, imagePath }) {
  const url = `${endpoint}/chat/completions`;
  const pending = [];
  let holdNext = false;
  let failNext = false;
  const handler = async (route) => {
    const body = route.request().postDataJSON();
    const delayed = holdNext;
    holdNext = false;
    if (delayed) await new Promise((resolve) => pending.push(resolve));
    const result = delayed ? 'Stale review result' : 'Fresh review result';
    try {
      if (failNext) {
        failNext = false;
        await route.fulfill({ status: 503, body: 'Review provider unavailable' });
      } else if (body.stream) {
        await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: result } }] })}\n\ndata: [DONE]\n\n` });
      } else {
        await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ translation: result }) } }] } });
      }
    } catch (error) {
      // A cancelled fetch may close the intercepted request before fulfillment.
      if (!delayed) throw error;
    }
  };
  await page.route(url, handler);
  const clear = () => page.getByRole('button', { name: 'Clear', exact: true }).click();
  const source = page.getByLabel('Source text');
  const startSlow = async (text) => {
    holdNext = true;
    await source.fill(text);
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
    await expect.poll(() => pending.length).toBe(1);
  };
  const release = () => pending.shift()?.();
  try {
    await page.getByRole('tab', { name: 'Translate text mode' }).click();
    await page.getByRole('button', { name: / language$/ }).first().click();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: / language$/ }).last().click();
    await page.getByRole('button', { name: 'Chinese', exact: true }).click();
    await startSlow('Review clear pending request');
    await clear();
    release();
    await source.fill('Review after clear');
    await expect(page.getByText('Fresh review result', { exact: true })).toBeVisible();
    await expect(page.getByText('Stale review result', { exact: true })).toHaveCount(0);

    await startSlow('Review edit pending request');
    await source.fill('Review newest input');
    release();
    await expect(page.getByText('Fresh review result', { exact: true })).toBeVisible();
    await expect(page.getByText('Stale review result', { exact: true })).toHaveCount(0);

    await startSlow('Review change mode pending request');
    await page.getByRole('tab', { name: 'Explain text mode' }).click();
    release();
    await expect(page.getByText('Fresh review result', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explain', exact: true })).toBeEnabled();

    // Same-language explanations and answers are valid, as on the Web surface.
    await clear();
    await page.getByRole('button', { name: / language$/ }).click();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await source.fill('Review explain in English');
    await page.getByRole('button', { name: 'Explain', exact: true }).click();
    await expect(page.getByText('Fresh review result', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Q&A text mode' }).click();
    await source.fill('Review answer in English');
    await page.getByRole('button', { name: 'Answer', exact: true }).click();
    await expect(page.getByText('Fresh review result', { exact: true })).toBeVisible();
    await clear();
    await page.getByRole('button', { name: 'English language', exact: true }).click();
    await page.getByRole('button', { name: 'Chinese', exact: true }).click();
    await page.getByRole('tab', { name: 'Translate text mode' }).click();

    // Saving must retain the draft and offer a retry after storage failure.
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByPlaceholder('Model ID', { exact: true }).fill('review-saved-model');
    await page.evaluate(() => {
      window.reviewOriginalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'tabitomo.mobile.settings.v1') throw new Error('Review storage unavailable');
        return window.reviewOriginalSetItem.call(this, key, value);
      };
    });
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('alert')).toContainText('Review storage unavailable');
    await expect(page.getByPlaceholder('Model ID', { exact: true })).toHaveValue('review-saved-model');
    await page.evaluate(() => { Storage.prototype.setItem = window.reviewOriginalSetItem; delete window.reviewOriginalSetItem; });
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings', { exact: true })).toHaveCount(0);

    // The main action reruns the selected photo, with cancellation and failure feedback.
    // The same-language assistant checks above can leave both languages Chinese.
    await page.getByRole('button', { name: / language$/ }).first().click();
    await page.getByRole('button', { name: 'Japanese', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Album', exact: true }).click();
    await (await chooser).setFiles(imagePath);
    await page.getByRole('button', { name: 'Vision translation image mode' }).click();
    await expect(page.getByText('Fresh review result', { exact: true })).toBeVisible();
    failNext = true;
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('AI request failed (503)');
  await expect(page.getByRole('alert')).not.toContainText('Review provider unavailable');
    await expect(page.getByRole('button', { name: 'Translate', exact: true })).toBeEnabled();
    holdNext = true;
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
    await expect.poll(() => pending.length).toBe(1);
    await clear();
    release();
    await source.fill('Review after image clear');
    await expect(page.getByText('Fresh review result', { exact: true })).toBeVisible();
    await expect(page.getByText('Stale review result', { exact: true })).toHaveCount(0);
    await clear();
    console.log('Mobile interaction review passed: cancellation, stale results, same-language assistants, save retry, image rerun and recovery.');
  } finally {
    pending.splice(0).forEach((resolve) => resolve());
    await page.unroute(url, handler);
    await page.evaluate(() => {
      if (window.reviewOriginalSetItem) Storage.prototype.setItem = window.reviewOriginalSetItem;
      delete window.reviewOriginalSetItem;
    });
  }
}
