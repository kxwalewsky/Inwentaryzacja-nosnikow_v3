use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, sync::Mutex};
use tauri::{Manager, State};
use uuid::Uuid;

struct AppState { conn: Mutex<Connection>, app_dir: PathBuf }

type CmdResult<T> = Result<T, String>;

#[derive(Debug, Serialize)]
struct StoreModel { id: i64, name: String, description: String, image_path: String, image_thumb_path: String, image_data_url: Option<String>, image_thumb_data_url: Option<String>, created_at: String, updated_at: String }
#[derive(Debug, Serialize)]
struct Category { id: i64, name: String, description: String, store_model_id: i64, display_order: i64, created_at: String, updated_at: String }
#[derive(Debug, Serialize)]
struct Tag { id: i64, name: String, description: String, carrier_count: i64, photo_count: i64 }
#[derive(Debug, Serialize)]
struct CarrierModelLink { store_model_id: i64, store_model_name: String, category_id: i64, category_name: String, display_order: i64 }
#[derive(Debug, Serialize)]
struct Carrier { id: i64, public_id: String, own_name: String, warehouse_name: String, description: String, width: f64, height: f64, depth: f64, unit: String, store_model_id: i64, category_id: i64, store_model_name: String, category_name: String, model_links: Vec<CarrierModelLink>, tags: Vec<TagLite>, created_at: String, updated_at: String }
#[derive(Debug, Serialize, Clone)]
struct TagLite { id: i64, name: String }
#[derive(Debug, Serialize)]
struct Photo { id: i64, file_name: String, file_path: String, thumb_path: String, description: String, tags: Vec<TagLite>, created_at: String, data_url: Option<String>, thumb_data_url: Option<String> }
#[derive(Debug, Deserialize)]
struct CarrierModelInput { store_model_id: i64, category_id: i64 }
#[derive(Debug, Deserialize)]
struct CarrierInput { own_name: String, warehouse_name: String, description: String, width: f64, height: f64, depth: f64, unit: String, store_model_id: i64, category_id: i64, model_links: Vec<CarrierModelInput>, tag_ids: Vec<i64> }

fn now() -> String { Utc::now().to_rfc3339() }
fn map_err<E: std::fmt::Display>(e: E) -> String { e.to_string() }

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> rusqlite::Result<()> {
    let sql = format!("PRAGMA table_info({})", table);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
    let mut exists = false;
    for row in rows { if row? == column { exists = true; break; } }
    if !exists { conn.execute(&format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, definition), [])?; }
    Ok(())
}

fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(r#"
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS store_models (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', store_model_id INTEGER NOT NULL, display_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(store_model_id) REFERENCES store_models(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS carriers (id INTEGER PRIMARY KEY AUTOINCREMENT, public_id TEXT NOT NULL UNIQUE, own_name TEXT NOT NULL, warehouse_name TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', width REAL NOT NULL DEFAULT 0, height REAL NOT NULL DEFAULT 0, depth REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'mm', store_model_id INTEGER NOT NULL, category_id INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(store_model_id) REFERENCES store_models(id) ON DELETE CASCADE, FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, file_name TEXT NOT NULL, file_path TEXT NOT NULL, thumb_path TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS carrier_tags (carrier_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY(carrier_id, tag_id), FOREIGN KEY(carrier_id) REFERENCES carriers(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS photo_tags (photo_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY(photo_id, tag_id), FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS carrier_models (carrier_id INTEGER NOT NULL, store_model_id INTEGER NOT NULL, category_id INTEGER NOT NULL, PRIMARY KEY(carrier_id, store_model_id), FOREIGN KEY(carrier_id) REFERENCES carriers(id) ON DELETE CASCADE, FOREIGN KEY(store_model_id) REFERENCES store_models(id) ON DELETE CASCADE, FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE);
    "#)?;
    ensure_column(conn, "store_models", "image_path", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(conn, "store_models", "image_thumb_path", "TEXT NOT NULL DEFAULT ''")?;
    conn.execute("INSERT OR IGNORE INTO carrier_models(carrier_id, store_model_id, category_id) SELECT id, store_model_id, category_id FROM carriers", [])?;
    seed_data(conn)?;
    Ok(())
}

fn seed_data(conn: &Connection) -> rusqlite::Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM store_models", [], |r| r.get(0))?;
    if count > 0 { return Ok(()); }
    let t = now();
    conn.execute("INSERT INTO store_models(name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)", params!["Model flagowy", "Przykładowy model sklepu do testów", t])?;
    conn.execute("INSERT INTO categories(name, description, store_model_id, display_order, created_at, updated_at) VALUES (?1, ?2, 1, 1, ?3, ?3)", params!["Ekspozytory", "Materiały i meble ekspozycyjne", t])?;
    conn.execute("INSERT INTO categories(name, description, store_model_id, display_order, created_at, updated_at) VALUES (?1, ?2, 1, 2, ?3, ?3)", params!["Materiały POS", "Listwy, wobblery, plakaty", t])?;
    for (name, desc) in [("ekspozytor-a1", "Wspólny tag testowy"), ("premium", "Element premium"), ("lada", "Strefa kasowa")] {
        conn.execute("INSERT INTO tags(name, description) VALUES (?1, ?2)", params![name, desc])?;
    }
    conn.execute("INSERT INTO carriers(public_id, own_name, warehouse_name, description, width, height, depth, unit, store_model_id, category_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 60, 180, 40, 'cm', 1, 1, ?5, ?5)", params!["POS-000001", "Ekspozytor wolnostojący A1", "EXP-A1", "Przykładowy nośnik. Zdjęcia z tagiem ekspozytor-a1 pojawią się automatycznie w galerii.", t])?;
    conn.execute("INSERT INTO carrier_models(carrier_id, store_model_id, category_id) VALUES (1, 1, 1)", [])?;
    conn.execute("INSERT INTO carrier_tags(carrier_id, tag_id) VALUES (1, 1), (1, 2)", [])?;
    Ok(())
}

fn get_tags_for(conn: &Connection, table: &str, id_col: &str, item_id: i64) -> rusqlite::Result<Vec<TagLite>> {
    let sql = format!("SELECT t.id, t.name FROM tags t JOIN {} x ON x.tag_id=t.id WHERE x.{}=?1 ORDER BY t.name", table, id_col);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([item_id], |r| Ok(TagLite { id: r.get(0)?, name: r.get(1)? }))?;
    let result = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(result)
}

fn set_tags(conn: &Connection, table: &str, id_col: &str, item_id: i64, tag_ids: Vec<i64>) -> rusqlite::Result<()> {
    let del = format!("DELETE FROM {} WHERE {}=?1", table, id_col);
    conn.execute(&del, [item_id])?;
    let ins = format!("INSERT OR IGNORE INTO {}({}, tag_id) VALUES (?1, ?2)", table, id_col);
    for tag_id in tag_ids { conn.execute(&ins, params![item_id, tag_id])?; }
    Ok(())
}

fn get_model_links(conn: &Connection, carrier_id: i64) -> rusqlite::Result<Vec<CarrierModelLink>> {
    let mut stmt = conn.prepare("SELECT cm.store_model_id, sm.name, cm.category_id, cat.name, cat.display_order FROM carrier_models cm JOIN store_models sm ON sm.id=cm.store_model_id JOIN categories cat ON cat.id=cm.category_id WHERE cm.carrier_id=?1 ORDER BY cat.display_order, cat.name, sm.name")?;
    let rows = stmt.query_map([carrier_id], |r| Ok(CarrierModelLink { store_model_id: r.get(0)?, store_model_name: r.get(1)?, category_id: r.get(2)?, category_name: r.get(3)?, display_order: r.get(4)? }))?;
    let result = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(result)
}

fn set_model_links(conn: &Connection, carrier_id: i64, links: Vec<CarrierModelInput>) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM carrier_models WHERE carrier_id=?1", [carrier_id])?;
    for link in links { conn.execute("INSERT OR IGNORE INTO carrier_models(carrier_id, store_model_id, category_id) VALUES (?1, ?2, ?3)", params![carrier_id, link.store_model_id, link.category_id])?; }
    Ok(())
}

fn photo_to_data_url(path: &str) -> Option<String> {
    if path.trim().is_empty() { return None; }
    let bytes = fs::read(path).ok()?;
    let mime = match Path::new(path).extension()?.to_string_lossy().to_ascii_lowercase().as_str() { "png" => "image/png", "webp" => "image/webp", _ => "image/jpeg" };
    Some(format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(bytes)))
}

fn copy_image_to_folder(source_path: &str, folder: &Path) -> CmdResult<(String, String)> {
    let source = PathBuf::from(source_path);
    let ext = source.extension().and_then(|s| s.to_str()).unwrap_or("jpg");
    fs::create_dir_all(folder).map_err(map_err)?;
    let thumb_dir = folder.parent().unwrap_or(folder).join("thumbs");
    fs::create_dir_all(&thumb_dir).map_err(map_err)?;
    let file_name = format!("{}.{}", Uuid::new_v4(), ext);
    let dest = folder.join(&file_name);
    fs::copy(&source, &dest).map_err(map_err)?;
    let thumb = thumb_dir.join(&file_name);
    if let Ok(img) = image::open(&dest) { let thumb_img = img.thumbnail(600, 600); let _ = thumb_img.save(&thumb); } else { fs::copy(&dest, &thumb).map_err(map_err)?; }
    Ok((dest.to_string_lossy().to_string(), thumb.to_string_lossy().to_string()))
}

#[tauri::command]
fn list_store_models(state: State<AppState>) -> CmdResult<Vec<StoreModel>> {
    let conn = state.conn.lock().map_err(map_err)?;
    let mut stmt = conn.prepare("SELECT id, name, description, image_path, image_thumb_path, created_at, updated_at FROM store_models ORDER BY name").map_err(map_err)?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_,i64>(0)?, r.get::<_,String>(1)?, r.get::<_,String>(2)?, r.get::<_,String>(3)?, r.get::<_,String>(4)?, r.get::<_,String>(5)?, r.get::<_,String>(6)?))).map_err(map_err)?;
    let mut out = Vec::new();
    for row in rows {
        let (id, name, description, image_path, image_thumb_path, created_at, updated_at) = row.map_err(map_err)?;
        out.push(StoreModel { id, name, description, image_data_url: photo_to_data_url(&image_path), image_thumb_data_url: photo_to_data_url(&image_thumb_path), image_path, image_thumb_path, created_at, updated_at });
    }
    Ok(out)
}

