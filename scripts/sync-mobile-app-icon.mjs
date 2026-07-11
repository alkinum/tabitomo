import { access, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const sourcePath = path.join(rootDir, 'public/icon.png');
const destinations = [
  path.join(rootDir, 'apps/mobile/assets/icon.png'),
  path.join(rootDir, 'apps/mobile/ios/tabitomo/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png'),
];
const checkOnly = process.argv.includes('--check');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--check');

if (unknownArguments.length > 0) {
  console.error('Usage: node scripts/sync-mobile-app-icon.mjs [--check]');
  process.exit(1);
}

// Reuse the image engine already provided by the PWA asset generator.
const generatorRequire = createRequire(import.meta.resolve('@vite-pwa/assets-generator/package.json'));
const sharp = generatorRequire('sharp');

const visibleArtwork = await sharp(sourcePath)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .resize(1024, 1024, { fit: 'fill' })
  .png()
  .toBuffer();

const extendedBackground = await sharp(visibleArtwork)
  .flatten({ background: '#2b9aff' })
  .blur(80)
  .png()
  .toBuffer();

const expectedIcon = await sharp(extendedBackground)
  .composite([{ input: visibleArtwork }])
  .removeAlpha()
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();

const expectedPixels = await sharp(expectedIcon).raw().toBuffer({ resolveWithObject: true });

const matchesExpectedIcon = async (destination) => {
  try {
    await access(destination);
  } catch {
    return false;
  }

  const actualPixels = await sharp(await readFile(destination)).raw().toBuffer({ resolveWithObject: true });
  return actualPixels.info.width === 1024
    && actualPixels.info.height === 1024
    && actualPixels.info.channels === 3
    && actualPixels.data.equals(expectedPixels.data);
};

if (checkOnly) {
  const mismatches = [];
  for (const destination of destinations) {
    if (!(await matchesExpectedIcon(destination))) {
      mismatches.push(path.relative(rootDir, destination));
    }
  }

  if (mismatches.length > 0) {
    console.error(`Mobile app icon is out of sync with public/icon.png: ${mismatches.join(', ')}`);
    console.error('Run pnpm icons:sync-mobile and regenerate the iOS project.');
    process.exit(1);
  }

  console.log('Mobile and iOS app icons match the PWA artwork and contain no alpha channel.');
  process.exit(0);
}

for (const destination of destinations) {
  await writeFile(destination, expectedIcon);
}

console.log('Synced the mobile and iOS app icons from public/icon.png.');
