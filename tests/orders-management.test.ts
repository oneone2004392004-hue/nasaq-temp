/**
 * NASAQ POS — Comprehensive Orders Management Test Suite (Phase 6)
 * Verifies Order Lifecycle: listing, filtering, order details with snapshot integrity,
 * pending order editing without duplication or historical price corruption,
 * atomic updates, soft cancellation with table release, and RBAC authorization.
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
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { OrderService } from '../src/features/orders/services/OrderService';
import { OrderType, OrderStatus, RoleCode, ShiftStatus } from '../src/domain/enums';
import { AuthenticatedUser } from '../src/features/auth/types';
import { ValidationError, NotFoundError } from '../src/database/errors';
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

async function runOrdersManagementTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('  NASAQ POS — Phase 6: Orders Management Test Suite');
  console.log('======================================================\n');

  const db = DatabaseManager.getInstance();
  await db.initialize();

  const categoryRepo = new CategoryRepository(db);
  const productRepo = new ProductRepository(db);
  const orderRepo = new OrderRepository(db);
  const orderItemRepo = new OrderItemRepository(db);
  const customerRepo = new CustomerRepository(db);
  const shiftRepo = new ShiftRepository(db);
  const userRepo = new UserRepository(db);
  const roleRepo = new RoleRepository(db);
  const auditRepo = new AuditLogRepository(db);

  const orderService = new OrderService(
    orderRepo,
    orderItemRepo,
    productRepo,
    customerRepo,
    shiftRepo,
    auditRepo
  );

  // 1. Setup Test Roles & Users
  const cashierRole = await roleRepo.findByCode(RoleCode.CASHIER);
  const managerRole = await roleRepo.findByCode(RoleCode.MANAGER);
  assert(!!cashierRole && !!managerRole, 'Found CASHIER and MANAGER roles in database');

  const now = new Date().toISOString();
  const dbCashier = await userRepo.create({
    id: `u-cash-p6-${Date.now()}`,
    username: `cashier_p6_${Date.now()}`,
    name: 'كاشير تجريبي فاز 6',
    password_hash: 'dummyhash',
    role_id: cashierRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  });

  const cashierUser: AuthenticatedUser = {
    id: dbCashier.id,
    username: dbCashier.username,
    name: dbCashier.name,
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: cashierRole!.name,
    permissions: [
      'pos.view_menu',
      'pos.create_order',
      'pos.cancel_order',
      'orders.view',
      'orders.manage',
      'shifts.open',
      'cash.view_balance',
      'customers.view',
      'customers.create',
    ],
  };

  const managerUser: AuthenticatedUser = {
    id: `u-mgr-p6-${Date.now()}`,
    username: `mgr_p6_${Date.now()}`,
    name: 'مدير الصالة فاز 6',
    roleId: managerRole!.id,
    roleCode: RoleCode.MANAGER,
    roleName: managerRole!.name,
    permissions: [
      'pos.view_menu',
      'pos.create_order',
      'pos.cancel_order',
      'orders.view',
      'orders.manage',
      'inventory.view',
    ],
  };

  const unauthorizedUser: AuthenticatedUser = {
    id: 'user-guest-phase6',
    username: 'guest_phase6',
    name: 'مستخدم بلا صلاحيات',
    roleId: 'role-guest',
    roleCode: RoleCode.CASHIER,
    roleName: 'ضيف',
    permissions: [],
  };

  // Open active test shift for cashier
  let activeShift = await shiftRepo.findActiveShift(cashierUser.id);
  if (!activeShift) {
    activeShift = await shiftRepo.create({
      id: `shift-p6-${Date.now()}`,
      shift_number: `SH-P6-${Date.now()}`,
      user_id: cashierUser.id,
      opened_at: now,
      closed_at: null,
      opening_cash: 50000,
      expected_cash: 50000,
      actual_cash: null,
      cash_difference: null,
      status: ShiftStatus.OPEN,
      notes: null,
    });
  }

  // 2. Setup Test Category and Products
  const testCat = await categoryRepo.create({
    id: `cat-p6-${Date.now()}`,
    name: 'مشروبات المرحلة 6',
    sort_order: 1,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  const productEspresso = await productRepo.create({
    id: `prod-esp-${Date.now()}`,
    category_id: testCat.id,
    name: 'إسبريسو سينجل',
    barcode: `62220001-${Date.now()}`,
    price: 3500, // 35.00 EGP
    cost_price: 1000,
    unit: 'كوب',
    current_stock: 100,
    min_stock_alert: 5,
    track_stock: 1,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  const productCappuccino = await productRepo.create({
    id: `prod-cap-${Date.now()}`,
    category_id: testCat.id,
    name: 'كابتشينو كلاسيك',
    barcode: `62220002-${Date.now()}`,
    price: 6000, // 60.00 EGP
    cost_price: 1800,
    unit: 'كوب',
    current_stock: 80,
    min_stock_alert: 5,
    track_stock: 1,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  const productCroissant = await productRepo.create({
    id: `prod-cro-${Date.now()}`,
    category_id: testCat.id,
    name: 'كرواسون زبدة',
    barcode: `62220003-${Date.now()}`,
    price: 4500, // 45.00 EGP
    cost_price: 1500,
    unit: 'قطعة',
    current_stock: 40,
    min_stock_alert: 5,
    track_stock: 1,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  console.log('--- Test Group 1: Creating Draft Orders for Testing Lifecycle ---');

  // Order 1: Dine-in at Table 12
  const { order: draftDineIn } = await orderService.createDraft(cashierUser, {
    order_type: OrderType.DINE_IN,
    table_number: 'طاولة 12',
    delivery_fee: 0,
    discount_amount: 0,
    notes: 'بدون سكر للإسبريسو',
    items: [
      { productId: productEspresso.id, quantity: 2, notes: 'سادة' }, // 2 * 3500 = 7000
      { productId: productCappuccino.id, quantity: 1, notes: null }, // 1 * 6000 = 6000
    ],
  });
  assert(draftDineIn.status === OrderStatus.PENDING, 'Dine-In draft order created with status PENDING');
  assert(draftDineIn.total === 13000, 'Dine-In draft order total is 13000 minor units (130.00 EGP)');

  // Order 2: Delivery to customer
  const { order: draftDelivery } = await orderService.createDraft(cashierUser, {
    order_type: OrderType.DELIVERY,
    customer_name: 'ياسر عرفات',
    customer_phone: '01012345678',
    customer_address: 'شارع الثورة، مصر الجديدة',
    delivery_fee: 2000,
    discount_amount: 500,
    items: [
      { productId: productCroissant.id, quantity: 3, notes: 'مسخن' }, // 3 * 4500 = 13500
    ],
  });
  assert(draftDelivery.status === OrderStatus.PENDING, 'Delivery draft created with status PENDING');
  assert(draftDelivery.total === 13500 + 2000 - 500, 'Delivery total is 15000 minor units (150.00 EGP)');

  console.log('\n--- Test Group 2: Order Listing & Advanced Filters ---');

  // List all
  const allOrders = await orderService.listOrders(cashierUser, {
    status: 'ALL',
    orderType: 'ALL',
    datePreset: 'ALL',
  });
  assert(allOrders.length >= 2, `listOrders returned ${allOrders.length} orders`);

  const foundDineIn = allOrders.find((o) => o.id === draftDineIn.id);
  assert(!!foundDineIn, 'Found Dine-In order in listing');
  assert(foundDineIn?.cashier_name === cashierUser.name, `Cashier name joined correctly: ${foundDineIn?.cashier_name}`);
  assert(foundDineIn?.table_number === 'طاولة 12', `Table number correctly set: ${foundDineIn?.table_number}`);
  assert(foundDineIn?.items_count === 2, `Items count calculated accurately: ${foundDineIn?.items_count}`);

  const foundDelivery = allOrders.find((o) => o.id === draftDelivery.id);
  assert(!!foundDelivery, 'Found Delivery order in listing');
  assert(foundDelivery?.customer_name === 'ياسر عرفات', `Customer name joined correctly: ${foundDelivery?.customer_name}`);

  // Status filtering
  const pendingOrders = await orderService.listOrders(cashierUser, { status: 'PENDING' });
  assert(pendingOrders.every((o) => o.status === 'PENDING'), 'Status filter PENDING strictly filters pending orders');

  // Type filtering
  const dineInOnly = await orderService.listOrders(cashierUser, { orderType: OrderType.DINE_IN });
  assert(dineInOnly.every((o) => o.order_type === 'DINE_IN'), 'Type filter DINE_IN strictly filters dine_in orders');

  const deliveryOnly = await orderService.listOrders(cashierUser, { orderType: OrderType.DELIVERY });
  assert(deliveryOnly.every((o) => o.order_type === 'DELIVERY'), 'Type filter DELIVERY strictly filters delivery orders');

  // Search filtering
  const searchByOrderNum = await orderService.listOrders(cashierUser, { search: draftDineIn.order_number });
  assert(searchByOrderNum.some((o) => o.id === draftDineIn.id), 'Search by exact order_number returns the target order');

  const searchByTable = await orderService.listOrders(cashierUser, { search: '12' });
  assert(searchByTable.some((o) => o.id === draftDineIn.id), 'Search by table_number returns matching order');

  const searchByCustomer = await orderService.listOrders(cashierUser, { search: 'عرفات' });
  assert(searchByCustomer.some((o) => o.id === draftDelivery.id), 'Search by customer_name returns matching order');

  const searchByPhone = await orderService.listOrders(cashierUser, { search: '01012345678' });
  assert(searchByPhone.some((o) => o.id === draftDelivery.id), 'Search by customer_phone returns matching order');

  // Date filtering
  const todayOrders = await orderService.listOrders(cashierUser, { datePreset: 'TODAY' });
  assert(todayOrders.some((o) => o.id === draftDineIn.id), 'Date filter TODAY includes orders created today');

  console.log('\n--- Test Group 3: Order Details with Snapshot Precision ---');

  const orderDetails = await orderService.getOrderWithDetails(cashierUser, draftDineIn.id);
  assert(orderDetails.order.id === draftDineIn.id, 'Returned order matches requested ID');
  assert(orderDetails.items.length === 2, 'Returned exactly 2 items');

  const espressoItem = orderDetails.items.find((i) => i.product_id === productEspresso.id);
  assert(!!espressoItem, 'Espresso item found in details');
  assert(espressoItem?.unit_price === 3500, 'Espresso item unit_price matches 3500');
  assert(espressoItem?.quantity === 2, 'Espresso item quantity matches 2');
  assert(espressoItem?.total === 7000, 'Espresso item line total is 7000');
  assert(espressoItem?.product_name_snapshot === 'إسبريسو سينجل', 'Snapshot name matches catalog item');

  // Non-existent order
  let notFoundCaught = false;
  try {
    await orderService.getOrderWithDetails(cashierUser, 'non-existent-order-id');
  } catch (err: any) {
    notFoundCaught = err instanceof NotFoundError;
  }
  assert(notFoundCaught, 'getOrderWithDetails throws NotFoundError for non-existent order');

  console.log('\n--- Test Group 4: Updating Pending Order & Snapshot Protection ---');

  // Simulate catalog price modification in background:
  // Espresso price is raised in the catalog from 35.00 EGP (3500) to 50.00 EGP (5000)
  await productRepo.update(productEspresso.id, { price: 5000 });
  const updatedCatalogEspresso = await productRepo.findById(productEspresso.id);
  assert(updatedCatalogEspresso?.price === 5000, 'Catalog price for Espresso successfully increased to 5000');

  // Now, the cashier edits the pending order:
  // Keeps Espresso (quantity changed from 2 to 3), removes Cappuccino, and adds Croissant (quantity 1).
  // CRITICAL RULE: The existing Espresso item MUST RETAIN its historical unit_price (3500), NOT the new catalog price (5000)!
  const updatedOrderRes = await orderService.updatePendingOrder(cashierUser, draftDineIn.id, {
    order_type: OrderType.DINE_IN,
    table_number: 'طاولة 12',
    notes: 'تم تعديل الطلب بناء على رغبة العميل',
    items: [
      { productId: productEspresso.id, quantity: 3, notes: 'زيادة واحد' }, // 3 * 3500 = 10500 (SNAPSHOT PRESERVED!)
      { productId: productCroissant.id, quantity: 1, notes: null }, // 1 * 4500 = 4500 (new item gets current price)
    ],
  });

  assert(updatedOrderRes.order.id === draftDineIn.id, 'Order ID remained EXACTLY the same (no duplicate created)');
  assert(updatedOrderRes.order.order_number === draftDineIn.order_number, 'Order number preserved');
  assert(updatedOrderRes.order.notes === 'تم تعديل الطلب بناء على رغبة العميل', 'Order notes updated');

  // Expected subtotal: 3 * 3500 (preserved) + 1 * 4500 (new) = 10500 + 4500 = 15000 minor units
  assert(
    updatedOrderRes.order.subtotal === 15000,
    `Subtotal accurately calculated with preserved snapshot: ${updatedOrderRes.order.subtotal} (expected 15000)`
  );
  assert(
    updatedOrderRes.order.total === 15000,
    `Total accurately calculated: ${updatedOrderRes.order.total} (expected 15000)`
  );

  // Inspect database items to verify snapshot retention
  const freshItems = await orderItemRepo.listByOrderId(draftDineIn.id);
  assert(freshItems.length === 2, 'Fresh items count in DB is exactly 2');

  const freshEspresso = freshItems.find((i) => i.product_id === productEspresso.id);
  assert(freshEspresso?.quantity === 3, 'Espresso quantity updated to 3');
  assert(
    freshEspresso?.unit_price === 3500,
    `CRITICAL SNAPSHOT INTEGRITY: Existing item unit_price retained as 3500 despite catalog price being 5000!`
  );

  const freshCroissant = freshItems.find((i) => i.product_id === productCroissant.id);
  assert(freshCroissant?.unit_price === 4500, 'New Croissant item received current catalog price 4500');

  // Check audit log
  const recentLogs = await auditRepo.listRecent(50);
  const updateLog = recentLogs.find(
    (l) => l.action === 'ORDER_UPDATED' && l.entity_id === draftDineIn.id
  );
  assert(!!updateLog, 'Audit log created for ORDER_UPDATED');

  console.log('\n--- Test Group 5: Table Conflict Detection during Update ---');

  // Order 3 at Table 08
  const { order: orderAtTable08 } = await orderService.createDraft(cashierUser, {
    order_type: OrderType.DINE_IN,
    table_number: 'طاولة 08',
    items: [{ productId: productCroissant.id, quantity: 1 }],
  });

  // Attempt to update draftDineIn to Table 08 (which is occupied by orderAtTable08)
  let tableConflictCaught = false;
  try {
    await orderService.updatePendingOrder(cashierUser, draftDineIn.id, {
      order_type: OrderType.DINE_IN,
      table_number: 'طاولة 08',
      items: [{ productId: productCroissant.id, quantity: 1 }],
    });
  } catch (err: any) {
    tableConflictCaught = err instanceof ValidationError && err.message.includes('مشغولة');
  }
  assert(tableConflictCaught, 'updatePendingOrder prevents transferring to an already occupied table');

  console.log('\n--- Test Group 6: Soft Cancel Order & Table Release ---');

  // Cancel orderAtTable08
  const cancelResult = await orderService.cancelDraftOrder(
    cashierUser,
    orderAtTable08.id,
    'العميل غادر الصالة قبل استلام الطلب'
  );
  assert(cancelResult.status === OrderStatus.CANCELLED, 'Order status changed to CANCELLED');

  // Verify order is still present in database (NOT HARD DELETED!)
  const canceledOrderInDb = await orderRepo.findById(orderAtTable08.id);
  assert(!!canceledOrderInDb, 'NO HARD DELETE: Canceled order remains safely in the orders table');
  assert(canceledOrderInDb?.status === OrderStatus.CANCELLED, 'Canceled order status in DB is CANCELLED');

  // Verify Table 08 is now released / unoccupied
  const occupiedAfterCancel = await orderService.listOccupiedTables();
  const table08StillOccupied = occupiedAfterCancel.some((t) => t.table_number === 'طاولة 08');
  assert(!table08StillOccupied, 'Table 08 was released immediately upon order cancellation');

  // Verify audit log for cancellation
  const cancelAudit = await auditRepo.listRecent(50);
  const cancelLog = cancelAudit.find(
    (l) => l.action === 'ORDER_CANCELLED' && l.entity_id === orderAtTable08.id
  );
  assert(!!cancelLog, 'Audit log created for ORDER_CANCELLED');
  assert(
    cancelLog?.details_json?.includes('العميل غادر') ?? false,
    'Audit log contains cancellation reason'
  );

  console.log('\n--- Test Group 7: Integrity Constraints on Non-Pending Orders ---');

  // Mark an order as COMPLETED in repository to simulate a completed payment
  await orderRepo.updateStatus(draftDelivery.id, OrderStatus.COMPLETED);

  // Attempt to update completed order -> must be rejected!
  let updateCompletedRejected = false;
  try {
    await orderService.updatePendingOrder(cashierUser, draftDelivery.id, {
      order_type: OrderType.DELIVERY,
      items: [{ productId: productEspresso.id, quantity: 1 }],
    });
  } catch (err: any) {
    updateCompletedRejected = err instanceof ValidationError;
  }
  assert(updateCompletedRejected, 'updatePendingOrder strictly rejects updating COMPLETED orders');

  // Attempt to cancel completed order -> must be rejected!
  let cancelCompletedRejected = false;
  try {
    await orderService.cancelDraftOrder(cashierUser, draftDelivery.id, 'محاولة إلغاء');
  } catch (err: any) {
    cancelCompletedRejected = err instanceof ValidationError;
  }
  assert(cancelCompletedRejected, 'cancelDraftOrder strictly rejects cancelling COMPLETED orders');

  console.log('\n--- Test Group 8: RBAC Permissions Enforcement ---');

  let viewDenied = false;
  try {
    await orderService.listOrders(unauthorizedUser);
  } catch (err: any) {
    viewDenied = err instanceof UnauthorizedError;
  }
  assert(viewDenied, 'User without permissions cannot view orders list');

  let updateDenied = false;
  try {
    await orderService.updatePendingOrder(unauthorizedUser, draftDineIn.id, {
      order_type: OrderType.DINE_IN,
      table_number: 'طاولة 12',
      items: [{ productId: productCroissant.id, quantity: 1 }],
    });
  } catch (err: any) {
    updateDenied = err instanceof UnauthorizedError;
  }
  assert(updateDenied, 'User without permissions cannot update pending orders');

  let cancelDenied = false;
  try {
    await orderService.cancelDraftOrder(unauthorizedUser, draftDineIn.id, 'سبب');
  } catch (err: any) {
    cancelDenied = err instanceof UnauthorizedError;
  }
  assert(cancelDenied, 'User without cancel permissions cannot cancel orders');

  console.log('\n======================================================');
  console.log(`  Phase 6 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOrdersManagementTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
