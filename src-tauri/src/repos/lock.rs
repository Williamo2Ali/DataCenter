// قفل المستودعات بكلمة مرور: اشتقاق/تحقق PBKDF2 (hex)، ذاكرة الجلسة لكلمات المرور المثبتة،
// مزامنة حالة القفل مع الفهرس، وأوامر verify_repo_password / set_repo_password.

use tauri::AppHandle;
use super::*;

// ================= قفل المستودعات بكلمة مرور =================
// القفل هنا "بوابة فتح" على مستوى التطبيق (وليست تشفيراً للملفات):
// يُخزَّن salt + مشتق PBKDF2-SHA256 (120k مثل الحاويات) بصيغة hex،
// ولا تُخزَّن كلمة المرور نفسها أبداً.

pub(super) fn new_lock_record(password: &str) -> Result<(String, String), String> {
    if password.len() < 4 {
        return Err("كلمة مرور المستودع قصيرة جداً (4 أحرف على الأقل).".to_string());
    }
    let mut salt = [0u8; 16];
    getrandom::fill(&mut salt).map_err(|_| "تعذر توليد أرقام عشوائية آمنة.".to_string())?;
    let key = crate::vault::derive_key(password, &salt);
    Ok((hex_encode(&salt), hex_encode(&key)))
}

pub(super) fn verify_lock_password(meta: &RepoFile, password: &str) -> Result<(), String> {
    let (salt_hex, hash_hex) = match (&meta.password_salt, &meta.password_hash) {
        (Some(s), Some(h)) => (s, h),
        _ => return Err("المستودع غير مقفل.".to_string()),
    };
    let salt = hex_decode(salt_hex)?;
    let expected = hex_decode(hash_hex)?;
    if salt.len() != 16 || expected.len() != 32 {
        return Err("بيانات القفل تالفة.".to_string());
    }
    let key = crate::vault::derive_key(password, &salt);
    if key[..] == expected[..] {
        Ok(())
    } else {
        Err("كلمة مرور المستودع غير صحيحة.".to_string())
    }
}

// ================= ذاكرة الجلسة لكلمات المرور المثبتة =================
// تُغني عن إعادة اشتقاق PBKDF2 (120k تكرار) في كل عملية كتابة طالما الجلسة
// مفتوحة بنفس الكلمة — ذاكرة فقط، تُمسَح عند أي تغيير للقفل أو حذف المستودع.
pub(super) static VERIFIED_PASSWORDS: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<String, String>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

/// تحقق مع تخزين مؤقت: تطابق الجلسة يتخطى PBKDF2، وإلا تحقق كامل ثم تخزين.
pub(super) fn verify_lock_password_cached(id: &str, meta: &RepoFile, password: &str) -> Result<(), String> {
    if let Ok(map) = VERIFIED_PASSWORDS.lock() {
        if map.get(id).is_some_and(|p| p == password) {
            return Ok(());
        }
    }
    verify_lock_password(meta, password)?;
    if let Ok(mut map) = VERIFIED_PASSWORDS.lock() {
        map.insert(id.to_string(), password.to_string());
    }
    Ok(())
}

/// إسقاط المخزّن (تغيير/إلغاء القفل أو حذف المستودع) — وإلا قبلت كلمة قديمة.
pub(super) fn forget_verified_password(id: &str) {
    if let Ok(mut map) = VERIFIED_PASSWORDS.lock() {
        map.remove(id);
    }
}

pub(super) fn sync_index_lock(app: &AppHandle, id: &str, is_locked: bool) {
    if let Ok(mut index) = read_index(app) {
        let mut changed = false;
        for m in index.iter_mut() {
            if m.id == id && m.is_locked != is_locked {
                m.is_locked = is_locked;
                changed = true;
            }
        }
        if changed {
            let _ = write_index(app, &index);
        }
    }
}

