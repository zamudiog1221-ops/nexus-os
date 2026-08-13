Work Log

One entry per work session. Two minutes at the end of each session — date, hours, what got done, what broke, what was learned. This is the file that proves the process was real and sustained rather than a March cram.

Be honest in here. "Spent 3 hours and got nowhere, cause was X" is more valuable than a clean narrative, both for grading and for you in February.

2026-08-10 — Project scoping (planning session, ~1h)

Did:

Evaluated whether to continue NEXUS as the year-long class project or start something new. Concluded: neither cleanly — NEXUS has no finish line as a platform, so the graded project gets scoped to one module taken to measurable depth, with NEXUS/NexusOS as the container.
Evaluated bootable-drive base OS. Linux over Windows, decisively. → DECISIONS.md 2026-08-10
Established that the Linux port is the gate for the entire roadmap. Everything downstream (ISO, kiosk session, hardware integration) is straightforward once the binary runs on Linux; none of it is possible before.

Learned:

Windows To Go is dead (deprecated 10 1903, removed in 11). Ruled out the entire Windows-based approach before any time was spent on it.
A live image's root is read-only squashfs — the ISO is a build artifact, not a dev environment. Editing code through the live drive means rebuilding the squashfs per change. This is why the ISO is Phase 5 and not Phase 1.

Next: VM + toolchain, first Linux build attempt.

2026-08-11 — Roadmap and estimation (planning session, ~1h)

Did:

Enumerated the full feature wishlist: Linux port, file converter, Gmail, debloat/file analyzer, wake-word assistant connected to all modules, cross-module timeline, local semantic search, ambient monitoring, comment cleanup, bootable NexusOS image.
Estimated it at 330-535h ideal / 500-900h realistic unassisted — i.e. 1.5-2 school years against a ~450-550h budget. Revised to ~180-280h with heavy AI assistance, which fits.
Reorganized into five phases with Phase 1 as foundation-only (platform abstraction, event bus, agent tool schema). Gmail and debloat deferred to Phase 6.
Decided the agent tool schema gets designed in Phase 1 despite the router being Phase 3. → DECISIONS.md
Kept code comments rather than stripping them. → DECISIONS.md
Chose LAN companion over native mobile build for phone support. → DECISIONS.md
Created CHECKLIST.md, PROJECT.md, ARCHITECTURE.md, DECISIONS.md, ROADMAP.md, LOG.md.

Learned / noted:

The wake word itself is the small part (~15h, openWakeWord or Porcupine). The other ~75h is the tool-routing layer that lets it actually invoke module capabilities. "Jarvis connected to everything" is an agent architecture problem, not a speech problem.
Debloat is the highest-risk item on the list — a heuristic wrong 5% of the time across 40,000 files is 2,000 bad suggestions, and the failure mode is permanent data loss. Needs stage-don't-delete, 30-day undo, mandatory preview, and hard exclusions before any code.
AI assistance collapses boilerplate and scaffolding but barely touches: hardware debugging, OAuth console work, wake-word threshold calibration, ISO boot failures, and real-use testing. Those are the bulk of the remaining hours.
Identified own bottleneck risk: code can be generated faster than it can be read, and the failure mode is a month-four bug in three interacting systems that were never reviewed. Review time is budgeted as real time.

Next: Phase 0.

2026-08-11 — Session review and checklist consolidation (~1h)

Did:

Scrubbed all four local Cowork sessions (Local AI model setup, Nexus autonomous task execution, GhostMe/pentesting, AI SEO) plus pasted web chats to recover every open thread.
Confirmed the repo has one commit (bb8a03e) and a folder of uncommitted changes — none of the last session's work (notifications, run history, cost tracking, agent handoff, idle timeout) has ever compiled.
Confirmed we work off C:\Users\zamud\Desktop\nexus-os. No OneDrive duplicate.
Saved LOG.md into the repo and rebuilt CHECKLIST.md around the five-phase roadmap.
Wrote the missing planning docs into the repo: PROJECT.md, ARCHITECTURE.md, DECISIONS.md, ROADMAP.md — ARCHITECTURE.md read from the actual code (main.rs command surface, agent.rs, NexusCore.jsx modules).
Dropped Hermes from the stack — local model is Ollama only. Kept ElevenLabs for voice. Scoped this repo to Nexus only; homelab and school project moved out of the checklist. → DECISIONS.md 2026-08-11

