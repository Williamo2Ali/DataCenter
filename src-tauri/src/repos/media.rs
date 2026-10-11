// الوسائط المستقلة (الشريحة 3 — طبقة جديدة بجانب القائم، بلا توصيل بالأوامر بعد).
// الإضافة: تشفير مرة واحدة عند الإضافة (`*.enc` بأسماء معتمة في `files/`) — لا تُمس مع حفظ النصوص.
// القراءة: فك كامل للذاكرة لحظة العرض فقط (GCM يقتضي الكل قبل التسليم فلا تدفق جزئي).
// الحذف: حذف الملف وانتهى. نفس كلمة المستودع (salt مستقل لكل ملف عبر المغلّف).
// البصمة: نفس بصمة المستودعات (RPV1) بإعادة استخدام `encrypt_envelope` — بلا أي تغليف إضافي.
// عتبات الأحجام (25/100/200MB) تبقى في طبقة العارضات كما اليوم — لا سقف هنا.

use crate::vault::{decrypt_envelope, encrypt_envelope};
use super::container::REPO_VAULT_MAGIC;
use std::path::{Path, PathBuf};

/// امتداد الملفات المشفرة — الاسم معتم دائماً (لا أثر للاسم الأصلي).
pub(crate) const MEDIA_EXT: &str = ".enc";
/// طول الجذع العشوائي (بايتات → ضعفها hex).
const MEDIA_STEM_BYTES: usize = 8;
/// محاولات توليد اسم غير متصادم قبل الاستسلام.
const MEDIA_NAME_RETRIES: u32 = 10;

/// اسم معتم جديد: 16 حرف hex + `.enc` — بلا أي علاقة بالاسم الأصلي.
fn opaque_name() -> Result<String, String> {
    let mut stem = [0u8; MEDIA_STEM_BYTES];
    getrandom::fill(&mut stem).map_err(|_| "تعذر توليد اسم معتم.".to_string())?;
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut name = String::with_capacity(MEDIA_STEM_BYTES * 2 + MEDIA_EXT.len());
    for b in stem {
        name.push(HEX[(b >> 4) as usize] as char);
        name.push(HEX[(b & 0x0f) as usize] as char);
    }
    name.push_str(MEDIA_EXT);
    Ok(name)
}

/// تشفير بايتات وسيط — كلمة المستودع نفسها إجبارية.
pub(crate) fn encrypt_media_bytes(bytes: &[u8], password: &str) -> Result<Vec<u8>, String> {
    if password.is_empty() {
        return Err("كلمة المستودع إجبارية — لا وسيط بلا كلمة.".to_string());
    }
    if bytes.is_empty() {
        return Err("الملف فارغ.".to_string());
    }
    encrypt_envelope(&REPO_VAULT_MAGIC, bytes, password)
}

/// إضافة وسيط: تشفير مرة واحدة وكتابة `files/<معتم>.enc` — يُرجَع الاسم المخزّن.
pub(crate) fn add_media_file(
    files_dir: &Path,
    bytes: &[u8],
    password: &str,
) -> Result<String, String> {
    let sealed = encrypt_media_bytes(bytes, password)?;
    std::fs::create_dir_all(files_dir).map_err(|_| "تعذر إنشاء مجلد الملفات.".to_string())?;
    for _ in 0..MEDIA_NAME_RETRIES {
        let name = opaque_name()?;
        let path = files_dir.join(&name);
        if path.exists() {
            continue;
        }
        // حصرياً: لا كتابة فوق موجود — التكرار النظري يُعاد توليده.
        std::fs::write(&path, &sealed).map_err(|_| "تعذر كتابة الملف المشفر.".to_string())?;
        return Ok(name);
    }
    Err("تعذر توليد اسم معتم فريد.".to_string())
}

/// قراءة وسيط: فك كامل للذاكرة لحظة العرض فقط — لا نسخة نصية على القرص أبداً.
/// الامتداد لا معنى له هنا (ملف `.enc` مُعاد تسميته يُفَك بنجاح — وملف خارجي لا يُفَك أبداً).
pub(crate) fn read_media_file(path: &Path, password: &str) -> Result<Vec<u8>, String> {
    let raw = std::fs::read(path).map_err(|_| "الملف غير موجود.".to_string())?;
    decrypt_envelope(&REPO_VAULT_MAGIC, &raw, password)
        .map_err(|_| "كلمة المرور غير صحيحة أو الملف تالف.".to_string())
}

