// NEXUS OS  -  Tauri backend
// Every #[command] below is the real counterpart to a mock adapter in the
// frontend. The frontend calls these with invoke("name", { args }); the
// return shapes match what the mock versions produced, so the UI does not
// change  -  only the source of the data does.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Mutex;
use sysinfo::{Disks, Networks, System};
use tauri::{Manager, State};

// The unattended-execution layer. Kept in its own file because it has very
// different rules from the interactive commands above: timeouts, kill trees,
// truncation, and a journal that outlives the window.
mod agent;
mod platform;

// sysinfo wants to be reused between reads so it can compute deltas (CPU %,
// network throughput). One instance, guarded by a mutex, refreshed per call.

struct Telemetry {
    sys: Mutex<System>,
    networks: Mutex<Networks>,
    last_net: Mutex<(u64, u64, std::time::Instant)>, // rx, tx, when
}

#[derive(Serialize)]
struct Frame {
    cpu: f32,
    mem: f32,
    disk: f32,
    temp: f32,
    down: f32, // Mb/s
    up: f32,
    total_mem_gb: f32,
    used_mem_gb: f32,
}

#[tauri::command]
fn telemetry(state: State<Telemetry>) -> Frame {
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu = sys.global_cpu_usage();
    let total = sys.total_memory() as f32;
    let used = sys.used_memory() as f32;
    let mem = if total > 0.0 { used / total * 100.0 } else { 0.0 };

    // disk: usage of the largest mounted volume
    let disks = Disks::new_with_refreshed_list();
    let disk = disks
        .list()
        .iter()
        .max_by_key(|d| d.total_space())
        .map(|d| {
            let t = d.total_space() as f32;
            let a = d.available_space() as f32;
            if t > 0.0 { (t - a) / t * 100.0 } else { 0.0 }
        })
        .unwrap_or(0.0);

    // network throughput: bytes since last call / elapsed seconds
    let mut nets = state.networks.lock().unwrap();
    nets.refresh();
    let (mut rx, mut tx) = (0u64, 0u64);
    for (_name, data) in nets.iter() {
        rx += data.total_received();
        tx += data.total_transmitted();
    }
    let mut last = state.last_net.lock().unwrap();
    let elapsed = last.2.elapsed().as_secs_f32().max(0.001);
    let down = ((rx.saturating_sub(last.0)) as f32 * 8.0 / 1_000_000.0) / elapsed;
    let up = ((tx.saturating_sub(last.1)) as f32 * 8.0 / 1_000_000.0) / elapsed;
    *last = (rx, tx, std::time::Instant::now());

    // temperature: components vary by platform; take the hottest sensor
    let temp = {
        let comps = sysinfo::Components::new_with_refreshed_list();
        comps
            .list()
            .iter()
            .map(|c| c.temperature())
            .fold(0.0_f32, f32::max)
    };

    Frame {
        cpu,
        mem,
        disk,
        temp,
        down: down.max(0.0),
        up: up.max(0.0),
        total_mem_gb: total / 1_048_576.0 / 1024.0,
        used_mem_gb: used / 1_048_576.0 / 1024.0,
    }
}

// Replaces MockShell.run(). Runs a command in the given working directory and
// returns stdout, stderr and the exit code. The frontend already parses this
// shape; the difference is these are real processes.

#[derive(Serialize)]
struct ShellResult {
    stdout: String,
    stderr: String,
    code: i32,
}

#[tauri::command]
fn run_shell(cmd: String, cwd: String) -> Result<ShellResult, String> {
    if cmd.trim().is_empty() {
        return Ok(ShellResult { stdout: String::new(), stderr: String::new(), code: 0 });
    }

    let (shell, flag) = if cfg!(target_os = "windows") {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };

    let dir = if cwd.is_empty() {
        dirs_home()
    } else {
        cwd
    };

    let output = Command::new(shell)
        .arg(flag)
        .arg(&cmd)
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("failed to spawn: {e}"))?;

    Ok(ShellResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code().unwrap_or(-1),
    })
}

fn dirs_home() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into())
}

// Replaces MockNet.resolve(). Uses the system resolver.

#[tauri::command]
fn dns_lookup(host: String) -> Result<Vec<String>, String> {
    use std::net::ToSocketAddrs;
    let query = format!("{}:0", host.trim());
    query
        .to_socket_addrs()
        .map_err(|e| format!("could not resolve {host}: {e}"))
        .map(|addrs| {
            let mut out: Vec<String> = addrs.map(|a| a.ip().to_string()).collect();
            out.sort();
            out.dedup();
            out
        })
}

// Replaces MockNet.ping(). Shells out to the system ping once and parses the
// round-trip time. Cross-platform flag handling.

