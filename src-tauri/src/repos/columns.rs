// أعمدة الجداول الثابتة: الإخفاء، الحذف الناعم، واستعادتهما، وتجاوز التسميات.

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tauri::AppHandle;
use super::*;

/// تجاوز تسمية عمود أساسي واحد.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseColumnLabelDto {
    pub column_name: String,
    pub label: String,
    pub label_en: String,
}

/// جدول وسوم الإخفاء الماسح لقواعد v3 المبكرة (إضافة فقط — فارغ = لا مخفي).
pub(super) fn ensure_hidden_columns(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS hidden_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, PRIMARY KEY (table_name, column_name))",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// جدول تجاوزات تسميات الثابتة لقواعد v3 المبكرة (إضافة فقط — فارغ = تسميات الكود).
pub(super) fn ensure_column_labels(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS column_labels (table_name TEXT NOT NULL, column_name TEXT NOT NULL, label TEXT NOT NULL, label_en TEXT NOT NULL DEFAULT '', PRIMARY KEY (table_name, column_name))",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// جدول وسوم الحذف الناعم لقواعد v3 المبكرة (إضافة فقط — فارغ = لا محذوف).
pub(super) fn ensure_deleted_columns(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS deleted_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, PRIMARY KEY (table_name, column_name))",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// الجداول الأساسية القابلة للتمديد (أعمدة إضافية + إخفاء/حذف ناعم + تجاوز تسميات):
/// الأربعة 1-1 + الحسابات وجهات الاتصال (1-كثير — قيم إضافياتها بمفتاح id لا record_id).
pub(super) const EXTENDABLE_CORE_TABLES: [&str; 6] = ["passports", "civil", "national_ids", "study", "accounts", "contacts"];

/// أعمدة النظام المحمية من الإخفاء — مفاتيح الربط والطوابع فقط.
/// (password/kind للحسابات: منطق البطاقة يعتمد عليهما — كشف كلمة المرور ونوعها.
/// وtitle هوية البطاقة وعنوانها الإجباري. وname/nameEn هوية جهة الاتصال.)
pub(super) const HIDE_PROTECTED_COLUMNS: [&str; 11] = [
    "id",
    "record_id",
    "people_id",
    "title",
    "name",
    "name_en",
    "password",
    "kind",
    "sort_order",
    "created_at",
    "updated_at",
];

/// وسوم الإخفاء لجدول أساسي — فارغ دائماً للمخصصة (أعمدتها تُحذف لا تُخفى).
pub(crate) fn load_hidden_columns(conn: &Connection, table_name: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT column_name FROM hidden_columns WHERE table_name = ?1 ORDER BY column_name")
        .map_err(|e| e.to_string())?;
    stmt.query_map([table_name], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// مسح كل وسوم الإخفاء — تستخدمها الاستعادة الافتراضية.
pub(crate) fn clear_hidden_columns(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM hidden_columns", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// وسوم الحذف الناعم لجدول أساسي.
pub(crate) fn load_deleted_columns(conn: &Connection, table_name: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT column_name FROM deleted_columns WHERE table_name = ?1 ORDER BY column_name")
        .map_err(|e| e.to_string())?;
    stmt.query_map([table_name], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// مسح كل وسوم الحذف الناعم — تستخدمها الاستعادة الافتراضية.
pub(crate) fn clear_deleted_columns(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM deleted_columns", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// تجاوزات تسميات جدول أساسي — فارغ دائماً بلا تجاوز.
pub(crate) fn load_base_labels(conn: &Connection, table_name: &str) -> Result<Vec<BaseColumnLabelDto>, String> {
    let mut stmt = conn
        .prepare("SELECT column_name, label, label_en FROM column_labels WHERE table_name = ?1 ORDER BY column_name")
        .map_err(|e| e.to_string())?;
    stmt.query_map([table_name], |r| {
        Ok(BaseColumnLabelDto {
            column_name: r.get(0)?,
            label: r.get(1)?,
            label_en: r.get(2)?,
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())
}

/// مسح كل تجاوزات التسميات — تستخدمها الاستعادة الافتراضية فتعود تسميات الكود.
pub(crate) fn clear_base_labels(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM column_labels", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// تجاوز تسمية عمود أساسي (تحقق + upsert) — يستخدمه الأمر والاختبارات.
pub(crate) fn set_base_label_in(
    conn: &Connection,
    table: &str,
    column: &str,
    label: &str,
    label_en: &str,
) -> Result<(), String> {
    if !EXTENDABLE_CORE_TABLES.contains(&table) {
        return Err("تجاوز التسميات للجداول القابلة للتمديد فقط.".to_string());
    }
    // موجود فعلاً وليس محمياً — نفس بوابة الإخفاء.
    resolve_hide_target(conn, table, column)?;
    let clean_label = label.trim().chars().take(80).collect::<String>();
    if clean_label.is_empty() {
        return Err("التسمية العربية إجبارية.".to_string());
    }
    let clean_en = label_en.trim().chars().take(80).collect::<String>();
    conn.execute(
        "INSERT INTO column_labels (table_name, column_name, label, label_en) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(table_name, column_name) DO UPDATE SET label = excluded.label, label_en = excluded.label_en",
        params![table, column, clean_label, clean_en],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// التحقق المشترك للإخفاء: جدول أساسي 1-1 + عمود موجود فعلاً وليس محمياً.
/// يعيد (نوع العمود نصي؟) لتحديد المسح (`''` للنصوص و`NULL` للعددية).
pub(super) fn resolve_hide_target(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    if !EXTENDABLE_CORE_TABLES.contains(&table) {
        return Err("الإخفاء الماسح للجداول القابلة للتمديد فقط.".to_string());
    }
    if HIDE_PROTECTED_COLUMNS.contains(&column) {
        return Err("عمود نظام محمي من الإخفاء.".to_string());
    }
    // table مضمون من قائمة بيضاء ثابتة — الاستيفاء هنا آمن.
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", quoted(table)))
        .map_err(|e| e.to_string())?;
    let cols: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    match cols.iter().find(|(name, _)| name == column) {
        None => Err("العمود غير موجود في الجدول.".to_string()),
        Some((_, decl)) => Ok(!decl.to_uppercase().contains("INT")),
    }
}

/// إخفاء: وسم فقط — البيانات لا تُمس إطلاقاً، والفك يعيد الحقل ببياناته.
pub(crate) fn hide_base_column_in(conn: &Connection, table: &str, column: &str) -> Result<(), String> {
    resolve_hide_target(conn, table, column)?;
    conn.execute(
        "INSERT OR IGNORE INTO hidden_columns (table_name, column_name) VALUES (?1, ?2)",
        [table, column],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// حذف ناعم: مسح البيانات (`''` أو `NULL` للعددية) + وسم محذوف — بلا DDL.
pub(crate) fn soft_delete_base_column_in(conn: &Connection, table: &str, column: &str) -> Result<(), String> {
    let is_text = resolve_hide_target(conn, table, column)?;
    if is_text {
        conn.execute(&format!("UPDATE {} SET {} = ''", quoted(table), quoted(column)), [])
            .map_err(|e| e.to_string())?;
    } else {
        conn.execute(&format!("UPDATE {} SET {} = NULL", quoted(table), quoted(column)), [])
            .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "INSERT OR IGNORE INTO deleted_columns (table_name, column_name) VALUES (?1, ?2)",
        [table, column],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// استعادة المحذوف ناعماً: حذف الوسم فقط — الحقل يعود فارغاً (البيانات ممسوحة أصلاً).
pub(crate) fn restore_base_column_in(conn: &Connection, table: &str, column: &str) -> Result<(), String> {
    if !EXTENDABLE_CORE_TABLES.contains(&table) {
        return Err("الحذف الناعم للجداول القابلة للتمديد فقط.".to_string());
    }
    conn.execute(
        "DELETE FROM deleted_columns WHERE table_name = ?1 AND column_name = ?2",
        [table, column],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// فك الإخفاء: حذف الوسم فقط — العمود يعود فارغاً (البيانات ممسوحة أصلاً).
pub(crate) fn unhide_base_column_in(conn: &Connection, table: &str, column: &str) -> Result<(), String> {
    if !EXTENDABLE_CORE_TABLES.contains(&table) {
        return Err("الإخفاء الماسح للجداول القابلة للتمديد فقط.".to_string());
    }
    conn.execute(
        "DELETE FROM hidden_columns WHERE table_name = ?1 AND column_name = ?2",
        [table, column],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// إخفاء ماسح لعمود أساسي: مسح بياناته (`''` أو `NULL` للعددية) + وسم إخفاء —
/// العمود لا يُحذف أبداً (أسماؤه في الكود) ويعود فارغاً عند فك الوسم أو الاستعادة.
#[tauri::command]
pub fn hide_base_column(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    column_name: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let kind: Option<String> = conn
        .query_row("SELECT kind FROM tabs WHERE id = ?1", [&tab_id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    match kind.as_deref() {
        Some("core") => (),
        Some(_) => return Err("الإخفاء الماسح للجداول القابلة للتمديد فقط.".to_string()),
        None => return Err("الجدول غير موجود.".to_string()),
    }
    if !EXTENDABLE_CORE_TABLES.contains(&tab_id.as_str()) {
        return Err("الإخفاء الماسح للجداول القابلة للتمديد فقط.".to_string());
    }
    let col = column_name.trim().to_string();
    hide_base_column_in(&conn, &tab_id, &col)?;
        Ok(())
    })?;
    Ok(data)
}

/// فك الإخفاء: حذف الوسم فقط — الحقل يعود ببياناته سليمة. بلا تأكيد.
#[tauri::command]
pub fn unhide_base_column(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    column_name: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let col = column_name.trim().to_string();
    unhide_base_column_in(&conn, &tab_id, &col)?;
        Ok(())
    })?;
    Ok(data)
}

/// حذف ناعم لعمود أساسي: مسح بياناته (`''` أو `NULL` للعددية) + وسم محذوف —
/// العمود لا يُحذف أبداً (أسماؤه في الكود) ويعود فارغاً عند الاستعادة.
#[tauri::command]
pub fn soft_delete_base_column(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    column_name: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let kind: Option<String> = conn
        .query_row("SELECT kind FROM tabs WHERE id = ?1", [&tab_id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    match kind.as_deref() {
        Some("core") => (),
        Some(_) => return Err("الحذف الناعم للجداول القابلة للتمديد فقط.".to_string()),
        None => return Err("الجدول غير موجود.".to_string()),
    }
    if !EXTENDABLE_CORE_TABLES.contains(&tab_id.as_str()) {
        return Err("الحذف الناعم للجداول القابلة للتمديد فقط.".to_string());
    }
    let col = column_name.trim().to_string();
    soft_delete_base_column_in(&conn, &tab_id, &col)?;
        Ok(())
    })?;
    Ok(data)
}

/// استعادة المحذوف ناعماً: حذف الوسم فقط — الحقل يعود فارغاً. بلا تأكيد.
#[tauri::command]
pub fn restore_base_column(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    column_name: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let col = column_name.trim().to_string();
    restore_base_column_in(&conn, &tab_id, &col)?;
        Ok(())
    })?;
    Ok(data)
}

/// تجاوز تسمية عمود أساسي (عرض فقط — الاسم الفيزيائي ثابت في الكود والسكيمة).
/// التسمية العربية إجبارية (80 حرفاً) والإنكليزية اختيارية.
#[tauri::command]
pub fn set_base_column_label(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    column_name: String,
    label: String,
    label_en: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    set_base_label_in(&conn, &tab_id, column_name.trim(), &label, &label_en)?;
        Ok(())
    })?;
    Ok(data)
}

/// حذف تجاوز التسمية — تعود تسمية الكود الأصلية. بلا تأكيد.
#[tauri::command]
pub fn reset_base_column_label(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    column_name: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let col = column_name.trim().to_string();
    conn.execute(
        "DELETE FROM column_labels WHERE table_name = ?1 AND column_name = ?2",
        params![tab_id, col],
    )
    .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    Ok(data)
}
