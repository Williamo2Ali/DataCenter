// المستودعات: مجلد حي لكل مستودع (data.db + files/) + فهرس مركزي.
// المستودع المفتوح (isLocked=false): قيم plaintext + ملفات عادية محمية من الحذف.
// أوامر: list_repos / create_repo / open_repo / resolve_repo_file.
//
// البنية: هذا الملف جذر وحدة `repos` ويحوي أنواع المستودع (RepoMeta/RepoFile) وفهرسه
// وقائمة المستودعات (list/create/rename/delete/استعادة الافتراضي). بقية الوظائف في `repos/`:
//   common      أدوات مشتركة (وقت، UUID، مسارات، بوابة الكتابة، تنظيف المدخلات)  container  الحاوية المشفرة (repo.vault: ترويسة 4KB + حمولة AES-GCM)
//   lock        قفل المستودع بكلمة مرور                 schema     السكيما والبذر والقيم الافتراضية
//   tabs        سجل التبويبات العام                      open       فتح المستودع (RepoData)
//   store       دورة القاعدة الحية (ذاكرة + حفظ مشفر + ترويسة)  registry   سجل المفتوحة (ذاكرة الجلسة + حفظ)
//   media       الوسائط المشفرة (أسماء معتمة + فك لحظة العرض)
//   lockmigrate تحويل النصي إلى حاوية مشفرة (القفل)
//   share       المشاركة (فك للكاش + تصدير الحاوية + مسح مؤكد)
//   people      الأفراد                                  transfer   تصدير/استيراد قاعدة البيانات
//   documents   ملفات المستودع + المشاركة                passport   جداول 1-1 (جواز/دراسة/هوية/مدني)
//   accounts    الحسابات                                 contacts   جهات الاتصال
//   columns     إخفاء/حذف/تسمية الأعمدة الثابتة          custom_tabs  التبويبات المخصصة وأعمدتها
// كل أوامر Tauri ما زالت تُصدَّر من `repos::` عبر `pub use` (لا تغيير في `generate_handler!`).

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

mod accounts;
mod columns;
mod common;
pub(crate) mod container;
mod contacts;
mod custom_tabs;
mod documents;
mod lock;
pub(crate) mod lock_migrate;
pub(crate) mod media;
mod open;
mod passport;
mod people;
pub(crate) mod registry;
mod schema;
pub(crate) mod share;
pub(crate) mod store;
mod tabs;
mod transfer;

pub use accounts::*;
pub use columns::*;
use common::*;
pub use contacts::*;
pub use custom_tabs::*;
pub use documents::*;
pub use lock::*;
pub use lock_migrate::*;
pub use open::*;
pub use passport::*;
pub use people::*;
pub(crate) use schema::*;
pub use tabs::*;
pub use transfer::*;

#[cfg(test)]
mod tests;

const REPOS_DIR: &str = "repos";
const INDEX_FILE: &str = "repos.json";
const FILES_DIR: &str = "files";
/// ملف الحاوية الوحيد للمستودع (الترويسة 4KB أولاً ثم الحمولة المشفرة) — بلا data.db.
const CONTAINER_FILE: &str = "repo.vault";
const DB_FILE: &str = "data.db";
const REPO_META_FILE: &str = "repo.json";
const TABS_FILE: &str = "tabs.json";
/// نسخة السكيما (v3): `peoples` بدل `records`، حذف `fields` و`images` نهائياً،
/// طابعان زمنيان لكل جدول، وكل `id` بصيغة UUID المقسّمة (36 حرفاً).
/// أي نسخة أقدم تُرفض برسالة صريحة — البيانات الوهمية تُحذف وتُعاد.
const SCHEMA_VERSION: u32 = 3;

