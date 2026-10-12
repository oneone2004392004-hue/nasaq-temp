import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { SettingsRepository } from '../src/repositories/SettingsRepository';
import { validateOrderDraft } from '../src/features/orders/validation';
import { UserService } from '../src/features/users/services/UserService';
import { InventoryService } from '../src/features/inventory/services/InventoryService';
import { ReturnService } from '../src/features/returns/services/ReturnService';

async function main() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  const settings = new SettingsRepository(db);
  assert.equal(await settings.get('allow_negative_stock'), '0', 'negative stock is disabled by default');
  assert.notEqual(await settings.get('tax_inclusive'), null, 'tax inclusion setting is migrated');
  const permissions = await db.query<{ code: string }>("SELECT code FROM permissions WHERE code IN ('users.reset_password','returns.refund') ORDER BY code;");
  assert.deepEqual(permissions.map((p) => p.code), ['returns.refund', 'users.reset_password'], 'phase 2 permissions are seeded');
  let percentageRejected = false;
  try { validateOrderDraft({ order_type: 'TAKEAWAY', items: [{ productId: 'p1', quantity: 1 }], discount_type: 'PERCENTAGE', discount_value: 101 } as any); } catch { percentageRejected = true; }
  assert.equal(percentageRejected, true, 'percentage discount over 100 is rejected');
  assert.equal(typeof new UserService().resetPassword, 'function', 'UserService resetPassword exists');
  assert.equal(typeof new InventoryService().adjust, 'function', 'InventoryService adjust exists');
  assert.equal(typeof new ReturnService().create, 'function', 'ReturnService create exists');
  console.log('PHASE 2 INTEGRITY: 7 passed, 0 failed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
