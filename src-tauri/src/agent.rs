
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const MAX_CAPTURE: usize = 24_000;
const HEAD_KEEP: usize = 6_000;

#[derive(Default)]
pub struct AgentState {
    running: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
    cancelled: Mutex<HashSet<String>>,
    guard: Mutex<bool>,
}

impl AgentState {
    pub fn new() -> Self {
        AgentState {
            running: Mutex::new(HashMap::new()),
            cancelled: Mutex::new(HashSet::new()),
            guard: Mutex::new(true),
        }
    }
}

const FORBIDDEN: &[&str] = &[
    "rm -rf /",
    "rm -rf /*",
    "rm -fr /",
    ":(){:|:&};:",
    "mkfs.",
    "dd if=/dev/zero of=/dev/",
    "dd if=/dev/random of=/dev/",
    "> /dev/sda",
    "format c:",
    "del /f /s /q c:\\",
    "rd /s /q c:\\",
    "diskpart",
    "cipher /w:c",
    "vssadmin delete shadows",
    "bcdedit /set",
    "reg delete hklm",
    "shutdown",
    "chmod -r 777 /",
    "chown -r",
    "history -c",
];

fn guard_verdict(cmd: &str) -> Option<String> {
    let flat = cmd.to_lowercase().replace('\u{a0}', " ");
    let squished = flat.split_whitespace().collect::<Vec<_>>().join(" ");
    for bad in FORBIDDEN {
        if squished.contains(bad) {
            return Some(format!(
                "BLOCKED by the Nexus agent guard: this command matches the destructive pattern \"{bad}\". \
                 It was not run. If this really is what you meant, tell the user what you want to run and why, \
                 and let them run it themselves or switch the guard off in Agent Mode."
            ));
        }
    }
    None
}

#[derive(Serialize, Clone)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
    pub end_reason: String,
    pub truncated: bool,
    pub duration_ms: u64,
    pub silent_ms: u64,
}

#[derive(Serialize, Clone)]
struct OutputEvent {
    run_id: String,
    stream: String, // "out" | "err"
    line: String,
}

fn shell_parts() -> (&'static str, &'static str) {
    if cfg!(target_os = "windows") {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    }
}

fn home() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into())
}

fn squeeze(s: String) -> (String, bool) {
    if s.len() <= MAX_CAPTURE {
        return (s, false);
    }
    let head_end = floor_boundary(&s, HEAD_KEEP);
    let tail_start = ceil_boundary(&s, s.len().saturating_sub(MAX_CAPTURE - HEAD_KEEP));

    let head = &s[..head_end];
    let tail = &s[tail_start..];
    let dropped = tail_start - head_end;

    (
        format!("{head}\n\n... [{dropped} bytes of output omitted from the middle] ...\n\n{tail}"),
        true,
    )
}

