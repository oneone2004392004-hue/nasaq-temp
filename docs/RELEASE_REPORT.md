# تقرير إصدار نسق POS — الجولة الخامسة

## النطاق والبيئة

- المصدر: أرشيف `NasaqPOS-Source-1.0.2(2).zip`.
- لم يتضمن الأرشيف مستودع Git؛ أُنشئ مستودع محلي ولقطة أساس `9a0d135` لتسجيل التغييرات المطلوبة.
- جرى فحص النسخة داخل Sandbox Linux. لم يتوفر Windows أو طابعة فعلية.
- عدد ملفات الاختبار قبل التغييرات: 22 ملف `*.test.ts`.
- عدد ملفات الاختبار بعد A4: 23 ملف `*.test.ts`، مع ملف fixture إضافي. لم يُحذف اختبار.

## A4 — ترميز CP864 للحروف «إ» و«لإ»

**الحالة:** ✅ اتنفذ واتأكد بأمر آلي ناتجه ملصوق.

- أُضيف مرجع CP864 من Python لكل بايت 0–255. بايتات Python غير المعرفة ممثلة بـ U+FFFD كي يظل المرجع كاملاً.
- استُبدلت أشكال الألف بهمزة تحت بأشكال الألف العادية في CP864 فقط. واستُبدل شكل «لإ» بـ «لا». WPC1256 بقي دون تحويل.
- اختُبر كل إدخال في جدول CP864 مقابل المرجع بعد التطبيع، إضافة إلى الكلمات «إجمالي الفاتورة»، «إلغاء»، «إضافة»، «الإيصال».
- إثبات قبل/بعد: أُضيف الاختبار، ثم استُخدم `git stash --keep-index` لعزل تعديل المعالجة وحده. الاختبار فشل على السلوك القديم ثم مر بعد استعادة الإصلاح.
- ملاحظة: جدول CP864 الحالي يطبع U+066B كنقطة ASCII `.`؛ الاختبار يوثق هذا البديل الموجود.

### إثبات فشل السلوك القديم

الأمر:

```text
node --import tsx tests/phase4-cp864.test.ts
```

الناتج الحرفي الأخير:

```text
'ع' !== 'ا'
    at <anonymous> (/tmp/nasaq-inspect/tests/phase4-cp864.test.ts:27:10)
    at ModuleJob.run (node:internal/modules/esm/module_job:271:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:263:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5) {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: 'ع',
  expected: 'ا',
  operator: 'strictEqual'
}
Node.js v22.13.0
```

### إثبات بعد الإصلاح

الأمر:

```text
node --import tsx tests/phase4-cp864.test.ts
```

الناتج الحرفي:

```text
PHASE 4 CP864 REGRESSION: PASS
```

### فحوص الدفعة بالترتيب

**1. الأمر:** `npx tsc --noEmit`

**الناتج الحرفي:** لا مخرجات stdout/stderr؛ exit code `0`.

**2. الأمر:** `npm run lint`

**الناتج الحرفي:**

```text
> nasaq-pos@1.0.2 lint
> tsc --noEmit
```

**3. الأمر:** `npm test`

**الناتج الحرفي الأخير:**

```text
> nasaq-pos@1.0.2 test:phase3
> tsx tests/phase3-integrity.test.ts
ESC/POS code page WPC1256 لا يدعم الحرف ☃; تم استبداله بشرطة.
PHASE 3 INTEGRITY: PASS
> nasaq-pos@1.0.2 test:phase4
> tsx tests/phase4-cp864.test.ts
PHASE 4 CP864 REGRESSION: PASS
> nasaq-pos@1.0.2 test:returns
> tsx tests/returns-distribution.test.ts
RETURNS DISTRIBUTION: PASS
```

**4. الأمر:** `cd src-tauri && cargo check`

**الناتج الحرفي الأخير:**

```text
Updating crates.io index
Locking 6 packages to highest compatible versions
Adding ahash v0.8.12
Adding fallible-iterator v0.3.0
Adding fallible-streaming-iterator v0.1.9
Downgrading hashbrown v0.15.5 -> v0.14.5
Downgrading hashlink v0.10.0 -> v0.9.1
Adding rusqlite v0.32.1 (available: v0.40.2)
Finished `dev` profile [unoptimized + debuginfo] target(s) in 13.07s
```

**5. الأمر:** `cd src-tauri && cargo test`

**الناتج الحرفي الأخير:**

```text
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
Running unittests src/main.rs (target/debug/deps/nasaq_pos-1d98a956120d73c4)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
Doc-tests nasaq_pos
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

**6. الأمر:** `cd src-tauri && cargo clippy -- -D warnings`

**الناتج الحرفي:**

```text
Checking nasaq-pos v1.0.2 (/tmp/nasaq-inspect/src-tauri)
Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.10s
```

كل أوامر التحقق أعلاه خرجت برمز `0` في التشغيل النهائي لـ A4. أُعيد إنشاء `Cargo.lock` تلقائياً أثناء فحص Cargo؛ هذا التغيير البيئي غير داخل بند A4 وسيُراجع قبل الإصدار.

## A5 — المرتجعات

**الحالة:** ✅ اتنفذ واتأكد بأوامر آلية؛ راجع سجل التنفيذ والأدلة التفصيلية أدناه.

## A6 — اتصال Rust وسلامة القاعدة

**الحالة:** ✅ اتنفذ واتأكد آلياً؛ التفصيل والنواتج في سجل التنفيذ أدناه.

## ملاحظات

- الاختبارات الحالية لـ Rust تحتوي صفر اختبارات؛ توضح ذلك مخرجات `cargo test` أعلاه.
- فحوص الطابعة الحقيقية وWindows لا يمكن تنفيذها في Sandbox Linux.


## A5 — المرتجعات (تقرير التنفيذ)

**الحالة:** ✅ اتنفذ واتأكد بأوامر آلية نواتجها ملصوقة أدناه.

- دمج تكرارات السطر الواحد قبل التحقق من الكمية. التتبع صار على `order_item_id`؛ المدخل القديم بـ`productId` مسموح عند وجود سطر واحد فقط.
- migration `008_return_order_item_id` تضيف عموداً nullable للصفوف القديمة وفهرساً idempotent؛ لا توجد خطوة حذف.
- الواجهة ترسل معرف سطر الفاتورة وتسمح بكميات منفصلة للأسطر المتكررة.
- التوزيع بالقروش عبر استحقاق تراكمي لكل سطر، مع تسوية باقي القروش عند اكتمال كامل الأصناف وإضافة التوصيل مرة واحدة.
- النقد المتوقع يحسب من `opening_cash + netCash` لدفتر الحركات. تجاوز المبلغ يتطلب صلاحية `returns.refund` وتأكيداً صريحاً يسجل في `audit_logs`.
- اختبارات التكامل تمر بالخدمات الحقيقية `createAndPayOrder` ثم `ReturnService.create` ثم استعلامات SQLite.
- عدد ملفات `*.test.ts`: قبل A5 = 23، بعد A5 = 24. إضافة اختبار واحدة، ولا اختبار محذوف.

### إثبات فشل اختبارات جديدة على الخدمة القديمة

الأمر لكل حالة: `A5_CASE=<case> ./node_modules/.bin/tsx tests/phase5-returns-e2e.test.ts`، مع إخفاء تعديل `ReturnService.ts` باستخدام `git stash --keep-index`.

```text
===== OLD SERVICE CASE: duplicate =====
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
2 !== 1
    at duplicateMerge (/tmp/nasaq-inspect/tests/phase5-returns-e2e.test.ts:103:10)
    at async main (/tmp/nasaq-inspect/tests/phase5-returns-e2e.test.ts:198:3) {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: 2,
  expected: 1,
  operator: 'strictEqual'
}
OLD_CODE_FAIL exit=1
===== OLD SERVICE CASE: split =====
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
ConflictError: كمية المرتجع تتجاوز الكمية المباعة للصنف صنف a5-split.
    at <anonymous> (/tmp/nasaq-inspect/src/features/returns/services/ReturnService.ts:68:65)
    at Array.map (<anonymous>)
OLD_CODE_FAIL exit=1
===== OLD SERVICE CASE: noninclusive =====
A5 exclusive tax installments E2E: PASS
PHASE 5 RETURNS E2E: PASS
OLD_CODE_PASS
===== OLD SERVICE CASE: inclusive =====
A5 inclusive tax installments E2E: PASS
PHASE 5 RETURNS E2E: PASS
OLD_CODE_PASS
===== OLD SERVICE CASE: cash =====
AssertionError [ERR_ASSERTION]: Missing expected rejection.
    at async cashOverdraw (/tmp/nasaq-inspect/tests/phase5-returns-e2e.test.ts:163:3)
