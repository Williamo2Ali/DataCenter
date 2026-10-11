// تبويبات المستودع (إضافة/إعادة تسمية/حذف/ترتيب/إخفاء) والتبويبات المخصصة:
// جداولها وأعمدتها وصفوفها الفيزيائية، وحقول core الإضافية.

use rusqlite::{Connection, OptionalExtension, params, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomColumnDto {
    pub table_name: String,
    pub column_name: String,
    pub label: String,
    pub label_en: String,
    pub ftype: String,
    pub foptions: String,
    pub sort_order: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomTableDto {
    pub tab_id: String,
    pub table_name: String,
    pub columns: Vec<CustomColumnDto>,
    /// الصفوف ككائنات حرة (id/people_id/sort_order/created_at/updated_at + الأعمدة).
    pub rows: Vec<serde_json::Value>,
    /// الأعمدة الأساسية المخفية (وسم فقط من `hidden_columns` — البيانات سليمة).
    #[serde(default)]
    pub hidden: Vec<String>,
    /// الأعمدة المحذوفة ناعماً (مسح + وسم من `deleted_columns` — تعود فارغة).
    #[serde(default)]
    pub deleted: Vec<String>,
    /// تجاوزات تسميات الثابتة (من `column_labels` — الاسم الفيزيائي ثابت).
    #[serde(default)]
    pub labels: Vec<BaseColumnLabelDto>,
}

/// إظهار/إخفاء جدول — المخفي مستثنى من كل العروض (لا يُحذَف).
#[tauri::command]
pub fn set_tab_hidden(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
    hidden: bool,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let changed = conn
        .execute("UPDATE tabs SET is_hidden = ?1 WHERE id = ?2", params![i64::from(hidden), id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("الجدول غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

// ================= جداول المستودع (لكل مستودع على حدة) =================
// العزل: كل عملية هنا على المستودع المحدد فقط — لا مزامنة عامة.
// التبويبات الأساسية السبعة ثابتة (إخفاء/ترتيب فقط)؛ الإضافة والحذف
// للتبويبات المخصصة حصراً (جداول فيزيائية — المرحلة 4).

/// معرّف جدول فريد داخل المستودع من العنوان.
pub(super) fn unique_tab_id(conn: &Connection, base: &str) -> Result<String, String> {
    let existing: Vec<String> = conn
        .prepare("SELECT id FROM tabs")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut candidate = sanitize_id(base);
    if candidate.is_empty() {
        candidate = format!("tab-{}", now_secs());
    }
    let stem = candidate.clone();
    let mut n = 2;
    while existing.contains(&candidate) {
        candidate = format!("{stem}-{n}");
        n += 1;
    }
    Ok(candidate)
}

pub(super) fn clean_tab_title(value: &str, required: bool) -> Result<String, String> {
    let title = value.trim().chars().take(80).collect::<String>();
    if required && title.is_empty() {
        return Err("اسم الجدول فارغ.".to_string());
    }
    Ok(title)
}

#[tauri::command]
pub fn add_repo_tab(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    title: String,
    title_en: String,
) -> Result<RepoData, String> {
    let title = clean_tab_title(&title, true)?;
    let title_en = clean_tab_title(&title_en, false)?;
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let base = if title.is_empty() { title_en.clone() } else { title.clone() };
    let id = unique_tab_id(&conn, &base)?;
    let order: i64 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tabs", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO tabs (id, title, title_en, kind, table_name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 'custom', '', ?4, ?5, ?5)",
        params![id, title, title_en, order, now_db()],
    )
    .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
pub fn rename_repo_tab(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
    title: String,
    title_en: String,
) -> Result<RepoData, String> {
    let title = clean_tab_title(&title, true)?;
    let title_en = clean_tab_title(&title_en, false)?;
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let changed = conn
        .execute("UPDATE tabs SET title = ?1, title_en = ?2, updated_at = ?3 WHERE id = ?4", params![title, title_en, now_db(), id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("الجدول غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

/// حذف نهائي لتبويب مخصص من المستودع الحالي — بتأكيد الواجهة المسبق:
/// إسقاط جدوله الفيزيائي + سجل أعمدته + صف التبويب.
/// التبويبات الأساسية السبعة بنيوية ولا تُحذف.
#[tauri::command]
pub fn delete_repo_tab(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let row: Option<(String, String)> = conn
        .query_row("SELECT kind, table_name FROM tabs WHERE id = ?1", [&id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()
        .map_err(|e| e.to_string())?;
    let table_name = match row {
        None => return Err("الجدول غير موجود.".to_string()),
        Some((kind, _)) if kind == "core" => return Err("الجداول الأساسية لا تُحذف.".to_string()),
        Some((_, t)) if t.starts_with(CUSTOM_TABLE_PREFIX) => t,
        _ => return Err("الجدول المخصص تالف.".to_string()),
    };
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("تعذر بدء الحذف: {e}"))?;
    tx.execute(&format!("DROP TABLE {}", quoted(&table_name)), [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM custom_columns WHERE table_name = ?1", [&table_name])
        .map_err(|e| e.to_string())?;
    let removed = tx
        .execute("DELETE FROM tabs WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    if removed == 0 {
        return Err("الجدول غير موجود.".to_string());
    }
    tx.commit().map_err(|e| format!("تعذر حفظ الحذف: {e}"))?;
        Ok(())
    })?;
    Ok(data)
}

/// حذف ناعم لتبويب أساسي: مسح بيانات جدوله كاملة + وسمه محذوفاً.
/// الجدول نفسه يبقى فارغاً (لا كسر لأي SELECT)، والتبويب يختفي من كل العروض.
/// - 1-1: حذف كل الصفوف. - files: حذف الصفوف + الكتل من القرص (نهائي).
/// - accounts/contacts: حذف كل الصفوف نهائياً. بتأكيد الواجهة المسبق.
#[tauri::command]
pub fn delete_core_tab(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let row: Option<(String, i64)> = conn
        .query_row("SELECT kind, is_deleted FROM tabs WHERE id = ?1", [&id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()
        .map_err(|e| e.to_string())?;
    match row {
        None => return Err("الجدول غير موجود.".to_string()),
        Some((k, _)) if k != "core" => return Err("الحذف الناعم للتبويبات الأساسية فقط.".to_string()),
        Some((_, d)) if d != 0 => return Err("الجدول محذوف مسبقاً.".to_string()),
        _ => {}
    }
    // ملفات التبويب (قبل مسح الفهرس) لحذف كتلها من القرص.
    let wiped_files: Vec<String> = if id == "files" {
        conn.prepare("SELECT file_name FROM documents")
            .map_err(|e| e.to_string())?
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    } else {
        Vec::new()
    };
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("تعذر بدء الحذف: {e}"))?;
    match id.as_str() {
        "passports" | "civil" | "national_ids" | "study" => {
            tx.execute(&format!("DELETE FROM {id}"), [])
                .map_err(|e| e.to_string())?;
        }
        "files" => {
            tx.execute("DELETE FROM documents", [])
                .map_err(|e| e.to_string())?;
        }
        "accounts" => {
            tx.execute("DELETE FROM accounts", [])
                .map_err(|e| e.to_string())?;
        }
        "contacts" => {
            tx.execute("DELETE FROM contacts", [])
                .map_err(|e| e.to_string())?;
        }
        _ => return Err("الجدول غير معروف.".to_string()),
    }
    tx.execute("UPDATE tabs SET is_deleted = 1, updated_at = ?1 WHERE id = ?2", params![now_db(), id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| format!("تعذر حفظ الحذف: {e}"))?;
    if !wiped_files.is_empty() {
        if let Ok(dir) = repo_dir(&app, &repo_id) {
            let files_dir = dir.join(FILES_DIR);
            for name in wiped_files {
                let _ = std::fs::remove_file(files_dir.join(name));
            }
        }
    }
        Ok(())
    })?;
    Ok(data)
}

/// استعادة تبويب أساسي محذوف ناعماً: فك الوسم + زرع صفوف 1-1 فارغة من جديد.
/// (الـ 1-كثير تبدأ فارغة طبيعياً — المستعاد فارغ دائماً.)
#[tauri::command]
pub fn restore_core_tab(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let row: Option<(String, i64)> = conn
        .query_row("SELECT kind, is_deleted FROM tabs WHERE id = ?1", [&id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()
        .map_err(|e| e.to_string())?;
    match row {
        None => return Err("الجدول غير موجود.".to_string()),
        Some((k, _)) if k != "core" => return Err("الاستعادة للتبويبات الأساسية فقط.".to_string()),
        Some((_, d)) if d == 0 => return Err("الجدول غير محذوف.".to_string()),
        _ => {}
    }
    conn.execute("UPDATE tabs SET is_deleted = 0, updated_at = ?1 WHERE id = ?2", params![now_db(), id])
        .map_err(|e| e.to_string())?;
    ensure_physical_rows(&conn)?;
        Ok(())
    })?;
    Ok(data)
}

/// نقل جدول لأعلى/لأسفل في ترتيب المستودع الحالي.
#[tauri::command]
pub fn move_repo_tab(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
    direction: i32,
) -> Result<RepoData, String> {
    if direction != -1 && direction != 1 {
        return Err("اتجاه النقل غير صالح.".to_string());
    }
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let current: Option<i64> = conn
        .query_row("SELECT sort_order FROM tabs WHERE id = ?1", [&id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(order) = current else {
        return Err("الجدول غير موجود.".to_string());
    };
    let neighbor: Option<(String, i64)> = if direction == -1 {
        conn.query_row(
            "SELECT id, sort_order FROM tabs WHERE sort_order < ?1 ORDER BY sort_order DESC LIMIT 1",
            [order],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
    } else {
        conn.query_row(
            "SELECT id, sort_order FROM tabs WHERE sort_order > ?1 ORDER BY sort_order ASC LIMIT 1",
            [order],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
    }
    .optional()
    .map_err(|e| e.to_string())?;
    if let Some((neighbor_id, neighbor_order)) = neighbor {
        conn.execute("UPDATE tabs SET sort_order = ?1 WHERE id = ?2", params![neighbor_order, id])
            .map_err(|e| e.to_string())?;
        conn.execute("UPDATE tabs SET sort_order = ?1 WHERE id = ?2", params![order, neighbor_id])
            .map_err(|e| e.to_string())?;
    }
        Ok(())
    })?;
    Ok(data)
}

// ================= التبويبات المخصصة (جداول فيزيائية لحظية) =================
// المستخدم ينشئ تبويباً → `CREATE TABLE` حقيقي بنفس اللحظة. سجل `custom_columns`
// يعرّف الأعمدة (سجل تعريف فقط — القيم في الجدول نفسه، لا EAV).
// الأسماء المولدة لاتينية صارمة وتُقتبس دائماً بعلامتي تنصيص لمنع حقن DDL.

pub(super) const CUSTOM_TABLE_PREFIX: &str = "custom_";

/// تنقية اسم جدول/عمود مولّد: لاتيني صغير/أرقام/`_` فقط، يبدأ بحرف، بحد 40.
/// الفارغ تماماً → البديل الممرر (مضمون الفرادة من المستدعي).
pub(super) fn sanitize_ident(raw: &str, fallback: &str) -> String {
    let mut out: String = raw
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    while out.starts_with('_') || out.starts_with(|c: char| c.is_ascii_digit()) {
        out.remove(0);
    }
    while out.ends_with('_') {
        out.pop();
    }
    out.truncate(40);
    if out.is_empty() {
        out = fallback.to_string();
    }
    out
}

/// نوع عمود مخصص → نوع SQLite. العددي حقيقي، والباقي نص.
pub(super) fn custom_sql_type(ftype: &str) -> Result<&'static str, String> {
    match ftype.trim().to_lowercase().as_str() {
        "text" | "long" | "phone" | "date" | "yesno" | "list" => Ok("TEXT"),
        "number" => Ok("REAL"),
        _ => Err("نوع العمود غير معروف.".to_string()),
    }
}

/// خيارات عمود القائمة: JSON مصفوفة عناصرها {key, ar, en} — تُعرض فقط ولا تُفرض.
pub(super) fn ensure_custom_options(foptions: &str) -> Result<String, String> {
    let opts = foptions.trim().to_string();
    if opts.is_empty() {
        return Ok(String::new());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(&opts).map_err(|_| "خيارات القائمة غير صالحة.".to_string())?;
    let arr = parsed.as_array().ok_or("خيارات القائمة غير صالحة.".to_string())?;
    for item in arr {
        if item.get("key").and_then(|k| k.as_str()).map(|k| k.trim().is_empty()).unwrap_or(true) {
            return Err("خيارات القائمة غير صالحة.".to_string());
        }
    }
    Ok(opts)
}

/// تحميل اسم الجدول الفيزيائي لتبويب مخصص — يرفض الأساسية والتالف.
/// (لصفوف الجداول المخصصة وإسقاطها — انظر load_extendable_table للأعمدة.)
pub(super) fn load_custom_table(conn: &Connection, tab_id: &str) -> Result<String, String> {
    let row: Option<(String, String)> = conn
        .query_row("SELECT kind, table_name FROM tabs WHERE id = ?1", [tab_id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()
        .map_err(|e| e.to_string())?;
    match row {
        None => Err("الجدول غير موجود.".to_string()),
        Some((kind, _)) if kind == "core" => Err("الجداول الأساسية ثابتة البنية.".to_string()),
        Some((_, table)) if table.starts_with(CUSTOM_TABLE_PREFIX) => Ok(table),
        _ => Err("الجدول المخصص تالف.".to_string()),
    }
}

/// الجداول القابلة للتمديد بأعمدة إضافية: المخصصة + الأساسية 1-1 فقط.
/// ملفات/حسابات/جهات (1-كثير) مرفوضة — تمديدها يعقّد تحرير كل صف على حدة.
/// الأساسي فيها يُقبل اسمه (passports…) والمخصص اسمه الفيزيائي (custom_*).
pub(super) fn load_extendable_table(conn: &Connection, tab_id: &str) -> Result<String, String> {
    let row: Option<(String, String)> = conn
        .query_row("SELECT kind, table_name FROM tabs WHERE id = ?1", [tab_id], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()
        .map_err(|e| e.to_string())?;
    match row {
        None => Err("الجدول غير موجود.".to_string()),
        Some((kind, table)) if kind == "custom" && table.starts_with(CUSTOM_TABLE_PREFIX) => Ok(table),
        Some((kind, _)) if kind == "core" && ["passports", "civil", "national_ids", "study", "accounts", "contacts"].contains(&tab_id) => {
            Ok(tab_id.to_string())
        }
        Some((kind, _)) if kind == "core" => Err("تمديد هذا الجدول غير مدعوم — استخدم تبويباً مخصصاً.".to_string()),
        _ => Err("الجدول غير صالح للتمديد.".to_string()),
    }
}

pub(super) fn load_custom_columns(conn: &Connection, table_name: &str) -> Result<Vec<CustomColumnDto>, String> {
    let mut stmt = conn
        .prepare("SELECT table_name, column_name, label, label_en, ftype, foptions, sort_order FROM custom_columns WHERE table_name = ?1 ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    stmt.query_map([table_name], |r| {
        Ok(CustomColumnDto {
            table_name: r.get(0)?,
            column_name: r.get(1)?,
            label: r.get(2)?,
            label_en: r.get(3)?,
            ftype: r.get(4)?,
            foptions: r.get(5)?,
            sort_order: r.get(6)?,
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CustomColumnInput {
    #[serde(default)]
    pub name: String,
    pub label: String,
    #[serde(default)]
    pub label_en: String,
    pub ftype: String,
    #[serde(default)]
    pub foptions: String,
}

/// تنظيف تعريف عمود مخصص: تسمية إجبارية + اسم فيزيائي فريد + نوع صالح.
pub(super) fn clean_custom_column(
    input: &CustomColumnInput,
    taken: &[String],
    counter: &mut u32,
) -> Result<(String, String, String, String, String), String> {
    let label = input.label.trim().chars().take(80).collect::<String>();
    if label.is_empty() {
        return Err("اسم العمود فارغ.".to_string());
    }
    let label_en = input.label_en.trim().chars().take(80).collect::<String>();
    let ftype = input.ftype.trim().to_lowercase();
    custom_sql_type(&ftype)?;
    let foptions = if ftype == "list" {
        let o = ensure_custom_options(&input.foptions)?;
        if o.is_empty() {
            return Err("عمود القائمة يحتاج خيارات.".to_string());
        }
        o
    } else {
        String::new()
    };
    let base = sanitize_ident(
        if input.name.trim().is_empty() { &label_en } else { input.name.trim() },
        &format!("col_{counter}"),
    );
    *counter += 1;
    let mut candidate = base.clone();
    let stem = candidate.clone();
    let mut n = 2;
    while taken.contains(&candidate) {
        candidate = format!("{stem}_{n}");
        n += 1;
    }
    Ok((candidate, label, label_en, ftype, foptions))
}

/// إنشاء تبويب مخصص: صف `tabs` + جدول فيزيائي حقيقي + سجل أعمدته — دفعة واحدة.
#[tauri::command]
pub fn create_custom_tab(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    title: String,
    title_en: String,
    columns: Vec<CustomColumnInput>,
) -> Result<RepoData, String> {
    let title = clean_tab_title(&title, true)?;
    let title_en = clean_tab_title(&title_en, false)?;
    if columns.len() > 50 {
        return Err("عدد الأعمدة كبير جداً (50 كحد أقصى).".to_string());
    }
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let tab_id = unique_tab_id(&conn, &title)?;
    // اسم الجدول الفيزيائي من معرف التبويب — فريد داخل القاعدة حتماً.
    let existing_tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut table_name = format!("{CUSTOM_TABLE_PREFIX}{}", sanitize_ident(&tab_id, "tab"));
    let stem = table_name.clone();
    let mut n = 2;
    while existing_tables.contains(&table_name) {
        table_name = format!("{stem}_{n}");
        n += 1;
    }
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("تعذر بدء الإنشاء: {e}"))?;
    let now = now_db();
    let order: i64 = tx
        .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tabs", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO tabs (id, title, title_en, kind, table_name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 'custom', ?4, ?5, ?6, ?6)",
        params![tab_id, title, title_en, table_name, order, now],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        &format!(
            "CREATE TABLE {} (id TEXT PRIMARY KEY, people_id TEXT NULL REFERENCES peoples(id) ON DELETE SET NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)",
            quoted(&table_name)
        ),
        [],
    )
    .map_err(|e| e.to_string())?;
    let mut taken: Vec<String> = vec!["id".to_string(), "people_id".to_string(), "sort_order".to_string(), "created_at".to_string(), "updated_at".to_string()];
    let mut counter = 1u32;
    let mut col_order = 0i64;
    for input in &columns {
        let (col, label, label_en, ftype, foptions) = clean_custom_column(input, &taken, &mut counter)?;
        taken.push(col.clone());
        tx.execute(
            &format!("ALTER TABLE {} ADD COLUMN {} {} NOT NULL DEFAULT ''", quoted(&table_name), quoted(&col), custom_sql_type(&ftype)?),
            [],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO custom_columns (table_name, column_name, label, label_en, ftype, foptions, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![table_name, col, label, label_en, ftype, foptions, col_order, now],
        )
        .map_err(|e| e.to_string())?;
        col_order += 1;
    }
    tx.commit().map_err(|e| format!("تعذر حفظ التبويب: {e}"))?;
        Ok(())
    })?;
    Ok(data)
}

/// إضافة عمود لتبويب مخصص أو أساسي 1-1 (ALTER TABLE حقيقي + سجل تعريف).
#[tauri::command]
pub fn add_custom_column(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    column: CustomColumnInput,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let table_name = load_extendable_table(&conn, &tab_id)?;
    let existing: Vec<String> = load_custom_columns(&conn, &table_name)?
        .into_iter()
        .map(|c| c.column_name)
        .collect();
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM custom_columns WHERE table_name = ?1", [&table_name], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if n >= 50 {
        return Err("عدد الأعمدة كبير جداً (50 كحد أقصى).".to_string());
    }
    let mut counter = (n + 1) as u32;
    let (col, label, label_en, ftype, foptions) = clean_custom_column(&column, &existing, &mut counter)?;
    let now = now_db();
    let order: i64 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM custom_columns WHERE table_name = ?1", [&table_name], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("تعذر بدء الإضافة: {e}"))?;
    tx.execute(
        &format!("ALTER TABLE {} ADD COLUMN {} {} NOT NULL DEFAULT ''", quoted(&table_name), quoted(&col), custom_sql_type(&ftype)?),
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO custom_columns (table_name, column_name, label, label_en, ftype, foptions, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![table_name, col, label, label_en, ftype, foptions, order, now],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| format!("تعذر حفظ العمود: {e}"))?;
        Ok(())
    })?;
    Ok(data)
}

/// إعادة تسمية عمود مخصص (التسميتان فقط — الاسم الفيزيائي ثابت لا يتغير).
#[tauri::command]
pub fn rename_custom_column(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    column_name: String,
    label: String,
    label_en: String,
) -> Result<RepoData, String> {
    let label = label.trim().chars().take(80).collect::<String>();
    if label.is_empty() {
        return Err("اسم العمود فارغ.".to_string());
    }
    let label_en = label_en.trim().chars().take(80).collect::<String>();
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let table_name = load_extendable_table(&conn, &tab_id)?;
    let changed = conn
        .execute(
            "UPDATE custom_columns SET label = ?1, label_en = ?2, updated_at = ?3 WHERE table_name = ?4 AND column_name = ?5",
            params![label, label_en, now_db(), table_name, column_name.trim()],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("العمود غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

/// حذف عمود مخصص نهائياً (إسقاط العمود من الجدول + سجل تعريفه — بتأكيد الواجهة).
#[tauri::command]
pub fn delete_custom_column(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    column_name: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let table_name = load_extendable_table(&conn, &tab_id)?;
    let col = column_name.trim().to_string();
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM custom_columns WHERE table_name = ?1 AND column_name = ?2",
            params![table_name, col],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err("العمود غير موجود.".to_string());
    }
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("تعذر بدء الحذف: {e}"))?;
    tx.execute(
        &format!("ALTER TABLE {} DROP COLUMN {}", quoted(&table_name), quoted(&col)),
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM custom_columns WHERE table_name = ?1 AND column_name = ?2",
        params![table_name, col],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| format!("تعذر حفظ الحذف: {e}"))?;
        Ok(())
    })?;
    Ok(data)
}

pub(super) fn sql_to_json(value: SqlValue) -> serde_json::Value {
    match value {
        SqlValue::Null => serde_json::Value::Null,
        SqlValue::Integer(n) => serde_json::Value::from(n),
        SqlValue::Real(f) => serde_json::Number::from_f64(f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        SqlValue::Text(s) => serde_json::Value::String(s),
        SqlValue::Blob(_) => serde_json::Value::Null,
    }
}

/// إجبار قيمة واردة على نوع عمود مخصص (العددي عدد أو NULL، والباقي نص مُقلَّم).
pub(super) fn coerce_custom_value(ftype: &str, raw: Option<&serde_json::Value>) -> SqlValue {
    match ftype {
        "number" => match raw {
            Some(serde_json::Value::Number(n)) => n.as_f64().map(SqlValue::Real).unwrap_or(SqlValue::Null),
            Some(serde_json::Value::String(s)) if !s.trim().is_empty() => s
                .trim()
                .parse::<f64>()
                .map(SqlValue::Real)
                .unwrap_or(SqlValue::Null),
            _ => SqlValue::Null,
        },
        _ => match raw {
            Some(serde_json::Value::String(s)) => {
                SqlValue::Text(s.trim().chars().take(2000).collect())
            }
            Some(serde_json::Value::Number(n)) => SqlValue::Text(n.to_string()),
            Some(serde_json::Value::Bool(b)) => SqlValue::Text(b.to_string()),
            _ => SqlValue::Text(String::new()),
        },
    }
}

/// قراءة قيم الأعمدة الإضافية لجدول أساسي: record_id → (column → قيمة).
pub(super) fn read_core_extras(
    conn: &Connection,
    table_name: &str,
) -> Result<std::collections::HashMap<String, serde_json::Map<String, serde_json::Value>>, String> {
    let columns = load_custom_columns(conn, table_name).unwrap_or_default();
    let mut out = std::collections::HashMap::new();
    if columns.is_empty() {
        return Ok(out);
    }
    let cols: Vec<String> = columns.iter().map(|c| quoted(&c.column_name)).collect();
    let sql = format!("SELECT record_id, {} FROM {}", cols.join(", "), quoted(table_name));
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = columns.iter().map(|c| c.column_name.clone()).collect();
    let rows = stmt
        .query_map([], |row| {
            let rid: String = row.get(0)?;
            let mut map = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let v: SqlValue = row.get(i + 1)?;
                map.insert(name.clone(), sql_to_json(v));
            }
            Ok((rid, map))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (rid, map) in rows {
        out.insert(rid, map);
    }
    Ok(out)
}

pub(super) fn read_custom_rows(conn: &Connection, table_name: &str) -> Result<Vec<serde_json::Value>, String> {    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {} ORDER BY sort_order", quoted(table_name)))
        .map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt
        .query_map([], |row| {
            let mut map = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let v: SqlValue = row.get(i)?;
                map.insert(name.clone(), sql_to_json(v));
            }
            Ok(serde_json::Value::Object(map))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// إنشاء-or-تحديث صف في جدول مخصص: القيم JSON، والمجهول يُتجاهل.
/// `id` من الواجهة (توليد احتياطي عند الفراغ)، و`people_id` للربط بالفرد.
#[tauri::command]
pub fn upsert_custom_row(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    id: Option<String>,
    people_id: Option<String>,
    values_json: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let table_name = load_custom_table(&conn, &tab_id)?;
    let columns = load_custom_columns(&conn, &table_name)?;
    let parsed: serde_json::Value =
        serde_json::from_str(values_json.trim()).map_err(|_| "قيم الصف غير صالحة.".to_string())?;
    let obj = parsed.as_object().ok_or("قيم الصف غير صالحة.".to_string())?;
    let people_id = people_id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if let Some(ref pid) = people_id {
        ensure_record_exists(&conn, pid)?;
    }
    let id = match id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        Some(given) => ensure_uuid(&given)?,
        None => new_guid()?,
    };
    let now = now_db();
    // إبقاء المعروف فقط، مع إجبار الأنواع (العددي عدد أو NULL، والباقي نص مُقلَّم).
    let mut assignments: Vec<(String, SqlValue)> = Vec::new();
    for col in &columns {
        let raw = obj.get(&col.column_name);
        assignments.push((col.column_name.clone(), coerce_custom_value(&col.ftype, raw)));
    }
    let exists: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM {} WHERE id = ?1", quoted(&table_name)),
            [&id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists > 0 {
        let set_clause: Vec<String> = assignments
            .iter()
            .map(|(c, _)| format!("{} = ?", quoted(c)))
            .collect();
        let sql = format!(
            "UPDATE {} SET people_id = ?, {}, updated_at = ? WHERE id = ?",
            quoted(&table_name),
            set_clause.join(", ")
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(assignments.len() + 3);
        params_vec.push(&people_id);
        for (_, v) in &assignments {
            params_vec.push(v);
        }
        params_vec.push(&now);
        params_vec.push(&id);
        stmt.execute(params_vec.as_slice()).map_err(|e| e.to_string())?;
    } else {
        let cols: Vec<String> = assignments.iter().map(|(c, _)| quoted(c)).collect();
        let placeholders: Vec<String> = (0..assignments.len()).map(|_| "?".to_string()).collect();
        let sql = format!(
            "INSERT INTO {} (id, people_id, sort_order, created_at, updated_at{}) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {}), ?, ?{})",
            quoted(&table_name),
            if cols.is_empty() { String::new() } else { format!(", {}", cols.join(", ")) },
            quoted(&table_name),
            if placeholders.is_empty() { String::new() } else { format!(", {}", placeholders.join(", ")) },
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&id, &people_id, &now, &now];
        for (_, v) in &assignments {
            params_vec.push(v);
        }
        stmt.execute(params_vec.as_slice()).map_err(|e| e.to_string())?;
    }
        Ok(())
    })?;
    Ok(data)
}

/// تحديث قيم الأعمدة الإضافية لصف أساسي 1-1 (المسجلة فقط — المجهول يُتجاهل).
/// البنية الأساسية تُحرَّر بأوامر upsert_* الخاصة بها — هذا للأعمدة المضافة فقط.
#[tauri::command]
pub fn update_core_extra(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    record_id: String,
    values_json: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let table_name = load_extendable_table(&conn, &tab_id)?;
    if table_name != tab_id || !["passports", "civil", "national_ids", "study"].contains(&tab_id.as_str()) {
        return Err("الأعمدة الإضافية للجداول 1-1 فقط.".to_string());
    }
    ensure_record_exists(&conn, &record_id)?;
    let columns = load_custom_columns(&conn, &table_name)?;
    let parsed: serde_json::Value =
        serde_json::from_str(values_json.trim()).map_err(|_| "قيم الصف غير صالحة.".to_string())?;
    let obj = parsed.as_object().ok_or("قيم الصف غير صالحة.".to_string())?;
    let now = now_db();
    conn.execute(
        &format!("INSERT OR IGNORE INTO {} (record_id, created_at, updated_at) VALUES (?1, ?2, ?2)", quoted(&table_name)),
        params![record_id, now],
    )
    .map_err(|e| e.to_string())?;
    let mut assignments: Vec<(String, SqlValue)> = Vec::new();
    for col in &columns {
        let raw = obj.get(&col.column_name);
        assignments.push((col.column_name.clone(), coerce_custom_value(&col.ftype, raw)));
    }
    if !assignments.is_empty() {
        let set_clause: Vec<String> = assignments
            .iter()
            .map(|(c, _)| format!("{} = ?", quoted(c)))
            .collect();
        let sql = format!(
            "UPDATE {} SET {}, updated_at = ? WHERE record_id = ?",
            quoted(&table_name),
            set_clause.join(", ")
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(assignments.len() + 2);
        for (_, v) in &assignments {
            params_vec.push(v);
        }
        params_vec.push(&now);
        params_vec.push(&record_id);
        stmt.execute(params_vec.as_slice()).map_err(|e| e.to_string())?;
    }
        Ok(())
    })?;
    Ok(data)
}

/// حذف صف من جدول مخصص نهائياً (بتأكيد الواجهة المسبق).
#[tauri::command]
pub fn delete_custom_row(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    tab_id: String,
    id: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let table_name = load_custom_table(&conn, &tab_id)?;
    let changed = conn
        .execute(&format!("DELETE FROM {} WHERE id = ?1", quoted(&table_name)), [&id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("الصف غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}
