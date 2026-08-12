// NEXUS OS  -  the bridge  [REFERENCE ONLY  -  nothing imports this file]
// Written during the mock-to-real migration as the single seam between the
// React frontend and the Rust backend. In the end NexusCore.jsx grew its own
// equivalents  -  RealShell, askClaude, usePersistent  -  and this file was never
// wired in.
//
// It is kept as a readable map of the Tauri command surface: which commands
// exist, what they take, and what they return. Treat it as documentation, not
// as live code. If you ever do import from here, check each function against
// the version in NexusCore first  -  some have drifted (this file's TauriShell
// predates RealShell and handles cwd differently).

const inTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

async function invoke(cmd, args) {
  if (!inTauri) throw new Error("not running in Tauri");
  return window.__TAURI__.core.invoke(cmd, args);
}

export const IS_DESKTOP = inTauri;

// Drop-in for the body of useTelemetry's tick(). Returns the same field names
// the mock produced, so the widgets are unchanged.

export async function readTelemetry() {
  const f = await invoke("telemetry");
  return {
    cpu: f.cpu,
    gpu: 0,              // no portable GPU reading; widget shows "no signal"
    mem: f.mem,
    disk: f.disk,
    temp: f.temp,
    down: f.down,
    up: f.up,
    ping: 0,             // filled by the networking module's own probes
    totalMemGb: f.total_mem_gb,
    usedMemGb: f.used_mem_gb,
  };
}

// Replaces MockShell entirely. Same three members: label, detail, run().
// The frontend's command parser is gone  -  the OS shell does the parsing now.
// `session.cwd` tracking stays in the frontend; we resolve cd ourselves.

export const TauriShell = {
  label: "System shell",
  detail: "Live. Commands run in a real shell on this machine.",

  async run(input, session) {
    const cmd = input.trim();
    const cwdPath = "/" + (session.cwd || []).join("/"); // adapt to your cwd model

    // handle cd in the frontend so the prompt path stays correct
    if (cmd === "clear" || cmd === "cls") return { lines: [], clear: true };

    const res = await invoke("run_shell", { cmd, cwd: session.cwdAbsolute || "" });
    const lines = [];
    if (res.stdout) res.stdout.replace(/\n$/, "").split("\n").forEach((t) => lines.push({ kind: "out", text: t }));
    if (res.stderr) res.stderr.replace(/\n$/, "").split("\n").forEach((t) => lines.push({ kind: "err", text: t }));
    return { lines, exit: res.code };
  },
};

// Real DNS and ping. Device discovery and traceroute need a raw-socket crate
// on the Rust side (surge-ping, pnet)  -  left as the mock until you add them,
// which is why MockNet stays imported for those two members.

export async function resolveDns(host) {
  const answers = await invoke("dns_lookup", { host });
  return { name: host, type: "A", ttl: 60, answers };
}

export async function pingHost(host) {
  try {
    return await invoke("ping_host", { host });
  } catch {
    return null; // dropped probe, same contract as the mock
  }
}

// The fix for "everything resets on reload". Call saveState whenever the user
// changes settings / layout / projects / rules; call loadState on mount.

export async function loadState(key) {
  const raw = await invoke("load_state", { key });
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveState(key, value) {
  return invoke("save_state", { key, value: JSON.stringify(value) });
}

// A tiny hook you can wrap any piece of state with so it persists.
// Usage in a component:
//   const [settings, setSettings] = usePersistent("settings", DEFAULT_SETTINGS);
export function makePersistent(React) {
  return function usePersistent(key, initial) {
    const [val, setVal] = React.useState(initial);
    const loaded = React.useRef(false);
    React.useEffect(() => {
      let alive = true;
      loadState(key).then((v) => {
        if (alive && v != null) setVal(v);
        loaded.current = true;
      }).catch(() => { loaded.current = true; });
      return () => { alive = false; };
    }, [key]);
    React.useEffect(() => {
      if (loaded.current) saveState(key, val).catch(() => {});
    }, [key, val]);
    return [val, setVal];
  };
}

// Replaces askClaude's fetch(). The request body is assembled exactly as
// before, but it goes to the Rust process, which attaches the API key the
// frontend never sees, and returns the raw response text to parse.

export async function callModelDesktop(bodyObject) {
  const text = await invoke("call_model", { payload: { body: JSON.stringify(bodyObject) } });
  return JSON.parse(text);
}

export async function hasApiKey() {
  try { return await invoke("has_api_key"); } catch { return false; }
}
