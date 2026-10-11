// المستندات: فهرس ملفات المستودع (تسجيل/تعديل/حذف) + حل مسارات الملفات
// + مشاركة الملفات عبر ورقة النظام (نسخ مؤقت بأسماء نظيفة تحت الكاش).

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDto {
    pub id: String,
    pub file_name: String,
    pub title: String,
    pub kind: String,
    pub category: String,
    /// ربط حقيقي بسجل الفرد — `None` = ملف عائلي/مشترك. لا عمود اسم مجمد.
    pub owner_record_id: Option<String>,
    /// مسار المصدر لحظة الإضافة (قد يقدم — للمرجعية فقط لا للوصول).
    pub source_path: String,
    /// امتداد الملف صغيراً ('' بلا امتداد) — للتمييز والأيقونات.
    pub filetype: String,
    pub size_bytes: u64,
    pub modified_at: u64,
    pub sort_order: i64,
    pub created_at: u64,
    pub updated_at: u64,
}

/// تصنيفات الملفات: افتراضيات مُدارة + مخصصة المستخدم (تُدار من الإعدادات).
/// الخلفية تقبل أي تسمية غير فارغة — القائمة المغلقة كانت تكسر المخصص.
pub(super) fn ensure_doc_category(category: &str) -> Result<String, String> {
    let c = category.trim().chars().take(40).collect::<String>();
    if c.is_empty() {
        return Err("تصنيف الملف فارغ.".to_string());
    }
    Ok(c)
}

