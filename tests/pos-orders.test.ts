/**
 * NASAQ POS — Comprehensive POS & Order Cart Test Suite (Phase 5)
 * Verifies cart arithmetic, integer minor unit integrity, order draft creation,
 * product snapshots, Dine-In table linking, Delivery customer linking,
 * RBAC authorization, and audit logging.
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
import { validateOrderDraft } from '../src/features/orders/validation';
import { calculateLineTotal, calculateCartTotals, CartItem } from '../src/domain/cart';
import { OrderType, RoleCode } from '../src/domain/enums';
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

async function runPOSTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('  NASAQ POS — Phase 5: POS & Order Cart Test Suite');
  console.log('======================================================\n');

  // Initialize DB in test environment
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

  // Setup Test Roles & Users
  const cashierRole = await roleRepo.findByCode('CASHIER');
  assert(!!cashierRole, 'Found seeded CASHIER role');

  const now = new Date().toISOString();
  const dbCashier = await userRepo.create({
    id: `u-cash-${Date.now()}`,
    username: `cashier_${Date.now()}`,
    name: 'كاشير مبيعات تجريبي',
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
      'shifts.open',
      'cash.view_balance',
      'customers.view',
      'customers.create',
    ],
  };

  const unauthorizedUser: AuthenticatedUser = {
    id: 'user-guest-pos',
    username: 'guest_user',
    name: 'مستخدم بدون صلاحيات كاشير',
    roleId: 'role-guest',
    roleCode: RoleCode.CASHIER,
    roleName: 'ضيف',
    permissions: ['orders.view'], // Does NOT have pos.create_order
  };

  // Setup Seed Data: Category & Products
  const testCat = await categoryRepo.create({
    id: `cat-pos-${Date.now()}`,
    name: 'مشروبات تجريبية',
    sort_order: 1,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  const activeProduct1 = await productRepo.create({
    id: `prod-latte-${Date.now()}`,
    category_id: testCat.id,
    name: 'كافيه لاتيه',
    barcode: `62210001-${Date.now()}`,
    price: 5500, // 55.00 EGP
    cost_price: 2500,
    unit: 'كوب',
    current_stock: 100,
    min_stock_alert: 10,
    track_stock: 1,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  const activeProduct2 = await productRepo.create({
    id: `prod-cake-${Date.now()}`,
    category_id: testCat.id,
    name: 'مولتن كيك شكولاتة',
    barcode: `62210002-${Date.now()}`,
    price: 7500, // 75.00 EGP
    cost_price: 3500,
    unit: 'قطعة',
    current_stock: 50,
    min_stock_alert: 5,
    track_stock: 1,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  const inactiveProduct = await productRepo.create({
    id: `prod-seasonal-${Date.now()}`,
    category_id: testCat.id,
    name: 'مشروب موسمي منتهي',
    barcode: `62210099-${Date.now()}`,
    price: 6000,
    cost_price: 3000,
    unit: 'كوب',
    current_stock: 0,
    min_stock_alert: 0,
    track_stock: 0,
    is_active: 0, // INACTIVE!
    created_at: now,
    updated_at: now,
  });

  // Open active test shift
  const testShift = await shiftRepo.create({
    id: `shift-pos-${Date.now()}`,
    shift_number: `SH-${Date.now()}`,
    user_id: cashierUser.id,
    opened_at: now,
    closed_at: null,
    opening_cash: 50000, // 500.00 EGP
    expected_cash: 50000,
    actual_cash: null,
    cash_difference: null,
    status: 'OPEN',
    notes: 'وردية اختبار نقطة البيع',
  });

  console.log('--- Test Group 1: Domain Cart & Minor Unit Arithmetic ---');

  // 1.1 calculateLineTotal valid
  const line1 = calculateLineTotal(2, 5500);
  assert(line1 === 11000, 'calculateLineTotal(2, 5500) = 11000 minor units (110.00 EGP)');

  // 1.2 calculateLineTotal zero or negative quantity rejected
  try {
    calculateLineTotal(0, 5500);
    assert(false, 'Should reject 0 quantity');
  } catch (err: any) {
    assert(err.message.includes('أكبر من صفر'), 'calculateLineTotal rejects zero quantity');
  }

  try {
    calculateLineTotal(-3, 5500);
    assert(false, 'Should reject negative quantity');
  } catch (err: any) {
    assert(err.message.includes('أكبر من صفر'), 'calculateLineTotal rejects negative quantity');
  }

  // 1.3 calculateLineTotal decimal rejected
  try {
    calculateLineTotal(1.5, 5500);
    assert(false, 'Should reject decimal quantity');
  } catch (err: any) {
    assert(err.message.includes('رقماً صحيحاً'), 'calculateLineTotal rejects non-integer quantity');
  }

  // 1.4 Cart Totals Takeaway
  const cartItems: CartItem[] = [
    { productId: activeProduct1.id, productName: activeProduct1.name, unitPriceMinor: 5500, quantity: 2 },
    { productId: activeProduct2.id, productName: activeProduct2.name, unitPriceMinor: 7500, quantity: 1 },
  ];
  const takeawayTotals = calculateCartTotals(cartItems, OrderType.TAKEAWAY);
  assert(takeawayTotals.subtotalMinor === 18500, 'Subtotal: 2*5500 + 1*7500 = 18500 (185.00 EGP)');
  assert(takeawayTotals.deliveryFeeMinor === 0, 'Takeaway delivery fee is 0');
  assert(takeawayTotals.totalMinor === 18500, 'Takeaway total equals subtotal');
  assert(takeawayTotals.itemsCount === 2, 'Distinct items count is 2');
  assert(takeawayTotals.unitsCount === 3, 'Total units count is 3 (2+1)');

  // 1.5 Cart Totals Delivery with Delivery Fee & Discount
  const deliveryTotals = calculateCartTotals(cartItems, OrderType.DELIVERY, {
    deliveryFeeMinor: 2000, // 20.00 EGP
    discountMinor: 1500,    // 15.00 EGP
  });
  assert(deliveryTotals.deliveryFeeMinor === 2000, 'Delivery fee applied correctly: 2000');
  assert(deliveryTotals.discountMinor === 1500, 'Discount applied correctly: 1500');
  assert(deliveryTotals.totalMinor === 19000, 'Total: 18500 + 2000 - 1500 = 19000 minor units (190.00 EGP)');

  console.log('\n--- Test Group 2: Order Draft Validation Layer ---');

  // 2.1 Empty Cart Validation
  try {
    validateOrderDraft({
      order_type: 'TAKEAWAY',
      items: [],
    });
    assert(false, 'Should reject empty items array');
  } catch (err) {
    assert(err instanceof ValidationError, 'Rejects empty items with ValidationError');
  }

  // 2.2 Dine-In Missing Table Validation
  try {
    validateOrderDraft({
      order_type: 'DINE_IN',
      table_number: '',
      items: [{ productId: activeProduct1.id, quantity: 1 }],
    });
    assert(false, 'Should reject Dine-In without table number');
  } catch (err: any) {
    assert(err instanceof ValidationError, 'Rejects Dine-In without table number with ValidationError');
    assert(err.message.includes('الطاولة إلزامي'), 'Specifies table requirement in Arabic');
  }

  // 2.3 Delivery Missing Customer Info Validation
  try {
    validateOrderDraft({
      order_type: 'DELIVERY',
      customer_name: '',
      customer_phone: '',
      items: [{ productId: activeProduct1.id, quantity: 1 }],
    });
    assert(false, 'Should reject Delivery without customer');
  } catch (err: any) {
    assert(err instanceof ValidationError, 'Rejects Delivery without customer details with ValidationError');
    assert(err.message.includes('بيانات العميل'), 'Specifies customer requirement in Arabic');
  }

  // 2.4 Valid Takeaway Draft
  const validTakeaway = validateOrderDraft({
    order_type: 'TAKEAWAY',
    items: [{ productId: activeProduct1.id, quantity: 2 }],
  });
  assert(validTakeaway.order_type === 'TAKEAWAY', 'Valid Takeaway DTO parsed successfully');
  assert(validTakeaway.items.length === 1, 'Contains 1 item');

  console.log('\n--- Test Group 3: OrderService Draft Creation & DB Persistence ---');

  // 3.1 Create Takeaway Draft Order in DB
  const { order: draft1, items: items1 } = await orderService.createDraft(cashierUser, {
    order_type: 'TAKEAWAY',
    items: [
      { productId: activeProduct1.id, quantity: 2 },
      { productId: activeProduct2.id, quantity: 1, notes: 'بدون سكر إضافي' },
    ],
    notes: 'طلب عميل سريع',
  });

  assert(draft1.id.startsWith('ord-'), 'Draft order assigned UUID');
  assert(draft1.order_type === 'TAKEAWAY', 'Order type is TAKEAWAY');
  assert(draft1.status === 'PENDING', 'Order status is PENDING (Draft)');
  assert(draft1.subtotal === 18500, 'Order subtotal is exactly 18500 minor units');
  assert(draft1.total === 18500, 'Order total is exactly 18500 minor units');
  assert(items1.length === 2, 'Two snapshot items inserted into order_items');
  assert(items1[1].notes === 'بدون سكر إضافي', 'Item note persisted');

  // Verify directly in DB
  const orderFromDb = await orderRepo.findById(draft1.id);
  assert(orderFromDb !== null, 'Order found directly in orders table');
  assert(orderFromDb?.shift_id === testShift.id, 'Linked to the active cashier shift');

  const itemsFromDb = await orderItemRepo.listByOrderId(draft1.id);
  assert(itemsFromDb.length === 2, 'Two items found directly in order_items table');

  // 3.2 Create Dine-In Draft Order with Table
  const { order: dineInDraft } = await orderService.createDraft(cashierUser, {
    order_type: 'DINE_IN',
    table_number: 'طاولة 04',
    items: [{ productId: activeProduct1.id, quantity: 3 }],
  });

  assert(dineInDraft.order_type === 'DINE_IN', 'Dine-In order type set');
  assert(dineInDraft.table_number === 'طاولة 04', 'Table number correctly linked');
  assert(dineInDraft.total === 16500, 'Total is 3 * 5500 = 16500 minor units');

  // Verify occupied tables list
  const occupiedTables = await orderService.listOccupiedTables();
  const foundTable = occupiedTables.find((t) => t.table_number === 'طاولة 04');
  assert(foundTable !== undefined, 'Occupied tables query includes طاولة 04');
  assert(foundTable?.total === 16500, 'Occupied table reflects order total');

  // 3.3 Create Delivery Draft Order with Customer
  const { order: deliveryDraft } = await orderService.createDraft(cashierUser, {
    order_type: 'DELIVERY',
    customer_name: 'عمر شريف',
    customer_phone: '01200001122',
    customer_address: 'المعادي شارع 9',
    delivery_fee: 2500, // 25.00 EGP
    items: [{ productId: activeProduct2.id, quantity: 2 }], // 2 * 7500 = 15000
  });

  assert(deliveryDraft.order_type === 'DELIVERY', 'Delivery order created');
  assert(deliveryDraft.delivery_fee === 2500, 'Delivery fee 2500 minor units saved');
  assert(deliveryDraft.subtotal === 15000, 'Subtotal 15000 saved');
  assert(deliveryDraft.total === 17500, 'Grand total = 15000 + 2500 = 17500 minor units');

  // Verify customer was created/linked in customers table
  assert(deliveryDraft.customer_id !== null, 'Customer ID was linked to delivery order');
  const savedCustomer = await customerRepo.findById(deliveryDraft.customer_id!);
  assert(savedCustomer?.phone === '01200001122', 'Customer record was persisted with matching phone');
  assert(savedCustomer?.name === 'عمر شريف', 'Customer record has matching name');

  console.log('\n--- Test Group 4: Historical Product Snapshot Integrity ---');

  // 4.1 Product snapshot is frozen at order creation time
  const targetItem = items1.find((i) => i.product_id === activeProduct1.id);
  assert(targetItem !== undefined, 'Found snapshot item for activeProduct1');
  assert(targetItem?.product_name_snapshot === 'كافيه لاتيه', 'Product name snapshot matches: كافيه لاتيه');
  assert(targetItem?.unit_price === 5500, 'Unit price snapshot matches original: 5500');

  // 4.2 Alter the product in catalog (e.g. price hike from 5500 to 9000, and rename)
  await productRepo.update(activeProduct1.id, {
    name: 'كافيه لاتيه كبير معدل',
    price: 9000,
  });

  // Re-fetch the previously created order and items from DB
  const { order: reFetchedOrder, items: reFetchedItems } = await orderService.getOrderById(draft1.id);
  const reFetchedItem = reFetchedItems.find((i) => i.product_id === activeProduct1.id);

  assert(
    reFetchedItem?.product_name_snapshot === 'كافيه لاتيه',
    'IMMUTABLE: Product name snapshot remains "كافيه لاتيه" despite catalog update'
  );
  assert(
    reFetchedItem?.unit_price === 5500,
    'IMMUTABLE: Order item unit price remains 5500 despite catalog price increase'
  );
  assert(
    reFetchedOrder.total === 18500,
    'IMMUTABLE: Order total remains 18500 unaffected by subsequent catalog price hikes'
  );

  console.log('\n--- Test Group 5: Stale & Inactive Product Concurrency Check ---');

  // 5.1 Inactive Product in Cart is Rejected
  try {
    await orderService.createDraft(cashierUser, {
      order_type: 'TAKEAWAY',
      items: [{ productId: inactiveProduct.id, quantity: 1 }],
    });
    assert(false, 'Should reject order with inactive product');
  } catch (err: any) {
    assert(err instanceof ValidationError, 'Throws ValidationError for inactive product');
    assert(err.message.includes('غير متاح حالياً للطلب'), 'Arabic error explaining item is inactive');
  }

  // 5.2 Non-existent Product ID is Rejected
  try {
    await orderService.createDraft(cashierUser, {
      order_type: 'TAKEAWAY',
      items: [{ productId: 'prod-does-not-exist', quantity: 1 }],
    });
    assert(false, 'Should reject non-existent product');
  } catch (err: any) {
    assert(err instanceof ValidationError, 'Throws ValidationError for non-existent product');
    assert(err.message.includes('غير موجود بالنظام'), 'Arabic error explaining item does not exist');
  }

  console.log('\n--- Test Group 6: RBAC Authorization & Audit Logging ---');

  // 6.1 Unauthorized User Blocked
  try {
    await orderService.createDraft(unauthorizedUser, {
      order_type: 'TAKEAWAY',
      items: [{ productId: activeProduct2.id, quantity: 1 }],
    });
    assert(false, 'Should block user without pos.create_order permission');
  } catch (err) {
    assert(err instanceof UnauthorizedError, 'Throws UnauthorizedError for unauthorized user');
  }

  // 6.2 Audit Log Recorded for Draft Creation
  const auditLogs = await auditRepo.listRecent(10);
  const draftAudit = auditLogs.find(
    (log) => log.action === 'ORDER_DRAFT_CREATED' && log.entity_id === draft1.id
  );
  assert(draftAudit !== undefined, 'Audit log recorded for ORDER_DRAFT_CREATED');
  assert(draftAudit?.user_id === cashierUser.id, 'Audit log records cashier user_id');
  const auditDetails = JSON.parse(draftAudit?.details_json || '{}');
  assert(auditDetails.order_type === 'TAKEAWAY', 'Audit details include order_type');
  assert(auditDetails.total_minor === 18500, 'Audit details include total_minor');

  // 6.3 Cancel Draft Order
  const cancelledOrder = await orderService.cancelDraftOrder(cashierUser, draft1.id, 'إلغاء بناء على رغبة الزبون');
  assert(cancelledOrder.status === 'CANCELLED', 'Order status updated to CANCELLED');

  const cancelAudit = (await auditRepo.listRecent(5)).find(
    (log) => log.action === 'ORDER_CANCELLED' && log.entity_id === draft1.id
  );
  assert(cancelAudit !== undefined, 'Audit log recorded for ORDER_CANCELLED');

  console.log('\n======================================================');
  console.log(`  Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPOSTests().catch((err) => {
  console.error('Fatal Test Failure:', err);
  process.exit(1);
});
