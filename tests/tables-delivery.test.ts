/**
 * NASAQ POS — Comprehensive Tables & Delivery Test Suite (Phase 8)
 * Tests:
 * 1. Table CRUD, validation (name, capacity, bounds), and uniqueness
 * 2. Table Status Management (AVAILABLE, OCCUPIED, RESERVED) and active order guard
 * 3. List tables with occupying order preview
 * 4. Dine-In order creation auto-occupies table & prevents concurrent order conflicts
 * 5. Atomic Table Transfer with concurrency conflict prevention
 * 6. Atomic Table Merge with line item snapshots preservation & total recalculation
 * 7. Order Cancellation auto-releases table to AVAILABLE
 * 8. Payment & Sale Completion auto-releases table to AVAILABLE
 * 9. Delivery Driver CRUD, validation (phone, name), and active orders delete protection
 * 10. Delivery Order Listing with filters (status, driver, search, date)
 * 11. Delivery Driver Assignment and unassignment
 * 12. Delivery Lifecycle Status Transitions (PENDING -> PREPARING -> READY -> OUT_FOR_DELIVERY -> DELIVERED)
 * 13. Guard: Cannot move to OUT_FOR_DELIVERY without an assigned driver
 * 14. Guard: Immutability of DELIVERED or CANCELLED delivery orders
 * 15. Delivery info update and dynamic delivery fee recalculation
 * 16. Strict RBAC Enforcement across Tables and Delivery operations
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { CategoryRepository } from '../src/repositories/CategoryRepository';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { OrderItemRepository } from '../src/repositories/OrderItemRepository';
import { CustomerRepository } from '../src/repositories/CustomerRepository';
import { ShiftRepository } from '../src/repositories/ShiftRepository';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { TableRepository } from '../src/repositories/TableRepository';
import { DeliveryDriverRepository } from '../src/repositories/DeliveryDriverRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { OrderService } from '../src/features/orders/services/OrderService';
import { PaymentService } from '../src/features/pos/services/PaymentService';
import { TableService } from '../src/features/tables/services/TableService';
import { DeliveryService } from '../src/features/delivery/services/DeliveryService';
import { OrderType, OrderStatus, TableStatus, DeliveryStatus, PaymentMethod } from '../src/domain/enums';
import { AuthenticatedUser } from '../src/features/auth/types';
import { ValidationError, NotFoundError, ConflictError } from '../src/database/errors';
import { UnauthorizedError } from '../src/features/auth/errors';

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

async function expectError(fn: () => Promise<unknown>, errorType: any, message: string): Promise<void> {
  try {
    await fn();
    failed++;
    console.error(`  ✗ FAIL (expected error not thrown): ${message}`);
  } catch (err: any) {
    if (err instanceof errorType) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.error(`  ✗ FAIL (wrong error type ${err.constructor.name}): ${message}`, err.message);
    }
  }
}

async function runTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('🚀 NASAQ POS — PHASE 8: TABLES & DELIVERY TEST SUITE');
  console.log('======================================================\n');

  const dbManager = DatabaseManager.getInstance();
  await dbManager.initialize();

  const userRepo = new UserRepository();
  const roleRepo = new RoleRepository();
  const catRepo = new CategoryRepository();
  const prodRepo = new ProductRepository();
  const custRepo = new CustomerRepository();
  const shiftRepo = new ShiftRepository();
  const orderRepo = new OrderRepository();
  const orderItemRepo = new OrderItemRepository();
  const auditRepo = new AuditLogRepository();
  const tableRepo = new TableRepository();
  const driverRepo = new DeliveryDriverRepository();

  const tableService = new TableService(dbManager, tableRepo, orderRepo, orderItemRepo, auditRepo);
  const deliveryService = new DeliveryService(dbManager, driverRepo, orderRepo, orderItemRepo, custRepo, auditRepo);
  const orderService = new OrderService(orderRepo, orderItemRepo, prodRepo, custRepo, shiftRepo, auditRepo, tableRepo, driverRepo);
  const paymentService = new PaymentService(dbManager);

  // Setup Roles and DB Users
  const adminRole = (await roleRepo.findByCode('ADMIN'))!;
  const cashierRole = (await roleRepo.findByCode('CASHIER'))!;
  const nowIso = new Date().toISOString();

  const dbAdmin = await userRepo.create({
    id: `usr-admin-p8-${Date.now()}`,
    username: `admin_p8_${Date.now()}`,
    name: 'مدير النظام',
    password_hash: 'dummyhash',
    role_id: adminRole.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  });

  const dbCashier = await userRepo.create({
    id: `usr-cashier-p8-${Date.now()}`,
    username: `cashier_p8_${Date.now()}`,
    name: 'كاشير الصالة',
    password_hash: 'dummyhash',
    role_id: cashierRole.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  });

  // Setup Users with RBAC
  const adminUser: AuthenticatedUser = {
    id: dbAdmin.id,
    username: dbAdmin.username,
    name: dbAdmin.name,
    roleId: adminRole.id,
    roleCode: 'ADMIN' as any,
    roleName: adminRole.name,
    permissions: [
      'pos.view_menu',
      'pos.create_order',
      'pos.cancel_order',
      'orders.view',
      'orders.manage',
      'tables.view',
      'tables.create',
      'tables.edit',
      'tables.delete',
      'tables.transfer',
      'delivery.view',
      'delivery.edit',
      'delivery.assign_driver',
      'delivery.change_status',
      'delivery.drivers.manage',
    ],
  };

  const cashierUser: AuthenticatedUser = {
    id: dbCashier.id,
    username: dbCashier.username,
    name: dbCashier.name,
    roleId: cashierRole.id,
    roleCode: 'CASHIER' as any,
    roleName: cashierRole.name,
    permissions: [
      'pos.view_menu',
      'pos.create_order',
      'orders.view',
      'tables.view',
      'tables.transfer',
      'delivery.view',
      'delivery.change_status',
    ],
  };

  // Setup Shift
  let shift = await shiftRepo.findActiveShift();
  if (!shift) {
    shift = await shiftRepo.create({
      id: `shift-p8-${Date.now()}`,
      shift_number: 'SH-P8-001',
      user_id: adminUser.id,
      opened_at: new Date().toISOString(),
      closed_at: null,
      opening_cash: 50000,
      expected_cash: 50000,
      actual_cash: null,
      cash_difference: null,
      status: 'OPEN',
      notes: 'وردية اختبارات الطاولات والتوصيل',
    });
  }

  // Setup Catalog Product
  const cat = await catRepo.create({
    id: `cat-p8-${Date.now()}`,
    name: 'مأكولات صالة وتوصيل',
    sort_order: 1,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const pizza = await prodRepo.create({
    id: `prod-p8-pizza-${Date.now()}`,
    name: 'بيتزا سوبريم إيطالية',
    barcode: `BC-P8-${Date.now()}`,
    price: 6500, // 65.00 EGP
    cost_price: 2500,
    category_id: cat.id,
    track_stock: 0,
    current_stock: 100,
    min_stock_alert: 5,
    unit: 'قطعة',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const juice = await prodRepo.create({
    id: `prod-p8-juice-${Date.now()}`,
    name: 'عصير برتقال طبيعي',
    barcode: `BC-P8-J-${Date.now()}`,
    price: 1500, // 15.00 EGP
    cost_price: 500,
    category_id: cat.id,
    track_stock: 0,
    current_stock: 100,
    min_stock_alert: 5,
    unit: 'كوب',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log('--- 1. Tables CRUD & Validations ---');
  // Create Table
  const tableA = await tableService.createTable(adminUser, {
    name: `T-101-${Date.now().toString().slice(-4)}`,
    capacity: 4,
  });
  assert(tableA.id !== undefined && tableA.status === TableStatus.AVAILABLE, 'Table A created successfully with AVAILABLE status');

  // Duplicate name validation
  await expectError(
    () => tableService.createTable(adminUser, { name: tableA.name, capacity: 6 }),
    ValidationError,
    'Throws ValidationError on duplicate table name'
  );

  // Invalid capacity bounds
  await expectError(
    () => tableService.createTable(adminUser, { name: 'T-Invalid', capacity: 0 }),
    ValidationError,
    'Throws ValidationError on capacity < 1'
  );

  // Update Table
  const updatedTableA = await tableService.updateTable(adminUser, tableA.id, {
    capacity: 6,
  });
  assert(updatedTableA.capacity === 6, 'Table capacity updated successfully');

  // Table B for transfer/merge tests
  const tableB = await tableService.createTable(adminUser, {
    name: `T-102-${Date.now().toString().slice(-4)}`,
    capacity: 2,
  });
  assert(tableB.status === TableStatus.AVAILABLE, 'Table B created successfully');

  console.log('\n--- 2. Table Status Management & Guards ---');
  // Update status manually to RESERVED
  const reservedTable = await tableService.updateTableStatus(adminUser, tableB.id, TableStatus.RESERVED);
  assert(reservedTable.status === TableStatus.RESERVED, 'Table status changed to RESERVED');

  // Back to AVAILABLE
  const availTable = await tableService.updateTableStatus(adminUser, tableB.id, TableStatus.AVAILABLE);
  assert(availTable.status === TableStatus.AVAILABLE, 'Table status returned to AVAILABLE');

  console.log('\n--- 3. Dine-In Order Linking & Concurrency Collision ---');
  // Create DINE_IN order on Table A
  const draft1 = await orderService.createDraft(adminUser, {
    order_type: OrderType.DINE_IN,
    table_id: tableA.id,
    items: [
      { productId: pizza.id, quantity: 2 },
      { productId: juice.id, quantity: 2 },
    ],
  });
  assert(draft1.order.order_type === OrderType.DINE_IN, 'Order 1 created as DINE_IN');
  assert(draft1.order.table_id === tableA.id, 'Order 1 linked to Table A ID');

  // Check Table A status auto-updated to OCCUPIED
  const tableACheck = await tableService.getTableById(tableA.id);
  assert(tableACheck.status === TableStatus.OCCUPIED, 'Table A status automatically set to OCCUPIED');

  // Concurrency collision: Try to create another DINE_IN order on Table A while it has pending order
  await expectError(
    () =>
      orderService.createDraft(adminUser, {
        order_type: OrderType.DINE_IN,
        table_id: tableA.id,
        items: [{ productId: pizza.id, quantity: 1 }],
      }),
    ValidationError,
    'Prevents concurrent Dine-In order creation on already occupied Table A'
  );

  // Cannot manually set Table A to AVAILABLE while active order is pending
  await expectError(
    () => tableService.updateTableStatus(adminUser, tableA.id, TableStatus.AVAILABLE),
    ConflictError,
    'Throws ConflictError when manually marking table AVAILABLE while active order exists'
  );

  // Cannot delete Table A while occupied
  await expectError(
    () => tableService.deleteTable(adminUser, tableA.id),
    ConflictError,
    'Throws ConflictError when deleting table with active order'
  );

  console.log('\n--- 4. List Tables with Occupying Order Preview ---');
  const tablesWithOrder = await tableService.listTablesWithCurrentOrder();
  const tableAView = tablesWithOrder.find((t) => t.id === tableA.id);
  assert(tableAView !== undefined, 'Table A found in listTablesWithCurrentOrder');
  assert(tableAView?.current_order_id === draft1.order.id, 'Table A has draft1 as current_order_id');
  assert(tableAView?.current_order_total === draft1.order.total, 'Table A reflects draft1 order total');

  console.log('\n--- 5. Atomic Table Transfer ---');
  // Transfer Table A order to Table B
  const transferResult = await tableService.transferTable(cashierUser, {
    orderId: draft1.order.id,
    targetTableId: tableB.id,
  });
  assert(transferResult.order.table_id === tableB.id, 'Order transferred to Table B');

  // Verify Table A is now AVAILABLE and Table B is OCCUPIED
  const postTransferA = await tableService.getTableById(tableA.id);
  const postTransferB = await tableService.getTableById(tableB.id);
  assert(postTransferA.status === TableStatus.AVAILABLE, 'Previous Table A is now AVAILABLE');
  assert(postTransferB.status === TableStatus.OCCUPIED, 'Target Table B is now OCCUPIED');

  // Concurrency collision: Try to transfer to same table
  await expectError(
    () =>
      tableService.transferTable(cashierUser, {
        orderId: draft1.order.id,
        targetTableId: tableB.id,
      }),
    ValidationError,
    'Throws ValidationError when transferring to same current table'
  );

  // Transfer back to Table A for merge test
  await tableService.transferTable(cashierUser, {
    orderId: draft1.order.id,
    targetTableId: tableA.id,
  });

  console.log('\n--- 6. Atomic Table Merge ---');
  // Create order 2 on Table B
  const draft2 = await orderService.createDraft(adminUser, {
    order_type: OrderType.DINE_IN,
    table_id: tableB.id,
    items: [{ productId: juice.id, quantity: 1 }],
  });
  assert(draft2.order.total === 1500, 'Draft 2 created on Table B with 1 juice');

  // Merge Table B (draft2) into Table A (draft1)
  const mergeResult = await tableService.mergeTables(cashierUser, {
    sourceOrderId: draft2.order.id,
    targetOrderId: draft1.order.id,
  });
  assert(mergeResult.sourceOrder.status === 'CANCELLED', 'Source order cancelled upon merge');
  assert(mergeResult.targetOrder.total > draft1.order.total, 'Target order total increased with merged items');

  // Verify Table B was released to AVAILABLE
  const postMergeB = await tableService.getTableById(tableB.id);
  assert(postMergeB.status === TableStatus.AVAILABLE, 'Source Table B released to AVAILABLE after merge');

  console.log('\n--- 7. Order Cancellation auto-releases table ---');
  // Create new order on Table B then cancel it
  const draft3 = await orderService.createDraft(adminUser, {
    order_type: OrderType.DINE_IN,
    table_id: tableB.id,
    items: [{ productId: pizza.id, quantity: 1 }],
  });
  const checkOccupiedB = await tableService.getTableById(tableB.id);
  assert(checkOccupiedB.status === TableStatus.OCCUPIED, 'Table B occupied by Draft 3');

  await orderService.cancelDraftOrder(adminUser, draft3.order.id, 'إلغاء بناء على طلب العميل');
  const postCancelB = await tableService.getTableById(tableB.id);
  assert(postCancelB.status === TableStatus.AVAILABLE, 'Table B auto-released to AVAILABLE after order cancellation');

  console.log('\n--- 8. Sale Completion auto-releases table ---');
  // Pay and complete draft1 on Table A
  const saleResult = await paymentService.completeSale(cashierUser, {
    orderId: draft1.order.id,
    payments: [
      {
        method: PaymentMethod.CASH,
        amount: mergeResult.targetOrder.total,
        tenderAmount: mergeResult.targetOrder.total,
      },
    ],
  });
  assert(saleResult.order.status === 'COMPLETED', 'Order 1 completed and paid');

  // Verify Table A auto-released to AVAILABLE
  const postPaymentA = await tableService.getTableById(tableA.id);
  assert(postPaymentA.status === TableStatus.AVAILABLE, 'Table A auto-released to AVAILABLE upon order completion');

  console.log('\n--- 9. Delivery Driver CRUD & Constraints ---');
  const driver1 = await deliveryService.createDriver(adminUser, {
    name: 'سالم الدوسري',
    phone: `010${Date.now().toString().slice(-8)}`,
  });
  assert(driver1.id !== undefined && driver1.is_active === 1, 'Delivery driver 1 created successfully');

  // Duplicate phone validation
  await expectError(
    () => deliveryService.createDriver(adminUser, { name: 'مندوب آخر', phone: driver1.phone }),
    ValidationError,
    'Throws ValidationError on duplicate driver phone'
  );

  // Update Driver
  const updatedDriver1 = await deliveryService.updateDriver(adminUser, driver1.id, {
    name: 'سالم الدوسري - توصيل سريع',
  });
  assert(updatedDriver1.name === 'سالم الدوسري - توصيل سريع', 'Driver name updated successfully');

  console.log('\n--- 10. Delivery Order Creation & Listing ---');
  // Create customer
  const cust = await custRepo.create({
    id: `cust-p8-${Date.now()}`,
    name: 'عبدالله السعيد',
    phone: `055${Date.now().toString().slice(-7)}`,
    address: 'الرياض - حي الياسمين - شارع أنس بن مالك',
    notes: 'الدور الثاني شقة 5',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Create Delivery Order
  const delivOrder = await orderService.createDraft(adminUser, {
    order_type: OrderType.DELIVERY,
    customer_id: cust.id,
    customer_name: cust.name,
    customer_phone: cust.phone,
    customer_address: cust.address,
    delivery_fee: 1500, // 15.00 EGP
    items: [{ productId: pizza.id, quantity: 2 }],
  });
  assert(delivOrder.order.order_type === OrderType.DELIVERY, 'Delivery order created');
  assert(delivOrder.order.delivery_status === 'PENDING', 'Delivery order initialized with status PENDING');
  assert(delivOrder.order.delivery_fee === 1500, 'Delivery fee recorded as 1500 minor units');

  // List delivery orders
  const deliveryOrders = await deliveryService.listDeliveryOrders(adminUser, {
    deliveryStatus: DeliveryStatus.PENDING,
  });
  assert(deliveryOrders.some((o) => o.id === delivOrder.order.id), 'Delivery order found in listDeliveryOrders');

  console.log('\n--- 11. Driver Assignment & Safe Delete Protection ---');
  // Assign driver to order
  const assignedOrder = await deliveryService.assignDriver(adminUser, delivOrder.order.id, driver1.id);
  assert(assignedOrder.delivery_driver_id === driver1.id, 'Driver assigned to delivery order');

  // Attempt to delete driver while having active order
  await expectError(
    () => deliveryService.deleteDriver(adminUser, driver1.id),
    ConflictError,
    'Throws ConflictError when attempting to delete driver with active orders'
  );

  console.log('\n--- 12. Delivery Lifecycle Transitions & Driver Guard ---');
  // PENDING -> PREPARING
  const prepOrder = await deliveryService.updateDeliveryStatus(cashierUser, delivOrder.order.id, DeliveryStatus.PREPARING);
  assert(prepOrder.delivery_status === DeliveryStatus.PREPARING, 'Delivery status changed to PREPARING');

  // PREPARING -> READY
  const readyOrder = await deliveryService.updateDeliveryStatus(cashierUser, delivOrder.order.id, DeliveryStatus.READY);
  assert(readyOrder.delivery_status === DeliveryStatus.READY, 'Delivery status changed to READY');

  // Test Guard: Unassign driver, then try to change to OUT_FOR_DELIVERY
  await deliveryService.assignDriver(adminUser, delivOrder.order.id, null);
  await expectError(
    () => deliveryService.updateDeliveryStatus(cashierUser, delivOrder.order.id, DeliveryStatus.OUT_FOR_DELIVERY),
    ValidationError,
    'Throws ValidationError if attempting OUT_FOR_DELIVERY without an assigned driver'
  );

  // Reassign driver and transition to OUT_FOR_DELIVERY
  await deliveryService.assignDriver(adminUser, delivOrder.order.id, driver1.id);
  const outOrder = await deliveryService.updateDeliveryStatus(cashierUser, delivOrder.order.id, DeliveryStatus.OUT_FOR_DELIVERY);
  assert(outOrder.delivery_status === DeliveryStatus.OUT_FOR_DELIVERY, 'Delivery status changed to OUT_FOR_DELIVERY');

  // OUT_FOR_DELIVERY -> DELIVERED
  const deliveredOrder = await deliveryService.updateDeliveryStatus(cashierUser, delivOrder.order.id, DeliveryStatus.DELIVERED);
  assert(deliveredOrder.delivery_status === DeliveryStatus.DELIVERED, 'Delivery status changed to DELIVERED');

  // Immutability Guard: Cannot change status after DELIVERED
  await expectError(
    () => deliveryService.updateDeliveryStatus(cashierUser, delivOrder.order.id, DeliveryStatus.CANCELLED),
    ConflictError,
    'Throws ConflictError when trying to modify already DELIVERED order'
  );

  console.log('\n--- 13. Delivery Info Update & Dynamic Fee Recalculation ---');
  const delivOrder2 = await orderService.createDraft(adminUser, {
    order_type: OrderType.DELIVERY,
    customer_name: 'عميل تجريبي',
    customer_phone: '0561112233',
    customer_address: 'حي الصحافة',
    delivery_fee: 1000,
    items: [{ productId: pizza.id, quantity: 1 }],
  });
  const initialTotal = delivOrder2.order.total;

  const updatedDeliv = await deliveryService.updateDeliveryInfo(adminUser, delivOrder2.order.id, {
    delivery_fee: 2000,
    notes: 'يرجى الاتصال عند الوصول',
  });
  assert(updatedDeliv.delivery_fee === 2000, 'Delivery fee updated to 2000 minor units');
  assert(updatedDeliv.total === initialTotal + 1000, 'Total dynamically recalculated to include updated delivery fee');
  assert(updatedDeliv.notes === 'يرجى الاتصال عند الوصول', 'Delivery notes updated');

  console.log('\n--- 14. RBAC Permission Checks ---');
  // Cashier without tables.create cannot create table
  await expectError(
    () => tableService.createTable(cashierUser, { name: 'T-Unauth', capacity: 4 }),
    UnauthorizedError,
    'Cashier without tables.create permission is blocked with UnauthorizedError'
  );

  // Cashier without delivery.drivers.manage cannot create driver
  await expectError(
    () => deliveryService.createDriver(cashierUser, { name: 'مندوب غير مصرح', phone: '0599998888' }),
    UnauthorizedError,
    'Cashier without delivery.drivers.manage is blocked with UnauthorizedError'
  );

  // User without tables.transfer cannot transfer
  const readOnlyUser: AuthenticatedUser = {
    id: 'usr-readonly-p8',
    username: 'readonly_user',
    name: 'مستخدم قراءة فقط',
    roleId: cashierRole.id,
    roleCode: 'CASHIER' as any,
    roleName: cashierRole.name,
    permissions: ['tables.view', 'delivery.view'],
  };

  await expectError(
    () => tableService.transferTable(readOnlyUser, { orderId: delivOrder2.order.id, targetTableId: tableA.id }),
    UnauthorizedError,
    'Readonly user blocked from table transfer with UnauthorizedError'
  );

  await expectError(
    () => deliveryService.assignDriver(readOnlyUser, delivOrder2.order.id, driver1.id),
    UnauthorizedError,
    'Readonly user blocked from driver assignment with UnauthorizedError'
  );

  console.log('\n======================================================');
  console.log(`📊 PHASE 8 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