#[tauri::command]
fn save_store_model(state: State<AppState>, id: Option<i64>, name: String, description: String, image_source_path: Option<String>) -> CmdResult<i64> {
    let conn = state.conn.lock().map_err(map_err)?;
    let t = now();
    let image_paths = if let Some(source) = image_source_path.filter(|s| !s.trim().is_empty()) { Some(copy_image_to_folder(&source, &state.app_dir.join("model_photos"))?) } else { None };
    match id {
        Some(id) => {
            if let Some((image_path, image_thumb_path)) = image_paths {
                conn.execute("UPDATE store_models SET name=?1, description=?2, image_path=?3, image_thumb_path=?4, updated_at=?5 WHERE id=?6", params![name, description, image_path, image_thumb_path, t, id]).map_err(map_err)?;
            } else {
                conn.execute("UPDATE store_models SET name=?1, description=?2, updated_at=?3 WHERE id=?4", params![name, description, t, id]).map_err(map_err)?;
            }
            Ok(id)
        },
        None => {
            let (image_path, image_thumb_path) = image_paths.unwrap_or((String::new(), String::new()));
            conn.execute("INSERT INTO store_models(name, description, image_path, image_thumb_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)", params![name, description, image_path, image_thumb_path, t]).map_err(map_err)?;
            Ok(conn.last_insert_rowid())
        }
    }
}

#[tauri::command]
fn delete_store_model(state: State<AppState>, id: i64) -> CmdResult<()> { state.conn.lock().map_err(map_err)?.execute("DELETE FROM store_models WHERE id=?1", [id]).map_err(map_err)?; Ok(()) }

#[tauri::command]
fn list_categories(state: State<AppState>, store_model_id: Option<i64>) -> CmdResult<Vec<Category>> {
    let conn = state.conn.lock().map_err(map_err)?;
    let map_category = |r: &rusqlite::Row<'_>| Ok(Category { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, store_model_id: r.get(3)?, display_order: r.get(4)?, created_at: r.get(5)?, updated_at: r.get(6)? });
    if let Some(mid) = store_model_id {
        let mut stmt = conn.prepare("SELECT id, name, description, store_model_id, display_order, created_at, updated_at FROM categories WHERE store_model_id=?1 ORDER BY display_order, name").map_err(map_err)?;
        let rows = stmt.query_map([mid], map_category).map_err(map_err)?;
        let result = rows.collect::<Result<Vec<_>, _>>().map_err(map_err)?;
        Ok(result)
    } else {
        let mut stmt = conn.prepare("SELECT id, name, description, store_model_id, display_order, created_at, updated_at FROM categories ORDER BY display_order, name").map_err(map_err)?;
        let rows = stmt.query_map([], map_category).map_err(map_err)?;
        let result = rows.collect::<Result<Vec<_>, _>>().map_err(map_err)?;
        Ok(result)
    }
}

