// حماية ملفات الحاويات (ويندوز) — طبقتان معاً (كلتاهما ضرورية):
//  1) Hidden + System على الملف — إخفاء عن Explorer.
//  2) Deny DELETE على الملف + Deny FILE_DELETE_CHILD على مجلد الحاويات.
//     السبب: ويندوز يحذف الملف إذا تحقق أي الشرطين (DELETE على الملف أو
//     DELETE_CHILD على المجلد الأب) — فالقفل على الملف وحده لا يمنع حذف
//     Explorer فعلياً (مُثبت باختبار INTEGRATION أدناه).
//     القراءة والكتابة وإنشاء الملفات الجديدة تبقى طبيعية تماماً.
//  3) الحذف من داخل التطبيق فقط عبر verify_and_delete_vault الذي:
//     يتحقق من كلمة المرور (فك تشفير فعلي داخل Rust) أولاً،
//     ثم يزيل القفلين، ثم يحذف، ثم يعيد قفل المجلد — كلمة خاطئة = لا شيء يحدث.
//
// ملاحظة أمنية صادقة: مالك الملف يستطيع نظرياً تعديل DACL من خصائص ويندوز،
// لذا هذه حماية من الحذف العرضي والعبث العابر — أما سرية المحتوى فمضمونة
// بـ AES-256-GCM ما دامت كلمة المرور مجهولة.

// ================= WinAPI (kernel32 + advapi32 — بدون crates) =================
#[cfg(windows)]
mod win {
    use std::ffi::c_void;

    pub const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    pub const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    const INVALID_FILE_ATTRIBUTES: u32 = 0xFFFF_FFFF;

    const SE_FILE_OBJECT: u32 = 1;
    const DACL_SECURITY_INFORMATION: u32 = 0x4;
    const DELETE_RIGHT: u32 = 0x0001_0000;
    const DELETE_CHILD_RIGHT: u32 = 0x0000_0040; // FILE_DELETE_CHILD — على المجلدات
    const GRANT_ACCESS: u32 = 1;
    const DENY_ACCESS: u32 = 3;
    const NO_INHERITANCE: u32 = 0;
    const TRUSTEE_IS_SID: u32 = 0;
    const TRUSTEE_IS_USER: u32 = 1;
    const TRUSTEE_IS_UNKNOWN: u32 = 0;
    const TOKEN_QUERY: u32 = 0x8;
    const TOKEN_USER_CLASS: u32 = 1; // TokenUser
    const ACL_SIZE_INFORMATION_CLASS: u32 = 2; // AclSizeInformation
    const INHERITED_ACE: u8 = 0x10;
    const ACCESS_ALLOWED_ACE_TYPE: u8 = 0;
    const ACCESS_DENIED_ACE_TYPE: u8 = 1;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct TrusteeW {
        p_multiple_trustee: *mut TrusteeW,
        multiple_trustee_operation: u32,
        trustee_form: u32,
        trustee_type: u32,
        sid: *mut c_void,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct ExplicitAccessW {
        access_permissions: u32,
        access_mode: u32,
        inheritance: u32,
        trustee: TrusteeW,
    }

    #[repr(C)]
    struct SidAndAttributes {
        sid: *mut c_void,
        _attributes: u32,
    }

    #[repr(C)]
    struct AclSizeInformation {
        ace_count: u32,
        _acl_bytes_in_use: u32,
        _acl_bytes_free: u32,
    }

    #[repr(C)]
    struct AceHeader {
        ace_type: u8,
        ace_flags: u8,
        _ace_size: u16,
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetFileAttributesW(name: *const u16) -> u32;
        fn SetFileAttributesW(name: *const u16, attrs: u32) -> i32;
        fn GetCurrentProcess() -> *mut c_void;
        fn CloseHandle(handle: *mut c_void) -> i32;
        fn LocalFree(mem: *mut c_void) -> *mut c_void;
    }

    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn GetNamedSecurityInfoW(
            name: *const u16,
            object_type: u32,
            security_info: u32,
            owner: *mut *mut c_void,
            group: *mut *mut c_void,
            dacl: *mut *mut c_void,
            sacl: *mut *mut c_void,
            descriptor: *mut *mut c_void,
        ) -> u32;
        fn SetNamedSecurityInfoW(
            name: *mut u16,
            object_type: u32,
            security_info: u32,
            owner: *mut c_void,
            group: *mut c_void,
            dacl: *mut c_void,
            sacl: *mut c_void,
        ) -> u32;
        fn SetEntriesInAclW(
            count: u32,
            entries: *const ExplicitAccessW,
            old_acl: *const c_void,
            new_acl: *mut *mut c_void,
        ) -> u32;
        fn OpenProcessToken(
            process: *mut c_void,
            desired_access: u32,
            token: *mut *mut c_void,
        ) -> i32;
        fn GetTokenInformation(
            token: *mut c_void,
            class: u32,
            info: *mut c_void,
            info_len: u32,
            ret_len: *mut u32,
        ) -> i32;
        fn GetExplicitEntriesFromAclW(
            acl: *const c_void,
            count: *mut u32,
            list: *mut *mut ExplicitAccessW,
        ) -> u32;
        fn EqualSid(sid1: *const c_void, sid2: *const c_void) -> i32;
        fn GetAclInformation(
            acl: *const c_void,
            info: *mut c_void,
            info_len: u32,
            class: u32,
        ) -> i32;
        fn GetAce(acl: *const c_void, index: u32, ace: *mut *mut c_void) -> i32;
    }

