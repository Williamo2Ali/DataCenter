// دورة القاعدة الحية (الشريحة 2 — طبقة جديدة بجانب القائم، بلا توصيل بالأوامر بعد).
// الفتح: فك الحمولة للذاكرة (`:memory:` — لا ملف مؤقت على القرص أبداً، رفض نهائي للمؤقت النصي).
// الحفظ: تسلسل مباشر (serialize) → تشفير → كتابة الحاوية + تحديث الترويسة — مع كل عملية معدِّلة.
// المحفوظ على القرص مشفر دائماً — لا فقدان إلا مسودة نموذج غير مرسلة.
// ملاحظة: لقطة `onPause` التلقائية تحتاج سجل المستودعات المفتوحة — تُوصَّل مع شريحة التوصيل.

use super::container::{
    RepoHeader, create_container_bytes, decrypt_container_payload, read_header_from_bytes,
};
use super::{create_schema, quoted, seed_repo_structure};
use rusqlite::{Connection, MAIN_DB};
use std::path::Path;

/// أصغر حمولة SQLite صالحة (الترويسة 100 بايت) — ما دونها مرفوض قبل التسلسل العكسي.
const MIN_SQLITE_BYTES: usize = 100;

/// مستودع مفتوح: الترويسة (للعرض) + قاعدة الذاكرة (للعمل) + تحذير محتمل.
pub(crate) struct OpenedVault {
    pub(crate) header: RepoHeader,
    pub(crate) conn: Connection,
    /// تحذير صريح عند اختلاف الترويسة عن الداخل — الداخل معتمَد دائماً.
    pub(crate) warning: Option<String>,
}

fn count_rows(conn: &Connection, table: &str) -> Result<u64, String> {
    let sql = format!("SELECT COUNT(*) FROM {}", quoted(table));
    let n: i64 = conn
        .query_row(&sql, [], |row| row.get(0))
        .map_err(|_| "بنية الحاوية غير متوقعة.".to_string())?;
    Ok(n.max(0) as u64)
}

/// إعادة حساب العدادات من الداخل — المصدر الوحيد المعتمَد.
// filesCount من جدول documents مؤقتاً حتى شريحة الوسائط (files/*.enc).
pub(crate) fn refresh_counts(conn: &Connection, header: &mut RepoHeader) -> Result<(), String> {
    header.people_count = count_rows(conn, "peoples")?;
    header.files_count = count_rows(conn, "documents")?;
    Ok(())
}

/// تسلسل قاعدة الذاكرة إلى بايتات — مباشرة بلا أي ملف وسيط.
pub(crate) fn payload_from_memory(conn: &Connection) -> Result<Vec<u8>, String> {
    let data = conn
        .serialize(MAIN_DB)
        .map_err(|_| "تعذر تسلسل قاعدة البيانات.".to_string())?;
    Ok(data.to_vec())
}

/// فتح قاعدة ذاكرة من حمولة مفكوكة — `:memory:` فقط، والتالف مرفوض.
pub(crate) fn memory_from_payload(payload: &[u8]) -> Result<Connection, String> {
    if payload.len() < MIN_SQLITE_BYTES || &payload[0..6] != b"SQLite" {
        return Err("حمولة الحاوية تالفة.".to_string());
    }
    let mut conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    conn.deserialize_read_exact(MAIN_DB, payload, payload.len(), false)
        .map_err(|_| "حمولة الحاوية تالفة.".to_string())?;
    Ok(conn)
}

/// الحفظ الكامل — مع كل عملية معدِّلة: عدادات → تسلسل → تشفير → كتابة.
// الترتيب مقصود: العدّ قبل التسلسل، لأن التسلسل المباشر (NOCOPY) على اتصال
// ملفي بنمط WAL قد يترك الاتصال بحالة ترفض الاستعلامات اللاحقة.
pub(crate) fn save_vault_file(
    path: &Path,
    header: &mut RepoHeader,
    conn: &Connection,
    password: &str,
) -> Result<(), String> {
    refresh_counts(conn, header)?;
    let payload = payload_from_memory(conn)?;
    let bytes = create_container_bytes(header, &payload, password)?;
    std::fs::write(path, &bytes).map_err(|_| "تعذر كتابة ملف الحاوية.".to_string())
}

