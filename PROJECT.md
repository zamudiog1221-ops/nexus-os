# NexusOS

## What it is
A desktop command center for one computer. Real system stats, network tools, a terminal, security utilities, voice notes, and files — all in one app — with an AI assistant that doesn't just answer but acts: checks the machine, opens apps, runs commands, and can take a whole job and run it start to finish on its own.

## Why it exists
The graded class project needs a finish line. NexusOS as a whole platform doesn't have one — it can always grow. So the project is scoped to taking one module to real, measurable depth, with NexusOS as the container that holds it. The end target is NexusOS running as a bootable Linux drive.

## The two pieces of the assistant
- **Assistant** — conversational. You talk or type, it uses tools to do things on the machine and reports back.
- **Agent Mode** — autonomous. You hand it a goal ("install X and set it up"), walk away, and it plans the steps, runs them itself, pauses to hand control back when a physical click is genuinely needed, and tells you when it's done.

## Local + private
The local model runs through **Ollama**, so private work can run offline and cost nothing per token. Frontier work still goes to the Claude API when quality matters. Voice uses **ElevenLabs** for natural speech, falling back to the system voice when no key is set.

## Stack
Tauri v2 (Rust backend + a webview UI), React 19 frontend, Vite. The Rust side owns anything that touches the OS; the React side is the interface and the agent/assistant logic.

## Current state
One committed build plus a folder of uncommitted work from the last session (notifications, run history, cost tracking, the agent handoff, idle-based command timeouts) that has not yet compiled. Getting that to compile is the immediate next step. See CHECKLIST.md and ROADMAP.md.