    fn wide_null(path: &str) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        std::ffi::OsStr::new(path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    /// رمز العملية + بيانات TOKEN_USER (الـ buffer يجب أن يعيش أثناء استخدام SID).
    struct TokenWithUser {
        token: *mut c_void,
        buffer: Vec<u8>,
    }
    impl Drop for TokenWithUser {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.token);
            }
        }
    }

    fn current_user() -> Result<TokenWithUser, String> {
        unsafe {
            let mut token: *mut c_void = std::ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return Err("تعذر فتح رمز العملية.".to_string());
            }
            let mut guard = TokenWithUser {
                token,
                buffer: Vec::new(),
            };
            let mut need: u32 = 0;
            GetTokenInformation(
                token,
                TOKEN_USER_CLASS,
                std::ptr::null_mut(),
                0,
                &mut need,
            );
            if need == 0 {
                return Err("تعذر قراءة هوية المستخدم.".to_string());
            }
            guard.buffer.resize(need as usize, 0);
            let mut got: u32 = 0;
            if GetTokenInformation(
                token,
                TOKEN_USER_CLASS,
                guard.buffer.as_mut_ptr() as *mut c_void,
                need,
                &mut got,
            ) == 0
            {
                return Err("تعذر قراءة هوية المستخدم.".to_string());
            }
            Ok(guard)
        }
    }

    fn user_sid(token: &TokenWithUser) -> *mut c_void {
        unsafe { (*(token.buffer.as_ptr() as *const SidAndAttributes)).sid }
    }

    /// إضافة أو سحب قيد لصالح SID المستخدم الحالي على DACL الملف.
    fn set_dacl_entry(path: &str, sid: *mut c_void, mode: u32, access: u32) -> Result<(), String> {
        let mut wide = wide_null(path);
        unsafe {
            let mut old_dacl: *mut c_void = std::ptr::null_mut();
            let mut descriptor: *mut c_void = std::ptr::null_mut();
            let code = GetNamedSecurityInfoW(
                wide.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut old_dacl,
                std::ptr::null_mut(),
                &mut descriptor,
            );
            if code != 0 {
                return Err(format!("تعذر قراءة صلاحيات الملف (رمز {code})."));
            }

            let entry = ExplicitAccessW {
                access_permissions: access,
                access_mode: mode,
                inheritance: NO_INHERITANCE,
                trustee: TrusteeW {
                    p_multiple_trustee: std::ptr::null_mut(),
                    multiple_trustee_operation: 0,
                    trustee_form: TRUSTEE_IS_SID,
                    trustee_type: TRUSTEE_IS_USER,
                    sid,
                },
            };
            let mut new_acl: *mut c_void = std::ptr::null_mut();
            let code = SetEntriesInAclW(1, &entry, old_dacl as *const c_void, &mut new_acl);
            if code != 0 {
                LocalFree(descriptor);
                return Err(format!("تعذر بناء قائمة الصلاحيات (رمز {code})."));
            }
            let code = SetNamedSecurityInfoW(
                wide.as_mut_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                new_acl,
                std::ptr::null_mut(),
            );
            LocalFree(new_acl);
            LocalFree(descriptor);
            if code != 0 {
                return Err(format!("تعذر تطبيق الصلاحيات على الملف (رمز {code})."));
            }
            Ok(())
        }
    }

    pub fn apply_hidden_system(path: &str) -> Result<(), String> {
        let wide = wide_null(path);
        let current = unsafe { GetFileAttributesW(wide.as_ptr()) };
        if current == INVALID_FILE_ATTRIBUTES {
            return Err("تعذر الوصول إلى ملف الحاوية.".to_string());
        }
        // نحافظ على السمات الموجودة (Archive...) ونضيف عليها.
        let next = current | FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM;
        if unsafe { SetFileAttributesW(wide.as_ptr(), next) } == 0 {
            return Err("تعذر تطبيق سمات الإخفاء على ملف الحاوية.".to_string());
        }
        Ok(())
    }

    /// منع الحذف/النقل (Deny DELETE) — القراءة والكتابة لا تتأثران.
    pub fn deny_delete(path: &str) -> Result<(), String> {
        let token = current_user()?;
        let sid = user_sid(&token);
        if sid.is_null() {
            return Err("تعذر تحديد هوية المستخدم.".to_string());
        }
        set_dacl_entry(path, sid, DENY_ACCESS, DELETE_RIGHT)
    }

    /// إزالة منع الحذف — تُستدعى فقط بعد التحقق من كلمة المرور.
    /// حتمية بدل REVOKE (الذي ثبت عملياً أنه لا يزيل): تُقرأ القيود الصريحة،
    /// يُصفّى منها Deny الخاص بنا (مطابقة SID دقيقة)، ويُعاد بناء DACL بدونه.
    /// القيود الموروثة يعيدها النظام تلقائياً لأننا لا نحمي الكائن.
    pub fn allow_delete(path: &str) -> Result<(), String> {
        remove_user_deny(path, DELETE_RIGHT)
    }

    /// منع حذف أبناء مجلد (Deny FILE_DELETE_CHILD) — الطبقة الثانية الإلزامية.
    /// idempotent: يسحب أي قيد سابق للمستخدم أولاً حتى لا تتراكم ACEs.
    pub fn deny_delete_child(dir: &str) -> Result<(), String> {
        allow_delete_child(dir)?;
        let token = current_user()?;
        let sid = user_sid(&token);
        if sid.is_null() {
            return Err("تعذر تحديد هوية المستخدم.".to_string());
        }
        set_dacl_entry(dir, sid, DENY_ACCESS, DELETE_CHILD_RIGHT)
    }

    /// إزالة منع حذف الأبناء.
    pub fn allow_delete_child(dir: &str) -> Result<(), String> {
        remove_user_deny(dir, DELETE_CHILD_RIGHT)
    }

    /// إزالة Deny محدد (rights_mask) الخاص بالمستخدم الحالي من DACL الكائن.
    /// حتمية بدل REVOKE (الذي ثبت عملياً أنه لا يزيل): تُقرأ القيود الصريحة،
    /// يُصفّى منها Deny الخاص بنا (مطابقة SID دقيقة)، وتُنسخ القيود الموروثة
    /// كما هي (ضروري — إعادة بناء DACL بالصريح فقط تمسح الموروث وترفض كل شيء)،
    /// ثم يُعاد بناء DACL من المجموع. idempotent: غياب القيد ليس خطأً.
    fn remove_user_deny(path: &str, rights_mask: u32) -> Result<(), String> {
        let mut wide = wide_null(path);
        unsafe {
            let mut dacl: *mut c_void = std::ptr::null_mut();
            let mut descriptor: *mut c_void = std::ptr::null_mut();
            let code = GetNamedSecurityInfoW(
                wide.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut dacl,
                std::ptr::null_mut(),
                &mut descriptor,
            );
            if code != 0 {
                return Err(format!("تعذر قراءة صلاحيات الملف (رمز {code})."));
            }

            let token = current_user()?;
            let my_sid = user_sid(&token);
            if my_sid.is_null() {
                LocalFree(descriptor);
                return Err("تعذر تحديد هوية المستخدم.".to_string());
            }

            let mut count: u32 = 0;
            let mut list: *mut ExplicitAccessW = std::ptr::null_mut();
            let code = GetExplicitEntriesFromAclW(dacl, &mut count, &mut list);
            if code != 0 {
                LocalFree(descriptor);
                return Err(format!("تعذر قراءة قيود الصلاحيات (رمز {code})."));
            }

            // 1) الصريح المحفوظ به (بعد تصفية Deny الخاص بنا).
            let mut rebuilt: Vec<ExplicitAccessW> = Vec::with_capacity(count as usize);
            if !list.is_null() {
                let entries = std::slice::from_raw_parts(list, count as usize);
                for entry in entries {
                    let is_our_deny = entry.access_mode == DENY_ACCESS
                        && (entry.access_permissions & rights_mask) != 0
                        && entry.trustee.trustee_form == TRUSTEE_IS_SID
                        && !entry.trustee.sid.is_null()
                        && EqualSid(
                            entry.trustee.sid as *const c_void,
                            my_sid as *const c_void,
                        ) != 0;
                    if !is_our_deny {
                        rebuilt.push(*entry);
                    }
                }
            }

            // 2) الموروث كما هو (بدونه يفقد الكائن حقوقه الموروثة ويرفض كل شيء).
            // ACCESS_ALLOWED/DENIED فقط — أنواع التدقيق تعيش في SACL لا DACL.
            let mut size_info = AclSizeInformation {
                ace_count: 0,
                _acl_bytes_in_use: 0,
                _acl_bytes_free: 0,
            };
            if GetAclInformation(
                dacl,
                &mut size_info as *mut AclSizeInformation as *mut c_void,
                std::mem::size_of::<AclSizeInformation>() as u32,
                ACL_SIZE_INFORMATION_CLASS,
            ) == 0
            {
                LocalFree(list as *mut c_void);
                LocalFree(descriptor);
                return Err("تعذر إحصاء قيود الصلاحيات.".to_string());
            }
            for i in 0..size_info.ace_count {
                let mut ace_ptr: *mut c_void = std::ptr::null_mut();
                if GetAce(dacl, i, &mut ace_ptr) == 0 || ace_ptr.is_null() {
                    continue;
                }
                let header = &*(ace_ptr as *const AceHeader);
                if header.ace_flags & INHERITED_ACE == 0 {
                    continue;
                }
                let mode = match header.ace_type {
                    ACCESS_ALLOWED_ACE_TYPE => GRANT_ACCESS,
                    ACCESS_DENIED_ACE_TYPE => DENY_ACCESS,
                    _ => continue,
                };
                let base = ace_ptr as *const u8;
                let mask = std::ptr::read_unaligned(base.add(4) as *const u32);
                let sid = base.add(8) as *mut c_void;
                rebuilt.push(ExplicitAccessW {
                    access_permissions: mask,
                    access_mode: mode,
                    inheritance: (header.ace_flags & 0x0F) as u32,
                    trustee: TrusteeW {
                        p_multiple_trustee: std::ptr::null_mut(),
                        multiple_trustee_operation: 0,
                        trustee_form: TRUSTEE_IS_SID,
                        trustee_type: TRUSTEE_IS_UNKNOWN,
                        sid,
                    },
                });
            }

            let mut new_acl: *mut c_void = std::ptr::null_mut();
            let code = SetEntriesInAclW(
                rebuilt.len() as u32,
                rebuilt.as_ptr(),
                std::ptr::null(),
                &mut new_acl,
            );
            if code != 0 {
                LocalFree(list as *mut c_void);
                LocalFree(descriptor);
                return Err(format!("تعذر بناء قائمة الصلاحيات (رمز {code})."));
            }
            let code = SetNamedSecurityInfoW(
                wide.as_mut_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                new_acl,
                std::ptr::null_mut(),
            );
            LocalFree(new_acl);
            LocalFree(list as *mut c_void);
            LocalFree(descriptor);
            if code != 0 {
                return Err(format!("تعذر تطبيق الصلاحيات على الملف (رمز {code})."));
            }
            Ok(())
        }
    }
}