#[tauri::command]
fn ping_host(host: String) -> Result<f32, String> {
    let clean = host.trim();
    let (count_flag, count, extra): (&str, &str, Vec<&str>) = if cfg!(target_os = "windows") {
        ("-n", "1", vec!["-w", "2000"])
    } else {
        ("-c", "1", vec!["-W", "2"])
    };

    let mut c = Command::new("ping");
    c.arg(count_flag).arg(count);
    for e in extra { c.arg(e); }
    c.arg(clean);

    let out = c.output().map_err(|e| format!("ping failed: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);

    // both platforms print "time=1.23 ms" / "time=1.23ms" / "time<1ms"
    for token in text.split_whitespace() {
        if let Some(rest) = token.strip_prefix("time=") {
            let num: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
            if let Ok(v) = num.parse::<f32>() {
                return Ok(v);
            }
        }
    }
    Err("no reply".into())
}

// Reads the machine's actual local IP, gateway, and interface by parsing the
// platform's own tools. No third-party crates, no raw sockets.

#[derive(Serialize)]
struct NetInfo {
    local_ip: String,
    gateway: String,
    iface: String,
}

#[derive(Serialize, Clone)]
struct ProcInfo {
    name: String,
    mem_mb: u64,
}

#[derive(Serialize)]
struct Snapshot {
    ports: Vec<u16>,        // listening TCP ports
    proc_count: usize,      // total running processes
    top: Vec<ProcInfo>,     // heaviest processes by memory
}

// A read-only snapshot of the machine's current posture: which TCP ports are
// listening, how many processes are running, and the heaviest few by memory.
// The frontend saves one of these as a "baseline" and compares later ones to
// it  -  that's the Cyber Twin. All real, all local.
#[tauri::command]
fn system_snapshot() -> Result<Snapshot, String> {
    // Listening ports via netstat (Windows). Parse the local address column.
    let mut ports: Vec<u16> = Vec::new();
    if cfg!(target_os = "windows") {
        if let Ok(out) = Command::new("netstat").args(["-an"]).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                let l = line.trim();
                if !l.starts_with("TCP") { continue; }
                if !l.contains("LISTENING") { continue; }
                // columns: TCP  0.0.0.0:135  0.0.0.0:0  LISTENING
                if let Some(local) = l.split_whitespace().nth(1) {
                    if let Some(p) = local.rsplit(':').next() {
                        if let Ok(n) = p.parse::<u16>() { if !ports.contains(&n) { ports.push(n); } }
                    }
                }
            }
        }
    }
    ports.sort_unstable();

    // Processes via sysinfo.
    let mut sys = System::new_all();
    sys.refresh_all();
    let proc_count = sys.processes().len();
    let mut all: Vec<ProcInfo> = sys.processes().values()
        .map(|p| ProcInfo { name: p.name().to_string_lossy().to_string(), mem_mb: p.memory() / 1_048_576 })
        .collect();
    all.sort_by(|a, b| b.mem_mb.cmp(&a.mem_mb));
    let top: Vec<ProcInfo> = all.into_iter().take(8).collect();

    Ok(Snapshot { ports, proc_count, top })
}

#[tauri::command]
fn net_info() -> Result<NetInfo, String> {
    // Local IP: open a UDP socket "toward" a public address (no packets are
    // actually sent by connect on UDP) and read the local address it picks.
    let local_ip = {
        use std::net::UdpSocket;
        UdpSocket::bind("0.0.0.0:0")
            .and_then(|s| { s.connect("8.8.8.8:80")?; s.local_addr() })
            .map(|a| a.ip().to_string())
            .unwrap_or_else(|_| "unavailable".into())
    };

    // Gateway + interface from the routing table.
    let (gateway, iface) = if cfg!(target_os = "windows") {
        let out = Command::new("ipconfig").output().map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        let mut gw = String::new();
        for line in text.lines() {
            if line.to_lowercase().contains("default gateway") {
                if let Some(v) = line.split(':').nth(1) {
                    let v = v.trim();
                    if !v.is_empty() && v.contains('.') { gw = v.to_string(); break; }
                }
            }
        }
        (if gw.is_empty() { "unavailable".into() } else { gw }, "Primary adapter".to_string())
    } else if cfg!(target_os = "macos") {
        let gw = Command::new("sh").arg("-c").arg("route -n get default 2>/dev/null | awk '/gateway/{print $2}'")
            .output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        let ifc = Command::new("sh").arg("-c").arg("route -n get default 2>/dev/null | awk '/interface/{print $2}'")
            .output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        (if gw.is_empty() { "unavailable".into() } else { gw },
         if ifc.is_empty() { "unknown".into() } else { ifc })
    } else {
        let gw = Command::new("sh").arg("-c").arg("ip route | awk '/default/{print $3; exit}'")
            .output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        let ifc = Command::new("sh").arg("-c").arg("ip route | awk '/default/{print $5; exit}'")
            .output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        (if gw.is_empty() { "unavailable".into() } else { gw },
         if ifc.is_empty() { "unknown".into() } else { ifc })
    };

    Ok(NetInfo { local_ip, gateway, iface })
}

