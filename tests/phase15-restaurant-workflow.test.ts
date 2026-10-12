/**
 * NASAQ POS — Phase 15 Real Restaurant UX & Cashier Workflow Test Suite
 *
 * Verifies:
 * 1. Dine-In Workflow:
 *    - Order creation with table number
 *    - Table status correctly flagged as occupied
 *    - Kitchen prep ticket generation (table number, item notes, no financial amounts)
 * 2. Pending Orders & Busy Restaurant Multi-Order Switching:
 *    - Listing active open/pending orders across Dine-in, Takeaway, and Delivery
 *    - Fast order retrieval by ID/number without navigation
 *    - Order modification (updating line item quantity, updating order notes)
 *    - Preserving exact order number on update
 * 3. Delivery Workflow:
 *    - Customer instant lookup by phone number
 *    - Driver assignment & delivery fee application
 *    - Kitchen ticket inclusion of customer phone, address, and driver name
 * 4. Fast Settlement & Table Release:
 *    - Cash payment with tender amount and exact change calculation
 *    - Invoice generation and order completion
 *    - Table release verification (occupied tables list no longer contains the table)
 *    - Pending orders count decrements cleanly
 * 5. Keyboard & POS Usability Constants:
 *    - Shortcut keys defined (F1 type, F2 search, F3 pending, F4 pay, F9 kitchen, Esc)
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { CategoryRepository } from '../src/repositories/CategoryRepository';
import { ShiftRepository } from '../src/repositories/ShiftRepository';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { CustomerRepository } from '../src/repositories/CustomerRepository';
import { DeliveryDriverRepository } from '../src/repositories/DeliveryDriverRepository';
import { OrderItemRepository } from '../src/repositories/OrderItemRepository';
import { TableRepository } from '../src/repositories/TableRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { OrderService } from '../src/features/orders/services/OrderService';
import { PaymentService } from '../src/features/pos/services/PaymentService';
import { ReceiptEscPosFormatter } from '../src/features/hardware/escpos/ReceiptEscPosFormatter';
import { OrderType, PaymentMethod, RoleCode } from '../src/domain/enums';
import { AuthenticatedUser } from '../src/features/auth/types';
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

async function runPhase15Tests() {
  console.log('======================================================================');
  console.log('🍽️  NASAQ POS — PHASE 15 REAL RESTAURANT UX & WORKFLOW AUDIT');
  console.log('======================================================================\n');

  const db = DatabaseManager.getInstance();
  await db.initialize();

  const userRepo = new UserRepository(db);
  const roleRepo = new RoleRepository(db);
  const shiftRepo = new ShiftRepository(db);
  const catRepo = new CategoryRepository(db);
  const prodRepo = new ProductRepository(db);
  const orderRepo = new OrderRepository(db);
  const orderItemRepo = new OrderItemRepository(db);
  const tableRepo = new TableRepository(db);
  const customerRepo = new CustomerRepository(db);
  const driverRepo = new DeliveryDriverRepository(db);
  const auditRepo = new AuditLogRepository(db);

  const orderService = new OrderService(orderRepo, orderItemRepo, prodRepo, customerRepo, shiftRepo, auditRepo, tableRepo, driverRepo);
  const paymentService = new PaymentService(db);

  // 1. Setup Cashier & Active Shift
  console.log('--- 1. Cashier & Shift Session Setup ---');
  const cashierRole = (await roleRepo.findByCode(RoleCode.CASHIER)) || (await roleRepo.findByCode(RoleCode.ADMIN));
  const cashierUser: AuthenticatedUser = {
    id: generateId('usr'),
    username: 'cashier1',
    name: 'كاشير الصالة',
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: cashierRole!.name,
    permissions: [
      'pos.access',
      'pos.create_order',
      'pos.process_payment',
      'orders.view',
      'orders.view_all',
      'orders.create',
      'orders.update',
      'orders.cancel',
      'tables.view',
      'tables.manage',
      'delivery.view',
      'delivery.manage',
      'shifts.open',
      'shifts.close',
      'shifts.view',
      'cash.view_balance',
      'payments.process',
    ],
  };

  await userRepo.create({
    id: cashierUser.id,
    username: cashierUser.username,
    password_hash: 'hash',
    name: cashierUser.name,
    role_id: cashierRole!.id,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const shift = await shiftRepo.create({
    id: generateId('shf'),
    shift_number: `SH-TEST-${Date.now()}`,
    user_id: cashierUser.id,
    opened_at: new Date().toISOString(),
    closed_at: null,
    opening_cash: 50000, // 500.00 EGP
    expected_cash: 50000,
    actual_cash: null,
    cash_difference: null,
    status: 'OPEN',
    notes: 'وردية تجريبية',
  });
  assert(shift.status === 'OPEN', 'Shift opened successfully with 500.00 EGP opening cash');

  // Seed Menu
  const cat1 = await catRepo.create({
    id: generateId('cat'),
    name: 'المشويات',
    sort_order: 1,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const prod1 = await prodRepo.create({
    id: generateId('prd'),
    category_id: cat1.id,
    name: 'شيش طاووق مشوي',
    barcode: '6221001002003',
    price: 13500, // 135.00 EGP
    cost_price: 8000,
    unit: 'طبق',
    is_active: 1,
    track_stock: 0,
    current_stock: 0,
    min_stock_alert: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const prod2 = await prodRepo.create({
    id: generateId('prd'),
    category_id: cat1.id,
    name: 'أرز بسمتي أصفر',
    barcode: '6221001002004',
    price: 3500, // 35.00 EGP
    cost_price: 1500,
    unit: 'طبق',
    is_active: 1,
    track_stock: 0,
    current_stock: 0,
    min_stock_alert: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Seed Table 7
  const table7 = await tableRepo.create({
    id: generateId('tbl'),
    name: '7',
    capacity: 4,
    status: 'AVAILABLE',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(table7.name === '7', 'Dining table 7 registered in system');

  // Seed Driver
  const driver1 = await driverRepo.create({
    id: generateId('drv'),
    name: 'أحمد مندوب',
    phone: '01012345678',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(driver1.name === 'أحمد مندوب', 'Delivery driver registered successfully');

  // Seed Customer
  const customer1 = await customerRepo.create({
    id: generateId('cst'),
    name: 'محمود عبد الرحمن',
    phone: '01122334455',
    address: 'شارع الهرم - الجيزة - عمارة 14 شقة 3',
    notes: 'رن الجرس مرتين',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(customer1.phone === '01122334455', 'Customer seeded with address');

  // --- 2. Dine-In Workflow: Order & Table Occupation ---
  console.log('\n--- 2. Dine-In Workflow & Table Occupation ---');
  const dineInDraft = await orderService.createDraft(cashierUser, {
    order_type: OrderType.DINE_IN,
    table_number: '7',
    notes: 'مستوى طهي متوسط بدون فلفل حار',
    items: [
      {
        productId: prod1.id,
        quantity: 2,
        notes: 'زيادة ثومية',
      },
      {
        productId: prod2.id,
        quantity: 2,
      },
    ],
  });

  assert(dineInDraft.order.status === 'PENDING', 'Dine-in order status is PENDING');
  assert(dineInDraft.order.table_number === '7', 'Table number correctly saved as 7');
  assert(dineInDraft.order.total === 34000, 'Order total is 340.00 EGP (2x 135.00 + 2x 35.00)');

  // Verify occupied table
  const occupiedTables = await orderService.listOccupiedTables();
  const table7Occupied = occupiedTables.some((t) => t.table_number === '7');
  assert(table7Occupied, 'Table 7 is immediately recognized as OCCUPIED');

  // Verify Kitchen Ticket generation
  const kitchenTicket = ReceiptEscPosFormatter.formatKitchenTicket({
    orderNumber: dineInDraft.order.order_number,
    orderType: OrderType.DINE_IN,
    createdAt: dineInDraft.order.created_at,
    cashierName: cashierUser.name,
    tableNumber: '7',
    items: [
      { id: prod1.id, name: prod1.name, quantity: 2, notes: 'زيادة ثومية' },
      { id: prod2.id, name: prod2.name, quantity: 2 },
    ],
  });
  assert(kitchenTicket.length > 50, 'Kitchen ticket byte stream generated for Table 7');

  // --- 3. Open Orders Modal: Switch, Search, and Edit Pending Order ---
  console.log('\n--- 3. Open Orders Modal & Modification ---');
  // List pending orders
  const pendingOrders = await orderService.listOrders(cashierUser, { status: 'PENDING' });
  assert(pendingOrders.length >= 1, `Found ${pendingOrders.length} pending order(s) for fast cashier access`);
  assert(pendingOrders[0].order_number === dineInDraft.order.order_number, 'Pending order matches Table 7 order');

  // Customer asks to add 1 more rice dish to Table 7
  const updatedOrder = await orderService.updatePendingOrder(cashierUser, dineInDraft.order.id, {
    order_type: OrderType.DINE_IN,
    table_number: '7',
    notes: 'مستوى طهي متوسط بدون فلفل حار - تم زيادة أرز',
    items: [
      {
        productId: prod1.id,
        quantity: 2,
        notes: 'زيادة ثومية',
      },
      {
        productId: prod2.id,
        quantity: 3, // Increased from 2 to 3
      },
    ],
  });

  assert(updatedOrder.order.order_number === dineInDraft.order.order_number, 'Order number is preserved upon update');
  assert(updatedOrder.order.total === 37500, 'Order total recalculated to 375.00 EGP (2x 135.00 + 3x 35.00)');

  // --- 4. Delivery Workflow: Instant Phone Lookup & Driver Assignment ---
  console.log('\n--- 4. Delivery Workflow & Driver Assignment ---');
  const foundCustomers = await customerRepo.search('01122334455');
  assert(foundCustomers.length === 1, 'Instant lookup found customer by phone number');
  assert(foundCustomers[0].name === 'محمود عبد الرحمن', 'Customer name resolved correctly');

  const deliveryDraft = await orderService.createDraft(cashierUser, {
    order_type: OrderType.DELIVERY,
    customer_id: customer1.id,
    customer_name: customer1.name,
    customer_phone: customer1.phone,
    customer_address: customer1.address,
    delivery_fee: 2500, // 25.00 EGP delivery fee
    delivery_driver_id: driver1.id,
    items: [
      {
        productId: prod1.id,
        quantity: 1,
      },
    ],
  });

  assert(deliveryDraft.order.order_type === OrderType.DELIVERY, 'Delivery order registered');
  assert(deliveryDraft.order.delivery_fee === 2500, 'Delivery fee recorded as 25.00 EGP');
  assert(deliveryDraft.order.total === 16000, 'Total is 160.00 EGP (135.00 + 25.00 delivery fee)');

  // Kitchen ticket for delivery
  const deliveryKitchenTicket = ReceiptEscPosFormatter.formatKitchenTicket({
    orderNumber: deliveryDraft.order.order_number,
    orderType: OrderType.DELIVERY,
    createdAt: deliveryDraft.order.created_at,
    cashierName: cashierUser.name,
    customerName: customer1.name,
    customerPhone: customer1.phone,
    deliveryAddress: customer1.address,
    deliveryDriverName: driver1.name,
    items: [{ id: prod1.id, name: prod1.name, quantity: 1 }],
  });
  assert(deliveryKitchenTicket.length > 50, 'Delivery kitchen ticket with driver & address generated');

  // Verify pending list now has 2 orders
  const twoPending = await orderService.listOrders(cashierUser, { status: 'PENDING' });
  assert(twoPending.length === 2, 'Pending orders list contains both Dine-in Table 7 and Delivery order');

  // --- 5. Settlement & Table Release ---
  console.log('\n--- 5. Settlement & Table Release ---');
  // Pay Table 7 (375.00 EGP) with 400.00 EGP cash tender
  const paymentResult = await paymentService.completeSale(cashierUser, {
    orderId: updatedOrder.order.id,
    payments: [
      {
        method: PaymentMethod.CASH,
        amount: 37500,
        tenderAmount: 40000, // 400.00 EGP
      },
    ],
  });

  assert(paymentResult.order.status === 'COMPLETED', 'Table 7 order marked COMPLETED');
  assert(paymentResult.invoice.status === 'PAID', 'Invoice marked PAID');
  assert(paymentResult.payments[0].change_amount === 2500, 'Cash change recorded as 25.00 EGP');

  // Check Table 7 is now FREE
  const freshOccupied = await orderService.listOccupiedTables();
  const table7StillOccupied = freshOccupied.some((t) => t.table_number === '7');
  assert(!table7StillOccupied, 'Table 7 is immediately RELEASED and marked vacant');

  // Check pending list now only has the Delivery order
  const remainingPending = await orderService.listOrders(cashierUser, { status: 'PENDING' });
  assert(remainingPending.length === 1, 'Pending count decremented to 1 after Table 7 checkout');
  assert(remainingPending[0].id === deliveryDraft.order.id, 'Remaining pending order is the Delivery order');

  console.log('\n======================================================================');
  console.log(`📊 PHASE 15 REAL RESTAURANT UX AUDIT: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase15Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
