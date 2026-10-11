// جهات الاتصال (1-كثير لكل فرد) + أعمدة الهواتف الافتراضية + الحقول المخصصة الإضافية.

use rusqlite::{Connection, params, types::Value as SqlValue};
use serde::Serialize;
use tauri::AppHandle;
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactDto {
    pub id: String,
    pub record_id: Option<String>,
    pub name: String,
    pub name_en: String,
    pub phone: String,
    pub email: String,
    pub address: String,
    pub address_en: String,
    pub relation: String,
    pub relation_en: String,
    pub sort_order: i64,
    pub created_at: u64,
    pub updated_at: u64,
    /// قيم الأعمدة الإضافية (المضافة من مدير الأعمدة) — خارج البنية الأساسية.
    /// مفتاحها اسم العمود الفيزيائي، وفارغة بلا تمديد.
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// أعمدة الهواتف الافتراضية لجهات الاتصال: (فيزيائي، عربي، إنكليزي، نوع).
/// تُبذَر لكل مستودع وتُرقّى للقواعد القديمة — لاصقة (الحذف النهائي لها يعيدها فارغة).
pub(super) const DEFAULT_CONTACT_COLUMNS: [(&str, &str, &str, &str); 6] = [
    ("mobile", "جوال", "Mobile", "text"),
    ("work", "عمل", "Work", "text"),
    ("home", "منزل", "Home", "text"),
    ("main", "رئيسي", "Main", "text"),
    ("other", "أخرى", "Other", "text"),
    ("notes", "ملاحظات", "Notes", "long"),
];

/// بذر/ترقية أعمدة جهات الاتصال الافتراضية: ALTER حقيقي + سجل تعريف — الناقص فقط.
/// تُستدعَى عند التأسيس وعند كل فتح (بعد ensure_deleted_columns).
pub(crate) fn ensure_default_contact_columns(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS custom_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, label TEXT NOT NULL, label_en TEXT NOT NULL DEFAULT '', ftype TEXT NOT NULL DEFAULT 'text', foptions TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (table_name, column_name))",
        [],
    )
    .map_err(|e| e.to_string())?;
    let physical: Vec<String> = conn
        .prepare("PRAGMA table_info(contacts)")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM custom_columns WHERE table_name = 'contacts'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let now = now_db();
    for (col, label, label_en, ftype) in DEFAULT_CONTACT_COLUMNS {
        if !physical.iter().any(|c| c == col) {
            conn.execute(
                &format!(
                    "ALTER TABLE {} ADD COLUMN {} {} NOT NULL DEFAULT ''",
                    quoted("contacts"),
                    quoted(col),
                    custom_sql_type(ftype)?
                ),
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        conn.execute(
            "INSERT OR IGNORE INTO custom_columns (table_name, column_name, label, label_en, ftype, foptions, sort_order, created_at, updated_at) VALUES ('contacts', ?1, ?2, ?3, ?4, '', ?5, ?6, ?6)",
            params![col, label, label_en, ftype, order, now],
        )
        .map_err(|e| e.to_string())?;
        order += 1;
    }
    Ok(())
}

// ================= جهات الاتصال (1-كثير) =================

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn add_contact(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: Option<String>,
    record_id: Option<String>,
    name: String,
    name_en: String,
    phone: String,
    email: String,
    address: String,
    address_en: String,
    relation: String,
    relation_en: String,
) -> Result<RepoData, String> {
    let name = clean_text80(&name);
    if name.is_empty() {
        return Err("اسم جهة الاتصال فارغ.".to_string());
    }
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let record_id = record_id.map(|r| r.trim().to_string()).filter(|r| !r.is_empty());
    if let Some(ref rid) = record_id {
        ensure_record_exists(&conn, rid)?;
    }
    let id = match id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        Some(given) => ensure_uuid(&given)?,
        None => new_guid()?,
    };
    let now = now_db();
    let order: i64 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM contacts", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO contacts (id, record_id, name, name_en, phone, email, address, address_en, relation, relation_en, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
        params![id, record_id, name, clean_text80(&name_en), phone.trim().to_string(), email.trim().to_string(), clean_text500(&address), clean_text500(&address_en), clean_text80(&relation), clean_text80(&relation_en), order, now],
    )
    .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_contact(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
    record_id: Option<String>,
    name: String,
    name_en: String,
    phone: String,
    email: String,
    address: String,
    address_en: String,
    relation: String,
    relation_en: String,
) -> Result<RepoData, String> {
    let name = clean_text80(&name);
    if name.is_empty() {
        return Err("اسم جهة الاتصال فارغ.".to_string());
    }
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let record_id = record_id.map(|r| r.trim().to_string()).filter(|r| !r.is_empty());
    if let Some(ref rid) = record_id {
        ensure_record_exists(&conn, rid)?;
    }
    let changed = conn.execute(
        "UPDATE contacts SET record_id=?1, name=?2, name_en=?3, phone=?4, email=?5, address=?6, address_en=?7, relation=?8, relation_en=?9, updated_at=?10 WHERE id=?11",
        params![record_id, name, clean_text80(&name_en), phone.trim().to_string(), email.trim().to_string(), clean_text500(&address), clean_text500(&address_en), clean_text80(&relation), clean_text80(&relation_en), now_db(), id],
    )
    .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("جهة الاتصال غير موجودة.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
pub fn delete_contact(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let changed = conn
        .execute("DELETE FROM contacts WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("جهة الاتصال غير موجودة.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

/// قراءة قيم الأعمدة الإضافية لجهات الاتصال: id الجهة → (column → قيمة).
/// (نظير read_core_extras بمفتاح id — جهات الاتصال 1-كثير لا record_id.)
pub(super) fn read_contact_extras(
    conn: &Connection,
) -> Result<std::collections::HashMap<String, serde_json::Map<String, serde_json::Value>>, String> {
    let columns = load_custom_columns(conn, "contacts").unwrap_or_default();
    let mut out = std::collections::HashMap::new();
    if columns.is_empty() {
        return Ok(out);
    }
    let cols: Vec<String> = columns.iter().map(|c| quoted(&c.column_name)).collect();
    let sql = format!("SELECT id, {} FROM {}", cols.join(", "), quoted("contacts"));
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = columns.iter().map(|c| c.column_name.clone()).collect();
    let rows = stmt
        .query_map([], |row| {
            let cid: String = row.get(0)?;
            let mut map = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let v: SqlValue = row.get(i + 1)?;
                map.insert(name.clone(), sql_to_json(v));
            }
            Ok((cid, map))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (cid, map) in rows {
        out.insert(cid, map);
    }
    Ok(out)
}

/// كتابة قيم الأعمدة الإضافية لجهة واحدة (بمفتاح id) — تُستخدم عند الإضافة/التعديل والأمر المباشر.
pub(super) fn write_contact_extra_in(
    conn: &Connection,
    contact_id: &str,
    obj: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    let columns = load_custom_columns(conn, "contacts")?;
    if columns.is_empty() {
        return Ok(());
    }
    let mut assignments: Vec<(String, SqlValue)> = Vec::new();
    for col in &columns {
        let raw = obj.get(&col.column_name);
        assignments.push((col.column_name.clone(), coerce_custom_value(&col.ftype, raw)));
    }
    if assignments.is_empty() {
        return Ok(());
    }
    let set_clause: Vec<String> = assignments
        .iter()
        .map(|(c, _)| format!("{} = ?", quoted(c)))
        .collect();
    let sql = format!(
        "UPDATE {} SET {}, updated_at = ? WHERE id = ?",
        quoted("contacts"),
        set_clause.join(", ")
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let now = now_db();
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(assignments.len() + 2);
    for (_, v) in &assignments {
        params_vec.push(v);
    }
    params_vec.push(&now);
    params_vec.push(&contact_id);
    let changed = stmt.execute(params_vec.as_slice()).map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("جهة الاتصال غير موجودة.".to_string());
    }
    Ok(())
}

/// حفظ القيم الإضافية لجهة واحدة: القيم JSON، والمجهول يُتجاهل.
/// المجهول يُدمَج مع القيم الحالية (الجزئي لا يمس البقية).
#[tauri::command]
pub fn update_contact_extra(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    contact_id: String,
    values_json: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let contact_id = contact_id.trim().to_string();
    let exists: i64 = conn
        .query_row("SELECT COUNT(*) FROM contacts WHERE id = ?1", [&contact_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err("جهة الاتصال غير موجودة.".to_string());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(values_json.trim()).map_err(|_| "قيم جهة الاتصال غير صالحة.".to_string())?;
    let obj = parsed.as_object().ok_or("قيم جهة الاتصال غير صالحة.".to_string())?;
    write_contact_extra_in(&conn, &contact_id, obj)?;
        Ok(())
    })?;
    Ok(data)
}
