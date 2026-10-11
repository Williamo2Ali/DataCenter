// تحويل مستودع نصي إلى حاوية مشفرة (القفل): تجهيز مؤقت + تحقق + تثبيت + تنظيف.
// القواعد المعتمدة: لا `.vault` فارغ، لا كلمة افتراضية، لا كلمة في ملف المتابعة أبداً.
// الفشل يُبقي الأصل سليماً وينظف المؤقت. الإقلاع يكمل المثبت الصالح أو يجهض الناقص.
// ملف المتابعة والمرحلة بيانات تحكم في مجلد التطبيق الخاص — تُحذَف عند الاكتمال
// ولا تدخل النسخ الاحتياطي (الذي يقرأ `vaults/` فقط) ولا المشاركة.

use super::*;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// اسم ملف المتابعة داخل مجلد التحويل المؤقت ثم مجلد المستودع أثناء التثبيت.
pub(crate) const LOCK_MANIFEST_NAME: &str = "lock-manifest.json";
/// علامة مجلدات التحويل المؤقت: `<id>.lock-<hex>` (المعرفات لا تحوي نقطة أبداً).
const LOCK_STAGE_MARK: &str = ".lock-";
const MANIFEST_VERSION: u32 = 1;
const STAGE_SEALING: &str = "sealing";
const STAGE_SEALED: &str = "sealed";
const STAGE_INSTALLING: &str = "installing";

#[derive(Serialize, Deserialize, Clone)]
struct MediaMap {
    old: String,
    new: String,
}

#[derive(Serialize, Deserialize)]
struct LockManifest {
    v: u32,
    repo_id: String,
    stage: String,
    db_original: String,
    meta_original: String,
    media: Vec<MediaMap>,
}

/// فهرس المسارات — نسخة مسارات صريحة (الاختبارات بلا AppHandle).
fn index_path_at(root: &Path) -> PathBuf {
    root.join(INDEX_FILE)
}

fn read_index_at(root: &Path) -> Result<Vec<RepoMeta>, String> {
    let path = index_path_at(root);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read(&path).map_err(|_| "تعذر قراءة فهرس المستودعات.".to_string())?;
    serde_json::from_slice(&raw).map_err(|_| "فهرس المستودعات تالف.".to_string())
}

fn write_index_at(root: &Path, index: &[RepoMeta]) -> Result<(), String> {
    let raw = serde_json::to_vec_pretty(index).map_err(|_| "تعذر حفظ الفهرس.".to_string())?;
    std::fs::write(index_path_at(root), raw).map_err(|_| "تعذر حفظ الفهرس.".to_string())
}

fn check_plain_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.contains('/')
        || id.contains('\\')
        || id.contains("..")
        || id == INDEX_FILE
        || id.contains(LOCK_STAGE_MARK)
    {
        return Err("معرف المستودع غير صالح.".to_string());
    }
    Ok(())
}

fn is_staging_name(name: &str) -> bool {
    name.contains(LOCK_STAGE_MARK)
}

fn new_staging_dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    for _ in 0..10 {
        let mut seed = [0u8; 8];
        getrandom::fill(&mut seed).map_err(|_| "تعذر توليد مجلد مؤقت.".to_string())?;
        let dir = root.join(format!("{id}{LOCK_STAGE_MARK}{}", hex_encode(&seed)));
        if !dir.exists() {
            return Ok(dir);
        }
    }
    Err("تعذر توليد مجلد مؤقت فريد.".to_string())
}

fn write_manifest(path: &Path, manifest: &LockManifest) -> Result<(), String> {
    let raw = serde_json::to_vec_pretty(manifest).map_err(|_| "تعذر كتابة ملف المتابعة.".to_string())?;
    std::fs::write(path, raw).map_err(|_| "تعذر كتابة ملف المتابعة.".to_string())
}

fn valid_container(path: &Path) -> bool {
    std::fs::read(path)
        .map(|b| container::read_header_from_bytes(&b).is_ok())
        .unwrap_or(false)
}

