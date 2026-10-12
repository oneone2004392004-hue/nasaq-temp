import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { CategoryRepository } from '../src/repositories/CategoryRepository';
import { ProductRepository } from '../src/repositories/ProductRepository';
import { ShiftRepository } from '../src/repositories/ShiftRepository';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { SettingsRepository } from '../src/repositories/SettingsRepository';
import { OrderRepository } from '../src/repositories/OrderRepository';
import { OrderItemRepository } from '../src/repositories/OrderItemRepository';
import { CustomerRepository } from '../src/repositories/CustomerRepository';
import { AuditLogRepository } from '../src/repositories/AuditLogRepository';
import { InvoiceRepository } from '../src/repositories/InvoiceRepository';
import { PaymentRepository } from '../src/repositories/PaymentRepository';
import { OrderService } from '../src/features/orders/services/OrderService';
import { PaymentService } from '../src/features/pos/services/PaymentService';
import { ReturnService } from '../src/features/returns/services/ReturnService';
import { RoleCode, ShiftStatus } from '../src/domain/enums';
import { AuthenticatedUser } from '../src/features/auth/types';
import { ValidationError } from '../src/database/errors';

async function setup() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const roleRepo = new RoleRepository(db);
  const userRepo = new UserRepository(db);
  const categoryRepo = new CategoryRepository(db);
  const productRepo = new ProductRepository(db);
  const shiftRepo = new ShiftRepository(db);
  const settings = new SettingsRepository(db);
  const auditRepo = new AuditLogRepository(db);
  const adminRole = await roleRepo.findByCode(RoleCode.ADMIN);
  assert.ok(adminRole, 'seeded admin role exists');
  const now = new Date().toISOString();
  const userRow = await userRepo.create({
    id: 'a5-user', username: 'a5_admin', name: 'مسؤول الاختبار', password_hash: 'test',
    role_id: adminRole!.id, is_active: 1, failed_login_attempts: 0,
    locked_until: null, last_login_at: null, created_at: now, updated_at: now,
  });
  const user: AuthenticatedUser = {
    id: userRow.id, username: userRow.username, name: userRow.name,
    roleId: adminRole!.id, roleCode: RoleCode.ADMIN, roleName: adminRole!.name,
    permissions: ['pos.create_order', 'returns.create', 'returns.refund', 'orders.manage'],
  };
  await shiftRepo.create({
    id: 'a5-shift', shift_number: 'SH-A5-0001', user_id: user.id,
    opened_at: now, closed_at: null, opening_cash: 0, expected_cash: 0,
    actual_cash: null, cash_difference: null, status: ShiftStatus.OPEN, notes: 'اختبار تكاملي',
  });
  const category = await categoryRepo.create({
    id: 'a5-category', name: 'اختبارات المرتجعات', sort_order: 1, is_active: 1,
    created_at: now, updated_at: now,
  });
  const orderService = new OrderService(
    new OrderRepository(db), new OrderItemRepository(db), productRepo,
    new CustomerRepository(db), shiftRepo, auditRepo, db,
  );
  const paymentService = new PaymentService(
    db, new OrderRepository(db), new OrderItemRepository(db), new PaymentRepository(db),
    new InvoiceRepository(db), shiftRepo, new CustomerRepository(db), auditRepo,
  );
  const returnService = new ReturnService();
  async function product(id: string, price = 1000) {
    return productRepo.create({
      id, name: `صنف ${id}`, barcode: `BAR-${id}`, category_id: category.id,
      price, cost_price: Math.floor(price / 2), track_stock: 1, current_stock: 100,
      min_stock_alert: 0, unit: 'قطعة', is_active: 1, created_at: now, updated_at: now,
    });
  }
  async function paidSale(input: {
    productId: string; quantities: number[]; expectedTotal: number; deliveryFee?: number;
    discount?: boolean; delivery?: boolean;
  }) {
    return paymentService.createAndPayOrder(user, orderService, {
      order_type: input.delivery ? 'DELIVERY' : 'TAKEAWAY',
      customer_name: input.delivery ? 'عميل اختبار' : undefined,
      customer_phone: input.delivery ? '01000000000' : undefined,
      delivery_fee: input.deliveryFee || 0,
      discount_type: input.discount ? 'PERCENTAGE' : undefined,
      discount_value: input.discount ? 10 : undefined,
      items: input.quantities.map((quantity) => ({ productId: input.productId, quantity })),
    }, [{ method: 'CARD', amount: input.expectedTotal, tenderAmount: input.expectedTotal }]);
  }
  async function row<T>(sql: string, params: unknown[] = []) { return db.queryOne<T>(sql, params); }
  return { db, user, settings, productRepo, product, paidSale, row, returnService };
}

async function duplicateMerge() {
  const ctx = await setup();
  const p = await ctx.product('a5-duplicate', 1200);
  const sale = await ctx.paidSale({ productId: p.id, quantities: [2], expectedTotal: 2400 });
  const line = sale.items[0];
  const created = await ctx.returnService.create(ctx.user, {
    invoiceId: sale.invoice.id,
    items: [
      { orderItemId: line.id, productId: p.id, quantity: 1 },
      { orderItemId: line.id, productId: p.id, quantity: 1 },
    ], reason: 'تكرار السطر في الطلب', refundMethod: 'CARD',
  });
  const rows = await ctx.db.query<{ quantity: number; order_item_id: string }>(
    'SELECT quantity, order_item_id FROM return_items WHERE return_id = ?;', [created.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].order_item_id, line.id);
  assert.equal((await ctx.productRepo.findById(p.id))?.current_stock, 100);
  console.log('A5 duplicate merge E2E: PASS');
}

