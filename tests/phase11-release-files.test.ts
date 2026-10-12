import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const windowsInstaller = join(repoRoot, 'NasaqPOS-Windows-Installer-x64.exe');
const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');

assert.match(gitignore, /^NasaqPOS-Windows-Installer-\*\.exe$/m);
assert.equal(existsSync(windowsInstaller), false, 'standalone Windows installer must not remain in source tree');
console.log('C4 release artifact regression passed: installer pattern ignored; standalone installer absent.');