/// الفتح الكامل: ملف → ترويسة → فك → ذاكرة → إعادة حساب → مقارنة.
/// تطابق صمت، واختلاف تجاهلٌ للداخل مع تحذير صريح. كلمة خاطئة/عبث = رفض.
pub(crate) fn open_vault_file(path: &Path, password: &str) -> Result<OpenedVault, String> {
    let raw = std::fs::read(path).map_err(|_| "ملف الحاوية غير موجود.".to_string())?;
    let mut header = read_header_from_bytes(&raw)?;
    let payload = decrypt_container_payload(&raw, password)?;
    let conn = memory_from_payload(&payload)?;
    let mut actual = header.clone();
    refresh_counts(&conn, &mut actual)?;
    let warning = if actual.people_count != header.people_count
        || actual.files_count != header.files_count
    {
        header.people_count = actual.people_count;
        header.files_count = actual.files_count;
        Some("الترويسة كانت مخالفة للداخل — اعتُمِد الداخل.".to_string())
    } else {
        None
    };
    Ok(OpenedVault { header, conn, warning })
}

// ================= اختبارات الشريحة 2 =================
#[cfg(test)]
mod tests {
    use super::super::container::{new_header, overwrite_header_file};
    use super::*;

    fn seeded_memory() -> Connection {
        let conn = Connection::open_in_memory().expect("memory db");
        create_schema(&conn).expect("schema");
        seed_repo_structure(&conn, &[], true).expect("seed");
        conn
    }