/// حذف وسيط: حذف الملف وانتهى — المفقود خطأ صريح (يميز المتصل عن الناجح).
pub(crate) fn delete_media_file(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Err("الملف غير موجود.".to_string());
    }
    std::fs::remove_file(path).map_err(|_| "تعذر حذف الملف.".to_string())
}

/// هل الاسم اسم وسيط مشفر (بلا فواصل مسارات)؟ — للعدّ والتنظيف لاحقاً.
pub(crate) fn is_media_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && name.ends_with(MEDIA_EXT)
        && name.len() > MEDIA_EXT.len()
}

/// سرد الوسائط في مجلد — مرتبة. الغائب/غير المجلد = فارغة (أفضل جهد للعدّ).
pub(crate) fn list_media_files(files_dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(files_dir) else { return out };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_media_name(&name) && entry.path().is_file() {
            out.push(name);
        }
    }
    out.sort();
    out
}

/// مسار مجلد وسائط مستودع من مسار مجلده — إنشاء عند الحاجة للأوامر لاحقاً.
pub(crate) fn ensure_files_dir(repo_path: &Path) -> Result<PathBuf, String> {
    let dir = repo_path.join(super::FILES_DIR);
    std::fs::create_dir_all(&dir).map_err(|_| "تعذر إنشاء مجلد الملفات.".to_string())?;
    Ok(dir)
}

// ================= اختبارات الشريحة 3 =================
#[cfg(test)]
mod tests {
    use super::*;

