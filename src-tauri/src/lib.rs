use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Returns the platform app data directory (e.g. %APPDATA%\com.casanova.budget on Windows).
#[tauri::command]
fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Reads the ledger file at the given absolute path.
/// Returns the raw JSON string, or an error if the file doesn't exist.
#[tauri::command]
fn read_ledger(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Writes raw bytes (supplied as base64) to `path` atomically.
/// Used for binary exports such as PDF.
#[tauri::command]
fn write_bytes(path: String, base64_content: String) -> Result<(), String> {
    use std::io::Write;
    let bytes = base64_decode(&base64_content).map_err(|e| e.to_string())?;
    let dest = PathBuf::from(&path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = dest.with_extension("tmp");
    let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    // Simple base64 decoder (no external crate needed)
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut map = [255u8; 256];
    for (i, &c) in TABLE.iter().enumerate() { map[c as usize] = i as u8; }
    let input = input.replace('\n', "").replace('\r', "");
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let bytes = input.as_bytes();
    let mut i = 0;
    while i + 3 < bytes.len() {
        let [a, b, c, d] = [map[bytes[i] as usize], map[bytes[i+1] as usize], map[bytes[i+2] as usize], map[bytes[i+3] as usize]];
        if a == 255 || b == 255 { break; }
        out.push((a << 2) | (b >> 4));
        if c != 255 && bytes[i+2] != b'=' { out.push((b << 4) | (c >> 2)); }
        if d != 255 && bytes[i+3] != b'=' { out.push((c << 6) | d); }
        i += 4;
    }
    Ok(out)
}

/// Atomically writes `content` to `path` via a temp file + rename.
/// Creates parent directories if they don't exist.
#[tauri::command]
fn write_ledger(path: String, content: String) -> Result<(), String> {
    let dest = PathBuf::from(&path);

    // Ensure parent directory exists
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Write to sibling temp file
    let tmp = dest.with_extension("tmp");
    fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;

    // Atomic rename (same filesystem — guaranteed on Windows and macOS)
    fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            read_ledger,
            write_ledger,
            write_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
