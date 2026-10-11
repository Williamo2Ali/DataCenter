// الملف الشخصي — ملف `profile.json` في جذر AppData (المصدر الوحيد في Tauri).
// لا localStorage إطلاقاً. القراءة تدمج مع الافتراضيات، والكتابة ذرية
// (ملف مؤقت ثم إعادة تسمية). التالف يُحفَظ جانباً (`.bak`) ويُبدَأ بالافتراضيات.
//
// بلا أي حقل سري: كلمة مرور التطبيق مؤجلة لاحقاً ولا تُخزَّن هنا إطلاقاً —
// أي مفتاح دخيل (مثل passwordHash قديم) يُتجاهَل عند الدمج ولا يُكتَب أبداً.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const PROFILE_FILE: &str = "profile.json";

/// سقف طول الـ dataURL (حوالي 225KB ثنائي) — صورة 256px عادة 20–50KB بعد base64.
const PHOTO_MAX_LEN: usize = 300_000;

const PHOTO_PREFIXES: [&str; 3] = [
    "data:image/jpeg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,",
];

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProfileJson {
    pub name: String,
    pub phone: String,
    pub email: String,
    pub city: String,
    pub country: String,
    pub notes: String,
    pub photo: Option<String>,
    /// لغة التطبيق — الافتراضي العربية.
    pub language: String,
    /// مظهر التطبيق — الافتراضي الفاتح.
    pub theme: String,
}

fn default_profile() -> ProfileJson {
    ProfileJson {
        name: String::new(),
        phone: String::new(),
        email: String::new(),
        city: String::new(),
        country: String::new(),
        notes: String::new(),
        photo: None,
        language: "ar".to_string(),
        theme: "light".to_string(),
    }
}

/// نص مقصوص لحد أقصى من الأحرف (حدود مطابقة لحقول الواجهة).
fn cut(value: Option<String>, max: usize) -> String {
    match value {
        Some(s) => s.trim().chars().take(max).collect(),
        None => String::new(),
    }
}

fn get_str(raw: &serde_json::Value, key: &str) -> Option<String> {
    raw.get(key)?.as_str().map(|s| s.to_string())
}

/// الصورة: تُقبَل بادئات jpeg/png/webp فقط وبسقف طول — أي شيء آخر
/// (svg/html/فارغ) مرفوض لأنها تُعرَض لاحقاً من الـ dataURL مباشرة.
fn clean_photo(raw: &serde_json::Value) -> Option<String> {
    let s = get_str(raw, "photo")?;
    let s = s.trim().to_string();
    if s.len() > PHOTO_MAX_LEN {
        return None;
    }
    if PHOTO_PREFIXES.iter().any(|p| s.starts_with(p)) {
        Some(s)
    } else {
        None
    }
}

/// دمج قيمة خام (من الملف أو الواجهة) فوق الافتراضيات مع تحقق صارم.
/// المفاتيح الدخيلة (passwordHash/info/...) تُتجاهَل — لا تُقرأ ولا تُكتَب.
fn merge_profile(raw: &serde_json::Value) -> ProfileJson {
    ProfileJson {
        name: cut(get_str(raw, "name"), 60),
        phone: cut(get_str(raw, "phone"), 20),
        email: cut(get_str(raw, "email"), 80),
        city: cut(get_str(raw, "city"), 60),
        country: cut(get_str(raw, "country"), 60),
        notes: cut(get_str(raw, "notes"), 500),
        photo: clean_photo(raw),
        language: match get_str(raw, "language").as_deref() {
            Some("en") => "en".to_string(),
            _ => "ar".to_string(),
        },
        theme: match get_str(raw, "theme").as_deref() {
            Some("dark") => "dark".to_string(),
            _ => "light".to_string(),
        },
    }
}

fn profile_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "تعذر تحديد مجلد بيانات التطبيق.".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|_| "تعذر إنشاء مجلد بيانات التطبيق.".to_string())?;
    Ok(dir.join(PROFILE_FILE))
}

