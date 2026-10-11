# Tauri 2 Android Share Plugin (`file-share`): Final Implementation Guide

> **Audience:** the AI build agent in VS Code.
> **Goal:** let the user share files stored on disk through the **native Android share sheet** (`Intent.createChooser`, `ACTION_SEND` / `ACTION_SEND_MULTIPLE`), via a custom Tauri 2 plugin. No Web Share API.
> **Scope:** add one plugin + one app-side Rust command + one TS helper + wire the existing share button. Do not restructure the app.

---

## 0. Project facts and decisions (already agreed, do not revisit)

| # | Decision |
|---|---|
| 1 | Files already live **on disk** at `repos/<id>/files/` (no DB blobs). The app copies **disk → disk** into the app cache, then shares that copy. No file bytes ever cross the IPC. |
| 2 | The copy is done by a **new Rust command in `repos.rs`**: `prepare_share_files`. It returns cache paths only. |
| 3 | The plugin is a sibling of the existing **`device-contacts`** plugin. **Replicate its conventions exactly** (location, relative path dependency, `register_android_plugin`, manual Gradle lines, `allow-*` permissions). |
| 4 | **Do not run the Tauri plugin scaffolder.** Copy Gradle/Android build files from `device-contacts` (proven on this project's exact Tauri/AGP versions) and change only the namespace/names. |
| 5 | **No npm package.** The JS API is a single file copied to `src/lib/fileShare.ts`. |
| 6 | **No `@tauri-apps/plugin-fs`**, no extra fs capabilities. |
| 7 | MIME type is detected **in Kotlin from the file extension** (new files always have real extensions). Optional `mimeType` override exists in the API but is **not used by the app**. Do **not** add a DB column for MIME. Fallback is `application/octet-stream`. |
| 8 | Cleanup is **in Rust, not WebView timers**: on every `prepare_share_files` call and once at app startup, delete `share/<uuid>` folders whose directory `mtime` is older than **1 hour**, excluding the folder just created. |
| 9 | File names may arrive percent-encoded (e.g. `image%3A123.jpg`), so Rust sanitization is **mandatory**: percent-decode, then sanitize, then truncate to 255 bytes. |
| 10 | The plugin is called **from JS** (`shareFile(path)`), not from Rust, to keep the plugin standalone. |
| 11 | Android only. Other platforms return a clear error (`File sharing is only supported on Android`), which the UI turns into a toast. |
| 12 | The integration point is the existing **`sharePreview`** stub on the preview page (`savePreview` is out of scope). |
| 13 | Dev machine is memory-constrained (builds sometimes kill `rustc`/`gradle`). Follow the **cheapest-first verification order** in section 9. |

---

## 1. Architecture

```
Preview page: sharePreview()
   │ invoke("prepare_share_files", { sources })          (app command, repos.rs)
   ▼
Rust: resolve repos/<id>/files/<stored>  ──fs::copy──►  <app_cache_dir>/share/<uuid>/<sanitized name>
   │ returns ["<cache path>", ...]
   ▼
TS: shareFile(path) / shareFiles(paths)                   (src/lib/fileShare.ts)
   │ invoke("plugin:file-share|share_files", { payload })
   ▼
Plugin (Rust) ──run_mobile_plugin("shareFiles")──► Kotlin FileSharePlugin
   ├─ verifies path is inside app cache/files dirs
   ├─ FileProvider.getUriForFile (own authority)
   └─ startActivity(Intent.createChooser(...))
```

Why copy to cache + FileProvider: Android rejects raw `file://` sharing; a `content://` URI with a temporary read grant is required. The copy also keeps the original file untouched and gives it a clean name.

---

## 2. First: inspect the sibling plugin `device-contacts`

Before writing anything, read these and mirror them 1:1 for `file-share`:

1. Where the plugin folder lives and its layout.
2. Its `Cargo.toml`, `build.rs` (note the `.android_path(...)` value) and `permissions/`.
3. How `src-tauri/Cargo.toml` references it (relative `path` dependency).
4. How it is registered in the app's builder (`.plugin(...)`) and in `capabilities/*.json`.
5. **How its Android module is linked into `src-tauri/gen/android`**: the project README says the Gradle lines are added **manually** (two lines, typically one in `settings.gradle`/`tauri.settings.gradle` and one in the app's `build.gradle.kts`). First check whether the plugin `build.rs` already generates them; if not, add the equivalent two lines for `file-share`.
6. Its Android `build.gradle.kts`, `settings.gradle`, `gradle.properties`, wrapper/proguard files: **copy them** and change only `namespace` (below).

Naming used in this guide (adapt folder name to the sibling's convention):

| Item | Value |
|---|---|
| Crate | `tauri-plugin-file-share` |
| Plugin name (JS prefix) | `file-share` |
| Plugin Rust command | `share_files` |
| Permission | `file-share:allow-share-files`, default set `file-share:default` |
| Android namespace / package | `com.plugin.fileshare` |
| Kotlin classes | `FileSharePlugin`, `ShareFileProvider` |
| Kotlin command | `shareFiles` |

Package/namespace/`PLUGIN_IDENTIFIER` must be identical everywhere.

---

## 3. Plugin: Rust side

Folder: `<plugins dir>/tauri-plugin-file-share/`

```
Cargo.toml
build.rs
permissions/default.toml
src/{lib.rs, commands.rs, models.rs, error.rs, mobile.rs, desktop.rs}
android/…            (section 4)
```

### 3.1 `Cargo.toml`
Mirror `device-contacts` (versions of `tauri`, `tauri-plugin`, `serde`, `thiserror` must match it). Shape:

```toml
[package]
name = "tauri-plugin-file-share"
version = "0.1.0"
edition = "2021"
links = "tauri-plugin-file-share"

[dependencies]
tauri = { version = "2" }
serde = { version = "1", features = ["derive"] }
thiserror = "2"          # use the same major as device-contacts

[build-dependencies]
tauri-plugin = { version = "2", features = ["build"] }
```

### 3.2 `build.rs`
```rust
const COMMANDS: &[&str] = &["share_files"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
```

### 3.3 `permissions/default.toml`
```toml
"$schema" = "schemas/schema.json"

[default]
description = "Allows sharing files through the native Android share sheet"
permissions = ["allow-share-files"]
```

### 3.4 `src/error.rs`
```rust
use serde::{ser::Serializer, Serialize};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("File sharing is only supported on Android")]
    UnsupportedPlatform,

    #[cfg(target_os = "android")]
    #[error(transparent)]
    PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
```

### 3.5 `src/models.rs`
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareFilesRequest {
    /// Absolute paths inside the app's private dirs (cache/files/external cache/external files).
    pub paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Optional MIME override. NOT used by the app (Kotlin detects from extension).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}
```

### 3.6 `src/commands.rs`
```rust
use tauri::{command, AppHandle, Runtime};

use crate::{models::ShareFilesRequest, FileShareExt, Result};

#[command]
pub(crate) async fn share_files<R: Runtime>(
    app: AppHandle<R>,
    payload: ShareFilesRequest,
) -> Result<()> {
    app.file_share().share_files(payload)
}
```

### 3.7 `src/mobile.rs` (Android)
```rust
use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::{models::ShareFilesRequest, Result};

const PLUGIN_IDENTIFIER: &str = "com.plugin.fileshare";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<FileShare<R>> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "FileSharePlugin")?;
    Ok(FileShare(handle))
}

pub struct FileShare<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> FileShare<R> {
    pub fn share_files(&self, payload: ShareFilesRequest) -> Result<()> {
        self.0
            .run_mobile_plugin("shareFiles", payload)
            .map_err(Into::into)
    }
}
```

### 3.8 `src/desktop.rs` (every non-Android target)
```rust
use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::{models::ShareFilesRequest, Error, Result};

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<FileShare<R>> {
    Ok(FileShare(app.clone()))
}

pub struct FileShare<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> FileShare<R> {
    pub fn share_files(&self, _payload: ShareFilesRequest) -> Result<()> {
        Err(Error::UnsupportedPlatform)
    }
}
```

### 3.9 `src/lib.rs`
```rust
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(not(target_os = "android"))]
mod desktop;
#[cfg(target_os = "android")]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};
pub use models::*;

