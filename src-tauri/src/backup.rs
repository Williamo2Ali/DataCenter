// النسخ الاحتياطي اليدوي للحاويات — يعمل على ويندوز وأندرويد (كود محمول).
// الصيغة: DCBU | 0x01 | salt | iv | AES-GCM-256( zip[ manifest.json + *.vault ] )
// ملفات .vault داخل النسخة مشفرة أصلاً بكلمات حاوياتها، والمغلّف كله مشفر
// بكلمة مرور النسخة (PBKDF2-SHA256 بـ 120 ألف تكرار) — حماية مزدوجة.
// لا تُمرر أي بايتات ملفات عبر IPC إطلاقاً: الأوامر تأخذ مسارات فقط.

use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};
use tauri::{AppHandle, Manager};
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};

use crate::vault::{decrypt_envelope, encrypt_envelope};

pub(crate) const BACKUP_MAGIC: [u8; 4] = [0x44, 0x43, 0x42, 0x55]; // DCBU
const MANIFEST_NAME: &str = "manifest.json";
const BACKUP_VERSION: u32 = 1;
const MAX_VAULT_FILE_BYTES: u64 = 200 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_VAULTS_PER_BACKUP: usize = 1000;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestVault {
    name: String,
    file_name: String,
    size: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    app: String,
    backup_version: u32,
    created_at: u64,
    vaults: Vec<ManifestVault>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupVaultInfo {
    name: String,
    file_name: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    vault_count: usize,
    total_size: u64,
    created_at: u64,
    vaults: Vec<BackupVaultInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupCreated {
    file_path: String,
    file_name: String,
    vault_count: usize,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoredVault {
    name: String,
    file_name: String,
    full_path: String,
    size: u64,
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// تنظيف اسم ملف حاوية قادم من نسخة خارجية + فرض .vault (حماية من zip-slip).
pub(crate) fn safe_vault_file_name(raw: &str) -> String {
    let base = raw
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(raw)
        .trim()
        .replace(['<', '>', ':', '"', '/', '\\', '|', '?', '*'], "_");
    let base = base.trim_matches(['.', ' ']);
    let base = if base.is_empty() { "vault".to_string() } else { base.to_string() };
    let stem = base
        .strip_suffix(".vault")
        .or_else(|| base.strip_suffix(".VAULT"))
        .unwrap_or(&base);
    let stem = if stem.is_empty() { "vault" } else { stem };
    let short: String = stem.chars().take(80).collect();
    format!("{short}.vault")
}

/// مسار فريد داخل مجلد (يضيف (2), (3)... عند التعارض) — لا يكتب فوق حاوية أحدث.
fn unique_target_path(dir: &std::path::Path, file_name: &str) -> std::path::PathBuf {
    let dot = file_name.rfind('.');
    let (stem, ext) = match dot {
        Some(i) if i > 0 => (&file_name[..i], &file_name[i..]),
        _ => (file_name, ".vault"),
    };
    let mut candidate = dir.join(file_name);
    let mut counter = 2u32;
    while candidate.exists() {
        candidate = dir.join(format!("{stem} ({counter}){ext}"));
        counter += 1;
    }
    candidate
}

/// بناء بايتات النسخة من ملفات حاويات مشفرة: [(الاسم العرضي, اسم الملف, البايتات)].
pub(crate) fn build_backup_bytes(
    items: &[(String, String, Vec<u8>)],
    password: &str,
) -> Result<Vec<u8>, String> {
    if items.is_empty() {
        return Err("لا توجد حاويات لنسخها احتياطياً.".to_string());
    }
    if items.len() > MAX_VAULTS_PER_BACKUP {
        return Err("عدد الحاويات يتجاوز الحد المسموح.".to_string());
    }
    let total: u64 = items.iter().map(|(_, _, b)| b.len() as u64).sum();
    if total > MAX_TOTAL_BYTES {
        return Err("حجم الحاويات يتجاوز الحد المسموح للنسخة (1GB).".to_string());
    }

    let manifest = Manifest {
        app: "DataCenter".to_string(),
        backup_version: BACKUP_VERSION,
        created_at: now_secs(),
        vaults: items
            .iter()
            .map(|(name, file_name, bytes)| ManifestVault {
                name: name.clone(),
                file_name: file_name.clone(),
                size: bytes.len() as u64,
            })
            .collect(),
    };
    let manifest_json =
        serde_json::to_vec(&manifest).map_err(|_| "تعذر بناء فهرس النسخة.".to_string())?;

    let cursor = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file(MANIFEST_NAME, options)
        .map_err(|_| "تعذر بناء الأرشيف.".to_string())?;
    zip.write_all(&manifest_json)
        .map_err(|_| "تعذر بناء الأرشيف.".to_string())?;
    for (_, file_name, bytes) in items {
        zip.start_file(file_name, options)
            .map_err(|_| "تعذر بناء الأرشيف.".to_string())?;
        zip.write_all(bytes)
            .map_err(|_| "تعذر بناء الأرشيف.".to_string())?;
    }
    let zip_bytes = zip
        .finish()
        .map_err(|_| "تعذر بناء الأرشيف.".to_string())?
        .into_inner();

    encrypt_envelope(&BACKUP_MAGIC, &zip_bytes, password)
}

/// فك النسخة: (الفهرس، [(اسم الملف، البايتات)]) — بدون أي كتابة على القرص.
pub(crate) fn parse_backup_bytes(
    bytes: &[u8],
    password: &str,
) -> Result<(Manifest, Vec<(String, Vec<u8>)>), String> {
    let zip_bytes =
        decrypt_envelope(&BACKUP_MAGIC, bytes, password).map_err(|_| {
            "كلمة مرور النسخة غير صحيحة أو الملف تالف.".to_string()
        })?;
    let mut archive =
        ZipArchive::new(Cursor::new(zip_bytes)).map_err(|_| "ملف النسخة تالف.".to_string())?;

    let mut manifest_file = archive
        .by_name(MANIFEST_NAME)
        .map_err(|_| "ملف النسخة تالف (لا فهرس).".to_string())?;
    let mut manifest_json = Vec::new();
    manifest_file
        .take(MAX_MANIFEST_BYTES + 1)
        .read_to_end(&mut manifest_json)
        .map_err(|_| "ملف النسخة تالف.".to_string())?;
    if manifest_json.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("فهرس النسخة كبير بشكل مريب.".to_string());
    }
    let manifest: Manifest =
        serde_json::from_slice(&manifest_json).map_err(|_| "فهرس النسخة تالف.".to_string())?;
    if manifest.backup_version != BACKUP_VERSION {
        return Err("نسخة النسخة الاحتياطية غير مدعومة.".to_string());
    }
    if manifest.vaults.len() > MAX_VAULTS_PER_BACKUP {
        return Err("عدد الحاويات في النسخة يتجاوز الحد.".to_string());
    }

    let mut files = Vec::with_capacity(manifest.vaults.len());
    let mut total: u64 = 0;
    for entry in &manifest.vaults {
        let mut file = archive
            .by_name(&entry.file_name)
            .map_err(|_| format!("الملف {} ناقص في النسخة.", entry.file_name))?;
        // رفض المسارات المطلقة/الخارجة — دفاع ضد zip-slip
        let enclosed = file.enclosed_name().ok_or_else(|| "اسم ملف غير آمن في النسخة.".to_string())?;
        let clean = enclosed.to_string_lossy().replace('\\', "/");
        if clean != entry.file_name {
            return Err("اسم ملف غير آمن في النسخة.".to_string());
        }
        if file.size() > MAX_VAULT_FILE_BYTES {
            return Err(format!("الملف {} أكبر من الحد المسموح.", entry.file_name));
        }
        let mut buf = Vec::new();
        file.take(MAX_VAULT_FILE_BYTES + 1)
            .read_to_end(&mut buf)
            .map_err(|_| "ملف النسخة تالف.".to_string())?;
        total += buf.len() as u64;
        if total > MAX_TOTAL_BYTES {
            return Err("حجم النسخة يتجاوز الحد المسموح.".to_string());
        }
        files.push((entry.file_name.clone(), buf));
    }
    Ok((manifest, files))
}

fn vaults_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "تعذر تحديد مجلد بيانات التطبيق.".to_string())?
        .join("vaults");
    std::fs::create_dir_all(&dir).map_err(|_| "تعذر إنشاء مجلد الحاويات.".to_string())?;
    Ok(dir)
}

fn stem_name(file_name: &str) -> String {
    file_name
        .strip_suffix(".vault")
        .or_else(|| file_name.strip_suffix(".VAULT"))
        .unwrap_or(file_name)
        .to_string()
}

/// إنشاء نسخة احتياطية مشفرة بكلمة مرورها في المسار الذي اختاره المستخدم.
#[tauri::command]
pub fn create_backup(
    app: AppHandle,
    password: String,
    target_path: String,
) -> Result<BackupCreated, String> {
    if password.len() < 4 {
        return Err("كلمة مرور النسخة قصيرة جداً (4 أحرف على الأقل).".to_string());
    }
    let dir = vaults_dir(&app)?;
    let mut items: Vec<(String, String, Vec<u8>)> = Vec::new();
    let mut total: u64 = 0;
    let entries =
        std::fs::read_dir(&dir).map_err(|_| "تعذر قراءة مجلد الحاويات.".to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_vault = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("vault"))
            .unwrap_or(false);
        if !is_vault {
            continue;
        }
        let bytes = std::fs::read(&path).map_err(|_| "تعذر قراءة إحدى الحاويات.".to_string())?;
        if bytes.len() as u64 > MAX_VAULT_FILE_BYTES {
            return Err("إحدى الحاويات أكبر من الحد المسموح.".to_string());
        }
        total += bytes.len() as u64;
        if total > MAX_TOTAL_BYTES {
            return Err("حجم الحاويات يتجاوز الحد المسموح للنسخة (1GB).".to_string());
        }
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("vault.vault")
            .to_string();
        items.push((stem_name(&file_name), file_name, bytes));
    }
    if items.is_empty() {
        return Err("لا توجد حاويات لنسخها احتياطياً.".to_string());
    }
    items.sort_by(|a, b| a.1.cmp(&b.1));

    let blob = build_backup_bytes(&items, &password)?;
    let target = std::path::PathBuf::from(&target_path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|_| "تعذر إنشاء مجلد الوجهة.".to_string())?;
        }
    }
    std::fs::write(&target, &blob).map_err(|_| "تعذر كتابة ملف النسخة في الوجهة.".to_string())?;
    let file_name = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("backup.dcbackup")
        .to_string();
    Ok(BackupCreated {
        file_path: target.to_string_lossy().to_string(),
        file_name,
        vault_count: items.len(),
        size: blob.len() as u64,
    })
}

