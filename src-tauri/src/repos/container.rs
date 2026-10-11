// الحاوية المشفرة للمستودع (الشريحة 1: الصيغة + الترويسة فقط — بلا توصيل بالواجهات).
// التخطيط على القرص: `repo.vault` = ترويسة نصية 4KB أولاً ثم بايتات المغلّف المشفر.
//   الترويسة:  MAGIC[4]=RPH1 | version u32LE | json_len u32LE | JSON ثم حشو صفري.
//   الحمولة:  `encrypt_envelope` من `vault.rs` ببصمة RPV1 (نفس الدالة المجرّبة).
// القاعدة: لا بايت نصي مفهوم خارج الترويسة — وتُفحص آلياً (اختبار المسح الخام).
// كل كتابة للترويسة تمر عبر `write_header_block` حصراً (القائمة البيضاء + سقف 255 حرفاً).

use crate::vault::{decrypt_envelope, encrypt_envelope};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// بصمة المغلّف الخاصة بالمستودعات (متميزة عن VLT1 للحاويات وDCBU للنسخ).
pub(crate) const REPO_VAULT_MAGIC: [u8; 4] = [0x52, 0x50, 0x56, 0x31]; // RPV1
/// بصمة كتلة الترويسة في أول 4KB من ملف `.vault`.
pub(crate) const REPO_HEADER_MAGIC: [u8; 4] = [0x52, 0x50, 0x48, 0x31]; // RPH1
/// حجم كتلة الترويسة الثابت — تحديث موضعي للكيلوبايتات الأولى فقط.
pub(crate) const HEADER_SIZE: usize = 4096;
/// نسخة الترويسة الحالية.
pub(crate) const HEADER_VERSION: u32 = 1;
/// سقف أي قيمة نصية في الترويسة (عدّ الحروف حفاظاً على العربية).
pub(crate) const HEADER_TEXT_CAP: usize = 255;
/// القائمة البيضاء المغلقة: ما عداها يُرفَض عند الكتابة ويُتجاهَل عند القراءة.
const HEADER_ALLOWED_KEYS: [&str; 9] = [
    "v",
    "id",
    "name",
    "peopleCount",
    "filesCount",
    "info",
    "note",
    "tag",
    "caption",
];

/// الترويسة — المصدر الوحيد للعرض (القائمة، الأسماء، العدادات، استهداف الفتح).
/// مبدأ "الأسماء وصول لا أسرار": هذه الحقول نصية عمداً — المشفر فعلاً هو كل المحتوى.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepoHeader {
    pub(crate) v: u32,
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) people_count: u64,
    #[serde(default)]
    pub(crate) files_count: u64,
    #[serde(default)]
    pub(crate) info: String,
    #[serde(default)]
    pub(crate) note: String,
    #[serde(default)]
    pub(crate) tag: String,
    #[serde(default)]
    pub(crate) caption: String,
}

/// بناء ترويسة جديدة — كلمة المستودع ستُطلب لاحقاً عند إنشاء الحاوية (إجبارية دائماً).
pub(crate) fn new_header(id: &str, name: &str) -> Result<RepoHeader, String> {
    let h = RepoHeader {
        v: HEADER_VERSION,
        id: id.trim().to_string(),
        name: name.trim().to_string(),
        people_count: 0,
        files_count: 0,
        info: String::new(),
        note: String::new(),
        tag: String::new(),
        caption: String::new(),
    };
    if h.id.is_empty() {
        return Err("معرف المستودع فارغ.".to_string());
    }
    if h.name.is_empty() {
        return Err("اسم المستودع فارغ.".to_string());
    }
    // نفس مسار الكتابة الوحيد — السقف يُفرَض هنا أيضاً لا عند الحفظ فقط.
    validate_header(&h)?;
    Ok(h)
}

/// رفض أي مفتاح خارج البيضاء + سقف 255 حرفاً (عدّ حروف) لأي قيمة نصية.
fn validate_header_json(map: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    for (key, value) in map {
        if !HEADER_ALLOWED_KEYS.contains(&key.as_str()) {
            return Err(format!("مفتاح مرفوض في الترويسة: {key}."));
        }
        if let Some(text) = value.as_str() {
            if text.chars().count() > HEADER_TEXT_CAP {
                return Err(format!("قيمة الترويسة '{key}' تتجاوز 255 حرفاً."));
            }
        }
    }
    Ok(())
}

