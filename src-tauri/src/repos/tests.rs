use super::*;

fn seeded_memory_db() -> Connection {
    let conn = Connection::open_in_memory().expect("memory db");
    create_schema(&conn).expect("schema");
    seed_repo_structure(&conn, &[], true).expect("seed");
    conn
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .expect("count")
}

#[test]
fn empty_repo_seed_has_structure_only() {
    let conn = seeded_memory_db();
    assert_eq!(count(&conn, "tabs"), 7);
    assert_eq!(count(&conn, "peoples"), 1);
    // البذر الفيزيائي: صف 1-1 فارغ لكل شخص — بلا جدول حقول إطلاقاً.
    assert_eq!(count(&conn, "passports"), 1);
    assert_eq!(count(&conn, "study"), 1);
    assert_eq!(count(&conn, "national_ids"), 1);
    assert_eq!(count(&conn, "civil"), 1);
    assert_eq!(count(&conn, "accounts"), 0);
    assert_eq!(count(&conn, "documents"), 0);
    assert_eq!(count(&conn, "contacts"), 0);
    // لا جداول ميتة.
    for dead in ["records", "fields", "images"] {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [dead],
                |r| r.get(0),
            )
            .expect("sqlite_master");
        assert_eq!(n, 0, "جدول ميت ما زال موجوداً: {dead}");
    }
    let core: i64 = conn
        .query_row("SELECT COUNT(*) FROM tabs WHERE kind = 'core'", [], |r| r.get(0))
        .expect("kind");
    assert_eq!(core, 7, "التبويبات الأساسية سبعة");
}

#[test]
fn accounts_table_has_kind_and_url_columns() {
    let conn = seeded_memory_db();
    let cols: Vec<String> = conn
        .prepare("PRAGMA table_info(accounts)")
        .expect("pragma")
        .query_map([], |r| r.get::<_, String>(1))
        .expect("map")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect");
    assert!(cols.contains(&"kind".to_string()), "عمود النوع مفقود");
    assert!(cols.contains(&"url".to_string()), "عمود الرابط مفقود");
}

#[test]
fn ensure_account_link_columns_upgrades_legacy_table() {
    let conn = Connection::open_in_memory().expect("memory db");
    conn.execute(
        "CREATE TABLE accounts (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, title TEXT NOT NULL, email TEXT, account_name TEXT, username TEXT, recovery_email TEXT, password TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)",
        [],
    )
    .expect("legacy ddl");
    conn.execute(
        "INSERT INTO accounts (id, record_id, title, password, sort_order, created_at, updated_at) VALUES ('a1', 'r1', 'بريد', 'pw', 0, 0, 0)",
        [],
    )
    .expect("legacy row");
    ensure_account_link_columns(&conn).expect("upgrade");
    ensure_account_link_columns(&conn).expect("upgrade idempotent");
    let kind: String = conn
        .query_row("SELECT kind FROM accounts WHERE id = 'a1'", [], |r| r.get(0))
        .expect("kind default");
    assert_eq!(kind, "email");
    let url: Option<String> = conn
        .query_row("SELECT url FROM accounts WHERE id = 'a1'", [], |r| r.get(0))
        .expect("url null");
    assert_eq!(url, None);
}

#[test]
fn seed_with_members_creates_named_records() {
    let conn = Connection::open_in_memory().expect("memory db");
    create_schema(&conn).expect("schema");
    let members = vec!["أحمد".to_string(), "سارة".to_string(), "أحمد".to_string(), "  ".to_string()];
    seed_repo_structure(&conn, &members, true).expect("seed");
    assert_eq!(count(&conn, "tabs"), 7);
    // المكرر يُحفظ بمعرف UUID مستقل، والفارغ يُتجاهل — ولا سجل تجريبي
    assert_eq!(count(&conn, "peoples"), 3);
    let names: Vec<String> = conn
        .prepare("SELECT name FROM peoples ORDER BY sort_order")
        .expect("prepare")
        .query_map([], |r| r.get(0))
        .expect("query")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect");
    assert_eq!(names, vec!["أحمد".to_string(), "سارة".to_string(), "أحمد".to_string()]);
    // المعرفات UUID مقسمة وفريدة — لا مشتقة من الأسماء.
    let ids: Vec<String> = conn
        .prepare("SELECT id FROM peoples ORDER BY sort_order")
        .expect("prepare")
        .query_map([], |r| r.get(0))
        .expect("query")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect");
    assert_eq!(ids.len(), 3);
    for id in &ids {
        assert!(ensure_uuid(id).is_ok(), "معرف غير مقسّم: {id}");
    }
    assert_ne!(ids[0], ids[2], "المكرر له UUID مستقل");
    // كل شخص له صف 1-1 في الجداول الفيزيائية الأربع
    assert_eq!(count(&conn, "passports"), 3);
    assert_eq!(count(&conn, "study"), 3);
    assert_eq!(count(&conn, "national_ids"), 3);
    assert_eq!(count(&conn, "civil"), 3);
    // الطوابع الزمنية مضبوطة عند البذر.
    let stamped: i64 = conn
        .query_row("SELECT COUNT(*) FROM peoples WHERE created_at > 0 AND updated_at > 0", [], |r| r.get(0))
        .expect("stamps");
    assert_eq!(stamped, 3);
}

