
#![allow(dead_code)] // scaffolding  -  wired up incrementally during the port

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Windows,
    Linux,
    Macos,
    Other,
}

pub fn current() -> Os {
    if cfg!(target_os = "windows") {
        Os::Windows
    } else if cfg!(target_os = "linux") {
        Os::Linux
    } else if cfg!(target_os = "macos") {
        Os::Macos
    } else {
        Os::Other
    }
}

pub fn shell() -> (&'static str, &'static str) {
    if cfg!(target_os = "windows") {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    }
}

pub fn opener() -> &'static str {
    if cfg!(target_os = "windows") {
        "cmd" // used as: cmd /C start "" <target>
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    }
}

pub fn wifi_supported() -> bool {
    cfg!(target_os = "windows")
}

pub fn arp_command() -> (&'static str, &'static [&'static str]) {
    if cfg!(target_os = "linux") {
        ("ip", &["neigh"]) // TODO: parser for `ip neigh` output before switching main.rs over
    } else {
        ("arp", &["-a"])
    }
}

pub fn example_home_path() -> &'static str {
    if cfg!(target_os = "windows") {
        "C:\\Users\\you\\Documents"
    } else if cfg!(target_os = "macos") {
        "/Users/you/Documents"
    } else {
        "/home/you/Documents"
    }
}
