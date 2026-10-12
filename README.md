<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/75b770b7-d5e2-46ae-8a4a-62193364b40d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## نظام التفعيل

يبدأ التطبيق ببوابة تفعيل مرتبطة بـ `Device ID` ثابت لكل تثبيت. يتم توقيع المفاتيح في أداة الإدارة المستقلة باستخدام Ed25519، بينما يحتوي التطبيق على المفتاح العام فقط للتحقق من التوقيع.

- أداة الإدارة السرية: `../nasaq-activation-generator.html`
- صيغة المفتاح: `NQ2.<payload>.<signature>`
- الصلاحيات: Device ID + تاريخ الانتهاء + اسم تمييزي
- المدد الجاهزة: 30، 90، 180، 365 يومًا أو تاريخ يدوي
- يجب عدم رفع أداة الإدارة إلى الاستضافة العامة أو إرسالها للعملاء.
- حذف السجل من أداة الإدارة لا يلغي مفتاحًا صدر مسبقًا؛ الإلغاء يحتاج إصدارًا جديدًا من سياسة التفعيل.