/// عمودا مصدر الملف ونوعه لقواعد v3 المبكرة (إضافة فقط — القديم يُرقَّى:
/// النوع من امتداد الاسم، والمصدر يبقى فارغاً لصفوف ما قبل التخزين).
pub(super) fn ensure_document_source_columns(conn: &Connection) -> Result<(), String> {
    let cols: Vec<String> = conn
        .prepare("PRAGMA table_info(documents)")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if !cols.iter().any(|c| c == "source_path") {
        conn.execute("ALTER TABLE documents ADD COLUMN source_path TEXT NOT NULL DEFAULT ''", [])
            .map_err(|e| e.to_string())?;
    }
    if !cols.iter().any(|c| c == "filetype") {
        conn.execute("ALTER TABLE documents ADD COLUMN filetype TEXT NOT NULL DEFAULT ''", [])
            .map_err(|e| e.to_string())?;
    }
    // تعبئة النوع للصفوف القديمة من امتداد الاسم (الفارغ فقط — يُحفَظ صغيراً).
    let pending: Vec<(String, String)> = conn
        .prepare("SELECT id, file_name FROM documents WHERE filetype = ''")
        .map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (id, name) in pending {
        let ext = name
            .rsplit('.')
            .next()
            .filter(|_| name.contains('.'))
            .map(|e| e.trim().to_lowercase())
            .unwrap_or_default();
        conn.execute("UPDATE documents SET filetype = ?1 WHERE id = ?2", params![ext, id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn resolve_repo_file(app: AppHandle, id: String, file_name: String) -> Result<String, String> {    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err("اسم الملف غير صالح.".to_string());
    }
    let dir = repo_dir(&app, &id)?;
    let target = dir.join(FILES_DIR).join(&file_name);
    if !target.exists() {
        return Err("الملف غير موجود في المستودع.".to_string());
    }
    // للمقفل: العارضات لا تعرف التشفير — فك نسخة لكاش خاص وسلّم مسارها العادي.
    // (التنظيف الشامل للكاش عند الإقلاع يغطيها — كتدفق المشاركة.)
    if !dir.join(CONTAINER_FILE).exists() {
        return Ok(target.to_string_lossy().to_string());
    }
    if !media::is_media_name(&file_name) {
        return Err("الملف غير موجود في المستودع.".to_string());
    }
    let pw = registry::open_password(&id).ok_or("افتح المستودع أولاً.".to_string())?;
    let ext: String = registry::dto_with_open(&id, &pw, |conn, _| {
        conn.query_row(
            "SELECT filetype FROM documents WHERE file_name = ?1",
            [&file_name],
            |r| r.get::<_, Option<String>>(0),
        )
        .map(|v| v.unwrap_or_default())
        .map_err(|_| "الملف غير موجود في المستودع.".to_string())
    })?;
    let staged_name = if ext.trim().is_empty() {
        "file.bin".to_string()
    } else {
        format!("file.{}", ext.trim().to_lowercase())
    };
    let share_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| "تعذر تحديد مجلد الكاش.".to_string())?
        .join(SHARE_DIR);
    let staged = share::stage_media_for_share(
        &share_root,
        &pw,
        &[share::ShareItem { stored: target, display: staged_name }],
    )
    .map_err(|_| "تعذر تجهيز الملف للعرض.".to_string())?;
    staged
        .into_iter()
        .next()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or("تعذر تجهيز الملف للعرض.".to_string())
}

// ================= ملفات المستودع (فهرس + كتل) =================
// `documents` فهرس البيانات الوصفية والربط؛ الكتل في `files/`.
// النسخ في الواجهة (plugin-fs) + التسجيل هنا — لا ملف مجهول.

pub(super) fn clean_doc_title(value: &str) -> Result<String, String> {
    let title = value.trim().chars().take(80).collect::<String>();
    if title.is_empty() {
        return Err("عنوان الملف فارغ.".to_string());
    }
    Ok(title)
}

/// نوع الملف: `file` عام أو `image` صورة (يغني عن تبويب صور مستقل).
pub(super) fn ensure_doc_kind(value: &str) -> Result<String, String> {
    match value.trim() {
        "image" => Ok("image".to_string()),
        "" | "file" => Ok("file".to_string()),
        _ => Err("نوع الملف غير معروف.".to_string()),
    }
}

#[tauri::command]
pub fn repo_files_dir(app: AppHandle, repo_id: String, password: Option<String>) -> Result<String, String> {
    // مسار مجلد ملفات المستودع — لتنسخ الواجهة إليه (content:// لا ينسخها Rust).
    // النسخ كتابة في مخزن المستودع: المقفل يتطلب كلمة مروره (التسجيل يتحقق لاحقاً أيضاً).
    gate_repo_access(&app, &repo_id, password)?;
    let dir = repo_dir(&app, &repo_id)?;
    let files_dir = dir.join(FILES_DIR);
    std::fs::create_dir_all(&files_dir).map_err(|_| "تعذر إنشاء مجلد الملفات.".to_string())?;
    Ok(files_dir.to_string_lossy().to_string())
}

// ================= مشاركة الملفات (ورقة نظام أندرويد) =================
// نسخ قرص→قرص إلى كاش التطبيق ثم مشاركة النسخة — لا بايتات عبر IPC.
// التنظيف في Rust (مجلدات share/ الأقدم من ساعة)، لا مؤقتات في الواجهة.

pub(super) const SHARE_DIR: &str = "share";
const SHARE_MAX_AGE_SECS: u64 = 60 * 60; // ساعة واحدة
const MAX_NAME_BYTES: usize = 255;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareSource {
    pub repo_id: String,
    /// اسم الملف المخزّن على القرص تحت repos/<id>/files/
    pub stored_name: String,
    /// اسم بشري اختياري (عنوان الملف) — يُنقَّى ويُلحَق به الامتداد المخزّن.
    pub display_name: Option<String>,
}

/// فك الترميز المئوي على مستوى البايت (صحيح مع UTF-8 كالعربية) — التالف يُترَك كما هو.
pub(super) fn percent_decode_lossy(raw: &str) -> String {
    fn hex_val(c: u8) -> Option<u8> {
        match c {
            b'0'..=b'9' => Some(c - b'0'),
            b'a'..=b'f' => Some(c - b'a' + 10),
            b'A'..=b'F' => Some(c - b'A' + 10),
            _ => None,
        }
    }
    let bytes = raw.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// 1) فك ترميز 2) تنقية 3) قصّ 255 بايت.
pub(super) fn sanitize_file_name(raw: &str) -> String {
    let decoded = percent_decode_lossy(raw);
    let base = decoded.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').trim().to_string();
    if cleaned.is_empty() {
        return "file".to_string();
    }
    truncate_keep_ext(&cleaned, MAX_NAME_BYTES)
}

pub(super) fn truncate_to_bytes(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

pub(super) fn truncate_keep_ext(name: &str, max: usize) -> String {
    if name.len() <= max {
        return name.to_string();
    }
    match name.rfind('.') {
        Some(i) if i > 0 && name.len() - i <= 32 => {
            let ext = &name[i..];
            let stem = truncate_to_bytes(&name[..i], max - ext.len());
            format!("{stem}{ext}")
        }
        _ => truncate_to_bytes(name, max).to_string(),
    }
}

/// اسم العرض (بلا امتداد غالباً) + امتداد الملف المخزّن — للمشاركة باسم ودود ونوع صحيح.
pub(super) fn display_with_ext(display: Option<&str>, stored: &str) -> String {
    let stored_dec = percent_decode_lossy(stored);
    let ext = std::path::Path::new(&stored_dec)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_string());
    match (display.map(str::trim).filter(|d| !d.is_empty()), ext) {
        (Some(d), Some(e)) => {
            if d.to_lowercase().ends_with(&format!(".{}", e.to_lowercase())) {
                d.to_string()
            } else {
                format!("{d}.{e}")
            }
        }
        (Some(d), None) => d.to_string(),
        (None, _) => stored.to_string(),
    }
}

/// تفادي الكتابة فوق ملف بنفس الاسم داخل دفعة واحدة.
pub(super) fn unique_dest(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    for n in 2.. {
        let candidate = dir.join(format!("{stem} ({n}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

/// حذف مجلدات share/<uuid> الأقدم من ساعة (mtime المجلد)، ما عدا المستثنى.
pub fn cleanup_old_share_dirs(share_root: &std::path::Path, keep: Option<&std::path::Path>) {
    let Ok(entries) = std::fs::read_dir(share_root) else { return };
    let now = std::time::SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        if keep.map_or(false, |k| k == path) || !path.is_dir() {
            continue;
        }
        let is_old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .map_or(false, |age| age.as_secs() > SHARE_MAX_AGE_SECS);
        if is_old {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
}

/// تنظيف الإقلاع (يُستدعى من setup — خيط خلفية، نفس قاعدة الساعة).
pub fn cleanup_share_cache_on_startup(app: &AppHandle) {
    if let Ok(cache) = app.path().app_cache_dir() {
        let root = cache.join(SHARE_DIR);
        std::thread::spawn(move || cleanup_old_share_dirs(&root, None));
    }
}

/// تحضير ملفات للمشاركة: نسخها لأسماء نظيفة تحت الكاش وإرجاع المسارات فقط.
/// القفل كبوابة التصدير نفسها (مستودع مقفل = كلمة المرور مطلوبة).
#[tauri::command]
pub async fn prepare_share_files(
    app: AppHandle,
    password: Option<String>,
    sources: Vec<ShareSource>,
) -> Result<Vec<String>, String> {
    if sources.is_empty() {
        return Err("لا ملفات للمشاركة.".to_string());
    }
    // تحقق مبكر رخيص (الأسماء والمسارات) قبل أي نسخ.
    let mut items: Vec<(std::path::PathBuf, String, bool)> = Vec::with_capacity(sources.len());
    for s in &sources {
        gate_repo_access(&app, &s.repo_id, password.clone())?;
        if s.stored_name.is_empty()
            || s.stored_name.contains('/')
            || s.stored_name.contains('\\')
            || s.stored_name.contains("..")
        {
            return Err("اسم الملف غير صالح.".to_string());
        }
        let dir = repo_dir(&app, &s.repo_id)?;
        let src = dir.join(FILES_DIR).join(&s.stored_name);
        let canon = src.canonicalize().map_err(|_| "الملف غير موجود في المستودع.".to_string())?;
        let files_root = dir.join(FILES_DIR).canonicalize().map_err(|_| "الملف غير موجود في المستودع.".to_string())?;
        if !canon.starts_with(&files_root) || !canon.is_file() {
            return Err("الملف غير موجود في المستودع.".to_string());
        }
        let name = sanitize_file_name(&display_with_ext(s.display_name.as_deref(), &s.stored_name));
        items.push((canon, name, media::is_media_name(&s.stored_name)));
    }
    let share_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| "تعذر تحديد مجلد الكاش.".to_string())?
        .join(SHARE_DIR);

    // المشفر يُفَك أثناء النسخ (الكلمة أُثبتت عند البوابة والفك يتحقق مجدداً).
    let needs_key = items.iter().any(|(_, _, sealed)| *sealed);
    let pw = match &password {
        Some(p) if !p.is_empty() => p.clone(),
        _ if needs_key => return Err("أدخل كلمة مرور المستودع.".to_string()),
        _ => String::new(),
    };
    // النسخ خارج الـ runtime (ملفات كبيرة على جهاز يختنق).
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<String>, String> {
        let mut folder_seed = [0u8; 16];
        getrandom::fill(&mut folder_seed).map_err(|_| "تعذر توليد مجلد مؤقت.".to_string())?;
        let dir = share_root.join(hex_encode(&folder_seed));
        std::fs::create_dir_all(&dir).map_err(|_| "تعذر تجهيز مجلد المشاركة.".to_string())?;

        let mut out = Vec::with_capacity(items.len());
        for (src, name, sealed) in items {
            let dest = unique_dest(&dir, &name);
            if sealed {
                let plain = media::read_media_file(&src, &pw)
                    .map_err(|_| "تعذر فك الملف للمشاركة.".to_string())?;
                std::fs::write(&dest, &plain).map_err(|_| "تعذر نسخ الملف للمشاركة.".to_string())?;
            } else {
                std::fs::copy(&src, &dest).map_err(|_| "تعذر نسخ الملف للمشاركة.".to_string())?;
            }
            out.push(dest.to_string_lossy().into_owned());
        }

        cleanup_old_share_dirs(&share_root, Some(&dir));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// تسجيل صف ملف نُسخ مسبقاً للوجهة (النسخ في الواجهة عبر plugin-fs —
/// وحده يقرأ ما يعيده حوار الاختيار على أندرويد).
/// الـ `id` مولّد من الواجهة (`generateId`) — الفارغ يُستبدل بتوليد احتياطي.
#[tauri::command]
pub fn register_document(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: Option<String>,
    file_name: String,
    title: String,
    kind: Option<String>,
    owner_record_id: Option<String>,
    category: String,
    source_path: Option<String>,
    filetype: Option<String>,
) -> Result<RepoData, String> {
    let title = clean_doc_title(&title)?;
    let category = ensure_doc_category(&category)?;
    let kind = ensure_doc_kind(kind.as_deref().unwrap_or("file"))?;
    let file_name = file_name.trim().to_string();
    if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("اسم الملف غير صالح.".to_string());
    }
    let dir = repo_dir(&app, &repo_id)?;
    let files_dir = dir.join(FILES_DIR);
    // للمقفل: شفّر الملف المرحل واحذف أصله، وسجّل الاسم المعتم بدل الأصلي.
    // (الواجهة تنسخ بنفس التدفق — لا تغيير عليها.)
    let stored_name = if dir.join(CONTAINER_FILE).exists() {
        let pw = match &password {
            Some(p) if !p.is_empty() => p.clone(),
            _ => return Err("أدخل كلمة مرور المستودع.".to_string()),
        };
        let staged = files_dir.join(&file_name);
        if !staged.is_file() {
            return Err("الملف غير موجود في المستودع — أعد النسخ.".to_string());
        }
        let bytes = std::fs::read(&staged).map_err(|_| "تعذر قراءة الملف المرحل.".to_string())?;
        let sealed = media::add_media_file(&files_dir, &bytes, &pw)?;
        let _ = std::fs::remove_file(&staged);
        sealed
    } else if !files_dir.join(&file_name).is_file() {
        return Err("الملف غير موجود في المستودع — أعد النسخ.".to_string());
    } else {
        file_name
    };
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    let owner_record_id = owner_record_id
        .map(|r| r.trim().to_string())
        .filter(|r| !r.is_empty());
    if let Some(ref rid) = owner_record_id {
        ensure_record_exists(&conn, rid)?;
    }
    let id = match id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        Some(given) => ensure_uuid(&given)?,
        None => new_guid()?,
    };
    let source_path = source_path.map(|s| s.trim().to_string()).unwrap_or_default();
    let filetype = filetype
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_default();
    let now = now_db();
    let order: i64 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM documents", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO documents (id, file_name, title, kind, category, owner_record_id, source_path, filetype, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        params![id, stored_name, title, kind, category, owner_record_id, source_path, filetype, order, now],
    )
    .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    Ok(data)
}

/// عنصر تسجيل ضمن دفعة (نفس حقول الأمر المفرد — camelCase للواجهة).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDocumentItem {
    pub id: Option<String>,
    pub file_name: String,
    pub title: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub owner_record_id: Option<String>,
    pub category: String,
    #[serde(default)]
    pub source_path: Option<String>,
    #[serde(default)]
    pub filetype: Option<String>,
}

/// فشل عنصر واحد داخل الدفعة — لا يحجب الناجح.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDocumentFailure {
    pub index: usize,
    pub reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDocumentsResult {
    pub data: RepoData,
    pub failed: Vec<RegisterDocumentFailure>,
}

/// صف صالح بعد التحقق — جاهز للإدخال الجماعي.
pub(super) struct ValidDocumentRow {
    index: usize,
    id: String,
    file_name: String,
    title: String,
    kind: String,
    category: String,
    owner_record_id: Option<String>,
    source_path: String,
    filetype: String,
    order: i64,
}

/// تسجيل دفعة ملفات نُسخت مسبقاً — بوابة واحدة ومعاملة واحدة وفتح واحد.
/// الفاشل يُجمَع (الفهرس + السبب) ولا يحجب الناجح.
#[tauri::command]
pub fn register_documents(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    items: Vec<RegisterDocumentItem>,
) -> Result<RegisterDocumentsResult, String> {
    let dir = repo_dir(&app, &repo_id)?;
    let files_dir = dir.join(FILES_DIR);
    // للمقفل: كلمة إجبارية مقدماً (التشفير في طور التحقق) — والنصي بلا كلمة إضافية.
    let locked = dir.join(CONTAINER_FILE).exists();
    let pw: Option<String> = if locked {
        match &password {
            Some(p) if !p.is_empty() => Some(p.clone()),
            _ => return Err("أدخل كلمة مرور المستودع.".to_string()),
        }
    } else {
        None
    };
    let mut valid: Vec<ValidDocumentRow> = Vec::with_capacity(items.len());
    let mut failed: Vec<RegisterDocumentFailure> = Vec::new();
    let mut seen_names = std::collections::HashSet::new();
    for (index, it) in items.iter().enumerate() {
        let fail = |reason: String| RegisterDocumentFailure { index, reason };
        let title = match clean_doc_title(&it.title) {
            Ok(v) => v,
            Err(e) => { failed.push(fail(e)); continue; }
        };
        let category = match ensure_doc_category(&it.category) {
            Ok(v) => v,
            Err(e) => { failed.push(fail(e)); continue; }
        };
        let kind = match ensure_doc_kind(it.kind.as_deref().unwrap_or("file")) {
            Ok(v) => v,
            Err(e) => { failed.push(fail(e)); continue; }
        };
        let file_name = it.file_name.trim().to_string();
        if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
            failed.push(fail("اسم الملف غير صالح.".to_string()));
            continue;
        }
        if !seen_names.insert(file_name.clone()) {
            failed.push(fail("اسم مكرر داخل الدفعة.".to_string()));
            continue;
        }
        let owner_record_id = it.owner_record_id
            .clone()
            .map(|r| r.trim().to_string())
            .filter(|r| !r.is_empty());
        if !files_dir.join(&file_name).is_file() {
            failed.push(fail("الملف غير موجود في المستودع — أعد النسخ.".to_string()));
            continue;
        }
        // للمقفل: شفّر المرحل واحذف أصله، وسجّل المعتم (فشله لا يحجب البقية).
        let file_name = if locked {
            let staged = files_dir.join(&file_name);
            let bytes = match std::fs::read(&staged) {
                Ok(b) => b,
                Err(_) => { failed.push(fail("تعذر قراءة الملف المرحل.".to_string())); continue; }
            };
            match media::add_media_file(&files_dir, &bytes, pw.as_deref().unwrap_or("")) {
                Ok(sealed) => { let _ = std::fs::remove_file(&staged); sealed }
                Err(e) => { failed.push(fail(e)); continue; }
            }
        } else {
            file_name
        };
        let id = match it.id.clone().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
            Some(given) => match ensure_uuid(&given) {
                Ok(v) => v,
                Err(e) => { failed.push(fail(e)); continue; }
            },
            None => match new_guid() {
                Ok(v) => v,
                Err(e) => { failed.push(fail(e)); continue; }
            },
        };
        let source_path = it.source_path.clone().map(|s| s.trim().to_string()).unwrap_or_default();
        let filetype = it.filetype
            .clone()
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .unwrap_or_default();
        valid.push(ValidDocumentRow {
            index, id, file_name, title, kind, category, owner_record_id, source_path, filetype, order: 0,
        });
    }
    let (batch_failed, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
        let mut order: i64 = conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM documents", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let now = now_db();
        let mut failed_here: Vec<RegisterDocumentFailure> = Vec::new();
        let mut ok: Vec<&ValidDocumentRow> = Vec::new();
        for v in valid.iter_mut() {
            if let Some(ref rid) = v.owner_record_id {
                if let Err(e) = ensure_record_exists(conn, rid) {
                    failed_here.push(RegisterDocumentFailure { index: v.index, reason: e });
                    continue;
                }
            }
            v.order = order;
            order += 1;
            ok.push(&*v);
        }
        if !ok.is_empty() {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            {
                let mut stmt = tx
                    .prepare("INSERT INTO documents (id, file_name, title, kind, category, owner_record_id, source_path, filetype, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)")
                    .map_err(|e| e.to_string())?;
                for v in &ok {
                    stmt.execute(params![
                        v.id, v.file_name, v.title, v.kind, v.category, v.owner_record_id, v.source_path, v.filetype, v.order, now
                    ])
                    .map_err(|e| e.to_string())?;
                }
            }
            tx.commit().map_err(|e| e.to_string())?;
        }
        Ok(failed_here)
    })?;
    failed.extend(batch_failed);
    Ok(RegisterDocumentsResult { data, failed })
}

/// تعديل بيانات ملف (العنوان + النوع + المالك + التصنيف) — بلا مساس بالكتلة.
#[tauri::command]
pub fn update_document_metadata(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
    title: String,
    kind: Option<String>,
    owner_record_id: Option<String>,
    category: String,
) -> Result<RepoData, String> {
    let title = clean_doc_title(&title)?;
    let category = ensure_doc_category(&category)?;
    let kind = ensure_doc_kind(kind.as_deref().unwrap_or("file"))?;
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
        let owner_record_id = owner_record_id
            .map(|r| r.trim().to_string())
            .filter(|r| !r.is_empty());
        if let Some(ref rid) = owner_record_id {
            ensure_record_exists(conn, rid)?;
        }
        let changed = conn
            .execute(
                "UPDATE documents SET title = ?1, kind = ?2, category = ?3, owner_record_id = ?4, updated_at = ?5 WHERE id = ?6",
                params![title, kind, category, owner_record_id, now_db(), id],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("الملف غير موجود.".to_string());
        }
        Ok(())
    })?;
    Ok(data)
}

/// حذف نهائي لملف: الصف ثم الكتلة (بتأكيد الواجهة المسبق).
#[tauri::command]
pub fn delete_document(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    id: String,
) -> Result<RepoData, String> {
    let dir = repo_dir(&app, &repo_id)?;
    let locked = dir.join(CONTAINER_FILE).exists();
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
        let file_name: Option<String> = conn
            .query_row("SELECT file_name FROM documents WHERE id = ?1", [&id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(file_name) = file_name else {
            return Err("الملف غير موجود.".to_string());
        };
        conn.execute("DELETE FROM documents WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        // المقفل: حذف الكتلة المشفرة صريح — النصي: أفضل جهد كالسابق.
        let target = dir.join(FILES_DIR).join(&file_name);
        if locked {
            media::delete_media_file(&target)?;
        } else {
            let _ = std::fs::remove_file(&target);
        }
        Ok(())
    })?;
    Ok(data)
}
