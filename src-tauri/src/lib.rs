pub mod printer;

use printer::{enumerate_windows_printers, print_spooler_raw, PrintResult, WindowsPrinterInfo};
use rusqlite::{
    types::{Value as SqlValue, ValueRef},
    Connection, ToSql,
};
use serde_json::{Map, Value};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};

struct DbState(Mutex<Option<Connection>>);

fn rollback_if_needed(conn: &Connection) -> Result<(), String> {
    if !conn.is_autocommit() {
        conn.execute_batch("ROLLBACK;")
            .map_err(|e| format!("تعذر إلغاء المعاملة السابقة: {e}"))?;
    }
    Ok(())
}

fn configure_connection(conn: &Connection) -> Result<(), String> {
    rollback_if_needed(conn)?;
    // FULL sync protects committed POS transactions against power loss on local Windows disks.
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;")
        .map_err(|e| format!("فشل إعداد SQLite: {e}"))
}

fn execute_statement(conn: &Connection, sql: &str, params: &[&dyn ToSql]) -> Result<u64, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| format!("خطأ SQL: {e}"))?;
    if stmt.column_count() > 0 {
        let mut rows = stmt
            .query(params)
            .map_err(|e| format!("فشل تنفيذ SQL: {e}"))?;
        let mut count = 0_u64;
        while rows
            .next()
            .map_err(|e| format!("فشل قراءة نتيجة SQL: {e}"))?
            .is_some()
        {
            count += 1;
        }
        Ok(count)
    } else {
        stmt.execute(params)
            .map(|n| n as u64)
            .map_err(|e| format!("فشل تنفيذ SQL: {e}"))
    }
}

fn validate_database_file(path: &Path) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| format!("ملف قاعدة البيانات غير صالح: {e}"))?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check;", [], |row| row.get(0))
        .map_err(|e| format!("تعذر فحص سلامة قاعدة البيانات: {e}"))?;
    if integrity != "ok" {
        return Err(format!("فشل فحص سلامة قاعدة البيانات: {integrity}"));
    }
    let table_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table';",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("تعذر التحقق من مخطط قاعدة البيانات: {e}"))?;
    if table_count == 0 {
        return Err("ملف الاستعادة لا يحتوي على جداول قاعدة بيانات.".to_string());
    }
    let mut fk = conn
        .prepare("PRAGMA foreign_key_check;")
        .map_err(|e| format!("تعذر فحص العلاقات: {e}"))?;
    let mut rows = fk.query([]).map_err(|e| format!("تعذر فحص العلاقات: {e}"))?;
    if rows
        .next()
        .map_err(|e| format!("تعذر قراءة فحص العلاقات: {e}"))?
        .is_some()
    {
        return Err("تحتوي النسخة الاحتياطية على علاقات مرجعية غير سليمة.".to_string());
    }
    Ok(())
}

fn remove_sqlite_sidecars(path: &Path) {
    let _ = fs::remove_file(path.with_extension("db-wal"));
    let _ = fs::remove_file(path.with_extension("db-shm"));
}

fn open_configured(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("فشل فتح SQLite: {e}"))?;
    configure_connection(&conn)?;
    Ok(conn)
}

fn export_snapshot(conn: &Connection, db_path: &Path) -> Result<Vec<u8>, String> {
    let temp = db_path.with_extension("db.backup-temp");
    let _ = fs::remove_file(&temp);
    let escaped = temp.to_string_lossy().replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{escaped}';"))
        .map_err(|e| format!("فشل إنشاء لقطة قاعدة البيانات: {e}"))?;
    let bytes = fs::read(&temp).map_err(|e| format!("فشل قراءة لقطة قاعدة البيانات: {e}"));
    let _ = fs::remove_file(&temp);
    bytes
}

