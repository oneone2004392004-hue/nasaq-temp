import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { ShiftService } from '../src/features/shifts/services/ShiftService';
import { OrderService } from '../src/features/orders/services/OrderService';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { UserRepository } from '../src/repositories/UserRepository';
import { PermissionRepository } from '../src/repositories/PermissionRepository';
import { ShiftRepository } from '../src/repositories/ShiftRepository';
import { CashTransactionRepository } from '../src/repositories/CashTransactionRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { OrderItemRepository } from '../src/repositories/OrderItemRepository';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { CustomerRepository } from '../src/repositories/CustomerRepository';
import { CategoryRepository } from '../src/repositories/CategoryRepository';
import { TableRepository } from '../src/repositories/TableRepository';
import { PaymentRepository } from '../src/repositories/PaymentRepository';
import { InvoiceRepository } from '../src/repositories/InvoiceRepository';
import { InventoryMovementRepository } from '../src/repositories/InventoryMovementRepository';
import { RoleCode, TableStatus } from '../src/domain/enums';
import { ConflictError } from '../src/database/errors';
import { UnauthorizedError } from '../src/features/auth/errors';
import { generateId } from '../src/utils/id';

async function main() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const roleRepo = new RoleRepository(db);
  const roles = await Promise.all([roleRepo.findByCode(RoleCode.MANAGER), roleRepo.findByCode(RoleCode.ADMIN)]);
  const managerRole = roles[0] || roles[1];
  assert.ok(managerRole, 'manager/admin role exists');
  const userRepo = new UserRepository(db);
  const perms = await new PermissionRepository(db).getForRole(managerRole!.id);
  const now = new Date().toISOString();
  const savedUser = await userRepo.create({
    id: generateId('b3user'), username: generateId('b3mgr'), name: 'مدير اختبار', password_hash: 'hash',
    role_id: managerRole!.id, is_active: 1, failed_login_attempts: 0, locked_until: null,
    last_login_at: null, created_at: now, updated_at: now,
  });
  const manager = {
    id: savedUser.id, username: savedUser.username, name: savedUser.name, roleId: managerRole!.id,
    roleCode: managerRole!.code as RoleCode, roleName: managerRole!.name, permissions: perms.map((p) => p.code),
  };
  const shiftRepo = new ShiftRepository(db);
  const auditRepo = new AuditLogRepository(db);
  const orderRepo = new OrderRepository(db);
  const shiftService = new ShiftService(db, shiftRepo, new CashTransactionRepository(db), auditRepo, userRepo, orderRepo, new PaymentRepository(db), new InvoiceRepository(db));
  const shift = await shiftService.openShift(manager, { openingCash: 10000 });
  const categoryRepo = new CategoryRepository(db);
  const category = await categoryRepo.create({ id: generateId('b3cat'), name: 'فئة B3', sort_order: 1, is_active: 1, created_at: now, updated_at: now });
  const productRepo = new ProductRepository(db);
  const product = await productRepo.create({
    id: generateId('b3prod'), category_id: category.id, name: 'صنف B3', barcode: null, price: 2500,
    cost_price: 1000, track_stock: 1, current_stock: 20, min_stock_alert: 0, unit: 'قطعة',
    is_active: 1, created_at: now, updated_at: now,
  });
  const table = await new TableRepository(db).create({
    id: generateId('b3tbl'), name: generateId('طاولة'), capacity: 4, status: TableStatus.AVAILABLE,
    is_active: 1, created_at: now, updated_at: now,
  });
  const orderService = new OrderService(orderRepo, new OrderItemRepository(db), new ProductRepository(db), new CustomerRepository(db), shiftRepo, auditRepo, db);
  const first = await orderService.createDraft(manager, { order_type: 'DINE_IN', table_id: table.id, items: [{ productId: product.id, quantity: 1 }] });
  const second = await orderService.createDraft(manager, { order_type: 'TAKEAWAY', items: [{ productId: product.id, quantity: 2 }] });
  await productRepo.updateStock(product.id, -2);
  await new InventoryMovementRepository(db).create({
    id: generateId('b3sale'), product_id: product.id, movement_type: 'SALE', quantity: 2,
    reference_type: 'ORDER', reference_id: second.order.id, notes: 'حجز مخزون للاختبار',
    user_id: manager.id, created_at: now,
  });
  const numbers = [first.order.order_number, second.order.order_number];
  await assert.rejects(
    shiftService.closeShift(manager, { shiftId: shift.id, actualCash: 10000 }),
    (error: unknown) => error instanceof ConflictError && numbers.every((number) => error.message.includes(number)),
  );
  assert.equal((await shiftService.listPendingOrdersForShift(manager, shift.id)).length, 2);
  await assert.rejects(
    shiftService.closeShift({ ...manager, permissions: ['shifts.close'] }, { shiftId: shift.id, actualCash: 10000, confirmPendingOrders: true }),
    UnauthorizedError,
  );
  assert.equal((await shiftService.listPendingOrdersForShift(manager, shift.id)).length, 2);
  console.log('B3 cashier cannot authorize automatic cancellation: PASS');
  const closed = await shiftService.closeShift(manager, { shiftId: shift.id, actualCash: 10000, confirmPendingOrders: true });
  assert.equal(closed.status, 'CLOSED');
  for (const id of [first.order.id, second.order.id]) {
    const order = await orderRepo.findById(id);
    assert.equal(order?.status, 'CANCELLED');
  }
  assert.equal((await new TableRepository(db).findById(table.id))?.status, 'AVAILABLE');
  assert.equal((await productRepo.findById(product.id))?.current_stock, 20);
  const audit = await db.queryOne<{ details_json: string }>("SELECT details_json FROM audit_logs WHERE action = 'SHIFT_PENDING_ORDERS_CANCELLED' AND entity_id = ?;", [shift.id]);
  assert.ok(audit);
  const details = JSON.parse(audit!.details_json);
  assert.deepEqual(details.order_numbers, numbers);
  console.log('B3 pending orders block close and list numbers: PASS');
  console.log('B3 confirmed close cancels orders, releases table, audits order numbers: PASS');
  console.log('B3 cancellation restores reserved inventory quantity: PASS');
  console.log('PHASE 7 SHIFT CLOSE E2E: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
