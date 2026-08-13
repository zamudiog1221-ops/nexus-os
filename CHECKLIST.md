# NexusOS Checklist

## End Goal
NexusOS runs as a bootable Linux drive — one graded module taken to real, measurable depth, inside a working AI command center that plans and runs jobs on its own and keeps private work local and free (Ollama) with natural voice (ElevenLabs). The Linux port is the gate: nothing downstream (ISO, kiosk, hardware) is possible until the binary runs on Linux.

## Now — Unblock and Stabilize
- [x] Run `npm run tauri dev` — compiles clean, app runs (PC 1)
- [x] Commit current changes
- [x] Push repo to GitHub (private: zamudiog1221-ops/nexus-os)
- [x] Smoke-test previously-unrun features: notifications, run history, cost tracking
- [x] Test the ask_human handoff card end to end
- [x] Test Stop while a run is paused
- [x] Confirm quick fixes: model picker persists across restart; assistant doesn't quit early / truncate

## Quick Fixes
- [x] Raise assistant tool loop from 5 to 10 (both text + voice loops)
- [x] Raise assistant reply cap above 800 tokens (text chat 1000→2000; voice stays short by design)
- [x] Persist model picker so it survives restart

## Phase 0 — Setup
- [ ] Get Visual Studio Build Tools approved on the school machine
- [ ] VM + toolchain ready for a Linux build
- [ ] First Linux build attempt

## Phase 1 — Foundation
- [~] Platform abstraction layer — skeleton in src-tauri/src/platform.rs; port gaps still to move over on the VM
- [x] Event bus — src/eventBus.js (ready for the Phase 2 artifact bus to plug into)
- [ ] Agent tool schema (design now even though the router is Phase 3)
- [ ] Linux port — the gate for everything downstream

## Phase 2 — Recorder + Files
- [ ] Decide local whisper-rs vs API transcription
- [ ] Add cpal and hound to Cargo
- [ ] Rust recorder with streaming WAV writer, 16kHz mono
- [ ] Emit recording:level events for live waveform
- [ ] Mic / System / Both source toggle
- [ ] Voice Notes module UI
- [ ] emit_artifact command + artifact:created bus
- [ ] Files subscribes to the bus with source badges
- [ ] Drag-drop via onDragDropEvent
- [ ] Transcription

## Phase 3 — Assistant + Modules
- [ ] Agent router (uses Phase 1 tool schema)
- [ ] Wake-word assistant (~15h) connected to all modules (~75h routing layer)
- [ ] Cross-module timeline
- [ ] Local semantic search
- [ ] File converter

## Phase 4 — Preview + Scheduling
- [ ] Preview mode for Agent Mode
- [ ] Scheduled agent runs
- [ ] Ambient monitoring

## Phase 5 — Bootable Image
- [ ] Build the NexusOS ISO
- [ ] Kiosk session
- [ ] Hardware integration

## Phase 6 — Deferred / High Risk
- [ ] Gmail integration
- [ ] Debloat / file analyzer — stage-don't-delete, 30-day undo, mandatory preview, hard exclusions before any code

## Ongoing
- [x] Comment cleanup pass — no narration/emoji/debug/dead code; stripped em-dashes + smart quotes from all comments (kept in UI copy); nuked all ASCII banner blocks + divider lines (376 lines)
- [x] Port audit table — done, in ARCHITECTURE.md (3 real Linux gaps: wifi_info, arp_table, UI example paths)
- [ ] Log every OS-specific call while porting
- [ ] Fix any placeholder dates in DECISIONS.md from the git log
- [ ] Keep LOG.md updated — one entry per session

## Agent Test Runs (validate the autonomous engine)
- [ ] Agent run: install Ollama
- [ ] Agent run: pull a local model
- [ ] Point the assistant at the local Ollama model

## Lightbulbs / polish (later)
- [x] Fix wrong widget values: round trip now measures real latency (pings the gateway every 6s); temp is hidden when the OS exposes no sensor instead of showing a fake 0. NOTE: reading real CPU temp on Windows needs a hardware-monitor dependency (LibreHardwareMonitor/WMI, often admin) — deferred; hiding is the honest display for now.
- [ ] Jarvis-style launch animation: opens small and spreads outward on app start (Gio to send a reference)

## Open — next session (priority order)
- [ ] FIX Ubuntu VM boot (PC 2): EFI lost the ubuntu entry ("No bootable device", only PXE shows). Use EFI Shell: FS0: / cd EFI\ubuntu / shimx64.efi. Then permanent: copy shimx64.efi to /boot/efi/EFI/BOOT/BOOTX64.EFI. If no shell, boot ISO → Try Ubuntu → boot-repair.
- [ ] Then Guest Additions for fullscreen (sed out cdrom source first, then virtualbox-guest-utils + -x11, reboot)
- [ ] DECIDE dashboard: build the bento reflow engine (move any widget anywhere, reflow around it, incl. different sizes + move the core) OR keep the fixed orbit with same-size swaps. Current = orbit, same-size swap only.
- [ ] Wire more modules to the assistant: Networking actions, Voice Notes, Automation, Files-open, Projects (pattern: add to ASSISTANT_TOOLS + handler)
- [x] Drop Voice Notes transcripts/summaries into the Files module — done by reading the shared voice-notes store (simpler + always in sync than the event bus); shows with a "Voice Notes" source badge, searchable + summarizable
- [ ] Dead-code cleanup: remove unused WidgetCell + orbit-era grid CSS
- [ ] Push all local commits to GitHub
