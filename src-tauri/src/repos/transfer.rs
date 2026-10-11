// نقل المستودعات: تصدير/استيراد قاعدة البيانات (مسار أو بايتات) وتثبيتها داخل المستودع.

use rusqlite::Connection;
use tauri::AppHandle;
use super::*;

/// تصدير قاعدة بيانات المستودع (SQLite) إلى مسار يختاره المستخدم.
/// سجل WAL يُدمَج أولاً (checkpoint) حتى تكون النسخة مكتملة ومستقلة.
#[tauri::command]
pub fn export_repo_db(
    app: AppHandle,
    id: String,
    password: Option<String>,
    dest_path: String,
) -> Result<(), String> {
    if dest_path.trim().is_empty() {
        return Err("مسار الحفظ غير صالح.".to_string());
    }
    let dir = repo_dir(&app, &id)?;
    if dir.join(CONTAINER_FILE).exists() {
        // مقفل: تسلسل من الجلسة (بلا WAL ولا ملف نصي) وكتابته للوجهة المختارة صراحة.
        let bytes = read_repo(&app, &id, password.clone(), |conn| {
            store::payload_from_memory(conn)
        })?;
        std::fs::write(dest_path.trim(), &bytes).map_err(|_| "تعذر حفظ نسخة قاعدة البيانات.".to_string())?;
        return Ok(());
    }
    gate_repo_write(&app, &id, password)?;
    let db_path = dir.join(DB_FILE);
    if !db_path.exists() {
        return Err("قاعدة بيانات المستودع غير موجودة.".to_string());
    }
    let conn = open_repo_db(&app, &id)?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("تعذر تجهيز النسخة: {e}"))?;
    drop(conn);
    std::fs::copy(&db_path, dest_path.trim()).map_err(|_| "تعذر حفظ نسخة قاعدة البيانات.".to_string())?;
    Ok(())
}

/// إرجاع بايتات قاعدة البيانات بعد دمج WAL.
/// تدفق أندرويد: الوجهة `content://` لا تُكتَب من Rust — تُقرأ البايتات هنا
/// وتكتبها الواجهة في الوجهة المختارة (ترخيص المنتقي يغطيها).
#[tauri::command]
pub fn export_repo_bytes(
    app: AppHandle,
    id: String,
    password: Option<String>,
) -> Result<Vec<u8>, String> {
    let dir = repo_dir(&app, &id)?;
    if dir.join(CONTAINER_FILE).exists() {
        // مقفل: بايتات من الجلسة مباشرة (التدفق نفسه للوجهات content://).
        return read_repo(&app, &id, password.clone(), |conn| {
            store::payload_from_memory(conn)
        });
    }
    gate_repo_write(&app, &id, password)?;
    let db_path = dir.join(DB_FILE);
    if !db_path.exists() {
        return Err("قاعدة بيانات المستودع غير موجودة.".to_string());
    }
    let conn = open_repo_db(&app, &id)?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| format!("تعذر تجهيز النسخة: {e}"))?;
    drop(conn);
    std::fs::read(&db_path).map_err(|_| "تعذر قراءة نسخة قاعدة البيانات.".to_string())
}

/// استيراد نسخة قاعدة بيانات (SQLite) لتحل محل بيانات المستودع الحالية.
/// يتحقق أولاً أن الملف نسخة مستودع صالحة (جداول v3 — أي نسخة أقدم مرفوضة)،
/// ويحتفظ بنسخة احتياطية واحدة من الحالية (data.db.bak)، ويزيل بقايا WAL.
#[tauri::command]
pub fn import_repo_db(
    app: AppHandle,
    id: String,
    password: Option<String>,
    src_path: String,
) -> Result<RepoData, String> {
    // المقفل يوثّق داخل التثبيت (فك تجريبي) — البوابة القديمة للنصي فقط.
    let dir = repo_dir(&app, &id)?;
    if !dir.join(CONTAINER_FILE).exists() {
        gate_repo_write(&app, &id, password.clone())?;
    }
    let src = src_path.trim().to_string();
    if src.is_empty() {
        return Err("ملف النسخة غير محدد.".to_string());
    }
    if !std::path::Path::new(&src).exists() {
        return Err("ملف النسخة غير موجود.".to_string());
    }
    let bytes = std::fs::read(&src).map_err(|_| "الملف المختار ليس نسخة مستودع صالحة.".to_string())?;
    install_repo_db_bytes(&app, &id, password, &bytes)
}

