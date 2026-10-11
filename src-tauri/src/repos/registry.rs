// سجل المستودعات المفتوحة (ذاكرة الجلسة فقط): القاعدة الحية + كلمة إعادة الحفظ.
// يُمسَح بالإغلاق الصريح — والمحفوظ على القرص مشفر دائماً فلا فقدان.
// الكلمة في الذاكرة فقط (كذاكرة الكلمات المثبتة في lock.rs) — لا تُكتَب أبداً.
// كل أوامر الكتابة (لاحقاً) تمر عبر `with_open`: عملية ثم حفظ مشفر + ترويسة.

use super::container::RepoHeader;
use super::store::{open_vault_file, save_vault_file};
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

pub(crate) struct OpenEntry {
    pub(crate) conn: Connection,
    pub(crate) header: RepoHeader,
    password: String,
    pub(crate) container: PathBuf,
    pub(crate) files_dir: PathBuf,
}

static OPEN_REPOS: LazyLock<Mutex<HashMap<String, OpenEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn lock_map() -> Result<std::sync::MutexGuard<'static, HashMap<String, OpenEntry>>, String> {
    OPEN_REPOS.lock().map_err(|_| "تعذر الوصول لجلسة المستودعات.".to_string())
}

/// فتح بايتات حاوية إلى مدخل جاهز للتسجيل (فك + ذاكرة + مزامنة مع الداخل).
pub(crate) fn build_entry(
    container: &Path,
    files_dir: &Path,
    password: &str,
) -> Result<OpenEntry, String> {
    let opened = open_vault_file(container, password)?;
    Ok(OpenEntry {
        conn: opened.conn,
        header: opened.header,
        password: password.to_string(),
        container: container.to_path_buf(),
        files_dir: files_dir.to_path_buf(),
    })
}

pub(crate) fn register_open(id: &str, entry: OpenEntry) {
    if let Ok(mut map) = OPEN_REPOS.lock() {
        map.insert(id.to_string(), entry);
    }
}

pub(crate) fn is_open(id: &str) -> bool {
    OPEN_REPOS.lock().map(|map| map.contains_key(id)).unwrap_or(false)
}

/// قراءة من المفتوح بلا حفظ — للمسار السريع وبناء اللقطات.
pub(crate) fn dto_with_open<T>(
    id: &str,
    password: &str,
    f: impl FnOnce(&Connection, &RepoHeader) -> Result<T, String>,
) -> Result<T, String> {
    let map = lock_map()?;
    let entry = map.get(id).ok_or("المستودع غير مفتوح — افتحه أولاً.".to_string())?;
    if entry.password != password {
        return Err("كلمة مرور المستودع غير صحيحة.".to_string());
    }
    f(&entry.conn, &entry.header)
}

/// كتابة على المفتوح ثم حفظ مشفر + ترويسة — نمط كل أوامر التعديل.
/// نسخة `&mut` (للمعاملات) — `with_open` الأصلية للمسارات التي لا تحتاجها.
pub(crate) fn with_open_conn<T>(
    id: &str,
    password: &str,
    op: impl FnOnce(&mut Connection) -> Result<T, String>,
) -> Result<T, String> {
    let mut map = lock_map()?;
    let entry = map.get_mut(id).ok_or("المستودع غير مفتوح — افتحه أولاً.".to_string())?;
    if entry.password != password {
        return Err("كلمة مرور المستودع غير صحيحة.".to_string());
    }
    let out = op(&mut entry.conn)?;
    save_vault_file(&entry.container, &mut entry.header, &entry.conn, &entry.password)?;
    Ok(out)
}

/// كتابة على المفتوح ثم حفظ مشفر + ترويسة — للمسارات التي تحتاج الترويسة نفسها.
/// (إعادة التسمية مثلاً — بقية الأوامر عبر `with_open_conn` و`mutate_repo`.)
pub(crate) fn with_open<T>(
    id: &str,
    password: &str,
    op: impl FnOnce(&Connection, &mut RepoHeader) -> Result<T, String>,
) -> Result<T, String> {
    let mut map = lock_map()?;
    let entry = map.get_mut(id).ok_or("المستودع غير مفتوح — افتحه أولاً.".to_string())?;
    if entry.password != password {
        return Err("كلمة مرور المستودع غير صحيحة.".to_string());
    }
    let out = op(&entry.conn, &mut entry.header)?;
    save_vault_file(&entry.container, &mut entry.header, &entry.conn, &entry.password)?;
    Ok(out)
}

/// كلمة الجلسة المفتوحة (للقراءات التي لا تستقبل كلمة — كالمعاينة).
/// نسخة ذاكرة فقط — بلا كتابة ولا حفظ.
pub(crate) fn open_password(id: &str) -> Option<String> {
    OPEN_REPOS
        .lock()
        .ok()
        .and_then(|map| map.get(id).map(|entry| entry.password.clone()))
}
/// إغلاق: إسقاط القاعدة والكلمة من الذاكرة (القرص محفوظ مع كل كتابة أصلاً).
pub(crate) fn close_open(id: &str) {
    if let Ok(mut map) = OPEN_REPOS.lock() {
        map.remove(id);
    }
}

