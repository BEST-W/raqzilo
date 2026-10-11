import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Editor from '../components/pdf-editor';
import AdminPanel from '../components/admin-panel';
import OwnerLogin from '../components/owner-login';
import {SharePage, SharedLinkPage, MissingShare} from '../components/share-pages';
import { LanguageProvider } from '../components/language-provider';
import { defaultSettings, settingsSchema } from '../lib/settings-model';
import { getLocalizedToolEntries } from '../lib/localized-settings';
import { english, translate, translateMessage, type Language } from '../lib/translations';
import * as engine from '../lib/pdf-engine';
import { createTemplate } from '../lib/local-pdf-tools';
import * as mupdf from 'mupdf';

engine.installEngineForTests(mupdf);
engine.installFontForTests(new Uint8Array(await fs.readFile('public/fonts/DejaVuSans.ttf')));

const plainText = (html: string) => html.replace(/<[^>]+>/g, '').replaceAll('العربية', '');
for (const locale of ['ar', 'en'] as Language[]) {
  const html = renderToStaticMarkup(<LanguageProvider initialLanguage={locale}><Editor settings={defaultSettings}/></LanguageProvider>);
  await fs.writeFile(`.sites-runtime/home-${locale}.html`, html);
  assert(html.includes(locale === 'ar' ? 'اختر ملف PDF' : 'Choose PDF file'));
  assert(html.includes(locale === 'ar' ? defaultSettings.name : defaultSettings.nameEn));
  assert(html.includes(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`));
  assert(!html.includes('class="admin-link"'), 'Visitors must not see an administration entry');
  assert(!html.includes('href="/source.zip"'), 'The visitor footer must not show the source download');
  const ownerHome = renderToStaticMarkup(<LanguageProvider initialLanguage={locale}><Editor settings={defaultSettings} isOwner/></LanguageProvider>);
  assert(ownerHome.includes('class="admin-link"'), 'The owner must retain the administration entry');
  for (const entry of getLocalizedToolEntries(defaultSettings, locale)) assert(html.includes(entry.name));
  if (locale === 'en') assert(!/[\u0600-\u06ff]/.test(plainText(html)), 'English home must not contain untranslated interface text');
  const admin = renderToStaticMarkup(<LanguageProvider initialLanguage={locale}><AdminPanel initial={defaultSettings} initialRevision={2} ownerName="Abdulhadi"/></LanguageProvider>);
  assert(admin.includes(locale === 'ar' ? 'حفظ التغييرات' : 'Save changes'));
  if (locale === 'en') assert(!/[\u0600-\u06ff]/.test(plainText(admin)), 'English administration must not contain untranslated interface text');
  const access = renderToStaticMarkup(<LanguageProvider initialLanguage={locale}><OwnerLogin /></LanguageProvider>);
  assert(access.includes(locale === 'ar' ? 'دخول مالك الموقع' : 'Owner sign in'));
  if (locale === 'en') assert(!/[\u0600-\u06ff]/.test(plainText(access)));
  for(const screen of [<SharePage settings={defaultSettings}/>,<SharedLinkPage settings={defaultSettings} file={{id:'a'.repeat(32),filename:'Contract.pdf',size:2048,createdAt:Date.now(),path:'/s/'+ 'a'.repeat(32)}}/>,<MissingShare/>,<MissingShare unavailable/>]) {
    const markup=renderToStaticMarkup(<LanguageProvider initialLanguage={locale}>{screen}</LanguageProvider>);
    if(locale==='en')assert(!/[\u0600-\u06ff]/.test(plainText(markup)),'English sharing must not contain untranslated interface text');
  }
}
const custom = settingsSchema.parse({ ...defaultSettings, customTools: [{ id: 'custom_lang001', name: 'ترقيم العقود', nameEn: 'Contract numbering', description: 'أرقام العقود', descriptionEn: 'Number every contract', action: 'numberPages', icon: 'hash', enabled: true, color: '#2457d6', url: '', defaultText: '' }], toolOrder: ['custom_lang001', 'edit'] });
assert.equal(getLocalizedToolEntries(custom, 'en')[0].name, 'Contract numbering');
assert.equal(getLocalizedToolEntries(custom, 'ar')[0].name, 'ترقيم العقود');
assert.equal(getLocalizedToolEntries(custom, 'en')[0].id, getLocalizedToolEntries(custom, 'ar')[0].id);
assert.equal(translate('en', 'أقصى حجم للملف {0} ميجابايت.', { 0: 50 }), 'The maximum file size is 50 MB.');
assert.equal(translateMessage('en', 'قراءة الصفحة 3 (2/5)…'), 'Recognizing page 3 (2/5)…');
assert.equal(translateMessage('ar', 'Recognizing page 3 (2/5)…'), 'قراءة الصفحة 3 (2/5)…');
assert.equal(translateMessage('en', 'نطاق الصفحات خارج المستند.'), 'The page range is outside this document.');

const files = ['components/markdown-dialog.tsx', 'components/pdf-editor.tsx', 'components/local-tools-dialog.tsx', 'components/admin-panel.tsx', 'components/owner-login.tsx', 'components/page-rail.tsx', 'components/field-properties.tsx', 'components/customization/color-control.tsx', 'components/customization/tool-manager.tsx', 'components/home-workspace.tsx', 'components/share-panel.tsx', 'components/share-pages.tsx'];
for (const file of files) {
  const source = await fs.readFile(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && ts.isStringLiteral(node.arguments[0])) {
      const key = node.arguments[0].text;
      if (/[\u0600-\u06ff]/.test(key)) assert(Object.hasOwn(english, key), `${file}: missing translation for ${key}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
for (const kind of ['invoice', 'letter', 'form'] as const) {
  const template = await createTemplate(kind, 'Malafak', '#4f46e5', 'en');
  assert(!/[\u0600-\u06ff]/.test(template.title));
  for (const mark of template.marks) if (mark.text) assert(!/[\u0600-\u06ff]/.test(mark.text));
  const pdf = await engine.applyMarks(template.bytes, template.marks);
  const rendered = await engine.renderPage(pdf, 0, 700);
  assert(rendered.lines.some(line => line.text.includes('Malafak')));
  await fs.writeFile(`.sites-runtime/template-${kind}-en.png`,rendered.png);
  assert(rendered.lines.map(line => line.text).join(' ').includes(template.title), `${kind}: ${template.title}: ${rendered.lines.map(line=>line.text).join(' | ')}`);
}
console.log('PASS: Arabic/English home, all tool labels, administration, access screens, custom names, direction, dynamic errors/progress, translation coverage, and real English PDF templates.');