// ================= الأنواع =================

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoMeta {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: u64,
    pub is_locked: bool,
    /// مفضلة المستخدم — تُثبَّت أعلى القائمة في وضع الفرز بالمفضلة.
    #[serde(default)]
    pub is_favorite: bool,
    /// آخر فتح ناجح (ثواني) — 0 تعني لم يُفتَح أبداً.
    #[serde(default)]
    pub last_opened_at: u64,
    /// عدد الفتحات الناجحة — لفرز الأكثر استخداماً.
    #[serde(default)]
    pub open_count: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoFile {
    name: String,
    created_at: u64,
    is_locked: bool,
    schema_version: u32,
    #[serde(default)]
    password_salt: Option<String>,
    #[serde(default)]
    password_hash: Option<String>,
    /// انظر RepoMeta — القيم الافتراضية للملفات القديمة.
    #[serde(default)]
    is_favorite: bool,
    #[serde(default)]
    last_opened_at: u64,
    #[serde(default)]
    open_count: u64,
}

/// لمس الاستخدام عند كل فتح ناجح — في الفهرس فقط (الأفضل جهداً بصمت).
/// يُستدعَى بعد بناء اللقطة: فشله لا يُفشل الفتح أبداً.
pub(super) fn touch_index_usage(app: &AppHandle, id: &str) {
    if let Ok(mut index) = read_index(app) {
        let mut changed = false;
        for m in index.iter_mut() {
            if m.id == id {
                m.last_opened_at = now_secs();
                m.open_count = m.open_count.saturating_add(1);
                changed = true;
            }
        }
        if changed {
            let _ = write_index(app, &index);
        }
    }
}

/// نواة الدمج في متجه الفهرس — بلا كتابة (الكتابة دفعة واحدة عند المستدعي).
/// الاسم دائماً من المصدر الحقيقي (ترويسة أو وصف نصي)، وحالة الواجهة محفوظة.
fn upsert_index_entry(
    index: &mut Vec<RepoMeta>,
    id: &str,
    dir: &std::path::Path,
    name: &str,
    locked: bool,
) -> RepoMeta {
    match index.iter_mut().find(|m| m.id == id) {
        Some(m) => {
            m.name = name.to_string();
            m.is_locked = locked;
            m.clone()
        }
        None => {
            let m = RepoMeta {
                id: id.to_string(),
                name: name.to_string(),
                path: dir.to_string_lossy().to_string(),
                created_at: now_secs(),
                is_locked: locked,
                is_favorite: false,
                last_opened_at: 0,
                open_count: 0,
            };
            index.push(m.clone());
            m
        }
    }
}

/// دمج الترويسة (الحقيقة للاسم) مع الفهرس (حالة الواجهة: مفضلة/استخدام/إنشاء).
/// مدخل ناقص (نسخة USB مثلاً) يُنشَأ بأول مشاهدة.
pub(super) fn index_meta(
    app: &AppHandle,
    id: &str,
    dir: &std::path::Path,
    header: &container::RepoHeader,
) -> Result<RepoMeta, String> {
    let mut index = read_index(app)?;
    let meta = upsert_index_entry(&mut index, id, dir, &header.name, true);
    write_index(app, &index)?;
    Ok(meta)
}

/// بوابة وصول (قراءة/مشاركة/تصدير/تهيئة نسخ الواجهة): مقفل → كلمة غير فارغة،
/// نصي → البوابة القديمة بسجل القفل. التحقق الحقيقي للكلمة يتم عند الفك/الجلسة.
pub(super) fn gate_repo_access(app: &AppHandle, id: &str, password: Option<String>) -> Result<(), String> {
    let dir = repo_dir(app, id)?;
    if dir.join(CONTAINER_FILE).exists() {
        match password {
            Some(p) if !p.is_empty() => Ok(()),
            _ => Err("أدخل كلمة مرور المستودع.".to_string()),
        }
    } else {
        gate_repo_write(app, id, password)
    }
}

/// نمط كل أوامر الكتابة (فئة مزدوجة): تحقق المدخلات أولاً عند المستدعي، ثم:
/// مقفل → فتح تلقائي للجلسة إن لزم + عملية + حفظ مشفر + لقطة جديدة.
/// نصي → البوابة القديمة + ملف + لقطة. تُرجَع (نتيجة العملية، اللقطة).
pub(super) fn mutate_repo<T>(
    app: &AppHandle,
    id: &str,
    password: Option<String>,
    op: impl FnOnce(&mut Connection) -> Result<T, String>,
) -> Result<(T, RepoData), String> {
    let dir = repo_dir(app, id)?;
    let container = dir.join(CONTAINER_FILE);
    if container.exists() {
        let pw = match password {
            Some(p) if !p.is_empty() => p,
            _ => return Err("أدخل كلمة مرور المستودع.".to_string()),
        };
        let files_dir = dir.join(FILES_DIR);
        if !registry::is_open(id) {
            let entry = registry::build_entry(&container, &files_dir, &pw)?;
            registry::register_open(id, entry);
        }
        let out = registry::with_open_conn(id, &pw, op)?;
        let data = registry::dto_with_open(id, &pw, |conn, header| {
            let meta = index_meta(app, id, &dir, header)?;
            repo_data_from_conn(conn, &files_dir, meta)
        })?;
        touch_index_usage(app, id);
        Ok((out, data))
    } else {
        gate_repo_write(app, id, password.clone())?;
        let mut conn = open_repo_db(app, id)?;
        let out = op(&mut conn)?;
        let data = open_repo(app.clone(), id.to_string(), password)?;
        Ok((out, data))
    }
}

/// قراءة من المستودع بلا حفظ (تصدير/فحص): مقفل → فتح تلقائي للجلسة + تنفيذ،
/// نصي → البوابة القديمة + ملف. للعمليات التي لا تعدّل البيانات.
pub(super) fn read_repo<T>(
    app: &AppHandle,
    id: &str,
    password: Option<String>,
    f: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let dir = repo_dir(app, id)?;
    let container = dir.join(CONTAINER_FILE);
    if container.exists() {
        let pw = match password {
            Some(p) if !p.is_empty() => p,
            _ => return Err("أدخل كلمة مرور المستودع.".to_string()),
        };
        let files_dir = dir.join(FILES_DIR);
        if !registry::is_open(id) {
            let entry = registry::build_entry(&container, &files_dir, &pw)?;
            registry::register_open(id, entry);
        }
        registry::dto_with_open(id, &pw, |conn, _| f(conn))
    } else {
        gate_repo_write(app, id, password)?;
        let conn = open_repo_db(app, id)?;
        f(&conn)
    }
}

/// تبديل المفضلة — في الفهرس فقط، بلا مساس بالحاوية أو أي بيانات.
#[tauri::command]
pub fn toggle_favorite(app: AppHandle, id: String) -> Result<RepoMeta, String> {
    let mut index = read_index(&app)?;
    let pos = index
        .iter()
        .position(|m| m.id == id)
        .ok_or("المستودع غير موجود.".to_string())?;
    index[pos].is_favorite = !index[pos].is_favorite;
    write_index(&app, &index)?;
    Ok(index[pos].clone())
}

fn read_repo_file(app: &AppHandle, id: &str) -> Result<(PathBuf, RepoFile), String> {
    let dir = repo_dir(app, id)?;
    let raw = std::fs::read(dir.join(REPO_META_FILE))
        .map_err(|_| "وصف المستودع غير موجود.".to_string())?;
    let meta: RepoFile =
        serde_json::from_slice(&raw).map_err(|_| "وصف المستودع تالف.".to_string())?;
    Ok((dir, meta))
}

fn write_repo_file(app: &AppHandle, id: &str, meta: &RepoFile) -> Result<(), String> {
    let dir = repo_dir(app, id)?;
    let raw = serde_json::to_vec_pretty(meta).map_err(|_| "تعذر كتابة وصف المستودع.".to_string())?;
    std::fs::write(dir.join(REPO_META_FILE), raw).map_err(|_| "تعذر كتابة وصف المستودع.".to_string())
}

// ================= الأوامر =================

#[tauri::command]
pub fn list_repos(app: AppHandle) -> Result<Vec<RepoMeta>, String> {
    // فئتان: حاوية مشفرة (الترويسة حقيقة الاسم بلا كلمة) ونصي قديم (الوصف).
    // مجلد بلا أي منهما صالحاً يُتجاهَل — وبلا مصدر حقيقة ثالث.
    let root = repos_root(&app)?;
    let mut index = read_index(&app)?;
    let mut out: Vec<RepoMeta> = Vec::new();
    let entries =
        std::fs::read_dir(&root).map_err(|_| "تعذر قراءة مجلد المستودعات.".to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().into_owned();
        if let Ok(raw) = std::fs::read(path.join(CONTAINER_FILE)) {
            if let Ok(header) = container::read_header_from_bytes(&raw) {
                out.push(upsert_index_entry(&mut index, &id, &path, &header.name, true));
                continue;
            }
        }
        if let Ok(raw) = std::fs::read(path.join(REPO_META_FILE)) {
            if let Ok(file) = serde_json::from_slice::<RepoFile>(&raw) {
                if !file.name.trim().is_empty() {
                    out.push(upsert_index_entry(&mut index, &id, &path, &file.name, file.is_locked));
                    continue;
                }
            }
        }
    }
    // تقليم مداخل الفهرس لمجلدات زالت.
    index.retain(|m| out.iter().any(|o| o.id == m.id));
    write_index(&app, &index)?;
    out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(out)
}

/// حجم المستودع الكلي بالبايت (مجلده كاملاً — بلا حاجة لكلمة المرور).
#[tauri::command]
pub fn repo_size(app: AppHandle, repo_id: String) -> Result<u64, String> {
    let dir = repo_dir(&app, &repo_id)?;
    Ok(dir_size(&dir))
}

/// مجموع أحجام الملفات تحت مجلد (تكراري — يتجاهل الروابط وما تعذّر قراءته).
fn dir_size(dir: &PathBuf) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![dir.clone()];
    while let Some(path) = stack.pop() {
        let entries = match std::fs::read_dir(&path) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                stack.push(entry.path());
            } else if let Ok(meta) = entry.metadata() {
                total = total.saturating_add(meta.len());
            }
        }
    }
    total
}