#[test]
fn factory_merge_is_idempotent() {
    let conn = seeded_memory_db();
    merge_factory_defaults(&conn).expect("second merge");
    assert_eq!(count(&conn, "tabs"), 7, "الدمج الثاني لا يكرر");
    assert_eq!(count(&conn, "passports"), 1);
    assert_eq!(count(&conn, "study"), 1);
    assert_eq!(count(&conn, "national_ids"), 1);
    assert_eq!(count(&conn, "civil"), 1);
}

#[test]
fn hide_keeps_data_and_unhide_restores_it() {
    let conn = seeded_memory_db();
    conn.execute("UPDATE passports SET surname = 'العبسي'", [])
        .expect("fill");
    hide_base_column_in(&conn, "passports", "surname").expect("hide");
    // الإخفاء وسم فقط — البيانات لا تُمس.
    let v: String = conn
        .query_row("SELECT surname FROM passports LIMIT 1", [], |r| r.get(0))
        .expect("read");
    assert_eq!(v, "العبسي", "الإخفاء لا يمس البيانات");
    let tags = load_hidden_columns(&conn, "passports").expect("tags");
    assert_eq!(tags, vec!["surname".to_string()]);
    unhide_base_column_in(&conn, "passports", "surname").expect("unhide");
    let tags = load_hidden_columns(&conn, "passports").expect("tags");
    assert!(tags.is_empty(), "فك الوسم يزيله");
    let v: String = conn
        .query_row("SELECT surname FROM passports LIMIT 1", [], |r| r.get(0))
        .expect("read");
    assert_eq!(v, "العبسي", "الفك يعيد الحقل ببياناته");
}

#[test]
fn soft_delete_wipes_and_restore_returns_empty() {
    let conn = seeded_memory_db();
    conn.execute("UPDATE passports SET surname = 'العبسي'", [])
        .expect("fill");
    soft_delete_base_column_in(&conn, "passports", "surname").expect("delete");
    let v: String = conn
        .query_row("SELECT surname FROM passports LIMIT 1", [], |r| r.get(0))
        .expect("read");
    assert_eq!(v, "", "الحذف الناعم يمسح القيمة");
    let tags = load_deleted_columns(&conn, "passports").expect("tags");
    assert_eq!(tags, vec!["surname".to_string()]);
    restore_base_column_in(&conn, "passports", "surname").expect("restore");
    let tags = load_deleted_columns(&conn, "passports").expect("tags");
    assert!(tags.is_empty(), "الاستعادة تزيل الوسم");
    let v: String = conn
        .query_row("SELECT surname FROM passports LIMIT 1", [], |r| r.get(0))
        .expect("read");
    assert_eq!(v, "", "المستعاد يعود فارغاً — البيانات ممسوحة أصلاً");
}

#[test]
fn restore_defaults_clears_hidden() {
    let conn = seeded_memory_db();
    hide_base_column_in(&conn, "study", "major").expect("hide");
    assert_eq!(load_hidden_columns(&conn, "study").expect("tags").len(), 1);
    clear_hidden_columns(&conn).expect("clear");
    assert!(
        load_hidden_columns(&conn, "study").expect("tags").is_empty(),
        "الاستعادة تمسح كل الوسوم"
    );
    // ... وتمسح وسوم الحذف الناعم أيضاً.
    soft_delete_base_column_in(&conn, "study", "school").expect("delete");
    assert_eq!(load_deleted_columns(&conn, "study").expect("tags").len(), 1);
    clear_deleted_columns(&conn).expect("clear");
    assert!(
        load_deleted_columns(&conn, "study").expect("tags").is_empty(),
        "الاستعادة تمسح وسوم الحذف أيضاً"
    );
}

#[test]
fn hide_rejects_non_core_and_system_columns() {        let conn = seeded_memory_db();
    assert!(
        hide_base_column_in(&conn, "documents", "title").is_err(),
        "غير الأساسي 1-1 مرفوض"
    );
    assert!(
        hide_base_column_in(&conn, "passports", "record_id").is_err(),
        "عمود النظام مرفوض"
    );
    assert!(
        hide_base_column_in(&conn, "passports", "no_such_col").is_err(),
        "العمود المعدوم مرفوض"
    );
    // والرفض نفسه للحذف الناعم (نفس البوابة).
    assert!(soft_delete_base_column_in(&conn, "documents", "title").is_err());
    assert!(soft_delete_base_column_in(&conn, "passports", "record_id").is_err());
    // العددية في الحذف الناعم تُمسح بـ NULL لا `''`.
    conn.execute("UPDATE study SET graduation_year = 2000", [])
        .expect("fill");
    soft_delete_base_column_in(&conn, "study", "graduation_year").expect("delete numeric");
    let y: Option<i64> = conn
        .query_row("SELECT graduation_year FROM study LIMIT 1", [], |r| r.get(0))
        .expect("read");
    assert_eq!(y, None);
}