OLD_CODE_FAIL exit=1
```

حالات الضرائب كانت تمر أصلاً على الخدمة القديمة؛ تبقى اختبارات E2E لتثبيت الحساب عبر الخدمات والجداول، ولا يُدّعى أنها تكشف عيباً قديماً.

### إثبات الحالات بعد التعديل

الأمر: `npm run test:phase5-returns`

```text
> nasaq-pos@1.0.2 test:phase5-returns
> A5_CASE=duplicate tsx tests/phase5-returns-e2e.test.ts && A5_CASE=split tsx tests/phase5-returns-e2e.test.ts && A5_CASE=noninclusive tsx tests/phase5-returns-e2e.test.ts && A5_CASE=inclusive tsx tests/phase5-returns-e2e.test.ts && A5_CASE=cash tsx tests/phase5-returns-e2e.test.ts
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
A5 duplicate merge E2E: PASS
PHASE 5 RETURNS E2E: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
A5 split product lines E2E: PASS
PHASE 5 RETURNS E2E: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
A5 exclusive tax installments E2E: PASS
PHASE 5 RETURNS E2E: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
A5 inclusive tax installments E2E: PASS
PHASE 5 RETURNS E2E: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
A5 cash overdraw guard E2E: PASS
PHASE 5 RETURNS E2E: PASS
```

### فحوص دفعة A5 بالترتيب

**1. `npx tsc --noEmit`** — لا مخرجات؛ exit code `0`.

**2. `npm run lint`**

```text
> nasaq-pos@1.0.2 lint
> tsc --noEmit
```

**3. `npm test` — آخر 15 سطراً حرفياً**

```text
PHASE 5 RETURNS E2E: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
A5 exclusive tax installments E2E: PASS
PHASE 5 RETURNS E2E: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
A5 inclusive tax installments E2E: PASS
PHASE 5 RETURNS E2E: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
A5 cash overdraw guard E2E: PASS
PHASE 5 RETURNS E2E: PASS
> nasaq-pos@1.0.2 test:returns
> tsx tests/returns-distribution.test.ts
RETURNS DISTRIBUTION: PASS
```

**4. `cd src-tauri && cargo check` — آخر 15 سطراً حرفياً**

```text
Updating crates.io index
Locking 6 packages to highest compatible versions
Adding ahash v0.8.12
Adding fallible-iterator v0.3.0
Adding fallible-streaming-iterator v0.1.9
Downgrading hashbrown v0.15.5 -> v0.14.5
Downgrading hashlink v0.10.0 -> v0.9.1
Adding rusqlite v0.32.1 (available: v0.40.2)
Finished `dev` profile [unoptimized + debuginfo] target(s) in 13.63s
```

**5. `cd src-tauri && cargo test` — الناتج الحرفي**

```text
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
Running unittests src/main.rs (target/debug/deps/nasaq_pos-1d98a956120d73c4)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
Doc-tests nasaq_pos
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

**6. `cd src-tauri && cargo clippy -- -D warnings`**

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.32s
```

كل أوامر دفعة A5 خرجت برمز `0`.


## A6 — اتصال Rust وسلامة قاعدة البيانات

**الحالة:** ✅ اتنفذ واتأكد بفحوص آلية، مع بقاء التحقق التشغيلي على Windows ضمن ملاحظات الإصدار.

- `db_init` يعيد اتصال SQLite لوضع autocommit عبر `ROLLBACK` عند الحاجة، ثم يعيد تطبيق foreign keys وWAL وbusy timeout و`synchronous=FULL`. التعليق يوضح أن FULL لحماية معاملات POS الملتزمة من فقد الطاقة.
- أضيف `db_reset_transaction` واستدعاؤه في Tauri driver قبل كل `db_init` عند تهيئة الجسر.
- `db_exec` يعالج الجمل ذات النتائج باستخدام `column_count` واستنزاف الصفوف: يشمل PRAGMA وINSERT RETURNING.
- الاستعادة تكتب `nasaq.db.restore` بجوار قاعدة البيانات، وترفض الملفات الفارغة/بلا جداول، وتفحص `integrity_check` و`foreign_key_check` قبل إغلاق الاتصال الحالي. عند اجتياز الفحص تحفظ `nasaq.db.pre-restore`، تحذف WAL/SHM، تستبدل الملف وتعيد فتحه مع pragmas. الفشل بعد الإغلاق يحاول إعادة الملف السابق وإعادة فتح الاتصال؛ الخطأ عربي. أُضيفت حقنة فشل للاختبار فقط داخل helper الخاص بالاختبارات.
- التصدير ينفّذ `VACUUM INTO` إلى ملف مؤقت ثم يقرأه ويحذفه بدلاً من قراءة ملف قاعدة حيّة.
- `DatabaseManager.exportDatabase` و`restoreDatabase` ينتظران `operationQueue`؛ اختبار TypeScript يثبت أن restore ينتظر معاملة مفتوحة.
- اختبارات Rust الجديدة: 6 حالات للـrollback عند إعادة التهيئة، SQL ذات نتائج، النسخة التالفة، الاستعادة الصحيحة، فشل منتصف الاستعادة واللقطة. كانت اختبارات Rust قبل A6 صفراً.
- عدد ملفات `*.test.ts`: قبل A6 = 24، بعد A6 = 25. ملف اختبار إضافي؛ لا يوجد حذف. أُضيفت 6 اختبارات Rust unit.

### إثبات الفشل على الكود السابق

**TypeScript — الأمر:** `npm run test:phase6-db-queue` بعد `git stash` لتعديل `DatabaseManager.ts` وحده.

```text
> nasaq-pos@1.0.2 test:phase6-db-queue
> tsx tests/phase6-db-queue.test.ts
AssertionError [ERR_ASSERTION]: restore must not touch driver while transaction is open
true !== false
    at main (/tmp/nasaq-inspect/tests/phase6-db-queue.test.ts:39:10) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: true,
  expected: false,
  operator: 'strictEqual'
}
OLD_CODE_EXIT=1
```

بعد استعادة الإصلاح:

```text
> nasaq-pos@1.0.2 test:phase6-db-queue
> tsx tests/phase6-db-queue.test.ts
PHASE 6 DB QUEUE: PASS
```

**Rust — الأمر:** `cargo test --lib` مع إبقاء اختبارات A6 الجديدة وإخفاء تعديلات `src-tauri/src/lib.rs` الأخرى عبر `git stash`.

```text
error[E0425]: cannot find function `open_configured` in this scope
   --> src/lib.rs:280:32
    |
280 |         let mut current = Some(open_configured(&path).unwrap());
    |                                ^^^^^^^^^^^^^^^ not found in this scope
error[E0425]: cannot find function `restore_database` in this scope
   --> src/lib.rs:281:22
    |