#[tauri::command]
pub fn verify_repo_password(app: AppHandle, id: String, password: String) -> Result<(), String> {
    // مسار الحاوية: إثبات بالفك التجريبي (بلا تسجيل جلسة — الفتح هو من يسجل).
    let dir = repo_dir(&app, &id)?;
    let container = dir.join(CONTAINER_FILE);
    if container.exists() {
        let raw = std::fs::read(&container).map_err(|_| "ملف الحاوية غير موجود.".to_string())?;
        return container::decrypt_container_payload(&raw, &password)
            .map(|_| ())
            .map_err(|_| "كلمة مرور المستودع غير صحيحة.".to_string());
    }
    let (_, meta) = read_repo_file(&app, &id)?;
    if !meta.is_locked {
        return Ok(());
    }
    verify_lock_password_cached(&id, &meta, &password)
}

#[tauri::command]
pub fn set_repo_password(
    app: AppHandle,
    id: String,
    current_password: Option<String>,
    new_password: Option<String>,
) -> Result<RepoMeta, String> {
    // مسار الحاوية: إعادة تشفير المحتوى نفسه بالكلمة الجديدة (بلا مساس بالبيانات).
    let dir = repo_dir(&app, &id)?;
    let container = dir.join(CONTAINER_FILE);
    if container.exists() {
        let current = match current_password {
            Some(p) if !p.is_empty() => p,
            _ => return Err("أدخل كلمة المرور الحالية لتغيير القفل.".to_string()),
        };
        let new = match new_password {
            Some(p) if p.len() >= 4 => p,
            _ => return Err("إلغاء الكلمة مرفوض — المستودع مشفر دائماً.".to_string()),
        };
        let raw = std::fs::read(&container).map_err(|_| "ملف الحاوية غير موجود.".to_string())?;
        let header = container::read_header_from_bytes(&raw)?;
        let payload = container::decrypt_container_payload(&raw, &current)
            .map_err(|_| "كلمة المرور الحالية غير صحيحة.".to_string())?;
        let sealed = container::create_container_bytes(&header, &payload, &new)?;
        std::fs::write(&container, &sealed).map_err(|_| "تعذر كتابة ملف الحاوية.".to_string())?;
        // الجلسة المفتوحة بالقديمة تُسقَط — إعادة الفتح بالجديدة إلزامية.
        registry::close_open(&id);
        forget_verified_password(&id);
        return index_meta(&app, &id, &dir, &header);
    }
    let (_, mut meta) = read_repo_file(&app, &id)?;
    // القفل الجديد للنصي مرفوض هنا — طريقه الوحيد أمر التحويل المشفر.
    if !meta.is_locked {
        match &new_password {
            Some(p) if !p.is_empty() => {
                return Err("القفل الآن تحويل مشفر — استخدم زر القفل من بطاقة المستودع.".to_string())
            }
            _ => {}
        }
    }
    // إن كان مقفلاً حالياً: يجب إثبات الملكية بكلمة المرور الحالية أولاً
    if meta.is_locked {
        match current_password {
            Some(p) if !p.is_empty() => verify_lock_password(&meta, &p)?,
            _ => return Err("أدخل كلمة المرور الحالية لتغيير القفل.".to_string()),
        }
    }
    match new_password {
        Some(p) if !p.is_empty() => {
            let (salt, hash) = new_lock_record(&p)?;
            meta.password_salt = Some(salt);
            meta.password_hash = Some(hash);
            meta.is_locked = true;
        }
        _ => {
            meta.password_salt = None;
            meta.password_hash = None;
            meta.is_locked = false;
        }
    }
    write_repo_file(&app, &id, &meta)?;
    sync_index_lock(&app, &id, meta.is_locked);
    // أي تغيير للقفل يُسقط الكلمة المخزنة للجلسة — وإلا قبلت القديمة.
    forget_verified_password(&id);
    let dir = repo_dir(&app, &id)?;
    let index = read_index(&app)?;
    if let Some(m) = index.iter().find(|m| m.id == id) {
        return Ok(m.clone());
    }
    Ok(RepoMeta {
        id: id.clone(),
        name: meta.name,
        path: dir.to_string_lossy().to_string(),
        created_at: meta.created_at,
        is_locked: meta.is_locked,
        is_favorite: meta.is_favorite,
        last_opened_at: meta.last_opened_at,
        open_count: meta.open_count,
    })
}
