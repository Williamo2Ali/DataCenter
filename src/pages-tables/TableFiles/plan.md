# خطة مجلد جدول الملفات — TableFiles

## الهدف
كل ما يخص جدول الملفات في المستودع داخل `src/pages-tables/TableFiles/` —
الصفحة منسّق نحيف، وكل قسم/عارض بملفه، بلا طبقات تمرير.

## الشجرة
```
TableFiles/
  plan.md                  هذه الخطة
  PageTableFiles.tsx       المنسّق: الحالة + واجهة الهيدر (FileManagerApi) + تركيب الأقسام
  FileStagingList.tsx      قائمة انتظار الحفظ (staged)
  FileFilterBar.tsx        البحث + فلاتر النوع/المالك/التصنيف + الفرز
  FileGridCard.tsx         بطاقة ملف واحدة (أيقونة/عنوان/أزرار)
  PagePDFViewer.tsx        عارض PDF (منقول من Interfaces/DocumentLibrary كما هو)
  PageImageViewer.tsx      فارغ — عارض الصور (لاحقاً)
  PageVideoViewer.tsx      فارغ — عارض الفيديو (لاحقاً)
  TextFileEditor.tsx       فارغ — محرر النصوص البسيط (لاحقاً)
  WebPageViewer.tsx        فارغ — عارض صفحات الويب html (لاحقاً)
  FileCardEditor.tsx       محرر بيانات الملف مضمّن داخل الكارد (عنوان/مالك/تصنيف + حفظ/إلغاء)
  FilePreviewPage.tsx        صفحة المعاينة (شريط رجوع/عنوان/حفظ/مشاركة + محتوى عارٍ)
```

## يبقى خارج المجلد عمداً
- `src/lib/documents.ts` — مشترك مع `TabCategories` و`ModalDocument`.
- المعاينة كسولة (`lazy`) دائماً — لا ثقل على الإقلاع.
- حذف الملف ما زال `window.confirm` — يُحوَّل لـ `ModalMessages` ضمن موجة الحذف اللاحقة، لا ضمن النقل.

## خطوات التنفيذ
1. نقل جسم `Interfaces/FileManager.tsx` موزعاً على الصفحة + ملفات الأقسام الثلاثة.
2. نقل `Interfaces/DocumentLibrary.tsx` ← `PagePDFViewer.tsx` (إصلاح المسارات `../` ← `../../`).
3. نقل `modals/ModalDocument.tsx` ← `TableFiles/ModalDocument.tsx` (إصلاح المسارات).
4. ملفات فارغة للعارضات الأربع المستقبلية (بترويسة توضيحية فقط).
5. `FileManagerApi` ينتقل مع الصفحة — تحديث استيراد النوع في `TablesRouter` و`PageRepoViewer`.
6. حذف `Interfaces/FileManager.tsx`.
7. فحص `tsc -b --force` نظيف.

## معايير القبول
- بلا تغيير سلوكي (نقل + تقسيم فقط).
- لا ملف يتجاوز ~450 سطراً، ولا طبقة تمرير بمستهلك وحيد.
- كل استيراد يشير للمسار الجديد، ولا بقايا للمسارات القديمة.