281 | ...   let result = restore_database(&path, &mut current, &new_bytes, tr...
    |                    ^^^^^^^^^^^^^^^^ not found in this scope
error[E0425]: cannot find function `export_snapshot` in this scope
   --> src/lib.rs:302:21
    |
302 |         let bytes = export_snapshot(&conn, &path).unwrap();
    |                     ^^^^^^^^^^^^^^^ not found in this scope
For more information about this error, try `rustc --explain E0425`.
error: could not compile `nasaq-pos` (lib test) due to 14 previous errors
OLD_CODE_EXIT=101
```

بعد استعادة التعديلات:

```text
running 6 tests
test db_tests::execute_handles_row_returning_pragmas_and_insert_returning ... ok
test db_tests::reset_transaction_rolls_back_incomplete_work_and_allows_new_transaction ... ok
test db_tests::backup_uses_vacuum_into_snapshot ... ok
test db_tests::corrupt_restore_keeps_current_database_usable ... ok
test db_tests::failed_restore_after_swap_rolls_back_to_previous_database ... ok
test db_tests::valid_restore_replaces_database_contents ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

### فحوص دفعة A6 بالترتيب — آخر الناتج الفعلي

**1. `npx tsc --noEmit`**

```text
EXIT_CODE=0
```

**2. `npm run lint`**

```text
> nasaq-pos@1.0.2 lint
> tsc --noEmit
EXIT_CODE=0
```

**3. `npm test`**

```text
A5 inclusive tax installments E2E: PASS
PHASE 5 RETURNS E2E: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
A5 cash overdraw guard E2E: PASS
PHASE 5 RETURNS E2E: PASS
> nasaq-pos@1.0.2 test:phase6-db-queue
> tsx tests/phase6-db-queue.test.ts
PHASE 6 DB QUEUE: PASS
> nasaq-pos@1.0.2 test:returns
> tsx tests/returns-distribution.test.ts
RETURNS DISTRIBUTION: PASS
EXIT_CODE=0
```

**4. `cd src-tauri && cargo check`**

```text
Updating crates.io index
warning: spurious network error (3 tries remaining): transfer too slow: failed to transfer more than 10 bytes in 30s (transferred 0 bytes)
Locking 6 packages to highest compatible versions
Adding ahash v0.8.12
Adding fallible-iterator v0.3.0
Adding fallible-streaming-iterator v0.1.9
Downgrading hashbrown v0.15.5 -> v0.14.5
Downgrading hashlink v0.10.0 -> v0.9.1
Adding rusqlite v0.32.1 (available: v0.40.2)
Checking nasaq-pos v1.0.2 (/tmp/nasaq-inspect/src-tauri)
Finished `dev` profile [unoptimized + debuginfo] target(s) in 1m 11s
EXIT_CODE=0
```

**5. `cd src-tauri && cargo test`**

```text
test db_tests::execute_handles_row_returning_pragmas_and_insert_returning ... ok
test db_tests::reset_transaction_rolls_back_incomplete_work_and_allows_new_transaction ... ok
test db_tests::backup_uses_vacuum_into_snapshot ... ok
test db_tests::corrupt_restore_keeps_current_database_usable ... ok
test db_tests::failed_restore_after_swap_rolls_back_to_previous_database ... ok
test db_tests::valid_restore_replaces_database_contents ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
     Running unittests src/main.rs (target/debug/deps/nasaq_pos-1d98a956120d73c4)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
Doc-tests nasaq_pos
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
EXIT_CODE=0
```

**6. `cd src-tauri && cargo clippy -- -D warnings`**

```text
Compiling nasaq-pos v1.0.2 (/tmp/nasaq-inspect/src-tauri)
Checking nasaq-pos v1.0.2 (/tmp/nasaq-inspect/src-tauri)
Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.83s
EXIT_CODE=0
```

ملاحظة تنفيذية: crates.io أعطى تحذيرات اتصال عابرة أثناء `cargo check`؛ انتهى الأمر بالرمز 0. فحوص دفعة A6 كلها بالترتيب أعلاه انتهت برمز 0.

## ملاحظات إصدار ميداني

- نتائج البيئة الحالية تخص Sandbox Linux وSQLite WASM للاختبارات، إضافة إلى فحوص Rust على Linux. لم يُشغّل تطبيق Tauri على Windows، ولم يُختبر NSIS أو WebView2 أو طابعة USB/شبكة فعلية.
- لذلك تجربة Windows والطابعة الحقيقية المطلوبة في تقرير المرحلة الثالثة تبقى 🟡 اتنفذ لكن يحتاج جهاز Windows أو طابعة حقيقية؛ لا يُعد هذا التسليم إثباتاً للتشغيل الميداني على جهاز Windows.
- `cargo test` صار يحتوي 6 اختبارات Rust (قبل A6 كان صفر). `npm test` يمر عبر كل مجموعات المشروع بما فيها الاختبارات الجديدة؛ مخرجاته الحرفية أعلاه.


## B2 — استعادة التفعيل ومقاومة رجوع الساعة

**الحالة:** 🟡 اتنفذ لكن يحتاج تشغيل Tauri على Windows للتحقق النهائي من AppData عبر `plugin-fs`.

- يقرأ `nasaq-activation.json` من AppData أولاً؛ الملف مصدر أولوية لـ`deviceId` والمفتاح. تُستعاد الهوية بعد حذف localStorage، ويعاد بناء الملف التالف من localStorage. تُزامن القيم إلى المخزنين.
- يخزن `last_seen_at` في الملف وجدول `settings`. يرفض حالة التفعيل ومحاولة التفعيل إذا رجعت الساعة أكثر من 24 ساعة.
- الاختبارات تحاكي الملفات وsettings وlocalStorage. تحققت الحالات الأربع المطلوبة، واختبار إضافي يمنع تجاوز فحص الساعة عبر إدخال مفتاح جديد.

### إثبات الفشل على الكود السابق

**الأمر:** `npx tsx tests/phase7-activation.test.ts` بعد إخفاء تعديل `ActivationService.ts` وحده عبر `git stash`.

```text
/tmp/nasaq-inspect/tests/phase7-activation.test.ts:3
  ActivationFileState, activateWithKey, getActivationStatus, setActivationAdaptersForTesting,
                                                             ^
SyntaxError: The requested module '../src/features/activation/ActivationService' does not provide an export named 'setActivationAdaptersForTesting'
    at ModuleJob._instantiate (node:internal/modules/esm/module_job:180:21)
    at async ModuleJob.run (node:internal/modules/esm/module_job:263:5)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:547:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)
Node.js v22.13.0
OLD_CODE_EXIT=1
```

**الأمر بعد استعادة الإصلاح:** `npm run test:phase7-activation`

```text
> nasaq-pos@1.0.2 test:phase7-activation
> tsx tests/phase7-activation.test.ts
B2 file restores device after localStorage loss: PASS
B2 corrupt file recovers from localStorage: PASS
B2 clock rollback rejected: PASS
B2 key bound to another device rejected: PASS
PHASE 7 ACTIVATION: PASS
```


## B3 — الطلبات المعلقة عند إغلاق الوردية

**الحالة:** ✅ اتنفذ واتأكد باختبار end-to-end على SQLite WASM.

- تعرض نافذة الإغلاق أرقام الطلبات وأنواعها وطاولاتها وإجمالياتها. تعرض تأكيداً صريحاً للمدير؛ زر الإغلاق يبقى معطلاً حتى تأكيد الإلغاء.
- يرفض `ShiftService.closeShift` الإغلاق دون تأكيد، ويذكر أرقام الطلبات. مع التأكيد، يعيد التحقق من صلاحية المدير داخل المعاملة، ويلغي الطلبات، ويحرر الطاولات، ويعكس أي حركة مخزون `SALE` مرتبطة، ويسجل تدقيقاً بأرقام الطلبات ومعرفاتها.
- اختبار E2E أنشأ وردية وطاولة وصنف وطلبين عبر الخدمات الحقيقية؛ تحقق من الرفض قبل التأكيد، ثم `CANCELLED` للطلبين، `AVAILABLE` للطاولة، عودة المخزون من 18 إلى 20، ووجود أرقام الطلبات في audit.
- الاختبار نفسه يتحقق أن مستخدماً يملك `shifts.close` فقط لا يستطيع تأكيد الإلغاء؛ الطلبان يبقيان دون تغيير حتى قرار المدير.
- عُدّل مستخدم fixture واحد في `phase13-production-hardening.test.ts` من cashier إلى admin عند إغلاق وردية تحتوي طلبات معلقة؛ سياسة B3 الجديدة تجعل إلغاء هذه الطلبات قراراً إدارياً. لم تُحذف أو تُخفف أي assertions، وبقيت 70 assertions في مجموعة hardening.

### إثبات الفشل على الكود السابق

**الأمر:** `npx tsx tests/phase7-shift-close-e2e.test.ts` بعد `git stash` لتعديل `ShiftService.ts` وحده.

```text
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
AssertionError [ERR_ASSERTION]: The validation function is expected to return "true". Received false
Caught error:
ConflictError: لا يمكن إغلاق الوردية قبل إنهاء أو إلغاء 2 طلبات معلقة.
    at async main (/tmp/nasaq-inspect/tests/phase7-shift-close-e2e.test.ts:70:3) {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: [ConflictError],
  expected: [Function (anonymous)],
  operator: 'rejects'
}
OLD_CODE_EXIT=1
```

**الأمر بعد استعادة الإصلاح:** `npx tsx tests/phase7-shift-close-e2e.test.ts`

```text
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
B3 cashier cannot authorize automatic cancellation: PASS
B3 pending orders block close and list numbers: PASS
B3 confirmed close cancels orders, releases table, audits order numbers: PASS
B3 cancellation restores reserved inventory quantity: PASS
PHASE 7 SHIFT CLOSE E2E: PASS
```


## B4 — استعادة الجلسة وقفل فك القفل وبيانات الاختبار

**الحالة:** ✅ اتنفذ واتأكد بالفحوص الآلية.

- `restoreSession` يعيد بناء الدور والصلاحيات من قاعدة البيانات باستخدام `user.id` فقط؛ لا يعتمد على `roleCode` أو permissions المحفوظة محلياً.
- أضيفت حالة القفل الموثوقة إلى جدول `settings` (`auth_session_locked:<userId>`). القفل اليدوي يحفظها، وفتح القفل/تسجيل الدخول الناجح يمسحها، و`restoreSession` يتجاهل `isLocked` المحلي ويقرأ القيمة الموثوقة. عداد وإيقاف محاولات unlock يبقيان محفوظين في settings عبر إنشاء `AuthService` جديد.
- اختبار B4 زوّر localStorage ليعرض صلاحيات ADMIN ويزعم أن الجلسة مفتوحة، بينما قاعدة البيانات/settings تقول CASHIER ومقفلة؛ أعاد restoreSession الدور والصلاحيات الحقيقية وأبقى القفل. ثم أثبت استمرار قفل الخمس محاولات بعد إنشاء خدمة جديدة.
- أزيل testSeed من barrel الإنتاجي. `npm run build` اكتمل؛ مسح dist أدناه لم يجد `testSeed` أو أسماء seed أو علامات كلمات مرور تجريبية. ملاحظة البناء: Vite أصدر تحذير chunk يتجاوز 500 kB؛ لم يُغيّر السلوك ضمن نطاق الإصلاح.

### إثبات الفشل على الكود السابق

**الأمر:** `npx tsx tests/phase7-auth-security.test.ts` بعد `git stash` لتعديل `AuthService.ts` وحده.

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
false !== true
    at main (/tmp/nasaq-inspect/tests/phase7-auth-security.test.ts:48:10) {
  generatedMessage: true,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: 'strictEqual'
}
OLD_CODE_EXIT=1
```

**الأمر بعد الإصلاح:** `npm run test:phase7-auth-security`

```text
> nasaq-pos@1.0.2 test:phase7-auth-security
> tsx tests/phase7-auth-security.test.ts
B4 restore trusts database role and permissions, not localStorage: PASS
B4 unlock lockout persists across AuthService recreation: PASS
PHASE 7 AUTH SECURITY: PASS
```

**فحص bundle:** `grep -R -n -E 'testSeed|runTestSeed|hash_test_secret_123|hash_test_secret_456|admin_test|cashier_test' dist`

```text
```

خرج grep فارغ (exit code `1` لعدم وجود أي مطابقة). أمر البناء: `npm run build`، النتيجة الحرفية النهائية:

```text
✓ built in 4.95s
BUNDLE_GREP_EXIT=1
```


## B5 — استبدال نوافذ المتصفح وإكمال إدارة العملاء والطاولات والمندوبين

**الحالة:** ✅ اتنفذ واتأكد بالفحوص الآلية.

- استبدلت إدخالات Tables وDelivery وCustomers بنوافذ `Modal`، وحذف الطابعة صار عبر `ConfirmDialog` بدل `window.confirm`.
- الطاولات: اسم مطلوب، السعة عدد صحيح موجب، الإنشاء والتعديل والتعطيل من خلال `TableService` مع الصلاحيات والتدقيق.
- المندوبون: تحقق مصري `01[0125]xxxxxxxx` في الواجهة والخدمة، وإنشاء/تعديل/تفعيل/تعطيل عبر `DeliveryService`.
- العملاء: أضيف `CustomerService` لإنشاء/تعديل/تفعيل/تعطيل مع permission وaudit، وMigration 009 لحقل `is_active`.
- أعيد تنسيق `InventoryPage` و`UsersPage` مع `TablesPage` و`DeliveryPage` إلى JSX مقروء دون تغيير وظائف المخزون أو المستخدمين.
- تصحيح fixture قديم واحد في `tables-delivery.test.ts`: كان يرسل رقماً يبدأ بـ050، وهو غير مصري صالح حسب شرط B5؛ أصبح يبدأ بـ010 ويظل الاختبار يحقق إنشاء المندوب وتكرار الرقم. لا assertions محذوفة أو مخففة.
- عدد ملفات الاختبار: قبل دفعة B2–B5 = 25 (`*.test.ts` عند تقرير A6)، بعدها = 29؛ أضيفت أربعة ملفات اختبار، ولم يُحذف أي اختبار.

### إثبات الفشل على الكود السابق

**الأمر:** `npx tsx tests/phase7-management-validation.test.ts` بعد `git stash` لتعديل `src/features/delivery/validation.ts` وحده.

```text
AssertionError [ERR_ASSERTION]: Missing expected exception (ValidationError).
    at main (/tmp/nasaq-inspect/tests/phase7-management-validation.test.ts:17:12)
    at <anonymous> (/tmp/nasaq-inspect/tests/phase7-management-validation.test.ts:56:1)
    at ModuleJob.run (node:internal/modules/esm/module_job:271:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:547:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:116:5) {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: undefined,
  expected: [class ValidationError extends DatabaseError],
  operator: 'throws'
}
OLD_CODE_EXIT=1
```

**الأمر بعد استعادة الإصلاح:** `npm run test:phase7-management`

```text
> nasaq-pos@1.0.2 test:phase7-management
> tsx tests/phase7-management-validation.test.ts
B5 Egyptian mobile validation: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
B5 customer/table/driver Service CRUD and deactivate audit paths: PASS
PHASE 7 MANAGEMENT VALIDATION: PASS
```

**فحص قبول الواجهات — الأمر الحرفي:** `grep -rn "window.prompt\|window.confirm\|alert(" src --include=*.tsx --include=*.ts`

```text
```

الناتج فارغ تماماً؛ `PROMPT_GREP_EXIT=1` و`PROMPT_MATCH_LINES=0` (1 هو رمز grep المعتاد لعدم وجود نتائج).


## فحوص دفعة B2–B5 بالترتيب الإلزامي

كل الأوامر الستة التالية نُفذت بعد الإصلاحات وخرجت بالرمز 0. فيما يلي الخرج الفعلي لكل أمر (كاملاً عندما كان أقصر من 15 سطراً، وآخر 15 سطراً عند `npm test`).

**1. `npx tsc --noEmit`**

```text
EXIT_CODE=0
```

**2. `npm run lint`**

```text
> nasaq-pos@1.0.2 lint
> tsc --noEmit
EXIT_CODE=0
```

**3. `npm test` — آخر 15 سطراً**

```text
> nasaq-pos@1.0.2 test:phase7-auth-security
> tsx tests/phase7-auth-security.test.ts
B4 restore trusts database role and permissions, not localStorage: PASS
B4 unlock lockout persists across AuthService recreation: PASS
PHASE 7 AUTH SECURITY: PASS
> nasaq-pos@1.0.2 test:phase7-management
> tsx tests/phase7-management-validation.test.ts
B5 Egyptian mobile validation: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
B5 customer/table/driver Service CRUD and deactivate audit paths: PASS
PHASE 7 MANAGEMENT VALIDATION: PASS
EXIT_CODE=0
```

**4. `cd src-tauri && cargo check`**

```text
    Updating crates.io index
     Locking 6 packages to highest compatible versions
      Adding ahash v0.8.12
      Adding fallible-iterator v0.3.0
      Adding fallible-streaming-iterator v0.1.9
 Downgrading hashbrown v0.15.5 -> v0.14.5
 Downgrading hashlink v0.10.0 -> v0.9.1
      Adding rusqlite v0.32.1 (available: v0.40.2)
    Checking nasaq-pos v1.0.2 (/tmp/nasaq-inspect/src-tauri)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 15.36s
EXIT_CODE=0
```

**5. `cd src-tauri && cargo test` — آخر الخرج الفعلي**

```text
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
     Running unittests src/main.rs (target/debug/deps/nasaq_pos-1d98a956120d73c4)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
   Doc-tests nasaq_pos
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
EXIT_CODE=0
```

**6. `cd src-tauri && cargo clippy -- -D warnings`**

```text
    Checking nasaq-pos v1.0.2 (/tmp/nasaq-inspect/src-tauri)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.90s
EXIT_CODE=0
```


### ملاحظة اكتشاف أثناء التحقق النهائي

كشف `cargo check` أن Cargo.lock المرفق لا يطابق manifest: سجل `nasaq-pos` كان يعتمد على `tauri-plugin-sql` بينما `Cargo.toml` الحالي يعتمد على `rusqlite`. أعاد Cargo حل القفل بما يطابق manifest؛ احتُفظ بالتعديل في commit مستقل `A6: align lockfile with rusqlite manifest` حتى تكون نسخة التبعيات المختبرة هي نفسها المرفقة. لم يتغير سلوك التطبيق نتيجة هذا التحديث.


## C1 — ESLint وجودة الأنواع ومعالجة الأخطاء
**الحالة:** ✅ اتنفذ واتأكد بأوامر آلية ناتجها أدناه.

أضيف ESLint Flat Config باستخدام `typescript-eslint`، وقواعد `no-explicit-any` و`no-empty` و`no-floating-promises` كأخطاء، وربط `npm run lint` بـ ESLint ثم TypeScript. استُبدلت أنواع `any` في `src` بأنواع محددة/`unknown` مع تضييق آمن لرسائل الأخطاء، وأضيف `src/utils/errors.ts` وlogger مشترك. جميع نقاط `.catch(() => {})` والجسم الفارغ/التعليقي في `catch` عولجت برسائل للمستخدم أو تسجيل؛ بقيت أربع مطابقات لفظية لـ`any` في `step="any"` وهي خصائص HTML رقمية مقصودة وليست أنواع TypeScript.

**قبل/بعد — نفس أوامر grep على snapshot `HEAD` السابق وعلى الشجرة الحالية:**
```text
grep -Rwn 'any' src --include='*.ts' --include='*.tsx' | wc -l
قبل: 69
بعد: 4

grep -Rwn 'any' src/features/*/services src/repositories src/database --include='*.ts' --include='*.tsx' | wc -l
قبل: 18
بعد: 0

grep -RIPzo '(?s)catch\s*(?:\([^)]*\))?\s*\{(?:(?:\s|//[^\n]*|/\*[\s\S]*?\*/)*?)\}' src --include='*.ts' --include='*.tsx' | tr '\0' '\n' | grep -c 'catch'
قبل: 12
بعد: 0

