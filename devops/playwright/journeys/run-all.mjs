import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const dir = path.dirname(fileURLToPath(import.meta.url));
const journeys = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('verify-') && f.endsWith('.mjs'))
  .sort();

let failures = 0;
for (const file of journeys) {
  console.log('---', file, '---');
  try {
    execFileSync(process.execPath, [path.join(dir, file)], { stdio: 'inherit' });
  } catch {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`${failures}/${journeys.length} journeys failed`);
  process.exit(1);
}
console.log(`${journeys.length}/${journeys.length} journeys passed`);