#[tauri::command]
pub fn create_repo(
    app: AppHandle,
    name: String,
    password: Option<String>,
    members: Option<Vec<String>>,
    with_defaults: Option<bool>,
) -> Result<RepoMeta, String> {
    let display = name.trim().to_string();
    if display.is_empty() {
        return Err("اسم المستودع فارغ.".to_string());
    }
    // أسماء الأعضاء: تنظيف + تجاهل الفارغ + سقف 20 + قص الطويل (80 حرفاً).
    let member_names: Vec<String> = members
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.trim().chars().take(80).collect::<String>())
        .filter(|m| !m.is_empty())
        .take(20)
        .collect();
    // الفئة المزدوجة: كلمة من 4 أحرف فأكثر = حاوية مشفرة، وغيابها = نصي قديم.
    let password = match password {
        Some(p) if !p.is_empty() => {
            if p.len() < 4 {
                return Err("كلمة المستودع قصيرة جداً (4 أحرف على الأقل).".to_string());
            }
            Some(p)
        }
        _ => None,
    };
    let id = sanitize_id(&display);
    let dir = repo_dir(&app, &id)?;
    if dir.exists() {
        return Err("مستودع بهذا الاسم موجود مسبقاً.".to_string());
    }

    // تنظيف عند أي فشل (لا حالة نصف مبنية)
    let cleanup = |dir: &PathBuf| {
        let _ = std::fs::remove_dir_all(dir);
    };

    let result: Result<RepoMeta, String> = (|| {
        std::fs::create_dir_all(dir.join(FILES_DIR)).map_err(|_| "تعذر إنشاء مجلد المستودع.".to_string())?;

        let created_at = now_secs();
        let locked = password.is_some();
        if let Some(pw) = password {
            // حاوية مشفرة: بناء في الذاكرة ثم ختم — لا ملف نصي أبداً.
            let conn = Connection::open_in_memory().map_err(|e| format!("تعذر إنشاء قاعدة البيانات: {e}"))?;
            create_schema(&conn)?;
            seed_repo_structure(&conn, &member_names, with_defaults.unwrap_or(true))?;
            let mut header = container::new_header(&id, &display)?;
            store::save_vault_file(&dir.join(CONTAINER_FILE), &mut header, &conn, &pw)?;
            drop(conn);
        } else {
            // نصي قديم (الفئة غير المقفلة): وصف + ملف قاعدة نصي.
            let meta_file = RepoFile {
                name: display.clone(),
                created_at,
                is_locked: false,
                schema_version: SCHEMA_VERSION,
                password_salt: None,
                password_hash: None,
                is_favorite: false,
                last_opened_at: 0,
                open_count: 0,
            };
            let raw = serde_json::to_vec_pretty(&meta_file).map_err(|_| "تعذر كتابة وصف المستودع.".to_string())?;
            std::fs::write(dir.join(REPO_META_FILE), raw).map_err(|_| "تعذر كتابة وصف المستودع.".to_string())?;
            let conn = Connection::open(dir.join(DB_FILE)).map_err(|e| format!("تعذر إنشاء قاعدة البيانات: {e}"))?;
            create_schema(&conn)?;
            seed_repo_structure(&conn, &member_names, with_defaults.unwrap_or(true))?;
            drop(conn);
        }

        let meta = RepoMeta {
            id: id.clone(),
            name: display,
            path: dir.to_string_lossy().to_string(),
            created_at,
            is_locked: locked,
            is_favorite: false,
            last_opened_at: 0,
            open_count: 0,
        };
        let mut index = read_index(&app)?;
        index.retain(|m| m.id != id);
        index.push(meta.clone());
        write_index(&app, &index)?;
        Ok(meta)
    })();

    if result.is_err() {
        cleanup(&dir);
    }
    result
}

