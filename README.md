# راقزيلو — Raqzilo

أدوات مجانية للتعامل مع ملفات PDF بواجهة عربية وإنجليزية.

**[جرّب الموقع](https://raqzilo.vercel.app/)**

## ماذا يقدم الموقع؟

- تحرير النصوص وإضافة الصور والتوقيعات المرئية والتظليل.
- دمج الصفحات، فصلها، ترتيبها بالسحب، تدويرها واستخراجها.
- ضغط PDF، حماية نسخة بكلمة مرور وإضافة علامات مائية وأرقام صفحات.
- استخراج النصوص من الصفحات الممسوحة باستخدام OCR بالعربية والإنجليزية.
- تحويل PDF إلى Markdown ‏(`.md`) لتنظيم النص والعناوين والجداول وتسهيل استخدام المحتوى مع أدوات الذكاء الاصطناعي. عدد التوكنز يعتمد على المحتوى وطريقة معالجة الأداة للملف.
- تصدير النص إلى DOCX، والصفحات إلى صور، وتحويل الصور إلى PDF.
- مشاركة نسخة مختارة من PDF برابط مباشر بعد موافقة المستخدم على رفعها.
- اختيار اللغة تلقائيًا من إعدادات الجهاز، مع إمكانية تغييرها يدويًا.
- لوحة إدارة خاصة بالمالك لتخصيص الألوان والأدوات والإعدادات.

معظم معالجة المستندات تتم داخل المتصفح. مشاركة PDF برابط تتطلب رفع النسخة المختارة إلى الخادم؛ يستطيع أي شخص يملك رابط المشاركة فتحها.

إذا استفدت من المشروع، يمكنك إضافة نجمة ⭐. للاقتراحات وملاحظات الاستخدام، افتح Issue في هذا المستودع، مع حذف البيانات الشخصية من الملفات أو الصور التي ترسلها.

## ملفات المشروع

| المجلد | المحتوى |
| --- | --- |
| `site/` | مصدر تطبيق PDF، بما فيه أدوات Markdown وOCR وإدارة الصفحات والمشاركة. |
| `vercel/` | إعدادات وبوابة الموقع المنشور حاليًا على Vercel. |

الموقع الحالي يعمل على Vercel، ويستخدم التطبيق الأصلي وخدمات Cloudflare Workers وD1 وR2 للمشاركة وإدارة الموقع. رفع المصدر إلى GitHub وحده لا ينشئ هذه الخدمات ولا ينشر تغييرات التطبيق تلقائيًا.

للتطوير، اتبع [دليل التطبيق](site/README.md). الملفات الأصلية لمحركات PDF وOCR تُجهَّز من الاعتماديات الموجودة في `site/pnpm-lock.yaml` باستخدام `node scripts/prepare-pdf-assets.mjs` داخل `site/`، بعد تثبيت الاعتماديات. لم تُكرر الملفات التي يولّدها هذا الأمر في المستودع.

إذا ربطت مشروع Vercel الحالي بهذا المستودع، استخدم مجلد الجذر `vercel`، وFramework Preset بقيمة `Other`، وBuild Command بقيمة `npm run build`، وOutput Directory بقيمة `public`، وNode.js 24. اقرأ [دليل Vercel](vercel/README.md).

## English

Raqzilo is a free Arabic/English PDF workspace with browser-based editing, page organization, OCR, PDF-to-Markdown conversion and optional direct-link sharing. The live website is **https://raqzilo.vercel.app/**.

The `site/` directory contains the application source; `vercel/` contains the production gateway. The application uses Cloudflare Workers, D1 and R2 for its server features. See each directory's README for development and hosting details.

## License

AGPL-3.0-only. See [LICENSE](LICENSE). Third-party font and PDF/OCR license notices are preserved in `site/public/licenses/` and the source directories. Visible handwritten signatures are not cryptographic signatures; OCR output should be reviewed before use.