#[cfg(not(target_os = "android"))]
use desktop::FileShare;
#[cfg(target_os = "android")]
use mobile::FileShare;

pub trait FileShareExt<R: Runtime> {
    fn file_share(&self) -> &FileShare<R>;
}

impl<R: Runtime, T: Manager<R>> FileShareExt<R> for T {
    fn file_share(&self) -> &FileShare<R> {
        self.state::<FileShare<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("file-share")
        .invoke_handler(tauri::generate_handler![commands::share_files])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let file_share = mobile::init(app, api)?;
            #[cfg(not(target_os = "android"))]
            let file_share = desktop::init(app, api)?;
            app.manage(file_share);
            Ok(())
        })
        .build()
}
```

---

## 4. Plugin: Android side (Kotlin)

### 4.1 Gradle files
**Copy from `device-contacts/android/`** (`build.gradle.kts`, `settings.gradle`, `gradle.properties`, proguard files, wrapper if present). Change only:

```kotlin
android { namespace = "com.plugin.fileshare" }
```
Verify the dependencies include `androidx.core:core-ktx` (provides `FileProvider`) and `implementation(project(":tauri-android"))`. Add `androidx.core` if missing.

### 4.2 `android/src/main/AndroidManifest.xml`
Own provider subclass + own authority, so it never clashes with the app's existing FileProvider:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application>
        <provider
            android:name="com.plugin.fileshare.ShareFileProvider"
            android:authorities="${applicationId}.fileshare.provider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/fileshare_file_paths" />
        </provider>
    </application>
</manifest>
```
(If `device-contacts` has a manifest, keep any needed attributes consistent with it.)