// Real traceroute by shelling to the platform tool and returning raw lines.
#[tauri::command]
fn traceroute(host: String) -> Result<Vec<String>, String> {
    let clean = host.trim();
    if clean.is_empty() { return Err("No host given.".into()); }
    let out = if cfg!(target_os = "windows") {
        Command::new("tracert").arg("-d").arg("-h").arg("15").arg(clean).output()
    } else {
        Command::new("traceroute").arg("-n").arg("-m").arg("15").arg(clean).output()
    }.map_err(|e| format!("traceroute failed: {e}"))?;

    let text = String::from_utf8_lossy(&out.stdout);
    let lines: Vec<String> = text.lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    if lines.is_empty() { return Err("No output.".into()); }
    Ok(lines)
}

// Real local devices from the OS ARP table  -  hosts this machine has recently
// communicated with. Reading the table is passive (no active sweep), so it
// surfaces real neighbours without generating scan traffic.
#[derive(Serialize)]
struct Device { ip: String, mac: String, vendor: String, host: String }

// A small built-in OUI table (MAC prefix → vendor). Not exhaustive  -  the full
// IEEE registry is huge  -  but covers the common consumer/network vendors, so
// most home devices resolve instead of showing blank.
fn vendor_for(mac: &str) -> String {
    let p = mac.to_lowercase().replace('-', ":");
    let prefix: String = p.split(':').take(3).collect::<Vec<_>>().join(":");
    let name = match prefix.as_str() {
        "00:1a:11" | "3c:5a:b4" | "f4:f5:e8" | "a4:77:33" | "d8:6c:63" => "Google",
        "f0:18:98" | "a4:83:e7" | "ac:bc:32" | "3c:15:c2" | "f0:99:bf" | "88:66:5a" => "Apple",
        "dc:a6:32" | "b8:27:eb" | "e4:5f:01" => "Raspberry Pi",
        "5c:cf:7f" | "a0:20:a6" | "24:0a:c4" | "dc:4f:22" | "cc:50:e3" => "Espressif",
        "00:1d:0f" | "c0:35:32" | "20:e5:2a" | "a0:63:91" | "10:da:43" => "Netgear",
        "00:14:22" | "b0:4e:26" | "c8:d7:19" => "Dell",
        "00:50:56" | "00:0c:29" | "00:05:69" => "VMware",
        "ec:0d:e4" | "f4:64:12" | "82:ed:2f" => "Samsung",
        "00:17:88" | "d0:73:d5" => "Philips Hue",
        "18:b4:30" | "64:16:66" => "Nest",
        "00:1b:63" | "00:23:76" => "Cisco",
        "b8:27:eb " => "Raspberry Pi",
        _ if prefix.starts_with("01:00:5e") => "IPv4 multicast",
        _ if prefix.starts_with("ff:ff:ff") => "Broadcast",
        _ if prefix.starts_with("33:33") => "IPv6 multicast",
        _ => "",
    };
    name.to_string()
}

// Reverse DNS (PTR) isn't portably available in std, and shelling out per-IP
// is slow and noisy. Rather than fake a hostname, we leave it blank and let
// the vendor name carry the identification.
fn reverse_dns(_ip: &str) -> String { String::new() }

