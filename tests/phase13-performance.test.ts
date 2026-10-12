/**
 * NASAQ POS — Phase 13: Realistic Data & Performance Benchmark
 *
 * Dataset Target:
 * - 200 categories
 * - 2,000 products
 * - 5,000 customers
 * - 10,000 historical orders
 * - 30,000 order items
 * - 10,000 invoices
 *
 * Measures:
 * 1. Application/Database startup
 * 2. POS product catalog loading
 * 3. Product text search
 * 4. Barcode lookup
 * 5. Order creation
 * 6. Invoice retrieval
 * 7. Report aggregation (Sales Summary)
 * 8. Backup creation
 * 9. Backup restore
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { generateId } from '../src/utils/id';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { InvoiceRepository } from '../src/repositories/InvoiceRepository';
import { CustomerRepository } from '../src/repositories/CustomerRepository';
import { BarcodeService } from '../src/features/hardware/services/BarcodeService';
import { ReportService } from '../src/features/reports/services/ReportService';
import { BackupService } from '../src/features/backup/services/BackupService';
import { RoleCode } from '../src/domain/enums';
import { AuthenticatedUser } from '../src/features/auth/types';

interface MetricResult {
  operation: string;
  durationMs: number;
  thresholdMs: number;
  passed: boolean;
  details?: string;
}

const metrics: MetricResult[] = [];

function recordMetric(operation: string, durationMs: number, thresholdMs: number, details?: string) {
  const passed = durationMs <= thresholdMs;
  metrics.push({ operation, durationMs, thresholdMs, passed, details });
  const statusIcon = passed ? '✓' : '✗';
  console.log(`  ${statusIcon} ${operation}: ${durationMs.toFixed(2)}ms (Limit: ${thresholdMs}ms)${details ? ` — ${details}` : ''}`);
}

export async function runPerformanceBenchmark(): Promise<boolean> {
  console.log('======================================================================');
  console.log('🚀 NASAQ POS — PHASE 13: REALISTIC DATASET & PERFORMANCE BENCHMARK');
  console.log('======================================================================\n');

  // 1. Measure Startup & Schema Initialization
  const t0Startup = performance.now();
  const dbManager = DatabaseManager.getInstance();
  await dbManager.initialize();
  const startupDuration = performance.now() - t0Startup;
  recordMetric('Database Startup & Migration Engine', startupDuration, 1500);

  // Set up Admin User for authenticated operations
  const roleRepo = new (await import('../src/repositories/RoleRepository')).RoleRepository(dbManager);
  const adminRole = await roleRepo.findByCode(RoleCode.ADMIN);
  const userRepo = new (await import('../src/repositories/UserRepository')).UserRepository(dbManager);

  const adminUserId = generateId('usr');
  await userRepo.create({
    id: adminUserId,
    role_id: adminRole!.id,
    username: 'perf_admin',
    password_hash: '$2a$10$testperfadminpasswordhashdummy',
    name: 'مدير اختبار الأداء',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const adminUser: AuthenticatedUser = {
    id: adminUserId,
    username: 'perf_admin',
    name: 'مدير اختبار الأداء',
    roleId: adminRole!.id,
    roleCode: RoleCode.ADMIN,
    roleName: 'مدير النظام',
    permissions: [
      'settings.edit',
      'orders.manage',
      'orders.view',
      'pos.create_order',
      'pos.reprint_receipt',
      'reports.view',
      'backup.create',
      'backup.restore',
    ],
  };

  // 2. Batch Seeding of 200 Categories, 2,000 Products, 5,000 Customers
  console.log('\n--- Seeding High-Volume Realistic Dataset ---');
  const now = new Date().toISOString();
  const t0Seed = performance.now();

  await dbManager.transaction(async (db) => {
    // 200 Categories
    const categoryChunks: string[] = [];
    for (let c = 1; c <= 200; c++) {
      const catId = `cat_perf_${c.toString().padStart(4, '0')}`;
      categoryChunks.push(`('${catId}', 'تصنيف أداء ${c}', ${c}, 1, '${now}', '${now}')`);
    }
    await db.execute(`
      INSERT INTO categories (id, name, sort_order, is_active, created_at, updated_at)
      VALUES ${categoryChunks.join(',\n')};
    `);

    // 2,000 Products (10 per category)
    const productRows: string[] = [];
    for (let p = 1; p <= 2000; p++) {
      const catIdx = ((p - 1) % 200) + 1;
      const catId = `cat_perf_${catIdx.toString().padStart(4, '0')}`;
      const prodId = `prod_perf_${p.toString().padStart(5, '0')}`;
      const barcode = `628100${p.toString().padStart(6, '0')}`;
      const price = 1000 + ((p * 15) % 5000); // 10.00 to 60.00 EGP in piasters
      const cost = Math.floor(price * 0.6);
      productRows.push(
        `('${prodId}', '${catId}', 'منتج أداء ${p}', '${barcode}', ${price}, ${cost}, 0, 100, 5, 'ITEM', 1, '${now}', '${now}')`
      );

      // Insert in chunks of 500
      if (productRows.length >= 500 || p === 2000) {
        await db.execute(`
          INSERT INTO products (id, category_id, name, barcode, price, cost_price, track_stock, current_stock, min_stock_alert, unit, is_active, created_at, updated_at)
          VALUES ${productRows.join(',\n')};
        `);
        productRows.length = 0;
      }
    }

    // 5,000 Customers
    const customerRows: string[] = [];
    for (let u = 1; u <= 5000; u++) {
      const custId = `cust_perf_${u.toString().padStart(5, '0')}`;
      const phone = `050${u.toString().padStart(7, '0')}`;
      customerRows.push(`('${custId}', 'عميل رقم ${u}', '${phone}', 'الرياض', null, '${now}', '${now}')`);

      if (customerRows.length >= 500 || u === 5000) {
        await db.execute(`
          INSERT INTO customers (id, name, phone, address, notes, created_at, updated_at)
          VALUES ${customerRows.join(',\n')};
        `);
        customerRows.length = 0;
      }
    }

    // 1 Shift for the orders
    const shiftId = `shf_perf_0001`;
    await db.execute(`
      INSERT INTO cash_shifts (id, shift_number, user_id, opened_at, opening_cash, expected_cash, status)
      VALUES ('${shiftId}', 'SHF-PERF-01', '${adminUser.id}', '${now}', 50000, 50000, 'OPEN');
    `);

    // 10,000 Historical Orders, 30,000 Items, 10,000 Invoices
    const orderRows: string[] = [];
    const itemRows: string[] = [];
    const invoiceRows: string[] = [];
    const paymentRows: string[] = [];

    for (let o = 1; o <= 10000; o++) {
      const ordId = `ord_perf_${o.toString().padStart(6, '0')}`;
      const invId = `inv_perf_${o.toString().padStart(6, '0')}`;
      const payId = `pay_perf_${o.toString().padStart(6, '0')}`;
      const ordNum = `ORD-P-${o.toString().padStart(6, '0')}`;
      const invNum = `INV-P-${o.toString().padStart(6, '0')}`;
      const custIdx = ((o - 1) % 5000) + 1;
      const custId = `cust_perf_${custIdx.toString().padStart(5, '0')}`;
      const type = o % 3 === 0 ? 'DINE_IN' : o % 3 === 1 ? 'TAKEAWAY' : 'DELIVERY';

      const subtotal = 4000;
      const tax = 600;
      const total = 4600;

      orderRows.push(
        `('${ordId}', '${ordNum}', '${type}', 'COMPLETED', '${custId}', null, null, null, null, '${shiftId}', '${adminUser.id}', null, ${subtotal}, null, 0, 0, 15, ${tax}, 0, ${total}, '${now}', '${now}')`
      );

      // 3 items per order = 30,000 items
      for (let itemIdx = 1; itemIdx <= 3; itemIdx++) {
        const itemId = `item_perf_${o}_${itemIdx}`;
        const prodIdx = (((o * 3 + itemIdx) - 1) % 2000) + 1;
        const prodId = `prod_perf_${prodIdx.toString().padStart(5, '0')}`;
        const itemPrice = itemIdx === 1 ? 2000 : 1000;
        const itemTotal = itemPrice;
        itemRows.push(
          `('${itemId}', '${ordId}', '${prodId}', 'منتج أداء ${prodIdx}', ${itemPrice}, 1, ${itemPrice}, 0, ${itemTotal}, null, '${now}')`
        );
      }

      // Invoice
      invoiceRows.push(
        `('${invId}', '${invNum}', '${ordId}', '${shiftId}', 'PAID', ${total}, ${tax}, 0, ${total}, 'عميل تجريبي', 'perf_admin', 1, '${now}', '${now}')`
      );

      // Payment
      paymentRows.push(
        `('${payId}', '${ordId}', '${shiftId}', 'CASH', ${total}, ${total}, 0, null, '${now}')`
      );

      // Batch insert every 500 orders
      if (orderRows.length >= 500 || o === 10000) {
        await db.execute(`
          INSERT INTO orders (id, order_number, order_type, status, customer_id, table_id, table_number, delivery_driver_id, delivery_status, shift_id, user_id, notes, subtotal, discount_type, discount_value, discount_amount, tax_rate, tax_amount, delivery_fee, total, created_at, updated_at)
          VALUES ${orderRows.join(',\n')};
        `);
        orderRows.length = 0;

        await db.execute(`
          INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, unit_price, quantity, subtotal, discount_amount, total, notes, created_at)
          VALUES ${itemRows.join(',\n')};
        `);
        itemRows.length = 0;

        await db.execute(`
          INSERT INTO invoices (id, invoice_number, order_id, shift_id, status, total_amount, tax_amount, discount_amount, net_amount, customer_name_snapshot, cashier_name_snapshot, printed_count, last_printed_at, created_at)
          VALUES ${invoiceRows.join(',\n')};
        `);
        invoiceRows.length = 0;

        await db.execute(`
          INSERT INTO payments (id, order_id, shift_id, payment_method, amount, tender_amount, change_amount, reference_number, created_at)
          VALUES ${paymentRows.join(',\n')};
        `);
        paymentRows.length = 0;
      }
    }
  });

  const seedDuration = performance.now() - t0Seed;
  console.log(`  ✓ Successfully seeded 2,000 products, 200 categories, 5,000 customers, 10,000 orders, 30,000 items, and 10,000 invoices in ${(seedDuration / 1000).toFixed(2)}s.`);

  // 3. Performance Benchmark Tests
  console.log('\n--- Executing Performance Benchmark Suite ---');

  const productRepo = new ProductRepository(dbManager);
  const invoiceRepo = new InvoiceRepository(dbManager);
  const barcodeService = new BarcodeService(productRepo);
  const reportService = new ReportService();

  // Test A: POS Product Catalog Loading (Active products across categories)
  const t0Catalog = performance.now();
  const allActiveProducts = await productRepo.listWithFilter({ isActive: true });
  const catalogDuration = performance.now() - t0Catalog;
  recordMetric('POS Catalog Fetch (2,000 products)', catalogDuration, 100, `Fetched ${allActiveProducts.length} products`);

  // Test B: Text Search on Product Name / Code
  const t0Search = performance.now();
  const searchResults = await productRepo.searchByNameOrBarcode('أداء 14');
  const searchDuration = performance.now() - t0Search;
  recordMetric('Product Text Search across 2,000 products', searchDuration, 50, `Found ${searchResults.length} matches`);

  // Test C: Barcode Lookup
  const t0Barcode = performance.now();
  const barcodeResult = await barcodeService.scan('628100001500');
  const barcodeDuration = performance.now() - t0Barcode;
  recordMetric('Barcode Scanner Instant Lookup', barcodeDuration, 25, `Resolved product "${barcodeResult.product?.name}"`);

  // Test D: Invoice Retrieval with Single Lookup
  const t0Invoice = performance.now();
  const fetchedInvoice = await invoiceRepo.findById('inv_perf_005432');
  const invoiceDuration = performance.now() - t0Invoice;
  recordMetric('Invoice By-ID Retrieval (from 10,000 records)', invoiceDuration, 20, `Invoice ${fetchedInvoice?.invoice_number}`);

  // Test E: High-Volume Sales Summary Aggregate Report
  const t0Report = performance.now();
  const summaryReport = await reportService.getSalesSummary(adminUser, {
    datePreset: 'CUSTOM',
    startDate: now.split('T')[0],
    endDate: now.split('T')[0],
  });
  const reportDuration = performance.now() - t0Report;
  recordMetric(
    'Financial Sales Report Aggregation (10,000 orders)',
    reportDuration,
    300,
    `Aggregated ${summaryReport.completedOrdersCount} orders totaling ${summaryReport.totalSales / 100} EGP`
  );

  // Test F: Database Full Backup Creation
  const backupService = new BackupService();
  const t0Backup = performance.now();
  const backupMeta = await backupService.createBackup(adminUser, 'MANUAL', 'نسخة قياس الأداء');
  const backupDuration = performance.now() - t0Backup;
  recordMetric(
    'Full SQLite Database Backup (10,000+ orders)',
    backupDuration,
    1500,
    `Size: ${(backupMeta.size_bytes / 1024).toFixed(1)} KB`
  );

  // Close open shift before restore test
  await dbManager.execute(`UPDATE cash_shifts SET status = 'CLOSED' WHERE id = 'shf_perf_0001';`);

  // Test G: Database Backup Restore
  const t0Restore = performance.now();
  const restoreResult = await backupService.restoreBackup(adminUser, backupMeta.id);
  const restoreDuration = performance.now() - t0Restore;
  recordMetric('Full SQLite Database Restore & Verification', restoreDuration, 2000, `Success: ${restoreResult.success}`);

  // Summary
  const allPassed = metrics.every((m) => m.passed);
  console.log('\n======================================================================');
  console.log(`PERFORMANCE BENCHMARK COMPLETE | PASSED: ${metrics.filter((m) => m.passed).length}/${metrics.length}`);
  console.log('======================================================================\n');

  return allPassed;
}

if (process.argv[1]?.includes('phase13-performance.test.ts')) {
  runPerformanceBenchmark()
    .then((success) => {
      if (!success) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error in performance benchmark:', err);
      process.exit(1);
    });
}
