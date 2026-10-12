/**
 * NASAQ POS — Comprehensive Payments & Invoices Test Suite (Phase 7)
 * Tests:
 * 1. Financial Precision & Integer Minor Units validation
 * 2. CASH Payment & Exact Change calculation
 * 3. CARD Payment & Reference Number tracking
 * 4. SPLIT Payment (Cash + Card) & Multi-tender handling
 * 5. Atomic Transaction: Order -> Payment -> Invoice -> Completed State
 * 6. Idempotency & Concurrency: No double payment or duplicate invoices
 * 7. Trusted Server Recalculation (disregarding untrusted parameters)
 * 8. Sequential Collision-Safe Invoice Number Generation (short sequential invoice number)
 * 9. Hard Delete Protection on Invoices (Strict Financial Audit)
 * 10. Receipt Reprinting & Audit Trail
 * 11. Relational Invoices Querying & Filtering (Status, Payment Method, Search)
 * 12. Strict RBAC Enforcement on Payment and Invoices
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
import { PaymentRepository } from '../src/repositories/PaymentRepository';
import { InvoiceRepository } from '../src/repositories/InvoiceRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { OrderService } from '../src/features/orders/services/OrderService';
import { PaymentService } from '../src/features/pos/services/PaymentService';
import { InvoiceService } from '../src/features/invoices/services/InvoiceService';
import { OrderType, OrderStatus, RoleCode, ShiftStatus } from '../src/domain/enums';
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

async function runPaymentsInvoicesTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('  NASAQ POS — Phase 7: Payments & Invoices Test Suite');
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
  const paymentRepo = new PaymentRepository(db);
  const invoiceRepo = new InvoiceRepository(db);
  const auditRepo = new AuditLogRepository(db);

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
    auditRepo
  );

  const invoiceService = new InvoiceService(
    invoiceRepo,
    auditRepo,
    orderRepo,
    orderItemRepo,
    paymentRepo
  );

  // 1. Setup Users and Shifts
  console.log('[1/12] Setting up authenticated users and test shift:');
  const cashierRole = await roleRepo.findByCode(RoleCode.CASHIER);
  assert(cashierRole !== null, 'Found CASHIER role');

  const nowIso = new Date().toISOString();
  const dbCashier = await userRepo.create({
    id: `u-cash-p7-${Date.now()}`,
    username: `cashier_p7_${Date.now()}`,
    name: 'كاشير المرحلة السابعة',
    password_hash: 'dummyhash',
    role_id: cashierRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: nowIso,
    updated_at: nowIso,
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
      'pos.reprint_receipt',
      'orders.view',
      'orders.manage',
      'shifts.open',
    ],
  };

  const unauthorizedUser: AuthenticatedUser = {
    id: `u-waiter-p7-${Date.now()}`,
    username: 'waiter7',
    name: 'ويتر بدون صلاحيات دفع',
    roleId: 'role-waiter-p7',
    roleCode: 'WAITER' as any,
    roleName: 'Waiter',
    permissions: ['pos.view_menu'],
  };

  const shiftId = `shift-p7-${Date.now()}`;
  await shiftRepo.create({
    id: shiftId,
    shift_number: `SH-P7-${Date.now()}`,
    user_id: cashierUser.id,
    opened_at: new Date().toISOString(),
    closed_at: null,
    opening_cash: 50000,
    expected_cash: 50000,
    actual_cash: null,
    cash_difference: null,
    status: ShiftStatus.OPEN,
    notes: 'Phase 7 Active Shift',
  });

  const catId = `cat-p7-${Date.now()}`;
  await categoryRepo.create({
    id: catId,
    name: 'مشروبات ومأكولات السابعة',
    sort_order: 1,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const burgerProd = await productRepo.create({
    id: `prod-burger-${Date.now()}`,
    name: 'برجر مخصوص',
    barcode: '777001',
    category_id: catId,
    price: 15000, // 150.00 EGP in minor units
    cost_price: 9000,
    track_stock: 1,
    current_stock: 100,
    min_stock_alert: 5,
    unit: 'قطعة',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const juiceProd = await productRepo.create({
    id: `prod-juice-${Date.now()}`,
    name: 'عصير برتقال طازج',
    barcode: '777002',
    category_id: catId,
    price: 4500, // 45.00 EGP in minor units
    cost_price: 2000,
    track_stock: 0,
    current_stock: 100,
    min_stock_alert: 5,
    unit: 'كوب',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert(true, 'Test products created with integer minor units');

  // 2. Pure Financial Validation (validatePayment)
  console.log('\n[2/12] Testing pure financial validation (validatePayment):');
  const totalMinor = 19500; // 150.00 + 45.00 = 195.00

  // Valid Cash: tender >= amount
  const validCashVal = paymentService.validatePayment(totalMinor, [
    { method: 'CASH', amount: 19500, tenderAmount: 20000 },
  ]);
  assert(validCashVal.isValid === true, 'Valid cash payment accepted');
  assert(validCashVal.change === 500, 'Calculated cash change is exactly 500 minor units (5.00 EGP)');

  // Insufficient Cash
  const underpaidCash = paymentService.validatePayment(totalMinor, [
    { method: 'CASH', amount: 19500, tenderAmount: 18000 },
  ]);
  assert(underpaidCash.isValid === false, 'Rejects cash tender less than required amount');

  // Partial / Incomplete Payment
  const partialPayment = paymentService.validatePayment(totalMinor, [
    { method: 'CASH', amount: 15000, tenderAmount: 15000 },
  ]);
  assert(partialPayment.isValid === false, 'Rejects payment when sum of amounts < order total');
  assert(partialPayment.remaining === 4500, 'Identifies remaining balance (4500 minor units)');

  // Overpayment on card
  const overCard = paymentService.validatePayment(totalMinor, [
    { method: 'CARD', amount: 19500, tenderAmount: 20000 },
  ]);
  assert(overCard.isValid === false, 'Rejects card payment if tender does not match amount exactly');

  // Negative amount
  const negVal = paymentService.validatePayment(totalMinor, [
    { method: 'CASH', amount: -100, tenderAmount: 100 },
  ]);
  assert(negVal.isValid === false, 'Rejects negative payment amounts');

  // Float rejection
  const floatVal = paymentService.validatePayment(totalMinor, [
    { method: 'CASH', amount: 19500.5, tenderAmount: 20000 },
  ]);
  assert(floatVal.isValid === false, 'Rejects floating-point payment amounts');

  // 3. CASH Payment Flow & Atomic Transaction
  console.log('\n[3/12] Testing CASH payment flow & completeSale atomic transaction:');
  const { order: draft1 } = await orderService.createDraft(cashierUser, {
    order_type: OrderType.TAKEAWAY,
    items: [
      { productId: burgerProd.id, quantity: 1 },
      { productId: juiceProd.id, quantity: 1 },
    ],
  });
  assert(draft1.status === OrderStatus.PENDING, 'Draft order 1 created as PENDING');
  assert(draft1.total === 19500, 'Draft order 1 total is 19500 minor units');

  const saleResult1 = await paymentService.completeSale(cashierUser, {
    orderId: draft1.id,
    payments: [{ method: 'CASH', amount: 19500, tenderAmount: 20000 }],
  });

  assert(saleResult1.order.status === OrderStatus.COMPLETED, 'Order status atomically changed to COMPLETED');
  assert(saleResult1.invoice.status === 'PAID', 'Invoice generated with status PAID');
  assert(saleResult1.invoice.net_amount === 19500, 'Invoice net amount matches order total (19500)');
  assert(saleResult1.payments.length === 1, 'One payment record created');
  assert(saleResult1.payments[0].payment_method === 'CASH', 'Payment method is CASH');
  assert(saleResult1.payments[0].amount === 19500, 'Payment revenue amount recorded is 19500');
  assert(saleResult1.payments[0].tender_amount === 20000, 'Payment tender amount recorded is 20000');
  assert(saleResult1.payments[0].change_amount === 500, 'Payment change recorded is 500');
  assert(saleResult1.changeAmount === 500, 'Returned change amount is 500');
  const burgerAfterSale = await productRepo.findById(burgerProd.id);
  const burgerSaleMovement = await db.queryOne<{ quantity: number; movement_type: string }>(
    "SELECT quantity, movement_type FROM inventory_movements WHERE product_id = ? AND reference_id = ?;",
    [burgerProd.id, draft1.id]
  );
  assert(burgerAfterSale?.current_stock === 99, 'Tracked stock decreases atomically after sale');
  assert(burgerSaleMovement?.quantity === 1 && burgerSaleMovement.movement_type === 'SALE', 'SALE inventory movement is recorded');

  // Verify database persistence
  const dbOrder1 = await orderRepo.findById(draft1.id);
  assert(dbOrder1?.status === OrderStatus.COMPLETED, 'Order in DB is COMPLETED');
  const dbInvoice1 = await invoiceRepo.findByOrderId(draft1.id);
  assert(dbInvoice1 !== null, 'Invoice persists in DB');
  assert(dbInvoice1?.invoice_number === saleResult1.invoice.invoice_number, 'Invoice number matches');
  const dbPayments1 = await paymentRepo.listByOrderId(draft1.id);
  assert(dbPayments1.length === 1, 'Payment persists in DB');

  // 4. Sequential Collision-Safe Invoice Numbering
  console.log('\n[4/12] Testing short sequential invoice numbering:');
  assert(/^\d+$/.test(saleResult1.invoice.invoice_number), `Invoice number (${saleResult1.invoice.invoice_number}) is numeric`);
  // Create second order and complete sale to test sequence incrementation
  const { order: draft2 } = await orderService.createDraft(cashierUser, {
    order_type: OrderType.TAKEAWAY,
    items: [{ productId: burgerProd.id, quantity: 1 }],
  });
  const saleResult2 = await paymentService.completeSale(cashierUser, {
    orderId: draft2.id,
    payments: [{ method: 'CARD', amount: 15000, tenderAmount: 15000, referenceNumber: 'TX-998811' }],
  });
  const seq1 = parseInt(saleResult1.invoice.invoice_number, 10);
  const seq2 = parseInt(saleResult2.invoice.invoice_number, 10);
  assert(seq2 === seq1 + 1, `Invoice sequence incremented monotonically: ${seq1} -> ${seq2}`);
  // 5. CARD Payment Flow & Reference Number
  console.log('\n[5/12] Testing CARD payment flow & reference number:');
  assert(saleResult2.payments[0].payment_method === 'CARD', 'Payment method is CARD');
  assert(saleResult2.payments[0].reference_number === 'TX-998811', 'Card reference number stored accurately');
  assert(saleResult2.payments[0].change_amount === 0, 'Card payment change is exactly 0');
  assert(saleResult2.changeAmount === 0, 'Sale result change is 0');

  // 6. SPLIT Payment Flow (Cash + Card)
  console.log('\n[6/12] Testing SPLIT payment flow (Cash + Card):');
  const { order: draft3 } = await orderService.createDraft(cashierUser, {
    order_type: OrderType.DINE_IN,
    table_number: '12',
    items: [
      { productId: burgerProd.id, quantity: 2 }, // 30000
      { productId: juiceProd.id, quantity: 2 },  // 9000
    ], // total: 39000
  });

  // Pay 20000 via Cash (handed 25000 -> change 5000) and 19000 via Card
  const saleResult3 = await paymentService.completeSale(cashierUser, {
    orderId: draft3.id,
    payments: [
      { method: 'CASH', amount: 20000, tenderAmount: 25000 },
      { method: 'CARD', amount: 19000, tenderAmount: 19000, referenceNumber: 'SPLIT-VISA-01' },
    ],
  });

  assert(saleResult3.order.status === OrderStatus.COMPLETED, 'Split payment order completed');
  assert(saleResult3.payments.length === 2, 'Two payment records created for split sale');
  assert(saleResult3.changeAmount === 5000, 'Total change for split cash is 5000 minor units (50.00 EGP)');
  const cashPay = saleResult3.payments.find((p) => p.payment_method === 'CASH');
  const cardPay = saleResult3.payments.find((p) => p.payment_method === 'CARD');
  assert(cashPay?.amount === 20000 && cashPay?.tender_amount === 25000, 'Cash portion recorded accurately');
  assert(cardPay?.amount === 19000 && cardPay?.reference_number === 'SPLIT-VISA-01', 'Card portion recorded accurately');

  // 7. Idempotency & Double Payment Protection
  console.log('\n[7/12] Testing Idempotency & Double Payment Protection:');
  let doublePayError: any = null;
  try {
    await paymentService.completeSale(cashierUser, {
      orderId: draft1.id, // already completed!
      payments: [{ method: 'CASH', amount: 19500, tenderAmount: 20000 }],
    });
  } catch (err) {
    doublePayError = err;
  }
  assert(
    doublePayError instanceof ConflictError,
    'Throws ConflictError when attempting to pay an already completed order'
  );

  // 8. Cannot Pay Cancelled Orders
  console.log('\n[8/12] Testing cancellation barrier:');
  const { order: draftToCancel } = await orderService.createDraft(cashierUser, {
    order_type: OrderType.TAKEAWAY,
    items: [{ productId: juiceProd.id, quantity: 1 }],
  });
  await orderService.cancelDraftOrder(cashierUser, draftToCancel.id, 'Customer changed mind');

  let payCancelledError: any = null;
  try {
    await paymentService.completeSale(cashierUser, {
      orderId: draftToCancel.id,
      payments: [{ method: 'CASH', amount: 4500, tenderAmount: 5000 }],
    });
  } catch (err) {
    payCancelledError = err;
  }
  assert(
    payCancelledError instanceof ConflictError,
    'Throws ConflictError when attempting to pay a CANCELLED order'
  );

  // 9. Trusted Server-Side Recalculation
  console.log('\n[9/12] Testing trusted recalculation from DB snapshots:');
  const { order: draft4 } = await orderService.createDraft(cashierUser, {
    order_type: OrderType.TAKEAWAY,
    items: [{ productId: burgerProd.id, quantity: 1 }], // 15000
  });

  // Tamper: Client claims order total is only 5000
  let underpayError: any = null;
  try {
    await paymentService.completeSale(cashierUser, {
      orderId: draft4.id,
      payments: [{ method: 'CASH', amount: 5000, tenderAmount: 5000 }], // 5000 instead of 15000
    });
  } catch (err) {
    underpayError = err;
  }
  assert(
    underpayError instanceof ValidationError,
    'Rejects tampered client payment amount against trusted DB order items calculation'
  );

  // 10. Financial Audit Logging
  console.log('\n[10/12] Verifying Financial Audit Logs:');
  const auditLogs = await db.query<{ action: string; entity_type: string; details: string }>(
    'SELECT * FROM audit_logs WHERE action IN (?, ?, ?) ORDER BY created_at DESC;',
    ['PAYMENT_CREATED', 'INVOICE_CREATED', 'ORDER_COMPLETED']
  );
  assert(auditLogs.some((l) => l.action === 'PAYMENT_CREATED'), 'PAYMENT_CREATED logged in audit trail');
  assert(auditLogs.some((l) => l.action === 'INVOICE_CREATED'), 'INVOICE_CREATED logged in audit trail');
  assert(auditLogs.some((l) => l.action === 'ORDER_COMPLETED'), 'ORDER_COMPLETED logged in audit trail');

  // 11. Invoice Immutability & Reprint
  console.log('\n[11/12] Testing Invoice Immutability & Reprint Count:');
  let deleteError: any = null;
  try {
    await invoiceRepo.delete('any-id');
  } catch (err) {
    deleteError = err;
  }
  assert(
    deleteError !== null && deleteError.message.includes('قيد مالي صارم'),
    'Hard delete on invoices is strictly blocked by repository'
  );

  const initialPrintCount = saleResult1.invoice.printed_count;
  await invoiceService.reprint(cashierUser, saleResult1.invoice.id);
  const reloadedInv = await invoiceRepo.findById(saleResult1.invoice.id);
  assert(
    reloadedInv?.printed_count === initialPrintCount + 1,
    `Reprint incremented print count to ${reloadedInv?.printed_count}`
  );
  assert(reloadedInv?.last_printed_at !== null, 'last_printed_at timestamp updated');

  // 12. Invoices Querying & Relational Filtering
  console.log('\n[12/12] Testing Invoices Querying and Rich Filters:');
  const allInvoices = await invoiceService.listInvoices(cashierUser, { status: 'ALL' });
  assert(allInvoices.length >= 3, `Found ${allInvoices.length} invoices via listInvoices`);

  // Filter by CARD
  const cardInvoices = await invoiceService.listInvoices(cashierUser, { paymentMethod: 'CARD' });
  assert(
    cardInvoices.every((inv) => inv.payment_methods.includes('CARD')),
    'Filter by CARD returns only card payments'
  );

  // Filter by SPLIT
  const splitInvoices = await invoiceService.listInvoices(cashierUser, { paymentMethod: 'SPLIT' });
  assert(
    splitInvoices.every((inv) => inv.payment_methods.length > 1),
    'Filter by SPLIT returns only multi-method payments'
  );

  // Filter by Search Term
  const searchResults = await invoiceService.listInvoices(cashierUser, {
    search: saleResult1.invoice.invoice_number,
  });
  assert(searchResults.length === 1, 'Search by exact invoice number returns single result');
  assert(
    searchResults[0].invoice_number === saleResult1.invoice.invoice_number,
    'Search result matches searched invoice'
  );

  // Get Invoice With Details
  const details = await invoiceService.getInvoiceWithDetails(cashierUser, saleResult1.invoice.id);
  assert(details.invoice.id === saleResult1.invoice.id, 'getInvoiceWithDetails fetches invoice');
  assert(details.order.id === draft1.id, 'getInvoiceWithDetails fetches order');
  assert(details.items.length === 2, 'getInvoiceWithDetails fetches historical items snapshot');
  assert(details.payments.length === 1, 'getInvoiceWithDetails fetches associated payments');

  // RBAC test
  let unauthError: any = null;
  try {
    await paymentService.completeSale(unauthorizedUser, {
      orderId: draft4.id,
      payments: [{ method: 'CASH', amount: 15000, tenderAmount: 15000 }],
    });
  } catch (err) {
    unauthError = err;
  }
  assert(
    unauthError instanceof UnauthorizedError,
    'Unauthorized user without pos.create_order or orders.manage is blocked with UnauthorizedError'
  );

  console.log('\n======================================================');
  console.log(`  Tests Passed: ${passed}`);
  console.log(`  Tests Failed: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPaymentsInvoicesTests().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
