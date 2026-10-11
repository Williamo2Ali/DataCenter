// فتح المستودع: RepoData (لقطة كاملة لكل الجداول) + أمر open_repo.

use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;
use tauri::AppHandle;
use super::registry::{build_entry, dto_with_open, is_open, register_open};
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoData {
    pub meta: RepoMeta,
    pub tabs: Vec<TabDto>,
    pub peoples: Vec<PeopleDto>,
    pub accounts: Vec<AccountDto>,
    pub documents: Vec<DocumentDto>,
    pub passports: Vec<PassportDto>,
    pub studies: Vec<StudyDto>,
    pub national_ids: Vec<NationalIdDto>,
    pub civils: Vec<CivilDto>,
    pub contacts: Vec<ContactDto>,
    pub custom_tables: Vec<CustomTableDto>,
}

#[tauri::command]
pub fn open_repo(app: AppHandle, id: String, password: Option<String>) -> Result<RepoData, String> {
    let dir = repo_dir(&app, &id)?;
    let container = dir.join(CONTAINER_FILE);
    let files_dir = dir.join(FILES_DIR);
    if !container.exists() {
        return open_plain_repo(&app, &id, &dir, &files_dir, password);
    }
    let password = match password {
        Some(p) if !p.is_empty() => p,
        _ => return Err("أدخل كلمة مرور المستودع لفتحه.".to_string()),
    };
    // مسار سريع: مفتوح بنفس الكلمة — بلا فك متكرر.
    if is_open(&id) {
        if let Ok(data) = dto_with_open(&id, &password, |conn, header| {
            let meta = index_meta(&app, &id, &dir, header)?;
            repo_data_from_conn(conn, &files_dir, meta)
        }) {
            touch_index_usage(&app, &id);
            return Ok(data);
        }
    }
    // فتح كامل: فك للذاكرة + تسجيل الجلسة (الخاطئة/العبث مرفوض هنا).
    let entry = build_entry(&container, &files_dir, &password)?;
    let meta = index_meta(&app, &id, &dir, &entry.header)?;
    let data = repo_data_from_conn(&entry.conn, &files_dir, meta)?;
    register_open(&id, entry);
    // عدّادات الاستخدام استشارية: فشل كتابتها لا يُفشل الفتح أبداً.
    touch_index_usage(&app, &id);
    Ok(data)
}

/// فتح النصي القديم (الفئة غير المقفلة): وصف + قفل اختياري بسجل + ملف قاعدة.
/// القفل الجديد لا يُنشَأ هنا أبداً — طريقه الوحيد أمر التحويل المشفر.
fn open_plain_repo(
    app: &AppHandle,
    id: &str,
    dir: &Path,
    files_dir: &Path,
    password: Option<String>,
) -> Result<RepoData, String> {
    let meta_raw = std::fs::read(dir.join(REPO_META_FILE))
        .map_err(|_| "بيانات المستودع غير موجودة.".to_string())?;
    let meta_file: RepoFile =
        serde_json::from_slice(&meta_raw).map_err(|_| "وصف المستودع تالف.".to_string())?;
    if meta_file.is_locked {
        match password {
            Some(p) if !p.is_empty() => verify_lock_password_cached(id, &meta_file, &p)?,
            _ => return Err("هذا المستودع مقفل — أدخل كلمة مروره لفتحه.".to_string()),
        }
    }
    if meta_file.schema_version < SCHEMA_VERSION {
        return Err("نسخة قاعدة البيانات قديمة — احذف المستودع وأعد إنشاءه.".to_string());
    }
    let conn = Connection::open(dir.join(DB_FILE)).map_err(|e| format!("تعذر فتح قاعدة البيانات: {e}"))?;
    ensure_tabs_is_deleted(&conn)?;
    ensure_account_link_columns(&conn)?;
    ensure_hidden_columns(&conn)?;
    ensure_column_labels(&conn)?;
    ensure_deleted_columns(&conn)?;
    ensure_default_contact_columns(&conn)?;
    ensure_document_source_columns(&conn)?;
    let mut index = read_index(app)?;
    let meta = upsert_index_entry(&mut index, id, dir, &meta_file.name, meta_file.is_locked);
    write_index(app, &index)?;
    let data = repo_data_from_conn(&conn, files_dir, meta)?;
    touch_index_usage(app, id);
    Ok(data)
}