/// ترحيل اللغة والمظهر من إعدادات التطبيق عند إنشاء الملف لأول مرة.
/// القيم الغائبة أو غير الصالحة تُترَك على الافتراضيات (عربية/فاتح).
fn seed_general_from_settings(app: &AppHandle, fresh: &mut ProfileJson) {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return,
    };
    let raw_bytes = match std::fs::read(dir.join("settings.json")) {
        Ok(b) => b,
        Err(_) => return,
    };
    let value: serde_json::Value = match serde_json::from_slice(&raw_bytes) {
        Ok(v) => v,
        Err(_) => return,
    };
    if value.get("language").and_then(|v| v.as_str()) == Some("en") {
        fresh.language = "en".to_string();
    }
    if value.get("theme").and_then(|v| v.as_str()) == Some("dark") {
        fresh.theme = "dark".to_string();
    }
}

fn write_atomic(path: &std::path::Path, profile: &ProfileJson) -> Result<(), String> {
    let raw = serde_json::to_vec_pretty(profile).map_err(|_| "تعذر ترميز الملف الشخصي.".to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, raw).map_err(|_| "تعذر كتابة الملف الشخصي.".to_string())?;
    std::fs::rename(&tmp, path).map_err(|_| "تعذر حفظ الملف الشخصي.".to_string())?;
    Ok(())
}

/// قراءة الملف الشخصي (يُنشأ بالافتراضيات عند غياب الملف؛ التالف يُحفَظ `.bak`).
/// عند الإنشاء لأول مرة تُورَّث اللغة والمظهر من `settings.json` إن وُجدا
/// (ترحيل لمرة واحدة — الملف بعدها هو المصدر الوحيد لهما).
#[tauri::command]
pub fn read_profile(app: AppHandle) -> Result<ProfileJson, String> {
    let path = profile_path(&app)?;
    if !path.exists() {
        let mut fresh = default_profile();
        seed_general_from_settings(&app, &mut fresh);
        write_atomic(&path, &fresh)?;
        return Ok(fresh);
    }
    let raw_bytes = std::fs::read(&path).map_err(|_| "تعذر قراءة الملف الشخصي.".to_string())?;
    match serde_json::from_slice::<serde_json::Value>(&raw_bytes) {
        Ok(value) => Ok(merge_profile(&value)),
        Err(_) => {
            let _ = std::fs::copy(&path, path.with_extension("json.bak"));
            let defaults = default_profile();
            write_atomic(&path, &defaults)?;
            Ok(defaults)
        }
    }
}

/// حفظ الملف الشخصي (دمج + تحقق + كتابة ذرية) — يعيد النسخة المعتمدة.
#[tauri::command]
pub fn save_profile(app: AppHandle, profile: serde_json::Value) -> Result<ProfileJson, String> {
    let path = profile_path(&app)?;
    let merged = merge_profile(&profile);
    write_atomic(&path, &merged)?;
    Ok(merged)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merge_keeps_valid_values_and_ignores_secrets() {
        let merged = merge_profile(&json!({
            "name": "  أحمد  ",
            "phone": "0123",
            "email": "a@b.c",
            "city": "القاهرة",
            "country": "مصر",
            "notes": "ملاحظة",
            "photo": "data:image/jpeg;base64,/9j/",
            "passwordHash": "deadbeef",
            "info": "legacy",
        }));
        assert_eq!(merged.name, "أحمد");
        assert_eq!(merged.phone, "0123");
        assert_eq!(merged.photo.as_deref(), Some("data:image/jpeg;base64,/9j/"));
        let raw = serde_json::to_value(&merged).unwrap();
        assert!(raw.get("passwordHash").is_none());
        assert!(raw.get("info").is_none());
    }

    #[test]
    fn merge_rejects_bad_photo_and_clamps_lengths() {
        let merged = merge_profile(&json!({
            "name": "x".repeat(200),
            "notes": "y".repeat(900),
            "photo": "data:image/svg+xml;base64,PHN2Zz4=",
            "language": "fr",
            "theme": "neon",
        }));
        assert_eq!(merged.name.chars().count(), 60);
        assert_eq!(merged.notes.chars().count(), 500);
        assert!(merged.photo.is_none());
        assert_eq!(merged.language, "ar");
        assert_eq!(merged.theme, "light");
        let too_long = format!("data:image/png;base64,{}", "A".repeat(PHOTO_MAX_LEN));
        assert!(merge_profile(&json!({ "photo": too_long })).photo.is_none());
    }

    #[test]
    fn merge_keeps_valid_general_values() {
        let merged = merge_profile(&json!({ "language": "en", "theme": "dark" }));
        assert_eq!(merged.language, "en");
        assert_eq!(merged.theme, "dark");
    }
}