#[tauri::command]
fn arp_table() -> Result<Vec<Device>, String> {
    let out = Command::new("arp").arg("-a").output().map_err(|e| format!("arp failed: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut devices = Vec::new();
    for line in text.lines() {
        let ip = line.split(|c: char| c == '(' || c == ')' || c.is_whitespace())
            .find(|tok| {
                let parts: Vec<&str> = tok.split('.').collect();
                parts.len() == 4 && parts.iter().all(|p| p.parse::<u8>().is_ok())
            }).map(|s| s.to_string());
        let mac = line.split_whitespace()
            .find(|tok| {
                let sep = if tok.contains(':') { ':' } else { '-' };
                let parts: Vec<&str> = tok.split(sep).collect();
                parts.len() == 6 && parts.iter().all(|p| p.len() == 2 && u8::from_str_radix(p, 16).is_ok())
            }).map(|s| s.replace('-', ":").to_lowercase());
        if let (Some(ip), Some(mac)) = (ip, mac) {
            let vendor = vendor_for(&mac);
            let host = reverse_dns(&ip);
            devices.push(Device { ip, mac, vendor, host });
        }
    }
    Ok(devices)
}

// Finder: reads real EXIF from an image (camera, settings, GPS, timestamps).
// Remover: re-encodes the image so all metadata is dropped, saving a clean
// copy next to the original. Both operate only on files the user points to.

#[derive(Serialize)]
struct MetaEntry { tag: String, value: String }

#[tauri::command]
fn read_metadata_bytes(bytes: Vec<u8>) -> Result<Vec<MetaEntry>, String> {
    let mut cursor = std::io::Cursor::new(&bytes);
    let exif = exif::Reader::new()
        .read_from_container(&mut cursor)
        .map_err(|_| "No EXIF metadata found (JPEG/TIFF/HEIC hold EXIF; PNG/GIF usually don't).".to_string())?;

    let mut out = Vec::new();
    for f in exif.fields() {
        let tag = format!("{}", f.tag);
        let value = f.display_value().with_unit(&exif).to_string();
        if !value.is_empty() && value != "\"\"" {
            out.push(MetaEntry { tag, value });
        }
    }
    if out.is_empty() { return Err("No readable metadata fields.".into()); }
    Ok(out)
}

// Strip metadata from dropped bytes, returning clean bytes the frontend can
// offer as a download. Re-encodes the pixels so no EXIF survives.
#[tauri::command]
fn strip_metadata_bytes(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(&bytes).map_err(|e| format!("couldn't read image: {e}"))?;
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png).map_err(|e| format!("couldn't encode: {e}"))?;
    Ok(out.into_inner())
}

#[tauri::command]
fn read_metadata(path: String) -> Result<Vec<MetaEntry>, String> {
    let file = std::fs::File::open(&path).map_err(|e| format!("can't open file: {e}"))?;
    let mut reader = std::io::BufReader::new(&file);
    let exif = exif::Reader::new()
        .read_from_container(&mut reader)
        .map_err(|_| "No EXIF metadata found in this file (JPEG/TIFF/HEIC hold EXIF; PNG/GIF usually don't).".to_string())?;

    let mut out = Vec::new();
    for f in exif.fields() {
        let tag = format!("{}", f.tag);
        let value = f.display_value().with_unit(&exif).to_string();
        if !value.is_empty() && value != "\"\"" {
            out.push(MetaEntry { tag, value });
        }
    }
    if out.is_empty() { return Err("No readable metadata fields.".into()); }
    Ok(out)
}

#[tauri::command]
fn strip_metadata(path: String) -> Result<String, String> {
    // Decode then re-encode: the image crate writes clean pixel data with no
    // EXIF/metadata. Saves alongside the original as *-clean.<ext>.
    let img = image::open(&path).map_err(|e| format!("couldn't read image: {e}"))?;
    let p = std::path::Path::new(&path);
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "image".into());
    let ext = p.extension().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "png".into());
    let out_path = p.with_file_name(format!("{stem}-clean.{ext}"));
    img.save(&out_path).map_err(|e| format!("couldn't save clean copy: {e}"))?;
    Ok(out_path.to_string_lossy().to_string())
}

// Real wireless info. On Windows, parses `netsh wlan show interfaces` for the
// current connection and `show networks mode=bssid` for nearby SSIDs. Other
// platforms return what they can or an honest "not supported".

#[derive(Serialize)]
struct WifiInfo {
    connected: Option<WifiCurrent>,
    networks: Vec<WifiNetwork>,
    supported: bool,
}
#[derive(Serialize)]
struct WifiCurrent { ssid: String, signal: String, radio: String, channel: String, rx: String, tx: String }
#[derive(Serialize)]
struct WifiNetwork { ssid: String, signal: String, auth: String }

#[tauri::command]
fn wifi_info() -> Result<WifiInfo, String> {
    if !cfg!(target_os = "windows") {
        return Ok(WifiInfo { connected: None, networks: vec![], supported: false });
    }
    let field = |text: &str, key: &str| -> String {
        for line in text.lines() {
            if let Some(idx) = line.find(':') {
                let (k, v) = line.split_at(idx);
                if k.trim().eq_ignore_ascii_case(key) {
                    return v[1..].trim().to_string();
                }
            }
        }
        String::new()
    };

    let iface = Command::new("netsh").args(["wlan", "show", "interfaces"]).output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default();

    let connected = {
        let ssid = field(&iface, "SSID");
        if ssid.is_empty() { None } else {
            Some(WifiCurrent {
                ssid,
                signal: field(&iface, "Signal"),
                radio: field(&iface, "Radio type"),
                channel: field(&iface, "Channel"),
                rx: field(&iface, "Receive rate (Mbps)"),
                tx: field(&iface, "Transmit rate (Mbps)"),
            })
        }
    };

    // Nearby networks.
    let nets_raw = Command::new("netsh").args(["wlan", "show", "networks", "mode=bssid"]).output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_default();
    let mut networks = Vec::new();
    let mut cur_ssid = String::new();
    let mut cur_auth = String::new();
    for line in nets_raw.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("SSID ") {
            if let Some(idx) = rest.find(':') { cur_ssid = rest[idx + 1..].trim().to_string(); }
        } else if let Some(idx) = t.find(':') {
            let key = t[..idx].trim();
            let val = t[idx + 1..].trim();
            if key.eq_ignore_ascii_case("Authentication") { cur_auth = val.to_string(); }
            else if key.eq_ignore_ascii_case("Signal") && !cur_ssid.is_empty() {
                networks.push(WifiNetwork { ssid: cur_ssid.clone(), signal: val.to_string(), auth: cur_auth.clone() });
            }
        }
    }

    Ok(WifiInfo { connected, networks, supported: true })
}