/// التحويل الكامل بمسارات صريحة — تُستدعَى من الأمر بعد حل الجذر.
pub(crate) fn lock_repo_at(
    root: &Path,
    id: &str,
    current_password: Option<&str>,
    password: &str,
) -> Result<RepoMeta, String> {
    check_plain_id(id)?;
    if password.len() < 4 {
        return Err("كلمة المستودع إجبارية (4 أحرف على الأقل).".to_string());
    }
    let dir = root.join(id);
    if !dir.is_dir() {
        return Err("المستودع غير موجود.".to_string());
    }
    if dir.join(CONTAINER_FILE).exists() {
        return Err("المستودع مقفل مسبقاً.".to_string());
    }
    // مغلق من الذاكرة قبل التحويل — ولا كتابة جارية (الأوامر متزامنة).
    registry::close_open(id);
    forget_verified_password(id);

    // وصف النصي + سجل القفل القديم (يثبت الملكية إن وجد — ولا يُنشَأ جديد هنا).
    let meta_raw = std::fs::read(dir.join(REPO_META_FILE))
        .map_err(|_| "وصف المستودع غير موجود.".to_string())?;
    let meta_file: RepoFile =
        serde_json::from_slice(&meta_raw).map_err(|_| "وصف المستودع تالف.".to_string())?;
    if meta_file.is_locked {
        match current_password {
            Some(p) if !p.is_empty() => verify_lock_password(&meta_file, p)?,
            _ => return Err("هذا المستودع بسجل قفل قديم — أدخل كلمته الحالية أولاً.".to_string()),
        }
    }
    if meta_file.schema_version < SCHEMA_VERSION {
        return Err("نسخة قاعدة البيانات قديمة — احذف المستودع وأعد إنشاءه.".to_string());
    }
    if meta_file.name.trim().is_empty() {
        return Err("اسم المستودع فارغ.".to_string());
    }

    // سلامة القاعدة النصية قبل أي كتابة (قراءة فقط — بلا ترقيات تمس الأصل).
    let db_path = dir.join(DB_FILE);
    let src = Connection::open(&db_path).map_err(|e| format!("تعذر فتح قاعدة البيانات: {e}"))?;
    let check: String = src
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(|_| "قاعدة البيانات تالفة.".to_string())?;
    if check != "ok" {
        return Err("قاعدة البيانات تالفة.".to_string());
    }
    let mut media_rows: Vec<(String, String)> = src
        .prepare("SELECT id, file_name FROM documents ORDER BY sort_order")
        .map_err(|_| "بنية الحاوية غير متوقعة.".to_string())?
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|_| "بنية الحاوية غير متوقعة.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "بنية الحاوية غير متوقعة.".to_string())?;
    media_rows.retain(|(_, name)| !name.is_empty());
    for (_, name) in &media_rows {
        if name.ends_with(media::MEDIA_EXT) {
            return Err(format!("ملف بحالة مختلطة مرفوض: {name}."));
        }
        if name.contains('/') || name.contains('\\') || name.contains("..") {
            return Err(format!("اسم ملف غير صالح: {name}."));
        }
    }
    let people_count: i64 = src
        .query_row("SELECT COUNT(*) FROM peoples", [], |r| r.get(0))
        .map_err(|_| "بنية الحاوية غير متوقعة.".to_string())?;
    drop(src);

    // مجلد مؤقت عشوائي خارج المجلد النهائي + متابعة أولية (بلا كلمة أبداً).
    let staging = new_staging_dir(root, id)?;
    let staging_files = staging.join(FILES_DIR);
    std::fs::create_dir_all(&staging_files).map_err(|_| "تعذر إنشاء المجلد المؤقت.".to_string())?;
    let mut manifest = LockManifest {
        v: MANIFEST_VERSION,
        repo_id: id.to_string(),
        stage: STAGE_SEALING.to_string(),
        db_original: DB_FILE.to_string(),
        meta_original: REPO_META_FILE.to_string(),
        media: Vec::new(),
    };
    write_manifest(&staging.join(LOCK_MANIFEST_NAME), &manifest)?;

    let result = lock_seal_and_install(root, id, &meta_file, password, &media_rows, people_count, &staging, &mut manifest);
    if result.is_err() {
        rollback_install(&dir, &staging);
    }
    result
}