fn floor_boundary(s: &str, mut i: usize) -> usize {
    if i >= s.len() {
        return s.len();
    }
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn ceil_boundary(s: &str, mut i: usize) -> usize {
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

#[tauri::command(async)]
pub fn agent_exec(
    app: tauri::AppHandle,
    run_id: String,
    cmd: String,
    cwd: String,
    timeout_secs: Option<u64>,
    quiet_secs: Option<u64>,
) -> Result<ExecResult, String> {
    let state = app.state::<AgentState>();
    let started = Instant::now();

    if cmd.trim().is_empty() {
        return Err("Empty command.".into());
    }

    if state.cancelled.lock().unwrap().contains(&run_id) {
        return Err("Run was stopped by the user.".into());
    }

    if *state.guard.lock().unwrap() {
        if let Some(reason) = guard_verdict(&cmd) {
            let _ = app.emit(
                "agent:output",
                OutputEvent { run_id: run_id.clone(), stream: "err".into(), line: reason.clone() },
            );
            return Err(reason);
        }
    }

    let dir = if cwd.trim().is_empty() { home() } else { cwd.clone() };
    let (sh, flag) = shell_parts();

    let mut command = Command::new(sh);
    command
        .arg(flag)
        .arg(&cmd)
        .current_dir(&dir)
        .stdin(Stdio::null()) // nothing is there to type; fail fast, don't hang
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("failed to start '{cmd}': {e}"))?;

    let out_pipe = child.stdout.take();
    let err_pipe = child.stderr.take();

    let child = Arc::new(Mutex::new(child));
    state.running.lock().unwrap().insert(run_id.clone(), child.clone());

    let stdout_buf = Arc::new(Mutex::new(String::new()));
    let stderr_buf = Arc::new(Mutex::new(String::new()));

    let last_out = Arc::new(Mutex::new(Instant::now()));

    let mut readers = Vec::new();
    for (pipe, buf, tag) in [
        (out_pipe.map(|p| Box::new(p) as Box<dyn std::io::Read + Send>), stdout_buf.clone(), "out"),
        (err_pipe.map(|p| Box::new(p) as Box<dyn std::io::Read + Send>), stderr_buf.clone(), "err"),
    ] {
        let Some(pipe) = pipe else { continue };
        let app = app.clone();
        let rid = run_id.clone();
        let tag = tag.to_string();
        let beat = last_out.clone();
        readers.push(std::thread::spawn(move || {
            let reader = BufReader::new(pipe);
            let mut chunk: Vec<u8> = Vec::new();
            let mut bytes = reader.bytes();
            loop {
                match bytes.next() {
                    Some(Ok(b'\n')) | Some(Ok(b'\r')) => {
                        let text = String::from_utf8_lossy(&chunk).to_string();
                        chunk.clear();
                        *beat.lock().unwrap() = Instant::now();
                        if text.trim().is_empty() {
                            continue;
                        }
                        {
                            let mut acc = buf.lock().unwrap();
                            acc.push_str(&text);
                            acc.push('\n');
                        }
                        let _ = app.emit(
                            "agent:output",
                            OutputEvent { run_id: rid.clone(), stream: tag.clone(), line: text },
                        );
                    }
                    Some(Ok(b)) => {
                        chunk.push(b);
                        if chunk.len() > 8192 {
                            *beat.lock().unwrap() = Instant::now();
                            let text = String::from_utf8_lossy(&chunk).to_string();
                            chunk.clear();
                            let mut acc = buf.lock().unwrap();
                            acc.push_str(&text);
                        }
                    }
                    Some(Err(_)) | None => break,
                }
            }
            if !chunk.is_empty() {
                let text = String::from_utf8_lossy(&chunk).to_string();
                let mut acc = buf.lock().unwrap();
                acc.push_str(&text);
                acc.push('\n');
            }
        }));
    }

    let hard_limit = Duration::from_secs(timeout_secs.unwrap_or(3600).clamp(5, 14_400));
    let quiet_limit = Duration::from_secs(quiet_secs.unwrap_or(120).clamp(10, 3600));

    let mut end_reason = "exited";
    let code;

    loop {
        let status = { child.lock().unwrap().try_wait() };
        match status {
            Ok(Some(st)) => {
                code = st.code().unwrap_or(-1);
                break;
            }
            Ok(None) => {}
            Err(e) => {
                cleanup(&state, &run_id);
                return Err(format!("lost track of the process: {e}"));
            }
        }

        let stopped = state.cancelled.lock().unwrap().contains(&run_id);
        let silent = last_out.lock().unwrap().elapsed();

        if stopped {
            end_reason = "stopped";
        } else if silent > quiet_limit {
            end_reason = "stalled";
        } else if started.elapsed() > hard_limit {
            end_reason = "over_time";
        }

        if end_reason != "exited" {
            kill_tree(&child);
            let _ = child.lock().unwrap().wait();
            code = -1;
            break;
        }

        std::thread::sleep(Duration::from_millis(60));
    }

    let silent_ms = last_out.lock().unwrap().elapsed().as_millis() as u64;

    for r in readers {
        let _ = r.join();
    }
    cleanup(&state, &run_id);

    let raw_out = stdout_buf.lock().unwrap().clone();
    let raw_err = stderr_buf.lock().unwrap().clone();
    let (stdout, t1) = squeeze(raw_out);
    let (stderr, t2) = squeeze(raw_err);

    Ok(ExecResult {
        stdout,
        stderr,
        code,
        end_reason: end_reason.to_string(),
        truncated: t1 || t2,
        duration_ms: started.elapsed().as_millis() as u64,
        silent_ms,
    })
}

fn cleanup(state: &AgentState, run_id: &str) {
    state.running.lock().unwrap().remove(run_id);
}

fn kill_tree(child: &Arc<Mutex<Child>>) {
    let pid = { child.lock().unwrap().id() };

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .creation_flags(0x0800_0000)
            .output();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("pkill").args(["-TERM", "-P", &pid.to_string()]).output();
    }

    let _ = child.lock().unwrap().kill();
}

#[tauri::command(async)]
pub fn agent_stop(app: tauri::AppHandle, run_id: String) -> Result<(), String> {
    let state = app.state::<AgentState>();
    state.cancelled.lock().unwrap().insert(run_id.clone());
    if let Some(child) = state.running.lock().unwrap().get(&run_id).cloned() {
        kill_tree(&child);
    }
    Ok(())
}

