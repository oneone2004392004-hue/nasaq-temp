import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CP864_PRESENTATION, EscPosBuilder } from '../src/features/hardware/escpos/EscPosBuilder';
import { ArabicTextProcessor } from '../src/features/hardware/escpos/ArabicTextProcessor';

const reference: string[] = JSON.parse(readFileSync(new URL('./fixtures/cp864.json', import.meta.url), 'utf8'));
assert.equal(reference.length, 256, 'CP864 fixture must cover all bytes');

for (const [glyph, code] of Object.entries(CP864_PRESENTATION)) {
  const replacement = glyph === '\uFE87' ? '\uFE8D'
    : glyph === '\uFE88' ? '\uFE8E'
      : glyph === '\uFEF9' ? '\uFEFB'
        : glyph === '\uFEFA' ? '\uFEFC' : glyph === '\u066B' ? '.' : glyph;
  const effectiveCode = replacement === '.' ? 0x2e : replacement === glyph ? code : CP864_PRESENTATION[replacement];
  const decoded = reference[effectiveCode];
  assert.notEqual(decoded, '\ufffd', `Undefined CP864 mapping for U+${glyph.charCodeAt(0).toString(16)}`);
  assert.equal(decoded.normalize('NFKC'), replacement.normalize('NFKC'), `Bad CP864 table entry U+${glyph.charCodeAt(0).toString(16)} -> 0x${effectiveCode.toString(16)}`);
}

const baseLetters = 'ءآأؤإئابتثجحخدذرزسشصضطظعغفقكلمنهويى';
for (const letter of baseLetters) {
  const bytes = new EscPosBuilder('CP864').text(letter).build().slice(5);
  assert.equal(bytes.length, 1, `Expected one CP864 byte for ${letter}`);
  const expected = letter === 'إ' ? 'ا' : letter;
  const decoded = reference[bytes[0]];
  assert.notEqual(decoded, '\ufffd', `Undefined CP864 byte for ${letter}`);
  assert.equal(decoded.normalize('NFKC'), expected.normalize('NFKC'), `Wrong CP864 glyph for ${letter} at 0x${bytes[0].toString(16)}`);
}

const words = ['إجمالي الفاتورة', 'إلغاء', 'إضافة', 'الإيصال'];
for (const word of words) {
  const cp864 = new EscPosBuilder('CP864').text(word).build().slice(5);
  const expectedCp864 = new EscPosBuilder('CP864').text(word.replaceAll('لإ', 'لا').replaceAll('إ', 'ا')).build().slice(5);
  assert.deepEqual(cp864, expectedCp864, `CP864 substitution mismatch: ${word}`);
  const wpc = new EscPosBuilder('WPC1256').text(word).build().slice(5);
  assert.ok(wpc.includes(0xc5), `WPC1256 must encode hamza-below as CP1256 0xC5: ${word}`);
}

for (const ligature of ['لإ', 'لإلغاء']) {
  const actual = new EscPosBuilder('CP864').text(ligature).build().slice(5);
  const substitute = new EscPosBuilder('CP864').text(ligature.replaceAll('لإ', 'لا')).build().slice(5);
  assert.deepEqual(actual, substitute, `CP864 lam-alef substitution mismatch: ${ligature}`);
}

assert.equal(ArabicTextProcessor.reshape('إ').length, 1);
console.log('PHASE 4 CP864 REGRESSION: PASS');