grep -RInE '\.catch\([[:space:]]*\(\)[[:space:]]*=>[[:space:]]*\{[[:space:]]*\}\)' src --include='*.ts' --include='*.tsx' | wc -l
قبل: 8
بعد: 0
```

**اختبار الانحدار الجديد** `npm run test:phase8-quality` يفحص عدم وجود `any` صريح أو catches فارغة ويختبر fallback الرسائل للخطأ المجهول. لإثبات فشله قبل الإصلاح: `git stash push -u -m 'C1 source-only regression proof' -- src` ثم `npm run test:phase8-quality` خرج `OLD_SOURCE_EXIT=1`؛ من الناتج الحرفي:
```text
AssertionError [ERR_ASSERTION]: src/database/DatabaseManager.ts: comment-only catch
src/database/drivers/WasmSqliteDriver.ts: explicit any
src/database/drivers/WasmSqliteDriver.ts: comment-only catch
src/features/activation/ActivationService.ts: empty Promise catch
src/features/auth/services/AuthService.ts: empty Promise catch
src/features/backup/services/TauriBackupStorage.ts: explicit any
src/features/pos/components/DeliveryCustomerModal.tsx: empty Promise catch
src/features/reports/pages/ReportsPage.tsx: empty Promise catch
expected: [],
operator: 'deepStrictEqual'
```
بعد `git stash pop` أُعيد الأمر نفسه، والناتج:
```text
> nasaq-pos@1.0.2 test:phase8-quality
> tsx tests/phase8-quality.test.ts
C1 quality regression passed: 181 source files; zero explicit any/empty catches; unknown-error fallbacks verified.
```

**عدد ملفات الاختبار:** `git ls-tree -r --name-only HEAD tests | grep -E '\.test\.(ts|tsx)$' | wc -l` قبل: 29. `find tests -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | wc -l` بعد: 30. لم يُحذف أي اختبار.

**فحوص الدفعة C1 بالترتيب الإلزامي؛ جميعها EXIT_CODE=0:**
1. `npx tsc --noEmit`
```text
EXIT_CODE=0
```
2. `npm run lint`
```text
> nasaq-pos@1.0.2 lint
> eslint src --max-warnings=0 && tsc --noEmit
EXIT_CODE=0
```
3. `npm test` — آخر 15 سطراً:
```text
B4 unlock lockout persists across AuthService recreation: PASS
PHASE 7 AUTH SECURITY: PASS
> nasaq-pos@1.0.2 test:phase7-management
> tsx tests/phase7-management-validation.test.ts
B5 Egyptian mobile validation: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
B5 customer/table/driver Service CRUD and deactivate audit paths: PASS
PHASE 7 MANAGEMENT VALIDATION: PASS
> nasaq-pos@1.0.2 test:phase8-quality
> tsx tests/phase8-quality.test.ts
C1 quality regression passed: 181 source files; zero explicit any/empty catches; unknown-error fallbacks verified.
EXIT_CODE=0
```
4. `cd src-tauri && cargo check`
```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 4.99s
EXIT_CODE=0
```
5. `cd src-tauri && cargo test` — آخر 15 سطراً:
```text
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.16s
     Running unittests src/main.rs (target/debug/deps/nasaq_pos-1d98a956120d73c4)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
   Doc-tests nasaq_pos
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
EXIT_CODE=0
```
6. `cd src-tauri && cargo clippy -- -D warnings`
```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.40s
EXIT_CODE=0
```

**ملاحظة نطاق:** جرى تسجيل فشل استعلام حالة الورديات في فحص الاستعادة عبر logger مع إبقاء fallback السابق كما هو؛ لم أغيّر السلوك خارج المطلوب في C1.


## C2 — التبعيات وملفات القفل والتنظيف
**الحالة:** ✅ اتنفذ واتأكد بالأوامر أدناه.

**`npx depcheck` قبل التنظيف** (`npm_config_yes=true npx depcheck`، exit code 255 بسبب وجود تبعيات غير مستخدمة؛ هذا هو نصه الحرفي):
```text
Unused dependencies
* @tauri-apps/plugin-sql
Unused devDependencies
* @types/express
* autoprefixer
* esbuild
* tailwindcss
```
أزيلت هذه الحزم الخمس من `package.json` و`package-lock.json`. حذف `ideas.md`. بعد التنظيف أظهر الفحص:
```text
No depcheck issue
```
واختبار الانحدار الجديد `tests/phase9-dependencies.test.ts` يتحقق من عدم عودة الحزم المذكورة، ومن غياب `ideas.md` ووجود `package-lock.json` بوصفه ملف npm الوحيد. فشل على manifest القديم (`OLD_SOURCE_EXIT=1`) بنص فعلي:
```text
+ '^2.5.0'
- undefined
AssertionError [ERR_ASSERTION]
actual: '^2.5.0'
expected: undefined
operator: 'strictEqual'
```
ثم أعيد تطبيق التنظيف، ونجح:
```text
> nasaq-pos@1.0.2 test:phase9-dependencies
> tsx tests/phase9-dependencies.test.ts
C2 dependency regression passed: unused packages removed; one npm lockfile; ideas.md absent.
```
عدد ملفات الاختبار قبل: 30، بعد: 31؛ لم يُحذف أي اختبار.

**تثبيت نظيف:** شُغّل `rm -rf node_modules && npm ci` من `package-lock.json`، والناتج:
```text
added 194 packages, and audited 195 packages in 3s
44 packages are looking for funding
1 high severity vulnerability
```
يوجد ملف npm lock واحد (`package-lock.json`). أُبقي `src-tauri/Cargo.lock` لأنه قفل تبعيات Rust وليس مدير حزم npm؛ لا توجد ملفات `yarn.lock` أو `pnpm-lock.yaml` أو `npm-shrinkwrap.json`.

**فحوص دفعة C2 بالترتيب الإلزامي؛ جميعها EXIT_CODE=0:**
- `npm run build` — آخر 15 سطراً:
```text
dist/assets/InvoiceDetailsModal-DrS_Ph_T.js           23.27 kB │ gzip:   7.30 kB
dist/assets/OrdersPage-ada6rwC2.js                    25.72 kB │ gzip:   6.67 kB
dist/assets/BackupPage-Cb8I7tag.js                    32.08 kB │ gzip:   9.38 kB
dist/assets/ThermalReceiptRenderer-aZltrPZR.js        35.80 kB │ gzip:   5.06 kB
dist/assets/PrinterService-DJpvz8jJ.js                39.42 kB │ gzip:  12.73 kB
dist/assets/ReportsPage-BagUTy8x.js                   46.77 kB │ gzip:  11.02 kB
dist/assets/SettingsPage-DyrZ7LCB.js                  56.17 kB │ gzip:  13.30 kB
dist/assets/POSPage-D6ghkyuA.js                       65.50 kB │ gzip:  17.67 kB
dist/assets/index-CVRUpt11.js                        524.10 kB │ gzip: 163.00 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Using build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via `build.chunkSizeWarningLimit`.
✓ built in 5.32s
EXIT_CODE=0
```
- `npx tsc --noEmit`
```text
EXIT_CODE=0
```
- `npm run lint`
```text
> nasaq-pos@1.0.2 lint
> eslint src --max-warnings=0 && tsc --noEmit
EXIT_CODE=0
```
- `npm test` — آخر 15 سطراً:
```text
B5 Egyptian mobile validation: PASS
[DriverFactory] Selected Driver: WASM SQLite (In-Memory Browser Storage)
B5 customer/table/driver Service CRUD and deactivate audit paths: PASS
PHASE 7 MANAGEMENT VALIDATION: PASS
> nasaq-pos@1.0.2 test:phase8-quality
> tsx tests/phase8-quality.test.ts
C1 quality regression passed: 181 source files; zero explicit any/empty catches; unknown-error fallbacks verified.
> nasaq-pos@1.0.2 test:phase9-dependencies
> tsx tests/phase9-dependencies.test.ts
C2 dependency regression passed: unused packages removed; one npm lockfile; ideas.md absent.
EXIT_CODE=0
```
- `cd src-tauri && cargo check`
```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.00s
EXIT_CODE=0
```
- `cd src-tauri && cargo test` — آخر 15 سطراً:
```text
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.12s
     Running unittests src/main.rs (target/debug/deps/nasaq_pos-1d98a956120d73c4)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
   Doc-tests nasaq_pos
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
EXIT_CODE=0
```
- `cd src-tauri && cargo clippy -- -D warnings`
```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.29s
EXIT_CODE=0
```

### ملاحظات اكتشاف
أظهر التثبيت تحذيراً من npm بوجود ثغرة عالية واحدة ضمن الشجرة الحالية؛ لم يُشغّل `npm audit fix` لأنه يغيّر إصدارات خارج بند التنظيف، ويحتاج قراراً منفصلاً بعد مراجعة الأثر. كما بقي تحذير Vite بأن chunk الرئيسي أكبر من 500 kB؛ سيُعاد قياسه بعد C3.

## الجولة الخامسة — متابعة Batch 3 والإصدار النهائي

### C3 — تفكيك الملفات الكبيرة
- **الحالة:** ✅ اتنفذ واتأكد آلياً. جرى فصل أجزاء العرض والخدمات إلى مكونات ووحدات أصغر؛ لا يتجاوز أي ملف TypeScript إنتاجي 500 سطر.
- **اختبار رجوع الكود القديم:** `git stash push --keep-index -u -m 'C3 source refactor old-source regression proof'` ثم `npm run test:phase10-layout`.
```text
exit=1
  'src/features/hardware/services/PrinterService.ts: 627',
  'src/features/invoices/design/components/InvoiceDesignCustomizer.tsx: 820',
  'src/features/orders/pages/OrdersPage.tsx: 550',
  'src/features/orders/services/OrderService.ts: 541',
  'src/features/pos/components/PaymentModal.tsx: 612',
  'src/features/pos/pages/POSPage.tsx: 1060',
  'src/features/pos/services/PaymentService.ts: 536',
  'src/features/reports/pages/ReportsPage.tsx: 1048',
  'src/repositories/ReportRepository.ts: 711'
]
expected: []
operator: 'deepStrictEqual'
```
- **إعادة الإصلاح:** `git stash pop` ثم `npm run test:phase10-layout`.
```text
C3 source layout regression passed: 199 TypeScript files; all are at most 500 lines.
```
- **التحقق الأولي:** `npx tsc --noEmit` و`npm run lint` خرجا برمز 0. تشغيل كامل لـ`npm test` وRust توقف أولاً لأن shell لم يحمل `/home/ubuntu/.cargo/env`؛ أُعيد تشغيل دفعة كاملة بعد تحميل البيئة، ونتيجتها مسجلة في القسم اللاحق.

### C4 — تجاهل وحذف مُثبّت EXE المنفرد
- **الحالة:** ✅ اتنفذ واتأكد آلياً. نمط ignore صار wildcard، وحُذف `NasaqPOS-Windows-Installer-x64.exe` من شجرة المصدر.
- **اختبار رجوع الكود القديم:** استعيد `.gitignore` القديم عبر `git stash` مؤقت، أُعيد EXE مؤقتاً، ثم شُغّل `npm run test:phase11-release-files`.
```text
old_source_exit=1
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /^NasaqPOS-Windows-Installer-\\*\\.exe$/m.
operator: 'match'
```
- **التحقق بعد الإصلاح:** `npm run test:phase11-release-files && git check-ignore -v NasaqPOS-Windows-Installer-x64.exe && test ! -e NasaqPOS-Windows-Installer-x64.exe`.
```text
> nasaq-pos@1.0.2 test:phase11-release-files
> tsx tests/phase11-release-files.test.ts
C4 release artifact regression passed: installer pattern ignored; standalone installer absent.
.gitignore:16:NasaqPOS-Windows-Installer-*.exe NasaqPOS-Windows-Installer-x64.exe
EXE_ABSENT=PASS
```

### D1 — توحيد النسخ
- **الحالة:** ✅ اتنفذ واتأكد آلياً بمراجعة manifests الحالية.
```text
package.json: 1.0.2
src-tauri/tauri.conf.json: 1.0.2
src-tauri/Cargo.toml: 1.0.2
```

### D2 — مسار قاعدة البيانات
- **الحالة:** 🟡 المصدر يستعمل Rust `app.path().app_data_dir()` ثم `data/nasaq.db`؛ يلزم تأكيد المسار `%APPDATA%` على Windows فعلي.
```text
fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir()?.join("data");
    Ok(dir.join("nasaq.db"))
}
```

### D3 — checksums
- **الحالة:** ✅ اتنفذ واتأكد آلياً.
- **الأمر:** `find dist -type f -print0 | sort -z | xargs -0 sha256sum > Nasaq-POS-v1.0.2/checksums/DIST_CHECKSUMS.sha256 && sha256sum -c Nasaq-POS-v1.0.2/checksums/DIST_CHECKSUMS.sha256`.
```text
Generated checksums: 68
[... all 68 manifest entries verified ...]
dist/fonts/nasaq-arabic.ttf: OK
dist/fonts/nasaq-arabic.woff2: OK
dist/index.html: OK
dist/nasaq-logo.png: OK
dist/sql-wasm.wasm: OK
```

### D4 — CI Windows
- **الحالة:** 🟡 workflow يشغّل typecheck وlint وnpm tests وcargo check/test/clippy ثم يبني NSIS ويرفع EXE كـartifact؛ يلزم تشغيل GitHub Actions على Windows.


### C3 — عدد الاختبارات
- **الأمر:** `git ls-tree -r --name-only HEAD tests | grep -E '\.(test|spec)\.(ts|tsx|js)$' | wc -l` ثم `find tests -type f | grep -E '\.(test|spec)\.(ts|tsx|js)$' | wc -l`.
```text
baseline_test_files=31
after_C3=32
current_test_files=35
```
لم يُحذف أي ملف اختبار. أُضيفت اختبارات رجوع C3 وC4 وD1–D6.

### D4–D6 — إثباتات رجوع الكود القديم
- **D4 القديم:** اختبار `tests/phase12-release-hardening.test.ts` مع workflow القديم فشل عند `Windows CI missing npm run lint`؛ رمز الخروج 1.
- **D5 القديم:** `git stash` مؤقت لمصادر plugin logger ثم تشغيل `npx tsx tests/phase12-release-hardening.test.ts`.
```text
old_D5_exit=1
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /^tauri-plugin-log\s*=\s*"\^?2\./m.
operator: 'match'
```
- **D6 القديم:** `git stash` مؤقت لملف capability ثم تشغيل الاختبار نفسه.
```text
old_D6_exit=1
AssertionError [ERR_ASSERTION]: assertion failed
actual: false
expected: true
operator: '=='
```
- **D3 القديم:** استُعيد manifest القديم مؤقتاً ثم `sha256sum -c Nasaq-POS-v1.0.2/checksums/DIST_CHECKSUMS.sha256`.
```text
old_checksum_exit=1
dist/assets/index-D_l7USAq.js: No such file or directory
dist/assets/index-DKLwIOGN.js: No such file or directory
dist/index.html: FAILED
WARNING: 7 listed files could not be read
WARNING: 1 computed checksum did NOT match
```

### C3 ثم D1–D6 — دفعة التحقق النهائية
كل الأوامر التالية شُغّلت بهذا الترتيب، وكلها خرجت برمز 0: `npx tsc --noEmit`، `npm run lint`، `npm test`، `cd src-tauri && cargo check`، `cargo test`، `cargo clippy -- -D warnings`.

- `npx tsc --noEmit`
```text
(لا مخرجات؛ رمز الخروج 0)
```
- `npm run lint`
```text
> nasaq-pos@1.0.2 lint
> eslint src --max-warnings=0 && tsc --noEmit
```
- `npm test` — آخر الأسطر الحرفية:
```text
> nasaq-pos@1.0.2 test:phase9-dependencies
> tsx tests/phase9-dependencies.test.ts
C2 dependency regression passed: unused packages removed; one npm lockfile; ideas.md absent.
> nasaq-pos@1.0.2 test:phase10-layout
> tsx tests/phase10-file-size.test.ts
C3 source layout regression passed: 199 TypeScript files; all are at most 500 lines.
> nasaq-pos@1.0.2 test:phase11-release-files
> tsx tests/phase11-release-files.test.ts
C4 release artifact regression passed: installer pattern ignored; standalone installer absent.
> nasaq-pos@1.0.2 test:phase12-release-hardening
> tsx tests/phase12-release-hardening.test.ts
D1-D6 release hardening regression passed: manifests, AppData DB, Windows CI, rotating file logs, scoped filesystem, and CSP.
```
- `cd src-tauri && cargo check`
```text
Compiling nasaq-pos v1.0.2 (/tmp/nasaq-inspect/src-tauri)
Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.21s
```
- `cd src-tauri && cargo test` — آخر الأسطر الحرفية:
```text
test db_tests::backup_uses_vacuum_into_snapshot ... ok
test db_tests::failed_restore_after_swap_rolls_back_to_previous_database ... ok
test db_tests::valid_restore_replaces_database_contents ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.12s
     Running unittests src/main.rs (target/debug/deps/nasaq_pos-85d5b855863c6193)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
   Doc-tests nasaq_pos
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
- `cd src-tauri && cargo clippy -- -D warnings`
```text
Compiling nasaq-pos v1.0.2 (/tmp/nasaq-inspect/src-tauri)
Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.48s
```
- `npm run build` — رمز الخروج 0؛ تحذير الحزمة الرئيسية ما زال قائماً، وتُرك دون تغيير سلوكي خارج النطاق.
```text
index-DT2j8uRd.js 524.69 kB │ gzip: 163.28 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 6.16s
```
- **D3 بعد البناء:** `sha256sum -c Nasaq-POS-v1.0.2/checksums/DIST_CHECKSUMS.sha256`.
```text
CHECKSUM_ITEMS=69
dist/fonts/nasaq-arabic.ttf: OK
dist/fonts/nasaq-arabic.woff2: OK
dist/index.html: OK
dist/nasaq-logo.png: OK
dist/sql-wasm.wasm: OK
```

