import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const tauriConfig = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const cargoToml = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const expected = packageJson.version;
const versions = {
  'package.json': expected,
  'src-tauri/tauri.conf.json': tauriConfig.version,
  'src-tauri/Cargo.toml': cargoVersion,
};

const unique = new Set(Object.values(versions));
const errors = [];
if (unique.size !== 1 || unique.has(undefined)) errors.push(`اختلاف إصدارات manifests: ${JSON.stringify(versions)}`);
if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(expected)) errors.push(`إصدار package.json غير صالح: ${expected}`);

const scanRoots = ['Nasaq-POS-v1.0.2', 'docs', 'README.md', 'tools', 'tests', '.github'];
const [expectedMajor, expectedMinor] = expected.split('.');
const oldVersion = new RegExp(`\\b(?:v)?(${expectedMajor}\\.${expectedMinor}\\.\\d+)\\b`, 'g');
function walk(target) {
  const absolute = join(root, target);
  if (!statSync(absolute).isDirectory()) return [absolute];
  const result = [];
  for (const entry of readdirSync(absolute)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    result.push(...walk(join(target, entry)));
  }
  return result;
}
for (const target of scanRoots) {
  try {
    for (const file of walk(target)) {
      let text;
      try { text = readFileSync(file, 'utf8'); } catch { continue; }
      let inHistory = false;
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (/تاريخ الإصدارات|release history/i.test(line)) inHistory = true;
        if (inHistory && /^#{1,3}\s+/.test(line) && !/تاريخ الإصدارات|release history/i.test(line)) inHistory = false;
        if (inHistory) continue;
        for (const match of line.matchAll(oldVersion)) {
          if (match[1] !== expected) errors.push(`${file.replace(`${root}/`, '')}:${index + 1} يحتوي الإصدار ${match[1]} بدلاً من ${expected}`);
        }
      }
    }
  } catch { errors.push(`تعذر فحص المسار ${target}`); }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`فحص الإصدار مرّ: ${Object.entries(versions).map(([file, version]) => `${file}=${version}`).join(', ')}`);
