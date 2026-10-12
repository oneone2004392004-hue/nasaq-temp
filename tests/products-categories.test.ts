/**
 * NASAQ POS — Comprehensive Products & Categories Test Suite (Phase 4)
 */

import { DatabaseManager } from '../src/database/DatabaseManager';
import { CategoryRepository } from '../src/repositories/CategoryRepository';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { OrderItemRepository } from '../src/repositories/OrderItemRepository';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { ShiftRepository } from '../src/repositories/ShiftRepository';
import { CategoryService } from '../src/features/categories/services/CategoryService';
import { ProductService } from '../src/features/products/services/ProductService';
import { AuthenticatedUser } from '../src/features/auth/types';
import { RoleCode } from '../src/domain/enums';
import { ValidationError, ConflictError, ConstraintError } from '../src/database/errors';
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

async function runCatalogTests(): Promise<void> {
  console.log('\n======================================================');
  console.log('  NASAQ POS — Products & Categories Test Suite');
  console.log('======================================================\n');

  // Initialize DB
  const db = DatabaseManager.getInstance();
  await db.initialize();

  const userRepo = new UserRepository(db);
  const roleRepo = new RoleRepository(db);
  const shiftRepo = new ShiftRepository(db);
  const categoryRepo = new CategoryRepository(db);
  const productRepo = new ProductRepository(db);
  const auditRepo = new AuditLogRepository(db);
  const orderRepo = new OrderRepository(db);
  const orderItemRepo = new OrderItemRepository(db);

  const categoryService = new CategoryService(categoryRepo, auditRepo);
  const productService = new ProductService(productRepo, categoryRepo, auditRepo);

  // 1. Provision Roles & Users in SQLite
  const adminRole = await roleRepo.findByCode('ADMIN');
  const cashierRole = await roleRepo.findByCode('CASHIER');
  assert(!!adminRole && !!cashierRole, 'Found seeded ADMIN and CASHIER roles');

  const now = new Date().toISOString();
  const dbAdminUser = await userRepo.create({
    id: `u-adm-${Date.now()}`,
    username: `adm_${Date.now()}`,
    name: 'مدير الكتالوج',
    password_hash: 'dummyhash',
    role_id: adminRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  });

  const dbCashierUser = await userRepo.create({
    id: `u-csh-${Date.now()}`,
    username: `csh_${Date.now()}`,
    name: 'كاشير المبيعات',
    password_hash: 'dummyhash',
    role_id: cashierRole!.id,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  });

  // Authenticated User Contexts
  const adminUser: AuthenticatedUser = {
    id: dbAdminUser.id,
    username: dbAdminUser.username,
    name: dbAdminUser.name,
    roleId: adminRole!.id,
    roleCode: RoleCode.ADMIN,
    roleName: adminRole!.name,
    permissions: [
      'categories.manage',
      'products.view',
      'products.create',
      'products.edit',
      'products.delete',
      'orders.manage',
      'orders.view',
      'pos.create_order',
    ],
  };

  const cashierUser: AuthenticatedUser = {
    id: dbCashierUser.id,
    username: dbCashierUser.username,
    name: dbCashierUser.name,
    roleId: cashierRole!.id,
    roleCode: RoleCode.CASHIER,
    roleName: cashierRole!.name,
    permissions: [
      'pos.view_menu',
      'pos.create_order',
      'products.view', // Can view products but cannot create/edit/delete
    ],
  };

  // Open a test shift for order testing
  const testShift = await shiftRepo.create({
    id: `sh-test-${Date.now()}`,
    shift_number: `SH-${Date.now().toString().slice(-4)}`,
    user_id: adminUser.id,
    opened_at: now,
    closed_at: null,
    opening_cash: 10000,
    expected_cash: 10000,
    actual_cash: null,
    cash_difference: null,
    status: 'OPEN',
    notes: 'وردية اختبار الكتالوج',
  });

  // ==========================================
  // [1/8] Category Creation & Validations
  // ==========================================
  console.log('\n[1/8] Category Creation & Validations:');

  // Valid creation
  const catMain = await categoryService.create(adminUser, {
    name: 'وجبات الشيف الرئيسية',
    sort_order: 1,
    is_active: true,
  });
  assert(catMain.name === 'وجبات الشيف الرئيسية', 'Created category with valid name');
  assert(catMain.sort_order === 1, 'Assigned sort order successfully');
  assert(catMain.is_active === 1, 'Category is active by default');

  // Empty name validation
  let emptyNameCaught = false;
  try {
    await categoryService.create(adminUser, { name: '   ' });
  } catch (err) {
    if (err instanceof ValidationError) emptyNameCaught = true;
  }
  assert(emptyNameCaught, 'Rejected empty/whitespace category name with ValidationError');

  // Duplicate name validation
  let duplicateNameCaught = false;
  try {
    await categoryService.create(adminUser, { name: 'وجبات الشيف الرئيسية' });
  } catch (err) {
    if (err instanceof ConflictError) duplicateNameCaught = true;
  }
  assert(duplicateNameCaught, 'Rejected duplicate category name with ConflictError');

  // Second category for testing
  const catDrinks = await categoryService.create(adminUser, {
    name: 'مشروبات وعصائر',
    sort_order: 2,
    is_active: true,
  });
  assert(catDrinks.name === 'مشروبات وعصائر', 'Created second category successfully');

  // ==========================================
  // [2/8] Category Updates & Status Activation
  // ==========================================
  console.log('\n[2/8] Category Updates & Status Activation:');

  const updatedCat = await categoryService.update(adminUser, catMain.id, {
    name: 'الوجبات الرئيسية الفاخرة',
    sort_order: 5,
  });
  assert(updatedCat.name === 'الوجبات الرئيسية الفاخرة', 'Updated category name successfully');
  assert(updatedCat.sort_order === 5, 'Updated category sort order successfully');

  // Deactivate
  const deactivatedCat = await categoryService.deactivate(adminUser, catDrinks.id);
  assert(deactivatedCat.is_active === 0, 'Deactivated category successfully');

  // List active only should exclude deactivated
  const activeOnly = await categoryService.list(true);
  assert(!activeOnly.some((c) => c.id === catDrinks.id), 'Active category list excludes deactivated category');

  // Reactivate
  const reactivatedCat = await categoryService.activate(adminUser, catDrinks.id);
  assert(reactivatedCat.is_active === 1, 'Reactivated category successfully');

  // ==========================================
  // [3/8] Product Creation & Minor Units Money Rules
  // ==========================================
  console.log('\n[3/8] Product Creation & Minor Units Money Rules:');

  // 120.50 EGP stored as 12050 minor units
  const prodBurger = await productService.create(adminUser, {
    category_id: catMain.id,
    name: 'برجر أنجوس بيف سبيشال',
    price: 12050,
    cost_price: 6500,
    barcode: '622998877112',
    track_stock: true,
    current_stock: 50,
    min_stock_alert: 10,
    unit: 'sandwich',
    is_active: true,
  });

  assert(prodBurger.price === 12050, 'Price stored strictly as integer minor units (12050 = 120.50 EGP)');
  assert(prodBurger.cost_price === 6500, 'Cost price stored strictly as integer minor units (6500 = 65.00 EGP)');
  assert(prodBurger.barcode === '622998877112', 'Barcode stored successfully');
  assert(prodBurger.unit === 'sandwich', 'Custom unit preserved');
  assert(prodBurger.track_stock === 1, 'Track stock enabled');

  // Empty name validation
  let emptyProdName = false;
  try {
    await productService.create(adminUser, {
      category_id: catMain.id,
      name: '',
      price: 5000,
    });
  } catch (err) {
    if (err instanceof ValidationError) emptyProdName = true;
  }
  assert(emptyProdName, 'Rejected product with empty name');

  // Negative price rejection
  let negPriceCaught = false;
  try {
    await productService.create(adminUser, {
      category_id: catMain.id,
      name: 'منتج غير صالح',
      price: -500,
    });
  } catch (err) {
    if (err instanceof ValidationError) negPriceCaught = true;
  }
  assert(negPriceCaught, 'Rejected product with negative price');

  // Non-integer price rejection (floating point prevention)
  let floatPriceCaught = false;
  try {
    await productService.create(adminUser, {
      category_id: catMain.id,
      name: 'منتج بكسر عشري',
      price: 120.5,
    });
  } catch (err) {
    if (err instanceof ValidationError) floatPriceCaught = true;
  }
  assert(floatPriceCaught, 'Rejected floating point price (strictly enforces integer minor units)');

  // Invalid category rejection
  let invalidCatCaught = false;
  try {
    await productService.create(adminUser, {
      category_id: 'non-existent-cat-id',
      name: 'منتج بدون قسم',
      price: 5000,
    });
  } catch (err) {
    if (err instanceof ValidationError) invalidCatCaught = true;
  }
  assert(invalidCatCaught, 'Rejected product with non-existent category');

  // Duplicate barcode rejection
  let duplicateBarcodeCaught = false;
  try {
    await productService.create(adminUser, {
      category_id: catMain.id,
      name: 'برجر آخر بنفس الباركود',
      price: 15000,
      barcode: '622998877112',
    });
  } catch (err) {
    if (err instanceof ConflictError) duplicateBarcodeCaught = true;
  }
  assert(duplicateBarcodeCaught, 'Rejected duplicate barcode with ConflictError');

  // Second product in drinks category
  const prodCola = await productService.create(adminUser, {
    category_id: catDrinks.id,
    name: 'كولا باردة عبوة زجاجية',
    price: 2500, // 25.00 EGP
    barcode: '622111222333',
    track_stock: false,
    is_active: true,
  });
  assert(prodCola.name === 'كولا باردة عبوة زجاجية', 'Created second product in drinks category');

  // ==========================================
  // [4/8] Product Search, Filter & Activation
  // ==========================================
  console.log('\n[4/8] Product Search, Filter & Activation:');

  // Search by name
  const searchNameRes = await productService.search('أنجوس');
  assert(searchNameRes.length >= 1 && searchNameRes[0].id === prodBurger.id, 'Search by name returns matching product');

  // Search by barcode
  const searchBarcodeRes = await productService.search('622111222333');
  assert(searchBarcodeRes.length >= 1 && searchBarcodeRes[0].id === prodCola.id, 'Search by barcode returns matching product');

  // Filter by category
  const mainCatProducts = await productService.getByCategory(catMain.id);
  assert(mainCatProducts.some((p) => p.id === prodBurger.id), 'Filter by category returned burger');
  assert(!mainCatProducts.some((p) => p.id === prodCola.id), 'Filter by category excluded cola');

  // Deactivate product
  const deactivatedBurger = await productService.deactivate(adminUser, prodBurger.id);
  assert(deactivatedBurger.is_active === 0, 'Deactivated product successfully');

  // Inactive excluded from active products
  const activeProducts = await productService.getActiveProducts();
  assert(!activeProducts.some((p) => p.id === prodBurger.id), 'getActiveProducts() excludes deactivated product');

  // Reactivate
  const reactivatedBurger = await productService.activate(adminUser, prodBurger.id);
  assert(reactivatedBurger.is_active === 1, 'Reactivated product successfully');

  const activeProductsAfter = await productService.getActiveProducts();
  assert(activeProductsAfter.some((p) => p.id === prodBurger.id), 'getActiveProducts() includes reactivated product');

  // ==========================================
  // [5/8] Category Deletion Protection (Integrity Rules)
  // ==========================================
  console.log('\n[5/8] Category Deletion Protection (Integrity Rules):');

  // Attempt to delete catMain which has prodBurger linked to it
  let blockedDelete = false;
  try {
    await categoryService.delete(adminUser, catMain.id);
  } catch (err) {
    if (err instanceof ConstraintError) blockedDelete = true;
  }
  assert(blockedDelete, 'System blocked category deletion when products are linked to it');

  // Create an empty disposable category
  const disposableCat = await categoryService.create(adminUser, {
    name: 'قسم مؤقت فارغ للتجربة',
    sort_order: 99,
  });

  // Verify product count is 0
  const countDisposable = await categoryRepo.countProducts(disposableCat.id);
  assert(countDisposable === 0, 'Disposable category has 0 products');

  // Delete should succeed
  let allowedDelete = false;
  try {
    await categoryService.delete(adminUser, disposableCat.id);
    allowedDelete = true;
  } catch {
    allowedDelete = false;
  }
  assert(allowedDelete, 'Category deletion allowed when NO products are linked to it');

  const deletedCheck = await categoryRepo.findById(disposableCat.id);
  assert(deletedCheck === null, 'Category removed from SQLite database');

  // ==========================================
  // [6/8] Dual-Layer RBAC Permissions Enforcement
  // ==========================================
  console.log('\n[6/8] Dual-Layer RBAC Permissions Enforcement:');

  // Cashier cannot manage categories
  let cashierCatManageBlocked = false;
  try {
    await categoryService.create(cashierUser, { name: 'قسم كاشير غير مصرح به' });
  } catch (err) {
    if (err instanceof UnauthorizedError) cashierCatManageBlocked = true;
  }
  assert(cashierCatManageBlocked, 'CategoryService blocked unauthorized cashier from creating category');

  // Cashier cannot create product
  let cashierProdCreateBlocked = false;
  try {
    await productService.create(cashierUser, {
      category_id: catMain.id,
      name: 'منتج غير مصرح به',
      price: 5000,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) cashierProdCreateBlocked = true;
  }
  assert(cashierProdCreateBlocked, 'ProductService blocked unauthorized cashier from creating product');

  // Cashier cannot edit product
  let cashierProdEditBlocked = false;
  try {
    await productService.update(cashierUser, prodBurger.id, { price: 9999 });
  } catch (err) {
    if (err instanceof UnauthorizedError) cashierProdEditBlocked = true;
  }
  assert(cashierProdEditBlocked, 'ProductService blocked unauthorized cashier from updating product');

  // Cashier can view products
  let cashierCanView = false;
  try {
    const list = await productService.list(cashierUser);
    cashierCanView = Array.isArray(list);
  } catch {
    cashierCanView = false;
  }
  assert(cashierCanView, 'Authorized cashier can list products (products.view permission)');

  // ==========================================
  // [7/8] Financial & Historical Immutability Protection
  // ==========================================
  console.log('\n[7/8] Financial & Historical Immutability Protection:');

  // 1. Simulate a completed order in Phase 2 with a snapshot of prodBurger at 12050 minor units
  const testOrderId = `ord-hist-${Date.now()}`;
  const orderDate = new Date().toISOString();

  await orderRepo.create({
    id: testOrderId,
    order_number: `ORD-HIST-${Math.floor(Math.random() * 10000)}`,
    shift_id: testShift.id,
    user_id: adminUser.id,
    customer_id: null,
    table_number: null,
    order_type: 'TAKEAWAY',
    subtotal: 12050,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    delivery_fee: 0,
    total: 12050,
    status: 'COMPLETED',
    notes: 'اختبار ثبات البيانات التاريخية',
    created_at: orderDate,
    updated_at: orderDate,
  });

  await orderItemRepo.create({
    id: `item-hist-${Date.now()}`,
    order_id: testOrderId,
    product_id: prodBurger.id,
    product_name_snapshot: 'برجر أنجوس بيف سبيشال', // snapshot
    unit_price: 12050, // snapshot
    quantity: 1,
    subtotal: 12050,
    discount_amount: 0,
    total: 12050,
    notes: null,
    created_at: orderDate,
  });

  // 2. Modify product price and name in ProductService (e.g. inflation / menu revamp)
  await productService.update(adminUser, prodBurger.id, {
    name: 'برجر أنجوس بيف ديلوكس المطور',
    price: 18000, // Price increased to 180.00 EGP
  });

  // 3. Inspect historical order item snapshot
  const historicalItems = await orderItemRepo.listByOrderId(testOrderId);
  assert(historicalItems.length === 1, 'Historical order item retrieved');
  assert(historicalItems[0].product_name_snapshot === 'برجر أنجوس بيف سبيشال', 'Historical order item retained original snapshot product_name');
  assert(historicalItems[0].unit_price === 12050, 'Historical order item retained original snapshot unit_price (120.50 EGP), unaffected by product price increase (180.00 EGP)');

  // ==========================================
  // [8/8] Security Audit Logs Verification
  // ==========================================
  console.log('\n[8/8] Security Audit Logs Verification:');

  const allLogs = await auditRepo.listRecent(100);
  const actionsLogged = allLogs.map((l) => l.action);

  assert(actionsLogged.includes('CATEGORY_CREATED'), 'Audit log contains CATEGORY_CREATED');
  assert(actionsLogged.includes('CATEGORY_UPDATED'), 'Audit log contains CATEGORY_UPDATED');
  assert(actionsLogged.includes('CATEGORY_ACTIVATED'), 'Audit log contains CATEGORY_ACTIVATED');
  assert(actionsLogged.includes('CATEGORY_DEACTIVATED'), 'Audit log contains CATEGORY_DEACTIVATED');
  assert(actionsLogged.includes('DELETE_ATTEMPT_BLOCKED'), 'Audit log contains DELETE_ATTEMPT_BLOCKED');
  assert(actionsLogged.includes('CATEGORY_DELETED'), 'Audit log contains CATEGORY_DELETED');

  assert(actionsLogged.includes('PRODUCT_CREATED'), 'Audit log contains PRODUCT_CREATED');
  assert(actionsLogged.includes('PRODUCT_UPDATED'), 'Audit log contains PRODUCT_UPDATED');
  assert(actionsLogged.includes('PRODUCT_ACTIVATED'), 'Audit log contains PRODUCT_ACTIVATED');
  assert(actionsLogged.includes('PRODUCT_DEACTIVATED'), 'Audit log contains PRODUCT_DEACTIVATED');

  // Verify no passwords or plaintext credentials leaked in any audit log details
  const anyPasswordLeaked = allLogs.some((l) => {
    const str = l.details_json || '';
    return str.includes('password') && (str.includes('$2a$') || str.includes('Password'));
  });
  assert(!anyPasswordLeaked, 'Verified ZERO sensitive credentials or password hashes leaked in Audit Logs');

  // Final Summary
  console.log('\n======================================================');
  console.log(`  Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCatalogTests().catch((err) => {
  console.error('Fatal error in catalog test runner:', err);
  process.exit(1);
});