/// الختم والتحقق والتثبيت — أي خطأ يعيد التحويل كاملاً للمسار الآمن.
#[allow(clippy::too_many_arguments)]
fn lock_seal_and_install(
    root: &Path,
    id: &str,
    meta_file: &RepoFile,
    password: &str,
    media_rows: &[(String, String)],
    people_count: i64,
    staging: &Path,
    manifest: &mut LockManifest,
) -> Result<RepoMeta, String> {
    let dir = root.join(id);
    let staging_files = staging.join(FILES_DIR);
    let staging_vault = staging.join(CONTAINER_FILE);

    // 1) تشفير كل وسيط مرة واحدة — الأصل لا يُمَس، والمتابعة بعد كل ملف.
    let mut maps: Vec<MediaMap> = Vec::with_capacity(media_rows.len());
    for (_, old) in media_rows {
        let src_path = dir.join(FILES_DIR).join(old);
        let bytes = std::fs::read(&src_path)
            .map_err(|_| format!("الملف الأصلي مفقود: {old}."))?;
        let sealed = media::add_media_file(&staging_files, &bytes, password)?;
        maps.push(MediaMap { old: old.clone(), new: sealed });
        manifest.media = maps.clone();
        write_manifest(&staging.join(LOCK_MANIFEST_NAME), manifest)?;
    }

    // 2) نسخة عمل داخل المرحلة: تحديث الإشارات على نسخة من القاعدة
    // (الأصل لا يُمَس أبداً — الكتابة على ملف مباشرة هو المسار المجرّب).
    let work_db = staging.join(DB_FILE);
    std::fs::copy(dir.join(DB_FILE), &work_db).map_err(|_| "تعذر تجهيز نسخة العمل.".to_string())?;
    let work = Connection::open(&work_db).map_err(|e| format!("تعذر فتح نسخة العمل: {e}"))?;
    // إسقاط WAL على نسخة العمل المهملة: صور WAL المختومة تُقبَل ظاهرياً عند الفك
    // لكن مقبضها مكسور (الاستعلامات ترفض) — ووضع DELETE يدمج السجل وينتج صورة
    // سليمة مطابقة لصور الذاكرة. الأصل لا يُمَس (النسخة في المرحلة فقط).
    work.execute_batch("PRAGMA journal_mode = DELETE;")
        .map_err(|_| "تعذر تجهيز نسخة العمل.".to_string())?;
    for (idx, (doc_id, _)) in media_rows.iter().enumerate() {
        let new_name = maps.get(idx).map(|m| m.new.clone()).ok_or("تعذر مطابقة الوسائط.".to_string())?;
        work.execute("UPDATE documents SET file_name = ?1 WHERE id = ?2", rusqlite::params![new_name, doc_id])
            .map_err(|e| e.to_string())?;
    }
    let mut header = container::new_header(id, meta_file.name.trim())?;
    store::save_vault_file(&staging_vault, &mut header, &work, password)?;
    drop(work);

    // 3) التحقق بإعادة الفتح: العدادات + فك كل وسيط (وسم GCM يثبت السلامة).
    manifest.stage = STAGE_SEALED.to_string();
    write_manifest(&staging.join(LOCK_MANIFEST_NAME), manifest)?;
    let opened = store::open_vault_file(&staging_vault, password)?;
    if opened.header.people_count != people_count.max(0) as u64 {
        return Err("التحقق فشل: عداد الأشخاص غير متطابق.".to_string());
    }
    if opened.header.files_count != maps.len() as u64 {
        return Err("التحقق فشل: عداد الملفات غير متطابق.".to_string());
    }
    for m in &maps {
        media::read_media_file(&staging_files.join(&m.new), password)
            .map_err(|_| format!("التحقق فشل: وسيط تالف: {}.", m.old))?;
    }
    drop(opened);

    // 4) التثبيت: المتابعة أولاً إلى المجلد النهائي، ثم الوسائط، ثم الحاوية.
    manifest.stage = STAGE_INSTALLING.to_string();
    write_manifest(&staging.join(LOCK_MANIFEST_NAME), manifest)?;
    let final_manifest = dir.join(LOCK_MANIFEST_NAME);
    std::fs::rename(staging.join(LOCK_MANIFEST_NAME), &final_manifest)
        .map_err(|_| "تعذر بدء التثبيت.".to_string())?;
    std::fs::create_dir_all(dir.join(FILES_DIR)).map_err(|_| "تعذر إنشاء مجلد الملفات.".to_string())?;
    for m in &maps {
        std::fs::rename(staging_files.join(&m.new), dir.join(FILES_DIR).join(&m.new))
            .map_err(|_| format!("تعذر تثبيت وسيط: {}.", m.old))?;
    }
    let sealed_bytes = std::fs::read(&staging_vault).map_err(|_| "تعذر قراءة الحاوية المرحلية.".to_string())?;
    std::fs::write(dir.join(CONTAINER_FILE), &sealed_bytes)
        .map_err(|_| "تعذر كتابة ملف الحاوية.".to_string())?;
    // إثبات التثبيت قبل حذف أي أصل.
    let installed = std::fs::read(dir.join(CONTAINER_FILE)).map_err(|_| "تعذر قراءة الحاوية المثبتة.".to_string())?;
    let installed_header = container::read_header_from_bytes(&installed)?;
    container::decrypt_container_payload(&installed, password)
        .map_err(|_| "التحقق فشل بعد التثبيت.".to_string())?;
    if installed_header.people_count != people_count.max(0) as u64
        || installed_header.files_count != maps.len() as u64
    {
        return Err("التحقق فشل بعد التثبيت.".to_string());
    }

    // 5) حذف الأصول النصية فقط الآن — ثم الفهرس والتنظيف.
    for m in &maps {
        let _ = std::fs::remove_file(dir.join(FILES_DIR).join(&m.old));
    }
    let _ = std::fs::remove_file(dir.join(DB_FILE));
    let _ = std::fs::remove_file(dir.join(REPO_META_FILE));
    let mut index = read_index_at(root)?;
    let meta = match index.iter_mut().find(|m| m.id == id) {
        Some(m) => {
            m.name = installed_header.name.clone();
            m.is_locked = true;
            m.clone()
        }
        None => {
            let m = RepoMeta {
                id: id.to_string(),
                name: installed_header.name.clone(),
                path: dir.to_string_lossy().to_string(),
                created_at: meta_file.created_at,
                is_locked: true,
                is_favorite: false,
                last_opened_at: 0,
                open_count: 0,
            };
            index.push(m.clone());
            m
        }
    };
    write_index_at(root, &index)?;
    let _ = std::fs::remove_dir_all(staging);
    let _ = std::fs::remove_file(&final_manifest);
    registry::close_open(id);
    forget_verified_password(id);
    Ok(meta)
}