Learned / noted:

The planning docs from 2026-08-11 (CHECKLIST/PROJECT/ARCHITECTURE/DECISIONS/ROADMAP) were never written into this folder — only LOG.md and the checklist live here now. The rest still need to be created or moved in.
The recorder module (cpal capture, WAV writer, artifact bus, Files drop) is a from-scratch build — no cpal/hound in Cargo, no Voice Notes module in the code yet.
Transcription choice (local whisper-rs vs API) gates the recorder work — it decides installer size and whether the offline claim holds.

Next: run npm run tauri dev to get the last session's Rust changes to compile, then commit.

2026-08-11 — Transfer prep: quick fixes, port audit, scaffolding (~2h)

Did:

Wrote the four missing planning docs into the repo (PROJECT, ARCHITECTURE, DECISIONS, ROADMAP), ARCHITECTURE read from the real code.
Three quick fixes (edit-only, compile tomorrow): assistant tool loop 5→10 on both the text and voice loops; text-chat reply cap 1000→2000 (voice stays short by design); model picker now persists via load_state/save_state under key "assistant-model".
Port audit — mapped every OS-touching call to a table in ARCHITECTURE.md. Most already branch for Linux. Three real gaps: wifi_info (Windows-only netsh, needs nmcli/iw), arp_table (arp -a differs on Linux, prefer ip neigh), and hardcoded C:\ UI placeholder paths.
Comment cleanup — found the codebase already clean (no narration comments, no emoji in comments, no console.log/println!/dbg!, no dead code). Did not manufacture churn. Kept the // ---- Section ---- markers as navigation.
Second cleanup pass on the AI writing tells: stripped em/en dashes and smart quotes from ALL comments (110 comment lines across 8 files — 103 full-line + 7 trailing). Left them in user-facing UI strings on purpose (intentional product copy — the earlier established rule). All six JS files re-verified with esbuild transform after.
Third pass — Gio flagged the ASCII banner blocks (/* ==== TITLE ==== */) as the biggest AI tell. Chose "nuke everything": removed all boxed banner blocks (titles AND bodies) and every ----/==== divider line. 376 lines gone across the codebase (295 from NexusCore.jsx). Anchored the removal on the ==== delimiter lines so it couldn't eat real code. Kept the plain prose why-comments. Backed up to /tmp first; re-verified all 8 JS files transform clean; new NexusCore is 12,379 lines (was 12,719).
Phase 1 scaffolding: src/eventBus.js (dependency-free pub/sub, EVENTS map, ready for the Phase 2 artifact bus) and src-tauri/src/platform.rs (Os enum, current(), shell/opener helpers, and stub signatures for the three port gaps), wired via `mod platform;`. Non-behavior-changing.

Broke / fought:

esbuild in the sandbox was the win32 binary; installed a linux esbuild in /tmp to transform-check NexusCore.jsx. Passed.

Learned / noted:

The port is mostly done already — the earlier inline cfg! branching means Linux is a handful of gaps, not a rewrite. Good news for the Phase 1 timeline.
Feature-behavior changes (actually implementing the Linux wifi/arp) intentionally deferred to when the VM exists — tonight stayed to skeletons and edits only.

