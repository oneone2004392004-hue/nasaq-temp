/**
 * NASAQ POS — Phase 9: Cash Register & Shifts Comprehensive Test Suite
 *
 * Verifies:
 * 1. Open shift & Single active shift per cashier isolation
 * 2. Duplicate open shift prevention
 * 3. Opening balance validation (Integer minor units, non-negative)
 * 4. Cash sale recorded in cash ledger with exact net revenue (not tender)
 * 5. Card sale strictly excluded from cash drawer ledger & expected cash
 * 6. Split payment (only CASH portion enters cash ledger)
 * 7. Real-world financial ledger sequence:
 *    Opening (500) + Cash Sale (1000) + Deposit (300) - Expense (200) - Withdrawal (100) = Expected (1500)
 * 8. Cash overdraw protection (cannot withdraw or expense more than available cash)
 * 9. Shift closure, server-side variance calculation (Balanced, Shortage, Overage)
 * 10. Double close prevention & closed shift transaction rejection
 * 11. Cashier isolation & Managerial override
 * 12. Unauthorized RBAC action rejection
 * 13. Hard delete prevention on shifts and cash transactions
 * 14. Financial audit trail verification
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { ShiftRepository } from '../src/repositories/ShiftRepository';
import { CashTransactionRepository } from '../src/repositories/CashTransactionRepository';
import { ExpenseRepository } from '../src/repositories/ExpenseRepository';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { OrderItemRepository } from '../src/repositories/OrderItemRepository';
import { PaymentRepository } from '../src/repositories/PaymentRepository';
import { InvoiceRepository } from '../src/repositories/InvoiceRepository';
import { CustomerRepository } from '../src/repositories/CustomerRepository';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { CategoryRepository } from '../src/repositories/CategoryRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { ShiftService } from '../src/features/shifts/services/ShiftService';
import { CashRegisterService } from '../src/features/cash-register/services/CashRegisterService';
import { ExpenseService } from '../src/features/expenses/services/ExpenseService';
import { OrderService } from '../src/features/orders/services/OrderService';
import { PaymentService } from '../src/features/pos/services/PaymentService';
import { AuthenticatedUser } from '../src/features/auth/types';
import { RoleCode, ShiftStatus } from '../src/domain/enums';
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

async function runShiftsCashRegisterTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('🚀 NASAQ POS — PHASE 9: CASH REGISTER & SHIFTS TEST SUITE');
  console.log('======================================================\n');

  const db = DatabaseManager.getInstance();
  await db.initialize();

  const shiftRepo = new ShiftRepository(db);
  const cashTxRepo = new CashTransactionRepository(db);
  const expenseRepo = new ExpenseRepository(db);
  const userRepo = new UserRepository(db);
  const roleRepo = new RoleRepository(db);
  const orderRepo = new OrderRepository(db);
  const orderItemRepo = new OrderItemRepository(db);
  const paymentRepo = new PaymentRepository(db);
  const invoiceRepo = new InvoiceRepository(db);
  const customerRepo = new CustomerRepository(db);
  const productRepo = new ProductRepository(db);
  const categoryRepo = new CategoryRepository(db);
  const auditRepo = new AuditLogRepository(db);

  const shiftService = new ShiftService(
    db,
    shiftRepo,
    cashTxRepo,
    auditRepo,
    userRepo,
    orderRepo,
    paymentRepo,
    invoiceRepo
  );

  const cashRegisterService = new CashRegisterService(
    db,
    shiftRepo,
    cashTxRepo,
    auditRepo,
    userRepo
  );

  const expenseService = new ExpenseService(
    db,
    expenseRepo,
    shiftRepo,
    cashTxRepo,
    auditRepo
  );

  const orderService = new OrderService(
    orderRepo,
    orderItemRepo,
    productRepo,
    customerRepo,
    shiftRepo,
    auditRepo,
    db
  );

  const paymentService = new PaymentService(
    db,
    orderRepo,
    orderItemRepo,
    paymentRepo,
    invoiceRepo,
    shiftRepo,
    customerRepo,
    auditRepo,
    cashTxRepo
  );

  // Setup Test Users
  const cashierRole = await roleRepo.findByCode(RoleCode.CASHIER);
  const managerRole = await roleRepo.findByCode(RoleCode.MANAGER);
  const adminRole = await roleRepo.findByCode(RoleCode.ADMIN);

  assert(cashierRole !== null, 'Cashier role found');
  assert(managerRole !== null, 'Manager role found');

  const nowIso = new Date().toISOString();
  const dbCashier1 = await userRepo.create({
    id: `u-cash1-p9-${Date.now()}`,
    username: `cashier1_p9_${Date.now()}`,
    name: 'كاشير 1 - علي عثمان',
    password_hash: 'hash',
    role_id: cashierRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  });

  const dbCashier2 = await userRepo.create({
    id: `u-cash2-p9-${Date.now()}`,
    username: `cashier2_p9_${Date.now()}`,
    name: 'كاشير 2 - سارة محمود',
    password_hash: 'hash',
    role_id: cashierRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  });

  const dbManager = await userRepo.create({
    id: `u-mgr-p9-${Date.now()}`,
    username: `manager_p9_${Date.now()}`,
    name: 'المدير المالي - هشام كمال',
    password_hash: 'hash',
    role_id: managerRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  });

  const cashier1User: AuthenticatedUser = {
    id: dbCashier1.id,
    username: dbCashier1.username,
    name: dbCashier1.name,
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: cashierRole!.name,
    permissions: [
      'pos.view_menu',
      'pos.create_order',
      'orders.view',
      'shifts.open',
      'shifts.close',
      'shifts.view',
      'cash.view',
      'cash.view_balance',
      'cash.deposit',
    ],
  };

  const cashier2User: AuthenticatedUser = {
    id: dbCashier2.id,
    username: dbCashier2.username,
    name: dbCashier2.name,
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: cashierRole!.name,
    permissions: [
      'pos.view_menu',
      'pos.create_order',
      'orders.view',
      'shifts.open',
      'shifts.close',
      'shifts.view',
      'cash.view',
      'cash.view_balance',
      'cash.deposit',
    ],
  };

  const managerUser: AuthenticatedUser = {
    id: dbManager.id,
    username: dbManager.username,
    name: dbManager.name,
    roleId: managerRole!.id,
    roleCode: RoleCode.MANAGER,
    roleName: managerRole!.name,
    permissions: [
      'shifts.open',
      'shifts.close',
      'shifts.view',
      'shifts.view_all',
      'cash.view',
      'cash.view_balance',
      'cash.deposit',
      'cash.withdraw',
      'cash.adjust',
      'expenses.view',
      'expenses.create',
      'orders.manage',
    ],
  };

  const unauthorizedUser: AuthenticatedUser = {
    id: `u-unauth-p9-${Date.now()}`,
    username: 'unauth_p9',
    name: 'مستخدم بدون صلاحيات مالية',
    roleId: 'role-guest',
    roleCode: 'GUEST' as any,
    roleName: 'Guest',
    permissions: ['pos.view_menu'],
  };

  // Setup Test Product
  const testCat = await categoryRepo.create({
    id: `cat-p9-${Date.now()}`,
    name: 'وجبات المرحلة 9',
    sort_order: 1,
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  const prod100 = await productRepo.create({
    id: `prod-p9-100-${Date.now()}`,
    category_id: testCat.id,
    name: 'وجبة 100 جنيه',
    barcode: `6220000000001`,
    price: 10000, // 100.00 EGP = 10000 minor units
    cost_price: 6000,
    track_stock: 0,
    current_stock: 0,
    min_stock_alert: 0,
    unit: 'piece',
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  console.log('\n--- 1. Open Shift & Input Validations ---');
  // Rejection of negative opening cash
  try {
    await shiftService.openShift(cashier1User, { openingCash: -5000 });
    assert(false, 'Should reject negative opening cash');
  } catch (err) {
    assert(err instanceof ValidationError, 'Rejects negative opening cash with ValidationError');
  }

  // Rejection of floating-point opening cash
  try {
    await shiftService.openShift(cashier1User, { openingCash: 500.5 as any });
    assert(false, 'Should reject floating-point opening cash');
  } catch (err) {
    assert(err instanceof ValidationError, 'Rejects floating-point opening cash with ValidationError');
  }

  // Valid opening with 500.00 EGP (50000 minor units)
  const shift1 = await shiftService.openShift(cashier1User, {
    openingCash: 50000,
    notes: 'وردية صباحية كاشير 1',
  });
  assert(shift1.id !== null, 'Shift opened successfully');
  assert(shift1.status === ShiftStatus.OPEN, 'Shift status is OPEN');
  assert(shift1.opening_cash === 50000, 'Opening cash is 50000 minor units (500.00 EGP)');
  assert(shift1.expected_cash === 50000, 'Initial expected cash is equal to opening cash (50000)');
  assert(shift1.shift_number.startsWith('SH-'), 'Shift number has sequential format (SH-YYYYMMDD-XXXX)');

  console.log('\n--- 2. Duplicate Open Shift Prevention ---');
  try {
    await shiftService.openShift(cashier1User, { openingCash: 20000 });
    assert(false, 'Should reject opening second shift for same cashier');
  } catch (err) {
    assert(err instanceof ConflictError, 'Rejects duplicate open shift with ConflictError');
  }

  console.log('\n--- 3. Multi-Cashier Independence ---');
  // Cashier 2 can open their own shift independently
  const shift2 = await shiftService.openShift(cashier2User, {
    openingCash: 30000,
    notes: 'وردية كاشير 2',
  });
  assert(shift2.id !== null, 'Cashier 2 opened independent shift');
  assert(shift2.id !== shift1.id, 'Cashier 2 shift ID is distinct from Cashier 1');
  assert(shift2.opening_cash === 30000, 'Cashier 2 opening cash is 30000 minor units');

  console.log('\n--- 4. Cash Sale Transaction & Exact Net Amount ---');
  // Create order on shift1: 150.00 EGP (15000 minor units)
  // Cash tender: 200.00 EGP (20000 minor units), Change: 50.00 EGP (5000 minor units)
  // Cash transaction in ledger MUST be 15000 (net revenue), NOT 20000!
  const order1 = await orderService.createDraft(cashier1User, {
    order_type: 'TAKEAWAY',
    items: [{ productId: prod100.id, quantity: 1 }],
  });
  // Add another item or update order to 150.00 EGP
  // Let's create an order with total = 100.00 EGP, tender = 200.00 EGP, change = 100.00 EGP
  const sale1 = await paymentService.completeSale(cashier1User, {
    orderId: order1.order.id,
    payments: [
      {
        method: 'CASH',
        amount: 10000,
        tenderAmount: 20000,
      },
    ],
  });
  assert(sale1.changeAmount === 10000, 'Returned change is 10000 minor units (100.00 EGP)');

  // Verify cash transaction recorded in ledger
  const shift1Txs = await cashTxRepo.listByShift(shift1.id);
  assert(shift1Txs.length === 1, 'One cash transaction recorded for cash sale');
  assert(shift1Txs[0].transaction_type === 'SALE_PAYMENT', 'Transaction type is SALE_PAYMENT');
  assert(shift1Txs[0].amount === 10000, 'Cash transaction amount is net sale (10000), NOT tender (20000)');

  // Verify shift expected cash updated
  const expectedAfterSale1 = await shiftService.calculateExpectedCash(shift1.id);
  assert(expectedAfterSale1 === 60000, 'Expected cash after 100.00 sale is 60000 minor units (500 + 100)');

  console.log('\n--- 5. Card Sale Strictly Excluded from Cash Register ---');
  const order2 = await orderService.createDraft(cashier1User, {
    order_type: 'TAKEAWAY',
    items: [{ productId: prod100.id, quantity: 1 }],
  });

  await paymentService.completeSale(cashier1User, {
    orderId: order2.order.id,
    payments: [
      {
        method: 'CARD',
        amount: 10000,
        tenderAmount: 10000,
        referenceNumber: 'VISA-998877',
      },
    ],
  });

  const shift1TxsAfterCard = await cashTxRepo.listByShift(shift1.id);
  assert(shift1TxsAfterCard.length === 1, 'No new cash transactions added for CARD sale');
  const expectedAfterCard = await shiftService.calculateExpectedCash(shift1.id);
  assert(expectedAfterCard === 60000, 'Expected cash remained 60000 (CARD sale excluded from cash drawer)');

  console.log('\n--- 6. Split Payment (Cash + Card) ---');
  // Order 3: 200.00 EGP (2 x prod100 = 20000 minor units)
  // Split: 50.00 EGP Cash (5000), 150.00 EGP Card (15000)
  const order3 = await orderService.createDraft(cashier1User, {
    order_type: 'TAKEAWAY',
    items: [{ productId: prod100.id, quantity: 2 }],
  });

  await paymentService.completeSale(cashier1User, {
    orderId: order3.order.id,
    payments: [
      { method: 'CASH', amount: 5000, tenderAmount: 5000 },
      { method: 'CARD', amount: 15000, tenderAmount: 15000, referenceNumber: 'MADA-1122' },
    ],
  });

  const shift1TxsAfterSplit = await cashTxRepo.listByShift(shift1.id);
  assert(shift1TxsAfterSplit.length === 2, 'Exactly one cash ledger transaction added for split sale cash portion');
  const expectedAfterSplit = await shiftService.calculateExpectedCash(shift1.id);
  assert(expectedAfterSplit === 65000, 'Expected cash increased by only cash portion (5000) -> 65000 minor units');

  console.log('\n--- 7. Real-world Financial Sequence Test (Prompt Section 28) ---');
  // Test Scenario:
  // Fresh Shift:
  // Opening: 50000 (500.00 EGP)
  // Cash Sale: 100000 (1000.00 EGP)
  // Card Sale: 50000 (500.00 EGP) -> excluded
  // Deposit: 30000 (300.00 EGP)
  // Expense: 20000 (200.00 EGP)
  // Withdrawal: 10000 (100.00 EGP)
  // Expected Cash: 50000 + 100000 + 30000 - 20000 - 10000 = 150000 (1500.00 EGP)

  const dbCashier3 = await userRepo.create({
    id: `u-cash3-p9-${Date.now()}`,
    username: `cashier3_p9_${Date.now()}`,
    name: 'كاشير 3 - الحسابات المالية',
    password_hash: 'hash',
    role_id: cashierRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  });

  const cashier3User: AuthenticatedUser = {
    id: dbCashier3.id,
    username: dbCashier3.username,
    name: dbCashier3.name,
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: cashierRole!.name,
    permissions: [
      'pos.view_menu',
      'pos.create_order',
      'orders.view',
      'shifts.open',
      'shifts.close',
      'shifts.view',
      'cash.view',
      'cash.view_balance',
      'cash.deposit',
    ],
  };

  const financialShift = await shiftService.openShift(cashier3User, {
    openingCash: 50000,
    notes: 'وردية الحسابات الدقيقة',
  });
  assert(financialShift.opening_cash === 50000, 'Step A: Opening Cash is 50000 (500 EGP)');

  // Step B: Cash Sale = 1000.00 EGP (100000 minor units)
  const fOrder1 = await orderService.createDraft(cashier3User, {
    order_type: 'TAKEAWAY',
    items: [{ productId: prod100.id, quantity: 10 }],
  });
  await paymentService.completeSale(cashier3User, {
    orderId: fOrder1.order.id,
    payments: [{ method: 'CASH', amount: 100000, tenderAmount: 100000 }],
  });

  // Step C: Card Sale = 500.00 EGP (50000 minor units)
  const fOrder2 = await orderService.createDraft(cashier3User, {
    order_type: 'TAKEAWAY',
    items: [{ productId: prod100.id, quantity: 5 }],
  });
  await paymentService.completeSale(cashier3User, {
    orderId: fOrder2.order.id,
    payments: [{ method: 'CARD', amount: 50000, tenderAmount: 50000, referenceNumber: 'C-500' }],
  });

  // Step D: Deposit = 300.00 EGP (30000 minor units)
  const depTx = await cashRegisterService.deposit(cashier3User, {
    shiftId: financialShift.id,
    amount: 30000,
    reason: 'إيداع فكة إضافية بالدرج',
  });
  assert(depTx.amount === 30000, 'Step D: Deposit recorded with 30000 minor units');

  // Step E: Expense = 200.00 EGP (20000 minor units) from drawer
  const expTx = await expenseService.createExpense(managerUser, {
    shiftId: financialShift.id,
    category: 'نثريات',
    amount: 20000,
    description: 'شراء بكر ورق فواتير طابعة',
    paidFromCashDrawer: true,
  });
  assert(expTx.amount === 20000, 'Step E: Cash expense recorded with 20000 minor units');

  // Step F: Withdrawal = 100.00 EGP (10000 minor units)
  const withTx = await cashRegisterService.withdraw(managerUser, {
    shiftId: financialShift.id,
    amount: 10000,
    reason: 'سحب وسداد مستحقات صيانة عاجلة',
  });
  assert(withTx.amount === 10000, 'Step F: Cash withdrawal recorded with 10000 minor units');

  // Verify Total Expected Cash:
  // 50000 + 100000 + 30000 - 20000 - 10000 = 150000 minor units
  const fExpected = await shiftService.calculateExpectedCash(financialShift.id);
  assert(fExpected === 150000, 'Expected Cash is exactly 150000 minor units (1500.00 EGP)');

  // Verify Summary breakdown
  const fSummary = await shiftService.getShiftSummary(cashier3User, financialShift.id);
  assert(fSummary.openingCash === 50000, 'Summary openingCash is 50000');
  assert(fSummary.cashSales === 100000, 'Summary cashSales is 100000');
  assert(fSummary.cardSales === 50000, 'Summary cardSales is 50000');
  assert(fSummary.totalSales === 150000, 'Summary totalSales is 150000');
  assert(fSummary.deposits === 30000, 'Summary deposits is 30000');
  assert(fSummary.cashExpenses === 20000, 'Summary cashExpenses is 20000');
  assert(fSummary.withdrawals === 10000, 'Summary withdrawals is 10000');
  assert(fSummary.expectedCash === 150000, 'Summary expectedCash is 150000');

  console.log('\n--- 8. Cash Drawer Overdraw Protection ---');
  // Attempt to withdraw more than 150000 (e.g. 200000)
  try {
    await cashRegisterService.withdraw(managerUser, {
      shiftId: financialShift.id,
      amount: 200000,
      reason: 'سحب يتجاوز رصيد الدرج',
    });
    assert(false, 'Should reject overdraw withdrawal');
  } catch (err) {
    assert(err instanceof ConflictError, 'Rejects overdraw withdrawal with ConflictError');
  }

  // Attempt to expense more than current available
  try {
    await expenseService.createExpense(managerUser, {
      shiftId: financialShift.id,
      category: 'مصروف ضخم',
      amount: 250000,
      description: 'مصروف أكبر من رصيد الخزينة',
      paidFromCashDrawer: true,
    });
    assert(false, 'Should reject overdraw expense');
  } catch (err) {
    assert(err instanceof ConflictError, 'Rejects overdraw expense with ConflictError');
  }

  console.log('\n--- 9. Shift Close & Variance Calculations ---');
  // Case A: Balanced Close (actual = 150000, expected = 150000, variance = 0)
  const closedShift = await shiftService.closeShift(cashier3User, {
    shiftId: financialShift.id,
    actualCash: 150000,
    notes: 'جرد مطابق تماماً',
  });
  assert(closedShift.status === ShiftStatus.CLOSED, 'Shift status is CLOSED');
  assert(closedShift.expected_cash === 150000, 'Recorded expected cash is 150000');
  assert(closedShift.actual_cash === 150000, 'Recorded actual cash is 150000');
  assert(closedShift.cash_difference === 0, 'Variance is exactly 0 (Balanced)');
  assert(closedShift.closed_at !== null, 'closed_at timestamp set');

  // Case B: Shortage Close on shift2 (Opening = 30000, actual = 28000 -> variance = -2000)
  const closedShift2 = await shiftService.closeShift(cashier2User, {
    shiftId: shift2.id,
    actualCash: 28000,
    notes: 'عجز 20 جنيه',
  });
  assert(closedShift2.status === ShiftStatus.CLOSED, 'Shift 2 closed');
  assert(closedShift2.expected_cash === 30000, 'Shift 2 expected cash is 30000');
  assert(closedShift2.actual_cash === 28000, 'Shift 2 actual cash is 28000');
  assert(closedShift2.cash_difference === -2000, 'Variance is -2000 minor units (Shortage of 20.00 EGP)');

  // Case C: Overage Close on shift1 (Opening = 50000 + 10000 + 5000 = 65000, actual = 67000 -> variance = +2000)
  const closedShift1 = await shiftService.closeShift(cashier1User, {
    shiftId: shift1.id,
    actualCash: 67000,
    notes: 'فائض 20 جنيه',
  });
  assert(closedShift1.cash_difference === 2000, 'Variance is +2000 minor units (Overage of 20.00 EGP)');

  console.log('\n--- 10. Double Close & Closed Shift Protection ---');
  // Attempt to close an already closed shift
  try {
    await shiftService.closeShift(cashier3User, {
      shiftId: financialShift.id,
      actualCash: 150000,
    });
    assert(false, 'Should reject closing an already closed shift');
  } catch (err) {
    assert(err instanceof ConflictError, 'Rejects double close with ConflictError');
  }

  // Attempt deposit on closed shift
  try {
    await cashRegisterService.deposit(cashier3User, {
      shiftId: financialShift.id,
      amount: 5000,
      reason: 'إيداع على وردية مغلقة',
    });
    assert(false, 'Should reject deposit on closed shift');
  } catch (err) {
    assert(err instanceof ConflictError, 'Rejects deposit on closed shift with ConflictError');
  }

  // Attempt withdrawal on closed shift
  try {
    await cashRegisterService.withdraw(managerUser, {
      shiftId: financialShift.id,
      amount: 5000,
      reason: 'سحب من وردية مغلقة',
    });
    assert(false, 'Should reject withdrawal from closed shift');
  } catch (err) {
    assert(err instanceof ConflictError, 'Rejects withdrawal on closed shift with ConflictError');
  }

  // Attempt sale payment on closed shift
  const closedOrder = await orderRepo.create({
    id: `ord-closed-${Date.now()}`,
    order_number: `ORD-CL-${Date.now().toString().slice(-4)}`,
    shift_id: financialShift.id,
    user_id: cashier3User.id,
    customer_id: null,
    table_id: null,
    table_number: null,
    order_type: 'TAKEAWAY',
    status: 'PENDING',
    subtotal: 10000,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    delivery_fee: 0,
    total: 10000,
    notes: null,
    created_at: nowIso,
    updated_at: nowIso,
  });
  await orderItemRepo.create({
    id: `item-cl-${Date.now()}`,
    order_id: closedOrder.id,
    product_id: prod100.id,
    product_name_snapshot: 'وجبة 100',
    unit_price: 10000,
    quantity: 1,
    subtotal: 10000,
    discount_amount: 0,
    total: 10000,
    notes: null,
    created_at: nowIso,
  });

  try {
    await paymentService.completeSale(cashier3User, {
      orderId: closedOrder.id,
      payments: [{ method: 'CASH', amount: 10000, tenderAmount: 10000 }],
    });
    assert(false, 'Should reject sale payment on closed shift');
  } catch (err) {
    assert(err instanceof ConflictError, 'Rejects sale on closed shift with ConflictError');
  }

  console.log('\n--- 11. Cashier Isolation & Managerial Override ---');
  // Open fresh shifts for Cashier 1 and Cashier 2
  const shiftA = await shiftService.openShift(cashier1User, { openingCash: 20000 });
  const shiftB = await shiftService.openShift(cashier2User, { openingCash: 20000 });

  // Cashier 1 tries to close Cashier 2's shift -> Rejection
  try {
    await shiftService.closeShift(cashier1User, {
      shiftId: shiftB.id,
      actualCash: 20000,
    });
    assert(false, 'Cashier should NOT be able to close another cashier shift');
  } catch (err) {
    assert(err instanceof UnauthorizedError, 'Rejects unauthorized closure with UnauthorizedError');
  }

  // Cashier 1 tries to view details of Cashier 2's shift -> Rejection
  try {
    await shiftService.getShiftSummary(cashier1User, shiftB.id);
    assert(false, 'Cashier should NOT be able to view another cashier shift summary');
  } catch (err) {
    assert(err instanceof UnauthorizedError, 'Rejects unauthorized shift summary view with UnauthorizedError');
  }

  // Manager CAN view and close Cashier 2's shift (Managerial override)
  const managerSummary = await shiftService.getShiftSummary(managerUser, shiftB.id);
  assert(managerSummary.openingCash === 20000, 'Manager can inspect Cashier 2 shift summary');

  const managerClosed = await shiftService.closeShift(managerUser, {
    shiftId: shiftB.id,
    actualCash: 20000,
    notes: 'إغلاق إداري بواسطة المدير',
  });
  assert(managerClosed.status === ShiftStatus.CLOSED, 'Manager can close Cashier 2 shift');

  // Close shiftA cleanly
  await shiftService.closeShift(cashier1User, { shiftId: shiftA.id, actualCash: 20000 });

  console.log('\n--- 12. RBAC Permissions Enforcement ---');
  try {
    await shiftService.openShift(unauthorizedUser, { openingCash: 10000 });
    assert(false, 'Unauthorized user should NOT open shift');
  } catch (err) {
    assert(err instanceof UnauthorizedError, 'Rejects shifts.open without permission');
  }

  try {
    await cashRegisterService.withdraw(cashier1User, {
      shiftId: shiftA.id,
      amount: 1000,
      reason: 'محاولة سحب بدون صلاحية',
    });
    assert(false, 'Cashier without cash.withdraw should NOT withdraw');
  } catch (err) {
    assert(err instanceof UnauthorizedError, 'Rejects cash.withdraw without permission');
  }

  console.log('\n--- 13. Hard Delete Protection on Financial Records ---');
  try {
    await shiftRepo.delete();
    assert(false, 'Should strictly forbid shift deletion');
  } catch (err) {
    assert(err instanceof Error, 'Strictly forbids hard delete on shifts');
  }

  try {
    await cashTxRepo.delete();
    assert(false, 'Should strictly forbid cash ledger deletion');
  } catch (err) {
    assert(err instanceof Error, 'Strictly forbids hard delete on cash ledger transactions');
  }

  console.log('\n--- 14. Audit Log Verification ---');
  const auditLogs = await auditRepo.listRecent(50);
  const actions = auditLogs.map((l) => l.action);
  assert(actions.includes('SHIFT_OPENED'), 'SHIFT_OPENED recorded in audit logs');
  assert(actions.includes('SHIFT_CLOSED'), 'SHIFT_CLOSED recorded in audit logs');
  assert(actions.includes('SHIFT_CLOSE_VARIANCE'), 'SHIFT_CLOSE_VARIANCE recorded in audit logs');
  assert(actions.includes('CASH_DEPOSIT'), 'CASH_DEPOSIT recorded in audit logs');
  assert(actions.includes('CASH_WITHDRAWAL'), 'CASH_WITHDRAWAL recorded in audit logs');

  console.log('\n======================================================');
  console.log(`📊 PHASE 9 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runShiftsCashRegisterTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
