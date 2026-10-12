import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AuthService } from '../src/features/auth/services/AuthService';
import { AccountLockedError, InvalidCredentialsError } from '../src/features/auth/errors';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

const settings = new Map<string, string>();
const user = { id: 'user-b4', username: 'cashier', name: 'أمين الصندوق', role_id: 'role-cashier', is_active: 1, password_hash: 'hash' };
const userRepo = { findById: async () => user };
const roleRepo = { findById: async () => ({ id: 'role-cashier', code: 'CASHIER', name: 'كاشير' }) };
const permRepo = { getForRole: async () => [{ code: 'pos.sell' }] };
const auditRepo = { log: async () => undefined };
const settingsRepo = {
  get: async (key: string) => settings.get(key) ?? null,
  set: async (key: string, value: string) => { settings.set(key, value); },
};
const hasher = { verify: async () => false, hash: async () => 'hash' };
const makeService = () => new AuthService(userRepo as never, roleRepo as never, permRepo as never, auditRepo as never, settingsRepo as never, hasher as never);

function storeSession(isLocked: boolean, overrides: Record<string, unknown> = {}) {
  const expiresAt = Date.now() + 60_000;
  const session = {
    token: 'session-token', createdAt: Date.now(), expiresAt,
    isLocked, user: {
      id: user.id, username: user.username, name: user.name, roleId: user.role_id,
      roleCode: 'ADMIN', roleName: 'مسؤول', permissions: ['*', 'users.manage'],
    }, ...overrides,
  };
  settings.set(`auth_session_token_hash:${user.id}`, createHash('sha256').update('session-token').digest('hex'));
  settings.set(`auth_session_expires:${user.id}`, String(expiresAt));
  localStorage.setItem('nasaq_pos_auth_session', JSON.stringify(session));
}

async function main() {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  settings.set(`auth_session_locked:${user.id}`, '1');
  storeSession(false);
  const restored = await makeService().restoreSession();
  assert.equal(restored?.user.roleCode, 'CASHIER');
  assert.deepEqual(restored?.user.permissions, ['pos.sell']);
  assert.equal(restored?.isLocked, true);
  console.log('B4 restore trusts database role and permissions, not localStorage: PASS');

  storeSession(false);
  const first = makeService();
  assert.ok(await first.restoreSession());
  for (let i = 0; i < 5; i++) {
    await assert.rejects(first.unlock('wrong'), InvalidCredentialsError);
  }
  const second = makeService();
  assert.ok(await second.restoreSession());
  await assert.rejects(second.unlock('wrong'), AccountLockedError);
  console.log('B4 unlock lockout persists across AuthService recreation: PASS');
  console.log('PHASE 7 AUTH SECURITY: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