### الحالة العملية لبيئة Windows
- **D1:** ✅ النسخ متطابقة `1.0.2` في `package.json` و`src-tauri/tauri.conf.json` و`src-tauri/Cargo.toml`.
- **D2:** 🟡 المسار يستعمل `app_data_dir()/data/nasaq.db`؛ يلزم تأكيد `%APPDATA%` على Windows فعلي.
- **D3:** ✅ 69 checksum متطابق بعد build الحالي.
- **D4:** 🟡 workflow محدّث، لكن تنفيذ GitHub Actions على Windows لم يُشغّل من هذه البيئة.
- **D5:** 🟡 `tauri-plugin-log` يسجل في مجلد Logs مع حد 2 MiB والاحتفاظ بآخر 7 ملفات؛ يلزم فحص موقع الملف والتدوير على Windows.
- **D6:** 🟡 capability تقيد FS إلى `$APPDATA/backups` وتزيل صلاحيات النص غير المستخدمة؛ يلزم اختبار runtime installer على Windows. CSP يبقي `wasm-unsafe-eval` لدعم SQLite WASM و`unsafe-inline` للأنماط الحالية.

### ملاحظات جديدة
- `npm install` أبلغ عن ثغرة عالية واحدة؛ لم يُشغّل `npm audit fix` لأنه يغيّر dependency versions خارج نطاق البنود المحددة.
- تحذير Vite للحزمة الرئيسية ما زال قائماً عند 524.69 kB؛ غيرت refactor صفحات التطبيق لكن لم أوسّع النطاق لتعديل إعدادات chunking.