#[tauri::command]
fn save_category(state: State<AppState>, id: Option<i64>, name: String, description: String, store_model_id: i64, display_order: i64) -> CmdResult<i64> {
    let conn = state.conn.lock().map_err(map_err)?; let t = now();
    match id { Some(id) => { conn.execute("UPDATE categories SET name=?1, description=?2, store_model_id=?3, display_order=?4, updated_at=?5 WHERE id=?6", params![name, description, store_model_id, display_order, t, id]).map_err(map_err)?; Ok(id) }, None => { conn.execute("INSERT INTO categories(name, description, store_model_id, display_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)", params![name, description, store_model_id, display_order, t]).map_err(map_err)?; Ok(conn.last_insert_rowid()) } }
}
#[tauri::command]
fn delete_category(state: State<AppState>, id: i64) -> CmdResult<()> { state.conn.lock().map_err(map_err)?.execute("DELETE FROM categories WHERE id=?1", [id]).map_err(map_err)?; Ok(()) }

#[tauri::command]
fn list_tags(state: State<AppState>) -> CmdResult<Vec<Tag>> {
    let conn = state.conn.lock().map_err(map_err)?;
    let mut stmt = conn.prepare("SELECT t.id,t.name,t.description,(SELECT COUNT(*) FROM carrier_tags ct WHERE ct.tag_id=t.id),(SELECT COUNT(*) FROM photo_tags pt WHERE pt.tag_id=t.id) FROM tags t ORDER BY t.name").map_err(map_err)?;
    let rows = stmt.query_map([], |r| Ok(Tag { id:r.get(0)?, name:r.get(1)?, description:r.get(2)?, carrier_count:r.get(3)?, photo_count:r.get(4)? })).map_err(map_err)?;
    let result = rows.collect::<Result<Vec<_>, _>>().map_err(map_err)?;
    Ok(result)
}
#[tauri::command]
fn save_tag(state: State<AppState>, id: Option<i64>, name: String, description: String) -> CmdResult<i64> {
    let conn = state.conn.lock().map_err(map_err)?;
    match id { Some(id) => { conn.execute("UPDATE tags SET name=?1, description=?2 WHERE id=?3", params![name, description, id]).map_err(map_err)?; Ok(id) }, None => { conn.execute("INSERT INTO tags(name, description) VALUES (?1, ?2)", params![name, description]).map_err(map_err)?; Ok(conn.last_insert_rowid()) } }
}
#[tauri::command]
fn delete_tag(state: State<AppState>, id: i64) -> CmdResult<()> { state.conn.lock().map_err(map_err)?.execute("DELETE FROM tags WHERE id=?1", [id]).map_err(map_err)?; Ok(()) }

