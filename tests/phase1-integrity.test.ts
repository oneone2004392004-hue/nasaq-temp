import { splitSqlStatements } from '../src/database/drivers/TauriSqliteDriver';
import { shiftLocalYmd, toLocalDayRange } from '../src/utils/dateRanges';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

console.log('NASAQ POS — Phase 1 integrity tests');

const cairoDay = toLocalDayRange('2026-10-01');
assert(cairoDay.startIso === '2026-09-30T21:00:00.000Z', 'Cairo local midnight maps to UTC 21:00');
assert(cairoDay.endIso === '2026-10-01T20:59:59.999Z', 'Cairo local day end maps to UTC 20:59:59.999');
assert(toLocalDayRange('2026-10-01T21:30:00.000Z').ymd === '2026-10-02', '00:30 Cairo is next local day');
assert(toLocalDayRange('2026-10-01T22:30:00.000Z').ymd === '2026-10-02', '01:30 Cairo is next local day');
assert(shiftLocalYmd('2026-10-01', -1) === '2026-09-30', 'Local yesterday crosses month boundary');

const statements = splitSqlStatements(`
  CREATE TABLE demo (value TEXT);
  INSERT INTO demo VALUES ('a;b');
  CREATE TRIGGER demo_trigger AFTER INSERT ON demo BEGIN
    INSERT INTO demo VALUES ('trigger;value');
  END;
  INSERT INTO demo VALUES ('tail');
`);
assert(statements.length === 4, 'SQL parser keeps quoted semicolons and trigger body intact');
assert(statements[1].includes("'a;b'"), 'SQL parser keeps semicolon inside string literal');
assert(statements[2].includes("'trigger;value'") && statements[2].includes('END'), 'SQL parser keeps trigger body');

console.log('PHASE 1 INTEGRITY: 8 PASSED, 0 FAILED');