async function splitProductLines() {
  const ctx = await setup();
  const p = await ctx.product('a5-split');
  const sale = await ctx.paidSale({ productId: p.id, quantities: [1, 2], expectedTotal: 3100, deliveryFee: 100, delivery: true });
  const created = await ctx.returnService.create(ctx.user, {
    invoiceId: sale.invoice.id,
    items: sale.items.map((item) => ({ orderItemId: item.id, productId: item.product_id, quantity: item.quantity })),
    reason: 'مرتجع السطرين', refundMethod: 'CARD',
  });
  const invoice = await ctx.row<{ status: string }>('SELECT status FROM invoices WHERE id = ?;', [sale.invoice.id]);
  const order = await ctx.row<{ status: string }>('SELECT status FROM orders WHERE id = ?;', [sale.order.id]);
  const lines = await ctx.row<{ count: number }>('SELECT COUNT(*) AS count FROM return_items WHERE return_id = ?;', [created.id]);
  assert.equal(created.total_refund_amount, 3100);
  assert.equal(invoice?.status, 'REFUNDED');
  assert.equal(order?.status, 'RETURNED');
  assert.equal(lines?.count, 2);
  console.log('A5 split product lines E2E: PASS');
}

async function installments(taxInclusive: boolean) {
  const ctx = await setup();
  await ctx.settings.set('tax_enabled', '1');
  await ctx.settings.set('default_tax_rate', '14');
  await ctx.settings.set('tax_inclusive', taxInclusive ? '1' : '0');
  const productId = taxInclusive ? 'a5-tax-in' : 'a5-tax-out';
  const expectedTotal = taxInclusive ? 3850 : 4354;
  const p = await ctx.product(productId);
  const sale = await ctx.paidSale({ productId: p.id, quantities: [4], expectedTotal, deliveryFee: 250, discount: true, delivery: true });
  const line = sale.items[0];
  let returned = 0;
  for (let i = 0; i < 4; i += 1) {
    const created = await ctx.returnService.create(ctx.user, {
      invoiceId: sale.invoice.id,
      items: [{ orderItemId: line.id, productId: p.id, quantity: 1 }],
      reason: `دفعة ${i + 1}`, refundMethod: 'CARD',
    });
    returned += created.total_refund_amount;
  }
  const dbSum = await ctx.row<{ total: number }>(
    'SELECT SUM(total_refund_amount) AS total FROM returns WHERE original_order_id = ?;', [sale.order.id]
  );
  assert.equal(returned, sale.invoice.net_amount);
  assert.equal(dbSum?.total, sale.invoice.net_amount);
  assert.equal(sale.invoice.net_amount, expectedTotal);
  console.log(`A5 ${taxInclusive ? 'inclusive' : 'exclusive'} tax installments E2E: PASS`);
}

async function cashOverdraw() {
  const ctx = await setup();
  await ctx.settings.set('tax_enabled', '0');
  const p = await ctx.product('a5-cash');
  const sale = await ctx.paidSale({ productId: p.id, quantities: [1], expectedTotal: 1000 });
  const line = sale.items[0];
  await assert.rejects(ctx.returnService.create(ctx.user, {
    invoiceId: sale.invoice.id,
    items: [{ orderItemId: line.id, productId: p.id, quantity: 1 }],
    reason: 'اختبار تجاوز نقدية', refundMethod: 'CASH',
  }), (error: unknown) => error instanceof ValidationError && error.message.includes('تتجاوز النقدية المتوقعة'));
  const rejectedCount = await ctx.row<{ count: number }>(
    'SELECT COUNT(*) AS count FROM returns WHERE original_order_id = ?;', [sale.order.id]
  );
  assert.equal(rejectedCount?.count, 0, 'rejected overdraw leaves no return rows');
  const confirmed = await ctx.returnService.create(ctx.user, {
    invoiceId: sale.invoice.id,
    items: [{ orderItemId: line.id, productId: p.id, quantity: 1 }],
    reason: 'تأكيد مسؤول لاختبار التجاوز', refundMethod: 'CASH', confirmCashOverdraw: true,
  });
  const audit = await ctx.row<{ count: number }>(
    "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'RETURN_CASH_OVERDRAW_CONFIRMED' AND entity_id = ?;",
    [confirmed.id]
  );
  assert.equal(confirmed.total_refund_amount, 1000);
  assert.equal(audit?.count, 1);
  console.log('A5 cash overdraw guard E2E: PASS');
}

async function main() {
  const selected = process.env.A5_CASE;
  const cases: Record<string, () => Promise<void>> = {
    duplicate: duplicateMerge,
    split: splitProductLines,
    noninclusive: () => installments(false),
    inclusive: () => installments(true),
    cash: cashOverdraw,
  };
  assert.ok(selected, 'Set A5_CASE to select one end-to-end case');
  const run = cases[selected!];
  assert.ok(run, `Unknown A5_CASE=${selected}`);
  await run!();
  console.log('PHASE 5 RETURNS E2E: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
