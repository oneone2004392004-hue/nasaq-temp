# نسق POS — المرحلة الثالثة

تمت إضافة طباعة عربية ESC/POS فعلية. `EscPosBuilder` يرسل `ESC t` ويحوّل النص إلى بايتات `CP864` أو `WPC1256`. إعداد code page محفوظ لكل طابعة، مع خيار Raster كبديل. أضيف زر اختبار عربي واختبار bytes فعلي.

تم استبدال نوافذ الإدخال القديمة في صفحات العملاء والطاولات والمندوبين بـ Modal، وإضافة code splitting للصفحات الثقيلة، وخط عربي محلي. الإصدار موحد `1.0.2`، وTauri يستهدف NSIS Windows فقط. أضيف CI على `windows-latest` لتشغيل typecheck والاختبارات وcargo check والبناء.

Migration: `006_phase3_printer_encoding`. التغيير forward-only. الرجوع الآمن باستعادة backup قبل migration ثم تشغيل MigrationRunner.

التحقق اليدوي المطلوب على Windows: تثبيت NSIS، WebView2، تفعيل جديد، طابعة USB وشبكة، CP864 وWPC1256، Raster، درج نقدية، باركود، نسخ واستعادة، مرتجع، بيع بعد منتصف الليل. Linux installer خارج نطاق التسليم.
