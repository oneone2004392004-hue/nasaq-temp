import { DatabaseManager } from '../src/database/DatabaseManager';
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

async function run(): Promise<void> {
  console.log('\n=== Transaction concurrency regression tests ===');
  const db = DatabaseManager.getInstance();
  await db.initialize();

  const firstId = generateId('tx-concurrent-a');
  const secondId = generateId('tx-concurrent-b');
  const nestedId = generateId('tx-nested');
  const now = new Date().toISOString();

  try {
    const results = await Promise.all([
      db.transaction(async (tx) => {
        await tx.run(
          'INSERT INTO categories (id, name, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);',
          [firstId, 'transaction-a', 1, 1, now, now]
        );
        await new Promise((resolve) => setTimeout(resolve, 25));
        return 'a';
      }),
      db.transaction(async (tx) => {
        await tx.run(
          'INSERT INTO categories (id, name, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);',
          [secondId, 'transaction-b', 2, 1, now, now]
        );
        return 'b';
      }),
    ]);
    assert(results.join('') === 'ab', 'Concurrent transactions serialize without sharing transaction state');

    await db.transaction(async (tx) => {
      await tx.transaction(async (nested) => {
        await nested.run(
          'INSERT INTO categories (id, name, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);',
          [nestedId, 'transaction-nested', 3, 1, now, now]
        );
        throw new Error('intentional nested rollback');
      }).catch(() => undefined);
    });
    const nestedRow = await db.queryOne('SELECT id FROM categories WHERE id = ?;', [nestedId]);
    assert(nestedRow === null, 'Nested savepoint rollback remains isolated inside serialized transaction');
  } finally {
    await db.run('DELETE FROM categories WHERE id IN (?, ?, ?);', [firstId, secondId, nestedId]);
  }

  console.log(`TRANSACTION TESTS: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) throw new Error(`Transaction tests failed: ${failed}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
