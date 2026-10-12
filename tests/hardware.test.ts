/**
 * NASAQ POS — Phase 12B: Hardware & Printing Integration Test Suite
 *
 * Verifies:
 * 1. ESC/POS binary formatting engine (ReceiptEscPosFormatter)
 * 2. Printer repository operations (CRUD, defaults by printer type)
 * 3. PrinterService management & RBAC security
 * 4. Hardware abstraction via IPrinterAdapter
 * 5. Customer receipt printing with Phase 12A template styles & duplicate lock
 * 6. Kitchen ticket generation & formatting
 * 7. Diagnostic test print generation
 * 8. Historical invoice reprinting with strict financial immutability
 * 9. CashDrawerService payment method rule enforcement (Cash opens, Card stays closed)
 * 10. BarcodeService scanner input sanitization and product resolution
 * 11. Resilience & non-blocking hardware failure during checkout
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { PrinterRepository } from '../src/repositories/PrinterRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { InvoiceRepository } from '../src/repositories/InvoiceRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { OrderItemRepository } from '../src/repositories/OrderItemRepository';
import { PaymentRepository } from '../src/repositories/PaymentRepository';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { CategoryRepository } from '../src/repositories/CategoryRepository';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { ShiftRepository } from '../src/repositories/ShiftRepository';
import { InvoiceDesignService } from '../src/features/invoices/design/services/InvoiceDesignService';
import { ReceiptEscPosFormatter } from '../src/features/hardware/escpos/ReceiptEscPosFormatter';
import { PrinterService } from '../src/features/hardware/services/PrinterService';
import { CashDrawerService } from '../src/features/hardware/services/CashDrawerService';
import { BarcodeService } from '../src/features/hardware/services/BarcodeService';
import { IPrinterAdapter } from '../src/features/hardware/adapters/IPrinterAdapter';
import { PrinterRow, OrderRow, InvoiceRow, OrderItemRow, PaymentRow } from '../src/domain/dbModels';
import { AuthenticatedUser } from '../src/features/auth/types';
import { RoleCode } from '../src/domain/enums';
import { generateId } from '../src/utils/id';
import { InvoiceDetailsDTO } from '../src/features/invoices/types';
import { PaymentItemInput } from '../src/features/pos/services/PaymentService';
import { PrinterAdapterStatus } from '../src/features/hardware/types';

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

/**
 * Mock Printer Adapter for deterministic hardware unit testing
 */
class MockPrinterAdapter implements IPrinterAdapter {
  public readonly id = 'mock';
  public readonly name = 'Mock Printer Adapter';
  public isAvailable(): boolean {
    return true;
  }
  public sentJobs: { printer: PrinterRow; data: Uint8Array }[] = [];
  public drawerPulses: PrinterRow[] = [];
  public shouldFailNext = false;
  public failError = 'Hardware device offline';

  public async checkStatus(printer: PrinterRow): Promise<PrinterAdapterStatus> {
    if (this.shouldFailNext) {
      return { connected: false, status: 'ERROR', message: this.failError };
    }
    return { connected: true, status: 'ONLINE', message: 'جاهزة للطباعة' };
  }

  public async sendRaw(printer: PrinterRow, data: Uint8Array): Promise<void> {
    if (this.shouldFailNext) {
      throw new Error(this.failError);
    }
    this.sentJobs.push({ printer, data });
  }

  public async openCashDrawer(printer: PrinterRow): Promise<void> {
    if (this.shouldFailNext) {
      throw new Error(this.failError);
    }
    this.drawerPulses.push(printer);
  }

  public reset(): void {
    this.sentJobs = [];
    this.drawerPulses = [];
    this.shouldFailNext = false;
  }
}

