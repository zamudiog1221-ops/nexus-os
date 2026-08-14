# Working rules for NexusOS

Follow these on every change:

1. **Keep the assistant compatible.** When a module gains a capability, wire the assistant to it too — add a tool to `ASSISTANT_TOOLS` plus a handler in `runAssistantTool`, and make sure the voice path reaches it. New features should be usable by chat and voice, not just the UI.

2. **No AI notes in the code.** Source files are code only — no AI-narration comments, no banner dividers, no em-dashes/smart quotes, no verbose explanatory prose. Write it like a human wrote it. (Markdown docs like this one are prose and are fine.)

3. **Log sparingly.** Only add a `LOG.md` entry for a major change or at the end of a session — not for every small edit.

Also standing: verify JS parses (esbuild transform) after edits; the real Rust compile is `npm run tauri dev` on the dev machine.
