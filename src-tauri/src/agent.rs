// NEXUS OS — agent execution layer
// ---------------------------------------------------------------------------
// `run_shell` in main.rs is built for a person sitting at a terminal: it blocks
// until the command finishes and hands back everything at once. That is wrong
// for an agent working unattended. An installer can run for ten minutes, print
// forty thousand lines, and hang forever waiting on a prompt nobody is there
// to answer.
//
// So this module gives the agent its own way to run things:
//
//   * a hard timeout, with the whole process tree killed when it expires
//   * stdin closed, so anything waiting on input dies fast instead of hanging
//   * live line streaming to the UI, so you can scroll back through what
//     happened while you were away
//   * capture truncation, so a noisy build log can't blow up the model context
//   * a kill switch that reaches every child the run has spawned
//   * an on-disk journal per run, so the record survives closing the app
//
// Every command here is namespaced `agent_*` and nothing in main.rs changes
// behaviour because of it.
// ---------------------------------------------------------------------------

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

// How much of a command's output is handed back to the model. Installers are
// chatty and most of it is progress bars. We keep the head and the tail — the
// head says what it started doing, the tail says how it ended, and the middle
// is almost never what you need.
const MAX_CAPTURE: usize = 24_000;
const HEAD_KEEP: usize = 6_000;

// ---------------------------------------------------------------------------
// shared state
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct AgentState {
    /// run_id -> the child process currently executing for that run.
    running: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
    /// Runs the user has stopped. Checked before each new spawn so a stop
    /// lands even if it arrives between two steps.
    cancelled: Mutex<HashSet<String>>,
    /// Whether the destructive-command guard is active. On by default.
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

// ---------------------------------------------------------------------------
// the guard
// ---------------------------------------------------------------------------
// This is deliberately short. It is not a sandbox and it is not trying to be
// clever — a determined model can trivially write around it. What it catches
// is the realistic failure: a command that got garbled in transcription, or a
// "cleanup" step the model reasoned its way into, that would take the machine
// down. None of these patterns appear in a legitimate install.

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
    // Piping a download straight into a shell is how a bad transcript becomes a
    // compromised machine. Allowed, but the model is told to show its work.
    None
}

// ---------------------------------------------------------------------------
// exec
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
    /// "exited" | "stalled" | "over_time" | "stopped".
    ///
    /// The distinction matters to the model. "stalled" means the process went
    /// quiet — almost always a prompt waiting on input nobody will type, so
    /// retrying unchanged is pointless. "over_time" means it was working the
    /// whole time and simply ran long, which retrying with a higher ceiling
    /// genuinely does fix.
    pub end_reason: String,
    pub truncated: bool,
    pub duration_ms: u64,
    /// How long it had been silent when it ended.
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

/// Truncate keeping the head and the tail, with a marker in between so the
/// model knows something was dropped rather than silently reasoning over a
/// half-log.
fn squeeze(s: String) -> (String, bool) {
    if s.len() <= MAX_CAPTURE {
        return (s, false);
    }
    // Byte indices, nudged onto char boundaries. Command output is frequently
    // not clean UTF-8 — progress bars, box-drawing characters, the occasional
    // stray byte — and slicing mid-character would panic.
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

// `(async)` is load-bearing, not decoration. A plain #[tauri::command] runs on
// the main thread, and this one blocks for as long as the command takes — up
// to the full timeout. That freezes the webview, and because IPC is also
// handled on the main thread, it makes agent_stop unreachable: the stop button
// goes dead exactly when you need it. `(async)` moves the body onto the async
// runtime's thread pool. Same for every other command here that touches the
// disk or spawns a process.
#[tauri::command(async)]
pub fn agent_exec(
    app: tauri::AppHandle,
    run_id: String,
    cmd: String,
    cwd: String,
    timeout_secs: Option<u64>,
    quiet_secs: Option<u64>,
) -> Result<ExecResult, String> {
    // State is pulled from the handle rather than taken as a `State<_>`
    // parameter. Tauri's own guidance for commands that leave the main thread
    // is to move an AppHandle across and resolve state on the far side, which
    // sidesteps every lifetime question about borrowed args on a spawned task.
    let state = app.state::<AgentState>();
    let started = Instant::now();

    if cmd.trim().is_empty() {
        return Err("Empty command.".into());
    }

    // A stop that arrived between steps must land before anything else runs.
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

    // Keep console windows from flashing up on every step on Windows.
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

    // Reader threads: stream each line to the UI and accumulate for the model.
    let stdout_buf = Arc::new(Mutex::new(String::new()));
    let stderr_buf = Arc::new(Mutex::new(String::new()));

    // The heartbeat. Every line of output bumps this, and the poll loop below
    // watches it instead of watching total elapsed time. A 20GB model download
    // printing a progress bar is healthy no matter how long it takes; a process
    // sitting on a [y/N] prompt is dead the moment it stops talking, and this
    // catches that in two minutes rather than ten.
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
            // Split on \r as well as \n: progress bars redraw with carriage
            // returns and emit no newline for minutes at a time. Reading only
            // whole lines would make a downloading process look silent.
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
                            // A process emitting one enormous unbroken line is
                            // still alive; don't let it look stalled.
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

    // Poll for exit. Three ways to end early, in priority order: the user hit
    // stop, the process went quiet, or it blew the absolute ceiling.
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

/// child.kill() only reaches the shell we spawned, not the compiler or
/// installer it launched. Kill the whole tree by pid.
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

// ---------------------------------------------------------------------------
// the stop button
// ---------------------------------------------------------------------------

#[tauri::command(async)]
pub fn agent_stop(app: tauri::AppHandle, run_id: String) -> Result<(), String> {
    let state = app.state::<AgentState>();
    state.cancelled.lock().unwrap().insert(run_id.clone());
    if let Some(child) = state.running.lock().unwrap().get(&run_id).cloned() {
        kill_tree(&child);
    }
    Ok(())
}

/// Clears the stop flag so a run id can be started fresh.
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

// ---------------------------------------------------------------------------
// files
// ---------------------------------------------------------------------------
// An agent following a written walkthrough spends half its time writing config
// files. Doing that through `echo >>` and shell quoting is where these runs
// usually break, so it gets real file commands instead.

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

// ---------------------------------------------------------------------------
// the journal
// ---------------------------------------------------------------------------
// The whole point is that you walk away. When you come back — possibly after
// closing the app — the run has to still be there to read.

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

// ---------------------------------------------------------------------------
// environment probe
// ---------------------------------------------------------------------------
// Cheap orientation so the agent's first move isn't three wasted steps working
// out what shell it's in and whether git exists.

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

    // Serially this is sixteen process spawns before the run can even start,
    // and on Windows each one flashes a console window. Fan them out and flash
    // nothing.
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
