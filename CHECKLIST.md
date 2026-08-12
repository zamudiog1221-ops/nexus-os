# NexusOS Checklist

## End Goal
NexusOS runs as a bootable Linux drive — one graded module taken to real, measurable depth, inside a working AI command center that plans and runs jobs on its own and keeps private work local and free (Ollama) with natural voice (ElevenLabs). The Linux port is the gate: nothing downstream (ISO, kiosk, hardware) is possible until the binary runs on Linux.

## Now — Unblock and Stabilize
- [ ] Run `npm run tauri dev` and get last session's Rust changes to compile
- [ ] Test idle timeout on a long command
- [ ] Test the ask_human handoff card end to end
- [ ] Test Stop while a run is paused
- [ ] Commit current changes
- [ ] Push repo to GitHub

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