Next: on the school PC — npm run tauri dev (first real Rust compile, will check platform.rs + last session's changes), then commit and push.

2026-08-12 — First clean compile + GitHub (work session)

Did:

Settled the two-machine plan: PC 1 (personal, 8GB, admin, has build tools) = dev + compile; PC 2 (school, 16GB DDR5, VirtualBox) = Linux VM host later; GitHub = sync pipe.
Hit an admin wall installing the Rust/MSVC toolchain on PC 2 (no admin). Resolved by moving all dev to PC 1, which already had the build tools from earlier Nexus work.
Committed all outstanding work (a12af03) and published the repo to GitHub — private, zamudiog1221-ops/nexus-os. First time the project has offsite backup + version control across machines.
Ran `npm run tauri dev` on PC 1 — compiled clean and the app launched. This is the first successful build since the last two sessions' work (notifications, run history, cost tracking, agent handoff, idle timeout) plus this week's changes (platform.rs, quick fixes, comment scrub). All of it holds together.

Learned / noted:

The whole "compile on the school PC" plan was a dead end — locked-down machine, no admin for MSVC. PC 1 with admin is the right dev box. School PC's only real job is being the VM host (more RAM, VirtualBox already installed).
GitHub is now the pipe between the two machines — commit/push on PC 1, pull on PC 2 when Linux work starts.

Next: quick smoke-test of the features that had never actually run (notifications, run history, cost, agent handoff, model-picker persistence), then start Phase 1 / Linux prep.

2026-08-12 (cont.) — Voice Notes overhaul + Calendar module (feature session)

Did:

Voice Notes reminder extraction: first as a manual "Find reminders" button, then per Gio's feedback made it fully automatic - on Save, the note is scanned and any tests/deadlines are auto-added to the real reminder list, no button. One model call now returns both the topic and the reminders.
Made the Summarize button a big full-width CTA instead of a tiny link.
Persistence: voice notes moved from useState to usePersistent ("voice-notes"), and summary/topic/reminders are stored on each note object - so notes, summaries and extracted reminders all survive restart.
Auto-organize: notes group into day folders (Today / Yesterday / date), each tagged with an auto-detected topic badge (e.g. "Physics - Thermodynamics").
New Calendar module (sidebar): month grid with reminder counts per day, click a day to see/add/edit/complete/delete its reminders, plus an Unscheduled list. Added resolveDue() to turn free-text due strings ("Friday", "next Tuesday", "Oct 3", "10/3", ISO) into real dates relative to when the reminder was made. Added updateReminder() to the shell so reminders are editable.

Learned / noted:

A lot of what Gio asked for (live capture, summarize) already existed - the real gaps were auto-add, persistence, organization, and a place to edit (the Calendar). Reading the existing module first saved building duplicates.
Reminder due dates are free text, so the calendar needs a resolver; unresolvable ones fall into an Unscheduled bucket rather than being dropped.
All JS verified via esbuild transform each step. Committed in two checkpoints (bcda575, b9ce4ce).

Next: Stage 3 - audio recording + persistence + per-reminder replay. Needs MediaRecorder + timestamps + a Rust command to save/serve audio files, so it's the compile-heavy piece.

2026-08-12 (cont.) — Audio replay: record, persist, replay-per-reminder (feature session)

Did:

First real compile happened this session (npm run tauri dev on PC 1) - everything built and ran, all previously-unrun features confirmed working (notifications, run history, cost, agent handoff, model-picker persistence). Committed + pushed to GitHub (private, zamudiog1221-ops/nexus-os).
Machine plan settled: PC 1 (personal, admin, build tools already installed) = dev + compile; PC 2 (school, 16GB, VirtualBox) = Linux VM host later; GitHub = sync pipe.
Voice Notes audio, built in three sub-stages:
  3a - MediaRecorder captures the class audio alongside the speech engine; each final transcript chunk is timestamped against audio t=0. Reminder extraction now also returns a verbatim "quote", matched back to a segment so each reminder gets an audio timestamp. Per-reminder Replay button + an audio player in the note. Session-only at this point.
  3b - persist the recording as a base64 data URL on the note so replay survives restart (with a size guard).
  3c - moved the recording OUT of the notes store into its own per-recording file on disk, using the app's existing save_state/load_state (key = "rec-<noteId>"). Note keeps only audioId; audio lazy-loads from disk when the note is opened. No new Rust, no compile risk. Raised cap to 250MB.

Learned / noted:

save_state sanitizes its key and writes each to its own state/<key>.json file - so giving each recording its own key was a zero-Rust way to get per-file audio storage. Reused tested code instead of writing a new command + asset-protocol config.
WebView2 mic (getUserMedia) is the one unknown - if the app window blocks it, audio capture won't work and recording moves to Rust/cpal. Transcript still works regardless (separate API). Gio to confirm on test.
All JS verified with esbuild transform at each step. Five commits this session (a12af03 docs/fixes, bcda575 voice-notes overhaul, b9ce4ce calendar, cd0d0ad/d0c98b8/b4deea4 audio 3a/3b/3c).

Known small gaps (not urgent): deleting a note leaves an orphan recording file; very long recordings above 250MB stay session-only; drop-notes-into-Files not done yet.

Next: pick one - the "resume every tab where I left off" idea, drop notes into Files, or back to the Linux port on PC 2.

2026-08-12 (cont.) — Tab resume, dashboard saga, assistant calendar tools (evening)

Did:

Keep-alive tabs: every module now stays mounted when you switch away, so its state (drafts, sub-tabs, scroll, search) resumes on return; resets on restart. Inactive tabs reuse a cached element so they don't re-render on telemetry ticks.
Dashboard reminders now only show items due today/tomorrow (or overdue) via dueNear(); the rest live in Calendar, with a "+N more" note.
Big dashboard back-and-forth (documented so we don't repeat it): the old "Rearrange" swapped between the orbit view and a different grid, jarring + didn't save. Tried: (1) edit orbit in place with native drag - drag didn't fire in the webview; (2) pointer-based drag - worked; (3) switched to a tile grid so widgets keep their own size - but the flow grid left ugly gaps around the big core and mangled the saved layout. REVERTED to the fixed orbit (layout-v5, clean symmetric look). Current orbit behavior: pointer-drag a widget's top bar, drop anywhere, it swaps with the NEAREST SAME-SIZE widget (sizes never change). Added Reset layout + Copy layout buttons in Rearrange.
Assistant calendar tools: added update_reminder (reschedule/rename/complete), fixed navigate to include calendar + agent, updated the system prompt. Did an AI<->module compatibility audit (see below).

Open / still to do (next session):

DASHBOARD - the "move any widget anywhere and everything reflows around it, even different sizes" feature is NOT built. That needs a real bento layout engine (explicit placement + reflow), a dedicated multi-hour build. Current orbit only does same-size swaps; the core can't be moved (nothing its size). Gio wants the full reflow - decide whether to build the bento engine or keep the orbit as-is.
UBUNTU VM (PC 2) - STUCK. After installing build tools + guest additions and rebooting, the VM won't boot: "No bootable option or device found" - EFI lost the ubuntu boot entry (known VirtualBox + Ubuntu 24.04 bug). Boot Manager only shows PXEv4/PXEv6 (network boot), no ubuntu/disk entry. Next step: find the EFI Internal Shell in the boot menu and run FS0: / cd EFI\ubuntu / shimx64.efi (or grubx64.efi) to boot; then make permanent with: sudo mkdir -p /boot/efi/EFI/BOOT && sudo cp /boot/efi/EFI/ubuntu/shimx64.efi /boot/efi/EFI/BOOT/BOOTX64.EFI. If no EFI shell exists, boot the Ubuntu ISO -> Try Ubuntu -> run boot-repair. Guest Additions install for fullscreen still pending after boot is fixed (apt was choking on the leftover cdrom source; fix: sudo sed -i '/cdrom:/d' /etc/apt/sources.list then apt update, then install virtualbox-guest-utils virtualbox-guest-x11).

AI <-> module compatibility - still-missing tools (not wired to the assistant): School/Voice Notes (record/summarize by command), Networking actions (ping/DNS/traceroute/scan), Cybersecurity (hash/scan), Automation (create/toggle rules), Files (open/summarize a file), Projects (add tasks/notes). Pattern for future modules: add a tool to ASSISTANT_TOOLS + a handler. Fold into the workflow each time we build a module.

Other queued: drop Voice Notes into the Files module (artifact bus is the seam); dead-code cleanup (old WidgetCell + orbit-era grid CSS unused); "if too big, swap with a couple" is part of the bento-engine decision.

Not yet pushed to GitHub as of this entry - several commits (keep-alive, dashboard revert chain, calendar tools) are local. Push before next session.

Template
## YYYY-MM-DD — Short title (~Nh)

**Did:**
-

**Broke / fought:**
-

**Learned:**
-

**Next:**
