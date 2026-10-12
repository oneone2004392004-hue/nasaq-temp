import assert from 'node:assert/strict';
import { EscPosBuilder } from '../src/features/hardware/escpos/EscPosBuilder';
import { ArabicTextProcessor } from '../src/features/hardware/escpos/ArabicTextProcessor';

const cp864 = new EscPosBuilder('CP864').text('نسق').build();
assert.deepEqual(Array.from(cp864.slice(0, 5)), [0x1b, 0x40, 0x1b, 0x74, 17]);
assert.ok(cp864.slice(5).every((byte) => byte !== 0x3f), 'CP864 must not emit question-mark replacement');

const wpc = new EscPosBuilder('WPC1256').text('نسق').build();
assert.deepEqual(Array.from(wpc.slice(0, 5)), [0x1b, 0x40, 0x1b, 0x74, 33]);
assert.deepEqual(Array.from(wpc.slice(5)), [0xdd, 0xd3, 0xe4]);

const customCodePage = new EscPosBuilder('CP864', 50).text('نسق').build();
assert.deepEqual(Array.from(customCodePage.slice(0, 5)), [0x1b, 0x40, 0x1b, 0x74, 50]);

const arabicAlphabet = 'ءآأؤإئابتثجحخدذرزسشصضطظعغفقكلمنهويى';
const supportedPunctuation = '،؛؟ـ٫٠١٢٣٤٥٦٧٨٩';
const ligatures = 'ﻻﻼﻷﻸﻹﻺﻵﻶ';
const longReceipt = 'مطعم النسق فاتورة رقم 12 | الأصناف: برجر، بيتزا، مشروب | الإجمالي ١٢٥٫٥٠ | الباقي ٢٠';
for (const text of [arabicAlphabet, supportedPunctuation, ligatures, longReceipt]) {
  const bytes = new EscPosBuilder('CP864').text(text).build().slice(5);
  assert.equal(bytes.filter((byte) => byte === 0x3f).length, 0, `CP864 emits ? for: ${text}`);
  assert.equal(bytes.filter((byte) => byte === 0x2d).length, 0, `CP864 emits fallback '-' for: ${text}`);
}

const shaped = ArabicTextProcessor.reshape(arabicAlphabet);
assert.equal(shaped.length, arabicAlphabet.length, 'Arabic shaping preserves glyph count');
const visual = ArabicTextProcessor.visualReorder('إجمالي 125 الباقي');
assert.ok(visual.includes('125'), 'visual reorder preserves LTR number token');

const unsupported = new EscPosBuilder('WPC1256').text('☃').build();
assert.equal(unsupported.at(-1), 0x2d, 'Unsupported character uses documented dash fallback');
console.log('PHASE 3 INTEGRITY: PASS');