fn restore_database(
    path: &Path,
    current: &mut Option<Connection>,
    bytes: &[u8],
    fail_after_swap: bool,
) -> Result<(), String> {
    if let Some(conn) = current.as_ref() {
        rollback_if_needed(conn)?;
    }
    let restore = path.with_extension("db.restore");
    let previous = path.with_extension("db.pre-restore");
    fs::write(&restore, bytes).map_err(|e| format!("فشل كتابة ملف الاستعادة المؤقت: {e}"))?;
    if let Err(error) = validate_database_file(&restore) {
        let _ = fs::remove_file(&restore);
        return Err(error);
    }
    *current = None;
    let restore_result = (|| -> Result<Connection, String> {
        remove_sqlite_sidecars(path);
        let _ = fs::remove_file(&previous);
        if path.exists() {
            fs::rename(path, &previous).map_err(|e| format!("تعذر حفظ النسخة السابقة: {e}"))?;
        }
        fs::rename(&restore, path).map_err(|e| format!("تعذر استبدال قاعدة البيانات: {e}"))?;
        if fail_after_swap {
            return Err("فشل استعادة مصطنع بعد استبدال الملف.".to_string());
        }
        let conn = open_configured(path)?;
        validate_database_file(path)?;
        Ok(conn)
    })();
    match restore_result {
        Ok(conn) => {
            *current = Some(conn);
            let _ = fs::remove_file(previous);
            Ok(())
        }
        Err(error) => {
            drop(current.take());
            remove_sqlite_sidecars(path);
            let rollback = if previous.exists() {
                let _ = fs::remove_file(path);
                fs::rename(&previous, path).map_err(|e| format!("تعذر إرجاع النسخة السابقة: {e}"))
            } else {
                Ok(())
            };
            let _ = fs::remove_file(restore);
            match open_configured(path) {
                Ok(conn) => *current = Some(conn),
                Err(reopen_error) => {
                    return Err(format!(
                        "{error}; تعذر إعادة فتح النسخة السابقة: {reopen_error}"
                    ))
                }
            }
            rollback.map_err(|e| format!("{error}; فشل إرجاع النسخة السابقة: {e}"))?;
            Err(format!(
                "فشلت الاستعادة وأُعيد فتح قاعدة البيانات السابقة: {error}"
            ))
        }
    }
}

const ACTIVATION_FILE_NAME: &str = "nasaq-activation.json";
const ACTIVATION_MAX_BYTES: usize = 16 * 1024;

fn validate_activation_content(content: &str) -> Result<(), String> {
    if content.len() >= ACTIVATION_MAX_BYTES {
        return Err("ملف التفعيل يتجاوز الحد الأقصى المسموح (16KB).".to_string());
    }
    serde_json::from_str::<Value>(content)
        .map(|_| ())
        .map_err(|e| format!("محتوى ملف التفعيل ليس JSON صالحاً: {e}"))
}

fn read_activation_file(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() { return Ok(None); }
    let metadata = fs::metadata(path).map_err(|e| format!("تعذر قراءة ملف التفعيل: {e}"))?;
    if metadata.len() as usize >= ACTIVATION_MAX_BYTES {
        return Err("ملف التفعيل يتجاوز الحد الأقصى المسموح (16KB).".to_string());
    }
    let content = fs::read_to_string(path).map_err(|e| format!("تعذر قراءة ملف التفعيل: {e}"))?;
    validate_activation_content(&content)?;
    Ok(Some(content))
}

fn write_activation_file(path: &Path, content: &str) -> Result<(), String> {
    validate_activation_content(content)?;
    let temp = path.with_file_name(format!("{}.tmp", path.file_name().unwrap_or_default().to_string_lossy()));
    let mut file = fs::File::create(&temp).map_err(|e| format!("تعذر إنشاء ملف التفعيل المؤقت: {e}"))?;
    file.write_all(content.as_bytes()).map_err(|e| format!("تعذر كتابة ملف التفعيل: {e}"))?;
    file.sync_all().map_err(|e| format!("تعذر مزامنة ملف التفعيل: {e}"))?;
    drop(file);
    if path.exists() { fs::remove_file(path).map_err(|e| format!("تعذر استبدال ملف التفعيل: {e}"))?; }
    fs::rename(&temp, path).map_err(|e| format!("تعذر تثبيت ملف التفعيل: {e}"))?;
    Ok(())
}

fn activation_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|dir| dir.join(ACTIVATION_FILE_NAME)).map_err(|e| e.to_string())
}

const APP_VERSION: &str = "1.0.2";

fn sanitize_support_log(content: &str) -> String {
    content.lines().map(|line| {
        if line.contains("NQ2.") || line.contains("password_hash") {
            "[تم حذف سطر يحتوي بيانات حساسة من سجل الدعم]"
        } else { line }
    }).collect::<Vec<_>>().join("\n")
}

