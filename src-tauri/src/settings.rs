// إعدادات التطبيق — ملف `settings.json` في جذر AppData (المصدر الوحيد).
// لا localStorage إطلاقاً. القراءة تدمج مع الافتراضيات، والكتابة ذرية
// (ملف مؤقت ثم إعادة تسمية). التالف يُحفَظ جانباً (`.bak`) ويُبدَأ بالافتراضيات.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocCategoryJson {
    pub key: String,
    pub ar: String,
    pub en: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsJson {
    pub font_size: i64,
    pub input_font_size: i64,
    pub button_font_size: i64,
    pub button_icon_size: i64,
    pub font_family: String,
    pub display_zoom: i64,
    pub field_lang: String,
    pub repo_sort: String,
    pub doc_categories: Vec<DocCategoryJson>,
    pub drive_folder_name: String,
    pub drive_folder_id: String,
}

pub(crate) const DEFAULT_DRIVE_FOLDER_NAME: &str = "DataCenter Sync";

fn default_settings() -> AppSettingsJson {
    AppSettingsJson {
        font_size: 17,
        input_font_size: 16,
        button_font_size: 15,
        button_icon_size: 16,
        font_family: "Cairo".to_string(),
        display_zoom: 100,
        field_lang: "ar".to_string(),
        repo_sort: "oldest".to_string(),
        doc_categories: Vec::new(),
        drive_folder_name: DEFAULT_DRIVE_FOLDER_NAME.to_string(),
        drive_folder_id: String::new(),
    }
}

fn num_in(value: Option<i64>, min: i64, max: i64, fallback: i64) -> i64 {
    match value {
        Some(n) if n >= min && n <= max => n,
        _ => fallback,
    }
}

fn get_num(raw: &serde_json::Value, key: &str) -> Option<i64> {
    raw.get(key)?.as_i64()
}

fn get_str(raw: &serde_json::Value, key: &str) -> Option<String> {
    raw.get(key)?.as_str().map(|s| s.to_string())
}

/// دمج قيمة خام (من الملف أو الواجهة) فوق الافتراضيات مع تحقق صارم.
/// لغة التطبيق ومظهره يعيشان في ملف البروفايل (profile.json) لا هنا.
fn merge_settings(raw: &serde_json::Value) -> AppSettingsJson {
    let base = default_settings();
    let field_lang = match get_str(raw, "fieldLang").as_deref() {
        Some("en") => "en".to_string(),
        _ => "ar".to_string(),
    };
    let repo_sort = match get_str(raw, "repoSort").as_deref() {
        Some("newest") => "newest".to_string(),
        Some("nameAsc") => "nameAsc".to_string(),
        Some("nameDesc") => "nameDesc".to_string(),
        Some("lastUsed") => "lastUsed".to_string(),
        Some("mostUsed") => "mostUsed".to_string(),
        Some("favorites") => "favorites".to_string(),
        _ => "oldest".to_string(),
    };
    let font_family = get_str(raw, "fontFamily")
        .map(|s| s.trim().chars().take(80).collect::<String>())
        .filter(|s| !s.is_empty())
        .unwrap_or(base.font_family);
    // اسم مجلد Drive إجباري: الفارغ أو المسافات يعود للافتراضي، بسقف 120 حرفاً.
    // المعرف يكتبه التطبيق نفسه بعد الإنشاء — يُقبَل فارغاً ويُقلَّم فقط.
    let drive_folder_name = get_str(raw, "driveFolderName")
        .map(|s| s.trim().chars().take(120).collect::<String>())
        .filter(|s| !s.is_empty())
        .unwrap_or(base.drive_folder_name);
    let drive_folder_id = get_str(raw, "driveFolderId")
        .map(|s| s.trim().chars().take(200).collect::<String>())
        .unwrap_or(base.drive_folder_id);
    let mut doc_categories: Vec<DocCategoryJson> = Vec::new();
    if let Some(arr) = raw.get("docCategories").and_then(|v| v.as_array()) {
        for item in arr.iter().take(50) {
            let key = item.get("key").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let ar = item.get("ar").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let en = item.get("en").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if key.is_empty() || (ar.is_empty() && en.is_empty()) {
                continue;
            }
            doc_categories.push(DocCategoryJson { key, ar, en });
        }
    }
    AppSettingsJson {
        font_size: num_in(get_num(raw, "fontSize"), 14, 32, base.font_size),
        input_font_size: num_in(get_num(raw, "inputFontSize"), 14, 32, base.input_font_size),
        button_font_size: num_in(get_num(raw, "buttonFontSize"), 12, 32, base.button_font_size),
        button_icon_size: num_in(get_num(raw, "buttonIconSize"), 12, 32, base.button_icon_size),
        font_family,
        display_zoom: num_in(get_num(raw, "displayZoom"), 80, 120, base.display_zoom),
        field_lang,
        repo_sort,
        doc_categories,
        drive_folder_name,
        drive_folder_id,
    }
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "تعذر تحديد مجلد بيانات التطبيق.".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|_| "تعذر إنشاء مجلد بيانات التطبيق.".to_string())?;
    Ok(dir.join(SETTINGS_FILE))
}

