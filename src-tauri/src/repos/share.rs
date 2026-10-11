// المشاركة (الشريحة 4 — طبقة خلفية بجانب القائم، بلا توصيل بالأوامر/الواجهات بعد).
// ملف مفرد: فك نسخة لكاش خاص بأسماء ودية + مسح مؤكد بعد التسليم.
// المستودع كاملاً: نسخ ملف الحاوية ومجلد files/ (مشفرة كما هي) لأي مجلد.
// حقائق قائمة (بلا كود جديد هنا): الكاش تحت app_cache_dir/share — خارج النسخ الاحتياطي
//   أصلاً (`create_backup` يقرأ app_data_dir/vaults فقط)، والمسح الشامل عند كل إقلاع يعمل
//   (`cleanup_share_cache_on_startup`) ويغطي أي مجلد نُجهّزه هنا لأنه لنفس الجذر.
// `FileProvider` وزر `PanelWelcomeRepo`/`CommonButtonsArea` لشريحة التوصيل.

use super::container::read_header_from_bytes;
use super::media::{is_media_name, list_media_files, read_media_file};
use super::{hex_encode, sanitize_file_name, unique_dest};
use std::path::{Path, PathBuf};

/// عنصر تجهيز: ملف مشفر مخزّن + اسم ودود (بالامتداد الحقيقي) يراه التطبيق الخارجي.
pub(crate) struct ShareItem {
    pub(crate) stored: PathBuf,
    pub(crate) display: String,
}

/// تجهيز ملفات مفكوكة للمشاركة: فك الكل للذاكرة أولاً (فلا دفعة نصف مجهزة)، ثم كتابة
/// الكل بأسماء ودية تحت مجلد جديد في جذر الكاش — تُرجَع المسارات فقط للتسليم الخارجي.
pub(crate) fn stage_media_for_share(
    share_root: &Path,
    password: &str,
    items: &[ShareItem],
) -> Result<Vec<PathBuf>, String> {
    if items.is_empty() {
        return Err("لا ملفات للمشاركة.".to_string());
    }
    if password.is_empty() {
        return Err("كلمة المستودع إجبارية.".to_string());
    }
    // تحقق مبكر رخيص (الأسماء والوجود) قبل أي فك أو كتابة.
    for item in items {
        let name = item.stored.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !is_media_name(name) || !item.stored.is_file() {
            return Err("الملف غير موجود في المستودع.".to_string());
        }
    }
    // الفك الكامل أولاً — فشل أي عنصر يلغي الدفعة قبل لمس القرص.
    let mut plain: Vec<(String, Vec<u8>)> = Vec::with_capacity(items.len());
    for item in items {
        let bytes = read_media_file(&item.stored, password)?;
        plain.push((sanitize_file_name(&item.display), bytes));
    }
    let mut dir_seed = [0u8; 16];
    getrandom::fill(&mut dir_seed).map_err(|_| "تعذر توليد مجلد مؤقت.".to_string())?;
    let batch = share_root.join(hex_encode(&dir_seed));
    std::fs::create_dir_all(&batch).map_err(|_| "تعذر تجهيز مجلد المشاركة.".to_string())?;
    let mut out = Vec::with_capacity(plain.len());
    for (name, bytes) in &plain {
        let dest = unique_dest(&batch, name);
        if let Err(e) = std::fs::write(&dest, bytes) {
            let _ = std::fs::remove_dir_all(&batch);
            return Err(format!("تعذر تجهيز الملف للمشاركة: {e}"));
        }
        out.push(dest);
    }
    Ok(out)
}

/// مسح مؤكد لمجلد/ملف مشاركة: إزالة + تحقق من الزوال. الغائب أصلاً نجاح (المحصلة: زال).
/// الجذر نفسه محمي دائماً، والخارج عن جذر الكاش مرفوض — بلا حذف عابر أبداً.
pub(crate) fn wipe_share_path(share_root: &Path, target: &Path) -> Result<(), String> {
    let root = share_root
        .canonicalize()
        .map_err(|_| "مجلد الكاش غير موجود.".to_string())?;
    let Ok(canon) = target.canonicalize() else { return Ok(()) };
    if canon == root {
        return Err("رفض مسح جذر الكاش نفسه.".to_string());
    }
    if !canon.starts_with(&root) {
        return Err("المسار خارج مجلد الكاش.".to_string());
    }
    if canon.is_dir() {
        std::fs::remove_dir_all(&canon).map_err(|_| "تعذر مسح مجلد المشاركة.".to_string())?;
    } else {
        std::fs::remove_file(&canon).map_err(|_| "تعذر مسح ملف المشاركة.".to_string())?;
    }
    if canon.exists() {
        return Err("تعذر المسح المؤكد — ما زال موجوداً.".to_string());
    }
    Ok(())
}