    fn temp_case(name: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("repo_store_{name}_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("repo.vault");
        (dir, path)
    }

    struct Guard {
        dir: std::path::PathBuf,
    }
    impl Drop for Guard {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    const INSERT_PERSON: &str = "INSERT INTO peoples (id, name, name_en, relation, relation_en, sort_order, created_at, updated_at) VALUES (?1, ?2, '', '', '', 1, 0, 0)";

    #[test]
    fn memory_payload_roundtrip_without_any_file() {
        let conn = seeded_memory();
        let payload = payload_from_memory(&conn).expect("serialize");
        // حمولة SQLite حقيقية — لا أثر نصي خارجي مطلوب هنا، فقط السلامة.
        assert!(payload.len() >= MIN_SQLITE_BYTES);
        let back = memory_from_payload(&payload).expect("deserialize");
        let n: i64 = back
            .query_row("SELECT COUNT(*) FROM peoples", [], |r| r.get(0))
            .expect("count");
        assert_eq!(n, 1);
        let tabs: i64 = back
            .query_row("SELECT COUNT(*) FROM tabs", [], |r| r.get(0))
            .expect("tabs");
        assert_eq!(tabs, 7);
    }

    #[test]
    fn file_cycle_persists_writes_and_syncs_header() {
        let (dir, path) = temp_case("cycle");
        let _guard = Guard { dir };
        let mut header = new_header("repo-1", "الدورة").expect("header");
        let conn = seeded_memory();
        save_vault_file(&path, &mut header, &conn, "Test#1234").expect("save");
        assert_eq!(header.people_count, 1, "العداد من الداخل مع أول حفظ");
        assert_eq!(header.files_count, 0);

        let mut opened = open_vault_file(&path, "Test#1234").expect("open");
        assert!(opened.warning.is_none(), "التطابق صمت");
        assert_eq!(opened.header.people_count, 1);
        opened
            .conn
            .execute(INSERT_PERSON, ["p-2", "أحمد"])
            .expect("insert");
        opened
            .conn
            .execute(
                "INSERT INTO documents (id, file_name, title) VALUES ('d-1', 'a.pdf', 'وثيقة')",
                [],
            )
            .expect("insert doc");
        save_vault_file(&path, &mut opened.header, &opened.conn, "Test#1234").expect("save2");
        assert_eq!(opened.header.people_count, 2, "الترويسة محدثة مع كل كتابة");
        assert_eq!(opened.header.files_count, 1);

        let reopened = open_vault_file(&path, "Test#1234").expect("reopen");
        let name: String = reopened
            .conn
            .query_row("SELECT name FROM peoples WHERE id = 'p-2'", [], |r| r.get(0))
            .expect("row persisted");
        assert_eq!(name, "أحمد");
        assert_eq!(reopened.header.people_count, 2);
        assert!(reopened.warning.is_none());
    }

    #[test]
    fn open_adopts_inside_on_header_mismatch() {
        let (dir, path) = temp_case("mismatch");
        let _guard = Guard { dir };
        let mut header = new_header("repo-1", "العبث").expect("header");
        save_vault_file(&path, &mut header, &seeded_memory(), "Test#1234").expect("save");
        // عبث يدوي في الترويسة فقط.
        let mut tampered = header.clone();
        tampered.people_count = 99;
        overwrite_header_file(&path, &tampered).expect("tamper");
        let opened = open_vault_file(&path, "Test#1234").expect("open");
        assert!(opened.warning.is_some(), "الاختلاف تحذير صريح");
        assert_eq!(opened.header.people_count, 1, "الداخل معتمَد");
    }

    #[test]
    fn open_rejects_wrong_password_truncated_and_garbage() {
        let (dir, path) = temp_case("reject");
        let _guard = Guard { dir };
        let mut header = new_header("repo-1", "الرفض").expect("header");
        save_vault_file(&path, &mut header, &seeded_memory(), "Test#1234").expect("save");
        assert!(open_vault_file(&path, "wrong-pass").is_err(), "الكلمة الخاطئة تُرفَض");
        // ملف مبتور.
        let raw = std::fs::read(&path).expect("read");
        std::fs::write(&path, &raw[..100]).expect("truncate");
        assert!(open_vault_file(&path, "Test#1234").is_err(), "المبتور مرفوض");
        // حمولة سليمة التشفير فاسدة المعنى.
        let garbage = create_container_bytes(&header, b"not-a-database-at-all-just-garbage-bytes-0123456789-abcdefghijklmnopqrstuvwxyz", "Test#1234").expect("garbage container");
        std::fs::write(&path, &garbage).expect("write garbage");
        assert!(open_vault_file(&path, "Test#1234").is_err(), "الحمولة الفاسدة مرفوضة");
        // حمولة فارغة مرفوضة بلا ذعر.
        assert!(memory_from_payload(&[]).is_err());
        assert!(memory_from_payload(b"tiny").is_err());
    }

    #[test]
    fn save_requires_password() {
        let (dir, path) = temp_case("nopass");
        let _guard = Guard { dir };
        let mut header = new_header("repo-1", "بلا كلمة").expect("header");
        assert!(save_vault_file(&path, &mut header, &seeded_memory(), "").is_err());
        assert!(!path.exists(), "المرفوض لا يكتب شيئاً");
    }

    #[test]
    fn no_temp_file_touches_disk() {
        // الدورة كاملة (حفظ/فتح/حفظ) — الملف الوحيد على القرص هو الحاوية نفسها.
        let (dir, path) = temp_case("notemp");
        let _guard = Guard { dir: dir.clone() };
        let mut header = new_header("repo-1", "بلا مؤقت").expect("header");
        let conn = seeded_memory();
        save_vault_file(&path, &mut header, &conn, "Test#1234").expect("save");
        let opened = open_vault_file(&path, "Test#1234").expect("open");
        save_vault_file(&path, &mut header.clone(), &opened.conn, "Test#1234").expect("save2");
        let mut entries: Vec<String> = std::fs::read_dir(&dir)
            .expect("read dir")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        entries.sort();
        assert_eq!(entries, vec!["repo.vault".to_string()], "لا ملف مؤقت نصي أبداً");
    }

    #[test]
    fn saved_bytes_hold_no_plaintext_payload() {
        // بوابة القبول 2 على مستوى الدورة: سرّ في صف يُحفَظ ثم يُفحَص خاماً.
        let (dir, path) = temp_case("scan");
        let _guard = Guard { dir };
        let mut header = new_header("repo-1", "الفحص").expect("header");
        let conn = seeded_memory();
        conn.execute(INSERT_PERSON, ["p-9", "SEKRIT-NAME-ZZZ-12345"]).expect("insert");
        save_vault_file(&path, &mut header, &conn, "Test#1234").expect("save");
        let raw = std::fs::read(&path).expect("read");
        assert!(raw.len() > 4096);
        let secret = b"SEKRIT-NAME-ZZZ-12345";
        let leaked = raw.windows(secret.len()).any(|w| w == secret);
        assert!(!leaked, "نص الصف ظاهر في بايتات القرص الخام");
    }
}
