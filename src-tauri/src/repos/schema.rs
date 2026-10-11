// سكيما SQLite لكل مستودع (v3) + بيانات التأسيس (التبويبات الأساسية السبعة)
// + البذر الفيزيائي والقيم الافتراضية (merge_factory_defaults / seed_repo_structure).

use rusqlite::{Connection, params};
use super::*;

// ================= السكيما =================

pub(super) const SCHEMA_SQL: &str = "
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tabs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'core',
  table_name TEXT NOT NULL DEFAULT '',
  is_hidden INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS peoples (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  relation TEXT NOT NULL DEFAULT '',
  relation_en TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES peoples(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  email TEXT,
  account_name TEXT,
  username TEXT,
  recovery_email TEXT,
  password TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'email',
  url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_accounts_record ON accounts(record_id, sort_order);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'file',
  category TEXT NOT NULL DEFAULT '',
  owner_record_id TEXT NULL REFERENCES peoples(id) ON DELETE SET NULL,
  source_path TEXT NOT NULL DEFAULT '',
  filetype TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_record_id, sort_order);
CREATE TABLE IF NOT EXISTS passports (
  record_id TEXT PRIMARY KEY REFERENCES peoples(id) ON DELETE CASCADE,
  surname TEXT NOT NULL DEFAULT '',
  surname_en TEXT NOT NULL DEFAULT '',
  given_name TEXT NOT NULL DEFAULT '',
  given_name_en TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  full_name_en TEXT NOT NULL DEFAULT '',
  father_name TEXT NOT NULL DEFAULT '',
  father_name_en TEXT NOT NULL DEFAULT '',
  mother_name TEXT NOT NULL DEFAULT '',
  mother_name_en TEXT NOT NULL DEFAULT '',
  sex TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  birth_place TEXT NOT NULL DEFAULT '',
  birth_place_en TEXT NOT NULL DEFAULT '',
  national_number TEXT NOT NULL DEFAULT '',
  passport_number TEXT NOT NULL DEFAULT '',
  passport_type TEXT NOT NULL DEFAULT '',
  passport_type_en TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT '',
  country_of_issue TEXT NOT NULL DEFAULT '',
  country_of_issue_en TEXT NOT NULL DEFAULT '',
  place_of_issue TEXT NOT NULL DEFAULT '',
  place_of_issue_en TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  expiry_date TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS study (
  record_id TEXT PRIMARY KEY REFERENCES peoples(id) ON DELETE CASCADE,
  education_level TEXT NOT NULL DEFAULT '',
  graduation_year INTEGER NULL,
  major TEXT NOT NULL DEFAULT '',
  major_en TEXT NOT NULL DEFAULT '',
  school TEXT NOT NULL DEFAULT '',
  school_en TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  notes_en TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS national_ids (
  record_id TEXT PRIMARY KEY REFERENCES peoples(id) ON DELETE CASCADE,
  authority TEXT NOT NULL DEFAULT '',
  authority_en TEXT NOT NULL DEFAULT '',
  doc_type TEXT NOT NULL DEFAULT '',
  doc_type_en TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  first_name_en TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  last_name_en TEXT NOT NULL DEFAULT '',
  father_name TEXT NOT NULL DEFAULT '',
  father_name_en TEXT NOT NULL DEFAULT '',
  mother_name TEXT NOT NULL DEFAULT '',
  mother_name_en TEXT NOT NULL DEFAULT '',
  birth_place TEXT NOT NULL DEFAULT '',
  birth_place_en TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  national_id TEXT NOT NULL DEFAULT '',
  registry_office TEXT NOT NULL DEFAULT '',
  registry_office_en TEXT NOT NULL DEFAULT '',
  registry_record TEXT NOT NULL DEFAULT '',
  registry_record_en TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  face_color TEXT NOT NULL DEFAULT '',
  face_color_en TEXT NOT NULL DEFAULT '',
  eye_color TEXT NOT NULL DEFAULT '',
  eye_color_en TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  address_en TEXT NOT NULL DEFAULT '',
  distinctive_marks TEXT NOT NULL DEFAULT '',
  distinctive_marks_en TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS civil (
  record_id TEXT PRIMARY KEY REFERENCES peoples(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  first_name_en TEXT NOT NULL DEFAULT '',
  father_name TEXT NOT NULL DEFAULT '',
  father_name_en TEXT NOT NULL DEFAULT '',
  mother_name TEXT NOT NULL DEFAULT '',
  mother_name_en TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  last_name_en TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  birth_place TEXT NOT NULL DEFAULT '',
  birth_place_en TEXT NOT NULL DEFAULT '',
  registry_number TEXT NOT NULL DEFAULT '',
  registry_number_en TEXT NOT NULL DEFAULT '',
  religion TEXT NOT NULL DEFAULT '',
  religion_en TEXT NOT NULL DEFAULT '',
  marital_status TEXT NOT NULL DEFAULT '',
  marital_status_en TEXT NOT NULL DEFAULT '',
  national_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  record_id TEXT NULL REFERENCES peoples(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  address_en TEXT NOT NULL DEFAULT '',
  relation TEXT NOT NULL DEFAULT '',
  relation_en TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_contacts_record ON contacts(record_id, sort_order);
CREATE TABLE IF NOT EXISTS custom_columns (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  label TEXT NOT NULL,
  label_en TEXT NOT NULL DEFAULT '',
  ftype TEXT NOT NULL DEFAULT 'text',
  foptions TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (table_name, column_name)
);
CREATE TABLE IF NOT EXISTS hidden_columns (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  PRIMARY KEY (table_name, column_name)
);
CREATE TABLE IF NOT EXISTS column_labels (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  label TEXT NOT NULL,
  label_en TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (table_name, column_name)
);
CREATE TABLE IF NOT EXISTS deleted_columns (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  PRIMARY KEY (table_name, column_name)
);
";

pub(crate) fn create_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCHEMA_SQL)
        .map_err(|e| format!("تعذر إنشاء جداول المستودع: {e}"))?;
    Ok(())
}

// ================= بيانات التأسيس (ترحيل حرفي من الواجهة) =================

// (المعرّف، العنوان العربي، العنوان الإنكليزي)
// التبويبات الأساسية السبعة — تبويب `images` محذوف نهائياً (الصور عبر `documents.kind`).
pub(super) const TABS: &[(&str, &str, &str)] = &[
    ("passports", "جوازات السفر", "Passports"),
    ("civil", "السجل المدني", "Civil Registry"),
    ("national_ids", "الهويات الوطنية", "National IDs"),
    ("study", "شهادات الدراسة", "Study Certificates"),
    ("files", "ملفات", "Files"),
    ("accounts", "الحسابات", "Accounts"),
    ("contacts", "جهات الاتصال", "Contacts"),
];

// يضيف التبويبات الأساسية الناقصة إلى مستودع (ترقية بدون فقدان بيانات).
// متقاعَد: تُستخدَم في الاختبارات فقط — الإنتاج يستخدم merge_factory_defaults.
#[allow(dead_code)]
pub(crate) fn ensure_default_tabs(conn: &Connection) -> Result<(), String> {
    let next = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM tabs", [], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    let mut next = next + 1;
    let now = now_db();
    for (id, title, title_en) in TABS {
        let exists: i64 = conn
            .query_row("SELECT COUNT(*) FROM tabs WHERE id = ?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if exists > 0 {
            continue;
        }
        conn.execute(
            "INSERT INTO tabs (id, title, title_en, kind, table_name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 'core', ?1, ?4, ?5, ?5)",
            params![id, title, title_en, next, now],
        )
        .map_err(|e| e.to_string())?;
        next += 1;
    }
    Ok(())
}

// ================= البذر الفيزيائي (القيم الافتراضية لكل مستودع) =================
// الثوابت الوحيدة العامة: التبويبات السبعة في `TABS` تُزرع عند إنشاء مستودع جديد
// وتُدمَج عند "استعادة الافتراضي" — الناقص فقط، ولا يُمس المخصص ولا أي قيمة.

/// دمج القالب في مستودع: الجداول السبعة (أساسية) + صف 1-1 فارغ لكل شخص
/// في `passports/study/national_ids/civil` — فقط الناقص.
/// يُستخدَم عند التأسيس وعند "استعادة الافتراضي". لا يمس المخصص ولا أي قيمة.
pub(crate) fn merge_factory_defaults(conn: &Connection) -> Result<(), String> {
    let next_tab: i64 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tabs", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let mut order = next_tab;
    for (id, title, title_en) in TABS {
        conn.execute(
            "INSERT OR IGNORE INTO tabs (id, title, title_en, kind, table_name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 'core', ?1, ?4, ?5, ?5)",
            params![id, title, title_en, order, now_db()],
        )
        .map_err(|e| e.to_string())?;
        // رقيّ صفاً قديماً بلا kind (قاعدة v2 مبكرة) إلى أساسية.
        conn.execute(
            "UPDATE tabs SET kind = 'core', table_name = ?1 WHERE id = ?1 AND (kind IS NULL OR kind = '' OR kind = 'generic' OR kind = 'physical')",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        order += 1;
    }
    ensure_physical_rows(conn)
}

/// صف 1-1 فارغ لكل شخص في الجداول الفيزيائية الأربع — فقط الناقص.
/// المحذوف ناعماً يُتجاوَز دائماً (لا إحياء تلقائي).
pub(super) fn ensure_physical_rows(conn: &Connection) -> Result<(), String> {
    let record_ids: Vec<String> = conn
        .prepare("SELECT id FROM peoples ORDER BY sort_order")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let dead: Vec<String> = conn
        .prepare("SELECT table_name FROM tabs WHERE is_deleted != 0")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let now = now_db();
    for rid in &record_ids {
        for table in ["passports", "study", "national_ids", "civil"] {
            if dead.iter().any(|t| t == table) {
                continue;
            }
            conn.execute(
                &format!("INSERT OR IGNORE INTO {table} (record_id, created_at, updated_at) VALUES (?1, ?2, ?2)"),
                params![rid, now],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// المستودع الجديد فارغ تماماً: البنية فقط (التبويبات)، بلا أي بيانات مبدئية.

/// تأسيس المستودع: البنية (التبويبات الأساسية السبعة) + سجلات الأعضاء
/// بمعرفات GUID + صفوف 1-1 فارغة لكل سجل — أو سجل تجريبي واحد كدليل.
/// `with_defaults=false`: تبويبات + سجلات فقط بلا صفوف فيزيائية (للاستيراد الذكي).
pub(crate) fn seed_repo_structure(conn: &Connection, members: &[String], with_defaults: bool) -> Result<(), String> {
    let now = now_db();
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("تعذر بدء التأسيس: {e}"))?;
    {
        let mut tab_stmt = tx
            .prepare("INSERT INTO tabs (id, title, title_en, kind, table_name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 'core', ?1, ?4, ?5, ?5)")
            .map_err(|e| e.to_string())?;
        for (i, (id, title, title_en)) in TABS.iter().enumerate() {
            tab_stmt
                .execute(params![id, title, title_en, i as i64, now])
                .map_err(|e| e.to_string())?;
        }
    }
    // الأسماء الفارغة تُتجاهل هنا أيضاً (حماية من أي مستدعٍ آخر).
    let clean_members: Vec<String> = members
        .iter()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .collect();
    let mut record_ids: Vec<String> = Vec::new();
    if clean_members.is_empty() {
        // سجل تجريبي واحد فقط كدليل للمستخدم — بيانات وهمية واضحة.
        let demo_id = new_guid()?;
        tx.execute(
            "INSERT INTO peoples (id, name, name_en, relation, relation_en, sort_order, created_at, updated_at) VALUES (?1, 'شخص تجريبي (مثال)', 'Demo person (example)', 'مثال يوضح البنية — احذفه وأضف بياناتك', 'Example showing the structure — delete it and add your data', 0, ?2, ?2)",
            params![demo_id.clone(), now],
        )
        .map_err(|e| e.to_string())?;
        record_ids.push(demo_id);
    } else {
        // سجل فارغ لكل عضو — يملأ المستخدم حقوله لاحقاً.
        for (i, name) in clean_members.iter().enumerate() {
            let id = new_guid()?;
            tx.execute(
                "INSERT INTO peoples (id, name, name_en, relation, relation_en, sort_order, created_at, updated_at) VALUES (?1, ?2, '', '', '', ?3, ?4, ?4)",
                params![id, name, i as i64, now],
            )
            .map_err(|e| e.to_string())?;
            record_ids.push(id);
        }
    }
    tx.commit()
        .map_err(|e| format!("تعذر حفظ التأسيس: {e}"))?;
    // أعمدة الهواتف الافتراضية لجهات الاتصال — مع كل مستودع جديد.
    ensure_default_contact_columns(conn)?;
    if with_defaults {
        // صف 1-1 فارغ لكل سجل — ليعرف المستخدم ماذا يملأ.
        for rid in &record_ids {
            for table in ["passports", "study", "national_ids", "civil"] {
                conn.execute(
                    &format!("INSERT OR IGNORE INTO {table} (record_id, created_at, updated_at) VALUES (?1, ?2, ?2)"),
                    params![rid, now],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

/// عمود الحذف الناعم لقواعد v3 المبكرة (إضافة فقط — القيم الافتراضية 0 = غير محذوف).
pub(super) fn ensure_tabs_is_deleted(conn: &Connection) -> Result<(), String> {
    let cols: Vec<String> = conn
        .prepare("PRAGMA table_info(tabs)")
        .map_err(|e| e.to_string())?
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if !cols.iter().any(|c| c == "is_deleted") {
        conn.execute("ALTER TABLE tabs ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0", [])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