#[test]
fn label_override_and_reset() {
    let conn = seeded_memory_db();
    set_base_label_in(&conn, "passports", "surname", "اللقب", "Family Name").expect("set");
    let got = load_base_labels(&conn, "passports").expect("read");
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].column_name, "surname");
    assert_eq!(got[0].label, "اللقب");
    // إعادة الضبط تحذف التجاوز فقط.
    conn.execute("DELETE FROM column_labels WHERE table_name = 'passports' AND column_name = 'surname'", [])
        .expect("reset");
    assert!(load_base_labels(&conn, "passports").expect("read").is_empty());
    // الرفض: محمي + معدوم + تسمية فارغة + غير 1-1.
    assert!(set_base_label_in(&conn, "passports", "record_id", "س", "X").is_err());
    assert!(set_base_label_in(&conn, "passports", "no_such_col", "س", "X").is_err());
    assert!(set_base_label_in(&conn, "passports", "surname", "   ", "X").is_err());
    assert!(set_base_label_in(&conn, "documents", "title", "س", "X").is_err());
}

#[test]
fn restore_defaults_clears_labels() {
    let conn = seeded_memory_db();
    set_base_label_in(&conn, "civil", "first_name", "الاسم", "Name").expect("set");
    assert_eq!(load_base_labels(&conn, "civil").expect("read").len(), 1);
    clear_base_labels(&conn).expect("clear");
    assert!(load_base_labels(&conn, "civil").expect("read").is_empty());
}

