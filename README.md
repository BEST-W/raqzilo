# راقزيلو — Raqzilo

أدوات مجانية للتعامل مع ملفات PDF بواجهة عربية وإنجليزية.

**[جرّب الموقع](https://raqzilo.vercel.app/)**

## ماذا يقدم الموقع؟

- تحرير النصوص وإضافة الصور والتوقيعات المرئية والتظليل وحجب البيانات.
- دمج الصفحات، فصلها، ترتيبها بالسحب، تدويرها واستخراجها.
- ضغط PDF، حماية نسخة بكلمة مرور وإضافة علامات مائية وأرقام صفحات.
- استخراج النصوص باستخدام OCR بالعربية والإنجليزية داخل المتصفح.
- تحويل PDF إلى Markdown (`.md`) لتنظيم النص والعناوين والجداول. عدد التوكنز يعتمد على المحتوى وطريقة معالجة الأداة للملف.
- تصدير DOCX والصور، وتحويل الصور إلى PDF، وإنشاء قوالب المستندات.
- مشاركة نسخة مختارة برابط مباشر بعد موافقة المستخدم على رفعها.
- اختيار اللغة تلقائيًا من الجهاز، مع إمكانية تغييرها يدويًا.
- لوحة إدارة خاصة بالمالك لتخصيص الألوان والأدوات والإعدادات.

معالجة المستندات تتم داخل المتصفح. مشاركة PDF برابط ترفع نسخة إلى تخزين خاص؛ أي شخص لديه رابط المشاركة يستطيع فتحها.

للاقتراحات وملاحظات الاستخدام، افتح Issue في المستودع بعد حذف البيانات الشخصية من المرفقات.

## التشغيل المستقل

مجلد `site/` هو تطبيق Next.js جاهز للنشر المباشر على Vercel، مع قاعدة Turso وتخزين Vercel Blob خاص. دخول الإدارة بكلمة مرور المالك؛ لا يعتمد على تسجيل الدخول إلى ChatGPT.

إعدادات Vercel للنسخة المستقلة: **Root Directory: `site`، Framework: Next.js، Install: `npm ci`، Build: `npm run build`، Node.js: 24.x**. اربط قاعدة Turso المجانية والتخزين الخاص قبل النشر. تحديثات فرع الإنتاج في GitHub تنشر تلقائيًا بعد توصيل المستودع.

مجلد `vercel/` يحتفظ بالبوابة القديمة للتراجع أثناء النقل. تغيير مجلد الجذر وحده لا ينقل قاعدة البيانات أو الملفات. يجب اختبار النسخة المستقلة ونقل روابط المشاركة قبل تحويل الرابط العام إليها. اتبع [دليل التطبيق والنقل](site/README.md).

## English

Raqzilo is an Arabic/English PDF workspace with local editing, page organization, OCR, PDF-to-Markdown conversion and optional direct-link sharing. `site/` is a native Next.js deployment target using Turso and private Vercel Blob storage, with independent owner-password authentication. `vercel/` preserves the earlier gateway for migration and rollback. See [the application guide](site/README.md) before promoting a migration.

## License

AGPL-3.0-only. See [LICENSE](LICENSE). Third-party notices are preserved in `site/public/licenses/`. Handwritten signatures are visual signatures; OCR output should be reviewed before use.