/// استعادة الافتراضي للمستودع الحالي: دمج الجداول والحقول الناقصة فقط.
#[tauri::command]
pub fn restore_repo_defaults(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
        merge_factory_defaults(conn)?;
        // الاستعادة تمسح كل وسوم الإخفاء — المخفي يعود ببياناته.
        clear_hidden_columns(conn)?;
        // ... وتمسح كل وسوم الحذف الناعم — المحذوف يعود فارغاً.
        clear_deleted_columns(conn)?;
        // ... وتمسح كل تجاوزات التسميات — فتعود تسميات الكود الأصلية.
        clear_base_labels(conn)?;
        Ok(())
    })?;
    Ok(data)
}

/// تغيير اسم العرض للمستودع — يُكتَب في الترويسة (الحقيقة) والفهرس معاً.
/// المفتوح يُحدَّث عبر الجلسة (وإلا الترويسة القديمة تطغى عند الحفظ التالي).
#[tauri::command]
pub fn rename_repo(app: AppHandle, id: String, password: Option<String>, name: String) -> Result<RepoMeta, String> {
    let display = name.trim().chars().take(80).collect::<String>();
    if display.is_empty() {
        return Err("اسم المستودع فارغ.".to_string());
    }
    let dir = repo_dir(&app, &id)?;
    let container = dir.join(CONTAINER_FILE);
    if !container.exists() {
        // نصي قديم: سجل القفل القديم يحكم — غير المقفل بلا كلمة.
        let (_, mut meta) = read_repo_file(&app, &id)?;
        if meta.is_locked {
            match &password {
                Some(p) if !p.is_empty() => verify_lock_password_cached(&id, &meta, p)?,
                _ => return Err("أدخل كلمة مرور المستودع.".to_string()),
            }
        }
        meta.name = display;
        write_repo_file(&app, &id, &meta)?;
        let mut index = read_index(&app)?;
        if let Some(entry) = index.iter_mut().find(|m| m.id == id) {
            entry.name = meta.name.clone();
            entry.is_locked = meta.is_locked;
        }
        write_index(&app, &index)?;
        return Ok(RepoMeta {
            id: id.clone(),
            name: meta.name,
            path: dir.to_string_lossy().to_string(),
            created_at: meta.created_at,
            is_locked: meta.is_locked,
            is_favorite: meta.is_favorite,
            last_opened_at: meta.last_opened_at,
            open_count: meta.open_count,
        });
    }
    let password = match password {
        Some(p) if !p.is_empty() => p,
        _ => return Err("أدخل كلمة مرور المستودع.".to_string()),
    };
    let raw = std::fs::read(&container).map_err(|_| "ملف الحاوية غير موجود.".to_string())?;
    let mut header = container::read_header_from_bytes(&raw)?;
    header.name = display;
    if registry::is_open(&id) {
        registry::with_open(&id, &password, |_, h| {
            h.name = header.name.clone();
            Ok(())
        })?;
    } else {
        container::decrypt_container_payload(&raw, &password)
            .map_err(|_| "كلمة مرور المستودع غير صحيحة.".to_string())?;
        container::overwrite_header_file(&container, &header)?;
    }
    index_meta(&app, &id, &dir, &header)
}

