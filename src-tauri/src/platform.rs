// Phase 1 foundation: platform abstraction.
//
// The OS-specific calls in main.rs already branch inline with cfg!(target_os).
// That works, but as the Linux port lands, the branches want to live in one
// place so a reader sees "here is everything that differs per OS" instead of
// hunting through 1100 lines. This module is that home.
//
// It intentionally does NOT change behavior yet  -  main.rs keeps its inline
// branches for now. The port work (see ARCHITECTURE.md "Port audit") moves the
// three real gaps here one at a time, behind these signatures, once there's a
// Linux VM to compile and test against.

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

// The shell + flag pair for running a one-off command line. Mirrors the pick
// already inlined in main.rs::run_shell; kept here so future callers share it.
pub fn shell() -> (&'static str, &'static str) {
    if cfg!(target_os = "windows") {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    }
}

// The command used to open a file, folder, or URL in the OS default handler.
pub fn opener() -> &'static str {
    if cfg!(target_os = "windows") {
        "cmd" // used as: cmd /C start "" <target>
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    }
}

// These are the three things that don't yet work on Linux. Signatures are here
// so the port has a target; implementations move over once there's a VM.

// GAP: wifi_info has no Linux implementation (Windows uses `netsh wlan`).
// Linux target: parse `nmcli -t -f ...' dev wifi` (fall back to `iw`).
// Returns true only where a real implementation exists.
pub fn wifi_supported() -> bool {
    cfg!(target_os = "windows")
}

// GAP: arp_table uses `arp -a`, whose output format differs on Linux and whose
// binary is deprecated there. Linux target: `ip neigh`.
pub fn arp_command() -> (&'static str, &'static [&'static str]) {
    if cfg!(target_os = "linux") {
        ("ip", &["neigh"]) // TODO: parser for `ip neigh` output before switching main.rs over
    } else {
        ("arp", &["-a"])
    }
}

// A sensible example path to show in UI placeholders, instead of a hardcoded
// Windows C:\ path.
pub fn example_home_path() -> &'static str {
    if cfg!(target_os = "windows") {
        "C:\\Users\\you\\Documents"
    } else if cfg!(target_os = "macos") {
        "/Users/you/Documents"
    } else {
        "/home/you/Documents"
    }
}
