use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// Starts a one-shot loopback HTTP server for the OAuth (PKCE) redirect.
/// Binds the first free port from `ports` on 127.0.0.1, returns that port so the
/// frontend can build `redirectTo`, then (on a background thread) waits for the
/// browser redirect carrying `?code=…` and emits it to the frontend as the
/// `oauth-callback` event. No external plugin needed.
#[tauri::command]
fn oauth_start(app: AppHandle, ports: Vec<u16>) -> Result<u16, String> {
    let (port, listener) = ports
        .iter()
        .find_map(|&p| TcpListener::bind(("127.0.0.1", p)).ok().map(|l| (p, l)))
        .ok_or_else(|| "No loopback port available (8422–8424 all in use).".to_string())?;

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(s) => s,
                Err(_) => continue,
            };
            let mut buf = [0u8; 2048];
            let n = stream.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]);
            // First request line: "GET /?code=… HTTP/1.1"
            let target = req
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap_or("/")
                .to_string();

            if target.contains("code=") || target.contains("error=") {
                let body = "<!doctype html><html><head><meta charset=\"utf-8\">\
<title>Signed in</title></head>\
<body style=\"font-family:system-ui,-apple-system,sans-serif;text-align:center;\
padding-top:80px;color:#0f172a\">\
<h2>You're signed in</h2><p>You can close this window and return to Budget.</p>\
</body></html>";
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();
                let url = format!("http://localhost:{}{}", port, target);
                let _ = app.emit("oauth-callback", url);
                break; // one-shot: drop the listener, free the port
            } else {
                // Ignore favicon and other stray requests.
                let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
            }
        }
    });

    Ok(port)
}

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
            write_bytes,
            oauth_start
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
