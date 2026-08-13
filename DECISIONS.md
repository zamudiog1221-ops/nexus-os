# Decisions

Why things are the way they are. Newest first. Each entry: the call, the reason, and what it rules out.

## 2026-08-13 — Dashboard is the fixed orbit, permanently (no grid/bento)
The dashboard uses the fixed orbit layout (named grid-areas: a-l + core), full stop. We tried three times to replace it with a resizable/reflowing tile grid so widgets could keep their size and move freely; every grid attempt left ugly gaps, because the widgets don't tile perfectly and a flow grid can't reproduce the hand-built symmetric orbit. The orbit's look (one solid rectangle, core centered, no gaps) is only achievable with fixed placement, which is fundamentally incompatible with "move any widget any size anywhere and reflow." We choose the look. Rearrange = pointer-drag a widget's bar, drop anywhere; it moves to the nearest SAME-SIZE widget's position and the widgets between them shift over to fill (an insert/reflow within the size tier, not a swap). Sizes never change; the orbit stays completely full (no holes); the core, having no same-size peer, stays centered. This is settled — do not revisit the grid/bento idea. Layout key: layout-v7.

## 2026-08-11 — Ollama only for the local model, no Hermes
Local inference goes through Ollama and nothing else. Hermes is dropped from the stack — it added a second moving part and a 64k-context requirement without earning its place. Rules out the Hermes desktop app and its agent layer; the local model is Ollama, called directly.

## 2026-08-11 — ElevenLabs stays for voice
Natural speech continues to use ElevenLabs (`eleven_tts`), with the system voice as the no-key fallback. Not replacing it.

## 2026-08-11 — This repo is Nexus only
`C:\Users\zamud\Desktop\nexus-os` holds NexusOS and nothing else. The homelab/pentesting tools and the separate school project live elsewhere. Keeps the roadmap and checklist focused.

## 2026-08-11 — Five-phase roadmap, foundation first
Phase 1 is foundation-only: platform abstraction, event bus, agent tool schema. Gmail and debloat deferred to Phase 6. The agent tool schema is designed in Phase 1 even though the router is Phase 3, so later modules build against a stable contract. See ROADMAP.md.

## 2026-08-11 — LAN companion over a native mobile build
Phone support comes from a LAN companion, not a native mobile app. Avoids a whole second build target and app-store overhead for what is really "reach the desktop from my phone on the same network."

## 2026-08-11 — Keep code comments, don't strip them
The cleanup pass removes AI narration, emoji, banner dividers, and dead code — but keeps why-comments, workaround notes, doc comments, and TODOs. Reason: the platform layer, event bus, agent router, and vector index will produce cross-system bugs later, and the why-comments are what make those debuggable.

## 2026-08-10 — Linux base for the bootable drive
The bootable NexusOS image is built on Linux, not Windows. Windows To Go is dead (deprecated in 10 1903, removed in 11), so the Windows path was ruled out before any time went into it. The Linux port is therefore the gate for the entire downstream roadmap (ISO, kiosk, hardware).

## 2026-08-10 — ISO is Phase 5, not Phase 1
A live image's root is read-only squashfs, so editing code through the live drive means rebuilding the squashfs per change. The ISO is a build artifact, not a dev environment — so it comes late, after the binary already runs on Linux.

## Earlier (from build bb8a03e, 2026-08-04) — engineering calls already in the code
- Command timeout is idle-based (kill on ~120s of silence, 3600s hard ceiling), not total-elapsed — a downloading 18GB model is healthy while it prints progress; a process hung on a y/N prompt prints nothing.
- Readers break on `\r` as well as `\n` so progress-bar redraws aren't read as silence.
- Agent commands run `#[tauri::command(async)]` on a worker thread; a plain command blocked the UI thread and froze the window / killed Stop.
- Agent plans are sized to the job (most goals 2–6 steps) with a runtime backstop that rejects a plan over 15 steps once.
- `ask_human` handoff state lives in the engine singleton, so it survives leaving and re-entering Agent Mode; paused time doesn't count against the run budget.