/// تراجع آمن عند الفشل: إزالة المرحلة، وإن بقيت متابعة نهائية فإما اكتمال لاحق
/// (حاوية صالحة — تُترَك للإقلاع) أو تنظيف شامل (حاوية فاسدة — تُحذَف مع المنقول).
fn rollback_install(dir: &Path, staging: &Path) {
    let _ = std::fs::remove_dir_all(staging);
    let final_manifest = dir.join(LOCK_MANIFEST_NAME);
    let raw = match std::fs::read(&final_manifest) {
        Ok(b) => b,
        Err(_) => return,
    };
    let manifest: LockManifest = match serde_json::from_slice(&raw) {
        Ok(m) => m,
        Err(_) => {
            let _ = std::fs::remove_file(&final_manifest);
            return;
        }
    };
    for m in &manifest.media {
        let _ = std::fs::remove_file(dir.join(FILES_DIR).join(&m.new));
    }
    if valid_container(&dir.join(CONTAINER_FILE)) {
        // صالحة: تُترَك مع المتابعة ليكملها الإقلاع — لا حذف لبيانات مثبتة.
        return;
    }
    let _ = std::fs::remove_file(dir.join(CONTAINER_FILE));
    let _ = std::fs::remove_file(&final_manifest);
}

fn sweep_stagings(root: &Path, repo_id: &str) {
    let Ok(entries) = std::fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.path().is_dir()
            && is_staging_name(&name)
            && name.starts_with(&format!("{repo_id}{LOCK_STAGE_MARK}"))
        {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

fn flip_index_locked_at(root: &Path, id: &str) {
    if let Ok(mut index) = read_index_at(root) {
        let mut changed = false;
        for m in index.iter_mut() {
            if m.id == id && !m.is_locked {
                m.is_locked = true;
                changed = true;
            }
        }
        if changed {
            let _ = write_index_at(root, &index);
        }
    }
}

/// تنظيف الإقلاع (الأفضل جهداً، بلا كلمة مرور أبداً):
/// - مجلد مرحلي بلا تثبيت → حذف كامل (الأصل لم يُمَس).
/// - متابعة نهائية + حاوية صالحة → إكمال حذف الأصول المدرجة ثم حذف المتابعة.
/// - متابعة نهائية بلا حاوية صالحة → إجهاض: حذف المتابعة وبقايا الحاوية الفاسدة.
pub(crate) fn cleanup_staging_at(root: &Path) {
    let Ok(entries) = std::fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_staging_name(&name) {
            let _ = std::fs::remove_dir_all(&path);
            continue;
        }
        let manifest_path = path.join(LOCK_MANIFEST_NAME);
        let raw = match std::fs::read(&manifest_path) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let manifest: LockManifest = match serde_json::from_slice(&raw) {
            Ok(m) => m,
            Err(_) => {
                let _ = std::fs::remove_file(&manifest_path);
                continue;
            }
        };
        if manifest.repo_id != name {
            let _ = std::fs::remove_file(&manifest_path);
            continue;
        }
        if valid_container(&path.join(CONTAINER_FILE)) {
            let _ = std::fs::remove_file(path.join(&manifest.db_original));
            let _ = std::fs::remove_file(path.join(&manifest.meta_original));
            for m in &manifest.media {
                let _ = std::fs::remove_file(path.join(FILES_DIR).join(&m.old));
            }
            flip_index_locked_at(root, &manifest.repo_id);
            let _ = std::fs::remove_file(&manifest_path);
        } else {
            let _ = std::fs::remove_file(path.join(CONTAINER_FILE));
            let _ = std::fs::remove_file(&manifest_path);
        }
        sweep_stagings(root, &manifest.repo_id);
    }
}

/// غلاف الإقلاع بسياق التطبيق.
pub(crate) fn cleanup_stale_lock_staging(app: &tauri::AppHandle) {
    if let Ok(root) = repos_root(app) {
        cleanup_staging_at(&root);
    }
}

/// أمر القفل: تحويل النصي إلى حاوية (كلمة جديدة إجبارية + تأكيد الواجهة المسبق).
#[tauri::command]
pub fn lock_repo(
    app: tauri::AppHandle,
    id: String,
    current_password: Option<String>,
    password: String,
) -> Result<RepoMeta, String> {
    let root = repos_root(&app)?;
    lock_repo_at(&root, &id, current_password.as_deref(), &password)
}

// ================= اختبارات التحويل =================
#[cfg(test)]
mod tests {
    use super::super::container::{new_header, read_header_from_bytes};
    use super::super::store::{open_vault_file, save_vault_file};
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("repo_lock_{name}_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    struct Guard {
        dir: PathBuf,
    }
    impl Drop for Guard {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    /// مستودع نصي قديم: data.db + repo.json + files/a.pdf + صف documents.
    fn plain_fixture(root: &Path, id: &str) -> PathBuf {
        let dir = root.join(id);
        let files = dir.join(FILES_DIR);
        std::fs::create_dir_all(&files).expect("files");
        let conn = Connection::open(dir.join(DB_FILE)).expect("db");
        create_schema(&conn).expect("schema");
        seed_repo_structure(&conn, &["مالك".to_string()], true).expect("seed");
        conn.execute(
            "INSERT INTO documents (id, file_name, title, kind, category, sort_order, created_at, updated_at) VALUES ('doc-1', 'a.pdf', 'وثيقة', 'file', 'عام', 0, 0, 0)",
            [],
        )
        .expect("doc");
        drop(conn);
        std::fs::write(files.join("a.pdf"), b"%PDF-1.4 plain-bytes").expect("media");
        let meta = serde_json::json!({
            "name": "مستودع نصي",
            "createdAt": 7,
            "isLocked": false,
            "schemaVersion": 3,
        });
        std::fs::write(
            dir.join(REPO_META_FILE),
            serde_json::to_vec_pretty(&meta).expect("meta"),
        )
        .expect("write meta");
        write_index_at(root, &[RepoMeta {
            id: id.to_string(),
            name: "مستودع نصي".to_string(),
            path: dir.to_string_lossy().to_string(),
            created_at: 7,
            is_locked: false,
            is_favorite: true,
            last_opened_at: 3,
            open_count: 2,
        }])
        .expect("index");
        dir
    }

    #[test]
    fn lock_converts_plain_repo_end_to_end() {
        let root = temp_root("cycle");
        let _guard = Guard { dir: root.clone() };
        let dir = plain_fixture(&root, "paper");
        let meta = lock_repo_at(&root, "paper", None, "Test#1234").expect("lock");
        assert!(meta.is_locked);
        assert_eq!(meta.name, "مستودع نصي");
        assert_eq!(meta.created_at, 7, "الإنشاء والمفضلة والاستخدام محفوظة");
        assert!(meta.is_favorite);
        // الحاوية صالحة وتُفتَح بالكلمة الجديدة، والعدادات من الداخل.
        let raw = std::fs::read(dir.join(CONTAINER_FILE)).expect("vault");
        let header = read_header_from_bytes(&raw).expect("header");
        assert_eq!(header.name, "مستودع نصي");
        let opened = open_vault_file(&dir.join(CONTAINER_FILE), "Test#1234").expect("open");
        assert_eq!(opened.header.people_count, 1);
        assert_eq!(opened.header.files_count, 1);
        let stored: String = opened
            .conn
            .query_row("SELECT file_name FROM documents WHERE id = 'doc-1'", [], |r| r.get(0))
            .expect("mapping");
        assert!(stored.ends_with(media::MEDIA_EXT), "الإشارة معتمة");
        let sealed = std::fs::read(dir.join(FILES_DIR).join(&stored)).expect("sealed");
        assert!(media::read_media_file(&dir.join(FILES_DIR).join(&stored), "Test#1234").is_ok());
        assert!(!sealed.windows(11).any(|w| w == b"plain-bytes"), "لا نص مفهوم على القرص");
        // الأصول النصية محذوفة، ولا متابعة ولا مرحلة.
        assert!(!dir.join(DB_FILE).exists());
        assert!(!dir.join(REPO_META_FILE).exists());
        assert!(!dir.join(FILES_DIR).join("a.pdf").exists());
        assert!(!dir.join(LOCK_MANIFEST_NAME).exists());
        let leftovers: Vec<String> = std::fs::read_dir(&root)
            .expect("root")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(!leftovers.iter().any(|n| is_staging_name(n)), "لا مجلد مرحلي");
        // القفل المكرر مرفوض.
        assert!(lock_repo_at(&root, "paper", None, "Test#1234").is_err(), "المقفل مسبقاً مرفوض");
    }

    #[test]
    fn migrated_container_accepts_writes() {
        // فرضية المعمارية للمستودعات المهاجرة: المفكوكة من صورة مختومة من ملف
        // تقبل الكتابة والحفظ وإعادة الفتح.
        let root = temp_root("writeback");
        let _guard = Guard { dir: root.clone() };
        let dir = plain_fixture(&root, "writer");
        lock_repo_at(&root, "writer", None, "Test#1234").expect("lock");
        let mut opened = open_vault_file(&dir.join(CONTAINER_FILE), "Test#1234").expect("open");
        opened
            .conn
            .execute(
                "INSERT INTO peoples (id, name, name_en, relation, relation_en, sort_order, created_at, updated_at) VALUES ('w1', 'كاتب', '', '', '', 5, 0, 0)",
                [],
            )
            .expect("insert");
        save_vault_file(&dir.join(CONTAINER_FILE), &mut opened.header, &opened.conn, "Test#1234")
            .expect("save");
        let reopened = open_vault_file(&dir.join(CONTAINER_FILE), "Test#1234").expect("reopen");
        assert_eq!(reopened.header.people_count, 2);
    }

    #[test]
    fn lock_failures_keep_original_intact() {
        let root = temp_root("failures");
        let _guard = Guard { dir: root.clone() };
        let dir = plain_fixture(&root, "fragile");
        assert!(lock_repo_at(&root, "fragile", None, "abc").is_err(), "القصيرة مرفوضة");
        assert!(lock_repo_at(&root, "nope", None, "Test#1234").is_err(), "المفقود مرفوض");
        // وسيط مفقود: يفشل ويُبقي الأصل وينظف المرحلة.
        std::fs::remove_file(dir.join(FILES_DIR).join("a.pdf")).expect("remove media");
        assert!(lock_repo_at(&root, "fragile", None, "Test#1234").is_err(), "الناقص مرفوض");
        assert!(dir.join(DB_FILE).is_file(), "الأصل باقٍ");
        assert!(dir.join(REPO_META_FILE).is_file());
        assert!(!dir.join(CONTAINER_FILE).exists(), "لا حاوية ناقصة");
        let leftovers: Vec<String> = std::fs::read_dir(&root)
            .expect("root")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(!leftovers.iter().any(|n| is_staging_name(n)), "المرحلة منظفة");
        assert!(!dir.join(LOCK_MANIFEST_NAME).exists());
    }

    #[test]
    fn boot_cleanup_discards_stale_staging_and_completes_installed() {
        let root = temp_root("boot");
        let _guard = Guard { dir: root.clone() };
        // مرحلة يتيمة بلا تثبيت: تُحذَف كاملة.
        let staging = root.join(format!("paper{LOCK_STAGE_MARK}deadbeef"));
        std::fs::create_dir_all(staging.join(FILES_DIR)).expect("staging");
        std::fs::write(staging.join(LOCK_MANIFEST_NAME), b"{}").expect("manifest");
        // متابعة نهائية مع حاوية صالحة: تُكمَل (حذف الأصل) ثم تُحذَف المتابعة.
        let dir = plain_fixture(&root, "half");
        let mut header = new_header("half", "نصف").expect("header");
        let mem = Connection::open_in_memory().expect("mem");
        create_schema(&mem).expect("schema");
        crate::repos::seed_repo_structure(&mem, &[], true).expect("seed");
        save_vault_file(&dir.join(CONTAINER_FILE), &mut header, &mem, "Test#1234").expect("seal");
        let manifest = LockManifest {
            v: MANIFEST_VERSION,
            repo_id: "half".to_string(),
            stage: STAGE_INSTALLING.to_string(),
            db_original: DB_FILE.to_string(),
            meta_original: REPO_META_FILE.to_string(),
            media: Vec::new(),
        };
        write_manifest(&dir.join(LOCK_MANIFEST_NAME), &manifest).expect("manifest");
        cleanup_staging_at(&root);
        assert!(!staging.exists(), "المرحلة اليتيمة محذوفة");
        assert!(!dir.join(DB_FILE).exists(), "الأصل المثبت محذوف");
        assert!(!dir.join(REPO_META_FILE).exists());
        assert!(!dir.join(LOCK_MANIFEST_NAME).exists(), "المتابعة محذوفة بعد الاكتمال");
        assert!(dir.join(CONTAINER_FILE).is_file(), "الحاوية الصالحة باقية");
        // متابعة نهائية بلا حاوية صالحة: إجهاض وحذف البقايا الفاسدة.
        let dir2 = plain_fixture(&root, "broken");
        std::fs::write(dir2.join(CONTAINER_FILE), b"junk").expect("junk");
        write_manifest(
            &dir2.join(LOCK_MANIFEST_NAME),
            &LockManifest {
                v: MANIFEST_VERSION,
                repo_id: "broken".to_string(),
                stage: STAGE_INSTALLING.to_string(),
                db_original: DB_FILE.to_string(),
                meta_original: REPO_META_FILE.to_string(),
                media: Vec::new(),
            },
        )
        .expect("manifest");
        cleanup_staging_at(&root);
        assert!(!dir2.join(LOCK_MANIFEST_NAME).exists());
        assert!(!dir2.join(CONTAINER_FILE).exists(), "الحاوية الفاسدة محذوفة");
        assert!(dir2.join(DB_FILE).is_file(), "الأصل باقٍ بعد الإجهاض");
    }
}
