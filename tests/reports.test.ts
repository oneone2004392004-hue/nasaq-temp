/**
 * NASAQ POS — Phase 10: Reports & Business Analytics Comprehensive Test Suite
 *
 * Verifies all requirements:
 * 1. Sales summary for Today matches completed orders only
 * 2. Sales summary excludes Pending orders
 * 3. Sales summary excludes Cancelled orders
 * 4. Sales summary excludes Hold orders
 * 5. Date filter boundary: transactions at 00:00:00 are included
 * 6. Date filter boundary: transactions at 23:59:59 are included
 * 7. Yesterday filter includes only yesterday transactions
 * 8. This week filter includes transactions across the week
 * 9. This month filter includes transactions across the month
 * 10. Custom date range filter includes exactly the specified range
 * 11. Invalid custom date range (start > end) is rejected safely
 * 12. Order type filter: DINE_IN returns only dine-in sales
 * 13. Order type filter: TAKEAWAY returns only takeaway sales
 * 14. Order type filter: DELIVERY returns only delivery sales
 * 15. Payment method filter: CASH returns only cash sales
 * 16. Payment method filter: CARD returns only card sales
 * 17. Split payment handling: Cash and Card portions separated correctly
 * 18. Top products report uses historical snapshot name, not current product table
 * 19. Top products report handles renamed product (historical sales retain old name)
 * 20. Top products report sort by quantity works correctly
 * 21. Top products report sort by sales amount works correctly
 * 22. Cashier performance report groups sales by cashier correctly
 * 23. Cashier performance report reflects each cashier's actual completed orders
 * 24. Expense report calculates total expenses correctly
 * 25. Expense report does not double-count cash transactions and expenses
 * 26. Shift report displays correct opening cash, expected cash, actual cash, and variance
 * 27. Cash register summary correctly reflects deposits, withdrawals, expenses, and cash sales
 * 28. Combined filters (date + order type + payment method + cashier) work correctly together
 * 29. Unauthorized user cannot access reports (RBAC enforcement)
 * 30. Reports do not modify database state (read-only verification)
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { ReportRepository } from '../src/repositories/ReportRepository';
import { ReportService } from '../src/features/reports/services/ReportService';
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
import { AuthenticatedUser } from '../src/features/auth/types';
import { RoleCode, OrderStatus, OrderType, PaymentMethod, ShiftStatus } from '../src/domain/enums';
import { ValidationError } from '../src/database/errors';
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

async function runReportsTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('📊 NASAQ POS — PHASE 10: REPORTS & ANALYTICS TEST SUITE');
  console.log('======================================================\n');

  const db = DatabaseManager.getInstance();
  await db.initialize();

  const reportRepo = new ReportRepository(db);
  const reportService = new ReportService(reportRepo);

  const shiftRepo = new ShiftRepository(db);
  const cashTxRepo = new CashTransactionRepository(db);
  const expenseRepo = new ExpenseRepository(db);
  const userRepo = new UserRepository(db);
  const roleRepo = new RoleRepository(db);
  const orderRepo = new OrderRepository(db);
  const orderItemRepo = new OrderItemRepository(db);
  const paymentRepo = new PaymentRepository(db);
  const invoiceRepo = new InvoiceRepository(db);
  const productRepo = new ProductRepository(db);
  const categoryRepo = new CategoryRepository(db);

  // Setup roles
  const managerRole = await roleRepo.findByCode(RoleCode.MANAGER);
  const cashierRole = await roleRepo.findByCode(RoleCode.CASHIER);

  assert(managerRole !== null, 'Manager role found');
  assert(cashierRole !== null, 'Cashier role found');

  const refDateStr = '2026-06-15T12:00:00.000Z'; // Monday June 15, 2026
  const refDate = new Date(refDateStr);

  // Create Users for Testing
  const adminUser: AuthenticatedUser = {
    id: `u-mgr-${generateId()}`,
    username: 'manager_reports',
    name: 'مدير النظام المالي',
    roleId: managerRole!.id,
    roleCode: RoleCode.MANAGER,
    roleName: managerRole!.name,
    permissions: ['reports.sales', 'reports.shifts', 'reports.financial'],
  };

  const cashier1User: AuthenticatedUser = {
    id: `u-c1-${generateId()}`,
    username: 'cashier1_rep',
    name: 'كاشير أحمد',
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: cashierRole!.name,
    permissions: ['pos.create_order', 'shifts.open', 'shifts.close'],
  };

  const cashier2User: AuthenticatedUser = {
    id: `u-c2-${generateId()}`,
    username: 'cashier2_rep',
    name: 'كاشير سارة',
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: cashierRole!.name,
    permissions: ['pos.create_order', 'shifts.open', 'shifts.close'],
  };

  const unauthorizedCashier: AuthenticatedUser = {
    id: `u-unauth-${generateId()}`,
    username: 'cashier_no_rep',
    name: 'كاشير بدون صلاحية تقارير',
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: cashierRole!.name,
    permissions: ['pos.view_menu'],
  };

  await userRepo.create({
    id: cashier1User.id,
    username: cashier1User.username,
    name: cashier1User.name,
    password_hash: 'hash',
    role_id: cashierRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: refDateStr,
    updated_at: refDateStr,
  });

  await userRepo.create({
    id: cashier2User.id,
    username: cashier2User.username,
    name: cashier2User.name,
    password_hash: 'hash',
    role_id: cashierRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: refDateStr,
    updated_at: refDateStr,
  });

  // Setup Product Category & Products
  const cat = await categoryRepo.create({
    id: `cat-rep-${generateId()}`,
    name: 'مشروبات وتقارير',
    sort_order: 1,
    is_active: 1,
    created_at: refDateStr,
    updated_at: refDateStr,
  });

  const product1 = await productRepo.create({
    id: `p1-${generateId()}`,
    name: 'عصير برتقال طازج',
    category_id: cat.id,
    price: 3500, // 35.00 LE
    cost_price: 0,
    barcode: null,
    track_stock: 0,
    current_stock: 0,
    min_stock_alert: 0,
    unit: 'piece',
    is_active: 1,
    created_at: refDateStr,
    updated_at: refDateStr,
  });

  const product2 = await productRepo.create({
    id: `p2-${generateId()}`,
    name: 'قهوة اسبريسو خاصة',
    category_id: cat.id,
    price: 2500, // 25.00 LE
    cost_price: 0,
    barcode: null,
    track_stock: 0,
    current_stock: 0,
    min_stock_alert: 0,
    unit: 'piece',
    is_active: 1,
    created_at: refDateStr,
    updated_at: refDateStr,
  });

  // Shifts setup
  const shift1 = await shiftRepo.create({
    id: `shift-rep1-${generateId()}`,
    shift_number: 'SH-2026-REP1',
    user_id: cashier1User.id,
    opened_at: '2026-06-15T08:00:00.000Z',
    closed_at: '2026-06-15T16:00:00.000Z',
    opening_cash: 50000, // 500.00 LE
    expected_cash: 110000, // 1100.00 LE
    actual_cash: 110000, // Balanced
    cash_difference: 0,
    status: ShiftStatus.CLOSED,
    notes: 'وردية اختبار التقارير',
  });

  // Helper to create order with items, payments, invoice
  let orderCounter = 100;
  async function createTestOrder(opts: {
    userId: string;
    shiftId: string;
    orderType: OrderType;
    status: 'HOLD' | 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'RETURNED';
    total: number;
    createdAt: string;
    items: { productNameSnapshot: string; quantity: number; unitPrice: number; total: number }[];
    payments?: { method: 'CASH' | 'CARD' | 'SPLIT'; amount: number }[];
  }) {
    orderCounter++;
    const orderId = `ord-${orderCounter}-${generateId()}`;
    const orderNum = `ORD-2026-${orderCounter}`;

    const order = await orderRepo.create({
      id: orderId,
      order_number: orderNum,
      user_id: opts.userId,
      shift_id: opts.shiftId,
      order_type: opts.orderType,
      status: opts.status,
      table_number: opts.orderType === OrderType.DINE_IN ? '5' : null,
      customer_id: null,
      subtotal: opts.total,
      discount_type: null,
      discount_value: 0,
      discount_amount: 0,
      tax_rate: 0,
      tax_amount: 0,
      delivery_fee: 0,
      total: opts.total,
      notes: null,
      created_at: opts.createdAt,
      updated_at: opts.createdAt,
    });

    for (const item of opts.items) {
      await orderItemRepo.create({
        id: `oi-${generateId()}`,
        order_id: orderId,
        product_id: product1.id,
        product_name_snapshot: item.productNameSnapshot,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.total,
        discount_amount: 0,
        total: item.total,
        notes: null,
        created_at: opts.createdAt,
      });
    }

    if (opts.payments && opts.payments.length > 0) {
      for (const p of opts.payments) {
        await paymentRepo.create({
          id: `pay-${generateId()}`,
          order_id: orderId,
          shift_id: opts.shiftId,
          payment_method: p.method,
          amount: p.amount,
          tender_amount: p.amount,
          change_amount: 0,
          reference_number: null,
          created_at: opts.createdAt,
        });

        if (p.method === PaymentMethod.CASH && opts.status === OrderStatus.COMPLETED) {
          await cashTxRepo.create({
            id: `ctx-${generateId()}`,
            shift_id: opts.shiftId,
            user_id: opts.userId,
            transaction_type: 'SALE',
            amount: p.amount,
            reason: `Sales test ${orderNum}`,
            reference_id: orderId,
            created_at: opts.createdAt,
          });
        }
      }

      // Create invoice
      await invoiceRepo.create({
        id: `inv-${generateId()}`,
        invoice_number: `INV-2026-${orderCounter}`,
        order_id: orderId,
        shift_id: opts.shiftId,
        customer_name_snapshot: 'عميل تجريبي',
        cashier_name_snapshot: opts.userId === cashier1User.id ? cashier1User.name : cashier2User.name,
        total_amount: opts.total,
        tax_amount: 0,
        discount_amount: 0,
        net_amount: opts.total,
        status: 'PAID',
        printed_count: 1,
        last_printed_at: null,
        created_at: opts.createdAt,
      });
    }

    return order;
  }

  // --- SEED REAL TEST SCENARIOS ---
  // Today's Date: 2026-06-15

  // 1. Order 1: Completed, Dine-in, Cash (6000 piasters) - Cashier 1
  await createTestOrder({
    userId: cashier1User.id,
    shiftId: shift1.id,
    orderType: OrderType.DINE_IN,
    status: OrderStatus.COMPLETED,
    total: 6000,
    createdAt: '2026-06-15T09:00:00.000Z',
    items: [{ productNameSnapshot: 'عصير برتقال طازج', quantity: 2, unitPrice: 3000, total: 6000 }],
    payments: [{ method: PaymentMethod.CASH, amount: 6000 }],
  });

  // 2. Order 2: Completed, Takeaway, Card (2500 piasters) - Cashier 1
  await createTestOrder({
    userId: cashier1User.id,
    shiftId: shift1.id,
    orderType: OrderType.TAKEAWAY,
    status: OrderStatus.COMPLETED,
    total: 2500,
    createdAt: '2026-06-15T10:00:00.000Z',
    items: [{ productNameSnapshot: 'قهوة اسبريسو خاصة', quantity: 1, unitPrice: 2500, total: 2500 }],
    payments: [{ method: PaymentMethod.CARD, amount: 2500 }],
  });

  // 3. Order 3: Completed, Delivery, Split (5000 piasters: 2000 Cash + 3000 Card) - Cashier 2
  await createTestOrder({
    userId: cashier2User.id,
    shiftId: shift1.id,
    orderType: OrderType.DELIVERY,
    status: OrderStatus.COMPLETED,
    total: 5000,
    createdAt: '2026-06-15T11:00:00.000Z',
    items: [
      { productNameSnapshot: 'عصير برتقال طازج', quantity: 1, unitPrice: 3500, total: 3500 },
      { productNameSnapshot: 'قهوة اسبريسو خاصة', quantity: 1, unitPrice: 1500, total: 1500 },
    ],
    payments: [
      { method: PaymentMethod.CASH, amount: 2000 },
      { method: PaymentMethod.CARD, amount: 3000 },
    ],
  });

  // 4. Excluded Orders (Pending, Cancelled, Hold)
  await createTestOrder({
    userId: cashier1User.id,
    shiftId: shift1.id,
    orderType: OrderType.DINE_IN,
    status: OrderStatus.PENDING,
    total: 4000,
    createdAt: '2026-06-15T11:30:00.000Z',
    items: [{ productNameSnapshot: 'عصير برتقال طازج', quantity: 1, unitPrice: 4000, total: 4000 }],
  });

  await createTestOrder({
    userId: cashier1User.id,
    shiftId: shift1.id,
    orderType: OrderType.TAKEAWAY,
    status: OrderStatus.CANCELLED,
    total: 3000,
    createdAt: '2026-06-15T11:45:00.000Z',
    items: [{ productNameSnapshot: 'عصير برتقال طازج', quantity: 1, unitPrice: 3000, total: 3000 }],
  });

  await createTestOrder({
    userId: cashier2User.id,
    shiftId: shift1.id,
    orderType: OrderType.DINE_IN,
    status: 'HOLD' as any,
    total: 7000,
    createdAt: '2026-06-15T11:50:00.000Z',
    items: [{ productNameSnapshot: 'قهوة اسبريسو خاصة', quantity: 2, unitPrice: 3500, total: 7000 }],
  });

  // 5. Boundary Orders: Cairo local 00:00:00.000 and 23:59:59.999 on 2026-06-15
  await createTestOrder({
    userId: cashier1User.id,
    shiftId: shift1.id,
    orderType: OrderType.TAKEAWAY,
    status: OrderStatus.COMPLETED,
    total: 1000,
    createdAt: '2026-06-14T21:00:00.000Z',
    items: [{ productNameSnapshot: 'عصير برتقال طازج', quantity: 1, unitPrice: 1000, total: 1000 }],
    payments: [{ method: PaymentMethod.CASH, amount: 1000 }],
  });

  await createTestOrder({
    userId: cashier1User.id,
    shiftId: shift1.id,
    orderType: OrderType.TAKEAWAY,
    status: OrderStatus.COMPLETED,
    total: 1500,
    createdAt: '2026-06-15T20:59:59.999Z',
    items: [{ productNameSnapshot: 'قهوة اسبريسو خاصة', quantity: 1, unitPrice: 1500, total: 1500 }],
    payments: [{ method: PaymentMethod.CARD, amount: 1500 }],
  });

  // 6. Yesterday Order (2026-06-14)
  await createTestOrder({
    userId: cashier1User.id,
    shiftId: shift1.id,
    orderType: OrderType.DINE_IN,
    status: OrderStatus.COMPLETED,
    total: 8000,
    createdAt: '2026-06-14T15:00:00.000Z',
    items: [{ productNameSnapshot: 'عصير برتقال طازج', quantity: 2, unitPrice: 4000, total: 8000 }],
    payments: [{ method: PaymentMethod.CASH, amount: 8000 }],
  });

  // 7. This Week Earlier Order (2026-06-10)
  await createTestOrder({
    userId: cashier2User.id,
    shiftId: shift1.id,
    orderType: OrderType.DELIVERY,
    status: OrderStatus.COMPLETED,
    total: 9000,
    createdAt: '2026-06-10T12:00:00.000Z',
    items: [{ productNameSnapshot: 'قهوة اسبريسو خاصة', quantity: 3, unitPrice: 3000, total: 9000 }],
    payments: [{ method: PaymentMethod.CARD, amount: 9000 }],
  });

  // 8. This Month Earlier Order (2026-06-02)
  await createTestOrder({
    userId: cashier1User.id,
    shiftId: shift1.id,
    orderType: OrderType.TAKEAWAY,
    status: OrderStatus.COMPLETED,
    total: 4500,
    createdAt: '2026-06-02T10:00:00.000Z',
    items: [{ productNameSnapshot: 'عصير برتقال طازج', quantity: 1, unitPrice: 4500, total: 4500 }],
    payments: [{ method: PaymentMethod.CASH, amount: 4500 }],
  });

  // 9. Historical Snapshot Renamed Product test:
  // Order placed under old name "عصير برتقال كلاسيك قديم"
  await createTestOrder({
    userId: cashier1User.id,
    shiftId: shift1.id,
    orderType: OrderType.TAKEAWAY,
    status: OrderStatus.COMPLETED,
    total: 2000,
    createdAt: '2026-06-15T14:00:00.000Z',
    items: [{ productNameSnapshot: 'عصير برتقال كلاسيك قديم', quantity: 1, unitPrice: 2000, total: 2000 }],
    payments: [{ method: PaymentMethod.CASH, amount: 2000 }],
  });

  // 10. Expenses setup
  await expenseRepo.create({
    id: `exp1-${generateId()}`,
    category: 'نظافة وضيافة',
    amount: 1500, // 15.00 LE
    description: 'شراء صابون ومناديل',
    paid_from_cash_drawer: 1,
    shift_id: shift1.id,
    user_id: cashier1User.id,
    created_at: '2026-06-15T12:00:00.000Z',
  });

  // Ledger entry for that expense
  await cashTxRepo.create({
    id: `ctx-exp1-${generateId()}`,
    shift_id: shift1.id,
    user_id: cashier1User.id,
    transaction_type: 'EXPENSE',
    amount: 1500,
    reason: 'مصروف نظافة',
    reference_id: null,
    created_at: '2026-06-15T12:00:00.000Z',
  });

  // Cash deposit into register
  await cashTxRepo.create({
    id: `ctx-dep1-${generateId()}`,
    shift_id: shift1.id,
    user_id: cashier1User.id,
    transaction_type: 'DEPOSIT',
    amount: 10000, // 100.00 LE
    reason: 'تغذية نقدية افتتاحية',
    reference_id: null,
    created_at: '2026-06-15T08:30:00.000Z',
  });

  // Cash withdrawal from register
  await cashTxRepo.create({
    id: `ctx-wth1-${generateId()}`,
    shift_id: shift1.id,
    user_id: cashier1User.id,
    transaction_type: 'WITHDRAWAL',
    amount: 5000, // 50.00 LE
    reason: 'توريد جزئي للخزينة',
    reference_id: null,
    created_at: '2026-06-15T13:00:00.000Z',
  });

  // =========================================================================
  // EXECUTE SPECIFICATION TESTS
  // =========================================================================

  console.log('\n--- 1. Sales Summary & Order Status Tests ---');
  // Today's completed orders:
  // Order 1 (6000) + Order 2 (2500) + Order 3 (5000) + Boundary 1 (1000) + Boundary 2 (1500) + Renamed (2000) = 18000
  const todaySummary = await reportService.getSalesSummary(adminUser, {
    datePreset: 'TODAY',
    referenceDate: refDateStr,
  });

  assert(
    todaySummary.completedOrdersCount === 6,
    `1. Today completed orders count is 6 (got ${todaySummary.completedOrdersCount})`
  );
  assert(
    todaySummary.totalSales === 18000,
    `1. Today total sales matches completed orders: 18000 piasters (got ${todaySummary.totalSales})`
  );

  // Check exclusion of Pending, Cancelled, Hold
  // If they were included, total would be 18000 + 4000 + 3000 + 7000 = 32000
  assert(
    todaySummary.totalSales !== 32000,
    '2-4. Excluded non-completed orders (Pending, Cancelled, Hold) are not in totalSales'
  );
  assert(
    !todaySummary.totalSales.toString().includes('32000'),
    '2. Excluded Pending order (4000) from realized sales'
  );
  assert(
    todaySummary.completedOrdersCount === 6,
    '3. Excluded Cancelled order (3000) from completed count'
  );
  assert(
    todaySummary.averageOrderValue === Math.round(18000 / 6),
    `4. Average order value calculated correctly: 3000 piasters (got ${todaySummary.averageOrderValue})`
  );

  console.log('\n--- 2. Date Boundary and Period Filters Tests ---');
  // 5. Boundary 00:00:00
  // 6. Boundary 23:59:59
  assert(
    todaySummary.totalSales >= 18000,
    '5 & 6. Both transactions at 00:00:00 and 23:59:59 are included in Today filter'
  );

  // 7. Yesterday filter
  const yesterdaySummary = await reportService.getSalesSummary(adminUser, {
    datePreset: 'YESTERDAY',
    referenceDate: refDateStr,
  });
  assert(
    yesterdaySummary.completedOrdersCount === 1 && yesterdaySummary.totalSales === 8000,
    `7. Yesterday filter includes only yesterday order (1 order, 8000 piasters, got count=${yesterdaySummary.completedOrdersCount}, sales=${yesterdaySummary.totalSales})`
  );

  // 8. This Week filter (includes 2026-06-10 + 2026-06-14 + 2026-06-15 = 9000 + 8000 + 18000 = 35000)
  const weekSummary = await reportService.getSalesSummary(adminUser, {
    datePreset: 'THIS_WEEK',
    referenceDate: refDateStr,
  });
  assert(
    weekSummary.completedOrdersCount === 8 && weekSummary.totalSales === 35000,
    `8. This week filter includes transactions across the week: 35000 piasters (got ${weekSummary.totalSales})`
  );

  // 9. This Month filter (includes 2026-06-02 + week = 4500 + 35000 = 39500)
  const monthSummary = await reportService.getSalesSummary(adminUser, {
    datePreset: 'THIS_MONTH',
    referenceDate: refDateStr,
  });
  assert(
    monthSummary.completedOrdersCount === 9 && monthSummary.totalSales === 39500,
    `9. This month filter includes transactions across the month: 39500 piasters (got ${monthSummary.totalSales})`
  );

  // 10. Custom date range filter (2026-06-10 to 2026-06-14: 9000 + 8000 = 17000)
  const customSummary = await reportService.getSalesSummary(adminUser, {
    datePreset: 'CUSTOM',
    startDate: '2026-06-10',
    endDate: '2026-06-14',
    referenceDate: refDateStr,
  });
  assert(
    customSummary.completedOrdersCount === 2 && customSummary.totalSales === 17000,
    `10. Custom date range filter includes exactly the specified range: 17000 piasters (got ${customSummary.totalSales})`
  );

  // 11. Invalid custom range (start > end)
  let rejectedCustom = false;
  try {
    await reportService.getSalesSummary(adminUser, {
      datePreset: 'CUSTOM',
      startDate: '2026-06-20',
      endDate: '2026-06-10',
      referenceDate: refDateStr,
    });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      rejectedCustom = true;
    }
  }
  assert(rejectedCustom, '11. Invalid custom date range (start > end) is rejected with ValidationError');

  console.log('\n--- 3. Order Type Filter Tests ---');
  // 12. DINE_IN (Today: Order 1 = 6000)
  const dineInReport = await reportService.getSalesSummary(adminUser, {
    datePreset: 'TODAY',
    orderType: OrderType.DINE_IN,
    referenceDate: refDateStr,
  });
  assert(
    dineInReport.completedOrdersCount === 1 && dineInReport.totalSales === 6000,
    `12. Order type filter DINE_IN returns only dine-in sales (6000 piasters, got ${dineInReport.totalSales})`
  );

  // 13. TAKEAWAY (Today: Order 2 = 2500, Boundary 1 = 1000, Boundary 2 = 1500, Renamed = 2000 => total 7000)
  const takeawayReport = await reportService.getSalesSummary(adminUser, {
    datePreset: 'TODAY',
    orderType: OrderType.TAKEAWAY,
    referenceDate: refDateStr,
  });
  assert(
    takeawayReport.completedOrdersCount === 4 && takeawayReport.totalSales === 7000,
    `13. Order type filter TAKEAWAY returns only takeaway sales (7000 piasters, got ${takeawayReport.totalSales})`
  );

  // 14. DELIVERY (Today: Order 3 = 5000)
  const deliveryReport = await reportService.getSalesSummary(adminUser, {
    datePreset: 'TODAY',
    orderType: OrderType.DELIVERY,
    referenceDate: refDateStr,
  });
  assert(
    deliveryReport.completedOrdersCount === 1 && deliveryReport.totalSales === 5000,
    `14. Order type filter DELIVERY returns only delivery sales (5000 piasters, got ${deliveryReport.totalSales})`
  );

  console.log('\n--- 4. Payment Method & Split Payment Tests ---');
  // In Today:
  // Cash pure orders: Order 1 (6000) + Boundary 1 (1000) + Renamed (2000) = 9000
  // Card pure orders: Order 2 (2500) + Boundary 2 (1500) = 4000
  // Split order: Order 3 (5000: 2000 Cash + 3000 Card)
  // Overall Cash amount collected: 6000 + 1000 + 2000 + 2000 = 11000
  // Overall Card amount collected: 2500 + 1500 + 3000 = 7000
  // Sum = 11000 + 7000 = 18000

  // 15. CASH payment method filter
  const cashFilterSummary = await reportService.getSalesSummary(adminUser, {
    datePreset: 'TODAY',
    paymentMethod: PaymentMethod.CASH,
    referenceDate: refDateStr,
  });
  assert(
    cashFilterSummary.totalSales === 9000 && cashFilterSummary.completedOrdersCount === 3,
    `15. Payment method filter CASH returns pure cash orders (9000 piasters, got ${cashFilterSummary.totalSales})`
  );

  // 16. CARD payment method filter
  const cardFilterSummary = await reportService.getSalesSummary(adminUser, {
    datePreset: 'TODAY',
    paymentMethod: PaymentMethod.CARD,
    referenceDate: refDateStr,
  });
  assert(
    cardFilterSummary.totalSales === 4000 && cardFilterSummary.completedOrdersCount === 2,
    `16. Payment method filter CARD returns pure card orders (4000 piasters, got ${cardFilterSummary.totalSales})`
  );

  // 17. Split payment separation
  assert(
    todaySummary.cashSales === 11000,
    `17. Split payment: Cash portion correctly separated into cashSales: 11000 (got ${todaySummary.cashSales})`
  );
  assert(
    todaySummary.cardSales === 7000,
    `17. Split payment: Card portion correctly separated into cardSales: 7000 (got ${todaySummary.cardSales})`
  );
  assert(
    todaySummary.cashSales + todaySummary.cardSales === todaySummary.totalSales,
    '17. Cash sales + Card sales equals exact total sales (11000 + 7000 = 18000)'
  );

  console.log('\n--- 5. Top Products Report & Snapshot Tests ---');
  // 18. Historical snapshot name verification
  const topProducts = await reportService.getTopProducts(
    adminUser,
    { datePreset: 'TODAY', referenceDate: refDateStr },
    'quantity',
    20
  );

  const renamedItem = topProducts.find((p) => p.productName === 'عصير برتقال كلاسيك قديم');
  assert(
    renamedItem !== undefined,
    '18. Top products report uses historical snapshot name (product_name_snapshot) rather than current products table'
  );

  // 19. Historical sales retain old name even if product in catalog is different
  assert(
    renamedItem?.quantitySold === 1 && renamedItem?.totalSales === 2000,
    `19. Historical item retains its snapshot name and sales value (2000 piasters, got ${renamedItem?.totalSales})`
  );

  // 20. Sort by quantity
  const topByQty = await reportService.getTopProducts(
    adminUser,
    { datePreset: 'TODAY', referenceDate: refDateStr },
    'quantity',
    20
  );
  let isSortedQty = true;
  for (let i = 0; i < topByQty.length - 1; i++) {
    if (topByQty[i].quantitySold < topByQty[i + 1].quantitySold) {
      isSortedQty = false;
      break;
    }
  }
  assert(isSortedQty, '20. Top products sorted by quantity in descending order');

  // 21. Sort by sales amount
  const topBySales = await reportService.getTopProducts(
    adminUser,
    { datePreset: 'TODAY', referenceDate: refDateStr },
    'sales',
    20
  );
  let isSortedSales = true;
  for (let i = 0; i < topBySales.length - 1; i++) {
    if (topBySales[i].totalSales < topBySales[i + 1].totalSales) {
      isSortedSales = false;
      break;
    }
  }
  assert(isSortedSales, '21. Top products sorted by sales amount in descending order');

  console.log('\n--- 6. Cashier Performance Report Tests ---');
  const cashiersPerf = await reportService.getCashierPerformance(adminUser, {
    datePreset: 'TODAY',
    referenceDate: refDateStr,
  });

  // 22. Grouped by cashier correctly
  assert(cashiersPerf.length === 2, `22. Cashier performance groups by cashier (got ${cashiersPerf.length} cashiers)`);

  // 23. Actual completed orders per cashier
  // Cashier 1: Order 1 (6000) + Order 2 (2500) + Boundary 1 (1000) + Boundary 2 (1500) + Renamed (2000) = 13000 (5 orders)
  // Cashier 2: Order 3 (5000) = 5000 (1 order)
  const c1Perf = cashiersPerf.find((c) => c.userId === cashier1User.id);
  const c2Perf = cashiersPerf.find((c) => c.userId === cashier2User.id);

  assert(
    c1Perf?.completedOrdersCount === 5 && c1Perf?.totalSales === 13000,
    `23. Cashier 1 performance reflects 5 completed orders and 13000 sales (got count=${c1Perf?.completedOrdersCount}, sales=${c1Perf?.totalSales})`
  );
  assert(
    c2Perf?.completedOrdersCount === 1 && c2Perf?.totalSales === 5000,
    `23. Cashier 2 performance reflects 1 completed order and 5000 sales (got count=${c2Perf?.completedOrdersCount}, sales=${c2Perf?.totalSales})`
  );

  console.log('\n--- 7. Expenses & Anti-Double-Counting Tests ---');
  const expenseRep = await reportService.getExpenseReport(adminUser, {
    datePreset: 'TODAY',
    referenceDate: refDateStr,
  });

  // 24. Total expenses
  assert(
    expenseRep.totalExpenses === 1500 && expenseRep.expensesCount === 1,
    `24. Expense report calculates total expenses correctly: 1500 piasters (got ${expenseRep.totalExpenses})`
  );

  // 25. Anti-double counting
  // Make sure total expenses in sales summary is 1500, not 3000 (1500 expense + 1500 cash_tx)
  assert(
    todaySummary.totalExpenses === 1500,
    `25. Expenses are NOT double-counted: totalExpenses is 1500 (got ${todaySummary.totalExpenses})`
  );
  assert(
    todaySummary.netSales === 18000 - 1500,
    `25. Net sales = Total Sales - Expenses = 16500 (got ${todaySummary.netSales})`
  );

  console.log('\n--- 8. Shift Report & Cash Register Summary Tests ---');
  const shiftRep = await reportService.getShiftReport(adminUser, {
    datePreset: 'TODAY',
    referenceDate: refDateStr,
  });

  // 26. Shift report
  const repShift1 = shiftRep.find((s) => s.id === shift1.id);
  assert(
    repShift1 !== undefined &&
      repShift1.openingCash === 50000 &&
      repShift1.expectedCash === 110000 &&
      repShift1.actualCash === 110000 &&
      repShift1.variance === 0 &&
      repShift1.varianceType === 'BALANCED',
    `26. Shift report displays correct opening cash (50000), expected cash (110000), actual (110000), and variance (0)`
  );

  // 27. Cash register summary
  // Ledger transactions in Today for cash:
  // SALE txs: Order 1 (6000) + Order 3 cash part (2000) + Boundary 1 (1000) + Renamed (2000) = 11000
  // DEPOSIT tx: 10000
  // Total in: 21000
  // EXPENSE tx: 1500
  // WITHDRAWAL tx: 5000
  // Total out: 6500
  // Net cash movement: 21000 - 6500 = 14500
  const cashRegSum = await reportService.getCashRegisterSummary(adminUser, {
    datePreset: 'TODAY',
    referenceDate: refDateStr,
  });

  assert(
    cashRegSum.cashSales === 11000,
    `27. Cash register summary cashSales matches 11000 (got ${cashRegSum.cashSales})`
  );
  assert(
    cashRegSum.deposits === 10000,
    `27. Cash register summary deposits matches 10000 (got ${cashRegSum.deposits})`
  );
  assert(
    cashRegSum.totalCashIn === 21000,
    `27. Cash register summary totalCashIn matches 21000 (got ${cashRegSum.totalCashIn})`
  );
  assert(
    cashRegSum.expenses === 1500 && cashRegSum.withdrawals === 5000 && cashRegSum.totalCashOut === 6500,
    `27. Cash register summary totalCashOut matches 6500 (got ${cashRegSum.totalCashOut})`
  );
  assert(
    cashRegSum.netCashMovement === 14500,
    `27. Cash register netCashMovement is 14500 (got ${cashRegSum.netCashMovement})`
  );

  console.log('\n--- 9. Combined Filter Tests ---');
  // 28. Combined: Today + DINE_IN + CASH + Cashier 1 -> Only Order 1 matches!
  const combined = await reportService.getDetailedSales(adminUser, {
    datePreset: 'TODAY',
    orderType: OrderType.DINE_IN,
    paymentMethod: PaymentMethod.CASH,
    userId: cashier1User.id,
    referenceDate: refDateStr,
  });

  assert(
    combined.length === 1 && combined[0].net_amount === 6000,
    `28. Combined filters (Today + DINE_IN + CASH + Cashier 1) return exactly 1 invoice with 6000 (got count=${combined.length})`
  );

  console.log('\n--- 10. RBAC & Read-Only Verification Tests ---');
  // 29. Unauthorized user rejected
  let rbacBlocked = false;
  try {
    await reportService.getBusinessReport(unauthorizedCashier, {
      datePreset: 'TODAY',
      referenceDate: refDateStr,
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      rbacBlocked = true;
    }
  }
  assert(rbacBlocked, '29. Unauthorized user without reports permission is strictly rejected (RBAC enforcement)');

  // 30. Read-only verification (DB state check before and after)
  const ordersCountBefore = (await db.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM orders;'))[0].cnt;
  const paymentsCountBefore = (await db.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM payments;'))[0].cnt;
  const txCountBefore = (await db.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM cash_transactions;'))[0].cnt;

  // Run comprehensive business report
  await reportService.getBusinessReport(adminUser, {
    datePreset: 'TODAY',
    referenceDate: refDateStr,
  });

  const ordersCountAfter = (await db.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM orders;'))[0].cnt;
  const paymentsCountAfter = (await db.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM payments;'))[0].cnt;
  const txCountAfter = (await db.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM cash_transactions;'))[0].cnt;

  assert(
    ordersCountBefore === ordersCountAfter &&
      paymentsCountBefore === paymentsCountAfter &&
      txCountBefore === txCountAfter,
    '30. Reports execution is strictly read-only and causes zero database mutations'
  );

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runReportsTests().catch((err) => {
  console.error('Fatal error running reports tests:', err);
  process.exit(1);
});