/// التحقق الوحيد قبل أي كتابة: النسخة + البيضاء + السقف. تُرجع الخريطة الجاهزة للترميز.
fn validate_header(header: &RepoHeader) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    if header.v != HEADER_VERSION {
        return Err("نسخة الترويسة غير مدعومة.".to_string());
    }
    let value =
        serde_json::to_value(header).map_err(|_| "تعذر ترميز الترويسة.".to_string())?;
    let map = value
        .as_object()
        .cloned()
        .ok_or("تعذر ترميز الترويسة.".to_string())?;
    validate_header_json(&map)?;
    Ok(map)
}

/// دالة الكتابة الوحيدة: كتلة 4KB (سحرية + إصدار + طول + JSON مبطّن بأصفار).
pub(crate) fn write_header_block(header: &RepoHeader) -> Result<[u8; HEADER_SIZE], String> {
    let map = validate_header(header)?;
    let json = serde_json::to_vec(&map).map_err(|_| "تعذر ترميز الترويسة.".to_string())?;
    if json.len() > HEADER_SIZE - 12 {
        return Err("الترويسة تجاوزت 4KB.".to_string());
    }
    let mut block = [0u8; HEADER_SIZE];
    block[0..4].copy_from_slice(&REPO_HEADER_MAGIC);
    block[4..8].copy_from_slice(&HEADER_VERSION.to_le_bytes());
    block[8..12].copy_from_slice(&(json.len() as u32).to_le_bytes());
    block[12..12 + json.len()].copy_from_slice(&json);
    Ok(block)
}

/// قراءة الترويسة: المجهول يُتجاهَل والناقص يُفترَض (الإصدار وحده يحكم التوسع).
/// أي تلف في البنية (بصمة/طول) مرفوض — بلا ذعر (panic) مهما كانت البايتات.
pub(crate) fn parse_header_block(block: &[u8]) -> Result<RepoHeader, String> {
    if block.len() < HEADER_SIZE {
        return Err("كتلة الترويسة ناقصة.".to_string());
    }
    if block[0..4] != REPO_HEADER_MAGIC {
        return Err("بصمة الترويسة غير صالحة.".to_string());
    }
    let version = u32::from_le_bytes(
        block[4..8]
            .try_into()
            .map_err(|_| "كتلة الترويسة تالفة.".to_string())?,
    );
    if version != HEADER_VERSION {
        return Err("نسخة الترويسة غير مدعومة.".to_string());
    }
    let len = u32::from_le_bytes(
        block[8..12]
            .try_into()
            .map_err(|_| "كتلة الترويسة تالفة.".to_string())?,
    ) as usize;
    if len > HEADER_SIZE - 12 {
        return Err("طول الترويسة غير صالح.".to_string());
    }
    serde_json::from_slice(&block[12..12 + len]).map_err(|_| "الترويسة تالفة.".to_string())
}

/// إنشاء بايتات `repo.vault` كاملة: الترويسة أولاً ثم الحمولة المشفرة بكلمة المرور.
pub(crate) fn create_container_bytes(
    header: &RepoHeader,
    sqlite_payload: &[u8],
    password: &str,
) -> Result<Vec<u8>, String> {
    if password.is_empty() {
        return Err("كلمة المستودع إجبارية — لا مستودع بلا كلمة.".to_string());
    }
    let header_block = write_header_block(header)?;
    let envelope = encrypt_envelope(&REPO_VAULT_MAGIC, sqlite_payload, password)?;
    let mut out = Vec::with_capacity(HEADER_SIZE + envelope.len());
    out.extend_from_slice(&header_block);
    out.extend_from_slice(&envelope);
    Ok(out)
}

/// قراءة الترويسة من بايتات الحاوية — للعرض فقط، بلا حاجة لكلمة المرور.
pub(crate) fn read_header_from_bytes(container: &[u8]) -> Result<RepoHeader, String> {
    if container.len() < HEADER_SIZE {
        return Err("ملف الحاوية ناقص.".to_string());
    }
    parse_header_block(&container[..HEADER_SIZE])
}

/// فك الحمولة: كلمة خاطئة أو عبث ببايت واحد أو تلف — كلها رفض برسالة موحدة.
pub(crate) fn decrypt_container_payload(
    container: &[u8],
    password: &str,
) -> Result<Vec<u8>, String> {
    if container.len() < HEADER_SIZE {
        return Err("ملف الحاوية ناقص.".to_string());
    }
    decrypt_envelope(&REPO_VAULT_MAGIC, &container[HEADER_SIZE..], password)
}