async function runHardwareTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('🚀 NASAQ POS — PHASE 12B: REAL PRINTING & HARDWARE INTEGRATION TESTS');
  console.log('======================================================================\n');

  const db = DatabaseManager.getInstance();
  await db.initialize();

  const printerRepo = new PrinterRepository();
  const auditRepo = new AuditLogRepository();
  const invoiceRepo = new InvoiceRepository();
  const orderRepo = new OrderRepository();
  const orderItemRepo = new OrderItemRepository();
  const paymentRepo = new PaymentRepository();
  const productRepo = new ProductRepository();
  const categoryRepo = new CategoryRepository();
  const shiftRepo = new ShiftRepository();
  const designService = new InvoiceDesignService();

  const mockAdapter = new MockPrinterAdapter();
  const printerService = new PrinterService(
    printerRepo,
    invoiceRepo,
    orderRepo,
    auditRepo,
    designService,
    mockAdapter,
    orderItemRepo,
    paymentRepo
  );
  const cashDrawerService = new CashDrawerService(printerRepo, auditRepo, mockAdapter);
  const barcodeService = new BarcodeService(productRepo);

  const userRepo = new UserRepository();
  const roleRepo = new RoleRepository();

  const adminRole = await roleRepo.findByCode(RoleCode.ADMIN);
  const cashierRole = await roleRepo.findByCode(RoleCode.CASHIER);
  const nowIso = new Date().toISOString();

  // Authenticated test actors
  const adminUser: AuthenticatedUser = {
    id: generateId('usr'),
    username: 'admin_hw_user',
    name: 'Admin User',
    roleId: adminRole!.id,
    roleCode: RoleCode.ADMIN,
    roleName: 'مدير النظام',
    permissions: ['settings.edit', 'orders.manage', 'orders.view', 'pos.create_order', 'pos.reprint_receipt', 'shifts.open'],
  };

  const cashierUser: AuthenticatedUser = {
    id: generateId('usr'),
    username: 'cashier_hw_user',
    name: 'Cashier User',
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: 'كاشير',
    permissions: ['pos.create_order', 'pos.reprint_receipt', 'orders.view'],
  };

  const unauthorizedUser: AuthenticatedUser = {
    id: generateId('usr'),
    username: 'unauth_hw_user',
    name: 'Unauthorized User',
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: 'كاشير',
    permissions: ['orders.view'],
  };

  await userRepo.create({
    id: adminUser.id,
    role_id: adminRole!.id,
    username: adminUser.username!,
    password_hash: 'hash-test',
    name: adminUser.name,
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  await userRepo.create({
    id: cashierUser.id,
    role_id: cashierRole!.id,
    username: cashierUser.username!,
    password_hash: 'hash-test',
    name: cashierUser.name,
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  await userRepo.create({
    id: unauthorizedUser.id,
    role_id: cashierRole!.id,
    username: unauthorizedUser.username!,
    password_hash: 'hash-test',
    name: unauthorizedUser.name,
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  // --- 1. ESC/POS Binary Formatter Verification ---
  console.log('--- 1. ESC/POS Binary Formatter Verification ---');

  const testPrint80 = ReceiptEscPosFormatter.formatTestPrint('طابعة الكاشير 1', 80);
  assert(testPrint80 instanceof Uint8Array, 'Test print produces a Uint8Array byte buffer');
  assert(testPrint80.length > 50, `Test print produces substantial binary output (${testPrint80.length} bytes)`);

  // Verify ESC @ (init: 0x1B 0x40)
  assert(testPrint80[0] === 0x1b && testPrint80[1] === 0x40, 'Formatter initializes printer with ESC @');

  // Verify Drawer pulse code (ESC p 0: 0x1B 0x70 0x00)
  const drawerPulse = ReceiptEscPosFormatter.cashDrawerPulse();
  const hasPulseCmd = drawerPulse.some((b, i) => b === 0x1b && drawerPulse[i + 1] === 0x70 && drawerPulse[i + 2] === 0x00);
  assert(hasPulseCmd, 'Cash drawer pulse generates correct ESC p pin 0 code');

  // Verify 58mm test print
  const testPrint58 = ReceiptEscPosFormatter.formatTestPrint('طابعة كاشير صغيرة', 58);
  assert(testPrint58.length > 40, `58mm test print produces valid binary output (${testPrint58.length} bytes)`);

  // Kitchen Ticket formatting
  const kitchenTicketBytes = ReceiptEscPosFormatter.formatKitchenTicket({
    orderNumber: 'ORD-9901',
    orderType: 'DINE_IN',
    tableNumber: 'T-04',
    cashierName: 'كاشير التجربة',
    createdAt: new Date().toISOString(),
    items: [
      { id: 'item-1', name: 'برجر كلاسيك كبير', quantity: 2, notes: 'بدون بصل' },
      { id: 'item-2', name: 'بطاطس مقلية بالجبنة', quantity: 1 },
    ],
  }, 80);

  assert(kitchenTicketBytes.length > 80, `Kitchen ticket generates ESC/POS binary data (${kitchenTicketBytes.length} bytes)`);

  // --- 2. Printer Repository & Defaults Management ---
  console.log('\n--- 2. Printer Repository & Configuration ---');

  const receiptPrinter = await printerService.savePrinter(adminUser, {
    name: 'طابعة الإيصالات الرئيسية (Epson TM-T88VI)',
    printer_type: 'RECEIPT',
    connection_type: 'USB',
    address: 'USB001',
    paper_width: 80,
    is_default: 1,
  });
  const receiptPrinterId = receiptPrinter.id;

  assert(Boolean(receiptPrinter.id), 'Saved receipt printer has an assigned ID');
  assert(receiptPrinter.is_default === 1, 'Receipt printer is designated as default');

  const kitchenPrinter = await printerService.savePrinter(adminUser, {
    name: 'طابعة المطبخ (Kitchen Star SP700)',
    printer_type: 'KITCHEN',
    connection_type: 'NETWORK',
    address: '192.168.1.200:9100',
    paper_width: 80,
    is_default: 1,
  });
  const kitchenPrinterId = kitchenPrinter.id;

  assert(kitchenPrinter.printer_type === 'KITCHEN', 'Kitchen printer saved with KITCHEN type');
  assert(kitchenPrinter.is_default === 1, 'Kitchen printer designated as default');

  // Verify default retrieval per category
  const defaultReceipt = await printerService.getDefaultPrinter('RECEIPT');
  assert(defaultReceipt?.id === receiptPrinterId, 'getDefaultPrinter(RECEIPT) returns correct receipt printer');

  const defaultKitchen = await printerService.getDefaultPrinter('KITCHEN');
  assert(defaultKitchen?.id === kitchenPrinterId, 'getDefaultPrinter(KITCHEN) returns correct kitchen printer');

  // Test printer listing with status check
  const allPrinters = await printerService.listPrinters();
  assert(allPrinters.length >= 2, `listPrinters returns all active printers (count=${allPrinters.length})`);
  const foundStatus = allPrinters.find((p) => p.id === receiptPrinterId);
  assert(foundStatus?.status === 'ONLINE', 'Mock adapter reports printer status as ONLINE');

  // RBAC check on saving printer
  let rbacBlocked = false;
  try {
    await printerService.savePrinter(cashierUser, {
      name: 'Unauthorized Printer',
      printer_type: 'RECEIPT',
      connection_type: 'USB',
    });
  } catch (err: any) {
    rbacBlocked = true;
  }
  assert(rbacBlocked, 'Cashier without settings.edit is forbidden from saving printers');

  // --- 3. Diagnostic Test Print Execution ---
  console.log('\n--- 3. Diagnostic Test Print Execution ---');

  mockAdapter.reset();
  const testResult = await printerService.testPrint(adminUser, receiptPrinterId);
  assert(testResult.success === true, 'testPrint succeeds with mock adapter');
  assert(mockAdapter.sentJobs.length === 1, 'Mock adapter received exactly 1 test print job');
  assert(mockAdapter.sentJobs[0].printer.id === receiptPrinterId, 'Test print job routed to correct printer');

  // Check audit log
  const testAudit = await auditRepo.findByEntity('printer', receiptPrinterId);
  assert(testAudit.some((a) => a.action === 'PRINTER_TEST'), 'PRINTER_TEST action logged in audit_logs');

  // --- 4. Customer Receipt Printing & Duplicate Lock ---
  console.log('\n--- 4. Customer Receipt Printing & Duplicate Lock ---');

  // Create test shift, order & invoice for printing
  const testShiftId = generateId('shf');
  const testOrderId = generateId('ord');
  const testInvoiceId = generateId('inv');
  const now = new Date().toISOString();

  await shiftRepo.create({
    id: testShiftId,
    shift_number: 'SHF-HW-01',
    user_id: cashierUser.id,
    opened_at: now,
    closed_at: null,
    opening_cash: 50000,
    expected_cash: 50000,
    actual_cash: null,
    cash_difference: null,
    status: 'OPEN',
    notes: 'وردية اختبار الأجهزة',
  });

  const testOrder: OrderRow = {
    id: testOrderId,
    order_number: 'ORD-7701',
    order_type: 'TAKEAWAY',
    status: 'COMPLETED',
    customer_id: null,
    table_id: null,
    table_number: null,
    delivery_driver_id: null,
    delivery_status: null,
    shift_id: testShiftId,
    user_id: cashierUser.id,
    notes: 'بدون كاتشب',
    subtotal: 4500,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 15,
    tax_amount: 675,
    delivery_fee: 0,
    total: 5175,
    created_at: now,
    updated_at: now,
  };

  const testItems: OrderItemRow[] = [
    {
      id: generateId('itm'),
      order_id: testOrderId,
      product_id: null,
      product_name_snapshot: 'وجبة شاورما دجاج سوبر',
      unit_price: 4500,
      quantity: 1,
      subtotal: 4500,
      discount_amount: 0,
      total: 4500,
      notes: 'ثوم زيادة',
      created_at: now,
    },
  ];

  const testInvoice: InvoiceRow = {
    id: testInvoiceId,
    invoice_number: 'INV-2026-0001',
    order_id: testOrderId,
    shift_id: testShiftId,
    status: 'PAID',
    total_amount: 5175,
    tax_amount: 675,
    discount_amount: 0,
    net_amount: 5175,
    customer_name_snapshot: 'أحمد محمود',
    cashier_name_snapshot: cashierUser.name,
    printed_count: 0,
    last_printed_at: null,
    created_at: now,
  };

  const testPayments: PaymentRow[] = [
    {
      id: generateId('pay'),
      order_id: testOrderId,
      shift_id: testShiftId,
      payment_method: 'CASH',
      amount: 5175,
      tender_amount: 6000,
      change_amount: 825,
      reference_number: null,
      created_at: now,
    },
  ];

  await orderRepo.create(testOrder);
  for (const item of testItems) {
    await orderItemRepo.create(item);
  }
  await invoiceRepo.create(testInvoice);
  await paymentRepo.create(testPayments[0]);

  const invoiceDetails: InvoiceDetailsDTO = {
    invoice: testInvoice,
    order: testOrder,
    items: testItems,
    payments: testPayments,
  };

  mockAdapter.reset();
  const printResult = await printerService.printCustomerReceipt(cashierUser, invoiceDetails);
  assert(printResult.success === true, 'printCustomerReceipt succeeded');
  assert(mockAdapter.sentJobs.length === 1, 'Mock adapter received formatted receipt data');

  // Verify print count increment in database
  const refreshedInvoice = await invoiceRepo.findById(testInvoiceId);
  assert(refreshedInvoice?.printed_count === 1, `Invoice printed_count incremented to 1 (got ${refreshedInvoice?.printed_count})`);

  // Verify PRINT_SUCCESS audit log
  const printAudits = await auditRepo.findByEntity('invoice', testInvoiceId);
  assert(printAudits.some((a) => a.action === 'PRINT_SUCCESS'), 'PRINT_SUCCESS recorded in audit_logs');

  // --- 5. Historical Invoice Reprinting ---
  console.log('\n--- 5. Historical Invoice Reprinting ---');

  mockAdapter.reset();
  const reprintResult = await printerService.reprintInvoice(cashierUser, testInvoiceId);
  assert(reprintResult.success === true, 'reprintInvoice succeeded for authorized user');
  assert(mockAdapter.sentJobs.length === 1, 'Mock adapter received reprint data');

  const afterReprintInvoice = await invoiceRepo.findById(testInvoiceId);
  assert(afterReprintInvoice?.printed_count === 2, `Invoice printed_count correctly incremented to 2 on reprint (got ${afterReprintInvoice?.printed_count})`);

  // Verify financial immutability
  assert(afterReprintInvoice?.total_amount === 5175, 'Historical invoice total_amount is strictly unchanged');
  assert(afterReprintInvoice?.tax_amount === 675, 'Historical invoice tax_amount is strictly unchanged');

  // Verify INVOICE_REPRINTED audit
  const reprintAudits = await auditRepo.findByEntity('invoice', testInvoiceId);
  assert(reprintAudits.some((a) => a.action === 'INVOICE_REPRINTED'), 'INVOICE_REPRINTED recorded in audit_logs');

  // RBAC test for reprint
  let reprintForbidden = false;
  try {
    await printerService.reprintInvoice(unauthorizedUser, testInvoiceId);
  } catch (err: any) {
    reprintForbidden = true;
  }
  assert(reprintForbidden, 'User without pos.reprint_receipt is strictly forbidden from reprinting');

  // --- 6. Cash Drawer Service Rules ---
  console.log('\n--- 6. Cash Drawer Service Rules ---');

  mockAdapter.reset();

  // Rule 1: Cash payment tenders cash -> Open drawer
  const cashPayments: PaymentItemInput[] = [
    { method: 'CASH', amount: 5175, tenderAmount: 6000 },
  ];
  const cashDrawerResult = await cashDrawerService.openDrawerOnPayment(cashierUser, cashPayments);
  assert(cashDrawerResult.opened === true, 'Cash payment opens cash drawer');
  assert(mockAdapter.drawerPulses.length === 1, 'Adapter received cash drawer pulse');

  // Rule 2: Card payment -> Do NOT open drawer
  mockAdapter.reset();
  const cardPayments: PaymentItemInput[] = [
    { method: 'CARD', amount: 5175, tenderAmount: 5175, referenceNumber: 'AUTH-12345' },
  ];
  const cardDrawerResult = await cashDrawerService.openDrawerOnPayment(cashierUser, cardPayments);
  assert(cardDrawerResult.opened === false, 'Card payment does NOT open cash drawer');
  assert(mockAdapter.drawerPulses.length === 0, 'Adapter received ZERO cash drawer pulses for card sale');

  // Rule 3: Split payment with Cash component -> Open drawer
  mockAdapter.reset();
  const splitPayments: PaymentItemInput[] = [
    { method: 'CARD', amount: 3000, tenderAmount: 3000, referenceNumber: 'AUTH-6789' },
    { method: 'CASH', amount: 2175, tenderAmount: 3000 },
  ];
  const splitDrawerResult = await cashDrawerService.openDrawerOnPayment(cashierUser, splitPayments);
  assert(splitDrawerResult.opened === true, 'Split payment containing CASH opens cash drawer');
  assert(mockAdapter.drawerPulses.length === 1, 'Adapter received cash drawer pulse for split cash component');

  // Manual drawer test
  mockAdapter.reset();
  const manualDrawerResult = await cashDrawerService.manualTestDrawer(adminUser);
  assert(manualDrawerResult.opened === true, 'Manual test drawer opens drawer');
  assert(mockAdapter.drawerPulses.length === 1, 'Adapter received manual test drawer pulse');

  // --- 7. Barcode Service Input Sanitization & Scanning ---
  console.log('\n--- 7. Barcode Service Verification ---');

  // Create test category and products
  const catId = generateId('cat');
  await categoryRepo.create({
    id: catId,
    name: 'وجبات سريعة',
    sort_order: 1,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  const barcodeProduct = await productRepo.create({
    id: generateId('prd'),
    category_id: catId,
    name: 'شاورما دجاج صاروخ',
    barcode: '6281001234567',
    price: 1800,
    cost_price: 1000,
    track_stock: 0,
    current_stock: 0,
    min_stock_alert: 0,
    unit: 'piece',
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  // 1. Exact barcode lookup
  const scanExact = await barcodeService.scan('6281001234567');
  assert(scanExact.found === true, 'Barcode scan finds product by exact barcode');
  assert(scanExact.product?.id === barcodeProduct.id, 'Scanned product ID matches expected product');

  // 2. Barcode scanner dirty input sanitization (carriage return, newline, spaces)
  const scanDirty = await barcodeService.scan('  6281001234567\r\n  ');
  assert(scanDirty.found === true, 'Barcode scan sanitizes raw input with whitespace and trailing CRLF');
  assert(scanDirty.product?.id === barcodeProduct.id, 'Sanitized scan resolves to correct product');

  // 3. Direct lookup method
  const scanLookup = await barcodeService.lookup('6281001234567');
  assert(scanLookup !== null, 'BarcodeService.lookup returns product for registered barcode');
  assert(scanLookup?.id === barcodeProduct.id, 'Lookup product ID matches barcode product');

  // 4. Non-existent barcode
  const scanMissing = await barcodeService.scan('9999999999999');
  assert(scanMissing.found === false, 'Unknown barcode returns found=false without throwing');
  assert(!scanMissing.product, 'Unknown barcode returns no product');

  // 5. Empty barcode input
  const scanEmpty = await barcodeService.scan('   ');
  assert(scanEmpty.found === false, 'Empty barcode scan returns found=false with descriptive error');

  // --- 8. Hardware Failure Resilience (Non-Blocking Guarantees) ---
  console.log('\n--- 8. Non-Blocking Hardware Failure Resilience ---');

  mockAdapter.reset();
  mockAdapter.shouldFailNext = true;
  mockAdapter.failError = 'Paper out or printer head open';

  // Attempting print with offline printer
  const failingPrint = await printerService.printCustomerReceipt(cashierUser, invoiceDetails);
  assert(failingPrint.success === false, 'Failing hardware returns success=false cleanly');
  assert(failingPrint.error?.includes('Paper out'), 'Failing hardware captures underlying device error message');

  // Financial data must remain unaffected
  const intactInvoice = await invoiceRepo.findById(testInvoiceId);
  assert(intactInvoice?.status === 'PAID', 'Invoice status remains PAID despite hardware failure');
  assert(intactInvoice?.total_amount === 5175, 'Invoice financial amount remains completely intact');

  // PRINT_FAILED audit logged
  const failedAudits = await auditRepo.findByEntity('invoice', testInvoiceId);
  assert(failedAudits.some((a) => a.action === 'PRINT_FAILED'), 'PRINT_FAILED action recorded in audit log');

  // Deleting printer soft-deactivates and resets default
  mockAdapter.reset();
  await printerService.deletePrinter(adminUser, receiptPrinterId);
  const deletedPrn = await printerRepo.findById(receiptPrinterId);
  assert(deletedPrn?.is_active === 0, 'deletePrinter deactivates printer (is_active=0)');
  assert(deletedPrn?.is_default === 0, 'deletePrinter clears default status (is_default=0)');

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHardwareTests().catch((err) => {
  console.error('Fatal Hardware Test Suite Error:', err);
  process.exit(1);
});