#[tauri::command]
pub fn agent_reset(state: tauri::State<AgentState>, run_id: String) -> Result<(), String> {
    state.cancelled.lock().unwrap().remove(&run_id);
    Ok(())
}

#[tauri::command]
pub fn agent_set_guard(state: tauri::State<AgentState>, enabled: bool) -> Result<(), String> {
    *state.guard.lock().unwrap() = enabled;
    Ok(())
}

#[tauri::command]
pub fn agent_guard_enabled(state: tauri::State<AgentState>) -> bool {
    *state.guard.lock().unwrap()
}

#[tauri::command(async)]
pub fn agent_write_file(path: String, contents: String, append: Option<bool>) -> Result<String, String> {
    use std::io::Write;
    let p = std::path::PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("couldn't create {}: {e}", parent.display()))?;
    }
    if append.unwrap_or(false) {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&p)
            .map_err(|e| format!("couldn't open {path}: {e}"))?;
        f.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
        Ok(format!("Appended {} bytes to {path}.", contents.len()))
    } else {
        std::fs::write(&p, &contents).map_err(|e| format!("couldn't write {path}: {e}"))?;
        Ok(format!("Wrote {} bytes to {path}.", contents.len()))
    }
}

#[tauri::command(async)]
pub fn agent_read_file(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| format!("can't stat {path}: {e}"))?;
    if meta.len() > 400_000 {
        return Err(format!("{path} is {} bytes — too large to read in one go.", meta.len()));
    }
    let raw = std::fs::read(&path).map_err(|e| format!("can't read {path}: {e}"))?;
    let (text, _) = squeeze(String::from_utf8_lossy(&raw).to_string());
    Ok(text)
}

fn journal_path(app: &tauri::AppHandle, run_id: &str) -> Result<std::path::PathBuf, String> {
    let safe: String = run_id
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("agent").join(format!("{safe}.jsonl")))
}

#[tauri::command(async)]
pub fn agent_journal_append(app: tauri::AppHandle, run_id: String, entry: String) -> Result<(), String> {
    use std::io::Write;
    let path = journal_path(&app, &run_id)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{}", entry.replace('\n', "\\n")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
pub fn agent_journal_read(app: tauri::AppHandle, run_id: String) -> Result<Vec<String>, String> {
    let path = journal_path(&app, &run_id)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(text.lines().map(|l| l.to_string()).collect()),
        Err(_) => Ok(vec![]),
    }
}

#[tauri::command(async)]
pub fn agent_journal_list(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("agent");
    let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(vec![]) };
    let mut runs: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.strip_suffix(".jsonl").map(|s| s.to_string())
        })
        .collect();
    runs.sort();
    runs.reverse();
    Ok(runs)
}

#[tauri::command(async)]
pub fn agent_journal_clear(app: tauri::AppHandle, run_id: String) -> Result<(), String> {
    let path = journal_path(&app, &run_id)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct EnvProbe {
    os: String,
    arch: String,
    shell: String,
    home: String,
    cwd: String,
    tools: Vec<String>,
}

#[tauri::command(async)]
pub fn agent_probe_env() -> Result<EnvProbe, String> {
    const CANDIDATES: &[&str] = &[
        "git", "python", "python3", "py", "pip", "pip3", "node", "npm",
        "cargo", "docker", "curl", "wget", "winget", "choco", "scoop", "brew",
    ];

    let handles: Vec<_> = CANDIDATES
        .iter()
        .map(|tool| {
            let tool = tool.to_string();
            std::thread::spawn(move || {
                let mut c;
                if cfg!(target_os = "windows") {
                    c = Command::new("where");
                    c.arg(&tool);
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
                    }
                } else {
                    c = Command::new("sh");
                    c.arg("-c").arg(format!("command -v {tool}"));
                }
                match c.output() {
                    Ok(out) if out.status.success() && !out.stdout.is_empty() => Some(tool),
                    _ => None,
                }
            })
        })
        .collect();

    let found: Vec<String> = handles
        .into_iter()
        .filter_map(|h| h.join().ok().flatten())
        .collect();
    Ok(EnvProbe {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        shell: if cfg!(target_os = "windows") { "cmd".into() } else { "sh".into() },
        home: home(),
        cwd: std::env::current_dir().map(|p| p.display().to_string()).unwrap_or_default(),
        tools: found,
    })
}