#[tauri::command]
fn list_carriers(state: State<AppState>, store_model_id: Option<i64>, category_id: Option<i64>, search: Option<String>, tag_id: Option<i64>) -> CmdResult<Vec<Carrier>> {
    let conn = state.conn.lock().map_err(map_err)?;
    let mut sql = "SELECT DISTINCT c.id,c.public_id,c.own_name,c.warehouse_name,c.description,c.width,c.height,c.depth,c.unit,c.store_model_id,c.category_id,sm.name,cat.name,c.created_at,c.updated_at FROM carriers c JOIN carrier_models cm ON cm.carrier_id=c.id JOIN store_models sm ON sm.id=cm.store_model_id JOIN categories cat ON cat.id=cm.category_id WHERE 1=1".to_string();
    let mut conds: Vec<String> = Vec::new();
    if let Some(mid) = store_model_id { conds.push(format!("cm.store_model_id={}", mid)); }
    if let Some(cid) = category_id { conds.push(format!("cm.category_id={}", cid)); }
    if let Some(tid) = tag_id { conds.push(format!("EXISTS (SELECT 1 FROM carrier_tags ct WHERE ct.carrier_id=c.id AND ct.tag_id={})", tid)); }
    if let Some(s) = search.filter(|x| !x.trim().is_empty()) { let escaped = s.replace('\'', "").replace('"', ""); conds.push(format!("(c.own_name LIKE '%{}%' OR c.warehouse_name LIKE '%{}%' OR c.public_id LIKE '%{}%')", escaped, escaped, escaped)); }
    if !conds.is_empty() { sql.push_str(" AND "); sql.push_str(&conds.join(" AND ")); }
    sql.push_str(" GROUP BY c.id ORDER BY MIN(cat.display_order), MIN(cat.name), c.own_name");
    let mut stmt = conn.prepare(&sql).map_err(map_err)?;
    let mut rows = stmt.query([]).map_err(map_err)?;
    let mut out = Vec::new();
    while let Some(r) = rows.next().map_err(map_err)? {
        let id: i64 = r.get(0).map_err(map_err)?;
        out.push(Carrier { id, public_id:r.get(1).map_err(map_err)?, own_name:r.get(2).map_err(map_err)?, warehouse_name:r.get(3).map_err(map_err)?, description:r.get(4).map_err(map_err)?, width:r.get(5).map_err(map_err)?, height:r.get(6).map_err(map_err)?, depth:r.get(7).map_err(map_err)?, unit:r.get(8).map_err(map_err)?, store_model_id:r.get(9).map_err(map_err)?, category_id:r.get(10).map_err(map_err)?, store_model_name:r.get(11).map_err(map_err)?, category_name:r.get(12).map_err(map_err)?, created_at:r.get(13).map_err(map_err)?, updated_at:r.get(14).map_err(map_err)?, model_links:get_model_links(&conn, id).map_err(map_err)?, tags:get_tags_for(&conn, "carrier_tags", "carrier_id", id).map_err(map_err)? });
    }
    Ok(out)
}

#[tauri::command]
fn save_carrier(state: State<AppState>, id: Option<i64>, input: CarrierInput) -> CmdResult<i64> {
    let conn = state.conn.lock().map_err(map_err)?; let t = now();
    let links = if input.model_links.is_empty() { vec![CarrierModelInput { store_model_id: input.store_model_id, category_id: input.category_id }] } else { input.model_links };
    let first = links.first().ok_or_else(|| "Wybierz przynajmniej jeden model sklepu.".to_string())?;
    let item_id = match id {
        Some(id) => { conn.execute("UPDATE carriers SET own_name=?1, warehouse_name=?2, description=?3, width=?4, height=?5, depth=?6, unit=?7, store_model_id=?8, category_id=?9, updated_at=?10 WHERE id=?11", params![input.own_name,input.warehouse_name,input.description,input.width,input.height,input.depth,input.unit,first.store_model_id,first.category_id,t,id]).map_err(map_err)?; id },
        None => { let next: i64 = conn.query_row("SELECT COALESCE(MAX(id),0)+1 FROM carriers", [], |r| r.get(0)).map_err(map_err)?; let public_id = format!("POS-{:06}", next); conn.execute("INSERT INTO carriers(public_id, own_name, warehouse_name, description, width, height, depth, unit, store_model_id, category_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)", params![public_id,input.own_name,input.warehouse_name,input.description,input.width,input.height,input.depth,input.unit,first.store_model_id,first.category_id,t]).map_err(map_err)?; conn.last_insert_rowid() }
    };
    set_model_links(&conn, item_id, links).map_err(map_err)?;
    set_tags(&conn, "carrier_tags", "carrier_id", item_id, input.tag_ids).map_err(map_err)?;
    Ok(item_id)
}
#[tauri::command]
fn delete_carrier(state: State<AppState>, id: i64) -> CmdResult<()> { state.conn.lock().map_err(map_err)?.execute("DELETE FROM carriers WHERE id=?1", [id]).map_err(map_err)?; Ok(()) }

#[tauri::command]
fn add_photo(state: State<AppState>, source_path: String, name: Option<String>, description: String, tag_ids: Vec<i64>) -> CmdResult<i64> {
    let conn = state.conn.lock().map_err(map_err)?;
    let source = PathBuf::from(&source_path);
    let display_name = name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| source.file_name().and_then(|s| s.to_str()).unwrap_or("zdjecie").to_string());
    let (file_path, thumb_path) = copy_image_to_folder(&source_path, &state.app_dir.join("photos"))?;
    let t = now();
    conn.execute("INSERT INTO photos(file_name,file_path,thumb_path,description,created_at) VALUES (?1,?2,?3,?4,?5)", params![display_name, file_path, thumb_path, description, t]).map_err(map_err)?;
    let id = conn.last_insert_rowid(); set_tags(&conn, "photo_tags", "photo_id", id, tag_ids).map_err(map_err)?; Ok(id)
}

