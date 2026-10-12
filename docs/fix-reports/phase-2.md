# نسق POS — تقرير المرحلة الثانية

**النطاق:** المستخدمون، المخزون، المرتجعات، الورديات، الخصم والضريبة، التقارير.

## ما تم تنفيذه

### 1. المستخدمون
- `UserService` في `src/features/users/services/UserService.ts`.
- العمليات: `list`، `listRoles`، `create`، `update`، `setActive`، `resetPassword`.
- كل عملية تمر بـ `requirePermission`/`requireAnyPermission` وتكتب `audit_logs`.
- منع تعطيل المستخدم لنفسه.
- منع تعطيل/إزالة دور آخر Admin نشط.
- تعطيل soft فقط؛ لا حذف فعلي.
- `UsersPage` أصبحت واجهة فعلية للإضافة، التعديل، التفعيل/التعطيل وإعادة تعيين كلمة المرور.

### 2. المخزون
- البيع كان مربوطاً مسبقاً بمعاملة الدفع؛ تم تثبيت الحماية:
  - الأصناف `track_stock = 1` تخصم داخل نفس transaction.
  - تسجيل `SALE` في `inventory_movements`.
  - منع الرصيد السالب افتراضياً.
  - الإعداد `allow_negative_stock = 0` هو الافتراضي.
- `InventoryService.adjust` للتسوية والإضافة/الخصم بسبب إلزامي.
- `InventoryPage` تستدعي الخدمة وتعرض نموذج التسوية.
- التسوية تسجل `ADJUSTMENT` وaudit.

### 3. المرتجعات
- `ReturnService.create(user, input)` يدعم مرتجعاً جزئياً أو كلياً.
- يتحقق من الكمية المباعة مطروحاً منها المرتجعات السابقة.
- يعيد المخزون عند `restock = true` ويسجل `RETURN`.
- ينشئ حركة `REFUND` نقدية عند الرد النقدي.
- يحدّث الفاتورة إلى `PARTIALLY_REFUNDED` أو `REFUNDED`، والطلب إلى `RETURNED` عند الاكتمال.
- صلاحيات منفصلة: `returns.create` و`returns.refund`.
- تمت إضافة نموذج المرتجع داخل تفاصيل الفاتورة.

### 4. الورديات
- أزيل فتح الوردية التلقائي من `OrderService.createDraft`.
- لا يوجد fallback إلى وردية كاشير آخر.
- بدون وردية مفتوحة للكاشير الحالي تظهر رسالة عربية واضحة.
- `closeShift` يرفض وجود طلبات `PENDING/HOLD`.
- يوجد حقل قرار صريح `confirmPendingOrders`; لا يُستخدم افتراضياً.

### 5. الضريبة والخصم
- `migration005` يضيف:
  - `tax_inclusive = 0`
  - `allow_negative_stock = 0`
  - `users.reset_password`
  - `returns.refund`
- `OrderService` يقرأ `tax_enabled` و`default_tax_rate` و`tax_inclusive`.
- الضريبة والخصم يحسبان بوحدات صحيحة (قروش/وحدات صغرى).
- الخصم النسبي يقبل 0–100% فقط.
- الخصم الثابت لا يتجاوز subtotal.
- `PaymentService.completeSale` يعيد الحساب من snapshots ويكتب `subtotal`, `tax_amount`, `total` في `orders` قبل الإكمال.

### 6. التقارير
- ملخص المبيعات وتقسيم النوع وأداء الكاشير وتفاصيل الفواتير تخصم مبالغ المرتجعات.
- تقارير الدفع تخصم المرتجع من نفس طريقة الرد.
- الخزينة كانت تدعم `REFUND`، وأصبحت متصلة بمسار المرتجع الجديد.

## الهجرات والرجوع الآمن

- migration الجديدة: `005_phase2_controls.ts`، ومسجلة في `MigrationRunner`.
- الهجرة **forward-only** ولا تحذف بيانات أو أعمدة.
- لا يوجد `down` تدميري؛ الرجوع الآمن يكون باستعادة backup موثوق ثم تشغيل `MigrationRunner`.
- الهجرة idempotent باستخدام `INSERT OR IGNORE`، وتتحقق من وجود الأدوار قبل ربط الصلاحيات لتجنب FK failure.

## الاختبارات

- `npx tsc --noEmit`: ناجح.
- `npm run test:phase2`: **7 passed, 0 failed**.
- `npm run test:orders`: **51 passed, 0 failed**.
- `npm run test:payments`: **57 passed, 0 failed**.
- `npm run test:shifts`: **64 passed, 0 failed**.
- `npm run test:reports`: **41 passed, 0 failed**.
- `npm run test:hardening`: **70 passed, 0 failed**.
- `npm run test:all`: ناجح بعد تحديث اختبارات إغلاق الوردية لاستخدام القرار الصريح.

## ملاحظات المرحلة التالية

- مرحلة الطباعة تحتاج اختباراً فعلياً على Windows مع طابعة USB وشبكة، وليس WASM/browser فقط.
- يجب اختبار مرتجع نقدي على وردية مفتوحة فعلياً وعلى جهاز Windows.
- واجهة إغلاق الوردية تعرض حالياً رسالة الرفض؛ يمكن إضافة checkbox صريح لـ `confirmPendingOrders` في مرحلة الواجهة التالية.
- يجب بناء NSIS Windows فقط بعد اعتماد هذه المرحلة، ثم تجربة installer على Windows نظيف مع تفعيل جديد وقاعدة AppData جديدة.