// ================= التشفير المشترك (Rust خالص — كل المنصات) =================
// صيغة المغلّف: MAGIC[4] | 0x01 | salt[16] | iv[12] | AES-GCM-256(PBKDF2-SHA256, 120k)
// للحاويات: MAGIC = VLT1 (مطابق لـ vaultCrypto.ts). للنسخ: MAGIC = DCBU.
use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit},
};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;

pub(crate) const PBKDF2_ROUNDS: u32 = 120_000;
pub(crate) const VAULT_MAGIC: [u8; 4] = [0x56, 0x4C, 0x54, 0x31]; // VLT1

pub(crate) fn derive_key(password: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ROUNDS, &mut key);
    key
}

fn random_bytes(buf: &mut [u8]) -> Result<(), String> {
    getrandom::fill(buf).map_err(|_| "تعذر توليد أرقام عشوائية آمنة.".to_string())
}

/// تشفير أي حمولة داخل المغلّف (salt/iv عشوائيان جديدان كل مرة).
pub(crate) fn encrypt_envelope(
    magic: &[u8; 4],
    plaintext: &[u8],
    password: &str,
) -> Result<Vec<u8>, String> {
    if password.len() < 4 {
        return Err("كلمة المرور قصيرة جداً (4 أحرف على الأقل).".to_string());
    }
    let mut salt = [0u8; 16];
    let mut iv = [0u8; 12];
    random_bytes(&mut salt)?;
    random_bytes(&mut iv)?;
    let key = derive_key(password, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| "تعذر تهيئة التشفير.".to_string())?;
    let nonce = Nonce::try_from(&iv[..]).map_err(|_| "تعذر تهيئة التشفير.".to_string())?;
    let ct = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| "تعذر تشفير البيانات.".to_string())?;
    let mut out = Vec::with_capacity(4 + 1 + 16 + 12 + ct.len());
    out.extend_from_slice(magic);
    out.push(0x01);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&iv);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// فك المغلّف: خطأ = كلمة خاطئة أو ملف تالف/غير مدعوم.
