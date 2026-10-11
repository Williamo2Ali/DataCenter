// سجل التبويبات العام (tabs.json): الأنواع TabDto/GlobalTab/TabInput، القراءة والكتابة،
// التطبيع، والمزامنة مع قاعدة كل مستودع + أوامر list_default_tabs / save_default_tabs.

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabDto {
    pub id: String,
    pub title: String,
    pub title_en: String,
    pub kind: String,
    pub table_name: Option<String>,
    pub sort_order: i64,
    pub is_hidden: bool,
    /// حذف ناعم: البيانات ممسوحة والتبويب مستثنى من كل العروض — يُستعاد فارغاً.
    pub is_deleted: bool,
}

// سجل المصنع المركزي (متقاعَد): كان التبويبات عامة على مستوى التطبيق —
// الآن كل مستودع معزول والقالب ثوابت في الكود؛ يُحفَظ دون مزامنة لأي مستودع.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(super) struct GlobalTab {
    pub(super) id: String,
    pub(super) title: String,
    /// السجلات القديمة لا تحوي هذا الحقل — يُقرأ كسلسلة فارغة.
    #[serde(default)]
    pub(super) title_en: String,
    pub(super) sort_order: i64,
    /// نوع التخزين: فيزيائي للأساسية، عام للمخصصة.
    #[serde(default = "default_kind")]
    pub(super) kind: String,
    #[serde(default)]
    pub(super) table_name: Option<String>,
}

pub(super) fn default_kind() -> String {
    "core".to_string()
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TabInput {
    #[serde(default)]
    pub(super) id: String,
    pub(super) title: String,
    /// العنوان الإنكليزي اختياري: تركه فارغاً يتيح للتطبيق أن يعرض دعوة للتعديل.
    #[serde(default)]
    pub(super) title_en: String,
}

// ================= سجل التبويبات العام =================

pub(super) fn tabs_registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_root(app)?.join(TABS_FILE))
}

pub(super) fn default_registry() -> Vec<GlobalTab> {
    TABS
        .iter()
        .enumerate()
        .map(|(i, (id, title, title_en))| GlobalTab {
            id: (*id).to_string(),
            title: (*title).to_string(),
            title_en: (*title_en).to_string(),
            sort_order: i as i64,
            kind: "core".to_string(),
            table_name: Some((*id).to_string()),
        })
        .collect()
}

/// تعبئة الاسم الإنكليزي للتبويبات الافتراضية التي سُجِّلت قبل دعم اللغتين.
/// التبويب الذي يحمل معرّفاً افتراضياً يُملأ إنكليزه من TABS — تماماً كما افترضنا
/// أسماءه العربية عند التأسيس. المعرّفات غير المعروفة (أضافها المستخدم) تبقى كما هي.
pub(super) fn backfill_default_titles_en(tabs: &mut [GlobalTab]) -> bool {
    let mut changed = false;
    for tab in tabs.iter_mut() {
        if !tab.title_en.trim().is_empty() {
            continue;
        }
        if let Some((_, _, title_en)) = TABS.iter().find(|(id, _, _)| *id == tab.id) {
            tab.title_en = (*title_en).to_string();
            changed = true;
        }
    }
    changed
}

pub(super) fn read_tabs_registry(app: &AppHandle) -> Result<Vec<GlobalTab>, String> {
    let path = tabs_registry_path(app)?;
    if !path.exists() {
        let seeded = default_registry();
        write_tabs_registry(app, &seeded)?;
        return Ok(seeded);
    }
    let raw = std::fs::read(&path).map_err(|_| "تعذر قراءة سجل التبويبات.".to_string())?;
    let mut parsed: Vec<GlobalTab> =
        serde_json::from_slice(&raw).map_err(|_| "سجل التبويبات تالف.".to_string())?;
    if parsed.is_empty() {
        return Err("سجل التبويبات فارغ.".to_string());
    }
    // ترقية لقطة واحدة: تُكتب مرة واحدة ثم تصبح قراءة عادية.
    if backfill_default_titles_en(&mut parsed) {
        write_tabs_registry(app, &parsed)?;
    }
    Ok(parsed)
}

