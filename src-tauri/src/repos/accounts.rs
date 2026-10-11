// الحسابات (1-كثير لكل فرد) + عمودا النوع والرابط + الحقول المخصصة الإضافية.

use rusqlite::{Connection, params, types::Value as SqlValue};
use serde::Serialize;
use tauri::AppHandle;
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDto {
    pub id: String,
    pub record_id: String,
    pub title: String,
    pub email: Option<String>,
    pub account_name: Option<String>,
    pub username: Option<String>,
    pub recovery_email: Option<String>,
    pub password: String,
    pub kind: String,
    pub url: Option<String>,
    pub sort_order: i64,
    pub created_at: u64,
    pub updated_at: u64,
    /// قيم الأعمدة الإضافية (المضافة من مدير الأعمدة) — خارج البنية الأساسية.
    /// مفتاحها اسم العمود الفيزيائي، وفارغة بلا تمديد.
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// عمودا نوع الحساب ورابطه لقواعد v3 المبكرة (إضافة فقط — القديم = ايميل بلا رابط).
pub(super) fn ensure_account_link_columns(conn: &Connection) -> Result<(), String> {
    let cols: Vec<String> = conn
        .prepare("PRAGMA table_info(accounts)")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if !cols.iter().any(|c| c == "kind") {
        conn.execute("ALTER TABLE accounts ADD COLUMN kind TEXT NOT NULL DEFAULT 'email'", [])
            .map_err(|e| e.to_string())?;
    }
    if !cols.iter().any(|c| c == "url") {
        conn.execute("ALTER TABLE accounts ADD COLUMN url TEXT", [])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ================= الحسابات (1-كثير — لكل فرد) =================

/// إضافة حساب: الـ `id` مولّد من الواجهة (`generateId`) — الفارغ يُستبدل بتوليد احتياطي.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn add_account(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: Option<String>,
    record_id: String,
    title: String,
    email: Option<String>,
    account_name: Option<String>,
    username: Option<String>,
    recovery_email: Option<String>,
    password_value: String,
    kind: String,
    url: Option<String>,
) -> Result<RepoData, String> {
    let title = clean_text80(&title);
    if title.is_empty() {
        return Err("عنوان الحساب فارغ.".to_string());
    }
    let kind = if kind.trim() == "site" { "site".to_string() } else { "email".to_string() };
    let url = url
        .map(|s| s.trim().chars().take(500).collect::<String>())
        .filter(|s| !s.is_empty());
    let record_id = record_id.trim().to_string();
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    ensure_record_exists(conn, &record_id)?;
    let id = match id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        Some(given) => ensure_uuid(&given)?,
        None => new_guid()?,
    };
    let now = now_db();
    let order: i64 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM accounts WHERE record_id = ?1", [&record_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let clean_opt = |v: Option<String>| -> Option<String> {
        v.map(|s| s.trim().chars().take(120).collect::<String>()).filter(|s| !s.is_empty())
    };
    conn.execute(
        "INSERT INTO accounts (id, record_id, title, email, account_name, username, recovery_email, password, kind, url, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
        params![id, record_id, title, clean_opt(email), clean_opt(account_name), clean_opt(username), clean_opt(recovery_email), password_value.trim().to_string(), kind, url, order, now],
    )
    .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_account(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
    title: String,
    email: Option<String>,
    account_name: Option<String>,
    username: Option<String>,
    recovery_email: Option<String>,
    password_value: String,
    kind: String,
    url: Option<String>,
) -> Result<RepoData, String> {
    let title = clean_text80(&title);
    if title.is_empty() {
        return Err("عنوان الحساب فارغ.".to_string());
    }
    let kind = if kind.trim() == "site" { "site".to_string() } else { "email".to_string() };
    let url = url
        .map(|s| s.trim().chars().take(500).collect::<String>())
        .filter(|s| !s.is_empty());
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let clean_opt = |v: Option<String>| -> Option<String> {
        v.map(|s| s.trim().chars().take(120).collect::<String>()).filter(|s| !s.is_empty())
    };
    let changed = conn.execute(
        "UPDATE accounts SET title=?1, email=?2, account_name=?3, username=?4, recovery_email=?5, password=?6, kind=?7, url=?8, updated_at=?9 WHERE id=?10",
        params![title, clean_opt(email), clean_opt(account_name), clean_opt(username), clean_opt(recovery_email), password_value.trim().to_string(), kind, url, now_db(), id],
    )
    .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("الحساب غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
pub fn delete_account(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let changed = conn
        .execute("DELETE FROM accounts WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("الحساب غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

/// قراءة قيم الأعمدة الإضافية للحسابات: id الحساب → (column → قيمة).
/// (نظير read_core_extras بمفتاح id — الحسابات 1-كثير لا record_id.)
pub(super) fn read_account_extras(
    conn: &Connection,
) -> Result<std::collections::HashMap<String, serde_json::Map<String, serde_json::Value>>, String> {
    let columns = load_custom_columns(conn, "accounts").unwrap_or_default();
    let mut out = std::collections::HashMap::new();
    if columns.is_empty() {
        return Ok(out);
    }
    let cols: Vec<String> = columns.iter().map(|c| quoted(&c.column_name)).collect();
    let sql = format!("SELECT id, {} FROM {}", cols.join(", "), quoted("accounts"));
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = columns.iter().map(|c| c.column_name.clone()).collect();
    let rows = stmt
        .query_map([], |row| {
            let aid: String = row.get(0)?;
            let mut map = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let v: SqlValue = row.get(i + 1)?;
                map.insert(name.clone(), sql_to_json(v));
            }
            Ok((aid, map))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (aid, map) in rows {
        out.insert(aid, map);
    }
    Ok(out)
}

/// كتابة قيم الأعمدة الإضافية لحساب واحد (بمفتاح id) — تُستخدم عند الإضافة/التعديل والأمر المباشر.
pub(super) fn write_account_extra_in(
    conn: &Connection,
    account_id: &str,
    obj: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    let columns = load_custom_columns(conn, "accounts")?;
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
        quoted("accounts"),
        set_clause.join(", ")
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let now = now_db();
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(assignments.len() + 2);
    for (_, v) in &assignments {
        params_vec.push(v);
    }
    params_vec.push(&now);
    params_vec.push(&account_id);
    let changed = stmt.execute(params_vec.as_slice()).map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("الحساب غير موجود.".to_string());
    }
    Ok(())
}

/// حفظ القيم الإضافية لحساب واحد: القيم JSON، والمجهول يُتجاهل.
/// المجهول يُدمَج مع القيم الحالية (الجزئي لا يمس البقية) — كالاستيراد الذكي.
#[tauri::command]
pub fn update_account_extra(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    account_id: String,
    values_json: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let account_id = account_id.trim().to_string();
    let exists: i64 = conn
        .query_row("SELECT COUNT(*) FROM accounts WHERE id = ?1", [&account_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Err("الحساب غير موجود.".to_string());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(values_json.trim()).map_err(|_| "قيم الحساب غير صالحة.".to_string())?;
    let obj = parsed.as_object().ok_or("قيم الحساب غير صالحة.".to_string())?;
    write_account_extra_in(&conn, &account_id, obj)?;
        Ok(())
    })?;
    Ok(data)
}