/// لقطة الأمان (يُوصَّل بخطاف onPause لاحقاً): حفظ الكل — تُرجَع معرفات الفاشلة فقط.
/// فارغة = الكل سليم. الفشل هنا لا يُسقط البقية (حزام إضافي بأفضل جهد).
pub(crate) fn snapshot_all_open() -> Vec<String> {
    let Ok(mut map) = OPEN_REPOS.lock() else {
        return vec!["<registry>".to_string()];
    };
    let mut failed = Vec::new();
    for (id, entry) in map.iter_mut() {
        if save_vault_file(&entry.container, &mut entry.header, &entry.conn, &entry.password).is_err() {
            failed.push(id.clone());
        }
    }
    failed
}

// ================= اختبارات السجل =================
#[cfg(test)]
mod tests {
    use super::super::container::new_header;
    use super::super::store::open_vault_file as reopen_file;
    use super::super::{create_schema, seed_repo_structure};
    use super::*;

    fn temp_container(name: &str) -> (std::path::PathBuf, PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!("repo_registry_{name}_{}", std::process::id()));
        let _ = std::fs::create_dir_all(dir.join("files"));
        let container = dir.join("repo.vault");
        let _ = std::fs::create_dir_all(dir.join("files"));
        let files = dir_join_files(&dir);
        let conn = Connection::open_in_memory().expect("memory");
        create_schema(&conn).expect("schema");
        seed_repo_structure(&conn, &[], true).expect("seed");
        let mut header = new_header("reg-1", "السجل").expect("header");
        save_vault_file(&container, &mut header, &conn, "Test#1234").expect("save");
        (dir, container, files)
    }

    fn dir_join_files(dir: &Path) -> PathBuf {
        dir.join("files")
    }

    struct Guard {
        dir: std::path::PathBuf,
        id: String,
    }
    impl Drop for Guard {
        fn drop(&mut self) {
            close_open(&self.id);
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn register_write_close_cycle() {
        let (dir, container, files) = temp_container("cycle");
        let id = "reg-cycle";
        let _guard = Guard { dir, id: id.to_string() };
        register_open(id, build_entry(&container, &files, "Test#1234").expect("entry"));
        assert!(is_open(id));
        let n = with_open(id, "Test#1234", |conn, _| {
            conn.execute(
                "INSERT INTO peoples (id, name, name_en, relation, relation_en, sort_order, created_at, updated_at) VALUES ('r1', 'س', '', '', '', 1, 0, 0)",
                [],
            )
            .map_err(|e| e.to_string())?;
            Ok(conn.query_row("SELECT COUNT(*) FROM peoples", [], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?)
        })
        .expect("write");
        assert_eq!(n, 2);
        // الحفظ تم مع العملية: إعادة الفتح من القرص تجد الصف والعداد محدثاً.
        let reopened = reopen_file(&container, "Test#1234").expect("reopen");
        assert_eq!(reopened.header.people_count, 2);
        close_open(id);
        assert!(!is_open(id));
        assert!(with_open(id, "Test#1234", |_, _| Ok(())).is_err(), "المغلق مرفوض");
    }

    #[test]
    fn wrong_password_writes_nothing() {
        let (dir, container, files) = temp_container("wrongpw");
        let id = "reg-wrongpw";
        let _guard = Guard { dir, id: id.to_string() };
        register_open(id, build_entry(&container, &files, "Test#1234").expect("entry"));
        let before = std::fs::read(&container).expect("read");
        let err = with_open(id, "nope", |conn, _| {
            conn.execute("DELETE FROM peoples", []).map_err(|e| e.to_string())?;
            Ok(())
        })
        .expect_err("must fail");
        assert_eq!(err, "كلمة مرور المستودع غير صحيحة.");
        assert_eq!(std::fs::read(&container).expect("read"), before, "المرفوض لا يكتب شيئاً");
    }

    #[test]
    fn unopened_and_snapshot_behave() {
        assert!(!is_open("reg-never"));
        assert!(dto_with_open("reg-never", "x", |_, _| Ok(())).is_err());
        assert!(snapshot_all_open().is_empty(), "الفارغ سليم");
        let (dir, container, files) = temp_container("snap");
        let id = "reg-snap";
        let _guard = Guard { dir, id: id.to_string() };
        register_open(id, build_entry(&container, &files, "Test#1234").expect("entry"));
        assert!(snapshot_all_open().is_empty(), "المحفوظ لقطته ناجحة");
        assert!(build_entry(&container, &files, "bad-pass").is_err(), "الدخول بالخاطئة مرفوض");
    }
}
