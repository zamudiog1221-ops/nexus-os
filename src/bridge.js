
const inTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

async function invoke(cmd, args) {
  if (!inTauri) throw new Error("not running in Tauri");
  return window.__TAURI__.core.invoke(cmd, args);
}

export const IS_DESKTOP = inTauri;

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

export const TauriShell = {
  label: "System shell",
  detail: "Live. Commands run in a real shell on this machine.",

  async run(input, session) {
    const cmd = input.trim();
    const cwdPath = "/" + (session.cwd || []).join("/"); // adapt to your cwd model

    if (cmd === "clear" || cmd === "cls") return { lines: [], clear: true };

    const res = await invoke("run_shell", { cmd, cwd: session.cwdAbsolute || "" });
    const lines = [];
    if (res.stdout) res.stdout.replace(/\n$/, "").split("\n").forEach((t) => lines.push({ kind: "out", text: t }));
    if (res.stderr) res.stderr.replace(/\n$/, "").split("\n").forEach((t) => lines.push({ kind: "err", text: t }));
    return { lines, exit: res.code };
  },
};

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

export async function loadState(key) {
  const raw = await invoke("load_state", { key });
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveState(key, value) {
  return invoke("save_state", { key, value: JSON.stringify(value) });
}

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

export async function callModelDesktop(bodyObject) {
  const text = await invoke("call_model", { payload: { body: JSON.stringify(bodyObject) } });
  return JSON.parse(text);
}

export async function hasApiKey() {
  try { return await invoke("has_api_key"); } catch { return false; }
}