/// فحص نسخة (قراءة فقط): يتحقق من كلمة المرور ويعرض المحتويات قبل الاستعادة.
#[tauri::command]
pub fn inspect_backup(path: String, password: String) -> Result<BackupInfo, String> {
    let bytes =
        std::fs::read(&path).map_err(|_| "تعذر قراءة ملف النسخة الاحتياطية.".to_string())?;
    let (manifest, _) = parse_backup_bytes(&bytes, &password)?;
    let total: u64 = manifest.vaults.iter().map(|v| v.size).sum();
    Ok(BackupInfo {
        vault_count: manifest.vaults.len(),
        total_size: total,
        created_at: manifest.created_at,
        vaults: manifest
            .vaults
            .into_iter()
            .map(|v| BackupVaultInfo {
                name: v.name,
                file_name: v.file_name,
                size: v.size,
            })
            .collect(),
    })
}

/// استعادة نسخة: فك التشفير → كتابة كل حاوية باسم فريد + حمايتها → إرجاع القائمة
/// لتسجيلها في سجل الواجهة. لا يكتب فوق أي ملف موجود إطلاقاً.
#[tauri::command]
pub fn restore_backup(
    app: AppHandle,
    path: String,
    password: String,
) -> Result<Vec<RestoredVault>, String> {
    let bytes =
        std::fs::read(&path).map_err(|_| "تعذر قراءة ملف النسخة الاحتياطية.".to_string())?;
    let (manifest, files) = parse_backup_bytes(&bytes, &password)?;
    let dir = vaults_dir(&app)?;

    let names: std::collections::HashMap<&str, &str> = manifest
        .vaults
        .iter()
        .map(|v| (v.file_name.as_str(), v.name.as_str()))
        .collect();

    let mut restored = Vec::with_capacity(files.len());
    for (file_name, content) in files {
        let safe = safe_vault_file_name(&file_name);
        let target = unique_target_path(&dir, &safe);
        std::fs::write(&target, &content).map_err(|_| "تعذر كتابة إحدى الحاويات.".to_string())?;
        let full = target.to_string_lossy().to_string();
        // حماية الملف المستعاد كأي حاوية جديدة (غير قاتلة لغير ويندوز)
        crate::vault::protect_vault_file(full.clone())?;
        let final_name = target
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&safe)
            .to_string();
        let display = names
            .get(file_name.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| stem_name(&final_name));
        restored.push(RestoredVault {
            name: display,
            file_name: final_name,
            full_path: full,
            size: content.len() as u64,
        });
    }
    restored.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_vault(name: &str, marker: u8) -> (String, String, Vec<u8>) {
        let file_name = format!("{name}.vault");
        let mut bytes = vec![0x56, 0x4C, 0x54, 0x31, 0x01];
        bytes.extend(std::iter::repeat_n(marker, 256));
        (name.to_string(), file_name, bytes)
    }

    #[test]
    fn backup_roundtrip_keeps_names_and_bytes() {
        let items = vec![fake_vault("العائلة", 0xA1), fake_vault("docs", 0xB2)];
        let blob = build_backup_bytes(&items, "Backup#2026").expect("build");
        assert!(blob.starts_with(&BACKUP_MAGIC));
        let (manifest, files) = parse_backup_bytes(&blob, "Backup#2026").expect("parse");
        assert_eq!(manifest.vaults.len(), 2);
        assert_eq!(files.len(), 2);
        for ((want_name, want_file, want_bytes), (got_file, got_bytes)) in
            items.iter().zip(files.iter())
        {
            assert_eq!(want_file, got_file);
            assert_eq!(want_bytes, got_bytes);
            let entry = manifest.vaults.iter().find(|v| &v.file_name == got_file).unwrap();
            assert_eq!(&entry.name, want_name);
        }
    }

    #[test]
    fn backup_wrong_password_and_tamper_fail() {
        let items = vec![fake_vault("x", 0x01)];
        let mut blob = build_backup_bytes(&items, "right-pass").expect("build");
        assert!(parse_backup_bytes(&blob, "wrong-pass").is_err());
        let last = blob.len() - 1;
        blob[last] ^= 0xFF;
        assert!(parse_backup_bytes(&blob, "right-pass").is_err());
        assert!(parse_backup_bytes(b"not-a-backup-at-all-xxxxxxxxxxxxxx", "right-pass").is_err());
        assert!(build_backup_bytes(&[], "right-pass").is_err());
    }

    #[test]
    fn unique_target_path_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("dcbu_uniq_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.vault"), b"1").unwrap();
        let p1 = unique_target_path(&dir, "a.vault");
        assert!(p1.file_name().unwrap().to_str().unwrap() != "a.vault");
        std::fs::write(&p1, b"2").unwrap();
        let p2 = unique_target_path(&dir, "a.vault");
        assert_ne!(p1, p2);
        let _ = std::fs::remove_file(dir.join("a.vault"));
        let _ = std::fs::remove_file(&p1);
        let _ = std::fs::remove_file(&p2);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn safe_names_block_traversal() {
        assert_eq!(safe_vault_file_name("../../evil"), "evil.vault");
        assert_eq!(safe_vault_file_name("a/b\\c"), "c.vault");
        assert_eq!(safe_vault_file_name("  "), "vault.vault");
        assert_eq!(safe_vault_file_name("my docs:1"), "my docs_1.vault");
    }
}
