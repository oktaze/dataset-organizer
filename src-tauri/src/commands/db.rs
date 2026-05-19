//! SQLite layer (rusqlite, bundled). Generic query/execute IPC so the
//! frontend owns all business logic (per CLAUDE.md conventions).

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::Connection;
use serde_json::{Map, Value};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

/// `Arc<Mutex<_>>` so async commands can move a handle into
/// `spawn_blocking` and keep SQLite work off the main (UI) thread.
pub struct DbState(pub Arc<Mutex<Connection>>);

const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('character','style','concept')),
  trigger     TEXT NOT NULL,
  base_model  TEXT DEFAULT 'illustrious-xl',
  created_at  INTEGER,
  updated_at  INTEGER
);

CREATE TABLE IF NOT EXISTS costumes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  trigger     TEXT,
  tags        TEXT NOT NULL,
  color_tags  TEXT,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS images (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  costume_id    TEXT REFERENCES costumes(id),
  filename      TEXT NOT NULL,
  filepath      TEXT NOT NULL,
  width         INTEGER,
  height        INTEGER,
  tags_auto     TEXT,
  tags_final    TEXT,
  caption       TEXT,
  costume_score TEXT,
  status        TEXT DEFAULT 'pending' CHECK(status IN ('pending','tagged','validated','exported')),
  created_at    INTEGER
);

CREATE TABLE IF NOT EXISTS character_constant_tags (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL
);

-- Style/Concept: tags always prepended to every caption (after trigger),
-- e.g. medium / artist_style / source.
CREATE TABLE IF NOT EXISTS project_tags (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0
);
"#;

/// Schema migrations, applied in order. Index `i` is schema version `i + 1`
/// and runs only when the DB's `PRAGMA user_version` is below it. The v1
/// baseline is the full `CREATE TABLE IF NOT EXISTS` schema, idempotent so
/// pre-versioning installs (`user_version = 0`) upgrade cleanly. Future
/// schema changes append a new self-contained DDL string here — never edit
/// or reorder existing entries.
const MIGRATIONS: &[&str] = &[
    // v1 — baseline schema.
    SCHEMA,
];

/// Open the DB in the app data dir and run pending versioned migrations.
pub fn init(app: &AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    let db_path = dir.join("dataset-organizer.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("open db: {e}"))?;

    let mut version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| format!("read user_version: {e}"))?;
    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let target = (i + 1) as i64;
        if version < target {
            conn.execute_batch(sql)
                .map_err(|e| format!("migrate v{target}: {e}"))?;
            // `PRAGMA user_version =` cannot be parameterized; `target` is a
            // loop-derived integer, so the format! is injection-safe.
            conn.execute_batch(&format!("PRAGMA user_version = {target}"))
                .map_err(|e| format!("set user_version {target}: {e}"))?;
            version = target;
        }
    }
    Ok(conn)
}

fn json_to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                SqlValue::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        // Arrays/objects (JSON-as-TEXT columns) serialized to a string.
        other => SqlValue::Text(other.to_string()),
    }
}

fn sql_to_json(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::Array(b.iter().map(|x| Value::from(*x)).collect()),
    }
}

// Async commands run off the main thread; the blocking SQLite work is
// further isolated in `spawn_blocking` so a slow query never freezes the UI.

#[tauri::command]
pub async fn db_query(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Value>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<Value>, String> {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let col_names: Vec<String> =
            stmt.column_names().into_iter().map(String::from).collect();
        let sql_params: Vec<SqlValue> =
            params.iter().map(json_to_sql).collect();

        let mut rows = stmt
            .query(rusqlite::params_from_iter(sql_params))
            .map_err(|e| e.to_string())?;

        let mut out: Vec<Value> = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let mut obj = Map::new();
            for (i, name) in col_names.iter().enumerate() {
                let vr = row.get_ref(i).map_err(|e| e.to_string())?;
                obj.insert(name.clone(), sql_to_json(vr));
            }
            out.push(Value::Object(obj));
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_execute(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<Value>,
) -> Result<usize, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<usize, String> {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let sql_params: Vec<SqlValue> =
            params.iter().map(json_to_sql).collect();
        conn.execute(&sql, rusqlite::params_from_iter(sql_params))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
