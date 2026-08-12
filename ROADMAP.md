# Roadmap

Five phases. The Linux port is the gate — nothing in Phase 5 is possible until the binary runs on Linux. Gmail and debloat are the highest-risk items and are deferred to Phase 6.

Estimate: ~180–280h with heavy AI assistance against a ~450–550h budget. AI collapses boilerplate but barely touches hardware debugging, OAuth console work, wake-word calibration, ISO boot failures, and real-use testing — those are the bulk of the remaining hours. Review time is budgeted as real time.

## Now — Unblock and stabilize
Get the last session's work compiling and committed before anything stacks on top.
- Compile last session's Rust changes (`npm run tauri dev`).
- Test idle timeout, the `ask_human` handoff, and Stop-while-paused.
- Commit, then push to GitHub.
- Quick fixes: assistant tool loop 5→10, reply cap above 800 tokens, persist the model picker.

## Phase 0 — Setup
- Visual Studio Build Tools approved on the school machine.
- VM + toolchain for a Linux build.
- First Linux build attempt.

## Phase 1 — Foundation
The structural bet. Build these before adding features so everything after builds against a stable contract.
- Platform abstraction layer (so `main.rs`'s OS calls can cross to Linux).
- Event bus.
- Agent tool schema (designed now even though the router is Phase 3).
- **Linux port — the gate for the whole downstream roadmap.**

## Phase 2 — Recorder + Files
- Decide local whisper-rs vs API transcription (sets installer size and the offline claim).
- `cpal` + `hound`; Rust recorder with streaming WAV writer at 16kHz mono.
- `recording:level` events for a live waveform.
- Mic / System / Both source toggle.
- Voice Notes module UI.
- `emit_artifact` command + `artifact:created` bus; Files subscribes with source badges.
- Drag-drop via `onDragDropEvent`.
- Transcription.

## Phase 3 — Assistant + modules
- Agent router (uses the Phase 1 tool schema).
- Wake-word assistant: the wake word is ~15h (openWakeWord / Porcupine); the ~75h is the tool-routing layer that lets it actually invoke module capabilities. "Jarvis connected to everything" is an agent-architecture problem, not a speech problem.
- Cross-module timeline.
- Local semantic search.
- File converter.

## Phase 4 — Preview + scheduling
- Preview mode for Agent Mode.
- Scheduled agent runs.
- Ambient monitoring.

## Phase 5 — Bootable image
- Build the NexusOS ISO (a build artifact — read-only squashfs, rebuilt per change).
- Kiosk session.
- Hardware integration.

## Phase 6 — Deferred / high risk
- Gmail integration (OAuth console work AI can't shortcut).
- Debloat / file analyzer. Highest-risk item: a heuristic wrong 5% across 40,000 files is 2,000 bad suggestions, failure mode is permanent data loss. Needs stage-don't-delete, 30-day undo, mandatory preview, and hard exclusions before any code.

## Ongoing
- Comment cleanup pass (keep why-comments, workarounds, doc comments, TODOs).
- Log every OS-specific call while porting.
- Keep LOG.md current — one entry per session.
