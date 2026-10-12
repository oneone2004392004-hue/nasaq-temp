import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')) as { version: string; identifier: string; app: { security: { csp: string } } };
const cargoToml = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
const rustSource = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
const loggerSource = readFileSync(join(root, 'src/utils/logger.ts'), 'utf8');
const capabilities = JSON.parse(readFileSync(join(root, 'src-tauri/capabilities/default.json'), 'utf8')) as { permissions: Array<string | { identifier: string; allow?: Array<{ path: string }> }> };
const workflow = readFileSync(join(root, '.github/workflows/windows.yml'), 'utf8');

assert.equal(packageJson.version, tauriConfig.version, 'package and Tauri versions must match');
assert.match(cargoToml, new RegExp(`^version = "${packageJson.version.replaceAll('.', '\\.')}"$`, 'm'));
assert.match(rustSource, /\.app_data_dir\(\)[\s\S]{0,100}\.join\("data"\)/, 'database must live under Tauri app data');
assert.match(workflow, /runs-on: windows-latest/);
for (const step of ['npm run typecheck', 'npm run lint', 'npm test', 'cargo check', 'cargo test', 'cargo clippy', 'npm run tauri:build', 'actions/upload-artifact@v4']) {
  assert.ok(workflow.includes(step), `Windows CI missing ${step}`);
}
assert.match(cargoToml, /^tauri-plugin-log\s*=\s*"\^?2\./m);
assert.match(rustSource, /TargetKind::LogDir[\s\S]*?max_file_size\(2 \* 1024 \* 1024\)[\s\S]*?RotationStrategy::KeepSome\(7\)/);
assert.match(loggerSource, /import\('@tauri-apps\/plugin-log'\)/);
assert.ok(capabilities.permissions.includes('log:default'));
assert.ok(!capabilities.permissions.includes('fs:scope-appdata-recursive'));
assert.ok(!capabilities.permissions.includes('fs:allow-read-text-file'));
assert.ok(!capabilities.permissions.includes('fs:allow-write-text-file'));
for (const permission of capabilities.permissions) {
  if (typeof permission === 'string' || !permission.identifier.startsWith('fs:')) continue;
  assert.ok(permission.allow?.every(({ path }) => path.startsWith('$APPDATA/backups')), `${permission.identifier} scope escapes backups`);
}
const csp = tauriConfig.app.security.csp;
assert.match(csp, /default-src 'self'/);
assert.match(csp, /object-src 'none'/);
assert.match(csp, /base-uri 'self'/);
assert.match(csp, /form-action 'self'/);
console.log('D1-D6 release hardening regression passed: manifests, AppData DB, Windows CI, rotating file logs, scoped filesystem, and CSP.');