/// نتيجة تصدير المستودع كاملاً (نُسخ — الأصل لا يُمَس).
pub(crate) struct ExportedRepo {
    pub(crate) vault: PathBuf,
    pub(crate) files: PathBuf,
    pub(crate) media_count: usize,
}

/// تصدير المستودع كاملاً: نسخ ملف الحاوية (بعد التحقق من ترويسة صالحة بلا كلمة)
/// + نسخ `*.enc` فقط إلى `files/` الوجهة (الغريب غير المشفر لا يُنسَخ).
pub(crate) fn export_repo_copy(
    container_file: &Path,
    files_dir: &Path,
    dest_dir: &Path,
) -> Result<ExportedRepo, String> {
    let raw = std::fs::read(container_file)
        .map_err(|_| "ملف الحاوية غير موجود.".to_string())?;
    read_header_from_bytes(&raw).map_err(|_| "ملف الحاوية غير صالح.".to_string())?;
    std::fs::create_dir_all(dest_dir).map_err(|_| "تعذر إنشاء مجلد الوجهة.".to_string())?;
    let dest = dest_dir.canonicalize().map_err(|_| "تعذر إنشاء مجلد الوجهة.".to_string())?;
    if let Ok(src_dir) = container_file.parent().map(|p| p.to_path_buf()).unwrap_or_default().canonicalize() {
        if dest == src_dir {
            return Err("مجلد الوجهة هو مجلد المستودع نفسه.".to_string());
        }
    }
    let file_name = container_file
        .file_name()
        .ok_or("اسم ملف الحاوية غير صالح.".to_string())?;
    let vault_dest = dest.join(file_name);
    std::fs::write(&vault_dest, &raw).map_err(|_| "تعذر نسخ ملف الحاوية.".to_string())?;
    let files_dest = dest.join(super::FILES_DIR);
    std::fs::create_dir_all(&files_dest).map_err(|_| "تعذر إنشاء مجلد الملفات.".to_string())?;
    let mut media_count = 0usize;
    for name in list_media_files(files_dir) {
        std::fs::copy(files_dir.join(&name), files_dest.join(&name))
            .map_err(|_| "تعذر نسخ ملف مشفر.".to_string())?;
        media_count += 1;
    }
    Ok(ExportedRepo { vault: vault_dest, files: files_dest, media_count })
}

// ================= اختبارات الشريحة 4 =================
#[cfg(test)]
mod tests {
    use super::super::container::new_header;
    use super::super::media::add_media_file;
    use super::super::store::save_vault_file;
    use super::super::{create_schema, seed_repo_structure};
    use super::*;
    use rusqlite::Connection;

