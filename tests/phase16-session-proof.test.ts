import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { AuthService } from '../src/features/auth/services/AuthService';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { PermissionRepository } from '../src/repositories/PermissionRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { SettingsRepository } from '../src/repositories/SettingsRepository';
import { BcryptPasswordHasher } from '../src/security/PasswordHasher';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
const db = await DatabaseManager.resetForTesting();
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
const service = new AuthService(new UserRepository(db), new RoleRepository(db), new PermissionRepository(db), new AuditLogRepository(db), new SettingsRepository(db), new BcryptPasswordHasher(4));
await service.setupInitialAdmin({ name: 'مدير الاختبار', username: 'session_admin', password: 'Secret123', confirmPassword: 'Secret123' });
await service.logout();
await service.login({ username: 'session_admin', password: 'Secret123' });
const original = JSON.parse(storage.getItem('nasaq_pos_auth_session')!);

storage.setItem('nasaq_pos_auth_session', JSON.stringify({ ...original, user: { ...original.user, id: 'forged-admin-id' } }));
assert.equal(await new AuthService(new UserRepository(db), new RoleRepository(db), new PermissionRepository(db), new AuditLogRepository(db), new SettingsRepository(db), new BcryptPasswordHasher(4)).restoreSession(), null);

storage.setItem('nasaq_pos_auth_session', JSON.stringify({ ...original, token: 'forged-token' }));
assert.equal(await new AuthService(new UserRepository(db), new RoleRepository(db), new PermissionRepository(db), new AuditLogRepository(db), new SettingsRepository(db), new BcryptPasswordHasher(4)).restoreSession(), null);

storage.setItem('nasaq_pos_auth_session', JSON.stringify(original));
const healthy = new AuthService(new UserRepository(db), new RoleRepository(db), new PermissionRepository(db), new AuditLogRepository(db), new SettingsRepository(db), new BcryptPasswordHasher(4));
assert.ok(await healthy.restoreSession());
await healthy.logout();
assert.equal(await new AuthService(new UserRepository(db), new RoleRepository(db), new PermissionRepository(db), new AuditLogRepository(db), new SettingsRepository(db), new BcryptPasswordHasher(4)).restoreSession(), null);
console.log('PHASE 16 SESSION PROOF: PASS');