pub(super) fn write_tabs_registry(app: &AppHandle, tabs: &[GlobalTab]) -> Result<(), String> {
    let path = tabs_registry_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| "تعذر إنشاء مجلد بيانات التطبيق.".to_string())?;
    }
    let raw = serde_json::to_vec_pretty(tabs).map_err(|_| "تعذر حفظ سجل التبويبات.".to_string())?;
    std::fs::write(&path, raw).map_err(|_| "تعذر حفظ سجل التبويبات.".to_string())
}

/// تنقية مدخلات المستخدم: عنوان مطلوب، معرّف فريد ومستقر، وترتيب منطقي.
pub(super) fn normalize_registry(input: Vec<TabInput>) -> Result<Vec<GlobalTab>, String> {
    let mut out: Vec<GlobalTab> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for item in input {
        let title = item.title.trim().to_string();
        if title.is_empty() {
            continue;
        }
        let base = sanitize_id(if item.id.trim().is_empty() { &title } else { item.id.trim() });
        let mut candidate = base.clone();
        let mut n = 2;
        while seen.contains(&candidate) {
            candidate = format!("{base}-{n}");
            n += 1;
        }
        seen.push(candidate.clone());
        out.push(GlobalTab {
            id: candidate,
            title,
            // يُحفظ فارغاً كما هو: الواجهة تعرض عندها دعوة لتعبئته.
            title_en: item.title_en.trim().to_string(),
            sort_order: out.len() as i64,
            // المضاف من المستخدم دائماً مخصص — الأساسية السبعة ثابتة.
            kind: "custom".to_string(),
            table_name: None,
        });
    }
    if out.is_empty() {
        return Err("يجب أن يبقى تبويب واحد على الأقل.".to_string());
    }
    Ok(out)
}

/// يسجّل التبويبات داخل قاعدة مستودع واحد: إضافة الناقص + مزامنة العناوين والترتيب.
/// التبويبات المحذوفة من السجل لا تُحذف من قاعدة المستودع (بياناتها) — بل تُخفى عند العرض.
/// (متقاعَد مع العزل — لا يستدعيه الإنتاج.)
#[allow(dead_code)]
pub(super) fn sync_repo_tabs(conn: &Connection, registry: &[GlobalTab]) -> Result<(), String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("تعذر بدء المعاملة: {e}"))?;
    {
        let mut insert = tx
            .prepare("INSERT OR IGNORE INTO tabs (id, title, title_en, kind, table_name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)")
            .map_err(|e| e.to_string())?;
        let mut update = tx
            .prepare("UPDATE tabs SET title = ?2, title_en = ?3, sort_order = ?4 WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        for tab in registry {
            insert
                .execute(params![tab.id, tab.title, tab.title_en, tab.kind, tab.table_name.clone().unwrap_or_default(), tab.sort_order, now_db()])
                .map_err(|e| e.to_string())?;
            update
                .execute(params![tab.id, tab.title, tab.title_en, tab.sort_order])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| format!("تعذر حفظ التبويبات: {e}"))?;
    Ok(())
}

/// (متقاعَد مع العزل — لا يستدعيه الإنتاج.)
#[allow(dead_code)]
pub(super) fn each_repo_db(app: &AppHandle) -> Vec<PathBuf> {
    let Ok(root) = repos_root(app) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() && path.join(DB_FILE).exists())
        .collect()
}

pub(super) fn to_dto(tabs: &[GlobalTab]) -> Vec<TabDto> {
    tabs.iter()
        .map(|tab| TabDto {
            id: tab.id.clone(),
            title: tab.title.clone(),
            title_en: tab.title_en.clone(),
            kind: tab.kind.clone(),
            table_name: tab.table_name.clone(),
            sort_order: tab.sort_order,
            is_hidden: false,
            is_deleted: false,
        })
        .collect()
}

#[tauri::command]
pub fn list_default_tabs(app: AppHandle) -> Result<Vec<TabDto>, String> {
    Ok(to_dto(&read_tabs_registry(&app)?))
}

#[tauri::command]
pub fn save_default_tabs(app: AppHandle, tabs: Vec<TabInput>) -> Result<Vec<TabDto>, String> {
    // متقاعَد: كان يدفع السجل لكل المستودعات — يتعارض مع عزل المستودعات.
    // يُحفَظ في tabs.json فقط دون أي مزامنة؛ ولا يستدعيه أي مكوّن حالياً.
    let normalized = normalize_registry(tabs)?;
    write_tabs_registry(&app, &normalized)?;
    Ok(to_dto(&normalized))
}
