// الأفراد: PeopleDto + أوامر add_people / update_people / delete_people.

use rusqlite::params;
use serde::Serialize;
use tauri::AppHandle;
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeopleDto {
    pub id: String,
    pub name: String,
    pub name_en: String,
    pub relation: String,
    pub relation_en: String,
    pub sort_order: i64,
    pub created_at: u64,
    pub updated_at: u64,
}

/// إضافة فرد: الـ `id` يأتي مولّداً من الواجهة (`generateId`) وتتحقق منه الخلفية —
/// الفارغ يُستبدل بتوليد احتياطي بنفس الصيغة. ثم صف 1-1 فارغ في الجداول الأربع.
#[tauri::command]
pub fn add_people(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: Option<String>,
    name: String,
    name_en: String,
    relation: String,
    relation_en: String,
) -> Result<RepoData, String> {
    let name = name.trim().chars().take(80).collect::<String>();
    if name.is_empty() {
        return Err("اسم الفرد فارغ.".to_string());
    }
    let name_en = name_en.trim().chars().take(80).collect::<String>();
    if name_en.is_empty() {
        return Err("اسم الفرد الإنكليزي فارغ.".to_string());
    }
    let relation = relation.trim().chars().take(80).collect::<String>();
    let relation_en = relation_en.trim().chars().take(80).collect::<String>();
    let id = match id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        Some(given) => ensure_uuid(&given)?,
        None => new_guid()?,
    };
    let now = now_db();
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
        let order: i64 = conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM peoples", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO peoples (id, name, name_en, relation, relation_en, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![id, name, name_en, relation, relation_en, order, now],
        )
        .map_err(|e| e.to_string())?;
        // صف 1-1 فارغ للعضو الجديد في الجداول الفيزيائية — ليعرف المستخدم ماذا يملأ.
        for table in ["passports", "study", "national_ids", "civil"] {
            conn.execute(
                &format!("INSERT OR IGNORE INTO {table} (record_id, created_at, updated_at) VALUES (?1, ?2, ?2)"),
                params![id, now],
            )
            .map_err(|e| e.to_string())?;
        }
        // فهرس البحث العام: استبدال مقطع المستودع (أفضل جهد — لا يُفشِل الإضافة).
        crate::people_index::refresh_repo(&app, &repo_id, conn);
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
pub fn update_people(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
    name: String,
    name_en: String,
    relation: String,
    relation_en: String,
) -> Result<RepoData, String> {
    let name = name.trim().chars().take(80).collect::<String>();
    if name.is_empty() {
        return Err("اسم الفرد فارغ.".to_string());
    }
    let name_en = name_en.trim().chars().take(80).collect::<String>();
    if name_en.is_empty() {
        return Err("اسم الفرد الإنكليزي فارغ.".to_string());
    }
    let relation = relation.trim().chars().take(80).collect::<String>();
    let relation_en = relation_en.trim().chars().take(80).collect::<String>();
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
        let changed = conn
            .execute("UPDATE peoples SET name = ?1, name_en = ?2, relation = ?3, relation_en = ?4, updated_at = ?5 WHERE id = ?6", params![name, name_en, relation, relation_en, now_db(), id])
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("السجل غير موجود.".to_string());
        }
        // فهرس البحث العام: استبدال مقطع المستودع (أفضل جهد — لا يُفشِل التعديل).
        crate::people_index::refresh_repo(&app, &repo_id, conn);
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
pub fn delete_people(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("تعذر بدء الحذف: {e}"))?;
        tx.execute("DELETE FROM accounts WHERE record_id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        // الصفوف الفيزيائية 1-1 تُحذف مع صاحبها (جواز/دراسة/هوية/مدني).
        for table in ["passports", "study", "national_ids", "civil"] {
            tx.execute(&format!("DELETE FROM {table} WHERE record_id = ?1"), [&id])
                .map_err(|e| e.to_string())?;
        }
        // ملفات الشخص وجهات اتصاله لا تُحذف — تُفك فتصبح عائلية/مشتركة.
        tx.execute("UPDATE documents SET owner_record_id = NULL WHERE owner_record_id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        tx.execute("UPDATE contacts SET record_id = NULL WHERE record_id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        let removed = tx
            .execute("DELETE FROM peoples WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        if removed == 0 {
            return Err("السجل غير موجود.".to_string());
        }
        tx.commit().map_err(|e| format!("تعذر حفظ الحذف: {e}"))?;
        // فهرس البحث العام: استبدال مقطع المستودع (أفضل جهد — لا يُفشِل الحذف).
        crate::people_index::refresh_repo(&app, &repo_id, conn);
        Ok(())
    })?;
    Ok(data)
}