/// تحديث موضعي للترويسة في ملف قائم: الكيلوبايتات الأولى فقط — بقية الملف لا تُمس.
pub(crate) fn overwrite_header_file(path: &Path, header: &RepoHeader) -> Result<(), String> {
    let block = write_header_block(header)?;
    let size = std::fs::metadata(path)
        .map_err(|_| "ملف الحاوية غير موجود.".to_string())?
        .len();
    if size < HEADER_SIZE as u64 {
        return Err("ملف الحاوية ناقص.".to_string());
    }
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|_| "تعذر فتح ملف الحاوية.".to_string())?;
    use std::io::{Seek, SeekFrom, Write};
    file.seek(SeekFrom::Start(0))
        .map_err(|_| "تعذر تحديث الترويسة.".to_string())?;
    file.write_all(&block)
        .map_err(|_| "تعذر تحديث الترويسة.".to_string())?;
    file.sync_all()
        .map_err(|_| "تعذر تحديث الترويسة.".to_string())?;
    Ok(())
}

// ================= اختبارات الشريحة 1 =================
#[cfg(test)]
mod tests {
    use super::*;

    fn test_header() -> RepoHeader {
        new_header("repo-1", "مستودع الاختبار").expect("valid header")
    }

    /// كتلة ترويسة من JSON خام — لاختبار سياسات القراءة (مجهول/ناقص/تالف).
    fn block_with_json(json: &[u8]) -> Vec<u8> {
        let mut block = vec![0u8; HEADER_SIZE];
        block[0..4].copy_from_slice(&REPO_HEADER_MAGIC);
        block[4..8].copy_from_slice(&HEADER_VERSION.to_le_bytes());
        block[8..12].copy_from_slice(&(json.len() as u32).to_le_bytes());
        block[12..12 + json.len()].copy_from_slice(json);
        block
    }

    #[test]
    fn header_block_layout_is_exactly_4k() {
        let block = write_header_block(&test_header()).expect("write");
        assert_eq!(block.len(), HEADER_SIZE);
        assert_eq!(&block[0..4], &REPO_HEADER_MAGIC);
        assert_eq!(u32::from_le_bytes(block[4..8].try_into().unwrap()), HEADER_VERSION);
        let len = u32::from_le_bytes(block[8..12].try_into().unwrap()) as usize;
        assert!(len > 0 && len <= HEADER_SIZE - 12);
        // ما بعد JSON حشو صفري خالص.
        assert!(block[12 + len..].iter().all(|b| *b == 0), "الحشو يجب أن يكون أصفاراً");
        // والمنتَج يُقرأ ويطابق الأصل.
        assert_eq!(parse_header_block(&block).expect("parse"), test_header());
    }

    #[test]
    fn produced_header_has_whitelist_keys_only() {
        let block = write_header_block(&test_header()).expect("write");
        let len = u32::from_le_bytes(block[8..12].try_into().unwrap()) as usize;
        let value: serde_json::Value =
            serde_json::from_slice(&block[12..12 + len]).expect("json");
        let map = value.as_object().expect("object");
        assert_eq!(map.len(), HEADER_ALLOWED_KEYS.len(), "المحجوزات الفارغة تُسلسَل دائماً");
        for key in map.keys() {
            assert!(
                HEADER_ALLOWED_KEYS.contains(&key.as_str()),
                "مفتاح خارج البيضاء في المنتَج: {key}"
            );
        }
        assert_eq!(map["v"], serde_json::Value::from(HEADER_VERSION));
    }

    #[test]
    fn write_rejects_unknown_key() {
        let mut map = serde_json::to_value(&test_header())
            .expect("value")
            .as_object()
            .cloned()
            .expect("object");
        map.insert("evil".to_string(), serde_json::Value::from(1));
        assert!(validate_header_json(&map).is_err(), "المفتاح الغريب يُرفَض عند الكتابة");
    }

    #[test]
    fn text_cap_counts_chars_not_bytes() {
        // 255 حرفاً عربياً (510 بايتاً) مقبولة — عدّ الحروف لا البايتات.
        let ok = "م".repeat(255);
        let mut h = test_header();
        h.name = ok;
        assert!(write_header_block(&h).is_ok());
        // 256 حرفاً مرفوضة.
        h.name = "م".repeat(256);
        assert!(write_header_block(&h).is_err(), "الحد 255 حرفاً");
        assert!(new_header("x", &"ن".repeat(300)).is_err());
    }