/// حذف النصي القديم: سجل القفل القديم يحكم — غير المقفل يُحذَف بلا كلمة.
fn delete_plain_repo(
    app: &AppHandle,
    id: &str,
    dir: &PathBuf,
    password: Option<String>,
) -> Result<(), String> {
    let (_, meta) = read_repo_file(app, id)?;
    if meta.is_locked {
        match password {
            Some(p) if !p.is_empty() => verify_lock_password_cached(id, &meta, &p)?,
            _ => return Err("هذا المستودع مقفل — أدخل كلمة مروره لتأكيد الحذف النهائي.".to_string()),
        }
    }
    registry::close_open(id);
    forget_verified_password(id);
    std::fs::remove_dir_all(dir).map_err(|_| "تعذر حذف مجلد المستودع.".to_string())?;
    let mut index = read_index(app)?;
    index.retain(|m| m.id != id);
    write_index(app, &index)?;
    // فهرس البحث العام: إسقاط مقطع المستودع (أفضل جهد).
    crate::people_index::remove_repo(app, id);
    Ok(())
}

#[tauri::command]
pub fn delete_repo(app: AppHandle, id: String, password: Option<String>) -> Result<(), String> {
    let dir = repo_dir(&app, &id)?;
    if !dir.exists() {
        return Err("المستودع غير موجود.".to_string());
    }
    let container = dir.join(CONTAINER_FILE);
    if !container.exists() {
        return delete_plain_repo(&app, &id, &dir, password);
    }
    let password = match password {
        Some(p) if !p.is_empty() => p,
        _ => return Err("هذا المستودع مشفر — أدخل كلمة مروره لتأكيد الحذف النهائي.".to_string()),
    };
    // إثبات الملكية بالفك — كلمة خاطئة = لا شيء يحدث (الجلسة والقفل والملف بلا مساس).
    let raw = std::fs::read(&container).map_err(|_| "ملف الحاوية غير موجود.".to_string())?;
    container::decrypt_container_payload(&raw, &password)
        .map_err(|_| "كلمة مرور المستودع غير صحيحة — لم يتم حذف أي شيء.".to_string())?;
    registry::close_open(&id);
    forget_verified_password(&id);
    // إزالة المجلد بالكامل
    std::fs::remove_dir_all(&dir).map_err(|_| "تعذر حذف مجلد المستودع.".to_string())?;
    // تحديث الفهرس
    let mut index = read_index(&app)?;
    index.retain(|m| m.id != id);
    write_index(&app, &index)?;
    // فهرس البحث العام: إسقاط مقطع المستودع (أفضل جهد).
    crate::people_index::remove_repo(&app, &id);
    Ok(())
}

/// إغلاق الجلسة: إسقاط القاعدة والكلمة من الذاكرة (القرص محفوظ مع كل كتابة أصلاً).
#[tauri::command]
pub fn close_repo(id: String) -> Result<(), String> {
    registry::close_open(&id);
    Ok(())
}