fn build_support_log(log_dir: &Path, exported_at: &str, os_version: &str) -> Result<String, String> {
    let mut files: Vec<PathBuf> = fs::read_dir(log_dir)
        .map_err(|e| format!("تعذر قراءة مجلد السجلات: {e}"))?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.is_file())
        .collect();
    files.sort_by(|a, b| {
        let am = fs::metadata(a).and_then(|m| m.modified()).ok();
        let bm = fs::metadata(b).and_then(|m| m.modified()).ok();
        bm.cmp(&am).then_with(|| b.cmp(a))
    });
    let mut output = format!("Nasaq POS Support Log\nإصدار التطبيق: {APP_VERSION}\nإصدار Windows: {os_version}\nوقت التصدير: {exported_at}\n\n");
    for path in files.into_iter().take(7) {
        let mut content = String::new();
        fs::File::open(&path).and_then(|mut file| file.read_to_string(&mut content))
            .map_err(|e| format!("تعذر قراءة سجل الدعم: {e}"))?;
        output.push_str(&format!("===== {} =====\n{}\n\n", path.file_name().unwrap_or_default().to_string_lossy(), sanitize_support_log(&content)));
    }
    Ok(output)
}

fn export_support_log_file(log_dir: &Path, destination: &Path, exported_at: &str, os_version: &str) -> Result<(), String> {
    let content = build_support_log(log_dir, exported_at, os_version)?;
    fs::write(destination, content).map_err(|e| format!("تعذر حفظ سجل الدعم: {e}"))
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("data");
    fs::create_dir_all(&dir).map_err(|e| format!("تعذر إنشاء مجلد قاعدة البيانات: {e}"))?;
    Ok(dir.join("nasaq.db"))
}

fn json_to_sql(value: &Value) -> Result<SqlValue, String> {
    match value {
        Value::Null => Ok(SqlValue::Null),
        Value::Bool(v) => Ok(SqlValue::Integer(if *v { 1 } else { 0 })),
        Value::Number(v) => v
            .as_i64()
            .map(SqlValue::Integer)
            .or_else(|| v.as_f64().map(SqlValue::Real))
            .ok_or_else(|| "قيمة رقمية غير صالحة".to_string()),
        Value::String(v) => Ok(SqlValue::Text(v.clone())),
        Value::Array(v) => Ok(SqlValue::Blob(
            v.iter()
                .map(|x| x.as_u64().ok_or_else(|| "قيمة bytes غير صالحة".to_string()))
                .collect::<Result<Vec<_>, _>>()?
                .into_iter()
                .map(|x| x as u8)
                .collect(),
        )),
        Value::Object(_) => Err("لا يمكن تمرير كائن JSON كقيمة SQLite".to_string()),
    }
}

fn sql_to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(v) => Value::from(v),
        ValueRef::Real(v) => Value::from(v),
        ValueRef::Text(v) => Value::String(String::from_utf8_lossy(v).into_owned()),
        ValueRef::Blob(v) => Value::Array(v.iter().map(|b| Value::from(*b)).collect()),
    }
}

fn with_db<T>(
    state: &DbState,
    f: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let guard = state
        .0
        .lock()
        .map_err(|_| "تعذر قفل اتصال قاعدة البيانات".to_string())?;
    let conn = guard
        .as_ref()
        .ok_or_else(|| "اتصال قاعدة البيانات غير متاح".to_string())?;
    f(conn)
}

mod commands {
    use super::*;

    #[tauri::command]
    pub fn export_support_log(app: tauri::AppHandle, destination: String, exported_at: String) -> Result<(), String> {
        let log_dir = app.path().app_log_dir().map_err(|e| format!("تعذر تحديد مجلد السجلات: {e}"))?;
        export_support_log_file(&log_dir, Path::new(&destination), &exported_at, std::env::consts::OS)
    }

