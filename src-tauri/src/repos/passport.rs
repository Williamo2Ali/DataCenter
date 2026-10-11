// الجداول الفيزيائية 1-1 لكل فرد: جواز السفر، الدراسة، الهوية الوطنية، السجل المدني.

use rusqlite::params;
use serde::Serialize;
use tauri::AppHandle;
use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PassportDto {
    pub record_id: String,
    pub surname: String,
    pub surname_en: String,
    pub given_name: String,
    pub given_name_en: String,
    pub full_name: String,
    pub full_name_en: String,
    pub father_name: String,
    pub father_name_en: String,
    pub mother_name: String,
    pub mother_name_en: String,
    pub sex: String,
    pub birth_date: String,
    pub birth_place: String,
    pub birth_place_en: String,
    pub national_number: String,
    pub passport_number: String,
    pub passport_type: String,
    pub passport_type_en: String,
    pub country_code: String,
    pub country_of_issue: String,
    pub country_of_issue_en: String,
    pub place_of_issue: String,
    pub place_of_issue_en: String,
    pub issue_date: String,
    pub expiry_date: String,
    pub created_at: u64,
    pub updated_at: u64,
    /// قيم الأعمدة الإضافية (المضافة من مدير الأعمدة) — خارج البنية الأساسية.
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyDto {
    pub record_id: String,
    pub education_level: String,
    pub graduation_year: Option<i64>,
    pub major: String,
    pub major_en: String,
    pub school: String,
    pub school_en: String,
    pub notes: String,
    pub notes_en: String,
    pub created_at: u64,
    pub updated_at: u64,
    /// قيم الأعمدة الإضافية (المضافة من مدير الأعمدة) — خارج البنية الأساسية.
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NationalIdDto {
    pub record_id: String,
    pub authority: String,
    pub authority_en: String,
    pub doc_type: String,
    pub doc_type_en: String,
    pub first_name: String,
    pub first_name_en: String,
    pub last_name: String,
    pub last_name_en: String,
    pub father_name: String,
    pub father_name_en: String,
    pub mother_name: String,
    pub mother_name_en: String,
    pub birth_place: String,
    pub birth_place_en: String,
    pub birth_date: String,
    pub national_id: String,
    pub registry_office: String,
    pub registry_office_en: String,
    pub registry_record: String,
    pub registry_record_en: String,
    pub gender: String,
    pub face_color: String,
    pub face_color_en: String,
    pub eye_color: String,
    pub eye_color_en: String,
    pub address: String,
    pub address_en: String,
    pub distinctive_marks: String,
    pub distinctive_marks_en: String,
    pub issue_date: String,
    pub created_at: u64,
    pub updated_at: u64,
    /// قيم الأعمدة الإضافية (المضافة من مدير الأعمدة) — خارج البنية الأساسية.
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CivilDto {
    pub record_id: String,
    pub first_name: String,
    pub first_name_en: String,
    pub father_name: String,
    pub father_name_en: String,
    pub mother_name: String,
    pub mother_name_en: String,
    pub last_name: String,
    pub last_name_en: String,
    pub gender: String,
    pub birth_date: String,
    pub birth_place: String,
    pub birth_place_en: String,
    pub registry_number: String,
    pub registry_number_en: String,
    pub religion: String,
    pub religion_en: String,
    pub marital_status: String,
    pub marital_status_en: String,
    pub national_id: String,
    pub created_at: u64,
    pub updated_at: u64,
    /// قيم الأعمدة الإضافية (المضافة من مدير الأعمدة) — خارج البنية الأساسية.
    pub extra: serde_json::Map<String, serde_json::Value>,
}

// ================= الجداول الفيزيائية (1-1 لكل فرد) =================
// إنشاء-or-تحديث لصف الفرد — الصف مضمون الوجود (بذر/دمج/إضافة)، والأمر يملؤه.

#[tauri::command]
pub fn upsert_passport(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    record_id: String,
    surname: String,
    surname_en: String,
    given_name: String,
    given_name_en: String,
    full_name: String,
    full_name_en: String,
    father_name: String,
    father_name_en: String,
    mother_name: String,
    mother_name_en: String,
    sex: String,
    birth_date: String,
    birth_place: String,
    birth_place_en: String,
    national_number: String,
    passport_number: String,
    passport_type: String,
    passport_type_en: String,
    country_code: String,
    country_of_issue: String,
    country_of_issue_en: String,
    place_of_issue: String,
    place_of_issue_en: String,
    issue_date: String,
    expiry_date: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    ensure_record_exists(&conn, &record_id)?;
    let sex = sex.trim().to_string();
    if !sex.is_empty() && sex != "male" && sex != "female" {
        return Err("الجنس غير معروف.".to_string());
    }
    conn.execute(
        "INSERT INTO passports (record_id, created_at, updated_at) VALUES (?1, ?2, ?2) ON CONFLICT(record_id) DO NOTHING",
        params![&record_id, now_db()],
    )
    .map_err(|e| e.to_string())?;
    let changed = conn.execute(
        "UPDATE passports SET surname=?1, surname_en=?2, given_name=?3, given_name_en=?4, full_name=?5, full_name_en=?6, father_name=?7, father_name_en=?8, mother_name=?9, mother_name_en=?10, sex=?11, birth_date=?12, birth_place=?13, birth_place_en=?14, national_number=?15, passport_number=?16, passport_type=?17, passport_type_en=?18, country_code=?19, country_of_issue=?20, country_of_issue_en=?21, place_of_issue=?22, place_of_issue_en=?23, issue_date=?24, expiry_date=?25, updated_at=?26 WHERE record_id=?27",
        params![
            clean_text80(&surname), clean_text80(&surname_en),
            clean_text80(&given_name), clean_text80(&given_name_en),
            clean_text80(&full_name), clean_text80(&full_name_en),
            clean_text80(&father_name), clean_text80(&father_name_en),
            clean_text80(&mother_name), clean_text80(&mother_name_en),
            sex,
            ensure_iso_date(&birth_date)?,
            clean_text80(&birth_place), clean_text80(&birth_place_en),
            national_number.trim().to_string(), passport_number.trim().to_string(),
            clean_text80(&passport_type), clean_text80(&passport_type_en),
            country_code.trim().chars().take(10).collect::<String>(),
            clean_text80(&country_of_issue), clean_text80(&country_of_issue_en),
            clean_text80(&place_of_issue), clean_text80(&place_of_issue_en),
            ensure_iso_date(&issue_date)?, ensure_iso_date(&expiry_date)?,
            now_db(), record_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("السجل غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
pub fn upsert_study(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    record_id: String,
    education_level: String,
    graduation_year: Option<i64>,
    major: String,
    major_en: String,
    school: String,
    school_en: String,
    notes: String,
    notes_en: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    ensure_record_exists(&conn, &record_id)?;
    conn.execute(
        "INSERT INTO study (record_id, created_at, updated_at) VALUES (?1, ?2, ?2) ON CONFLICT(record_id) DO NOTHING",
        params![&record_id, now_db()],
    )
    .map_err(|e| e.to_string())?;
    let changed = conn.execute(
        "UPDATE study SET education_level=?1, graduation_year=?2, major=?3, major_en=?4, school=?5, school_en=?6, notes=?7, notes_en=?8, updated_at=?9 WHERE record_id=?10",
        params![
            education_level.trim().to_string(),
            ensure_grad_year(graduation_year)?,
            clean_text80(&major), clean_text80(&major_en),
            clean_text80(&school), clean_text80(&school_en),
            clean_text500(&notes), clean_text500(&notes_en),
            now_db(), record_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("السجل غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn upsert_national_id(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    record_id: String,
    authority: String,
    authority_en: String,
    doc_type: String,
    doc_type_en: String,
    first_name: String,
    first_name_en: String,
    last_name: String,
    last_name_en: String,
    father_name: String,
    father_name_en: String,
    mother_name: String,
    mother_name_en: String,
    birth_place: String,
    birth_place_en: String,
    birth_date: String,
    national_id: String,
    registry_office: String,
    registry_office_en: String,
    registry_record: String,
    registry_record_en: String,
    gender: String,
    face_color: String,
    face_color_en: String,
    eye_color: String,
    eye_color_en: String,
    address: String,
    address_en: String,
    distinctive_marks: String,
    distinctive_marks_en: String,
    issue_date: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    ensure_record_exists(&conn, &record_id)?;
    let gender = gender.trim().to_string();
    if !gender.is_empty() && gender != "male" && gender != "female" {
        return Err("الجنس غير معروف.".to_string());
    }
    conn.execute(
        "INSERT INTO national_ids (record_id, created_at, updated_at) VALUES (?1, ?2, ?2) ON CONFLICT(record_id) DO NOTHING",
        params![&record_id, now_db()],
    )
    .map_err(|e| e.to_string())?;
    let changed = conn.execute(
        "UPDATE national_ids SET authority=?1, authority_en=?2, doc_type=?3, doc_type_en=?4, first_name=?5, first_name_en=?6, last_name=?7, last_name_en=?8, father_name=?9, father_name_en=?10, mother_name=?11, mother_name_en=?12, birth_place=?13, birth_place_en=?14, birth_date=?15, national_id=?16, registry_office=?17, registry_office_en=?18, registry_record=?19, registry_record_en=?20, gender=?21, face_color=?22, face_color_en=?23, eye_color=?24, eye_color_en=?25, address=?26, address_en=?27, distinctive_marks=?28, distinctive_marks_en=?29, issue_date=?30, updated_at=?31 WHERE record_id=?32",
        params![
            clean_text80(&authority), clean_text80(&authority_en),
            clean_text80(&doc_type), clean_text80(&doc_type_en),
            clean_text80(&first_name), clean_text80(&first_name_en),
            clean_text80(&last_name), clean_text80(&last_name_en),
            clean_text80(&father_name), clean_text80(&father_name_en),
            clean_text80(&mother_name), clean_text80(&mother_name_en),
            clean_text80(&birth_place), clean_text80(&birth_place_en),
            ensure_iso_date(&birth_date)?, national_id.trim().to_string(),
            clean_text80(&registry_office), clean_text80(&registry_office_en),
            clean_text80(&registry_record), clean_text80(&registry_record_en),
            gender,
            clean_text80(&face_color), clean_text80(&face_color_en),
            clean_text80(&eye_color), clean_text80(&eye_color_en),
            clean_text500(&address), clean_text500(&address_en),
            clean_text500(&distinctive_marks), clean_text500(&distinctive_marks_en),
            ensure_iso_date(&issue_date)?, now_db(), record_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("السجل غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn upsert_civil(
    app: AppHandle,
    repo_id: String,
    password: Option<String>,
    record_id: String,
    first_name: String,
    first_name_en: String,
    father_name: String,
    father_name_en: String,
    mother_name: String,
    mother_name_en: String,
    last_name: String,
    last_name_en: String,
    gender: String,
    birth_date: String,
    birth_place: String,
    birth_place_en: String,
    registry_number: String,
    registry_number_en: String,
    religion: String,
    religion_en: String,
    marital_status: String,
    marital_status_en: String,
    national_id: String,
) -> Result<RepoData, String> {
    let (_, data) = mutate_repo(&app, &repo_id, password.clone(), |conn| {
    ensure_record_exists(&conn, &record_id)?;
    let gender = gender.trim().to_string();
    if !gender.is_empty() && gender != "male" && gender != "female" {
        return Err("الجنس غير معروف.".to_string());
    }
    conn.execute(
        "INSERT INTO civil (record_id, created_at, updated_at) VALUES (?1, ?2, ?2) ON CONFLICT(record_id) DO NOTHING",
        params![&record_id, now_db()],
    )
    .map_err(|e| e.to_string())?;
    let changed = conn.execute(
        "UPDATE civil SET first_name=?1, first_name_en=?2, father_name=?3, father_name_en=?4, mother_name=?5, mother_name_en=?6, last_name=?7, last_name_en=?8, gender=?9, birth_date=?10, birth_place=?11, birth_place_en=?12, registry_number=?13, registry_number_en=?14, religion=?15, religion_en=?16, marital_status=?17, marital_status_en=?18, national_id=?19, updated_at=?20 WHERE record_id=?21",
        params![
            clean_text80(&first_name), clean_text80(&first_name_en),
            clean_text80(&father_name), clean_text80(&father_name_en),
            clean_text80(&mother_name), clean_text80(&mother_name_en),
            clean_text80(&last_name), clean_text80(&last_name_en),
            gender, ensure_iso_date(&birth_date)?,
            clean_text80(&birth_place), clean_text80(&birth_place_en),
            clean_text80(&registry_number), clean_text80(&registry_number_en),
            clean_text80(&religion), clean_text80(&religion_en),
            clean_text80(&marital_status), clean_text80(&marital_status_en),
            national_id.trim().to_string(), now_db(), record_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("السجل غير موجود.".to_string());
    }
        Ok(())
    })?;
    Ok(data)
}