### D3 — اختبار رجوع checksum
- **الأمر:** `npx tsx tests/phase13-checksums.test.ts` بعد استعادة manifest الجديد.
```text
D3 checksum regression passed: 69 files verified.
```
- **الاختبار على manifest القديم:** `git stash` للـmanifest ثم `npx tsx tests/phase13-checksums.test.ts`.
```text
old_D3_test_exit=1
sha256sum: dist/assets/aistudio/.gitignore: No such file or directory
sha256sum: WARNING: 7 listed files could not be read
sha256sum: WARNING: 1 computed checksum did NOT match
```

### Commits المنفصلة
```text
7a85ab1 C3: split oversized pages and services
a88444f C4: ignore standalone Windows installer
5e94e26 D3: regenerate distribution checksums
a151df3 D4: run full Windows release gates
0c593c4 C4: register installer regression in npm test
7bccb1f D5: add rotating application file logger
e085aa3 D6: scope filesystem access to backups
```

### تنبيه تحقق C3 الأول
أول دفعة وصلت إلى Cargo وفشلت لأن `cargo` لم يكن في PATH (`cargo: command not found`, exit 127). أُعيد تشغيل الدفعة كاملة بعد `source /home/ubuntu/.cargo/env`؛ نتائج typecheck وlint وnpm test وcargo check/test/clippy أعلاه كلها exit 0.


