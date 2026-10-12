/**
 * NASAQ POS — Phase 12A: Dynamic Invoice Design & Customization Test Suite
 *
 * Verifies:
 * 1. Default invoice design configuration retrieval & integrity
 * 2. Template catalog validation (5 distinct templates)
 * 3. Validation rules (invalid template ID, invalid paper width)
 * 4. RBAC permission checks (settings.edit required to modify or reset)
 * 5. Configuration updates & persistence in SettingsRepository
 * 6. Store settings synchronization (store_name, store_phone, store_address, receipt_width)
 * 7. Reset to defaults functionality & persistence
 * 8. Corrupted JSON resilience & fallback handling
 * 9. Comprehensive audit logging (INVOICE_TEMPLATE_CHANGED, INVOICE_SETTINGS_UPDATED, INVOICE_SETTINGS_RESET)
 * 10. Financial immutability: invoice design changes NEVER alter historical invoice/order data
 * 11. Invoice to Receipt data mapping (Dine-in, Takeaway, Delivery)
 * 12. Sample invoice preview data integrity
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { SettingsRepository } from '../src/repositories/SettingsRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { InvoiceRepository } from '../src/repositories/InvoiceRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { PaymentRepository } from '../src/repositories/PaymentRepository';
import { ShiftRepository } from '../src/repositories/ShiftRepository';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { InvoiceDesignService, SETTINGS_KEY_INVOICE_DESIGN } from '../src/features/invoices/design/services/InvoiceDesignService';
import {
  DEFAULT_INVOICE_DESIGN_CONFIG,
  INVOICE_TEMPLATES_CATALOG,
  SAMPLE_INVOICE_DATA,
} from '../src/features/invoices/design/constants';
import { mapInvoiceDetailsToReceiptData } from '../src/features/invoices/design/utils/receiptFormatter';
import { AuthenticatedUser } from '../src/features/auth/types';
import { RoleCode } from '../src/domain/enums';
import { ValidationError } from '../src/database/errors';
import { UnauthorizedError } from '../src/features/auth/errors';
import { generateId } from '../src/utils/id';
import { InvoiceDetailsDTO } from '../src/features/invoices/types';

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

async function runInvoiceDesignTests(): Promise<void> {
  console.log('\n======================================================================');
  console.log('🚀 NASAQ POS — PHASE 12A: DYNAMIC INVOICE DESIGN & CUSTOMIZATION TESTS');
  console.log('======================================================================\n');

  const db = DatabaseManager.getInstance();
  await db.initialize();

  const settingsRepo = new SettingsRepository();
  const auditRepo = new AuditLogRepository();
  const invoiceRepo = new InvoiceRepository();
  const orderRepo = new OrderRepository();
  const paymentRepo = new PaymentRepository();
  const userRepo = new UserRepository();
  const roleRepo = new RoleRepository();

  const designService = new InvoiceDesignService(settingsRepo, auditRepo);

  // Setup test users
  const adminRole = await roleRepo.findByCode(RoleCode.ADMIN);
  const cashierRole = await roleRepo.findByCode(RoleCode.CASHIER);
  const nowIso = new Date().toISOString();

  const adminUser: AuthenticatedUser = {
    id: generateId('usr'),
    username: 'admin_designer',
    name: 'مدير النظام',
    roleId: adminRole!.id,
    roleCode: RoleCode.ADMIN,
    roleName: 'مدير النظام',
    permissions: ['settings.view', 'settings.edit'],
  };

  const cashierUser: AuthenticatedUser = {
    id: generateId('usr'),
    username: 'cashier_user',
    name: 'كاشير الصالة',
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: 'كاشير',
    permissions: ['pos.create_order', 'pos.view'],
  };

  await userRepo.create({
    id: adminUser.id,
    role_id: adminRole!.id,
    username: adminUser.username,
    password_hash: 'hash-test',
    name: adminUser.name,
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  await userRepo.create({
    id: cashierUser.id,
    role_id: cashierRole!.id,
    username: cashierUser.username,
    password_hash: 'hash-test',
    name: cashierUser.name,
    is_active: 1,
    created_at: nowIso,
    updated_at: nowIso,
  });

  // -------------------------------------------------------------------------
  // 1. Template Catalog Integrity
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Template Catalog & Metadata ---');
  assert(
    INVOICE_TEMPLATES_CATALOG.length === 5,
    'Catalog provides exactly 5 professional templates'
  );

  const templateIds = INVOICE_TEMPLATES_CATALOG.map((t) => t.id);
  assert(templateIds.includes('classic'), 'Classic template exists in catalog');
  assert(templateIds.includes('modern_minimal'), 'Modern Minimal template exists in catalog');
  assert(templateIds.includes('compact_pos'), 'Compact POS template exists in catalog');
  assert(templateIds.includes('bold_restaurant'), 'Bold Restaurant template exists in catalog');
  assert(templateIds.includes('elegant'), 'Elegant template exists in catalog');

  const allHaveNamesAndFeatures = INVOICE_TEMPLATES_CATALOG.every(
    (t) => t.name.length > 0 && t.description.length > 0 && t.features.length >= 2
  );
  assert(allHaveNamesAndFeatures, 'All templates have Arabic titles, descriptions, and feature lists');

  // -------------------------------------------------------------------------
  // 2. Default Configuration
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Default Configuration ---');
  const initialConfig = await designService.getConfig();
  assert(initialConfig.version === 1, 'Default configuration has version 1');
  assert(initialConfig.templateId === 'classic', 'Default template is "classic"');
  assert(initialConfig.paperWidth === '80mm', 'Default paper width is "80mm"');
  assert(initialConfig.showStoreName === true, 'Store name is visible by default');
  assert(initialConfig.showInvoiceNumber === true, 'Invoice number is visible by default');
  assert(initialConfig.showDateTime === true, 'Date and time are visible by default');
  assert(initialConfig.showSubtotal === true, 'Subtotal is visible by default');
  assert(initialConfig.showPaymentMethod === true, 'Payment method is visible by default');
  assert(initialConfig.showFooter === true, 'Footer is visible by default');

  // -------------------------------------------------------------------------
  // 3. Validation Rules
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Validation Rules ---');
  let invalidTemplateCaught = false;
  try {
    await designService.updateConfig(adminUser, {
      templateId: 'unsupported_fancy_template' as any,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      invalidTemplateCaught = true;
    }
  }
  assert(invalidTemplateCaught, 'Rejects unsupported template ID with ValidationError');

  let invalidPaperCaught = false;
  try {
    await designService.updateConfig(adminUser, {
      paperWidth: '100mm' as any,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      invalidPaperCaught = true;
    }
  }
  assert(invalidPaperCaught, 'Rejects unsupported paper width with ValidationError');

  // -------------------------------------------------------------------------
  // 4. RBAC Permission Checks
  // -------------------------------------------------------------------------
  console.log('\n--- 4. RBAC Permission Checks ---');
  let cashierUpdateBlocked = false;
  try {
    await designService.updateConfig(cashierUser, {
      templateId: 'modern_minimal',
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      cashierUpdateBlocked = true;
    }
  }
  assert(cashierUpdateBlocked, 'Cashier without settings.edit cannot update invoice design');

  let cashierResetBlocked = false;
  try {
    await designService.resetConfig(cashierUser);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      cashierResetBlocked = true;
    }
  }
  assert(cashierResetBlocked, 'Cashier without settings.edit cannot reset invoice design');

  // -------------------------------------------------------------------------
  // 5. Configuration Update & Persistence
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Configuration Update & Persistence ---');
  const updatedConfig = await designService.updateConfig(adminUser, {
    templateId: 'bold_restaurant',
    paperWidth: '58mm',
    storeName: 'مطعم الأهرامات الأصلي',
    storePhone: '01234567890',
    storeAddress: 'الجيزة - شارع الهرم',
    taxNumber: '999-888-777',
    showItemNotes: true,
    showItemBarcode: false,
    showDiscount: true,
    footerText: 'أهلاً وسهلاً بكم دائماً في مطعم الأهرامات',
    showFooter2: true,
    footerText2: 'الأسعار شاملة ضريبة القيمة المضافة',
  });

  assert(updatedConfig.templateId === 'bold_restaurant', 'Active template updated to bold_restaurant');
  assert(updatedConfig.paperWidth === '58mm', 'Active paper width updated to 58mm');
  assert(updatedConfig.storeName === 'مطعم الأهرامات الأصلي', 'Store name updated');
  assert(updatedConfig.taxNumber === '999-888-777', 'Tax number updated');
  assert(updatedConfig.showItemNotes === true, 'showItemNotes toggled to true');
  assert(updatedConfig.showFooter2 === true, 'showFooter2 toggled to true');

  // Reload from database to verify persistence
  const reloadedConfig = await designService.getConfig();
  assert(reloadedConfig.templateId === 'bold_restaurant', 'Reloaded template matches persisted value');
  assert(reloadedConfig.paperWidth === '58mm', 'Reloaded paper width matches persisted value');
  assert(reloadedConfig.storeName === 'مطعم الأهرامات الأصلي', 'Reloaded store name matches persisted value');
  assert(reloadedConfig.storePhone === '01234567890', 'Reloaded store phone matches persisted value');
  assert(reloadedConfig.footerText === 'أهلاً وسهلاً بكم دائماً في مطعم الأهرامات', 'Reloaded footer matches persisted value');

  // Check synchronization with general store settings
  const storeNameSetting = await settingsRepo.get('store_name');
  const storePhoneSetting = await settingsRepo.get('store_phone');
  const receiptWidthSetting = await settingsRepo.get('receipt_width');
  assert(storeNameSetting === 'مطعم الأهرامات الأصلي', 'store_name setting synchronized in settings table');
  assert(storePhoneSetting === '01234567890', 'store_phone setting synchronized in settings table');
  assert(receiptWidthSetting === '58', 'receipt_width setting synchronized in settings table');

  // -------------------------------------------------------------------------
  // 6. Audit Logging Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Audit Logging Verification ---');
  const auditLogs = await auditRepo.findByEntity('settings', SETTINGS_KEY_INVOICE_DESIGN);
  const templateChangedLog = auditLogs.find((l) => l.action === 'INVOICE_TEMPLATE_CHANGED');
  const settingsUpdatedLog = auditLogs.find((l) => l.action === 'INVOICE_SETTINGS_UPDATED');

  assert(Boolean(templateChangedLog), 'Logged INVOICE_TEMPLATE_CHANGED in audit log');
  if (templateChangedLog && templateChangedLog.details_json) {
    const details = JSON.parse(templateChangedLog.details_json);
    assert(details.new_template === 'bold_restaurant', 'Audit log records correct new template');
  }

  assert(Boolean(settingsUpdatedLog), 'Logged INVOICE_SETTINGS_UPDATED in audit log');

  // -------------------------------------------------------------------------
  // 7. Reset to Defaults
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Reset to Defaults ---');
  const resetResult = await designService.resetConfig(adminUser);
  assert(resetResult.templateId === 'classic', 'Reset restored template to classic');
  assert(resetResult.paperWidth === '80mm', 'Reset restored paper width to 80mm');
  assert(resetResult.showStoreName === true, 'Reset restored standard visibility');

  const reloadedAfterReset = await designService.getConfig();
  assert(reloadedAfterReset.templateId === 'classic', 'Reloaded config after reset is classic');

  const resetAuditLogs = await auditRepo.findByEntity('settings', SETTINGS_KEY_INVOICE_DESIGN);
  const resetLog = resetAuditLogs.find((l) => l.action === 'INVOICE_SETTINGS_RESET');
  assert(Boolean(resetLog), 'Logged INVOICE_SETTINGS_RESET in audit log');

  // -------------------------------------------------------------------------
  // 8. Corrupted JSON Resilience
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Corrupted JSON Resilience ---');
  await settingsRepo.set(SETTINGS_KEY_INVOICE_DESIGN, '{ corrupted invalid json:::');
  const resilientConfig = await designService.getConfig();
  assert(
    resilientConfig.templateId === 'classic' && resilientConfig.version === 1,
    'Falls back gracefully to default configuration without throwing an uncaught exception'
  );

  // Restore clean state for further tests
  await designService.resetConfig(adminUser);

  // -------------------------------------------------------------------------
  // 9. Financial Immutability
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Financial Immutability ---');
  // Create a realistic order and invoice in the database
  const shiftRepo = new ShiftRepository();
  const testShiftId = generateId('shf');
  const testOrderId = generateId('ord');
  const testInvoiceId = generateId('inv');
  const now = new Date().toISOString();

  await shiftRepo.create({
    id: testShiftId,
    shift_number: 'SHF-TEST-01',
    user_id: adminUser.id,
    opened_at: now,
    closed_at: null,
    opening_cash: 100000,
    expected_cash: 100000,
    actual_cash: null,
    cash_difference: null,
    status: 'OPEN',
    notes: 'وردية اختبار الفواتير',
  });

  await orderRepo.create({
    id: testOrderId,
    order_number: 'ORD-TEST-99',
    order_type: 'DINE_IN',
    status: 'COMPLETED',
    customer_id: null,
    table_id: null,
    table_number: '12',
    delivery_driver_id: null,
    delivery_status: null,
    shift_id: testShiftId,
    user_id: adminUser.id,
    notes: null,
    subtotal: 50000,
    discount_type: 'FIXED',
    discount_value: 5000,
    discount_amount: 5000,
    tax_rate: 14,
    tax_amount: 7000,
    delivery_fee: 0,
    total: 52000,
    created_at: now,
    updated_at: now,
  });

  await invoiceRepo.create({
    id: testInvoiceId,
    invoice_number: 'INV-TEST-99',
    order_id: testOrderId,
    shift_id: testShiftId,
    status: 'PAID',
    total_amount: 50000,
    tax_amount: 7000,
    discount_amount: 5000,
    net_amount: 52000,
    customer_name_snapshot: null,
    cashier_name_snapshot: adminUser.name,
    printed_count: 1,
    last_printed_at: now,
    created_at: now,
  });

  const invoiceBefore = await invoiceRepo.findById(testInvoiceId);

  // Now change invoice design templates and toggle several visual settings
  await designService.updateConfig(adminUser, {
    templateId: 'elegant',
    paperWidth: '58mm',
    showTax: false,
    showSubtotal: false,
    showDiscount: false,
  });

  const invoiceAfter = await invoiceRepo.findById(testInvoiceId);
  const orderAfter = await orderRepo.findById(testOrderId);

  assert(invoiceBefore !== null && invoiceAfter !== null, 'Invoice exists before and after');
  assert(invoiceAfter!.net_amount === 52000, 'Historical invoice net amount remains strictly 52000 cents');
  assert(invoiceAfter!.total_amount === 50000, 'Historical invoice total amount remains strictly 50000 cents');
  assert(invoiceAfter!.tax_amount === 7000, 'Historical invoice tax amount remains strictly 7000 cents');
  assert(invoiceAfter!.discount_amount === 5000, 'Historical invoice discount amount remains strictly 5000 cents');
  assert(invoiceAfter!.invoice_number === 'INV-TEST-99', 'Historical invoice number is unchanged');
  assert(orderAfter!.total === 52000, 'Order total remains strictly unchanged');

  // -------------------------------------------------------------------------
  // 10. Receipt Data Mapping & Formatting
  // -------------------------------------------------------------------------
  console.log('\n--- 10. Receipt Data Mapping (receiptFormatter) ---');
  const mockInvoiceDTO: InvoiceDetailsDTO = {
    invoice: {
      id: testInvoiceId,
      invoice_number: 'INV-TEST-99',
      order_id: testOrderId,
      cashier_name_snapshot: 'أحمد محمود',
      shift_id: 'shf_123',
      status: 'PAID',
      total_amount: 50000,
      tax_amount: 7000,
      discount_amount: 5000,
      net_amount: 54500,
      customer_name_snapshot: null,
      printed_count: 2,
      last_printed_at: now,
      created_at: now,
    },
    order: {
      id: testOrderId,
      order_number: 'ORD-TEST-99',
      order_type: 'DELIVERY',
      table_number: null,
      status: 'COMPLETED',
      subtotal: 50000,
      discount_type: 'FIXED',
      discount_value: 5000,
      discount_amount: 5000,
      tax_rate: 14,
      tax_amount: 7000,
      delivery_fee: 2500,
      total: 54500,
      customer_id: 'cust_1',
      shift_id: 'shf_123',
      user_id: adminUser.id,
      notes: null,
      created_at: now,
      updated_at: now,
    },
    items: [
      {
        id: 'item_1',
        order_id: testOrderId,
        product_id: 'prod_1',
        product_name_snapshot: 'شاورما عربي دجاج',
        unit_price: 12000,
        quantity: 2,
        notes: 'زيادة ثومية وبدون خيار',
        total: 24000,
        barcode: '62210001',
      } as any,
      {
        id: 'item_2',
        order_id: testOrderId,
        product_id: 'prod_2',
        product_name_snapshot: 'بطاطس مقلية عائلي',
        unit_price: 5000,
        quantity: 1,
        notes: null,
        total: 5000,
      },
    ],
    payments: [
      {
        id: 'pmt_1',
        order_id: testOrderId,
        shift_id: testShiftId,
        payment_method: 'CASH',
        amount: 54500,
        tender_amount: 60000,
        change_amount: 5500,
        reference_number: null,
        created_at: now,
      },
    ],
    customer: {
      id: 'cust_1',
      name: 'كريم عبد العزيز',
      phone: '01012345678',
      address: 'المعادي - شارع النصر، عمارة 4، شقة 10',
    },
    delivery: {
      id: 'del_1',
      driver_name_snapshot: 'محمود سائق التوصيل',
      delivery_address_snapshot: 'المعادي - شارع النصر، عمارة 4، شقة 10',
    },
  } as any;

  const receiptData = mapInvoiceDetailsToReceiptData(mockInvoiceDTO);

  assert(receiptData.invoiceNumber === 'INV-TEST-99', 'Receipt mapper extracts invoice number');
  assert(receiptData.orderNumber === 'ORD-TEST-99', 'Receipt mapper extracts order number');
  assert(receiptData.cashierName === 'أحمد محمود', 'Receipt mapper extracts cashier name');
  assert(receiptData.orderType === 'DELIVERY', 'Receipt mapper extracts order type');
  assert(receiptData.customerName === 'كريم عبد العزيز', 'Receipt mapper extracts customer name');
  assert(receiptData.customerPhone === '01012345678', 'Receipt mapper extracts customer phone');
  assert(receiptData.deliveryAddress === 'المعادي - شارع النصر، عمارة 4، شقة 10', 'Receipt mapper extracts delivery address');
  assert(receiptData.deliveryDriverName === 'محمود سائق التوصيل', 'Receipt mapper extracts driver name');
  assert(receiptData.items.length === 2, 'Receipt mapper extracts 2 items');
  assert(receiptData.items[0].name === 'شاورما عربي دجاج', 'Item 1 name snapshot preserved');
  assert(receiptData.items[0].quantity === 2, 'Item 1 quantity preserved');
  assert(receiptData.items[0].unitPrice === 12000, 'Item 1 unit price preserved in minor units');
  assert(receiptData.items[0].total === 24000, 'Item 1 total price preserved in minor units');
  assert(receiptData.items[0].barcode === '62210001', 'Item 1 barcode mapped');
  assert(receiptData.items[0].notes === 'زيادة ثومية وبدون خيار', 'Item 1 notes mapped');
  assert(receiptData.subtotal === 50000, 'Subtotal mapped (50000 minor units)');
  assert(receiptData.taxAmount === 7000, 'Tax mapped (7000 minor units)');
  assert(receiptData.discountAmount === 5000, 'Discount mapped (5000 minor units)');
  assert(receiptData.deliveryFee === 2500, 'Delivery fee mapped (2500 minor units)');
  assert(receiptData.total === 54500, 'Grand total mapped (54500 minor units)');
  assert(receiptData.payments.length === 1, 'Payment mapped');
  assert(receiptData.payments[0].method === 'CASH', 'Payment method is CASH');
  assert(receiptData.payments[0].tenderAmount === 60000, 'Tendered amount mapped (60000 minor units)');
  assert(receiptData.payments[0].changeAmount === 5500, 'Change due mapped (5500 minor units)');

  // -------------------------------------------------------------------------
  // 11. Sample Preview Data
  // -------------------------------------------------------------------------
  console.log('\n--- 11. Sample Preview Data ---');
  const sample = designService.getSampleInvoiceData();
  assert(sample.invoiceNumber.length > 0, 'Sample data has valid invoice number');
  assert(sample.items.length >= 3, 'Sample data has at least 3 items for realistic preview');
  assert(sample.total > 0, 'Sample grand total is positive');
  assert(sample.payments.length > 0, 'Sample has payment details');

  // Summary
  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runInvoiceDesignTests().catch((err) => {
  console.error('Fatal error during invoice design tests:', err);
  process.exit(1);
});