pub(crate) fn decrypt_envelope(
    expected_magic: &[u8; 4],
    bytes: &[u8],
    password: &str,
) -> Result<Vec<u8>, String> {
    if bytes.len() < 34 || &bytes[0..4] != expected_magic || bytes[4] != 0x01 {
        return Err("صيغة الملف غير صالحة أو غير مدعومة.".to_string());
    }
    let key = derive_key(password, &bytes[5..21]);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|_| "كلمة المرور غير صحيحة أو الملف تالف.".to_string())?;
    let nonce = Nonce::try_from(&bytes[21..33])
        .map_err(|_| "كلمة المرور غير صحيحة أو الملف تالف.".to_string())?;
    cipher
        .decrypt(&nonce, &bytes[33..])
        .map_err(|_| "كلمة المرور غير صحيحة أو الملف تالف.".to_string())
}

/// فك تشفير تجريبي: true = كلمة صحيحة. لا يكتب أي شيء ولا يفك الضغط.
fn verify_vault_password(bytes: &[u8], password: &str) -> bool {
    decrypt_envelope(&VAULT_MAGIC, bytes, password).is_ok()
}

// ================= الأوامر =================

/// حماية كاملة لملف حاوية جديد: إخفاء + منع حذف (ملف + مجلد).
/// تُستدعى بعد كل إنشاء. الترتيب: إخفاء، ثم قفل الملف، ثم قفل المجلد.
#[tauri::command]
pub fn protect_vault_file(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::apply_hidden_system(&path)?;
        win::deny_delete(&path)?;
        if let Some(parent) = std::path::Path::new(&path).parent() {
            let dir = parent.to_string_lossy().to_string();
            if !dir.is_empty() {
                win::deny_delete_child(&dir)?;
            }
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        // أندرويد: الملف داخل AppData الخاص المعزول أصلاً — لا حاجة لسمات.
        let _ = path;
        Ok(())
    }
}