### D4 وD3 — التحقق النهائي بعد إعداد release build
- **صيغة Windows workflow:** `python3` مع `yaml.BaseLoader` تحقّق من triggers والـjob.
```text
WORKFLOW_YAML_VALID: jobs=verify runs-on=windows-latest; triggers=push,pull_request
```
- **تجميع Tauri على Linux دون bundling:** `source /home/ubuntu/.cargo/env && npm run tauri:build -- --no-bundle`.
```text
Finished `release` profile [optimized] target(s) in 3m 48s
Built application at: /tmp/nasaq-inspect/src-tauri/target/release/nasaq-pos
```
هذا ليس NSIS installer ولا بديل عن GitHub Actions على Windows؛ تصنيف Windows يبقى 🟡.
- Tauri build أعاد إنشاء `dist` بأسماء assets متغيرة. أُعيد توليد manifest بعد البناء، ثم `npx tsx tests/phase13-checksums.test.ts`.
```text
D3 checksum regression passed: 69 files verified.
```
- commits D3 الإضافية بعد build:
```text
bac4133 D3: refresh checksums after Tauri build
d9f0dab D3: register checksum regression in npm test
```

### ملف التسليم
أنشئت نسخة ZIP تشمل المصدر و`dist` والتوثيق، وتستبعد `.git` و`node_modules` و`src-tauri/target` ومُثبّتات EXE/AppImage. فُحص أرشيف ZIP وتحققت ملفات الإصدار المطلوبة؛ لا توجد entries ممنوعة.

### إعادة التحقق النهائية بعد تسجيل اختبار D3 في npm test
التشغيل بهذا الترتيب: `npx tsc --noEmit`، `npm run lint`، `npm test`، `cd src-tauri && cargo check`، `cargo test`، `cargo clippy -- -D warnings`. كل الأوامر exit 0.
- `npx tsc --noEmit`
```text
(لا مخرجات؛ exit 0)
```
- `npm run lint`
```text
> nasaq-pos@1.0.2 lint
> eslint src --max-warnings=0 && tsc --noEmit
```
- `npm test` — آخر الأسطر:
```text
> tsx tests/phase10-file-size.test.ts
C3 source layout regression passed: 199 TypeScript files; all are at most 500 lines.
> nasaq-pos@1.0.2 test:phase11-release-files
> tsx tests/phase11-release-files.test.ts
C4 release artifact regression passed: installer pattern ignored; standalone installer absent.
> nasaq-pos@1.0.2 test:phase12-release-hardening
> tsx tests/phase12-release-hardening.test.ts
D1-D6 release hardening regression passed: manifests, AppData DB, Windows CI, rotating file logs, scoped filesystem, and CSP.
> nasaq-pos@1.0.2 test:phase13-checksums
> tsx tests/phase13-checksums.test.ts
D3 checksum regression passed: 69 files verified.
```
- `cd src-tauri && cargo check`
```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.89s
```
- `cd src-tauri && cargo test` — آخر 15 سطراً:
```text
test db_tests::corrupt_restore_keeps_current_database_usable ... ok
test db_tests::failed_restore_after_swap_rolls_back_to_previous_database ... ok
test db_tests::valid_restore_replaces_database_contents ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.11s
     Running unittests src/main.rs (target/debug/deps/nasaq_pos-85d5b855863c6193)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
   Doc-tests nasaq_pos
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
- `cd src-tauri && cargo clippy -- -D warnings`
```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.39s
```
- آخر تحقق قبل E2 شغّل `npm test` 36 test scripts. E2 شغّل 37 بعد اختبار version checker. ملفات الاختبار الآن 36؛ 35 قبل E2، و36 بعده. لا اختبارات محذوفة.
- `npm run tauri:build -- --no-bundle` بنى binary Linux بنجاح؛ installer Windows لم يُنتج في Linux.

- **التحقق الفعلي من أرشيف ZIP:** `unzip -t /tmp/NasaqPOS-Release-1.0.2-Source.zip`، ثم استخراج الأرشيف وتشغيل `sha256sum -c Nasaq-POS-v1.0.2/checksums/DIST_CHECKSUMS.sha256` من مجلد الاستخراج.
```text
No errors detected in compressed data of /tmp/NasaqPOS-Release-1.0.2-Source.zip.
FILES: 473
CHECKSUM_ITEMS: 69
FORBIDDEN: none
-rw-r--r-- 1 ubuntu ubuntu 2.6M /tmp/NasaqPOS-Release-1.0.2-Source.zip
```


## دفعة E — التحقق والتسليم النهائي

### E1 — قائمة قبول Windows
- **الحالة:** ✅ أُنشئت القائمة وفُحصت آلياً؛ تنفيذها على Windows ما زال شرطاً قبل التجربة.
- **الأمر:** فحص Node لملف `docs/WINDOWS_ACCEPTANCE_CHECKLIST.md` وعدد الصفوف والسيناريوهات المطلوبة.
```text
E1 checklist check passed: 20 acceptance steps; 21 required scenarios present.
```
- جميع مربعات «ناجح؟» بقيت فارغة؛ لا أدّعي تنفيذ اختبارات Windows أو الطابعة.

### E2 — أوامر الإغلاق بالترتيب
نفذت: `git status --short`، `npx tsc --noEmit`، `npm run lint`، `npm test`، `npm run build`، ثم `cargo check` و`cargo test` و`cargo clippy -- -D warnings` داخل `src-tauri`، ثم `node tools/check-version.mjs` وفحوص grep أدناه. كل أمر خرج بالرمز 0؛ grep الفارغ طُبع له `NO_MATCHES`.

1. `git status --short`
```text
(لا مخرجات؛ شجرة العمل نظيفة؛ EXIT_CODE=0)
```
2. `npx tsc --noEmit`
```text
(لا مخرجات؛ EXIT_CODE=0)
```
3. `npm run lint`
```text
> nasaq-pos@1.0.2 lint
> eslint src --max-warnings=0 && tsc --noEmit
```
4. `npm test` — آخر الأسطر الحرفية:
```text
> nasaq-pos@1.0.2 test:phase11-release-files
> tsx tests/phase11-release-files.test.ts
C4 release artifact regression passed: installer pattern ignored; standalone installer absent.
> nasaq-pos@1.0.2 test:phase12-release-hardening
> tsx tests/phase12-release-hardening.test.ts
D1-D6 release hardening regression passed: manifests, AppData DB, Windows CI, rotating file logs, scoped filesystem, and CSP.
> nasaq-pos@1.0.2 test:phase13-checksums
> tsx tests/phase13-checksums.test.ts
D3 checksum regression passed: 69 files verified.
> nasaq-pos@1.0.2 test:phase14-version-check
> tsx tests/phase14-version-check.test.ts
E2 version-check regression passed: three manifests match.
```
5. `npm run build` — آخر 15 سطراً:
```text
dist/assets/PrinterService-CjSAYqRo.js                39.44 kB │ gzip:  12.74 kB
dist/assets/ReportsPage-DfuL4tCP.js                   47.42 kB │ gzip:  11.33 kB
dist/assets/SettingsPage-Dr84iSW8.js                  56.38 kB │ gzip:  13.38 kB
dist/assets/POSPage-B_Rykmdr.js                       68.84 kB │ gzip:  18.73 kB
dist/assets/index-BDt3UbPB.js                        524.69 kB │ gzip: 163.29 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Using build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 6.48s
```
6. `cd src-tauri && cargo check`
```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.99s
```
7. `cd src-tauri && cargo test` — آخر الخرج:
```text
test db_tests::corrupt_restore_keeps_current_database_usable ... ok
test db_tests::failed_restore_after_swap_rolls_back_to_previous_database ... ok
test db_tests::valid_restore_replaces_database_contents ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.07s
     Running unittests src/main.rs (target/debug/deps/nasaq_pos-85d5b855863c6193)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
   Doc-tests nasaq_pos
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
8. `cd src-tauri && cargo clippy -- -D warnings`
```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.36s
```
9. `node tools/check-version.mjs`
```text
فحص الإصدار مرّ: package.json=1.0.2, src-tauri/tauri.conf.json=1.0.2, src-tauri/Cargo.toml=1.0.2
```
10. `grep -RInE 'window\.(prompt|alert|confirm)[[:space:]]*\(' src`
```text
NO_MATCHES
```
11. `grep -RInE 'Math\.random\(\)|Date\.now\(\)' src/utils/id.ts src/features/orders src/features/pos src/features/returns --include='*.ts' --include='*.tsx' || true`
```text
src/utils/id.ts:4: * NEVER use Math.random(), timestamps alone, or predictable values as database IDs.
src/features/pos/components/OpenOrdersModal.tsx:72:      const diffMs = Date.now() - new Date(dateStr).getTime();
```
الظهوران توثيق القاعدة وحساب عمر الطلب؛ مولّد المعرّفات نفسه يستخدم `crypto.randomUUID()` أو `crypto.getRandomValues()`، ولا يستخدم الساعة أو `Math.random()`.
12. `grep -RInE 'catch[[:space:]]*(\([^)]*\))?[[:space:]]*\{[[:space:]]*\}|as[[:space:]]+any\b|:[[:space:]]*any\b' src --include='*.ts' --include='*.tsx'`
```text
NO_MATCHES
```
13. `grep -nE 'crypto\.randomUUID|crypto\.getRandomValues|Date\.now|Math\.random' src/utils/id.ts`
```text
17:  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
18:    uuid = crypto.randomUUID();
19:  } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
```

