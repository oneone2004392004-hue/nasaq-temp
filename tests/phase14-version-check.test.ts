import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = execFileSync(process.execPath, ['tools/check-version.mjs'], { cwd: root, encoding: 'utf8' }).trim();
assert.match(output, /فحص الإصدار مرّ: package\.json=\d+\.\d+\.\d+, src-tauri\/tauri\.conf\.json=\d+\.\d+\.\d+, src-tauri\/Cargo\.toml=\d+\.\d+\.\d+/);
console.log('E2 version-check regression passed: three manifests match.');
