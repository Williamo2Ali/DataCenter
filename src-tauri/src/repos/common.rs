// أدوات مشتركة بين كل وحدات المستودعات: الوقت والمعرّفات (UUID) والمسارات
// وفهرس المستودعات، وبوابة الكتابة وفتح قاعدة البيانات، وتنظيف/فحص المدخلات.

use rusqlite::Connection;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use super::*;

pub(super) fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

pub(super) fn hex_decode(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("بيانات القفل تالفة.".to_string());
    }
    let mut out = Vec::with_capacity(hex.len() / 2);
    let bytes = hex.as_bytes();
    let val = |c: u8| -> Result<u8, String> {
        match c {
            b'0'..=b'9' => Ok(c - b'0'),
            b'a'..=b'f' => Ok(c - b'a' + 10),
            b'A'..=b'F' => Ok(c - b'A' + 10),
            _ => Err("بيانات القفل تالفة.".to_string()),
        }
    };
    let mut i = 0;
    while i < bytes.len() {
        let hi = val(bytes[i])?;
        let lo = val(bytes[i + 1])?;
        out.push((hi << 4) | lo);
        i += 2;
    }
    Ok(out)
}

// ================= المسارات =================

pub(super) fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// الطابع الزمني للتخزين في SQLite (INTEGER ثواني) — rusqlite لا يقبل `u64`.
pub(super) fn now_db() -> i64 {
    now_secs() as i64
}

/// معرّف الصفوف: UUID v4 بالصيغة المقسّمة (8-4-4-4-12 = 36 حرفاً) —
/// نفس مخرجات `generateId()` في `src/utils/helpers.ts` حرفياً.
/// لا يُشتق من أي اسم — مستقر أمام إعادة التسمية ومقروء في محرر SQLite.
pub(super) fn new_guid() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| "تعذر توليد معرّف فريد.".to_string())?;
    // بصمتا الإصدار والمتغير حسب RFC 4122 (v4 عشوائي حقيقي).
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let h = hex_encode(&bytes);
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32]
    ))
}

/// التحقق من صيغة UUID مقسّم قادم من الواجهة (الواجهة هي من تولّد عبر `generateId`).
/// الفارغ مرفوض هنا — المستدعي يقرر التوليد الاحتياطي قبل الوصول.
pub(super) fn ensure_uuid(value: &str) -> Result<String, String> {
    let v = value.trim().to_lowercase();
    let b = v.as_bytes();
    if b.len() != 36 || b[8] != b'-' || b[13] != b'-' || b[18] != b'-' || b[23] != b'-' {
        return Err("المعرّف غير صالح (UUID متوقع).".to_string());
    }
    for (i, c) in b.iter().enumerate() {
        if [8, 13, 18, 23].contains(&i) {
            continue;
        }
        if !c.is_ascii_hexdigit() {
            return Err("المعرّف غير صالح (UUID متوقع).".to_string());
        }
    }
    Ok(v)
}

pub(super) fn app_root(app: &AppHandle) -> Result<PathBuf, String> {
    // الهوية هي المسار مباشرة: %APPDATA%/com.DataCenter/repos — بلا مجلد وسيط.
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "تعذر تحديد مجلد بيانات التطبيق.".to_string())?)
}

pub(super) fn repos_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app_root(app)?.join(REPOS_DIR);
    std::fs::create_dir_all(&root).map_err(|_| "تعذر إنشاء مجلد المستودعات.".to_string())?;
    Ok(root)
}

pub(super) fn read_index(app: &AppHandle) -> Result<Vec<RepoMeta>, String> {
    let root = repos_root(app)?;
    let path = root.join(INDEX_FILE);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read(&path).map_err(|_| "تعذر قراءة فهرس المستودعات.".to_string())?;
    serde_json::from_slice(&raw).map_err(|_| "فهرس المستودعات تالف.".to_string())
}

pub(super) fn write_index(app: &AppHandle, index: &[RepoMeta]) -> Result<(), String> {
    let root = repos_root(app)?;
    let raw = serde_json::to_vec_pretty(index).map_err(|_| "تعذر حفظ الفهرس.".to_string())?;
    std::fs::write(root.join(INDEX_FILE), raw).map_err(|_| "تعذر حفظ الفهرس.".to_string())
}

pub(super) fn sanitize_id(name: &str) -> String {
    let mut id: String = name
        .trim()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c.to_lowercase().to_string()
            } else if c.is_whitespace() {
                "-".to_string()
            } else {
                String::new()
            }
        })
        .collect();
    id.truncate(60);
    while id.ends_with('-') || id.ends_with('.') {
        id.pop();
    }
    if id.is_empty() {
        id = format!("repo-{}", now_secs());
    }
    id
}