### 4.3 `android/src/main/res/xml/fileshare_file_paths.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="fileshare_cache" path="." />
    <files-path name="fileshare_files" path="." />
    <external-cache-path name="fileshare_ext_cache" path="." />
    <external-files-path name="fileshare_ext_files" path="." />
</paths>
```

### 4.4 `android/src/main/java/com/plugin/fileshare/ShareFileProvider.kt`
```kotlin
package com.plugin.fileshare

import androidx.core.content.FileProvider

class ShareFileProvider : FileProvider()
```

### 4.5 `android/src/main/java/com/plugin/fileshare/FileSharePlugin.kt`
```kotlin
package com.plugin.fileshare

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class ShareFilesArgs {
    var paths: Array<String> = emptyArray()   // keep Array, not List (Jackson generics)
    var title: String? = null
    var subject: String? = null
    var text: String? = null
    var mimeType: String? = null
}

@TauriPlugin
class FileSharePlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun shareFiles(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ShareFilesArgs::class.java)
            if (args.paths.isEmpty()) {
                invoke.reject("No files to share")
                return
            }

            val authority = "${activity.packageName}.fileshare.provider"
            val uris = ArrayList<Uri>(args.paths.size)
            val mimeTypes = LinkedHashSet<String>()

            for (path in args.paths) {
                val file = resolveAllowedFile(path)
                uris.add(FileProvider.getUriForFile(activity, authority, file))
                mimeTypes.add(guessMimeType(file))
            }

            val mime = args.mimeType?.takeIf { it.isNotBlank() } ?: combineMimeTypes(mimeTypes)

            val intent = if (uris.size == 1) {
                Intent(Intent.ACTION_SEND).apply { putExtra(Intent.EXTRA_STREAM, uris[0]) }
            } else {
                Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                    putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                }
            }

            intent.type = mime
            args.subject?.let { intent.putExtra(Intent.EXTRA_SUBJECT, it) }
            args.text?.let { intent.putExtra(Intent.EXTRA_TEXT, it) }
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

            val clip = ClipData.newRawUri(null, uris[0])
            for (i in 1 until uris.size) clip.addItem(ClipData.Item(uris[i]))
            intent.clipData = clip

            val chooser = Intent.createChooser(intent, args.title)
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

            activity.runOnUiThread {
                try {
                    activity.startActivity(chooser)
                    invoke.resolve()
                } catch (e: Exception) {
                    invoke.reject(e.message ?: "Failed to open share sheet")
                }
            }
        } catch (e: Exception) {
            invoke.reject(e.message ?: "Failed to share files")
        }
    }

    /** Only files inside the app's own dirs may be shared (blocks traversal and symlink escapes). */
    private fun resolveAllowedFile(path: String): File {
        val file = File(path).canonicalFile
        if (!file.exists() || !file.isFile) {
            throw IllegalArgumentException("File not found: $path")
        }
        val roots = listOfNotNull(
            activity.cacheDir,
            activity.filesDir,
            activity.externalCacheDir,
            activity.getExternalFilesDir(null),
        )
        val filePath = file.canonicalPath
        val allowed = roots.any { filePath.startsWith(it.canonicalPath + File.separator) }
        if (!allowed) {
            throw SecurityException("File is outside the app's allowed directories: $path")
        }
        return file
    }

    private fun guessMimeType(file: File): String {
        val ext = file.extension.lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

    private fun combineMimeTypes(types: Set<String>): String {
        if (types.size == 1) return types.first()
        val majors = types.map { it.substringBefore('/') }.toSet()
        return if (majors.size == 1) "${majors.first()}/*" else "*/*"
    }
}
```

---

## 5. App side (Rust): `prepare_share_files` in `repos.rs`

### 5.1 Dependencies (`src-tauri/Cargo.toml`), add only if not already present
```toml
percent-encoding = "2"
uuid = { version = "1", features = ["v4"] }
```

### 5.2 Code (adapt types/paths to the project's real structs; the `resolve_repo_file` body is the only project-specific part)

```rust
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use percent_encoding::percent_decode_str;
use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime};