// Reads real data from a local git repository by shelling to `git`. All
// read-only  -  status, branch, ahead/behind, recent commits, tracked files.
// Never commits, pushes, or changes anything.

#[derive(Serialize)]
struct GitInfo {
    branch: String,
    ahead: u32,
    behind: u32,
    dirty: Vec<String>,
    commits: Vec<GitCommit>,
    files: Vec<GitFile>,
    remote: String,
}

#[derive(Serialize)]
struct GitCommit { sha: String, msg: String, who: String, when: String }
#[derive(Serialize)]
struct GitFile { path: String, size: String }

fn git(repo: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git").arg("-C").arg(repo).args(args)
        .output().map_err(|e| format!("git not available: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[tauri::command]
fn git_info(path: String) -> Result<GitInfo, String> {
    // Confirm it's a repo.
    git(&path, &["rev-parse", "--is-inside-work-tree"])
        .map_err(|_| "That folder isn't a git repository.".to_string())?;

    let branch = git(&path, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default().trim().to_string();

    // Ahead/behind vs upstream, if there is one.
    let (mut ahead, mut behind) = (0u32, 0u32);
    if let Ok(counts) = git(&path, &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]) {
        let nums: Vec<u32> = counts.split_whitespace().filter_map(|n| n.parse().ok()).collect();
        if nums.len() == 2 { behind = nums[0]; ahead = nums[1]; }
    }

    // Dirty working tree.
    let dirty: Vec<String> = git(&path, &["status", "--porcelain"]).unwrap_or_default()
        .lines().map(|l| l.get(3..).unwrap_or(l).to_string()).filter(|s| !s.is_empty()).take(50).collect();

    // Recent commits: sha|subject|author|relative-date
    let log = git(&path, &["log", "-15", "--pretty=format:%h|%s|%an|%cr"]).unwrap_or_default();
    let commits: Vec<GitCommit> = log.lines().filter_map(|l| {
        let p: Vec<&str> = l.splitn(4, '|').collect();
        if p.len() == 4 { Some(GitCommit { sha: p[0].into(), msg: p[1].into(), who: p[2].into(), when: p[3].into() }) }
        else { None }
    }).collect();

    // Tracked files with sizes.
    let tracked = git(&path, &["ls-files"]).unwrap_or_default();
    let files: Vec<GitFile> = tracked.lines().take(200).map(|rel| {
        let full = std::path::Path::new(&path).join(rel);
        let size = std::fs::metadata(&full).map(|m| human_size(m.len())).unwrap_or_else(|_| "—".into());
        GitFile { path: rel.to_string(), size }
    }).collect();

    let remote = git(&path, &["remote", "get-url", "origin"]).unwrap_or_default().trim().to_string();

    Ok(GitInfo { branch, ahead, behind, dirty, commits, files, remote })
}

// Walks a real directory (one level deep by default, or recursive) and returns
// real file metadata. Text file bodies are read only for small files so search
// can look inside them. No writes, ever  -  this is read-only.

#[derive(Serialize)]
struct IndexedFile {
    id: String,
    name: String,
    path: String,
    #[serde(rename = "type")]
    kind: String,
    size: String,
    when: String,
    tags: Vec<String>,
    body: Option<String>,
}

fn human_size(bytes: u64) -> String {
    if bytes < 1024 { format!("{bytes} B") }
    else if bytes < 1024 * 1024 { format!("{:.1} KB", bytes as f64 / 1024.0) }
    else if bytes < 1024 * 1024 * 1024 { format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0)) }
    else { format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0)) }
}