/// توافق خلفي: إخفاء فقط (كانت تُستخدم قبل طبقة ACL).
#[tauri::command]
pub fn secure_vault_file(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::apply_hidden_system(&path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(())
    }
}

/// حذف آمن مشروط بكلمة المرور:
/// 1) قراءة الملف 2) التحقق من كلمة المرور بالفك الفعلي 3) إزالة القفلين
/// 4) الحذف 5) إعادة قفل المجلد لحماية بقية الحاويات.
/// أي فشل قبل الحذف يوقف كل شيء — كلمة خاطئة لا تمس الصلاحيات ولا الملف.
#[tauri::command]
pub fn verify_and_delete_vault(path: String, password: String) -> Result<(), String> {
    let bytes =
        std::fs::read(&path).map_err(|_| "ملف الحاوية غير موجود — احذف سجله من الواجهة.".to_string())?;
    if !verify_vault_password(&bytes, &password) {
        return Err("كلمة المرور غير صحيحة — لم يتم حذف أي شيء.".to_string());
    }
    #[cfg(windows)]
    {
        win::allow_delete(&path)?;
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .filter(|d| !d.is_empty());
        if let Some(ref dir) = parent {
            win::allow_delete_child(dir)?;
        }
        let deleted = std::fs::remove_file(&path);
        // إعادة قفل المجلد لحماية الحاويات المتبقية (أفضل جهد — الحذف تم أصلاً).
        if let Some(ref dir) = parent {
            let _ = win::deny_delete_child(dir);
        }
        deleted.map_err(|e| format!("تعذر حذف الملف: {e}"))?;
    }
    #[cfg(not(windows))]
    {
        std::fs::remove_file(&path).map_err(|e| format!("تعذر حذف الملف: {e}"))?;
    }
    Ok(())
}

