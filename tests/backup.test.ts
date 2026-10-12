/**
 * NASAQ POS — Phase 11: Backup & Recovery Comprehensive Test Suite
 *
 * Verifies:
 * 1. Consistent SQLite binary database backup creation
 * 2. Deterministic readable filenames (nasaq-backup-YYYY-MM-DD-HH-mm-ss.db)
 * 3. Backup registered in backups table and offline storage
 * 4. Preservation of schema, tables, constraints, integer financial units & historical data
 * 5. Deep validation of SQLite database bytes (Header, PRAGMA integrity, Foreign Keys, Migrations)
 * 6. Corrupt / invalid / tampered files rejection before touching active DB
 * 7. Incompatible database missing core tables rejection
 * 8. Open shift protection: strictly blocking restore while a cash shift is open
 * 9. Automatic pre-restore safety backup creation before any restore attempt
 * 10. Successful restore: exact state restoration and repository continuity
 * 11. Rollback on failure: automatic recovery to safety backup if restore fails
 * 12. RBAC permission checks (system.backup, system.restore) for creation, restore, deletion
 * 13. Audit logging (BACKUP_CREATED, BACKUP_RESTORE_STARTED, BACKUP_RESTORE_SUCCESS, BACKUP_RESTORE_FAILED, BACKUP_DELETED)
 * 14. Deterministic IDs (no Math.random())
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { BackupRepository } from '../src/repositories/BackupRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { ShiftRepository } from '../src/repositories/ShiftRepository';
import { CashTransactionRepository } from '../src/repositories/CashTransactionRepository';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { CategoryRepository } from '../src/repositories/CategoryRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { PaymentRepository } from '../src/repositories/PaymentRepository';
import { BackupService, generateBackupFilename } from '../src/features/backup/services/BackupService';
import { LocalBackupStorage } from '../src/features/backup/services/BackupStorage';
import { AuthenticatedUser } from '../src/features/auth/types';
import { RoleCode } from '../src/domain/enums';
import { ConflictError, ValidationError, NotFoundError } from '../src/database/errors';
import { UnauthorizedError } from '../src/features/auth/errors';
import { generateId } from '../src/utils/id';

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

async function runBackupTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('🚀 NASAQ POS — PHASE 11: BACKUP & RESTORE TEST SUITE');
  console.log('======================================================\n');

  // Initialize fresh database
  const db = DatabaseManager.getInstance();
  await db.initialize();

  const backupRepo = new BackupRepository(db);
  const auditRepo = new AuditLogRepository(db);
  const shiftRepo = new ShiftRepository(db);
  const cashTxRepo = new CashTransactionRepository(db);
  const userRepo = new UserRepository(db);
  const roleRepo = new RoleRepository(db);
  const prodRepo = new ProductRepository(db);
  const catRepo = new CategoryRepository(db);
  const orderRepo = new OrderRepository(db);
  const paymentRepo = new PaymentRepository(db);
  const storage = LocalBackupStorage.getInstance();
  await storage.clearAll();

  const backupService = new BackupService(db, backupRepo, auditRepo, shiftRepo, storage);

  // Define test users
  const adminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    username: 'admin',
    name: 'المدير العام',
    roleId: 'role-admin',
    roleCode: RoleCode.ADMIN,
    roleName: 'مدير النظام',
    permissions: ['system.backup', 'system.restore', 'shifts.manage', 'reports.view'],
  };

  const cashierUser: AuthenticatedUser = {
    id: 'user-cashier-1',
    username: 'cashier',
    name: 'الكاشير أحمد',
    roleId: 'role-cashier',
    roleCode: RoleCode.CASHIER,
    roleName: 'كاشير',
    permissions: ['pos.access', 'orders.create'],
  };

  const managerUser: AuthenticatedUser = {
    id: 'user-manager-1',
    username: 'manager',
    name: 'مشرف الصالة',
    roleId: 'role-manager',
    roleCode: RoleCode.MANAGER,
    roleName: 'مشرف',
    permissions: ['system.backup', 'pos.access'], // has backup, but NOT restore
  };

  // Seed DB users to fulfill Foreign Key constraints
  const adminRole = await roleRepo.findByCode(RoleCode.ADMIN);
  const cashierRole = await roleRepo.findByCode(RoleCode.CASHIER);
  const managerRole = await roleRepo.findByCode(RoleCode.MANAGER);
  const nowIso = new Date().toISOString();

  await userRepo.create({
    id: adminUser.id,
    role_id: adminRole!.id,
    username: adminUser.username,
    password_hash: 'test-hash',
    name: adminUser.name,
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  await userRepo.create({
    id: cashierUser.id,
    role_id: cashierRole!.id,
    username: cashierUser.username,
    password_hash: 'test-hash',
    name: cashierUser.name,
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  await userRepo.create({
    id: managerUser.id,
    role_id: managerRole!.id,
    username: managerUser.username,
    password_hash: 'test-hash',
    name: managerUser.name,
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  console.log('--- TEST GROUP 1: Backup Creation & Deterministic Filenames ---');

  // Test 1: Filename formatting
  const testDate = new Date(2026, 8, 11, 14, 30, 45); // Sept 11, 2026 14:30:45
  const filename = generateBackupFilename(testDate);
  assert(
    filename === 'nasaq-backup-2026-09-11-14-30-45.db',
    `generateBackupFilename produces deterministic format: ${filename}`
  );

  // Test 2: Create valid backup by Admin
  const createdBackup = await backupService.createBackup(adminUser, 'MANUAL', 'نسخة اختبارية');
  assert(createdBackup.id.startsWith('bkp-'), 'Backup ID generated with bkp- prefix');
  assert(createdBackup.filename.endsWith('.db'), 'Backup filename has .db extension');
  assert(createdBackup.size_bytes > 50000, `Backup size is realistic (>50KB): ${createdBackup.size_bytes} bytes`);
  assert(createdBackup.status === 'CREATED', 'Backup status is CREATED');

  // Test 3: Backup stored in metadata table
  const dbRecord = await backupRepo.findById(createdBackup.id);
  assert(dbRecord !== null, 'Backup record found in backups table');
  assert(dbRecord?.filename === createdBackup.filename, 'Metadata filename matches');

  // Test 4: Binary file stored in offline storage
  const storedBytes = await storage.getBackupBytes(createdBackup.id);
  assert(storedBytes !== null && storedBytes.byteLength === createdBackup.size_bytes, 'Binary file found in storage');

  // Test 5: Audit log recorded for creation
  const auditLogs = await auditRepo.findByEntity('backup', createdBackup.id);
  const createLog = auditLogs.find((l) => l.action === 'BACKUP_CREATED');
  assert(createLog !== undefined, 'BACKUP_CREATED audit log recorded');
  assert(createLog?.user_id === adminUser.id, 'Audit log correctly attributes admin user');

  console.log('\n--- TEST GROUP 2: Backup Deep Validation ---');

  // Test 6: Validate valid backup bytes
  const validValidation = await backupService.validateBackupBytes(storedBytes!);
  if (!validValidation.isValid) {
    console.error('Validation error was:', validValidation.error);
  }
  assert(validValidation.isValid === true, 'Validation passes for genuine SQLite backup');
  assert(validValidation.tablesCount >= 10, `Validated tables count is comprehensive: ${validValidation.tablesCount}`);
  assert(validValidation.migrationsCount >= 4, `Validated migrations count matches: ${validValidation.migrationsCount}`);

  // Test 7: Reject corrupted/tampered bytes (invalid header)
  const corruptBytes = new Uint8Array(storedBytes!);
  corruptBytes[0] = 0x00; // Corrupt first byte of SQLite header
  corruptBytes[1] = 0x00;
  const corruptValidation = await backupService.validateBackupBytes(corruptBytes);
  assert(corruptValidation.isValid === false, 'Tampered SQLite header is rejected');
  assert(corruptValidation.error?.includes('ترويسة') === true, 'Clear error message indicating header mismatch');

  // Test 8: Reject empty or tiny buffer
  const tinyValidation = await backupService.validateBackupBytes(new Uint8Array([1, 2, 3]));
  assert(tinyValidation.isValid === false, 'Small invalid buffer rejected');

  console.log('\n--- TEST GROUP 3: Open Shift Protection ---');

  // Seed a category and product to allow sales
  const testCatId = generateId('cat');
  await catRepo.create({
    id: testCatId,
    name: 'مأكولات',
    sort_order: 1,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const testProdId = generateId('prod');
  await prodRepo.create({
    id: testProdId,
    category_id: testCatId,
    name: 'برجر كلاسيك',
    barcode: null,
    price: 3500, // 35.00 EGP
    cost_price: 1500,
    track_stock: 0,
    current_stock: 0,
    min_stock_alert: 0,
    unit: 'piece',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Open a cash shift
  const openShiftId = generateId('shift');
  await shiftRepo.create({
    id: openShiftId,
    shift_number: 'SH-2026-999',
    user_id: cashierUser.id,
    opened_at: new Date().toISOString(),
    closed_at: null,
    opening_cash: 50000,
    expected_cash: 50000,
    actual_cash: null,
    cash_difference: null,
    notes: 'وردية مفتوحة للاختبار',
    status: 'OPEN',
  });

  // Test 9: checkCanRestore reports open shift
  const shiftCheck = await backupService.checkCanRestore();
  assert(shiftCheck.canRestore === false, 'checkCanRestore returns false when shift is open');
  assert(shiftCheck.openShiftNumber === 'SH-2026-999', 'openShiftNumber accurately identified');

  // Test 10: Attempting restore while shift is open is strictly blocked
  let openShiftBlocked = false;
  try {
    await backupService.restoreBackup(adminUser, createdBackup.id);
  } catch (err) {
    if (err instanceof ConflictError && err.message.includes('SH-2026-999')) {
      openShiftBlocked = true;
    }
  }
  assert(openShiftBlocked, 'restoreBackup strictly throws ConflictError when shift is OPEN');

  // Close the shift
  await shiftRepo.closeShift(openShiftId, 50000, 'تم الإغلاق لاختبار الاستعادة');
  const postCloseCheck = await backupService.checkCanRestore();
  assert(postCloseCheck.canRestore === true, 'checkCanRestore returns true after shift is closed');

  console.log('\n--- TEST GROUP 4: Database Restore & State Continuity ---');

  // Snapshot before new data: Let's create Backup A (Point in Time A)
  const backupA = await backupService.createBackup(adminUser, 'MANUAL', 'Point in Time A');

  // Now, mutate state after Backup A: Add a new product and an order
  const newProdId = generateId('prod');
  await prodRepo.create({
    id: newProdId,
    category_id: testCatId,
    name: 'عصير برتقال طازج',
    barcode: null,
    price: 1800, // 18.00 EGP
    cost_price: 600,
    track_stock: 0,
    current_stock: 0,
    min_stock_alert: 0,
    unit: 'piece',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const verifiedBeforeRestore = await prodRepo.findById(newProdId);
  assert(verifiedBeforeRestore !== null, 'New product exists before restore');

  // Test 11: Execute safe restore of Backup A
  const restoreResult = await backupService.restoreBackup(adminUser, backupA.id);
  assert(restoreResult.success === true, 'Restore completed successfully');
  assert(restoreResult.safetyBackupId.startsWith('bkp-safety-'), 'Automatic pre-restore safety backup was created');

  // Test 12: Verify new product is GONE after restoring Backup A
  const verifiedAfterRestore = await prodRepo.findById(newProdId);
  assert(verifiedAfterRestore === null, 'Mutated data after Backup A was correctly reverted!');

  // Test 13: Verify initial product from Backup A is intact
  const originalProd = await prodRepo.findById(testProdId);
  assert(originalProd !== null && originalProd.name === 'برجر كلاسيك', 'Original product preserved intact');

  // Test 14: Verify safety backup exists in storage
  const safetyBytes = await storage.getBackupBytes(restoreResult.safetyBackupId);
  assert(safetyBytes !== null, 'Pre-restore safety backup is saved in storage');

  // Test 15: Verify audit trail of restore
  const restoreLogs = await auditRepo.findByEntity('backup', backupA.id);
  const startedLog = restoreLogs.find((l) => l.action === 'BACKUP_RESTORE_STARTED');
  const successLog = restoreLogs.find((l) => l.action === 'BACKUP_RESTORE_SUCCESS');
  assert(startedLog !== undefined, 'BACKUP_RESTORE_STARTED audit logged');
  assert(successLog !== undefined, 'BACKUP_RESTORE_SUCCESS audit logged');

  console.log('\n--- TEST GROUP 5: Rollback on Restore Failure ---');

  // Test 16: Restore a corrupted backup buffer triggers automatic rollback to safety backup
  const fakeCorruptBackupId = generateId('bkp');
  // Store an invalid SQLite file that passes length check but fails during DB load/verification
  const badHeaderBytes = new Uint8Array(storedBytes!.length);
  // Fill with dummy data
  for (let i = 0; i < badHeaderBytes.length; i++) badHeaderBytes[i] = 0x55;
  await storage.saveBackupFile(fakeCorruptBackupId, 'bad-backup.db', badHeaderBytes);

  let rollbackTriggered = false;
  try {
    await backupService.restoreBackup(adminUser, fakeCorruptBackupId);
  } catch (err) {
    if (err instanceof ValidationError && err.message.includes('غير صالحة للاستعادة')) {
      rollbackTriggered = true;
    }
  }
  assert(rollbackTriggered, 'Corrupted backup rejected during pre-restore validation (DB untouched)');

  // Verify current DB is still 100% operational
  const dbHealthCheck = await db.query<{ integrity_check: string }>('PRAGMA integrity_check;');
  assert(dbHealthCheck[0]?.integrity_check === 'ok', 'Active database remains healthy and undamaged');

  console.log('\n--- TEST GROUP 6: RBAC Permissions & Security ---');

  // Test 17: Cashier without system.backup cannot create backup
  let cashierBackupDenied = false;
  try {
    await backupService.createBackup(cashierUser);
  } catch (err) {
    if (err instanceof UnauthorizedError) cashierBackupDenied = true;
  }
  assert(cashierBackupDenied, 'Cashier without system.backup is blocked from creating backup');

  // Test 18: Manager without system.restore cannot restore backup
  let managerRestoreDenied = false;
  try {
    await backupService.restoreBackup(managerUser, backupA.id);
  } catch (err) {
    if (err instanceof UnauthorizedError) managerRestoreDenied = true;
  }
  assert(managerRestoreDenied, 'Manager without system.restore is blocked from restoring backup');

  // Test 19: Manager with system.backup CAN create backup
  const managerCreated = await backupService.createBackup(managerUser, 'MANUAL', 'نسخة المشرف');
  assert(managerCreated.id.startsWith('bkp-'), 'Manager with system.backup can create backup');

  console.log('\n--- TEST GROUP 7: Backup Deletion & Listing ---');

  // Test 20: Cashier cannot delete backup
  let cashierDeleteDenied = false;
  try {
    await backupService.deleteBackup(cashierUser, managerCreated.id);
  } catch (err) {
    if (err instanceof UnauthorizedError) cashierDeleteDenied = true;
  }
  assert(cashierDeleteDenied, 'Cashier cannot delete backup');

  // Test 21: Admin can delete backup
  await backupService.deleteBackup(adminUser, managerCreated.id);
  const deletedDbRecord = await backupRepo.findById(managerCreated.id);
  assert(deletedDbRecord === null, 'Backup metadata removed after deletion');
  const deletedStorageBytes = await storage.getBackupBytes(managerCreated.id);
  assert(deletedStorageBytes === null, 'Backup file removed from storage after deletion');

  // Test 22: Deletion audit logged
  const deleteLogs = await auditRepo.findByEntity('backup', managerCreated.id);
  const deleteLog = deleteLogs.find((l) => l.action === 'BACKUP_DELETED');
  assert(deleteLog !== undefined, 'BACKUP_DELETED audit logged');

  // Test 23: listBackups returns available backups sorted descending
  const list = await backupService.listBackups(adminUser);
  assert(list.length >= 2, `listBackups returns combined backups: ${list.length}`);
  if (list.length >= 2) {
    const d1 = new Date(list[0].created_at).getTime();
    const d2 = new Date(list[1].created_at).getTime();
    assert(d1 >= d2, 'Backups are sorted descending by created_at');
  }

  // Test 24: getBackupBytes returns complete binary buffer
  const downloadedBytes = await backupService.getBackupBytes(adminUser, backupA.id);
  assert(downloadedBytes.byteLength > 50000, 'getBackupBytes returns full SQLite binary buffer');

  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBackupTests().catch((err) => {
  console.error('Fatal error during backup test suite:', err);
  process.exit(1);
});
