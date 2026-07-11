import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appConfigPath = path.join(rootDir, 'apps/mobile/app.json');
const buildNumber = process.argv[2];

if (!buildNumber || !/^[1-9][0-9]*$/.test(buildNumber)) {
  console.error('Usage: pnpm ios:set-build-number <positive-integer>');
  process.exit(1);
}

const appConfig = JSON.parse(await readFile(appConfigPath, 'utf8'));
appConfig.expo ||= {};
appConfig.expo.ios ||= {};
appConfig.expo.ios.buildNumber = buildNumber;
await writeFile(appConfigPath, `${JSON.stringify(appConfig, null, 2)}\n`);

await execFileAsync(path.join(rootDir, 'scripts/ios-sync-xcode-project.sh'), [], {
  cwd: rootDir,
  env: process.env,
});

console.log(`Set tabitomo iOS build number to ${buildNumber}.`);