const SHARE_DIR: &str = "share";
const SHARE_MAX_AGE: Duration = Duration::from_secs(60 * 60); // 1 hour
const MAX_NAME_BYTES: usize = 255;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareSource {
    pub repo_id: String,
    /// Name of the file as stored on disk under repos/<id>/files/
    pub stored_name: String,
    /// Optional human-friendly name; falls back to stored_name.
    pub display_name: Option<String>,
}

/// Maps a ShareSource to its real path. ADAPT to the project's actual layout
/// (`repos/<id>/files/`). Must reject separators/".." in ids and names and
/// must verify the canonical result stays inside the repos root.
fn resolve_repo_file<R: Runtime>(app: &AppHandle<R>, s: &ShareSource) -> Result<PathBuf, String> {
    fn safe_segment(v: &str) -> bool {
        !v.is_empty() && v != "." && v != ".." && !v.contains(['/', '\\', '\0'])
    }
    if !safe_segment(&s.repo_id) || !safe_segment(&s.stored_name) {
        return Err("Invalid file reference".into());
    }
    // TODO(agent): replace with the project's real repos root helper.
    let repos_root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("repos");
    let path = repos_root.join(&s.repo_id).join("files").join(&s.stored_name);

    let canon = path.canonicalize().map_err(|_| "File not found".to_string())?;
    let root = repos_root.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(&root) || !canon.is_file() {
        return Err("File not found".into());
    }
    Ok(canon)
}