#[test]
fn accounts_extendable_hide_label_and_extra() {
    let conn = seeded_memory_db();
    // البوابة: الحسابات قابلة للتمديد كبقية الأساسية — والوثائق مرفوضة.
    assert_eq!(
        load_extendable_table(&conn, "accounts").expect("accounts"),
        "accounts"
    );
    assert!(load_extendable_table(&conn, "documents").is_err());
    // صف حساب للشخص المزروع.
    let pid: String = conn
        .query_row("SELECT id FROM peoples LIMIT 1", [], |r| r.get(0))
        .expect("person");
    conn.execute(
        "INSERT INTO accounts (id, record_id, title, password, kind, sort_order, created_at, updated_at) VALUES ('acc1', ?1, 'بريد', 'pw', 'email', 0, 0, 0)",
        [&pid],
    )
    .expect("account row");
    // عمود مخصص (كما يفعل add_custom_column: ALTER حقيقي + سجل تعريف).
    conn.execute("ALTER TABLE accounts ADD COLUMN \"note\" TEXT NOT NULL DEFAULT ''", [])
        .expect("alter");
    conn.execute(
        "INSERT INTO custom_columns (table_name, column_name, label, label_en, ftype, foptions, sort_order, created_at, updated_at) VALUES ('accounts', 'note', 'ملاحظة', 'Note', 'text', '', 0, 0, 0)",
        [],
    )
    .expect("registry");
    // كتابة إضافية بمفتاح id (لا record_id) ثم قراءتها.
    let parsed: serde_json::Value = serde_json::from_str(r#"{"note":"hello"}"#).expect("json");
    write_account_extra_in(&conn, "acc1", parsed.as_object().expect("obj")).expect("write");
    let extras = read_account_extras(&conn).expect("read");
    assert_eq!(
        extras.get("acc1").expect("row").get("note").expect("col"),
        &serde_json::Value::String("hello".to_string())
    );
    assert!(write_account_extra_in(
        &conn,
        "nope",
        parsed.as_object().expect("obj")
    )
    .is_err());
    // إخفاء حقل أساسي: وسم فقط ثم فك.
    hide_base_column_in(&conn, "accounts", "username").expect("hide");
    assert_eq!(
        load_hidden_columns(&conn, "accounts").expect("tags"),
        vec!["username".to_string()]
    );
    unhide_base_column_in(&conn, "accounts", "username").expect("unhide");
    assert!(load_hidden_columns(&conn, "accounts").expect("tags").is_empty());
    // المحمي مرفوض: password/kind (منطق البطاقة) + العنوان (هوية البطاقة) + مفاتيح الربط.
    assert!(hide_base_column_in(&conn, "accounts", "password").is_err());
    assert!(hide_base_column_in(&conn, "accounts", "kind").is_err());
    assert!(hide_base_column_in(&conn, "accounts", "title").is_err());
    assert!(soft_delete_base_column_in(&conn, "accounts", "password").is_err());
    // حذف ناعم لحقل أساسي: مسح ثم استعادة فارغة.
    conn.execute("UPDATE accounts SET username = 'ali' WHERE id = 'acc1'", [])
        .expect("fill");
    soft_delete_base_column_in(&conn, "accounts", "username").expect("delete");
    let u: String = conn
        .query_row("SELECT username FROM accounts WHERE id = 'acc1'", [], |r| r.get(0))
        .expect("read");
    assert_eq!(u, "", "الحذف الناعم يمسح القيمة");
    restore_base_column_in(&conn, "accounts", "username").expect("restore");
    // تجاوز تسمية لحقل حسابات.
    set_base_label_in(&conn, "accounts", "username", "المستخدم", "Username").expect("label");
    let labels = load_base_labels(&conn, "accounts").expect("labels");
    assert_eq!(labels.len(), 1);
    assert_eq!(labels[0].label, "المستخدم");
}

#[test]
fn default_contact_columns_seeded_and_idempotent() {
    let conn = seeded_memory_db();
    let names: Vec<String> = conn
        .prepare("SELECT column_name FROM custom_columns WHERE table_name = 'contacts' ORDER BY sort_order")
        .expect("prepare")
        .query_map([], |r| r.get(0))
        .expect("map")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect");
    assert_eq!(names, vec!["mobile", "work", "home", "main", "other", "notes"]);
    // فيزيائية فعلاً على الجدول.
    let physical: Vec<String> = conn
        .prepare("PRAGMA table_info(contacts)")
        .expect("pragma")
        .query_map([], |r| r.get::<_, String>(1))
        .expect("map")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect");
    for col in &names {
        assert!(physical.contains(col), "عمود فيزيائي ناقص: {col}");
    }
    // إعادة التشغيل آمنة ولا تكرر.
    ensure_default_contact_columns(&conn).expect("idempotent");
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM custom_columns WHERE table_name = 'contacts'", [], |r| r.get(0))
        .expect("count");
    assert_eq!(n, 6);
    // قاعدة قديمة بلا بذر: تُرقّى عند الفتح.
    let legacy = Connection::open_in_memory().expect("memory db");
    legacy
        .execute("CREATE TABLE contacts (id TEXT PRIMARY KEY, record_id TEXT)", [])
        .expect("legacy ddl");
    ensure_default_contact_columns(&legacy).expect("upgrade");
    let m: i64 = legacy
        .query_row("SELECT COUNT(*) FROM custom_columns WHERE table_name = 'contacts'", [], |r| r.get(0))
        .expect("count");
    assert_eq!(m, 6);
}

#[test]
fn contacts_extendable_hide_label_and_extra() {
    let conn = seeded_memory_db();
    assert_eq!(
        load_extendable_table(&conn, "contacts").expect("contacts"),
        "contacts"
    );
    let pid: String = conn
        .query_row("SELECT id FROM peoples LIMIT 1", [], |r| r.get(0))
        .expect("person");
    conn.execute(
        "INSERT INTO contacts (id, record_id, name, name_en, phone, email, address, address_en, relation, relation_en, sort_order, created_at, updated_at) VALUES ('ct1', ?1, 'خالد', 'Khaled', '050', 'k@m.com', '', '', '', '', 0, 0, 0)",
        [&pid],
    )
    .expect("contact row");
    conn.execute("ALTER TABLE contacts ADD COLUMN \"note\" TEXT NOT NULL DEFAULT ''", [])
        .expect("alter");
    conn.execute(
        "INSERT INTO custom_columns (table_name, column_name, label, label_en, ftype, foptions, sort_order, created_at, updated_at) VALUES ('contacts', 'note', 'ملاحظة', 'Note', 'text', '', 0, 0, 0)",
        [],
    )
    .expect("registry");
    let parsed: serde_json::Value = serde_json::from_str(r#"{"note":"hi"}"#).expect("json");
    write_contact_extra_in(&conn, "ct1", parsed.as_object().expect("obj")).expect("write");
    let extras = read_contact_extras(&conn).expect("read");
    assert_eq!(
        extras.get("ct1").expect("row").get("note").expect("col"),
        &serde_json::Value::String("hi".to_string())
    );
    assert!(write_contact_extra_in(
        &conn,
        "nope",
        parsed.as_object().expect("obj")
    )
    .is_err());
    // إخفاء حقل أساسي ثم فك — والمحمي (الاسم) مرفوض.
    hide_base_column_in(&conn, "contacts", "phone").expect("hide");
    assert_eq!(
        load_hidden_columns(&conn, "contacts").expect("tags"),
        vec!["phone".to_string()]
    );
    unhide_base_column_in(&conn, "contacts", "phone").expect("unhide");
    assert!(hide_base_column_in(&conn, "contacts", "name").is_err());
    assert!(hide_base_column_in(&conn, "contacts", "name_en").is_err());
    // حذف ناعم ثم استعادة فارغة + تجاوز تسمية.
    conn.execute("UPDATE contacts SET email = 'k@m.com' WHERE id = 'ct1'", [])
        .expect("fill");
    soft_delete_base_column_in(&conn, "contacts", "email").expect("delete");
    let v: String = conn
        .query_row("SELECT email FROM contacts WHERE id = 'ct1'", [], |r| r.get(0))
        .expect("read");
    assert_eq!(v, "", "الحذف الناعم يمسح القيمة");
    restore_base_column_in(&conn, "contacts", "email").expect("restore");
    set_base_label_in(&conn, "contacts", "phone", "الهاتف", "Phone").expect("label");
    let labels = load_base_labels(&conn, "contacts").expect("labels");
    assert_eq!(labels.len(), 1);
    assert_eq!(labels[0].label, "الهاتف");
}

#[test]
fn seed_without_defaults_has_empty_tables() {        let conn = Connection::open_in_memory().expect("memory db");
    create_schema(&conn).expect("schema");
    seed_repo_structure(&conn, &["أحمد".to_string()], false).expect("seed");
    assert_eq!(count(&conn, "tabs"), 7);
    assert_eq!(count(&conn, "peoples"), 1);
    assert_eq!(count(&conn, "passports"), 0, "بلا قالب: بلا صفوف فيزيائية");
    assert_eq!(count(&conn, "study"), 0);
    assert_eq!(count(&conn, "national_ids"), 0);
    assert_eq!(count(&conn, "civil"), 0);
}

#[test]
fn uuids_are_dashed_v4_and_validated() {
    let a = new_guid().expect("guid");
    let b = new_guid().expect("guid");
    assert_eq!(a.len(), 36, "UUID مقسّم بطول 36");
    assert_eq!(b.len(), 36);
    assert_ne!(a, b);
    // بصمتا الإصدار والمتغير (v4).
    assert_eq!(&a[14..15], "4");
    assert!(["8", "9", "a", "b"].contains(&&a[19..20]));
    // الواجهة ترسل بصيغة مكتبتها — تُقبل كما هي.
    assert!(ensure_uuid(&a).is_ok());
    assert!(ensure_uuid("550e8400-e29b-41d4-a716-446655440000").is_ok());
    // المرفوض: فارغ، 32 بلا شرطات، قمامة.
    assert!(ensure_uuid("").is_err());
    assert!(ensure_uuid(&a.replace('-', "")).is_err());
    assert!(ensure_uuid("not-a-uuid-at-all----------------").is_err());
    assert!(ensure_uuid("550e8400-e29b-41d4-a716-44665544000Z").is_err());
}

#[test]
fn iso_date_and_grad_year_validation() {
    assert_eq!(ensure_iso_date("").unwrap(), "");
    assert_eq!(ensure_iso_date("2023-07-30").unwrap(), "2023-07-30");
    assert!(ensure_iso_date("30/07/2023").is_err());
    assert!(ensure_iso_date("2023-7-3").is_err());
    assert!(ensure_iso_date("not-a-date").is_err());
    assert_eq!(ensure_grad_year(None).unwrap(), None);
    assert_eq!(ensure_grad_year(Some(2020)).unwrap(), Some(2020));
    assert!(ensure_grad_year(Some(1800)).is_err());
    assert!(ensure_grad_year(Some(2200)).is_err());
}

#[test]
fn physical_cascade_on_record_delete() {
    let conn = seeded_memory_db();
    conn.execute_batch("PRAGMA foreign_keys = ON;").expect("fk");
    let rid: String = conn
        .query_row("SELECT id FROM peoples LIMIT 1", [], |r| r.get(0))
        .expect("record");
    conn.execute("DELETE FROM peoples WHERE id = ?1", [&rid]).expect("delete");
    assert_eq!(count(&conn, "passports"), 0, "صف الجواز يُحذف مع صاحبه");
    assert_eq!(count(&conn, "study"), 0);
    assert_eq!(count(&conn, "national_ids"), 0);
    assert_eq!(count(&conn, "civil"), 0);
}

#[test]
fn doc_category_accepts_custom() {
    assert_eq!(ensure_doc_category("passport").unwrap(), "passport");
    assert_eq!(ensure_doc_category("  عقود  ").unwrap(), "عقود");
    assert!(ensure_doc_category("").is_err());
}

#[test]
fn documents_schema_has_kind_link_and_stamps_without_frozen_name() {
    let conn = Connection::open_in_memory().expect("memory db");
    create_schema(&conn).expect("schema");
    let cols: Vec<String> = conn
        .prepare("PRAGMA table_info(documents)")
        .expect("pragma")
        .query_map([], |r| r.get::<_, String>(1))
        .expect("query")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect");
    assert!(cols.contains(&"owner_record_id".to_string()));
    assert!(cols.contains(&"kind".to_string()), "عمود النوع مفقود");
    assert!(cols.contains(&"source_path".to_string()), "عمود المصدر مفقود");
    assert!(cols.contains(&"filetype".to_string()), "عمود نوع الملف مفقود");
    assert!(cols.contains(&"created_at".to_string()), "الطابع الزمني مفقود");
    assert!(cols.contains(&"updated_at".to_string()), "طابع التعديل مفقود");
    assert!(!cols.contains(&"owner".to_string()), "عمود الاسم المجمد حُذف نهائياً");
    assert_eq!(ensure_doc_kind("").unwrap(), "file");
    assert_eq!(ensure_doc_kind("image").unwrap(), "image");
    assert!(ensure_doc_kind("video").is_err());
}

#[test]
fn physical_tables_exist_with_expected_columns() {
    let conn = Connection::open_in_memory().expect("memory db");
    create_schema(&conn).expect("schema");
    let cols_of = |table: &str| -> Vec<String> {
        conn.prepare(&format!("PRAGMA table_info({table})"))
            .expect("pragma")
            .query_map([], |r| r.get::<_, String>(1))
            .expect("query")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect")
    };
    let pp = cols_of("passports");
    for c in ["surname", "surname_en", "sex", "birth_date", "national_number", "passport_number", "issue_date", "expiry_date"] {
        assert!(pp.contains(&c.to_string()), "passports تفتقد {c}");
    }
    let st = cols_of("study");
    for c in ["education_level", "graduation_year", "major", "school", "notes"] {
        assert!(st.contains(&c.to_string()), "study تفتقد {c}");
    }
    let nid = cols_of("national_ids");
    for c in ["authority", "national_id", "birth_date", "issue_date", "gender"] {
        assert!(nid.contains(&c.to_string()), "national_ids تفتقد {c}");
    }
    let cv = cols_of("civil");
    for c in ["first_name", "gender", "birth_date", "registry_number", "religion", "marital_status"] {
        assert!(cv.contains(&c.to_string()), "civil تفتقد {c}");
    }
    let ct = cols_of("contacts");
    for c in ["id", "record_id", "name", "phone", "email", "created_at", "updated_at"] {
        assert!(ct.contains(&c.to_string()), "contacts تفتقد {c}");
    }
    let tabs = cols_of("tabs");
    assert!(tabs.contains(&"kind".to_string()), "tabs تفتقد kind");
    assert!(tabs.contains(&"table_name".to_string()), "tabs تفتقد table_name");
    // كل جدول بيانات يحمل الطابعين.
    for table in ["peoples", "accounts", "documents", "passports", "study", "national_ids", "civil", "contacts"] {
        let cols = cols_of(table);
        assert!(cols.contains(&"created_at".to_string()), "{table} تفتقد created_at");
        assert!(cols.contains(&"updated_at".to_string()), "{table} تفتقد updated_at");
    }
}

#[test]
fn ensure_default_tabs_adds_missing_only_once() {
    let conn = seeded_memory_db();
    conn.execute("DELETE FROM tabs WHERE id = 'accounts'", [])
        .expect("delete accounts tab");
    ensure_default_tabs(&conn).expect("first upgrade");
    assert_eq!(count(&conn, "tabs"), 7);
    let order: i64 = conn
        .query_row("SELECT sort_order FROM tabs WHERE id = 'accounts'", [], |r| r.get(0))
        .expect("order");
    assert_eq!(order, 7, "التبويب الجديد في نهاية الترتيب");
    ensure_default_tabs(&conn).expect("second upgrade is idempotent");
    assert_eq!(count(&conn, "tabs"), 7);
}

#[test]
fn normalize_registry_creates_stable_unique_ids() {
    let input = vec![
        TabInput { id: "passports".into(), title: "جوازات السفر".into(), title_en: "Passports".into() },
        TabInput { id: String::new(), title: "جهات الاتصال".into(), title_en: "Contacts".into() },
        TabInput { id: String::new(), title: "  ".into(), title_en: "ignored".into() },
        TabInput { id: String::new(), title: "الأرشيف".into(), title_en: String::new() },
    ];
    let tabs = normalize_registry(input).expect("normalize");
    assert_eq!(tabs.len(), 3, "العنوان الفارغ يُتجاهل");
    assert_eq!(tabs[0].id, "passports", "المعرف القائم يبقى كما هو");
    assert_eq!(tabs[1].id, "جهات-الاتصال", "المعرف يُشتق من العنوان");
    assert_ne!(tabs[1].id, tabs[2].id, "المعرفات فريدة بلا تكرار");
    assert_eq!(tabs[2].sort_order, 2);
    assert_eq!(tabs[0].title_en, "Passports", "العنوان الإنكليزي يُحفظ");
    assert_eq!(tabs[2].title_en, "", "الإنكليزي الفارغ يبقى فارغاً لا يُملأ تلقائياً");
}

#[test]
fn normalize_registry_rejects_empty_list() {
    let input = vec![TabInput { id: "a".into(), title: "   ".into(), title_en: String::new() }];
    assert!(normalize_registry(input).is_err());
}

#[test]
fn sync_repo_tabs_renames_and_adds_without_dropping_data() {
    let conn = seeded_memory_db();
    let registry = vec![
        GlobalTab { id: "passports".into(), title: "وثائق السفر".into(), title_en: "Travel Docs".into(), sort_order: 0, kind: "core".into(), table_name: Some("passports".into()) },
        GlobalTab { id: "vehicles".into(), title: "المركبات".into(), title_en: "Vehicles".into(), sort_order: 1, kind: "custom".into(), table_name: None },
    ];
    sync_repo_tabs(&conn, &registry).expect("sync");
    let title: String = conn
        .query_row("SELECT title FROM tabs WHERE id = 'passports'", [], |r| r.get(0))
        .expect("title");
    assert_eq!(title, "وثائق السفر", "العنوان الجديد يطغى");
    let title_en: String = conn
        .query_row("SELECT title_en FROM tabs WHERE id = 'passports'", [], |r| r.get(0))
        .expect("title_en");
    assert_eq!(title_en, "Travel Docs", "العنوان الإنكليزي يُزامَن أيضاً");
    assert_eq!(count(&conn, "tabs"), 8, "يُضاف الجديد ولا يُحذف القديم");
    assert_eq!(count(&conn, "passports"), 1, "الصفوف الفيزيائية سليمة");
    let exists: i64 = conn
        .query_row("SELECT COUNT(*) FROM tabs WHERE id = 'files'", [], |r| r.get(0))
        .expect("hidden tab row");
    assert_eq!(exists, 1, "تبويب محذوف من السجل يبقى في القاعدة (مخفي فقط)");
}

#[test]
fn backfill_default_titles_en_fills_only_known_defaults_and_only_once() {
    // سجل قديم: التبويبات الافتراضية بلا إنكليزي، ومقابلها تبويب أضافه المستخدم.
    let mut tabs = vec![
        GlobalTab { id: "passports".into(), title: "جوازات السفر".into(), title_en: String::new(), sort_order: 0, kind: "core".into(), table_name: Some("passports".into()) },
        GlobalTab { id: "files".into(), title: "ملفات".into(), title_en: String::new(), sort_order: 1, kind: "core".into(), table_name: Some("files".into()) },
        GlobalTab { id: "my_custom".into(), title: "تبويبي".into(), title_en: String::new(), sort_order: 2, kind: "custom".into(), table_name: None },
        GlobalTab { id: "civil".into(), title: "السجل المدني".into(), title_en: "Civil".into(), sort_order: 3, kind: "core".into(), table_name: Some("civil".into()) },
    ];
    assert!(backfill_default_titles_en(&mut tabs), "يبلّغ عن التغيير");
    assert_eq!(tabs[0].title_en, "Passports", "الافتراضي امتلأ من القالب");
    assert_eq!(tabs[1].title_en, "Files");
    assert_eq!(tabs[2].title_en, "", "معرّف غير معروف لا يُخترع له إنكليزي");
    assert_eq!(tabs[3].title_en, "Civil", "الموجود أصلاً لا يُمَس");

    assert!(!backfill_default_titles_en(&mut tabs), "التكرار لا يُبلّغ ولا يغيّر");
}

#[test]
fn merge_skips_soft_deleted_and_restore_reseeds_empty() {
    let conn = seeded_memory_db();
    // وسم جوازات محذوفاً + قيمة فيه.
    conn.execute("UPDATE tabs SET is_deleted = 1 WHERE id = 'passports'", [])
        .expect("mark deleted");
    conn.execute("UPDATE passports SET surname = 'x', surname_en = 'y'", [])
        .expect("fill");
    merge_factory_defaults(&conn).expect("merge");
    // الدمج لا يحيي المحذوف ولا يمس بياناته.
    assert_eq!(count(&conn, "passports"), 1);
    let surname: String = conn
        .query_row("SELECT surname FROM passports LIMIT 1", [], |r| r.get(0))
        .expect("surname");
    assert_eq!(surname, "x", "بيانات المحذوف لا تُمس");
    // فك الوسم + زرع الفارغ من جديد.
    conn.execute("UPDATE tabs SET is_deleted = 0 WHERE id = 'passports'", [])
        .expect("unmark");
    ensure_physical_rows(&conn).expect("reseed");
    assert_eq!(count(&conn, "passports"), 1);
}

#[test]
fn soft_delete_column_backfills_early_v3() {
    // قاعدة v3 مبكرة: جدول tabs بلا عمود is_deleted.
    let conn = Connection::open_in_memory().expect("memory db");
    conn.execute_batch(
        "CREATE TABLE tabs (id TEXT PRIMARY KEY, title TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
         INSERT INTO tabs (id, title, sort_order) VALUES ('passports', 'جوازات السفر', 0);",
    )
    .expect("early schema");
    ensure_tabs_is_deleted(&conn).expect("backfill");
    let flag: i64 = conn
        .query_row("SELECT is_deleted FROM tabs WHERE id = 'passports'", [], |r| r.get(0))
        .expect("flag defaults to 0");
    assert_eq!(flag, 0);
    // إعادة التشغيل آمنة.
    ensure_tabs_is_deleted(&conn).expect("idempotent");
}

#[test]
fn extendable_tables_policy() {
    let conn = seeded_memory_db();
    // الأساسية 1-1 قابلة للتمديد باسمها نفسه — والحسابات وجهات الاتصال (1-كثير) معها.
    assert_eq!(load_extendable_table(&conn, "passports").unwrap(), "passports");
    assert_eq!(load_extendable_table(&conn, "study").unwrap(), "study");
    assert_eq!(load_extendable_table(&conn, "accounts").unwrap(), "accounts");
    assert_eq!(load_extendable_table(&conn, "contacts").unwrap(), "contacts");
    // الملفات (بلا تمديد) مرفوضة — والمجهول مرفوض.
    assert!(load_extendable_table(&conn, "files").is_err());
    assert!(load_extendable_table(&conn, "nope").is_err());
    // بلا أعمدة إضافية: الخريطة فارغة.
    assert!(read_core_extras(&conn, "passports").unwrap().is_empty());
}

#[test]
fn sanitize_id_behaves() {
    assert_eq!(sanitize_id("civrec"), "civrec");
    assert_eq!(sanitize_id("  My Repo  "), "my-repo");
    assert!(!sanitize_id("../../etc").contains('/'));
    assert!(!sanitize_id("a/b\\c").contains('/'));
}

#[test]
fn custom_ident_is_strict_latin_quoted() {
    // عربي/رموز تُستبدل، والبداية الرقمية تُنزع، والطول محدود.
    assert_eq!(sanitize_ident("Vehicles-2026!", "x"), "vehicles_2026");
    assert_eq!(sanitize_ident("مركبات", "col_1"), "col_1");
    assert_eq!(sanitize_ident("9lives", "x"), "lives");
    assert_eq!(sanitize_ident("___", "x"), "x");
    assert!(sanitize_ident("ok_name2", "x").chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'));
    assert_eq!(quoted("a\"b"), "\"ab\"");
    assert_eq!(custom_sql_type("number").unwrap(), "REAL");
    assert_eq!(custom_sql_type("list").unwrap(), "TEXT");
    assert!(custom_sql_type("image").is_err());
}

#[test]
fn custom_column_validation() {
    let mut counter = 1u32;
    // التسمية إجبارية.
    assert!(clean_custom_column(
        &CustomColumnInput { name: "".into(), label: "   ".into(), label_en: "".into(), ftype: "text".into(), foptions: "".into() },
        &[], &mut counter,
    ).is_err());
    // القائمة بلا خيارات مرفوضة، وبخيارات فاسدة مرفوضة.
    assert!(clean_custom_column(
        &CustomColumnInput { name: "".into(), label: "النوع".into(), label_en: "".into(), ftype: "list".into(), foptions: "".into() },
        &[], &mut counter,
    ).is_err());
    assert!(clean_custom_column(
        &CustomColumnInput { name: "".into(), label: "النوع".into(), label_en: "".into(), ftype: "list".into(), foptions: "[{}]".into() },
        &[], &mut counter,
    ).is_err());
    // الصالح: اسم مولد فريد حتى مع التكرار.
    let mut ok = |label: &str, taken: &[String]| clean_custom_column(
        &CustomColumnInput { name: "".into(), label: label.into(), label_en: "X".into(), ftype: "text".into(), foptions: "".into() },
        taken, &mut counter,
    ).expect("valid column");
    let (first, _, _, _, _) = ok("a", &[]);
    let (second, _, _, _, _) = ok("a", &[first.clone()]);
    assert_ne!(first, second);
    // النوع المجهول مرفوض.
    assert!(clean_custom_column(
        &CustomColumnInput { name: "".into(), label: "x".into(), label_en: "".into(), ftype: "blob".into(), foptions: "".into() },
        &[], &mut counter,
    ).is_err());
}

#[test]
fn core_tabs_refuse_custom_ops() {
    let conn = seeded_memory_db();
    // تبويب أساسي: load_custom_table يرفض.
    assert!(load_custom_table(&conn, "passports").is_err());
    // تبويب غير موجود: يرفض.
    assert!(load_custom_table(&conn, "nope").is_err());
}

#[test]
fn share_names_decode_and_sanitize() {
    assert_eq!(sanitize_file_name("image%3A123.jpg"), "image_123.jpg");
    assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
    assert_eq!(sanitize_file_name("   "), "file");
    assert_eq!(sanitize_file_name(".hidden.txt"), "hidden.txt");
    // فك ترميز UTF-8 (أسماء عربية مرمزة) يبقى سليماً.
    assert_eq!(sanitize_file_name("%D9%85%D9%84%D9%81.pdf"), "ملف.pdf");
}

#[test]
fn share_display_name_gets_stored_extension() {
    assert_eq!(display_with_ext(Some("تقريري"), "a1b2.pdf"), "تقريري.pdf");
    assert_eq!(display_with_ext(Some("Report v1.2"), "x.pdf"), "Report v1.2.pdf");
    assert_eq!(display_with_ext(Some("scan.JPG"), "image%3A9.jpg"), "scan.JPG");
    assert_eq!(display_with_ext(None, "image%3A9.jpg"), "image%3A9.jpg");
    assert_eq!(display_with_ext(Some("  "), "f.png"), "f.png");
}

#[test]
fn share_names_truncate_keeping_extension() {
    let long = format!("{}.pdf", "a".repeat(400));
    let n = sanitize_file_name(&long);
    assert!(n.len() <= 255 && n.ends_with(".pdf"));
    let arabic = format!("{}.png", "م".repeat(300));
    let n = sanitize_file_name(&arabic);
    assert!(n.len() <= 255 && n.ends_with(".png"));
}