pub(super) fn repo_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || id.contains('/')
        || id.contains('\\')
        || id.contains("..")
        || id == INDEX_FILE
    {
        return Err("معرف المستودع غير صالح.".to_string());
    }
    Ok(repos_root(app)?.join(id))
}

// ================= التحرير الكامل (حقول + أفراد) =================
// كل عملية تتحقق من كلمة المرور (إن كان المستودع مقفلاً) ثم تعيد
// بيانات المستودع كاملة ليُحدَّث العرض دون إعادة فتح.

/// التحقق من صلاحية الوصول للكتابة: يفشل إن كان مقفلاً دون كلمة صحيحة.
pub(super) fn gate_repo_write(app: &AppHandle, id: &str, password: Option<String>) -> Result<(), String> {
    let (_, meta) = read_repo_file(app, id)?;
    if meta.is_locked {
        match password {
            Some(p) if !p.is_empty() => verify_lock_password_cached(id, &meta, &p)?,
            _ => return Err("هذا المستودع مقفل — أدخل كلمة مروره.".to_string()),
        }
    }
    Ok(())
}

pub(super) fn open_repo_db(app: &AppHandle, id: &str) -> Result<Connection, String> {
    ensure_supported_version(app, id)?;
    let dir = repo_dir(app, id)?;
    let db_path = dir.join(DB_FILE);
    if !db_path.exists() {
        return Err("قاعدة بيانات المستودع غير موجودة.".to_string());
    }
    let conn = Connection::open(db_path).map_err(|e| format!("تعذر فتح قاعدة البيانات: {e}"))?;
    // ترقية إضافية فقط: عمود الحذف الناعم لقواعد v3 المبكرة — بلا مساس بأي بيانات.
    ensure_tabs_is_deleted(&conn)?;
    ensure_account_link_columns(&conn)?;
    ensure_hidden_columns(&conn)?;
    ensure_column_labels(&conn)?;
    ensure_deleted_columns(&conn)?;
    ensure_default_contact_columns(&conn)?;
    ensure_document_source_columns(&conn)?;
    Ok(conn)
}

/// رفض المستودعات القديمة: البيانات وهمية وتُحذف وتُعاد — بلا ترحيل.
pub(super) fn ensure_supported_version(app: &AppHandle, id: &str) -> Result<(), String> {
    let (_, meta) = read_repo_file(app, id)?;
    if meta.schema_version < SCHEMA_VERSION {
        return Err("نسخة قاعدة البيانات قديمة — احذف المستودع وأعد إنشاءه.".to_string());
    }
    Ok(())
}

/// تاريخ ISO (YYYY-MM-DD): فارغ مسموح، وغير الفارغ يجب أن يطابق النمط والأرقام.
pub(super) fn ensure_iso_date(value: &str) -> Result<String, String> {
    let v = value.trim().to_string();
    if v.is_empty() {
        return Ok(String::new());
    }
    let bytes = v.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return Err("التاريخ يجب أن يكون بصيغة YYYY-MM-DD.".to_string());
    }
    for (i, b) in bytes.iter().enumerate() {
        if i == 4 || i == 7 {
            continue;
        }
        if !b.is_ascii_digit() {
            return Err("التاريخ يجب أن يكون بصيغة YYYY-MM-DD.".to_string());
        }
    }
    Ok(v)
}

/// سنة التخرج: فارغة أو 1900–2100.
pub(super) fn ensure_grad_year(value: Option<i64>) -> Result<Option<i64>, String> {
    match value {
        None => Ok(None),
        Some(y) if (1900..=2100).contains(&y) => Ok(Some(y)),
        Some(_) => Err("سنة التخرج يجب أن تكون بين 1900 و2100.".to_string()),
    }
}

/// نص اختياري بحد 80 حرفاً مع التقليم.
pub(super) fn clean_text80(value: &str) -> String {
    value.trim().chars().take(80).collect()
}

/// نص طويل (عناوين/ملاحظات) بحد 500 حرف مع التقليم.
pub(super) fn clean_text500(value: &str) -> String {
    value.trim().chars().take(500).collect()
}

pub(super) fn ensure_record_exists(conn: &Connection, record_id: &str) -> Result<(), String> {
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM peoples WHERE id = ?1", [record_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("السجل غير موجود.".to_string());
    }
    Ok(())
}

pub(super) fn quoted(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', ""))
}