    #[tauri::command]
    pub fn activation_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
        read_activation_file(&activation_path(&app)?)
    }

    #[tauri::command]
    pub fn activation_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
        let path = activation_path(&app)?;
        if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| format!("تعذر إنشاء مجلد التفعيل: {e}"))?; }
        write_activation_file(&path, &content)
    }

    #[tauri::command]
    pub async fn db_init(app: tauri::AppHandle, state: State<'_, DbState>) -> Result<(), String> {
        let path = db_path(&app)?;
        let mut guard = state
            .0
            .lock()
            .map_err(|_| "تعذر قفل اتصال قاعدة البيانات".to_string())?;
        if let Some(conn) = guard.as_ref() {
            configure_connection(conn)?;
        } else {
            *guard = Some(open_configured(&path)?);
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn db_reset_transaction(state: State<'_, DbState>) -> Result<(), String> {
        let guard = state
            .0
            .lock()
            .map_err(|_| "تعذر قفل اتصال قاعدة البيانات".to_string())?;
        if let Some(conn) = guard.as_ref() {
            rollback_if_needed(conn)?;
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn db_exec(
        sql: String,
        params: Vec<Value>,
        state: State<'_, DbState>,
    ) -> Result<DbRunResult, String> {
        let values = params
            .iter()
            .map(json_to_sql)
            .collect::<Result<Vec<_>, _>>()?;
        with_db(&state, |conn| {
            let refs: Vec<&dyn ToSql> = values.iter().map(|v| v as &dyn ToSql).collect();
            let changed = execute_statement(conn, &sql, refs.as_slice())?;
            Ok(DbRunResult {
                rows_affected: changed,
                last_insert_id: conn.last_insert_rowid(),
            })
        })
    }

    #[tauri::command]
    pub async fn db_query(
        sql: String,
        params: Vec<Value>,
        state: State<'_, DbState>,
    ) -> Result<Vec<Value>, String> {
        let values = params
            .iter()
            .map(json_to_sql)
            .collect::<Result<Vec<_>, _>>()?;
        with_db(&state, |conn| {
            let refs: Vec<&dyn ToSql> = values.iter().map(|v| v as &dyn ToSql).collect();
            let mut stmt = conn.prepare(&sql).map_err(|e| format!("خطأ SQL: {e}"))?;
            let names: Vec<String> = stmt
                .column_names()
                .iter()
                .map(|s| (*s).to_string())
                .collect();
            let mut rows = stmt
                .query(refs.as_slice())
                .map_err(|e| format!("فشل استعلام SQL: {e}"))?;
            let mut result = Vec::new();
            while let Some(row) = rows.next().map_err(|e| format!("فشل قراءة SQLite: {e}"))?
            {
                let mut object = Map::new();
                for (i, name) in names.iter().enumerate() {
                    let value = row
                        .get_ref(i)
                        .map_err(|e| format!("فشل قراءة العمود: {e}"))?;
                    object.insert(name.clone(), sql_to_json(value));
                }
                result.push(Value::Object(object));
            }
            Ok(result)
        })
    }

    #[tauri::command]
    pub async fn db_export_bytes(
        state: State<'_, DbState>,
        app: tauri::AppHandle,
    ) -> Result<Vec<u8>, String> {
        let path = db_path(&app)?;
        with_db(&state, |conn| export_snapshot(conn, &path))
    }

    #[tauri::command]
    pub async fn db_load_bytes(
        bytes: Vec<u8>,
        state: State<'_, DbState>,
        app: tauri::AppHandle,
    ) -> Result<(), String> {
        let path = db_path(&app)?;
        let mut guard = state
            .0
            .lock()
            .map_err(|_| "تعذر قفل اتصال قاعدة البيانات".to_string())?;
        restore_database(&path, &mut guard, &bytes, false)
    }

    #[tauri::command]
    pub async fn print_raw(printer_name: String, data: Vec<u8>) -> Result<PrintResult, String> {
        if printer_name.trim().is_empty() {
            return Err("اسم الطابعة مطلوب لإرسال أمر الطباعة".to_string());
        }
        if data.is_empty() {
            return Err("بيانات الطباعة فارغة".to_string());
        }
        tauri::async_runtime::spawn_blocking(move || print_spooler_raw(&printer_name, &data))
            .await
            .map_err(|e| format!("فشل تشغيل مهمة الطباعة: {e}"))?
    }
    #[tauri::command]
    pub async fn print_network_raw(
        ip: String,
        port: u16,
        timeout_ms: u64,
        data: Vec<u8>,
    ) -> Result<PrintResult, String> {
        if data.is_empty() {
            return Err("بيانات الطباعة فارغة".to_string());
        }
        let parsed = ip
            .parse::<std::net::Ipv4Addr>()
            .map_err(|_| "عنوان IP يجب أن يكون IPv4 صالحاً".to_string())?;
        let octets = parsed.octets();
        if !(octets[0] == 10
            || (octets[0] == 172 && (16..=31).contains(&octets[1]))
            || (octets[0] == 192 && octets[1] == 168))
        {
            return Err("يسمح بالطباعة الشبكية داخل عناوين RFC1918 الخاصة فقط".to_string());
        }
        tauri::async_runtime::spawn_blocking(move || {
            printer::print_network_raw(
                &ip,
                if port == 0 { 9100 } else { port },
                if timeout_ms == 0 { 5000 } else { timeout_ms },
                &data,
            )
        })
        .await
        .map_err(|e| format!("فشل تشغيل مهمة الطباعة الشبكية: {e}"))?
    }
    #[tauri::command]
    pub fn list_windows_printers() -> Result<Vec<WindowsPrinterInfo>, String> {
        enumerate_windows_printers()
    }
    #[tauri::command]
    pub fn get_app_data_path(app: tauri::AppHandle) -> Result<String, String> {
        Ok(app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .into_owned())
    }
}

#[derive(serde::Serialize)]
struct DbRunResult {
    rows_affected: u64,
    last_insert_id: i64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DbState(Mutex::new(None)))
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(Target::new(TargetKind::LogDir {
                    file_name: Some("nasaq-pos".to_string()),
                }))
                .max_file_size(2 * 1024 * 1024)
                .rotation_strategy(RotationStrategy::KeepSome(7))
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| std::io::Error::other(e.to_string()))?;
            fs::create_dir_all(app_dir.join("data"))?;
            fs::create_dir_all(app_dir.join("backups"))?;
            fs::create_dir_all(app_dir.join("logs"))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::export_support_log,
            commands::activation_read,
            commands::activation_write,
            commands::db_init,
            commands::db_reset_transaction,
            commands::db_exec,
            commands::db_query,
            commands::db_export_bytes,
            commands::db_load_bytes,
            commands::print_raw,
            commands::print_network_raw,
            commands::list_windows_printers,
            commands::get_app_data_path
        ])
        .run(tauri::generate_context!())
        .expect("خطأ أثناء تشغيل تطبيق سطح المكتب NASAQ POS");
}