    fn temp_root(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("repo_share_{name}_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    struct Guard {
        dir: std::path::PathBuf,
    }
    impl Drop for Guard {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    fn seeded_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("memory db");
        create_schema(&conn).expect("schema");
        seed_repo_structure(&conn, &[], true).expect("seed");
        conn
    }

    /// مستودع حاوية + ملفا وسيط + ملف غريب — لاختبارات التصدير والتجهيز.
    /// تُرجَع أسماء الوسائط بترتيب الإضافة (الأول PDF مزيف).
    fn fixture(dir: &Path) -> (PathBuf, PathBuf, Vec<String>) {
        let container = dir.join("repo.vault");
        let files = dir.join("files");
        std::fs::create_dir_all(&files).expect("files dir");
        let mut header = new_header("repo-1", "المشاركة").expect("header");
        save_vault_file(&container, &mut header, &seeded_conn(), "Test#1234").expect("save");
        let first = add_media_file(&files, b"%PDF-1.4 staged-bytes", "Test#1234").expect("media a");
        let second = add_media_file(&files, b"second-media-bytes", "Test#1234").expect("media b");
        std::fs::write(files.join("notes.txt"), b"stray").expect("stray");
        (container, files, vec![first, second])
    }

    #[test]
    fn stage_decrypts_with_friendly_name() {
        let dir = temp_root("stage");
        let _guard = Guard { dir: dir.clone() };
        let (_container, files, media) = fixture(&dir);
        let enc: PathBuf = files.join(&media[0]);
        let root = dir.join("share");
        let staged = stage_media_for_share(
            &root,
            "Test#1234",
            &[ShareItem { stored: enc, display: "تقريري.pdf".to_string() }],
        )
        .expect("stage");
        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].file_name().and_then(|n| n.to_str()).expect("name"), "تقريري.pdf");
        assert_eq!(std::fs::read(&staged[0]).expect("read"), b"%PDF-1.4 staged-bytes");
        // مجلد جديد واحد تحت الجذر — والمسار داخله حصراً.
        let batch = staged[0].parent().expect("parent");
        assert!(batch.starts_with(&root));
        assert_ne!(batch, root);
    }

    #[test]
    fn stage_validates_before_writing_anything() {
        let dir = temp_root("stagefail");
        let _guard = Guard { dir: dir.clone() };
        let (_container, files, media) = fixture(&dir);
        let good: PathBuf = files.join(&media[0]);
        let root = dir.join("share");
        let before: usize = root.read_dir().map(|r| r.count()).unwrap_or(0);
        let err = stage_media_for_share(
            &root,
            "Test#1234",
            &[
                ShareItem { stored: good, display: "a.pdf".to_string() },
                ShareItem { stored: files.join("missing.enc"), display: "b.pdf".to_string() },
            ],
        )
        .expect_err("must fail");
        assert_eq!(err, "الملف غير موجود في المستودع.");
        let after: usize = root.read_dir().map(|r| r.count()).unwrap_or(0);
        assert_eq!(before, after, "الفشل المبكر لا يجهّز شيئاً");
        // وكلمة خاطئة ترفض أيضاً.
        let enc: PathBuf = files.join(&media[0]);
        assert!(stage_media_for_share(
            &root,
            "wrong-pass",
            &[ShareItem { stored: enc, display: "a.pdf".to_string() }]
        )
        .is_err());
    }

    #[test]
    fn stage_rejects_plain_file_and_contains_escape() {
        let dir = temp_root("stagesafe");
        let _guard = Guard { dir: dir.clone() };
        let (_container, files, media) = fixture(&dir);
        let root = dir.join("share");
        // ملف غير مشفر مرفوض ولو كان موجوداً.
        assert!(stage_media_for_share(
            &root,
            "Test#1234",
            &[ShareItem { stored: files.join("notes.txt"), display: "n.txt".to_string() }]
        )
        .is_err());
        // اسم هروب يُنقّى ويبقى داخل مجلد الدفعة.
        let enc: PathBuf = files.join(&media[0]);
        let staged = stage_media_for_share(
            &root,
            "Test#1234",
            &[ShareItem { stored: enc, display: "../../evil.pdf".to_string() }],
        )
        .expect("stage");
        let batch = staged[0].parent().expect("parent");
        assert!(staged[0].starts_with(batch));
        assert!(batch.starts_with(&root));
        assert_eq!(staged[0].file_name().and_then(|n| n.to_str()).expect("name"), "evil.pdf");
    }

    #[test]
    fn wipe_is_confirmed_and_guarded() {
        let dir = temp_root("wipe");
        let _guard = Guard { dir: dir.clone() };
        let (_container, files, media) = fixture(&dir);
        let enc: PathBuf = files.join(&media[0]);
        let root = dir.join("share");
        let staged = stage_media_for_share(
            &root,
            "Test#1234",
            &[ShareItem { stored: enc, display: "w.pdf".to_string() }],
        )
        .expect("stage");
        let batch = staged[0].parent().expect("parent").to_path_buf();
        wipe_share_path(&root, &batch).expect("wipe");
        assert!(!batch.exists(), "المسح المؤكد يزيل فعلاً");
        // الغائب نجاح (لا شيء لمسحه)، والجذر والخارج مرفوضان.
        assert!(wipe_share_path(&root, &batch).is_ok());
        assert!(wipe_share_path(&root, &root).is_err(), "الجذر محمي");
        let outside = dir.join("outside.txt");
        std::fs::write(&outside, b"x").expect("outside");
        assert!(wipe_share_path(&root, &outside).is_err(), "الخارج مرفوض");
        assert!(outside.is_file(), "الخارج لم يُمَس");
    }

    #[test]
    fn export_copies_vault_and_enc_only() {
        let dir = temp_root("export");
        let _guard = Guard { dir: dir.clone() };
        let (container, files, _) = fixture(&dir);
        let dest = dir.join("usb");
        let out = export_repo_copy(&container, &files, &dest).expect("export");
        assert_eq!(out.media_count, 2);
        assert_eq!(std::fs::read(&out.vault).expect("vault"), std::fs::read(&container).expect("src"));
        let mut names: Vec<String> = std::fs::read_dir(&out.files)
            .expect("read dest files")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, list_media_files(&files), "المشفرة فقط — بلا غريب");
        for n in &names {
            assert_eq!(
                std::fs::read(out.files.join(n)).expect("f"),
                std::fs::read(files.join(n)).expect("s")
            );
        }
        // الأصل لا يُمَس.
        assert!(container.is_file() && files.is_dir());
    }

    #[test]
    fn export_rejects_garbage_missing_and_self() {
        let dir = temp_root("exportfail");
        let _guard = Guard { dir: dir.clone() };
        let (container, files, _) = fixture(&dir);
        let garbage = dir.join("junk.vault");
        std::fs::write(&garbage, b"not-a-container").expect("junk");
        assert!(export_repo_copy(&garbage, &files, &dir.join("d1")).is_err(), "غير الحاوية مرفوض");
        assert!(export_repo_copy(&dir.join("no.vault"), &files, &dir.join("d2")).is_err(), "المفقود مرفوض");
        assert!(
            export_repo_copy(&container, &files, &container.parent().expect("p")).is_err(),
            "الوجهة نفسها مرفوضة"
        );
    }
}