/// تثبيت نسخة قاعدة بيانات من بايتات (تدفق أندرويد: القراءة في الواجهة عبر content://).
/// نفس فحوصات الاستيراد: جداول v3 + نسخة bak + تنظيف WAL.
pub(super) fn install_repo_db_bytes(app: &AppHandle, id: &str, password: Option<String>, bytes: &[u8]) -> Result<RepoData, String> {
    if bytes.is_empty() {
        return Err("ملف النسخة فارغ.".to_string());
    }
    let dir = repo_dir(app, id)?;
    let container = dir.join(CONTAINER_FILE);
    if container.exists() {
        // مقفل: تحقق من النسخة ثم أعد ختمها بكلمة المستودع (الوسائط خارج النطاق كالسابق —
        // الاستيراد يستبدل القاعدة فقط، وتماسك الملفات مسؤولية المستورد كما في النصي).
        let pw = match &password {
            Some(p) if !p.is_empty() => p.clone(),
            _ => return Err("أدخل كلمة مرور المستودع.".to_string()),
        };
        let tmp = store::memory_from_payload(bytes)
            .map_err(|_| "الملف المختار ليس نسخة مستودع صالحة.".to_string())?;
        for table in ["tabs", "peoples", "accounts", "documents", "passports", "study", "national_ids", "civil", "contacts", "custom_columns"] {
            let n: i64 = tmp
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |r| r.get(0),
                )
                .map_err(|_| "الملف المختار ليس نسخة مستودع صالحة.".to_string())?;
            if n == 0 {
                return Err("الملف المختار ليس نسخة مستودع صالحة. النسخ القديمة غير مدعومة — أعد إنشاء المستودع.".to_string());
            }
        }
        let raw = std::fs::read(&container).map_err(|_| "ملف الحاوية غير موجود.".to_string())?;
        let mut header = container::read_header_from_bytes(&raw)?;
        // إثبات الملكية قبل الاستبدال (كلمة خاطئة = لا شيء يحدث).
        container::decrypt_container_payload(&raw, &pw)
            .map_err(|_| "كلمة مرور المستودع غير صحيحة — لم يتم استيراد أي شيء.".to_string())?;
        let _ = std::fs::copy(&container, dir.join("repo.vault.bak"));
        store::save_vault_file(&container, &mut header, &tmp, &pw)?;
        drop(tmp);
        registry::close_open(id);
        return open_repo(app.clone(), id.to_string(), password);
    }
    let tmp = dir.join("import.tmp");
    std::fs::write(&tmp, bytes).map_err(|_| "تعذر تجهيز ملف النسخة.".to_string())?;
    let result = install_repo_db_path(app, id, password.clone(), &tmp);
    let _ = std::fs::remove_file(&tmp);
    result
}

/// فحص ملف نسخة (جداول v3) وتثبيته مكان data.db مع bak وتنظيف WAL.
pub(super) fn install_repo_db_path(app: &AppHandle, id: &str, password: Option<String>, src: &std::path::Path) -> Result<RepoData, String> {
    {
        let check = Connection::open_with_flags(
            src,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|_| "الملف المختار ليس نسخة مستودع صالحة.".to_string())?;
        for table in ["tabs", "peoples", "accounts", "documents", "passports", "study", "national_ids", "civil", "contacts", "custom_columns"] {
            let n: i64 = check
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |r| r.get(0),
                )
                .map_err(|_| "الملف المختار ليس نسخة مستودع صالحة.".to_string())?;
            if n == 0 {
                return Err("الملف المختار ليس نسخة مستودع صالحة. النسخ القديمة غير مدعومة — أعد إنشاء المستودع.".to_string());
            }
        }
    }
    let dir = repo_dir(app, id)?;
    let db_path = dir.join(DB_FILE);
    if db_path.exists() {
        let _ = std::fs::copy(&db_path, dir.join("data.db.bak"));
    }
    std::fs::copy(src, &db_path).map_err(|_| "تعذر استيراد نسخة قاعدة البيانات.".to_string())?;
    for sidecar in ["data.db-wal", "data.db-shm", "data.db-journal"] {
        let _ = std::fs::remove_file(dir.join(sidecar));
    }
    open_repo(app.clone(), id.to_string(), password)
}

#[tauri::command]
pub fn import_repo_bytes(
    app: AppHandle,
    id: String,
    password: Option<String>,
    data: Vec<u8>,
) -> Result<RepoData, String> {
    gate_repo_write(&app, &id, password.clone())?;
    install_repo_db_bytes(&app, &id, password, &data)
}
