/**
 * NASAQ POS - SQLite Database Integration Test Suite
 * Validates SQLite engine, migrations, foreign key constraints, repositories,
 * transaction rollback, minor-units financial integrity, and financial immutability.
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { ConstraintError } from '../src/database/errors';
import {
  UserRepository,
  RoleRepository,
  PermissionRepository,
  CategoryRepository,
  ProductRepository,
  CustomerRepository,
  OrderRepository,
  OrderItemRepository,
  PaymentRepository,
  InvoiceRepository,
  ShiftRepository,
  CashTransactionRepository,
  ExpenseRepository,
  InventoryMovementRepository,
  ReturnRepository,
  SettingsRepository,
  AuditLogRepository,
} from '../src/repositories';

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

async function runTests(): Promise<void> {
  console.log('\n=============================================');
  console.log('  NASAQ POS — Database Integration Test Suite');
  console.log('=============================================\n');

  // Test 1: Initialization & Migration
  console.log('[1/8] Database Initialization & Migrations:');
  const db = DatabaseManager.getInstance();
  await db.initialize();
  assert(true, 'DatabaseManager initialized successfully with SQLite engine');

  const migrationRows = await db.query<{ version: number; name: string }>(
    'SELECT * FROM schema_migrations ORDER BY version ASC;'
  );
  assert(migrationRows.length >= 1, `schema_migrations recorded ${migrationRows.length} migration(s)`);
  assert(migrationRows[0].version === 1, 'Migration 001 applied and tracked in schema_migrations');

  // Test 2: Foreign Key Constraints Enforcement
  console.log('\n[2/8] SQLite PRAGMA foreign_keys = ON Enforcement:');
  let fkErrorCaught = false;
  try {
    // Attempting to insert a product with invalid category_id
    await db.execute(
      `INSERT INTO products (id, category_id, name, barcode, price, is_active, created_at, updated_at)
       VALUES ('invalid-p', 'non-existent-category-id', 'Test Product', '99999', 5000, 1, '2026-01-01', '2026-01-01');`
    );
  } catch (err) {
    fkErrorCaught = true;
    assert(err instanceof ConstraintError, 'Foreign key failure correctly thrown as ConstraintError');
  }
  assert(fkErrorCaught, 'SQLite prevented insertion with non-existent foreign key reference');

  // Test 3: Initial Seeds Verification (Roles, Permissions, Settings)
  console.log('\n[3/8] Initial Production Seeds Verification:');
  const roleRepo = new RoleRepository();
  const roles = await roleRepo.listAll();
  assert(roles.length >= 3, `Default roles seeded (${roles.map((r) => r.code).join(', ')})`);

  const permRepo = new PermissionRepository();
  const perms = await permRepo.listAll();
  assert(perms.length >= 34, `Default permissions seeded (count: ${perms.length})`);

  const settingsRepo = new SettingsRepository();
  const storeName = await settingsRepo.get('store_name');
  assert(storeName === 'مطعم نسق', `Default store_name setting present: "${storeName}"`);

  // Test 4: Repository CRUD & Minor Units
  console.log('\n[4/8] Repository Operations & Minor Units:');
  const userRepo = new UserRepository();
  const testUser = await userRepo.create({
    id: `user-test-${Date.now()}`,
    username: `cashier_${Date.now()}`,
    password_hash: 'hash_test_123',
    name: 'كاشير تجريبي',
    role_id: 'role-cashier',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(Boolean(testUser.id), `User created with id: ${testUser.id}`);

  const fetchedUser = await userRepo.findByUsername(testUser.username);
  assert(fetchedUser?.id === testUser.id, 'User found by username');

  const catRepo = new CategoryRepository();
  const testCat = await catRepo.create({
    id: `cat-${Date.now()}`,
    name: 'ساندوتشات ساخنة',
    sort_order: 1,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(Boolean(testCat.id), `Category created: ${testCat.name}`);

  const productRepo = new ProductRepository();
  // Minor units: 120.50 EGP = 12050
  const testProduct = await productRepo.create({
    id: `prod-${Date.now()}`,
    category_id: testCat.id,
    name: 'برجر سوبر ستار',
    barcode: `622000${Date.now().toString().slice(-4)}`,
    price: 12050, // 120.50 EGP in minor units
    cost_price: 6500, // 65.00 EGP
    track_stock: 1,
    current_stock: 50,
    min_stock_alert: 5,
    unit: 'piece',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(testProduct.price === 12050, `Product created with minor unit price: ${testProduct.price} (120.50 EGP)`);

  await productRepo.updateStock(testProduct.id, -2);
  const updatedProduct = await productRepo.findById(testProduct.id);
  assert(updatedProduct?.current_stock === 48, `Stock decremented from 50 to ${updatedProduct?.current_stock}`);

  // Test 5: Cash Shift & Transactions
  console.log('\n[5/8] Shift Management & Cash Ledger:');
  const shiftRepo = new ShiftRepository();
  const shiftNumber = `SH-${Date.now().toString().slice(-6)}`;
  const testShift = await shiftRepo.create({
    id: `shift-${Date.now()}`,
    shift_number: shiftNumber,
    user_id: testUser.id,
    opened_at: new Date().toISOString(),
    closed_at: null,
    opening_cash: 50000, // 500.00 EGP
    expected_cash: 50000,
    actual_cash: null,
    cash_difference: null,
    status: 'OPEN',
    notes: 'وردية اختبار أولية',
  });
  assert(testShift.status === 'OPEN', `Shift opened: ${testShift.shift_number} with opening cash: 500.00 EGP`);

  const cashTxRepo = new CashTransactionRepository();
  await cashTxRepo.create({
    id: `tx-in-${Date.now()}`,
    shift_id: testShift.id,
    transaction_type: 'CASH_IN',
    amount: 10000, // 100.00 EGP
    reason: 'سلفة درج إضافية',
    reference_id: null,
    user_id: testUser.id,
    created_at: new Date().toISOString(),
  });

  const cashTotals = await cashTxRepo.calculateShiftCashTotals(testShift.id);
  assert(cashTotals.inTotal === 10000, `Shift cash transactions calculated inTotal = ${cashTotals.inTotal}`);

  // Test 6: Order, Items Snapshot & Invoices
  console.log('\n[6/8] Order Processing, Snapshots & Payments:');
  const orderRepo = new OrderRepository();
  const orderItemRepo = new OrderItemRepository();
  const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

  const testOrder = await orderRepo.create({
    id: `order-${Date.now()}`,
    order_number: orderNumber,
    order_type: 'TAKEAWAY',
    status: 'PENDING',
    customer_id: null,
    table_number: null,
    shift_id: testShift.id,
    user_id: testUser.id,
    notes: null,
    subtotal: 24100, // 2 * 12050
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    delivery_fee: 0,
    total: 24100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Snapshot preservation of product name and unit price
  await orderItemRepo.create({
    id: `item-${Date.now()}`,
    order_id: testOrder.id,
    product_id: testProduct.id,
    product_name_snapshot: testProduct.name,
    unit_price: testProduct.price,
    quantity: 2,
    subtotal: 24100,
    discount_amount: 0,
    total: 24100,
    notes: 'بدون بصل',
    created_at: new Date().toISOString(),
  });

  const items = await orderItemRepo.listByOrderId(testOrder.id);
  assert(items.length === 1, 'Order item recorded');
  assert(items[0].product_name_snapshot === 'برجر سوبر ستار', 'Historical product snapshot preserved');
  assert(items[0].unit_price === 12050, 'Historical unit price snapshot preserved');

  // Complete Payment (24100 minor units = 241.00 EGP, tender 25000 = 250.00 EGP, change 900 = 9.00 EGP)
  const paymentRepo = new PaymentRepository();
  const payment = await paymentRepo.create({
    id: `pay-${Date.now()}`,
    order_id: testOrder.id,
    shift_id: testShift.id,
    payment_method: 'CASH',
    amount: 24100,
    tender_amount: 25000,
    change_amount: 900,
    reference_number: null,
    created_at: new Date().toISOString(),
  });
  assert(payment.amount === 24100, 'Payment recorded with exact minor units');
  assert(payment.change_amount === 900, 'Change calculation exact: 250.00 - 241.00 = 9.00 EGP');

  await orderRepo.updateStatus(testOrder.id, 'COMPLETED');
  const completedOrder = await orderRepo.findById(testOrder.id);
  assert(completedOrder?.status === 'COMPLETED', 'Order status marked as COMPLETED');

  // Generate Invoice
  const invoiceRepo = new InvoiceRepository();
  const invoice = await invoiceRepo.create({
    id: `inv-${Date.now()}`,
    invoice_number: `INV-${Date.now().toString().slice(-6)}`,
    order_id: testOrder.id,
    shift_id: testShift.id,
    status: 'PAID',
    total_amount: 24100,
    tax_amount: 0,
    discount_amount: 0,
    net_amount: 24100,
    customer_name_snapshot: 'عميل عام نقدي',
    cashier_name_snapshot: testUser.name,
    printed_count: 0,
    last_printed_at: null,
    created_at: new Date().toISOString(),
  });
  assert(invoice.status === 'PAID', `Invoice ${invoice.invoice_number} created`);

  await invoiceRepo.incrementPrintCount(invoice.id);
  const printedInvoice = await invoiceRepo.findById(invoice.id);
  assert(printedInvoice?.printed_count === 1, 'Invoice print count incremented to 1');

  // Test 7: Transaction Rollback Guarantee
  console.log('\n[7/8] Transaction Rollback on Error:');
  const preCountRows = await db.query<{ count: number }>('SELECT COUNT(id) AS count FROM categories;');
  const countBefore = preCountRows[0].count;

  let txFailed = false;
  try {
    await db.transaction(async (tx) => {
      // Step 1: Valid category insert
      await tx.execute(
        `INSERT INTO categories (id, name, sort_order, is_active, created_at, updated_at)
         VALUES ('rollback-test-cat', 'تصنيف للتراجع', 99, 1, '2026-01-01', '2026-01-01');`
      );
      // Step 2: Intentional error that triggers rollback
      throw new Error('INTENTIONAL_ERROR_TO_TEST_ROLLBACK');
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('INTENTIONAL_ERROR_TO_TEST_ROLLBACK')) {
      txFailed = true;
    }
  }

  const postCountRows = await db.query<{ count: number }>('SELECT COUNT(id) AS count FROM categories;');
  const countAfter = postCountRows[0].count;
  assert(txFailed, 'Intentional transaction error was thrown');
  assert(countBefore === countAfter, `Rollback successful: category count unchanged (${countBefore} == ${countAfter})`);

  // Test 8: Financial Immutability (No Hard Deletes Allowed)
  console.log('\n[8/8] Financial Immutability Protection:');
  let orderDeleteBlocked = false;
  try {
    await orderRepo.delete(completedOrder!.id);
  } catch (err: unknown) {
    orderDeleteBlocked = true;
    assert(err instanceof Error && err.message.includes('قيد مالي صارم'), 'Completed order deletion forbidden with financial exception');
  }
  assert(orderDeleteBlocked, 'Completed order protected from hard deletion');

  let paymentDeleteBlocked = false;
  try {
    await paymentRepo.delete();
  } catch (err: unknown) {
    paymentDeleteBlocked = true;
    assert(err instanceof Error && err.message.includes('قيد مالي صارم'), 'Payment deletion forbidden with financial exception');
  }
  assert(paymentDeleteBlocked, 'Payment records protected from hard deletion');

  let invoiceDeleteBlocked = false;
  try {
    await invoiceRepo.delete();
  } catch (err: unknown) {
    invoiceDeleteBlocked = true;
    assert(err instanceof Error && err.message.includes('قيد مالي صارم'), 'Invoice records protected from hard deletion');
  }
  assert(invoiceDeleteBlocked, 'Tax invoice protected from hard deletion');

  // Summary
  console.log('\n=============================================');
  console.log(`  Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