fn walk_dir(dir: &std::path::Path, root: &std::path::Path, depth: usize, out: &mut Vec<IndexedFile>) {
    if out.len() >= 2000 { return; } // hard cap so a huge tree can't hang the UI
    let entries = match std::fs::read_dir(dir) { Ok(e) => e, Err(_) => return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; } // skip hidden/system files
        let meta = match entry.metadata() { Ok(m) => m, Err(_) => continue };

        if meta.is_dir() {
            if depth > 0 { walk_dir(&path, root, depth - 1, out); }
            continue;
        }

        let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        let rel_parent = path.parent()
            .and_then(|p| p.strip_prefix(root).ok())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        // Read a body only for small text-like files, so search can look inside.
        let text_exts = ["md", "txt", "rs", "js", "jsx", "ts", "tsx", "py", "json", "toml", "css", "html", "csv", "log"];
        let body = if text_exts.contains(&ext.as_str()) && meta.len() < 200_000 {
            std::fs::read_to_string(&path).ok().map(|s| s.chars().take(20_000).collect())
        } else { None };

        let when = meta.modified().ok()
            .and_then(|m| m.elapsed().ok())
            .map(|d| {
                let s = d.as_secs();
                if s < 3600 { format!("{}m", s / 60) }
                else if s < 86400 { format!("{}h", s / 3600) }
                else { format!("{}d", s / 86400) }
            })
            .unwrap_or_else(|| "—".into());

        out.push(IndexedFile {
            id: path.to_string_lossy().to_string(),
            name,
            path: if rel_parent.is_empty() { ".".into() } else { rel_parent },
            kind: if ext.is_empty() { "file".into() } else { ext },
            size: human_size(meta.len()),
            when,
            tags: vec![],
            body,
        });
    }
}

#[tauri::command]
fn index_folder(path: String, recursive: bool) -> Result<Vec<IndexedFile>, String> {
    let root = std::path::PathBuf::from(&path);
    if !root.is_dir() {
        return Err("That path isn't a folder.".into());
    }
    let mut out = Vec::new();
    walk_dir(&root, &root, if recursive { 4 } else { 0 }, &mut out);
    Ok(out)
}

// Best-effort hostname for one IP. On Windows, nbtstat -A returns the NetBIOS
// name table for a host; the "<00>  UNIQUE" entry is usually the machine name.
// Many home devices (phones, IoT) don't answer  -  returns blank when unknown.
#[tauri::command]
fn resolve_hostname(ip: String) -> Result<String, String> {
    let ip = ip.trim().to_string();
    if ip.is_empty() { return Ok(String::new()); }

    if cfg!(target_os = "windows") {
        let out = Command::new("nbtstat").args(["-A", &ip]).output()
            .map_err(|e| format!("nbtstat failed: {e}"))?;
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            // Lines look like:  "    GIOS-PC        <00>  UNIQUE      Registered"
            if line.contains("<00>") && line.to_uppercase().contains("UNIQUE") {
                let name = line.split_whitespace().next().unwrap_or("").trim().to_string();
                if !name.is_empty() && name != "MAC" { return Ok(name); }
            }
        }
        Ok(String::new())
    } else {
        // Unix: try `getent hosts` (uses the system resolver, incl. mDNS on
        // many setups). Blank if nothing resolves.
        let out = Command::new("getent").args(["hosts", &ip]).output();
        if let Ok(o) = out {
            let text = String::from_utf8_lossy(&o.stdout);
            if let Some(first) = text.split_whitespace().nth(1) {
                return Ok(first.to_string());
            }
        }
        Ok(String::new())
    }
}

// A separate key from the Anthropic one, stored the same way. If present, TTS
// requests go to ElevenLabs for a natural voice; if absent, the frontend falls
// back to the system (Windows) voice. Read-only network calls to ElevenLabs.

fn eleven_key_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("eleven.key"))
}

fn read_eleven_key(app: &tauri::AppHandle) -> Option<String> {
    if let Ok(k) = std::env::var("ELEVENLABS_API_KEY") {
        if !k.is_empty() { return Some(k); }
    }
    let path = eleven_key_path(app).ok()?;
    let k = std::fs::read_to_string(path).ok()?;
    let k = k.trim().to_string();
    if k.is_empty() { None } else { Some(k) }
}

