/**
 * NASAQ POS — Comprehensive Authentication & Authorization Test Suite (Phase 3)
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { BcryptPasswordHasher } from '../src/security/PasswordHasher';
import { AuthService } from '../src/features/auth/services/AuthService';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { PermissionRepository } from '../src/repositories/PermissionRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { SettingsRepository } from '../src/repositories/SettingsRepository';
import { InvoiceRepository } from '../src/repositories/InvoiceRepository';
import { InvoiceService } from '../src/features/invoices/services/InvoiceService';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  requirePermission,
} from '../src/features/auth/utils/permissions';
import {
  InvalidCredentialsError,
  AccountLockedError,
  UnauthorizedError,
  ValidationError,
} from '../src/features/auth/errors';
import { RoleCode } from '../src/domain/enums';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runAuthTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('  NASAQ POS — Authentication & Authorization Tests');
  console.log('======================================================\n');

  // Initialize Database
  const db = DatabaseManager.getInstance();
  await db.initialize();

  const hasher = new BcryptPasswordHasher(8); // Fast salt rounds for test suite
  const userRepo = new UserRepository(db);
  const roleRepo = new RoleRepository(db);
  const permRepo = new PermissionRepository(db);
  const auditRepo = new AuditLogRepository(db);
  const settingsRepo = new SettingsRepository(db);
  const invoiceRepo = new InvoiceRepository(db);

  const authService = new AuthService(
    userRepo,
    roleRepo,
    permRepo,
    auditRepo,
    settingsRepo,
    hasher
  );

  // 1. Password Hashing & Verification
  console.log('[1/12] Password Hashing & Verification (Bcrypt):');
  const plainPassword = 'SuperSecretPassword123!';
  const hashedPassword = await hasher.hash(plainPassword);
  assert(hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$'), 'Generates valid bcrypt salt hash');
  assert(hashedPassword !== plainPassword, 'Password is never stored in plain text');
  assert(await hasher.verify(plainPassword, hashedPassword), 'Verifies correct password successfully');
  assert(!(await hasher.verify('WrongPassword', hashedPassword)), 'Rejects incorrect password');

  // 2. Initial Admin Setup (First Run)
  console.log('\n[2/12] Initial Admin Setup (First Run Mechanism):');
  const adminSetupData = {
    name: 'م. أحمد المشرف',
    username: 'admin_test',
    password: 'AdminPassword2026',
    confirmPassword: 'AdminPassword2026',
  };

  const adminAuth = await authService.setupInitialAdmin(adminSetupData);
  assert(adminAuth.username === 'admin_test', 'Initial admin created with username');
  assert(adminAuth.roleCode === RoleCode.ADMIN, 'Assigned ADMIN role to initial administrator');
  assert(authService.isAuthenticated(), 'Administrator automatically authenticated upon initial setup');

  const setupSetting = await settingsRepo.get('setup_completed');
  assert(setupSetting === '1', 'setup_completed setting recorded in database as "1"');

  const adminInDb = await userRepo.findByUsername('admin_test');
  assert(!!adminInDb, 'Admin user record persisted in SQLite');
  assert(adminInDb?.password_hash !== 'AdminPassword2026', 'Admin password persisted hashed in SQLite');

  // 3. User & Role Setup for Testing (Cashier & Manager)
  console.log('\n[3/12] Provisioning Test Cashier & Manager:');
  const cashierRole = await roleRepo.findByCode('CASHIER');
  const managerRole = await roleRepo.findByCode('MANAGER');
  assert(!!cashierRole && !!managerRole, 'CASHIER and MANAGER roles found from seed');

  const cashierPassHash = await hasher.hash('CashierPass123');
  const cashierUser = await userRepo.create({
    id: 'user-cashier-test',
    username: 'cashier_test',
    name: 'سارة الكاشير',
    password_hash: cashierPassHash,
    role_id: cashierRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(!!cashierUser, 'Created test cashier user');

  const managerPassHash = await hasher.hash('ManagerPass123');
  const managerUser = await userRepo.create({
    id: 'user-manager-test',
    username: 'manager_test',
    name: 'هاني المدير',
    password_hash: managerPassHash,
    role_id: managerRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(!!managerUser, 'Created test manager user');

  // 4. Successful Login
  console.log('\n[4/12] Successful Login Flow:');
  await authService.logout();
  assert(!authService.isAuthenticated(), 'Logged out prior session');

  const cashierAuth = await authService.login({
    username: 'cashier_test',
    password: 'CashierPass123',
  });
  assert(cashierAuth.username === 'cashier_test', 'Cashier logged in successfully');
  assert(cashierAuth.roleCode === RoleCode.CASHIER, 'Cashier role code verified');
  assert(cashierAuth.permissions.includes('pos.create_order'), 'Cashier possesses "pos.create_order" permission');
  assert(!('password_hash' in (cashierAuth as unknown as Record<string, unknown>)), 'AuthenticatedUser object NEVER exposes password_hash to UI');
  assert(authService.isAuthenticated(), 'authService.isAuthenticated() returns true');

  // 5. Wrong Username & Wrong Password Handling
  console.log('\n[5/12] Failed Login Attempts & Error Handling:');
  try {
    await authService.login({ username: 'non_existent_user', password: 'SomePassword' });
    assert(false, 'Should throw for non-existent user');
  } catch (err) {
    assert(err instanceof InvalidCredentialsError, 'Non-existent user throws InvalidCredentialsError');
  }

  try {
    await authService.login({ username: 'cashier_test', password: 'WrongPassword' });
    assert(false, 'Should throw for wrong password');
  } catch (err) {
    assert(err instanceof InvalidCredentialsError, 'Wrong password throws InvalidCredentialsError');
  }

  const cashierAfterFail = await userRepo.findByUsername('cashier_test');
  assert(
    (cashierAfterFail?.failed_login_attempts ?? 0) >= 1,
    `Failed attempts incremented: ${cashierAfterFail?.failed_login_attempts}`
  );

  // 6. Account Locking Mechanism (5 Failed Attempts)
  console.log('\n[6/12] Account Lockout Protection (Brute-Force Defense):');
  // Attempt 4 more wrong passwords to reach limit of 5
  for (let i = 0; i < 4; i++) {
    try {
      await authService.login({ username: 'cashier_test', password: 'WrongPassword' });
    } catch {
      // expected
    }
  }

  const lockedCashier = await userRepo.findByUsername('cashier_test');
  assert(!!lockedCashier?.locked_until, 'Account locked_until timestamp set in SQLite');

  try {
    await authService.login({ username: 'cashier_test', password: 'CashierPass123' });
    assert(false, 'Should reject login on locked account even with correct password');
  } catch (err) {
    assert(err instanceof AccountLockedError, 'Locked account throws AccountLockedError');
  }

  // Reset lock for subsequent tests
  await userRepo.resetFailedAttemptsAndSetLogin('user-cashier-test');

  // 7. Lock / Unlock Screen Flow
  console.log('\n[7/12] Lock and Unlock Screen (Session Retained):');
  await authService.login({ username: 'cashier_test', password: 'CashierPass123' });
  assert(!authService.isLocked(), 'Session starts unlocked');

  authService.lock();
  assert(authService.isLocked(), 'authService.isLocked() is true after locking');
  assert(authService.isAuthenticated(), 'Session remains active during lock');
  assert(authService.getCurrentUser()?.username === 'cashier_test', 'Current user retained in memory');

  try {
    await authService.unlock('BadPassword');
    assert(false, 'Should fail unlock with wrong password');
  } catch (err) {
    assert(err instanceof InvalidCredentialsError, 'Unlock with bad password throws InvalidCredentialsError');
  }

  const unlockResult = await authService.unlock('CashierPass123');
  assert(unlockResult === true, 'Unlock succeeds with valid password');
  assert(!authService.isLocked(), 'isLocked is false after successful unlock');

  // 8. Change Password Flow
  console.log('\n[8/12] Change Password Flow:');
  try {
    await authService.changePassword('user-cashier-test', 'WrongOld', 'NewCashierPass123', 'NewCashierPass123');
    assert(false, 'Should reject invalid current password');
  } catch (err) {
    assert(err instanceof InvalidCredentialsError, 'Invalid current password rejected');
  }

  try {
    await authService.changePassword('user-cashier-test', 'CashierPass123', 'short', 'short');
    assert(false, 'Should reject short password');
  } catch (err) {
    assert(err instanceof ValidationError, 'Password shorter than 6 characters rejected');
  }

  try {
    await authService.changePassword('user-cashier-test', 'CashierPass123', 'NewPass123', 'MismatchPass456');
    assert(false, 'Should reject mismatched confirmation');
  } catch (err) {
    assert(err instanceof ValidationError, 'Mismatched password confirmation rejected');
  }

  await authService.changePassword('user-cashier-test', 'CashierPass123', 'NewCashierPass2026', 'NewCashierPass2026');
  assert(true, 'Password changed successfully');

  // Verify old password fails
  try {
    await authService.login({ username: 'cashier_test', password: 'CashierPass123' });
    assert(false, 'Old password should fail');
  } catch (err) {
    assert(err instanceof InvalidCredentialsError, 'Old password rejected on login');
  }

  // Verify new password succeeds
  const reAuth = await authService.login({ username: 'cashier_test', password: 'NewCashierPass2026' });
  assert(reAuth.username === 'cashier_test', 'New password logs in successfully');

  // 9. RBAC Permissions Matrix Verification
  console.log('\n[9/12] RBAC Matrix Checks (Admin vs Manager vs Cashier):');
  const cashierObj = authService.getCurrentUser()!;
  const managerObj = await authService.login({ username: 'manager_test', password: 'ManagerPass123' });
  const adminObj = await authService.login({ username: 'admin_test', password: 'AdminPassword2026' });

  // Cashier checks
  assert(hasPermission(cashierObj, 'pos.view_menu'), 'Cashier has "pos.view_menu"');
  assert(hasPermission(cashierObj, 'pos.create_order'), 'Cashier has "pos.create_order"');
  assert(!hasPermission(cashierObj, 'orders.manage'), 'Cashier lacks "orders.manage"');
  assert(!hasPermission(cashierObj, 'products.create'), 'Cashier lacks "products.create"');
  assert(!hasPermission(cashierObj, 'users.manage'), 'Cashier lacks "users.manage"');

  // Manager checks
  assert(hasPermission(managerObj, 'pos.view_menu'), 'Manager has "pos.view_menu"');
  assert(hasPermission(managerObj, 'products.create'), 'Manager has "products.create"');
  assert(hasPermission(managerObj, 'orders.manage'), 'Manager has "orders.manage"');
  assert(!hasPermission(managerObj, 'users.manage'), 'Manager lacks "users.manage"');

  // Admin checks (Bypasses / Has full permission)
  assert(hasPermission(adminObj, 'pos.view_menu'), 'Admin has "pos.view_menu"');
  assert(hasPermission(adminObj, 'products.create'), 'Admin has "products.create"');
  assert(hasPermission(adminObj, 'users.manage'), 'Admin has "users.manage"');
  assert(hasPermission(adminObj, 'system.backup'), 'Admin has "system.backup"');

  // Helper combinations
  assert(hasAnyPermission(cashierObj, 'products.create', 'pos.view_menu'), 'hasAnyPermission returns true if one matches');
  assert(!hasAnyPermission(cashierObj, 'products.create', 'users.manage'), 'hasAnyPermission returns false if none matches');
  assert(hasAllPermissions(cashierObj, 'pos.view_menu', 'pos.create_order'), 'hasAllPermissions returns true when all match');
  assert(!hasAllPermissions(cashierObj, 'pos.view_menu', 'orders.manage'), 'hasAllPermissions returns false when one is missing');

  // 10. Service-Layer Permission Enforcement
  console.log('\n[10/12] Service-Layer Permission Enforcement (Mandatory Rule):');
  const invoiceService = new InvoiceService(invoiceRepo, auditRepo);

  // Insert valid shift and order first to satisfy SQLite foreign keys
  const testShiftId = `shift-test-${Date.now()}`;
  await db.execute(`
    INSERT INTO cash_shifts (
      id, shift_number, user_id, opened_at, opening_cash, status
    ) VALUES (?, ?, ?, ?, ?, ?);
  `, [testShiftId, `SH-${Date.now()}`, 'user-cashier-test', new Date().toISOString(), 50000, 'OPEN']);

  const testOrderId = `order-test-${Date.now()}`;
  await db.execute(`
    INSERT INTO orders (
      id, order_number, order_type, status, shift_id, user_id, subtotal, total, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `, [testOrderId, `ORD-${Date.now()}`, 'TAKEAWAY', 'COMPLETED', testShiftId, 'user-cashier-test', 10000, 10000, new Date().toISOString(), new Date().toISOString()]);

  // Create a test invoice
  const testInvoiceId = `inv-test-${Date.now()}`;
  await db.execute(`
    INSERT INTO invoices (
      id, invoice_number, order_id, shift_id, status, total_amount, tax_amount,
      discount_amount, net_amount, customer_name_snapshot, cashier_name_snapshot,
      printed_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `, [
    testInvoiceId,
    `INV-${Date.now()}`,
    testOrderId,
    testShiftId,
    'PAID',
    10000,
    0,
    0,
    10000,
    'عميل نقدي',
    'كاشير',
    0,
    new Date().toISOString(),
  ]);

  // Attempt to cancel invoice as Cashier (Missing 'orders.manage')
  try {
    await invoiceService.cancel(cashierObj, testInvoiceId, 'محاولة إلغاء غير مصرح بها');
    assert(false, 'Cashier service call should be rejected at service layer');
  } catch (err) {
    assert(err instanceof UnauthorizedError, 'Service layer rejected unauthorized cashier call with UnauthorizedError');
  }

  // Verify invoice status was NOT modified
  const unmodifiedInvoice = await invoiceRepo.findById(testInvoiceId);
  assert(unmodifiedInvoice?.status === 'PAID', 'Invoice status preserved in SQLite after rejected service call');

  // Execute cancel as Manager (Has 'orders.manage')
  await invoiceService.cancel(managerObj, testInvoiceId, 'إلغاء مصرح به بواسطة المشرف');
  const modifiedInvoice = await invoiceRepo.findById(testInvoiceId);
  assert(modifiedInvoice?.status === 'REFUNDED', 'Authorized manager call successfully updated invoice to REFUNDED');

  // 11. Security Audit Logs Verification
  console.log('\n[11/12] Security Audit Logs Verification:');
  const recentLogs = await auditRepo.listRecent(50);
  assert(recentLogs.length > 0, `Recorded ${recentLogs.length} audit logs in SQLite`);

  const actions = recentLogs.map((l) => l.action);
  assert(actions.includes('FIRST_RUN_ADMIN_SETUP'), 'Audit log contains FIRST_RUN_ADMIN_SETUP');
  assert(actions.includes('LOGIN_SUCCESS'), 'Audit log contains LOGIN_SUCCESS');
  assert(actions.includes('LOGIN_FAILED'), 'Audit log contains LOGIN_FAILED');
  assert(actions.includes('ACCOUNT_LOCK'), 'Audit log contains ACCOUNT_LOCK');
  assert(actions.includes('ACCOUNT_UNLOCK'), 'Audit log contains ACCOUNT_UNLOCK');
  assert(actions.includes('PASSWORD_CHANGED'), 'Audit log contains PASSWORD_CHANGED');
  assert(actions.includes('UNAUTHORIZED_ACTION'), 'Audit log contains UNAUTHORIZED_ACTION');

  // Verify no password leaks in audit logs
  let leakedPassword = false;
  for (const log of recentLogs) {
    if (log.details_json) {
      if (
        log.details_json.includes('CashierPass') ||
        log.details_json.includes('AdminPassword') ||
        log.details_json.includes('SuperSecret')
      ) {
        leakedPassword = true;
      }
    }
  }
  assert(!leakedPassword, 'Verified ZERO passwords or plaintext credentials leaked in Audit Logs');

  // 12. UI Filtering Simulation
  console.log('\n[12/12] Role-Based Navigation Filtering Verification:');
  const cashierVisiblePos = hasAnyPermission(cashierObj, 'pos.view_menu', 'pos.create_order');
  const cashierVisibleUsers = hasAnyPermission(cashierObj, 'users.manage');
  assert(cashierVisiblePos === true, 'Cashier sees POS navigation');
  assert(cashierVisibleUsers === false, 'Cashier is hidden from Users & Permissions navigation');

  const adminVisibleUsers = hasAnyPermission(adminObj, 'users.manage');
  assert(adminVisibleUsers === true, 'Admin sees Users & Permissions navigation');

  console.log('\n======================================================');
  console.log(`  Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
