// NEXUS OS  -  agent notifications
// Agent Mode's whole premise is that you start a job and walk away. That only
// works if something comes and gets you. This module watches the engine for the
// two moments that need you back  -  it finished, or it's stuck waiting on a
// human  -  and raises them as a Windows notification, a chime, and an in-app
// toast.
//
// It watches the engine singleton directly rather than living in a component,
// so it keeps working while you're on another module, and does not care whether
// Agent Mode is mounted.

import * as engine from "./agentEngine.js";

const inTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

function invoke(cmd, args) {
  if (!inTauri) return Promise.reject(new Error("not desktop"));
  const fn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  return fn(cmd, args);
}

// OS notification
// Called through the plugin's invoke channel rather than @tauri-apps/plugin-
// notification. Same thing underneath, but it needs no npm package, so a build
// still succeeds if the Rust side hasn't been rebuilt yet  -  the call simply
// rejects and we fall back to the in-app toast.

let permission = null; // null = not asked yet, true/false once known

async function ensurePermission() {
  if (permission !== null) return permission;
  try {
    const granted = await invoke("plugin:notification|is_permission_granted");
    permission = granted === true
      ? true
      : (await invoke("plugin:notification|request_permission")) === "granted";
  } catch {
    permission = false; // plugin missing or not registered  -  toast only
  }
  return permission;
}

async function osNotify(title, body) {
  try {
    if (!(await ensurePermission())) return;
    await invoke("plugin:notification|notify", { options: { title, body } });
  } catch {
    /* never let a failed notification disturb a run */
  }
}

// chime
// Self-contained rather than reusing the UI sound engine, which is muted by
// default behind a settings toggle. A UI click is decoration and should respect
// that; "your agent needs you" is information and should not go silently
// missing because effects happen to be off.

let audio = null;

function chime(kind) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === "suspended") audio.resume();

    // Finish: a rising two-note major third, settled and final.
    // Needs you: the same interval inverted and repeated  -  unresolved, so it
    // reads as a question rather than an ending.
    const notes = kind === "help"
      ? [[880, 0], [660, 0.16], [880, 0.32]]
      : [[523, 0], [659, 0.12], [784, 0.24]];

    for (const [freq, at] of notes) {
      const t = audio.currentTime + at;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    }
  } catch {
    /* audio is a nicety, never a failure */
  }
}

// toast store
// Same shape as the engine store: a module-level value plus subscribers, so any
// component anywhere in the app can render the toast without prop drilling.

let toast = null; // { id, kind, title, body } | null
const listeners = new Set();

function setToast(next) {
  toast = next;
  listeners.forEach((fn) => { try { fn(toast); } catch { /* ignore */ } });
}

export function subscribeToast(fn) {
  listeners.add(fn);
  fn(toast);
  return () => listeners.delete(fn);
}

export function dismissToast() {
  setToast(null);
}

// the watcher

let prev = engine.getState().status;
let seq = 0;

/// Cut a long agent summary down to something that fits a notification without
/// being truncated mid-word, and strip the markdown the agent writes.
function brief(text, max = 140) {
  const flat = String(text || "")
    .replace(/[#*`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max)}…`;
}

engine.subscribe((state) => {
  const now = state.status;
  if (now === prev) return;
  const was = prev;
  prev = now;

  // Only transitions INTO these states are events. Re-entering "running" after
  // a handoff is normal progress and must not fire anything.
  if (now === "waiting" && state.pending) {
    const body = brief(state.pending.request, 160);
    setToast({ id: ++seq, kind: "help", title: "Your agent needs a hand", body });
    chime("help");
    osNotify("Your agent needs a hand", body || "Open NexusOS to see what it needs.");
    return;
  }

  if (now === "done") {
    const body = brief(state.summary) || "The job is finished.";
    setToast({ id: ++seq, kind: "done", title: "Agent finished", body });
    chime("done");
    osNotify("Agent finished", body);
    return;
  }

  if (now === "blocked" || now === "error") {
    const body = brief(state.summary || state.error) || "It stopped before finishing.";
    setToast({ id: ++seq, kind: "warn", title: "Agent couldn't finish", body });
    chime("help");
    osNotify("Agent couldn't finish", body);
    return;
  }

  // A run the user stopped themselves needs no announcement  -  they were there.
  if (now === "stopped" && was !== "idle") setToast(null);
});