#[cfg(test)]
mod db_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_TEST: AtomicUsize = AtomicUsize::new(0);

    fn test_path(label: &str) -> PathBuf {
        let serial = NEXT_TEST.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!("nasaq-{label}-{}-{serial}.db", std::process::id()))
    }

    fn clean(path: &Path) {
        let _ = fs::remove_file(path);
        remove_sqlite_sidecars(path);
        let _ = fs::remove_file(path.with_extension("db.restore"));
        let _ = fs::remove_file(path.with_extension("db.pre-restore"));
        let _ = fs::remove_file(path.with_extension("db.backup-temp"));
    }

    fn make_database(path: &Path, value: &str) -> Vec<u8> {
        clean(path);
        let conn = Connection::open(path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON; CREATE TABLE items(value TEXT NOT NULL);")
            .unwrap();
        conn.execute("INSERT INTO items(value) VALUES (?1);", [value])
            .unwrap();
        drop(conn);
        fs::read(path).unwrap()
    }

    #[test]
    fn reset_transaction_rolls_back_incomplete_work_and_allows_new_transaction() {
        let path = test_path("reset");
        clean(&path);
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("CREATE TABLE items(value TEXT);")
            .unwrap();
        conn.execute_batch("BEGIN; INSERT INTO items VALUES ('uncommitted');")
            .unwrap();
        assert!(!conn.is_autocommit());
        configure_connection(&conn).unwrap();
        assert!(conn.is_autocommit());
        conn.execute_batch("BEGIN; INSERT INTO items VALUES ('committed'); COMMIT;")
            .unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM items;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        clean(&path);
    }

    #[test]
    fn execute_handles_row_returning_pragmas_and_insert_returning() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT);",
        )
        .unwrap();
        assert_eq!(
            execute_statement(&conn, "PRAGMA journal_mode=WAL", &[]).unwrap(),
            1
        );
        conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
        assert_eq!(
            execute_statement(&conn, "PRAGMA wal_checkpoint(TRUNCATE)", &[]).unwrap(),
            1
        );
        assert_eq!(
            execute_statement(
                &conn,
                "INSERT INTO items(value) VALUES ('x') RETURNING id",
                &[]
            )
            .unwrap(),
            1
        );
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM items;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn corrupt_restore_keeps_current_database_usable() {
        let path = test_path("corrupt");
        let _ = make_database(&path, "old");
        let mut current = Some(open_configured(&path).unwrap());
        let result = restore_database(&path, &mut current, b"not a sqlite database", false);
        assert!(result.is_err());
        let conn = current.as_ref().expect("current connection must remain");
        let value: String = conn
            .query_row("SELECT value FROM items;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "old");
        assert!(restore_database(&path, &mut current, &[], false).is_err());
        let value: String = current
            .as_ref()
            .unwrap()
            .query_row("SELECT value FROM items;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "old");
        drop(current);
        clean(&path);
    }

    #[test]
    fn valid_restore_replaces_database_contents() {
        let path = test_path("valid");
        let _ = make_database(&path, "old");
        let new_path = test_path("new");
        let new_bytes = make_database(&new_path, "new");
        let mut current = Some(open_configured(&path).unwrap());
        restore_database(&path, &mut current, &new_bytes, false).unwrap();
        let value: String = current
            .as_ref()
            .unwrap()
            .query_row("SELECT value FROM items;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "new");
        drop(current);
        clean(&path);
        clean(&new_path);
    }

    #[test]
    fn failed_restore_after_swap_rolls_back_to_previous_database() {
        let path = test_path("rollback");
        let _ = make_database(&path, "old");
        let new_path = test_path("rollback-new");
        let new_bytes = make_database(&new_path, "new");
        let mut current = Some(open_configured(&path).unwrap());
        let result = restore_database(&path, &mut current, &new_bytes, true);
        assert!(result.is_err());
        let conn = current.as_ref().expect("rollback must reopen previous DB");
        let value: String = conn
            .query_row("SELECT value FROM items;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "old");
        drop(current);
        clean(&path);
        clean(&new_path);
    }

    #[test]
    fn backup_uses_vacuum_into_snapshot() {
        let path = test_path("backup");
        clean(&path);
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE items(value TEXT); INSERT INTO items VALUES ('snapshot');",
        )
        .unwrap();
        let bytes = export_snapshot(&conn, &path).unwrap();
        assert!(!bytes.is_empty());
        let temp = path.with_extension("db.backup-temp");
        assert!(!temp.exists());
        clean(&path);
    }

    #[test]
    fn activation_write_then_read_returns_same_content() {
        let path = test_path("activation");
        clean(&path);
        let content = r#"{"deviceId":"NQ-TEST","key":"NQ2.x.y"}"#;
        write_activation_file(&path, content).unwrap();
        assert_eq!(read_activation_file(&path).unwrap().as_deref(), Some(content));
        assert!(!path.with_file_name(format!("{}.tmp", path.file_name().unwrap().to_string_lossy())).exists());
        clean(&path);
    }

    #[test]
    fn activation_overwrite_leaves_no_temp_file() {
        let path = test_path("activation-overwrite");
        clean(&path);
        write_activation_file(&path, r#"{"v":1}"#).unwrap();
        write_activation_file(&path, r#"{"v":2}"#).unwrap();
        assert_eq!(read_activation_file(&path).unwrap().unwrap(), r#"{"v":2}"#);
        assert!(!path.with_file_name(format!("{}.tmp", path.file_name().unwrap().to_string_lossy())).exists());
        clean(&path);
    }

    #[test]
    fn activation_rejects_corrupt_json() {
        let path = test_path("activation-corrupt");
        clean(&path);
        fs::write(&path, b"{broken").unwrap();
        assert!(read_activation_file(&path).is_err());
        clean(&path);
    }

    #[test]
    fn support_log_export_has_header_and_redacts_secrets() {
        let dir = std::env::temp_dir().join(format!("nasaq-log-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("old.log"), "ordinary\nNQ2.secret\npassword_hash=bad").unwrap();
        let result = build_support_log(&dir, "2026-10-11T00:00:00Z", "windows-test").unwrap();
        assert!(result.contains("إصدار التطبيق: 1.0.2"));
        assert!(result.contains("إصدار Windows: windows-test"));
        assert!(!result.contains("NQ2."));
        assert!(!result.contains("password_hash"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn activation_rejects_oversized_content() {
        let path = test_path("activation-large");
        clean(&path);
        let content = format!("{{\"value\":\"{}\"}}", "x".repeat(ACTIVATION_MAX_BYTES));
        assert!(write_activation_file(&path, &content).is_err());
        assert!(!path.exists());
        clean(&path);
    }
}