#[tauri::command]
fn save_eleven_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let k = key.trim();
    if k.is_empty() { return Err("The key is empty.".into()); }
    let path = eleven_key_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, k).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_eleven_key(app: tauri::AppHandle) -> Result<(), String> {
    let path = eleven_key_path(&app)?;
    if path.exists() { std::fs::remove_file(&path).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
fn has_eleven_key(app: tauri::AppHandle) -> bool {
    read_eleven_key(&app).is_some()
}

// Synthesize speech. Returns raw MP3 bytes the frontend plays. voice_id picks
// which ElevenLabs voice; the frontend passes an elegant British one.
#[tauri::command]
async fn eleven_tts(app: tauri::AppHandle, text: String, voice_id: String) -> Result<Vec<u8>, String> {
    let key = read_eleven_key(&app).ok_or_else(|| "NO_ELEVEN_KEY".to_string())?;
    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{voice_id}");
    let body = serde_json::json!({
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": { "stability": 0.5, "similarity_boost": 0.75 }
    });
    let client = reqwest::Client::new();
    let res = client.post(&url)
        .header("xi-api-key", key)
        .header("content-type", "application/json")
        .body(body.to_string())
        .send().await.map_err(|e| format!("voice request failed: {e}"))?;
    let status = res.status();
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = String::from_utf8_lossy(&bytes);
        return Err(format!("voice error {status}: {}", msg.chars().take(160).collect::<String>()));
    }
    Ok(bytes.to_vec())
}

// Real current conditions from Open-Meteo (free, no key). The frontend passes
// coordinates; we return temp (F), a condition label, and the day's hi/lo.

#[derive(Serialize)]
struct Weather {
    temp_f: i32,
    label: String,
    high: i32,
    low: i32,
}

fn wmo_label(code: i64) -> &'static str {
    match code {
        0 => "Clear",
        1 | 2 => "Partly cloudy",
        3 => "Overcast",
        45 | 48 => "Fog",
        51 | 53 | 55 => "Drizzle",
        56 | 57 => "Freezing drizzle",
        61 | 63 | 65 => "Rain",
        66 | 67 => "Freezing rain",
        71 | 73 | 75 | 77 => "Snow",
        80 | 81 | 82 => "Showers",
        85 | 86 => "Snow showers",
        95 => "Thunderstorm",
        96 | 99 => "Hailstorm",
        _ => "—",
    }
}

#[tauri::command]
async fn get_weather(lat: f64, lon: f64) -> Result<Weather, String> {
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}\
         &current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min\
         &temperature_unit=fahrenheit&timezone=auto&forecast_days=1"
    );
    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| format!("weather request failed: {e}"))?;
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    let temp = json["current"]["temperature_2m"].as_f64().ok_or("no temperature")?;
    let code = json["current"]["weather_code"].as_i64().unwrap_or(-1);
    let high = json["daily"]["temperature_2m_max"][0].as_f64().unwrap_or(temp);
    let low = json["daily"]["temperature_2m_min"][0].as_f64().unwrap_or(temp);

    Ok(Weather {
        temp_f: temp.round() as i32,
        label: wmo_label(code).to_string(),
        high: high.round() as i32,
        low: low.round() as i32,
    })
}

// Replaces the "reset on reload" gap. Settings, dashboard layout, projects,
// files metadata, rules  -  anything the frontend wants to keep  -  is a JSON blob
// written next to the app's data directory.

#[tauri::command]
fn load_state(app: tauri::AppHandle, key: String) -> Result<String, String> {
    let path = state_path(&app, &key)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(_) => Ok("null".into()), // absent key -> null, frontend handles it
    }
}

#[tauri::command]
fn save_state(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let path = state_path(&app, &key)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, value).map_err(|e| e.to_string())
}

fn state_path(app: &tauri::AppHandle, key: &str) -> Result<std::path::PathBuf, String> {
    let safe: String = key.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.join("state").join(format!("{safe}.json")))
}

// The key lives in an environment variable read by the Rust process, never in
// the frontend bundle. The frontend asks whether a key is present; it never
// receives the value. Real model calls are proxied through call_model so the
// key never crosses into JavaScript.

// Opens an application, file, or URL using the OS's native "open" mechanism.
// On Windows that's `cmd /C start`, macOS `open`, Linux `xdg-open`. A target
// can be an app name on PATH, a full path, or a URL.

#[tauri::command]
fn launch_app(target: String) -> Result<(), String> {
    let t = target.trim().to_string();
    if t.is_empty() {
        return Err("Nothing to launch.".into());
    }

    // Store/UWP apps live in the protected WindowsApps folder and can't be run
    // by their .exe path  -  Windows blocks it. Point the user at the real way.
    if t.to_lowercase().contains("windowsapps") {
        let hint = if t.to_lowercase().contains("spotify") {
            "  Try  spotify:  instead."
        } else if t.to_lowercase().contains("windowsterminal") {
            "  Try  wt  instead."
        } else {
            "  Use the app's protocol or start-menu name (e.g. its URI) rather than the .exe path."
        };
        return Err(format!(
            "Windows blocks launching Store apps by their WindowsApps path.{hint}"
        ));
    }

    let result = if cfg!(target_os = "windows") {
        // `start` needs an empty title arg first when the target is quoted
        Command::new("cmd").args(["/C", "start", "", &t]).spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(&t).spawn()
    } else {
        Command::new("xdg-open").arg(&t).spawn()
    };

    result.map(|_| ()).map_err(|e| format!("Could not launch '{t}': {e}"))
}