    fn temp_files_dir(name: &str) -> (std::path::PathBuf, PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("repo_media_{name}_{}", std::process::id()));
        let files = dir.join("files");
        let _ = std::fs::create_dir_all(&files);
        (dir, files)
    }

    struct Guard {
        dir: std::path::PathBuf,
    }
    impl Drop for Guard {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn add_decrypt_roundtrip_with_opaque_name() {
        let (dir, files) = temp_files_dir("roundtrip");
        let _guard = Guard { dir };
        let stored = add_media_file(&files, b"hello-media-bytes", "Test#1234").expect("add");
        assert!(stored.ends_with(MEDIA_EXT));
        let stem = &stored[..stored.len() - MEDIA_EXT.len()];
        assert_eq!(stem.len(), MEDIA_STEM_BYTES * 2);
        assert!(stem.chars().all(|c| c.is_ascii_hexdigit()), "الجذع hex معتم");
        // لا أثر للاسم الأصلي — الدالة لا تستقبله أصلاً.
        assert!(!stored.contains("report"));
        let back = read_media_file(&files.join(&stored), "Test#1234").expect("read");
        assert_eq!(back, b"hello-media-bytes");
    }

    #[test]
    fn same_bytes_seal_differently() {
        // salt/iv مستقل لكل ملف: نفس البايتات تُنتج ملفين مختلفين اسماً ومحتوى.
        let (dir, files) = temp_files_dir("unique");
        let _guard = Guard { dir };
        let a = add_media_file(&files, b"same", "Test#1234").expect("add a");
        let b = add_media_file(&files, b"same", "Test#1234").expect("add b");
        assert_ne!(a, b, "اسمان معتمان مختلفان");
        let ra = std::fs::read(files.join(&a)).expect("read a");
        let rb = std::fs::read(files.join(&b)).expect("read b");
        assert_ne!(ra, rb, "بصمة عشوائية مستقلة لكل ملف");
        assert_eq!(read_media_file(&files.join(&b), "Test#1234").expect("decrypt"), b"same");
    }

    #[test]
    fn wrong_password_and_tamper_rejected() {
        let (dir, files) = temp_files_dir("reject");
        let _guard = Guard { dir };
        let stored = add_media_file(&files, b"secret-media", "Test#1234").expect("add");
        let path = files.join(&stored);
        assert!(read_media_file(&path, "wrong-pass").is_err(), "الكلمة الخاطئة تُرفَض");
        let mut raw = std::fs::read(&path).expect("read");
        raw[40] ^= 0x01;
        std::fs::write(&path, &raw).expect("tamper");
        assert!(read_media_file(&path, "Test#1234").is_err(), "عبث بايت واحد يُكتشَف");
        assert!(read_media_file(&files.join("nope.enc"), "Test#1234").is_err());
    }

    #[test]
    fn passwords_and_empty_guarded() {
        let (dir, files) = temp_files_dir("guard");
        let _guard = Guard { dir };
        assert!(add_media_file(&files, b"data", "").is_err(), "بلا كلمة مرفوض");
        assert!(add_media_file(&files, b"data", "abc").is_err(), "القصيرة مرفوضة");
        assert!(add_media_file(&files, b"", "Test#1234").is_err(), "الفارغ مرفوض");
        assert!(encrypt_media_bytes(b"", "Test#1234").is_err());
    }

    #[test]
    fn renamed_enc_is_no_valid_file() {
        // بوابة القبول: إعادة تسمية `file.enc` لامتداد وهمي لا تُنتج ملفاً صالحاً —
        // لأن البصمات السحرية نفسها مشفرة (لا %PDF ولا JPEG ولا PNG في أول الملف).
        let (dir, files) = temp_files_dir("rename");
        let _guard = Guard { dir };
        let mut fake_pdf = b"%PDF-1.4 fake-content".to_vec();
        fake_pdf.extend_from_slice(&[0xFF, 0xD8, 0xFF]); // بصمة JPEG أيضاً داخل المحتوى
        let stored = add_media_file(&files, &fake_pdf, "Test#1234").expect("add");
        let raw = std::fs::read(files.join(&stored)).expect("read");
        let renamed = files.join("report.pdf");
        std::fs::write(&renamed, &raw).expect("rename");
        let as_pdf = std::fs::read(&renamed).expect("read renamed");
        assert_ne!(&as_pdf[0..4], b"%PDF", "المعاد تسميته ليس PDF صالحاً");
        assert_ne!(&as_pdf[0..3], &[0xFF, 0xD8, 0xFF], "وليس صورة صالحة");
        // (البصمة RPV1 أول 4 بايتات نصية بالتصميم — كما حددت الخطة: MAGIC أولاً —
        //  وهي بصمة صيغة لا محتوى: لا أسماء ولا أسرار، والمحتوى كله بعدها مشفر.)
        // وطبقتنا تفكّه بالمسار مهما كان الامتداد — الامتداد لا معنى له عندنا.
        assert_eq!(read_media_file(&renamed, "Test#1234").expect("decrypt"), fake_pdf);
    }

    #[test]
    fn delete_removes_file_and_missing_errors() {
        let (dir, files) = temp_files_dir("delete");
        let _guard = Guard { dir };
        let stored = add_media_file(&files, b"bye", "Test#1234").expect("add");
        let path = files.join(&stored);
        delete_media_file(&path).expect("delete");
        assert!(!path.exists(), "حذف ملف = حذف ملفه وانتهى");
        assert!(delete_media_file(&path).is_err(), "المفقود خطأ صريح");
    }

    #[test]
    fn sealed_bytes_hold_no_plaintext() {
        let (dir, files) = temp_files_dir("scan");
        let _guard = Guard { dir };
        let secret = b"SEKRIT-MEDIA-777";
        let mut payload = b"binary-prefix".to_vec();
        payload.extend_from_slice(secret);
        let stored = add_media_file(&files, &payload, "Test#1234").expect("add");
        let raw = std::fs::read(files.join(&stored)).expect("read");
        assert!(!raw.windows(secret.len()).any(|w| w == secret), "لا نص مفهوم على القرص");
    }

    #[test]
    fn list_counts_only_sealed_files() {
        let (dir, files) = temp_files_dir("list");
        let _guard = Guard { dir };
        let a = add_media_file(&files, b"one", "Test#1234").expect("add a");
        let b = add_media_file(&files, b"two", "Test#1234").expect("add b");
        std::fs::write(files.join("notes.txt"), b"stray").expect("stray");
        let mut expected = vec![a, b];
        expected.sort();
        assert_eq!(list_media_files(&files), expected, "الغريب غير المشفر لا يُعَد");
        assert!(list_media_files(&files.join("missing")).is_empty());
    }
}