/// 1) percent-decode  2) sanitize  3) truncate to 255 bytes (keeping the extension).
fn sanitize_file_name(raw: &str) -> String {
    let decoded = percent_decode_str(raw).decode_utf8_lossy().into_owned();
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

/// `display_name` usually comes from a user-written title (e.g. `doc.title`) and often has NO
/// extension. Kotlin detects the MIME type from the extension, so always make sure the
/// extension of the stored file (e.g. `doc.fileName`) is present on the shared copy.
fn display_with_ext(display: Option<&str>, stored: &str) -> String {
    let stored_dec = percent_decode_str(stored).decode_utf8_lossy().into_owned();
    let ext = Path::new(&stored_dec)
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

fn truncate_to_bytes(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

fn truncate_keep_ext(name: &str, max: usize) -> String {
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

/// Avoids overwriting when two files in one batch end up with the same name.
fn unique_dest(dir: &Path, name: &str) -> PathBuf {
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

/// Deletes share/<uuid> folders whose directory mtime is older than 1 hour.
pub fn cleanup_old_share_dirs(share_root: &Path, keep: Option<&Path>) {
    let Ok(entries) = fs::read_dir(share_root) else { return };
    let now = SystemTime::now();
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
            .map_or(false, |age| age > SHARE_MAX_AGE);
        if is_old {
            let _ = fs::remove_dir_all(&path);
        }
    }
}

/// Startup cleanup (call from the builder's `.setup`, see 5.3).
pub fn cleanup_share_cache_on_startup<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(cache) = app.path().app_cache_dir() {
        let root = cache.join(SHARE_DIR);
        std::thread::spawn(move || cleanup_old_share_dirs(&root, None));
    }
}

#[tauri::command]
pub async fn prepare_share_files<R: Runtime>(
    app: AppHandle<R>,
    sources: Vec<ShareSource>,
) -> Result<Vec<String>, String> {
    if sources.is_empty() {
        return Err("No files to share".into());
    }
    let share_root = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join(SHARE_DIR);

    // Resolve + validate sources first (cheap, fails fast).
    let mut items: Vec<(PathBuf, String)> = Vec::with_capacity(sources.len());
    for s in &sources {
        let src = resolve_repo_file(&app, s)?;
        // displayName (user title) is ALWAYS sanitized here, and gets the stored file's extension if missing.
        let name = sanitize_file_name(&display_with_ext(s.display_name.as_deref(), &s.stored_name));
        items.push((src, name));
    }

    // Disk -> disk copy off the async runtime (files can be 13MB+).
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<String>, String> {
        let dir = share_root.join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        let mut out = Vec::with_capacity(items.len());
        for (src, name) in items {
            let dest = unique_dest(&dir, &name);
            fs::copy(&src, &dest).map_err(|e| format!("Copy failed: {e}"))?;
            out.push(dest.to_string_lossy().into_owned());
        }

        cleanup_old_share_dirs(&share_root, Some(&dir));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod share_tests {
    use super::*;

    #[test]
    fn decodes_and_sanitizes() {
        assert_eq!(sanitize_file_name("image%3A123.jpg"), "image_123.jpg");
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name("   "), "file");
        assert_eq!(sanitize_file_name(".hidden.txt"), "hidden.txt");
    }

    #[test]
    fn display_name_gets_stored_extension() {
        assert_eq!(display_with_ext(Some("تقرير"), "a1b2.pdf"), "تقرير.pdf");
        assert_eq!(display_with_ext(Some("Report v1.2"), "x.pdf"), "Report v1.2.pdf");
        assert_eq!(display_with_ext(Some("scan.JPG"), "image%3A9.jpg"), "scan.JPG");
        assert_eq!(display_with_ext(None, "image%3A9.jpg"), "image%3A9.jpg");
        assert_eq!(display_with_ext(Some("  "), "f.png"), "f.png");
    }

    #[test]
    fn truncates_keeping_extension() {
        let long = format!("{}.pdf", "a".repeat(400));
        let n = sanitize_file_name(&long);
        assert!(n.len() <= 255 && n.ends_with(".pdf"));
        let arabic = format!("{}.png", "م".repeat(300));
        let n = sanitize_file_name(&arabic);
        assert!(n.len() <= 255 && n.ends_with(".png"));
    }
}
```

### 5.3 Registration in the app builder

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_file_share::init())        // new plugin (same style as device-contacts)
    .setup(|app| {
        repos::cleanup_share_cache_on_startup(app.handle());
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        // ...existing commands...
        repos::prepare_share_files,
    ])
```
(Merge into the existing `.setup` / `generate_handler!`; do not duplicate them. Adjust the `repos::` path to wherever `repos.rs` is declared.)

### 5.4 `src-tauri/Cargo.toml` and capabilities
- Add the plugin dependency exactly like `device-contacts` (relative `path`).
- Add `"file-share:default"` to the capability file, next to the contacts permissions.
- The project's own `repos` commands have **no per-command entries in `capabilities`**, so `prepare_share_files` gets none either (only `"file-share:default"` for the plugin).

---

## 6. Front-end (TypeScript)

### 6.1 `src/lib/fileShare.ts` (copy of the plugin's guest-js; no npm package)

```ts
import { invoke } from '@tauri-apps/api/core';

export interface ShareFilesOptions {
  title?: string;
  subject?: string;
  text?: string;
  /** Optional override. Not used by the app: Kotlin detects the type from the extension. */
  mimeType?: string;
}

/** Opens the native Android share sheet. Paths must be inside the app's cache/files dirs. */
export async function shareFiles(paths: string[], options: ShareFilesOptions = {}): Promise<void> {
  await invoke<void>('plugin:file-share|share_files', { payload: { paths, ...options } });
}

export function shareFile(path: string, options: ShareFilesOptions = {}): Promise<void> {
  return shareFiles([path], options);
}
```

### 6.2 Wire `sharePreview` (preview page)

```ts
import { invoke } from '@tauri-apps/api/core';
import { shareFile } from '../lib/fileShare';

async function sharePreview() {
  try {
    const [path] = await invoke<string[]>('prepare_share_files', {
      sources: [{
        repoId: repo.meta.id,
        storedName: doc.fileName,
        displayName: doc.title,   // user-written; sanitized in Rust, extension added from fileName if missing
      }],
    });
    await shareFile(path, { title: t('documentManager.shareBtn') }); // key already exists
  } catch (err) {
    const msg = String(err);
    if (msg.includes('only supported on Android')) {
      // toast with t('documentManager.shareAndroidOnly')
    } else {
      console.error(err);
      // toast with t('documentManager.shareFailed')
    }
  }
}
```

**i18n (agent must add):** two new keys in both `ar` and `en` locale files, following the project's existing pattern and the same namespace as `documentManager.shareBtn` (adjust the namespace only if the toasts live elsewhere):

| Key | en | ar |
|---|---|---|
| `documentManager.shareFailed` | `Couldn't share the file` | `تعذّرت مشاركة الملف` |
| `documentManager.shareAndroidOnly` | `Sharing is only available on Android` | `المشاركة متاحة على أندرويد فقط` |

The `msg.includes('only supported on Android')` check matches the plugin's desktop error text (`File sharing is only supported on Android`); do not change one without the other.
Do not touch `savePreview`. There is no JS-side cleanup and no JS timers: cleanup is entirely in Rust (section 5).

---

## 7. Android project linking and README

1. Add the Gradle lines for `file-share` the same way `device-contacts` was added (see section 2, item 5).
2. Update the project README, in the same place/style as the `device-contacts` note, with the generation risk:
   - Running **`tauri android init` again regenerates `src-tauri/gen/android` and erases the manually added Gradle lines**. After any re-init, re-add the lines for **both** `device-contacts` and `file-share`.
   - List the exact lines to re-add.
3. Do not edit anything else under `gen/android` unless required.

---

## 8. Security notes (keep as designed)

- Kotlin refuses any path outside the app's cache/files dirs (canonical path check, resists `..` and symlinks).
- `resolve_repo_file` rejects separators/`..` in ids/names and checks the canonical path stays inside the repos root.
- File names from outside are always percent-decoded and sanitized before use.
- The FileProvider is `exported=false` and grants only temporary read permission via the intent.

---

## 9. Build and verification: cheapest first

Dev machine runs out of memory (rustc/gradle get killed). Stop at the first failure; do not jump to the heavy steps.

1. **Unit tests for the sanitizer** (tiny): `cargo test share_tests` in `src-tauri`.
2. **Plugin alone:** `cargo check` in the plugin folder. Confirm `permissions/autogenerated/` contains `allow-share-files`.
3. **App, host target:** `cargo check` in `src-tauri` (desktop path compiles with `UnsupportedPlatform`).
4. **App, Android target only:** `cargo check --target aarch64-linux-android` with:
   - `CARGO_BUILD_JOBS=1`
   - `CARGO_TARGET_DIR` on `C:` if disk/memory pressure requires it (as the README describes).
5. **Gradle/manifest:** only now run the Android build through the project's existing script (`android-dev-usb.ps1`), **aarch64 only**, one job, and expect it to be slow. Before installing on the device, inspect the merged manifest at
   `src-tauri/gen/android/app/build/intermediates/merged_manifests/**/AndroidManifest.xml`:
   - it contains the provider with authority `<applicationId>.fileshare.provider`,
   - the app's original FileProvider is still present,
   - no duplicate-provider merge errors.
6. **On device:**
   - Share a single image → chooser opens → send to WhatsApp/Gmail/Drive: correct name and type received.
   - Share a file whose stored name is percent-encoded (`image%3A…`) → received name is clean (`image_….jpg`).
   - Share a ~13 MB file → no freeze, no memory spike, copy completes.
   - Open the chooser, then kill the app → on next launch folders older than 1 hour under `cache/share/` are removed; newer ones kept.
   - Log the returned cache path once and confirm it is under the app's `cacheDir` (this is what the Kotlin check requires).
   - On desktop (`tauri dev`): button shows the "Android only" toast, no crash.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Plugin file-share not found` / command not allowed | Missing `"file-share:default"` capability or missing `.plugin(tauri_plugin_file_share::init())`. |
| `ClassNotFoundException …FileSharePlugin` | Mismatch between `PLUGIN_IDENTIFIER`, Kotlin `package`, folder path, `namespace`; or the manual Gradle lines were wiped by a `tauri android init`. |
| Manifest merge error (duplicate provider) | Keep the `ShareFileProvider` subclass and authority `${applicationId}.fileshare.provider`. |
| `Failed to find configured root` | File is outside the roots in `fileshare_file_paths.xml`; it must be under `app_cache_dir()`. |
| Receiving app cannot read the file | Missing grant flag/`ClipData`, or the folder was cleaned too early (rule is 1 hour on folder mtime). |
| `parseArgs` fails on `paths` | Keep `Array<String>`, not `List<String>`. |
| Crashes only in release | Add `-keep class com.plugin.fileshare.** { *; }` to the plugin's proguard/consumer rules. |
| Shared file has no extension / generic type | Source stored name lacks a real extension. Fix at the source (fingerprint fix already covers new files). A MIME DB column is deliberately deferred. |

---

## 11. Limitations / deferred

- The share sheet does not report which app was chosen or completion; the promise resolves once the chooser opens.
- iOS not implemented (non-Android targets return `UnsupportedPlatform`).
- No MIME column in the schema (decision 7); revisit only if a real failure appears.
- Multi-file sharing is supported by the plugin and `prepare_share_files` (array in/out); the preview page currently shares one file.