// The key is stored in the app's private data directory so each person who
// runs the app enters their own key once and it persists on their machine.
// An ANTHROPIC_API_KEY env var still works as an override for development.

fn key_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("nexus.key"))
}

fn read_saved_key(app: &tauri::AppHandle) -> Option<String> {
    if let Ok(k) = std::env::var("ANTHROPIC_API_KEY") {
        if !k.is_empty() { return Some(k); }
    }
    let path = key_path(app).ok()?;
    let k = std::fs::read_to_string(path).ok()?;
    let k = k.trim().to_string();
    if k.is_empty() { None } else { Some(k) }
}

#[tauri::command]
fn save_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let k = key.trim();
    if k.is_empty() {
        return Err("The key is empty.".into());
    }
    if !k.starts_with("sk-ant-") {
        return Err("That doesn't look like an Anthropic key — they start with 'sk-ant-'.".into());
    }
    let path = key_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, k).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_api_key(app: tauri::AppHandle) -> Result<(), String> {
    let path = key_path(&app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// DEV ONLY  -  wipes the entire app data directory (keys + all state) so the next
// launch behaves like a brand-new install. Remove this command and its button
// before shipping the final build.
#[tauri::command]
fn factory_reset(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if dir.exists() {
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            // Leave the webview cache alone; only remove Nexus's own files.
            if name == "EBWebView" { continue; }
            let _ = if p.is_dir() { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) };
        }
    }
    Ok(())
}

#[tauri::command]
fn has_api_key(app: tauri::AppHandle) -> bool {
    read_saved_key(&app).is_some()
}

// Masked preview like "sk-ant-...a1b2" so the UI can show a key is set without
// ever exposing the whole value.
#[tauri::command]
fn api_key_hint(app: tauri::AppHandle) -> Option<String> {
    let k = read_saved_key(&app)?;
    let tail = if k.len() >= 4 { k[k.len() - 4..].to_string() } else { k.clone() };
    Some(format!("sk-ant-…{tail}"))
}

#[derive(Deserialize)]
struct ModelCall {
    body: String, // the JSON request body assembled by the frontend
}

/// One client for the whole process, built once.
///
/// `Client::new()` per call throws away the connection pool, so every turn of an
/// agent run paid for a fresh DNS lookup and TLS handshake before it could send
/// a byte. Reusing the client keeps the connection to api.anthropic.com warm
/// between turns. reqwest::Client is already an Arc internally  -  cloning is
/// cheap and sharing it across tasks is the intended use.
static HTTP: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

fn http() -> &'static reqwest::Client {
    HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

#[tauri::command]
async fn call_model(app: tauri::AppHandle, payload: ModelCall) -> Result<String, String> {
    let key = read_saved_key(&app).ok_or_else(|| "NO_KEY".to_string())?;

    let res = http()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-beta", "prompt-caching-2024-07-31")
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .body(payload.body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("model returned {status}: {text}"));
    }
    Ok(text)
}

fn main() {
    let sys = System::new_all();
    tauri::Builder::default()
        // Lets the agent raise a real Windows notification when it finishes or
        // needs a human, so you can start a run and go do something else.
        .plugin(tauri_plugin_notification::init())
        .manage(Telemetry {
            sys: Mutex::new(sys),
            networks: Mutex::new(Networks::new_with_refreshed_list()),
            last_net: Mutex::new((0, 0, std::time::Instant::now())),
        })
        .manage(agent::AgentState::new())
        .invoke_handler(tauri::generate_handler![
            telemetry,
            run_shell,
            dns_lookup,
            ping_host,
            net_info,
            system_snapshot,
            traceroute,
            arp_table,
            resolve_hostname,
            index_folder,
            git_info,
            wifi_info,
            read_metadata,
            read_metadata_bytes,
            strip_metadata,
            strip_metadata_bytes,
            get_weather,
            save_eleven_key,
            clear_eleven_key,
            has_eleven_key,
            eleven_tts,
            load_state,
            save_state,
            has_api_key,
            api_key_hint,
            save_api_key,
            clear_api_key,
            factory_reset,
            call_model,
            launch_app,
            agent::agent_exec,
            agent::agent_stop,
            agent::agent_reset,
            agent::agent_set_guard,
            agent::agent_guard_enabled,
            agent::agent_write_file,
            agent::agent_read_file,
            agent::agent_journal_append,
            agent::agent_journal_read,
            agent::agent_journal_list,
            agent::agent_journal_clear,
            agent::agent_probe_env
        ])
        .run(tauri::generate_context!())
        .expect("error while running NEXUS OS");
}
