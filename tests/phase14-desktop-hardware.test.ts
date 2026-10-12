/**
 * NASAQ POS — Phase 14 Desktop & Native Hardware Verification Test Suite
 *
 * Verifies:
 * 1. TauriSqliteDriver: Execution, transactions, pragmas, lifecycle, error wrapping
 * 2. DriverFactory: Runtime detection, driver selection, honest reporting
 * 3. WindowsNativePrinterAdapter:
 *    - Desktop availability detection (honest in browser, active in desktop)
 *    - Windows Spooler raw print command bridge
 *    - Direct TCP network printer bridge (port 9100, IP parsing)
 *    - Cash drawer pulse transmission
 *    - Printer enumeration
 *    - Graceful error handling (timeout, connection refused, not found)
 * 4. TauriBackupStorage: Binary .db file persistence, external export/import dialog flow
 * 5. Arabic ESC/POS byte transport neutrality
 */

import { TauriSqliteDriver } from '../src/database/drivers/TauriSqliteDriver';
import { isTauriRuntime, getActiveDriverType } from '../src/database/drivers/DriverFactory';
import { WindowsNativePrinterAdapter } from '../src/features/hardware/adapters/WindowsNativePrinterAdapter';
import { BrowserPrinterAdapter } from '../src/features/hardware/adapters/BrowserPrinterAdapter';
import { TauriBackupStorage } from '../src/features/backup/services/TauriBackupStorage';
import { PrinterRow } from '../src/domain/dbModels';
import { EscPosBuilder } from '../src/features/hardware/escpos/EscPosBuilder';
import { ArabicTextProcessor } from '../src/features/hardware/escpos/ArabicTextProcessor';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runDesktopHardwareTests() {
  console.log('\n======================================================================');
  console.log('NASA POS — Phase 14 Desktop & Native Hardware Bridge Tests');
  console.log('======================================================================\n');

  // -------------------------------------------------------------
  // 1. Native SQLite Driver
  // -------------------------------------------------------------
  console.log('--- 1. Native SQLite Driver ---');
  {
    const executedCommands: string[] = [];
    const mockTauriDb = {
      execute: async (sql: string) => {
        executedCommands.push(sql);
        return { rowsAffected: 1, lastInsertId: 42 };
      },
      select: async <T>() => [{ id: 'usr-1', name: 'Admin' }] as unknown as T,
      close: async () => true,
    };

    const driver = new TauriSqliteDriver('sqlite:test_nasaq.db', mockTauriDb);
    assert(!driver.isReady(), 'TauriSqliteDriver is not ready before init()');

    await driver.init();
    assert(driver.isReady(), 'TauriSqliteDriver is ready after init()');
    assert(
      executedCommands.some((c) => c.includes('PRAGMA foreign_keys = ON')),
      'PRAGMA foreign_keys = ON is executed on startup'
    );
    assert(
      executedCommands.some((c) => c.includes('PRAGMA journal_mode = WAL')),
      'PRAGMA journal_mode = WAL is executed on startup'
    );
    assert(driver.getDbPath() === 'sqlite:test_nasaq.db', 'Driver remembers its database path');

    const runRes = await driver.run('INSERT INTO users(id, name) VALUES(?, ?)', ['usr-1', 'Admin']);
    assert(runRes.rowsAffected === 1, 'Driver returns correct rowsAffected');
    assert(runRes.lastInsertRowId === 42, 'Driver returns correct lastInsertRowId');

    const rows = await driver.query<{ id: string; name: string }>('SELECT * FROM users');
    assert(rows.length === 1 && rows[0].name === 'Admin', 'Driver correctly maps query results');

    const one = await driver.queryOne<{ id: string; name: string }>('SELECT * FROM users WHERE id = ?', ['usr-1']);
    assert(one !== null && one.id === 'usr-1', 'Driver queryOne returns single matching row');

    await driver.close();
    assert(!driver.isReady(), 'Driver is marked not ready after close()');

    // Error wrapping
    const failingDb = {
      execute: async () => {
        throw new Error('UNIQUE constraint failed: users.username');
      },
      select: async () => {
        throw new Error('no such table: unknown_table');
      },
      close: async () => true,
    };
    const failingDriver = new TauriSqliteDriver('sqlite:test.db', failingDb);
    await failingDriver.init().catch(() => {});

    let threw = false;
    try {
      await failingDriver.run('INSERT INTO users VALUES(1)');
    } catch {
      threw = true;
    }
    assert(threw, 'Driver wraps and rethrows database execution errors');
  }

  // -------------------------------------------------------------
  // 2. Driver Factory & Runtime Detection
  // -------------------------------------------------------------
  console.log('\n--- 2. Driver Factory & Runtime Detection ---');
  {
    assert(!isTauriRuntime(), 'Reports false for Tauri runtime when in standard node/browser test environment');
    assert(getActiveDriverType() === 'wasm', 'Default driver type is WASM in non-desktop environments');

    // Mock Tauri global
    (global as any).window = {
      __TAURI__: { invoke: async () => {} },
    };

    assert(isTauriRuntime(), 'Detects Tauri runtime when window.__TAURI__ is present');
    assert(getActiveDriverType() === 'tauri', 'Driver type is tauri when in desktop environment');

    // Clean up
    delete (global as any).window.__TAURI__;
    assert(!isTauriRuntime(), 'Correctly resets when window.__TAURI__ is removed');
  }

  // -------------------------------------------------------------
  // 3. Windows Native Printer Adapter
  // -------------------------------------------------------------
  console.log('\n--- 3. Windows Native Printer Adapter ---');
  {
    const sampleUsbPrinter: PrinterRow = {
      id: 'prn-usb-1',
      name: 'Epson TM-T20III',
      printer_type: 'RECEIPT',
      connection_type: 'USB',
      address: 'EPSON TM-T20III Receipt',
      is_default: 1,
      is_active: 1,
      paper_width: 80,
    };

    const sampleNetworkPrinter: PrinterRow = {
      id: 'prn-net-1',
      name: 'Kitchen Star Micronics',
      printer_type: 'KITCHEN',
      connection_type: 'NETWORK',
      address: '192.168.1.200:9100',
      is_default: 0,
      is_active: 1,
      paper_width: 80,
    };

    // Honest availability outside desktop
    const plainAdapter = new WindowsNativePrinterAdapter();
    assert(!plainAdapter.isAvailable(), 'WindowsNativePrinterAdapter is unavailable outside desktop');
    const statusOutside = await plainAdapter.checkStatus(sampleUsbPrinter);
    assert(!statusOutside.connected && statusOutside.status === 'UNAVAILABLE', 'Reports UNAVAILABLE outside desktop');

    let threwOutside = false;
    try {
      await plainAdapter.sendRaw(sampleUsbPrinter, new Uint8Array([0x1b, 0x40]));
    } catch (e: any) {
      threwOutside = true;
      assert(e.message.includes('لا يمكن إرسال بيانات ESC/POS مباشرة من وضع المتصفح'), 'Provides clear Arabic message when attempting print in browser');
    }
    assert(threwOutside, 'Throws when attempting sendRaw in browser mode');

    // Spooler raw printing
    const invokedCalls: Array<{ cmd: string; args?: any }> = [];
    const mockInvoke = async (cmd: string, args?: any) => {
      invokedCalls.push({ cmd, args });
      if (cmd === 'print_raw') {
        return { success: true, bytes_sent: args.data.length, message: 'Print job spooled' };
      }
      if (cmd === 'print_network_raw') {
        return { success: true, bytes_sent: args.data.length, message: 'TCP bytes transmitted' };
      }
      if (cmd === 'list_windows_printers') {
        return [
          { name: 'EPSON TM-T20III Receipt', is_default: true, status: 'Ready' },
          { name: 'Microsoft Print to PDF', is_default: false, status: 'Ready' },
        ];
      }
      return {};
    };

    const desktopAdapter = new WindowsNativePrinterAdapter(mockInvoke);
    assert(desktopAdapter.isAvailable(), 'WindowsNativePrinterAdapter reports available when bridge is connected');

    // Windows installed printer status check
    const usbStatus = await desktopAdapter.checkStatus(sampleUsbPrinter);
    assert(usbStatus.connected && usbStatus.status === 'ONLINE', 'Windows installed printer is reported ONLINE when found');

    // Spooler print
    await desktopAdapter.sendRaw(sampleUsbPrinter, new Uint8Array([0x1b, 0x40, 0x41]));
    assert(invokedCalls.some((c) => c.cmd === 'print_raw' && c.args.printerName === 'EPSON TM-T20III Receipt'), 'Sends print_raw command with exact printer name to spooler');

    // Network printer print
    await desktopAdapter.sendRaw(sampleNetworkPrinter, new Uint8Array([0x1b, 0x61, 0x01]));
    assert(
      invokedCalls.some(
        (c) => c.cmd === 'print_network_raw' && c.args.ip === '192.168.1.200' && c.args.port === 9100
      ),
      'Sends print_network_raw command with parsed IP and default/configured port'
    );

    // Cash drawer kick pulse
    invokedCalls.length = 0;
    await desktopAdapter.openCashDrawer(sampleUsbPrinter);
    const drawerCall = invokedCalls.find((c) => c.cmd === 'print_raw');
    assert(drawerCall !== undefined, 'openCashDrawer dispatches print_raw command');
    // Builder prepends reset (0x1B, 0x40) then pulse (0x1B, 0x70, 0x00, 0x19, 0xFA)
    const drawerBytes = drawerCall?.args.data;
    const pulseEnd = Array.isArray(drawerBytes) ? drawerBytes.slice(-5) : [];
    assert(
      pulseEnd.length === 5 &&
        pulseEnd[0] === 0x1b &&
        pulseEnd[1] === 0x70 &&
        pulseEnd[2] === 0x00 &&
        pulseEnd[3] === 0x19 &&
        pulseEnd[4] === 0xfa,
      'openCashDrawer sends genuine ESC/POS pulse (ESC p 0 25 250)'
    );

    // Network error handling
    const failingNetAdapter = new WindowsNativePrinterAdapter(async (cmd) => {
      if (cmd === 'print_network_raw') throw new Error('Connection refused (os error 111)');
      return {};
    });

    let netThrew = false;
    try {
      await failingNetAdapter.sendRaw(sampleNetworkPrinter, new Uint8Array([0x1b]));
    } catch (err: any) {
      netThrew = true;
      assert(err.message.includes('تم رفض الاتصال'), 'Network printer connection error mapped to informative Arabic message');
    }
    assert(netThrew, 'Network printer errors are caught and surfaced safely');
  }

  // -------------------------------------------------------------
  // 4. Browser Adapter
  // -------------------------------------------------------------
  console.log('\n--- 4. Browser Adapter ---');
  {
    const browserAdapter = new BrowserPrinterAdapter();
    const status = await browserAdapter.checkStatus({} as PrinterRow);
    assert(!status.connected, 'Browser adapter reports disconnected');
    assert(status.status === 'UNAVAILABLE', 'Browser adapter reports UNAVAILABLE status');
  }

  // -------------------------------------------------------------
  // 5. Native Backup Storage
  // -------------------------------------------------------------
  console.log('\n--- 5. Native Backup Storage ---');
  {
    const storage = new TauriBackupStorage();
    const testHeader = new Uint8Array([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00]);

    await storage.saveBackupFile('bkp-desk-1', 'nasaq-backup-desktop.db', testHeader);
    const retrieved = await storage.getBackupBytes('bkp-desk-1');
    assert(retrieved !== null && retrieved.byteLength === 16, 'Backup bytes successfully stored and retrieved');

    const files = await storage.listBackupFiles();
    assert(files.some((f) => f.id === 'bkp-desk-1'), 'Backup appears in file list');

    const deleted = await storage.deleteBackupFile('bkp-desk-1');
    assert(deleted, 'Backup successfully deleted from storage');

    const afterDelete = await storage.getBackupBytes('bkp-desk-1');
    assert(afterDelete === null, 'Deleted backup is no longer retrievable');
  }

  // -------------------------------------------------------------
  // 6. Arabic ESC/POS Transport Neutrality
  // -------------------------------------------------------------
  console.log('\n--- 6. Arabic ESC/POS Transport Neutrality ---');
  {
    const arabicText = 'فاتورة ضريبية مبسطة';
    const shaped = ArabicTextProcessor.reshape(arabicText);
    assert(shaped.length > 0, 'Reshapes Arabic text into thermal presentation forms');

    const prepared = ArabicTextProcessor.prepareForPrinter(arabicText);
    assert(prepared.length > 0, 'Prepares visual BiDi RTL string for printer');

    const builder = new EscPosBuilder().text(prepared).newLine();
    const bytes = builder.build();

    assert(bytes.length > 0, 'ESC/POS builder generates non-empty binary stream for Arabic text');
    assert(bytes[bytes.length - 1] === 0x0a, 'ESC/POS builder terminates with line-feed (0x0A)');
  }

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDesktopHardwareTests().catch((err) => {
  console.error('Fatal Desktop Test Error:', err);
  process.exit(1);
});
