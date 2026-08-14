
import * as engine from "./agentEngine.js";

const inTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

function invoke(cmd, args) {
  if (!inTauri) return Promise.reject(new Error("not desktop"));
  const fn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  return fn(cmd, args);
}

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
  }
}

let audio = null;

function chime(kind) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === "suspended") audio.resume();

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
  }
}

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

let prev = engine.getState().status;
let seq = 0;

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
