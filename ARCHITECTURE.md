# Architecture

## Shape
Tauri v2 app. Two halves:

- **Rust backend** (`src-tauri/src/`) — everything that touches the OS, exposed as Tauri commands the frontend calls with `invoke`.
- **React frontend** (`src/`) — the UI and all assistant/agent logic, talking to the backend over those commands and to the Claude API / Ollama for inference.

Build: Vite (`npm run dev` for the web layer, `npm run tauri dev` to compile Rust and run the real app). `npm run tauri dev` is the first real Rust type-check — there is no Rust toolchain in the planning sandbox.

## Rust backend

### `main.rs` (~1100 lines)
Command surface. Groups of `#[tauri::command]` functions:

- **System / telemetry** — `telemetry`, `system_snapshot`, `net_info`, `wifi_info` (via `sysinfo`).
- **Network tools** — `dns_lookup`, `ping_host`, `traceroute`, `arp_table`, `resolve_hostname`.
- **Shell** — `run_shell`.
- **Files / metadata** — `read_metadata`, `strip_metadata` (+ `_bytes` variants) via `kamadak-exif` and `image`; `index_folder`.
- **Voice** — `save_eleven_key`, `clear_eleven_key`, `has_eleven_key`, `eleven_tts` (ElevenLabs REST).
- **Model** — `call_model` posts to `api.anthropic.com/v1/messages` with prompt-caching headers; keys stored via `save_api_key` / `has_api_key` / `api_key_hint`.
- **State** — `load_state`, `save_state`, `factory_reset`; `launch_app`; `get_weather`; `git_info`.

Deps: `tauri`, `tauri-plugin-notification`, `serde`/`serde_json`, `sysinfo`, `reqwest`, `tokio`, `kamadak-exif`, `image`. Release profile tuned for size (`opt-level = "s"`, `lto`, `strip`, `panic = "abort"`).

### `agent.rs` (~630 lines)
Agent execution primitives — the command-running side of Agent Mode. Process spawning runs as `#[tauri::command(async)]` so long commands don't block the main/UI thread. Command timeout is **idle-based**: a command is killed after ~120s of silence (no stdout/stderr), with a hard 3600s ceiling behind it. Readers break on `\r` as well as `\n` so progress bars (which redraw without newlines) aren't mistaken for a hang. The engine is told *how* a command died — `stalled` (retrying is pointless, find the non-interactive flag) vs `over_time` (genuinely slow, raise the ceiling).

## React frontend

### `NexusCore.jsx` (~12.7k lines)
The whole UI and most logic. Modules: Dashboard, System, Network, Terminal, Security, Metadata, Weather, Voice Notes, Files, Cyber Twin, Assistant, Agent Mode, Settings.

- `askClaude({ system, messages, tools, maxTokens, model })` — single inference entry point used by both chat and voice; re-priced per selected model.
- `ASSISTANT_TOOLS` — the tool set the conversational assistant can call.
- Voice: `ELEVEN_VOICES` (stock British voice IDs), a single reused `Audio` element, and a **speech queue** so greetings/warnings/answers don't play over each other (answers to direct questions jump the queue; splash and tour hold it).
- `assistantModel` — session-level model picker (Sonnet/Haiku/etc.); **not yet persisted across restart.**

### `agentEngine.js` (~930 lines)
The Agent Mode brain. Planning loop, tool dispatch, run budget, cost estimation (`estimateCost`, `DEFAULTS`), and the human-handoff (`ask_human`) pause/resume state, which lives in the engine singleton so it survives leaving and re-entering Agent Mode. `call_model` uses `max_tokens: 4000` here.

### `agentNotify.js` (~180 lines)
Desktop notifications for agent run events (via `tauri-plugin-notification`).

### `AgentMode.jsx` (~800 lines)
Agent Mode UI — run view, status line, log rows, the handoff card.

### `bridge.js` (~130 lines)
Thin wrapper around `invoke` and Tauri events.

## Known rough edges (see CHECKLIST.md)
- Last session's Rust changes have never compiled — `npm run tauri dev` is the gate.
- Assistant tool loop caps at 5 rounds; reply cap at 800 tokens — both cut work short.
- Model picker is session state, lost on restart.

## Port audit — Windows → Linux (2026-08-11)
Every OS-touching call, and its status for the Linux port. Most already branch correctly; the port is mostly a handful of real gaps, not a rewrite.

| Call | File | Windows path | Non-Windows path | Linux status |
|------|------|--------------|------------------|--------------|
| `run_shell` | main.rs:122 | `cmd /C` | `sh -c` | OK — branched |
| `ping_host` | main.rs:179 | `ping -n -w` | `ping -c -W` | OK — branched |
| `net_info` | main.rs | `ipconfig` | macOS `route`, Linux `ip route` | OK — has Linux branch |
| `traceroute` | main.rs:319 | `tracert` | `traceroute` | OK — needs `traceroute` pkg installed |
| `resolve_hostname` | main.rs:704 | `nbtstat` | `getent hosts` | OK — branched |
| `launch_app` | main.rs:920 | `cmd start` | macOS `open`, Linux `xdg-open` | OK — needs `xdg-open` present |
| `dirs_home` | main.rs:148 | `USERPROFILE` | `HOME` | OK — tries both |
| Agent spawn | agent.rs:241 | `sh`/shell + `CREATE_NO_WINDOW` | `sh -c` | OK — flag cfg-gated, no-op on Linux |
| Agent kill | agent.rs:416 | `taskkill` | `pkill -TERM -P` | OK — branched |
| Tool probe | agent.rs:599 | `where` | `command -v` | OK — branched |
| **`wifi_info`** | main.rs:483 | `netsh wlan` | returns `supported: false` | **GAP — no Linux impl; needs `nmcli dev wifi` / `iw`** |
| **`arp_table`** | main.rs:373 | `arp -a` | same binary | **VERIFY — `arp -a` output format differs on Linux; `arp` deprecated, prefer `ip neigh`** |
| UI path placeholders | NexusCore.jsx:4773, 5476 | hardcoded `C:\Users\...` | — | **COSMETIC — show a Linux example or detect OS** |

Frontend is otherwise platform-neutral: the `looksLikePath` regex already accepts `/` and `\`, and `localhost` references are local-server/dev, not Windows-specific.

Takeaway for Phase 1: the platform abstraction layer's first real jobs are (1) a Linux `wifi_info`, (2) an `arp_table` that uses `ip neigh` on Linux, and (3) OS-aware example paths in the UI. Everything else already compiles for Linux as written.

## Direction (see ROADMAP.md)
Phase 1 introduces a **platform abstraction layer** (so OS-specific calls in `main.rs` can be ported to Linux), an **event bus**, and a formal **agent tool schema**. The Linux port is the gate for the bootable-image roadmap.