/// بناء اللقطة الكاملة من قاعدة مفتوحة (ذاكرة الحاوية) — يُعاد استخدامه للمسار السريع.
/// أحجام الملفات لحظية من القرص (المشفرة — تُعاد تسميتها الحقيقية مع شريحة المستندات).
pub(super) fn repo_data_from_conn(
    conn: &Connection,
    files_dir: &Path,
    meta: RepoMeta,
) -> Result<RepoData, String> {
    ensure_tabs_is_deleted(&conn)?;
    ensure_account_link_columns(&conn)?;
    ensure_hidden_columns(&conn)?;
    ensure_column_labels(&conn)?;
    ensure_deleted_columns(&conn)?;
    ensure_document_source_columns(&conn)?;

    // عزل المستودعات: جداول هذا المستودع تُقرأ كما هي — بلا مزامنة عامة ولا ترشيح.
    // (الحذف نهائي، والاستعادة زر صريح يدمج الناقص فقط.)
    let mut tabs_stmt = conn
        .prepare("SELECT id, title, title_en, kind, table_name, sort_order, is_hidden, is_deleted FROM tabs ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let tabs: Vec<TabDto> = tabs_stmt
        .query_map([], |row| {
            Ok(TabDto {
                id: row.get(0)?,
                title: row.get(1)?,
                title_en: row.get(2)?,
                kind: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "core".to_string()),
                table_name: row.get(4)?,
                sort_order: row.get(5)?,
                is_hidden: row.get::<_, i64>(6).unwrap_or(0) != 0,
                is_deleted: row.get::<_, i64>(7).unwrap_or(0) != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut rec_stmt = conn
        .prepare("SELECT id, name, name_en, relation, relation_en, sort_order, created_at, updated_at FROM peoples ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let peoples = rec_stmt
        .query_map([], |row| {
            Ok(PeopleDto {
                id: row.get(0)?,
                name: row.get(1)?,
                name_en: row.get(2).unwrap_or_default(),
                relation: row.get(3)?,
                relation_en: row.get(4).unwrap_or_default(),
                sort_order: row.get(5)?,
                created_at: row.get::<_, Option<i64>>(6)?.unwrap_or(0) as u64,
                updated_at: row.get::<_, Option<i64>>(7)?.unwrap_or(0) as u64,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut acc_stmt = conn
        .prepare("SELECT id, record_id, title, email, account_name, username, recovery_email, password, kind, url, sort_order, created_at, updated_at FROM accounts ORDER BY record_id, sort_order")
        .map_err(|e| e.to_string())?;
    let mut accounts = acc_stmt
        .query_map([], |row| {
            Ok(AccountDto {
                id: row.get(0)?,
                record_id: row.get(1)?,
                title: row.get(2)?,
                email: row.get(3)?,
                account_name: row.get(4)?,
                username: row.get(5)?,
                recovery_email: row.get(6)?,
                password: row.get(7)?,
                kind: row.get::<_, Option<String>>(8)?.unwrap_or_else(|| "email".to_string()),
                url: row.get(9)?,
                sort_order: row.get(10)?,
                created_at: row.get::<_, Option<i64>>(11)?.unwrap_or(0) as u64,
                updated_at: row.get::<_, Option<i64>>(12)?.unwrap_or(0) as u64,
                extra: Default::default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // قيم الأعمدة الإضافية للحسابات (بمفتاح id — صفوف 1-كثير لا record_id).
    {
        let extras = read_account_extras(&conn)?;
        for a in &mut accounts {
            if let Some(map) = extras.get(&a.id) {
                a.extra = map.clone();
            }
        }
    };

    let mut doc_stmt = conn
        .prepare("SELECT id, file_name, title, kind, category, owner_record_id, source_path, filetype, sort_order, created_at, updated_at FROM documents ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    // حجم كل ملف وتاريخ تعديله يُقرأ لحظياً من القرص (لا يُخزَّن) — للعرض والتحذيرات.
    let documents = doc_stmt
        .query_map([], |row| {
            let file_name: String = row.get(1)?;
            let (size_bytes, modified_at) = files_dir
                .join(&file_name)
                .metadata()
                .ok()
                .map(|m| {
                    let modified = m
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    (m.len(), modified)
                })
                .unwrap_or((0, 0));
            Ok(DocumentDto {
                id: row.get(0)?,
                file_name,
                title: row.get(2)?,
                kind: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "file".to_string()),
                category: row.get(4)?,
                owner_record_id: row.get(5)?,
                source_path: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                filetype: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
                size_bytes,
                modified_at,
                sort_order: row.get(8)?,
                created_at: row.get::<_, Option<i64>>(9)?.unwrap_or(0) as u64,
                updated_at: row.get::<_, Option<i64>>(10)?.unwrap_or(0) as u64,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut pp_stmt = conn
        .prepare("SELECT record_id, surname, surname_en, given_name, given_name_en, full_name, full_name_en, father_name, father_name_en, mother_name, mother_name_en, sex, birth_date, birth_place, birth_place_en, national_number, passport_number, passport_type, passport_type_en, country_code, country_of_issue, country_of_issue_en, place_of_issue, place_of_issue_en, issue_date, expiry_date, created_at, updated_at FROM passports ORDER BY record_id")
        .map_err(|e| e.to_string())?;
    let mut passports = pp_stmt
        .query_map([], |row| {
            Ok(PassportDto {
                record_id: row.get(0)?, surname: row.get(1)?, surname_en: row.get(2)?,
                given_name: row.get(3)?, given_name_en: row.get(4)?,
                full_name: row.get(5)?, full_name_en: row.get(6)?,
                father_name: row.get(7)?, father_name_en: row.get(8)?,
                mother_name: row.get(9)?, mother_name_en: row.get(10)?,
                sex: row.get(11)?, birth_date: row.get(12)?,
                birth_place: row.get(13)?, birth_place_en: row.get(14)?,
                national_number: row.get(15)?, passport_number: row.get(16)?,
                passport_type: row.get(17)?, passport_type_en: row.get(18)?,
                country_code: row.get(19)?, country_of_issue: row.get(20)?,
                country_of_issue_en: row.get(21)?, place_of_issue: row.get(22)?,
                place_of_issue_en: row.get(23)?, issue_date: row.get(24)?,
                expiry_date: row.get(25)?,
                created_at: row.get::<_, Option<i64>>(26)?.unwrap_or(0) as u64,
                updated_at: row.get::<_, Option<i64>>(27)?.unwrap_or(0) as u64,
                extra: Default::default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut st_stmt = conn
        .prepare("SELECT record_id, education_level, graduation_year, major, major_en, school, school_en, notes, notes_en, created_at, updated_at FROM study ORDER BY record_id")
        .map_err(|e| e.to_string())?;
    let mut studies = st_stmt
        .query_map([], |row| {
            Ok(StudyDto {
                record_id: row.get(0)?, education_level: row.get(1)?,
                graduation_year: row.get(2)?, major: row.get(3)?,
                major_en: row.get(4)?, school: row.get(5)?,
                school_en: row.get(6)?, notes: row.get(7)?, notes_en: row.get(8)?,
                created_at: row.get::<_, Option<i64>>(9)?.unwrap_or(0) as u64,
                updated_at: row.get::<_, Option<i64>>(10)?.unwrap_or(0) as u64,
                extra: Default::default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut nid_stmt = conn
        .prepare("SELECT record_id, authority, authority_en, doc_type, doc_type_en, first_name, first_name_en, last_name, last_name_en, father_name, father_name_en, mother_name, mother_name_en, birth_place, birth_place_en, birth_date, national_id, registry_office, registry_office_en, registry_record, registry_record_en, gender, face_color, face_color_en, eye_color, eye_color_en, address, address_en, distinctive_marks, distinctive_marks_en, issue_date, created_at, updated_at FROM national_ids ORDER BY record_id")
        .map_err(|e| e.to_string())?;
    let mut national_ids = nid_stmt
        .query_map([], |row| {
            Ok(NationalIdDto {
                record_id: row.get(0)?, authority: row.get(1)?, authority_en: row.get(2)?,
                doc_type: row.get(3)?, doc_type_en: row.get(4)?,
                first_name: row.get(5)?, first_name_en: row.get(6)?,
                last_name: row.get(7)?, last_name_en: row.get(8)?,
                father_name: row.get(9)?, father_name_en: row.get(10)?,
                mother_name: row.get(11)?, mother_name_en: row.get(12)?,
                birth_place: row.get(13)?, birth_place_en: row.get(14)?,
                birth_date: row.get(15)?, national_id: row.get(16)?,
                registry_office: row.get(17)?, registry_office_en: row.get(18)?,
                registry_record: row.get(19)?, registry_record_en: row.get(20)?,
                gender: row.get(21)?, face_color: row.get(22)?, face_color_en: row.get(23)?,
                eye_color: row.get(24)?, eye_color_en: row.get(25)?,
                address: row.get(26)?, address_en: row.get(27)?,
                distinctive_marks: row.get(28)?, distinctive_marks_en: row.get(29)?,
                issue_date: row.get(30)?,
                created_at: row.get::<_, Option<i64>>(31)?.unwrap_or(0) as u64,
                updated_at: row.get::<_, Option<i64>>(32)?.unwrap_or(0) as u64,
                extra: Default::default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut cv_stmt = conn
        .prepare("SELECT record_id, first_name, first_name_en, father_name, father_name_en, mother_name, mother_name_en, last_name, last_name_en, gender, birth_date, birth_place, birth_place_en, registry_number, registry_number_en, religion, religion_en, marital_status, marital_status_en, national_id, created_at, updated_at FROM civil ORDER BY record_id")
        .map_err(|e| e.to_string())?;
    let mut civils = cv_stmt
        .query_map([], |row| {
            Ok(CivilDto {
                record_id: row.get(0)?, first_name: row.get(1)?, first_name_en: row.get(2)?,
                father_name: row.get(3)?, father_name_en: row.get(4)?,
                mother_name: row.get(5)?, mother_name_en: row.get(6)?,
                last_name: row.get(7)?, last_name_en: row.get(8)?,
                gender: row.get(9)?, birth_date: row.get(10)?,
                birth_place: row.get(11)?, birth_place_en: row.get(12)?,
                registry_number: row.get(13)?, registry_number_en: row.get(14)?,
                religion: row.get(15)?, religion_en: row.get(16)?,
                marital_status: row.get(17)?, marital_status_en: row.get(18)?,
                national_id: row.get(19)?,
                created_at: row.get::<_, Option<i64>>(20)?.unwrap_or(0) as u64,
                updated_at: row.get::<_, Option<i64>>(21)?.unwrap_or(0) as u64,
                extra: Default::default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut ct_stmt = conn
        .prepare("SELECT id, record_id, name, name_en, phone, email, address, address_en, relation, relation_en, sort_order, created_at, updated_at FROM contacts ORDER BY record_id, sort_order")
        .map_err(|e| e.to_string())?;
    let mut contacts = ct_stmt
        .query_map([], |row| {
            Ok(ContactDto {
                id: row.get(0)?, record_id: row.get(1)?, name: row.get(2)?,
                name_en: row.get(3)?, phone: row.get(4)?, email: row.get(5)?,
                address: row.get(6)?, address_en: row.get(7)?,
                relation: row.get(8)?, relation_en: row.get(9)?, sort_order: row.get(10)?,
                created_at: row.get::<_, Option<i64>>(11)?.unwrap_or(0) as u64,
                updated_at: row.get::<_, Option<i64>>(12)?.unwrap_or(0) as u64,
                extra: Default::default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // قيم الأعمدة الإضافية لجهات الاتصال (بمفتاح id — صفوف 1-كثير لا record_id).
    {
        let extras = read_contact_extras(&conn)?;
        for c in &mut contacts {
            if let Some(map) = extras.get(&c.id) {
                c.extra = map.clone();
            }
        }
    };

    // قيم الأعمدة الإضافية للجداول 1-1 (المسجلة في custom_columns) — تُلحَق بصفوفها.
    {
        let extras = read_core_extras(&conn, "passports")?;
        for p in &mut passports {
            if let Some(map) = extras.get(&p.record_id) {
                p.extra = map.clone();
            }
        }
    }
    {
        let extras = read_core_extras(&conn, "study")?;
        for s in &mut studies {
            if let Some(map) = extras.get(&s.record_id) {
                s.extra = map.clone();
            }
        }
    }
    {
        let extras = read_core_extras(&conn, "national_ids")?;
        for n in &mut national_ids {
            if let Some(map) = extras.get(&n.record_id) {
                n.extra = map.clone();
            }
        }
    }
    {
        let extras = read_core_extras(&conn, "civil")?;
        for c in &mut civils {
            if let Some(map) = extras.get(&c.record_id) {
                c.extra = map.clone();
            }
        }
    }

    let mut custom_tabs_stmt = conn
        .prepare("SELECT id, table_name FROM tabs WHERE kind = 'custom' ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let custom_tabs: Vec<(String, String)> = custom_tabs_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut custom_tables: Vec<CustomTableDto> = Vec::with_capacity(custom_tabs.len());
    for (tab_id, table_name) in &custom_tabs {
        if !table_name.starts_with(CUSTOM_TABLE_PREFIX) {
            continue;
        }
        match load_custom_columns(&conn, table_name)
            .and_then(|columns| read_custom_rows(&conn, table_name).map(|rows| (columns, rows)))
        {
            Ok((columns, rows)) => custom_tables.push(CustomTableDto {
                tab_id: tab_id.clone(),
                table_name: table_name.clone(),
                columns,
                rows,
                hidden: Vec::new(),
                deleted: Vec::new(),
                labels: Vec::new(),
            }),
            Err(_) => custom_tables.push(CustomTableDto {
                tab_id: tab_id.clone(),
                table_name: table_name.clone(),
                columns: Vec::new(),
                rows: Vec::new(),
                hidden: Vec::new(),
                deleted: Vec::new(),
                labels: Vec::new(),
            }),
        }
    }
    // تعريفات الأعمدة الإضافية للجداول القابلة للتمديد (القيم في حقل extra لكل صف/حساب).
    for core in ["passports", "civil", "national_ids", "study", "accounts", "contacts"] {
        custom_tables.push(CustomTableDto {
            tab_id: core.to_string(),
            table_name: core.to_string(),
            columns: load_custom_columns(&conn, core).unwrap_or_default(),
            rows: Vec::new(),
            hidden: load_hidden_columns(&conn, core).unwrap_or_default(),
            deleted: load_deleted_columns(&conn, core).unwrap_or_default(),
            labels: load_base_labels(&conn, core).unwrap_or_default(),
        });
    }

    Ok(RepoData {
        meta,
        tabs,
        peoples,
        accounts,
        documents,
        passports,
        studies,
        national_ids,
        civils,
        contacts,
        custom_tables,
    })
}