#[tauri::command]
fn list_photos(state: State<AppState>) -> CmdResult<Vec<Photo>> {
    let conn = state.conn.lock().map_err(map_err)?;
    let mut stmt = conn.prepare("SELECT id,file_name,file_path,thumb_path,description,created_at FROM photos ORDER BY created_at DESC").map_err(map_err)?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_,i64>(0)?, r.get::<_,String>(1)?, r.get::<_,String>(2)?, r.get::<_,String>(3)?, r.get::<_,String>(4)?, r.get::<_,String>(5)?))).map_err(map_err)?;
    let mut out = Vec::new();
    for row in rows { let (id,file_name,file_path,thumb_path,description,created_at)=row.map_err(map_err)?; out.push(Photo { id, file_name, file_path: file_path.clone(), thumb_path: thumb_path.clone(), description, tags: get_tags_for(&conn,"photo_tags","photo_id",id).map_err(map_err)?, created_at, data_url: None, thumb_data_url: photo_to_data_url(&thumb_path) }); }
    Ok(out)
}

#[tauri::command]
fn update_photo(state: State<AppState>, id: i64, name: String, description: String, tag_ids: Vec<i64>) -> CmdResult<()> { let conn = state.conn.lock().map_err(map_err)?; conn.execute("UPDATE photos SET file_name=?1, description=?2 WHERE id=?3", params![name, description, id]).map_err(map_err)?; set_tags(&conn,"photo_tags","photo_id",id,tag_ids).map_err(map_err)?; Ok(()) }
#[tauri::command]
fn delete_photo(state: State<AppState>, id: i64) -> CmdResult<()> { let conn = state.conn.lock().map_err(map_err)?; let paths: Option<(String,String)> = conn.query_row("SELECT file_path, thumb_path FROM photos WHERE id=?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(map_err)?; conn.execute("DELETE FROM photos WHERE id=?1", [id]).map_err(map_err)?; if let Some((p,t)) = paths { let _=fs::remove_file(p); let _=fs::remove_file(t); } Ok(()) }

#[tauri::command]
fn get_carrier_photos(state: State<AppState>, carrier_id: i64) -> CmdResult<Vec<Photo>> {
    let conn = state.conn.lock().map_err(map_err)?;
    let mut stmt = conn.prepare("SELECT DISTINCT p.id,p.file_name,p.file_path,p.thumb_path,p.description,p.created_at FROM photos p JOIN photo_tags pt ON pt.photo_id=p.id JOIN carrier_tags ct ON ct.tag_id=pt.tag_id WHERE ct.carrier_id=?1 ORDER BY p.created_at ASC").map_err(map_err)?;
    let rows = stmt.query_map([carrier_id], |r| Ok((r.get::<_,i64>(0)?, r.get::<_,String>(1)?, r.get::<_,String>(2)?, r.get::<_,String>(3)?, r.get::<_,String>(4)?, r.get::<_,String>(5)?))).map_err(map_err)?;
    let mut out = Vec::new();
    for row in rows { let (id,file_name,file_path,thumb_path,description,created_at)=row.map_err(map_err)?; out.push(Photo { id, file_name, file_path: file_path.clone(), thumb_path: thumb_path.clone(), description, tags: get_tags_for(&conn,"photo_tags","photo_id",id).map_err(map_err)?, created_at, data_url: photo_to_data_url(&file_path), thumb_data_url: photo_to_data_url(&thumb_path) }); }
    Ok(out)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().map_err(|e| anyhow::anyhow!(e))?;
            fs::create_dir_all(&app_dir)?; fs::create_dir_all(app_dir.join("photos"))?; fs::create_dir_all(app_dir.join("thumbs"))?; fs::create_dir_all(app_dir.join("model_photos"))?;
            let conn = Connection::open(app_dir.join("pos_inventory.sqlite"))?;
            init_schema(&conn)?;
            app.manage(AppState { conn: Mutex::new(conn), app_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_store_models, save_store_model, delete_store_model, list_categories, save_category, delete_category, list_tags, save_tag, delete_tag, list_carriers, save_carrier, delete_carrier, add_photo, list_photos, update_photo, delete_photo, get_carrier_photos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
