# Nasaq POS — Phase 1

**النطاق:** سلامة البيانات والأمان فقط. لا توجد ميزات تشغيلية جديدة.

## النتيجة

- `npx tsc --noEmit`: ناجح.
- `npm run test:all`: ناجح، كل الاختبارات الحالية والجديدة `0 FAILED`.
- اختبار Phase 1 الجديد: `8 PASSED, 0 FAILED`.
- `cargo check --manifest-path src-tauri/Cargo.toml`: ناجح.

## 1. SQLite وDatabaseManager

### ما تغيّر

- `DatabaseManager` يستخدم `operationQueue` واحداً لكل `execute`, `run`, `query`, `queryOne`, و`transaction`.
- أزيل فلاج `inTransaction` العام. لا توجد حالة transaction مشتركة قابلة للتداخل.
- المعاملة تبدأ وتُغلق على نفس driver/connection. الاستدعاءات داخل callback تستخدم executor المعاملة مباشرة.
- nested transactions تستخدم `SAVEPOINT` داخل executor المعاملة.
- `close()` ينتظر طابور العمليات قبل إغلاق الاتصال.
- `TauriSqliteDriver.exec` يستخدم `splitSqlStatements` بدلاً من `split(';')`.
- parser يحافظ على semicolon داخل النصوص، ويحافظ على body الخاص بـ SQLite triggers.

### الأسماء المهمة

- `DatabaseManager.operationQueue`
- `DatabaseManager.enqueue`
- `TauriSqliteDriver.splitSqlStatements`

## 2. Backup وRestore

### ما تغيّر

- `TauriSqliteDriver.exportBytes()` ينفذ `PRAGMA wal_checkpoint(TRUNCATE)` قبل قراءة الملف.
- `loadBytes()` يغلق الاتصال أولاً.
- يحذف `nasaq.db-wal` و`nasaq.db-shm` قبل كتابة الملف.
- يعيد فتح الاتصال بعد الكتابة.
- `DatabaseManager.restoreDatabase()` يشغل `MigrationRunner` وinitial seed بعد restore.
- يمسح `nasaq_pos_auth_session` ويرسل event باسم `nasaq:database-restored` بعد الاستعادة.

## 3. createDraft

### ما تغيّر

- `OrderService.createDraft` ينفذ داخل transaction واحدة:
  - customer lookup/create
  - shift lookup/create
  - table conflict/status
  - product snapshot
  - order
  - order items
  - audit log
- توليد order number يحدث داخل transaction.
- يوجد retry حتى 3 مرات عند UNIQUE/constraint collision.
- أضيف executor اختياري حتى تستخدمه عملية الدفع المشتركة.

### الاسم

- `OrderService.createDraft(user, data, executor?)`

## 4. Quick Sale

### ما تغيّر

- أضيفت `PaymentService.createAndPayOrder`.
- تنفذ create draft والدفع داخل transaction واحدة.
- `POSPage` تستخدمها للبيع السريع.
- الدفع النقدي السريع يرسل `amount: 0` كقيمة تلقائية؛ الخدمة تستبدلها بإجمالي order الموثوق من DB.
- البيع من order موجود يستمر عبر المسار المنفصل لأنه لا ينشئ draft جديداً.

### الاسم

- `PaymentService.createAndPayOrder`

## 5. التوقيت

### ما تغيّر

أضيف util موحد:

- `src/utils/dateRanges.ts`
- `toLocalDayRange`
- `toLocalYmd`
- `shiftLocalYmd`

التطبيق:

- `ReportService`
- `OrderRepository` لفلاتر `TODAY`, `YESTERDAY`, `THIS_WEEK`, `CUSTOM`
- `ShiftRepository.getNextShiftNumber`
- التواريخ الافتراضية في `ReportsPage`

الحدود تستخدم `Africa/Cairo` ثم تحول إلى UTC.

اختبارا 00:30 و01:30 المحليتان مغطّيان في `tests/phase1-integrity.test.ts`.

## 6. Auth وPassword Reset

### ما تغيّر

- session لها `expiresAt` لمدة 8 ساعات.
- `restoreSession` يمسح session المنتهية.
- `isAuthenticated` يرفض session المنتهية.
- `unlock` له حد 5 محاولات ثم lockout لمدة 15 دقيقة.
- reset password لا يقبل activation عادي باسم مختلف.
- يسمح فقط بأحد الشرطين:
  1. session مسؤول Admin حالية وغير مقفلة.
  2. reset key موقّع payload name فيه `reset:<username>` ومربوط بالجهاز.
- رسائل الفشل بالعربية.
- `restoreSession` يفشل بأمان عند خطأ DB ويمسح session.

### الأسماء

- `AuthService.resetPasswordWithActivation(..., resetActivationKey?)`
- `AuthService.unlock`
- `AuthSession.expiresAt`

## 7. Tauri CSP والصلاحيات والطباعة

### ما تغيّر

- CSP إنتاجي فعلي موجود في `src-tauri/tauri.conf.json`.
- أزيل `fs:default`.
- الصلاحيات أصبحت ملفات AppData فقط عبر `fs:scope-appdata-recursive` مع عمليات القراءة/الكتابة/الحذف المطلوبة.
- `sql:allow-execute` بقي موجوداً لأن التطبيق يستخدم `Database.execute` للـ migrations وPRAGMA؛ حذفه يكسر التشغيل الأصلي.
- أوامر `print_raw` و`print_network_raw` أصبحت async وتستخدم `spawn_blocking`.
- `print_network_raw` يقبل IPv4 من RFC1918 فقط:
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`
- Windows spooler يتحقق من `bytes_written`.
- network spooler يستخدم write loop ويتحقق من عدد البايتات المرسلة.

### الأسماء

- `commands::print_raw`
- `commands::print_network_raw`
- `printer::print_network_raw`

## 8. Activation

### ما تغيّر

- أضيف fallback عبر `@noble/ed25519` عند فشل `crypto.subtle`.
- يتحقق fallback من raw Ed25519 public key المستخرج من SPKI.
- عند التفعيل، يُحفظ `{ deviceId, key }` في `nasaq-activation.json` داخل AppData عند توفر Tauri.
- localStorage يبقى fallback للـ browser preview.

## الاختبارات الجديدة

الملف:

- `tests/phase1-integrity.test.ts`

يغطي:

- Cairo midnight UTC boundary.
- Cairo 00:30 و01:30.
- local yesterday عبر نهاية الشهر.
- quoted semicolon.
- trigger body semicolon.
- SQL statement splitting.

الأمر:

```bash
npm run test:phase1
```

والاختبار مضاف إلى `npm run test:all`.

## تحقق Windows غير المتاح

- لم يتوفر جهاز Windows فعلي لتشغيل installer أو اختبار Windows WebView2، AppData permissions، native SQLite، Windows Spooler، وSmartScreen.
- تم التحقق محلياً عبر `cargo check` وTypeScript وكل اختبارات WASM.
- يلزم تشغيل installer على Windows قبل التوزيع النهائي، خصوصاً اختبار backup/restore والطباعة الشبكية.
