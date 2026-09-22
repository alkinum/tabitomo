import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Returning from typing/navigation is expected to restore the same pixels.
const terminalSurface = name => {
  if (name.endsWith('-dark')) return `${terminalSurface(name.slice(0, -5))}-dark`;
  if (['smoke-setup-manual', 'smoke-setup-expand', 'smoke-setup-keyboard-dismiss'].includes(name)) return 'setup-form';
  if (['smoke-setup-choice', 'smoke-setup-collapse'].includes(name)) return 'setup-choice';
  return name;
};

export async function ensureDistinctScreenshots(screenshots) {
  const hashes = new Map();
  for (const screenshot of screenshots) {
    const hash = createHash('sha256').update(await readFile(screenshot.path)).digest('hex');
    const previous = hashes.get(hash);
    if (previous && terminalSurface(screenshot.name) !== terminalSurface(previous)) {
      throw new Error(`${screenshot.name} screenshot is identical to ${previous}; smoke scene did not visibly update.`);
    }
    hashes.set(hash, screenshot.name);
  }
}
