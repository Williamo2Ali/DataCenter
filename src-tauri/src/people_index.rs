// فهرس البحث العام عن الأشخاص — ملف `people_index.json` بجذر AppData.
// المدخل ثلاثي فقط {name, nameEn, repoId}. التحديث استبدال مقطع المستودع
// كاملاً عند كل طفرة أشخاص (بلا هوية لكل صف — الأسماء المكررة آمنة).
// الكتابة ذرية (مؤقت + إعادة تسمية)، والتالف يُحفَظ `.bak` ويُبدَأ فارغاً.
// كل عمليات الصيانة "أفضل جهد": لا تُفشِل عملية المستخدم أبداً.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const PEOPLE_INDEX_FILE: &str = "people_index.json";
/// سقف النتائج — حماية للواجهة من قوائم عملاقة.
const MAX_HITS: usize = 200;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PeopleIndexEntry {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub name_en: String,
    #[serde(default)]
    pub repo_id: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PeopleHit {
    pub name: String,
    pub name_en: String,
    pub repo_id: String,
    pub repo_name: String,
}

fn index_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "تعذر تحديد مجلد بيانات التطبيق.".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|_| "تعذر إنشاء مجلد بيانات التطبيق.".to_string())?;
    Ok(dir.join(PEOPLE_INDEX_FILE))
}

fn read_entries(app: &AppHandle) -> Vec<PeopleIndexEntry> {
    let Ok(path) = index_path(app) else { return Vec::new() };
    if !path.exists() {
        return Vec::new();
    }
    let Ok(raw) = std::fs::read(&path) else { return Vec::new() };
    match serde_json::from_slice::<Vec<PeopleIndexEntry>>(&raw) {
        Ok(list) => list
            .into_iter()
            .filter(|e| !e.repo_id.is_empty() && (!e.name.is_empty() || !e.name_en.is_empty()))
            .collect(),
        Err(_) => {
            let _ = std::fs::copy(&path, path.with_extension("json.bak"));
            Vec::new()
        }
    }
}

fn write_atomic(path: &std::path::Path, entries: &[PeopleIndexEntry]) -> Result<(), String> {
    let raw = serde_json::to_vec_pretty(entries).map_err(|_| "تعذر ترميز فهرس الأشخاص.".to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, raw).map_err(|_| "تعذر كتابة فهرس الأشخاص.".to_string())?;
    std::fs::rename(&tmp, path).map_err(|_| "تعذر حفظ فهرس الأشخاص.".to_string())?;
    Ok(())
}

/// استبدال مقطع مستودع كامل بالقائمة المعطاة — نقية قابلة للاختبار بلا AppHandle.
/// القائمة الفارغة = إسقاط المقطع (حذف شخص أخير أو حذف المستودع).
fn replace_slice(
    entries: Vec<PeopleIndexEntry>,
    repo_id: &str,
    people: Vec<(String, String)>,
) -> Vec<PeopleIndexEntry> {
    let mut next: Vec<PeopleIndexEntry> = entries.into_iter().filter(|e| e.repo_id != repo_id).collect();
    for (name, name_en) in people {
        if name.is_empty() && name_en.is_empty() {
            continue;
        }
        next.push(PeopleIndexEntry { name, name_en, repo_id: repo_id.to_string() });
    }
    next
}

/// قراءة أسماء المستودع من اتصاله المفتوح — نقية قابلة للاختبار.
fn read_people(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT name, name_en FROM peoples ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let name_en: String = row.get(1)?;
            Ok((name, name_en))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// استبدال مقطع المستودع بالقائمة الحالية من قاعدته — أفضل جهد (لا تُفشِل الطفرة).
pub(crate) fn refresh_repo(app: &AppHandle, repo_id: &str, conn: &Connection) {
    let Ok(people) = read_people(conn) else { return };
    let Ok(path) = index_path(app) else { return };
    let _ = write_atomic(&path, &replace_slice(read_entries(app), repo_id, people));
}

/// إسقاط مقطع المستودع (عند حذفه) — أفضل جهد.
pub(crate) fn remove_repo(app: &AppHandle, repo_id: &str) {
    let Ok(path) = index_path(app) else { return };
    let _ = write_atomic(&path, &replace_slice(read_entries(app), repo_id, Vec::new()));
}

/// اسم العرض من `repo.json` — أفضل جهد، والبديل المعرف نفسه.
fn repo_display_name(app: &AppHandle, repo_id: &str) -> String {
    let Ok(dir) = index_path(app).map(|p| p.parent().map(|d| d.to_path_buf())) else {
        return repo_id.to_string();
    };
    let Some(root) = dir else { return repo_id.to_string() };
    let path = root.join("repos").join(repo_id).join("repo.json");
    let Ok(raw) = std::fs::read(&path) else { return repo_id.to_string() };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&raw) else {
        return repo_id.to_string();
    };
    value
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| repo_id.to_string())
}

fn matches_query(entry: &PeopleIndexEntry, query: &str) -> bool {
    entry.name.to_lowercase().contains(query) || entry.name_en.to_lowercase().contains(query)
}

/// بحث عام: مطابقة جزئية غير حساسة لحالة الأحرف على الاسمين — الفارغ يعيد فراغاً.
#[tauri::command]
pub fn search_people_index(app: AppHandle, query: String) -> Result<Vec<PeopleHit>, String> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    Ok(read_entries(&app)
        .into_iter()
        .filter(|e| matches_query(e, &q))
        .take(MAX_HITS)
        .map(|e| {
            let repo_name = repo_display_name(&app, &e.repo_id);
            PeopleHit { name: e.name, name_en: e.name_en, repo_id: e.repo_id, repo_name }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(repo: &str, name: &str, en: &str) -> PeopleIndexEntry {
        PeopleIndexEntry { name: name.to_string(), name_en: en.to_string(), repo_id: repo.to_string() }
    }

    #[test]
    fn replace_slice_swaps_repo_segment_only() {
        let base = vec![entry("a", "علي", "Ali"), entry("b", "سارة", "Sara")];
        let next = replace_slice(base, "a", vec![("كريم".to_string(), "Karim".to_string())]);
        assert_eq!(next.len(), 2);
        assert!(next.iter().any(|e| e.repo_id == "b" && e.name == "سارة"));
        assert!(next.iter().any(|e| e.repo_id == "a" && e.name == "كريم"));
        assert!(!next.iter().any(|e| e.name == "علي"));
    }

    #[test]
    fn empty_people_drops_segment_and_skips_blank_rows() {
        let base = vec![entry("a", "علي", "Ali"), entry("b", "سارة", "Sara")];
        let next = replace_slice(base, "a", vec![("".to_string(), "".to_string())]);
        assert_eq!(next.len(), 1);
        assert_eq!(next[0].repo_id, "b");
    }

    #[test]
    fn duplicate_names_in_same_repo_coexist() {
        let next = replace_slice(
            Vec::new(),
            "a",
            vec![
                ("محمد".to_string(), "Mohamed".to_string()),
                ("محمد".to_string(), "Mohamed".to_string()),
            ],
        );
        assert_eq!(next.len(), 2);
    }

    #[test]
    fn read_people_orders_by_sort_order() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE peoples (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0);
             INSERT INTO peoples (id, name, name_en, sort_order) VALUES ('2', 'ب', 'B', 1), ('1', 'أ', 'A', 0);",
        )
        .unwrap();
        let people = read_people(&conn).unwrap();
        assert_eq!(people, vec![("أ".to_string(), "A".to_string()), ("ب".to_string(), "B".to_string())]);
    }
}
