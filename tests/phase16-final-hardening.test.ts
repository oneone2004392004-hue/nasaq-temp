import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EscPosBuilder } from '../src/features/hardware/escpos/EscPosBuilder';
import { DEFAULT_INVOICE_DESIGN_CONFIG } from '../src/features/invoices/design/constants';

const root = resolve(process.cwd());
const bytes = (text: string, codePage: 'CP864' | 'WPC1256' = 'CP864') => new EscPosBuilder(codePage).text(text).build();
const payloadBytes = (text: string, codePage: 'CP864' | 'WPC1256' = 'CP864') => [...bytes(text, codePage)].slice(3);

for (const text of ['شكراً لزيارتكم', 'أهلاً وسهلاً', 'مُطعم']) {
  assert.equal(payloadBytes(text).includes(0x2d), false, `التشكيل لا ينتج شرطة: ${text}`);
}
assert.equal(payloadBytes(DEFAULT_INVOICE_DESIGN_CONFIG.footerText).includes(0x2d), false);
assert.equal(payloadBytes(DEFAULT_INVOICE_DESIGN_CONFIG.footerText2).includes(0x2d), false);

const activationSource = readFileSync(resolve(root, 'src/features/activation/ActivationService.ts'), 'utf8');
assert.equal(activationSource.includes('@tauri-apps/plugin-fs'), false, 'التفعيل لا يستورد plugin-fs');
assert.match(activationSource, /activation_read/);
assert.match(activationSource, /activation_write/);

const capability = JSON.parse(readFileSync(resolve(root, 'src-tauri/capabilities/default.json'), 'utf8'));
const source = execFileSync('grep', ['-Rho', '@tauri-apps/plugin-fs[^\"\']*', 'src'], { cwd: root, encoding: 'utf8' });
const permissions = JSON.stringify(capability.permissions);
for (const permission of ['fs:allow-mkdir', 'fs:allow-read-dir', 'fs:allow-read-file', 'fs:allow-remove', 'fs:allow-write-file']) {
  assert.equal(permissions.includes(permission), true, `صلاحية ${permission} موجودة للنسخ الاحتياطي`);
}
assert.equal(source.length > 0, true, 'يوجد استخدام فعلي لـ plugin-fs في النسخ الاحتياطي');

execFileSync(process.execPath, ['tools/check-version.mjs'], { cwd: root, stdio: 'pipe' });
const workflow = readFileSync(resolve(root, '.github/workflows/windows.yml'), 'utf8');
for (const step of ['checkout', 'setup-node', 'rust-toolchain', 'cargo-cache', 'npm-ci', 'check-version', 'typecheck', 'lint', 'npm-test', 'cargo-check', 'cargo-test', 'cargo-clippy', 'tauri-build-nsis', 'installer-sha256', 'optional-signing', 'upload-installer-and-sha256']) {
  assert.match(workflow, new RegExp(`name: ${step}`), `خطوة CI موجودة: ${step}`);
}
console.log('PHASE 16 FINAL HARDENING: PASS');
