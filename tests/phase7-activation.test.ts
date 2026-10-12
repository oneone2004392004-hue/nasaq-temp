import assert from 'node:assert/strict';
import {
  ActivationFileState, activateWithKey, getActivationStatus, setActivationAdaptersForTesting,
} from '../src/features/activation/ActivationService';

function encodeUrl(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function makeKey(deviceId: string): string {
  const payload = encodeUrl(new TextEncoder().encode(JSON.stringify({ v: 1, d: deviceId, e: '2030-01-01', n: 'اختبار' })));
  const signature = encodeUrl(new Uint8Array(64));
  return `NQ2.${payload}.${signature}`;
}

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

async function withFixture(fileText: string | null, localValues: Record<string, string>, lastSeen: string | null, run: (ctx: {
  fileText: () => string | null; local: MemoryStorage; lastSeen: () => string | null;
}) => Promise<void>) {
  const local = new MemoryStorage();
  for (const [key, value] of Object.entries(localValues)) local.setItem(key, value);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
  let file = fileText;
  let seen = lastSeen;
  setActivationAdaptersForTesting({
    readFile: async () => file,
    writeFile: async (state: ActivationFileState) => { file = JSON.stringify(state); },
    readLastSeen: async () => seen,
    writeLastSeen: async (value: string) => { seen = value; },
    verifySignature: async () => true,
  });
  try { await run({ fileText: () => file, local, lastSeen: () => seen }); }
  finally { setActivationAdaptersForTesting(null); delete (globalThis as { localStorage?: Storage }).localStorage; }
}

async function main() {
  const now = new Date('2026-10-07T12:00:00.000Z');
  await withFixture(JSON.stringify({ deviceId: 'NQ-PERSISTED', key: makeKey('NQ-PERSISTED'), last_seen_at: now.toISOString() }), {}, now.toISOString(), async ({ local }) => {
    const status = await getActivationStatus(now);
    assert.equal(status.active, true);
    assert.equal(status.deviceId, 'NQ-PERSISTED');
    assert.equal(local.getItem('nasaq_device_id_v1'), 'NQ-PERSISTED');
    console.log('B2 file restores device after localStorage loss: PASS');
  });
  await withFixture('{broken json', { nasaq_device_id_v1: 'NQ-LOCAL', nasaq_activation_key_v1: makeKey('NQ-LOCAL') }, now.toISOString(), async ({ fileText }) => {
    const status = await getActivationStatus(now);
    assert.equal(status.active, true);
    assert.equal(status.deviceId, 'NQ-LOCAL');
    assert.equal(JSON.parse(fileText()!).key, makeKey('NQ-LOCAL'));
    console.log('B2 corrupt file recovers from localStorage: PASS');
  });
  await withFixture(JSON.stringify({ deviceId: 'NQ-CLOCK', key: makeKey('NQ-CLOCK'), last_seen_at: now.toISOString() }), {}, now.toISOString(), async () => {
    const status = await getActivationStatus(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000));
    assert.equal(status.active, false);
    assert.match(status.reason || '', /أقدم من آخر تحقق/);
    const activation = await activateWithKey(makeKey('NQ-CLOCK'), new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000));
    assert.equal(activation.active, false);
    assert.match(activation.reason || '', /أقدم من آخر تحقق/);
    console.log('B2 clock rollback rejected: PASS');
  });
  await withFixture(JSON.stringify({ deviceId: 'NQ-DEVICE', key: makeKey('NQ-ANOTHER'), last_seen_at: now.toISOString() }), {}, now.toISOString(), async () => {
    const status = await getActivationStatus(now);
    assert.equal(status.active, false);
    assert.equal(status.reason, 'المفتاح صادر لجهاز آخر.');
    console.log('B2 key bound to another device rejected: PASS');
  });
  console.log('PHASE 7 ACTIVATION: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