// ================= اختبارات =================
#[cfg(test)]
mod tests {
    use super::*;

    /// بناء حاوية VLT1 صالحة بنفس خوارزمية الواجهة (لأغراض الاختبار فقط).
    fn make_container(password: &str, plaintext: &[u8]) -> Vec<u8> {
        let salt = [7u8; 16];
        let nonce_bytes = [9u8; 12];
        let key = derive_key(password, &salt);
        let ct = Aes256Gcm::new_from_slice(&key)
            .unwrap()
            .encrypt(&Nonce::try_from(&nonce_bytes[..]).unwrap(), plaintext)
            .unwrap();
        let mut blob = vec![0x56, 0x4C, 0x54, 0x31, 0x01];
        blob.extend_from_slice(&salt);
        blob.extend_from_slice(&nonce_bytes);
        blob.extend_from_slice(&ct);
        blob
    }

    #[test]
    fn vault_password_verify_roundtrip() {
        let blob = make_container("correct-horse-123", b"secret-data");
        assert!(verify_vault_password(&blob, "correct-horse-123"));
        assert!(!verify_vault_password(&blob, "wrong-password"));
        assert!(!verify_vault_password(b"garbage-bytes-here-1234567890", "correct-horse-123"));
        assert!(!verify_vault_password(&[], "correct-horse-123"));
    }