**أعداد الاختبارات:** 35 ملف اختبار قبل E2؛ 36 بعد إضافة اختبار version checker؛ شغّل `npm test` 37 test scripts. لا اختبار محذوف.


## ملخص الامتثال A4–E4
الجدول يربط كل بند بحالة وأمر وناتج حرفي قصير. تفاصيل المخرجات، بما فيها ذيول التحقق، مثبتة في أقسام البنود أعلاه.

| رقم البند | الحالة | الأمر المنفذ | الناتج الحرفي |
|---|---|---|---|
| A4 | ✅ اتنفذ واتأكد آلياً | `npx tsx tests/phase4-cp864.test.ts` | `PHASE 4 CP864 REGRESSION: PASS` |
| A5 | ✅ اتنفذ واتأكد آلياً | `npm run test:phase5-returns` | `A5 cash overdraw guard E2E: PASS` |
| A6 | ✅ اتنفذ واتأكد آلياً | `cd src-tauri && cargo test` | `test result: ok. 6 passed; 0 failed` |
| B2 | 🟡 اتنفذ؛ يحتاج Windows | `npm run test:phase7-activation` | `PHASE 7 ACTIVATION: PASS`؛ AppData Windows لم يُختبر |
| B3 | ✅ اتنفذ واتأكد آلياً | `npx tsx tests/phase7-shift-close-e2e.test.ts` | `PHASE 7 SHIFT CLOSE E2E: PASS` |
| B4 | ✅ اتنفذ واتأكد آلياً | `npm run test:phase7-auth-security` | `PHASE 7 AUTH SECURITY: PASS` |
| B5 | ✅ اتنفذ واتأكد آلياً | `npm run test:phase7-management` | `PHASE 7 MANAGEMENT VALIDATION: PASS` |
| C1 | ✅ اتنفذ واتأكد آلياً | `npm run test:phase8-quality` | `zero explicit any/empty catches; unknown-error fallbacks verified` |
| C2 | ✅ اتنفذ واتأكد آلياً | `npm run test:phase9-dependencies` | `C2 dependency regression passed: unused packages removed; one npm lockfile; ideas.md absent.` |
| C3 | ✅ اتنفذ واتأكد آلياً | `npm run test:phase10-layout` | `199 TypeScript files; all are at most 500 lines.` |
| C4 | ✅ اتنفذ واتأكد آلياً | `npm run test:phase11-release-files` | `installer pattern ignored; standalone installer absent.` |
| D1 | ✅ اتنفذ واتأكد آلياً | `node tools/check-version.mjs` | `package.json=1.0.2, src-tauri/tauri.conf.json=1.0.2, src-tauri/Cargo.toml=1.0.2` |
| D2 | 🟡 اتنفذ؛ يحتاج Windows | `grep -n -A6 -B1 'fn db_path' src-tauri/src/lib.rs` | `.app_data_dir()` ثم `.join("data")` و`nasaq.db`؛ `%APPDATA%` على Windows غير مُثبت عملياً |
| D3 | ✅ اتنفذ واتأكد آلياً | `npm run test:phase13-checksums` | `D3 checksum regression passed: 69 files verified.` |
| D4 | 🟡 اتنفذ؛ يحتاج Windows CI | `python3` YAML parse؛ `npm run tauri:build -- --no-bundle` | `WORKFLOW_YAML_VALID`؛ `Built application at: .../target/release/nasaq-pos`، وليس NSIS |
| D5 | 🟡 اتنفذ؛ يحتاج Windows | `npm run test:phase12-release-hardening` | `rotating file logs`؛ مسار LogDir والتدوير لم يُختبرا على Windows |
| D6 | 🟡 اتنفذ؛ يحتاج Windows | `npm run test:phase12-release-hardening` | `scoped filesystem`؛ runtime capability لم يُختبر على installer Windows |
| E1 | ✅ اتنفذ واتأكد آلياً | `test -s docs/WINDOWS_ACCEPTANCE_CHECKLIST.md` | `CHECKLIST_EXISTS=PASS`؛ التدقيق الآلي: `20 acceptance steps; 21 required scenarios present.` |
| E2 | ✅ اتنفذ واتأكد آلياً | `/tmp/nasaq-release/E2-final.sh`؛ أوامرها كاملة في قسم E2 | `E2 version-check regression passed: three manifests match.`؛ `NO_MATCHES` لفحوص prompts و`any` وempty catch |
| E3 | ✅ اتنفذ واتأكد آلياً | `node tools/check-release-report.mjs` | `E3 report audit passed: 21 items; one allowed final verdict; verdict is last line.` |
| E4 | ✅ اتنفذ واتأكد آلياً | `find . -maxdepth 2 -type f \( -iname '*.exe' -o -iname '*.appimage' \) -print` | `NO_LOCAL_INSTALLER=PASS` |

### تحقق اكتمال تقرير E3


### حالات غير منفذة في هذه البيئة
- كل الصفوف العشرين في [قائمة قبول Windows](WINDOWS_ACCEPTANCE_CHECKLIST.md) تنتظر تشغيلها على جهاز Windows وعتاد فعلي؛ خانات النجاح فارغة.
- لم يُشغّل Windows 10/11، NSIS، WebView2، activation في Tauri Windows، `%APPDATA%`، LogDir rotation، printer USB/network، cash drawer أو قارئ barcode.
- لم يُنفذ اختباري قتل العملية أثناء البيع وReload أثناء البيع على Windows؛ Cargo tests وSQLite WASM لا تثبت سلوك Windows runtime.
- لم يُشغّل GitHub Actions؛ لم يُبنَ installer Windows ولم يُختبر. لم أنشئ أو أرفق أي EXE.
- `npm audit` أظهر ثغرة high واحدة. بقي Vite main chunk 524.69 kB. سُجلا كملاحظتين؛ لم أغيرهما خارج النطاق.

### قرار التسليم
التحقق الآلي على Linux اجتاز. التسليم **ليس جاهزاً للتوزيع**. يلزم إتمام Windows acceptance checklist وفحص installer الناتج حصراً من CI.

### إثبات تدقيق E3 على التقرير القديم والجديد
- الأمر: `node tools/check-release-report.mjs` بعد `git stash` لتعديلات التقرير E3 فقط:
```text
old_E3_exit=1
صف التقرير مفقود أو غير صالح: A4
```
- بعد `git stash pop` وإعادة الأمر:
```text
E3 report audit passed: 21 items; one allowed final verdict; verdict is last line.
```
## E4 — مصدر installer
لم أُنشئ أو أرفق EXE. أي installer Windows يؤخذ حصراً من artifact الذي ينتجه GitHub Actions بعد نجاح Windows workflow.
- **الأمر:** `files=$(find . -maxdepth 2 -type f \( -iname '*.exe' -o -iname '*.appimage' \) -print); if test -z "$files"; then echo NO_LOCAL_INSTALLER=PASS; else printf '%s\n' "$files"; exit 1; fi`
```text
NO_LOCAL_INSTALLER=PASS
```

الدفعة 4: 4 بنود ✅، 0 🟡، 0 ❌.

جاهز لتجربة ميدانية محدودة بعد إتمام الـ checklist