    #[test]
    fn container_roundtrip() {
        let payload = b"SQLite format 3\0fake-db-bytes";
        let bytes = create_container_bytes(&test_header(), payload, "Test#1234").expect("create");
        // البصمتان في موضعيهما: ترويسة أولاً ثم مغلّف المستودعات.
        assert_eq!(&bytes[0..4], &REPO_HEADER_MAGIC);
        assert_eq!(&bytes[HEADER_SIZE..HEADER_SIZE + 4], &REPO_VAULT_MAGIC);
        assert_ne!(&bytes[HEADER_SIZE..HEADER_SIZE + 4], &crate::vault::VAULT_MAGIC);
        let header = read_header_from_bytes(&bytes).expect("read header");
        assert_eq!(header.name, "مستودع الاختبار");
        let back = decrypt_container_payload(&bytes, "Test#1234").expect("decrypt");
        assert_eq!(back, payload);
    }

    #[test]
    fn container_requires_password() {
        assert!(create_container_bytes(&test_header(), b"data", "").is_err(), "الفارغة مرفوضة");
        assert!(create_container_bytes(&test_header(), b"data", "abc").is_err(), "القصيرة مرفوضة");
    }

    #[test]
    fn wrong_password_rejected() {
        let bytes = create_container_bytes(&test_header(), b"secret", "Test#1234").expect("create");
        assert!(decrypt_container_payload(&bytes, "wrong-pass").is_err());
    }

    #[test]
    fn single_byte_tamper_detected() {
        let mut bytes =
            create_container_bytes(&test_header(), b"secret-payload", "Test#1234").expect("create");
        bytes[HEADER_SIZE + 40] ^= 0x01;
        assert!(decrypt_container_payload(&bytes, "Test#1234").is_err(), "عبث بايت واحد يُكتشَف");
    }

    #[test]
    fn raw_bytes_scan_no_plaintext_outside_header() {
        // بوابة القبول 2: أي نص مفهوم خارج الترويسة = فشل.
        let secret = "Ahmed-SEKRIT-NAME-999";
        let mut payload = b"SQLite format 3\0".to_vec();
        payload.extend_from_slice(secret.as_bytes());
        let bytes = create_container_bytes(&test_header(), &payload, "Test#1234").expect("create");
        let tail = &bytes[HEADER_SIZE..];
        let found = tail.windows(secret.len()).any(|w| w == secret.as_bytes());
        assert!(!found, "نص الحمولة ظاهر في بايتات القرص الخام");
    }

    #[test]
    fn read_ignores_unknown_and_defaults_missing() {
        // حقل غريب يُتجاهَل + الناقص يُفترَض — الإصدار وحده يحكم التوسع.
        let json = br#"{"v":1,"id":"x","name":"y","bogus":123}"#.to_vec();
        let header = parse_header_block(&block_with_json(&json)).expect("parse");
        assert_eq!(header.id, "x");
        assert_eq!(header.people_count, 0);
        assert_eq!(header.files_count, 0);
    }

    #[test]
    fn corrupt_header_rejected_without_panic() {
        let mut block = write_header_block(&test_header()).expect("write").to_vec();
        block[0..4].copy_from_slice(b"BAD!");
        assert!(parse_header_block(&block).is_err(), "البصمة الفاسدة مرفوضة");
        let mut block = write_header_block(&test_header()).expect("write").to_vec();
        block[8..12].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(parse_header_block(&block).is_err(), "الطول الفاسد مرفوض بلا ذعر");
        assert!(parse_header_block(&[0u8; 100]).is_err(), "الكتلة الناقصة مرفوضة");
    }

    #[test]
    fn overwrite_header_touches_first_4k_only() {
        let dir = std::env::temp_dir().join(format!("repo_container_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("repo.vault");
        struct Guard {
            path: std::path::PathBuf,
            dir: std::path::PathBuf,
        }
        impl Drop for Guard {
            fn drop(&mut self) {
                let _ = std::fs::remove_file(&self.path);
                let _ = std::fs::remove_dir(&self.dir);
            }
        }
        let _guard = Guard { path: path.clone(), dir: dir.clone() };
        let bytes =
            create_container_bytes(&test_header(), b"payload-kept", "Test#1234").expect("create");
        std::fs::write(&path, &bytes).expect("write temp vault");
        let mut updated = test_header();
        updated.name = "الاسم الجديد".to_string();
        updated.people_count = 7;
        overwrite_header_file(&path, &updated).expect("overwrite");
        let raw = std::fs::read(&path).expect("read back");
        // الترويسة تحدثت...
        let header = read_header_from_bytes(&raw).expect("read header");
        assert_eq!(header.name, "الاسم الجديد");
        assert_eq!(header.people_count, 7);
        // ...وبقية الملف (الحمولة المشفرة) بايتاً ببايت كما كانت.
        assert_eq!(&raw[HEADER_SIZE..], &bytes[HEADER_SIZE..]);
        assert_eq!(decrypt_container_payload(&raw, "Test#1234").expect("decrypt"), b"payload-kept");
    }
}
