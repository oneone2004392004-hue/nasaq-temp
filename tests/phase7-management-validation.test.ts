import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { CustomerService } from '../src/features/customers/services/CustomerService';
import { TableService } from '../src/features/tables/services/TableService';
import { DeliveryService } from '../src/features/delivery/services/DeliveryService';
import { validateCreateDriver } from '../src/features/delivery/validation';
import { ValidationError } from '../src/database/errors';
import { TableStatus, RoleCode } from '../src/domain/enums';
import { generateId } from '../src/utils/id';
import { UserRepository } from '../src/repositories/UserRepository';
import { RoleRepository } from '../src/repositories/RoleRepository';
import { PermissionRepository } from '../src/repositories/PermissionRepository';

async function main() {
  assert.equal(validateCreateDriver({ name: 'مندوب اختبار', phone: '01012345678' }).phone, '01012345678');
  for (const phone of ['0111234567', '0101234567', '010123456789', '01412345678']) {
    assert.throws(() => validateCreateDriver({ name: 'مندوب اختبار', phone }), ValidationError);
  }
  console.log('B5 Egyptian mobile validation: PASS');

  const db = DatabaseManager.getInstance();
  await db.initialize();
  const role = await new RoleRepository(db).findByCode(RoleCode.ADMIN);
  assert.ok(role);
  const now = new Date().toISOString();
  const dbUser = await new UserRepository(db).create({
    id: generateId('b5user'), username: generateId('b5mgr'), name: 'مدير الاختبار', password_hash: 'hash',
    role_id: role!.id, is_active: 1, failed_login_attempts: 0, locked_until: null, last_login_at: null,
    created_at: now, updated_at: now,
  });
  const permissions = await new PermissionRepository(db).getForRole(role!.id);
  const user = {
    id: dbUser.id, username: dbUser.username, name: dbUser.name, roleId: role!.id,
    roleCode: RoleCode.ADMIN, roleName: 'مدير', permissions: permissions.map((permission) => permission.code),
  };
  const customerService = new CustomerService(db);
  const customer = await customerService.create(user, { name: 'عميل مرحلة B5', phone: '01012345678', address: 'القاهرة' });
  assert.equal(customer.is_active, 1);
  await customerService.update(user, customer.id, { name: 'عميل معدل', phone: '', address: '' });
  assert.equal((await customerService.setActive(user, customer.id, false)).is_active, 0);

  const tableService = new TableService();
  const table = await tableService.createTable(user, { name: `B5-${generateId('tbl')}`, capacity: 4, status: TableStatus.AVAILABLE });
  await tableService.updateTable(user, table.id, { name: `${table.name}-معدل`, capacity: 6 });
  assert.equal((await tableService.updateTable(user, table.id, { is_active: 0 })).is_active, 0);
  await assert.rejects(tableService.createTable(user, { name: '', capacity: 0, status: TableStatus.AVAILABLE }), ValidationError);

  const deliveryService = new DeliveryService();
  const driver = await deliveryService.createDriver(user, { name: 'مندوب اختبار', phone: '01012345678' });
  await deliveryService.updateDriver(user, driver.id, { name: 'مندوب معدل' });
  assert.equal((await deliveryService.updateDriver(user, driver.id, { is_active: 0 })).is_active, 0);
  console.log('B5 customer/table/driver Service CRUD and deactivate audit paths: PASS');
  console.log('PHASE 7 MANAGEMENT VALIDATION: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
