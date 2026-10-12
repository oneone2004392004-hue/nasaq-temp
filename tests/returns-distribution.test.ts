import assert from 'node:assert/strict';
import { calculateMerchandiseRefund } from '../src/features/returns/services/ReturnService';

// الفاتورة: صافي 11,000، منها توصيل 1,000. لا يدخل التوصيل في المرتجع الجزئي.
assert.equal(calculateMerchandiseRefund(11000, 1000, 6000, 10000, 1, 1), 6000);
assert.equal(calculateMerchandiseRefund(11000, 1000, 4000, 10000, 1, 1), 4000);

// عند اكتمال كل الأصناف، مجموع توزيع الأصناف = الصافي بعد استبعاد التوصيل.
const first = calculateMerchandiseRefund(11000, 1000, 6000, 10000, 1, 1);
const second = calculateMerchandiseRefund(11000, 1000, 4000, 10000, 1, 1);
assert.equal(first + second, 10000);
assert.equal(first + second + 1000, 11000, 'رسوم التوصيل تضاف فقط عند اكتمال المرتجع');

// اختبار حالة ضريبة/خصم مضمّنين في صافي الفاتورة مع كسور التقريب.
assert.equal(calculateMerchandiseRefund(12345, 345, 3333, 10000, 1, 1), 4000);
console.log('RETURNS DISTRIBUTION: PASS');