    /// اختبار تكاملي حقيقي على ويندوز داخل مجلد فرعي مخصص في TEMP:
    /// حماية → حذف مباشر (ملف/Explorer) مرفوض → كلمة خاطئة مرفوضة والملف باقٍ
    /// → كلمة صحيحة تحذف، مع بقاء قفل المجلد للحاويات الأخرى.
    #[cfg(windows)]
    #[test]
    fn windows_protect_blocks_delete_and_password_delete_works() {
        let dir = std::env::temp_dir().join(format!("vault_acl_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let dir_str = dir.to_string_lossy().to_string();
        let path = dir.join("case.vault");
        let path_str = path.to_string_lossy().to_string();

        // تنظيف شامل في النهاية مهما حدث (فك القفلين ثم إزالة المجلد)
        struct Guard {
            dir: std::path::PathBuf,
            dir_str: String,
            path: std::path::PathBuf,
            path_str: String,
        }
        impl Drop for Guard {
            fn drop(&mut self) {
                let _ = win::allow_delete(&self.path_str);
                let _ = std::fs::remove_file(&self.path);
                let _ = win::allow_delete_child(&self.dir_str);
                let _ = std::fs::remove_dir(&self.dir);
            }
        }
        let _guard = Guard {
            dir: dir.clone(),
            dir_str: dir_str.clone(),
            path: path.clone(),
            path_str: path_str.clone(),
        };

        let blob = make_container("Test#1234", b"{\"files\":[]}");
        std::fs::write(&path, &blob).expect("write temp vault");

        protect_vault_file(path_str.clone()).expect("protect failed");

        // 1) الحذف المباشر (كما يفعل Explorer: DELETE على الملف أو من المجلد) مرفوض
        assert!(
            std::fs::remove_file(&path).is_err(),
            "expected direct delete to be denied by ACL"
        );
        assert!(path.exists());

        // 2) كلمة خاطئة: رفض + الملف والحماية باقيان
        assert!(verify_and_delete_vault(path_str.clone(), "nope".to_string()).is_err());
        assert!(path.exists());
        assert!(std::fs::remove_file(&path).is_err());

        // 3) كلمة صحيحة: فك القفل + حذف ناجح
        verify_and_delete_vault(path_str.clone(), "Test#1234".to_string())
            .expect("password delete failed");
        assert!(!path.exists());

        // 4) حاوية ثانية محمية بنفس آلية الواجهة (قفل ملف + قفل مجلد) تبقى
        //    محمية بعد حذف الأولى — ثم تُحذف هي أيضاً بكلمة المرور.
        //    (ملاحظة: قفل المجلد وحده لا يكفي — ويندوز يحذف إذا سُمح DELETE
        //    على الملف نفسه — لذا كل ملف حاوية يحمل قفله الخاص دائماً.)
        let sibling = dir.join("sibling.vault");
        let sibling_str = sibling.to_string_lossy().to_string();
        std::fs::write(&sibling, &blob).expect("write sibling");
        protect_vault_file(sibling_str.clone()).expect("protect sibling");
        assert!(
            std::fs::remove_file(&sibling).is_err(),
            "expected sibling delete to be denied while protected"
        );
        verify_and_delete_vault(sibling_str.clone(), "Test#1234".to_string())
            .expect("delete sibling failed");
        assert!(!sibling.exists());
    }
}
