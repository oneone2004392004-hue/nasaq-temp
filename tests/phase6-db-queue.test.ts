import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { WasmSqliteDriver } from '../src/database/drivers/WasmSqliteDriver';

async function main() {
  const base = new WasmSqliteDriver();
  await base.init();
  let restoreStarted = false;
  const driver = {
    exec: base.exec.bind(base),
    run: base.run.bind(base),
    query: base.query.bind(base),
    queryOne: base.queryOne.bind(base),
    close: base.close.bind(base),
    exportBytes: base.exportBytes?.bind(base),
    loadBytes: async (bytes: Uint8Array) => {
      restoreStarted = true;
      await base.loadBytes!(bytes);
    },
  };
  const db = await DatabaseManager.resetForTesting(driver);
  await db.execute('CREATE TABLE queue_probe (value TEXT NOT NULL);');
  const backup = await db.exportDatabase();

  let entered!: () => void;
  let release!: () => void;
  const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
  const releasePromise = new Promise<void>((resolve) => { release = resolve; });
  const transaction = db.transaction(async (tx) => {
    await tx.execute("INSERT INTO queue_probe(value) VALUES ('inside transaction');");
    entered();
    await releasePromise;
  });
  await enteredPromise;

  const restore = db.restoreDatabase(backup);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(restoreStarted, false, 'restore must not touch driver while transaction is open');
  release();
  await transaction;
  await restore;
  const rows = await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM queue_probe;');
  assert.equal(rows[0].count, 0, 'restored snapshot excludes post-snapshot transaction data');
  await db.close();
  console.log('PHASE 6 DB QUEUE: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