fn write_atomic(path: &std::path::Path, settings: &AppSettingsJson) -> Result<(), String> {
    let raw = serde_json::to_vec_pretty(settings).map_err(|_| "تعذر ترميز الإعدادات.".to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, raw).map_err(|_| "تعذر كتابة الإعدادات.".to_string())?;
    std::fs::rename(&tmp, path).map_err(|_| "تعذر حفظ الإعدادات.".to_string())?;
    Ok(())
}

/// قراءة الإعدادات (تُنشأ بالافتراضيات عند غياب الملف؛ التالف يُحفَظ `.bak`).
#[tauri::command]
pub fn read_app_settings(app: AppHandle) -> Result<AppSettingsJson, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        let defaults = default_settings();
        write_atomic(&path, &defaults)?;
        return Ok(defaults);
    }
    let raw_bytes = std::fs::read(&path).map_err(|_| "تعذر قراءة الإعدادات.".to_string())?;
    match serde_json::from_slice::<serde_json::Value>(&raw_bytes) {
        Ok(value) => Ok(merge_settings(&value)),
        Err(_) => {
            let _ = std::fs::copy(&path, path.with_extension("json.bak"));
            let defaults = default_settings();
            write_atomic(&path, &defaults)?;
            Ok(defaults)
        }
    }
}

/// حفظ الإعدادات (دمج + تحقق + كتابة ذرية) — يعيد النسخة المعتمدة.
#[tauri::command]
pub fn save_app_settings(app: AppHandle, settings: serde_json::Value) -> Result<AppSettingsJson, String> {
    let path = settings_path(&app)?;
    let merged = merge_settings(&settings);
    write_atomic(&path, &merged)?;
    Ok(merged)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merge_clamps_ranges_and_enums() {
        let merged = merge_settings(&json!({
            "fontSize": 99, "inputFontSize": 5, "displayZoom": 200,
            "fieldLang": "both", "repoSort": "bySize",
            "fontFamily": "   ", "docCategories": "nope",
        }));
        assert_eq!(merged.font_size, 17);
        assert_eq!(merged.input_font_size, 16);
        assert_eq!(merged.display_zoom, 100);
        // قيمة دخيلة للغة الحقول تُرَد للعربية.
        assert_eq!(merged.field_lang, "ar");
        // قيمة دخيلة للفرز تُرَد للأقدم (الترتيب الحالي).
        assert_eq!(merged.repo_sort, "oldest");
        assert_eq!(merged.font_family, "Cairo");
        assert!(merged.doc_categories.is_empty());
        // اسم مجلد Drive: الغائب والفارغ يعودان للافتراضي.
        assert_eq!(merged.drive_folder_name, "DataCenter Sync");
        assert_eq!(merged.drive_folder_id, "");
    }

    #[test]
    fn merge_normalizes_drive_folder() {
        let merged = merge_settings(&json!({ "driveFolderName": "  My Backups  ", "driveFolderId": "  abc123  " }));
        assert_eq!(merged.drive_folder_name, "My Backups");
        assert_eq!(merged.drive_folder_id, "abc123");
        let blank = merge_settings(&json!({ "driveFolderName": "   ", "driveFolderId": 42 }));
        assert_eq!(blank.drive_folder_name, "DataCenter Sync");
        assert_eq!(blank.drive_folder_id, "");
    }

    #[test]
    fn merge_keeps_valid_values_and_caps_categories() {
        let mut cats = Vec::new();
        for i in 0..60 {
            cats.push(json!({ "key": format!("k{i}"), "ar": "ع", "en": "e" }));
        }
        cats.push(json!({ "key": "", "ar": "x", "en": "y" }));
        cats.push(json!({ "key": "empty", "ar": "", "en": "" }));
        let merged = merge_settings(&json!({
            "fontSize": 20, "fieldLang": "en", "repoSort": "lastUsed",
            "fontFamily": "Tahoma", "docCategories": cats,
        }));
        assert_eq!(merged.font_size, 20);
        assert_eq!(merged.field_lang, "en");
        assert_eq!(merged.repo_sort, "lastUsed");
        assert_eq!(merged.font_family, "Tahoma");
        assert_eq!(merged.doc_categories.len(), 50, "سقف 50 والفارغ مرفوض");
    }
}
