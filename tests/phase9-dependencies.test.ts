import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const removedPackages = [
  '@tauri-apps/plugin-sql',
  '@types/express',
  'autoprefixer',
  'esbuild',
  'tailwindcss',
];
for (const dependency of removedPackages) {
  assert.equal(pkg.dependencies?.[dependency] ?? pkg.devDependencies?.[dependency], undefined, `${dependency} should not be declared`);
}
assert.equal(existsSync(join(root, 'ideas.md')), false, 'obsolete ideas.md should be absent');
const npmLockfiles = readdirSync(root).filter((name) => ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(name));
assert.deepEqual(npmLockfiles, ['package-lock.json'], 'package-lock.json must be the sole npm lockfile');
console.log('C2 dependency regression passed: unused packages removed; one npm lockfile; ideas.md absent.');
